#!/usr/bin/env node
// gate-tla-nav.mjs — THE TLA TAB BAR and PD WATCH (owner 2026-11-25: "Overview, member portfolio, slippage simulator, vote
// simulator, LP grades, contract watch, PD watch" — PD placements out of LP Grades to a main tab, Pools hidden, Docs off the bar).
//   A  the one list (lib/site-header.js 1.14.0) and the bar it draws — the REAL lib, in jsdom
//   B  every TLA page takes its bar from that list (no page carries a copy), with its own tab lit
//   C  tla-stats.html, REAL page + REAL lib + the committed lp-grades series: PD Watch is its own tab, LP Grades keeps the pools
//      view, links handed out before the move still open the placement they name, Pools and Docs still open by link
// Every expected count is recounted here from the series with the page's own math library, never typed.
// Usage: TLA_CORE_DIR=/path/to/tla-core node gate-tla-nav.mjs
import { JSDOM, VirtualConsole } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
import { realHeader, isTlaBar, TLA_BAR, TLA_HREF } from './gate-header.mjs';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname); const require = createRequire(import.meta.url);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x).slice(0, 400) : '')); } };
const src = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const LIB = src('lib/site-header.js');

// ---------------------------------------------------------------- A · the list and the bar it draws
console.log('— A the one list, and the bar the lib draws from it —');
const H = realHeader();
check('the list is the owner\'s seven, in the owner\'s order', H.TLA_TABS.map((t) => t.label).join(' · ') === TLA_BAR.join(' · '), H.TLA_TABS.map((t) => t.label));
check('no Pools, no Docs, no TLA Stats tab in the list', !H.TLA_TABS.some((t) => /pools|docs|^tla$/i.test(t.id) || /^(Pools|Docs|LP Stats|TLA Stats)$/.test(t.label)));
check('Vote Simulator opens the Vote Market planner; PD Watch and LP Grades are sections of TLA Stats; Contract Watch is its own page', TLA_HREF.votesim === 'vote-market.html' && H.TLA_TABS.find((t) => t.id === 'votesim').href === 'vote-market.html' && H.TLA_TABS.find((t) => t.id === 'pdwatch').href === 'tla-stats.html#pdwatch' && H.TLA_TABS.find((t) => t.id === 'grades').href === 'tla-stats.html#grades' && H.TLA_TABS.find((t) => t.id === 'watch').href === 'contract-watch.html');
check('every tab\'s page exists in the site folder', H.TLA_TABS.every((t) => fs.existsSync(path.join(here, t.href.split('#')[0]))), H.TLA_TABS.map((t) => t.href));
check('tlaTabs(x) lights x and only x, on every page of the bar', H.TLA_TABS.every((t) => isTlaBar(H.tlaTabs(t.id), t.id)));
check('on TLA Stats its own three sections are buttons, the other four are links', isTlaBar(H.tlaTabs('overview', { inPage: 'tla-stats' }), 'overview', ['overview', 'grades', 'pdwatch']));
check('tlaTabs hands out fresh items (a page cannot edit the list for the next page)', (() => { const a = H.tlaTabs('watch'); a[0].label = 'x'; a.pop(); return isTlaBar(H.tlaTabs('watch'), 'watch'); })());
{ // the DOM the lib draws
  const d = new JSDOM('<!doctype html><html><head></head><body><div id="site-header"></div><div id="tile"></div></body></html>', { url: 'https://thealliancedao.com/contract-watch.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = d.window; w.eval(LIB); const picked = [];
  const nav = w.SiteHeader.subnav(w.SiteHeader.tlaTabs('watch'), { attach: '#tile' });
  const tabs = [...nav.querySelectorAll('.sh-subtab')];
  check('the bar drawn on a page: seven tabs in order, one lit, each a link to its page, inside the page\'s top tile', tabs.map((t) => t.textContent.trim()).join(' · ') === TLA_BAR.join(' · ') && tabs.filter((t) => t.classList.contains('active')).map((t) => t.textContent.trim()).join() === 'Contract Watch' && tabs.every((t) => t.tagName === 'A' && t.getAttribute('href') === TLA_HREF[t.getAttribute('data-tab')]) && nav.parentNode.id === 'tile', tabs.map((t) => t.tagName + ':' + t.getAttribute('href')));
  check('a bar of seven is marked for the closer fit (so every tab shows on a desktop screen) and the lib carries the wrap rule for it', nav.classList.contains('sh-many') && /\.sh-subnav\.sh-many \.sh-subwrap\{flex-wrap:wrap/.test(LIB) && /\.sh-subnav\.sh-many \.sh-subtab\{/.test(LIB));
  const d2 = new JSDOM('<!doctype html><html><head></head><body><div id="site-header"></div><div id="tile"></div></body></html>', { url: 'https://thealliancedao.com/tla-stats.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w2 = d2.window; w2.eval(LIB); const nav2 = w2.SiteHeader.subnav(w2.SiteHeader.tlaTabs('overview', { inPage: 'tla-stats' }), { attach: '#tile', onSelect: (id) => picked.push(id) });
  const b = (id) => nav2.querySelector('.sh-subtab[data-tab="' + id + '"]');
  b('pdwatch').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  check('on TLA Stats a click on PD Watch tells the page (onSelect) and moves the light', picked.join() === 'pdwatch' && b('pdwatch').classList.contains('active') && !b('overview').classList.contains('active') && b('pdwatch').tagName === 'BUTTON' && b('watch').tagName === 'A' && b('votesim').getAttribute('href') === 'vote-market.html', picked);
  const three = w.SiteHeader.subnav([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], { container: '#none' });
  check('a short bar on another page keeps the roomier look (not marked)', !three.classList.contains('sh-many'));
}

// ---------------------------------------------------------------- B · every page takes its bar from the list
console.log('— B every TLA page takes its bar from the list —');
const PAGES = { 'tla-stats.html': 'overview', 'member-portfolio.html': 'portfolio', 'slippage.html': 'slippage', 'vote-market.html': 'votesim', 'contract-watch.html': 'watch' };
for (const [f, id] of Object.entries(PAGES)) {
  const s = src(f);
  check(`${f}: builds its bar with SiteHeader.tlaTabs('${id}') and carries no copy of the list`, new RegExp("SiteHeader\\.subnav\\(SiteHeader\\.tlaTabs\\('" + id + "'").test(s) && !/\{ id: 'overview',\s+label: 'Overview'/.test(s) && !/label: '(Pools|Docs|LP Stats|TLA Stats)'/.test(s));
}
check('every page in the bar lights the TLA Stats tab of the site header (PAGE_GROUP)', Object.keys(PAGES).every((f) => { const p = f.replace(/\.html$/, ''); return p === 'tla-stats' || H.PAGE_GROUP[p] === 'tla-stats'; }));
check('the Vote Market page no longer carries its own "back to TLA Stats" button (the bar is the way back)', !/fa-arrow-left[^<]*<\/i>\s*TLA Stats/.test(src('vote-market.html')));
check('the docs hub is still one click from every page: the site footer lists it', /\['tla-docs\.html', 'Docs'/.test(src('lib/site-footer.js')));

// ---------------------------------------------------------------- C · tla-stats.html: PD Watch, LP Grades, old links, hidden sections
console.log('— C tla-stats.html: PD Watch is its own tab (real page, real lib, the committed series) —');
const read = (rel) => { const p = path.join(CORE, rel); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
const LPS = require(path.join(here, 'lib/lp-scorecard.js'));
const series = JSON.parse(read('lp-grades/series/pools.json')), config = JSON.parse(read('docs/curated/grading_config.json'));
const usable = series.placements.filter((p) => p.legs.some((l) => l.luna_per_epoch) && LPS.bribeCheck(series, config, p).best).map((p) => p.proposal_id).sort((a, b) => a - b);
const newest = usable[usable.length - 1], older = usable[Math.max(0, usable.length - 4)];
const inline = (js) => '<script>' + js.replace(/<\/script/gi, '<\\/script') + '</script>';   // a lib that writes a closing script tag in a string must not end the tag it is inlined in
const pageHtml = src('tla-stats.html').replace(/<script[^>]*src="\/lib\/site-header\.js[^"]*"[^>]*><\/script>/, () => inline(LIB)).replace(/<script[^>]*src="\/lib\/lp-scorecard\.js[^"]*"[^>]*><\/script>/, () => inline(src('lib/lp-scorecard.js'))).replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, '');
async function boot(urlTail) {
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { const t = String(e && (e.detail || e.message || e)).slice(0, 300); if (!/Could not parse CSS stylesheet/.test(t)) errors.push(t); });   // jsdom's CSS parser does not read color-mix(); a script error is what counts
  const dom = new JSDOM(pageHtml, { url: 'https://thealliancedao.com/tla-stats.html' + urlTail, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    w.SiteFooter = { mount(o) { w.__footer = o; } }; w.AddressPicker = undefined;
    w.Chart = class { constructor() { this.data = { datasets: [] }; } update() {} destroy() {} }; w.HTMLCanvasElement.prototype.getContext = () => null;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () { w.__scrolled = this.id; };
    w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { w.__copied = t; } }, configurable: true });
    w.fetch = async (u) => { const clean = String(u).split('?')[0]; const m = /tla-core\/main\/(.+)$/.exec(clean); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
      if (m) { const b = read(m[1]); if (b == null) return nope; const t = b.toString('utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t, arrayBuffer: async () => b }; }
      return nope; };
  } });
  const w = dom.window, d = w.document; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { } await wait(150); } return false; };
  const lit = () => [...d.querySelectorAll('.sh-subtab.active')].map((t) => t.textContent.trim()).join();
  const shown = () => [...d.querySelectorAll('.tab-content.active')].map((e) => e.id).join();
  const tab = (id) => d.querySelector('.sh-subtab[data-tab="' + id + '"]');
  const click = async (el) => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); await wait(60); };
  const pdReady = () => d.querySelector('#pdw-root #lps-bribe-card select[aria-label="PD placement"]');
  const poolsReady = () => d.querySelector('#lps-root #lps-table-card') && d.querySelector('#lps-root #lps-table-card').children.length > 0;
  await until(() => d.querySelectorAll('.sh-subtab').length === 7 && typeof w.switchToTab === 'function', 30000);
  return { w, d, wait, until, lit, shown, tab, click, pdReady, poolsReady, errors, text: (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim() };
}
const ids = (P) => ['lps-head', 'lps-table-card', 'lps-bribe-card'].map((i) => P.d.querySelectorAll('#' + i).length).join();
const [P, O, N, W, PO, DO] = await Promise.all([boot(''), boot('?prop=' + older + '#grades'), boot('?prop=' + newest), boot('?win=30d&bucket=stable#grades'), boot('#pools'), boot('#docs')]);

// the bar on the page itself
{ const tabs = [...P.d.querySelectorAll('.sh-subtab')];
  check('the bar on TLA Stats: the seven, Overview lit; Overview · LP Grades · PD Watch are buttons, the other four are links to their pages', tabs.map((t) => t.textContent.trim()).join(' · ') === TLA_BAR.join(' · ') && P.lit() === 'Overview' && P.shown() === 'tab-overview' && tabs.filter((t) => t.tagName === 'BUTTON').map((t) => t.getAttribute('data-tab')).join() === 'overview,grades,pdwatch' && tabs.filter((t) => t.tagName === 'A').every((t) => t.getAttribute('href') === TLA_HREF[t.getAttribute('data-tab')]), tabs.map((t) => t.tagName + ':' + t.textContent.trim()));
  check('the bar sits inside the page\'s top tile, with the epoch slot on its right', !!P.d.querySelector('#tla-top-tile > #site-subnav.attached') && !!P.d.querySelector('#site-subnav #sh-epoch-slot'));
}
// PD Watch
await P.click(P.tab('pdwatch')); const pdOk = await P.until(P.pdReady);
{ const sel = P.pdReady(); const opts = sel ? [...sel.options].map((o) => Number(o.value)).sort((a, b) => a - b) : [];
  check('a click on PD Watch opens its own section (#pdwatch), lit in the bar', pdOk && P.shown() === 'tab-pdwatch' && P.lit() === 'PD Watch' && P.w.location.hash === '#pdwatch', { shown: P.shown(), lit: P.lit(), hash: P.w.location.hash, errors: P.errors.slice(0, 2) });
  check(`PD Watch holds the placements audit: every placement the series can check (${usable.length}), the newest (prop ${newest}) open`, opts.join() === usable.join() && Number(sel && sel.value) === newest, { page: opts.length, files: usable.length, value: sel && sel.value });
  const head = P.text(P.d.querySelector('#pdw-root #lps-head'));
  check('its heading names it and spells PD out — "PD Watch … Phoenix Directive bribe placements" — and keeps the page\'s own stance ("The numbers decide; the page does not")', /^PD Watch Phoenix Directive bribe placements/.test(head) && /The numbers decide; the page does not\./.test(head), head.slice(0, 160));
  check('the audit\'s parts are all there: votes steered, the track record, the placement picker twice, the more-checks drawer', !!P.d.querySelector('#pdw-root #lps-sec-steer') && P.d.querySelectorAll('#pdw-root select[aria-label="PD placement"]').length === 2 && !!P.d.querySelector('#pdw-root details') && /Placements — audit/.test(P.text(P.d.querySelector('#pdw-root #lps-bribe-card'))));
  check('PD Watch shows no pools table and no pools controls; LP Grades\' own root is empty while PD Watch is open (no element id twice)', P.d.querySelector('#lps-root').children.length === 0 && P.d.querySelector('#pdw-root #lps-table-card').children.length === 0 && ids(P) === '1,1,1' && !/Window|Earns by|Grade lens/.test(P.text(P.d.querySelector('#pdw-root #lps-head > div > div:not(.hidden)') || P.d.querySelector('#pdw-root #lps-head')).replace(/.*The numbers decide; the page does not\./, '')), { ids: ids(P) });
  P.w.lpsCopyLink('prop', null); await P.wait(30);
  check('"copy link" on a placement hands out a PD Watch link (…?prop=N#pdwatch)', P.w.__copied === 'https://thealliancedao.com/tla-stats.html?prop=' + newest + '#pdwatch', P.w.__copied);
}
// LP Grades
await P.click(P.tab('grades')); const grOk = await P.until(P.poolsReady);
{ const head = P.text(P.d.querySelector('#lps-root #lps-head'));
  check('LP Grades opens the LP Scorecard\'s pools view (#grades), lit in the bar', grOk && P.shown() === 'tab-grades' && P.lit() === 'LP Grades' && P.w.location.hash === '#grades', { shown: P.shown(), lit: P.lit(), hash: P.w.location.hash });
  check('the two-view switch is gone from LP Grades: no "PD placements — audit" button, no placement audit, PD Watch\'s root empty', !/PD placements — audit|Pools — earns vs receives/.test(P.text(P.d.querySelector('#tab-grades'))) && P.d.querySelector('#lps-root #lps-bribe-card').children.length === 0 && P.d.querySelector('#pdw-root').children.length === 0 && ids(P) === '1,1,1' && /^LP Scorecard what each pool earns/.test(head), head.slice(0, 120));
  check('LP Grades keeps every pools control (window, earns by, bribes from, bucket, as of, grade lens, DEX)', ['Window', 'Earns by', 'Bribes from', 'Bucket', 'As of', 'Grade lens', 'DEX'].every((l) => new RegExp(l, 'i').test(head)));
  const ptr = [...P.d.querySelectorAll('#lps-root #lps-head a')].find((a) => /PD Watch/.test(a.textContent));
  check('LP Grades says where the PD audit went, with a link', !!ptr && /has its own tab now/.test(head) && ptr.getAttribute('href') === '#pdwatch');
  P.w.lpsCopyLink('', null); await P.wait(30);
  check('"copy link" on the pools view still hands out an LP Grades link (…#grades)', /^https:\/\/thealliancedao\.com\/tla-stats\.html\?win=[^#]+#grades$/.test(P.w.__copied || ''), P.w.__copied);
  if (ptr) { await P.click(ptr); const back = await P.until(P.pdReady); check('that link opens PD Watch', back && P.shown() === 'tab-pdwatch' && P.lit() === 'PD Watch' && P.w.location.hash === '#pdwatch' && ids(P) === '1,1,1', { shown: P.shown(), hash: P.w.location.hash }); }
  await P.click(P.tab('overview'));
  check('back to Overview: its section shows, Overview lit', P.shown() === 'tab-overview' && P.lit() === 'Overview');
  check('no script error on the page through all of it', P.errors.length === 0, P.errors.slice(0, 3));
}
// links handed out before the move
{ const ok = await O.until(O.pdReady); const sel = O.pdReady();
  check(`a placement link from before the move (…?prop=${older}#grades — what the page, the lp-grades product and the help bot handed out) opens PD Watch on that placement, and the address bar says #pdwatch`, ok && O.shown() === 'tab-pdwatch' && O.lit() === 'PD Watch' && Number(sel && sel.value) === older && O.w.location.hash === '#pdwatch' && O.w.location.search === '?prop=' + older, { shown: O.shown(), value: sel && sel.value, hash: O.w.location.hash, errors: O.errors.slice(0, 2) });
  const ok2 = await N.until(N.pdReady); const sel2 = N.pdReady();
  check(`a placement link with no tab at all (…?prop=${newest}) opens PD Watch on that placement too`, ok2 && N.shown() === 'tab-pdwatch' && Number(sel2 && sel2.value) === newest && N.w.location.hash === '#pdwatch', { shown: N.shown(), hash: N.w.location.hash });
  const ok3 = await W.until(W.poolsReady);
  check('a pools link (…?win=30d&bucket=stable#grades) still opens LP Grades, with its window and bucket', ok3 && W.shown() === 'tab-grades' && W.lit() === 'LP Grades' && W.w.location.hash === '#grades' && W.w.eval('lpsState.window + "|" + lpsState.bucket + "|" + lpsState.view') === '30d|stable|pools', { shown: W.shown(), state: W.w.eval('lpsState.window + "|" + lpsState.bucket + "|" + lpsState.view') });
}
// off the bar, still there
{ await PO.until(() => PO.shown() === 'tab-pools', 30000); await DO.until(() => DO.shown() === 'tab-docs', 30000);
  check('Pools is off the bar but its section still opens by link (tla-stats.html#pools) — nothing that points at it breaks; no tab is lit there', PO.shown() === 'tab-pools' && PO.lit() === '' && !PO.tab('pools'), { shown: PO.shown(), lit: PO.lit() });
  check('Docs is off the bar; the old #docs section still opens by link', DO.shown() === 'tab-docs' && DO.lit() === '' && !DO.tab('docs'), { shown: DO.shown(), lit: DO.lit() });
  check('the phone app\'s "All pools" button still has somewhere to go', /href="tla-stats\.html#pools"/.test(src('app.html')));
}
check('the footer carries rev T8.16 or later', /rev: 'T8\.(1[6-9]|[2-9]\d)(\.\d+)?'/.test(src('tla-stats.html')));
for (const X of [P, O, N, W, PO, DO]) X.w.close();
console.log(`\n=== GATE tla-nav: ${PASS} passed, ${FAIL} failed ===`);
process.exit(FAIL ? 1 : 0);
