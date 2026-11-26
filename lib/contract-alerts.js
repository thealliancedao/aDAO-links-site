/* contract-alerts.js — the home page's "Contracts" tab.
 *
 * The owner (2026-11-26): "something next to the Props tab … when something is alerting it is glowing or showing it needs
 * attention, because by default it would be hidden. If no alerts are present or in the past 30 days then it is just a forward
 * to the contract watcher."
 *
 * What it does
 *   quiet   the tab is a plain link to Contract Watch. Nothing glows, nothing is counted.
 *   alert   one or more changes of the last 30 days are marked "needs a look" → the tab glows and carries their count; a click
 *           opens a panel in the home window that lists them (when · what · on which contract · how it was sent · why), each a
 *           link to that change on Contract Watch. The Props tab brings the props back.
 *
 * Where the list comes from: tla-core contract-watch/alerts.json — built by running the Contract Watch page itself against
 * the record (tla-core .github/scripts/contract-watch-alerts), so the rule for "needs a look" exists once, on that page. This
 * file only applies the 30-day window. If the file cannot be read the tab stays a plain link: no alert is ever invented.
 * No verdict, no motive, no person: the panel repeats the page's own sentences.
 *
 * API  ContractAlerts.pick(doc, nowMs, days) → { recent, older }                          pure
 *      ContractAlerts.mount({ src, tab, propsTab, card, hide, now, days, href, fetchJson }) → Promise<{ state, recent, older }>
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DAYS = 30, D = 864e5;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function hm(iso) { var d = new Date(iso); return isNaN(d) ? '' : ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2) + ' UTC'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  // the 30-day window, and nothing else: an entry needs a time, a key and a title to be shown; a time in the future is not "recent"
  function pick(doc, nowMs, days) {
    var list = doc && Array.isArray(doc.needs_look) ? doc.needs_look : [], from = nowMs - (days || DAYS) * D, recent = [], older = [];
    list.forEach(function (x) { var t = x && Date.parse(x.at); if (!x || !x.k || !x.title || !isFinite(t) || t > nowMs + D) return; (t >= from ? recent : older).push(x); });
    var byNewest = function (a, b) { return Date.parse(b.at) - Date.parse(a.at) || (b.height || 0) - (a.height || 0); };
    return { recent: recent.sort(byNewest), older: older.sort(byNewest) };
  }

  var CSS = [
    '.sh-subtab.ca-alert{color:#fbbf24;background:rgba(251,191,36,.10);box-shadow:inset 0 0 0 1px rgba(251,191,36,.55),0 0 10px rgba(251,191,36,.25);animation:caPulse 2.2s ease-in-out infinite}',
    '.sh-subtab.ca-alert:hover{color:#fde68a;background:rgba(251,191,36,.16)}',
    '.sh-subtab.ca-alert.active{color:#fde68a;background:rgba(251,191,36,.18);box-shadow:inset 0 0 0 1px rgba(251,191,36,.8);animation:none}',
    '.sh-subtab.ca-alert .ca-n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#fbbf24;color:#111827;font-size:13px;font-weight:800;line-height:1}',
    '@keyframes caPulse{0%,100%{box-shadow:inset 0 0 0 1px rgba(251,191,36,.45),0 0 6px rgba(251,191,36,.18)}50%{box-shadow:inset 0 0 0 1px rgba(251,191,36,.95),0 0 18px rgba(251,191,36,.5)}}',
    '@media (prefers-reduced-motion:reduce){.sh-subtab.ca-alert{animation:none}}',
    '#contract-alerts{font-size:14px;line-height:1.5;color:#cbd5e1}',
    '#contract-alerts h3{margin:0 0 .7rem;font-size:1.05rem;font-weight:700;color:#fde68a;display:flex;align-items:center;gap:.5rem}',
    '#contract-alerts .ca-list{list-style:none;margin:0 0 .8rem;padding:0;display:grid;gap:.55rem}',
    '#contract-alerts .ca-row{display:block;padding:.75rem .9rem;border-radius:12px;border:1px solid rgba(251,191,36,.35);border-left:3px solid #fbbf24;background:rgba(251,191,36,.05);color:inherit;text-decoration:none}',
    '#contract-alerts .ca-row:hover,#contract-alerts .ca-row:focus-visible{background:rgba(251,191,36,.11);outline:none;border-color:rgba(251,191,36,.7)}',
    '#contract-alerts .ca-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem .7rem}',
    '#contract-alerts .ca-when{font-family:ui-monospace,monospace;font-size:13px;color:#94a3b8;white-space:nowrap}',
    '#contract-alerts .ca-what{font-weight:700;color:#f8fafc;font-size:15px}',
    '#contract-alerts .ca-on{font-size:13px;color:#94a3b8}',
    '#contract-alerts .ca-how{margin-left:auto;font-size:13px;padding:.1rem .55rem;border-radius:999px;background:rgba(255,255,255,.07);color:#cbd5e1;white-space:nowrap}',
    '#contract-alerts .ca-why{margin:.35rem 0 0;padding:0;list-style:none;font-size:14px;color:#e2e8f0}',
    '#contract-alerts .ca-why li{padding-left:1.1em;position:relative}#contract-alerts .ca-why li:before{content:"\\2022";position:absolute;left:.2em;color:#fbbf24}',
    '#contract-alerts .ca-foot{margin:0;font-size:13px;color:#94a3b8}#contract-alerts .ca-foot a{color:#67e8f9;text-decoration:none}#contract-alerts .ca-foot a:hover{text-decoration:underline}',
    '@media(max-width:640px){#contract-alerts .ca-how{margin-left:0}}'
  ].join('');

  function panelHtml(sel, href) {
    var n = sel.recent.length, link = function (k) { return href + '#k=' + encodeURIComponent(k); };
    return '<h3><i class="fas fa-triangle-exclamation"></i>' + plural(n, 'contract change') + ' in the last 30 days need' + (n === 1 ? 's' : '') + ' a look</h3>' +
      '<ul class="ca-list">' + sel.recent.map(function (x) {
        return '<li><a class="ca-row" href="' + esc(link(x.k)) + '" data-ca-k="' + esc(x.k) + '"><div class="ca-top"><span class="ca-when">' + esc(day(x.at)) + ' · ' + esc(hm(x.at)) + '</span><span class="ca-what">' + esc(x.title) + '</span>' +
          (x.on ? '<span class="ca-on">' + esc(x.on) + '</span>' : '') + (x.how ? '<span class="ca-how">' + esc(x.how) + '</span>' : '') + '</div>' +
          ((x.why || []).length ? '<ul class="ca-why">' + x.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') + '</a></li>';
      }).join('') + '</ul>' +
      '<p class="ca-foot">' + (sel.older.length ? '<a href="' + esc(href) + '#att=look" data-ca="older">' + plural(sel.older.length, 'older change') + ' on record also need' + (sel.older.length === 1 ? 's' : '') + ' a look</a> · ' : '') +
      'The mark is not a verdict: <a href="' + esc(href) + '#cw-look-means">what “needs a look” means</a> · <a href="' + esc(href) + '" data-ca="open">Open Contract Watch <i class="fas fa-arrow-right" style="font-size:.85em"></i></a></p>';
  }

  function mount(opts) {
    opts = opts || {}; var doc = root.document; var href = opts.href || '/contract-watch.html';
    var q = function (s) { return s ? doc.querySelector(s) : null; };
    var tab = q(opts.tab || '#site-subnav [data-tab="contracts"]'), props = q(opts.propsTab || '#site-subnav [data-tab="alerts"]'), card = q(opts.card || '#alert-center-card');
    var quiet = function (why) { return { state: 'quiet', why: why || null, recent: [], older: [] }; };
    if (!tab || !card) return Promise.resolve(quiet('no tab'));
    var getJson = opts.fetchJson || function (u) { return root.fetch(u).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; }); };
    return Promise.resolve(getJson(opts.src)).then(function (data) {
      if (!data) return quiet('not read');
      var now = opts.now || Date.now(), sel = pick(data, now, opts.days || DAYS);
      if (!sel.recent.length) return { state: 'quiet', why: 'nothing in the window', recent: [], older: sel.older };
      if (!doc.getElementById('ca-css')) { var st = doc.createElement('style'); st.id = 'ca-css'; st.textContent = CSS; doc.head.appendChild(st); }
      var n = sel.recent.length;
      tab.classList.add('ca-alert'); tab.setAttribute('aria-controls', 'contract-alerts'); tab.setAttribute('role', 'button'); tab.setAttribute('aria-expanded', 'false');
      tab.setAttribute('title', plural(n, 'contract change') + ' in the last 30 days need' + (n === 1 ? 's' : '') + ' a look');
      if (!tab.querySelector('.ca-n')) { var b = doc.createElement('span'); b.className = 'ca-n'; b.textContent = String(n); b.setAttribute('aria-label', plural(n, 'alert')); tab.appendChild(b); }
      var panel = doc.getElementById('contract-alerts'); if (!panel) { panel = doc.createElement('div'); panel.id = 'contract-alerts'; panel.hidden = true; card.appendChild(panel); }
      panel.innerHTML = panelHtml(sel, href);
      var hidden = (opts.hide || ['#alert-center']).map(q).filter(Boolean);
      var show = function (on) {
        panel.hidden = !on; hidden.forEach(function (el) { el.style.display = on ? 'none' : ''; });
        tab.classList.toggle('active', on); tab.setAttribute('aria-expanded', on ? 'true' : 'false'); if (props) props.classList.toggle('active', !on);
      };
      tab.addEventListener('click', function (ev) { if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; ev.preventDefault(); show(panel.hidden); });   // a second click closes it; a modified click still opens the page
      if (props) props.addEventListener('click', function () { show(false); });
      return { state: 'alert', recent: sel.recent, older: sel.older, show: show };
    });
  }

  var API = { VERSION: VERSION, pick: pick, mount: mount, panelHtml: panelHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.ContractAlerts = API;
})(typeof window !== 'undefined' ? window : globalThis);
