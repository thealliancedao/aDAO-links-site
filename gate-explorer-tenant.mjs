#!/usr/bin/env node
// gate-explorer-tenant.mjs — E1 + E2 + E3, the tenant layer, the manifest-driven page, Pixel Lions lit (lib/collection-context.js 1.1.0 ·
// site-header 1.11.0 · explorer 4.41).
//   7. (E3) Images: aDAO cards keep the Cloudflare URL byte for byte, PL cards use the manifest's IPFS pattern. Theme: the header
//      injects the tenant theme (accent #ffe600 …) for Lion DAO and nothing for aDAO. Marks: both collections' marks are files the
//      site serves. Analytics on PL (STAGE_NFTC: the seed + explorer feed built by the real cron code): 2,012 sales, floor + holders
//      tiles instead of backing, one floor row ("All"), no Broken/Phoenix chart buttons.
//   6. (E2) Booted as adao, the filter panel DOM (trait dropdowns, status grid, trait toggles, wallet toggles) is IDENTICAL to the
//      committed page's; booted as liondao the page renders Pixel Lions: 5,000 records, cards in the gallery, six trait dropdowns
//      Back … Prop, no Planet/Inhabitant sections, no Rewards (broken) filter, "DAO held" mint label, no BBL rank toggle, token
//      names "pixeLion #n", every record ranked from PL's rarity file, owners resolved for all 5,000 after hydration.
//   1. From the REAL registry (tla-core/docs/curated/tenants.json + adao/collection.json), the aDAO context reproduces every
//      collection URL the committed explorer used as a literal — read from the committed app.js on main (MAIN_SITE_DIR), never
//      typed here. The fallback block reproduces the same URLs and the same feature flags: the site never blanks, never lies.
//   2. Lion DAO → primary pixel-lions: every URL under pixel-lions/, metadata + rarity from the manifest, no backing / break /
//      tiers / custody, Enterprise legacy yes, traits Back … Prop, "DAO held" instead of "Unminted".
//   3. pickTenant precedence: ?tenant= → /<slug> path → device pref → the registry's default; a URL choice becomes the pref.
//   4. The header under jsdom: aDAO renders first (no dropdown until the registry answers); with the registry, a 2-option select,
//      the logo swaps to the tenant's mark for liondao and stays aDAO for adao; a change calls CollectionContext.select.
//   5. The explorer under jsdom: booted as adao, the set of nft-collections URLs it requests == the set the committed 4.38 page
//      requests (same fixture, same stubs) — behaviour byte-identical; booted as liondao, every nft-collections URL is under
//      pixel-lions/ and the journey slug is pixel-lions.
// Usage: NFTC_DIR=<nft-collections> TLA_CORE_DIR=<tla-core> MAIN_SITE_DIR=<aDAO-links-site main checkout> [STAGE_NFTC=<dir>] [DO_DIR=<dao-originations>] node gate-explorer-tenant.mjs
//   STAGE_NFTC: a nft-collections copy where pixel-lions/snapshots carries sales-enriched + listing-history + nft-analytics — until the
//   seed is on main, build it with: node gate-stage-pixel-lions.js <nft-collections> <tla-core> <platform-crons> <out dir>
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const NFTC = process.env.NFTC_DIR, CORE = process.env.TLA_CORE_DIR, MAIN = process.env.MAIN_SITE_DIR, DO = process.env.DO_DIR || null;   // DO_DIR: a dao-originations checkout (member names)
if (!NFTC || !CORE || !MAIN) { console.error('NFTC_DIR, TLA_CORE_DIR and MAIN_SITE_DIR required'); process.exit(1); }
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 400) : '')); } };
const rj = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const CC = require(path.resolve('lib/collection-context.js'));
const tenants = rj(path.join(CORE, 'docs/curated/tenants.json'));
const manifests = { adao: rj(path.join(NFTC, 'adao/collection.json')), 'pixel-lions': rj(path.join(NFTC, 'pixel-lions/collection.json')) };
const NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/', CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
const mainApp = fs.readFileSync(path.join(MAIN, 'nft-explorer-app.js'), 'utf8');
const lit = (name) => (mainApp.match(new RegExp('^(?:const|let) ' + name + ' = "([^"]+)"', 'm')) || [])[1];

