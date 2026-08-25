// lib/prop-audit.js — proposal quick-audit engine (2026-08-25). Extracted VERBATIM from index.html Rev 4.05–4.09
// so index and dao.html share ONE copy (no-third-copy law): deep base64 decoding, action ledger with every counterparty
// named from the registries (trust register, member catalog, live pools, token catalog, curated register), amounts in
// catalog decimals incl. cw20-context and cw-asset shapes, for_info pools, precedent shape-matching, and the annotated
// "decoded messages" view. Configure once per page: PropAudit.configure({ BASE, esc, WATCHED_DAOS, getAstroPools }).
(function () {
    'use strict';
    const deps = { BASE: 'https://raw.githubusercontent.com/thealliancedao/tla-core/main', esc: (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), WATCHED_DAOS: [], getAstroPools: null };
    const esc = (x) => deps.esc(x);
        const deepDecode = (v, depth) => {
        depth = depth || 0; if (depth > 6) return v;
        if (typeof v === 'string') {
            if (/^[A-Za-z0-9+/=]{16,}$/.test(v) && v.length % 4 === 0) { try { const t = atob(v); if (/^[\s\[{]/.test(t)) return deepDecode(JSON.parse(t), depth + 1); } catch {} }
            return v;
        }
        if (Array.isArray(v)) return v.map(x => deepDecode(x, depth + 1));
        if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = deepDecode(v[k], depth + 1); return o; }
        return v;
    };
    const AMOUNT_KEYS = /^(amount|amount_raw|min_.*|max_.*|timeout_timestamp|timestamp|deadline|expires?|expiration|nonce|memo|id|proposal_id|height)$/i;
    function msgShape(rawMsgs) {
        const f = { contracts: new Set(), actions: new Set(), addrs: new Set(), denoms: new Set(), paths: new Set(), amounts: [] };
        const walk = (v, path, key) => {
            if (typeof v === 'string') {
                if (/^terra1[02-9ac-hj-np-z]{38,58}$/.test(v)) f.addrs.add(v);
                else if (/^(u[a-z]+|ibc\/[0-9A-F]{64}|factory\/terra1[^/]+\/.+)$/.test(v)) f.denoms.add(v);
                else if (/^\d{3,}$/.test(v) && AMOUNT_KEYS.test(key || '')) f.amounts.push(path + '=' + v);
                return;
            }
            if (typeof v === 'number') { if (AMOUNT_KEYS.test(key || '')) f.amounts.push(path + '=' + v); return; }
            if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[]', key)); return; }
            if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (!AMOUNT_KEYS.test(k)) f.paths.add(path + '/' + k); walk(v[k], path + '/' + k, k); }
        };
        for (const m of (rawMsgs || [])) {
            const d = deepDecode(m);
            const w = d && d.wasm && d.wasm.execute, b = d && d.bank && d.bank.send;
            if (w) { f.contracts.add(w.contract_addr); const inner = w.msg && typeof w.msg === 'object' ? w.msg : {}; Object.keys(inner).forEach(k => f.actions.add(k)); walk(inner, w.contract_addr + ':' + Object.keys(inner)[0], null); for (const x of (w.funds || [])) { if (x.denom) f.denoms.add(x.denom); if (x.amount) f.amounts.push('funds/' + x.denom + '=' + x.amount); } }
            else if (b) { f.actions.add('bank.send'); f.addrs.add(b.to_address); for (const x of (b.amount || [])) { if (x.denom) f.denoms.add(x.denom); if (x.amount) f.amounts.push('bank/' + x.denom + '=' + x.amount); } }
            else { const k = d && typeof d === 'object' ? Object.keys(d)[0] : 'unknown'; f.actions.add(k); walk(d, k, null); }
        }
        return f;
    }
    const jacc = (a, b) => { if (!a.size && !b.size) return 1; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
    function shapeCompare(A, B) {
        const parts = [['contracts', 0.35], ['actions', 0.25], ['addrs', 0.2], ['denoms', 0.1], ['paths', 0.1]];
        let score = 0; const same = [], diff = [];
        for (const [k, w] of parts) {
            const j = jacc(A[k], B[k]); score += w * j;
            if (j === 1 && (A[k].size || B[k].size)) same.push(k);
            else if (j < 1) { const only = [...A[k]].filter(x => !B[k].has(x)), miss = [...B[k]].filter(x => !A[k].has(x)); diff.push(k + (only.length ? ' new: ' + only.map(x => x.length > 20 ? x.slice(0, 10) + '…' + x.slice(-6) : x).join(', ') : '') + (miss.length ? ' missing: ' + miss.map(x => x.length > 20 ? x.slice(0, 10) + '…' + x.slice(-6) : x).join(', ') : '')); }
        }
        return { score: Math.round(score * 100), same, diff, amountsDiffer: A.amounts.join('|') !== B.amounts.join('|') };
    }
    // past = cards with rawMsgs (corpus or live). Returns ranked precedents + a plain-language reading.
    function precedentOf(card, past) {
        const A = msgShape(card.rawMsgs || []);
        const rows = (past || []).filter(p => p && p.id !== card.id && Array.isArray(p.rawMsgs) && p.rawMsgs.length).map(p => ({ card: p, ...shapeCompare(A, msgShape(p.rawMsgs)) })).sort((a, b) => b.score - a.score || b.card.id - a.card.id);
        const top = rows.filter(r => r.score >= 60).slice(0, 5);
        const passedN = top.filter(r => ['passed', 'executed'].includes(String(r.card.status).toLowerCase())).length;
        const rejN = top.filter(r => /rejected|vetoed|closed|execution_failed/.test(String(r.card.status).toLowerCase())).length;
        const best = rows[0] || null;
        let band, reading;
        if (!A.contracts.size && !A.actions.size) { band = 'none'; reading = 'No executable messages — text-only proposal; nothing to compare.'; }
        else if (!rows.length) { band = 'none'; reading = 'No past proposals with messages available for this governance — nothing to compare against.'; }
        // A changed address or contract can never be a "match" whatever the score — that
        // is the exact swap a drain attempt makes. Identity differences always surface.
        else if (best.score >= 90 && !best.diff.some(d => /^(addrs|contracts)/.test(d))) { band = 'match'; reading = 'Same shape as ' + top.length + ' past proposal' + (top.length === 1 ? '' : 's') + ' (' + passedN + ' passed, ' + rejN + ' rejected)' + (best.amountsDiffer ? ' — amounts differ, everything else matches.' : ' — amounts match too.'); }
        else if (best.score >= 60) { band = 'near'; reading = 'Close to #' + best.card.id + ' (' + best.score + '% of shape, ' + String(best.card.status).toLowerCase() + '). Differences: ' + best.diff.join('; ') + '. Worth the deeper check.'; }
        else { band = 'new'; reading = 'No close precedent in this governance (best ' + best.score + '% vs #' + best.card.id + '). New shape — put it through the deeper check.'; }
        return { band, reading, top, best, shape: A, compared: rows.length };
    }
    // ---- Rev 3.87 ACTION LEDGER (owner 2026-08-22) --------------------------------------
    // Every message → plain actions: what moves, from whom, to whom, how much of which
    // token (decimals applied), with each counterparty resolved against the trust
    // product (catalog/trusted), the member catalog (registered wallets) and the live
    // pool snapshot. Per action:
    //   pass  — every address known (trust product / pool / watched governance)
    //   soft  — an address is NOT in the trust register but IS a registered member
    //           wallet, or has appeared in an executed proposal of this governance
    //   hard  — an address no registry knows and no past proposal has touched
    // Flags are "needs verification", never "malicious": the text says so, and the
    // "Request verification" button composes the ask for the owner/team.
    const DENOM_FIXED = { uluna: { symbol: 'LUNA', decimals: 6 } };
    let _resolvers = null;
    const cardKey = (c) => c.dao + '|' + c.id;   // the same key index.html uses for its verification links
    async function resolvers() {
        if (_resolvers) return _resolvers;
        const get = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
        const [trusted, cat, astro, tokCat, kcAlways] = await Promise.all([
            get(deps.BASE + '/catalog/trusted/current.json?t=' + Math.floor(Date.now() / 900000)),
            get(deps.BASE + '/catalog/snapshots/current.json?t=' + Math.floor(Date.now() / 900000)),
            (deps.getAstroPools ? deps.getAstroPools() : Promise.resolve(null)),
            get(deps.BASE + '/token-catalog/snapshots/current.json?t=' + Math.floor(Date.now() / 900000)),   // Rev 4.05: symbols + decimals for every priced token
            get(deps.BASE + '/docs/curated/known_contracts.json?t=' + Math.floor(Date.now() / 900000)),     // Rev 4.05: LP / pair identities, always (was only when the trust product 404'd)
        ]);
        const known = {}, members = {}, denoms = { ...DENOM_FIXED };
        for (const t of (tokCat && tokCat.tokens) || []) { const sym = (t.effective && t.effective.symbol) || (t.discovered && t.discovered.symbol); if (t.denom && sym) denoms[t.denom] = { symbol: sym, decimals: (t.effective && t.effective.decimals != null) ? t.effective.decimals : ((t.discovered && t.discovered.decimals != null) ? t.discovered.decimals : 6) }; }
        for (const r of (trusted && trusted.addresses) || []) known[r.address] = { label: r.label, type: r.type, methods: r.methods || [], human_only: !!r.human_only };
        // Rev 3.88 (owner 2026-08-22: bribe manager read "unverified" while catalog/trusted was
        // still 404): until the trust product is published, fall back to the registries the
        // cron itself merges — structural contracts + entities from the catalog snapshot,
        // wallets.json, known_contracts.json, and the DAO registries. Same sources, same answer.
        if (!trusted) {
            for (const [k, v] of Object.entries((cat && cat.contracts) || {})) if (v && v.addr && !known[v.addr]) known[v.addr] = { label: v.role || k, type: 'contract', methods: ['chain'] };
            for (const [a, v] of Object.entries((cat && cat.entities) || {})) if (!known[a]) known[a] = { label: v.label, type: v.subtype || 'entity', methods: ['owner'] };
            const [w, kc, ...regs] = await Promise.all([get(deps.BASE + '/docs/curated/wallets.json'), get(deps.BASE + '/docs/curated/known_contracts.json'), ...['adao', 'lion-dao', 'pixel-lions', 'capapult', 'terra'].map(d => get('https://raw.githubusercontent.com/thealliancedao/dao-originations/main/' + d + '/governance/registry.json'))]);
            for (const [a, v] of Object.entries((w && w.wallets) || {})) if (v && v.label && !known[a]) known[a] = { label: v.label, type: v.subtype || 'entity', methods: v.verified ? ['owner'] : [] };
            for (const [a, v] of Object.entries((kc && kc.contracts) || {})) if (v && v.name && !known[a]) known[a] = { label: v.name, type: v.type || 'contract', methods: ['owner'] };
            regs.forEach((r, i) => { if (!r) return; const dao = ['adao', 'lion-dao', 'pixel-lions', 'capapult', 'terra'][i]; for (const [a, v] of Object.entries(r.contracts || {})) if (!known[a]) known[a] = { label: v.name, type: v.type || 'contract', methods: ['dao_registry'] }; for (const a of [r.coreAddress, r.govAddress]) if (a && !known[a]) known[a] = { label: (r.daoName || dao) + ' core', type: 'dao_core', methods: ['dao_registry'] }; });
        }
        for (const [a, v] of Object.entries((cat && cat.by_address) || {})) members[a] = { handle: v.handle || null, slugs: (v.memberships || []).map(m => m.slug) };
        for (const [a, v] of Object.entries((kcAlways && kcAlways.contracts) || {})) if (v && v.name && !known[a]) known[a] = { label: v.name, type: v.type || 'contract', methods: ['register'] };
        for (const p of (astro && astro.pools) || []) { if (p.pool_address && !known[p.pool_address]) known[p.pool_address] = { label: p.pool_name + ' pool (Astroport)', type: 'pool', methods: ['chain'] }; for (const a of (p.assets || [])) if (a.denom && !denoms[a.denom]) denoms[a.denom] = { symbol: a.symbol || a.denom.slice(0, 12), decimals: a.decimals != null ? a.decimals : 6 }; }
        for (const g of (deps.WATCHED_DAOS || [])) if (g.addr && !known[g.addr]) known[g.addr] = { label: g.name, type: 'dao_core', methods: ['chain'] };
        _resolvers = { known, members, denoms, trustedLoaded: !!trusted };
        return _resolvers;
    }
    const fmtAmt = (raw, d) => { const n = Number(raw) / Math.pow(10, d.decimals); return (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toLocaleString(undefined, { maximumFractionDigits: 6 })) + ' ' + d.symbol; };
    function ledgerOf(card, R, pastShapes) {
        const seen = new Set(); for (const sh of pastShapes || []) for (const a of sh.addrs) seen.add(a); for (const sh of pastShapes || []) for (const a of sh.contracts) seen.add(a);
        const who = (a) => {
            if (!a) return null;
            if (R.known[a]) return { addr: a, name: R.known[a].label, level: 'pass', why: 'in the trust register (' + R.known[a].methods.join(', ') + ')' };
            if (R.members[a]) return { addr: a, name: (R.members[a].handle || 'registered member wallet') + ' (' + R.members[a].slugs.join('/') + ')', level: 'soft', why: 'a registered member wallet — not a contract in the trust register' };
            if (seen.has(a)) return { addr: a, name: 'unverified — seen in past ' + card.dao + ' proposals', level: 'soft', why: 'not in any registry, but executed proposals of this governance already touched it' };
            return { addr: a, name: 'UNKNOWN to every registry', level: 'hard', why: 'no registry knows it and no past proposal of this governance has touched it' };
        };
        const tokenOf = (id) => R.denoms[id] || (R.known[id] ? { symbol: R.known[id].label, decimals: 6 } : null);
        const asset = (den, amt) => { const d = tokenOf(den); return d ? fmtAmt(amt, d) : (amt + ' ' + (den || '?') + ' (raw — denom not in catalog)'); };
        const actions = [];
        (card.rawMsgs || []).forEach((m, i) => {
            const d = deepDecode(m); const w = d && d.wasm && d.wasm.execute, b = d && d.bank && d.bank.send;
            const act = { n: i + 1, kind: null, from: card.dao + ' (executes the proposal)', to: [], amounts: [], level: 'pass', notes: [] };
            const consider = (p) => { if (p) { act.to.push(p); if (p.level === 'hard') act.level = 'hard'; else if (p.level === 'soft' && act.level !== 'hard') act.level = 'soft'; } };
            if (b) { act.kind = 'transfer (bank send)'; consider(who(b.to_address)); for (const x of (b.amount || [])) act.amounts.push(asset(x.denom, x.amount)); }
            else if (w) {
                const inner = w.msg && typeof w.msg === 'object' ? w.msg : {}; const action = Object.keys(inner)[0] || '?';
                act.kind = 'call ' + action; const c = who(w.contract_addr); if (c) { c.role = 'contract'; consider(c); }
                for (const x of (w.funds || [])) act.amounts.push(asset(x.denom, x.amount) + ' attached');
                // walk the inner message for recipients and assets
                // Rev 4.05: cw20 calls carry the amount WITHOUT naming the token — the token IS the contract being called
                const CW20_CALLS = /^(increase_allowance|decrease_allowance|transfer|transfer_from|send|send_from|burn|burn_from|mint)$/;
                const cw20Ctx = CW20_CALLS.test(action) && tokenOf(w.contract_addr) ? w.contract_addr : null;
                const walk = (v, key) => {
                    if (Array.isArray(v)) { v.forEach(x => walk(x, key)); return; }
                    if (v && typeof v === 'object') {
                        if (v.denom && v.amount != null) act.amounts.push(asset(v.denom, v.amount) + (key ? ' (' + key + ')' : ''));
                        else if (v.contract_addr && v.amount != null) act.amounts.push(asset(v.contract_addr, v.amount) + (key ? ' (' + key + ')' : ''));
                        else if (v.info && v.amount != null && (v.info.cw20 || v.info.native)) act.amounts.push(asset(v.info.cw20 || v.info.native, v.amount) + (key ? ' (' + key + ')' : ''));   // cw-asset shape (add_bribe.bribe)
                        else if (cw20Ctx && v.amount != null && !v.info) act.amounts.push(asset(cw20Ctx, v.amount) + ' (' + action + ')');   // {spender|recipient, amount} on the token contract
                        if (v.for_info && (v.for_info.native || v.for_info.cw20)) { const id = v.for_info.native || v.for_info.cw20; act.notes.push('for pool: ' + (R.known[id] ? R.known[id].label : (R.denoms[id] ? R.denoms[id].symbol : 'UNKNOWN LP ' + id.slice(0, 14) + '…'))); if (!R.known[id] && !R.denoms[id] && act.level === 'pass') act.level = 'soft'; }
                        if (v.distribution && v.distribution.func) act.notes.push('distribution: ' + (v.distribution.func.func_type || '?') + ' epochs ' + (v.distribution.func.start ?? '?') + '→' + (v.distribution.func.end ?? '?'));
                        for (const k of Object.keys(v)) { if (/^(to_address|recipient|to|receiver|owner|beneficiary|spender)$/.test(k) && typeof v[k] === 'string' && /^terra1/.test(v[k])) { const p = who(v[k]); if (p) { p.role = k; consider(p); } } walk(v[k], k); }
                    }
                };
                walk(inner, null);
                if (action === 'send' && inner.send && inner.send.contract) { const p = who(inner.send.contract); if (p) { p.role = 'cw20 send target'; consider(p); } if (inner.send.amount != null) act.amounts.push(asset(w.contract_addr, inner.send.amount) + ' (cw20 send)'); }
            } else { act.kind = (d && typeof d === 'object' ? Object.keys(d)[0] : 'unknown'); act.notes.push('message type not decoded — review on chain'); act.level = 'soft'; }
            actions.push(act);
        });
        const worst = actions.reduce((w, a) => a.level === 'hard' ? 'hard' : (a.level === 'soft' && w !== 'hard' ? 'soft' : w), 'pass');
        return { actions, worst, trustedLoaded: R.trustedLoaded, _R: R };
    }
    // Rev 4.05 (owner): the raw message, annotated — every address gets its name (or a flag),
    // every amount its human value with the token, so "increase_allowance … 3500000000000000"
    // reads as "ROAR Token … 3,500,000,000 ROAR". Same resolvers as the ledger; nothing guessed.
    function decodedHtml(card, R) {
        const nameOf = (a) => R.known[a] ? { t: R.known[a].label, ok: true } : (R.denoms[a] ? { t: R.denoms[a].symbol, ok: true } : (R.members[a] ? { t: (R.members[a].handle || 'registered member'), ok: true } : { t: 'UNKNOWN to every registry', ok: false }));
        const tokenOf = (id) => R.denoms[id] || (R.known[id] ? { symbol: R.known[id].label, decimals: 6 } : null);
        const isAddr = (v) => typeof v === 'string' && (/^terra1[0-9a-z]{38,58}$/.test(v) || /^(ibc\/|factory\/)/.test(v));
        const chip = (ok, text) => '<span class="' + (ok ? 'text-emerald-300' : 'text-amber-300') + '">⟵ ' + esc(text) + '</span>';
        const render = (v, indent, ctxToken, key) => {
            const pad = '  '.repeat(indent);
            if (isAddr(v)) { const n = nameOf(v); return '"' + esc(v) + '" ' + chip(n.ok, n.t); }
            if (v === null || typeof v !== 'object') {
                if (typeof v === 'string' && /^\d{7,}$/.test(v) && key === 'amount' && ctxToken) { const d = tokenOf(ctxToken); if (d) return '"' + esc(v) + '" ' + chip(true, fmtAmt(v, d)); }
                return esc(JSON.stringify(v));
            }
            if (Array.isArray(v)) return v.length ? '[\n' + v.map(x => pad + '  ' + render(x, indent + 1, ctxToken, null)).join(',\n') + '\n' + pad + ']' : '[]';
            // token context for the children: the asset's own info, a native denom, a cw20 contract_addr, or an inherited cw20 call
            let ctx = ctxToken;
            if (v.info && (v.info.cw20 || v.info.native)) ctx = v.info.cw20 || v.info.native;
            else if (v.denom) ctx = v.denom;
            else if (v.contract_addr && v.amount != null) ctx = v.contract_addr;
            if (v.execute && v.execute.contract_addr && tokenOf(v.execute.contract_addr)) ctx = v.execute.contract_addr;   // wasm.execute on a token contract
            return '{\n' + Object.keys(v).map(k => pad + '  "' + esc(k) + '": ' + render(v[k], indent + 1, (k === 'msg' || k === 'execute' || k === 'wasm') ? ctx : ctx, k)).join(',\n') + '\n' + pad + '}';
        };
        const body = (card.rawMsgs || []).map((m, i) => '<div class="text-[9px] text-gray-500 mt-1">message #' + (i + 1) + '</div><pre class="font-mono text-[10px] leading-4 whitespace-pre-wrap text-gray-300">' + render(deepDecode(m), 0, null, null) + '</pre>').join('');
        return '<details class="mt-1.5 rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px]"><summary class="cursor-pointer text-[10px] uppercase tracking-wider font-bold text-gray-300"><i class="fas fa-code mr-1"></i>Decoded messages <span class="normal-case font-normal text-gray-500">— the raw JSON with every address named and every amount in human units</span></summary>' + body + '<div class="mt-1 text-[9px] text-gray-500">Green = the registries know it. Amber = they do not — that is the part to check. Amounts use catalog decimals; a cw20 call\'s amount is in the token being called.</div></details>';
    }
    const ledgerHtml = (lg, card) => {
        const col = { pass: 'text-emerald-300', soft: 'text-amber-300', hard: 'text-orange-300' };
        const chip = (l) => '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded ' + ({ pass: 'bg-emerald-500/20 text-emerald-300', soft: 'bg-amber-500/20 text-amber-300', hard: 'bg-orange-500/25 text-orange-200' }[l]) + '">' + ({ pass: 'PASS', soft: 'NEEDS VERIFICATION', hard: 'UNKNOWN — VERIFY' }[l]) + '</span>';
        const unknowns = []; for (const a of lg.actions) for (const p of a.to) if (p.level !== 'pass' && !unknowns.some(u => u.addr === p.addr)) unknowns.push(p);
        return '<div class="mt-2 rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[11px]"><div class="font-bold text-[10px] uppercase tracking-wider mb-1 text-gray-300"><i class="fas fa-list-check mr-1"></i>Action ledger · ' + lg.actions.length + ' action' + (lg.actions.length === 1 ? '' : 's') + ' · ' + chip(lg.worst) + (lg.trustedLoaded ? '' : ' <span class="text-gray-500">(trust product not published yet — only live registries used)</span>') + '</div>' +
            lg.actions.map(a => '<div class="py-1 border-t border-white/5"><div class="flex items-center gap-2 flex-wrap"><span class="font-mono text-gray-500">#' + a.n + '</span><span class="text-gray-200 font-semibold">' + esc(a.kind) + '</span>' + chip(a.level) + '</div>' +
                '<div class="text-gray-400 mt-0.5">from <span class="text-gray-200">' + esc(a.from) + '</span>' + (a.to.length ? ' → ' + a.to.map(p => '<span class="' + col[p.level] + '" title="' + esc(p.why) + '">' + esc(p.name) + (p.role ? ' <span class="text-gray-600">[' + esc(p.role) + ']</span>' : '') + '</span> <span class="font-mono text-gray-600">' + p.addr.slice(0, 10) + '…' + p.addr.slice(-6) + '</span>').join(', ') : '') + '</div>' +
                (a.amounts.length ? '<div class="text-gray-300 mt-0.5 font-mono">' + a.amounts.map(esc).join(' · ') + '</div>' : '') +
                (a.notes.length ? '<div class="text-amber-300 mt-0.5">' + a.notes.map(esc).join(' · ') + '</div>' : '') + '</div>').join('') +
            (unknowns.length ? '<div class="mt-1.5 rounded border border-amber-500/30 bg-amber-500/[0.06] px-2 py-1.5 text-amber-200">' + unknowns.length + ' address' + (unknowns.length === 1 ? '' : 'es') + ' need' + (unknowns.length === 1 ? 's' : '') + ' verification. This may or may not be a problem — it only means no registry vouches for ' + (unknowns.length === 1 ? 'it' : 'them') + ' yet. Check on chain, or ask the team to verify and add to the catalog.' +
                '<div class="mt-1 flex items-center gap-2 flex-wrap">' + unknowns.map(u => '<a class="text-[10px] text-cyan-300 hover:underline" target="_blank" rel="noopener" href="https://chainsco.pe/terra2/address/' + u.addr + '">' + u.addr.slice(0, 10) + '…' + u.addr.slice(-6) + ' on chain ↗</a>').join('') + '<button type="button" class="pulse-pill" data-act="reqverify" data-key="' + esc(cardKey(card)) + '"><i class="fas fa-paper-plane mr-1"></i>Request verification</button></div></div>' : '') +
            (lg._R && card ? decodedHtml(card, lg._R) : '') +
            '<div class="mt-1 text-[9px] text-gray-500">Names come from the address catalog (trust register, member catalog, live pools). Amounts use catalog decimals. A pass means every counterparty is known — not that the proposal is wise.</div></div>';
    };

    window.PropAudit = {
        configure(o) { Object.assign(deps, o || {}); _resolvers = null; },
        deepDecode, msgShape, shapeCompare, precedentOf, resolvers, ledgerOf, ledgerHtml, decodedHtml, fmtAmt,
    };
})();
