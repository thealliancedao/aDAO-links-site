#!/usr/bin/env node
// gate-vote-market.mjs — lib/vote-market.js + the Vote Market page (vote-market.html) + the app's Vote Market tab (app.html) on the committed products.
// Relations, never literals: every check derives its expectation from the same fixtures the engine reads.
// Usage: TLA_CORE_DIR=/path/to/tla-core node gate-vote-market.mjs      (jsdom must be resolvable for the page checks)
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
const VM = require(path.join(here, 'lib/vote-market.js'));
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x).slice(0, 400) : '')); } };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(CORE, rel), 'utf8'));
const MR = fs.existsSync(path.join(CORE, 'votion/backtest/move-rule.json')) ? J('votion/backtest/move-rule.json') : null;
const IN = { moveRule: MR, snapshot: J('member-data/tla-snapshot/current.json'), votion: J('votion/optimization/current.json'), grades: J('lp-grades/snapshots/current.json'), pd: J('tla-voting/pd-bribes/current.json'), prices: J('network-and-prices/current.json'), catalog: J('token-catalog/snapshots/current.json'), participants: J('member-data/participants/current.json') };
const m = VM.build(IN); const near = (a, b, tol) => Math.abs(a - b) <= (tol != null ? tol : 1e-6) * Math.max(1, Math.abs(a), Math.abs(b));
const sum = (o, f) => Object.values(o).reduce((s, x) => s + f(x), 0);

console.log('E. engine');
// E1 units: Votion's end-of-round VP is converted to today's per bucket, and on its own gauges the two views then agree
for (const b of VM.BUCKETS) { const k = m.vpScale[b]; check(`E1 ${b}: Votion VP scale k=${k.toFixed(3)} in (1, 1.3)`, k > 1 && k < 1.3, k); }
// E2 pots = the period's list Votion captured, priced by the feed; where fully priced they match Votion's own dollars (±5%)
{ const bad = Object.values(m.pools).filter(p => p.inVotion && p.pot.tokens.length && !p.pot.unpriced.length && !near(p.potUsd, p.votionPotUsd, 0.05)); check('E2 fully priced pots match Votion\'s own dollars within 5%', bad.length === 0, bad.map(p => [p.name, p.potUsd, p.votionPotUsd])); }
{ const up = Object.values(m.pools).filter(p => p.pot.unpriced.length && p.inVotion); check('E2b a pot with a token the feed cannot price takes Votion\'s price, labelled', up.every(p => p.potPricedBy === 'votion' && p.potUsd >= p.votionPotUsd - 1e-9), up.map(p => [p.name, p.pot.unpriced, p.potUsd])); }
// E3 nothing changed: Votion's whole budget is placed, emissions sum to the bucket's weekly budget, the 1% line holds, APR formula
for (const b of VM.BUCKETS) {
  const o = VM.outcome(m, b, {}); const budget = m.vaults.reduce((s, v) => s + (v.byBucket[b] ? v.byBucket[b].vp : 0), 0);
  check(`E3 ${b}: Votion places its whole budget (${Math.round(budget)} VP)`, near(sum(o.rows, r => r.votion), budget, 1e-6));
  check(`E3 ${b}: emissions sum to the bucket's weekly budget`, near(sum(o.rows, r => r.weeklyUsd), m.buckets[b].weeklyUsd, 1e-9));
  check(`E3 ${b}: active ⇔ share ≥ 1%; a pool under the line earns nothing`, Object.values(o.rows).every(r => (r.active === (r.share >= VM.LINE)) && (r.active || r.weeklyUsd === 0)));
  check(`E3 ${b}: APR = weekly × 52.18 ÷ TLA-staked`, Object.values(o.rows).every(r => r.apr == null || near(r.apr, r.weeklyUsd * 52.18 / m.pools[r.pk].stakedUsd * 100, 1e-9)));
}
// E4 the solver: on Votion's own inputs our exact solve earns at least what Votion's published plan earns (its solver lands short)
for (const b of VM.BUCKETS) for (const vk of ['ampluna-max', 'arbluna-max']) { const o = IN.votion.vaults[vk].optimizations.find(x => x.id === b); const R = (al) => o.votingOptions.reduce((s, q) => s + (al[q.id] > 0 ? q.usdIncentives * al[q.id] / (q.votingPower + al[q.id]) : 0), 0);
  const a = VM.waterFill(o.votingOptions.map(q => ({ pk: q.id, b: q.usdIncentives, V: q.votingPower })), o.votingPower); const pl = {}; (o.optimization.votes || []).forEach(x => pl[x.id] = x.votingPowerToAllocate);
  check(`E4 ${b}/${vk}: exact solve $${R(a).toFixed(2)} ≥ Votion's plan $${R(pl).toFixed(2)}`, R(a) >= R(pl) - 1e-6); }
