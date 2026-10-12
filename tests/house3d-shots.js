// Screenshots and checks for the 3D house engine (assets/house3d.js) through tests/house3d.html.
// Usage: node tests/house3d-shots.js <out-prefix>   (BASE env, default http://127.0.0.1:8765)
// Each scene is shot at 800x500 and as a 390x300 phone crop, then drag, tap, touch and API checks run.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/house3d';
const BASE = (process.env.BASE || 'http://127.0.0.1:8765') + '/tests/house3d.html?';

const SCENES = [
  ['semi-0-hints', 'type=semi&depth=0&hints=1'],
  ['terrace-3', 'type=terrace&depth=3'],
  ['semi-4.5-loft', 'type=semi&depth=4.5&loft=1'],
  ['detached-8-upper-loft', 'type=detached&depth=8&upper=1&loft=1']
];
for (let s = 0; s <= 9; s++) SCENES.push(['build-' + s, 'type=semi&depth=5&stage=' + s]);
SCENES.push(['build-complete', 'type=semi&depth=5&stage=9&complete=1']);

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const watch = (p, tag) => {
    p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL/.test(m.text())) errs.push(tag + ' console: ' + m.text()); });
  };
  async function open(p, q) {
    await p.goto(BASE + q, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    const e = await p.evaluate(() => window.__error);
    if (e) throw new Error('createHouse3D failed: ' + e);
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  /* 1. Scenes at desktop and phone size */
  for (const [w, h, tag] of [[800, 500, ''], [390, 300, '-phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    watch(p, w + 'px');
    for (const [name, q] of SCENES) {
      await open(p, q);
      await p.waitForTimeout(700);
      await p.screenshot({ path: OUT + '-' + name + tag + '.png' });
      const o = await overflow(p);
      if (o > 0) fails.push(name + tag + ': horizontal overflow ' + o + 'px');
    }
    await p.close();
  }
  console.log('scenes shot: ' + SCENES.length * 2);

  /* Full page at phone and desktop sizes: no overflow, labels inside the view */
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    watch(p, w + 'x' + h);
    await open(p, 'type=semi&depth=0&hints=1');
    await p.waitForTimeout(700);
    await p.screenshot({ path: OUT + '-page-' + w + '.png' });
    check(await overflow(p) <= 0, w + 'x' + h + ': no horizontal overflow');
    const out = await p.evaluate(() => [...document.querySelectorAll('.h3d-label.h3d-on')].filter(l => { const r = l.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight; }).length);
    check(out === 0, w + 'x' + h + ': hint labels stay inside the view');
    await p.close();
  }

  /* 2. Drag the handle out and tap the roofs (mouse) */
  {
    const p = await b.newPage({ viewport: { width: 800, height: 500 } });
    watch(p, 'drag');
    await open(p, 'type=semi&depth=0&hints=1');
    await p.waitForTimeout(400);
    const hd = await p.evaluate(() => window.__house._debug.handle());
    const to = await p.evaluate(() => window.__house._debug.screen(0, 1.2, 4.4));
    await p.mouse.move(hd.x, hd.y); await p.mouse.down();
    for (let i = 1; i <= 24; i++) { await p.mouse.move(hd.x + (to.x - hd.x) * i / 24, hd.y + (to.y - hd.y) * i / 24); await p.waitForTimeout(16); }
    await p.screenshot({ path: OUT + '-drag-during.png' });
    await p.mouse.up(); await p.waitForTimeout(900);
    const ev = await p.evaluate(() => window.__events);
    const depths = ev.filter(e => e[0] === 'depth').map(e => e[1]);
    check(depths.length >= 4, 'drag fires depth events (' + depths.join(', ') + ')');
    check(depths.every((d, i) => i === 0 || d > depths[i - 1]), 'depth events increase while dragging out');
    check(depths.every(d => Math.abs(d * 2 - Math.round(d * 2)) < 1e-9), 'depth events are snapped to 0.5 m');
    const ch = ev.filter(e => e[0] === 'change');
    check(ch.length === 1 && ch[0][1].depth === depths[depths.length - 1], 'one change event on release with the final depth (' + (ch[0] && ch[0][1].depth) + ')');
    await p.screenshot({ path: OUT + '-drag-after.png' });

    const r = await p.evaluate(() => window.__house._debug.roof());
    await p.mouse.click(r.x, r.y); await p.waitForTimeout(900);
    let st = await p.evaluate(() => window.__house.getState());
    const tg = (await p.evaluate(() => window.__events)).filter(e => e[0] === 'toggle');
    check(st.loft === true && tg.length && tg[tg.length - 1][1].key === 'loft' && tg[tg.length - 1][1].value === true, 'tap on the main roof adds the loft');
    await p.screenshot({ path: OUT + '-tap-loft.png' });
    const er = await p.evaluate(() => window.__house._debug.extRoof());
    await p.mouse.click(er.x, er.y); await p.waitForTimeout(900);
    st = await p.evaluate(() => window.__house.getState());
    check(st.upper === true, 'tap on the extension roof adds the floor above');
    await p.screenshot({ path: OUT + '-tap-upper.png' });
    await p.mouse.click(r.x, r.y); await p.waitForTimeout(700);
    check((await p.evaluate(() => window.__house.getState().loft)) === false, 'second tap on the main roof removes the loft');

    // Rendering is on demand: nothing animates, so no frames
    await p.mouse.move(5, 5); await p.waitForTimeout(600);
    const r0 = await p.evaluate(() => window.__house._debug.renders()); await p.waitForTimeout(1000);
    const r1 = await p.evaluate(() => window.__house._debug.renders());
    check(r1 - r0 === 0, 'idle scene renders no frames (' + (r1 - r0) + ' in 1 s)');

    // API: set animates, toDataURL returns a PNG, upper needs 2 m
    await p.evaluate(() => { window.__events = []; window.__house.set({ depth: 1.5 }); });
    await p.waitForTimeout(80);
    const mid = await p.evaluate(() => window.__house._debug.handle());
    await p.waitForTimeout(900);
    const end = await p.evaluate(() => window.__house._debug.handle());
    check(Math.hypot(mid.x - end.x, mid.y - end.y) > 2, 'set({ depth }) eases rather than jumps');
    st = await p.evaluate(() => window.__house.getState());
    check(st.depth === 1.5 && st.upper === false, 'depth under 2 m removes the floor above');
    check((await p.evaluate(() => window.__events.length)) === 0, 'set() does not emit events');
    const url = await p.evaluate(() => window.__house.toDataURL(600, 360));
    check(/^data:image\/png;base64,/.test(url) && url.length > 20000, 'toDataURL gives a PNG (' + Math.round(url.length / 1024) + ' kB)');
    require('fs').writeFileSync(OUT + '-snapshot.png', Buffer.from(url.split(',')[1], 'base64'));
    await p.evaluate(() => window.__house.set({ type: 'detached', depth: 6, upper: true, loft: true }, { animate: false }));
    await p.waitForTimeout(400);
    st = await p.evaluate(() => window.__house.getState());
    check(st.type === 'detached' && st.maxDepth === 8 && st.upper && st.loft, 'set({ type }) rebuilds as detached with an 8 m limit');
    await p.screenshot({ path: OUT + '-set-detached.png' });
    await p.evaluate(() => window.__house.dispose());
    check((await p.evaluate(() => document.querySelectorAll('#stage canvas, #stage .h3d-layer').length)) === 0, 'dispose removes the canvas and labels');
    await p.close();
  }

  /* 3. Touch on a phone: vertical swipes scroll the page, the handle drags, a roof tap toggles */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    watch(p, 'touch');
    await open(p, 'type=semi&depth=0&hints=1&w=390&h=300&scroll=1');
    await p.waitForTimeout(400);
    const cdp = await ctx.newCDPSession(p);
    const swipe = async (x0, y0, x1, y1, n = 12) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= n; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n }] }); await p.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(500);
    };
    await swipe(40, 280, 40, 80);
    let y = await p.evaluate(() => scrollY);
    check(y > 50, 'vertical swipe over the 3D view scrolls the page (' + y + 'px)');
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    const o0 = await p.evaluate(() => window.__house._debug.screen(0, 0, 0));
    await swipe(110, 110, 300, 114);
    const o1 = await p.evaluate(() => window.__house._debug.screen(0, 0, 0));
    y = await p.evaluate(() => scrollY);
    check(y === 0 && Math.abs(o1.x - o0.x) > 5, 'horizontal swipe turns the house without scrolling');
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
    const hd = await p.evaluate(() => window.__house._debug.handle());
    const to = await p.evaluate(() => window.__house._debug.screen(0, 1.2, 4.4));
    await swipe(hd.x, hd.y, to.x, to.y, 16);
    const st = await p.evaluate(() => ({ d: window.__house.getState().depth, y: scrollY }));
    check(st.d >= 3 && st.y === 0, 'touch drag on the handle extends without scrolling (depth ' + st.d + ')');
    const r = await p.evaluate(() => window.__house._debug.roof());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(800);
    check(await p.evaluate(() => window.__house.getState().loft), 'touch tap on the roof adds the loft');
    await p.screenshot({ path: OUT + '-touch.png' });
    await ctx.close();
  }

  /* 4. Build mode: stages animate in; reduced motion stays still */
  {
    const p = await b.newPage({ viewport: { width: 800, height: 500 } });
    watch(p, 'build');
    await open(p, 'type=semi&depth=5&stage=1&interactive=0');
    await p.waitForTimeout(300);
    await p.evaluate(() => window.__house.setBuild({ stage: 2, complete: false }));
    await p.waitForTimeout(260);
    await p.screenshot({ path: OUT + '-build-anim.png' });
    await p.waitForTimeout(900);
    await p.evaluate(() => window.__house.setBuild({ stage: 9, complete: true }));
    await p.waitForFunction(() => window.__house._debug.busy().length === 0, null, { timeout: 10000 });
    await p.waitForTimeout(400);
    const r0 = await p.evaluate(() => window.__house._debug.renders()); await p.waitForTimeout(800);
    const r1 = await p.evaluate(() => window.__house._debug.renders());
    check(r1 - r0 === 0, 'finished build is idle (' + (r1 - r0) + ' frames)');
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await open(p, 'type=semi&depth=0&hints=1');
    await p.waitForTimeout(500);
    const a = await p.evaluate(() => window.__house._debug.renders()); await p.waitForTimeout(800);
    const c = await p.evaluate(() => window.__house._debug.renders());
    check(c - a === 0, 'reduced motion: hints do not animate (' + (c - a) + ' frames)');
    await p.close();
  }

  await b.close();
  if (errs.length) errs.forEach(e => fails.push(e));
  console.log(fails.length ? '\n' + fails.length + ' problem(s):\n' + fails.join('\n') : '\nall checks passed, no errors');
  process.exit(fails.length ? 1 : 0);
})();
