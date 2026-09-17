#!/usr/bin/env node
// gate-index-alert-center.mjs — index 4.24 + lib/alert-center.js 1.0.0 on real fixtures (jsdom). SPEC-alert-center gates 1, 2, 4, 5.
//  G1 the grid renders three tiles; Pulse card hidden; no launch popup opened
//  G2 NFTs aDAO counters = the counts the rules derive from the SAME Live Activity rows (relation, not literal)
//  G3 Ecosystem: Assets/Projects counters = active registry entries; Assets row names the lp-grades pools that carry the alert
//  G4 selected-address red: only rows touching that wallet's tokens are marked mine; the tile goes red
//  G5 closing the panel sets the marker; a re-render with the marker gives 0 counters (green) when nothing is newer
//  G6 pure lib: a window with no events → every tile green; gap counters render 0 with the "not captured yet" note
// Usage: TLA_CORE_DIR=<tla-core (with docs/curated/alerts.json)> NFTC_DIR=<nft-collections> CRONS_DIR=<platform-crons> node gate-index-alert-center.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const CORE = process.env.TLA_CORE_DIR, NFTC = process.env.NFTC_DIR, CRONS = process.env.CRONS_DIR; if (!CORE || !NFTC || !CRONS) { console.error('TLA_CORE_DIR, NFTC_DIR, CRONS_DIR required'); process.exit(1); }
const require = createRequire(import.meta.url);
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
// stage lp-grades with alerts via the live cron functions (main's product predates 2.1.0 until the next run)
const { stampAssetAlerts } = require(path.join(CRONS, 'token-catalog/token-catalog.js')); const { applyAlerts } = require(path.join(CRONS, 'lp-grades/lp-grades.js'));
const reg = JSON.parse(fs.readFileSync(path.join(CORE, 'docs/curated/alerts.json')));
const cat = JSON.parse(fs.readFileSync(path.join(CORE, 'token-catalog/snapshots/current.json'))); stampAssetAlerts(cat.tokens, reg);
const grades = JSON.parse(fs.readFileSync(path.join(CORE, 'lp-grades/snapshots/current.json'))); applyAlerts(grades.pools, cat, reg);
const GRADES_TXT = JSON.stringify(grades);
// --- page ---
const html = fs.readFileSync('index.html', 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
const libSrc = fs.readFileSync('lib/alert-center.js', 'utf8');
let modalOpened = false; const J = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
const stubFetch = (u) => { const full = String(u), url = full.split('?')[0]; let f = null;
  if (url === CORE_U + 'lp-grades/snapshots/current.json') return J(JSON.parse(GRADES_TXT));
  if (full.startsWith('https://bbl-proxy.defipatriot.workers.dev/?url=')) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length));
  if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/index.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  w.fetch = stubFetch; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} };
  w.SiteHeader = { mount() {}, init() {}, subnav() { return { querySelectorAll: () => [] }; } }; w.PropAudit = {}; w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), CRONS: [] }; w.tokenPrices = { LUNA: 0.0449, bLUNA: 0.0785 };
  w.eval(libSrc);
} });
const w = dom.window;
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 15000));
const d = w.document;
const gm = d.getElementById('gov-modal'); modalOpened = gm && gm.style.display === 'flex';
const tiles = [...d.querySelectorAll('#alert-center .ac-tile')];
console.log('=== index 4.24 alert center ===');
ok('G1 the grid renders Ecosystem · Props · NFTs aDAO', tiles.map(t => t.dataset.tile).join(',') === 'ecosystem,props,nfts-adao', tiles.map(t => t.dataset.tile));
ok('G1 the Pulse card is hidden by stylesheet rule and the launch proposal popup did not open', /#pulse-card \{ display: none !important; \}/.test(html) && !modalOpened);
const R = w.__alertCenter; ok('G1 build result exposed (window.__alertCenter) with meta.rules = the lib RULES', R && R.meta && R.meta.rules === w.AlertCenter.RULES);
// G2 — relation to the same rows
const items = (w.__activityItems || []).filter(x => x.col === 'adao' && x.ts >= R.meta.cut);
const nft = R.tiles.find(t => t.key === 'nfts-adao'); const cnt = (k) => nft.counters.find(c => c.key === k).n;
const expStake = items.filter(x => ['staked', 'unstaked', 'break', 'claimed'].includes(x.kind)).length + (items.filter(x => x.kind === 'unstaked' && x.ts >= R.meta.now - 864e5).length >= w.AlertCenter.RULES.MASS_UNSTAKE_N ? 1 : 0);
const expP2P = items.filter(x => x.kind === 'transferred').length;
const expSales = items.filter(x => x.kind === 'sale').length;
console.log(`  (window ${new Date(R.meta.cut).toISOString().slice(0, 16)} → now · adao rows in window ${items.length}: sales ${expSales}, staking ${expStake}, p2p ${expP2P})`);
ok('G2 Staking counter = staked+unstaked+break+claimed rows in window (+ one mass row when ≥ threshold)', cnt('staking') === expStake, [cnt('staking'), expStake]);
ok('G2 P2P counter = transferred rows in window (+ mass rows)', cnt('p2p') >= expP2P && cnt('p2p') <= expP2P + 3, [cnt('p2p'), expP2P]);
ok('G2 Marketplace counter ≥ sales in window and every marketplace row carries rule · source · raw', cnt('market') >= expSales && nft.counters.find(c => c.key === 'market').rows.every(r => r.rule && r.source && 'raw' in r), cnt('market'));
const tileTxt = (k) => tiles.find(t => t.dataset.tile === k).textContent.replace(/\s+/g, ' ');
ok('G2 the tile shows the same numbers the build produced', /Marketplace = \d+/.test(tileTxt('nfts-adao')) && tileTxt('nfts-adao').includes(`Marketplace = ${cnt('market')}`) && tileTxt('nfts-adao').includes(`Staking = ${cnt('staking')}`));
ok('G2 tile state follows the counters: amber iff total > 0, else green (no address selected → never red)', tiles.every(t => { const T = R.tiles.find(x => x.key === t.dataset.tile); return t.dataset.state === (T.total > 0 ? 'amber' : 'green'); }), tiles.map(t => [t.dataset.tile, t.dataset.state]));
// G3 — Ecosystem
const eco = R.tiles.find(t => t.key === 'ecosystem');
const activeAssets = reg.alerts.filter(a => a.kind === 'asset' && w.AlertCenter.RULES.ASSET_ACTIVE.includes(a.status)).length, activeForum = reg.alerts.filter(a => a.kind === 'forum' && w.AlertCenter.RULES.FORUM_ACTIVE.includes(a.status)).length;
ok(`G3 Ecosystem Assets = ${activeAssets} active asset entries · Projects = ${activeForum} active forum entries`, eco.counters.find(c => c.key === 'assets').n === activeAssets && eco.counters.find(c => c.key === 'projects').n === activeForum, eco.counters.map(c => [c.key, c.n]));
const assetRow = eco.counters.find(c => c.key === 'assets').rows[0]; const flagged = grades.pools.filter(p => (p.alerts || []).some(a => a.kind === 'asset'));
ok(`G3 the USDC.n row names the ${flagged.length} lp-grades gauges that carry the alert, their VP share and staked USD, and links the migration guide`, assetRow && assetRow.raw.pools.length === flagged.length && /gauges? · [\d.]+% of VP · \$[\d,]+ staked/.test(assetRow.value) && /skip\.build/.test(assetRow.link), assetRow && assetRow.value);
ok('G3 TLA and PD counters are 0 with a "not captured yet" gap note (blank beats phantom)', ['tla', 'pd'].every(k => { const c = eco.counters.find(x => x.key === k); return c.n === 0 && /not captured yet/.test(c.gap); }));
ok('G3 Ecosystem tile is amber (registry entries are active)', tiles.find(t => t.dataset.tile === 'ecosystem').dataset.state === 'amber');
// panel
tiles.find(t => t.dataset.tile === 'ecosystem').click(); await new Promise(r => setTimeout(r, 100));
const panel = d.getElementById('ac-panel'); const rowsEl = [...panel.querySelectorAll('.ac-row')];
ok('panel opens on the first non-zero counter with rows: label · value · time · link, and the why line (rule · source · raw)', panel.style.display === 'block' && rowsEl.length >= 1 && rowsEl.every(r => r.querySelector('.ac-l') && r.querySelector('.ac-why') && /rule .+ · /.test(r.querySelector('.ac-why').textContent)), rowsEl.length);
const forumTab = [...panel.querySelectorAll('[data-ctab]')].find(b => b.dataset.ctab === 'projects'); forumTab.click(); await new Promise(r => setTimeout(r, 50));
ok('Projects tab: the Capapult forum row links to the common.xyz thread', [...panel.querySelectorAll('.ac-row a')].some(a => /common\.xyz\/capapult/.test(a.href)));
// G4 — selected address: pick a wallet that touched a token in the window, re-build with myTokens
const inv = w.__invRecords || []; const wk = (w.__activityItems || []).filter(x => x.col === 'adao' && x.ts >= R.meta.now - 7 * 864e5); const anyRow = wk.find(x => x.token != null && ['transferred', 'staked', 'unstaked', 'sale'].includes(x.kind)); const owner = anyRow && (inv.find(r => String(r.id) === String(anyRow.token)) || {}).real_owner;
if (owner) {
  const mine = new Set(inv.filter(r => r.real_owner === owner).map(r => String(r.id)));
  const R2 = w.AlertCenter.build({ now: R.meta.now, alertsDoc: reg, lpPools: grades.pools, props: { cards: [] }, items: w.__activityItems, myTokens: mine, chainOnlyListings: [] }, { windowMs: 7 * 864e5 });
  const nft2 = R2.tiles.find(t => t.key === 'nfts-adao'); const rows = nft2.counters.flatMap(c => c.rows);
  ok(`G4 with ${owner.slice(0, 12)}… selected, exactly the rows touching its ${mine.size} tokens are "mine" and the NFTs tile is red`, rows.filter(r => r.mine).length >= 1 && rows.every(r => r.mine === (r.raw && r.raw.token != null && mine.has(String(r.raw.token)))) && nft2.state === 'red', rows.filter(r => r.mine).length);
  ok('G4 Ecosystem and Props tiles are never red for an address (red is "about you", not "big")', R2.tiles.filter(t => t.key !== 'nfts-adao').every(t => t.state !== 'red'));
} else console.log('  (G4 skipped: no token row in the window to pick an owner from)');
// G5 — marker
const close = panel.querySelector('#ac-close'); close.click(); await new Promise(r => setTimeout(r, 300));
const seen = w.AlertCenter.marker.get();
ok('G5 closing the panel sets the "seen" marker to now and hides the panel', seen && Math.abs(seen - R.meta.now) < 60e3 && d.getElementById('ac-panel').style.display === 'none', seen);
const R3 = w.AlertCenter.build({ now: seen + 1000, alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: w.__activityItems, chainOnlyListings: [] }, { since: seen, windowMs: w.AlertCenter.RULES.WINDOW_DEFAULT_MS });
ok('G5 rebuilt "since you last looked" (registry empty): every NFT counter 0 → all tiles green', R3.tiles.every(t => t.state === 'green' && t.total === 0), R3.tiles.map(t => [t.key, t.total]));
// G6 — pure lib on an empty world
const R4 = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [], chainOnlyListings: [] }, { windowMs: 864e5 });
ok('G6 no events, empty registry → three green tiles, ten counters all 0, gap counters carry their note', R4.tiles.length === 3 && R4.tiles.every(t => t.state === 'green') && R4.tiles.flatMap(t => t.counters).every(c => c.n === 0) && R4.tiles[0].counters.filter(c => c.gap).length === 2);
const R5 = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: Array.from({ length: 6 }, (_, i) => ({ col: 'adao', kind: 'unstaked', token: 100 + i, ts: Date.now() - i * 60e3, label: 'Unstaked', sub: 'aDAO (DAODAO)' })), stakedSupply: 1661, chainOnlyListings: [] }, { windowMs: 864e5 });
const stk5 = R5.tiles.find(t => t.key === 'nfts-adao').counters.find(c => c.key === 'staking');
ok(`G6 six unstakes in 24h → one "Mass unstake" row (${w.AlertCenter.RULES.MASS_UNSTAKE_N} threshold) on top of the six, with the % of staked supply`, stk5.n === 7 && /^Mass unstake: 6 NFTs in 24h/.test(stk5.rows[0].label) && /% of staked/.test(stk5.rows[0].value), stk5.rows[0]);
const R6 = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [], chainOnlyListings: [{ tokenId: 745, price: 200, priceToken: 'bLUNA', priceUsd: 16.76, auctionId: '14765' }] }, { windowMs: 864e5 });
ok('G6 a chain-only listing (C.6) is a Marketplace row that says "on-chain only · not on BBL\'s UI" and links to the explorer', (() => { const r = R6.tiles.find(t => t.key === 'nfts-adao').counters.find(c => c.key === 'market').rows[0]; return r && /on-chain only · not on BBL's UI/.test(r.label) && /nft-explorer/.test(r.link) && r.rule === 'nft:chain_only_listing'; })());
console.log(`\n=== GATE index-alert-center: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
