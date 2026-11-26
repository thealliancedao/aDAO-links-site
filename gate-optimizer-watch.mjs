#!/usr/bin/env node
// gate-optimizer-watch.mjs — optimizer-watch.html against REAL files: a data set of the public products (LIVE = a folder laid
// out like tla-core: snapshot, Votion's capture, prices, catalog, move rule, bribe events), the bribe contract's own answer
// for the round (CHAIN = votion/chain/vaults.json holding bribes_by_round) and the options log (LOG). Every expected figure
// is taken from the engine or the files, never typed.
// Usage: NODE_PATH=… LIVE=<dir> CHAIN=<vaults.json> LOG=<options-log.json> node gate-optimizer-watch.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const here = path.dirname(new URL(import.meta.url).pathname); const { LIVE, CHAIN, LOG } = process.env; if (!LIVE || !CHAIN || !LOG) { console.error('LIVE, CHAIN and LOG required'); process.exit(1); }
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8')); const html = fs.readFileSync(path.join(here, 'optimizer-watch.html'), 'utf8'), lib = fs.readFileSync(path.join(here, 'lib/vote-market.js'), 'utf8');
const chainDoc = J(CHAIN).also['bribe-manager']; const round = String(chainDoc.round_being_voted); const chain = chainDoc.bribes_by_round[round].answer; const log = J(LOG);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x !== undefined ? '  ← ' + JSON.stringify(x).slice(0, 500) : '')); } };
const VM = createRequire(import.meta.url)(path.join(here, 'lib/vote-market.js'));
async function page(o = {}) { let liveAnswer = o.chain === undefined ? chain : o.chain; const asked = [];
  const fetchStub = async (u) => { const url = String(u).split('?')[0]; asked.push(url); const ok = (d) => ({ ok: true, status: 200, json: async () => d }); let m;
    if (o.down) return { ok: false, status: 503 };
    if (/\/cosmwasm\/wasm\/v1\/contract\/.*\/smart\//.test(url)) return liveAnswer ? ok({ data: liveAnswer }) : { ok: false, status: 503 };
    if ((m = url.match(/raw\.githubusercontent\.com\/thealliancedao\/tla-core\/main\/(.+)$/))) { if (m[1] === 'votion/options-log.json') return o.noLog ? { ok: false, status: 404 } : ok(log); const f = path.join(LIVE, m[1]); return fs.existsSync(f) ? ok(J(f)) : { ok: false, status: 404 }; }
    return { ok: false, status: 404 }; };
  const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, ''), { url: 'https://theadao.com/optimizer-watch.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount() { }, subnav() { } }; w.SiteFooter = { mount(x) { w.__footer = x; } }; w.fetch = fetchStub; w.__errors = []; w.addEventListener('error', (e) => w.__errors.push(String(e.message)));
    w.setInterval = () => 0; w.eval(lib); if (o.before) o.before(w); } });
  const w = dom.window; const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 10)); }; await settle(40);
  const d = w.document, text = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
  return { w, d, text, settle, asked, S: w.__ow.S, ow: w.__ow, setChain: (c) => { liveAnswer = c; }, $: (id) => d.getElementById(id), all: (s) => [...d.querySelectorAll(s)] };
}
const vp = (x) => { x = Number(x) || 0; const a = Math.abs(x); return a >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(x / 1e3) + 'K' : String(Math.round(x)); };

console.log('— A what the page is —');
const A = await page(); const m = A.S.m; const B = () => A.w.VoteMarket.board(m, A.S.bucket, {});
check('no page error; the engine loaded the real products and the live pots of the round', A.w.__errors.length === 0 && !!m && String(m.period) === round && m.potSource === 'live', A.w.__errors);
check('it says whose page this is: aDAO\'s, not Votion\'s, not affiliated, an example built from public data — and it uses no Votion or Eris logo, name mark or stylesheet', /aDAO's page, not Votion's/.test(A.text(A.$('ow-notice'))) && /not affiliated with Votion or Eris/.test(A.text(A.$('ow-notice'))) && !/votion\.money|erisprotocol\.com\/(assets|static)|<img[^>]*(votion|eris)/i.test(html));
check('the footer carries the page rev and its changelog key', A.w.__footer && A.w.__footer.rev === A.ow.REV && A.w.__footer.page === 'optimizer-watch');

