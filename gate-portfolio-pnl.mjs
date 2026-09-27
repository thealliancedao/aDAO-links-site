#!/usr/bin/env node
// gate-portfolio-pnl.mjs — member-portfolio 3.0 + lib/portfolio-pnl.js 1.0.0 on REAL data (jsdom, the page's own script).
// Inputs: a tla-core checkout (every feed the page reads) and a build-pnl v3 output dir (tla-flows/pnl/…) — until the weekly
// build has published v3 on main, the gate points the page's ledger/rollup fetches at a local build of the same code (tla-flows 3.5.0).
// Expected values are read from the ledger file itself — the page must show THE ledger's numbers, not recompute them.
//   P1 lib: decode() rebuilds every trip from trip_cols; attribution identity holds on decoded trips; story() both lenses
//   P2 owner page: hero net == ledger totals.net_usd; the four bars == market / lp / claims+bribes / unrealized; the bars add to net
//   P3 LUNA lens: the hero switches to totals.net_luna; the positions table and the curve follow the lens
//   P4 value curve: one point per epoch + "now", the "now" label present
//   P5 positions: one row per position with activity; the top row is the largest open value; a row opens its trips
//   P6 wind-down: a wallet holding USDC.n LP shows the "USDC.n ending" pill on that pool's row
//   P7 disputed: a wallet with a disputed position shows it flagged and the hero says it was left out
//   P8 fallback: with no v3 block in the ledger the page renders the Phase A story (no crash, no v3 cards)
// Usage: TLA_CORE_DIR=<tla-core> PNL_OUT=<dir holding tla-flows/pnl> NFTC_DIR=<nft-collections> DAOO_DIR=<dao-originations> node gate-portfolio-pnl.mjs
import { JSDOM, VirtualConsole } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
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

console.log('— P1 lib on the owner\'s ledger —');
const L0 = ledgerOf(OWNER); const D0 = PPL.decode(L0.v3);
{ let n = 0, bad = 0; for (const p of D0.positions) for (const t of p.trips) { if (t.in_usd == null || t.out_usd == null || t.market_usd == null) continue; n++; if (Math.abs(t.delta_usd - (t.market_usd + t.lp_usd)) > 0.021) bad++; }
  ok(`decode(): ${D0.positions.length} positions, ${n} valued trips rebuilt from trip_cols; out − in = market + lp on each`, n > 50 && bad === 0, bad); }
{ const S = PPL.story(D0, 'usd'), SL = PPL.story(D0, 'luna'); const t = L0.v3.totals;
  ok('story(usd): net == totals.net_usd, market/lp/rewards/unrealized from the ledger', S.net === t.net_usd && S.market === t.realized.market_usd && S.lp === t.realized.lp_usd && Math.abs(S.rewards - (t.rewards.claims_usd + t.rewards.bribes_usd)) < 1e-9 && S.unrealized === t.open.unrealized_usd);
  ok('story(luna): net == totals.net_luna', SL.net === t.net_luna);
  ok('the parts add to the net (usd): market + lp + rewards + unrealized == net (± $0.05)', Math.abs(S.market + S.lp + S.rewards + S.unrealized - S.net) < 0.05, [S.market, S.lp, S.rewards, S.unrealized, S.net]); }

async function run(wallet, opts = {}) {
  const pageUrl = 'https://thealliancedao.com/member-portfolio.html' + (wallet ? '?wallet=' + wallet : '');
  const html = fs.readFileSync(path.join(SITE, 'member-portfolio.html'), 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<script defer src="[^"]*"><\/script>/g, '');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { url: pageUrl, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); win.scrollTo = () => {}; win.requestAnimationFrame = (f) => setTimeout(f, 0); win.Element.prototype.scrollIntoView = () => {};
    win.HTMLCanvasElement.prototype.getContext = () => null; win.SiteHeader = { mount() {}, subnav() {} }; win.SiteFooter = { mount() {} };
    win.fetch = (u) => { const url = String(u).split('?')[0]; let f = null;
      if (url.startsWith(CORE_U + 'tla-flows/pnl/')) { const rel = url.slice(CORE_U.length); f = path.join(OUT, rel); if (opts.noV3 && /ledger\/terra1/.test(rel) && fs.existsSync(f)) { const d = J(f); delete d.v3; return Promise.resolve({ ok: true, status: 200, json: async () => d }); } }
      else if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (NFTC && url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length)); else if (DAOO && url.startsWith(DAOO_U)) f = path.join(DAOO, url.slice(DAOO_U.length));
      if (f && fs.existsSync(f) && fs.statSync(f).isFile()) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }); }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }); };
    for (const lib of ['lib/portfolio-pnl.js', 'lib/winddown.js']) if (!(opts.noLib && lib.includes('portfolio'))) win.eval(fs.readFileSync(path.join(SITE, lib), 'utf8'));
  } });
  const w = dom.window; w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 250)); const sc = w.document.getElementById('story-card'); if (!wallet && !w.document.getElementById('state-welcome').classList.contains('hidden')) break; if (sc && !/Adding up/.test(sc.textContent) && (opts.noV3 || opts.noLib || w.document.querySelector('[data-pp="net"]'))) break; }
  await new Promise(r => setTimeout(r, 400)); return w;
}

