#!/usr/bin/env node
// gate-liondao-pages.mjs — the Lion DAO pages (liondao/dao_treasury.html, dao_tla_deposits.html, dao_unclaimed.html, validator.html,
// ecosystem.html, coming.html) + the home v2 on REAL fixtures (jsdom): the positions product (dao-originations current.json +
// two archived days + the daily series), tenants.json, network-and-prices, the PL summary. Every assertion names a specific value
// in a specific cell (never "some % renders"): the hero equals the roll-up, Ryan's LUNA-USDT row equals the engine's figure,
// receipts are labeled and unpriced, the reconciliation shows the section split, What Changed reads two days, the trend reads the
// series, the validator page derives the alliance module account and marks aDAO's 10k, home v2 tiles link to pages (no sheets).
// Usage: TLA_CORE_DIR=<tla-core> NFTC_DIR=<nft-collections> DAOO_DIR=<dao-originations> node gate-liondao-pages.mjs
import { JSDOM, VirtualConsole } from 'jsdom'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import nodeCrypto from 'crypto'; import { TextEncoder } from 'util';
const CORE = process.env.TLA_CORE_DIR, NFTC = process.env.NFTC_DIR, DAOO = process.env.DAOO_DIR; if (!CORE || !NFTC || !DAOO) { console.error('TLA_CORE_DIR, NFTC_DIR and DAOO_DIR required'); process.exit(1); }
const SITE = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const CORE_U = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC_U = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/', DAOO_U = 'https://raw.githubusercontent.com/thealliancedao/dao-originations/main/';
let pass = 0, fail = 0; const ok = (m, c, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const cur = J(path.join(DAOO, 'lion-dao/positions/current.json')); const tenants = J(path.join(CORE, 'docs/curated/tenants.json')); const LDT = tenants.tenants.liondao;
const ryanA = Object.keys(LDT.wallets).find(a => /Ryan/.test(LDT.wallets[a].label)); const ryan = cur.wallets[ryanA]; const R = cur.rollup.dao;
const fmtUsd = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + '$' + (a >= 1e6 ? (a / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M' : a.toLocaleString(undefined, { maximumFractionDigits: a >= 1000 ? 0 : 2 })); };
const fmtUsdFull = (v) => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

// LCD shape fixtures for the validator page (cosmos-sdk schemas, marked values)
const OP = LDT.validator.operator; const ADAO_T = 'terra1sffd4efk2jpdt894r04qwmtjqrrjfc52tmj6vkzjxqhd8qqu2drs3m5vzm';
const VALS = [{ operator_address: 'terravaloper1big', tokens: '50000000000000', description: { moniker: 'Big' }, commission: { commission_rates: { rate: '0.05', max_rate: '0.2', max_change_rate: '0.01' } } }, { operator_address: OP, tokens: '8411303000000', jailed: false, description: { moniker: '🦁 The Lion DAO' }, commission: { commission_rates: { rate: '0.075', max_rate: '0.1', max_change_rate: '0.01' } } }, { operator_address: 'terravaloper1small', tokens: '1000000000000', description: { moniker: 'Small' }, commission: { commission_rates: { rate: '0.1', max_rate: '0.2', max_change_rate: '0.01' } } }];
const files = (u) => { const url = String(u).split('?')[0]; if (url.startsWith(CORE_U)) return path.join(CORE, url.slice(CORE_U.length)); if (url.startsWith(NFTC_U)) return path.join(NFTC, url.slice(NFTC_U.length)); if (url.startsWith(DAOO_U)) return path.join(DAOO, url.slice(DAOO_U.length)); if (url.startsWith('https://thealliancedao.com/')) return path.join(SITE, url.slice('https://thealliancedao.com/'.length)); return null; };
let allianceModule = null;
async function run(file, pageUrl, extra) {
  const html = fs.readFileSync(path.join(SITE, file), 'utf8').replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
  const fetched = []; const navs = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (/navigation/.test(String(e && e.message))) navs.push(String(e.message)); else console.error(e && e.message || e); }); vc.on('error', (m) => console.error(m)); vc.on('warn', () => {});   // jsdom cannot navigate: a page that redirects records a navigation attempt here
  const dom = new JSDOM(html, { url: pageUrl, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); win.scrollTo = () => {}; win.requestAnimationFrame = (f) => setTimeout(f, 0); win.requestIdleCallback = (f) => setTimeout(f, 10); win.Element.prototype.scrollIntoView = function () {};
    win.HTMLCanvasElement.prototype.getContext = () => ({}); Object.defineProperty(win, "crypto", { value: { subtle: nodeCrypto.webcrypto.subtle }, configurable: true }); win.TextEncoder = TextEncoder;   // the validator page derives the module account with Web Crypto
    win.Chart = function (ctx, cfg) { win.__charts = win.__charts || []; win.__charts.push(cfg); this.destroy = () => {}; }; win.Chart.defaults = { font: {} };
    win.fetch = (u) => { const url = new URL(String(u), pageUrl).href; fetched.push(url);   // a page's relative fetch (/liondao/home.json) resolves against the page URL, as the browser does
      if (extra && extra.lcd) { const r = extra.lcd(url); if (r !== undefined) return Promise.resolve({ ok: r !== null, json: async () => r, text: async () => JSON.stringify(r) }); }
      const f = files(url); if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }); }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }); };
    for (const lib of ['lib/collection-context.js', 'lib/site-header.js', 'liondao/lib/ld.js', 'lib/home-tiles.js', 'lib/cron-registry.js', 'lib/site-footer.js']) win.eval(fs.readFileSync(path.join(SITE, lib), 'utf8'));
  } });
  const w = dom.window; w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true })); w.dispatchEvent(new w.Event('load'));
  await new Promise(r => setTimeout(r, extra && extra.wait || 2500));
  return { w, d: w.document, fetched, navs, T: (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim() };
}
const has = (t, s) => t.indexOf(s) !== -1;

