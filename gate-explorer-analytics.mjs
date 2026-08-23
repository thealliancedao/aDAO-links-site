#!/usr/bin/env node
// gate-explorer-analytics.mjs — BINDING page gate for the NFT Explorer Analytics tab.
// Runs the REAL nft-explorer-app.js in jsdom, fetch stubbed to the REAL committed
// products (TLA_CORE_DIR checkout + this repo's metadata), then asserts SPECIFIC
// VALUES IN SPECIFIC CELLS — a generic "some % renders" gate passes through
// broken states; this one cannot.
// Usage: TLA_CORE_DIR=/path/to/tla-core node gate-explorer-analytics.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const CORE = process.env.TLA_CORE_DIR;
if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const SNAP = (f) => path.join(CORE, 'nfts/adao/snapshots', f);
const here = path.dirname(new URL(import.meta.url).pathname);

const FILES = {
  '/assets/nft-metadata/all_nfts_metadata.json': path.join(here, 'assets/nft-metadata/all_nfts_metadata.json'),
  '/assets/nft-metadata/adao-rarity-intended.json': path.join(here, 'assets/nft-metadata/adao-rarity-intended.json'),
  '/assets/nft-metadata/adao-rarity-bbl.json': path.join(here, 'assets/nft-metadata/adao-rarity-bbl.json'),
  'nfts/adao/snapshots/nfts.json': SNAP('nfts.json'),
  'nfts/adao/snapshots/summary.json': SNAP('summary.json'),
  'nfts/adao/snapshots/nft-analytics.json': SNAP('nft-analytics.json'),
  'nfts/adao/snapshots/sales-enriched.json': SNAP('sales-enriched.json'),
  'nfts/adao/snapshots/broken-at.json': SNAP('broken-at.json'),
  'nfts/adao/snapshots/listing-history.json': SNAP('listing-history.json'),
  'nfts/adao/snapshots/luna-usd-daily.json': SNAP('luna-usd-daily.json'),
  'nfts/adao/snapshots/bluna-usd-daily.json': SNAP('bluna-usd-daily.json'),
  'governance/members.csv': null,   // 404 — page tolerates
};
const bodyFor = (url) => {
  for (const [k, p] of Object.entries(FILES)) if (url.includes(k)) return p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  return null;
};

