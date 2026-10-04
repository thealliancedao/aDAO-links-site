// gate-alert-center-daos.mjs — lib/alert-center.js 2.2.0 alone (jsdom) on the REAL governance capture (dao-originations, 5 DAOs):
//  P1 the props window opens on load when a prop is open · P2 not again in the same visit · P3 again on the next visit (new session)
//  P4 "don't pop up until a new prop opens" mutes it across visits · P5 a NEW prop brings it back · P6 popupReady:false holds it
//  D1 the directory lists every watched governance; its numbers are the capture's own (relation) and aDAO's are literal (39 · 36 · 3)
//  D2 home chips: one per DAO, the open one lit · D3 a row opens that DAO's full list, newest first; a row expands to the full card
//  D4 a DAO without captured history reads its latest 25 through opts.loadHistory once; the count loses its "+"
//  D5 open props are not counted twice in the window header (directory repeats them)
// Run: CORPUS_DIR=<dir with adao.json lion-dao.json pixel-lions.json capapult.json terra.json> node gate-alert-center-daos.mjs  (repo root)
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 400) : '')); } };
const LIB = fs.readFileSync(process.env.LIB || 'lib/alert-center.js', 'utf8'); const DIR = process.env.CORPUS_DIR;
const mk = (storage) => { const dom = new JSDOM('<!doctype html><html><body><div id="ac"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://thealliancedao.com/' });
  const w = dom.window; if (storage) { for (const [k, v] of Object.entries(storage.local || {})) w.localStorage.setItem(k, v); for (const [k, v] of Object.entries(storage.session || {})) w.sessionStorage.setItem(k, v); } w.eval(LIB); return { w, d: w.document }; };
const snap = (w) => ({ local: Object.fromEntries(Object.keys(w.localStorage).map(k => [k, w.localStorage.getItem(k)])), session: Object.fromEntries(Object.keys(w.sessionStorage).map(k => [k, w.sessionStorage.getItem(k)])) });
const now = Date.now();
// the capture → cards, as index.html's corpusCard does (status lower_snake, an "open" vote past its end is not live)
const SLUG = { 'aDAO': 'adao', 'Lion DAO': 'lion-dao', 'Pixellions': 'pixel-lions', 'CAPA Governance': 'capapult', 'Terra (LUNA)': 'terra' };
const cards = []; const raw = {};
for (const [dao, slug] of Object.entries(SLUG)) { const doc = JSON.parse(fs.readFileSync(path.join(DIR, slug + '.json'), 'utf8')); raw[dao] = Object.values(doc.proposals);
  for (const p of raw[dao]) { const st = String(p.status || '').toLowerCase().replace(/ /g, '_'); const end = p.expiration && p.expiration.at_time_iso; const over = end && Date.parse(end) < now - 6 * 3600e3;
    cards.push({ dao, id: Number(String(p.id).replace(/\D/g, '')), title: p.title, status: st === 'open' && over ? 'vote ended — awaiting close' : st, live: st === 'open' && !over, pending: st === 'veto_timelock', endIso: end || null, yesPct: p.voting ? p.voting.yesPercent : null, noPct: p.voting ? p.voting.noPercent : null, turnoutPct: p.voting ? p.voting.turnout : null, movesFunds: !!(p.treasuryImpact && p.treasuryImpact.outflows && p.treasuryImpact.outflows.length), link: p.link || '#', descFull: p.description || null }); } }
