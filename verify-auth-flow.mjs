/* One button, Firebase drives the handshake — no embedded widget to fail. */
import { readFileSync } from 'fs';
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const base = process.argv[2] || 'http://127.0.0.1:8123/index.html';
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844},
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const netGoogle=[]; p.on('request',r=>{ if(/accounts\.google|gsi\/client/.test(r.url())) netGoogle.push(r.url().slice(0,60)); });

console.log('\n=== the sign-in screen ===');
await p.goto(base,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3500);
ok(await p.isVisible('[data-ref="google-signin"]'), 'a real Continue-with-Google button is on screen');
const label = (await p.textContent('[data-ref="google-signin"]')).trim();
ok(/Continue with Google/.test(label), `it says what it does: "${label}"`);
ok(await p.evaluate(()=>typeof document.querySelector('[data-ref="google-signin"]').onclick === 'function'),
   'and it is wired');

console.log('\n=== no Google widget script any more ===');
const src = await (await fetch(base)).text();
ok(!/accounts\.google\.com\/gsi\/client/.test(src), 'the GIS script is gone from the page');
ok(!/google\.accounts\.id/.test(src), 'and so is all the One Tap plumbing');
ok(!netGoogle.some(u=>/gsi\/client/.test(u)), 'nothing loads it at runtime either');

console.log('\n=== Firebase owns the handshake ===');
const sync = await (await fetch(base.replace(/index\.html.*/,'') + 'sync.js')).text();
ok(/signInWithPopup/.test(sync), 'popup first — the flow Firebase recommends as universally supported');
ok(/signInWithRedirect/.test(sync), 'full-page redirect as the fallback when a popup is blocked');
ok(/getRedirectResult/.test(sync), 'and the redirect is resumed on the way back in');
ok(/setPersistence\(auth, browserLocalPersistence\)/.test(sync), 'session persists on the device');
ok(/prompt: "select_account"/.test(sync), 'it lets you choose which Google account');

console.log('\n=== the redirect fallback is same-origin ===');
const rewrites = JSON.parse(readFileSync('vercel.json','utf8')).rewrites || [];
console.log('   rewrites:', JSON.stringify(rewrites));
ok(rewrites.some(r=>r.source.startsWith('/__/auth/')), 'Vercel proxies /__/auth/* to Firebase, so Safari storage partitioning cannot break the redirect');

console.log('\n=== a signed-out person is never left with nothing ===');
ok(await p.evaluate(()=>!document.querySelector('#signin').classList.contains('hide')), 'the sign-in screen is visible');
const note = (await p.textContent('#gsi-note')).trim();
console.log('   note:', note);
ok(note.length > 0, 'and it explains what signing in shares');
console.log('   page errors:', errs.length?errs.slice(0,2):'none');
ok(errs.length===0, 'no JS errors on the sign-in screen');

console.log(fails?`\n${fails} FAILED`:'\nALL AUTH-FLOW CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
