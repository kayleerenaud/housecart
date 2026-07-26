/* A new person must always get a way in — or a clear reason why not. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const base = process.argv[2] || 'http://127.0.0.1:8123/index.html';
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});

const IAB = {
  'Instagram': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0',
  'Facebook':  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/440]',
  'WhatsApp':  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 WhatsApp/2.23',
  'Android wv':'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/120 Mobile'
};
console.log('\n=== inside an app\'s browser, say so instead of showing nothing ===');
for(const [name, ua] of Object.entries(IAB)){
  const ctx = await b.newContext({viewport:{width:390,height:844}, userAgent:ua});
  const p = await ctx.newPage();
  await p.goto(base,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(2500);
  const st = await p.evaluate(()=>({
    warn: !document.querySelector('#webview-warn').classList.contains('hide'),
    btnHidden: document.querySelector('#gsi-btn').classList.contains('hide'),
    text: document.querySelector('#webview-warn').textContent.replace(/\s+/g,' ').trim().slice(0,60),
    copy: !!document.querySelector('[data-ref="webview-copy"]')
  }));
  ok(st.warn, `${name}: shows the "open in your browser" help`);
  ok(st.copy, `${name}: offers a copy-the-link button`);
  if(name === 'Instagram') console.log('   says:', st.text);
  await ctx.close();
}

console.log('\n=== a normal mobile browser gets the Google button ===');
const ctx = await b.newContext({viewport:{width:390,height:844},
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
const p = await ctx.newPage();
await p.goto(base,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
const norm = await p.evaluate(()=>({
  warn: !document.querySelector('#webview-warn').classList.contains('hide'),
  btnKids: document.querySelector('#gsi-btn').children.length,
  signinVisible: !document.querySelector('#signin').classList.contains('hide')
}));
ok(!norm.warn, 'Safari does NOT get the webview warning');
ok(norm.btnKids > 0, 'and the real Google button renders');
ok(norm.signinVisible, 'the sign-in screen is actually on screen for a new person');

console.log('\n=== the invite text warns them ===');
const src = await (await fetch(base)).text();
ok(/Open the link in Safari or Chrome/.test(src), 'the share message tells them where to open it');
ok(/Google blocks sign-in inside other apps/.test(src), 'and the invite panel says why');

console.log(fails?`\n${fails} FAILED`:'\nALL SIGN-IN ACCESS CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
