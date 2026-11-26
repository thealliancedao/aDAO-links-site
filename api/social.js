// Vercel serverless function: /api/social?path=<file>
//
// Serves theadao.com/social/ from the shared data repo: tla-core → social-board/public/ (the social board's
// published build — board page, Method page, manifest, data). vercel.json rewrites /social/* here.
//
// Why a function and not a plain rewrite to a CDN: raw.githubusercontent.com and jsDelivr both send GitHub-hosted
// .html as text/plain, so a direct rewrite renders the page as source. This relays the bytes with the right
// Content-Type. The site's gate middleware runs before the rewrite, so /social/ stays behind the password.
//
// SECURITY: only files under social-board/public/ in tla-core main can be fetched; '..' and absolute paths are
// refused. Nothing is written anywhere.
//
// Runtime: Node 18+ (Vercel default). CommonJS, no package.json required.

const ORIGIN = 'https://raw.githubusercontent.com/thealliancedao/tla-core/main/social-board/public/';
const FETCH_TIMEOUT_MS = 10000;
const TYPES = {
    html: 'text/html; charset=utf-8',
    json: 'application/json; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp',
};

module.exports = async (req, res) => {
    let p = String((req.query && req.query.path) || 'index.html');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    if (p.startsWith('/') || p.includes('..') || p.includes('\\') || p.includes('//')) {
        res.statusCode = 400; res.setHeader('Content-Type', 'text/plain'); return res.end('bad path');
    }
    const ext = (p.split('.').pop() || '').toLowerCase();
    const type = TYPES[ext];
    if (!type) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('not found'); }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const up = await fetch(ORIGIN + p.split('/').map(encodeURIComponent).join('/'), { signal: ctrl.signal });
        clearTimeout(timer);
        if (up.status === 404) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('not found'); }
        if (!up.ok) { res.statusCode = 502; res.setHeader('Content-Type', 'text/plain'); return res.end('upstream ' + up.status); }
        const buf = Buffer.from(await up.arrayBuffer());
        res.statusCode = 200;
        res.setHeader('Content-Type', type);
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        // Edge cache 5 min (GitHub raw itself caches ~5 min); a new build shows within ~10 min of the push.
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        return res.end(buf);
    } catch (e) {
        clearTimeout(timer);
        res.statusCode = 504; res.setHeader('Content-Type', 'text/plain');
        return res.end('could not reach the data repository');
    }
};
