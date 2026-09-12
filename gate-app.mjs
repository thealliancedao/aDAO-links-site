// gate-app.mjs — jsdom gate for app.html (Ally v2). Runs the page's own script against the COMMITTED products
// (fresh tla-core / dao-originations pull on disk) and asserts specific rows and values, never "something rendered".
//   node gate-app.mjs <path/to/app.html> <path/to/tla-core-main> <path/to/dao-originations-main>
import fs from 'node:fs'; import path from 'node:path'; import { JSDOM } from 'jsdom';
const [,, APP='app.html', CORE_DIR='tla-core-main', DAO_DIR='dao-originations-main', NFTC_DIR='nft-collections-main'] = process.argv;   // 2.0.3: aDAO products come from nft-collections/adao/
const html = fs.readFileSync(APP, 'utf8');
const CORE='https://raw.githubusercontent.com/thealliancedao/tla-core/main/', DAO='https://raw.githubusercontent.com/thealliancedao/dao-originations/main/', NFTC='https://raw.githubusercontent.com/thealliancedao/nft-collections/main/';
let pass=0, fail=0; const ok=(c,msg,extra)=>{if(c){pass++;console.log('  ✓',msg)}else{fail++;console.log('  ✗',msg,extra!=null?'→ '+String(extra).slice(0,200):'')}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fetched=[];
function fakeFetch(u){const url=String(u).split('?')[0];let file=null;if(url.startsWith(CORE))file=path.join(CORE_DIR,url.slice(CORE.length));else if(url.startsWith(DAO))file=path.join(DAO_DIR,url.slice(DAO.length));else if(url.startsWith(NFTC))file=path.join(NFTC_DIR,url.slice(NFTC.length));fetched.push(url);
  if(!file||!fs.existsSync(file))return Promise.resolve({ok:false,status:404,json:()=>Promise.reject(new Error('404'))});
  const txt=fs.readFileSync(file,'utf8');return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(JSON.parse(txt))})}
const W='terra1hr8zsfpch47qygc96c8e6rzkd2t7mafqx77ulw';   // owner wallet — a TLA participant + aDAO staker in the fixtures
async function boot(opts={}){
  const dom=new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/,'<script></script>').replace(/<link[^>]+>/g,''),{url:'https://thealliancedao.com/app.html'+(opts.hash||''),runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window; w.fetch=fakeFetch; w.scrollTo=()=>{}; w.matchMedia=()=>({matches:false}); w.navigator.serviceWorker=undefined;
  w.localStorage.clear(); if(opts.wallet)w.localStorage.setItem('tla:selected_wallet',opts.wallet); w.localStorage.setItem('ally:prefs',JSON.stringify(Object.assign({onboarded:true},opts.prefs||{})));
  const js=html.match(/<script>([\s\S]*?)<\/script>/)[1]; w.eval(js);
  for(let i=0;i<40&&!(w.__ally&&w.__ally.D&&w.__ally.D._at&&w.document.getElementById('today').querySelector('.wrow'));i++)await sleep(150);
  await sleep(300); return dom;
}
const text=el=>el?el.textContent.replace(/\s+/g,' ').trim():'';
const rowsOf=(doc,rootId)=>[...doc.getElementById(rootId).querySelectorAll('.lg')].map(r=>({label:text(r.querySelector('.t')),value:text(r.querySelector('.v')),el:r}));
const rowBy=(rows,label)=>rows.find(r=>r.label===label);

