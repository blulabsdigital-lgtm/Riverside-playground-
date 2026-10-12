// Kitchen style match with a photo of the customer's kitchen and the restyle engine.
// Usage: node tests/kitchen-ai-flow.js <out-prefix> [width] [height] [scenario ...]
// Scenarios: off-photo, off-skip, on-early, on-restart, on-skip, not-kitchen, timeout, busy (default: all).
// The engine is mocked with page.route() at https://mock.supabase.co; nothing leaves the machine.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const OUT = process.argv[2], W = +(process.argv[3] || 390), H = +(process.argv[4] || 844);
const ONLY = process.argv.slice(5);
const ENGINE = 'https://mock.supabase.co';
const ENDPOINT = ENGINE + '/functions/v1/kitchen-restyle';
const DELAY = 3000;
// Card order: sage, ink, white, grey, oak, clay, forest, concrete, cream, brick. 1 = love, 0 = not for me.
const SEQ_STABLE = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0];  // Dark and dramatic at card 7 and at card 10 (only the twist changes)
const SEQ_CHANGE = [0, 0, 0, 0, 1, 0, 0, 1, 0, 1];  // Warm minimal at card 7, Urban loft at card 10
const SEQ_MIXED = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const failures = [];
function check(ok, msg) { if (!ok) failures.push(msg); console.log((ok ? '  ok   ' : '  FAIL ') + msg); }

