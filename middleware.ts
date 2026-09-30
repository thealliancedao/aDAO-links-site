// middleware.ts — SITE GATE 1.1 (2026-09-30) — the site is ON HOLD: every page, deep link and /api call answers with the
// "on hold" page until the visitor unlocks it. Runs on Vercel (Routing Middleware) before the CDN cache, so no page can be
// reached around it. NO password is in this file or anywhere in the public repo.
//
// Who can get in:
//   • the owner — SITE_PASSWORD (Vercel → Project → Settings → Environment Variables; changing it logs the owner out)
//   • guests    — a JSON file in a PRIVATE GitHub repo, read at run time (so a change needs no redeploy; it applies within a minute):
//       { "guests": [ { "name": "alex", "password": "<their password>", "until": "2026-10-31", "note": "reviewing the portfolio" } ] }
//     Remove a guest, change their password or let "until" pass → their access ends within a minute, even mid-visit.
//     Vercel variables for it: GATE_CONFIG = "thealliancedao/<private-repo>/site-access.json" and GATE_CONFIG_TOKEN = a fine-grained
//     GitHub token with READ-ONLY "Contents" on that one repo. If GitHub cannot be reached, the last copy read is used; with none,
//     only the owner's password works (fails closed).
//   • SITE_GATE=off opens the whole site again (then redeploy) — or delete this file.
// Missing SITE_PASSWORD and no guest file = nobody can unlock (fails closed).
//
// Always open (so browsers, Google's site check and the home-screen app don't break): favicons, robots.txt, the Google
// verification file, the service worker, web manifests, the app icons.
// Unlock: POST /__unlock (password, next) → an HttpOnly cookie (30 days; a guest's ends at their "until") naming who it belongs to,
// signed with THAT person's password — so it stops working the moment their password changes or they are removed.
// Lock again: /__lock. The Vercel function log records "gate: unlocked by <name>" (never a password).
// Plain JavaScript inside a .ts file so the same code runs in the local test.

