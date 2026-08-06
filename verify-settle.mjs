/* Settling up: pairwise balances, and the opt-in shortening.
   The thing being guarded is that shortening moves the SAME money — nobody
   pays more than they owe, nobody receives less than they're due, and the cents
   still add up. node verify-settle.mjs <base-url> */
import pw from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const BASE = (process.argv[2] || 'http://127.0.0.1:8123/index.html') + '?local=1';

let fails = 0;
const log = (...a) => console.log(a.join(' '));
const ok = (c, m) => { log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => { log('  JS ERROR  ' + e.message); fails++; });
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.evaluate(() => signIn({ id: 'u1', name: 'Kaylee Renaud', email: 'k@example.com', pic: '', venmo: 'kaylee-r' }));
await p.fill('#new-house', 'Maple St');
await p.click('[data-ref="create-house-btn"]');
await p.waitForSelector('#app:not(.hide)');
await p.evaluate(() => {
  H().members.push({ id: 'u2', name: 'Sam Okafor', venmo: 'sam-o' },
                   { id: 'u3', name: 'Jenny Park', venmo: 'jenny-p' });
  save(); render();
});

/* debt(x, y, n) — x owes y n dollars, expressed the way a real trip does:
   y paid, and x's share of it was n. */
const seed = (debts) => p.evaluate(ds => {
  const nm = id => (H().members.find(m => m.id === id) || {}).name || id;
  H().trips = ds.map(([from, to, amt], i) => ({
    id: 't' + i, at: Date.now() + i, store: 'Shop', payer: to, payerName: nm(to),
    items: [{ name: 'Groceries', price: amt, split: true, who: [from] }],
    owed: { [from]: amt }, total: amt, shared: amt,
  }));
  H().payments = [];
  save(); render();
}, debts);

const state = () => p.evaluate(() => ({
  pairwise: netOwed(),
  transfers: simplifiedTransfers(),
  net: houseNetCents(),
}));

log('\n=== 1. TWO PEOPLE, EQUAL AND OPPOSITE ===');
await seed([['u2', 'u3', 5], ['u3', 'u2', 5]]);
let s = await state();
ok(s.transfers.length === 0, `Sam owes Jenny $5, Jenny owes Sam $5 -> ${s.transfers.length} payments (expected 0)`);

log('\n=== 2. A THREE-WAY CIRCLE ===');
await seed([['u1', 'u2', 10], ['u2', 'u3', 10], ['u3', 'u1', 10]]);
s = await state();
ok(s.transfers.length === 0, `everyone owes the next person $10 -> ${s.transfers.length} payments (expected 0)`);
ok(Object.values(s.net).every(v => v === 0), 'nobody is up or down a cent');

log('\n=== 3. A CHAIN COLLAPSES TO ONE PAYMENT ===');
await seed([['u1', 'u2', 10], ['u2', 'u3', 10]]);
s = await state();
log('  ' + s.transfers.map(t => `${t.from} pays ${t.to} $${t.amount.toFixed(2)}`).join(', '));
ok(s.transfers.length === 1, `Kaylee->Sam->Jenny becomes ${s.transfers.length} payment (expected 1)`);
ok(s.transfers[0].from === 'u1' && s.transfers[0].to === 'u3' && s.transfers[0].amount === 10,
   'Kaylee pays Jenny direct; Sam drops out of the middle');

log('\n=== 4. THE SAME MONEY, FEWER HOPS ===');
await seed([['u1', 'u2', 23.47], ['u2', 'u3', 11.02], ['u3', 'u1', 7.55], ['u1', 'u3', 4.13]]);
s = await state();
const net = s.net;
const moved = {};
s.transfers.forEach(t => { moved[t.from] = (moved[t.from] || 0) - Math.round(t.amount * 100); moved[t.to] = (moved[t.to] || 0) + Math.round(t.amount * 100); });
/* `moved` is what each person receives minus what they send. To land on zero it
   must exactly mirror the position they started in. */
const exact = Object.keys(net).every(u => (moved[u] || 0) === net[u]);
log('  net position (cents): ' + JSON.stringify(net));
log('  transfers: ' + s.transfers.map(t => `${t.from}->${t.to} $${t.amount.toFixed(2)}`).join(', '));
ok(exact, 'every person ends exactly square — to the cent');
const totalOut = s.transfers.reduce((a, t) => a + Math.round(t.amount * 100), 0);
const totalDebt = Object.values(net).filter(v => v < 0).reduce((a, v) => a - v, 0);
ok(totalOut === totalDebt, `total money moved (${totalOut}c) == total owed (${totalDebt}c) — nobody overpays`);
ok(s.transfers.length <= Object.keys(net).length - 1, `${s.transfers.length} payments for 3 people (never more than n-1)`);

log('\n=== 5. THE TOGGLE ===');
await p.click('[data-ref="tab-settle-btn"]');
ok(!(await p.isChecked('[data-ref="simplify-toggle"]')), 'off by default — nothing changes under anyone without asking');
const before = await p.textContent('#seesaw');
await p.check('[data-ref="simplify-toggle"]');
await p.waitForTimeout(200);
ok(await p.evaluate(() => !!H().simplify), 'turning it on stores it on the HOUSE, not just this phone');
const after = await p.textContent('#seesaw');
ok(before !== after, 'the balances on screen actually change when it is on');
log('  note reads: "' + (await p.textContent('#simplify-note')).trim() + '"');
await p.uncheck('[data-ref="simplify-toggle"]');
await p.waitForTimeout(200);
ok((await p.textContent('#seesaw')) === before, 'turning it off restores the direct balances exactly');

log('\n=== 6. SQUARE UP STILL WORKS FROM THE SHORTENED VIEW ===');
await p.check('[data-ref="simplify-toggle"]');
await p.waitForTimeout(200);
await p.click('[data-ref="square-up-btn"]');
await p.waitForSelector('#modal:not(.hide)');
const links = await p.$$eval('[data-ref="venmo-btn"]', els => els.map(e => e.getAttribute('href')));
log('  ' + links.join('\n  '));
ok(links.length > 0, 'a Venmo link per payment still to make');
ok(links.every(l => /^https:\/\/venmo\.com\/[^?]+\?txn=(charge|pay)&amount=\d+\.\d{2}&note=/.test(l)), 'links are valid pre-filled Venmo URLs');
const warned = await p.textContent('#sheet');
ok(/shortened/i.test(warned), 'the sheet warns you may be paying someone you never shopped with');
await p.evaluate(() => closeSheet());

log('\n=== 7. MARKING A PAYMENT STILL MOVES THE BALANCE ===');
const b1 = await p.evaluate(() => houseNetCents());
await p.evaluate(() => recordPayment('u3', 5, false));
const b2 = await p.evaluate(() => houseNetCents());
ok(b2.u1 === b1.u1 + 500 && b2.u3 === b1.u3 - 500, `paying Jenny $5 moves both by exactly 500c (${b1.u1}->${b2.u1}, ${b1.u3}->${b2.u3})`);

await p.click('[data-ref="tab-settle-btn"]');
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/v-settle.png' });
log(`\n${fails ? '✗ ' + fails + ' FAILURES' : '✓ ALL PASS'}`);
await b.close();
process.exit(fails ? 1 : 0);