/* ---------- Test images, drawn with canvas ---------- */
async function makeAssets(browser) {
  const dir = path.join(path.dirname(path.resolve(OUT)), 'kitchen-ai-assets');
  fs.mkdirSync(dir, { recursive: true });
  const p = await browser.newPage();
  await p.goto(BASE + '/tests/one.html#none');
  const out = await p.evaluate(async () => {
    function noise(ctx, w, h, amt) {
      const d = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * amt; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
      ctx.putImageData(d, 0, 0);
    }
    function vignette(ctx, w, h) {
      const g = ctx.createRadialGradient(w * 0.45, h * 0.4, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(255,248,230,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // A dated kitchen: pine doors, brown laminate, white tiles, vinyl floor.
    function kitchen(w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      const u = w / 100, v = h / 100;
      let g = x.createLinearGradient(0, 0, 0, h * 0.62); g.addColorStop(0, '#E4D8BE'); g.addColorStop(1, '#CDBF9F');
      x.fillStyle = g; x.fillRect(0, 0, w, h * 0.66);
      x.fillStyle = '#F2EEE4'; x.fillRect(0, 0, w, v * 4);
      // window
      x.fillStyle = '#F7F5F0'; x.fillRect(u * 8, v * 14, u * 22, v * 26);
      g = x.createLinearGradient(0, v * 15, 0, v * 39); g.addColorStop(0, '#BFD6E6'); g.addColorStop(1, '#E9EEF0');
      x.fillStyle = g; x.fillRect(u * 9, v * 15.5, u * 20, v * 23);
      x.fillStyle = '#7F9A72'; x.beginPath(); x.ellipse(u * 15, v * 38, u * 9, v * 6, 0, 0, 7); x.fill();
      x.fillStyle = '#F7F5F0'; x.fillRect(u * 18.6, v * 15.5, u * 0.8, v * 23); x.fillRect(u * 9, v * 26, u * 20, v * 0.8);
      // wall cupboards
      const pine = '#C38C51', pineDark = '#A06F3B';
      for (let i = 0; i < 4; i++) {
        const x0 = u * (36 + i * 15.5);
        x.fillStyle = pineDark; x.fillRect(x0, v * 6, u * 15, v * 30);
        x.fillStyle = pine; x.fillRect(x0 + u * 0.6, v * 6.6, u * 13.8, v * 28.8);
        x.strokeStyle = 'rgba(80,45,15,.45)'; x.lineWidth = u * 0.35; x.strokeRect(x0 + u * 2, v * 9, u * 11, v * 23);
        x.fillStyle = '#D9D9D9'; x.fillRect(x0 + (i % 2 ? u * 1.6 : u * 12.4), v * 27, u * 0.7, v * 5);
      }
      // tiles
      x.fillStyle = '#F4F2EC'; x.fillRect(0, v * 40, w, v * 15);
      x.strokeStyle = 'rgba(150,140,125,.55)'; x.lineWidth = Math.max(1, u * 0.15);
      for (let ty = v * 40; ty < v * 55; ty += v * 3.7) { x.beginPath(); x.moveTo(0, ty); x.lineTo(w, ty); x.stroke(); }
      for (let tx = 0; tx < w; tx += u * 2.8) { x.beginPath(); x.moveTo(tx, v * 40); x.lineTo(tx, v * 55); x.stroke(); }
      x.fillStyle = 'rgba(70,110,170,.55)';
      for (let k = 0; k < 7; k++) x.fillRect(u * (12 + k * 12.6), v * 47.4, u * 2.8, v * 3.7);
      // worktop
      x.fillStyle = '#6E5440'; x.fillRect(0, v * 55, w, v * 3.4);
      x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, v * 55, w, v * 0.6);
      for (let k = 0; k < 900; k++) { x.fillStyle = Math.random() > 0.5 ? 'rgba(40,25,15,.5)' : 'rgba(200,170,140,.4)'; x.fillRect(Math.random() * w, v * 55.4 + Math.random() * v * 2.8, 2, 2); }
      // base units, oven
      for (let i = 0; i < 6; i++) {
        const x0 = u * (i * 16.8);
        x.fillStyle = pineDark; x.fillRect(x0, v * 58.4, u * 16.6, v * 30);
        if (i === 3) {
          x.fillStyle = '#E9E9E6'; x.fillRect(x0 + u * 0.5, v * 59, u * 15.6, v * 29);
          x.fillStyle = '#2B2B2B'; x.fillRect(x0 + u * 2, v * 66, u * 12.6, v * 17);
          x.fillStyle = '#BDBDBD'; x.fillRect(x0 + u * 2, v * 62, u * 12.6, v * 1.2);
          continue;
        }
        x.fillStyle = pine; x.fillRect(x0 + u * 0.5, v * 59, u * 15.6, v * 6);
        x.fillRect(x0 + u * 0.5, v * 65.6, u * 15.6, v * 22.4);
        x.strokeStyle = 'rgba(80,45,15,.45)'; x.lineWidth = u * 0.3; x.strokeRect(x0 + u * 2.2, v * 68, u * 12.2, v * 17.6);
        x.fillStyle = '#D9D9D9'; x.fillRect(x0 + u * 6.5, v * 61.6, u * 3.6, v * 0.9);
      }
      x.fillStyle = '#3B2A1C'; x.fillRect(0, v * 88.4, w, v * 1.8);
      // vinyl floor
      x.fillStyle = '#CFC6B3'; x.fillRect(0, v * 90.2, w, v * 10);
      x.strokeStyle = 'rgba(120,105,85,.5)';
      for (let k = -10; k < 20; k++) { x.beginPath(); x.moveTo(w / 2 + (k - 5) * u * 4, v * 90.2); x.lineTo(w / 2 + (k - 5) * u * 9, h); x.stroke(); }
      // kettle and a pot plant
      x.fillStyle = '#E8E8E8'; x.beginPath(); x.ellipse(u * 85, v * 51.5, u * 3, v * 4, 0, 0, 7); x.fill();
      x.fillStyle = '#5E7F4E'; x.beginPath(); x.ellipse(u * 8, v * 50, u * 3.5, v * 5, 0, 0, 7); x.fill();
      x.fillStyle = '#A85A3A'; x.fillRect(u * 6, v * 51, u * 4, v * 4);
      vignette(x, w, h); noise(x, w, h, 14);
      return c.toDataURL('image/jpeg', 0.9);
    }
    // Not a kitchen: a garden.
    function garden(w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      let g = x.createLinearGradient(0, 0, 0, h * 0.6); g.addColorStop(0, '#8DB7DA'); g.addColorStop(1, '#DCE9EF');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#8B6E4E'; for (let i = 0; i < w; i += w / 14) x.fillRect(i, h * 0.42, w / 15, h * 0.2);
      g = x.createLinearGradient(0, h * 0.6, 0, h); g.addColorStop(0, '#6F9B4F'); g.addColorStop(1, '#4C7535');
      x.fillStyle = g; x.fillRect(0, h * 0.6, w, h * 0.4);
      x.fillStyle = '#3F6A2E'; x.beginPath(); x.ellipse(w * 0.72, h * 0.36, w * 0.16, h * 0.22, 0, 0, 7); x.fill();
      x.fillStyle = '#5B4330'; x.fillRect(w * 0.705, h * 0.5, w * 0.03, h * 0.16);
      vignette(x, w, h); noise(x, w, h, 12);
      return c.toDataURL('image/jpeg', 0.9);
    }
    // Mock engine output: the illustration of a kitchen in each style, at 4:3, marked as a mock.
    const BY_STYLE = { 'Classic Shaker': 'cream', 'Sleek modern': 'white', 'Warm minimal': 'oak', 'Dark and dramatic': 'ink', 'Urban loft': 'brick' };
    const images = {};
    for (const [name, id] of Object.entries(BY_STYLE)) {
      const card = KitchenArt.CARDS.find(c => c.id === id);
      const svg = KitchenArt.svg(card).replace('<svg ', '<svg width="1280" height="960" ');
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const c = document.createElement('canvas'); c.width = 1280; c.height = 960; const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 1280, 960);
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(900, 900, 370, 46);
      x.fillStyle = '#fff'; x.font = '700 24px sans-serif'; x.fillText('Mock engine: ' + name, 916, 931);
      images[name] = c.toDataURL('image/png');
    }
    return { kitchen: kitchen(1600, 1200), kitchenTall: kitchen(1200, 1600), garden: garden(1600, 1200), images };
  });
  await p.close();
  const save = (name, dataUrl) => { const f = path.join(dir, name); fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64')); return f; };
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'Not a photo.');
  return { notPhoto: path.join(dir, 'notes.txt'), kitchen: save('kitchen-today.jpg', out.kitchen), kitchenTall: save('kitchen-today-tall.jpg', out.kitchenTall),
    garden: save('garden.jpg', out.garden), images: out.images };
}

/* ---------- Page helpers ---------- */
async function newPage(browser, opts) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [], allow = opts.allowConsole || null;
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error' || /ERR_TUNNEL|website-files/.test(m.text())) return;
    if (allow && allow.test(m.text())) return;
    errs.push('console: ' + m.text());
  });
  const engineCalls = [];
  page.on('request', r => { if (r.url().indexOf('kitchen-restyle') >= 0 && r.method() === 'POST') engineCalls.push(r); });
  if (opts.engine) {
    await page.addInitScript(url => {
      Object.defineProperty(window, 'RV_KITCHEN_ENGINE', { configurable: true, get() { return { url, anonKey: 'test-anon-key' }; }, set() {} });
    }, ENGINE);
  }
  if (opts.clock) await page.clock.install();
  page._errs = errs; page._engineCalls = engineCalls;
  return page;
}

