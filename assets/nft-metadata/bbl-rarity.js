#!/usr/bin/env node
'use strict';
/**
 * bbl-rarity.js — capture BackBone Labs' published rarity rank for every
 * AllianceDAO NFT, as a companion to the design-intent file (adao-rarity-intended.json).
 *
 * BBL exposes a per-token rank directly via its marketplace API, so this does NOT
 * reverse-engineer a score — it mirrors BBL's own numbers. We paginate all pages and
 * read each token's `rank` field. Broken NFTs come back rank:null on BBL's side
 * (BBL leaves them unranked — a known BBL quirk), which we capture faithfully and count.
 *
 * BBL's rarity score, for reference, is an inverse-frequency sum over EVERY attribute —
 * including the derived `Rarity` tier (so the Object is effectively counted twice) and
 * the `broken` / `rewards` status traits. That is why it diverges from the intended,
 * Object-only grade. We do not recompute it; we record what BBL serves.
 *
 * Output: adao-rarity-bbl.json  (+ heartbeat.json)
 * Egress required: warlock.backbonelabs.io  (runs on Render; the sandbox cannot reach it)
 */

const fs = require('fs');
const path = require('path');

const NFT_CONTRACT = 'terra1phr9fngjv7a8an4dhmhd0u0f98wazxfnzccqtyheq4zqrrp4fpuqw3apw9';
const API = 'https://warlock.backbonelabs.io/api/v1/dapps/necropolis/nfts';
const PER_PAGE = 60;
const SORT = 'rank-desc';                 // any stable sort; we read each token's own rank
const EXPECTED_TOTAL = 10000;             // hard integrity gate
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 800;
const PAGE_PAUSE_MS = 150;                // be polite between pages
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, 'data');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pageUrl(page) {
  const u = new URL(API);
  u.searchParams.set('nftContract', NFT_CONTRACT);
  u.searchParams.set('page', String(page));
  u.searchParams.set('perPage', String(PER_PAGE));
  u.searchParams.set('types', 'all');
  u.searchParams.set('sort', SORT);
  u.searchParams.set('sisterChains', '');
  return u.toString();
}

// Fetch one page with retry/backoff. Returns parsed JSON, or null on hard failure
// (null is distinct from an empty page — we never coerce a failure into empty data).
async function fetchPage(page) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(pageUrl(page), { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j || !Array.isArray(j.nfts)) throw new Error('unexpected shape');
      return j;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error(`  ✗ page ${page} failed after ${MAX_RETRIES} retries: ${err.message}`);
        return null;
      }
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }
  return null;
}

// Pure transform: BBL page-NFT -> our record. Exported shape is additive and stable.
function toRecord(n) {
  const brokenTrait = Array.isArray(n.traits)
    ? n.traits.find((t) => t.trait_type === 'broken')
    : null;
  const broken = brokenTrait ? String(brokenTrait.value).toUpperCase() === 'TRUE' : null;
  return {
    token_id: String(n.nft_token_id),
    bbl_rank: n.rank != null ? Number(n.rank) : null,          // null = broken (BBL leaves unranked)
    bbl_rarity_score: n.rarity != null ? Number(n.rarity) : null,
    bbl_top_percent: n.top_percent != null ? Number(n.top_percent) : null,
    is_staked: !!n.is_staked,
    broken,
  };
}

