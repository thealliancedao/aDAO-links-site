#!/usr/bin/env node
// gate-portfolio-pnl.mjs — member-portfolio 3.0 + lib/portfolio-pnl.js 1.0.0 on REAL data (jsdom, the page's own script).
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
const f$ = (v) => { const a = Math.abs(v); return a >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : a >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(2); };   /* the page's own fmt$ (balances card) */

console.log('— P1 lib on the owner\'s ledger —');
const L0 = ledgerOf(OWNER); const D0 = PPL.decode(L0.v3);
{ let n = 0, bad = 0; for (const p of D0.positions) for (const t of p.trips) { if (t.in_usd == null || t.out_usd == null || t.market_usd == null) continue; n++; if (Math.abs(t.delta_usd - (t.market_usd + t.lp_usd)) > 0.021) bad++; }
  ok(`decode(): ${D0.positions.length} positions, ${n} valued trips rebuilt from trip_cols; out − in = market + lp on each`, n > 50 && bad === 0, bad); }
// 3.7: the page reconciles the ledger's open lots with the hourly chain read (participants) — the gate does the same from the same file
const PART = J(path.join(CORE, 'member-data/participants/current.json'));
const liveFor = (wallet, custody) => { const m = PART.members.find(x => x.wallet === wallet); return { read: !!(m && Array.isArray(m.lp_positions)), held: (pool, mech) => ((m && m.lp_positions) || []).filter(l => l.pool_gauge_id === pool && (l.is_amplified ? 'amplified' : 'non_amplified') === mech).reduce((x, l) => x + (Number(l.estimated_position_usd) || 0), 0), custody: custody || [] }; };
const recOf = (L, wallet, custody) => PPL.reconcile(PPL.decode(L.v3), liveFor(wallet, custody));
const R0 = recOf(L0, OWNER);
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
    if (opts.links) for (const [k, v] of Object.entries(opts.links)) win.localStorage.setItem('mp_link:' + wallet + ':' + k, v);
    win.fetch = (u) => { const url = String(u).split('?')[0]; let f = null;
      if (opts.chain) { for (const [host, ans] of Object.entries(opts.chain)) if (url.includes(host) && (!ans.addr || url.includes(ans.addr))) { const k = /\/bank\//.test(url) ? 'bank' : /\/staking\//.test(url) ? 'staking' : /\/distribution\//.test(url) ? 'rewards' : null; if (k && ans[k]) return Promise.resolve({ ok: true, status: 200, json: async () => ans[k] }); } }
      if (opts.bank && /\/cosmos\/bank\/v1beta1\/balances\//.test(url) && url.includes(wallet)) return Promise.resolve({ ok: true, status: 200, json: async () => ({ balances: opts.bank }) });
      if (opts.smart && /\/cosmwasm\/wasm\/v1\/contract\/terra1[0-9a-z]+\/smart\//.test(url)) { const m = url.match(/contract\/(terra1[0-9a-z]+)\/smart\/([^/?]+)/); const fn = opts.smart[m[1]]; if (fn) { let q = null; try { q = JSON.parse(Buffer.from(decodeURIComponent(m[2]), 'base64').toString()); } catch (e) {} const ans = q ? fn(q) : undefined; if (ans !== undefined) return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: ans }) }); } }   // 3.7: contract queries (the ampCAPA DAO)
      if (opts.cw20 && /\/cosmwasm\/wasm\/v1\/contract\/terra1[0-9a-z]+\/smart\//.test(url)) { const m = url.match(/contract\/(terra1[0-9a-z]+)\/smart\/([^/?]+)/); let q = null; try { q = JSON.parse(Buffer.from(decodeURIComponent(m[2]), 'base64').toString()); } catch (e) {} if (q && q.balance) return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { balance: String(opts.cw20[m[1]] || 0) } }) }); }   // 3.6: the live cw20 reads   // 3.3: the live bank scan, as the owner's screenshot showed it
      if (url.startsWith(CORE_U + 'tla-flows/pnl/')) { const rel = url.slice(CORE_U.length); f = path.join(OUT, rel); if (opts.noV3 && /ledger\/terra1/.test(rel) && fs.existsSync(f)) { const d = J(f); delete d.v3; return Promise.resolve({ ok: true, status: 200, json: async () => d }); } }
      else if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (NFTC && url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length)); else if (DAOO && url.startsWith(DAOO_U)) f = path.join(DAOO, url.slice(DAOO_U.length));
      if (f && fs.existsSync(f) && fs.statSync(f).isFile()) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }); }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }); };
    for (const lib of ['lib/portfolio-pnl.js', 'lib/winddown.js', 'lib/denoms.js', 'lib/vote-market.js']) if (!(opts.noLib && lib.includes('portfolio'))) win.eval(fs.readFileSync(path.join(SITE, lib), 'utf8'));
  } });
  const w = dom.window; w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 250)); const sc = w.document.getElementById('story-card'); if (!wallet && !w.document.getElementById('state-welcome').classList.contains('hidden')) break; if (sc && !/Adding up/.test(sc.textContent) && (opts.noV3 || opts.noLib || w.document.querySelector('[data-pp="net"]'))) break; }
  await new Promise(r => setTimeout(r, 400)); return w;
}

