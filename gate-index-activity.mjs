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
// --- 4.20: mobile browser = desktop tiles fitted, not the app's rows (static CSS checks; the phone screenshot is the visual gate)
const src = fs.readFileSync(FILE, 'utf8'); const mobStart = src.lastIndexOf('@media (max-width: 767px) {', src.indexOf('#pulse-card { display: none')); const mob = src.slice(mobStart, src.indexOf('#mob-links-toggle { width: 100%'));
ok('4.20 mobile: #dao-stats is a two-column grid of cards (not one column)', /#dao-stats \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/.test(mob) && !/#dao-stats \{ grid-template-columns: 1fr !important/.test(mob));
ok('4.20 mobile: cards are centered blocks — no label-left/number-right row grid remains', /text-align: center !important; display: block/.test(mob) && !/grid-row: 1 \/ span/.test(mob) && !/grid-template-columns: minmax\(0, 1fr\) auto/.test(mob));
ok('4.20 mobile: the DAO Total Value + NFT Analytics strips show their desktop formulas; the lone-number variant is hidden', /#dao-total-breakdown, #nft-analytics-strip \.hidden\.sm\\:flex \{ display: flex !important/.test(mob) && /#dao-total-value-card \.sm\\:hidden, #nft-analytics-strip \.sm\\:hidden \{ display: none !important/.test(mob));
ok('4.20 mobile: marketplaces three-up, expanded card spans the row', /#marketplace-overview-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/.test(mob) && /\.marketplace-section\.mob-open \{ grid-column: 1 \/ -1; \}/.test(mob));
ok('4.20 marketplace summary markup stacks label + floor (small + b) for the card layout', /<small>Unbroken from<\/small><b>\$\$\{fp\.toFixed\(2\)\}<\/b>/.test(src));
console.log(`\n=== GATE index-activity: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
