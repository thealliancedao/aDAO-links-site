#!/usr/bin/env node
// gate-index-activity.mjs — index.html on real fixtures (jsdom): the DAODAO tile subline on LOAD, and LIVE ACTIVITY 4.36 —
// episodes from nft-collections/<slug>/ledger/activity.json rendered through lib/live-activity.js: one row per act (price
// changes, folded restructures, bulk ids), three tiers, the class-aware deal filter, 24h/7d/30d, every collection on.
// Usage: TLA_CORE_DIR=<tla-core> NFTC_DIR=<nft-collections> node gate-index-activity.mjs [index.html]
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const CORE = process.env.TLA_CORE_DIR, NFTC = process.env.NFTC_DIR; if (!CORE || !NFTC) { console.error('TLA_CORE_DIR and NFTC_DIR required'); process.exit(1); }
const FILE = process.argv[2] || 'index.html';
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const html = fs.readFileSync(FILE, 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} };
w.SiteHeader = { mount() {}, init() {} }; w.eval(fs.readFileSync(path.join(path.dirname(FILE), 'lib/live-activity.js'), 'utf8'));   // the lib the page loads by <script src> (stripped above) w.PropAudit = {}; w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), CRONS: [] };
w.fetch = (u) => { const url = String(u).split('?')[0]; let f = null; if (url.startsWith(CORE_U)) f = path.join(CORE, url.slice(CORE_U.length)); else if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length));
  if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 12000));
