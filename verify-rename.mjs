/* Renaming a household, including uniqueness and admin-only. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));
await p.waitForTimeout(300);
await p.fill('[data-ref="new-house-input"]','BrooklynSisters');
await p.click('[data-ref="create-house-btn"]'); await p.waitForSelector('#app:not(.hide)');
const code = await p.textContent('#house-code');

console.log('\n=== the admin can rename ===');
await p.click('[data-ref="house-switcher"]'); await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="rename-input"]'), 'the household sheet offers a rename field');
await p.fill('[data-ref="rename-input"]','BrooklynGals');
await p.click('[data-ref="rename-btn"]'); await p.waitForTimeout(600);
ok(await p.evaluate(()=>H().name==='BrooklynGals'), 'the household is renamed');
ok((await p.textContent('#house-code')) === code, `the code is unchanged (${code}) so nobody has to be re-invited`);
ok((await p.textContent('#house-name')).includes('BrooklynGals'), 'the header updates');

console.log('\n=== a taken name is refused ===');
await p.evaluate(()=>{
  houses['FERN1111']={code:'FERN1111',name:'Lake House',adminId:'u9',pending:[],payments:[],trips:[],pantry:[],
    members:[{id:'u9',name:'Dana'},{id:'u1',name:'Kaylee'}]};
  save(); render();
});
await p.click('[data-ref="house-switcher"]'); await p.waitForTimeout(400);
await p.fill('[data-ref="rename-input"]','Lake House');
await p.click('[data-ref="rename-btn"]'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>H().name==='BrooklynGals'), 'renaming to an existing name is refused');
ok(await p.isVisible('#hn-err'), '...with a visible reason');
console.log('   error:', (await p.textContent('#hn-err')).trim());
await p.evaluate(()=>closeSheet()); await p.waitForTimeout(300);

console.log('\n=== a non-admin cannot rename ===');
await p.evaluate(()=>{ cur='FERN1111'; save(); route(); });
await p.waitForTimeout(300);
await p.click('[data-ref="house-switcher"]'); await p.waitForTimeout(400);
ok(!(await p.isVisible('[data-ref="rename-input"]')), 'a member who did not create the house sees no rename field');

console.log(fails?`\n${fails} FAILED`:'\nALL RENAME CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
