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
  var VERSION = '2.0.0';   // 2.0.0 (2026-10-14, owner: "build the chart like we did in Rallies with the same categories … much more powerful here being on desktop"): the five views first — LUNA · Tokens · Mix · NFTs · Debt — then More (Net worth, Locks, LPs, Votion, Voting power); a details panel beside the chart on desktop (below on a phone) for every view: rows with amounts, $, share and the change over the range; Tokens = up to 5 picked tokens + Others, each indexed to % change from the range start (amount held or $ value); Mix = a donut of where the value sits with each slice's APR and ≈ $ a week; NFTs = floor value vs backing value with the premium shaded between; Debt = collateral above zero, debt below, net dotted.
  // 1.2.0   // 1.2.0 (2026-10-13, owner: "show LUNA by default … all the places LUNA can be held"): view 'luna' — the LUNA you hold, stacked by WHERE it sits (wallet + LSTs, staked with validators, TLA locks, LPs, Votion, aDAO NFT backing, rewards to claim), in LUNA amounts from member-data/history/tokens (LSTs counted as the LUNA they represent at that day's rate — never twice); a place a day did not record is never drawn as 0: validator staking and NFT backing before the holdings record began are drawn faded at today's amount and labelled; 'now' carries the live amounts the page read. Combined data (several wallets summed) draws the same way.
  // 1.1.0   // 1.1.0 (2026-09-28): waits for the page's ECharts loader ('Loading the chart…'); Solid — its net (collateral − SOLID debt) in the net-worth stack (slot 7, violet), and a Lending view (Credia + Solid)
  // categorical slots — the validated dark order (dataviz reference: blue, orange, aqua, yellow, magenta, green; CVD ΔE ≥ 8.4 adjacent)
  var CAT = { lk: '#3987e5', lp: '#d95926', cu: '#199e70', wb: '#c98500', vt: '#d55181', cr: '#008300', so: '#9085e9' };   // 7 slots validated adjacent on the dark surface (worst CVD ΔE 8.4)
  var LABEL = { lk: 'TLA locks', lp: 'LPs in TLA', cu: 'LP staked in a DAO (ampCAPA)', wb: 'TLA tokens in wallet', vt: 'Votion', cr: 'Credia (net)', so: 'Solid (net)' };
  var VIEWS = [
    { id: 'luna', label: 'LUNA', tip: 'Every LUNA you hold, counted in LUNA and stacked by where it sits — liquid-staked tokens (ampLUNA, bLUNA, arbLUNA) count as the LUNA behind them' },
    { id: 'tokens', label: 'Tokens', tip: 'Up to 5 tokens you pick (+ Others), each line the % change from the start of the range — so billions of ROAR and a sliver of wBTC share one scale' },
    { id: 'mix', label: 'Mix', tip: 'Where your value sits right now, and what each part earns (APR, ≈ $ a week)' },
    { id: 'nft', label: 'NFTs', tip: 'Your aDAO NFTs at the floor vs the LUNA backing inside them — the gap is the premium a buyer pays over backing' },
    { id: 'debt', label: 'Debt', tip: 'Collateral above the line, what you owe below, net dotted — Solid and Credia' },
    { id: 'net', more: true, label: 'Net worth', tip: 'Everything with daily history, stacked by what it is — locks, LPs, receipts staked in a DAO, TLA tokens in the wallet, Votion, Credia' },
    { id: 'locks', more: true, label: 'Locks', tip: 'vAMP locks — in USD, or in LUNA (at that day’s hub rates)' },
    { id: 'lp', more: true, label: 'LPs', tip: 'LP positions (+ receipts staked in a DAO). "All" reaches back to your first deposit with the weekly P&L curve' },
    { id: 'votion', more: true, label: 'Votion', tip: 'Votion vault positions (the org archive, since 2026-07-16)' },
    { id: 'vp', more: true, label: 'Voting power', tip: 'VP now and VP if every lock were re-touched — the gap is decay waiting to be reclaimed' }
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

  // ── 1.2.0: the LUNA-held view — LUNA amounts by place (member-data/history/tokens rows: [day, cov, {SYM: {place: amount}}])
  var LPLACE = [['w', 'Wallet (LUNA + LSTs)', '#c98500'], ['st', 'Staked with validators', '#199e70'], ['lk', 'TLA locks', '#3987e5'], ['lp', 'LPs in TLA', '#d95926'],
    ['vt', 'Votion', '#d55181'], ['nft', 'aDAO NFT backing', '#9085e9'], ['rw', 'Rewards to claim', '#008300']];
  var HOLD_ONLY = { st: 1, nft: 1 };   // places only the holdings record (cov 'h') covers
  var COV = { w: 'ph', lk: 'p', lp: 'p', rw: 'p', vt: 'v', st: 'h', nft: 'h' };   // which record covers a place (index.json cov) — an uncovered place is a gap, never 0
  function covers(k, cov) { var c = COV[k] || ''; for (var i = 0; i < c.length; i++) if (cov.indexOf(c[i]) >= 0) return true; return false; }
  function lunaPlaces(syms) { var L = (syms && syms.LUNA) || {}; var o = {}; Object.keys(L).forEach(function (k) { var v = num(L[k]); if (v == null) return; var key = k === 'ls' ? 'w' : k === 'dao' ? 'lp' : k; o[key] = (o[key] || 0) + v; }); return o; }
  function lunaHeld(data, st) {
    var lens = st.lens === 'usd' ? 'usd' : 'luna', range = st.range == null ? 30 : st.range;
    var rows = (data.tokens || []).map(function (r) { return { d: r[0], cov: String(r[1] || ''), pl: lunaPlaces(r[2]) }; });
    if (data.lunaNow && data.lunaNow.d) { rows = rows.filter(function (r) { return r.d < data.lunaNow.d; }); rows.push({ d: data.lunaNow.d, cov: 'hpv', pl: data.lunaNow.places || {}, now: true }); }
    var out = { kind: 'stack', unit: lens, series: [], markers: [], notes: [], first: null };
    if (!rows.length) return out;
    var last = rows[rows.length - 1].d, from = range ? t(last) - (range - 1) * DAY : -Infinity;
    // today's amount of a holdings-only place (the latest covered day, the live read wins)
    var latest = {}; rows.forEach(function (r) { if (r.cov.indexOf('h') >= 0) Object.keys(HOLD_ONLY).forEach(function (k) { if (r.pl[k] != null) latest[k] = r.pl[k]; }); });
    var firstH = null; rows.forEach(function (r) { if (!firstH && r.cov.indexOf('h') >= 0) firstH = r.d; });
    rows = rows.filter(function (r) { return t(r.d) >= from; }); out.first = rows.length ? rows[0].d : null;
    var conv = function (v, d) { if (v == null) return null; if (lens === 'luna') return v; var p = lunaAt(data, d, null); return p ? v * p : null; };
    var filled = false;
    LPLACE.forEach(function (P) {
      var k = P[0]; var pts = [], est = [];
      rows.forEach(function (r) { var ms = t(r.d); var hasH = r.cov.indexOf('h') >= 0;
        if (HOLD_ONLY[k] && !hasH) { pts.push([ms, null]); var v0 = latest[k]; est.push([ms, v0 ? conv(v0, r.d) : null]); if (v0) filled = true; }
        else { pts.push([ms, r.pl[k] != null ? conv(r.pl[k], r.d) : (covers(k, r.cov) ? 0 : null)]); est.push([ms, null]); } });
      if (pts.some(function (p) { return p[1]; })) out.series.push({ key: k, name: P[1], color: P[2], pts: pts });
      if (est.some(function (p) { return p[1]; })) out.series.push({ key: k + '_est', name: P[1] + ' (est.)', color: P[2], pts: est, faded: true });
    });
    if (filled) out.notes.push('Validator staking and NFT backing were not recorded before ' + (firstH || 'the holdings record began') + ' — those days (est., faded) show today’s amount.');
    out.notes.push('LSTs (ampLUNA, bLUNA, arbLUNA) count as the LUNA behind them at each day’s rate, so nothing is counted twice.' + (data.lunaNow ? ' The last point is today’s live read.' : ''));
    var ms0 = Infinity, ms1 = -Infinity; out.series.forEach(function (s) { s.pts.forEach(function (p) { if (p[1] != null) { ms0 = Math.min(ms0, p[0]); ms1 = Math.max(ms1, p[0]); } }); });
    var keys = Object.keys(data.luna || {}).filter(function (k) { return t(k) >= ms0 && t(k) <= ms1; }).sort(); var step = Math.max(1, Math.ceil(keys.length / 600));
    out.lunaStrip = keys.filter(function (k, i) { return i % step === 0 || i === keys.length - 1; }).map(function (k) { return [t(k), data.luna[k]]; });
    return out;
  }

  // ── 2.0.0 the Tokens view — every token counted once (LSTs already as their base in the history), summed over every place
  var TOKEN_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
  var SKIP_SYM = /^(zluna|[0-9A-F]{40,})/i;
  function tokenTotals(syms) { var o = {}; Object.keys(syms || {}).forEach(function (sym) { if (SKIP_SYM.test(sym)) return; var pl = syms[sym] || {}; var t = 0, any = false; Object.keys(pl).forEach(function (k) { var v = num(pl[k]); if (v != null) { t += v; any = true; } }); if (any) o[sym] = { amt: t, pl: pl }; }); return o; }
  function pxAt(data, sym, d) { if (sym === 'LUNA') return lunaAt(data, d, null); var m = (data.prices || {})[sym]; if (!m) return null; for (var i = 0; i <= 7; i++) { var k = new Date(t(d) - i * DAY).toISOString().slice(0, 10); if (num(m[k])) return m[k]; } return null; }
  function tokensNow(data) { var rows = data.tokens || []; var last = rows[rows.length - 1]; if (!last) return []; var tt = tokenTotals(last[2]);
    return Object.keys(tt).map(function (sym) { var p = pxAt(data, sym, last[0]); return { sym: sym, amt: tt[sym].amt, pl: tt[sym].pl, usd: p != null ? tt[sym].amt * p : null }; }).sort(function (a, b) { return (b.usd || 0) - (a.usd || 0); }); }
  function tokensView(data, st) {
    var range = st.range == null ? 30 : st.range, mode = st.tmode === 'amt' ? 'amt' : 'usd';
    var rows = (data.tokens || []).map(function (r) { return { d: r[0], cov: String(r[1] || ''), tt: tokenTotals(r[2]) }; });
    var out = { kind: 'lines', unit: 'pct', series: [], markers: [], notes: [], first: null, zero: true };
    var lastCov = rows.length ? rows[rows.length - 1].cov : ''; var full = function (r) { for (var i = 0; i < lastCov.length; i++) if (r.cov.indexOf(lastCov[i]) < 0) return false; return true; };
    var todayTT = rows.length ? rows[rows.length - 1].tt : {}; var partial = 0;
    rows.forEach(function (r) { r.full = full(r); if (!r.full) partial++; });
    if (!rows.length) return out;
    var last = rows[rows.length - 1].d, from = range ? t(last) - (range - 1) * DAY : -Infinity; rows = rows.filter(function (r) { return t(r.d) >= from; }); out.first = rows.length ? rows[0].d : null;
    var now = tokensNow(data); var pick = (st.pick && st.pick.length ? st.pick : now.filter(function (x) { return x.usd != null && x.usd >= 1; }).slice(0, 5).map(function (x) { return x.sym; })).slice(0, 5);
    out.pick = pick; out.mode = mode;
    // a day the record did not fully cover: the amount view has no point (unknown), the $ view prices TODAY's amount (what today's holding was worth)
    var val = function (r, sym) { var x = r.full ? r.tt[sym] : null; if (!r.full) { if (mode === 'amt') return null; x = todayTT[sym]; } if (!x) return null; if (mode === 'amt') return x.amt; var p = pxAt(data, sym, r.d); return p != null ? x.amt * p : null; };
    pick.forEach(function (sym, i) { var base = null; var pts = rows.map(function (r) { var v = val(r, sym); if (v == null) return [t(r.d), null]; if (base == null && v > 0) base = v; return [t(r.d), base ? (v / base - 1) * 100 : null]; });
      if (pts.some(function (p) { return p[1] != null; })) out.series.push({ key: sym, name: sym, color: TOKEN_COLORS[i % 5], pts: pts }); });
    if (mode === 'usd') { var base = null, miss = 0; var pts = rows.map(function (r) { var tot = 0, any = false; Object.keys(r.tt).forEach(function (sym) { if (pick.indexOf(sym) >= 0) return; var v = val(r, sym); if (v != null) { tot += v; any = true; } else miss++; });
        if (!any) return [t(r.d), null]; if (base == null && tot > 0) base = tot; return [t(r.d), base ? (tot / base - 1) * 100 : null]; });
      if (pts.some(function (p) { return p[1] != null; })) out.series.push({ key: 'others', name: 'Others ($)', color: '#9ca3af', pts: pts, dashed: true });
      if (miss) out.notes.push('Tokens with no daily price are left out of Others.'); }
    out.notes.push(mode === 'amt' ? 'Each line: how much more or less of the token you held than at the start of the range (every place summed; LSTs as their base).' : 'Each line: the $ value of what you held each day, as % change from the start — amount and price together.');
    if (partial) out.notes.push(mode === 'amt' ? 'Amounts start on the first day the record covered every place you hold today (2026-10-13 for wallet tokens, staking and NFT backing).' : 'Before the record covered every place (2026-10-13) the lines price today’s amounts — what today’s holding was worth each day.');
    return out;
  }
  // ── the NFTs view — floor value vs backing value of the NFTs held today (count fixed at today's; labelled)
  function nftView(data, st) {
    var lens = st.lens === 'usd' ? 'usd' : 'luna', range = st.range == null ? 30 : st.range, N = data.nft || {};
    var c = N.counts || {}; var out = { kind: 'band', unit: lens, series: [], markers: [], notes: [], first: null };
    if (!(c.base || c.phoenix || c.broken)) return out;
    var fl = {}; (N.floors || []).forEach(function (r) { fl[r.date] = r; }); var bk = {}; (N.backing || []).forEach(function (r) { bk[r.date] = r; });
    var days = Object.keys(fl).concat(Object.keys(bk)).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
    if (!days.length) return out; var last = days[days.length - 1], from = range ? t(last) - (range - 1) * DAY : -Infinity; days = days.filter(function (d) { return t(d) >= from; }); out.first = days[0] || null;
    var unit = function (r, tier) { var f = r && r.per_tier && r.per_tier[tier] || {}; var a = num(f.sales_floor_usd), b = num(f.listing_floor_usd); return a != null && b != null ? Math.min(a, b) : (a != null ? a : b); };
    var conv = function (usd, d) { if (usd == null) return null; if (lens === 'usd') return usd; var p = lunaAt(data, d, null); return p ? usd / p : null; };
    var floorPts = days.map(function (d) { var r = fl[d]; if (!r) return [t(d), null]; var v = 0, ok = true; ['base', 'phoenix', 'broken'].forEach(function (tier) { if (!c[tier]) return; var u = unit(r, tier); if (u == null) ok = false; else v += u * c[tier]; }); return [t(d), ok ? conv(v, d) : null]; });
    var unb = (c.base || 0) + (c.phoenix || 0);
    var backPts = days.map(function (d) { var r = bk[d]; if (!r || num(r.backingInLuna) == null) return [t(d), null]; var l = r.backingInLuna * unb; if (lens === 'luna') return [t(d), l]; var p = lunaAt(data, d, null); return [t(d), p ? l * p : null]; });
    out.series = [{ key: 'floor', name: 'At the floor', color: '#c98500', pts: floorPts }, { key: 'backing', name: 'Backing inside them', color: '#9085e9', pts: backPts }];
    out.notes.push('The NFTs you hold today (' + [c.base ? c.base + ' unbroken' : '', c.phoenix ? c.phoenix + ' Phoenix' : '', c.broken ? c.broken + ' broken' : ''].filter(Boolean).join(' · ') + ') valued each day: at that day’s floor (the lower of listing and recent sales, per tier) and at the ampLUNA backing inside the unbroken ones. Broken NFTs carry no backing. Net worth counts one or the other, never both.');
    return out;
  }
  // ── the Debt view — collateral above zero, debt below, net dotted (history: the daily series' Credia + Solid columns)
  function debtView(data, st) {
    var lens = st.lens === 'luna' ? 'luna' : 'usd', range = st.range == null ? 30 : st.range;
    var rows = (data.rows || []).slice(); if (data.now && data.now.d && !rows.some(function (r) { return r.d === data.now.d; })) rows.push(Object.assign({ now: true }, data.now));
    var out = { kind: 'debt', unit: lens, series: [], markers: [], notes: [], first: null };
    rows = rows.filter(function (r) { return r.cs != null || r.cb != null || r.ss != null || r.sb != null; }); if (!rows.length) return out;
    var last = rows[rows.length - 1].d, from = range ? t(last) - (range - 1) * DAY : -Infinity; rows = rows.filter(function (r) { return t(r.d) >= from; }); out.first = rows.length ? rows[0].d : null;
    var conv = function (v, r) { if (v == null) return null; if (lens === 'usd') return v; var p = lunaAt(data, r.d, r); return p ? v / p : null; };
    var coll = rows.map(function (r) { return [t(r.d), conv((num(r.cs) || 0) + (num(r.ss) || 0), r)]; }), debt = rows.map(function (r) { var v = conv((num(r.cb) || 0) + (num(r.sb) || 0), r); return [t(r.d), v == null ? null : -v]; });
    var net = rows.map(function (r, i) { var a = coll[i][1], b = debt[i][1]; return [t(r.d), a == null || b == null ? null : a + b]; });
    if (!coll.some(function (p) { return p[1]; }) && !debt.some(function (p) { return p[1]; })) return out;
    out.series = [{ key: 'coll', name: 'Collateral / supplied', color: '#199e70', pts: coll, area: true }, { key: 'debt', name: 'Debt / borrowed', color: '#e66767', pts: debt, area: true }, { key: 'net', name: 'Net', color: '#e5e7eb', pts: net, dotted: true }];
    out.notes.push('Credia (supplied − borrowed) and Solid (collateral − SOLID owed), at each protocol’s own prices, from the daily record; the last point is live.');
    return out;
  }
  // ── the Mix view (now only) — slices with APR
  function mixView(data) { var M = (data.mix || []).filter(function (x) { return x.usd > 0.5; }); var tot = M.reduce(function (a, x) { return a + x.usd; }, 0);
    var rated = M.filter(function (x) { return x.apr != null; }); var rv = rated.reduce(function (a, x) { return a + x.usd; }, 0), wk = rated.reduce(function (a, x) { return a + x.usd * x.apr / 100 / 52; }, 0);
    return { kind: 'pie', unit: 'usd', series: [], slices: M, total: tot, apr: rv > 0 ? wk * 52 * 100 / rv : null, weekly: wk, rated: rv, notes: ['APR: LPs from this round’s TLA rewards (amplified compounded weekly), locks from the vote rewards your votes are on course for this round (× 52), Votion from what the vaults actually paid since you went in, aDAO NFTs from how fast their backing grew over 30 days. LUNA staked with validators and liquid tokens show no rate (not measured) and are left out of the average.'], markers: [], first: null }; }

  // ── the points a view draws (pure) → { kind: 'stack'|'lines', unit: 'usd'|'luna'|'vp', series: [{key, name, color, pts:[[ms, v]]}], markers, notes, first }
  function seriesFor(data, st) {
    var view = st.view || 'net', lens = st.lens === 'luna' ? 'luna' : 'usd', range = st.range == null ? 30 : st.range;
    if (view === 'luna') return lunaHeld(data, st);
    if (view === 'tokens') return tokensView(data, st);
    if (view === 'nft') return nftView(data, st);
    if (view === 'debt') return debtView(data, st);
    if (view === 'mix') return mixView(data);
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

  function fmtPct(v) { return v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0) + '%'; }
  function fmtFor(unit) { return unit === 'luna' ? fmtLuna : unit === 'vp' ? function (v) { return fmtNum(v) + ' VP'; } : unit === 'pct' ? fmtPct : fmtUsd; }
  // ── the ECharts option (pure) ────────────────────────────────────────────────────────────────────────────────────
  function buildOption(S, st) {
    var f = fmtFor(S.unit), ink = '#9ca3af', grid = 'rgba(255,255,255,.06)'; var hasStrip = !!(S.lunaStrip && S.lunaStrip.length);
    if (S.kind === 'pie') return { backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Space Grotesk, system-ui, sans-serif', color: ink },
      tooltip: { trigger: 'item', backgroundColor: 'rgba(13,17,26,.96)', borderColor: 'rgba(255,255,255,.12)', textStyle: { color: '#e5e7eb', fontSize: 12 }, formatter: function (p) { var x = p.data.x; return '<b>' + esc(x.label) + '</b><br>' + esc(fmtUsd(x.usd)) + ' · ' + p.percent.toFixed(1) + '%' + (x.apr != null ? '<br>APR ' + x.apr.toFixed(1) + '% · ≈ ' + esc(fmtUsd(x.usd * x.apr / 100 / 52)) + ' a week' : '<br>no rate measured'); } },
      title: { text: S.apr != null ? S.apr.toFixed(1) + '%' : '—', subtext: S.apr != null ? 'average APR' : 'no rates yet', left: 'center', top: '40%', textStyle: { color: '#f3f4f6', fontSize: 26, fontFamily: 'JetBrains Mono, monospace' }, subtextStyle: { color: ink, fontSize: 11 } },
      series: [{ type: 'pie', radius: ['52%', '78%'], center: ['50%', '50%'], avoidLabelOverlap: true, itemStyle: { borderColor: '#0d1117', borderWidth: 2 }, label: { color: '#d1d5db', fontSize: 11, formatter: function (p) { return p.data.x.label + '\n' + p.percent.toFixed(0) + '%'; } },
        data: S.slices.map(function (x) { return { name: x.label, value: x.usd, itemStyle: { color: x.color }, x: x }; }) }] };
    var series = S.series.map(function (s) {
      return { name: s.name, type: 'line', data: s.pts, showSymbol: false, symbolSize: 6, connectNulls: false, lineStyle: { width: s.faded ? 1 : s.dotted ? 1.5 : 2, color: s.color, type: s.faded || s.dashed ? 'dashed' : s.dotted ? 'dotted' : 'solid' }, itemStyle: { color: s.color },
        stack: S.kind === 'stack' ? 'net' : undefined, areaStyle: S.kind === 'stack' ? { color: s.color, opacity: s.faded ? 0.18 : 0.55 } : s.area ? { color: s.color, opacity: 0.22 } : S.kind === 'band' ? { color: s.color, opacity: s.key === 'backing' ? 0.28 : 0.1 } : (S.series.length === 1 ? { color: s.color, opacity: 0.08 } : undefined),
        markLine: (S.zero || S.kind === 'debt') && s === S.series[0] ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: 'rgba(255,255,255,.35)', type: 'solid', width: 1 }, data: [{ yAxis: 0 }] } : undefined,
        emphasis: { focus: 'series' }, xAxisIndex: 0, yAxisIndex: 0 };
    });
    if (S.markers && S.markers.length) series.push({ name: 'Deposits / withdraws', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, z: 5, symbolSize: 9,
      data: S.markers.map(function (m) { return { value: [m.ms, m.y], symbol: m.wdr > m.dep ? 'triangle' : 'triangle', symbolRotate: m.wdr > m.dep ? 180 : 0, itemStyle: { color: m.wdr > m.dep ? '#e66767' : '#34d399', borderColor: '#0d1117', borderWidth: 1.5 }, m: m }; }) });
    if (S.lunaStrip && S.lunaStrip.length) series.push({ name: 'LUNA price', type: 'line', data: S.lunaStrip, xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, lineStyle: { width: 1.5, color: '#9085e9' }, areaStyle: { color: '#9085e9', opacity: 0.08 } });
    return {
      backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Space Grotesk, system-ui, sans-serif', color: ink },
      legend: { type: 'scroll', top: 0, left: 0, right: 0, pageIconColor: '#9ca3af', pageTextStyle: { color: '#9ca3af' }, itemWidth: 14, itemHeight: 8, textStyle: { color: '#d1d5db', fontSize: 11 }, data: S.series.map(function (s) { return s.name; }).concat(S.markers && S.markers.length ? ['Deposits / withdraws'] : []) },
      grid: hasStrip ? [{ left: 58, right: 16, top: 34, height: '62%' }, { left: 58, right: 16, top: '78%', height: '12%' }] : [{ left: 58, right: 16, top: 34, bottom: 46 }, { left: 58, right: 16, top: '99%', height: 0 }],
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: 'rgba(255,255,255,.35)', width: 1 } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(13,17,26,.96)', borderColor: 'rgba(255,255,255,.12)', textStyle: { color: '#e5e7eb', fontSize: 12 }, confine: true,
        formatter: function (ps) { if (!ps || !ps.length) return ''; var d = new Date(ps[0].axisValue).toISOString().slice(0, 10); var tot = 0, n = 0, rowsH = '';
          ps.forEach(function (p) { if (p.seriesName === 'Deposits / withdraws') { var m = p.data && p.data.m; if (m) rowsH += '<div style="color:#9ca3af;font-size:11px">epoch of ' + esc(m.d) + ': ' + m.dep + ' deposit' + (m.dep === 1 ? '' : 's') + ' · ' + m.wdr + ' withdraw' + (m.wdr === 1 ? '' : 's') + (m.clm ? ' · ' + m.clm + ' claims' : '') + '</div>'; return; }
            var v = Array.isArray(p.value) ? p.value[1] : p.value; if (v == null) return; var isL = p.seriesName === 'LUNA price'; if (!isL && S.kind === 'stack') { tot += v; n++; }
            rowsH += '<div style="display:flex;justify-content:space-between;gap:14px;align-items:center"><span style="color:#9ca3af"><span style="display:inline-block;width:10px;height:2px;background:' + p.color + ';vertical-align:middle;margin-right:6px"></span>' + esc(p.seriesName) + '</span><b style="font-family:JetBrains Mono,monospace">' + (isL ? '$' + Number(v).toFixed(4) : esc(f(v))) + '</b></div>'; });
          return '<div style="font-size:11px;color:#9ca3af;margin-bottom:4px">' + d + '</div>' + (S.kind === 'stack' && n > 1 ? '<div style="display:flex;justify-content:space-between;gap:14px;margin-bottom:3px"><span>Total</span><b style="font-family:JetBrains Mono,monospace;font-size:13px">' + esc(f(tot)) + '</b></div>' : '') + rowsH; } },
      xAxis: [{ type: 'time', gridIndex: 0, axisLabel: { show: !hasStrip, color: ink, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: grid } }, splitLine: { show: false } },
        { type: 'time', gridIndex: 1, show: hasStrip, axisLabel: { color: ink, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: grid } }, splitLine: { show: false } }],
      yAxis: [{ type: 'value', gridIndex: 0, scale: S.kind !== 'stack' && S.kind !== 'debt', splitNumber: 4, axisLabel: { color: ink, fontSize: 10, formatter: function (v) { return f(v).replace(' LUNA', '').replace(' VP', ''); } }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } },
        { type: 'value', gridIndex: 1, show: hasStrip, scale: true, splitNumber: 2, name: 'LUNA $', nameTextStyle: { color: ink, fontSize: 10, align: 'left' }, nameGap: 6, axisLabel: { color: ink, fontSize: 9, formatter: function (v) { return v.toFixed(3); } }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } }],
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

  // ── 2.0.0 the details panel beside the chart (desktop) / under it (phone) ─────────────────────────────────────────
  var PLACE_NAME = { w: 'wallet', ls: 'wallet (LST)', st: 'staked', lk: 'locks', lp: 'LPs', dao: 'in a DAO', gov: 'gov stake', nft: 'NFT backing', rw: 'rewards', vt: 'Votion', cs: 'elsewhere' };
  function lastNN(pts) { for (var i = pts.length - 1; i >= 0; i--) if (pts[i][1] != null) return pts[i][1]; return null; }
  function firstNN(pts) { for (var i = 0; i < pts.length; i++) if (pts[i][1] != null) return pts[i][1]; return null; }
  var TD = 'padding:4px 6px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px', TH = 'padding:4px 6px;text-align:right;color:#6b7280;font-weight:500;font-size:10.5px';
  function row(cells, first) { return '<tr style="border-top:1px solid rgba(255,255,255,.05)"><td style="padding:4px 6px;font-size:12px;color:#d1d5db">' + first + '</td>' + cells.map(function (c) { return '<td style="' + TD + '">' + c + '</td>'; }).join('') + '</tr>'; }
  function table(head, body) { return '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + TH + ';text-align:left">' + head[0] + '</th>' + head.slice(1).map(function (h) { return '<th style="' + TH + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>'; }
  function chg(a, b, f) { if (a == null || b == null) return '<span style="color:#4b5563">—</span>'; var d = b - a; return '<span style="color:' + (d >= 0 ? '#34d399' : '#f87171') + '">' + (d >= 0 ? '+' : '−') + esc(f(Math.abs(d))) + '</span>'; }
  function detailsHtml(S, data, st) {
    var f = fmtFor(S.unit), out = '';
    if (st.view === 'luna') {
      var by = {}; S.series.forEach(function (s) { var k = s.key.replace(/_est$/, ''); var b = by[k] || (by[k] = { name: s.name.replace(' (est.)', ''), color: s.color, last: null, first: null }); var l = lastNN(s.pts), fi = firstNN(s.pts); if (l != null && b.last == null) b.last = l; if (fi != null && b.first == null) b.first = fi; });
      var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (b) { return b.last || b.first; }).map(function (b) { if (b.last == null) b.last = 0; return b; }).sort(function (a, b) { return b.last - a.last; }); var tot = list.reduce(function (a, b) { return a + b.last; }, 0), tot0 = list.reduce(function (a, b) { return a + (b.first || 0); }, 0);
      var dot = function (c) { return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + c + ';margin-right:6px"></span>'; };
      out = '<div style="font-size:11px;color:#6b7280;margin-bottom:4px">Where your LUNA sits — latest day</div>' + table(['Place', S.unit === 'luna' ? 'LUNA' : '$', 'Share', 'Change'], list.map(function (b) { return row([esc(f(b.last)).replace(' LUNA', ''), (tot ? (b.last / tot * 100).toFixed(1) : '0') + '%', chg(b.first, b.last, f)], dot(b.color) + esc(b.name)); }).join('') + row(['<b>' + esc(f(tot)).replace(' LUNA', '') + '</b>', '100%', chg(tot0, tot, f)], '<b>Total</b>'));
    } else if (st.view === 'tokens') {
      var now = tokensNow(data); var pick = S.pick || [];
      out = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:11px;color:#6b7280">Tap a token to chart it (up to 5)</span><span><button type="button" data-pc-tmode="amt" style="' + (S.mode === 'amt' ? ON : BTN) + '">Amount</button> <button type="button" data-pc-tmode="usd" style="' + (S.mode !== 'amt' ? ON : BTN) + '">$ value</button></span></div>' +
        table(['Token', 'Held', '$', 'Change'], now.slice(0, 30).map(function (x) { var sr = S.series.filter(function (s) { return s.key === x.sym; })[0]; var on = pick.indexOf(x.sym) >= 0; var col = sr ? sr.color : '#4b5563';
          var where = Object.keys(x.pl).filter(function (k) { return num(x.pl[k]) > 0; }).map(function (k) { return PLACE_NAME[k] || k; }).join(', ');
          return row([esc(fmtNum(x.amt)), x.usd != null ? esc(fmtUsd(x.usd)) : '<span style="color:#4b5563">no price</span>', sr ? esc(fmtPct(lastNN(sr.pts))) : '<span style="color:#4b5563">—</span>'],
            '<button type="button" data-pc-pick="' + esc(x.sym) + '" title="' + esc(where) + '" style="background:none;border:0;padding:0;cursor:pointer;color:' + (on ? '#f3f4f6' : '#9ca3af') + ';font-size:12px;text-align:left"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;border:2px solid ' + col + ';background:' + (on ? col : 'transparent') + ';margin-right:6px;vertical-align:-1px"></span>' + esc(x.sym) + '<div style="font-size:10px;color:#6b7280">' + esc(where) + '</div></button>'); }).join(''));
    } else if (st.view === 'mix') {
      out = table(['Part', '$', 'Share', 'APR', '≈ / week'], S.slices.slice().sort(function (a, b) { return b.usd - a.usd; }).map(function (x) { return row([esc(fmtUsd(x.usd)), (S.total ? (x.usd / S.total * 100).toFixed(1) : '0') + '%', x.apr != null ? x.apr.toFixed(1) + '%' : '<span style="color:#4b5563" title="rate not measured">—</span>', x.apr != null ? esc(fmtUsd(x.usd * x.apr / 100 / 52)) : '—'],
        '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + x.color + ';margin-right:6px"></span>' + esc(x.label) + (x.sub ? '<div style="font-size:10px;color:#6b7280">' + esc(x.sub) + '</div>' : '')); }).join('') +
        row(['<b>' + esc(fmtUsd(S.total)) + '</b>', '100%', S.apr != null ? '<b>' + S.apr.toFixed(1) + '%</b>' : '—', '<b>' + esc(fmtUsd(S.weekly)) + '</b>'], '<b>All</b><div style="font-size:10px;color:#6b7280">APR averaged over ' + esc(fmtUsd(S.rated)) + ' that has a rate</div>'));
    } else if (st.view === 'nft') {
      var F = S.series[0], B = S.series[1]; var fl = F ? lastNN(F.pts) : null, bk = B ? lastNN(B.pts) : null, fl0 = F ? firstNN(F.pts) : null, bk0 = B ? firstNN(B.pts) : null; var c = (data.nft || {}).counts || {};
      out = table(['', 'Now', 'Change'], row([esc(f(fl)), chg(fl0, fl, f)], 'At the floor') + row([esc(f(bk)), chg(bk0, bk, f)], 'Backing inside') + row([fl != null && bk ? '×' + (fl / bk).toFixed(2) : '—', ''], 'Floor ÷ backing')) +
        '<div style="font-size:11px;color:#9ca3af;margin-top:8px">' + [c.base ? c.base + ' unbroken' : '', c.phoenix ? c.phoenix + ' Phoenix' : '', c.broken ? c.broken + ' broken (no backing)' : ''].filter(Boolean).join(' · ') + '</div>';
    } else if (st.view === 'debt') {
      var D = data.debtNow || []; out = D.length ? table(['Protocol', 'Collateral', 'Owed', 'Health'], D.map(function (x) { return row([esc(fmtUsd(x.coll)), esc(fmtUsd(x.debt)), x.health != null ? '<span style="color:' + (x.health >= 1.6 ? '#34d399' : x.health >= 1.2 ? '#fbbf24' : '#f87171') + '">' + x.health.toFixed(2) + '</span>' : '—'], esc(x.name) + (x.note ? '<div style="font-size:10px;color:#6b7280">' + esc(x.note) + '</div>' : '')); }).join('')) : '<div style="font-size:12px;color:#6b7280">No loan on Solid or Credia.</div>';
    }
    return out;
  }

  // ── mount: the view tabs (five + More), range, lens, the chart, the details panel, the notes ─────────────────────
  var BTN = 'font-size:11.5px;padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#9ca3af;cursor:pointer';
  var ON = 'font-size:11.5px;padding:4px 10px;border-radius:8px;border:1px solid rgba(57,135,229,.5);background:rgba(57,135,229,.16);color:#bfdbfe;cursor:pointer';
  var TAB = 'font-size:13px;padding:6px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#9ca3af;cursor:pointer;font-weight:600';
  var TABON = 'font-size:13px;padding:6px 14px;border-radius:9px;border:1px solid rgba(57,135,229,.55);background:rgba(57,135,229,.2);color:#e0ecff;cursor:pointer;font-weight:600';
  function headline(S, data, st) {
    var f = fmtFor(S.unit);
    if (S.kind === 'pie') return S.total ? '<b style="font-size:22px;font-family:JetBrains Mono,monospace;color:#f3f4f6">' + esc(fmtUsd(S.total)) + '</b> <span style="color:#9ca3af;font-size:12px">' + (S.apr != null ? 'earning ≈ ' + S.apr.toFixed(1) + '% a year · ≈ ' + esc(fmtUsd(S.weekly)) + ' a week' : '') + '</span>' : '';
    if (S.kind === 'stack' || S.kind === 'debt' || S.kind === 'band') { var n = 0; S.series.forEach(function (s) { n = Math.max(n, s.pts.length); });
      var tot = function (idx) { var at = function (i) { var a = 0, any = false; S.series.forEach(function (s) { if (S.kind === 'band' && s.key !== 'floor') return; if (S.kind === 'debt' && s.key !== 'net') return; var p = s.pts[i]; if (p && p[1] != null) { a += p[1]; any = true; } }); return any ? a : null; };
        if (idx === 'last') { for (var i = n - 1; i >= 0; i--) { var v = at(i); if (v != null) return v; } return null; } for (var j = 0; j < n; j++) { var w = at(j); if (w != null) return w; } return null; };
      var a = tot('first'), b = tot('last'); if (b == null) return '';
      var lab = S.kind === 'band' ? 'at the floor' : S.kind === 'debt' ? 'net' : (st.view === 'luna' ? 'LUNA you hold' : 'total');
      return '<b style="font-size:22px;font-family:JetBrains Mono,monospace;color:#f3f4f6">' + esc(f(b)) + '</b> <span style="color:#9ca3af;font-size:12px">' + lab + '</span> ' + (a != null ? '<span style="font-size:12px;margin-left:6px">' + chg(a, b, f) + ' <span style="color:#6b7280">over the range</span></span>' : ''); }
    return '';
  }
  function mount(el, data, opts) {
    opts = opts || {}; var st = Object.assign({ view: 'luna', range: 30, lens: 'luna', table: false, tmode: 'usd', pick: null }, opts.state || {});
    var avail = function (v) { if (v === 'mix') return (data.mix || []).some(function (x) { return x.usd > 0.5; }); var S = seriesFor(data, { view: v, range: 0, lens: 'usd', tmode: 'usd' }); return S.series.length > 0; };
    var views = [];
    var chart = null;
    function draw() {
      views = VIEWS.filter(function (v) { return avail(v.id); });   // recomputed each draw: live pieces (Mix, NFTs, Debt) land after the first one
      if (!views.some(function (v) { return v.id === st.view; })) st.view = views.length ? views[0].id : 'net';
      var S = seriesFor(data, st); var wide = (el.clientWidth || 1000) >= 900;
      var main = views.filter(function (v) { return !v.more; }), more = views.filter(function (v) { return v.more; });
      var lensOk = ['luna', 'nft', 'debt', 'net', 'locks', 'lp', 'votion'].indexOf(st.view) >= 0;
      var ctl = '<div data-pc="controls" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px">' +
        main.map(function (v) { return '<button type="button" data-pc-view="' + v.id + '" title="' + esc(v.tip) + '" style="' + (st.view === v.id ? TABON : TAB) + '">' + esc(v.label) + '</button>'; }).join('') +
        (more.length ? '<span style="font-size:11px;color:#6b7280;margin:0 2px 0 8px">More</span>' + more.map(function (v) { return '<button type="button" data-pc-view="' + v.id + '" title="' + esc(v.tip) + '" style="' + (st.view === v.id ? ON : BTN) + '">' + esc(v.label) + '</button>'; }).join('') : '') + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px">' + (S.kind === 'pie' ? '<span style="font-size:11px;color:#6b7280">Right now</span>' : RANGES.map(function (r) { return '<button type="button" data-pc-range="' + r[0] + '" style="' + (st.range === r[0] ? ON : BTN) + '">' + r[1] + '</button>'; }).join('')) +
        (lensOk ? '<span style="width:1px;height:18px;background:rgba(255,255,255,.1);margin:0 4px"></span><button type="button" data-pc-lens="luna" style="' + (st.lens === 'luna' ? ON : BTN) + '">LUNA</button><button type="button" data-pc-lens="usd" style="' + (st.lens !== 'luna' ? ON : BTN) + '">USD</button>' : '') +
        (S.kind !== 'pie' ? '<button type="button" data-pc-table="1" style="margin-left:auto;' + (st.table ? ON : BTN) + '" title="Every value as a table">' + (st.table ? 'Chart' : 'Table') + '</button>' : '') + '</div>';
      var hl = headline(S, data, st);
      var body = (!S.series.length && S.kind !== 'pie') || (S.kind === 'pie' && !S.slices.length) ? '<div style="color:#6b7280;font-size:13px;padding:30px 0;text-align:center">Nothing to show for this view' + (S.kind === 'pie' ? '' : ' in this range') + '.</div>'
        : st.table && S.kind !== 'pie' ? tableHtml(S) : '<div data-pc="chart" style="width:100%;height:' + (opts.height || 360) + 'px"></div>';
      var det = detailsHtml(S, data, st);
      el.innerHTML = ctl + (hl ? '<div style="margin:2px 0 6px">' + hl + '</div>' : '') +
        (det ? '<div style="display:' + (wide ? 'grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;align-items:start' : 'block') + '"><div>' + body + '</div><div data-pc="details" style="' + (wide ? 'max-height:' + ((opts.height || 360) + 20) + 'px;overflow:auto;' : 'margin-top:10px;') + 'border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px 6px;background:rgba(255,255,255,.015)">' + det + '</div></div>' : body) +
        (S.notes.length ? '<div data-pc="notes" style="font-size:11px;color:#6b7280;margin-top:6px">' + S.notes.map(esc).join(' ') + '</div>' : '') +
        (S.first && S.lunaStrip && S.lunaStrip.length ? '<div style="font-size:11px;color:#6b7280;margin-top:2px">From ' + esc(S.first) + ' · the purple strip is LUNA’s price on the same days · drag the bar under the chart (or pinch / scroll on it) to zoom</div>' : S.first ? '<div style="font-size:11px;color:#6b7280;margin-top:2px">From ' + esc(S.first) + '</div>' : '');
      el.querySelectorAll('[data-pc-view]').forEach(function (b) { b.onclick = function () { st.view = b.getAttribute('data-pc-view'); if (opts.onState) opts.onState(st); draw(); }; });
      el.querySelectorAll('[data-pc-range]').forEach(function (b) { b.onclick = function () { st.range = Number(b.getAttribute('data-pc-range')); if (opts.onState) opts.onState(st); draw(); }; });
      el.querySelectorAll('[data-pc-lens]').forEach(function (b) { b.onclick = function () { st.lens = b.getAttribute('data-pc-lens'); if (opts.onState) opts.onState(st); draw(); }; });
      el.querySelectorAll('[data-pc-tmode]').forEach(function (b) { b.onclick = function () { st.tmode = b.getAttribute('data-pc-tmode'); if (opts.onState) opts.onState(st); draw(); }; });
      el.querySelectorAll('[data-pc-pick]').forEach(function (b) { b.onclick = function () { var sym = b.getAttribute('data-pc-pick'); var cur = (S.pick || []).slice(); var i = cur.indexOf(sym); if (i >= 0) cur.splice(i, 1); else { if (cur.length >= 5) cur.shift(); cur.push(sym); } st.pick = cur; if (opts.onState) opts.onState(st); if (opts.onNeedPrices) opts.onNeedPrices(cur); draw(); }; });
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
    if (typeof window !== 'undefined' && !el._pcResize) { el._pcResize = true; var rt = null; window.addEventListener('resize', function () { if (chart) chart.resize(); clearTimeout(rt); rt = setTimeout(draw, 250); }); }
    return { redraw: draw, state: st, update: function (d) { data = d; draw(); } };
  }

  return { VERSION: VERSION, VIEWS: VIEWS, RANGES: RANGES, COLORS: CAT, decodeRows: decodeRows, seriesFor: seriesFor, buildOption: buildOption, tableHtml: tableHtml, mount: mount };
});