console.log('— B the two deadlines —');
{ const t = A.ow.times(); const flip = Date.UTC(2022, 9, 31) + Number(round) * 7 * 864e5; const casts = m.moveRuleDoc.timing.casts.filter((c) => c.hours_before_deadline > 0 && c.hours_before_deadline < 6).map((c) => c.hours_before_deadline).sort((a, b) => a - b); const hb = casts[Math.floor(casts.length / 2)];
  check(`the round ends at the gauge's flip (${new Date(flip).toISOString()}), a Monday 00:00 UTC`, t.flip === flip && new Date(flip).getUTCDay() === 1 && new Date(flip).getUTCHours() === 0);
  check(`Votion's cast: the hour that ends ${hb} h before the deadline (the middle of its ${casts.length} casts on record) — the same reading as the Vote Market tile`, t.castTo === Date.parse(m.voteBefore) - hb * 36e5 && t.castFrom === t.castTo - 36e5 && t.n === casts.length);
  A.S.now = t.castFrom - 3 * 36e5 - 5000; A.ow.renderAllParts();
  check('before the cast both clocks count down, side by side, and the gap between them is said in hours', /^3h 0m 0\ds$/.test(A.text(A.$('ow-cast-t'))) && /\d/.test(A.text(A.$('ow-flip-t'))) && new RegExp('About ' + ((t.flip - t.castTo) / 36e5).toFixed(1) + ' hours lie between the two').test(A.text(A.d.querySelector('[data-ow="gap"]'))) && !!A.d.querySelector('.clock.cast') && !!A.d.querySelector('.clock.flip'), A.text(A.$('ow-cast-t')));
  A.S.now = t.castTo + 60000; A.ow.renderAllParts(); const after = A.text(A.$('ow-cast-t')); A.S.now = t.flip + 60000; A.ow.renderAllParts();
  check('after the cast it says so; after the flip the round clock says ended and that the next round is not read yet', after === 'done for this round' && A.text(A.$('ow-flip-t')) === 'ended' && /next round’s data has not been read yet/.test(A.text(A.$('ow-clocks'))), after);
  A.S.now = null; A.ow.renderAllParts(); }

console.log('— C the plan —');
for (const bucket of ['project', 'single']) { A.S.bucket = bucket; A.ow.renderAllParts(); const b = B(); const exp = b.rows.filter((r) => r.votionNow >= 50000 || r.votionPlan >= 50000); const rows = A.all('#ow-plan .tr[data-pk]');
  check(`${bucket}: one row for each pool Votion has votes on now or after its cast (${exp.length}), each with the engine's votes now → after, the bribe and the APR now → next`, rows.length === exp.length && exp.every((r) => { const el = rows.find((x) => x.dataset.pk === r.pk), t = el ? A.text(el) : ''; return t.includes(r.name) && t.includes(vp(r.votionNow) + ' → ' + vp(r.votionPlan)) && (r.potUsd > 0.5 ? /\$\d/.test(t) : /none/.test(t)); }), rows.map((x) => A.text(x).slice(0, 80)));
  check(`${bucket}: Votion's votes after the cast add up to its voting power in the bucket (${vp(b.votionVp)})`, Math.abs(b.rows.reduce((t, r) => t + r.votionPlan, 0) - b.totals.votionPlan) < 1 && Math.abs(b.totals.votionPlan - b.votionVp) < 2, [b.totals.votionPlan, b.votionVp]);
  const vs = A.all('#ow-plan [data-vault]'); const big = b.vaults.filter((v) => v.vp >= 1000);
  check(`${bucket}: every vault with votes is listed with what it will do, and Votion's own note where its output has one`, vs.length === big.length && vs.every((el) => /will re-cast|keeps its votes/.test(A.text(el))) && big.every((v) => { const msg = ((m.vaults.find((x) => x.key === v.key).byBucket[bucket] || {}).diff || {}).message; return !msg || A.text(vs.find((el) => el.dataset.vault === v.key)).includes(msg); })); }

