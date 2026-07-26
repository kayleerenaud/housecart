/* Unique household names, and the plant+digits code format. */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const withLocal = u => u.includes('local=1') ? u : u + (u.includes('?')?'&':'?') + 'local=1';
const B = withLocal(process.argv[2] || 'http://127.0.0.1:8123/index.html');
let fails=0; const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fails++;};
const b=await chromium.launch({args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});
p.on('pageerror',e=>{console.log('PAGEERR:',e.message);fails++;});
await p.goto(B,{waitUntil:'networkidle'});
await p.evaluate(()=>signIn({id:'u1',name:'Kaylee',email:'k@x.com',pic:'',venmo:'k'}));

console.log('\n=== code format: a plant then four digits ===');
const codes = await p.evaluate(()=>Array.from({length:12},()=>newCode()));
console.log('   samples:', codes.slice(0,6).join('  '));
ok(codes.every(c=>/^[A-Z]{3,8}\d{4}$/.test(c)), 'every code is LETTERS + exactly 4 digits');
const plants = await p.evaluate(()=>CODE_WORDS);
ok(codes.every(c=>plants.includes(c.replace(/\d+$/,''))), 'the word is always one of the plant names');
const space = await p.evaluate(()=>CODE_WORDS.length*9000);
console.log(`   possible codes: ${space.toLocaleString()} (was 540)`);
ok(space > 200000, 'the code space is large enough that guessing is impractical');
ok(new Set(codes).size >= 10, 'codes vary rather than repeating');

console.log('\n=== a household name must be unused ===');
await p.fill('[data-ref="new-house-input"]','BrooklynGals');
await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
const code1 = await p.textContent('#house-code');
ok(/^[A-Z]+\d{4}$/.test(code1), `first house created with code ${code1}`);
await p.evaluate(()=>leaveToGate()); await p.waitForTimeout(300);
// same name again
await p.fill('[data-ref="new-house-input"]','BrooklynGals');
await p.click('[data-ref="create-house-btn"]'); await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="name-error"]'), 'reusing a name is refused with a visible error');
console.log('   error shown:', (await p.textContent('[data-ref="name-error"]')).trim());
ok(await p.evaluate(()=>Object.keys(houses).length===1), '...and no second house is created');
// case-insensitive
await p.fill('[data-ref="new-house-input"]','brooklyngals');
await p.click('[data-ref="create-house-btn"]'); await p.waitForTimeout(400);
ok(await p.evaluate(()=>Object.keys(houses).length===1), 'the check ignores capitalisation');
// blank
await p.fill('[data-ref="new-house-input"]','');
await p.click('[data-ref="create-house-btn"]'); await p.waitForTimeout(300);
ok(await p.evaluate(()=>Object.keys(houses).length===1), 'a blank name is refused (no more silent "My house")');
// a different name works
await p.fill('[data-ref="new-house-input"]','Maple Street');
await p.click('[data-ref="create-house-btn"]'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>Object.keys(houses).length===2), 'a genuinely new name is accepted');
const code2 = await p.textContent('#house-code');
console.log(`   two houses: ${code1}, ${code2}`);
ok(code1 !== code2, 'the two houses got different codes');

console.log(fails?`\n${fails} FAILED`:'\nALL NAMING CHECKS PASSED');
await b.close(); process.exit(fails?1:0);
