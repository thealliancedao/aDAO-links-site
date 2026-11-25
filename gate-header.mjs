// gate-header.mjs — the site's real header for a gate (lib/site-header.js run in a throwaway window). A page builds its tab bar with
// SiteHeader.tlaTabs('<its tab>'), so a gate's SiteHeader stub takes tlaTabs from here: the page then gets the list the site serves,
// and the gate can check the bar a visitor sees. TLA_BAR is the owner's order (2026-11-25), written out once for the checks.
import { JSDOM } from 'jsdom'; import fs from 'fs'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
let H = null;
export function realHeader() {
  if (H) return H;
  const d = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://thealliancedao.com/', runScripts: 'outside-only' });
  d.window.eval(fs.readFileSync(path.join(here, 'lib/site-header.js'), 'utf8')); H = d.window.SiteHeader; return H;
}
export const TLA_BAR = ['Overview', 'Member Portfolio', 'Slippage Simulator', 'Vote Simulator', 'LP Grades', 'Contract Watch', 'PD Watch'];
export const TLA_HREF = { overview: 'tla-stats.html#overview', portfolio: 'member-portfolio.html', slippage: 'slippage.html', votesim: 'vote-market.html', grades: 'tla-stats.html#grades', watch: 'contract-watch.html', pdwatch: 'tla-stats.html#pdwatch' };
/** true when `items` (what a page handed to SiteHeader.subnav) is the TLA bar with `lit` lit; `inPage` lists the ids that are buttons there */
export function isTlaBar(items, lit, inPage = []) {
  return Array.isArray(items) && items.map((t) => t.label).join('|') === TLA_BAR.join('|') && items.filter((t) => t.active).map((t) => t.id).join() === lit
    && items.every((t) => inPage.includes(t.id) ? t.href == null : t.href === TLA_HREF[t.id]) && !items.some((t) => /^(pools|docs|tla)$/.test(t.id));
}
