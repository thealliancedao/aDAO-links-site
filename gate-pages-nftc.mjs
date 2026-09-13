// gate-pages-nftc.mjs — differential repoint gate for any page: boots LIVE and PATCHED copies in jsdom with fetch
// stubbed (records URLs) and asserts the patched page fetches nothing from tla-core/nfts/adao, that its aDAO URL set
// equals the live one after prefix normalisation, that every other URL is identical, and that no 'nfts/adao' string
// is left in the file. Usage: node gate-pages-nftc.mjs <live-site-dir> <patched-site-dir> <tla-core dir> <nft-collections dir> page.html [page2.html …]
import fs from 'node:fs'; import path from 'node:path'; import { JSDOM } from 'jsdom';
const [,, LIVE_DIR, PATCHED_DIR, CORE_DIR, NFTC_DIR, ...PAGES] = process.argv; let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (x ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const CORE = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/', NFTC = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
async function boot(file) {
  const html = fs.readFileSync(file, 'utf8'); const urls = new Set();
  const dom = new JSDOM(html.replace(/<link[^>]+>/g, '').replace(/<script src="[^"]*"><\/script>/g, ''), { url: 'https://thealliancedao.com/' + path.basename(file), runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window; w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} }); w.scrollTo = () => {}; w.requestAnimationFrame = (f) => setTimeout(f, 0); w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }; w.ResizeObserver = w.IntersectionObserver;
  w.fetch = (u) => { const url = String(u).split('?')[0]; urls.add(url); let f = null; if (url.startsWith(CORE)) f = path.join(CORE_DIR, url.slice(CORE.length)); else if (url.startsWith(NFTC)) f = path.join(NFTC_DIR, url.slice(NFTC.length));
    if (f && fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')), text: () => Promise.resolve('') }); };
  w.console.error = () => {}; w.console.warn = () => {}; w.console.log = () => {};
  await new Promise(r => setTimeout(r, 5000)); try { w.close(); } catch {} return [...urls].sort();
}
const norm = (u) => u.replace(NFTC + 'adao/', 'X/').replace(CORE + 'nfts/adao/', 'X/');
for (const page of PAGES) {
  console.log('— ' + page + ' —'); const a = await boot(path.join(LIVE_DIR, page)), b = await boot(path.join(PATCHED_DIR, page));
  const aNft = a.filter(u => u.startsWith(CORE + 'nfts/adao/')), bNft = b.filter(u => u.startsWith(NFTC)), bOld = b.filter(u => u.includes('tla-core/main/nfts/adao'));
  console.log(`    live ${a.length} URLs (${aNft.length} aDAO) · patched ${b.length} (${bNft.length} nft-collections)`);
  ok(bOld.length === 0, 'no fetch to tla-core/nfts/adao', bOld);
  ok(bNft.every(u => u.startsWith(NFTC + 'adao/')), 'nft-collections URLs all under adao/', bNft);
  ok(JSON.stringify(aNft.map(norm)) === JSON.stringify(bNft.map(norm)), 'aDAO URL set identical after prefix normalisation (' + aNft.length + ')', { live: aNft.map(norm), patched: bNft.map(norm) });
  ok(JSON.stringify(a.filter(u => !aNft.includes(u))) === JSON.stringify(b.filter(u => !bNft.includes(u))), 'all non-aDAO URLs identical');
  ok(!fs.readFileSync(path.join(PATCHED_DIR, page), 'utf8').includes('nfts/adao'), "static: no 'nfts/adao' left in the file");
}
console.log(`\n=== PAGES-NFTC GATE: ${pass} passed, ${fail} failed ===`); process.exit(fail ? 1 : 0);
