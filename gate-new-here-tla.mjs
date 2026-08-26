#!/usr/bin/env node
// gate-new-here-tla.mjs — BINDING page gate for new-here-tla.html Rev 1.0.
// Runs the REAL page in jsdom with fetch stubbed to the COMMITTED products
// (TLA_CORE_DIR checkout: token-catalog, votion/optimization, tla-snapshot,
// dex-data/credia, votion/snapshots/vaults.json, docs/Staking APR.csv) plus:
//   · votion/yields/current.json from YIELDS_FIXTURE (the mock-gated Branch D
//     output on the real arbluna-max series) — labeled fixture until 1.4.0 runs
//   · LCD hub smart queries answered from votion/snapshots/vaults.json rates
// Asserts the math the owner specified: 10K max-lock = 100K VP; bribe share =
// pot × a/(V+a); horizon arithmetic; four-route compare; URL state; blanks
// (never phantoms) when the yields product is absent.
// Usage: TLA_CORE_DIR=/path/to/tla-core YIELDS_FIXTURE=/path/yields.json node gate-new-here-tla.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const YF = process.env.YIELDS_FIXTURE || null; const RF = process.env.RATES_FIXTURE || null;
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0;
const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x).slice(0, 300) : '')); } };
const read = (rel) => fs.existsSync(path.join(CORE, rel)) ? fs.readFileSync(path.join(CORE, rel), 'utf8') : null;
const vaultsDoc = JSON.parse(read('votion/snapshots/vaults.json'));
const hubRate = (cw20) => { const v = vaultsDoc.vaults.find(x => x.lst_contract === cw20 && x.lst_luna_hub_rate); return v ? v.lst_luna_hub_rate : null; };
const AMP_CW20 = 'terra1ecgazyd0waaj3g7l9cmy5gulhxkps2gmxu9ghducvuypjq68mq2s5lvsct', ARB_CW20 = 'terra1se7rvuerys4kd2snt6vqswh9wugu49vhyzls8ymc02wl37g2p2ms5yz490';

async function boot(search = '', { yields = true } = {}) {
  const html = fs.readFileSync(path.join(here, 'new-here-tla.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://thealliancedao.com/new-here-tla.html' + search, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount() {} }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined; w.scrollTo = () => {};
    w.HTMLDialogElement && (w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); });
    w.fetch = async (url) => { const u = String(url).split('?')[0]; const ok = (b) => ({ ok: true, status: 200, json: async () => JSON.parse(b), text: async () => b }); const nope = { ok: false, status: 404, json: async () => null, text: async () => null };
      if (u.endsWith('votion/yields/current.json')) return (yields && YF) ? ok(fs.readFileSync(YF, 'utf8')) : nope;
      if (u.endsWith('dex-data/credia/rates/current.json')) return (yields && RF) ? ok(fs.readFileSync(RF, 'utf8')) : nope;
      const m = /tla-core\/main\/(.+)$/.exec(u); if (m) { const b = read(decodeURIComponent(m[1])); return b == null ? nope : ok(b); }
      const sm = /\/contract\/(terra1[0-9a-z]+)\/smart\//.exec(u);
      if (sm) { const a = sm[1]; if (a.startsWith('terra10788fkzah')) return ok(JSON.stringify({ data: { exchange_rates: [[1787738399, String(hubRate(AMP_CW20))]] } })); if (a.startsWith('terra1r9gls56')) return ok(JSON.stringify({ data: { last_exchange_rate: String(hubRate(ARB_CW20)), share_exchange_rate: '1' } })); if (a.startsWith('terra1l2nd99')) return ok(JSON.stringify({ data: { exchange_rate: '1.7699' } })); }
      return nope; };
  } });
  await new Promise(r => setTimeout(r, 500));
  return dom.window;
}
const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