// E5 a bribe: Votion never leaves the pool you bribe; on a pool it can vote, a real bribe brings votes in; an excluded pool never gets Votion
const pools = Object.values(m.pools);
{ const tested = pools.filter(p => p.inVotion && p.stakedUsd >= 1000); const bad = [];
  for (const p of tested) { const im = VM.impact(m, p.pk, 100); if (im.votionIn < -1) bad.push([p.name, 'left', im.votionIn]); }
  check(`E5 $100 on each of ${tested.length} Votion pools never lowers Votion's votes there`, bad.length === 0, bad); }
{ const ex = pools.filter(p => p.votionExcluded); const bad = ex.filter(p => { const a = {}; a[p.pk] = 500; return VM.outcome(m, p.bucket, { add: a }).rows[p.pk].votion > 1; });
  check(`E5b ${ex.length} pool(s) left out of Votion's list get no Votion votes even with $500`, bad.length === 0, bad.map(p => p.name)); }
// E6 payout: a voter's cut = pot × my votes ÷ the pool's votes, and only over the line
{ const b = 'project'; const pk = pools.find(p => p.bucket === b && p.potUsd > 50 && p.inVotion).pk; const mine = {}; mine[pk] = 2e6; const o = VM.outcome(m, b, { mine });
  const r = o.rows[pk]; check(`E6 payout on ${m.pools[pk].name}: $${r.myUsd.toFixed(4)} = pot × 2M ÷ votes`, near(r.myUsd, r.pot * 2e6 / r.votes, 1e-9)); }
// E7 the scenario: moving a real voter's VP inside a bucket keeps the bucket's votes; Votion stays conserved; flows net to 0
{ const w = Object.values(m.voters).filter(v => Object.keys(v.votes).some(k => k.startsWith('project|'))).sort((a, c) => c.vp - a.vp)[0];
  const now = VM.walletVotes(m, w, 'project'); const src = Object.keys(now).sort((a, c) => now[c] - now[a])[0]; const tgt = pools.find(p => p.bucket === 'project' && p.pk !== src && p.inVotion).pk;
  const sc = VM.scenario(m, { bucket: 'project', target: tgt, from: src, pct: 0.6, bribeUsd: 100, wallet: w });
  check(`E7 60% of a voter's ${m.pools[src].name} votes move (${Math.round(sc.moved)} = 60% of ${Math.round(now[src])})`, near(sc.moved, 0.6 * now[src], 1e-9));
  check('E7 the bucket\'s total votes are unchanged by moving votes inside it', near(sc.plan.bucketVotes, sc.base.bucketVotes, 1e-9));
  check('E7 Votion\'s votes are conserved (flows net to ~0)', Math.abs(sc.flows.reduce((s, x) => s + x.d, 0)) < 1000 * (sc.flows.length + 1), sc.flows);
  check('E7 real cost = bribe − the change in your bribe income (dilution and votes moved away included)', near(sc.netCost, 100 - (sc.myPlan - sc.myNow), 1e-9) && sc.bribeBack >= 0 && sc.bribeBack <= 100);
  check('E7 emissions bought = the target\'s weekly emissions after − before', near(sc.emissionsBought, sc.plan.rows[tgt].weeklyUsd - sc.base.rows[tgt].weeklyUsd, 1e-9)); }
