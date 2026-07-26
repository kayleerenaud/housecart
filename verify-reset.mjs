/* The clean-slate reset, and no duplicate household listings. */
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
await p.evaluate(()=>{
  houses['FERN1111']={code:'FERN1111',name:'Lake House',adminId:'u9',pending:[],payments:[],trips:[],pantry:[],
    members:[{id:'u9',name:'Dana'},{id:'u1',name:'Kaylee'}]};
  save(); render();
});

console.log('\n=== each household appears exactly once ===');
await p.click('[data-ref="me-avatar"]'); await p.waitForTimeout(500);
const names = await p.evaluate(()=>[...document.querySelectorAll('#tab-account .iname')].map(e=>e.textContent.trim()));
console.log('   rows on Account:', names.join(' | '));
const houseRows = await p.evaluate(()=>[...document.querySelectorAll('[data-ref="account-houses"] .iname')].map(e=>e.textContent.replace('current','').trim()));
ok(houseRows.length === 2, `two households, two rows (got ${houseRows.length})`);
ok(new Set(houseRows).size === houseRows.length, 'no household is listed twice');
ok(!names.some(n=>n==='Household'), 'the old duplicate "Household" row is gone');

console.log('\n=== the list says which ones are yours ===');
const meta = await p.evaluate(()=>[...document.querySelectorAll('[data-ref="account-houses"] .imeta')].map(e=>e.textContent.trim()));
meta.forEach(m=>console.log('   ', m));
ok(meta.some(m=>/you created it/.test(m)), 'one is marked "you created it"');
ok(meta.some(m=>/you're a member/.test(m) || m.includes("you’re a member") || /member/.test(m)), 'the other is marked as a membership');

console.log('\n=== reset needs confirming, then clears everything ===');
await p.click('[data-ref="reset-btn"]'); await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="reset-confirm-input"]'), 'reset asks for confirmation');
ok(await p.evaluate(()=>document.querySelector('[data-ref="reset-confirm-btn"]').hasAttribute('disabled')), 'the button starts disabled');
await p.fill('[data-ref="reset-confirm-input"]','nope'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>document.querySelector('[data-ref="reset-confirm-btn"]').hasAttribute('disabled')), 'wrong word stays blocked');
await p.fill('[data-ref="reset-confirm-input"]','reset'); await p.waitForTimeout(200);
ok(!(await p.evaluate(()=>document.querySelector('[data-ref="reset-confirm-btn"]').hasAttribute('disabled'))), '"reset" in any case unlocks it');
await p.click('[data-ref="reset-confirm-btn"]'); await p.waitForTimeout(2500);
ok(await p.evaluate(()=>Object.keys(houses).length===0), 'every household is gone');
ok(await p.evaluate(()=>me !== null), 'you stay signed in');
ok(await p.evaluate(()=>{ const h=JSON.parse(localStorage.getItem('hc:houses')||'{}'); return Object.keys(h).length===0; }),
   'the local cache is cleared too, so nothing comes back on reload');
ok(await p.isVisible('[data-ref="house-gate"]'), 'and you land on the create/join screen');

console.log('\n=== names are reusable afterwards ===');
await p.fill('[data-ref="new-house-input"]','BrooklynSisters');
await p.click('[data-ref="create-house-btn"]'); await p.waitForTimeout(600);
ok(await p.evaluate(()=>Object.keys(houses).length===1), 'a name used before the reset can be used again');

console.log(fails?`\n${fails} FAILED`:'\nALL RESET CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
