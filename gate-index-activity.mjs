#!/usr/bin/env node
// gate-index-activity.mjs — index.html on real fixtures (jsdom): the DAODAO tile subline on LOAD, and Live Activity
// rows honouring the transfers stream's action (sale / bid / list / cancel), not "Transferred" for everything.
// Usage: TLA_CORE_DIR=<tla-core> NFTC_DIR=<nft-collections> node gate-index-activity.mjs [index.html]
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const CORE = process.env.TLA_CORE_DIR, NFTC = process.env.NFTC_DIR; if (!CORE || !NFTC) { console.error('TLA_CORE_DIR and NFTC_DIR required'); process.exit(1); }
const FILE = process.argv[2] || 'index.html';
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const html = fs.readFileSync(FILE, 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} };
w.SiteHeader = { mount() {}, init() {} }; w.PropAudit = {}; w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), CRONS: [] };
w.fetch = (u) => { const url = String(u).split('?')[0]; let f = null; if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length));
  if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 12000));
const d = w.document;
// --- tile subline on load (no click) ---
const S = JSON.parse(fs.readFileSync(path.join(NFTC, 'adao/snapshots/summary.json')));
const released = S.minted_count - (S.treasury_held_count + S.enterprise_dao_broken_count + S.dao_wallet_8ywv_held_count);
const expected = `${((S.daodao_staked_count + S.enterprise_staked_count) / released * 100).toFixed(1)}% of released supply staked`;
const sub = (d.getElementById('daodao-staked-percentage') || {}).textContent || '';
ok('tile: "% of released supply staked" rendered on load without opening the modal = ' + expected, sub.trim() === expected, sub);
ok('tile: count rendered', /^[\d,]+$/.test((d.getElementById('daodao-staked') || {}).textContent.trim()), (d.getElementById('daodao-staked') || {}).textContent);
// --- activity rows from the transfers stream ---
const items = w.__activityItems || []; const byTok = (t) => items.filter(i => i.col === 'adao' && String(i.token) === t);
const tr = JSON.parse(fs.readFileSync(path.join(NFTC, 'adao/transfers/2026/09.json'))); const recs = Array.isArray(tr) ? tr : tr.records;
const saleRec = recs.find(r => r.action === 'sale'); const bidRec = recs.find(r => r.action === 'bid');
ok('activity items built (' + items.length + ')', items.length > 0);
if (saleRec) { const rows = byTok(String(saleRec.token_id));
  ok(`activity: sale #${saleRec.token_id} from the transfers stream renders as Sold with amount + symbol`, rows.some(i => i.kind === 'sale' && /^Sold for [\d,.]+ (bLUNA|LUNA|USDC|SOLID|ampLUNA|CAPA)$/.test(i.label)), rows.map(i => i.label));
  ok(`activity: no "Transferred" row for the sold token #${saleRec.token_id} on that tx`, !rows.some(i => i.label === 'Transferred' && i.tx === saleRec.txhash), rows.map(i => [i.label, i.sub]));
  ok('activity: a sale is not shown twice (flows + transfers)', rows.filter(i => i.kind === 'sale' && i.tx === saleRec.txhash).length === 1); }
if (bidRec) { const rows = byTok(String(bidRec.token_id));
  ok(`activity: bid #${bidRec.token_id} renders as "Bid <amount>" and says the currency is not in the record (never a guessed symbol)`, rows.some(i => i.kind === 'bid' && /^Bid [\d,.]+$/.test(i.label) && /currency not in record/.test(i.sub)), rows.map(i => [i.label, i.sub])); }
