#!/usr/bin/env node
// gate-tla-stats-rewardlist.mjs — tla-stats T8.10 (jsdom, real products): the headline tiles against the chain's own distribution and
// the Eris-method feed, and pools that are off their bucket's reward list.
// The snapshot is tla-snapshot 1.2.0's. A checkout whose file was written by an earlier build is STAGED with the cron's own live
// functions (platform-crons member-data/tla-snapshot.js _internals) — no third copy of any rule.
// Usage: TLA_CORE_DIR=<tla-core> CRONS_DIR=<platform-crons> node gate-tla-stats-rewardlist.mjs
//   H1 TLA TVL tile = staked value of the pools the chain is paying = the Eris-method feed's total (±3 %)
//   H2 Epoch rewards tile = the emission per epoch (±2 %) — never more than the chain distributes
//   H3 Active pools tile counts only pools on a reward list
//   H4 Epoch Bribes tile = the pots frozen at the last flip (bribe-state period = epoch − 1), at the price feed's prices; its line says so (T8.10.1)
//   I1 a pool off its bucket's reward list with ≥ 1 % of the votes is listed under Currently inactive, tagged "off the reward list"
//   I2 none of them shows a reward APR card on the Overview
//   P1 Pools tab: the four bucket headers' "LUNA emissions / week" add up to the weekly emission (±2 %); Stable's is its 40 %
//   P2 Pools tab: two pools that share a name (LUNA-EURe on Astroport and SkeletonSwap) each show their own stake
//   P3 Pools tab: the largest pool shows a dollar stake (it read "$0.00 · 0% in TLA" while USDC.inj was unnamed)
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path'; import os from 'os'; import { createRequire } from 'module';
import { realHeader } from './gate-header.mjs';   // the page builds its tab bar from the site's one list (lib/site-header.js)
const CORE_REAL = process.env.TLA_CORE_DIR, CRONS = process.env.CRONS_DIR; if (!CORE_REAL || !CRONS) { console.error('TLA_CORE_DIR and CRONS_DIR required'); process.exit(1); }
const require = createRequire(import.meta.url);
const S = require(path.join(CRONS, 'member-data/tla-snapshot.js'))._internals;
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x).slice(0, 400) : '')); } };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(CORE_REAL, rel), 'utf8'));
const money = (t) => { const m = /\$\s*([\d,.]+)\s*([KMB])?/.exec(String(t || '')); return m ? parseFloat(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1) : null; };

// --- stage: the snapshot as tla-snapshot 1.2.0 writes it ---
let snap = J('member-data/tla-snapshot/current.json'); const np = J('network-and-prices/current.json'), cat = J('token-catalog/snapshots/current.json'), eris = J('dex-data/eris-apr/current.json'), distH = J('tla-voting/distributions/history.json');
const dist = distH.entries[distH.entries.length - 1].gauges;
if (!snap.version) {
  const tp = np.token_prices; const feedByDenom = new Map(); for (const [sym, e] of Object.entries(tp)) if (e && e.denom) feedByDenom.set(e.denom, sym);
  const R = new S.TokenResolver(async (addr, q) => (q.token_info && feedByDenom.has(addr)) ? { symbol: feedByDenom.get(addr), decimals: 6 } : null, { feedByDenom, catalog: cat });
  const P = new S.PriceResolver(tp, np.lst_ratios || {}, new Map());
  const rows = {}; for (const b of S.BUCKETS) rows[b] = [];
  for (const p of cat.pools) if (rows[p.bucket] && p.asset_raw) rows[p.bucket].push({ info: p.asset_raw, config: {}, whitelisted: p.gauge_status !== 'dewhitelisted' });
  const truth = S.buildWhitelistTruth(rows, dist); const catStatus = new Map(cat.pools.map(p => [`${p.bucket}|${p.gauge_pool_id}`, p.gauge_status]));
  const inj = tp['USDC.inj'] && tp['USDC.inj'].denom; const denomOf = (sym) => sym === 'LUNA' ? 'uluna' : (tp[sym] && tp[sym].denom) || null;
  const pools = [];
  for (const p0 of snap.pools) {
    const p = JSON.parse(JSON.stringify(p0)); const wl = S.whitelistFor(p.bucket, p.gauge_pool_id, truth, catStatus);
    const st = S.poolStatus({ isDeprecated: p.status === 'deprecated', whitelisted: wl.whitelisted, pctOfBucket: p.voting_power.pct_of_bucket, vp: p.voting_power.vp });
    p.status = st.status; p.status_reason = st.reason; p.gauge_whitelisted = wl.whitelisted; p.voting_power.total_human = p.voting_power.vp_human;
    if (p.staked_in_tla_usd == null && p.is_lp_pair && p.lp_health && p.amp_lp && inj) {
      const sides = [p.lp_health.asset_0, p.lp_health.asset_1]; const ds = sides.map(a => a.symbol ? denomOf(a.symbol) : inj);
      if (ds.every(Boolean)) { const H = await S.buildLpHealth({ assets: sides.map((a, i) => ({ info: /^terra1/.test(ds[i]) ? { token: { contract_addr: ds[i] } } : { native_token: { denom: ds[i] } }, amount: String(a.amount_raw) })), total_share: p.lp_health.total_share }, P, R);
        delete H._basics; if (H.total_pool_usd) { p.lp_health = H; p.staked_in_tla_usd = Number(p.amp_lp.underlying_lp_amount) * H.total_pool_usd / Number(H.total_share); } }
    }
    delete p.rewards; pools.push(p);
  }
  const bucketVps = {}; for (const b of S.BUCKETS) bucketVps[b] = snap.buckets[b].bucket_vp;
  const log = console.log; console.log = () => {}; const { totals, byBucket } = S.computeRollups(pools, bucketVps); S.computeRewards(pools, byBucket, totals, tp.LUNA.final_price_usd, dist); console.log = log;
  snap = { ...snap, version: S.SNAPSHOT_VERSION + ' (staged)', totals, buckets: byBucket, pools };
  console.log(`staged: the checkout's snapshot (${snap.capturedAt}) rebuilt as ${S.SNAPSHOT_VERSION}`);
} else console.log(`snapshot ${snap.version} of ${snap.capturedAt} used as published`);
const CORE = fs.mkdtempSync(path.join(os.tmpdir(), 'core-rewardlist-'));
const staged = path.join(CORE, 'tla-snapshot-current.json'); fs.writeFileSync(staged, JSON.stringify(snap));
const read = (rel) => { if (rel === 'member-data/tla-snapshot/current.json') return fs.readFileSync(staged); const p = path.join(CORE_REAL, rel); return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p) : null; };

