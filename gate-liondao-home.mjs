#!/usr/bin/env node
// gate-liondao-home.mjs — liondao/index.html on real fixtures (jsdom): the tenant home renders from liondao/home.json through
// lib/home-tiles.js — every number traced to its product (participants, nft-collections/pixel-lions, network-and-prices,
// dao-dashboard, the NEW tenants.json roster), every number with no source rendered as an Unknown chip (never 0, never a
// guess), listings/top sales from the real bundle + sales-enriched, the live feed through lib/live-activity.js with Lion DAO
// as the own tenant, and site-header 1.12.0's home routing (logo → /liondao/, both allies in the dropdown).
// Pass 2 runs HomeTiles.derive() with LCD/CoinGecko SHAPE fixtures (cosmos-sdk / cw20 / CoinGecko schemas with marked
// values) to prove the arithmetic the live reads feed: validator rank, staked %, unclaimed sums, the known-parts total.
// Usage: TLA_CORE_DIR=<tla-core> NFTC_DIR=<nft-collections> node gate-liondao-home.mjs [liondao/index.html]
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const CORE = process.env.TLA_CORE_DIR, NFTC = process.env.NFTC_DIR; if (!CORE || !NFTC) { console.error('TLA_CORE_DIR and NFTC_DIR required'); process.exit(1); }
const FILE = process.argv[2] || 'liondao/index.html'; const SITE = path.resolve(path.dirname(FILE), '..');
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const html = fs.readFileSync(FILE, 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
const fetched = [];
const files = (u) => { const url = String(u).split('?')[0]; if (url.startsWith(CORE_U)) return path.join(CORE, url.slice(CORE_U.length)); if (url.startsWith(NFTC_U)) return path.join(NFTC, url.slice(NFTC_U.length)); if (url.startsWith('https://thealliancedao.com/')) return path.join(SITE, url.slice('https://thealliancedao.com/'.length)); if (url.startsWith('/')) return path.join(SITE, url.slice(1)); return null; };
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/liondao/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(win) {
  win.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); win.scrollTo = () => {}; win.requestAnimationFrame = (f) => setTimeout(f, 0); win.requestIdleCallback = (f) => setTimeout(f, 10);
  win.Element.prototype.scrollIntoView = function () {};
  win.fetch = (u) => { fetched.push(String(u)); const f = files(u); if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); } return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
  // the libs the page loads by <script src> (stripped above), the REAL ones from this tree, present before the page's inline scripts run
  for (const lib of ['lib/collection-context.js', 'lib/site-header.js', 'lib/cron-registry.js', 'lib/denoms.js', 'lib/live-activity.js', 'lib/home-tiles.js', 'lib/site-footer.js']) win.eval(fs.readFileSync(path.join(SITE, lib), 'utf8'));
} });
const w = dom.window;
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
await new Promise(r => setTimeout(r, 6000));
const d = w.document; const T = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const tenants = J(path.join(CORE, 'docs/curated/tenants.json')); const LD = tenants.tenants.liondao;
const sum = (a) => a.reduce((t, v) => t + (typeof v === 'number' && isFinite(v) ? v : 0), 0);
const usd = (v) => w.HomeTiles.fmt.usd(v);

console.log('— registry (tenants.json roster)');
ok('liondao.wallets carries the four roster wallets with roles', LD.wallets && Object.keys(LD.wallets).length === 4 && Object.values(LD.wallets).every(x => x.role && x.counts_as && x.label), LD.wallets && Object.keys(LD.wallets));
ok('the pixeLions DAO treasury is NOT a Lion DAO wallet (owner: a Pixel Lions position)', !Object.keys(LD.wallets || {}).includes('terra1c690mdrwdetnr09zfk3tf9xz9jhrgd9wpjyf3tuccj74ql09eqmq6sh7en'));
ok('validator operator + account + home registered', LD.validator && LD.validator.operator.startsWith('terravaloper1pet430t') && LD.validator.account.startsWith('terra1pet430t') && LD.home === '/liondao/');
ok('staking block names ROAR, the staking module, the ROAR distributor and an UNKNOWN pixeLions distributor', LD.staking && LD.staking.roar_cw20 && LD.staking.roar_staking && LD.staking.roar_rewards_distributor && LD.staking.pl_rewards_distributor === null);

