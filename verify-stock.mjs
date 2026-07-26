/* Putting receipt items into the pantry — manually, item by item. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(400);
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));
await p.waitForTimeout(300);
await p.fill('[data-ref="new-house-input"]','BrooklynSisters');
await p.click('[data-ref="create-house-btn"]'); await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{ H().members.push({id:'u2',name:'Sam',venmo:'s'});
  // one item already in the pantry, and empty, so we can prove it gets restocked
  H().pantry.push({id:'existing',name:'Sourdough Loaf',brand:'',size:'',img:'',by:'K',at:Date.now(),stock:'empty',cat:'pantry'});
  save(); render(); });

await p.click('[data-ref="tab-receipt-btn"]');
await p.setInputFiles('#receipt-file','/tmp/receipt.png');
await p.waitForSelector('#receipt-edit:not(.hide)',{timeout:120000});
await p.waitForTimeout(400);

console.log('\n=== the step exists and starts empty ===');
ok(await p.isVisible('[data-ref="stock-card"]'), 'the receipt screen offers "Add to the pantry"');
ok((await p.textContent('#stock-count')).trim()==='none', 'nothing is ticked by default — it is opt-in');
const rows = await p.evaluate(()=>document.querySelectorAll('[data-ref="stock-list"] .line').length);
ok(rows >= 10, `every receipt line is offered (${rows})`);
ok(/already in the pantry/.test(await p.textContent('[data-ref="stock-list"]')), 'an item you already stock is flagged as such');
await p.screenshot({path:'/tmp/stock.png', fullPage:true});

console.log('\n=== ticking a few, then saving ===');
const picked = await p.evaluate(()=>{
  const want = LINES.filter(l=>/MILK|SOURDOUGH|OLIVE OIL/i.test(l.name));
  want.forEach(l=>toggleStock(l.id));
  return want.map(l=>l.name);
});
console.log('   ticked:', picked.join(' | '));
ok((await p.textContent('#stock-count')).includes(String(picked.length)), `the count reflects what you ticked (${picked.length})`);
const before = await p.evaluate(()=>H().pantry.length);
const expect = await p.evaluate(()=>{
  let add=0, refill=0;
  LINES.filter(l=>STOCK_PICK.has(l.id)).forEach(l=> pantryMatch(l.name) ? refill++ : add++);
  return {add, refill};
});
console.log(`   expecting ${expect.add} new, ${expect.refill} restocked`);
await p.click('[data-ref="settle-btn"]'); await p.waitForTimeout(1200);
const after = await p.evaluate(()=>({n:H().pantry.length, items:H().pantry.map(i=>[i.name,i.stock,i.cat])}));
console.log('   pantry now:'); after.items.slice(0,6).forEach(i=>console.log('     ', i.join(' · ')));
ok(after.n === before + expect.add, `${expect.add} new items added and the existing one reused, not duplicated (${before} -> ${after.n})`);
ok(after.items.some(([n])=>n==='Organic Whole Milk'), 'names are tidied from receipt SHOUTING to Title Case');
ok(after.items.find(([n])=>n==='Sourdough Loaf')[1] === 'full', 'the item already in the pantry was restocked, not duplicated');
ok(after.items.find(([n])=>n==='Organic Whole Milk')[2] === 'dairy', 'categories are guessed');
ok(after.items.every(([,st])=>['full','half','empty'].includes(st)), 'everything has a valid stock level');

console.log('\n=== unticked items are NOT added ===');
ok(!after.items.some(([n])=>/Trash Bags/i.test(n)), 'a line you left unticked stays out of the pantry');

console.log('\n=== discarding a receipt drops the selection ===');
await p.click('[data-ref="tab-receipt-btn"]');
await p.setInputFiles('#receipt-file','/tmp/receipt.png');
await p.waitForSelector('#receipt-edit:not(.hide)',{timeout:120000});
await p.evaluate(()=>{ toggleStock(LINES[0].id); });
p.once('dialog', d=>d.accept());
await p.click('[data-ref="discard-btn"]'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>STOCK_PICK.size===0), 'the pantry selection is cleared with the receipt');

console.log(fails?`\n${fails} FAILED`:'\nALL STOCK CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
