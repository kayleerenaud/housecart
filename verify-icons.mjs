import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>console.log('ERR',e.message));
const base = process.argv[2] || 'http://127.0.0.1:8123/index.html';
await p.goto(base.includes('local=1')?base:base+(base.includes('?')?'&':'?')+'local=1',{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',venmo:'k'}));
await p.fill('#new-house','BrooklynGals'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{H().pantry.push({id:'a',name:'Milk',brand:'',size:'',img:'',by:'K',at:Date.now(),stock:'full',cat:'dairy'});save();render();});
let bad=[];
for(const tab of ['pantry','receipt','settle','spend','account']){
  await p.evaluate(t=>go(t),tab); await p.waitForTimeout(350);
  const big = await p.evaluate(t=>{
    const out=[];
    document.querySelectorAll('#app svg').forEach(sv=>{
      if(!sv.getClientRects().length) return;
      const r=sv.getBoundingClientRect();
      const ok = sv.closest('.hero') || sv.closest('[data-ref="app-cover"]');
      if(!ok && (r.width>48 || r.height>48))
        out.push(`${t}: <svg class="${sv.getAttribute('class')||''}"> ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  }, tab);
  bad.push(...big);
}
if(bad.length){ bad.forEach(x=>console.log('  OVERSIZED', x)); console.log('\nFAIL'); process.exit(1); }
console.log('  PASS  no oversized icon anywhere in the app');
await b.close();
process.exit(0);
