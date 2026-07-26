/* No push, so anything needing a person must be unmissable on open. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'kaylee-r'}));
await p.waitForTimeout(300);
await p.fill('[data-ref="new-house-input"]','BrooklynSisters');
await p.click('[data-ref="create-house-btn"]'); await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{H().members.push({id:'u2',name:'Sam Okafor',venmo:'s'});save();render();});

console.log('\n=== nothing pending, nothing shouting ===');
ok(!(await p.isVisible('[data-ref="alerts"]')), 'with nothing to do, no "Needs you" card appears');
ok(await p.evaluate(()=>document.querySelectorAll('.tabbar .badge').length===0), 'and no tab badges');

console.log('\n=== a join request is unmissable ===');
await p.evaluate(()=>{H().pending=[{id:'u7',name:'Dana Ruiz',email:'d@x.com',pic:'',at:Date.now()}];save();render();});
await p.waitForTimeout(300);
ok(await p.isVisible('[data-ref="join-requests"]'), 'the approve/deny card appears');
ok(/Dana Ruiz/.test(await p.textContent('[data-ref="join-requests"]')), 'it names who is asking');
ok(!(await p.isVisible('[data-ref="alerts"]')), 'and it is NOT also repeated in the Needs-you strip');
const pantryBadge = await p.evaluate(()=>{const b=document.querySelector('[data-ref="tab-pantry-btn"] .badge');return b&&b.textContent;});
ok(pantryBadge === '1', `the Pantry tab carries a badge (${pantryBadge})`);
await p.screenshot({path:'/tmp/alerts.png'});

console.log('\n=== a receipt you owe on badges Settle ===');
await p.evaluate(()=>{
  H().pending=[];
  H().trips.unshift({id:'t1',at:Date.now(),payer:'u2',payerName:'Sam Okafor',store:'Green Valley Market',
    items:[{name:'Milk',price:30,split:true,who:['u1','u2']}],owed:{u1:15,u2:15},total:30,shared:30});
  save(); render();
});
await p.waitForTimeout(300);
const settleBadge = await p.evaluate(()=>{const b=document.querySelector('[data-ref="tab-settle-btn"] .badge');return b&&b.textContent;});
ok(settleBadge === '1', `Settle is badged (${settleBadge})`);
const t2 = await p.textContent('[data-ref="alerts"]');
console.log('   says:', t2.replace(/\s+/g,' ').replace('Needs you','').trim().slice(0,80));
ok(/1 new receipt/.test(t2) && /You owe \$15\.00/.test(t2), 'the card says how much you owe and who paid');

console.log('\n=== it clears once you have looked ===');
await p.click('[data-ref="alerts"] .alert'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>!document.querySelector('#tab-settle').classList.contains('hide')), 'tapping it takes you to Settle');
await p.evaluate(()=>go('pantry')); await p.waitForTimeout(400);
ok(await p.evaluate(()=>{const b=document.querySelector('[data-ref="tab-settle-btn"] .badge');return !b;}), 'the Settle badge clears after you visit it');
ok(!/new receipt/.test(await p.textContent('[data-ref="alerts"]').catch(()=>'')), 'and the receipt alert is gone');

console.log('\n=== your own receipts never badge you ===');
await p.evaluate(()=>{
  H().trips.unshift({id:'t2',at:Date.now()+1,payer:'u1',payerName:'Kaylee',store:'Corner Shop',
    items:[{name:'Eggs',price:10,split:true,who:['u1','u2']}],owed:{u1:5,u2:5},total:10,shared:10});
  save(); render();
});
await p.waitForTimeout(300);
ok(await p.evaluate(()=>!document.querySelector('[data-ref="tab-settle-btn"] .badge')), 'a receipt YOU added does not badge you');

console.log('\n=== a missing Venmo handle is surfaced ===');
await p.evaluate(()=>{H().members.find(m=>m.id===me.id).venmo='';me.venmo='';save();render();});
await p.waitForTimeout(300);
ok(/No Venmo handle yet/.test(await p.textContent('[data-ref="alerts"]')), 'it points out you cannot be paid back yet');

console.log(fails?`\n${fails} FAILED`:'\nALL ALERT CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