console.log('=== new-here-tla Rev 1.0 — four routes on committed products ===');
{
  const w = await boot(); const d = w.document; const T = w.__nh; const S = T.S, D = T.D;
  check('N1 rev + home screen on, four route cards', T.REV === '1.0' && d.getElementById('screen-home').classList.contains('on') && d.querySelectorAll('.route').length === 4);
  check('N2 LUNA price from the catalog (tla source), header shows ≈ USD', D.lunaUsd > 0 && D.lunaSrc === 'token-catalog/tla' && /≈ \$/.test(d.getElementById('luna-usd').textContent), [D.lunaUsd, D.lunaSrc]);
  check('N3 LST ratios from the hubs (live path), ampLUNA/arbLUNA/bLUNA all present and in range', ['ampLUNA', 'arbLUNA', 'bLUNA'].every(s => D.ratios[s] > 1 && D.ratios[s] < 5 && D.ratioSrc[s] === 'hub live'), D.ratios);
  check('N4 VP: 10K LUNA max lock = 100K VP; 1 week = 10K (no boost — both observed on real locks); linear on weeks beyond the first', T.vpFor(10000, 104) === 100000 && T.vpFor(10000, 1) === 10000 && Math.abs(T.vpFor(10000, 52) - 10000 * (1 + 9 * 51 / 103)) < 1e-6, [T.vpFor(10000, 104), T.vpFor(10000, 1), T.vpFor(10000, 52)]);
  check('N4b VP reproduces the REAL vaults: max vaults 10.0× LUNA-equivalent, 1-week vault 1.0×', (() => { const rows = vaultsDoc.vaults.filter(v => v.staked_lst_human > 100 && v.lst_luna_hub_rate && v.lock_vp_human); const mx = rows.filter(v => /^max\//.test(v.label)), wk = rows.filter(v => /^1\//.test(v.label)); return mx.length >= 2 && mx.every(v => Math.abs(v.lock_vp_human / (v.staked_lst_human * v.lst_luna_hub_rate) - 10) < 0.02) && wk.length >= 1 && wk.every(v => Math.abs(v.lock_vp_human / (v.staked_lst_human * v.lst_luna_hub_rate) - 1) < 0.02); })(), vaultsDoc.vaults.map(v => [v.label, Math.round(v.lock_vp_human / Math.max(1, v.staked_lst_human * (v.lst_luna_hub_rate || 1)) * 1000) / 1000]));
  check('N5 home teaser: TLA shows 100,000 VP for 10K', /100,000 VP/.test(d.getElementById('t-tla').textContent), d.getElementById('t-tla').textContent);
  // pool picker math
  const P = T.pools(); const vp = T.vpFor(10000, 104); const funded = P.rows.filter(r => r.potUsd > 0); const bp = T.bribePlan(vp);
  const VB = T.bucketVp(); const ea = JSON.parse(read('dex-data/eris-apr/current.json')); const la = ea.pools.find(x => x.pool_name === 'LUNA-ASTRO'); const laRow = P.rows.find(r => r.name === 'LUNA-ASTRO');
  check('N6 pools: every gauge pool from eris-apr; votes = distribution × bucket VP (gauge truth, NOT Votion\'s own votes); pots from the worksheet', P.period && P.rows.length > 15 && funded.length >= 3 && Math.abs(laRow.votes - la.distribution * VB.project) < 1e-6 && laRow.votes > 900000 && laRow.bucketVotes === VB.project, [P.rows.length, funded.length, laRow && laRow.votes]);
  check('N6c realism: 100K VP earns a few dollars a week across the buckets, not tens (V is millions)', bp.total > 0.5 && bp.total < 15, bp.total);
  const r0 = funded[0]; const share = T.bribeShare(r0, vp);
  const best = T.bestPerBucket(vp);
  check('N6b VP votes in EVERY bucket: best pot per bucket, total = Σ buckets (> any single pool)', Object.keys(best).length >= 2 && Math.abs(bp.total - Object.values(best).reduce((s, r) => s + r.mine, 0)) < 1e-9 && bp.total > Math.max(...Object.values(best).map(r => r.mine)), { buckets: Object.keys(best), total: bp.total });
  check('N7 bribe share = pot × a/(V+a) on the top pot', Math.abs(share - r0.potUsd * vp / (r0.votes + vp)) < 1e-9 && share > 0, { pool: r0.name, pot: r0.potUsd, V: r0.votes, share });
  check('N8 owner example: $100 pot, 900K votes, 100K VP → $10.00/wk', Math.abs(T.bribeShare({ potUsd: 100, votes: 900000 }, 100000) - 10) < 1e-9);
  // TLA screen
  S.route = 'tla'; T.render();
  check('N9 TLA screen: LST amount = LUNA ÷ hub rate, VP tile 100,000, best pool named when none chosen', Math.abs(T.lstAmount(10000, 'ampLUNA') - 10000 / D.ratios.ampLUNA) < 1e-9 && /100,000 VP/.test(d.getElementById('l-vp').textContent) && /best pot per bucket/.test(d.getElementById('l-bribe-sub').textContent), d.getElementById('l-bribe-sub').textContent);
  S.pools[r0.bucket] = r0.key; T.render();
  check('N10 picking a pool in one bucket: that bucket uses the pick, the others stay on their best; tile = Σ and says what the best pots would pay; card lists one line per bucket', /1 of \d buckets picked/.test(d.getElementById('pool-name').textContent) && /your 1 pick/.test(d.getElementById('l-bribe-sub').textContent) && Math.abs(num(d.getElementById('l-bribe').textContent.split(' /')[0]) - T.bribePlan(vp).total) < 0.01 && d.getElementById('pool-detail').querySelectorAll('.flex').length >= 2, [d.getElementById('pool-name').textContent, d.getElementById('l-bribe').textContent]);
  check('N11 URL state carries path/lock/pool/lst', /path=tla/.test(w.location.search) && /lock=104/.test(w.location.search) && /pools=/.test(w.location.search) && /lst=ampLUNA/.test(w.location.search), w.location.search);
  S.weeks = 52; T.render();
  check('N12 lock slider → VP = vpFor(52w); 6-month decay tile = vpFor(26w)', num(d.getElementById('l-vp').textContent) === Math.round(T.vpFor(10000, 52)) && num(d.getElementById('l-decay').textContent) === Math.round(T.vpFor(10000, 26)), [d.getElementById('l-vp').textContent, d.getElementById('l-decay').textContent]);
  S.weeks = 104; S.disc = 0.10; T.render();
  check('N13 resale = LUNA × price × (1 − 10%)', Math.abs(num(d.getElementById('l-resale').textContent) - Math.round(10000 * D.lunaUsd * 0.9)) <= 1, d.getElementById('l-resale').textContent);
  check('N14 Credia collateral tile says coming soon while the flag is off', d.getElementById('l-credia').textContent === 'coming soon', d.getElementById('l-credia').textContent);
  // yields-backed tiles (fixture)
  const a = T.assetApy('ampLUNA');
  check('N15 ampLUNA APY from the yields product (hub_exchange_rates), LST yield tile filled', a && a.source === 'hub_exchange_rates' && a.apy > 0 && /LUNA/.test(d.getElementById('l-yield').textContent), a);
  const n = T.nativeApr();
  check('N16 native APR PRIMARY = chain (provisions ÷ bonded ÷ alliance weights) = 27.02%; gross 37.78% (Allnodes) and SmartStake CSV carried as references', n && /^chain: provisions/.test(n.source) && Math.abs(n.before - 0.3778 / 1.398) < 5e-4 && Math.abs(n.apr - n.before * 0.95) < 1e-12 && Math.abs(n.gross - 0.3778) < 5e-4 && n.ref && n.ref.apr > 0.1 && n.refs.allnodes_2026_08_26 === 0.3778, n);
  d.querySelector('.how[data-how="native-apr"]').click();
  check('N16b how? popup on native APR names gross, stakers, Allnodes/Stakely/SmartStake and the inputs', /37\.78%/.test(d.getElementById('how-b').textContent) && /Allnodes 37\.78%/.test(d.getElementById('how-b').textContent) && /bonded 255,306,000 LUNA/.test(d.getElementById('how-b').textContent), d.getElementById('how-b').textContent.slice(0, 200));
  S.route = 'native'; S.horizon = 'yearly'; T.render();
  const n2 = T.nativeApr(); const claim = num(d.getElementById('n-claim').textContent), comp = num(d.getElementById('n-comp').textContent);
  check('N17 native yearly: applied APR = chain × (1 − 5% default commission); claim = 10K × daily × 365.25; compound > claim', Math.abs(n2.apr - n2.before * 0.95) < 1e-12 && Math.abs(claim - 10000 * n2.daily * 365.25) < 0.1 && comp > claim, [n2.before, n2.apr, claim, comp]);
  check('N17b honesty note present: "no verified live feed", chain-derived default, invitation to type a better figure', /no verified live feed/.test(d.getElementById('n-note').textContent) && /type it above/.test(d.getElementById('n-note').textContent) && d.getElementById('apr-in').value === (n2.before * 100).toFixed(2), d.getElementById('n-note').textContent.slice(0, 160));
  d.querySelector('.chip[data-comm="10"]').click();
  check('N17c commission chip 10% (Allnodes) → APR = before × 0.90, URL carries comm=10', Math.abs(T.nativeApr().apr - n2.before * 0.90) < 1e-12 && /comm=10/.test(w.location.search), [T.nativeApr().apr, w.location.search]);
  d.getElementById('apr-in').value = '30'; d.getElementById('apr-in').dispatchEvent(new w.Event('change'));
  check('N17d manual APR 30% → applied 27.0% (× 0.90), tiles + compare follow it, "your figure" labeled, URL apr=30', Math.abs(T.nativeApr().apr - 0.27) < 1e-12 && T.nativeApr().manual && /your figure/.test(d.getElementById('n-apr-sub').textContent) && /Using your figure/.test(d.getElementById('n-note').textContent) && /apr=30/.test(w.location.search) && Math.abs(T.totals().native - 10000 * (Math.pow(1 + 0.27 / 365.25, 365.25) - 1)) < 1e-6, [T.nativeApr().apr, w.location.search]);
  d.getElementById('apr-reset').click(); d.querySelector('.chip[data-comm="5"]').click();
  check('N17e reset → back to chain-derived, no apr in URL', !T.nativeApr().manual && !/apr=/.test(w.location.search));
  S.horizon = 'weekly'; T.render();
  check('N18 weekly: claim ≈ compound (7 days)', Math.abs(num(d.getElementById('n-claim').textContent) - num(d.getElementById('n-comp').textContent)) < 0.2);
  // Votion screen
  S.route = 'votion'; S.horizon = 'monthly'; T.render();
  const vr = T.vaultRows();
  check('N19 Votion: LST tabs + tier chips (only the selected LST\'s tiers shown), headline = LST + Votion (additive), ampLUNA-MAX first (highest)', vr.length >= 2 && d.querySelectorAll('#vault-lst button').length === new Set(vr.map(x => x.lst)).size && d.querySelectorAll('#vault-chips .chip').length === vr.filter(x => x.lst === vr[0].lst).length && (() => { const b = d.querySelector('#vault-lst button:not(.on)'); if (!b) return true; b.click(); const ok = d.querySelector('#vault-lst button.on').dataset.vlst === b.dataset.vlst && [...d.querySelectorAll('#vault-chips .chip')].length >= 1; return ok; })() && /\+ Votion/.test(d.getElementById('v-apy-parts').textContent) && Math.abs(vr[0].apy - (vr[0].asset + vr[0].votion)) < 1e-9, vr[0]);
  // Credia screen
  S.route = 'credia'; T.render(); const c = T.crediaLuna();
  check('N20 Credia is COMING SOON: screen shows the placeholder, live panel hidden, data still captured behind it', !T.CREDIA_LIVE && !d.getElementById('credia-soon').classList.contains('hidden') && d.getElementById('credia-live').classList.contains('hidden') && c && c.supplyApy > 0, c);
  const rg = T.crediaRange('uluna');
  check('N20b the rate-history sidecar is read (range ready behind the flag)', rg && rg.borrow_apr && /this week 9\.0%–14\.2%/.test(d.getElementById('cr-util-sub').textContent), d.getElementById('cr-util-sub').textContent);
  check('N20c home card, web hub, TLA tile, Votion tile and compare strip all say coming soon; compare carries no Credia number', /Coming soon/.test(d.getElementById('t-credia').textContent) && /Coming soon/.test(d.querySelector('#web .hub[data-route="credia"]').textContent) && d.getElementById('l-credia').textContent === 'coming soon' && d.getElementById('v-loop').textContent === 'coming soon' && T.totals().credia === null && /coming soon/.test([...d.querySelectorAll('#screen-credia .cmp')].map(x => x.textContent).join(' ')));
  check('N21 loop tile still computes behind the flag (verdict follows the numbers)', /does not pay|pays only/.test(d.getElementById('cr-loop').textContent), d.getElementById('cr-loop').textContent.slice(0, 120));
  // compare strip
  const tot = T.totals();
  check('N22 compare strip: all four routes carry a number for the same LUNA + horizon, and TLA includes the chosen pool\'s bribes', tot.native > 0 && tot.tla > 0 && tot.votion > 0 && tot.credia === null && tot.tlaBribeLuna > 0 && /buckets/.test(tot.tlaPool) && d.querySelectorAll('#screen-credia .cmp').length === 4, tot);
  // input
  S.luna = 1000000; T.render();
  check('N23 1M LUNA: VP 10,000,000 at max; compare scales linearly', /10,000,000 VP/.test(d.getElementById('t-tla').textContent) && Math.abs(T.totals().native / tot.native - 100) < 1e-6);
  // the web
  S.route = 'home'; S.luna = 10000; T.render();
  check('N22b web: 4 hubs, 12 leaves + 2 sub-leaves; Credia hub = Coming soon with placeholder leaves; TLA hub shows LST yield AND VP', d.querySelectorAll('#web .hub').length === 4 && d.querySelectorAll('#web .leaf').length === 14 && /Not yet audited/.test([...d.querySelectorAll('#web .leaf[data-route="credia"]')].map(x => x.textContent).join(' ')) && ![...d.querySelectorAll('#web .leaf[data-route="votion"]')].some(x => /loop/i.test(x.textContent)) && /\/ yr/.test(d.querySelector('#web .hub[data-route="tla"]').textContent) && /\+ 100,000 VP/.test(d.querySelector('#web .hub[data-route="tla"]').textContent) && /Boost \/ Atrium/.test(d.getElementById('web').textContent) && /worst case 4 years/.test(d.getElementById('web').textContent) && /governance VP concentrated/.test(d.getElementById('web').textContent) && d.querySelectorAll('#web .e-good').length === 4, d.querySelector('#web .hub[data-route="tla"]').textContent);
  d.getElementById('luna-in2').value = '250,000'; d.getElementById('luna-in2').dispatchEvent(new w.Event('change'));
  check('N22d the amount is editable inside the diagram: 250,000 → TLA hub 2,500,000 VP, header input follows', /2,500,000 VP/.test(d.querySelector('#web .hub[data-route="tla"]').textContent) && d.getElementById('luna-in').value === '250,000', d.getElementById('luna-in').value);
  S.luna = 10000; T.render();
  d.querySelector('#web .leaf[data-how="credia-soon"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('N22c clicking a Credia leaf opens the coming-soon popup, route unchanged', T.S.route === 'home' && d.getElementById('how').hasAttribute('open') && /not yet audited/.test(d.getElementById('how-b').textContent), d.getElementById('how-b').textContent.slice(0, 160));
  d.getElementById('how-x').click();
  d.querySelector('#web .hub[data-route="credia"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('N22e clicking a web hub shifts to that route screen', T.S.route === 'credia' && d.getElementById('screen-credia').classList.contains('on'));
  // LP boost simulator
  S.route = 'tla'; S.luna = 10000; S.weeks = 104; T.render();
  const sp = T.simPools(); const big = sp.sort((a, b) => b.tvl - a.tvl)[0]; const sim = T.simulate(big.key, 1000, 100000);
  check('N27 simulator: pools from eris-apr; re-derived pool APR EQUALS eris-apr incentive_apr (same distribution, same bucket VP) — the owner\'s LUNA-ASTRO 267% is gone', sp.length > 10 && sim && sim.sanity != null && sim.sanity < 1e-3 && (() => { const s2 = T.simulate(sp.find(p => p.name === 'LUNA-ASTRO').key, 514, 100000); return s2 && s2.apy0 < 0.9 && s2.apy1 < 2 && s2.apy1 > s2.apyDep; })(), sim && { pool: big.name, apr0: sim.apr0, eris: big.aprNow });
  check('N27b adding 100K VP raises the pool\'s emission share and APR; your $1,000 LP earns more with votes than without; bribe from the same pool reported', sim.share1 > sim.share0 && sim.apr1 > sim.aprDep && sim.yourYr1 > sim.yourYr0 && typeof sim.bribeWk === 'number', { share0: sim.share0, share1: sim.share1, y0: sim.yourYr0, y1: sim.yourYr1 });
  check('N27c share math: (v + a)/(V_b + a)', Math.abs(sim.share1 - (sim.votes + 100000) / (sim.bucketVotes + 100000)) < 1e-12);
  check('N27d simulator renders three tiles + the bribes sentence', d.querySelectorAll('#sim-out .tile').length === 3 && /Bribes from this pool/.test(d.getElementById('sim-out').textContent));
  // wallet path: pick a participant with positions
  const parts = JSON.parse(read('member-data/participants/current.json')); const pm = parts.members.find(m => (m.lp_positions || []).some(x => x.estimated_position_usd > 0));
  await T.loadWallet(pm.wallet); await new Promise(r => setTimeout(r, 50));
  check('N27e wallet selected → its TLA positions listed, deposit prefilled from the largest', /TLA position/.test(d.getElementById('sim-who').textContent) && d.querySelectorAll('#sim-pool optgroup').length === 2 && Number(d.getElementById('sim-usd').value.replace(/[^0-9.]/g, '')) > 0, [d.getElementById('sim-who').textContent, d.getElementById('sim-usd').value]);
  // how? popup
  d.querySelector('.how[data-how="vp"]').click();
  check('N24 how? popup opens with the VP explanation', d.getElementById('how').hasAttribute('open') && /fixed/.test(d.getElementById('how-b').textContent));
}
{
  const w = await boot('?luna=250000&path=tla&lock=52', { yields: false }); const d = w.document; const T = w.__nh;
  check('N25 deep link: ?luna=250000&path=tla&lock=52 → TLA screen, 250,000 LUNA, 52 weeks', T.S.luna === 250000 && T.S.route === 'tla' && T.S.weeks === 52 && d.getElementById('screen-tla').classList.contains('on') && num(d.getElementById('l-vp').textContent) === Math.round(T.vpFor(250000, 52)), d.getElementById('l-vp').textContent);
  check('N26b rates sidecar ABSENT → no range text, nothing fabricated', !/this week/.test(d.getElementById('cr-util-sub').textContent) && T.crediaRange('uluna') === null);
  check('N26 yields product ABSENT → LST yield / Votion tiles blank with a "not published" note, native falls to the SmartStake reference (labeled), nothing fabricated', /not published/.test(d.getElementById('l-yield-sub').textContent) && d.getElementById('t-votion').textContent === '—' && /SmartStake CSV/.test(T.nativeBase().source) && T.totals().votion === null, [d.getElementById('l-yield-sub').textContent, T.nativeApr().source]);
}
console.log(`\n${PASS} passed, ${FAIL} failed`); process.exit(FAIL ? 1 : 0);
