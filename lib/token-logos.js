/* =============================================================================
 * lib/token-logos.js 1.0.0 (2026-09-28) — ONE map from a token / protocol symbol to the logo the site already hosts.
 * (owner 2026-09-28: "for the tokens we have all these logos — show them where we can, same for LPs: a logo for each side")
 * The files live in /assets/token-logos and /assets/images (the same ones index.html uses). A symbol with no file gets a
 * lettered disc in a colour derived from the symbol — never a wrong logo. Pair names ("LUNA-USDC.n") draw both sides.
 *   TokenLogos.url(sym) → path | null · TokenLogos.img(sym, px) → html · TokenLogos.pair(name, px) → html (two overlapped)
 * ============================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TokenLogos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '1.0.0';
  var T = '/assets/token-logos/', I = '/assets/images/';
  var EXACT = {
    LUNA: I + 'Luna.webp', uluna: I + 'Luna.webp', zLUNA: I + 'Luna.webp', zluna: I + 'Luna.webp',
    ampLUNA: I + 'ampLuna.webp', bLUNA: T + 'bLUNA.webp', arbLUNA: T + 'arbLuna.svg', stLUNA: I + 'Luna.webp',
    ASTRO: T + 'Astro.webp', xASTRO: T + 'Astro.webp',
    ATOM: T + 'atom.svg', dATOM: T + 'datom.svg', stATOM: T + 'statom.svg',
    CAPA: T + 'capa.svg', ampCAPA: T + 'capa.svg', SOLID: T + 'solid.svg',
    ROAR: T + 'ROAR_LOGO.png', ampROAR: T + 'ROAR_LOGO.png', ROAR20: T + 'ROAR20_LOGO.png', pyROAR: T + 'pyROAR_LOGO.png',
    USDT: T + 'usdt.svg', USDt: T + 'usdt.svg', wstETH: T + 'steth.svg', SWTH: T + 'swth.svg', rSWTH: T + 'swth.svg',
    ETH: I + 'ETH.png', BNB: I + 'bnb.png', SOL: I + 'SOL logo.png',
    // protocols and venues
    Votion: I + 'votion-logo-optimized.png', Eris: I + 'logo_eris_48.svg', Credia: I + 'creda.svg', Solid: T + 'solid.svg',
    DAODAO: I + 'DAODAO.png', Astroport: I + 'Astroport dex.png', SkeletonSwap: I + 'Skelton Swap.webp', Boost: I + 'Boost Logo.png',
    Atrium: I + 'atrium-favicon.svg', BBL: I + 'BBL Logo.png', aDAO: I + 'aDAO Logo No Background.png', 'Pixel Lions': I + 'pixelions-pfp.webp'
  };
  // families: wrapped / bridged variants share their asset's logo (USDC.n, USDC.inj, wBTC.osmo, WBTC.axl, wBTC.creda.a, WETH.axl, wSOL.wh …)
  var FAMILY = [[/^usdc/i, T + 'usdc.svg'], [/^w?btc\.axl$/i, T + 'axlwbtc.webp'], [/^w?btc/i, T + 'wBTC.png'], [/^w?eth\.axl$/i, T + 'axlweth.svg'], [/^w?eth/i, I + 'ETH.png'],
    [/^wsol/i, I + 'SOL logo.png'], [/^wbnb/i, I + 'bnb.png'], [/^usdt/i, T + 'usdt.svg']];
  function url(sym) { if (!sym) return null; var s = String(sym).trim(); if (EXACT[s]) return EXACT[s]; for (var i = 0; i < FAMILY.length; i++) if (FAMILY[i][0].test(s)) return FAMILY[i][1]; return null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hue(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function img(sym, px, extra) {
    px = px || 18; var u = url(sym); var st = 'width:' + px + 'px;height:' + px + 'px;border-radius:50%;flex-shrink:0;display:inline-block;vertical-align:middle;' + (extra ? extra + ';' : '');
    if (u) return '<img src="' + esc(encodeURI(u)) + '" alt="" title="' + esc(sym) + '" style="' + st + 'object-fit:cover;background:#111827;border:1px solid rgba(255,255,255,.12)" onerror="this.style.opacity=0">';
    var L = String(sym || '?').replace(/^(amp|b|arb|st|x|d|w|z|py|r)(?=[A-Z])/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
    return '<span title="' + esc(sym) + '" style="' + st + 'background:hsl(' + hue(sym) + ',45%,32%);color:#e5e7eb;font:700 ' + Math.max(8, Math.round(px * 0.42)) + 'px/' + px + 'px Space Grotesk,system-ui,sans-serif;text-align:center">' + esc(L) + '</span>';
  }
  // "LUNA-USDC.n" → both sides overlapped; a single-asset gauge name ("ampCAPA") → one logo
  function sides(name) { var n = String(name || ''); var m = n.split('-'); if (m.length === 2 && m[0] && m[1]) return m; if (m.length > 2) { /* "wBTC.osmo-wBTC.axl" splits cleanly; keep the first dash for odd names */ return [m[0], m.slice(1).join('-')]; } return [n]; }
  function pair(name, px) {
    px = px || 18; var s = sides(name);
    if (s.length === 1) return img(s[0], px);
    return '<span style="display:inline-flex;align-items:center;flex-shrink:0">' + img(s[0], px, 'position:relative;z-index:1') + img(s[1], px, 'margin-left:-' + Math.round(px * 0.35) + 'px;box-shadow:0 0 0 2px #0d1117') + '</span>';
  }
  return { VERSION: VERSION, url: url, img: img, pair: pair, sides: sides };
});
