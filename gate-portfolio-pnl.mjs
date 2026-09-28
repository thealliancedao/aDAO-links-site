#!/usr/bin/env node
// gate-portfolio-pnl.mjs — member-portfolio 4.0 + lib/portfolio-pnl.js 2.0.0 + lib/portfolio-chart.js + lib/token-logos.js on REAL data (jsdom, the page's own script).
//   4.0: P2 the combined P&L (sources, drivers add to the net) · P26 the chart (history series) · P27 net worth (backing vs floor, liquid, staked, claimable everywhere)
//   · P28 locks (lock history P&L conserves every dollar; age / LUNA / decay) · P29 sources switch off · P30 alerts (decay, unstaking, authz, unbonding, pfp)
//   · P31 Tokens lens + unpriced + logos · P32 income = the P&L's bribes, Credia card. OVERLAY_DIR serves products not on main yet (the history series).
// Inputs: a tla-core checkout (every feed the page reads) and a build-pnl v3 output dir (tla-flows/pnl/…) — until the weekly
// build has published v3 on main, the gate points the page's ledger/rollup fetches at a local build of the same code (tla-flows 3.5.0).
// Expected values are read from the ledger file itself — the page must show THE ledger's numbers, not recompute them.
//   P1 lib: decode() rebuilds every trip from trip_cols; attribution identity holds on decoded trips; story() both lenses
//   P2 owner page: hero net == ledger totals.net_usd; the four bars == market / lp / claims+bribes / unrealized; the bars add to net
//   P3 LUNA lens: the hero switches to totals.net_luna; the positions table and the curve follow the lens
//   P4 value curve: one point per epoch + "now", the "now" label present
//   P5 positions (3.5): one row per position with activity, grouped by bucket, open rows largest first, closed folded; a row opens its trips
//   P15 (3.5) LP columns: take-rate drag + top-up on open non-amp, compounding on amp, APR earned with P&L incl. rewards, bucket subtotals add up
//   P6 wind-down: a wallet holding USDC.n LP shows the "USDC.n ending" pill on that pool's row
//   P7 disputed: a wallet with a disputed position shows it flagged and the hero says it was left out
//   P22–P25 (3.8) DAO-staked receipts: own LP-card panel, tile/banner once, trend days backfilled from the CAPA supply history; other-chain addresses from IBC history
//   P18 (3.7) trust: open lots whose receipt left the wallet (chain read says none) flagged "not in this wallet", out of Open now; hero says so
//   P19 (3.7) custody: the ampCAPA receipt staked in the DAO counts at its live value, P&L only on the part with a cost
//   P20 (3.7) idle LP: bank uLP + cw20 LP tokens of TLA pools in the wallet warned and valued; an amplified receipt is not idle
//   P21 (3.7) APR blank where a trip had no price; the total says how many positions it covers
//   P12 (3.3) wallet balances: tickers not hashes, the catalog's real decimals (PAXG 18), rows under $2 folded
//   P13 (3.3) Votion: one story per position with the product's in / now / three legs, the why-sentence, real vs advertised APR
//   P14 (3.4) vote allocations: will-earn total = the engine's now = Σ per vote; could-earn = bestSplitAll; per-bucket best; simulate links the Vote Market knows
//   P8 fallback: with no v3 block in the ledger the page renders the Phase A story (no crash, no v3 cards)
// Usage: TLA_CORE_DIR=<tla-core> PNL_OUT=<dir holding tla-flows/pnl> NFTC_DIR=<nft-collections> DAOO_DIR=<dao-originations> node gate-portfolio-pnl.mjs
import { JSDOM, VirtualConsole } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const OVERLAY = process.env.OVERLAY_DIR || '';
const CORE = process.env.TLA_CORE_DIR, OUT = process.env.PNL_OUT, NFTC = process.env.NFTC_DIR || '', DAOO = process.env.DAOO_DIR || '';
if (!CORE || !OUT) { console.error('TLA_CORE_DIR and PNL_OUT required'); process.exit(1); }
const SITE = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const require = createRequire(import.meta.url); const PPL = require(path.join(SITE, 'lib/portfolio-pnl.js'));
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); } };
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const OWNER = 'terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw';
const ledgerOf = (a) => { const f = path.join(OUT, 'tla-flows/pnl/ledger', a + '.json'); return fs.existsSync(f) ? J(f) : null; };
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/', DAOO_U = 'https://raw.githubusercontent.com/thealliancedao/dao-originations/main/';
const T = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const money = (v) => PPL.fmt.usd(v, true), lun = (v) => PPL.fmt.luna(v, true);
const fmtN = (v) => { const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : a > 0 && a < 0.01 ? v.toPrecision(2) : v.toFixed(a < 10 && a > 0 ? 2 : 0); };   /* the page's fmtNum */
const f$ = (v) => { const a = Math.abs(v); return a >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : a >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(2); };   /* the page's own fmt$ (balances card) */

console.log('— P1 lib on the owner\'s ledger —');
const L0 = ledgerOf(OWNER); const D0 = PPL.decode(L0.v3);
{ let n = 0, bad = 0; for (const p of D0.positions) for (const t of p.trips) { if (t.in_usd == null || t.out_usd == null || t.market_usd == null) continue; n++; if (Math.abs(t.delta_usd - (t.market_usd + t.lp_usd)) > 0.021) bad++; }
  ok(`decode(): ${D0.positions.length} positions, ${n} valued trips rebuilt from trip_cols; out − in = market + lp on each`, n > 50 && bad === 0, bad); }
// 3.7: the page reconciles the ledger's open lots with the hourly chain read (participants) — the gate does the same from the same file
const PART = J(path.join(CORE, 'member-data/participants/current.json'));
const liveFor = (wallet, custody) => { const m = PART.members.find(x => x.wallet === wallet);
  /* 3.8: like the page — the feed's custody (capture-engine 1.2) unless a test hands a live read */
  const feedCu = ((m && m.custody) || []).filter(c => c.usd > 0 && c.pool).map(c => ({ pool: c.pool, mech: c.mechanism || 'amplified', usd: c.usd, luna: null, where: c.where }));
  return { read: !!(m && Array.isArray(m.lp_positions)), held: (pool, mech) => ((m && m.lp_positions) || []).filter(l => l.pool_gauge_id === pool && (l.is_amplified ? 'amplified' : 'non_amplified') === mech).reduce((x, l) => x + (Number(l.estimated_position_usd) || 0), 0), custody: custody || feedCu }; };
const recOf = (L, wallet, custody) => PPL.reconcile(PPL.decode(L.v3), liveFor(wallet, custody));
const R0 = recOf(L0, OWNER);
const RB = PPL.reconcile(PPL.decode(L0.v3), Object.assign(liveFor(OWNER), { custody: [] }));   /* the same reconcile with no custody — the base the arithmetic identities start from */
{ const S = PPL.story(D0, 'usd'), SL = PPL.story(D0, 'luna'); const t = L0.v3.totals;
  ok('story(usd): net == totals.net_usd, market/lp/rewards/unrealized from the ledger', S.net === t.net_usd && S.market === t.realized.market_usd && S.lp === t.realized.lp_usd && Math.abs(S.rewards - (t.rewards.claims_usd + t.rewards.bribes_usd)) < 1e-9 && S.unrealized === t.open.unrealized_usd);
  ok('story(luna): net == totals.net_luna', SL.net === t.net_luna);
  ok('the parts add to the net (usd): market + lp + rewards + unrealized == net (± $0.10 — the build rounds each part to the cent; the net is summed before rounding)', Math.abs(S.market + S.lp + S.rewards + S.unrealized - S.net) <= 0.10, [S.market, S.lp, S.rewards, S.unrealized, S.net]); }

async function run(wallet, opts = {}) {
  const pageUrl = 'https://thealliancedao.com/member-portfolio.html' + (wallet ? '?wallet=' + wallet : '');
  const html = fs.readFileSync(path.join(SITE, 'member-portfolio.html'), 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<script defer src="[^"]*"><\/script>/g, '');
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (process.env.GATE_DEBUG) console.log('   [page error]', String(e && (e.detail || e.message || e)).slice(0, 400)); }); if (process.env.GATE_DEBUG) { vc.on('error', (...a) => console.log('   [console.error]', a.map(String).join(' ').slice(0, 300))); vc.on('warn', (...a) => console.log('   [console.warn]', a.map(String).join(' ').slice(0, 300))); }
  const dom = new JSDOM(html, { url: pageUrl, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); win.scrollTo = () => {}; win.requestAnimationFrame = (f) => setTimeout(f, 0); win.Element.prototype.scrollIntoView = () => {};
    win.HTMLCanvasElement.prototype.getContext = () => null; win.SiteHeader = { mount() {}, subnav() {} }; win.SiteFooter = { mount() {} };
    if (opts.links) for (const [k, v] of Object.entries(opts.links)) win.localStorage.setItem('mp_link:' + wallet + ':' + k, v);
    win.fetch = (u) => { const url = String(u).split('?')[0]; let f = null;
      if (opts.lcd) { const a = opts.lcd(decodeURIComponent(String(u))); if (a !== undefined) return Promise.resolve(a === null ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => a }); }   /* 4.0: live reads (unbonding, authz, pfpk, DAO claims) */
      if (opts.chain) { for (const [host, ans] of Object.entries(opts.chain)) if (url.includes(host) && (!ans.addr || url.includes(ans.addr))) { const k = /\/bank\//.test(url) ? 'bank' : /\/staking\//.test(url) ? 'staking' : /\/distribution\//.test(url) ? 'rewards' : null; if (k && ans[k]) return Promise.resolve({ ok: true, status: 200, json: async () => ans[k] }); } }
      if (opts.bank && /\/cosmos\/bank\/v1beta1\/balances\//.test(url) && url.includes(wallet)) return Promise.resolve({ ok: true, status: 200, json: async () => ({ balances: opts.bank }) });
      if (opts.smart && /\/cosmwasm\/wasm\/v1\/contract\/terra1[0-9a-z]+\/smart\//.test(url)) { const m = url.match(/contract\/(terra1[0-9a-z]+)\/smart\/([^/?]+)/); const fn = opts.smart[m[1]]; if (fn) { let q = null; try { q = JSON.parse(Buffer.from(decodeURIComponent(m[2]), 'base64').toString()); } catch (e) {} const ans = q ? fn(q) : undefined; if (ans !== undefined) return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: ans }) }); } }   // 3.7: contract queries (the ampCAPA DAO)
      if (opts.cw20 && /\/cosmwasm\/wasm\/v1\/contract\/terra1[0-9a-z]+\/smart\//.test(url)) { const m = url.match(/contract\/(terra1[0-9a-z]+)\/smart\/([^/?]+)/); let q = null; try { q = JSON.parse(Buffer.from(decodeURIComponent(m[2]), 'base64').toString()); } catch (e) {} if (q && q.balance) return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { balance: String(opts.cw20[m[1]] || 0) } }) }); }   // 3.6: the live cw20 reads   // 3.3: the live bank scan, as the owner's screenshot showed it
      if (OVERLAY && url.startsWith(CORE_U) && fs.existsSync(path.join(OVERLAY, url.slice(CORE_U.length)))) f = path.join(OVERLAY, url.slice(CORE_U.length));   /* 4.0: products not on main yet (the history series before member-data 1.5.0 runs) */
      else if (url.startsWith(CORE_U + 'tla-flows/pnl/')) { const rel = url.slice(CORE_U.length); f = path.join(OUT, rel); if (opts.noV3 && /ledger\/terra1/.test(rel) && fs.existsSync(f)) { const d = J(f); delete d.v3; return Promise.resolve({ ok: true, status: 200, json: async () => d }); } }
      else if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (NFTC && url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length)); else if (DAOO && url.startsWith(DAOO_U)) f = path.join(DAOO, url.slice(DAOO_U.length));
      if (opts.txs && /\/cosmos\/tx\/v1beta1\/txs\?/.test(String(u))) { const ans = opts.txs(decodeURIComponent(String(u))); if (ans) return Promise.resolve({ ok: true, status: 200, json: async () => ans }); }   /* 3.8: the IBC history search */
      if (f && fs.existsSync(f) && fs.statSync(f).isFile()) { const t = fs.readFileSync(f, 'utf8');
        if (opts.patchMember && /member-data\/(participants|positions)\/current\.json$/.test(f)) { const d = JSON.parse(t); for (const m of (d.members || [])) if (m.wallet === opts.patchMember.wallet) opts.patchMember.fn(m); return Promise.resolve({ ok: true, status: 200, json: async () => d }); }   /* 3.8: a feed as capture-engine 1.2 writes it */
        return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }); }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }); };
    for (const lib of ['lib/portfolio-pnl.js', 'lib/winddown.js', 'lib/denoms.js', 'lib/vote-market.js', 'lib/token-logos.js', 'lib/portfolio-chart.js']) if (!(opts.noLib && lib.includes('portfolio'))) win.eval(fs.readFileSync(path.join(SITE, lib), 'utf8'));
  } });
  const w = dom.window; w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 250)); const sc = w.document.getElementById('story-card'); if (!wallet && !w.document.getElementById('state-welcome').classList.contains('hidden')) break; if (sc && !/Adding up/.test(sc.textContent) && (opts.noV3 || opts.noLib || w.document.querySelector('[data-pp="net-all"]'))) break; }
  await new Promise(r => setTimeout(r, 400)); return w;
}

