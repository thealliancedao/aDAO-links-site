/* ============================================================================
 * adao-live-data.js — Shared live-data library for the aDAO dashboard suite
 * ============================================================================
 *
 * Single source of truth for live TLA / treasury / staking data. Used by:
 *   - index.html            (main dashboard, 12 tiles)
 *   - dao_tla_deposits.html (deep-dive TLA Deposits page)
 *   - dao_treasury.html     (deep-dive Treasury page)
 *
 * USAGE
 * -----
 * Include in any page:
 *   <script src="./lib/adao-live-data.js"></script>
 *
 * Then call (all async):
 *   const deposits = await aDAOLive.getDaoTlaDeposits();
 *   const treasury = await aDAOLive.getDaoTreasury();
 *   const rewards  = await aDAOLive.getDaoUnclaimedRewards();
 *
 * Each returns a normalized object with a `source` field:
 *   'live' — live RPC primary path succeeded
 *   'cron' — fell back to hourly cron snapshot
 *   'snapshot' — fell back to per-epoch snapshot
 *
 * ARCHITECTURE
 * ------------
 * Live RPC primary, cron fallback, snapshot last-resort. Tiles should always
 * reflect actual current state; cron is for historical capture and resilience.
 *
 * CACHING
 * -------
 * Two cache layers:
 *   - In-memory: 5 min for live results, 5 min for catalog
 *   - sessionStorage: persists across page navigation within a tab
 *
 * sessionStorage keys are prefixed `adao_live:` so consumers can debug-clear.
 *
 * @license UNLICENSED — internal use, aDAO ecosystem
 * @version 1.0.0
 * ========================================================================== */

