#!/usr/bin/env node
// gate-fuel-tool.mjs — BINDING page gate for fuel-tool.html Rev 2.3 (FUEL supply
// map strip + whales from token-catalog/supply/fuel). Fixture derived from the
// LIVE cron module on the gate world in platform-crons/token-catalog/
// mock-run-fuel-supply.js (probe-fixture values). Asserts specific cells.
// Usage: PLATFORM_CRONS_DIR=/path/to/platform-crons node gate-fuel-tool.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CRONS = process.env.PLATFORM_CRONS_DIR; if (!CRONS) { console.error('PLATFORM_CRONS_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
const M = require(path.join(CRONS, 'token-catalog/fuel-supply.js'));
const G = require(path.join(CRONS, 'token-catalog/mock-run-fuel-supply.js'));
let PASS = 0, FAIL = 0; const errors = [];
const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const FN = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

const { doc, wallets } = await M.captureFuelSupply(G.makeWorld());
const TRUSTED = { addresses: [{ address: G.STK[1], label: 'Boost Whale (verified)' }] };

async function boot({ productDown = false } = {}) {
  const html = fs.readFileSync(path.join(here, 'fuel-tool.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://thealliancedao.com/fuel-tool.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.fetch = async (url) => { const u = String(url); const ok = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) }); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
      if (u.includes('supply/fuel/current.json')) return productDown ? nope : ok(doc);
      if (u.includes('supply/fuel/wallets.json')) return productDown ? nope : ok(wallets);
      if (u.includes('catalog/trusted/current.json')) return ok(TRUSTED);
      return nope; };
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.Chart = class { constructor() { this.data = { datasets: [] }; } update() {} destroy() {} };   // CDN Chart.js is a stripped <script src>; charts are not under test here
    w.HTMLCanvasElement.prototype.getContext = () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }) });
    w.addEventListener('error', (e) => { errors.push(String(e.message || e.error)); });
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {}; } });
  await new Promise(r => setTimeout(r, 300));
  return dom.window;
}

console.log('=== fuel-tool Rev 2.3 — supply map + whales from the product ===');
{
  const w = await boot(); const d = w.document;
  const legend = d.getElementById('fuel-supply-legend').textContent;
  check('F1 supply status: cron ok · guards 5/5 green', /cron ok/.test(d.getElementById('fuel-supply-status').textContent) && /5\/5 green/.test(d.getElementById('fuel-supply-status').textContent), d.getElementById('fuel-supply-status').textContent);
  check('F2 legend: native 99.86M · staked 16.06M · treasury 42.44M · bridged 21.00M · liquid derived', /99\.86M FUEL/.test(legend) && /Boost DAO staked 16\.06M/.test(legend) && /Boost treasury 42\.44M/.test(legend) && /Bridged to Terra 21\.00M/.test(legend) && /Neutron liquid 20\.36M/.test(legend), legend);
  check('F3 bar has 5 segments summing to 100%', d.querySelectorAll('#fuel-supply-bar div').length === 5 && Math.abs([...d.querySelectorAll('#fuel-supply-bar div')].reduce((s, e) => s + parseFloat(e.style.width), 0) - 100) < 0.01);
  check('F4 note names the staker count and the cross-check', /47 Boost DAO stakers/.test(d.getElementById('fuel-supply-note').textContent) && /cross-checked against the Neutron escrow/.test(d.getElementById('fuel-supply-note').textContent), d.getElementById('fuel-supply-note').textContent);
  const rows = d.getElementById('whale-rows');
  const sections = [...rows.querySelectorAll('.whale-section')].map(e => e.textContent);
  check('F5 four sections: Boost stakers · Neutron holders · Terra holders · structural contracts', sections.length === 4 && /Boost DAO stakers/.test(sections[0]) && /Neutron holders/.test(sections[1]) && /Terra holders/.test(sections[2]) && /Structural/.test(sections[3]), sections);
  const tables = rows.querySelectorAll('table');
  const stk = [...tables[0].querySelectorAll('tr')];
  check('F6 staker table: top row is the 12M+ remainder wallet, fixture whale 53,447 present with verified name + unbonding chip 1,000', stk.length >= 40 && /Boost Whale \(verified\)/.test(tables[0].textContent) && /53,447 FUEL/.test(tables[0].textContent) && /unbonding 1,000/.test(tables[0].textContent), stk.length);
  check('F7 0-power staker not listed (tail)', !tables[0].textContent.includes(G.STK[2].slice(0, 14)));
  check('F8 Terra holders: bribes wallet 6,479,053 FUEL listed; pair + bribe manager are NOT holders', /6,479,053 FUEL/.test(tables[2].textContent) && !tables[2].textContent.includes(G.TERRA_PAIR.slice(0, 14)));
  check('F9 structural table: escrow labeled with channel, treasury labeled with the DAO name from chain, pair from catalog', /channel-25/.test(tables[3].textContent) && /Boost DAO treasury/.test(tables[3].textContent) && /Astroport pair LUNA-FUEL/.test(tables[3].textContent));
  check('F10 source line: rows published + tail', /cron product/.test(d.getElementById('whale-source').textContent) && /below floor/.test(d.getElementById('whale-source').textContent));
  check('F11 footer rev 2.3', /Rev 2\.3/.test(d.body.textContent));
  check('F12 no uncaught page errors (the undefined FUEL_POOL second pass is gone)', errors.filter(e => !/getContext|Chart/.test(e)).length === 0, errors);
}
console.log('\n=== product down → labeled Terra-only fallback, no phantom strip ===');
{
  const w = await boot({ productDown: true }); const d = w.document;
  check('D1 supply strip says unavailable; whales source says live Terra-only', /unavailable/.test(d.getElementById('fuel-supply-status').textContent) && /Terra IBC balances only/.test(d.getElementById('whale-source').textContent));
  check('D2 no bar segments invented', d.querySelectorAll('#fuel-supply-bar div').length === 0);
}
console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`);
process.exit(FAIL ? 1 : 0);