const d = w.document;
// --- tile subline on load (no click) ---
const S = JSON.parse(fs.readFileSync(path.join(NFTC, 'adao/snapshots/summary.json')));
const released = S.minted_count - (S.treasury_held_count + S.enterprise_dao_broken_count + S.dao_wallet_8ywv_held_count);
const expected = `${((S.daodao_staked_count + S.enterprise_staked_count) / released * 100).toFixed(1)}% of released supply staked`;
const sub = (d.getElementById('daodao-staked-percentage') || {}).textContent || '';
ok('tile: "% of released supply staked" rendered on load without opening the modal = ' + expected, sub.trim() === expected, sub);
ok('tile: count rendered', /^[\d,]+$/.test((d.getElementById('daodao-staked') || {}).textContent.trim()), (d.getElementById('daodao-staked') || {}).textContent);
// --- Live Activity 4.36: episodes rendered, folded, classified ---
const LA = w.LiveActivity; ok('lib/live-activity.js loaded into the page', !!LA && !!LA.VERSION, LA && LA.VERSION);
const eps = w.__activityEpisodes || []; ok('episodes loaded from the three activity products', eps.length > 50 && new Set(eps.map(x => x.feed.slug)).size === 3, eps.length);
const feeds = w.__activityFeeds || []; ok('feeds come from tenants.json + the escrow: adao · pixel-lions · tla-locks', feeds.map(f => f.slug).join() === 'adao,pixel-lions,tla-locks', feeds.map(f => f.slug));
const list = d.getElementById('activity-list'); const rows = [...list.querySelectorAll('.la-row')];
ok('rows rendered (12 per page)', rows.length === 12, rows.length);
ok('the default view is All (every collection) with a 7d window and the deal filter on', (w.__activityView || 'all') === 'all' && w.__activityDays === 7 && !w.__activityShowAll);
ok('window chips 24h · 7d · 30d', ['24h', '7d', '30d'].every(t => d.getElementById('activity-window').textContent.includes(t)), d.getElementById('activity-window').textContent);
const cfg = w.__activityConfig; ok('thresholds config carries the live_activity block (deal filter 25 / 10)', cfg && cfg.live_activity && cfg.live_activity.deal_filter.own_tenant_over_floor_pct === 25 && cfg.live_activity.deal_filter.other_over_floor_pct === 10);
// 30d window, every row: the folded facts
ok('the Lock housekeeping chip is OFF by default (owner: "this really doesn\'t mean much")', !w.__activityKinds.has('housekeeping') && [...w.__activityKinds].length === LA.KIND_GROUPS.length - 1);
w.toggleActivityKind('housekeeping'); w.setActivityDays(30); w.__activityShown = 10000; w.renderActivityRows(true); const all30 = [...list.querySelectorAll('.la-row')];
const txt = (r) => r.textContent.replace(/\s+/g, ' ');
const restruct = all30.filter(r => /Restructured/.test(txt(r))); ok('lock restructures are folded rows ("Restructured N locks · merge, auto-max on") and quiet', restruct.length > 0 && restruct.every(r => r.classList.contains('la-quiet')), restruct.slice(0, 2).map(txt));
const lsasu = eps.filter(x => x.feed.slug === 'tla-locks' && x.ep.kind === 'lock_restructure' && x.ep.wallet && x.ep.wallet.startsWith('terra1lsasu5')).sort((a, b) => Date.parse(a.ep.ts) - Date.parse(b.ep.ts)); const gaps = lsasu.slice(1).map((x, i) => Date.parse(x.ep.ts) - Date.parse(lsasu[i].ep.ts_end)); ok('terra1lsasu5 (a wallet that restructures its locks around the clock): ' + lsasu.length + ' episodes in the window, never two inside one hour, rows folded (' + lsasu.reduce((s, x) => s + x.ep.count, 0) + ' rows)', lsasu.length >= 1 && gaps.every(g => g > 3600e3) && lsasu.some(x => x.ep.count >= 40), gaps.filter(g => g <= 3600e3));
const pc = all30.filter(r => /Price changed/.test(txt(r))); ok('same-owner delist+relist inside 24 h renders as ONE "Price changed a → b (±%)" row', pc.length >= 1 && /→/.test(txt(pc[0])), pc.slice(0, 2).map(txt));
const newVoter = all30.filter(r => /new to TLA voting/.test(txt(r))); ok('a wallet\'s first lock carries the "new to TLA voting" badge and is featured', newVoter.length >= 1 && newVoter.every(r => r.classList.contains('la-featured')), newVoter.slice(0, 1).map(txt));
const feat = all30.filter(r => r.classList.contains('la-featured')); ok('featured rows exist and glow (la-featured)', feat.length > 0, feat.length);
const bulk = eps.filter(x => x.ep.count > 1 && x.feed.kind === 'nft'); const bulkRow = all30.find(r => /\d+ NFTs/.test(txt(r)) && r.querySelector('.la-ids'));
ok('a bulk act renders as one row with its ids ("Sold 4 NFTs … #a #b")', !!bulkRow && bulkRow.querySelectorAll('.la-id').length >= 2, bulkRow && txt(bulkRow));
ok('no row says "#undefined", "#null" or "#?"', all30.every(r => !/#undefined|#null|#\?/.test(txt(r))), all30.filter(r => /#undefined|#null|#\?/.test(txt(r))).slice(0, 2).map(txt));
ok('every row has a tx link', all30.every(r => r.querySelector('a[href*="chainsco.pe/terra2/tx/"]')));
ok('no raw kind string leaks into a title (lock_merge, stake_enterprise…)', all30.every(r => !/\b(lock_merge|lock_permanent|stake_enterprise|unstake_enterprise|lock_create|price_change)\b/.test(txt(r.querySelector('.la-title')))));
// deal filter: hidden listings are over the threshold for their tenant; Show all reveals them
const ctx0 = { ownTenant: 'adao', config: cfg, showAll: false };
const hiddenEps = eps.filter(x => LA.classify(x.ep, x.feed, ctx0).hidden); const over = (x) => x.feed.tenant === 'adao' ? 25 : 10;
ok('deal filter: every hidden episode is a listing / price change more than its tenant\'s % over the class floor (25 aDAO / 10 others)', hiddenEps.every(x => (x.ep.kind === 'listing' || x.ep.kind === 'price_change') && x.ep.vs_floor_pct > over(x)), hiddenEps.slice(0, 3).map(x => [x.feed.slug, x.ep.kind, x.ep.vs_floor_pct]));
ok('deal filter: an under-floor listing is never hidden and is featured', eps.filter(x => (x.ep.flags || []).includes('under_floor')).every(x => { const c = LA.classify(x.ep, x.feed, ctx0); return !c.hidden && c.tier === 'featured'; }));
const before = list.querySelectorAll('.la-row').length; w.toggleActivityShowAll(); w.__activityShown = 10000; w.renderActivityRows(true); const after = list.querySelectorAll('.la-row').length;
ok('Show all reveals the hidden over-floor listings (rows ' + before + ' → ' + after + ')', after >= before && (hiddenEps.length === 0 || after > before), [before, after, hiddenEps.length]);
w.toggleActivityShowAll();
// legacy rows for the Alert Center
const items = w.__activityItems || []; ok('__activityItems (the Alert Center\'s per-token rows) still built from the aDAO episodes', items.length > 0 && items.every(i => i.col === 'adao' && i.kind && i.ts), items.slice(0, 1));
// expand
w.__activityShown = 12; w.setActivityDays(7); const row0 = list.querySelector('.la-row'); row0.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const det = list.querySelector('.la-details:not(.hidden)'); ok('clicking a row opens its details card (who · tokens · why this row · transactions)', !!det && /Transactions/.test(det.textContent), det && det.textContent.slice(0, 120));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