console.log('— lib');
{ const req = createRequire(import.meta.url); const LD = req(path.join(SITE, 'liondao/lib/ld.js'));
  ok('ld.js 1.0.0 loads in node; fmt.usd / usdFull / big / price agree with the page expectations', LD.VERSION === '1.0.0' && LD.fmt.usd(188105.3) === '$188,105' && LD.fmt.big(298564000000) === '298.56B' && LD.fmt.price(3.21e-7) === '$0.0₆321', [LD.fmt.usd(188105.3), LD.fmt.big(298564000000), LD.fmt.price(3.21e-7)]);
  const a = J(path.join(DAOO, 'lion-dao/positions/daily/2026-09-20.json')); const wc = LD.whatChanged(a, cur);
  ok('whatChanged(dayA → today): ROAR was 10 % cheaper on dayA → market movement ≈ +$10.3k; Ryan held 500 USDt less → amount effect ≈ +$500; net = known Δ', wc && wc.market > 9000 && wc.market < 12000 && Math.abs(wc.organic - 500) < 5 && Math.abs(wc.net - (cur.rollup.dao.known_usd - a.rollup.dao.known_usd)) < 1e-6, wc && [wc.market, wc.organic, wc.net]);
  ok('whatChanged never splits DAO actions it cannot see (the note says so)', /DAO actions.*not a separate line/.test(wc.note)); }