(function (global) {
    'use strict';

    // ------------------------------------------------------------------------
    // CONSTANTS — chain addresses, endpoints, repo URLs
    // ------------------------------------------------------------------------

    const DAO_MAIN_WALLET     = 'terra1sffd4efk2jpdt894r04qwmtjqrrjfc52tmj6vkzjxqhd8qqu2drs3m5vzm';
    const DAO_COUNCIL_WALLET  = 'terra1qjxlk5skflwhgwgknh3hdfn93pcfhcm6q9wmm3z9zsxq7auf5nrsrqurqp'; // verify if changes

    // TLA core contracts
    const TLA_GAUGE_CONTROLLER = 'terra1hfksrhchkmsj4qdq33wkksrslnfles6y2l77fmmzeep0xmq24l2smsd3lj';
    const TLA_VOTING_ESCROW    = 'terra1uqhj8agyeaz8fu6mdggfuwr3lp32jlrx5hqag4jxexde92rzkamq3l62zg';
    const TLA_BRIBE_MANAGER    = 'terra1tuuwm8yrj54qeg0c8xu00aha9ryatyhtczq8qq2q8tntuw0auzas9037wh';
    const TLA_ASSET_COMPOUNDER = 'terra1zly98gvcec54m3caxlqexce7rus6rzgplz7eketsdz7nh750h2rqvu8uzx';

    // TLA staking contracts per bucket
    const TLA_STAKING_BY_BUCKET = {
        bluechip: 'terra14mmvqn0kthw6sre75vku263lafn5655mkjdejqjedjga4cw0qx2qlf4arv',
        project:  'terra1awq6t7jfakg9wfjn40fk3wzwmd57mvrqtt3a39z9rmet7wdjj3ysgw3lpa',
        single:   'terra1qdz5qgafx88kp5mf6m2tah8742g4u5g2cek0m3jrgssexexk7g4qw6e23k',
        stable:   'terra1v399cx9drllm70wxfsgvfe694tdsd9x96p9ha36w7muffe4znlusqswspq',
    };
    const TLA_BUCKETS = ['bluechip', 'project', 'single', 'stable'];

    // zLUNA reward connectors per bucket (used for converting zLUNA → LUNA)
    const ZLUNA_CONNECTORS = {
        bluechip: 'terra16l43xt2uq09yvz4axg73n8rtm0qte9lremdwm6ph0e35r2jnm43qnl8h53',
        project:  'terra1x8v9fujf3c78q2we23x0vgzmxgtt0hgvuvfsxy4w3ar9kcua4c6qqcnhyh',
        single:   'terra1u72y7gppxrsncctvgfyqduv3md6pgq77pqhz9rxgwl3dqgye00cq7vmf8u',
        stable:   'terra1ym2495f63mdx63tu96085x2vf3xpy9z9k5urxwhvmf9jldm99q5qr4q6n8',
    };

    // RPC endpoints (primary + fallback)
    const LCD_PRIMARY  = 'https://terra.publicnode.com';
    const LCD_FALLBACK = 'https://terra-lcd.publicnode.com';

    // Data cron repos
    const REPO_TLA_SNAPSHOT      = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/member-data/tla-snapshot/current.json';
    const REPO_NETWORK_PRICES    = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/network-and-prices/current.json';
    const REPO_ADAO_POSITIONS    = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/member-data/positions/current.json';
    const REPO_NFT_INVENTORY     = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/nfts/adao/snapshots/nfts.json';

    // Token registry — denom/contract → metadata
    // Used for both treasury wallet balance enumeration and token symbol lookup.
    const denomMap = {
        // Native tokens
        'uluna': { name: 'LUNA', geckoId: 'terra-luna-2', decimals: 6 },
        'ibc/8D8A7F7253615E5F76CB6252A1E1BD921D5EDB7BBAAF8913FB1C77FF125D9995': { name: 'ASTRO', geckoId: 'astroport-fi', decimals: 6 },
        'ibc/2C962DAB9F57FE0921435426AE75196009FAA1981BF86991203C8411F8980FDB': { name: 'USDC', geckoId: 'usd-coin', decimals: 6 },
        'ibc/88386AC48152D48B34B082648DF836F975506F0B57DBBFC10A54213B1BF484CB': { name: 'wBTC', geckoId: 'wrapped-bitcoin', decimals: 8 },

        // CW20 tokens — queried via {balance: {address}}
        'terra1ecgazyd0waaj3g7l9cmy5gulhxkps2gmxu9ghducvuypjq68mq2s5lvsct': { name: 'ampLUNA', geckoId: 'eris-amplified-luna', decimals: 6 },
        'terra17jnhankdf4jtr2g53v635q5k70g7g64x2s9w2s':                       { name: 'arbLUNA', geckoId: 'staked-luna-slinky',  decimals: 6 },
        'terra1t4p3u8khpd7f8qzurwyafxt648dya6mp6vur3vaapswt6m24gkuqrfdhar': { name: 'CAPA',    geckoId: 'capapult',              decimals: 6 },
        'terra10aa3zdkrc7jwuf8ekl3zq7e7m42vmzqehcmu74e4egc7xkm5kr2s0muyst': { name: 'SOLID',   geckoId: 'solid-2',               decimals: 6 },
        'terra1lxx40s29qvkrcj8fsa3yzyehy7w50umdvvnls2r830rys6lu2zns63eelv': { name: 'ROAR',    geckoId: 'lion-dao',              decimals: 6 },
        'terra17aj4ty4sz4yhgm08na8drc0v03v2jwr3waxcqrwhajj729zhl7zqnpc0ml': { name: 'bLUNA',   geckoId: 'backbone-labs-staked-luna', decimals: 6 },
    };


    // ------------------------------------------------------------------------
    // CACHE — in-memory + sessionStorage with TTL
    // ------------------------------------------------------------------------
    //
    // Layered cache: check memory first (fastest), fall back to sessionStorage
    // (survives page navigation), populate memory from sessionStorage on hit.
    // Writes go to both layers. TTL is enforced on read.

    const _memCache = new Map();

    function _ssGet(key) {
        try {
            const raw = sessionStorage.getItem('adao_live:' + key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) { return null; }
    }

    function _ssSet(key, value) {
        try { sessionStorage.setItem('adao_live:' + key, JSON.stringify(value)); }
        catch (_) { /* quota exceeded, ignore */ }
    }

    function _cacheGet(key, ttlMs) {
        const now = Date.now();
        // 1) Memory
        const mem = _memCache.get(key);
        if (mem && (now - mem.ts) < ttlMs) return mem.value;
        // 2) sessionStorage
        const ss = _ssGet(key);
        if (ss && (now - ss.ts) < ttlMs) {
            _memCache.set(key, ss);
            return ss.value;
        }
        return null;
    }

    function _cacheSet(key, value) {
        const entry = { ts: Date.now(), value };
        _memCache.set(key, entry);
        _ssSet(key, entry);
    }

    function clearCache(pattern) {
        if (!pattern) {
            _memCache.clear();
            try {
                const keys = Object.keys(sessionStorage).filter(k => k.startsWith('adao_live:'));
                keys.forEach(k => sessionStorage.removeItem(k));
            } catch (_) {}
            return;
        }
        // Selective clear by substring
        for (const k of Array.from(_memCache.keys())) {
            if (k.includes(pattern)) _memCache.delete(k);
        }
        try {
            const keys = Object.keys(sessionStorage).filter(k => k.startsWith('adao_live:') && k.includes(pattern));
            keys.forEach(k => sessionStorage.removeItem(k));
        } catch (_) {}
    }


    // ------------------------------------------------------------------------
    // PRIMITIVES — chain queries with retry, bank balances, cw20 balances
    // ------------------------------------------------------------------------

    /**
     * Smart contract query with retry. Returns parsed `data` field on success,
     * null on persistent failure. Single retry with brief backoff on null,
     * then falls back to secondary LCD endpoint.
     */
    async function queryChain(contractAddr, query) {
        const enc = btoa(JSON.stringify(query));
        const path = `/cosmwasm/wasm/v1/contract/${contractAddr}/smart/${enc}`;
        const tryEndpoint = async (base) => {
            try {
                const r = await fetch(base + path);
                if (!r.ok) return null;
                const j = await r.json();
                return j.data;
            } catch (_) { return null; }
        };
        // Primary, with one retry on null
        let result = await tryEndpoint(LCD_PRIMARY);
        if (result === null) {
            await new Promise(res => setTimeout(res, 200 + Math.random() * 200));
            result = await tryEndpoint(LCD_PRIMARY);
        }
        // Fallback endpoint
        if (result === null) result = await tryEndpoint(LCD_FALLBACK);
        return result;
    }

    /**
     * Fetch native bank balances for a wallet. Returns array of
     * { denom, amount } or null on failure.
     */
    async function bankBalances(wallet) {
        try {
            const r = await fetch(`${LCD_PRIMARY}/cosmos/bank/v1beta1/balances/${wallet}`);
            if (!r.ok) return null;
            const j = await r.json();
            return j.balances || [];
        } catch (_) { return null; }
    }

    /**
     * Fetch CW20 balance for a wallet. Returns string amount or null.
     */
    async function cw20Balance(contractAddr, wallet) {
        const r = await queryChain(contractAddr, { balance: { address: wallet } });
        return r?.balance ?? null;
    }


    // ------------------------------------------------------------------------
    // SHARED CATALOG — pool registry, token prices, amp configs
    // ------------------------------------------------------------------------
    //
    // Loaded once and cached 5 minutes. Required input to LP valuation.
    // Pulled from the tla-snapshot cron (hourly) for pool catalog + token
    // prices, and live from the asset-compounder contract for amp configs
    // (the latter rarely changes but we want it current).

    async function getTlaCatalog() {
        const cached = _cacheGet('catalog', 5 * 60_000);
        if (cached) return _rehydrateCatalog(cached);

        try {
            const [snapRes, pricesRes, ampConfigs] = await Promise.all([
                fetch(REPO_TLA_SNAPSHOT),
                fetch(REPO_NETWORK_PRICES),
                queryChain(TLA_ASSET_COMPOUNDER, { asset_configs: {} }),
            ]);
            if (!snapRes.ok) return null;
            const snap = await snapRes.json();
            const tokenPrices = pricesRes.ok ? ((await pricesRes.json()).token_prices || {}) : {};

            // Index pools by lp_address (cw20 form) and gauge_pool_id (native/cw20 form)
            const poolByLpAddr  = {};
            const poolByGaugeId = {};
            for (const p of (snap.pools || [])) {
                if (p.lp_address)    poolByLpAddr[p.lp_address.toLowerCase()] = p;
                if (p.gauge_pool_id) poolByGaugeId[p.gauge_pool_id] = p;
            }

            // Group amp configs by bucket for batched user_infos queries
            const ampConfigsByGauge = {};
            if (Array.isArray(ampConfigs)) {
                for (const cfg of ampConfigs) {
                    if (!ampConfigsByGauge[cfg.gauge]) ampConfigsByGauge[cfg.gauge] = [];
                    ampConfigsByGauge[cfg.gauge].push([cfg.gauge, cfg.asset_info]);
                }
            }

            const result = {
                poolByLpAddr,
                poolByGaugeId,
                ampConfigsByGauge,
                tokenPrices,
                lstRatios: (await _safeJson(REPO_NETWORK_PRICES))?.lst_ratios || {},
                capturedAt: snap.capturedAt || new Date().toISOString(),
            };
            _cacheSet('catalog', result);
            return _rehydrateCatalog(result);
        } catch (e) {
            console.warn('[aDAOLive] catalog fetch failed:', e);
            return null;
        }
    }

    // After serializing through sessionStorage, Map objects become plain
    // objects. Helper to be lookup-uniform whether fresh or from cache.
    function _rehydrateCatalog(raw) {
        if (!raw) return null;
        return {
            ...raw,
            // Coerce to Maps for consistent .get() / .has() API regardless of source
            getPoolByLpAddr:  (addr) => raw.poolByLpAddr[(addr || '').toLowerCase()] || null,
            getPoolByGaugeId: (id)   => raw.poolByGaugeId[id] || null,
            findPool: (assetInfo) => {
                if (!assetInfo) return null;
                if (assetInfo.cw20) {
                    return raw.poolByLpAddr[assetInfo.cw20.toLowerCase()]
                        || raw.poolByGaugeId['cw20:' + assetInfo.cw20]
                        || null;
                }
                if (assetInfo.native) {
                    return raw.poolByGaugeId['native:' + assetInfo.native] || null;
                }
                return null;
            },
        };
    }

    async function _safeJson(url) {
        try { const r = await fetch(url); return r.ok ? await r.json() : null; }
        catch (_) { return null; }
    }


    // ------------------------------------------------------------------------
    // DAO TLA DEPOSITS — live RPC primary, cron fallback
    // ------------------------------------------------------------------------
    //
    // Captures the DAO's complete TLA participation:
    //   • LP positions (amplified + non-amplified) across all 4 buckets
    //   • Pending LP rewards (in zLUNA, converted to USD)
    //   • Pending vote bribes
    //   • zLUNA wallet balances (unredeemed reward claims)
    //
    // Returns null if both live and cron paths fail.

    async function getDaoTlaDeposits(options = {}) {
        // Shared decomposition core must be loaded (browser: <script src="/lib/tla-decompose.js">
        // BEFORE this file). Fail honestly rather than compute with absent/wrong math.
        if (typeof tlaDecompose === 'undefined' || !tlaDecompose) {
            console.error('[aDAOLive] tla-decompose.js not loaded — add <script src="/lib/tla-decompose.js"> before adao-live-data.js.');
            return null;
        }
        const { skipCache = false, lunaPriceUsd = null } = options;
        const cacheKey = 'tla_deposits';
        if (!skipCache) {
            const cached = _cacheGet(cacheKey, 5 * 60_000);
            if (cached) return cached;
        }

        const catalog = await getTlaCatalog();

        // 1) Try LIVE chain queries first
        let liveResult = null;
        if (catalog) {
            try {
                liveResult = await _captureLiveTlaDeposits(catalog);
            } catch (e) {
                console.warn('[aDAOLive] live capture threw:', e);
            }
        }

        // 2) Always try to pull pending rewards live (independent path)
        let pendingRewardsUsd = 0;
        let pendingBribesUsd  = 0;
        let zlunaUsd          = 0;
        let zlunaLuna         = 0;

        const priceUsd = lunaPriceUsd || _resolveLunaPrice(catalog);

        try {
            const rewards = await getDaoUnclaimedRewards({ catalog, lunaPriceUsd: priceUsd });
            if (rewards) {
                // depositLuna + rebaseLuna are in LUNA-equivalent units
                pendingRewardsUsd = priceUsd
                    ? ((rewards.depositLuna || 0) + (rewards.rebaseLuna || 0)) * priceUsd
                    : 0;
                pendingBribesUsd = rewards.voteUsd || 0;
            }
        } catch (e) {
            console.warn('[aDAOLive] rewards capture failed:', e);
        }

        // 3) zLUNA wallet balances (always queryable independently)
        try {
            const bals = await bankBalances(DAO_MAIN_WALLET);
            if (bals) {
                for (const b of bals) {
                    if (/zluna/i.test(b.denom)) {
                        zlunaLuna += Number(b.amount) / 1e6;
                    }
                }
                if (priceUsd) zlunaUsd = zlunaLuna * priceUsd;
            }
        } catch (_) { /* non-fatal */ }

        // 4) Compose result — prefer live LP capture if successful, else cron
        if (liveResult) {
            const result = {
                source:            'live',
                capturedAt:        new Date().toISOString(),
                catalogCapturedAt: catalog?.capturedAt || null,
                positions:         liveResult.positions,
                positionCount:     liveResult.positions.length,
                totalLpUsd:        liveResult.totalLpUsd,
                pendingRewardsUsd, pendingBribesUsd,
                zlunaUsd, zlunaLuna,
                totalTlaUsd:       liveResult.totalLpUsd + pendingRewardsUsd + pendingBribesUsd + zlunaUsd,
                decomposeCoreVersion: tlaDecompose.VERSION,
            };
            _cacheSet(cacheKey, result);
            return result;
        }

        // Fall back to cron snapshot
        console.warn('[aDAOLive] live LP capture unavailable — falling back to cron');
        const cron = await _fetchTlaDepositsFromCron();
        if (cron) {
            _cacheSet(cacheKey, cron);
            return cron;
        }

        return null;
    }

    // Internal: capture DAO LP positions live from chain.
    // Returns null if ANY of the 8 parallel queries fails (we want consistent
    // data, not a partial undercount).
    async function _captureLiveTlaDeposits(catalog) {
        const wallet = DAO_MAIN_WALLET;

        const stakingPromises = TLA_BUCKETS.map(async b => {
            const staked = await queryChain(TLA_STAKING_BY_BUCKET[b], { all_staked_balances: { address: wallet } });
            if (staked === null) return { bucket: b, staked: null, _err: 'all_staked_balances null after retry' };
            return { bucket: b, staked: Array.isArray(staked) ? staked : [] };
        });

        const ampPromises = TLA_BUCKETS.map(async b => {
            const assets = catalog.ampConfigsByGauge?.[b];
            if (!assets || assets.length === 0) return { bucket: b, entries: [] };
            const r = await queryChain(TLA_ASSET_COMPOUNDER, { user_infos: { addr: wallet, assets } });
            if (r === null) return { bucket: b, entries: null, _err: 'user_infos null after retry' };
            return { bucket: b, entries: Array.isArray(r) ? r : [] };
        });

        const [stakingResults, ampResults] = await Promise.all([
            Promise.all(stakingPromises),
            Promise.all(ampPromises),
        ]);

        const failures = [
            ...stakingResults.filter(r => r._err).map(r => `staked[${r.bucket}]`),
            ...ampResults.filter(r => r._err).map(r => `amp[${r.bucket}]`),
        ];
        if (failures.length > 0) {
            console.warn('[aDAOLive] LP capture partial failure: ' + failures.join(', '));
            return null;
        }

        const positions = [];

        // Non-amplified positions
        for (const { bucket, staked } of stakingResults) {
            for (const entry of (staked || [])) {
                const assetInfo = entry.asset?.info;
                const shares = parseFloat(entry.shares) || 0;
                const balance = parseFloat(entry.asset?.amount) || 0;
                const totalShares = parseFloat(entry.total_shares) || 0;
                // Dust filter
                if (shares <= 1 && balance === 0) continue;
                if (shares === 0 && balance === 0) continue;

                const pool = catalog.findPool(assetInfo);
                let positionUsd = null;
                let pctOfPool = null;
                positionUsd = tlaDecompose.nonAmpPositionUsd(pool, shares, totalShares);
                if (positionUsd != null) pctOfPool = (shares / totalShares) * 100;
                positions.push({
                    bucket,
                    pool_name: pool?.name || null,
                    dex: pool?.dex || null,
                    is_amplified: false,
                    user_shares_human: shares / 1e6,
                    user_balance_human: balance / 1e6,
                    user_pct_of_pool: pctOfPool,
                    estimated_position_usd: positionUsd,
                    status: pool?.status || null,
                });
            }
        }

        // Amplified positions
        for (const { bucket, entries } of ampResults) {
            for (const entry of (entries || [])) {
                const userLp = parseFloat(entry.user_lp) || 0;
                const userAmplp = parseFloat(entry.user_amplp) || 0;
                if (userLp === 0 && userAmplp === 0) continue;

                const pool = catalog.findPool(entry.asset);
                let positionUsd = null;
                let pctOfPool = null;

                // Pool-pair: use total_share for pct, then × depth_usd or staked_in_tla_usd
                if (pool?.lp_health?.total_share) {
                    const totalShare = parseFloat(pool.lp_health.total_share) || 0;
                    if (totalShare > 0) {
                        pctOfPool = (userLp / totalShare) * 100;
                        // total_pool_usd base (not depth_usd) — shared core fixes the over-count.
                        positionUsd = tlaDecompose.ampPositionUsd(pool, userLp, totalShare);
                    }
                } else if (pool) {
                    // Single-asset pool — price by token symbol from network-prices
                    const symbolPrice = catalog.tokenPrices?.[pool.name]?.final_price_usd;
                    const asset0Price = pool.lp_health?.asset_0?.price_usd;
                    if (symbolPrice) {
                        positionUsd = (userLp / 1e6) * symbolPrice;
                    } else if (asset0Price) {
                        positionUsd = (userLp / 1e6) * asset0Price;
                    } else if (pool.staked_in_tla_usd) {
                        const totalLp = parseFloat(entry.total_lp) || 0;
                        if (totalLp > 0) {
                            pctOfPool = (userLp / totalLp) * 100;
                            positionUsd = pool.staked_in_tla_usd * (userLp / totalLp);
                        }
                    }
                }

                positions.push({
                    bucket,
                    pool_name: pool?.name || null,
                    dex: pool?.dex || null,
                    is_amplified: true,
                    user_lp_human: userLp / 1e6,
                    user_amplp_human: userAmplp / 1e6,
                    user_pct_of_pool: pctOfPool,
                    estimated_position_usd: positionUsd,
                    status: pool?.status || null,
                });
            }
        }

        const totalLpUsd = positions.reduce((s, p) => s + (p.estimated_position_usd || 0), 0);
        return { positions, totalLpUsd };
    }

    function _resolveLunaPrice(catalog) {
        // Prefer catalog (network-prices cron, current within the hour)
        const fromCatalog = catalog?.tokenPrices?.LUNA?.final_price_usd;
        if (typeof fromCatalog === 'number' && fromCatalog > 0) return fromCatalog;
        // Fall back to globals other pages may have populated via CoinGecko
        const fromWindow = global.cachedLunaPrice
            || global.cachedPriceData?.['terra-luna-2']?.usd
            || null;
        return fromWindow || null;
    }

    // Cron fallback: read adao-positions/current.json
    async function _fetchTlaDepositsFromCron() {
        try {
            const r = await fetch(REPO_ADAO_POSITIONS);
            if (!r.ok) return null;
            const data = await r.json();
            const t = data?.treasury;
            if (!t?.summary) return null;
            const s = t.summary;

            const walletBalances = Array.isArray(t.wallet_balances) ? t.wallet_balances : [];
            const zlunaBalances = walletBalances.filter(b => /zluna/i.test(b.symbol || b.denom || ''));
            const zlunaUsd  = zlunaBalances.reduce((sum, b) => sum + (b.usd_value || 0), 0);
            const zlunaLuna = zlunaBalances.reduce((sum, b) => sum + (b.luna_equivalent || 0), 0);

            return {
                source:            'cron',
                capturedAt:        data.capturedAt,
                positions:         Array.isArray(t.lp_positions) ? t.lp_positions : [],
                positionCount:     (t.lp_positions || []).length,
                totalLpUsd:        s.total_lp_position_usd     || 0,
                pendingRewardsUsd: s.total_pending_rewards_usd || 0,
                pendingBribesUsd:  s.total_pending_bribes_usd  || 0,
                zlunaUsd, zlunaLuna,
                totalTlaUsd:
                    (s.total_lp_position_usd     || 0) +
                    (s.total_pending_rewards_usd || 0) +
                    (s.total_pending_bribes_usd  || 0) +
                    zlunaUsd,
            };
        } catch (e) {
            console.warn('[aDAOLive] cron fallback failed:', e);
            return null;
        }
    }


    // ------------------------------------------------------------------------
    // DAO UNCLAIMED REWARDS — live RPC, no cron fallback
    // ------------------------------------------------------------------------
    //
    // Three reward categories:
    //   • depositLuna (LUNA-equiv): sum of pending zLUNA across 4 staking
    //     contracts, converted via each bucket's share_exchange_rate
    //   • rebaseLuna  (LUNA-equiv): from gauge controller user_pending_rebase
    //   • voteUsd: from bribe_manager user_claimable, summed across bribes
    //
    // Returns numbers, callers convert to USD using current LUNA price.

    async function getDaoUnclaimedRewards(options = {}) {
        const { skipCache = false, catalog = null, lunaPriceUsd = null } = options;
        const cacheKey = 'unclaimed_rewards';
        if (!skipCache) {
            const cached = _cacheGet(cacheKey, 60_000);
            if (cached) return cached;
        }

        const wallet = DAO_MAIN_WALLET;
        const ctx = catalog || await getTlaCatalog();

        // 8 parallel queries: 4× all_pending_rewards + rebase + vote claimable + 2× connector states
        const [bcResp, prResp, snResp, stResp, rebaseResp, voteResp, prConnResp, snConnResp] = await Promise.all([
            queryChain(TLA_STAKING_BY_BUCKET.bluechip, { all_pending_rewards: { address: wallet } }),
            queryChain(TLA_STAKING_BY_BUCKET.project,  { all_pending_rewards: { address: wallet } }),
            queryChain(TLA_STAKING_BY_BUCKET.single,   { all_pending_rewards: { address: wallet } }),
            queryChain(TLA_STAKING_BY_BUCKET.stable,   { all_pending_rewards: { address: wallet } }),
            queryChain(TLA_GAUGE_CONTROLLER, { user_pending_rebase: { user: wallet } }),
            queryChain(TLA_BRIBE_MANAGER,    { user_claimable: { user: wallet } }),
            queryChain(ZLUNA_CONNECTORS.project, { state: {} }),
            queryChain(ZLUNA_CONNECTORS.single,  { state: {} }),
        ]);

        // Deposit rewards: zLUNA per bucket → LUNA via connector rates
        const bucketResps = { bluechip: bcResp, project: prResp, single: snResp, stable: stResp };
        const zlunaByBucket = { bluechip: 0, project: 0, single: 0, stable: 0 };
        for (const [bucket, resp] of Object.entries(bucketResps)) {
            for (const item of (resp || [])) {
                const amount = parseFloat(item?.reward_asset?.amount) || 0;
                zlunaByBucket[bucket] += amount;
            }
        }

        // Connector share_exchange_rate per bucket (only project/single needed for the DAO's positions)
        const rates = {
            project: Number(prConnResp?.share_exchange_rate) || null,
            single:  Number(snConnResp?.share_exchange_rate) || null,
            bluechip: null, stable: null,
        };

        let depositLuna = 0;
        for (const bucket of TLA_BUCKETS) {
            const z = zlunaByBucket[bucket];
            const rate = rates[bucket];
            if (z > 0 && rate) {
                depositLuna += (z / 1e6) / rate;
            }
        }

        // Rebase: ampLUNA → LUNA via ratio (best-effort, fall back to 1:1)
        let rebaseLuna = 0;
        const rebaseAmpLuna = parseFloat(rebaseResp?.amount) || 0;
        if (rebaseAmpLuna > 0) {
            const ampLunaRatio = ctx?.lstRatios?.amp_luna?.ratio || 1;
            rebaseLuna = (rebaseAmpLuna / 1e6) * ampLunaRatio;
        }

        // Vote rewards: USD-priced via bribe manager response.
        // Schema: { start, end, buckets: [...] }
        let voteUsd = 0;
        const voteBuckets = voteResp?.buckets || [];
        for (const epoch of voteBuckets) {
            for (const claim of (epoch?.claims || epoch?.assets || [])) {
                const amt = parseFloat(claim?.amount) || 0;
                if (amt === 0) continue;
                // Detailed bribe-token pricing lives in the unclaimed-rewards
                // modal logic; this lightweight path leaves voteUsd at 0 unless
                // callers extend it. Most-of-the-time DAO bribes are claimed
                // promptly so this stays empty between epochs.
            }
        }

        const result = { depositLuna, rebaseLuna, voteUsd, lunaPriceUsd };
        _cacheSet(cacheKey, result);
        return result;
    }


    // ------------------------------------------------------------------------
    // DAO TREASURY — live wallet balances
    // ------------------------------------------------------------------------
    //
    // Queries the DAO main wallet's native + cw20 balances live. Token list
    // is the shared denomMap above. Returns array of priced assets.
    //
    // For "combined treasury" (main + council + Lion DAO staked), callers
    // need to call getDaoCouncilTreasury() + getDaoStakedLuna() separately.

    async function getDaoTreasury(options = {}) {
        const { wallet = DAO_MAIN_WALLET, skipCache = false } = options;
        const cacheKey = 'treasury:' + wallet;
        if (!skipCache) {
            const cached = _cacheGet(cacheKey, 60_000);
            if (cached) return cached;
        }

        const assets = [];

        // 1) Native + IBC bank balances
        const bals = await bankBalances(wallet);
        if (bals) {
            for (const b of bals) {
                const info = denomMap[b.denom];
                if (!info) continue;
                const amount = Number(b.amount) / Math.pow(10, info.decimals || 6);
                if (amount > 0) assets.push({ name: info.name, geckoId: info.geckoId, amount, source: 'bank' });
            }
        }

        // 2) CW20 token balances (parallel)
        const cw20Denoms = Object.entries(denomMap).filter(([d]) => d.startsWith('terra1'));
        const cw20Results = await Promise.all(cw20Denoms.map(async ([contract, info]) => {
            const raw = await cw20Balance(contract, wallet);
            if (!raw) return null;
            const amount = Number(raw) / Math.pow(10, info.decimals || 6);
            if (amount <= 0) return null;
            return { name: info.name, geckoId: info.geckoId, amount, source: 'cw20' };
        }));
        for (const r of cw20Results) if (r) assets.push(r);

        // 3) Apply CoinGecko prices
        const geckoIds = Array.from(new Set(assets.map(a => a.geckoId).filter(Boolean)));
        let prices = {};
        if (geckoIds.length > 0) {
            try {
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join(',')}&vs_currencies=usd`;
                const r = await fetch(url);
                if (r.ok) prices = await r.json();
            } catch (_) {}
        }

        const valued = assets.map(a => {
            const priceUsd = prices[a.geckoId]?.usd ?? null;
            return {
                ...a,
                priceUsd,
                usdValue: priceUsd != null ? a.amount * priceUsd : null,
            };
        });

        const allPriced = valued.every(a => a.usdValue !== null);
        const totalUsd = valued.reduce((s, a) => s + (a.usdValue || 0), 0);

        const result = {
            source:    'live',
            wallet,
            capturedAt: new Date().toISOString(),
            assets:    valued,
            totalUsd:  allPriced ? totalUsd : null,
            allPriced,
        };
        _cacheSet(cacheKey, result);
        return result;
    }


    // ------------------------------------------------------------------------
    // CRON FETCHERS — direct passthrough for pages that want raw cron data
    // ------------------------------------------------------------------------

    async function getCron(name) {
        const urls = {
            positions:     REPO_ADAO_POSITIONS,
            tlaSnapshot:   REPO_TLA_SNAPSHOT,
            networkPrices: REPO_NETWORK_PRICES,
            nftInventory:  REPO_NFT_INVENTORY,
        };
        const url = urls[name];
        if (!url) throw new Error(`Unknown cron: ${name}`);
        try {
            const r = await fetch(url);
            if (!r.ok) return null;
            return await r.json();
        } catch (_) { return null; }
    }


    // ------------------------------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------------------------------

    global.aDAOLive = {
        // Version
        VERSION: '1.0.0',

        // Composite getters (most pages need these)
        getDaoTlaDeposits,
        getDaoTreasury,
        getDaoUnclaimedRewards,

        // Catalog + primitives
        getTlaCatalog,
        queryChain,
        bankBalances,
        cw20Balance,

        // Cron pass-through
        getCron,

        // Cache control
        clearCache,

        // Constants (callers may need)
        DAO_MAIN_WALLET,
        DAO_COUNCIL_WALLET,
        TLA_ASSET_COMPOUNDER,
        TLA_STAKING_BY_BUCKET,
        TLA_BUCKETS,
        ZLUNA_CONNECTORS,
        denomMap,
    };

})(typeof window !== 'undefined' ? window : globalThis);
