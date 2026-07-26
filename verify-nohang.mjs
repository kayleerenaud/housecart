/* The loading screen must always resolve — nobody watches a spinner forever. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const base = process.argv[2] || 'http://127.0.0.1:8123/index.html';
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});

console.log('\n=== a failed household query shows a reason, not a spinner ===');
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
// stub the sync layer so watchHouses reports permission-denied
await p.addInitScript(()=>{
  window.__stub = true;
  window.addEventListener('hc-sync-ready', () => {
    window.HC_SYNC.watchHouses = (uid, houses, onChange) => setTimeout(()=>onChange({code:'permission-denied',message:'Missing or insufficient permissions.'}), 200);
  }, {once:true});
});
await p.goto(base,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));
await p.waitForTimeout(1200);
const st = await p.evaluate(()=>({
  loading: !document.querySelector('#loading').classList.contains('hide'),
  gate: !document.querySelector('#housegate').classList.contains('hide'),
  err: (document.querySelector('[data-ref="gate-error"]')||{}).textContent || '',
  errShown: !(document.querySelector('[data-ref="gate-error"]')||{classList:{contains:()=>true}}).classList.contains('hide')
}));
console.log('   state:', JSON.stringify(st));
ok(!st.loading, 'the spinner is gone');
ok(st.gate, 'you land on the create/join screen instead of being stuck');
ok(st.errShown && st.err.length>0, `and it tells you why: "${st.err}"`);
await p.close();

console.log('\n=== a query that never answers times out ===');
const q=await b.newPage({viewport:{width:390,height:844}});
await q.addInitScript(()=>{
  window.addEventListener('hc-sync-ready', () => { window.HC_SYNC.watchHouses = () => {}; }, {once:true});
});
await q.goto(base,{waitUntil:'domcontentloaded'});
await q.waitForTimeout(2500);
await q.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));
await q.waitForTimeout(1000);
ok(await q.evaluate(()=>!document.querySelector('#loading').classList.contains('hide')), 'it waits while the server might still answer');
await q.waitForTimeout(10500);
const after = await q.evaluate(()=>({
  loading: !document.querySelector('#loading').classList.contains('hide'),
  gate: !document.querySelector('#housegate').classList.contains('hide'),
  err: (document.querySelector('[data-ref="gate-error"]')||{}).textContent || ''
}));
console.log('   after the watchdog:', JSON.stringify(after));
ok(!after.loading, 'but gives up after 10 seconds rather than spinning forever');
ok(after.gate && after.err.length>0, 'and explains itself');

console.log('\n=== a refused query falls back to the houses we know ===');
const sync = await (await fetch(base.replace(/index\.html.*/,'')+'sync.js')).text();
ok(/Fall back to/.test(sync) && /getDoc\(doc\(db,"houses",code\)\)/.test(sync),
   'sync.js re-reads known houses individually when the collection query fails');

console.log(fails?`\n${fails} FAILED`:'\nALL NO-HANG CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