console.log('— P2–P5 the owner\'s page —');
{ const w = await run(OWNER); const d = w.document; const t = R0.totals;   // 3.7: the reconciled totals (the ledger's, less lots no longer in the wallet)
  for (let i = 0; i < 30 && !d.querySelector('[data-pp="src-locks"]'); i++) await new Promise(r => setTimeout(r, 250));   // 4.0: the lock history lands after the ledger
  const G = w.__mpStore._doneTotals || {}; const F = G.sources || {};
  const lpUsd = t.realized.delta_usd + t.open.unrealized_usd + t.rewards.claims_usd;
  ok(`4.0 "TLA LPs" source = realized ${money(t.realized.delta_usd)} + still open ${money(t.open.unrealized_usd)} + LP rewards ${money(t.rewards.claims_usd)} = ${money(lpUsd)} (the ledger's own figures; bribes sit with Locks)`, T(d.querySelector('[data-pp="src-lp"] > div:last-child')) === money(lpUsd), T(d.querySelector('[data-pp="src-lp"]')));
  const srcSum = Object.keys(F).filter(k => k !== 'bribes').reduce((x, k) => x + F[k].usd, 0);
  ok(`the hero = Σ the sources switched on (${Object.keys(F).filter(k => k !== 'bribes').map(k => k + ' ' + money(F[k].usd)).join(' + ')}) = ${money(srcSum)}`, T(d.querySelector('[data-pp="net-all"]')) === money(srcSum) && Math.abs(G.net_usd - srcSum) < 0.005, T(d.querySelector('[data-pp="net-all"]')));
  const drv = [...d.querySelectorAll('[data-pp^="drv-"]')].map(x => Number(T(x.lastElementChild).replace(/[^0-9.\-−]/g, '').replace('−', '-')));
  if (process.env.GATE_DEBUG) console.log('   srcSum', srcSum, 'net', G.net_usd, Object.keys(F));
  ok(`what drove it adds to the net: ${drv.map(x => x.toFixed(2)).join(' + ')} = ${drv.reduce((a, b) => a + b, 0).toFixed(2)} (prices + yield + rewards + still open + NFTs)`, drv.length >= 3 && Math.abs(drv.reduce((a, b) => a + b, 0) - srcSum) <= 0.5 * drv.length /* figures ≥ $10K print to the dollar */ && Math.abs(['lp', 'locks', 'votion', 'nfts'].filter(k => F[k]).reduce((x, k) => x + (F[k].market || 0) + (F[k].yield || 0) + (F[k].rewards || 0) + (F[k].open || 0) + (F[k].nft || 0), 0) - srcSum) < 0.5 /* each source's own identity, the build's cents */, drv);
  ok('the sentence sets dollars against LUNA terms and names LUNA’s own move', /in dollars/.test(T(d.querySelector('[data-pp="sentence"]'))) && /LUNA/.test(T(d.querySelector('[data-pp="sentence"]'))), T(d.querySelector('[data-pp="sentence"]')));
  // the value curve moved into THE chart: the LP view on "All" reaches back to the first epoch
  const CD = w.__mpStore._chartData; const PC = w.PortfolioChart; const SA = CD && PC ? PC.seriesFor(CD, { view: 'lp', range: 0, lens: 'usd' }) : null;
  const d0 = CD && CD.rows[0] ? CD.rows[0].d : null; const older = (L0.v3.value_curve || []).filter(c => c.e !== 'now').length;
  ok(`the P&L's weekly LP curve is in the chart: LP view on "All" starts ${SA && SA.first} (E${L0.v3.value_curve[0].e}) and runs into the daily history from ${d0}`, SA && SA.series[0] && SA.series[0].pts.length > (CD.rows.length) && SA.first < d0, SA && [SA.first, SA.series[0].pts.length, CD.rows.length]);
  const rows = [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')]; const expected = D0.positions.filter(p => p.deposits || p.withdraws);
  ok(`positions table: ${expected.length} rows (every position with activity)`, rows.length === expected.length, rows.length);
  // 3.5: grouped by bucket — inside each bucket the open rows run largest first; closed rows fold (hidden until the toggle)
  const byRow = (r) => expected[Number(r.getAttribute('data-pp-row'))];
  const bucketRows = [...d.querySelectorAll('[data-pp="positions"] tbody tr')]; let cur = null, prev = null, sorted = true;
  for (const r of bucketRows) { if (r.hasAttribute('data-pp-bucket')) { cur = r.getAttribute('data-pp-bucket'); prev = null; continue; } if (!r.hasAttribute('data-pp-row') || r.hasAttribute('data-pp-closed')) continue; const p = byRow(r); if (prev != null && (p.open_value_usd || 0) > prev + 1e-9) sorted = false; prev = p.open_value_usd || 0; }
  ok(`bucket groups (${[...d.querySelectorAll('[data-pp-bucket]')].map(x => x.getAttribute('data-pp-bucket')).join(', ')}); open rows largest first inside each; closed folded`, d.querySelectorAll('[data-pp-bucket]').length >= 2 && sorted && [...d.querySelectorAll('[data-pp-closed]')].every(r => r.hidden));
  const withTrips = rows.find(r => byRow(r).realized.trips > 0 && !r.hasAttribute('data-pp-closed')) || rows.find(r => byRow(r).realized.trips > 0);
  if (withTrips && withTrips.hidden) d.querySelector('[data-pp-closed-toggle="' + withTrips.getAttribute('data-pp-closed') + '"]').click();
  const tr = withTrips && d.querySelector('[data-pp-trips="' + withTrips.getAttribute('data-pp-row') + '"]'); withTrips && withTrips.click();
  ok('a row with closed trips opens its trip table (opened → closed, in, out, Δ, prices/pool, tx link)', tr && !tr.hidden && tr.querySelectorAll('tbody tr').length > 0 && /→/.test(T(tr)) && !!tr.querySelector('a[href^="https://chainsco.pe/terra2/tx/"]'));
  // P3 lens
  d.querySelector('#story-card [data-pp-lens="luna"]').click(); await new Promise(r => setTimeout(r, 50));
  const lunSum = Object.keys(F).filter(k => k !== 'bribes').reduce((x, k) => x + (F[k].luna || 0), 0);
  ok(`LUNA lens: the hero = Σ the sources in LUNA (${lun(lunSum)}); the LP source = realized + open + claims in LUNA`, T(d.querySelector('[data-pp="net-all"]')) === lun(lunSum) && T(d.querySelector('[data-pp="src-lp"] > div:last-child')) === lun(t.realized.delta_luna + t.open.unrealized_luna + t.rewards.claims_luna), T(d.querySelector('[data-pp="net-all"]')));
  d.querySelector('#pp-positions [data-pp-lens="luna"]').click(); await new Promise(r => setTimeout(r, 50));
  ok('the positions table has its own lens (USD · Tokens · LUNA) and follows it', /LUNA/.test(T(d.getElementById('pp-positions'))) && d.querySelectorAll('#pp-positions [data-pp-lens]').length === 3); }

console.log('— P6 wind-down pill · P7 disputed —');
{ const part = J(path.join(CORE, 'member-data/participants/current.json')); const W = require(path.join(SITE, 'lib/winddown.js')); const wd = W.build(J(path.join(CORE, 'docs/curated/alerts.json')), J(path.join(CORE, 'lp-grades/snapshots/current.json')));
  const holder = part.members.map(m => ({ m, L: ledgerOf(m.wallet) })).find(x => x.L && x.L.v3 && Object.values(x.L.v3.positions).some(p => p.units_open > 0 && !p.disputed && wd.forPool(p.pool)));
  if (holder) { const w = await run(holder.m.wallet); const pills = [...w.document.querySelectorAll('[data-pp="positions"] .wd-pill')]; const exp = Object.values(holder.L.v3.positions).filter(p => (p.deposits || p.withdraws) && wd.forPool(p.pool)).length;
    ok(`${holder.m.wallet.slice(-6)}: ${exp} USDC.n pool row(s) carry the wind-down pill`, pills.length === exp && exp > 0, pills.length); } else ok('a USDC.n holder with v3 positions exists', false);
  const dispW = fs.readdirSync(path.join(OUT, 'tla-flows/pnl/ledger')).filter(f => f.startsWith('terra1')).map(f => J(path.join(OUT, 'tla-flows/pnl/ledger', f))).find(L => L.v3 && L.v3.totals.positions_disputed && part.members.some(m => m.wallet === L.address));
  if (dispW) { const w = await run(dispW.address); const flag = T(w.document.querySelector('[data-pp="flags"]'));
    ok(`${dispW.address.slice(-6)}: the hero says ${dispW.v3.totals.positions_disputed} LP position(s) left out; the row is marked ⚠ disputed`, flag.includes(dispW.v3.totals.positions_disputed + ' LP position') && /left out/.test(flag) && /disputed/.test(T(w.document.getElementById('pp-positions'))), flag); } }

console.log('— P8 fallback —');
{ const w = await run(OWNER, { noV3: true }); const d = w.document;
  ok('no v3 in the ledger → the Phase A story renders, the v3 cards stay hidden', !d.querySelector('[data-pp="net-all"]') && /In TLA since|No captured flow/.test(T(d.getElementById('story-card'))) && d.getElementById('pp-positions-card').hidden, T(d.getElementById('story-card')).slice(0, 120));
  const w2 = await run(OWNER, { noLib: true }); ok('lib missing → the Phase A story renders (no crash)', /In TLA since|No captured flow/.test(T(w2.document.getElementById('story-card')))); }

console.log('— P10 the NFT leg (3.1) —');
if (NFTC) { const shard = OWNER.slice(-1); const phx = new Set(J(path.join(NFTC, 'adao/collection.json')).tiers.phoenix.token_ids.map(String));
  const expect = (slug) => { const e = J(path.join(NFTC, slug, 'ledger/by-wallet', shard + '.json')).wallets[OWNER]; const fh = J(path.join(NFTC, slug, 'snapshots/floor-history.json')); const rows = fh.rows || fh; const pt = rows[rows.length - 1].per_tier;
    const mark = (tier) => { const f = pt[tier] || {}; const a = f.sales_floor_usd, b = f.listing_floor_usd; return a != null && b != null ? Math.min(a, b) : (a ?? b ?? null); };
    let worth = 0, paid = 0, n = 0; for (const t of e.holdings_now.tokens) { const tier = slug === 'adao' && phx.has(String(t.token_id)) ? 'phoenix' : (t.broken ? 'broken' : 'base'); const m = mark(tier); if (m != null) worth += m; const u = t.acquired && t.acquired.price && t.acquired.price.usd; if (u != null && m != null) { paid += u; n++; } }
    return { held: e.holdings_now.total, worth, paid, n, realized: e.realized.usd.total, trips: e.realized.round_trips }; };
  const w = await run(OWNER); const d = w.document; for (let i = 0; i < 20 && d.getElementById('pp-nfts-card').hidden; i++) await new Promise(r => setTimeout(r, 250));
  for (const [slug, label] of [['adao', 'aDAO'], ['pixel-lions', 'Pixel Lions']]) { const x = expect(slug); const el = d.querySelector('[data-pp-nft="' + slug + '"]'); const t = T(el);
    ok(`${label}: ${x.held} held · worth ${PPL.fmt.usd(x.worth)} at the floor · paid ${PPL.fmt.usd(x.paid)} on the ${x.n} priced · sold ${x.trips} round trips ${money(x.realized)}`, el && t.includes(x.held + ' held') && t.includes(PPL.fmt.usd(x.worth)) && t.includes(PPL.fmt.usd(x.paid)) && t.includes(x.n + ' of ' + x.held + ' priced') && t.includes(money(x.realized)), t.slice(0, 300)); }
  ok('every held token listed with how it came in, what was paid, and the floor', d.querySelectorAll('[data-pp-nft="adao"] tbody tr').length === expect('adao').held);
  const tier9068 = PPL.nftLeg({ slug: 'adao', entry: { holdings_now: { tokens: [{ token_id: '9068' }, { token_id: '9057' }] } }, perTier: { phoenix: { sales_floor_usd: 1000 }, base: { sales_floor_usd: 90 } }, phoenix: phx });
  ok('registry Phoenix fix: #9068 marks as phoenix, #9057 as base', tier9068.tokens[0].tier === 'phoenix' && tier9068.tokens[1].tier === 'base');
  d.querySelector('#pp-nfts [data-pp-lens="luna"]').click(); await new Promise(r => setTimeout(r, 50));
  ok('LUNA lens reaches the NFT card', /LUNA/.test(T(d.querySelector('[data-pp-nft="adao"]')))); }
else console.log('  (NFTC_DIR not given — P10 skipped)');

console.log('— P11 live, and no pre-picked wallet (3.2) —');
{ const w = await run(null); const d = w.document; const wel = d.getElementById('state-welcome');
  ok('no wallet chosen → the welcome asks for one ("Choose a wallet"), the portfolio stays hidden', !wel.classList.contains('hidden') && /Choose a wallet/.test(T(wel)) && d.getElementById('portfolio').classList.contains('hidden'));
  ok('no wallet is put forward: no DeFi_Patriot / LionDAO / Whale / treasury chips', !/DeFi_Patriot|LionDAO|The Whale|aDAO Treasury/.test(T(wel)) && d.querySelectorAll('.demo-chip').length === 0, T(wel).slice(0, 200));
  const ts = fs.readFileSync(path.join(SITE, 'tla-stats.html'), 'utf8'), tools = fs.readFileSync(path.join(SITE, 'tools.html'), 'utf8');
  ok('TLA Stats tab bar: Member Portfolio is a live link (href member-portfolio.html, badge NEW) — not greyed SOON', /id: 'portfolio', label: 'Member Portfolio', icon: 'fa-user-astronaut',\s+href: 'member-portfolio\.html', badge: 'NEW'/.test(ts) && !/id: 'portfolio'[^\n]*disabled: true/.test(ts));
  ok('Tools: the portfolio is no longer a test slot', !/file: 'member-portfolio\.html'/.test(tools)); }

console.log('— P9 the picker\'s "View portfolio →" —');
{ const mk = (url) => { const dom = new JSDOM('<div id="sh-picker"></div>', { url, runScripts: 'outside-only' }); const w = dom.window; w.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) }); w.eval(fs.readFileSync(path.join(SITE, 'lib/address-picker.js'), 'utf8')); w.AddressPicker.mount({ emitInitial: false }); return w; };
  const w1 = mk('https://thealliancedao.com/tla-stats.html?wallet=' + OWNER); const a = w1.document.querySelector('.ap-port');
  ok('on another page with a wallet selected: the link shows and opens member-portfolio for that wallet', a && a.style.display !== 'none' && a.getAttribute('href') === '/member-portfolio.html?wallet=' + OWNER && /View portfolio/.test(a.textContent), a && [a.style.display, a.getAttribute('href')]);
  const w2 = mk('https://thealliancedao.com/tla-stats.html'); w2.localStorage.clear(); const w2b = mk('https://thealliancedao.com/tla-stats.html');
  ok('no wallet selected: hidden', w2b.document.querySelector('.ap-port').style.display === 'none');
  const w3 = mk('https://thealliancedao.com/member-portfolio.html?wallet=' + OWNER);
  ok('on the portfolio itself: hidden', w3.document.querySelector('.ap-port').style.display === 'none'); }