console.log('— liondao/dao_treasury.html');
{ const { d, T } = await run('liondao/dao_treasury.html', 'https://thealliancedao.com/liondao/dao_treasury.html');
  const hero = T(d.getElementById('hero'));
  ok('hero = the roll-up known value ' + fmtUsdFull(R.known_usd), has(hero, fmtUsdFull(R.known_usd)), hero.slice(0, 200));
  ok('hero sentence names the wallet count and the TLA figure', has(hero, 'Across 5 wallets') && has(hero, fmtUsd(R.tla_usd)), hero.slice(0, 300));
  ok('four stats: liquid tokens / TLA (links to the TLA page) / Credia / unclaimed (links to the unclaimed page)', has(hero, fmtUsd(R.balances_usd)) && d.querySelector('#hero a[href="/liondao/dao_tla_deposits.html"]') && d.querySelector('#hero a[href="/liondao/dao_unclaimed.html"]'));
  const where = T(d.getElementById('where'));
  ok('where the value sits: one stacked row per wallet with the wallet known value at the right (Ryan ' + fmtUsd(ryan.totals.known_usd) + ')', d.querySelectorAll('#where .ld-stack-row').length === 5 && has(where, fmtUsd(ryan.totals.known_usd)) && has(where, 'LionDAO ops (Ryan)'), where.slice(0, 200));
  const changed = T(d.getElementById('changed'));
  ok('what changed reads two days (the series lists 2) and shows market movement + amounts moved + net', d.getElementById('wc-from') && d.getElementById('wc-to') && has(changed, 'Market movement') && has(changed, 'Amounts moved') && has(changed, 'Net result') && has(changed, 'ROAR'), changed.slice(0, 300));
  ok('trend draws from the daily series: a Chart with 2 x-points, labeled Known value', (() => { const cs = d.defaultView.__charts || []; const c = cs.find(x => x.type === 'line' && x.data.datasets[0].label === 'Known value'); return c && c.data.datasets[0].data.length === 2 && c.data.datasets[0].data[1].y === R.known_usd; })(), (d.defaultView.__charts || []).map(c => c.data.datasets[0].label));
  const hold = d.getElementById('holdings');
  const receipt = Array.from(hold.querySelectorAll('tr')).find(tr => has(T(tr), 'compounder receipt'));
  ok('holdings: a compounder receipt row is labeled and has NO value cell (valued in lp_positions)', receipt && has(T(receipt), 'valued in portfolio.lp_positions') && T(receipt.querySelectorAll('td')[3]) === '', receipt && T(receipt));
  const wst = Array.from(hold.querySelectorAll('tr')).find(tr => /^wstETH/.test(T(tr)));
  ok('holdings: wstETH row shows Unknown with the reason on hover (no feed) until 1.1.0 runs — never a zero', wst && wst.querySelector('.ld-unk') && /no price feed for wstETH/.test(wst.querySelector('.ld-unk').getAttribute('title')), wst && T(wst));
  const roar = Array.from(hold.querySelectorAll('tr')).find(tr => /^ROAR/.test(T(tr)) && has(T(tr), '298.56B'));
  ok('holdings: the treasury ROAR row 298.56B at the Astroport price = ' + fmtUsd(95886), roar && has(T(roar), fmtUsd(95886.2)) && has(T(roar), 'astroport'), roar && T(roar));
  const recon = T(d.getElementById('recon'));
  ok('reconciliation: by section (compounder row: ours vs theirs) and by wallet, with reference_as_of', has(recon, 'TLA compounder') && has(recon, 'LionDAO ops (Ryan)') && has(recon, fmtUsd(cur.reconciliation.theirs_total_usd)) && has(recon, 'captured undated') === (cur.reconciliation.reference_as_of == null), recon.slice(0, 400));
  ok('receipt count and unpriced count are said in the hero, not hidden', /\d+ unpriced row/.test(hero) && /\d+ receipt/.test(hero)); }

console.log('— liondao/dao_tla_deposits.html');
{ const { d, T } = await run('liondao/dao_tla_deposits.html', 'https://thealliancedao.com/liondao/dao_tla_deposits.html');
  const hero = T(d.getElementById('hero'));
  ok('hero = the roll-up TLA total ' + fmtUsdFull(R.tla_usd), has(hero, fmtUsdFull(R.tla_usd)), hero.slice(0, 200));
  const lp = ryan.portfolio.lp_positions.find(l => l.pool_name === 'LUNA-USDT');
  const row = Array.from(d.querySelectorAll('#pools tr')).find(tr => /^LUNA-USDT/.test(T(tr)));
  ok("pools: Ryan's LUNA-USDT compounder row = the engine's " + fmtUsd(lp.estimated_position_usd) + ' with underlying and APR', row && has(T(row), fmtUsd(lp.estimated_position_usd)) && has(T(row), 'compounder') && has(T(row), 'USDt') && has(T(row), lp.pool_apr_pct.toFixed(1) + '%'), row && T(row));
  ok('pools chart: horizontal bars, one per active pool', (() => { const c = (d.defaultView.__charts || []).find(x => x.type === 'bar'); return c && c.options.indexAxis === 'y' && c.data.labels.includes('LUNA-USDT (amp)'); })());
  const vp = T(d.getElementById('vp'));
  ok('voting power: Ryan ' + Math.round(ryan.portfolio.summary.voting_power_human / 1e6 * 100) / 100 + 'M VP and where the votes point (LUNA-USDT 100%)', has(vp, 'LionDAO ops (Ryan)') && has(vp, 'LUNA-USDT 100%'), vp.slice(0, 300));
  const locks = T(d.getElementById('wallets'));
  ok('locks: lock #258 ampLUNA with its VP, auto-max chip; pending rows over a cent', has(locks, '#258') && has(locks, 'auto-max') && has(locks, 'bribe'), locks.slice(0, 300)); }

