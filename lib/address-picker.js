/* =============================================================================
 * lib/address-picker.js — the ONE address picker (SPEC-unified-header §4, step 2)
 * -----------------------------------------------------------------------------
 * Mounts a compact pill into the header's #sh-picker slot (or any container).
 * Typing searches the roster as you type; the selection is remembered and
 * broadcast so every page that takes an address reacts the same way.
 *
 * ROSTER (registry-first, one light product): catalog/snapshots/current.json —
 * every aDAO DAODAO staker, TLA lock holder, Pixel Lions and Lion DAO member,
 * handle where registered, group memberships. Unnamed rows show as the address.
 * (Enterprise stakers: queued as a catalog slug — not fetched from the 7MB
 * inventory here.) Cached in sessionStorage for the tab.
 *
 * MATCHING (§4.2):
 *   name  — case-insensitive PREFIX first ("d"→DeFi…, "de"→DeFi…), then substring
 *   terra — address prefix; a full pasted address not in the roster is accepted
 *   last4 — the final 4 chars typed left→right ("7ulw") OR right→left ("wlu7");
 *           both orders are tried, ties list every match
 *
 * SELECTION CONTRACT (§4.4): URL ?wallet= wins on load → localStorage
 * 'tla:selected_wallet' → window event 'tla:wallet' {wallet, name|null}.
 * × on the pill is always visible while a wallet is selected. "Save" pins the
 * wallet for add-to-home-screen use ('tla:saved_wallet'); it loads on open.
 *
 * USAGE:
 *   <script src="/lib/address-picker.js"></script>
 *   AddressPicker.mount({ onSelect: (w, name) => loadWallet(w) });
 *   AddressPicker.get() → { wallet, name } | null   ·  AddressPicker.set(wallet)
 *   AddressPicker.clear()  ·  window.addEventListener('tla:wallet', e => …)
 * ============================================================================= */
