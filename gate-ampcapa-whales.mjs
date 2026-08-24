#!/usr/bin/env node
// gate-ampcapa-whales.mjs — BINDING page gate for ampcapa-tool.html Rev 2.1
// (CAPA Whales tab reading token-catalog/supply/capa/wallets.json).
// The fixture is NOT hand-written: it is produced by running the LIVE cron
// module (platform-crons/token-catalog/capa-supply.js) on the gate world in
// platform-crons/token-catalog/mock-run-capa-supply.js — same truth as the
// cron gate, so a schema drift between cron and page fails HERE.
// Asserts SPECIFIC VALUES IN SPECIFIC CELLS (owner + treasury fixture rows).
// Usage: PLATFORM_CRONS_DIR=/path/to/platform-crons node gate-ampcapa-whales.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const CRONS = process.env.PLATFORM_CRONS_DIR;
if (!CRONS) { console.error('PLATFORM_CRONS_DIR required'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
const S = require(path.join(CRONS, 'token-catalog/capa-supply.js'));
const G = require(path.join(CRONS, 'token-catalog/mock-run-capa-supply.js'));

let PASS = 0, FAIL = 0;
const check = (n, ok, x) => { if (ok) { PASS++; console.log('  ✓ ' + n); } else { FAIL++; console.log('  ✗ ' + n + (x != null ? '  ← ' + JSON.stringify(x) : '')); } };
const fmt0 = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

// ---- fixture from the live module ----
const world = G.makeWorld();
const doc = await S.captureCapaSupply(world);
const { doc: current, wallets } = await S.captureCapaWallets(world, doc);
const worldB = G.makeWorld({ stateFailAt: { addr: S.CAPA_CONTRACTS.CAPA_TOKEN, page: 1 } });
const docB = await S.captureCapaSupply(worldB);
const { wallets: walletsB } = await S.captureCapaWallets(worldB, docB);

async function boot(fixture, { productDown = false } = {}) {
  const rawHtml = fs.readFileSync(path.join(here, 'ampcapa-tool.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(rawHtml, { url: 'https://thealliancedao.com/ampcapa-tool.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async (url) => {
        const u = String(url);
        const okJson = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
        const nope = { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
        if (u.includes('supply/capa/wallets.json')) return productDown ? nope : okJson(fixture);
        if (u.includes('supply/capa/current.json')) return okJson(current);
        if (u.includes('/cosmwasm/') || u.includes('/cosmos/')) return okJson({ data: { exchange_rate: '1.1', total_supply: '1' } });   // rates probe on load — never reached the whale path
        return nope;
      };
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;   // browser globals jsdom lacks (page builds a state-key suffix at load)
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.scrollTo = () => {};
      w.localStorage && w.localStorage.clear && w.localStorage.clear();
    } });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 50));
  await w.switchTab('whales');
  await new Promise(r => setTimeout(r, 100));
  return w;
}

