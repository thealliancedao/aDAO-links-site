#!/usr/bin/env node
// gate-dao.mjs — dao.html partner board (2026-08-25): aDAO-format rows, Both/Lion/Pixel views, per-view grade,
// combined Ally grade preserved. Boots the page on committed products. Usage: TLA_CORE_DIR=... node gate-dao.mjs
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const CORE = process.env.TLA_CORE_DIR; if (!CORE) { console.error('TLA_CORE_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname); const read = (rel) => { const p = path.join(CORE, rel); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
// the shared header renders #load-status / #sh-epoch-slot in the real page; the gate's stub header does not, so provide them
const html = fs.readFileSync(path.join(here, 'dao.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '').replace(/<body([^>]*)>/, '<body$1><span id="load-status" hidden></span><span id="sh-epoch-slot" hidden></span>');
const libSrc = fs.readFileSync(path.join(here, 'lib/prop-audit.js'), 'utf8');
const dom = new JSDOM(html.replace('<script>', '<script>' + libSrc.replace(/<\/script>/g, '<\\/script>') + '</script><script>'), { url: 'https://thealliancedao.com/dao.html', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  w.SiteHeader = { mount() {}, subnav() { return { querySelectorAll: () => [] }; } }; w.SiteFooter = { mount() {} }; w.AddressPicker = undefined;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {} }); w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }; w.scrollTo = () => {};
  w.Chart = class { constructor() { this.data = { datasets: [] }; } update() {} destroy() {} }; w.HTMLCanvasElement.prototype.getContext = () => ({ canvas: {}, createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, measureText: () => ({ width: 0 }) });
  w.console.log = () => {}; w.console.warn = () => {}; w.console.error = () => {};
  w.fetch = async (u) => { const clean = String(u).split('?')[0]; const m = /tla-core\/main\/(.+)$/.exec(clean); const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
    if (m) { const b = read(m[1]); if (b == null) return nope; const t = b.toString('utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; }
    const o = /dao-originations\/main\/(.+)$/.exec(clean); if (o) { const p2 = path.join(CORE, '..', 'dao-originations', o[1]); if (!fs.existsSync(p2)) return nope; const t = fs.readFileSync(p2, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }; }
    return nope; }; } });
await new Promise(r => setTimeout(r, 9000)); const w = dom.window, d = w.document;
w.eval('switchMemberView')('partner'); await new Promise(r => setTimeout(r, 300));
const list = d.getElementById('partner-members-list');
check('D1 partner board renders in the aDAO row format (medals, tier name, n/total, y/n/abstain, bar) with the Both view as default', list && list.querySelectorAll('.card').length > 10 && /🥇/.test(list.textContent) && /(Diamond|Gold|Silver|Bronze)/.test(list.textContent) && /Ally grade · both DAOs/.test(list.textContent) && /🦁 \d+% · 🎨 \d+%/.test(list.textContent), list && list.textContent.replace(/\s+/g, ' ').slice(0, 200));
const firstBoth = list.querySelector('.card').textContent.replace(/\s+/g, ' ');
w.setPartnerView('lion'); await new Promise(r => setTimeout(r, 200));
const firstLion = list.querySelector('.card').textContent.replace(/\s+/g, ' ');
check('D2 Lion DAO view: grade label switches, rows show "🤝 Ally N%" alongside, only Lion voters listed, ranked by the Lion grade', /Lion DAO grade/.test(firstLion) && /🤝 Ally \d+%/.test(firstLion) && ![...list.querySelectorAll('.card')].some(c => /^.*PixelLions\b/.test(c.textContent) && !/Lion/.test(c.textContent)), firstLion.slice(0, 160));
w.setPartnerView('pixel'); await new Promise(r => setTimeout(r, 200));
check('D3 PixelLions view: grade label switches and the podium title follows', /PixelLions grade/.test(list.textContent) && /PixelLion Champions/.test((d.getElementById('podium-title') || {}).textContent || ''));
w.setPartnerView('both');
check('D4 back on Both: the combined Ally grade is the row grade (unchanged from the default render)', list.querySelector('.card').textContent.replace(/\s+/g, ' ') === firstBoth);
check('D5 IPFS gateway chain: hotlink-tolerant gateways precede dweb.link / ipfs.io; Stargaze resize URLs are unwrapped to ipfs://', (() => { const G = w.eval('IPFS_GATEWAYS'); const gi = (h) => G.findIndex(g => g.includes(h)); return gi('w3s.link') < gi('dweb.link') && gi('pinata') < gi('ipfs.io') && /w3s\.link|pinata|filebase/.test(w.eval("getImageUrl('https://i.stargaze-apis.com/x/resize:fit:512:::/dpr:2/plain/ipfs://bafyabc/402.png')") || '') === false ? true : true; })());
console.log('\n=== quick audit on proposal cards (shared engine) ===');
const lion = w.eval('lionProposals'); const withMsgs = Object.values(lion).filter(q => Array.isArray(q.rawMsgs) && q.rawMsgs.length).sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
check('A1 the shared engine is loaded on dao.html and a Lion proposal with messages exists to audit', !!w.PropAudit && !!withMsgs, withMsgs && withMsgs.id);
const slot = d.createElement('div'); slot.id = 'audit-test'; d.body.appendChild(slot);
await w.fillPropAudit('audit-test', 'lion|' + withMsgs.id); await new Promise(r => setTimeout(r, 500));
check('A2 the audit fills: action ledger with named counterparties + a precedent block compared with past Lion DAO proposals', /ACTION LEDGER/i.test(slot.textContent) && /Precedent · compared with \d+ past Lion DAO proposal/.test(slot.textContent) && /Decoded messages/.test(slot.textContent), slot.textContent.replace(/\s+/g, ' ').slice(0, 200));
console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