console.log('— D bribed, and no votes —');
{ A.S.bucket = 'project'; A.ow.renderAllParts(); const b = B(); const exp = b.rows.filter((r) => r.potUsd > 0.5 && r.votionPlan < 50000); const els = A.all('#ow-left details'); const ex = exp.filter((r) => r.excluded && !r.offList);
  check(`every bribed pool that ends with no votes from Votion is listed (${exp.length}), and nothing else`, els.length === exp.length && exp.every((r) => els.some((e) => e.dataset.pk === r.pk)), els.map((e) => A.text(e).slice(0, 40)));
  check(`a pool Votion's plan lists a bribe for and does not offer (${ex.length} now) says exactly that, says no reason is published, and does not guess one`, ex.length > 0 && ex.every((r) => { const t = A.text(els.find((e) => e.dataset.pk === r.pk)); return /not offered — no reason published/.test(t) && /lists this bribe but does not offer the pool/.test(t) && /gives no reason/.test(t) && /does not know the reason either/.test(t) && !/because|punish|block|ban|refus|deliberate|on purpose|exclud/i.test(t); }), ex.length && A.text(els.find((e) => e.dataset.pk === ex[0].pk)).slice(0, 300));
  check('…and gives what Votion\'s own rule would do if the pool were offered — the engine\'s figure for that reading', ex.every((r) => { const t = A.text(els.find((e) => e.dataset.pk === r.pk)); return r.other.votionPlan >= 50000 ? t.includes('about ' + vp(r.other.votionPlan) + ' votes here') : /would still give it no votes/.test(t); }));
  const held = ex.filter((r) => r.votionNow >= 50000); check(`a not-offered pool Votion still holds votes on (${held.length}) says how many and that the plan takes them to zero; in part 1 its row points here`, held.every((r) => new RegExp('still holds ' + vp(r.votionNow).replace('.', '\\.') + ' votes').test(A.text(els.find((e) => e.dataset.pk === r.pk))) && /not offered — see part 2/.test(A.text(A.d.querySelector(`#ow-plan .tr[data-pk="${r.pk}"]`)))));
  // an offered pool whose bribe is under the going rate: a small pot put on the most-voted offered pool of the bucket that Votion does not vote
  const cand = Object.values(m.pools).filter((p) => p.bucket === 'project' && !p.offList && !p.votionExcluded && p.votionNow < 1 && p.vp > 2e6 && !(p.potUsd > 0.5)).sort((a, c) => c.vp - a.vp)[0];
  if (cand) { const keep = { potUsd: cand.potUsd, votionPotUsd: cand.votionPotUsd, pot: cand.pot, inVotion: cand.inVotion }; Object.assign(cand, { potUsd: 3, votionPotUsd: 3, pot: { usd: 3, tokens: [{ sym: 'LUNA', amount: 93, usd: 3 }], unpriced: [] }, inVotion: true });
    const b2 = A.w.VoteMarket.board(m, 'project', {}); A.w.document.getElementById('ow-left').innerHTML = ''; const r = b2.rows.find((x) => x.pk === cand.pk); const R = A.ow.reason(r, b2); const w = A.w.VoteMarket.whatItTakes(m, cand.pk);
    check(`an offered pool whose bribe is too small (${cand.name}, $3): "offered", its rate against Votion's going rate, and about how much more it needs (${w.entryUsd})`, /offered — the bribe is under the going rate/.test(R.tag[1]) && R.lines.join(' ').includes('per 1M votes') && (w.entryUsd ? R.lines.join(' ').includes('$' + w.entryUsd.toLocaleString('en-US')) : true), R);
    Object.assign(cand, keep); A.ow.renderAllParts(); } else check('an offered pool with a small bribe: no candidate in this data set', true);
  A.S.bucket = 'single'; A.ow.renderAllParts(); const offs = B().rows.filter((r) => r.potUsd > 0.5 && r.offList);
  check(`a bribed pool that is off its bucket's reward list (${offs.length} in Single now) says that, not "not offered"`, offs.every((r) => { const t = A.text(A.d.querySelector(`#ow-left details[data-pk="${r.pk}"]`)); return /off the reward list/.test(t) && /not on its bucket’s reward list on chain/.test(t) && !/no reason published/.test(t); }));
  A.S.bucket = 'project'; A.ow.renderAllParts(); }

