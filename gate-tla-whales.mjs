#!/usr/bin/env node
// gate-tla-whales.mjs — tla-whales.html against a REAL read (WHALES = tla-core tla-whales/current.json). Every expected figure
// is taken from that file, never typed. Usage: NODE_PATH=… WHALES=<current.json> node gate-tla-whales.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname); const { WHALES } = process.env; if (!WHALES) { console.error('WHALES required'); process.exit(1); }
const DOC = JSON.parse(fs.readFileSync(WHALES, 'utf8')); const html = fs.readFileSync(path.join(here, 'tla-whales.html'), 'utf8');
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x !== undefined ? '  ← ' + JSON.stringify(x).slice(0, 500) : '')); } };
const num = (x, d = 0) => (Number(x) || 0).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = (x) => (x == null ? '—' : '$' + num(x, Math.abs(x) < 100 ? 2 : 0)); const pc = (x) => num(x, x < 10 ? 2 : 1) + '%';
const short = (a) => (a.length > 16 ? a.slice(0, 9) + '…' + a.slice(-5) : a);
async function page(o = {}) { const doc = o.doc === undefined ? DOC : o.doc; const asked = [];
  const fetchStub = async (u) => { const url = String(u).split('?')[0]; asked.push(url); if (/tla-whales\/current\.json$/.test(url)) return doc ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(doc)) } : { ok: false, status: 404 }; return { ok: false, status: 404 }; };
  const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, ''), { url: 'https://theadao.com/tla-whales.html' + (o.search || ''), runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount(x) { w.__header = x; }, subnav(x) { w.__subnav = x; }, tlaTabs(a) { return [{ id: 'overview', active: a === 'overview' }]; } }; w.SiteFooter = { mount(x) { w.__footer = x; } }; w.fetch = fetchStub; w.__errors = []; w.addEventListener('error', (e) => w.__errors.push(String(e.message))); w.Element.prototype.scrollIntoView = function () { this.ownerDocument.defaultView.__scrolled = this; }; } });
  const w = dom.window; for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 10));
  const d = w.document, text = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
  return { w, d, text, asked, S: w.__wh.S, wh: w.__wh, $: (id) => d.getElementById(id), all: (s) => [...d.querySelectorAll(s)], click: (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), pick(key) { this.S.pool = key; this.S.view = 'pool'; this.wh.render(); } };
}
const POOLS = DOC.pools.filter((p) => p.holders && p.holders.length);
const valueOf = (h, P) => (P.staked_usd == null ? null : h.pct / 100 * P.staked_usd);