console.log('— P2–P5 the owner\'s page —');
{ const w = await run(OWNER); const d = w.document; const t = R0.totals;   // 3.7: the reconciled totals (the ledger's, less lots no longer in the wallet)
  const net = T(d.querySelector('[data-pp="net"]'));
  ok(`hero net = ${money(t.net_usd)} (ledger net reconciled with the chain read: ${R0.reconciled.moved} moved out)`, net === money(t.net_usd), net);
  const bars = [...d.querySelectorAll('[data-pp="bars"] > div')].map(b => T(b.lastElementChild));
  ok(`four bars = prices ${money(t.realized.market_usd)} · pool ${money(t.realized.lp_usd)} · rewards ${money(t.rewards.claims_usd + t.rewards.bribes_usd)} · open ${money(t.open.unrealized_usd)}`, bars.length === 4 && bars[0] === money(t.realized.market_usd) && bars[1] === money(t.realized.lp_usd) && bars[2] === money(t.rewards.claims_usd + t.rewards.bribes_usd) && bars[3] === money(t.open.unrealized_usd), bars);
  ok('the sentence says what prices, the pools and TLA did, and the net', /prices moved/.test(T(d.querySelector('[data-pp="sentence"]'))) && T(d.querySelector('[data-pp="sentence"]')).includes('Net: ' + money(t.net_usd)));
  const curve = d.querySelector('[data-pp="curve"]'); const nPts = L0.v3.value_curve.length;
  ok(`value curve drawn: ${nPts} points (E${L0.v3.value_curve[0].e} → now), "now" labelled`, !!curve && /now/.test(T(curve)) && !d.getElementById('pp-curve').hidden);
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
    let aprOk = 0, aprN = 0; for (const r of rows) { const p = byRow(r); const S = PPL.posStats(p, false); if (S.apr == null) continue; aprN++; if (T(r).includes((S.apr * 100).toFixed(1) + '%') && T(r).includes(PPL.fmt.usd(S.pnl, true))) aprOk++; }
    ok(`every row with a measurable APR shows it with its P&L incl. rewards (${aprOk}/${aprN})`, aprN > 5 && aprOk === aprN);
    const S0 = exp.filter(p => !p.disputed).map(p => PPL.posStats(p, false)); const pnlAll = S0.reduce((a, x) => a + (x.pnl || 0), 0);
    const bucketSum = [...d.querySelectorAll('[data-pp-bucket]')].map(r => Number(T(r.children[4]).replace(/[^0-9.\-−]/g, '').replace('−', '-'))).reduce((a, b) => a + b, 0);
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
  ok(`owner: wBTC.osmo-wBTC.axl (amp, receipt sent to another address 2026-03-06) and ampCAPA (amp, receipt staked in the DAO) are no longer in the wallet per the chain read — ${moved.length} flagged (${moved.map(p => p.name + ' ' + PPL.fmt.usd(p.moved.ledger_usd)).join(', ')})`, !!byName('wBTC.osmo-wBTC.axl', 'amplified') && !!byName('ampCAPA', 'amplified') && moved.every(p => p.moved.ledger_usd >= 1));
  const t0 = L0.v3.totals.open, t1 = R0.totals.open; const mv = moved.filter(p => !p.moved.built_out).reduce((a, p) => a + p.open_value_usd, 0);   /* a build with not_held (pnl 1.2.3) already left them out */
  ok(`Open now drops by exactly what moved out: ${PPL.fmt.usd(t0.value_usd)} − ${PPL.fmt.usd(mv)} = ${PPL.fmt.usd(t1.value_usd)}; net moves by the same lots' unrealized`, Math.abs(t0.value_usd - mv - t1.value_usd) < 0.01 && Math.abs((L0.v3.totals.net_usd - R0.totals.net_usd) - moved.filter(p => !p.moved.built_out).reduce((a, p) => a + (p.open_value_usd - (p.open_cost_usd || 0)), 0)) < 0.01);
  const w = await run(OWNER); const d = w.document; const tab = T(d.getElementById('pp-positions'));
  const rowOf = (n) => [...d.querySelectorAll('[data-pp="positions"] tbody tr[data-pp-row]')].find(r => T(r).startsWith(n) && /amp /.test(T(r)));
  ok('the two rows say "⚠ not in this wallet" and "moved out · not counted"', ['wBTC.osmo-wBTC.axl', 'ampCAPA'].every(n => { const r = rowOf(n); return r && /not in this wallet/.test(T(r)) && /moved out/.test(T(r)) && /not counted/.test(T(r)); }), ['wBTC.osmo-wBTC.axl', 'ampCAPA'].map(n => T(rowOf(n)).slice(0, 160)));
  const flag = T(d.querySelector('[data-pp="flags"]'));
  ok(`the hero says ${moved.length} position(s) are no longer in this wallet (${PPL.fmt.usd(R0.reconciled.moved_usd)} left out of Open now)`, flag.includes(moved.length + ' position') && /no longer in this wallet/.test(flag) && flag.includes(PPL.fmt.usd(R0.reconciled.moved_usd)), flag);
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
  ok(`net = ${money(Rc.totals.net_usd)}: the ledger's own lots stay in the P&L, the untracked part does not`, T(d.querySelector('[data-pp="net"]')) === money(Rc.totals.net_usd) && Math.abs(Rc.totals.open.value_usd - (R0.totals.open.value_usd + liveUsd)) < 0.02, [T(d.querySelector('[data-pp="net"]')), Rc.totals.open.value_usd]); }

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
  const all = R0.positions.filter(p => (p.deposits || p.withdraws) && !p.disputed).map(p => PPL.posStats(p, false)); const n = all.filter(x => x.apr != null).length;
  const w = await run(OWNER); const tot = T(w.document.querySelector('[data-pp="positions-total"]'));
  ok(`the all-LPs APR says how many positions it covers (${n} of ${all.length} fully priced)`, tot.includes(n + ' of ' + all.length + ' positions fully priced'), tot); }
console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
