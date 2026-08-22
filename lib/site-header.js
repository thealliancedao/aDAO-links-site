/* =============================================================================
 * lib/site-header.js — ONE header for every page (2026-08-21, SPEC-unified-header §3)
 * -----------------------------------------------------------------------------
 * Renders the index.html header (logo · Home · NFT Explorer · TLA Stats ·
 * aDAO Lore · DAO · Terra globe) in the TLA Stats theme (deep #0a0b0f base,
 * cyan accent, Outfit) on any page — including pages that load no Tailwind
 * (transparency-hub). All styles are namespaced `sh-*` and injected once, so a
 * host page's CSS cannot fight it and it cannot fight the host.
 *
 * Mobile: the five tabs become a compact, horizontally scrollable icon row
 * under the logo line (index keeps its own fixed bottom bar; pages that mount
 * this lib pass `mobileTabs:false` if they have a bottom bar of their own).
 *
 * Under the tab row sits a centered ADDRESS ROW: a label ("Viewing") and the
 * `#sh-picker` slot where lib/address-picker.js mounts the global picker. It
 * is the one place on every page to choose whose data you're looking at. The
 * row is hidden until a picker mounts into it (pages without one lose nothing).
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
    '#site-header{font-family:Outfit,system-ui,sans-serif;background:rgba(10,11,15,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06);position:relative;z-index:40}',
    '.sh-wrap{max-width:80rem;margin:0 auto;padding:.85rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem}',
    '@media(min-width:1024px){.sh-wrap{padding:1rem 2rem}}',
    '.sh-logo{flex:0 0 auto;display:flex;align-items:center}',
    '.sh-logo img{height:3rem;width:auto;display:block}',
    '@media(min-width:768px){.sh-logo img{height:4rem}}',
    '.sh-nav{display:none;flex:1;justify-content:center;align-items:center;gap:.5rem}',
    '@media(min-width:768px){.sh-nav{display:flex}}',
    '.sh-tab{min-width:140px;text-align:center;text-decoration:none;color:#fff;font-weight:700;font-size:1rem;padding:.75rem 1rem;border-radius:.5rem;background:rgba(31,41,55,.5);border:1px solid #374151;box-shadow:0 10px 15px -3px rgba(0,0,0,.3);transition:transform .15s,background .15s;white-space:nowrap}',
    '.sh-tab:hover{background:rgba(55,65,81,.8);transform:scale(1.05)}',
    '.sh-tab.active{background:rgba(34,211,238,.15);color:#67e8f9;border-color:rgba(34,211,238,.6)}',
    '.sh-tab.active:hover{background:rgba(34,211,238,.2)}',
    '.sh-tab:focus-visible{outline:2px solid #67e8f9;outline-offset:2px}',
    '.sh-right{flex:0 0 auto;display:flex;align-items:center;gap:.75rem}',
    '.sh-pickrow{display:none;justify-content:center;align-items:center;gap:.75rem;padding:.15rem 1rem .8rem;flex-wrap:wrap}',
    '.sh-pickrow.has{display:flex}',
    '.sh-pickrow .sh-plabel{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#67e8f9;display:inline-flex;align-items:center;gap:.4rem;white-space:nowrap}',
    '.sh-pickrow .sh-plabel i{font-size:.7rem;opacity:.8}',
    '.sh-pickrow .sh-phint{font-size:.7rem;color:#64748b;white-space:nowrap}',
    '.sh-pickrow .ap-pill{min-width:22rem;max-width:40rem;flex:1 1 22rem;height:2.7rem}',
    '@media(max-width:767px){.sh-pickrow{padding:.1rem .75rem .7rem}.sh-pickrow .sh-phint{display:none}.sh-pickrow .ap-pill{min-width:0;max-width:none;flex:1 1 100%}}',
    '.sh-globe img{height:3rem;width:auto;display:block}',
    '@media(min-width:768px){.sh-globe img{height:4rem}}',
    '.sh-mobile{display:flex;gap:.4rem;overflow-x:auto;padding:0 .75rem .6rem;scrollbar-width:none;-webkit-overflow-scrolling:touch}',
    '.sh-mobile::-webkit-scrollbar{display:none}',
    '@media(min-width:768px){.sh-mobile{display:none}}',
    '.sh-mtab{flex:1 0 auto;display:flex;flex-direction:column;align-items:center;gap:.2rem;padding:.45rem .6rem;border-radius:.5rem;text-decoration:none;color:#94a3b8;font-size:.7rem;font-weight:600;background:rgba(31,41,55,.5);border:1px solid #374151}',
    '.sh-mtab i{font-size:.95rem}',
    '.sh-mtab.active{color:#67e8f9;background:rgba(34,211,238,.15);border-color:rgba(34,211,238,.6)}',
    '@media(prefers-reduced-motion:reduce){.sh-tab{transition:none}.sh-tab:hover{transform:none}}',
  ].join('\n');

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
    var mtabs = opts.mobileTabs === false ? '' : '<nav class="sh-mobile" aria-label="Main navigation">' + TABS.map(function (t) {
      return '<a href="' + t.href + '" data-page="' + t.page + '" class="sh-mtab' + (t.page === active ? ' active' : '') + '"><i class="fas ' + t.icon + '"></i><span>' + esc(t.short) + '</span></a>';
    }).join('') + '</nav>';
    return '<div class="sh-wrap">' +
      '<a class="sh-logo" href="index.html" aria-label="Alliance DAO home"><img src="/assets/images/Alliance%20DAO%20Logo.png" alt="Alliance DAO"></a>' +
      '<nav class="sh-nav" aria-label="Main navigation">' + tabs + '</nav>' +
      '<div class="sh-right"><span class="sh-globe"><img src="/assets/planets/Terra.PNG" alt=""></span></div>' +
      '</div>' + mtabs +
      '<div class="sh-pickrow" id="sh-pickrow"><span class="sh-plabel"><i class="fas fa-user-magnifying-glass"></i>Viewing</span><div id="sh-picker"></div><span class="sh-phint">pick a name or address — every page follows it</span></div>';
  }

  function mount(opts) {
    opts = opts || {};
    var el = doc.querySelector(opts.container || '#site-header');
    if (!el) return null;
    ensureAssets();
    el.innerHTML = render(opts);
    el.setAttribute('data-sh-page', activePage(opts));
    return el;
  }

  root.SiteHeader = { mount: mount, render: render, TABS: TABS, PAGE_GROUP: PAGE_GROUP, activePage: activePage };
})(window, document);