console.log('\n== 1. the registry reproduces the committed aDAO literals ==');
const A = await CC.load({ tenant: 'adao', tenants, manifests });
const a = A.primary;
const expect = { 'snapshots/nfts.json': lit('STATUS_DATA_URL'), 'snapshots/explorer-bundle.json': lit('BUNDLE_URL'), 'snapshots/nft-analytics.json': lit('ANALYTICS_URL'), 'snapshots/summary.json': lit('ANALYTICS_SUMMARY_URL'), 'snapshots/sales-enriched.json': lit('ANALYTICS_ENRICHED_URL'), 'snapshots/broken-at.json': lit('BROKEN_AT_URL'), 'snapshots/listing-history.json': lit('LISTING_HISTORY_URL') };
ok('every literal read from the committed app.js (7 collection URLs + metadata + 2 rarity files + members.csv)', Object.values(expect).every(Boolean) && lit('METADATA_URL') && lit('RARITY_INTENDED_URL') && lit('RARITY_BBL_URL') && lit('MEMBERS_CSV_URL'), expect);
ok('aDAO context: the 7 snapshot URLs == the committed literals, byte for byte', Object.entries(expect).every(([rel, u]) => a.url(rel) === u), Object.entries(expect).filter(([rel, u]) => a.url(rel) !== u));
ok('aDAO context: metadata + rarity stay on the site\'s edge-served assets (the literals), members.csv from the tenant\'s first DAO', a.assets.metadata === lit('METADATA_URL') && a.assets.rarity === lit('RARITY_INTENDED_URL') && a.assets.rarity_secondary === lit('RARITY_BBL_URL') && `https://raw.githubusercontent.com/thealliancedao/dao-originations/main/${A.tenant.daos[0]}/governance/members.csv` === lit('MEMBERS_CSV_URL'), [a.assets, A.tenant.daos]);
ok('aDAO context: features from the manifest — backing ampLUNA, break mechanism, phoenix tier, custody, Enterprise, portfolio, name registry', a.features.backing && a.features.backing_symbol === 'ampLUNA' && a.features.break_mechanism && a.features.phoenix && a.features.custody && a.features.enterprise && a.features.member_portfolio && a.features.name_registry, a.features);
ok('aDAO context: traits Planet · Inhabitant · Object · Weather · Light (Rarity is a computed column), venues bbl/atrium/boost, supply 10000, label "Unminted"', JSON.stringify(a.traits) === JSON.stringify(['Planet', 'Inhabitant', 'Object', 'Weather', 'Light']) && JSON.stringify(a.venues) === JSON.stringify(['bbl', 'atrium', 'boost']) && a.supply === 10000 && a.labels.unminted === 'Unminted', [a.traits, a.venues, a.supply, a.labels]);
ok('tenant block: logo is a file the site serves', fs.existsSync(path.join('.', decodeURIComponent(A.tenant.logo))), A.tenant.logo);
{ const F = await CC.load({ tenant: 'adao', tenants: CC.ADAO_FALLBACK, manifests: CC.ADAO_FALLBACK.manifests }); const f = F.primary;
  const same = ['slug', 'supply', 'contract'].every(k => JSON.stringify(f[k]) === JSON.stringify(a[k])) && JSON.stringify(f.features) === JSON.stringify(a.features) && JSON.stringify(f.traits) === JSON.stringify(a.traits) && JSON.stringify(f.venues) === JSON.stringify(a.venues) && JSON.stringify(f.assets) === JSON.stringify(a.assets) && JSON.stringify(f.labels) === JSON.stringify(a.labels) && Object.keys(expect).every(rel => f.url(rel) === a.url(rel));
  ok('the fallback block (registry unreachable) === the registry-driven aDAO context: slug, supply, contract, features, traits, venues, assets, labels, URLs', same, { f: [f.features, f.traits, f.assets], a: [a.features, a.traits, a.assets] });
  ok('the fallback tenant block === tenants.json adao (label, short, logo, collections, daos, theme)', ['label', 'short', 'logo', 'collections', 'daos', 'theme'].every(k => JSON.stringify(CC.ADAO_FALLBACK.tenants.adao[k]) === JSON.stringify(tenants.tenants.adao[k])), [CC.ADAO_FALLBACK.tenants.adao, tenants.tenants.adao]); }