/* ---- expected values, computed here from the same fixtures (independent of the page's code) ---- */
const J=p=>JSON.parse(fs.readFileSync(path.join(p.startsWith('adao/')?NFTC_DIR:CORE_DIR,p),'utf8'));
const now=Date.now(); const winStart=d=>now-d*864e5;
const cat=J('token-catalog/snapshots/current.json').tokens, nap=J('network-and-prices/current.json').token_prices;
const priceOf=s=>{const k=Object.keys(nap).find(x=>x.toLowerCase()===String(s).toLowerCase()||(nap[x].canonical||'').toLowerCase()===String(s).toLowerCase());return k?nap[k].final_price_usd:null};
const dinfo=den=>{const d=den.includes(':')?den.split(':').slice(1).join(':'):den;const t=cat.find(x=>x.denom===d);if(t){const e=t.effective||{},g=t.discovered||{};return[e.symbol||g.symbol||null,e.decimals??g.decimals??6]}return d==='uluna'?['LUNA',6]:[null,6]};
const bribeEv=['09','08'].flatMap(m=>{try{return J('tla-voting/events/bribes/2026/'+m+'.json')}catch(e){return[]}});
const expBribes=d=>{const sel=bribeEv.filter(e=>new Date(e.timestamp).getTime()>=winStart(d));let usd=0;sel.forEach(e=>(e.coins||[]).forEach(c=>{const [s,dec]=dinfo(c.denom);const px=s?priceOf(s):null;if(px!=null)usd+=Number(c.amount)/10**dec*px}));return{n:sel.length,usd}};
const sales=J('adao/snapshots/sales-enriched.json').sales; const expSales=d=>sales.filter(s=>new Date(s.timestamp).getTime()>=winStart(d)).length;
const claims=J('adao/snapshots/pending-claims.json').entries; const expUnstaked=d=>claims.filter(u=>new Date(u.unstaked_at).getTime()>=winStart(d)).length;
const fh=J('adao/snapshots/floor-history.json').rows; const floorNow=fh[fh.length-1].per_tier.base.listing_floor_usd;
const T=J('member-data/tla-snapshot/current.json'); const M=J('member-data/participants/current.json').members.find(m=>m.wallet===W);
const expClaimable=(M.summary.total_pending_rewards_usd||0)+((M.pending_rebase&&M.pending_rebase.usd_value)||0)+(M.summary.total_pending_bribes_usd||0);
const usd=(n,d)=>{const a=Math.abs(n);if(d==null)d=a<1?4:a<100?2:0;return (n<0?'-':'')+'$'+a.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})};
const props=['adao','lion-dao','pixel-lions'].map(d=>JSON.parse(fs.readFileSync(path.join(DAO_DIR,d,'governance/proposals.json'),'utf8')));
const allProps=props.flatMap(P=>Object.values(P.proposals)); const nOpen=allProps.filter(p=>p.status==='Open'||p.live).length, nVeto=allProps.filter(p=>/veto timelock/i.test(p.status)).length;
const nExec=d=>allProps.filter(p=>p.status==='Executed'&&p.expiration&&new Date(p.expiration.at_time_iso).getTime()>=winStart(d)).length; const nPassed=allProps.filter(p=>p.status==='Passed').length;
const nfts=J('adao/snapshots/nfts.json').records; const bundle=J('adao/snapshots/explorer-bundle.json'); const brow={};bundle.rows.forEach(r=>{brow[String(r[0])]=r});
const mine=nfts.filter(r=>r.real_owner===W||r.owner===W).map(r=>({id:String(r.id),rank:brow[String(r.id)]?(brow[String(r.id)][9]??brow[String(r.id)][7]):null})).sort((a,b)=>(a.rank??1e9)-(b.rank??1e9));
const summary=J('adao/snapshots/summary.json'); const myCount=summary.per_real_owner_counts[W];

