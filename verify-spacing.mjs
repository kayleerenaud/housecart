/* Enforces the 8pt system: structural spacing on the grid, touch targets >=44,
   consistent edge margins, and squircle corners. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',venmo:'kaylee-r'}));
await p.fill('#new-house','Maple St'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{ H().members.push({id:'u2',name:'Sam',venmo:'s'},{id:'u3',name:'Priya',venmo:'p'});
  ['Milk','Eggs','Bread'].forEach(n=>H().pantry.push({id:'i'+n,name:n,brand:'',size:'',img:'',by:'K',at:Date.now(),stock:'full',cat:'other'}));
  H().trips.push({id:'t1',at:Date.now(),payer:'u1',payerName:'Kaylee',store:'Green Valley Market',
    items:[{name:'Milk',price:4.99,split:true,who:['u1','u2','u3']}],owed:{u1:32.1,u2:32.09,u3:32.08},total:96.27,shared:96.27});
  save(); render(); });

console.log('\n=== every left/right edge lines up at 16pt ===');
for(const tab of ['pantry','settle','spend','account']){
  await p.evaluate(t=>go(t), tab); await p.waitForTimeout(300);
  const edges = await p.evaluate(()=>{
    const main = document.querySelector('#app>main');
    const w = main.getBoundingClientRect();
    const out = new Set();
    main.querySelectorAll('.card, main > section > .btn, .sechead, .ltitle, .secfoot').forEach(el=>{
      if(!el.offsetParent) return;
      const r = el.getBoundingClientRect();
      out.add(Math.round(r.left - w.left) + '/' + Math.round(w.right - r.right));
    });
    return [...out];
  });
  console.log(`  ${tab.padEnd(8)} left/right insets seen: ${edges.join('  ')}`);
  ok(edges.every(e=>e==='16/16'), `${tab}: every block sits exactly 16pt from both edges`);
}

console.log('\n=== the 16pt inset holds in EVERY vibe ===');
{
  const vibes = await p.evaluate(()=>VIBES.map(v=>v.id));
  const rows = [];
  for(const v of vibes){
    await p.evaluate(id=>{setVibe(id);go('pantry');}, v); await p.waitForTimeout(600);
    const m = await p.evaluate(()=>{
      const main=document.querySelector('#app>main');
      const card=document.querySelector('#app>main .card').getBoundingClientRect();
      const title=document.querySelector('.ltitle').getBoundingClientRect();
      const w=main.getBoundingClientRect();
      return {l:Math.round(card.left-w.left+ (w.left)), t:Math.round(title.left), cl:Math.round(card.left),
              r:Math.round(390-card.right), mw:Math.round(w.width)};
    });
    rows.push([v,m]);
    console.log(`  ${v.padEnd(11)} card ${m.cl}/${m.r}  title ${m.t}  main width ${m.mw}`);
  }
  ok(rows.every(([,m])=>m.cl===16 && m.r===16 && m.t===16),
     'every vibe puts cards and titles exactly 16pt from both edges');
  ok(rows.every(([,m])=>m.mw===390), 'the scroll area fills the screen in every vibe (no shrink-wrap)');
  await p.evaluate(()=>setVibe('minimal')); await p.waitForTimeout(400);
}

console.log('\n=== structural gaps are multiples of 8 ===');
await p.evaluate(()=>go('pantry')); await p.waitForTimeout(250);
const gaps = await p.evaluate(()=>{
  const bad=[], seen=[];
  document.querySelectorAll('#app>main .card').forEach(el=>{
    if(!el.offsetParent) return;
    const mb = parseFloat(getComputedStyle(el).marginBottom);
    seen.push(mb);
    if(mb % 8 !== 0) bad.push('card margin-bottom '+mb);
    if(mb < 32) bad.push('card margin-bottom '+mb+' is below the 32pt section gap');
    const ps = getComputedStyle(el);
    [ps.paddingLeft, ps.paddingRight, ps.paddingTop, ps.paddingBottom].forEach(v=>{
      const n=parseFloat(v); if(n % 4 !== 0) bad.push('card padding '+n);
    });
  });
  return {bad, seen:[...new Set(seen)]};
});
console.log('  card bottom margins:', gaps.seen.join(', '));
ok(gaps.bad.length===0, 'card padding on the 4pt grid and margins on the 8pt grid' + (gaps.bad.length?` — ${gaps.bad.join('; ')}`:''));

console.log('\n=== touch targets >= 44x44 ===');
const small = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('#app button, #app a, #app label.btn, #app input').forEach(el=>{
    if(!el.offsetParent) return;
    const r=el.getBoundingClientRect();
    if(r.width<1||r.height<1) return;
    // a control may stay small visually if it carries an expanded hit area
    const a = getComputedStyle(el,'::after');
    const hw = parseFloat(a.width)||0, hh = parseFloat(a.height)||0;
    const W = Math.max(r.width, hw), Hh = Math.max(r.height, hh);
    if(Hh < 43.5 || W < 43.5)
      out.push(`${el.className||el.tagName}: ${Math.round(r.width)}x${Math.round(r.height)} (hit ${Math.round(W)}x${Math.round(Hh)})`);
  });
  return out;
});
small.forEach(x=>console.log('   under:', x));
ok(small.length===0, 'every visible control clears 44x44');

console.log('\n=== side-by-side controls share a centre line ===');
{
  const bad = [];
  for(const tab of ['pantry','receipt','settle','spend','account']){
    await p.evaluate(t=>go(t), tab); await p.waitForTimeout(300);
    const rows = await p.evaluate(t=>{
      const out=[];
      document.querySelectorAll('#app .row, #app .btn3').forEach(row=>{
        if(!row.offsetParent) return;
        const kids=[...row.children].filter(el=>el.getClientRects().length && el.tagName!=='INPUT'
                    && getComputedStyle(el).position!=='absolute');
        if(kids.length < 2) return;
        const mids = kids.map(el=>{const r=el.getBoundingClientRect(); return +(r.top+r.height/2).toFixed(1);});
        const spread = Math.max(...mids) - Math.min(...mids);
        if(spread > 1.5) out.push(`${t}: [${kids.map(k=>k.className||k.tagName).join(', ')}] centres differ by ${spread.toFixed(1)}px`);
      });
      return out;
    }, tab);
    bad.push(...rows);
  }
  bad.forEach(x=>console.log('   MISALIGNED', x));
  ok(bad.length===0, 'every horizontal group of controls shares one centre line');
  await p.evaluate(()=>go('pantry')); await p.waitForTimeout(250);
}

console.log('\n=== proportional hierarchy ===');
const h = await p.evaluate(()=>{
  const sec = parseFloat(getComputedStyle(document.querySelector('#app>main .card')).marginBottom);
  const row = parseFloat(getComputedStyle(document.querySelector('.itemrow')).paddingTop);
  return {sec,row};
});
console.log(`  between sections ${h.sec}pt · inside a row ${h.row}pt`);
ok(h.sec >= 32, `section-to-section gap is a major increment (${h.sec}pt, spec says 32 or 48)`);
ok(h.sec >= h.row*4, 'gaps between sections dwarf gaps inside them (proportional hierarchy)');

console.log('\n=== squircle corners ===');
const sq = await p.evaluate(()=>({
  supported: CSS.supports('corner-shape','superellipse(4)'),
  card: getComputedStyle(document.querySelector('#app>main .card')).cornerShape || getComputedStyle(document.querySelector('#app>main .card')).getPropertyValue('corner-shape'),
  btn:  getComputedStyle(document.querySelector('.btn')).getPropertyValue('corner-shape')
}));
console.log('  corner-shape supported:', sq.supported, '· card:', sq.card||'(n/a)', '· button:', sq.btn||'(n/a)');
ok(!sq.supported || /superellipse/.test(sq.card), 'cards use continuous-curvature corners, not a circular arc');

console.log('\n=== household control reads as a control ===');
const hp = await p.evaluate(()=>{
  const el=document.querySelector('[data-ref="house-switcher"]');
  const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
  return {label:el.getAttribute('aria-label'), bg:cs.backgroundColor, svgs:el.querySelectorAll('svg').length,
          h:Math.round(r.height), text:el.textContent.trim()};
});
console.log('  ', JSON.stringify(hp));
ok(hp.svgs===2, 'it has a house icon AND a chevron so its purpose and behaviour are legible');
ok(hp.bg!=='rgba(0, 0, 0, 0)', 'it has a filled background so it reads as tappable');
ok(hp.label==='Household settings', 'and an accessible label');

console.log(fails?`\n${fails} FAILED`:'\nALL SPACING CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
