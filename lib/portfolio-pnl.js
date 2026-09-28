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
  var VERSION = '1.2.0';   // 1.2.0 (2026-09-28): votionStory() — one Votion position told as USD in → now, split into LUNA price / LST staking / Votion compounding (votion/holder-pnl, org-votion 1.5.0), LUNA in → now, real vs advertised APR · 1.1.0 (2026-09-27): the NFT leg — nftLeg() + renderNfts(): cost from each token's own acquisition (nft-flows by-wallet), mark at the conservative floor per tier, realized round trips as the ledger replayed them
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
  function lensButtons(lens, onName) { return '<span style="display:inline-flex;gap:4px"><button type="button" data-pp-lens="usd" style="' + (lens === 'usd' ? BTN_ON : BTN) + '">USD</button><button type="button" data-pp-lens="luna" style="' + (lens === 'luna' ? BTN_ON : BTN) + '">LUNA</button></span>'; }
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
  function renderPositions(el, D, opts) {
    opts = opts || {}; var lens = opts.lens || 'usd'; var nameOf = opts.nameOf || function (k) { return k; }; var pill = opts.pill || function () { return ''; };
    var rows = D.positions.filter(function (p) { return p.deposits || p.withdraws; }).sort(function (a, b) { return (b.open_value_usd || 0) - (a.open_value_usd || 0) || (b.realized.trips - a.realized.trips); });
    var L = lens === 'luna';
    var head = ['Pool', 'Open now', 'Cost', 'Unrealized', 'Closed trips Δ', 'Rewards', 'Trips'];
    var body = rows.map(function (p, i) {
      var open = L ? p.open_value_luna : p.open_value_usd, cost = L ? p.open_cost_luna : p.open_cost_usd, un = open != null && cost != null ? open - cost : null;
      var rd = L ? p.realized.delta_luna : p.realized.delta_usd, cl = L ? p.claims.luna : p.claims.usd;
      var flag = p.disputed ? '<span title="' + esc('left out of your totals — ours ' + usd(p.disputed.ours_usd) + ' vs ' + (p.disputed.participants_usd != null ? 'the hourly chain read ' + usd(p.disputed.participants_usd) : 'the whole gauge ' + usd(p.disputed.gauge_total_usd))) + '" style="margin-left:6px;font-size:11px;color:#fbbf24">⚠ disputed</span>' : '';
      return '<tr data-pp-row="' + i + '" style="cursor:pointer;border-top:1px solid rgba(255,255,255,.05)' + (p.disputed ? ';opacity:.6' : '') + '">' +
        '<td style="padding:8px 6px;font-size:13px;color:#e5e7eb">' + esc(p.name && !/^(cw20|native):/.test(p.name) ? p.name : nameOf(p.pool)) + ' <span style="font-size:11px;color:' + (p.mechanism === 'amplified' ? '#fb923c' : '#9ca3af') + '">' + (p.mechanism === 'amplified' ? 'amp' : 'non-amp') + '</span>' + pill(p.pool) + flag + '</td>' +
        '<td style="padding:8px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:13px">' + (p.units_open > 0 ? money(open, lens) : '<span style="color:#4b5563">closed</span>') + '</td>' +
        '<td style="padding:8px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:13px;color:#9ca3af">' + (p.units_open > 0 ? money(cost, lens) : '') + '</td>' +
        '<td style="padding:8px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:13px;' + tone(un) + '">' + (p.units_open > 0 ? money(un, lens, true) : '') + '</td>' +
        '<td style="padding:8px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:13px;' + tone(p.realized.valued ? rd : null) + '">' + (p.realized.valued ? money(rd, lens, true) : '—') + '</td>' +
        '<td style="padding:8px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:13px;color:#6ee7b7">' + (cl ? money(cl, lens, true) : '') + '</td>' +
        '<td style="padding:8px 6px;text-align:right;font-size:13px;color:#9ca3af">' + p.realized.trips + '</td></tr>' +
        '<tr data-pp-trips="' + i + '" hidden><td colspan="7" style="padding:0 6px 10px 18px">' + tripsTable(p, lens) + '</td></tr>';
    }).join('');
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap"><div style="font-size:12px;color:#9ca3af">' + rows.length + ' positions · tap one for its round trips</div>' + lensButtons(lens) + '</div>' +
      '<div style="overflow-x:auto"><table data-pp="positions" style="width:100%;border-collapse:collapse;min-width:640px"><thead><tr>' + head.map(function (h, i) { return '<th style="text-align:' + (i ? 'right' : 'left') + ';font-size:11px;color:#6b7280;font-weight:600;padding:6px">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
    el.querySelectorAll('[data-pp-row]').forEach(function (tr) { tr.onclick = function () { var t = el.querySelector('[data-pp-trips="' + tr.getAttribute('data-pp-row') + '"]'); if (t) t.hidden = !t.hidden; }; });
    el.querySelectorAll('[data-pp-lens]').forEach(function (b) { b.onclick = function () { var l = b.getAttribute('data-pp-lens'); if (opts.onLens) opts.onLens(l); renderPositions(el, D, Object.assign({}, opts, { lens: l })); }; });
  }
  function tripsTable(p, lens) {
    if (!p.trips.length) return '<div style="font-size:12px;color:#6b7280;padding:6px 0">No closed trips — every deposit here is still open.</div>';
    var L = lens === 'luna';
    var r = p.trips.slice().reverse().slice(0, 50).map(function (t) {
      var inV = L ? t.in_luna : t.in_usd, outV = L ? t.out_luna : t.out_usd, d = L ? t.delta_luna : t.delta_usd;
      var note = t.flag ? '<span style="color:#fbbf24">' + esc(t.flag) + '</span>' : (!L && t.market_usd != null ? 'prices ' + usd(t.market_usd, true) + ' · pool ' + usd(t.lp_usd, true) : '');
      return '<tr><td style="padding:4px 6px;font-size:12px;color:#9ca3af;white-space:nowrap">' + esc(t.opened || '?') + ' → ' + esc(t.day) + '</td><td style="padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px">' + money(inV, lens) + '</td><td style="padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px">' + money(outV, lens) + '</td><td style="padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px;' + tone(d) + '">' + money(d, lens, true) + '</td><td style="padding:4px 6px;font-size:11px;color:#6b7280">' + note + (t.tx ? ' <a href="https://chainsco.pe/terra2/tx/' + esc(t.tx) + '" target="_blank" rel="noopener" style="color:#67e8f9">tx</a>' : '') + '</td></tr>';
    }).join('');
    return '<table style="width:100%;border-collapse:collapse;margin-top:4px"><thead><tr><th style="text-align:left;font-size:11px;color:#6b7280;padding:4px 6px">Opened → closed</th><th style="text-align:right;font-size:11px;color:#6b7280;padding:4px 6px">In</th><th style="text-align:right;font-size:11px;color:#6b7280;padding:4px 6px">Out</th><th style="text-align:right;font-size:11px;color:#6b7280;padding:4px 6px">Δ</th><th></th></tr></thead><tbody>' + r + '</tbody></table>' + (p.trips.length > 50 ? '<div style="font-size:11px;color:#6b7280">newest 50 of ' + p.trips.length + '</div>' : '');
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
  return { VERSION: VERSION, votionStory: votionStory, decode: decode, story: story, sentence: sentence, renderStory: renderStory, renderCurve: renderCurve, renderPositions: renderPositions, nftMark: nftMark, nftLeg: nftLeg, renderNfts: renderNfts, fmt: { usd: usd, luna: luna } };
});