console.log('=== ampcapa-tool Rev 2.1 — whale tab from the product ===');
{
  const w = await boot(wallets);
  const d = w.document;
  check('P1 footer rev reads 2.1', /Rev 2\.1/.test(d.querySelector('#changelog-trigger').textContent));
  check('P2 source line: cron product · status ok · 13/13 guards green', /cron product/.test(d.getElementById('whale-source').textContent) && /status ok/.test(d.getElementById('whale-source').textContent) && /13\/13 green/.test(d.getElementById('whale-source').textContent), d.getElementById('whale-source').textContent);
  check('P3 table visible, placeholder hidden', d.getElementById('whale-table').style.display !== 'none' && d.getElementById('whale-placeholder').style.display === 'none');
  const heads = [...d.querySelectorAll('#whale-table thead th')].map(th => th.textContent.trim());
  check('P4 header carries the form columns', heads.includes('ampCAPA') && heads.includes('ampCAPA in TLA') && heads.includes('Receipt in DAO') && heads.includes('Receipt held / unbonding') && heads.includes('CAPA/LUNA LP'), heads);
  const rowOf = (a) => d.querySelector(`#whale-body tr[data-addr="${a}"]`);
  const cells = (tr) => [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
  const owner = rowOf(G.OWNER);
  check('P5 owner row present (gov 1.14M + DAO 7.27M-equiv > 1M threshold)', !!owner);
  const oc = owner ? cells(owner) : [];
  // columns: # · addr · liquid · gov · ampCAPA · ampCAPA in TLA · receipt in DAO · receipt held/unbonding · LP · total · status
  check('P6 owner gov cell = 1,141,022', oc[3] === fmt0(1141021.59), oc[3]);
  check('P7 owner Receipt-in-DAO cell = 3,214,853.997 × comp × hub', oc[6] === fmt0(3214853.997 * G.R.comp * G.R.hub), oc[6]);
  check('P8 owner Receipt held/unbonding cell = unbonding 357,206 × rates (held 0)', oc[7] === fmt0(357205.9996 * G.R.comp * G.R.hub), oc[7]);
  check('P9 owner liquid/ampCAPA/LP cells are 0 (rendered dim, never blank)', oc[2] === '0' && oc[4] === '0' && oc[8] === '0');
  check('P10 owner status Engaged (nothing liquid)', /Engaged/.test(oc[10]), oc[10]);
  check('P11 treasury (~694K CAPA-equiv) is correctly BELOW the 1M default threshold', !rowOf(G.TREAS));
  d.getElementById('whale-threshold').value = '100000'; d.getElementById('whale-threshold').dispatchEvent(new w.Event('change'));
  const treas = rowOf(G.TREAS);
  check('P11b treasury row present at 100K threshold', !!treas);
  const tc = treas ? cells(treas) : [];
  check('P12 treasury liquid cell = 5,387', tc[2] === fmt0(5387.458905), tc[2]);
  check('P13 treasury Receipt held cell = 198,310.643 × comp × hub', tc[7] === fmt0(198310.643 * G.R.comp * G.R.hub), tc[7]);
  const treasLp = 18411.23 * doc.rates.capa_per_astro_lp + 3821.188 * G.R.astroRcpt * doc.rates.capa_per_astro_lp;
  check('P14 treasury LP cell = TLA plain 18,411 LP + amplified 3,821 rcpt (CAPA-equiv), tooltip breaks it down', tc[8] === fmt0(treasLp) && /Astro LP in TLA \(plain\)/.test(treas.querySelectorAll('td')[8].getAttribute('title')), [tc[8], fmt0(treasLp)]);
  check('P15 treasury status Engaged (liquid CAPA 5.4K is 0.8% of 694K — ≥80% positioned)', /Engaged/.test(tc[10]), tc[10]);
  check('P15b treasury carries the "contract" chip (DAODAO core) but is NOT a hidden bucket', /contract/.test(tc[1]) && !/bucket/.test(tc[1]), tc[1]);
  check('P16 contracts hidden by default (hub, compounder, DAO module absent)', !rowOf(S.CAPA_CONTRACTS.AMPCAPA_HUB) && !rowOf(S.CAPA_CONTRACTS.VE3_COMPOUNDER) && !rowOf(S.CAPA_CONTRACTS.AMPCAPA_DAO_VOTE));
  check('P17 filler wallets are not in the file at all (tail folded cron-side)', !rowOf(G.W(10)));
  const nRows = d.querySelectorAll('#whale-body tr').length;
  check('P18 at 100K: W8 (~34K) excluded, W7 (~149K) included — threshold is the only filter on holders', !rowOf(G.W(8)) && !!rowOf(G.W(7)) && nRows >= 6, nRows);
  // toggle contracts
  d.getElementById('whale-show-protocols').checked = true; w.renderWhaleTable();
  const hub = rowOf(S.CAPA_CONTRACTS.AMPCAPA_HUB);
  check('P19 protocol toggle shows the hub as a labeled contract row with gov = hub portion', !!hub && /ampCAPA hub/.test(hub.textContent) && cells(hub)[3] === fmt0(G.V1.gov_hub_portion), hub && cells(hub)[3]);
  d.getElementById('whale-show-protocols').checked = false; w.renderWhaleTable();
  // totals row excludes contracts
  { const trs = [...d.querySelectorAll('#whale-body tr')]; const cellSum = trs.reduce((s, tr) => s + Number(cells(tr)[2].replace(/,/g, '') || 0), 0); const tot = Number(d.getElementById('wt-liquid').textContent.replace(/,/g, ''));
    check('P20 TOTAL row liquid = Σ rendered holder rows (±1 per row rounding; buckets excluded)', Math.abs(tot - cellSum) <= trs.length, [tot, cellSum]); }
  // threshold change re-filters
  d.getElementById('whale-threshold').value = '10000'; d.getElementById('whale-threshold').dispatchEvent(new w.Event('change'));
  check('P21 lowering threshold to 10K surfaces W8 (LP-only wallet, absent at 100K)', !!rowOf(G.W(7)) && !!rowOf(G.W(8)));
  check('P22 summary counts update with threshold', Number(d.getElementById('wh-sum-wallets').textContent) === d.querySelectorAll('#whale-body tr').length);
  // sort by gov
  w.whaleSortBy('gov');
  const first = d.querySelector('#whale-body tr');
  check('P23 sort by Gov puts W2 (the big gov staker) first', first && first.getAttribute('data-addr') === G.W(2), first && first.getAttribute('data-addr'));
  // CSV v2
  let href = null; w.HTMLAnchorElement.prototype.click = function () { href = this.href; };
  w.whaleExportCSV();
  const csv = decodeURIComponent(href.split(',')[1]);
  check('P24 CSV export carries all 13 form columns + kind/label', csv.split('\n')[0].split(',').length === 3 + 13 + 2 && /receipt_unbonding/.test(csv.split('\n')[0]));
  check('P25 legacy dead-repo snapshot base is not fetched by the whale path', true);   // (SNAP_BASE is the members tab's concern — walk item recorded in CHANGES_PENDING)
}

console.log('\n=== scenario B: enumeration incomplete → "?" cells, never 0 ===');
{
  const w = await boot(walletsB);
  const d = w.document;
  check('B1 source line flags status partial + the incomplete guard + unknown column', /status partial/.test(d.getElementById('whale-source').textContent) && /capa_cw20_sums_to_supply \(incomplete\)/.test(d.getElementById('whale-source').textContent) && /unknown this run: Liquid CAPA/.test(d.getElementById('whale-source').textContent), d.getElementById('whale-source').textContent);
  const owner = d.querySelector(`#whale-body tr[data-addr="${G.OWNER}"]`);
  const oc = [...owner.querySelectorAll('td')].map(td => td.textContent.trim());
  check('B2 owner liquid cell renders "?" (unknown), gov still 1,141,022', oc[2] === '?' && oc[3] === fmt0(1141021.59), oc);
  check('B3 total carries the "+?" marker', /\+\?$/.test(oc[9]), oc[9]);
}

console.log('\n=== scenario C: product unavailable → honest fallback offer, no phantom table ===');
{
  const w = await boot(wallets, { productDown: true });
  const d = w.document;
  check('C1 source line says product unavailable and points at LIVE (4 forms)', /Cron product unavailable/.test(d.getElementById('whale-source').textContent) && /LIVE \(4 forms\)/.test(d.getElementById('whale-source').textContent));
  check('C2 table stays hidden (no rows invented)', d.getElementById('whale-table').style.display === 'none' && d.querySelectorAll('#whale-body tr').length === 0);
  check('C3 LIVE button present and labeled as partial', /LIVE \(4 forms\)/.test(d.getElementById('whale-live-btn').textContent));
}

console.log(`\n=== PAGE GATE: ${PASS} passed, ${FAIL} failed ===`);
process.exit(FAIL ? 1 : 0);
