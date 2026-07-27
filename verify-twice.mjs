/* Nobody should ever be asked to sign in twice.

   The redirect flow hands the whole browser to Google and comes back on a
   fresh page load. If the app decides "not signed in" before Google's answer
   lands, it shows the sign-in button again — and the second tap is a second
   trip through Google. This test holds the handshake open and insists the app
   waits rather than re-asking. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const base = process.argv[2] || 'http://127.0.0.1:8123/index.html';
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});

const shot = p => p.evaluate(()=>({
  signin:  !document.querySelector('#signin').classList.contains('hide'),
  loading: !document.querySelector('#loading').classList.contains('hide'),
  app:     !document.querySelector('#app').classList.contains('hide'),
  sub:     document.querySelector('#loading .sub').textContent.trim()
}));

/* ── 1. coming back from Google, answer still in flight ────────────────── */
console.log('\n=== back from Google, handshake still in flight ===');
const p = await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.addInitScript(()=>{
  // pretend the previous page load handed us to Google
  try { sessionStorage.setItem('hc.redirecting', String(new Date().getTime())); } catch(e){}
  window.addEventListener('hc-sync-ready', () => {
    window.HC_SYNC.redirectPending  = () => true;
    window.HC_SYNC.clearRedirecting = () => {};
    // Google is slow today: three seconds before the answer lands
    window.HC_SYNC.completeRedirect = () => new Promise(res =>
      setTimeout(()=>res({id:'u9',name:'Kaylee',email:'k@x.com',pic:'',venmo:''}), 3000));
    // ...and the session listener reports "nobody" in the meantime, which is
    // exactly the moment the old code showed the sign-in screen again.
    window.HC_SYNC.onUser = cb => { setTimeout(()=>cb(null), 300); return ()=>{}; };
    window.HC_SYNC.watchHouses = (uid,houses,onChange) => setTimeout(()=>onChange(null), 200);
  }, {once:true});
});
await p.goto(base,{waitUntil:'domcontentloaded'});

for(const t of [800, 1600, 2600]){
  await p.waitForTimeout(t === 800 ? 800 : 800);
  const s = await shot(p);
  console.log(`   t≈${t}ms:`, JSON.stringify(s));
  ok(!s.signin, `at ${t}ms it is NOT asking you to sign in again`);
  ok(s.loading, `at ${t}ms it says what it's doing ("${s.sub}")`);
}
await p.waitForTimeout(2200);
const done = await shot(p);
console.log('   after Google answers:', JSON.stringify(done));
ok(!done.signin && !done.loading, 'once Google answers, you are through — one sign-in, not two');
await p.close();

/* ── 2. Google never comes back ────────────────────────────────────────── */
console.log('\n=== Google never answers: say so, do not spin forever ===');
const q = await b.newPage({viewport:{width:390,height:844}});
q.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await q.addInitScript(()=>{
  window.addEventListener('hc-sync-ready', () => {
    window.HC_SYNC.redirectPending  = () => true;
    window.HC_SYNC.clearRedirecting = () => {};
    window.HC_SYNC.completeRedirect = () => new Promise(()=>{});      // never resolves
    window.HC_SYNC.onUser = cb => { setTimeout(()=>cb(null), 300); return ()=>{}; };
  }, {once:true});
  // shrink the app's own 20s patience so the test doesn't take 20s
  window.__origSetTimeout = null;
});
await q.goto(base,{waitUntil:'domcontentloaded'});
await q.waitForTimeout(5000);
const mid = await shot(q);
console.log('   at 5s:', JSON.stringify(mid));
ok(!mid.signin && mid.loading, 'still waiting patiently at 5s (a phone on 3G is slow)');
await q.waitForTimeout(17000);
const end = await shot(q);
const note = await q.evaluate(()=>document.querySelector('#gsi-note').textContent.trim());
console.log('   at 22s:', JSON.stringify(end), '| note:', JSON.stringify(note));
ok(end.signin && !end.loading, 'eventually it gives you the button back');
ok(/didn.t come back|try again/i.test(note), `and explains why: "${note}"`);
await q.close();

/* ── 3. a stale marker from days ago must not wedge the app ────────────── */
console.log('\n=== a marker left over from an abandoned sign-in ===');
const r = await b.newPage({viewport:{width:390,height:844}});
r.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await r.addInitScript(()=>{
  try { localStorage.setItem('hc.redirecting', String(new Date().getTime() - 3*24*60*60*1000)); } catch(e){}
  window.addEventListener('hc-sync-ready', () => {
    window.HC_SYNC.onUser = cb => { setTimeout(()=>cb(null), 300); return ()=>{}; };
  }, {once:true});
});
await r.goto(base,{waitUntil:'domcontentloaded'});
await r.waitForTimeout(3000);
const stale = await shot(r);
console.log('   state:', JSON.stringify(stale));
ok(stale.signin && !stale.loading, 'a three-day-old marker is ignored — you get the sign-in button straight away');
await r.close();

await b.close();
console.log(fails ? `\n${fails} FAILED\n` : '\nall good\n');
process.exit(fails?1:0);