// E8 best split: all VP placed, and it earns at least the wallet's current votes AND 100% on any single funded pool (Votion reacting)
{ const w = m.voters['terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw'] || Object.values(m.voters).sort((a, c) => c.vp - a.vp)[0];
  for (const b of VM.BUCKETS) { const r = VM.bestSplit(m, b, w.vp, VM.walletVotes(m, w, b)); if (!r.split.length) continue;
    const placed = r.split.reduce((s, x) => s + x.vp, 0); check(`E8 ${b}: best split places the whole ${Math.round(w.vp)} VP`, near(placed, w.vp, 1e-6));
    const singles = m.buckets[b].pks.filter(pk => m.pools[pk].potUsd > 0).map(pk => { const mine = {}; mine[pk] = w.vp; return VM.outcome(m, b, { mine, mineNow: VM.walletVotes(m, w, b) }).myUsd; });
    const bestSingle = Math.max(0, ...singles);
    check(`E8 ${b}: best $${r.usd.toFixed(2)} ≥ now $${r.nowUsd.toFixed(2)} and ≥ best single pool $${bestSingle.toFixed(2)} (−1%)`, r.usd >= r.nowUsd * 0.99 - 0.01 && r.usd >= bestSingle * 0.99 - 0.01); } }
// E9b Best impact ranks only pools Votion is offered unless untested ones are asked for
{ const a = VM.lens(m, { lens: 'impact', usd: 50, limit: 50 }), b = VM.lens(m, { lens: 'impact', usd: 50, limit: 50, untested: true });
  check('E9b Best impact: no untested pool by default; asking adds them', a.every(r => !r.pool.votionUntested) && b.some(r => r.pool.votionUntested)); }
// E9 lenses: impact is sorted by emissions bought; underdogs are graded A–C under 5%; PD lens has no PD bribe; liquidity sorted by depth
{ const im = VM.lens(m, { lens: 'impact', usd: 50 }); check('E9 impact lens: 10 rows, sorted by emissions bought', im.length === 10 && im.every((r, i) => i === 0 || im[i - 1].im.emissionsBought >= r.im.emissionsBought));
  const ud = VM.lens(m, { lens: 'underdogs', usd: 50 }); check(`E9 underdogs (${ud.length}): graded A–C and under 5% of the bucket`, ud.every(r => ['A', 'B', 'C'].includes(r.pool.grade) && r.im.share0 < 0.05));
  const pd = VM.lens(m, { lens: 'pd', usd: 50 }); check(`E9 PD lens (${pd.length}): no PD bribe this round`, pd.every(r => !(r.pool.pdUsd > 0)));
  const lq = VM.lens(m, { lens: 'liquidity', usd: 50 }); check('E9 liquidity sorted by depth', lq.every((r, i) => i === 0 || lq[i - 1].pool.depthUsd >= r.pool.depthUsd)); }
// E10 names: no pool the page shows is a raw address
check('E10 every pool with a pot or TVL has a readable name', pools.filter(p => p.potUsd > 0 || p.stakedUsd >= 1000).every(p => !/^(cw20|native):|^terra1[0-9a-z]{30,}/.test(p.name)), pools.filter(p => /^(cw20|native):|^terra1/.test(p.name)).map(p => p.name));

// E11 wind-down (curated alert, e.g. USDC.n): every pool holding the asset is flagged — graded or not — and never recommended
{ const alert = (IN.grades.pools.flatMap(g => g.alerts || []).find(a => a.kind === 'asset' && a.status === 'migrating'));
  if (alert) { const cat = {}; (IN.catalog.pools || []).forEach(c => cat[c.gauge_pool_id] = c);
    const holders = pools.filter(p => ((cat[p.gid] || {}).underlyings || []).some(d => String(d).replace(/^(native|cw20):/, '') === alert.denom || m._P.symOf(String(d).replace(/^(native|cw20):/, '')) === alert.symbol));
    check(`E11 all ${holders.length} pools holding ${alert.symbol} are flagged`, holders.length > 0 && holders.every(p => p.winding), holders.filter(p => !p.winding).map(p => p.name));
    const rec = ['impact', 'underdogs', 'pd'].flatMap(L => VM.lens(m, { lens: L, usd: 50, limit: 50 })).filter(r => r.pool.winding);
    check('E11 no winding-down pool in the Best impact / Underdogs / PD lenses', rec.length === 0, rec.map(r => r.pool.name));
    const w = Object.values(m.voters).sort((a, c) => c.vp - a.vp)[0]; const bs = VM.bestSplitAll(m, w);
    check('E11 no winding-down pool in the best split', VM.BUCKETS.every(b => bs.buckets[b].split.every(x => !m.pools[x.pk].winding))); } }