// two DAODAO DAOs without captured history: only their latest card from the live read, as on the page
cards.push({ dao: 'aDAO Council', id: 7, title: 'Council housekeeping', status: 'executed', live: false, pending: false, endIso: new Date(now - 20 * 864e5).toISOString(), link: '#' });
const daos = [['Terra (LUNA)', 'x-gov', 'corpus'], ['aDAO', 'daodao', 'corpus'], ['Lion DAO', 'daodao', 'corpus'], ['Pixellions', 'daodao', 'corpus'], ['Pixellions Council', 'daodao', 'live'], ['CAPA Governance', 'anchor-gov', 'corpus'], ['ampCAPA', 'daodao', 'live'], ['Astroport Assembly', 'astroport', 'latest'], ['aDAO Council', 'daodao', 'live'], ['Phoenix Directive', 'daodao', 'live']].map(([name, kind, history]) => ({ name, kind, history, addr: kind === 'daodao' ? 'terra1' + 'x'.repeat(58) : null }));
const isOpen = (c) => !!(c.live || c.pending);
const build = (w, cs) => w.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards: cs || cards, isOpen }, daos, items: [] }, {});
const openN = cards.filter(isOpen).length;
console.log(`(capture: ${cards.length} props across 5 DAOs, ${openN} open now: ${cards.filter(isOpen).map(c => c.dao + ' #' + c.id).join(', ') || 'none'})`);
let store;
console.log('— the load popup');
{ const { w, d } = mk(); ok('lib loads: AlertCenter 2.2.0', w.AlertCenter.VERSION === '2.2.0', w.AlertCenter.VERSION);
  const R = build(w); const out = w.AlertCenter.render(d.getElementById('ac'), R, { document: d });
  ok(`P1 a prop is open (${openN}) → the props window opens on load, on the props tile`, openN > 0 && out.popped && !!d.getElementById('ac-full') && /Props · every DAO we watch/.test(d.getElementById('ac-full').textContent), { openN, popped: out.popped });
  ok('    with the opt-out button', !!d.getElementById('ac-full-mute'));
  d.getElementById('ac-full-close').click(); ok('    Close removes it', !d.getElementById('ac-full'));
  const out2 = w.AlertCenter.render(d.getElementById('ac'), build(w), { document: d }); ok('P2 a second render in the same visit does not open it again', !out2.popped && !d.getElementById('ac-full'));
  store = snap(w); }
{ const { w, d } = mk({ local: store.local }); const out = w.AlertCenter.render(d.getElementById('ac'), build(w), { document: d });
  ok('P3 the next visit (new session) opens it again — the prop is still open', out.popped && !!d.getElementById('ac-full'));
  d.getElementById('ac-full-mute').click(); store = snap(w); ok('    the opt-out closes it', !d.getElementById('ac-full')); }
{ const { w, d } = mk({ local: store.local }); const out = w.AlertCenter.render(d.getElementById('ac'), build(w), { document: d });
  ok('P4 after "don\'t pop up until a new prop opens", the next visit stays quiet', !out.popped && !d.getElementById('ac-full'));
  const more = cards.concat([{ dao: 'Lion DAO', id: 999, title: 'A brand-new vote', status: 'open', live: true, pending: false, daysLeft: 3, endIso: new Date(now + 3 * 864e5).toISOString(), link: '#' }]);
  const out2 = w.AlertCenter.render(d.getElementById('ac'), build(w, more), { document: d });
  ok('P5 a NEW prop opens it again, on the Live counter', out2.popped && d.querySelector('#ac-full .ac-rc.active') && d.querySelector('#ac-full .ac-rc.active').dataset.counter === 'live', out2); }
{ const { w, d } = mk(); const out = w.AlertCenter.render(d.getElementById('ac'), build(w), { document: d, popupReady: false });
  ok('P6 popupReady:false (the live read has not landed) holds it', !out.popped && !d.getElementById('ac-full')); }
