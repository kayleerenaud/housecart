/* Drives the real app in headless Chromium and asserts the flow works.
   node verify.mjs <base-url> */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = process.argv[2];

const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };
let fails = 0;
const ok = (cond, msg) => { log((cond ? '  PASS  ' : '  FAIL  ') + msg); if (!cond) fails++; };

const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => { log('  JS ERROR  ' + e.message); fails++; });
await p.goto(BASE, { waitUntil: 'networkidle' });

/* ── 1. Sign-in gate ──
   Real Google auth can't be driven headlessly, so we assert the gate behaves
   (no client ID -> setup help, never a silent dead button) and then inject the
   session Google would have produced, to test everything downstream of it. */
log('\n=== 1. SIGN IN GATE ===');
const hasClientId = await p.evaluate(() => !!(window.HOUSECART_CONFIG?.GOOGLE_CLIENT_ID || '').trim());
log(`  config.js client ID present: ${hasClientId}`);
if (!hasClientId) {
  ok(await p.isVisible('#gsi-setup'), 'no client ID -> shows setup instructions, not a dead button');
  const origins = await p.textContent('#origins');
  log(`  origins it tells you to authorize: ${origins.replace(/\s+/g, ' ').trim()}`);
  ok(origins.includes(new URL(BASE).origin), 'setup panel names the exact origin being served');
} else {
  await p.waitForTimeout(2500);
  ok(await p.evaluate(() => document.querySelector('#gsi-btn').children.length > 0),
     'client ID present -> real Google button rendered');
}
ok(await p.evaluate(() => !document.querySelector('[data-ref="prototype-signin"]')),
   'prototype/demo sign-in is gone');
// inject the identity Google's JWT would have yielded
await p.evaluate(() => signIn({ id: 'u1', name: 'Kaylee Renaud', email: 'kaylee@example.com', pic: '', venmo: 'kaylee-r' }));
await p.waitForTimeout(400);
ok(await p.isVisible('[data-ref="house-gate"]'), 'signed in -> lands on household gate');

/* ── 2. Create a house, then seed 2 more housemates joining by code ── */
log('\n=== 2. HOUSEHOLD + HOUSE CODE ===');
await p.fill('#new-house', 'Maple St');
await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
const code = await p.textContent('#house-code');
ok(/^[A-Z]+\d{2}$/.test(code), `house created with joinable code: ${code}`);

// two housemates join with the code (same flow the real app uses)
await p.evaluate(() => {
  const extra = [
    { id: 'u2', name: 'Sam Okafor', email: 'sam@example.com', venmo: 'sam-okafor' },
    { id: 'u3', name: 'Priya Raman', email: 'priya@example.com', venmo: 'priya-raman' }
  ];
  const hs = JSON.parse(localStorage.getItem('hc:houses'));
  const c = JSON.parse(localStorage.getItem('hc:cur'));
  extra.forEach(e => hs[c].members.push(e));
  localStorage.setItem('hc:houses', JSON.stringify(hs));
});
await p.reload({ waitUntil: 'networkidle' });
ok((await p.evaluate(() => H().members.length)) === 3, '3 housemates in the household');

