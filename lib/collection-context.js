/* =============================================================================
 * lib/collection-context.js 1.0.0 (2026-09-19) — THE TENANT LAYER for every page.
 * -----------------------------------------------------------------------------
 * One list of allies lives in tla-core/docs/curated/tenants.json (label, logo, theme, collections, DAOs); one manifest
 * per collection lives in nft-collections/<slug>/collection.json (contract, traits, rarity, images, features, custody,
 * backing, tiers, venues). This lib reads both and hands a page everything it used to hard-code for aDAO:
 *
 *   const ctx = await CollectionContext.load();          // the selected tenant (URL ?tenant= · /<slug> path · device pref · default)
 *   ctx.tenant.label / .logo / .theme / .short
 *   ctx.collections[]  — one per collection of the tenant, in tenants.json order; ctx.primary = the first
 *     c.slug · c.label · c.supply · c.contract · c.traits (['Planet', …]) · c.venues (['bbl', …])
 *     c.url('snapshots/nfts.json')  → https://raw.githubusercontent.com/thealliancedao/nft-collections/main/<slug>/snapshots/nfts.json
 *     c.assets.metadata · c.assets.rarity · c.assets.rarity_secondary · c.assets.image(id)   (site assets for aDAO, the manifest for the rest)
 *     c.features.backing / .break_mechanism / .tiers / .custody / .enterprise / .member_portfolio / .name_registry
 *     c.labels.unminted  — what a token in the DAO core is called on this collection ("Unminted" for aDAO, "DAO held" otherwise)
 *   CollectionContext.select('liondao')   // remembers the tenant on this device (ally:prefs) and reloads
 *
 * Owner rulings folded in: ONE explorer page for every tenant; the dropdown under the header logo locks the tenant and
 * every page visited after keeps it; /<slug> (a Vercel rewrite to index.html) sets the default; the registry holds the
 * literals — the ADAO block below exists only so the site never blanks when tenants.json is unreachable (it reproduces
 * today's aDAO literals byte for byte; gate-explorer-tenant.mjs proves it against the registry) and so aDAO's edge-served
 * site assets (metadata, rarity) keep their fast path. A page that renders before load() resolves must render aDAO.
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CollectionContext = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.0.0';
  var G = typeof globalThis !== 'undefined' ? globalThis : root;   // location / localStorage: the page's globals (gates swap them)
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var NFTC = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
  var TENANTS_URL = CORE + 'docs/curated/tenants.json';
  var PREFS_KEY = 'ally:prefs';

  // aDAO's site-served assets (Vercel edge-cached, the fast path) — a site literal, not a registry one.
  var SITE_ASSETS = {
    adao: { metadata: '/assets/nft-metadata/all_nfts_metadata.json', rarity: '/assets/nft-metadata/adao-rarity-intended.json', rarity_secondary: '/assets/nft-metadata/adao-rarity-bbl.json',
            image: function (id) { return 'https://imagedelivery.net/v_zOWVQCPb7Xpcbu-gQC1A/alliance_dao/' + id + '/public'; } }
  };
  // The default tenant, verbatim, for the moment the registry cannot be read (never a blank page): the gate proves this
  // block === tenants.json's adao block + adao/collection.json's derived context, field by field.
  var ADAO_FALLBACK = {
    tenants: { adao: { label: 'AllianceDAO', short: 'aDAO', default: true, live: true, logo: '/assets/images/Alliance%20DAO%20Logo.png', collections: ['adao'], daos: ['adao'], theme: { accent: '#22d3ee', bg: '#121212', font: 'Inter' } } },
    manifests: { adao: { slug: 'adao', name: 'The Alliance DAO', supply: 10000, nft_contract: 'terra1phr9fngjv7a8an4dhmhd0u0f98wazxfnzccqtyheq4zqrrp4fpuqw3apw9',
      traits: [{ name: 'Planet' }, { name: 'Inhabitant' }, { name: 'Object' }, { name: 'Weather' }, { name: 'Light' }, { name: 'Rarity' }],
      marketplaces: [{ key: 'bbl' }, { key: 'atrium' }, { key: 'boost' }],
      backing: { token: { type: 'cw20', symbol: 'ampLUNA', address: 'terra1ecgazyd0waaj3g7l9cmy5gulhxkps2gmxu9ghducvuypjq68mq2s5lvsct' }, break_mechanism: true },
      rarity: { method: 'intended' },
      tiers: { phoenix: { label: 'Phoenix', trait: 'Object', value: 'Phoenix Rising' } },
      custody: { treasury_contract: 'terra1h8psjgcsg9fef7w2yv0j6262sfcaszj8vs4tsy3uwla6zwtaspvqrp4l7v', council_wallet: 'terra1yqv0af22675wlcmgflxk4ve07vt8qlm999gk0cuw5l64r5xxgadsyg8ywv', enterprise_operator: 'terra1nn7yrgjzj6zvle7ms9vlpg4cj3kaxjls4g6ugw' },
      governance: { dao_address: 'terra1sffd4efk2jpdt894r04qwmtjqrrjfc52tmj6vkzjxqhd8qqu2drs3m5vzm', staking_contract: 'terra1c57ur376szdv8rtes6sa9nst4k536dynunksu8tx5zu4z5u3am6qmvqx47' },
      capture: { custodians: { 'terra1e54tcdyulrtslvf79htx4zntqntd4r550cg22sj24r6gfm0anrvq0y8tdv': { role: 'enterprise_staking' } } },
      features: { explorer: true, analytics: true, wallet_view: true, member_portfolio: { enabled: true }, member_name_registry: true } } }
  };

  function prefsGet() { try { return JSON.parse(G.localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { return {}; } }
  function prefsSet(patch) { var cur = prefsGet(); Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; }); try { G.localStorage.setItem(PREFS_KEY, JSON.stringify(cur)); } catch (e) {} }
  function readFromLocation(known) {
    try {
      var q = new URLSearchParams(G.location.search || '').get('tenant'); if (q && known[q]) return { slug: q, via: 'query' };
      var seg = String(G.location.pathname || '').split('/').filter(Boolean)[0] || ''; if (seg && known[seg]) return { slug: seg, via: 'path' };   // /liondao → the Vercel rewrite lands on index.html; the path names the tenant
    } catch (e) {}
    return null;
  }
  function pickTenant(tenants, wanted) {
    var slugs = Object.keys(tenants || {}); if (!slugs.length) return null;
    var def = slugs.filter(function (s) { return tenants[s] && tenants[s].default; })[0] || slugs[0];
    if (wanted && tenants[wanted]) return { slug: wanted, via: 'arg' };
    var loc = readFromLocation(tenants); if (loc) { prefsSet({ tenant: loc.slug }); return loc; }   // a URL choice becomes the device's choice
    var pref = prefsGet().tenant; if (pref && tenants[pref]) return { slug: pref, via: 'prefs' };
    return { slug: def, via: 'default' };
  }
  function byRole(manifest, role) { var c = (manifest && manifest.capture && manifest.capture.custodians) || {}; for (var a in c) if (c[a] && c[a].role === role) return a; return null; }
  function collectionContext(slug, m) {
    m = m || {}; var siteAssets = SITE_ASSETS[slug] || null;
    var url = function (rel) { return NFTC + slug + '/' + String(rel).replace(/^\/+/, ''); };
    var traitsAll = (m.traits || []).map(function (t) { return t.name; }).filter(Boolean);
    var hasBacking = !!(m.backing && m.backing.token && m.backing.token.address);
    var tiers = m.tiers ? Object.keys(m.tiers) : [];
    var img = m.images && m.images.cdn_pattern ? m.images.cdn_pattern : null;
    return {
      slug: slug, label: m.name || slug, supply: Number(m.supply) || null, contract: m.nft_contract || null, manifest: m,
      traits: traitsAll.filter(function (n) { return n !== 'Rarity'; }),           // trait columns; Rarity is a computed column, not a trait
      trait_defs: m.traits || [],
      venues: (m.marketplaces || []).map(function (x) { return x.key; }).filter(Boolean),
      url: url,
      assets: {
        metadata: siteAssets ? siteAssets.metadata : url(m.metadata_file ? String(m.metadata_file).replace(new RegExp('^' + slug + '/'), '') : 'metadata/metadata.json'),
        rarity: siteAssets ? siteAssets.rarity : (m.rarity && m.rarity.file ? url(String(m.rarity.file).replace(new RegExp('^' + slug + '/'), '')) : null),
        rarity_secondary: siteAssets ? siteAssets.rarity_secondary : null,
        rarity_method: (m.rarity && m.rarity.method) || null,
        image: siteAssets ? siteAssets.image : (img ? function (id) { return img.replace('{id}', String(id)); } : function () { return null; })
      },
      features: {
        backing: hasBacking, backing_symbol: hasBacking ? m.backing.token.symbol || null : null,
        break_mechanism: !!(m.backing && m.backing.break_mechanism),
        tiers: tiers, phoenix: tiers.indexOf('phoenix') !== -1,
        custody: !!(m.custody && Object.keys(m.custody).length),
        enterprise: !!byRole(m, 'enterprise_staking') || !!(m.governance && m.governance.enterprise_legacy),
        member_portfolio: !!(m.features && m.features.member_portfolio && m.features.member_portfolio.enabled),
        name_registry: !!(m.features && m.features.member_name_registry),
        analytics: !(m.features && m.features.analytics === false), wallet_view: !(m.features && m.features.wallet_view === false)
      },
      governance: { dao_address: (m.governance && m.governance.dao_address) || null, staking_contract: (m.governance && m.governance.staking_contract) || null, dao_name: (m.governance && m.governance.dao_name) || null },
      labels: { unminted: (m.custody && Object.keys(m.custody).length) ? 'Unminted' : 'DAO held', backing: hasBacking ? m.backing.token.symbol : null }
    };
  }
  async function getJson(u) { var r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); }

  var cache = null;
  // load({ tenant, tenants, manifests }) — tenants/manifests may be injected (gates); otherwise fetched. Never throws: on a
  // registry failure it returns the aDAO fallback with `degraded: 'tenants.json unreachable'` so the page can say so.
  async function load(opts) {
    opts = opts || {};
    if (cache && !opts.tenant && !opts.tenants && !opts.fresh) return cache;
    var tenantsDoc = opts.tenants || null, degraded = null;
    if (!tenantsDoc) { try { tenantsDoc = await getJson(TENANTS_URL); } catch (e) { tenantsDoc = ADAO_FALLBACK; degraded = 'tenants.json unreachable: ' + e.message; } }
    var tenants = tenantsDoc.tenants || {};
    var pick = pickTenant(tenants, opts.tenant) || { slug: 'adao', via: 'fallback' };
    var t = tenants[pick.slug];
    var manifests = opts.manifests || {};
    var cols = [];
    for (var i = 0; i < (t.collections || []).length; i++) {
      var slug = t.collections[i]; var m = manifests[slug] || null;
      if (!m) { try { m = await getJson(NFTC + slug + '/collection.json'); } catch (e) { m = ADAO_FALLBACK.manifests[slug] || null; if (!m) { degraded = (degraded ? degraded + '; ' : '') + slug + '/collection.json unreachable'; continue; } } }
      cols.push(collectionContext(slug, m));
    }
    var ctx = { version: VERSION, tenant: Object.assign({ slug: pick.slug }, t), selected_via: pick.via, tenants: tenants, collections: cols, primary: cols[0] || null, degraded: degraded,
      urls: { tenants: TENANTS_URL, core: CORE, nftc: NFTC } };
    if (!opts.tenants) cache = ctx;
    return ctx;
  }
  function select(slug) { prefsSet({ tenant: slug }); try { var u = new URL(G.location.href); u.searchParams.delete('tenant'); G.location.href = u.pathname === '/' + slug ? '/' : u.href; } catch (e) { G.location.reload(); } }
  return { VERSION: VERSION, load: load, select: select, collectionContext: collectionContext, pickTenant: pickTenant, prefsGet: prefsGet, ADAO_FALLBACK: ADAO_FALLBACK, SITE_ASSETS: SITE_ASSETS, TENANTS_URL: TENANTS_URL, NFTC: NFTC, CORE: CORE };
});
