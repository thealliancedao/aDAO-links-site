/* =============================================================================
 * lib/site-footer.js — ONE footer for every page (2026-08-12). v3.2 (2026-08-23):
 * v3.5: 'New here?' link; v3.4: builder's note + copyable address; ecosystem logo banner + builder contact; v3.3: +Creda, Atrium/Votion logos; v3.1: honest legal row.
 * -----------------------------------------------------------------------------
 * Renders the index.html footer format everywhere: socials, quick links, then
 * "Rev X · date · Changelog · ● System Health · Alliance Contact".
 *
 * WHY: footers had drifted. index had a rev + live health dot; tla-stats had a
 * DIFFERENT health widget (a modal with its own rules); member-portfolio,
 * dao_treasury, dao_tla_deposits and test had NO rev at all — no way to tell
 * which version a member was looking at. Every page now renders from here, and
 * "System Health" always links to the transparency hub (one place to look).
 *
 * THE DOT answers ONE question: is the data flowing?
 *   green  — every scheduled job reporting on time
 *   amber  — something is late
 *   red    — something is stale, or a producer is stuck
 * A product REPORTING A FINDING (system-health flagging an invariant) is that
 * job WORKING — findings never turn the dot red; they're shown as a note.
 *
 * USAGE:
 *   <div id="site-footer"></div>
 *   <script src="/lib/cron-registry.js"></script>
 *   <script src="/lib/site-footer.js"></script>
 *   <script>SiteFooter.mount({ rev: '2.4', revDate: '2026-08-12', page: 'dao_treasury' });</script>
 * Pages that already have the markup (index) can call SiteFooter.wireHealth()
 * instead, to light their existing dot from the same source.
 * ============================================================================= */
