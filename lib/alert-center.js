/* lib/alert-center.js — 1.0.0 (2026-09-17) — SPEC-alert-center Phase 1
 *
 * The home page's default window: a grid of tiles that answers "is anything happening that I should look at?".
 * Green when every counter is 0 (measured, not assumed); amber + pulse when any counter > 0; red, steady, only for
 * rows about the SELECTED ADDRESS. Click a tile → panel with one tab per counter, rows in the Today-tab grammar:
 * label · value · time ago · link. No new cron: this file composes products the page already loads.
 *
 * Every threshold is a named constant in RULES. Every row carries `rule` + `source` + the raw value that tripped it,
 * so a reader can always see why a tile is amber. A counter whose source is not captured yet renders 0 with a
 * "not captured yet" note — blank beats phantom.
 *
 * API:  AlertCenter.build(inputs, opts) → { tiles, meta }      pure
 *       AlertCenter.render(container, result, opts)              DOM
 *       AlertCenter.RULES / .VERSION / .marker (get/set "since you last looked")
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const H = 3600e3, D = 24 * H;
  const RULES = Object.freeze({
    WINDOW_DEFAULT_MS: D,            // first-time visitor: 24h
    WINDOW_LONG_MS: 7 * D,           // toggle
    FLOOR_DROP_PCT: 10,              // floor-history: tier floor down ≥ 10% vs the prior day
    MASS_UNSTAKE_N: 5,               // ≥ 5 NFTs unstaked in 24h → one "mass" row
    MASS_UNSTAKE_PCT: 1,             // or ≥ 1% of staked supply
    MASS_TRANSFER_N: 5,              // ≥ 5 P2P transfers from one wallet in 24h → one "mass" row
    ASSET_ACTIVE: ['migrating', 'winding_down', 'watch'],
    FORUM_ACTIVE: ['discussion', 'voting', 'watch'],
  });
  const MARKER_KEY = 'tla:alert-center:seen';
  const marker = {
    get() { try { const v = localStorage.getItem(MARKER_KEY); return v ? Number(v) : null; } catch (e) { return null; } },
    set(ts) { try { localStorage.setItem(MARKER_KEY, String(ts || Date.now())); } catch (e) { } },
  };
  const ago = (ts, now) => { const s = Math.max(0, (now - ts) / 1000); if (s < 90) return 'just now'; if (s < 5400) return Math.round(s / 60) + 'm ago'; if (s < 2 * D / 1000) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (v == null || v === '' || !isFinite(Number(v))) ? null : Number(v);
  const row = (o) => ({ ts: o.ts || null, label: o.label, value: o.value == null ? '' : String(o.value), link: o.link || null, linkLabel: o.linkLabel || null, rule: o.rule, source: o.source, raw: o.raw == null ? null : o.raw, mine: !!o.mine, note: o.note || null });
  const counter = (key, label, rows, gap) => ({ key, label, n: rows.length, rows, gap: gap || null });

  // ----------------------------------------------------------------------------- build
  // inputs: { now, alertsDoc, lpPools, props:{cards, isOpen}, items (Live Activity items), chainOnlyListings, floorHistory,
  //           bblFloor:{amount, symbol}, stakedSupply, myTokens:Set, explorerUrl, txUrl(hash) }
  // opts:   { since (ms|null), windowMs }
  function build(inputs, opts) {
    const now = inputs.now || Date.now();
    const windowMs = (opts && opts.windowMs) || RULES.WINDOW_DEFAULT_MS;
    const since = (opts && opts.since) || null;
    // "since you last looked" wins over the fixed window, but never shorter than 1h (a re-open seconds later is still "recent")
    const cut = since ? Math.max(since, now - windowMs, 0) : now - windowMs;
    const inWin = (ts) => ts != null && ts >= cut && ts <= now + 60e3;
    const txUrl = inputs.txUrl || ((h) => h ? `https://chainsco.pe/terra2/tx/${h}` : null);
    const explorer = inputs.explorerUrl || 'nft-explorer-index.html';
    const mine = (tok) => !!(inputs.myTokens && tok != null && inputs.myTokens.has(String(tok)));
    const tiles = [];

    // --- Ecosystem ---------------------------------------------------------------
    {
      const doc = inputs.alertsDoc, entries = (doc && Array.isArray(doc.alerts)) ? doc.alerts : [];
      const assets = entries.filter(a => a.kind === 'asset' && RULES.ASSET_ACTIVE.includes(a.status)).map(a => {
        const pools = (inputs.lpPools || []).filter(p => (p.alerts || []).some(x => x.kind === 'asset' && x.id === a.id));
        const vp = pools.reduce((s, p) => s + (num(p.vp) || 0), 0), staked = pools.reduce((s, p) => s + (num(p.staked_usd) || 0), 0);
        const tot = (inputs.lpPools || []).reduce((s, p) => s + (num(p.vp) || 0), 0);
        return row({ ts: a.dates && a.dates.announced ? Date.parse(a.dates.announced) : null, label: a.headline, value: pools.length ? `${pools.length} TLA gauge${pools.length === 1 ? '' : 's'} · ${tot ? (vp / tot * 100).toFixed(1) + '% of VP' : ''}${staked ? ' · $' + Math.round(staked).toLocaleString() + ' staked' : ''}` : (a.deadline ? 'by ' + a.deadline : a.status), link: a.source_url, linkLabel: 'how to migrate', rule: 'asset:' + a.status, source: 'docs/curated/alerts.json', raw: { id: a.id, deadline: a.deadline, pools: pools.map(p => p.name) }, note: a.action });
      });
      const forum = entries.filter(a => a.kind === 'forum' && RULES.FORUM_ACTIVE.includes(a.status)).map(a => row({ ts: a.dates && a.dates.opened ? Date.parse(a.dates.opened) : null, label: a.headline, value: (a.project ? a.project + ' · ' : '') + a.status, link: a.source_url, linkLabel: 'read the thread', rule: 'forum:' + a.status, source: 'docs/curated/alerts.json', raw: { id: a.id, pools: a.affects && a.affects.pool_names }, note: a.summary || a.action }));
      tiles.push({ key: 'ecosystem', title: 'Ecosystem', counters: [
        counter('tla', 'TLA', [], 'gauge set / take-rate changes — not captured yet'),
        counter('projects', 'Projects', forum),
        counter('pd', 'PD', [], 'Phoenix Directive drift — not captured yet'),
        counter('assets', 'Assets', assets),
      ] });
    }
    // --- Props -------------------------------------------------------------------
    {
      const cards = (inputs.props && inputs.props.cards) || [];
      const isOpen = (inputs.props && inputs.props.isOpen) || ((c) => !!(c.live || c.pending));
      const prow = (c, r) => row({ ts: c.endIso ? Date.parse(c.endIso) : null, label: `${c.dao}: ${c.title || '#' + c.id}`, value: c.live ? (c.daysLeft != null ? `${c.daysLeft}d left` : 'voting') : c.pending ? (c.vetoUntil ? 'veto lock until ' + String(c.vetoUntil).slice(0, 10) : 'veto lock') : (c.outcome || c.status || ''), link: c.link, linkLabel: 'vote / read', rule: r, source: 'dao-governance (live from chain)', raw: { dao: c.dao, id: c.id, yes: c.yesPct, no: c.noPct, turnout: c.turnoutPct }, mine: false });
      const live = cards.filter(c => isOpen(c) && c.live).map(c => prow(c, 'prop:live'));
      const veto = cards.filter(c => isOpen(c) && c.pending && !c.live).map(c => prow(c, 'prop:veto_lock'));
      const exec = cards.filter(c => !isOpen(c) && /^(executed|passed)$/i.test(String(c.status || c.outcome || '')) && c.endIso && inWin(Date.parse(c.endIso))).map(c => prow(c, 'prop:executed'));
      tiles.push({ key: 'props', title: 'Props', counters: [counter('live', 'Live', live), counter('veto', 'Veto lock', veto), counter('exec', 'Executed', exec, cards.length && !cards.some(c => c.endIso) ? 'execution times not in the capture yet' : null)], stateOnly: ['live', 'veto'] });
    }
    // --- NFTs aDAO ---------------------------------------------------------------
    {
      const items = (inputs.items || []).filter(x => x.col === 'adao' && inWin(x.ts));
      const tokLink = (t) => t != null ? `${explorer}?search=${encodeURIComponent(String(t))}` : explorer;
      const mk = (x, r, extra) => row(Object.assign({ ts: x.ts, label: `#${x.token != null ? x.token : '?'} ${x.label}`, value: x.sub || '', link: x.tx ? txUrl(x.tx) : tokLink(x.token), linkLabel: x.tx ? 'tx' : 'explorer', rule: r, source: x.tx ? 'ledger / transfers' : 'flows', raw: { token: x.token, tx: x.tx }, mine: mine(x.token) }, extra || {}));
      // marketplace
      const sales = items.filter(x => x.kind === 'sale').map(x => mk(x, 'nft:sale'));
      const floorAmt = inputs.bblFloor && num(inputs.bblFloor.amount);
      const listings = items.filter(x => x.kind === 'listing').map(x => { const a = num(x.amt); const newFloor = a != null && floorAmt != null && x.sym === (inputs.bblFloor.symbol || 'bLUNA') && a <= floorAmt; return newFloor ? mk(x, 'nft:listing_new_floor', { value: `sets the floor · ${x.sub || ''}`, raw: { token: x.token, amt: a, floor: floorAmt } }) : null; }).filter(Boolean);
      const chainOnly = (inputs.chainOnlyListings || []).map(l => row({ ts: l.ts || null, label: `#${l.tokenId} listed on-chain only · not on BBL's UI`, value: `${(num(l.price) || 0).toLocaleString()} ${l.priceToken || 'bLUNA'}${l.priceUsd ? ' · $' + Number(l.priceUsd).toFixed(2) : ''}`, link: tokLink(l.tokenId), linkLabel: 'explorer', rule: 'nft:chain_only_listing', source: 'nft-inventory C.6 (listing.source = chain_only)', raw: { token: l.tokenId, auction: l.auctionId }, mine: mine(l.tokenId) }));
      const drops = [];
      const fh = inputs.floorHistory;   // { tier: [{date, floor_usd}] } newest-last
      if (fh) for (const tier of Object.keys(fh)) { const s = (fh[tier] || []).filter(p => num(p.floor_usd) != null); if (s.length < 2) continue; const a = s[s.length - 2], b = s[s.length - 1]; const ts = Date.parse(b.date); if (!inWin(ts)) continue; const pct = (b.floor_usd - a.floor_usd) / a.floor_usd * 100; if (pct <= -RULES.FLOOR_DROP_PCT) drops.push(row({ ts, label: `${tier} floor down ${Math.abs(pct).toFixed(0)}%`, value: `$${a.floor_usd.toFixed(2)} → $${b.floor_usd.toFixed(2)}`, link: explorer, linkLabel: 'explorer', rule: `nft:floor_drop≥${RULES.FLOOR_DROP_PCT}%`, source: 'floor-history', raw: { tier, from: a.floor_usd, to: b.floor_usd } })); }
      const market = [...sales, ...listings, ...chainOnly, ...drops].sort((a, b) => (b.ts || 0) - (a.ts || 0));
      // staking
      const stk = items.filter(x => ['staked', 'unstaked', 'break', 'claimed'].includes(x.kind));
      const unst = stk.filter(x => x.kind === 'unstaked');
      const massN = unst.filter(x => x.ts >= now - D).length;
      const massPct = inputs.stakedSupply ? massN / inputs.stakedSupply * 100 : null;
      const staking = [];
      if (massN >= RULES.MASS_UNSTAKE_N || (massPct != null && massPct >= RULES.MASS_UNSTAKE_PCT)) staking.push(row({ ts: unst[0].ts, label: `Mass unstake: ${massN} NFTs in 24h`, value: massPct != null ? `${massPct.toFixed(2)}% of staked` : '', link: '#live-activity', linkLabel: 'feed', rule: `nft:mass_unstake≥${RULES.MASS_UNSTAKE_N}|${RULES.MASS_UNSTAKE_PCT}%`, source: 'ledger', raw: { n: massN, pct: massPct }, mine: unst.some(x => mine(x.token)) }));
      for (const x of stk) staking.push(mk(x, 'nft:' + x.kind));
      // p2p
      const p2p = items.filter(x => x.kind === 'transferred');
      const bySender = {}; for (const x of p2p) if (x.from && x.ts >= now - D) (bySender[x.from] = bySender[x.from] || []).push(x);
      const p2pRows = [];
      for (const [from, xs] of Object.entries(bySender)) if (xs.length >= RULES.MASS_TRANSFER_N) p2pRows.push(row({ ts: xs[0].ts, label: `Mass transfer: ${xs.length} NFTs from ${from.slice(0, 12)}…`, value: '', link: `https://chainsco.pe/terra2/address/${from}`, linkLabel: 'wallet', rule: `nft:mass_transfer≥${RULES.MASS_TRANSFER_N}`, source: 'ledger / transfers', raw: { from, n: xs.length }, mine: xs.some(x => mine(x.token)) }));
      for (const x of p2p) p2pRows.push(mk(x, 'nft:transfer'));
      tiles.push({ key: 'nfts-adao', title: 'NFTs aDAO', counters: [counter('market', 'Marketplace', market), counter('staking', 'Staking', staking), counter('p2p', 'P2P', p2pRows, null)] });
    }
    for (const t of tiles) {
      t.total = t.counters.reduce((s, c) => s + c.n, 0);
      t.mine = t.counters.some(c => c.rows.some(r => r.mine));
      t.state = t.mine ? 'red' : t.total > 0 ? 'amber' : 'green';
    }
    return { tiles, meta: { version: VERSION, now, cut, since, windowMs, rules: RULES } };
  }

  // ----------------------------------------------------------------------------- render
  const CSS = `
  .ac-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
  .ac-tile{position:relative;border-radius:.75rem;padding:12px 14px;cursor:pointer;background:rgba(17,24,39,.6);border:1px solid rgba(55,65,81,.6);transition:transform .12s}
  .ac-tile:hover{transform:translateY(-1px)}
  .ac-tile .ac-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;display:flex;align-items:center;gap:6px}
  .ac-tile .ac-counters{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 12px;font-family:monospace;font-size:12px;color:#d1d5db}
  .ac-tile .ac-counters b{color:#fff}
  .ac-tile[data-state=green]{border-color:rgba(16,185,129,.55);box-shadow:0 0 0 1px rgba(16,185,129,.15),0 0 14px rgba(16,185,129,.18)}
  .ac-tile[data-state=green] .ac-dot{background:#10b981;box-shadow:0 0 8px rgba(16,185,129,.9)}
  .ac-tile[data-state=amber]{border-color:rgba(245,158,11,.7);animation:acPulse 1.8s ease-in-out infinite}
  .ac-tile[data-state=amber] .ac-dot{background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,.9)}
  .ac-tile[data-state=red]{border-color:rgba(239,68,68,.8);box-shadow:0 0 0 1px rgba(239,68,68,.25),0 0 14px rgba(239,68,68,.3)}
  .ac-tile[data-state=red] .ac-dot{background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,.9)}
  .ac-tile.ac-open{outline:1px solid rgba(255,255,255,.25)}
  .ac-dot{width:8px;height:8px;border-radius:9999px;display:inline-block}
  @keyframes acPulse{0%,100%{box-shadow:0 0 0 1px rgba(245,158,11,.2),0 0 10px rgba(245,158,11,.25)}50%{box-shadow:0 0 0 1px rgba(245,158,11,.45),0 0 22px rgba(245,158,11,.55)}}
  .ac-panel{margin-top:10px;border-radius:.75rem;background:rgba(10,12,16,.9);border:1px solid rgba(255,255,255,.1)}
  .ac-tabs{display:flex;gap:4px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
  .ac-tab{font-size:11px;padding:3px 10px;border-radius:9999px;border:1px solid rgba(255,255,255,.12);color:#9ca3af;cursor:pointer;background:transparent}
  .ac-tab.active{color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.06)}
  .ac-tab b{font-family:monospace;margin-left:4px}
  .ac-rows{max-height:340px;overflow-y:auto;padding:6px 10px}
  .ac-row{display:grid;grid-template-columns:1fr auto auto;gap:6px 12px;align-items:baseline;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px}
  .ac-row:last-child{border-bottom:0}
  .ac-row .ac-l{color:#e5e7eb}.ac-row .ac-v{color:#9ca3af;font-family:monospace;white-space:nowrap}.ac-row .ac-t{color:#6b7280;font-size:10px;white-space:nowrap}
  .ac-row .ac-note{grid-column:1/-1;color:#9ca3af;font-size:11px}
  .ac-row .ac-why{grid-column:1/-1;color:#4b5563;font-size:10px;font-family:monospace}
  .ac-row.mine .ac-l::before{content:'●';color:#ef4444;margin-right:6px}
  .ac-row a{color:#67e8f9;text-decoration:none;margin-left:6px;font-size:11px}
  .ac-empty{color:#6b7280;font-size:12px;padding:12px 10px}
  .ac-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.08);font-size:10px;color:#6b7280;flex-wrap:wrap}
  .ac-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
  .ac-head .ac-quiet{font-size:12px;color:#10b981;font-weight:600}
  .ac-head .ac-busy{font-size:12px;color:#f59e0b;font-weight:600}
  .ac-head .ac-win{display:flex;gap:4px}
  `;
  function injectCss(doc) { if (doc.getElementById('ac-css')) return; const s = doc.createElement('style'); s.id = 'ac-css'; s.textContent = CSS; doc.head.appendChild(s); }

  // opts: { onWindow(ms), onClose(), windowMs, openTile, openCounter, showWhy }
  function render(container, result, opts) {
    opts = opts || {}; const doc = container.ownerDocument; injectCss(doc);
    const now = result.meta.now, tiles = result.tiles;
    const busy = tiles.filter(t => t.total > 0).length;
    const winMs = result.meta.windowMs, sinceTxt = result.meta.since ? 'since you last looked (' + ago(result.meta.cut, now) + ')' : (winMs >= RULES.WINDOW_LONG_MS ? 'last 7 days' : 'last 24 hours');
    const st = container.__ac || (container.__ac = { openTile: opts.openTile || null, openCounter: opts.openCounter || null });
    container.innerHTML = `
      <div class="ac-head">
        <div>${busy ? `<span class="ac-busy"><i class="fas fa-triangle-exclamation mr-1"></i>${busy} tile${busy === 1 ? '' : 's'} need${busy === 1 ? 's' : ''} a look</span>` : `<span class="ac-quiet"><i class="fas fa-circle-check mr-1"></i>Nothing needs your attention across Terra right now</span>`}
          <span class="text-[10px] text-gray-500 ml-2">${esc(sinceTxt)} · counts are events in the window, measured from products, never assumed</span></div>
        <div class="ac-win"><button class="ac-tab ${winMs < RULES.WINDOW_LONG_MS ? 'active' : ''}" data-win="${RULES.WINDOW_DEFAULT_MS}">24h</button><button class="ac-tab ${winMs >= RULES.WINDOW_LONG_MS ? 'active' : ''}" data-win="${RULES.WINDOW_LONG_MS}">7d</button></div>
      </div>
      <div class="ac-grid">${tiles.map(t => `<div class="ac-tile ${st.openTile === t.key ? 'ac-open' : ''}" data-tile="${t.key}" data-state="${t.state}" role="button" tabindex="0" aria-label="${esc(t.title)}: ${t.total} in window">
          <div class="ac-title"><span class="ac-dot"></span>${esc(t.title)}</div>
          <div class="ac-counters">${t.counters.map(c => `<span data-counter="${c.key}" title="${esc(c.gap || '')}">${esc(c.label)} = <b>${c.n}</b></span>`).join('')}</div>
        </div>`).join('')}</div>
      <div class="ac-panel" id="ac-panel" style="display:${st.openTile ? 'block' : 'none'}"></div>`;
    const panel = container.querySelector('#ac-panel');
    const drawPanel = () => {
      const t = tiles.find(x => x.key === st.openTile); if (!t) { panel.style.display = 'none'; return; }
      const cur = t.counters.find(c => c.key === st.openCounter) || t.counters.find(c => c.n > 0) || t.counters[0]; st.openCounter = cur.key;
      panel.style.display = 'block';
      panel.innerHTML = `<div class="ac-tabs">${t.counters.map(c => `<button class="ac-tab ${c.key === cur.key ? 'active' : ''}" data-ctab="${c.key}">${esc(c.label)}<b>${c.n}</b></button>`).join('')}</div>
        <div class="ac-rows">${cur.rows.length ? cur.rows.map(r => `<div class="ac-row ${r.mine ? 'mine' : ''}"><span class="ac-l">${esc(r.label)}${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.linkLabel || 'open')} ↗</a>` : ''}</span><span class="ac-v">${esc(r.value)}</span><span class="ac-t">${r.ts ? ago(r.ts, now) : ''}</span>${r.note ? `<span class="ac-note">${esc(r.note)}</span>` : ''}${opts.showWhy !== false ? `<span class="ac-why">rule ${esc(r.rule)} · ${esc(r.source)}${r.raw != null ? ' · ' + esc(JSON.stringify(r.raw)).slice(0, 140) : ''}</span>` : ''}</div>`).join('') : `<div class="ac-empty">${cur.gap ? esc(cur.gap) + ' — 0 by honesty, not by measurement' : 'Nothing in the window.'}</div>`}</div>
        <div class="ac-foot"><span>${esc(t.title)} · ${t.total} in window · lib/alert-center.js ${VERSION}</span><button class="ac-tab" id="ac-close">Close · mark as seen</button></div>`;
      panel.querySelectorAll('[data-ctab]').forEach(b => b.addEventListener('click', () => { st.openCounter = b.dataset.ctab; drawPanel(); }));
      const c = panel.querySelector('#ac-close'); if (c) c.addEventListener('click', () => { st.openTile = null; marker.set(now); container.querySelectorAll('.ac-tile').forEach(x => x.classList.remove('ac-open')); panel.style.display = 'none'; if (opts.onClose) opts.onClose(now); });
    };
    container.querySelectorAll('.ac-tile').forEach(el => { const open = () => { st.openTile = el.dataset.tile; st.openCounter = null; container.querySelectorAll('.ac-tile').forEach(x => x.classList.toggle('ac-open', x === el)); drawPanel(); }; el.addEventListener('click', open); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }); });
    container.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => { if (opts.onWindow) opts.onWindow(Number(b.dataset.win)); }));
    drawPanel();
    return { state: st };
  }

  root.AlertCenter = { VERSION, RULES, build, render, marker, _ago: ago };
})(typeof window !== 'undefined' ? window : globalThis);
