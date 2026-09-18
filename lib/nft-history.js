/* lib/nft-history.js 1.2.1 (2026-09-18) — 1.2.1: boundary rows (mint · sale · handoff) are tiles between sections, never a line inside one · 1.2.0: SEGMENTS (one per holder: how it began, what happened on their watch, how it ended, their P&L); LUNA terms only when a LUNA-family token changed hands (USDC/SOLID → n/a) · 1.1.1: operator moves (an admin wallet moving a token it never held) read as such, no ⚠; distribution-wallet labels from the manifest · 1.1.0: P&L per round trip (USD + LUNA terms) and the current holder's basis; treasury transfers are admin rows
 * 1.0.0 (2026-09-18) — ONE NFT's on-chain journey, folded from its ledger records.
 *
 * Input : the token's records from nft-collections/<slug>/ledger/by-token/<shard>.json (org-nft-flows 1.4.0 — every live
 *         ledger row of the token, sorted; superseded rows never included). Collection-agnostic: kinds come from the one
 *         classifier, labels come from the collection's own manifest (capture.custodians / launchpad / distribution
 *         wallets), names from whatever registry the page uses. No hand map, no address literal in here.
 * Output: { rows, summary } — rows are the story in plain words, newest last; summary is the headline numbers.
 *
 * RULES (owner, 2026-09-18):
 *  - Row one is the acquisition: a priced mint_purchase = "Bought at mint by X for N SYM ($ then)"; a mint straight to a
 *    wallet = "Minted to X"; a mint into treasury stock + the stock moves are grey admin rows (the token's own history,
 *    never hidden, never a hand change).
 *  - A listing EPISODE runs from list → sale | delist | the token leaving the seller's hands. A delist followed by a relist
 *    from the SAME address within 24 h is a price change inside the episode (RELIST_H = 24); longer is a new episode.
 *    Days on market = episode length (an open episode counts to now).
 *  - Hands changed = ownership moves after the first owner (sale, transfer, a later paid mint). Custody moves (stake,
 *    unstake, list, delist, claim) never change hands; the treasury → launchpad stock moves never do either.
 *  - Enterprise and DAODAO stake / unstake / claim are rows in their own right, by the custodian's registry label.
 *  - P&L per round trip (owner rules): every owner segment starts with what that owner PAID (a priced mint, a sale; a free
 *    mint = 0; arrived by transfer = basis unknown, said so) and, when that owner sells, the sale row carries the result TWO
 *    ways — USD (paid → received at each day's oracle) and LUNA terms (paid vs received as LUNA-equivalent at the day's
 *    oracle ratio, e.g. 200 bLUNA ÷ LUNA's price that day). They can point opposite ways: a dollar loss is not realised by
 *    someone still holding the LUNA. The current holder's basis (paid then / now, held N days) is in the summary.
 *  - USD then = the record's own usd (oracle-priced upstream, never recomputed here); USD now = opts.usdNow(symbol), labeled
 *    with the oracle day it came from. A record with no usd says so (usd_reason) — a blank beats a guess.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NftHistory = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RELIST_H = 24;
  const H = 3600e3, D = 86400e3;
  const T = (ts) => Date.parse(ts);
  const dayOf = (ts) => String(ts).slice(0, 10);
  const num = (x) => (x == null || !isFinite(Number(x))) ? null : Number(x);

  // amount → { display, symbol, amount, usd_then, usd_reason, usd_now, now_day }
  function amountOf(r, opts) {
    if (!r || !r.price) return null;
    const dec = r.denom_decimals != null ? r.denom_decimals : 6;
    const amount = num(r.price.amount) == null ? null : Number(r.price.amount) / Math.pow(10, dec);
    const symbol = r.denom_symbol || null;
    const usdThen = num(r.usd);
    let usdNow = null, nowDay = null;
    if (amount != null && symbol && opts && typeof opts.usdNow === 'function') { const n = opts.usdNow(symbol); if (n && num(n.usd) != null) { usdNow = amount * Number(n.usd); nowDay = n.day || null; } }
    return { amount, symbol, display: amount == null ? null : fmtAmt(amount) + (symbol ? ' ' + symbol : ''), usd_then: usdThen, usd_reason: usdThen == null ? (r.usd_reason || 'unpriced') : null, usd_now: usdNow, now_day: nowDay };
  }
  // LUNA-equivalent of an amount on its day: LUNA itself is exact; anything else is usd ÷ LUNA's oracle price that day
  const LUNA_FAMILY = ['LUNA', 'bLUNA', 'ampLUNA', 'arbLUNA', 'stLUNA', 'zLUNA'];   // LUNA and its liquid-staking forms: a sale in these is a LUNA leg; anything else (USDC, SOLID…) is not
  function lunaEq(amt, day, opts) {
    if (!amt || amt.amount == null) return null;
    if (amt.symbol === 'LUNA') return { luna: amt.amount, basis: 'LUNA' };
    const fam = (opts && opts.lunaFamily) || LUNA_FAMILY; if (!amt.symbol || !fam.includes(amt.symbol)) return { luna: null, basis: 'received in ' + (amt.symbol || 'an unknown token') + ' — no LUNA leg', na: true };
    const lp = opts && typeof opts.lunaUsdOn === 'function' ? num(opts.lunaUsdOn(day)) : null;
    if (amt.usd_then == null || !lp) return null;
    return { luna: amt.usd_then / lp, basis: amt.symbol + ' → LUNA at the oracle on ' + day + ' (LUNA ' + fmtUsd(lp) + ')' };
  }
  const pct = (a, b) => (a == null || b == null || !b) ? null : (a - b) / Math.abs(b) * 100;
  const fmtPct = (x) => x == null ? null : (x >= 0 ? '+' : '−') + Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 0 }) + '%';
  const fmtSigned = (x, f) => x == null ? null : (x >= 0 ? '+' : '−') + f(Math.abs(x));
  function fmtAmt(a) { return a >= 1000 ? a.toLocaleString(undefined, { maximumFractionDigits: 0 }) : a.toLocaleString(undefined, { maximumFractionDigits: a >= 10 ? 1 : 2 }); }
  function fmtUsd(u) { return u == null ? null : '$' + Number(u).toLocaleString(undefined, { maximumFractionDigits: u >= 100 ? 0 : 2 }); }
  function daysBetween(a, b) { return Math.max(0, Math.round((T(b) - T(a)) / D)); }

  // who: { addr, name (registry) | null, label (manifest) | null, text }
  function who(addr, opts) {
    if (!addr) return null;
    const o = opts || {};
    const label = o.labels && o.labels[addr] ? o.labels[addr] : null;
    const name = !label && typeof o.nameOf === 'function' ? (o.nameOf(addr) || null) : null;
    const short = addr.length > 16 ? addr.slice(0, 8) + '…' + addr.slice(-4) : addr;
    return { addr, name, label, text: label || name || short };
  }
  const roleOf = (r, opts) => { const c = opts && opts.custodians && opts.custodians[r.custodian || r.to]; return c && c.label ? c.label : (r.custodian === 'daodao_voting' ? 'DAODAO' : r.custodian === 'enterprise_staking' ? 'Enterprise' : (r.custodian || 'custody')); };
  const venueName = (r, opts) => (opts && opts.venues && opts.venues[r.venue] && opts.venues[r.venue].label) || ({ bbl: 'BackBone Labs', atrium: 'Atrium', boost: 'Boost' })[r.venue] || r.venue || 'a marketplace';

  function fold(records, opts) {
    const o = opts || {}; const now = o.now ? T(o.now) : Date.now();
    const recs = (records || []).filter(r => r && !r.superseded_by).slice().sort((a, b) => (a.height - b.height) || ((a.msg_index || 0) - (b.msg_index || 0)));
    const isAdmin = (addr) => !!(addr && ((o.distribution_wallets || []).includes(addr) || (o.launchpads || []).includes(addr)));
    const rows = []; const s = { hands_changed: 0, listings: 0, sales: 0, days_on_market: 0, listed_now: null, mint: null, last_sale: null, custody_now: null, owner_now: null, first_owner: null, unpriced: 0, gaps: 0, realized: [], holding: null };
    let acq = null;            // the current owner's acquisition: { ts, day, amount, luna, how, known }
    const segments = []; let seg = null;   // 1.2.0: one segment per holder — the rows that happened on their watch, how it began, how it ended
    const openSeg = (r, addr, how) => { seg = { index: segments.length, owner: who(addr, o), admin: isAdmin(addr), start: r.ts, start_day: dayOf(r.ts), end: null, end_day: null, acquired: null, ended_by: null, rows: [], listings: 0, price_changes: 0, days_on_market: 0, sales: 0, pnl: null }; segments.push(seg); return seg; };
    const closeSeg = (r, how) => { if (!seg) return; seg.end = r.ts; seg.end_day = dayOf(r.ts); seg.ended_by = how; seg.held_days = daysBetween(seg.start, r.ts); seg = null; };
    let holder = null;         // where the ledger last saw the token (owner, custodian or venue) — a move FROM somewhere else is a gap, said so, never papered over
    const seen = (r) => { if (r.to) holder = r.to; };
    const gapCheck = (r) => { if (holder && r.from && r.from !== holder && !isAdmin(r.from)) { s.gaps++; return { gap: true, gap_note: 'arrived from ' + (who(r.from, o) || {}).text + ' — that move is not in the ledger' }; } return null; };
    let ep = null;             // open listing episode { start, seller, venue, last_delist_ts, price }
    let owner = null;          // the wallet that owns the token (custody excluded)
    const push = (r, row) => { const x = Object.assign({ ts: r.ts, day: dayOf(r.ts), height: r.height, txhash: r.txhash, kind: r.kind, segment: seg ? seg.index : null }, row); rows.push(x); if (seg) seg.rows.push(x); return x; };
    const closeEpisode = (r, how, extra) => {
      if (!ep) return null; const days = daysBetween(ep.start, r.ts); s.days_on_market += days; if (seg) seg.days_on_market += days; const e = Object.assign({ days, how, listed_on: ep.venue, since: ep.start }, extra || {}); ep = null; return e;
    };
    const setOwner = (addr, r, why) => { if (!addr || isAdmin(addr)) return; if (owner && owner !== addr) s.hands_changed++; if (!s.first_owner) s.first_owner = addr;
      if (!seg || (seg.owner && seg.owner.addr !== addr) || seg.admin) {
        const prev = seg; if (seg) closeSeg(r, why === 'sale' ? 'sale' : 'transfer'); const ns = openSeg(r, addr, why);
        // the row that made this holder (mint · bought at mint · sale · transfer) is the BOUNDARY between sections — a tile, not a line
        const last = rows[rows.length - 1]; if (last && last.txhash === r.txhash && last.token_id === undefined && ['mint', 'mint_purchase', 'sale', 'transfer'].includes(last.kind)) { last.boundary = why === 'mint_purchase' ? 'mint' : why; last.to_segment = ns.index; last.from_segment = prev ? prev.index : null; if (prev) prev.rows = prev.rows.filter(x => x !== last); ns.boundary_row = last; }
      } owner = addr; };
    const adminSeg = (r, addr) => { if (!addr || !isAdmin(addr)) return; if (!seg || !seg.owner || seg.owner.addr !== addr) { if (seg) closeSeg(r, 'admin'); openSeg(r, addr, 'admin'); } };
    const acquire = (r, amt, how) => {   // a new owner's cost basis, from the record that made them the owner
      if (!r.to || isAdmin(r.to)) { acq = null; return; }
      const paid = amt && amt.amount > 0 ? amt : null; const le = paid ? lunaEq(paid, dayOf(r.ts), o) : (how === 'free mint' ? { luna: 0, basis: 'free' } : null);
      acq = { ts: r.ts, day: dayOf(r.ts), amount: paid, usd: paid ? paid.usd_then : (how === 'free mint' ? 0 : null), luna: le ? le.luna : null, luna_basis: le ? le.basis : null, luna_na: !!(le && le.na), how, known: how !== 'transfer' };
      if (seg && seg.owner && seg.owner.addr === r.to) seg.acquired = acq;
    };
    const realize = (r, amt) => {   // this owner sold: paid → received, two ways
      const got = amt && amt.amount > 0 ? amt : null; const le = got ? lunaEq(got, dayOf(r.ts), o) : null;
      const p = { sold: r.ts, held_days: acq ? daysBetween(acq.ts, r.ts) : null, paid: acq ? acq.amount : null, paid_usd: acq ? acq.usd : null, paid_luna: acq ? acq.luna : null, paid_how: acq ? acq.how : 'unknown', basis_known: !!(acq && acq.known), received: got, received_usd: got ? got.usd_then : null, received_luna: le ? le.luna : null, received_luna_basis: le ? le.basis : null, usd_delta: null, usd_pct: null, luna_delta: null, luna_pct: null };
      if (p.basis_known && p.paid_usd != null && p.received_usd != null) { p.usd_delta = p.received_usd - p.paid_usd; p.usd_pct = pct(p.received_usd, p.paid_usd); }
      if (p.basis_known && p.paid_luna != null && p.received_luna != null) { p.luna_delta = p.received_luna - p.paid_luna; p.luna_pct = pct(p.received_luna, p.paid_luna); }
      if (acq && acq.luna_na) { p.paid_luna_na = true; }
      p.received_luna_na = !!(le && le.na); if (p.received_luna_na) p.luna_delta = p.luna_pct = null;
      p.text = pnlText(p); s.realized.push(p); if (seg) { seg.pnl = p; seg.sales++; } return p;
    };
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]; const amt = amountOf(r, o); if (r.price && amt && amt.usd_then == null) s.unpriced++;
      switch (r.kind) {
        case 'mint': {
          const to = who(r.to, o); const admin = isAdmin(r.to);
          if (admin) { adminSeg(r, r.to); push(r, { tone: 'admin', headline: 'Minted into ' + ((to && to.label) || 'the treasury stock'), party: to }); seen(r); }
          else { push(r, { tone: 'origin', headline: 'Minted to ' + (to ? to.text : '?'), sub: r.price ? null : 'no payment leg — a free claim', party: to }); setOwner(r.to, r, 'mint'); seen(r); acquire(r, amt, 'free mint'); if (!s.mint) s.mint = { ts: r.ts, by: to, amount: null, kind: 'free' }; }
          break; }
        case 'mint_purchase': {
          const to = who(r.to, o); const from = who(r.from, o);
          if (amt && amt.amount > 0) { push(r, { tone: 'origin', headline: 'Bought at mint by ' + (to ? to.text : '?') + ' for ' + amt.display, sub: usdLine(amt), amount: amt, party: to, from }); s.mint = { ts: r.ts, by: to, amount: amt, kind: 'paid' }; }
          else push(r, { tone: 'origin', headline: 'Distributed to ' + (to ? to.text : '?') + ' at mint' + (r.price_reason ? '' : ''), sub: r.price_reason ? 'no payment leg in the tx — free or admin' : null, party: to });
          setOwner(r.to, r, 'mint_purchase'); seen(r); acquire(r, amt, amt && amt.amount > 0 ? 'mint' : 'free mint'); if (!s.mint) s.mint = { ts: r.ts, by: to, amount: amt, kind: amt && amt.amount > 0 ? 'paid' : 'free' };
          break; }
        case 'transfer': {
          const to = who(r.to, o), from = who(r.from, o);
          if (r.note && /distribution|returned|launchpad/i.test(r.note)) { adminSeg(r, r.to); push(r, { tone: 'admin', headline: (from && from.label ? from.label : 'Treasury stock') + ' → ' + ((to && to.label) || (to ? to.text : '?')), sub: r.note, party: to, from }); seen(r); break; }
          if (ep && r.from === ep.seller) closeEpisode(r, 'ended by transfer');
          if (isAdmin(r.from) && holder && r.from !== holder) {   // an admin wallet moving a token it does not hold = an approved operator acting for the holder (the Council multisig's 2024 migration)
            const h = who(holder, o); const custodianTo = o.custodians && o.custodians[r.to]; const target = custodianTo && custodianTo.label ? custodianTo.label : ((to && to.label) || (to ? to.text : '?'));
            push(r, { tone: 'admin', headline: 'Moved into ' + target + ' by ' + (from ? from.text : '?') + (from && /operator/i.test(from.text) ? '' : ' (operator)'), sub: 'from ' + (h ? h.text : '?') + ' — the operator never held the token', party: to, from, operator: r.from });
            seen(r); if (!isAdmin(r.to) && !(o.custodians && o.custodians[r.to])) { setOwner(r.to, r, 'transfer'); acquire(r, null, 'transfer'); } else acq = null; break; }
          if (isAdmin(r.to) || isAdmin(r.from)) { if (isAdmin(r.to)) adminSeg(r, r.to); push(r, { tone: 'admin', headline: 'Transferred to ' + ((to && to.label) || (to ? to.text : '?')), sub: from ? 'from ' + from.text : null, party: to, from }); seen(r); acq = null; break; }   // stock going back / out of the treasury: an admin row, not a hand change
          push(r, Object.assign({ tone: 'move', headline: 'Transferred to ' + (to ? to.text : '?'), sub: from ? 'from ' + from.text : null, party: to, from }, gapCheck(r) || {}));
          setOwner(r.to, r, 'transfer'); seen(r); acquire(r, null, 'transfer');
          break; }
        case 'list': {
          const seller = who(r.from, o);
          if (ep && ep.last_delist_ts && r.from === ep.seller && (T(r.ts) - T(ep.last_delist_ts)) <= RELIST_H * H) {
            push(r, { tone: 'market', headline: 'Price changed to ' + (amt ? amt.display : '?') + ' on ' + venueName(r, o), sub: usdLine(amt), amount: amt, party: seller, episode: 'continues' }); if (seg) seg.price_changes++;
            ep.last_delist_ts = null; ep.price = amt; break;
          }
          if (ep) closeEpisode(r, 'relisted');
          const g = gapCheck(r); ep = { start: r.ts, seller: r.from, venue: venueName(r, o), price: amt, last_delist_ts: null }; s.listings++; if (seg) seg.listings++;
          push(r, Object.assign({ tone: 'market', headline: 'Listed on ' + ep.venue + ' by ' + (seller ? seller.text : '?') + ' for ' + (amt ? amt.display : '?'), sub: usdLine(amt), amount: amt, party: seller, episode: 'opens' }, g || {})); seen(r);
          break; }
        case 'delist': {
          seen(r); if (ep) { ep.last_delist_ts = r.ts; const nxt = recs[i + 1]; const relistSoon = nxt && nxt.kind === 'list' && nxt.from === ep.seller && (T(nxt.ts) - T(r.ts)) <= RELIST_H * H; if (!relistSoon) { const e = closeEpisode(r, 'delisted'); push(r, { tone: 'market', headline: 'Delisted from ' + e.listed_on + ' after ' + e.days + ' day' + (e.days === 1 ? '' : 's') + ' on the market', sub: 'not sold', episode: e }); } }
          else push(r, { tone: 'market', headline: 'Delisted from ' + venueName(r, o), sub: 'listing predates the ledger' });
          break; }
        case 'sale': {
          const buyer = who(r.to, o), seller = who(r.from, o); const e = closeEpisode(r, 'sold'); const p = realize(r, amt);
          push(r, { tone: 'sale', headline: 'Sold to ' + (buyer ? buyer.text : '?') + ' for ' + (amt ? amt.display : '?') + (e ? ' · ' + e.days + ' day' + (e.days === 1 ? '' : 's') + ' on the market' : ''), sub: usdLine(amt) + (seller ? ' · by ' + seller.text : ''), pnl: p, amount: amt, party: buyer, from: seller, episode: e, venue: venueName(r, o), seller_segment: seg ? seg.index : null, buyer_segment: null });
          s.sales++; s.last_sale = { ts: r.ts, amount: amt, to: buyer, from: seller, days_on_market: e ? e.days : null, pnl: p }; setOwner(r.to, r, 'sale'); seen(r); acquire(r, amt, 'sale'); rows[rows.length - 1].buyer_segment = seg ? seg.index : null;
          break; }
        case 'bid': { const nxt = recs[i + 1]; if (nxt && nxt.txhash === r.txhash && nxt.kind === 'sale') break;   // a buy-now: the sale row says it all
          const b = who(r.from, o); push(r, { tone: 'minor', headline: 'Bid ' + (amt ? amt.display : '?') + ' by ' + (b ? b.text : '?') + ' on ' + venueName(r, o), sub: usdLine(amt), amount: amt, party: b }); break; }
        case 'stake': case 'stake_enterprise': { const w = who(r.from, o); const g = gapCheck(r); if (ep && r.from === ep.seller) closeEpisode(r, 'ended by stake'); push(r, Object.assign({ tone: 'stake', headline: 'Staked in ' + roleOf(r, o) + ' by ' + (w ? w.text : '?'), party: w }, g || {})); setOwner(r.from, r, 'stake'); s.custody_now = roleOf(r, o); seen(r); break; }
        case 'unstake_enterprise': { const w = who(r.to, o); push(r, { tone: 'stake', headline: 'Unstaked from ' + roleOf(r, o) + (w ? ' by ' + w.text : ''), party: w }); setOwner(r.to, r, 'unstake'); s.custody_now = null; seen(r); break; }
        case 'unstake': { const w = who(r.to, o); push(r, { tone: 'stake', headline: 'Unstaking from ' + roleOf(r, o) + (w ? ' by ' + w.text : ''), sub: r.claim_duration ? 'unbonding ' + r.claim_duration.replace('time: ', '').replace(/^(\d+)$/, (m, n) => Math.round(n / 86400) + ' days') : null, party: w }); break; }
        case 'claim': { const w = who(r.to, o); push(r, { tone: 'stake', headline: 'Claimed back from ' + roleOf(r, o) + (w ? ' by ' + w.text : ''), party: w }); setOwner(r.to, r, 'claim'); s.custody_now = null; seen(r); break; }
        case 'break': { push(r, { tone: 'break', headline: 'Broken — backing redeemed' + (r.backing && r.backing.amount_display != null ? ' (' + r.backing.amount_display + ' ' + (r.backing.symbol || '') + ')' : '') }); s.broken = { ts: r.ts }; break; }
        case 'backing_add': { break; }   // treasury compounding, not the token's own move
        case 'venue_in': { push(r, { tone: 'minor', headline: 'Escrowed on ' + venueName(r, o), sub: r.note || null }); break; }
        case 'venue_out': { if (ep) { const e = closeEpisode(r, 'released'); push(r, { tone: 'market', headline: 'Listing ended on ' + e.listed_on + ' after ' + e.days + ' days', sub: r.note || null, episode: e }); } else push(r, { tone: 'minor', headline: 'Released by ' + venueName(r, o), sub: r.note || null }); break; }
        default: {   // TLA-locks lock_* kinds and anything new: the kind in plain words, both parties when present
          const to = who(r.to, o), from = who(r.from, o); push(r, { tone: 'move', headline: String(r.kind).replace(/^lock_/, 'Lock ').replace(/_/g, ' '), sub: [from && 'from ' + from.text, to && 'to ' + to.text].filter(Boolean).join(' · ') || null, amount: amt, party: to, from });
          if (r.kind === 'lock_transfer') setOwner(r.to, r, r.kind); seen(r);
        }
      }
    }
    if (ep) { const days = Math.max(0, Math.round((now - T(ep.start)) / D)); s.days_on_market += days; s.listed_now = { since: ep.start, days, on: ep.venue, price: ep.price, seller: who(ep.seller, o) }; }
    if (seg) { seg.held_days = Math.max(0, Math.round((now - T(seg.start)) / D)); seg.current = true; }
    s.segments = segments; s.owner_now = owner ? who(owner, o) : null;
    if (acq && owner) { const h = Object.assign({ owner: s.owner_now, held_days: Math.max(0, Math.round((now - T(acq.ts)) / D)) }, acq); if (h.amount && typeof o.usdNow === 'function') { const n = o.usdNow(h.amount.symbol); if (n && num(n.usd) != null) { h.usd_now = h.amount.amount * Number(n.usd); h.now_day = n.day || null; } } h.text = holdingText(h); s.holding = h; }
    s.rows = rows.length;
    return { rows, summary: s };
  }
  function pnlText(p) {   // the sale row's second line, two ways
    if (!p.basis_known) return p.received ? 'seller\'s cost basis unknown (arrived by transfer) — proceeds ' + p.received.display + (p.received_usd != null ? ' (' + fmtUsd(p.received_usd) + ')' : '') : null;
    const paid = p.paid ? p.paid.display + (p.paid_usd != null ? ' (' + fmtUsd(p.paid_usd) + ')' : '') : 'free';
    const usd = p.usd_delta != null ? 'USD ' + fmtSigned(p.usd_delta, fmtUsd) + (p.usd_pct != null ? ' (' + fmtPct(p.usd_pct) + ')' : '') : (p.paid_usd === 0 && p.received_usd != null ? 'USD +' + fmtUsd(p.received_usd) + ' (free mint)' : 'USD n/a');
    const luna = p.luna_delta != null ? 'LUNA terms ' + fmtSigned(p.luna_delta, (x) => fmtAmt(x) + ' LUNA') + (p.luna_pct != null ? ' (' + fmtPct(p.luna_pct) + ')' : '') : (p.paid_luna === 0 && p.received_luna != null ? 'LUNA terms +' + fmtAmt(p.received_luna) + ' LUNA (free mint)' : (p.received_luna_na ? 'LUNA terms n/a (' + (p.received_luna_basis || 'no LUNA leg') + ')' : (p.paid_luna_na ? 'LUNA terms n/a (bought without a LUNA leg)' : 'LUNA terms n/a')));
    return 'P&L for this owner · paid ' + paid + ' → ' + usd + ' · ' + luna + (p.held_days != null ? ' · held ' + p.held_days + ' day' + (p.held_days === 1 ? '' : 's') : '');
  }
  function holdingText(h) {
    const paid = h.amount ? h.amount.display + (h.usd != null ? ' (' + fmtUsd(h.usd) + ' then' + (h.usd_now != null ? ' · ' + fmtUsd(h.usd_now) + ' now' : '') + ')' : '') : (h.how === 'free mint' ? 'free (mint)' : 'basis unknown (arrived by transfer)');
    const le = h.luna != null && h.amount && h.amount.symbol !== 'LUNA' ? ' ≈ ' + fmtAmt(h.luna) + ' LUNA at the time' : '';
    return 'Holder paid ' + paid + le + ' · held ' + h.held_days + ' day' + (h.held_days === 1 ? '' : 's');
  }
  function usdLine(amt) {
    if (!amt) return null;
    const then = amt.usd_then != null ? fmtUsd(amt.usd_then) + ' then' : (amt.usd_reason ? 'USD unpriced (' + amt.usd_reason.split(':')[0].replace(/_/g, ' ') + ')' : null);
    const nowP = amt.usd_now != null ? fmtUsd(amt.usd_now) + ' now' + (amt.now_day ? ' (' + amt.now_day + ')' : '') : null;
    return [then, nowP].filter(Boolean).join(' · ') || null;
  }
  // shard path for a token id — the same rule org-nft-flows writes with (index.json.shard_size)
  function shardOf(tokenId, shardSize) { const n = Number(tokenId); const sz = shardSize || 100; return Number.isInteger(n) && n >= 0 ? String(Math.floor(n / sz)).padStart(3, '0') : 'x'; }
  // manifest → opts.labels/custodians/launchpads/distribution_wallets (nft-collections/<slug>/collection.json)
  function optsFromManifest(cj) {
    const cap = (cj && cj.capture) || {}; const labels = {}; const custodians = {};
    for (const [a, c] of Object.entries(cap.custodians || {})) { custodians[c.role] = c; custodians[a] = c; if (c.label) labels[a] = c.label; }
    if (cap.launchpad && cap.launchpad.labels) Object.assign(labels, cap.launchpad.labels);
    for (const a of (cap.distribution_wallets || [])) if (!labels[a]) labels[a] = (cap.distribution_wallet_labels && cap.distribution_wallet_labels[a]) || 'DAO distribution wallet';
    if (cap.minter) labels[cap.minter] = labels[cap.minter] || 'minter contract';
    const gov = (cj && cj.governance) || {}; if (gov.dao_address && !labels[gov.dao_address]) labels[gov.dao_address] = (gov.dao_name || (cj && cj.name) || 'the DAO') + ' core (' + (gov.dao_platform || 'DAO') + ')';
    const launchpads = [cap.launchpad && cap.launchpad.address, ...((cap.launchpad && cap.launchpad.addresses) || [])].filter(Boolean);
    return { labels, custodians, launchpads, distribution_wallets: cap.distribution_wallets || [] };
  }
  return { fold, shardOf, optsFromManifest, amountOf, lunaEq, fmtUsd, fmtAmt, RELIST_H, version: '1.2.1', LUNA_FAMILY };
});
