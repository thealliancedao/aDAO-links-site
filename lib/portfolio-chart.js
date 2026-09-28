/* =============================================================================
 * lib/portfolio-chart.js 1.0.0 (2026-09-28) — THE member portfolio chart: one chart, the member picks what it shows.
 * (owner 2026-09-28: "portfolio trackers have a lot of functionality in their charts — time frames, trends for NFTs, TLA, Credia,
 * Votion, Solid … make a central chart that can be changed to what the user wants to trend")
 * -----------------------------------------------------------------------------
 * Data (the page hands it in; this lib fetches nothing):
 *   rows   — member-data/history/series/<c>.json → this wallet's daily rows (cols decoded to objects): d, p, lk, lkL, fx, lp, cu,
 *            cuS, wb, vt, vtv, cs, cb, vp, pvp, pr, px, nl, src. One per archived day; missing days are gaps, never drawn over.
 *   now    — today's live figures (same keys) — the last point, labelled "now".
 *   deep   — the P&L build's weekly LP value curve [{d, usd, luna, missing}] (every epoch since the wallet's first deposit).
 *   luna   — price-history/series/LUNA.json daily {date: usd} — the LUNA lens and the price strip under the chart.
 *   activity — per epoch [{d, dep, wdr, clm}] from the flow ledger — deposit / withdraw markers on the LP view.
 * Views: net (stacked by category) · tla · locks · lp · votion · credia · vp. Ranges 7D / 30D / 90D / 1Y / All. Lens USD / LUNA.
 * One axis per chart (never two scales): the LUNA price is its own strip below, on the same dates.
 * Pure parts (seriesFor, buildOption) are exported for the page gate; mount() draws with ECharts (window.echarts — the page loads it from jsdelivr / unpkg / cdnjs in turn).
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PortfolioChart = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.1.0';   // 1.1.0 (2026-09-28): waits for the page's ECharts loader ('Loading the chart…'); Solid — its net (collateral − SOLID debt) in the net-worth stack (slot 7, violet), and a Lending view (Credia + Solid)
  // categorical slots — the validated dark order (dataviz reference: blue, orange, aqua, yellow, magenta, green; CVD ΔE ≥ 8.4 adjacent)
  var CAT = { lk: '#3987e5', lp: '#d95926', cu: '#199e70', wb: '#c98500', vt: '#d55181', cr: '#008300', so: '#9085e9' };   // 7 slots validated adjacent on the dark surface (worst CVD ΔE 8.4)
  var LABEL = { lk: 'TLA locks', lp: 'LPs in TLA', cu: 'Staked in a DAO', wb: 'TLA tokens in wallet', vt: 'Votion', cr: 'Credia (net)', so: 'Solid (net)' };
  var VIEWS = [
    { id: 'net', label: 'Net worth', tip: 'Everything with daily history, stacked by what it is — locks, LPs, receipts staked in a DAO, TLA tokens in the wallet, Votion, Credia' },
    { id: 'tla', label: 'TLA total', tip: 'Locks + LPs + staked in a DAO + TLA tokens in the wallet, as each day’s capture valued it' },
    { id: 'locks', label: 'Locks', tip: 'vAMP locks — in USD, or in LUNA (at that day’s hub rates)' },
    { id: 'lp', label: 'LPs', tip: 'LP positions (+ receipts staked in a DAO). "All" reaches back to your first deposit with the weekly P&L curve' },
    { id: 'votion', label: 'Votion', tip: 'Votion vault positions (the org archive, since 2026-07-16)' },
    { id: 'credia', label: 'Lending', tip: 'Credia supplied / borrowed (captured since 2026-09-27) and Solid collateral / SOLID debt (captured from member-data 1.6.0)' },
    { id: 'vp', label: 'Voting power', tip: 'VP now and VP if every lock were re-touched — the gap is decay waiting to be reclaimed' }
  ];
  var RANGES = [[7, '7D'], [30, '30D'], [90, '90D'], [365, '1Y'], [0, 'All']];
  var DAY = 864e5;
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function t(d) { return Date.parse(d + 'T00:00:00Z'); }
  function fmtUsd(v) { if (v == null) return '—'; var a = Math.abs(v); return (v < 0 ? '−' : '') + '$' + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(2)); }
  function fmtNum(v) { if (v == null) return '—'; var a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(a < 10 ? 2 : 0); }
  function fmtLuna(v) { return v == null ? '—' : fmtNum(v) + ' LUNA'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // rows cols → objects (the series file stores arrays)
  function decodeRows(cols, arr) { return (arr || []).map(function (r) { var o = {}; cols.forEach(function (c, i) { o[c] = r[i]; }); return o; }); }
  function lunaAt(data, d, row) { var p = row && num(row.px); if (p) return p; var m = data.luna || {}; for (var i = 0; i <= 3; i++) { var k = new Date(t(d) - i * DAY).toISOString().slice(0, 10); if (num(m[k])) return m[k]; } return null; }

  // ── the points a view draws (pure) → { kind: 'stack'|'lines', unit: 'usd'|'luna'|'vp', series: [{key, name, color, pts:[[ms, v]]}], markers, notes, first }
  function seriesFor(data, st) {
    var view = st.view || 'net', lens = st.lens === 'luna' ? 'luna' : 'usd', range = st.range == null ? 30 : st.range;
    var rows = (data.rows || []).slice(); if (data.now && data.now.d && !rows.some(function (r) { return r.d === data.now.d; })) rows.push(Object.assign({ now: true }, data.now));
    var last = rows.length ? rows[rows.length - 1].d : new Date().toISOString().slice(0, 10);
    var from = range ? t(last) - (range - 1) * DAY : -Infinity;
    rows = rows.filter(function (r) { return t(r.d) >= from; });
    var conv = function (v, r) { if (v == null) return null; if (lens === 'usd') return v; var p = lunaAt(data, r.d, r); return p ? v / p : null; };
    var mk = function (key, name, color, f) { return { key: key, name: name, color: color, pts: rows.map(function (r) { var v = f(r); return [t(r.d), v == null ? null : v]; }) }; };
    var notes = [], out = { kind: 'lines', unit: lens, series: [], markers: [], notes: notes, first: rows.length ? rows[0].d : null };
    if (view === 'net') {
      out.kind = 'stack';
      out.series = [mk('lk', LABEL.lk, CAT.lk, function (r) { return conv(num(r.lk), r); }), mk('lp', LABEL.lp, CAT.lp, function (r) { return conv(num(r.lp), r); }), mk('cu', LABEL.cu, CAT.cu, function (r) { return conv(num(r.cu), r); }),
        mk('wb', LABEL.wb, CAT.wb, function (r) { return conv(num(r.wb), r); }), mk('vt', LABEL.vt, CAT.vt, function (r) { return conv(num(r.vt), r); }),
        mk('cr', LABEL.cr, CAT.cr, function (r) { return r.cs == null && r.cb == null ? null : conv((num(r.cs) || 0) - (num(r.cb) || 0), r); }),
        mk('so', LABEL.so, CAT.so, function (r) { return r.ss == null && r.sb == null ? null : conv((num(r.ss) || 0) - (num(r.sb) || 0), r); })]
        .filter(function (s) { return s.pts.some(function (p) { return p[1]; }); });
      if (rows.some(function (r) { return r.cuS === 2; })) notes.push('Staked-in-a-DAO for 08-17 → 08-23 is carried across a gap in the CAPA supply history (held on both sides).');
      notes.push('Not in the daily history yet: liquid tokens outside TLA, LUNA staking, other chains, NFTs — they are in "now" on the banner and start charting with the deep backfill.');
    } else if (view === 'tla') out.series = [mk('p', 'TLA total', CAT.lk, function (r) { return conv(num(r.p), r); })];
    else if (view === 'locks') out.series = lens === 'luna'
      ? [mk('lkL', 'Locked, LUNA at that day’s hub rates', CAT.lk, function (r) { return num(r.lkL); }), mk('fx', 'LUNA stamped at lock (VP = 10× at max)', CAT.wb, function (r) { return num(r.fx); })]
      : [mk('lk', LABEL.lk, CAT.lk, function (r) { return num(r.lk); })];
    else if (view === 'lp') {
      var lpS = mk('lp', 'LPs + staked in a DAO', CAT.lp, function (r) { return r.lp == null && r.cu == null ? null : conv((num(r.lp) || 0) + (num(r.cu) || 0), r); });
      // the weekly P&L curve reaches back before the daily history (LPs only — the DAO stake has no weekly history)
      if (data.deep && data.deep.length && (!range || range >= 90)) {
        var d0 = rows.length ? t(rows[0].d) : Infinity;
        var older = data.deep.filter(function (c) { return c.d && t(c.d) < d0 && t(c.d) >= from; }).map(function (c) { return [t(c.d), lens === 'luna' ? num(c.luna) : num(c.usd)]; });
        if (older.length) { lpS.pts = older.concat(lpS.pts); out.first = data.deep.filter(function (c) { return c.d && t(c.d) >= from; })[0].d; notes.push('Before ' + (rows[0] ? rows[0].d : 'the daily history') + ': one point a week from the P&L build (LP positions only, valued at each epoch).'); }
      }
      out.series = [lpS];
      out.markers = (data.activity || []).filter(function (a) { return t(a.d) >= from && (a.dep || a.wdr); }).map(function (a) {
        // pin each marker on the line at its date (the nearest point at or before it)
        var y = null; for (var i = 0; i < lpS.pts.length; i++) { if (lpS.pts[i][0] <= t(a.d) && lpS.pts[i][1] != null) y = lpS.pts[i][1]; }
        return { ms: t(a.d), y: y, dep: a.dep || 0, wdr: a.wdr || 0, clm: a.clm || 0, d: a.d }; }).filter(function (m) { return m.y != null; });
    }
    else if (view === 'votion') out.series = [mk('vt', 'Votion', CAT.vt, function (r) { return conv(num(r.vt), r); })];
    else if (view === 'credia') out.series = [mk('cs', 'Credia supplied', CAT.cu, function (r) { return conv(num(r.cs), r); }), mk('cb', 'Credia borrowed', CAT.lp, function (r) { return conv(num(r.cb), r); }),
      mk('ss', 'Solid collateral', CAT.so, function (r) { return conv(num(r.ss), r); }), mk('sb', 'SOLID owed', CAT.wb, function (r) { return conv(num(r.sb), r); })];
    else if (view === 'vp') { out.unit = 'vp'; out.series = [mk('vp', 'Voting power', CAT.lk, function (r) { return num(r.vp); }), mk('pvp', 'VP if every lock were re-touched', CAT.wb, function (r) { return num(r.pvp); })]; }
    out.series = out.series.filter(function (s) { return s.pts.some(function (p) { return p[1] != null && (view !== 'credia' || p[1] !== 0); }); });   // a Credia of all zeros is no Credia
    // the LUNA price strip: the price series itself over the drawn span (daily; thinned to ≤ 600 points), today's live price last
    var ms0 = Infinity, ms1 = -Infinity; out.series.forEach(function (s) { s.pts.forEach(function (p) { if (p[1] != null) { ms0 = Math.min(ms0, p[0]); ms1 = Math.max(ms1, p[0]); } }); });
    var keys = Object.keys(data.luna || {}).filter(function (k) { return t(k) >= ms0 && t(k) <= ms1; }).sort(); var step = Math.max(1, Math.ceil(keys.length / 600));
    out.lunaStrip = keys.filter(function (k, i) { return i % step === 0 || i === keys.length - 1; }).map(function (k) { return [t(k), data.luna[k]]; });
    var nowR = rows[rows.length - 1]; if (nowR && nowR.now && num(nowR.px) && t(nowR.d) <= ms1 && !(data.luna || {})[nowR.d]) out.lunaStrip.push([t(nowR.d), nowR.px]);
    return out;
  }

  function fmtFor(unit) { return unit === 'luna' ? fmtLuna : unit === 'vp' ? function (v) { return fmtNum(v) + ' VP'; } : fmtUsd; }
  // ── the ECharts option (pure) ────────────────────────────────────────────────────────────────────────────────────
  function buildOption(S, st) {
    var f = fmtFor(S.unit), ink = '#9ca3af', grid = 'rgba(255,255,255,.06)';
    var series = S.series.map(function (s) {
      return { name: s.name, type: 'line', data: s.pts, showSymbol: false, symbolSize: 6, connectNulls: false, lineStyle: { width: 2, color: s.color }, itemStyle: { color: s.color },
        stack: S.kind === 'stack' ? 'net' : undefined, areaStyle: S.kind === 'stack' ? { color: s.color, opacity: 0.55 } : (S.series.length === 1 ? { color: s.color, opacity: 0.08 } : undefined),
        emphasis: { focus: 'series' }, xAxisIndex: 0, yAxisIndex: 0 };
    });
    if (S.markers && S.markers.length) series.push({ name: 'Deposits / withdraws', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, z: 5, symbolSize: 9,
      data: S.markers.map(function (m) { return { value: [m.ms, m.y], symbol: m.wdr > m.dep ? 'triangle' : 'triangle', symbolRotate: m.wdr > m.dep ? 180 : 0, itemStyle: { color: m.wdr > m.dep ? '#e66767' : '#34d399', borderColor: '#0d1117', borderWidth: 1.5 }, m: m }; }) });
    series.push({ name: 'LUNA price', type: 'line', data: S.lunaStrip, xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, lineStyle: { width: 1.5, color: '#9085e9' }, areaStyle: { color: '#9085e9', opacity: 0.08 } });
    return {
      backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Space Grotesk, system-ui, sans-serif', color: ink },
      legend: { type: 'scroll', top: 0, left: 0, right: 0, pageIconColor: '#9ca3af', pageTextStyle: { color: '#9ca3af' }, itemWidth: 14, itemHeight: 8, textStyle: { color: '#d1d5db', fontSize: 11 }, data: S.series.map(function (s) { return s.name; }).concat(S.markers && S.markers.length ? ['Deposits / withdraws'] : []) },
      grid: [{ left: 58, right: 16, top: 34, height: '62%' }, { left: 58, right: 16, top: '78%', height: '12%' }],
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: 'rgba(255,255,255,.35)', width: 1 } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(13,17,26,.96)', borderColor: 'rgba(255,255,255,.12)', textStyle: { color: '#e5e7eb', fontSize: 12 }, confine: true,
        formatter: function (ps) { if (!ps || !ps.length) return ''; var d = new Date(ps[0].axisValue).toISOString().slice(0, 10); var tot = 0, n = 0, rowsH = '';
          ps.forEach(function (p) { if (p.seriesName === 'Deposits / withdraws') { var m = p.data && p.data.m; if (m) rowsH += '<div style="color:#9ca3af;font-size:11px">epoch of ' + esc(m.d) + ': ' + m.dep + ' deposit' + (m.dep === 1 ? '' : 's') + ' · ' + m.wdr + ' withdraw' + (m.wdr === 1 ? '' : 's') + (m.clm ? ' · ' + m.clm + ' claims' : '') + '</div>'; return; }
            var v = Array.isArray(p.value) ? p.value[1] : p.value; if (v == null) return; var isL = p.seriesName === 'LUNA price'; if (!isL && S.kind === 'stack') { tot += v; n++; }
            rowsH += '<div style="display:flex;justify-content:space-between;gap:14px;align-items:center"><span style="color:#9ca3af"><span style="display:inline-block;width:10px;height:2px;background:' + p.color + ';vertical-align:middle;margin-right:6px"></span>' + esc(p.seriesName) + '</span><b style="font-family:JetBrains Mono,monospace">' + (isL ? '$' + Number(v).toFixed(4) : esc(f(v))) + '</b></div>'; });
          return '<div style="font-size:11px;color:#9ca3af;margin-bottom:4px">' + d + '</div>' + (S.kind === 'stack' && n > 1 ? '<div style="display:flex;justify-content:space-between;gap:14px;margin-bottom:3px"><span>Total</span><b style="font-family:JetBrains Mono,monospace;font-size:13px">' + esc(f(tot)) + '</b></div>' : '') + rowsH; } },
      xAxis: [{ type: 'time', gridIndex: 0, axisLabel: { show: false }, axisLine: { lineStyle: { color: grid } }, splitLine: { show: false } },
        { type: 'time', gridIndex: 1, axisLabel: { color: ink, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: grid } }, splitLine: { show: false } }],
      yAxis: [{ type: 'value', gridIndex: 0, scale: S.kind !== 'stack', splitNumber: 4, axisLabel: { color: ink, fontSize: 10, formatter: function (v) { return f(v).replace(' LUNA', '').replace(' VP', ''); } }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } },
        { type: 'value', gridIndex: 1, scale: true, splitNumber: 2, name: 'LUNA $', nameTextStyle: { color: ink, fontSize: 10, align: 'left' }, nameGap: 6, axisLabel: { color: ink, fontSize: 9, formatter: function (v) { return v.toFixed(3); } }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } }],
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], filterMode: 'none' }, { type: 'slider', xAxisIndex: [0, 1], bottom: 2, height: 16, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,.03)', fillerColor: 'rgba(57,135,229,.18)', handleStyle: { color: '#3987e5' }, textStyle: { color: ink, fontSize: 9 }, dataBackground: { lineStyle: { color: 'rgba(255,255,255,.2)' }, areaStyle: { color: 'rgba(255,255,255,.04)' } } }],
      series: series
    };
  }

  // ── the table view (accessibility: every value reachable without hovering) ────────────────────────────────────────
  function tableHtml(S) {
    var f = fmtFor(S.unit); var dates = {}; S.series.forEach(function (s) { s.pts.forEach(function (p) { dates[p[0]] = 1; }); });
    var ms = Object.keys(dates).map(Number).sort(function (a, b) { return b - a; }).slice(0, 400);
    var by = S.series.map(function (s) { var m = {}; s.pts.forEach(function (p) { m[p[0]] = p[1]; }); return m; });
    return '<div style="max-height:320px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left;padding:4px 6px;color:#6b7280;position:sticky;top:0;background:#0d1117">Day</th>' + S.series.map(function (s) { return '<th style="text-align:right;padding:4px 6px;color:#6b7280;position:sticky;top:0;background:#0d1117">' + esc(s.name) + '</th>'; }).join('') + (S.kind === 'stack' ? '<th style="text-align:right;padding:4px 6px;color:#6b7280;position:sticky;top:0;background:#0d1117">Total</th>' : '') + '</tr></thead><tbody>' +
      ms.map(function (m) { var tot = 0, any = false; var cells = by.map(function (b) { var v = b[m]; if (v != null) { tot += v; any = true; } return '<td style="text-align:right;padding:3px 6px;font-family:JetBrains Mono,monospace">' + (v == null ? '<span style="color:#4b5563">—</span>' : esc(f(v))) + '</td>'; }).join('');
        return '<tr style="border-top:1px solid rgba(255,255,255,.04)"><td style="padding:3px 6px;color:#9ca3af">' + new Date(m).toISOString().slice(0, 10) + '</td>' + cells + (S.kind === 'stack' ? '<td style="text-align:right;padding:3px 6px;font-family:JetBrains Mono,monospace;color:#e5e7eb">' + (any ? esc(f(tot)) : '—') + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>';
  }

  // ── mount: controls in one row above the chart, the chart, the notes; redraws on every control ────────────────────
  var BTN = 'font-size:11.5px;padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#9ca3af;cursor:pointer';
  var ON = 'font-size:11.5px;padding:4px 10px;border-radius:8px;border:1px solid rgba(57,135,229,.5);background:rgba(57,135,229,.16);color:#bfdbfe;cursor:pointer';
  function mount(el, data, opts) {
    opts = opts || {}; var st = Object.assign({ view: 'net', range: 30, lens: 'usd', table: false }, opts.state || {});
    var avail = function (v) { var S = seriesFor(data, { view: v, range: 0, lens: 'usd' }); return S.series.length > 0; };
    var views = VIEWS.filter(function (v) { return avail(v.id); });
    if (!views.some(function (v) { return v.id === st.view; })) st.view = views.length ? views[0].id : 'net';
    var chart = null;
    function draw() {
      var S = seriesFor(data, st);
      var ctl = '<div data-pc="controls" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px">' +
        views.map(function (v) { return '<button type="button" data-pc-view="' + v.id + '" title="' + esc(v.tip) + '" style="' + (st.view === v.id ? ON : BTN) + '">' + esc(v.label) + '</button>'; }).join('') +
        '<span style="width:1px;height:18px;background:rgba(255,255,255,.1);margin:0 4px"></span>' +
        RANGES.map(function (r) { return '<button type="button" data-pc-range="' + r[0] + '" style="' + (st.range === r[0] ? ON : BTN) + '">' + r[1] + '</button>'; }).join('') +
        (st.view === 'vp' ? '' : '<span style="width:1px;height:18px;background:rgba(255,255,255,.1);margin:0 4px"></span><button type="button" data-pc-lens="usd" style="' + (st.lens === 'usd' ? ON : BTN) + '">USD</button><button type="button" data-pc-lens="luna" style="' + (st.lens === 'luna' ? ON : BTN) + '">LUNA</button>') +
        '<button type="button" data-pc-table="1" style="margin-left:auto;' + (st.table ? ON : BTN) + '" title="Every value as a table">' + (st.table ? 'Chart' : 'Table') + '</button></div>';
      var body = !S.series.length ? '<div style="color:#6b7280;font-size:13px;padding:30px 0;text-align:center">No history for this view in this range.</div>'
        : st.table ? tableHtml(S) : '<div data-pc="chart" style="width:100%;height:' + (opts.height || 360) + 'px"></div>';
      el.innerHTML = ctl + body + (S.notes.length ? '<div data-pc="notes" style="font-size:11px;color:#6b7280;margin-top:6px">' + S.notes.map(esc).join(' ') + '</div>' : '') +
        (S.first ? '<div style="font-size:11px;color:#6b7280;margin-top:2px">From ' + esc(S.first) + ' · the purple strip is LUNA’s price on the same days · drag the bar under the chart (or pinch / scroll on it) to zoom</div>' : '');
      el.querySelectorAll('[data-pc-view]').forEach(function (b) { b.onclick = function () { st.view = b.getAttribute('data-pc-view'); if (opts.onState) opts.onState(st); draw(); }; });
      el.querySelectorAll('[data-pc-range]').forEach(function (b) { b.onclick = function () { st.range = Number(b.getAttribute('data-pc-range')); if (opts.onState) opts.onState(st); draw(); }; });
      el.querySelectorAll('[data-pc-lens]').forEach(function (b) { b.onclick = function () { st.lens = b.getAttribute('data-pc-lens'); if (opts.onState) opts.onState(st); draw(); }; });
      el.querySelectorAll('[data-pc-table]').forEach(function (b) { b.onclick = function () { st.table = !st.table; draw(); }; });
      if (chart) { try { chart.dispose(); } catch (e) {} chart = null; }
      var host = el.querySelector('[data-pc="chart"]');
      if (host) {
        var E = (typeof window !== 'undefined' && window.echarts) || null;
        if (!E) { var failed = typeof window === 'undefined' || window.__echarts === 'failed' || window.__echarts == null;
          host.style.height = 'auto'; host.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:12px 0">' + (failed ? 'The chart library did not load — the same numbers are in the Table view.' : 'Loading the chart…') + '</div>';
          if (!failed && !el._pcWait) { el._pcWait = true; window.addEventListener('echarts-ready', function () { el._pcWait = false; draw(); }, { once: true }); window.addEventListener('echarts-failed', function () { el._pcWait = false; draw(); }, { once: true }); }
          return; }
        chart = E.init(host, null, { renderer: 'canvas' }); chart.setOption(buildOption(S, st));
      }
    }
    draw();
    if (typeof window !== 'undefined' && !el._pcResize) { el._pcResize = true; window.addEventListener('resize', function () { if (chart) chart.resize(); }); }
    return { redraw: draw, state: st, update: function (d) { data = d; draw(); } };
  }

  return { VERSION: VERSION, VIEWS: VIEWS, RANGES: RANGES, COLORS: CAT, decodeRows: decodeRows, seriesFor: seriesFor, buildOption: buildOption, tableHtml: tableHtml, mount: mount };
});
