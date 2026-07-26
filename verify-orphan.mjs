/* The delete-order bug that stranded household names, and auto sign-in. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});

console.log('\n=== delete order: the name entry must go first ===');
const order = await p.evaluate(async()=>{
  const src = await (await fetch('sync.js')).text();
  const fn = src.slice(src.indexOf('async function deleteHouse'), src.indexOf('async function removeMember'));
  return { codesAt: fn.indexOf('houseCodes'), houseAt: fn.lastIndexOf('deleteDoc(doc(db,"houses",code))') };
});
ok(order.codesAt >= 0 && order.houseAt >= 0 && order.codesAt < order.houseAt,
   'houseCodes is deleted before the house document (every permission check reads the house)');

console.log('\n=== a name can be reused after its house is deleted ===');
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));
await p.waitForTimeout(300);
await p.fill('[data-ref="new-house-input"]','BrooklynGals');
await p.click('[data-ref="create-house-btn"]'); await p.waitForSelector('#app:not(.hide)');
await p.click('[data-ref="house-switcher"]'); await p.waitForTimeout(400);
await p.click('[data-ref="delete-house-btn"]'); await p.waitForTimeout(300);
await p.fill('[data-ref="delete-confirm-input"]','BrooklynGals');
await p.click('[data-ref="delete-confirm-btn"]'); await p.waitForTimeout(700);
ok(await p.evaluate(()=>Object.keys(houses).length===0), 'house deleted');
await p.fill('[data-ref="new-house-input"]','BrooklynGals');
await p.click('[data-ref="create-house-btn"]'); await p.waitForTimeout(600);
ok(await p.evaluate(()=>Object.keys(houses).length===1), 'the same name can be used again afterwards');
ok(!(await p.isVisible('[data-ref="name-error"]')), 'no "already taken" error');

console.log('\n=== Account lists every household ===');
await p.evaluate(()=>{
  houses['FERN2222']={code:'FERN2222',name:'Lake House',adminId:'u9',pending:[],payments:[],trips:[],pantry:[],
    members:[{id:'u9',name:'Dana'},{id:'u1',name:'Kaylee'}]};
  save(); render();
});
await p.click('[data-ref="me-avatar"]'); await p.waitForTimeout(500);
const listed = await p.evaluate(()=>[...document.querySelectorAll('[data-ref="account-houses"] .iname')].map(e=>e.textContent.replace(/current/,'').trim()));
console.log('   listed:', listed.join(' | '));
ok(listed.length===2, 'both households appear under Account');
ok(listed.some(t=>t.includes('Lake House')) && listed.some(t=>t.includes('BrooklynGals')), 'including one you did not create');
const meta = await p.evaluate(()=>[...document.querySelectorAll('[data-ref="account-houses"] .imeta')].map(e=>e.textContent));
ok(meta.some(t=>/you admin it/.test(t)), 'it says which ones you admin');
ok(meta.every(t=>/[A-Z]+\d{4}/.test(t)), 'and shows each code so you can share it');

console.log('\n=== auto sign-in ===');
const cfg = await p.evaluate(()=>({resolvedFlagExists: typeof authResolved !== 'undefined'}));
ok(cfg.resolvedFlagExists, 'the app tracks whether the session has resolved');
const html = await (await fetch(B.replace('?local=1',''))).text();
ok(/auto_select:\s*true/.test(html), 'Google One Tap is set to sign a returning user in automatically');
ok(/Signing you back in/.test(html), 'and a restoring state exists so the sign-in screen is not flashed');

console.log(fails?`\n${fails} FAILED`:'\nALL ORPHAN CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