console.log('— E every pool —');
{ const pks = m.buckets.project.pks; const rows = A.all('#ow-all .tr[data-pk]'); const none = pks.filter((pk) => !(m.pools[pk].potUsd > 0.5));
  check(`all ${pks.length} pools of the bucket are listed — every DEX, earning or not, on the list or off`, rows.length === pks.length && new Set(rows.map((r) => r.dataset.pk)).size === pks.length && new Set(pks.map((pk) => m.pools[pk].dex)).size >= 2 && [...new Set(pks.map((pk) => m.pools[pk].dex))].every((dx) => rows.some((r) => A.text(r).includes(dx))));
  check(`a pool with no bribe (${none.length}) says there is nothing to optimize toward; a pool off the list is marked`, none.every((pk) => /none — nothing to optimize toward/.test(A.text(rows.find((r) => r.dataset.pk === pk)))) && pks.filter((pk) => m.pools[pk].offList).every((pk) => /off the reward list/.test(A.text(rows.find((r) => r.dataset.pk === pk)))));
  check('the list scrolls inside its own box', !!A.d.querySelector('#ow-all .scroll') && /max-height/.test(html.match(/\.scroll \{[^}]*\}/)[0])); }

console.log('— F the round\'s bribes, live —');
{ const key = (b) => b.gauge + '|' + (b.asset.cw20 || b.asset.native); const pots = A.all('#ow-feed [data-pot]');
  check(`the live list is the bribe contract's own answer for round ${round}: ${chain.buckets.length} pools, each with its tokens`, pots.length === chain.buckets.length && chain.buckets.every((b) => pots.some((p) => p.dataset.pot === key(b))) && /No change since you opened the page/.test(A.text(A.d.querySelector('[data-ow="live-cap"]'))), pots.length);
  const luna = chain.buckets.find((b) => b.assets.some((a) => a.info.native === 'uluna')); const amt = Number(luna.assets.find((a) => a.info.native === 'uluna').amount) / 1e6; const el = pots.find((p) => p.dataset.pot === key(luna));
  check(`a pot shows the chain's amounts (${amt.toLocaleString('en-US')} LUNA on ${m.pools[key(luna)].name}) and whether Votion offers the pool`, A.text(el).includes(amt.toLocaleString('en-US') + ' LUNA') && /offered by Votion|not offered by Votion|off the reward list/.test(A.text(el)), A.text(el));
  const gone = JSON.parse(JSON.stringify(chain)); const gb = gone.buckets.find((b) => key(b) === key(luna)); gb.assets = gb.assets.filter((a) => a.info.native !== 'uluna'); A.setChain(gone); await A.ow.liveOnce(); await A.settle(10);
  const chg = A.all('#ow-feed [data-chg]');
  check('a bribe taken back between two reads is listed as a change, with the amounts before and after, and the pot is marked', chg.length === 1 && A.text(chg[0]).includes(m.pools[key(luna)].name) && /taken back/.test(A.text(chg[0])) && A.text(chg[0]).includes(amt.toLocaleString('en-US') + ' → 0') && /1 change since you opened the page/.test(A.text(A.d.querySelector('[data-ow="live-cap"]'))) && A.d.querySelector(`#ow-feed [data-pot="${key(luna)}"]`).classList.contains('new'), chg.map((c) => A.text(c)));
  check('…and the plan is worked out again on the pots as they now stand', Math.abs(m.pools[key(luna)].potUsd - A.S.live.last.pots[key(luna)].usd) < 0.01);
  A.setChain(null); await A.ow.liveOnce(); await A.settle(6);
  check('when the live read does not answer the page says so, keeps the last read and invents nothing', A.S.live.ok === false && A.all('#ow-feed [data-chg]').length === 1 && !!A.d.querySelector('#ow-feed .dot.stale')); }