console.log('— shell + header');
ok('page mounted the engine (home-tiles ' + (w.HomeTiles && w.HomeTiles.VERSION) + ')', !!d.querySelector('.ht') && w.HomeTiles.VERSION === '1.1.0');
ok('<html data-tenant="liondao">', d.documentElement.getAttribute('data-tenant') === 'liondao');
const logo = d.querySelector('.sh-logo'); ok('header logo links to the Lion DAO home (1.12.0 homeOf)', logo && logo.getAttribute('href') === '/liondao/', logo && logo.getAttribute('href'));
const selEl = d.querySelector('.sh-tenant'); ok('tenant dropdown lists both allies with Lion DAO selected', selEl && selEl.classList.contains('sh-on') && [...selEl.options].map(o => o.value).join() === 'adao,liondao' && selEl.value === 'liondao', selEl && [...selEl.options].map(o => o.value));
ok('base href="/" so the shared header tabs resolve from the root', !!fs.readFileSync(FILE, 'utf8').match(/<base href="\/">/));
ok('theme knobs come from the registry (accent = tenants.json liondao.theme.accent)', d.documentElement.style.getPropertyValue('--t-accent').trim() === LD.theme.accent, d.documentElement.style.getPropertyValue('--t-accent'));
ok('no hand-written ally literals in the engine (no terra1 address, no "Lion DAO", no ROAR symbol in lib/home-tiles.js)', !/terra1[a-z0-9]{20,}|Lion DAO|pixeLion|'ROAR'/.test(fs.readFileSync(path.join(SITE, 'lib/home-tiles.js'), 'utf8')));

console.log('— hero');
const nap = J(path.join(CORE, 'network-and-prices/current.json')); const roar = nap.token_prices.ROAR.final_price_usd;
const hero = d.querySelector('.ht-hero'); ok('hero: "The pride" + LFR badge + both mane bands', hero && T(hero).startsWith('The pride') && T(hero.querySelector('.ht-lfr')) === 'LFR' && hero.querySelectorAll('.ht-mane').length === 2, T(hero).slice(0, 80));
ok('hero status carries the ROAR price from network-and-prices (' + w.HomeTiles.fmt.price(roar) + ')', T(hero).includes(w.HomeTiles.fmt.price(roar)), T(hero.querySelector('.ht-hero-s')));
ok('hero status: validator rank is Unknown in this run (LCD not reachable in the gate) — never a number', hero.querySelector('.ht-hero-s').querySelectorAll('.ht-unk').length >= 2);

console.log('— nav tiles');
const nav = d.querySelectorAll('.ht-nav .ht-tile'); ok('9 nav tiles in the config order (ecosystem tall first, contracts last)', nav.length === 9 && T(nav[0]).startsWith('Lion DAO ecosystem') && nav[0].classList.contains('ht-tall') && T(nav[8]).startsWith('Contracts'), [...nav].map(x => T(x).slice(0, 22)));
ok('v2.1: supply map and lore open coming.html?tile=<id> (slots with a name) and read muted; rarity, mint and alliance are real pages, not muted', [1, 2].every(i => /coming\.html\?tile=/.test(nav[i].getAttribute('onclick')) && nav[i].classList.contains('ht-soon')) && [3, 4, 6].every(i => !/coming\.html/.test(nav[i].getAttribute('onclick')) && !nav[i].classList.contains('ht-soon')), [1, 2, 3, 4, 6].map(i => nav[i].getAttribute('onclick')));
ok('v2: the ecosystem tile opens liondao/ecosystem.html; no sheet exists on the page', /ecosystem\.html/.test(nav[0].getAttribute('onclick')) && !d.querySelector('.ht-sheet'));
ok('v2: the DAO links menu carries the treasury, TLA, unclaimed and validator pages', ['dao_treasury', 'dao_tla_deposits', 'dao_unclaimed', 'validator'].every(p => d.querySelector('.ht-menu a[href="/liondao/' + p + '.html"]')));