console.log('— liondao/dao_unclaimed.html');
{ const { d, T } = await run('liondao/dao_unclaimed.html', 'https://thealliancedao.com/liondao/dao_unclaimed.html');
  const hero = T(d.getElementById('hero')); const val = cur.validator;
  const pend = Object.values(cur.wallets).flatMap(w => (w.portfolio.pending_rewards || []).concat(w.portfolio.pending_bribes || [])).reduce((t, r) => t + (r.usd_value || 0), 0) + Object.values(cur.wallets).reduce((t, w) => t + (w.portfolio.pending_rebase ? w.portfolio.pending_rebase.usd_value || 0 : 0), 0);
  const delegRew = Object.values(cur.wallets).reduce((t, w) => t + (w.delegations && w.delegations.rewards_usd || 0), 0);
  const total = pend + val.commission_unclaimed_usd + delegRew;
  ok('hero = TLA pending + commission + delegation rewards = ' + fmtUsdFull(total), has(hero, fmtUsdFull(total)), hero.slice(0, 200));
  ok('hero sentence: commission ' + Math.round(val.commission_unclaimed_luna) + ' LUNA named', has(hero, Math.round(val.commission_unclaimed_luna).toLocaleString() + ' LUNA'), hero.slice(0, 400));
  const panels = T(d.getElementById('panels'));
  ok('three panels: TLA / Validator (links to the validator page) / pixeLions rewards = Unknown with the distributor reason', has(panels, 'TLA') && d.querySelector('#panels a[href="/liondao/validator.html"]') && /distributor contract not registered/.test(d.querySelector('#panels .ld-unk').getAttribute('title')), panels.slice(0, 300));
  const det = T(d.getElementById('detail'));
  ok('by wallet: the msig\'s 17 bribe rows appear under its own block', has(det, 'pixeLions ⍺ msig') && has(det, 'bribe'), det.slice(0, 300));
  ok('trend chart reads the series (TLA pending + commission on the right axis)', (() => { const c = (d.defaultView.__charts || []).find(x => x.type === 'line'); return c && c.data.datasets[1].yAxisID === 'y1' && c.data.datasets[1].data.length === 2; })()); }

