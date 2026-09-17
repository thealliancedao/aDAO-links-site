#!/usr/bin/env node
// gate-tla-stats-alerts.mjs — tla-stats T3.21 (jsdom, real products): curated alerts on the grade rows + the Advisor.
// The lp-grades product on main predates 2.1.0, so the fixture is STAGED by the two LIVE cron functions (token-catalog
// stampAssetAlerts → lp-grades applyAlerts) from the committed registry — no third copy of either rule.
// Usage: TLA_CORE_DIR=<tla-core (with docs/curated/alerts.json)> CRONS_DIR=<platform-crons> node gate-tla-stats-alerts.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import os from 'os'; import { createRequire } from 'module';
const CORE_REAL = process.env.TLA_CORE_DIR, CRONS = process.env.CRONS_DIR; if (!CORE_REAL || !CRONS) { console.error('TLA_CORE_DIR and CRONS_DIR required'); process.exit(1); }
const require = createRequire(import.meta.url);
const { stampAssetAlerts } = require(path.join(CRONS, 'token-catalog/token-catalog.js'));
const { applyAlerts } = require(path.join(CRONS, 'lp-grades/lp-grades.js'));
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x).slice(0, 300) : '')); } };
// --- stage ---
const CORE = fs.mkdtempSync(path.join(os.tmpdir(), 'core-alerts-'));
for (const e of fs.readdirSync(CORE_REAL)) if (e !== 'lp-grades') fs.symlinkSync(path.join(CORE_REAL, e), path.join(CORE, e));
fs.mkdirSync(path.join(CORE, 'lp-grades/snapshots'), { recursive: true });
for (const e of fs.readdirSync(path.join(CORE_REAL, 'lp-grades'))) if (e !== 'snapshots') fs.symlinkSync(path.join(CORE_REAL, 'lp-grades', e), path.join(CORE, 'lp-grades', e));
const reg = JSON.parse(fs.readFileSync(path.join(CORE_REAL, 'docs/curated/alerts.json')));
const cat = JSON.parse(fs.readFileSync(path.join(CORE_REAL, 'token-catalog/snapshots/current.json'))); stampAssetAlerts(cat.tokens, reg);
const grades = JSON.parse(fs.readFileSync(path.join(CORE_REAL, 'lp-grades/snapshots/current.json'))); applyAlerts(grades.pools, cat, reg);
fs.writeFileSync(path.join(CORE, 'lp-grades/snapshots/current.json'), JSON.stringify(grades));
const alerted = grades.pools.filter(p => p.alerts), assetAlerted = alerted.filter(p => p.alerts.some(a => a.kind === 'asset')), forumAlerted = alerted.filter(p => p.alerts.some(a => a.kind === 'forum'));
console.log(`staged: ${assetAlerted.length} asset-alerted pools, ${forumAlerted.length} forum-alerted (${forumAlerted.map(p => p.name).join(', ')})`);
// --- page ---
const read = (rel) => { const p = path.join(CORE, rel); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
const html = fs.readFileSync(path.join(here, 'tla-stats.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/tla-stats.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  w.SiteHeader = { mount() {}, subnav() { return { querySelectorAll: () => [] }; } }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined;
  w.Chart = class { constructor() { this.data = { datasets: [] }; } update() {} destroy() {} }; w.HTMLCanvasElement.prototype.getContext = () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, measureText: () => ({ width: 0 }) });
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {}; w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.console.log = () => {}; w.console.warn = () => {}; w.console.error = () => {};
  w.fetch = async (u) => { const clean = String(u).split('?')[0]; const m = /tla-core\/main\/(.+)$/.exec(clean); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
    if (m) { const b = read(m[1]); if (b == null) return nope; const t = b.toString('utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t, arrayBuffer: async () => b }; }
    if (/\/cosmos\/bank\/v1beta1\/balances\//.test(clean)) return { ok: true, status: 200, json: async () => ({ balances: [] }) };
    if (/\/cosmwasm\/wasm\/v1\/contract\//.test(clean)) return { ok: true, status: 200, json: async () => ({ data: { balance: '0', buckets: [] } }) };
    return nope; };
} });
await new Promise(r => setTimeout(r, 7000));
const w = dom.window, d = w.document;
const nav = d.createElement('div'); nav.innerHTML = ['overview', 'grades', 'pools', 'tla'].map(t => `<span class="sh-subtab" data-tab="${t}"></span>`).join(''); d.body.appendChild(nav);
w.eval('switchToTab')('grades'); await new Promise(r => setTimeout(r, 1500));
const pillsAsset = [...d.querySelectorAll('.alert-pill.alert-asset')], pillsForum = [...d.querySelectorAll('.alert-pill.alert-forum')];
check(`asset pills rendered (${pillsAsset.length}) — at least one per asset-alerted pool that the page renders, none elsewhere`, pillsAsset.length >= 1 && pillsAsset.every(p => /winding down · migrate by 2026-10-31/.test(p.textContent)), pillsAsset.map(p => p.textContent).slice(0, 3));
const pillRows = (sel) => [...d.querySelectorAll(sel)].map(p => (p.closest('div.min-w-0') || p.parentElement).textContent.trim());
check('every asset pill sits on a row whose name is an alerted pool (never on a clean one)', pillRows('.alert-pill.alert-asset').every(t => assetAlerted.some(p => t.includes(p.name.replace(/^cw20:|^native:/, '').slice(0, 12)) || t.includes(p.name))), pillRows('.alert-pill.alert-asset').slice(0, 3));
check(`forum pills rendered (${pillsForum.length}) and link to the discussion URL`, pillsForum.length >= 1 && pillsForum.every(p => /^forum: Capapult/.test(p.textContent) && /common\.xyz\/capapult/.test(p.getAttribute('href'))), pillsForum.map(p => [p.textContent, p.getAttribute('href')]).slice(0, 2));
check('the asset pill title carries the headline AND the action (what to do, by when)', pillsAsset.every(p => /Noble USDC/.test(p.title) && /Skip:Go/.test(p.title)));
// --- Advisor ---
const adv = d.getElementById('grades-advisor'); const advText = adv ? adv.textContent : '';
check('Advisor rendered', adv && advText.length > 100, advText.length);
const neverLines = [...adv.querySelectorAll('div')].filter(x => /winding down, never eligible:/.test(x.textContent) && x.children.length <= 1).map(x => x.textContent);
const votedUsdc = grades.pools.filter(p => p.alerts && p.alerts.some(a => a.kind === 'asset'));
check('each bucket that holds a winding-down pool says so ("winding down, never eligible: …")', neverLines.length >= 1 && neverLines.every(t => /USDC/.test(t)), neverLines);
// the Advisor renders two bars per bucket: "how we vote today" (current) and "THE LENSES SAY" (recommended). Only the second must be clean.
const lensesBars = [...adv.querySelectorAll('div')].filter(x => /^THE LENSES SAY/.test(x.textContent.trim()) && x.children.length <= 1).map(lbl => lbl.nextElementSibling).filter(Boolean).flatMap(bar => [...bar.querySelectorAll('div[title]')].map(x => x.getAttribute('title') || ''));
const todayBars = [...adv.querySelectorAll('div[title]')].map(x => x.getAttribute('title') || '').filter(t => /USDC/.test(t));
console.log(`  (aDAO votes today on USDC.n pools: ${todayBars.join(', ') || 'none'})`);
check('no winding-down pool appears in "THE LENSES SAY" recommended allocation', !lensesBars.some(t => votedUsdc.some(p => t.startsWith(p.name + ' '))), lensesBars.filter(t => /USDC/.test(t)));
const shiftRows = [...adv.querySelectorAll('div.text-\\[11px\\]')].map(x => x.textContent.trim());
const shiftOut = shiftRows.filter(t => /winding down —/.test(t));
console.log(`  (shift-out rows for currently-voted winding pools: ${shiftOut.length}${shiftOut.length ? ' → ' + shiftOut[0].slice(0, 140) : ' — aDAO votes no USDC.n pool today'})`);
check('a shift out of a winding pool, when present, carries the registry headline as its reason and is red (delta < 0)', shiftOut.length === todayBars.length && shiftOut.every(t => /Noble USDC/.test(t) && /^-/.test(t)), shiftOut);
const heads = [...adv.querySelectorAll('span.text-\\[10px\\]')].map(x => x.textContent.trim()).filter(t => /hold|proposable/.test(t));
console.log('  (bucket verdicts: ' + heads.join(' | ') + ')');
check('the bucket voting a winding pool is proposable on that ground alone, or blocked only by the earned bar (never "hold — not material")', todayBars.length === 0 || heads.some(t => /move votes off a winding-down pool/.test(t) || /not proposable yet/.test(t)), heads);
check('footer rev T3.21', /rev: 'T3\.21'/.test(fs.readFileSync(path.join(here, 'tla-stats.html'), 'utf8')));
fs.rmSync(CORE, { recursive: true, force: true });
console.log(`\n=== GATE tla-stats-alerts: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
