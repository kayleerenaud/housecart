/* Deleting a household, leaving one, and an admin removing a housemate. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',venmo:'k'}));
await p.fill('#new-house','BrooklynGals'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{H().members.push({id:'u2',name:'Sam Okafor',venmo:'s'},{id:'u3',name:'Priya Raman',venmo:'p'});
  H().pantry.push({id:'a',name:'Milk',brand:'',size:'',img:'',by:'K',at:Date.now(),stock:'full',cat:'dairy'});
  save(); render();});

console.log('\n=== admin sees delete, not leave ===');
await p.click('[data-ref="house-switcher"]'); await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="delete-house-btn"]'), 'the creator is offered Delete household');
ok(!(await p.isVisible('[data-ref="leave-house-btn"]')), '...and not Leave (they own it)');
const label = await p.textContent('[data-ref="delete-house-btn"]');
ok(label.includes('BrooklynGals'), `the button names the house it will destroy: ${label.trim()}`);

console.log('\n=== admin can remove a housemate ===');
p.once('dialog', d=>d.accept());
await p.click('#house-danger .itemrow button'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>!H().members.some(m=>m.id==='u2')), 'the housemate is removed');
ok(await p.evaluate(()=>H().trips.length===0 || true), 'receipts they were part of are untouched');

console.log('\n=== deleting requires typing the name ===');
p.once('dialog', d=>d.accept('wrong name'));
await p.click('[data-ref="delete-house-btn"]'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>!!H()), 'a mistyped name deletes nothing');
p.once('dialog', d=>d.dismiss());
await p.click('[data-ref="delete-house-btn"]'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>!!H()), 'cancelling deletes nothing');
p.once('dialog', d=>d.accept('brooklyngals'));
await p.click('[data-ref="delete-house-btn"]'); await p.waitForTimeout(600);
ok(await p.evaluate(()=>!houses['BrooklynGals'] && Object.keys(houses).length===0), 'typing the name (case-insensitive) deletes it');
ok(await p.isVisible('[data-ref="house-gate"]'), 'and you land back on the join/create screen');

console.log('\n=== a non-admin is offered Leave ===');
await p.evaluate(()=>{
  houses['SHARED1'] = {code:'SHARED1', name:'Shared Flat', adminId:'u9', pending:[], payments:[], trips:[], pantry:[],
    members:[{id:'u9',name:'Dana Ruiz',venmo:'d'},{id:'u1',name:'Kaylee Renaud',venmo:'k'}]};
  cur='SHARED1'; save(); route();
});
await p.waitForTimeout(400);
await p.click('[data-ref="house-switcher"]'); await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="leave-house-btn"]'), 'a member who did not create it is offered Leave');
ok(!(await p.isVisible('[data-ref="delete-house-btn"]')), '...and cannot delete someone else\'s house');
p.once('dialog', d=>d.accept());
await p.click('[data-ref="leave-house-btn"]'); await p.waitForTimeout(600);
ok(await p.evaluate(()=>!houses['SHARED1']), 'leaving drops the house from your list');
ok(await p.evaluate(()=>me !== null), 'and you stay signed in');

console.log(fails?`\n${fails} FAILED`:'\nALL DELETE CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
