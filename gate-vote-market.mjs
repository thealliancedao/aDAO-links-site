#!/usr/bin/env node
// gate-vote-market.mjs — lib/vote-market.js 1.0.0 + the Vote Market page (test-2.html, VM1.0) on the committed products.
// Relations, never literals: every check derives its expectation from the same fixtures the engine reads.
// Usage: TLA_CORE_DIR=/path/to/tla-core node gate-vote-market.mjs      (jsdom must be resolvable for the page checks)
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
const VM = require(path.join(here, 'lib/vote-market.js'));
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x).slice(0, 400) : '')); } };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(CORE, rel), 'utf8'));
const IN = { snapshot: J('member-data/tla-snapshot/current.json'), votion: J('votion/optimization/current.json'), grades: J('lp-grades/snapshots/current.json'), pd: J('tla-voting/pd-bribes/current.json'), prices: J('network-and-prices/current.json'), catalog: J('token-catalog/snapshots/current.json'), participants: J('member-data/participants/current.json') };
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
  check('E7 net cost = bribe − the share of it your votes collect', near(sc.netCost, 100 - sc.bribeBack, 1e-9) && sc.bribeBack >= 0 && sc.bribeBack <= 100);
  check('E7 emissions bought = the target\'s weekly emissions after − before', near(sc.emissionsBought, sc.plan.rows[tgt].weeklyUsd - sc.base.rows[tgt].weeklyUsd, 1e-9)); }
// E8 best split: all VP placed, and it earns at least the wallet's current votes AND 100% on any single funded pool (Votion reacting)
{ const w = m.voters['terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw'] || Object.values(m.voters).sort((a, c) => c.vp - a.vp)[0];
  for (const b of VM.BUCKETS) { const r = VM.bestSplit(m, b, w.vp, VM.walletVotes(m, w, b)); if (!r.split.length) continue;
    const placed = r.split.reduce((s, x) => s + x.vp, 0); check(`E8 ${b}: best split places the whole ${Math.round(w.vp)} VP`, near(placed, w.vp, 1e-6));
    const singles = m.buckets[b].pks.filter(pk => m.pools[pk].potUsd > 0).map(pk => { const mine = {}; mine[pk] = w.vp; return VM.outcome(m, b, { mine, mineNow: VM.walletVotes(m, w, b) }).myUsd; });
    const bestSingle = Math.max(0, ...singles);
    check(`E8 ${b}: best $${r.usd.toFixed(2)} ≥ now $${r.nowUsd.toFixed(2)} and ≥ best single pool $${bestSingle.toFixed(2)} (−1%)`, r.usd >= r.nowUsd * 0.99 - 0.01 && r.usd >= bestSingle * 0.99 - 0.01); } }
// E9 lenses: impact is sorted by emissions bought; underdogs are graded A–C under 5%; PD lens has no PD bribe; liquidity sorted by depth
{ const im = VM.lens(m, { lens: 'impact', usd: 50 }); check('E9 impact lens: 10 rows, sorted by emissions bought', im.length === 10 && im.every((r, i) => i === 0 || im[i - 1].im.emissionsBought >= r.im.emissionsBought));
  const ud = VM.lens(m, { lens: 'underdogs', usd: 50 }); check(`E9 underdogs (${ud.length}): graded A–C and under 5% of the bucket`, ud.every(r => ['A', 'B', 'C'].includes(r.pool.grade) && r.im.share0 < 0.05));
  const pd = VM.lens(m, { lens: 'pd', usd: 50 }); check(`E9 PD lens (${pd.length}): no PD bribe this round`, pd.every(r => !(r.pool.pdUsd > 0)));
  const lq = VM.lens(m, { lens: 'liquidity', usd: 50 }); check('E9 liquidity sorted by depth', lq.every((r, i) => i === 0 || lq[i - 1].pool.depthUsd >= r.pool.depthUsd)); }
// E10 names: no pool the page shows is a raw address
check('E10 every pool with a pot or TVL has a readable name', pools.filter(p => p.potUsd > 0 || p.stakedUsd >= 1000).every(p => !/^(cw20|native):|^terra1[0-9a-z]{30,}/.test(p.name)), pools.filter(p => /^(cw20|native):|^terra1/.test(p.name)).map(p => p.name));

console.log('P. the page (test-2.html in jsdom, captured pots — the LCD is not reachable)');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('  (jsdom not installed — page checks skipped)'); }
if (JSDOM) {
  const html = fs.readFileSync(path.join(here, 'test-2.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace('<script>if (window.SiteFooter)', '<script>if (false)');
  let onSel = null;
  const dom = new JSDOM(html, { url: 'https://thealliancedao.com/test-2.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.AddressPicker = { mount(o) { onSel = o.onSelect; }, get() { return null; } }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
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
  check(`P2 tile 4 = net $${Math.round(sc.netCost)}`, tiles[3] && tiles[3].includes('$' + Math.round(sc.netCost)), tiles[3]);
  const trs = [...d.querySelectorAll('#vm-bucket-table tbody tr')]; check('P3 the bucket table marks the target row', trs.some(r => r.classList.contains('target')));
  // a wallet from VIEWING: the best split's headline equals the engine's for that wallet
  const cam = 'terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw'; if (onSel && m.voters[cam]) { onSel(cam, 'DeFi_Patriot'); await new Promise(r => setTimeout(r, 1500)); d.getElementById('vm-best-btn').click(); await new Promise(r => setTimeout(r, 1500));
    const bs = VM.bestSplitAll(m, m.voters[cam]); const head = d.getElementById('vm-best').textContent.replace(/\s+/g, ' ');
    check(`P4 best split for the selected wallet: $${bs.nowUsd.toFixed(2)} → $${bs.usd.toFixed(2)}`, head.includes('$' + bs.nowUsd.toFixed(2)) && head.includes('$' + bs.usd.toFixed(2)), head.slice(0, 200));
    check('P4 the wallet chip shows its VP', d.getElementById('vm-wallet').textContent.includes(vpS(m.voters[cam].vp))); }
}
console.log(`\n${PASS} passed · ${FAIL} failed`); process.exit(FAIL ? 1 : 0);
