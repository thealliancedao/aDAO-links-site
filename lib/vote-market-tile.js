/* lib/vote-market-tile.js — the Vote Market overview tile (TLA Stats), on the same engine as the simulator (lib/vote-market.js).
 * One set of numbers everywhere: pots, Votion's moves (in real VP), APRs and the best split come from VoteMarket, never from a second model.
 * VoteMarketTile.mount(root, { planner, getWallet, model, onRate }) → { refresh(), model }
 *   planner   — the simulator's URL (default /vote-market.html)
 *   getWallet — () => the selected terra address or null (read only)
 *   model     — a prebuilt VoteMarket model (tests); otherwise VoteMarket.load() + the live pots
 *   onRate    — (usdPer1mVp) => void, Votion's going rate for the page's other tiles
 * 1.0.0 (2026-09-27): replaces the tile's own solver — three views (Where $ does the most · Votion's next move · Pots), a wallet teaser
 * for the best split, and the simulator one tap away from every row. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.VoteMarketTile = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.0.0';
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
    '.vmt-chips{display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;margin-bottom:.45rem}' +
    '.vmt-chip{font-size:.75rem;padding:.2rem .65rem;border-radius:999px;background:rgba(255,255,255,.05);color:var(--vmt-mut);border:1px solid transparent;cursor:pointer;white-space:nowrap}' +
    '.vmt-chip.on{background:rgba(34,211,238,.14);color:#67e8f9;border-color:rgba(34,211,238,.35)}.vmt-chip.amt.on{background:rgba(251,191,36,.14);color:#fde68a;border-color:rgba(251,191,36,.4)}' +
    '.vmt-lab{font-size:.72rem;color:var(--vmt-dim);margin-right:.15rem;white-space:nowrap;min-width:2.9rem}' +
    '.vmt-hint{font-size:.72rem;color:var(--vmt-dim);margin:.1rem 0 .4rem}' +
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
    '.vmt-foot{display:flex;align-items:center;gap:.9rem;margin-top:.8rem;padding:.8rem .95rem;border-radius:.85rem;background:linear-gradient(135deg,rgba(245,158,11,.16),rgba(251,191,36,.07));border:1px solid rgba(251,191,36,.4);text-decoration:none;color:inherit}' +
    '.vmt-foot:hover{background:linear-gradient(135deg,rgba(245,158,11,.24),rgba(251,191,36,.1))}' +
    '.vmt-foot .ic{width:2.4rem;height:2.4rem;border-radius:.7rem;background:rgba(251,191,36,.2);color:#fcd34d;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex:0 0 auto}' +
    '.vmt-foot b{display:block;color:#fde68a;font-size:1rem}.vmt-foot span.d{font-size:.78rem;color:var(--vmt-mut)}.vmt-foot .ar{margin-left:auto;color:#fcd34d;font-size:1.3rem}' +
    '.vmt-est{font-size:.72rem;color:#fcd34d;opacity:.85;margin-top:.55rem}' +
    '.vmt-more{display:block;margin:.4rem auto 0;font-size:.7rem;padding:.25rem .8rem;border-radius:999px;background:rgba(255,255,255,.05);color:var(--vmt-mut);border:0;cursor:pointer}' +
    '.vmt-row .k-sm{display:none;font-size:.7rem;color:var(--vmt-dim)}.vmt-seg .sh{display:none}' +
    '@media (max-width:760px){' +
      '.vmt-seg .lg{display:none}.vmt-seg .sh{display:inline}.vmt-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:.15rem}.vmt-chips::-webkit-scrollbar{display:none}' +
      '.vmt-stats{grid-template-columns:1fr 1fr}.vmt-cta{width:100%;justify-content:center}' +
      '.vmt-row{grid-template-columns:1.1rem minmax(0,1fr) auto;gap:.2rem .6rem;padding:.6rem .3rem}.vmt-row.head{display:none}' +
      '.vmt-row .c-apr,.vmt-row .c-vot{grid-column:2/3;display:flex;gap:.4rem;align-items:baseline}.vmt-row .c-apr .vmt-sub,.vmt-row .c-vot .vmt-sub{display:inline}' +
      '.vmt-row .c-main{grid-column:3/4;grid-row:1/2;text-align:right}.vmt-row .c-go{grid-column:3/4;grid-row:2/4;align-self:center;text-align:right}' +
      '.vmt-row .c-apr .vmt-big,.vmt-row .c-vot .vmt-big{font-size:.85rem}.vmt-row .k-sm{display:inline}.vmt-seg button{font-size:.76rem}' +
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
    var S = { view: 'where', amt: 50, bucket: 'all', lens: 'impact', all: false, m: opts.model || null, live: false, voters: false, best: null, bestKey: '' };
    var api = { refresh: paint, get model() { return S.m; }, state: S };
    el.classList.add('vmt');
    function walletRec() { var w = opts.getWallet ? opts.getWallet() : null; return w && S.m && S.m.voters ? { addr: w, rec: S.m.voters[w] || null } : { addr: w, rec: null }; }
    function planUrl(pk, bribe) { var q = []; if (pk) q.push('pool=' + encodeURIComponent(pk)); if (bribe) q.push('bribe=' + bribe); return PLAN + (q.length ? '?' + q.join('&') : ''); }

    function paint() {
      if (!S.m) { el.innerHTML = '<div class="vmt-hint" style="padding:1.5rem 0">Loading the Vote Market…</div>'; return; }
      var m = S.m; var funded = 0, n = 0; Object.keys(m.pools).forEach(function (k) { var p = m.pools[k]; funded += p.potUsd || 0; if (p.potUsd > 0.5) n++; });
      var casts = (m.moveRuleDoc && m.moveRuleDoc.timing && m.moveRuleDoc.timing.casts) || []; var hs = casts.filter(function (c) { return c.hours_before_deadline > 0 && c.hours_before_deadline < 6; }).map(function (c) { return c.hours_before_deadline; }).sort(function (a, b) { return a - b; }); var hb = hs.length ? hs[Math.floor(hs.length / 2)] : null;
      var castAt = m.voteBefore && hb != null ? new Date(Date.parse(m.voteBefore) - hb * 36e5).toISOString() : null;
      var rate = VM.votionRate(m); if (opts.onRate) try { opts.onRate(rate); } catch (e) {}
      var W = walletRec();
      var head = '<div class="vmt-head"><div class="vmt-title"><i class="fas fa-store" style="color:#fbbf24"></i> Vote Market <span class="vmt-round">Round ' + esc(m.period) + (S.live ? ' · live' : '') + '</span></div>' +
        '<a class="vmt-cta" id="vmt-cta" href="' + PLAN + '"><i class="fas fa-flask"></i><span>Open the simulator<span class="sm">plan a bribe · move your votes · best split</span></span><i class="fas fa-arrow-right"></i></a></div>';
      var stats = '<div class="vmt-stats">' +
        stat('Bribes this round', money(funded, 0), n + ' funded pots · ' + (S.live ? '<span class="vmt-up">● live</span>' : 'captured')) +
        stat('Voting closes in', left(m.voteBefore) || '—', 'Sunday ~21:20 UTC') +
        stat('Votion casts in', castAt ? (Date.parse(castAt) > Date.now() ? left(castAt) : 'cast') : '—', hb != null ? 'about ' + hb + ' h before close' : '') +
        stat('A vote costs', rate != null ? money(rate) : '—', 'per 1M VP · Votion\'s pools') + '</div>';
      var me = '';
      if (W.addr && W.rec && S.voters) { var b = best(W.rec); if (b) me = '<a class="vmt-me" id="vmt-me" href="' + PLAN + '?view=best"><i class="fas fa-wallet" style="color:#d8b4fe"></i><span><b>' + esc(W.rec.name || (W.addr.slice(0, 8) + '…')) + '</b> · your votes earn <b class="mono">' + money(b.nowUsd, 2) + '</b> this round — the best split earns <b class="mono vmt-up">' + money(b.usd, 2) + '</b> <span class="mono vmt-up">(' + sMoney(b.gain, 2) + ')</span></span><span class="go">See the split →</span></a>'; }
      else if (W.addr && !S.voters) me = '<div class="vmt-hint"><i class="fas fa-circle-notch fa-spin"></i> reading your votes…</div>';
      var seg = '<div class="vmt-seg" id="vmt-seg">' + [['where', 'Where $ does the most', 'Where $ goes'], ['votion', 'Votion\'s next move', 'Votion\'s move'], ['pots', 'Pots & rates', 'Pots']].map(function (x) { return '<button type="button" data-v="' + x[0] + '" class="' + (S.view === x[0] ? 'on' : '') + '"><span class="lg">' + x[1] + '</span><span class="sh">' + x[2] + '</span></button>'; }).join('') + '</div>';
      var body = S.view === 'votion' ? votionView(m) : S.view === 'pots' ? potsView(m, rate) : whereView(m, W);
      var foot = '<a class="vmt-foot" id="vmt-foot" href="' + PLAN + '"><span class="ic"><i class="fas fa-flask"></i></span><span><b>Try it in the simulator</b><span class="d">Pick a pool, add a bribe, move your votes — see what Votion does, what comes back to you, and the APRs. Works with or without a wallet.</span></span><span class="ar"><i class="fas fa-arrow-right"></i></span></a>' +
        '<div class="vmt-est"><i class="fas fa-circle-info"></i> Estimates — if every other vote and pot stays as it is now.</div>';
      el.innerHTML = head + stats + me + seg + '<div id="vmt-body">' + body + '</div>' + foot;
      el.querySelectorAll('#vmt-seg [data-v]').forEach(function (bt) { bt.onclick = function () { S.view = bt.getAttribute('data-v'); S.all = false; paint(); }; });
      el.querySelectorAll('[data-amt]').forEach(function (bt) { bt.onclick = function () { S.amt = Number(bt.getAttribute('data-amt')); paint(); }; });
      el.querySelectorAll('[data-bk]').forEach(function (bt) { bt.onclick = function () { S.bucket = bt.getAttribute('data-bk'); paint(); }; });
      el.querySelectorAll('[data-lens]').forEach(function (bt) { bt.onclick = function () { S.lens = bt.getAttribute('data-lens'); paint(); }; });
      var mo = el.querySelector('#vmt-more'); if (mo) mo.onclick = function () { S.all = !S.all; paint(); };
    }
    function stat(k, v, s) { return '<div class="vmt-stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + (s || '') + '</div></div>'; }
    function best(rec) { var key = rec.wallet + '|' + S.live; if (S.bestKey !== key) { try { S.best = VM.bestSplitAll(S.m, rec); S.bestKey = key; } catch (e) { S.best = null; } } return S.best; }
    function tags(p, W) {
      var t = ['<span class="vmt-tag">' + esc(VM.BUCKET_LABEL[p.bucket]) + '</span>']; if (dexTag(p)) t.push('<span class="vmt-tag">' + dexTag(p) + '</span>'); if (p.grade) t.push('<span class="vmt-tag">' + esc(p.grade) + '</span>');
      if (p.winding) t.push('<span class="vmt-tag warn" title="' + esc(p.winding.headline || '') + '"><i class="fas fa-triangle-exclamation"></i> ' + esc(p.winding.symbol || 'asset') + ' ending</span>');
      if (p.votionExcluded) t.push('<span class="vmt-tag no">no Votion</span>'); else if (p.votionUntested) t.push('<span class="vmt-tag warn">Votion untested</span>');
      if (W && W.rec && (W.rec.lp || []).some(function (l) { return l.pk === p.pk; })) t.push('<span class="vmt-tag me">your LP</span>');
      return '<div class="tags">' + t.join('') + '</div>';
    }
    function more(total, shown) { return total > shown || S.all ? '<button type="button" class="vmt-more" id="vmt-more">' + (S.all ? 'show fewer' : 'show all ' + total) + '</button>' : ''; }

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
      var ctl = '<div class="vmt-chips"><span class="vmt-lab">If I add</span>' + [25, 50, 100, 250, 500].map(function (v) { return '<span class="vmt-chip amt ' + (S.amt === v ? 'on' : '') + '" data-amt="' + v + '">$' + v + '</span>'; }).join('') +
        '</div><div class="vmt-chips"><span class="vmt-lab">In</span>' + [['all', 'All buckets']].concat(VM.BUCKETS.map(function (b) { return [b, VM.BUCKET_LABEL[b]]; })).map(function (x) { return '<span class="vmt-chip ' + (S.bucket === x[0] ? 'on' : '') + '" data-bk="' + x[0] + '">' + esc(x[1]) + '</span>'; }).join('') + '</div>' +
        '<div class="vmt-chips">' + lenses.map(function (x) { return '<span class="vmt-chip ' + (S.lens === x.key ? 'on' : '') + '" data-lens="' + x.key + '" title="' + esc(x.hint) + '">' + esc(x.label) + '</span>'; }).join('') + '</div>' +
        (L ? '<div class="vmt-hint">' + esc(L.hint.charAt(0).toUpperCase() + L.hint.slice(1)) + ' · click a pool to open it in the simulator' + (S.lens === 'impact' ? ' with $' + S.amt + ' added' : '') + '</div>' : '');
      if (!rows.length) return ctl + '<div class="vmt-hint" style="padding:1rem 0">' + (S.lens === 'mine' ? 'This wallet has no LP positions in TLA pools on record.' : 'No pools fit this lens right now.') + '</div>';
      var bribe = ['impact', 'underdogs', 'pd'].indexOf(S.lens) >= 0 ? S.amt : 0;
      var headRow = '<div class="vmt-row head"><span></span><span>Pool</span><span>' + (S.lens === 'impact' || S.lens === 'underdogs' || S.lens === 'pd' ? '$' + S.amt + ' buys (emissions)' : L ? esc(L.label) : '') + '</span><span>APR next epoch</span><span>Votion if +$' + S.amt + '</span><span></span></div>';
      return ctl + headRow + rows.map(function (r, i) { var p = r.pool, im = r.im, mt = metric(r);
        return '<a class="vmt-row" data-pk="' + esc(p.pk) + '" href="' + planUrl(p.pk, bribe) + '"><span class="n">' + (i + 1) + '</span>' +
          '<div style="min-width:0"><div class="nm">' + esc(p.name) + '</div>' + tags(p, W) + '</div>' +
          '<div class="c-main"><div class="vmt-big">' + mt[0] + '</div><div class="vmt-bar"><i style="width:' + Math.max(2, Math.min(100, mt[2] / mx * 100)) + '%;background:' + (S.lens === 'leaving' ? 'var(--vmt-dn)' : 'var(--vmt-cy)') + '"></i></div></div>' +
          '<div class="c-apr"><span class="k-sm">APR</span><span class="vmt-big" style="font-size:.95rem">' + pct(im.apr0) + ' <span class="vmt-fl">→</span> <span class="' + cls((im.apr1 || 0) - (im.apr0 || 0), 0.5) + '">' + pct(im.apr1) + '</span></span>' + (!im.active0 && im.active1 ? '<div class="vmt-sub vmt-up">crosses the 1% line</div>' : !im.active1 ? '<div class="vmt-sub">under 1%</div>' : '') + '</div>' +
          '<div class="c-vot"><span class="k-sm">Votion</span><span class="vmt-big ' + cls(im.votionIn, 20000) + '" style="font-size:.95rem">' + (p.votionExcluded ? '—' : sVp(im.votionIn)) + '</span><div class="vmt-sub">pot ' + money(p.potUsd, 0) + '</div></div>' +
          '<div class="c-go"><span class="vmt-plan">Simulate →</span></div></a>'; }).join('') + more(total, rows.length);
    }
    // 2 · Votion's next move if nothing changes — its published plan vs its votes now, in real VP, and what that does to each pool's emissions
    function votionView(m) {
      var mv = VM.votionMoves(m, 'all'); var shown = S.all ? mv : mv.slice(0, 8);
      if (!mv.length) return '<div class="vmt-hint" style="padding:1rem 0">Votion plans no moves this round.</div>';
      var mx = Math.max.apply(null, [1].concat(mv.map(function (x) { return Math.abs(x.d); })));
      return '<div class="vmt-hint">What Votion\'s two vaults will do when they cast, if nothing else changes — its own published plan. Click a pool to test a bribe against it.</div>' +
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
    function potsView(m, rate) {
      var ps = Object.keys(m.pools).map(function (k) { return m.pools[k]; }).filter(function (p) { return p.potUsd > 0.5 || (p.votionNow > 50000 && !p.votionExcluded); }).sort(function (a, b) { return (b.potUsd - a.potUsd) || (b.votionNow - a.votionNow); });
      var shown = S.all ? ps : ps.slice(0, 8);
      return '<div class="vmt-hint">Pots funded for round ' + esc(m.period) + ' and the price of a vote on each — pools under Votion\'s rate are where a small bribe pulls it in.</div>' +
        '<div class="vmt-row head"><span></span><span>Pool</span><span>Pot</span><span>Votes now</span><span>$ / 1M VP</span><span></span></div>' +
        shown.map(function (p, i) { var per = p.potUsd > 0 && p.vp > 50000 ? p.potUsd / (p.vp / 1e6) : null; var unf = !(p.potUsd > 0.5) && p.votionNow > 50000;
          return '<a class="vmt-row" data-pk="' + esc(p.pk) + '" href="' + planUrl(p.pk, 0) + '"><span class="n">' + (i + 1) + '</span>' +
            '<div style="min-width:0"><div class="nm">' + esc(p.name) + '</div>' + tags(p) + '</div>' +
            '<div class="c-main"><div class="vmt-big">' + (unf ? '<span class="vmt-am">not funded</span>' : money(p.potUsd, p.potUsd >= 100 ? 0 : 2)) + '</div><div class="vmt-sub">' + (unf ? 'Votion\'s ' + vp(p.votionNow) + ' leaves' : esc((p.pot && p.pot.tokens || []).slice(0, 2).map(function (t) { return vp(t.amount) + ' ' + t.sym; }).join(' · ')) + (p.potPricedBy === 'votion' ? ' · Votion\'s price' : '')) + '</div></div>' +
            '<div class="c-apr"><span class="k-sm">Votes</span><span class="vmt-big" style="font-size:.95rem">' + vp(p.vp) + '</span><div class="vmt-sub">' + (p.votionNow > 50000 ? 'Votion ' + vp(p.votionNow) : 'LP-voted') + '</div></div>' +
            '<div class="c-vot"><span class="k-sm">$/1M</span><span class="vmt-big" style="font-size:.95rem">' + (per != null ? money(per) : '—') + '</span>' + (per != null && rate ? '<div class="vmt-sub ' + (per >= rate ? 'vmt-up' : 'vmt-am') + '">' + (per >= rate ? '+' : '') + Math.round((per / rate - 1) * 100) + '% vs rate</div>' : '') + '</div>' +
            '<div class="c-go"><span class="vmt-plan">Simulate →</span></div></a>'; }).join('') + more(ps.length, shown.length);
    }

    paint();
    if (!S.m) {
      VM.load({}).then(function (m) { S.m = m; paint(); live(); m.loadVoters().then(function () { S.voters = true; paint(); }).catch(function () {}); })
        .catch(function (e) { el.innerHTML = '<div class="vmt-hint" style="padding:1rem 0">The Vote Market\'s data is unavailable right now (' + esc(e.message) + '). <a href="' + PLAN + '" style="color:#fcd34d">Open the simulator →</a></div>'; });
    } else if (S.m.voters) { S.voters = true; paint(); }
    function live() { VM.fetchLivePots(S.m).then(function (l) { if (l) { VM.applyLivePots(S.m, l); S.live = true; S.bestKey = ''; paint(); } }).catch(function () {}); }
    api.live = function () { if (S.m) live(); };
    return api;
  }
  return { VERSION: VERSION, mount: mount };
});