console.log('\n== A. Today · no wallet · 7d window ==');
{ const dom=await boot(); const doc=dom.window.document;
  ok(doc.getElementById('today').querySelector('.wrow')!=null,'window row painted');
  const wb=[...doc.querySelectorAll('#today [data-win]')]; ok(wb.length===3&&wb.map(b=>b.textContent).join()==='24h,7d,14d','24h · 7d · 14d control');
  ok(wb.find(b=>b.classList.contains('on')).textContent==='7d','7d is the default window');
  ok(doc.querySelector('#today [data-pick]')!=null,'no wallet → "Pick your wallet" affordance');
  const rows=rowsOf(doc,'today'); console.log('    rows:',rows.map(r=>r.label+' = '+r.value).join(' | '));
  ok(rows.every(r=>r.value&&!/^\$?0(\.0+)?%?$/.test(r.value)),'no zero rows rendered');
  ok(rows.every(r=>r.el.querySelector('.ic')&&r.el.querySelector('.ch')),'every row = icon · label · value · chevron');
  const fl=rowBy(rows,'Floor'); ok(fl&&fl.value.startsWith(usd(floorNow,0)),'Floor row = '+usd(floorNow,0),fl&&fl.value);
  const eb=expBribes(7); const br=rowBy(rows,'Bribes added'); ok(!!br===(eb.n>0),'Bribes added row present iff events in window ('+eb.n+')'); if(br)ok(br.value.startsWith(usd(eb.usd,0)),'Bribes added = '+usd(eb.usd,0)+' from the live event stream',br.value);
  const pv=rowBy(rows,'Props in voting'); ok((pv?+pv.value:0)===nOpen,'Props in voting = '+nOpen,pv&&pv.value);
  const pvl=rowBy(rows,'Props in veto lock'); ok((pvl?+pvl.value:0)===nVeto,'Props in veto lock = '+nVeto,pvl&&pvl.value);
  const pe=rowBy(rows,'Props executed'); ok((pe?+pe.value:0)===nExec(7),'Props executed (7d) = '+nExec(7),pe&&pe.value);
  const pp=rowBy(rows,'Props passed · not executed'); ok((pp?+pp.value:0)===nPassed,'Props passed · not executed = '+nPassed,pp&&pp.value);
  ok(rowBy(rows,'Props in veto lock')==null||!/Vetoed/.test((()=>{rowBy(rows,'Props in veto lock').el.click();const t=text(doc.getElementById('sheet-c'));doc.querySelector('#sheet-c [data-x]').click();return t})()),'veto-lock sheet never lists a Vetoed proposal');
  const sl=rowBy(rows,'Sales'); ok((sl?parseInt(sl.value):0)===expSales(7),'Sales (7d) = '+expSales(7)+(expSales(7)?'':' → row hidden'),sl&&sl.value);
  ok(rowBy(rows,'Rewards claimable')==null&&rowBy(rows,'Locks unlocked')==null,'wallet-only rows absent without a wallet');
  ok(rowBy(rows,'Avg deposit APR')!=null&&/%/.test(rowBy(rows,'Avg deposit APR').value),'Avg deposit APR row renders a percentage');
  ok(rowBy(rows,'LUNA')!=null&&rowBy(rows,'LUNA').value.startsWith(usd(nap.LUNA.final_price_usd,4)),'LUNA row = '+usd(nap.LUNA.final_price_usd,4));
  /* first screen: the needs-you + position rows fit on a phone — count rows above the TLA section */
  const secs=[...doc.querySelectorAll('#today .sec')].map(s=>text(s.querySelector('span'))); ok(secs[0]==='Needs you'||secs[0]==='TLA','sections in order (needs you → position → TLA → market)',secs.join('>'));
  /* sheet: tap Bribes added → per-event rows */
  if(br){br.el.click();await sleep(50);const sc=doc.getElementById('sheet-c');ok(doc.getElementById('sheet').classList.contains('on'),'tap → sheet opens');ok(sc.querySelectorAll('.li').length===Math.min(40,eb.n),'bribes sheet lists '+Math.min(40,eb.n)+' events',sc.querySelectorAll('.li').length);ok(/event stream/.test(text(sc)),'bribes sheet names its source (event stream, not the harvest)');sc.querySelector('[data-x]').click()}
  /* window → 24h reshapes */
  const b24=wb.find(b=>b.textContent==='24h'); b24.click(); await sleep(900);
  const r24=rowsOf(doc,'today'); const eb1=expBribes(1); const br1=rowBy(r24,'Bribes added');
  ok(!!br1===(eb1.n>0),'24h: Bribes added present iff 24h events ('+eb1.n+')'); if(br1)ok(br1.value.startsWith(usd(eb1.usd,0)),'24h: Bribes added = '+usd(eb1.usd,0),br1.value);
  ok(JSON.parse(dom.window.localStorage.getItem('ally:prefs')).win==='24h','window choice persisted on device');
  const b14=[...doc.querySelectorAll('#today [data-win]')].find(b=>b.textContent==='14d'); b14.click(); await sleep(900);
  const r14=rowsOf(doc,'today'); const sl14=rowBy(r14,'Sales'); ok((sl14?parseInt(sl14.value):0)===expSales(14),'14d: Sales = '+expSales(14),sl14&&sl14.value);
  const pe14=rowBy(r14,'Props executed'); ok((pe14?+pe14.value:0)===nExec(14),'14d: Props executed = '+nExec(14),pe14&&pe14.value);
  const nl14=rowBy(r14,'New listings'); const lfs=J('adao/snapshots/listing-first-seen.json').entries; const expNl=Object.values(lfs).filter(v=>new Date(v.first_seen_at).getTime()>=winStart(14)).length; ok((nl14?+nl14.value:0)===expNl,'14d: New listings = '+expNl,nl14&&nl14.value);
  ok(doc.querySelector('.tab[data-v="today"]')!=null&&doc.querySelectorAll('.tab').length===5,'five tabs: '+[...doc.querySelectorAll('.tab')].map(t=>t.textContent.trim()).join(' · '));
  ok(text(doc.getElementById('page-rev')).includes('2.0.3'),'#page-rev carries REV');
  { const rules=[...doc.querySelector('style').sheet.cssRules]; const root=rules.find(r=>r.selectorText===':root'); ok(root&&/--bg:\s*#0a0b0f/.test(root.cssText),':root theme variables parse (2.0/2.0.1 shipped a literal <style> line that swallowed them → white body)',rules[0]&&rules[0].cssText.slice(0,60)); ok(rules[0].selectorText===':root','first rule is :root, nothing before it'); }
  { const w=dom.window; const lg=doc.querySelector('#today .lg'); ok(lg&&w.getComputedStyle(lg).display==='flex','v2 stylesheet is live: .lg is a flex row (2.0 shipped it outside </style>)',lg&&w.getComputedStyle(lg).display); ok(w.getComputedStyle(doc.querySelector('#today .sec')).textTransform==='uppercase','section headers styled'); ok(doc.querySelector('style').sheet.cssRules.length>170,'stylesheet parsed past the v1 rules ('+doc.querySelector('style').sheet.cssRules.length+' rules)'); }
}

console.log('\n== B. Today · owner wallet · 7d ==');
{ const dom=await boot({wallet:W}); const doc=dom.window.document; const rows=rowsOf(doc,'today'); console.log('    rows:',rows.map(r=>r.label+' = '+r.value).join(' | '));
  const rc=rowBy(rows,'Rewards claimable'); ok(rc&&rc.value===usd(expClaimable),'Rewards claimable = '+usd(expClaimable),rc&&rc.value);
  rc.el.click(); await sleep(50); const sc=doc.getElementById('sheet-c'); const st=text(sc);
  ok(/Deposit rewards/.test(st)&&/Rebase/.test(st)&&/Vote rewards/.test(st)&&/LUNA staking/.test(st)&&/DAO staking/.test(st),'claimable sheet: deposit · rebase · vote · LUNA staking · DAO staking');
  ok(/not captured yet/.test(st),'uncaptured legs are labeled null, not zero'); ok(st.includes(usd(M.pending_rebase.usd_value)),'rebase leg = '+usd(M.pending_rebase.usd_value)); sc.querySelector('[data-x]').click();
  const lu=rowBy(rows,'Locks unlocked'); const expUnl=M.locks.filter(l=>!l.is_auto_max_locked&&l.end!=='permanent'&&l.end_period!=null&&l.end_period<T.epoch.currentEpoch).length;
  ok((lu?+lu.value:0)===expUnl,'Locks unlocked = '+expUnl,lu&&lu.value); if(lu){lu.el.click();await sleep(50);ok(/#1319/.test(text(sc))&&/E197/.test(text(sc)),'lock sheet names #1319 (E197)');sc.querySelector('[data-x]').click()}
  const ba=rowBy(rows,'Backing added · your NFTs'); ok(ba!=null&&/^\$/.test(ba.value),'Backing added row (USD at today\'s price)',ba&&ba.value);
  if(ba){ba.el.click();await sleep(50);ok(text(sc).includes(String(myCount)),'backing sheet uses the wallet\'s unbroken count ('+myCount+')');sc.querySelector('[data-x]').click()}
  const who=text(doc.querySelector('#today .who')); ok(/VP/.test(who)&&/NFT/.test(who),'header strip: total · VP · NFTs',who);
  const needN=+(doc.querySelector('.tab[data-v="today"] b.n')||{textContent:'0'}).textContent; const needRows=[...doc.querySelectorAll('#today .lg.need')].length;
  ok(needN===needRows,'badge = rows that need you ('+needRows+')',needN);
  /* mark as seen → NEW proposal chips clear */
  doc.getElementById('seen').click(); await sleep(50); ok(dom.window.localStorage.getItem('ally:app:snap')!=null,'"Mark all as seen" writes the device snapshot');
}

console.log('\n== C. NFTs · aDAO · 14d ==');
{ const dom=await boot({wallet:W,prefs:{win:'14d'},hash:'#nfts'}); const doc=dom.window.document; await sleep(400);
  const secs=[...doc.querySelectorAll('#nfts .sec')].map(s=>text(s.querySelector('span'))); console.log('    sections:',secs.join(' · '));
  const cols=[...doc.querySelectorAll('#nfts [data-col]')].map(b=>b.textContent); ok(cols.join()==='aDAO,Pixel Lions,TLA Locks','collection switcher aDAO · Pixel Lions · TLA Locks');
  const cnt=n=>{const s=[...doc.querySelectorAll('#nfts .sec')].find(x=>text(x.querySelector('span'))===n);return s?+text(s.querySelector('.pill')):0};
  ok(cnt('Sales')===expSales(14),'Sales section = '+expSales(14),cnt('Sales'));
  const stakeN=expUnstaked(14); ok(cnt('Stake changes')>=stakeN,'Stake changes ≥ '+stakeN+' unstakes from pending-claims',cnt('Stake changes'));
  const sl=[...doc.querySelectorAll('#nfts .li')].find(l=>/to unlock|claimable|released/.test(text(l))); ok(sl!=null,'unstake rows carry a countdown / claimable state',sl&&text(sl));
  ok(secs.includes('Listings')===(Object.values(J('adao/snapshots/listing-first-seen.json').entries).some(v=>new Date(v.first_seen_at).getTime()>=winStart(14))),'Listings section present iff a listing was first seen in 14d');
  const saleRow=[...doc.querySelectorAll('#nfts .li')].find(l=>/→/.test(text(l))&&/Atrium|BBL|Boost/.test(text(l))); if(expSales(14))ok(saleRow&&/vs prior|first sale/.test(text(saleRow)),'sale row: who → who + Δ vs that token\'s prior sale',saleRow&&text(saleRow));
  ok(doc.getElementById('load-mine')!=null,'"Your NFTs" hydrates nfts.json on demand (not on first paint)');
  ok(!fetched.some(u=>/nfts\.json$/.test(u)),'nfts.json NOT fetched before the tap');
  doc.getElementById('load-mine').click(); await sleep(1500);
  const my=[...doc.querySelectorAll('#mine-nfts .li')].map(l=>({id:l.getAttribute('data-nft'),r:text(l.querySelector('.r'))}));
  ok(my.length===3,'three of your NFTs shown',my.length); ok(my.map(x=>x.id).join()===mine.slice(0,3).map(x=>x.id).join(),'top three by BBL rank = #'+mine.slice(0,3).map(x=>x.id+' (rank '+x.rank+')').join(', #'),my.map(x=>x.id).join());
  ok(text(doc.querySelector('#mine-nfts [data-more-mine]')).includes(String(mine.length)),'"All '+mine.length+', by rank" expander');
  doc.querySelector('#mine-nfts [data-more-mine]').click(); await sleep(50); ok(doc.querySelectorAll('#mine-nfts .li').length===mine.length,'expanded to all '+mine.length);
  { const months=['09','08'].map(m=>{try{return J('adao/transfers/2026/'+m+'.json')}catch(e){return []}}).flat(); const last=months.map(e=>e.timestamp).sort().pop(); const stale=last&&Date.now()-new Date(last)>36*36e5; ok(/transfer ledger's last record is/.test(text(doc.getElementById('nfts')))===!!stale,'transfer-ledger stale label shown iff the last record is >36h old (last '+last+')'); }
  /* collection guard: the live 2026/09 aux file holds the owner's Pixel Lions bids (#1234/#899/#1576/#1787, no nft_contract) and one real aDAO delist (#4729) */
  const feed=text(doc.getElementById('nfts')); ok(!/#1234|#1576/.test(feed),'Pixel Lions bids in the aux stream do not appear under aDAO',feed.slice(0,200)); ok(/#4729/.test(feed),'the real aDAO delist #4729 still shows');
  ok(doc.getElementById('gear')!=null,'settings (Me) reachable from the top bar');
  /* collection switch → honest empty state */
  [...doc.querySelectorAll('#nfts [data-col]')].find(b=>b.textContent==='Pixel Lions').click(); await sleep(50);
  ok(/isn't captured yet/.test(text(doc.getElementById('nfts'))),'Pixel Lions → "not captured yet" (no phantom feed)');
  ok(JSON.parse(dom.window.localStorage.getItem('ally:prefs')).col==='pixel','collection choice remembered on device');
}

console.log('\n== D. TLA · DAO · Me ==');
{ const dom=await boot({wallet:W,hash:'#tla'}); const doc=dom.window.document; await sleep(300); const t=text(doc.getElementById('tla'));
  ok(t.includes('YOUR POSITION'),'TLA: your position hero first'); ok(t.includes(usd(T.totals.tla_tvl_usd,0)),'TLA: staked in TLA = '+usd(T.totals.tla_tvl_usd,0));
  ok(/YOUR VOTING/.test(t)&&/if you do nothing/.test(t),'TLA: vote optimizer (if-you-do-nothing per bucket) merged in');
  ok(doc.querySelectorAll('#tla [data-lock]').length===M.locks.length,'TLA: '+M.locks.length+' lock rows');
  dom.window.__ally.show('dao'); await sleep(100); const d=text(doc.getElementById('dao'));
  ok(doc.querySelectorAll('#dao .card[data-prop]').length>0,'DAO: proposal cards'); ok(new RegExp('In voting\\s*'+nOpen).test(d),'DAO: In voting = '+nOpen); if(nVeto)ok(/Veto timelock/.test(d),'DAO: veto timelock section');
  doc.querySelector('#dao .card[data-prop]').click(); await sleep(50); ok(doc.getElementById('sheet').classList.contains('on')&&/DAO DAO/.test(text(doc.getElementById('sheet-c'))),'DAO: card → proposal sheet with a DAO DAO link');
  dom.window.__ally.show('me'); await sleep(100); const me_=doc.getElementById('me');
  ok(me_.querySelectorAll('[data-t]').length===8&&me_.querySelectorAll('[data-t]:checked').length===5,'Me: 8 pickable tabs, 5 on'); ok(me_.querySelectorAll('[data-win]').length===3,'Me: default window setting');
  ok(text(me_).includes(usd(M.summary.voting_power_human>1e6?0:0,0))||/VP/.test(text(me_)),'Me: totals strip'); ok(/Ally 2\.0\.3/.test(text(me_)),'Me: footer carries the rev');
  /* v1 prefs on a device migrate */
  const dom2=await boot({prefs:{tabs:['home','portfolio','market','vote','more']}}); ok([...dom2.window.document.querySelectorAll('.tab')].map(x=>x.getAttribute('data-v')).join()==='today,nfts,tla,dao,me','v1 default tab set migrates to the v2 default');
  const dom3=await boot({prefs:{tabs:['home','nft','tla','vote','more']}}); ok([...dom3.window.document.querySelectorAll('.tab')].map(x=>x.getAttribute('data-v')).join()==='today,nfts,tla,vote,me','a custom v1 tab set keeps its choices under v2 names');
}
ok(!fetched.some(u=>u.includes('tla-core/main/nfts/adao')),'no fetch to the frozen tla-core/nfts/adao');ok(fetched.some(u=>u.includes('nft-collections/main/adao/snapshots/')),'aDAO products fetched from nft-collections/adao/');
console.log(`\n${pass}/${pass+fail} passed`); process.exit(fail?1:0);