console.log('— supply bars (pixeLions from summary.json)');
const S = J(path.join(NFTC, 'pixel-lions/snapshots/summary.json'));
const bars = d.querySelectorAll('.ht-sec .ht-bar'); ok('two bars: ROAR and pixeLions', bars.length === 2);
const plLeg = T(bars[1].nextElementSibling);
ok(`pixeLions legend: staked in the DAO ${S.daodao_staked_count} · Enterprise ${S.enterprise_staked_count} · listed ${S.bbl_listed_count + S.atrium_listed_count + S.boost_listed_count} · liquid ${S.user_liquid_count} · DAO held ${S.dao_held_count}`,
  plLeg.includes('Staked in the DAO ' + S.daodao_staked_count.toLocaleString()) && plLeg.includes('Staked in Enterprise ' + S.enterprise_staked_count) && plLeg.includes('Listed ' + (S.bbl_listed_count + S.atrium_listed_count + S.boost_listed_count)) && plLeg.includes('Held liquid ' + S.user_liquid_count.toLocaleString()) && plLeg.includes('DAO held ' + S.dao_held_count), plLeg);
ok('ROAR bar: total, staked, treasury and burned are Unknown in this run (chain reads blocked) — the bar is empty, not fake', T(bars[0].parentElement).split('Unknown').length - 1 >= 4 && bars[0].querySelectorAll('span[title]:not([title="unattributed / unknown"])').length === 0, T(bars[0].parentElement));

console.log('— unclaimed rewards (participants over the roster)');
const P = J(path.join(CORE, 'member-data/participants/current.json')); const byW = Object.fromEntries(P.members.map(m => [m.wallet, m]));
const roster = Object.keys(LD.wallets); const pend = roster.map(a => byW[a]).filter(Boolean).map(m => sum([m.summary.total_pending_rewards_usd, m.summary.total_pending_bribes_usd, m.pending_rebase && m.pending_rebase.usd_value]));
const rewTiles = [...d.querySelectorAll('.ht-sec')].find(s => T(s).startsWith('Unclaimed rewards')).querySelectorAll('.ht-tile');
ok(`TLA group = Σ pending over roster wallets in participants (${pend.length} wallets) = ${usd(sum(pend))}`, T(rewTiles[0].querySelector('.ht-v')) === usd(sum(pend)), T(rewTiles[0]));
ok('Validator group Unknown (LCD blocked) · pixeLions rewards Unknown (distributor not found)', rewTiles[1].querySelector('.ht-v .ht-unk') && rewTiles[2].querySelector('.ht-v .ht-unk') && T(rewTiles[2]).includes('distributor'));

console.log('— Lion DAO row');
const rows = [...d.querySelectorAll('.ht-sec')].filter(s => s.querySelector('.ht-total') || T(s).startsWith('Burning Lions'));
const ldTiles = rows[0].querySelectorAll('.ht-tile:not(.ht-total)');
const tla = roster.map(a => byW[a]).filter(Boolean); const tlaTot = sum(tla.map(m => m.summary.total_lp_position_usd)) + sum(tla.map(m => m.summary.total_locked_usd));
ok(`TLA positions tile = Σ LP + locked over the roster = ${usd(tlaTot)}`, T(ldTiles[1].querySelector('.ht-v')) === usd(tlaTot), T(ldTiles[1]));
ok('Treasury ROAR + validator tiles Unknown (chain), ROAR price tile = network-and-prices', ldTiles[0].querySelector('.ht-v .ht-unk') && ldTiles[2].querySelector('.ht-v .ht-unk') && T(ldTiles[3].querySelector('.ht-v')) === w.HomeTiles.fmt.price(roar), [T(ldTiles[0]), T(ldTiles[3])]);
const tot = rows[0].querySelector('.ht-total'); ok('total strip: known parts only, remainder labeled (never a total that pretends)', T(tot).includes('known parts only') && T(tot.querySelector('.ht-tsum')) === usd(tlaTot), T(tot));