// --- what the page must show, from the data ---
const paid = new Set(dist.flatMap(d => (d.assets || []).map(a => a.asset.cw20 ? 'cw20:' + a.asset.cw20 : 'native:' + a.asset.native)));
const active = snap.pools.filter(p => p.status === 'active');
const expTvl = active.reduce((s, p) => s + (p.staked_in_tla_usd || 0), 0), erisTvl = eris.pools.reduce((s, p) => s + (p.tla_staked_usd || 0), 0);
const expEpochLuna = snap.totals.rewards.annual_emissions_luna / 52, weeklyUsd = snap.totals.rewards.annual_emissions_usd / 52.18;
const offBig = snap.pools.filter(p => p.gauge_whitelisted === false && p.voting_power.pct_of_bucket >= 1 && p.voting_power.vp > 0);
const expActiveTile = active.filter(p => /astro|skeleton/i.test(p.dex || '')).length;

// --- page ---
const html = fs.readFileSync(path.join(here, 'tla-stats.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://theadao.com/tla-stats.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  w.SiteHeader = { mount() {}, subnav() { return { querySelectorAll: () => [] }; }, tlaTabs: realHeader().tlaTabs }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined;
  w.Chart = class { constructor() { this.data = { datasets: [] }; } update() {} destroy() {} }; w.HTMLCanvasElement.prototype.getContext = () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, measureText: () => ({ width: 0 }) });
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {}; w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.console.log = () => {}; w.console.warn = () => {}; w.console.error = () => {};
  w.fetch = async (u) => { const clean = String(u).split('?')[0]; const m = /tla-core\/main\/(.+)$/.exec(clean); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
    if (m) { const b = read(m[1]); if (b == null) return nope; const t = b.toString('utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t, arrayBuffer: async () => b }; }
    if (/\/cosmos\/bank\/v1beta1\/balances\//.test(clean)) return { ok: true, status: 200, json: async () => ({ balances: [] }) };
    if (/\/cosmwasm\/wasm\/v1\/contract\//.test(clean)) return { ok: true, status: 200, json: async () => ({ data: { balance: '0', buckets: [] } }) };
    return nope; };
} });
await new Promise(r => setTimeout(r, 8000));
const w = dom.window, d = w.document; const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const nav = d.createElement('div'); nav.innerHTML = ['overview', 'grades', 'pools', 'tla'].map(t => `<span class="sh-subtab" data-tab="${t}"></span>`).join(''); d.body.appendChild(nav);

const tvl = money(T(d.getElementById('stat-tla-tvl')));
check(`H1 TLA TVL tile ${T(d.getElementById('stat-tla-tvl'))} = the pools the chain is paying ($${Math.round(expTvl).toLocaleString('en-US')}) = the Eris-method feed ($${Math.round(erisTvl).toLocaleString('en-US')})`,
  tvl != null && Math.abs(tvl / expTvl - 1) < 0.01 && Math.abs(tvl / erisTvl - 1) < 0.03, { tvl, expTvl, erisTvl });
const er = parseFloat(T(d.getElementById('stat-epoch-rewards')).replace(/[^\d.]/g, ''));
check(`H2 Epoch rewards tile ${T(d.getElementById('stat-epoch-rewards'))} = the emission per epoch (${Math.round(expEpochLuna).toLocaleString('en-US')} LUNA, ±2 %)`, er > 0 && Math.abs(er / expEpochLuna - 1) < 0.02, { er, expEpochLuna });
check(`H3 Active pools tile ${T(d.getElementById('stat-active-pools'))} = ${expActiveTile} Astroport + SkeletonSwap pools on a reward list (none off a list)`, Number(T(d.getElementById('stat-active-pools'))) === expActiveTile && active.every(p => p.gauge_whitelisted !== false));

const ci = d.getElementById('threshold-currently-inactive'); const items = ci ? [...ci.querySelectorAll('.ci-pool-item')] : [];
const tagOf = (name) => { const it = items.find(x => T(x.querySelector('.font-medium')) === name); return it ? T(it.querySelector('span.rounded')) : null; };
const missing = offBig.filter(p => tagOf(p.name) !== 'off the reward list').map(p => [p.name, tagOf(p.name)]);
check(`I1 ${offBig.length} pools off a reward list with ≥ 1 % of the votes are listed under Currently inactive, tagged "off the reward list" (${offBig.map(p => p.name).slice(0, 4).join(', ')}…)`, offBig.length > 0 && missing.length === 0, missing);
const offItem = items.find(x => T(x.querySelector('span.rounded')) === 'off the reward list');
check('   its line reads "… % of the votes, earning nothing" — not "(need 1%)"', !!offItem && /of the votes, earning nothing/.test(T(offItem)) && !/need 1%/.test(T(offItem)), offItem && T(offItem));
const overviewText = T(d.getElementById('tab-overview') || d.body);
const aprCards = offBig.filter(p => new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^%]{0,220}\\d+% reward APR').test(overviewText)).map(p => p.name);
check('I2 none of them shows a reward APR on the Overview', aprCards.length === 0, aprCards);

// H4 (T8.10.1): the Epoch Bribes tile is the pots frozen at the last flip, paying out during this epoch — and its line says so.
// (The Vote Market tile under it counts the pots on offer for the vote now open: a different, equally true number.)
{ const tp = np.token_prices; const byDenom = new Map(); for (const [sym, e] of Object.entries(tp)) if (e && e.denom) byDenom.set(e.denom, e);
  let potsUsd = 0, pots = 0, unpriced = 0;
  for (const p of snap.pools) for (const b of ((p.bribes && p.bribes.active_now) || [])) { pots++; for (const a of (b.assets || [])) { const id = a.info.native || a.info.cw20; const e = id === 'uluna' ? tp.LUNA : byDenom.get(id); if (!e || e.final_price_usd == null) { unpriced++; continue; } potsUsd += Number(a.amount) / Math.pow(10, e.decimals != null ? e.decimals : 6) * e.final_price_usd; } }
  const tile = money(T(d.getElementById('stat-total-bribes'))), sub = T(d.getElementById('stat-total-bribes-sub'));
  check(`H4 Epoch Bribes tile ${T(d.getElementById('stat-total-bribes'))} = the ${pots} pots the snapshot holds, at the price feed's prices ($${potsUsd.toFixed(2)}${unpriced ? `, ${unpriced} token(s) unpriced` : ''})`, tile != null && pots > 0 && Math.abs(tile - potsUsd) <= Math.max(1, potsUsd * 0.02), { tile, potsUsd });
  check('   its line says what they are — "last round’s pots, paying out now" — not "active this epoch"', /last round’s pots, paying out now/.test(sub) && !/active this epoch/.test(sub), sub);
  const cap = new Date(snap.capturedAt); const rel = `tla-voting/bribe-state/${cap.getUTCFullYear()}/${String(cap.getUTCMonth() + 1).padStart(2, '0')}.json`;
  const month = fs.existsSync(path.join(CORE_REAL, rel)) ? J(rel) : null; const last = Array.isArray(month) && month.length ? month[month.length - 1] : null;
  if (!last) console.log(`  (${rel} is not in this checkout — the round the pots belong to is not checked)`);
  else check(`   the harvest those pots come from is round ${last.period} = the epoch before ${snap.epoch.currentEpoch} (harvested ${String(last.harvested_at).slice(0, 16)}Z)`, last.period === snap.epoch.currentEpoch - 1, { period: last.period, epoch: snap.epoch.currentEpoch }); }

w.eval('switchToTab')('pools'); await new Promise(r => setTimeout(r, 2500));
const poolsRoot = d.getElementById('tab-pools') || d.body; const all = [...poolsRoot.querySelectorAll('div')];
const headers = all.filter(x => x.children.length >= 4 && /^(STABLE|PROJECT|BLUECHIP|SINGLE)\s+\d+ pools/i.test(T(x.children[0])));
const emisOf = (h) => { const c = [...h.children].find(x => /LUNA emissions \/ week/.test(T(x))); return c ? money(T(c)) : null; };
const byB = {}; for (const h of headers) { const b = T(h.children[0]).split(' ')[0].toUpperCase(); if (!(b in byB)) byB[b] = emisOf(h); }
const sum = Object.values(byB).reduce((s, v) => s + (v || 0), 0);
check(`P1 Pools tab: bucket headers' emissions ${Object.entries(byB).map(([b, v]) => b[0] + b.slice(1).toLowerCase() + ' $' + Math.round(v || 0).toLocaleString('en-US')).join(' · ')} add up to the weekly emission ($${Math.round(weeklyUsd).toLocaleString('en-US')}, ±3 %); Stable is its 40 %`,
  Object.keys(byB).length === 4 && Math.abs(sum / weeklyUsd - 1) < 0.03 && Math.abs(byB.STABLE / (weeklyUsd * 0.4) - 1) < 0.03, { byB, weeklyUsd });
const rowsEl = [...d.querySelectorAll('[data-erow]')];
const rowOf = (name, dexWord) => rowsEl.find(x => new RegExp('^[A-F\u2013-]?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + dexWord).test(T(x.children[0])));   // the cell reads <grade><name><dex tag>
if (process.env.GATE_DEBUG) console.log('  [debug] data-erow rows: ' + rowsEl.length + ' ' + JSON.stringify(rowsEl.slice(0, 2).map(x => [...x.children].map(c => T(c).slice(0, 44)))));
const dup = snap.pools.filter(p => p.name === 'LUNA-EURe'); const a = dup.find(p => /astro/i.test(p.dex)), sk = dup.find(p => /skeleton/i.test(p.dex));
if (a && sk) { const ra = rowOf('LUNA-EURe', 'Astro'), rs = rowOf('LUNA-EURe', 'Skeleton'); const va = ra && money(T(ra.children[1])), vs = rs && money(T(rs.children[1]));
  check(`P2 LUNA-EURe: the Astroport row shows $${Math.round(a.staked_in_tla_usd || 0).toLocaleString('en-US')}, the SkeletonSwap row its own $${Math.round(sk.staked_in_tla_usd || 0).toLocaleString('en-US')} (not the Astroport pool's)`,
    va != null && vs != null && Math.abs(va / (a.staked_in_tla_usd || 1) - 1) < 0.02 && Math.abs(vs - (sk.staked_in_tla_usd || 0)) <= Math.max(60, (sk.staked_in_tla_usd || 0) * 0.05), { va, vs }); }
else console.log('  (no two pools share the name LUNA-EURe in this checkout — P2 skipped)');
const big = active.slice().sort((x, y) => (y.staked_in_tla_usd || 0) - (x.staked_in_tla_usd || 0))[0];
const rb = rowOf(big.name, /astro/i.test(big.dex) ? 'Astro' : /skeleton/i.test(big.dex) ? 'Skeleton' : ''); const vb = rb && money(T(rb.children[1]));
check(`P3 the largest pool (${big.name}) shows $${Math.round(big.staked_in_tla_usd).toLocaleString('en-US')} staked, not $0.00`, vb != null && Math.abs(vb / big.staked_in_tla_usd - 1) < 0.02 && !/0% in TLA/.test(T(rb)), rb && T(rb).slice(0, 140));
check('footer rev T8.10 or later; the tab title no longer ends in TEST', /rev: 'T8\.1\d(\.\d+)?'/.test(html) && !/<title>[^<]*TEST<\/title>/.test(html));
fs.rmSync(CORE, { recursive: true, force: true });
console.log(`\n=== GATE tla-stats-rewardlist: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