ok('activity: no row is labelled "Transferred" with sub "to …" (the null-address fallthrough)', !items.some(i => i.label === 'Transferred' && i.sub === 'to …'), items.filter(i => i.label === 'Transferred').map(i => i.sub).slice(0, 5));
// --- 4.21: 30-day build, ledger events, window + type toggles ---
{ const it = w.__activityItems || []; const adao = it.filter(i => i.col === 'adao'); const kinds = new Set(adao.map(i => i.kind));
  const oldest = Math.min(...it.map(i => i.ts)); const ageD = (Date.now() - oldest) / 864e5;
  ok('4.21 items span ~30 days (oldest ' + ageD.toFixed(1) + 'd), not 7', ageD > 20 && ageD <= 31, ageD);
  const ym = (dt) => `${dt.getUTCFullYear()}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`; const nowD = new Date(); const prevD = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 15));
  const lg = [ym(nowD), ym(prevD)].flatMap(m => { try { return JSON.parse(fs.readFileSync(path.join(NFTC, 'adao/ledger/' + m + '.json'))); } catch { return []; } });
  const cut = Date.now() - 30 * 864e5; const lgStakes = lg.filter(r => r.kind === 'stake' && Date.parse(r.ts) >= cut);
  ok('4.21 ledger stakes in the window appear as Staked · aDAO (DAODAO) (' + lgStakes.length + ' in the ledger, 30d)', lgStakes.length === 0 || lgStakes.every(r => adao.some(i => i.kind === 'staked' && i.tx === r.txhash && String(i.token) === String(r.token_id) && i.sub === 'aDAO (DAODAO)')), lgStakes.slice(0, 2).map(r => r.txhash.slice(0, 8)));
  const dup = adao.filter(i => i.kind === 'staked').map(i => `${i.tx}|${i.token}`); ok('4.21 no stake shown twice (ledger supersedes the transfers-derived row)', new Set(dup).size === dup.length, dup.length - new Set(dup).size);
  const lgBreaks = lg.filter(r => r.kind === 'break' && Date.parse(r.ts) >= cut);
  ok('4.21 breaks come from the ledger when present (' + lgBreaks.length + ' in 30d)', lgBreaks.every(r => adao.some(i => i.kind === 'break' && i.tx === r.txhash)));
  const winEl = d.getElementById('activity-window'), kindsEl = d.getElementById('activity-kinds');
  ok('4.21 window toggle renders 7 days / 30 days, default 7', winEl && /7 days/.test(winEl.textContent) && /30 days/.test(winEl.textContent) && w.__activityDays === 7, winEl && winEl.textContent);
  ok('4.21 type toggles render with per-type counts (Sales, Listings, Delistings, Bids, Stakes, Unstakes, Breaks…)', kindsEl && ['Sales', 'Listings', 'Delistings', 'Bids', 'Stakes', 'Unstakes', 'Breaks'].every(l => kindsEl.textContent.includes(l)), kindsEl && kindsEl.textContent.slice(0, 120));
  w.setActivityDays(30); const c30 = (d.getElementById('activity-count') || {}).textContent || '';
  ok('4.21 switching to 30 days re-renders the count line "… in 30d"', /in 30d$/.test(c30.trim()), c30);
  w.setActivityKinds(false); w.toggleActivityKind('sale'); const onlySales = (d.getElementById('activity-count') || {}).textContent || ''; const salesN = adao.filter(i => i.kind === 'sale').length;
  ok('4.21 toggling to Sales only shows exactly the sales (' + salesN + ')', new RegExp(`of ${salesN} shown`).test(onlySales), onlySales);
  w.setActivityKinds(true); w.setActivityDays(7); }
// --- 4.22: no twins, no "#?" ---
{ const it = (w.__activityItems || []).filter(i => i.col === 'adao'); const keys = it.filter(i => i.token).map(i => `${i.kind}|${i.token}|${new Date(i.ts).toISOString().slice(0, 10)}`);
  ok('4.22 no event shown twice (same kind + token + day)', new Set(keys).size === keys.length, keys.filter((k, i) => keys.indexOf(k) !== i).slice(0, 3));
  const day = (i) => new Date(i.ts).toISOString().slice(0, 10); const dl = it.filter(i => i.kind === 'delisting'); ok('4.22 delistings keep the row that has a tx hash when one exists that day', dl.every(i => i.tx || !it.some(j => j.kind === 'delisting' && j.token === i.token && j.tx && day(j) === day(i))), dl.map(i => [i.token, day(i), !!i.tx]).slice(0, 4));
  const un = it.filter(i => i.kind === 'unstaked' && !i.token); ok('4.22 an unstake without token ids says "ids resolve at claim" (no #?)', un.every(i => i.noId && /ids resolve at claim/.test(i.sub)), un.map(i => i.sub)); }
// --- 4.20: mobile browser = desktop tiles fitted, not the app's rows (static CSS checks; the phone screenshot is the visual gate)
const src = fs.readFileSync(FILE, 'utf8'); const mobStart = src.lastIndexOf('@media (max-width: 767px) {', src.indexOf('#pulse-card { display: none')); const mob = src.slice(mobStart, src.indexOf('#mob-links-toggle { width: 100%'));
ok('4.20 mobile: #dao-stats is a two-column grid of cards (not one column)', /#dao-stats \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/.test(mob) && !/#dao-stats \{ grid-template-columns: 1fr !important/.test(mob));
ok('4.20 mobile: cards are centered blocks — no label-left/number-right row grid remains', /text-align: center !important; display: block/.test(mob) && !/grid-row: 1 \/ span/.test(mob) && !/grid-template-columns: minmax\(0, 1fr\) auto/.test(mob));
ok('4.20 mobile: the DAO Total Value + NFT Analytics strips show their desktop formulas; the lone-number variant is hidden', /#dao-total-breakdown, #nft-analytics-strip \.hidden\.sm\\:flex \{ display: flex !important/.test(mob) && /#dao-total-value-card \.sm\\:hidden, #nft-analytics-strip \.sm\\:hidden \{ display: none !important/.test(mob));
ok('4.20 mobile: marketplaces three-up, expanded card spans the row', /#marketplace-overview-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/.test(mob) && /\.marketplace-section\.mob-open \{ grid-column: 1 \/ -1; \}/.test(mob));
ok('4.20 marketplace summary markup stacks label + floor (small + b) for the card layout', /<small>Unbroken from<\/small><b>\$\$\{fp\.toFixed\(2\)\}<\/b>/.test(src));
console.log(`\n=== GATE index-activity: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
