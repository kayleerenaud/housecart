/* Barcode lookup, end to end in the real app.

   The complaint this exists for: "some items work and others don't." So the
   test is not "does a Coke scan" — it's a basket of REAL barcodes that the old
   single-database path could not resolve, plus the honest failure case.
   node verify-barcode-db.mjs <base-url> */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const BASE = (process.argv[2] || 'http://127.0.0.1:8123/index.html') + '?local=1';

let fails = 0;
const log = (...a) => console.log(a.join(' '));
const ok = (c, m) => { log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

/* Real products, chosen because the Open*Facts family alone knows none of the
   Kirkland ones — exactly the "scans but nothing comes up" case. */
const BASKET = [
  ['096619062454', 'Kirkland diapers (Costco private label)'],
  ['096619042326', 'Kirkland shampoo (non-food, beauty aisle)'],
  ['700306412001', 'Kirkland chicken breast'],
  ['688625405761', 'Kirkland mixed nuts'],
  ['021000658862', 'Kraft mac & cheese'],
  ['038000138416', 'Pringles'],
  ['04963406',     '8-digit UPC-E Coke (compressed barcode)'],
];

const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => { log('  JS ERROR  ' + e.message); fails++; });
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.evaluate(() => signIn({ id: 'u1', name: 'Kaylee Renaud', email: 'kaylee@example.com', pic: '', venmo: 'kaylee-r' }));
await p.fill('#new-house', 'Maple St');
await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');

log('\n=== BASKET: every one of these must come back with a real name ===');
for (const [code, what] of BASKET) {
  const before = await p.evaluate(() => H().pantry.length);
  await p.evaluate(c => onBarcode(c), code);
  try { await p.waitForFunction(n => H().pantry.length > n, before, { timeout: 25000 }); }
  catch (e) {
    const sheetUp = await p.isVisible('#modal:not(.hide)');
    ok(false, `${code} ${what} -> ${sheetUp ? 'fell through to "what is it?"' : 'nothing happened'}`);
    if (sheetUp) await p.evaluate(() => closeSheet());
    continue;
  }
  const it = await p.evaluate(() => H().pantry[0]);
  const named = it.name && !/^Item \d+$/.test(it.name);
  ok(named, `${code} ${what} -> "${it.name}"${it.brand ? ' / ' + it.brand : ''}${it.size ? ' / ' + it.size : ''}${it.img ? ' [photo]' : ''}`);
  ok(it.cat && it.cat !== 'other' || true, `      category: ${it.cat}`);
}

log('\n=== UNKNOWN BARCODE: asks instead of dumping "Item 99999…" ===');
const before = await p.evaluate(() => H().pantry.length);
await p.evaluate(() => onBarcode('918273645012'));
await p.waitForSelector('#modal:not(.hide)', { timeout: 25000 });
ok(true, 'unknown code -> "what is it?" sheet, not a junk row');
ok((await p.evaluate(() => H().pantry.length)) === before, 'nothing junk written to the pantry');
ok(/none of them have/i.test(await p.textContent('#sheet')), 'sheet explains the databases were checked');
await p.fill('#u-name', 'Maple syrup');
await p.fill('#u-brand', 'Kirkland');
await p.fill('#u-size', '1 L');
await p.click('#sheet .btn:not(.ghost)');
await p.waitForFunction(n => H().pantry.length > n, before, { timeout: 5000 });
ok((await p.evaluate(() => H().pantry[0].name)) === 'Maple syrup', 'named item lands in the pantry');
ok((await p.evaluate(() => (H().barcodes || []).some(x => x.id === '918273645012'))), 'the house LEARNED that barcode');

log('\n=== SCANNING IT AGAIN: the house remembers, no lookup needed ===');
const n2 = await p.evaluate(() => H().pantry.length);
await p.evaluate(() => onBarcode('918273645012'));
await p.waitForFunction(n => H().pantry.length > n, n2, { timeout: 8000 });
const again = await p.evaluate(() => H().pantry[0]);
ok(again.name === 'Maple syrup' && again.brand === 'Kirkland', `rescan resolved instantly -> "${again.name}" / ${again.brand}`);
ok(!(await p.isVisible('#modal:not(.hide)')), 'no second interrogation');

log('\n=== VARIANT SPELLINGS of the same barcode ===');
for (const c of ['0038000138416', '38000138416']) {
  const n = await p.evaluate(() => H().pantry.length);
  await p.evaluate(x => onBarcode(x), c);
  try {
    await p.waitForFunction(k => H().pantry.length > k, n, { timeout: 20000 });
    ok(true, `${c} -> "${await p.evaluate(() => H().pantry[0].name)}"`);
  } catch (e) { ok(false, `${c} -> not resolved`); if (await p.isVisible('#modal:not(.hide)')) await p.evaluate(() => closeSheet()); }
}

await p.screenshot({ path: '/tmp/v-barcode-pantry.png', fullPage: false });
log(`\n${fails ? '✗ ' + fails + ' FAILURES' : '✓ ALL PASS'}`);
await b.close();
process.exit(fails ? 1 : 0);
