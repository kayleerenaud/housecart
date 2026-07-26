/* Measures contrast against the PIXELS ACTUALLY RENDERED behind each piece of
   text — background art and grain included — rather than against colour tokens.
   Token-only checks pass while the screen still looks washed out. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
const BODY_MIN = Number(process.env.BODY_MIN || 7.0);      // AAA for body text
const SEC_MIN  = Number(process.env.SEC_MIN  || 4.5);      // AA for secondary/UI
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};

const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const reader=await b.newPage();
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',venmo:'kaylee-r'}));
await p.fill('#new-house','Maple St'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{ H().members.push({id:'u2',name:'Sam',venmo:'s'},{id:'u3',name:'Priya',venmo:'p'});
  [['Organic Spinach','produce','half'],['Whole Milk','dairy','full']]
    .forEach(([n,c,st])=>H().pantry.push({id:'i'+n.replace(/\W/g,''),name:n,brand:'',size:'',img:'',by:'K',at:Date.now(),stock:st,cat:c}));
  save(); render(); });

const lum = c => { const f=c.map(v=>{v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4);});
  return .2126*f[0]+.7152*f[1]+.0722*f[2]; };
const ratio = (a,bg) => { const A=lum(a), Bl=lum(bg); const hi=Math.max(A,Bl), lo=Math.min(A,Bl); return (hi+.05)/(lo+.05); };

const SPOTS = [
  ['.ltitle',       'large title on the canvas',  'body'],
  ['.lsub',         'subtitle on the canvas',     'sec'],
  ['#pantry-hint',  'hint text inside a card',    'sec'],
  ['.iname',        'item name inside a card',    'body'],
  ['.imeta',        'item meta inside a card',    'sec'],
  ['.sechead',      'section header on canvas',   'sec'],
  ['.tabbar button.on','selected tab label',      'sec'],
];

const vibes = await p.evaluate(()=>VIBES.map(v=>({id:v.id,name:v.name,variants:(v.variants||[]).map(x=>x.id)})));
console.log(`\nthresholds: body >= ${BODY_MIN}  secondary/UI >= ${SEC_MIN}   (measured on rendered pixels)\n`);
const worst = [];
for(const v of vibes){
  for(const variant of (v.variants.length?v.variants:[null])){
    await p.evaluate(([id,vr])=>{ setVibe(id); if(vr) setVariant(vr); go('pantry'); }, [v.id, variant]);
    await p.waitForTimeout(650);
    // where is each text, and what colour is it?
    const items = await p.evaluate(sel=>sel.map(([q,label,kind])=>{
      const el=document.querySelector(q); if(!el||!el.offsetParent) return null;
      const r=el.getBoundingClientRect();
      const col=getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
      return {label,kind,x:Math.round(r.left+Math.min(r.width-2,6)),y:Math.round(r.top+r.height/2),col:col.slice(0,3),alpha:col[3]===undefined?1:col[3]};
    }).filter(Boolean), SPOTS);
    // hide all glyphs so the shot shows only what is BEHIND them
    await p.addStyleTag({content:'*{color:transparent!important;-webkit-text-stroke-color:transparent!important;text-shadow:none!important}'});
    await p.waitForTimeout(120);
    const shot = (await p.screenshot({type:'png'})).toString('base64');
    await p.evaluate(()=>{ const s=[...document.querySelectorAll('style')].pop(); if(s) s.remove(); });
    const px = await reader.evaluate(async ([data,pts])=>{
      const img = new Image(); img.src = 'data:image/png;base64,'+data;
      await img.decode();
      const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const x=c.getContext('2d'); x.drawImage(img,0,0);
      return pts.map(pt=>{ const d=x.getImageData(Math.max(0,pt.x),Math.max(0,pt.y),1,1).data; return [d[0],d[1],d[2]]; });
    }, [shot, items.map(i=>({x:i.x,y:i.y}))]);

    const tag = v.name + (variant?' · '+variant:'');
    const rows = items.map((it,i)=>{
      const bg = px[i];
      const fg = it.alpha>=1 ? it.col : it.col.map((c,k)=>c*it.alpha + bg[k]*(1-it.alpha));
      return {label:it.label, kind:it.kind, r:ratio(fg,bg)};
    });
    const bad = rows.filter(r=> r.r < (r.kind==='body'?BODY_MIN:SEC_MIN));
    const min = Math.min(...rows.map(r=>r.r));
    worst.push([tag,min]);
    console.log(`  ${tag.padEnd(18)} ` + rows.map(r=>`${r.label.split(' ')[0]}:${r.r.toFixed(1)}`).join(' '));
    ok(bad.length===0, `${tag}: lowest ${min.toFixed(1)}` + (bad.length?`  — under: ${bad.map(x=>`${x.label} ${x.r.toFixed(1)}`).join(', ')}`:''));
  }
}
worst.sort((a,b)=>a[1]-b[1]);
console.log(`\n  weakest overall: ${worst[0][0]} at ${worst[0][1].toFixed(1)}`);
console.log(fails?`\n${fails} FAILED`:'\nALL CONTRAST CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
