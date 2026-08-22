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
 * FULL PANEL (§4.3): the ⋮⋮ button on the pill opens a panel with group tabs
 * (All · aDAO · TLA Lock · Pixel Lions · Lion DAO), sorts (Name · Most staked
 * NFTs · Most locks · Most TLA VP · Most TLA deposits · Most VP if adjusted —
 * the last three lazy-load member-data/positions on first open), and rows that
 * show name — full address with a copy button. Copy pops the explorer's
 * "Copied to Clipboard — please verify" card.
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
  var POSITIONS_URL = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/member-data/positions/current.json';
  var TABS = [['all', 'All'], ['adao', 'aDAO'], ['tla_locks', 'TLA Lock'], ['pixellions', 'Pixel Lions'], ['liondao', 'Lion DAO']];
  var SORTS = [
    ['name',    'Name A–Z',            function (r) { return 0; }],
    ['nfts',    'Most staked NFTs',    function (r) { return r.m.adao || 0; }],
    ['locks',   'Most locks',          function (r) { return r.m.tla_locks || 0; }],
    ['vp',      'Most TLA VP',         function (r) { return r.p ? r.p.vp : -1; }],
    ['dep',     'Most TLA deposits',   function (r) { return r.p ? r.p.dep : -1; }],
    ['gain',    'Most VP if adjusted', function (r) { return r.p ? r.p.gain : -1; }],
  ];
  var KEY_SORT = 'tla:picker_sort';
  // ENTITIES — project / DAO wallets, shown distinct from member wallets. Source:
  // the catalog's `entities` block, which the address-catalog cron publishes from
  // the owner-curated register tla-core/docs/curated/wallets.json (treasuries,
  // multisigs, protocol bribers, DAOs). Add a wallet THERE and it appears here on
  // the next catalog run. No label is hardcoded in this file, and none is
  // inferred from a handle (pattern ≠ identity). Interim fallback until the
  // first 1.2.0 catalog run: the catalog's own contracts.dao_main_wallet, which
  // it already labels structurally.

  var CSS = [
    '.ap,.ap-menu,.ap-ov,.ap-toast{font-size:16px;line-height:1.4}',
    '.ap{position:relative;font-family:Outfit,system-ui,sans-serif}',
    '.ap-pill{display:flex;align-items:center;gap:.4em;height:2.5em;padding:0 .5em 0 .75em;border-radius:999px;background:rgba(31,41,55,.55);border:1px solid #374151;color:#e5e7eb;cursor:text;min-width:11em;max-width:19em}',
    '.ap-pill:focus-within,.ap-pill.open{border-color:rgba(34,211,238,.6);box-shadow:0 0 0 3px rgba(34,211,238,.12)}',
    '.ap-pill i.fa-magnifying-glass{color:#67e8f9;font-size:.8em}',
    '.ap-in{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#f1f5f9;font-size:.85em;font-family:inherit}',
    '.ap-in::placeholder{color:#64748b}',
    '.ap-in.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.78em}',
    '.ap-x,.ap-save{flex:0 0 auto;width:1.6em;height:1.6em;border-radius:999px;border:0;background:transparent;color:#94a3b8;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:.75em}',
    '.ap-x:hover{background:rgba(248,113,113,.15);color:#fca5a5}',
    '.ap-save:hover,.ap-save.on{color:#6ee7b7}.ap-save.on{background:rgba(16,185,129,.12)}',
    '.ap-x:focus-visible,.ap-save:focus-visible,.ap-row:focus-visible{outline:2px solid #67e8f9;outline-offset:1px}',
    '.ap-menu{position:fixed;width:min(24em,92vw);max-height:60vh;overflow:auto;background:#0f1117;border:1px solid rgba(34,211,238,.25);border-radius:.75em;box-shadow:0 20px 40px rgba(0,0,0,.5);padding:.35em;z-index:9000;display:none}',
    '.ap-menu.open{display:block}',
    '.ap-hint{padding:.45em .6em;color:#64748b;font-size:.72em}',
    '.ap-row{display:flex;align-items:center;gap:.6em;width:100%;text-align:left;padding:.45em .6em;border-radius:.5em;border:0;background:transparent;color:#e5e7eb;cursor:pointer;font-family:inherit}',
    '.ap-row:hover,.ap-row.hi{background:rgba(34,211,238,.1)}',
    '.ap-row .ap-nm{font-weight:600;font-size:.85em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ap-row .ap-nm b{color:#67e8f9;font-weight:700}',
    '.ap-row.ent .ap-nm>span:first-child{color:#fcd34d}',
    '.ap-chip.ent{color:#fcd34d;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.35)}',
    '.ap-row .ap-ad{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.68em;color:#64748b}',
    '.ap-chip{font-size:.6em;padding:.1em .4em;border-radius:999px;background:rgba(255,255,255,.06);color:#94a3b8;white-space:nowrap}',
    '.ap-chip.adao{color:#67e8f9;background:rgba(34,211,238,.12)}.ap-chip.liondao{color:#fcd34d;background:rgba(245,158,11,.12)}.ap-chip.pixellions{color:#c4b5fd;background:rgba(168,85,247,.12)}.ap-chip.tla_locks{color:#6ee7b7;background:rgba(16,185,129,.12)}',
    '.ap-more{padding:.4em .6em;color:#67e8f9;font-size:.72em;background:transparent;border:0;cursor:pointer;font-family:inherit}',
    '.ap-open{flex:0 0 auto;width:1.6em;height:1.6em;border-radius:999px;border:0;background:transparent;color:#94a3b8;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:.75em}',
    '.ap-open:hover{color:#67e8f9;background:rgba(34,211,238,.12)}',
    '.ap-row .ap-full{display:flex;align-items:center;gap:.35em;min-width:0}',
    '.ap-row .ap-addr{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.62em;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ap-copy{flex:0 0 auto;width:1.3em;height:1.3em;border-radius:.35em;border:0;background:transparent;color:#64748b;cursor:pointer;font-size:.65em;display:inline-flex;align-items:center;justify-content:center}',
    '.ap-copy:hover{color:#67e8f9;background:rgba(34,211,238,.12)}',
    '.ap-menu.wide{width:min(34em,94vw)}',
    '.ap-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:9100;display:none;align-items:flex-start;justify-content:center;padding:4em 1em 1em}',
    '.ap-ov.open{display:flex}',
    '.ap-panel{width:min(46em,100%);max-height:calc(100vh - 5em);display:flex;flex-direction:column;background:#0f1117;border:1px solid rgba(34,211,238,.3);border-radius:1em;box-shadow:0 30px 60px rgba(0,0,0,.6);font-family:Outfit,system-ui,sans-serif;color:#e5e7eb}',
    '.ap-ph{display:flex;align-items:center;gap:.6em;padding:.8em 1em;border-bottom:1px solid rgba(255,255,255,.06)}',
    '.ap-ph .ap-pill{flex:1;max-width:none;min-width:0}',
    '.ap-ph .ap-close{width:2em;height:2em;border-radius:999px;border:0;background:rgba(255,255,255,.06);color:#94a3b8;cursor:pointer;font-size:.9em}',
    '.ap-ph .ap-close:hover{color:#fff}',
    '.ap-tabs{display:flex;gap:.35em;padding:.6em 1em .2em;flex-wrap:wrap}',
    '.ap-tab{font-size:.72em;font-weight:600;padding:.3em .65em;border-radius:999px;border:1px solid #374151;background:rgba(31,41,55,.5);color:#cbd5e1;cursor:pointer;font-family:inherit}',
    '.ap-tab.on{background:rgba(34,211,238,.15);color:#67e8f9;border-color:rgba(34,211,238,.6)}',
    '.ap-tab small{color:#64748b;font-weight:500;margin-left:.3em}',
    '.ap-sorts{display:flex;gap:.35em;padding:.35em 1em .6em;flex-wrap:wrap;align-items:center}',
    '.ap-sorts .lbl{font-size:.65em;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-right:.2em}',
    '.ap-sort{font-size:.68em;padding:.25em .55em;border-radius:.4em;border:1px solid transparent;background:rgba(255,255,255,.04);color:#94a3b8;cursor:pointer;font-family:inherit}',
    '.ap-sort.on{color:#67e8f9;border-color:rgba(34,211,238,.4);background:rgba(34,211,238,.1)}',
    '.ap-list{overflow:auto;padding:.25em .6em .6em;flex:1}',
    '.ap-list .ap-row{padding:.5em .6em}',
    '.ap-row .ap-met{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.72em;color:#67e8f9;flex:0 0 auto;min-width:5.5em;text-align:right}',
    '.ap-empty{padding:1em;color:#64748b;font-size:.8em;text-align:center}',
    '.ap-toast{position:fixed;inset:0;z-index:9200;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}',
    '.ap-toast.open{display:flex}',
    '.ap-tcard{background:#0f1117;border:1px solid rgba(34,211,238,.4);border-radius:.9em;padding:1.1em 1.25em;width:min(22em,92vw);box-shadow:0 20px 40px rgba(0,0,0,.6);font-family:Outfit,system-ui,sans-serif}',
    '.ap-tcard h3{margin:0 0 .25em;color:#fff;font-size:1.05em;font-weight:700}',
    '.ap-tcard p{margin:0 0 .6em;color:#94a3b8;font-size:.78em}',
    '.ap-tcard code{display:block;font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.66em;color:#67e8f9;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.2);border-radius:.5em;padding:.5em .6em;word-break:break-all;margin-bottom:.8em}',
    '.ap-tcard button{width:100%;padding:.55em;border-radius:.6em;border:1px solid #374151;background:rgba(31,41,55,.7);color:#e5e7eb;font-weight:600;cursor:pointer;font-family:inherit}',
    '.ap-tcard button:hover{border-color:rgba(34,211,238,.6);color:#67e8f9}',
    '@media(max-width:767px){.ap-pill{min-width:0;max-width:11em}.ap-ov{padding:3.5em .5em .5em}}',
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
    var out = [], ba = cat && cat.by_address || {}, ents = cat && cat.entities || {};
    if (!Object.keys(ents).length && cat && cat.contracts && cat.contracts.dao_main_wallet && cat.contracts.dao_main_wallet.addr) {
      ents = {}; ents[cat.contracts.dao_main_wallet.addr] = { label: 'aDAO Treasury', subtype: 'treasury', protocol: 'TLA', flags: ['structural'] };
    }
    Object.keys(ba).forEach(function (addr) {
      var v = ba[addr] || {}; var groups = [], m = {};
      (v.memberships || []).forEach(function (x) { groups.push(x.slug); var n = Number(x.stake_raw); m[x.slug] = isFinite(n) ? n : 0; });
      var e = ents[addr], nl = (v.handle || (e && e.label) || '').toLowerCase();
      out.push({ wallet: addr, name: v.handle || (e && e.label) || null, groups: groups, m: m, nameLower: nl, ent: e ? (e.label || 'entity') : null, entKind: e ? (e.subtype || e.protocol || null) : null });
    });
    Object.keys(ents).forEach(function (addr) {
      if (!out.some(function (r) { return r.wallet === addr; })) out.push({ wallet: addr, name: ents[addr].label, groups: [], m: {}, nameLower: ents[addr].label.toLowerCase(), ent: ents[addr].label, entKind: ents[addr].subtype || ents[addr].protocol || null });
    });
    out.sort(function (a, b) { return (a.ent ? 0 : 1) - (b.ent ? 0 : 1) || (a.name ? 0 : 1) - (b.name ? 0 : 1) || (a.nameLower < b.nameLower ? -1 : a.nameLower > b.nameLower ? 1 : 0); });
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

  function loadPositions() {
    if (state.posLoaded) return Promise.resolve();
    if (state.posLoading) return state.posLoading;
    state.posLoading = fetch(POSITIONS_URL, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (pos) {
      var add = function (mm) { var r = mm && state.byAddr[mm.wallet]; var sm = mm && mm.summary || {}; if (r) r.p = { vp: sm.voting_power_human || 0, dep: sm.total_lp_position_usd || 0, gain: sm.total_potential_vp_gain_human || 0 }; };
      (pos.members || []).forEach(add);
      [].concat(pos.treasuries || [], pos.council_treasuries || [], pos.treasury ? [pos.treasury] : []).forEach(function (t) {
        if (!t || !t.wallet) return; add(t); var r = state.byAddr[t.wallet];
        if (r && !r.ent) { r.ent = t.name || 'DAO wallet'; r.entKind = r.entKind || 'treasury'; if (!r.name) r.name = r.ent; r.nameLower = (r.name || '').toLowerCase(); }
      });
      state.posLoaded = true;
    }).catch(function () { state.posLoaded = true; });
    return state.posLoading;
  }

  // ---- matching ----------------------------------------------------------------
  function match(q) {
    q = String(q || '').trim(); if (!q) return { rows: [], mode: 'idle' };
    var ql = q.toLowerCase(), rows = [];
    if (ql.indexOf('terra') === 0) {
      rows = state.roster.filter(function (r) { return r.wallet.indexOf(ql) === 0; });
      return { rows: rows, mode: 'addr' };
    }
    if (ql.length >= 3 && ql.length <= 6 && /^[02-9ac-hj-np-z]+$/.test(ql)) {
      var a = ql, b = rev(ql), n = ql.length;
      rows = state.roster.filter(function (r) { var t = r.wallet.slice(-n); return t === a || t === b; });
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
    render(); close(); closePanel();
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
    if (state.sel && doc.activeElement !== e.input) { e.input.value = state.name || shortAddr(state.sel); e.input.classList.toggle('mono', !state.name); e.input.title = state.sel; var rr = state.byAddr[state.sel]; e.input.style.color = rr && rr.ent ? '#fcd34d' : ''; }
    if (!state.sel && doc.activeElement !== e.input) { e.input.value = ''; e.input.classList.remove('mono'); e.input.title = ''; e.input.placeholder = 'name, terra1…, or last 4'; }
    e.x.style.display = state.sel ? '' : 'none';
    e.save.style.display = state.sel ? '' : 'none';
    e.save.classList.toggle('on', !!saved);
    e.save.title = saved ? 'Saved on this device — loads when the site opens. Tap to forget.' : 'Save this address on this device (loads on open, handy on a home-screen shortcut)';
  }
  function place() {
    var e = state.els; if (!e.menu || !e.pill) return;
    var r = e.pill.getBoundingClientRect(), vw = root.innerWidth || doc.documentElement.clientWidth;
    var w = Math.max(Math.min(544, vw * 0.94), Math.min(r.width, vw * 0.94)), left = Math.max(8, Math.min(r.left + (r.width - w) / 2, vw - w - 8));
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
        return rowHtml(r, i === state.hi, res.mode === 'name' ? q : '', null);
      }).join('');
      if (rows.length > shown.length) html += '<button type="button" class="ap-more" data-more="1">show all ' + rows.length + '</button>';
      if (res.mode === 'last4') html = '<div class="ap-hint">last-4 match</div>' + html;
    }
    m.innerHTML = html;
  }

  function rowHtml(r, hi, q, metric) {
    return '<button type="button" class="ap-row' + (hi ? ' hi' : '') + (r.ent ? ' ent' : '') + '" data-w="' + esc(r.wallet) + '">' +
      '<span class="ap-nm"><span>' + (r.name ? hilite(r.name, q) : '<span class="ap-ad">unregistered</span>') + '</span>' +
      '<span class="ap-full"><span class="ap-addr" title="' + esc(r.wallet) + '">' + esc(r.wallet) + '</span>' +
      '<span class="ap-copy" role="button" tabindex="0" aria-label="Copy address" data-copy="' + esc(r.wallet) + '"><i class="fas fa-copy"></i></span></span></span>' +
      (r.ent ? '<span class="ap-chip ent"><i class="fas fa-landmark" style="font-size:.55rem;margin-right:.25rem"></i>' + esc(r.entKind || 'entity') + '</span>' : '') +
      r.groups.slice(0, 3).map(function (g) { return '<span class="ap-chip ' + esc(g) + '">' + esc(GROUP[g] || g) + '</span>'; }).join('') +
      (metric != null ? '<span class="ap-met">' + metric + '</span>' : '') + '</button>';
  }
  function fmtMetric(key, r) {
    if (key === 'nfts') return (r.m.adao || 0) + ' NFT';
    if (key === 'locks') return (r.m.tla_locks || 0) + ' lock' + ((r.m.tla_locks || 0) === 1 ? '' : 's');
    if (!r.p) return '<span style="color:#475569">—</span>';
    var v = key === 'vp' ? r.p.vp : key === 'dep' ? r.p.dep : key === 'gain' ? r.p.gain : null; if (v == null) return '';
    var n = Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v).toString();
    return key === 'dep' ? '$' + n : n + ' VP';
  }

  // ---- copy card (explorer parity) ----------------------------------------------------
  function copyAddr(a) {
    var done = function () {
      var t = doc.getElementById('ap-toast'); if (!t) { t = doc.createElement('div'); t.id = 'ap-toast'; t.className = 'ap-toast'; doc.body.appendChild(t); t.addEventListener('click', function (ev) { if (ev.target === t || ev.target.closest('button')) t.classList.remove('open'); }); }
      t.innerHTML = '<div class="ap-tcard" role="dialog" aria-label="Copied"><h3>Copied to Clipboard!</h3><p>Please verify this is the correct address:</p><code>' + esc(a) + '</code><button type="button">Verify &amp; Close</button></div>';
      t.classList.add('open'); var b = t.querySelector('button'); if (b) b.focus();
    };
    try { root.navigator.clipboard.writeText(a).then(done, function () { fallback(a); done(); }); } catch (e) { fallback(a); done(); }
    function fallback(txt) { try { var ta = doc.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; doc.body.appendChild(ta); ta.select(); doc.execCommand('copy'); doc.body.removeChild(ta); } catch (e) {} }
  }

  // ---- full panel ------------------------------------------------------------------
  function panelEls() {
    var ov = doc.getElementById('ap-ov');
    if (ov) return ov;
    ov = doc.createElement('div'); ov.id = 'ap-ov'; ov.className = 'ap-ov';
    ov.innerHTML = '<div class="ap-panel" role="dialog" aria-label="Find an address"><div class="ap-ph"><div class="ap-pill"><i class="fas fa-magnifying-glass"></i><input class="ap-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="name, terra1…, or last 4 (either direction)"></div><button type="button" class="ap-close" aria-label="Close"><i class="fas fa-xmark"></i></button></div><div class="ap-tabs"></div><div class="ap-sorts"></div><div class="ap-list"></div></div>';
    doc.body.appendChild(ov);
    ov.addEventListener('click', function (ev) { if (ev.target === ov) closePanel(); });
    ov.querySelector('.ap-close').addEventListener('click', closePanel);
    ov.querySelector('.ap-in').addEventListener('input', renderPanel);
    ov.querySelector('.ap-in').addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closePanel(); if (ev.key === 'Enter') { var b = ov.querySelector('.ap-list .ap-row'); if (b) select(b.getAttribute('data-w')); else if (isAddr(ev.target.value)) select(ev.target.value); } });
    ov.querySelector('.ap-tabs').addEventListener('click', function (ev) { var b = ev.target.closest('.ap-tab'); if (b) { state.tab = b.getAttribute('data-tab'); renderPanel(); } });
    ov.querySelector('.ap-sorts').addEventListener('click', function (ev) { var b = ev.target.closest('.ap-sort'); if (!b) return; state.sort = b.getAttribute('data-sort'); ls(KEY_SORT, state.sort); if (/^(vp|dep|gain)$/.test(state.sort) && !state.posLoaded) { renderPanel(); loadPositions().then(renderPanel); } else renderPanel(); });
    ov.querySelector('.ap-list').addEventListener('click', function (ev) { var c = ev.target.closest('[data-copy]'); if (c) { ev.stopPropagation(); copyAddr(c.getAttribute('data-copy')); return; } var b = ev.target.closest('.ap-row'); if (b) select(b.getAttribute('data-w')); });
    ov.querySelector('.ap-list').addEventListener('keydown', function (ev) { var c = ev.target.closest('[data-copy]'); if (c && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); copyAddr(c.getAttribute('data-copy')); } });
    return ov;
  }
  function openPanel() {
    var ov = panelEls(); state.tab = state.tab || 'all'; state.sort = state.sort || ls(KEY_SORT) || 'name';
    close(); ov.classList.add('open'); ov.querySelector('.ap-in').value = ''; renderPanel(); ov.querySelector('.ap-in').focus();
    if (/^(vp|dep|gain)$/.test(state.sort) && !state.posLoaded) loadPositions().then(renderPanel);
    if (state.opts.onPanel) state.opts.onPanel(true);
  }
  function closePanel() { var ov = doc.getElementById('ap-ov'); if (ov) ov.classList.remove('open'); if (state.opts.onPanel) state.opts.onPanel(false); }
  function renderPanel() {
    var ov = doc.getElementById('ap-ov'); if (!ov) return;
    var q = ov.querySelector('.ap-in').value, base = q.trim() ? match(q).rows : state.roster.slice();
    var counts = {}; state.roster.forEach(function (r) { r.groups.forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
    ov.querySelector('.ap-tabs').innerHTML = TABS.map(function (t) { return '<button type="button" class="ap-tab' + (state.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '<small>' + (t[0] === 'all' ? state.roster.length : (counts[t[0]] || 0)) + '</small></button>'; }).join('');
    ov.querySelector('.ap-sorts').innerHTML = '<span class="lbl">sort</span>' + SORTS.map(function (s) { return '<button type="button" class="ap-sort' + (state.sort === s[0] ? ' on' : '') + '" data-sort="' + s[0] + '">' + s[1] + '</button>'; }).join('');
    var rows = state.tab === 'all' ? base : base.filter(function (r) { return r.groups.indexOf(state.tab) >= 0; });
    var sd = SORTS.filter(function (s) { return s[0] === state.sort; })[0] || SORTS[0];
    if (sd[0] !== 'name') rows = rows.slice().sort(function (a, b) { return sd[2](b) - sd[2](a) || (a.nameLower < b.nameLower ? -1 : 1); });
    var list = ov.querySelector('.ap-list');
    if (!state.loaded) list.innerHTML = '<div class="ap-empty"><i class="fas fa-spinner fa-spin"></i> loading the roster…</div>';
    else if (!rows.length) list.innerHTML = '<div class="ap-empty">' + (isAddr(q) ? '<button type="button" class="ap-row" data-w="' + esc(q.trim()) + '"><span class="ap-nm">Use this address <span class="ap-ad">' + esc(q.trim()) + '</span></span></button>' : 'Nothing matches. Paste a full terra1… address to view any wallet.') + '</div>';
    else list.innerHTML = (sd[0] !== 'name' && /^(vp|dep|gain)$/.test(sd[0]) && !state.posLoaded ? '<div class="ap-hint"><i class="fas fa-spinner fa-spin"></i> loading positions for this sort…</div>' : '') + rows.slice(0, 400).map(function (r) { return rowHtml(r, false, q.trim() && match(q).mode === 'name' ? q.trim() : '', sd[0] === 'name' ? null : fmtMetric(sd[0], r)); }).join('') + (rows.length > 400 ? '<div class="ap-hint">showing 400 of ' + rows.length + ' — narrow with the search box</div>' : '');
  }

  function mount(opts) {
    state.opts = opts || {}; ensureCss();
    var host = doc.querySelector(state.opts.container || '#sh-picker'); if (!host) return null;
    var row = host.closest('.sh-pickrow'); if (row) row.classList.add('has');
    host.innerHTML = '<div class="ap"><div class="ap-pill"><i class="fas fa-magnifying-glass"></i>' +
      '<input class="ap-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Choose an address" placeholder="name, terra1…, or last 4">' +
      '<button type="button" class="ap-save" aria-label="Save this address on this device"><i class="fas fa-bookmark"></i></button>' +
      '<button type="button" class="ap-x" aria-label="Clear selected address"><i class="fas fa-xmark"></i></button>' +
      '<button type="button" class="ap-open" aria-label="Open the full address finder" title="Browse everyone: groups, sorts, copy"><i class="fas fa-grip"></i></button></div>' +
      '<div class="ap-menu wide" role="listbox"></div></div>';
    var e = state.els = { root: host.firstChild, pill: host.querySelector('.ap-pill'), input: host.querySelector('.ap-in'), x: host.querySelector('.ap-x'), save: host.querySelector('.ap-save'), open: host.querySelector('.ap-open'), menu: host.querySelector('.ap-menu') };
    e.open.addEventListener('click', openPanel);

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
      var c = ev.target.closest('[data-copy]'); if (c) { ev.stopPropagation(); copyAddr(c.getAttribute('data-copy')); e.input.focus(); return; }
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
    mount: mount, select: function (w) { return select(w); }, set: function (w) { return select(w); }, sync: function (w) { return select(w, { silent: true }); }, clear: clear, openPanel: openPanel, closePanel: closePanel, copy: copyAddr,
    get: function () { return state.sel ? { wallet: state.sel, name: state.name } : null; },
    roster: function () { return state.roster; }, match: match, isAddr: isAddr, _buildRoster: buildRoster,
    KEYS: { selected: KEY_SEL, saved: KEY_SAVED },
  };
})(window, document);
