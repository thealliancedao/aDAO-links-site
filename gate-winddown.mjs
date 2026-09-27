#!/usr/bin/env node
// gate-winddown.mjs — the Noble USDC sweep (lib/winddown.js 1.0.0 and every page that uses it) on REAL fixtures.
// A. the lib against the committed products: curated alerts.json + lp-grades + member-data positions/participants + Lion DAO positions
//    (expected values are computed here from the raw rows, independent of the lib)
// B. the pages in jsdom with their own scripts: liondao/dao_treasury.html (a USDC.n balance row pill + one banner for that wallet),
//    liondao/dao_tla_deposits.html (dust legs never flag), dao_tla_deposits.html (the treasury's USDC.nbl-SOLID row + banner),
//    index.html's strip snippet, tla-stats' Pools-tab pill source (lp-grades, not the snapshot row)
// Usage: TLA_CORE_DIR=<tla-core> DAOO_DIR=<dao-originations> NFTC_DIR=<nft-collections> node gate-winddown.mjs
import { JSDOM, VirtualConsole } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const CORE = process.env.TLA_CORE_DIR, DAOO = process.env.DAOO_DIR, NFTC = process.env.NFTC_DIR || '';
if (!CORE || !DAOO) { console.error('TLA_CORE_DIR and DAOO_DIR required'); process.exit(1); }
const SITE = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', DAOO_U = 'https://raw.githubusercontent.com/thealliancedao/dao-originations/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); } };
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const WDL = createRequire(import.meta.url)(path.join(SITE, 'lib/winddown.js'));
const alertsDoc = J(path.join(CORE, 'docs/curated/alerts.json')), grades = J(path.join(CORE, 'lp-grades/snapshots/current.json'));
const AL = alertsDoc.alerts.find(a => a.id === 'usdc-noble-winddown'); const DEN = AL.denom;
const isN = (x) => x && (x.symbol === AL.symbol || String(x.denom || '').endsWith(DEN.replace(/^ibc\//, '')));
const legUsd = (lp) => (lp.underlying_token_amounts || []).filter(x => isN(x) && (x.usd_value ?? 0) >= 1).reduce((a, x) => a + x.usd_value, 0);
const balUsd = (bs) => (bs || []).filter(b => isN(b) && (b.usd_value ?? 0) >= 1).reduce((a, b) => a + b.usd_value, 0);
const T = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();

console.log('— A. lib/winddown.js ' + WDL.VERSION + ' on the committed products');
const W = WDL.build(alertsDoc, grades);
ok('one active asset alert (usdc-noble-winddown, status ' + AL.status + ')', W.alerts.length === 1 && W.alerts[0].id === AL.id);
ok('forDenom: the Noble IBC denom, with or without a native: prefix', W.forDenom(DEN) === AL && W.forDenom('native:' + DEN) === AL);
ok('forSymbol: USDC.n; plain USDC / USDt / EURe never match', W.forSymbol('USDC.n') === AL && !W.forSymbol('USDC') && !W.forSymbol('USDt') && !W.forSymbol('EURe'));
const flagged = grades.pools.filter(p => (p.alerts || []).some(a => a.id === AL.id));
ok('forPool: every lp-grades gauge stamped upstream (' + flagged.length + ') resolves — incl. the venue spellings LUNA-USDC / USDC.nbl-*', flagged.length > 0 && flagged.every(p => W.forPool(p.gauge_pool_id) === AL) && flagged.some(p => p.name === 'LUNA-USDC'), flagged.map(p => p.name));
ok('forPool: an unflagged gauge does not resolve', grades.pools.filter(p => !(p.alerts || []).length).every(p => !W.forPool(p.gauge_pool_id)));
const pos = J(path.join(CORE, 'member-data/positions/current.json'));
const tre = W.scan({ lps: pos.treasury.lp_positions, balances: pos.treasury.wallet_balances }); const treExp = pos.treasury.lp_positions.reduce((a, l) => a + legUsd(l), 0) + balUsd(pos.treasury.wallet_balances);
ok('aDAO treasury: scan = ' + treExp.toFixed(2) + ' USD of USDC.n (the USDC.nbl-SOLID leg)', tre.length === 1 && Math.abs(tre[0].usd - treExp) < 0.01 && tre[0].lps === 1, tre);
const part = J(path.join(CORE, 'member-data/participants/current.json')).members;
let hitsN = 0, hitsUsd = 0, expN = 0, expUsd = 0, dustOnly = 0;
for (const m of part) { const s = W.scan({ lps: m.lp_positions, balances: m.wallet_balances }); const e = (m.lp_positions || []).reduce((a, l) => a + legUsd(l), 0) + balUsd(m.wallet_balances); if (s.length) { hitsN++; hitsUsd += s[0].usd; } if (e > 0) { expN++; expUsd += e; } if (!e && (m.lp_positions || []).some(l => (l.underlying_token_amounts || []).some(isN))) dustOnly++; }
ok('TLA participants: ' + expN + ' wallets hold $' + Math.round(expUsd).toLocaleString('en-US') + ' of USDC.n (≥ $1 legs) — the lib finds the same', hitsN === expN && Math.abs(hitsUsd - expUsd) < 0.5, { hitsN, expN, hitsUsd, expUsd });
ok(dustOnly + ' wallets with only dust USDC.n legs (< $1) are not flagged', dustOnly >= 0 && hitsN === expN);
const lion = J(path.join(DAOO, 'lion-dao/positions/current.json'));
const lionHits = Object.entries(lion.wallets).map(([a, w]) => ({ a, w, s: W.scan({ lps: (w.portfolio || {}).lp_positions, balances: w.balances }) })).filter(x => x.s.length);
const lionExp = Object.entries(lion.wallets).map(([a, w]) => ({ a, e: balUsd(w.balances) + ((w.portfolio || {}).lp_positions || []).reduce((s, l) => s + legUsd(l), 0) })).filter(x => x.e > 0);
ok('Lion DAO: ' + lionExp.length + ' wallet(s) hold USDC.n ≥ $1 — ' + lionExp.map(x => x.a.slice(-6) + ' $' + x.e.toFixed(2)).join(', '), lionHits.length === lionExp.length && lionHits.every(h => Math.abs(h.s[0].usd - lionExp.find(x => x.a === h.a).e) < 0.01), lionHits.map(h => [h.a.slice(-6), h.s[0].usd]));
const b = WDL.banner({ alert: AL, usd: 3756.15, n: 1 }, { who: 'X', now: Date.parse('2026-09-27T12:00:00Z') });
ok('banner: who · amount · move to USDC.inj by Oct 31 (34 days on 09-27) · both curated links', /X holds \$3,756 of USDC\.n/.test(T(new JSDOM(b).window.document.body)) && /USDC\.inj by Oct 31 \(35 days\)|USDC\.inj by Oct 31 \(34 days\)/.test(T(new JSDOM(b).window.document.body)) && AL.links.every(l => b.includes(l.url)), T(new JSDOM(b).window.document.body));
ok('pill links the step-by-step migration doc and says "USDC.n ending · move by Oct 31"', WDL.pill(AL).includes(AL.links[0].url) && /USDC\.n ending · move by Oct 31/.test(T(new JSDOM(WDL.pill(AL)).window.document.body)));
ok('an inactive entry never flags (status → resolved)', WDL.build({ alerts: [Object.assign({}, AL, { status: 'resolved' })] }, grades).alerts.length === 0 && !WDL.build({ alerts: [Object.assign({}, AL, { status: 'resolved' })] }, null).forDenom(DEN));

console.log('— B. pages (jsdom, the page\'s own script)');
const files = (u) => { const url = String(u).split('?')[0]; if (url.startsWith(CORE_U)) return path.join(CORE, url.slice(CORE_U.length)); if (url.startsWith(DAOO_U)) return path.join(DAOO, url.slice(DAOO_U.length)); if (NFTC && url.startsWith(NFTC_U)) return path.join(NFTC, url.slice(NFTC_U.length)); if (url.startsWith('https://thealliancedao.com/')) return path.join(SITE, url.slice('https://thealliancedao.com/'.length)); return null; };
async function run(file, libs, wait) {
  const pageUrl = 'https://thealliancedao.com/' + file;
  const html = fs.readFileSync(path.join(SITE, file), 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { url: pageUrl, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); win.scrollTo = () => {}; win.requestAnimationFrame = (f) => setTimeout(f, 0); win.requestIdleCallback = (f) => setTimeout(f, 10); win.Element.prototype.scrollIntoView = () => {};
    win.HTMLCanvasElement.prototype.getContext = () => ({}); win.Chart = function () { this.destroy = () => {}; this.update = () => {}; }; win.Chart.defaults = { font: {}, color: '' }; win.Chart.register = () => {};
    win.fetch = (u) => { const url = new URL(String(u), pageUrl).href; const f = files(url); if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }); } return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }); };
    for (const lib of libs) win.eval(fs.readFileSync(path.join(SITE, lib), 'utf8'));
  } });
  const w = dom.window; w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
  await new Promise(r => setTimeout(r, wait || 2500)); return w;
}
const LDLIBS = ['lib/collection-context.js', 'lib/site-header.js', 'liondao/lib/ld.js', 'lib/cron-registry.js', 'lib/site-footer.js', 'lib/winddown.js'];
{ const w = await run('liondao/dao_treasury.html', LDLIBS); const d = w.document; const hold = d.getElementById('holdings');
  const exp = lionExp.sort((a, b) => b.e - a.e)[0]; const label = (J(path.join(CORE, 'docs/curated/tenants.json')).tenants.liondao.wallets[exp.a] || {}).label;
  ok('Lion DAO treasury: one banner per holding wallet (' + lionExp.length + ')', hold && hold.querySelectorAll('.wd-banner').length === lionExp.length, T(hold).slice(0, 200));
  ok('the banner names the wallet (' + label + ') and $' + Math.round(exp.e).toLocaleString('en-US'), hold && label && T(hold.querySelector('.wd-banner')).includes(label + ' holds $' + Math.round(exp.e).toLocaleString('en-US')), hold && T(hold.querySelector('.wd-banner')));
  const pills = hold ? [...hold.querySelectorAll('tr .wd-pill')] : []; ok('the USDC.n balance row carries the pill (' + lionExp.length + ' row); the dust validator balance does not', pills.length === lionExp.length && pills.every(p => /USDC\.n/.test(T(p.closest('tr')))), pills.map(p => T(p.closest('tr')).slice(0, 80)));
  ok('page rev 1.1', /1\.1/.test(T(d.getElementById('page-rev')) || d.body.innerHTML.includes("REV = '1.1'")));
  // lib missing → the page renders as before, no flag, no crash
  const w2 = await run('liondao/dao_treasury.html', LDLIBS.filter(x => x !== 'lib/winddown.js')); ok('lib missing → holdings still render, no banner', w2.document.getElementById('holdings').querySelectorAll('table').length > 0 && !w2.document.querySelector('.wd-banner')); }
{ const w = await run('liondao/dao_tla_deposits.html', LDLIBS); const d = w.document; const lpsAll = Object.values(lion.wallets).flatMap(x => ((x.portfolio || {}).lp_positions || [])); const expLp = lpsAll.filter(l => legUsd(l) > 0).length;
  ok('Lion DAO TLA: ' + expLp + ' LP(s) with a USDC.n leg ≥ $1 → ' + expLp + ' pill(s) (the 1e-6 dust leg is not flagged)', d.querySelectorAll('#pools .wd-pill').length === expLp && d.querySelectorAll('#pools .wd-banner').length === (expLp ? 1 : 0), T(d.getElementById('pools')).slice(0, 160)); }
{ const w = await run('dao_tla_deposits.html', ['lib/tla-decompose.js', 'lib/adao-live-data.js', 'lib/winddown.js', 'lib/cron-registry.js', 'lib/site-footer.js'], 6000); const d = w.document; const c = d.getElementById('positions-table');
  const row = c && [...c.querySelectorAll('tr.pool-row')].find(r => r.querySelector('.wd-pill'));
  ok('aDAO TLA deposits: the treasury banner ($' + treExp.toFixed(2) + ' of USDC.n in 1 place)', c && c.querySelectorAll('.wd-banner').length === 1 && T(c.querySelector('.wd-banner')).includes('$' + treExp.toFixed(2) + ' of USDC.n in 1 place'), c && T(c).slice(0, 200));
  ok('the pill sits on the USDC.nbl-SOLID row, and only there', row && /USDC\.nbl-SOLID/.test(T(row)) && c.querySelectorAll('.wd-pill').length === 1, c && [...c.querySelectorAll('.wd-pill')].map(p => T(p.closest('tr')).slice(0, 40))); }
{ // index 4.41: the strip snippet exactly as the page runs it
  const src = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'); const line = src.split('\n').find(l => l.includes("document.getElementById('winddown-strip')"));
  const dom = new JSDOM('<div id="winddown-strip"></div>', { runScripts: 'outside-only' }); dom.window.eval(fs.readFileSync(path.join(SITE, 'lib/winddown.js'), 'utf8'));
  dom.window.a = alertsDoc; dom.window.g = grades; dom.window.eval(line.trim().replace(/\/\/ 4\.41$/, ''));
  const t = T(dom.window.document.getElementById('winddown-strip'));
  ok('index strip: "USDC.n is ending · Move to USDC.inj by Oct 31 · ' + flagged.length + ' TLA pools hold it · How to migrate"', /USDC\.n is ending/.test(t) && /Move to USDC\.inj by Oct 31/.test(t) && t.includes(flagged.length + ' TLA pools hold it') && /How to migrate/.test(t), t);
  ok('index: the strip sits above the Alert Center and the lib is loaded', /id="winddown-strip"[\s\S]{0,300}id="alert-center"/.test(src) && src.includes('/lib/winddown.js?v=1.0.0')); }
{ // tla-stats T6.13.4: the Pools tab pill reads lp-grades (the snapshot row carries no alerts)
  const src = fs.readFileSync(path.join(SITE, 'tla-stats.html'), 'utf8'); const snap = J(path.join(CORE, 'member-data/tla-snapshot/current.json'));
  ok('the tla-snapshot pool rows carry no alerts (why the pill was silent)', snap.pools.every(p => !p.alerts));
  ok('Pools tab: alertPills(grades[r.p.gauge_pool_id] || r.p)', src.includes('${alertPills(grades[r.p.gauge_pool_id] || r.p)}'));
  const byId = {}; grades.pools.forEach(g => { byId[g.gauge_pool_id] = g; }); const onTab = snap.pools.filter(p => byId[p.gauge_pool_id] && (byId[p.gauge_pool_id].alerts || []).some(a => a.id === AL.id));
  ok(onTab.length + ' Pools-tab rows now resolve a wind-down alert: ' + onTab.map(p => p.name).join(', '), onTab.length > 0, onTab.length); }

console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