console.log('— A the page and its source —');
const A = await page();
check('no page error; it reads tla-core tla-whales/current.json and nothing else', A.w.__errors.length === 0 && A.asked.length === 1 && /raw\.githubusercontent\.com\/thealliancedao\/tla-core\/main\/tla-whales\/current\.json$/.test(A.asked[0]), [A.w.__errors, A.asked]);
check('the page has the place the site header draws into, ahead of the header script, and asks for the TLA tab bar', /<div id="site-header"><\/div>\s*<script src="\/lib\/site-header\.js/.test(html) && /SiteHeader\.subnav\(SiteHeader\.tlaTabs\(/.test(html));
check('it says when the chain was read', A.text(A.$('wh-lead')).includes(new Date(DOC.capturedAt).toLocaleString('en-US', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' })) && /read from the chain/.test(A.text(A.$('wh-lead'))));
check('the footer carries the page rev and its changelog key; the header knows the page', A.w.__footer && A.w.__footer.rev === A.wh.REV && A.w.__footer.page === 'tla-whales' && A.w.__header.page === 'tla-whales' && Array.isArray(A.w.__subnav));

console.log('— B pick a pool: every account, largest first —');
{ const rail = A.all('#wh-rail .pl');
  check(`the rail lists every pool that has a holder (${POOLS.length}), under its bucket, with its staked value, account count and largest share`, rail.length === POOLS.length && POOLS.every((p) => { const b = rail.find((x) => x.dataset.pool === p.key); return b && A.text(b).includes(usd(p.staked_usd)) && A.text(b).includes(num(p.holders_n) + ' account') && A.text(b).includes('largest ' + pc(p.holders[0].pct)); }) && ['Stable', 'Project', 'Bluechip', 'Single'].every((b) => A.all('#wh-rail .bk').some((x) => A.text(x).startsWith(b))));
  check('the pool shown first is the one with the most staked', A.S.pool === POOLS[0].key && A.$('wh-pool').dataset.poolKey === POOLS[0].key && A.d.querySelector('#wh-rail .pl.on').dataset.pool === POOLS[0].key);
  let okRows = true, okVal = true, okTiles = true, okConc = true; const bad = [];
  for (const P of POOLS.slice(0, 14)) { A.pick(P.key); const rows = A.all('#wh-list details.row');
    if (rows.length !== P.holders.length || !rows.every((r, i) => r.dataset.a === P.holders[i].a && A.text(r.querySelector('.rk')) === String(i + 1) && A.text(r.querySelector('summary')).includes(pc(P.holders[i].pct)))) { okRows = false; bad.push([P.name, 'rows']); }
    if (!P.holders.every((h, i) => !h.pct || h.pct <= (P.holders[i - 1] ? P.holders[i - 1].pct : 100))) { okRows = false; bad.push([P.name, 'order']); }
    if (!rows.slice(0, 8).every((r, i) => A.text(r.querySelector('summary')).includes(usd(valueOf(P.holders[i], P))))) { okVal = false; bad.push([P.name, 'value']); }
    const t = A.text(A.d.querySelector('#wh-pool .tiles')); const top = (n) => P.holders.slice(0, n).reduce((s, h) => s + h.pct, 0);
    if (!(t.includes(usd(P.staked_usd)) && t.includes(pc(P.holders[0].pct)) && t.includes(pc(top(5))) && t.includes(pc(top(10))) && t.includes(pc(P.amplified_pct)) && t.includes(num(P.holders_n)))) { okTiles = false; bad.push([P.name, 'tiles']); }
    const segs = A.all('[data-ow="conc"] [data-seg]'); if (!(segs.length === Math.min(10, P.holders.length) && segs.every((s, i) => s.dataset.seg === P.holders[i].a && Math.abs(parseFloat(s.style.flexGrow) - P.holders[i].pct) < 0.0002 && s.title.includes(pc(P.holders[i].pct))))) { okConc = false; bad.push([P.name, 'bar']); } }
  check('the list of a pool: every account the read found, in the read\'s order (largest first), each with its rank and share', okRows, bad);
  check('an account\'s value is its share × the pool\'s staked value', okVal, bad);
  check('the tiles: staked, accounts, the largest, top 5, top 10, the auto-compounding part — each summed from the list', okTiles, bad);
  check('the bar of the pool: the ten largest as pieces in the size of their share, the figure on hover', okConc, bad); }

console.log('— C what adds up, and what does not —');
{ const full = POOLS.find((p) => p.complete && (p.not_attributed.direct_pct + p.not_attributed.amp_pct) <= 0.5 && p.staked_usd > 5000); A.pick(full.key);
  check(`a pool the list explains (${full.name}): it says how much — ${pc(full.attributed_pct)} — and shows no warning`, A.text(A.d.querySelector('[data-ow="acc"]')).includes(pc(full.attributed_pct)) && !A.d.querySelector('[data-ow="na-note"]') && !A.d.querySelector('[data-ow="na"]') && !A.d.querySelector('[data-ow="incomplete"]'));
  const gap = POOLS.find((p) => (p.not_attributed.direct_pct + p.not_attributed.amp_pct) > 0.5);
  if (gap) { A.pick(gap.key); const na = gap.not_attributed.direct_pct + gap.not_attributed.amp_pct; const seg = A.d.querySelector('[data-ow="na"]');
    check(`a pool with a part nobody on the list explains (${gap.name}, ${pc(na)}): it is its own striped piece and a plain sentence — never spread over the accounts`, seg && Math.abs(parseFloat(seg.style.flexGrow) - na) < 0.0002 && A.text(A.d.querySelector('[data-ow="na-note"]')).includes(pc(na) + ' of this pool is not attributed') && Math.abs(A.all('#wh-list details.row').reduce((s, r, i) => s + gap.holders[i].pct, 0) - gap.attributed_pct) < 0.05 + (gap.others ? gap.others.pct : 0), [na, seg && seg.style.flexGrow]);
    if (gap.amp_token_missing) check('and where the compounder lists no amp token for its stake, that is the reason given', /lists no amp token for it/.test(A.text(A.d.querySelector('[data-ow="na-note"]')))); }
  else check('(no pool with an unexplained part in this read — the case is covered by the altered copy below)', true);
  const X = await page({ doc: (() => { const c = JSON.parse(JSON.stringify(DOC)); const p = c.pools.find((x) => x.key === full.key); p.complete = false; p.why_incomplete = ['some stakers were not read']; p.not_attributed = { direct_pct: 12.5, amp_pct: 0 }; p.attributed_pct = 87.5; p.holders[0].name = '<img src=x onerror=1>'; delete p.holders[0].label; return c; })() }); X.pick(full.key);
  check('a pool that was not read to the end says so, with the reason, above its list', /not read to the end/.test(X.text(X.d.querySelector('[data-ow="incomplete"]'))) && /some stakers were not read/.test(X.text(X.d.querySelector('[data-ow="incomplete"]'))) && /12\.5% of this pool is not attributed/.test(X.text(X.d.querySelector('[data-ow="na-note"]'))));
  check('a name is shown as text, never run as markup', !X.d.querySelector('#wh-list img') && X.text(X.d.querySelector('#wh-list details.row .who')).includes('<img src=x onerror=1>'));
  const chk = POOLS.find((p) => p.amp_check && p.amp_check.stated_over_staked != null && Math.abs(p.amp_check.stated_over_staked - 1) > 0.005), same = POOLS.find((p) => p.amp_check && Math.abs(p.amp_check.stated_over_staked - 1) <= 0.005);
  if (chk) { A.pick(chk.key); const t = A.text(A.d.querySelector('[data-ow="amp-check"]')); check(`where the compounder's stated rate and its stake disagree (${chk.name}: ${num(chk.amp_check.stated_over_staked * 100, 1)}%), both are said and no reason is invented`, t.includes(num(chk.amp_check.stated_over_staked * 100, 1) + '%') && /does not say why/.test(t)); if (same) { A.pick(same.key); check('and where they agree the note is absent', !A.d.querySelector('[data-ow="amp-check"]')); } }
  else check('(this read carries no amp_check yet — the note is exercised once the 1.0.1 read is in)', true); }

console.log('— D who it is: only what is registered or verified —');
{ const withLabel = [], withName = [], plain = [], contracts = []; for (const P of POOLS) P.holders.forEach((h, i) => { if (i < 40) (h.label ? withLabel : h.name ? withName : plain).push([P, h]); if (i < 40 && h.kind === 'contract') contracts.push([P, h]); });
  const whoOf = ([P, h]) => { A.pick(P.key); return A.d.querySelector(`#wh-list details.row[data-a="${h.a}"] .who`); };
  check(`a verified label shows with the word "verified" (${withLabel.length} such rows; e.g. ${withLabel[0] ? withLabel[0][1].label : '—'})`, withLabel.length > 0 && withLabel.slice(0, 6).every((x) => { const w = whoOf(x); return A.text(w).includes(x[1].label) && w.querySelector('.tag.org') && A.text(w).includes(short(x[1].a)); }));
  check(`a name the account registered shows as "registered name" (${withName.length} such rows)`, withName.length > 0 && withName.slice(0, 6).every((x) => { const w = whoOf(x); return A.text(w).includes(x[1].name) && w.querySelector('.tag.nm') && !w.querySelector('.tag.org'); }));
  check(`everyone else is an address and nothing more (${plain.length} such rows): no name, no guess`, plain.length > 0 && plain.slice(0, 12).every((x) => { const w = whoOf(x); return A.text(w.querySelector('.ad')) === short(x[1].a) && !w.querySelector('.tag.org') && !w.querySelector('.tag.nm') && A.text(w).replace('contract', '').trim() === short(x[1].a); }));
  check(`a contract is marked as one (${contracts.length} such rows)`, contracts.length > 0 && contracts.slice(0, 5).every((x) => /contract/.test(A.text(whoOf(x)))) && plain.filter((x) => x[1].kind !== 'contract').slice(0, 5).every((x) => !/contract/.test(A.text(whoOf(x)))));
  check('no label on the page carries a first name in brackets', !POOLS.some((p) => p.holders.some((h) => h.label && /\([A-Z][a-z]+\)\s*$/.test(h.label))) || DOC.version === 'tla-whales-1.0.0', POOLS.flatMap((p) => p.holders.filter((h) => h.label && /\([A-Z][a-z]+\)\s*$/.test(h.label)).map((h) => h.label)).slice(0, 3)); }

console.log('— E history: since when, what it did, what it does now —');
{ const P = POOLS.find((p) => p.holders.slice(0, 20).some((h) => h.since != null) && p.holders.slice(0, 20).some((h) => h.since == null)) || POOLS[0]; A.pick(P.key); const hs = P.holders.find((h) => h.since != null), hn = P.holders.find((h) => h.since == null);
  const rowOf = (h) => A.d.querySelector(`#wh-list details.row[data-a="${h.a}"]`); const mon = (n) => new Date(Date.UTC(2022, 9, 31) + n * 7 * 864e5).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });
  check(`"in since" is the round of the account's first deposit in this pool as a month, with the weeks since (${hs && mon(hs.since)}, ${hs && DOC.epoch - hs.since} weeks)`, hs && A.text(rowOf(hs).querySelector('summary')).includes(mon(hs.since)) && A.text(rowOf(hs).querySelector('summary')).includes(num(DOC.epoch - hs.since) + ' week'));
  check('deposits and withdrawals are the public flow record\'s counts for this pool; no claim figure is tied to a pool', hs && hs.dep != null && A.text(rowOf(hs).querySelector('summary')).includes(num(hs.dep) + ' in') && A.text(rowOf(hs).querySelector('summary')).includes(num(hs.wdr) + ' out') && !/claim/.test(A.text(rowOf(hs).querySelector('summary'))));
  if (DOC.accounts) { const ha = P.holders.find((h) => DOC.accounts[h.a] && DOC.accounts[h.a].clm > 0), x = ha && DOC.accounts[ha.a], hz = P.holders.find((h) => !DOC.accounts[h.a]);
    check(`opened, an account shows what the record holds for it across the whole Alliance: ${x && num(x.dep)} deposits, ${x && num(x.wdr)} withdrawals, ${x && num(x.clm)} claims worth ${x && usd(x.clm_usd)}`, ha && (() => { const t = A.text(rowOf(ha).querySelector('[data-ow="acc-line"]')); return t.includes(num(x.dep) + ' deposit') && t.includes(num(x.wdr) + ' withdrawal') && t.includes('claimed ' + num(x.clm) + ' time') && t.includes(usd(x.clm_usd)); })());
    if (hz) check('and an account with nothing on the record says so (amp tokens compound by themselves)', /No deposit, withdrawal or claim/.test(A.text(rowOf(hz).querySelector('[data-ow="acc-line"]')))); }
  const tr = { adding: 'adding', reducing: 'taking out', both: 'in and out', holding: 'holding' }; const seen = new Set(); let okTrend = true;
  for (const Q of POOLS.slice(0, 20)) { A.pick(Q.key); for (const h of Q.holders.slice(0, 30)) if (h.trend) { seen.add(h.trend); const tg = rowOf(h).querySelector('summary .tag.' + h.trend) || [...rowOf(h).querySelectorAll('summary .tag')].find((x) => A.text(x) === tr[h.trend]); if (!tg || A.text(tg) !== tr[h.trend]) okTrend = false; } }
  check(`the last eight rounds in a word, from the record (${[...seen].join(', ')})`, okTrend && seen.size >= 2, [...seen]);
  A.pick(P.key);
  if (hn) check('an account with no deposit on record says "not on record" and, opened, why (it holds the amp token)', /not on record/.test(A.text(rowOf(hn).querySelector('summary'))) && /no deposit on the public flow record/.test(A.text(rowOf(hn).querySelector('.more'))));
  const hh = POOLS.flatMap((p) => p.holders.filter((h) => h.h && h.h.length >= 2).map((h) => [p, h]))[0];
  if (hh) { A.pick(hh[0].key); const svg = rowOf(hh[1]).querySelector('svg.sp'); check('the account\'s changes over time are drawn as a line, with the count of changes and the rounds in words', svg && svg.querySelector('path') && /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+$/.test(svg.querySelector('path').getAttribute('d')) && new RegExp('^' + hh[1].h.length + ' change').test(svg.getAttribute('aria-label')) && svg.getAttribute('aria-label').includes('round ' + hh[1].h[0][0])); }
  const mixed = POOLS.flatMap((p) => p.holders.filter((h) => h.direct_pct && h.amp_pct).map((h) => [p, h]))[0];
  if (mixed) { A.pick(mixed[0].key); const r = rowOf(mixed[1]); check('how it is held is drawn (direct, then through the amp token) and said in words when opened', Math.abs(parseFloat(r.querySelector('.bar .d').style.width) - Math.min(100, mixed[1].direct_pct)) < 0.006 && Math.abs(parseFloat(r.querySelector('.bar .a').style.width) - Math.min(100, mixed[1].amp_pct)) < 0.006 && A.text(r.querySelector('.more')).includes(pc(mixed[1].direct_pct) + ' staked directly') && A.text(r.querySelector('.more')).includes(pc(mixed[1].amp_pct) + ' through the pool\'s amp token')); } }

console.log('— F one account across pools; the largest accounts overall —');
{ const by = new Map(); for (const P of POOLS) for (const h of P.holders) { const e = by.get(h.a) || by.set(h.a, { a: h.a, usd: 0, rows: [], label: h.label, name: h.name }).get(h.a); e.usd += valueOf(h, P) || 0; e.rows.push([P, h]); }
  const list = [...by.values()].sort((x, y) => y.usd - x.usd); const total = POOLS.reduce((t, p) => t + (p.staked_usd || 0), 0); const multi = list.find((e) => e.rows.length >= 3);
  A.pick(multi.rows[0][0].key); const r = A.d.querySelector(`#wh-list details.row[data-a="${multi.a}"]`); const chips = [...r.querySelectorAll('.more .chip')];
  check(`opened, an account shows the other pools it holds (${multi.rows.length - 1} others), each with its share there`, chips.length === Math.min(12, multi.rows.length - 1) && chips.every((c) => { const x = multi.rows.find((q) => q[0].key === c.dataset.pool); return x && x[0].key !== multi.rows[0][0].key && A.text(c).includes(x[0].name) && A.text(c).includes(pc(x[1].pct)); }));
  const target = chips[0].dataset.pool; A.click(chips[0]);
  check('pressing one goes to that pool and opens the same account there', A.S.pool === target && A.$('wh-pool').dataset.poolKey === target && A.d.querySelector(`#wh-list details.row[data-a="${multi.a}"]`).open === true);
  A.click(A.d.querySelector('#wh-tabs [data-view="all"]')); const rows = A.all('#wh-list details.row');
  check(`the second view ranks accounts by their value across all pools (${list.length} accounts; the largest holds ${pc(list[0].usd / total * 100)})`, A.S.view === 'all' && rows.length === Math.min(150, list.length) && rows.slice(0, 25).every((x, i) => x.dataset.a === list[i].a && A.text(x.querySelector('summary')).includes(usd(list[i].usd)) && A.text(x.querySelector('summary')).includes(pc(list[i].usd / total * 100))), rows.slice(0, 3).map((x) => x.dataset.a.slice(-5)));
  const cut = (f) => list.filter(f).reduce((t, e) => t + e.usd, 0); const ver = cut((e) => e.label), nam = cut((e) => !e.label && e.name), pl = cut((e) => !e.label && !e.name), nA = Math.max(0, total - list.reduce((t, e) => t + e.usd, 0)); const sp = A.text(A.d.querySelector('[data-ow="split"]'));
  check(`"who is it" is cut only by what the chain says: verified ${pc(ver / total * 100)} · registered name ${pc(nam / total * 100)} · no name ${pc(pl / total * 100)} · not attributed ${pc(nA / total * 100)} — and the four make the whole`, sp.includes(pc(ver / total * 100)) && sp.includes(pc(nam / total * 100)) && sp.includes(pc(pl / total * 100)) && sp.includes(pc(nA / total * 100)) && Math.abs((ver + nam + pl + nA) / total - 1) < 1e-6);
  check('it says in plain words that "no name" is neither "community" nor "team"', /"No name" does not mean "community", and it does not mean "team"/.test(A.text(A.$('wh-all'))));
  const kinds = A.all('[data-ow="who"] [data-kind]'); check('the split is also drawn, each piece in the size of its part', kinds.length >= 1 && kinds.every((k) => { const v = /Verified/.test(k.dataset.kind) ? ver : /registered/.test(k.dataset.kind) ? nam : pl; return Math.abs(parseFloat(k.style.flexGrow) - v / total * 100) < 0.0002; }));
  if (DOC.accounts) { const clm = (e) => (DOC.accounts[e.a] && DOC.accounts[e.a].clm_usd) || 0; const byC = list.slice().sort((x, y) => clm(y) - clm(x) || y.usd - x.usd); const listed = list.reduce((t, e) => t + clm(e), 0);
    check('each account also shows the rewards it has claimed (or that none is on record)', A.all('#wh-list details.row').slice(0, 25).every((x, i) => { const c = A.text(x.querySelector('[data-ow="claimed"]')); return DOC.accounts[list[i].a] ? c.includes(usd(DOC.accounts[list[i].a].clm_usd)) && c.includes(num(DOC.accounts[list[i].a].clm) + ' claim') : /none on record/.test(c); }));
    check(`the sum is said: the listed accounts claimed ${usd(listed)} — ${pc(listed / DOC.claims_all.usd * 100)} of the ${usd(DOC.claims_all.usd)} ever claimed`, (() => { const t = A.text(A.d.querySelector('[data-ow="claim-sum"]')); return t.includes(usd(listed)) && t.includes(pc(listed / DOC.claims_all.usd * 100)) && t.includes(usd(DOC.claims_all.usd)); })());
    A.click(A.d.querySelector('#wh-sort [data-sort="claimed"]')); const r2 = A.all('#wh-list details.row');
    check(`ordered by rewards claimed, the largest claimer comes first (${usd(clm(byC[0]))})`, A.S.sort === 'claimed' && r2.slice(0, 20).every((x, i) => x.dataset.a === byC[i].a) && A.text(r2[0].querySelector('[data-ow="claimed"]')).includes(usd(clm(byC[0]))) && A.text(A.d.querySelector('#wh-all .tiles')).includes(pc(list[0].usd / total * 100)), r2.slice(0, 3).map((x) => x.dataset.a.slice(-5)));
    A.click(A.d.querySelector('#wh-sort [data-sort="value"]')); check('and back to the order by staked value', A.all('#wh-list details.row')[0].dataset.a === list[0].a); }
  A.click(A.d.querySelector('#wh-tabs [data-view="pool"]')); check('and back to the pool view', A.S.view === 'pool' && !!A.$('wh-rail')); }

console.log('— G finding a pool; a link to one —');
{ const P = POOLS.find((p) => /SOLID/.test(p.name || '')) || POOLS[3]; const inp = A.$('wh-q'); inp.value = 'solid'; inp.dispatchEvent(new A.w.Event('input', { bubbles: true })); const n = POOLS.filter((p) => String(p.name || '').toLowerCase().includes('solid') || String(p.dex || '').toLowerCase().includes('solid')).length;
  check(`typing in the box narrows the rail (solid → ${n} pools)`, A.all('#wh-rail .pl').length === n && n > 0 && n < POOLS.length);
  const L = await page({ search: '?pool=' + encodeURIComponent(P.name) }); check(`a link with ?pool=${P.name} opens on that pool`, L.S.pool === P.key && L.$('wh-pool').dataset.poolKey === P.key);
  const V = await page({ search: '?view=all' }); check('a link with ?view=all opens on the largest accounts', V.S.view === 'all' && !!V.$('wh-all')); }

console.log('— H failure, and the small print —');
{ const X = await page({ doc: null }); check('when the list cannot be read the page says so and shows no list at all', /could not be read/.test(X.text(X.$('wh-wait'))) && !X.$('wh-list') && X.w.__errors.length === 0);
  const how = A.text(A.$('wh-how')); check('how the list is made is on the page: the chain, the two ways of holding, the check, names, and what is not here yet', /staking contract cannot be asked for "everyone"/.test(how) && /lists every holder of a pool's amp token/.test(how) && /not attributed/.test(how) && /no owner is guessed/i.test(how) && /Not here yet/.test(how) && how.includes(num(DOC.counts.direct_accounts_asked)));
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')); const small = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].map((m) => (m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]))).filter((v) => v < 13); const inl = [...html.matchAll(/font-size:\s*\.?([\d.]+)rem/g)].map((m) => parseFloat(m[0].replace(/[^\d.]/g, '')) * 16).filter((v) => v < 13);
  check('no text is set under 13px', small.length === 0 && inl.length === 0, [small, inl]);
  check('the page names no person and passes no verdict: it has no word for motive or blame', !/\b(scam|fraud|manipulat|insider|dump(ing|ed)?|rug)\b/i.test(html)); }

console.log(`\n=== PAGE GATE (tla-whales): ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
