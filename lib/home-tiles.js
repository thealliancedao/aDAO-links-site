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
  var VERSION = '1.0.2';   // 1.0.2: burn.supply_delta (initial − live supply, labeled) · 1.0.1: tenant.roar20 (DexScreener, labeled) + tenant.burn (reported figures, source-labeled) pass through to the tiles
  var G = typeof globalThis !== 'undefined' ? globalThis : this;
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var NFTC = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';

  // ---------------------------------------------------------------- helpers
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var fmt = {
    num: function (v, d) { if (!isNum(v)) return null; return v.toLocaleString(undefined, { maximumFractionDigits: d == null ? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4) : d, minimumFractionDigits: 0 }); },
    usd: function (v) { if (!isNum(v)) return null; var a = Math.abs(v); return (v < 0 ? '−' : '') + '$' + (a >= 1e6 ? (a / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M' : a >= 1000 ? a.toLocaleString(undefined, { maximumFractionDigits: 0 }) : a >= 1 ? a.toLocaleString(undefined, { maximumFractionDigits: 2 }) : a >= 0.01 ? a.toLocaleString(undefined, { maximumFractionDigits: 3 }) : a.toLocaleString(undefined, { maximumSignificantDigits: 3 })); },
    big: function (v, d) { if (!isNum(v)) return null; var a = Math.abs(v), s = v < 0 ? '−' : ''; if (a >= 1e12) return s + (a / 1e12).toLocaleString(undefined, { maximumFractionDigits: d == null ? 2 : d }) + 'T'; if (a >= 1e9) return s + (a / 1e9).toLocaleString(undefined, { maximumFractionDigits: d == null ? 2 : d }) + 'B'; if (a >= 1e6) return s + (a / 1e6).toLocaleString(undefined, { maximumFractionDigits: d == null ? 1 : d }) + 'M'; if (a >= 1e3) return s + (a / 1e3).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k'; return s + a.toLocaleString(undefined, { maximumFractionDigits: 2 }); },
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
      { label: 'Compounders · Credia · Votion · other tokens', usd: null, note: 'positions cron' } ] };
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
    '.ht-hero{border:2px solid var(--ht-border);background:var(--ht-surface2);position:relative;overflow:hidden;padding:1.6rem 1.4rem 1.4rem;box-shadow:8px 8px 0 var(--ht-accent)}',
    '.ht-mane{position:absolute;left:0;right:0;top:0;height:14px;background:repeating-linear-gradient(90deg,var(--ht-accent) 0 14px,var(--ht-accent2) 14px 28px,#000 28px 42px,var(--ht-accent2) 42px 56px)}.ht-mane.ht-mane-b{top:auto;bottom:0;background:repeating-linear-gradient(90deg,#000 0 14px,var(--ht-accent2) 14px 28px,var(--ht-accent) 28px 42px,var(--ht-accent2) 42px 56px)}',
    '.ht-hero-t{font-family:var(--ht-font);font-size:1.5rem;color:var(--ht-accent);margin:.6rem 0 .5rem;line-height:1.6}.ht-hero-l{font-size:1rem;color:var(--ht-text);max-width:60ch}.ht-hero-s{margin-top:.9rem;font-size:.9rem;color:var(--ht-muted)}.ht-hero-s b{color:#fff;font-weight:600}',
    '.ht-lfr{font-family:var(--ht-font);font-size:.62rem;color:#111;background:var(--ht-accent);display:inline-block;padding:.45rem .6rem;line-height:1;margin-left:.5rem;vertical-align:middle}',
    '@media(max-width:640px){.ht-hero-t{font-size:1rem}.ht-hero{box-shadow:5px 5px 0 var(--ht-accent)}}',
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
  ].join('\n');

  // ---------------------------------------------------------------- render primitives
  function unk(reason) { return '<span class="ht-unk" title="' + esc(reason || 'no source yet') + '">Unknown</span>'; }
  function val(v, reason) { return v == null ? unk(reason) : esc(v); }
  function metricTile(m, D) {
    var v = get(D, m.key); var shown = null;
    if (v != null) { var f = fmt[m.fmt || 'num']; shown = f ? f(v) : String(v); if (m.suffix && shown != null) shown += m.suffix; if (m.prefix && shown != null) shown = m.prefix + shown; }
    var sub = ''; if (m.sub) sub = fill(m.sub, D); if (m.sub_key) { var sv = get(D, m.sub_key); var sf = fmt[m.sub_fmt || 'num']; if (sv != null) sub = (m.sub_prefix || '') + (sf ? sf(sv) : sv) + (m.sub_suffix || ''); }
    var href = m.href ? ' onclick="' + (m.href.charAt(0) === '#' ? 'HomeTiles.openSheet(\'' + esc(m.href.slice(1)) + '\')' : 'location.href=\'' + esc(m.href) + '\'') + '" style="cursor:pointer"' : '';
    return '<div class="ht-tile"' + href + '><div class="ht-k">' + esc(m.label) + '</div><div class="ht-v' + (shown && shown.length > 12 ? ' ht-v-sm' : '') + '">' + (shown == null ? unk(m.unknown || m.reason) : esc(shown)) + '</div>' + (sub ? '<div class="ht-s">' + sub + '</div>' : '') + (m.source ? '<div class="ht-src">' + esc(m.source) + '</div>' : '') + '</div>';
  }
  // "{roar.price_usd|price}" templating in config strings; a missing value becomes an Unknown chip
  function fill(tpl, D) { return String(tpl).replace(/\{([a-z0-9_.]+)(?:\|([a-z]+))?\}/gi, function (_, k, f) { var v = get(D, k); if (v == null) return unk(); var fn = fmt[f]; return '<b>' + esc(fn ? fn(v) : v) + '</b>'; }); }

  function renderHero(sec, D, ctx) {
    var t = ctx.tenant || {};
    return '<section class="ht-sec"><div class="ht-hero"><div class="ht-mane"></div><div class="ht-mane ht-mane-b"></div>' +
      '<div class="ht-hero-t">' + esc(sec.title || t.label || '') + (sec.badge ? '<span class="ht-lfr">' + esc(sec.badge) + '</span>' : '') + '</div>' +
      (sec.line ? '<div class="ht-hero-l">' + esc(sec.line) + '</div>' : '') +
      (sec.status ? '<div class="ht-hero-s">' + fill(sec.status, D) + '</div>' : '') + '</div></section>';
  }
  function renderNav(sec, D, ctx) {
    var tiles = (sec.tiles || []).map(function (tl, i) {
      var cls = 'ht-tile' + (tl.tall ? ' ht-tall' : '') + (tl.kind === 'placeholder' ? ' ht-soon' : '');
      var act = tl.kind === 'menu' ? 'HomeTiles.toggleMenu(this)' : tl.kind === 'placeholder' || tl.kind === 'sheet' ? 'HomeTiles.openSheet(\'' + esc(tl.sheet || tl.id) + '\')' : (tl.href ? 'location.href=\'' + esc(tl.href) + '\'' : '');
      var items = tl.kind === 'menu' ? '<div class="ht-menu">' + (tl.items || []).map(function (it) { return it.href ? '<a href="' + esc(it.href) + '"' + (/^https?:/.test(it.href) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(it.label) + '</a>' : '<div class="ht-mnote">' + esc(it.label) + '</div>'; }).join('') + (tl.note ? '<div class="ht-mnote">' + esc(tl.note) + '</div>' : '') + '</div>' : '';
      return '<div class="' + cls + '" role="button" tabindex="0" onclick="' + act + '" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}">' + (tl.icon ? '<i class="fas ' + esc(tl.icon) + '"></i>' : '') + '<div class="ht-nt">' + esc(tl.label) + (tl.kind === 'menu' ? ' ▾' : '') + '</div>' + (tl.desc ? '<div class="ht-nd">' + esc(tl.desc) + '</div>' : '') + (tl.kind === 'placeholder' ? '<div class="ht-nd">' + unk(tl.reason) + ' ' + esc(tl.reason || '') + '</div>' : '') + items + '</div>';
    }).join('');
    var sheets = (sec.sheets || []).map(function (sh) { return '<div class="ht-sheet" id="ht-sheet-' + esc(sh.id) + '" data-sheet="' + esc(sh.id) + '"><button class="ht-x" type="button" onclick="HomeTiles.closeSheets()">close</button><h4>' + esc(sh.title) + '</h4><div class="ht-sheet-b">' + (sh.body || []).map(function (p) { return '<p>' + fill(p, D) + '</p>'; }).join('') + (sh.render ? '<div data-sheet-render="' + esc(sh.render) + '"></div>' : '') + '</div></div>'; }).join('');
    return '<section class="ht-sec"><div class="ht-nav">' + tiles + '</div>' + sheets + '</section>';
  }
  function bar(parts, total, D) {
    var cols = ['var(--ht-accent)', 'var(--ht-accent2)', '#d1d5db', '#7c7c7c', '#3f3f46', '#a16207'];
    var tot = total != null ? total : sum(parts.map(function (p) { return p.v; }));
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
      return '<div class="ht-tile"><div class="ht-k">' + esc(b.label) + (b.total_key ? ' · of <b>' + (total == null ? unk(b.total_reason) : esc((b.total_fmt ? fmt[b.total_fmt] : fmt.big)(total))) + '</b>' : '') + '</div>' + bar(parts, total, D) + (b.note ? '<div class="ht-src">' + fill(b.note, D) + '</div>' : '') + '</div>';
    }).join('');
    return '<section class="ht-sec"><div class="ht-h">' + esc(sec.title || '') + (sec.sub ? '<small>' + esc(sec.sub) + '</small>' : '') + '</div><div class="ht-grid ht-g' + ((sec.bars || []).length || 1) + '">' + tiles + '</div></section>';
  }
  function renderRow(sec, D) {
    var tiles = (sec.metrics || []).map(function (m) { return metricTile(m, D); }).join('');
    var total = '';
    if (sec.total) { var parts = (sec.total.parts_key ? (get(D, sec.total.parts_key) || []) : (sec.total.parts || []).map(function (p) { return { label: p.label, usd: get(D, p.key), note: p.reason }; }));
      var known = sum(parts.map(function (p) { return p.usd; }));
      total = '<div class="ht-total"><span class="ht-tt">' + esc(sec.total.label) + '</span>' + parts.map(function (p) { return '<span>' + esc(p.label) + ' <b>' + (p.usd == null ? unk(p.note) : esc(fmt.usd(p.usd))) + '</b></span>'; }).join('<span>+</span>') + '<span>=</span><span class="ht-tsum">' + (known == null ? unk() : esc(fmt.usd(known))) + '</span>' + (parts.some(function (p) { return p.usd == null; }) ? '<span>known parts only</span>' : '') + '</div>'; }
    return '<section class="ht-sec"><div class="ht-h">' + esc(sec.title || '') + (sec.sub ? '<small>' + fill(sec.sub, D) + '</small>' : '') + '</div><div class="ht-grid ht-g' + Math.min(5, Math.max(2, (sec.metrics || []).length)) + '">' + tiles + '</div>' + total + '</section>';
  }
  function renderRewards(sec, D) {
    var tiles = (sec.groups || []).map(function (g) {
      var v = get(D, g.key); var lines = (g.lines || []).map(function (l) { return '<div class="ht-s">' + fill(l, D) + '</div>'; }).join('');
      return '<div class="ht-tile"><div class="ht-k">' + esc(g.label) + '</div><div class="ht-v">' + (v == null ? unk(g.reason) : esc(fmt.usd(v))) + '</div>' + lines + (g.source ? '<div class="ht-src">' + esc(g.source) + '</div>' : '') + '</div>';
    }).join('');
    return '<section class="ht-sec"><div class="ht-h">' + esc(sec.title || '') + (sec.sub ? '<small>' + fill(sec.sub, D) + '</small>' : '') + '</div><div class="ht-grid ht-g' + ((sec.groups || []).length || 1) + '">' + tiles + '</div></section>';
  }
  // ---- market: venue floors, volume, activity feed, listings, top sales
  var state = { listSort: 'asc', listClass: 'all', listShown: 12, salesShown: 8 };
  function renderMarket(sec, D, ctx) {
    var venues = (sec.venues || []).map(function (v) { var f = get(D, v.key); return '<div class="ht-tile"><div class="ht-k">' + esc(v.label) + '</div><div class="ht-v">' + (f && f.usd != null ? esc(fmt.usd(f.usd)) : unk(f && f.count ? 'listed in a token the price feed lacks' : 'no listings read')) + '</div><div class="ht-s">' + (f && f.amount != null ? '<b>' + esc(fmt.num(f.amount)) + ' ' + esc(f.symbol) + '</b> · ' : '') + (f && f.count != null ? esc(f.count) + ' listed' : '') + '</div></div>'; }).join('');
    var vol = sec.volume ? metricTile(sec.volume, D) : '';
    return '<section class="ht-sec"><div class="ht-h">' + esc(sec.title || '') + (sec.sub ? '<small>' + fill(sec.sub, D) + '</small>' : '') + '</div>' +
      '<div class="ht-grid ht-g' + ((sec.venues || []).length + (vol ? 1 : 0)) + '">' + venues + vol + '</div>' +
      '<div class="ht-grid ht-g2" style="margin-top:.9rem;align-items:start">' +
        '<div class="ht-tile"><div class="ht-h" style="margin-bottom:.5rem">' + esc(sec.activity_title || 'Live activity') + '<small id="ht-act-count"></small></div><div id="ht-act-ctl" class="ht-tabs"></div><div id="ht-act" class="ht-la"><div class="ht-note">Loading the ledger…</div></div></div>' +
        '<div><div class="ht-tile"><div class="ht-h" style="margin-bottom:.5rem">' + esc(sec.listings_title || 'Listings') + '<small id="ht-list-count"></small></div><div id="ht-list-ctl" class="ht-tabs"></div><div id="ht-list" class="ht-list"></div></div>' +
        '<div class="ht-tile" style="margin-top:.9rem"><div class="ht-h" style="margin-bottom:.5rem">' + esc(sec.sales_title || 'Top sales') + '<small id="ht-sales-count"></small></div><div id="ht-sales" class="ht-list"><div class="ht-note">Reading every sale…</div></div></div></div>' +
      '</div></section>';
  }
  function paintListings(sec, D, ctx) {
    var el = G.document.getElementById('ht-list'), ctl = G.document.getElementById('ht-list-ctl'), cnt = G.document.getElementById('ht-list-count'); if (!el) return;
    var L = D.listings; if (!L) { el.innerHTML = '<div class="ht-note">' + unk('explorer bundle not read') + ' the listings bundle did not load.</div>'; return; }
    var classes = sec.listing_classes || [{ id: 'all', label: 'All' }];
    var rows = L.rows.filter(function (r) { var c = classes.filter(function (x) { return x.id === state.listClass; })[0]; if (!c || !c.rule) return true; if (c.rule === 'rank1') return r.rank === 1; if (c.rule === 'base') return r.rank !== 1; return true; });
    rows = rows.slice().sort(function (a, b) { return state.listSort === 'asc' ? a.usd - b.usd : b.usd - a.usd; });
    var img = function (id) { try { return ctx.primary && ctx.primary.assets && ctx.primary.assets.image ? ctx.primary.assets.image(id) : null; } catch (e) { return null; } };
    var explorer = sec.explorer_href || '/nft-explorer-index.html';
    ctl.innerHTML = classes.map(function (c) { return '<button type="button" class="ht-tab' + (state.listClass === c.id ? ' ht-on' : '') + '"' + (c.disabled ? ' disabled title="' + esc(c.reason || '') + '"' : '') + ' onclick="HomeTiles.setList(\'class\',\'' + esc(c.id) + '\')">' + esc(c.label) + '</button>'; }).join('') + '<span style="flex:1"></span>' + ['asc', 'desc'].map(function (s) { return '<button type="button" class="ht-tab' + (state.listSort === s ? ' ht-on' : '') + '" onclick="HomeTiles.setList(\'sort\',\'' + s + '\')">' + (s === 'asc' ? 'Low → high' : 'High → low') + '</button>'; }).join('');
    cnt.textContent = rows.length + ' listed · USD at today\'s prices';
    var shown = rows.slice(0, state.listShown);
    el.innerHTML = (shown.map(function (r) { var u = img(r.id); return '<a class="ht-row" href="' + esc(explorer + (explorer.indexOf('?') === -1 ? '?' : '&') + 'search=' + encodeURIComponent(r.id)) + '" style="text-decoration:none">' + (u ? '<img loading="lazy" src="' + esc(u) + '" alt="">' : '<span></span>') + '<span><div class="ht-r1">#' + esc(r.id) + (r.rank === 1 ? ' <span class="ht-chip">rank 1</span>' : '') + '</div><div class="ht-r2">' + (r.rank != null ? 'rank ' + esc(fmt.int(r.rank)) + ' · ' : '') + esc((r.venue || 'venue?').toUpperCase()) + (r.chain_only ? ' · chain-only' : '') + '</div></span><span class="ht-rv">' + esc(fmt.usd(r.usd)) + '</span></a>'; }).join('') || '<div class="ht-note">Nothing listed in this class.</div>') +
      (rows.length > shown.length ? '<button class="ht-more" type="button" onclick="HomeTiles.setList(\'more\')">Show ' + Math.min(12, rows.length - shown.length) + ' more (' + (rows.length - shown.length) + ' left)</button>' : '');
  }
  function paintSales(sec, D, ctx) {
    var el = G.document.getElementById('ht-sales'), cnt = G.document.getElementById('ht-sales-count'); if (!el) return;
    if (!D.sales) { el.innerHTML = '<div class="ht-note">' + unk('sales-enriched not read') + ' the sales product did not load.</div>'; return; }
    var img = function (id) { try { return ctx.primary && ctx.primary.assets && ctx.primary.assets.image ? ctx.primary.assets.image(id) : null; } catch (e) { return null; } };
    var explorer = sec.explorer_href || '/nft-explorer-index.html';
    cnt.textContent = fmt.int(D.sales.count) + ' sales all-time · USD at the time of sale';
    el.innerHTML = D.sales.top.slice(0, state.salesShown).map(function (s) { var u = img(s.token_id); return '<a class="ht-row" href="' + esc(explorer + (explorer.indexOf('?') === -1 ? '?' : '&') + 'search=' + encodeURIComponent(s.token_id)) + '" style="text-decoration:none">' + (u ? '<img loading="lazy" src="' + esc(u) + '" alt="">' : '<span></span>') + '<span><div class="ht-r1">#' + esc(s.token_id) + '</div><div class="ht-r2">' + esc(fmt.date(s.timestamp)) + ' · ' + esc(fmt.num(s.amount)) + ' ' + esc(s.denom_symbol || '') + ' · ' + esc(s.marketplace || '') + '</div></span><span class="ht-rv">' + esc(fmt.usd(s.notional_usd)) + '<small>now ' + (s.value_today_usd == null ? '—' : esc(fmt.usd(s.value_today_usd))) + '</small></span></a>'; }).join('');
  }
  // the same feed the aDAO home shows, on lib/live-activity.js — this tenant is "own" for the deal filter
  function paintActivity(sec, D, ctx, S) {
    var el = G.document.getElementById('ht-act'), ctl = G.document.getElementById('ht-act-ctl'), cnt = G.document.getElementById('ht-act-count'); if (!el) return;
    var LA = G.LiveActivity; if (!LA) { el.innerHTML = '<div class="ht-note">lib/live-activity.js did not load.</div>'; return; }
    if (!G.document.getElementById('la-css')) { var st = G.document.createElement('style'); st.id = 'la-css'; st.textContent = LA.CSS; G.document.head.appendChild(st); }
    var Tn = ctx.tenants || {}; var FEEDS = [];
    Object.keys(Tn).forEach(function (ts) { var t = Tn[ts]; (t.collections || []).forEach(function (cs) { FEEDS.push({ slug: cs, tenant: ts, short: t.short || ts, label: (t.collections || []).length > 1 ? (t.short + ' · ' + cs) : (t.short || ts), kind: 'nft', noun: 'NFT', nouns: 'NFTs', legacyCol: null, holdings: false, url: NFTC + cs + '/ledger/activity.json', explorer: '/nft-explorer-index.html?tenant=' + ts }); }); });
    FEEDS.push({ slug: 'tla-locks', tenant: null, short: 'TLA', label: 'TLA Locks', kind: 'escrow', noun: 'lock', nouns: 'locks', legacyCol: null, holdings: false, url: NFTC + 'tla-locks/ledger/activity.json', explorer: null });
    var own = ctx.tenant && ctx.tenant.slug; var cfg = S.thresholds || null;
    state.actDays = state.actDays || 7; state.actView = state.actView || 'all'; state.actShowAll = !!state.actShowAll; state.actShown = state.actShown || 12;
    LA.load(function (u) { return jsonFetch(u); }, FEEDS).then(function (loaded) {
      var all = []; var missing = [];
      loaded.forEach(function (x) { if (!x.doc || !Array.isArray(x.doc.episodes)) { missing.push(x.feed.label); return; } x.feed.doc = { built_at: x.doc.built_at, engine: x.doc.engine, floor_now: x.doc.floor_now, window_days: x.doc.window_days }; x.doc.episodes.forEach(function (ep) { all.push({ ep: ep, feed: x.feed }); }); });
      all.sort(function (a, b) { return Date.parse(b.ep.ts) - Date.parse(a.ep.ts); });
      var since = LA.marker.get(); setTimeout(function () { LA.marker.set(Date.now()); }, 20000);
      var ctxOf = function () { return { ownTenant: own, config: cfg, showAll: state.actShowAll, since: since, now: Date.now(), nameOf: null, holdingsOf: null, usdNow: null,
        imageOf: function (feed, id) { var t = Tn[feed.tenant]; var c = ctx.collections && ctx.collections.filter(function (cc) { return cc.slug === feed.slug; })[0]; try { return c && c.assets && c.assets.image ? c.assets.image(id) : null; } catch (e) { return null; } },
        tokenUrl: function (feed, id) { return feed.explorer ? feed.explorer + '&search=' + encodeURIComponent(String(id)) : 'https://chainsco.pe/terra2/address/' + id; },
        walletUrl: function (feed, a) { return '/address-catalog.html?address=' + encodeURIComponent(a); } }; };
      var chip = function (on, label, onclick) { return '<button type="button" class="ht-tab' + (on ? ' ht-on' : '') + '" onclick="' + onclick + '">' + esc(label) + '</button>'; };
      state.paintAct = function () {
        // the whole home re-paints as sources land, so the feed's elements are re-read every time (never a detached node)
        var el = G.document.getElementById('ht-act'), ctl = G.document.getElementById('ht-act-ctl'), cnt = G.document.getElementById('ht-act-count'); if (!el || !ctl || !cnt) return;
        var c = ctxOf(); var cut = Date.now() - state.actDays * 864e5;
        var inWin = all.filter(function (x) { return Date.parse(x.ep.ts) >= cut; }); var inView = inWin.filter(function (x) { return state.actView === 'all' || x.feed.slug === state.actView; });
        var cl = inView.map(function (x) { return { x: x, c: LA.classify(x.ep, x.feed, c), g: LA.groupOf(x.ep.kind) }; }).filter(function (r) { return r.g && r.g !== 'housekeeping' || (r.c && r.c.tier === 'featured'); });
        var vis = cl.filter(function (r) { return state.actShowAll || !r.c.hidden; }); var hiddenN = cl.length - vis.length;
        ctl.innerHTML = [[1, '24h'], [7, '7d'], [30, '30d']].map(function (p) { return chip(state.actDays === p[0], p[1], 'HomeTiles.setAct(\'days\',' + p[0] + ')'); }).join('') + '<span style="width:.5rem"></span>' + [{ id: 'all', label: 'All' }].concat(FEEDS.map(function (f) { return { id: f.slug, label: f.label }; })).map(function (t) { return chip(state.actView === t.id, t.label, 'HomeTiles.setAct(\'view\',\'' + t.id + '\')'); }).join('') + '<span style="flex:1"></span>' + chip(state.actShowAll, state.actShowAll ? 'Deal filter off · ' + hiddenN + ' over floor shown' : 'Deal filter on' + (hiddenN ? ' · ' + hiddenN + ' hidden' : ''), 'HomeTiles.setAct(\'showall\')');
        var its = vis.slice(0, state.actShown); cnt.textContent = its.length + ' of ' + vis.length + ' shown · ' + inWin.length + ' episodes in ' + (state.actDays === 1 ? '24h' : state.actDays + 'd') + (missing.length ? ' · not loaded: ' + missing.join(', ') : '');
        state.actRows = its; el.classList.toggle('la-showall', state.actShowAll);
        el.innerHTML = (its.map(function (r, i) { return LA.rowHtml(r.x.ep, r.x.feed, c, i); }).join('') || '<div class="ht-note">Quiet. Nothing in this window.</div>') + (vis.length > its.length ? '<button class="ht-more" type="button" onclick="HomeTiles.setAct(\'more\')">Show ' + Math.min(12, vis.length - its.length) + ' more (' + (vis.length - its.length) + ' left)</button>' : '');
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
    M.el.innerHTML = '<div class="ht">' + html + '<div class="ht-src" style="margin:1rem 0">Numbers are Unknown until a source exists for them — nothing here is estimated. Cron products from thealliancedao GitHub; live rows read the chain directly. home-tiles ' + VERSION + '</div></div>';
    var mk = (cfg.sections || []).filter(function (s) { return s.type === 'market'; })[0];
    if (mk) { paintListings(mk, D, ctx); paintSales(mk, D, ctx); if (!M.actStarted) { M.actStarted = true; paintActivity(mk, D, ctx, M.S); } else if (state.paintAct) state.paintAct(); }
    paintSheets(D, ctx, cfg);
    if (openId) openSheet(openId);
  }
  var repaintTimer = null;
  function schedule() { if (repaintTimer) return; repaintTimer = setTimeout(function () { repaintTimer = null; M.D = derive(M.S, M.cfg, M.ctx); paintAll(); }, 120); }
  function mount(o) {
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
  function setList(what, v) { if (what === 'sort') state.listSort = v; if (what === 'class') { state.listClass = v; state.listShown = 12; } if (what === 'more') state.listShown += 12; var mk = (M.cfg.sections || []).filter(function (s) { return s.type === 'market'; })[0]; if (mk) paintListings(mk, M.D, M.ctx); }
  function setAct(what, v) { if (what === 'days') { state.actDays = v; state.actShown = 12; } if (what === 'view') { state.actView = v; state.actShown = 12; } if (what === 'showall') state.actShowAll = !state.actShowAll; if (what === 'more') state.actShown += 12; if (state.paintAct) state.paintAct(); }
  if (typeof G.document !== 'undefined') G.document.addEventListener('click', function (ev) { if (!ev.target.closest('.ht-nav .ht-tile')) G.document.querySelectorAll('.ht-menu.ht-on').forEach(function (x) { x.classList.remove('ht-on'); }); });

  return { VERSION: VERSION, mount: mount, derive: derive, get: get, fmt: fmt, fill: fill, CSS: CSS, openSheet: openSheet, closeSheets: closeSheets, toggleMenu: toggleMenu, setList: setList, setAct: setAct, _state: state, _M: M };
});
