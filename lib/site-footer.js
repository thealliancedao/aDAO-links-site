/* =============================================================================
 * lib/site-footer.js — ONE footer for every page.
 * -----------------------------------------------------------------------------
 * WHY (2026-08-12): footers had drifted badly. index carried a rev + a live
 * health dot; tla-stats had a different health widget with its own rules;
 * member-portfolio, dao_treasury, dao_tla_deposits and test had NO rev at all,
 * so there was no way to tell which version a member was looking at. Every page
 * now renders the same footer from this file.
 *
 * USAGE (one line per page, after lib/cron-registry.js):
 *   <script src="/lib/cron-registry.js"></script>
 *   <script src="/lib/site-footer.js"></script>
 *   <script>SiteFooter.mount({ rev: '3.78', page: 'index' });</script>
 * or just add <div id="site-footer"></div> and call mount().
 *
 * The health dot answers ONE question: is the data flowing? It is green when
 * every scheduled job is reporting on time. A product REPORTING A FINDING
 * (system-health flagging an invariant) is that job working correctly — that
 * shows as a separate note, never as a red dot. Freshness and findings are
 * different questions and the footer keeps them apart.
 * ============================================================================= */
(function (root, doc) {
  'use strict';

  var HUB = '/transparency-hub.html';
  var CHANGELOG_BASE = 'https://github.com/thealliancedao/tla-core/blob/main/docs/changelogs';

  // Which changelog belongs to which page — so "Changelog" always lands on the
  // right file instead of a generic repo page.
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
    'tla-catalog': 'catalog-log.md',
  };

  function el(tag, attrs, html) {
    var n = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }

  function mount(opts) {
    opts = opts || {};
    var host = doc.getElementById(opts.mountId || 'site-footer');
    if (!host) return;

    var log = PAGE_LOG[opts.page] || 'index-log.md';
    var rev = opts.rev || '—';
    var date = opts.revDate || '';

    host.innerHTML = '';
    host.appendChild(el('div', { class: 'sf-wrap', style:
      'display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:center;' +
      'padding:14px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b7280' },
      '<span class="sf-rev">Rev ' + rev + (date ? ' · ' + date : '') + '</span>' +
      '<a class="sf-link" href="' + CHANGELOG_BASE + '/' + log + '" target="_blank" rel="noopener" ' +
        'style="color:#9ca3af;text-decoration:none">Changelog</a>' +
      '<a class="sf-health" href="' + HUB + '" style="color:#9ca3af;text-decoration:none;display:inline-flex;align-items:center;gap:6px">' +
        '<span id="sf-dot" style="width:8px;height:8px;border-radius:50%;background:#6b7280;display:inline-block"></span>' +
        '<span id="sf-health-text">System Health</span></a>' +
      '<a class="sf-link" href="' + HUB + '#docs" style="color:#9ca3af;text-decoration:none">Docs</a>'
    ));

    // Live health — same registry every page uses, so the dot always agrees.
    if (root.CronRegistry) {
      root.CronRegistry.fetchAll().then(function (results) {
        var sum = root.CronRegistry.summarize(results);
        var dot = doc.getElementById('sf-dot');
        var txt = doc.getElementById('sf-health-text');
        if (!dot || !txt) return;
        var color = sum.overall === 'ok' ? '#22c55e' : (sum.overall === 'watch' ? '#f59e0b' : '#ef4444');
        dot.style.background = color;
        var label = sum.overall === 'ok'
          ? 'All systems reporting'
          : (sum.attention.length + ' need attention');
        // Findings are stated, not scored — a job reporting one is working.
        if (sum.findings && sum.findings.length && sum.overall === 'ok') {
          label = 'All systems reporting · ' + sum.findings.length + ' finding' + (sum.findings.length > 1 ? 's' : '');
        }
        txt.textContent = label;
        txt.parentElement.title = sum.confidence + '% — ' +
          results.map(function (r) { return r.label + ': ' + r.state; }).join(', ');
      }).catch(function () { /* footer must never break a page */ });
    }
  }

  root.SiteFooter = { mount: mount, PAGE_LOG: PAGE_LOG };
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
