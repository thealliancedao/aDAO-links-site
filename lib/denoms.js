/* lib/denoms.js — 1.0.0 (2026-09-17) — THE page-side denom → symbol resolver (mirror of platform-crons/lib/denom-symbol.js).
 * Reads the token-catalog's `effective` layer once and answers for any spelling (uluna · native:uluna · cw20:terra1… ·
 * bare terra1… · ibc/… · factory/…). Pages prefer a record's own `denom_symbol` (stamped upstream since nft-flows 1.2.0 /
 * tla-flows 3.4.3) and fall back to this for records that predate it. Unknown → null, never a guess.
 * Collection- and venue-agnostic: a denom is a denom whoever emitted it.
 *   Denoms.load()             → Promise (cached; safe to call many times)
 *   Denoms.symbol(denom)      → 'bLUNA' | null       (sync; null until load() resolves, except uluna → LUNA)
 *   Denoms.decimals(denom)    → 6 | null
 *   Denoms.of(record)         → record.denom_symbol ?? Denoms.symbol(record.denom ?? record.price?.denom)
 *   Denoms.amount(rec)        → human amount from raw + decimals (null when unknown)
 */
(function (root) {
  'use strict';
  const CAT = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/token-catalog/snapshots/current.json';
  const by = new Map(); let loading = null, loaded = false;
  const bare = (d) => { let s = String(d || '').trim(); if (s.startsWith('cw20:')) s = s.slice(5); if (s.startsWith('native:')) s = s.slice(7); return s; };
  function ingest(cat) { for (const t of (cat && cat.tokens) || []) { if (!t || !t.denom) continue; const e = t.effective || {}, g = t.discovered || {}; const sym = e.symbol || g.symbol || null; if (!sym) continue; by.set(bare(t.denom), { symbol: sym, decimals: e.decimals != null ? e.decimals : (g.decimals != null ? g.decimals : 6) }); } loaded = true; }
  function load(fetchImpl) { if (loading) return loading; const f = fetchImpl || root.fetch; loading = f(CAT + '?t=' + Math.floor(Date.now() / 3.6e6)).then(r => r.ok ? r.json() : null).then(ingest).catch(() => { loaded = false; }); return loading; }
  function lookup(d) { const b = bare(d); if (!b) return null; const h = by.get(b); if (h) return h; if (b === 'uluna') return { symbol: 'LUNA', decimals: 6 }; return null; }
  const symbol = (d) => { const h = lookup(d); return h ? h.symbol : null; };
  const decimals = (d) => { const h = lookup(d); return h ? h.decimals : null; };
  const of = (rec) => { if (!rec) return null; if (rec.denom_symbol) return rec.denom_symbol; return symbol(rec.denom || (rec.price && rec.price.denom)); };
  const amount = (rec) => { if (!rec) return null; const raw = rec.price && rec.price.amount != null ? rec.price.amount : (rec.gross_amount ?? rec.bid_amount ?? rec.price_raw ?? rec.amount); if (raw == null) return null; const dec = rec.denom_decimals != null ? rec.denom_decimals : (decimals(rec.denom || (rec.price && rec.price.denom)) ?? 6); const n = Number(raw); return isFinite(n) ? n / Math.pow(10, dec) : null; };
  root.Denoms = { VERSION: '1.0.0', load, symbol, decimals, of, amount, bare, isLoaded: () => loaded, _ingest: ingest };
})(typeof window !== 'undefined' ? window : globalThis);
