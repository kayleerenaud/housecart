/* Stock rename, swipe-to-delete, vibe profiles, account screen, profile pic. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',googlePic:'https://example.com/g.jpg',venmo:'kaylee-r'}));
await p.fill('#new-house','Maple St'); await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(()=>{ ['Milk','Eggs','Bread'].forEach(n=>H().pantry.push({id:'i'+n,name:n,brand:'',size:'',img:'',by:'K',at:Date.now(),stock:'full',cat:'other'})); save(); render(); });

console.log('\n=== full / half / empty ===');
await p.click('[data-item="iMilk"] .jarbtn'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>H().pantry.find(i=>i.id==='iMilk').stock==='half'), 'tap 1: full -> half');
ok((await p.textContent('[data-item="iMilk"] .imeta')).includes('half left'), 'row reads "half left"');
await p.click('[data-item="iMilk"] .jarbtn'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>H().pantry.find(i=>i.id==='iMilk').stock==='empty'), 'tap 2: half -> empty');
await p.click('[data-item="iMilk"] .jarbtn'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>H().pantry.find(i=>i.id==='iMilk').stock==='full'), 'tap 3: empty -> full (cycles)');
ok(await p.evaluate(()=>{ const L={plenty:'full',low:'half',out:'empty'};
  houses['OLD']={code:'OLD',name:'Old',adminId:'u1',members:[{id:'u1',name:'K'}],pending:[],payments:[],trips:[],
    pantry:[{id:'z',name:'Legacy',stock:'plenty',cat:'other'}]};
  save(); migrateHouses(); return houses['OLD'].pantry[0].stock==='full'; }), 'legacy plenty/low/out values migrate');

console.log('\n=== swipe left to delete ===');
const box = await p.locator('[data-swipe="iEggs"]').boundingBox();
await p.mouse.move(box.x+box.width-40, box.y+box.height/2);
await p.mouse.down();
await p.mouse.move(box.x+box.width-140, box.y+box.height/2, {steps:12});
await p.mouse.up(); await p.waitForTimeout(350);
ok(await p.evaluate(()=>document.querySelector('[data-swipe="iEggs"]').classList.contains('open')), 'a left drag reveals the Delete action');
ok(await p.isVisible('[data-swipe="iEggs"] .sw-del'), 'the Delete button is on screen');
p.once('dialog', d=>d.accept());
await p.click('[data-swipe="iEggs"] .sw-del'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>!H().pantry.some(i=>i.id==='iEggs')), 'confirming actually deletes it');
ok(await p.evaluate(()=>document.querySelector('[data-item="iMilk"]')!==null), 'an empty item stays visible so the tap cycle keeps working');
// a vertical drag must NOT open the swipe (it should scroll)
const b2 = await p.locator('[data-swipe="iBread"]').boundingBox();
await p.mouse.move(b2.x+b2.width-40, b2.y+5); await p.mouse.down();
await p.mouse.move(b2.x+b2.width-52, b2.y+90, {steps:10}); await p.mouse.up();
await p.waitForTimeout(300);
ok(!(await p.evaluate(()=>document.querySelector('[data-swipe="iBread"]').classList.contains('open'))), 'a vertical drag scrolls instead of opening delete');

console.log('\n=== avatar -> Account screen ===');
await p.click('[data-ref="me-avatar"]'); await p.waitForTimeout(300);
ok(await p.isVisible('[data-ref="account-tab"]'), 'tapping the avatar opens the Account screen');
ok((await p.textContent('#screen-title')) === 'Account', 'the screen title says Account');
ok((await p.textContent('#acct-name')).includes('Kaylee'), 'it shows who you are');

console.log('\n=== vibe profiles ===');
const vibes = await p.$$eval('[data-vibe-pick]', els=>els.map(e=>e.dataset.vibePick));
console.log('   available:', vibes.join(', '));
ok(vibes.length >= 5, 'several vibes to choose from');
for(const v of ['midnight','market','sorbet']){
  await p.click(`[data-vibe-pick="${v}"]`); await p.waitForTimeout(250);
  const st = await p.evaluate(()=>({attr:document.documentElement.getAttribute('data-vibe'),
    bg:getComputedStyle(document.body).backgroundColor,
    tint:getComputedStyle(document.documentElement).getPropertyValue('--tint').trim()}));
  console.log(`   ${v}: bg ${st.bg}  tint ${st.tint}`);
  ok(st.attr===v, `${v} applies`);
}
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(500);
ok(await p.evaluate(()=>document.documentElement.getAttribute('data-vibe')==='sorbet'), 'the chosen vibe survives a reload');
await p.evaluate(()=>setVibe('crisp')); await p.waitForTimeout(200);
ok(await p.evaluate(()=>!document.documentElement.hasAttribute('data-vibe')), 'Crisp resets to the default');

console.log('\n=== profile picture ===');
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee Renaud',email:'k@x.com',pic:'',googlePic:'https://example.com/g.jpg',venmo:'kaylee-r'}));
await p.click('[data-ref="me-avatar"]'); await p.waitForTimeout(300);
// a 900x600 png through the resizer
const png = await p.evaluate(()=>{ const c=document.createElement('canvas'); c.width=900;c.height=600;
  const x=c.getContext('2d'); x.fillStyle='#c2417a'; x.fillRect(0,0,900,600); x.fillStyle='#fff'; x.fillRect(300,150,300,300);
  return c.toDataURL('image/png'); });
const buf = Buffer.from(png.split(',')[1],'base64');
console.log('   source image:', Math.round(buf.length/1024)+'KB, 900x600');
await p.setInputFiles('#pic-file', {name:'me.png', mimeType:'image/png', buffer:buf});
await p.waitForFunction(()=>me.pic && me.pic.startsWith('data:image/jpeg'), null, {timeout:8000});
const info = await p.evaluate(()=>new Promise(r=>{ const i=new Image(); i.onload=()=>r({w:i.width,h:i.height,kb:Math.round(me.pic.length/1024)}); i.src=me.pic; }));
console.log(`   stored as: ${info.w}x${info.h}, ~${info.kb}KB`);
ok(info.w===192 && info.h===192, 'the upload is cropped square and resized to 192px');
ok(info.kb < 40, `and shrunk to ~${info.kb}KB so it fits in the house document`);
ok(await p.evaluate(()=>H().members.find(m=>m.id===me.id).pic === me.pic), 'saved onto your housemate record');
ok(await p.evaluate(()=>document.querySelector('[data-ref="me-avatar"] img') !== null), 'the nav avatar shows it');
await p.click('#pic-google'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>me.pic==='https://example.com/g.jpg'), '"Use Google photo" restores the Google one');
await p.click('#pic-clear'); await p.waitForTimeout(200);
ok(await p.evaluate(()=>me.pic===''), 'Remove clears it back to initials');
await p.screenshot({path:'/tmp/acct.png', fullPage:true});

console.log(fails?`\n${fails} FAILED`:'\nALL ACCOUNT CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
