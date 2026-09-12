// gate-index-nftc.mjs — index 4.18 repoint gate (aDAO products → nft-collections/adao/).
// Boots LIVE and PATCHED index.html in jsdom with fetch stubbed (records URLs, serves fixtures where present), then:
//   R1 patched fetches no tla-core/nfts/adao URL at all
//   R2 every URL patched fetches from nft-collections is under adao/ and maps 1:1 onto a URL live fetched from
//      tla-core/nfts/adao/ (same set after prefix normalisation) — the repoint changed nothing else
//   R3 all non-aDAO URLs identical between live and patched
// Usage: node gate-index-nftc.mjs <live index.html> <patched index.html> <tla-core dir> <nft-collections dir>
import fs from 'node:fs'; import path from 'node:path'; import { JSDOM } from 'jsdom';
const [,, LIVE, PATCHED, CORE_DIR, NFTC_DIR] = process.argv; let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x ? ' → ' + JSON.stringify(x).slice(0, 400) : '')); } };
const CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
async function boot(file) {
  const html = fs.readFileSync(file, 'utf8'); const urls = new Set();
  const dom = new JSDOM(html.replace(/<link[^>]+>/g, ''), { url: 'https://thealliancedao.com/index.html', runScripts: 'dangerously', pretendToBeVisual: true, resources: undefined });
  const w = dom.window; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0);
  w.fetch = (u) => { const url = String(u).split('?')[0]; urls.add(url); let f = null; if (url.startsWith(CORE)) f = path.join(CORE_DIR, url.slice(CORE.length)); else if (url.startsWith(NFTC)) f = path.join(NFTC_DIR, url.slice(NFTC.length));
    if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
  w.console.error = () => {}; w.console.warn = () => {}; w.console.log = () => {};
  await new Promise(r => setTimeout(r, 6000)); try { w.close(); } catch {} return [...urls].sort();
}
const a = await boot(LIVE), b = await boot(PATCHED);
const aNft = a.filter(u => u.startsWith(CORE + 'nfts/adao/')), bNft = b.filter(u => u.startsWith(NFTC)), bOld = b.filter(u => u.includes('tla-core/main/nfts/adao'));
console.log(`live fetched ${a.length} URLs (${aNft.length} aDAO) · patched ${b.length} (${bNft.length} from nft-collections)`);
ok(aNft.length >= 1, 'live page reached the aDAO products on boot (' + aNft.length + '; the rest sit behind modals/feeds and are covered statically below)', aNft);
ok(bOld.length === 0, 'R1 patched fetches nothing from tla-core/nfts/adao', bOld);
ok(bNft.every(u => u.startsWith(NFTC + 'adao/')), 'R2 every nft-collections URL is under adao/', bNft.filter(u => !u.startsWith(NFTC + 'adao/')));
const norm = (u) => u.replace(NFTC + 'adao/', 'X/').replace(CORE + 'nfts/adao/', 'X/');
ok(JSON.stringify(aNft.map(norm)) === JSON.stringify(bNft.map(norm)), 'R2 aDAO URL set identical after prefix normalisation', { live: aNft.map(norm), patched: bNft.map(norm) });
const aRest = a.filter(u => !aNft.includes(u)), bRest = b.filter(u => !bNft.includes(u));
ok(JSON.stringify(aRest) === JSON.stringify(bRest), 'R3 all non-aDAO URLs identical', { onlyLive: aRest.filter(u => !bRest.includes(u)), onlyPatched: bRest.filter(u => !aRest.includes(u)) });
const src = fs.readFileSync(PATCHED, 'utf8'); ok(src.includes("REV = '4.18'"), 'REV 4.18');
ok(!src.includes('nfts/adao'), 'static: no nfts/adao left anywhere in index.html');
ok((src.match(/nft-collections\/main\/adao\//g) || []).length === 12 && (src.match(/grab\(`adao\//g) || []).length === 4, 'static: 12 literal nft-collections/adao URLs + 4 grab(`adao/…`) activity reads', { lit: (src.match(/nft-collections\/main\/adao\//g) || []).length, grab: (src.match(/grab\(`adao\//g) || []).length });
console.log(`\n=== INDEX-NFTC GATE: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
