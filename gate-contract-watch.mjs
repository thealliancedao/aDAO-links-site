#!/usr/bin/env node
// gate-contract-watch.mjs — contract-watch.html against the REAL record (tla-core contract-watch/**, the groups file, the
// state read, the governance captures). Every expected number is recounted here from the files, never typed; no address is
// typed either — the gate takes them from the records it reads.
//   TLA_CORE_DIR  a tla-core checkout (token catalog, deep-history inventory)
//   CW_DIR        a checkout that holds contract-watch/ and docs/curated/contract-watch.json (default: TLA_CORE_DIR)
//   DAOO_DIR      a dao-originations checkout (the votes)
//   PLATFORM_CRONS_DIR (optional) — compares the page's change rule with the classifier's
// Usage: NODE_PATH=… TLA_CORE_DIR=… CW_DIR=… DAOO_DIR=… node gate-contract-watch.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
import { realHeader, isTlaBar } from './gate-header.mjs';   // 1.4.1: the page builds its tab bar from the site's one list (lib/site-header.js)
const CORE = process.env.TLA_CORE_DIR, CW = process.env.CW_DIR || CORE, DAOO = process.env.DAOO_DIR, PC = process.env.PLATFORM_CRONS_DIR;
if (!CORE || !DAOO) { console.error('TLA_CORE_DIR and DAOO_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x !== undefined ? '  ← ' + JSON.stringify(x).slice(0, 500) : '')); } };
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dayOf = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const html = fs.readFileSync(path.join(here, 'contract-watch.html'), 'utf8');

// ── the files, read independently of the page ──
const cwFile = (rel) => { for (const d of [CW, CORE]) { const f = path.join(d, rel); if (fs.existsSync(f)) return f; } return null; };
const lib = J(cwFile('docs/curated/contract-watch.json')), st = J(cwFile('contract-watch/state/current.json')), idx = J(cwFile('contract-watch/index.json'));
const grouped = new Map(lib.contracts.map((c) => [c.address, c]));
const evDir = path.join(CW, 'contract-watch/events'); const all = [];
for (const y of fs.readdirSync(evDir).filter((d) => /^\d{4}$/.test(d))) for (const f of fs.readdirSync(path.join(evDir, y)).filter((f) => /^\d\d\.json$/.test(f))) all.push(...J(path.join(evDir, y, f)));
const howOf = (r) => (r.observed ? 'observed' : r.routine ? 'routine' : r.via && r.via.kind === 'dao_proposal' ? 'proposal' : 'direct');
const inGroups = all.filter((r) => grouped.has(r.contract)), changes = inGroups.filter((r) => !r.routine);
const pdCap = J(path.join(DAOO, 'phoenix-directive/governance/proposals.json'));
const REMOVE_TX = 'C8365D87F99BC1BBA4D0F1B61C4D2DDA87BBB96D6D5500306BF1D0903CA63B8A';   // 2026-11-24: assets taken off the single list, sent directly
const rm = all.find((r) => r.txhash === REMOVE_TX && /remove_assets$/.test(r.action)), sa = all.find((r) => r.txhash === REMOVE_TX && /set_addresses$/.test(r.action));
const a117 = all.find((r) => r.via && r.via.proposal_id === '117' && /remove_assets$/.test(r.action));
if (!rm || !sa || !a117) { console.error('the record in CW_DIR lacks the transactions this gate is built on'); process.exit(1); }

// ── the page in jsdom ──
const requested = [];
function mkFetch(opts = {}) {
  return async (u) => {
    const url = String(u).split('?')[0]; requested.push(url);
    if (opts.down) return { ok: false, status: 503 };
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    let m;
    if ((m = url.match(/raw\.githubusercontent\.com\/thealliancedao\/tla-core\/main\/(.+)$/))) {
      if (m[1] === 'tla-flows/events/heartbeat.json') return ok({ capturedAt: '2026-11-25T05:17:03.000Z', last_heights: { cursor: 23906296 } });   // the heartbeat's two fields the page reads (a stand-in: the checkout need not hold the flows folder)
      const f = cwFile(m[1]); return f ? ok(J(f)) : { ok: false, status: 404 };
    }
    if ((m = url.match(/raw\.githubusercontent\.com\/thealliancedao\/dao-originations\/main\/(.+)$/))) { const f = path.join(DAOO, m[1]); return fs.existsSync(f) ? ok(J(f)) : { ok: false, status: 404 }; }
    if (/\/cosmwasm\/wasm\/v1\/contract\//.test(url)) { if (opts.lcd === 'down') return { ok: false, status: 503 }; const book = Object.entries(st.address_book.entries).map(([k, v]) => [k, v]); if (opts.lcd === 'moved') book[0] = [book[0][0], book[1][1]]; return ok({ data: book }); }
    return { ok: false, status: 404 };
  };
}
async function page(hash = '', opts = {}) {
  const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, ''), { url: 'https://theadao.com/contract-watch.html' + hash, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount(o) { w.__mount = o; }, subnav(items, o) { w.__subnav = { items, o }; }, tlaTabs: realHeader().tlaTabs }; w.SiteFooter = { mount(o) { w.__footer = o; } };
    w.fetch = mkFetch(opts); w.Element.prototype.scrollIntoView = function () { w.__scrolled = this.id; }; w.__errors = []; w.addEventListener('error', (e) => w.__errors.push(String(e.message)));
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { w.__copied = t; } }, configurable: true }); } });
  const w = dom.window; const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 15)); };
  await settle(20);
  const d = w.document, $ = (id) => d.getElementById(id), click = async (el) => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); await settle(4); };
  return { w, d, $, click, settle, S: w.__cw.S, text: (el) => (el.textContent || '').replace(/\s+/g, ' ').trim() };
}

console.log('— A the page and its record —');
const P = await page();
{ const uniq = new Set(all.map((r) => r.k)).size;
  check(`the page reads every month the index lists, plus this month and the last, and holds every record of the files (${uniq})`, P.S.recs.length === uniq && Object.keys(idx.months).every((m) => requested.some((u) => u.endsWith(`contract-watch/events/${m}.json`))), { page: P.S.recs.length, files: uniq });
  check('no address is typed in the page (they come from the record, the groups file and the state read)', !/terra1[0-9a-z]{20,}/.test(html));
  check('the page is neutral in its own words: no judgement vocabulary in the source', !/\b(shady|scam|rug\w*|malicious|fraud\w*|illegal|stole\w*|attack\w*|hostile|improper\w*|unauthori[sz]ed|suspicious|abuse\w*|theft)\b/i.test(html));
  check('no script error while loading and rendering', P.w.__errors.length === 0, P.w.__errors);
  const sn = P.w.__subnav; check('the TLA tab bar is the site\'s one list — Overview · Member Portfolio · Slippage Simulator · Vote Simulator · LP Grades · Contract Watch · PD Watch — with Contract Watch lit, every other tab a link to its page, no Pools and no Docs', sn && isTlaBar(sn.items, 'watch') && sn.o.attach === '#cw-top-tile' && P.w.__mount.page === 'contract-watch' && !/id: 'overview'/.test(html), sn && sn.items.map((t) => t.label));
  check('the footer carries the page rev and its own changelog key', P.w.__footer && P.w.__footer.rev === P.w.__cw.REV && P.w.__footer.revDate === P.w.__cw.REV_DATE && P.w.__footer.page === 'contract-watch', P.w.__footer);
  if (PC) { const src = fs.readFileSync(path.join(PC, 'tla-flows/lib/admin-classifier.js'), 'utf8'); const m = src.match(/const CHANGE_RE = (\/.+\/);/); check('the page\'s rule for "this action changes a contract" is the classifier\'s, character for character', m && m[1] === String(P.w.__cw.CHANGE_RE), m && m[1].length); }
  else console.log('  (PLATFORM_CRONS_DIR not set — the change-rule comparison skipped)'); }

console.log('— B at a glance —');
{ const tiles = [...P.d.querySelectorAll('#cw-glance .cw-tile')].map((t) => [P.text(t.querySelector('.k')), P.text(t.querySelector('.v'))]);
  const n = (h) => changes.filter((r) => howOf(r) === h).length, want = [changes.length, n('proposal'), n('direct'), n('observed')].map((x) => x.toLocaleString('en-US'));
  check(`the four tiles are recounts of the record: ${want.join(' · ')} (changes on the grouped contracts · by proposal · sent directly · seen in a state read)`, tiles.length === 4 && tiles.map((t) => t[1]).join() === want.join() && /Changes on record/i.test(tiles[0][0]) && /passed proposal/i.test(tiles[1][0]) && /Sent directly/i.test(tiles[2][0]) && /state read/i.test(tiles[3][0]), tiles);
  const newest = changes.slice().sort((a, b) => b.height - a.height)[0];
  check('the Latest line is the newest change on record and says how it arrived', new RegExp(newest.timestamp.slice(0, 4)).test(P.text(P.$('cw-latest'))) && /Passed proposal|Sent directly|Seen in a state read/.test(P.text(P.$('cw-latest'))), P.text(P.$('cw-latest')));
  check('the coverage line names the stored history and the live stream', /On record:/.test(P.text(P.$('cw-cover-line'))) && /live since 25 Nov 2026/.test(P.text(P.$('cw-cover-line'))), P.text(P.$('cw-cover-line'))); }