// Parse the REAL page markup (script tags stripped — we eval app.js ourselves),
// so initializeExplorer finds every element and builds the page end-to-end.
const rawHtml = fs.readFileSync(path.join(here, 'nft-explorer-index.html'), 'utf8')
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(rawHtml, { url: 'https://thealliancedao.com/nft-explorer-index.html?view=analytics', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.fetch = async (url) => {
  const body = bodyFor(String(url));
  if (body == null) return { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
w.scrollTo = () => {};
w.SiteHeader = { subnav() {}, onPick() {} };

// execute the real page script
const src = fs.readFileSync(path.join(here, 'nft-explorer-app.js'), 'utf8');
w.eval(src);

let fails = 0;
const check = (n, ok, d) => { console.log(`${ok ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`); if (!ok) fails++; };

// minimal state the analytics builder consumes from the boot path: allNfts
const meta = JSON.parse(fs.readFileSync(FILES['/assets/nft-metadata/all_nfts_metadata.json']));
const statusDoc = JSON.parse(fs.readFileSync(FILES['nfts/adao/snapshots/nfts.json']));
const byId = new Map(statusDoc.records.map(r => [String(r.id), r]));
w.allNfts = meta.map(m => {
  const s = byId.get(String(m.id)) || null;
  const n = { ...m, rank: null, rarityClass: (m.attributes.find(a => a.trait_type === 'Rarity') || {}).value ?? null };
  if (s) Object.assign(n, {
    owner: s.real_owner || s.owner, broken: !!s.broken,
    staked_daodao: !!s.daodao_staked, staked_enterprise_legacy: !!s.enterprise_staked,
    unminted: !!s.unminted, treasury_held: !!s.treasury_held, dao_wallet_8ywv_held: !!s.dao_wallet_8ywv_held,
    enterprise_dao_broken: !!s.enterprise_dao_broken, listing: s.listing || null,
    daodao_pending_claim: !!s.daodao_pending_claim, daodao_custody_unattributed: !!s.daodao_custody_unattributed,
  });
  return n;
});

await w.renderAnalytics();
const html = w.document.getElementById('analytics-view').innerHTML;
const A = JSON.parse(fs.readFileSync(SNAP('nft-analytics.json')));
const S = JSON.parse(fs.readFileSync(SNAP('summary.json')));

// --- specific cells ----------------------------------------------------------
// 1) trading character: real flips numbers, NO phantom P&L
check('trading line: real flips count from product', html.includes(`${A.flips.count.toLocaleString('en-US')} flips`), `${A.flips.count}`);
check('trading line: pct of sales rendered', html.includes(`${A.flips.pct_of_sales.toFixed(1)}% of all sales`));
check('trading line: NO phantom realized-P&L', !html.includes('realized P&L'));

// 2) leaderboards: top buyer row carries the product usd (first NON-system buyer).
// Replicate the page's fmtUsd (const helpers don't attach to window in eval'd scripts).
const fmtUsd = (n) => { const a = Math.abs(n); if (a >= 1e6) return `$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `$${(a / 1e3).toFixed(1)}K`; return `$${Math.round(a).toLocaleString('en-US')}`; };
const fmtNum = (n) => Math.round(n).toLocaleString('en-US');
const sys = w.isSystemAddress || (() => false);
const firstBuyer = A.leaderboards.top_buyers.filter(x => !sys(x.address))[0];
const expUsd = fmtUsd(firstBuyer.usd);
check('top buyer: usd from product present', html.includes(expUsd), `${expUsd}`);
check('leaderboards: no NaN / undefined / $—', !/NaN|undefined/.test(html));

// 3) most-traded: LUNA-equiv, never fake USD
const mt = A.leaderboards.most_traded_tokens[0];
check('most-traded: sales× · LUNA rendered (fmtNum rounding)', html.includes(`${mt.sales}× · ${fmtNum(mt.luna)} LUNA`), `#${mt.token_id} → ${fmtNum(mt.luna)} LUNA`);

// 4) royalties tile: product-fed or honest blank — never the old broken fields
if (A.royalties.royalty_luna != null) {
  check('royalties tile: LUNA units from product', html.includes(`${Math.round(A.royalties.royalty_luna).toLocaleString('en-US')}`));
} else {
  check('royalties tile: honest blank until product carries fields', html.includes('awaiting next warm capture'));
}

// 5) conservative mark: min(sales floor, ask) — recompute independently per tier
check('mark label: conservative wording', html.includes('lower of sales floor'));
// base tier: sales floor from committed floor-history equivalents is embedded in the page's own
// computation; assert the RELATION instead: rendered base mark ≤ both floors it shows.
// let-scoped _avX isn't reachable from outside the eval'd script — assert the
// policy at its single source anchor plus the rendered wording (checked above).
const markAnchor = 'tierMark[tier] = (sf && lf != null) ? Math.min(sf, lf) : (sf || lf || null);';
check('mark policy: min() at the single tierMark assignment', src.split(markAnchor).length === 2);
check('mark policy: midpoint formula fully gone', !src.includes('(sf + lf) / 2'));

// 6) governance: DAODAO-only staked count (Σ staker counts), never Enterprise-inflated
const ddCount = S.daodao_stakers.reduce((s, x) => s + (x.count || 0), 0);
check('governance: DAODAO-only NFTs staked', html.includes(`${ddCount.toLocaleString('en-US')} NFTs staked`), `${ddCount}`);
check('governance: not the Enterprise-inflated 2,034', !html.includes('2,034 NFTs staked'));

// 7) supply: unclaimed custody bucket = pending + unattributed, never in float
const pend = S.daodao_pending_claim_count ?? 0, unat = S.daodao_custody_unattributed_count ?? 0;
check('supply: Unclaimed (custody) segment titled with pending+unattributed',
  html.includes(`Unclaimed (custody): ${(pend + unat).toLocaleString('en-US')}`), `${pend}+${unat}`);

// 8) volume chart bars: real monthly usd (field truth) — svgBars ran with values
w.renderVolChart();
const vol = w.document.getElementById('av-vol-chart');
check('volume chart: rendered with nonzero bars', vol && /title>.*\$/.test(vol.innerHTML || '') || (vol && vol.innerHTML.length > 500), vol ? `${(vol.innerHTML || '').length} chars` : 'missing el');

// 9) spread colouring: deep-negative spread renders red, not green
check('spread: deep-negative → red', /spread == null[^]*?text-red-400[^]*?text-green-400/.test(src));


// ---------- Wallet tab (Rev 4.22): UNCLAIMED + VP% columns, backing line -----
{
  // the boot path built the leaderboard itself (summary fetch stubbed → VP wiring real)
  const lb = w.document.getElementById('leaderboard-table');
  const html2 = lb ? lb.innerHTML : '';
  check('wallet: Unclaimed + VP % headers present', html2.includes('Unclaimed') && html2.includes('VP %'));
  // let-scoped state isn't reachable — drive the page like a user: sort by the
  // new columns via header clicks and read page 1 rows.
  const clickSort = (key) => { const h = lb.querySelector(`[data-sort-by="${key}"]`); h.dispatchEvent(new w.Event('click', { bubbles: true })); };
  clickSort('unclaimed');   // toggles to desc on first click? ensure desc:
  const firstVal = () => Number(lb.querySelector('.leaderboard-row:not(.dao-pinned-row)')?.dataset.unclaimed || 0);
  if (firstVal() === 0) clickSort('unclaimed');
  const expected = (S.daodao_pending_claim_count ?? 0);   // the 2 contract-held unattributed stay off the board by design
  const pageUnclaimed = [...lb.querySelectorAll('.leaderboard-row:not(.dao-pinned-row)')].reduce((s, r) => s + Number(r.dataset.unclaimed || 0), 0);
  check('wallet: unclaimed column carries the pending 17 (top page after sort)', pageUnclaimed === expected, `${pageUnclaimed} vs ${expected}`);
  clickSort('vpPct'); if (!(Number(lb.querySelector('.leaderboard-row:not(.dao-pinned-row)')?.dataset.vp || 0) > 1)) clickSort('vpPct');
  const top = S.daodao_stakers.slice().sort((a, b) => b.voting_power_pct - a.voting_power_pct)[0];
  const topRow = lb.querySelector('.leaderboard-row:not(.dao-pinned-row)');
  check('wallet: VP% sort puts the top staker first with the right pct',
    topRow && topRow.dataset.address === top.address && Math.abs(Number(topRow.dataset.vp) - top.voting_power_pct) < 0.01,
    topRow ? `${topRow.dataset.vp}% @ …${topRow.dataset.address.slice(-4)}` : 'no row');
  const bl = w.walletBackingLine([{ broken: false }, { broken: false }, { broken: true }]);
  check('wallet: backing line = 2 × per-NFT (broken excluded)', bl.includes(`${Math.round(2 * S.backing.per_nft_ampluna).toLocaleString('en-US')} ampLUNA`) && bl.includes('2 unbroken'), bl.replace(/<[^>]+>/g, '').trim());
}
// ---------- Features (Rev 4.25): holders dropdown + layout rework ------------
{
  const d = w.document;
  check('rework: Share button removed', !d.getElementById('share-filters'));
  check('rework: rank system out of the top row, dropdown in',
    !!d.getElementById('holders-dd-btn') && !!d.getElementById('rank-mode-intended'));
  const topRow = d.getElementById('holders-dd-btn').closest('.grid');
  check('rework: rank buttons NOT inside the top row anymore', topRow && !topRow.contains(d.getElementById('rank-mode-intended')));
  // unfiltered: dropdown reads "All holders (N)"
  check('dropdown: unfiltered label lists all holders', /^All holders \(\d/.test(d.getElementById('holders-dd-label').textContent));
  // apply the Staked→DAO filter exactly as the UI does
  const tog = d.querySelector('.status-toggle-cb[data-key="staked"]');
  const sld = d.querySelector('.direction-slider[data-slider-key="staked"]');
  tog.checked = true; sld.disabled = false; sld.value = '2';
  tog.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('dropdown: label counts holders of selection', d.getElementById('holders-dd-label').textContent.includes('155 holders'), d.getElementById('holders-dd-label').textContent);
  const rows = [...d.querySelectorAll('#holders-dd-menu .hdd-row')];
  const total = rows.reduce((s, b) => s + Number(b.querySelector('span:last-child').textContent.replace(/,/g, '')), 0);
  const dd = S.daodao_staked_count;
  check('dropdown: rows sum to the full filtered set', total === dd, `${total} vs ${dd}`);
  check('dropdown: sorted desc, top holder first', Number(rows[0].querySelector('span:last-child').textContent) >= Number(rows[1].querySelector('span:last-child').textContent));
  check('rework: URL still carries staked filter', w.location.search.includes('staked=true') && w.location.search.includes('staked_pos=2'));
  // picker pill copy button (lib) — present in markup with feedback wiring
  const lib = fs.readFileSync(path.join(here, 'lib/address-picker.js'), 'utf8');
  check('pill: copy button + verify feedback in the lib', lib.includes('ap-copy') && lib.includes("Copied ' + shortAddr(w2)"));
}

// ---------- Task 6 (Rev 4.24): hero sentence + labeled filter counts ---------
{
  const av = w.document.getElementById('analytics-view').innerHTML;
  const E2 = JSON.parse(fs.readFileSync(SNAP('sales-enriched.json')));
  const last = E2.sales[E2.sales.length - 1];
  const days = Math.floor((Date.now() - Date.parse(last.timestamp)) / 86400000);
  check('hero: sales count + minted + listed present',
    av.includes(`${A.volume.sales_count.toLocaleString('en-US')}</b> sales all-time`) && av.includes('of 10,000 minted') && av.includes('listed now'));
  check('hero: last-sale recency is honest', days <= 1 ? av.includes('last sale <b class="text-white">today') : av.includes(`last sale <b class="text-white">${days}d ago`), `${days}d`);
  // labeled counts: the staked filter is active from the features block above
  const cs = w.document.querySelector('.status-count[data-count-key="staked"]');
  check('counts: labeled "N match", not a bare integer', cs && /match$/.test(cs.textContent.trim()) && cs.textContent.includes('1,631'), cs ? cs.textContent : 'missing');
}

console.log(fails === 0 ? '\nGATE PASS' : `\nGATE FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
