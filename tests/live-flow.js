const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const errs = [];
  // Desktop: side by side
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto((process.env.BASE || 'http://127.0.0.1:8765') + '/live/', { waitUntil: 'load' });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '-1-desktop.png' });
  await p.click('#crew [data-act="stage"]'); await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '-2-desktop-after.png' });
  await p.click('#crew [data-note="delivery"]'); await p.waitForTimeout(300);
  await p.click('#crew [data-team="priya"]'); await p.waitForTimeout(300);
  await p.setInputFiles('#crew input[type=file]', '/tmp/claude-0/-home-user-ZEN-/4865f091-526f-5d8b-91c3-5765ed286eec/scratchpad/house.png'); await p.waitForTimeout(800);
  await p.click('#cust [data-act="plan"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '-3-desktop-photo.png' });
  await p.click('#cust [data-act="confirm"]'); await p.waitForTimeout(400);
  const crewNeed = await p.locator('#crew .c-cust').innerText();
  for (let i = 0; i < 6; i++) { await p.click('#crew [data-act="stage"]'); await p.waitForTimeout(250); }
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '-4-desktop-done.png' });
  const strip = await p.locator('#strip').innerText();
  // Mobile: tabs
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  m.on('pageerror', e => errs.push('m pageerror: ' + e.message));
  await m.goto((process.env.BASE || 'http://127.0.0.1:8765') + '/live/', { waitUntil: 'load' });
  await m.evaluate(() => localStorage.clear()); await m.reload({ waitUntil: 'load' }); await m.waitForTimeout(400);
  const o1 = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await m.screenshot({ path: OUT + '-5-mobile-cust.png', fullPage: true });
  await m.click('#tabCrew'); await m.waitForTimeout(300);
  await m.screenshot({ path: OUT + '-6-mobile-crew.png', fullPage: true });
  await m.click('#crew [data-act="stage"]'); await m.waitForTimeout(300);
  await m.click('#tabCust'); await m.waitForTimeout(600);
  const now = await m.locator('#cust .l-now').innerText();
  const o2 = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log('crew need:', crewNeed.replace(/\n/g, ' '));
  console.log('strip:', strip.replace(/\n/g, ' | '));
  console.log('mobile now chip after crew tap:', now, '| overflow', o1, o2);
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