console.log('— pixeLions row');
const FH = J(path.join(NFTC, 'pixel-lions/snapshots/floor-history.json')); const fl = FH.rows[FH.rows.length - 1].per_tier.base;
const plTiles = rows[1].querySelectorAll('.ht-tile:not(.ht-total)');
ok(`staked in the DAO = ${S.daodao_staked_count} with the staked-% subline`, T(plTiles[0].querySelector('.ht-v')) === S.daodao_staked_count.toLocaleString() && T(plTiles[0]).includes(((S.daodao_staked_count + S.enterprise_staked_count) / S.total_tokens * 100).toFixed(1) + '% of supply'), T(plTiles[0]));
ok(`the pride = ${S.unique_holders} holders · ${S.dao_members_count} DAO members`, T(plTiles[1].querySelector('.ht-v')) === S.unique_holders.toLocaleString() && T(plTiles[1]).includes(S.dao_members_count + ' DAO members'), T(plTiles[1]));
ok(`floor = floor-history base listing floor ${usd(fl.listing_floor_usd)}`, T(plTiles[2].querySelector('.ht-v')) === usd(fl.listing_floor_usd), T(plTiles[2]));
const aprT = T(plTiles[3]); const perNft = 5e9 / S.daodao_staked_count;
ok('staking APR is Unknown; the would-be arithmetic (5B ÷ staked) is shown as arithmetic and marked unverified', plTiles[3].querySelector('.ht-v .ht-unk') && aprT.includes(w.HomeTiles.fmt.big(perNft) + ' ROAR per lion') && aprT.includes('Unverified'), aprT);

console.log('— Burning Lions row');
ok('Burning Lions: supply and top burner Unknown with their reasons (not onboarded / pyROAR ledger not read)', rows[2].querySelectorAll('.ht-tile')[0].querySelector('.ht-v .ht-unk') && rows[2].querySelectorAll('.ht-tile')[2].querySelector('.ht-v .ht-unk') && T(rows[2]).includes('not onboarded'), T(rows[2]).slice(0, 200));

console.log('— burn + ROAR20 (registry facts, source-labeled)');
ok('Burning Lions row: festival burn = reported community + DAO (' + w.HomeTiles.fmt.big(LD.burn.reported.community_burned + LD.burn.reported.dao_burned) + ') labeled as Lion DAO\'s, with the measured figure Unknown', T(rows[2]).includes(w.HomeTiles.fmt.big(LD.burn.reported.community_burned + LD.burn.reported.dao_burned)) && T(rows[2]).includes('reported by Lion DAO') && T(rows[2]).includes('gone from supply on chain: Unknown'), T(rows[2]).slice(0, 300));
ok('ROAR20 tile Unknown here (DexScreener not reachable in the gate) and labeled DexScreener', [...rows[2].querySelectorAll('.ht-tile')].some(t => T(t).startsWith('ROAR20') && t.querySelector('.ht-v .ht-unk') && T(t).includes('DexScreener')));
const ds = w.HomeTiles.derive(Object.assign({}, w.HomeTiles._M.S, { dexscreener: { pairs: [{ dexId: 'raydium', priceUsd: '0.000012', marketCap: 12000, fdv: 12000, volume: { h24: 345 }, liquidity: { usd: 2000 }, priceChange: { h24: -3.2 }, url: 'https://dexscreener.com/solana/x' }, { dexId: 'pumpswap', priceUsd: '0.000011', liquidity: { usd: 9000 }, volume: { h24: 10 }, priceChange: { h24: 1 } }] } }), w.HomeTiles._M.cfg, w.HomeTiles._M.ctx).roar20;
ok('derive: ROAR20 takes the most liquid DexScreener pair (pumpswap $9k over raydium $2k), numbers as theirs', ds.dex === 'pumpswap' && ds.price_usd === 0.000011 && ds.liquidity_usd === 9000 && ds.source === 'DexScreener' && ds.chain === 'solana');