// behaviour(call, n) -> { delay, status, json } or { hang: true }
async function mockEngine(page, behaviour) {
  const calls = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route(ENDPOINT, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    const call = { t: Date.now(), style: body.style, photo: body.photo, headers: req.headers(), state: 'pending', req };
    calls.push(call);
    const res = await behaviour(call, calls.length);
    if (res.hang) return;
    await sleep(res.delay || 0);
    try {
      await route.fulfill({ status: res.status || 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(res.json) });
      if (call.state === 'pending') call.state = 'fulfilled';
    } catch (e) { if (call.state === 'pending') call.state = 'gone'; }
  });
  page.on('requestfailed', r => { const c = calls.find(x => x.req === r); if (c) c.state = 'aborted'; });
  return calls;
}
const okImage = images => call => ({ delay: DELAY, json: { ok: true, image: images[call.style.styleName], ms: DELAY } });

async function overflow(page, tag) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(o <= 0, tag + ': no horizontal overflow' + (o > 0 ? ' (' + o + 'px)' : ''));
}
async function shot(page, scenario, name, full) {
  await page.screenshot({ path: OUT + '-' + scenario + '-' + name + '.png', fullPage: !!full });
}
async function addPhoto(page, file, button) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(button || '#add')]);
  await fc.setFiles(file);
}
// Swipe the deck; afterEach(i) runs after card i (1-based) has gone.
async function swipe(page, seq, afterEach) {
  await page.waitForSelector('.k-card.top');
  for (let i = 0; i < seq.length; i++) {
    await page.click(seq[i] ? '#love' : '#nope');
    await page.waitForTimeout(380);
    if (afterEach) await afterEach(i + 1);
  }
}
async function openPack(page, scenario) {
  await page.click('[data-size="medium"]'); await page.waitForTimeout(600);
  await page.click('#book'); await page.waitForTimeout(400);
  await page.click('[data-demo]'); await page.click('button[type=submit]'); await page.waitForTimeout(800);
  await overflow(page, scenario + ' brief');
  await page.evaluate(() => { const s = document.querySelector('.rv-sheet'); s.style.position = 'absolute'; s.style.alignItems = 'flex-start'; const pn = s.firstChild; pn.style.maxHeight = 'none'; pn.style.animation = 'none'; document.querySelectorAll('.rv-confetti').forEach(c => c.remove()); });
  await page.waitForTimeout(150);
  await page.locator('.rv-sheet-panel').screenshot({ path: OUT + '-' + scenario + '-pack.png' });
  return page.evaluate(() => ({
    labels: [...document.querySelectorAll('.rv-sheet .rv-pack-label')].map(e => e.textContent),
    imgs: [...document.querySelectorAll('.rv-sheet .k-pack-fig img')].map(i => i.src.slice(0, 22)),
    wa: document.querySelector('.rv-wa-bubble').innerText
  }));
}
const heroInfo = page => page.evaluate(() => ({
  ai: !!document.querySelector('.k-hero.k-ai:not(.k-working)'),
  working: !!document.querySelector('.k-working'),
  today: !!document.querySelector('.k-today'),
  note: (document.querySelector('.k-note') || {}).innerText || '',
  after: (document.querySelector('.k-after') || {}).src || '',
  tag: (document.querySelector('#hero-tag') || {}).textContent || ''
}));