console.log('— G the record and the log —');
{ const evs = A.all('#ow-feed [data-ev]'); const file = J(path.join(LIVE, 'tla-voting/events/bribes', `${new Date().getUTCFullYear()}`, `${String(new Date().getUTCMonth() + 1).padStart(2, '0')}.json`)); const newest = file.slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  check(`the record lists the newest bribe transactions (${evs.length} of ${file.length} on file), newest first, each linked to the explorer`, evs.length === Math.min(14, file.length) && evs[0].dataset.ev === newest.tx_hash && evs.every((e) => !e.dataset.ev || e.querySelector(`a[href$="/tx/${e.dataset.ev}"]`)));
  const wd = file.filter((e) => /withdraw/.test(e.type)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0]; const wel = wd && evs.find((e) => e.dataset.ev === wd.tx_hash);
  check('a withdrawal is said as one: every bribe that account had posted for the round it names', !wd || !wel || (/taken back/.test(A.text(wel)) && A.text(wel).includes('round ' + wd.args.period)), wel && A.text(wel));
  check('an account is shown shortened, never in full', evs.every((e) => !/terra1[0-9a-z]{38}/.test(A.text(e))));
  const ls = A.all('#ow-feed [data-log]'); const last = log.changes.slice(-1)[0]; const lp = m.pools[last.bucket + '|' + last.pool];
  check(`Votion's list: the ${log.changes.length} change(s) on record are shown with the pool's name and the two captures each fell between`, ls.length === Math.min(12, log.changes.length) && (!lp || A.text(ls[0]).includes(lp.name)) && /between .* and .*/.test(A.text(ls[0])) && /no longer offered|offered again|not offered/.test(A.text(ls[0])), ls.map((x) => A.text(x)).slice(0, 2)); }

console.log('— H failure, and data as text —');
{ const D = await page({ down: true }); check('if the public data cannot be read the page says so and shows no table', /could not be read just now/.test(D.text(D.$('ow-clocks'))) && D.$('ow-plan').style.display === 'none');
  const N = await page({ noLog: true }); check('with no log file the page still works and says there is no log yet', /No log yet/.test(N.text(N.d.querySelector('[data-ow="log"]'))) && N.all('#ow-plan .tr[data-pk]').length > 0);
  const X = await page(); const pk = X.S.m.buckets.project.pks[0]; X.S.m.pools[pk].name = '<img src=x onerror=1>'; X.ow.renderAllParts();
  check('a pool name is shown as text, never as markup', !X.d.querySelector('main img') && X.text(X.$('ow-all')).includes('<img src=x onerror=1>'));
  const sizes = [...html.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].map((x) => (x[2] === 'rem' ? Number(x[1]) * 16 : Number(x[1])));
  check(`no text is styled under 13px (${sizes.length} sizes in the page's styles; smallest ${Math.min(...sizes).toFixed(1)}px)`, Math.min(...sizes) >= 13); }
console.log(`\n=== PAGE GATE (optimizer-watch): ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
