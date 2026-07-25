import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?') ? '&' : '?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});

// ---- Kaylee (admin) creates the house ----
const p=await b.newPage({viewport:{width:420,height:900},deviceScaleFactor:2});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'kaylee@example.com',pic:'',venmo:'kaylee-r'}));
await p.fill('#new-house','Maple St'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
const code=await p.textContent('#house-code');
ok(await p.evaluate(()=>H().adminId==='u1'),'creator is recorded as the house admin ('+code+')');

// export the house so a "second device" can see the same house exists
const snapshot=await p.evaluate(()=>JSON.stringify({houses:JSON.parse(localStorage.getItem('hc:houses'))}));

// ---- Sam, separate browser context, requests to join ----
const ctx2=await b.newContext({viewport:{width:420,height:900},deviceScaleFactor:2});
const q=await ctx2.newPage();
q.on('pageerror',e=>{console.log('PAGEERR(sam):',e.message);fails++;});
await q.goto(B,{waitUntil:'networkidle'});
await q.evaluate(s=>{const d=JSON.parse(s); localStorage.setItem('hc:houses',JSON.stringify(d.houses));},snapshot);
await q.reload({waitUntil:'networkidle'});
await q.evaluate(()=>signIn({id:'u2',name:'Sam Okafor',email:'sam@example.com',pic:'',venmo:'sam-okafor'}));
await q.fill('[data-ref="house-code-input"]',code);
await q.click('[data-ref="join-house-btn"]'); await q.waitForTimeout(400);
ok(await q.isVisible('[data-ref="waiting-screen"]'),'requester lands on a waiting screen, NOT inside the house');
ok(!(await q.evaluate(()=>!document.querySelector('#app').classList.contains('hide'))),'requester cannot see the house contents');
console.log('  waiting copy:', (await q.textContent('#waiting-note')).replace(/\s+/g,' ').trim());
await q.click('[data-ref="recheck-btn"]'); await q.waitForTimeout(300);
ok(await q.isVisible('[data-ref="waiting-screen"]'),'re-check while still pending keeps them out');
await q.screenshot({path:'/tmp/a-waiting.png'});

// ---- admin sees the request ----
const pend=await q.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('hc:houses'))));
await p.evaluate(s=>{localStorage.setItem('hc:houses',s);},pend);
await p.reload({waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'kaylee@example.com',pic:'',venmo:'kaylee-r'}));
await p.waitForTimeout(500);
ok(await p.isVisible('[data-ref="join-requests"]'),'admin sees the pending request on opening the app');
console.log('  admin sees:', (await p.textContent('[data-ref="join-requests"] .iname')).trim());
await p.screenshot({path:'/tmp/a-admin.png'});

// ---- a NON-admin must not be able to approve ----
await p.evaluate(()=>{ const saved=me; me={id:'u9',name:'Rando',email:'r@x.com'}; window.__r=approveJoin(H().code,'u2'); me=saved; });
ok(await p.evaluate(()=>(H().pending||[]).some(r=>r.id==='u2')),'a non-admin calling approve is refused');

// ---- admin approves ----
await p.click('[data-ref="approve-btn"]'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>H().members.some(m=>m.id==='u2')),'admin approval adds them as a member');
ok(await p.evaluate(()=>(H().pending||[]).length===0),'request cleared from the queue');
ok(!(await p.isVisible('[data-ref="join-requests"]')),'requests card disappears when empty');

// ---- Sam re-checks and gets in ----
const after=await p.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('hc:houses'))));
await q.evaluate(s=>{localStorage.setItem('hc:houses',s);},after);
await q.reload({waitUntil:'networkidle'});
await q.evaluate(()=>signIn({id:'u2',name:'Sam Okafor',email:'sam@example.com',pic:'',venmo:'sam-okafor'}));
await q.waitForTimeout(500);
ok(await q.evaluate(()=>!document.querySelector('#app').classList.contains('hide')),'approved member walks straight into the house');
ok(await q.evaluate(()=>!isAdmin(H())),'the approved member is NOT an admin');

// ---- deny path ----
await p.evaluate(()=>{H().pending=[{id:'u3',name:'Priya Raman',email:'p@x.com',pic:'',at:Date.now()}];save();render();});
await p.waitForTimeout(300);
await p.click('[data-ref="deny-btn"]'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>(H().pending||[]).length===0 && !H().members.some(m=>m.id==='u3')),'deny removes the request without adding them');

// ---- legacy house with no adminId gets migrated ----
await p.evaluate(()=>{ houses['OLDIE1']={code:'OLDIE1',name:'Old House',pantry:[],trips:[],members:[{id:'u7',name:'First Person'},{id:'u8',name:'Second'}]}; save(); migrateHouses(); });
ok(await p.evaluate(()=>houses['OLDIE1'].adminId==='u7' && Array.isArray(houses['OLDIE1'].pending)),'pre-existing houses migrate: first member becomes admin');

console.log(fails? `\n${fails} FAILED` : '\nALL APPROVAL CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
