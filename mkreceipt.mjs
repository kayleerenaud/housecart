/* Renders a realistic grocery receipt to a PNG so tests exercise the REAL
   "photograph receipt" path (file input -> OCR), not a demo shortcut. */
import pw from '/usr/lib/node_modules/playwright/index.js';
import { writeFileSync } from 'fs';
const { chromium } = pw;
const b = await chromium.launch({args:['--no-sandbox']});
const p = await b.newPage();
const data = await p.evaluate(() => {
  const c = document.createElement('canvas'); c.width=520; c.height=700;
  const x = c.getContext('2d');
  x.fillStyle='#fff'; x.fillRect(0,0,520,700); x.fillStyle='#000';
  x.font='bold 26px monospace'; x.textAlign='center';
  x.fillText('GREEN VALLEY MARKET', 260, 52);
  x.font='16px monospace'; x.fillText('482 Maple St  (555) 019-2200', 260, 78);
  x.textAlign='left'; x.font='19px monospace';
  const rows=[['ORGANIC WHOLE MILK','4.99'],['SOURDOUGH LOAF','5.49'],['EGGS LARGE DOZ','6.29'],
    ['CHICKEN THIGHS','11.84'],['BANANAS 2.1LB','1.68'],['OAT MILK BARISTA','5.99'],
    ['PAPER TOWELS 6PK','12.99'],['DISH SOAP','3.79'],['COLD BREW 32OZ','7.49'],
    ['ICE CREAM MINT','5.29'],['OLIVE OIL 500ML','14.99'],['TRASH BAGS 45CT','9.99']];
  let y=124; rows.forEach(([n,pr])=>{ x.fillText(n,34,y); x.textAlign='right'; x.fillText(pr,486,y); x.textAlign='left'; y+=32; });
  y+=8; x.fillText('SUBTOTAL',34,y); x.textAlign='right'; x.fillText('90.82',486,y); x.textAlign='left'; y+=30;
  x.fillText('TAX',34,y); x.textAlign='right'; x.fillText('5.45',486,y); x.textAlign='left'; y+=32;
  x.font='bold 21px monospace'; x.fillText('TOTAL',34,y); x.textAlign='right'; x.fillText('96.27',486,y);
  return c.toDataURL('image/png');
});
writeFileSync('/tmp/receipt.png', Buffer.from(data.split(',')[1], 'base64'));
console.log('wrote /tmp/receipt.png');
await b.close();