// E12 Votion's move rule (votion/backtest/move-rule.json): the model uses it; a vault that holds keeps exactly its current votes;
// the unchanged state follows Votion's own published flag; a trivial change never flips a vault
if (MR) check(`E12 the rule in force is the fitted one (gain > $${MR.rule.gain_usd_gt}, shift > ${MR.rule.deviation_pct_gt}% · fit ${MR.fit.matches}/${MR.fit.observations})`, m.moveRule.gain_usd_gt === MR.rule.gain_usd_gt && m.moveRule.deviation_pct_gt === MR.rule.deviation_pct_gt && MR.fit.matches === MR.fit.observations);
for (const b of VM.BUCKETS) { const o = VM.outcome(m, b, {}); const bad = o.decisions.filter(d => d.published !== null && d.moves !== d.published);
  check(`E12 ${b}: nothing changed → each vault follows Votion's published flag`, bad.length === 0, bad);
}
{ const pools12 = pools.filter(p => p.inVotion && p.stakedUsd >= 1000); let flips = 0; for (const p of pools12) { const a = {}; a[p.pk] = 0.01; const wc = VM.withChange(m, p.bucket, {}, { add: a }); flips += wc.plan.decisions.filter(d => d.flippedByChange).length; }
  check(`E12 a $0.01 bribe on any of ${pools12.length} Votion pools flips no vault`, flips === 0, flips); }
{ // a vault forced to hold contributes exactly its current votes
  const b = 'project'; const o = VM.outcome(m, b, { force: Object.fromEntries(m.vaults.map(v => [v.key, false])) }); const cur = {}; m.vaults.forEach(v => Object.entries(v.byBucket[b].current).forEach(([pk, x]) => cur[pk] = (cur[pk] || 0) + x));
  check('E12 all vaults holding → Votion\'s votes at close = its current votes', Object.keys(o.rows).every(pk => near(o.rows[pk].votion, cur[pk] || 0, 1e-9))); }