console.log('— marketplaces');
const bl = nap.token_prices.bLUNA.final_price_usd; const bblMin = S.marketplaces.bbl.by_token.bLUNA.min;
const mk = [...d.querySelectorAll('.ht-sec')].find(s => T(s).startsWith('Marketplaces')); const venue = mk.querySelectorAll('.ht-grid')[0].querySelectorAll('.ht-tile');
ok(`BBL floor = min bLUNA listing × bLUNA price = ${usd(bblMin * bl)} (${bblMin} bLUNA)`, T(venue[0].querySelector('.ht-v')) === usd(bblMin * bl) && T(venue[0]).includes(bblMin + ' bLUNA'), T(venue[0]));
const AN = J(path.join(NFTC, 'pixel-lions/snapshots/nft-analytics.json'));
ok(`all-time volume = nft-analytics usd_at_sale ${usd(AN.volume.usd_at_sale)} with value-today + count subline`, T(venue[3].querySelector('.ht-v')) === usd(AN.volume.usd_at_sale) && T(venue[3]).includes(usd(AN.volume.value_today_usd)) && T(venue[3]).includes(AN.volume.sales_count.toLocaleString() + ' sales'), T(venue[3]));
const B = J(path.join(NFTC, 'pixel-lions/snapshots/explorer-bundle.json')); const li = B.fields.indexOf('listing_usd'); const listed = B.rows.filter(r => typeof r[li] === 'number');
const listEl = d.getElementById('ht-list'); const lrows = [...listEl.querySelectorAll('.ht-row')];
ok(`listings from the bundle: ${listed.length} priced, 12 shown low → high`, T(d.getElementById('ht-list-count')).startsWith(listed.length + ' listed') && lrows.length === 12 && T(lrows[0].querySelector('.ht-rv')) === usd(Math.min(...listed.map(r => r[li]))), [T(d.getElementById('ht-list-count')), lrows.length]);
ok('listing rows link into the explorer with the tenant kept', lrows[0].getAttribute('href').startsWith('/nft-explorer-index.html?tenant=liondao&search='), lrows[0].getAttribute('href'));
w.HomeTiles.setList('sort', 'desc'); ok('High → low re-sorts', T(d.querySelector('#ht-list .ht-row .ht-rv')) === usd(Math.max(...listed.map(r => r[li]))));
w.HomeTiles.setList('class', 'rank1'); const r1 = listed.filter(r => r[B.fields.indexOf('intended_rank')] === 1).length; ok(`class "1 of 1" (rank 1) filter → ${r1} rows`, d.querySelectorAll('#ht-list .ht-row').length === r1 || (r1 === 0 && T(listEl).includes('Nothing listed')), d.querySelectorAll('#ht-list .ht-row').length);
ok('the Burning Lions class chip is disabled with its reason', [...d.querySelectorAll('#ht-list-ctl .ht-tab')].some(b => T(b) === 'Burning Lions' && b.disabled));
await new Promise(r => setTimeout(r, 3000));
const SE = J(path.join(NFTC, 'pixel-lions/snapshots/sales-enriched.json')); const top = SE.sales.filter(s => typeof s.notional_usd === 'number').sort((a, b) => b.notional_usd - a.notional_usd)[0];
const srows = [...d.querySelectorAll('#ht-sales .ht-row')]; ok(`top all-time sale = #${top.token_id} ${usd(top.notional_usd)} (USD at sale) with "now" beside it`, srows.length === 8 && T(srows[0]).includes('#' + top.token_id) && T(srows[0].querySelector('.ht-rv')).startsWith(usd(top.notional_usd)) && T(srows[0]).includes('now '), srows[0] && T(srows[0]));
ok('sales-enriched was loaded lazily, after first paint', fetched.findIndex(u => u.includes('sales-enriched')) > fetched.findIndex(u => u.includes('explorer-bundle')));
const la = d.getElementById('ht-act'); const larows = la.querySelectorAll('.la-row');
ok('live activity renders through lib/live-activity.js (rows = what the ledger holds in the window, own tenant = liondao, deal filter on)', larows.length > 0 && larows.length <= 12 && !w.HomeTiles._state.actShowAll && T(d.getElementById('ht-act-ctl')).includes('Deal filter on'), [larows.length, T(d.getElementById('ht-act-count'))]);
ok('activity chips: 24h · 7d · 30d and every collection + TLA Locks', ['24h', '7d', '30d', 'aDAO', 'Lion DAO', 'TLA Locks'].every(t => T(d.getElementById('ht-act-ctl')).includes(t)), T(d.getElementById('ht-act-ctl')));

