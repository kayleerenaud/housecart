/* Google One Tap must never float over an app the person is already inside. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const base = process.argv[2] || 'http://127.0.0.1:8123/index.html';
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});

console.log('\n=== the load path never prompts blind ===');
const src = await (await fetch(base)).text();
const initBody = src.slice(src.indexOf('function initAuth()'), src.indexOf('function signIn('));
ok(!/google\.accounts\.id\.prompt\(\)/.test(initBody) || /if\(!CLOUD\(\) && !me\) oneTap\(\)/.test(initBody),
   'initAuth does not call prompt() unconditionally on load');
ok(/if\(!u\) setTimeout\(oneTap, 250\)/.test(src),
   'One Tap is only offered once Firebase confirms there is NO session');
ok(/else dismissOneTap\(\)/.test(src), 'and is cancelled the moment a session is found');

console.log('\n=== oneTap() refuses to fire for a signed-in user ===');
await p.goto(base + (base.includes('?')?'&':'?') + 'local=1', {waitUntil:'networkidle'});
await p.waitForTimeout(600);
const guard = await p.evaluate(()=>{
  let prompted = 0;
  window.google = window.google || {accounts:{id:{}}};
  window.google.accounts = window.google.accounts || {id:{}};
  window.google.accounts.id.prompt  = () => { prompted++; };
  window.google.accounts.id.cancel  = () => {};
  gsiReady = true; oneTapShown = false;
  signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'});   // now signed in
  oneTapShown = false;                                                // pretend it was never offered
  oneTap();                                                           // must be refused
  const whileSignedIn = prompted;
  me = null; oneTapShown = false;
  oneTap();                                                           // now allowed
  return { whileSignedIn, whileSignedOut: prompted - whileSignedIn };
});
console.log('   prompts while signed in:', guard.whileSignedIn, '· while signed out:', guard.whileSignedOut);
ok(guard.whileSignedIn === 0, 'oneTap() is a no-op when someone is already signed in');
ok(guard.whileSignedOut === 1, '...and still works for someone who is signed out');

console.log('\n=== signing in cancels a pending One Tap ===');
const cancelled = await p.evaluate(()=>{
  let cancels = 0;
  window.google.accounts.id.cancel = () => { cancels++; };
  me = null; oneTapShown = false;
  signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'});
  return { cancels, shown: oneTapShown };
});
ok(cancelled.cancels >= 1, 'signIn() cancels the overlay');
ok(cancelled.shown === true, 'and marks it as not-to-be-offered-again this session');

console.log(fails?`\n${fails} FAILED`:'\nALL ONE-TAP CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
