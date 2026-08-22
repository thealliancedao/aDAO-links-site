/* =============================================================================
 * lib/site-header.js — ONE header for every page (2026-08-21, SPEC-unified-header §3)
 * -----------------------------------------------------------------------------
 * Renders the index.html header (logo · Home · NFT Explorer · TLA Stats ·
 * aDAO Lore · DAO · Terra globe) in the TLA Stats theme (deep #0a0b0f base,
 * cyan accent, Outfit) on any page — including pages that load no Tailwind
 * (transparency-hub). All styles are namespaced `sh-*` and injected once, so a
 * host page's CSS cannot fight it and it cannot fight the host.
 *
 * Mobile: ONE pattern everywhere — the lib renders the fixed bottom tab bar
 * (the index.html design) on every page and retires any page-level
 * .mobile-bottom-nav. No top icon row. The help bubble is lifted above the bar.
 *
 * Under the tab row sits a centered ADDRESS ROW: a label ("Viewing") and the
 * `#sh-picker` slot where lib/address-picker.js mounts the global picker. It
 * is the one place on every page to choose whose data you're looking at. The
 * row is hidden until a picker mounts into it (pages without one lose nothing).
 *
 * TICKER (uniform-chrome, 2026-08-21): every page gets the same CoinGecko price
 * marquee under the address row (the one index.html had). The widget script is
 * loaded once; pages that already render their own ticker pass `ticker:false`.
 *
 * SUB-NAV: pages with in-page tabs render them via SiteHeader.subnav(items) so
 * they sit in the same spot, same style (the TLA Stats tab look), on every page.
 *
 * USAGE:
 *   <div id="site-header"></div>
 *   <script src="/lib/site-header.js"></script>
 *   <script>SiteHeader.mount({ page: 'transparency-hub' });</script>
 * Options: page (data-page of the active tab; sub-pages map via PAGE_GROUP),
 *          mobileTabs (default true), container (default '#site-header').
 * ============================================================================= */
