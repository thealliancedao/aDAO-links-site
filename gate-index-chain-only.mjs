#!/usr/bin/env node
// gate-index-chain-only.mjs — index.html 4.23 on real fixtures (jsdom): chain-only BBL listings (the #745 lesson) join the
// BBL card — count, floor, tier rows, listing cards — each badged "on-chain only · not on BBL's UI".
// No chain-only auction exists on main today (#745 sold 09-14), so the fixture is STAGED exactly as the inventory cron
// (C.6) writes it: the cheapest BBL listing in nfts.json gets listing.source = 'chain_only' and is REMOVED from the
// warlock feed (warlock never serves a chain-only auction); summary.marketplaces.bbl.chain_only_count = 1.
// Usage: TLA_CORE_DIR=<tla-core> NFTC_DIR=<nft-collections> node gate-index-chain-only.mjs [index.html]
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import os from 'os';
const CORE = process.env.TLA_CORE_DIR, NFTC_REAL = process.env.NFTC_DIR; if (!CORE || !NFTC_REAL) { console.error('TLA_CORE_DIR and NFTC_DIR required'); process.exit(1); }
const FILE = process.argv[2] || 'index.html';
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const LABEL = "on-chain only · not on BBL's UI";
// --- stage ---
const NFTC = fs.mkdtempSync(path.join(os.tmpdir(), 'nftc-index-chain-only-'));
fs.mkdirSync(path.join(NFTC, 'adao/snapshots'), { recursive: true });
for (const e of fs.readdirSync(path.join(NFTC_REAL, 'adao'))) if (e !== 'snapshots') fs.symlinkSync(path.join(NFTC_REAL, 'adao', e), path.join(NFTC, 'adao', e));
for (const e of fs.readdirSync(path.join(NFTC_REAL, 'adao/snapshots'))) if (!['nfts.json', 'summary.json'].includes(e)) fs.symlinkSync(path.join(NFTC_REAL, 'adao/snapshots', e), path.join(NFTC, 'adao/snapshots', e));
const nftsDoc = JSON.parse(fs.readFileSync(path.join(NFTC_REAL, 'adao/snapshots/nfts.json')));
const bbl = nftsDoc.records.filter(r => r.listing && r.listing.marketplace === 'BBL' && r.listing.price_amount > 0);
const staged = bbl.reduce((a, b) => (b.listing.price_amount < a.listing.price_amount ? b : a));
staged.listing.source = 'chain_only'; staged.listing.warlock_visible = false;
const STAGED_ID = String(staged.id), STAGED_PRICE = staged.listing.price_amount, STAGED_USD = staged.listing.price_usd;
fs.writeFileSync(path.join(NFTC, 'adao/snapshots/nfts.json'), JSON.stringify(nftsDoc));
const summary = JSON.parse(fs.readFileSync(path.join(NFTC_REAL, 'adao/snapshots/summary.json')));
summary.marketplaces.bbl.chain_only_count = 1;
fs.writeFileSync(path.join(NFTC, 'adao/snapshots/summary.json'), JSON.stringify(summary));
const warlockNfts = bbl.filter(r => r !== staged).map(r => ({ nft_token_id: String(r.id), nft_name: `AllianceDAO NFT #${r.id}`, special_trait: r.broken ? 'BROKEN' : null, rank: null, cf_url: null, image_url: null, auction: { auction_id: Number(r.listing.internal_id), seller: r.listing.seller, reserve_price: String(r.listing.price_raw), denom: r.listing.denom, auction_type: r.listing.listing_type, end_time: null } }));
const WARLOCK_N = warlockNfts.length;
console.log(`staged: #${STAGED_ID} (cheapest BBL ask, ${STAGED_PRICE} bLUNA / $${STAGED_USD}) labeled chain_only; warlock serves the other ${WARLOCK_N}`);
// --- page ---
const html = fs.readFileSync(FILE, 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} };
w.SiteHeader = { mount() {}, init() {} }; w.PropAudit = {}; w.tokenPrices = { LUNA: 0.0449, bLUNA: 0.0785 };   // prices seeded (the page waits up to 10 s for them) w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), CRONS: [] };
const J = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
let warlockHits = 0;
w.fetch = (u) => { const full = String(u); const url = full.split('?')[0]; let f = null;
  if (full.startsWith('https://bbl-proxy.defipatriot.workers.dev/?url=')) { const t = decodeURIComponent(full.slice('https://bbl-proxy.defipatriot.workers.dev/?url='.length));
    if (/warlock\.backbonelabs\.io.*\/nfts\?/.test(t) && t.includes('nftContract=terra1phr9fngjv7a8an4dhmhd0u0f98wazxfnzccqtyheq4zqrrp4fpuqw3apw9')) { warlockHits++; const per = Number((t.match(/perPage=(\d+)/) || [])[1] || 100); return J({ nfts: warlockNfts.slice(0, per), pagination: { totalResults: WARLOCK_N } }); }
    if (/warlock\.backbonelabs\.io.*\/collections\//.test(t)) return J({ volume: 0, last_sale_amount: 0 });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'stub' }), text: () => Promise.resolve('') }); }
  if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length));
  if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 14000));
