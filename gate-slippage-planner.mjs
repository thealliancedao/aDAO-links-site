#!/usr/bin/env node
// gate-slippage-planner.mjs — BINDING page gate for slippage.html Rev 3.0 (trade
// planner). Runs the REAL page in jsdom with fetch stubbed to the COMMITTED
// products (TLA_CORE_DIR checkout: dex-data snapshots, token-catalog,
// price-history months, rolling CSVs) and asserts specific numbers — the
// CAPA → ASTRO table the owner asked for is the fixture.
// Usage: TLA_CORE_DIR=/path/to/tla-core node gate-slippage-planner.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0;
const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const read = (rel) => fs.existsSync(path.join(CORE, rel)) ? fs.readFileSync(path.join(CORE, rel), 'utf8') : null;
const WALLET = 'terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw';
const CAPA_CW20 = 'terra1t4p3u8khpd7f8qzurwyafxt648dya6mp6vur3vaapswt6m24gkuqrfdhar';

async function boot(search = '') {
  const html = fs.readFileSync(path.join(here, 'slippage.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://thealliancedao.com/slippage.html' + search, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount() {} }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined;
    w.fetch = async (url) => { const u = String(url).split('?')[0]; const ok = (b) => ({ ok: true, status: 200, json: async () => JSON.parse(b), text: async () => b }); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
      const m = /tla-core\/main\/(.+)$/.exec(u); if (m) { const b = read(m[1]); return b == null ? nope : ok(b); }
      if (u.includes('/cosmos/bank/v1beta1/balances/')) return ok(JSON.stringify({ balances: [{ denom: 'uluna', amount: '100000000' }] }));   // 100 LUNA
      if (u.includes(`/contract/${CAPA_CW20}/smart/`)) return ok(JSON.stringify({ data: { balance: '800000000000' } }));   // 800,000 CAPA
      if (u.includes('/cosmwasm/')) return ok(JSON.stringify({ data: { balance: '0' } }));
      return nope; };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {}; } });
  await new Promise(r => setTimeout(r, 400));
  return dom.window;
}
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''));

