/* Pantry stock/categories/lists + percentage splits. node verify-features.mjs <url> */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const B = process.argv[2] || 'http://127.0.0.1:8123/index.html';
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const log=(...a)=>console.log(...a);
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:420,height:900},deviceScaleFactor:2});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',venmo:'kaylee-r'}));
await p.fill('#new-house','Maple St'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{H().members.push({id:'u2',name:'Sam Okafor',venmo:'sam-okafor'},{id:'u3',name:'Priya Raman',venmo:'priya-raman'});save();render();});

console.log('\n=== PANTRY: categories ===');
await p.evaluate(()=>{
  [['Organic Spinach','produce'],['Whole Milk','dairy'],['Chicken Thighs','meat'],
   ['Ben & Jerry frozen yogurt','frozen'],['Paper Towels','household'],['Cold Brew Coffee','drinks'],
   ['Sourdough Bread','pantry'],['Weird Gadget','other']].forEach(([n])=>{
    H().pantry.push({id:'i'+n.replace(/\W/g,''),name:n,brand:'',size:'',img:'',by:'Kaylee',at:Date.now(),stock:'plenty',cat:guessCat(n)});
  }); save(); render();
});
const cats = await p.evaluate(()=>H().pantry.map(i=>[i.name,i.cat]));
cats.forEach(([n,c])=>log(`     ${n.padEnd(28)} -> ${c}`));
ok(cats.find(c=>c[0]==='Organic Spinach')[1]==='produce','spinach auto-categorised as produce');
ok(cats.find(c=>c[0]==='Whole Milk')[1]==='dairy','milk -> dairy');
ok(cats.find(c=>c[0]==='Paper Towels')[1]==='household','paper towels -> household');
ok(cats.find(c=>c[0]==='Weird Gadget')[1]==='other','unknown -> other, not a wrong guess');

console.log('\n=== PANTRY: stock levels ===');
ok((await p.textContent('#cnt-have'))==='8','Have count starts at 8');
ok((await p.textContent('#cnt-need'))==='0','Need list starts empty');
const id = await p.evaluate(()=>H().pantry[0].id);
await p.click(`[data-item="${id}"] .jarbtn`); await p.waitForTimeout(250);
ok(await p.evaluate(i=>H().pantry.find(x=>x.id===i).stock==='low',id),'one tap: plenty -> running low');
ok((await p.textContent('#cnt-need'))==='1','running-low item appears on the Need list');
ok((await p.textContent('#cnt-have'))==='8','...and is still counted as in the house');
await p.click(`[data-item="${id}"] .jarbtn`); await p.waitForTimeout(250);
ok(await p.evaluate(i=>H().pantry.find(x=>x.id===i).stock==='out',id),'second tap: low -> out');
ok((await p.textContent('#cnt-have'))==='7','an OUT item drops off the Have list');
await p.screenshot({path:'/tmp/f-have.png',fullPage:true});

console.log('\n=== PANTRY: the Need list restock ===');
await p.click('[data-ref="need-tab"]'); await p.waitForTimeout(300);
ok((await p.$$('.cathead')).length>0,'Need list groups items under category headers');
await p.screenshot({path:'/tmp/f-need.png',fullPage:true});
await p.click(`[data-item="${id}"] .chk`); await p.waitForTimeout(700);
ok(await p.evaluate(i=>H().pantry.find(x=>x.id===i).stock==='plenty',id),'ticking it off refills to plenty');
ok((await p.textContent('#cnt-need'))==='0','...and it leaves the Need list');

console.log('\n=== RECEIPT: percentage split ===');
await p.click('[data-ref="tab-receipt-btn"]');
await p.setInputFiles('#receipt-file','/tmp/receipt.png');
await p.waitForSelector('#receipt-edit:not(.hide)',{timeout:120000});
const even = await p.evaluate(()=>computeSplit().owed);
log('  even:  '+JSON.stringify(Object.fromEntries(Object.entries(even).map(([k,v])=>[k,+v.toFixed(2)]))));
ok(Math.abs(even.u1-even.u2)<0.02,'even mode splits equally');
await p.click('[data-ref="split-custom"]'); await p.waitForTimeout(300);
ok(!(await p.evaluate(()=>document.querySelector('#weights').classList.contains('hide'))),'percentage sliders appear');
await p.evaluate(()=>{ setWeight('u1',50); setWeight('u2',30); setWeight('u3',20); });
await p.waitForTimeout(300);
const cus = await p.evaluate(()=>computeSplit());
log('  50/30/20: '+JSON.stringify(Object.fromEntries(Object.entries(cus.owed).map(([k,v])=>[k,+v.toFixed(2)]))));
const ratio = cus.owed.u1/cus.owed.u2;
ok(Math.abs(ratio-(50/30))<0.05,`u1:u2 follows the 50:30 weighting (got ${ratio.toFixed(2)}, want 1.67)`);
const sum = Object.values(cus.owed).reduce((a,v)=>a+v,0)+cus.mine+cus.taxMine;
ok(Math.abs(sum-cus.grand)<0.005,`percentage split still cent-exact: ${sum.toFixed(2)} == ${cus.grand.toFixed(2)}`);
await p.screenshot({path:'/tmp/f-pct.png',fullPage:true});

console.log('\n=== VENMO discoverability ===');
await p.evaluate(()=>{H().members.find(m=>m.id===me.id).venmo='';me.venmo='';save();render();});
await p.click('[data-ref="tab-settle-btn"]'); await p.waitForTimeout(300);
ok(await p.isVisible('[data-ref="venmo-nudge-btn"]'),'unlinked Venmo shows a nudge on the balance card');
await p.click('[data-ref="me-avatar"]'); await p.waitForTimeout(300);
ok(await p.isVisible('[data-ref="account-venmo-input"]'),'avatar opens an account sheet with the Venmo field');
await p.fill('[data-ref="account-venmo-input"]','@kaylee-r'); await p.click('#acct-save'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>H().members.find(m=>m.id===me.id).venmo==='@kaylee-r'),'saving from the account sheet persists it');
ok(!(await p.isVisible('[data-ref="venmo-nudge-btn"]')),'nudge disappears once linked');
await p.screenshot({path:'/tmp/f-settle.png',fullPage:true});

console.log(fails?`\n${fails} FAILED`:'\nALL FEATURE CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
