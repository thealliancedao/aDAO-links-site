#!/usr/bin/env node
// gate-verify.mjs — verify.html: every address on the page must exist in a chain
// product (register / provenance / snapshots) — never typed from memory; the live
// register renders grouped; rev. Usage: TLA_CORE_DIR=/path/to/tla-core node gate-verify.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const J = (rel) => JSON.parse(fs.readFileSync(path.join(CORE, rel), 'utf8'));
const reg = J('docs/curated/known_contracts.json'), prov = J('nfts/adao/provenance/summary.json'), summ = J('nfts/adao/snapshots/summary.json');
const known = new Set([...Object.keys(reg.contracts), ...Object.keys(prov.mint_story.candy_machines), prov.mint_story.mint_era_dao_treasury_address, ...Object.keys(summ.per_owner_counts)]);
const html = fs.readFileSync(path.join(here, 'verify.html'), 'utf8');
const addrs = [...html.matchAll(/addr: '((?:terra1|factory\/terra1)[^']+)'/g)].map(m => m[1]).map(a => a.startsWith('factory/') ? a.split('/')[1] : a);
const bad = addrs.filter(a => !known.has(a));
check(`V1 all ${addrs.length} canonical addresses exist in a chain product (none typed)`, bad.length === 0, bad);
const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, ''), { url: 'https://thealliancedao.com/verify.html', runScripts: 'dangerously', beforeParse(w) {
  w.SiteHeader = { mount() {} }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined;
  w.fetch = async (u) => String(u).includes('known_contracts.json') ? { ok: true, json: async () => reg } : { ok: false, status: 404 }; } });
await new Promise(r => setTimeout(r, 300)); const d = dom.window.document;
check('V2 core section renders 15 rows incl. the three candy machines with their reconciled counts', d.querySelectorAll('#core-rows .row').length === 15 && /352 loaded · 127 sold/.test(d.getElementById('core-rows').textContent) && /1,300 loaded · 1,300 sold/.test(d.getElementById('core-rows').textContent));
check('V3 live register grouped by protocol with the full count', /60 contracts/.test(d.getElementById('reg-count').textContent) && d.querySelectorAll('#register .row').length === 60 && /Eris · 18/.test(d.getElementById('register').textContent));
check('V4 chain links go to chainsco.pe; the Ally denom row has copy but no chain link', [...d.querySelectorAll('#core-rows a.btn')].every(a => /chainsco\.pe/.test(a.href)) && d.querySelectorAll('#core-rows .row')[2].querySelector('a.btn') === null);
check('V5 code/gov/data sections carry the NFT repo, gov #4801, provenance', /alliance-nft-collection/.test(d.getElementById('code-rows').textContent) && /#4801/.test(d.getElementById('gov-rows').textContent) && /provenance/.test(d.getElementById('data-rows').textContent));
check('V6 unverified register entry is tagged', /unverified/.test(d.getElementById('register').textContent));
console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
