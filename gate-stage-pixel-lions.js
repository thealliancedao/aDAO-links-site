// stage-pl.js — build Pixel Lions' market-history seed + explorer analytics feed with the REAL cron code (no chain, no GitHub),
// into a copy of nft-collections, so the explorer gate can render PL's analytics tab before tonight's warm run writes them.
const fs = require('fs'), path = require('path'), https = require('https'), { EventEmitter } = require('events');
const NC = process.argv[2], CORE = process.argv[3], CRONS = process.argv[4], OUT = process.argv[5];
const MH = require(path.join(CRONS, 'nfts/nft-inventory/market-history.js')); const DS = require(path.join(CRONS, 'lib/denom-symbol.js'));
MH._setResolver(DS.buildResolver(JSON.parse(fs.readFileSync(path.join(CORE, 'token-catalog/snapshots/current.json')))));
const rj = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const venues = rj(path.join(NC, 'venues.json')); const ix = rj(path.join(NC, 'pixel-lions/ledger/index.json'));
const enr = { schemaVersion: 1, collection: 'pixel-lions', builtAt: new Date().toISOString(), spot_luna_usd: null, count: 0, sales: [] };
const lh = { schemaVersion: 1, builtAt: new Date().toISOString(), nft_contract: rj(path.join(NC, 'pixel-lions/collection.json')).nft_contract, counts: {}, count: 0, records: [] };
for (const mk of ix.months) { const rows = rj(path.join(NC, 'pixel-lions/ledger', mk + '.json')); let mon = null; try { mon = rj(path.join(CORE, 'price-history', mk + '.json')); } catch { }
  const luna = { daily: {} }; for (const [d, row] of Object.entries((mon && mon.days) || {})) if (row.LUNA && row.LUNA.usd != null) luna.daily[d] = row.LUNA.usd;
  const ev = MH.ledgerToEvents(rows, venues); MH.appendEnrichedSales(enr, ev.filter(e => e.action === 'sale'), luna, { daily: {} }, { [mk.replace('/', '-')]: mon }, {}); MH.maintainListingHistory(lh, ev); }
fs.mkdirSync(path.join(OUT, 'pixel-lions/snapshots'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'pixel-lions/snapshots/sales-enriched.json'), JSON.stringify(enr)); fs.writeFileSync(path.join(OUT, 'pixel-lions/snapshots/listing-history.json'), JSON.stringify(lh));
console.log(`staged: ${enr.sales.length} sales, ${lh.records.length} listing records`);
// the explorer feed: analytics.js main() against the staged repo, https served from disk, publish to LOCAL_OUT
const serve = (root) => (url, opts, cb) => { if (typeof opts === 'function') cb = opts; const u = String(url).split('?')[0]; const m = u.match(/^https:\/\/raw\.githubusercontent\.com\/thealliancedao\/([^/]+)\/main\/(.*)$/); const res = new EventEmitter(); res.setEncoding = () => {}; res.resume = () => {}; const req = new EventEmitter(); req.setTimeout = () => req; req.destroy = () => {}; req.end = () => {};
  let f = null; if (m) f = path.join(m[1] === 'nft-collections' ? root : (m[1] === 'tla-core' ? CORE : '/nonexistent'), m[2]);
  process.nextTick(() => { if (f && fs.existsSync(f)) { res.statusCode = 200; cb(res); res.emit('data', fs.readFileSync(f, 'utf8')); res.emit('end'); } else { res.statusCode = 404; cb(res); res.emit('end'); } }); return req; };
https.get = serve(OUT);
for (const e of fs.readdirSync(path.join(NC, 'pixel-lions'))) if (!fs.existsSync(path.join(OUT, 'pixel-lions', e))) fs.symlinkSync(path.join(NC, 'pixel-lions', e), path.join(OUT, 'pixel-lions', e));
for (const e of fs.readdirSync(path.join(NC, 'pixel-lions/snapshots'))) if (!fs.existsSync(path.join(OUT, 'pixel-lions/snapshots', e))) fs.symlinkSync(path.join(NC, 'pixel-lions/snapshots', e), path.join(OUT, 'pixel-lions/snapshots', e));
process.env.NFT_ROOT = 'pixel-lions'; process.env.COLLECTION = 'pixel-lions'; process.env.GITHUB_REPO = 'thealliancedao/nft-collections'; process.env.LOCAL_OUT = OUT; delete process.env.GITHUB_TOKEN;
process.env.RARITY_URL = 'https://raw.githubusercontent.com/thealliancedao/nft-collections/main/pixel-lions/rarity/rarity.json';
require(path.join(CRONS, 'nfts/nft-inventory/analytics.js')).main().then(() => { const a = rj(path.join(OUT, 'pixel-lions/snapshots/nft-analytics.json')); console.log(`nft-analytics.json: ${a.volume.sales_count} sales, volume $${Math.round(a.volume.usd_at_sale)}`); }).catch(e => { console.error('analytics failed', e); process.exit(1); });