/* ── 3. Barcode -> Open Food Facts (REAL network lookup) ── */
log('\n=== 3. BARCODE SCAN -> PRODUCT + IMAGE ===');
await p.evaluate(() => onBarcode('0049000042566'));
await p.waitForFunction(() => H().pantry.length > 0 && H().pantry[0].name !== 'Item 0049000042566', null, { timeout: 15000 });
const item = await p.evaluate(() => H().pantry[0]);
log(`  looked up 0049000042566 -> "${item.name}" / ${item.brand} / ${item.size}`);
ok(!!item.name && item.name !== 'Item 0049000042566', 'real product name from Open Food Facts');
ok(/^https?:\/\//.test(item.img), 'real product image URL attached');
// manual item too
await p.evaluate(() => { H().pantry.unshift({ id: 'm1', name: 'Oat milk', brand: 'Oatly', size: '64 oz', img: '', by: 'Kaylee Renaud', at: Date.now() }); save(); render(); });
ok((await p.evaluate(() => H().pantry.length)) === 2, 'manual item added alongside scanned one');
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/v-pantry.png' });

/* ── 4. Receipt OCR (REAL Tesseract on real pixels) ── */
log('\n=== 4. RECEIPT OCR ===');
await p.click('[data-ref="tab-receipt-btn"]');
ok(await p.evaluate(() => !document.querySelector('[data-ref="demo-receipt-btn"]')), 'sample-receipt shortcut is gone');
// the REAL user path: hand it a photo of a receipt
await p.setInputFiles('#receipt-file', '/tmp/receipt.png');
await p.waitForSelector('#receipt-edit:not(.hide)', { timeout: 120000 });
const store = await p.inputValue('[data-ref="store-name-input"]');
log(`  store detected from the receipt: "${store}"`);
ok(/green valley/i.test(store), 'store name read off the receipt and shown');
const parsed = await p.evaluate(() => ({ lines: LINES.map(l => [l.name, l.price]), tax: RCPT.tax, total: RCPT.total }));
log('  OCR parsed ' + parsed.lines.length + ' line items:');
parsed.lines.forEach(([n, v]) => log(`     ${n.padEnd(24)} ${v.toFixed(2)}`));
log(`  tax=${parsed.tax}  printed total=${parsed.total}`);
ok(parsed.lines.length >= 10, 'OCR found the line items (>=10 of 12)');
ok(parsed.tax > 0, 'tax detected and held out of the item list');
ok(!parsed.lines.some(([n]) => /total|tax|subtotal/i.test(n)), 'SUBTOTAL/TAX/TOTAL rows not treated as items');

/* ── 5. Select WHICH items to split (the core ask) ── */
log('\n=== 5. CHOOSE WHAT TO SPLIT ===');
await p.evaluate(() => {
  // Kaylee's ice cream + olive oil are hers alone; cold brew is only her + Sam
  LINES.forEach(l => { if (/ICE CREAM|OLIVE OIL/i.test(l.name)) l.split = false; });
  const cb = LINES.find(l => /COLD BREW/i.test(l.name));
  if (cb) cb.who = ['u1', 'u2'];
  renderLines();
});
const s = await p.evaluate(() => computeSplit());
log(`  shared=${s.shared.toFixed(2)}  unshared(mine)=${s.mine.toFixed(2)}  tax=${s.tax.toFixed(2)}  grand=${s.grand.toFixed(2)}`);
log(`  owed: ` + JSON.stringify(Object.fromEntries(Object.entries(s.owed).map(([k, v]) => [k, +v.toFixed(2)]))));
ok(s.mine > 0, 'unticked items stay 100% on the payer');
const sum = Object.values(s.owed).reduce((a, v) => a + v, 0) + s.mine + s.taxMine;
ok(Math.abs(sum - s.grand) < 0.01, `split is conservative: parts (${sum.toFixed(2)}) == receipt grand total (${s.grand.toFixed(2)})`);
ok(Math.abs(s.grand - parsed.total) < 0.03, `computed total matches the receipt's PRINTED total (${parsed.total})`);
const cbShare = await p.evaluate(() => { const l = LINES.find(x => /COLD BREW/i.test(x.name)); return l ? l.who.length : 0; });
ok(cbShare === 2, 'per-item sharers respected (cold brew split 2 ways, not 3)');
await p.screenshot({ path: '/tmp/v-split.png', fullPage: true });

/* ── 6. Settle -> Venmo link ── */
log('\n=== 6. SETTLE + VENMO ===');
await p.click('[data-ref="settle-btn"]');
await p.waitForSelector('#tab-settle:not(.hide)');
await p.waitForTimeout(400);
await p.click('[data-ref="square-up-btn"]');
await p.waitForTimeout(400);
const links = await p.$$eval('[data-ref="venmo-btn"]', els => els.map(e => e.href));
links.forEach(l => log('  ' + l));
ok(links.length === 2, 'a Venmo request link per housemate who owes');
ok(links.every(l => /venmo\.com\/.+txn=charge&amount=\d+\.\d\d/.test(l)), 'links are valid pre-filled Venmo charge URLs');
await p.screenshot({ path: '/tmp/v-settle.png' });
// running balance: recording a payment reduces it rather than wiping trips
const before = await p.evaluate(() => Object.values(netOwed()).reduce((a,v)=>a+v,0));
await p.evaluate(() => { const n = netOwed(); const uid = Object.keys(n)[0]; recordPayment(uid, 10, true); });
await p.waitForTimeout(300);
const after = await p.evaluate(() => Object.values(netOwed()).reduce((a,v)=>a+v,0));
log(`  balance ${before.toFixed(2)} -> ${after.toFixed(2)} after a $10 payment`);
ok(Math.abs((before - after) - 10) < 0.01, 'recording a payment moves the running balance by exactly that amount');
ok(await p.evaluate(() => H().trips.length === 1), 'trips are NOT wiped when settling (Splitwise model)');

/* ── 7. Spending tracking, per house ── */
log('\n=== 7. SPENDING ===');
await p.click('[data-ref="tab-spend-btn"]');
await p.waitForTimeout(400);
const st = await p.evaluate(() => ({ house: $('#s-house').textContent, me: $('#s-me').textContent, trips: $('#s-trips').textContent }));
log(`  house total ${st.house} · your share ${st.me} · ${st.trips} trip(s)`);
ok(st.trips === '1' && st.house !== '$0', 'trip recorded into this household ledger');
ok((await p.textContent('#history')).includes('Green Valley'), 'trip history is titled by store');
await p.screenshot({ path: '/tmp/v-spend.png', fullPage: true });

log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
await b.close();
process.exit(fails ? 1 : 0);