console.log('— the DAOs we watch');
{ const { w, d } = mk({ local: { 'ac-pop-mute': JSON.stringify(cards.filter(isOpen).map(c => c.dao + '|' + c.id)) } }); const R = build(w); const T = R.tiles.find(t => t.key === 'daos');
  const dir = T && T.directory; const by = (n) => dir.find(x => x.dao.name === n);
  const relOk = dir && Object.entries(raw).every(([dao, ps]) => by(dao).stats.n === ps.length && by(dao).stats.by.passed === ps.filter(p => /executed|passed/i.test(p.status) && !/fail/i.test(p.status)).length);
  ok(`D1 a directory tile with all ${daos.length} governances; each captured DAO's props / passed equal the capture's own counts`, dir && dir.length === daos.length && relOk, dir && dir.map(x => [x.dao.name, x.stats.n, x.stats.by]));
  const a = by('aDAO').stats; ok(`    aDAO literal: 39 props · 36 passed · 3 not passed (rejected · closed · vetoed) · last #39`, a.n === 39 && a.by.passed === 36 && a.notPassed === 3 && a.last && a.last.id === 39, a);
  ok('    the directory is a record (never a call to action): state none', T.state === 'none');
  w.AlertCenter.render(d.getElementById('ac'), R, { document: d }); const chips = [...d.querySelectorAll('.ac-dchip')];
  const lit = chips.filter(c => c.classList.contains('on')).map(c => c.textContent);
  ok(`D2 home chips: one per DAO (${chips.length}); the DAOs with an open prop are lit (${lit.join(' | ')}); partial histories say "+"`, chips.length === daos.length && lit.length === new Set(cards.filter(isOpen).map(c => c.dao)).size && chips.some(c => /^aDAO Council\s*1\+$/.test(c.textContent.trim())), chips.map(c => c.textContent));
  const loads = []; const opts = { document: d, loadHistory: (n) => { loads.push(n); return Promise.resolve(Array.from({ length: 25 }, (_, i) => ({ dao: n, id: 25 - i, title: 'Council prop ' + (25 - i), status: i % 5 ? 'executed' : 'rejected', endIso: new Date(now - (i + 1) * 5 * 864e5).toISOString(), link: '#' }))); } };
  d.querySelector('[data-counter="overview"]').click();
  let F = d.getElementById('ac-full'); const rows = F.querySelectorAll('table.ac-dir tbody tr');
  ok(`D3 "all DAOs" opens the table: ${rows.length} rows with type, history, props, passed, not passed, open, last prop, turnout`, rows.length === daos.length && /full history · captured/.test(F.textContent) && /latest 25/.test(F.textContent), rows.length);
  const head = F.querySelector('.ac-full-head').textContent; ok(`D5 the header counts open props once (${openN})`, new RegExp('· ' + openN + ' open').test(head), head.slice(0, 160));
  [...rows].find(r => /aDAO/.test(r.cells[0].textContent) && !/Council/.test(r.cells[0].textContent)).click();
  F = d.getElementById('ac-full'); const items = F.querySelectorAll('.ac-plist details');
  ok(`    a row opens that DAO: ${items.length} props, newest first (#39 first)`, items.length === 39 && /#39/.test(items[0].querySelector('summary').textContent), items.length);
  items[0].open = true; items[0].dispatchEvent(new w.Event('toggle'));
  ok('    a row expands to the full card (title + the governance link)', /Adjust aDAO TLA Votes/.test(items[0].querySelector('.ac-pbody').innerHTML) && /vote \/ read/.test(items[0].querySelector('.ac-pbody').innerHTML));
  w.AlertCenter.openFull(R, Object.assign({}, opts, { openTile: 'daos', openCounter: 'dao' + daos.findIndex(x => x.name === 'aDAO Council') }));
  F = d.getElementById('ac-full'); const reading = /reading the latest 25/.test(F.textContent); await Promise.resolve();
  ok('D4 a DAO without captured history: shows what the page has ("reading the latest 25…") and reads the chain once', reading && loads.length === 1 && loads[0] === 'aDAO Council', { reading, loads });
  await new Promise(r => setTimeout(r, 20)); F = d.getElementById('ac-full');
  const n = F.querySelectorAll('.ac-plist details').length; const badge = F.querySelector('.ac-rc.active b').textContent;
  ok(`    then lists its record (${n} props — the live card merged by id), the rail count without "+" (${badge})`, n === 25 && badge === '25' && /20 props|25 props/.test(F.querySelector('h2').textContent), { n, badge });
  F.querySelector('.ac-rc[data-counter="dao' + daos.findIndex(x => x.name === 'Lion DAO') + '"]').click(); F.querySelector('.ac-rc[data-counter="dao' + daos.findIndex(x => x.name === 'aDAO Council') + '"]').click();
  ok('    opened again: no second chain read', loads.length === 1, loads);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
