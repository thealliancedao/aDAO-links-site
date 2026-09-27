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
  var VERSION = '1.0.0';
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var URLS = {
    snapshot: CORE + 'member-data/tla-snapshot/current.json',
    votion: CORE + 'votion/optimization/current.json',
    participants: CORE + 'member-data/participants/current.json',
    grades: CORE + 'lp-grades/snapshots/current.json',
    pd: CORE + 'tla-voting/pd-bribes/current.json',
    prices: CORE + 'network-and-prices/current.json',
    catalog: CORE + 'token-catalog/snapshots/current.json'
  };
  var INCENTIVE_MANAGER = 'terra1tuuwm8yrj54qeg0c8xu00aha9ryatyhtczq8qq2q8tntuw0auzas9037wh';
  var VOTION_VAULTS = ['ampluna-max', 'arbluna-max'];
  var WEEKS_PER_YEAR = 52.18;
  var LINE = 0.01;                 // a pool needs ≥ 1% of its bucket's votes to earn emissions (and pay its pot)
  var VOTION_MOVE_USD = 1;         // Votion's observed hysteresis: re-votes when its own gain is about $1 or more
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
      votionAt: O.capturedAt || null, luna: P.luna, buckets: {}, pools: {}, vaults: [], voters: null, potSource: 'captured', liveAt: null, _P: P };
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
        vp: num(p.voting_power && p.voting_power.vp_human), stakedUsd: num(p.staked_in_tla_usd), depthUsd: depth,
        weeklyUsdNow: num(p.rewards && p.rewards.weekly_emissions_usd), aprNow: p.rewards && p.rewards.approx_apr_pct != null ? num(p.rewards.approx_apr_pct) : null,
        pot: pot, potUsd: 0, potSource: 'none', payingNowUsd: payingNow.usd,
        grade: (v2 && v2.letter) || (g && g.grade) || null, gradeScore: v2 && v2.composite != null ? v2.composite : null, gradeWhy: (v2 && v2.why) || null,
        vol7dUsd: util != null && depth ? util * depth : null, pdUsd: pdUsd, votionNow: 0, votionPlan: 0 };
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
    // UNITS: Votion measures voting power at the round's END (boosts grown) — its view of every gauge reads ~12% above the
    // snapshot's live VP, uniformly. Convert its vault budgets and votes into today's units per bucket (k = its gauge totals ÷
    // ours on the same gauges), so Votion is not 12% larger than it is when it meets the snapshot's votes.
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
    // a pool that was FUNDED when Votion captured but is not in its option list has been left out by Votion on purpose
    // (its whitelist / its own judgment) — a bribe there pays human voters only; a pool with no pot then is simply unconsidered
    Object.keys(m.pools).forEach(function (pk) { var p = m.pools[pk]; p.votionExcluded = !p.inVotion && p.potUsd > 0.5; if (p.votionPotUsd == null) p.votionPotUsd = p.votionExcluded ? 0 : p.potUsd;
      // a token our feed cannot price (wBTC.atom today) would understate the pot — Votion's own price stands in, labelled
      if (p.pot.unpriced.length && p.votionPotUsd > p.potUsd) { p.potUsd = p.votionPotUsd; p.potPricedBy = 'votion'; }
      p.capturedPotUsd = p.potUsd;
      // never offered to Votion this round and no Votion votes: a projection there assumes Votion would take a new pot — untested
      p.votionUntested = !p.inVotion && !p.votionExcluded && p.votionNow < 1000 && p.votionPlan < 1000; });
    nameRawPools(m, O, P, inp.catalog);
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
    var res = await Promise.all([get(U.snapshot), get(U.votion), soft(U.grades), soft(U.pd), get(U.prices), soft(U.catalog)]);
    var m = build({ snapshot: res[0], votion: res[1], grades: res[2], pd: res[3], prices: res[4], catalog: res[5] });
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
  var payout = function (b, V, a) { return b > 0 && a > 0 ? b * a / (V + a) : 0; };

  // outcome(m, bucket, { add:{pk:$}, mine:{pk:vp}, mineNow:{pk:vp}, votion:'solve'|'plan'|'now' }) → the bucket at close
  //   mine    — the simulated wallet's votes in this bucket (plan); mineNow — its votes today (removed from "others")
  function outcome(m, bucket, s) {
    s = s || {}; var add = s.add || {}; var mine = s.mine || {}; var mineNow = s.mineNow || {}; var B = m.buckets[bucket]; if (!B) return null;
    var pks = B.pks.slice(); Object.keys(add).forEach(function (pk) { if (pk.indexOf(bucket + '|') === 0 && pks.indexOf(pk) < 0 && m.pools[pk]) pks.push(pk); });
    var pot = {}, potV = {}, others = {}; pks.forEach(function (pk) { var p = m.pools[pk]; pot[pk] = Math.max(0, (p.potUsd || 0) + num(add[pk])); potV[pk] = p.votionExcluded ? 0 : Math.max(0, (p.votionPotUsd || 0) + num(add[pk])); others[pk] = Math.max(0, p.vp - p.votionNow - num(mineNow[pk])); });
    // Votion's votes at close
    var vot = {}; pks.forEach(function (pk) { vot[pk] = 0; });
    var perVault = m.vaults.map(function (v) { var vb = v.byBucket[bucket]; return vb ? { vb: vb, a: Object.assign({}, vb.current) } : null; }).filter(Boolean);
    var mode = s.votion || 'solve';
    if (mode === 'solve') {
      perVault.forEach(function (pv, i) {
        var universe = pks.filter(function (pk) { return potV[pk] > 0; });
        var opts = universe.map(function (pk) { var V = others[pk] + num(mine[pk]); perVault.forEach(function (q, j) { if (j !== i) V += num(q.a[pk]); }); return { pk: pk, b: potV[pk], V: V }; });
        pv.a = waterFill(opts, pv.vb.vp);
      });
    } else if (mode === 'plan') perVault.forEach(function (pv) { pv.a = Object.assign({}, pv.vb.plan); });
    perVault.forEach(function (pv) { Object.keys(pv.a).forEach(function (pk) { if (vot[pk] != null) vot[pk] += num(pv.a[pk]); }); });
    // totals, the 1% line, next epoch's emissions and APR, payouts
    var rows = {}; var bucketVotes = 0;
    pks.forEach(function (pk) { var t = others[pk] + vot[pk] + num(mine[pk]); rows[pk] = { pk: pk, others: others[pk], votion: vot[pk], mine: num(mine[pk]), votes: t, pot: pot[pk] }; bucketVotes += t; });
    var activeVotes = 0; pks.forEach(function (pk) { var r = rows[pk]; r.share = bucketVotes > 0 ? r.votes / bucketVotes : 0; r.active = r.share >= LINE; if (r.active) activeVotes += r.votes; });
    var myUsd = 0, votionUsd = 0;
    pks.forEach(function (pk) { var r = rows[pk]; var p = m.pools[pk];
      r.emShare = r.active && activeVotes > 0 ? r.votes / activeVotes : 0; r.weeklyUsd = B.weeklyUsd * r.emShare;
      r.apr = p.stakedUsd >= MIN_TVL ? r.weeklyUsd * WEEKS_PER_YEAR / p.stakedUsd * 100 : null;
      r.myUsd = r.active ? payout(r.pot, r.votes - r.mine, r.mine) : 0; r.votionUsd = payout(potV[pk], r.votes - r.votion, r.votion);   // Votion scores itself on its own view
      r.perMillion = r.votes > 0 && r.pot > 0 ? r.pot / (r.votes / 1e6) : null; myUsd += r.myUsd; votionUsd += r.votionUsd; });
    return { bucket: bucket, rows: rows, pks: pks, bucketVotes: bucketVotes, activeVotes: activeVotes, weeklyUsd: B.weeklyUsd, myUsd: myUsd, votionUsd: votionUsd };
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
    var base = outcome(m, b, { mine: now, mineNow: now }); var plan = outcome(m, b, { add: add, mine: mv.plan, mineNow: now });
    var flows = plan.pks.map(function (pk) { return { pk: pk, name: m.pools[pk].name, d: plan.rows[pk].votion - (base.rows[pk] ? base.rows[pk].votion : 0) }; }).filter(function (x) { return Math.abs(x.d) >= 1000; }).sort(function (a, c) { return c.d - a.d; });
    var t = q.target && plan.rows[q.target]; var t0 = q.target && base.rows[q.target];
    var bribeBack = t && q.bribeUsd > 0 && t.active ? q.bribeUsd * t.mine / t.votes : 0;   // the share of my own bribe my votes collect
    return { bucket: b, target: q.target || null, bribeUsd: q.bribeUsd || 0, moved: mv.moved, base: base, plan: plan, flows: flows,
      votionIn: t && t0 ? t.votion - t0.votion : 0, myNow: base.myUsd, myPlan: plan.myUsd, bribeBack: bribeBack,
      netCost: (q.bribeUsd || 0) - bribeBack, emissionsBought: t && t0 ? t.weeklyUsd - t0.weeklyUsd : 0,
      votionGain: votionGain(m, b, { add: add, mine: mv.plan, mineNow: now }) - votionGain(m, b, { mine: now, mineNow: now }),
      crossedUp: plan.pks.filter(function (pk) { return plan.rows[pk].active && base.rows[pk] && !base.rows[pk].active; }),
      crossedDown: plan.pks.filter(function (pk) { return !plan.rows[pk].active && base.rows[pk] && base.rows[pk].active; }) };
  }
  // the best split of `vp` in a bucket for bribes — Votion's own method pointed at one wallet, iterated with Votion's reaction
  function bestSplit(m, bucket, vp, current) {
    current = current || {}; var mine = {}; var last = null;
    for (var it = 0; it < 12; it++) {
      var o = outcome(m, bucket, { mine: mine, mineNow: current });
      var opts = o.pks.filter(function (pk) { return o.rows[pk].pot > 0; }).map(function (pk) { var r = o.rows[pk]; return { pk: pk, b: r.pot, V: r.votes - r.mine }; });
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
    return { bucket: bucket, vp: vp, split: split, usd: best.myUsd, nowUsd: now.myUsd, gain: best.myUsd - now.myUsd, outcome: best };
  }
  function bestSplitAll(m, wallet) {
    var out = { buckets: {}, usd: 0, nowUsd: 0 }; var vp = wallet ? num(wallet.vp) : 0;
    BUCKETS.forEach(function (b) { var r = bestSplit(m, b, vp, walletVotes(m, wallet, b)); out.buckets[b] = r; out.usd += r.usd; out.nowUsd += r.nowUsd; });
    out.gain = out.usd - out.nowUsd; return out;
  }

  // ---------------------------------------------------------------- the overview: what $X does, per pool, and the lenses
  function impact(m, pk, usd) {
    var p = m.pools[pk]; var base = outcome(m, p.bucket, {}); var add = {}; add[pk] = usd; var sim = outcome(m, p.bucket, { add: add });
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
  // Votion's rate: median $ per 1M VP across the pools Votion votes (its equalisation set)
  function votionRate(m) {
    var xs = []; Object.keys(m.pools).forEach(function (pk) { var p = m.pools[pk]; if (p.votionNow > 50000 && p.potUsd > 0 && p.vp > 50000) xs.push(p.potUsd / (p.vp / 1e6)); });
    xs.sort(function (a, b) { return a - b; }); return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null;
  }
  // Votion's own next move (its published plan vs its current votes), biggest first
  function votionMoves(m, bucket) {
    return Object.keys(m.pools).filter(function (pk) { return !bucket || bucket === 'all' || m.pools[pk].bucket === bucket; }).map(function (pk) { var p = m.pools[pk]; return { pk: pk, name: p.name, bucket: p.bucket, d: p.votionPlan - p.votionNow, now: p.votionNow, plan: p.votionPlan }; }).filter(function (x) { return Math.abs(x.d) >= 50000; }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
  }
  // what it takes: the smallest bribe that gets Votion in / lifts the pool over the 1% line (null = not within $5,000)
  function whatItTakes(m, pk) {
    var p = m.pools[pk]; var find = function (test) { if (test(0)) return 0; var lo = 0, hi = 5000; if (!test(hi)) return null; for (var i = 0; i < 26; i++) { var mid = (lo + hi) / 2; if (test(mid)) hi = mid; else lo = mid; } return Math.ceil(hi); };
    var base = outcome(m, p.bucket, {}); var thr = base.rows[pk].votion + 250000;
    return {
      votionAlready: base.rows[pk].votion >= 250000, votionExcluded: !!p.votionExcluded,
      votionIn: p.votionExcluded ? null : find(function (x) { var a = {}; a[pk] = x; var o = outcome(m, p.bucket, { add: a }); return o.rows[pk].votion >= thr; }),
      overLine: base.rows[pk].active ? 0 : find(function (x) { var a = {}; a[pk] = x; var o = outcome(m, p.bucket, { add: a }); return o.rows[pk].active; })
    };
  }

  return { VERSION: VERSION, URLS: URLS, BUCKETS: BUCKETS, BUCKET_LABEL: BUCKET_LABEL, LENSES: LENSES, LINE: LINE, VOTION_MOVE_USD: VOTION_MOVE_USD,
    build: build, load: load, attachVoters: attachVoters, applyLivePots: applyLivePots, fetchLivePots: fetchLivePots,
    waterFill: waterFill, outcome: outcome, votionGain: votionGain, walletVotes: walletVotes, moveVotes: moveVotes, scenario: scenario,
    bestSplit: bestSplit, bestSplitAll: bestSplitAll, impact: impact, lens: lens, votionRate: votionRate, votionMoves: votionMoves, whatItTakes: whatItTakes, keyOf: keyOf };
});