console.log('— liondao/validator.html (LCD shape fixtures)');
{ const lcd = (url) => { if (!/publicnode|lcd/.test(url)) return undefined; if (url.includes('/validators?status=BOND_STATUS_BONDED')) return { validators: VALS, pagination: { next_key: null } }; if (url.includes('/validators/' + OP + '/delegations')) { if (!allianceModule) return { delegation_responses: [{ delegation: { delegator_address: 'terra1notthemoduleaccount' }, balance: { denom: 'uluna', amount: '8044881580422' } }, { delegation: { delegator_address: 'terra1pl85yc' }, balance: { denom: 'uluna', amount: '114045727272' } }], pagination: { next_key: null } };   /* first pass: a module-sized delegator under an address the derivation does NOT match */ return { delegation_responses: [{ delegation: { delegator_address: allianceModule }, balance: { denom: 'uluna', amount: '8044881580422' } }, { delegation: { delegator_address: 'terra1pl85yc' }, balance: { denom: 'uluna', amount: '114045727272' } }, { delegation: { delegator_address: ADAO_T }, balance: { denom: 'uluna', amount: '10000000000' } }, { delegation: { delegator_address: ryanA }, balance: { denom: 'uluna', amount: '1000000' } }], pagination: { next_key: null } }; } if (url.includes('/unbonding_delegations')) return { unbonding_responses: [{ delegator_address: 'terra1aaq4pj', entries: [{ balance: '1250000000', completion_time: '2026-10-08T02:23:43Z' }] }], pagination: {} }; if (url.includes('/commission')) return { commission: { commission: [{ denom: 'uluna', amount: '3615292436.1' }, { denom: 'ibc/2C96', amount: '47' }] } }; return null; };
  // first pass: learn the derived module account from the page (bech32 of sha256("alliance")), then re-run with it in the fixture
  const first = await run('liondao/validator.html', 'https://thealliancedao.com/liondao/validator.html', { lcd, wait: 2500 });
  allianceModule = first.w.__ldAlliance;   // what the page derived (bech32 of sha256("alliance")[0:20]) — the fixture's module row takes that address
  { const st = first.T(first.d.getElementById('stake')); const rows = Array.from(first.d.querySelectorAll('#delegators tbody tr'));
    ok('first pass: a module-sized delegator (95.6 %) under an address the derivation does not match → the composition is Unknown, the note points at terra1nott… by size, and its row is NOT labeled Alliance module', first.d.querySelector('#stake .ld-unk') && /largest delegator \(terra1nott.*95\.6%.*did not match the derived Alliance module account terra1srd5yx/.test(st) && rows.length === 2 && !/Alliance module/.test(first.T(rows[0])) && !rows[0].classList.contains('ld-dim'), [st.slice(0, 260), rows.map(r => first.T(r).slice(0, 60))]);
    ok('first pass hero: no module split claimed — says "delegated from 2 addresses — one of them module-sized, unmatched"', /delegated from 2 addresses — one of them module-sized, unmatched/.test(first.T(first.d.getElementById('hero'))), first.T(first.d.getElementById('hero')).slice(0, 300)); }
  ok('the page derived the Alliance module account: terra1srd5yxrg346qd7mne893gy3g43elh2swcmc0j3 (independent bech32 check)', allianceModule === 'terra1srd5yxrg346qd7mne893gy3g43elh2swcmc0j3', allianceModule);
  const { d, T } = await run('liondao/validator.html', 'https://thealliancedao.com/liondao/validator.html', { lcd, wait: 3000 });
  const hero = T(d.getElementById('hero'));
  ok('hero: rank #2 of 3, bonded 8.41M LUNA, commission 7.5% (max 10%), 3,615 LUNA unclaimed', has(hero, '#2') && has(hero, '8,411,303 LUNA') && has(hero, '7.5%') && has(hero, '10%') && has(hero, '3,615 LUNA'), hero.slice(0, 400));
  ok('hero sentence splits the Alliance module stake from LUNA delegators (95.6 % module · 124,047 LUNA from 3 addresses)', has(hero, '95.6%') && has(hero, '124,047 LUNA') && has(hero, 'from 3 addresses'), hero.slice(0, 500));
  const stake = T(d.getElementById('stake'));
  ok('rank ladder shows neighbours; stake composition bar names both parts; unbonding entry listed', has(stake, 'Big') && has(stake, 'Small') && has(stake, 'Alliance module') && has(stake, 'LUNA delegators') && has(stake, '2026-10-08'), stake.slice(0, 300));
  const del = d.getElementById('delegators'); const rows = Array.from(del.querySelectorAll('tbody tr'));
  ok("delegators: the Alliance module row is dimmed and named; aDAO's 10,000 LUNA is marked 'Alliance DAO treasury' with the alliance note; Ryan is named from the roster", rows.length === 4 && rows[0].classList.contains('ld-dim') && has(T(rows[0]), 'Alliance module (TLA)') && /Alliance DAO treasury|aDAO Treasury/.test(T(rows[2])) && has(T(rows[2]), '10,000 LUNA delegation') && has(T(rows[3]), 'LionDAO ops (Ryan)'), rows.map(r => T(r).slice(0, 80)));
  ok('the alliance module account is DERIVED in the page (no literal): the fixture only matched because the page derived ' + allianceModule, has(T(rows[0]), 'Alliance module') && !/terra1srd5yx/.test(fs.readFileSync(path.join(SITE, 'liondao/validator.html'), 'utf8'))); }

console.log('— liondao/ecosystem.html + coming.html');
{ const { d, T } = await run('liondao/ecosystem.html', 'https://thealliancedao.com/liondao/ecosystem.html', { lcd: (u) => (/publicnode|coingecko|dexscreener/.test(u) ? null : undefined), wait: 3500 });
  const hero = T(d.getElementById('hero'));
  ok('ecosystem hero: known value from the positions product ' + fmtUsd(R.known_usd) + ', validator Unknown (LCD dead in the gate), ROAR price from the feed', has(hero, fmtUsd(R.known_usd)) && d.querySelector('#hero .ld-unk') && has(hero, 'ROAR price'), hero.slice(0, 300));
  const burn = T(d.getElementById('burn'));
  ok('burn festival: Lion DAO\'s reported 117B beside the contract\'s supply delta (Unknown here — token_info not read), pyROAR found', has(burn, '117B') && has(burn, 'Lion DAO\'s published figures') && has(burn, 'found'), burn.slice(0, 300));
  const roar = T(d.getElementById('roar'));
  ok('ROAR section: treasury ROAR 298.56B from the positions product, links to the treasury page', has(roar, '298.56B') && d.querySelector('#roar a[href="/liondao/dao_treasury.html"]'), roar.slice(0, 200));
  const c = await run('liondao/coming.html', 'https://thealliancedao.com/liondao/coming.html?tile=supply', { wait: 1200 });
  ok('coming.html?tile=supply: the tile\'s own label + what powers it (the supply map) + what exists today', has(c.T(c.d.getElementById('body')), 'ROAR supply map') && has(c.T(c.d.getElementById('body')), 'supply map'), c.T(c.d.getElementById('body')).slice(0, 200)); }

console.log('— liondao/mint.html (primary-sales ledger, real)');
{ const MS = J(path.join(NFTC, 'pixel-lions/ledger/primary-sales.json')); const SUMM = J(path.join(NFTC, 'pixel-lions/snapshots/summary.json'));
  const rows = Object.values(MS.by_token).filter(r => r && r.buyer); const minters = {}; rows.forEach(r => { minters[r.buyer] = (minters[r.buyer] || 0) + 1; });
  const nMint = Object.keys(minters).length; const still = Object.keys(minters).filter(a => (SUMM.per_real_owner_counts[a] || 0) > 0).length; const totalLuna = rows.reduce((t, r) => t + Number(r.price.amount) / 1e6, 0); const totalUsd = rows.reduce((t, r) => t + (r.usd || 0), 0);
  const tiers = {}; rows.forEach(r => { const l = Number(r.price.amount) / 1e6; tiers[l] = (tiers[l] || 0) + 1; }); const top = Object.entries(minters).sort((a, b) => b[1] - a[1])[0];
  const { d, T } = await run('liondao/mint.html', 'https://thealliancedao.com/liondao/mint.html', { wait: 3500 });
  const hero = T(d.getElementById('hero'));
  ok('hero = ' + rows.length + ' minted; ' + nMint + ' wallets paid ' + fmtUsd(totalLuna).slice(1) + ' LUNA worth ' + fmtUsd(totalUsd) + ' at the time; first and last mint dates from the ledger', has(hero, rows.length.toLocaleString() + ' minted') && has(hero, nMint.toLocaleString() + ' wallets') && has(hero, Math.round(totalLuna).toLocaleString() + ' LUNA') && has(hero, fmtUsd(totalUsd)) && has(hero, '2023-06-09') && has(hero, '2023-06-11'), hero.slice(0, 400));
  ok('price tiers from the ledger, not the docs: ' + Object.keys(tiers).map(t => tiers[t] + ' at ' + t).join(' · '), Object.keys(tiers).every(t => has(hero, tiers[t].toLocaleString() + ' at ' + t)), hero.slice(0, 500));
  ok('still hold today = the wallet-level join: ' + still + ' of ' + nMint + ', labeled as any pixeLion not necessarily the minted ones', has(hero, still.toLocaleString() + ' of ' + nMint.toLocaleString()) && has(hero, 'not necessarily the ones minted'), hero.slice(-400));
  ok('the sellout chart is a mixed bar + line with one x-point per hour and the cumulative line ending at ' + rows.length, (() => { const c = (d.defaultView.__charts || []).find(x => x.type === 'bar' && x.data.datasets.some(ds => ds.type === 'line')); if (!c) return false; const cum = c.data.datasets.find(ds => ds.type === 'line').data; return cum[cum.length - 1] === rows.length && c.data.labels.length >= 28 && c.data.labels.length <= 32; })(), (d.defaultView.__charts || []).map(c => c.type + ':' + (c.data.labels || []).length));
  const mt = d.getElementById('minters'); const r0 = mt.querySelector('tbody tr');
  ok('top minter row = ' + top[0].slice(0, 10) + '… with ' + top[1] + ' minted and its Holds-now count from the owner snapshot (' + (SUMM.per_real_owner_counts[top[0]] || 0) + ')', r0 && has(T(r0), top[0].slice(0, 10)) && has(T(r0.querySelectorAll('td')[2]), String(top[1])) && T(r0.querySelectorAll('td')[5]) === String(SUMM.per_real_owner_counts[top[0]] || 0), r0 && T(r0));
  ok('minter buckets sum to every wallet (1 / 2–5 / 6–20 / 21+)', (() => { const cells = Array.from(mt.querySelectorAll('.mt-bucket .ld-v')).map(e => Number(T(e).replace(/,/g, ''))); return cells.length === 4 && cells.reduce((a, b) => a + b, 0) === nMint; })(), Array.from(mt.querySelectorAll('.mt-bucket .ld-v')).map(e => T(e)));
  ok('"kept what they minted" is Unknown with the by-wallet reason — never estimated', Array.from(d.querySelectorAll('#after .ld-unk')).some(e => /by-wallet shards/.test(e.getAttribute('title')))); }

console.log('— liondao/alliance.html (dao-dashboard + participants + summary + live staking)');
{ const dash = J(path.join(CORE, 'member-data/dao-dashboard/current.json')); const drow = dash.dashboard.alliances.lion_dao.chain_staking.validators.find(r => r.address === OP); const ADAO = drow.delegator_wallet;
  const parts = J(path.join(CORE, 'member-data/participants/current.json')); const me = parts.members.find(m => m.wallet === ADAO); const lr = me.lp_positions.filter(l => l.pool_name === 'LUNA-ROAR').reduce((t, l) => t + l.estimated_position_usd, 0); const ar = me.lp_positions.filter(l => l.pool_name === 'ampROAR-ROAR').reduce((t, l) => t + l.estimated_position_usd, 0);
  const SUMM = J(path.join(NFTC, 'pixel-lions/snapshots/summary.json')); const stk = SUMM.daodao_stakers.find(s => s.address === ADAO);
  const lcd = (url) => { if (!/publicnode|lcd/.test(url)) return undefined; if (url.includes('/smart/')) { const q = JSON.parse(Buffer.from(decodeURIComponent(url.split('/smart/')[1]), 'base64').toString()); if (q.staked_balance && q.staked_balance.address === ADAO) return { data: { balance: '1000000000000000', height: '1' } }; } return null; };
  const { d, T } = await run('liondao/alliance.html', 'https://thealliancedao.com/liondao/alliance.html', { lcd, wait: 3500 });
  const hero = T(d.getElementById('hero'));
  ok('hero = the 10,000 LUNA delegation with ' + Math.round(drow.unclaimed_rewards_luna) + ' LUNA unclaimed, since the dashboard\'s established date', has(hero, '10,000 LUNA') && has(hero, Math.round(drow.unclaimed_rewards_luna).toLocaleString() + ' LUNA') && has(hero, 'since ' + dash.dashboard.alliances.lion_dao.established), hero.slice(0, 300));
  const sides = T(d.getElementById('sides'));
  ok('the two "put in" paragraphs are the home\'s own words (v1 copy, unchanged)', has(sides, '4,500 LUNA (prop A21 OTC)') && has(sides, '20 pixeLions staked by aDAO'));
  const work = d.getElementById('work'); const legs = Array.from(work.querySelectorAll('.al-leg')).slice(1).map(l => T(l));
  ok('7 legs; the staked-ROAR leg reads 1B live from the staking module (staked_balance for the aDAO treasury)', legs.length === 7 && has(legs[1], '1B ROAR staked'), legs[1]);
  ok('ampROAR-ROAR leg = the aDAO treasury\'s participants rows ' + fmtUsd(ar) + ' (amp + non-amp); LUNA-ROAR ' + fmtUsd(lr), has(legs[2], fmtUsd(ar)) && has(legs[2], 'amp ') && has(legs[2], 'non-amp ') && has(legs[3], fmtUsd(lr)), [legs[2], legs[3]]);
  ok('pixeLions leg = ' + stk.count + ' staked · ' + stk.voting_power_pct.toFixed(2) + '% of the pixeLions DAO\'s VP', has(legs[4], stk.count + ' staked') && has(legs[4], stk.voting_power_pct.toFixed(2) + '%'), legs[4]);
  ok('the aDAO-NFTs leg is Unknown with the by-wallet reason; the OTC leg is words; nothing is estimated', work.querySelectorAll('.ld-unk').length === 1 && /by-wallet shards/.test(work.querySelector('.ld-unk').getAttribute('title')) && has(legs[6], 'completed exchange'), legs[5]);
  const c2 = await run('liondao/coming.html', 'https://thealliancedao.com/liondao/coming.html?tile=mint', { wait: 800 });
  ok('coming.html?tile=mint redirects (one navigation attempt, the body never paints) and the source maps mint → /liondao/mint.html, alliance → /liondao/alliance.html', c2.navs.length === 1 && !c2.d.getElementById('body').textContent.trim() && /mint: '\/liondao\/mint\.html', alliance: '\/liondao\/alliance\.html'/.test(fs.readFileSync(path.join(SITE, 'liondao/coming.html'), 'utf8')), [c2.navs.length, c2.T(c2.d.getElementById('body')).slice(0, 60)]); }

console.log('— liondao/index.html v2 (home)');
{ const { d, T, fetched } = await run('liondao/index.html', 'https://thealliancedao.com/liondao/', { lcd: (u) => (/publicnode|coingecko|dexscreener/.test(u) ? null : undefined), wait: 5000 });
  const home = d.getElementById('home'); const secs = Array.from(home.querySelectorAll('section.ht-sec'));
  const order = secs.map(s => s.querySelector('.ht-nav') ? 'nav' : s.querySelector('.ht-hero') ? 'hero' : s.querySelector('.ht-bar') ? 'supply' : s.querySelector('#ht-act') ? 'market' : (T(s.querySelector('.ht-h')) || '').split(/[\s0-9]/)[0]);
  ok("aDAO's order: hero · info tiles · status bars · Unclaimed · Lion DAO row+total · pixeLions row+strip · Burning Lions row · marketplaces", order.join('|') === 'hero|nav|supply|Unclaimed|Lion|pixeLions|Burning|market', order);
  ok('no sheets anywhere: every info tile is a link to a page or a menu', !home.querySelector('.ht-sheet') && Array.from(home.querySelectorAll('.ht-nav .ht-tile')).every(t => /location\.href|toggleMenu/.test(t.getAttribute('onclick'))), Array.from(home.querySelectorAll('.ht-nav .ht-tile')).map(t => t.getAttribute('onclick').slice(0, 40)));
  ok('the big tile opens ecosystem.html; supply/lore open coming.html?tile=… muted (soon); rarity opens the explorer; mint → mint.html; alliance → alliance.html — nothing else is a slot', (() => { const tiles = Array.from(home.querySelectorAll('.ht-nav .ht-tile')); const eco = tiles[0]; return /ecosystem\.html/.test(eco.getAttribute('onclick')) && tiles.filter(t => /coming\.html\?tile=/.test(t.getAttribute('onclick')) && t.classList.contains('ht-soon')).length === 2 && tiles.some(t => /nft-explorer-index\.html\?tenant=liondao/.test(t.getAttribute('onclick')) && !t.classList.contains('ht-soon')) && tiles.some(t => /\/liondao\/mint\.html/.test(t.getAttribute('onclick')) && !t.classList.contains('ht-soon')) && tiles.some(t => /\/liondao\/alliance\.html/.test(t.getAttribute('onclick')) && !t.classList.contains('ht-soon')); })(), Array.from(home.querySelectorAll('.ht-nav .ht-tile')).map(t => (t.getAttribute('onclick') || '').slice(14, 60) + (t.classList.contains('ht-soon') ? ' [soon]' : '')));
  ok('DAO links menu carries the six pages (treasury, TLA, unclaimed, validator, mint, alliance)', ['/liondao/dao_treasury.html', '/liondao/dao_tla_deposits.html', '/liondao/dao_unclaimed.html', '/liondao/validator.html', '/liondao/mint.html', '/liondao/alliance.html'].every(h => home.querySelector('.ht-menu a[href="' + h + '"]')));
  const rew = secs.find(s => /^Unclaimed/.test(T(s.querySelector('.ht-h'))));
  ok('Unclaimed rewards: three panels, each opens dao_unclaimed.html; TLA panel = the positions product ' + fmtUsd(R.tla_pending_usd), rew && rew.querySelectorAll('.ht-tile[role="link"]').length === 3 && has(T(rew), fmtUsd(R.tla_pending_usd)), rew && T(rew).slice(0, 300));
  const lion = secs.find(s => /^Lion DAO/.test(T(s.querySelector('.ht-h'))));
  ok('Lion DAO row: Treasury ROAR 298.56B → dao_treasury; TLA positions ' + fmtUsd(R.tla_usd) + ' → dao_tla_deposits; Validator → validator.html; ROAR price → ecosystem', lion && has(T(lion), '298.56B') && has(T(lion), fmtUsd(R.tla_usd)) && ['dao_treasury', 'dao_tla_deposits', 'validator', 'ecosystem'].every(p => Array.from(lion.querySelectorAll('.ht-tile[onclick]')).some(t => t.getAttribute('onclick').includes(p))), lion && T(lion).slice(0, 300));
  ok('total strip = the positions roll-up known value ' + fmtUsd(R.known_usd) + ' with its parts (Tokens · TLA · locks · Credia · delegated · Votion), clickable', lion && has(T(lion.querySelector('.ht-total')), fmtUsd(R.known_usd)) && has(T(lion.querySelector('.ht-total')), 'Tokens') && has(T(lion.querySelector('.ht-total')), 'TLA') && lion.querySelector('.ht-total[role="link"]'), lion && T(lion.querySelector('.ht-total')));
  ok('the positions product was fetched exactly once for the home', fetched.filter(u => u.includes('lion-dao/positions/current.json')).length === 1);
  ok('page rev 2.2 in the footer', has(T(d.getElementById('page-rev')), 'Rev 2.2')); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
