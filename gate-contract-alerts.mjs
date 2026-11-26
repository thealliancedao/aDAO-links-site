#!/usr/bin/env node
// gate-contract-alerts.mjs — the home page's Contracts tab (lib/contract-alerts.js) with the REAL tab bar (lib/site-header.js)
// and a REAL alerts file (ALERTS = a contract-watch/alerts.json built by tla-core .github/scripts/contract-watch-alerts).
// Every expected number is counted from that file. Usage: NODE_PATH=… ALERTS=<file> node gate-contract-alerts.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname); const F = (f) => fs.readFileSync(path.join(here, f), 'utf8');
if (!process.env.ALERTS) { console.error('ALERTS required'); process.exit(1); }
const real = JSON.parse(fs.readFileSync(process.env.ALERTS, 'utf8')); const lib = F('lib/contract-alerts.js'), header = F('lib/site-header.js'), index = F('index.html');
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x !== undefined ? '  ← ' + JSON.stringify(x).slice(0, 400) : '')); } };
const D = 864e5; const newest = Math.max(...real.needs_look.map((x) => Date.parse(x.at)));
async function home(data, now) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="site-header"></div><div id="alert-center-card"><div id="winddown-strip"></div><div id="alert-center">PROPS</div></div></body></html>', { url: 'https://theadao.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.eval(header); w.eval(lib);
  w.SiteHeader.subnav([{ id: 'alerts', label: 'Props', icon: 'fa-scroll', active: true }, { id: 'contracts', label: 'Contracts', icon: 'fa-file-contract', href: '/contract-watch.html' }], { onSelect() { }, attach: '#alert-center-card' });
  const res = await w.ContractAlerts.mount({ src: 'x', now, fetchJson: async () => data });
  const d = w.document, tab = d.querySelector('#site-subnav [data-tab="contracts"]'), props = d.querySelector('#site-subnav [data-tab="alerts"]');
  const click = (el, o = {}) => { const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true, ...o }); el.dispatchEvent(ev); return ev; };
  return { w, d, tab, props, res, click, panel: d.getElementById('contract-alerts'), text: (el) => (el.textContent || '').replace(/\s+/g, ' ').trim() };
}
console.log('— A the page wires it —');
check('index.html loads lib/contract-alerts.js, lists a Contracts tab that is a link to Contract Watch, and mounts it on the alerts file in tla-core', /lib\/contract-alerts\.js\?v=1\.0\.0/.test(index) && /id: 'contracts', label: 'Contracts'[^}]*href: '\/contract-watch\.html'/.test(index) && /ContractAlerts\.mount\(\{ src: 'https:\/\/raw\.githubusercontent\.com\/thealliancedao\/tla-core\/main\/contract-watch\/alerts\.json/.test(index));
check('the real alerts file: a list, newest first, every entry with a key, a time, a title, a contract name, a route and a reason', real.needs_look.length >= 1 && real.needs_look.every((x, i) => x.k && x.at && x.title && x.on && x.how && x.why.length && (i === 0 || Date.parse(real.needs_look[i - 1].at) >= Date.parse(x.at))), real.needs_look.length);

console.log('— B quiet —');
for (const [name, data, now] of [['the file cannot be read', null, newest + D], ['the file holds nothing', { needs_look: [] }, newest + D], ['the newest marked change is 31 days old', real, newest + 31 * D], ['the file is not what was expected', { needs_look: 'x' }, newest + D]]) {
  const H = await home(data, now); const ev = H.click(H.tab);
  check(`${name}: the tab is a plain link to Contract Watch — no glow, no count, no panel, and a click is left to the browser`, H.res.state === 'quiet' && H.tab.tagName === 'A' && H.tab.getAttribute('href') === '/contract-watch.html' && !H.tab.classList.contains('ca-alert') && !H.tab.querySelector('.ca-n') && !H.panel && !ev.defaultPrevented && H.props.classList.contains('active'), { state: H.res.state, cls: H.tab.className });
}

console.log('— C alerting —');
{ const now = newest + D, exp = real.needs_look.filter((x) => Date.parse(x.at) >= now - 30 * D), old = real.needs_look.filter((x) => Date.parse(x.at) < now - 30 * D);
  const H = await home(real, now), rows = () => [...H.d.querySelectorAll('#contract-alerts .ca-row')];
  check(`the day after the newest marked change: the tab glows and carries the count (${exp.length}); the panel exists and is hidden; Props is still the open tab`, H.res.state === 'alert' && H.tab.classList.contains('ca-alert') && H.text(H.tab.querySelector('.ca-n')) === String(exp.length) && !!H.panel && H.panel.hidden && H.props.classList.contains('active') && H.d.getElementById('alert-center').style.display !== 'none', { n: exp.length, cls: H.tab.className });
  const ev = H.click(H.tab);
  check('a click opens the panel in the home window instead of leaving the page: the props are hidden, the Contracts tab is the open one', ev.defaultPrevented && !H.panel.hidden && H.d.getElementById('alert-center').style.display === 'none' && H.tab.classList.contains('active') && !H.props.classList.contains('active') && H.tab.getAttribute('aria-expanded') === 'true');
  check(`the panel says "${exp.length} contract change${exp.length === 1 ? '' : 's'} in the last 30 days need${exp.length === 1 ? 's' : ''} a look" and lists exactly those, newest first, each a link to that change on Contract Watch`, new RegExp(`^${exp.length} contract changes? in the last 30 days needs? a look`).test(H.text(H.panel.querySelector('h3'))) && rows().length === exp.length && rows().every((a, i) => a.getAttribute('href') === '/contract-watch.html#k=' + encodeURIComponent(exp[i].k)), rows().map((a) => a.getAttribute('href')));
  check('each row gives the day and time, what changed, the contract, how it was sent and every reason the page gives — as text', rows().every((a, i) => { const t = H.text(a), x = exp[i]; return t.includes(x.title) && t.includes(x.on) && t.includes(x.how) && x.why.every((y) => t.includes(y)) && /\d{1,2} \w{3} \d{4} · \d\d:\d\d UTC/.test(t); }), H.text(rows()[0]).slice(0, 300));
  const foot = H.panel.querySelector('.ca-foot'), olderA = foot.querySelector('[data-ca="older"]');
  check(`the foot: ${old.length ? `"${old.length} older change${old.length === 1 ? '' : 's'} on record also need${old.length === 1 ? 's' : ''} a look" linking to them, ` : ''}what the mark means, and Open Contract Watch`, (old.length ? !!olderA && olderA.getAttribute('href') === '/contract-watch.html#att=look' && new RegExp(`^${old.length} older change`).test(H.text(olderA)) : !olderA) && /The mark is not a verdict/.test(H.text(foot)) && foot.querySelector('[data-ca="open"]').getAttribute('href') === '/contract-watch.html' && !!foot.querySelector('a[href="/contract-watch.html#cw-look-means"]'), H.text(foot));
  H.click(H.props);
  check('the Props tab brings the props back and closes the panel; the Contracts tab keeps glowing', H.panel.hidden && H.d.getElementById('alert-center').style.display !== 'none' && H.props.classList.contains('active') && !H.tab.classList.contains('active') && H.tab.classList.contains('ca-alert'));
  H.click(H.tab); H.click(H.tab);
  check('a second click on the Contracts tab closes the panel again', H.panel.hidden && H.props.classList.contains('active'));
  const ev2 = H.click(H.tab, { ctrlKey: true });
  check('a Ctrl/Cmd-click is left to the browser (opens Contract Watch in a new tab)', !ev2.defaultPrevented && H.panel.hidden);
  check('no small print: nothing in the panel is styled under 13px', !/font-size:\s*(?:[0-9]|1[0-2])px/.test(lib) && !/#contract-alerts[^}]*font-size:\.[0-7]\d*r?em/.test(lib));
}
console.log('— D the window, and data as text —');
{ const now = Date.parse('2026-12-01T00:00:00Z'); const mk = (k, at, title) => ({ k, at, height: 1, title, on: 'C', how: 'Sent directly', why: ['R'] });
  const data = { needs_look: [mk('a', '2026-11-30T00:00:00Z', 'new'), mk('b', '2026-11-01T00:00:01Z', 'edge in'), mk('c', '2026-10-31T23:59:59Z', 'edge out'), mk('d', '2026-12-05T00:00:00Z', 'future'), { k: 'e', at: 'nonsense', title: 'bad time' }, { at: '2026-11-30T00:00:00Z', title: 'no key' }, mk('f', '2026-11-29T00:00:00Z', '<img src=x onerror=alert(1)>')] };
  const H = await home(data, now); H.click(H.tab); const rows = [...H.d.querySelectorAll('#contract-alerts .ca-row')];
  check('30 days to the second: in at 30 days less a second, out a second past; an entry dated in the future, with no readable time or with no key is not shown', H.res.recent.map((x) => x.k).join() === 'a,f,b' && H.res.older.map((x) => x.k).join() === 'c' && rows.length === 3, { recent: H.res.recent.map((x) => x.k), older: H.res.older.map((x) => x.k) });
  check('a title is shown as text, never as markup', !H.panel.querySelector('img') && H.text(rows[1]).includes('<img src=x onerror=alert(1)>'));
}
console.log(`\n=== GATE (contract-alerts): ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
