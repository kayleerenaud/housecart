/* Anything that LOOKS tappable must DO something. Finds dead touch spots. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});

async function seed(){
  await p.goto(B,{waitUntil:'networkidle'});
  await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',venmo:'kaylee-r'}));
  await p.waitForTimeout(200);
  await p.fill('[data-ref="new-house-input"]','BrooklynSisters');
  await p.click('[data-ref="create-house-btn"]');
  await p.waitForSelector('#app:not(.hide)');
  await p.evaluate(()=>{
    H().members.push({id:'u2',name:'Sam Okafor',venmo:'sam-o'},{id:'u3',name:'Priya Raman',venmo:'priya-r'});
    [['Organic Spinach','produce','half'],['Whole Milk','dairy','full'],['Paper Towels','household','empty']]
      .forEach(([n,c,st])=>H().pantry.push({id:'i'+n.replace(/\W/g,''),name:n,brand:'Brand',size:'1L',img:'',by:'K',at:Date.now(),stock:st,cat:c}));
    H().trips.push({id:'t1',at:Date.now()-9e6,payer:'u2',payerName:'Sam Okafor',store:'Green Valley Market',
      items:[{name:'Milk',price:30,split:true,who:['u1','u2']}],owed:{u1:15,u2:15},total:30,shared:30});
    H().pending=[{id:'u7',name:'Dana Ruiz',email:'d@x.com',pic:'',at:Date.now()}];
    save(); render();
  });
  await p.waitForTimeout(300);
}
await seed();

/* Does it look tappable? */
const AUDIT = `(() => {
  const looksTappable = el => {
    if(!el.getClientRects().length) return false;
    const t = el.tagName;
    if(t==='BUTTON'||t==='A'||t==='LABEL'||t==='INPUT'||t==='SELECT') return true;
    const cs = getComputedStyle(el);
    if(cs.cursor === 'pointer') return true;
    return false;
  };
  const wired = el => {
    if(el.onclick) return true;
    if(el.getAttribute('onclick')) return true;
    if(el.tagName==='A' && el.getAttribute('href')) return true;
    if(el.tagName==='LABEL') return true;                       // opens its input
    if(el.tagName==='INPUT'||el.tagName==='SELECT') return true;
    if(el.closest('[onclick]')) return true;                    // handled by an ancestor
    let n = el.parentElement;
    while(n){ if(n.onclick) return true; n = n.parentElement; }
    return false;
  };
  const dead = [];
  document.querySelectorAll('#app *, .sheet *').forEach(el => {
    if(!looksTappable(el)) return;
    if(wired(el)) return;
    const r = el.getBoundingClientRect();
    dead.push((el.tagName.toLowerCase()) + (el.id?'#'+el.id:'') + (el.className && typeof el.className==='string' ?'.'+el.className.trim().split(/\\s+/).join('.'):'')
      + ' "' + (el.textContent||'').trim().slice(0,28) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  return dead;
})()`;

console.log('\n=== dead touch spots, screen by screen ===');
let allDead = [];
for(const tab of ['pantry','receipt','settle','spend','account']){
  await p.evaluate(t=>go(t), tab); await p.waitForTimeout(350);
  const dead = await p.evaluate(AUDIT);
  dead.forEach(d=>console.log(`   ${tab}: ${d}`));
  allDead.push(...dead.map(d=>`${tab}: ${d}`));
}
// and inside the sheets
for(const [open,label] of [['[data-ref="house-switcher"]','household sheet'],['[data-ref="me-avatar"]','account']]){
  await p.evaluate(t=>go(t),'pantry'); await p.waitForTimeout(200);
  await p.click(open); await p.waitForTimeout(500);
  const dead = await p.evaluate(AUDIT);
  dead.forEach(d=>console.log(`   ${label}: ${d}`));
  allDead.push(...dead.map(d=>`${label}: ${d}`));
  await p.evaluate(()=>closeSheet()); await p.waitForTimeout(200);
}
ok(allDead.length===0, `nothing that looks tappable is inert (${allDead.length} found)`);

console.log('\n=== nothing row-shaped is inert ===');
{
  const inert = [];
  for(const tab of ['pantry','receipt','settle','spend','account']){
    await p.evaluate(t=>go(t), tab); await p.waitForTimeout(320);
    const rows = await p.evaluate(t=>{
      const wired = el => { let n=el; while(n){ if(n.onclick||(n.getAttribute&&n.getAttribute('onclick'))) return true; n=n.parentElement; } return false; };
      const out=[];
      document.querySelectorAll(`#tab-${t} .itemrow, #tab-${t} .see, #tab-${t} .stat > div, #tab-${t} .alert`).forEach(el=>{
        if(!el.getClientRects().length) return;
        if(!wired(el) && !el.querySelector('button, a, label, input'))
          out.push(`${el.className||'stat tile'} :: ${(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,40)}`);
      });
      return out;
    }, tab);
    rows.forEach(r=>console.log(`   INERT ${tab}: ${r}`));
    inert.push(...rows);
  }
  ok(inert.length===0, 'every row- or tile-shaped element either acts or contains its own control');
}

console.log('\n=== rows with a chevron must navigate ===');
await p.evaluate(()=>go('account')); await p.waitForTimeout(400);
const chevRows = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('#app .chev').forEach(c=>{
    const row = c.closest('[onclick]') || c.closest('.itemrow') || c.parentElement;
    out.push({ text:(row.textContent||'').trim().slice(0,34),
               wired: !!(row.getAttribute && row.getAttribute('onclick')) || !!row.onclick });
  });
  return out;
});
chevRows.forEach(r=>console.log(`   ${r.wired?'ok  ':'DEAD'} ${r.text}`));
ok(chevRows.every(r=>r.wired), 'every row showing a chevron actually leads somewhere');

console.log(fails?`\n${fails} FAILED`:'\nALL TOUCH CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