(function (root, doc) {
  'use strict';

  var ROSTER_URL = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/catalog/snapshots/current.json';
  var KEY_SEL = 'tla:selected_wallet', KEY_NAME = 'tla:selected_name', KEY_SAVED = 'tla:saved_wallet', KEY_ROSTER = 'tla:roster:v1';
  var GROUP = { adao: 'aDAO', tla_locks: 'TLA Lock', pixellions: 'Pixel Lions', liondao: 'Lion DAO' };
  var MAX_ROWS = 8;

  var CSS = [
    '.ap{position:relative;font-family:Outfit,system-ui,sans-serif}',
    '.ap-pill{display:flex;align-items:center;gap:.4rem;height:2.5rem;padding:0 .5rem 0 .75rem;border-radius:999px;background:rgba(31,41,55,.55);border:1px solid #374151;color:#e5e7eb;cursor:text;min-width:11rem;max-width:19rem}',
    '.ap-pill:focus-within,.ap-pill.open{border-color:rgba(34,211,238,.6);box-shadow:0 0 0 3px rgba(34,211,238,.12)}',
    '.ap-pill i.fa-magnifying-glass{color:#67e8f9;font-size:.8rem}',
    '.ap-in{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#f1f5f9;font-size:.85rem;font-family:inherit}',
    '.ap-in::placeholder{color:#64748b}',
    '.ap-in.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.78rem}',
    '.ap-x,.ap-save{flex:0 0 auto;width:1.6rem;height:1.6rem;border-radius:999px;border:0;background:transparent;color:#94a3b8;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:.75rem}',
    '.ap-x:hover{background:rgba(248,113,113,.15);color:#fca5a5}',
    '.ap-save:hover,.ap-save.on{color:#6ee7b7}.ap-save.on{background:rgba(16,185,129,.12)}',
    '.ap-x:focus-visible,.ap-save:focus-visible,.ap-row:focus-visible{outline:2px solid #67e8f9;outline-offset:1px}',
    '.ap-menu{position:fixed;width:min(24rem,92vw);max-height:60vh;overflow:auto;background:#0f1117;border:1px solid rgba(34,211,238,.25);border-radius:.75rem;box-shadow:0 20px 40px rgba(0,0,0,.5);padding:.35rem;z-index:9000;display:none}',
    '.ap-menu.open{display:block}',
    '.ap-hint{padding:.45rem .6rem;color:#64748b;font-size:.72rem}',
    '.ap-row{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;padding:.45rem .6rem;border-radius:.5rem;border:0;background:transparent;color:#e5e7eb;cursor:pointer;font-family:inherit}',
    '.ap-row:hover,.ap-row.hi{background:rgba(34,211,238,.1)}',
    '.ap-row .ap-nm{font-weight:600;font-size:.85rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ap-row .ap-nm b{color:#67e8f9;font-weight:700}',
    '.ap-row .ap-ad{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.68rem;color:#64748b}',
    '.ap-chip{font-size:.6rem;padding:.1rem .4rem;border-radius:999px;background:rgba(255,255,255,.06);color:#94a3b8;white-space:nowrap}',
    '.ap-chip.adao{color:#67e8f9;background:rgba(34,211,238,.12)}.ap-chip.liondao{color:#fcd34d;background:rgba(245,158,11,.12)}.ap-chip.pixellions{color:#c4b5fd;background:rgba(168,85,247,.12)}.ap-chip.tla_locks{color:#6ee7b7;background:rgba(16,185,129,.12)}',
    '.ap-more{padding:.4rem .6rem;color:#67e8f9;font-size:.72rem;background:transparent;border:0;cursor:pointer;font-family:inherit}',
    '@media(max-width:767px){.ap-pill{min-width:0;max-width:11rem}}',
  ].join('\n');

  var state = { roster: [], byAddr: {}, loaded: false, sel: null, name: null, hi: -1, open: false, opts: {}, els: {} };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return root.localStorage.getItem(k); if (v === null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, v); return true; } catch (e) { return v === undefined ? null : false; } }
  function ss(k, v) { try { if (v === undefined) return root.sessionStorage.getItem(k); root.sessionStorage.setItem(k, v); return true; } catch (e) { return v === undefined ? null : false; } }
  function isAddr(s) { return /^terra1[02-9ac-hj-np-z]{38,58}$/.test(String(s || '').trim()); }
  function shortAddr(a) { return a ? a.slice(0, 9) + '…' + a.slice(-4) : ''; }
  function rev(s) { return s.split('').reverse().join(''); }

  // ---- roster ----------------------------------------------------------------
  function buildRoster(cat) {
    var out = [], ba = cat && cat.by_address || {};
    Object.keys(ba).forEach(function (addr) {
      var v = ba[addr] || {}; var groups = (v.memberships || []).map(function (m) { return m.slug; });
      out.push({ wallet: addr, name: v.handle || null, groups: groups, nameLower: (v.handle || '').toLowerCase() });
    });
    out.sort(function (a, b) { return (a.name ? 0 : 1) - (b.name ? 0 : 1) || (a.nameLower < b.nameLower ? -1 : a.nameLower > b.nameLower ? 1 : 0); });
    return out;
  }
  function setRoster(list) { state.roster = list; state.byAddr = {}; list.forEach(function (r) { state.byAddr[r.wallet] = r; }); state.loaded = true; }
  function loadRoster() {
    var cached = ss(KEY_ROSTER);
    if (cached) { try { setRoster(JSON.parse(cached)); return Promise.resolve(state.roster); } catch (e) { /* fall through */ } }
    return fetch(ROSTER_URL, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (cat) {
      setRoster(buildRoster(cat)); ss(KEY_ROSTER, JSON.stringify(state.roster)); return state.roster;
    }).catch(function () { setRoster(state.roster); return state.roster; });
  }

  // ---- matching ----------------------------------------------------------------
  function match(q) {
    q = String(q || '').trim(); if (!q) return { rows: [], mode: 'idle' };
    var ql = q.toLowerCase(), rows = [];
    if (ql.indexOf('terra') === 0) {
      rows = state.roster.filter(function (r) { return r.wallet.indexOf(ql) === 0; });
      return { rows: rows, mode: 'addr' };
    }
    if (ql.length === 4 && /^[02-9ac-hj-np-z]{4}$/.test(ql)) {
      var a = ql, b = rev(ql);
      rows = state.roster.filter(function (r) { var t = r.wallet.slice(-4); return t === a || t === b; });
      if (rows.length) return { rows: rows, mode: 'last4' };
    }
    var exact = [], pre = [], sub = [];
    state.roster.forEach(function (r) {
      if (!r.nameLower) return;
      var i = r.nameLower.indexOf(ql);
      if (r.nameLower === ql) exact.push(r); else if (i === 0) pre.push(r); else if (i > 0) sub.push(r);
    });
    return { rows: exact.concat(pre, sub), mode: 'name' };
  }
  function hilite(name, q) {
    var i = name.toLowerCase().indexOf(q.toLowerCase()); if (i < 0 || !q) return esc(name);
    return esc(name.slice(0, i)) + '<b>' + esc(name.slice(i, i + q.length)) + '</b>' + esc(name.slice(i + q.length));
  }

  // ---- selection contract -------------------------------------------------------
  function emit() { try { root.dispatchEvent(new CustomEvent('tla:wallet', { detail: { wallet: state.sel, name: state.name } })); } catch (e) {} }
  function select(wallet, opts) {
    opts = opts || {}; wallet = String(wallet || '').trim();
    if (!isAddr(wallet)) return false;
    var r = state.byAddr[wallet]; state.sel = wallet; state.name = r && r.name || null;
    ls(KEY_SEL, wallet); ls(KEY_NAME, state.name || null);
    if (!opts.silentUrl) { try { var u = new URL(root.location.href); u.searchParams.set('wallet', wallet); root.history.replaceState(null, '', u.toString()); } catch (e) {} }
    render(); close();
    if (!opts.silent) { emit(); if (state.opts.onSelect) state.opts.onSelect(wallet, state.name); }
    return true;
  }
  function clear() {
    state.sel = null; state.name = null; ls(KEY_SEL, null); ls(KEY_NAME, null);
    try { var u = new URL(root.location.href); u.searchParams.delete('wallet'); root.history.replaceState(null, '', u.toString()); } catch (e) {}
    render(); emit(); if (state.opts.onClear) state.opts.onClear();
  }
  function toggleSave() {
    if (!state.sel) return; var saved = ls(KEY_SAVED) === state.sel;
    ls(KEY_SAVED, saved ? null : state.sel); render();
    if (state.opts.onSave) state.opts.onSave(saved ? null : state.sel);
  }

  // ---- ui ----------------------------------------------------------------------------
  function ensureCss() { if (!doc.getElementById('ap-css')) { var st = doc.createElement('style'); st.id = 'ap-css'; st.textContent = CSS; doc.head.appendChild(st); } }
  function render() {
    var e = state.els; if (!e.root) return;
    var saved = state.sel && ls(KEY_SAVED) === state.sel;
    if (state.sel && doc.activeElement !== e.input) { e.input.value = state.name || shortAddr(state.sel); e.input.classList.toggle('mono', !state.name); e.input.title = state.sel; }
    if (!state.sel && doc.activeElement !== e.input) { e.input.value = ''; e.input.classList.remove('mono'); e.input.title = ''; e.input.placeholder = 'name, terra1…, or last 4'; }
    e.x.style.display = state.sel ? '' : 'none';
    e.save.style.display = state.sel ? '' : 'none';
    e.save.classList.toggle('on', !!saved);
    e.save.title = saved ? 'Saved on this device — loads when the site opens. Tap to forget.' : 'Save this address on this device (loads on open, handy on a home-screen shortcut)';
  }
  function place() {
    var e = state.els; if (!e.menu || !e.pill) return;
    var r = e.pill.getBoundingClientRect(), vw = root.innerWidth || doc.documentElement.clientWidth;
    var w = Math.min(384, vw * 0.92), left = Math.max(8, Math.min(r.right - w, vw - w - 8));
    e.menu.style.top = (r.bottom + 6) + 'px'; e.menu.style.left = left + 'px'; e.menu.style.width = w + 'px';
  }
  function open() {
    state.open = true; var e = state.els;
    if (e.menu.parentNode !== doc.body) doc.body.appendChild(e.menu);   // portal: escapes sticky/backdrop stacking contexts
    place(); e.menu.classList.add('open'); e.pill.classList.add('open');
  }
  function close() { state.open = false; state.hi = -1; if (state.els.menu) { state.els.menu.classList.remove('open'); state.els.pill.classList.remove('open'); } }
  function renderMenu(q) {
    var m = state.els.menu, res = match(q), rows = res.rows, html = '';
    if (!state.loaded) html = '<div class="ap-hint"><i class="fas fa-spinner fa-spin"></i> loading the roster…</div>';
    else if (!q.trim()) html = '<div class="ap-hint">Type a registered name, paste a terra1… address, or the last 4 characters of one (either direction).</div>';
    else if (!rows.length) html = isAddr(q) ? '<button type="button" class="ap-row" data-w="' + esc(q.trim()) + '"><span class="ap-nm">Use this address</span><span class="ap-ad">' + esc(shortAddr(q.trim())) + '</span></button>'
      : '<div class="ap-hint">No registered name or address matches “' + esc(q) + '”. Paste a full terra1… address to view any wallet.</div>';
    else {
      var shown = state.showAll ? rows : rows.slice(0, MAX_ROWS);
      html = shown.map(function (r, i) {
        return '<button type="button" class="ap-row' + (i === state.hi ? ' hi' : '') + '" data-w="' + esc(r.wallet) + '">' +
          '<span class="ap-nm">' + (r.name ? hilite(r.name, res.mode === 'name' ? q : '') : '<span class="ap-ad">' + esc(shortAddr(r.wallet)) + '</span>') + '</span>' +
          r.groups.slice(0, 3).map(function (g) { return '<span class="ap-chip ' + esc(g) + '">' + esc(GROUP[g] || g) + '</span>'; }).join('') +
          (r.name ? '<span class="ap-ad">' + esc(r.wallet.slice(-4)) + '</span>' : '') + '</button>';
      }).join('');
      if (rows.length > shown.length) html += '<button type="button" class="ap-more" data-more="1">show all ' + rows.length + '</button>';
      if (res.mode === 'last4') html = '<div class="ap-hint">last-4 match</div>' + html;
    }
    m.innerHTML = html;
  }

  function mount(opts) {
    state.opts = opts || {}; ensureCss();
    var host = doc.querySelector(state.opts.container || '#sh-picker'); if (!host) return null;
    host.innerHTML = '<div class="ap"><div class="ap-pill"><i class="fas fa-magnifying-glass"></i>' +
      '<input class="ap-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Choose an address" placeholder="name, terra1…, or last 4">' +
      '<button type="button" class="ap-save" aria-label="Save this address on this device"><i class="fas fa-bookmark"></i></button>' +
      '<button type="button" class="ap-x" aria-label="Clear selected address"><i class="fas fa-xmark"></i></button></div>' +
      '<div class="ap-menu" role="listbox"></div></div>';
    var e = state.els = { root: host.firstChild, pill: host.querySelector('.ap-pill'), input: host.querySelector('.ap-in'), x: host.querySelector('.ap-x'), save: host.querySelector('.ap-save'), menu: host.querySelector('.ap-menu') };

    e.input.addEventListener('focus', function () { if (state.sel) { e.input.value = ''; e.input.classList.remove('mono'); } state.showAll = false; open(); renderMenu(e.input.value); });
    e.input.addEventListener('input', function () { state.hi = -1; state.showAll = false; open(); renderMenu(e.input.value); });
    e.input.addEventListener('keydown', function (ev) {
      var rows = e.menu.querySelectorAll('.ap-row');
      if (ev.key === 'ArrowDown') { state.hi = Math.min(rows.length - 1, state.hi + 1); renderMenu(e.input.value); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { state.hi = Math.max(0, state.hi - 1); renderMenu(e.input.value); ev.preventDefault(); }
      else if (ev.key === 'Enter') { var r = rows[state.hi >= 0 ? state.hi : 0]; if (r) select(r.getAttribute('data-w')); else if (isAddr(e.input.value)) select(e.input.value); ev.preventDefault(); }
      else if (ev.key === 'Escape') { close(); e.input.blur(); render(); }
    });
    e.input.addEventListener('blur', function () { setTimeout(function () { if (!state.els.menu.contains(doc.activeElement)) { close(); render(); } }, 120); });
    e.menu.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-more')) { state.showAll = true; renderMenu(e.input.value); e.input.focus(); return; }
      select(b.getAttribute('data-w'));
    });
    root.addEventListener('resize', function () { if (state.open) place(); });
    root.addEventListener('scroll', function () { if (state.open) place(); }, { passive: true });
    e.x.addEventListener('click', clear);
    e.save.addEventListener('click', toggleSave);
    doc.addEventListener('keydown', function (ev) { if (ev.key === '/' && !/input|textarea|select/i.test(doc.activeElement && doc.activeElement.tagName || '')) { ev.preventDefault(); e.input.focus(); } });

    // initial selection: URL → remembered → saved (URL wins, never overwritten by storage)
    var urlW = null; try { urlW = new URL(root.location.href).searchParams.get('wallet'); } catch (x) {}
    var initial = (isAddr(urlW) && urlW) || (isAddr(ls(KEY_SEL)) && ls(KEY_SEL)) || (isAddr(ls(KEY_SAVED)) && ls(KEY_SAVED)) || null;
    if (initial) { state.sel = initial; state.name = ls(KEY_NAME) || null; ls(KEY_SEL, initial); }
    render();
    loadRoster().then(function () { if (state.sel && state.byAddr[state.sel]) { state.name = state.byAddr[state.sel].name; ls(KEY_NAME, state.name || null); } render(); if (state.open) renderMenu(e.input.value); if (state.opts.onReady) state.opts.onReady(state.roster); });
    if (initial && state.opts.emitInitial !== false) { setTimeout(function () { emit(); if (state.opts.onSelect) state.opts.onSelect(initial, state.name); }, 0); }
    return host;
  }

  root.AddressPicker = {
    mount: mount, select: function (w) { return select(w); }, set: function (w) { return select(w); }, clear: clear,
    get: function () { return state.sel ? { wallet: state.sel, name: state.name } : null; },
    roster: function () { return state.roster; }, match: match, isAddr: isAddr, _buildRoster: buildRoster,
    KEYS: { selected: KEY_SEL, saved: KEY_SAVED },
  };
})(window, document);
