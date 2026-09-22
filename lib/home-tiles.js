/* =============================================================================
 * lib/home-tiles.js 1.0.0 (2026-09-21) — THE TENANT HOME ENGINE.
 * -----------------------------------------------------------------------------
 * A tenant's home page (liondao/index.html, the next ally's <slug>/index.html) is a thin shell: it mounts the site
 * header, loads this lib, and calls HomeTiles.mount({ el, config, ctx }). Everything the page shows comes from three
 * places and nowhere else:
 *   1. tla-core/docs/curated/tenants.json          — the ally (label, logo, theme, collections, wallets, validator, links)
 *   2. <slug>/home.json                            — WHAT the home shows: sections, tiles, wording, which data path each
 *                                                    number reads. The tenant's words live here, never in this file.
 *   3. the cron products + a few live LCD reads    — the numbers. A missing source renders "Unknown" with its reason.
 *
 * Laws honoured: the registry holds the literals, the engine holds none (no address, symbol or ally name below —
 * everything is a key into the config or the registry); every USD basis labeled; null-vs-0 (a null source is
 * "Unknown", never 0); a third party is never an input (CoinGecko rows are labeled as CoinGecko's); facts in the
 * product, thresholds in the config, words in the renderer.
 *
 *   HomeTiles.mount({ el, config, ctx })  → renders, then hydrates as sources land (each tile re-paints on its keys)
 *   HomeTiles.get(data, 'roar.price_usd') → path read (null when missing)
 *   HomeTiles.fmt.usd / .num / .big / .pct / .luna
 *   HomeTiles.derive(sources, cfg, ctx)   → the data object (pure; the gate runs it on real fixtures)
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HomeTiles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.2.4';   // 1.2.4 (2026-09-22, owner): staking rewards as a RATE per staked lion per hour, no floor. 1.2.3 (2026-09-22): Burning Lions supply live (cw721 num_tokens, registry labeled as fallback); staking APR from the positions product's pl_rewards (the distributor found by a claim tx); addr() — every address copy · search · explorer. 1.2.2 (2026-09-22): the pyROAR and ROAR20 bars draw from the holder products (burn/holders, roar20/holders — every account walked, kinds by registry + chain); live reads remain the fallback; the pyROAR note is chain facts only. 1.2.1 (2026-09-22, owner's second look): the chip says Coming; the hero is a mane (rings of rays + the tenant's logo medallion), no caution tape; bars fall back to the registry's fixed supplies, labeled. 1.2.0 (2026-09-22): the market section in aDAO's exact shape (three venue cards · Live Activity full width with kind chips · All Current Listings grid with venue + class filters · Top 10 behind a button); sales-enriched folded per venue; pyROAR + ROAR20 supply bars (live reads: pyROAR token_info + roster balances; Solana getTokenSupply + getTokenLargestAccounts). 1.1.0 (2026-09-22, home v2): the positions PRODUCT (dao-originations/<dao>/positions, ally-positions) replaces the live roster block for tla / unclaimed / treasury / total when it loads (live LCD stays the fallback, source-labeled); rewards groups take href (a full page, no sheet); loadSources exported as load() for the tenant's other pages · 1.0.2: burn.supply_delta (initial − live supply, labeled) · 1.0.1: tenant.roar20 (DexScreener, labeled) + tenant.burn (reported figures, source-labeled) pass through to the tiles
  var G = typeof globalThis !== 'undefined' ? globalThis : this;
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var NFTC = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
  var DAOO = 'https://raw.githubusercontent.com/thealliancedao/dao-originations/main/';

  // ---------------------------------------------------------------- helpers
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var fmt = {
    num: function (v, d) { if (!isNum(v)) return null; return v.toLocaleString(undefined, { maximumFractionDigits: d == null ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4) : d, minimumFractionDigits: 0 }); },
    usd: function (v) { if (!isNum(v)) return null; var a = Math.abs(v); return (v < 0 ? '−' : '') + '$' + (a >= 1e6 ? (a / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M' : a >= 1000 ? a.toLocaleString(undefined, { maximumFractionDigits: 0 }) : a >= 1 ? a.toLocaleString(undefined, { maximumFractionDigits: 2 }) : a >= 0.01 ? a.toLocaleString(undefined, { maximumFractionDigits: 3 }) : a.toLocaleString(undefined, { maximumSignificantDigits: 3 })); },
    big: function (v, d) { if (!isNum(v)) return null; var a = Math.abs(v), s = v < 0 ? '−' : ''; if (a >= 1e12) return s + (a / 1e12).toLocaleString(undefined, { maximumFractionDigits: d == null ? 2 : d }) + 'T'; if (a >= 1e9) return s + (a / 1e9).toLocaleString(undefined, { maximumFractionDigits: d == null ? 2 : d }) + 'B'; if (a >= 1e6) return s + (a / 1e6).toLocaleString(undefined, { maximumFractionDigits: d == null ? 1 : d }) + 'M'; if (a >= 1e3) return s + (a / 1e3).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k'; return s + a.toLocaleString(undefined, { maximumFractionDigits: 2 }); },
    pctPlain: function (v, d) { if (!isNum(v)) return null; return v.toLocaleString(undefined, { maximumFractionDigits: d == null ? 1 : d }) + '%'; },
    pct: function (v, d) { if (!isNum(v)) return null; return (v > 0 ? '+' : '') + v.toLocaleString(undefined, { maximumFractionDigits: d == null ? 1 : d }) + '%'; },
    price: function (v) { if (!isNum(v)) return null; if (v >= 1) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 }); if (v >= 0.01) return '$' + v.toFixed(4); return '$' + v.toLocaleString(undefined, { maximumSignificantDigits: 3, minimumSignificantDigits: 3 }); },
    int: function (v) { return isNum(v) ? Math.round(v).toLocaleString() : null; },
    short: function (a) { a = String(a || ''); return a.length > 16 ? a.slice(0, 10) + '…' + a.slice(-5) : a; },
    ago: function (iso) { if (!iso) return null; var h = (Date.now() - Date.parse(iso)) / 3.6e6; if (!isFinite(h)) return null; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm ago' : h < 48 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago'; },
    date: function (iso) { if (!iso) return null; var d = new Date(iso); return isNaN(d) ? null : d.toISOString().slice(0, 10); },
  };
  function get(obj, path) { if (!obj || !path) return null; var cur = obj; var parts = String(path).split('.'); for (var i = 0; i < parts.length; i++) { if (cur == null) return null; cur = cur[parts[i]]; } return cur === undefined ? null : cur; }
  function sum(arr) { var t = 0, any = false; (arr || []).forEach(function (v) { if (isNum(v)) { t += v; any = true; } }); return any ? t : null; }

  // ---------------------------------------------------------------- fetch layer
  function jsonFetch(url, opts) {
    opts = opts || {};
    var bust = opts.bust === false ? '' : (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Math.floor(Date.now() / (opts.ttlMs || 3e5));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null; var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 12000) : null;
    return fetch(url + bust, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) { if (timer) clearTimeout(timer); return r.ok ? r.json() : null; }).catch(function () { if (timer) clearTimeout(timer); return null; });
  }
  // LCD: primary then fallback, from the page's config (lcd: [...]) — the engine names no host of its own.
  function lcdGet(hosts, path) {
    var i = 0; hosts = (hosts && hosts.length) ? hosts : [];
    function next() { if (i >= hosts.length) return Promise.resolve(null); var h = hosts[i++]; return jsonFetch(h + path, { bust: false, timeoutMs: 9000 }).then(function (r) { return r == null ? next() : r; }); }
    return next();
  }
  function smart(hosts, contract, query) { var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(query)))); return lcdGet(hosts, '/cosmwasm/wasm/v1/contract/' + contract + '/smart/' + b64).then(function (r) { return r && r.data !== undefined ? r.data : null; }); }
  // JSON-RPC over POST (Solana): primary then fallback, hosts from the page config; a failed host is skipped, a failed call is null
  function rpcPost(hosts, method, params) {
    var i = 0; hosts = (hosts && hosts.length) ? hosts : [];
    function next() { if (i >= hosts.length) return Promise.resolve(null); var h = hosts[i++]; var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null; var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
      return fetch(h, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }), signal: ctrl ? ctrl.signal : undefined }).then(function (r) { if (timer) clearTimeout(timer); return r.ok ? r.json() : null; }).then(function (j) { return j && j.result !== undefined ? j.result : next(); }).catch(function () { if (timer) clearTimeout(timer); return next(); }); }
    return next();
  }
  function pagedAll(hosts, path, key, maxPages) { var out = [], pages = 0; function step(nextKey) { var p = path + (path.indexOf('?') === -1 ? '?' : '&') + 'pagination.limit=500' + (nextKey ? '&pagination.key=' + encodeURIComponent(nextKey) : ''); return lcdGet(hosts, p).then(function (r) { if (!r) return pages ? out : null; out = out.concat(r[key] || []); pages++; var nk = r.pagination && r.pagination.next_key; return nk && pages < (maxPages || 10) ? step(nk) : out; }); } return step(null); }

  // ---------------------------------------------------------------- sources
  // Every source is optional; a null lands as Unknown on the tiles that read it. Keys are what home.json paths address.
  function loadSources(cfg, ctx, onSource) {
    var lcd = (cfg.lcd || []); var T = ctx && ctx.tenant || {}; var prim = ctx && ctx.primary || null;
    var colUrl = function (rel) { return prim && prim.url ? prim.url(rel) : (NFTC + (prim ? prim.slug : '') + '/' + rel); };
    var S = {};
    var put = function (k, v) { S[k] = v; try { onSource && onSource(k, v, S); } catch (e) {} return v; };
    var jobs = [];
    var J = function (k, p) { jobs.push(Promise.resolve(p).then(function (v) { return put(k, v == null ? null : v); }, function () { return put(k, null); })); };

    J('nap', jsonFetch(CORE + 'network-and-prices/current.json'));
    J('dash', jsonFetch(CORE + 'member-data/dao-dashboard/current.json'));
    J('participants', jsonFetch(CORE + 'member-data/participants/current.json'));
    J('thresholds', jsonFetch(CORE + 'docs/curated/alert-thresholds.json'));
    // 1.1.0 — the positions product for this ally (the DAO folder is the registry's daos[0]); one file, hourly, every wallet
    var dao = Array.isArray(T.daos) && T.daos.length ? T.daos[0] : null; if (dao) J('positions', jsonFetch(DAOO + dao + '/positions/current.json'));
    // 1.2.2: the HOLDER products (ally-positions/holders.js, daily): the complete pyROAR ledger and the ROAR20 owner set — the bars draw from these, the live reads are the fallback
    if (dao) { J('pyroar_holders', jsonFetch(DAOO + dao + '/burn/holders.json')); J('roar20_holders', jsonFetch(DAOO + dao + '/roar20/holders.json')); }
    if (prim) {
      J('col_summary', jsonFetch(colUrl('snapshots/summary.json')));
      J('col_analytics', jsonFetch(colUrl('snapshots/nft-analytics.json')));
      J('col_floor', jsonFetch(colUrl('snapshots/floor-history.json')));
      J('col_bundle', jsonFetch(colUrl('snapshots/explorer-bundle.json')));
      J('col_activity', jsonFetch(colUrl('ledger/activity.json')));
    }
    // ---- live chain reads (each one its own job; a dead LCD only blanks its own tile)
    var st = T.staking || {}, val = T.validator || {}, wallets = T.wallets || {};
    if (st.roar_cw20) { J('lcd_token_info', smart(lcd, st.roar_cw20, { token_info: {} })); J('lcd_minter', smart(lcd, st.roar_cw20, { minter: {} })); }
    if (st.roar_staking) J('lcd_staked', smart(lcd, st.roar_staking, { total_staked_at_height: {} }).then(function (r) { return r || smart(lcd, st.roar_staking, { total_value: {} }); }));
    if (val.operator) {
      J('lcd_validators', pagedAll(lcd, '/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED', 'validators', 4));
      J('lcd_val_delegations', lcdGet(lcd, '/cosmos/staking/v1beta1/validators/' + val.operator + '/delegations?pagination.limit=1&pagination.count_total=true'));
      J('lcd_val_commission', lcdGet(lcd, '/cosmos/distribution/v1beta1/validators/' + val.operator + '/commission'));
    }
    var treasury = Object.keys(wallets).filter(function (a) { return wallets[a].counts_as === 'treasury'; })[0];
    if (treasury && st.roar_cw20) J('lcd_treasury_roar', smart(lcd, st.roar_cw20, { balance: { address: treasury } }));
    if (treasury) J('lcd_treasury_bank', lcdGet(lcd, '/cosmos/bank/v1beta1/balances/' + treasury + '?pagination.limit=200'));
    Object.keys(wallets).forEach(function (a) {
      J('lcd_deleg_' + a, lcdGet(lcd, '/cosmos/staking/v1beta1/delegations/' + a + '?pagination.limit=50'));
      J('lcd_rewards_' + a, lcdGet(lcd, '/cosmos/distribution/v1beta1/delegators/' + a + '/rewards'));
    });
    if (val.account) J('lcd_rewards_validator_account', lcdGet(lcd, '/cosmos/distribution/v1beta1/delegators/' + val.account + '/rewards'));
    // ---- a token on another chain (tenants.json <tenant>.roar20): DexScreener's public endpoint, labeled as theirs
    if (T.roar20 && T.roar20.mint && T.roar20.price_source === 'dexscreener') J('dexscreener', jsonFetch('https://api.dexscreener.com/latest/dex/tokens/' + T.roar20.mint, { bust: false, timeoutMs: 8000 }));
    // ---- 1.2.0: pyROAR (the frozen burn ledger token) — its supply and who on the roster / the festival receiver holds it (live; the burners come with the burn ledger)
    var py = T.burn && T.burn.pyroar_cw20;
    if (py) { J('lcd_pyroar_info', smart(lcd, py, { token_info: {} })); Object.keys(wallets).forEach(function (a) { J('lcd_pyroar_' + a, smart(lcd, py, { balance: { address: a } })); }); if (T.burn.festival_receiver) J('lcd_pyroar_receiver', smart(lcd, py, { balance: { address: T.burn.festival_receiver } })); }
    // ---- 1.2.0: ROAR20 on Solana — supply and the 20 largest token accounts from the RPC hosts the page config names (cfg.solana_rpc); holders need Helius (the cron duty)
    if (T.roar20 && T.roar20.chain === 'solana' && T.roar20.mint && cfg.solana_rpc && cfg.solana_rpc.length) { J('sol_supply', rpcPost(cfg.solana_rpc, 'getTokenSupply', [T.roar20.mint])); J('sol_largest', rpcPost(cfg.solana_rpc, 'getTokenLargestAccounts', [T.roar20.mint])); }
    // ---- 1.2.3: the Burning Lions cw721 (tenants.json <tenant>.burning_lions.contract): supply and name live, until the collection folder is onboarded
    if (T.burning_lions && T.burning_lions.contract) { J('lcd_bl_num_tokens', smart(lcd, T.burning_lions.contract, { num_tokens: {} })); J('lcd_bl_info', smart(lcd, T.burning_lions.contract, { contract_info: {} })); }
    // ---- CoinGecko (labeled as theirs on every row that uses it)
    if (cfg.coingecko_id) J('coingecko', jsonFetch('https://api.coingecko.com/api/v3/coins/' + cfg.coingecko_id + '?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false', { bust: false, timeoutMs: 8000 }));
    return { sources: S, all: Promise.all(jobs).then(function () { return S; }),
      // heavy products load after first paint, on request
      lazy: function (k) { if (S[k] !== undefined) return Promise.resolve(S[k]); if (k === 'col_sales') return jsonFetch(colUrl('snapshots/sales-enriched.json'), { timeoutMs: 30000 }).then(function (v) { return put(k, v); }); if (k === 'col_mint') return jsonFetch(colUrl('ledger/primary-sales.json'), { timeoutMs: 30000 }).then(function (v) { return put(k, v); }); return Promise.resolve(null); } };
  }

  // ---------------------------------------------------------------- derive (pure)
  function derive(S, cfg, ctx) {
    var T = ctx && ctx.tenant || {}; var wallets = T.wallets || {}; var val = T.validator || {}; var st = T.staking || {}; var prim = ctx && ctx.primary || null;
    var D = { meta: { version: VERSION, built: new Date().toISOString() } };
    var nap = S.nap || null; var tp = nap && nap.token_prices || {}; var price = function (sym) { var x = tp[sym]; return x && isNum(x.final_price_usd) ? x.final_price_usd : null; };
    var chg = function (sym, k) { var x = tp[sym]; var a = x && x.prices && x.prices.astroport; return a && isNum(a[k]) ? a[k] : null; };
    var lunaUsd = price('LUNA');
    var roarSym = cfg.symbols && cfg.symbols.token || null, ampSym = cfg.symbols && cfg.symbols.lst || null;   // the config names the token; the engine knows none
    // ---- the token
    var ti = S.lcd_token_info; var dec = ti && isNum(ti.decimals) ? ti.decimals : 6;
    var human = function (raw, d) { var n = Number(raw); return isNum(n) ? n / Math.pow(10, d == null ? dec : d) : null; };
    var cg = S.coingecko && S.coingecko.market_data ? S.coingecko : null;
    var stakedRaw = S.lcd_staked && (S.lcd_staked.total !== undefined ? S.lcd_staked.total : S.lcd_staked.total_staked !== undefined ? S.lcd_staked.total_staked : null);
    var minterCap = S.lcd_minter && S.lcd_minter.cap ? human(S.lcd_minter.cap) : null;
    D.roar = {
      symbol: roarSym,
      price_usd: price(roarSym), chg_24h_pct: chg(roarSym, 'price_change_24h_pct'), chg_7d_pct: chg(roarSym, 'price_change_7d_pct'),
      price_source: nap && tp[roarSym] ? tp[roarSym].final_source : null, price_at: nap ? nap.capturedAt : null,
      lst_ratio: nap && nap.lst_ratios && nap.lst_ratios[ampSym] ? nap.lst_ratios[ampSym].ratio : null,
      total_supply: ti ? human(ti.total_supply) : null,
      max_supply: minterCap,                                   // a cw20 with no minter cap has no max — null stays null
      max_supply_note: S.lcd_minter === null || (S.lcd_minter && !S.lcd_minter.cap) ? 'the token contract sets no cap' : null,
      staked_daodao: stakedRaw != null ? human(stakedRaw) : null,
      treasury_balance: S.lcd_treasury_roar && S.lcd_treasury_roar.balance != null ? human(S.lcd_treasury_roar.balance) : null,
      burned: null, burned_note: 'burn source not found yet',
      circulating_cg: cg && isNum(cg.market_data.circulating_supply) ? cg.market_data.circulating_supply : null,
      market_cap_cg: cg && cg.market_data.market_cap && isNum(cg.market_data.market_cap.usd) ? cg.market_data.market_cap.usd : null,
      fdv_cg: cg && cg.market_data.fully_diluted_valuation && isNum(cg.market_data.fully_diluted_valuation.usd) ? cg.market_data.fully_diluted_valuation.usd : null,
      volume_24h_cg: cg && cg.market_data.total_volume && isNum(cg.market_data.total_volume.usd) ? cg.market_data.total_volume.usd : null,
      cg_rank: cg && isNum(cg.market_cap_rank) ? cg.market_cap_rank : null,
      cg_at: cg ? cg.last_updated : null,
    };
    D.roar.fdv_ours = isNum(D.roar.total_supply) && isNum(D.roar.price_usd) ? D.roar.total_supply * D.roar.price_usd : null;
    D.roar.staked_pct = isNum(D.roar.staked_daodao) && isNum(D.roar.total_supply) && D.roar.total_supply > 0 ? D.roar.staked_daodao / D.roar.total_supply * 100 : null;
    D.roar.treasury_usd = isNum(D.roar.treasury_balance) && isNum(D.roar.price_usd) ? D.roar.treasury_balance * D.roar.price_usd : null;
    D.roar.treasury_pct = isNum(D.roar.treasury_balance) && isNum(D.roar.total_supply) && D.roar.total_supply > 0 ? D.roar.treasury_balance / D.roar.total_supply * 100 : null;
    D.roar.nakamoto = null; D.roar.nakamoto_note = 'needs the staker list (a cron duty)';
    // ---- the validator
    var vals = Array.isArray(S.lcd_validators) ? S.lcd_validators.slice() : null; var vrank = null, vrow = null;
    if (vals && val.operator) { vals.sort(function (a, b) { return Number(b.tokens) - Number(a.tokens); }); for (var i = 0; i < vals.length; i++) if (vals[i].operator_address === val.operator) { vrank = i + 1; vrow = vals[i]; break; } }
    var vdel = S.lcd_val_delegations && S.lcd_val_delegations.pagination ? Number(S.lcd_val_delegations.pagination.total) : null;
    var vcomm = S.lcd_val_commission && S.lcd_val_commission.commission && Array.isArray(S.lcd_val_commission.commission.commission) ? S.lcd_val_commission.commission.commission : null;
    var lunaOf = function (coins) { if (!Array.isArray(coins)) return null; var t = null; coins.forEach(function (c) { if (c.denom === 'uluna') t = (t || 0) + Number(c.amount) / 1e6; }); return t; };
    var dashLion = get(S.dash, 'dashboard.alliances.lion_dao.chain_staking.validators') || []; var dashRow = dashLion.filter(function (r) { return r.address === val.operator; })[0] || null;
    D.validator = {
      moniker: vrow && vrow.description ? vrow.description.moniker : (val.moniker || null), operator: val.operator || null,
      rank: vrank, of: vals ? vals.length : null, tokens_luna: vrow ? Number(vrow.tokens) / 1e6 : null, commission_rate_pct: vrow && vrow.commission && vrow.commission.commission_rates ? Number(vrow.commission.commission_rates.rate) * 100 : null,
      jailed: vrow ? !!vrow.jailed : null, delegators: isNum(vdel) ? vdel : null,
      commission_unclaimed_luna: lunaOf(vcomm), commission_unclaimed_usd: isNum(lunaOf(vcomm)) && isNum(lunaUsd) ? lunaOf(vcomm) * lunaUsd : null,
      adao_delegation_luna: dashRow ? dashRow.staked_luna : null, adao_unclaimed_luna: dashRow ? dashRow.unclaimed_rewards_luna : null,
      adao_unclaimed_usd: dashRow && isNum(dashRow.unclaimed_rewards_luna) && isNum(lunaUsd) ? dashRow.unclaimed_rewards_luna * lunaUsd : null,
      voting_share_pct: vrow && vals ? Number(vrow.tokens) / vals.reduce(function (t, v) { return t + Number(v.tokens); }, 0) * 100 : null,
    };
    D.validator.top10 = isNum(vrank) ? vrank <= 10 : null;
    // ---- the roster (wallets) — what we can read live today; the positions cron replaces this block
    var members = Array.isArray(get(S.participants, 'members')) ? S.participants.members : [];
    var byWallet = {}; members.forEach(function (m) { byWallet[m.wallet] = m; });
    D.wallets = {}; var tlaTot = { lp_usd: null, locked_usd: null, pending_usd: null, vp: null }; var delegTot = { luna: null, rewards_luna: null };
    Object.keys(wallets).forEach(function (a) {
      var w = wallets[a]; var m = byWallet[a] || null; var sm = m && m.summary || null;
      var dl = S['lcd_deleg_' + a]; var dr = S['lcd_rewards_' + a];
      var delegLuna = dl && Array.isArray(dl.delegation_responses) ? dl.delegation_responses.reduce(function (t, r) { return t + Number(r.balance && r.balance.amount || 0) / 1e6; }, 0) : (dl === null ? null : null);
      var rewLuna = dr && Array.isArray(dr.total) ? lunaOf(dr.total.map(function (c) { return { denom: c.denom, amount: Math.floor(Number(c.amount)) }; })) : null;
      var pend = sm ? sum([sm.total_pending_rewards_usd, sm.total_pending_bribes_usd, get(m, 'pending_rebase.usd_value')]) : null;
      D.wallets[a] = { address: a, label: w.label, role: w.role, counts_as: w.counts_as,
        in_participants: !!m, tla_lp_usd: sm ? sm.total_lp_position_usd : null, tla_locked_usd: sm ? sm.total_locked_usd : null, tla_vp: sm ? sm.voting_power_human : null, tla_locks: sm ? sm.lock_count : null,
        tla_pending_usd: pend, tla_pending_rewards_usd: sm ? sm.total_pending_rewards_usd : null, tla_pending_bribes_usd: sm ? sm.total_pending_bribes_usd : null, tla_pending_rebase_usd: get(m, 'pending_rebase.usd_value'),
        delegated_luna: delegLuna, delegation_rewards_luna: rewLuna, delegation_rewards_usd: isNum(rewLuna) && isNum(lunaUsd) ? rewLuna * lunaUsd : null,
        delegated_to_own_validator_luna: dl && Array.isArray(dl.delegation_responses) ? dl.delegation_responses.filter(function (r) { return r.delegation && r.delegation.validator_address === val.operator; }).reduce(function (t, r) { return t + Number(r.balance.amount) / 1e6; }, 0) : null };
      if (isNum(D.wallets[a].tla_lp_usd)) tlaTot.lp_usd = (tlaTot.lp_usd || 0) + D.wallets[a].tla_lp_usd;
      if (isNum(D.wallets[a].tla_locked_usd)) tlaTot.locked_usd = (tlaTot.locked_usd || 0) + D.wallets[a].tla_locked_usd;
      if (isNum(pend)) tlaTot.pending_usd = (tlaTot.pending_usd || 0) + pend;
      if (isNum(D.wallets[a].tla_vp)) tlaTot.vp = (tlaTot.vp || 0) + D.wallets[a].tla_vp;
      if (isNum(delegLuna)) delegTot.luna = (delegTot.luna || 0) + delegLuna;
      if (isNum(rewLuna)) delegTot.rewards_luna = (delegTot.rewards_luna || 0) + rewLuna;
    });
    var bank = S.lcd_treasury_bank && Array.isArray(S.lcd_treasury_bank.balances) ? S.lcd_treasury_bank.balances : null;
    D.treasury = { roar: D.roar.treasury_balance, roar_usd: D.roar.treasury_usd, luna: bank ? lunaOf(bank) : null, luna_usd: bank && isNum(lunaOf(bank)) && isNum(lunaUsd) ? lunaOf(bank) * lunaUsd : null, bank_denoms: bank ? bank.length : null };
    var vacct = S.lcd_rewards_validator_account; var vacctRew = vacct && Array.isArray(vacct.total) ? lunaOf(vacct.total.map(function (c) { return { denom: c.denom, amount: Math.floor(Number(c.amount)) }; })) : null;
    D.tla = { lp_usd: tlaTot.lp_usd, locked_usd: tlaTot.locked_usd, pending_usd: tlaTot.pending_usd, vp: tlaTot.vp, total_usd: sum([tlaTot.lp_usd, tlaTot.locked_usd]), wallets_in_participants: Object.keys(D.wallets).filter(function (a) { return D.wallets[a].in_participants; }).length, source_at: get(S.participants, 'capturedAt') };
    D.delegations = { luna: delegTot.luna, luna_usd: isNum(delegTot.luna) && isNum(lunaUsd) ? delegTot.luna * lunaUsd : null, rewards_luna: delegTot.rewards_luna, rewards_usd: isNum(delegTot.rewards_luna) && isNum(lunaUsd) ? delegTot.rewards_luna * lunaUsd : null, validator_account_rewards_luna: vacctRew };
    D.unclaimed = {
      tla_usd: D.tla.pending_usd,
      validator_usd: sum([D.validator.commission_unclaimed_usd, D.delegations.rewards_usd, isNum(vacctRew) && isNum(lunaUsd) ? vacctRew * lunaUsd : null]),
      validator_luna: sum([D.validator.commission_unclaimed_luna, D.delegations.rewards_luna, vacctRew]),
      nft_usd: null, nft_note: st.pl_rewards_distributor ? null : 'distributor contract not found yet',
    };
    D.unclaimed.total_known_usd = sum([D.unclaimed.tla_usd, D.unclaimed.validator_usd]);
    // ---- the ally's total (known parts only, remainder Unknown until the positions cron)
    D.total = { known_usd: sum([D.treasury.roar_usd, D.treasury.luna_usd, D.tla.total_usd, D.delegations.luna_usd]), parts: [
      { label: 'Treasury ' + (roarSym || 'token'), usd: D.treasury.roar_usd }, { label: 'Treasury LUNA', usd: D.treasury.luna_usd }, { label: 'TLA LP + locks', usd: D.tla.total_usd }, { label: 'LUNA delegated', usd: D.delegations.luna_usd },
      { label: 'Compounders · Credia · Votion · other tokens', usd: null, note: 'positions cron' } ], source: 'live LCD reads (positions product not loaded)' };
    // ---- 1.1.0: THE POSITIONS PRODUCT. When ally-positions' current.json is here, its roll-up is the truth for tla / unclaimed /
    // treasury / total (every part priced, every basis labeled, receipts never doubled) and the live block above is the fallback.
    var PX = S.positions && S.positions.rollup && S.positions.rollup.dao ? S.positions : null;
    if (PX) {
      var RD = PX.rollup.dao; var PW = PX.wallets || {};
      D.positions = { captured_at: PX.capturedAt, engine: PX.engine, known_usd: RD.known_usd, liabilities_usd: RD.liabilities_usd, balances_usd: RD.balances_usd, tla_usd: RD.tla_usd, tla_staked_usd: RD.tla_staked_usd, tla_compounder_usd: RD.tla_compounder_usd, tla_locked_usd: RD.tla_locked_usd,
        tla_pending_usd: RD.tla_pending_usd, delegations_usd: RD.delegations_usd, credia_collateral_usd: RD.credia_collateral_usd, credia_debt_usd: RD.credia_debt_usd, votion_usd: RD.votion_usd, validator_commission_usd: RD.validator_commission_unclaimed_usd,
        wallets: Object.keys(PW).length, unpriced_rows: sum(Object.keys(PW).map(function (a) { return PW[a].totals ? PW[a].totals.unpriced_rows : null; })),
        recon_delta_usd: PX.reconciliation ? (isNum(PX.reconciliation.ours_total_known_usd) && isNum(PX.reconciliation.theirs_total_usd) ? PX.reconciliation.ours_total_known_usd - PX.reconciliation.theirs_total_usd : null) : null, recon_as_of: PX.reconciliation ? PX.reconciliation.reference_as_of : null };
      var vpTot = null; Object.keys(PW).forEach(function (a) { var s = PW[a].portfolio && PW[a].portfolio.summary; if (s && isNum(s.voting_power_human)) vpTot = (vpTot || 0) + s.voting_power_human; });
      D.tla = { lp_usd: sum([RD.tla_staked_usd, RD.tla_compounder_usd]), locked_usd: RD.tla_locked_usd, pending_usd: RD.tla_pending_usd, vp: vpTot, total_usd: RD.tla_usd, wallets_in_participants: null, source: 'positions product' };
      var treasuryAddr = Object.keys(PW).filter(function (a) { return PW[a].counts_as === 'treasury'; })[0]; var tw = treasuryAddr ? PW[treasuryAddr] : null;
      var roarRow = tw ? (tw.balances || []).filter(function (b) { return b.symbol === roarSym; })[0] : null; var lunaRow = tw ? (tw.balances || []).filter(function (b) { return b.denom === 'uluna'; })[0] : null;
      if (roarRow) { D.roar.treasury_balance = roarRow.amount_human; D.roar.treasury_usd = roarRow.usd_value; }
      D.treasury = { roar: roarRow ? roarRow.amount_human : D.treasury.roar, roar_usd: roarRow ? roarRow.usd_value : D.treasury.roar_usd, luna: lunaRow ? lunaRow.amount_human : D.treasury.luna, luna_usd: lunaRow ? lunaRow.usd_value : D.treasury.luna_usd, bank_denoms: tw ? (tw.balances || []).length : D.treasury.bank_denoms, known_usd: tw && tw.totals ? tw.totals.known_usd : null, source: 'positions product' };
      D.unclaimed.tla_usd = RD.tla_pending_usd; D.unclaimed.validator_usd = sum([RD.validator_commission_unclaimed_usd, sum(Object.keys(PW).map(function (a) { return PW[a].delegations ? PW[a].delegations.rewards_usd : null; }))]);
      D.unclaimed.validator_luna = sum([PX.validator ? PX.validator.commission_unclaimed_luna : null, sum(Object.keys(PW).map(function (a) { return PW[a].delegations ? PW[a].delegations.rewards_luna : null; }))]);
      D.unclaimed.total_known_usd = sum([D.unclaimed.tla_usd, D.unclaimed.validator_usd]);
      var tlaSplit = isNum(RD.tla_staked_usd) || isNum(RD.tla_compounder_usd) || isNum(RD.tla_locked_usd);   // ally-positions ≥ 1.1.0 splits TLA; older roll-ups carry tla_usd only
      D.total = { known_usd: RD.known_usd, liabilities_usd: RD.liabilities_usd, parts: [{ label: 'Tokens', usd: RD.balances_usd }].concat(
        tlaSplit ? [{ label: 'TLA staked + compounder', usd: sum([RD.tla_staked_usd, RD.tla_compounder_usd]) }, { label: 'TLA locks', usd: RD.tla_locked_usd }] : [{ label: 'TLA positions', usd: RD.tla_usd }],
        [{ label: 'Credia collateral', usd: RD.credia_collateral_usd, note: 'reader not run' }, { label: 'LUNA delegated', usd: RD.delegations_usd }, { label: 'Votion', usd: RD.votion_usd, note: 'no vault row' }]), source: 'positions product · ' + PX.capturedAt };
    } else D.positions = null;
    // ---- the primary collection
    var sm2 = S.col_summary || null; var an = S.col_analytics || null; var fh = S.col_floor && Array.isArray(S.col_floor.rows) && S.col_floor.rows.length ? S.col_floor.rows[S.col_floor.rows.length - 1] : null;
    var mk = sm2 && sm2.marketplaces || {};
    var venueFloor = function (v) { var by = mk[v] && mk[v].by_token || {}; var best = null; Object.keys(by).forEach(function (sym) { var p = price(sym); var u = isNum(by[sym].min) && isNum(p) ? by[sym].min * p : null; if (u != null && (best == null || u < best.usd)) best = { usd: u, amount: by[sym].min, symbol: sym, count: by[sym].count }; }); return best || (mk[v] ? { usd: null, count: mk[v].count } : null); };
    D.pl = {
      slug: prim ? prim.slug : null, label: prim ? prim.label : null, supply: sm2 ? sm2.total_tokens : (prim ? prim.supply : null),
      minted: sm2 ? sm2.minted_count : null, dao_held: sm2 ? sm2.dao_held_count : null,
      staked_daodao: sm2 ? sm2.daodao_staked_count : null, staked_enterprise: sm2 ? sm2.enterprise_staked_count : null, liquid: sm2 ? sm2.user_liquid_count : null,
      holders: sm2 ? sm2.unique_holders : null, members: sm2 ? sm2.dao_members_count : null,
      listed_bbl: sm2 ? sm2.bbl_listed_count : null, listed_atrium: sm2 ? sm2.atrium_listed_count : null, listed_boost: sm2 ? sm2.boost_listed_count : null,
      floor_usd: fh && fh.per_tier && fh.per_tier.base ? fh.per_tier.base.listing_floor_usd : null, floor_date: fh ? fh.date : null, sales_floor_usd: fh && fh.per_tier && fh.per_tier.base ? fh.per_tier.base.sales_floor_usd : null,
      floor_bbl: venueFloor('bbl'), floor_atrium: venueFloor('atrium'), floor_boost: venueFloor('boost'),
      sales_count: get(an, 'volume.sales_count'), volume_usd_at_sale: get(an, 'volume.usd_at_sale'), volume_usd_today: get(an, 'volume.value_today_usd'), volume_luna: get(an, 'volume.luna_equiv_total'),
      first_sale: get(an, 'first_sale.date'), last_sale: get(an, 'last_sale.date'), captured_at: sm2 ? sm2.capturedAt : null,
    };
    D.pl.listed_total = sum([D.pl.listed_bbl, D.pl.listed_atrium, D.pl.listed_boost]);
    D.pl.staked_total = sum([D.pl.staked_daodao, D.pl.staked_enterprise]);
    D.pl.staked_pct = isNum(D.pl.staked_total) && isNum(D.pl.supply) ? D.pl.staked_total / D.pl.supply * 100 : null;
    D.pl.market_cap_usd = isNum(D.pl.floor_usd) && isNum(D.pl.minted) ? D.pl.floor_usd * D.pl.minted : null;
    // staking APR: the number is UNKNOWN until the distributor contract is read; the would-be figure is shown as arithmetic, labeled
    var target = cfg.staking_apr && isNum(cfg.staking_apr.target_tokens_per_year) ? cfg.staking_apr.target_tokens_per_year : null;
    var stakedForApr = isNum(D.pl.staked_daodao) ? D.pl.staked_daodao : null;
    D.pl.apr = { value_pct: null, verified: false, target_per_year: target, per_nft_per_year: target && stakedForApr ? target / stakedForApr : null };
    D.pl.apr.per_nft_usd_per_year = isNum(D.pl.apr.per_nft_per_year) && isNum(D.roar.price_usd) ? D.pl.apr.per_nft_per_year * D.roar.price_usd : null;
    D.pl.apr.would_be_pct_at_floor = isNum(D.pl.apr.per_nft_usd_per_year) && isNum(D.pl.floor_usd) && D.pl.floor_usd > 0 ? D.pl.apr.per_nft_usd_per_year / D.pl.floor_usd * 100 : null;
    // mint (lazy)
    var mint = S.col_mint || null;
    if (mint && mint.by_token) {
      var byBuyer = {}; var totLuna = 0, totUsd = 0, n = 0; var priceLuna = {};
      Object.keys(mint.by_token).forEach(function (id) { var r = mint.by_token[id]; if (!r || !r.buyer) return; n++; var lu = r.price && r.price.denom === 'uluna' ? Number(r.price.amount) / 1e6 : null; if (isNum(lu)) { totLuna += lu; priceLuna[lu] = (priceLuna[lu] || 0) + 1; } if (isNum(r.usd)) totUsd += r.usd; var b = byBuyer[r.buyer] = byBuyer[r.buyer] || { address: r.buyer, count: 0, luna: 0, usd: 0 }; b.count++; if (isNum(lu)) b.luna += lu; if (isNum(r.usd)) b.usd += r.usd; });
      var top = Object.keys(byBuyer).map(function (a) { return byBuyer[a]; }).sort(function (a, b) { return b.count - a.count; });
      var modePrice = Object.keys(priceLuna).sort(function (a, b) { return priceLuna[b] - priceLuna[a]; })[0];
      D.mint = { tokens: n, paid: mint.paid, free: mint.free_or_admin, total_luna: totLuna, total_usd: mint.total_usd != null ? mint.total_usd : totUsd, unique_minters: top.length, top_minters: top.slice(0, 12), typical_price_luna: modePrice != null ? Number(modePrice) : null, launchpad: mint.launchpad || null, first_at: null, last_at: null };
      var ts = Object.keys(mint.by_token).map(function (id) { return mint.by_token[id] && mint.by_token[id].ts; }).filter(Boolean).sort(); D.mint.first_at = ts[0] || null; D.mint.last_at = ts[ts.length - 1] || null;
    } else D.mint = null;
    // sales (lazy)
    var sales = S.col_sales && Array.isArray(S.col_sales.sales) ? S.col_sales.sales : null;
    D.sales = sales ? { top: sales.filter(function (s) { return isNum(s.notional_usd); }).sort(function (a, b) { return b.notional_usd - a.notional_usd; }).slice(0, 10), count: sales.length, built_at: S.col_sales.builtAt } : null;
    // listings from the bundle
    var b = S.col_bundle; D.listings = null;
    if (b && Array.isArray(b.rows) && Array.isArray(b.fields)) {
      var F = {}; b.fields.forEach(function (f, i) { F[f] = i; }); var bits = b.flagBits || {};
      var rows = b.rows.filter(function (r) { return isNum(r[F.listing_usd]); }).map(function (r) { var fl = r[F.flags] || 0; return { id: String(r[F.id]), usd: r[F.listing_usd], rank: r[F.intended_rank], venue: (fl & (bits.bbl_listed || 0)) ? 'bbl' : (fl & (bits.atrium_listed || 0)) ? 'atrium' : (fl & (bits.boost_listed || 0)) ? 'boost' : null, chain_only: !!(fl & (bits.listing_chain_only || 0)) }; });
      rows.sort(function (a, c) { return a.usd - c.usd; });
      D.listings = { rows: rows, count: rows.length, built_at: b.builtAt };
    }
    D.luna = { price_usd: lunaUsd, chg_24h_pct: chg('LUNA', 'price_change_24h_pct') };
    // ---- another chain's token: the most liquid pair DexScreener lists (their numbers, their label)
    var ds = S.dexscreener && Array.isArray(S.dexscreener.pairs) && S.dexscreener.pairs.length ? S.dexscreener.pairs.slice().sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); })[0] : null;
    D.roar20 = { mint: T.roar20 ? T.roar20.mint : null, chain: T.roar20 ? T.roar20.chain : null, price_usd: ds && isFinite(Number(ds.priceUsd)) ? Number(ds.priceUsd) : null, market_cap_usd: ds && isNum(ds.marketCap) ? ds.marketCap : null, fdv_usd: ds && isNum(ds.fdv) ? ds.fdv : null, volume_24h_usd: ds && ds.volume && isNum(ds.volume.h24) ? ds.volume.h24 : null, liquidity_usd: ds && ds.liquidity && isNum(ds.liquidity.usd) ? ds.liquidity.usd : null, chg_24h_pct: ds && ds.priceChange && isNum(ds.priceChange.h24) ? ds.priceChange.h24 : null, dex: ds ? ds.dexId : null, pair_url: ds ? ds.url : null, source: ds ? 'DexScreener' : null };
    // 1.2.0: Solana RPC — supply and the 20 largest TOKEN ACCOUNTS (not wallets; the largest is usually a pool's vault, unverified here)
    var sup = S.sol_supply && S.sol_supply.value ? S.sol_supply.value : null; var lg = S.sol_largest && Array.isArray(S.sol_largest.value) ? S.sol_largest.value.filter(function (x) { return isNum(Number(x.uiAmount)); }).map(function (x) { return { address: x.address, amount: Number(x.uiAmount) }; }).sort(function (a, b) { return b.amount - a.amount; }) : null;
    D.roar20.supply = sup && isNum(Number(sup.uiAmount)) ? Number(sup.uiAmount) : null; D.roar20.supply_source = sup ? 'Solana RPC getTokenSupply' : null;
    if (D.roar20.supply == null && T.roar20 && isNum(T.roar20.supply_fixed)) { D.roar20.supply = T.roar20.supply_fixed; D.roar20.supply_source = 'registry (fixed at create)'; }   // 1.2.1
    D.roar20.top1_amount = lg && lg.length ? lg[0].amount : null; D.roar20.top1_address = lg && lg.length ? lg[0].address : null; D.roar20.top1_short = lg && lg.length ? fmt.short(lg[0].address) : null;
    D.roar20.top2_20 = lg && lg.length > 1 ? sum(lg.slice(1).map(function (x) { return x.amount; })) : (lg ? 0 : null); D.roar20.top20_count = lg ? lg.length : null;
    D.roar20.rest = isNum(D.roar20.supply) && isNum(D.roar20.top1_amount) && isNum(D.roar20.top2_20) ? D.roar20.supply - D.roar20.top1_amount - D.roar20.top2_20 : null;
    D.roar20.top1_pct = isNum(D.roar20.top1_amount) && isNum(D.roar20.supply) && D.roar20.supply > 0 ? D.roar20.top1_amount / D.roar20.supply * 100 : null;
    D.roar20.holders = null; D.roar20.holders_reason = 'holder count needs an indexer (Helius) — the ROAR20 cron duty';
    // 1.2.2: the roar20/holders product (Helius DAS, every token account folded to owners; program-owned vs wallet by the chain)
    var RH = S.roar20_holders && Array.isArray(S.roar20_holders.holders) ? S.roar20_holders : null;
    D.roar20.product = RH ? { captured_at: RH.capturedAt, holder_count: RH.holder_count, top10: RH.top10 || [], concentration: RH.concentration || null, gate_delta: RH.supply_gate ? RH.supply_gate.delta : null, source: 'dao-originations ' + (RH.product || 'roar20/holders') } : null;
    if (RH) { var kr = RH.kinds || {}; var amr = function (k) { return kr[k] && isNum(kr[k].amount) ? kr[k].amount : 0; };
      if (D.roar20.supply_source !== 'Solana RPC getTokenSupply' && isNum(RH.token && RH.token.supply)) { D.roar20.supply = RH.token.supply; D.roar20.supply_source = 'product ' + String(RH.capturedAt || '').slice(0, 10); }
      D.roar20.holders = RH.holder_count; D.roar20.holders_reason = null; D.roar20.p_program = amr('program'); D.roar20.p_top10_wallets = sum((RH.top10_wallets || []).map(function (h) { return h.amount; })) || 0; D.roar20.p_other_wallets = amr('wallet') + amr('unclassified') - D.roar20.p_top10_wallets;
      D.roar20.program_count = kr.program ? kr.program.holders : null; D.roar20.program_pct = RH.concentration ? RH.concentration.program_owned_pct : null; D.roar20.top10_wallets_pct = RH.concentration ? RH.concentration.top10_wallets_pct : null; D.roar20.product_day = String(RH.capturedAt || '').slice(0, 10); }
    else { D.roar20.p_program = null; D.roar20.p_top10_wallets = null; D.roar20.p_other_wallets = null; }
    // ---- 1.2.0: our ledger folded per venue (lazy: undefined while sales-enriched is still loading, null if it failed)
    var vkey = function (m) { m = String(m || '').toLowerCase(); return m.indexOf('bbl') === 0 ? 'bbl' : m.indexOf('boost') === 0 ? 'boost' : m.indexOf('atrium') === 0 ? 'atrium' : 'other'; };
    if (sales) { var BV = {}; sales.forEach(function (x) { var k = vkey(x.marketplace); var v = BV[k] = BV[k] || { count: 0, usd_at_sale: 0, usd_today: 0, native: {} }; v.count++; if (isNum(x.notional_usd)) v.usd_at_sale += x.notional_usd; if (isNum(x.value_today_usd)) v.usd_today += x.value_today_usd; if (x.denom_symbol && isNum(x.amount)) { var n = v.native[x.denom_symbol] = v.native[x.denom_symbol] || { amount: 0, usd: 0 }; n.amount += x.amount; n.usd += isNum(x.notional_usd) ? x.notional_usd : 0; } }); D.sales_by_venue = BV; } else D.sales_by_venue = S.col_sales === null ? null : undefined;
    // ---- 1.2.0: pyROAR by who holds it — live token_info + roster balances + the festival receiver; the burners are the black remainder until the burn ledger
    var pyi = S.lcd_pyroar_info; var pyDec = pyi && isNum(Number(pyi.decimals)) ? Number(pyi.decimals) : 6; var pyBal = function (k) { var r = S[k]; return r && r.balance !== undefined ? human(r.balance, pyDec) : null; };
    var pyRoster = Object.keys(wallets).map(function (a) { return pyBal('lcd_pyroar_' + a); }); var brp = T.burn && T.burn.reported || {};
    D.pyroar = { cw20: T.burn ? T.burn.pyroar_cw20 || null : null, total_supply: pyi && pyi.total_supply != null ? human(pyi.total_supply, pyDec) : null, decimals: pyDec,
      held_roster: pyRoster.some(isNum) ? sum(pyRoster) : null, held_receiver: pyBal('lcd_pyroar_receiver'),
      reported_community: brp.community_burned == null ? null : brp.community_burned, reported_dao: brp.dao_burned == null ? null : brp.dao_burned, reported_participants: brp.participants == null ? null : brp.participants, reported_top_wallet: brp.top_wallet_burned == null ? null : brp.top_wallet_burned };
    // 1.2.1: the registry's measured figure stands in for a failed read, labeled and dated (the festival is over; the figure does not move)
    D.pyroar.total_source = D.pyroar.total_supply != null ? 'live' : null;
    if (D.pyroar.total_supply == null && T.burn && isNum(T.burn.pyroar_supply_measured)) { D.pyroar.total_supply = T.burn.pyroar_supply_measured; D.pyroar.total_source = 'registry, measured ' + String((T.burn.pyroar_supply_measured_note || '').match(/\d{4}-\d{2}-\d{2}/) || ['']); }
    D.pyroar.burners_remainder = isNum(D.pyroar.total_supply) && isNum(D.pyroar.held_roster) && isNum(D.pyroar.held_receiver) ? D.pyroar.total_supply - D.pyroar.held_roster - D.pyroar.held_receiver : null;
    // 1.2.2: the burn/holders product (every account, walked whole; kinds by the registry and the chain) — when it is here, the breakdown is measured
    var PH = S.pyroar_holders && Array.isArray(S.pyroar_holders.holders) ? S.pyroar_holders : null;
    D.pyroar.product = PH ? { captured_at: PH.capturedAt, holder_count: PH.holder_count, top10: PH.top10 || [], concentration: PH.concentration || null, gate_delta: PH.supply_gate ? PH.supply_gate.delta : null, source: 'dao-originations ' + (PH.product || 'burn/holders') } : null;
    if (PH) { var kp = PH.kinds || {}; var amt = function (k) { return kp[k] && isNum(kp[k].amount) ? kp[k].amount : 0; }; var top10w = (PH.holders || []).filter(function (h) { return h.kind === 'wallet' || h.kind === 'unclassified' || h.kind === 'trust'; }).slice(0, 10);
      if (D.pyroar.total_source !== 'live' && isNum(PH.token && PH.token.total_supply)) { D.pyroar.total_supply = PH.token.total_supply; D.pyroar.total_source = 'product ' + String(PH.capturedAt || '').slice(0, 10); }
      D.pyroar.p_roster = amt('roster'); D.pyroar.p_receiver = amt('receiver'); D.pyroar.p_contracts = amt('contract'); D.pyroar.p_top10_wallets = sum(top10w.map(function (h) { return h.amount; })) || 0; D.pyroar.p_other_wallets = amt('wallet') + amt('unclassified') + amt('trust') - D.pyroar.p_top10_wallets;
      D.pyroar.holder_count = PH.holder_count; D.pyroar.top1_label = PH.top10 && PH.top10[0] ? (PH.top10[0].label || fmt.short(PH.top10[0].address)) : null; D.pyroar.top1_pct = PH.concentration ? PH.concentration.top1_pct : null; D.pyroar.top10_pct = PH.concentration ? PH.concentration.top10_pct : null; D.pyroar.product_day = String(PH.capturedAt || '').slice(0, 10); }
    else { D.pyroar.p_roster = D.pyroar.held_roster; D.pyroar.p_receiver = D.pyroar.held_receiver; D.pyroar.p_contracts = null; D.pyroar.p_top10_wallets = null; D.pyroar.p_other_wallets = null; D.pyroar.holder_count = null; }
    D.pyroar.held_roster_pct = isNum(D.pyroar.held_roster) && isNum(D.pyroar.total_supply) && D.pyroar.total_supply > 0 ? D.pyroar.held_roster / D.pyroar.total_supply * 100 : null;
    // ---- 1.2.3: Burning Lions — supply from the chain (cw721 num_tokens), the registry's figure labeled when the read fails
    var bl = T.burning_lions || {}; var nt = S.lcd_bl_num_tokens && isNum(Number(S.lcd_bl_num_tokens.count)) ? Number(S.lcd_bl_num_tokens.count) : null;
    D.bl = { contract: bl.contract || null, supply: nt != null ? nt : (isNum(bl.supply) ? bl.supply : null), supply_source: nt != null ? 'live: cw721 num_tokens' : (isNum(bl.supply) ? 'registry (' + (bl.supply_source || 'owner') + ')' : null), name: S.lcd_bl_info && S.lcd_bl_info.name || null, symbol: S.lcd_bl_info && S.lcd_bl_info.symbol || null, onboarded: !!bl.onboarded };
    // ---- 1.2.3: the collection's NFT-staking rewards distributor, from the positions product (ally-positions 1.2.0 pl_rewards): rates, APR, pending
    var PR = S.positions && S.positions.pl_rewards && Array.isArray(S.positions.pl_rewards.distributions) ? S.positions.pl_rewards : null;
    D.pl_rewards = PR ? { distributor: PR.distributor, distributions: PR.distributions.map(function (d) { return { id: d.id, denom: d.denom || null, symbol: d.symbol || fmt.short(d.denom || ''), emission_per_year: d.emission_per_year, per_token_per_year: d.per_token_per_year, per_token_usd_per_year: d.per_token_usd_per_year, rate_note: d.rate_note, funded_amount: d.funded_amount, price_usd: d.price_usd }; }), apr: PR.apr || null, staked_count: PR.staked_count, pending_by_wallet: PR.pending_by_wallet || {}, captured_at: S.positions.capturedAt } : null;
    // 1.2.4 (owner): the staker's number is a RATE — ROAR per staked lion per hour (the contract pays hourly; the share moves only with the staked count). No floor, no APR.
    if (D.pl_rewards) { var roarD = D.pl_rewards.distributions.filter(function (d) { return st.roar_cw20 && d.denom === st.roar_cw20 && isNum(d.per_token_per_year); })[0];   /* the headline token is the registry's (staking.roar_cw20), never a literal here */ var others = D.pl_rewards.distributions.filter(function (d) { return d !== roarD && isNum(d.per_token_per_year); });
      D.pl_rewards.roar_per_lion_per_hour = roarD ? roarD.per_token_per_year / 8760 : null; D.pl_rewards.roar_per_lion_per_day = roarD ? roarD.per_token_per_year / 365 : null; D.pl_rewards.roar_per_lion_per_year = roarD ? roarD.per_token_per_year : null; D.pl_rewards.roar_usd_per_lion_per_year = roarD && isNum(roarD.per_token_usd_per_year) ? roarD.per_token_usd_per_year : null;
      D.pl_rewards.others_per_hour = others.length ? others.map(function (d) { return fmt.big(d.per_token_per_year / 8760) + ' ' + d.symbol + '/hour' + (isNum(d.per_token_usd_per_year) ? '' : ' (unpriced)'); }).join(' · ') : null; D.pl_rewards.rate_source = roarD ? roarD.rate_note + ' to ' + fmt.int(D.pl_rewards.staked_count) + ' staked' : null; }
    if (D.pl_rewards && D.pl_rewards.apr && isNum(D.pl_rewards.apr.apr_pct_at_floor)) { D.pl.apr.value_pct = D.pl_rewards.apr.apr_pct_at_floor; D.pl.apr.verified = true; D.pl.apr.source = 'ally-positions pl_rewards: Σ(rate/yr ÷ staked × price) ÷ ' + fmt.usd(D.pl_rewards.apr.floor_usd) + ' floor'; D.pl.apr.per_token_usd_per_year = D.pl_rewards.apr.usd_per_token_per_year; D.pl.apr.unpriced = D.pl_rewards.apr.unpriced || []; }
    else if (D.pl_rewards) { D.pl.apr.source = 'ally-positions pl_rewards read the distributor but no rate priced: ' + ((D.pl_rewards.apr && D.pl_rewards.apr.note) || ''); }
    else D.pl.apr.source = (T.staking && T.staking.pl_rewards_distributor) ? 'the distributor is registered; the positions product has not read it yet' : 'distributor not registered';
    // ---- burn: what the registry carries as REPORTED (the ally's own published figures, never ours) until the capture reads the chain
    var br = T.burn && T.burn.reported || {};
    D.burn = { reported_total: sum([br.community_burned, br.dao_burned]), reported_community: br.community_burned == null ? null : br.community_burned, reported_dao: br.dao_burned == null ? null : br.dao_burned, reported_participants: br.participants == null ? null : br.participants, reported_top_wallet: br.top_wallet_burned == null ? null : br.top_wallet_burned, reported_as_of: br.as_of || null, reported_source: br.source || null, receiver: T.burn ? T.burn.festival_receiver : null, measured_total: null, measured_note: 'capture not built yet (pyROAR ledger / receiver events)',
      initial_supply: T.burn && isNum(T.burn.initial_supply) ? T.burn.initial_supply : null, pyroar_cw20: T.burn ? T.burn.pyroar_cw20 || null : null };
    // supply delta: initial (registry, source-labeled) − live total_supply (contract) — a derived figure, shown beside the reported one
    D.burn.supply_delta = isNum(D.burn.initial_supply) && isNum(D.roar.total_supply) ? D.burn.initial_supply - D.roar.total_supply : null;
    D.burn.reported_vs_delta = isNum(D.burn.supply_delta) && isNum(D.burn.reported_total) ? D.burn.reported_total - D.burn.supply_delta : null;
    return D;
  }

  // ---------------------------------------------------------------- CSS (theme knobs come from tenants.json via the page's CSS vars)
  var CSS = [
    '.ht{--ht-accent:var(--t-accent,#ffe600);--ht-accent2:var(--t-accent2,#f59e0b);--ht-surface:var(--t-surface,#161616);--ht-surface2:var(--t-surface2,#101010);--ht-border:var(--t-border,#4a4000);--ht-text:var(--t-text,#e5e7eb);--ht-muted:#a3a3a3;--ht-font:var(--t-font,"Press Start 2P",Inter,sans-serif);color:var(--ht-text);font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.45}',
    '.ht *{box-sizing:border-box}.ht a{color:inherit}',
    '.ht-sec{margin:0 0 1.5rem}.ht-h{font-family:var(--ht-font);font-size:.72rem;color:var(--ht-accent);letter-spacing:.02em;margin:0 0 .75rem;display:flex;align-items:baseline;gap:.75rem;flex-wrap:wrap}.ht-h small{font-family:Inter,sans-serif;font-size:.78rem;color:var(--ht-muted);letter-spacing:0}',
    '.ht-tile{background:var(--ht-surface);border:2px solid var(--ht-border);padding:.9rem 1rem;min-width:0}.ht-tile.ht-hard{box-shadow:6px 6px 0 var(--ht-accent)}',
    '.ht-k{font-size:.78rem;color:var(--ht-muted);margin:0 0 .35rem}.ht-v{font-family:var(--ht-font);font-size:1.05rem;color:#fff;line-height:1.5;word-break:break-word}.ht-v.ht-v-sm{font-size:.8rem}.ht-s{font-size:.78rem;color:var(--ht-muted);margin-top:.35rem}.ht-s b{color:var(--ht-text);font-weight:600}',
    '.ht-unk{display:inline-block;font-family:var(--ht-font);font-size:.62rem;color:var(--ht-accent);border:1px dashed var(--ht-accent);padding:.35rem .5rem;line-height:1;cursor:help}',
    '.ht-chip{display:inline-block;font-size:.7rem;font-weight:600;color:#111;background:var(--ht-accent);padding:.15rem .45rem;line-height:1.4;margin-right:.35rem}.ht-chip.ht-chip-o{background:transparent;color:var(--ht-accent);border:1px solid var(--ht-accent)}',
    '.ht-src{font-size:.7rem;color:#737373;margin-top:.5rem}',
    '.ht-grid{display:grid;gap:.9rem}.ht-g4{grid-template-columns:repeat(4,minmax(0,1fr))}.ht-g5{grid-template-columns:repeat(5,minmax(0,1fr))}.ht-g3{grid-template-columns:repeat(3,minmax(0,1fr))}.ht-g2{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '@media(max-width:1100px){.ht-g5{grid-template-columns:repeat(3,minmax(0,1fr))}.ht-g4{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.ht-g5,.ht-g4,.ht-g3,.ht-g2{grid-template-columns:1fr}.ht-tile.ht-hard{box-shadow:4px 4px 0 var(--ht-accent)}}',
    // hero: the mane band is the one loud thing on the page
    '.ht-hero{border:1px solid var(--ht-border);background:radial-gradient(110% 160% at 100% 50%,rgba(255,230,0,.14),rgba(245,158,11,.05) 38%,transparent 62%),var(--ht-surface2);position:relative;overflow:hidden;padding:1.8rem 1.6rem 1.6rem;box-shadow:inset 0 0 0 1px rgba(255,230,0,.08),0 24px 70px -40px rgba(255,230,0,.45)}.ht-hero-mane{border-left:4px solid var(--ht-accent)}',
    '.ht-mane{position:absolute;right:-3rem;top:50%;width:24rem;height:24rem;transform:translateY(-50%) rotate(0deg);border-radius:50%;background:repeating-conic-gradient(from 0deg,var(--ht-accent) 0 2.5deg,transparent 2.5deg 8deg);-webkit-mask:radial-gradient(circle,transparent 30%,#000 33%,#000 58%,transparent 66%);mask:radial-gradient(circle,transparent 30%,#000 33%,#000 58%,transparent 66%);opacity:.32;pointer-events:none;animation:ht-mane-turn 120s linear infinite}.ht-mane.ht-mane-b{width:32rem;height:32rem;right:-7rem;background:repeating-conic-gradient(from 4deg,var(--ht-accent2) 0 1.5deg,transparent 1.5deg 6deg);-webkit-mask:radial-gradient(circle,transparent 40%,#000 43%,#000 60%,transparent 70%);mask:radial-gradient(circle,transparent 40%,#000 43%,#000 60%,transparent 70%);opacity:.14;animation-direction:reverse;animation-duration:200s}@keyframes ht-mane-turn{to{transform:translateY(-50%) rotate(360deg)}}@media(prefers-reduced-motion:reduce){.ht-mane{animation:none}}.ht-medal{position:absolute;right:5.4rem;top:50%;transform:translateY(-50%);width:9rem;height:9rem;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff3a0,var(--ht-accent) 30%,var(--ht-accent2) 62%,#5a3600 100%);box-shadow:0 0 0 5px var(--ht-bg),0 0 0 7px var(--ht-accent),0 0 46px rgba(255,230,0,.45);display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none}.ht-medal img{width:78%;height:78%;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}.ht-medal.ht-medal-x img{display:none}.ht-hero-mane .ht-hero-t,.ht-hero-mane .ht-hero-l,.ht-hero-mane .ht-hero-s{position:relative;max-width:calc(100% - 22rem)}@media(max-width:900px){.ht-mane,.ht-medal{display:none}.ht-hero-mane .ht-hero-t,.ht-hero-mane .ht-hero-l,.ht-hero-mane .ht-hero-s{max-width:none}}',
    '.ht-hero-t{font-family:var(--ht-font);font-size:1.5rem;color:var(--ht-accent);margin:.6rem 0 .5rem;line-height:1.6}.ht-hero-l{font-size:1rem;color:var(--ht-text);max-width:60ch}.ht-hero-s{margin-top:.9rem;font-size:.9rem;color:var(--ht-muted)}.ht-hero-s b{color:#fff;font-weight:600}',
    '.ht-lfr{font-family:var(--ht-font);font-size:.62rem;color:#111;background:var(--ht-accent);display:inline-block;padding:.45rem .6rem;line-height:1;margin-left:.5rem;vertical-align:middle}',
    '@media(max-width:640px){.ht-hero-t{font-size:1rem}.ht-hero{padding:1.3rem 1.1rem}}',
    // nav tiles
    '.ht-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.9rem}.ht-nav .ht-tile{cursor:pointer;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;min-height:6.2rem;position:relative}.ht-nav .ht-tile:hover,.ht-nav .ht-tile:focus-visible{border-color:var(--ht-accent);outline:none}.ht-nav .ht-tile.ht-tall{grid-row:span 2}',
    '.ht-nav .ht-nt{font-family:var(--ht-font);font-size:.62rem;color:#fff;line-height:1.7}.ht-nav .ht-nd{font-size:.8rem;color:var(--ht-muted);margin-top:.4rem;line-height:1.4}.ht-nav .ht-tile.ht-soon .ht-nt{color:var(--ht-muted)}.ht-nav i{color:var(--ht-accent);font-size:1.1rem;margin-bottom:.5rem}',
    '.ht-menu{position:absolute;left:0;right:0;top:100%;z-index:30;background:var(--ht-surface2);border:2px solid var(--ht-accent);padding:.4rem;display:none}.ht-menu.ht-on{display:block}.ht-menu a{display:block;font-size:.8rem;padding:.4rem .5rem;text-decoration:none;color:var(--ht-text)}.ht-menu a:hover{background:var(--ht-surface);color:var(--ht-accent)}.ht-menu .ht-mnote{font-size:.7rem;color:#737373;padding:.3rem .5rem}',
    '@media(max-width:1100px){.ht-nav{grid-template-columns:repeat(3,minmax(0,1fr))}.ht-nav .ht-tile.ht-tall{grid-row:span 1}}@media(max-width:640px){.ht-nav{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.ht-sheet{margin-top:.9rem;background:var(--ht-surface);border:2px solid var(--ht-accent);padding:1rem;display:none}.ht-sheet.ht-on{display:block}.ht-sheet h4{font-family:var(--ht-font);font-size:.65rem;color:var(--ht-accent);margin:0 0 .6rem}.ht-sheet p{margin:0 0 .5rem;font-size:.85rem}.ht-x{float:right;background:none;border:1px solid var(--ht-border);color:var(--ht-muted);font-size:.75rem;padding:.2rem .5rem;cursor:pointer}',
    // supply bars
    '.ht-bar{margin:.5rem 0 .35rem;height:16px;background:#000;border:1px solid var(--ht-border);display:flex;overflow:hidden}.ht-bar span{display:block;height:100%}.ht-leg{display:flex;flex-wrap:wrap;gap:.35rem 1rem;font-size:.75rem;color:var(--ht-muted)}.ht-leg i{display:inline-block;width:.7rem;height:.7rem;vertical-align:-1px;margin-right:.3rem}.ht-leg b{color:#fff;font-weight:600}',
    // rows + total strip
    '.ht-total{background:var(--ht-surface);border:2px solid var(--ht-border);padding:.8rem 1rem;margin-top:.9rem;display:flex;flex-wrap:wrap;gap:.4rem 1rem;align-items:baseline;font-size:.85rem;color:var(--ht-muted)}.ht-total b{color:#fff;font-weight:600}.ht-total .ht-tt{font-family:var(--ht-font);font-size:.75rem;color:var(--ht-accent)}.ht-total .ht-tsum{font-family:var(--ht-font);font-size:.95rem;color:var(--ht-accent)}',
    // lists
    '.ht-list{display:flex;flex-direction:column}.ht-row{display:grid;grid-template-columns:auto 1fr auto;gap:.75rem;align-items:center;padding:.5rem .25rem;border-bottom:1px solid var(--ht-border);font-size:.85rem}.ht-row:last-child{border-bottom:0}.ht-row img{width:40px;height:40px;object-fit:cover;image-rendering:pixelated;border:1px solid var(--ht-border);background:#000}.ht-row .ht-r1{color:#fff;font-weight:600}.ht-row .ht-r2{font-size:.75rem;color:var(--ht-muted)}.ht-row .ht-rv{text-align:right;font-family:var(--ht-font);font-size:.62rem;color:var(--ht-accent);white-space:nowrap}.ht-row .ht-rv small{display:block;font-family:Inter,sans-serif;font-size:.7rem;color:var(--ht-muted);margin-top:.25rem}',
    '.ht-tabs{display:flex;flex-wrap:wrap;gap:.35rem;margin:0 0 .6rem}.ht-tab{font-size:.72rem;font-weight:600;padding:.25rem .55rem;border:1px solid var(--ht-border);background:transparent;color:var(--ht-muted);cursor:pointer}.ht-tab.ht-on{background:var(--ht-accent);color:#111;border-color:var(--ht-accent)}.ht-tab:disabled{opacity:.5;cursor:default}',
    '.ht-more{font-size:.75rem;color:var(--ht-accent);background:none;border:0;cursor:pointer;padding:.5rem 0}',
    '.ht-note{font-size:.8rem;color:var(--ht-muted);padding:.75rem;border:1px dashed var(--ht-border)}',
    '.ht-la .la-row{background:transparent!important}',
    // 1.2.0 market layout (aDAO's places)
    '.ht-mk-top{justify-content:space-between;flex-wrap:wrap}.ht-ctabs{display:inline-flex;gap:.35rem;flex-wrap:wrap}.ht-ctab{font-family:Inter,system-ui,sans-serif;font-size:.72rem;font-weight:600;padding:.25rem .6rem;border:1px solid var(--ht-border);color:var(--ht-muted);letter-spacing:0}.ht-ctab.ht-on{background:rgba(255,230,0,.14);color:var(--ht-accent);border-color:var(--ht-accent)}.ht-ctab.ht-off{opacity:.45;cursor:not-allowed}.ht-ctab i{margin-right:.35rem}',
    '.ht-venue{padding:.8rem .9rem}.ht-venue-h{display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem;font-size:.9rem;color:#fff}.ht-venue-h img{width:22px;height:22px;object-fit:contain}.ht-view{margin-left:auto;font-size:.7rem;color:var(--ht-muted);text-decoration:none}.ht-view:hover{color:var(--ht-accent)}',
    '.ht-mk-box{background:#000;border:1px solid var(--ht-border);padding:.55rem .7rem}.ht-mrow{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;padding:.28rem 0;font-size:.82rem}.ht-mk-k{color:var(--ht-muted);white-space:nowrap}.ht-mk-v{text-align:right;color:#fff}.ht-mk-sub{font-size:.68rem;color:var(--ht-muted)}.ht-mrow-sep{border-top:1px solid var(--ht-border);margin-top:.25rem;padding-top:.45rem}.ht-mrow-t{font-size:.72rem;padding:.12rem 0}.ht-mrow-t .ht-mk-k{color:#f87171}.ht-mrow-t+.ht-mrow-t .ht-mk-k{color:#4ade80}.ht-mrow-t+.ht-mrow-t+.ht-mrow-t .ht-mk-k{color:#737373}',
    '.ht-mono{font-variant-numeric:tabular-nums}.ht-y{color:var(--ht-accent)}.ht-g{color:#4ade80}.ht-c{color:#22d3ee}.ht-p{color:#c084fc}.ht-dim{color:#737373}.ht-center{text-align:center}.ht-hidden{display:none!important}',
    '.ht-mk{padding:.9rem 1rem}.ht-mk-h{display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem}.ht-mk-t{font-family:var(--ht-font);font-size:.72rem;color:#fff;display:flex;align-items:center;gap:.5rem}.ht-mk-t small{font-family:Inter,system-ui,sans-serif;font-size:.75rem;color:var(--ht-muted);font-weight:400}.ht-scroll{max-height:460px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#4a4000 #000}.ht-tg{display:inline-flex;align-items:center;gap:.3rem;margin-right:.6rem}.ht-tg small{font-size:.68rem;color:var(--ht-muted);margin-right:.15rem}',
    '.ht-lgrid.ht-scroll{max-height:600px}.ht-lgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem;padding-right:.25rem}@media(max-width:1100px){.ht-lgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.ht-lgrid{grid-template-columns:1fr}}',
    '.ht-lcard{display:grid;grid-template-columns:auto 1fr auto;gap:.6rem;align-items:center;padding:.5rem .6rem;background:#000;border:1px solid var(--ht-border);text-decoration:none;color:inherit;min-width:0}.ht-lcard:hover{border-color:var(--ht-accent)}.ht-lcard img,.ht-lc-img{width:44px;height:44px;object-fit:cover;image-rendering:pixelated;border:1px solid var(--ht-border);background:#111;display:block}.ht-lc-b{min-width:0;display:flex;flex-direction:column;gap:.15rem}.ht-lc-n{font-size:.8rem;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ht-lc-s{font-size:.7rem;color:var(--ht-muted)}.ht-lc-p{text-align:right;display:flex;flex-direction:column;gap:.1rem}.ht-lc-p b{font-size:.9rem;font-variant-numeric:tabular-nums}.ht-lc-p small{font-size:.66rem;color:var(--ht-muted);white-space:nowrap}',
    '.ht-addr{display:inline-flex;align-items:center;gap:.25rem;white-space:nowrap;font-size:.8em}.ht-addr code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.95em;color:var(--ht-text);background:transparent}.ht-addr b{color:#fff}.ht-copy,.ht-go{background:none;border:0;padding:.05rem .2rem;color:var(--ht-muted);cursor:pointer;font-size:.85em;line-height:1;text-decoration:none}.ht-copy:hover,.ht-go:hover{color:var(--ht-accent)}.ht-copy.ht-copied{color:#4ade80}.ht-copy.ht-copied::after{content:\'copied\';font-size:.7em;margin-left:.2rem;font-family:Inter,system-ui,sans-serif}',
    '.ht-btn{font-family:var(--ht-font);font-size:.62rem;color:var(--ht-accent);background:linear-gradient(90deg,rgba(255,230,0,.12),rgba(245,158,11,.12));border:1px solid rgba(255,230,0,.4);padding:.75rem 1.4rem;cursor:pointer;line-height:1}.ht-btn:hover{border-color:var(--ht-accent)}.ht-btn i{margin-right:.4rem}',
  ].join('\n');

  // ---------------------------------------------------------------- render primitives
  // 1.2.3 (owner): EVERY address is copy-and-go — short · copy · search (address catalog) · explorer (Chainscope / Solscan)
  function addr(a, opts) { opts = opts || {}; if (!a) return ''; var sol = opts.chain === 'solana' || (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && a.indexOf('terra') !== 0); var ex = sol ? 'https://solscan.io/account/' + encodeURIComponent(a) : 'https://chainsco.pe/terra2/address/' + a; var search = sol ? null : '/address-catalog.html?address=' + encodeURIComponent(a);
    return '<span class="ht-addr" title="' + esc(a) + '">' + (opts.label ? '<b>' + esc(opts.label) + '</b> ' : '') + '<code>' + esc(opts.full ? a : fmt.short(a)) + '</code><button type="button" class="ht-copy" data-copy="' + esc(a) + '" title="copy the full address" aria-label="copy"><i class="fa-regular fa-copy"></i></button>' + (search ? '<a class="ht-go" href="' + esc(search) + '" title="search this address on the site"><i class="fa-solid fa-magnifying-glass"></i></a>' : '') + '<a class="ht-go" href="' + esc(ex) + '" target="_blank" rel="noopener" title="' + (sol ? 'Solscan' : 'Chainscope') + '"><i class="fa-solid fa-arrow-up-right-from-square"></i></a></span>'; }
  function copyFallback(v) { try { var ta = G.document.createElement('textarea'); ta.value = v; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; G.document.body.appendChild(ta); ta.select(); G.document.execCommand('copy'); G.document.body.removeChild(ta); } catch (e) { } }
  function wireCopy() { if (G.document.__htCopyWired) return; G.document.__htCopyWired = true; G.document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('.ht-copy'); if (!b) return; ev.preventDefault(); ev.stopPropagation(); var v = b.getAttribute('data-copy') || ''; var done = function () { b.classList.add('ht-copied'); setTimeout(function () { b.classList.remove('ht-copied'); }, 1400); }; if (G.navigator && G.navigator.clipboard && G.navigator.clipboard.writeText) G.navigator.clipboard.writeText(v).then(done, function () { copyFallback(v); done(); }); else { copyFallback(v); done(); } }); }
  function unk(reason) { return '<span class="ht-unk" title="' + esc(reason || 'no source yet') + '">Coming</span>'; }   // 1.2.1 (owner): the chip says Coming — a number without a source yet; the reason stays on hover
  function val(v, reason) { return v == null ? unk(reason) : esc(v); }
  function metricTile(m, D) {
    var v = get(D, m.key); var shown = null;
    if (v != null) { var f = fmt[m.fmt || 'num']; shown = f ? f(v) : String(v); if (m.suffix && shown != null) shown += m.suffix; if (m.prefix && shown != null) shown = m.prefix + shown; }
    var sub = ''; if (m.sub) sub = fill(m.sub, D); if (shown == null && m.sub_unknown) sub = esc(m.sub_unknown);   /* 1.2.4: one plain line instead of a row of Coming chips */ if (m.sub_key) { var sv = get(D, m.sub_key); var sf = fmt[m.sub_fmt || 'num']; if (sv != null) sub = (m.sub_prefix || '') + (sf ? sf(sv) : sv) + (m.sub_suffix || ''); }
    var href = m.href ? ' onclick="' + (m.href.charAt(0) === '#' ? 'HomeTiles.openSheet(\'' + esc(m.href.slice(1)) + '\')' : 'location.href=\'' + esc(m.href) + '\'') + '" style="cursor:pointer"' : '';
    return '<div class="ht-tile"' + href + '><div class="ht-k">' + esc(m.label) + '</div><div class="ht-v' + (shown && shown.length > 12 ? ' ht-v-sm' : '') + '">' + (shown == null ? unk(m.unknown || m.reason) : esc(shown)) + '</div>' + (sub ? '<div class="ht-s">' + sub + '</div>' : '') + (m.source ? '<div class="ht-src">' + (/\{[a-z0-9_.|]+\}/i.test(m.source) ? fill(m.source, D) : esc(m.source)) + '</div>' : '') + '</div>';
  }
  // "{roar.price_usd|price}" templating in config strings; a missing value becomes an Unknown chip
  function fill(tpl, D) { return String(tpl).replace(/\{([a-z0-9_.]+)(?:\|([a-z]+))?\}/gi, function (_, k, f) { var v = get(D, k); if (v == null) return unk(); var fn = fmt[f]; return '<b>' + esc(fn ? fn(v) : v) + '</b>'; }); }

  function renderHero(sec, D, ctx) {
    var t = ctx.tenant || {};
    // 1.2.1 (owner: the ally's own look, not the collection's pixel look): the caution-tape edges are gone; a mane — two slow rings of golden rays — circles a medallion of the tenant's own logo (tenants.json <tenant>.logo)
    return '<section class="ht-sec"><div class="ht-hero ht-hero-mane"><div class="ht-mane"></div><div class="ht-mane ht-mane-b"></div>' + (t.logo ? '<div class="ht-medal" aria-hidden="true"><img src="' + esc(t.logo) + '" alt="" onerror="this.parentNode.classList.add(\'ht-medal-x\')"></div>' : '') +
      '<div class="ht-hero-t">' + esc(sec.title || t.label || '') + (sec.badge ? '<span class="ht-lfr">' + esc(sec.badge) + '</span>' : '') + '</div>' +
      (sec.line ? '<div class="ht-hero-l">' + esc(sec.line) + '</div>' : '') +
      (sec.status ? '<div class="ht-hero-s">' + fill(sec.status, D) + '</div>' : '') + '</div></section>';
  }
  function renderNav(sec, D, ctx) {
    var tiles = (sec.tiles || []).map(function (tl, i) {
      var cls = 'ht-tile' + (tl.tall ? ' ht-tall' : '') + (tl.kind === 'placeholder' || tl.soon ? ' ht-soon' : '');   // 1.1.0: a `soon` tile links to its page (a slot with a name) and reads muted
      var act = tl.kind === 'menu' ? 'HomeTiles.toggleMenu(this)' : tl.kind === 'placeholder' || tl.kind === 'sheet' ? 'HomeTiles.openSheet(\'' + esc(tl.sheet || tl.id) + '\')' : (tl.href ? 'location.href=\'' + esc(tl.href) + '\'' : '');
      var items = tl.kind === 'menu' ? '<div class="ht-menu">' + (tl.items || []).map(function (it) { return it.href ? '<a href="' + esc(it.href) + '"' + (/^https?:/.test(it.href) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(it.label) + '</a>' : '<div class="ht-mnote">' + esc(it.label) + '</div>'; }).join('') + (tl.note ? '<div class="ht-mnote">' + esc(tl.note) + '</div>' : '') + '</div>' : '';
      return '<div class="' + cls + '" role="button" tabindex="0" onclick="' + act + '" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}">' + (tl.icon ? '<i class="fas ' + esc(tl.icon) + '"></i>' : '') + '<div class="ht-nt">' + esc(tl.label) + (tl.kind === 'menu' ? ' ▾' : '') + '</div>' + (tl.desc ? '<div class="ht-nd">' + esc(tl.desc) + '</div>' : '') + (tl.kind === 'placeholder' ? '<div class="ht-nd">' + unk(tl.reason) + ' ' + esc(tl.reason || '') + '</div>' : '') + items + '</div>';
    }).join('');
    var sheets = (sec.sheets || []).map(function (sh) { return '<div class="ht-sheet" id="ht-sheet-' + esc(sh.id) + '" data-sheet="' + esc(sh.id) + '"><button class="ht-x" type="button" onclick="HomeTiles.closeSheets()">close</button><h4>' + esc(sh.title) + '</h4><div class="ht-sheet-b">' + (sh.body || []).map(function (p) { return '<p>' + fill(p, D) + '</p>'; }).join('') + (sh.render ? '<div data-sheet-render="' + esc(sh.render) + '"></div>' : '') + '</div></div>'; }).join('');
    return '<section class="ht-sec"><div class="ht-nav">' + tiles + '</div>' + sheets + '</section>';
  }
  function bar(parts, total, D, opts) {
    var cols = ['var(--ht-accent)', 'var(--ht-accent2)', '#d1d5db', '#7c7c7c', '#3f3f46', '#a16207'];
    // 1.2.0: a bar whose total is configured but unread draws NOTHING — a part drawn against the sum of the known parts reads as 100 % of a supply nobody measured (a phantom)
    var tot = total != null ? total : (opts && opts.hasTotal ? null : sum(parts.map(function (p) { return p.v; })));
    var segs = '', leg = ''; var acc = 0;
    parts.forEach(function (p, i) { var pctv = isNum(p.v) && isNum(tot) && tot > 0 ? p.v / tot * 100 : null; if (pctv != null) { segs += '<span style="width:' + Math.max(0, Math.min(100 - acc, pctv)) + '%;background:' + cols[i % cols.length] + '" title="' + esc(p.label) + '"></span>'; acc += pctv; }
      leg += '<span><i style="background:' + cols[i % cols.length] + '"></i>' + esc(p.label) + ' <b>' + (p.v == null ? unk(p.reason) : esc((p.fmt || fmt.big)(p.v))) + '</b>' + (pctv != null ? ' <span>' + pctv.toFixed(1) + '%</span>' : '') + '</span>'; });
    if (isNum(tot) && acc < 99.5) segs += '<span style="width:' + (100 - acc) + '%;background:#000" title="unattributed / unknown"></span>';
    return '<div class="ht-bar">' + segs + '</div><div class="ht-leg">' + leg + '</div>';
  }
  function renderSupply(sec, D) {
    var tiles = (sec.bars || []).map(function (b) {
      var parts = (b.parts || []).map(function (p) { return { label: p.label, v: get(D, p.key), reason: p.reason, fmt: p.fmt ? fmt[p.fmt] : null }; });
      var total = b.total_key ? get(D, b.total_key) : null;
      var tsrc = b.total_source_key ? get(D, b.total_source_key) : null; return '<div class="ht-tile"><div class="ht-k">' + esc(b.label) + (b.total_key ? ' · of <b>' + (total == null ? unk(b.total_reason) : esc((b.total_fmt ? fmt[b.total_fmt] : fmt.big)(total))) + '</b>' + (tsrc && /^(registry|product)/.test(String(tsrc)) ? ' <small class="ht-dim" title="the total is the registry\'s figure; the live read did not answer">' + esc(tsrc) + '</small>' : '') : '') + '</div>' + bar(parts, total, D, { hasTotal: !!b.total_key }) + (b.note ? '<div class="ht-src">' + fill(b.note, D) + '</div>' : '') + ((b.links || []).length ? '<div class="ht-src" style="margin-top:.35rem">' + b.links.map(function (l) { return '<a href="' + esc(l.href) + '" style="color:var(--ht-accent)">' + esc(l.label) + ' →</a>'; }).join(' · ') + '</div>' : '') + '</div>';
    }).join('');
    return '<section class="ht-sec"><div class="ht-h">' + esc(sec.title || '') + (sec.sub ? '<small>' + esc(sec.sub) + '</small>' : '') + '</div><div class="ht-grid ht-g' + Math.min((sec.bars || []).length || 1, 2) + '">' + tiles + '</div></section>';
  }
  function renderRow(sec, D) {
    var tiles = (sec.metrics || []).map(function (m) { return metricTile(m, D); }).join('');
    var total = '';
    if (sec.total) { var parts = (sec.total.parts_key ? (get(D, sec.total.parts_key) || []) : (sec.total.parts || []).map(function (p) { return { label: p.label, usd: get(D, p.key), note: p.reason }; }));
      var known = sum(parts.map(function (p) { return p.usd; }));
      total = '<div class="ht-total"' + (sec.total.href ? ' onclick="location.href=\'' + esc(sec.total.href) + '\'" style="cursor:pointer" role="link" tabindex="0"' : '') + '><span class="ht-tt">' + esc(sec.total.label) + '</span>' + parts.map(function (p) { return '<span>' + esc(p.label) + ' <b>' + (p.usd == null ? unk(p.note) : esc(fmt.usd(p.usd))) + '</b></span>'; }).join('<span>+</span>') + '<span>=</span><span class="ht-tsum">' + (known == null ? unk() : esc(fmt.usd(known))) + '</span>' + (parts.some(function (p) { return p.usd == null; }) ? '<span>known parts only</span>' : '') + '</div>'; }
    return '<section class="ht-sec"><div class="ht-h">' + esc(sec.title || '') + (sec.sub ? '<small>' + fill(sec.sub, D) + '</small>' : '') + '</div><div class="ht-grid ht-g' + Math.min(5, Math.max(2, (sec.metrics || []).length)) + '">' + tiles + '</div>' + total + '</section>';
  }
  function renderRewards(sec, D) {
    var tiles = (sec.groups || []).map(function (g) {
      var v = get(D, g.key); var lines = (g.lines || []).map(function (l) { return '<div class="ht-s">' + fill(l, D) + '</div>'; }).join('');
      var open = g.href ? ' onclick="location.href=\'' + esc(g.href) + '\'" style="cursor:pointer" role="link" tabindex="0" onkeydown="if(event.key===\'Enter\'){location.href=\'' + esc(g.href) + '\'}"' : '';
      return '<div class="ht-tile"' + open + '><div class="ht-k">' + esc(g.label) + (g.href ? ' <span style="float:right;color:var(--ht-accent);font-size:.7rem">open →</span>' : '') + '</div><div class="ht-v">' + (v == null ? unk(g.reason) : esc(fmt.usd(v))) + '</div>' + lines + (g.source ? '<div class="ht-src">' + esc(g.source) + '</div>' : '') + '</div>';
    }).join('');
    return '<section class="ht-sec"><div class="ht-h">' + esc(sec.title || '') + (sec.sub ? '<small>' + fill(sec.sub, D) + '</small>' : '') + '</div><div class="ht-grid ht-g' + ((sec.groups || []).length || 1) + '">' + tiles + '</div></section>';
  }
  // ---- market (1.2.0): aDAO's marketplace layout in aDAO's places — three venue cards (BBL · Boost · Atrium: floor, all-time
  //      volume, total sales, currently listed, class floors) · Live Activity full width with the kind chips · All Current
  //      Listings as a 3-column card grid with venue + class filters · Top 10 All-Time Sales behind a button.
  //      Floors + listed from the collection snapshot; volume + sales from our ledger (sales-enriched, folded per venue,
  //      lazy); listings from the explorer bundle (USD at today's prices; the bundle carries no native amount, so none is shown).
  var state = { listSort: 'asc', listClass: 'all', listVenue: 'all', listShown: 12, salesShown: 10, salesOpen: false, actKinds: null };
  var VENUES = [{ key: 'bbl', label: 'BBL Marketplace', logo: '/assets/images/BBL%20No%20Background.png' }, { key: 'boost', label: 'Boost Marketplace', logo: '/assets/images/Boost%20Logo.png' }, { key: 'atrium', label: 'Atrium Marketplace', logo: null }];
  var VENUE_SHORT = { bbl: 'BBL', boost: 'Boost', atrium: 'Atrium' };
  function venueUrl(ctx, key) { var man = ctx.primary && ctx.primary.manifest; var m = man && (man.marketplaces || []).filter(function (x) { return x.key === key; })[0]; return m && m.collection_url && ctx.primary.contract ? m.collection_url.replace('{contract}', ctx.primary.contract) : null; }
  function tokenName(ctx, id) { var pat = ctx.primary && ctx.primary.manifest && ctx.primary.manifest.token_name_pattern; return pat ? pat.replace('{id}', id) : ((ctx.primary && ctx.primary.label) || 'NFT') + ' #' + id; }
  function classOf(r, classes) { var hit = classes.filter(function (c) { return c.rule && (c.rule === 'rank1' ? r.rank === 1 : c.rule === 'base' ? r.rank !== 1 : false); })[0]; return hit ? hit.label : null; }
  function venueCard(v, sec, D, ctx, classes) {
    var f = get(D, 'pl.floor_' + v.key); var listed = get(D, 'pl.listed_' + v.key); var url = venueUrl(ctx, v.key);
    var sv = D.sales_by_venue === null ? null : (D.sales_by_venue ? (D.sales_by_venue[v.key] || { count: 0, usd_at_sale: 0, usd_today: 0, native: {} }) : undefined);   // undefined = still reading; null = product failed
    var row = function (k, val, cls) { return '<div class="ht-mrow' + (cls ? ' ' + cls : '') + '"><span class="ht-mk-k">' + k + '</span><span class="ht-mk-v">' + val + '</span></div>'; };
    var floor = f && f.usd != null ? '<b class="ht-mono ht-y">' + esc(fmt.num(f.amount)) + '</b> <small>' + esc(f.symbol) + '</small> <small class="ht-g">(' + esc(fmt.usd(f.usd, 2)) + ')</small>' : (f && f.count ? unk('listed in a token the price feed lacks') : (listed === 0 ? '<small class="ht-dim">no listings</small>' : unk('no listings read')));
    var nat = sv && sv.native ? Object.keys(sv.native).sort(function (x, y) { return sv.native[y].usd - sv.native[x].usd; }).map(function (d) { return fmt.num(sv.native[d].amount) + ' ' + d; }).join(' · ') : '';
    var vol = sv === undefined ? '<small class="ht-dim">reading our ledger…</small>' : sv === null ? unk('sales ledger did not load') : '<b class="ht-mono ht-c">' + esc(fmt.usd(sv.usd_at_sale)) + '</b> <small class="ht-dim">at sale time</small><div class="ht-mk-sub">' + esc(fmt.usd(sv.usd_today)) + ' at today\'s prices' + (nat ? ' · ' + esc(nat) : '') + '</div>';
    var sales = sv === undefined ? '<small class="ht-dim">…</small>' : sv === null ? unk('sales ledger did not load') : esc(fmt.int(sv.count)) + ' sales';
    var tiers = classes.filter(function (c) { return c.rule || c.disabled; }).map(function (c) {
      if (c.disabled) return row(esc(c.label) + ' FP', '<span class="ht-dim" title="' + esc(c.reason || '') + '">N/A</span>', 'ht-mrow-t');
      var rs = D.listings ? D.listings.rows.filter(function (r) { return r.venue === v.key && classOf(r, classes) === c.label; }) : null; var mn = rs && rs.length ? Math.min.apply(null, rs.map(function (r) { return r.usd; })) : null;
      return row(esc(c.label) + ' FP', rs == null ? unk('bundle not read') : (mn == null ? '<span class="ht-dim">N/A</span>' : '<span class="ht-g">from ' + esc(fmt.usd(mn, 2)) + '</span> <small class="ht-dim">· ' + rs.length + ' listed</small>'), 'ht-mrow-t');
    }).join('');
    return '<div class="ht-tile ht-venue"><div class="ht-venue-h">' + (v.logo ? '<img src="' + v.logo + '" alt="" onerror="this.style.display=\'none\'">' : '<i class="fas fa-gem ht-y"></i>') + '<b>' + esc(v.label) + '</b>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="ht-view"><i class="fas fa-external-link-alt"></i> View</a>' : '') + '</div>' +
      '<div class="ht-mk-box">' + row('Floor Price', floor) + row('All-Time Volume', vol) + row('Total Sales', sales) + row('Currently Listed', listed == null ? unk('snapshot not read') : '<b class="ht-c">' + esc(fmt.int(listed)) + '</b>', 'ht-mrow-sep') + tiers + '</div>' +
      '<div class="ht-src ht-center">floor & listings from the collection snapshot · volume & sales from our ledger</div></div>';
  }
  function renderMarket(sec, D, ctx) {
    var classes = sec.listing_classes || [{ id: 'all', label: 'All' }];
    var tabs = (sec.collection_tabs || []).map(function (t) { return '<span class="ht-ctab' + (t.active ? ' ht-on' : '') + (t.disabled ? ' ht-off' : '') + '" title="' + esc(t.reason || '') + '">' + (t.icon ? '<i class="fas ' + esc(t.icon) + '"></i>' : '') + esc(t.label) + '</span>'; }).join('');
    var cards = VENUES.map(function (v) { return venueCard(v, sec, D, ctx, classes); }).join('');
    return '<section class="ht-sec" id="ht-market"><div class="ht-h ht-mk-top"><span><i class="fas fa-store ht-c"></i> ' + esc(sec.title || '') + (sec.sub ? '<small>' + fill(sec.sub, D) + '</small>' : '') + '</span><span class="ht-ctabs">' + tabs + '</span></div>' +
      '<div class="ht-grid ht-g3 ht-venues">' + cards + '</div>' +
      '<div class="ht-tile ht-mk" style="margin-top:.9rem"><div class="ht-mk-h"><span class="ht-mk-t"><i class="fas fa-stream ht-p"></i> ' + esc(sec.activity_title || 'Live Activity') + '</span><span id="ht-act-count" class="ht-src" style="margin:0"></span></div><div id="ht-act-ctl" class="ht-tabs"></div><div id="ht-act-kinds" class="ht-tabs"></div><div id="ht-act" class="ht-la ht-scroll"><div class="ht-note">Loading the ledger…</div></div></div>' +
      '<div class="ht-tile ht-mk" style="margin-top:.9rem"><div class="ht-mk-h"><span class="ht-mk-t"><i class="fas fa-tags ht-y"></i> ' + esc(sec.listings_title || 'All Current Listings') + ' <small id="ht-list-count"></small></span><span class="ht-src" style="margin:0">Show: <span class="ht-ctab ht-on">' + esc((ctx.primary && ctx.primary.label) || '') + '</span></span></div><div id="ht-list-ctl" class="ht-tabs"></div><div id="ht-list" class="ht-lgrid ht-scroll"></div><div id="ht-list-more" class="ht-center"></div></div>' +
      '<div class="ht-tile ht-mk ht-center" style="margin-top:.9rem"><button type="button" class="ht-btn" onclick="HomeTiles.toggleSales()"><i class="fas fa-trophy"></i> ' + esc(sec.sales_title || 'Top 10 All-Time Sales') + '</button><div id="ht-sales" class="ht-list' + (state.salesOpen ? '' : ' ht-hidden') + '" style="text-align:left;margin-top:.6rem"></div><div id="ht-sales-count" class="ht-src' + (state.salesOpen ? '' : ' ht-hidden') + '"></div></div></section>';
  }
  function paintListings(sec, D, ctx) {
    var el = G.document.getElementById('ht-list'), ctl = G.document.getElementById('ht-list-ctl'), cnt = G.document.getElementById('ht-list-count'), more = G.document.getElementById('ht-list-more'); if (!el) return;
    var L = D.listings; if (!L) { el.innerHTML = '<div class="ht-note">' + unk('explorer bundle not read') + ' the listings bundle did not load.</div>'; return; }
    var classes = sec.listing_classes || [{ id: 'all', label: 'All' }];
    var byVenue = L.rows.filter(function (r) { var c = classes.filter(function (x) { return x.id === state.listClass; })[0]; if (!c || !c.rule) return true; return classOf(r, classes) === c.label; });
    var rows = byVenue.filter(function (r) { return state.listVenue === 'all' || r.venue === state.listVenue; });
    rows = rows.slice().sort(function (a, b) { return state.listSort === 'asc' ? a.usd - b.usd : b.usd - a.usd; });
    var img = function (id) { try { return ctx.primary && ctx.primary.assets && ctx.primary.assets.image ? ctx.primary.assets.image(id) : null; } catch (e) { return null; } };
    var explorer = sec.explorer_href || '/nft-explorer-index.html';
    var grp = function (label, items) { return '<span class="ht-tg"><small>' + esc(label) + '</small>' + items + '</span>'; };
    ctl.innerHTML = grp('Marketplace:', [{ id: 'all', label: 'All' }].concat(VENUES.map(function (v) { return { id: v.key, label: VENUE_SHORT[v.key] }; })).map(function (v) { var n = v.id === 'all' ? byVenue.length : byVenue.filter(function (r) { return r.venue === v.id; }).length; return '<button type="button" class="ht-tab' + (state.listVenue === v.id ? ' ht-on' : '') + '" onclick="HomeTiles.setList(\'venue\',\'' + esc(v.id) + '\')">' + esc(v.label) + (n ? ' ' + n : '') + '</button>'; }).join('')) +
      grp('Class:', classes.map(function (c) { return '<button type="button" class="ht-tab' + (state.listClass === c.id ? ' ht-on' : '') + '"' + (c.disabled ? ' disabled title="' + esc(c.reason || '') + '"' : '') + ' onclick="HomeTiles.setList(\'class\',\'' + esc(c.id) + '\')">' + esc(c.label) + '</button>'; }).join('')) +
      '<span style="flex:1"></span><button type="button" class="ht-tab" onclick="HomeTiles.setList(\'sort\',\'' + (state.listSort === 'asc' ? 'desc' : 'asc') + '\')" title="flip the sort"><i class="fas fa-sort-amount-' + (state.listSort === 'asc' ? 'up' : 'down') + '"></i> USD ' + (state.listSort === 'asc' ? 'low → high' : 'high → low') + '</button>';
    var shown = rows.slice(0, state.listShown);
    cnt.textContent = '(' + shown.length + ' of ' + rows.length + ')';
    var own = (ctx.tenant && ctx.tenant.short) || '';
    el.innerHTML = shown.map(function (r) { var u = img(r.id); var cl = classOf(r, classes); var f = get(D, 'pl.floor_' + r.venue); return '<a class="ht-lcard" href="' + esc(explorer + (explorer.indexOf('?') === -1 ? '?' : '&') + 'search=' + encodeURIComponent(r.id)) + '">' + (u ? '<img loading="lazy" src="' + esc(u) + '" alt="">' : '<span class="ht-lc-img"></span>') + '<span class="ht-lc-b"><span class="ht-lc-n">' + esc(tokenName(ctx, r.id)) + (own ? ' <span class="ht-chip ht-chip-o">' + esc(own) + '</span>' : '') + '</span><span class="ht-lc-s">' + (cl ? '<span class="ht-y">' + esc(cl) + '</span> · ' : '') + (r.rank != null ? 'Rank #' + esc(fmt.int(r.rank)) + ' · ' : '') + esc(VENUE_SHORT[r.venue] || 'venue?') + (r.chain_only ? ' · chain-only' : '') + '</span></span><span class="ht-lc-p"><b class="ht-g">' + esc(fmt.usd(r.usd, 2)) + '</b><small>' + (f && f.symbol ? 'listed in ' + esc(f.symbol) : '') + '</small></span></a>'; }).join('') || '<div class="ht-note" style="grid-column:1/-1">Nothing listed in this class.</div>';
    more.innerHTML = rows.length > shown.length ? '<button class="ht-more" type="button" onclick="HomeTiles.setList(\'more\')">Load ' + Math.min(12, rows.length - shown.length) + ' more (' + (rows.length - shown.length) + ' left)</button>' : '';
  }
  function paintSales(sec, D, ctx) {
    var el = G.document.getElementById('ht-sales'), cnt = G.document.getElementById('ht-sales-count'); if (!el) return;
    if (!D.sales) { el.innerHTML = '<div class="ht-note">' + unk('sales-enriched not read') + ' the sales product did not load.</div>'; return; }
    var img = function (id) { try { return ctx.primary && ctx.primary.assets && ctx.primary.assets.image ? ctx.primary.assets.image(id) : null; } catch (e) { return null; } };
    var explorer = sec.explorer_href || '/nft-explorer-index.html';
    cnt.textContent = fmt.int(D.sales.count) + ' sales all-time · USD at the time of sale · "now" at today\'s prices';
    el.innerHTML = D.sales.top.slice(0, state.salesShown).map(function (s, i) { var u = img(s.token_id); return '<a class="ht-row" href="' + esc(explorer + (explorer.indexOf('?') === -1 ? '?' : '&') + 'search=' + encodeURIComponent(s.token_id)) + '" style="text-decoration:none">' + (u ? '<img loading="lazy" src="' + esc(u) + '" alt="">' : '<span></span>') + '<span><div class="ht-r1"><span class="ht-dim">#' + (i + 1) + '</span> ' + esc(tokenName(ctx, s.token_id)) + '</div><div class="ht-r2">' + esc(fmt.date(s.timestamp)) + ' · ' + esc(fmt.num(s.amount)) + ' ' + esc(s.denom_symbol || '') + ' · ' + esc(s.marketplace || '') + '</div></span><span class="ht-rv">' + esc(fmt.usd(s.notional_usd)) + '<small>now ' + (s.value_today_usd == null ? '—' : esc(fmt.usd(s.value_today_usd))) + '</small></span></a>'; }).join('');
  }
  function toggleSales() { state.salesOpen = !state.salesOpen; var el = G.document.getElementById('ht-sales'), cnt = G.document.getElementById('ht-sales-count'); if (el) el.classList.toggle('ht-hidden', !state.salesOpen); if (cnt) cnt.classList.toggle('ht-hidden', !state.salesOpen); if (state.salesOpen && M.loader) M.loader.lazy('col_sales'); }
  // the same feed the aDAO home shows, on lib/live-activity.js — this tenant is "own" for the deal filter; kind chips as on aDAO
  function paintActivity(sec, D, ctx, S) {
    var el = G.document.getElementById('ht-act'), ctl = G.document.getElementById('ht-act-ctl'), cnt = G.document.getElementById('ht-act-count'); if (!el) return;
    var LA = G.LiveActivity; if (!LA) { el.innerHTML = '<div class="ht-note">lib/live-activity.js did not load.</div>'; return; }
    if (!G.document.getElementById('la-css')) { var st = G.document.createElement('style'); st.id = 'la-css'; st.textContent = LA.CSS; G.document.head.appendChild(st); }
    var Tn = ctx.tenants || {}; var FEEDS = [];
    Object.keys(Tn).forEach(function (ts) { var t = Tn[ts]; (t.collections || []).forEach(function (cs) { FEEDS.push({ slug: cs, tenant: ts, short: t.short || ts, label: (t.collections || []).length > 1 ? (t.short + ' · ' + cs) : (t.short || ts), kind: 'nft', noun: 'NFT', nouns: 'NFTs', legacyCol: null, holdings: false, url: NFTC + cs + '/ledger/activity.json', explorer: '/nft-explorer-index.html?tenant=' + ts }); }); });
    FEEDS.push({ slug: 'tla-locks', tenant: null, short: 'TLA', label: 'TLA Locks', kind: 'escrow', noun: 'lock', nouns: 'locks', legacyCol: null, holdings: false, url: NFTC + 'tla-locks/ledger/activity.json', explorer: null });
    var own = ctx.tenant && ctx.tenant.slug; var cfg = S.thresholds || null; var GROUPS = LA.KIND_GROUPS || [];
    state.actDays = state.actDays || 7; state.actView = state.actView || 'all'; state.actShowAll = !!state.actShowAll; state.actShown = state.actShown || 12;
    if (!state.actKinds) { state.actKinds = {}; GROUPS.forEach(function (g) { state.actKinds[g[0]] = g[0] !== 'housekeeping'; }); }   // housekeeping is quiet, never featured (law); every other chip starts on
    LA.load(function (u) { return jsonFetch(u); }, FEEDS).then(function (loaded) {
      var all = []; var missing = [];
      loaded.forEach(function (x) { if (!x.doc || !Array.isArray(x.doc.episodes)) { missing.push(x.feed.label); return; } x.feed.doc = { built_at: x.doc.built_at, engine: x.doc.engine, floor_now: x.doc.floor_now, window_days: x.doc.window_days }; x.doc.episodes.forEach(function (ep) { all.push({ ep: ep, feed: x.feed }); }); });
      all.sort(function (a, b) { return Date.parse(b.ep.ts) - Date.parse(a.ep.ts); });
      var since = LA.marker.get(); setTimeout(function () { LA.marker.set(Date.now()); }, 20000);
      var ctxOf = function () { return { ownTenant: own, config: cfg, showAll: state.actShowAll, since: since, now: Date.now(), nameOf: null, holdingsOf: null, usdNow: null,
        imageOf: function (feed, id) { var c = ctx.collections && ctx.collections.filter(function (cc) { return cc.slug === feed.slug; })[0]; try { return c && c.assets && c.assets.image ? c.assets.image(id) : null; } catch (e) { return null; } },
        tokenUrl: function (feed, id) { return feed.explorer ? feed.explorer + '&search=' + encodeURIComponent(String(id)) : 'https://chainsco.pe/terra2/address/' + id; },
        walletUrl: function (feed, a) { return '/address-catalog.html?address=' + encodeURIComponent(a); } }; };
      var chip = function (on, label, onclick, title) { return '<button type="button" class="ht-tab' + (on ? ' ht-on' : '') + '" onclick="' + onclick + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(label) + '</button>'; };
      state.paintAct = function () {
        // the whole home re-paints as sources land, so the feed's elements are re-read every time (never a detached node)
        var el = G.document.getElementById('ht-act'), ctl = G.document.getElementById('ht-act-ctl'), kel = G.document.getElementById('ht-act-kinds'), cnt = G.document.getElementById('ht-act-count'); if (!el || !ctl || !cnt) return;
        var c = ctxOf(); var cut = Date.now() - state.actDays * 864e5;
        var inWin = all.filter(function (x) { return Date.parse(x.ep.ts) >= cut; }); var inView = inWin.filter(function (x) { return state.actView === 'all' || x.feed.slug === state.actView; });
        var cl = inView.map(function (x) { return { x: x, c: LA.classify(x.ep, x.feed, c), g: LA.groupOf(x.ep.kind) }; }).filter(function (r) { return r.g; });
        var on = function (r) { return state.actKinds[r.g] || (r.c && r.c.tier === 'featured'); };   // a featured row (a big top-up) shows even with its chip off
        var vis = cl.filter(function (r) { return on(r) && (state.actShowAll || !r.c.hidden); }); var hiddenN = cl.filter(function (r) { return on(r) && r.c.hidden; }).length;
        ctl.innerHTML = [[1, '24h'], [7, '7d'], [30, '30d']].map(function (p) { return chip(state.actDays === p[0], p[1], 'HomeTiles.setAct(\'days\',' + p[0] + ')'); }).join('') + '<span style="width:.5rem"></span>' + [{ id: 'all', label: 'All' }].concat(FEEDS.map(function (f) { return { id: f.slug, label: f.label }; })).map(function (t) { return chip(state.actView === t.id, t.label, 'HomeTiles.setAct(\'view\',\'' + t.id + '\')'); }).join('') + '<span style="flex:1"></span><button type="button" class="ht-tab" onclick="HomeTiles.setAct(\'reload\')" title="reload the feed"><i class="fas fa-sync-alt"></i></button>';
        if (kel) { var allOn = GROUPS.every(function (g) { return state.actKinds[g[0]]; }); kel.innerHTML = chip(allOn, allOn ? 'None' : 'All', 'HomeTiles.setAct(\'kinds\',' + (allOn ? 'false' : 'true') + ')') + GROUPS.map(function (g) { var n = cl.filter(function (r) { return r.g === g[0] && (state.actShowAll || !r.c.hidden); }).length; return chip(!!state.actKinds[g[0]], n ? g[1] + ' ' + n : g[1], 'HomeTiles.setAct(\'kind\',\'' + g[0] + '\')', g[0] === 'housekeeping' ? 'merge / split / migrate / auto-max and small top-ups — quiet by default; a big top-up is featured regardless' : ''); }).join('') + '<span class="ht-dim" style="margin:0 .2rem">|</span>' + chip(state.actShowAll, state.actShowAll ? 'Deal filter off · ' + hiddenN + ' over floor shown' : 'Deal filter on' + (hiddenN ? ' · ' + hiddenN + ' hidden' : ''), 'HomeTiles.setAct(\'showall\')', 'listings priced far over their class floor are hidden by default (thresholds in alert-thresholds.json)'); }
        var its = vis.slice(0, state.actShown); cnt.textContent = its.length + ' of ' + vis.length + ' shown · ' + inWin.length + ' episodes in ' + (state.actDays === 1 ? '24h' : state.actDays + 'd') + (missing.length ? ' · not loaded: ' + missing.join(', ') : '');
        state.actRows = its; el.classList.toggle('la-showall', state.actShowAll);
        el.innerHTML = (its.map(function (r, i) { return LA.rowHtml(r.x.ep, r.x.feed, c, i); }).join('') || '<div class="ht-note">Quiet. Nothing in this window.</div>') + (vis.length > its.length ? '<div class="ht-center"><button class="ht-more" type="button" onclick="HomeTiles.setAct(\'more\')">Show ' + Math.min(12, vis.length - its.length) + ' more (' + (vis.length - its.length) + ' left)</button></div>' : '');
        if (!el.__wired) { el.__wired = true; el.addEventListener('click', function (ev) { if (ev.target.closest('a, button')) return; var rowEl = ev.target.closest('[data-la-i]'); if (!rowEl) return; var i = rowEl.dataset.laI, det = el.querySelector('[data-la-d="' + i + '"]'), r = (state.actRows || [])[i]; if (!det || !r) return; if (!det.classList.contains('hidden')) { det.classList.add('hidden'); return; } det.innerHTML = LA.detailsHtml(r.x.ep, r.x.feed, ctxOf()); det.classList.remove('hidden'); }); }
      };
      state.paintAct();
    }).catch(function (e) { el.innerHTML = '<div class="ht-note">The feed could not be drawn: ' + esc(e && e.message) + '</div>'; });
  }
  // sheet renderers (data-sheet-render="mint" …)
  function paintSheets(D, ctx, sec) {
    G.document.querySelectorAll('[data-sheet-render]').forEach(function (el) {
      var k = el.getAttribute('data-sheet-render');
      if (k === 'mint') { var M = D.mint; if (!M) { el.innerHTML = '<div class="ht-note">Reading the mint ledger…</div>'; return; }
        el.innerHTML = '<div class="ht-grid ht-g4" style="margin:.5rem 0 .9rem">' + [['Tokens minted (paid)', fmt.int(M.paid)], ['Typical price', M.typical_price_luna != null ? fmt.num(M.typical_price_luna) + ' LUNA' : null], ['Paid in total', fmt.num(M.total_luna) + ' LUNA'], ['USD at the time', fmt.usd(M.total_usd)], ['Unique minters', fmt.int(M.unique_minters)], ['First mint', fmt.date(M.first_at)], ['Last mint', fmt.date(M.last_at)], ['What minters did next', null]].map(function (p) { return '<div class="ht-tile"><div class="ht-k">' + esc(p[0]) + '</div><div class="ht-v ht-v-sm">' + (p[1] == null ? unk(p[0] === 'What minters did next' ? 'by-wallet join, in build' : 'no source') : esc(p[1])) + '</div></div>'; }).join('') + '</div>' +
          '<div class="ht-k">Top minters</div><div class="ht-list">' + M.top_minters.map(function (b) { return '<a class="ht-row" href="/address-catalog.html?address=' + esc(b.address) + '" style="text-decoration:none"><span></span><span><div class="ht-r1">' + esc(fmt.short(b.address)) + '</div><div class="ht-r2">' + esc(fmt.int(b.count)) + ' minted · ' + esc(fmt.num(b.luna)) + ' LUNA</div></span><span class="ht-rv">' + esc(fmt.usd(b.usd)) + '<small>USD then</small></span></a>'; }).join('') + '</div>' + (M.launchpad ? '<div class="ht-src">launchpad ' + esc(M.launchpad) + ' · USD at each mint\'s day price (price-history)</div>' : '');
      }
      if (k === 'wallets') { var W = D.wallets || {}; el.innerHTML = '<div class="ht-list">' + Object.keys(W).map(function (a) { var w = W[a]; return '<div class="ht-row"><span></span><span><div class="ht-r1">' + esc(w.label) + ' <span class="ht-chip ht-chip-o">' + esc(w.role) + '</span></div><div class="ht-r2"><a href="https://chainsco.pe/terra2/address/' + esc(a) + '" target="_blank" rel="noopener">' + esc(fmt.short(a)) + '</a>' + (w.in_participants ? ' · in TLA: ' + esc(fmt.int(w.tla_locks)) + ' locks, ' + esc(fmt.usd(w.tla_lp_usd)) + ' LP, ' + esc(fmt.usd(w.tla_locked_usd)) + ' locked' : ' · not a TLA participant') + (w.delegated_luna != null ? ' · ' + esc(fmt.num(w.delegated_luna)) + ' LUNA delegated' : '') + '</div></span><span class="ht-rv">' + (w.tla_pending_usd == null && w.delegation_rewards_usd == null ? unk('no live read') : esc(fmt.usd(sum([w.tla_pending_usd, w.delegation_rewards_usd])))) + '<small>claimable</small></span></div>'; }).join('') + '</div><div class="ht-src">TLA figures from member-data/participants (' + esc(fmt.ago(D.tla.source_at) || '—') + '); delegations live from the LCD. Balances, compounder receipts, Credia and Votion arrive with the positions cron.</div>'; }
    });
  }

  // ---------------------------------------------------------------- mount
  var M = { el: null, cfg: null, ctx: null, D: null, S: null, loader: null };
  function paintAll() {
    var cfg = M.cfg, D = M.D, ctx = M.ctx;
    var html = (cfg.sections || []).map(function (sec) {
      if (sec.type === 'hero') return renderHero(sec, D, ctx);
      if (sec.type === 'nav') return renderNav(sec, D, ctx);
      if (sec.type === 'supply') return renderSupply(sec, D);
      if (sec.type === 'row') return renderRow(sec, D);
      if (sec.type === 'rewards') return renderRewards(sec, D);
      if (sec.type === 'market') return renderMarket(sec, D, ctx);
      return '';
    }).join('');
    var open = G.document.querySelector('.ht-sheet.ht-on'); var openId = open ? open.getAttribute('data-sheet') : null;
    M.el.innerHTML = '<div class="ht">' + html + '<div class="ht-src" style="margin:1rem 0">A number reads Coming until a source exists for it — nothing here is estimated. Cron products from thealliancedao GitHub; live rows read the chain directly. home-tiles ' + VERSION + '</div></div>';
    var mk = (cfg.sections || []).filter(function (s) { return s.type === 'market'; })[0];
    if (mk) { paintListings(mk, D, ctx); paintSales(mk, D, ctx); if (!M.actStarted) { M.actStarted = true; paintActivity(mk, D, ctx, M.S); } else if (state.paintAct) state.paintAct(); }
    paintSheets(D, ctx, cfg);
    if (openId) openSheet(openId);
  }
  var repaintTimer = null;
  function schedule() { if (repaintTimer) return; repaintTimer = setTimeout(function () { repaintTimer = null; M.D = derive(M.S, M.cfg, M.ctx); paintAll(); }, 120); }
  function mount(o) {
    wireCopy();   // 1.2.3
    M.el = typeof o.el === 'string' ? G.document.querySelector(o.el) : o.el; M.cfg = o.config || {}; M.ctx = o.ctx || {};
    if (!G.document.getElementById('ht-css')) { var st = G.document.createElement('style'); st.id = 'ht-css'; st.textContent = CSS; G.document.head.appendChild(st); }
    M.loader = loadSources(M.cfg, M.ctx, function () { schedule(); });
    M.S = M.loader.sources; M.D = derive(M.S, M.cfg, M.ctx); paintAll();
    // heavy products after first paint
    var idle = G.requestIdleCallback || function (f) { setTimeout(f, 800); };
    idle(function () { M.loader.lazy('col_sales'); });
    return M;
  }
  function openSheet(id) { closeSheets(); var el = G.document.getElementById('ht-sheet-' + id); if (!el) return; el.classList.add('ht-on'); if (el.querySelector('[data-sheet-render="mint"]') && M.loader) M.loader.lazy('col_mint'); try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
  function closeSheets() { G.document.querySelectorAll('.ht-sheet.ht-on').forEach(function (x) { x.classList.remove('ht-on'); }); }
  function toggleMenu(tile) { var m = tile.querySelector('.ht-menu'); if (!m) return; var on = m.classList.contains('ht-on'); G.document.querySelectorAll('.ht-menu.ht-on').forEach(function (x) { x.classList.remove('ht-on'); }); if (!on) m.classList.add('ht-on'); }
  function setList(what, v) { if (what === 'sort') state.listSort = v; if (what === 'class') { state.listClass = v; state.listShown = 12; } if (what === 'venue') { state.listVenue = v; state.listShown = 12; } if (what === 'more') state.listShown += 12; var mk = (M.cfg.sections || []).filter(function (s) { return s.type === 'market'; })[0]; if (mk) paintListings(mk, M.D, M.ctx); }
  function setAct(what, v) { if (what === 'days') { state.actDays = v; state.actShown = 12; } if (what === 'view') { state.actView = v; state.actShown = 12; } if (what === 'showall') state.actShowAll = !state.actShowAll; if (what === 'more') state.actShown += 12; if (what === 'kind') { state.actKinds[v] = !state.actKinds[v]; state.actShown = 12; } if (what === 'kinds') { Object.keys(state.actKinds).forEach(function (k) { state.actKinds[k] = !!v; }); state.actShown = 12; } if (what === 'reload') { var mk = (M.cfg.sections || []).filter(function (s) { return s.type === 'market'; })[0]; if (mk) paintActivity(mk, M.D, M.ctx, M.S); return; } if (state.paintAct) state.paintAct(); }
  if (typeof G.document !== 'undefined') G.document.addEventListener('click', function (ev) { if (!ev.target.closest('.ht-nav .ht-tile')) G.document.querySelectorAll('.ht-menu.ht-on').forEach(function (x) { x.classList.remove('ht-on'); }); });

  return { VERSION: VERSION, mount: mount, derive: derive, load: loadSources, get: get, fmt: fmt, fill: fill, CSS: CSS, openSheet: openSheet, closeSheets: closeSheets, toggleMenu: toggleMenu, toggleSales: toggleSales, addr: addr, setList: setList, setAct: setAct, _state: state, _M: M };
});
