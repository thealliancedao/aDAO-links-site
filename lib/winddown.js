/* =============================================================================
 * lib/winddown.js 1.0.0 (2026-09-27) — ONE place that says "this asset is going away".
 * Every page that shows a pool or a balance holding a winding-down asset (today: Noble USDC, USDC.n / USDC.nbl → USDC.inj)
 * asks this lib, so the flag, the words and the migration link are the same on the home page, TLA Stats, the app, the aDAO
 * deposits page, the Lion DAO pages and the portfolio.
 * -----------------------------------------------------------------------------
 * Source of truth: tla-core/docs/curated/alerts.json (kind "asset", status "migrating" | "winding_down") — curated upstream, once.
 * Pool coverage: lp-grades/snapshots/current.json stamps the same alert on every gauge whose pool holds the denom (derived from the
 * token-catalog underlyings, not from pool names — "LUNA-USDC" is Noble USDC too, the venue's spelling is not the identity).
 * Positions: an LP or a balance is flagged by its DENOM / catalog SYMBOL (the leg), or by its gauge id when no legs are given.
 * Dust never flags: a leg worth less than MIN_USD is a leftover, not a position (blank beats phantom).
 * Pure core (build) + a tiny fetcher (load) + two renderers (pill, banner) with inline styles so any page can use them.
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Winddown = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.0.1';   // 1.0.1 (2026-10-05, owner): the home notice shows the deadline date, not a day count
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var URLS = { alerts: CORE + 'docs/curated/alerts.json', grades: CORE + 'lp-grades/snapshots/current.json' };
  var ACTIVE = ['migrating', 'winding_down'];
  var MIN_USD = 1;

  function bare(d) { return String(d == null ? '' : d).replace(/^(native|cw20):/, ''); }
  function num(x) { var n = typeof x === 'string' ? parseFloat(x) : x; return typeof n === 'number' && isFinite(n) ? n : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // the pure core: alerts doc (+ optional lp-grades doc) → a resolver
  function build(alertsDoc, gradesDoc) {
    var alerts = ((alertsDoc && alertsDoc.alerts) || []).filter(function (a) { return a && a.kind === 'asset' && ACTIVE.indexOf(a.status) >= 0; });
    var byDenom = {}, bySym = {}, byPool = {};
    alerts.forEach(function (a) {
      if (a.denom) byDenom[bare(a.denom)] = a;
      if (a.symbol) bySym[String(a.symbol).toUpperCase()] = a;
      (a.aliases || []).forEach(function (s) { bySym[String(s).toUpperCase()] = a; });
    });
    ((gradesDoc && gradesDoc.pools) || []).forEach(function (p) {
      var a = (p.alerts || []).filter(function (x) { return x.kind === 'asset' && ACTIVE.indexOf(x.status) >= 0; })[0];
      if (!a) return;
      var full = alerts.filter(function (x) { return x.id === a.id; })[0] || a;   // the registry's entry carries the links + dates
      [p.gauge_pool_id, bare(p.gauge_pool_id), p.lp_address, p.pool_address].forEach(function (k) { if (k) byPool[k] = full; });
    });
    var W = {
      alerts: alerts,
      forDenom: function (d) { return byDenom[bare(d)] || null; },
      forSymbol: function (s) { return s ? (bySym[String(s).toUpperCase()] || null) : null; },
      forAsset: function (x) {   // a denom, a symbol, or a row carrying denom / symbol
        if (x == null) return null;
        if (typeof x === 'string') return W.forDenom(x) || W.forSymbol(x);
        return W.forDenom(x.denom || (x.info && (x.info.native || x.info.cw20)) || '') || W.forSymbol(x.symbol || x.asset_symbol);
      },
      forPool: function (id) { return id ? (byPool[id] || byPool[bare(id)] || null) : null; },
      // an LP position → { alert, usd, amount, symbol } when its winding leg is worth ≥ MIN_USD (or, with no legs, its gauge is flagged
      // and the position is worth ≥ MIN_USD); null otherwise
      forLp: function (lp) {
        if (!lp) return null;
        var legs = lp.underlying_token_amounts || lp.underlying || null;
        if (legs && legs.length) {
          for (var i = 0; i < legs.length; i++) {
            var a = W.forAsset(legs[i]); if (!a) continue;
            var usd = num(legs[i].usd_value), amt = num(legs[i].amount_human);
            var v = usd != null ? usd : amt;
            if (v != null && v >= MIN_USD) return { alert: a, usd: usd, amount: amt, symbol: legs[i].symbol || a.symbol };
          }
          return null;
        }
        var pa = W.forPool(lp.pool_gauge_id || lp.gauge_pool_id || lp.lp_address || lp.pool_address);
        var pv = num([lp.usd_value, lp.value_usd, lp.user_usd, lp.estimated_position_usd].filter(function (v) { return v != null; })[0]);
        return pa && pv != null && pv >= MIN_USD ? { alert: pa, usd: null, amount: null, symbol: pa.symbol, whole_usd: pv } : null;
      },
      forBalance: function (b) {
        if (!b) return null; var a = W.forAsset(b); if (!a) return null;
        var usd = num(b.usd_value), amt = num(b.amount_human); var v = usd != null ? usd : amt;
        return v != null && v >= MIN_USD ? { alert: a, usd: usd, amount: amt, symbol: b.symbol || a.symbol } : null;
      },
      // every hit across LPs + balances, rolled up per alert: [{ alert, usd, n, lps, balances }]
      scan: function (o) {
        var out = {};
        function add(h, kind) { if (!h) return; var k = h.alert.id; var r = out[k] || (out[k] = { alert: h.alert, usd: 0, n: 0, lps: 0, balances: 0 }); r.n++; r[kind]++; r.usd += (h.usd != null ? h.usd : (h.amount || 0)); }
        ((o && o.lps) || []).forEach(function (l) { add(W.forLp(l), 'lps'); });
        ((o && o.balances) || []).forEach(function (b) { add(W.forBalance(b), 'balances'); });
        return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return b.usd - a.usd; });
      }
    };
    return W;
  }

  var _p = null, _w = null;
  function load(opts) {
    if (_p && !(opts && opts.fresh)) return _p;
    var f = (opts && opts.fetch) || (typeof fetch === 'function' ? fetch : null);
    var get = function (u) { return f ? f(u, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null); };
    _p = Promise.all([get(URLS.alerts), (opts && opts.grades) ? Promise.resolve(opts.grades) : get(URLS.grades)]).then(function (r) { _w = build(r[0], r[1]); return _w; });
    return _p;
  }

  function daysLeft(a, now) { var d = a && a.deadline ? Date.parse(a.deadline + 'T23:59:59Z') : NaN; if (!isFinite(d)) return null; return Math.ceil((d - (now || Date.now())) / 86400000); }
  function howUrl(a) { var l = (a && a.links) || []; var m = l.filter(function (x) { return /manual|step/i.test(x.label || ''); })[0] || l[0]; return (m && m.url) || (a && a.source_url) || '#'; }
  function toSym(a) { return (a && a.replacement && a.replacement.symbol) || 'the replacement'; }
  function fmtDate(iso) { var d = new Date(iso + 'T12:00:00Z'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function usd(x) { return x == null ? '' : '$' + (x >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(x >= 100 ? 0 : 2)); }

  // a small amber pill for a row: "USDC.n ending · move by Oct 31" → the migration guide
  function pill(a, o) {
    if (!a) return ''; o = o || {};
    var txt = (o.short ? (a.symbol || 'asset') + ' ending' : (a.symbol || 'asset') + ' ending' + (a.deadline ? ' · move by ' + fmtDate(a.deadline) : ''));
    return '<a class="wd-pill" href="' + esc(howUrl(a)) + '" target="_blank" rel="noopener" title="' + esc((a.headline || '') + (a.action ? ' — ' + a.action : '')) + '" ' +
      'style="display:inline-flex;align-items:center;gap:.3em;margin-left:.35em;padding:.05em .5em;border-radius:999px;font-size:.72em;font-weight:600;line-height:1.5;white-space:nowrap;vertical-align:middle;text-decoration:none;background:rgba(245,158,11,.15);color:#fcd34d;border:1px solid rgba(245,158,11,.45)">' +
      '&#9888; ' + esc(txt) + '</a>';
  }

  // a banner for a wallet / treasury that holds it: one line of what, one line of what to do, two links
  function banner(hit, o) {
    if (!hit || !hit.alert) return ''; o = o || {}; var a = hit.alert; var dl = daysLeft(a, o.now);
    var who = o.who || 'This wallet';
    var held = (hit.usd ? usd(hit.usd) + ' of ' : '') + esc(a.symbol || 'this asset') + (hit.n ? ' in ' + hit.n + ' place' + (hit.n === 1 ? '' : 's') : '');
    var when = a.deadline ? (dl != null && dl >= 0 ? 'by ' + fmtDate(a.deadline) + ' (' + dl + ' day' + (dl === 1 ? '' : 's') + ')' : 'now — the ' + fmtDate(a.deadline) + ' step-down has started') : '';
    var links = (a.links || []).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener" style="color:#fcd34d;text-decoration:underline">' + esc(l.label) + '</a>'; }).join(' &middot; ');
    return '<div class="wd-banner" role="note" style="margin:.6em 0;padding:.7em .9em;border-radius:12px;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.45);color:#fde68a;font-size:.9em;line-height:1.45">' +
      '<div style="font-weight:700;color:#fcd34d">&#9888; ' + esc(who) + ' holds ' + held + ' &mdash; it is being wound down</div>' +
      '<div>Move it to ' + esc(toSym(a)) + ' ' + when + '. Anything left in a pool at Circle\'s ' + (a.dates && a.dates.snapshot ? fmtDate(a.dates.snapshot) : '') + ' snapshot does not qualify for redemption.</div>' +
      (links ? '<div style="margin-top:.3em;font-size:.92em">' + links + '</div>' : '') + '</div>';
  }

  // a one-line notice for a page that lists no positions (the home page): what is ending, by when, how many TLA pools, the guide
  function notice(a, o) {
    if (!a) return ''; o = o || {}; var dl = daysLeft(a, o.now);
    var pools = o.pools != null ? o.pools : null;
    return '<div class="wd-notice" role="note" style="display:flex;flex-wrap:wrap;align-items:center;gap:.35em .8em;margin:0 0 .75em;padding:.55em .8em;border-radius:10px;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.4);color:#fde68a;font-size:.85em;line-height:1.4">' +
      '<b style="color:#fcd34d">&#9888; ' + esc(a.symbol || 'An asset') + ' is ending</b>' +
      '<span>Move to ' + esc(toSym(a)) + (a.deadline ? ' by ' + fmtDate(a.deadline) : '') + (pools ? ' &middot; ' + pools + ' TLA pool' + (pools === 1 ? '' : 's') + ' hold it' : '') + '</span>' +
      '<a href="' + esc(howUrl(a)) + '" target="_blank" rel="noopener" style="color:#fcd34d;text-decoration:underline;margin-left:auto">How to migrate &rarr;</a></div>';
  }
  // how many lp-grades gauges carry this alert (for the notice)
  function poolCount(gradesDoc, a) { return ((gradesDoc && gradesDoc.pools) || []).filter(function (p) { return (p.alerts || []).some(function (x) { return x.id === a.id; }); }).length; }

  return { VERSION: VERSION, URLS: URLS, MIN_USD: MIN_USD, build: build, load: load, pill: pill, banner: banner, notice: notice, poolCount: poolCount, daysLeft: daysLeft, howUrl: howUrl,
    get ready() { return _w; } };
});