console.log('— C the changes list —');
{ const rows = [...P.d.querySelectorAll('#cw-list .cw-row')];
  const held = (els) => els.reduce((n, r) => n + (r.dataset.ks ? r.dataset.ks.split(' ').length : 1), 0);
  check('default view: newest first, the weekly routine left out, forty changes shown (the differences one state read found in the address book are one card) and a way to see more', held(rows) === 40 && !rows.some((r) => r.classList.contains('how-routine')) && !P.$('cw-more').hidden && new RegExp(`^${changes.length.toLocaleString('en-US')} changes`).test(P.text(P.$('cw-count'))), { cards: rows.length, changes: held(rows), count: P.text(P.$('cw-count')) });
  P.S.f.q = REMOVE_TX; P.w.__cw.renderAll(); const hit = [...P.d.querySelectorAll('#cw-list .cw-row')];
  check('searching the transaction of 24 Nov 2026 finds its two changes', hit.length === 2, hit.length);
  const row = hit.find((r) => /reward list/.test(r.textContent)), t = P.text(row), n = String(rm.detail.assets).split(',').length;
  const before = all.filter((r) => r.contract === rm.contract && r.kind === 'list' && !r.observed && r.height < rm.height);
  check(`the removal reads in plain words — "Removed ${n} assets from the reward list", on the Single bucket's staking contract, 24 Nov 2026 20:10 UTC`, new RegExp(`Removed ${n} assets from the reward list`).test(t) && /Single bucket — staking contract/.test(t) && /24 Nov 2026 · 20:10 UTC/.test(t), t.slice(0, 200));
  check('…marked "Sent directly", with the sender\'s address (shortened, the full one behind it) and the role it holds in the address book, and the plain statement that no proposal was executed', row.querySelector('.cw-how.direct') && /Sent directly/i.test(P.text(row.querySelector('.cw-how'))) && row.querySelector(`.cw-addr[data-addr="${rm.signer}"]`) && !t.includes(rm.signer) && /No proposal was executed in this transaction/.test(t) && [...row.querySelectorAll('.cw-role')].some((x) => st.address_book.entries[x.textContent] === rm.signer), t.slice(200, 520));
  check(`…and flagged from the record itself: every earlier change of this kind to this contract (${before.length}) came through a passed proposal`, before.length >= 3 && before.every((r) => howOf(r) === 'proposal') && row.querySelector('.cw-flag') && new RegExp(`${before.length} of them — came through a passed proposal`).test(P.text(row.querySelector('.cw-flag'))), P.text(row.querySelector('.cw-flag') || row));
  // the proposals that asked for the same, recounted from the capture
  const mine = new Set(String(rm.detail.assets).split(',')), t0 = Date.parse(rm.timestamp);
  const want = Object.values(pdCap.proposals).filter((p) => p.status !== 'Executed' && (p.live || (Date.parse(p.expiration.at_time_iso) > t0 - 45 * 864e5 && Date.parse(p.expiration.at_time_iso) < t0 + 30 * 864e5)) && (p.decodedActions || []).some((a) => a.type === 'wasm.execute' && a.contract === rm.contract && a.action === 'remove_assets' && (a.args || []).some((x) => mine.has(x.cw20 ? 'cw20:' + x.cw20 : 'native:' + x.native)))).map((p) => 'A' + p.id.replace(/^pd/, ''));
  const rel = row.querySelector('.cw-rel'), got = rel ? [...rel.querySelectorAll('li a')].map((a) => a.textContent) : [];
  check(`…with the proposals that asked for this and did not execute (${want.join(', ') || 'none in the capture'}): each with its status, its votes and how many of these assets it names`, want.length ? (got.sort().join() === want.sort().join() && [...rel.querySelectorAll('li')].every((li) => /Yes \d+ · No \d+ · Abstain \d+ of \d+ voting power; passes at 75%/.test(li.textContent) && /It names \d of the \d assets in this change/.test(li.textContent)) && [...rel.querySelectorAll('li a')].every((a) => /^https:\/\/daodao\.zone\/dao\/terra1[0-9a-z]{58}\/proposals\/A\d+$/.test(a.href))) : !rel, { want, got, t: rel && P.text(rel).slice(0, 300) });
  { const items = [...row.querySelectorAll(':scope > .cw-items li')].map((li) => P.text(li)), cat = J(path.join(CORE, 'token-catalog/snapshots/current.json')), ids = String(rm.detail.assets).split(',');
    const lpIds = ids.filter((a) => (cat.pools || []).some((p) => p.gauge_pool_id === a) && !(cat.tokens || []).some((t) => t.denom === a.replace(/^(cw20|native):/, '')));
    check(`…the assets are named from the token catalog, never guessed: a token it knows by its own symbol reads as that token (ampCAPA, not an LP), the ${lpIds.length} LP tokens as their pair and DEX, each with its id beside it`, items.length === ids.length && items.some((x) => /^ampCAPA /.test(x)) && !items.some((x) => /CAPA–ampCAPA/.test(x)) && items.filter((x) => /^[\w.]+–[\w.]+ LP · /.test(x)).length === lpIds.length && items.every((x) => /…/.test(x)), items); }
  check('…a link to the transaction on the explorer, and a link that points at this change', /chainsco\.pe\/terra2\/tx\/C8365D87/.test(row.querySelector('.cw-acts a').href) && row.querySelector('[data-copy]').dataset.copy.endsWith('#k=' + encodeURIComponent(rm.k)));
  const srow = hit.find((r) => /address book/.test(r.textContent));
  check('the address-book change in the same transaction: when the record has no message it says that the events do not name the role; when it carries its message that note is gone', srow && /Changed the address book/.test(srow.textContent) && (sa.sent && sa.sent.msg ? !/do not say which role changed/.test(srow.textContent) : /do not say which role changed/.test(srow.textContent)), srow && P.text(srow).slice(0, 200));
  if (rm.sent && rm.sent.msg) check('where the plain words already list what changed (the three assets), the message as sent is there but folded', row.querySelector('details.cw-sent') !== null && !row.querySelector('details.cw-sent').open && /remove_assets/.test(row.querySelector('details.cw-sent summary').textContent));
  // a change that came through a proposal
  P.S.f.q = 'A117'; P.w.__cw.renderAll(); const prow = [...P.d.querySelectorAll('#cw-list .cw-row')].find((r) => r.dataset.k === a117.k), p117 = pdCap.proposals.pd117, pt = prow ? P.text(prow) : '';
  check('searching "A117" finds the change proposal A117 made: marked "Passed proposal", the proposal\'s own title, status and votes, a link to it on DAO DAO, and who pressed execute', prow && prow.querySelector('.cw-how.proposal') && pt.includes(p117.title.trim().slice(0, 40)) && /passed and executed/.test(pt) && new RegExp(`Yes ${p117.votes.yes} · No ${p117.votes.no} · Abstain ${p117.votes.abstain} of ${p117.totalPower} voting power`).test(pt) && /\/proposals\/A117$/.test(prow.querySelector('.cw-line a').href) && /Executed by/.test(pt) && !prow.querySelector('.cw-flag') && !prow.querySelector('.cw-rel'), pt.slice(0, 400));
  P.S.f.q = ''; P.S.f.how = 'direct'; P.w.__cw.renderAll();
  check('filter "Sent directly": only such changes, and the count is the recount', [...P.d.querySelectorAll('#cw-list .cw-row')].every((r) => r.classList.contains('how-direct')) && new RegExp(`^${changes.filter((r) => howOf(r) === 'direct').length.toLocaleString('en-US')} changes of`).test(P.text(P.$('cw-count'))), P.text(P.$('cw-count')));
  P.S.f.how = 'all'; P.S.f.kind = 'list'; P.S.f.bucket = 'gauge-single'; P.w.__cw.renderAll();
  const wantN = changes.filter((r) => r.kind === 'list' && grouped.get(r.contract).bucket === 'gauge-single').length;
  check(`filters combine: reward-list changes of the Single bucket = ${wantN}, every one a list change on that group`, new RegExp(`^${wantN} changes of`).test(P.text(P.$('cw-count'))) && [...P.d.querySelectorAll('#cw-list .cw-row')].every((r) => /reward list/.test(r.textContent) && /Single bucket/.test(r.textContent)), P.text(P.$('cw-count')));
  P.S.f.kind = 'all'; P.S.f.bucket = 'all'; P.S.f.routine = true; P.w.__cw.renderAll();
  check('the weekly distribution appears only when asked for, and is labelled routine', new RegExp(`^${inGroups.length.toLocaleString('en-US')} changes`).test(P.text(P.$('cw-count'))) && P.d.querySelector('#f-kind [data-v="epoch"]') !== null, P.text(P.$('cw-count')));
  P.S.f.routine = false; P.w.__cw.renderAll(); }