console.log('— mint / alliance / rarity tiles → pages (v2.1: no sheets; the home never fetches the mint ledger)');
ok('the Mint history tile opens /liondao/mint.html and the Alliance tile /liondao/alliance.html; neither is muted', [...nav].some(t => T(t).startsWith('Mint history') && /\/liondao\/mint\.html/.test(t.getAttribute('onclick')) && !t.classList.contains('ht-soon')) && [...nav].some(t => T(t).startsWith('Alliance with aDAO') && /\/liondao\/alliance\.html/.test(t.getAttribute('onclick')) && !t.classList.contains('ht-soon')), [...nav].map(t => T(t).slice(0, 20) + '→' + (t.getAttribute('onclick') || '').slice(14, 50)));
ok('the Rarity tile opens the explorer for this tenant (rank + traits per lion live there); Lore and the supply map stay muted slots', [...nav].some(t => T(t).startsWith('Rarity') && /nft-explorer-index\.html\?tenant=liondao/.test(t.getAttribute('onclick')) && !t.classList.contains('ht-soon')) && [...nav].filter(t => t.classList.contains('ht-soon')).length === 2);
ok('the home does not fetch primary-sales.json (the mint page does) and has no sheet element', !fetched.some(u => u.includes('primary-sales.json')) && !d.querySelector('.ht-sheet'));