(function (root, doc) {
  'use strict';

  var TABS = [
    { href: 'index.html',              page: 'index',              label: 'Home',         short: 'Home', icon: 'fa-house' },
    { href: 'nft-explorer-index.html', page: 'nft-explorer-index', label: 'NFT Explorer', short: 'NFTs', icon: 'fa-images' },
    { href: 'tla-stats.html',          page: 'tla-stats',          label: 'TLA Stats',    short: 'TLA',  icon: 'fa-chart-line' },
    { href: 'adao-lore.html',          page: 'adao-lore',          label: 'aDAO Lore',    short: 'Lore', icon: 'fa-globe' },
    { href: 'dao.html',                page: 'dao',                label: 'DAO',          short: 'DAO',  icon: 'fa-landmark' },
  ];
  // Sub-pages light the tab of the section they belong to.
  var PAGE_GROUP = {
    'member-portfolio': 'tla-stats', 'slippage': 'tla-stats', 'tla-docs': 'tla-stats',
    'tla-catalog': 'tla-stats', 'tla-chain-queries': 'tla-stats',
    'dao_treasury': 'dao', 'dao_tla_deposits': 'dao', 'dao_governance_tool': 'dao',
    'transparency-hub': 'index', 'help': 'index', 'tools': 'index', 'tutorials': 'index',
    'links': 'index', 'alliances': 'index', 'release-history': 'index', 'rarity-explained': 'nft-explorer-index',
  };

  var CSS = [
    '#site-header,#site-subnav{font-size:16px;line-height:1.4}',
    '#site-header{font-family:Outfit,system-ui,sans-serif;background:rgba(10,11,15,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06);position:relative;z-index:40}',
    '.sh-wrap{max-width:80em;margin:0 auto;padding:.85em 1em;display:flex;align-items:center;justify-content:space-between;gap:.75em}',
    '@media(min-width:1024px){.sh-wrap{padding:1em 2em}}',
    '.sh-logo{flex:0 0 auto;display:flex;align-items:center}',
    '.sh-logo img{height:3em;width:auto;display:block}',
    '@media(min-width:768px){.sh-logo img{height:3.25em}}',
    '.sh-nav{display:none;flex:1;justify-content:center;align-items:center;gap:.5em}',
    '@media(min-width:768px){.sh-nav{display:flex}}',
    '.sh-tab{min-width:140px;height:3.25em;display:inline-flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;color:#fff;font-weight:700;font-size:1em;padding:0 1em;border-radius:.5em;background:rgba(31,41,55,.5);border:1px solid #374151;box-shadow:0 10px 15px -3px rgba(0,0,0,.3);transition:transform .15s,background .15s;white-space:nowrap}',
    '.sh-tab:hover{background:rgba(55,65,81,.8);transform:scale(1.05)}',
    '.sh-tab.active{background:rgba(34,211,238,.15);color:#67e8f9;border-color:rgba(34,211,238,.6)}',
    '.sh-tab.active:hover{background:rgba(34,211,238,.2)}',
    '.sh-tab:focus-visible{outline:2px solid #67e8f9;outline-offset:2px}',
    '.sh-right{flex:0 0 auto;display:flex;align-items:center;gap:.75em}',
    '.sh-pickrow{display:none;justify-content:center;align-items:center;gap:.75em;padding:.15em 1em .8em;flex-wrap:wrap}',
    '.sh-pickrow.has{display:flex}',
    '.sh-pickrow .sh-plabel{font-size:.72em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#67e8f9;display:inline-flex;align-items:center;gap:.4em;white-space:nowrap}',
    '.sh-pickrow .sh-plabel i{font-size:.7em;opacity:.8}',
    '.sh-pickrow .sh-phint{font-size:.7em;color:#64748b;white-space:nowrap}',
    '.sh-pickrow .ap-pill{min-width:22em;max-width:40em;flex:1 1 22em;height:2.7em}',
    '@media(max-width:767px){.sh-pickrow{padding:.1em .75em .7em}.sh-pickrow .sh-phint{display:none}.sh-pickrow .ap-pill{min-width:0;max-width:none;flex:1 1 100%}}',
    '.sh-globe img{height:3em;width:auto;display:block}',
    '@media(min-width:768px){.sh-globe img{height:3.25em}}',
    '.sh-bottom{display:none}',
    '@media(max-width:767px){.sh-bottom{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;bottom:0;left:0;right:0;z-index:50;background:rgba(10,11,15,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid rgba(34,211,238,.2);padding:.4em .25em calc(.4em + env(safe-area-inset-bottom)) .25em;gap:.15em;font-size:16px}',
    '.sh-btab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15em;padding:.4em .2em;color:#9ca3af;text-decoration:none;font-size:.65em;font-weight:600;line-height:1;border-radius:.5em;min-height:48px}',
    '.sh-btab i{font-size:1.7em;color:#6b7280}',
    '.sh-btab.active{color:#22d3ee;background:rgba(34,211,238,.08)}.sh-btab.active i{color:#22d3ee}',
    '.mobile-bottom-nav{display:none!important}',
    'body{padding-bottom:calc(76px + env(safe-area-inset-bottom))!important}',
    '#help-bubble{bottom:calc(78px + env(safe-area-inset-bottom))!important}',
    '.sh-subnav.empty{display:none}}',
    '.sh-ticker{border-top:1px solid rgba(255,255,255,.05);padding:.35em 0;min-height:44px;--gecko-widget-height:36px}',
    '.sh-ticker gecko-coin-price-marquee-widget::part(card){padding:.25em .5em!important}',
    '@media(max-width:767px){.sh-ticker{min-height:36px;--gecko-widget-height:30px}}',
    'html,body{background-color:#0a0b0f!important}',
    '.sh-subnav{max-width:80em;margin:1.25em auto 0;padding:0 1em}',
    '.sh-subnav.attached{max-width:none;margin:0;padding:0}',
    '.sh-subnav.attached .sh-subwrap{background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.07);border-radius:0;padding:.2em .4em .45em;margin:0 0 .9em;backdrop-filter:none}',
    '.sh-tilewrap{background:rgba(15,17,23,.8);border:1px solid rgba(255,255,255,.08);border-radius:1em;padding:.75em;backdrop-filter:blur(10px)}',
    '.sh-tilewrap>.sh-subnav.attached .sh-subwrap{margin-bottom:.75em}',
    '.sh-subwrap{background:rgba(15,17,23,.8);border:1px solid rgba(255,255,255,.08);border-radius:1em;padding:.35em .6em;display:flex;align-items:center;gap:.25em;overflow-x:auto;scrollbar-width:none;backdrop-filter:blur(10px)}',
    '.sh-subwrap::-webkit-scrollbar{display:none}',
    '.sh-subtab{display:inline-flex;align-items:center;gap:.5em;padding:.7em 1.1em;font-size:1em;font-weight:600;color:#94a3b8;text-decoration:none;border:0;background:transparent;cursor:pointer;font-family:inherit;white-space:nowrap;border-bottom:2px solid transparent;border-radius:.6em;transition:color .15s,background .15s}',
    '.sh-subtab i{font-size:.95em;opacity:.85}',
    '.sh-subtab:hover{color:#e2e8f0;background:rgba(255,255,255,.04)}',
    '.sh-subtab.active{color:#67e8f9;background:rgba(34,211,238,.12);border-bottom-color:transparent;box-shadow:inset 0 0 0 1px rgba(34,211,238,.35)}',
    '.sh-subtab .sh-badge{font-size:.55em;font-weight:700;letter-spacing:.06em;padding:.1em .4em;border-radius:999px;background:rgba(34,211,238,.15);color:#67e8f9}',
    '.sh-subright{margin-left:auto;display:flex;align-items:center;gap:.8em;padding:.4em .4em .4em 1em;color:#94a3b8;font-size:.8em;font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;white-space:nowrap}',
    '.sh-subright .text-xs{font-size:.72em!important;color:#64748b!important;text-transform:uppercase;letter-spacing:.06em;line-height:1.1}',
    '.sh-subright .text-lg,.sh-subright .text-sm,.sh-subright .text-base{font-size:1em!important;line-height:1.2}',
    '.sh-subright .text-center{text-align:left;display:flex;flex-direction:column;align-items:flex-start}',
    '@media(max-width:767px){.sh-subnav{margin-top:.75em;padding:0 .75em}.sh-subtab{padding:.6em .8em;font-size:.85em}.sh-subright{display:none}}',
    '@media(prefers-reduced-motion:reduce){.sh-tab{transition:none}.sh-tab:hover{transform:none}}',
  ].join('\n');

  var TICKER_COINS = 'terra-luna-2,eris-amplified-luna,eris-arbitrage-luna,backbone-labs-staked-luna,lion-dao,capapult,solid-2,astroport-fi,eureka-bridged-wbtc-terra,cosmos,ethereum';
  function tickerHtml() {
    return '<div class="sh-ticker" id="sh-ticker"><gecko-coin-price-marquee-widget locale="en" dark-mode="true" outlined="true" coin-ids="' + TICKER_COINS + '" initial-currency="usd"></gecko-coin-price-marquee-widget></div>';
  }
  function ensureTickerScript() {
    if (doc.querySelector('script[src*="gecko-coin-price-marquee-widget"]')) return;
    var sc = doc.createElement('script'); sc.src = 'https://widgets.coingecko.com/gecko-coin-price-marquee-widget.js'; sc.async = true; doc.head.appendChild(sc);
  }
  // In-page tabs, one look everywhere. items: [{id, label, icon, href?, badge?, active?}]
  // right: optional HTML for the right slot (e.g. epoch countdown). onSelect(id) for
  // button-style tabs (no href). Returns the nav element.
  // attach: a selector for the page's FIRST content tile. The tab row is placed as
  // that tile's first child (so the tabs belong to the tile, not to the chrome).
  // wrap:true first wraps the target in a card (for pages whose first thing is a
  // bare grid of small tiles). Deferred until DOMContentLoaded if the target is
  // not in the DOM yet; falls back to the standalone tile if it never appears.
  function subnav(items, opts) {
    opts = opts || {};
    if (opts.attach) {
      var target = doc.querySelector(opts.attach);
      if (!target && doc.readyState === 'loading') {
        var pending = doc.createElement('div'); pending.id = 'site-subnav'; pending.className = 'sh-subnav'; pending.style.display = 'none';
        var hh = doc.getElementById('site-header'); if (hh && hh.parentNode) hh.parentNode.insertBefore(pending, hh.nextSibling);
        doc.addEventListener('DOMContentLoaded', function () { var t = doc.querySelector(opts.attach); if (t) { pending.remove(); subnav(items, opts); } else { pending.style.display = ''; subnav(items, Object.assign({}, opts, { attach: null })); } });
        return pending;
      }
      if (target) {
        var parentTile = target;
        if (opts.wrap) { var wrap = doc.createElement('div'); wrap.className = 'sh-tilewrap'; target.parentNode.insertBefore(wrap, target); wrap.appendChild(target); parentTile = wrap; }
        var row = doc.getElementById('site-subnav') || doc.createElement('div'); row.id = 'site-subnav'; row.className = 'sh-subnav attached';
        parentTile.insertBefore(row, parentTile.firstChild);
        return fill(row, items, opts);
      }
    }
    var host = doc.querySelector(opts.container || '#site-subnav');
    if (!host) { host = doc.createElement('div'); host.id = 'site-subnav'; var h = doc.getElementById('site-header'); if (h && h.parentNode) h.parentNode.insertBefore(host, h.nextSibling); else doc.body.insertBefore(host, doc.body.firstChild); }
    host.className = 'sh-subnav';
    return fill(host, items, opts);
  }
  function fill(host, items, opts) {
    host.classList.toggle('empty', !items.length);
    host.innerHTML = '<div class="sh-subwrap">' + items.map(function (t) {
      var inner = (t.icon ? '<i class="fas ' + esc(t.icon) + '"></i>' : '') + '<span>' + esc(t.label) + '</span>' + (t.badge ? '<span class="sh-badge">' + esc(t.badge) + '</span>' : '');
      return t.href ? '<a class="sh-subtab' + (t.active ? ' active' : '') + '" data-tab="' + esc(t.id) + '" href="' + esc(t.href) + '">' + inner + '</a>'
                    : '<button type="button" class="sh-subtab' + (t.active ? ' active' : '') + '" data-tab="' + esc(t.id) + '">' + inner + '</button>';
    }).join('') + (opts.right ? '<div class="sh-subright" id="sh-subright">' + opts.right + '</div>' : '') + '</div>';
    host.addEventListener('click', function (ev) { var b = ev.target.closest('button.sh-subtab'); if (!b) return; host.querySelectorAll('.sh-subtab').forEach(function (x) { x.classList.toggle('active', x === b); }); if (opts.onSelect) opts.onSelect(b.getAttribute('data-tab')); });
    return host;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function ensureAssets() {
    if (!doc.getElementById('sh-css')) {
      var st = doc.createElement('style'); st.id = 'sh-css'; st.textContent = CSS; doc.head.appendChild(st);
    }
    if (!doc.querySelector('link[href*="fonts.googleapis.com/css2?family=Outfit"]')) {
      var l = doc.createElement('link'); l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap'; doc.head.appendChild(l);
    }
    if (!doc.querySelector('link[href*="font-awesome"]')) {
      var fa = doc.createElement('link'); fa.rel = 'stylesheet';
      fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'; doc.head.appendChild(fa);
    }
  }

  function activePage(opts) {
    var p = opts.page;
    if (!p) { p = (root.location && root.location.pathname || '').split('/').pop().replace(/\.html$/, '') || 'index'; }
    return PAGE_GROUP[p] || p;
  }

  function render(opts) {
    var active = activePage(opts);
    var tabs = TABS.map(function (t) {
      return '<a href="' + t.href + '" data-page="' + t.page + '" class="sh-tab' + (t.page === active ? ' active' : '') + '"' + (t.page === active ? ' aria-current="page"' : '') + '>' + esc(t.label) + '</a>';
    }).join('');
    var mtabs = '<nav class="sh-bottom" aria-label="Main navigation">' + TABS.map(function (t) {
      return '<a href="' + t.href + '" data-page="' + t.page + '" class="sh-btab' + (t.page === active ? ' active' : '') + '"><i class="fas ' + t.icon + '"></i><span>' + esc(t.short) + '</span></a>';
    }).join('') + '</nav>';
    return '<div class="sh-wrap">' +
      '<a class="sh-logo" href="index.html" aria-label="Alliance DAO home"><img src="/assets/images/Alliance%20DAO%20Logo.png" alt="Alliance DAO"></a>' +
      '<nav class="sh-nav" aria-label="Main navigation">' + tabs + '</nav>' +
      '<div class="sh-right"><span class="sh-globe"><img src="/assets/planets/Terra.PNG" alt=""></span></div>' +
      '</div>' + mtabs +
      '<div class="sh-pickrow" id="sh-pickrow"><span class="sh-plabel"><i class="fas fa-user-magnifying-glass"></i>Viewing</span><div id="sh-picker"></div><span class="sh-phint">pick a name or address — every page follows it</span></div>' +
      (opts.ticker === false ? '' : tickerHtml());
  }

  function mount(opts) {
    opts = opts || {};
    var el = doc.querySelector(opts.container || '#site-header');
    if (!el) return null;
    ensureAssets(); if (opts.ticker !== false) ensureTickerScript();
    el.innerHTML = render(opts);
    el.setAttribute('data-sh-page', activePage(opts));
    return el;
  }

  root.SiteHeader = { mount: mount, render: render, subnav: subnav, TABS: TABS, PAGE_GROUP: PAGE_GROUP, activePage: activePage, TICKER_COINS: TICKER_COINS };
})(window, document);
