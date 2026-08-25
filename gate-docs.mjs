#!/usr/bin/env node
// gate-docs.mjs — tla-docs.html Rev 2.0: TLA guide sections + knowledge base rendered, sidebar, search, deep links.
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const html = fs.readFileSync(path.join(here, 'tla-docs.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://thealliancedao.com/tla-docs.html#lp-grades-and-voting', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  w.SiteHeader = { mount() {} }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined;
  // a minimal marked: paragraphs, headings, bold, lists — enough to assert structure without the CDN
  w.marked = { parse: (md) => md.split(/\n\n+/).map(b => /^#{1,3} /.test(b) ? `<h${b.match(/^#+/)[0].length}>${b.replace(/^#+ /, '')}</h${b.match(/^#+/)[0].length}>` : /^- /.test(b) ? `<ul>${b.split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('')}</ul>` : `<p>${b}</p>`).join(''), parseInline: (t) => t };
  w.fetch = async (u) => { const clean = String(u).split('?')[0]; const m = /tla-core\/main\/(.+)$/.exec(clean); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
    if (m) { const p = path.join(CORE, m[1]); if (!fs.existsSync(p)) return nope; const t = fs.readFileSync(p, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; } return nope; }; } });
await new Promise(r => setTimeout(r, 2500)); const w = dom.window, d = w.document;
const side = d.getElementById('side'), doc = d.getElementById('doc');
check('K1 sidebar lists the TLA guide sections + glossary and the knowledge-base groups', /What is TLA\?/.test(side.textContent) && /Glossary/.test(side.textContent) && /How to read this site/i.test(side.textContent) && /Protocols on the rails/i.test(side.textContent) && side.querySelectorAll('a').length >= 25, side.querySelectorAll('a').length);
check('K2 deep link #lp-grades-and-voting renders the guide (five lenses) with its source link', /five lenses/i.test(doc.textContent) && /Purpose/.test(doc.textContent) && /Source: .*lp-grades-and-voting\.md/.test(doc.textContent) && side.querySelector('a.active')?.getAttribute('href') === '#lp-grades-and-voting');
w.location.hash = '#guide-buckets'; await new Promise(r => setTimeout(r, 300));
check('K3 a TLA-guide section renders from the JSON model (The Four Buckets)', /Four Buckets/.test(doc.textContent) && doc.querySelectorAll('p').length >= 2, doc.textContent.replace(/\s+/g, ' ').slice(0, 120));
w.location.hash = '#guide-glossary'; await new Promise(r => setTimeout(r, 300));
check('K4 the glossary renders its terms', doc.querySelectorAll('p strong').length >= 15);
d.getElementById('doc-search').value = 'Votion'; d.getElementById('doc-search').dispatchEvent(new w.Event('input')); await new Promise(r => setTimeout(r, 300));
check('K5 search narrows the sidebar to docs mentioning the term and keeps the Votion doc', side.querySelectorAll('a').length < 25 && /Votion/.test(side.textContent));
console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