console.log('— D what the state read saw —');
{ const obs = changes.filter((r) => r.observed), roles = obs.filter((r) => r.action === 'address_book');
  if (!obs.length) console.log('  (no state-read record in this checkout — section skipped)');
  else {
    P.S.f.how = 'observed'; P.w.__cw.renderAll(); const rows = [...P.d.querySelectorAll('#cw-list .cw-row')];
    const heldD = rows.reduce((n, r) => n + (r.dataset.ks ? r.dataset.ks.split(' ').length : 1), 0);
    check(`the ${obs.length} differences the state read filed are shown as "Seen in a state read", none as "Sent directly"`, heldD === obs.length && rows.every((r) => r.querySelector('.cw-how.observed')), { cards: rows.length, differences: heldD });
    const r0 = roles.find((r) => r.detail.before && r.detail.after && grouped.has(r.detail.before)); const el = r0 && rows.find((x) => (x.dataset.ks || x.dataset.k).split(' ').includes(r0.k)), t = el ? P.text(el) : '';
    const sameRead = roles.filter((r) => r.timestamp === r0.timestamp && r.contract === r0.contract), tr = el && [...el.querySelectorAll('tbody tr')].find((x) => x.cells[0].textContent === r0.detail.role);
    check(`the address book's differences of one read are ONE card (${sameRead.length} roles): per role who holds it now and who held it before (named when it is a grouped contract), the two reads, and that a state read does not show the sender`, !!el && new RegExp(`The address book is different in ${sameRead.length} roles?`).test(t) && el.querySelectorAll('tbody tr').length === sameRead.length && !!tr && tr.cells[1].querySelector(`.cw-addr[data-addr="${r0.detail.after}"]`) && tr.cells[2].textContent.includes(grouped.get(r0.detail.before).name) && /Different at the read of 25 Nov 2026/.test(t) && /from the read of 11 Aug 2026/.test(t) && /not who sent it/.test(t) && !/Sent by/.test(t) && !el.querySelector('.cw-acts a[href*="/tx/"]'), t.slice(0, 420));
    check('…and it points at the transaction on record between the two reads for that contract — the address-book change of 24 Nov 2026', !!el && [...el.querySelectorAll('[data-jump]')].some((a) => a.dataset.jump === sa.k && /24 Nov 2026 — sent directly/.test(a.textContent)), el && [...el.querySelectorAll('[data-jump]')].map((a) => a.textContent));
    const up = obs.find((r) => r.action === 'code_id'), ue = up && rows.find((x) => x.dataset.k === up.k);
    if (up) check('a code id that changed: before and after, and — where the record has no upgrade in between — that no such transaction is on record', ue && P.text(ue).includes(`Code id now ${up.detail.after} — before ${up.detail.before}`) && (all.some((r) => !r.observed && r.contract === up.contract && r.kind === 'upgrade' && r.timestamp > up.detail.seen_after) || /No transaction of this kind is on record/.test(P.text(ue))), ue && P.text(ue).slice(0, 300));
    P.S.f.how = 'all'; P.w.__cw.renderAll();
  } }

console.log('— E votes that are open —');
{ const want = Object.values(pdCap.proposals).filter((p) => (p.live || p.status === 'Open' || p.status === 'Passed') && (p.decodedActions || []).some((a) => a.type === 'wasm.execute' && grouped.has(a.contract) && P.w.__cw.CHANGE_RE.test(a.action))).map((p) => 'A' + p.id.replace(/^pd/, ''));
  const got = [...P.d.querySelectorAll('#cw-open .cw-open-row')].map((r) => r.querySelector('a b').textContent);
  check(`open votes that would change a grouped contract are listed (${want.join(', ') || 'none open in this capture'}), a vote that only sends funds is not`, got.sort().join() === want.sort().join(), { want, got });
  if (want.includes('A305')) { const r = [...P.d.querySelectorAll('#cw-open .cw-open-row')].find((x) => /A305/.test(x.textContent)), t = P.text(r);
    check('A305: what it would do, on which contract, its votes — and that a change of the same kind was sent directly since the vote opened', /Would remove 3 assets from the reward list on Single bucket — staking contract/.test(t) && /Yes 25 · No 0 · Abstain 0 of 100 voting power; passes at 75%/.test(t) && /voting ends 29 Nov 2026/.test(t) && /was sent directly: 24 Nov 2026/.test(t), t); } }

console.log('— F contracts —');
{ await P.click(P.d.querySelector('.cw-view[data-view="contracts"]'));
  const groups = [...P.d.querySelectorAll('#cw-groups .cw-group')];
  check(`the groups of the groups file, in its order (${lib.buckets.length}), each with its contracts and its changes counted`, groups.map((g) => g.dataset.group).join() === lib.buckets.filter((b) => lib.contracts.some((c) => c.bucket === b.id)).map((b) => b.id).join() && groups.every((g) => /\d+ contracts?/.test(g.textContent)), groups.map((g) => g.dataset.group));
  { const named = lib.daos.flatMap((dao) => lib.contracts.filter((c) => c.name.startsWith(dao.short + ' — ')).map((c) => ({ c, dao })));
    const bad = named.filter(({ c, dao }) => !(st.contracts[c.address] && st.contracts[c.address].admin === dao.core));
    check(`a contract carries a DAO's name only where that DAO is its admin on chain (${named.length} such names, checked against the state read)`, named.length > 0 && bad.length === 0, bad.map((x) => x.c.name)); }
  await P.click(P.d.querySelector('[data-toggle-group="gauge-single"]'));
  const g = P.d.querySelector('.cw-group[data-group="gauge-single"]'), cs = lib.contracts.filter((c) => c.bucket === 'gauge-single');
  check('opening the Single bucket lists its contracts with their role names', g.classList.contains('open') && g.querySelectorAll('.cw-c').length === cs.length && /ASSET_STAKING__single/.test(g.textContent) && /CONNECTOR__single/.test(g.textContent), g.querySelectorAll('.cw-c').length);
  await P.click(P.d.querySelector(`[data-toggle-contract="${rm.contract}"]`));
  const c = P.$('c-' + rm.contract), ch = st.contracts[rm.contract], t = P.text(c), mine = changes.filter((r) => r.contract === rm.contract);
  check('opening the staking contract: its address in full, its admin (and that the admin can upgrade it), code id, creator, the chain\'s own label, and when that was read', t.includes(rm.contract) && /can upgrade this contract/.test(t) && c.querySelector(`.cw-addr[data-addr="${ch.admin}"]`) && t.includes('Code id' + ch.code_id) && c.querySelector(`.cw-addr[data-addr="${ch.creator}"]`) && t.includes(ch.label) && /As read\d+ \w+ 20\d\d/.test(t), t.slice(0, 400));
  check(`…and its own timeline: ${Math.min(mine.length, 60)} changes, newest first, without the weekly routine`, c.querySelectorAll('.cw-timeline .cw-row').length === Math.min(mine.length, 60) && !c.querySelector('.cw-timeline .how-routine') && /weekly distribution is left out/.test(t), c.querySelectorAll('.cw-timeline .cw-row').length);
  P.$('c-q').value = 'luna-usdc'; P.$('c-q').dispatchEvent(new P.w.Event('input')); await P.settle(18);
  check('finding a contract by name opens the groups that hold a match', [...P.d.querySelectorAll('#cw-groups .cw-c-name')].length > 0 && [...P.d.querySelectorAll('#cw-groups .cw-c-name')].every((x) => /luna-usdc/i.test(x.textContent)), [...P.d.querySelectorAll('#cw-groups .cw-c-name')].map((x) => x.textContent)); }

