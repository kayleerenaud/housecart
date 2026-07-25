import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?') ? '&' : '?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
// iPhone-ish standalone viewport
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});

const pageScrolls = () => p.evaluate(()=>({
  bodyOver: document.body.scrollHeight > document.body.clientHeight + 1,
  docOver:  document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
}));
let r = await pageScrolls();
ok(!r.bodyOver && !r.docOver, 'sign-in cover: the page itself does not scroll');

await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',venmo:'kaylee-r'}));
await p.waitForTimeout(300);
r = await pageScrolls();
ok(!r.bodyOver && !r.docOver, 'house gate: no page scroll');

await p.fill('#new-house','Maple St'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)'); await p.waitForTimeout(300);

for(const [tab,label] of [['tab-pantry-btn','Pantry'],['tab-receipt-btn','Receipt'],['tab-settle-btn','Settle'],['tab-spend-btn','Spending']]){
  await p.click(`[data-ref="${tab}"]`); await p.waitForTimeout(250);
  const s = await p.evaluate(()=>{
    const m=document.querySelector('#app>main');
    return { doc: document.documentElement.scrollHeight > document.documentElement.clientHeight+1,
             body: document.body.scrollHeight > document.body.clientHeight+1,
             mainScrolls: m.scrollHeight > m.clientHeight+1,
             appH: document.querySelector('#app').getBoundingClientRect().height,
             vh: window.innerHeight };
  });
  ok(!s.doc && !s.body, `${label}: page/body never scroll`);
  ok(Math.abs(s.appH - s.vh) < 2, `${label}: app shell is exactly one screen tall (${s.appH.toFixed(0)}px)`);
  console.log(`     ${label}: inner content scrolls? ${s.mainScrolls}`);
}

// header + tab bar must stay put while the middle scrolls
await p.click('[data-ref="tab-pantry-btn"]');
await p.evaluate(()=>{ for(let i=0;i<40;i++) H().pantry.push({id:'x'+i,name:'Item '+i,brand:'',size:'',img:'',by:'K',at:Date.now(),stock:'plenty',cat:'other'}); save(); render(); });
await p.waitForTimeout(300);
const before = await p.evaluate(()=>[document.querySelector('.topbar').getBoundingClientRect().top, document.querySelector('.tabbar').getBoundingClientRect().bottom]);
await p.evaluate(()=>{ document.querySelector('#app>main').scrollTop = 900; });
await p.waitForTimeout(300);
const after = await p.evaluate(()=>[document.querySelector('.topbar').getBoundingClientRect().top, document.querySelector('.tabbar').getBoundingClientRect().bottom]);
ok(Math.abs(before[0]-after[0])<1 && Math.abs(before[1]-after[1])<1, 'with 40 items: header and tab bar hold still while the list scrolls');
ok(await p.evaluate(()=>document.querySelector('#app>main').scrollTop>100), '...and the list genuinely scrolled');
await p.screenshot({path:'/tmp/fit-long.png'});

const mf = await p.evaluate(async()=>{ const r = await fetch('manifest.webmanifest'); return r.ok ? (await r.json()).display : 'MISSING'; });
ok(mf==='standalone', `manifest served with display:${mf}`);
console.log(fails?`\n${fails} FAILED`:'\nALL FIT CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
