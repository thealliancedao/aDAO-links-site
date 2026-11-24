/* =============================================================================
 * lib/vote-market.js 1.0.0 (2026-09-27) — THE VOTE MARKET ENGINE. One place for the maths the Vote Market page (and, next,
 * the TLA Stats tile) runs. Pure functions over the captured products + the live pots; no DOM.
 * -----------------------------------------------------------------------------
 * The model (all verified against Votion's own worksheet / API on the captured period):
 *   · a voter's bribe payout on a pool = pot × my votes ÷ (the pool's votes at close) — paid only if the pool clears the 1% line
 *   · Votion (the ampLUNA-max and arbLUNA-max vaults, ~8.6M VP in EVERY bucket) maximises Σ pot × a ÷ (V + a) per bucket with its
 *     VP as budget; we solve that exactly (marginal water-fill), vault after vault, each seeing the other's votes in V
 *   · next epoch's emissions: a bucket's weekly budget split over the pools at or above 1% of the bucket's votes, by vote share;
 *     APR = weekly emissions × 52.18 ÷ the pool's TLA-staked USD (the snapshot's approx_apr_pct, same formula)
 *   · every voter votes their FULL VP in each bucket (weights per bucket sum to 100%)
 * What it cannot know: what other voters and bribers do before the round closes, and whether Votion's hysteresis holds a small
 * move (it re-votes when its own gain is worth it — `votion_gain` is reported so the page can say "likely" / "may hold").
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VoteMarket = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.5.0';   // 1.5.0 (2026-11-24, owner: "a place you can see all of the LPs being bribed… what Votion plans… the resulting APR… what if I added $X — the winner against the losers"): board() — one bucket, every bribed pool and every pool Votion votes, three states side by side (now → Votion's plan → with your bribe), each vault's published plan to check against Votion's own page, and the totals that must balance.   // 1.4.0 (2026-11-24): VOTION'S OWN RULE. Its plan is not the split that earns it most (what this library solved until now) — it fills pools until every pool it uses pays the same bribe per vote: a = max(0, pot ÷ c − votes already there). That reproduces 200 of 200 plans it published 22–24 Nov; the old solve matched 88, missing by 12 points on average. Pool votes are boost + fixed (tla-snapshot 1.2.0's total — what the chain pays on and what Votion counts; boost alone read 10–12% low), and a pool off its gauge's reward list earns nothing and is not in the 1% line's total. whatItTakes() says the pot a pool needs before Votion adds its first vote, and what it would need if Votion's list offered it.   // 1.3.0: Votion's MOVE RULE from its own history (votion/backtest/move-rule.json: re-votes a bucket when gain > $0.05 AND split differs > 5% — 27,196/27,196 captures): a vault that would hold keeps its votes; decisions + track record returned   // 1.2.0: real cost = bribe − the change in YOUR bribe income (dilution + votes moved away count); Best impact ranks pools Votion is offered (untested on request)   // 1.1.0: curated alerts (lp-grades `alerts`, from docs/curated/alerts.json) — a pool whose asset is winding down (USDC.n) is flagged and never recommended
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var URLS = {
    snapshot: CORE + 'member-data/tla-snapshot/current.json',
    votion: CORE + 'votion/optimization/current.json',
    participants: CORE + 'member-data/participants/current.json',
    grades: CORE + 'lp-grades/snapshots/current.json',
    pd: CORE + 'tla-voting/pd-bribes/current.json',
    prices: CORE + 'network-and-prices/current.json',
    catalog: CORE + 'token-catalog/snapshots/current.json',
    moveRule: CORE + 'votion/backtest/move-rule.json'
  };
  var INCENTIVE_MANAGER = 'terra1tuuwm8yrj54qeg0c8xu00aha9ryatyhtczq8qq2q8tntuw0auzas9037wh';
  var VOTION_VAULTS = ['ampluna-max', 'arbluna-max'];
  var WEEKS_PER_YEAR = 52.18;
  var LINE = 0.01;                 // a pool needs ≥ 1% of its bucket's votes to earn emissions (and pay its pot)
  var VOTION_MOVE_USD = 0.05;      // superseded by m.moveRule (the fitted rule); kept for callers of 1.x
  var MOVE_RULE_DEFAULT = { gain_usd_gt: 0.05, deviation_pct_gt: 5 };   // votion/backtest/move-rule.json — the product wins when it loads
  var MIN_TVL = 1000;             // a pool with less than $1,000 staked in TLA gets no APR and no lens row (a few dollars of TVL reads 6,880%)
  var BUCKETS = ['stable', 'project', 'bluechip', 'single'];
  var BUCKET_LABEL = { stable: 'Stable', project: 'Project', bluechip: 'Bluechip', single: 'Single' };

  var bare = function (gid) { return String(gid || '').replace(/^(cw20|native):/, ''); };
  var keyOf = function (bucket, gid) { return String(bucket || '').toLowerCase() + '|' + bare(gid); };
  var num = function (x) { var n = Number(x); return isFinite(n) ? n : 0; };

  // ---------------------------------------------------------------- pricing (catalog symbol → the feed's final price)
  function pricer(prices, catalog) {
    var tp = (prices && prices.token_prices) || {}; var toks = (catalog && catalog.tokens) || [];
    var byDenom = {}; toks.forEach(function (t) { byDenom[t.denom] = t; });
    function symOf(den) { var t = byDenom[den]; return t ? ((t.effective && t.effective.symbol) || (t.discovered && t.discovered.symbol) || null) : null; }
    function decOf(den) { var t = byDenom[den]; if (!t) return 6; if (t.effective && t.effective.decimals != null) return t.effective.decimals; if (t.discovered && t.discovered.decimals != null) return t.discovered.decimals; return 6; }
    function usdOf(sym) { var t = tp[sym]; var v = t ? num(t.final_price_usd || t.price) : 0; return v > 0 ? v : 0; }
    return { symOf: symOf, decOf: decOf, usdOf: usdOf, luna: usdOf('LUNA') };
  }
  // one pot: [{ info:{native|cw20}, amount }] (raw) → { usd, tokens:[{sym, amount, usd}], unpriced:[] }
  function pricePot(assets, P) {
    var out = { usd: 0, tokens: [], unpriced: [] };
    (assets || []).forEach(function (a) {
      var den = a.info && (a.info.native || a.info.cw20); var sym = P.symOf(den); var human = num(a.amount) / Math.pow(10, P.decOf(den)); var px = P.usdOf(sym);
      out.tokens.push({ sym: sym || String(den || '?').slice(0, 14), amount: human, usd: px ? human * px : null });
      if (px) out.usd += human * px; else out.unpriced.push(sym || den);
    });
    return out;
  }

  // ---------------------------------------------------------------- the model
  // build({ snapshot, votion, grades, pd, prices, catalog, participants?, live? }) → model
  function build(inp) {
    var S = inp.snapshot || {}; var O = inp.votion || {}; var P = pricer(inp.prices, inp.catalog);
    var epoch = (S.epoch && S.epoch.currentEpoch) || null; var period = O.period || epoch;
    var m = { version: VERSION, epoch: epoch, period: period, voteBefore: O.voteBefore || null, capturedAt: S.capturedAt || null,
      votionAt: O.capturedAt || null, luna: P.luna, moveRule: Object.assign({}, MOVE_RULE_DEFAULT, (inp.moveRule && inp.moveRule.rule) || {}), moveRuleDoc: inp.moveRule || null, buckets: {}, pools: {}, vaults: [], voters: null, potSource: 'captured', liveAt: null, _P: P };
    BUCKETS.forEach(function (b) { var bb = (S.buckets || {})[b] || {}; m.buckets[b] = { key: b, label: BUCKET_LABEL[b], weeklyUsd: num(bb.rewards && bb.rewards.weekly_rewards_usd), pks: [] }; });
    // grades (by gauge id + bucket)
    var G = {}; ((inp.grades && inp.grades.pools) || []).forEach(function (g) { G[keyOf(g.bucket, g.gauge_pool_id)] = g; });
    // PD this period (chain-verified placements, display units per denom)
    var pdE = inp.pd && inp.pd.by_epoch && inp.pd.by_epoch[String(period)]; var pdPools = (pdE && pdE.pools) || {};
    (S.pools || []).forEach(function (p) {
      var b = String(p.bucket || '').toLowerCase(); if (!m.buckets[b]) return; if (p.status === 'deprecated') return;
      var pk = keyOf(b, p.gauge_pool_id); var g = G[pk] || null; var v2 = g && g.v2;
      var payingNow = pricePot([].concat.apply([], ((p.bribes && p.bribes.active_now) || []).map(function (x) { return x.assets || []; })), P);   // paying NOW (last round's votes) — context only
      var pot = { usd: 0, tokens: [], unpriced: [] };   // the pot for the round being voted — filled from Votion's period list below, or live
      var pd = pdPools[p.gauge_pool_id]; var pdUsd = 0; if (pd && String(pd.gauge || '').toLowerCase() === b) Object.keys(pd.by_denom || {}).forEach(function (d) { var den = d.replace(/^(native|cw20):/, ''); pdUsd += num(pd.by_denom[d]) * P.usdOf(P.symOf(den)); });
      var util = v2 && v2.raw && v2.raw.util != null ? num(v2.raw.util) : null; var depth = num(p.depth_usd || (g && g.depth_usd));
      m.pools[pk] = { pk: pk, gid: p.gauge_pool_id, bare: bare(p.gauge_pool_id), name: p.name, bucket: b, dex: p.dex || '', status: p.status,
        // 1.4.0: boost + fixed where the snapshot has it (tla-snapshot 1.2.0) — the figure the chain's distribution records and Votion's own
        // optimizer counts (LUNA-FUEL 24 Nov: ours 9.450M, Votion's 9.451M; boost alone 8.481M)
        vp: num(p.voting_power && (p.voting_power.total_human != null ? p.voting_power.total_human : p.voting_power.vp_human)), vpBoost: num(p.voting_power && p.voting_power.vp_human), stakedUsd: num(p.staked_in_tla_usd), depthUsd: depth,
        offList: p.gauge_whitelisted === false || p.status_reason === 'dewhitelisted',   // off its gauge's reward list: old votes may sit on it, it earns nothing and is not in the 1% line's total
        weeklyUsdNow: num(p.rewards && p.rewards.weekly_emissions_usd), aprNow: p.rewards && p.rewards.approx_apr_pct != null ? num(p.rewards.approx_apr_pct) : null,
        pot: pot, potUsd: 0, potSource: 'none', payingNowUsd: payingNow.usd,
        grade: (v2 && v2.letter) || (g && g.grade) || null, gradeScore: v2 && v2.composite != null ? v2.composite : null, gradeWhy: (v2 && v2.why) || null,
        vol7dUsd: util != null && depth ? util * depth : null, pdUsd: pdUsd, votionNow: 0, votionPlan: 0,
        // curated alerts, stamped per pool upstream (lp-grades from docs/curated/alerts.json via the token-catalog underlyings) —
        // asset migrating / winding_down = the pair is going away (USDC.n → USDC.inj): flagged everywhere, never recommended (T3.21's rule)
        alerts: (g && g.alerts) || [], winding: ((g && g.alerts) || []).filter(function (a) { return a.kind === 'asset' && (a.status === 'migrating' || a.status === 'winding_down'); })[0] || null,
        forum: ((g && g.alerts) || []).filter(function (a) { return a.kind === 'forum'; })[0] || null };
      m.buckets[b].pks.push(pk);
    });
    // Votion: vault VP, its current votes (activeVoted %), its published plan, and the pots it priced (fallback)
    VOTION_VAULTS.forEach(function (vk) {
      var v = O.vaults && O.vaults[vk]; if (!v || !Array.isArray(v.optimizations)) return;
      var vault = { key: vk, byBucket: {} };
      v.optimizations.forEach(function (o) {
        var b = String(o.id || '').toLowerCase(); if (!m.buckets[b]) return; var vp = num(o.votingPower); var cur = {}; var plan = {};
        Object.keys(o.activeVoted || {}).forEach(function (id) { var pk = b + '|' + id; cur[pk] = vp * num(o.activeVoted[id]) / 100; });
        ((o.optimization && o.optimization.votes) || []).forEach(function (x) { plan[b + '|' + x.id] = num(x.votingPowerToAllocate); });
        var options = (o.votingOptions || []).map(function (q) { return b + '|' + q.id; });
        (o.votingOptions || []).forEach(function (q) { var pk = b + '|' + q.id; var pool = m.pools[pk]; if (!pool) return; pool.inVotion = true; pool.votionPotUsd = num(q.usdIncentives); });   // what Votion believes the pot is worth — it steers by this
        // the period's pots (every funded gauge of the bucket, incl. ones Votion leaves out) — once, from the first vault that lists them
        (o.bribes || []).forEach(function (bb) { var id = bb.asset && (bb.asset.cw20 || bb.asset.native); var pk = b + '|' + id; var pool = m.pools[pk]; if (!pool || pool.potSource === 'votion-list') return;
          pool.pot = pricePot(bb.assets, P); pool.potUsd = pool.pot.usd; pool.potSource = 'votion-list'; });
        vault.byBucket[b] = { vp: vp, current: cur, plan: plan, options: options, diff: o.diff || null };
        Object.keys(cur).forEach(function (pk) { if (m.pools[pk]) m.pools[pk].votionNow += cur[pk]; });
        Object.keys(plan).forEach(function (pk) { if (m.pools[pk]) m.pools[pk].votionPlan += plan[pk]; });
      });
      m.vaults.push(vault);
    });
    // UNITS: Votion counts boost + fixed voting power. Against a snapshot that only has the boost part (before tla-snapshot 1.2.0) its
    // view of every gauge reads ~12% above ours; its vault budgets and votes are then converted per bucket (k = its gauge totals ÷
    // ours on the same gauges). With boost + fixed on both sides k is 1.00 and nothing is converted.
    m.vpScale = {};
    Object.keys(m.buckets).forEach(function (b) {
      var first = m.vaults[m.vaults.length - 1] && m.vaults[m.vaults.length - 1].byBucket[b]; var raw = O.vaults && O.vaults[VOTION_VAULTS[m.vaults.length - 1]];
      var ob = raw && (raw.optimizations || []).filter(function (x) { return String(x.id).toLowerCase() === b; })[0]; if (!first || !ob) { m.vpScale[b] = 1; return; }
      var theirs = 0, ours = 0; (ob.votingOptions || []).forEach(function (q) { var pk = b + '|' + q.id; var pool = m.pools[pk]; if (!pool) return; theirs += num(q.votingPower) + num(first.current[pk]); ours += pool.vp; });
      var k = ours > 0 && theirs > 0 ? theirs / ours : 1; if (!(k > 0.8 && k < 1.5)) k = 1; m.vpScale[b] = k;
      m.vaults.forEach(function (v) { var vb = v.byBucket[b]; if (!vb) return; vb.vp /= k; Object.keys(vb.current).forEach(function (pk) { vb.current[pk] /= k; }); Object.keys(vb.plan).forEach(function (pk) { vb.plan[pk] /= k; }); });
    });
    Object.keys(m.pools).forEach(function (pk) { var p = m.pools[pk]; p.votionNow = 0; p.votionPlan = 0; });
    m.vaults.forEach(function (v) { Object.keys(v.byBucket).forEach(function (b) { var vb = v.byBucket[b]; Object.keys(vb.current).forEach(function (pk) { if (m.pools[pk]) m.pools[pk].votionNow += vb.current[pk]; }); Object.keys(vb.plan).forEach(function (pk) { if (m.pools[pk]) m.pools[pk].votionPlan += vb.plan[pk]; }); }); });
    // a pool that is FUNDED for the round but is not among the pools Votion's optimizer weighs (its votingOptions): the pot counts for
    // nothing in its plan while that lasts, so a bribe there pays the other voters only. Votion's output does not say why a pool is
    // missing, and it is not a standing rule — 1 Oct–24 Nov 2026 every funded pool was weighed on 50 of 55 days — so this is a reading of
    // the capture in hand, nothing more. A pool with no pot is simply not weighed (nothing to weigh).
    Object.keys(m.pools).forEach(function (pk) { var p = m.pools[pk]; p.votionExcluded = !p.inVotion && p.potUsd > 0.5; if (p.votionPotUsd == null) p.votionPotUsd = p.votionExcluded ? 0 : p.potUsd;
      // a token our feed cannot price (wBTC.atom today) would understate the pot — Votion's own price stands in, labelled
      if (p.pot.unpriced.length && p.votionPotUsd > p.potUsd) { p.potUsd = p.votionPotUsd; p.potPricedBy = 'votion'; }
      p.capturedPotUsd = p.potUsd;
      // never offered to Votion this round and no Votion votes: a projection there assumes Votion would take a new pot — untested
      p.votionUntested = !p.inVotion && !p.votionExcluded && p.votionNow < 1000 && p.votionPlan < 1000; });
    nameRawPools(m, O, P, inp.catalog);
    // a pool lp-grades did not grade carries no stamp — the same rule from the catalog: any underlying that IS the alert's asset
    // (its denom, or the catalog symbol it names) marks the pool. Alerts are the ones lp-grades already stamped (the curated registry).
    var assetAlerts = {}; ((inp.grades && inp.grades.pools) || []).forEach(function (g) { (g.alerts || []).forEach(function (a) { if (a.kind === 'asset' && (a.status === 'migrating' || a.status === 'winding_down')) assetAlerts[a.id] = a; }); });
    var catPools = {}; ((inp.catalog && inp.catalog.pools) || []).forEach(function (c) { if (c && c.gauge_pool_id) catPools[c.gauge_pool_id] = c; });
    Object.keys(m.pools).forEach(function (pk) { var p = m.pools[pk]; if (p.winding) return; var c = catPools[p.gid]; var u = (c && c.underlyings) || [];
      Object.keys(assetAlerts).forEach(function (id) { var a = assetAlerts[id]; if (p.winding) return;
        if (u.some(function (d) { var den = String(d).replace(/^(native|cw20):/, ''); return (a.denom && den === a.denom) || (a.symbol && P.symOf(den) === a.symbol); })) { p.winding = a; p.alerts = p.alerts.concat([a]); } }); });
    if (inp.participants) attachVoters(m, inp.participants);
    if (inp.live) applyLivePots(m, inp.live);
    return m;
  }
  // T6.8's rule (tla-stats): a pool the snapshot names by its raw address takes Votion's plan title, else its catalog underlyings;
  // a non-active twin of an active pool (same name, dex, bucket) is "(old)"
  function nameRawPools(m, O, P, catalog) {
    var RAW = /^(cw20|native):|^terra1[0-9a-z]{38,}$|^Unknown$|^$/; var titles = {};
    Object.keys((O && O.aggregate) || {}).forEach(function (g) { var gd = O.aggregate[g]; Object.keys((gd && gd.pools) || {}).forEach(function (pid) { var pp = gd.pools[pid]; if (pp && pp.title) titles[pid] = String(pp.title).replace(/\s+LP(\s*\(S\))?$/, '').trim(); }); });
    var cat = {}; ((catalog && catalog.pools) || []).forEach(function (c) { if (c && c.gauge_pool_id) cat[c.gauge_pool_id] = c; });
    Object.keys(m.pools).forEach(function (pk) { var p = m.pools[pk]; if (!RAW.test(String(p.name || ''))) return; var nm = titles[p.bare] || null;
      if (!nm) { var c = cat[p.gid]; var u = c && Array.isArray(c.underlyings) ? c.underlyings.map(function (d) { return P.symOf(String(d).replace(/^(native|cw20):/, '')); }) : []; if (u.length && u.every(Boolean)) nm = u.join('-'); }
      if (nm) { p.nameRaw = p.name; p.name = nm; } else p.name = p.bare.slice(0, 10) + '…'; });
    var groups = {}; Object.keys(m.pools).forEach(function (pk) { var p = m.pools[pk]; var k = p.name + '|' + (p.dex || '') + '|' + p.bucket; (groups[k] = groups[k] || []).push(p); });
    Object.keys(groups).forEach(function (k) { var g = groups[k]; if (g.length < 2) return; var act = g.filter(function (p) { return p.status === 'active'; }); if (!act.length) return; g.forEach(function (p) { if (p.status !== 'active') p.name += ' (old)'; }); });
  }
  function attachVoters(m, participants) {
    m.voters = {};
    ((participants && participants.members) || []).forEach(function (x) {
      var vt = x.voting || {}; var vp = num(vt.total_voting_power_human); var votes = {};
      Object.keys(vt.votes_per_bucket || {}).forEach(function (b) { var info = vt.votes_per_bucket[b] || {}; (info.votes || []).forEach(function (v) { var pk = keyOf(b, v.pool_gauge_id); votes[pk] = (votes[pk] || 0) + vp * num(v.weight_bps) / 10000; }); });
      m.voters[x.wallet] = { wallet: x.wallet, name: x.name || null, vp: vp, votes: votes, lp: (x.lp_positions || []).map(function (l) { return { pk: keyOf(l.bucket, l.pool_gauge_id), name: l.pool_name, usd: num(l.estimated_position_usd), pct: num(l.user_pct_of_pool) }; }) };
    });
    return m;
  }
  // live pots: { period, at, pots: { 'bucket|bare': { usd, tokens, unpriced } } } — wins over the capture for the voted period
  function applyLivePots(m, live) {
    if (!live || Number(live.period) !== Number(m.period)) return m;
    Object.keys(m.pools).forEach(function (pk) { var lp = live.pots[pk]; var p = m.pools[pk]; p.pot = lp || { usd: 0, tokens: [], unpriced: [] }; p.potUsd = lp ? lp.usd : 0; p.potSource = 'live';
      var vScale = p.inVotion && p.capturedPotUsd > 0 && p.pot.tokens.length && !p.pot.unpriced.length ? p.votionPotUsd / p.capturedPotUsd : 1;
      p.votionPotUsd = p.votionExcluded ? 0 : p.potUsd * vScale;
      if (p.pot.unpriced.length && p.inVotion && p.capturedPotUsd > p.potUsd) { p.potUsd = p.capturedPotUsd; p.votionPotUsd = p.capturedPotUsd; p.potPricedBy = 'votion'; } });
    m.potSource = 'live'; m.liveAt = live.at; return m;
  }
  async function fetchLivePots(m, lcd, fetchImpl) {
    var f = fetchImpl || fetch; var q = (typeof btoa === 'function' ? btoa : function (s) { return Buffer.from(s).toString('base64'); })(JSON.stringify({ bribes: { period: { period: Number(m.period) } } }));
    var r = await f((lcd || 'https://terra-lcd.publicnode.com') + '/cosmwasm/wasm/v1/contract/' + INCENTIVE_MANAGER + '/smart/' + q).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; });
    var buckets = r && r.data && r.data.buckets; if (!Array.isArray(buckets)) return null;
    var out = {}; var P = m._P;
    var walk = function (b, gname) { var gauge = String(b.gauge || gname || '').toLowerCase(); var items = Array.isArray(b.bribes) ? b.bribes : (b.asset ? [b] : []);
      items.forEach(function (it) { var id = (it.asset && (it.asset.cw20 || it.asset.native)) || ''; if (!id) return; var k = gauge + '|' + id; var pp = pricePot(it.assets, P); var rec = out[k] || (out[k] = { usd: 0, tokens: [], unpriced: [] }); rec.usd += pp.usd; rec.tokens = rec.tokens.concat(pp.tokens); rec.unpriced = rec.unpriced.concat(pp.unpriced); });
      if (Array.isArray(b.buckets)) b.buckets.forEach(function (bb) { walk(bb, b.gauge); }); };
    buckets.forEach(function (b) { walk(b, null); });
    return { period: Number(m.period), at: new Date().toISOString(), pots: out };
  }
  async function load(opts) {
    opts = opts || {}; var f = opts.fetch || fetch; var U = Object.assign({}, URLS, opts.urls || {});
    var get = function (u) { return f(u + (opts.bust ? (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now() : ''), { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u.split('/main/')[1]); return r.json(); }); };
    var soft = function (u) { return get(u).catch(function () { return null; }); };
    var res = await Promise.all([get(U.snapshot), get(U.votion), soft(U.grades), soft(U.pd), get(U.prices), soft(U.catalog), soft(U.moveRule)]);
    var m = build({ snapshot: res[0], votion: res[1], grades: res[2], pd: res[3], prices: res[4], catalog: res[5], moveRule: res[6] });
    m.loadVoters = function () { return m.voters ? Promise.resolve(m) : soft(U.participants).then(function (pj) { if (pj) attachVoters(m, pj); else m.voters = {}; return m; }); };
    return m;
  }

  // ---------------------------------------------------------------- the solver
  // max Σ b·a/(V+a) s.t. Σ a = budget → a = max(0, √(bV/λ) − V); λ by bisection on a log scale
  function waterFill(opts, budget) {
    var ok = opts.filter(function (o) { return o.b > 0; }); var out = {}; opts.forEach(function (o) { out[o.pk] = 0; });
    if (!ok.length || !(budget > 0)) return out;
    var f = function (lam) { var s = 0; ok.forEach(function (o) { var V = Math.max(1, o.V); s += Math.max(0, Math.sqrt(o.b * V / lam) - V); }); return s; };
    var lo = 1e-24, hi = 1e6; for (var i = 0; i < 160; i++) { var mid = Math.sqrt(lo * hi); if (f(mid) > budget) lo = mid; else hi = mid; }
    ok.forEach(function (o) { var V = Math.max(1, o.V); out[o.pk] = Math.max(0, Math.sqrt(o.b * V / hi) - V); });
    return out;
  }
  // VOTION'S OWN RULE (1.4.0) — read off its published plans, not assumed: it gives pools votes until every pool it uses pays the same
  // bribe per vote:  a = max(0, b ÷ c − V),  c set so the a's add up to the vault's VP. c is its going rate ($ per vote). A pool gets
  // nothing while b ÷ V < c — votes already on a pool count against it. This is NOT the split that earns the vault most (waterFill
  // above is — it equalises what the NEXT vote earns); it is what Votion does: 200 of 200 plans of 22–24 Nov 2026 within 0.05 points.
  function votionSolve(opts, budget) {
    var ok = opts.filter(function (o) { return o.b > 0; }); var a = {}; opts.forEach(function (o) { a[o.pk] = 0; });
    if (!ok.length || !(budget > 0)) return { a: a, c: null };
    var f = function (c) { var t = 0; ok.forEach(function (o) { t += Math.max(0, o.b / c - Math.max(0, o.V)); }); return t; };
    var lo = 1e-18, hi = 1e9; for (var i = 0; i < 200; i++) { var mid = Math.sqrt(lo * hi); if (f(mid) > budget) lo = mid; else hi = mid; }
    ok.forEach(function (o) { a[o.pk] = Math.max(0, o.b / hi - Math.max(0, o.V)); });
    return { a: a, c: hi };
  }
  function votionFill(opts, budget) { return votionSolve(opts, budget).a; }
  var payout = function (b, V, a) { return b > 0 && a > 0 ? b * a / (V + a) : 0; };

  // outcome(m, bucket, { add:{pk:$}, mine:{pk:vp}, mineNow:{pk:vp}, votion:'solve'|'plan'|'now' }) → the bucket at close
  //   mine    — the simulated wallet's votes in this bucket (plan); mineNow — its votes today (removed from "others")
  function outcome(m, bucket, s) {
    s = s || {}; var add = s.add || {}; var mine = s.mine || {}; var mineNow = s.mineNow || {}; var B = m.buckets[bucket]; if (!B) return null;
    var pks = B.pks.slice(); Object.keys(add).forEach(function (pk) { if (pk.indexOf(bucket + '|') === 0 && pks.indexOf(pk) < 0 && m.pools[pk]) pks.push(pk); });
    // potV = the pot as Votion counts it. A pool its list leaves out counts for nothing — unless the caller asks "what if it were offered"
    // (s.offer[pk]): then the pot at our prices stands in, since Votion publishes no figure for a pool it does not list.
    var offer = s.offer || {};
    var pot = {}, potV = {}, others = {}; pks.forEach(function (pk) { var p = m.pools[pk]; pot[pk] = Math.max(0, (p.potUsd || 0) + num(add[pk])); potV[pk] = p.votionExcluded ? (offer[pk] ? Math.max(0, (p.potUsd || 0) + num(add[pk])) : 0) : Math.max(0, (p.votionPotUsd || 0) + num(add[pk])); others[pk] = Math.max(0, p.vp - p.votionNow - num(mineNow[pk])); });
    // Votion's votes at close
    var vot = {}; pks.forEach(function (pk) { vot[pk] = 0; });
    // the bot casts vault by vault and each one sees the votes the earlier ones just placed; the largest goes first here (the order seen on chain is not fixed)
    var perVault = m.vaults.map(function (v) { var vb = v.byBucket[bucket]; return vb ? { key: v.key, vb: vb, a: Object.assign({}, vb.current) } : null; }).filter(Boolean).sort(function (x, y) { return y.vb.vp - x.vb.vp; });
    var decisions = [];
    var mode = s.votion || 'solve';
    if (mode === 'solve') {
      var R = m.moveRule;
      perVault.forEach(function (pv, i) {
        var universe = pks.filter(function (pk) { return potV[pk] > 0; });
        var Vof = function (pk) { var V = others[pk] + num(mine[pk]); perVault.forEach(function (q, j) { if (j !== i) V += num(q.a[pk]); }); return V; };
        var opts = universe.map(function (pk) { return { pk: pk, b: potV[pk], V: Vof(pk) }; });
        var sol = votionSolve(opts, pv.vb.vp); var solved = sol.a; var cur = pv.vb.current;   // 1.4.0: Votion's own rule (was the best split)
        var seen = {}; pks.forEach(function (pk) { seen[pk] = Vof(pk); });   // the votes this vault finds on each pool when it casts
        // Votion's own test (move-rule.json): gain = its reward re-solved − its reward holding; deviation = Σ |Δ share of its VP| in %
        var rew = function (a) { var t = 0; pks.forEach(function (pk) { t += payout(potV[pk], Vof(pk), num(a[pk])); }); return t; };
        var gain = rew(solved) - rew(cur); var dev = 0; var ks = {}; Object.keys(solved).concat(Object.keys(cur)).forEach(function (k) { ks[k] = 1; });
        Object.keys(ks).forEach(function (k) { dev += Math.abs(num(solved[k]) - num(cur[k])) / Math.max(1, pv.vb.vp) * 100; });
        var computed = gain > R.gain_usd_gt && dev > R.deviation_pct_gt; var published = pv.vb.diff && typeof pv.vb.diff.isWorthChanging === 'boolean' ? pv.vb.diff.isWorthChanging : null;
        var moves = s.force && s.force[pv.key] != null ? s.force[pv.key] : (s.flags === 'computed' || published === null ? computed : published);
        pv.a = moves ? solved : Object.assign({}, cur);
        decisions.push({ vault: pv.key, moves: moves, computed: computed, published: published, gain: gain, deviation: dev, vp: pv.vb.vp, level: sol.c != null ? sol.c * 1e6 : null /* its going rate, $ per 1M VP */, seen: seen, alloc: pv.a /* 1.5.0: its votes after this decision */ });
      });
    } else if (mode === 'plan') perVault.forEach(function (pv) { pv.a = Object.assign({}, pv.vb.plan); });
    perVault.forEach(function (pv) { Object.keys(pv.a).forEach(function (pk) { if (vot[pk] != null) vot[pk] += num(pv.a[pk]); }); });
    // totals, the 1% line, next epoch's emissions and APR, payouts
    // 1.4.0: the chain's rule — the gauge's total is the votes on LISTED assets; a pool over 1% of that total qualifies; emissions are
    // split among the qualifying pools. A pool off the list keeps its old votes and earns nothing (it took a share here before).
    var rows = {}; var bucketVotes = 0, listedVotes = 0;
    pks.forEach(function (pk) { var t = others[pk] + vot[pk] + num(mine[pk]); var off = !!m.pools[pk].offList; rows[pk] = { pk: pk, others: others[pk], votion: vot[pk], mine: num(mine[pk]), votes: t, pot: pot[pk], potV: potV[pk], offList: off }; bucketVotes += t; if (!off) listedVotes += t; });
    var activeVotes = 0; pks.forEach(function (pk) { var r = rows[pk]; r.share = !r.offList && listedVotes > 0 ? r.votes / listedVotes : 0; r.active = !r.offList && r.share >= LINE; if (r.active) activeVotes += r.votes; });
    var myUsd = 0, votionUsd = 0;
    pks.forEach(function (pk) { var r = rows[pk]; var p = m.pools[pk];
      r.emShare = r.active && activeVotes > 0 ? r.votes / activeVotes : 0; r.weeklyUsd = B.weeklyUsd * r.emShare;
      r.apr = p.stakedUsd >= MIN_TVL ? r.weeklyUsd * WEEKS_PER_YEAR / p.stakedUsd * 100 : null;
      r.myUsd = r.active ? payout(r.pot, r.votes - r.mine, r.mine) : 0; r.votionUsd = payout(potV[pk], r.votes - r.votion, r.votion);   // Votion scores itself on its own view
      r.perMillion = r.votes > 0 && r.pot > 0 ? r.pot / (r.votes / 1e6) : null; myUsd += r.myUsd; votionUsd += r.votionUsd; });
    return { bucket: bucket, rows: rows, pks: pks, bucketVotes: bucketVotes, listedVotes: listedVotes, activeVotes: activeVotes, weeklyUsd: B.weeklyUsd, myUsd: myUsd, votionUsd: votionUsd, decisions: decisions };
  }
  // a change (a bribe, votes moved) flips a vault only when IT pushes the vault's own test over the line: the vault moves in the plan when
  // Votion already flags it (published), or when the plan passes the test and the unchanged state does not — model noise never invents a move
  function withChange(m, bucket, baseS, planS) {
    var base = outcome(m, bucket, Object.assign({}, baseS, { flags: baseS && baseS.flags === 'computed' ? 'computed' : 'published' }));   // 1.5.0: 'computed' when the base itself is a what-if (every pot counted) — Votion publishes no flag for that
    var baseC = outcome(m, bucket, Object.assign({}, baseS, { flags: 'computed' })); var planC = outcome(m, bucket, Object.assign({}, planS, { flags: 'computed' }));
    var force = {}; base.decisions.forEach(function (d, i) { var bc = baseC.decisions[i], pc = planC.decisions[i]; force[d.vault] = d.moves || (pc.computed && !bc.computed); });
    var plan = outcome(m, bucket, Object.assign({}, planS, { force: force }));
    plan.decisions.forEach(function (d, i) { d.flippedByChange = d.moves && !base.decisions[i].moves; d.gainFromChange = planC.decisions[i].gain - baseC.decisions[i].gain; });
    return { base: base, plan: plan };
  }
  // Votion's gain from re-voting vs holding its current votes, on the given scenario — its move signal
  function votionGain(m, bucket, s) {
    var solved = outcome(m, bucket, Object.assign({}, s, { votion: 'solve' })); var held = outcome(m, bucket, Object.assign({}, s, { votion: 'now' }));
    return solved && held ? solved.votionUsd - held.votionUsd : 0;
  }

  // ---------------------------------------------------------------- a wallet in a bucket
  function walletVotes(m, wallet, bucket) { var out = {}; if (!wallet || !wallet.votes) return out; Object.keys(wallet.votes).forEach(function (pk) { if (pk.indexOf(bucket + '|') === 0) out[pk] = wallet.votes[pk]; }); return out; }
  // move `pct` (0..1) of my votes from `from` ('all' = pro rata across my current votes · a pk · null = unallocated VP) to `to`
  function moveVotes(current, vp, from, to, pct) {
    var plan = Object.assign({}, current); var sum = Object.keys(current).reduce(function (s, k) { return s + current[k]; }, 0);
    var srcSum = Object.keys(current).reduce(function (s, k) { return k === to ? s : s + current[k]; }, 0);   // votes already on the target are not "moved"
    var moved = 0;
    if (from === 'all' && srcSum > 0) { var take = srcSum * pct; Object.keys(current).forEach(function (k) { if (k === to) return; var d = current[k] / srcSum * take; plan[k] = current[k] - d; moved += d; }); }
    else if (from && current[from]) { var d = current[from] * pct; plan[from] = current[from] - d; moved = d; }
    else { var free = Math.max(0, vp - sum); moved = free * pct; }
    if (to) plan[to] = (plan[to] || 0) + moved;
    Object.keys(plan).forEach(function (k) { if (plan[k] < 1e-6) delete plan[k]; });
    return { plan: plan, moved: moved };
  }
  // scenario(m, { bucket, target, bribeUsd, wallet:{vp, votes}|null, from, pct }) → the four answers
  function scenario(m, q) {
    var b = q.bucket; var w = q.wallet || null; var vp = w ? num(w.vp) : 0; var now = walletVotes(m, w, b);
    var mv = w && q.target && q.pct > 0 ? moveVotes(now, vp, q.from == null ? 'all' : q.from, q.target, q.pct) : { plan: now, moved: 0 };
    var add = {}; if (q.target && q.bribeUsd > 0) add[q.target] = q.bribeUsd;
    var wc = withChange(m, b, { mine: now, mineNow: now }, { add: add, mine: mv.plan, mineNow: now }); var base = wc.base, plan = wc.plan;
    var flows = plan.pks.map(function (pk) { return { pk: pk, name: m.pools[pk].name, d: plan.rows[pk].votion - (base.rows[pk] ? base.rows[pk].votion : 0) }; }).filter(function (x) { return Math.abs(x.d) >= 1000; }).sort(function (a, c) { return c.d - a.d; });
    var t = q.target && plan.rows[q.target]; var t0 = q.target && base.rows[q.target];
    var bribeBack = t && q.bribeUsd > 0 && t.active ? q.bribeUsd * t.mine / t.votes : 0;   // the share of my own bribe my votes collect
    return { bucket: b, target: q.target || null, bribeUsd: q.bribeUsd || 0, moved: mv.moved, base: base, plan: plan, flows: flows,
      votionIn: t && t0 ? t.votion - t0.votion : 0, myNow: base.myUsd, myPlan: plan.myUsd, bribeBack: bribeBack,
      netCost: (q.bribeUsd || 0) - (base.myUsd === undefined ? 0 : (plan.myUsd - base.myUsd)), incomeChange: plan.myUsd - base.myUsd, emissionsBought: t && t0 ? t.weeklyUsd - t0.weeklyUsd : 0,
      votionGain: plan.decisions.reduce(function (t, d) { return t + (d.gainFromChange || 0); }, 0), decisions: plan.decisions, baseDecisions: base.decisions,
      crossedUp: plan.pks.filter(function (pk) { return plan.rows[pk].active && base.rows[pk] && !base.rows[pk].active; }),
      crossedDown: plan.pks.filter(function (pk) { return !plan.rows[pk].active && base.rows[pk] && base.rows[pk].active; }) };
  }
  // the best split of `vp` in a bucket for bribes — the split that earns the wallet most (each next vote earns the same on every pool
  // used; not Votion's rule, which leaves a little on the table), iterated with Votion's reaction
  function bestSplit(m, bucket, vp, current) {
    current = current || {}; var mine = {}; var last = null;
    var ok = function (pk) { return !m.pools[pk].winding; };   // a pool whose asset is winding down is never part of the best split
    for (var it = 0; it < 12; it++) {
      var o = outcome(m, bucket, { mine: mine, mineNow: current });
      var opts = o.pks.filter(function (pk) { return o.rows[pk].pot > 0 && ok(pk); }).map(function (pk) { var r = o.rows[pk]; return { pk: pk, b: r.pot, V: r.votes - r.mine }; });
      var next = waterFill(opts, vp);
      // a pool my votes cannot lift over the 1% line pays nothing — drop it and re-solve
      var o2 = outcome(m, bucket, { mine: next, mineNow: current }); var dead = o2.pks.filter(function (pk) { return next[pk] > 0 && !o2.rows[pk].active; });
      if (dead.length) { opts = opts.filter(function (x) { return dead.indexOf(x.pk) < 0; }); next = waterFill(opts, vp); }
      Object.keys(next).forEach(function (pk) { mine[pk] = last ? 0.5 * next[pk] + 0.5 * (last[pk] || 0) : next[pk]; if (mine[pk] < 1) delete mine[pk]; });
      last = Object.assign({}, mine);
    }
    var tot = Object.keys(mine).reduce(function (s, k) { return s + mine[k]; }, 0); if (tot > 0) Object.keys(mine).forEach(function (k) { mine[k] = mine[k] / tot * vp; });
    var best = outcome(m, bucket, { mine: mine, mineNow: current }); var now = outcome(m, bucket, { mine: current, mineNow: current });
    var split = Object.keys(mine).map(function (pk) { return { pk: pk, name: m.pools[pk].name, vp: mine[pk], pct: vp > 0 ? mine[pk] / vp : 0, usd: best.rows[pk].myUsd, nowVp: num(current[pk]) }; }).sort(function (a, c) { return c.vp - a.vp; });
    var skipped = m.buckets[bucket].pks.filter(function (pk) { return m.pools[pk].winding && m.pools[pk].potUsd > 0; }).map(function (pk) { return m.pools[pk].name; });
    return { bucket: bucket, vp: vp, split: split, usd: best.myUsd, nowUsd: now.myUsd, gain: best.myUsd - now.myUsd, outcome: best, skipped: skipped };
  }
  function bestSplitAll(m, wallet) {
    var out = { buckets: {}, usd: 0, nowUsd: 0 }; var vp = wallet ? num(wallet.vp) : 0;
    BUCKETS.forEach(function (b) { var r = bestSplit(m, b, vp, walletVotes(m, wallet, b)); out.buckets[b] = r; out.usd += r.usd; out.nowUsd += r.nowUsd; });
    out.gain = out.usd - out.nowUsd; return out;
  }

  // ---------------------------------------------------------------- the overview: what $X does, per pool, and the lenses
  function impact(m, pk, usd) {
    var p = m.pools[pk]; var add = {}; add[pk] = usd; var wc = withChange(m, p.bucket, {}, { add: add }); var base = wc.base, sim = wc.plan;
    var r0 = base.rows[pk], r1 = sim.rows[pk];
    return { pk: pk, usd: usd, votionIn: r1.votion - r0.votion, votes0: r0.votes, votes1: r1.votes, share0: r0.share, share1: r1.share, active0: r0.active, active1: r1.active,
      weekly0: r0.weeklyUsd, weekly1: r1.weeklyUsd, emissionsBought: r1.weeklyUsd - r0.weeklyUsd, perDollar: usd > 0 ? (r1.weeklyUsd - r0.weeklyUsd) / usd : 0, apr0: r0.apr, apr1: r1.apr, votionNext: r0.votion };
  }
  var LENSES = [
    { key: 'impact', label: 'Best impact', hint: 'where your $ buys the most emissions for the pool' },
    { key: 'underdogs', label: 'Underdogs', hint: 'good grade, few votes — near or under the 1% line' },
    { key: 'liquidity', label: 'Liquidity', hint: 'the deepest pools' },
    { key: 'volume', label: 'Volume', hint: 'the most traded (7-day estimate from turnover)' },
    { key: 'pd', label: 'Needs PD support', hint: 'graded C or better, no Phoenix Directive bribe this round' },
    { key: 'leaving', label: 'Losing Votion', hint: 'Votion votes here now, and leaves when it casts' },
    { key: 'mine', label: 'My pools', hint: 'where the selected wallet provides liquidity', needsWallet: true }
  ];
  // lens(m, { lens, bucket:'all'|b, usd, wallet, limit }) → rows [{ pool, im, metric, sort }]
  function lens(m, q) {
    var usd = q.usd > 0 ? q.usd : 50; var limit = q.limit || 10; var bs = q.bucket && q.bucket !== 'all' ? [q.bucket] : BUCKETS;
    var pks = []; bs.forEach(function (b) { pks = pks.concat(m.buckets[b].pks); });
    pks = pks.filter(function (pk) { var p = m.pools[pk]; return p.stakedUsd >= MIN_TVL; });
    var baseCache = {}; var bRow = function (pk) { var b = m.pools[pk].bucket; if (!baseCache[b]) baseCache[b] = outcome(m, b, {}); return baseCache[b].rows[pk]; };
    var GR = { A: 0, B: 1, C: 2, D: 3, F: 4 }; var L = q.lens || 'impact'; var sel;
    if (L === 'impact' || L === 'underdogs' || L === 'pd') pks = pks.filter(function (pk) { return !m.pools[pk].winding && !m.pools[pk].offList; });   // never recommend a pair that is going away, or a pool off its gauge's reward list (it earns nothing)
    if (L === 'impact' && !q.untested) pks = pks.filter(function (pk) { return !m.pools[pk].votionUntested; });   // the $ number rests on Votion following — rank only pools it is offered unless asked
    if (L === 'underdogs') sel = pks.filter(function (pk) { var p = m.pools[pk]; var r = bRow(pk); return p.grade && GR[p.grade] <= 2 && r && r.share < 0.05; }).sort(function (a, c) { return (GR[m.pools[a].grade] - GR[m.pools[c].grade]) || (bRow(a).share - bRow(c).share); });
    else if (L === 'liquidity') sel = pks.filter(function (pk) { return m.pools[pk].depthUsd > 0; }).sort(function (a, c) { return m.pools[c].depthUsd - m.pools[a].depthUsd; });
    else if (L === 'volume') sel = pks.filter(function (pk) { return m.pools[pk].vol7dUsd > 0; }).sort(function (a, c) { return m.pools[c].vol7dUsd - m.pools[a].vol7dUsd; });
    else if (L === 'pd') sel = pks.filter(function (pk) { var p = m.pools[pk]; return !(p.pdUsd > 0) && p.grade && GR[p.grade] <= 2; }).sort(function (a, c) { return (m.pools[c].gradeScore || 0) - (m.pools[a].gradeScore || 0); });
    else if (L === 'leaving') sel = pks.filter(function (pk) { var p = m.pools[pk]; return p.votionNow > 50000 && p.votionPlan < p.votionNow * 0.5; }).sort(function (a, c) { return (m.pools[c].votionNow - m.pools[c].votionPlan) - (m.pools[a].votionNow - m.pools[a].votionPlan); });
    else if (L === 'mine') { var w = q.wallet; var mineSet = {}; ((w && w.lp) || []).forEach(function (l) { mineSet[l.pk] = (mineSet[l.pk] || 0) + l.usd; }); sel = pks.filter(function (pk) { return mineSet[pk] > 0; }).sort(function (a, c) { return mineSet[c] - mineSet[a]; }); }
    else sel = null;
    var rows;
    if (sel === null) { rows = pks.map(function (pk) { return { pool: m.pools[pk], im: impact(m, pk, usd) }; }).sort(function (a, c) { return c.im.emissionsBought - a.im.emissionsBought; }); }
    else rows = sel.map(function (pk) { return { pool: m.pools[pk], im: impact(m, pk, usd) }; });
    return rows.slice(0, limit);
  }
  // Votion's going rate — what one vote earns on the pools it uses once it has re-voted, $ per 1M VP: the median, over the pools it ends
  // on with a pot it counts, of pot ÷ every vote on the pool at close. The pot is at OUR prices, as every pot on the site is (Votion's
  // own differ by a percent or so, and its rule runs on those — so its pools end within that percent of one another, not to the cent).
  // 1.5.0: it was the biggest vault's own level, which sits above the rate the pools end on whenever the other vault has votes to bring
  // back (Project 24 Nov: $10.19 against $9.82 at close) — and the line a pot has to beat is the rate at close. No pool used: the lowest
  // level among the vaults that re-vote. Without a bucket: the median of the buckets that have one.
  function levelOf(o) { if (!o) return null; var ds = (o.decisions || []).filter(function (x) { return x.level != null; }); if (!ds.length) return null;
    var mv = ds.filter(function (x) { return x.moves; }); if (mv.length) return mv.reduce(function (t, x) { return Math.min(t, x.level); }, Infinity);
    return ds.sort(function (a, c) { return c.vp - a.vp; })[0].level; }
  function rateAtClose(o) { if (!o) return null;
    var xs = o.pks.map(function (pk) { return o.rows[pk]; }).filter(function (r) { return r.votion >= 50000 && r.potV > 0 && r.pot > 0 && r.votes > 0; }).map(function (r) { return r.pot / (r.votes / 1e6); }).sort(function (a, c) { return a - c; });
    return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : levelOf(o); }
  function votionLevel(m, bucket) { return rateAtClose(outcome(m, bucket, {})); }
  function votionRate(m, bucket) {
    if (bucket && bucket !== 'all') return votionLevel(m, bucket);
    var xs = BUCKETS.map(function (b) { return votionLevel(m, b); }).filter(function (x) { return x != null; }).sort(function (a, c) { return a - c; }); return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null;
  }
  // Votion's own next move (its published plan vs its current votes), biggest first
  function votionMoves(m, bucket) {
    return Object.keys(m.pools).filter(function (pk) { return !bucket || bucket === 'all' || m.pools[pk].bucket === bucket; }).map(function (pk) { var p = m.pools[pk]; return { pk: pk, name: p.name, bucket: p.bucket, d: p.votionPlan - p.votionNow, now: p.votionNow, plan: p.votionPlan }; }).filter(function (x) { return Math.abs(x.d) >= 50000; }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
  }
  // what it takes: the smallest bribe that gets Votion in / lifts the pool over the 1% line (null = not within $5,000)
  // 1.4.0 — the question people ask before they bribe ("how much before Votion votes here?"), answered from Votion's rule:
  //   level        Votion's going rate in the bucket, $ per 1M VP
  //   rate         what this pool pays now, $ per 1M VP (pot ÷ every vote on it) — under the level, Votion adds nothing
  //   entryUsd     the extra $ before Votion adds its first votes here (0 = it is already in; null = not within $5,000, or not offered)
  //   nextMillionUsd  after that, the extra $ for 1M VP more (the price climbs as Votion's votes are used up)
  //   perMillionWeekly  what 1M VP is worth to the pool's LPs, $ of emissions a week
  //   ifOffered    for a pool Votion's list leaves out: the same two prices if it were offered, at our price for its pot
  function whatItTakes(m, pk) {
    var p = m.pools[pk]; var find = function (test) { if (test(0)) return 0; var lo = 0, hi = 5000; if (!test(hi)) return null; for (var i = 0; i < 26; i++) { var mid = (lo + hi) / 2; if (test(mid)) hi = mid; else lo = mid; } return Math.ceil(hi); };
    var base = outcome(m, p.bucket, {}); var thr = base.rows[pk].votion + 250000; var r0 = base.rows[pk];
    var votionAt = function (x, off) { var a = {}; a[pk] = x; var s1 = { add: a }; var s0 = {}; if (off) { s1.offer = {}; s1.offer[pk] = true; s0.offer = s1.offer; } return withChange(m, p.bucket, s0, s1).plan.rows[pk].votion; };
    var prices = function (off) { var v0 = off ? votionAt(0, true) : r0.votion; var e = v0 >= 50000 ? 0 : find(function (x) { return votionAt(x, off) >= v0 + 50000; });
      var n = e == null ? null : find(function (x) { return votionAt(x, off) >= Math.max(v0, 50000) + 1e6; }); return { votionNow: v0, entryUsd: e, nextMillionUsd: e != null && n != null ? Math.max(0, n - e) : null }; };
    var out = {
      votionAlready: base.rows[pk].votion >= 250000, votionExcluded: !!p.votionExcluded,
      votionIn: p.votionExcluded ? null : find(function (x) { var a = {}; a[pk] = x; var o = withChange(m, p.bucket, {}, { add: a }).plan; return o.rows[pk].votion >= thr; }),
      overLine: base.rows[pk].active ? 0 : find(function (x) { var a = {}; a[pk] = x; var o = withChange(m, p.bucket, {}, { add: a }).plan; return o.rows[pk].active; }),
      level: votionLevel(m, p.bucket), rate: r0.votes > 0 && r0.pot > 0 ? r0.pot / (r0.votes / 1e6) : (r0.votes > 0 ? 0 : null), votes: r0.votes, votionVotes: r0.votion, potUsd: r0.pot, offList: !!p.offList,
      perMillionWeekly: base.activeVotes > 0 ? base.weeklyUsd / base.activeVotes * 1e6 : null
    };
    if (p.votionExcluded) { out.entryUsd = null; out.nextMillionUsd = null; out.ifOffered = prices(true); }
    else { var pr = prices(false); out.entryUsd = pr.entryUsd; out.nextMillionUsd = pr.nextMillionUsd; out.ifOffered = null; }
    return out;
  }

  // ---------------------------------------------------------------- the board: one bucket, every bribed pool, three states side by side
  // board(m, bucket, { pk, usd, all, counted }) →
  //   now     the votes on chain and this epoch's APR (the snapshot's own figures)
  //   plan    what Votion does when it casts if nothing else changes (its rule, vault by vault) → next epoch's emissions and APR
  //   whatIf  the same with `usd` added to `pk` — every row moves, so the pool that gains can be read against the pools that pay for it
  // counted — which pots Votion weighs:
  //   'published' (default)  the pools its optimizer lists right now
  //   'all'                  every pot of the bucket (what it did on 50 of the 55 days to 24 Nov 2026), at our price for a pot it gives no
  //                          figure for. Votion publishes no decision for this reading, so each vault follows the fitted move test.
  //   Every row and the what-if carry `other`: the same figures under the other reading ("if Votion counted this pot…").
  // Rows: every pool with a pot this round, every pool Votion votes now or would vote under either reading, the what-if pool; `all` adds
  // every other paid pool. `totals` are over the whole bucket, shown or not — Votion's VP is only moved, the bucket's emissions only re-divided.
  function boardRun(m, bucket, offer, mode, add) {
    var bs = mode === 'all' ? { offer: offer, flags: 'computed' } : {}; var ps = mode === 'all' ? { offer: offer } : {}; if (add) ps.add = add;
    var wc = withChange(m, bucket, bs, ps); return { plan: wc.base, sim: add ? wc.plan : null };
  }
  function boardLeft(m, bucket) { return m.buckets[bucket].pks.filter(function (pk) { return m.pools[pk].votionExcluded; }); }   // funded, not weighed by Votion's optimizer right now
  function board(m, bucket, q) {
    q = q || {}; var B = m.buckets[bucket]; if (!B) return null;
    var has = !!(q.pk && q.usd > 0 && m.pools[q.pk] && m.pools[q.pk].bucket === bucket); var add = null; if (has) { add = {}; add[q.pk] = q.usd; }
    var left = boardLeft(m, bucket); var offer = {}; left.forEach(function (pk) { offer[pk] = true; });
    var mode = q.counted === 'all' && left.length ? 'all' : 'published'; var otherMode = mode === 'all' ? 'published' : 'all';
    var R = boardRun(m, bucket, offer, mode, add); var O = left.length ? boardRun(m, bucket, offer, otherMode, add) : null; var plan = R.plan, sim = R.sim;
    var lvl = rateAtClose;
    var vaults = m.vaults.map(function (v) { return { key: v.key, vb: v.byBucket[bucket] }; }).filter(function (v) { return v.vb && v.vb.vp > 0; });
    var votionVp = vaults.reduce(function (t, v) { return t + v.vb.vp; }, 0);
    var dec = function (o, key) { return (o.decisions || []).filter(function (x) { return x.vault === key; })[0] || null; };
    var allocPct = function (o, v, pk) { var d = o && dec(o, v.key); return d && d.alloc ? num(d.alloc[pk]) / v.vb.vp * 100 : null; };
    var big = function (o, pk) { return !!(o && o.rows[pk] && o.rows[pk].votion >= 50000); };
    var show = function (pk) { var p = m.pools[pk]; if (has && pk === q.pk) return true;
      if (p.potUsd > 0.5 || p.votionNow >= 50000 || big(plan, pk) || big(sim, pk) || (O && (big(O.plan, pk) || big(O.sim, pk)))) return true;
      return !!q.all && !p.offList && (p.stakedUsd >= MIN_TVL || plan.rows[pk].votes >= 100000); };
    var per = function (pot, votes) { return votes > 0 ? pot / (votes / 1e6) : null; };
    var rows = plan.pks.filter(show).map(function (pk) { var p = m.pools[pk], r = plan.rows[pk], x = sim ? sim.rows[pk] : null; var act = p.status === 'active';
      var row = { pk: pk, name: p.name, pool: p, target: has && pk === q.pk, potUsd: p.potUsd || 0, added: has && pk === q.pk ? q.usd : 0, tokens: (p.pot && p.pot.tokens) || [],
        // weighed: Votion's optimizer lists it now · counted: this board's reading weighs its pot · excluded: funded and not listed now
        weighed: !!p.inVotion, excluded: !!p.votionExcluded, counted: (p.potUsd > 0.5 || (has && pk === q.pk)) && !p.offList && (!p.votionExcluded || mode === 'all'), offList: !!p.offList,
        votesNow: p.vp, votionNow: p.votionNow, othersNow: Math.max(0, p.vp - p.votionNow), rateNow: per(p.potUsd || 0, p.vp),
        aprNow: p.stakedUsd >= MIN_TVL ? (act ? p.aprNow : 0) : null, weeklyNow: act ? p.weeklyUsdNow : 0, activeNow: act,
        votionPlan: r.votion, votesPlan: r.votes, ratePlan: per(r.pot, r.votes), sharePlan: r.share, activePlan: r.active, weeklyPlan: r.weeklyUsd, aprPlan: r.apr,
        vaults: vaults.map(function (v) { var pub = Object.keys(v.vb.plan).length ? num(v.vb.plan[pk]) / v.vb.vp * 100 : null;
          return { key: v.key, vp: v.vb.vp, nowPct: num(v.vb.current[pk]) / v.vb.vp * 100, publishedPct: pub, planPct: allocPct(plan, v, pk), simPct: allocPct(sim, v, pk) }; }) };
      if (x) { row.votionSim = x.votion; row.votesSim = x.votes; row.rateSim = per(x.pot, x.votes); row.shareSim = x.share; row.activeSim = x.active; row.weeklySim = x.weeklyUsd; row.aprSim = x.apr; row.dVotion = x.votion - r.votion; row.dWeekly = x.weeklyUsd - r.weeklyUsd; }
      if (O) { var or = O.plan.rows[pk], ox = O.sim ? O.sim.rows[pk] : null; row.other = { counted: otherMode, votionPlan: or.votion, weeklyPlan: or.weeklyUsd, aprPlan: or.apr, activePlan: or.active };
        if (ox) { row.other.votionSim = ox.votion; row.other.weeklySim = ox.weeklyUsd; row.other.aprSim = ox.apr; row.other.activeSim = ox.active; } } else row.other = null;
      return row; });
    rows.sort(function (a, c) { return (c.potUsd + c.added - (a.potUsd + a.added)) || (c.votionNow + c.votionPlan - (a.votionNow + a.votionPlan)) || (c.votesNow - a.votesNow); });
    var sum = function (o, f) { return o ? o.pks.reduce(function (t, pk) { return t + num(o.rows[pk][f]); }, 0) : null; };
    var out = { bucket: bucket, label: B.label, counted: mode, rows: rows, level: lvl(plan), levelSim: sim ? lvl(sim) : null, levelOther: O ? lvl(O.plan) : null,   // Votion's going rate at close: in this reading · with the bribe · in the other reading
      weeklyUsd: B.weeklyUsd, perMillionWeekly: plan.activeVotes > 0 ? plan.weeklyUsd / plan.activeVotes * 1e6 : null, votionVp: votionVp,
      vaults: vaults.map(function (v) { var d = dec(plan, v.key), ds = sim ? dec(sim, v.key) : null; return { key: v.key, vp: v.vb.vp, moves: d ? !!d.moves : null, published: d ? d.published : null, level: d ? d.level : null, movesSim: ds ? !!ds.moves : null, flippedByChange: ds ? !!ds.flippedByChange : false }; }),
      decisions: plan.decisions, funded: B.pks.filter(function (pk) { return m.pools[pk].potUsd > 0.5; }).length, potUsd: B.pks.reduce(function (t, pk) { return t + (m.pools[pk].potUsd || 0); }, 0),
      leftOut: left.slice(), weighedFunded: B.pks.filter(function (pk) { return m.pools[pk].potUsd > 0.5 && !m.pools[pk].votionExcluded; }).length, pools: plan.pks.length, hidden: plan.pks.length - rows.length,
      totals: { votesNow: B.pks.reduce(function (t, pk) { return t + m.pools[pk].vp; }, 0), votionNow: B.pks.reduce(function (t, pk) { return t + m.pools[pk].votionNow; }, 0), votionPlan: sum(plan, 'votion'), votionSim: sum(sim, 'votion'),
        weeklyNow: B.pks.reduce(function (t, pk) { var p = m.pools[pk]; return t + (p.status === 'active' ? p.weeklyUsdNow : 0); }, 0), weeklyPlan: sum(plan, 'weeklyUsd'), weeklySim: sum(sim, 'weeklyUsd') },
      whatIf: null };
    if (has) { var t = sim.rows[q.pk], t0 = plan.rows[q.pk]; var tp = m.pools[q.pk];
      var movers = sim.pks.map(function (pk) { return { pk: pk, name: m.pools[pk].name, dVotion: sim.rows[pk].votion - plan.rows[pk].votion, dWeekly: sim.rows[pk].weeklyUsd - plan.rows[pk].weeklyUsd, apr0: plan.rows[pk].apr, apr1: sim.rows[pk].apr, weekly0: plan.rows[pk].weeklyUsd, weekly1: sim.rows[pk].weeklyUsd }; });
      var w = { pk: q.pk, name: tp.name, usd: q.usd, excluded: !!tp.votionExcluded, counted: !tp.offList && (!tp.votionExcluded || mode === 'all'), offList: !!tp.offList,
        votion0: t0.votion, votion1: t.votion, votionIn: t.votion - t0.votion, weekly0: t0.weeklyUsd, weekly1: t.weeklyUsd, weeklyGain: t.weeklyUsd - t0.weeklyUsd, apr0: t0.apr, apr1: t.apr, active0: t0.active, active1: t.active, votes1: t.votes, pot1: t.pot,
        winners: movers.filter(function (x) { return x.dWeekly > 0.5; }).sort(function (a, c) { return c.dWeekly - a.dWeekly; }), losers: movers.filter(function (x) { return x.dWeekly < -0.5; }).sort(function (a, c) { return a.dWeekly - c.dWeekly; }),
        // the check: every pool's change, shown or not — gains and losses add up to nothing, Votion's votes add up to the same
        gainSum: movers.reduce(function (s1, x) { return s1 + Math.max(0, x.dWeekly); }, 0), lossSum: movers.reduce(function (s1, x) { return s1 + Math.min(0, x.dWeekly); }, 0),
        votionSum0: sum(plan, 'votion'), votionSum1: sum(sim, 'votion'), weeklySum0: sum(plan, 'weeklyUsd'), weeklySum1: sum(sim, 'weeklyUsd'), decisions: sim.decisions, other: null };
      if (O && O.sim) { var a0 = O.plan.rows[q.pk], a1 = O.sim.rows[q.pk]; w.other = { counted: otherMode, votion0: a0.votion, votion1: a1.votion, votionIn: a1.votion - a0.votion, weekly0: a0.weeklyUsd, weekly1: a1.weeklyUsd, weeklyGain: a1.weeklyUsd - a0.weeklyUsd, apr0: a0.apr, apr1: a1.apr }; }
      out.whatIf = w; }
    return out;
  }
  // what each pool needs before Votion adds votes, under the board's reading → { pk: { weighed, entryUsd, nextMillionUsd } }
  //   entryUsd        extra $ before Votion adds its first votes (0 = it is in already · null = not within $5,000, or its pot is not weighed)
  //   nextMillionUsd  after that, the extra $ for 1M VP more
  function boardPrices(m, bucket, counted, pks) {
    var B = m.buckets[bucket]; if (!B) return {}; var left = boardLeft(m, bucket); var offer = {}; left.forEach(function (pk) { offer[pk] = true; });
    var all = counted === 'all' && left.length > 0; var mode = all ? 'all' : 'published'; var base = boardRun(m, bucket, offer, mode, null).plan;
    var find = function (test) { if (test(0)) return 0; var lo = 0, hi = 5000; if (!test(hi)) return null; for (var i = 0; i < 24; i++) { var mid = (lo + hi) / 2; if (test(mid)) hi = mid; else lo = mid; } return Math.ceil(hi); };
    var out = {};
    (pks || B.pks).forEach(function (pk) { var p = m.pools[pk]; if (!p || p.bucket !== bucket) return;
      if (p.offList || (p.votionExcluded && !all)) { out[pk] = { weighed: false, entryUsd: null, nextMillionUsd: null }; return; }
      var v0 = base.rows[pk].votion; var at = function (x) { var a = {}; a[pk] = x; return boardRun(m, bucket, offer, mode, a).sim.rows[pk].votion; };
      var e = v0 >= 50000 ? 0 : find(function (x) { return x > 0 && at(x) >= v0 + 50000; }); var n = e == null ? null : find(function (x) { return x > 0 && at(x) >= Math.max(v0, 50000) + 1e6; });
      out[pk] = { weighed: true, entryUsd: e, nextMillionUsd: e != null && n != null ? Math.max(0, n - e) : null }; });
    return out;
  }

  return { VERSION: VERSION, URLS: URLS, BUCKETS: BUCKETS, BUCKET_LABEL: BUCKET_LABEL, LENSES: LENSES, LINE: LINE, VOTION_MOVE_USD: VOTION_MOVE_USD,
    build: build, load: load, attachVoters: attachVoters, applyLivePots: applyLivePots, fetchLivePots: fetchLivePots,
    waterFill: waterFill, votionSolve: votionSolve, votionFill: votionFill, votionLevel: votionLevel, outcome: outcome, withChange: withChange, votionGain: votionGain, walletVotes: walletVotes, moveVotes: moveVotes, scenario: scenario,
    bestSplit: bestSplit, bestSplitAll: bestSplitAll, impact: impact, lens: lens, board: board, boardPrices: boardPrices, votionRate: votionRate, votionMoves: votionMoves, whatItTakes: whatItTakes, keyOf: keyOf };
});