/* ---------- Scenarios ---------- */
const scenarios = {
  // (a) Engine off, with a photo: honest illustrated result, their photo as a thumbnail and in the brief.
  async 'off-photo'(browser, A) {
    const page = await newPage(browser, {});
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(500);
    check(await page.isVisible('text=Add a photo of your kitchen'), 'intro shows the photo button');
    check(await page.isVisible('text=Skip, just swipe'), 'intro shows the skip link');
    await overflow(page, 'off-photo intro'); await shot(page, 'off-photo', '1-intro');
    await addPhoto(page, A.notPhoto);
    await page.waitForTimeout(300);
    check(/couldn.t open that photo/.test(await page.textContent('#photo-err')) && await page.isEnabled('#add'), 'a file that is not a photo shows a calm error and the button still works');
    await addPhoto(page, A.kitchenTall);
    await page.waitForSelector('.k-got'); await page.waitForTimeout(700);
    check(await page.isVisible('text=Got it. Now swipe the kitchens you love.'), 'confirmation shows');
    const dims = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight, i.src.slice(0, 23)]); i.src = document.querySelector('.k-got img').src; }));
    check(dims[0] === 960 && dims[1] === 1280 && dims[2] === 'data:image/jpeg;base64,', 'photo resized to 1280 px long edge as JPEG (' + dims.join(' ') + ')');
    await overflow(page, 'off-photo confirm'); await shot(page, 'off-photo', '2-got-it');
    await page.waitForSelector('.k-card.top', { timeout: 4000 });
    await swipe(page, SEQ_MIXED);
    await page.waitForSelector('.k-result', { timeout: 6000 }); await page.waitForTimeout(2200);
    const h = await heroInfo(page);
    check(!h.ai && h.today && !h.note, 'result is the illustrated design with a "Your kitchen today" thumbnail and no note');
    check(page._engineCalls.length === 0, 'no engine requests while switched off');
    await overflow(page, 'off-photo result'); await shot(page, 'off-photo', '3-result'); await shot(page, 'off-photo', '3-result-full', true);
    const pack = await openPack(page, 'off-photo');
    check(pack.labels.includes('Their kitchen today') && pack.labels.includes('Designed from their swipes') && !pack.labels.includes('In their chosen style'), 'brief shows their photo and the design from swipes');
    check(/photo of my kitchen/.test(pack.wa), 'WhatsApp mentions the photo');
    return page;
  },

  // (b) Engine off, skip the photo: today's experience.
  async 'off-skip'(browser) {
    const page = await newPage(browser, {});
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(400);
    await page.click('#skip');
    await swipe(page, SEQ_MIXED);
    await page.waitForSelector('.k-result', { timeout: 6000 }); await page.waitForTimeout(2200);
    const h = await heroInfo(page);
    check(!h.ai && !h.today && !h.note, 'result is the illustrated design with no photo and no note');
    await overflow(page, 'off-skip result'); await shot(page, 'off-skip', '1-result');
    const pack = await openPack(page, 'off-skip');
    check(!pack.labels.includes('Their kitchen today') && pack.labels.includes('Their palette'), 'brief has no photo, keeps palette');
    return page;
  },

  // (c) Engine on: request starts after card 7, waiting screen, redesigned hero, hold, tabs, brief.
  async 'on-early'(browser, A) {
    const page = await newPage(browser, { engine: true });
    const calls = await mockEngine(page, okImage(A.images));
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(400);
    check(await page.isVisible('text=See your kitchen in the style you love'), 'intro promises the redesign when the engine is on');
    check(await page.isVisible('text=Your photo is only used to make your design. It is not stored.'), 'reassurance line shows');
    await overflow(page, 'on-early intro'); await shot(page, 'on-early', '1-intro');
    await addPhoto(page, A.kitchen);
    await page.waitForSelector('.k-got'); await page.click('.k-got');
    let at6 = -1, at7 = -1;
    await swipe(page, SEQ_STABLE, async i => {
      if (i === 6) at6 = calls.length;
      if (i === 7) { await page.waitForTimeout(150); at7 = calls.length; }
    });
    check(at6 === 0 && at7 === 1, 'engine starts after card 7, not before (after 6: ' + at6 + ', after 7: ' + at7 + ')');
    const c0 = calls[0];
    check(c0 && c0.style.styleName === 'Dark and dramatic', 'early request uses the leaning style (' + (c0 && c0.style.styleName) + ')');
    check(c0 && c0.headers.authorization === 'Bearer test-anon-key' && c0.headers.apikey === 'test-anon-key' && /application\/json/.test(c0.headers['content-type']), 'request headers follow the contract');
    check(c0 && /^data:image\/jpeg;base64,/.test(c0.photo), 'photo is sent as a JPEG data URL');
    const keys = ['styleName', 'twist', 'doors', 'unitColour', 'unitName', 'worktop', 'splashback', 'splashColour', 'handles', 'wall', 'floor', 'island', 'pendants', 'cooker', 'hood', 'upper'];
    check(c0 && keys.every(k => k in c0.style) && Object.keys(c0.style).length === keys.length, 'style object has exactly the contract keys');
    console.log('  style sent:', JSON.stringify(c0 && c0.style));
    await page.waitForSelector('.k-wait', { timeout: 3000 });
    await page.waitForTimeout(500);
    check(await page.isVisible('.k-wait .k-scan img'), 'waiting screen shows their photo');
    const msg = await page.textContent('#wait-msg');
    check(['Reading your kitchen', 'Matching your style', 'Fitting your new doors', 'Final checks'].includes(msg), 'waiting message: ' + msg);
    check(await page.locator('.k-wait-board > div').count() === SEQ_STABLE.filter(Boolean).length, 'waiting screen shows the kitchens they loved');
    await overflow(page, 'on-early waiting'); await shot(page, 'on-early', '2-waiting');
    await page.waitForSelector('.k-hero.k-ai .k-after', { timeout: 8000 }); await page.waitForTimeout(2400);
    check(calls.length === 1, 'no restart when only the twist changes (' + calls.length + ' requests)');
    const h = await heroInfo(page);
    check(h.ai && h.after === A.images['Dark and dramatic'] && h.tag === 'Designed from your swipes', 'hero shows their kitchen redesigned, tagged "Designed from your swipes"');
    await overflow(page, 'on-early result'); await shot(page, 'on-early', '3-result'); await shot(page, 'on-early', '3-result-full', true);
    // Press and hold
    const hold = await page.locator('#hold').boundingBox();
    await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2); await page.mouse.down(); await page.waitForTimeout(350);
    const held = await page.evaluate(() => [document.querySelector('.k-ai').classList.contains('holding'), getComputedStyle(document.querySelector('.k-after')).opacity, document.querySelector('#hero-tag').textContent]);
    check(held[0] && held[1] === '0' && held[2] === 'Your kitchen today', 'holding shows their kitchen today');
    await shot(page, 'on-early', '4-holding');
    await page.mouse.up(); await page.waitForTimeout(300);
    check(!(await page.evaluate(() => document.querySelector('.k-ai').classList.contains('holding'))), 'releasing shows the redesign again');
    await page.focus('#hold'); await page.keyboard.down('Space'); await page.waitForTimeout(100);
    const kb = await page.evaluate(() => document.querySelector('.k-ai').classList.contains('holding'));
    await page.keyboard.up('Space'); await page.waitForTimeout(100);
    const kb2 = await page.evaluate(() => document.querySelector('.k-ai').classList.contains('holding'));
    await page.keyboard.down('Enter'); await page.waitForTimeout(100);
    const kb3 = await page.evaluate(() => document.querySelector('.k-ai').classList.contains('holding'));
    await page.keyboard.up('Enter'); await page.waitForTimeout(100);
    check(kb && !kb2 && kb3, 'holding Space or Enter works from the keyboard');
    check(await page.evaluate(() => !document.querySelector('[type=range], .k-slider')), 'no drag slider on the page');
    // Tabs
    await page.click('#tab-board'); await page.waitForTimeout(1700);
    const tabs = await page.evaluate(() => [document.getElementById('hero-yours').hidden, document.getElementById('hero-board').hidden, document.querySelector('#hero-board svg') != null]);
    check(tabs[0] && !tabs[1] && tabs[2], 'Style board tab shows the illustrated design');
    await shot(page, 'on-early', '5-style-board');
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
    check(!(await page.evaluate(() => document.getElementById('hero-yours').hidden)), 'arrow keys switch back to "Your kitchen"');
    const pack = await openPack(page, 'on-early');
    check(pack.labels.includes('Their kitchen today') && pack.labels.includes('In their chosen style'), 'brief shows their kitchen today and in their chosen style');
    check(pack.imgs.length === 2 && pack.imgs[0] === 'data:image/jpeg;base64' && pack.imgs[1] === 'data:image/png;base64,', 'brief images are the photo and the redesign');
    return page;
  },

  // (c) Engine on: the style changes between card 7 and card 10, so the first request is dropped.
  async 'on-restart'(browser, A) {
    const page = await newPage(browser, { engine: true });
    const calls = await mockEngine(page, okImage(A.images));
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(400);
    await addPhoto(page, A.kitchen);
    await page.waitForSelector('.k-got'); await page.click('.k-got');
    let at7 = -1;
    await swipe(page, SEQ_CHANGE, async i => { if (i === 7) { await page.waitForTimeout(150); at7 = calls.length; } });
    await page.waitForTimeout(200);
    check(at7 === 1 && calls[0].style.styleName === 'Warm minimal', 'early request at card 7 uses Warm minimal');
    check(calls.length === 2 && calls[1].style.styleName === 'Urban loft' && calls[1].style.twist === 'Warm minimal', 'restarted with the final style, Urban loft with a touch of Warm minimal');
    await page.waitForSelector('.k-wait', { timeout: 3000 }); await page.waitForTimeout(400);
    await shot(page, 'on-restart', '1-waiting');
    await page.waitForSelector('.k-hero.k-ai .k-after', { timeout: 8000 }); await page.waitForTimeout(2400);
    const h = await heroInfo(page);
    check(h.after === A.images['Urban loft'], 'result uses the restarted request, not the early one');
    check(calls[0].state === 'aborted' || calls[0].state === 'gone', 'early request was cancelled (' + calls[0].state + ')');
    await overflow(page, 'on-restart result'); await shot(page, 'on-restart', '2-result');
    // Swipe again keeps their photo and starts afresh at card 7.
    await page.click('#again');
    let again7 = -1;
    await swipe(page, SEQ_STABLE, async i => { if (i === 7) { await page.waitForTimeout(150); again7 = calls.length; } });
    check(again7 === 3 && calls[2].style.styleName === 'Dark and dramatic', 'swipe again: same photo, new early request at card 7');
    await page.waitForSelector('.k-hero.k-ai .k-after', { timeout: 8000 });
    check((await heroInfo(page)).after === A.images['Dark and dramatic'] && calls.length === 3, 'swipe again: redesigned in the new style');
    return page;
  },

  // Engine on but they skipped the photo: honest illustrated result, with an offer to add one.
  async 'on-skip'(browser, A) {
    const page = await newPage(browser, { engine: true });
    const calls = await mockEngine(page, okImage(A.images));
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(400);
    await page.click('#skip');
    await swipe(page, SEQ_STABLE);
    await page.waitForSelector('.k-result', { timeout: 6000 }); await page.waitForTimeout(2200);
    const h = await heroInfo(page);
    check(!h.ai && !h.today && /see your own kitchen/.test(h.note) && calls.length === 0, 'illustrated result, no request, and an offer to add a photo');
    await overflow(page, 'on-skip result'); await shot(page, 'on-skip', '1-result');
    await addPhoto(page, A.kitchen, '#note-act');
    await page.waitForSelector('.k-working', { timeout: 3000 });
    await page.waitForSelector('.k-hero.k-ai .k-after', { timeout: 8000 }); await page.waitForTimeout(2400);
    check(calls.length === 1 && (await heroInfo(page)).after === A.images['Dark and dramatic'], 'adding a photo on the result redesigns it in place');
    await overflow(page, 'on-skip redesigned'); await shot(page, 'on-skip', '2-redesigned');
    return page;
  },

  // (d) The engine says the photo is not a kitchen; they try another photo from the result.
  async 'not-kitchen'(browser, A) {
    const page = await newPage(browser, { engine: true });
    const MSG = 'That photo doesn’t look like a kitchen. Try one taken from the doorway, with the units in view.';
    const calls = await mockEngine(page, (call, n) => n === 1
      ? { delay: 900, json: { ok: false, code: 'not_kitchen', message: MSG } }
      : { delay: DELAY, json: { ok: true, image: A.images[call.style.styleName], ms: DELAY } });
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(400);
    await addPhoto(page, A.garden);
    await page.waitForSelector('.k-got'); await page.click('.k-got');
    await swipe(page, SEQ_STABLE);
    await page.waitForSelector('.k-result', { timeout: 6000 }); await page.waitForTimeout(2200);
    check(calls.length === 1, 'no second request with a photo the engine has rejected');
    const h = await heroInfo(page);
    check(!h.ai && h.today && h.note.indexOf(MSG) >= 0, 'illustrated result, their photo, and the engine’s message');
    check(await page.isVisible('#note-act:has-text("Try another photo")'), 'offers "Try another photo"');
    await overflow(page, 'not-kitchen result'); await shot(page, 'not-kitchen', '1-result');
    await addPhoto(page, A.kitchen, '#note-act');
    await page.waitForSelector('.k-working', { timeout: 3000 }); await page.waitForTimeout(600);
    await overflow(page, 'not-kitchen working'); await shot(page, 'not-kitchen', '2-working');
    await page.waitForSelector('.k-hero.k-ai .k-after', { timeout: 8000 }); await page.waitForTimeout(2400);
    const h2 = await heroInfo(page);
    check(calls.length === 2 && h2.ai && h2.after === A.images['Dark and dramatic'], 'new photo redesigned in place');
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
    await shot(page, 'not-kitchen', '3-redesigned');
    return page;
  },

  // (e) The engine never answers: after 90 s the illustrated result shows with a calm note.
  async timeout(browser, A) {
    const page = await newPage(browser, { engine: true, clock: true });
    const calls = await mockEngine(page, () => ({ hang: true }));
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(400);
    await addPhoto(page, A.kitchen);
    await page.waitForSelector('.k-got'); await page.click('.k-got');
    await swipe(page, SEQ_STABLE);
    await page.waitForSelector('.k-wait', { timeout: 3000 });
    await page.clock.fastForward(35000); await page.waitForTimeout(600);
    check((await page.textContent('#wait-sub')).indexOf('longer than usual') >= 0, 'after 30 s the waiting screen says it is taking longer');
    check(await page.textContent('#wait-msg') === 'Final checks', 'messages end on "Final checks"');
    await shot(page, 'timeout', '1-waiting-long');
    await page.clock.fastForward(56000); await page.waitForTimeout(400);
    await page.clock.fastForward(3000);
    await page.waitForSelector('.k-result', { timeout: 6000 }); await page.waitForTimeout(400);
    await page.clock.fastForward(3000); await page.waitForTimeout(1800);
    const h = await heroInfo(page);
    check(!h.ai && h.today && /took too long/.test(h.note), 'timed out: illustrated result with a calm note');
    check(await page.isVisible('#note-act:has-text("Try again")'), 'offers "Try again"');
    check(calls.length === 1, 'one request made');
    await overflow(page, 'timeout result'); await shot(page, 'timeout', '2-result');
    return page;
  },

  // Engine busy (HTTP 503): retried once at the end of the swipes, then "Try again" works.
  async busy(browser, A) {
    const page = await newPage(browser, { engine: true, allowConsole: /status of 503/ });
    const calls = await mockEngine(page, (call, n) => n <= 2
      ? { delay: 400, status: 503, json: { ok: false, code: 'engine_busy', message: 'The engine is busy.' } }
      : { delay: DELAY, json: { ok: true, image: A.images[call.style.styleName], ms: DELAY } });
    await page.goto(BASE + '/kitchen/'); await page.waitForTimeout(400);
    await addPhoto(page, A.kitchen);
    await page.waitForSelector('.k-got'); await page.click('.k-got');
    await swipe(page, SEQ_STABLE);
    await page.waitForTimeout(200);
    check(calls.length === 2, 'a busy early request is tried again at the end (' + calls.length + ' requests)');
    await page.waitForSelector('.k-result', { timeout: 9000 }); await page.waitForTimeout(2200);
    const h = await heroInfo(page);
    check(!h.ai && h.today && /busy/.test(h.note), 'busy: illustrated result with a calm note');
    check(await page.isVisible('#note-act:has-text("Try again")'), 'offers "Try again"');
    await shot(page, 'busy', '1-result');
    await page.click('#note-act');
    await page.waitForSelector('.k-hero.k-ai .k-after', { timeout: 8000 }); await page.waitForTimeout(2400);
    check(calls.length === 3 && (await heroInfo(page)).after === A.images['Dark and dramatic'], '"Try again" redesigns their photo');
    return page;
  }
};

(async () => {
  const browser = await chromium.launch();
  const A = await makeAssets(browser);
  const names = ONLY.length ? ONLY : Object.keys(scenarios);
  for (const name of names) {
    console.log('\n' + name + ' (' + W + 'x' + H + ')');
    let page;
    try { page = await scenarios[name](browser, A); }
    catch (e) { failures.push(name + ': ' + e.message.split('\n')[0]); console.log('  FAIL ' + e.message.split('\n')[0]); }
    if (page) {
      check(!page._errs.length, name + ': no console errors' + (page._errs.length ? '\n    ' + page._errs.join('\n    ') : ''));
      await page.close().catch(() => {});
    }
  }
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' failed:\n' + failures.join('\n') : 'all passed'));
  process.exitCode = failures.length ? 1 : 0;
})();
