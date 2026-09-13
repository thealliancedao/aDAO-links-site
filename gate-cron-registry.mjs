#!/usr/bin/env node
// gate-cron-registry.mjs — lib/cron-registry.js on stubbed heartbeats (live module, no third copy).
// Added 2026-09-14 with the fresh-but-failed rule: a declared 'failed' outranks a fresh timestamp.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./lib/cron-registry.js', import.meta.url), 'utf8');
const NOW = Date.now(); const iso = (ageMin) => new Date(NOW - ageMin * 60000).toISOString();
const HB = {};   // sourceUrl (sans cache-bust) → heartbeat doc
globalThis.fetch = async (url) => { const k = url.replace(/\?t=\d+$/, ''); const d = HB[k]; return { ok: !!d, json: async () => d }; };
new Function(src)();                    // evaluates the IIFE against globalThis
const R = globalThis.CronRegistry;
let PASS = 0, FAIL = 0; const ok = (n, c, x) => { if (c) { PASS++; console.log('  ✓', n); } else { FAIL++; console.log('  ✗', n, x === undefined ? '' : JSON.stringify(x)); } };
const byKey = (rs, k) => rs.find(r => r.key === k);
const locks = R.CRONS.find(c => c.key === 'nft-ledger-tla-locks'); const adao = R.CRONS.find(c => c.key === 'nft-ledger-adao');
ok('registry has the three collection ledger crons', locks && adao && R.CRONS.some(c => c.key === 'nft-ledger-pixel-lions'));
const ph = R.CRONS.find(c => c.key === 'price-history');   // B.5 (2026-09-14)
ok('price-history writer heartbeat registered under org-token-catalog', ph && ph.job === 'org-token-catalog' && /price-history\/heartbeat\.json$/.test(ph.sourceUrl) && ph.tsPath[0] === 'capturedAt', ph);
const setPath = (o, path, v) => { const ks = path.split('.'); let cur = o; for (const k of ks.slice(0, -1)) cur = (cur[k] = cur[k] || {}); cur[ks[ks.length - 1]] = v; return o; };
const okDoc = (c, ageMin) => { const d = { status: 'ok' }; for (const tp of c.tsPath) setPath(d, tp, iso(ageMin)); return d; };
for (const c of R.CRONS) HB[c.sourceUrl] = okDoc(c, 5);
let rs = await R.fetchAll({ cacheBust: false });
ok('all-ok: every job fresh', rs.every(r => r.state === 'fresh'), rs.filter(r => r.state !== 'fresh').map(r => [r.key, r.state]));
HB[locks.sourceUrl] = { ran_at: iso(16), status: 'failed', cursor: 22821883 };   // the 2026-09-13 shape: 16 min old, failed
HB[adao.sourceUrl]  = { ran_at: iso(16), status: 'degraded', cursor: 1 };        // completed with issues — a finding, not a fault
rs = await R.fetchAll({ cacheBust: false });
const L = byKey(rs, 'nft-ledger-tla-locks'), A = byKey(rs, 'nft-ledger-adao');
ok('fresh + status failed → warning (Late), not green', L.state === 'warning' && L.declared === 'failed' && L.finding === null, L);
ok('fresh + status degraded → stays fresh, surfaced as a finding', A.state === 'fresh' && A.finding === 'degraded', A);
{ const s = R.summarize(rs); ok('summarize: failed job counted as warning, overall = watch, unknown = 0', s.counts.warning === 1 && s.counts.unknown === 0 && s.overall === 'watch', s.counts); }
HB[ph.sourceUrl] = { capturedAt: iso(20), status: 'failed', reason: 'GitHub PUT price-history/2026/09.json: 500' };
rs = await R.fetchAll({ cacheBust: false });
ok('price-history append failure → warning (Late), not green', byKey(rs, 'price-history').state === 'warning' && byKey(rs, 'price-history').declared === 'failed', byKey(rs, 'price-history'));
HB[locks.sourceUrl] = { ran_at: iso(60 * 30), status: 'failed' };
rs = await R.fetchAll({ cacheBust: false });
ok('stale + failed → stale (age verdict already worse than warning)', byKey(rs, 'nft-ledger-tla-locks').state === 'stale');
console.log(`\n=== GATE cron-registry: ${PASS} passed, ${FAIL} failed ===`); process.exit(FAIL ? 1 : 0);
