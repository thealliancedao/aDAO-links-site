/* lib/vote-market-tile.js — the Vote Market overview tile (TLA Stats), on the same engine as the simulator (lib/vote-market.js).
 * One set of numbers everywhere: pots, Votion's moves (in real VP), APRs and the best split come from VoteMarket, never from a second model.
 * VoteMarketTile.mount(root, { planner, getWallet, model, onRate }) → { refresh(), model }
 *   planner   — the simulator's URL (default /vote-market.html)
 *   getWallet — () => the selected terra address or null (read only)
 *   model     — a prebuilt VoteMarket model (tests); otherwise VoteMarket.load() + the live pots
 *   onRate    — (usdPer1mVp) => void, Votion's going rate for the page's other tiles
 *   view      — the tab to open on: 'board' (default) | 'where' | 'votion' | 'pots'
 * 1.4.0 (2026-11-24, owner: "this is super messy and I am still lost — how can Votion just not include these LPs?"): the board in far fewer
 *   words. Four columns (pool · pot · Votion's votes · APR), one short caption a row, the rule in one line with the rest folded away, and
 *   the vault-by-vault figures folded under "Check against Votion's own page". The pools Votion's optimizer is not including are a group
 *   of their own — said once, in plain words: no bribe there, of any size, moves its votes until it includes them — with one link to see
 *   the round as if it did (it was a switch between two views, a tag and a sentence on every row). A bribe's effect is three short lines.
 * 1.3.0 (2026-11-24, owner: "a place you can see all of the LPs being bribed… the current APR… what Votion plans to do with its votes, the
 *   projected resulting APR to the pools it optimizes towards and the pools it pulls votes from… what if I added an additional xxx… the
 *   winner against the losers" and "I don't get 'not on Votion's list this round'… why does 'no Votion' exist?"):
 *   · THIS ROUND, the opening tab — one bucket, every pot: what each pays per vote, Votion's votes now → after it casts, the APR now →
 *     next epoch, the reason in a sentence, and each vault's own % as Votion's page shows it. Tap a pool to add a bribe to it: every row
 *     gains a third figure, a banner names who gains and who pays, and the totals show nothing is created (VoteMarket.board).
 *   · A funded pool that Votion's optimizer is not counting is no longer worded as a standing rule ("not on Votion's list this round",
 *     "no Votion"). It says what the capture says — not counted right now — and the board has a switch to see the round the other way,
 *     with every pot counted, which is how Votion's optimizer has read nearly every day on record.
 * 1.2.0 (2026-11-24, owner: "you don't see why… how much do I need to add to attract Votion"): the tile says how Votion decides (one rule, with
 *   its going rate for the bucket) and every row says where that pool stands against it — how much more before Votion adds a vote, what the
 *   next 1M VP costs, or that Votion's list leaves the pool out this round and what the rule would do if it did not. "A vote costs" is the
 *   bucket's own rate (it differs a lot by bucket), not one number for all four.
 * 1.1.1 (2026-09-27): "Voting closes in" names the real deadline (Votion's voteBefore, Sun 23:59 UTC) — it said ~21:20, which is when Votion casts.
 * 1.1.0 (2026-09-27): the footer bar is gone (the header button + every row's Simulate stay); the filters are one toolbar — a segmented $ control, Bucket and Rank by dropdowns.
 * 1.0.0 (2026-09-27): replaces the tile's own solver — three views (Where $ does the most · Votion's next move · Pots), a wallet teaser
 * for the best split, and the simulator one tap away from every row. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.VoteMarketTile = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.4.0';   // 1.4.0 (2026-11-24): the board in far fewer words; pools Votion's optimizer is not including are a group of their own (see the header)   // 1.3.1 (2026-11-24): "Votion's next move" shows the same votes as This round (engine 1.5.1)   // 1.3.0 (2026-11-24): the This round board + "not counted right now" wording (see the header)   // 1.2.0 (2026-11-24): the rule and each pool's place against it   // 1.1.2 (2026-11-24, owner): a pool holding a replaced asset carries the curated one-liner, not "<asset> ending"  //
  var CSS = '' +
    '.vmt{--vmt-up:#34d399;--vmt-dn:#f87171;--vmt-am:#fbbf24;--vmt-cy:#22d3ee;--vmt-mut:#94a3b8;--vmt-dim:#64748b;--vmt-line:rgba(255,255,255,.07)}' +
    '.vmt .mono{font-family:"JetBrains Mono",ui-monospace,monospace}' +
    '.vmt-up{color:var(--vmt-up)}.vmt-dn{color:var(--vmt-dn)}.vmt-fl{color:var(--vmt-mut)}.vmt-am{color:var(--vmt-am)}' +
    '.vmt-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap}' +
    '.vmt-title{display:flex;align-items:center;gap:.5rem;font-weight:600;font-size:1.125rem}' +
    '.vmt-round{font-size:.7rem;padding:.15rem .55rem;border-radius:999px;background:rgba(245,158,11,.15);color:#fcd34d;font-weight:600;white-space:nowrap}' +
    '.vmt-cta{display:inline-flex;align-items:center;gap:.55rem;padding:.6rem 1.05rem;border-radius:.8rem;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#1a1204;font-weight:800;font-size:.95rem;text-decoration:none;box-shadow:0 0 0 1px rgba(251,191,36,.5),0 6px 22px -6px rgba(251,191,36,.55);white-space:nowrap}' +
    '.vmt-cta:hover{filter:brightness(1.08)}.vmt-cta .sm{font-weight:600;font-size:.72rem;opacity:.8;display:block;line-height:1.1}' +
    '.vmt-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.5rem;margin:.85rem 0 .7rem}' +
    '.vmt-stat{background:rgba(255,255,255,.035);border:1px solid var(--vmt-line);border-radius:.7rem;padding:.5rem .7rem;min-width:0}' +
    '.vmt-stat .k{font-size:.68rem;color:var(--vmt-dim);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.vmt-stat .v{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:1.15rem;white-space:nowrap;margin-top:.1rem}' +
    '.vmt-stat .s{font-size:.68rem;color:var(--vmt-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.vmt-seg{display:flex;gap:.2rem;background:rgba(255,255,255,.04);border-radius:.7rem;padding:.2rem;margin-bottom:.6rem}' +
    '.vmt-seg button{flex:1;border:0;background:transparent;color:var(--vmt-mut);font-weight:600;font-size:.82rem;padding:.45rem .4rem;border-radius:.55rem;cursor:pointer;white-space:nowrap}' +
    '.vmt-seg button.on{background:rgba(251,191,36,.16);color:#fde68a}' +
    '.vmt-tools{display:flex;align-items:center;gap:.5rem 1.1rem;flex-wrap:wrap;padding:.45rem .6rem;margin-bottom:.35rem;border-radius:.75rem;background:rgba(255,255,255,.025);border:1px solid var(--vmt-line)}' +
    '.vmt-tools .grp{display:flex;align-items:center;gap:.45rem}.vmt-tools .lb{font-size:.68rem;color:var(--vmt-dim);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}' +
    '.vmt-amts{display:inline-flex;border:1px solid rgba(251,191,36,.3);border-radius:.55rem;overflow:hidden}.vmt-amts button{border:0;background:transparent;color:var(--vmt-mut);font-family:"JetBrains Mono",monospace;font-weight:600;font-size:.78rem;padding:.28rem .6rem;cursor:pointer;border-left:1px solid rgba(251,191,36,.18)}.vmt-amts button:first-child{border-left:0}.vmt-amts button:hover{color:#fde68a}.vmt-amts button.on{background:rgba(251,191,36,.2);color:#fde68a}' +
    '.vmt-sel{appearance:none;-webkit-appearance:none;background-color:rgba(34,211,238,.08);color:#a5f3fc;border:1px solid rgba(34,211,238,.3);border-radius:.55rem;font:600 .8rem Outfit,sans-serif;padding:.3rem 1.7rem .3rem .65rem;cursor:pointer;background-image:linear-gradient(45deg,transparent 50%,#67e8f9 50%),linear-gradient(135deg,#67e8f9 50%,transparent 50%);background-position:calc(100% - .8rem) 55%,calc(100% - .5rem) 55%;background-size:.3rem .3rem;background-repeat:no-repeat}.vmt-sel:hover{border-color:rgba(34,211,238,.55)}.vmt-sel option{background:#0f1218;color:#e5e7eb}' +
    '.vmt-hint{font-size:.72rem;color:var(--vmt-dim);margin:.1rem 0 .4rem}' +
    '.vmt-rule{font-size:.8rem;line-height:1.45;color:#cbd5e1;background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.22);border-radius:.65rem;padding:.5rem .7rem;margin:.15rem 0 .5rem}.vmt-rule b{color:#e2e8f0}' +
    '.vmt-why{grid-column:2/-1;font-size:.76rem;line-height:1.4;color:var(--vmt-mut);margin-top:-.45rem;white-space:normal}.vmt-why b{color:#e2e8f0;font-weight:600}.vmt-why.no b{color:#fca5a5}' +
    '.vmt-row{display:grid;grid-template-columns:1.4rem minmax(0,1.35fr) minmax(0,1.05fr) minmax(0,1.2fr) minmax(0,.8fr) auto;gap:1rem;align-items:center;padding:.55rem .45rem;border-top:1px solid var(--vmt-line);border-radius:.55rem;text-decoration:none;color:inherit}' +
    '.vmt-row:hover{background:rgba(251,191,36,.05)}.vmt-row.head{border-top:0;padding-bottom:.2rem;font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--vmt-dim)}.vmt-row.head:hover{background:none}' +
    '.vmt-row .n{font-family:"JetBrains Mono",monospace;color:var(--vmt-dim);font-size:.8rem}' +
    '.vmt-row .nm{font-weight:600;font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.vmt-row .tags{display:flex;gap:.25rem;flex-wrap:wrap;margin-top:.15rem}' +
    '.vmt-tag{font-size:.62rem;padding:.05rem .35rem;border-radius:.3rem;background:rgba(255,255,255,.06);color:var(--vmt-mut);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;text-decoration:none}' +
    '.vmt-tag.warn{background:rgba(251,191,36,.14);color:#fcd34d}.vmt-tag.no{background:rgba(248,113,113,.12);color:#fca5a5}.vmt-tag.me{background:rgba(192,132,252,.15);color:#d8b4fe}' +
    '.vmt-big{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:1.05rem;white-space:nowrap}' +
    '.vmt-sub{font-size:.7rem;color:var(--vmt-dim);white-space:nowrap}' +
    '.vmt-bar{height:.3rem;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:.25rem}.vmt-bar i{display:block;height:100%;border-radius:999px}' +
    '.vmt-plan{font-size:.78rem;font-weight:700;padding:.3rem .65rem;border-radius:.55rem;background:rgba(251,191,36,.14);color:#fde68a;border:1px solid rgba(251,191,36,.35);white-space:nowrap}' +
    '.vmt-row:hover .vmt-plan{background:rgba(251,191,36,.28)}' +
    '.vmt-me{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin:.2rem 0 .7rem;padding:.6rem .8rem;border-radius:.75rem;background:rgba(192,132,252,.08);border:1px solid rgba(192,132,252,.28);text-decoration:none;color:inherit}' +
    '.vmt-me:hover{background:rgba(192,132,252,.13)}.vmt-me .go{margin-left:auto;font-weight:700;color:#d8b4fe;white-space:nowrap}' +
    '.vmt-est{font-size:.72rem;color:#fcd34d;opacity:.85;margin-top:.55rem}' +
    '.vmt-more{display:block;margin:.4rem auto 0;font-size:.7rem;padding:.25rem .8rem;border-radius:999px;background:rgba(255,255,255,.05);color:var(--vmt-mut);border:0;cursor:pointer}' +
    '.vmt-row .k-sm{display:none;font-size:.7rem;color:var(--vmt-dim)}.vmt-seg .sh{display:none}' +
    // 1.3.0 — the board
    '.vmt-tag.you{background:rgba(251,191,36,.2);color:#fde68a}' +
    '.vmt-bks{display:inline-flex;border:1px solid rgba(34,211,238,.3);border-radius:.55rem;overflow:hidden;flex-wrap:wrap}.vmt-bks button{border:0;background:transparent;color:var(--vmt-mut);font:600 .8rem Outfit,sans-serif;padding:.3rem .65rem;cursor:pointer;border-left:1px solid rgba(34,211,238,.18);white-space:nowrap}.vmt-bks button:first-child{border-left:0}.vmt-bks button:hover{color:#a5f3fc}.vmt-bks button.on{background:rgba(34,211,238,.16);color:#a5f3fc}.vmt-bks .ct{font-family:"JetBrains Mono",monospace;font-weight:500;font-size:.7rem;opacity:.8;margin-left:.3rem}' +
    '.vmt-in{width:5.4rem;background:rgba(255,255,255,.05);border:1px solid rgba(251,191,36,.3);border-radius:.55rem;color:#fde68a;font:600 .8rem "JetBrains Mono",monospace;padding:.28rem .5rem}.vmt-in::placeholder{color:var(--vmt-dim);font-weight:500}' +
    '.vmt-x{border:0;background:rgba(255,255,255,.06);color:var(--vmt-mut);font:600 .72rem Outfit,sans-serif;padding:.3rem .6rem;border-radius:.5rem;cursor:pointer}.vmt-x:hover{color:#e5e7eb}' +
    '.vmt-read{font-size:.8rem;line-height:1.45;color:#cbd5e1;background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.25);border-radius:.65rem;padding:.5rem .7rem;margin:.15rem 0 .5rem}.vmt-read b{color:#e2e8f0}.vmt-read .sw{display:inline-flex;margin-top:.4rem;border:1px solid rgba(248,113,113,.35);border-radius:.55rem;overflow:hidden;flex-wrap:wrap}.vmt-read .sw button{border:0;background:transparent;color:var(--vmt-mut);font:600 .76rem Outfit,sans-serif;padding:.3rem .7rem;cursor:pointer;border-left:1px solid rgba(248,113,113,.2)}.vmt-read .sw button:first-child{border-left:0}.vmt-read .sw button.on{background:rgba(248,113,113,.16);color:#fecaca}' +
    '.vmt-wif{font-size:.84rem;line-height:1.5;color:#e2e8f0;background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.35);border-radius:.65rem;padding:.55rem .75rem;margin:.15rem 0 .5rem}.vmt-wif b{color:#fde68a}.vmt-wif .ck{display:block;margin-top:.3rem;font-size:.76rem;color:var(--vmt-mut)}.vmt-wif a{color:#fcd34d;font-weight:700;text-decoration:none;white-space:nowrap}.vmt-wif .lnk{border:0;background:none;color:#fcd34d;font:700 .84rem Outfit,sans-serif;padding:0;cursor:pointer;text-decoration:underline}' +
    '.vmt-leg{font-size:.72rem;color:var(--vmt-dim);margin:.1rem 0 .3rem}.vmt-leg .y{color:#fde68a;border-bottom:2px solid #fbbf24;padding-bottom:1px}' +
    '.vmt-brow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.95fr) minmax(0,1.2fr) minmax(0,1.2fr);gap:.25rem 1rem;align-items:start;padding:.55rem .45rem;border-top:1px solid var(--vmt-line);border-radius:.55rem}' +
    '.vmt-brow.w3{grid-template-columns:minmax(0,1.1fr) minmax(0,.85fr) minmax(0,1.4fr) minmax(0,1.4fr)}' +
    '.vmt-grp{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#a5f3fc;padding:.7rem .45rem .25rem}.vmt-grp.out{color:#fca5a5}' +
    '.vmt-gnote{font-size:.8rem;line-height:1.45;color:#cbd5e1;background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.25);border-radius:.6rem;padding:.45rem .65rem;margin:0 0 .25rem}.vmt-gnote b{color:#fecaca}' +
    '.vmt .lnk{border:0;background:none;color:#fcd34d;font:700 .8rem Outfit,sans-serif;padding:0;cursor:pointer;text-decoration:underline;white-space:nowrap}' +
    '.vmt-dt{margin-top:.25rem}.vmt-dt summary{cursor:pointer;color:var(--vmt-mut);font-size:.74rem;display:inline-block}.vmt-rule .vmt-dt{display:inline}.vmt-rule .vmt-dt[open]{display:block}.vmt-rule .vmt-dt summary{margin-left:.35rem;text-decoration:underline}' +
    '.vmt-page{font-size:.76rem;line-height:1.5;color:var(--vmt-mut);margin-top:.55rem}.vmt-page b{color:#cbd5e1}.vmt-page summary{font-size:.76rem;text-decoration:underline}' +
    '.vmt-wif .l2{display:block;margin-top:.2rem}' +
    '.vmt-brow[data-wpk]{cursor:pointer}.vmt-brow[data-wpk]:hover{background:rgba(251,191,36,.05)}.vmt-brow.tg{background:rgba(251,191,36,.07);box-shadow:inset 3px 0 0 #fbbf24}.vmt-brow.out{box-shadow:inset 3px 0 0 rgba(248,113,113,.55)}.vmt-brow.tg.out{box-shadow:inset 3px 0 0 #fbbf24}' +
    '.vmt-brow.head{border-top:0;padding-bottom:.2rem;font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--vmt-dim);align-items:end}' +
    '.vmt-brow.tot{background:rgba(255,255,255,.03);border-top:1px solid rgba(255,255,255,.14);font-size:.8rem;color:var(--vmt-mut)}.vmt-brow.tot .nm{font-size:.86rem}' +
    '.vmt-brow .vmt-sub{white-space:normal}.vmt-brow .nm{font-weight:600;font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vmt-brow .tags{display:flex;gap:.25rem;flex-wrap:wrap;margin-top:.15rem}.vmt-brow .k-sm{display:none;font-size:.7rem;color:var(--vmt-dim)}' +
    '.vmt-tri{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:.88rem;line-height:1.5}.vmt-tri .st{display:inline-block;white-space:nowrap}.vmt-tri .a{color:var(--vmt-mut);font-weight:500}.vmt-tri .ar{color:var(--vmt-dim);font-weight:400;margin:0 .22rem}.vmt-tri .y{border-bottom:2px solid #fbbf24;padding-bottom:1px}' +
    '.vmt-bwhy{grid-column:1/-1;font-size:.76rem;line-height:1.45;color:var(--vmt-mut);white-space:normal}.vmt-bwhy b{color:#e2e8f0;font-weight:600}.vmt-bwhy.no b{color:#fca5a5}.vmt-bwhy .pg{display:block;color:var(--vmt-dim);margin-top:.1rem}' +
    '@media (max-width:760px){' +
      '.vmt-seg .lg{display:none}.vmt-seg .sh{display:inline}.vmt-tools{gap:.45rem .8rem}.vmt-tools .grp:first-child{width:100%}.vmt-amts{flex:1}.vmt-amts button{flex:1;padding:.35rem 0}' +
      '.vmt-stats{grid-template-columns:1fr 1fr}.vmt-cta{width:100%;justify-content:center}' +
      '.vmt-row{grid-template-columns:1.1rem minmax(0,1fr) auto;gap:.2rem .6rem;padding:.6rem .3rem}.vmt-row.head{display:none}' +
      '.vmt-row .c-apr,.vmt-row .c-vot{grid-column:2/3;display:flex;gap:.4rem;align-items:baseline}.vmt-row .c-apr .vmt-sub,.vmt-row .c-vot .vmt-sub{display:inline}' +
      '.vmt-row .c-main{grid-column:3/4;grid-row:1/2;text-align:right}.vmt-row .c-go{grid-column:3/4;grid-row:2/4;align-self:center;text-align:right}' +
      '.vmt-row .c-apr .vmt-big,.vmt-row .c-vot .vmt-big{font-size:.85rem}.vmt-row .k-sm{display:inline}.vmt-seg button{font-size:.76rem}' +
      '.vmt-why{grid-column:1/-1;margin-top:0}' +
      '.vmt-brow,.vmt-brow.w3{grid-template-columns:minmax(0,1fr);gap:.3rem;padding:.65rem .3rem}.vmt-brow.head{display:none}.vmt-brow .k-sm{display:inline}' +
      '.vmt-brow .bc{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;flex-wrap:wrap}.vmt-brow .bc .vmt-sub{white-space:normal;text-align:right}.vmt-brow .bc .vv{text-align:right}.vmt-brow .nm{white-space:normal}' +
      '.vmt-tri,.vmt-brow.w3 .vmt-tri{font-size:.82rem}.vmt-btools .grp{width:100%;flex-wrap:wrap}.vmt-btools .lb{width:100%}.vmt-btools .vmt-amts{flex:1}.vmt-btools .vmt-in{width:4.8rem}.vmt-btools .vmt-sel{flex:1;min-width:0}' +
      '.vmt-bks{width:100%;display:grid;grid-template-columns:1fr 1fr}.vmt-bks button{border-left:0;border-top:1px solid rgba(34,211,238,.18)}.vmt-bks button:nth-child(-n+2){border-top:0}.vmt-bks button:nth-child(even){border-left:1px solid rgba(34,211,238,.18)}' +
      '.vmt-read .sw{display:flex;flex-direction:column}.vmt-read .sw button{border-left:0;border-top:1px solid rgba(248,113,113,.2);text-align:left}.vmt-read .sw button:first-child{border-top:0}' +
    '}';

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (x, d) { if (x == null || !isFinite(x)) return '—'; var a = Math.abs(x); if (d == null) d = a >= 100 ? 0 : 2; return (x < 0 ? '−$' : '$') + a.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var sMoney = function (x, d) { return (x >= 0 ? '+' : '') + money(x, d); };
  var vp = function (x) { var a = Math.abs(x); return a >= 1e6 ? (x / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? Math.round(x / 1e3) + 'K' : String(Math.round(x)); };
  var sVp = function (x) { return (x > 0 ? '+' : x < 0 ? '−' : '±') + vp(Math.abs(x)); };
  var pct = function (x) { return x == null || !isFinite(x) ? '—' : (x >= 1000 ? Math.round(x).toLocaleString('en-US') : x >= 100 ? x.toFixed(0) : x.toFixed(1)) + '%'; };
  var cls = function (d, eps) { return d > (eps || 0) ? 'vmt-up' : d < -(eps || 0) ? 'vmt-dn' : 'vmt-fl'; };
  var left = function (iso) { if (!iso) return null; var l = Math.max(0, Date.parse(iso) - Date.now()); return l > 864e5 ? Math.floor(l / 864e5) + 'd ' + Math.floor(l % 864e5 / 36e5) + 'h' : Math.floor(l / 36e5) + 'h ' + Math.floor(l % 36e5 / 6e4) + 'm'; };
  var dexTag = function (p) { return /astro/i.test(p.dex || '') ? 'Astro' : /skeleton/i.test(p.dex || '') ? 'Skeleton' : ''; };

  function mount(el, opts) {
    opts = opts || {}; var VM = (typeof window !== 'undefined' && window.VoteMarket) || opts.engine; var doc = el.ownerDocument;
    if (!doc.getElementById('vmt-css')) { var st = doc.createElement('style'); st.id = 'vmt-css'; st.textContent = CSS; doc.head.appendChild(st); }
    var PLAN = opts.planner || '/vote-market.html';
    var VIEWS = ['board', 'where', 'votion', 'pots'];
    // bb = the board's bucket (null → the one with the most in pots) · wpk/wusd = the board's what-if pool and $ · cnt = which pots Votion counts ('published' | 'all')
    var S = { view: VIEWS.indexOf(opts.view) >= 0 ? opts.view : 'board', amt: 50, bucket: 'all', lens: 'impact', all: false, m: opts.model || null, live: false, voters: false, best: null, bestKey: '', bb: null, wpk: null, wusd: 100, cnt: 'published' };
    var api = { refresh: paint, get model() { return S.m; }, state: S };
    el.classList.add('vmt');
    function walletRec() { var w = opts.getWallet ? opts.getWallet() : null; return w && S.m && S.m.voters ? { addr: w, rec: S.m.voters[w] || null } : { addr: w, rec: null }; }
    function planUrl(pk, bribe) { var q = []; if (pk) q.push('pool=' + encodeURIComponent(pk)); if (bribe) q.push('bribe=' + bribe); return PLAN + (q.length ? '?' + q.join('&') : ''); }

    function paint() {
      if (!S.m) { el.innerHTML = '<div class="vmt-hint" style="padding:1.5rem 0">Loading the Vote Market…</div>'; return; }
      var m = S.m; var funded = 0, n = 0; Object.keys(m.pools).forEach(function (k) { var p = m.pools[k]; funded += p.potUsd || 0; if (p.potUsd > 0.5) n++; });
      var casts = (m.moveRuleDoc && m.moveRuleDoc.timing && m.moveRuleDoc.timing.casts) || []; var hs = casts.filter(function (c) { return c.hours_before_deadline > 0 && c.hours_before_deadline < 6; }).map(function (c) { return c.hours_before_deadline; }).sort(function (a, b) { return a - b; }); var hb = hs.length ? hs[Math.floor(hs.length / 2)] : null;
      var castAt = m.voteBefore && hb != null ? new Date(Date.parse(m.voteBefore) - hb * 36e5).toISOString() : null;
      // 1.2.0: Votion's going rate is per bucket (24 Nov: Project $10.27, Single $3.89 per 1M VP) — one figure for all four said neither
      var levels = {}; VM.BUCKETS.forEach(function (b) { levels[b] = VM.votionLevel(m, b); }); S.levels = levels;
      var lvs = VM.BUCKETS.map(function (b) { return levels[b]; }).filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
      var bst = bucketStats(m); var sbk = S.view === 'board' ? boardBucket(m, bst) : S.bucket;   // the bucket the rate stat speaks for
      var rate = sbk !== 'all' ? levels[sbk] : VM.votionRate(m); if (opts.onRate) try { opts.onRate(VM.votionRate(m)); } catch (e) {}
      var rateBig = sbk !== 'all' ? (rate != null ? money(rate) : '—') : (lvs.length > 1 && lvs[lvs.length - 1] - lvs[0] > 0.005 ? money(lvs[0]) + '–' + money(lvs[lvs.length - 1]).replace('$', '') : lvs.length ? money(lvs[0]) : '—');
      var rateSub = sbk !== 'all' ? (rate != null ? 'per 1M VP · Votion in ' + VM.BUCKET_LABEL[sbk] : 'nothing funded for Votion in ' + VM.BUCKET_LABEL[sbk]) : (lvs.length > 1 ? 'per 1M VP · differs by bucket' : 'per 1M VP · Votion\'s pools');
      var W = walletRec();
      var head = '<div class="vmt-head"><div class="vmt-title"><i class="fas fa-store" style="color:#fbbf24"></i> Vote Market <span class="vmt-round">Round ' + esc(m.period) + (S.live ? ' · live' : '') + '</span></div>' +
        '<a class="vmt-cta" id="vmt-cta" href="' + PLAN + '"><i class="fas fa-flask"></i><span>Open the simulator<span class="sm">plan a bribe · move your votes · best split</span></span><i class="fas fa-arrow-right"></i></a></div>';
      var stats = '<div class="vmt-stats">' +
        stat('Bribes this round', money(funded, 0), n + ' funded pots · ' + (S.live ? '<span class="vmt-up">● live</span>' : 'captured')) +
        stat('Voting closes in', left(m.voteBefore) || '—', m.voteBefore ? new Date(m.voteBefore).toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC' : '') +
        stat('Votion casts in', castAt ? (Date.parse(castAt) > Date.now() ? left(castAt) : 'cast') : '—', hb != null ? 'about ' + hb + ' h before close' : '') +
        stat('A vote costs', rateBig, rateSub) + '</div>';
      var me = '';
      if (W.addr && W.rec && S.voters) { var b = best(W.rec); if (b) me = '<a class="vmt-me" id="vmt-me" href="' + PLAN + '?view=best"><i class="fas fa-wallet" style="color:#d8b4fe"></i><span><b>' + esc(W.rec.name || (W.addr.slice(0, 8) + '…')) + '</b> · your votes earn <b class="mono">' + money(b.nowUsd, 2) + '</b> this round — the best split earns <b class="mono vmt-up">' + money(b.usd, 2) + '</b> <span class="mono vmt-up">(' + sMoney(b.gain, 2) + ')</span></span><span class="go">See the split →</span></a>'; }
      else if (W.addr && !S.voters) me = '<div class="vmt-hint"><i class="fas fa-circle-notch fa-spin"></i> reading your votes…</div>';
      var seg = '<div class="vmt-seg" id="vmt-seg">' + [['board', 'This round', 'This round'], ['where', 'Where $ does the most', '$ impact'], ['votion', 'Votion\'s next move', 'Votion'], ['pots', 'Pots & rates', 'Pots']].map(function (x) { return '<button type="button" data-v="' + x[0] + '" class="' + (S.view === x[0] ? 'on' : '') + '"><span class="lg">' + x[1] + '</span><span class="sh">' + x[2] + '</span></button>'; }).join('') + '</div>';
      var body = S.view === 'board' ? boardView(m, bst) : S.view === 'votion' ? votionView(m) : S.view === 'pots' ? potsView(m) : whereView(m, W);
      var foot = '<div class="vmt-est"><i class="fas fa-circle-info"></i> Estimates — if every other vote and pot stays as it is now. Votion casts once a round; pots and votes can still change before it does.</div>';
      el.innerHTML = head + stats + me + seg + '<div id="vmt-body">' + body + '</div>' + foot;
      el.querySelectorAll('#vmt-seg [data-v]').forEach(function (bt) { bt.onclick = function () { S.view = bt.getAttribute('data-v'); S.all = false; paint(); }; });
      el.querySelectorAll('[data-amt]').forEach(function (bt) { bt.onclick = function () { S.amt = Number(bt.getAttribute('data-amt')); paint(); }; });
      var sb = el.querySelector('#vmt-bk'); if (sb) sb.onchange = function () { S.bucket = sb.value; paint(); };
      var sl = el.querySelector('#vmt-lens'); if (sl) sl.onchange = function () { S.lens = sl.value; paint(); };
      var mo = el.querySelector('#vmt-more'); if (mo) mo.onclick = function () { S.all = !S.all; paint(); };
      // the board: bucket, the what-if ($ and pool — a row is a pool picker too), which pots Votion counts
      el.querySelectorAll('[data-bb]').forEach(function (bt) { bt.onclick = function () { S.bb = bt.getAttribute('data-bb'); S.all = false; if (S.wpk && S.m.pools[S.wpk] && S.m.pools[S.wpk].bucket !== S.bb) S.wpk = null; paint(); }; });
      el.querySelectorAll('[data-wusd]').forEach(function (bt) { bt.onclick = function () { S.wusd = Number(bt.getAttribute('data-wusd')); paint(); }; });
      var wi = el.querySelector('#vmt-wusd'); if (wi) wi.onchange = function () { var v = Math.round(Number(wi.value)); if (v > 0) { S.wusd = Math.min(100000, v); paint(); } };
      var wp = el.querySelector('#vmt-wpk'); if (wp) wp.onchange = function () { S.wpk = wp.value || null; paint(); };
      el.querySelectorAll('[data-wpk]').forEach(function (rw) { var pick = function () { var k = rw.getAttribute('data-wpk'); S.wpk = S.wpk === k ? null : k; if (!(S.wusd > 0)) S.wusd = 100; paint(); };
        rw.onclick = function (e) { if (e.target && e.target.closest && e.target.closest('a,button,select,input')) return; pick(); }; rw.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }; });
      var wc = el.querySelector('#vmt-wclr'); if (wc) wc.onclick = function () { S.wpk = null; paint(); };
      el.querySelectorAll('[data-cnt]').forEach(function (bt) { bt.onclick = function () { S.cnt = bt.getAttribute('data-cnt'); paint(); }; });
    }
    function stat(k, v, s) { return '<div class="vmt-stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + (s || '') + '</div></div>'; }
    function best(rec) { var key = rec.wallet + '|' + S.live; if (S.bestKey !== key) { try { S.best = VM.bestSplitAll(S.m, rec); S.bestKey = key; } catch (e) { S.best = null; } } return S.best; }
    function tags(p, W) {
      var t = ['<span class="vmt-tag">' + esc(VM.BUCKET_LABEL[p.bucket]) + '</span>']; if (dexTag(p)) t.push('<span class="vmt-tag">' + dexTag(p) + '</span>'); if (p.grade) t.push('<span class="vmt-tag">' + esc(p.grade) + '</span>');
      var wl = (p.winding && typeof p.winding.headline === 'string' && p.winding.headline.length <= 60 ? p.winding.headline : '');   // 1.1.2: the curated one-line notice and nothing else ("Terra has moved to USDC.inj")
      if (wl) t.push('<span class="vmt-tag warn">' + esc(wl) + '</span>');
      if (p.votionExcluded) t.push('<span class="vmt-tag no">not included by Votion now</span>'); else if (p.votionUntested) t.push('<span class="vmt-tag warn">Votion untested</span>');
      if (W && W.rec && (W.rec.lp || []).some(function (l) { return l.pk === p.pk; })) t.push('<span class="vmt-tag me">your LP</span>');
      return '<div class="tags">' + t.join('') + '</div>';
    }
    // 1.2.0 — how Votion decides, in one paragraph, with the bucket's own numbers
    function ruleBox(m) {
      var L = S.levels || {}; var b = S.bucket; var head = '<b>How Votion decides.</b> It gives pools votes until every pool it uses pays the same bribe per vote';
      var tail = ' Votes already on a pool count against it: the more it holds, the bigger the pot has to be before Votion adds any.';
      if (b !== 'all') { if (L[b] == null) return '<div class="vmt-rule" data-vmt="rule">' + head + '. In ' + esc(VM.BUCKET_LABEL[b]) + ' no pot that it includes is funded this round, so its votes there stay where they are.</div>';
        var o = VM.outcome(m, b, {}); var per = o && o.activeVotes > 0 ? o.weeklyUsd / o.activeVotes * 1e6 : null;
        return '<div class="vmt-rule" data-vmt="rule">' + head + ' — <b class="mono">' + money(L[b]) + '</b> per 1M VP in ' + esc(VM.BUCKET_LABEL[b]) + ' right now.' + tail + (per != null ? ' Here 1M VP is worth about <b class="mono">' + money(per, 0) + '</b> a week in emissions to a pool.' : '') + '</div>'; }
      var parts = VM.BUCKETS.filter(function (x) { return L[x] != null; }).map(function (x) { return esc(VM.BUCKET_LABEL[x]) + ' <b class="mono">' + money(L[x]) + '</b>'; });
      return '<div class="vmt-rule" data-vmt="rule">' + head + (parts.length ? ' — per 1M VP right now: ' + parts.join(' · ') + '.' : '.') + tail + '</div>';
    }
    // where this pool stands against that rule (VoteMarket.whatItTakes — the same solve the simulator runs)
    function whyLine(m, p) {
      var key = p.pk + '|' + (m.liveAt || '') + '|' + (S.live ? 1 : 0); S.why = S.why || {}; if (S.why[key]) return S.why[key];
      var w; try { w = VM.whatItTakes(m, p.pk); } catch (e) { return ''; }
      var has = vp(w.votes) + ' VP already vote here'; var t, no = false; var bl = esc(VM.BUCKET_LABEL[p.bucket]);
      var then = function (x) { return x != null && x > 0 ? ', then about ' + money(x, 0) + ' per extra 1M VP' : ''; };
      if (w.offList) t = '<b>Off its bucket’s reward list</b> — votes here earn the pool nothing.';
      else if (w.votionExcluded) { no = true; var io = w.ifOffered || {};
        t = '<b>Votion’s optimizer is not including this pool right now</b>, so no bribe here — of any size — moves its votes until it does' + (p.votionNow >= 50000 ? '; the ' + vp(p.votionNow) + ' VP it has here leave' : '') + '.' +
          (io.votionNow >= 50000 ? ' If included: about ' + vp(io.votionNow) + ' VP here as the pot stands.' : io.entryUsd != null && io.entryUsd > 0 ? ' If included: needs about ' + money(io.entryUsd, 0) + ' more before Votion votes here' + then(io.nextMillionUsd) + '.' : ''); }
      else if (w.votionVotes >= 50000) t = 'Votion ends on <b>' + vp(w.votionVotes) + ' VP</b> here if nothing changes' + (w.nextMillionUsd != null && w.nextMillionUsd > 0 ? ' · about ' + money(w.nextMillionUsd, 0) + ' more pulls in the next 1M VP' : w.level == null ? ' — no other pot it includes is funded in ' + bl : '') + '.';
      else if (w.level == null) t = 'No pot that Votion includes is funded in ' + bl + ' this round, so the first one draws its votes there' + (w.entryUsd != null ? ' — about <b>' + money(Math.max(1, w.entryUsd), 0) + '</b> here is enough' : '') + ' (' + has + ').';
      else if (w.entryUsd != null && w.entryUsd > 0) t = (w.potUsd > 0.5 ? 'Pays ' + money(w.rate) + ' per 1M VP against Votion’s ' + money(w.level) + ' — it' : 'No pot here yet — Votion') + ' comes in after about <b>' + money(w.entryUsd, 0) + (w.potUsd > 0.5 ? ' more' : '') + '</b> (' + has + ')' + then(w.nextMillionUsd) + '.';
      else if (w.entryUsd === 0) t = 'Votion comes in on the pot as it stands.';
      else t = 'Out of reach for Votion under $5,000 — ' + has + '.';
      var h = '<div class="vmt-why' + (no ? ' no' : '') + '" data-vmt="why">' + t + '</div>'; S.why[key] = h; return h;
    }
    function more(total, shown) { return total > shown || S.all ? '<button type="button" class="vmt-more" id="vmt-more">' + (S.all ? 'show fewer' : 'show all ' + total) + '</button>' : ''; }


    // 0 · THIS ROUND (1.3.0) — one bucket, every pot: what it pays per vote, Votion's votes now → after it casts, the APR that follows, and
    // (tap a pool) the same with a bribe of yours added — every row moves, so the pool that gains reads against the pools that pay for it.
    // All of it is VoteMarket.board(): the same solve the simulator runs, in the reading chosen (the pots Votion counts now, or every pot).
    function bucketStats(m) { var o = {}; VM.BUCKETS.forEach(function (b) { var n = 0, usd = 0, out = 0; m.buckets[b].pks.forEach(function (pk) { var p = m.pools[pk]; if (p.potUsd > 0.5) { n++; usd += p.potUsd; if (p.votionExcluded) out++; } }); o[b] = { n: n, usd: usd, out: out }; }); return o; }
    function boardBucket(m, st) { if (S.bb && m.buckets[S.bb]) return S.bb; var best = VM.BUCKETS[0]; VM.BUCKETS.forEach(function (b) { if (st[b].usd > st[best].usd) best = b; }); return best; }
    function prices(m, bk, counted, pks) { var key = bk + '|' + counted + '|' + (m.liveAt || ''); S.bp = S.bp || {}; var c = S.bp[key] || (S.bp[key] = {}); var miss = pks.filter(function (pk) { return !c[pk]; });
      if (miss.length) { try { var r = VM.boardPrices(m, bk, counted, miss); miss.forEach(function (pk) { c[pk] = r[pk] || { weighed: false, entryUsd: null, nextMillionUsd: null }; }); } catch (e) {} } return c; }
    // a figure in its states: now → after Votion casts [→ with your bribe]; plain = no gain/loss colour (a rate falling is not a loss)
    function tri(a, b, c, f, eps, plain) {
      var k = function (x, y) { return plain || x == null || y == null ? '' : cls(y - x, eps); };
      return '<div class="vmt-tri"><span class="st a">' + f(a) + '</span><span class="st"><span class="ar">→</span><span class="' + k(a, b) + '">' + f(b) + '</span></span>' + (c !== undefined ? '<span class="st"><span class="ar">→</span><span class="y ' + k(b, c) + '">' + f(c) + '</span></span>' : '') + '</div>';
    }
    var rt = function (x) { return x == null || !(x > 0) ? '—' : money(x); };   // what a pot pays per 1M VP — nothing to show while there is no pot
    var vName = function (k) { return /arbluna/.test(k) ? 'arbLUNA vault' : /ampluna/.test(k) ? 'ampLUNA vault' : k; };
    var p1 = function (x) { return x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1) + '%'; };
    var names = function (xs) { xs = xs.map(esc); return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; };
    function boardView(m, st) {
      var bk = boardBucket(m, st); var q = { counted: S.cnt, all: S.all }; var tp = S.wpk && m.pools[S.wpk] && m.pools[S.wpk].bucket === bk ? m.pools[S.wpk] : null; if (tp && S.wusd > 0) { q.pk = tp.pk; q.usd = S.wusd; }
      var B = VM.board(m, bk, q); var w = B.whatIf; var all = B.counted === 'all'; var bl = esc(B.label); var P = prices(m, bk, B.counted, B.rows.map(function (r) { return r.pk; }));
      var left = B.leftOut.map(function (pk) { return m.pools[pk].name; }); var m0 = function (x) { return money(x, 0); };
      // ---- controls: bucket · what if I add $X to <pool>
      var presets = [25, 50, 100, 250, 500]; var custom = presets.indexOf(S.wusd) < 0; var inRows = {}; B.rows.forEach(function (r) { inRows[r.pk] = 1; });
      var others = m.buckets[bk].pks.filter(function (pk) { var p = m.pools[pk]; return !inRows[pk] && !p.offList && !p.winding && p.stakedUsd >= 1000; }).sort(function (a, c) { return m.pools[c].vp - m.pools[a].vp; });
      var opt = function (pk) { return '<option value="' + esc(pk) + '"' + (tp && tp.pk === pk ? ' selected' : '') + '>' + esc(m.pools[pk].name) + (dexTag(m.pools[pk]) === 'Skeleton' ? ' (Skeleton)' : '') + '</option>'; };
      var ctl = '<div class="vmt-tools vmt-btools">' +
        '<div class="grp"><span class="lb">Bucket</span><div class="vmt-bks" id="vmt-bb">' + VM.BUCKETS.map(function (b) { return '<button type="button" data-bb="' + b + '" class="' + (b === bk ? 'on' : '') + '">' + esc(VM.BUCKET_LABEL[b]) + '<span class="ct">' + (st[b].n ? st[b].n + (st[b].n === 1 ? ' pot' : ' pots') : 'no pots') + '</span></button>'; }).join('') + '</div></div>' +
        '<div class="grp"><span class="lb">What if I add</span><div class="vmt-amts">' + presets.map(function (v) { return '<button type="button" class="' + (S.wusd === v ? 'on' : '') + '" data-wusd="' + v + '">$' + v + '</button>'; }).join('') + '</div>' +
          '<input class="vmt-in" id="vmt-wusd" type="number" min="1" step="1" inputmode="numeric" placeholder="other $" aria-label="Another amount, in dollars"' + (custom ? ' value="' + S.wusd + '"' : '') + '></div>' +
        '<div class="grp"><span class="lb">to</span><select class="vmt-sel" id="vmt-wpk" aria-label="The pool to add the bribe to"><option value="">pick a pool…</option>' + B.rows.filter(function (r) { return !r.offList; }).map(function (r) { return opt(r.pk); }).join('') + (others.length ? '<optgroup label="Other ' + bl + ' pools">' + others.map(opt).join('') + '</optgroup>' : '') + '</select>' +
          (tp ? '<button type="button" class="vmt-x" id="vmt-wclr">clear</button>' : '') + '</div></div>';
      // ---- 1.4.0: far fewer words. One line for the rule (the rest folds away), four columns, one short caption a row, and the pools
      // Votion's optimizer is not including in a group of their own — said once, at the group — instead of a sentence on every row.
      var rule = '<div class="vmt-rule" data-vmt="rule"><b>Votion’s rule:</b> it spreads its votes so every pool it votes pays the same bribe per vote' +
        (B.level != null ? ' — about <b class="mono">' + money(B.level) + '</b> per 1M VP in ' + bl + (all ? ' if every pot were included' : '') + '.' : '. No pot it includes is funded in ' + bl + ' yet, so its votes there stay put.') +
        '<details class="vmt-dt"><summary>more</summary>Votes already on a pool count against it: the more it holds, the bigger the pot has to be before Votion adds any.' + (B.perMillionWeekly != null ? ' In ' + bl + ' 1M VP is worth about <b class="mono">' + m0(B.perMillionWeekly) + '</b> a week in emissions to a pool.' : '') +
        ' Every figure here is an estimate: all other votes and pots as they are now.</details></div>';
      // ---- the what-if, in three short lines: what your bribe does · who pays for it · the totals that do not change
      var wif = '';
      if (w) { var tr = B.rows.filter(function (r) { return r.target; })[0] || {}; var pr = P[w.pk] || {}; var head = '<b>+' + m0(w.usd) + ' on ' + esc(w.name) + '</b> → '; var apr2 = function (a, b) { return a != null && b != null ? ' · APR ' + pct(a) + ' → ' + pct(b) : ''; };
        var sim = '<a href="' + planUrl(w.pk, w.usd) + '">Open in the simulator →</a>'; var same = Math.abs(w.votionSum1 - w.votionSum0) < 1000;
        var lose = w.losers.slice(0, 4).map(function (x) { return esc(x.name) + ' <span class="vmt-dn mono">' + sMoney(x.dWeekly, 0) + '</span>' + (x.apr0 != null && x.apr1 != null ? ' (APR ' + pct(x.apr0) + ' → ' + pct(x.apr1) + ')' : ''); }).join(' · ') + (w.losers.length > 4 ? ' · and ' + (w.losers.length - 4) + ' more' : '');
        var ck = '<span class="ck" data-vmt="check">Nothing is created: ' + (same ? 'Votion still votes ' + vp(w.votionSum1) + ' VP' : 'Votion votes ' + vp(w.votionSum1) + ' VP (' + vp(w.votionSum0) + ' without your bribe)') + ' and ' + bl + ' still pays ' + m0(w.weeklySum1) + ' — gains ' + sMoney(w.gainSum, 0) + ', losses ' + sMoney(w.lossSum, 0) + '. ' + sim + '</span>';
        if (w.offList) wif = head + 'nothing: this pool is off its bucket’s reward list, so votes here earn it nothing.';
        else if (!w.counted) { var o = w.other;
          wif = head + '<b>nothing moves.</b> Votion’s optimizer is not including this pool right now, so it cannot react to a bribe of any size. The bribe goes to the ' + vp(w.votes1) + ' VP already on the pool.' +
            (o ? '<span class="l2">' + (Math.abs(o.votionIn) >= 20000 ? 'If it were included: Votion <b>' + sVp(o.votionIn) + ' VP</b>' + apr2(o.apr0, o.apr1) + ' · <b>' + sMoney(o.weeklyGain, 0) + '</b> to its LPs next epoch.' : 'If it were included, this amount would still be too small for Votion.') + ' <button type="button" class="lnk" data-cnt="all">See the round that way</button></span>' : ''); }
        else if (Math.abs(w.votionIn) < 20000) wif = head + (w.votion0 >= 50000 ? 'Votion’s ' + vp(w.votion0) + ' VP here barely move.' : '<b>not enough for Votion.</b>' + (tr.rateSim != null && B.levelSim != null ? ' The pot would pay ' + money(tr.rateSim) + ' per 1M VP; its rate is ' + money(B.levelSim) + '.' : '') +
          (pr.entryUsd != null && pr.entryUsd > 0 ? ' It needs about <b>' + m0(pr.entryUsd) + '</b>.' : pr.entryUsd == null ? ' It is out of reach under $5,000.' : '')) + ' ' + sim;
        else wif = head + 'Votion <b>' + sVp(w.votionIn) + ' VP</b> (' + vp(w.votion0) + ' → ' + vp(w.votion1) + ')' + apr2(w.apr0, w.apr1) + ' · <b>' + sMoney(w.weeklyGain, 0) + '</b> to its LPs next epoch' + (!w.active0 && w.active1 ? ' · crosses the 1% line' : '') + '.' +
          (w.losers.length ? '<span class="l2">Paid for by: ' + lose + '</span>' : '') + (tr.potUsd > 0.5 ? '' : '<span class="l2 vmt-fl">No pot here yet — this assumes Votion includes the new one.</span>') + ck;
        wif = '<div class="vmt-wif" data-vmt="whatif">' + wif + '</div>'; }
      if (!B.rows.length) return ctl + rule + '<div class="vmt-hint" style="padding:1rem 0">No pot in ' + bl + ' yet this round, and Votion has no votes to move here.</div>';
      // ---- one row: pool · pot · Votion's votes · APR, and one short caption
      var eff = !!w && B.rows.some(function (r) { return Math.abs(r.dVotion) >= 20000 || Math.abs(r.dWeekly) >= 0.5; });   // does the bribe move anything?
      var X = function (v) { return eff ? v : undefined; };
      var row = function (r) { var p = r.pool; var pr = P[r.pk] || {}; var notNow = r.excluded && !all; var pot = r.potUsd + r.added; var o = r.other;
        var t = []; if (dexTag(p)) t.push('<span class="vmt-tag">' + dexTag(p) + '</span>'); if (p.grade) t.push('<span class="vmt-tag">' + esc(p.grade) + '</span>');
        var wl = (p.winding && typeof p.winding.headline === 'string' && p.winding.headline.length <= 60 ? p.winding.headline : ''); if (wl) t.push('<span class="vmt-tag warn">' + esc(wl) + '</span>');
        if (r.target) t.push('<span class="vmt-tag you">your +' + m0(r.added) + '</span>');
        if (r.offList) t.push('<span class="vmt-tag no">off the reward list</span>'); else if (r.excluded && all) t.push('<span class="vmt-tag no">not included now</span>');
        if (!r.offList && !(w ? r.activeSim : r.activePlan)) t.push('<span class="vmt-tag warn">under the 1% line</span>');
        var tok = r.tokens.slice(0, 2).map(function (x) { return vp(x.amount) + ' ' + x.sym; }).join(' · ');
        var cPot = '<div class="bc c-pot"><span class="k-sm">Pot</span><div class="vv"><div class="vmt-big" style="font-size:.95rem">' + (r.potUsd > 0.5 ? money(r.potUsd) : '<span class="vmt-fl">no pot</span>') + (r.added ? ' <span class="vmt-am" style="white-space:nowrap">+' + m0(r.added) + '</span>' : '') + '</div>' +
          (tok ? '<div class="vmt-sub">' + esc(tok) + (p.potPricedBy === 'votion' ? ' · Votion’s price' : '') + '</div>' : '') + (r.potUsd > 0.5 && r.rateNow != null ? '<div class="vmt-sub" style="white-space:nowrap">' + money(r.rateNow) + ' per 1M VP</div>' : '') + '</div></div>';
        var dv = eff ? r.dVotion : r.votionPlan - r.votionNow; var quiet = r.votionNow < 50000 && r.votionPlan < 50000 && (!w || r.votionSim < 50000);
        var vSub = quiet ? '' : eff ? (Math.abs(dv) >= 20000 ? '<span class="' + cls(dv) + '">' + sVp(dv) + '</span> with your bribe' : 'unchanged by your bribe') : (Math.abs(dv) >= 20000 ? '<span class="' + cls(dv) + '">' + sVp(dv) + '</span>' : 'stays');
        var cVot = '<div class="bc c-vot"><span class="k-sm">Votion’s votes</span><div class="vv">' + (quiet ? '<div class="vmt-tri"><span class="a">none</span></div>' : tri(r.votionNow, r.votionPlan, X(r.votionSim), vp, 20000)) + (vSub ? '<div class="vmt-sub">' + vSub + '</div>' : '') + '</div></div>';
        var cApr = '<div class="bc c-apr"><span class="k-sm">APR to LPs</span><div class="vv">' + (r.aprNow == null && r.aprPlan == null ? '<div class="vmt-tri"><span class="a">—</span></div>' : tri(r.aprNow, r.aprPlan, X(r.aprSim), pct, 0.5)) + '<div class="vmt-sub">' + m0(r.weeklyNow) + ' → ' + m0(r.weeklyPlan) + (eff ? ' → ' + m0(r.weeklySim) : '') + ' /wk' + (r.aprPlan == null ? ' · under $1,000 staked' : '') + '</div></div></div>';
        // the caption: one short line, only where it adds something the figures do not say
        var cap = ''; var L1 = w && B.levelSim != null ? B.levelSim : B.level;
        if (r.offList) cap = 'Off its bucket’s reward list — votes here earn the pool nothing.';
        else if (notNow) { var po = (prices(m, bk, 'all', [r.pk])[r.pk]) || {}; var ov = o ? (w && r.target && o.votionSim != null ? o.votionSim : o.votionPlan) : 0, oa = o ? (w && r.target && o.aprSim != null ? o.aprSim : o.aprPlan) : null;
          cap = (r.votionNow >= 50000 ? 'Votion’s ' + vp(r.votionNow) + ' VP here leave. ' : '') + (ov >= 50000 ? 'If included: about <b>' + vp(ov) + ' VP</b>' + (oa != null ? ' · APR ' + pct(oa) : '') + '.' : po.entryUsd != null && po.entryUsd > 0 && !(w && r.target) ? 'If included: needs about <b>' + m0(po.entryUsd) + ' more</b> before Votion votes here.' : 'If included: still too small for Votion.'); }
        else if (!(pot > 0.5)) cap = w && r.votionPlan >= 50000 && r.votionSim < 50000 ? 'No pot — your bribe gives Votion somewhere to go, and it leaves.' : r.votionPlan >= 50000 ? 'No pot — Votion is not re-voting, so its votes stay.' : r.votionNow >= 50000 ? 'No pot — Votion’s votes leave.' : '';
        else if (w && r.target) cap = r.votionSim >= 50000 ? 'Votion fills it to <b>' + vp(r.votesSim) + '</b> votes — ' + money(r.rateSim) + ' per 1M VP.' : 'Pays ' + money(r.rateSim) + ' per 1M VP — still under Votion’s ' + money(L1) + '.' + (pr.entryUsd != null && pr.entryUsd > 0 ? ' Needs about <b>' + m0(pr.entryUsd) + '</b> in all.' : '');
        else if (w && r.votionPlan >= 50000 && r.votionSim < 50000) cap = 'Pays ' + money(r.rateSim) + ' per 1M VP — under Votion’s new rate (' + money(L1) + '), so <b>Votion leaves</b>.';
        else if (r.votionPlan >= 50000) cap = pr.nextMillionUsd != null && pr.nextMillionUsd > 0 && !w ? 'The next 1M VP costs about <b>' + m0(pr.nextMillionUsd) + '</b> more.' : '';
        else cap = 'Pays ' + money(r.ratePlan) + ' per 1M VP — under Votion’s ' + money(B.level) + '.' + (pr.entryUsd != null && pr.entryUsd > 0 ? ' Needs about <b>' + m0(pr.entryUsd) + ' more</b> before Votion votes here.' : pr.weighed && pr.entryUsd == null ? ' Out of reach under $5,000.' : '');
        return '<div class="vmt-brow' + (eff ? ' w3' : '') + (r.target ? ' tg' : '') + (notNow ? ' out' : '') + '" data-wpk="' + esc(r.pk) + '" data-grp="' + (notNow ? 'out' : r.counted ? 'in' : 'none') + '" role="button" tabindex="0" title="Try a bribe on ' + esc(r.name) + '">' +
          '<div style="min-width:0"><div class="nm">' + esc(r.name) + '</div><div class="tags">' + t.join('') + '</div></div>' + cPot + cVot + cApr +
          (cap ? '<div class="vmt-bwhy" data-vmt="bwhy">' + cap + '</div>' : '') + '</div>'; };
      // ---- the groups: pots Votion is weighing · pots its optimizer is not including right now · pools with no pot
      var gIn = B.rows.filter(function (r) { return r.counted; }), gOut = all ? [] : B.rows.filter(function (r) { return r.excluded && !r.offList; }), gNone = B.rows.filter(function (r) { return !r.counted && !(r.excluded && !r.offList && !all); });
      var pots = function (n) { return n + (n === 1 ? ' pot' : ' pots'); };
      var headRow = '<div class="vmt-brow head' + (eff ? ' w3' : '') + '"><span>Pool</span><span>Pot</span><span>Votion’s votes</span><span>APR to LPs</span></div>';
      var grp = function (k, title, extra) { return '<div class="vmt-grp' + (k === 'out' ? ' out' : '') + '" data-vmt="grp-' + k + '">' + title + '</div>' + (extra || ''); };
      var leg = '<div class="vmt-leg" data-vmt="legend">Each figure: <b style="color:#cbd5e1">now → next epoch, after Votion votes</b>' + (eff ? ' → <span class="y">with your ' + m0(w.usd) + '</span>' : w ? '' : ' · tap a pool to try a bribe on it') + '</div>';
      var allBar = all ? '<div class="vmt-read" data-vmt="read"><b>What-if view</b> — as if Votion’s optimizer included all ' + pots(B.funded) + '. Right now it does not include <b>' + names(left) + '</b>. <button type="button" class="lnk" data-cnt="published">Back to what Votion publishes</button></div>' : '';
      var outNote = gOut.length ? '<div class="vmt-gnote" data-vmt="read">' + (gOut.length === 1 ? 'This pool has a pot' : 'These pools have a pot') + ', but Votion’s optimizer is <b>not including ' + (gOut.length === 1 ? 'it' : 'them') + ' right now</b>, so no bribe here — of any size — moves its votes until it does. It normally includes every pot; its output does not say why. <button type="button" class="lnk" data-cnt="all">See the round as if ' + (gOut.length === 1 ? 'it were' : 'they were') + ' included</button></div>' : '';
      var hold = B.vaults.length && B.vaults.every(function (v) { return v.moves === false; }) && !w && B.level != null ? '<div class="vmt-hint">Votion is not re-voting ' + bl + ' as things stand — a vault moves only when it gains more than $' + (m.moveRule && m.moveRule.gain_usd_gt != null ? m.moveRule.gain_usd_gt : 0.05) + ' and its split would change by more than ' + (m.moveRule && m.moveRule.deviation_pct_gt != null ? m.moveRule.deviation_pct_gt : 5) + '%.</div>' : '';
      var body = (gIn.length ? grp('in', all ? 'If every pot were included · ' + pots(gIn.length) : 'Votion is weighing ' + (gIn.length === 1 ? 'this' : 'these') + ' · ' + pots(gIn.length)) + gIn.map(row).join('') : '') +
        (gOut.length ? grp('out', 'Not included by Votion’s optimizer right now · ' + pots(gOut.length), outNote) + gOut.map(row).join('') : '') +
        (gNone.length ? grp('none', 'No pot this round · ' + gNone.length + (gNone.length === 1 ? ' pool' : ' pools')) + gNone.map(row).join('') : '');
      var T = B.totals; var moved = Math.abs(T.votionPlan - T.votionNow) < 1000 && (!w || Math.abs(T.votionSim - T.votionPlan) < 1000);
      var tot = '<div class="vmt-brow tot' + (eff ? ' w3' : '') + '" data-vmt="totals"><div style="min-width:0"><div class="nm">All of ' + bl + '</div><div class="vmt-sub">' + B.pools + ' pools · ' + vp(T.votesNow) + ' votes</div></div>' +
        '<div class="bc"><span class="k-sm">Pots</span><div class="vv mono">' + m0(B.potUsd) + (w ? ' <span class="vmt-am">+' + m0(w.usd) + '</span>' : '') + '</div></div>' +
        '<div class="bc"><span class="k-sm">Votion’s votes</span><div class="vv">' + tri(T.votionNow, T.votionPlan, eff ? T.votionSim : undefined, vp, 0, true) + '</div></div>' +
        '<div class="bc"><span class="k-sm">Emissions /wk</span><div class="vv">' + tri(T.weeklyNow, T.weeklyPlan, eff ? T.weeklySim : undefined, m0, 0, true) + '</div></div>' +
        '<div class="vmt-bwhy">' + (moved ? 'Votion’s votes only move between pools, and the' : 'The') + ' bucket’s emissions are only re-divided: what one pool gains, the others give up.</div></div>';
      var moreB = B.hidden > 0 || S.all ? '<button type="button" class="vmt-more" id="vmt-more">' + (S.all ? 'show only pools with a pot or Votion votes' : 'show the other ' + B.hidden + ' ' + bl + ' pools') + '</button>' : '';
      // ---- to check against the source: each vault's own split as Votion's page shows it (now → its published plan), folded away
      var page = B.vaults.map(function (v) { var ls = B.rows.map(function (r) { var x = r.vaults.filter(function (y) { return y.key === v.key; })[0]; return x && (x.nowPct >= 0.05 || (x.publishedPct != null && x.publishedPct >= 0.05)) ? esc(r.name) + ' ' + p1(x.nowPct) + (x.publishedPct == null ? '' : ' → ' + p1(x.publishedPct)) : null; }).filter(Boolean);
        return ls.length ? '<div><b>' + vName(v.key) + '</b> (' + vp(v.vp) + ' VP): ' + ls.join(' · ') + '</div>' : ''; }).join('');
      var verify = page ? '<details class="vmt-dt vmt-page" data-vmt="page"><summary>Check against Votion’s own page</summary>' + page + '<div style="margin-top:.3rem">Each vault’s % now → its published plan. Votion’s page plans each vault as if the other stood still; they vote one after the other, so the table above is the result once both have, and a vault’s own split can land differently.</div></details>' : '';
      return ctl + rule + allBar + wif + leg + hold + headRow + body + tot + moreB + verify;
    }

    // 1 · where $X does the most — the planner's overview, top 8, each row opens the simulator on that pool with $X added
    function whereView(m, W) {
      var lenses = VM.LENSES.filter(function (L) { return !L.needsWallet || W.rec; }); if (!lenses.some(function (L) { return L.key === S.lens; })) S.lens = 'impact';
      var L = lenses.filter(function (x) { return x.key === S.lens; })[0];
      var rows = VM.lens(m, { lens: S.lens, bucket: S.bucket, usd: S.amt, wallet: W.rec, limit: S.all ? 40 : 8 });
      var total = S.all ? rows.length : VM.lens(m, { lens: S.lens, bucket: S.bucket, usd: S.amt, wallet: W.rec, limit: 40 }).length;
      var metric = function (r) { var p = r.pool, im = r.im;
        if (S.lens === 'liquidity') return [money(p.depthUsd, 0), 'depth', p.depthUsd];
        if (S.lens === 'volume') return [money(p.vol7dUsd, 0), 'traded /wk', p.vol7dUsd || 0];
        if (S.lens === 'leaving') { var d = p.votionPlan - p.votionNow; return ['<span class="vmt-dn">' + sVp(d) + '</span>', 'Votion leaving', -d]; }
        if (S.lens === 'mine') { var pos = (W.rec.lp || []).filter(function (l) { return l.pk === p.pk; }).reduce(function (s, l) { return s + l.usd; }, 0); return [money(pos, 0), 'your LP', pos]; }
        return ['<span class="' + cls(im.emissionsBought, 0.5) + '">' + sMoney(im.emissionsBought, 0) + '</span><span class="vmt-sub">/wk</span>', 'to its LPs', Math.max(0, im.emissionsBought)]; };
      var mx = Math.max.apply(null, [1].concat(rows.map(function (r) { return metric(r)[2]; })));
      var ctl = '<div class="vmt-tools">' +
        '<div class="grp"><span class="lb">Add</span><div class="vmt-amts">' + [25, 50, 100, 250, 500].map(function (v) { return '<button type="button" class="' + (S.amt === v ? 'on' : '') + '" data-amt="' + v + '">$' + v + '</button>'; }).join('') + '</div></div>' +
        '<div class="grp"><span class="lb">Bucket</span><select class="vmt-sel" id="vmt-bk" aria-label="Bucket">' + [['all', 'All buckets']].concat(VM.BUCKETS.map(function (b) { return [b, VM.BUCKET_LABEL[b]]; })).map(function (x) { return '<option value="' + x[0] + '"' + (S.bucket === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="grp"><span class="lb">Rank by</span><select class="vmt-sel" id="vmt-lens" aria-label="Rank by">' + lenses.map(function (x) { return '<option value="' + x.key + '"' + (S.lens === x.key ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></div></div>' +
        ruleBox(m) +
        (L ? '<div class="vmt-hint">' + esc(L.hint.charAt(0).toUpperCase() + L.hint.slice(1)) + ' · click a pool to open it in the simulator' + (S.lens === 'impact' ? ' with $' + S.amt + ' added' : '') + '</div>' : '');
      if (!rows.length) return ctl + '<div class="vmt-hint" style="padding:1rem 0">' + (S.lens === 'mine' ? 'This wallet has no LP positions in TLA pools on record.' : 'No pools fit this lens right now.') + '</div>';
      var bribe = ['impact', 'underdogs', 'pd'].indexOf(S.lens) >= 0 ? S.amt : 0;
      var headRow = '<div class="vmt-row head"><span></span><span>Pool</span><span>' + (S.lens === 'impact' || S.lens === 'underdogs' || S.lens === 'pd' ? '$' + S.amt + ' buys (emissions)' : L ? esc(L.label) : '') + '</span><span>APR next epoch</span><span>Votion if +$' + S.amt + '</span><span></span></div>';
      return ctl + headRow + rows.map(function (r, i) { var p = r.pool, im = r.im, mt = metric(r);
        return '<a class="vmt-row" data-pk="' + esc(p.pk) + '" href="' + planUrl(p.pk, bribe) + '"><span class="n">' + (i + 1) + '</span>' +
          '<div style="min-width:0"><div class="nm">' + esc(p.name) + '</div>' + tags(p, W) + '</div>' +
          '<div class="c-main"><div class="vmt-big">' + mt[0] + '</div><div class="vmt-bar"><i style="width:' + Math.max(2, Math.min(100, mt[2] / mx * 100)) + '%;background:' + (S.lens === 'leaving' ? 'var(--vmt-dn)' : 'var(--vmt-cy)') + '"></i></div></div>' +
          '<div class="c-apr"><span class="k-sm">APR</span><span class="vmt-big" style="font-size:.95rem">' + pct(im.apr0) + ' <span class="vmt-fl">→</span> <span class="' + cls((im.apr1 || 0) - (im.apr0 || 0), 0.5) + '">' + pct(im.apr1) + '</span></span>' + (!im.active0 && im.active1 ? '<div class="vmt-sub vmt-up">crosses the 1% line</div>' : !im.active1 ? '<div class="vmt-sub">under 1%</div>' : '') + '</div>' +
          '<div class="c-vot"><span class="k-sm">Votion</span><span class="vmt-big ' + (p.votionExcluded ? 'vmt-fl' : cls(im.votionIn, 20000)) + '" style="font-size:.95rem">' + (p.votionExcluded ? 'not included' : sVp(im.votionIn)) + '</span><div class="vmt-sub">pot ' + money(p.potUsd, 0) + '</div></div>' +
          '<div class="c-go"><span class="vmt-plan">Simulate →</span></div>' + whyLine(m, p) + '</a>'; }).join('') + more(total, rows.length);
    }
    // 2 · Votion's next move if nothing changes — its published plan vs its votes now, in real VP, and what that does to each pool's emissions
    function votionView(m) {
      var mv = VM.votionMoves(m, 'all'); var shown = S.all ? mv : mv.slice(0, 8);
      if (!mv.length) return '<div class="vmt-hint" style="padding:1rem 0">Votion plans no moves this round.</div>';
      var mx = Math.max.apply(null, [1].concat(mv.map(function (x) { return Math.abs(x.d); })));
      return '<div class="vmt-hint">Where Votion\'s votes end up when its two vaults cast, if nothing else changes — its rule, one vault after the other (the same figures as This round). Click a pool to test a bribe against it.</div>' +
        '<div class="vmt-row head"><span></span><span>Pool</span><span>Votion moves</span><span>Votion votes</span><span>LPs /wk</span><span></span></div>' +
        shown.map(function (x, i) { var p = m.pools[x.pk]; var epv = p.vp > 0 && p.weeklyUsdNow > 0 ? p.weeklyUsdNow / p.vp : null;
          return '<a class="vmt-row" data-pk="' + esc(x.pk) + '" href="' + planUrl(x.pk, 0) + '"><span class="n">' + (i + 1) + '</span>' +
            '<div style="min-width:0"><div class="nm">' + esc(x.name) + '</div>' + tags(p) + '</div>' +
            '<div class="c-main"><div class="vmt-big ' + (x.d > 0 ? 'vmt-up' : 'vmt-dn') + '">' + sVp(x.d) + '</div><div class="vmt-bar"><i style="width:' + Math.max(3, Math.abs(x.d) / mx * 100) + '%;background:' + (x.d > 0 ? 'var(--vmt-up)' : 'var(--vmt-dn)') + '"></i></div></div>' +
            '<div class="c-apr"><span class="k-sm">Votion</span><span class="vmt-big" style="font-size:.95rem">' + vp(x.now) + ' <span class="vmt-fl">→</span> ' + vp(x.plan) + '</span></div>' +
            '<div class="c-vot"><span class="k-sm">LPs</span><span class="vmt-big ' + (x.d > 0 ? 'vmt-up' : 'vmt-dn') + '" style="font-size:.95rem">' + (epv != null ? sMoney(x.d * epv, 0) : '—') + '</span><div class="vmt-sub">emissions /wk</div></div>' +
            '<div class="c-go"><span class="vmt-plan">Simulate →</span></div></a>'; }).join('') + more(mv.length, shown.length);
    }
    // 3 · pots & rates — what is funded for the round, what a vote costs on each pool against Votion's going rate
    function potsView(m) {
      var L = S.levels || {};
      var ps = Object.keys(m.pools).map(function (k) { return m.pools[k]; }).filter(function (p) { return p.potUsd > 0.5 || (p.votionNow > 50000 && !p.votionExcluded); }).sort(function (a, b) { return (b.potUsd - a.potUsd) || (b.votionNow - a.votionNow); });
      var shown = S.all ? ps : ps.slice(0, 8);
      return ruleBox(m) + '<div class="vmt-hint">Pots funded for round ' + esc(m.period) + ' and what a vote earns on each, against Votion\'s rate in that pool\'s bucket.</div>' +
        '<div class="vmt-row head"><span></span><span>Pool</span><span>Pot</span><span>Votes now</span><span>$ / 1M VP</span><span></span></div>' +
        shown.map(function (p, i) { var per = p.potUsd > 0 && p.vp > 50000 ? p.potUsd / (p.vp / 1e6) : null; var unf = !(p.potUsd > 0.5) && p.votionNow > 50000; var rate = L[p.bucket];
          return '<a class="vmt-row" data-pk="' + esc(p.pk) + '" href="' + planUrl(p.pk, 0) + '"><span class="n">' + (i + 1) + '</span>' +
            '<div style="min-width:0"><div class="nm">' + esc(p.name) + '</div>' + tags(p) + '</div>' +
            '<div class="c-main"><div class="vmt-big">' + (unf ? '<span class="vmt-am">not funded</span>' : money(p.potUsd, p.potUsd >= 100 ? 0 : 2)) + '</div><div class="vmt-sub">' + (unf ? 'Votion\'s ' + vp(p.votionNow) + ' leaves' : esc((p.pot && p.pot.tokens || []).slice(0, 2).map(function (t) { return vp(t.amount) + ' ' + t.sym; }).join(' · ')) + (p.potPricedBy === 'votion' ? ' · Votion\'s price' : '')) + '</div></div>' +
            '<div class="c-apr"><span class="k-sm">Votes</span><span class="vmt-big" style="font-size:.95rem">' + vp(p.vp) + '</span><div class="vmt-sub">' + (p.votionNow > 50000 ? 'Votion ' + vp(p.votionNow) : 'LP-voted') + '</div></div>' +
            '<div class="c-vot"><span class="k-sm">$/1M</span><span class="vmt-big" style="font-size:.95rem">' + (per != null ? money(per) : '—') + '</span>' + (per != null && rate ? '<div class="vmt-sub ' + (per >= rate ? 'vmt-up' : 'vmt-am') + '">Votion\'s rate ' + money(rate) + '</div>' : '') + '</div>' +
            '<div class="c-go"><span class="vmt-plan">Simulate →</span></div>' + whyLine(m, p) + '</a>'; }).join('') + more(ps.length, shown.length);
    }

    paint();
    if (!S.m) {
      VM.load({}).then(function (m) { S.m = m; paint(); live(); m.loadVoters().then(function () { S.voters = true; paint(); }).catch(function () {}); })
        .catch(function (e) { el.innerHTML = '<div class="vmt-hint" style="padding:1rem 0">The Vote Market\'s data is unavailable right now (' + esc(e.message) + '). <a href="' + PLAN + '" style="color:#fcd34d">Open the simulator →</a></div>'; });
    } else if (S.m.voters) { S.voters = true; paint(); }
    function live() { VM.fetchLivePots(S.m).then(function (l) { if (l) { VM.applyLivePots(S.m, l); S.live = true; S.bestKey = ''; S.why = {}; S.bp = {}; paint(); } }).catch(function () {}); }
    api.live = function () { if (S.m) live(); };
    return api;
  }
  return { VERSION: VERSION, mount: mount };
});
