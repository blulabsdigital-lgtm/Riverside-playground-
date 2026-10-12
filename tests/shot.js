// Usage: node tests/shot.js <url> <out.png> [width] [height] [fullPage]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [url, out, w = '1280', h = '800', full = '1'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: out, fullPage: full === '1' });
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