console.log('\n== 2. Lion DAO → pixel-lions ==');
const L = await CC.load({ tenant: 'liondao', tenants, manifests });
const p = L.primary;
ok('primary = pixel-lions (tenants.json order), one collection today, tenant label/logo/theme from the registry', p && p.slug === 'pixel-lions' && L.collections.length === tenants.tenants.liondao.collections.length && L.tenant.label === 'Lion DAO' && /ROAR_LOGO/.test(L.tenant.logo) && L.tenant.theme && L.tenant.theme.accent, L.tenant);
ok('every snapshot URL under pixel-lions/', Object.keys(expect).every(rel => p.url(rel) === NFTC_U + 'pixel-lions/' + rel));
const plImages = manifests['pixel-lions'].images;
ok('metadata + rarity from the manifest (nft-collections), no secondary rarity, images from the manifest cdn_pattern (+ cdn_fallback)', p.assets.metadata === NFTC_U + 'pixel-lions/metadata/metadata.json' && p.assets.rarity === NFTC_U + 'pixel-lions/rarity/rarity.json' && p.assets.rarity_secondary === null && p.assets.image('12') === plImages.cdn_pattern.replace('{id}', '12') && (!plImages.cdn_fallback || p.assets.image_fallback('12') === plImages.cdn_fallback.replace('{id}', '12')), p.assets);
ok('features: no backing, no break, no tiers, no custody; Enterprise legacy yes; portfolio off; no name registry', !p.features.backing && !p.features.break_mechanism && p.features.tiers.length === 0 && !p.features.custody && p.features.enterprise && !p.features.member_portfolio && !p.features.name_registry, p.features);
ok('traits Back · Body · Eyes · Face · Mane · Prop, venues bbl/atrium/boost, supply 5000, a token in the DAO core is "DAO held"', JSON.stringify(p.traits) === JSON.stringify(['Back', 'Body', 'Eyes', 'Face', 'Mane', 'Prop']) && JSON.stringify(p.venues) === JSON.stringify(['bbl', 'atrium', 'boost']) && p.supply === 5000 && p.labels.unminted === 'DAO held', [p.traits, p.venues, p.supply, p.labels]);
ok('tenant logo is a file the site serves', fs.existsSync(path.join('.', decodeURIComponent(L.tenant.logo))), L.tenant.logo);

console.log('\n== 3. pickTenant precedence ==');
{ const T = tenants.tenants; const set = (loc, prefs) => { globalThis.location = loc; globalThis.localStorage = { _s: prefs ? JSON.stringify(prefs) : null, getItem() { return this._s; }, setItem(k, v) { this._s = v; } }; };
  set({ search: '?tenant=liondao', pathname: '/nft-explorer-index.html' }, { tenant: 'adao' }); ok('?tenant= wins over the device pref and becomes the pref', CC.pickTenant(T).slug === 'liondao' && JSON.parse(globalThis.localStorage._s).tenant === 'liondao');
  set({ search: '', pathname: '/liondao' }, null); ok('/liondao (the Vercel rewrite path) selects liondao and becomes the pref', CC.pickTenant(T).slug === 'liondao' && JSON.parse(globalThis.localStorage._s).tenant === 'liondao');
  set({ search: '', pathname: '/index.html' }, { tenant: 'liondao' }); ok('no URL choice → the device pref', CC.pickTenant(T).slug === 'liondao' && CC.pickTenant(T).via === 'prefs');
  set({ search: '', pathname: '/index.html' }, null); ok('nothing chosen → the registry default (adao)', CC.pickTenant(T).slug === 'adao' && CC.pickTenant(T).via === 'default');
  set({ search: '?tenant=nope', pathname: '/nope' }, { tenant: 'nope' }); ok('an unknown tenant anywhere → the default, never a blank', CC.pickTenant(T).slug === 'adao');
  delete globalThis.location; delete globalThis.localStorage; }

console.log('\n== 4. the header under jsdom ==');
const headerLib = fs.readFileSync('lib/site-header.js', 'utf8'), ctxLib = fs.readFileSync('lib/collection-context.js', 'utf8');
async function header(prefTenant, registryUp) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="site-header"></div></body></html>', { url: 'https://thealliancedao.com/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  if (prefTenant) w.localStorage.setItem('ally:prefs', JSON.stringify({ tenant: prefTenant }));
  w.fetch = (u) => { const url = String(u).split('?')[0]; if (url === CC.TENANTS_URL && registryUp) return Promise.resolve({ ok: true, json: async () => tenants }); let f = null; if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length)); if (f && fs.existsSync(f)) return Promise.resolve({ ok: true, json: async () => rj(f) }); return Promise.resolve({ ok: false, status: 404, json: async () => { throw new Error('404'); } }); };
  w.eval(ctxLib); w.eval(headerLib); w.SiteHeader.mount({ page: 'index' });
  await new Promise(r => setTimeout(r, 300));
  const el = w.document.querySelector('#site-header'); const sel = el.querySelector('.sh-tenant'); const img = el.querySelector('.sh-logo img');
  return { w, el, sel, img, opts: sel ? [...sel.options].map(o => o.value) : null, on: sel && sel.classList.contains('sh-on') };
}
{ const live = JSON.parse(JSON.stringify(tenants)); live.tenants.liondao.live = true; const saved = tenants.tenants.liondao.live; tenants.tenants.liondao.live = true;
  const h = await header(null, true); tenants.tenants.liondao.live = saved;
  ok('registry up (liondao live), no pref: aDAO logo, dropdown shown with both tenants, adao selected', /Alliance%20DAO%20Logo/.test(h.img.getAttribute('src')) && h.on && JSON.stringify(h.opts) === JSON.stringify(Object.keys(tenants.tenants)) && h.sel.value === 'adao' && h.el.getAttribute('data-sh-tenant') === 'adao', [h.img.getAttribute('src'), h.opts, h.sel.value]);
  let picked = null; h.w.CollectionContext.select = (s) => { picked = s; }; h.sel.value = 'liondao'; h.sel.dispatchEvent(new h.w.Event('change')); ok('choosing Lion DAO calls CollectionContext.select("liondao") (remembers + reloads)', picked === 'liondao', picked); }
{ const h = await header('liondao', true); ok('pref liondao: the logo swaps to the ROAR mark, alt "Lion DAO", the dropdown shows it selected', /ROAR_LOGO/.test(h.img.getAttribute('src')) && h.img.getAttribute('alt') === 'Lion DAO' && h.on && h.sel.value === 'liondao' && h.el.getAttribute('data-sh-tenant') === 'liondao', [h.img.getAttribute('src'), h.img.getAttribute('alt'), h.opts]); }
{ const h = await header('liondao', false); ok('registry unreachable: the header still renders aDAO, no dropdown (one ally known), nothing blank', /Alliance%20DAO%20Logo/.test(h.img.getAttribute('src')) && !h.on, [h.img.getAttribute('src'), h.on]); }

