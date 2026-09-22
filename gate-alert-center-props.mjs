// gate-alert-center-props.mjs — lib/alert-center.js alone (no index.html): the Props rules and the load popup.
// 1.10.0: a prop that EXECUTED before its vote closed is an alert while the vote is open (PD A265/A266 — 2026-09-22);
// the popup opens on render when an alert has not been seen; any close (X / Escape / mark seen) marks what it showed as seen. Run: node gate-alert-center-props.mjs  (from the repo root)
import { JSDOM } from 'jsdom'; import fs from 'fs';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 400) : '')); } };
const mk = () => { const dom = new JSDOM('<!doctype html><html><body><div id="ac"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://thealliancedao.com/' }); const w = dom.window; w.eval(fs.readFileSync('lib/alert-center.js', 'utf8')); return { w, d: w.document }; };
const now = Date.now(), D = 864e5;
const cards = [
  { dao: 'Phoenix Directive Stewardship', id: 'pd265', title: '[pdt] Setup OTC (CoinGecko: 0.05383, …)', status: 'Executed', live: false, pending: false, endIso: new Date(now + 5 * D).toISOString(), startIso: new Date(now - 2 * D).toISOString(), yesPct: 75, noPct: 0, turnoutPct: 75, link: '#' },
  { dao: 'Phoenix Directive Stewardship', id: 'pd266', title: '[pdt] Setup Estima Grant', status: 'Executed', live: false, pending: false, endIso: new Date(now + 5 * D).toISOString(), startIso: new Date(now - 2 * D).toISOString(), yesPct: 75, turnoutPct: 75, link: '#' },
  { dao: 'Pixellions Council', id: 'p48', title: 'Test Migrate USDC.n to USDC.inj', status: 'Open', live: true, pending: false, daysLeft: 0.2, endIso: new Date(now + 0.2 * D).toISOString(), link: '#' },
  { dao: 'Pixellions Council', id: 'p47', title: 'Convert July & August Validator Rewards to USDC', status: 'Executed', live: false, pending: false, endIso: new Date(now - 2 * D).toISOString(), link: '#' },
  { dao: 'Terra (LUNA)', id: 'l4851', title: 'v2.21', status: 'Passed', live: false, pending: false, endIso: new Date(now - 4 * D).toISOString(), link: '#' },
];
{ const { w } = mk(); ok('lib loads: AlertCenter 1.10.0', w.AlertCenter && w.AlertCenter.VERSION === '1.10.0', w.AlertCenter && w.AlertCenter.VERSION);
  const R = w.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen: (c) => !!(c.live || c.pending) }, items: [] }, {});
  const P = R.tiles.find(t => t.key === 'props'); const C = Object.fromEntries(P.counters.map(c => [c.key, c]));
  console.log('— the Props rules');
  ok('counters in order: Live · Executed early · Veto lock · Executed', P.counters.map(c => c.key).join(',') === 'live,early,veto,exec');
  ok('the live vote (#48) is an alert under Live', C.live.n === 1 && C.live.rows[0].severity === 'alert' && /#48|Migrate/.test(C.live.rows[0].label), C.live.rows.map(r => r.label));
  ok('PD A265 + A266 — executed with 5 days of voting left — are ALERTS under "Executed early", with the days left and the yes/turnout in the value; both notable', C.early.n === 2 && C.early.rows.every(r => r.severity === 'alert' && r.rule === 'prop:executed_early' && /EXECUTED with 5 days of voting left/.test(r.value) && /yes 75%/.test(r.value) && /turnout 75%/.test(r.value) && r.notable), C.early.rows.map(r => r.value));
  ok('they do NOT also sit under Executed (that counter is for votes that closed in the window): #47 and l4851 do', C.exec.n === 2 && C.exec.rows.every(r => /Convert July|v2\.21/.test(r.label)) && C.exec.rows.every(r => r.severity === 'info'), C.exec.rows.map(r => r.label));
  ok('the Props tile: 3 need a look (1 live + 2 early), 5 in total', P.alerts === 3 && P.total === 5, [P.alerts, P.total]);
  const R2 = w.AlertCenter.build({ now: now + 6 * D, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen: (c) => !!(c.live || c.pending) }, items: [] }, {});
  const C2 = Object.fromEntries(R2.tiles.find(t => t.key === 'props').counters.map(c => [c.key, c]));
  ok('six days later their votes have closed: they leave "Executed early" and count under Executed (vote end inside the window) — as activity', C2.early.n === 0 && C2.exec.rows.filter(r => /pdt/.test(r.label)).length === 2, [C2.early.n, C2.exec.n]);
}
console.log('— the load popup (both: banner + full view)');
{ const { w, d } = mk(); const R = w.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen: (c) => !!(c.live || c.pending) }, items: [] }, {});
  const out = w.AlertCenter.render(d.getElementById('ac'), R, { document: d });
  ok('first visit (no marker): the banner renders AND the full view opens by itself on the Props tile', out.popped === true && !!d.getElementById('ac-full') && /3 things need a look/.test(d.getElementById('ac').textContent) && d.getElementById('ac-full').textContent.includes('Executed early'), [out, !!d.getElementById('ac-full')]);
  const seenBtn = [...d.querySelectorAll('#ac-full button')].find(b => /seen/i.test(b.textContent)); ok('the full view offers "mark seen"', !!seenBtn, [...d.querySelectorAll('#ac-full button')].map(b => b.textContent.trim()).slice(0, 8));
  seenBtn.click(); ok('mark seen: the view closes, the marker moves to now, and the 3 alert keys are stored as seen', !d.getElementById('ac-full') && Math.abs(w.AlertCenter.marker.get() - now) < 1000 && JSON.parse(w.localStorage.getItem('ac-seen-alerts')).length === 3, w.localStorage.getItem('ac-seen-alerts'));
  const R3 = w.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen: (c) => !!(c.live || c.pending) }, items: [] }, {});
  const out3 = w.AlertCenter.render(d.getElementById('ac'), R3, { document: d });
  ok('re-render after mark-seen: every alert is already seen → the banner still says 3 need a look, but NO popup', out3.popped === false && !d.getElementById('ac-full') && /3 things need a look/.test(d.getElementById('ac').textContent), out3);
  const later = [...cards, { dao: 'Alliance DAO', id: 'a99', title: 'a new vote', status: 'Open', live: true, pending: false, endIso: new Date(now + 3 * D).toISOString(), link: '#' }];
  const R4 = w.AlertCenter.build({ now: now + 60e3, alertsDoc: { alerts: [] }, lpPools: [], props: { cards: later, isOpen: (c) => !!(c.live || c.pending) }, items: [] }, {});
  const out4 = w.AlertCenter.render(d.getElementById('ac'), R4, { document: d });
  ok('a new alert after the marker (a fresh live vote) → the popup opens again', out4.popped === true && !!d.getElementById('ac-full'), out4);
  d.getElementById('ac-full-close').click(); const out5 = w.AlertCenter.render(d.getElementById('ac'), R4, { document: d });
  ok('closing with the X marks what was shown as seen (4 keys now) → no popup on the next render; it returns only for something new', out5.popped === false && !d.getElementById('ac-full') && JSON.parse(w.localStorage.getItem('ac-seen-alerts')).length === 4, [out5, w.localStorage.getItem('ac-seen-alerts')]);
  const { w: w2, d: d2 } = mk(); const out6 = w2.AlertCenter.render(d2.getElementById('ac'), w2.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen: (c) => !!(c.live || c.pending) }, items: [] }, {}), { document: d2, popup: false });
  ok('opts.popup = false keeps the old behaviour (banner only)', out6.popped === false && !d2.getElementById('ac-full'), out6);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
