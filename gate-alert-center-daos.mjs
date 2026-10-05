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
{ const { w, d } = mk(); ok('lib loads: AlertCenter 2.4.0', w.AlertCenter.VERSION === '2.4.0', w.AlertCenter.VERSION);
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
  w.AlertCenter.render(d.getElementById('ac'), R, { document: d }); const chips = [...d.querySelectorAll('.ac-dcell')];
  const lit = chips.filter(c => c.dataset.on === '1').map(c => c.textContent);
  ok(`D2 home chips: one per DAO (${chips.length}); the DAOs with an open prop are lit (${lit.join(' | ')}); partial histories say "+"`, chips.length === daos.length && lit.length === new Set(cards.filter(isOpen).map(c => c.dao)).size && chips.some(c => c.querySelector('.nm').textContent === 'aDAO Council' && c.querySelector('.ct').textContent === '1+ props'), chips.map(c => c.textContent));
  const loads = []; const opts = { document: d, loadHistory: (n) => { loads.push(n); return Promise.resolve(Array.from({ length: 25 }, (_, i) => ({ dao: n, id: 25 - i, title: 'Council prop ' + (25 - i), status: i % 5 ? 'executed' : 'rejected', endIso: new Date(now - (i + 1) * 5 * 864e5).toISOString(), link: '#' }))); } };
  d.querySelector('[data-counter="overview"]').click();
  let F = d.getElementById('ac-full'); const rows = F.querySelectorAll('table.ac-dir tbody tr');
  const row4 = d.querySelectorAll('.ac-row4 .ac-big');
  ok(`L1 the home panel: one row of four equal tiles (Live · Executed early · Veto lock · Recently executed) — got ${row4.length}`, row4.length === 4 && /Recently executed/.test(row4[3].textContent) && /in 30 days/.test(row4[3].textContent), [...row4].map(b => b.textContent.trim().slice(0, 30)));
  ok('L2 the index turns the load popup off (popup:false) — rendering with it opens nothing', (() => { const { w: w2, d: d2 } = mk(); const o = w2.AlertCenter.render(d2.getElementById('ac'), w2.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen }, daos, items: [] }, {}), { document: d2, popup: false }); return !o.popped && !d2.getElementById('ac-full'); })());
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
console.log('— VP voting power watch (2.4.0)');
{ const A = (c) => 'terra1' + c.repeat(38);
  const now0 = { [A('a')]: 326, [A('b')]: 324, [A('c')]: 165, [A('d')]: 124, [A('e')]: 60, [A('f')]: 700 };
  const d7 = { [A('a')]: 326, [A('b')]: 324, [A('c')]: 165, [A('d')]: 124, [A('e')]: 20, [A('f')]: 700 };
  const d1 = Object.assign({}, d7, { [A('e')]: 48 });
  const vp = { now: now0, total: 1699, liquid: { [A('c')]: 257, [A('d')]: 12 }, names: { [A('a')]: 'DeFi_Patriot' }, d1, d7, d30: d7 };
  const pc = cards.map(c => Object.assign({}, c)); pc.push({ dao: 'aDAO', id: 99, title: 'Test prop', live: true, proposer: A('e'), link: 'https://x' });
  const { w, d } = mk(); const T = w.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards: pc, isOpen }, daos, items: [], vp }, {});
  const V = T.tiles.find(t => t.key === 'vp'); const C = V ? Object.fromEntries(V.counters.map(c => [c.key, c])) : {};
  ok('V1 a vp tile with five counters', V && V.counters.length === 5, V && V.counters.map(c => c.key));
  ok(`V2 surge: the wallet that staked 40 in a week (12 in a day) is flagged — ${C.surge && C.surge.n}`, C.surge && C.surge.n === 1 && /staked 12 in a day/.test(C.surge.rows[0].label), C.surge && C.surge.rows.map(r => r.label));
  ok('V3 the same wallet crossed nothing (60 = 3.5%); nobody else moved', C.cross && C.cross.n === 0, C.cross && C.cross.rows.map(r => r.label));
  ok('V4 the open aDAO prop names its proposer and their power', C.prop && C.prop.n === 1 && /proposed by/.test(C.prop.rows[0].value) && /60 staked/.test(C.prop.rows[0].value), C.prop && C.prop.rows.map(r => r.value));
  ok('V5 only piles ≥ 50 unstaked count (257, not 12)', C.piles && C.piles.n === 1 && /257 unstaked/.test(C.piles.rows[0].label), C.piles && C.piles.rows.map(r => r.label));
  ok('V6 the biggest wallets are sorted, named when known', C.top && /^#1 /.test(C.top.rows[0].label) && C.top.rows[0].raw.now === 700 && C.top.rows.some(r => /DeFi_Patriot/.test(r.label)));
  const big = Object.assign({}, vp, { now: Object.assign({}, now0, { [A('d')]: 200 }), total: 1775 });
  const T2 = w.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen }, daos, items: [], vp: big }, {});
  const cr = T2.tiles.find(t => t.key === 'vp').counters.find(c => c.key === 'cross');
  ok(`V7 a wallet growing 124 → 200 (7.3% → 11.3%) crosses 10% (already past 5%), one row: ${cr.n}`, cr.n === 1 && cr.rows.some(r => /crossed 10%/.test(r.label)), cr.rows.map(r => r.label));
  const drift = Object.assign({}, vp, { now: Object.assign({}, now0, { [A('f')]: 640 }), d1: null, total: 1639, d7: Object.assign({}, d7, { [A('d')]: 164, [A('e')]: 60 }) });
  drift.now[A('d')] = 164; drift.total = 1630; const cd = w.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen }, daos, items: [], vp: drift }, {}).tiles.find(t => t.key === 'vp').counters.find(c => c.key === 'cross');
  ok('V7b a wallet that staked nothing does not "cross" because the total shrank (Oct 4 false alarm: 165 = 9.97% → 10.0%)', cd.n === 0, cd.rows.map(r => r.label));
  w.AlertCenter.render(d.getElementById('ac'), T, { document: d, popup: false });
  const cells = [...d.querySelectorAll('.ac-vgrid .ac-vcell')];
  ok(`V8 the home strip: six cells (${cells.length}), surges lit, biggest wallet 41.2%`, cells.length === 6 && cells[3].dataset.on === '1' && /41\.2%/.test(cells[0].textContent), cells.map(c => c.textContent.replace(/\s+/g, ' ').trim()));
  cells[4].click(); ok('V9 a cell opens the vp window on its counter', !!d.getElementById('ac-full'));
  const { w: w3, d: d3 } = mk(); const T3 = w3.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen }, daos, items: [], vp: { now: now0, total: 1699 } }, {});
  const V3 = T3.tiles.find(t => t.key === 'vp'); ok('V10 without the history catalogs: surges / crosses say why they cannot be measured, nothing fabricated', V3.counters[0].n === 0 && V3.counters[0].gap && V3.counters[1].gap, V3.counters.map(c => [c.key, c.n, c.gap]));
  w3.AlertCenter.render(d3.getElementById('ac'), T3, { document: d3, popup: false }); ok('    and it still renders the strip', d3.querySelectorAll('.ac-vcell').length === 6);
  const { w: w4 } = mk(); ok('V11 no vp input → no vp tile (page without the inventory)', !w4.AlertCenter.build({ now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards, isOpen }, daos, items: [] }, {}).tiles.some(t => t.key === 'vp'));
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
