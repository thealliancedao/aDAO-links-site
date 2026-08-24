#!/usr/bin/env node
// gate-release-history.mjs — release-history.html Rev 1.5: floor from the org
// NFT market product (nfts/adao/snapshots/floor-history.json); the retired
// personal-repo read and its hardcoded $43 "Estimate" are gone. Unavailable → dash.
// Usage: TLA_CORE_DIR=/path/to/tla-core node gate-release-history.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const floorDoc = JSON.parse(fs.readFileSync(path.join(CORE, 'nfts/adao/snapshots/floor-history.json'), 'utf8'));
const last = floorDoc.rows[floorDoc.rows.length - 1];
async function boot({ floorDown = false } = {}) {
  const html = fs.readFileSync(path.join(here, 'release-history.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const fetched = [];
  const dom = new JSDOM(html, { url: 'https://thealliancedao.com/release-history.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.SiteHeader = { mount() {}, subnav() {} }; w.SiteFooter = { mount() {} };
    w.fetch = async (u) => { u = String(u); fetched.push(u.split('?')[0]); const ok = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) }); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); } };
      if (u.includes('floor-history.json')) return floorDown ? nope : ok(floorDoc);
      if (u.includes('api.github.com/repos/defipatriot')) throw new Error('DEAD READ ' + u);
      return nope; };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {} });
  } });
  await new Promise(r => setTimeout(r, 600));
  return { w: dom.window, fetched };
}
console.log('=== release-history 1.5 — floor from the org product ===');
{
  const { w, fetched } = await boot(); const d = w.document;
  check('R1 floor tile = base-tier listing floor from floor-history (' + last.per_tier.base.listing_floor_usd + ')', d.getElementById('snapshot-floor').textContent.includes('$' + last.per_tier.base.listing_floor_usd.toFixed(2)), d.getElementById('snapshot-floor').textContent);
  check('R2 source line names listing floor · listed count · capture date · org capture', /Listing floor · base tier/.test(d.getElementById('snapshot-floor-source').textContent) && d.getElementById('snapshot-floor-source').textContent.includes(last.date) && /org capture/.test(d.getElementById('snapshot-floor-source').textContent), d.getElementById('snapshot-floor-source').textContent);
  check('R3 no fetch to the retired repo (would have thrown)', !fetched.some(u => /defipatriot/.test(u)));
  check('R4 the literal 43 estimate is gone from the page source', !/usd: 43|return 43/.test(fs.readFileSync(path.join(here, 'release-history.html'), 'utf8')));
}
console.log('\n=== Rev 1.6: phase numbers equal the provenance mint story (chain-exact) ===');
{
  const prov = JSON.parse(fs.readFileSync(path.join(CORE, 'nfts/adao/provenance/summary.json'), 'utf8')).mint_story;
  const by = Object.fromEntries(prov.phases.map(p => [p.phase_id, p]));
  const html = fs.readFileSync(path.join(here, 'release-history.html'), 'utf8');
  const { w } = await boot(); const d = w.document; const t = d.body.textContent;
  check('M1 GoA free claims on the page = chain 1,191', by['goa-free'].chain_count === 1191 && /1,191/.test(t));
  check('M2 Phase 1b sold = chain 127 (of 352 loaded, 225 returned)', by['sale-50'].chain_count === 127 && /\b127\b.*of 352 loaded/.test(t));
  check('M3 Phase 2a sold = chain 525 (of 1,000 loaded, 473 returned)', by['sale-75'].chain_count === 525 && /\b525\b.*of 1,000 loaded/.test(t));
  check('M4 Phase 2b rounds 197 / 459 / 644 = chain', by['sale-100'].chain_count === 197 && by['sale-115'].chain_count === 459 && by['sale-130'].chain_count === 644 && /197 sold/.test(t) && /459 sold/.test(t) && /644 sold/.test(t));
  const raised = by['sale-100'].proceeds_luna + by['sale-115'].proceeds_luna + by['sale-130'].proceeds_luna;
  check('M5 Phase 2b LUNA raised = chain 156,205 and the JS average is 156,205/1,300', raised === 156205 && /156,205 LUNA/.test(t) && /const mintPrice2b = 120\.16/.test(html));
  check('M6 no "Est." badges remain in the markup (CSS rule only)', (html.match(/estimate-badge/g) || []).length === 1);
  check('M7 hero mint-cost range is the paid min/max at mint-day LUNA ($33 - $90)', /\$33 - \$90/.test(t));
}

console.log('\n=== product unavailable → dash, never a number ===');
{
  const { w } = await boot({ floorDown: true }); const d = w.document;
  check('D1 floor tile shows a dash and the source says unavailable', d.getElementById('snapshot-floor').textContent.trim() === '—' && /unavailable/.test(d.getElementById('snapshot-floor-source').textContent), [d.getElementById('snapshot-floor').textContent, d.getElementById('snapshot-floor-source').textContent]);
}
console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