const d = w.document; const txt = (id) => ((d.getElementById(id) || {}).textContent || '').trim();
ok(`warlock feed was read (${warlockHits} calls) — the live BBL path is what the merge lands on`, warlockHits > 0);
ok('REV constant is 4.23', (w.__store && w.__store.REV) === '4.23' || /const REV = '4\.23'/.test(fs.readFileSync(FILE, 'utf8')), w.__store && w.__store.REV);
// --- BBL card ---
ok(`BBL "Currently Listed" = warlock ${WARLOCK_N} + 1 chain-only = ${WARLOCK_N + 1}`, txt('bbl-listed-count') === String(WARLOCK_N + 1), txt('bbl-listed-count'));
const note = d.getElementById('bbl-chain-only-note');
ok('BBL card note "+1 on-chain only · not on BBL\'s UI" rendered and visible', note && !note.classList.contains('hidden') && note.textContent.includes('+1 ' + LABEL), note && note.textContent);
ok(`BBL floor = the chain-only ask (${STAGED_PRICE} bLUNA) — the cheapest live auction on the contract, not the cheapest on BBL's page`, txt('bbl-floor-bluna') === Number(STAGED_PRICE).toLocaleString(), txt('bbl-floor-bluna'));
const fl = d.getElementById('bbl-floor-chain-only');
ok('the floor is flagged "floor is on-chain only · not on BBL\'s UI"', fl && !fl.classList.contains('hidden') && fl.textContent === 'floor is ' + LABEL, fl && [fl.className, fl.textContent]);
// --- tier rows (cross-venue module) ---
const tierEl = d.getElementById('bbl-tier-floors');
const tier = staged.broken ? 'Broken' : 'Unbroken base';
if (tierEl && !tierEl.classList.contains('hidden') && STAGED_USD > 0) {
  const rowTxt = [...tierEl.querySelectorAll('div')].map(x => x.textContent).find(t => t.startsWith(tier)) || '';
  ok(`BBL tier row "${tier}" floor = the chain-only ask in USD ($${STAGED_USD.toFixed(2)})`, rowTxt.includes(`from $${STAGED_USD.toFixed(2)}`), rowTxt);
} else console.log('  (tier rows not rendered in jsdom — skipped)');
// --- listing cards ---
const badges = [...d.querySelectorAll('#combined-listings-container .chain-only-badge')];
const card = badges[0] && badges[0].closest('a');
ok('exactly one combined-listing card carries the chain-only badge (the label is the cron\'s field, nothing inferred)', badges.length === 1 && badges[0].textContent === LABEL, badges.map(b => b.textContent));
ok(`that card is #${STAGED_ID} and links to the explorer, not to BBL's page (which would show "not listed")`, card && card.textContent.includes('#' + STAGED_ID) && /nft-explorer-index\.html/.test(card.getAttribute('href') || ''), card && [card.textContent.slice(0, 60), card.getAttribute('href')]);
ok('the chain-only card sorts first (lowest USD) — a buying opportunity, shown as one', card && d.querySelector('#combined-listings-container a') === card);
// --- cache relations ---
const hook = w.__bblChainOnly ? w.__bblChainOnly() : null; const cache = hook && hook.cache;
if (cache) {
  ok('cache: chainOnlyCount 1 · count = warlockCount + 1 · floor = min(price) · floorChainOnly true', cache.chainOnlyCount === 1 && cache.count === cache.warlockCount + 1 && cache.floor === Math.min(...cache.listings.map(l => l.price)) && cache.floorChainOnly === true, { c: cache.count, w: cache.warlockCount, co: cache.chainOnlyCount, floor: cache.floor });
  ok('cache: merge is idempotent (re-apply adds nothing)', hook.apply() === false && cache.listings.filter(l => l.chainOnly).length === 1);
} else console.log('  (marketplaceCache not exposed on window — cache relations skipped)');
fs.rmSync(NFTC, { recursive: true, force: true });
console.log(`\n=== GATE index-chain-only: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
