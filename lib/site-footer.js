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
    try { ensureHelpBubble(); } catch (e) {}   // pages that only wireHealth (index) get the bubble too
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

  // Floating Help bubble (2026-08-20, owner request): Help was buried in the
  // footer link row. Every page that loads this script now gets a fixed
  // bottom-right "?" bubble linking to help.html — one implementation, every
  // page, zero per-page wiring. Hidden on help.html itself.
  function ensureHelpBubble() {
    if (doc.getElementById('help-bubble')) return;
    if (/\/help\.html/.test(root.location && root.location.pathname || '')) return;
    var a = doc.createElement('a');
    a.id = 'help-bubble';
    a.href = 'help.html';
    a.title = 'Help & Support — FAQ, ask the assistant, report an issue';
    a.innerHTML = '<i class="fas fa-circle-question"></i><span class="hb-label">Help</span>';
    a.setAttribute('style',
      'position:fixed;bottom:18px;right:18px;z-index:60;display:inline-flex;align-items:center;gap:7px;' +
      'padding:10px 14px;border-radius:9999px;background:rgba(13,17,23,.92);border:1px solid rgba(34,211,238,.35);' +
      'color:#67e8f9;font-weight:600;font-size:13px;text-decoration:none;box-shadow:0 4px 20px rgba(0,0,0,.5), 0 0 12px rgba(34,211,238,.12);' +
      'backdrop-filter:blur(8px);transition:transform .15s, box-shadow .15s;');
    a.onmouseenter = function () { a.style.transform = 'scale(1.06)'; a.style.boxShadow = '0 6px 24px rgba(0,0,0,.55), 0 0 18px rgba(34,211,238,.25)'; };
    a.onmouseleave = function () { a.style.transform = ''; a.style.boxShadow = '0 4px 20px rgba(0,0,0,.5), 0 0 12px rgba(34,211,238,.12)'; };
    a.onclick = function (ev) { ev.preventDefault(); openHelpDrawer(); };
    doc.body.appendChild(a);
  }

  // ---- In-page Help DRAWER (2026-08-20, owner request) ----------------------
  // The bubble now opens a slide-over ON the current page — you keep looking at
  // the thing you have a question about while you ask it. The drawer tells the
  // agent WHICH page+tab you're viewing, and carries a wallet picker
  // (searchable by registered name or address from the participants feed);
  // a pinned wallet is sent with every question so answers cater to it.
  var members = null, walletPinned = null, discOk = false, chatBusy = false;
  try { walletPinned = root.localStorage.getItem('tla_help_wallet') || null; } catch (e) {}
  try { discOk = root.localStorage.getItem('tla_help_disclaimer_v1') === 'accepted'; } catch (e) {}

  function drawerHtml() {
    return '' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)">' +
        '<div style="font-weight:700;font-size:14px;color:#e5e7eb"><i class="fas fa-circle-question" style="color:#22d3ee;margin-right:8px"></i>Help — ask about this page</div>' +
        '<div><a href="help.html" style="font-size:11px;color:#67e8f9;text-decoration:none;margin-right:12px">Full help ↗</a>' +
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
        '<textarea id="hd-input" rows="1" placeholder="Ask about what you\'re looking at…" style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;color:#e5e7eb;font-size:16px;line-height:1.45;outline:none;resize:none;max-height:160px;overflow-y:auto;font-family:inherit"></textarea>' +
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
        walletPinned = null; try { root.localStorage.removeItem('tla_help_wallet'); } catch (e) {}
        renderWalletRow();
      };
    } else {
      row.innerHTML = '<input id="hd-wallet-in" list="hd-wallet-list" placeholder="Pin a wallet (search name or terra1… address) — optional" ' +
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
        if (addr) { walletPinned = addr; try { root.localStorage.setItem('tla_help_wallet', addr); } catch (e) {}
          renderWalletRow(); }
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
        ' <a href="https://chainsco.pe/terra2/address/' + m + '" target="_blank" rel="noopener" title="View on chain" style="color:#67e8f9"><i class="fas fa-arrow-up-right-from-square"></i></a></span>';
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
      : 'position:fixed;top:0;right:0;bottom:0;width:min(400px,94vw);z-index:70;display:flex;flex-direction:column;' +
        'background:rgba(10,12,16,.97);border-left:1px solid rgba(34,211,238,.2);box-shadow:-8px 0 40px rgba(0,0,0,.6);' +
        'backdrop-filter:blur(10px);transform:translateX(100%);transition:transform .25s ease;');
    d.innerHTML = drawerHtml();
    doc.body.appendChild(d);
    (root.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () { d.style.transform = drawerOn(d); });
    doc.getElementById('hd-close').onclick = function () { d.style.transform = drawerOff(d); };
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
