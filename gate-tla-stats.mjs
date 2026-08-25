#!/usr/bin/env node
// gate-tla-stats.mjs — tla-stats.html Batch A (2026-08-24) on committed products:
// APR from Eris's product · Votion VP repointed · bribes keyed by gauge+bucket ·
// dead loader gone · token overrides parsed · tabs. Usage: TLA_CORE_DIR=... node gate-tla-stats.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const read = (rel) => { const p = path.join(CORE, rel); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
const html = fs.readFileSync(path.join(here, 'tla-stats.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const logs = []; let subnavItems = null;
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/tla-stats.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  w.SiteHeader = { mount() {}, subnav(items) { subnavItems = items; return { querySelectorAll: () => [] }; } }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined;
  w.Chart = class { constructor() { this.data = { datasets: [] }; } update() {} destroy() {} }; w.HTMLCanvasElement.prototype.getContext = () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, measureText: () => ({ width: 0 }) });
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {}; w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.console.log = (...a) => logs.push(a.join(' ')); w.console.warn = () => {}; w.console.error = (...a) => logs.push('ERR ' + a.join(' '));
  w.fetch = async (u) => { const clean = String(u).split('?')[0]; const m = /tla-core\/main\/(.+)$/.exec(clean); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
    if (m) { const b = read(m[1]); if (b == null) return nope; const t = b.toString('utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t, arrayBuffer: async () => b }; }
    if (/\/cosmos\/bank\/v1beta1\/balances\//.test(clean)) return { ok: true, status: 200, json: async () => ({ balances: [{ denom: 'uluna', amount: '1000000000' }] }) };   // 1,000 LUNA
    if (/\/cosmwasm\/wasm\/v1\/contract\/terra1t4p3u8khpd7f8qzurwyafxt648dya6mp6vur3vaapswt6m24gkuqrfdhar\/smart\//.test(clean)) return { ok: true, status: 200, json: async () => ({ data: { balance: '500000000000' } }) };   // 500,000 CAPA
    if (/\/cosmwasm\/wasm\/v1\/contract\//.test(clean)) return { ok: true, status: 200, json: async () => ({ data: { balance: '0' } }) };
    return nope; };
} });
await new Promise(r => setTimeout(r, 6000));
const w = dom.window; const d = w.document;
let store = null; try { store = w.eval('store'); } catch { }
const eris = JSON.parse(read('dex-data/eris-apr/current.json')); const byGauge = Object.fromEntries(eris.pools.map(p => [p.gauge_pool_id, p]));
const snap = JSON.parse(read('member-data/tla-snapshot/current.json'));
const vot = JSON.parse(read('votion/optimization/current.json'));
console.log('=== tla-stats Batch A ===');
check('S1 page booted; store.pools present', store && Array.isArray(store.pools) && store.pools.length > 30, store && store.pools && store.pools.length);
const eure = store.pools.find(p => p.name === 'LUNA-EURe' && /astro/i.test(p.dex)); const er = eure && byGauge[eure.gauge_pool_id];
check('A1 LUNA-EURe apr_amp = Eris eris_apy_pct and apr_non = eris_apr_pct (product, not multiplier)', eure && er && eure.apr_amp === er.eris_apy_pct && eure.apr_non === er.eris_apr_pct, eure && [eure.apr_amp, er && er.eris_apy_pct, eure.apr_non, er && er.eris_apr_pct]);
check('A2 no pool carries the old ×1.05/×1.10 relation (amp = non × factor)', !store.pools.some(p => p.apr_non > 0 && p.apr_amp > 0 && (Math.abs(p.apr_amp / p.apr_non - 1.05) < 1e-9 || Math.abs(p.apr_amp / p.apr_non - 1.10) < 1e-9)));
check('A3 pools with no Eris row read null, not a number', store.pools.filter(p => !byGauge[p.gauge_pool_id]).every(p => p.apr_amp == null && p.apr_non == null));
const aprBoard = d.getElementById('top-apr-pools'); const top = store.pools.filter(p => p.is_active && p.apr_amp > 0).sort((a, b) => b.apr_amp - a.apr_amp)[0];
check('A4 Top-by-APR board leads with the highest Eris amplified APY among active pools', aprBoard && top && aprBoard.textContent.includes(top.name) && aprBoard.textContent.includes(top.apr_amp.toFixed(1)), top && [top.name, top.apr_amp]);
check('A5 APR subtitle names Eris\'s definition', /Eris amplified APY/.test((d.getElementById('apr-tile-sub') || {}).textContent || ''));
const capa = store.pools.find(p => p.name === 'LUNA-CAPA' && /astro/i.test(p.dex)); const capaVot = vot.aggregate.project.pools[capa.gauge_pool_id.replace(/^cw20:/, '')];
check('V1 LUNA-CAPA votion_now_vp = optimization current_vp (' + Math.round(capaVot.current_vp) + '), planned = ' + Math.round(capaVot.planned_vp), capa.votion_now_vp === capaVot.current_vp && capa.votion_next_vp === capaVot.planned_vp, [capa.votion_now_vp, capa.votion_next_vp]);
const votSum = store.pools.reduce((s, p) => s + (p.votion_now_vp || 0), 0);
check('V2 Votion VP attributed across pools is millions, not 0.00', votSum > 5e6, Math.round(votSum));
const movers = d.getElementById('vote-movers') || [...d.querySelectorAll('div')].find(x => /Votion plans/.test(x.textContent));
check('V3 Movers rows carry the "Votion plans ±X next epoch" chip where Votion announced a move', !!(movers && /Votion plans [+-]/.test(movers.textContent)));
const usdt = store.pools.filter(p => p.name === 'USDC-USDT' && /astro/i.test(p.dex)); const bc = usdt.find(p => p.bucket === 'BLUECHIP'), sg = usdt.find(p => p.bucket === 'SINGLE'); const bt = (p) => (p && p.bribes && p.bribes.total) || 0;
check('B1 USDC-USDT: the SINGLE gauge carries the bribe, the BLUECHIP variant carries none', sg && bc && bt(sg) > 100 && bt(bc) === 0, usdt.map(p => [p.bucket, bt(p)]));
const potTxt = logs.find(l => /Total bribes from pools/.test(l)) || ''; const pot = Number((potTxt.match(/([\d.]+)$/) || [])[1]);
check('B2 pot no longer double-counts: total < 1,100 (was 1,163.85 with $139.03 twice)', pot > 900 && pot < 1100, pot);
check('H1 the dead yearly-file loader is gone (no "historical data" log, no historicalUrls)', !logs.some(l => /historical data/i.test(l)) && !/historicalUrls/.test(html));
const ov = logs.find(l => /known-token name overrides/.test(l)) || ''; const nOv = Number((ov.match(/Loaded (\d+)/) || [])[1]);
check('T1 token-name overrides parsed from the org catalog (>20, was 0)', nOv > 20, nOv);
check('N1 subnav: Member Portfolio is disabled with SOON; Docs is gone', subnavItems && subnavItems.some(t => t.id === 'portfolio' && t.disabled && t.badge === 'SOON') && !subnavItems.some(t => t.id === 'docs'), subnavItems && subnavItems.map(t => t.id));
check('L1 no uncaught page errors', !logs.some(l => /^ERR/.test(l) && !/fetch|network/i.test(l)), logs.filter(l => /^ERR/.test(l)).slice(0, 3));
console.log('\n=== Batch B — Overview redesign ===');
const vm = d.getElementById('bounty-board-rows'); const vmSum = d.getElementById('bounty-summary');
check('M1 Vote Market: a market rate is stated and rows show what +$50 buys in VP', /market/.test(vmSum.textContent) && /\/ 1M VP/.test(vmSum.textContent) && /\+\$50 → ≈ \+[\d,.KM]+ VP/.test(vm.textContent), vmSum.textContent);
check('M2 Vote Market: rows compare to market (± % vs mkt) and the store carries the rate for Threshold Watch', /vs mkt/.test(vm.textContent) && store.voteMarketRate > 0, store.voteMarketRate);
w.setVoteMarketX(150); check('M3 Vote Market: the $150 preset re-renders the projection', /\+\$150 →/.test(d.getElementById('bounty-board-rows').textContent));
check('W1 Vote breakdown defaults to Planned and bars are left-aligned (every bar starts at left: 0%)', w.eval('waterfallEpochView') === 'next' && [...d.querySelectorAll('#waterfall-bars .waterfall-row [style*="left: 0%"]')].length > 0 && ![...d.querySelectorAll('#waterfall-bars .waterfall-row .flex.rounded.overflow-hidden')].some(b => /left: [1-9]/.test(b.getAttribute('style') || '')));
check('W2 planned labels expose the users/Votion decomposition where material', /users [+-]|Votion [+-]/.test(d.getElementById('waterfall-bars').textContent));
const rh = d.getElementById('runway-headline'); check('R1 Runway headline is a sentence about exit pressure, not a number pair', rh && /(Exit pressure from unlocks is|every tracked lock is auto-max)/.test(rh.textContent), rh && rh.textContent.slice(0, 120));
check('R2 Pending-withdrawal block is priced in USD', /≈ \$/.test((d.getElementById('unlock-pending') || {}).textContent || ''));
check('T2 Threshold Watch at-risk rows say the cushion and what +2% would take at the market rate', /above the 1% line/.test(d.getElementById('threshold-at-risk').textContent) && /of bribe at the market rate/.test(d.getElementById('threshold-at-risk').textContent));
const ph = d.querySelector('[data-erow]');
check('P1 Pool Health rows carry the one-line sentence, three chips and a planner link', ph && /staked in TLA/.test(ph.textContent) && /reward APR/.test(ph.textContent) && /bribe runway/.test(ph.textContent) && /plan a trade →/.test(ph.textContent), ph && ph.textContent.slice(0, 160));
check('P2 the embedded simulator is gone; the strip links to the Trade Planner', !d.querySelector('.slip-amt-btn') && /open the Trade Planner/.test(d.getElementById('slippage-sim-card').textContent));
// idle assets: run the live function against the stubbed LCD
const hostDiv = d.createElement('div'); hostDiv.id = 'idle-assets'; d.body.appendChild(hostDiv);
await w.eval('renderIdleAssets')({ wallet: 'terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw' }); await new Promise(r => setTimeout(r, 300));
check('I1 Idle assets: LUNA and CAPA balances priced, with TLA options (pool APY / max-lock VP) and a planner link', /LUNA/.test(hostDiv.textContent) && /CAPA/.test(hostDiv.textContent) && /Eris APY|max-locked/.test(hostDiv.textContent) && /plan a trade from/.test(hostDiv.textContent), hostDiv.textContent.slice(0, 200));
console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