console.log('— P12 wallet balances (3.3): named, scaled by the catalog\'s real decimals, dust under $2 folded —');
{ const cat = J(path.join(CORE, 'token-catalog/snapshots/current.json')); const den = (pre) => cat.tokens.find(t => t.denom.startsWith(pre)).denom;
  // the owner's screenshot, raw: PAXG (18 dec) read at 6 showed $3,188.5M; WBTC (8 dec) $50.05 / $1.02; ASTRO 20.2K; USDC.n 1.32; LUNA 186
  const bank = [{ denom: den('ibc/0EF563'), amount: '745200000000' }, { denom: den('ibc/05D299'), amount: '827' }, { denom: den('ibc/8D8A7F'), amount: '20200000000' }, { denom: 'uluna', amount: '186000000' }, { denom: den('ibc/2C962D'), amount: '1320000' }, { denom: den('ibc/CF57A8'), amount: '12' }];
  const PYROAR = 'terra1pez3qw6pa24a06wee404yy5mp37j57n3s9zjkdfjeapwqf78dntql0ngsy', AMP = 'terra1ecgazyd0waaj3g7l9cmy5gulhxkps2gmxu9ghducvuypjq68mq2s5lvsct';
  bank.push({ denom: 'factory/terra1unknownunknownunknownunknownunknownunknownunknownunknown/uWHATEVER', amount: '5000000' });   // a denom the catalog does not know
  const w = await run(OWNER, { bank, cw20: { [PYROAR]: '7150000000000000', [AMP]: '12500000' } }); await new Promise(r => setTimeout(r, 1500)); const el = w.document.getElementById('balances-table'); const txt = T(el);
  const rows = [...el.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(T));
  ok('no row shows an ibc/ hash — every token by its catalog ticker', rows.length > 0 && rows.every(r => !/^ibc\//.test(r[0])), rows.map(r => r[0]));
  ok('PAXG is valued at 18 decimals (≈ $0.003, dust) — not $3,188.5M', !/3,?188|3\.19B|M$/.test(rows.map(r => r[2]).join(' ')) && !rows.some(r => /PAXG/.test(r[0])), rows);
  ok('ASTRO shown by name (≈ $10–12 at the catalog price); LUNA kept; the WBTCs ($0.50 / $0.01 at 8 decimals) fold into dust', rows.some(r => /^ASTRO/.test(r[0]) && /\$1[01]\.\d\d/.test(r[2])) && !rows.some(r => /WBTC/.test(r[0])) && rows.some(r => /^LUNA/.test(r[0])), rows);
  { const mk = J(path.join(DAOO, 'lion-dao/history/markets.json')); const last = Object.keys(mk.days).sort().pop(); const px = mk.days[last].pyroar_usd; const want = 7150000000 * px;
    const il = T(el.querySelector('[data-illiquid]')); const dep = mk.days[last].pyroar_pair_depth_usd; const sv = PPL.sellable(want, dep);
    ok(`pyROAR (a cw20 the catalog does not carry) read live: 7.15B × $${px} = ${PPL.fmt.usd(want)} on paper — but its pair holds ${PPL.fmt.usd(dep)}: shown as ILLIQUID, would fetch ≈ ${PPL.fmt.usd(sv.fetch_usd)}, not a table row`, !rows.some(x => /^pyROAR/.test(x[0])) && /Illiquid/.test(il) && /7\.15B|7,150/.test(il) && il.includes('≈ ' + f$(sv.fetch_usd)) && il.includes(f$(want)) && sv.illiquid, il || rows);
    const liq = T(el.querySelector('tfoot')); const liqN = Number(liq.replace(/[^0-9.]/g, ''));
    ok(`the liquid total (${liq}) leaves the illiquid pyROAR out`, /Liquid total/.test(liq) && liqN > 0 && liqN < want, liq); }
  ok('a cw20 held in the catalog (ampLUNA) is read live and not double-counted with the feed', rows.filter(x => /^ampLUNA/.test(x[0])).length <= 1);
  ok('tokens with no price are LISTED by name / denom with their amount (not just counted)', /with no price in our catalog/.test(txt) && /uWHATEVER/.test(txt), txt.slice(-400));
  ok('every row shown is ≥ $2; the rest folds into one "under $2" line', rows.every(r => { const v = Number(String(r[2]).replace(/[^0-9.]/g, '')); return !(v < 2); }) && /under \$2/.test(txt), txt.slice(0, 300)); }
console.log('— P13 the Votion story (3.3, org-votion 1.5.0 holder-pnl) —');
{ const pf = path.join(CORE, 'votion/holder-pnl/current.json');
  if (!fs.existsSync(pf)) console.log('  (votion/holder-pnl/current.json not on disk — run platform-crons votion/mock-run-holder-pnl.js with OUT_FILE first; P13 skipped)');
  else { const hp = J(pf); const mine = Object.values(hp.holders).filter(h => h.wallet === OWNER && h.totals);
    const w = await run(OWNER); await new Promise(r => setTimeout(r, 800)); const d = w.document;
    const cards = [...d.querySelectorAll('[data-votion-story]')];
    ok(`one story per Votion position (${mine.length} in the product, ${cards.length} on the page)`, mine.length > 0 && cards.length === mine.length);
    for (const h of mine) { const c = cards.find(x => x.getAttribute('data-votion-story') === h.vault); const t = T(c); const L = h.totals.legs;
      const has = (v) => t.includes(PPL.fmt.usd(v, true));
      ok(`${h.lst_symbol}: in ${PPL.fmt.usd(h.totals.cost_usd)} → now ${PPL.fmt.usd(h.totals.usd_now)}; legs LUNA price ${PPL.fmt.usd(L.luna_price, true)} · staking ${PPL.fmt.usd(L.lst_stake, true)} · Votion ${PPL.fmt.usd(L.votion, true)} — the product's numbers, not recomputed`, c && t.includes(PPL.fmt.usd(h.totals.cost_usd)) && t.includes(PPL.fmt.usd(h.totals.usd_now)) && has(L.luna_price) && has(L.lst_stake) && has(L.votion) && has(h.totals.delta_usd), t.slice(0, 400));
      ok(`${h.lst_symbol}: says why (LUNA's move over the same time) and real vs advertised APR`, /LUNA fell|LUNA moved/.test(t) && /real APR/.test(t) && (h.advertised ? /advertised/.test(t) : true), t.slice(0, 300)); }
    const w2 = await run(OWNER, {}); }
}
console.log('— P14 vote allocations (3.4): will earn vs could earn — one engine (lib/vote-market.js) —');
{ const VM = require(path.join(SITE, 'lib/vote-market.js'));
  const fetchLocal = (u) => { const f = path.join(CORE, String(u).split('?')[0].slice(CORE_U.length)); return Promise.resolve(fs.existsSync(f) ? { ok: true, json: async () => J(f) } : { ok: false, status: 404, json: async () => null }); };
  const m = await VM.load({ fetch: fetchLocal }); await m.loadVoters(); const wv = m.voters[OWNER]; const R = VM.bestSplitAll(m, wv);
  const w = await run(OWNER); await new Promise(r => setTimeout(r, 1500)); const d = w.document;
  const per = [...d.querySelectorAll('#votes-grid [data-vpk]')].map(e => Number(T(e).replace(/[^0-9.]/g, ''))).filter(x => isFinite(x));
  const tot = Number(T(d.querySelector('[data-votes="expected"]')).replace(/[^0-9.]/g, ''));
  ok(`will earn ≈ ${tot} = the engine's now ${R.nowUsd.toFixed(2)} = Σ per vote (${per.join(' + ')})`, Math.abs(tot - Math.round(R.nowUsd * 100) / 100) < 0.011 && Math.abs(per.reduce((a, b) => a + b, 0) - tot) <= 0.011 * per.length + 0.01, { per, tot, now: R.nowUsd });
  const best = T(d.querySelector('[data-votes="best"]'));
  ok(`could earn (optimized) ≈ ${R.usd.toFixed(2)} (+${R.gain.toFixed(2)}) shown with a link to the split`, best.includes(PPL.fmt.usd(R.usd).replace('$', '')) && !!d.querySelector('[data-votes="best"] a[href="vote-market.html?view=best"]'), best);
  const bb = [...d.querySelectorAll('[data-best-bucket]')];
  ok(`each bucket card says its best split (${bb.length}): ${bb.map(e => e.getAttribute('data-best-bucket') + ' ' + T(e).slice(0, 40)).join(' | ')}`, bb.length === 4 && VM.BUCKETS.every(b => T(d.querySelector(`[data-best-bucket="${b}"]`)).includes(PPL.fmt.usd(R.buckets[b].usd).replace('$', ''))));
  const links = [...d.querySelectorAll('#votes-grid a[href^="vote-market.html?pool="]')].map(a => decodeURIComponent(a.getAttribute('href').split('pool=')[1]));
  ok(`every vote has a simulate → link keyed bucket|gauge (${links.length}) that the Vote Market knows`, links.length >= 4 && links.every(l => m.pools[l]), links);
  ok('card links the Vote Market simulator', !!d.querySelector('#votes-summary a[href="vote-market.html"]')); }
console.log('— P15 LP positions (3.5): P&L incl. rewards, APR earned, LP since entry (take-rate top-up / amplifier compounding) —');
{ const RYAN = 'terra1ksk66lcvzwaanc47nvn3athj4yzcpay8z8ru04'; const Lr = ledgerOf(RYAN);
  if (!Lr || !Lr.v3) console.log('  (no v3 ledger for the Lion DAO ops wallet in PNL_OUT — P15 skipped)');
  else { const Dr = recOf(Lr, RYAN); const exp = Dr.positions.filter(p => p.deposits || p.withdraws);
    const w = await run(RYAN); const d = w.document; const rows = [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')]; const byRow = (r) => exp[Number(r.getAttribute('data-pp-row'))];
    if (!exp.some(p => p.open_lp)) console.log('  (these ledgers predate pnl-positions 1.1.0 — no open_lp yet; the drag / compounding checks run after the PNL=force build)');
    else { const drag = rows.map(r => [r, byRow(r)]).filter(([, p]) => p.units_open > 0 && p.open_lp && p.open_lp.take_rate && p.open_lp.take_rate.usd > 1);
    ok(`non-amplified open positions show the take rate's drag and the top-up (${drag.length}): ${drag.map(([, p]) => p.name + ' −' + (p.open_lp.take_rate.pct * 100).toFixed(1) + '% · top up ' + PPL.fmt.usd(p.open_lp.take_rate.usd)).join(' · ')}`, drag.length > 0 && drag.every(([r, p]) => T(r).includes('top up ' + PPL.fmt.usd(p.open_lp.take_rate.usd)) && T(r).includes('−' + (p.open_lp.take_rate.pct * 100).toFixed(1) + '% LP')));
    const amp = rows.map(r => [r, byRow(r)]).filter(([, p]) => p.units_open > 0 && !p.moved && p.open_lp && p.open_lp.amp_growth);   /* 3.7: a receipt that left the wallet shows no LP cell */
    ok(`amplified open positions show what compounding added (${amp.length})`, amp.length > 0 && amp.every(([r, p]) => T(r).includes('+' + (p.open_lp.amp_growth.pct * 100).toFixed(1) + '% LP'))); }
    let aprOk = 0, aprN = 0, shortN = 0, shortOk = 0; for (const r of rows) { const p = byRow(r); const S = PPL.posStats2(p, false); if (S.apr == null) continue; const cells = [...r.children].map(T);
      if (S.aprShown != null) { aprN++; if (cells[7].startsWith((S.aprShown * 100).toFixed(1) + '%') && cells[4].includes(PPL.fmt.usd(S.pnl, true))) aprOk++; } else { shortN++; if (cells[7] === '—') shortOk++; } }
    ok(`4.0 rows whose money was in ≥ ${PPL.MIN_APR_DAYS} days show their APR with the result (${aprOk}/${aprN}); shorter ones leave it blank (${shortOk}/${shortN}) — annualising a week reads ±600 %`, aprN > 3 && aprOk === aprN && shortOk === shortN, [aprOk, aprN, shortOk, shortN]);
    const S0 = exp.filter(p => !p.disputed).map(p => PPL.posStats2(p, false)); const pnlAll = S0.reduce((a, x) => a + (x.pnl || 0), 0);
    const bucketSum = [...d.querySelectorAll('[data-pp-bucket]')].map(r => Number(T(r.children[1]).replace(/[^0-9.\-−]/g, '').replace('−', '-'))).reduce((a, b) => a + b, 0);
    ok(`bucket P&L subtotals add to the positions' P&L (${bucketSum.toFixed(0)} vs ${pnlAll.toFixed(0)})`, Math.abs(bucketSum - pnlAll) <= Math.max(2, Math.abs(pnlAll) * 0.002)); } }
console.log('— P16 the all-LPs total (3.5.1) and dust —');
{ const w = await run(OWNER); const d = w.document; const tot = d.querySelector('[data-pp="positions-total"]');
  const exp = R0.positions.filter(p => (p.deposits || p.withdraws) && !p.disputed).map(p => PPL.posStats(p, false));
  const pnl = exp.reduce((a, S) => a + (S.pnl || 0), 0), inn = exp.reduce((a, S) => a + S.inV, 0);
  ok(`a large total under the table: P&L ${PPL.fmt.usd(pnl, true)} · put in ${PPL.fmt.usd(inn)} — the positions summed`, !!tot && T(tot).includes(PPL.fmt.usd(pnl, true)) && T(tot).includes(PPL.fmt.usd(inn)), T(tot));
  const rows = [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')]; const exp2 = R0.positions.filter(p => p.deposits || p.withdraws);
  const dustOpen = rows.filter(r => { const p = exp2[Number(r.getAttribute('data-pp-row'))]; return !r.hasAttribute('data-pp-closed') && p.units_open > 0 && !p.custody && p.open_value_usd != null && p.open_value_usd < 1; });
  ok('no position worth under $1 sits in the open book', dustOpen.length === 0, dustOpen.map(r => T(r).slice(0, 40))); }
console.log('— P17 other Cosmos chains (3.6): linked address per wallet, tokens + staked + rewards to claim, priced by the catalog —');
{ const CA = 'cosmos1examplexxxxxxxxxxxxxxxxxxxxxxxxxxxxx', IA = 'inj1examplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const chain = { cosmoshub: { addr: CA, bank: { balances: [{ denom: 'uatom', amount: '12500000' }, { denom: 'ibc/ABC', amount: '1' }] }, staking: { delegation_responses: [{ balance: { denom: 'uatom', amount: '100000000' } }, { balance: { denom: 'uatom', amount: '50000000' } }] }, rewards: { total: [{ denom: 'uatom', amount: '2250000.5' }] } },
    'cosmos-rest': { addr: CA, bank: { balances: [{ denom: 'uatom', amount: '12500000' }, { denom: 'ibc/ABC', amount: '1' }] }, staking: { delegation_responses: [{ balance: { denom: 'uatom', amount: '100000000' } }, { balance: { denom: 'uatom', amount: '50000000' } }] }, rewards: { total: [{ denom: 'uatom', amount: '2250000.5' }] } },
    injective: { addr: IA, bank: { balances: [{ denom: 'inj', amount: '3000000000000000000' }] }, staking: { delegation_responses: [] }, rewards: { total: [] } } };
  const w = await run(OWNER, { links: { cosmos: CA, inj: IA }, chain }); await new Promise(r => setTimeout(r, 1500)); const host = w.document.getElementById('sibling-chains'); const t = T(host);
  const cat = J(path.join(CORE, 'token-catalog/snapshots/current.json')); const px = (sym) => { const tk = cat.tokens.find(x => ((x.effective && x.effective.symbol) || (x.discovered && x.discovered.symbol)) === sym); return tk && tk.prices && tk.prices.tla ? tk.prices.tla.usd : null; };
  const atomUsd = (12.5 + 150 + 2.25) * px('ATOM');
  ok(`ATOM (linked): 12.5 (shows 13) liquid · 150 staked on 2 validators · +2.25 to claim · ≈ ${PPL.fmt.usd(atomUsd)} at the catalog's ATOM price; the other token counted`, /13 liquid/.test(t) && t.includes(PPL.fmt.usd(atomUsd)) && /150 staked/.test(t) && /2 vals/.test(t) && /\+2\.25 to claim/.test(t) && /\+1 other token/.test(t), t.slice(0, 400));
  ok('Injective (link-only, 18 decimals): 3 INJ read and priced', /INJ/.test(t) && /3\.00 liquid/.test(t), t.slice(0, 400));
  const w2 = await run('terra1ksk66lcvzwaanc47nvn3athj4yzcpay8z8ru04', { chain }); await new Promise(r => setTimeout(r, 1200));
  ok('links are per wallet: another wallet does not inherit this wallet\'s cosmos1… link', !/13 liquid/.test(T(w2.document.getElementById('sibling-chains')))); }
console.log('— P18 trust (3.7): the ledger\'s open lots checked against the chain read — receipts that left the wallet —');
{ const moved = R0.positions.filter(p => p.moved); const byName = (n, mech) => moved.find(p => p.name === n && p.mechanism === mech);
  const ampHeld = R0.positions.find(p => p.name === 'ampCAPA' && p.mechanism === 'amplified' && p.held_in);   /* pnl 1.2.4 builds follow the receipt into the DAO */
  ok(`owner: wBTC.osmo-wBTC.axl (amp, receipt sent to another address 2026-03-06) is no longer in the wallet per the chain read; ampCAPA (receipt staked in the DAO) ${ampHeld ? 'is held in ' + ampHeld.held_in.where + ' (the build followed it)' : 'too'} — ${moved.length} flagged (${moved.map(p => p.name + ' ' + PPL.fmt.usd(p.moved.ledger_usd)).join(', ')})`, !!byName('wBTC.osmo-wBTC.axl', 'amplified') && (ampHeld ? !byName('ampCAPA', 'amplified') : !!byName('ampCAPA', 'amplified')) && moved.every(p => p.moved.ledger_usd >= 1));
  const t0 = L0.v3.totals.open, t1 = RB.totals.open; const mv = moved.filter(p => !p.moved.built_out).reduce((a, p) => a + p.open_value_usd, 0);   /* a build with not_held (pnl 1.2.3) already left them out */
  ok(`Open now drops by exactly what moved out: ${PPL.fmt.usd(t0.value_usd)} − ${PPL.fmt.usd(mv)} = ${PPL.fmt.usd(t1.value_usd)}; net moves by the same lots' unrealized`, Math.abs(t0.value_usd - mv - t1.value_usd) < 0.01 && Math.abs((L0.v3.totals.net_usd - RB.totals.net_usd) - moved.filter(p => !p.moved.built_out).reduce((a, p) => a + (p.open_value_usd - (p.open_cost_usd || 0)), 0)) < 0.01);
  const w = await run(OWNER); const d = w.document; const tab = T(d.getElementById('pp-positions'));
  const rowOf = (n) => [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')].find(r => T(r).startsWith(n) && /amp /.test(T(r)));
  const movedNames = moved.map(p => p.name);
  ok(`the moved row${movedNames.length === 1 ? '' : 's'} say "⚠ not in this wallet" and "moved out · not counted"${ampHeld ? '; ampCAPA reads "in the ampCAPA DAO", never moved' : ''}`, movedNames.every(n => { const r = rowOf(n); return r && /not in this wallet/.test(T(r)) && /moved out/.test(T(r)) && /not counted/.test(T(r)); }) && (!ampHeld || (/in the ampCAPA DAO/.test(T(rowOf('ampCAPA'))) && !/moved out/.test(T(rowOf('ampCAPA'))))), movedNames.concat(['ampCAPA']).map(n => T(rowOf(n)).slice(0, 160)));
  const wbRow = rowOf('wBTC.osmo-wBTC.axl'); const wbPos = R0.positions.find(p => p.name === 'wBTC.osmo-wBTC.axl' && p.mechanism === 'amplified');
  if (wbPos.moves) ok(`3.8 the moved row says where: "sent to …${wbPos.moves[0].to.slice(-4)} on ${wbPos.moves[0].last_day}" with an address link and the tx`, /sent to/.test(T(wbRow)) && T(wbRow).includes(wbPos.moves[0].last_day) && !!wbRow.querySelector('a[href="https://chainsco.pe/terra2/address/' + wbPos.moves[0].to + '"]') && !!wbRow.querySelector('a[href^="https://chainsco.pe/terra2/tx/"]'), T(wbRow).slice(0, 300));
  else console.log('  (this build predates pnl 1.2.4 — no moves[]; the "sent to" check runs on the new build)');
  const flag = T(d.querySelector('[data-pp="flags"]'));
  ok(`the hero says ${moved.length} LP position(s) were sent to another address (${PPL.fmt.usd(R0.reconciled.moved_usd)} left out)`, flag.includes(moved.length + ' LP position') && /sent to another address/.test(flag) && flag.includes(PPL.fmt.usd(R0.reconciled.moved_usd)), flag);
  const tot = T(d.querySelector('[data-pp="positions-total"]')); const openNow = R0.positions.filter(p => !p.disputed).map(p => PPL.posStats(p, false)).reduce((a, S) => a + (S.open ? S.openV : 0), 0);
  ok(`the all-LPs "Open now" = ${PPL.fmt.usd(openNow)} (nothing moved out counted)`, tot.includes(PPL.fmt.usd(openNow)), tot); }

console.log('— P19 custody (3.7): the ampCAPA receipt staked in the DAO counts at its live value —');
{ const cs = J(path.join(CORE, 'token-catalog/supply/capa/wallets.json')); const me = (cs.wallets || cs.rows || Object.values(cs).find(Array.isArray) || []).find(x => x.address === OWNER);
  const power = me.raw.dao_power, rate = cs.rates.compounder_ampcapa_per_receipt; const cat = J(path.join(CORE, 'token-catalog/snapshots/current.json'));
  const AD = 'factory/terra186rpfczl7l2kugdsqqedegl4es4hp624phfc7ddy8my02a4e8lgq5rlx7y/ampCAPA'; const tk = cat.tokens.find(x => x.denom === AD); const px = tk.prices.tla && tk.prices.tla.usd || tk.prices.coingecko.usd;
  const liveUsd = power * rate * px;
  const smart = { terra1juj3ymejnug9p92upphcq0prq4e0hpw6rcu20njf8tk7n9sl2wxqldr0mt: (q) => q.staked_balance_at_height ? { balance: String(Math.round(power * 1e6)), height: 1 } : undefined,
    terra1zly98gvcec54m3caxlqexce7rus6rzgplz7eketsdz7nh750h2rqvu8uzx: (q) => q.exchange_rates ? [{ exchange_rates: [[205, { exchange_rate: String(rate) }]] }] : undefined };
  const w = await run(OWNER, { smart }); const d = w.document; for (let i = 0; i < 20 && !d.querySelector('[data-pp="custody"]'); i++) await new Promise(r => setTimeout(r, 250));
  const lu = null; const Rc = recOf(L0, OWNER, [{ pool: 'native:' + AD, mech: 'amplified', usd: liveUsd, luna: null, where: 'the ampCAPA DAO' }]);
  const pc = Rc.positions.find(p => p.custody); const row = [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')].find(r => /^ampCAPA/.test(T(r)) && /in the ampCAPA DAO/.test(T(r)));
  ok(`DAO stake ${power.toLocaleString('en-US')} receipts × ${rate.toFixed(4)} ampCAPA × $${px.toPrecision(3)} = ${PPL.fmt.usd(liveUsd)} (the capa-supply product reads ${PPL.fmt.usd(me.capa_equiv.receipt_dao * cat.tokens.find(x => x.denom === 'terra1t4p3u8khpd7f8qzurwyafxt648dya6mp6vur3vaapswt6m24gkuqrfdhar').prices.tla.usd)}) — the ampCAPA row: "in the ampCAPA DAO", Open now at the live value, not "moved"`, row && T(row).includes(PPL.fmt.usd(liveUsd)) && !/moved out/.test(T(row)), row ? T(row).slice(0, 200) : 'no custody row');
  const info = T(d.querySelector('[data-pp="custody"]'));
  ok(`the hero explains it: staked in the ampCAPA DAO, ${PPL.fmt.usd(pc.custody.untracked_usd)} of it with no cost basis kept out of the P&L`, /ampCAPA DAO/.test(info) && info.includes(PPL.fmt.usd(pc.custody.untracked_usd)) && /no cost basis/.test(info), info);
  const lpC = Rc.totals.realized.delta_usd + Rc.totals.open.unrealized_usd + Rc.totals.rewards.claims_usd;
  ok(`the LP source = ${money(lpC)}: the ledger's own lots stay in the P&L, the untracked part does not`, T(d.querySelector('[data-pp="src-lp"] > div:last-child')) === money(lpC) && Math.abs(Rc.totals.open.value_usd - (RB.totals.open.value_usd - (pc.moved || !pc.held_in ? 0 : (pc.open_value_usd || 0)) + liveUsd)) < 0.02,   /* a held_in build already counts the ledger's lots: the live value replaces them */ [T(d.querySelector('[data-pp="src-lp"]')), Rc.totals.open.value_usd]); }

console.log('— P20 idle LP (3.7): LP tokens in the wallet, not staked in TLA — warned and valued —');
{ const snap = J(path.join(CORE, 'member-data/tla-snapshot/current.json'));
  const nat = snap.pools.find(p => !p.is_single && /^native:.*\/uLP$/.test(p.gauge_pool_id) && p.lp_health && Number(p.lp_health.total_share) > 0);
  const cw = snap.pools.find(p => !p.is_single && /^cw20:/.test(p.gauge_pool_id) && p.lp_health && Number(p.lp_health.total_share) > 0);
  const per = (p) => Number(p.lp_health.total_pool_usd) / Number(p.lp_health.total_share); const natRaw = 5e6, cwRaw = 2e6;
  const bank = [{ denom: 'uluna', amount: '186000000' }, { denom: nat.gauge_pool_id.slice(7), amount: String(natRaw) }, { denom: 'factory/terra1zly98gvcec54m3caxlqexce7rus6rzgplz7eketsdz7nh750h2rqvu8uzx/44/single/amplp', amount: '1000000' }];
  const w = await run(OWNER, { bank, cw20: { [cw.gauge_pool_id.slice(5)]: String(cwRaw) } }); await new Promise(r => setTimeout(r, 2500)); const el = w.document.getElementById('balances-table'); const idle = T(el.querySelector('[data-idle-lp]'));
  const want = natRaw * per(nat) + cwRaw * per(cw);
  ok(`${nat.name} (bank uLP) and ${cw.name} (cw20 LP) sitting in the wallet → the warning names both, says no TLA rewards, values them at the pool's USD per share (${PPL.fmt.usd(want)})`, idle.includes(nat.name) && idle.includes(cw.name) && /no TLA rewards/.test(idle) && /not staked in TLA/.test(idle) && idle.includes(f$(want)), idle.slice(0, 400));
  const txt = T(el);
  ok('an amplified receipt in the wallet is NOT idle: noted as in TLA, not listed as an unpriced token', /amplified receipt/.test(txt) && !/\bamplp\b/.test(T(el.querySelector('details') || { textContent: '' })), txt.slice(-300)); }

console.log('— P21 APR honesty (3.7): no APR where a trip had no price —');
{ const amp = R0.positions.find(p => p.name === 'ampCAPA' && p.mechanism === 'amplified'); const S = PPL.posStats(amp, false);
  ok(`ampCAPA amp: ${amp.trips.filter(t => t.in_usd == null).length} of ${amp.trips.length} trips unpriced → APR blank (was inflated: rewards over part of the capital)`, amp.trips.some(t => t.in_usd == null) && S.apr == null);
  const all = R0.positions.filter(p => (p.deposits || p.withdraws) && !p.disputed).map(p => PPL.posStats2(p, false));
  const inn = all.reduce((a, S) => a + (S.unpriced ? 0 : S.inV), 0), pnl = all.reduce((a, S) => a + (S.pnl || 0), 0); const cap = all.reduce((a, S) => a + (S.aprShown != null ? S.capDays : 0), 0), pA = all.reduce((a, S) => a + (S.aprShown != null ? S.pnl : 0), 0);
  const w = await run(OWNER); const ret = T(w.document.querySelector('[data-pp="pp-total-return"]'));
  const pct = (v) => (v < 0 ? '−' : '+') + (Math.abs(v) * 100).toFixed(1) + '%';
  ok(`4.0 the scorecard's Return = result ÷ what went in (${pct(pnl / inn)}); its annualised figure covers only the positions in ≥ ${PPL.MIN_APR_DAYS} days (${pct(pA / cap * 365)})`, ret.includes(pct(pnl / inn)) && ret.includes(pct(pA / cap * 365)), ret); }
console.log('— P22 staked in a DAO (3.8): its own panel in LP positions, from the feed at once — never "No LP positions" —');
const CAPA_PX = J(path.join(CORE, 'network-and-prices/current.json')).token_prices.CAPA.final_price_usd;
const CS = J(path.join(CORE, 'token-catalog/supply/capa/wallets.json')); const OWN_CS = CS.rows.find(r => r.address === OWNER);
const FEED_CU = { key: 'ampcapa-dao', where: 'the ampCAPA DAO', custodian: 'terra1juj3ymejnug9p92upphcq0prq4e0hpw6rcu20njf8tk7n9sl2wxqldr0mt', pool: 'native:factory/terra186rpfczl7l2kugdsqqedegl4es4hp624phfc7ddy8my02a4e8lgq5rlx7y/ampCAPA', mechanism: 'amplified', amount: OWN_CS.capa_equiv.receipt_dao, unit: 'CAPA', usd: OWN_CS.capa_equiv.receipt_dao * CAPA_PX, as_of: CS.capturedAt };
const asEngine12 = { wallet: OWNER, fn: (m) => { m.custody = [FEED_CU]; m.summary.custody_usd = FEED_CU.usd; m.summary.total_includes_custody = true; m.summary.total_portfolio_value_usd += FEED_CU.usd; } };
{ const w = await run(OWNER, { patchMember: asEngine12 }); const d = w.document; await new Promise(r => setTimeout(r, 600)); const lp = d.getElementById('lp-table'); const panel = lp.querySelector('[data-custody-panel]');
  ok(`the owner has no wallet LPs, yet the card shows the DAO panel: ampCAPA in the ampCAPA DAO ${f$(FEED_CU.usd)} (${Math.round(FEED_CU.amount).toLocaleString('en-US')} CAPA, snapshot until the live read) — no "No LP positions"`, panel && /STAKED IN A DAO/.test(T(panel)) && /ampCAPA/.test(T(panel)) && T(panel).includes(f$(FEED_CU.usd)) && /snapshot/.test(T(panel)) && !/No LP positions/.test(T(lp)), T(lp).slice(0, 300));
  ok('the panel is apart from wallet LPs: not a table row', !lp.querySelector('tr [data-custody]') && !lp.querySelector('[data-ampcapa-gov]'));
  const tile = T(d.getElementById('tile-lp')); const lpBase = PART.members.find(x => x.wallet === OWNER).summary.total_lp_position_usd || 0;
  ok(`the LP tile carries it: ${f$(lpBase + FEED_CU.usd)} ("+ in a DAO")`, tile.includes(f$(lpBase + FEED_CU.usd)) && /in a DAO/.test(T(d.getElementById('tile-lp-sub'))), [tile, T(d.getElementById('tile-lp-sub'))]); }

console.log('— P23 never added twice (3.8): feed total already holds custody + the live read lands with a newer figure —');
{ const cs = CS; const power = OWN_CS.raw.dao_power, rate = cs.rates.compounder_ampcapa_per_receipt; const cat = J(path.join(CORE, 'token-catalog/snapshots/current.json'));
  const AD = 'factory/terra186rpfczl7l2kugdsqqedegl4es4hp624phfc7ddy8my02a4e8lgq5rlx7y/ampCAPA'; const tk = cat.tokens.find(x => x.denom === AD); const px = tk.prices.tla && tk.prices.tla.usd || tk.prices.coingecko.usd; const liveUsd = power * rate * px;
  const smart = { terra1juj3ymejnug9p92upphcq0prq4e0hpw6rcu20njf8tk7n9sl2wxqldr0mt: (q) => q.staked_balance_at_height ? { balance: String(Math.round(power * 1e6)), height: 1 } : undefined,
    terra1zly98gvcec54m3caxlqexce7rus6rzgplz7eketsdz7nh750h2rqvu8uzx: (q) => q.exchange_rates ? [{ exchange_rates: [[205, { exchange_rate: String(rate) }]] }] : undefined };
  const w = await run(OWNER, { patchMember: asEngine12, smart }); const d = w.document; for (let i = 0; i < 20 && !/live/.test(T(d.querySelector('[data-custody-panel]'))); i++) await new Promise(r => setTimeout(r, 250));
  const panel = T(d.querySelector('[data-custody-panel]'));
  ok(`the live read replaces the snapshot row: ${f$(liveUsd)} live (was ${f$(FEED_CU.usd)}), one row`, panel.includes(f$(liveUsd)) && /live/.test(panel) && d.querySelectorAll('[data-custody]').length === 1, panel.slice(0, 300));
  const m = PART.members.find(x => x.wallet === OWNER); const feedTotal = m.summary.total_portfolio_value_usd + FEED_CU.usd; const want = feedTotal - FEED_CU.usd + liveUsd;
  const story = T(d.getElementById('story-card')); const tile = T(d.getElementById('tile-lp'));
  ok(`LP tile = LP + the live DAO stake once (${f$((m.summary.total_lp_position_usd || 0) + liveUsd)}), not + snapshot + live`, tile.includes(f$((m.summary.total_lp_position_usd || 0) + liveUsd)), tile); }

console.log('— P24 past days carry the DAO stake (3.8): archive days before capture-engine 1.2 get it from the CAPA supply history × CAPA that day —');
{ const days = fs.readdirSync(path.join(CORE, 'member-data/positions/daily')).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort(); const day = days[days.length - 2].slice(0, 10);
  const arch = J(path.join(CORE, 'member-data/positions/daily', day + '.json')).members.find(x => x.wallet === OWNER);
  const ix = J(path.join(CORE, 'token-catalog/supply/capa/wallets-daily/index.json')); const src = ix.days.map(x => x.date).filter(x => x <= day).sort().pop();
  const capa = J(path.join(CORE, 'token-catalog/supply/capa/wallets-daily', src + '.json')).rows[OWNER][1]; const cpx = J(path.join(CORE, 'price-history/series/CAPA.json')).daily[day];
  const want = arch.summary.total_portfolio_value_usd + capa * cpx;
  const w = await run(OWNER); const d = w.document; for (let i = 0; i < 30 && !(w.__mpStore._chartData); i++) await new Promise(r => setTimeout(r, 250));
  const row = (w.__mpStore._chartData ? w.__mpStore._chartData.rows : []).find(r => r.d === day);
  ok(`${day}: archive ${f$(arch.summary.total_portfolio_value_usd)} + ${Math.round(capa).toLocaleString('en-US')} CAPA in the DAO (supply history ${src}) × $${cpx.toPrecision(4)} = ${f$(want)} on the chart (history series, DAO stake once)`, row && Math.abs(row.p - want) / want < 0.005, row && [row.p, row.cu, row.cuS]);
  const chips = T(d.getElementById('banner-chips'));
  ok(`the 1d / 7d / 30d change chips compare like with like (no ≈${f$(capa * cpx)} jump from the DAO stake appearing)`, !chips.includes('+' + f$(capa * cpx).slice(0, 4)), chips); }

console.log('— P25 other Cosmos addresses from the wallet\'s own IBC transfers (3.8) —');
{ const OS = 'osmo1' + 'q'.repeat(33) + 'xyz2s', CO = 'cosmos1' + 'p'.repeat(33) + 'ac34x', CT = 'osmo1' + 'z'.repeat(54) + 'cntrs';   /* valid bech32 characters only (no 1 b i o) */
  const txs = (u) => { if (/MsgTransfer/.test(u)) return { txs: [{ body: { messages: [{ '@type': '/ibc.applications.transfer.v1.MsgTransfer', sender: OWNER, receiver: OS }, { '@type': '/ibc.applications.transfer.v1.MsgTransfer', sender: OWNER, receiver: CT }] } }, { body: { messages: [{ '@type': '/ibc.applications.transfer.v1.MsgTransfer', sender: OWNER, receiver: OS }] } }], tx_responses: [{ timestamp: '2026-05-01T00:00:00Z' }, { timestamp: '2026-06-02T00:00:00Z' }] };
    if (/fungible_token_packet\.receiver/.test(u)) return { tx_responses: [{ timestamp: '2026-04-01T00:00:00Z', events: [{ type: 'recv_packet', attributes: [{ key: 'packet_data', value: JSON.stringify({ sender: CO, receiver: OWNER, denom: 'uatom', amount: '1' }) }] }] }] }; return null; };
  const w = await run(OWNER, { txs }); const d = w.document; for (let i = 0; i < 20 && !d.querySelector('[data-ibc-suggest]'); i++) await new Promise(r => setTimeout(r, 250)); const sg = d.querySelector('[data-ibc-suggest]'); const t = T(sg);
  ok(`suggests OSMO ${OS.slice(0, 10)}… (you sent to it 2×, last 2026-06-02) and ATOM ${CO.slice(0, 10)}… (it sent to you 1×); the osmo contract address is dropped`, sg && /OSMO/.test(t) && /you sent to it 2×/.test(t) && /last 2026-06-02/.test(t) && /ATOM/.test(t) && /it sent to you 1×/.test(t) && !t.includes('zzzzz'), t);
  sg.querySelectorAll('button')[0].click(); await new Promise(r => setTimeout(r, 400));
  ok('"use this" links it for this wallet (the card then reads that address)', w.localStorage.getItem('mp_link:' + OWNER + ':osmo') === OS); }
console.log('— P26 THE chart (4.0): the history series, every view, the live "now", LUNA strip, table view —');
{ const w = await run(OWNER); const d = w.document; for (let i = 0; i < 30 && !(w.__mpStore._chartData); i++) await new Promise(r => setTimeout(r, 250));
  const CD = w.__mpStore._chartData; const PC = w.PortfolioChart; const sh = OVERLAY && fs.existsSync(path.join(OVERLAY, 'member-data/history/series/h.json')) ? J(path.join(OVERLAY, 'member-data/history/series/h.json')) : null;
  const shMain = !sh && fs.existsSync(path.join(CORE, 'member-data/history/series/h.json')) ? J(path.join(CORE, 'member-data/history/series/h.json')) : null;
  const want = (sh || shMain) ? (sh || shMain).wallets[OWNER].length : null;
  if (!want) { console.log('  (no history series in OVERLAY_DIR or on main yet — the page falls back to sampled archive days; P26 runs once member-data 1.5.0 has seeded it)'); } else {
  ok(`the chart reads the owner's whole daily history (${CD && CD.rows.length} days = the series file's ${want}), not 17 samples`, CD && want && CD.rows.length === want, CD && CD.rows.length);
  const S = PC.seriesFor(CD, { view: 'net', range: 0, lens: 'usd' }); const last = (k) => { const s = S.series.find(x => x.key === k); return s ? s.pts[s.pts.length - 1][1] : null; };
  const m = w.__mpStore.members.get(OWNER);
  ok(`net worth view stacks ${S.series.map(s => s.key).join(' + ')}; the last point is "now" (live Votion ${f$(w.__mpStore._votionUsd || 0)}, locks at live prices)`, S.kind === 'stack' && S.series.length >= 4 && Math.abs(last('vt') - (w.__mpStore._votionUsd || 0)) < 0.01, S.series.map(s => s.key));
  const L = PC.seriesFor(CD, { view: 'locks', range: 0, lens: 'luna' }); const r0 = CD.rows[CD.rows.length - 2];
  ok(`LUNA lens on locks: LUNA at that day's hub rates (${fmtN(r0.lkL)}) and LUNA stamped at lock (${fmtN(r0.fx)}) — no dollars`, L.series.length === 2 && L.series[0].pts.some(p => Math.abs(p[1] - r0.lkL) < 0.01) && L.unit === 'luna');
  const V = PC.seriesFor(CD, { view: 'vp', range: 30, lens: 'usd' }); ok(`VP view: VP now vs VP if re-touched, in VP (the gap is the decay) · 30D = ${V.series[0].pts.length} points`, V.unit === 'vp' && V.series.map(s => s.key).join() === 'vp,pvp' && V.series[0].pts.length <= 31);
  ok(`one axis per chart: the LUNA price is its own strip under it (${S.lunaStrip.length} days), never a second y-scale on the value chart`, S.lunaStrip.length > 30 && PC.buildOption(S, {}).yAxis.length === 2 && PC.buildOption(S, {}).grid.length === 2);
  const act = CD.activity.filter(a => a.dep || a.wdr); const LP = PC.seriesFor(CD, { view: 'lp', range: 0, lens: 'usd' });
  ok(`deposit / withdraw markers on the LP view: ${LP.markers.length} of ${act.length} active epochs pinned on the line`, LP.markers.length > 20 && LP.markers.length <= act.length, [LP.markers.length, act.length]);
  d.querySelector('#trend-card-body [data-pc-table]').click(); await new Promise(r => setTimeout(r, 50));
  ok('the Table view lists every value (the chart library is not needed to read the numbers)', d.querySelectorAll('#trend-card-body tbody tr').length >= 30, d.querySelectorAll('#trend-card-body tbody tr').length); } }

console.log('— P27 net worth (4.0): everything, once; NFTs = backing unless you ask for floor (never both); the ranked list has the same total —');
{ const bank = [{ denom: 'uluna', amount: '412000000' }];
  const lcd = (u) => /delegators\/.*\/unbonding_delegations/.test(u) ? { unbonding_responses: [] } : /\/staking\/v1beta1\/delegations\//.test(u) && u.includes(OWNER) ? { delegation_responses: [{ balance: { denom: 'uluna', amount: '2500000000' } }] } : /\/distribution\/v1beta1\/delegators\/.*\/rewards/.test(u) && u.includes(OWNER) ? { total: [{ denom: 'uluna', amount: '4660000' }] } : undefined;
  const w = await run(OWNER, { bank, lcd }); const d = w.document; for (let i = 0; i < 40 && !(w.__mpStore._nft && w.__mpStore._staked && w.__mpStore._liquid); i++) await new Promise(r => setTimeout(r, 250));
  const st = w.__mpStore; const m = st.members.get(OWNER);
  const sum = (x) => [...d.querySelectorAll('#networth-banner button span.mono')].map(e => T(e)); const grand = T(d.getElementById('banner-grand'));
  const nf = st._nft; const orgNft = J(path.join(NFTC, 'adao/snapshots/summary.json')); const per = orgNft.backing.per_nft_value_usd;
  ok(`aDAO NFTs count at their backing by default: ${nf.unbroken} unbroken × ${f$(per)} = ${f$(nf.unbroken * per)} (broken ones carry none)`, Math.abs(nf.backingUsd - nf.unbroken * per) < 0.01 && /aDAO NFT backing/.test(T(d.getElementById('networth-banner'))) && !/NFTs at floor\s+\$/.test(T(d.querySelector('#networth-banner .grid'))), T(d.querySelector('#networth-banner .grid')));
  ok(`liquid tokens (live bank read 412 LUNA) and LUNA staked (2,500) are in net worth`, /Liquid tokens/.test(T(d.getElementById('networth-banner'))) && /LUNA staked/.test(T(d.getElementById('networth-banner'))) && st._staked.luna === 2500);
  const itemsSum = [...d.querySelectorAll('#networth-banner .grid button')].map(b => T(b.querySelector('span.mono'))).map(x => Number(x.replace(/[$,]/g, '').replace(/K$/, 'e3').replace(/M$/, 'e6')) * (/K$/.test(x) ? 1 : 1));
  const N = (x) => { const k = /K$/.test(x) ? 1e3 : /M$/.test(x) ? 1e6 : 1; return Number(x.replace(/[$,KM]/g, '')) * k; };
  ok(`the banner total = the sum of its parts (${grand}); the ranked list says the same total`, Math.abs(N(grand) - [...d.querySelectorAll('#networth-banner .grid button span.mono')].map(e => N(T(e))).reduce((a, b) => a + b, 0)) <= N(grand) * 0.01 + 1 && T(d.getElementById('ladder-total')).includes(grand), [grand, T(d.getElementById('ladder-total'))]);
  d.querySelector('#networth-banner input[type=checkbox]').click(); await new Promise(r => setTimeout(r, 50));
  ok(`"Count NFTs at floor price": the backing leaves, the floor value (${f$(nf.floorUsd)}) comes in — never both`, /NFTs at floor/.test(T(d.getElementById('networth-banner'))) && !/aDAO NFT backing/.test(T(d.querySelector('#networth-banner .grid'))) && /Phoenix/.test(T(d.getElementById('ladder'))), T(d.querySelector('#networth-banner .grid')));
  const tile = T(d.getElementById('tile-clm')), tsub = T(d.getElementById('tile-clm-sub'));
  ok(`Claimable now adds every place: TLA rewards + LUNA staking rewards (4.66 LUNA) — ${tile}; bribes accruing shown apart`, /LUNA staking/.test(tsub) && st._staked.pendingLuna > 4.6, tsub);
  ok(`the VP tile says the LUNA behind the VP (${fmtN(m.summary.total_locked_luna_equivalent)} LUNA) and the decay %`, T(d.getElementById('tile-vp-sub')).includes(fmtN(m.summary.total_locked_luna_equivalent)) && /decayed/.test(T(d.getElementById('tile-vp-sub'))), T(d.getElementById('tile-vp-sub'))); }

console.log('— P28 locks (4.0): age, LUNA behind each, decay %, listed locks; the lock P&L from the wallet\'s own lock history —');
{ const bw = J(path.join(NFTC, 'tla-locks/ledger/by-wallet', OWNER.slice(-1) + '.json')).wallets[OWNER]; const ev = bw.events;
  const w = await run(OWNER); const d = w.document; for (let i = 0; i < 30 && !(w.__mpStore._lockLeg); i++) await new Promise(r => setTimeout(r, 250));
  const leg = w.__mpStore._lockLeg; const K = leg.totals;
  const allIn = ev.filter(e => (e.kind === 'lock_create' || e.kind === 'lock_add') && e.usd != null).reduce((a, e) => a + e.usd, 0), wdIn = K.in_usd - leg.held.reduce((a, h) => a + h.cost_usd, 0);
  ok(`every dollar that went into a lock is accounted for once: held ${f$(leg.held.reduce((a, h) => a + h.cost_usd, 0))} + withdrawn ${f$(wdIn)} + sent away ${f$(K.sent.usd)} + gone ${f$(K.gone.usd)} = the ${ev.filter(e => e.kind === 'lock_create' || e.kind === 'lock_add').length} creates / adds (${f$(allIn)})`, Math.abs(leg.held.reduce((a, h) => a + h.cost_usd, 0) + wdIn + K.sent.usd + K.gone.usd - allIn) < 0.05);
  ok(`the lock P&L is its own identity: now ${f$(K.now_usd)} + out ${f$(K.out_usd)} − in ${f$(K.in_usd)} = ${f$(K.pnl_usd)} = LUNA’s price ${f$(K.market_usd)} + LST staking ${f$(K.staking_usd)}`, Math.abs(K.now_usd + K.out_usd - K.in_usd - K.pnl_usd) < 0.01 && Math.abs(K.market_usd + K.staking_usd - K.pnl_usd) < 0.05);
  const r118 = d.querySelector('#locks-table tr[data-lock="118"]'); const L118 = w.__mpStore.members.get(OWNER).locks.find(l => l.token_id === '118'); const days118 = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse('2024-09-01')) / 864e5);
  ok(`lock #118: age ${days118} d (its oldest merged lock was created 2024-09-01), ${fmtN(L118.projection.underlying_now_human)} LUNA behind it, ${L118.projection.potential_vp_gain_pct.toFixed(1)}% decayed`, r118 && T(r118).includes(days118.toLocaleString() + ' d') && T(r118).includes(fmtN(L118.projection.underlying_now_human) + ' LUNA') && T(r118).includes(L118.projection.potential_vp_gain_pct.toFixed(1) + '% decayed'), T(r118));
  const listed = bw.holdings_now.tokens.filter(t => /^listed/.test(t.state)); ok(`${listed.length} listed locks (#${listed.map(t => t.token_id).join(', #')}) show as listed with 0 VP`, listed.every(t => { const r = d.querySelector('#locks-table tr[data-lock="' + t.token_id + '"]'); return r && /listed/.test(T(r)); }));
  ok(`the identity bar: ${Math.round((Date.now() - Date.parse('2024-09-02')) / 864e5)} days in TLA, the oldest lock, VP with its LUNA`, /days in TLA/.test(T(d.getElementById('id-stats'))) && /oldest lock/.test(T(d.getElementById('id-stats'))) && /LUNA behind it/.test(T(d.getElementById('id-stats'))), T(d.getElementById('id-stats'))); }

console.log('— P29 How you\'ve done, combined (4.0): each source switches off and the net follows —');
{ const w = await run(OWNER); const d = w.document; for (let i = 0; i < 30 && !d.querySelector('[data-pp="src-locks"]'); i++) await new Promise(r => setTimeout(r, 250));
  const G0 = w.__mpStore._doneTotals; const F = G0.sources; const before = G0.net_usd;
  ok(`sources on: ${['lp', 'locks', 'votion', 'nfts'].filter(k => F[k]).join(', ')} · Locks & bribes = the lock P&L ${f$(F.locks.lock_usd)} + the ledger's bribes ${f$(F.locks.bribes_usd)} (${f$(ledgerOf(OWNER).v3.totals.rewards.bribes_usd)})`, F.lp && F.locks && Math.abs(F.locks.bribes_usd - ledgerOf(OWNER).v3.totals.rewards.bribes_usd) < 0.01);
  d.querySelector('[data-pp-src="nfts"]').click(); await new Promise(r => setTimeout(r, 50));
  const after = T(d.querySelector('[data-pp="net-all"]'));
  ok(`NFTs switched off → the net drops the NFT figure exactly (${money(before - F.nfts.usd)})`, after === money(before - F.nfts.usd) && /line-through/.test(d.querySelector('[data-pp-src="nfts"]').getAttribute('style')), after);
  ok('Credia and Solid say "soon" and cannot be switched on (no P&L history yet)', d.querySelector('[data-pp-src="solid"]').disabled && /soon/.test(T(d.querySelector('[data-pp-src="solid"]')))); }

console.log('— P30 alerts (4.0): chips beside the name; decay > 5 %, votes, unstaking NFTs / DAO tokens, LUNA unbonding, authz grants —');
{ const b64 = (u) => { const m = u.match(/\/smart\/([^/?]+)/); try { return JSON.parse(Buffer.from(m[1], 'base64').toString()); } catch (e) { return null; } };
  const soon = String(BigInt(Date.now() + 5 * 864e5) * 1000000n);
  const lcd = (u) => { if (u.includes('terra1c57ur376szdv8rtes6sa9nst4k536dynunksu8tx5zu4z5u3am6qmvqx47/smart/')) { const q = b64(u); return q && q.nft_claims ? { nft_claims: [{ token_id: '4242', release_at: { at_time: soon } }, { token_id: '777', release_at: { at_time: soon } }] } : undefined; }
    if (/authz\/v1beta1\/grants\/granter\//.test(u)) return { grants: [{ grantee: 'terra1' + 'x'.repeat(38), authorization: { '@type': '/cosmos.authz.v1beta1.GenericAuthorization', msg: '/cosmwasm.wasm.v1.MsgExecuteContract' } }] };
    if (/unbonding_delegations/.test(u)) return { unbonding_responses: [{ entries: [{ balance: '150000000', completion_time: new Date(Date.now() + 9 * 864e5).toISOString() }] }] };
    if (/pfpk\.daodao\.zone\/bech32\//.test(u)) return { name: 'DeFi_Patriot', nft: { imageUrl: 'ipfs://QmTestImage' } }; return undefined; };
  const w = await run(OWNER, { lcd }); const d = w.document; for (let i = 0; i < 30 && !d.querySelector('[data-alert="authz"]'); i++) await new Promise(r => setTimeout(r, 250));
  const m = w.__mpStore.members.get(OWNER); const dec = m.locks.filter(l => l.projection && l.projection.potential_vp_gain_pct > 5);
  ok(`lock decay > 5 %: ${dec.map(l => '#' + l.token_id + ' −' + l.projection.potential_vp_gain_pct.toFixed(1) + '%').join(', ')} named`, dec.length && dec.every(l => T(d.getElementById('alerts')).includes('#' + l.token_id + ' ' + l.asset_symbol + ' −' + l.projection.potential_vp_gain_pct.toFixed(1) + '%')), T(d.getElementById('alerts')).slice(0, 200));
  ok('2 aDAO NFTs unstaking from the aDAO DAO (live nft_claims) → a warning naming them, "Not you?"', /2 aDAO NFTs unstaking/.test(T(d.getElementById('alerts'))) && /#4242/.test(T(d.getElementById('alerts'))) && /Not you\?/.test(T(d.getElementById('alerts'))));
  ok('an authz grant to another address → a warning with the grantee and what it may do', /permission granted to 1 other address/.test(T(d.querySelector('[data-alert="authz"]'))) && /MsgExecuteContract/.test(T(d.querySelector('[data-alert="authz"]'))));
  ok('150 LUNA unbonding from validators → when it is back', /150 LUNA unbonding/.test(T(d.getElementById('alerts'))) && /in 9 days/.test(T(d.getElementById('alerts'))));
  const chips = T(d.getElementById('id-alert-chips')); ok(`chips in the identity bar count them (${chips}) and the panel opens itself when something is amber`, /warning/.test(chips) && !d.getElementById('alerts-wrap').classList.contains('hidden'), chips);
  ok('the DAODAO profile picture is read live (pfpk) and shown ahead of the feed\u2019s copy', d.getElementById('id-pfp').src.includes('ipfs.io/ipfs/QmTestImage') && !d.getElementById('id-pfp').classList.contains('hidden'), d.getElementById('id-pfp').src); }

console.log('— P31 the Tokens lens (4.0, pnl-positions 1.4.0) and unpriced rows —');
{ const L = ledgerOf(OWNER); const hasTok = L.v3.trip_cols.includes('tok_in');
  if (!hasTok) console.log('  (this ledger predates pnl-positions 1.4.0 — the Tokens checks run on the PNL=force build)');
  else { const w = await run(OWNER); const d = w.document; d.querySelector('#pp-positions [data-pp-lens="tokens"]').click(); await new Promise(r => setTimeout(r, 50));
    const exp = R0.positions.filter(p => p.deposits || p.withdraws); const rows = [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')];
    const lu = rows.find(r => { const p = exp[Number(r.getAttribute('data-pp-row'))]; return p.name === 'LUNA-USDC' && p.mechanism === 'amplified'; }); const P = exp[Number(lu.getAttribute('data-pp-row'))];
    const luna = P.realized.tok_in.LUNA; const fmtT = (a) => a >= 1e4 ? Math.round(a).toLocaleString('en-US') : a.toLocaleString('en-US', { maximumFractionDigits: 1 });
    ok(`LUNA-USDC amp in tokens: in ${fmtT(luna)} LUNA + ${fmtT(Object.entries(P.realized.tok_in).find(([k]) => /^USDC/.test(k))[1])} USDC.n → out ${fmtT(P.realized.tok_out.LUNA)} LUNA · vs just holding ${PPL.fmt.usd(P.realized.lp_usd, true)}`, T(lu).includes(fmtT(luna) + ' LUNA') && T(lu).includes(fmtT(P.realized.tok_out.LUNA) + ' LUNA') && T(lu).includes(PPL.fmt.usd(P.realized.lp_usd, true)), T(lu).slice(0, 200)); }
  const w2 = await run(OWNER); const d2 = w2.document; const exp2 = R0.positions.filter(p => p.deposits || p.withdraws); const un = exp2.filter(p => PPL.posStats2(p, false).unpriced);
  ok(`${un.length} position(s) with no price on their trip days read "unpriced", never $0.00 (${un.map(p => p.name).join(', ')})`, un.length > 0 && un.every(p => { const r = d2.querySelector('[data-pp="positions"] tr[data-pp-row="' + exp2.indexOf(p) + '"]'); return r && /unpriced/.test(T(r)) && !/\$0\.00\s+\$0\.00/.test(T(r)); }));
  ok('each position row carries both tokens’ logos (lib/token-logos.js) and its venue', !!d2.querySelector('[data-pp="positions"] tr[data-pp-row] img[src*="token-logos"], [data-pp="positions"] tr[data-pp-row] img[src*="/assets/images/"]') && /Astroport|Skeleton|retired pool/.test(T(d2.getElementById('pp-positions')))); }

console.log('— P32 income (4.0): bribes = the P&L build\'s (one number, one code path); Credia card —');
{ const w = await run(OWNER); const d = w.document; for (let i = 0; i < 20 && !/Bribe income/i.test(T(d.getElementById('income-card'))); i++) await new Promise(r => setTimeout(r, 250));
  const L = ledgerOf(OWNER); const b = Object.values(L.v3.bribes).reduce((a, x) => a + (x.usd || 0), 0);
  ok(`Income's bribe total ${f$(b)} = How you’ve done's bribes (the ledger's by-token sum)`, T(d.getElementById('income-card')).includes(f$(b)) && Math.abs(b - L.v3.totals.rewards.bribes_usd) < 0.05, T(d.getElementById('income-card')).slice(0, 200));
  const part = J(path.join(CORE, 'member-data/participants/current.json')); const cm = part.members.find(x => x.credia && x.credia.debt_usd > 1);
  if (cm) { const w2 = await run(cm.wallet); const c = T(w2.document.getElementById('credia-card')); const hf = cm.credia.health.lt_health_factor;
    ok(`${cm.wallet.slice(-6)}: the Credia card shows supplied ${f$(cm.credia.supplied_usd)}, borrowed ${f$(cm.credia.debt_usd)}, health ${hf.toFixed(2)}; net worth carries Credia net`, c.includes(f$(cm.credia.supplied_usd)) && c.includes(f$(cm.credia.debt_usd)) && c.includes(hf.toFixed(2)) && /Credia/.test(T(w2.document.getElementById('networth-banner'))), c.slice(0, 200)); }
  else ok('a participant with a Credia loan exists', false); }
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
