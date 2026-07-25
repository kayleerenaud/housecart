/* Regression tests for the money/logic defects the Fable audit surfaced. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'kaylee-r'}));
await p.fill('#new-house','Maple St'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{H().members.push({id:'u2',name:'Sam',venmo:'sam-o'},{id:'u3',name:'Priya',venmo:'priya-r'});save();render();});

console.log('\n=== M2: SALES TAX must not be discarded ===');
for(const [line,want] of [['TAX 5.45',5.45],['SALES TAX 4.37',4.37],['STATE TAX 1.10',1.10]]){
  const got = await p.evaluate(t=>{ parseReceipt(`GREEN VALLEY\nMILK 4.99\n${t}\nTOTAL 10.00`); return RCPT.tax; }, line);
  ok(Math.abs(got-want)<0.001, `"${line}" -> tax ${got}`);
}
const notItem = await p.evaluate(()=>{ parseReceipt("GREEN VALLEY\nMILK 4.99\nSALES TAX 4.37\nTOTAL 9.36");
  return LINES.some(l=>/tax/i.test(l.name)); });
ok(!notItem, 'the tax line is not also charged as a grocery item');

console.log('\n=== M1: Venmo direction ===');
const links = await p.evaluate(()=>[venmoLink('sam-o',10,'n','charge'), venmoLink('sam-o',10,'n','pay')]);
ok(/txn=charge/.test(links[0]), 'requesting money from someone uses txn=charge');
ok(/txn=pay/.test(links[1]),   'paying someone back uses txn=pay (was charging them — money would flow backwards)');

console.log('\n=== M4: zero-weight fallback must not leak between lines ===');
const leak = await p.evaluate(()=>{
  LINES = [
    {id:'a', name:'Solo', price:9.00, split:true, who:['u1']},
    {id:'b', name:'Shared', price:20.20, split:true, who:['u1','u2','u3']}
  ];
  RCPT = {tax:0,total:29.20,store:'X'};
  SPLIT_MODE='custom'; WEIGHTS={u1:0,u2:50,u3:50};
  return computeSplit().owed;
});
console.log('   owed:', JSON.stringify(leak));
ok(Math.abs(leak.u1 - 9.00) < 0.005, 'a line only u1 shares still charges u1 the whole $9.00');
ok(Math.abs(leak.u2 - 10.10) < 0.02 && Math.abs(leak.u3 - 10.10) < 0.02,
   'the 0%-weighted member is charged nothing on the shared line (fallback did not leak)');

console.log('\n=== cent-exactness still holds in both modes ===');
for(const mode of ['even','custom']){
  const r = await p.evaluate(m=>{
    SPLIT_MODE=m; WEIGHTS={u1:50,u2:30,u3:20};
    const s=computeSplit();
    return {sum:Object.values(s.owed).reduce((a,v)=>a+v,0)+s.mine+s.taxMine, grand:s.grand};
  }, mode);
  ok(Math.abs(r.sum-r.grand)<0.005, `${mode}: parts (${r.sum.toFixed(2)}) == total (${r.grand.toFixed(2)})`);
}

console.log('\n=== XSS: a hostile display name must not execute ===');
const xss = await p.evaluate(()=>{
  window.__pwned = false;
  H().pending = [{id:'evil', name:'<img src=x onerror="window.__pwned=true">', email:'e@x.com', pic:'', at:Date.now()}];
  H().adminId = me.id; renderApprovals();
  return new Promise(r=>setTimeout(()=>r({pwned:window.__pwned, html:document.querySelector('[data-ref="join-requests"]').innerHTML.includes('&lt;img')}),300));
});
ok(!xss.pwned, 'injected script in a join-request name does not execute');
ok(xss.html, '...it is rendered as escaped text instead');

console.log('\n=== editable price ===');
await p.evaluate(()=>{ LINES=[{id:'z',name:'Eggs',price:2.99,split:true,who:['u1','u2','u3']}]; RCPT={tax:0,total:12.99,store:'X'}; SPLIT_MODE='even'; renderLines(); });
await p.evaluate(()=>setPrice('z','12.99'));
ok(await p.evaluate(()=>Math.abs(LINES[0].price-12.99)<0.001), 'a misread price can be corrected by hand');

console.log(fails?`\n${fails} FAILED`:'\nALL MONEY CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
