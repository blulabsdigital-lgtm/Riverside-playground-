const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = process.argv[2], W = +(process.argv[3] || 390), H = +(process.argv[4] || 844);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL/.test(m.text())) errs.push('console: ' + m.text()); });
  const overflow = async (tag) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(tag + ': horizontal overflow ' + o + 'px'); };
  await p.goto((process.env.BASE || 'http://127.0.0.1:8765') + '/extension/', { waitUntil: 'load' });
  await p.waitForTimeout(500); await overflow('pick');
  await p.screenshot({ path: OUT + '-1-pick.png' });
  await p.click('[data-type="semi"]'); await p.waitForTimeout(500); await overflow('builder');
  await p.screenshot({ path: OUT + '-2-start.png' });
  // drag the handle out by ~4.5 m
  const st = await p.locator('#stage').boundingBox();
  const sc = st.width / 420; const S = 17; const xr = 30 + 9 * S; const hy = 236 - 1.5 * S;
  const sx = st.x + (xr + 6) * sc, sy = st.y + (hy - 40) * (st.height / 226);
  await p.mouse.move(sx, sy); await p.mouse.down();
  await p.mouse.move(sx + 4.5 * S * sc - 6 * sc, sy, { steps: 12 });
  await p.screenshot({ path: OUT + '-3-dragging.png' });
  await p.mouse.up(); await p.waitForTimeout(600);
  const depth = await p.inputValue('#depth');
  // tap the loft hotspot
  await p.locator('[data-h="loft"]').click(); await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '-4-loft.png' });
  await p.screenshot({ path: OUT + '-5-full.png', fullPage: true });
  const stats = await p.evaluate(() => ['sArea', 'sPrice', 'sWeeks', 'sPlan', 'ideaText', 'headline'].map(i => i + '=' + document.getElementById(i).textContent));
  // upper floor via toggle button
  await p.click('#tUpper'); await p.waitForTimeout(500);
  const stats2 = await p.evaluate(() => ['sArea', 'sPrice', 'sWeeks', 'sPlan'].map(i => i + '=' + document.getElementById(i).textContent));
  await p.click('#book'); await p.waitForTimeout(400);
  await p.click('[data-demo]'); await p.click('button[type=submit]'); await p.waitForTimeout(900);
  await overflow('sheet');
  await p.evaluate(() => { const s = document.querySelector('.rv-sheet'); s.style.position = 'absolute'; s.style.alignItems = 'flex-start'; const pn = s.firstChild; pn.style.maxHeight = 'none'; pn.style.animation = 'none'; document.querySelectorAll('.rv-confetti').forEach(c => c.remove()); });
  await p.waitForTimeout(150);
  await p.locator('.rv-sheet-panel').screenshot({ path: OUT + '-6-pack.png' });
  console.log('depth after drag:', depth); console.log(stats.join('\n')); console.log('with upper:', stats2.join(' | '));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