async function main() {
  const t0 = Date.now();
  console.log('🔎 BBL rarity capture starting…');

  const first = await fetchPage(1);
  if (!first) throw new Error('FATAL: could not fetch page 1 — aborting (no partial write)');
  const totalPages = Number(first.pagination?.totalPages) || 0;
  const totalResults = Number(first.pagination?.totalResults) || 0;
  console.log(`  pagination: ${totalResults} results across ${totalPages} pages (perPage ${PER_PAGE})`);

  const byId = new Map();
  const failedPages = [];
  const ingest = (j) => { for (const n of j.nfts) { const r = toRecord(n); byId.set(r.token_id, r); } };
  ingest(first);

  for (let page = 2; page <= totalPages; page++) {
    const j = await fetchPage(page);
    if (!j) { failedPages.push(page); continue; }     // recorded, not silently dropped
    ingest(j);
    if (page % 20 === 0) console.log(`  …page ${page}/${totalPages} (${byId.size} tokens)`);
    await sleep(PAGE_PAUSE_MS);
  }

  // A failed page = abort (never publish a partial file). But note: BBL's sort piles all
  // ~1,093 broken/null-rank NFTs into a front block with no unique sort key, so paginating
  // it is unstable — some rows duplicate, others drop. Every uniquely-ranked NFT paginates
  // cleanly, so any token BBL didn't return is by construction in that null block and is
  // therefore unranked. We fill those as null (what they actually are) rather than fail.
  if (failedPages.length) {
    throw new Error(`FATAL: ${failedPages.length} page(s) failed (${failedPages.slice(0, 10).join(',')}…) — not writing a partial file`);
  }
  const MIN_CAPTURED = 8500;     // sanity floor: below this, something is genuinely wrong
  if (byId.size < MIN_CAPTURED) {
    throw new Error(`FATAL: only captured ${byId.size} tokens (< ${MIN_CAPTURED}) — refusing to publish`);
  }

  const capturedFromBbl = byId.size;
  let filled = 0;
  for (let i = 1; i <= EXPECTED_TOTAL; i++) {
    const id = String(i);
    if (!byId.has(id)) {
      byId.set(id, { token_id: id, bbl_rank: null, bbl_rarity_score: null, bbl_top_percent: null, is_staked: null, broken: null, not_returned: true });
      filled++;
    }
  }
  if (byId.size !== EXPECTED_TOTAL) {
    throw new Error(`FATAL: ${byId.size} tokens after fill, expected ${EXPECTED_TOTAL} — token-id universe mismatch`);
  }

  const records = [...byId.values()].sort((a, b) => Number(a.token_id) - Number(b.token_id));
  const ranked = records.filter((r) => r.bbl_rank != null).length;
  const brokenUnranked = records.filter((r) => r.bbl_rank == null).length;

  // Structural self-check — confirms the file shape is internally consistent before we
  // publish. Deliberately value-agnostic (no hardcoded "rank X = token Y" assertions) so
  // it ages well even if BBL renumbers tomorrow. Any failure here means something genuinely
  // broke — either in BBL's data or in our parsing — and we'd rather not publish.
  const checks = [];
  // 1. every token id 1..N present exactly once
  const ids = new Set(records.map((r) => r.token_id));
  for (let i = 1; i <= EXPECTED_TOTAL; i++) if (!ids.has(String(i))) checks.push(`missing token id ${i}`);
  if (ids.size !== EXPECTED_TOTAL) checks.push(`id set size ${ids.size} ≠ ${EXPECTED_TOTAL}`);
  // 2. ranked + unranked = total
  if (ranked + brokenUnranked !== EXPECTED_TOTAL) checks.push(`ranked(${ranked}) + unranked(${brokenUnranked}) ≠ ${EXPECTED_TOTAL}`);
  // 3. no duplicate ranks among ranked tokens
  const rankList = records.filter((r) => r.bbl_rank != null).map((r) => r.bbl_rank);
  if (new Set(rankList).size !== rankList.length) {
    const counts = {}; for (const v of rankList) counts[v] = (counts[v] || 0) + 1;
    const dupes = Object.entries(counts).filter(([, c]) => c > 1).slice(0, 5);
    checks.push(`duplicate ranks: ${dupes.map(([r, c]) => `#${r}×${c}`).join(', ')}`);
  }
  // 4. captured + filled = total
  if (capturedFromBbl + filled !== EXPECTED_TOTAL) checks.push(`captured(${capturedFromBbl}) + filled(${filled}) ≠ ${EXPECTED_TOTAL}`);
  // 5. every rank is a positive integer
  if (rankList.some((r) => !Number.isInteger(r) || r < 1)) checks.push('non-positive-integer rank present');
  if (checks.length) {
    throw new Error('FATAL: self-check failed — ' + checks.join(' | '));
  }
  console.log(`  ✓ self-check passed (id universe, rank uniqueness, sums)`);
  console.log(`  captured ${capturedFromBbl} from BBL, filled ${filled} unreturned as unranked → ${ranked} ranked, ${brokenUnranked} unranked`);

  // Change detection: only rewrite when the ranks actually moved, so a quiet week
  // produces no commit. We compare the record payload only — never the `built` stamp.
  const outPath = path.join(OUT_DIR, 'adao-rarity-bbl.json');
  const newPayload = JSON.stringify(records);
  let changed = true;
  let changedTokens = 0;
  if (fs.existsSync(outPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      const prevById = new Map((prev.records || []).map((r) => [r.token_id, r]));
      changed = JSON.stringify(prev.records || []) !== newPayload;
      if (changed) {
        for (const r of records) {
          const p = prevById.get(r.token_id);
          if (!p || p.bbl_rank !== r.bbl_rank || p.broken !== r.broken) changedTokens++;
        }
      }
    } catch { changed = true; }   // unreadable previous file → rewrite
  }

  if (!changed) {
    console.log(`✓ BBL ranks unchanged (${records.length} tokens, ${brokenUnranked} unranked) — leaving file as-is, no commit. ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  const out = {
    schema: 'adao-rarity-bbl-v1',
    description:
      "BackBone Labs' published rarity rank for every AllianceDAO NFT, mirrored from BBL's marketplace API " +
      '(warlock.backbonelabs.io). BBL scores by inverse-frequency over every attribute, including the derived ' +
      'Rarity tier and broken/rewards status; broken NFTs are usually returned unranked (bbl_rank=null) — a ' +
      'BBL-side quirk, and an inconsistent one (some broken NFTs are still ranked). This file records exactly ' +
      'what BBL serves. For the collection-intended grade, see adao-rarity-intended.json.',
    source: API,
    built: new Date().toISOString(),     // updated only when ranks actually change
    total: records.length,
    ranked_count: ranked,
    broken_unranked_count: brokenUnranked,
    captured_from_bbl: capturedFromBbl,
    filled_unreturned: records.length - capturedFromBbl,
    records,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`✅ BBL ranks changed (${changedTokens} tokens moved) — wrote adao-rarity-bbl.json: ${records.length} tokens, ${ranked} ranked, ${brokenUnranked} unranked. ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// Export the pure transform so it can be unit-tested without network access.
module.exports = { toRecord };

if (require.main === module) {
  main().catch((err) => { console.error(err.message || err); process.exit(1); });
}
