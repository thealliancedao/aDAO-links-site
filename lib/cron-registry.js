/* =============================================================================
 * lib/cron-registry.js — ONE source of truth for platform health.
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS (2026-08-12): index.html and tla-stats.html each carried
 * their own hardcoded CRON_REGISTRY, and transparency-hub read a THIRD source
 * (the dead legacy system-health file). They drifted: tla-stats showed every
 * job red because its cadences still said "weekly" for jobs that now run
 * hourly, the hub showed 42% confidence off a frozen file, and neither knew
 * about products added during the org migration (participants, dao-dashboard,
 * tla-flows, token-catalog, catalog, nft-analytics).
 *
 * Every page now reads THIS file. Adding a cron = one entry here, and it
 * appears everywhere.
 *
 * CADENCE HONESTY: `cadenceMs` is what the Render schedule actually is, not an
 * aspiration. `warningMs` / `staleMs` are derived (2x / 4x by default) so a
 * single late run never cries wolf, but a genuinely dead job goes red fast.
 * Anything measured 2026-08-12 against live heartbeat ages.
 * ============================================================================= */
(function (root) {
  'use strict';

  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main';

  // Cadence presets — keep the thresholds in ONE place so every product with
  // the same schedule is judged identically.
  var HOURLY   = { cadence: 'hourly',   cadenceMs: 36e5,      warningMs: 2 * 36e5,  staleMs: 4 * 36e5 };
  var FAST     = { cadence: '15 min',   cadenceMs: 9e5,       warningMs: 36e5,      staleMs: 3 * 36e5 };
  var SIXHOUR  = { cadence: 'every 6h', cadenceMs: 6 * 36e5,  warningMs: 9 * 36e5,  staleMs: 18 * 36e5 };
  var DAILY    = { cadence: 'daily',    cadenceMs: 864e5,     warningMs: 30 * 36e5, staleMs: 48 * 36e5 };

  /* Each entry:
   *   key         stable id (used by pages for lookup)
   *   label       human name
   *   group       'core' | 'dex' | 'nft' | 'governance' | 'meta'
   *   description what it powers — shown under the label
   *   sourceUrl   heartbeat (or the product itself when it carries a timestamp)
   *   tsPath      where the timestamp lives, dot-notation; first hit wins
   *   job         the Render job that writes it — so a red dot tells you WHERE to look
   *   ...cadence  spread from a preset above
   */
  var CRONS = [
    // ---- core aggregation (org-member-data, hourly) -------------------------
    Object.assign({
      key: 'tla-snapshot', label: 'TLA Snapshot', group: 'core',
      description: 'Unified aggregator — pools, buckets, VP totals, rewards model',
      sourceUrl: CORE + '/member-data/tla-snapshot/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-member-data',
    }, HOURLY),
    Object.assign({
      key: 'tla-participants', label: 'TLA Participants', group: 'core',
      description: 'Every veLUNA lock holder — names, locks, LPs, pending rewards',
      sourceUrl: CORE + '/member-data/participants/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-member-data',
    }, HOURLY),
    Object.assign({
      key: 'adao-positions', label: 'aDAO Positions', group: 'core',
      description: 'Treasury, council + all aDAO member portfolios',
      sourceUrl: CORE + '/member-data/positions/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-member-data',
    }, HOURLY),
    Object.assign({
      key: 'dao-dashboard', label: 'DAO Dashboard', group: 'core',
      description: 'Treasury value, TLA deposits, unclaimed rewards, rebase, alliances',
      sourceUrl: CORE + '/member-data/dao-dashboard/current.json',
      tsPath: ['meta.generated_at'], job: 'org-member-data',
    }, HOURLY),
    Object.assign({
      key: 'network-and-prices', label: 'Network & Prices', group: 'core',
      description: 'LUNA price, LST hub ratios, token prices — priced by every other job',
      sourceUrl: CORE + '/network-and-prices/heartbeat.json',
      tsPath: ['capturedAt'], job: 'nap-org',
    }, HOURLY),

    // ---- governance / voting ------------------------------------------------
    Object.assign({
      key: 'tla-voting', label: 'Voting & Bribes', group: 'governance',
      description: 'Votes, locks, bribes, distributions — continuous chain capture',
      sourceUrl: CORE + '/tla-voting/events/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-tla-voting',
    }, FAST),
    Object.assign({
      key: 'tla-flows', label: 'TLA Flows', group: 'governance',
      description: 'LP deposit/withdraw flow events (block walker)',
      sourceUrl: CORE + '/tla-flows/events/heartbeat.json',
      tsPath: ['capturedAt', 'generated_at'], job: 'org-tla-flows',
    }, FAST),
    Object.assign({
      key: 'dao-governance', label: 'DAO Governance', group: 'governance',
      description: 'Proposals, votes and trust-scored messages per DAO',
      sourceUrl: 'https://raw.githubusercontent.com/thealliancedao/dao-originations/main/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-dao-governance',
    }, SIXHOUR),

    // ---- DEX ----------------------------------------------------------------
    Object.assign({
      key: 'astroport', label: 'Astroport Pools', group: 'dex',
      description: 'Pool TVL, volume, epoch aggregates (feeds TLA Snapshot)',
      sourceUrl: CORE + '/dex-data/astroport/epochs/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-dex-data',
    }, HOURLY),
    Object.assign({
      key: 'skeletonswap', label: 'Skeleton Swap', group: 'dex',
      description: 'SS pool reserves + TVL, chain-direct since the warlock freeze',
      sourceUrl: CORE + '/dex-data/skeletonswap/rolling/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-dex-data',
    }, HOURLY),
    Object.assign({
      key: 'votion', label: 'Votion', group: 'dex',
      description: 'Vault holdings + per-user Votion positions',
      sourceUrl: CORE + '/votion/heartbeat.json',
      tsPath: ['capturedAt', 'positions_at'], job: 'org-votion',
    }, HOURLY),

    // ---- NFT ----------------------------------------------------------------
    Object.assign({
      key: 'nft-inventory', label: 'NFT Inventory', group: 'nft',
      description: 'Per-NFT ownership, staking, listings, backing (10k tokens)',
      sourceUrl: CORE + '/nfts/adao/snapshots/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-nft-inventory',
    }, FAST),
    Object.assign({
      key: 'nft-analytics', label: 'NFT Analytics', group: 'nft',
      description: 'Floors by rarity, sales analytics, explorer feed',
      sourceUrl: CORE + '/nfts/adao/snapshots/analytics-heartbeat.json',
      tsPath: ['generated_at', 'capturedAt'], job: 'org-nft-inventory',
    }, DAILY),

    Object.assign({
      key: 'nft-flows', label: 'NFT Flows', group: 'nft',
      description: 'Per-token transfer/mint/sale flow ledger by month',
      sourceUrl: CORE + '/nfts/adao/flows/heartbeat.json',
      tsPath: ['capturedAt', 'generated_at'], job: 'org-nft-flows',
    }, DAILY),

    // ---- registries / meta --------------------------------------------------
    Object.assign({
      key: 'token-catalog', label: 'Token Catalog', group: 'meta',
      description: 'Token identity + pricing coverage, keyed by address',
      sourceUrl: CORE + '/token-catalog/snapshots/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-token-catalog',
    }, HOURLY),
    Object.assign({
      key: 'address-catalog', label: 'Address Catalog', group: 'meta',
      description: 'Who we track — DAO members, lockers, allies, by slug',
      sourceUrl: CORE + '/catalog/snapshots/heartbeat.json',
      tsPath: ['capturedAt'], job: 'org-address-catalog',
    }, DAILY),
    Object.assign({
      key: 'system-health', label: 'System Health', group: 'meta',
      description: 'Invariant checks across every org product',
      sourceUrl: CORE + '/system-health/current.json',
      tsPath: ['meta.generated_at', 'capturedAt'], job: 'org-system-health',
    }, HOURLY),
  ];

  function dig(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o == null ? o : o[k]); }, obj);
  }

  // Freshness verdict from age alone — the same rule everywhere.
  //   fresh   : within cadence
  //   due     : past cadence but under warning (a run is simply pending)
  //   warning : past warning threshold
  //   stale   : past stale threshold — something is wrong
  function verdict(entry, ageMs) {
    if (ageMs == null || !isFinite(ageMs)) return 'unknown';
    if (ageMs <= entry.cadenceMs) return 'fresh';
    if (ageMs <= entry.warningMs) return 'due';
    if (ageMs <= entry.staleMs) return 'warning';
    return 'stale';
  }

  function humanAge(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    var s = ms / 1000;
    if (s < 90) return Math.round(s) + 's ago';
    if (s < 5400) return Math.round(s / 60) + 'm ago';
    if (s < 129600) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }

  // Fetch every entry; never throws. Each result carries enough context that a
  // red dot tells you WHICH Render job to open.
  function fetchAll(opts) {
    var bust = (opts && opts.cacheBust !== false);
    return Promise.all(CRONS.map(function (c) {
      var url = c.sourceUrl + (bust ? ('?t=' + Date.now()) : '');
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) {
            return Object.assign({}, c, { state: 'unknown', ageMs: null, capturedAt: null,
              detail: 'no heartbeat published yet' });
          }
          var ts = null;
          for (var i = 0; i < c.tsPath.length && ts == null; i++) ts = dig(d, c.tsPath[i]);
          var ageMs = ts ? (Date.now() - Date.parse(ts)) : null;
          // A product may declare its own status (ok / partial / stuck); a
          // self-declared problem outranks a fresh timestamp.
          var declared = d.status || (d.meta && d.meta.status) || null;
          var state = verdict(c, ageMs);
          if (declared && declared !== 'ok' && declared !== 'pass' && state === 'fresh') {
            state = (declared === 'stuck' || declared === 'error' || declared === 'violation') ? 'warning' : 'due';
          }
          return Object.assign({}, c, {
            state: state, ageMs: ageMs, capturedAt: ts, declared: declared,
            ageText: humanAge(ageMs),
            detail: declared && declared !== 'ok'
              ? ('reported "' + declared + '" — ' + humanAge(ageMs))
              : humanAge(ageMs),
          });
        })
        .catch(function (e) {
          return Object.assign({}, c, { state: 'unknown', ageMs: null, capturedAt: null,
            detail: 'unreachable: ' + (e && e.message ? e.message : 'error') });
        });
    }));
  }

  // Overall verdict + a confidence number pages can render identically.
  function summarize(results) {
    var counts = { fresh: 0, due: 0, warning: 0, stale: 0, unknown: 0 };
    results.forEach(function (r) { counts[r.state] = (counts[r.state] || 0) + 1; });
    var healthy = counts.fresh + counts.due;          // "due" is normal, not a fault
    var scored = healthy + counts.warning + counts.stale;
    var confidence = scored ? Math.round((healthy / scored) * 100) : 100;
    var overall = counts.stale ? 'degraded' : (counts.warning ? 'watch' : 'ok');
    return {
      counts: counts, confidence: confidence, overall: overall,
      attention: results.filter(function (r) { return r.state === 'warning' || r.state === 'stale' || r.state === 'unknown'; }),
      newestAt: results.reduce(function (a, r) {
        return (r.capturedAt && (!a || r.capturedAt > a)) ? r.capturedAt : a;
      }, null),
    };
  }

  root.CronRegistry = {
    CRONS: CRONS,
    GROUPS: ['core', 'governance', 'dex', 'nft', 'meta'],
    GROUP_LABELS: { core: 'Core data', governance: 'Governance', dex: 'DEX', nft: 'NFT', meta: 'Registries' },
    fetchAll: fetchAll,
    summarize: summarize,
    humanAge: humanAge,
    verdict: verdict,
    STATE_LABELS: {
      fresh: 'Fresh', due: 'Run pending', warning: 'Late',
      stale: 'Stale', unknown: 'No signal',
    },
    // Shared colours so every page's dots mean the same thing.
    STATE_COLORS: {
      fresh: '#22c55e', due: '#84cc16', warning: '#f59e0b',
      stale: '#ef4444', unknown: '#6b7280',
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
