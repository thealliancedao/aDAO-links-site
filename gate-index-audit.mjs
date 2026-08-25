#!/usr/bin/env node
// gate-index-audit.mjs — index.html Rev 4.05 quick-audit decoder, exercised on Lion DAO #26
// (owner screenshot 2026-08-24): increase_allowance 3,500,000,000,000,000 on the ROAR cw20 +
// add_bribe {amount, info:{cw20}} for_info native LP, 10 LUNA attached. Extracts the LIVE
// functions from index.html (no third copy). Usage: node gate-index-audit.mjs
import fs from 'fs'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
// 2026-08-25: the engine is lib/prop-audit.js (shared by index + dao); the gate loads the LIVE lib.
const src = fs.readFileSync(path.join(here, 'lib/prop-audit.js'), 'utf8') + '\nconst { deepDecode, msgShape, shapeCompare, precedentOf, ledgerOf, ledgerHtml, decodedHtml } = window.PropAudit;';
let PASS = 0, FAIL = 0; const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ctx = { esc, atob: (s) => Buffer.from(s, 'base64').toString('binary'), window: {}, fetch: async () => ({ ok: false }) };
const fn = new Function(...Object.keys(ctx), src + '\nreturn { ledgerOf, ledgerHtml, decodedHtml, deepDecode };');
const M = fn(...Object.values(ctx));
const ROAR = 'terra1lxx40s29qvkrcj8fsa3yzyehy7w50umdvvnls2r830rys6lu2zns63eelv', MGR = 'terra1tuuwm8yrj54qeg0c8xu00aha9ryatyhtczq8qq2q8tntuw0auzas9037wh', LP = 'terra1hqq6pnx74q0wae7eqqu2wgddzr2xn8l9gvd33sfwqfew50qawj0sfn69fh';
const msgs = [
  { wasm: { execute: { contract_addr: ROAR, msg: { increase_allowance: { spender: MGR, amount: '3500000000000000' } }, funds: [] } } },
  { wasm: { execute: { contract_addr: MGR, msg: { add_bribe: { bribe: { amount: '3500000000000000', info: { cw20: ROAR } }, gauge: 'single', for_info: { native: LP }, distribution: { func: { func_type: 'linear', start: 200, end: 209 } } } }, funds: [{ denom: 'uluna', amount: '10000000' }] } } },
];
const R = { known: { [ROAR]: { label: 'ROAR Token', methods: ['chain'] }, [MGR]: { label: 'TLA incentive / bribe manager', methods: ['chain'] }, [LP]: { label: 'ROAR-ampROAR LP (Astroport)', methods: ['register'] } }, members: {}, denoms: { uluna: { symbol: 'LUNA', decimals: 6 }, [ROAR]: { symbol: 'ROAR', decimals: 6 } }, trustedLoaded: true };
const card = { dao: 'Lion DAO', id: 26, title: 'Redirect Voting Incentives to ROAR-ampROAR Astroport LP', rawMsgs: msgs, link: '' };
const lg = M.ledgerOf(card, R, []);
console.log('=== quick audit on Lion DAO #26 ===');
check('A1 both actions pass (every counterparty known)', lg.worst === 'pass' && lg.actions.length === 2, lg.actions.map(x => x.level));
check('A2 #1 increase_allowance amount is read in the token being called: 3,500,000,000 ROAR', lg.actions[0].amounts.some(x => /3,500,000,000 ROAR/.test(x)), lg.actions[0].amounts);
check('A3 #2 add_bribe cw-asset amount decoded: 3,500,000,000 ROAR; 10 LUNA attached', lg.actions[1].amounts.some(x => /3,500,000,000 ROAR/.test(x)) && lg.actions[1].amounts.some(x => /^10 LUNA attached/.test(x)), lg.actions[1].amounts);
check('A4 #2 names the pool the bribe is for + the distribution window', lg.actions[1].notes.some(n => /for pool: ROAR-ampROAR LP/.test(n)) && lg.actions[1].notes.some(n => /linear epochs 200→209/.test(n)), lg.actions[1].notes);
const dec = M.decodedHtml(card, R);
check('A5 decoded view names every address inline (ROAR Token, bribe manager, LP) in green', /⟵ ROAR Token/.test(dec) && /⟵ TLA incentive \/ bribe manager/.test(dec) && /⟵ ROAR-ampROAR LP/.test(dec) && !/UNKNOWN/.test(dec));
check('A6 decoded view converts both amounts and the attached funds', (dec.match(/⟵ 3,500,000,000 ROAR/g) || []).length === 2 && /⟵ 10 LUNA/.test(dec));
// unknown LP → amber + soft level
const R2 = { ...R, known: { [ROAR]: R.known[ROAR], [MGR]: R.known[MGR] } };
const lg2 = M.ledgerOf(card, R2, []);
check('A7 unknown for_info pool → soft level and an UNKNOWN LP note (the part to worry about)', lg2.worst === 'soft' && lg2.actions[1].notes.some(n => /UNKNOWN LP/.test(n)) && /UNKNOWN to every registry/.test(M.decodedHtml(card, R2)));
const lh = M.ledgerHtml(lg, card);
check('A8 ledger HTML embeds the decoded view (details block)', /<details/.test(lh) && /Decoded messages/.test(lh));
console.log(`\n=== GATE: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
