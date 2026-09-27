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
  var VERSION = '1.0.0';
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

  return { VERSION: VERSION, decode: decode, story: story, sentence: sentence, renderStory: renderStory, renderCurve: renderCurve, renderPositions: renderPositions, fmt: { usd: usd, luna: luna } };
});
