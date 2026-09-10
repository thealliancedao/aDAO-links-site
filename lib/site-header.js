/* =============================================================================
 * lib/site-header.js — ONE header for every page (2026-08-21, SPEC-unified-header §3)
 * 2026-08-26: "New here?" is two pulsing pills next to the globe — aDAO (blue, new-here.html) · TLA (orange, new-here-tla.html).
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
 * loaded once. LOAD-SPEED LAW (owner 2026-08-22): the marquee renders ONLY on the
 * pages in TICKER_PAGES (Home, TLA Stats) unless a page passes `ticker:true`;
 * `ticker:false` always wins. Pages don't change — the lib decides.
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

  var TICKER_PAGES = ['index', 'tla-stats'];   // marquee renders here only (load speed)
  // lib 1.4.0 (2026-08-22): site-wide width law + Outfit + bigger brand marks (see CSS)
  // lib 1.6.0 (2026-09-10): device prefs (badge DAO · NFT/TLA default views · marketplace collection), phone wallet bar (change/clear), settings sheet, proposal badge (Badging API + tab bar dot).
  // lib 1.5.0 (2026-09-10, owner: "app look and feel"): the phone bar is Home · NFT · TLA · DAO · Help (Lore moves
  // off the bar — it stays in the desktop nav and one tap from Home); the help bubble hides on phones since Help is
  // a tab; and the APP LAYER — each page declares a web-app manifest (per-tab manifests so the home-screen label reads
  // the page: Home / NFT / TLA / DAO / Help; every other page installs as "Ally"), Apple/Android head tags, the
  // network-first service worker (/sw.js — no data caching, by doctrine), and standalone-mode polish (safe areas, no
  // rubber-band overscroll behind the bar). Install = the browser's "Add to Home Screen"; the address the visitor picks
  // is already kept in localStorage by lib/address-picker.js, so an installed app reopens on their wallet.
  var MOBILE_TABS = [
    { href: 'index.html',              page: 'index',              short: 'Home', icon: 'fa-house',      app: 'home' },
    { href: 'nft-explorer-index.html', page: 'nft-explorer-index', short: 'NFT',  icon: 'fa-images',     app: 'nft'  },
    { href: 'tla-stats.html',          page: 'tla-stats',          short: 'TLA',  icon: 'fa-chart-line', app: 'tla'  },
    { href: 'dao.html',                page: 'dao',                short: 'DAO',  icon: 'fa-landmark',   app: 'dao'  },
    { href: 'help.html',               page: 'help',               short: 'Help', icon: 'fa-circle-question', app: 'help' },
  ];
  var TABS = [
    { href: 'index.html',              page: 'index',              label: 'Home',         short: 'Home', icon: 'fa-house' },
    { href: 'nft-explorer-index.html', page: 'nft-explorer-index', label: 'NFT Explorer', short: 'NFTs', icon: 'fa-images' },
    { href: 'tla-stats.html',          page: 'tla-stats',          label: 'TLA Stats',    short: 'TLA',  icon: 'fa-chart-line' },
    { href: 'adao-lore.html',          page: 'adao-lore',          label: 'aDAO Lore',    short: 'Lore', icon: 'fa-globe' },
    { href: 'dao.html',                page: 'dao',                label: 'DAO',          short: 'DAO',  icon: 'fa-landmark' },
  ];
  // Sub-pages light the tab of the section they belong to.
  var PAGE_GROUP = {
    'new-here': 'index', 'new-here-tla': 'index', 'supporters': 'index', 'member-portfolio': 'tla-stats', 'slippage': 'tla-stats', 'tla-docs': 'tla-stats',
    'tla-catalog': 'tla-stats', 'tla-chain-queries': 'tla-stats',
    'dao_treasury': 'dao', 'dao_tla_deposits': 'dao', 'dao_governance_tool': 'dao',
    'transparency-hub': 'index', 'help': 'index', 'tools': 'index', 'tutorials': 'index',
    'links': 'index', 'alliances': 'index', 'release-history': 'index', 'rarity-explained': 'nft-explorer-index',
    'address-catalog': 'index',   // 1.3.0 trust product page
    'verify': 'index',            // 2026-08-24 verify.html — contracts, code, audits, data
  };

  var CSS = [
    '#site-header,#site-subnav{font-size:16px;line-height:1.4}',
    '#site-header{font-family:Outfit,system-ui,sans-serif;position:relative;z-index:40}',
    // 1.4.0 (owner 2026-08-22): ticker rides ABOVE the bar and scrolls away; the bar (logo · tabs ·
    // globe · picker) is sticky. Bar content is capped to the same width law as page content.
    '.sh-sticky{position:sticky;top:0;z-index:40;background:rgba(10,11,15,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06)}',
    '.sh-ticker{border-bottom:1px solid rgba(255,255,255,.06);background:rgba(10,11,15,.85)}',
    '.sh-wrap{max-width:1400px;margin:0 auto;padding:.85em 1em;display:flex;align-items:center;justify-content:space-between;gap:.75em}',
    '@media(min-width:1600px){.sh-wrap,.sh-pickrow{max-width:1550px}}',
    '@media(min-width:1920px){.sh-wrap,.sh-pickrow{max-width:1750px}}',
    '@media(min-width:2200px){.sh-wrap,.sh-pickrow{max-width:2000px}}',
    '@media(min-width:1024px){.sh-wrap{padding:1em 2em}}',
    '.sh-logo{flex:0 0 auto;display:flex;align-items:center}',
    // 1.4.0 (owner 2026-08-22): bigger brand marks — fill the title bar instead of sitting in it
    '.sh-logo img{height:3.6em;width:auto;display:block}',
    '@media(min-width:768px){.sh-logo img{height:4.5em}}',
    // 1.4.0 SITE-WIDE LAYOUT LAW (lib-first): Home and NFT Explorer rendered narrower (Tailwind
    // max-w-7xl = 1280px) and in Inter, while TLA Stats and DAO override .max-w-7xl to
    // 1400/1550/1750px and use Outfit. The lib now carries both rules, so every page that
    // mounts the header matches; page-level copies of these rules become redundant, not wrong.
    '.max-w-7xl{max-width:1400px!important}',
    '@media(min-width:1600px){.max-w-7xl{max-width:1550px!important}}',
    '@media(min-width:1920px){.max-w-7xl{max-width:1750px!important}}',
    '@media(min-width:2200px){.max-w-7xl{max-width:2000px!important}}',
    'body{font-family:Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '.sh-nav{display:none;flex:1;justify-content:center;align-items:center;gap:.5em}',
    '@media(min-width:768px){.sh-nav{display:flex}}',
    '.sh-tab{min-width:140px;height:3.25em;display:inline-flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;color:#fff;font-weight:700;font-size:1em;padding:0 1em;border-radius:.5em;background:rgba(31,41,55,.5);border:1px solid #374151;box-shadow:0 10px 15px -3px rgba(0,0,0,.3);transition:transform .15s,background .15s;white-space:nowrap}',
    '.sh-tab:hover{background:rgba(55,65,81,.8);transform:scale(1.05)}',
    '.sh-tab.active{background:rgba(34,211,238,.15);color:#67e8f9;border-color:rgba(34,211,238,.6)}',
    '.sh-tab.active:hover{background:rgba(34,211,238,.2)}',
    '.sh-tab:focus-visible{outline:2px solid #67e8f9;outline-offset:2px}',
    '.sh-right{flex:0 0 auto;display:flex;align-items:center;gap:.75em}',
    '.sh-newhere{font-size:.72em;font-weight:700;letter-spacing:.04em;color:#fbbf24;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:9999px;padding:.35em .8em;text-decoration:none;white-space:nowrap}',
    '.sh-newhere:hover{background:rgba(251,191,36,.22)}',
    '.sh-nh-wrap{display:inline-flex;gap:.35em;align-items:center}.sh-nh-k{opacity:.75;font-weight:600;margin-right:.25em}',
    '.sh-nh-adao{color:#7dd3fc;background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.5);animation:shNhPulseBlue 2.2s ease-in-out infinite}',
    '.sh-nh-adao:hover{background:rgba(56,189,248,.24)}',
    '.sh-nh-tla{color:#fdba74;background:rgba(251,146,60,.12);border-color:rgba(251,146,60,.55);animation:shNhPulseOrange 2.2s ease-in-out infinite;animation-delay:1.1s}',
    '.sh-nh-tla:hover{background:rgba(251,146,60,.24)}',
    '.sh-nh-here,.sh-nh-here:hover{animation:none;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.35);color:#f3f4f6}',
    '@keyframes shNhPulseBlue{0%,100%{box-shadow:0 0 0 0 rgba(56,189,248,.55)}50%{box-shadow:0 0 0 .45em rgba(56,189,248,0)}}',
    '@keyframes shNhPulseOrange{0%,100%{box-shadow:0 0 0 0 rgba(251,146,60,.6)}50%{box-shadow:0 0 0 .45em rgba(251,146,60,0)}}',
    '@media(prefers-reduced-motion:reduce){.sh-nh-adao,.sh-nh-tla{animation:none}}',
    '@media(max-width:767px){.sh-nh-k{display:none}.sh-nh-wrap{gap:.25em}}',
    '@media(max-width:767px){.sh-newhere{font-size:.66em;padding:.3em .6em}}',
    '.sh-pickrow{display:none;justify-content:center;align-items:center;gap:.75em;padding:.15em 1em .8em;flex-wrap:wrap;max-width:1400px;margin:0 auto}',
    '.sh-pickrow.has{display:flex}',
    '.sh-pickrow .sh-plabel{font-size:.72em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#67e8f9;display:inline-flex;align-items:center;gap:.4em;white-space:nowrap}',
    '.sh-pickrow .sh-plabel i{font-size:.7em;opacity:.8}',
    '.sh-pickrow .sh-phint{font-size:.7em;color:#64748b;white-space:nowrap}',
    // 2026-08-23 owner spec: the slot must fit the FULL address (name + terra1…) so
    // members learn the first/last characters. #sh-picker sized to content before,
    // so the pill never grew past its 22em minimum and the address truncated.
    '.sh-pickrow #sh-picker{flex:0 1 auto;width:min(42em,100%)}',
    '.sh-pickrow .ap{width:100%}',
    '.sh-pickrow .ap-pill{width:100%;min-width:0;max-width:none;height:2.7em}',
    '@media(max-width:767px){.sh-pickrow{padding:.1em .75em .7em}.sh-pickrow .sh-phint{display:none}.sh-pickrow #sh-picker{width:100%}}',
    '.sh-globe img{height:3.6em;width:auto;display:block}',
    '@media(min-width:768px){.sh-globe img{height:4.5em}}',
    '.sh-bottom{display:none}',
    '@media(max-width:767px){.sh-bottom{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;bottom:0;left:0;right:0;z-index:50;background:rgba(10,11,15,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid rgba(34,211,238,.2);padding:.4em .25em calc(.4em + env(safe-area-inset-bottom)) .25em;gap:.15em;font-size:16px}',
    '.sh-btab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15em;padding:.4em .2em;color:#9ca3af;text-decoration:none;font-size:.65em;font-weight:600;line-height:1;border-radius:.5em;min-height:48px}',
    '.sh-btab i{font-size:1.7em;color:#6b7280}',
    '.sh-btab.active{color:#22d3ee;background:rgba(34,211,238,.08)}.sh-btab.active i{color:#22d3ee}',
    '.mobile-bottom-nav{display:none!important}',
    '@media(max-width:767px){#help-bubble{display:none!important}}',   // 1.5.0: Help is a phone tab
    '.sh-walletbar{display:none}',
    '@media(max-width:767px){.sh-walletbar{display:flex;align-items:center;justify-content:center;gap:.4em;flex-wrap:wrap;padding:.35em .5em .5em;font-size:13px}}',
    '.sh-wchip{display:inline-flex;align-items:center;gap:.4em;padding:.35em .7em;border-radius:9999px;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.25);color:#a5f3fc;font-family:ui-monospace,monospace;max-width:60vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.sh-wbtn{display:inline-flex;align-items:center;gap:.3em;padding:.35em .6em;border-radius:9999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#d1d5db;font:inherit;font-size:12px;cursor:pointer}.sh-wbtn[hidden]{display:none}',
    '.sh-wgear{padding:.35em .55em}',
    '.sh-badge{position:absolute;top:2px;right:calc(50% - 1.6em);min-width:1.4em;height:1.4em;padding:0 .3em;border-radius:9999px;background:#ef4444;color:#fff;font-size:.6em;font-weight:800;line-height:1.4em;text-align:center;box-shadow:0 0 0 2px #0a0b0f}.sh-badge[hidden]{display:none}.sh-btab{position:relative}',
    '.sh-sheet{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}',
    '.sh-sheet-card{width:100%;max-width:520px;background:#0f1117;border:1px solid rgba(34,211,238,.25);border-radius:1.2em 1.2em 0 0;padding:1em 1em calc(1em + env(safe-area-inset-bottom));color:#e5e7eb;font-size:14px;display:flex;flex-direction:column;gap:.8em}',
    '.sh-sheet-head{display:flex;align-items:center;gap:.6em}.sh-sheet-head b{font-size:16px}.sh-sheet-sub{color:#6b7280;font-size:11px;flex:1}',
    '.sh-sheet-card label{display:flex;flex-direction:column;gap:.3em;font-size:12px;color:#9ca3af}.sh-sheet-card select{font:inherit;font-size:14px;color:#fff;background:#151923;border:1px solid rgba(255,255,255,.12);border-radius:.6em;padding:.5em .7em}',
    '.sh-sheet-note{font-size:11px;color:#6b7280;line-height:1.4}',
    '@media(display-mode:standalone){html{overscroll-behavior-y:none}body{-webkit-tap-highlight-color:transparent}.sh-sticky{padding-top:env(safe-area-inset-top)}}',
    'body{padding-bottom:calc(76px + env(safe-area-inset-bottom))!important}',
    '#help-bubble{bottom:calc(78px + env(safe-area-inset-bottom))!important}',
    '.sh-subnav.empty{display:none}}',
    '.sh-ticker{border-top:0;padding:.35em 0;min-height:44px;--gecko-widget-height:36px}',
    '.sh-ticker gecko-coin-price-marquee-widget::part(card){padding:.25em .5em!important}',
    '@media(max-width:767px){.sh-ticker{min-height:36px;--gecko-widget-height:30px}}',
    'html,body{background-color:#0a0b0f!important}',
    // 1.4.0: the animated mesh behind TLA Stats / DAO / Home is now lib-rendered on every page
    // that mounts the header (pages that already ship a .bg-mesh div keep theirs; the lib adds
    // one only when none exists), so NFT Explorer and Lore share the same backdrop.
    '.bg-mesh{position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse 80% 50% at 20% 40%,rgba(6,182,212,.12),transparent),radial-gradient(ellipse 60% 40% at 80% 60%,rgba(168,85,247,.08),transparent),radial-gradient(ellipse 50% 30% at 50% 80%,rgba(16,185,129,.06),transparent);animation:shMeshMove 25s ease-in-out infinite}',
    '@keyframes shMeshMove{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-2%,1%) scale(1.03)}}',
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
    '.sh-subtab.sh-disabled{color:#4b5563;cursor:not-allowed}.sh-subtab.sh-disabled .sh-badge{background:rgba(148,163,184,.15);color:#94a3b8}',
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
      if (t.disabled) return '<span class="sh-subtab sh-disabled" data-tab="' + esc(t.id) + '" title="' + esc(t.tip || 'Coming soon') + '">' + inner + '</span>';   // 2026-08-24: greyed, unclickable
      return t.href ? '<a class="sh-subtab' + (t.active ? ' active' : '') + '" data-tab="' + esc(t.id) + '" href="' + esc(t.href) + '">' + inner + '</a>'
                    : '<button type="button" class="sh-subtab' + (t.active ? ' active' : '') + '" data-tab="' + esc(t.id) + '">' + inner + '</button>';
    }).join('') + (opts.right ? '<div class="sh-subright" id="sh-subright">' + opts.right + '</div>' : '') + '</div>';
    host.addEventListener('click', function (ev) { var b = ev.target.closest('button.sh-subtab'); if (!b) return; host.querySelectorAll('.sh-subtab').forEach(function (x) { x.classList.toggle('active', x === b); }); if (opts.onSelect) opts.onSelect(b.getAttribute('data-tab')); });
    return host;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function ensureAssets() {
    if (!doc.querySelector('.bg-mesh') && doc.body) { var mesh = doc.createElement('div'); mesh.className = 'bg-mesh'; mesh.setAttribute('aria-hidden', 'true'); doc.body.insertBefore(mesh, doc.body.firstChild); }   // 1.4.0
    if (!doc.getElementById('sh-css')) {
      var st = doc.createElement('style'); st.id = 'sh-css'; st.textContent = CSS; doc.head.appendChild(st);
    }
    if (!doc.querySelector('link[href*="fonts.googleapis.com/css2?family=Outfit"]')) {
      var l = doc.createElement('link'); l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap'; doc.head.appendChild(l);
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
    var mtabs = '<nav class="sh-bottom" aria-label="Main navigation">' + MOBILE_TABS.map(function (t) {
      var rawPage = (opts.page || (root.location && root.location.pathname || '').split('/').pop().replace(/\.html$/, '') || 'index');
      var on = t.page === (rawPage === 'help' ? 'help' : active);   // Help is a phone tab even though it groups under Home on desktop
      return '<a href="' + tabHref(t) + '" data-page="' + t.page + '" class="sh-btab' + (on ? ' active' : '') + '"' + (on ? ' aria-current="page"' : '') + '><i class="fas ' + t.icon + '"></i><span>' + esc(t.short) + '</span>' + (t.page === 'index' ? '<b class="sh-badge" hidden></b>' : '') + '</a>';
    }).join('') + '</nav>';
    return (wantTicker(opts) ? tickerHtml() : '') +
      '<div class="sh-sticky">' +
      '<div class="sh-wrap">' +
      '<a class="sh-logo" href="index.html" aria-label="Alliance DAO home"><img src="/assets/images/Alliance%20DAO%20Logo.png" alt="Alliance DAO"></a>' +
      '<nav class="sh-nav" aria-label="Main navigation">' + tabs + '</nav>' +
      '<div class="sh-right">' + newHereHtml(opts.page) + '<span class="sh-globe"><img src="/assets/planets/Terra.PNG" alt=""></span></div>' +
      '</div>' +
      '<div class="sh-pickrow" id="sh-pickrow"><span class="sh-plabel"><i class="fas fa-user-magnifying-glass"></i>Viewing</span><div id="sh-picker"></div></div>' +
      '</div>' + mtabs;
  }
  // "New here?" — two pills next to the globe (2026-08-26): aDAO (blue) and TLA (orange), both pulsing
  // to draw the eye; the pill for the page you are on is solid. Same slot on every page.
  function newHereHtml(page) {
    var onA = page === 'new-here', onT = page === 'new-here-tla';
    return '<span class="sh-nh-wrap">' +
      '<a href="new-here.html" class="sh-newhere sh-nh-adao' + (onA ? ' sh-nh-here' : '') + '" title="New here? \u2014 aDAO: the NFT, the backing, the DAO. Ten minutes."><span class="sh-nh-k">New here?</span> aDAO</a>' +
      '<a href="new-here-tla.html" class="sh-newhere sh-nh-tla' + (onT ? ' sh-nh-here' : '') + '" title="New here? \u2014 TLA: you have LUNA. Four routes, your amount, live numbers."><span class="sh-nh-k">New here?</span> TLA</a>' +
      '</span>';
  }
  function wantTicker(opts) {
    if (opts.ticker === false) return false;
    if (opts.ticker === true) return true;
    // the page's OWN id, not its PAGE_GROUP parent: sub-pages of Home/TLA (transparency-hub,
    // member-portfolio, address-catalog…) must NOT inherit the marquee.
    return TICKER_PAGES.indexOf(opts.page || activePage(opts)) !== -1;
  }

  // ---- 1.6.0 DEVICE PREFS · WALLET BAR · SETTINGS · BADGE (owner 2026-09-10) ----------------------
  // Everything here is per DEVICE (localStorage 'ally:prefs'): which DAO the badge counts, which view NFT Explorer /
  // TLA Stats / the marketplace open on, plus the wallet controls the picker lacked on a phone (change · clear). The
  // home-screen badge uses the Badging API: it can only be set while the app is open, so it means "new proposals since
  // you last looked", filtered by the default DAO. Background badges need Web Push — a later feature.
  var PREFS_KEY = 'ally:prefs';
  var PREF_DEFAULTS = { dao: 'all', nftView: 'explorer', tlaTab: 'overview', collection: 'alliance_dao', seenProps: [] };
  var DAO_CHOICES = [['all', 'All DAOs'], ['aDAO', 'aDAO'], ['Lion DAO', 'Lion DAO'], ['Pixellions', 'Pixel Lions'], ['Phoenix Directive', 'Phoenix Directive'], ['ampCAPA', 'ampCAPA']];
  function prefsGet() { try { var o = JSON.parse(root.localStorage.getItem(PREFS_KEY) || '{}'); return Object.assign({}, PREF_DEFAULTS, o); } catch (e) { return Object.assign({}, PREF_DEFAULTS); } }
  function prefsSet(patch) { var cur = prefsGet(); Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; }); try { root.localStorage.setItem(PREFS_KEY, JSON.stringify(cur)); } catch (e) {} try { root.dispatchEvent(new CustomEvent('ally:prefs', { detail: cur })); } catch (e) {} return cur; }
  function tabHref(t) {
    var p = prefsGet();
    if (t.page === 'nft-explorer-index' && p.nftView === 'analytics') return t.href + '?view=analytics';
    if (t.page === 'tla-stats' && p.tlaTab && p.tlaTab !== 'overview') return t.href + '#' + p.tlaTab;
    return t.href;
  }
  var reported = [];   // [{dao,id}] open proposals the current page told us about
  function daoKey(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }   // 'Pixellions' (Home) == 'Pixel Lions' (DAO page)
  function propKey(x) { return daoKey(x.dao) + '|' + x.id; }
  function unseenCount() { var p = prefsGet(); var seen = {}; (p.seenProps || []).forEach(function (k) { seen[k] = 1; });
    return reported.filter(function (x) { return (p.dao === 'all' || daoKey(x.dao) === daoKey(p.dao)) && !seen[propKey(x)]; }).length; }
  function paintBadge() {
    var n = unseenCount(); var b = doc.querySelector('.sh-bottom .sh-badge'); if (b) { b.textContent = n > 9 ? '9+' : String(n); b.hidden = n === 0; }
    try { if (navigator.setAppBadge) { if (n > 0) navigator.setAppBadge(n); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } } catch (e) {}
    return n;
  }
  function reportProps(list) { reported = (list || []).filter(function (x) { return x && x.dao && x.id != null; }).map(function (x) { return { dao: String(x.dao), id: String(x.id) }; }); return paintBadge(); }
  function markSeen(list) { var p = prefsGet(); var seen = p.seenProps || []; (list || reported).forEach(function (x) { var k = propKey(x); if (seen.indexOf(k) < 0) seen.push(k); }); if (seen.length > 400) seen = seen.slice(-400); prefsSet({ seenProps: seen }); return paintBadge(); }
  function shortAddr(a) { return a ? a.slice(0, 9) + '…' + a.slice(-5) : ''; }
  function walletBarHtml() {
    var w = null, name = null; try { w = root.localStorage.getItem('tla:selected_wallet'); } catch (e) {}
    return '<div class="sh-walletbar">' +
      '<span class="sh-wchip"><i class="fas fa-wallet"></i><span class="sh-wtext">' + (w ? esc(name || shortAddr(w)) : 'No wallet selected') + '</span></span>' +
      '<button type="button" class="sh-wbtn" data-act="change"><i class="fas fa-pen"></i> Change</button>' +
      '<button type="button" class="sh-wbtn" data-act="clear"' + (w ? '' : ' hidden') + '><i class="fas fa-xmark"></i> Clear</button>' +
      '<button type="button" class="sh-wbtn sh-wgear" data-act="settings" aria-label="App settings"><i class="fas fa-gear"></i></button>' +
      '</div>';
  }
  function settingsHtml() {
    var p = prefsGet();
    var opt = function (list, cur) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); };
    return '<div class="sh-sheet" role="dialog" aria-label="App settings"><div class="sh-sheet-card">' +
      '<div class="sh-sheet-head"><b>App settings</b><span class="sh-sheet-sub">saved on this device</span><button type="button" class="sh-wbtn" data-act="close"><i class="fas fa-xmark"></i></button></div>' +
      '<label>Badge counts new proposals in<select data-pref="dao">' + opt(DAO_CHOICES, p.dao) + '</select></label>' +
      '<label>NFT Explorer opens on<select data-pref="nftView">' + opt([['explorer', 'Explorer'], ['analytics', 'Analytics']], p.nftView) + '</select></label>' +
      '<label>TLA Stats opens on<select data-pref="tlaTab">' + opt([['overview', 'Overview'], ['pools', 'Pools'], ['grades', 'LP Grades'], ['tla', 'TLA Stats']], p.tlaTab) + '</select></label>' +
      '<label>Marketplace collection<select data-pref="collection">' + opt([['alliance_dao', 'aDAO'], ['pixelions', 'pixeLions'], ['tla_locks', 'TLA Locks']], p.collection) + '</select></label>' +
      '<div class="sh-sheet-note">Badge: the icon shows proposals posted since you last opened the app — it updates when the app is open (browser rule; live push is a later feature).</div>' +
      '</div></div>';
  }
  function mountWalletBar(el) {
    var row = el; var old = row.querySelector('.sh-walletbar'); if (old) old.remove();   // in the header itself, not the picker row (which hides without a picker)
    row.insertAdjacentHTML('beforeend', walletBarHtml());
    var bar = row.querySelector('.sh-walletbar');
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]'); if (!b) return; var act = b.getAttribute('data-act');
      if (act === 'clear') { try { root.AddressPicker && root.AddressPicker.clear(); } catch (e) {} try { root.localStorage.removeItem('tla:selected_wallet'); } catch (e) {} mountWalletBar(el); }
      else if (act === 'change') { var inp = doc.querySelector('#sh-picker input, #sh-picker [contenteditable], #sh-picker button'); if (inp) { inp.focus(); if (inp.click) inp.click(); } }
      else if (act === 'settings') { openSettings(el); }
    });
    root.addEventListener('tla:wallet', function () { var c = bar.querySelector('.sh-wtext'), w = null; try { w = root.localStorage.getItem('tla:selected_wallet'); } catch (e) {} if (c) c.textContent = w ? shortAddr(w) : 'No wallet selected'; var cl = bar.querySelector('[data-act="clear"]'); if (cl) cl.hidden = !w; });
  }
  function openSettings(el) {
    doc.querySelectorAll('.sh-sheet').forEach(function (s) { s.remove(); });
    doc.body.insertAdjacentHTML('beforeend', settingsHtml());
    var sheet = doc.body.lastElementChild;
    sheet.addEventListener('click', function (ev) { if (ev.target === sheet || ev.target.closest('[data-act="close"]')) sheet.remove(); });
    sheet.addEventListener('change', function (ev) { var s = ev.target.closest('select[data-pref]'); if (!s) return; var patch = {}; patch[s.getAttribute('data-pref')] = s.value; prefsSet(patch);
      doc.querySelectorAll('.sh-bottom .sh-btab').forEach(function (a) { var t = MOBILE_TABS.filter(function (x) { return x.page === a.getAttribute('data-page'); })[0]; if (t) a.setAttribute('href', tabHref(t)); });
      paintBadge(); });
  }
  root.AllyApp = { prefs: prefsGet, setPrefs: prefsSet, reportProps: reportProps, markSeen: markSeen, unseenCount: unseenCount, paintBadge: paintBadge, openSettings: function () { openSettings(doc.querySelector('#site-header') || doc.body); }, tabHref: tabHref, DAO_CHOICES: DAO_CHOICES };

  // ---- 1.5.0 APP LAYER --------------------------------------------------------
  function appKeyFor(opts) {
    var raw = opts.page || (root.location && root.location.pathname || '').split('/').pop().replace(/\.html$/, '') || 'index';
    if (raw === 'help') return 'help';
    var grp = PAGE_GROUP[raw] || raw;
    for (var i = 0; i < MOBILE_TABS.length; i++) if (MOBILE_TABS[i].page === grp) return MOBILE_TABS[i].app;
    return 'ally';
  }
  function ensureAppLayer(opts) {
    if (!doc.head || doc.head.querySelector('link[rel="manifest"]')) return;
    var key = appKeyFor(opts);
    var label = { home: 'Home', nft: 'NFT', tla: 'TLA', dao: 'DAO', help: 'Help' }[key] || 'Ally';
    var add = function (tag, attrs) { var n = doc.createElement(tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); doc.head.appendChild(n); };
    add('link', { rel: 'manifest', href: key === 'ally' ? '/manifest.webmanifest' : '/manifests/' + key + '.webmanifest' });
    if (!doc.head.querySelector('meta[name="theme-color"]')) add('meta', { name: 'theme-color', content: '#0a0b0f' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    add('meta', { name: 'apple-mobile-web-app-title', content: label });
    add('link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/assets/app/apple-touch-icon-180.png' });
    if (!doc.head.querySelector('meta[name="viewport"]')) add('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' });
    else { var vp = doc.head.querySelector('meta[name="viewport"]'); if (!/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover'; }
    // service worker: network-first, no data cache (see /sw.js). Installability + home-screen icon only.
    if ('serviceWorker' in navigator && /^https?:/.test(root.location.protocol) && root.location.hostname !== 'localhost') {
      try { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {}); } catch (e) {}
    }
  }

  function mount(opts) {
    opts = opts || {};
    var el = doc.querySelector(opts.container || '#site-header');
    if (!el) return null;
    ensureAssets(); if (wantTicker(opts)) ensureTickerScript();
    ensureAppLayer(opts);
    el.innerHTML = render(opts);
    el.setAttribute('data-sh-page', activePage(opts));
    // position:fixed inside a backdrop-filter ancestor is NOT viewport-fixed — move the
    // mobile bar out to <body> so it pins to the bottom of the screen on every page.
    var bar = el.querySelector('.sh-bottom'); if (bar) { doc.querySelectorAll('body > .sh-bottom').forEach(function (b) { b.remove(); }); doc.body.appendChild(bar); }
    mountWalletBar(el); paintBadge();   // 1.6.0
    return el;
  }

  root.SiteHeader = { mount: mount, render: render, subnav: subnav, wantTicker: wantTicker, TABS: TABS, MOBILE_TABS: MOBILE_TABS, appKeyFor: appKeyFor, PAGE_GROUP: PAGE_GROUP, activePage: activePage, TICKER_COINS: TICKER_COINS, TICKER_PAGES: TICKER_PAGES };
})(window, document);