console.log('— P2–P5 the owner\'s page —');
{ const w = await run(OWNER); const d = w.document; const t = L0.v3.totals;
  const net = T(d.querySelector('[data-pp="net"]'));
  ok(`hero net = ${money(t.net_usd)} (ledger totals.net_usd)`, net === money(t.net_usd), net);
  const bars = [...d.querySelectorAll('[data-pp="bars"] > div')].map(b => T(b.lastElementChild));
  ok(`four bars = prices ${money(t.realized.market_usd)} · pool ${money(t.realized.lp_usd)} · rewards ${money(t.rewards.claims_usd + t.rewards.bribes_usd)} · open ${money(t.open.unrealized_usd)}`, bars.length === 4 && bars[0] === money(t.realized.market_usd) && bars[1] === money(t.realized.lp_usd) && bars[2] === money(t.rewards.claims_usd + t.rewards.bribes_usd) && bars[3] === money(t.open.unrealized_usd), bars);
  ok('the sentence says what prices, the pools and TLA did, and the net', /prices moved/.test(T(d.querySelector('[data-pp="sentence"]'))) && T(d.querySelector('[data-pp="sentence"]')).includes('Net: ' + money(t.net_usd)));
  const curve = d.querySelector('[data-pp="curve"]'); const nPts = L0.v3.value_curve.length;
  ok(`value curve drawn: ${nPts} points (E${L0.v3.value_curve[0].e} → now), "now" labelled`, !!curve && /now/.test(T(curve)) && !d.getElementById('pp-curve').hidden);
  const rows = [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')]; const expected = D0.positions.filter(p => p.deposits || p.withdraws);
  ok(`positions table: ${expected.length} rows (every position with activity)`, rows.length === expected.length, rows.length);
  const top = expected.slice().sort((a, b) => (b.open_value_usd || 0) - (a.open_value_usd || 0) || (b.realized.trips - a.realized.trips))[0];
  ok(`top row is the largest open position (${money(top.open_value_usd).replace('+', '')})`, rows[0] && T(rows[0]).includes(PPL.fmt.usd(top.open_value_usd)), T(rows[0]));
  const withTrips = rows.find((r, i) => expected.slice().sort((a, b) => (b.open_value_usd || 0) - (a.open_value_usd || 0) || (b.realized.trips - a.realized.trips))[i].realized.trips > 0);
  const tr = withTrips && d.querySelector('[data-pp-trips="' + withTrips.getAttribute('data-pp-row') + '"]'); withTrips && withTrips.click();
  ok('a row with closed trips opens its trip table (opened → closed, in, out, Δ, prices/pool, tx link)', tr && !tr.hidden && tr.querySelectorAll('tbody tr').length > 0 && /→/.test(T(tr)) && !!tr.querySelector('a[href^="https://chainsco.pe/terra2/tx/"]'));
  // P3 lens
  d.querySelector('#story-card [data-pp-lens="luna"]').click(); await new Promise(r => setTimeout(r, 50));
  ok(`LUNA lens: hero = ${lun(t.net_luna)}; the curve and the table follow`, T(d.querySelector('[data-pp="net"]')) === lun(t.net_luna) && /LUNA/.test(T(d.getElementById('pp-positions'))) && /LUNA/.test(T(d.getElementById('pp-curve'))), T(d.querySelector('[data-pp="net"]'))); }

console.log('— P6 wind-down pill · P7 disputed —');
{ const part = J(path.join(CORE, 'member-data/participants/current.json')); const W = require(path.join(SITE, 'lib/winddown.js')); const wd = W.build(J(path.join(CORE, 'docs/curated/alerts.json')), J(path.join(CORE, 'lp-grades/snapshots/current.json')));
  const holder = part.members.map(m => ({ m, L: ledgerOf(m.wallet) })).find(x => x.L && x.L.v3 && Object.values(x.L.v3.positions).some(p => p.units_open > 0 && !p.disputed && wd.forPool(p.pool)));
  if (holder) { const w = await run(holder.m.wallet); const pills = [...w.document.querySelectorAll('[data-pp="positions"] .wd-pill')]; const exp = Object.values(holder.L.v3.positions).filter(p => (p.deposits || p.withdraws) && wd.forPool(p.pool)).length;
    ok(`${holder.m.wallet.slice(-6)}: ${exp} USDC.n pool row(s) carry the wind-down pill`, pills.length === exp && exp > 0, pills.length); } else ok('a USDC.n holder with v3 positions exists', false);
  const dispW = fs.readdirSync(path.join(OUT, 'tla-flows/pnl/ledger')).filter(f => f.startsWith('terra1')).map(f => J(path.join(OUT, 'tla-flows/pnl/ledger', f))).find(L => L.v3 && L.v3.totals.positions_disputed && part.members.some(m => m.wallet === L.address));
  if (dispW) { const w = await run(dispW.address); const flag = T(w.document.querySelector('[data-pp="flags"]'));
    ok(`${dispW.address.slice(-6)}: the hero says ${dispW.v3.totals.positions_disputed} position(s) left out; the row is marked ⚠ disputed`, flag.includes(dispW.v3.totals.positions_disputed + ' position') && /left out/.test(flag) && /disputed/.test(T(w.document.getElementById('pp-positions'))), flag); } }

console.log('— P8 fallback —');
{ const w = await run(OWNER, { noV3: true }); const d = w.document;
  ok('no v3 in the ledger → the Phase A story renders, the v3 cards stay hidden', !d.querySelector('[data-pp="net"]') && /In TLA since|No captured flow/.test(T(d.getElementById('story-card'))) && d.getElementById('pp-positions-card').hidden, T(d.getElementById('story-card')).slice(0, 120));
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

console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