console.log('P. the page (vote-market.html in jsdom, captured pots — the LCD is not reachable)');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('  (jsdom not installed — page checks skipped)'); }
if (JSDOM) {
  const html = fs.readFileSync(path.join(here, 'vote-market.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace('<script>if (window.SiteFooter)', '<script>if (false)');
  let onSel = null;
  const dom = new JSDOM(html, { url: 'https://thealliancedao.com/vote-market.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount() {} }; w.AddressPicker = { mount(o) { onSel = o.onSelect; }, get() { return null; } }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
    w.fetch = async (u) => { const mm = /tla-core\/main\/(.+)$/.exec(String(u).split('?')[0]); if (mm && fs.existsSync(path.join(CORE, mm[1]))) { const t = fs.readFileSync(path.join(CORE, mm[1]), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t) }; } return { ok: false, status: 404, json: async () => ({}) }; };
  } });
  const w = dom.window; w.eval(fs.readFileSync(path.join(here, 'lib/vote-market.js'), 'utf8'));   // the lib inside the page's window — its fetch is the stub, never the network
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); const d = w.document; await new Promise(r => setTimeout(r, 4000));
  const rows = [...d.querySelectorAll('#vm-list .row[data-pk]')]; const top = VM.lens(m, { lens: 'impact', usd: 50, limit: 10 });
  check('P1 the overview lists the engine\'s top 10 for $50, in order', rows.length === 10 && rows.every((r, i) => r.dataset.pk === top[i].pool.pk), rows.map(r => r.dataset.pk).slice(0, 3));
  const t0 = top[0]; const cellTxt = rows[0].children[2].textContent.replace(/\s+/g, '');
  check(`P1 row 1 shows +$${Math.round(t0.im.emissionsBought)}/wk`, cellTxt.startsWith('+$' + (t0.im.emissionsBought >= 1e4 ? Math.round(t0.im.emissionsBought).toLocaleString('en-US') : t0.im.emissionsBought.toFixed(0))), cellTxt);
  // simulator: pick the first project Votion pool, bribe $100 → the four tiles equal the engine's scenario (hypothetical 1M VP)
  const tgt = pools.find(p => p.bucket === 'project' && p.inVotion && p.potUsd > 50).pk; const sel = d.getElementById('vm-pool'); sel.value = tgt; sel.dispatchEvent(new w.Event('change'));
  const br = d.getElementById('vm-bribe'); br.value = '100'; br.dispatchEvent(new w.Event('input'));
  const sc = VM.scenario(m, { bucket: 'project', target: tgt, bribeUsd: 100, wallet: { vp: 1e6, votes: {}, lp: [], hypothetical: true }, from: 'all', pct: 0 });
  const tiles = [...d.querySelectorAll('#vm-answers .tile')].map(t => t.textContent.replace(/\s+/g, ' '));
  const vpS = (x) => { const a = Math.abs(x); return a >= 1e6 ? (x / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? Math.round(x / 1e3) + 'K' : Math.round(x).toString(); };
  check(`P2 tile 1 = Votion ${sc.votionIn > 0 ? '+' : ''}${vpS(sc.votionIn)} into ${m.pools[tgt].name}`, tiles[0] && tiles[0].includes((sc.votionIn > 0 ? '+' : sc.votionIn < 0 ? '−' : '±') + vpS(Math.abs(sc.votionIn))), tiles[0]);
  const apr1 = sc.plan.rows[tgt].apr; const aprS = (x) => x == null ? '—' : (x >= 1000 ? Math.round(x).toLocaleString() : x >= 100 ? x.toFixed(0) : x.toFixed(1)) + '%';
  check(`P2 tile 3 = APR → ${aprS(apr1)}`, tiles[2] && tiles[2].includes(aprS(apr1)), tiles[2]);
  const f$ = (x) => { const a = Math.abs(x); return (x < 0 ? '−$' : '$') + (a >= 1e4 ? Math.round(a).toLocaleString('en-US') : a >= 100 ? a.toFixed(0) : a.toFixed(2)); };   // the page's own money format
  check(`P2 tile 4 breakdown: pays −${f$(100)} · back +${f$(sc.bribeBack)} · real cost ${f$(sc.netCost)}`, tiles[3] && tiles[3].includes('You pay−' + f$(100)) && (sc.bribeBack > 0.005 ? tiles[3].includes('+' + f$(sc.bribeBack)) : /not on this pool[\s\S]*\$0/.test(tiles[3])) && tiles[3].includes('Real cost this round' + f$(sc.netCost)), tiles[3]);
  // Reset all: every section back to its defaults
  d.getElementById('vm-reset-all').click(); await new Promise(r => setTimeout(r, 300));
  check('P5 Reset all → bribe $0, move 0%, $50, all buckets, Best impact', d.getElementById('vm-bribe').value === '0' && d.getElementById('vm-pct').value === '0' && d.querySelector('#vm-amts .pill.on').textContent === '$50' && d.querySelector('#vm-buckets .pill.on').dataset.b === 'all' && d.querySelector('#vm-lenses .pill.on').dataset.l === 'impact');
  const trs = [...d.querySelectorAll('#vm-bucket-table tbody tr')]; check('P3 the bucket table marks the target row', trs.some(r => r.classList.contains('target')));
  // a wallet from VIEWING: the best split's headline equals the engine's for that wallet
  const cam = 'terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw'; if (onSel && m.voters[cam]) { onSel(cam, 'DeFi_Patriot'); await new Promise(r => setTimeout(r, 1500)); d.getElementById('vm-best-btn').click(); await new Promise(r => setTimeout(r, 1500));
    const bs = VM.bestSplitAll(m, m.voters[cam]); const head = d.getElementById('vm-best').textContent.replace(/\s+/g, ' ');
    check(`P4 best split for the selected wallet: $${bs.nowUsd.toFixed(2)} → $${bs.usd.toFixed(2)}`, head.includes('$' + bs.nowUsd.toFixed(2)) && head.includes('$' + bs.usd.toFixed(2)), head.slice(0, 200));
    check('P4 the wallet chip shows its VP', d.getElementById('vm-wallet').textContent.includes(vpS(m.voters[cam].vp))); }
}