console.log('=== slippage Rev 3.0 — trade planner on committed reserves ===');
{
  const w = await boot(); const d = w.document; const T = w.__zapTest;
  check('S1 rev 3.0 + both chip rows rendered (FROM + TO), TO excludes FROM', T.REV === '3.0' && d.querySelectorAll('#tok-chips .tok-chip').length > 20 && d.querySelectorAll('#to-chips .tok-chip').length > 20 && ![...d.querySelectorAll('#to-chips .tok-chip')].some(b => b.dataset.to === T.store.token));
  // the owner's question
  T.store.token = 'CAPA'; T.store.to = 'ASTRO'; T.renderTokenChips(); T.setAmount(150);
  const r = T.planRoutes('CAPA', 'ASTRO', 150);
  check('S2 CAPA→ASTRO $150: best = via LUNA through LUNA-CAPA (concentrated) then LUNA-ASTRO', r[0] && r[0].kind === 'via LUNA' && r[0].legs[0].pool.name === 'LUNA-CAPA' && r[0].legs[1].pool.name === 'LUNA-ASTRO', r[0] && r[0].legs.map(l => l.pool.name));
  const expImpact = (() => { const l1 = r[0].legs[0], l2 = r[0].legs[1]; const a = 150 / (l1.depth + 150); const v2 = 150 * (1 - a) * 0.997; const b = v2 / (l2.depth + v2); return (1 - (1 - a) * (1 - b)) * 100; })();
  check('S3 impact = the xyk formula leg by leg on the fixture reserves (≤, curved) and cost = impact ∘ 2×0.3% fees', r[0] && Math.abs(r[0].impactPct - expImpact) < 1e-9 && r[0].curvedAny && Math.abs(r[0].costPct - (1 - (1 - r[0].impactPct / 100) * 0.997 * 0.997) * 100) < 1e-9, r[0] && [r[0].impactPct, expImpact, r[0].costPct]);
  check('S4 second leg is the constraint: LUNA-ASTRO leg impact > LUNA-CAPA leg impact', r[0].legs[1].impactPct > r[0].legs[0].impactPct, r[0].legs.map(l => l.impactPct.toFixed(2)));
  check('S5 route card renders the crown, the two legs, "keep $" and the assumed-fee note', /👑/.test(d.getElementById('plan-routes').textContent) && /LUNA-CAPA/.test(d.getElementById('plan-routes').textContent) && /LUNA-ASTRO/.test(d.getElementById('plan-routes').textContent) && /keep \$/.test(d.getElementById('plan-routes').textContent) && /fees 0\.60% assumed/.test(d.getElementById('plan-routes').textContent));
  check('S6 over the 1% limit → red warning naming the largest trade under 1%', /over your 1% limit/.test(d.getElementById('plan-warn').textContent) && /Largest CAPA→ASTRO trade under 1%: \$/.test(d.getElementById('plan-warn').textContent), d.getElementById('plan-warn').textContent);
  const m1 = T.maxSizeUnder('CAPA', 'ASTRO', 1), m3 = T.maxSizeUnder('CAPA', 'ASTRO', 3), m05 = T.maxSizeUnder('CAPA', 'ASTRO', 0.5);
  check('S7 threshold solve is monotone and consistent with the cost model (0.5% < 1% < 3%; cost at solved size ≤ tol)', m05 < m1 && m1 < m3 && T.planRoutes('CAPA', 'ASTRO', m1)[0].costPct <= 1.0001 && T.planRoutes('CAPA', 'ASTRO', m1 * 1.05)[0].costPct > 1, [m05, m1, m3]);
  check('S8 under 0.5% is impossible (fees alone are 0.6% on two legs) → $0', m05 === 0);
  const ladder = d.getElementById('ladder').textContent;
  check('S9 ladder carries the rungs + current size marker + tranche column; the $1,000 row equals the model at $1,000', /\$20/.test(ladder) && /\$5,000/.test(ladder) && /◂/.test(ladder) && (() => { const row = [...d.querySelectorAll('#ladder tr')].find(tr => /^\$1,000/.test(tr.textContent.trim())); const m = T.planRoutes('CAPA', 'ASTRO', 1000)[0]; return row && row.textContent.includes('≤' + m.costPct.toFixed(2) + '%'); })(), ladder.slice(0, 200));
  check('S10 FUEL context card: 90-day range position + pool volume vs 6-day average', (() => { T.store.to = 'FUEL'; T.renderPlanner(); const t = d.getElementById('plan-ctx').textContent; return /FUEL/.test(t) && /90-day range/.test(t) && /LUNA-FUEL: 24h volume/.test(t) && /6-day average/.test(t); })(), d.getElementById('plan-ctx').textContent.slice(0, 300));
  check('S11 SOLID context: peg line lists each xyk SOLID pool with its implied price, verdict follows the <0.995 rule (asserted against the model, not a market state)', (() => { T.store.to = 'SOLID'; T.renderPlanner(); const t = d.getElementById('plan-ctx').textContent; const peg = T.pegContext('SOLID'); const under = peg.some(r => r.implied < 0.995); return /peg:/.test(t) && peg.every(r => t.includes(r.pool + ' ' + (r.dex === 'astroport' ? 'Astro' : 'SS') + ' $' + r.implied.toFixed(4))) && (under ? /trading under \$1/.test(t) : /holding peg/.test(t)); })(), d.getElementById('plan-ctx').textContent.slice(-300));
  check('S12 recipe: two ordered swaps with token amounts and a slippage-tolerance hint', (() => { T.store.to = 'ASTRO'; T.renderPlanner(); const t = d.getElementById('plan-recipe').textContent; return /1\. On Astroport/.test(t) && /2\. On Astroport/.test(t) && /CAPA → LUNA/.test(t) && /set slippage tolerance ≥/.test(t); })(), d.getElementById('plan-recipe').textContent.slice(0, 200));
  // split routing
  const s = T.planRoutes('LUNA', 'CAPA', 3000);
  check('S13 split appears only when it beats both singles (LUNA→CAPA $3K across the two LUNA-CAPA pools)', s[0] && (s[0].kind !== 'split' || (s[0].out > s[0].split.a.out && s[0].out > s[0].split.b.out)), s[0] && [s[0].kind, s[0].out]);
  // wallet
  await T.loadHoldings(WALLET); await new Promise(r => setTimeout(r, 50));
  check('S14 wallet balances: CAPA chip carries its $ value, FROM defaults to the largest holding, balance row visible', /CAPA/.test(d.querySelector('#tok-chips .tok-chip').textContent) && /\$/.test(d.querySelector('#tok-chips .tok-chip').textContent) && d.getElementById('bal-row').style.display !== 'none' && /800,000 CAPA/.test(d.getElementById('bal-note').textContent), [d.querySelector('#tok-chips .tok-chip').textContent, d.getElementById('bal-note').textContent]);
  check('S15 hold status names the wallet, token count and live liquid USD', /holds 2 priced tokens/.test(d.getElementById('wallet-hold-status').textContent) && /live/.test(d.getElementById('wallet-hold-status').textContent), d.getElementById('wallet-hold-status').textContent);
  d.querySelector('.bal-btn[data-frac="0.25"]').click();
  check('S16 "25% of balance" sets the size to a quarter of the CAPA holding', Math.abs(T.store.amount - 800000 * T.store.symPrice.get('CAPA') * 0.25) < 1, T.store.amount);
  d.getElementById('swap-dir').click();
  check('S17 reverse swaps FROM/TO', T.store.token === 'ASTRO' && T.store.to === 'CAPA');
  d.querySelector('.tol-btn[data-tol="5"]').click();
  check('S18 limit chips re-plan (5%: "largest under 5%" highlighted)', T.store.tol === 5 && /5% →/.test(d.getElementById('ladder-limits').textContent));
}
console.log('\n=== deep link ?from=CAPA&to=FUEL ===');
{
  const w = await boot('?from=CAPA&to=FUEL'); const T = w.__zapTest;
  check('L1 deep link presets FROM/TO', T.store.token === 'CAPA' && T.store.to === 'FUEL');
  check('L2 existing zap/arb/where-to-sell surfaces untouched (results list renders for CAPA)', /LUNA-CAPA/.test(w.document.getElementById('results').textContent));
}
console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`);
process.exit(FAIL ? 1 : 0);
