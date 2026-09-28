/* =============================================================================
 * lib/portfolio-pnl.js 1.0.0 (2026-09-27) — THE MEMBER P&L, drawn from build-pnl v3 (tla-flows/pnl/ledger/<wallet>.json → v3).
 * One lib for every surface that shows a member's P&L (member-portfolio now, the app and the help bot next): the numbers come
 * from the ledger as written — this lib adds nothing but words and pictures (one number, one code path).
 * -----------------------------------------------------------------------------
 * What the ledger's v3 block holds (tla-flows 3.5.0, lib/pnl-positions.js):
 *   totals    — realized {in/out/delta USD + LUNA, market_usd, lp_usd, trips}, open {cost, value, unrealized}, rewards {claims,
 *               bribes}, net_usd / net_luna, disputed / suspect counts, as_of_epoch
 *   positions — per pool × mechanism: open units/cost/value, realized, claims, trips (rows by trip_cols)
 *   value_curve — per epoch {e, usd, luna, p:{poolIdx: usd}, m:[poolIdx]} + a final {e:'now'}; pools by index in curve_pools
 * The attribution identity the build guarantees: realized Δ = market + lp (every trip). Net = realized Δ + unrealized + claims + bribes.
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PortfolioPnl = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '2.0.1';   // 2.0.1 (2026-09-28): positions sent to another address fold into their own group ("not my position any more")
  // 2.0.0 (2026-09-28, owner: "how you've done should be all combined with the ability to drop out ones"; "USD → Tokens"; "the total bar sells it short"): renderDone() — ONE P&L across TLA LPs, locks & bribes (lockLeg: every lock create / add at that day's price vs worth now, merges / migrations / withdraws / transfers followed), Votion (votionTotals) and NFTs, each a chip that switches off; what drove it (prices · yield · rewards · still open · NFTs) adds to the net; the positions table redrawn — both tokens' logos (lib/token-logos.js), the venue, unpriced says unpriced, result in $ and %, days held, APR only when the money was in ≥ 30 days, a Tokens lens (pnl-positions 1.4.0 tok_in / tok_out, open tokens vs now, LP vs just holding), and a scorecard (waterfall, made-money count, best / worst trip, time in the pools, fees) · 1.5.0 (2026-09-28): a moved-out row says where the receipt went — the registry's name, the address (linked) and the day (build moves[], pnl-positions 1.3.0); a receipt the build found with a custodian (held_in) reads as held, never "moved" · 1.4.0 (2026-09-28): reconcile() — the ledger's open lots against where the receipt is now (the hourly chain read): staked in a custodian the page reads live (ampCAPA DAO) → counted at the live value, P&L on the part with a cost; sent elsewhere → flagged "not in this wallet" and out of Open now · sellable() — what a holding fetches sold into its pool (constant product), for the illiquid-token rule · 1.3.1 (2026-09-28): a large all-LPs total under the table (put in / taken out / open / P&L incl. rewards / APR earned); an open position worth < $1 folds with the closed · 1.3.0 (2026-09-28): positions by bucket — in / out / open / P&L incl. rewards / APR earned (capital × days) / LP since entry (take-rate drag + top-up, or amplifier compounding; pnl-positions 1.1.0 open_lp), closed positions folded · 1.2.0 (2026-09-28): votionStory() — one Votion position told as USD in → now, split into LUNA price / LST staking / Votion compounding (votion/holder-pnl, org-votion 1.5.0), LUNA in → now, real vs advertised APR · 1.1.0 (2026-09-27): the NFT leg — nftLeg() + renderNfts(): cost from each token's own acquisition (nft-flows by-wallet), mark at the conservative floor per tier, realized round trips as the ledger replayed them
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function usd(v, sign) { if (v == null || !isFinite(v)) return '—'; var a = Math.abs(v); var s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? Math.round(a).toLocaleString('en-US') : a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (v < 0 ? '−' : (sign && v > 0 ? '+' : '')) + '$' + s; }
  function luna(v, sign) { if (v == null || !isFinite(v)) return '—'; var a = Math.abs(v); var s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : Math.round(a).toLocaleString('en-US'); return (v < 0 ? '−' : (sign && v > 0 ? '+' : '')) + s + ' LUNA'; }
  function money(v, lens, sign) { return lens === 'luna' ? luna(v, sign) : usd(v, sign); }
  function tone(v) { return v == null ? 'color:#9ca3af' : v > 0 ? 'color:#6ee7b7' : v < 0 ? 'color:#fca5a5' : 'color:#d1d5db'; }

  // ── decode the ledger's v3 block into plain objects ────────────────────────────────────────────────────────────────
  function decode(v3) {
    if (!v3 || !v3.totals) return null;
    var cols = v3.trip_cols || []; var ci = {}; cols.forEach(function (c, i) { ci[c] = i; });
    var positions = Object.keys(v3.positions || {}).sort().map(function (k) {
      var p = v3.positions[k];
      var trips = (p.trips || []).map(function (r) { if (!Array.isArray(r)) return r; var o = {}; cols.forEach(function (c) { o[c] = r[ci[c]]; }); if (o.in_usd != null && o.out_usd != null) o.delta_usd = Math.round((o.out_usd - o.in_usd) * 100) / 100; if (o.in_luna != null && o.out_luna != null) o.delta_luna = o.out_luna - o.in_luna; return o; });
      return Object.assign({ key: k }, p, { trips: trips });
    });
    var pools = v3.curve_pools || [];
    var curve = (v3.value_curve || []).map(function (c) { var by = {}; Object.keys(c.p || {}).forEach(function (i) { by[pools[+i]] = c.p[i]; }); return { e: c.e, usd: c.usd, luna: c.luna, pools: by, missing: (c.m || []).map(function (i) { return pools[+i]; }) }; });
    return { totals: v3.totals, positions: positions, curve: curve, bribes: v3.bribes || {} };
  }

  // ── 1.4.0 reconcile the ledger's OPEN lots with where the receipt actually is now ───────────────────────────────────
  // (owner 2026-09-28: "it says I have a balance in ampCAPA and wBTC.osmo-wBTC.axl … makes me wonder how much I can trust this")
  // The flow ledger opens a lot on deposit and closes it on withdraw. A receipt (amplp) or LP token that leaves the wallet by
  // TRANSFER — staked in a DAO for governance, sent to another wallet — is neither, so the ledger kept it "open" in this wallet.
  // The hourly chain read (participants lp_positions) is the referee for "in this wallet now":
  //   custody — the receipt is staked somewhere the page reads live (the ampCAPA governance DAO): still the member's position,
  //             still earning. Counted at the LIVE value; P&L only on the part the ledger has a cost for; the rest is valued
  //             with no basis (untracked — like Votion's), never given an invented cost.
  //   moved   — the chain read finds nothing in this wallet and no custodian explains it: the lots left by transfer. Shown, flagged,
  //             and taken OUT of Open now / unrealized / net (their deposits and trips stay in the history).
  // live = { read: bool, held(pool, mech) → USD in the wallet now (0 = read, none), custody: [{ pool, mech, usd, luna, where, note }] }
  // A build that already marks p.not_held (tla-flows pnl 1.2.3) left those lots out of its totals: nothing to subtract twice.
  function reconcile(D, live) {
    if (!D || !live) return D;
    var T = D.totals = JSON.parse(JSON.stringify(D.totals)), O = T.open;   /* never write into the ledger's own object */ var R = { moved: 0, moved_usd: 0, custody: 0, custody_usd: 0, untracked_usd: 0, untracked_luna: 0, where: [] };
    var nz = function (x) { return typeof x === 'number' && isFinite(x) ? x : 0; };
    var shift = function (dv, dc, lens) { var k = lens === 'luna' ? '_luna' : '_usd'; O['value' + k] = nz(O['value' + k]) + dv; O['cost' + k] = nz(O['cost' + k]) + dc; O['unrealized' + k] = nz(O['unrealized' + k]) + (dv - dc); T['net' + k] = nz(T['net' + k]) + (dv - dc); };
    D.positions.forEach(function (p) {
      if (!(p.units_open > 0) || p.disputed) return;
      var v = nz(p.open_value_usd), c = nz(p.open_cost_usd), vl = nz(p.open_value_luna), cl = nz(p.open_cost_luna);
      var builtOut = !!p.not_held;
      var cust = (live.custody || []).filter(function (x) { return x.pool === p.pool && x.mech === p.mechanism && x.usd > 0; })[0];
      if (cust) {
        // the ledger's lots are a part of what the custodian holds (or all of it): basis share s ≤ 1
        var s = v > 0 ? Math.min(1, cust.usd / v) : 0, extra = Math.max(0, cust.usd - v), extraL = cust.luna != null && vl > 0 ? Math.max(0, cust.luna - vl) : (cust.luna != null ? cust.luna : 0);
        p.custody = { where: cust.where, note: cust.note || null, usd: cust.usd, luna: cust.luna != null ? cust.luna : null, basis_share: s, untracked_usd: extra, untracked_luna: extraL, ledger_usd: v };
        if (builtOut) { shift(v * s, c * s, 'usd'); shift(vl * s, cl * s, 'luna'); }
        else if (s < 1) { shift(-(v - v * s), -(c - c * s), 'usd'); shift(-(vl - vl * s), -(cl - cl * s), 'luna'); }
        O.value_usd = nz(O.value_usd) + extra; O.value_luna = nz(O.value_luna) + extraL;   // valued, no basis: in Open now, not in P&L
        R.custody++; R.custody_usd += cust.usd; R.untracked_usd += extra; R.untracked_luna += extraL; if (R.where.indexOf(cust.where) < 0) R.where.push(cust.where);
        return;
      }
      if (v < DUST_USD) return;   // pennies left in a pool read with the closed book already — no warning for dust
      if (p.held_in) return;   /* 1.5.0: the build found the receipt with a custodian (pnl-positions 1.3.0) — held, not moved */
      if (live.read && live.held && nz(live.held(p.pool, p.mechanism)) === 0) {
        p.moved = { ledger_usd: v, ledger_luna: vl, built_out: builtOut };
        if (!builtOut) { shift(-v, -c, 'usd'); shift(-vl, -cl, 'luna'); }
        R.moved++; R.moved_usd += v;
      }
    });
    O.untracked_usd = R.untracked_usd || undefined; O.untracked_luna = R.untracked_luna || undefined;
    D.reconciled = R; return D;
  }

  // ── the story's numbers (both lenses from the same ledger) ─────────────────────────────────────────────────────────
  function story(D, lens) {
    var T = D.totals, L = lens === 'luna';
    var rewards = L ? (T.rewards.claims_luna || 0) + (T.rewards.bribes_luna || 0) : (T.rewards.claims_usd || 0) + (T.rewards.bribes_usd || 0);
    // market / lp split is kept in USD by the build; in LUNA terms the realized Δ is shown whole (the split needs LUNA prices of the entry basket)
    return {
      lens: L ? 'luna' : 'usd',
      net: L ? T.net_luna : T.net_usd,
      realized: L ? T.realized.delta_luna : T.realized.delta_usd,
      market: L ? null : T.realized.market_usd,
      lp: L ? null : T.realized.lp_usd,
      unrealized: L ? T.open.unrealized_luna : T.open.unrealized_usd,
      rewards: rewards,
      claims: L ? T.rewards.claims_luna : T.rewards.claims_usd,
      bribes: L ? T.rewards.bribes_luna : T.rewards.bribes_usd,
      open_value: L ? T.open.value_luna : T.open.value_usd,
      open_cost: L ? T.open.cost_luna : T.open.cost_usd,
      put_in: L ? T.realized.in_luna + T.open.cost_luna : T.realized.in_usd + T.open.cost_usd,
      trips: T.realized.trips_valued, blank: T.realized.trips_blank || 0, suspect: T.realized.trips_suspect || 0,
      disputed: T.positions_disputed || 0, unmatched: T.positions_with_unmatched_units || 0,
      as_of_epoch: T.as_of_epoch, as_of_day: T.as_of_day
    };
  }
  // one sentence written from the data (pages tell one story: hero → sentence → what changed → detail)
  function sentence(S) {
    var m = function (v) { return money(v, S.lens, true); };
    var parts = [];
    if (S.lens === 'usd' && S.market != null) {
      parts.push('On the positions you have closed, prices moved what you put in by ' + m(S.market) + ' and the pools themselves (fees, IL, take rate, compounding) by ' + m(S.lp));
    } else parts.push('On the positions you have closed you came out ' + m(S.realized) + ' in LUNA terms');
    parts.push('TLA paid you ' + m(S.rewards) + ' in claims and bribes');
    if (S.open_value) parts.push('what is still open is ' + m(S.unrealized) + ' against its cost');
    return parts.join('; ') + '. Net: ' + m(S.net) + '.';
  }

  // ── renderers (inline styles — the page's classes are not assumed) ──────────────────────────────────────────────────
  var BTN = 'font-size:11px;padding:3px 9px;border-radius:7px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#9ca3af;cursor:pointer';
  var BTN_ON = 'font-size:11px;padding:3px 9px;border-radius:7px;border:1px solid rgba(34,211,238,.4);background:rgba(34,211,238,.14);color:#67e8f9;cursor:pointer';
  function lensButtons(lens, tokens) { return '<span style="display:inline-flex;gap:4px"><button type="button" data-pp-lens="usd" style="' + (lens === 'usd' ? BTN_ON : BTN) + '">USD</button>' + (tokens ? '<button type="button" data-pp-lens="tokens" style="' + (lens === 'tokens' ? BTN_ON : BTN) + '" title="What went in and came out, token by token">Tokens</button>' : '') + '<button type="button" data-pp-lens="luna" style="' + (lens === 'luna' ? BTN_ON : BTN) + '">LUNA</button></span>'; }
  function bar(label, v, max, lens, note) {
    var w = max > 0 && v != null ? Math.max(2, Math.min(100, Math.abs(v) / max * 100)) : 0; var col = v == null ? '#4b5563' : v >= 0 ? '#34d399' : '#f87171';
    return '<div style="display:grid;grid-template-columns:minmax(120px,190px) 1fr auto;gap:10px;align-items:center;margin:6px 0">' +
      '<div style="font-size:13px;color:#d1d5db">' + esc(label) + (note ? '<div style="font-size:11px;color:#6b7280">' + esc(note) + '</div>' : '') + '</div>' +
      '<div style="height:12px;background:rgba(255,255,255,.04);border-radius:6px;position:relative;overflow:hidden"><div style="position:absolute;' + (v != null && v < 0 ? 'right:50%' : 'left:50%') + ';width:' + (w / 2).toFixed(1) + '%;top:0;bottom:0;background:' + col + ';border-radius:6px"></div><div style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:rgba(255,255,255,.18)"></div></div>' +
      '<div style="font-family:JetBrains Mono,monospace;font-size:14px;font-weight:700;' + tone(v) + ';text-align:right;min-width:110px">' + money(v, lens, true) + '</div></div>';
  }
  function renderStory(el, D, opts) {
    opts = opts || {}; var lens = opts.lens || 'usd'; var S = story(D, lens);
    var rows = S.lens === 'usd'
      ? [['Prices (market)', S.market, 'what prices did to what you put in, on closed trips'], ['Pool mechanics', S.lp, 'fees, IL, take rate, compounding'], ['TLA rewards', S.rewards, 'claims ' + money(S.claims, lens) + ' + bribes ' + money(S.bribes, lens)], ['Still open', S.unrealized, 'value now vs what it cost']]
      : [['Closed trips', S.realized, 'LUNA out vs LUNA in'], ['TLA rewards', S.rewards, 'claims + bribes, in LUNA at claim day'], ['Still open', S.unrealized, 'LUNA value now vs LUNA cost']];
    var max = rows.reduce(function (m, r) { return Math.max(m, Math.abs(r[1] || 0)); }, 0);
    var flags = [];
    if (S.disputed) flags.push(S.disputed + ' position' + (S.disputed === 1 ? '' : 's') + ' left out (our value disagrees with the chain read)');
    if (S.suspect) flags.push(S.suspect + ' trip' + (S.suspect === 1 ? '' : 's') + ' left out (legs look mismatched)');
    if (S.blank) flags.push(S.blank + ' trip' + (S.blank === 1 ? '' : 's') + ' with no price that day');
    if (S.unmatched) flags.push(S.unmatched + ' position' + (S.unmatched === 1 ? '' : 's') + ' with units from before our capture (no cost basis)');
    var RC = D.reconciled;
    if (RC && RC.moved) flags.push(RC.moved + ' position' + (RC.moved === 1 ? '' : 's') + ' no longer in this wallet (the receipt or LP token was sent elsewhere, not withdrawn) — ' + usd(RC.moved_usd) + ' left out of Open now');
    var info = RC && RC.custody ? 'Open now includes ' + usd(RC.custody_usd) + ' staked in ' + RC.where.join(', ') + ' (live chain read — still yours, still earning)' + (RC.untracked_usd > 0.5 ? '; ' + usd(RC.untracked_usd) + ' of it has no cost basis in our history, so it is valued but kept out of the P&L' : '') : '';
    el.innerHTML =
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Net, all of TLA so far</div>' +
        '<div data-pp="net" style="font-family:JetBrains Mono,monospace;font-size:34px;font-weight:800;' + tone(S.net) + '">' + money(S.net, lens, true) + '</div>' +
        '<div style="font-size:12px;color:#6b7280">' + (lens === 'usd' ? luna(D.totals.net_luna, true) : usd(D.totals.net_usd, true)) + ' in the other lens · positions valued at epoch ' + esc(S.as_of_epoch) + ' (' + esc(S.as_of_day) + ')</div></div>' +
        lensButtons(lens) +
      '</div>' +
      '<p data-pp="sentence" style="font-size:14px;color:#d1d5db;margin:12px 0 6px;line-height:1.5">' + esc(sentence(S)) + '</p>' +
      '<div data-pp="bars">' + rows.map(function (r) { return bar(r[0], r[1], max, lens, r[2]); }).join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px">' +
        [['Put in (cost)', money(S.put_in, lens)], ['Open now', money(S.open_value, lens)], ['Closed trips', String(S.trips)], ['Rewards', money(S.rewards, lens)]].map(function (x) { return '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px 10px"><div style="font-size:11px;color:#6b7280">' + x[0] + '</div><div style="font-family:JetBrains Mono,monospace;font-size:15px;color:#e5e7eb">' + x[1] + '</div></div>'; }).join('') +
      '</div>' +
      (info ? '<div data-pp="custody" style="font-size:12px;color:#67e8f9;margin-top:10px">ⓘ ' + esc(info) + '</div>' : '') +
      (flags.length ? '<div data-pp="flags" style="font-size:12px;color:#fbbf24;margin-top:10px">⚠ ' + esc(flags.join(' · ')) + '</div>' : '');
    el.querySelectorAll('[data-pp-lens]').forEach(function (b) { b.onclick = function () { var l = b.getAttribute('data-pp-lens'); if (opts.onLens) opts.onLens(l); renderStory(el, D, Object.assign({}, opts, { lens: l })); }; });
  }

  // value over time: one SVG line, epochs on x; the "now" point closes it
  function renderCurve(el, D, opts) {
    opts = opts || {}; var lens = opts.lens || 'usd'; var pts = D.curve.filter(function (c) { return (lens === 'luna' ? c.luna : c.usd) != null; });
    if (pts.length < 2) { el.innerHTML = '<div style="color:#6b7280;font-size:13px">Not enough history to draw yet.</div>'; return; }
    var W = 720, H = 200, P = 28; var ys = pts.map(function (c) { return lens === 'luna' ? c.luna : c.usd; }); var mx = Math.max.apply(null, ys.concat([0])); var mn = Math.min.apply(null, ys.concat([0]));
    var x = function (i) { return P + i * (W - 2 * P) / (pts.length - 1); }, y = function (v) { return H - P - (v - mn) / ((mx - mn) || 1) * (H - 2 * P); };
    var path = pts.map(function (c, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(ys[i]).toFixed(1); }).join(' ');
    var gaps = pts.map(function (c, i) { return c.missing && c.missing.length ? '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(ys[i]).toFixed(1) + '" r="2" fill="#fbbf24" opacity=".8"><title>epoch ' + esc(c.e) + ': ' + c.missing.length + ' pool(s) not valued — a lower bound</title></circle>' : ''; }).join('');
    var ticks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(function (i) { return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" fill="#6b7280" font-size="11" text-anchor="middle">' + (pts[i].e === 'now' ? 'now' : 'E' + pts[i].e) + '</text>'; }).join('');
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-size:12px;color:#9ca3af">Value of your TLA positions at every epoch — ' + esc(pts.length - 1) + ' epochs + now</div>' + lensButtons(lens) + '</div>' +
      '<svg data-pp="curve" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Position value over time">' +
      '<text x="' + P + '" y="14" fill="#6b7280" font-size="11">' + esc(money(mx, lens)) + '</text><text x="' + P + '" y="' + (H - P + 14) + '" fill="#6b7280" font-size="11">' + esc(money(mn, lens)) + '</text>' +
      '<path d="' + path + '" fill="none" stroke="#22d3ee" stroke-width="2"/>' + gaps + ticks + '</svg>' +
      (gaps ? '<div style="font-size:11px;color:#6b7280;margin-top:2px"><span style="color:#fbbf24">●</span> an epoch where at least one of your pools had no reading that week — the value there is a lower bound</div>' : '');
    el.querySelectorAll('[data-pp-lens]').forEach(function (b) { b.onclick = function () { var l = b.getAttribute('data-pp-lens'); if (opts.onLens) opts.onLens(l); renderCurve(el, D, Object.assign({}, opts, { lens: l })); }; });
  }

  // positions: one row each, click to open its round trips
  // 1.3.0 (owner 2026-09-28: "a sea of LPs — organize in buckets, more columns to tell a better story"): positions grouped by bucket,
  // each with money in / out / open now, P&L including its rewards, the APR it actually earned (P&L ÷ capital × days — closed trips
  // from their own dates, open lots from pnl-positions 1.1.0 open_lp.capital_days), and for open lots what the pool did to the LP:
  // the take rate's drag on non-amplified (= the top-up that restores it) or the compounding on amplified. Closed positions fold
  // under each bucket so the open book reads first.
  var BUCKETS = ['stable', 'project', 'bluechip', 'single'], BUCKET_LABEL = { stable: 'Stable', project: 'Project', bluechip: 'Bluechip', single: 'Single', other: 'Other / retired pools' };
  var DUST_USD = 1;
  function daysBetween(a, b) { var x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z'); return isFinite(x) && isFinite(y) ? Math.max(1, (y - x) / 864e5) : null; }
  function posStats(p, L) {
    // 1.4.0: a receipt that left the wallet (p.moved / build p.not_held) is not open here; one in a custodian (p.custody) is open at
    // the live value, with P&L only on the share the ledger has a cost for (reconcile())
    var gone = !!(p.moved || (p.not_held && !p.custody)), cu = p.custody || null;
    var open = p.units_open > 0 && !gone, o = p.open_lp || null, s = cu ? cu.basis_share : 1;
    var cost = open ? ((L ? p.open_cost_luna : p.open_cost_usd) == null ? null : (L ? p.open_cost_luna : p.open_cost_usd) * s) : 0;
    var ledV = open ? (L ? p.open_value_luna : p.open_value_usd) : 0;
    var inV = (L ? p.realized.in_luna : p.realized.in_usd) + (open ? (cost || 0) : 0);
    var outV = L ? p.realized.out_luna : p.realized.out_usd, openV = cu ? (L ? cu.luna : cu.usd) : ledV;
    var un = open && ledV != null && cost != null ? ledV * s - cost : (open ? null : 0), rd = L ? p.realized.delta_luna : p.realized.delta_usd, cl = (L ? p.claims.luna : p.claims.usd) || 0;
    var pnl = un != null ? rd + un + cl : null;
    var capDays = 0, capOk = true;
    // 1.4.0: a trip with no price that day has unknown capital — the rewards it earned would be divided by too little, so the APR is
    // left blank (never inflated) when any trip is unpriced
    (p.trips || []).forEach(function (t) { var v = L ? t.in_luna : t.in_usd; var d = daysBetween(t.opened, t.day); if (v != null && d != null) capDays += v * d; else capOk = false; });
    if (open) { var c = o ? (L ? o.capital_days_luna : o.capital_days_usd) : null; if (c == null) capOk = false; else capDays += c * s; }
    var apr = capOk && capDays > 0 && pnl != null ? pnl / capDays * 365 : null, rapr = capOk && capDays > 0 ? cl / capDays * 365 : null;
    return { open: open, inV: inV, outV: outV, openV: openV, pnl: pnl, cl: cl, apr: apr, rapr: rapr, capDays: capDays };
  }
  function lpCell(p, lens) {
    var o = p.open_lp; if (!(p.units_open > 0) || !o || p.moved || (p.not_held && !p.custody)) return '';
    if (o.take_rate && o.take_rate.unmeasured) return '<span style="color:#6b7280" title="' + esc(o.take_rate.why) + '">not measurable</span>';
    if (o.take_rate) { var t = o.take_rate, v = lens === 'luna' ? t.luna : t.usd; return '<span style="color:#fca5a5" title="The take rate removed ' + (t.pct * 100).toFixed(1) + '% of the LP these lots put in — adding this much back restores it">−' + (t.pct * 100).toFixed(1) + '% LP</span><div style="font-size:10px;color:#fbbf24">top up ' + (v != null ? money(v, lens) : '—') + '</div>'; }
    if (o.amp_growth) return '<span style="color:#6ee7b7" title="The amplifier compounded rewards into the pool: more LP than these lots put in">+' + (o.amp_growth.pct * 100).toFixed(1) + '% LP</span><div style="font-size:10px;color:#6b7280">compounded</div>';
    return p.mechanism === 'non_amplified' ? '<span style="color:#6b7280">no drag yet</span>' : '';
  }
  // 1.5.0 (owner: "show what address it was sent to — its name if it is a registered address"): the build's moves[] (pnl-positions
  // 1.3.0) — where this position's receipts went, named by the org registry (custodian / catalog entity / known contract / member)
  function shortAddr(a) { return a ? a.slice(0, 10) + '…' + a.slice(-4) : ''; }
  function sentTo(p) {
    var out = (p.moves || []).filter(function (m) { return m.net_units > 0; }); if (!out.length) return '';
    var m = out[0], more = out.length - 1;
    return '<div style="font-size:10.5px;color:#9ca3af;margin-top:2px">sent to ' + (m.label ? '<b style="color:#e5e7eb">' + esc(m.label) + '</b> ' : '') + '<a href="https://chainsco.pe/terra2/address/' + esc(m.to) + '" target="_blank" rel="noopener" style="color:#67e8f9" title="' + esc(m.to) + '">' + esc(shortAddr(m.to)) + '</a>' + (m.last_day ? ' on ' + esc(m.last_day) : '') + (m.last_tx ? ' · <a href="https://chainsco.pe/terra2/tx/' + esc(m.last_tx) + '" target="_blank" rel="noopener" style="color:#67e8f9">tx</a>' : '') + (more > 0 ? ' · +' + more + ' more' : '') + (m.label ? '' : ' <span style="color:#6b7280">(not a registered address)</span>') + '</div>';
  }
  // ── 2.0.0 positions, trip by trip (owner 2026-09-28: "look at the layout — easy to read, understood in $ and %; USD → Tokens;
  // the total bar sells it short — make it more engaging") ──────────────────────────────────────────────────────────────
  // Lenses: USD · Tokens (what went in and came out, token by token — pnl-positions 1.4.0) · LUNA. Every row: both tokens' logos,
  // the venue (two LUNA-SOLID non-amp rows are two different pools), money in / out / open now, the result in $ AND %, days held,
  // APR only when the money was in for ≥ 30 days (a week-long trip annualised to ±600 % is noise, not information). A trip with
  // no price reads "unpriced", never $0.00. Under the table: a scorecard, not a sum line.
  var MIN_APR_DAYS = 30;
  function logoPair(name) { var TL = typeof self !== 'undefined' && self.TokenLogos; return TL ? TL.pair(name, 18) : ''; }
  function tq(a) { if (a == null || !isFinite(a)) return '—'; var b = Math.abs(a); return b >= 1e4 ? Math.round(a).toLocaleString('en-US') : b >= 1 ? a.toLocaleString('en-US', { maximumFractionDigits: 1 }) : b === 0 ? '0' : Number(a.toPrecision(3)).toString(); }   // tokens: small amounts keep their digits (0.0042 WBTC, not 0)
  function tokLine(obj, max) {   // {sym: amt} | [[sym, amt]] → "4,743 LUNA + 1,913 USDC"
    var e = Array.isArray(obj) ? obj : Object.entries(obj || {}); if (!e.length) return null; var TL = typeof self !== 'undefined' && self.TokenLogos;
    return e.slice(0, max || 3).map(function (x) { return '<span style="white-space:nowrap">' + (TL ? TL.img(x[0], 13) + ' ' : '') + tq(x[1]) + ' <span style="color:#9ca3af">' + esc(x[0]) + '</span></span>'; }).join(' + ') + (e.length > (max || 3) ? ' …' : '');
  }
  function posStats2(p, L) {
    var S = posStats(p, L); var gone = !!(p.moved || (p.not_held && !p.custody));
    var valued = p.realized.valued || 0, unpricedTrips = (p.realized.trips || 0) - valued;
    S.unpriced = p.realized.trips > 0 && valued === 0 && !(S.open && S.openV > 0);   // nothing on the money side can be priced
    S.ret = S.pnl != null && S.inV > 0 ? S.pnl / S.inV : null;
    var first = null, last = null; (p.trips || []).forEach(function (t) { if (t.opened && (!first || t.opened < first)) first = t.opened; if (t.day && (!last || t.day > last)) last = t.day; });
    if (S.open && p.open_lp && p.open_lp.open_since) { if (!first || p.open_lp.open_since < first) first = p.open_lp.open_since; last = p.open_lp.as_of_day || last; }
    S.first = first; S.last = last; S.days = first && last ? daysBetween(first, last) : null;
    S.avgDays = S.capDays > 0 && S.inV > 0 ? S.capDays / S.inV : S.days;   // capital-weighted days in
    S.aprShown = S.apr != null && S.avgDays != null && S.avgDays >= MIN_APR_DAYS ? S.apr : null;
    // LP vs just holding the tokens: realized trips' pool mechanics (lp_usd = out − the entry tokens at exit prices) + open (value − the entry tokens now)
    var ot = p.open_tok; S.vsHold = (L ? null : (p.realized.lp_usd || 0)) ; if (S.vsHold != null && S.open && ot && ot.hold_usd != null && !gone) { var sh = p.custody ? (p.custody.basis_share || 0) : 1; S.vsHold += ((p.open_value_usd || 0) - ot.hold_usd) * sh; }   // the lots with a cost only (a custodian's untracked part has no entry tokens to compare)
    S.unpricedTrips = unpricedTrips; return S;
  }
  function renderPositions(el, D, opts) {
    opts = opts || {}; var lens = opts.lens || 'usd'; var nameOf = opts.nameOf || function (k) { return k; }; var pill = opts.pill || function () { return ''; }; var bucketOf = opts.bucketOf || function () { return null; }; var venueOf = opts.venueOf || function () { return null; };
    var TOK = lens === 'tokens', L = lens === 'luna', ML = TOK ? 'usd' : lens; var TD = 'padding:8px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12.5px;vertical-align:top';
    var rows = D.positions.filter(function (p) { return p.deposits || p.withdraws; });
    var groups = {}; rows.forEach(function (p, i) { p._i = i; var b = bucketOf(p.pool); b = BUCKETS.indexOf(b) >= 0 ? b : 'other'; (groups[b] = groups[b] || []).push(p); });
    var head = TOK ? ['Pool', 'Tokens in', 'Tokens out', 'Open now', 'vs just holding them', 'Days', 'Trips'] : ['Pool', 'In', 'Out', 'Open now', 'Result', 'Return', 'Days', 'APR', 'LP since entry', 'Trips'];
    var NC = head.length;
    var pname = function (p) { return p.name && !/^(cw20|native):/.test(p.name) ? p.name : nameOf(p.pool); };
    var rowHtml = function (p) {
      var S = posStats2(p, L), nm = pname(p), ven = venueOf(p.pool);
      var flag = p.custody ? ' <span title="' + esc('The receipt is staked in ' + p.custody.where + ' — still yours and still earning. Valued at the live chain read' + (p.custody.untracked_usd > 0.5 ? '; ' + usd(p.custody.untracked_usd) + ' of it came from before our history or by transfer, so it has no cost basis and stays out of the P&L' : '') + '.') + '" style="font-size:10.5px;color:#67e8f9">in ' + esc(p.custody.where) + '</span>'
        : (p.moved || p.not_held) ? ' <span title="' + esc('Our history saw these deposits go in and never come out — but the chain read finds nothing in this wallet now. The receipt was sent to another address (a transfer, not a withdrawal). Left out of Open now; its trips and rewards stay in the history.') + '" style="font-size:11px;color:#fbbf24">⚠ not in this wallet</span>' + sentTo(p)
        : p.held_in ? ' <span style="font-size:10.5px;color:#67e8f9">in ' + esc(p.held_in.where) + '</span>'
        : p.disputed ? ' <span title="' + esc('left out of your totals — ours ' + usd(p.disputed.ours_usd) + ' vs ' + (p.disputed.participants_usd != null ? 'the hourly chain read ' + usd(p.disputed.participants_usd) : 'the whole gauge ' + usd(p.disputed.gauge_total_usd))) + '" style="font-size:11px;color:#fbbf24">⚠ disputed</span>' : '';
      var poolCell = '<td style="padding:8px 6px;font-size:12.5px;color:#e5e7eb;vertical-align:top"><div style="display:flex;gap:8px;align-items:flex-start">' + logoPair(nm) + '<div style="min-width:0"><div>' + esc(nm) + ' <span style="font-size:10.5px;color:' + (p.mechanism === 'amplified' ? '#fb923c' : '#9ca3af') + '">' + (p.mechanism === 'amplified' ? 'amp' : 'non-amp') + '</span>' + pill(p.pool) + flag + '</div>' + (ven ? '<div style="font-size:10.5px;color:#6b7280">' + esc(ven) + '</div>' : '') + '</div></div></td>';
      var dust = S.open && S.openV != null && S.openV < DUST_USD && !p.custody;
      var openCell = S.open && !dust ? money(S.openV, ML) : (p.moved || p.not_held) ? '<span style="color:#9ca3af">sent away</span><div style="font-size:10px;color:#6b7280">was ' + money(L ? (p.open_value_luna || 0) : (p.open_value_usd || 0), ML) + ' · not counted</div>' : dust ? '<span style="color:#6b7280" title="Less than $1 left in the pool — read with the closed book">&lt; $1 left</span>' : '<span style="color:#4b5563">closed</span>';
      var daysCell = '<td style="' + TD + ';color:#9ca3af" title="' + esc(S.first ? 'first in ' + S.first + (S.last ? ' · last ' + (S.open ? 'read ' : 'out ') + S.last : '') + (S.avgDays != null ? ' · money-weighted ' + Math.round(S.avgDays) + ' days in' : '') : '') + '">' + (S.days != null ? Math.round(S.days) : '—') + '</td>';
      var cells;
      if (TOK) {
        var ti = p.realized.tok_in || null, to = p.realized.tok_out || null, ot = p.open_tok || null;
        var sumTok = {}; [ti, S.open && ot ? ot.tok_in : null].forEach(function (o) { Object.keys(o || {}).forEach(function (k) { sumTok[k] = (sumTok[k] || 0) + o[k]; }); }); var inT = Object.keys(sumTok).length ? tokLine(Object.entries(sumTok).sort(function (a, b) { return b[1] - a[1]; })) : null;   /* closed trips' tokens + the open lots' tokens, summed */
        cells = '<td style="' + TD + ';font-family:inherit;font-size:12px;text-align:left">' + (inT || '<span style="color:#4b5563">—</span>') + '</td>' +
          '<td style="' + TD + ';font-family:inherit;font-size:12px;text-align:left">' + (tokLine(to) || '<span style="color:#4b5563">—</span>') + '</td>' +
          '<td style="' + TD + ';font-family:inherit;font-size:12px;text-align:left">' + (S.open && ot && ot.tok_now ? tokLine(ot.tok_now) : openCell) + '</td>' +
          '<td style="' + TD + ';' + tone(S.vsHold) + '" title="' + esc('What the pool did against simply holding the tokens you put in: fees and rewards compounded in, impermanent loss and the take rate taken out. Closed trips: out − the entry tokens at exit prices; open: value now − the entry tokens at today’s prices.') + '">' + (S.vsHold != null && (p.realized.valued || (S.open && p.open_tok)) ? usd(S.vsHold, true) : '—') + '</td>' + daysCell;
      } else {
        var unp = S.unpriced ? '<span style="color:#6b7280" title="' + esc('No price for ' + (S.unpricedTrips === 1 ? 'this trip' : 'these trips') + ' on the day it happened (a token nothing priced then) — shown as unpriced, never $0') + '">unpriced</span>' : null;
        cells = '<td style="' + TD + ';color:#d1d5db">' + (unp || money(S.inV, ML)) + '</td>' +
          '<td style="' + TD + ';color:#9ca3af">' + (unp ? unp : p.realized.trips ? money(S.outV, ML) : '') + '</td>' +
          '<td style="' + TD + '">' + openCell + '</td>' +
          '<td style="' + TD + ';' + tone(S.pnl) + '" title="' + esc('closed trips ' + money(L ? p.realized.delta_luna : p.realized.delta_usd, ML, true) + ' · open ' + (S.open ? money(S.openV - (L ? p.open_cost_luna : p.open_cost_usd), ML, true) : '—') + ' · rewards ' + money(S.cl, ML, true)) + '">' + (S.unpriced ? (S.cl ? money(S.cl, ML, true) + '<div style="font-size:10px;color:#6b7280">rewards only</div>' : '—') : S.pnl != null ? money(S.pnl, ML, true) : '—') + '</td>' +
          '<td style="' + TD + ';' + tone(S.ret) + '">' + (S.unpriced || S.ret == null ? '—' : pct(S.ret, true)) + '</td>' + daysCell +
          '<td style="' + TD + ';' + tone(S.aprShown) + '" title="' + esc(S.apr == null && S.capDays > 0 ? 'Left blank: at least one trip had no price that day — an APR here would be inflated' : S.apr != null && S.aprShown == null ? 'Left blank: the money was in for about ' + Math.round(S.avgDays || 0) + ' days — annualising under ' + MIN_APR_DAYS + ' days exaggerates (it would read ' + (S.apr * 100).toFixed(0) + '%)' : 'P&L ÷ (capital × days held) × 365 · rewards alone ' + (S.rapr != null ? (S.rapr * 100).toFixed(1) + '%' : '—')) + '">' + (S.aprShown != null ? (S.aprShown * 100).toFixed(1) + '%' : '—') + (S.rapr && S.aprShown != null ? '<div style="font-size:10px;color:#6ee7b7">rewards ' + (S.rapr * 100).toFixed(1) + '%</div>' : '') + '</td>' +
          '<td style="' + TD + ';font-size:11.5px">' + lpCell(p, ML) + '</td>';
      }
      return '<tr data-pp-row="' + p._i + '" style="cursor:pointer;border-top:1px solid rgba(255,255,255,.05)' + (p.disputed ? ';opacity:.6' : '') + '">' + poolCell + cells +
        '<td style="padding:8px 6px;text-align:right;font-size:12px;color:#9ca3af;vertical-align:top">' + p.realized.trips + '</td></tr>' +
        '<tr data-pp-trips="' + p._i + '" hidden><td colspan="' + NC + '" style="padding:0 6px 10px 34px">' + tripsTable(p, lens) + '</td></tr>';
    };
    var isMoved = function (p) { return !p.custody && !!(p.moved || p.not_held); };   // 2.0.1 (owner: "it was given away, I can't get it back — not my position any more"): its own folded group, like tx history
    var isOpen = function (p) { return !isMoved(p) && (!!p.custody || (p.units_open > 0 && !(p.open_value_usd != null && p.open_value_usd < DUST_USD))); };
    var body = BUCKETS.concat(['other']).filter(function (b) { return groups[b]; }).map(function (b) {
      var ov = function (p) { return p.custody ? p.custody.usd : (p.open_value_usd || 0); };
      var ps = groups[b];
      var openPs = ps.filter(isOpen).sort(function (a, c) { return ov(c) - ov(a); });
      var movedPs = ps.filter(isMoved);
      var closedPs = ps.filter(function (p) { return !isOpen(p) && !isMoved(p); }).sort(function (a, c) { var A = posStats2(a, L), C = posStats2(c, L); return Math.abs(C.pnl || 0) - Math.abs(A.pnl || 0); });   // the ones that mattered first
      var sum = function (list, f) { return list.reduce(function (s, p) { if (p.disputed) return s; var v = f(posStats2(p, L)); return s + (v || 0); }, 0); };
      var capAll = sum(ps, function (S) { return S.aprShown != null ? S.capDays : 0; }), pnlAll = sum(ps, function (S) { return S.pnl; }), pnlA = sum(ps, function (S) { return S.aprShown != null ? S.pnl : 0; }), aprB = capAll > 0 ? pnlA / capAll * 365 : null;
      var inAll = sum(ps, function (S) { return S.unpriced ? 0 : S.inV; });
      var wins = ps.filter(function (p) { var S = posStats2(p, L); return !p.disputed && S.pnl != null && !S.unpriced; }); var won = wins.filter(function (p) { return posStats2(p, L).pnl > 0; }).length;
      var h = '<tr data-pp-bucket="' + b + '" style="background:rgba(255,255,255,.035)"><td colspan="' + (TOK ? 4 : 4) + '" style="padding:9px 6px;font-size:12px;font-weight:700;color:#e5e7eb;text-transform:uppercase;letter-spacing:.04em">' + BUCKET_LABEL[b] + ' <span style="font-weight:400;color:#6b7280;text-transform:none">· ' + openPs.length + ' open · ' + closedPs.length + ' closed' + (movedPs.length ? ' · ' + movedPs.length + ' sent away' : '') + (wins.length ? ' · ' + won + ' of ' + wins.length + ' made money' : '') + '</span></td>' +
        (TOK ? '<td style="' + TD + ';' + tone(sum(ps, function (S) { return S.vsHold; })) + '">' + usd(sum(ps, function (S) { return S.vsHold; }), true) + '</td><td></td><td></td>'
          : '<td style="' + TD + ';' + tone(pnlAll) + ';font-weight:700">' + money(pnlAll, ML, true) + '</td><td style="' + TD + ';' + tone(pnlAll) + '">' + (inAll > 0 ? pct(pnlAll / inAll, true) : '—') + '</td><td></td><td style="' + TD + ';' + tone(aprB) + '">' + (aprB != null ? (aprB * 100).toFixed(1) + '%' : '—') + '</td><td></td><td></td>') + '</tr>';
      var closedBlock = closedPs.length ? '<tr data-pp-closed-toggle="' + b + '" style="cursor:pointer"><td colspan="' + NC + '" style="padding:6px 6px;font-size:11.5px;color:#9ca3af">▸ ' + closedPs.length + ' closed position' + (closedPs.length === 1 ? '' : 's') + ' · ' + money(sum(closedPs, function (S) { return S.pnl; }), ML, true) + ' — show</td></tr>' +
        closedPs.map(function (p) { return rowHtml(p).replace('<tr data-pp-row=', '<tr data-pp-closed="' + b + '" hidden data-pp-row='); }).join('') : '';
      var movedBlock = movedPs.length ? '<tr data-pp-closed-toggle="' + b + '-moved" style="cursor:pointer"><td colspan="' + NC + '" style="padding:6px 6px;font-size:11.5px;color:#9ca3af">▸ ' + movedPs.length + ' sent to another address (no longer yours, not in your totals) · rewards while held ' + money(sum(movedPs, function (S) { return S.cl; }), ML, true) + ' — show</td></tr>' +
        movedPs.map(function (p) { return rowHtml(p).replace('<tr data-pp-row=', '<tr data-pp-closed="' + b + '-moved" hidden data-pp-row='); }).join('') : '';
      return h + openPs.map(rowHtml).join('') + closedBlock + movedBlock;
    }).join('');
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap"><div style="font-size:12px;color:#9ca3af">' + rows.length + ' positions by bucket · open first, closed and sent-away folded (biggest results first) · tap one for its round trips</div>' + lensButtons(lens, true) + '</div>' +
      '<div style="overflow-x:auto"><table data-pp="positions" style="width:100%;border-collapse:collapse;min-width:' + (TOK ? 820 : 900) + 'px"><thead><tr>' + head.map(function (h, i) { return '<th style="text-align:' + (i && !(TOK && i < 4) ? 'right' : 'left') + ';font-size:11px;color:#6b7280;font-weight:600;padding:6px">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      scorecard(rows, lens, opts) +
      '<div style="font-size:10.5px;color:#6b7280;margin-top:6px">Result = closed trips + what is open vs its cost + the LP rewards the position claimed (bribes are paid to your votes, so they sit with Locks in "How you’ve done"). Return = result ÷ what went in. APR = result ÷ (capital × days in) × 365, shown only when the money was in ≥ ' + MIN_APR_DAYS + ' days. LP since entry: non-amplified pools lose LP to the take rate (the top-up restores it); amplified pools compound more LP in.</div>';
    el.querySelectorAll('[data-pp-row]').forEach(function (tr) { tr.onclick = function () { var t = el.querySelector('[data-pp-trips="' + tr.getAttribute('data-pp-row') + '"]'); if (t) t.hidden = !t.hidden; }; });
    el.querySelectorAll('[data-pp-closed-toggle]').forEach(function (tr) { tr.onclick = function () { var b = tr.getAttribute('data-pp-closed-toggle'); var rs = el.querySelectorAll('[data-pp-closed="' + b + '"]'); var show = rs.length && rs[0].hidden; rs.forEach(function (r) { r.hidden = !show; }); if (!show) el.querySelectorAll('[data-pp-trips]').forEach(function (t) { var row = el.querySelector('[data-pp-row="' + t.getAttribute('data-pp-trips') + '"]'); if (row && row.hidden) t.hidden = true; }); tr.firstChild.textContent = tr.firstChild.textContent.replace(show ? '▸' : '▾', show ? '▾' : '▸').replace(show ? '— show' : '— hide', show ? '— hide' : '— show'); }; });
    el.querySelectorAll('[data-pp-lens]').forEach(function (b) { b.onclick = function () { var l = b.getAttribute('data-pp-lens'); if (opts.onLens) opts.onLens(l); renderPositions(el, D, Object.assign({}, opts, { lens: l })); }; });
  }
  // the scorecard under the table: the story of every LP, not one sum line
  function scorecard(rows, lens, opts) {
    var L = lens === 'luna', ML = lens === 'tokens' ? 'usd' : lens;
    var live = rows.filter(function (p) { return !p.disputed; }); var all = live.map(function (p) { return { p: p, S: posStats2(p, L), U: posStats2(p, false), N: posStats2(p, true) }; });
    var sum = function (f) { return all.reduce(function (s, x) { var v = f(x); return s + (v || 0); }, 0); };
    var tIn = sum(function (x) { return x.S.unpriced ? 0 : x.S.inV; }), tOut = sum(function (x) { return x.S.outV; }), tOpen = sum(function (x) { return x.S.open ? x.S.openV : 0; }), tPnl = sum(function (x) { return x.S.pnl; }), tRew = sum(function (x) { return x.S.cl; });
    var uPnl = sum(function (x) { return x.U.pnl; }), nPnl = sum(function (x) { return x.N.pnl; }), vsHold = sum(function (x) { return x.U.vsHold; });
    var mkt = sum(function (x) { return x.p.realized.market_usd; }), mech = sum(function (x) { return x.p.realized.lp_usd; }), open = sum(function (x) { return x.U.open && x.U.pnl != null ? x.U.pnl - (x.p.realized.delta_usd || 0) - x.U.cl : 0; });
    var tCap = sum(function (x) { return x.S.aprShown != null ? x.S.capDays : 0; }), tPnlA = sum(function (x) { return x.S.aprShown != null ? x.S.pnl : 0; }), tApr = tCap > 0 ? tPnlA / tCap * 365 : null;
    var scored = all.filter(function (x) { return x.U.pnl != null && !x.U.unpriced; }); var won = scored.filter(function (x) { return x.U.pnl > 0; });
    var trips = []; all.forEach(function (x) { (x.p.trips || []).forEach(function (t) { if (t.delta_usd != null && !t.flag) trips.push({ t: t, name: x.p.name || x.p.pool }); }); });
    trips.sort(function (a, b) { return b.t.delta_usd - a.t.delta_usd; }); var best = trips[0], worst = trips[trips.length - 1];
    var days = sum(function (x) { return x.U.capDays; }), avgIn = tIn > 0 && !L ? days / sum(function (x) { return x.U.unpriced ? 0 : x.U.inV; }) : null;
    var big = function (label, v, style, sub, dp) { return '<div' + (dp ? ' data-pp="' + dp + '"' : '') + ' style="min-width:118px"><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">' + label + '</div><div style="font-family:JetBrains Mono,monospace;font-size:22px;font-weight:700;' + (style || 'color:#e5e7eb') + '">' + v + '</div>' + (sub ? '<div style="font-size:10.5px;color:#6b7280">' + sub + '</div>' : '') + '</div>'; };
    // waterfall (USD): put in → prices → pool mechanics → still open → rewards = what you got back + what is still in
    var steps = [['Prices', mkt, 'what prices did to the tokens you put in (closed trips)'], ['Pool mechanics', mech, 'fees + compounding − IL − take rate (closed trips)'], ['Still open', open, 'open positions vs their cost'], ['LP rewards', tRew, 'claimed by these positions']];
    var mx = Math.max.apply(null, steps.map(function (s) { return Math.abs(s[1] || 0); }).concat([1]));
    var wf = '<div style="display:grid;grid-template-columns:130px 1fr 110px;gap:6px 10px;align-items:center;margin-top:12px">' + steps.map(function (s) { var w = Math.max(1.5, Math.abs(s[1] || 0) / mx * 50); return '<div style="font-size:12px;color:#d1d5db" title="' + esc(s[2]) + '">' + s[0] + '</div><div style="height:10px;background:rgba(255,255,255,.04);border-radius:5px;position:relative"><div style="position:absolute;top:0;bottom:0;' + ((s[1] || 0) < 0 ? 'right:50%' : 'left:50%') + ';width:' + w.toFixed(1) + '%;background:' + ((s[1] || 0) < 0 ? '#f87171' : '#34d399') + ';border-radius:5px"></div><div style="position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:rgba(255,255,255,.2)"></div></div><div style="font-family:JetBrains Mono,monospace;font-size:13px;text-align:right;' + tone(s[1]) + '">' + usd(s[1], true) + '</div>'; }).join('') +
      '<div style="font-size:12px;color:#e5e7eb;font-weight:700;border-top:1px solid rgba(255,255,255,.08);padding-top:6px">= Result</div><div style="border-top:1px solid rgba(255,255,255,.08)"></div><div style="font-family:JetBrains Mono,monospace;font-size:14px;font-weight:700;text-align:right;border-top:1px solid rgba(255,255,255,.08);padding-top:6px;' + tone(uPnl) + '">' + usd(uPnl, true) + '</div></div>';
    var winBar = scored.length ? '<div style="margin-top:4px;height:6px;border-radius:3px;background:rgba(248,113,113,.45);overflow:hidden"><div style="height:100%;width:' + (won.length / scored.length * 100).toFixed(1) + '%;background:#34d399"></div></div>' : '';
    var tripTxt = function (x) { return x ? esc(x.name) + ' · ' + esc(x.t.opened || '?') + ' → ' + esc(x.t.day) : ''; };
    return '<div data-pp="positions-total" style="margin-top:14px;padding:16px 18px;border-radius:14px;background:linear-gradient(135deg,rgba(57,135,229,.08),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09)">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px"><div style="font-size:14px;font-weight:700;color:#e5e7eb">Your LP scorecard <span style="font-size:11px;font-weight:400;color:#6b7280">· ' + all.length + ' positions' + (all.length < rows.length ? ' (' + (rows.length - all.length) + ' disputed left out)' : '') + '</span></div>' +
      '<div style="font-size:12px;color:#d1d5db">' + (nPnl != null && uPnl != null ? (uPnl < 0 && nPnl > 0 ? 'Down <b style="color:#fca5a5">' + usd(Math.abs(uPnl)) + '</b> in dollars, but up <b style="color:#6ee7b7">' + luna(nPnl) + '</b> — the LUNA your LPs returned beat just holding LUNA.' : uPnl >= 0 && nPnl >= 0 ? 'Up in dollars <b style="color:#6ee7b7">and</b> in LUNA terms.' : uPnl >= 0 ? 'Up in dollars; in LUNA terms ' + luna(nPnl, true) + '.' : 'Down in dollars and in LUNA terms (' + luna(nPnl, true) + ').') : '') + '</div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px 30px;align-items:flex-end;margin-top:12px">' +
        big('Put in', money(tIn, ML)) + big('Taken out', money(tOut, ML)) + big('Open now', money(tOpen, ML)) +
        big('Result', money(tPnl, ML, true), tone(tPnl), 'of which LP rewards ' + money(tRew, ML, true), 'pp-total-pnl') +
        big('Return', tIn > 0 ? pct(tPnl / tIn, true) : '—', tone(tPnl), tApr != null ? 'annualised ' + pct(tApr, true) + ' on the positions in ≥ ' + MIN_APR_DAYS + ' days' : 'on what went in', 'pp-total-return') +
        (!L ? big('vs just holding', usd(vsHold, true), tone(vsHold), 'the pools vs keeping the tokens') : '') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:14px">' +
        '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:9px 11px"><div style="font-size:11px;color:#9ca3af">Made money</div><div style="font-family:JetBrains Mono,monospace;font-size:17px;color:#e5e7eb">' + won.length + ' <span style="color:#6b7280;font-size:13px">of ' + scored.length + '</span></div>' + winBar + '</div>' +
        (best ? '<div style="background:rgba(52,211,153,.05);border:1px solid rgba(52,211,153,.15);border-radius:10px;padding:9px 11px"><div style="font-size:11px;color:#9ca3af">Best round trip</div><div style="font-family:JetBrains Mono,monospace;font-size:17px;color:#6ee7b7">' + usd(best.t.delta_usd, true) + '</div><div style="font-size:10.5px;color:#6b7280">' + tripTxt(best) + '</div></div>' : '') +
        (worst && worst !== best ? '<div style="background:rgba(248,113,113,.05);border:1px solid rgba(248,113,113,.15);border-radius:10px;padding:9px 11px"><div style="font-size:11px;color:#9ca3af">Worst round trip</div><div style="font-family:JetBrains Mono,monospace;font-size:17px;color:#fca5a5">' + usd(worst.t.delta_usd, true) + '</div><div style="font-size:10.5px;color:#6b7280">' + tripTxt(worst) + '</div></div>' : '') +
        (avgIn != null && isFinite(avgIn) ? '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:9px 11px"><div style="font-size:11px;color:#9ca3af">Time in the pools</div><div style="font-family:JetBrains Mono,monospace;font-size:17px;color:#e5e7eb">' + Math.round(avgIn) + ' days</div><div style="font-size:10.5px;color:#6b7280">how long each dollar stayed in, on average · ' + trips.length + ' priced round trips</div></div>' : '') +
        (opts.fees != null ? '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:9px 11px"><div style="font-size:11px;color:#9ca3af">Swap fees paid entering</div><div style="font-family:JetBrains Mono,monospace;font-size:17px;color:#fbbf24">' + usd(opts.fees) + '</div><div style="font-size:10.5px;color:#6b7280">spread + commission, at each day’s price (already inside "Put in")</div></div>' : '') +
      '</div>' + (lens !== 'luna' ? wf : '') + '</div>';
  }
  function tripsTable(p, lens) {
    if (!p.trips.length) return '<div style="font-size:12px;color:#6b7280;padding:6px 0">No closed trips — every deposit here is still open.</div>';
    var L = lens === 'luna', TOK = lens === 'tokens', ML = TOK ? 'usd' : lens;
    var TH = function (t, r) { return '<th style="text-align:' + (r ? 'right' : 'left') + ';font-size:11px;color:#6b7280;padding:4px 6px">' + t + '</th>'; };
    var r = p.trips.slice().reverse().slice(0, 50).map(function (t) {
      var inV = L ? t.in_luna : t.in_usd, outV = L ? t.out_luna : t.out_usd, d = L ? t.delta_luna : t.delta_usd, days = t.opened && t.day ? Math.round(daysBetween(t.opened, t.day)) : null;
      var note = t.flag ? '<span style="color:#fbbf24">' + esc(t.flag) + '</span>' : (!L && t.market_usd != null ? 'prices ' + usd(t.market_usd, true) + ' · pool ' + usd(t.lp_usd, true) : '');
      var M = 'padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px';
      return '<tr><td style="padding:4px 6px;font-size:12px;color:#9ca3af;white-space:nowrap">' + esc(t.opened || '?') + ' → ' + esc(t.day) + (days != null ? ' <span style="color:#6b7280">· ' + days + 'd</span>' : '') + '</td>' +
        (TOK ? '<td style="padding:4px 6px;font-size:12px">' + (tokLine(t.tok_in) || '—') + '</td><td style="padding:4px 6px;font-size:12px">' + (tokLine(t.tok_out) || '—') + '</td>'
             : '<td style="' + M + '">' + (inV == null ? '<span style="color:#6b7280">unpriced</span>' : money(inV, ML)) + '</td><td style="' + M + '">' + (outV == null ? '<span style="color:#6b7280">unpriced</span>' : money(outV, ML)) + '</td>') +
        '<td style="' + M + ';' + tone(d) + '">' + (d == null ? '—' : money(d, ML, true) + (inV > 0 ? ' <span style="font-size:10.5px">' + pct(d / inV, true) + '</span>' : '')) + '</td><td style="padding:4px 6px;font-size:11px;color:#6b7280">' + note + (t.tx ? ' <a href="https://chainsco.pe/terra2/tx/' + esc(t.tx) + '" target="_blank" rel="noopener" style="color:#67e8f9">tx</a>' : '') + '</td></tr>';
    }).join('');
    return '<table style="width:100%;border-collapse:collapse;margin-top:4px"><thead><tr>' + TH('Opened → closed') + (TOK ? TH('Tokens in') + TH('Tokens out') : TH('In', 1) + TH('Out', 1)) + TH('Δ', 1) + '<th></th></tr></thead><tbody>' + r + '</tbody></table>' + (p.trips.length > 50 ? '<div style="font-size:11px;color:#6b7280">newest 50 of ' + p.trips.length + '</div>' : '');
  }

  // ── NFT leg (nft-collections/<slug>/ledger/by-wallet → wallets[addr]) ─────────────────────────────────────────────
  // the mark per tier = the CONSERVATIVE floor: min(live listing floor, recent sales floor) — the same rule the portfolio's
  // Holdings ladder uses (DeFi_Patriot 2026-08-03: the lower signal is the honest mark)
  function nftMark(perTier, tier) { var f = (perTier || {})[tier] || {}; var sf = num(f.sales_floor_usd), lf = num(f.listing_floor_usd); return sf != null && lf != null ? Math.min(sf, lf) : (sf != null ? sf : lf); }
  // → { slug, label, held, by_state, tiers:{tier:{n, mark}}, cost_usd, cost_luna, priced, priced_luna, value_usd, value_luna, value_priced_usd, unrealized_usd,
  //     unrealized_luna, received, realized:{trips, usd, luna}, tokens:[…] }
  function nftLeg(o) {
    var w = o.entry; if (!w || !w.holdings_now) return null; var P = o.phoenix || { has: function () { return false; } }; var L = num(o.lunaUsdNow);
    var toks = (w.holdings_now.tokens || []).map(function (t) {
      var tier = P.has(String(t.token_id)) ? 'phoenix' : (t.broken ? 'broken' : 'base'); var mark = nftMark(o.perTier, tier); var a = t.acquired || null; var pr = a && a.price || null;
      var cost = pr && num(pr.usd) != null ? pr.usd : null; var costL = pr && pr.symbol === 'LUNA' && pr.amount != null ? Number(pr.amount) / Math.pow(10, pr.decimals || 6) : null;
      return { id: String(t.token_id), tier: tier, state: t.state, mark: mark, cost_usd: cost, cost_luna: costL, how: a ? a.kind : null, when: a && a.ts ? String(a.ts).slice(0, 10) : null, venue: a && a.venue || null, symbol: pr && pr.symbol || null, paid: pr && pr.amount != null ? Number(pr.amount) / Math.pow(10, pr.decimals || 6) : null, tx: a && a.txhash || null };
    });
    var tiers = {}; toks.forEach(function (t) { var x = tiers[t.tier] || (tiers[t.tier] = { n: 0, mark: t.mark }); x.n++; });
    var priced = toks.filter(function (t) { return t.cost_usd != null && t.mark != null; });
    var pricedL = toks.filter(function (t) { return t.cost_luna != null && t.mark != null && L; });
    var sum = function (a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); };
    var value = sum(toks.filter(function (t) { return t.mark != null; }), function (t) { return t.mark; });
    var R = w.realized || {};
    return { slug: o.slug, label: o.label, held: toks.length, by_state: w.holdings_now.by_state || {}, tiers: tiers,
      value_usd: value, value_luna: L ? value / L : null, unmarked: toks.filter(function (t) { return t.mark == null; }).length,
      priced: priced.length, cost_usd: sum(priced, function (t) { return t.cost_usd; }), value_priced_usd: sum(priced, function (t) { return t.mark; }),
      unrealized_usd: sum(priced, function (t) { return t.mark - t.cost_usd; }),
      priced_luna: pricedL.length, cost_luna: sum(pricedL, function (t) { return t.cost_luna; }), unrealized_luna: L ? sum(pricedL, function (t) { return t.mark / L - t.cost_luna; }) : null,
      received: toks.filter(function (t) { return t.cost_usd == null; }).length,
      realized: { trips: R.round_trips || 0, usd: R.usd && R.usd.total != null ? R.usd.total : null, usd_priced: R.usd ? R.usd.priced : 0, luna: R.luna && R.luna.total != null ? R.luna.total : null, luna_priced: R.luna ? R.luna.priced : 0 },
      tokens: toks };
  }
  function renderNfts(el, legs, opts) {
    opts = opts || {}; var lens = opts.lens || 'usd'; var L = lens === 'luna';
    legs = (legs || []).filter(Boolean);
    if (!legs.length) { el.innerHTML = '<div style="color:#6b7280;font-size:13px">No NFTs from the tracked collections in this wallet — now or in the past.</div>'; return; }
    var cell = function (k, v, t) { return '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px 10px"><div style="font-size:11px;color:#6b7280">' + k + '</div><div style="font-family:JetBrains Mono,monospace;font-size:15px;' + (t || 'color:#e5e7eb') + '">' + v + '</div></div>'; };
    el.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:6px">' + lensButtons(lens) + '</div>' + legs.map(function (g, gi) {
      var un = L ? g.unrealized_luna : g.unrealized_usd, re = L ? g.realized.luna : g.realized.usd;
      var tierTxt = Object.keys(g.tiers).map(function (k) { var x = g.tiers[k]; return x.n + ' ' + k + (x.mark != null ? ' @ ' + usd(x.mark) : ' (no floor)'); }).join(' · ');
      var rows = g.tokens.slice().sort(function (a, b) { return (b.mark || 0) - (a.mark || 0) || (b.cost_usd || 0) - (a.cost_usd || 0); }).map(function (t) {
        var d = t.cost_usd != null && t.mark != null ? t.mark - t.cost_usd : null;
        return '<tr><td style="padding:4px 6px;font-size:12px">#' + esc(t.id) + ' <span style="color:#6b7280">' + esc(t.tier) + ' · ' + esc(t.state || '') + '</span></td><td style="padding:4px 6px;font-size:12px;color:#9ca3af">' + (t.how === 'sale' || t.how === 'mint_purchase' ? esc((t.how === 'sale' ? 'bought ' : 'minted ') + (t.when || '')) + (t.venue ? ' · ' + esc(t.venue) : '') : esc(t.how ? t.how + ' ' + (t.when || '') : 'before our ledger')) + '</td>' +
          '<td style="padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px">' + (t.paid != null ? esc((Math.round(t.paid * 100) / 100).toLocaleString('en-US') + ' ' + t.symbol) + ' <span style="color:#6b7280">' + usd(t.cost_usd) + '</span>' : '<span style="color:#6b7280">no price</span>') + '</td>' +
          '<td style="padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px">' + usd(t.mark) + '</td><td style="padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px;' + tone(d) + '">' + (d != null ? usd(d, true) : '') + '</td>' +
          '<td style="padding:4px 6px">' + (t.tx ? '<a href="https://chainsco.pe/terra2/tx/' + esc(t.tx) + '" target="_blank" rel="noopener" style="color:#67e8f9;font-size:11px">tx</a>' : '') + '</td></tr>';
      }).join('');
      return '<div data-pp-nft="' + esc(g.slug) + '" style="margin-bottom:14px">' +
        '<div style="font-size:14px;color:#e5e7eb;font-weight:600;margin-bottom:6px">' + esc(g.label) + ' <span style="font-size:12px;color:#6b7280;font-weight:400">' + g.held + ' held' + (g.by_state.staked ? ' · ' + g.by_state.staked + ' staked' : '') + ' · ' + esc(tierTxt) + '</span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">' +
          cell('Worth now (floor)', money(L ? g.value_luna : g.value_usd, lens)) +
          cell('Paid (' + (L ? g.priced_luna : g.priced) + ' of ' + g.held + ' priced)', money(L ? g.cost_luna : g.cost_usd, lens)) +
          cell('Unrealized on those', money(un, lens, true), tone(un)) +
          cell('Sold · ' + g.realized.trips + ' round trip' + (g.realized.trips === 1 ? '' : 's'), re != null ? money(re, lens, true) : '—', tone(re)) +
        '</div>' +
        (g.received ? '<div style="font-size:12px;color:#9ca3af;margin-top:6px">' + g.received + ' came in by transfer or before our ledger — no price to compare, valued at the floor only.</div>' : '') +
        (g.held ? '<details style="margin-top:6px"><summary style="cursor:pointer;font-size:12px;color:#67e8f9">every token (' + g.held + ')</summary><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:560px"><thead><tr><th style="text-align:left;font-size:11px;color:#6b7280;padding:4px 6px">Token</th><th style="text-align:left;font-size:11px;color:#6b7280;padding:4px 6px">How you got it</th><th style="text-align:right;font-size:11px;color:#6b7280;padding:4px 6px">Paid</th><th style="text-align:right;font-size:11px;color:#6b7280;padding:4px 6px">Floor now</th><th style="text-align:right;font-size:11px;color:#6b7280;padding:4px 6px">Δ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></details>' : '') +
        '</div>';
    }).join('') + '<div style="font-size:11px;color:#6b7280">Floor = the lower of the live listing floor and recent sales, per tier. "Sold" is each round trip at USD on both days; LUNA only when both ends were paid in LUNA.</div>';
    el.querySelectorAll('[data-pp-lens]').forEach(function (b) { b.onclick = function () { var l = b.getAttribute('data-pp-lens'); if (opts.onLens) opts.onLens(l); renderNfts(el, legs, Object.assign({}, opts, { lens: l })); }; });
  }

  // ── 2.0.0 the LOCKS leg (owner 2026-09-28: "how you've done should be all combined") ─────────────────────────────────────
  // From the wallet's own lock history (nft-collections/tla-locks/ledger/by-wallet → wallets[addr].events): every create / add is
  // money in (USD at that day's oracle price — the event carries it; LUNA = USD ÷ LUNA that day). Merges move a burned lock's cost
  // into the lock it joined, a migration carries it to the new id, a withdraw closes it (its USD out), a lock sent to another
  // wallet leaves with its cost (counted, flagged — its value is not ours to show). A lock that ARRIVED by transfer brought units
  // we have no cost for: valued, kept out of the P&L (the same rule as a DAO stake with no basis) by the share of its units we did
  // put in. Worth now = the lock amounts × live LST prices; LUNA now = the lock's underlying at today's hub rate.
  // o = { wallet, entry, locksNow: m.locks, priceOf(sym) → USD, lunaNow, lunaPx(day) → USD, now: 'YYYY-MM-DD' }
  function lockLeg(o) {
    var w = o.entry; if (!w || !Array.isArray(w.events)) return null; var me = o.wallet;
    var ev = w.events.slice().sort(function (a, b) { return String(a.ts).localeCompare(String(b.ts)); });
    var tok = {}, R = { in_usd: 0, in_luna: 0, out_usd: 0, out_luna: 0, n: 0 }, sent = { n: 0, usd: 0, ids: [] }, unpricedIn = 0, lunaOk = true;
    var T = function (id) { return tok[id] || (tok[id] = { id: id, usd: 0, luna: 0, units: 0, sym: null, first: null, received: false, migrated: false }); };
    var move = function (from, to) { if (from === to || !tok[from]) return; var a = tok[from], b = T(to); b.usd += a.usd; b.luna += a.luna; b.units += a.units; if (a.first && (!b.first || a.first < b.first)) b.first = a.first; b.received = b.received || a.received; b.migrated = b.migrated || a.migrated; b.sym = b.sym || a.sym; delete tok[from]; };
    ev.forEach(function (e) {
      var k = e.kind, id = String(e.token_id), day = String(e.ts || '').slice(0, 10);
      if (k === 'lock_create' || k === 'lock_add') {
        var x = T(id); if (e.usd == null) { unpricedIn++; return; } x.usd += e.usd; var px = o.lunaPx ? o.lunaPx(day) : null; if (px) x.luna += e.usd / px; else lunaOk = false;
        var pr = e.price || {}; var dec = e.denom_decimals != null ? e.denom_decimals : (pr.decimals != null ? pr.decimals : 6); if (pr.amount != null) x.units += Number(pr.amount) / Math.pow(10, dec);
        x.sym = x.sym || e.denom_symbol || null; if (k === 'lock_create' && (!x.first || e.ts < x.first)) x.first = e.ts; if (!x.first) x.first = e.ts;
      } else if (k === 'lock_merge' && e.lineage) { var to = (e.lineage.to_ids || [])[0]; (e.lineage.burned || []).forEach(function (b) { move(String(b), String(to)); }); }
      else if (k === 'lock_migrate' && e.lineage) { var f = String((e.lineage.from_ids || [])[0]), t2 = String((e.lineage.to_ids || [])[0]); move(f, t2); T(t2).migrated = true; }
      else if (k === 'lock_split' && e.lineage) { var par = tok[String((e.lineage.from_ids || [])[0])]; var ch = T(id); if (par && !ch.first) ch.first = par.first; ch.split = true; }   // cost stays with the parent (the split amount is not in the event)
      else if (k === 'lock_withdraw') { var y = tok[id]; if (y) { R.in_usd += y.usd; R.in_luna += y.luna; delete tok[id]; } if (e.usd != null) { R.out_usd += e.usd; var p2 = o.lunaPx ? o.lunaPx(day) : null; if (p2) R.out_luna += e.usd / p2; } R.n++; }
      else if (k === 'lock_transfer' && e.from === me && e.to !== me) { var z = tok[id]; if (z) { sent.n++; sent.usd += z.usd; sent.ids.push(id); delete tok[id]; } }
      else if ((k === 'lock_transfer' || k === 'venue_out') && e.to === me) { var r = T(id); if (k === 'lock_transfer' && !(r.usd > 0)) r.received = true; else if (k === 'lock_transfer') r.received = true; if (!r.since || e.ts > r.since) r.since = e.ts; }
    });
    var hold = {}; ((w.holdings_now && w.holdings_now.tokens) || []).forEach(function (h) { hold[String(h.token_id)] = h; });
    var nowById = {}; (o.locksNow || []).forEach(function (l) { nowById[String(l.token_id)] = l; });
    var held = [], gone = { n: 0, usd: 0 };
    Object.keys(tok).forEach(function (id) { if (!hold[id] && !nowById[id]) { gone.n++; gone.usd += tok[id].usd; } });
    var ids = {}; Object.keys(nowById).forEach(function (id) { ids[id] = 1; }); Object.keys(hold).forEach(function (id) { if (/^listed/.test(hold[id].state || '')) ids[id] = 1; });
    Object.keys(ids).forEach(function (id) {
      var l = nowById[id], h = hold[id] || {}, x = tok[id] || { id: id, usd: 0, luna: 0, units: 0, first: null, received: true };
      var sym = (l && l.asset_symbol) || x.sym, amt = l ? l.amount_human : x.units, px = o.priceOf ? o.priceOf(sym) : null;
      var usdNow = px != null && amt != null ? amt * px : null;
      var lunaNow = l && l.projection && l.projection.underlying_now_human != null ? l.projection.underlying_now_human : (usdNow != null && o.lunaNow ? usdNow / o.lunaNow : null);
      var share = x.usd > 0 ? (x.received && !x.migrated && amt > 0 ? Math.min(1, x.units / amt) : 1) : 0;
      var created = x.first ? String(x.first).slice(0, 10) : (h.acquired && h.acquired.ts ? String(h.acquired.ts).slice(0, 10) : null), since = h.since ? String(h.since).slice(0, 10) : created;
      held.push({ id: id, sym: sym, amount: amt, usd: usdNow, luna: lunaNow, cost_usd: x.usd, cost_luna: x.luna, share: share, received: !!x.received, listed: /^listed/.test(h.state || '') ? String(h.state).split(':')[1] || 'a marketplace' : null,
        created: created, since: since, age_days: created && o.now ? Math.round(daysBetween(created, o.now)) : null, vp: l ? l.voting_power_human : null, decay_pct: l && l.projection && l.projection.potential_vp_gain_pct != null ? l.projection.potential_vp_gain_pct / 100 : null,
        auto_max: l ? !!l.is_auto_max_locked : null });
    });
    held.sort(function (a, b) { return (b.usd || 0) - (a.usd || 0); });
    var S = function (f) { return held.reduce(function (s, x) { var v = f(x); return s + (v || 0); }, 0); };
    var costU = S(function (x) { return x.cost_usd; }), costL = S(function (x) { return x.cost_luna; });
    var nowU = S(function (x) { return x.usd != null ? x.usd * x.share : 0; }), nowL = S(function (x) { return x.luna != null ? x.luna * x.share : 0; });
    var untracked = S(function (x) { return x.usd != null ? x.usd * (1 - x.share) : 0; }), allNow = S(function (x) { return x.usd; }), allLuna = S(function (x) { return x.luna; });
    var pnlU = nowU - costU + (R.out_usd - R.in_usd), pnlL = lunaOk ? nowL - costL + (R.out_luna - R.in_luna) : null;
    var L = o.lunaNow || null;
    // the split: what LUNA's price did to the LUNA you locked, and what the LSTs grew it by (staking) — they add to the P&L exactly
    var market = lunaOk && L ? costL * L - costU : null, staking = lunaOk && L ? (nowL - costL) * L + (R.out_usd - R.in_usd) : null;
    var first = held.concat([]).map(function (x) { return x.created; }).concat(ev.filter(function (e) { return e.kind === 'lock_create'; }).map(function (e) { return String(e.ts).slice(0, 10); })).filter(Boolean).sort()[0] || null;
    return { held: held, totals: { in_usd: costU + R.in_usd, in_luna: lunaOk ? costL + R.in_luna : null, now_usd: nowU, now_luna: nowL, all_now_usd: allNow, all_now_luna: allLuna, untracked_usd: untracked, out_usd: R.out_usd, withdrawn: R.n,
      pnl_usd: pnlU, pnl_luna: pnlL, market_usd: market, staking_usd: staking, sent: sent, gone: gone, unpriced_in: unpricedIn }, first_day: first };
  }
  // Votion: every position's story summed (votion/holder-pnl → holders["<vault>|<wallet>"])
  function votionTotals(holders, wallet) {
    var hs = Object.keys(holders || {}).filter(function (k) { return k.split('|')[1] === wallet; }).map(function (k) { return holders[k]; }).filter(function (h) { return h && h.totals; });
    if (!hs.length) return null; var z = { cost_usd: 0, usd_now: 0, delta_usd: 0, luna_in: 0, luna_now: 0, legs: { luna_price: 0, lst_stake: 0, votion: 0 }, n: hs.length, first_day: null, untracked_usd: 0 };
    hs.forEach(function (h) { var t = h.totals; z.cost_usd += t.cost_usd || 0; z.usd_now += t.usd_now || 0; z.delta_usd += t.delta_usd || 0; z.luna_in += t.luna_in || 0; z.luna_now += t.luna_now || 0; z.legs.luna_price += t.legs.luna_price || 0; z.legs.lst_stake += t.legs.lst_stake || 0; z.legs.votion += t.legs.votion || 0; if (t.first_day && (!z.first_day || t.first_day < z.first_day)) z.first_day = t.first_day; z.untracked_usd += h.untracked_usd_now || 0; });
    z.delta_luna = z.luna_now - z.luna_in; return z;
  }

  // ── 2.0.0 HOW YOU'VE DONE — every source in one P&L, each one can be dropped out ─────────────────────────────────────
  // parts = { lp: D (reconciled v3), locks: lockLeg(), votion: votionTotals(), nfts: [nftLeg()], solid: null, credia: null }
  // Attribution across sources (USD; each source's own identity, added up): Prices = LP market + LUNA's move on locks + LUNA's move
  // on Votion · Yield = pool mechanics + LST staking on locks + Votion's LST + Votion compounding · Rewards = LP claims + bribes ·
  // Still open (LP) · NFTs. The rows add to the net exactly (the gate checks it).
  var SOURCES = [
    { id: 'lp', label: 'TLA LPs', color: '#d95926', tip: 'Every LP round trip + what is still open vs its cost + LP rewards claimed (the table below)' },
    { id: 'locks', label: 'Locks & bribes', color: '#3987e5', tip: 'What your vAMP locks cost (every create / add at that day’s price) vs worth now, plus every bribe your votes claimed' },
    { id: 'votion', label: 'Votion', color: '#d55181', tip: 'Every Votion vault position: USD in vs now (LUNA price + LST staking + Votion compounding)' },
    { id: 'nfts', label: 'NFTs', color: '#c98500', tip: 'NFTs you hold vs what you paid (floor marks) + what you made on the ones you sold' },
    { id: 'credia', label: 'Credia', color: '#008300', tip: 'Credia supply / borrow — the position is live on this page; its P&L history comes with the deep backfill' },
    { id: 'solid', label: 'Solid', color: '#199e70', tip: 'Solid collateral / debt — the Solid card and its P&L are the next build (SPEC-portfolio-solid)' }
  ];
  function sourceFigures(parts) {
    var out = {};
    var D = parts.lp; if (D && D.totals) { var T = D.totals, rw = T.rewards || {}; out.lp = { usd: T.realized.delta_usd + T.open.unrealized_usd + (rw.claims_usd || 0), luna: T.realized.delta_luna + T.open.unrealized_luna + (rw.claims_luna || 0),
      market: T.realized.market_usd, yield: T.realized.lp_usd, rewards: rw.claims_usd || 0, open: T.open.unrealized_usd, nft: 0, since: null };
      out.bribes = { usd: rw.bribes_usd || 0, luna: rw.bribes_luna || 0 }; }
    var K = parts.locks && parts.locks.totals; if (K || out.bribes) { var b = out.bribes || { usd: 0, luna: 0 };
      out.locks = { usd: (K ? K.pnl_usd : 0) + b.usd, luna: K && K.pnl_luna != null ? K.pnl_luna + b.luna : null, market: K ? K.market_usd : null, yield: K ? K.staking_usd : null, rewards: b.usd, open: 0, nft: 0, lock_usd: K ? K.pnl_usd : null, bribes_usd: b.usd, bribes_luna: b.luna, since: parts.locks ? parts.locks.first_day : null }; }
    var V = parts.votion; if (V) out.votion = { usd: V.delta_usd, luna: V.delta_luna, market: V.legs.luna_price, yield: V.legs.lst_stake + V.legs.votion, rewards: 0, open: 0, nft: 0, since: V.first_day };
    var N = (parts.nfts || []).filter(Boolean); if (N.length) { var nu = 0, nl = 0, nlOk = true; N.forEach(function (g) { nu += (g.unrealized_usd || 0) + (g.realized.usd || 0); if (g.unrealized_luna == null) nlOk = false; nl += (g.unrealized_luna || 0) + (g.realized.luna || 0); }); out.nfts = { usd: nu, luna: nlOk ? nl : null, market: 0, yield: 0, rewards: 0, open: 0, nft: nu, since: null }; }
    return out;
  }
  function renderDone(el, parts, opts) {
    opts = opts || {}; var lens = opts.lens === 'luna' ? 'luna' : 'usd', L = lens === 'luna'; var F = sourceFigures(parts); var off = opts.off || {};
    var avail = SOURCES.filter(function (s) { return F[s.id]; }), na = SOURCES.filter(function (s) { return !F[s.id]; });
    var on = avail.filter(function (s) { return !off[s.id]; });
    var tot = function (k) { return on.reduce(function (x, s) { var v = F[s.id][k]; return x + (v || 0); }, 0); };
    var net = tot(L ? 'luna' : 'usd'), netU = tot('usd'), netL = on.every(function (s) { return F[s.id].luna != null; }) ? tot('luna') : null;
    var lunaStart = opts.lunaFirst, lunaNow = opts.lunaNow, lunaMove = lunaStart && lunaNow ? lunaNow / lunaStart - 1 : null;
    var sent;
    if (netL != null && netU < 0 && netL > 0) sent = 'You are down ' + usd(Math.abs(netU)) + ' in dollars but up ' + luna(netL) + ' in LUNA terms' + (lunaMove != null ? ' — LUNA itself went from $' + lunaStart.toFixed(3) + ' to $' + lunaNow.toFixed(3) + ' (' + pct(lunaMove, true) + ') since ' + opts.firstDay : '') + ', so what you hold is worth far more LUNA than it cost: the dollar loss is LUNA\u2019s price, not what you did with it.';
    else if (netL != null && netU >= 0 && netL >= 0) sent = 'Up in dollars (' + usd(netU, true) + ') and in LUNA terms (' + luna(netL, true) + ')' + (lunaMove != null ? ', while LUNA moved ' + pct(lunaMove, true) + ' since ' + opts.firstDay : '') + '.';
    else if (netL != null) sent = usd(netU, true) + ' in dollars, ' + luna(netL, true) + ' in LUNA terms' + (lunaMove != null ? ' (LUNA ' + pct(lunaMove, true) + ' since ' + opts.firstDay + ')' : '') + '.';
    else sent = usd(netU, true) + ' in dollars across what is switched on.';
    var chips = '<div data-pp="sources" style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px">' + SOURCES.map(function (s) { var has = !!F[s.id], isOn = has && !off[s.id]; var v = has ? F[s.id][L ? 'luna' : 'usd'] : null;
      return '<button type="button" data-pp-src="' + s.id + '"' + (has ? '' : ' disabled') + ' title="' + esc(s.tip) + '" style="display:inline-flex;gap:6px;align-items:center;font-size:12px;padding:5px 10px;border-radius:999px;cursor:' + (has ? 'pointer' : 'default') + ';border:1px solid ' + (isOn ? s.color : 'rgba(255,255,255,.1)') + ';background:' + (isOn ? 'rgba(255,255,255,.05)' : 'transparent') + ';color:' + (has ? (isOn ? '#e5e7eb' : '#6b7280') : '#4b5563') + (has && !isOn ? ';text-decoration:line-through' : '') + '"><span style="width:8px;height:8px;border-radius:2px;background:' + (has ? s.color : '#374151') + '"></span>' + esc(s.label) + (has ? ' <b style="font-family:JetBrains Mono,monospace;font-weight:600;' + tone(v) + '">' + money(v, lens, true) + '</b>' : ' <span style="font-size:10.5px">· soon</span>') + '</button>'; }).join('') + '</div>';
    // the drivers, across every source that is on (USD) — they add to the net
    var rowsD = [['Prices', tot('market'), 'What prices did to what you put in: LP tokens on closed trips, LUNA under your locks, LUNA under Votion'], ['Yield', tot('yield'), 'What the positions themselves made: pool fees & compounding net of IL and the take rate, LST staking growth in your locks, Votion’s staking + compounding'],
      ['Rewards', tot('rewards'), 'LP rewards claimed + every bribe your votes claimed, at claim-day value'], ['Still open (LPs)', tot('open'), 'Open LP positions vs what they cost'], ['NFTs', tot('nft'), 'NFTs held vs paid (floor) + NFT round trips']].filter(function (r) { return Math.abs(r[1] || 0) >= 0.005; });
    var mx = Math.max.apply(null, rowsD.map(function (r) { return Math.abs(r[1] || 0); }).concat([1]));
    var per = on.map(function (s) { var v = F[s.id][L ? 'luna' : 'usd']; return [s.label + (s.id === 'locks' && F.locks.bribes_usd ? '' : ''), v, s.tip, s.color, s.id]; });
    var mxS = Math.max.apply(null, per.map(function (r) { return Math.abs(r[1] || 0); }).concat([1]));
    var barRow = function (r, m, dp) { return '<div ' + (dp ? 'data-pp="' + dp + '"' : '') + ' style="display:grid;grid-template-columns:minmax(120px,170px) 1fr minmax(96px,auto);gap:10px;align-items:center;margin:5px 0"><div style="font-size:13px;color:#d1d5db" title="' + esc(r[2]) + '">' + (r[3] ? '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + r[3] + ';margin-right:6px"></span>' : '') + esc(r[0]) + '</div><div style="height:11px;background:rgba(255,255,255,.04);border-radius:6px;position:relative;overflow:hidden"><div style="position:absolute;top:0;bottom:0;' + ((r[1] || 0) < 0 ? 'right:50%' : 'left:50%') + ';width:' + Math.max(1, Math.abs(r[1] || 0) / m * 50).toFixed(1) + '%;background:' + ((r[1] || 0) < 0 ? '#f87171' : '#34d399') + ';border-radius:6px"></div><div style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:rgba(255,255,255,.18)"></div></div><div style="font-family:JetBrains Mono,monospace;font-size:14px;font-weight:700;text-align:right;' + tone(r[1]) + '">' + (r[1] == null ? '—' : money(r[1], lens, true)) + '</div></div>'; };
    var K = parts.locks && parts.locks.totals, lockNote = [];
    if (K && !off.locks) { if (K.untracked_usd > 0.5) lockNote.push(usd(K.untracked_usd) + ' of your locks arrived by transfer with no cost in your history — counted in value, kept out of the P&L'); if (K.sent.n) lockNote.push(K.sent.n + ' lock' + (K.sent.n === 1 ? '' : 's') + ' you sent to another address (cost ' + usd(K.sent.usd) + ') left out — their value is not in this wallet (a lock deposited into a Votion vault is counted under Votion)'); if (K.gone.n) lockNote.push(K.gone.n + ' lock' + (K.gone.n === 1 ? '' : 's') + ' no longer held (sold on a marketplace or burned) left out, cost ' + usd(K.gone.usd)); }
    var D = parts.lp, RC = D && D.reconciled, flags = [];
    var custInfo = RC && RC.custody && !off.lp ? 'LP open now includes ' + usd(RC.custody_usd) + ' staked in ' + RC.where.join(', ') + ' (still yours, still earning)' + (RC.untracked_usd > 0.5 ? '; ' + usd(RC.untracked_usd) + ' of it has no cost basis in our history, so it is valued but kept out of the P&L' : '') : '';
    if (D && !off.lp) { var S0 = story(D, 'usd'); if (S0.disputed) flags.push(S0.disputed + ' LP position' + (S0.disputed === 1 ? '' : 's') + ' left out (our value disagrees with the chain read)'); if (S0.blank) flags.push(S0.blank + ' LP trip' + (S0.blank === 1 ? '' : 's') + ' with no price that day'); if (RC && RC.moved) flags.push(RC.moved + ' LP position' + (RC.moved === 1 ? '' : 's') + ' sent to another address — ' + usd(RC.moved_usd) + ' left out'); }
    el.innerHTML =
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Net, everything switched on</div>' +
        '<div data-pp="net-all" style="font-family:JetBrains Mono,monospace;font-size:36px;font-weight:800;' + tone(net) + '">' + money(net, lens, true) + '</div>' +
        '<div style="font-size:12px;color:#6b7280">' + (L ? usd(netU, true) : (netL != null ? luna(netL, true) : '—')) + ' in the other lens' + (D && D.totals ? ' · LPs valued at epoch ' + esc(D.totals.as_of_epoch) + ' · locks, Votion and NFTs at today’s prices' : '') + '</div></div>' +
        lensButtons(lens) + '</div>' +
      '<p data-pp="sentence" style="font-size:14px;color:#d1d5db;margin:12px 0 2px;line-height:1.5">' + esc(sent) + '</p>' + chips +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:4px 28px;margin-top:6px">' +
        '<div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 2px">By source</div>' + per.map(function (r) { return barRow(r, mxS, 'src-' + r[4]); }).join('') + '</div>' +
        (L ? '' : '<div><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:6px 0 2px">What drove it</div>' + rowsD.map(function (r) { return barRow(r, mx, 'drv-' + r[0].split(' ')[0].toLowerCase()); }).join('') + '</div>') +
      '</div>' +
      (K && !off.locks ? '<div data-pp="locks-line" style="font-size:12px;color:#9ca3af;margin-top:8px">Locks: ' + usd(K.in_usd) + ' went in' + (K.in_luna != null ? ' (' + luna(K.in_luna) + ' at the time)' : '') + ' · worth ' + usd(K.now_usd) + ' now (' + luna(K.now_luna) + ')' + (K.market_usd != null ? ' — LUNA’s price ' + usd(K.market_usd, true) + ', LST staking ' + usd(K.staking_usd, true) : '') + ' · bribes ' + usd(F.locks.bribes_usd, true) + '.</div>' : '') +
      (custInfo ? '<div data-pp="custody" style="font-size:11.5px;color:#67e8f9;margin-top:6px">ⓘ ' + esc(custInfo) + '</div>' : '') +
      (lockNote.length ? '<div data-pp="locks-note" style="font-size:11.5px;color:#67e8f9;margin-top:6px">ⓘ ' + esc(lockNote.join(' · ')) + '</div>' : '') +
      (flags.length ? '<div data-pp="flags" style="font-size:11.5px;color:#fbbf24;margin-top:6px">⚠ ' + esc(flags.join(' · ')) + '</div>' : '') +
      (na.length ? '<div style="font-size:11px;color:#6b7280;margin-top:6px">Not in yet: ' + na.map(function (s) { return s.label; }).join(', ') + ' — no P&L history for them yet (tap a chip for why).</div>' : '');
    el.querySelectorAll('[data-pp-src]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-pp-src'); if (!F[id]) return; off[id] = !off[id]; if (opts.onOff) opts.onOff(off); renderDone(el, parts, Object.assign({}, opts, { off: off })); }; });
    el.querySelectorAll('[data-pp-lens]').forEach(function (b) { b.onclick = function () { var l = b.getAttribute('data-pp-lens'); if (opts.onLens) opts.onLens(l); renderDone(el, parts, Object.assign({}, opts, { lens: l, off: off })); }; });
    return { net_usd: netU, net_luna: netL, sources: F };
  }

  // ── 1.4.0 illiquid holdings (owner: "no way you could sell that much and not destroy the price — warn, and keep it out of the totals")
  // What a holding fetches sold into a pool of total depth D (both sides, USD) — constant product: the other side is D/2, and selling
  // H (at spot USD) returns (D/2)·H / (D/2 + H) before fees. impact = 1 − fetched/H. Concentrated pools differ; this is the estimate.
  function sellable(holdingUsd, depthUsd) {
    if (!(holdingUsd > 0) || !(depthUsd > 0)) return null;
    var half = depthUsd / 2, got = half * holdingUsd / (half + holdingUsd);
    return { spot_usd: holdingUsd, fetch_usd: got, impact: 1 - got / holdingUsd, depth_usd: depthUsd, illiquid: (1 - got / holdingUsd) > 0.10 };
  }

  // ---- Votion: one position's story (org-votion 1.5.0 votion/holder-pnl/current.json → holders["<vault>|<wallet>"]) ----
  function pct(v, sign) { if (v == null || !isFinite(v)) return '—'; var s = (Math.abs(v) * 100).toFixed(1) + '%'; return (v < 0 ? '−' : (sign && v > 0 ? '+' : '')) + s; }
  function qty(v) { if (v == null || !isFinite(v)) return '—'; var a = Math.abs(v); return a >= 1e4 ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 }); }
  function day(d) { if (!d) return ''; var t = new Date(d + 'T00:00:00Z'); return isNaN(t) ? d : t.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function votionStory(h, opts) {
    opts = opts || {}; if (!h) return '';
    var t = h.totals, sym = esc(h.lst_symbol || 'LST');
    var notes = [];
    if (h.untracked_vtokens > 0) notes.push(qty(h.untracked_vtokens) + ' vTokens have no archived deposit (moved in, or deposited before the archive) — valued now at ' + usd(h.untracked_usd_now) + ', left out of the P&L');
    if (h.unexplained_outflow_vtokens > 0) notes.push(qty(h.unexplained_outflow_vtokens) + ' vTokens left this wallet without a withdrawal (sent to another wallet) — taken from the oldest deposits');
    if (h.lots_blank > 0) notes.push(h.lots_blank + ' deposit' + (h.lots_blank === 1 ? '' : 's') + ' had no price that day — left blank, not guessed');
    var foot = notes.length ? '<div style="font-size:10px;color:#6b7280;margin-top:6px">' + notes.map(esc).join(' · ') + '</div>' : '';
    if (!t) return '<div style="font-size:11px;color:#6b7280;margin-top:6px">No archived deposit explains this position yet, so there is no entry cost to compare against.</div>' + foot;
    var L = t.legs, max = Math.max(Math.abs(L.luna_price), Math.abs(L.lst_stake), Math.abs(L.votion), 1e-9);
    var leg = function (label, v, hint) { var w = Math.max(2, Math.round(Math.abs(v) / max * 100)); return '<div style="display:grid;grid-template-columns:minmax(120px,1.2fr) 2fr auto;gap:8px;align-items:center;font-size:11px;margin-top:3px"><span style="color:#9ca3af">' + label + '</span><span style="height:6px;border-radius:3px;background:rgba(255,255,255,.05);position:relative;overflow:hidden"><span style="position:absolute;left:0;top:0;bottom:0;width:' + w + '%;background:' + (v < 0 ? 'rgba(248,113,113,.7)' : 'rgba(52,211,153,.7)') + '"></span></span><span style="font-family:ui-monospace,monospace;' + tone(v) + '" title="' + esc(hint) + '">' + usd(v, true) + '</span></div>'; };
    var adv = h.advertised && h.advertised.apr != null ? h.advertised.apr : null;
    var lunaGrowth = t.luna_in > 0 ? t.luna_now / t.luna_in - 1 : null;
    var why = t.delta_usd < 0 && t.legs.luna_price < 0 && (t.legs.lst_stake + t.legs.votion) > 0
      ? 'Down ' + pct(Math.abs(t.delta_pct)) + ' in USD while LUNA fell ' + pct(Math.abs(t.luna_price_pct)) + ' over the same time — the position itself grew your LUNA ' + pct(lunaGrowth, true) + '.'
      : (t.delta_usd >= 0 ? 'Up ' + pct(t.delta_pct, true) + ' in USD; LUNA moved ' + pct(t.luna_price_pct, true) + ' over the same time.' : 'Down ' + pct(Math.abs(t.delta_pct)) + ' in USD; LUNA moved ' + pct(t.luna_price_pct, true) + ' over the same time.');
    return '<div data-votion-story="' + esc(h.vault) + '" style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(168,85,247,.05);border:1px solid rgba(168,85,247,.15)">'
      + '<div style="font-size:11px;color:#d1d5db">' + esc(why) + '</div>'
      + '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:10.5px;margin-top:6px;font-family:ui-monospace,monospace">'
      + '<span style="color:#6b7280">In</span><span style="color:#d1d5db">' + usd(t.cost_usd) + ' · ' + qty(t.lst_in) + ' ' + sym + ' = ' + qty(t.luna_in) + ' LUNA · since ' + day(t.first_day) + '</span>'
      + '<span style="color:#6b7280">Now</span><span style="color:#d1d5db">' + usd(t.usd_now) + ' · ' + qty(t.lst_now) + ' ' + sym + ' = ' + qty(t.luna_now) + ' LUNA</span>'
      + '<span style="color:#6b7280">Δ</span><span style="' + tone(t.delta_usd) + '">' + usd(t.delta_usd, true) + ' (' + pct(t.delta_pct, true) + ')</span></div>'
      + leg('LUNA price (' + pct(t.luna_price_pct, true) + ')', L.luna_price, 'What LUNA\u2019s own USD price did to the LUNA you put in — nothing the position controls')
      + leg(sym + ' staking (' + pct(t.apr_lst) + ' APR)', L.lst_stake, 'The LST earned staking: more LUNA per ' + (h.lst_symbol || 'LST') + ' than on the day you went in')
      + leg('Votion compounding (' + pct(t.apr_votion) + ' APR)', L.votion, 'Bribes + rebase the vault compounded: more ' + (h.lst_symbol || 'LST') + ' per vToken than on the day you went in')
      + '<div style="font-size:10px;color:#9ca3af;margin-top:6px">Votion real APR <b style="color:#e9d5ff">' + pct(t.apr_votion) + '</b>' + (adv != null ? ' vs advertised <b style="color:#e9d5ff">' + pct(adv) + '</b> (' + (h.advertised.window_days || 30) + '-day)' : '') + ' · the three legs add up to the Δ exactly</div>'
      + foot + '</div>';
  }
  return { VERSION: VERSION, SOURCES: SOURCES, lockLeg: lockLeg, votionTotals: votionTotals, sourceFigures: sourceFigures, renderDone: renderDone, posStats2: posStats2, scorecard: scorecard, MIN_APR_DAYS: MIN_APR_DAYS, reconcile: reconcile, sellable: sellable, posStats: posStats, votionStory: votionStory, decode: decode, story: story, sentence: sentence, renderStory: renderStory, renderCurve: renderCurve, renderPositions: renderPositions, nftMark: nftMark, nftLeg: nftLeg, renderNfts: renderNfts, fmt: { usd: usd, luna: luna } };
});
