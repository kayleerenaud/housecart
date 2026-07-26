/* Returning users land on the dashboard; the gate is for first-timers only. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});

console.log('\n=== a brand-new user still gets the gate ===');
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));
await p.waitForTimeout(300);
ok(await p.isVisible('[data-ref="house-gate"]'), 'someone with no households is asked to join or create one');
await p.fill('[data-ref="new-house-input"]','BrooklynGals');
await p.click('[data-ref="create-house-btn"]'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>!document.querySelector('#app').classList.contains('hide')), 'creating one drops you into the app');

console.log('\n=== a returning user goes straight to the dashboard ===');
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(500);
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));
await p.waitForTimeout(400);
ok(await p.evaluate(()=>!document.querySelector('#app').classList.contains('hide')), 'signing in again lands in the app');
ok(!(await p.isVisible('[data-ref="house-gate"]')), 'the join/create screen is NOT shown');
ok(await p.evaluate(()=>!document.querySelector('#tab-pantry').classList.contains('hide')), 'and it lands on the Pantry dashboard');

console.log('\n=== joining/creating another house lives in Account ===');
await p.click('[data-ref="me-avatar"]'); await p.waitForTimeout(300);
ok(await p.isVisible('[data-ref="account-add-house"]'), 'Account has a "Join or create a household" row');
await p.click('[data-ref="account-add-house"]'); await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="house-gate"]'), 'it opens the join/create screen');
ok(await p.isVisible('[data-ref="gate-cancel"]'), '...with a Cancel, so you are not trapped there');
await p.click('[data-ref="gate-cancel"]'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>!document.querySelector('#app').classList.contains('hide')), 'Cancel returns you to the app');
ok(!(await p.isVisible('[data-ref="house-gate"]')), 'and the gate closes');

console.log('\n=== delete confirmation tolerates autocorrect ===');
await p.click('[data-ref="house-switcher"]'); await p.waitForTimeout(400);
await p.click('[data-ref="delete-house-btn"]'); await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="delete-confirm-input"]'), 'a real typed field, not a browser prompt');
const dis = await p.evaluate(()=>document.querySelector('[data-ref="delete-confirm-btn"]').hasAttribute('disabled'));
ok(dis, 'the delete button starts disabled');
await p.fill('[data-ref="delete-confirm-input"]','Brooklyn Gals');   // what iOS autocorrect does
await p.waitForTimeout(250);
ok(!(await p.evaluate(()=>document.querySelector('[data-ref="delete-confirm-btn"]').hasAttribute('disabled'))),
   '"Brooklyn Gals" (autocorrect adds a space) is accepted as a match');
await p.fill('[data-ref="delete-confirm-input"]','brooklyngals'); await p.waitForTimeout(200);
ok(!(await p.evaluate(()=>document.querySelector('[data-ref="delete-confirm-btn"]').hasAttribute('disabled'))), 'lowercase matches too');
await p.fill('[data-ref="delete-confirm-input"]','something else'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>document.querySelector('[data-ref="delete-confirm-btn"]').hasAttribute('disabled')), 'a genuinely wrong name stays blocked');
await p.fill('[data-ref="delete-confirm-input"]','BrooklynGals'); await p.waitForTimeout(200);
await p.click('[data-ref="delete-confirm-btn"]'); await p.waitForTimeout(600);
ok(await p.evaluate(()=>Object.keys(houses).length===0), 'the exact name deletes it');

console.log(fails?`\n${fails} FAILED`:'\nALL LANDING CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
