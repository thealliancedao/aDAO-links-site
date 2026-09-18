/* lib/nft-history.js 1.0.0 (2026-09-18) — ONE NFT's on-chain journey, folded from its ledger records.
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
    const rows = []; const s = { hands_changed: 0, listings: 0, sales: 0, days_on_market: 0, listed_now: null, mint: null, last_sale: null, custody_now: null, owner_now: null, first_owner: null, unpriced: 0, gaps: 0 };
    let holder = null;         // where the ledger last saw the token (owner, custodian or venue) — a move FROM somewhere else is a gap, said so, never papered over
    const seen = (r) => { if (r.to) holder = r.to; };
    const gapCheck = (r) => { if (holder && r.from && r.from !== holder && !isAdmin(r.from)) { s.gaps++; return { gap: true, gap_note: 'arrived from ' + (who(r.from, o) || {}).text + ' — that move is not in the ledger' }; } return null; };
    let ep = null;             // open listing episode { start, seller, venue, last_delist_ts, price }
    let owner = null;          // the wallet that owns the token (custody excluded)
    const push = (r, row) => { rows.push(Object.assign({ ts: r.ts, day: dayOf(r.ts), height: r.height, txhash: r.txhash, kind: r.kind }, row)); };
    const closeEpisode = (r, how, extra) => {
      if (!ep) return null; const days = daysBetween(ep.start, r.ts); s.days_on_market += days; const e = Object.assign({ days, how, listed_on: ep.venue, since: ep.start }, extra || {}); ep = null; return e;
    };
    const setOwner = (addr, r, why) => { if (!addr || isAdmin(addr)) return; if (owner && owner !== addr) s.hands_changed++; if (!s.first_owner) s.first_owner = addr; owner = addr; };
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]; const amt = amountOf(r, o); if (r.price && amt && amt.usd_then == null) s.unpriced++;
      switch (r.kind) {
        case 'mint': {
          const to = who(r.to, o); const admin = isAdmin(r.to);
          if (admin) { push(r, { tone: 'admin', headline: 'Minted into ' + ((to && to.label) || 'the treasury stock'), party: to }); seen(r); }
          else { push(r, { tone: 'origin', headline: 'Minted to ' + (to ? to.text : '?'), sub: r.price ? null : 'no payment leg — a free claim', party: to }); setOwner(r.to, r, 'mint'); seen(r); if (!s.mint) s.mint = { ts: r.ts, by: to, amount: null, kind: 'free' }; }
          break; }
        case 'mint_purchase': {
          const to = who(r.to, o); const from = who(r.from, o);
          if (amt && amt.amount > 0) { push(r, { tone: 'origin', headline: 'Bought at mint by ' + (to ? to.text : '?') + ' for ' + amt.display, sub: usdLine(amt), amount: amt, party: to, from }); s.mint = { ts: r.ts, by: to, amount: amt, kind: 'paid' }; }
          else push(r, { tone: 'origin', headline: 'Distributed to ' + (to ? to.text : '?') + ' at mint' + (r.price_reason ? '' : ''), sub: r.price_reason ? 'no payment leg in the tx — free or admin' : null, party: to });
          setOwner(r.to, r, 'mint_purchase'); seen(r); if (!s.mint) s.mint = { ts: r.ts, by: to, amount: amt, kind: amt && amt.amount > 0 ? 'paid' : 'free' };
          break; }
        case 'transfer': {
          const to = who(r.to, o), from = who(r.from, o);
          if (r.note && /distribution|returned|launchpad/i.test(r.note)) { push(r, { tone: 'admin', headline: (from && from.label ? from.label : 'Treasury stock') + ' → ' + ((to && to.label) || (to ? to.text : '?')), sub: r.note, party: to, from }); seen(r); break; }
          if (ep && r.from === ep.seller) closeEpisode(r, 'ended by transfer');
          push(r, Object.assign({ tone: 'move', headline: 'Transferred to ' + (to ? to.text : '?'), sub: from ? 'from ' + from.text : null, party: to, from }, gapCheck(r) || {}));
          setOwner(r.to, r, 'transfer'); seen(r);
          break; }
        case 'list': {
          const seller = who(r.from, o);
          if (ep && ep.last_delist_ts && r.from === ep.seller && (T(r.ts) - T(ep.last_delist_ts)) <= RELIST_H * H) {
            push(r, { tone: 'market', headline: 'Price changed to ' + (amt ? amt.display : '?') + ' on ' + venueName(r, o), sub: usdLine(amt), amount: amt, party: seller, episode: 'continues' });
            ep.last_delist_ts = null; ep.price = amt; break;
          }
          if (ep) closeEpisode(r, 'relisted');
          const g = gapCheck(r); ep = { start: r.ts, seller: r.from, venue: venueName(r, o), price: amt, last_delist_ts: null }; s.listings++;
          push(r, Object.assign({ tone: 'market', headline: 'Listed on ' + ep.venue + ' by ' + (seller ? seller.text : '?') + ' for ' + (amt ? amt.display : '?'), sub: usdLine(amt), amount: amt, party: seller, episode: 'opens' }, g || {})); seen(r);
          break; }
        case 'delist': {
          seen(r); if (ep) { ep.last_delist_ts = r.ts; const nxt = recs[i + 1]; const relistSoon = nxt && nxt.kind === 'list' && nxt.from === ep.seller && (T(nxt.ts) - T(r.ts)) <= RELIST_H * H; if (!relistSoon) { const e = closeEpisode(r, 'delisted'); push(r, { tone: 'market', headline: 'Delisted from ' + e.listed_on + ' after ' + e.days + ' day' + (e.days === 1 ? '' : 's') + ' on the market', sub: 'not sold', episode: e }); } }
          else push(r, { tone: 'market', headline: 'Delisted from ' + venueName(r, o), sub: 'listing predates the ledger' });
          break; }
        case 'sale': {
          const buyer = who(r.to, o), seller = who(r.from, o); const e = closeEpisode(r, 'sold');
          push(r, { tone: 'sale', headline: 'Sold to ' + (buyer ? buyer.text : '?') + ' for ' + (amt ? amt.display : '?') + (e ? ' · ' + e.days + ' day' + (e.days === 1 ? '' : 's') + ' on the market' : ''), sub: usdLine(amt) + (seller ? ' · by ' + seller.text : ''), amount: amt, party: buyer, from: seller, episode: e, venue: venueName(r, o) });
          s.sales++; s.last_sale = { ts: r.ts, amount: amt, to: buyer, from: seller, days_on_market: e ? e.days : null }; setOwner(r.to, r, 'sale'); seen(r);
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
    s.owner_now = owner ? who(owner, o) : null;
    s.rows = rows.length;
    return { rows, summary: s };
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
    for (const a of (cap.distribution_wallets || [])) if (!labels[a]) labels[a] = 'DAO treasury stock (mint era)';
    if (cap.minter) labels[cap.minter] = labels[cap.minter] || 'minter contract';
    const launchpads = [cap.launchpad && cap.launchpad.address, ...((cap.launchpad && cap.launchpad.addresses) || [])].filter(Boolean);
    return { labels, custodians, launchpads, distribution_wallets: cap.distribution_wallets || [] };
  }
  return { fold, shardOf, optsFromManifest, amountOf, fmtUsd, fmtAmt, RELIST_H, version: '1.0.0' };
});
