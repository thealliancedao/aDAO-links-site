/* lib/alert-center.js — 1.1.0 (2026-09-17) — SPEC-alert-center Phase 1 · 1.1.0: a tile opens a FULL-PAGE window (owner):
 * left rail = every tile + counter, main = rich scrollable cards (proposal cards with vote bars, asset wind-down with its
 * timeline + affected-gauge table, forum threads with their pools, NFT events with thumbnails). The inline panel is gone.
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
  const VERSION = '1.7.0';   // 1.7.0 (owner): ALERT vs ACTIVITY — a tile is amber only for rows that need a look (a live vote, a wind-down, a floor drop, a threshold crossing…); ordinary activity (sales, listings, an epoch flip, an executed prop) is counted in grey and never colours a tile   // 1.6.1: gauge/epoch rows live on the TLA tile ("Gauges · Epochs"), Ecosystem is Projects · PD · Assets — the split confused the owner   // 1.6.0: TLA tile from member-data/tla-alerts (rules tuned in docs/curated/alert-thresholds.json); Ecosystem·TLA counter live; ⚙ Thresholds tab shows the config with fire rates, edits, and downloads a new file with upload directions   // 1.5.0 (owner): itemInline() — the card's facts laid out in the row's empty width on desktop (price then/now · status · parties + holdings); the expand stays for phones   // 1.4.0 (owner): default window 7d (toggle 30d); the "seen" marker marks rows NEW instead of shrinking the window; itemCard() exported so Live Activity renders the same card   // 1.3.0: NFT cards — both parties with holdings, token status, USD then/now + spread; Staking / Breaks   // 1.2.0: full text + links on registry cards, marketplace counts every venue event (notable first), props from the corpus with full description / decoded messages / Quick audit
  const H = 3600e3, D = 24 * H;
  const RULES = Object.freeze({
    WINDOW_DEFAULT_MS: 7 * D,        // owner 2026-09-17: a week by default
    WINDOW_LONG_MS: 30 * D,          // toggle
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
  const row = (o) => ({ severity: o.severity || 'info', ts: o.ts || null, label: o.label, value: o.value == null ? '' : String(o.value), link: o.link || null, linkLabel: o.linkLabel || null, rule: o.rule, source: o.source, raw: o.raw == null ? null : o.raw, mine: !!o.mine, note: o.note || null, data: o.data || null });
  const counter = (key, label, rows, gap) => ({ key, label, n: rows.length, rows, gap: gap || null });

  // ----------------------------------------------------------------------------- build
  // inputs: { now, alertsDoc, lpPools, props:{cards, isOpen}, items (Live Activity items), chainOnlyListings, floorHistory,
  //           bblFloor:{amount, symbol}, stakedSupply, myTokens:Set, explorerUrl, txUrl(hash) }
  // opts:   { since (ms|null), windowMs }
  function build(inputs, opts) {
    const now = inputs.now || Date.now();
    // 1.6.0: the curated thresholds (member-data/tla-alerts → config.nft) override the NFT constants when present
    const NC = (inputs.tlaAlerts && inputs.tlaAlerts.config && inputs.tlaAlerts.config.nft) || {};
    const R = Object.assign({}, RULES, { FLOOR_DROP_PCT: num(NC.floor_drop_pct) ?? RULES.FLOOR_DROP_PCT, MASS_UNSTAKE_N: num(NC.mass_unstake_n) ?? RULES.MASS_UNSTAKE_N, MASS_UNSTAKE_PCT: num(NC.mass_unstake_pct) ?? RULES.MASS_UNSTAKE_PCT, MASS_TRANSFER_N: num(NC.mass_transfer_n) ?? RULES.MASS_TRANSFER_N });
    const windowMs = (opts && opts.windowMs) || RULES.WINDOW_DEFAULT_MS;
    const since = (opts && opts.since) || null;
    // 1.4.0: the window is the window; "since you last looked" only marks what is NEW (never hides what happened this week)
    const cut = now - windowMs;
    const inWin = (ts) => ts != null && ts >= cut && ts <= now + 60e3;
    const txUrl = inputs.txUrl || ((h) => h ? `https://chainsco.pe/terra2/tx/${h}` : null);
    const explorer = inputs.explorerUrl || 'nft-explorer-index.html';
    const mine = (tok) => !!(inputs.myTokens && tok != null && inputs.myTokens.has(String(tok)));
    const tiles = [];

    // --- TLA alert rows (member-data/tla-alerts): shared by the Ecosystem·TLA counter and the TLA tile ----------------
    const TA = inputs.tlaAlerts, taRows = (TA && Array.isArray(TA.rows)) ? TA.rows.filter(r => inWin(Date.parse(r.ts))) : null;
    const taRow = (r) => row({ severity: r.rule === 'epoch_flip' ? 'info' : 'alert', ts: Date.parse(r.ts), label: r.label, value: r.value, link: 'tla-stats.html', linkLabel: 'TLA stats', rule: 'tla:' + r.rule, source: 'member-data/tla-alerts (docs/curated/alert-thresholds.json)', raw: r.raw, data: { tla: r } });
    const pick = (...rules) => taRows ? taRows.filter(r => rules.includes(r.rule)).map(taRow) : [];
    // --- Ecosystem ---------------------------------------------------------------
    {
      const doc = inputs.alertsDoc, entries = (doc && Array.isArray(doc.alerts)) ? doc.alerts : [];
      const assets = entries.filter(a => a.kind === 'asset' && RULES.ASSET_ACTIVE.includes(a.status)).map(a => {
        const pools = (inputs.lpPools || []).filter(p => (p.alerts || []).some(x => x.kind === 'asset' && x.id === a.id));
        const vp = pools.reduce((s, p) => s + (num(p.vp) || 0), 0), staked = pools.reduce((s, p) => s + (num(p.staked_usd) || 0), 0);
        const tot = (inputs.lpPools || []).reduce((s, p) => s + (num(p.vp) || 0), 0);
        return row({ severity: 'alert', ts: a.dates && a.dates.announced ? Date.parse(a.dates.announced) : null, label: a.headline, value: pools.length ? `${pools.length} TLA gauge${pools.length === 1 ? '' : 's'} · ${tot ? (vp / tot * 100).toFixed(1) + '% of VP' : ''}${staked ? ' · $' + Math.round(staked).toLocaleString() + ' staked' : ''}` : (a.deadline ? 'by ' + a.deadline : a.status), link: a.source_url, linkLabel: 'how to migrate', rule: 'asset:' + a.status, source: 'docs/curated/alerts.json', raw: { id: a.id, deadline: a.deadline, pools: pools.map(p => p.name) }, note: a.action, data: { entry: a, pools: pools.slice().sort((x, y) => (num(y.vp) || 0) - (num(x.vp) || 0)), totalVp: tot } });
      });
      const forum = entries.filter(a => a.kind === 'forum' && RULES.FORUM_ACTIVE.includes(a.status)).map(a => row({ severity: a.status === 'watch' ? 'info' : 'alert', ts: a.dates && a.dates.opened ? Date.parse(a.dates.opened) : null, label: a.headline, value: (a.project ? a.project + ' · ' : '') + a.status, link: a.source_url, linkLabel: 'read the thread', rule: 'forum:' + a.status, source: 'docs/curated/alerts.json', raw: { id: a.id, pools: a.affects && a.affects.pool_names }, note: a.summary || a.action, data: { entry: a, pools: (inputs.lpPools || []).filter(p => (p.alerts || []).some(x => x.kind === 'forum' && x.id === a.id)) } }));
      tiles.push({ key: 'ecosystem', title: 'Ecosystem', counters: [
        counter('projects', 'Projects', forum),
        counter('pd', 'PD', [], 'Phoenix Directive drift — not captured yet'),
        counter('assets', 'Assets', assets),
      ] });
    }
    // --- TLA (member-data/tla-alerts product; rules + thresholds in docs/curated/alert-thresholds.json) ----------
    {
      const gap = taRows ? null : 'member-data/tla-alerts not published yet';
      tiles.push({ key: 'tla', title: 'TLA', counters: [counter('gauges', 'Gauges · Epochs', pick('gauge_set_change', 'epoch_flip'), gap), counter('vp', 'VP moves', pick('bucket_vp_move', 'pool_vp_move'), gap), counter('liq', 'Liquidity · Volume', pick('pool_liquidity_move', 'pool_volume_spike'), gap), counter('apr', 'APR', pick('pool_apr_move'), gap)] });
    }
    // --- Props -------------------------------------------------------------------
    {
      const cards = (inputs.props && inputs.props.cards) || [];
      const isOpen = (inputs.props && inputs.props.isOpen) || ((c) => !!(c.live || c.pending));
      const prow = (c, r) => row({ severity: /executed/.test(r) ? 'info' : 'alert', data: { card: c, full: c.descFull || null, actions: c.decodedActions || null, rawMsgs: c.rawMsgs || null }, ts: c.endIso ? Date.parse(c.endIso) : null, label: `${c.dao}: ${c.title || '#' + c.id}`, value: c.live ? (c.daysLeft != null ? `${c.daysLeft}d left` : 'voting') : c.pending ? (c.vetoUntil ? 'veto lock until ' + String(c.vetoUntil).slice(0, 10) : 'veto lock') : (c.outcome || c.status || ''), link: c.link, linkLabel: 'vote / read', rule: r, source: 'dao-governance (live from chain)', raw: { dao: c.dao, id: c.id, yes: c.yesPct, no: c.noPct, turnout: c.turnoutPct }, mine: false });
      const live = cards.filter(c => isOpen(c) && c.live).map(c => prow(c, 'prop:live'));
      const veto = cards.filter(c => isOpen(c) && c.pending && !c.live).map(c => prow(c, 'prop:veto_lock'));
      const exec = cards.filter(c => !isOpen(c) && /^(executed|passed|execution_success)$/i.test(String(c.status || c.outcome || '')) && c.endIso && inWin(Date.parse(c.endIso))).map(c => prow(c, 'prop:executed(voting_end_in_window)'));
      tiles.push({ key: 'props', title: 'Props', counters: [counter('live', 'Live', live), counter('veto', 'Veto lock', veto), counter('exec', 'Executed', exec, 'the capture records when voting ended, not when the executor fired — a prop counts here when its vote closed inside the window')], stateOnly: ['live', 'veto'] });
    }
    // --- NFTs aDAO ---------------------------------------------------------------
    {
      const items = (inputs.items || []).filter(x => x.col === 'adao' && inWin(x.ts));
      const tokLink = (t) => t != null ? `${explorer}?search=${encodeURIComponent(String(t))}` : explorer;
      const ALERT_NFT = /^nft:(listing_new_floor|chain_only_listing|floor_drop|mass_|break)/;
      const mk = (x, r, extra) => row(Object.assign({ severity: ALERT_NFT.test(r) ? 'alert' : 'info', ts: x.ts, label: `#${x.token != null ? x.token : '?'} ${x.label}`, value: x.sub || '', link: x.tx ? txUrl(x.tx) : tokLink(x.token), linkLabel: x.tx ? 'tx' : 'explorer', rule: r, source: x.tx ? 'ledger / transfers' : 'flows', raw: { token: x.token, tx: x.tx }, mine: mine(x.token), data: { item: x } }, extra || {}));
      // marketplace
      const sales = items.filter(x => x.kind === 'sale').map(x => mk(x, 'nft:sale'));
      const floorAmt = inputs.bblFloor && num(inputs.bblFloor.amount);
      const listings = items.filter(x => x.kind === 'listing').map(x => { const a = num(x.amt); const newFloor = a != null && floorAmt != null && x.sym === (inputs.bblFloor.symbol || 'bLUNA') && a <= floorAmt; return newFloor ? mk(x, 'nft:listing_new_floor', { value: `sets the floor · ${x.sub || ''}`, raw: { token: x.token, amt: a, floor: floorAmt } }) : null; }).filter(Boolean);
      const chainOnly = (inputs.chainOnlyListings || []).map(l => row({ severity: 'alert', ts: l.ts || null, label: `#${l.tokenId} listed on-chain only · not on BBL's UI`, value: `${(num(l.price) || 0).toLocaleString()} ${l.priceToken || 'bLUNA'}${l.priceUsd ? ' · $' + Number(l.priceUsd).toFixed(2) : ''}`, link: tokLink(l.tokenId), linkLabel: 'explorer', rule: 'nft:chain_only_listing', source: 'nft-inventory C.6 (listing.source = chain_only)', raw: { token: l.tokenId, auction: l.auctionId }, mine: mine(l.tokenId), data: { listing: l } }));
      const drops = [];
      const fh = inputs.floorHistory;   // { tier: [{date, floor_usd}] } newest-last
      if (fh) for (const tier of Object.keys(fh)) { const s = (fh[tier] || []).filter(p => num(p.floor_usd) != null); if (s.length < 2) continue; const a = s[s.length - 2], b = s[s.length - 1]; const ts = Date.parse(b.date); if (!inWin(ts)) continue; const pct = (b.floor_usd - a.floor_usd) / a.floor_usd * 100; if (pct <= -R.FLOOR_DROP_PCT) drops.push(row({ severity: 'alert', ts, label: `${tier} floor down ${Math.abs(pct).toFixed(0)}%`, value: `$${a.floor_usd.toFixed(2)} → $${b.floor_usd.toFixed(2)}`, link: explorer, linkLabel: 'explorer', rule: `nft:floor_drop≥${R.FLOOR_DROP_PCT}%`, source: 'floor-history', raw: { tier, from: a.floor_usd, to: b.floor_usd } })); }
      // 1.2.0 (owner): the counter is EVERY venue event in the window — sales, listings, delistings, bids — with the notable
      // ones (sale · listing that sets the floor · chain-only listing · floor drop) flagged and sorted first.
      const notableSet = new Set([...sales, ...listings].map(r => r.raw && r.raw.token + '|' + r.rule));
      const plain = items.filter(x => ['listing', 'delisting', 'bid'].includes(x.kind) && !listings.some(l => l.raw.token === x.token && l.ts === x.ts)).map(x => mk(x, 'nft:' + x.kind));
      for (const r of [...sales, ...listings, ...chainOnly, ...drops]) r.notable = true;
      const market = [...sales, ...listings, ...chainOnly, ...drops, ...plain].sort((a, b) => ((b.notable ? 1 : 0) - (a.notable ? 1 : 0)) || ((b.ts || 0) - (a.ts || 0)));
      // staking
      const stk = items.filter(x => ['staked', 'unstaked', 'break', 'claimed'].includes(x.kind));
      const unst = stk.filter(x => x.kind === 'unstaked');
      const massN = unst.filter(x => x.ts >= now - D).length;
      const massPct = inputs.stakedSupply ? massN / inputs.stakedSupply * 100 : null;
      const staking = [];
      if (massN >= R.MASS_UNSTAKE_N || (massPct != null && massPct >= R.MASS_UNSTAKE_PCT)) staking.push(row({ severity: 'alert', ts: unst[0].ts, label: `Mass unstake: ${massN} NFTs in 24h`, value: massPct != null ? `${massPct.toFixed(2)}% of staked` : '', link: '#live-activity', linkLabel: 'feed', rule: `nft:mass_unstake≥${R.MASS_UNSTAKE_N}|${R.MASS_UNSTAKE_PCT}%`, source: 'ledger', raw: { n: massN, pct: massPct }, mine: unst.some(x => mine(x.token)), data: { tokens: unst.map(x => x.token) } }));
      for (const x of stk) staking.push(mk(x, 'nft:' + x.kind));
      // p2p
      const p2p = items.filter(x => x.kind === 'transferred');
      const bySender = {}; for (const x of p2p) if (x.from && x.ts >= now - D) (bySender[x.from] = bySender[x.from] || []).push(x);
      const p2pRows = [];
      for (const [from, xs] of Object.entries(bySender)) if (xs.length >= R.MASS_TRANSFER_N) p2pRows.push(row({ severity: 'alert', ts: xs[0].ts, label: `Mass transfer: ${xs.length} NFTs from ${from.slice(0, 12)}…`, value: '', link: `https://chainsco.pe/terra2/address/${from}`, linkLabel: 'wallet', rule: `nft:mass_transfer≥${R.MASS_TRANSFER_N}`, source: 'ledger / transfers', raw: { from, n: xs.length }, mine: xs.some(x => mine(x.token)), data: { tokens: xs.map(x => x.token), from } }));
      for (const x of p2p) p2pRows.push(mk(x, 'nft:transfer'));
      tiles.push({ key: 'nfts-adao', title: 'NFTs aDAO', counters: [counter('market', 'Marketplace', market), counter('staking', 'Staking / Breaks', staking), counter('p2p', 'P2P', p2pRows, null)] });
    }
    for (const t of tiles) {
      for (const c of t.counters) { for (const r of c.rows) { r.isNew = !!(since && r.ts && r.ts > since); if (r.mine) r.severity = 'alert'; } c.rows.sort((a, b) => ((b.severity === 'alert') - (a.severity === 'alert')) || ((b.notable ? 1 : 0) - (a.notable ? 1 : 0)) || ((b.ts || 0) - (a.ts || 0))); c.alerts = c.rows.filter(r => r.severity === 'alert').length; }
      t.newCount = t.counters.reduce((s, c) => s + c.rows.filter(r => r.isNew).length, 0);
      t.total = t.counters.reduce((s, c) => s + c.n, 0);
      t.alerts = t.counters.reduce((s, c) => s + c.alerts, 0);
      t.mine = t.counters.some(c => c.rows.some(r => r.mine));
      // 1.7.0: colour follows ALERTS, never activity — green with activity is "things happened, nothing needs you"
      t.state = t.mine ? 'red' : t.alerts > 0 ? 'amber' : 'green';
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
  .ac-dot{width:8px;height:8px;border-radius:9999px;display:inline-block}
  @keyframes acPulse{0%,100%{box-shadow:0 0 0 1px rgba(245,158,11,.2),0 0 10px rgba(245,158,11,.25)}50%{box-shadow:0 0 0 1px rgba(245,158,11,.45),0 0 22px rgba(245,158,11,.55)}}
  .ac-tab{font-size:11px;padding:3px 10px;border-radius:9999px;border:1px solid rgba(255,255,255,.12);color:#9ca3af;cursor:pointer;background:transparent}
  .ac-tab.active{color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.06)}
  .ac-tab b{font-family:monospace;margin-left:4px}
  .ac-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
  .ac-head .ac-quiet{font-size:12px;color:#10b981;font-weight:600}
  .ac-head .ac-busy{font-size:12px;color:#f59e0b;font-weight:600}
  .ac-head .ac-win{display:flex;gap:4px}
  /* ---- full-page window ---- */
  .ac-full{position:fixed;inset:0;z-index:70;background:rgba(6,8,12,.97);display:flex;flex-direction:column;color:#e5e7eb}
  .ac-full-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.1);flex-wrap:wrap}
  .ac-full-head .t{font-size:15px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px}
  .ac-full-head .s{font-size:11px;color:#9ca3af}
  .ac-full-body{display:grid;grid-template-columns:260px 1fr;min-height:0;flex:1}
  @media (max-width:820px){.ac-full-body{grid-template-columns:1fr;grid-template-rows:auto 1fr}}
  .ac-rail{overflow-y:auto;border-right:1px solid rgba(255,255,255,.08);padding:12px}
  @media (max-width:820px){.ac-rail{border-right:0;border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:8px;overflow-x:auto;padding:8px 12px}.ac-rail .ac-rt{min-width:220px}}
  .ac-rt{border-radius:.6rem;border:1px solid rgba(255,255,255,.08);padding:10px 12px;margin-bottom:10px;background:rgba(255,255,255,.02)}
  .ac-rt[data-state=amber]{border-color:rgba(245,158,11,.5)}.ac-rt[data-state=red]{border-color:rgba(239,68,68,.6)}.ac-rt[data-state=green]{border-color:rgba(16,185,129,.35)}
  .ac-rt .n{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;display:flex;gap:6px;align-items:center;margin-bottom:6px}
  .ac-rc{display:flex;justify-content:space-between;align-items:center;width:100%;padding:5px 8px;border-radius:.4rem;font-size:12px;color:#d1d5db;background:transparent;border:1px solid transparent;cursor:pointer;text-align:left}
  .ac-rc:hover{background:rgba(255,255,255,.04)}.ac-rc.active{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.18);color:#fff}
  .ac-rc b{font-family:monospace}.ac-rc.zero{color:#6b7280}
  .ac-main{overflow-y:auto;padding:16px 20px}
  .ac-main h2{font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px}
  .ac-card{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.025);border-radius:.75rem;padding:14px 16px;margin-bottom:12px}
  .ac-card.mine{border-color:rgba(239,68,68,.6)}
  .ac-card .h{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
  .ac-card .h .ttl{font-size:15px;font-weight:700;color:#fff;line-height:1.3}
  .ac-card .h .meta{font-size:11px;color:#9ca3af;font-family:monospace;white-space:nowrap}
  .ac-card .body{font-size:13px;color:#d1d5db;margin-top:8px;line-height:1.5}
  .ac-card .act{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .ac-card .act a{font-size:12px;color:#67e8f9;text-decoration:none;border:1px solid rgba(103,232,249,.35);padding:4px 10px;border-radius:9999px}
  .ac-card .why{margin-top:10px;font-size:10px;color:#4b5563;font-family:monospace;word-break:break-all}
  .ac-pill{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;border:1px solid;margin-right:6px;text-transform:uppercase;letter-spacing:.04em}
  .ac-pill.amber{color:#fbbf24;border-color:rgba(251,191,36,.5)}.ac-pill.cyan{color:#67e8f9;border-color:rgba(103,232,249,.5)}.ac-pill.red{color:#f87171;border-color:rgba(248,113,113,.5)}.ac-pill.green{color:#34d399;border-color:rgba(52,211,153,.5)}.ac-pill.gray{color:#9ca3af;border-color:rgba(156,163,175,.4)}
  .ac-bar{height:8px;border-radius:9999px;background:rgba(255,255,255,.06);overflow:hidden;display:flex;margin-top:6px}
  .ac-bar i{display:block;height:100%}.ac-bar .y{background:#10b981}.ac-bar .no{background:#ef4444}.ac-bar .ab{background:#6b7280}
  .ac-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin-top:8px}.ac-kv dt{color:#6b7280}.ac-kv dd{margin:0;color:#e5e7eb;font-family:monospace}
  table.ac-t{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}table.ac-t th{text-align:left;color:#6b7280;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.08)}table.ac-t td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-family:monospace;color:#d1d5db}table.ac-t td.n{text-align:right}
  .ac-tl{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px}.ac-tl li{border:1px solid rgba(255,255,255,.08);border-radius:.5rem;padding:6px 8px;font-size:11px}.ac-tl li b{display:block;font-family:monospace;color:#fff;font-size:12px}.ac-tl li.past{opacity:.5}.ac-tl li.next{border-color:rgba(251,191,36,.6)}
  .ac-nft{display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:center}.ac-nft img{width:72px;height:72px;border-radius:.5rem;object-fit:cover;background:#111827}
  .ac-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.ac-chips span{font-family:monospace;font-size:11px;padding:2px 6px;border-radius:.3rem;background:rgba(255,255,255,.06)}
  .ac-more{margin-top:10px;border:1px solid rgba(255,255,255,.1);border-radius:.5rem;padding:6px 10px;font-size:12px}.ac-more summary{cursor:pointer;color:#67e8f9;font-weight:600}.ac-more[open] summary{margin-bottom:6px}
  .ac-long{font-size:13px;color:#d1d5db;line-height:1.55;max-width:900px}.ac-long p{margin:0 0 10px}
  .ac-pre{font-size:11px;color:#d1d5db;background:rgba(0,0,0,.35);border-radius:.4rem;padding:8px;overflow:auto;max-height:340px;white-space:pre-wrap;word-break:break-word}
  .ac-status{margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ac-venue{font-size:11px;color:#9ca3af}
  .ac-price{margin-top:8px;font-size:13px;color:#d1d5db;font-family:monospace}.ac-price b{color:#fff}.ac-neg{color:#f87171}.ac-pos{color:#34d399}
  .ac-parties{margin-top:8px;display:grid;gap:6px}.ac-party{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;align-items:baseline}.ac-party .ac-role{color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.ac-party a{color:#e5e7eb;text-decoration:none;font-weight:600}.ac-party .ac-addr{color:#6b7280;font-family:monospace;font-weight:400;font-size:11px;margin-left:4px}.ac-party .ac-hold{grid-column:2;color:#9ca3af;font-family:monospace;font-size:11px}
  .ac-inline{display:flex;flex-direction:column;gap:3px;align-items:flex-end;font-size:11px;color:#9ca3af;min-width:0}
  .ac-il-price{font-family:monospace;color:#d1d5db;white-space:nowrap}.ac-il-status{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
  .ac-il-parties{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end}.ac-il-party{display:inline-flex;gap:5px;align-items:baseline;white-space:nowrap}.ac-il-party a{color:#e5e7eb;text-decoration:none;font-weight:600}.ac-il-hold{font-family:monospace;color:#6b7280}
  @media (max-width:767px){.ac-inline{display:none}}
  .ac-params{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:8px}.ac-params label{display:inline-flex;flex-direction:column;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}.ac-params input{margin-top:2px;width:120px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);border-radius:.35rem;color:#fff;font-family:monospace;font-size:12px;padding:3px 6px}
  .ac-rates{margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#9ca3af}.ac-rates span.cur{color:#fbbf24}.ac-rates b{color:#fff;font-family:monospace}
  .ac-rt[data-state=none]{border-color:rgba(255,255,255,.12)}
  .ac-n-alert{color:#fbbf24}.ac-n-info{color:#9ca3af;font-weight:600}.ac-n-more{color:#6b7280;font-style:normal;font-size:10px;margin-left:2px}
  .ac-empty{color:#6b7280;font-size:13px;padding:24px 4px}
  .ac-gap{border:1px dashed rgba(255,255,255,.15);border-radius:.6rem;padding:12px 14px;color:#9ca3af;font-size:12px}
  `;
  function injectCss(doc) { if (doc.getElementById('ac-css')) return; const s = doc.createElement('style'); s.id = 'ac-css'; s.textContent = CSS; doc.head.appendChild(s); }
  const fmtUsd = (v) => v == null ? '' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: v < 100 ? 2 : 0 });
  const pct = (v) => v == null || !isFinite(Number(v)) ? '' : Number(v).toFixed(1) + '%';

  // ---- card renderers (default); opts.propHtml(card) / opts.nftImage(token) let the page enrich ----
  const sevPill = (r) => r.severity === 'alert' ? '' : '<span class="ac-pill gray">activity</span>';
  function whyLine(r) { return `<div class="why">rule ${esc(r.rule)} · ${esc(r.source)}${r.raw != null ? ' · ' + esc(JSON.stringify(r.raw)).slice(0, 220) : ''}</div>`; }
  function linkBtn(href, label) { return href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label || 'open')} ↗</a>` : ''; }
  const paras = (t) => String(t || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  function bodyBlock(entry, label) { const links = (entry.links || []).map(l => linkBtn(l.url, l.label)).join(''); return `${links ? `<div class="act">${links}</div>` : ''}${entry.body ? `<details class="ac-more"><summary>${esc(label || 'Read the full text as published')}</summary><div class="ac-long">${paras(entry.body)}</div></details>` : ''}`; }
  function propCard(r, now, opts) {
    const c = r.data && r.data.card; if (!c) return genericCard(r, now);
    const extra = (r.data.full ? `<details class="ac-more"><summary>Full description</summary><div class="ac-long">${paras(r.data.full)}</div></details>` : '') +
      (r.data.actions && r.data.actions.length ? `<details class="ac-more"><summary>Messages (${r.data.actions.length}) — decoded</summary><pre class="ac-pre">${esc(JSON.stringify(r.data.actions, null, 1))}</pre></details>` : (r.data.rawMsgs && r.data.rawMsgs.length ? `<details class="ac-more"><summary>Messages (${r.data.rawMsgs.length}) — raw</summary><pre class="ac-pre">${esc(JSON.stringify(r.data.rawMsgs, null, 1))}</pre></details>` : ''));
    if (opts.propHtml) { try { const h = opts.propHtml(c); if (h) return `<div class="ac-card ${r.mine ? 'mine' : ''}">${h}${extra}${whyLine(r)}</div>`; } catch (e) { } }
    const yes = num(c.yesPct) || 0, no = num(c.noPct) || 0, ab = Math.max(0, 100 - yes - no);
    const st = c.live ? '<span class="ac-pill amber">voting</span>' : c.pending ? '<span class="ac-pill cyan">veto lock</span>' : `<span class="ac-pill gray">${esc(c.outcome || c.status || '')}</span>`;
    return `<div class="ac-card ${r.mine ? 'mine' : ''}"><div class="h"><div class="ttl">${sevPill(r)}${st}${esc(c.dao)} · #${esc(c.id)} — ${esc(c.title || '')}</div><div class="meta">${c.daysLeft != null ? esc(c.daysLeft) + 'd left' : ''}${c.endIso ? ' · ends ' + esc(String(c.endIso).slice(0, 16).replace('T', ' ')) : ''}${c.vetoUntil ? ' · veto until ' + esc(String(c.vetoUntil).slice(0, 10)) : ''}</div></div>
      ${c.desc ? `<div class="body">${esc(c.desc)}${String(c.desc).length >= 220 ? '…' : ''}</div>` : ''}
      ${(c.yesPct != null || c.noPct != null) ? `<div class="ac-bar"><i class="y" style="width:${yes}%"></i><i class="no" style="width:${no}%"></i><i class="ab" style="width:${ab}%"></i></div><dl class="ac-kv"><dt>Yes</dt><dd>${pct(c.yesPct)}</dd><dt>No</dt><dd>${pct(c.noPct)}</dd><dt>Turnout</dt><dd>${pct(c.turnoutPct)}</dd>${c.movesFunds ? '<dt>Treasury</dt><dd>moves funds</dd>' : ''}${c.risk && c.risk.review ? '<dt>Review</dt><dd>' + esc(c.risk.reason || 'flagged') + '</dd>' : ''}</dl>` : ''}
      ${extra}<div class="act">${linkBtn(c.link, 'vote / read on the governance site')}</div>${whyLine(r)}</div>`;
  }
  function assetCard(r, now) {
    const a = r.data && r.data.entry; if (!a) return genericCard(r, now);
    const pools = (r.data.pools || []), tot = r.data.totalVp || 0;
    const dates = Object.entries(a.dates || {}).map(([k, v]) => ({ k, v, t: Date.parse(v) })).filter(x => isFinite(x.t)).sort((x, y) => x.t - y.t);
    const nextI = dates.findIndex(x => x.t > now);
    return `<div class="ac-card"><div class="h"><div class="ttl"><span class="ac-pill amber">${esc(a.status)}</span>${esc(a.headline)}</div><div class="meta">${a.deadline ? 'act by ' + esc(a.deadline) : ''}</div></div>
      ${a.action ? `<div class="body"><b>What to do:</b> ${esc(a.action)}</div>` : ''}
      ${dates.length ? `<ul class="ac-tl">${dates.map((x, i) => `<li class="${x.t <= now ? 'past' : ''} ${i === nextI ? 'next' : ''}"><b>${esc(x.v)}</b>${esc(x.k.replace(/_/g, ' '))}</li>`).join('')}</ul>` : ''}
      ${a.replacement ? `<dl class="ac-kv"><dt>Replacement</dt><dd>${esc(a.replacement.symbol || '')}${a.replacement.note ? ' — ' + esc(a.replacement.note) : ''}</dd></dl>` : ''}
      ${pools.length ? `<table class="ac-t"><thead><tr><th>TLA gauge holding ${esc(a.symbol || 'the asset')}</th><th>bucket</th><th>dex</th><th>grade</th><th class="n">VP share</th><th class="n">staked</th></tr></thead><tbody>${pools.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.bucket || '')}</td><td>${esc(p.dex || '')}</td><td>${esc((p.v2 && p.v2.letter) || p.grade || '–')}</td><td class="n">${tot ? ((num(p.vp) || 0) / tot * 100).toFixed(1) + '%' : ''}</td><td class="n">${fmtUsd(num(p.staked_usd))}</td></tr>`).join('')}<tr><td colspan="4"><b>${pools.length} gauges</b></td><td class="n"><b>${tot ? (pools.reduce((s2, p) => s2 + (num(p.vp) || 0), 0) / tot * 100).toFixed(1) + '%' : ''}</b></td><td class="n"><b>${fmtUsd(pools.reduce((s2, p) => s2 + (num(p.staked_usd) || 0), 0))}</b></td></tr></tbody></table>` : '<div class="body">No TLA gauge holds this asset today.</div>'}
      ${bodyBlock(a, 'Read the full announcement')}<div class="act">${linkBtn(a.source_url, a.source_label || 'source')}</div>${whyLine(r)}</div>`;
  }
  function forumCard(r, now) {
    const a = r.data && r.data.entry; if (!a) return genericCard(r, now);
    const pools = r.data.pools || [];
    return `<div class="ac-card"><div class="h"><div class="ttl"><span class="ac-pill cyan">${esc(a.status)}</span>${esc(a.headline)}</div><div class="meta">${esc(a.project || '')}${a.dates && a.dates.opened ? ' · opened ' + esc(a.dates.opened) : ''}</div></div>
      ${a.summary ? `<div class="body">${esc(a.summary)}</div>` : ''}${a.action ? `<div class="body"><b>${esc(a.action)}</b></div>` : ''}
      ${a.affects && a.affects.pool_names ? `<div class="ac-chips">${a.affects.pool_names.map(n => { const p = pools.find(x => String(x.name).toLowerCase() === String(n).toLowerCase()); return `<span>${esc(n)}${p ? ` · ${esc((p.v2 && p.v2.letter) || p.grade || '')} · ${fmtUsd(num(p.staked_usd))} staked` : ''}</span>`; }).join('')}</div>` : ''}
      ${a.affects && a.affects.note ? `<div class="body" style="color:#fbbf24">${esc(a.affects.note)}</div>` : ''}
      ${bodyBlock(a, 'Read the full post')}<div class="act">${linkBtn(a.source_url, 'read / reply on the forum')}</div>${whyLine(r)}</div>`;
  }
  // NFT card (1.3.0): thumbnail · headline · token status · price then/now · both parties with holdings · links
  function partyBlock(role, addr, opts) {
    if (!addr) return '';
    const name = opts.nameOf ? opts.nameOf(addr) : null, h = opts.holdingsOf ? opts.holdingsOf(addr) : null;
    const short = addr.slice(0, 10) + '…' + addr.slice(-4);
    const hold = h ? (h.total ? `${h.total} NFT${h.total === 1 ? '' : 's'} · listed ${h.listed} · liquid ${h.liquid} · staked ${h.staked} · broken ${h.broken}` : 'holds no aDAO NFTs now') : '';
    return `<div class="ac-party"><span class="ac-role">${esc(role)}</span><a href="https://chainsco.pe/terra2/address/${esc(addr)}" target="_blank" rel="noopener" title="${esc(addr)}">${name ? esc(name) + ' <span class="ac-addr">' + esc(short) + '</span>' : esc(short)}</a>${hold ? `<span class="ac-hold">${esc(hold)}</span>` : ''}</div>`;
  }
  function nftCard(r, now, opts) {
    const x = r.data && r.data.item, l = r.data && r.data.listing, tok = x ? x.token : l ? l.tokenId : (r.raw && r.raw.token);
    const img = opts.nftImage && tok != null ? opts.nftImage(tok) : null;
    const tokens = r.data && r.data.tokens;
    const info = opts.tokenInfo && tok != null ? opts.tokenInfo(tok) : null;
    const status = info ? `<span class="ac-pill ${info.broken ? 'red' : 'green'}">${info.broken ? 'broken' : 'unbroken'}</span>${info.listed ? `<span class="ac-pill cyan">listed · ${esc(info.venue || '')}</span>` : info.staked ? `<span class="ac-pill gray">staked · ${esc(info.where || '')}</span>` : info.where === 'wallet' ? '<span class="ac-pill gray">liquid</span>' : ''}` : '';
    // price then / now
    const amt = x ? num(x.amt) : l ? num(l.price) : null, sym = x ? x.sym : l ? (l.priceToken || 'bLUNA') : null;
    let priceLine = '';
    if (amt != null && sym) {
      const then = x && x.usd != null ? x.usd : (opts.usdAt ? opts.usdAt(sym, amt, r.ts) : null), nowUsd = opts.usdNow ? opts.usdNow(sym, amt) : null;
      const spread = then && nowUsd ? (nowUsd - then) / then * 100 : null;
      priceLine = `<div class="ac-price"><b>${amt.toLocaleString()} ${esc(sym)}</b>${then != null ? ` · ${fmtUsd(then)} at the time` : ''}${nowUsd != null ? ` · ${fmtUsd(nowUsd)} now` : ''}${spread != null ? ` <span class="${spread < 0 ? 'ac-neg' : 'ac-pos'}">(${spread >= 0 ? '+' : ''}${spread.toFixed(1)}%)</span>` : ''}${info && info.listed && info.listing_usd != null && x && x.kind !== 'listing' ? ` · listed now at ${fmtUsd(info.listing_usd)}` : ''}</div>`;
    }
    // parties by event kind
    const k = x ? x.kind : (l ? 'chain_only' : '');
    const parties = x ? (k === 'sale' ? partyBlock('Seller', x.seller || x.from, opts) + partyBlock('Buyer', x.buyer || x.to, opts)
      : k === 'listing' || k === 'delisting' ? partyBlock(k === 'listing' ? 'Lister' : 'Delisted by', x.seller || x.from || x.to || (info && info.owner), opts)
      : k === 'bid' ? partyBlock('Bidder', x.bidder || x.from, opts) + (info ? partyBlock('Owner', info.owner, opts) : '')
      : k === 'staked' ? partyBlock('Staker', x.from, opts) : k === 'unstaked' ? partyBlock('Unstaker', x.to || x.from, opts)
      : k === 'claimed' ? partyBlock('Claimed by', x.to, opts) : k === 'break' ? (info ? partyBlock('Owner', info.owner, opts) : '')
      : k === 'transferred' ? partyBlock('From', x.from, opts) + partyBlock('To', x.to, opts) : (info ? partyBlock('Owner', info.owner, opts) : ''))
      : (l ? partyBlock('Seller', l.seller, opts) : '');
    return `<div class="ac-card ${r.mine ? 'mine' : ''}"><div class="ac-nft">${img ? `<img src="${esc(img)}" alt="#${esc(tok)}" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div></div>'}<div>
      <div class="h"><div class="ttl">${r.isNew ? '<span class="ac-pill cyan">new</span>' : ''}${r.mine ? '<span class="ac-pill red">yours</span>' : ''}${r.severity === 'alert' ? '<span class="ac-pill amber">needs a look</span>' : '<span class="ac-pill gray">activity</span>'}${esc(r.label)}</div><div class="meta">${r.ts ? esc(ago(r.ts, now)) : ''}</div></div>
      ${status ? `<div class="ac-status">${status}${x && x.sub ? `<span class="ac-venue">${esc(x.sub)}</span>` : ''}</div>` : (r.value ? `<div class="body">${esc(r.value)}</div>` : '')}
      ${priceLine}${parties ? `<div class="ac-parties">${parties}</div>` : ''}
      ${tokens && tokens.length ? `<div class="ac-chips">${tokens.slice(0, 60).map(t => `<span>#${esc(t)}</span>`).join('')}${tokens.length > 60 ? `<span>+${tokens.length - 60}</span>` : ''}</div>` : ''}
      <div class="act">${linkBtn(r.link, r.linkLabel)}${x && x.tx && r.link && !/tx\//.test(r.link) ? linkBtn('https://chainsco.pe/terra2/tx/' + x.tx, 'tx') : ''}${tok != null && opts.explorerUrl ? linkBtn(opts.explorerUrl, 'explorer') : ''}</div></div></div>${whyLine(r)}</div>`;
  }
  function genericCard(r, now) { return `<div class="ac-card ${r.mine ? 'mine' : ''}"><div class="h"><div class="ttl">${esc(r.label)}</div><div class="meta">${r.ts ? esc(ago(r.ts, now)) : ''}</div></div>${r.value ? `<div class="body">${esc(r.value)}</div>` : ''}${r.note ? `<div class="body">${esc(r.note)}</div>` : ''}<div class="act">${linkBtn(r.link, r.linkLabel)}</div>${whyLine(r)}</div>`; }
  function tlaCard(r, now) { const t = r.data && r.data.tla; const kv = t && t.raw && typeof t.raw === 'object' ? Object.entries(t.raw).filter(([k, v]) => v != null && typeof v !== 'object').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'number' ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Math.round(v * 100) / 100) : v)}</dd>`).join('') : '';
    return `<div class="ac-card"><div class="h"><div class="ttl">${sevPill(r)}<span class="ac-pill ${r.severity === 'alert' ? 'amber' : 'gray'}">${esc(t ? t.rule.replace(/_/g, ' ') : 'tla')}</span>${esc(r.label)}</div><div class="meta">${r.ts ? esc(ago(r.ts, now)) : ''}${t && t.bucket ? ' · ' + esc(t.bucket) : ''}</div></div>${r.value ? `<div class="body">${esc(r.value)}</div>` : ''}${kv ? `<dl class="ac-kv">${kv}</dl>` : ''}${t && t.raw && t.raw.buckets ? `<table class="ac-t"><thead><tr><th>bucket</th><th class="n">from</th><th class="n">to</th><th class="n">Δ</th></tr></thead><tbody>${t.raw.buckets.map(b => `<tr><td>${esc(b.bucket)}</td><td class="n">${(b.from / 1e6).toFixed(2)}M</td><td class="n">${(b.to / 1e6).toFixed(2)}M</td><td class="n">${b.pct == null ? '' : (b.pct >= 0 ? '+' : '') + b.pct.toFixed(1) + '%'}</td></tr>`).join('')}</tbody></table>` : ''}<div class="act">${linkBtn(r.link, r.linkLabel)}</div>${whyLine(r)}</div>`; }
  function cardFor(r, now, opts) { const k = String(r.rule || ''); if (k.startsWith('tla:')) return tlaCard(r, now); if (k.startsWith('prop:')) return propCard(r, now, opts); if (k.startsWith('asset:')) return assetCard(r, now); if (k.startsWith('forum:')) return forumCard(r, now); if (k.startsWith('nft:')) return nftCard(r, now, opts); return genericCard(r, now); }

  // ---- the full-page window ----
  // opts: { openTile, openCounter, onWindow(ms), onClose(now), propHtml(card), nftImage(token), explorerUrl }
  function openFull(result, opts) {
    opts = opts || {}; const doc = opts.document || document; injectCss(doc);
    const now = result.meta.now, tiles = result.tiles;
    let old = doc.getElementById('ac-full'); let inherited = null; if (old) { inherited = old.dataset.prevOverflow != null ? old.dataset.prevOverflow : null; old.remove(); }
    const st = { tile: opts.openTile || (tiles.find(t => t.total > 0) || tiles[0]).key, counter: opts.openCounter || null };
    const el = doc.createElement('div'); el.className = 'ac-full'; el.id = 'ac-full'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    const busy = tiles.reduce((s2, t) => s2 + (t.alerts || 0), 0), winMs = result.meta.windowMs;
    const newN = tiles.reduce((s2, t) => s2 + (t.newCount || 0), 0);
    const sinceTxt = (winMs >= RULES.WINDOW_LONG_MS ? 'last 30 days' : 'last 7 days') + (result.meta.since ? ` · ${newN} new since you last looked (${ago(result.meta.since, now)})` : '');
    el.innerHTML = `<div class="ac-full-head"><div><div class="t"><i class="fas fa-bell" style="color:#fbbf24"></i>Ecosystem Alerts <span class="s" style="font-weight:400">· ${busy ? busy + ' thing' + (busy === 1 ? '' : 's') + ' need' + (busy === 1 ? 's' : '') + ' a look' : 'nothing needs your attention'} · ${esc(sinceTxt)}</span></div><div class="s">amber = needs a look · grey = activity, for the record · red = about your wallet · every card says which rule fired, from which product, with the raw value</div></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button class="ac-tab ${winMs < RULES.WINDOW_LONG_MS ? 'active' : ''}" data-win="${RULES.WINDOW_DEFAULT_MS}">7d</button><button class="ac-tab ${winMs >= RULES.WINDOW_LONG_MS ? 'active' : ''}" data-win="${RULES.WINDOW_LONG_MS}">30d</button><button class="ac-tab" id="ac-full-close" style="margin-left:8px;color:#fff;border-color:rgba(255,255,255,.4)">Close · mark as seen ✕</button></div></div>
      <div class="ac-full-body"><nav class="ac-rail" id="ac-rail"></nav><main class="ac-main" id="ac-main"></main></div>`;
    const prevOverflow = inherited != null ? inherited : doc.body.style.overflow;   // replacing an open window keeps the ORIGINAL body overflow to restore
    el.dataset.prevOverflow = prevOverflow; doc.body.appendChild(el); doc.body.style.overflow = 'hidden';
    const rail = el.querySelector('#ac-rail'), main = el.querySelector('#ac-main');
    function drawRail() {
      rail.innerHTML = tiles.map(t => `<div class="ac-rt" data-state="${t.state}"><div class="n"><span class="ac-dot"></span>${esc(t.title)}</div>${t.counters.map(c => `<button class="ac-rc ${t.key === st.tile && c.key === st.counter ? 'active' : ''} ${c.n === 0 ? 'zero' : ''}" data-tile="${t.key}" data-counter="${c.key}">${esc(c.label)}<span><b class="${c.alerts ? 'ac-n-alert' : 'ac-n-info'}">${c.alerts || 0}</b>${c.n - c.alerts ? `<i class="ac-n-more">+${c.n - c.alerts}</i>` : ''}</span></button>`).join('')}</div>`).join('');
      rail.innerHTML += `<div class="ac-rt" data-state="none"><div class="n">⚙ Thresholds</div><button class="ac-rc ${st.tile === '__config' ? 'active' : ''}" data-tile="__config" data-counter="config">Rules &amp; config<b>${opts.tlaAlerts && opts.tlaAlerts.config ? '✓' : '–'}</b></button></div>`;
      rail.querySelectorAll('.ac-rc').forEach(b => b.addEventListener('click', () => { st.tile = b.dataset.tile; st.counter = b.dataset.counter; drawRail(); drawMain(); }));
    }
    // ⚙ the config as the cron sees it: every rule with its numbers, fire rates at 0.5×/1×/2×, editable, downloadable
    function drawConfig() {
      const TA = opts.tlaAlerts, cfg = TA && TA.config; if (!cfg) { main.innerHTML = '<h2>Thresholds</h2><div class="ac-gap">member-data/tla-alerts has not been published yet — the config lives at tla-core/docs/curated/alert-thresholds.json.</div>'; return; }
      const stats = TA.stats || {}, mults = TA.multipliers || [0.5, 1, 2];
      const rulesHtml = Object.entries(cfg.tla || {}).map(([k, v]) => { const st2 = stats[k] || {}; return `<div class="ac-card ac-rule" data-rule="${esc(k)}"><div class="h"><div class="ttl"><label><input type="checkbox" data-en="${esc(k)}" ${v.enabled !== false ? 'checked' : ''}> ${esc(k)}</label></div><div class="meta">fired ${st2.fired_30d ?? '–'} in 30d · ${st2.fired_90d ?? '–'} in ${TA.history ? TA.history.days : 90}d</div></div>
        <div class="body">${esc(v.description || '')}</div>
        <div class="ac-params">${Object.entries(v.params || {}).map(([pk, pv]) => `<label><span>${esc(pk)}</span><input type="number" step="any" data-rule="${esc(k)}" data-param="${esc(pk)}" value="${esc(pv)}"></label>`).join('') || '<span class="ac-il-hold">no numbers — fires on the event itself</span>'}</div>
        <div class="ac-rates">${mults.map(m => `<span class="${m === 1 ? 'cur' : ''}">at ${m}× → <b>${st2.per_month_at ? (st2.per_month_at[String(m)] ?? '–') : '–'}</b>/month</span>`).join('')}</div></div>`; }).join('');
      const nftHtml = `<div class="ac-card"><div class="h"><div class="ttl">NFT rules (index + app)</div></div><div class="ac-params">${Object.entries(cfg.nft || {}).map(([pk, pv]) => `<label><span>${esc(pk)}</span><input type="number" step="any" data-nft="${esc(pk)}" value="${esc(pv)}"></label>`).join('')}</div></div>`;
      main.innerHTML = `<h2>Thresholds · config ${esc(TA.config.sha || '')} · updated ${esc(cfg.updatedAt || TA.config.updatedAt || '')}</h2>
        <div class="ac-gap" style="margin-bottom:12px"><b>How to change a threshold.</b> Edit the numbers below (the rates show how often each rule fired over the last ${TA.history ? TA.history.days : 90} days at half, current and double thresholds — the replay the cron already did). Then <b>Download</b>: it produces a new <code>alert-thresholds.json</code>. Upload it here: <a href="https://github.com/thealliancedao/tla-core/edit/main/docs/curated/alert-thresholds.json" target="_blank" rel="noopener">github.com/thealliancedao/tla-core → docs/curated/alert-thresholds.json (edit)</a> — replace the file's content with the download, Commit changes. The member-data cron re-evaluates after 23:00 UTC (or run it once with <code>TLA_ALERTS=1</code>); the site reads the new product on its next load. Nothing changes until the file is on GitHub.</div>
        ${rulesHtml}${nftHtml}
        <div class="act" style="margin-top:6px"><button class="ac-tab" id="ac-cfg-download">⬇ Download alert-thresholds.json</button><button class="ac-tab" id="ac-cfg-copy">Copy JSON</button><span class="ac-il-hold" id="ac-cfg-msg"></span></div>`;
      const build = () => { const out = JSON.parse(JSON.stringify({ schemaVersion: cfg.schemaVersion || 1, updatedAt: new Date().toISOString().slice(0, 10), readme: cfg.readme || '', tla: cfg.tla, nft: cfg.nft, sensitivity: cfg.sensitivity }));
        main.querySelectorAll('input[data-en]').forEach(i => { out.tla[i.dataset.en].enabled = i.checked; });
        main.querySelectorAll('input[data-param]').forEach(i => { const v = Number(i.value); if (isFinite(v)) out.tla[i.dataset.rule].params[i.dataset.param] = v; });
        main.querySelectorAll('input[data-nft]').forEach(i => { const v = Number(i.value); if (isFinite(v)) out.nft[i.dataset.nft] = v; });
        out.edited_on_site = { at: new Date().toISOString(), previous_sha: TA.config.sha || null }; return JSON.stringify(out, null, 2); };
      main.querySelector('#ac-cfg-download').addEventListener('click', () => { const txt = build(); try { const a = doc.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(txt); a.download = 'alert-thresholds.json'; doc.body.appendChild(a); a.click(); a.remove(); main.querySelector('#ac-cfg-msg').textContent = 'downloaded — now upload it at the GitHub link above'; } catch (e) { main.querySelector('#ac-cfg-msg').textContent = 'download blocked — use Copy JSON'; } });
      main.querySelector('#ac-cfg-copy').addEventListener('click', () => { const txt = build(); try { (root.navigator && navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { main.querySelector('#ac-cfg-msg').textContent = 'copied — paste it into the GitHub editor'; }, () => { main.querySelector('#ac-cfg-msg').textContent = txt.slice(0, 80) + '…'; }); } catch (e) { } });
      main.scrollTop = 0;
    }
    function drawMain() {
      if (st.tile === '__config') { drawConfig(); rail.querySelectorAll('.ac-rc').forEach(b => b.classList.toggle('active', b.dataset.tile === '__config')); return; }
      const t = tiles.find(x => x.key === st.tile) || tiles[0];
      const c = t.counters.find(x => x.key === st.counter) || t.counters.find(x => x.alerts > 0) || t.counters.find(x => x.n > 0) || t.counters[0]; st.counter = c.key;
      main.innerHTML = `<h2>${esc(t.title)} · ${esc(c.label)} · ${c.alerts} need${c.alerts === 1 ? 's' : ''} a look · ${c.n - c.alerts} activity</h2>` + (c.rows.length ? c.rows.map(r => cardFor(r, now, opts)).join('') : c.gap ? `<div class="ac-gap"><b>0 — not measured, not assumed.</b> ${esc(c.gap)}.</div>` : '<div class="ac-empty">Nothing in the window. Widen it to 7d, or come back later.</div>');
      main.scrollTop = 0; rail.querySelectorAll('.ac-rc').forEach(b => b.classList.toggle('active', b.dataset.tile === st.tile && b.dataset.counter === st.counter));
    }
    const close = (markSeen) => { doc.body.style.overflow = prevOverflow; el.remove(); doc.removeEventListener('keydown', onKey); if (markSeen) marker.set(now); if (opts.onClose) opts.onClose(now, markSeen); };
    const onKey = (e) => { if (e.key === 'Escape') close(true); };
    doc.addEventListener('keydown', onKey);
    el.querySelector('#ac-full-close').addEventListener('click', () => close(true));
    el.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => { if (opts.onWindow) { close(false); opts.onWindow(Number(b.dataset.win), { openTile: st.tile, openCounter: st.counter }); } }));
    drawRail(); drawMain();
    return { el, state: st, close };
  }

  // the grid on the page: tiles only; a tile opens the full window
  // opts: { onWindow(ms), onClose(), onOpen(tileKey) }
  function render(container, result, opts) {
    opts = opts || {}; const doc = container.ownerDocument; injectCss(doc);
    const now = result.meta.now, tiles = result.tiles;
    const alertsN = tiles.reduce((s2, t) => s2 + (t.alerts || 0), 0), activityN = tiles.reduce((s2, t) => s2 + (t.total || 0), 0) - alertsN, busy = tiles.filter(t => t.alerts > 0).length;
    const winMs = result.meta.windowMs, newN = tiles.reduce((s2, t) => s2 + (t.newCount || 0), 0);
    const sinceTxt = (winMs >= RULES.WINDOW_LONG_MS ? 'last 30 days' : 'last 7 days') + (result.meta.since ? ` · ${newN} new since you last looked (${ago(result.meta.since, now)})` : '');
    container.innerHTML = `
      <div class="ac-head">
        <div>${alertsN ? `<span class="ac-busy"><i class="fas fa-triangle-exclamation mr-1"></i>${alertsN} thing${alertsN === 1 ? '' : 's'} need${alertsN === 1 ? 's' : ''} a look</span>` : `<span class="ac-quiet"><i class="fas fa-circle-check mr-1"></i>Nothing needs your attention across Terra right now</span>`}<span class="text-[11px] text-gray-500 ml-2">· ${activityN} activity item${activityN === 1 ? '' : 's'} (grey — for the record, not for action)</span>
          <span class="text-[10px] text-gray-500 ml-2">${esc(sinceTxt)} · amber = needs a look · grey = activity · red = about your wallet · click a tile for the full view</span></div>
        <div class="ac-win"><button class="ac-tab ${winMs < RULES.WINDOW_LONG_MS ? 'active' : ''}" data-win="${RULES.WINDOW_DEFAULT_MS}">7d</button><button class="ac-tab ${winMs >= RULES.WINDOW_LONG_MS ? 'active' : ''}" data-win="${RULES.WINDOW_LONG_MS}">30d</button></div>
      </div>
      <div class="ac-grid">${tiles.map(t => `<div class="ac-tile" data-tile="${t.key}" data-state="${t.state}" role="button" tabindex="0" aria-label="${esc(t.title)}: ${t.total} in window — open the full view">
          <div class="ac-title"><span class="ac-dot"></span>${esc(t.title)}</div>
          <div class="ac-counters">${t.counters.map(c => `<span data-counter="${c.key}" title="${esc(c.gap || (c.alerts ? c.alerts + ' need a look' : c.n ? 'activity only' : ''))}">${esc(c.label)} = <b class="${c.alerts ? 'ac-n-alert' : 'ac-n-info'}">${c.alerts ? c.alerts : c.n}</b>${c.alerts && c.n > c.alerts ? `<i class="ac-n-more">+${c.n - c.alerts}</i>` : ''}</span>`).join('')}</div>
        </div>`).join('')}</div>`;
    container.querySelectorAll('.ac-tile').forEach(el => { const open = () => { if (opts.onOpen) opts.onOpen(el.dataset.tile); else openFull(result, Object.assign({}, opts, { openTile: el.dataset.tile, document: doc })); }; el.addEventListener('click', open); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }); });
    container.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => { if (opts.onWindow) opts.onWindow(Number(b.dataset.win)); }));
    return {};
  }

  // 1.4.0 — one Live Activity item → the same card the full window shows (index reuses it under each feed row)
  function itemCard(x, opts) {
    const r = row({ ts: x.ts, label: `#${x.token != null ? x.token : '?'} ${x.label}`, value: x.sub || '', link: x.tx ? `https://chainsco.pe/terra2/tx/${x.tx}` : null, linkLabel: x.tx ? 'tx' : null, rule: 'live-activity:' + x.kind, source: x.tx ? 'ledger / transfers' : 'flows', raw: { token: x.token, tx: x.tx }, mine: !!(opts && opts.myTokens && x.token != null && opts.myTokens.has(String(x.token))), data: { item: x } });
    return nftCard(r, (opts && opts.now) || Date.now(), opts || {});
  }
  // 1.5.0 — the same facts as itemCard, laid flat for the right-hand side of a feed row (desktop). Pieces are the card's own
  // helpers (partyBlock / usdAt / tokenInfo), so nothing is computed twice or differently.
  function itemInline(x, opts) {
    opts = opts || {}; const tok = x.token; const info = opts.tokenInfo && tok != null ? opts.tokenInfo(tok) : null;
    const amt = num(x.amt), sym = x.sym; let price = '';
    if (amt != null && sym) { const then = x.usd != null ? x.usd : (opts.usdAt ? opts.usdAt(sym, amt, x.ts) : null), nowUsd = opts.usdNow ? opts.usdNow(sym, amt) : null; const spread = then && nowUsd ? (nowUsd - then) / then * 100 : null;
      price = `${then != null ? fmtUsd(then) + ' then' : ''}${nowUsd != null ? ` · ${fmtUsd(nowUsd)} now` : ''}${spread != null ? ` <span class="${spread < 0 ? 'ac-neg' : 'ac-pos'}">${spread >= 0 ? '+' : ''}${spread.toFixed(1)}%</span>` : ''}`; }
    const status = info ? `<span class="ac-pill ${info.broken ? 'red' : 'green'}">${info.broken ? 'broken' : 'unbroken'}</span>${info.listed ? `<span class="ac-pill cyan">listed · ${esc(info.venue || '')}</span>` : info.staked ? `<span class="ac-pill gray">staked · ${esc(info.where || '')}</span>` : info.where === 'wallet' ? '<span class="ac-pill gray">liquid</span>' : ''}` : '';
    const k = x.kind;
    const own = info && info.owner;   // the inventory's real_owner: for a listing that IS the lister, for a delist the wallet that took it back
    const pairs = k === 'sale' ? [['Seller', x.seller || x.from], ['Buyer', x.buyer || x.to]] : k === 'listing' ? [['Lister', x.seller || x.from || own]] : k === 'delisting' ? [['Delisted by', x.seller || x.from || x.to || own]] : k === 'bid' ? [['Bidder', x.bidder || x.from], ['Owner', info && info.owner]] : k === 'staked' ? [['Staker', x.from]] : k === 'unstaked' ? [['Unstaker', x.to || x.from]] : k === 'claimed' ? [['Claimed by', x.to]] : k === 'transferred' ? [['From', x.from], ['To', x.to]] : [['Owner', info && info.owner]];
    const parties = pairs.filter(p => p[1]).map(([role, a]) => { const name = opts.nameOf ? opts.nameOf(a) : null, h = opts.holdingsOf ? opts.holdingsOf(a) : null; const hold = h ? (h.total ? `${h.total} NFT${h.total === 1 ? '' : 's'} · L${h.listed} · Q${h.liquid} · S${h.staked} · B${h.broken}` : 'no aDAO NFTs') : '';
      return `<span class="ac-il-party"><span class="ac-role">${esc(role)}</span><a href="https://chainsco.pe/terra2/address/${esc(a)}" target="_blank" rel="noopener" title="${esc(a)}${hold ? ' — ' + esc(hold.replace(/L(\d+) · Q(\d+) · S(\d+) · B(\d+)/, 'listed $1 · liquid $2 · staked $3 · broken $4')) : ''}">${name ? esc(name) : esc(a.slice(0, 10) + '…' + a.slice(-4))}</a>${hold ? `<span class="ac-il-hold">${esc(hold)}</span>` : ''}</span>`; }).join('');
    return `<div class="ac-inline">${price ? `<div class="ac-il-price">${price}</div>` : ''}${status ? `<div class="ac-il-status">${status}</div>` : ''}${parties ? `<div class="ac-il-parties">${parties}</div>` : ''}</div>`;
  }
  root.AlertCenter = { VERSION, RULES, build, render, openFull, itemCard, itemInline, marker, _ago: ago };
})(typeof window !== 'undefined' ? window : globalThis);
