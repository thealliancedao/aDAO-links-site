/* lib/live-activity.js — 1.0.0 (2026-09-20, owner: "rethink Live Activity")
 * THE feed renderer for activity EPISODES (nft-collections/<slug>/ledger/activity.json, written by org-nft-flows 1.6.0 from
 * lib/activity.js — one act = one row: price changes, bulk stakes/unstakes with their ids, lock restructures folded).
 * This file decides only what the page shows and how loud: three tiers (featured · normal · quiet), the class-aware deal filter,
 * the plain-words label of every kind, the "since you last looked" marker, and the legacy item shape the Alert Center reads.
 * Every threshold comes from tla-core/docs/curated/alert-thresholds.json `live_activity` (the owner's one knob); the defaults
 * below are the same numbers so a missing config never hides a row for a different reason. Read by index.html; the tenant home
 * and the app read the same file. Pure: no fetch here except load(), no DOM writes — the page places the HTML.
 *
 *   LiveActivity.load(fetchJson, feeds)                  → [{ feed, doc }]
 *   LiveActivity.classify(ep, feed, ctx)                 → { tier, hidden, why }   ctx = { ownTenant, config, tenantOf }
 *   LiveActivity.label(ep, feed, ctx)                    → { title, sub, badges, ids, amountTxt }
 *   LiveActivity.rowHtml(ep, feed, ctx, i)               → HTML string (row + hidden details slot)
 *   LiveActivity.detailsHtml(ep, feed, ctx)              → HTML string (the expand)
 *   LiveActivity.legacyItems(episodes, feed)             → the {col:'adao', kind, token, ts…} rows AlertCenter.build reads
 *   LiveActivity.marker.get() / .set(ts)                 → the "since you last looked" stamp (localStorage)
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const DEFAULTS = {   // mirrored in alert-thresholds.json `live_activity`; the file wins when present
    deal_filter: { own_tenant_over_floor_pct: 25, other_over_floor_pct: 10 },
    lock_new_big_vp: 100000, lock_unlock_big_vp: 100000, lock_add_big_vp: 100000, mass_count: 10, big_sale_usd: 500, fold_ids_shown: 5,
  };
  const KIND_GROUPS = [   // toggle chips, in this order; each maps to episode kinds
    ['sale', 'Sales', ['sale']], ['listing', 'Listings', ['listing']], ['price_change', 'Price changes', ['price_change']], ['delisting', 'Delistings', ['delisting']],
    ['bid', 'Bids', ['bid']], ['stake', 'Stakes', ['stake', 'stake_enterprise']], ['unstake', 'Unstakes', ['unstake', 'unstake_enterprise', 'claim']],
    ['break', 'Breaks', ['break', 'backing_add']], ['transfer', 'Transfers', ['transfer', 'lock_transfer', 'mint']],
    ['locks', 'Locks', ['lock_new', 'lock_unlock', 'lock_add']], ['housekeeping', 'Lock housekeeping', ['lock_restructure']],
  ];
  const groupOf = (kind) => { for (const g of KIND_GROUPS) if (g[2].includes(kind)) return g[0]; return null; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d == null ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4) : d });
  const usd = (v) => (v == null || !isFinite(v)) ? null : (Math.abs(v) >= 1000 ? '$' + N(v, 0) : Math.abs(v) >= 1 ? '$' + N(v, 2) : '$' + N(v, 3));
  const pct = (v) => (v == null || !isFinite(v)) ? '' : (v > 0 ? '+' : '') + N(v, 1) + '%';
  const short = (a) => a ? (a.length > 16 ? a.slice(0, 9) + '…' + a.slice(-4) : a) : '';
  const ago = (ts, now) => { const h = ((now || Date.now()) - Date.parse(ts)) / 3.6e6; return h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
  const TIER_LABEL = { base: 'base', broken: 'broken', phoenix: 'Phoenix', rank1: 'Rank 1' };
  const VENUE = { bbl: 'BBL', atrium: 'Atrium', boost: 'Boost', 'trades-2023': 'P2P trade', 'offers-2023': 'Offers' };
  const CUST = { daodao_voting: 'DAODAO', enterprise_staking: 'Enterprise', legacy_staking: 'staking v1' };

  async function load(fetchJson, feeds) {
    return Promise.all(feeds.map(async (feed) => { let doc = null; try { doc = await fetchJson(feed.url); } catch (e) { doc = null; } return { feed, doc }; }));
  }
  const cfgOf = (ctx) => { const c = (ctx && ctx.config && ctx.config.live_activity) || {}; return Object.assign({}, DEFAULTS, c, { deal_filter: Object.assign({}, DEFAULTS.deal_filter, c.deal_filter || {}) }); };

  // ---- tiers. Facts on the episode + the owner's thresholds → featured / normal / quiet, and hidden (deal filter) or not.
  function classify(ep, feed, ctx) {
    const cfg = cfgOf(ctx); const f = new Set(ep.flags || []); const own = ctx && ctx.ownTenant && feed && feed.tenant === ctx.ownTenant;
    const over = own ? cfg.deal_filter.own_tenant_over_floor_pct : cfg.deal_filter.other_over_floor_pct;
    let tier = 'normal', why = '', hidden = false;
    const k = ep.kind;
    if (k === 'lock_restructure') { tier = 'quiet'; why = 'lock housekeeping (merge / split / migrate / auto-max)'; }
    else if (k === 'lock_add') { if ((ep.vp || 0) >= cfg.lock_add_big_vp) { tier = 'featured'; why = `added to a lock now at ${N(ep.vp, 0)} VP`; } else { tier = 'quiet'; why = 'small addition to a lock'; } }
    else if (k === 'lock_new') { if (f.has('new_voter')) { tier = 'featured'; why = 'a wallet new to TLA voting'; } else if ((ep.vp || 0) >= cfg.lock_new_big_vp) { tier = 'featured'; why = `new lock of ${N(ep.vp, 0)} VP`; } }
    else if (k === 'lock_unlock') { if ((ep.vp || 0) >= cfg.lock_unlock_big_vp) { tier = 'featured'; why = 'a big unlock'; } }
    else if (f.has('listed_lock') || f.has('lock_sold')) { tier = 'featured'; why = k === 'sale' ? 'a lock changed hands' : 'a lock is for sale — check the price against its backing'; }
    else if (k === 'unstake_enterprise' || (k === 'unstake' && f.has('enterprise'))) { tier = 'featured'; why = 'an Enterprise unstake — the one we want to see'; }
    else if (k === 'stake' && f.has('daodao')) { tier = 'featured'; why = 'staked into the DAO'; }
    else if (k === 'stake_enterprise') { tier = 'quiet'; why = 'legacy Enterprise stake'; }
    else if (k === 'break') { tier = 'featured'; why = 'backing claimed — a break is a positive event'; }
    else if (k === 'mint') { tier = 'featured'; why = 'a new token'; }
    else if (k === 'sale') { if ((ep.usd || 0) >= cfg.big_sale_usd) { tier = 'featured'; why = `a ${usd(ep.usd)} sale`; } }
    else if (k === 'listing' || k === 'price_change') {
      if (f.has('under_floor')) { tier = 'featured'; why = `listed ${pct(ep.vs_floor_pct)} vs the ${TIER_LABEL[ep.tier] || ep.tier || ''} floor`; }
      else if (ep.vs_floor_pct != null && ep.vs_floor_pct > over) { tier = 'quiet'; hidden = true; why = `${pct(ep.vs_floor_pct)} over the ${TIER_LABEL[ep.tier] || ep.tier} floor (deal filter: > ${over}% on ${own ? 'this' : 'other'} collections is hidden)`; }
      else if (ep.vs_floor_pct == null && ep.tier && ep.floor_then == null && (ep.kind === 'listing')) { why = 'no floor for this class — always shown'; }
    }
    if (ep.count >= cfg.mass_count && tier !== 'featured' && k !== 'lock_restructure' && k !== 'lock_add' && k !== 'lock_new' && k !== 'backing_add') { tier = 'featured'; why = `${ep.count} at once`; hidden = false; }   // mass = many tokens moved by one wallet; housekeeping never qualifies
    if (ctx && ctx.showAll) hidden = false;
    return { tier, hidden, why };
  }

  // ---- words. One sentence a member would say, never a raw kind string.
  function label(ep, feed, ctx) {
    const cfg = cfgOf(ctx); const isLock = feed && feed.kind === 'escrow'; const noun = feed ? (ep.count === 1 ? (isLock ? 'lock' : feed.noun) : (isLock ? 'locks' : feed.nouns)) : 'NFTs';
    const idTxt = ep.count === 1 ? (ep.token ? `#${ep.token}` : `a ${noun}`) : `${ep.count} ${noun}`;   // a row whose id the chain did not name says "a lock" / "an NFT", never #null
    const amountTxt = ep.count === 1 ? (ep.amount != null && ep.denom_symbol ? `${N(ep.amount)} ${ep.denom_symbol}` : (ep.amount != null ? N(ep.amount) : '')) : (ep.denom_symbol && ep.denom_symbol !== 'mixed' ? `${N(ep.tokens.reduce((s, t) => s + (t.amount || 0), 0))} ${ep.denom_symbol} total` : '');
    const venue = ep.venue ? (VENUE[ep.venue] || ep.venue) : ''; const cust = ep.custodian ? (CUST[ep.custodian] || ep.custodian) : '';
    const badges = []; const sub = []; const nameOf = (ctx && ctx.nameOf) || (() => null); const who = (a) => a ? (nameOf(a) || short(a)) : '';
    let title = '';
    switch (ep.kind) {
      case 'sale': title = ep.count === 1 ? `Sold ${idTxt}${amountTxt ? ' for ' + amountTxt : ''}` : `Sold ${idTxt}${amountTxt ? ' for ' + amountTxt : ''}`; if (venue) sub.push(venue); if (ep.days_on_market != null) sub.push(`${N(ep.days_on_market, ep.days_on_market < 1 ? 1 : 0)}d on market`); else if (ep.count === 1) sub.push('listed before the window'); if (ep.wallet || ep.counterparty) sub.push(`${who(ep.wallet)} → ${who(ep.counterparty)}`); break;
      case 'listing': title = `Listed ${idTxt}${amountTxt ? ' at ' + amountTxt : ''}`; if (venue) sub.push(venue); if (ep.tier && ep.count === 1) sub.push(TIER_LABEL[ep.tier] || ep.tier); if (ep.vs_floor_pct != null) badges.push({ cls: ep.vs_floor_pct < 0 ? 'under' : 'over', text: `${pct(ep.vs_floor_pct)} vs ${TIER_LABEL[ep.tier] || 'class'} floor${ep.floor_then != null ? ' (' + usd(ep.floor_then) + ')' : ''}` }); else if (ep.count === 1 && ep.tier && ep.floor_then == null && !(feed && feed.kind === 'escrow')) badges.push({ cls: 'nofloor', text: `no ${TIER_LABEL[ep.tier] || ''} floor to compare` }); if (ep.wallet) sub.push(`by ${who(ep.wallet)}`); break;
      case 'price_change': { const d = ep.detail || {}; const from = d.from_amount != null ? N(d.from_amount) : '?'; title = `Price changed ${idTxt} ${from} → ${N(d.to_amount)} ${ep.denom_symbol || ''}${d.pct != null ? ' (' + pct(d.pct) + ')' : ''}`; if (venue) sub.push(venue); if (!d.prev_known) sub.push('earlier price outside the window'); if (ep.vs_floor_pct != null) badges.push({ cls: ep.vs_floor_pct < 0 ? 'under' : 'over', text: `${pct(ep.vs_floor_pct)} vs ${TIER_LABEL[ep.tier] || 'class'} floor` }); if (ep.wallet) sub.push(`by ${who(ep.wallet)}`); break; }
      case 'delisting': title = `Delisted ${idTxt}`; if (venue) sub.push(venue); if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'bid': title = `Bid ${amountTxt ? amountTxt + ' on ' : 'on '}${idTxt}`; if (venue) sub.push(venue); if (ep.wallet) sub.push(`by ${who(ep.wallet)}`); break;
      case 'mint': title = `Minted ${idTxt}`; if (ep.wallet) sub.push(`to ${who(ep.wallet)}`); break;
      case 'transfer': title = `Transferred ${idTxt}`; sub.push(`${who(ep.wallet)} → ${who(ep.counterparty)}`); break;
      case 'stake': title = `Staked ${idTxt}${cust ? ' in ' + cust : ''}`; if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'unstake': title = `Unstaked ${ep.detail && ep.detail.ids_pending && ep.count === 1 && !ep.token ? 'from ' + (cust || 'custody') : idTxt + (cust ? ' from ' + cust : '')}`; if (ep.detail && ep.detail.ids_pending) sub.push('ids resolve at claim'); if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'claim': title = `Claimed ${idTxt}`; sub.push('unstake window over'); if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'stake_enterprise': title = `Staked ${idTxt} in Enterprise`; if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'unstake_enterprise': title = `Unstaked ${idTxt} from Enterprise`; if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'break': title = `Broke ${idTxt} · backing claimed`; if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'backing_add': title = `Backing added${ep.count > 1 ? ` (${ep.count} deposits)` : ''}`; sub.push('DAO action'); break;
      case 'lock_new': title = `New ${ep.count === 1 ? 'lock ' + idTxt : idTxt}${ep.vp != null ? ' · ' + N(ep.vp, 0) + ' VP' + (ep.count > 1 ? ' total' : '') : ''}${amountTxt ? ' · ' + amountTxt : ''}`; if ((ep.flags || []).includes('new_voter')) badges.push({ cls: 'new', text: 'new to TLA voting' }); if (ep.wallet) sub.push(who(ep.wallet)); if (ep.lock_end) sub.push(ep.lock_end === 'permanent' ? 'auto-max' : `ends epoch ${ep.lock_end}`); break;
      case 'lock_add': title = `Added to ${idTxt}${amountTxt ? ' · ' + amountTxt : ''}${ep.vp != null ? ' · ' + (ep.count > 1 ? 'locks now ' : 'now ') + N(ep.vp, 0) + ' VP' + (ep.count > 1 ? ' total' : '') : ''}`; if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'lock_unlock': title = `Unlocked ${idTxt}${amountTxt ? ' · ' + amountTxt + ' withdrawn' : ''}`; if (ep.wallet) sub.push(who(ep.wallet)); break;
      case 'lock_transfer': title = `Lock transferred ${idTxt}`; sub.push(`${who(ep.wallet)} → ${who(ep.counterparty)}`); break;
      case 'lock_restructure': { const v = (ep.detail && ep.detail.verbs) || []; const words = v.map(x => ({ lock_merge: 'merge', lock_split: 'split', lock_migrate: 'migrate', lock_permanent: 'auto-max on', lock_unpermanent: 'auto-max off' }[x] || x)); const ids = (ep.detail && ep.detail.lineage && ep.detail.lineage.ids) || []; title = `Restructured ${ids.length ? ids.length + ' locks' : 'locks'} · ${Array.from(new Set(words)).join(', ')}`; sub.push(`${ep.tx_count || ep.txs.length} tx${(ep.tx_count || ep.txs.length) === 1 ? '' : 's'}`); if (ep.wallet) sub.push(who(ep.wallet)); break; }
      default: title = `${ep.kind} ${idTxt}`;
    }
    if (feed && feed.kind === 'escrow' && (ep.kind === 'listing' || ep.kind === 'sale' || ep.kind === 'price_change') && ep.backing) { const b = ep.backing; badges.push({ cls: ep.price_vs_backing != null ? (ep.price_vs_backing < 1 ? 'under' : 'over') : 'nofloor', text: `backing ${N(b.amount)} ${b.symbol || ''}${b.usd != null ? ' (' + usd(b.usd) + ')' : ''}${ep.price_vs_backing != null ? ' · ' + N(ep.price_vs_backing, 2) + '× backing' : ''}` }); }
    const ids = ep.kind === 'lock_restructure' ? (((ep.detail || {}).lineage || {}).ids || []) : (ep.count > 1 ? Array.from(new Set((ep.token_ids || ep.tokens.map(t => t.id)).filter(Boolean))) : []);   // distinct ids; a restructure names the locks its lineage touched
    return { title, sub: sub.filter(Boolean).join(' · '), badges, ids, amountTxt, shown: cfg.fold_ids_shown };
  }

  // ---- HTML. The page supplies imageOf(feed, id) and the tx link; the row carries data-la-i for the expand.
  function rowHtml(ep, feed, ctx, i) {
    const c = classify(ep, feed, ctx); const L = label(ep, feed, ctx); const now = (ctx && ctx.now) || Date.now();
    const img = ctx && ctx.imageOf && ep.count === 1 && ep.token && feed.kind !== 'escrow' ? ctx.imageOf(feed, ep.token) : null;
    const isNew = ctx && ctx.since && Date.parse(ep.ts) > ctx.since;
    const tx = ep.txs && ep.txs[0]; const txN = ep.tx_count || (ep.txs || []).length;
    const badgeHtml = L.badges.map(b => `<span class="la-badge la-${b.cls}">${esc(b.text)}</span>`).join('');
    const idsHtml = L.ids.length ? `<span class="la-ids">${L.ids.slice(0, L.shown).map(id => `<a href="${esc(ctx.tokenUrl ? ctx.tokenUrl(feed, id) : '#')}" class="la-id" onclick="event.stopPropagation()">#${esc(id)}</a>`).join(' ')}${L.ids.length > L.shown ? ` <button type="button" class="la-more" data-la-more="${i}" onclick="event.stopPropagation(); const r = this.closest('[data-la-i]'); const d = r && r.nextElementSibling; if (d) { d.classList.toggle('hidden'); }">+${L.ids.length - L.shown} more</button>` : ''}</span>` : '';
    const right = [];
    if (ep.usd != null) { const nowUsd = ctx && ctx.usdNow && ep.denom_symbol && ep.denom_symbol !== 'mixed' ? ctx.usdNow(ep.denom_symbol, ep.count === 1 ? ep.amount : ep.tokens.reduce((s, t) => s + (t.amount || 0), 0)) : null; right.push(`<span class="la-usd">${esc(usd(ep.usd))} then${nowUsd != null ? ` · <b>${esc(usd(nowUsd))}</b> now${ep.usd ? ` <span class="${nowUsd >= ep.usd ? 'text-emerald-400' : 'text-rose-400'}">${esc(pct((nowUsd / ep.usd - 1) * 100))}</span>` : ''}` : ''}</span>`); }
    const icon = feed.kind === 'escrow' ? '<span class="la-ico"><i class="fas fa-lock"></i></span>' : (img ? `<img src="${esc(img)}" alt="#${esc(ep.token)}" class="la-img" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="la-ico"><i class="fas fa-layer-group"></i></span>`);
    return `<div class="activity-row la-row la-${c.tier}${c.hidden ? ' la-hidden' : ''}${isNew ? ' la-new' : ''}" data-la-i="${i}" title="${esc(c.why || 'click for details')}">
      ${icon}
      <div class="min-w-0 flex-1">
        <div class="text-sm text-white la-title">${isNew ? '<span class="la-dot" title="since you last looked"></span>' : ''}<span class="la-feed">${esc(feed.short)}</span> ${esc(L.title)} ${badgeHtml}</div>
        <div class="text-[11px] text-gray-500 la-sub">${esc(ago(ep.ts, now))}${ep.ts_end && ep.ts_end !== ep.ts ? ` (over ${N((Date.parse(ep.ts_end) - Date.parse(ep.ts)) / 60000, 0)} min)` : ''}${L.sub ? ' · ' + esc(L.sub) : ''}${tx ? ` · <a href="https://chainsco.pe/terra2/tx/${esc(tx)}" target="_blank" rel="noopener" class="text-cyan-500/80 hover:text-cyan-300" onclick="event.stopPropagation()">tx ↗</a>${txN > 1 ? ` <span class="text-gray-600">+${txN - 1}</span>` : ''}` : ''} ${idsHtml}</div>
      </div>
      <div class="la-right">${right.join('')}</div>
    </div><div class="activity-details la-details hidden" data-la-d="${i}"></div>`;
  }
  function detailsHtml(ep, feed, ctx) {
    const L = label(ep, feed, ctx); const c = classify(ep, feed, ctx); const rows = [];
    const who = (a) => a ? `<a href="${esc(ctx.walletUrl ? ctx.walletUrl(feed, a) : '#')}" class="text-cyan-300 hover:underline">${esc((ctx.nameOf && ctx.nameOf(a)) || short(a))}</a><span class="text-gray-600 text-[10px] ml-1">${esc(a)}</span>` : '';
    if (ep.wallet) rows.push(['Who', who(ep.wallet) + (ep.counterparty ? ' → ' + who(ep.counterparty) : '')]);
    if (ctx.holdingsOf && feed.holdings) { for (const a of [ep.wallet, ep.counterparty].filter(Boolean)) { const h = ctx.holdingsOf(a); if (h) rows.push([`Holdings · ${(ctx.nameOf && ctx.nameOf(a)) || short(a)}`, esc(h)]); } }
    if (ep.count > 1) rows.push([`${ep.count} tokens`, L.ids.map(id => `<a href="${esc(ctx.tokenUrl ? ctx.tokenUrl(feed, id) : '#')}" class="la-id">#${esc(id)}</a>`).join(' ')]);
    if (ep.count > 1 && ep.tokens.some(t => t.amount != null)) rows.push(['Prices', ep.tokens.filter(t => t.amount != null).map(t => `#${esc(t.id)} ${N(t.amount)} ${esc(t.denom_symbol || '')}${t.vs_floor_pct != null ? ` <span class="${t.vs_floor_pct < 0 ? 'text-emerald-400' : 'text-gray-500'}">${esc(pct(t.vs_floor_pct))}</span>` : ''}`).join(' · ')]);
    if (ep.kind === 'sale' && ep.list_usd != null && ep.usd != null) rows.push(['Listed at → sold at', `${usd(ep.list_usd)} → ${usd(ep.usd)} (${pct((ep.usd / ep.list_usd - 1) * 100)})`]);
    if (ep.floor_then != null) rows.push([`${TIER_LABEL[ep.tier] || 'Class'} floor that day`, usd(ep.floor_then)]);
    if (ep.backing) rows.push(['Backing', `${N(ep.backing.amount)} ${esc(ep.backing.symbol || '')}${ep.backing.usd != null ? ' · ' + usd(ep.backing.usd) + ' today' : ''}${ep.backing.as_of ? ' · as of ' + esc(String(ep.backing.as_of).slice(0, 10)) : ''}`]);
    if (ep.vp != null) rows.push(['Voting power', `${N(ep.vp, 0)} VP${ep.fixed_vp != null ? ' (fixed ' + N(ep.fixed_vp, 0) + ')' : ''}${ep.lock_end ? ' · ' + (ep.lock_end === 'permanent' ? 'auto-max' : 'ends epoch ' + esc(ep.lock_end)) : ''}`]);
    if (ep.detail && ep.detail.lineage) rows.push(['Locks involved', ep.detail.lineage.ids.map(id => '#' + esc(id)).join(', ') + (ep.detail.lineage.burned.length ? ` · burned ${ep.detail.lineage.burned.map(id => '#' + esc(id)).join(', ')}` : '')]);
    if (ep.detail && ep.detail.migrate) rows.push(['Migrated', esc(JSON.stringify(ep.detail.migrate)).slice(0, 200)]);
    if (c.why) rows.push(['Why this row is ' + c.tier + (c.hidden ? ' (hidden by the deal filter)' : ''), esc(c.why)]);
    const txs = (ep.txs || []).map(t => `<a href="https://chainsco.pe/terra2/tx/${esc(t)}" target="_blank" rel="noopener" class="text-cyan-500/80 hover:text-cyan-300">${esc(t.slice(0, 10))}…</a>`).join(' ');
    rows.push([`Transactions${ep.tx_count > (ep.txs || []).length ? ` (first ${ep.txs.length} of ${ep.tx_count})` : ''}`, txs]);
    if (ep.count === 1 && ep.token && ctx.tokenUrl) rows.push(['Journey', `<a href="${esc(ctx.tokenUrl(feed, ep.token))}" class="text-cyan-300 hover:underline">open #${esc(ep.token)} in the explorer ↗</a>`]);
    return `<div class="la-card">${rows.map(([k, v]) => `<div class="la-kv"><span class="la-k">${k}</span><span class="la-v">${v}</span></div>`).join('')}</div>`;
  }

  // ---- the shape the Alert Center's NFT rules read (col:'adao' rows, one per token) — kept so its rules can return later
  function legacyItems(episodes, feed) {
    const col = feed.legacyCol; if (!col) return [];
    const K = { sale: 'sale', listing: 'listing', price_change: 'listing', delisting: 'delisting', bid: 'bid', stake: 'staked', unstake: 'unstaked', stake_enterprise: 'staked', unstake_enterprise: 'unstaked', claim: 'claimed', break: 'break', transfer: 'transferred', mint: 'transferred' };
    const out = [];
    for (const ep of episodes) { const k = K[ep.kind]; if (!k) continue; for (const t of ep.tokens) out.push({ ts: Date.parse(ep.ts), col, kind: k, token: t.id, tx: ep.txs[0] || null, amt: t.amount == null ? null : t.amount, sym: t.denom_symbol || null, usd: t.usd == null ? null : t.usd, seller: ep.kind === 'sale' || ep.kind === 'listing' || ep.kind === 'price_change' || ep.kind === 'delisting' ? ep.wallet : null, buyer: ep.kind === 'sale' ? ep.counterparty : null, bidder: ep.kind === 'bid' ? ep.wallet : null, from: ep.wallet, to: ep.counterparty, label: label(ep, feed, {}).title, sub: ep.venue ? (VENUE[ep.venue] || ep.venue) : (ep.custodian ? (CUST[ep.custodian] || ep.custodian) : ''), noId: !!(ep.detail && ep.detail.ids_pending) }); }
    return out;
  }
  const marker = { KEY: 'la:seen', get() { try { const v = localStorage.getItem(marker.KEY); return v ? Number(v) : null; } catch (e) { return null; } }, set(ts) { try { localStorage.setItem(marker.KEY, String(ts || Date.now())); } catch (e) { } } };
  const CSS = `.la-row{display:flex;align-items:center;gap:.75rem;padding:.55rem .9rem;border-left:3px solid transparent}
  .la-row.la-featured{border-left-color:#f59e0b;background:rgba(245,158,11,.06)} .la-row.la-quiet{opacity:.55} .la-row.la-quiet .la-title{color:#9ca3af}
  .la-row.la-hidden{display:none} .la-showall .la-row.la-hidden{display:flex}
  .la-img{width:2.5rem;height:2.5rem;border-radius:.5rem;object-fit:cover;flex-shrink:0} .la-ico{width:2.5rem;height:2.5rem;border-radius:.5rem;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.05);color:#9ca3af;flex-shrink:0}
  .la-feed{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-right:.25rem} .la-title{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem}
  .la-badge{font-size:10px;padding:1px 7px;border-radius:9999px;font-weight:600;white-space:nowrap} .la-under{background:rgba(16,185,129,.18);color:#34d399} .la-over{background:rgba(107,114,128,.18);color:#9ca3af} .la-nofloor{background:rgba(255,255,255,.06);color:#9ca3af} .la-new{background:rgba(168,85,247,.2);color:#c4b5fd}
  .la-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#a855f7;margin-right:4px} .la-ids{margin-left:.35rem} .la-id{color:#67e8f9;margin-right:.15rem} .la-id:hover{text-decoration:underline} .la-more{color:#9ca3af;font-size:10px;text-decoration:underline}
  .la-right{text-align:right;font-size:11px;color:#9ca3af;white-space:nowrap} .la-usd b{color:#e5e7eb}
  .la-card{padding:8px 12px 10px 3.6rem;font-size:12px;color:#d1d5db;display:grid;gap:4px} .la-kv{display:grid;grid-template-columns:150px 1fr;gap:8px} .la-k{color:#6b7280} .la-v{min-width:0;word-break:break-word}
  @media (max-width:640px){.la-right{display:none} .la-kv{grid-template-columns:1fr}}`;
  const api = { VERSION, DEFAULTS, KIND_GROUPS, groupOf, load, classify, label, rowHtml, detailsHtml, legacyItems, marker, CSS, ago, usd, pct, N };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; root.LiveActivity = api;
})(typeof window !== 'undefined' ? window : globalThis);
