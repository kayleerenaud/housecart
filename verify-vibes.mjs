/* Every vibe must stay readable. Checks WCAG contrast for each text/background
   pair in every vibe AND every variant, and screenshots each one. */
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
await p.evaluate(()=>{ H().members.push({id:'u2',name:'Sam Okafor',venmo:'sam-o'},{id:'u3',name:'Priya Raman',venmo:'priya-r'});
  [['Organic Spinach','produce','half'],['Whole Milk','dairy','full'],['Chicken Thighs','meat','full'],
   ['Paper Towels','household','empty'],['Cold Brew','drinks','full']]
   .forEach(([n,c,st])=>H().pantry.push({id:'i'+n.replace(/\W/g,''),name:n,brand:'',size:'',img:'',by:'K',at:Date.now(),stock:st,cat:c}));
  H().trips.push({id:'t1',at:Date.now(),payer:'u1',payerName:'Kaylee Renaud',store:'Green Valley Market',
    items:[{name:'Milk',price:4.99,split:true,who:['u1','u2','u3']}],owed:{u1:32.10,u2:32.09,u3:32.08},total:96.27,shared:96.27});
  save(); render(); });

const list = await p.evaluate(()=>VIBES.map(v=>({id:v.id,name:v.name,variants:(v.variants||[]).map(x=>x.id)})));
console.log('\n=== contrast (WCAG AA: 4.5 body / 3.0 large & UI) ===');
for(const v of list){
  const variants = v.variants.length ? v.variants : [null];
  for(const variant of variants){
    await p.evaluate(([id,vr])=>{ setVibe(id); if(vr) setVariant(vr); }, [v.id, variant]);
    await p.waitForTimeout(450);
    const r = await p.evaluate(()=>{
      const cs = getComputedStyle(document.documentElement);
      const tok = n => cs.getPropertyValue(n).trim();
      const toRGB = c => { const d=document.createElement('div'); d.style.color=c; document.body.appendChild(d);
        const m=getComputedStyle(d).color.match(/[\d.]+/g).map(Number); d.remove(); return m; };
      // flatten a possibly-translucent colour over its backdrop
      const over = (fg,bg)=>{ const a=fg[3]===undefined?1:fg[3]; return [0,1,2].map(i=>fg[i]*a+bg[i]*(1-a)); };
      const lum = c => { const f=c.map(v=>{v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4);});
        return .2126*f[0]+.7152*f[1]+.0722*f[2]; };
      const ratio=(a,bg)=>{ const A=lum(over(a,bg)), Bl=lum(bg); const hi=Math.max(A,Bl), lo=Math.min(A,Bl);
        return (hi+.05)/(lo+.05); };
      const bg=toRGB(tok('--bg')), surf=toRGB(tok('--surface')), tint=toRGB(tok('--tint'));
      return {
        'label on surface':   ratio(toRGB(tok('--label')),   surf),
        'label-2 on surface': ratio(toRGB(tok('--label-2')), surf),
        'label on bg':        ratio(toRGB(tok('--label')),   bg),
        'label-2 on bg':      ratio(toRGB(tok('--label-2')), bg),
        'tint on surface':    ratio(tint, surf),
        'on-tint on tint':    ratio(toRGB(tok('--on-tint')), tint),
        'positive on surface':ratio(toRGB(tok('--positive')),surf),
        'negative on surface':ratio(toRGB(tok('--negative')),surf),
        'warning on surface': ratio(toRGB(tok('--warning')), surf)
      };
    });
    const tag = v.name + (variant ? ' · ' + variant : '');
    const bad = Object.entries(r).filter(([k,x]) => x < (k.includes('label-2')||k.includes('tint on')||k.includes('warning')||k.includes('positive')||k.includes('negative') ? 3.0 : 4.5));
    console.log(`  ${tag.padEnd(20)} ` + Object.entries(r).map(([k,x])=>`${k.split(' ')[0]}:${x.toFixed(1)}`).join('  '));
    ok(bad.length===0, `${tag}: every pair clears its threshold` + (bad.length?` — FAILING: ${bad.map(([k,x])=>k+' '+x.toFixed(2)).join(', ')}`:''));
    // screenshot pantry + settle in this vibe
    await p.evaluate(()=>go('pantry')); await p.waitForTimeout(250);
    await p.screenshot({path:`/tmp/v-${v.id}${variant?'-'+variant:''}.png`});
  }
}
console.log('\n=== fonts actually applied ===');
for(const v of list){
  await p.evaluate(id=>setVibe(id), v.id); await p.waitForTimeout(700);
  const f = await p.evaluate(()=>getComputedStyle(document.querySelector('.ltitle')).fontFamily);
  console.log(`  ${v.name.padEnd(11)} ${f.split(',')[0]}`);
}
console.log('\n=== background art present ===');
for(const v of list){
  await p.evaluate(id=>setVibe(id), v.id); await p.waitForTimeout(300);
  const art = await p.evaluate(()=>{
    const cs=getComputedStyle(document.documentElement);
    return {art:cs.getPropertyValue('--bgart').trim().slice(0,24), tex:cs.getPropertyValue('--bgtex').trim().slice(0,24)};
  });
  ok(!!art.art, `${v.name}: has background art`);
}
console.log(fails?`\n${fails} FAILED`:'\nALL VIBE CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