// ---------------------------------------------------------------- T · TLA Stats' Vote Market tile (lib/vote-market-tile.js) on the same model — its numbers ARE the engine's
console.log('T. the TLA Stats tile (lib/vote-market-tile.js in jsdom, same model)');
if (JSDOM) {
  const cam = 'terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw';
  const tdom = new JSDOM('<!doctype html><html><head></head><body><div id="t"></div></body></html>', { url: 'https://thealliancedao.com/tla-stats.html', runScripts: 'dangerously', pretendToBeVisual: true });
  const tw = tdom.window; tw.eval(fs.readFileSync(path.join(here, 'lib/vote-market.js'), 'utf8')); tw.eval(fs.readFileSync(path.join(here, 'lib/vote-market-tile.js'), 'utf8'));
  let rateSeen = null; const T = tw.VoteMarketTile.mount(tw.document.getElementById('t'), { model: m, planner: '/vote-market.html', getWallet: () => cam, onRate: (r) => { rateSeen = r; } });
  const el = tw.document.getElementById('t'); const txt = () => el.textContent.replace(/\s+/g, ' ');
  const money0 = (x) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const vpS = (x) => { const a = Math.abs(x); return a >= 1e6 ? (x / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? Math.round(x / 1e3) + 'K' : Math.round(x).toString(); };
  const funded = sum(m.pools, p => p.potUsd || 0);
  check(`T1 header: ${money0(funded)} in bribes = Σ the engine's pots (the planner's number); a vote costs = VM.votionRate`, txt().includes('Bribes this round' + money0(funded)) && rateSeen === VM.votionRate(m), txt().slice(0, 220));
  const casts = (MR && MR.timing && MR.timing.casts) || []; const hs = casts.filter(c => c.hours_before_deadline > 0 && c.hours_before_deadline < 6).map(c => c.hours_before_deadline).sort((a, b) => a - b);
  if (hs.length) check(`T1b "Votion casts in" uses its fitted timing (about ${hs[Math.floor(hs.length / 2)]} h before close), not the deadline`, txt().includes(`about ${hs[Math.floor(hs.length / 2)]} h before close`));
  if (m.voteBefore) { const hhmm = new Date(m.voteBefore).toISOString().slice(11, 16); check(`T1c "Voting closes in" names the real deadline (${hhmm} UTC from Votion's voteBefore), never the ~21:20 cast`, txt().includes(hhmm + ' UTC') && !/Voting closes in[^A-Z]*~21:20/.test(txt()), txt().slice(0, 200)); }
  const rows = [...el.querySelectorAll('.vmt-row[data-pk]')]; const top = VM.lens(m, { lens: 'impact', bucket: 'all', usd: 50, limit: 8 });
  check('T2 "Where $ does the most" = the engine\'s top 8 for $50, in order, no winding-down pool', rows.length === top.length && rows.every((r, i) => r.dataset.pk === top[i].pool.pk) && top.every(r => !r.pool.winding), rows.map(r => r.dataset.pk).slice(0, 3));
  check('T3 every row opens the simulator on that pool with $50 in (?pool=…&bribe=50)', rows.every(r => r.getAttribute('href') === '/vote-market.html?pool=' + encodeURIComponent(r.dataset.pk) + '&bribe=50'));
  check('T4 the simulator is linked from the header button (the footer bar is gone — 1.1.0) and the filters are one toolbar: $ segments + Bucket and Rank by dropdowns', el.querySelector('#vmt-cta').getAttribute('href') === '/vote-market.html' && /Open the simulator/.test(txt()) && !el.querySelector('#vmt-foot') && el.querySelectorAll('.vmt-tools').length === 1 && el.querySelectorAll('.vmt-amts [data-amt]').length === 5 && el.querySelector('select#vmt-bk').options.length === VM.BUCKETS.length + 1 && !!el.querySelector('select#vmt-lens'));
  if (m.voters[cam]) { const bs = VM.bestSplitAll(m, m.voters[cam]); const me = el.querySelector('#vmt-me');
    check(`T5 the selected wallet's teaser = the engine's best split ($${bs.nowUsd.toFixed(2)} → $${bs.usd.toFixed(2)}) and opens ?view=best`, !!me && me.textContent.includes('$' + bs.nowUsd.toFixed(2)) && me.textContent.includes('$' + bs.usd.toFixed(2)) && me.getAttribute('href') === '/vote-market.html?view=best', me && me.textContent.slice(0, 160)); }
  el.querySelector('#vmt-seg [data-v="votion"]').click(); const mv = VM.votionMoves(m, 'all');
  const vr = [...el.querySelectorAll('.vmt-row[data-pk]')];
  check(`T6 "Votion's next move" = its published plan in real VP (row 1 ${mv[0] && mv[0].name} ${mv[0] && vpS(Math.abs(mv[0].d))})`, mv.length > 0 && vr[0].dataset.pk === mv[0].pk && vr[0].textContent.includes(vpS(Math.abs(mv[0].d))) && vr[0].textContent.includes(vpS(mv[0].now) + ' → ' + vpS(mv[0].plan)), vr[0] && vr[0].textContent.replace(/\s+/g, ' ').slice(0, 120));
  el.querySelector('#vmt-seg [data-v="pots"]').click(); const pr = [...el.querySelectorAll('.vmt-row[data-pk]')].map(r => m.pools[r.dataset.pk]);
  check('T7 "Pots & rates" lists funded pots biggest first, and a Votion pool with no pot reads "not funded"', pr.length > 0 && pr.every((p, i) => i === 0 || !(p.potUsd > pr[i - 1].potUsd)) && [...el.querySelectorAll('.vmt-row[data-pk]')].every(r => { const p = m.pools[r.dataset.pk]; return p.potUsd > 0.5 || /not funded/.test(r.textContent); }));
  el.querySelector('#vmt-seg [data-v="where"]').click(); el.querySelector('[data-amt="250"]').click(); { const sb = el.querySelector('#vmt-bk'); sb.value = 'project'; sb.dispatchEvent(new tw.Event('change')); }
  const r250 = [...el.querySelectorAll('.vmt-row[data-pk]')]; const top250 = VM.lens(m, { lens: 'impact', bucket: 'project', usd: 250, limit: 8 });
  { const sl = el.querySelector('#vmt-lens'); check('T8b Rank by → Underdogs re-ranks to the engine\'s underdogs list', (() => { sl.value = 'underdogs'; sl.dispatchEvent(new tw.Event('change')); const got = [...el.querySelectorAll('.vmt-row[data-pk]')].map(r => r.dataset.pk); const exp = VM.lens(m, { lens: 'underdogs', bucket: 'project', usd: 250, limit: 8 }).map(r => r.pool.pk); const ok = got.join() === exp.join(); const s2 = el.querySelector('#vmt-lens'); s2.value = 'impact'; s2.dispatchEvent(new tw.Event('change')); return ok; })()); }
  check('T8 $250 in Project re-ranks to the engine\'s list and the links carry bribe=250', r250.length === top250.length && r250.every((r, i) => r.dataset.pk === top250[i].pool.pk && /&bribe=250$/.test(r.getAttribute('href'))));
  // the simulator honours the tile's deep link
  const html2 = fs.readFileSync(path.join(here, 'vote-market.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace('<script>if (window.SiteFooter)', '<script>if (false)');
  const tpk = top[0].pool.pk; const ddom = new JSDOM(html2, { url: 'https://thealliancedao.com/vote-market.html?pool=' + encodeURIComponent(tpk) + '&bribe=50', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount() {} }; w.AddressPicker = { mount() {}, get() { return null; } }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
    w.fetch = async (u) => { const mm = /tla-core\/main\/(.+)$/.exec(String(u).split('?')[0]); if (mm && fs.existsSync(path.join(CORE, mm[1]))) { const t = fs.readFileSync(path.join(CORE, mm[1]), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t) }; } return { ok: false, status: 404, json: async () => { throw new Error('404'); } }; };
  } });
  const dw = ddom.window; dw.eval(fs.readFileSync(path.join(here, 'lib/vote-market.js'), 'utf8')); dw.document.dispatchEvent(new dw.Event('DOMContentLoaded')); await new Promise(r => setTimeout(r, 4000));
  const dd = dw.document; const bill = [...dd.querySelectorAll('#vm-answers .tile')].map(t => t.textContent.replace(/\s+/g, ' ')).find(t => /You pay/.test(t)) || '';
  check(`T9 the simulator opens from the tile's link on ${m.pools[tpk].name} with the $50 bribe in`, dd.getElementById('vm-pool').value === tpk && dd.getElementById('vm-bribe').value === '50' && /Your \$50 bribe/.test(bill), [dd.getElementById('vm-pool').value, dd.getElementById('vm-bribe').value, bill.slice(0, 80)]);
}

