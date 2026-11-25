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
    w.SiteHeader = { mount(o) { w.__mount = o; }, subnav(items, o) { w.__subnav = { items, o }; } }; w.SiteFooter = { mount(o) { w.__footer = o; } };
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
  const sn = P.w.__subnav; check('the TLA Stats tab bar: seven tabs, Contract Watch lit, the others link to their pages', sn && sn.items.length === 7 && sn.items.filter((t) => t.active).map((t) => t.label).join() === 'Contract Watch' && sn.items.find((t) => t.id === 'portfolio').href === 'member-portfolio.html' && sn.items.find((t) => t.id === 'grades').href === 'tla-stats.html#grades' && sn.o.attach === '#cw-top-tile' && P.w.__mount.page === 'contract-watch', sn && sn.items.map((t) => t.label));
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
  { const items = [...row.querySelectorAll('.cw-items li')].map((li) => P.text(li)), cat = J(path.join(CORE, 'token-catalog/snapshots/current.json')), ids = String(rm.detail.assets).split(',');
    const lpIds = ids.filter((a) => (cat.pools || []).some((p) => p.gauge_pool_id === a) && !(cat.tokens || []).some((t) => t.denom === a.replace(/^(cw20|native):/, '')));
    check(`…the assets are named from the token catalog, never guessed: a token it knows by its own symbol reads as that token (ampCAPA, not an LP), the ${lpIds.length} LP tokens as their pair and DEX, each with its id beside it`, items.length === ids.length && items.some((x) => /^ampCAPA /.test(x)) && !items.some((x) => /CAPA–ampCAPA/.test(x)) && items.filter((x) => /^[\w.]+–[\w.]+ LP · /.test(x)).length === lpIds.length && items.every((x) => /…/.test(x)), items); }
  check('…a link to the transaction on the explorer, and a link that points at this change', /chainsco\.pe\/terra2\/tx\/C8365D87/.test(row.querySelector('.cw-acts a').href) && row.querySelector('[data-copy]').dataset.copy.endsWith('#k=' + encodeURIComponent(rm.k)));
  const srow = hit.find((r) => /address book/.test(r.textContent));
  check('the address-book change in the same transaction says what the events cannot: which role changed is not in them', srow && /Changed the address book/.test(srow.textContent) && /do not say which role changed/.test(srow.textContent) && !srow.querySelector('.cw-flag'), srow && P.text(srow).slice(0, 200));
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
  await P.click(P.$('cw-wide')); await P.settle(30); const seen = J(path.join(CORE, 'docs/deep-history/contracts-seen.json')).contracts, wa = Object.keys(seen).filter((c) => seen[c].admin === a).length, wc = Object.keys(seen).filter((c) => seen[c].creator === a).length;
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
  check('coverage: the stored history with its span, the stretch that is NOT on record, each catch-up job with its progress, the live stream with its last run, the state read, and what no walk sees', lis.some((x) => x.startsWith(`${dayOf(J(cwFile('contract-watch/backfill-report.json')).first.day)} → ${dayOf(idx.history.walks_end)} — taken from the walks already stored`)) && lis.some((x) => x.startsWith(dayOf(idx.history.walks_end) + ' → ') && /not on record\./.test(x)) && lis.filter((x) => /read again/.test(x)).length === rw.jobs.length && lis.some((x) => /25 Nov 2026 → now — live/.test(x) && /Last run: 25 Nov 2026, 05:17 UTC, read to block 23,906,296/.test(x)) && lis.some((x) => /^State read/.test(x)) && lis.some((x) => /^Not seen by a walk/.test(x)), lis.map((x) => x.slice(0, 70)));
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

console.log(`\n=== PAGE GATE (contract-watch): ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