console.log('\n== 5. the explorer under jsdom: same URL set as the committed page (adao) · pixel-lions (liondao) ==');
const html = fs.readFileSync('nft-explorer-index.html', 'utf8'), app = fs.readFileSync('nft-explorer-app.js', 'utf8');
ok('html loads /lib/collection-context.js before the app; app + style cache-busted together; footer rev ≥ 4.39', html.indexOf('/lib/collection-context.js') !== -1 && html.indexOf('/lib/collection-context.js') < html.indexOf('nft-explorer-app.js?v=') && (html.match(/nft-explorer-app\.js\?v=([\d.]+)/) || [])[1] === (html.match(/nft-explorer-style\.css\?v=([\d.]+)/) || [])[1] && Number((html.match(/rev: '([\d.]+)'/) || [])[1]) >= 4.39);
ok('app: no aDAO snapshot literal is fetched inline any more (every collection read goes through the *_URL variables)', !/fetch\(['"`]https:\/\/raw\.githubusercontent\.com\/thealliancedao\/nft-collections\/main\/adao/.test(app) && !/grab\('https:\/\/raw/.test(app));
async function bootExplorer(appSrc, tenant, withCtx, opts_analytics, nftcDir) {
  const seen = new Set(); const NFTC_X = nftcDir || NFTC;
  let pageHtml = html.replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<script src="nft-explorer-app.js[^"]*" defer><\/script>/, '');
  const stub = (w) => { w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }; w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    w.SiteHeader = { mount() {}, init() {}, subnav() {}, setActive() {} }; w.SiteFooter = { mount() {} }; w.AddressPicker = { mount() {}, init() {} }; w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), render() {} };
    w.fetch = (u) => { const url = String(u).split('?')[0]; seen.add(url); if (url === CC.TENANTS_URL) return Promise.resolve({ ok: true, status: 200, json: async () => tenants }); let f = null; if (url.startsWith(NFTC_U)) f = path.join(NFTC_X, url.slice(NFTC_U.length)); else if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (url.startsWith('https://thealliancedao.com/assets/')) f = path.join('.', url.slice('https://thealliancedao.com'.length)); else if (DO && /dao-originations\/main\/(.*)$/.test(url)) f = path.join(DO, url.match(/dao-originations\/main\/(.*)$/)[1]);
      if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404 ' + url)), text: () => Promise.resolve('') }); }; };
  const dom = new JSDOM(pageHtml, { url: 'https://thealliancedao.com/nft-explorer-index.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stub });
  const w = dom.window; if (tenant) w.localStorage.setItem('ally:prefs', JSON.stringify({ tenant }));
  w.eval(fs.readFileSync('lib/nft-history.js', 'utf8')); if (withCtx) w.eval(ctxLib);
  w.eval(appSrc + "\n;window.__g = { analytics: () => switchView('analytics'), namedTop: () => Object.entries(addressToMember).filter(([a, m]) => m.name && m.staked >= 100).map(([a, m]) => m.name), sysLabels: () => Object.values(SYSTEM_WALLET_LABELS), slug: () => (typeof JOURNEY !== 'undefined' ? JOURNEY.slug : null), n: () => (typeof allNfts !== 'undefined' ? allNfts.length : 0), ranked: () => (typeof allNfts !== 'undefined' ? allNfts.filter(x => x.intended_rank != null).length : 0), owners: () => (typeof allNfts !== 'undefined' ? allNfts.filter(x => x.owner).length : 0), names: () => (typeof allNfts !== 'undefined' ? allNfts.slice(0, 3).map(x => x.name) : []) };");
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
  await new Promise(r => setTimeout(r, 12000));
  const d = w.document; const q = (id) => d.getElementById(id); const inner = (id) => (q(id) ? q(id).innerHTML : null);
  const hiddenSec = (id) => { const c = q(id); return !!(c && c.parentElement && c.parentElement.classList.contains('hidden')); };
  const snap = { traitFilters: inner('trait-filters-container'), status: inner('status-filters-grid'), toggles: inner('trait-toggles-container'), walletToggles: inner('wallet-trait-toggles-container'),
    traitLabels: [...d.querySelectorAll('#trait-filters-container .multi-select-container > label')].map(l => l.textContent.trim()),
    statusKeys: [...d.querySelectorAll('#status-filters-grid .status-toggle-cb')].map(i => i.dataset.key || i.getAttribute('data-key') || i.value || i.id),
    statusText: q('status-filters-grid') ? q('status-filters-grid').textContent.replace(/\s+/g, ' ') : '',
    planetHidden: hiddenSec('planet-filters-container'), inhabitantHidden: hiddenSec('inhabitant-filters-container'),
    bblToggleHidden: !!(q('rank-mode-bbl') && q('rank-mode-bbl').parentElement.classList.contains('hidden')),
    firstImg: (d.querySelector('#nft-gallery .nft-card img') || { getAttribute: () => null }).getAttribute('src'), firstFallback: (d.querySelector('#nft-gallery .nft-card img') || { getAttribute: () => null }).getAttribute('data-fallback'), firstId: ((d.querySelector('#nft-gallery .nft-card') || { textContent: '' }).textContent.match(/#(\d+)/) || [])[1],
    cards: d.querySelectorAll('#nft-gallery .nft-card').length, firstCardText: (d.querySelector('#nft-gallery .nft-card') || { textContent: '' }).textContent.replace(/\s+/g, ' ').slice(0, 120),
    ranked: w.__g.ranked(), owners: w.__g.owners(), names: w.__g.names(), namedTop: w.__g.namedTop(), sysLabels: w.__g.sysLabels(), hero: (q('collection-hero') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim() || null, lbNote: (d.querySelector('#leaderboard-table tbody tr td, #leaderboard-table caption, .lb-note') || { textContent: '' }).textContent, rankLabel: (q('rank-mode-intended') && q('rank-mode-intended').closest('.w-full') && q('rank-mode-intended').closest('.w-full').querySelector('label') || { textContent: '' }).textContent };
  let analytics = null;
  if (opts_analytics) { try { w.__g.analytics(); await new Promise(r => setTimeout(r, 6000)); const av = d.getElementById('analytics-view'); analytics = av ? av.textContent.replace(/\s+/g, ' ') : null; } catch (e) { analytics = 'ERR ' + e.message; } }
  const urls = [...seen].filter(u => u.startsWith(NFTC_U) && !/\/collection\.json$/.test(u)).sort();   // the manifest read is the registry, not a product; compared separately
  const manifestReads = [...seen].filter(u => /nft-collections\/main\/[^/]+\/collection\.json$/.test(u)); const r = { urls, manifestReads, slug: w.__g.slug(), n: w.__g.n(), tenant: w.document.documentElement.getAttribute('data-tenant'), dom: snap, analytics }; w.close(); return r;
}
const base = await bootExplorer(mainApp, null, false);
const mine = await bootExplorer(app, 'adao', true);
ok(`adao: the 4.39 page requests exactly the nft-collections product URL set the committed 4.38 page requests (${base.urls.length} URLs) plus adao/collection.json (the registry), journey slug adao, data-tenant adao, ${base.n} records both`, JSON.stringify(mine.urls) === JSON.stringify(base.urls) && JSON.stringify(mine.manifestReads) === JSON.stringify([NFTC_U + 'adao/collection.json']) && base.manifestReads.length === 0 && mine.slug === 'adao' && mine.tenant === 'adao' && mine.n === base.n, { onlyMain: base.urls.filter(u => !mine.urls.includes(u)), onlyMine: mine.urls.filter(u => !base.urls.includes(u)), manifests: mine.manifestReads, n: [base.n, mine.n] });
const lion = await bootExplorer(app, 'liondao', true);
ok(`liondao: every nft-collections URL the page requests is under pixel-lions/ (${lion.urls.length} URLs), journey slug pixel-lions, data-tenant liondao`, lion.urls.length > 0 && lion.urls.every(u => u.startsWith(NFTC_U + 'pixel-lions/')) && JSON.stringify(lion.manifestReads) === JSON.stringify([NFTC_U + 'pixel-lions/collection.json']) && lion.slug === 'pixel-lions' && lion.tenant === 'liondao', { urls: lion.urls, slug: lion.slug });
console.log('\n== 6. E2 — the page is manifest-driven ==');
const B = base.dom, M = mine.dom, P = lion.dom;
ok('adao: the filter panel DOM is identical to the committed page (trait dropdowns, status grid, trait toggles, wallet toggles)', M.traitFilters === B.traitFilters && M.status === B.status && M.toggles === B.toggles && M.walletToggles === B.walletToggles, { traitLabels: [B.traitLabels, M.traitLabels], statusText: [B.statusText.slice(0, 200), M.statusText.slice(0, 200)] });
ok(`adao: Planet + Inhabitant sections shown, Rewards filter present, BBL rank toggle shown, ${M.cards} cards, ${M.ranked}/${mine.n} ranked, names as before`, !M.planetHidden && !M.inhabitantHidden && /Rewards/.test(M.statusText) && !M.bblToggleHidden && M.cards === B.cards && M.cards > 0 && M.ranked === B.ranked && JSON.stringify(M.names) === JSON.stringify(B.names), [M.cards, B.cards, M.ranked, M.names]);
ok(`liondao: 5,000 Pixel Lions boot from PL's bundle, ${P.cards} cards render, names "pixeLion #n", the card title is the collection's ("pixeLion #…", not "aDAO #…")`, lion.n === 5000 && P.cards > 0 && P.names.every(x => /^pixeLion #\d+$/.test(x)) && /pixeLion #\d+/.test(P.firstCardText) && !/aDAO #/.test(P.firstCardText), [lion.n, P.cards, P.names, P.firstCardText]);
ok('liondao: six trait dropdowns Back · Body · Eyes · Face · Mane · Prop, no Planet/Inhabitant sections, no Rarity grade dropdown', JSON.stringify(P.traitLabels) === JSON.stringify(['Back', 'Body', 'Eyes', 'Face', 'Mane', 'Prop']) && P.planetHidden && P.inhabitantHidden, [P.traitLabels, P.planetHidden, P.inhabitantHidden]);
ok('liondao: no Rewards (broken/unbroken) filter, no P+I matching filter, NO mint-status filter (4.48: nothing is unminted — "DAO held" is a badge, not a filter), Staked/Listed/Liquid stay', !/Rewards/.test(P.statusText) && !/Matching/.test(P.statusText) && !/Mint Status/.test(P.statusText) && !/DAO held/.test(P.statusText) && !/Un-Minted/.test(P.statusText) && /Staked/.test(P.statusText) && /Listed/.test(P.statusText) && /Liquid/.test(P.statusText), P.statusText.slice(0, 300));
ok('adao: the Mint Status filter (Un-Minted / Minted) stays — aDAO has an unminted reserve', /Mint Status/.test(M.statusText) && /Un-Minted/.test(M.statusText), M.statusText.slice(0, 300));
ok('liondao: holder names come from the pixel-lions DAO members file too (the tenant\'s second DAO) — the #1 staker is named; the DAO core is labeled from the manifest, aDAO\'s wallet literals are gone', P.namedTop && P.namedTop.length > 0 && /pixeLions DAO core/.test(P.sysLabels.join('|')) && !P.sysLabels.some(l => /DAO Unminted|DAO Broken/.test(l)), [P.namedTop, P.sysLabels]);
ok('liondao: the collection hero renders above the tabs — mark, "pixeLions", "Lion DAO", the registry tagline, Supply 5,000 · Holders · Listed · Floor', P.hero && /pixeLions/.test(P.hero) && /Lion DAO/.test(P.hero) && /Supply\s*5,000/.test(P.hero) && /Holders/.test(P.hero) && /Listed/.test(P.hero) && /Floor/.test(P.hero), P.hero && P.hero.slice(0, 200));
ok('adao: NO hero (the default tenant\'s page is untouched)', !M.hero && !B.hero, [M.hero, B.hero]);
ok('liondao: a card reads "Rank N · top X%" (BBL\'s statistical rank, no grade), the leaderboard note names pixeLions DAO, the rank-system label says which oracle', /Rank \d+ · top [\d.]+%/.test(P.firstCardText) && !/Rarity —/.test(P.firstCardText) && /pixeLions DAO-owned wallets/.test(P.lbNote || '') && /BBL's statistical rank/.test(P.rankLabel || ''), [P.firstCardText, P.lbNote, P.rankLabel]);
ok('adao: a card still reads "Rarity G, Rank N"', /Rarity \d+, Rank \d+/.test(M.firstCardText), M.firstCardText);
ok('liondao: the trait toggles are Rank + Back … Prop (no Rarity) and ALL on by default (owner), wallet toggles Rank + Back/Body/Eyes, BBL rank toggle hidden (one rank oracle)', /Back/.test(P.toggles) && /Prop/.test(P.toggles) && !/Rarity|Planet/.test(P.toggles) && (P.toggles.match(/checked/g) || []).length === 7 && /Eyes/.test(P.walletToggles) && !/Object/.test(P.walletToggles) && P.bblToggleHidden, [P.bblToggleHidden, (P.toggles.match(/checked/g) || []).length]);
ok(`liondao: after hydration every record is ranked from PL's rarity file (${P.ranked}/5000) and every owner resolved from PL's nfts.json (${P.owners}/5000)`, P.ranked === 5000 && P.owners === 5000, [P.ranked, P.owners]);
console.log('\n== 7. E3 — Pixel Lions lit ==');
ok('adao: the first card\'s image URL is unchanged (the Cloudflare rule through the context, byte for byte)', M.firstImg && M.firstImg === B.firstImg, [B.firstImg, M.firstImg]);
ok('liondao: the first card\'s image comes from the manifest\'s cdn_pattern, its on-error source from cdn_fallback', P.firstImg && P.firstImg === plImages.cdn_pattern.replace('{id}', String(P.firstId)) && (!plImages.cdn_fallback || P.firstFallback === plImages.cdn_fallback.replace('{id}', String(P.firstId))), [P.firstImg, P.firstFallback]);
ok('marks: both collections\' marks (images.mark) are files the site serves; the tenant logo and the collection mark differ for Lion DAO', a.assets.mark && p.assets.mark && fs.existsSync(path.join('.', decodeURIComponent(a.assets.mark))) && fs.existsSync(path.join('.', decodeURIComponent(p.assets.mark))) && p.assets.mark !== L.tenant.logo, [a.assets.mark, p.assets.mark, L.tenant.logo]);
{ const h = await header('liondao', true); const st = h.w.document.getElementById('sh-tenant-theme');
  const th = tenants.tenants.liondao.theme;
  ok(`header (liondao): the tenant theme is injected — accent ${th.accent}, a ${th.mode} page (${th.bg}), tiles on the tenant's surface (${th.surface}) with dark-gold borders (${th.border}), no translucent tiles, the pixel style (square corners, hard yellow shadows, yellow frames), the pixel font requested; <html data-tenant="liondao">`, st && new RegExp('--ally-accent:' + th.accent).test(st.textContent) && new RegExp('body\\.bg-gray-900\\{background-color:' + th.bg + '!important;color:' + th.text).test(st.textContent) && new RegExp('\\.nft-card[^{]*\\{background-color:' + th.surface).test(st.textContent) && /\.sh-sticky/.test(st.textContent) && /--tw-bg-opacity:1/.test(st.textContent) && !/body > :not\(\.bg-gray-800\)/.test(st.textContent) && /border-radius:0!important/.test(st.textContent) && /box-shadow:6px 6px 0 #ffe600/.test(st.textContent) && new RegExp('\\.sh-tilewrap[^{]*\\{border:2px solid ' + th.accent).test(st.textContent) && !!h.w.document.querySelector('link[data-sh-font="Press Start 2P"]') && h.w.document.documentElement.getAttribute('data-tenant') === 'liondao', st && st.textContent.slice(0, 300)); }
{ const h = await header(null, true); ok('header (adao, the default): NO theme injected, no font link, aDAO Lore tab + New-here pills present — aDAO renders byte for byte as before', !h.w.document.getElementById('sh-tenant-theme') && !h.w.document.querySelector('link[data-sh-font]') && !!h.el.querySelector('.sh-tab[data-page="adao-lore"]') && !!h.el.querySelector('.sh-nh-wrap')); }
{ const h = await header('liondao', true); const st = h.w.document.getElementById('sh-tenant-theme').textContent;
  ok('header (liondao): the page colour outranks the lib\'s own html,body !important rule, the mesh backdrop is repainted in the tenant colours, the aDAO Lore tab and the New-here pills are gone (tenants.json nav)', new RegExp('body\\.bg-gray-900\\{background-color:' + tenants.tenants.liondao.theme.bg + '!important').test(st) && /\.bg-mesh\{background:/.test(st) && !h.el.querySelector('.sh-tab[data-page="adao-lore"]') && !h.el.querySelector('.sh-nh-wrap') && !!h.el.querySelector('.sh-tab[data-page="dao"]'), [!!h.el.querySelector('.sh-tab[data-page="adao-lore"]'), !!h.el.querySelector('.sh-nh-wrap')]); }
const STAGE = process.env.STAGE_NFTC;
if (STAGE && fs.existsSync(path.join(STAGE, 'pixel-lions/snapshots/nft-analytics.json'))) {
  const feed = rj(path.join(STAGE, 'pixel-lions/snapshots/nft-analytics.json'));
  const lionA = await bootExplorer(app, 'liondao', true, true, STAGE); const T = lionA.analytics || '';
  ok(`liondao analytics: renders from the staged seed — ${feed.volume.sales_count} sales, all-time volume shown; Floor now + Holders tiles instead of Backing`, /All-time volume/.test(T) && new RegExp(String(feed.volume.sales_count).replace(/(\d)(?=(\d{3})+$)/g, '$1,') + ' sales').test(T) && /Floor now/.test(T) && /Holders/.test(T) && !/Backing \/ NFT/.test(T) && !/Total backing/.test(T), T.slice(0, 400));
  ok('liondao analytics: floor by tier has a single "All" row (no Broken/Unbroken/Phoenix), the floor-history chart offers no Broken/Phoenix buttons, the supply bar says "DAO held" and has no "DAO broken"', /All/.test(T) && !/Unbroken \(base\)/.test(T) && !/Phoenix/.test(T) && !/Broken/.test(T) && /DAO held/.test(T) && !/DAO broken/.test(T), T.slice(0, 600));
  const adaoA = await bootExplorer(mainApp, null, false, true); const adaoA2 = await bootExplorer(app, 'adao', true, true);
  const stripLegend = (t) => String(t || '').replace(/Floor history[\s\S]*?LUNA price \(own scale\)/, 'FLOOR-HISTORY-CARD')   // 4.45: the floor-history card changed for both collections (p90 top edge, axis, legend, tooltips) — compared by its own check below
    .replace(/Top buyers[\s\S]*?Top sellers[\s\S]*?(?=Most-traded NFTs)/, 'LEADERBOARDS');   // 4.48: the leaderboards' trend column changed for both collections (whole-history monthly buy/sell bars) — checked by its own test below
  const fpOk = (t) => /p90 ask/.test(t || '') && /Floor history/.test(t || '');
  { const a = stripLegend(adaoA.analytics), b = stripLegend(adaoA2.analytics); let i = 0; while (i < a.length && a[i] === b[i]) i++; if (a !== b) console.log('  (adao analytics differs at char ' + i + ': main «' + a.slice(Math.max(0, i - 60), i + 80) + '» mine «' + b.slice(Math.max(0, i - 60), i + 80) + '»)'); }
  ok('adao analytics: the tab renders the same text as the committed page apart from the band legend (backing tiles, three tiers, DAO broken segment)', stripLegend(adaoA2.analytics) === stripLegend(adaoA.analytics) && /Backing \/ NFT/.test(adaoA2.analytics || '') && /Phoenix/.test(adaoA2.analytics || '') && fpOk(adaoA2.analytics), { main: (adaoA.analytics || '').slice(0, 200), mine: (adaoA2.analytics || '').slice(0, 200) });
  { const lbA = (adaoA2.analytics || '').match(/Top buyers[\s\S]*?(?=Most-traded NFTs)/), lbP = (T || '').match(/Top buyers[\s\S]*?(?=Most-traded NFTs)/);
    const bars = (t) => (t || '').match(/(\d+) bought · (\d+) sold · net [+-]?\d+/g) || [];
    ok('4.48 leaderboards: every top buyer/seller row on both collections carries a whole-history trade summary ("N bought · M sold · net ±K"), and none reads the old "/12m" 12-month figure', lbA && lbP && bars(lbA[0]).length >= 10 && bars(lbP[0]).length >= 10 && !/\/12m/.test(lbA[0]) && !/\/12m/.test(lbP[0]), { adao: bars(lbA && lbA[0]).length, pl: bars(lbP && lbP[0]).length }); }
} else console.log('  (analytics on PL skipped: STAGE_NFTC with pixel-lions/snapshots/nft-analytics.json not given — run stage-pl.js first)');
console.log(`  (liondao boots ${lion.n} records — E2 done on the page; E3 lights Pixel Lions (theme, logo, strip, analytics on the seeded products); until then tenants.json says liondao live:false and the header lists it only when selected)`);
ok('registry: liondao is LIVE (live:true) — the dropdown offers it on every page', tenants.tenants.liondao.live === true);
{ const h = await header(null, true); ok('header, no pref: the dropdown lists both live tenants (aDAO · Lion DAO)', h.on && JSON.stringify(h.opts) === JSON.stringify(['adao', 'liondao']), h.opts); }
console.log(`\n=== GATE explorer-tenant: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
