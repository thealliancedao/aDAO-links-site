/* =============================================================================
 * lib/collection-context.js 1.1.0 (2026-09-19) — THE TENANT LAYER for every page.
 * -----------------------------------------------------------------------------
 * One list of allies lives in tla-core/docs/curated/tenants.json (label, logo, theme, collections, DAOs); one manifest
 * per collection lives in nft-collections/<slug>/collection.json (contract, traits, rarity, images, features, custody,
 * backing, tiers, venues). This lib reads both and hands a page everything it used to hard-code for aDAO:
 *
 *   const ctx = await CollectionContext.load();          // the selected tenant (URL ?tenant= · /<slug> path · device pref · default)
 *   ctx.tenant.label / .logo / .theme / .short
 *   ctx.collections[]  — one per collection of the tenant, in tenants.json order; ctx.primary = the first
 *     c.slug · c.label · c.supply · c.contract · c.traits (['Planet', …]) · c.venues (['bbl', …]) · c.token_name(id)
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
  var VERSION = '1.2.0';   // 1.2.0 (owner 2026-09-26: Burning Lions into the explorer): a tenant's SECOND collection is selectable (?collection=<slug> · load({collection}) · selectCollection()); ctx.primary = the selected one. A collection whose media is per token (images.mode 'token_uri' — one file name per token, gif/png/mp4) gets its image rule from its media index (metadata/metadata.json tokens[].image_file), and its metadata in the page's array shape (c.normalizeMetadata) with traits DERIVED as the manifest says (traits[].from: 'name' · 'animated' · 'attribute:<type>'). A collection with no rarity file says so (c.rarity_enabled false) — no page borrows aDAO's ranks. 1.1.1: assets.image_fallback (images.cdn_fallback) · 1.1.0: assets.mark (images.mark), image(id, variant)
  var G = typeof globalThis !== 'undefined' ? globalThis : root;   // location / localStorage: the page's globals (gates swap them)
  var CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/';
  var NFTC = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
  var TENANTS_URL = CORE + 'docs/curated/tenants.json';
  var PREFS_KEY = 'ally:prefs';

  // aDAO's site-served assets (Vercel edge-cached, the fast path) — a site literal, not a registry one.
  var SITE_ASSETS = {
    adao: { metadata: '/assets/nft-metadata/all_nfts_metadata.json', rarity: '/assets/nft-metadata/adao-rarity-intended.json', rarity_secondary: '/assets/nft-metadata/adao-rarity-bbl.json',
            image: function (id, variant) { return 'https://imagedelivery.net/v_zOWVQCPb7Xpcbu-gQC1A/alliance_dao/' + id + '.png/' + (variant || 'public'); } }   // the explorer's Cloudflare rule, verbatim
  };
  // The default tenant, verbatim, for the moment the registry cannot be read (never a blank page): the gate proves this
  // block === tenants.json's adao block + adao/collection.json's derived context, field by field.
  var ADAO_FALLBACK = {
    tenants: { adao: { label: 'AllianceDAO', short: 'aDAO', default: true, live: true, logo: '/assets/images/Alliance%20DAO%20Logo.png', collections: ['adao'], daos: ['adao'], theme: { accent: '#22d3ee', bg: '#121212', font: 'Inter' } } },
    manifests: { adao: { slug: 'adao', name: 'The Alliance DAO', supply: 10000, token_name_pattern: 'The AllianceDAO NFT #{id}', nft_contract: 'terra1phr9fngjv7a8an4dhmhd0u0f98wazxfnzccqtyheq4zqrrp4fpuqw3apw9',
      traits: [{ name: 'Planet' }, { name: 'Inhabitant' }, { name: 'Object' }, { name: 'Weather' }, { name: 'Light' }, { name: 'Rarity' }],
      marketplaces: [{ key: 'bbl' }, { key: 'atrium' }, { key: 'boost' }],
      backing: { token: { type: 'cw20', symbol: 'ampLUNA', address: 'terra1ecgazyd0waaj3g7l9cmy5gulhxkps2gmxu9ghducvuypjq68mq2s5lvsct' }, break_mechanism: true },
      rarity: { method: 'intended' },
      tiers: { phoenix: { label: 'Phoenix', trait: 'Object', value: 'Phoenix Rising' } },
      custody: { treasury_contract: 'terra1h8psjgcsg9fef7w2yv0j6262sfcaszj8vs4tsy3uwla6zwtaspvqrp4l7v', council_wallet: 'terra1yqv0af22675wlcmgflxk4ve07vt8qlm999gk0cuw5l64r5xxgadsyg8ywv', enterprise_operator: 'terra1nn7yrgjzj6zvle7ms9vlpg4cj3kaxjls4g6ugw' },
      governance: { dao_address: 'terra1sffd4efk2jpdt894r04qwmtjqrrjfc52tmj6vkzjxqhd8qqu2drs3m5vzm', staking_contract: 'terra1c57ur376szdv8rtes6sa9nst4k536dynunksu8tx5zu4z5u3am6qmvqx47' },
      capture: { custodians: { 'terra1e54tcdyulrtslvf79htx4zntqntd4r550cg22sj24r6gfm0anrvq0y8tdv': { role: 'enterprise_staking' } } },
      images: { mark: '/assets/images/Alliance%20DAO%20Logo.png' },
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
  function readCollection(cols) { try { var q = new URLSearchParams(G.location.search || '').get('collection'); if (q) for (var i = 0; i < cols.length; i++) if (cols[i].slug === q) return cols[i]; } catch (e) {} return null; }
  // 1.2.0: per-token media (images.mode 'token_uri'): the media index names each token's file; kinds decide <img> vs <video>
  function mediaKind(file, kind) { if (/^video/.test(kind || '') || /\.(mp4|webm|mov)$/i.test(file || '')) return 'video'; return 'image'; }
  function isAnimated(t) { return !!(t && (t.animation_file || /animated/.test(t.image_kind || '') || /\.gif$/i.test(t.image_file || ''))); }
  async function attachMedia(c) {
    var m = c.manifest || {}; var im = m.images || {}; if (im.mode !== 'token_uri') return;
    var rel = String(im.media_index || m.metadata_file || (c.slug + '/metadata/metadata.json')).replace(new RegExp('^' + c.slug + '/'), '');
    var doc = null; try { doc = await getJson(c.url(rel)); } catch (e) { doc = null; }
    var toks = doc && Array.isArray(doc.tokens) ? doc.tokens : []; var by = {}; toks.forEach(function (t) { by[String(t.id)] = t; });
    var base = (doc && doc.media_base) || im.cdn_base || c.url('images/'), fb = (doc && doc.media_fallback_base) || im.cdn_fallback_base || null;
    c.media = { tokens: by, base: base, fallback_base: fb, loaded: !!doc };
    c.assets.image = function (id) { var t = by[String(id)]; return t && t.image_file ? base + t.image_file : null; };
    c.assets.image_fallback = fb ? function (id) { var t = by[String(id)]; return t && t.image_file ? fb + t.image_file : null; } : null;
    c.assets.animation = function (id) { var t = by[String(id)]; return t && t.animation_file ? base + t.animation_file : null; };
    c.assets.media_kind = function (id) { var t = by[String(id)]; return t ? mediaKind(t.animation_file || t.image_file, t.animation_kind || t.image_kind) : null; };
    c.assets.is_animated = function (id) { return isAnimated(by[String(id)]); };
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
      token_name: function (id) { return String(m.token_name_pattern || ((m.name || slug) + ' #{id}')).replace('{id}', String(id)); },   // the manifest's token_name_pattern
      traits: traitsAll.filter(function (n) { return n !== 'Rarity'; }),           // trait columns; Rarity is a computed column, not a trait
      trait_defs: m.traits || [],
      venues: (m.marketplaces || []).map(function (x) { return x.key; }).filter(Boolean),
      url: url,
      assets: {
        metadata: siteAssets ? siteAssets.metadata : url(m.metadata_file ? String(m.metadata_file).replace(new RegExp('^' + slug + '/'), '') : 'metadata/metadata.json'),
        rarity: siteAssets ? siteAssets.rarity : (m.rarity && m.rarity.file ? url(String(m.rarity.file).replace(new RegExp('^' + slug + '/'), '')) : null),
        rarity_secondary: siteAssets ? siteAssets.rarity_secondary : null,
        rarity_method: (m.rarity && m.rarity.method) || null,
        image: siteAssets ? siteAssets.image : (img ? function (id) { return img.replace('{id}', String(id)); } : function () { return null; }),
        mark: (m.images && m.images.mark) || null,   // the collection's own mark (tenant logo ≠ collection mark — owner 2026-09-18)
        image_fallback: (m.images && m.images.cdn_fallback) ? function (id) { return String(m.images.cdn_fallback).replace('{id}', String(id)); } : null   // 1.1.1: a second host for the same file (the manifest's cdn_fallback)
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
      labels: { unminted: (m.custody && Object.keys(m.custody).length) ? 'Unminted' : 'DAO held', backing: hasBacking ? m.backing.token.symbol : null },
      rarity_enabled: !!(siteAssets ? siteAssets.rarity : (m.rarity && m.rarity.file)),   // 1.2.0: false = a 1/1 collection (or none built) — no ranks, no borrowed file
      // 1.2.0: the page's metadata shape ([{id, name, attributes:[{trait_type, value}]}]) from either an array file or a media index
      //   ({tokens:[…]}); a trait with `from` is derived: 'name' (the token's own name) · 'animated' (Yes/No by its media) · 'attribute:<type>'
      normalizeMetadata: function (doc) {
        if (Array.isArray(doc)) return doc; var toks = doc && Array.isArray(doc.tokens) ? doc.tokens : null; if (!toks) return doc;
        var defs = m.traits || []; var self = this;
        var ids = toks.map(function (t) { return Number(t.id); }); var sup = Number(m.supply) || 0; for (var i = 1; i <= sup; i++) if (ids.indexOf(i) === -1) toks.push({ id: String(i) });   // a token with no record still gets a row
        return toks.map(function (t) { var id = Number(t.id); var attrs = [];
          defs.forEach(function (d) { var v = null; var src = d.from || ('attribute:' + d.name);
            if (src === 'name') v = t.name || d.missing || 'Unknown';
            else if (src === 'animated') v = isAnimated(t) ? 'Yes' : (t.image_file ? 'No' : (d.missing || 'Unknown'));
            else if (/^attribute:/.test(src)) { var ty = src.slice(10).toLowerCase(); var a = (t.attributes || []).filter(function (x) { return String(x.trait_type || '').toLowerCase() === ty; })[0]; v = a ? a.value : (d.missing || null); }
            if (v != null) attrs.push({ trait_type: d.name, value: String(v) }); });
          return { id: id, name: t.name || self.token_name(id), description: t.description || null, attributes: attrs, media: t.image_file ? { image_file: t.image_file, animation_file: t.animation_file || null, source: (t.sources && t.sources.image) || null } : null }; }).sort(function (a, b) { return a.id - b.id; });
      }
    };
  }
  async function getJson(u) { var r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); }

  var cache = null;
  // load({ tenant, tenants, manifests }) — tenants/manifests may be injected (gates); otherwise fetched. Never throws: on a
  // registry failure it returns the aDAO fallback with `degraded: 'tenants.json unreachable'` so the page can say so.
  async function load(opts) {
    opts = opts || {};
    if (cache && !opts.tenant && !opts.tenants && !opts.fresh && !opts.collection) return cache;
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
      var cc = collectionContext(slug, m); try { await attachMedia(cc); } catch (e) {} cols.push(cc);
    }
    var chosen = (opts.collection && cols.filter(function (x) { return x.slug === opts.collection; })[0]) || readCollection(cols) || cols[0] || null;   // 1.2.0
    var ctx = { version: VERSION, tenant: Object.assign({ slug: pick.slug }, t), selected_via: pick.via, tenants: tenants, collections: cols, primary: chosen, first: cols[0] || null, degraded: degraded,
      urls: { tenants: TENANTS_URL, core: CORE, nftc: NFTC } };
    if (!opts.tenants) cache = ctx;
    return ctx;
  }
  // 1.2.0: switch the collection within the tenant (the URL carries it; the page reloads so every per-collection global resets)
  function selectCollection(slug) { try { var u = new URL(G.location.href); u.searchParams.set('collection', slug); G.location.href = u.href; } catch (e) { G.location.reload(); } }
  function select(slug) { prefsSet({ tenant: slug }); try { var u = new URL(G.location.href); u.searchParams.delete('tenant'); G.location.href = u.pathname === '/' + slug ? '/' : u.href; } catch (e) { G.location.reload(); } }
  return { VERSION: VERSION, load: load, select: select, selectCollection: selectCollection, attachMedia: attachMedia, collectionContext: collectionContext, pickTenant: pickTenant, prefsGet: prefsGet, ADAO_FALLBACK: ADAO_FALLBACK, SITE_ASSETS: SITE_ASSETS, TENANTS_URL: TENANTS_URL, NFTC: NFTC, CORE: CORE };
});
