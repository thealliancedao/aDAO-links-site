/* =============================================================================
 * liondao/lib/ld.js 1.0.0 (2026-09-22) — THE LION DAO PAGE LIBRARY.
 * -----------------------------------------------------------------------------
 * Every Lion DAO page (liondao/dao_treasury.html, dao_tla_deposits.html, dao_unclaimed.html, validator.html,
 * ecosystem.html …) is a thin shell: header, this lib, a page script of a few hundred lines. The growing pain this
 * answers is aDAO's index.html (1.17 MB, every helper copied in place): here the loaders, the formatting, the
 * Unknown-with-a-reason chip, the wallet chips, the charts and the CSS live ONCE, so a page is what it shows.
 *
 * Laws honoured: the registry holds the literals (addresses, names, theme come from tenants.json via
 * CollectionContext; this file names none); every USD basis labeled (LD.basis); null-vs-0 (a null renders Unknown
 * with why, never 0); depth is a product (trends read the cron's daily series, never a page-side recompute);
 * a third party is never an input (their figures carry their label); every card says why.
 *
 *   LD.ready()               → { ctx, tenant, dao, theme applied }            (CollectionContext + theme knobs)
 *   LD.positions.current()   → dao-originations/<dao>/positions/current.json  (null when missing)
 *   LD.positions.series()    → …/positions/daily/index.json                   (the cron's daily rollup; null when missing)
 *   LD.positions.day(date)   → …/positions/daily/<date>.json
 *   LD.nap()                 → tla-core/network-and-prices/current.json
 *   LD.fmt.usd / num / big / pct / int / price / short / ago / date / luna
 *   LD.ui.unk(reason) · LD.ui.tile · LD.ui.stat · LD.ui.wallet · LD.ui.section · LD.ui.table · LD.ui.bar · LD.ui.pill
 *   LD.chart.line / .bars / .stacked (Chart.js, themed; every chart says its basis under it)
 *   LD.mount({ page, rev, revDate })  → header + footer, returns the ready() promise
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.1.0';
  var G = typeof globalThis !== 'undefined' ? globalThis : this;
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var DAOO = 'https://raw.githubusercontent.com/thealliancedao/dao-originations/main/';
  var NFTC = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';

  // ---------------------------------------------------------------- basics
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var sum = function (arr) { var t = 0, any = false; (arr || []).forEach(function (v) { if (isNum(v)) { t += v; any = true; } }); return any ? t : null; };
  var get = function (o, p) { var cur = o; var parts = String(p || '').split('.'); for (var i = 0; i < parts.length; i++) { if (cur == null) return null; cur = cur[parts[i]]; } return cur === undefined ? null : cur; };
  var fmt = {
    num: function (v, d) { if (!isNum(v)) return null; return v.toLocaleString(undefined, { maximumFractionDigits: d == null ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4) : d }); },
    int: function (v) { return isNum(v) ? Math.round(v).toLocaleString() : null; },
    usd: function (v, d) { if (!isNum(v)) return null; var a = Math.abs(v), s = v < 0 ? '−' : ''; if (a >= 1e6) return s + '$' + (a / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M'; return s + '$' + a.toLocaleString(undefined, { maximumFractionDigits: d == null ? (a >= 1000 ? 0 : 2) : d }); },
    usdFull: function (v) { if (!isNum(v)) return null; return (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 }); },
    big: function (v, d) { if (!isNum(v)) return null; var a = Math.abs(v), s = v < 0 ? '−' : ''; var f = function (x, u) { return s + x.toLocaleString(undefined, { maximumFractionDigits: d == null ? 2 : d }) + u; }; if (a >= 1e12) return f(a / 1e12, 'T'); if (a >= 1e9) return f(a / 1e9, 'B'); if (a >= 1e6) return f(a / 1e6, 'M'); if (a >= 1e3) return f(a / 1e3, 'K'); return s + a.toLocaleString(undefined, { maximumFractionDigits: d == null ? (a >= 1 ? 2 : 6) : d }); },
    pct: function (v, d) { if (!isNum(v)) return null; return (v > 0 ? '+' : '') + v.toLocaleString(undefined, { maximumFractionDigits: d == null ? 1 : d }) + '%'; },
    pctPlain: function (v, d) { if (!isNum(v)) return null; return v.toLocaleString(undefined, { maximumFractionDigits: d == null ? 1 : d }) + '%'; },
    price: function (v) { if (!isNum(v)) return null; if (v >= 1) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 }); if (v >= 0.01) return '$' + v.toFixed(4); if (v === 0) return '$0'; var e = Math.floor(Math.log10(v)); var z = -e - 1; var m = v * Math.pow(10, z + 1); return '$0.0' + ('₀₁₂₃₄₅₆₇₈₉'[Math.min(9, z)] || z) + Math.round(m * 100).toString().replace(/0+$/, '') ; },
    luna: function (v) { if (!isNum(v)) return null; return v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 0 : 2 }) + ' LUNA'; },
    short: function (a) { a = String(a || ''); return a.length > 16 ? a.slice(0, 10) + '…' + a.slice(-5) : a; },
    ago: function (iso) { if (!iso) return null; var h = (Date.now() - Date.parse(iso)) / 3.6e6; if (!isFinite(h)) return null; if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm ago'; if (h < 48) return Math.round(h) + 'h ago'; return Math.round(h / 24) + 'd ago'; },
    date: function (iso) { if (!iso) return null; var d = new Date(iso); return isNaN(d) ? null : d.toISOString().slice(0, 10); },
    signedUsd: function (v) { if (!isNum(v)) return null; return (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }); },
  };

  // ---------------------------------------------------------------- fetch
  function jsonFetch(url, opts) {
    opts = opts || {};
    var bust = opts.bust === false ? '' : (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Math.floor(Date.now() / (opts.ttlMs || 3e5));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null; var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 15000) : null;
    return fetch(url + bust, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) { if (timer) clearTimeout(timer); return r.ok ? r.json() : null; }).catch(function () { if (timer) clearTimeout(timer); return null; });
  }
  function lcdGet(hosts, path) { var i = 0; hosts = (hosts && hosts.length) ? hosts : []; function next() { if (i >= hosts.length) return Promise.resolve(null); var h = hosts[i++]; return jsonFetch(h + path, { bust: false, timeoutMs: 9000 }).then(function (r) { return r == null ? next() : r; }); } return next(); }
  function lcdPaged(hosts, path, key, maxPages) { var out = [], pages = 0; function step(nextKey) { var p = path + (path.indexOf('?') === -1 ? '?' : '&') + 'pagination.limit=500' + (nextKey ? '&pagination.key=' + encodeURIComponent(nextKey) : ''); return lcdGet(hosts, p).then(function (r) { if (!r) return pages ? out : null; out = out.concat(r[key] || []); pages++; var nk = r.pagination && r.pagination.next_key; return nk && pages < (maxPages || 6) ? step(nk) : out; }); } return step(null); }
  function smart(hosts, contract, query) { var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(query)))); return lcdGet(hosts, '/cosmwasm/wasm/v1/contract/' + contract + '/smart/' + b64).then(function (r) { return r ? r.data : null; }); }

  // ---------------------------------------------------------------- context (tenant + theme + the DAO folder)
  var M = { ctx: null, tenant: null, dao: null, lcd: [] };
  function applyTheme(t) {
    var th = t && t.theme || {}; var r = G.document.documentElement.style;
    var map = { accent: '--t-accent', accent2: '--t-accent2', bg: '--t-bg', surface: '--t-surface', surface2: '--t-surface2', text: '--t-text', border: '--t-border', font: '--t-font' };
    Object.keys(map).forEach(function (k) { if (th[k]) r.setProperty(map[k], th[k]); });
  }
  function ready() {
    if (M.readyP) return M.readyP;
    M.readyP = (G.CollectionContext ? G.CollectionContext.load().catch(function () { return null; }) : Promise.resolve(null)).then(function (ctx) {
      M.ctx = ctx || null; var t = ctx && ctx.tenant || null;
      // /liondao/… names the tenant on first paint (collection-context readFromLocation); this is a defensive fallback only
      if (!t && ctx && ctx.tenants && ctx.tenants.liondao) t = ctx.tenants.liondao;
      M.tenant = t; if (t) applyTheme(t);
      M.dao = t && Array.isArray(t.daos) && t.daos.length ? t.daos[0] : null;   // the DAO folder in dao-originations (registry, never a literal here)
      return M;
    });
    return M.readyP;
  }
  function daoRoot() { return DAOO + (M.dao || 'lion-dao') + '/positions/'; }
  var positions = {
    current: function () { return jsonFetch(daoRoot() + 'current.json'); },
    series: function () { return jsonFetch(daoRoot() + 'daily/index.json'); },
    day: function (date) { return jsonFetch(daoRoot() + 'daily/' + date + '.json', { timeoutMs: 20000 }); },
    // the series lists the days it has; without it (young product) probe backwards a few days so the page still finds what exists
    days: function () { return positions.series().then(function (s) { if (s && s.days) return Object.keys(s.days).sort(); var out = []; var probes = []; for (var i = 0; i < 14; i++) { var d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); probes.push(positions.day(d).then(function (dd) { return dd ? dd.capturedAt.slice(0, 10) : null; })); } return Promise.all(probes).then(function (r) { return r.filter(Boolean).sort(); }); }); },
  };
  function nap() { return jsonFetch(CORE + 'network-and-prices/current.json'); }
  function collection(slug, rel) { return jsonFetch(NFTC + slug + '/' + rel); }

  // ---------------------------------------------------------------- the positions product, read once, indexed
  // The wallet doc from ally-positions: { address, label, role, counts_as, portfolio{lp_positions, locks, pending_*, summary}, balances[], delegations, votion, nfts, credia, totals }
  function walletsOf(cur) { return cur && cur.wallets ? Object.keys(cur.wallets).map(function (a) { return cur.wallets[a]; }) : []; }
  var roleOrder = { treasury: 0, ops: 1, msig: 2, validator: 3 };
  function sortWallets(ws) { return ws.slice().sort(function (a, b) { return (roleOrder[a.role] - roleOrder[b.role]) || ((b.totals && b.totals.known_usd || 0) - (a.totals && a.totals.known_usd || 0)); }); }
  var basis = {
    tokens: 'USD at network-and-prices (the TLA pool price, CoinGecko where no pool prices it), matched by denom',
    tla: 'post-take at pool prices, the same engine every member portfolio runs',
    receipts: 'a compounder or Credia receipt held in a wallet is valued in its own section, never as a balance',
    theirs: 'phoenix.money is the council\'s reference view — their number, their date, beside ours',
  };

  // ---------------------------------------------------------------- UI primitives
  var CSS = [
    ':root{--ld-accent:var(--t-accent,#ffe600);--ld-accent2:var(--t-accent2,#f59e0b);--ld-surface:#161616;--ld-surface2:#111111;--ld-border:#262626;--ld-border-hi:#3a3a3a;--ld-radius:12px;--ld-text:var(--t-text,#e5e7eb);--ld-muted:#a3a3a3;--ld-dim:#737373;--ld-font:var(--t-font,"Press Start 2P",Inter,sans-serif);--ld-good:#7ee787;--ld-bad:#ff7b72}',
    'html,body{background:var(--t-bg,#0b0b0b)!important;color:var(--ld-text)}body{font-family:Inter,system-ui,sans-serif;margin:0;-webkit-font-smoothing:antialiased}.bg-mesh{display:none!important}',
    '.ld{max-width:1400px;margin:0 auto;padding:1.25rem 1rem 3rem}@media(min-width:1600px){.ld{max-width:1550px}}.ld *{box-sizing:border-box}.ld a{color:inherit}',
    '.ld-num{font-variant-numeric:tabular-nums}',
    '.ld-crumb{font-size:.78rem;color:var(--ld-muted);margin:0 0 .9rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.ld-crumb a{color:var(--ld-accent);text-decoration:none}.ld-crumb a:hover{text-decoration:underline}',
    '.ld-h{font-family:var(--ld-font);font-size:.7rem;color:var(--ld-accent);letter-spacing:.02em;margin:0 0 .9rem;padding-left:.75rem;border-left:3px solid var(--ld-accent);display:flex;align-items:baseline;gap:.75rem;flex-wrap:wrap;line-height:1.6}.ld-h small{font-family:Inter,sans-serif;font-size:.78rem;color:var(--ld-muted);letter-spacing:0}',
    '.ld-sec{margin:0 0 1.5rem}',
    '.ld-tile{background:linear-gradient(180deg,#191919,#141414);border:1px solid var(--ld-border);border-radius:var(--ld-radius);padding:1rem 1.1rem;min-width:0;box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 8px 24px -18px rgba(0,0,0,.9);position:relative;transition:border-color .15s,transform .15s}.ld-tile.ld-hard{border-color:var(--ld-border-hi)}.ld-tile.ld-link{cursor:pointer;text-decoration:none;display:block}.ld-link:hover{border-color:var(--ld-accent);transform:translateY(-2px)}.ld-link::after{content:"opens →";position:absolute;right:.9rem;bottom:.7rem;font-size:.66rem;color:var(--ld-dim)}.ld-link:hover::after{color:var(--ld-accent)}.ld-tile.ld-link:hover,.ld-tile.ld-link:focus-visible{border-color:var(--ld-accent)}',
    '.ld-k{font-size:.72rem;color:var(--ld-muted);margin:0 0 .3rem;text-transform:uppercase;letter-spacing:.06em;font-weight:500}.ld-v{font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:1.6rem;color:var(--ld-accent);line-height:1.15;letter-spacing:-.01em;font-variant-numeric:tabular-nums;word-break:break-word}.ld-v-sm{font-size:1.1rem}.ld-v.ld-v-sm{font-size:.8rem}.ld-v.ld-v-lg{font-size:2rem}.ld-s{font-size:.8rem;color:var(--ld-muted);margin-top:.45rem;line-height:1.45}.ld-src{font-size:.7rem;color:var(--ld-dim);margin-top:.5rem}',
    '.ld-unk{display:inline-block;font-family:Inter,system-ui,sans-serif;font-weight:600;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ld-muted);border:1px solid var(--ld-border-hi);border-radius:999px;padding:.22rem .55rem;line-height:1;cursor:help;vertical-align:middle}.ld-v .ld-unk{font-size:.75rem;padding:.3rem .7rem}',
    '.ld-chip{display:inline-block;font-size:.68rem;font-weight:600;color:#111;background:var(--ld-accent);padding:.12rem .5rem;border-radius:999px;line-height:1.5;white-space:nowrap}.ld-chip.ld-o{background:transparent;color:var(--ld-accent);border:1px solid var(--ld-accent)}.ld-chip.ld-g{background:transparent;color:var(--ld-muted);border:1px solid var(--ld-border)}',
    '.ld-grid{display:grid;gap:.9rem}.ld-g2{grid-template-columns:repeat(2,minmax(0,1fr))}.ld-g3{grid-template-columns:repeat(3,minmax(0,1fr))}.ld-g4{grid-template-columns:repeat(4,minmax(0,1fr))}.ld-g5{grid-template-columns:repeat(5,minmax(0,1fr))}.ld-g23{grid-template-columns:2fr 3fr}.ld-g32{grid-template-columns:3fr 2fr}',
    '@media(max-width:1100px){.ld-g5{grid-template-columns:repeat(3,minmax(0,1fr))}.ld-g4{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.ld-g5,.ld-g4,.ld-g3,.ld-g2,.ld-g23,.ld-g32{grid-template-columns:1fr}}',
    '.ld-hero{background:radial-gradient(90% 160% at 100% 50%,rgba(255,230,0,.12),transparent 60%),var(--ld-surface);border:1px solid var(--ld-border);border-left:4px solid var(--ld-accent);border-radius:var(--ld-radius);box-shadow:0 24px 70px -40px rgba(255,230,0,.4);padding:1.25rem 1.4rem;position:relative;overflow:hidden}.ld-hero-k{font-family:var(--ld-font);font-size:.6rem;color:var(--ld-accent);line-height:1.8}.ld-hero-v{font-family:Inter,system-ui,sans-serif;font-weight:800;font-size:2.6rem;color:#fff;line-height:1.15;letter-spacing:-.02em;margin:.3rem 0 .5rem;font-variant-numeric:tabular-nums}.ld-hero-l{font-size:.92rem;color:var(--ld-text);max-width:64ch;line-height:1.55}.ld-hero-s{font-size:.8rem;color:var(--ld-muted);margin-top:.6rem;line-height:1.6}@media(max-width:640px){.ld-hero-v{font-size:1.2rem}.ld-hero{padding:1rem 1.1rem}}',
    '.ld-mane{position:absolute;right:-4rem;top:50%;width:18rem;height:18rem;transform:translateY(-50%);background:repeating-conic-gradient(var(--ld-accent) 0 2.5deg,transparent 2.5deg 8deg);-webkit-mask:radial-gradient(circle,transparent 30%,#000 33%,#000 58%,transparent 66%);mask:radial-gradient(circle,transparent 30%,#000 33%,#000 58%,transparent 66%);opacity:.22;border-radius:50%;pointer-events:none}',
    // bars
    '.ld-bar{height:16px;background:#0a0a0a;border:1px solid var(--ld-border);border-radius:8px;display:flex;overflow:hidden;margin:.6rem 0 .5rem}.ld-bar span{display:block;height:100%;min-width:0}.ld-leg{display:flex;flex-wrap:wrap;gap:.3rem 1rem;font-size:.75rem;color:var(--ld-muted)}.ld-leg i{display:inline-block;width:10px;height:10px;margin-right:.35rem;vertical-align:-1px}',
    '.ld-stack{display:flex;flex-direction:column;gap:.5rem}.ld-stack-row{display:grid;grid-template-columns:11rem 1fr 7rem;gap:.75rem;align-items:center;font-size:.82rem}.ld-stack-row .ld-bar{margin:0}@media(max-width:640px){.ld-stack-row{grid-template-columns:1fr;gap:.25rem}}',
    // tables
    '.ld-tbl{width:100%;border-collapse:collapse;font-size:.84rem}.ld-tbl th{font-size:.7rem;font-weight:600;color:var(--ld-muted);text-align:left;padding:.45rem .5rem;border-bottom:2px solid var(--ld-border);white-space:nowrap}.ld-tbl td{padding:.5rem .5rem;border-bottom:1px solid var(--ld-border);vertical-align:top}.ld-tbl tr:last-child td{border-bottom:0}.ld-tbl .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ld-tbl tr.ld-dim td{color:var(--ld-dim)}.ld-tbl tr.ld-x{cursor:pointer}.ld-tbl tr.ld-x:hover td{background:rgba(255,230,0,.04)}.ld-tbl .ld-sub{font-size:.72rem;color:var(--ld-dim);display:block;margin-top:.15rem}',
    '.ld-wrap{overflow-x:auto}',
    '.ld-wal{display:inline-flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--ld-text);border:1px solid var(--ld-border-hi);border-radius:999px;padding:.18rem .6rem;white-space:nowrap;text-decoration:none}.ld-wal b{color:var(--ld-accent);font-weight:600}.ld-addr{display:inline-flex;align-items:center;gap:.25rem;white-space:nowrap;font-size:.8em}.ld-addr code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.95em;color:var(--ld-text);background:transparent}.ld-addr b{color:#fff}.ld-copy,.ld-go{background:none;border:0;padding:.05rem .2rem;color:var(--ld-dim);cursor:pointer;font-size:.85em;line-height:1;text-decoration:none}.ld-copy:hover,.ld-go:hover{color:var(--ld-accent)}.ld-copy.ld-copied{color:var(--ld-good)}.ld-copy.ld-copied::after{content:\'copied\';font-size:.7em;margin-left:.2rem;font-family:Inter,system-ui,sans-serif}.ld-wal:hover{border-color:var(--ld-accent)}',
    '.ld-role-treasury{--ld-w:#ffe600}.ld-role-ops{--ld-w:#f59e0b}.ld-role-msig{--ld-w:#7ee787}.ld-role-validator{--ld-w:#79c0ff}.ld-dot{display:inline-block;width:9px;height:9px;background:var(--ld-w,#888)}',
    '.ld-tabs{display:flex;flex-wrap:wrap;gap:.35rem;margin:0 0 .6rem}.ld-tab{font-size:.72rem;font-weight:600;padding:.25rem .6rem;border:1px solid var(--ld-border);background:transparent;color:var(--ld-muted);cursor:pointer;font-family:inherit}.ld-tab.on{background:var(--ld-accent);color:#111;border-color:var(--ld-accent)}.ld-tab:disabled{opacity:.5;cursor:not-allowed}',
    '.ld-note{font-size:.8rem;color:var(--ld-muted);padding:.75rem;border:1px dashed var(--ld-border);line-height:1.5}.ld-good{color:var(--ld-good)}.ld-center{text-align:center}.ld-more{font-size:.75rem;color:var(--ld-accent);background:none;border:0;cursor:pointer;padding:.6rem 0}.ld-bad{color:var(--ld-bad)}.ld-acc{color:var(--ld-accent)}',
    '.ld-details{border:2px solid var(--ld-border);background:var(--ld-surface2);margin-top:.6rem}.ld-details summary{cursor:pointer;padding:.55rem .8rem;font-size:.8rem;color:var(--ld-accent);list-style:none}.ld-details summary::-webkit-details-marker{display:none}.ld-details summary::before{content:"+ ";font-family:var(--ld-font);font-size:.6rem}.ld-details[open] summary::before{content:"− "}.ld-details>div{padding:.25rem .8rem .8rem}',
    '.ld-chart{position:relative;height:280px}.ld-chart.ld-chart-sm{height:190px}.ld-chart canvas{max-width:100%}',
    '.ld-btn{font-family:var(--ld-font);font-size:.58rem;color:#111;background:var(--ld-accent);border:0;padding:.55rem .7rem;cursor:pointer;line-height:1}.ld-btn.ld-o{background:transparent;color:var(--ld-accent);border:2px solid var(--ld-accent)}',
    'select.ld-sel{background:var(--ld-surface2);color:#fff;border:1px solid var(--ld-border);padding:.3rem .5rem;font-size:.78rem;font-family:inherit}',
    ':focus-visible{outline:2px solid var(--ld-accent);outline-offset:2px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}',
  ].join('\n');
  function ensureCss() { if (G.document && !G.document.getElementById('ld-css')) { var st = G.document.createElement('style'); st.id = 'ld-css'; st.textContent = CSS; G.document.head.appendChild(st); } }

  var ui = {
    unk: function (reason) { return '<span class="ld-unk" title="' + esc(reason || 'no source yet') + '">Coming</span>'; },   // 1.0.1 (owner): the chip says Coming; the reason stays on hover
    v: function (v, f, reason) { if (v == null) return ui.unk(reason); var s = f ? f(v) : String(v); return s == null ? ui.unk(reason) : esc(s); },
    chip: function (label, kind) { return '<span class="ld-chip' + (kind ? ' ld-' + kind : '') + '">' + esc(label) + '</span>'; },
    // a stat tile: label, value (formatted or Unknown), sub line, source line, optional href → a full page
    stat: function (o) { var inner = '<div class="ld-k">' + esc(o.label) + '</div><div class="ld-v' + (o.size === 'lg' ? ' ld-v-lg' : (o.value != null && String(o.value).length > 12 ? ' ld-v-sm' : '')) + '">' + (o.value == null ? ui.unk(o.reason) : esc(o.value)) + '</div>' + (o.sub ? '<div class="ld-s">' + o.sub + '</div>' : '') + (o.source_html ? '<div class="ld-src">' + o.source_html + '</div>' : o.source ? '<div class="ld-src">' + esc(o.source) + '</div>' : '');   /* 1.0.2: source_html for a source that carries an addr component (never inside a tile that is itself a link) */ return o.href ? '<a class="ld-tile ld-link' + (o.hard ? ' ld-hard' : '') + '" href="' + esc(o.href) + '">' + inner + '</a>' : '<div class="ld-tile' + (o.hard ? ' ld-hard' : '') + '">' + inner + '</div>'; },
    section: function (title, sub, body, id) { return '<section class="ld-sec"' + (id ? ' id="' + esc(id) + '"' : '') + '><div class="ld-h">' + esc(title) + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + body + '</section>'; },
    // 1.0.2 (owner): EVERY address is copy-and-go — short form · copy (clipboard, "copied" flash) · search it (address catalog) · the
    //   explorer (Chainscope for terra, Solscan for solana). The full address is the title and the copy payload. Delegated handler in mount().
    addr: function (a, opts) { opts = opts || {}; if (!a) return ''; var sol = opts.chain === 'solana' || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && a.indexOf('terra') !== 0; var ex = sol ? 'https://solscan.io/account/' + encodeURIComponent(a) : 'https://chainsco.pe/terra2/address/' + a; var search = sol ? null : '/address-catalog.html?address=' + encodeURIComponent(a);
      return '<span class="ld-addr" title="' + esc(a) + '">' + (opts.label ? '<b>' + esc(opts.label) + '</b> ' : '') + '<code>' + esc(opts.full ? a : fmt.short(a)) + '</code><button type="button" class="ld-copy" data-copy="' + esc(a) + '" title="copy the full address" aria-label="copy"><i class="fa-regular fa-copy"></i></button>' + (search ? '<a class="ld-go" href="' + esc(search) + '" title="search this address on the site"><i class="fa-solid fa-magnifying-glass"></i></a>' : '') + '<a class="ld-go" href="' + esc(ex) + '" target="_blank" rel="noopener" title="' + (sol ? 'Solscan' : 'Chainscope') + '"><i class="fa-solid fa-arrow-up-right-from-square"></i></a></span>'; },
    wallet: function (w, opts) { opts = opts || {}; var a = w.address || w; var label = w.label || fmt.short(a); var role = w.role || ''; return '<span class="ld-wal ld-role-' + esc(role) + '" title="' + esc(a) + '"><span class="ld-dot"></span><b>' + esc(label) + '</b>' + (opts.role !== false && role ? '<span style="color:var(--ld-dim)">' + esc(role) + '</span>' : '') + ' ' + ui.addr(a, { chain: opts.chain }) + '</span>'; },
    // a horizontal bar of parts [{label, v, color}] — the parts say what they are; a null part is listed, never drawn
    bar: function (parts, opts) { opts = opts || {}; var known = parts.filter(function (p) { return isNum(p.v) && p.v > 0; }); var tot = sum(known.map(function (p) { return p.v; })) || 0; var f = opts.fmt || fmt.usd; var bar = '<div class="ld-bar" role="img" aria-label="' + esc(opts.label || '') + '">' + known.map(function (p) { return '<span style="width:' + (tot ? p.v / tot * 100 : 0) + '%;background:' + p.color + '" title="' + esc(p.label + ' ' + (f(p.v) || '')) + '"></span>'; }).join('') + '</div>'; if (opts.legend === false) return bar; return bar + '<div class="ld-leg">' + parts.map(function (p) { return '<span><i style="background:' + p.color + '"></i>' + esc(p.label) + ' <b style="color:#fff">' + (isNum(p.v) ? esc(f(p.v)) : ui.unk(p.reason)) + '</b>' + (isNum(p.v) && tot ? ' <span style="color:var(--ld-dim)">' + (p.v / tot * 100).toFixed(0) + '%</span>' : '') + '</span>'; }).join('') + '</div>'; },
    table: function (cols, rows, opts) { opts = opts || {}; return '<div class="ld-wrap"><table class="ld-tbl">' + '<thead><tr>' + cols.map(function (c) { return '<th' + (c.r ? ' class="r"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + cols.length + '"><div class="ld-note">' + esc(opts.empty || 'nothing to show') + '</div></td></tr>') + '</tbody></table></div>'; },
    td: function (v, r, cls) { return '<td' + ((r ? ' class="r' : ' class="') + (cls ? ' ' + cls : '') + '"') + '>' + (v == null ? '' : v) + '</td>'; },
    details: function (summary, body, open) { return '<details class="ld-details"' + (open ? ' open' : '') + '><summary>' + summary + '</summary><div>' + body + '</div></details>'; },
    note: function (html) { return '<div class="ld-note">' + html + '</div>'; },
    crumb: function (items) { return '<div class="ld-crumb">' + items.map(function (it, i) { return (i ? '<span style="color:var(--ld-dim)">/</span>' : '') + (it.href ? '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>' : '<span>' + esc(it.label) + '</span>'); }).join('') + '</div>'; },
    delta: function (v, f) { if (!isNum(v)) return ui.unk('no prior day'); var s = (f || fmt.signedUsd)(v); return '<span class="' + (v > 0 ? 'ld-good' : v < 0 ? 'ld-bad' : '') + ' ld-num">' + esc(s) + '</span>'; },
    when: function (iso) { return iso ? '<span title="' + esc(iso) + '">' + esc(fmt.ago(iso)) + '</span>' : ui.unk('no timestamp'); },
  };

  // ---------------------------------------------------------------- charts (Chart.js, themed)
  var PALETTE = ['#ffe600', '#f59e0b', '#7ee787', '#79c0ff', '#ff7b72', '#d2a8ff', '#a3a3a3', '#f78166', '#56d364', '#e3b341'];
  function chartBase(opts) { var C = G.Chart; if (!C) return null; C.defaults.color = '#a3a3a3'; C.defaults.borderColor = 'rgba(255,230,0,.12)'; C.defaults.font.family = 'Inter, system-ui, sans-serif'; C.defaults.font.size = 11; return C; }
  var charts = {};
  function mk(id, cfg) { var C = chartBase(); if (!C) return null; var el = G.document.getElementById(id); if (!el) return null; if (charts[id]) { charts[id].destroy(); delete charts[id]; } charts[id] = new C(el.getContext('2d'), cfg); return charts[id]; }
  var chart = {
    palette: PALETTE,
    // series: [{label, data:[{x:'YYYY-MM-DD', y}], color?, fill?}]
    line: function (id, series, o) { o = o || {}; var f = o.fmt || fmt.usd; return mk(id, { type: 'line', data: { datasets: series.map(function (s, i) { var c = s.color || PALETTE[i % PALETTE.length]; return { label: s.label, data: s.data, borderColor: c, backgroundColor: c + '22', fill: s.fill == null ? i === 0 : s.fill, tension: .25, pointRadius: s.data.length > 40 ? 0 : 3, pointHoverRadius: 5, borderWidth: 2, spanGaps: true, yAxisID: s.axis || 'y' }; }) }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: series.length > 1, labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (c.dataset.yAxisID === 'y1' && o.fmt1 ? o.fmt1(c.parsed.y) : f(c.parsed.y)); } } } }, scales: { x: { type: 'category', grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { position: 'left', ticks: { callback: function (v) { return f(v); } }, grid: { color: 'rgba(255,230,0,.08)' }, beginAtZero: !!o.zero }, y1: o.fmt1 ? { position: 'right', ticks: { callback: function (v) { return o.fmt1(v); } }, grid: { display: false } } : { display: false } } } }); },
    bars: function (id, labels, series, o) { o = o || {}; var f = o.fmt || fmt.usd; return mk(id, { type: 'bar', data: { labels: labels, datasets: series.map(function (s, i) { return { label: s.label, data: s.data, backgroundColor: s.color || PALETTE[i % PALETTE.length], borderWidth: 0, stack: o.stacked ? 'a' : undefined }; }) }, options: { indexAxis: o.horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: series.length > 1, labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + f(o.horizontal ? c.parsed.x : c.parsed.y); } } } }, scales: { x: { stacked: !!o.stacked, grid: { display: !o.horizontal ? false : true, color: 'rgba(255,230,0,.08)' }, ticks: o.horizontal ? { callback: function (v) { return f(v); } } : {} }, y: { stacked: !!o.stacked, grid: { color: o.horizontal ? 'transparent' : 'rgba(255,230,0,.08)' }, ticks: o.horizontal ? {} : { callback: function (v) { return f(v); } }, beginAtZero: true } } } }); },
    destroy: function (id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } },
  };

  // ---------------------------------------------------------------- What Changed between two captured docs (same shape as current.json)
  // Market movement (price moved, amount held) vs organic change (amount moved at today's price) per priced balance row and TLA total.
  // No "DAO actions" split yet: the positions product does not carry proposals — the page says so instead of guessing.
  function whatChanged(a, b) {
    if (!a || !b) return null;
    var rowsA = {}, rowsB = {};
    var key = function (w, r) { return w.address + '|' + r.denom; };
    walletsOf(a).forEach(function (w) { (w.balances || []).forEach(function (r) { if (isNum(r.usd_value)) rowsA[key(w, r)] = { w: w, r: r }; }); });
    walletsOf(b).forEach(function (w) { (w.balances || []).forEach(function (r) { if (isNum(r.usd_value)) rowsB[key(w, r)] = { w: w, r: r }; }); });
    var market = 0, organic = 0, rows = [];
    Object.keys(rowsB).forEach(function (k) { var B = rowsB[k], A = rowsA[k]; var pa = A ? A.r.price_usd : B.r.price_usd, pb = B.r.price_usd; var qa = A ? A.r.amount_human : 0, qb = B.r.amount_human; var m = qa * (pb - pa), o = (qb - qa) * pb; market += m; organic += o; rows.push({ wallet: B.w.label, symbol: B.r.symbol || B.r.denom, qa: qa, qb: qb, pa: pa, pb: pb, market: m, organic: o, usd_b: B.r.usd_value, usd_a: A ? A.r.usd_value : 0 }); });
    Object.keys(rowsA).forEach(function (k) { if (rowsB[k]) return; var A = rowsA[k]; organic -= A.r.usd_value; rows.push({ wallet: A.w.label, symbol: A.r.symbol || A.r.denom, qa: A.r.amount_human, qb: 0, pa: A.r.price_usd, pb: A.r.price_usd, market: 0, organic: -A.r.usd_value, usd_b: 0, usd_a: A.r.usd_value }); });
    var tlaA = get(a, 'rollup.dao.tla_usd'), tlaB = get(b, 'rollup.dao.tla_usd'), tlaD = isNum(tlaA) && isNum(tlaB) ? tlaB - tlaA : null;
    var crA = get(a, 'rollup.dao.credia_collateral_usd'), crB = get(b, 'rollup.dao.credia_collateral_usd'), crD = isNum(crA) && isNum(crB) ? crB - crA : null;
    var knownA = get(a, 'rollup.dao.known_usd'), knownB = get(b, 'rollup.dao.known_usd');
    rows.sort(function (x, y) { return Math.abs(y.market + y.organic) - Math.abs(x.market + x.organic); });
    return { from: a.capturedAt, to: b.capturedAt, market: market, organic: organic, tla_delta: tlaD, credia_delta: crD, net: isNum(knownA) && isNum(knownB) ? knownB - knownA : null, known_from: knownA, known_to: knownB, rows: rows,
      note: 'balances split into price movement (amount held × price change) and amount movement (amount change × today\'s price); TLA and Credia move as totals — the positions product does not split them by cause yet, and DAO proposals are not joined, so "DAO actions" is not a separate line here' };
  }

  // ---------------------------------------------------------------- mount
  function mount(o) {
    ensureCss();
    if (G.SiteHeader) G.SiteHeader.mount({ page: o.page || 'liondao', home: 'liondao', mobileTabs: false });
    if (G.SiteFooter) G.SiteFooter.mount({ rev: o.rev, revDate: o.revDate, page: o.page || 'liondao' });
    var revEl = G.document.getElementById('page-rev'); if (revEl) revEl.textContent = 'Rev ' + o.rev + ' · ' + o.revDate;
    if (!G.document.__ldCopyWired) { G.document.__ldCopyWired = true; G.document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('.ld-copy'); if (!b) return; ev.preventDefault(); ev.stopPropagation(); var v = b.getAttribute('data-copy') || ''; var done = function () { b.classList.add('ld-copied'); setTimeout(function () { b.classList.remove('ld-copied'); }, 1400); }; if (G.navigator && G.navigator.clipboard && G.navigator.clipboard.writeText) G.navigator.clipboard.writeText(v).then(done, function () { LD._copyFallback(v); done(); }); else { LD._copyFallback(v); done(); } }); }
    return ready();
  }
  function copyFallback(v) { try { var ta = G.document.createElement('textarea'); ta.value = v; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; G.document.body.appendChild(ta); ta.select(); G.document.execCommand('copy'); G.document.body.removeChild(ta); } catch (e) { } }
  return { VERSION: VERSION, ready: ready, mount: mount, _copyFallback: copyFallback, positions: positions, nap: nap, collection: collection, lcd: { get: lcdGet, paged: lcdPaged, smart: smart }, jsonFetch: jsonFetch,
    fmt: fmt, ui: ui, chart: chart, basis: basis, walletsOf: walletsOf, sortWallets: sortWallets, whatChanged: whatChanged, sum: sum, get: get, isNum: isNum, esc: esc, CSS: CSS, _M: M, CORE: CORE, DAOO: DAOO, NFTC: NFTC };
});