console.log('— G who holds the keys —');
{ await P.click(P.d.querySelector('.cw-view[data-view="roles"]'));
  const ab = st.address_book.entries, tables = P.d.querySelectorAll('#cw-roles .cw-table'), ptr = Object.keys(ab).filter((r) => grouped.has(ab[r]) && grouped.get(ab[r]).role === r);
  const moved = [...new Set(changes.filter((r) => r.observed && r.action === 'address_book').map((r) => r.detail.role))];
  check(`the address book: every role of the state read (${Object.keys(ab).length}) — ${Object.keys(ab).length - ptr.length} controllers and recipients, ${ptr.length} contracts the system uses — each with its holder`, tables[0].querySelectorAll('tbody tr').length === Object.keys(ab).length - ptr.length + moved.filter((r) => !(r in ab)).length && tables[1].querySelectorAll('tbody tr').length === ptr.length && Object.keys(ab).every((r) => P.$('cw-roles').textContent.includes(r)), [tables[0].querySelectorAll('tbody tr').length, tables[1].querySelectorAll('tbody tr').length]);
  check(`a role the state read saw move is marked, with who held it before, at which read, and a link to the difference (${moved.length} roles)`, P.d.querySelectorAll('#cw-roles .cw-table tr.changed').length === moved.length && (!moved.length || [...P.d.querySelectorAll('#cw-roles .cw-table tr.changed')].every((tr) => /at the read of \d+ \w+ 20\d\d/.test(tr.cells[2].textContent) && tr.cells[2].querySelector('[data-jump]'))) && [...P.d.querySelectorAll('#cw-roles .cw-table tr:not(.changed) td:nth-child(3)')].every((td) => /no difference on record/.test(td.textContent)), P.d.querySelectorAll('#cw-roles .cw-table tr.changed').length);
  { const ctl = Object.keys(ab).filter((r) => !ptr.includes(r)), byHolder = {}; for (const r of ctl) (byHolder[ab[r]] ||= []).push(r);
    const top = Object.entries(byHolder).sort((x, y) => y[1].length - x[1].length)[0], cards = [...P.d.querySelectorAll('#cw-roles .cw-holder')], card = cards.find((c) => c.querySelector(`.cw-addr[data-addr="${top[0]}"]`));
    const lastOf = (role) => changes.filter((r) => r.observed && r.action === 'address_book' && r.detail.role === role).sort((x, y) => y.height - x.height)[0];
    const fromDao = top[1].filter((role) => { const l = lastOf(role); return l && l.detail.after === top[0] && grouped.has(l.detail.before); });
    check(`the same roles by holder: ${cards.length} holders; the one with most (${top[1].length} roles) lists them and, from the record, how many of them another holder had at the earlier read (${fromDao.length})`, cards.length === Object.keys(byHolder).length && !!card && [...card.querySelectorAll('.cw-role')].map((x) => x.textContent).sort().join() === top[1].slice().sort().join() && new RegExp(`${top[1].length} roles?`).test(card.textContent) && (!fromDao.length || new RegExp(`At the read of 11 Aug 2026, ${fromDao.length === top[1].length ? 'all ' + fromDao.length + ' were' : fromDao.length + ' of them (was|were)'} held by ${grouped.get(lastOf(fromDao[0]).detail.before).name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(P.text(card))), card && P.text(card)); }
  const core = new Set(lib.buckets.filter((b) => b.core).map((b) => b.id)), admins = new Set(lib.contracts.filter((c) => core.has(c.bucket) && st.contracts[c.address]).map((c) => st.contracts[c.address].admin || ''));
  check(`who can upgrade the Alliance's own contracts: one row per admin (${admins.size}), with the contracts each can upgrade`, tables[2].querySelectorAll('tbody tr').length === admins.size && [...admins].filter(Boolean).every((a) => tables[2].querySelector(`.cw-addr[data-addr="${a}"]`)) && /Can upgrade/i.test(tables[2].textContent), tables[2].querySelectorAll('tbody tr').length);
  const before = requested.length; await P.click(P.$('cw-livebtn')); await P.settle(10);
  check('"Read the address book from the chain now" asks a public node from the visitor\'s browser and, when it answers the same, says so', requested.slice(before).some((u) => /terra-lcd\.publicnode\.com\/cosmwasm\/wasm\/v1\/contract\/terra1[0-9a-z]{58}\/smart\//.test(u)) && /Same as shown/.test(P.text(P.$('cw-liveout'))), P.text(P.$('cw-liveout')));
  const P2 = await page('#view=roles', { lcd: 'moved' }); await P2.click(P2.$('cw-livebtn')); await P2.settle(10);
  check('…when the chain differs from the page\'s last read, the role is named with both values', /The chain differs from this page’s last read in 1 role/.test(P2.text(P2.$('cw-liveout'))) && P2.$('cw-liveout').querySelectorAll('li').length === 1, P2.text(P2.$('cw-liveout')));
  const P3 = await page('#view=roles', { lcd: 'down' }); await P3.click(P3.$('cw-livebtn')); await P3.settle(10);
  check('…and when no node answers, it says that and nothing else', /No public node answered just now/.test(P3.text(P3.$('cw-liveout')))); }

console.log('— H look up an address —');
{ const a = rm.signer, sent = all.filter((r) => r.signer === a && howOf(r) === 'direct'), adminOf = Object.keys(st.contracts).filter((c) => st.contracts[c].admin === a), creatorOf = Object.keys(st.contracts).filter((c) => st.contracts[c].creator === a);
  const row = [...P.d.querySelectorAll('.cw-addr')].find((x) => x.dataset.addr === a) || null;
  P.S.lookup = a; await P.click(P.d.querySelector('.cw-view[data-view="lookup"]')); const t = P.text(P.$('cw-lookup'));
  check(`the address that sent the 24 Nov change: ${sent.length} changes sent directly, the roles it holds, ${adminOf.length} watched contracts it is admin of and ${creatorOf.length} it created — all recounted`, new RegExp(`Sent directly${sent.length} changes? on record`).test(t) && Object.keys(st.address_book.entries).filter((r) => st.address_book.entries[r] === a).every((r) => t.includes(r)) && (adminOf.length ? new RegExp(`${adminOf.length} watched contracts?`).test(t) : /Admin ofno watched contract/.test(t)) && new RegExp(`Creator of${creatorOf.length} watched contracts?`).test(t) && P.d.querySelectorAll('#cw-lookup .cw-row').length === Math.min(sent.length, 100), t.slice(0, 500));
  check('the wider inventory (900 KB) is not fetched until it is asked for', !requested.some((u) => /contracts-seen\.json/.test(u)) && !!P.$('cw-wide'));
  await P.click(P.$('cw-wide')); await P.settle(30); const seen = J(cwFile('docs/deep-history/contracts-seen.json')).contracts,   /* the same file the page is served: the newest checkout first (the inventory was rebuilt 2026-11-25) */ wa = Object.keys(seen).filter((c) => seen[c].admin === a).length, wc = Object.keys(seen).filter((c) => seen[c].creator === a).length;
  check(`…asked for, it counts across the ${Object.keys(seen).length.toLocaleString('en-US')} contracts of the inventory: admin of ${wa}, creator of ${wc}`, requested.some((u) => /contracts-seen\.json/.test(u)) && new RegExp(`admin of ${wa}, creator of ${wc}`).test(P.text(P.$('cw-lookup'))), P.text(P.$('cw-lookup')).slice(0, 200));
  const ex = all.find((r) => howOf(r) === 'proposal'); P.S.lookup = ex.signer; P.w.__cw.renderAll(); const n = new Set(all.filter((r) => r.signer === ex.signer && howOf(r) === 'proposal').map((r) => r.via.proposal_module + ':' + r.via.proposal_id)).size;
  check('an account that pressed execute on passed proposals: those are counted apart from changes it sent itself', new RegExp(`Executed${n} passed proposals?`).test(P.text(P.$('cw-lookup'))) && /Passed proposals it executed/.test(P.text(P.$('cw-lookup'))), P.text(P.$('cw-lookup')).slice(0, 260));
  P.S.lookup = REMOVE_TX.toLowerCase(); P.w.__cw.renderAll(); check('a transaction hash finds the changes of that transaction', P.d.querySelectorAll('#cw-lookup .cw-row').length === 2);
  P.S.lookup = 'F'.repeat(64); P.w.__cw.renderAll(); check('a transaction that is not in the record says so, with the reason it may not be, and a link to the explorer', /not in the record/.test(P.text(P.$('cw-lookup'))) && /stretch the record does not cover/.test(P.text(P.$('cw-lookup'))) && !!P.$('cw-lookup').querySelector('a[href*="chainsco.pe/terra2/tx/"]'));
  P.S.lookup = 'hello'; P.w.__cw.renderAll(); check('anything else is refused in plain words', /not a terra1… address or a transaction hash/.test(P.text(P.$('cw-lookup'))));
  P.S.lookup = rm.contract; P.w.__cw.renderAll(); check('a grouped contract is named and links to its page in Contracts', P.$('cw-lookup').querySelector('h2').textContent === grouped.get(rm.contract).name && !!P.$('cw-lookup').querySelector(`a[data-contract="${rm.contract}"]`)); }

console.log('— I links that open one thing —');
{ const A = await page('#k=' + encodeURIComponent(rm.k)); const el = A.d.querySelector(`.cw-row[data-k="${rm.k}"]`);
  check('#k=… opens Changes on that change and brings it into view', !!el && !A.$('view-changes').hidden && A.w.__scrolled === el.id);
  const B = await page('#contract=' + rm.contract); check('#contract=… opens that contract in Contracts', !B.$('view-contracts').hidden && /can upgrade this contract/.test(B.text(B.$('c-' + rm.contract))));
  const C = await page('#address=' + rm.signer); check('#address=… opens the look-up for that address', !C.$('view-lookup').hidden && C.d.querySelectorAll('#cw-lookup .cw-row').length > 0 && C.$('l-q').value === rm.signer);
  const D = await page('#view=changes&how=proposal&kind=list'); check('#view=…&how=…&kind=… restores the filters', D.S.f.how === 'proposal' && D.S.f.kind === 'list' && [...D.d.querySelectorAll('#cw-list .cw-row')].every((r) => r.classList.contains('how-proposal') && /reward list|vault/.test(r.textContent))); }

console.log('— J what the record covers, and failure —');
{ const lis = [...P.d.querySelectorAll('#cw-cover li')].map((li) => P.text(li)), rw = J(cwFile('contract-watch/rewalk.json'));
  check('coverage: once the archive read is complete, one line for the whole history with the checks against the chain and no stretch "not on record" (until then: the stored history with its span and the stretch that is NOT on record); each catch-up job with its progress, the live stream with its last run, the state read, and what no walk sees', (idx.archive && idx.archive.complete ? /^The whole history, read once from an archive node/.test(lis[0]) && /Checked against the chain/.test(lis[0]) && !lis.some((x) => /not on record\./.test(x)) : lis.some((x) => x.startsWith(`${dayOf(J(cwFile('contract-watch/backfill-report.json')).first.day)} → ${dayOf(idx.history.walks_end)} — taken from the walks already stored`)) && lis.some((x) => x.startsWith(dayOf(idx.history.walks_end) + ' → ') && /not on record\./.test(x))) && lis.filter((x) => /read again/.test(x)).length === rw.jobs.filter((x) => !rw.jobs.some((y) => y !== x && y.from <= x.from && y.to >= x.to && (y.to - y.from) > (x.to - x.from))).length && lis.some((x) => /25 Nov 2026 → now — live/.test(x) && /Last run: 25 Nov 2026, 05:17 UTC, read to block 23,906,296/.test(x)) && lis.some((x) => /^State read/.test(x)) && lis.some((x) => /^Not seen by a walk/.test(x)), lis.map((x) => x.slice(0, 70)));
  check('the raw data is one click away (records, state file, groups, how a record is built)', [...P.d.querySelectorAll('#cw-data a')].length === 4 && [...P.d.querySelectorAll('#cw-data a')].every((a) => /thealliancedao\/tla-core/.test(a.href)));
  const X = await page('', { down: true });
  check('when nothing can be read the page says so and stays whole — no error, no empty tiles posing as zeros', /could not be read just now/.test(X.text(X.$('cw-glance'))) && X.w.__errors.length === 0 && X.d.querySelectorAll('#cw-glance .v').length === 0, X.text(X.$('cw-glance'))); }

console.log('— K data is text, never markup —');
{ const E = await page(); const evil = '<img src=x onerror="window.__pwned=1">';
  E.S.recs.unshift({ schemaVersion: 1, k: 'evil:0', txhash: 'AB'.repeat(32), height: 99999999, timestamp: '2026-12-01T00:00:00Z', kind: 'setting', contract: rm.contract, action: 'x/update_config' + evil, detail: { assets: 'cw20:' + evil }, signer: evil, msg_type: null, via: { kind: 'dao_proposal', dao: evil, proposal_module: evil, proposal_id: evil }, _how: 'proposal' });
  E.S.recs.unshift({ schemaVersion: 1, k: 'evil:1', txhash: null, height: 99999999, timestamp: '2026-12-01T00:00:00Z', kind: 'role', contract: rm.contract, action: 'address_book', detail: { role: evil, before: evil, after: evil, seen_after: '2026-11-01T00:00:00Z', seen_by: '2026-12-01T00:00:00Z' }, signer: null, via: null, observed: 'state-read', _how: 'observed' });
  E.S.st.contracts[rm.contract].label = evil; E.S.lib.byAddr.get(rm.contract).name = evil; E.S.f.all = true; E.w.__cw.renderAll();
  E.S.lookup = evil; E.w.__cw.renderAll(); await E.click(E.d.querySelector('.cw-view[data-view="contracts"]')); await E.click(E.d.querySelector('.cw-view[data-view="roles"]')); await E.click(E.d.querySelector('.cw-view[data-view="changes"]'));
  check('a record, a label or a name that carries markup is shown as the characters it is — in the list, the contract page, the roles and the look-up', E.d.querySelectorAll('img').length === 0 && !E.w.__pwned && E.$('cw-list').textContent.includes('<img src=x') && E.w.__errors.length === 0, { imgs: E.d.querySelectorAll('img').length, errs: E.w.__errors }); }

console.log('— L the message as sent —');
{ const real = all.filter((r) => r.sent && r.sent.msg && !r.sent.msg.too_long);
  if (real.length) { const r = real.find((x) => x.txhash === REMOVE_TX) || real[0]; P.S.f = { how: 'all', kind: 'all', bucket: 'all', q: r.txhash, routine: false, all: true }; P.w.__cw.renderAll(); const el = P.d.querySelector(`.cw-row[data-k="${r.k}"] .cw-sent`);
    check(`a record that carries its message (${real.length} in this checkout) shows it: "The message as sent", the call's own name, its values as lines`, !!el && /The message as sent/.test(el.textContent) && el.querySelectorAll('li').length > 0 && el.textContent.includes(Object.keys(r.sent.msg)[0]), el && P.text(el).slice(0, 300)); }
  else console.log('  (no record in this checkout carries its message yet — the renderer is checked on a constructed one below)');
  if (sa.sent && sa.sent.msg) {   // the 24 Nov address-book change carries its own message: what it set is on the record
    const pairs = sa.sent.msg.set_addresses.addresses, moved = changes.filter((r) => r.observed && r.action === 'address_book' && r.detail.after === sa.signer && r.detail.before).map((r) => r.detail.role).sort();
    P.S.f = { how: 'all', kind: 'all', bucket: 'all', q: REMOVE_TX, routine: false, all: false }; P.w.__cw.renderAll(); const el = P.d.querySelector(`.cw-row[data-k="${sa.k}"]`), t = P.text(el);
    check(`the address-book change of 24 Nov shows what its own message set — ${pairs.length} roles, each to the sender — and they are exactly the roles the state read saw move to that address (${moved.join(', ')})`, pairs.every((p) => p[1] === sa.signer) && pairs.map((p) => p[0]).sort().join() === moved.join() && new RegExp(`Changed the address book — set ${pairs.length} roles`).test(t) && pairs.every((p) => t.includes(p[0] + ' →')) && el.querySelectorAll(`.cw-sent .cw-addr[data-addr="${sa.signer}"]`).length === pairs.length && !/do not say which role changed/.test(t), t.slice(0, 500));
    P.S.f.q = ''; await P.click(P.d.querySelector('.cw-view[data-view="roles"]'));
    const marked = [...P.d.querySelectorAll('#cw-roles .cw-table tbody tr')].filter((tr) => /Set to this holder on 24 Nov 2026 — sent directly/.test(tr.cells[1].textContent)).map((tr) => tr.cells[0].querySelector('.mono').textContent).sort();
    { const setRows = [...P.d.querySelectorAll('#cw-roles .cw-table tbody tr')].filter((tr) => /Set to this holder/.test(tr.textContent));
      const fromRecord = (tr) => { const role = tr.cells[0].querySelector('.mono').textContent; const a = tr.querySelector('[data-jump]'); const rec = a && P.S.recs.find((r) => r.k === a.dataset.jump); const prs = rec && rec.sent && rec.sent.msg && rec.sent.msg.set_addresses ? rec.sent.msg.set_addresses.addresses : null; return !!prs && prs.some((x) => x[0] === role); };
      check(`…and in "Who holds the keys" each of those roles says which change set it to its holder — as does every other role the record shows being set (${setRows.length} in all), each linked to a change whose own message set that role`, marked.join() === moved.join() && setRows.length >= moved.length && setRows.every(fromRecord) && [...P.d.querySelectorAll('#cw-roles .cw-table [data-jump]')].some((a) => a.dataset.jump === sa.k), marked); }
    await P.click(P.d.querySelector('.cw-view[data-view="changes"]')); }
  const M2 = await page(); const { sent: _real, ...saBare } = sa; const base = { ...saBare, k: 'sent:0', detail: {}, schemaVersion: 2 }, other = rm.signer.slice(0, 6) + 'q'.repeat(38);
  const html1 = M2.w.__cw.sentHtml({ ...base, sent: { to: sa.contract, msg: { set_addresses: { addresses: [['ROLE_ONE', rm.signer], ['ROLE_TWO', sa.contract]] } } } });
  const html2 = M2.w.__cw.sentHtml({ ...base, sent: { to: rm.contract, msg: { update_config: { fee: '0.003', limits: { max: 5, list: [] }, owner: other, note: '<b onclick=1>x</b>' } }, funds: [{ denom: 'uluna', amount: '1000' }] } });
  const html3 = M2.w.__cw.sentHtml({ ...base, sent: { to: sa.contract, msg: { too_long: 9000 } } }), html4 = M2.w.__cw.sentHtml({ ...base, sent: { to: sa.contract } }), html5 = M2.w.__cw.sentHtml({ ...base });
  const d1 = new JSDOM(`<div>${html1}</div>`).window.document, d2 = new JSDOM(`<div>${html2}</div>`).window.document;
  check('a list of [role, address] pairs reads as "ROLE → holder", one line each, the holder named when it is a grouped contract', d1.querySelectorAll('li').length === 2 && /ROLE_ONE →/.test(d1.querySelectorAll('li')[0].textContent) && d1.querySelector(`.cw-addr[data-addr="${rm.signer}"]`) && d1.querySelectorAll('li')[1].textContent.includes(grouped.get(sa.contract).name) && /set_addresses/.test(d1.querySelector('.cw-sent').textContent));
  check('any other message reads as its own names and values (nested names joined, an empty list said, an address shortened), with funds, and says so when it was sent to another contract than the one that changed', /fee: 0\.003/.test(d2.body.textContent) && /limits · max: 5/.test(d2.body.textContent) && /limits · list: an empty list/.test(d2.body.textContent) && d2.querySelector(`.cw-addr[data-addr="${other}"]`) && /With funds: 1,000/.test(d2.body.textContent) && /The message was sent to/.test(d2.body.textContent) && d2.querySelectorAll('b[onclick]').length === 0 && d2.body.textContent.includes('<b onclick=1>x</b>'), d2.body.textContent.slice(0, 400));
  check('a message too long to store says its length; a record with no message JSON, or no message at all, shows nothing extra', /9,000 characters long and is not stored here/.test(html3) && html4 === '' && html5 === ''); }

console.log('— M needs a look —');
{ const A = await page(); A.S.now = Date.parse('2026-11-25T06:00:00Z'); A.w.__cw.renderAll(); await A.settle(6);
  const W = A.w.__cw, dao = lib.daos[0], daoCore = dao.core, pairs = sa.sent && sa.sent.msg ? sa.sent.msg.set_addresses.addresses : [];
  const F = (o = {}) => ({ how: 'all', kind: 'all', bucket: 'all', q: '', routine: false, all: false, att: 'all', ...o });
  const ban = A.$('cw-attn'), items = [...ban.querySelectorAll('.cw-attn-list li')];
  const nEarlier = A.S.recs.filter((r) => r.contract === rm.contract && r.kind === rm.kind && r._how !== 'routine' && !r.observed && r.timestamp < rm.timestamp).length;   // earlier changes of this kind to this contract, on the record as it stands
  const fromArchive = !!(A.S.idx && A.S.idx.archive && A.S.idx.archive.state && A.S.idx.archive.state.done);   // "before" is the block before the change once the archive read has the state; the last state read until then
  check(`the banner is loud for the two changes of 24 Nov (the ${nEarlier} earlier list changes counted from the record), each with its reasons in one line and a link to the change`, !!ban.querySelector('.cw-attn.look') && /2 changes in the last 30 days need a look/.test(A.text(ban)) && items.length === 2 && items.some((li) => li.dataset.jump === sa.k && new RegExp(`${pairs.length} roles moved from ${dao.short} to an account`).test(li.textContent)) && items.some((li) => li.dataset.jump === rm.k && new RegExp(`all ${nEarlier} earlier changes of this kind came by proposal`).test(li.textContent) && /did not pass \(A294\)/.test(li.textContent) && /still open \(A305\)/.test(li.textContent)), A.text(ban).slice(0, 600));
  const now = A.S.now, rec = changes.filter((r) => { const t = Date.parse(r.timestamp); return t >= now - 30 * 864e5 && t <= now; }), cnt = (h) => rec.filter((r) => howOf(r) === h).length;
  check('…and under them the plain count of the last 30 days, recounted from the files, and that the mark is not a verdict', A.text(ban).includes(`${rec.length} changes in the last 30 days: ${cnt('proposal')} through a passed proposal · ${cnt('direct')} sent directly · ${cnt('observed')} seen in a state read.`) && /The mark is not a verdict/.test(A.text(ban)) && !!A.d.getElementById('cw-look-means'), A.text(ban).slice(-300));
  A.S.f = F({ q: REMOVE_TX }); W.renderAll();
  const rowSa = A.d.querySelector(`.cw-row[data-k="${sa.k}"]`), rowRm = A.d.querySelector(`.cw-row[data-k="${rm.k}"]`), fSa = rowSa.querySelector('.cw-flag'), fRm = rowRm.querySelector('.cw-flag');
  check('the address-book change is marked and says why: the roles its own message set were held by the Stewardship DAO at the read before, and are now held by the account that sent it', rowSa.classList.contains('att-look') && !!rowSa.querySelector('.cw-look') && new RegExp(`${pairs.length} roles moved from ${dao.short} \\(a DAO: its members vote\\) to an account`).test(A.text(fSa)) && pairs.every((p) => fSa.textContent.includes(p[0])) && /took a passed vote before; now whoever holds that account’s key can use them alone/.test(fSa.textContent) && /It is the account that sent this change/.test(fSa.textContent) && (fromArchive ? /Who held them before: the block before this change/ : /Who held them before: the state read of 11 Aug 2026/).test(fSa.textContent), A.text(fSa).slice(0, 500));
  const tb = rowSa.querySelector('.cw-was-now'), trs = tb ? [...tb.querySelectorAll('tbody tr')] : [];
  check('…with a table of what was and what is: each role, held before by the DAO, held now by the sender — and where "before" comes from', trs.length === pairs.length && trs.every((tr) => tr.cells[1].querySelector(`.cw-addr[data-addr="${daoCore}"]`) && tr.cells[2].querySelector(`.cw-addr[data-addr="${sa.signer}"]`)) && (fromArchive ? /Before: the block before this change, read from an archive node/ : /Before: the state read of 11 Aug 2026, the last one before this change/).test(tb.querySelector('caption').textContent), trs.length);
  check('…and what that account has sent directly since: the reward-list change of the same transaction, linked', /Sent directly by that account since/.test(fSa.textContent) && !!fSa.querySelector(`[data-jump="${rm.k}"]`));
  check(`the reward-list change is marked for its route (${nEarlier} earlier, all by proposal) and for the votes: A294 did not pass, A305 is still open — each linked to DAO DAO`, rowRm.classList.contains('att-look') && /Not the route this took before/.test(fRm.textContent) && new RegExp(`${nEarlier} of them`).test(fRm.textContent) && /A vote on this did not pass/.test(fRm.textContent) && !!fRm.querySelector('a[href$="/proposals/A294"]') && /A vote on this is still open/.test(fRm.textContent) && !!fRm.querySelector('a[href$="/proposals/A305"]') && fRm.querySelectorAll('li').length === 3, A.text(fRm).slice(0, 600));
  A.S.f = F({ q: 'A117' }); W.renderAll(); const rowP = A.d.querySelector(`.cw-row[data-k="${a117.k}"]`);
  check('a change that came through a passed proposal is not marked', !!rowP && !rowP.classList.contains('att-look') && !rowP.querySelector('.cw-look') && !rowP.querySelector('.cw-flag'));
  A.S.f = F({ how: 'observed' }); W.renderAll(); const card = A.d.querySelector('#cw-list .cw-row[data-ks]');
  check('the state read that saw the same roles move is not marked a second time (a change on record explains them), and a difference in a stretch the record does not cover yet is not marked', !!card && !card.classList.contains('att-look') && !card.querySelector('.cw-flag') && A.S.recs.filter((r) => r.observed && r.action !== 'address_book').length > 0 && A.S.recs.filter((r) => r.observed && r.action !== 'address_book').every((r) => W.attention(r).level === 'plain'));
  const marked = A.S.recs.filter((r) => W.attention(r).level === 'look');
  check(`over the whole record (${marked.length} marked of ${changes.length}): a marked change is never a passed proposal and never the weekly routine, and each carries at least one reason with a sentence and a short form`, marked.length >= 2 && marked.every((r) => ['direct', 'authz', 'observed'].includes(r._how)) && marked.every((r) => W.reasons([r]).length > 0 && W.reasons([r]).every((w) => w.html && w.short)), marked.length);
  A.S.f = F(); W.renderAll(); await A.click(A.d.querySelector('#f-how [data-att]'));
  const rows = [...A.d.querySelectorAll('#cw-list .cw-row')];
  { // 1.4.2 — the box is the last 30 days; the older marked changes are said and linked; one list feeds the box, alerts.json and the home tab
    const now0 = A.S.now, from0 = now0 - 30 * 864e5; const data = W.alertsData();
    const marked0 = [...new Set(W.S.recs.filter((r) => W.attention(r).level === 'look').map((r) => r.observed && r.action === 'address_book' ? r.contract + '|' + r.timestamp : r.k))];
    const olderN = data.filter((x) => Date.parse(x.at) < from0).length, recentN = data.filter((x) => Date.parse(x.at) >= from0).length; const ol = ban.querySelector('[data-cw="older"]');
    check(`alertsData(): every marked change on record as plain data (${data.length}), newest first, each with a title, the contract's name, how it was sent and at least one reason — no markup`, data.length === marked0.length && data.length >= 2 && data.every((x, i) => x.k && x.at && x.title && x.on && x.how && x.why.length && !/[<>]/.test(JSON.stringify(x)) && (i === 0 || data[i - 1].height >= x.height)), data.slice(0, 2));
    check(`the loud box counts the last 30 days (${recentN}) and says how many older changes also need a look (${olderN}), with a link that opens them all`, items.length === recentN && (olderN ? !!ol && new RegExp('^' + olderN + ' older change').test(A.text(ol)) && !!ol.querySelector('a[data-att="only"]') : !ol), ol && A.text(ol));
  }
  check('"Needs a look" in the filters shows only the marked changes, and the same view opens from a link (#att=look)', A.S.f.att === 'look' && rows.length > 0 && rows.every((x) => x.classList.contains('att-look')) && new RegExp(`^${marked.length} change`).test(A.text(A.$('cw-count'))) && (await page('#att=look')).S.f.att === 'look', { rows: rows.length, count: A.text(A.$('cw-count')) });
  // a calm day: some changes in the 30 days before it, none of them marked
  const calmAt = [...new Set(changes.map((r) => Date.parse(r.timestamp) + 864e5))].sort((a, b) => b - a).find((t) => { const w = A.S.recs.filter((r) => r._how !== 'routine' && grouped.has(r.contract) && Date.parse(r.timestamp) >= t - 30 * 864e5 && Date.parse(r.timestamp) <= t); return w.length >= 2 && w.every((r) => W.attention(r).level === 'plain'); });
  if (calmAt) { A.S.now = calmAt; W.renderAll(); const t = A.text(A.$('cw-attn'));
    check(`a calm day (${new Date(calmAt).toISOString().slice(0, 10)}): "Nothing out of the ordinary in the last 30 days", the plain count, no list — and a link to the last change that did need a look, if there was one before`, !!A.$('cw-attn').querySelector('.cw-attn.calm') && /Nothing out of the ordinary in the last 30 days\./.test(t) && /\d+ changes? in the last 30 days: /.test(t) && !A.$('cw-attn').querySelector('.cw-attn-list') && (!marked.some((r) => Date.parse(r.timestamp) <= calmAt) || /The last change that needed a look: /.test(t)), t.slice(0, 300)); }
  else console.log('  (no 30-day stretch in this checkout has changes and none marked — the calm banner is checked on an empty stretch below)');
  { const t0 = Math.min(...A.S.recs.map((r) => Date.parse(r.timestamp)).filter(Boolean)); let emptyAt = null; for (let t = t0 + 45 * 864e5; t < Date.now() && emptyAt == null; t += 5 * 864e5) if (!A.S.recs.some((r) => r._how !== 'routine' && grouped.has(r.contract) && Date.parse(r.timestamp) >= t - 30 * 864e5 && Date.parse(r.timestamp) <= t)) emptyAt = t;
    A.S.now = emptyAt != null ? emptyAt : t0 - 5 * 864e5; W.renderAll(); }   // a day with no change to a watched contract in the 30 days before it — found in the record, or a day before the record begins
  check('a stretch with nothing on record says so, calmly', /Nothing out of the ordinary in the last 30 days\. No change to a watched contract is on record for the last 30 days\./.test(A.text(A.$('cw-attn'))), A.text(A.$('cw-attn')).slice(0, 200));
  // built cases: what the rules say about records this checkout does not hold
  const stranger = sa.signer.slice(0, 6) + 'z'.repeat(38), fs = idx.forward_since.day, obs = (o) => ({ schemaVersion: 1, txhash: null, height: 23999000, kind: 'role', contract: sa.contract, action: 'address_book', signer: null, msg_type: null, via: null, observed: 'state-read', _how: 'observed', ...o });
  const E = await page(); const EW = E.w.__cw;
  const o1 = obs({ k: 'state:g1', timestamp: '2026-12-10T05:00:00Z', detail: { role: 'TEST_ROLE', before: daoCore, after: stranger, seen_after: '2026-12-09T05:00:00Z', seen_by: '2026-12-10T05:00:00Z' } });
  const o2 = obs({ k: 'state:g2', timestamp: '2026-12-10T05:00:00Z', kind: 'upgrade', contract: rm.contract, action: 'code_id', detail: { before: '4038', after: '4999', seen_after: '2026-12-09T05:00:00Z', seen_by: '2026-12-10T05:00:00Z' } });
  const o3 = obs({ k: 'state:g3', timestamp: fs + 'T12:00:00Z', kind: 'upgrade', contract: rm.contract, action: 'code_id', detail: { before: '4990', after: '4991', seen_after: fs + 'T06:00:00Z', seen_by: fs + 'T12:00:00Z' } });   // a made-up difference in the six hours before the live stream's first full day: no real transaction falls in it, so only coverage decides
  E.S.recs.unshift(o1, o2, o3);
  const r1 = EW.reasons([o1]), r2 = EW.reasons([o2]);
  check('a state read that finds a role moved from a DAO to an account, with no change on record that set it: marked, and it says that no transaction on record shows who sent it', EW.attention(o1).level === 'look' && r1.length === 1 && /The role TEST_ROLE moved from/.test(r1[0].html) && /No transaction on record shows who sent this change/.test(r1[0].html) && /Who held it before: the state read of 9 Dec 2026/.test(r1[0].html), r1[0] && r1[0].html.replace(/<[^>]+>/g, '').slice(0, 300));
  check('a difference between two reads that are both after the live stream began, with no transaction for it: marked "no transaction on record explains this difference"; the same kind of difference across a stretch the record does not cover is not', EW.attention(o2).level === 'look' && r2[0].code === 'unexplained' && EW.attention(o3).level === 'plain' && EW.covered('2026-12-09T05:00:00Z', '2026-12-10T05:00:00Z') === true && EW.covered('2026-09-29T00:00:00Z', fs + 'T12:00:00Z') === false);
  E.S.idx.archive = { complete: true, to_time: fs + 'T13:00:00Z', searches: 900, searches_left: 0, state: { done: true }, verified: { code_history: '160 of 162', admin: '150 of 150', address_book_unbroken: true, earlier_records_not_found: 0 } }; o3._att = null;
  check('…and once the one-time archive read is complete past the later read, that stretch counts as covered', EW.covered('2026-09-29T00:00:00Z', fs + 'T12:00:00Z') === true && EW.attention(o3).level === 'look');
  EW.renderAll(); const cov = [...E.d.querySelectorAll('#cw-cover li')].map((li) => E.text(li));
  check('coverage after the archive read: one line for the whole history with the four checks against the chain; the "not on record" stretch and the stored-walk line are gone; the line under the tiles says "read in full"', cov.some((x) => /^The whole history, read once from an archive node/.test(x) && /every upgrade in the code history of 160 of 162 contracts is on record/.test(x) && /the admin of 150 of 150 contracts is what the record gives/.test(x) && /the address book’s changes join up with no gap/.test(x) && /every earlier record was shown again by the node/.test(x)) && !cov.some((x) => /not on record\./.test(x) || /taken from the walks already stored/.test(x)) && /read in full from the chain’s history/.test(E.text(E.$('cw-cover-line'))) && !/being read again now/.test(E.text(E.$('cw-cover-line'))), cov.map((x) => x.slice(0, 90)));
  E.S.idx.archive = { complete: false, searches: 900, searches_left: 400 }; EW.renderAll();
  check('coverage while the archive read is under way: how many searches are read, and the other lines stay', [...E.d.querySelectorAll('#cw-cover li')].some((li) => /being read once from an archive node — 500 of 900 searches read so far/.test(E.text(li))) && [...E.d.querySelectorAll('#cw-cover li')].some((li) => /not on record\./.test(E.text(li))));
  // the archive's own read of the block before a change, the contracts' answers about a role, a contract's settings before and after
  const G = await page(); const GW = G.w.__cw;
  G.S.hist.book = { changes: [{ height: sa.height, before: Object.fromEntries(pairs.map((p) => [p[0], daoCore])), after: Object.fromEntries(pairs.map((p) => [p[0], p[1]])) }] };
  G.S.guards = { guards: [{ contract: rm.contract, action: 'asset/remove_assets', guard: { kind: 'role', role: pairs[0][0], text: 'x' } }, { contract: sa.contract, action: 'asset/remove_assets', guard: { kind: 'role', role: pairs[0][0], text: 'x' } }, { contract: rm.contract, action: 'gauge/odd_call', guard: { kind: 'role', role: pairs[1][0], text: 'x' } }] };
  G.S.hist.config = { changes: [{ records: [rm.k], contract: rm.contract, height: rm.height, paths_changed: 2, diff: [{ path: 'fee', before: '0.01', after: '0.02' }, { path: 'owner', before: daoCore, after: null }] }] };
  for (const r of G.S.recs) r._att = null; G.S.f = F({ q: REMOVE_TX }); GW.renderAll();
  const gSa = G.d.querySelector(`.cw-row[data-k="${sa.k}"]`), gRm = G.d.querySelector(`.cw-row[data-k="${rm.k}"]`);
  check('with the archive\'s read of the block before the change, "before" is that block — said in the reason and over the table', /Who held them before: the block before this change, read from an archive node/.test(gSa.querySelector('.cw-flag').textContent) && /Before: the block before this change, read from an archive node/.test(gSa.querySelector('.cw-was-now caption').textContent));
  check('with the contracts\' own answers on record, the reason says what each role is required for, in plain words where the page knows the call and by its own name where it does not', new RegExp(`${pairs[0][0]} — to remove assets from a reward list \\(2 contracts\\)`).test(G.text(gSa.querySelector('.cw-flag'))) && new RegExp(`${pairs[1][0]} — to send odd_call \\(1 contract\\)`).test(G.text(gSa.querySelector('.cw-flag'))) && /each refused that message from an address without the role/.test(gSa.querySelector('.cw-flag').textContent), G.text(gSa.querySelector('.cw-flag')).slice(-320));
  check('a change whose contract\'s settings the archive read before and after shows the paths that differ, both values, an address as an address', /The contract’s settings, before and after/.test(gRm.textContent) && /fee: 0\.01 → 0\.02/.test(G.text(gRm)) && !!gRm.querySelector(`.cw-sent .cw-addr[data-addr="${daoCore}"]`) && /owner: .* → not set/.test(G.text(gRm)));
  const voter = Object.values(pdCap.proposals).flatMap((p) => p.voters || []).map((v) => v.address).find((a) => a && a !== sa.signer), names = [...new Set(Object.values(pdCap.proposals).flatMap((p) => (p.voters || []).map((v) => v.name)).filter((n) => n && !/^unknown/i.test(n)))];
  const L = await page('#address=' + voter); await L.settle(10); const lt = L.text(L.$('cw-lookup')), nV = Object.values(pdCap.proposals).filter((p) => (p.voters || []).some((v) => v.address === voter)).length;
  check(`looking up an address that votes in the Stewardship: "Votes in ${dao.short} — voted on ${nV} proposals", its weight on the last one — and no name from the vote records anywhere on the page`, new RegExp(`Votes in${dao.short} — voted on ${nV.toLocaleString('en-US')} proposals?, last on A\\d+ with \\d+ of \\d+ voting power`).test(lt) && names.every((n) => !L.d.body.textContent.includes(n)), { lt: lt.slice(0, 400), names: names.length });
  const cs = st.contracts, nAdm = Object.values(cs).filter((c) => c.admin === rm.signer).length; A.S.now = Date.parse('2026-11-25T06:00:00Z'); A.S.f = F({ q: REMOVE_TX }); W.renderAll();
  check(`beside an address that the chain names as admin of watched contracts, the page says so ("admin of ${nAdm}")`, nAdm > 0 ? new RegExp(`admin of ${nAdm}`).test(A.d.querySelector(`.cw-row[data-k="${rm.k}"]`).textContent) : true, nAdm);
  check('no script error in any of it', A.w.__errors.length === 0 && E.w.__errors.length === 0 && G.w.__errors.length === 0 && L.w.__errors.length === 0, [A.w.__errors, E.w.__errors, G.w.__errors, L.w.__errors]); }

console.log('— N what a role is for, in the contracts\' own words —');
{ const gfile = cwFile('contract-watch/guards.json');
  if (!gfile) console.log('  (this checkout has no contract-watch/guards.json — the page is checked on built answers in section M)');
  else { const gd = J(gfile), G = await page(); await G.settle(8); const W = G.w.__cw, pairs = sa.sent.msg.set_addresses.addresses.map((p) => p[0]);
    const byRole = {}; for (const g of gd.guards) if (g.guard.kind === 'role' && String((st.contracts[g.contract] || {}).code_id || g.code_id) === String(g.code_id)) (byRole[g.guard.role] ||= []).push(g);
    const known = pairs.filter((r) => byRole[r]), n = (role, seg) => new Set(byRole[role].filter((g) => g.action.split('/').pop() === seg).map((g) => g.contract)).size;
    check(`the page reads the contracts' answers (${gd.guards.length} kinds of change; roles named: ${Object.keys(byRole).join(', ')})`, G.S.guards && G.S.guards.guards.length === gd.guards.length && requested.some((u) => u.endsWith('contract-watch/guards.json')) && known.length >= 1, Object.keys(byRole));
    G.S.f = { how: 'all', kind: 'all', bucket: 'all', q: REMOVE_TX, routine: false, all: false, att: 'all' }; W.renderAll();
    const rowSa = G.d.querySelector(`.cw-row[data-k="${sa.k}"]`), rowRm = G.d.querySelector(`.cw-row[data-k="${rm.k}"]`), fl = G.text(rowSa.querySelector('.cw-flag'));
    check('the marked address-book change says what the contracts require each moved role for — the count of contracts is the file\'s own — and names the moved roles it has no answer for', /What the contracts themselves require these roles for/.test(fl) && known.every((role) => fl.includes(`${role} — to `)) && (!byRole.ASSET_WHITELIST_CONTROLLER || fl.includes(`remove assets from a reward list (${n('ASSET_WHITELIST_CONTROLLER', 'remove_assets')} contracts)`)) && (!byRole.DELEGATION_CONTROLLER || fl.includes(`move the Alliance’s stake between validators (${n('DELEGATION_CONTROLLER', 'alliance_redelegate')} contracts)`)) && (pairs.length === known.length || new RegExp(`Not read yet for ${pairs.filter((r) => !byRole[r]).join(' · ')}`).test(fl)), fl.slice(-600));
    const grm = gd.guards.find((g) => g.contract === rm.contract && g.action === 'remove_assets');
    check('the reward-list change says which role its contract requires of a sender, and that the sender was given that role one message earlier in the same transaction (linked)', !!grm && grm.guard.kind === 'role' && new RegExp(`This contract accepts this call only from the holder of ${grm.guard.role}\\. The sender was given that role in the same transaction, one message earlier\\.`).test(G.text(rowRm)) && !!rowRm.querySelector(`[data-jump="${sa.k}"]`) && /Its own answer to a test message, 25 Nov 2026/.test(G.text(rowRm)), G.text(rowRm).slice(300, 800));
    G.S.f.q = 'A117'; W.renderAll();
    const gsa = gd.guards.find((g) => g.contract === sa.contract && g.action === 'set_addresses');
    if (gsa && /owner/i.test(gsa.guard.text)) check('the address-book change says what its contract answered: it accepts that call only from its owner', /This contract accepts this call only from its owner\./.test(G.text(rowSa)), G.text(rowSa).slice(-700, -300));
    if (byRole.BRIBE_WHITELIST_CONTROLLER && byRole.VE_GUARDIAN) check('the same call reads by its contract: the bribe manager\'s list is "the tokens allowed as vote incentives", the lock\'s blacklist is named as such', /BRIBE_WHITELIST_CONTROLLER — to (add|remove) tokens (to|from) the list allowed as vote incentives \(1 contract\)/.test(fl) && /VE_GUARDIAN — to change the blacklist of the lock that gives voting power \(1 contract\)/.test(fl) && !/Not read yet for/.test(fl), fl.slice(-500));
    check('a passed proposal\'s row stays as it was: no line about who may send it', !/accepts this call only from/.test(G.d.querySelector(`.cw-row[data-k="${a117.k}"]`).textContent));
    await G.click(G.d.querySelector('.cw-view[data-view="roles"]')); const rt = G.text(G.$('cw-roles'));
    check('"Who holds the keys": each role the contracts named says what it is required for; the holder\'s card says what it can do with its roles; and how that was read', known.every((role) => { const tr = [...G.d.querySelectorAll('#cw-roles .cw-table tbody tr')].find((x) => x.cells[0].textContent.startsWith(role)); return tr && /Required to /.test(tr.cells[0].textContent); }) && /With these roles it can: /.test(rt) && /each was sent a message of that kind from an address without any role — in simulation, nothing signed/.test(rt), rt.slice(0, 400));
    G.S.st.contracts[rm.contract].code_id = '1'; for (const r of G.S.recs) r._att = null; G.S.f = { how: 'all', kind: 'all', bucket: 'all', q: REMOVE_TX, routine: false, all: false, att: 'all' }; await G.click(G.d.querySelector('.cw-view[data-view="changes"]')); W.renderAll();
    check('an answer counts only for the code the contract ran when it was asked: after an upgrade the line is gone until the contract is asked again', !/accepts this call only from/.test(G.d.querySelector(`.cw-row[data-k="${rm.k}"]`).textContent) && W.guardOf(rm) === null);
    const afile = cwFile('contract-watch/accounts.json');
    if (afile) { const ac = J(afile).accounts, k = ac[sa.signer], K = await page('#address=' + sa.signer); await K.settle(10); const KW = K.w.__cw;
      K.S.now = Date.parse('2026-11-25T06:00:00Z'); KW.renderAll();
      check(`the account the four roles moved to: the chain's account record shows ${k && k.keys} key(s) — the page says "an account with one key" in the banner and in the reason, and "Signs with one key" in the look-up, with the day it was read`, !!k && k.keys === 1 && /roles moved from PD Stewardship to an account with one key/.test(K.text(K.$('cw-attn'))) && /Signs with\s*one key — the chain’s own account record, read 25 Nov 2026/.test(K.text(K.$('cw-lookup'))) && /to an account with one key \(/.test(K.text(K.d.querySelector(`#cw-lookup .cw-row[data-k="${sa.k}"] .cw-flag`) || K.d.body)), K.text(K.$('cw-attn')).slice(0, 300));
      await K.click(K.d.querySelector('.cw-view[data-view="roles"]')); const up = [...K.d.querySelectorAll('#cw-roles .cw-table')].pop();
      check('"Who can upgrade the Alliance\'s contracts": beside an admin that is an account, how it signs', [...up.querySelectorAll('tbody tr')].some((tr) => /an account with one key/.test(tr.cells[0].textContent)) && Object.keys(ac).every((a) => /^terra1[0-9a-z]{38}$/.test(a)) && !/"key"\s*:/.test(JSON.stringify(J(afile))), K.text(up).slice(0, 300));
      check('no script error (accounts)', K.w.__errors.length === 0, K.w.__errors); }
    check('no script error', G.w.__errors.length === 0, G.w.__errors); } }

console.log(`\n=== PAGE GATE (contract-watch): ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
