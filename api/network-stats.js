// Vercel serverless function: /api/smartstake
//
// Dedicated endpoint that fetches SmartStake's networkStats blob server-side
// and relays it to the browser with permissive CORS headers. SmartStake's
// API doesn't send Access-Control-Allow-Origin so direct browser fetches are
// blocked.
//
// Why not a generic /api/proxy?url=...? Vercel's edge WAF rejects requests
// whose query string contains URL-shaped values (even base64-encoded ones)
// as SSRF, returning 405 with body {"detail":"Method Not Allowed"} BEFORE
// the function executes. Hardcoding the destination here sidesteps that
// entirely — there's no URL parameter to inspect.
//
// Runtime: Node 18+ (Vercel default). CommonJS, no package.json required.
// Add more dedicated endpoints under /api/ as new destinations are needed
// (e.g. /api/coingecko-luna.js, /api/eris-ratios.js).

const TARGET_URL = 'https://ssdata.smartstakeapi.com/common/networkStats';
const FETCH_TIMEOUT_MS = 10000;

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

    try {
        const upstream = await fetch(TARGET_URL, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'aDAO-proxy/1.0 (+https://theadao.com)',
                'Accept': 'application/json'
            }
        });

        const body = await upstream.text();
        const ct = upstream.headers.get('content-type');
        if (ct) res.setHeader('Content-Type', ct);
        return res.status(upstream.status).send(body);
    } catch (e) {
        const msg = (e && e.name === 'AbortError')
            ? 'Upstream timeout'
            : ((e && e.message) || 'Upstream fetch failed');
        return res.status(502).json({ error: msg });
    } finally {
        clearTimeout(timeout);
    }
};