const COOKIE = 'tla_gate';
const DAYS = 30;
const OPEN = /^\/(favicon[^/]*|robots\.txt|google[0-9a-f]+\.html|sw\.js|[^/]*\.webmanifest|assets\/app\/[^/]+)$/;
const NAME = /^[a-z0-9_-]{1,32}$/i;
const CONFIG_TTL_MS = 60 * 1000;

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function sameText(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const samePassword = async (a, b) => sameText(await hmac('cmp', a), await hmac('cmp', b));   // equal-length digests, compared in constant time
function readCookie(req, name) {
  const m = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
const endOf = (until) => { const t = Date.parse(String(until || '') + 'T23:59:59Z'); return Number.isFinite(t) ? t : null; };

// ── the guest list (private repo, cached a minute; the last good copy survives a GitHub hiccup) ──
let cache = { at: 0, guests: null };
async function guests(env) {
  if (!env.GATE_CONFIG || !env.GATE_CONFIG_TOKEN) return [];
  if (cache.guests && Date.now() - cache.at < CONFIG_TTL_MS) return cache.guests;
  const [owner, repo, ...rest] = String(env.GATE_CONFIG).split('/'); const file = rest.join('/');
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file}`, { headers: { authorization: `Bearer ${env.GATE_CONFIG_TOKEN}`, accept: 'application/vnd.github.raw+json', 'user-agent': 'site-gate' }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const doc = await r.json(); const now = Date.now();
    const list = (Array.isArray(doc && doc.guests) ? doc.guests : []).filter((g) => g && NAME.test(String(g.name || '')) && String(g.name).toLowerCase() !== 'owner' && typeof g.password === 'string' && g.password.length >= 8)
      .map((g) => ({ name: String(g.name).toLowerCase(), password: g.password, until: endOf(g.until) })).filter((g) => g.until == null || g.until > now);
    cache = { at: now, guests: list };
  } catch (e) { console.log('gate: guest list not readable (' + e.message + ') — using the last copy' + (cache.guests ? '' : ' (none: owner only)')); cache.at = Date.now() - CONFIG_TTL_MS + 15000; }
  return cache.guests || [];
}
async function passwordOf(env, name) {
  if (name === 'owner') return env.SITE_PASSWORD ? { password: env.SITE_PASSWORD, until: null } : null;
  const g = (await guests(env)).find((x) => x.name === name); return g || null;
}
async function unlocked(req, env) {
  const v = readCookie(req, COOKIE); if (!v) return false;
  const [name, exp, sig] = v.split('.'); if (!name || !NAME.test(name) || !exp || !sig || !(Number(exp) > Date.now())) return false;
  const who = await passwordOf(env, name); if (!who) return false;
  if (who.until != null && who.until < Date.now()) return false;
  return sameText(sig, await hmac(who.password, `gate-v2:${name}:${exp}`));
}
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/__') ? n : '/');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function holdPage(next, wrong) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Alliance DAO — on hold</title><link rel="icon" href="/favicon.ico">
<style>
:root{--bg:#0b1220;--card:#111a2e;--line:#1f2a44;--text:#e5e7eb;--muted:#9ca3af;--accent:#22d3ee;--accent2:#2dd4bf;--bad:#f87171}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:radial-gradient(1200px 600px at 50% -10%,#0f2a3a 0%,var(--bg) 60%);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
main{max-width:520px;text-align:center}
img{width:72px;height:72px;border-radius:16px;opacity:.95}
h1{font-size:clamp(24px,5vw,32px);margin:20px 0 10px;letter-spacing:-.01em}
p{color:var(--muted);line-height:1.6;margin:0 0 8px;font-size:16px;text-wrap:balance}
.tag{display:inline-block;margin-top:18px;padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:var(--accent);font-size:13px;letter-spacing:.04em;text-transform:uppercase}
#k{position:fixed;right:14px;bottom:14px;width:34px;height:34px;border-radius:50%;border:1px solid transparent;background:transparent;color:var(--muted);opacity:.12;cursor:pointer;transition:opacity .2s,border-color .2s;display:flex;align-items:center;justify-content:center}
#k:hover,#k:focus-visible{opacity:1;border-color:var(--line);outline:none}
form{position:fixed;right:14px;bottom:58px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;display:none;gap:8px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
form.open{display:flex}
input{background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--text);padding:9px 10px;font-size:15px;width:190px}
input:focus{outline:none;border-color:var(--accent)}
button[type=submit]{background:var(--accent2);color:#04201c;border:0;border-radius:8px;padding:9px 12px;font-weight:600;cursor:pointer}
.bad input{border-color:var(--bad);animation:s .3s}
@keyframes s{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
</style></head><body>
<main>
<img src="/assets/app/icon-192.png" alt="">
<h1>This project is on hold</h1>
<p>The Alliance DAO dashboard is paused while we rebuild the data behind it.</p>
<p>Thank you for your patience — check back soon.</p>
<span class="tag">Paused</span>
</main>
<button id="k" type="button" aria-label="Access" title=""><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></button>
<form id="f" method="post" action="/__unlock" class="${wrong ? 'open bad' : ''}" autocomplete="off">
<input type="hidden" name="next" value="${esc(next)}">
<input id="p" type="password" name="password" placeholder="Password" aria-label="Password" required>
<button type="submit">Enter</button>
</form>
<script>
var f=document.getElementById('f'),p=document.getElementById('p');
document.getElementById('k').onclick=function(){f.classList.toggle('open');if(f.classList.contains('open'))p.focus();};
if(f.classList.contains('open'))p.focus();
</script>
</body></html>`;
}
const noStore = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
const hold = (next, wrong, status) => new Response(holdPage(next, wrong), { status, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '86400', ...noStore } });
const cookieOut = (v, age) => `${COOKIE}=${v}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;

export default async function middleware(request) {
  const env = (typeof process !== 'undefined' && process.env) || {};
  if (String(env.SITE_GATE || '').toLowerCase() === 'off') return;   // open — the request continues as normal
  const url = new URL(request.url); const path = url.pathname;

  if (path === '/__lock') return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': cookieOut('', 0), ...noStore } });
  if (path === '/__unlock') {
    if (request.method !== 'POST') return new Response(null, { status: 303, headers: { location: '/', ...noStore } });
    let got = '', next = '/'; try { const fd = await request.formData(); got = String(fd.get('password') || ''); next = safeNext(String(fd.get('next') || '/')); } catch { }
    let who = null;   // every candidate is compared (constant time each), so the answer time does not say which one was close
    if (env.SITE_PASSWORD && (await samePassword(got, env.SITE_PASSWORD))) who = { name: 'owner', password: env.SITE_PASSWORD, until: null };
    for (const g of got ? await guests(env) : []) if ((await samePassword(got, g.password)) && !who) who = g;
    if (!who) { await new Promise((r) => setTimeout(r, 900)); return hold(next, true, 401); }   // a wrong guess costs time
    const exp = Math.min(Date.now() + DAYS * 864e5, who.until || Infinity);
    console.log('gate: unlocked by ' + who.name);
    return new Response(null, { status: 303, headers: { location: next, 'set-cookie': cookieOut(`${who.name}.${exp}.${await hmac(who.password, `gate-v2:${who.name}:${exp}`)}`, Math.max(60, Math.floor((exp - Date.now()) / 1000))), ...noStore } });
  }
  if (OPEN.test(path)) return;
  if (await unlocked(request, env)) return;

  const wantsPage = request.method === 'GET' && !path.startsWith('/api/') && ((request.headers.get('accept') || '').includes('text/html') || /(\.html?|\/)$/.test(path) || !/\.[a-z0-9]+$/i.test(path));
  if (wantsPage) return hold(path + url.search, false, 503);
  return new Response('on hold', { status: 401, headers: { 'content-type': 'text/plain', ...noStore } });
}
