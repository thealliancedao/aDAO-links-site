/* =============================================================================
 * lib/site-footer.js — ONE footer for every page (2026-08-12).
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

  var LINKS = [
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
    return '' +
      '<footer class="sf-footer py-6">' +
      '<div class="sf-inner max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">' +
        '<div class="sf-social flex justify-center items-center space-x-6 mb-4">' +
          '<a href="https://t.me/The_AllianceDAO" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors" aria-label="Telegram"><i class="fab fa-telegram-plane text-3xl"></i></a>' +
          '<a href="https://x.com/The_AllianceDAO" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors" aria-label="X"><i class="fab fa-twitter text-3xl"></i></a>' +
        '</div>' +
        '<div class="sf-links flex flex-wrap justify-center items-center space-x-6 text-sm">' + links + '</div>' +
        '<div class="sf-meta mt-4 text-xs text-gray-500">' +
          '<a href="' + LOG_BASE + '/' + log + '" target="_blank" rel="noopener" class="hover:text-cyan-400 transition-colors">' +
            '<span class="sf-rev font-mono" id="page-rev">' + rev + '</span>' +
            '<span class="sf-sep opacity-60 mx-1">·</span><span>Changelog</span></a>' +
          '<span class="sf-sep opacity-40 mx-2">·</span>' +
          '<a href="' + HUB + '" id="cronHealthTrigger" class="cron-health-trigger" data-overall="unknown" title="View full System Health" style="text-decoration:none">' +
            '<span class="dot"></span><span class="label">System Health</span></a>' +
          '<span class="sf-sep opacity-40 mx-2">·</span>' +
          '<a href="https://t.me/The_AllianceDAO" target="_blank" rel="noopener noreferrer" class="hover:text-cyan-400 transition-colors">Alliance Contact</a>' +
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
  function wireHealth() {
    if (!root.CronRegistry) return;
    root.CronRegistry.fetchAll().then(function (results) {
      var sum = root.CronRegistry.summarize(results);
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

  function mount(opts) {
    opts = opts || {};
    var host = doc.getElementById(opts.mountId || 'site-footer');
    if (host) { ensureStyle(); ensureIcons(); host.innerHTML = html(opts); }
    wireHealth();
  }

  root.SiteFooter = { mount: mount, wireHealth: wireHealth, PAGE_LOG: PAGE_LOG };
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
