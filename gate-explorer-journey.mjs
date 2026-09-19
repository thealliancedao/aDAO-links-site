#!/usr/bin/env node
// gate-explorer-journey.mjs — explorer 4.35: the NFT sheet shows the token's on-chain journey from the ledger by-token shard,
// folded by /lib/nft-history.js, with specific values in specific cells on real fixtures.
//   #745  bought at mint 115 LUNA ($73.97) 2024-06-03 · Enterprise stake/unstake · listed 200 bLUNA 2024-10-18 · sold 2026-09-12
//         after 694 days (the chain-only listing) → hands 1 · listings 1 · days on market 694
//   #4513 three BBL asks inside one day by the same seller (139 → 120 → 100 LUNA) = ONE listing episode with two price changes,
//         then sold the same day → the 24 h relist rule; one move the ledger did not see is flagged, not filled in
//   #3022 a DAO treasury's governance-executed mint (75 LUNA) that later moved into Lion DAO → hands 2
// Fixtures: NFTC_DIR (nft-collections) + TLA_CORE_DIR (tla-core). When by-token shards are not on main yet (nft-flows 1.4.0
// has not run), the gate STAGES them from the ledger month files with the cron's own rule (live rows, sorted, 100 per shard).
// Usage: NFTC_DIR=<nft-collections> TLA_CORE_DIR=<tla-core> node gate-explorer-journey.mjs   (from the site dir)
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import os from 'os'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const NFTC_REAL = process.env.NFTC_DIR, CORE = process.env.TLA_CORE_DIR; if (!NFTC_REAL || !CORE) { console.error('NFTC_DIR and TLA_CORE_DIR required'); process.exit(1); }
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const TOKENS = ['745', '4513', '3022', '716', '9068', '3445', '1128'];
// --- fixture: by-token shards (real when on main, staged from the month files otherwise — same rows, same rule)
const NFTC = fs.mkdtempSync(path.join(os.tmpdir(), 'nftc-journey-'));
fs.mkdirSync(path.join(NFTC, 'adao/ledger/by-token'), { recursive: true });
for (const e of fs.readdirSync(path.join(NFTC_REAL, 'adao'))) if (e !== 'ledger') fs.symlinkSync(path.join(NFTC_REAL, 'adao', e), path.join(NFTC, 'adao', e));
for (const e of fs.readdirSync(path.join(NFTC_REAL, 'adao/ledger'))) if (e !== 'by-token') fs.symlinkSync(path.join(NFTC_REAL, 'adao/ledger', e), path.join(NFTC, 'adao/ledger', e));
const shardOf = (id) => String(Math.floor(Number(id) / 100)).padStart(3, '0');
const realByToken = path.join(NFTC_REAL, 'adao/ledger/by-token');
let staged = false;
if (fs.existsSync(path.join(realByToken, 'index.json'))) { for (const f of fs.readdirSync(realByToken)) fs.symlinkSync(path.join(realByToken, f), path.join(NFTC, 'adao/ledger/by-token', f)); }
else {
  staged = true; const want = new Set(TOKENS.map(shardOf)); const buckets = {}; const ix = JSON.parse(fs.readFileSync(path.join(NFTC_REAL, 'adao/ledger/index.json')));
  for (const mk of ix.months) { const m = JSON.parse(fs.readFileSync(path.join(NFTC_REAL, 'adao/ledger', mk + '.json'))); for (const r of m) { if (r.superseded_by || r.token_id == null) continue; const sh = shardOf(r.token_id); if (!want.has(sh)) continue; ((buckets[sh] ||= {})[String(r.token_id)] ||= []).push(r); } }
  const meta = {}; for (const [sh, tokens] of Object.entries(buckets)) { for (const id of Object.keys(tokens)) tokens[id].sort((a, b) => a.height - b.height || a.msg_index - b.msg_index); fs.writeFileSync(path.join(NFTC, 'adao/ledger/by-token', sh + '.json'), JSON.stringify({ collection: 'adao', shard: sh, shard_size: 100, tokens })); meta[sh] = { tokens_with_records: Object.keys(tokens).length }; }
  fs.writeFileSync(path.join(NFTC, 'adao/ledger/by-token/index.json'), JSON.stringify({ collection: 'adao', shard_size: 100, shards: meta }));
}
console.log(`fixture: by-token shards ${staged ? 'STAGED from the ledger month files (nft-flows 1.4.0 not on main yet)' : 'from main'}`);
const NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/', CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
// --- static checks
const html = fs.readFileSync('nft-explorer-index.html', 'utf8'); const css = fs.readFileSync('nft-explorer-style.css', 'utf8'); const app = fs.readFileSync('nft-explorer-app.js', 'utf8');
{ const av = (html.match(/nft-explorer-app\.js\?v=([\d.]+)/) || [])[1], sv = (html.match(/nft-explorer-style\.css\?v=([\d.]+)/) || [])[1], rv = (html.match(/rev: '([\d.]+)'/) || [])[1];   // 4.39: relations, not literals frozen on the writing day
  ok(`html: modal has #modal-journey, loads /lib/nft-history.js, app + style cache-busted together (${sv}/${av}), footer rev ${rv} ≥ 4.38`, html.includes('id="modal-journey"') && html.includes('/lib/nft-history.js?v=1.2.1') && av && sv && av === sv && rv && Number(rv) >= 4.38, [av, sv, rv]); }
