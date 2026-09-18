#!/usr/bin/env node
// gate-index-alert-center.mjs — index 4.24 + lib/alert-center.js 1.0.0 on real fixtures (jsdom). SPEC-alert-center gates 1, 2, 4, 5.
//  G1 the grid renders three tiles; Pulse card hidden; no launch popup opened
//  G2 NFTs aDAO counters = the counts the rules derive from the SAME Live Activity rows (relation, not literal)
//  G3 Ecosystem: Assets/Projects counters = active registry entries; Assets row names the lp-grades pools that carry the alert
//  G4 selected-address red: only rows touching that wallet's tokens are marked mine; the tile goes red
//  G5 closing the panel sets the marker; a re-render with the marker gives 0 counters (green) when nothing is newer
//  G6 pure lib: a window with no events → every tile green; gap counters render 0 with the "not captured yet" note
// Usage: TLA_CORE_DIR=<tla-core (with docs/curated/alerts.json)> NFTC_DIR=<nft-collections> CRONS_DIR=<platform-crons> node gate-index-alert-center.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const CORE = process.env.TLA_CORE_DIR, NFTC = process.env.NFTC_DIR, CRONS = process.env.CRONS_DIR; if (!CORE || !NFTC || !CRONS) { console.error('TLA_CORE_DIR, NFTC_DIR, CRONS_DIR required'); process.exit(1); }
const require = createRequire(import.meta.url);
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
// stage lp-grades with alerts via the live cron functions (main's product predates 2.1.0 until the next run)
const { stampAssetAlerts } = require(path.join(CRONS, 'token-catalog/token-catalog.js')); const { applyAlerts } = require(path.join(CRONS, 'lp-grades/lp-grades.js'));
const reg = JSON.parse(fs.readFileSync(path.join(CORE, 'docs/curated/alerts.json')));
const cat = JSON.parse(fs.readFileSync(path.join(CORE, 'token-catalog/snapshots/current.json'))); stampAssetAlerts(cat.tokens, reg);
const grades = JSON.parse(fs.readFileSync(path.join(CORE, 'lp-grades/snapshots/current.json'))); applyAlerts(grades.pools, cat, reg);
const GRADES_TXT = JSON.stringify(grades);
// --- page ---
const html = fs.readFileSync('index.html', 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
const libSrc = fs.readFileSync('lib/alert-center.js', 'utf8'); const denomsSrc = fs.readFileSync('lib/denoms.js', 'utf8');
let modalOpened = false; const J = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
const stubFetch = (u) => { const full = String(u), url = full.split('?')[0]; let f = null;
  if (url === CORE_U + 'lp-grades/snapshots/current.json') return J(JSON.parse(GRADES_TXT));
  if (url === CORE_U + 'member-data/tla-alerts/current.json') { const f = '/home/claude/build/p3core/member-data-tla-alerts/current.json'; if (fs.existsSync(f)) return J(JSON.parse(fs.readFileSync(f, 'utf8'))); }   // the product the folded duty writes (built by the calibration replay)
  if (url === NFTC_U + 'adao/transfers/2026/09.json' && fs.existsSync('/home/claude/build/pkg6/nft-collections/adao/transfers/2026/09.json')) { const t = fs.readFileSync('/home/claude/build/pkg6/nft-collections/adao/transfers/2026/09.json', 'utf8'); return J(JSON.parse(t)); }   // the delivered data file (phantom rows labeled superseded)
  { const m = /dao-originations\/main\/([a-z-]+)\/governance\/proposals\.json$/.exec(url); if (m) { const f = '/home/claude/build/corpus/' + m[1] + '.json'; if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return J(JSON.parse(t)); } } }
  if (full.startsWith('https://bbl-proxy.defipatriot.workers.dev/?url=')) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length));
  if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/index.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  w.fetch = stubFetch; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} };
  w.SiteHeader = { mount() {}, init() {}, subnav() { return { querySelectorAll: () => [] }; } }; w.PropAudit = {}; w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), CRONS: [] }; w.tokenPrices = { LUNA: 0.0449, bLUNA: 0.0785 };
  w.eval(denomsSrc); w.eval(libSrc); w.Denoms.load(stubFetch);   // the page's include calls Denoms.load() before any feed builds
} });
const w = dom.window;
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 15000));
const d = w.document;
const gm = d.getElementById('gov-modal'); modalOpened = gm && gm.style.display === 'flex';
const tiles = [...d.querySelectorAll('#alert-center .ac-tile')];
console.log('=== index 4.34 alert center (lib 1.8.0 · oracle USD) ===');
ok('G1 the grid renders Ecosystem · Props · NFTs aDAO (TLA tile off by default since 1.8.0)', tiles.map(t => t.dataset.tile).join(',') === 'ecosystem,props,nfts-adao', tiles.map(t => t.dataset.tile));
ok('G1 the Pulse card is hidden by stylesheet rule and the launch proposal popup did not open', /#pulse-card \{ display: none !important; \}/.test(html) && !modalOpened);
const R = w.__alertCenter; ok('G1 build result exposed (window.__alertCenter) with meta.rules = the lib RULES', R && R.meta && R.meta.rules === w.AlertCenter.RULES);
// G2 — relation to the same rows
const items = (w.__activityItems || []).filter(x => x.col === 'adao' && x.ts >= R.meta.cut);
const nft = R.tiles.find(t => t.key === 'nfts-adao'); const cnt = (k) => nft.counters.find(c => c.key === k).n;
const expStake = items.filter(x => ['staked', 'unstaked', 'break', 'claimed'].includes(x.kind)).length + (items.filter(x => x.kind === 'unstaked' && x.ts >= R.meta.now - 864e5).length >= w.AlertCenter.RULES.MASS_UNSTAKE_N ? 1 : 0);
const expP2P = items.filter(x => x.kind === 'transferred').length;
const expSales = items.filter(x => x.kind === 'sale').length;
console.log(`  (window ${new Date(R.meta.cut).toISOString().slice(0, 16)} → now · adao rows in window ${items.length}: sales ${expSales}, staking ${expStake}, p2p ${expP2P})`);
ok('G2 Staking counter = staked+unstaked+break+claimed rows in window (+ one mass row when ≥ threshold)', cnt('staking') === expStake, [cnt('staking'), expStake]);
ok('G2 P2P counter = transferred rows in window (+ mass rows)', cnt('p2p') >= expP2P && cnt('p2p') <= expP2P + 3, [cnt('p2p'), expP2P]);
ok('G2 Marketplace counter ≥ sales in window and every marketplace row carries rule · source · raw', cnt('market') >= expSales && nft.counters.find(c => c.key === 'market').rows.every(r => r.rule && r.source && 'raw' in r), cnt('market'));
const tileTxt = (k) => tiles.find(t => t.dataset.tile === k).textContent.replace(/\s+/g, ' ');
ok('G2 the tile shows the same numbers the build produced', /Marketplace = \d+/.test(tileTxt('nfts-adao')) && tileTxt('nfts-adao').includes(`Marketplace = ${cnt('market')}`) && tileTxt('nfts-adao').includes(`Staking / Breaks = ${cnt('staking')}`));
ok('G2 (1.7.0) tile colour follows ALERTS only: amber iff a row needs a look, green with grey activity otherwise (no address → never red)', tiles.every(t => { const T = R.tiles.find(x => x.key === t.dataset.tile); return t.dataset.state === (T.alerts > 0 ? 'amber' : 'green'); }), tiles.map(t => [t.dataset.tile, t.dataset.state, R.tiles.find(x => x.key === t.dataset.tile).alerts, R.tiles.find(x => x.key === t.dataset.tile).total]));
const Ra = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [{ col: 'adao', kind: 'sale', token: 1, ts: Date.now() - 3600e3, label: 'Sold', sub: 'BBL' }, { col: 'adao', kind: 'listing', token: 2, ts: Date.now() - 3600e3, label: 'Listed', sub: 'Boost', amt: 5000, sym: 'LUNA' }], chainOnlyListings: [], tlaAlerts: { rows: [{ ts: new Date().toISOString(), rule: 'epoch_flip', label: 'Epoch started', value: '', raw: {} }] } }, { windowMs: 7 * 864e5 });
ok('S1 a sale + a listing = activity only → NFTs tile GREEN with grey counts (nothing needs a look)', Ra.tiles.find(t => t.key === 'nfts-adao').state === 'green' && Ra.tiles.find(t => t.key === 'nfts-adao').total === 2 && Ra.tiles.find(t => t.key === 'nfts-adao').alerts === 0);
const Rb = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [{ col: 'adao', kind: 'sale', token: 1, ts: Date.now() - 3600e3, label: 'Sold', sub: 'BBL' }], chainOnlyListings: [{ tokenId: 745, price: 200, priceToken: 'bLUNA', priceUsd: 16 }], tlaAlerts: { rows: [{ ts: new Date().toISOString(), rule: 'gauge_set_change', label: 'X dropped below the vote threshold', value: '', raw: {} }] } }, { windowMs: 7 * 864e5 });
ok('S2 a chain-only listing IS an alert → NFTs tile amber; the alert row sorts before the activity row', Rb.tiles.find(t => t.key === 'nfts-adao').state === 'amber' && Rb.tiles.find(t => t.key === 'nfts-adao').alerts === 1 && Rb.tiles.find(t => t.key === 'nfts-adao').counters.find(c => c.key === 'market').rows[0].severity === 'alert');
const Rc = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [{ dao: 'X', id: 1, title: 'live', live: true, pending: false, link: '#' }, { dao: 'X', id: 2, title: 'done', live: false, pending: false, status: 'executed', endIso: new Date().toISOString(), link: '#' }], isOpen: (c) => c.live || c.pending }, items: [], chainOnlyListings: [] }, { windowMs: 7 * 864e5 });
ok('S3 a live vote is an alert, an executed prop is activity (Props amber for the vote alone)', Rc.tiles.find(t => t.key === 'props').alerts === 1 && Rc.tiles.find(t => t.key === 'props').total === 2 && Rc.tiles.find(t => t.key === 'props').counters.find(c => c.key === 'exec').rows[0].severity === 'info');
ok('S4 the grid head counts things that need a look separately from activity', /need(s)? a look/.test(d.querySelector('#alert-center .ac-head').textContent) && /activity item/.test(d.querySelector('#alert-center .ac-head').textContent));
// G3 — Ecosystem
const eco = R.tiles.find(t => t.key === 'ecosystem');
const activeAssets = reg.alerts.filter(a => a.kind === 'asset' && w.AlertCenter.RULES.ASSET_ACTIVE.includes(a.status)).length, activeForum = reg.alerts.filter(a => a.kind === 'forum' && w.AlertCenter.RULES.FORUM_ACTIVE.includes(a.status)).length;
ok(`G3 Ecosystem Assets = ${activeAssets} active asset entries · Projects = ${activeForum} active forum entries`, eco.counters.find(c => c.key === 'assets').n === activeAssets && eco.counters.find(c => c.key === 'projects').n === activeForum, eco.counters.map(c => [c.key, c.n]));
const assetRow = eco.counters.find(c => c.key === 'assets').rows[0]; const flagged = grades.pools.filter(p => (p.alerts || []).some(a => a.kind === 'asset'));
ok(`G3 the USDC.n row names the ${flagged.length} lp-grades gauges that carry the alert, their VP share and staked USD, and links the migration guide`, assetRow && assetRow.raw.pools.length === flagged.length && /gauges? · [\d.]+% of VP · \$[\d,]+ staked/.test(assetRow.value) && /skip\.build/.test(assetRow.link), assetRow && assetRow.value);
ok('G3 Ecosystem = Projects · PD · Assets; PD is 0 with a "not captured yet" note', eco.counters.map(c => c.key).join(',') === 'projects,pd,assets' && (() => { const pd = eco.counters.find(x => x.key === 'pd'); return pd.n === 0 && /not captured yet/.test(pd.gap); })());
// TLA tile + thresholds tab (4.30 / lib 1.6.0)
const TAdoc = JSON.parse(fs.readFileSync('/home/claude/build/p3core/member-data-tla-alerts/current.json', 'utf8'));
const Rtla = w.AlertCenter.build({ now: R.meta.now, alertsDoc: reg, lpPools: grades.pools, props: { cards: [] }, items: w.__activityItems || [], chainOnlyListings: [], tlaAlerts: TAdoc }, { windowMs: R.meta.windowMs, tla: true });
const tlaT = Rtla.tiles.find(t => t.key === 'tla'); const inWinRows = TAdoc.rows.filter(r => Date.parse(r.ts) >= R.meta.cut);
const cnt2 = (k) => tlaT.counters.find(c => c.key === k).n;
ok(`T1 TLA tile counters = the product's rows in the window by rule family (VP ${cnt2('vp')} · Liq/Vol ${cnt2('liq')} · APR ${cnt2('apr')})`, cnt2('vp') === inWinRows.filter(r => /vp_move/.test(r.rule)).length && cnt2('liq') === inWinRows.filter(r => /liquidity_move|volume_spike/.test(r.rule)).length && cnt2('apr') === inWinRows.filter(r => r.rule === 'pool_apr_move').length);
ok('T2 TLA · Gauges · Epochs = gauge set changes + epoch flips in the window, in plain words (threshold / emissions / joined) with the VP that moved', cnt2('gauges') === inWinRows.filter(r => /gauge_set_change|epoch_flip/.test(r.rule)).length && tlaT.counters.find(c => c.key === 'gauges').rows.filter(r => /gauge_set_change/.test(r.rule)).every(r => /(vote threshold|emissions|joined|left)/.test(r.label)));
ok('T3 every TLA row names its rule, its source (the config path) and the raw values', tlaT.counters.flatMap(c => c.rows).every(r => /^tla:/.test(r.rule) && /alert-thresholds\.json/.test(r.source) && r.raw));
ok('T4 NFT thresholds come from the config (floor_drop_pct etc.) — meta.rules unchanged, but build used config values', TAdoc.config.nft.floor_drop_pct === 10 && R.meta.rules === w.AlertCenter.RULES);
ok('T0 (1.8.0) without opts.tla the build has no TLA tile and the window has no ⚙ Thresholds entry; with it, both appear', !R.tiles.some(t => t.key === 'tla') && Rtla.tiles.some(t => t.key === 'tla'));
w.AlertCenter.openFull(Rtla, { document: d, openTile: 'tla', tla: true, tlaAlerts: TAdoc }); await new Promise(r => setTimeout(r, 100));
const fullT = d.getElementById('ac-full'); const cfgBtn = fullT.querySelector('[data-tile="__config"]');
ok('T5 the window has a ⚙ Thresholds entry in the rail', !!cfgBtn && /✓/.test(cfgBtn.textContent));
cfgBtn.click(); await new Promise(r => setTimeout(r, 60)); const mT = fullT.querySelector('#ac-main');
const ruleCards = [...mT.querySelectorAll('.ac-rule')];
ok(`T6 the Thresholds tab lists every rule (${ruleCards.length}) with enabled toggle, its numbers as inputs, and fire rates at 0.5×/1×/2×`, ruleCards.length === Object.keys(TAdoc.config.tla).length && ruleCards.every(c => c.querySelector('input[data-en]') && c.querySelector('.ac-rates') && /at 0\.5×/.test(c.textContent) && /at 1×/.test(c.textContent) && /at 2×/.test(c.textContent)));
ok('T7 pool_vp_move shows unchecked (off by calibration) and its description says why', (() => { const c = ruleCards.find(x => x.dataset.rule === 'pool_vp_move'); return c && !c.querySelector('input[data-en]').checked && /routine/.test(c.textContent); })());
ok('T8 the upload directions link to the exact GitHub edit URL of the config and name the cron + the TLA_ALERTS=1 knob', /github\.com\/thealliancedao\/tla-core\/edit\/main\/docs\/curated\/alert-thresholds\.json/.test(mT.innerHTML) && /TLA_ALERTS=1/.test(mT.textContent) && /23:00 UTC/.test(mT.textContent));
// edit a number, download → the produced JSON carries the edit, the previous sha, and the same shape
const inp = mT.querySelector('input[data-rule="bucket_vp_move"][data-param="min_pct"]'); inp.value = '4'; let produced = null;
const origCreate = d.createElement.bind(d); d.createElement = (tag) => { const el = origCreate(tag); if (tag === 'a') { el.click = () => { produced = decodeURIComponent(el.href.split(',')[1] || ''); }; } return el; };
mT.querySelector('#ac-cfg-download').click(); await new Promise(r => setTimeout(r, 30)); d.createElement = origCreate;
const pj = produced ? JSON.parse(produced) : null;
ok('T9 Download produces alert-thresholds.json with the edited number (bucket_vp_move.min_pct 3 → 4), today\'s updatedAt, the previous config sha, every other rule intact', pj && pj.tla.bucket_vp_move.params.min_pct === 4 && pj.edited_on_site.previous_sha === TAdoc.config.sha && pj.updatedAt === new Date().toISOString().slice(0, 10) && Object.keys(pj.tla).length === Object.keys(TAdoc.config.tla).length && pj.nft.floor_drop_pct === 10 && pj.sensitivity, pj && [pj.tla.bucket_vp_move.params, pj.edited_on_site]);
fullT.querySelector('#ac-full-close').click(); await new Promise(r => setTimeout(r, 100));
ok('G3 Ecosystem tile is amber (registry entries are active)', tiles.find(t => t.dataset.tile === 'ecosystem').dataset.state === 'amber');
// full-page window (1.1.0): a tile opens it; rail = every tile + counter; main = rich cards
tiles.find(t => t.dataset.tile === 'ecosystem').click(); await new Promise(r => setTimeout(r, 100));
const full = d.getElementById('ac-full');
ok('full window opens on tile click, covers the viewport (fixed inset 0), body scroll locked', full && full.getAttribute('role') === 'dialog' && d.body.style.overflow === 'hidden');
const rail = [...full.querySelectorAll('.ac-rc')];
ok('rail lists every counter of every tile with its count (no ⚙ Thresholds entry without the TLA tile)', rail.length === R.tiles.reduce((s2, t) => s2 + t.counters.length, 0) && rail.every(b => /\d+$/.test(b.textContent)), rail.length);
const main = full.querySelector('#ac-main');
rail.find(b => b.dataset.counter === 'projects').click(); await new Promise(r => setTimeout(r, 50));
ok('Projects counter opens a rich forum card: headline, summary, pools, forum link', /Projects · 1 needs a look/.test(main.textContent) && main.querySelector('.ac-card') && /read \/ reply on the forum/.test(main.textContent) && [...main.querySelectorAll('.ac-chips span')].length >= 3 && /USDC\.n pool/.test(main.textContent));
rail.find(b => b.dataset.counter === 'assets').click(); await new Promise(r => setTimeout(r, 50));
const tbl = main.querySelector('table.ac-t');
ok('Assets: the USDC.n card shows the timeline (mint stop · step-down · snapshot …), what to do, and a gauge table with VP share + staked and a total row', /What to do/.test(main.textContent) && main.querySelectorAll('.ac-tl li').length >= 5 && tbl && tbl.querySelectorAll('tbody tr').length === flagged.length + 1 && /gauges/.test(tbl.textContent), tbl && tbl.querySelectorAll('tbody tr').length);
ok('the next upcoming date is highlighted and past dates dimmed', main.querySelector('.ac-tl li.next') && main.querySelector('.ac-tl li.past'));
rail.find(b => b.dataset.counter === 'pd').click(); await new Promise(r => setTimeout(r, 50));
ok('a gap counter (PD) renders "0 — not measured, not assumed" with its note, never an empty list', /not measured, not assumed/.test(main.textContent) && /not captured yet/.test(main.textContent));
ok('every card carries the why line (rule · source · raw)', [...main.querySelectorAll('.ac-card')].every(c => c.querySelector('.why')) || main.querySelectorAll('.ac-card').length === 0);
const R6b = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [{ dao: 'Alliance DAO', id: 42, title: 'Test prop', desc: 'x', live: true, pending: false, yesPct: 61.5, noPct: 10, turnoutPct: 40, daysLeft: 2, link: 'https://daodao.zone/x' }], isOpen: (c) => c.live || c.pending }, items: [{ col: 'adao', kind: 'sale', token: 745, ts: Date.now() - 3600e3, tx: 'C50E', label: 'Sold for 200 bLUNA', sub: 'BBL' }], chainOnlyListings: [] }, { windowMs: 864e5 });
const fw = w.AlertCenter.openFull(R6b, { document: d, openTile: 'props', nftImage: (t) => 'https://img/' + t + '.png' });
const m2 = d.getElementById('ac-main');
ok('Props card (lib default): status pill, yes/no bar, turnout, days left, governance link', /voting/.test(m2.textContent) && m2.querySelector('.ac-bar .y') && /Turnout/.test(m2.textContent) && /2d left/.test(m2.textContent) && /daodao\.zone/.test(m2.innerHTML));
[...d.querySelectorAll('#ac-rail .ac-rc')].find(b => b.dataset.counter === 'market').click(); await new Promise(r => setTimeout(r, 50));
ok('NFT card: thumbnail via nftImage(token), "#745 Sold for 200 bLUNA", venue, tx link', /img\/745\.png/.test(m2.innerHTML) && /#745 Sold for 200 bLUNA/.test(m2.textContent) && /chainsco\.pe\/terra2\/tx\/C50E/.test(m2.innerHTML));
fw.close(false);
d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
// reopen the page's window for the marker checks below
tiles.find(t => t.dataset.tile === 'ecosystem').click(); await new Promise(r => setTimeout(r, 100));
// Props from the corpus (4.25)
const pr = R.tiles.find(t => t.key === 'props'); const execRows = pr.counters.find(c => c.key === 'exec').rows;
const lion = JSON.parse(fs.readFileSync('/home/claude/build/corpus/lion-dao.json')).proposals; const lionExec = (Array.isArray(lion) ? lion : Object.values(lion)).filter(p => /executed/i.test(p.status) && p.expiration && p.expiration.at_time_iso && Date.parse(p.expiration.at_time_iso) >= R.meta.cut);
ok(`P1 Executed counter counts every corpus prop whose vote closed in the window across the five DAOs (Lion DAO contributes ${lionExec.length})`, execRows.filter(r => r.raw.dao === 'Lion DAO').length === lionExec.length && execRows.every(r => /executed/.test(r.rule)), execRows.map(r => r.raw.dao + '#' + r.raw.id));
const R7 = w.AlertCenter.build({ now: R.meta.now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards: (w.__alertCenter && []) , isOpen: () => false }, items: [], chainOnlyListings: [] }, { windowMs: 7 * 864e5 });
const cards7 = (() => { const out = []; for (const sl of ['lion-dao']) { const doc = JSON.parse(fs.readFileSync('/home/claude/build/corpus/' + sl + '.json')); for (const p of (Array.isArray(doc.proposals) ? doc.proposals : Object.values(doc.proposals))) out.push({ dao: 'Lion DAO', id: Number(String(p.id).replace(/\D/g, '')), title: p.title, status: String(p.status).toLowerCase(), live: !!p.live, pending: !!p.pending, endIso: p.expiration && p.expiration.at_time_iso, link: '#', outcome: p.outcome, descFull: p.description, decodedActions: p.decodedActions, rawMsgs: p.rawMsgs }); } return out; })();
const R8 = w.AlertCenter.build({ now: R.meta.now, alertsDoc: { alerts: [] }, lpPools: [], props: { cards: cards7, isOpen: (c) => c.live || c.pending }, items: [], chainOnlyListings: [] }, { windowMs: 30 * 864e5 });
const ex8 = R8.tiles.find(t => t.key === 'props').counters.find(c => c.key === 'exec');
ok(`P2 on a 30d window Lion DAO's recently-closed executed props appear (${ex8.n}), each carrying the full description and its decoded messages`, ex8.n >= 1 && ex8.rows.every(r => r.data.full && r.data.full.length > 100) && ex8.rows.some(r => (r.data.actions || []).length), ex8.rows.map(r => [r.raw.id, r.data.full && r.data.full.length, (r.data.actions || []).length]));
const fw8 = w.AlertCenter.openFull(R8, { document: d, openTile: 'props', openCounter: 'exec' }); const m8 = d.getElementById('ac-main');
const withMsgs = ex8.rows.filter(r => (r.data.actions || []).length || (r.data.rawMsgs || []).length).length;
ok(`P3 the Executed card renders a "Full description" expander on every card, a "Messages" expander on the ${withMsgs} with messages (a signal prop has none), and the why line names the voting-end rule`, [...m8.querySelectorAll('.ac-card')].every(c => /Full description/.test(c.textContent)) && [...m8.querySelectorAll('.ac-card')].filter(c => /Messages \(\d+\)/.test(c.textContent)).length === withMsgs && /voting_end_in_window/.test(m8.textContent));
fw8.close(false);
// registry full text + links (1.2.0)
const R9 = w.AlertCenter.build({ now: R.meta.now, alertsDoc: reg, lpPools: grades.pools, props: { cards: [] }, items: [], chainOnlyListings: [] }, { windowMs: 864e5 });
const fw9 = w.AlertCenter.openFull(R9, { document: d, openTile: 'ecosystem', openCounter: 'assets' }); const m9 = d.getElementById('ac-main');
ok('R1 the USDC.n card carries the Skip:Go manual-migration doc link and the full announcement EXPANDED by default', /docs\.skip\.build\/go\/app\/usdc-n-manual-migration/.test(m9.innerHTML) && m9.querySelector('details.ac-more[open]') && /What happens if I do nothing/.test(m9.textContent));
const Rret = w.AlertCenter.build({ now: R.meta.now, alertsDoc: { alerts: reg.alerts.map(a => Object.assign({}, a, { status: 'inactive' })) }, lpPools: [], props: { cards: [] }, items: [], chainOnlyListings: [] }, { windowMs: R.meta.windowMs });
ok('R0 a registry entry stays on the board whatever its age until its status is set inactive/retired — then it leaves', Rret.tiles.find(t => t.key === 'ecosystem').total === 0 && R.tiles.find(t => t.key === 'ecosystem').total === 2);
[...d.querySelectorAll('#ac-rail .ac-rc')].find(b => b.dataset.counter === 'projects').click(); await new Promise(r => setTimeout(r, 50));
ok('R2 the Capapult card carries the full post ("Why renew", "Allocation"), expanded', m9.querySelector('details.ac-more[open]') && /Why renew/.test(m9.textContent) && /15,600,000 CAPA/.test(m9.textContent));
fw9.close(false);
// marketplace counts every venue event, notable first (1.2.0)
const R10 = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [{ col: 'adao', kind: 'listing', token: 8149, amt: 50000, sym: 'bLUNA', ts: Date.now() - 2 * 864e5, label: 'Listed at 50,000 bLUNA', sub: 'Boost' }, { col: 'adao', kind: 'delisting', token: 8149, ts: Date.now() - 2 * 864e5 + 1000, label: 'Delisted', sub: 'Boost' }, { col: 'adao', kind: 'bid', token: 826, ts: Date.now() - 4 * 864e5, label: 'Bid 69', sub: 'BBL' }, { col: 'adao', kind: 'sale', token: 745, ts: Date.now() - 5 * 864e5, tx: 'C50E', label: 'Sold for 200 bLUNA', sub: 'BBL' }], bblFloor: { amount: 1000, symbol: 'bLUNA' }, chainOnlyListings: [] }, { windowMs: 7 * 864e5 });
const mk10 = R10.tiles.find(t => t.key === 'nfts-adao').counters.find(c => c.key === 'market');
ok('M1 the 7d Marketplace counter counts the listing, the delisting, the bid AND the sale (4), the sale first as notable', mk10.n === 4 && mk10.rows[0].rule === 'nft:sale' && mk10.rows[0].notable === true && !mk10.rows.slice(1).some(r => r.notable), mk10.rows.map(r => r.rule));
// 4.26 — NFT card context: parties + holdings + USD then/now + status; phantom bids skipped; Boost rows name the token
const inv26 = w.__invRecords || []; const items26 = (w.__activityItems || []).filter(x => x.col === 'adao');
ok('X1 no feed item comes from a superseded row (the seven Pixel Lions phantom "bids" are gone) — 7d has no aDAO bid rows', !items26.some(x => x.kind === 'bid' && /currency not in record/.test(x.sub || '')), items26.filter(x => x.kind === 'bid').map(x => x.token));
const boost = items26.filter(x => x.kind === 'listing' && /Boost/.test(x.sub || ''));
ok(`X2 Boost listing rows name the token (${boost.length} rows, e.g. "${boost[0] && boost[0].label}") and carry amt + sym`, boost.length > 0 && boost.every(x => /(LUNA|ampLUNA|bLUNA|SOLID)$/.test(x.label) && x.amt > 0 && x.sym), boost.map(x => x.label));
const sale = items26.find(x => x.kind === 'sale' && x.token == 745);
ok('X3 the #745 sale item carries seller + buyer + 200 bLUNA', sale && sale.seller === 'terra1nj74mncupt0xhpxljls09gg7ufy0nx68fyarfy' && sale.buyer === 'terra1sw7x43lamdkm9gj0luzgzdym52y2sxcv7nk9hy' && sale.amt === 200 && sale.sym === 'bLUNA', sale && [sale.seller, sale.buyer, sale.amt, sale.sym]);
const holds = (a) => { const mine = inv26.filter(r => r.real_owner === a); return { total: mine.length, listed: mine.filter(r => r.listing && r.listing.marketplace).length, liquid: mine.filter(r => r.user_held).length, staked: mine.filter(r => r.daodao_staked || r.enterprise_staked).length, broken: mine.filter(r => r.broken).length }; };
const daily = (() => { const out = {}; for (const mk of ['2026/08', '2026/09']) { const f = path.join(CORE, 'price-history', mk + '.json'); if (!fs.existsSync(f)) continue; for (const [day, row] of Object.entries(JSON.parse(fs.readFileSync(f)).days || {})) for (const [sym, cell] of Object.entries(row || {})) (out[sym] = out[sym] || {})[day] = Number(cell.usd); } return out; })();   // 4.34: the org oracle
const usdAt = (sym, amt, ts) => { const d = new Date(ts).toISOString().slice(0, 10); const m = daily[sym] || {}; let px = m[d]; if (px == null) { const ks = Object.keys(m).filter(k => k <= d).sort(); px = ks.length ? m[ks[ks.length - 1]] : null; } return px != null ? amt * px : null; };
const Rx = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: items26, chainOnlyListings: [] }, { windowMs: 7 * 864e5 });
const fwx = w.AlertCenter.openFull(Rx, { document: d, openTile: 'nfts-adao', openCounter: 'market', nftImage: (t) => 'https://img/' + t + '.png', nameOf: () => null, holdingsOf: holds, usdAt, usdNow: (sym, amt) => amt * ({ LUNA: 0.0449, bLUNA: 0.0785 }[sym] || 0), tokenInfo: (t) => { const r = inv26.find(x => String(x.id) === String(t)); return r ? { broken: !!r.broken, owner: r.real_owner, listed: !!(r.listing && r.listing.marketplace), venue: r.listing && r.listing.marketplace, staked: !!(r.daodao_staked || r.enterprise_staked), where: r.user_held ? 'wallet' : null } : null; } });
const mx = d.getElementById('ac-main'); const saleCard = [...mx.querySelectorAll('.ac-card')].find(c => /#745 Sold/.test(c.textContent));
const buyerHold = holds('terra1sw7x43lamdkm9gj0luzgzdym52y2sxcv7nk9hy'), sellerHold = holds('terra1nj74mncupt0xhpxljls09gg7ufy0nx68fyarfy');
ok('O1 the page reads USD-at-the-time from the org oracle months, never a per-collection usd-daily file', fs.readFileSync('index.html', 'utf8').includes("price-history/' + mks[0] + '.json") && !/luna-usd-daily\.json'\)|bluna-usd-daily\.json'\)/.test(fs.readFileSync('index.html', 'utf8').split('loadContext')[1] || ''));
ok('X4 the #745 sale card shows Seller and Buyer with their holdings (from the same inventory), the unbroken/broken pill, and "200 bLUNA · $x at the time · $y now (±%)"', saleCard && /Seller/.test(saleCard.textContent) && /Buyer/.test(saleCard.textContent) && new RegExp(`${buyerHold.total} NFT`).test(saleCard.textContent) && /200 bLUNA · \$[\d.]+ at the time · \$[\d.]+ now \([+-][\d.]+%\)/.test(saleCard.textContent) && /(unbroken|broken)/.test(saleCard.textContent), saleCard && saleCard.textContent.replace(/\s+/g, ' ').slice(0, 300));
ok('X5 a Boost listing card shows the Lister and "50,000 LUNA · $… at the time · $… now"', (() => { const c = [...mx.querySelectorAll('.ac-card')].find(x => /#8149 Listed/.test(x.textContent)); return c && /Lister/.test(c.textContent) && /50,000 LUNA · \$[\d,.]+ at the time/.test(c.textContent); })());
fwx.close(false);
// 4.27 — one resolver: the feed has no hand map left; symbols come from denom_symbol or lib/denoms.js (catalog)
ok('D1 lib/denoms.js loaded the catalog and resolves every spelling to one answer', w.Denoms.isLoaded() && w.Denoms.symbol('uluna') === 'LUNA' && w.Denoms.symbol('native:uluna') === 'LUNA' && w.Denoms.symbol('cw20:terra17aj4ty4sz4yhgm08na8drc0v03v2jwr3waxcqrwhajj729zhl7zqnpc0ml') === 'bLUNA' && w.Denoms.symbol('terra1ecgazyd0waaj3g7l9cmy5gulhxkps2gmxu9ghducvuypjq68mq2s5lvsct') === 'ampLUNA' && w.Denoms.symbol('cw20:terra1nothere') === null);
ok('D2 the feed builder carries no denom → symbol map (the SYM literal is gone; symOf goes through denom_symbol → Denoms)', !/const SYM = \{ uluna: 'LUNA'/.test(html) && /const symOf = \(d, rec\) => \(rec && rec\.denom_symbol\) \|\| \(window\.Denoms/.test(html));
ok('D3 every priced adao feed row in 7d has a symbol that the catalog knows (no "…" placeholder)', items26.filter(x => x.amt != null).every(x => x.sym && !/…/.test(x.sym)), items26.filter(x => x.amt != null && (!x.sym || /…/.test(x.sym))).map(x => [x.kind, x.token, x.sym]));
// G4 — selected address: pick a wallet that touched a token in the window, re-build with myTokens
const inv = w.__invRecords || []; const wk = (w.__activityItems || []).filter(x => x.col === 'adao' && x.ts >= R.meta.now - 7 * 864e5); const anyRow = wk.find(x => x.token != null && ['transferred', 'staked', 'unstaked', 'sale'].includes(x.kind)); const owner = anyRow && (inv.find(r => String(r.id) === String(anyRow.token)) || {}).real_owner;
if (owner) {
  const mine = new Set(inv.filter(r => r.real_owner === owner).map(r => String(r.id)));
  const R2 = w.AlertCenter.build({ now: R.meta.now, alertsDoc: reg, lpPools: grades.pools, props: { cards: [] }, items: w.__activityItems, myTokens: mine, chainOnlyListings: [] }, { windowMs: 7 * 864e5 });
  const nft2 = R2.tiles.find(t => t.key === 'nfts-adao'); const rows = nft2.counters.flatMap(c => c.rows);
  ok(`G4 with ${owner.slice(0, 12)}… selected, exactly the rows touching its ${mine.size} tokens are "mine" and the NFTs tile is red`, rows.filter(r => r.mine).length >= 1 && rows.every(r => r.mine === (r.raw && r.raw.token != null && mine.has(String(r.raw.token)))) && nft2.state === 'red', rows.filter(r => r.mine).length);
  ok('G4 Ecosystem and Props tiles are never red for an address (red is "about you", not "big")', R2.tiles.filter(t => t.key !== 'nfts-adao').every(t => t.state !== 'red'));
} else console.log('  (G4 skipped: no token row in the window to pick an owner from)');
// G5 — marker
tiles.find(t => t.dataset.tile === 'ecosystem').click(); await new Promise(r => setTimeout(r, 100));
d.getElementById('ac-full-close').click(); await new Promise(r => setTimeout(r, 300));
const seen = w.AlertCenter.marker.get();
console.log('  (after close: ac-full present?', !!d.getElementById('ac-full'), 'body overflow=', JSON.stringify(d.body.style.overflow), 'seen-now', seen - Date.now(), ')');
ok('G5 closing the full window sets the "seen" marker (to the build time of the result that was open), removes the window and unlocks body scroll', seen && Math.abs(seen - Date.now()) < 120e3 && !d.getElementById('ac-full') && d.body.style.overflow !== 'hidden', seen);
const R3 = w.AlertCenter.build({ now: seen + 1000, alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: w.__activityItems, chainOnlyListings: [] }, { since: seen, windowMs: w.AlertCenter.RULES.WINDOW_DEFAULT_MS });
ok('G5 (1.4.0) rebuilt with the marker: the week is still counted (window never shrinks) and no row is newer than the marker', R3.meta.cut === (seen + 1000) - w.AlertCenter.RULES.WINDOW_DEFAULT_MS && R3.tiles.every(t => (t.newCount || 0) === 0), R3.tiles.map(t => [t.key, t.total, t.newCount]));
ok('W1 default window is 7 days and the toggle offers 30d', w.AlertCenter.RULES.WINDOW_DEFAULT_MS === 7 * 864e5 && w.AlertCenter.RULES.WINDOW_LONG_MS === 30 * 864e5 && [...d.querySelectorAll('#alert-center [data-win]')].map(b => b.textContent).join(',') === '7d,30d');
const Rn = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [{ col: 'adao', kind: 'sale', token: 1, ts: Date.now() - 3600e3, label: 'Sold', sub: 'BBL' }, { col: 'adao', kind: 'sale', token: 2, ts: Date.now() - 3 * 864e5, label: 'Sold', sub: 'BBL' }], chainOnlyListings: [] }, { since: Date.now() - 2 * 864e5, windowMs: 7 * 864e5 });
ok('W2 with a marker 2d old: both sales count (7d window), exactly the 1h-old one is new', Rn.tiles.find(t => t.key === 'nfts-adao').total === 2 && Rn.tiles.find(t => t.key === 'nfts-adao').newCount === 1);
const actRow = d.querySelector('[data-act-i]');
if (actRow) { actRow.click(); await new Promise(r => setTimeout(r, 50)); const det = d.querySelector(`[data-act-d="${actRow.dataset.actI}"]`);
  ok('L1 clicking a Live Activity aDAO row renders the Alert Center card under it (thumbnail, status pill, parties, why line)', det && !det.classList.contains('hidden') && det.querySelector('.ac-card') && det.querySelector('.ac-nft') && det.querySelector('.why'), det && det.textContent.replace(/\s+/g, ' ').slice(0, 200));
  actRow.click(); await new Promise(r => setTimeout(r, 50)); ok('L2 clicking again collapses it', det.classList.contains('hidden')); }
else console.log('  (L1/L2 skipped: no aDAO row rendered in the feed)');
// 4.29 — inline facts in the row (desktop); the expand target is mobile-only
const inl = [...d.querySelectorAll('[data-act-i] .ac-inline')];
const rowsN = d.querySelectorAll('[data-act-i]').length, pills = inl.filter(b => b.querySelector('.ac-pill')).length, party = inl.filter(b => b.querySelector('.ac-il-party a')).length;
console.log(`  (inline: rows ${rowsN} · blocks ${inl.length} · with status ${pills} · with a party ${party})`);
ok(`L3 every aDAO feed row carries an inline facts block; status pills wherever the inventory knows the token; a party on ≥80%`, inl.length > 0 && inl.length === rowsN && pills >= inl.length * 0.8 && party >= inl.length * 0.8, inl.slice(0, 2).map(b => b.textContent.replace(/\s+/g, ' ').slice(0, 120)));
const inlPriced = inl.filter(b => b.querySelector('.ac-il-price')); console.log('  (inline priced sample: ' + inlPriced.slice(0, 2).map(b => b.querySelector('.ac-il-price').textContent).join(' | ') + ')');
console.log('  (L4 not-matching: ' + JSON.stringify(inlPriced.filter(b => !/\$[\d,.]+ then · \$[\d,.]+ now/.test(b.textContent)).map(b => b.querySelector('.ac-il-price').textContent)) + ')'); console.log('  (L4 parts: priced ' + inlPriced.every(b => /\$[\d,.]+ then · \$[\d,.]+ now/.test(b.textContent)) + ' hint ' + !!d.querySelector('[data-act-i] .md\\:hidden') + ' block ' + !!d.querySelector('.activity-details.md\\:hidden') + ')');
ok('L4 priced rows show USD then · now · spread inline; the "details ▾" hint and the expand block are phone-only (md:hidden)', inlPriced.length > 0 && inlPriced.every(b => /\$[\d,.]+ then · \$[\d,.]+ now/.test(b.textContent)) && d.querySelector('[data-act-i] .md\\:hidden') && d.querySelector('.activity-details.md\\:hidden'));
// G6 — pure lib on an empty world
const R4 = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [], chainOnlyListings: [] }, { windowMs: 864e5 });
ok('G6 no events, empty registry → three green tiles, all counters 0, gap counters carry their note', R4.tiles.length === 3 && R4.tiles.every(t => t.state === 'green') && R4.tiles.flatMap(t => t.counters).every(c => c.n === 0) && R4.tiles[0].counters.filter(c => c.gap).length === 1);
const R5 = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: Array.from({ length: 6 }, (_, i) => ({ col: 'adao', kind: 'unstaked', token: 100 + i, ts: Date.now() - i * 60e3, label: 'Unstaked', sub: 'aDAO (DAODAO)' })), stakedSupply: 1661, chainOnlyListings: [] }, { windowMs: 864e5 });
const stk5 = R5.tiles.find(t => t.key === 'nfts-adao').counters.find(c => c.key === 'staking');
ok(`G6 six unstakes in 24h → one "Mass unstake" row (${w.AlertCenter.RULES.MASS_UNSTAKE_N} threshold) on top of the six, with the % of staked supply`, stk5.n === 7 && /^Mass unstake: 6 NFTs in 24h/.test(stk5.rows[0].label) && /% of staked/.test(stk5.rows[0].value), stk5.rows[0]);
const R6 = w.AlertCenter.build({ now: Date.now(), alertsDoc: { alerts: [] }, lpPools: [], props: { cards: [] }, items: [], chainOnlyListings: [{ tokenId: 745, price: 200, priceToken: 'bLUNA', priceUsd: 16.76, auctionId: '14765' }] }, { windowMs: 864e5 });
ok('G6 a chain-only listing (C.6) is a Marketplace row that says "on-chain only · not on BBL\'s UI" and links to the explorer', (() => { const r = R6.tiles.find(t => t.key === 'nfts-adao').counters.find(c => c.key === 'market').rows[0]; return r && /on-chain only · not on BBL's UI/.test(r.label) && /nft-explorer/.test(r.link) && r.rule === 'nft:chain_only_listing'; })());
console.log(`\n=== GATE index-alert-center: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
