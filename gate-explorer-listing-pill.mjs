#!/usr/bin/env node
// gate-explorer-listing-pill.mjs — every LISTED card carries a visible price pill (token amount + USD) on real fixtures.
// 4.33 (2026-09-17): + chain-only BBL listings badge "on-chain only · not on BBL's UI" in the pill. No chain-only auction
// exists on main today (#745 sold 09-14), so the fixture is STAGED: the cheapest BBL listing in nfts.json gets the cron's
// C.6 label (source chain_only) and the bundle row gets the listing_chain_only bit — exactly what C.6 writes.
// Usage: NFTC_DIR=<nft-collections> node gate-explorer-listing-pill.mjs   (run from the site dir)
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import os from 'os';
const NFTC_REAL = process.env.NFTC_DIR; if (!NFTC_REAL) { console.error('NFTC_DIR required'); process.exit(1); }
// --- stage the fixture (copy-on-write: only nfts.json + explorer-bundle.json are rewritten, the rest is symlinked) ---
const NFTC = fs.mkdtempSync(path.join(os.tmpdir(), 'nftc-chain-only-'));
fs.mkdirSync(path.join(NFTC, 'adao/snapshots'), { recursive: true });
for (const e of fs.readdirSync(path.join(NFTC_REAL, 'adao'))) if (e !== 'snapshots') fs.symlinkSync(path.join(NFTC_REAL, 'adao', e), path.join(NFTC, 'adao', e));
for (const e of fs.readdirSync(path.join(NFTC_REAL, 'adao/snapshots'))) if (!['nfts.json', 'explorer-bundle.json'].includes(e)) fs.symlinkSync(path.join(NFTC_REAL, 'adao/snapshots', e), path.join(NFTC, 'adao/snapshots', e));
const nftsDoc = JSON.parse(fs.readFileSync(path.join(NFTC_REAL, 'adao/snapshots/nfts.json')));
const bblListed = nftsDoc.records.filter(r => r.listing && r.listing.marketplace === 'BBL' && r.listing.price_usd != null);
const staged = bblListed.reduce((a, b) => (b.listing.price_usd < a.listing.price_usd ? b : a));
staged.listing.source = 'chain_only'; staged.listing.warlock_visible = false;
const STAGED_ID = String(staged.id);
fs.writeFileSync(path.join(NFTC, 'adao/snapshots/nfts.json'), JSON.stringify(nftsDoc));
const bundle = JSON.parse(fs.readFileSync(path.join(NFTC_REAL, 'adao/snapshots/explorer-bundle.json')));
const BIT = 8192; bundle.flagBits.listing_chain_only = BIT; const fi = bundle.fields.indexOf('flags');
for (const row of bundle.rows) if (String(row[0]) === STAGED_ID) row[fi] |= BIT;
fs.writeFileSync(path.join(NFTC, 'adao/snapshots/explorer-bundle.json'), JSON.stringify(bundle));
console.log(`staged: #${STAGED_ID} (cheapest BBL ask, $${staged.listing.price_usd}) labeled chain_only in nfts.json + bundle bit ${BIT}`);
const NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/', CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const css = fs.readFileSync('nft-explorer-style.css', 'utf8');
ok('css: .listing-price-pill is positioned inside the art (absolute, bottom, left)', /\.listing-price-pill\s*\{[^}]*position:\s*absolute[^}]*\}/.test(css) && /\.listing-price-pill\s*\{[^}]*bottom:[^}]*\}/.test(css));
ok('css: amount and USD lines have colour rules', /\.lp-amt\s*\{[^}]*color/.test(css) && /\.lp-usd\s*\{[^}]*color/.test(css));
ok('css: pill still hides with the eye (badges-hidden)', /\.badges-hidden \.listing-price-pill/.test(css));
ok('html: stylesheet + app cache-busted to 6.2, footer rev 4.33', fs.readFileSync('nft-explorer-index.html', 'utf8').includes('nft-explorer-style.css?v=6.2') && fs.readFileSync('nft-explorer-index.html', 'utf8').includes('nft-explorer-app.js?v=6.2') && /rev: '4\.33'/.test(fs.readFileSync('nft-explorer-index.html', 'utf8')));
ok('css: chain-only pill has its own ring + label line', /\.listing-price-pill\.chain-only\s*\{[^}]*border-color/.test(css) && /\.lp-chain\s*\{[^}]*color/.test(css));
let html = fs.readFileSync('nft-explorer-index.html', 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<script src="nft-explorer-app.js[^"]*" defer><\/script>/, '');
const stub = (w) => { w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }; w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.SiteHeader = { mount() {}, init() {}, subnav() {}, setActive() {} }; w.SiteFooter = { mount() {} }; w.AddressPicker = { mount() {}, init() {} }; w.CronRegistry = { fetchAll: async () => [], summarize: () => ({ counts: {}, overall: 'ok' }), CRONS: [] };
  w.fetch = (u) => { const url = String(u).split('?')[0]; let f = null; if (url.startsWith(NFTC_U)) f = path.join(NFTC, url.slice(NFTC_U.length)); else if (url.startsWith(CORE_U)) f = path.join(process.env.TLA_CORE_DIR || '/nonexistent', url.slice(CORE_U.length)); else if (url.startsWith('https://thealliancedao.com/')) f = path.join(process.cwd(), url.slice('https://thealliancedao.com/'.length)); else if (url.startsWith('/')) f = path.join(process.cwd(), url);
    if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404 ' + url)), text: () => Promise.resolve('') }); }; };
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/nft-explorer-index.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse: stub });
const w = dom.window;
w.eval(fs.readFileSync('nft-explorer-app.js', 'utf8'));   // the live app, evaluated in the page after parse (a <script> inline trips on '</script>' inside its strings)
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 15000));
const d = w.document;
// switch on the Listed filter the way the UI does, then read the cards
const listedToggle = d.querySelector('.status-toggle-cb[data-key="listed"]');
if (listedToggle) { listedToggle.checked = true; listedToggle.dispatchEvent(new w.Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 3000)); }
// price low→high so the staged (cheapest BBL ask) card sits on page 1 of the paginated listed view
const sortSel = d.getElementById('sort-rank'); if (sortSel) { sortSel.value = 'price-asc'; sortSel.dispatchEvent(new w.Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 2000)); }
const cards = [...d.querySelectorAll('.nft-card')]; const pills = cards.map(c => c.querySelector('.listing-price-pill')).filter(Boolean);
const S = JSON.parse(fs.readFileSync(path.join(NFTC, 'adao/snapshots/summary.json'))); const listedN = (S.bbl_listed_count || 0) + (S.atrium_listed_count || 0) + (S.boost_listed_count || 0);
ok(`listed view rendered cards (${cards.length}; summary lists ${listedN})`, cards.length > 0 && cards.length <= listedN + 5, cards.length);
ok('every rendered listed card carries a price pill', cards.length > 0 && pills.length === cards.length, `${pills.length}/${cards.length}`);
const texts = pills.map(p => p.textContent.trim());
ok('pill headline is a token amount with its symbol (e.g. "56,000 bLUNA"), USD beside it', texts.length > 0 && texts.every(t => /[\d,.]+ (bLUNA|LUNA|SOLID|USDC|ampLUNA|CAPA)/.test(t) && /\$[\d,.]+/.test(t)), texts.slice(0, 4));
ok('no pill reads "No price set" for a listing that has a price', !texts.some(t => /No price set/.test(t)), texts.filter(t => /No price/.test(t)).length);
// --- chain-only badge: exactly the staged card, label verbatim, everyone else clean ---
const LABEL = "on-chain only · not on BBL's UI";
const byId = new Map(cards.map(c => [String((c.textContent.match(/aDAO #(\d+)/) || [])[1]), c]));   // card title "aDAO #NNNN"
const stagedCard = byId.get(STAGED_ID);
const badged = cards.filter(c => c.querySelector('.listing-price-pill .lp-chain'));
ok(`chain-only: the staged card #${STAGED_ID} is rendered in the listed view`, !!stagedCard, [...byId.keys()].slice(0, 5));
ok('chain-only: its pill carries the badge line, verbatim, and the chain-only ring class', stagedCard && stagedCard.querySelector('.listing-price-pill.chain-only .lp-chain') && stagedCard.querySelector('.lp-chain').textContent === LABEL, stagedCard && stagedCard.querySelector('.listing-price-pill') && stagedCard.querySelector('.listing-price-pill').textContent);
ok('chain-only: its price is still shown as a normal ask (token amount + USD) — the badge adds, never replaces', stagedCard && /[\d,.]+ bLUNA/.test(stagedCard.querySelector('.listing-price-pill').textContent) && /\$[\d,.]+/.test(stagedCard.querySelector('.listing-price-pill').textContent));
ok('chain-only: the pill title names the contract as the venue, not BBL\'s page', stagedCard && /contract/.test(stagedCard.querySelector('.listing-price-pill').title) && stagedCard.querySelector('.listing-price-pill').title.includes(LABEL), stagedCard && stagedCard.querySelector('.listing-price-pill').title);
ok('chain-only: no other listed card carries the badge (label = the cron\'s source field, nothing inferred)', badged.length === 1 && badged[0] === stagedCard, badged.length);
fs.rmSync(NFTC, { recursive: true, force: true });
console.log(`\n=== GATE explorer-listing-pill: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