ok('css: journey rules (tones, gap marker, collapsed admin rows)', /\.journey li\.jr-sale::before/.test(css) && /\.journey li\.jr-gap \.jr-h::before/.test(css) && /\.journey\.jr-collapsed li\.jr-admin/.test(css));
ok('app: showNftDetails hands off to journeyInto; shard path from NftHistory.shardOf (no hand rule in the page)', /journeyInto\(nft\);/.test(app) && /NftHistory\.shardOf\(/.test(app) && !/Math\.floor\(Number\(id\) \/ 100\)/.test(app));
// --- the lib on its own, on the real rows (values, not "something renders")
const NH = require(path.resolve('lib/nft-history.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(NFTC, 'adao/collection.json')));
const rowsOf = (id) => JSON.parse(fs.readFileSync(path.join(NFTC, 'adao/ledger/by-token', shardOf(id) + '.json'))).tokens[id] || [];
const opts = NH.optsFromManifest(manifest); opts.now = '2026-09-18T22:00:00Z';
{ const { rows, summary: S } = NH.fold(rowsOf('745'), opts);
  const mint = rows.find(r => r.kind === 'mint_purchase'); const sale = rows.find(r => r.kind === 'sale'); const list = rows.find(r => r.kind === 'list');
  ok('#745: bought at mint for 115 LUNA on 2024-06-03, $73.97 then (oracle-priced upstream, read as-is)', mint && /Bought at mint by .* for 115 LUNA$/.test(mint.headline) && mint.day === '2024-06-03' && Math.abs(mint.amount.usd_then - 73.97) < 0.01, mint && [mint.headline, mint.amount]);
  ok('#745: listed on BackBone Labs for 200 bLUNA on 2024-10-18 ($98.11 then)', list && /^Listed on BackBone Labs by .* for 200 bLUNA$/.test(list.headline) && list.day === '2024-10-18' && Math.abs(list.amount.usd_then - 98.11) < 0.01, list && list.headline);
  ok('#745: sold 2026-09-12 for 200 bLUNA after 694 days on the market', sale && sale.day === '2026-09-12' && /Sold to .* for 200 bLUNA · 694 days on the market/.test(sale.headline) && sale.episode && sale.episode.days === 694, sale && sale.headline);
  ok('#745: summary — hands 1 · listings 1 · days on market 694 · sales 1 · not listed now · no gap', S.hands_changed === 1 && S.listings === 1 && S.days_on_market === 694 && S.sales === 1 && !S.listed_now && S.gaps === 0, S);
  ok('#745: Enterprise stake + unstake are rows by the custodian\'s registry label; the treasury rows are admin-toned', rows.some(r => r.kind === 'stake_enterprise' && /Staked in Enterprise/.test(r.headline)) && rows.some(r => r.kind === 'unstake_enterprise') && rows.filter(r => r.tone === 'admin').length === 2, rows.map(r => r.kind + ':' + r.tone));
  ok('#745: the same-tx buy-now bid is folded into the sale (no separate bid row)', !rows.some(r => r.kind === 'bid'), rows.map(r => r.kind)); }
{ const { rows, summary: S } = NH.fold(rowsOf('4513'), opts);
  const lists = rows.filter(r => r.kind === 'list');
  ok('#4513: 139 → 120 → 100 LUNA inside one day by one seller = ONE episode: one "Listed", two "Price changed" (24 h rule); the Feb-2025 ask is a new one', lists.length === 4 && /^Listed on/.test(lists[3].headline) && /^Listed on/.test(lists[0].headline) && /^Price changed to 120 LUNA/.test(lists[1].headline) && /^Price changed to 100 LUNA/.test(lists[2].headline) && lists[1].episode === 'continues', lists.map(l => l.headline));
  const delist6 = rows.find(r => r.kind === 'delist' && /after 6 days/.test(r.headline));
  ok('#4513: a real delist reads "Delisted from BackBone Labs after 6 days on the market · not sold"', !!delist6 && delist6.sub === 'not sold', rows.filter(r => r.kind === 'delist').map(r => r.headline));
  ok('#4513: summary — listings 2 (the day-one episode + the Feb-2025 one), sales 1, days on market 6 (0 + 6)', S.listings === 2 && S.sales === 1 && S.days_on_market === 6, S);
  const gap = rows.find(r => r.gap);
  ok('#4513: the move the ledger did not see is FLAGGED on the row it lands on (never filled in), counted once', !!gap && /that move is not in the ledger/.test(gap.gap_note) && S.gaps === 1, gap && gap.gap_note);
  ok('#4513: DAODAO stake reads by the registry label, claim reads "Claimed back"', rows.some(r => r.kind === 'stake' && /AllianceDAO Voting Module/.test(r.headline)) && rows.some(r => r.kind === 'claim' && /^Claimed back from/.test(r.headline)), rows.filter(r => /stake|claim/.test(r.kind)).map(r => r.headline)); }
{ const { rows, summary: S } = NH.fold(rowsOf('3022'), opts);
  const mint = rows.find(r => r.kind === 'mint_purchase');
  ok('#3022: the governance-executed DAO mint is row one at 75 LUNA ($53.02 then), then two transfers → hands 2', mint && /for 75 LUNA$/.test(mint.headline) && Math.abs(mint.amount.usd_then - 53.02) < 0.01 && S.hands_changed === 2 && S.listings === 0, [mint && mint.headline, S.hands_changed]); }
{ const { rows, summary: S } = NH.fold(rowsOf('716'), opts);
  ok('#716: bought at mint 100 LUNA, staked in the DAODAO module now, never listed', S.mint && S.mint.amount.display === '100 LUNA' && /AllianceDAO Voting Module/.test(S.custody_now || '') && S.listings === 0 && S.hands_changed === 0, S); }
{ const withNow = Object.assign({}, opts, { usdNow: (sym) => sym === 'bLUNA' ? { usd: 0.05, day: '2026-09-17' } : null });
  const { rows } = NH.fold(rowsOf('745'), withNow); const sale = rows.find(r => r.kind === 'sale');
  ok('USD now = amount × the oracle series\' last day, labeled with that day; USD then untouched', sale && Math.abs(sale.amount.usd_now - 10) < 1e-9 && sale.amount.now_day === '2026-09-17' && /\$16\.76 then · \$10 now \(2026-09-17\)/.test(sale.sub), sale && sale.sub); }
// --- 1.1.0: P&L two ways + the holder's basis (LUNA-equivalents from the oracle LUNA series)
{ const luna = JSON.parse(fs.readFileSync(path.join(CORE, 'price-history/series/LUNA.json'))).daily; const o2 = Object.assign({}, opts, { lunaUsdOn: (d) => luna[d] });
  const r745 = NH.fold(rowsOf('745'), o2); const p = r745.summary.realized[0];
  ok('#745 round trip: paid 115 LUNA ($73.97) → 200 bLUNA ($16.76): USD −$57.20 (−77%), LUNA terms +239 LUNA (+208%), held 832 days', p && p.basis_known && Math.abs(p.usd_delta + 57.2) < 0.05 && Math.round(p.usd_pct) === -77 && Math.round(p.luna_delta) === 239 && Math.round(p.luna_pct) === 208 && p.held_days === 832, p && p.text);
  ok('#745 LUNA-equivalent of the bLUNA proceeds = usd ÷ LUNA\'s oracle price on 2026-09-12, basis labeled', p && Math.abs(p.received_luna - 16.76 / luna['2026-09-12']) < 0.5 && /bLUNA → LUNA at the oracle on 2026-09-12/.test(p.received_luna_basis), p && p.received_luna_basis);
  const sale = r745.rows.find(r => r.kind === 'sale'); ok('#745 the sale row carries the P&L line, both ways, in words', sale && sale.pnl && /P&L for this owner · paid 115 LUNA \(\$73\.97\) → USD −\$57\.2 \(−77%\) · LUNA terms \+239 LUNA \(\+208%\) · held 832 days/.test(sale.pnl.text), sale && sale.pnl && sale.pnl.text);
  ok('#745 holder basis: the buyer paid 200 bLUNA ($16.76 then), ≈ 354 LUNA at the time', r745.summary.holding && r745.summary.holding.amount.display === '200 bLUNA' && Math.abs(r745.summary.holding.usd - 16.76) < 0.01 && Math.round(r745.summary.holding.luna) === 354 && r745.summary.holding.known, r745.summary.holding && r745.summary.holding.text);
  const r9068 = NH.fold(rowsOf('9068'), o2); const q = r9068.summary.realized[0];
  ok('#9068 free mint sold for 1,600 LUNA ($1,053): basis 0 → USD +$1,053, LUNA terms +1,600 LUNA, no % (÷0 is not a number)', q && q.basis_known && q.paid_how === 'free mint' && Math.round(q.usd_delta) === 1053 && q.usd_pct === null && q.luna_delta === 1600 && q.luna_pct === null, q && q.text);
  ok('#9068 holder (bought 1,600 LUNA): basis known, $1,053 then', r9068.summary.holding && r9068.summary.holding.known && r9068.summary.holding.amount.display === '1,600 LUNA' && Math.round(r9068.summary.holding.usd) === 1053, r9068.summary.holding && r9068.summary.holding.text);
  const r3445 = NH.fold(rowsOf('3445'), o2); const t = r3445.summary.realized[0];
  ok('#3445 the seller got it by transfer → "cost basis unknown", proceeds still stated; the buyer\'s basis is 1,500 bLUNA ($570) ≈ 2,151 LUNA', t && !t.basis_known && /cost basis unknown/.test(t.text) && /1,500 bLUNA \(\$570\)/.test(t.text) && r3445.summary.holding && r3445.summary.holding.known && Math.round(r3445.summary.holding.luna) === 2151, [t && t.text, r3445.summary.holding && r3445.summary.holding.text]);
  const r1128 = NH.fold(rowsOf('1128'), o2); ok('#1128 unsold: back to the treasury stock is an admin row; no hand change; no ⚠', r1128.rows.filter(r => r.tone === 'admin').length === 4 && r1128.summary.hands_changed === 0 && r1128.summary.gaps === 0, r1128.rows.map(r => r.tone));
  const mv = r1128.rows[r1128.rows.length - 1]; ok('#1128 the Council multisig\'s 2024-11 migration reads as an OPERATOR move into the DAO core, from the treasury stock, with the manifest\'s labels', mv && mv.day === '2024-11-08' && mv.headline === 'Moved into The Alliance DAO core (daodao) by aDAO Council multisig (operator)' && /from DAO treasury stock \(mint era\) — the operator never held the token/.test(mv.sub) && mv.operator, mv && [mv.headline, mv.sub]);
  ok('#1128 the DAO core is the owner now (unminted); its basis is unknown, said so', r1128.summary.owner_now && r1128.summary.owner_now.label === 'The Alliance DAO core (daodao)' && r1128.summary.holding && !r1128.summary.holding.known, r1128.summary.owner_now); }
// --- 1.2.0: segments (one per holder) + LUNA-family rule
{ const luna = JSON.parse(fs.readFileSync(path.join(CORE, 'price-history/series/LUNA.json'))).daily; const o2 = Object.assign({}, opts, { lunaUsdOn: (d) => luna[d] });
  const r = NH.fold(rowsOf('745'), o2); const G = r.summary.segments; const H = G.filter(g => !g.admin);
  ok('#745: 4 segments — treasury stock, candy machine (admin) then two holders', G.length === 4 && G[0].admin && G[1].admin && H.length === 2, G.map(g => [g.admin, g.owner.text, g.held_days]));
  ok('#745 holder 1: bought at mint 115 LUNA, held 832 days, listed once, 694 days on market, ended by sale, P&L on the segment', H[0].acquired.how === 'mint' && H[0].held_days === 832 && H[0].listings === 1 && H[0].days_on_market === 694 && H[0].ended_by === 'sale' && H[0].pnl && Math.round(H[0].pnl.usd_delta) === -57, H[0]);
  ok('#745 holder 2 (current): acquired by sale for 200 bLUNA, holding 6 days; the sale is their BOUNDARY row (a tile), not a line in their section', H[1].current && H[1].acquired.how === 'sale' && H[1].held_days === 6 && H[1].boundary_row && H[1].boundary_row.kind === 'sale' && H[1].boundary_row.boundary === 'sale' && !H[1].rows.some(x => x.kind === 'sale') && H[1].boundary_row.seller_segment === H[0].index, H[1]);
  ok('#745 holder 1: the mint purchase is their boundary row (MINTED tile); their section holds only stake/unstake/list', H[0].boundary_row && H[0].boundary_row.boundary === 'mint' && JSON.stringify(H[0].rows.map(x => x.kind)) === JSON.stringify(['stake_enterprise', 'unstake_enterprise', 'list']), H[0].rows.map(x => x.kind));
  ok('#745 no section carries the sale or the mint purchase as a line (both are boundary tiles)', !H[0].rows.some(x => x.kind === 'sale' || x.kind === 'mint_purchase') && !H[1].rows.some(x => x.kind === 'sale'), [H[0].rows.map(x => x.kind), H[1].rows.map(x => x.kind)]);
  const r4 = NH.fold(rowsOf('4513'), o2); const g0 = r4.summary.segments[0];
  ok('#4513 first holder: free mint, 2 price changes inside 1 listing, sold the same week (7 days held)', g0.acquired.how === 'free mint' && g0.price_changes === 2 && g0.listings === 1 && g0.ended_by === 'sale' && g0.held_days === 7, g0);
  // LUNA family: a sale paid in SOLID has no LUNA leg
  const synth = rowsOf('745').map(x => Object.assign({}, x)); const sale = synth.find(x => x.kind === 'sale'); sale.price = { amount: '25000000', denom: 'cw20:solid' }; sale.denom_symbol = 'SOLID'; sale.usd = 25; sale.usd_basis = 'stable_1_1';
  const rs = NH.fold(synth, o2); const p = rs.summary.realized[0];
  ok('a sale paid in SOLID: USD P&L computed, LUNA terms n/a with the reason (no LUNA leg)', p && p.usd_delta != null && p.luna_delta === null && p.received_luna_na && /LUNA terms n\/a \(received in SOLID — no LUNA leg\)/.test(p.text), p && p.text); }
// --- the page: open the sheet for #745, read the journey section
let pageHtml = html.replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<script src="nft-explorer-app.js[^"]*" defer><\/script>/, '');
const stub = (w) => { w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }; w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.SiteHeader = { mount() {}, init() {}, subnav() {}, setActive() {} }; w.SiteFooter = { mount() {} }; w.AddressPicker = { mount() {}, init() {} }; w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), render() {} };
  w.fetch = (u) => { const url = String(u).split('?')[0]; let f = null; if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length)); else if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (/dao-originations\/main\/(.*)$/.test(url)) f = path.join(process.env.DAO_ORIG_DIR || '/nonexistent', url.replace(/.*dao-originations\/main\//, ''));
    if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404 ' + url)), text: () => Promise.resolve('') }); }; };
const dom = new JSDOM(pageHtml, { url: 'https://thealliancedao.com/nft-explorer-index.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stub });
const w = dom.window;
w.eval(fs.readFileSync('lib/nft-history.js', 'utf8'));
w.eval(app + "\n;window.__g = { show: (n) => showNftDetails(n), find: (id) => (typeof allNfts !== 'undefined' ? allNfts : []).find(n => String(n.id) === String(id)) || null };");   // top-level consts of an indirect eval are scoped to it — expose what the gate drives
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 15000));
const d = w.document;
const nft745 = w.__g.find('745');
ok('page: #745 is in the loaded collection', !!nft745);
w.__g.show(nft745);
await new Promise(r => setTimeout(r, 2500));
const j = d.getElementById('modal-journey');
ok('page: the sheet opened with the journey section READY (data-state)', j && j.dataset.state === 'ready', j && [j.dataset.state, j.textContent.slice(0, 120)]);
ok('page: summary chips read hands 1 · listed 1 time · 694 days on market · minted for 115 LUNA', j && j.dataset.hands === '1' && j.dataset.listings === '1' && j.dataset.dom === '694' && /Minted for 115 LUNA/.test(j.textContent), j && j.querySelector('.jr-sum') && j.querySelector('.jr-sum').textContent);
const lis = j ? [...j.querySelectorAll('ol li')] : [];
const segs = j ? [...j.querySelectorAll('.jr-seg')] : []; const holders = segs.filter(x => !x.classList.contains('jr-seg-admin'));
ok('page: 4 sections (2 treasury/admin, collapsed by default; 2 holders), holder 1 header says held 832 days · listed 1× · 694 days on market · sold on (the buy moved to the MINTED tile)', segs.length === 4 && holders.length === 2 && /Holder 1/.test(holders[0].textContent) && /held 832 days/.test(holders[0].textContent) && !/bought at mint/.test(holders[0].querySelector('.jr-seg-head').textContent) && /listed 1×/.test(holders[0].textContent) && /694 days on market/.test(holders[0].textContent) && /sold on/.test(holders[0].textContent), holders.map(h => h.querySelector('.jr-seg-head').textContent));
const tiles = j ? [...j.querySelectorAll('.jr-tile')] : [];
ok('page: two tiles — MINTED before holder 1, SOLD between holder 1 and holder 2 — in document order tile · section · tile · section', tiles.length === 2 && tiles[0].classList.contains('jr-tile-mint') && tiles[1].classList.contains('jr-tile-sale') && tiles[0].compareDocumentPosition(holders[0]) & 4 && holders[0].compareDocumentPosition(tiles[1]) & 4 && tiles[1].compareDocumentPosition(holders[1]) & 4, tiles.map(t => t.className));
ok('page: the MINTED tile reads "Bought at mint · terra1nj…arfy · 115 LUNA ($73.97 then · … now)" with a ribbon', /Bought at mint/.test(tiles[0].textContent) && /115 LUNA \(\$73\.97 then/.test(tiles[0].textContent) && tiles[0].querySelector('.jr-tile-ribbon') && tiles[0].querySelector('.jr-tile-ribbon').textContent === 'MINTED', tiles[0] && tiles[0].textContent);
ok('page: holder 2 section is the current one ("holding · N days" — the page counts from today) and quiet — no rows, says so', holders[1].classList.contains('jr-seg-now') && /holding · \d+ days/.test(holders[1].textContent) && /held quietly/.test(holders[1].textContent) && !holders[1].querySelector('ol'), holders[1].textContent);
const card = j && j.querySelector('.jr-tile-sale');
ok('page: the SOLD tile has the ribbon, the venue + amount, a Seller side (694 days on the market · P&L USD −$57.2 (−77%) · LUNA terms +239 LUNA (+208%) · held 832 days · paid 115 LUNA) and a Buyer side (holdings now · paid 200 bLUNA · ≈ 354 LUNA at the time)', card && card.querySelector('.jr-tile-ribbon').textContent === 'SOLD' && /BackBone Labs/.test(card.textContent) && /Seller/.test(card.textContent) && /694 days on the market/.test(card.textContent) && /P&L USD −\$57\.2 \(−77%\)/.test(card.textContent) && /LUNA terms \+239 LUNA \(\+208%\)/.test(card.textContent) && /held 832 days · paid 115 LUNA/.test(card.textContent) && /Buyer/.test(card.textContent) && /paid 200 bLUNA \(\$16\.76 then/.test(card.textContent) && /≈ 354 LUNA at the time/.test(card.textContent), card && card.textContent);
ok('page: the buyer side states holdings NOW (from nfts.json), never "at the time"', card && /holds \d+ now · \d+ staked · \d+ listed · \d+ liquid|holds 0 aDAO NFTs now|holdings now: not loaded yet/.test(card.textContent) && !/at the time of the buy/.test(card.textContent), card && card.textContent);
ok('page: 5 rows in the sections (7 events minus the two tiles), the sale drawn exactly once (as the tile)', lis.length === 5 && j.querySelectorAll('.jr-tile-sale').length === 1 && !lis.some(l => l.classList.contains('jr-sale')), lis.map(l => l.className));
ok('page: every row links its tx on chainsco.pe', lis.length > 0 && lis.every(l => l.querySelector('a.jr-tx') && /chainsco\.pe\/terra2\/tx\/[0-9A-F]{64}/.test(l.querySelector('a.jr-tx').href)));
ok('page: treasury sections collapsed by default with a toggle that names the row count', j && j.classList.contains('jr-collapsed') && j.querySelector('.jr-toggle') && /Show 2 treasury \/ admin rows/.test(j.querySelector('.jr-toggle').textContent), j && j.querySelector('.jr-toggle') && j.querySelector('.jr-toggle').textContent);
ok('page: buyer/seller show the registry name when there is one, else a short address (no raw 44-char address in a headline)', lis.every(l => !/terra1[a-z0-9]{38}/.test((l.querySelector('.jr-h') || l).textContent)));
ok('page: the chips carry the last round trip + the holder\'s basis', j.querySelector('.jr-chip.pnl.down') && /Last round trip · USD −\$57\.2 \(−77%\) · LUNA terms \+239 LUNA \(\+208%\)/.test(j.querySelector('.jr-chip.pnl').textContent) && j.querySelector('.jr-chip.hold') && /holds · paid 200 bLUNA \(\$16\.76 then · \$[\d.]+ now\) · \d+ days/.test(j.querySelector('.jr-chip.hold').textContent), [j.querySelector('.jr-chip.pnl') && j.querySelector('.jr-chip.pnl').textContent, j.querySelector('.jr-chip.hold') && j.querySelector('.jr-chip.hold').textContent]);
ok('page: USD then and USD now both on the sale card, now labeled with the oracle day', card && /\$16\.76 then · \$[\d.,]+ now/.test(card.textContent) && /now as of 20\d\d-\d\d-\d\d/.test(j.textContent), card && card.textContent);
// a token with no ledger rows says so
w.__g.show(Object.assign({}, nft745, { id: '99999', name: 'x' }));
await new Promise(r => setTimeout(r, 1500));
ok('page: an unknown token id → an honest empty state, not a blank', j && j.dataset.state === 'empty' && /No ledger record for #99999/.test(j.textContent), j && [j.dataset.state, j.textContent.slice(0, 80)]);
fs.rmSync(NFTC, { recursive: true, force: true });
console.log(`\n=== GATE explorer-journey: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