console.log('— derive() on LCD / CoinGecko SHAPE fixtures (the live reads\' arithmetic)');
const ctx = w.HomeTiles._M.ctx; const cfg = w.HomeTiles._M.cfg; const S0 = w.HomeTiles._M.S;
const val = LD.validator.operator; const rosterA = Object.keys(LD.wallets); const treasury = rosterA.find(a => LD.wallets[a].counts_as === 'treasury');
const shape = Object.assign({}, S0, {
  lcd_token_info: { name: 'x', symbol: 'x', decimals: 6, total_supply: '1000000000000000000' },     // 1T
  lcd_minter: { minter: 'terra1x', cap: null }, lcd_staked: { total: '100000000000000000' },        // 100B staked
  lcd_treasury_roar: { balance: '300000000000000000' },                                              // 300B in the treasury
  lcd_treasury_bank: { balances: [{ denom: 'uluna', amount: '13000000' }] },
  lcd_validators: [{ operator_address: 'terravaloper1a', tokens: '9000000000000', description: { moniker: 'A' }, commission: { commission_rates: { rate: '0.05' } } }, { operator_address: val, tokens: '8000000000000', description: { moniker: 'Lion' }, commission: { commission_rates: { rate: '0.1' } }, jailed: false }, { operator_address: 'terravaloper1c', tokens: '1000000000000', description: { moniker: 'C' }, commission: { commission_rates: { rate: '0.05' } } }],
  lcd_val_delegations: { delegation_responses: [], pagination: { total: '321' } },
  lcd_val_commission: { commission: { commission: [{ denom: 'uluna', amount: '2000000000.5' }] } },   // 2,000 LUNA
  lcd_rewards_validator_account: { total: [{ denom: 'uluna', amount: '1000000000' }] },              // 1,000 LUNA
  coingecko: { market_cap_rank: 4521, last_updated: '2026-09-21T00:00:00Z', market_data: { circulating_supply: 9e11, market_cap: { usd: 300000 }, fully_diluted_valuation: { usd: 320000 }, total_volume: { usd: 1234 } } },
});
rosterA.forEach(a => { shape['lcd_deleg_' + a] = { delegation_responses: a === treasury ? [{ delegation: { validator_address: val }, balance: { denom: 'uluna', amount: '10000000000' } }] : [] }; shape['lcd_rewards_' + a] = { total: a === treasury ? [{ denom: 'uluna', amount: '500000000.25' }] : [] }; });
const D = w.HomeTiles.derive(shape, cfg, ctx); const luna = nap.token_prices.LUNA.final_price_usd;
ok('validator rank #2 of 3 by bonded tokens, commission 10%, 321 delegators, voting share 44.4%', D.validator.rank === 2 && D.validator.of === 3 && D.validator.commission_rate_pct === 10 && D.validator.delegators === 321 && Math.abs(D.validator.voting_share_pct - 44.444) < 0.01, D.validator);
ok('ROAR: total 1T, staked 100B = 10%, treasury 300B = 30%, no max (cap null → note), FDV ours = supply × TLA price', D.roar.total_supply === 1e12 && D.roar.staked_daodao === 1e11 && D.roar.staked_pct === 10 && D.roar.treasury_pct === 30 && D.roar.max_supply === null && D.roar.max_supply_note && Math.abs(D.roar.fdv_ours - 1e12 * roar) < 1e-6, D.roar);
ok('CoinGecko rows carried as theirs (rank 4521, mcap, fdv, volume) and separate from ours', D.roar.cg_rank === 4521 && D.roar.market_cap_cg === 300000 && D.roar.fdv_cg === 320000 && D.roar.volume_24h_cg === 1234);
ok('unclaimed validator = commission 2,000 + delegation rewards 500 + validator-account rewards 1,000 = 3,500 LUNA, priced at LUNA', Math.abs(D.unclaimed.validator_luna - 3500) < 1e-6 && Math.abs(D.unclaimed.validator_usd - 3500 * luna) < 1e-6, D.unclaimed);
ok('treasury wallet delegates 10,000 LUNA to its own validator (marked)', D.wallets[treasury].delegated_to_own_validator_luna === 10000 && D.delegations.luna === 10000);
const known = D.treasury.roar_usd + D.treasury.luna_usd + D.tla.total_usd + D.delegations.luna_usd;
ok('total = known parts (treasury ROAR + treasury LUNA + TLA + delegated) with the compounder/Credia/Votion part still null', Math.abs(D.total.known_usd - known) < 1e-6 && D.total.parts.some(p => p.usd === null && p.note === 'positions cron'), D.total);
ok('burn: pyROAR registered; supply delta = 1T − live supply (1T fixture → 0 here; 893.21B live → 106.79B), reported − delta published', D.burn.pyroar_cw20 === 'terra1pez3qw6pa24a06wee404yy5mp37j57n3s9zjkdfjeapwqf78dntql0ngsy' && D.burn.initial_supply === 1e12 && D.burn.supply_delta === 0 && D.burn.reported_vs_delta === 1.17e11 && w.HomeTiles.derive(Object.assign({}, shape, { lcd_token_info: { decimals: 6, total_supply: '893210193781610000' } }), w.HomeTiles._M.cfg, w.HomeTiles._M.ctx).burn.supply_delta.toFixed(0) === '106789806218', D.burn);
ok('with no LCD (pass 1) every chain-fed number was null, never 0', w.HomeTiles._M.D.roar.total_supply === null && w.HomeTiles._M.D.validator.rank === null && w.HomeTiles._M.D.unclaimed.validator_usd === null && w.HomeTiles._M.D.treasury.roar === null);

console.log('— site-header 1.12.0 (source)');
const SH = fs.readFileSync(path.join(SITE, 'lib/site-header.js'), 'utf8');
ok('homeOf(): tenants.json `home`, else /<slug>/, the default → /', /function homeOf\(ctx, slug\).*tt\.home \|\| \(tt\.default \? '\/' : '\/' \+ slug \+ '\/'\)/.test(SH));
ok('on a home page the dropdown navigates to the chosen ally\'s home (default takes ?tenant=)', /if \(pageHome\) \{ var dest = homeOf\(ctx, s\)/.test(SH) && SH.includes("'tenant=' + encodeURIComponent(s)"));
ok('a home page opened under a different selected ally redirects to that ally\'s home; index.html counts as the default ally\'s', SH.includes("opts.page === 'index' ?") && SH.includes('root.location.replace(homeOf(ctx, t.slug))'));
ok('vercel.json: /liondao lands on /liondao/index.html', J(path.join(SITE, 'vercel.json')).rewrites.some(r => r.source === '/liondao' && r.destination === '/liondao/index.html'));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