(function (root, doc) {
  'use strict';

  var HUB = 'transparency-hub.html';
  // The one home for the assistant endpoint — help.html reads it from here too.
  var AGENT_URL = 'https://tla-help-agent.onrender.com';
  var PARTICIPANTS_URL = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/member-data/participants/participants.json';
  var LOG_BASE = 'https://github.com/thealliancedao/tla-core/blob/main/docs/changelogs';

  // Each page's own changelog, so "Changelog" lands on the right file.
  var PAGE_LOG = {
    index: 'index-log.md',
    'tla-stats': 'tla-log.md',
    'member-portfolio': 'portfolio-log.md',
    dao: 'dao-log.md',
    dao_treasury: 'dao-log.md',
    dao_tla_deposits: 'dao-log.md',
    'nft-explorer': 'explorer-log.md',
    slippage: 'slippage-log.md',
    'adao-lore': 'lore-log.md',
    help: 'help-log.md',
    'tla-catalog': 'catalog-log.md',
    test: 'index-log.md',
  };
  // Ecosystem banner (footer v3.2, 2026-08-23 owner spec): every venue TLA data
  // touches, as a left-to-right row of logo tiles instead of a long column.
  // [label, url, logo path or null]. A missing/failed logo degrades to a lettermark
  // (first letter in a tinted disc) — never a broken image. Atrium/Votion logos
  // all logos vendored in /assets/images (v3.3).
  var ECO = [
    ['Eris TLA','https://www.erisprotocol.com','/assets/images/logo_eris_48.svg'],
    ['Astroport','https://app.astroport.fi','/assets/token-logos/Astro.webp'],
    ['Solid','https://solidcapa.com','/assets/images/solid.webp'],
    ['Atrium','https://atrium.markets','/assets/images/atrium-favicon.svg'],
    ['Boost','https://www.boostdao.io','/assets/images/Boost%20Logo.png'],
    ['BBL','https://app.backbonelabs.io','/assets/images/BBL%20No%20Background.png'],
    ['Votion','https://votion.money','/assets/images/votion-logo-optimized.png'],
    ['Creda','https://creda.finance','/assets/images/creda.svg'],
    ['Terra','https://phoenix.money','/assets/images/terra-luna-logo.svg'],
    ['DAODAO','https://daodao.zone','/assets/images/DAODAO.png']
  ];


  var LINKS = [
    ['new-here.html', 'New here? Start here', null],   // v3.5: the crash course, everywhere
    ['tla-docs.html', 'Docs', null],   // v3.4: the docs hub, everywhere
    ['help.html', 'Help', null],
    ['tutorials.html', 'Tutorials', null],
    ['links.html', 'Official Links', null],
    ['https://chainsco.pe/terra2/address/terra1phr9fngjv7a8an4dhmhd0u0f98wazxfnzccqtyheq4zqrrp4fpuqw3apw9', 'NFT Contract', '_blank'],
    ['https://github.com/SCV-Security/PublicReports/blob/b819ec669f81e603caca261931e2a4aaca1cddf7/Alliance/Alliance%20DAO%20-%20NFT%20Collection%20Contract%20-%20Audit%20Report%20v1.0.pdf', 'Contract Audit', '_blank'],
  ];

  function html(opts) {
    var log = PAGE_LOG[opts.page] || 'index-log.md';
    var rev = 'Rev ' + (opts.rev || '—') + (opts.revDate ? ' · ' + opts.revDate : '');
    var links = LINKS.map(function (l) {
      return '<a href="' + l[0] + '"' + (l[2] ? ' target="_blank" rel="noopener noreferrer"' : '') +
        ' class="hover:text-white hover:underline transition-colors">' + l[1] + '</a>';
    }).join('');
    var siteLinks = LINKS.map(function (l) {
      return '<a href="' + l[0] + '"' + (l[2] ? ' target="_blank" rel="noopener noreferrer"' : '') + ' class="block py-0.5 text-gray-400 hover:text-cyan-300 transition-colors">' + l[1] + '</a>';
    }).join('');
    var ecoTiles = ECO.map(function (l) {
      var mark = '<span class="sf-eco-mark">' + l[0].charAt(0) + '</span>';
      var img = l[2] ? '<img src="' + l[2] + '" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'sf-eco-mark\',textContent:\'' + l[0].charAt(0) + '\'}))">' : mark;
      return '<a href="' + l[1] + '" target="_blank" rel="noopener noreferrer" class="sf-eco" title="' + l[0] + '">' + img + '<span>' + l[0] + '</span></a>';
    }).join('');
    var ecoLinks = ECO.map(function (l) {
      return '<a href="' + l[1] + '" target="_blank" rel="noopener noreferrer" class="block py-0.5 text-gray-400 hover:text-cyan-300 transition-colors">' + l[0] + ' <i class="fas fa-arrow-up-right-from-square text-[9px] opacity-40"></i></a>';
    }).join('');
    var colH = function (t) { return '<h4 class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-2">' + t + '</h4>'; };
    return '' +
      '<footer class="sf-footer mt-16 border-t border-gray-800 bg-black/20">' +
      '<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">' +

        // ── row 1: brand + three link columns ─────────────────────────────
        '<div class="grid grid-cols-2 md:grid-cols-12 gap-8 text-sm text-left">' +
          '<div class="col-span-2 md:col-span-5">' +
            '<div class="text-white font-bold text-base tracking-wide">The Alliance DAO <span class="text-cyan-400">· Stats</span></div>' +
            '<p class="mt-2 text-xs text-gray-500 leading-relaxed max-w-xs">Open on-chain analytics for the Terra Liquidity Alliance and its collections \u2014 built by the community, for the community. No wallet connection, no accounts \u2014 just public on-chain data.</p>' +
            '<div class="mt-4 flex items-center gap-4 text-lg">' +
              '<a href="https://t.me/The_AllianceDAO" target="_blank" rel="noopener noreferrer" aria-label="Telegram" class="text-gray-500 hover:text-white transition-colors"><i class="fab fa-telegram-plane"></i></a>' +
              '<a href="https://x.com/The_AllianceDAO" target="_blank" rel="noopener noreferrer" aria-label="X" class="text-gray-500 hover:text-white transition-colors"><i class="fab fa-twitter"></i></a>' +
              '<a href="https://github.com/thealliancedao" target="_blank" rel="noopener noreferrer" aria-label="GitHub" class="text-gray-500 hover:text-white transition-colors"><i class="fab fa-github"></i></a>' +
            '</div>' +
          '</div>' +
          '<div class="md:col-span-3">' + colH('Site') + siteLinks + '</div>' +
          '<div class="md:col-span-4">' + colH('This project') +
            '<a href="https://github.com/thealliancedao" target="_blank" rel="noopener noreferrer" class="sf-prow"><i class="fab fa-github sf-pico"></i>Open source repo</a>' +
            '<a href="' + LOG_BASE + '/' + (PAGE_LOG[opts.page] || 'index-log.md') + '" target="_blank" rel="noopener" class="sf-prow"><i class="fas fa-clock-rotate-left sf-pico"></i>Changelog</a>' +
            '<a href="' + HUB + '" id="cronHealthTrigger" class="cron-health-trigger sf-prow" data-overall="unknown" title="View full System Health" style="text-decoration:none"><span class="dot sf-pico" style="margin:0"></span><span class="label">System Health</span></a>' +
            '<a href="https://t.me/The_AllianceDAO" target="_blank" rel="noopener noreferrer" class="sf-prow"><i class="fab fa-telegram-plane sf-pico"></i>Alliance Contact</a>' +
            // v3.2: the builder's direct line (owner request 2026-08-23)
            '<a href="https://t.me/DeFi_Patriot" target="_blank" rel="noopener noreferrer" class="sf-prow" title="Telegram"><i class="fab fa-telegram-plane sf-pico"></i>@DeFi_Patriot \u00b7 Telegram</a>' +
            '<a href="https://x.com/DeFi_Patriot" target="_blank" rel="noopener noreferrer" class="sf-prow" title="X"><i class="fab fa-twitter sf-pico"></i>@DeFi_Patriot \u00b7 X</a>' +
            (opts.appInfo ? '<button id="app-info-trigger" class="sf-prow" style="background:none;border:0;padding:0;cursor:pointer;font:inherit"><i class="fas fa-mobile-alt sf-pico"></i>App</button>' : '') +
          '</div>' +
        '</div>' +

        // ── row 1a½: the builder's note (v3.4, owner 2026-08-25) — said once, plainly, with a copyable address ──
        '<div class="mt-6 pt-5 border-t border-gray-800/70 text-center">' +
          '<div class="text-[14px] text-gray-200 leading-relaxed max-w-3xl mx-auto">' +
            'This site is built, hosted and maintained by <span class="text-cyan-300 font-semibold">DeFi_Patriot</span>, for the community \u2014 the crons, the hosting, the help bot, community promotions and giveaways, and the hours of work. ' +
            'If it has been useful to you and you feel like helping keep the lights on, anything helps and would be greatly appreciated \u2014 it keeps this running, and keeps me motivated to build more of it. ' +
            'Any token found in TLA is welcome. Thank you, sincerely \u2014 DeFi_Patriot.' +
          '</div>' +
          '<div class="text-[13px] text-gray-300 mt-2">Write <code class="mono text-amber-300 bg-white/[0.05] px-1.5 py-0.5 rounded">thanks_defi</code> in the memo and your gift is tracked on chain and showcased on the <a href="supporters.html" class="text-cyan-300 hover:underline font-semibold">Supporters page</a>.</div>' +
          '<div class="mt-3 flex items-center justify-center gap-2 flex-wrap text-[12px]">' +
            '<span class="text-gray-500">Terra</span>' +
            '<code id="sf-donate-addr" class="mono text-[12px] text-cyan-300 bg-white/[0.05] px-2.5 py-1 rounded">terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw</code>' +
            '<button type="button" id="sf-donate-copy" class="sf-prow" style="background:none;border:0;padding:0;cursor:pointer;font:inherit" title="copy the address"><i class="fas fa-copy sf-pico"></i>copy</button>' +
          '</div>' +
        '</div>' +

        // ── row 1b: ecosystem banner (v3.2) ───────────────────────────────
        '<div class="mt-8 pt-5 border-t border-gray-800/70">' + colH('Ecosystem') +
          '<div class="sf-eco-row">' + ecoTiles + '</div>' +
        '</div>' +

        // ── row 2: the protections ────────────────────────────────────────
        '<div class="mt-10 pt-6 border-t border-gray-800/70 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4 text-left">' +
          '<div><h5 class="text-[11px] font-bold text-gray-400 mb-1">Not financial advice</h5><p class="text-[11px] leading-relaxed text-gray-600">Informational only. Nothing here is a recommendation to buy, sell, or hold anything. Do your own research; act at your own risk.</p></div>' +
          '<div><h5 class="text-[11px] font-bold text-gray-400 mb-1">Data as-is, from third parties</h5><p class="text-[11px] leading-relaxed text-gray-600">Figures come from on-chain endpoints and external services outside our control \u2014 they can be delayed, incomplete, or wrong. No warranty; verify against the source before acting. Missing data shows blank, never an estimate dressed as a fact.</p></div>' +
          '<div><h5 class="text-[11px] font-bold text-gray-400 mb-1">No wallet, no accounts</h5><p class="text-[11px] leading-relaxed text-gray-600">Never asks you to connect a wallet, create an account, or share personal information. Everything shown is public on-chain data \u2014 including wallet holdings, which are public by nature. Hosting collects only anonymous, aggregate page metrics. Community-built \u2014 not an official voice of any council or protocol.</p></div>' +
          '<div><h5 class="text-[11px] font-bold text-gray-400 mb-1">Open source, open door</h5><p class="text-[11px] leading-relaxed text-gray-600">Capture code and every dataset are public \u2014 review, reference, or reuse any part. Built to host other NFT collections (explorer, analytics, DAO tooling): onboarding is config, not code. <a href="https://github.com/thealliancedao" target="_blank" rel="noopener noreferrer" class="text-cyan-500 hover:text-cyan-300 underline">github.com/thealliancedao</a></p></div>' +
        '</div>' +

        // ── row 3: bottom bar ─────────────────────────────────────────────
        '<div class="mt-6 pt-4 border-t border-gray-800/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-gray-600">' +
          '<span>\u00a9 ' + new Date().getFullYear() + ' \u00b7 community-built \u00b7 not financial advice \u00b7 data as-is</span>' +
          '<span class="font-mono text-gray-600" id="page-rev">Rev ' + (opts.rev || '\u2014') + (opts.revDate ? ' \u00b7 ' + opts.revDate : '') + ' \u00b7 ' + (opts.page || 'page') + '</span>' +
        '</div>' +

      '</div></footer>';
  }

  // Minimal styling so the dot renders identically on pages without index's CSS.
  // Font Awesome isn't loaded on the standalone pages (transparency-hub,
  // system-health), so the social <i> icons would render as empty boxes.
  // Inject it once, from the same CDN the other pages use.
  function ensureIcons() {
    if (doc.querySelector('link[href*="font-awesome"], link[href*="fontawesome"]')) return;
    var l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    l.crossOrigin = 'anonymous';
    l.referrerPolicy = 'no-referrer';
    doc.head.appendChild(l);
  }

  function ensureStyle() {
    if (doc.getElementById('sf-style')) return;
    var st = doc.createElement('style');
    st.id = 'sf-style';
    st.textContent =
      '.sf-prow{display:flex;align-items:center;gap:.5em;padding:.15em 0;color:#9ca3af;font-size:.875rem;line-height:1.4;transition:color .15s;text-decoration:none}.sf-prow:hover{color:#67e8f9}' +
      '.sf-pico{width:1.1em;text-align:center;font-size:.8em;color:#4b5563;flex:0 0 auto}.sf-prow:hover .sf-pico{color:#67e8f9}' +
      // v3.2 ecosystem banner: scrolls sideways on narrow screens, wraps on wide ones.
      '.sf-eco-row{display:flex;gap:.5rem;overflow-x:auto;padding-bottom:.25rem;scrollbar-width:thin;-webkit-overflow-scrolling:touch}@media(min-width:768px){.sf-eco-row{flex-wrap:wrap;overflow:visible}}' +
      '.sf-eco{flex:0 0 auto;display:inline-flex;align-items:center;gap:.5rem;padding:.4rem .75rem .4rem .45rem;border:1px solid rgba(148,163,184,.16);border-radius:999px;background:rgba(17,24,39,.55);color:#9ca3af;font-size:.8rem;font-weight:600;text-decoration:none;transition:transform .15s,border-color .15s,color .15s}' +
      '.sf-eco:hover{color:#e5e7eb;border-color:rgba(34,211,238,.55);transform:translateY(-1px)}' +
      '.sf-eco img,.sf-eco .sf-eco-mark{width:1.5rem;height:1.5rem;border-radius:999px;object-fit:contain;background:rgba(255,255,255,.04);flex:0 0 auto}' +
      '.sf-eco .sf-eco-mark{display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800;color:#67e8f9;background:rgba(34,211,238,.12)}' +
      // The footer must look the SAME on Tailwind pages (index, tla-stats) and
      // on the standalone pages (transparency-hub, system-health) which have no
      // Tailwind at all — there, the utility classes were inert and the footer
      // rendered as unspaced left-aligned text. These rules are scoped to
      // .sf-footer so they never fight a page's own styles.
      '.sf-footer{border-top:1px solid rgba(148,163,184,.14);margin-top:48px;padding:28px 16px;text-align:center;color:#9ca3af;font-family:inherit}' +
      '.sf-footer .sf-social{display:flex;justify-content:center;align-items:center;gap:24px;margin-bottom:16px}' +
      '.sf-footer .sf-social a{color:#9ca3af;font-size:26px;text-decoration:none;transition:color .15s}' +
      '.sf-footer .sf-social a:hover{color:#fff}' +
      '.sf-footer .sf-links{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px 24px;font-size:14px}' +
      '.sf-footer .sf-links a{color:#9ca3af;text-decoration:none;transition:color .15s}' +
      '.sf-footer .sf-links a:hover{color:#fff;text-decoration:underline}' +
      '.sf-footer .sf-meta{margin-top:16px;font-size:12px;color:#6b7280;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px 10px}' +
      '.sf-footer .sf-meta a{color:inherit;text-decoration:none;transition:color .15s}' +
      '.sf-footer .sf-meta a:hover{color:#22d3ee}' +
      '.sf-footer .sf-sep{opacity:.4}' +
      '.sf-footer .sf-rev{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}' +
      '.cron-health-trigger{display:inline-flex;align-items:center;gap:6px;color:inherit;transition:color .15s}' +
      '.cron-health-trigger:hover{color:#22d3ee}' +
      '.cron-health-trigger .dot{width:8px;height:8px;border-radius:50%;background:#6b7280;display:inline-block;flex:0 0 auto}' +
      '.cron-health-trigger[data-overall="fresh"] .dot{background:#22c55e}' +
      '.cron-health-trigger[data-overall="warning"] .dot{background:#f59e0b}' +
      '.cron-health-trigger[data-overall="stale"] .dot{background:#ef4444}' +
      '.cron-health-trigger[data-overall="ok"] .dot{background:#22c55e}' +
      '.cron-health-trigger[data-overall="watch"] .dot{background:#f59e0b}' +
      '.cron-health-trigger[data-overall="degraded"] .dot{background:#ef4444}';
    doc.head.appendChild(st);
  }

  // Light the dot from the SHARED registry — identical rules on every page.
  // PERF (owner HARs 2026-08-22): pages call wireHealth from several places (mount, their own
  // footer hook, a retry) — each call re-fetched all ~12 heartbeats (3× on every page). One
  // in-flight/recent fetchAll is shared for 60s; callers past that window refresh normally.
  var _healthFetch = null, _healthAt = 0;
  function healthResults() {
    if (_healthFetch && Date.now() - _healthAt < 60000) return _healthFetch;
    _healthAt = Date.now(); _healthFetch = root.CronRegistry.fetchAll(); return _healthFetch;
  }
  function wireHealth() {
    try { ensureHelpBubble(); } catch (e) {}   // pages that only wireHealth (index) get the bubble too
    if (!root.CronRegistry) return;
    healthResults().then(function (results) {
      var sum = root.CronRegistry.summarize(results);
      // v3.4: copy the builder's address
      var dc = doc.getElementById('sf-donate-copy');
      if (dc) dc.addEventListener('click', function () { var a = doc.getElementById('sf-donate-addr'); var t = a ? a.textContent : ''; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { dc.innerHTML = '<i class="fas fa-check sf-pico"></i>copied'; setTimeout(function () { dc.innerHTML = '<i class="fas fa-copy sf-pico"></i>copy'; }, 1500); }).catch(function () {}); });
      var trigger = doc.getElementById('cronHealthTrigger');
      if (!trigger) return;
      // index.html's own CSS keys off data-overall="fresh|warning|stale|
      // stuck|no-signal|unknown" — NOT the registry's ok/watch/degraded. Setting
      // the registry vocabulary left every dot on its default (red). Map to the
      // CSS vocabulary, and set both so either stylesheet lights correctly.
      var CSS_STATE = { ok: 'fresh', watch: 'warning', degraded: 'stale' };
      trigger.setAttribute('data-overall', CSS_STATE[sum.overall] || sum.overall);
      trigger.setAttribute('data-health', sum.overall);
      var label = trigger.querySelector('.label');
      if (label) label.textContent = 'System Health';
      var findings = (sum.findings || []).length;
      trigger.title = sum.confidence + '% · ' +
        (sum.attention.length ? sum.attention.length + ' need attention' : 'all jobs reporting on time') +
        (findings ? ' · ' + findings + ' reported finding' + (findings > 1 ? 's' : '') : '') +
        ' — click for detail';
    }).catch(function () { /* the footer must never break a page */ });
  }

  // Floating Help bubble (2026-08-20, owner request): Help was buried in the
  // footer link row. Every page that loads this script now gets a fixed
  // bottom-right "?" bubble linking to help.html — one implementation, every
  // page, zero per-page wiring. Hidden on help.html itself.
  function ensureHelpBubble() {
    if (doc.getElementById('help-bubble')) return;
    if (/\/help\.html/.test(root.location && root.location.pathname || '')) return;
    // Dismissible for THIS visit only (sessionStorage) — never a permanent hide: a new
    // tab/visit brings it back. Owner: "make sure it's not a cached hide".
    try { if (root.sessionStorage.getItem('tla_help_bubble_hidden') === '1') return; } catch (e) {}
    var a = doc.createElement('a');
    a.id = 'help-bubble';
    a.href = 'help.html';
    a.title = 'Help & Support — FAQ, ask the assistant, report an issue';
    a.innerHTML = '<i class="fas fa-circle-question"></i><span class="hb-label">Help</span>' +
      '<span id="hb-x" title="Hide for this visit" aria-label="Hide help button for this visit" style="margin-left:4px;padding:2px 5px;border-radius:9999px;color:#64748b;font-size:12px;line-height:1">&times;</span>';
    a.setAttribute('style',
      'position:fixed;bottom:18px;right:18px;z-index:60;display:inline-flex;align-items:center;gap:7px;' +
      'padding:10px 14px;border-radius:9999px;background:rgba(13,17,23,.92);border:1px solid rgba(34,211,238,.35);' +
      'color:#67e8f9;font-weight:600;font-size:13px;text-decoration:none;box-shadow:0 4px 20px rgba(0,0,0,.5), 0 0 12px rgba(34,211,238,.12);' +
      'backdrop-filter:blur(8px);transition:transform .15s, box-shadow .15s;');
    a.onmouseenter = function () { a.style.transform = 'scale(1.06)'; a.style.boxShadow = '0 6px 24px rgba(0,0,0,.55), 0 0 18px rgba(34,211,238,.25)'; };
    a.onmouseleave = function () { a.style.transform = ''; a.style.boxShadow = '0 4px 20px rgba(0,0,0,.5), 0 0 12px rgba(34,211,238,.12)'; };
    a.onclick = function (ev) {
      ev.preventDefault();
      if (ev.target && ev.target.id === 'hb-x') { try { root.sessionStorage.setItem('tla_help_bubble_hidden', '1'); } catch (e) {} a.remove(); return; }
      openHelpDrawer();
    };
    doc.body.appendChild(a);
  }

  // ---- In-page Help DRAWER (2026-08-20, owner request) ----------------------
  // The bubble now opens a slide-over ON the current page — you keep looking at
  // the thing you have a question about while you ask it. The drawer tells the
  // agent WHICH page+tab you're viewing, and carries a wallet picker
  // (searchable by registered name or address from the participants feed);
  // a pinned wallet is sent with every question so answers cater to it.
  var members = null, walletPinned = null, discOk = false, chatBusy = false;
  // 2026-08-21 (SPEC-unified-header): the drawer follows the GLOBAL selection —
  // the header picker's wallet ('tla:selected_wallet') — so the assistant answers
  // for whoever the site is showing. Legacy 'tla_help_wallet' is migrated once.
  var GLOBAL_KEY = 'tla:selected_wallet';
  try {
    walletPinned = root.localStorage.getItem(GLOBAL_KEY) || null;
    var legacy = root.localStorage.getItem('tla_help_wallet');
    if (!walletPinned && legacy) { walletPinned = legacy; root.localStorage.setItem(GLOBAL_KEY, legacy); }
    if (legacy) root.localStorage.removeItem('tla_help_wallet');
  } catch (e) {}
  root.addEventListener('tla:wallet', function (ev) { walletPinned = ev.detail && ev.detail.wallet || null; renderWalletRow(); });
  try { discOk = root.localStorage.getItem('tla_help_disclaimer_v1') === 'accepted'; } catch (e) {}

  function drawerWide() { try { return root.localStorage.getItem('tla_help_wide') === '1'; } catch (e) { return false; } }
  function drawerHtml() {
    return '' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)">' +
        '<div style="font-weight:700;font-size:14px;color:#e5e7eb"><i class="fas fa-circle-question" style="color:#22d3ee;margin-right:8px"></i>Help — ask about this page</div>' +
        '<div><a href="address-catalog.html" title="Every address this site knows, and how it knows it" style="font-size:11px;color:#67e8f9;text-decoration:none;margin-right:12px"><i class="fas fa-address-book" style="margin-right:4px"></i>Address catalog</a>' +
        '<a href="help.html" style="font-size:11px;color:#67e8f9;text-decoration:none;margin-right:12px">Full help ↗</a>' +
        '<span id="hd-wide" title="Wider panel — easier to read long answers" style="cursor:pointer;color:#6b7280;font-size:13px;margin-right:10px"><i class="fas fa-up-right-and-down-left-from-center"></i></span>' +
        '<span id="hd-close" style="cursor:pointer;color:#6b7280;font-size:16px">&times;</span></div>' +
      '</div>' +
      '<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06)">' +
        '<div id="hd-wallet-row"></div>' +
      '</div>' +
      '<div id="hd-log" style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:1.5"></div>' +
      '<div id="hd-disc" style="display:none;padding:12px 16px;border-top:1px solid rgba(255,255,255,.08)"></div>' +
      // Composer (2026-08-21 mobile pass): auto-growing textarea at 16px —
      // long questions stay fully readable and scrollable before sending, and
      // 16px is the iOS threshold below which focusing an input zooms the page.
      '<div style="padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:8px;align-items:flex-end">' +
        '<textarea id="hd-input" rows="1" placeholder="Ask about what you\'re looking at… or paste a proposal\'s messages to audit it" style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;color:#e5e7eb;font-size:16px;line-height:1.45;outline:none;resize:none;max-height:160px;overflow-y:auto;font-family:inherit"></textarea>' +
        '<button id="hd-send" aria-label="Send" style="background:rgba(34,211,238,.15);border:1px solid rgba(34,211,238,.3);color:#67e8f9;border-radius:10px;min-width:44px;min-height:44px;font-size:14px;cursor:pointer;flex:0 0 auto"><i class="fas fa-paper-plane"></i></button>' +
      '</div>' +
      '<div id="hd-status" style="padding:0 16px 10px;font-size:10px;color:#4b5563"></div>';
  }

  function renderWalletRow() {
    var row = doc.getElementById('hd-wallet-row'); if (!row) return;
    if (walletPinned) {
      var nm = null;
      if (members) for (var i = 0; i < members.length; i++) if (members[i].address === walletPinned) nm = members[i].name;
      row.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);border-radius:9999px;padding:4px 10px;font-size:11px;color:#67e8f9">' +
        '<i class="fas fa-wallet"></i>' + (nm ? nm + ' · ' : '') + walletPinned.slice(0, 12) + '… ' +
        '<span id="hd-wallet-x" style="cursor:pointer;color:#9ca3af">&times;</span></span>' +
        '<span style="font-size:10px;color:#6b7280;margin-left:8px">answers cater to this wallet</span>';
      doc.getElementById('hd-wallet-x').onclick = function () {
        walletPinned = null;
        if (root.AddressPicker) { try { root.AddressPicker.clear(); } catch (e) {} }
        else { try { root.localStorage.removeItem(GLOBAL_KEY); } catch (e) {} }
        renderWalletRow();
      };
    } else if (root.AddressPicker) {
      // Same picker UI as the header: no second search box in the drawer.
      row.innerHTML = '<button type="button" id="hd-wallet-pick" style="display:inline-flex;align-items:center;gap:8px;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.3);border-radius:9999px;padding:6px 12px;font-size:11px;color:#67e8f9;cursor:pointer;font-family:inherit"><i class="fas fa-user-magnifying-glass"></i>Choose an address — answers will cater to it</button>' +
        '<span style="font-size:10px;color:#6b7280;margin-left:8px">optional · same selection as the header</span>';
      doc.getElementById('hd-wallet-pick').onclick = function () { try { root.AddressPicker.openPanel(); } catch (e) {} };
    } else {
      row.innerHTML = '<input id="hd-wallet-in" list="hd-wallet-list" placeholder="Pick a wallet (search name or terra1… address) — optional" ' +
        'style="width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 9px;color:#e5e7eb;font-size:12px;outline:none">' +
        '<datalist id="hd-wallet-list"></datalist>';
      var inp = doc.getElementById('hd-wallet-in');
      inp.onfocus = function () { loadMembers(); };
      inp.onchange = function () {
        var v = inp.value.trim();
        var addr = null;
        if (/^terra1[a-z0-9]{38,58}$/.test(v)) addr = v;
        else if (members) for (var i = 0; i < members.length; i++) {
          var m = members[i];
          if ((m.name && (m.name + ' · ' + m.address) === v) || m.name === v || m.address === v) { addr = m.address; break; }
        }
        if (addr) {
          walletPinned = addr;
          if (root.AddressPicker) { try { root.AddressPicker.select(addr); } catch (e) {} }   // header follows
          else { try { root.localStorage.setItem(GLOBAL_KEY, addr); } catch (e) {} }
          renderWalletRow();
        }
      };
      if (members) fillList();
    }
  }
  function fillList() {
    var dl = doc.getElementById('hd-wallet-list'); if (!dl || !members) return;
    var html = '';
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      html += '<option value="' + (m.name ? (m.name + ' · ' + m.address) : m.address) + '"></option>';
    }
    dl.innerHTML = html;
  }
  function loadMembers() {
    if (members) return;
    fetch(PARTICIPANTS_URL + '?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        members = (d.participants || []).map(function (x) { return { address: x.address, name: x.name || null }; })
          .sort(function (a, b) { return (b.name ? 1 : 0) - (a.name ? 1 : 0); });
        fillList();
      }).catch(function () {});
  }

  // Rich answer renderer (2026-08-20): the model emits markdown + full
  // addresses/hashes per its trust-link protocol. Escape FIRST, then format:
  // **bold**, `code`, [links](https), bullets, and auto-detected terra1
  // addresses / 64-hex tx hashes become copyable mono chips with a chain link.
  function fmtAnswer(el, raw) {
    var t = String(raw)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    t = t.replace(/\[([^\]]{1,80})\]\((https:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" style="color:#67e8f9;text-decoration:underline">$1</a>');
    t = t.replace(/\*\*([^*]{1,200})\*\*/g, '<b style="color:#e5e7eb">$1</b>');
    t = t.replace(/`([^`]{1,120})`/g, '<code style="background:rgba(255,255,255,.07);padding:1px 5px;border-radius:4px;font-size:.92em">$1</code>');
    t = t.replace(/\b(terra1[a-z0-9]{38,58})\b(?![^<]*<\/a>)/g, function (m) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:1px 6px;font-family:monospace;font-size:.85em;word-break:break-all">' + m +
        ' <i class="fas fa-copy" data-copy="' + m + '" title="Copy address" style="cursor:pointer;color:#6b7280"></i>' +
        ' <a href="https://chainsco.pe/terra2/address/' + m + '" target="_blank" rel="noopener" title="View on chain" style="color:#67e8f9"><i class="fas fa-arrow-up-right-from-square"></i></a>' +
        ' <a href="address-catalog.html?q=' + m + '" title="How this site knows this address (catalog)" style="color:#a78bfa"><i class="fas fa-address-book"></i></a></span>';
    });
    t = t.replace(/\b([A-F0-9]{64})\b(?![^<]*<\/a>)/g, function (m) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:1px 6px;font-family:monospace;font-size:.85em;word-break:break-all">' + m.slice(0, 10) + '…' + m.slice(-6) +
        ' <i class="fas fa-copy" data-copy="' + m + '" title="Copy tx hash" style="cursor:pointer;color:#6b7280"></i>' +
        ' <a href="https://chainsco.pe/terra2/tx/' + m + '" target="_blank" rel="noopener" title="View tx" style="color:#67e8f9"><i class="fas fa-arrow-up-right-from-square"></i></a></span>';
    });
    t = t.replace(/(^|\n)\s*[-*]\s+/g, '$1&bull; ');
    t = t.replace(/\n/g, '<br>');
    el.innerHTML = t;
    var copies = el.querySelectorAll('[data-copy]');
    for (var i = 0; i < copies.length; i++) (function (ic) {
      ic.onclick = function () {
        try { navigator.clipboard.writeText(ic.getAttribute('data-copy')); ic.style.color = '#34d399';
          setTimeout(function () { ic.style.color = '#6b7280'; }, 900); } catch (e) {}
      };
    })(copies[i]);
  }

  function hdMsg(txt, who) {
    var log = doc.getElementById('hd-log'); if (!log) return null;
    var d = doc.createElement('div');
    d.setAttribute('style', 'border-radius:10px;padding:7px 10px;max-width:88%;' +
      (who === 'you' ? 'align-self:flex-end;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.2);color:#e5e7eb'
                     : 'align-self:flex-start;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#d1d5db'));
    d.textContent = txt;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    return d;
  }

  function showDisc(onAccept) {
    var box = doc.getElementById('hd-disc'); if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<div id="hd-disc-s" style="max-height:130px;overflow-y:auto;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px;font-size:11px;color:#9ca3af;line-height:1.5">' +
      '<b style="color:#d1d5db">Before you ask:</b> this assistant provides information about the site and its data — never investment, financial, legal, or tax advice. Data comes from community-run captures and public nodes and can be wrong; verify on chain before acting. No advisory relationship is created; DeFi involves substantial risk including total loss; the maintainer and contributors accept no liability for decisions made from these answers. Wallet addresses are used only to read public data for your answer; nothing is stored. Scroll to the end to enable Accept. See the full terms on the Help page.</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">' +
      '<button id="hd-disc-ok" disabled style="opacity:.4;background:rgba(34,211,238,.15);border:1px solid rgba(34,211,238,.3);color:#67e8f9;border-radius:8px;padding:6px 12px;font-size:12px;cursor:not-allowed">I understand and accept</button></div>';
    var sc = doc.getElementById('hd-disc-s'), ok = doc.getElementById('hd-disc-ok');
    sc.addEventListener('scroll', function () {
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 6) { ok.disabled = false; ok.style.opacity = '1'; ok.style.cursor = 'pointer'; }
    });
    if (sc.scrollHeight <= sc.clientHeight + 6) { ok.disabled = false; ok.style.opacity = '1'; ok.style.cursor = 'pointer'; }
    ok.onclick = function () {
      discOk = true; try { root.localStorage.setItem('tla_help_disclaimer_v1', 'accepted'); } catch (e) {}
      box.style.display = 'none'; onAccept();
    };
  }

  function hdAsk() {
    var inp = doc.getElementById('hd-input');
    var q = (inp.value || '').trim(); if (!q || chatBusy) return;
    if (!discOk) { showDisc(function () { hdAsk(); }); return; }
    inp.value = ''; inp.style.height = 'auto';   // collapse the grown composer back to one row
    hdMsg(q, 'you');
    var hold = hdMsg('…', 'bot');
    chatBusy = true;
    var page = (root.location && (root.location.pathname + (root.location.hash || ''))) || '';
    fetch(AGENT_URL + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, accepted_disclaimer: true, wallet: walletPinned || undefined, page: page }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.answer) fmtAnswer(hold, d.answer); else hold.textContent = d.error || 'No answer returned.';
        var st = doc.getElementById('hd-status');
        if (st && d.rate_used && d.rate_limit) st.textContent = 'questions this hour: ' + d.rate_used + ' / ' + d.rate_limit + ' · shared community budget';
        if (d.rate_used === 5) hdMsg('Heads up — that\'s 5 of your ' + d.rate_limit + ' this hour. Shared, budget-capped resource: the Help page FAQ answers most things instantly. Thanks for keeping it available for everyone.', 'bot');
      })
      .catch(function () {
        // Cold start self-heal (2026-08-20): free hosting sleeps when idle and
        // takes ~30-60s to wake — the first request often lands mid-boot.
        // Instead of asking the visitor to retry, wait out the wake and retry
        // ONCE automatically.
        hold.textContent = 'Waking the assistant (free hosting sleeps when idle) — retrying automatically in ~30s…';
        setTimeout(function () {
          fetch(AGENT_URL + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: q, accepted_disclaimer: true, wallet: walletPinned || undefined, page: page }) })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d.answer) fmtAnswer(hold, d.answer); else hold.textContent = d.error || 'No answer returned.'; })
            .catch(function () { hold.textContent = 'Still unreachable — the service may be down rather than sleeping. The report form on the Help page always works.'; })
            .then(function () { chatBusy = false; });
        }, 30000);
        return;
      })
      .then(function (d) { if (d !== undefined || !chatBusy) chatBusy = false; });
  }

  // Mobile pass (2026-08-21, owner direction): a 400px side drawer is the
  // wrong shape for a phone. On narrow viewports the drawer becomes a
  // FULL-SCREEN help sheet sliding up from the bottom — chat fills the screen,
  // the composer sits above the keyboard (100dvh, the address-bar-safe unit),
  // tap targets are thumb-sized. Desktop keeps the beside-the-content
  // slide-over exactly as before. One drawer, two shapes.
  function drawerIsMobile() {
    try { return (root.innerWidth || 1024) <= 640; } catch (e) { return false; }
  }
  function drawerOff(d) { return d.getAttribute('data-shape') === 'sheet' ? 'translateY(100%)' : 'translateX(100%)'; }
  function drawerOn(d)  { return d.getAttribute('data-shape') === 'sheet' ? 'translateY(0)'    : 'translateX(0)'; }

  function openHelpDrawer() {
    var ex = doc.getElementById('help-drawer');
    if (ex) { ex.style.transform = drawerOn(ex); return; }
    var mobile = drawerIsMobile();
    var d = doc.createElement('div');
    d.id = 'help-drawer';
    d.setAttribute('data-shape', mobile ? 'sheet' : 'panel');
    d.setAttribute('style', mobile
      // full-screen sheet: covers the page, slides up, dvh keeps the composer
      // visible above mobile browser chrome and the software keyboard
      ? 'position:fixed;left:0;right:0;bottom:0;width:100vw;height:100dvh;z-index:70;display:flex;flex-direction:column;' +
        'background:rgba(8,10,14,.99);transform:translateY(100%);transition:transform .25s ease;'
      : 'position:fixed;top:0;right:0;bottom:0;width:min(' + (drawerWide() ? '760px' : '400px') + ',94vw);z-index:70;display:flex;flex-direction:column;transition:transform .25s ease,width .2s ease;' +
        'background:rgba(10,12,16,.97);border-left:1px solid rgba(34,211,238,.2);box-shadow:-8px 0 40px rgba(0,0,0,.6);' +
        'backdrop-filter:blur(10px);transform:translateX(100%);transition:transform .25s ease;');
    d.innerHTML = drawerHtml();
    doc.body.appendChild(d);
    (root.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () { d.style.transform = drawerOn(d); });
    doc.getElementById('hd-close').onclick = function () { d.style.transform = drawerOff(d); };
    var wbtn = doc.getElementById('hd-wide');
    if (wbtn) { if (mobile) wbtn.style.display = 'none'; wbtn.onclick = function () { var w = !drawerWide(); try { root.localStorage.setItem('tla_help_wide', w ? '1' : '0'); } catch (e) {} d.style.width = 'min(' + (w ? '760px' : '400px') + ',94vw)'; wbtn.style.color = w ? '#67e8f9' : '#6b7280'; }; wbtn.style.color = drawerWide() ? '#67e8f9' : '#6b7280'; }
    if (mobile) {
      // thumb-sized close on the sheet — the × is the only way back
      var x = doc.getElementById('hd-close');
      x.style.fontSize = '22px'; x.style.padding = '8px 10px';
    }
    doc.getElementById('hd-send').onclick = hdAsk;
    var inp = doc.getElementById('hd-input');
    var grow = function () { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 160) + 'px'; };
    inp.addEventListener('input', grow);
    // Desktop: Enter sends, Shift+Enter = newline. Touch: Enter wraps —
    // thumbs expect the keyboard's return key to make a newline; the send
    // button is the send.
    var coarse = false;
    try { coarse = root.matchMedia && root.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey && !coarse) { ev.preventDefault(); hdAsk(); }
    });
    renderWalletRow();
    hdMsg('Ask about anything on this page — I can see which page you\'re on. Pin a wallet above and answers cater to it.', 'bot');
  }

  function mount(opts) {
    opts = opts || {};
    var host = doc.getElementById(opts.mountId || 'site-footer');
    if (host) { ensureStyle(); ensureIcons(); host.innerHTML = html(opts); }
    ensureHelpBubble();
    wireHealth();
  }

  root.SiteFooter = { mount: mount, wireHealth: wireHealth, PAGE_LOG: PAGE_LOG, AGENT_URL: AGENT_URL, openHelpDrawer: openHelpDrawer };
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