// B · the bribe breakdown always adds up: You pay − Comes back − Elsewhere (signed) = Real cost; a gain elsewhere gets its own line (VM1.7)
{ const pg = fs.readFileSync(path.join(here, 'vote-market.html'), 'utf8'), ap = fs.readFileSync(path.join(here, 'app.html'), 'utf8');
  let found = null; for (const pk of Object.keys(m.pools)) { const p = m.pools[pk]; if (!(p.potUsd >= 0) || p.winding || p.votionExcluded) continue; const w = Object.values(m.voters).find(v => Object.keys(v.votes).some(k => k.startsWith(p.bucket + '|')) && !v.votes[pk]); if (!w) continue; const sc = VM.scenario(m, { bucket: p.bucket, target: pk, bribeUsd: 100, wallet: w, from: 'all', pct: 0 }); if (sc.incomeChange - sc.bribeBack > 0.01) { found = sc; break; } }
  check('B1 the breakdown adds up: 100 − back − (income change − back) = real cost', !found || Math.abs(100 - found.incomeChange - found.netCost) < 1e-6);
  check('B2 page + app show "Gained elsewhere" when Votion leaving your pools lowers your dilution', /Gained elsewhere/.test(pg) && /Gained elsewhere/.test(ap)); }

// ---------------------------------------------------------------- M · the phone layout · A · the app's Vote Market tab (static wiring; the live drive is the 390px browser run)
console.log('M/A. phone + app');
{ const page = fs.readFileSync(path.join(here, 'vote-market.html'), 'utf8'); const app = fs.readFileSync(path.join(here, 'app.html'), 'utf8');
  const libV = VM.VERSION; const pageV = (page.match(/\/lib\/vote-market\.js\?v=([\d.]+)/) || [])[1]; const appV = (app.match(/VM_LIB='\/lib\/vote-market\.js\?v=([\d.]+)'/) || [])[1];
  check(`M1 phone: Plan a move and Best split fold into bars under 760px`, /@media \(max-width: 760px\)[\s\S]*section\.m-collapsed/.test(page) && /data-drawer="vm-sim-card"/.test(page) && /data-drawer="vm-best-card"/.test(page) && page.includes('id="vm-sim-sum"') && page.includes('id="vm-best-sum"'));
  check(`M2 phone: the bucket table drops the wide columns`, /\.btable \.hide-sm \{ display: none; \}/.test(page) && /hide-sm-inline">\$\{pctS\(r0\.apr\)\}/.test(page));
  check(`A1 the page, the app and the engine agree on the engine version (${libV})`, pageV === libV && appV === libV, { libV, pageV, appV });
  check('A2 app: a pickable Vote Market tab with its view', /vmkt:\['Vote Market','fa-sack-dollar'\]/.test(app) && /vmkt:vVmkt\}/.test(app) && app.includes('<section class="view" id="v-vmkt"><div id="vmkt"></div></section>'));
  check('A3 app: three sub-tabs — Where $ goes · Plan · Best split', /\[\['where','Where \$ goes'\],\['plan','Plan'\],\['best','Best split'\]\]/.test(app));
  check('A4 app: the same engine calls as the page (lens · scenario · whatItTakes · bestSplitAll · votionMoves)', ['VM.lens(', 'VM.scenario(', 'VM.whatItTakes(', 'VM.bestSplitAll(', 'VM.votionMoves('].every(k => app.includes(k)));
  check('A5 app: TLA opens it; estimate banner and Reset on each sub-tab + Reset all', app.includes("vc.onclick=()=>show('vmkt')") && app.includes('<b>Estimates.</b>') && ['vm-reset-w', 'vm-reset-p', 'vm-reset-b', 'vm-reset-all'].every(k => app.includes(`id="${k}"`)));
  const scripts = [...app.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]); let ok = true, err = null; for (const sc of scripts) { try { new Function(sc); } catch (e) { ok = false; err = e.message; } }
  check('A6 app: inline script compiles', ok, err);
  const tla = fs.readFileSync(path.join(here, 'tla-stats.html'), 'utf8'); const TV = require(path.join(here, 'lib/vote-market-tile.js')).VERSION;
  check(`A7 TLA Stats loads the same engine (${libV}) and the tile (${TV}) and mounts it on the Vote Market card`, (tla.match(/\/lib\/vote-market\.js\?v=([\d.]+)/) || [])[1] === libV && (tla.match(/\/lib\/vote-market-tile\.js\?v=([\d.]+)/) || [])[1] === TV && /VoteMarketTile\.mount\(el/.test(tla));
}
console.log(`\n${PASS} passed · ${FAIL} failed`); process.exit(FAIL ? 1 : 0);
