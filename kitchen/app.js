/* Kitchen style match: add a photo of your kitchen, swipe ten Riverside kitchens, get a style and a kitchen
   designed from the swipes. When the engine is on (config.js), the customer also sees their own kitchen
   redesigned in that style. Then one tap for size, a guide price, and a style brief for Alex. */
(function () {
  'use strict';

  /* PLACEHOLDER guide prices, inside Riverside's published £15k–£40k+ for a full kitchen. Confirm with Alex. */
  var SIZES = [
    { id: 'compact', label: 'Compact', hint: 'Galley or a small kitchen', price: [15000, 20000], icon: '<path d="M8 8h6v24H8zM26 8h6v24h-6z"/>' },
    { id: 'medium', label: 'Medium', hint: 'Room for a small table', price: [20000, 28000], icon: '<path d="M8 8h24v6H14v18H8z"/><circle cx="25" cy="25" r="4"/>' },
    { id: 'large', label: 'Large', hint: 'Room for an island', price: [28000, 36000], icon: '<path d="M8 8h24v24h-6V14H14v18H8z"/><rect x="17" y="21" width="6" height="8"/>' },
    { id: 'open', label: 'Open-plan', hint: 'Kitchen-diner or extension', price: [36000, null], icon: '<path d="M6 8h16v5H11v13H6z"/><rect x="15" y="18" width="8" height="5"/><rect x="26" y="22" width="9" height="11" rx="1.5"/>' }
  ];

  var EARLY_AT = 7; // start the engine in the background after this many swipes
  var WAIT_STEPS = ['Reading your kitchen', 'Matching your style', 'Fitting your new doors', 'Final checks'];

  var A = window.KitchenArt, RV = window.RV, E = window.KitchenEngine;
  var app = document.getElementById('app');
  var announce = document.getElementById('announce');
  var picker = document.getElementById('photo-input');
  RV.header(document.getElementById('top'), { home: '../', back: '../', backLabel: 'All tools' });

  var ICON = {
    lock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  var art = {};
  A.CARDS.forEach(function (c) { art[c.id] = c.photo ? '<img src="' + RV.esc(c.photo) + '" alt="">' : A.svg(c); });

  var photo = null;  // their kitchen today: { src, w, h, id }, kept when they swipe again
  var photoSeq = 0;
  var job = null;    // the engine request: { sig, style, photoId, status, res, started, promise, cancel }
  var ticker = null;
  var state;
  function reset() { stopJob(); state = { i: 0, order: A.CARDS.slice(), loved: [], nope: [], history: [], size: null, result: null, ranked: null }; }
  reset();
  intro();

  /* ---------- Photo ---------- */
  var onPicked = null;
  picker.addEventListener('change', function () {
    var file = picker.files && picker.files[0], cb = onPicked;
    onPicked = null;
    if (file && cb) cb(file);
  });
  function pickPhoto(cb) { onPicked = cb; picker.value = ''; picker.click(); }

  // Opens the picker, reads the photo, then calls done(). btn shows progress, err shows a problem.
  function addPhoto(btn, err, done) {
    pickPhoto(function (file) {
      var label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Reading your photo…';
      if (err) err.textContent = '';
      E.readPhoto(file).then(function (p) {
        stopJob();
        p.id = ++photoSeq;
        photo = p;
        done();
      }, function () {
        btn.disabled = false;
        btn.innerHTML = label;
        if (err) err.textContent = 'We couldn\'t open that photo. Please try a different one.';
      });
    });
  }

  function ratio(p) { return Math.max(0.68, Math.min(1.78, p.w / p.h)).toFixed(4); }

  /* ---------- Intro ---------- */
  function intro() {
    var on = E.enabled();
    app.innerHTML =
      '<section class="k-intro rv-screen">' +
      '<div class="k-fan" aria-hidden="true"><div class="k-mini">' + art.clay + '</div><div class="k-mini">' + art.forest + '</div><div class="k-mini">' + art.sage + '</div>' +
      '<div class="k-heart">' + RV.icon('heart', { fill: true, size: 24 }) + '</div></div>' +
      '<div class="k-intro-copy"><span class="rv-eyebrow">Kitchen style match</span>' +
      (on ? '<h1>See your kitchen in the style you love</h1>' +
        '<p class="rv-lead">Add a photo of your kitchen, then swipe through ten Riverside kitchens. Right if you love it, left if it\'s not for you. We\'ll work out your style and show you your own kitchen redesigned in it.</p>'
        : '<h1>Find your kitchen style in 30 seconds</h1>' +
        '<p class="rv-lead">Swipe through ten Riverside kitchens. Right if you love it, left if it\'s not for you. We\'ll work out your style and design a kitchen from your picks. Add a photo of your kitchen first, so Alex can see your space.</p>') +
      '<div class="k-intro-actions">' +
      '<button class="rv-btn block" type="button" id="add">' + RV.icon('camera', { size: 20 }) + 'Add a photo of your kitchen</button>' +
      '<p class="k-photo-err" id="photo-err" role="alert"></p>' +
      '<p class="k-safe">' + ICON.lock + '<span>' + (on ? 'Your photo is only used to make your design. It is not stored.' : 'Your photo is only used for your design brief. It is not stored.') + '</span></p>' +
      '<button class="rv-link k-skip" type="button" id="skip">Skip, just swipe</button>' +
      '</div></div></section>';
    var add = document.getElementById('add');
    add.addEventListener('click', function () { addPhoto(add, document.getElementById('photo-err'), gotPhoto); });
    document.getElementById('skip').addEventListener('click', swipe);
  }

  function gotPhoto() {
    app.innerHTML =
      '<section class="k-got rv-screen">' +
      '<div class="k-got-frame" style="--ar:' + ratio(photo) + '"><img src="' + photo.src + '" alt="Your kitchen today">' +
      '<span class="k-got-tick">' + RV.icon('check', { size: 26, stroke: 3 }) + '</span></div>' +
      '<h1>Got it. Now swipe the kitchens you love.</h1></section>';
    window.scrollTo(0, 0);
    var t = setTimeout(go, RV.reducedMotion() ? 1400 : 2000);
    function go() { clearTimeout(t); if (document.querySelector('.k-got')) swipe(); }
    app.querySelector('.k-got').addEventListener('click', go);
  }

  /* ---------- Swipe ---------- */
  var busy = false;
  function swipe() {
    app.innerHTML =
      '<section class="k-swipe rv-screen">' +
      '<div class="k-progress"><span id="count"></span><div class="k-bar"><i id="bar"></i></div>' +
      '<button class="k-undo" type="button" id="undo" aria-label="Undo last swipe">' + RV.icon('undo', { size: 18 }) + '</button></div>' +
      '<div class="k-stack" id="stack"></div>' +
      '<div class="k-actions"><button class="k-round nope" type="button" id="nope" aria-label="Not for me">' + RV.icon('x', { stroke: 2.8 }) + '</button>' +
      '<button class="k-round love" type="button" id="love" aria-label="Love it">' + RV.icon('heart', { fill: true, stroke: 0 }) + '</button></div>' +
      '<p class="rv-small k-hint">Drag the card, or tap the buttons.</p></section>';
    document.getElementById('nope').addEventListener('click', function () { decide(false); });
    document.getElementById('love').addEventListener('click', function () { decide(true); });
    document.getElementById('undo').addEventListener('click', undo);
    drawStack();
  }

  function cardHTML(c, cls) {
    return '<article class="k-card ' + cls + '" data-id="' + c.id + '" aria-label="' + RV.esc(c.name) + '">' +
      '<div class="k-art">' + art[c.id] + '</div>' +
      '<div class="k-stamp love">Love it</div><div class="k-stamp nope">Not for me</div>' +
      '<div class="k-cap"><h3>' + RV.esc(c.name) + '</h3><div class="rv-row">' + c.tags.map(function (t) { return '<span class="rv-chip">' + RV.esc(t) + '</span>'; }).join('') + '</div></div></article>';
  }

  function drawStack() {
    var stack = document.getElementById('stack');
    if (!stack) return;
    var cur = state.order[state.i], nxt = state.order[state.i + 1];
    stack.innerHTML = (nxt ? cardHTML(nxt, 'next') : '') + (cur ? cardHTML(cur, 'top') : '');
    document.getElementById('count').textContent = Math.min(state.i + 1, state.order.length) + ' of ' + state.order.length;
    document.getElementById('bar').style.width = (state.i / state.order.length * 100) + '%';
    document.getElementById('undo').disabled = !state.history.length;
    var top = stack.querySelector('.k-card.top');
    if (top) bindDrag(top);
  }

  function bindDrag(card) {
    var sx = 0, sy = 0, dx = 0, dy = 0, t0 = 0, dragging = false;
    var love = card.querySelector('.k-stamp.love'), nope = card.querySelector('.k-stamp.nope');
    var next = document.querySelector('.k-card.next');
    function apply(x, y) {
      card.style.transform = 'translate(' + x + 'px,' + (y * 0.35) + 'px) rotate(' + (x * 0.06) + 'deg)';
      love.style.opacity = Math.max(0, Math.min(1, x / 90));
      nope.style.opacity = Math.max(0, Math.min(1, -x / 90));
      if (next) {
        var k = Math.min(1, Math.abs(x) / 160);
        next.style.transform = 'scale(' + (0.94 + 0.06 * k) + ') translateY(' + (14 - 14 * k) + 'px)';
        next.style.filter = 'brightness(' + (0.7 + 0.3 * k) + ')';
      }
    }
    card._apply = apply;
    card.addEventListener('pointerdown', function (e) {
      if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dragging = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; t0 = performance.now();
      card.setPointerCapture(e.pointerId);
      card.style.transition = 'none';
      if (next) next.style.transition = 'none';
    });
    card.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      apply(dx, dy);
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      var v = dx / Math.max(1, performance.now() - t0);
      if (dx > 110 || (dx > 40 && v > 0.55)) return decide(true, dy);
      if (dx < -110 || (dx < -40 && v < -0.55)) return decide(false, dy);
      card.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1)';
      if (next) next.style.transition = 'transform .35s, filter .35s';
      apply(0, 0);
    }
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  function decide(isLove, dy) {
    var card = document.querySelector('.k-card.top');
    if (!card || busy) return;
    busy = true;
    var c = state.order[state.i];
    (isLove ? state.loved : state.nope).push(c);
    state.history.push(isLove);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { /* not supported */ }
    announce.textContent = (isLove ? 'Loved: ' : 'Not for me: ') + c.name;
    card._apply(isLove ? 120 : -120, dy || 0);
    card.style.transition = 'transform .38s cubic-bezier(.4,0,.6,1), opacity .38s';
    card.querySelector('.k-stamp.' + (isLove ? 'love' : 'nope')).style.opacity = 1;
    requestAnimationFrame(function () {
      card.style.transform = 'translate(' + (isLove ? 1 : -1) * (innerWidth + 240) + 'px,' + ((dy || 0) * 0.35 + 40) + 'px) rotate(' + (isLove ? 28 : -28) + 'deg)';
      card.style.opacity = '0.6';
    });
    setTimeout(function () {
      state.i++;
      busy = false;
      if (state.i >= state.order.length) building(); else { drawStack(); startEarly(); }
    }, 300);
  }

  function undo() {
    if (!state.history.length || busy) return;
    var wasLove = state.history.pop();
    (wasLove ? state.loved : state.nope).pop();
    state.i--;
    drawStack();
    var top = document.querySelector('.k-card.top');
    if (top && !RV.reducedMotion()) {
      top.style.transition = 'none';
      top.style.transform = 'translate(' + (wasLove ? 1 : -1) * 420 + 'px,30px) rotate(' + (wasLove ? 24 : -24) + 'deg)';
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        top.style.transition = 'transform .4s cubic-bezier(.2,.8,.2,1)';
        top.style.transform = '';
      }); });
    }
  }

  document.addEventListener('keydown', function (e) {
    if (!document.getElementById('stack') || document.querySelector('.rv-sheet')) return;
    if (e.key === 'ArrowRight') decide(true);
    if (e.key === 'ArrowLeft') decide(false);
  });

  /* ---------- Working out the style ---------- */
  function scoreStyles() {
    var s = {};
    Object.keys(A.STYLES).forEach(function (k) { s[k] = 0; });
    state.loved.forEach(function (c) { s[c.style] += 3; if (c.also) s[c.also] += 1; });
    state.nope.forEach(function (c) { s[c.style] -= 1; });
    var ranked = Object.keys(s).map(function (k) { return { k: k, s: Math.max(0, s[k]) }; }).sort(function (a, b) { return b.s - a.s; });
    var total = ranked.reduce(function (t, r) { return t + r.s; }, 0) || 1;
    ranked.forEach(function (r) { r.pct = Math.round(r.s / total * 100); });
    return ranked;
  }

  function mode(list) {
    var n = {}, best = null;
    list.forEach(function (x) { if (x == null) return; n[x] = (n[x] || 0) + 1; if (best == null || n[x] > n[best]) best = x; });
    return best;
  }

  function design(ranked) {
    var top = ranked[0].k;
    var second = ranked[1] && ranked[1].s > 0 && ranked[1].s >= ranked[0].s * 0.45 ? ranked[1].k : null;
    var loved = state.loved;
    var base = loved.filter(function (c) { return c.style === top; })[0] || loved.filter(function (c) { return c.also === top; })[0] || loved[0];
    var spec = JSON.parse(JSON.stringify(base));
    spec.id = 'yours-' + loved.map(function (c) { return c.id; }).join('-');
    // Handles: the finish they loved most, unless the base is handleless
    if (spec.handles) {
      var h = mode(loved.filter(function (c) { return c.handles; }).map(function (c) { return c.handles + '|' + (c.handleShape || 'bar'); }));
      if (h) { spec.handles = h.split('|')[0]; spec.handleShape = h.split('|')[1]; }
    }
    // Island: if at least half of their loves had one
    var islands = loved.filter(function (c) { return c.island; });
    var wantsIsland = islands.length >= Math.ceil(loved.length / 2);
    if (wantsIsland) {
      var blend = A.STYLES[second || top].island(base);
      spec.island = second ? blend : (spec.island || blend);
      spec.pendants = spec.pendants && spec.pendants !== 'none' ? spec.pendants : (mode(islands.map(function (c) { return c.pendants; })) || 'globe');
      spec.pendantMetal = spec.handles === 'black' ? 'black' : 'brass';
      delete spec.rug;
    } else if (spec.island) {
      delete spec.island; spec.pendants = 'none';
    }
    return { spec: spec, top: top, second: second };
  }

  /* ---------- The engine: redesign their photo in the matched style ---------- */
  function styleOf(r) { return E.style(r.spec, A.STYLES[r.top].name, r.second ? A.STYLES[r.second].name : null); }

  function startJob(r) {
    stopJob();
    var s = styleOf(r), call = E.restyle(photo.src, s);
    var j = { sig: E.signature(s), style: s, photoId: photo.id, status: 'pending', res: null, started: Date.now(), cancel: call.cancel };
    j.promise = call.promise.then(function (res) {
      j.res = res;
      j.status = res.ok ? 'done' : 'failed';
      return res;
    });
    job = j;
    return j;
  }
  function stopJob() { if (job && job.status === 'pending') job.cancel(); job = null; }

  // After 7 swipes, start on the style they are leaning towards, so the wait at the end is shorter.
  function startEarly() {
    if (job || !photo || !E.enabled() || state.i < EARLY_AT || !state.loved.length) return;
    startJob(design(scoreStyles()));
  }

  // After the last swipe: keep the early request if it still matches, otherwise start again with the final style.
  function finalJob(r) {
    var keep = job && job.photoId === photo.id &&
      (job.status === 'failed' ? E.isFinal(job.res.code) : job.sig === E.signature(styleOf(r)));
    return keep ? job : startJob(r);
  }

  function engineFor() { return job && photo && job.photoId === photo.id ? job : null; }

  // Rotating messages and an easing progress bar, timed from when the request started.
  function tick(j, ids) {
    clearInterval(ticker);
    var long = false;
    function step() {
      var msg = document.getElementById(ids.msg);
      if (!msg || job !== j || j.status !== 'pending') { clearInterval(ticker); return; }
      var t = Date.now() - j.started;
      var i = Math.min(WAIT_STEPS.length - 1, Math.floor(t / 5000));
      if (msg.getAttribute('data-i') !== String(i)) {
        msg.setAttribute('data-i', i);
        msg.textContent = WAIT_STEPS[i];
        msg.classList.remove('in'); void msg.offsetWidth; msg.classList.add('in');
      }
      var bar = ids.bar && document.getElementById(ids.bar);
      if (bar) bar.style.width = (94 * (1 - Math.exp(-t / 15000))).toFixed(1) + '%';
      var sub = ids.sub && document.getElementById(ids.sub);
      if (sub && !long && t > 30000) { long = true; sub.textContent = 'This one is taking a little longer than usual.'; }
    }
    step();
    ticker = setInterval(step, 400);
  }

  function scanHTML() {
    return '<div class="k-scan" style="--ar:' + ratio(photo) + '"><img src="' + photo.src + '" alt="Your kitchen today, being redesigned">' +
      '<i class="k-scan-band" aria-hidden="true"></i><span class="k-scan-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>';
  }

  /* ---------- After the last swipe ---------- */
  function building() {
    var loved = state.loved;
    if (!loved.length) { stopJob(); return noMatch(); }
    state.ranked = scoreStyles();
    state.result = design(state.ranked);
    if (photo && E.enabled() && finalJob(state.result).status === 'pending') return waiting();
    app.innerHTML = '<section class="k-build rv-screen"><span class="rv-eyebrow">Your picks</span>' +
      '<div class="k-board">' + loved.slice(0, 9).map(function (c, i) { return '<div style="animation-delay:' + (i * 0.09) + 's">' + art[c.id] + '</div>'; }).join('') + '</div>' +
      '<p class="k-build-msg" id="msg">Reading your swipes…</p></section>';
    var msgs = ['Matching your style…', 'Designing your kitchen…'];
    var wait = RV.reducedMotion() ? 0 : 750;
    setTimeout(function () { var m = document.getElementById('msg'); if (m) m.textContent = msgs[0]; }, wait);
    setTimeout(function () { var m = document.getElementById('msg'); if (m) m.textContent = msgs[1]; }, wait * 2);
    setTimeout(result, wait * 3 + 100);
  }

  // Only while the engine is still working: their photo being read, and the kitchens they loved.
  function waiting() {
    var j = job, shown = Date.now();
    app.innerHTML =
      '<section class="k-wait rv-screen">' +
      '<div class="k-wait-photo">' + scanHTML() + '</div>' +
      '<div class="k-wait-copy"><span class="rv-eyebrow">Designing your kitchen</span>' +
      '<p class="k-wait-msg k-msg" id="wait-msg" role="status"></p>' +
      '<div class="k-wait-bar" aria-hidden="true"><i id="wait-bar"></i></div>' +
      '<p class="rv-small" id="wait-sub">We\'re redesigning your own kitchen from your swipes.</p>' +
      '<div class="k-wait-loved"><span class="k-label">Kitchens you loved</span><div class="k-wait-board">' +
      state.loved.map(function (c, i) { return '<div style="animation-delay:' + (0.25 + i * 0.08).toFixed(2) + 's" title="' + RV.esc(c.name) + '">' + art[c.id] + '</div>'; }).join('') +
      '</div></div></div></section>';
    window.scrollTo(0, 0);
    tick(j, { msg: 'wait-msg', bar: 'wait-bar', sub: 'wait-sub' });
    j.promise.then(function () {
      if (job !== j || !document.getElementById('wait-msg')) return;
      clearInterval(ticker);
      var bar = document.getElementById('wait-bar');
      if (bar) bar.style.width = '100%';
      setTimeout(function () { if (document.getElementById('wait-msg')) result(); }, Math.max(450, 1600 - (Date.now() - shown)));
    });
  }

  function noMatch() {
    app.innerHTML = '<section class="rv-narrow rv-screen" style="padding:30px 16px 60px;display:flex;flex-direction:column;gap:14px">' +
      '<span class="rv-eyebrow">Kitchen style match</span><h1>Nothing caught your eye?</h1>' +
      '<p class="rv-lead">That\'s useful too. Every Riverside kitchen is designed from scratch, so tell Alex what you\'re after and he\'ll show you more of his work.</p>' +
      '<button class="rv-btn block" type="button" id="talk">Talk to Alex about your kitchen</button>' +
      '<button class="rv-btn ghost block" type="button" id="again">Swipe again</button></section>';
    document.getElementById('again').addEventListener('click', function () { reset(); swipe(); });
    document.getElementById('talk').addEventListener('click', function () { openLead(null); });
  }

  /* ---------- Result ---------- */
  function result() {
    var ranked = state.ranked, r = state.result;
    var style = A.STYLES[r.top], d = A.describe(r.spec);
    app.innerHTML =
      '<section class="k-result rv-screen"><div class="k-res-grid">' +
      '<div class="k-hero-col" id="hero-col"></div>' +
      '<div class="k-res-body">' +
      '<div><span class="rv-eyebrow">Your kitchen style</span><h1>' + RV.esc(style.name) + '</h1>' +
      (r.second ? '<p class="k-twist">with a touch of ' + RV.esc(A.STYLES[r.second].name) + '</p>' : '') + '</div>' +
      '<p class="rv-lead">' + RV.esc(style.blurb) + '</p>' +
      '<div class="k-match" aria-label="Style match">' + ranked.filter(function (x) { return x.pct > 0; }).slice(0, 3).map(function (x) {
        return '<div class="k-match-row"><span>' + RV.esc(A.STYLES[x.k].name) + '</span><span>' + x.pct + '%</span><div class="k-track"><i data-w="' + x.pct + '"></i></div></div>';
      }).join('') + '</div>' +
      '<div class="k-dna"><span class="k-label">Your palette</span><div class="k-swatches">' + d.palette.map(function (s) {
        return '<div class="k-sw"><i style="background:' + s.colour + '"></i><span>' + RV.esc(s.name) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="k-spec">' + d.rows.map(function (row) { return '<div><b>' + RV.esc(row[0]) + '</b><span>' + RV.esc(row[1]) + '</span></div>'; }).join('') + '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:10px"><span class="k-label">Kitchens you loved</span><div class="k-loved">' +
      state.loved.map(function (c) { return '<div title="' + RV.esc(c.name) + '">' + art[c.id] + '</div>'; }).join('') + '</div></div>' +
      '<div class="rv-card k-size" id="size"><h3>Last thing: how big is your kitchen?</h3><div class="rv-tiles">' +
      SIZES.map(function (s) {
        return '<button class="rv-tile" type="button" aria-pressed="false" data-size="' + s.id + '"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' + s.icon + '</svg>' +
          '<div><b>' + s.label + '</b><small>' + s.hint + '</small></div></button>';
      }).join('') + '</div><div id="price"></div></div>' +
      '<button class="rv-link" type="button" id="again" style="align-self:flex-start">Swipe again</button>' +
      '</div></div></section>';
    renderHero();
    window.scrollTo(0, 0);
    setTimeout(function () {
      app.querySelectorAll('.k-track i').forEach(function (i) { i.style.width = i.getAttribute('data-w') + '%'; });
    }, RV.reducedMotion() ? 0 : 700);
    app.querySelectorAll('[data-size]').forEach(function (b) {
      b.addEventListener('click', function () { pickSize(b.getAttribute('data-size')); });
    });
    document.getElementById('again').addEventListener('click', function () { reset(); swipe(); });
    if (!RV.reducedMotion()) setTimeout(function () { RV.confetti({ count: 70, y: 0.2 }); }, 1250);
  }

  /* The hero: their kitchen redesigned, their photo being redesigned, or the illustrated design. */
  function renderHero() {
    var col = document.getElementById('hero-col');
    if (!col) return;
    clearInterval(ticker);
    var j = engineFor(), r = state.result;
    var board = A.svg(r.spec, { label: 'Your kitchen, designed from your swipes' });

    if (j && j.status === 'done') {
      col.innerHTML =
        '<div class="k-hero k-ai" id="hero-yours" role="tabpanel" aria-labelledby="tab-yours" style="--ar:' + ratio(photo) + '">' +
        '<img class="k-before" src="' + photo.src + '" alt="Your kitchen today">' +
        '<img class="k-after" src="' + j.res.image + '" alt="Your kitchen, redesigned in ' + RV.esc(j.style.styleName) + '">' +
        '<span class="k-hero-tag" id="hero-tag">Designed from your swipes</span>' +
        '<button class="k-hold" type="button" id="hold" aria-pressed="false">' + ICON.eye + '<span>Hold to see your kitchen today</span></button></div>' +
        '<div class="k-hero" id="hero-board" role="tabpanel" aria-labelledby="tab-board" hidden><span class="k-hero-tag">Style board</span><div class="k-hero-art">' + board + '</div></div>' +
        '<div class="k-tabs" role="tablist" aria-label="Your design">' +
        '<button type="button" role="tab" id="tab-yours" aria-controls="hero-yours" aria-selected="true">Your kitchen</button>' +
        '<button type="button" role="tab" id="tab-board" aria-controls="hero-board" aria-selected="false" tabindex="-1">Style board</button></div>' +
        '<p class="k-hero-cap">An AI impression made from your photo. Alex designs the real thing with you at your design visit.</p>';
      var after = col.querySelector('.k-after');
      after.addEventListener('load', function () {
        if (after.naturalWidth) col.querySelector('.k-ai').style.setProperty('--ar', ratio({ w: after.naturalWidth, h: after.naturalHeight }));
      });
      settleReveal(col.querySelector('.k-ai'), 2200);
      bindHold(col.querySelector('#hold'), col.querySelector('.k-ai'));
      bindTabs(col);
      return;
    }

    if (j && j.status === 'pending') {
      col.innerHTML =
        '<div class="k-hero k-ai k-working" style="--ar:' + ratio(photo) + '">' + scanHTML() +
        '<span class="k-hero-tag">Designing your kitchen</span>' +
        '<p class="k-working-msg k-msg" id="hero-msg" role="status"></p></div>';
      tick(j, { msg: 'hero-msg' });
      j.promise.then(function () { if (job === j) renderHero(); });
      return;
    }

    var note = '';
    if (j && j.status === 'failed') {
      var f = failure(j.res);
      note = '<div class="k-note"><span>' + RV.esc(f.text) + '</span>' +
        (f.action ? '<button class="rv-link" type="button" id="note-act">' + (f.action === 'photo' ? 'Try another photo' : 'Try again') + '</button>' : '') + '</div>';
    } else if (!photo && E.enabled()) {
      note = '<div class="k-note"><span>Want to see your own kitchen in this style?</span><button class="rv-link" type="button" id="note-act">Add a photo of your kitchen</button></div>';
    }
    col.innerHTML =
      '<div class="k-hero" id="hero-board"><span class="k-hero-tag">Designed from your swipes</span><div class="k-hero-art">' + board + '</div>' +
      (photo ? '<figure class="k-today"><img src="' + photo.src + '" alt="Your kitchen today" style="aspect-ratio:' + ratio(photo) + '"><figcaption>Your kitchen today</figcaption></figure>' : '') +
      '</div>' + note + '<p class="k-photo-err" id="hero-err" role="alert"></p>';
    settleReveal(col.querySelector('.k-hero'), 1600);
    var act = document.getElementById('note-act');
    if (!act) return;
    var needPhoto = !photo || failure(j.res).action === 'photo';
    act.addEventListener('click', function () {
      if (needPhoto) addPhoto(act, document.getElementById('hero-err'), redesign);
      else redesign();
    });
  }

  // Start (or restart) the redesign from the result page, shown in place in the hero.
  function redesign() {
    if (!photo || !E.enabled() || !state.result) return;
    startJob(state.result);
    renderHero();
    if (innerWidth < 900) window.scrollTo({ top: 0, behavior: RV.reducedMotion() ? 'auto' : 'smooth' });
  }

  function failure(res) {
    var swipes = ', so this is the design from your swipes.';
    switch (res.code) {
      case 'not_kitchen': return { text: res.message || 'That photo doesn\'t look like a kitchen. Try one taken from the doorway, with the units in view.', action: 'photo' };
      case 'bad_input': return { text: 'We couldn\'t read that photo' + swipes, action: 'photo' };
      case 'rate_limited': return { text: 'You\'ve reached the limit for redesigns for now' + swipes, action: null };
      case 'engine_busy': return { text: 'Our design engine is busy just now' + swipes, action: 'retry' };
      case 'timeout': return { text: 'Redesigning your photo took too long this time' + swipes, action: 'retry' };
      default: return { text: 'We couldn\'t redesign your photo this time' + swipes, action: 'retry' };
    }
  }

  // Play the reveal once; switching tabs later should not replay it.
  function settleReveal(el, ms) {
    if (!el) return;
    setTimeout(function () { el.classList.add('seen'); }, RV.reducedMotion() ? 0 : ms);
  }

  // Press and hold (or hold Space or Enter) to see their kitchen as it is today.
  function bindHold(btn, hero) {
    var tag = hero.querySelector('.k-hero-tag');
    function on() {
      if (hero.classList.contains('holding')) return;
      hero.classList.add('seen', 'holding');
      btn.setAttribute('aria-pressed', 'true');
      tag.textContent = 'Your kitchen today';
      announce.textContent = 'Showing your kitchen today';
    }
    function off() {
      if (!hero.classList.contains('holding')) return;
      hero.classList.remove('holding');
      btn.setAttribute('aria-pressed', 'false');
      tag.textContent = 'Designed from your swipes';
      announce.textContent = 'Showing your kitchen redesigned';
    }
    btn.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
      on();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(function (ev) { btn.addEventListener(ev, off); });
    btn.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); on(); } });
    btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); off(); } });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function bindTabs(col) {
    var tabs = [].slice.call(col.querySelectorAll('[role=tab]'));
    function select(n) {
      tabs.forEach(function (t, k) {
        var on = k === n;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (n === 1) settleReveal(document.getElementById('hero-board'), 1600);
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        select(n);
        tabs[n].focus();
      });
    });
  }

  function pickSize(id) {
    var s = SIZES.filter(function (x) { return x.id === id; })[0];
    state.size = s;
    app.querySelectorAll('[data-size]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-size') === id ? 'true' : 'false'); });
    var box = document.getElementById('price');
    box.innerHTML = '<div class="k-price"><span class="k-label">Guide price for a ' + s.label.toLowerCase() + ' kitchen</span>' +
      '<span class="rv-price">' + RV.range(s.price[0], s.price[1]) + '</span>' +
      '<p class="rv-small" style="color:var(--rv-body)">Design, supply and fitting, project managed by Riverside from start to finish. Your fixed price is agreed after a free design visit.</p>' +
      '<button class="rv-btn block" type="button" id="book">Book a design consultation</button></div>';
    document.getElementById('book').addEventListener('click', function () { openLead(state.result); });
    if (innerWidth < 900) box.scrollIntoView({ behavior: RV.reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }

  /* ---------- Details and Alex's brief ---------- */
  function openLead(r) {
    var style = r ? A.STYLES[r.top].name + (r.second ? ' with a touch of ' + A.STYLES[r.second].name : '') : 'Not sure yet';
    var size = state.size;
    var price = size ? RV.range(size.price[0], size.price[1]) : 'To discuss';
    var d = r ? A.describe(r.spec) : null;
    var j = engineFor(), ai = j && j.status === 'done' ? j.res.image : null;
    RV.lead({
      title: 'Send your kitchen style to Alex',
      intro: photo ? 'Your style and your kitchen photo go to Alex. He or a member of the team will call you within 24 hours to talk through your space and your budget.'
        : 'Alex or a member of the team will call you within 24 hours to talk through your style, your space and your budget.',
      recap: r ? [A.STYLES[r.top].name, size ? size.label + ' kitchen' : null, price, photo ? 'Photo of your kitchen' : null].filter(Boolean) : ['Style to discuss'],
      submitLabel: 'Send my style to Alex',
      whatsapp: function (v) {
        return 'Hi Alex, I\'ve just used your kitchen style match.\n\n' +
          'Name: ' + v.name + '\nPostcode: ' + v.postcode + '\n' +
          'My style: ' + style + '\n' +
          (size ? 'Kitchen size: ' + size.label + '\nGuide price: ' + price + '\n' : '') +
          (state.loved.length ? 'Kitchens I loved: ' + state.loved.map(function (c) { return c.name; }).join(', ') + '\n' : '') +
          (photo ? 'I\'ve added a photo of my kitchen.\n' : '') +
          '\nCould we book a design consultation?';
      },
      pack: function (v) {
        var rows = [['Name', v.name], ['Mobile', v.mobile], ['Postcode', v.postcode], ['Style', r ? A.STYLES[r.top].name : 'Not sure yet'],
          ['Kitchen size', size ? size.label : 'Not given'], ['Guide price', price]];
        var visual = '';
        if (r) {
          var board = A.svg(r.spec);
          var dna = '<div class="k-pack-dna"><span class="rv-pack-label">Their palette</span>' +
            '<div class="k-pack-pal">' + d.palette.map(function (s) {
              return '<div><i style="background:' + s.colour + '"></i><span>' + RV.esc(s.name) + '</span></div>';
            }).join('') + '</div>' +
            d.rows.slice(0, 4).map(function (row) { return '<div class="k-pack-row"><b>' + RV.esc(row[0]) + ':</b> <span>' + RV.esc(row[1]) + '</span></div>'; }).join('') + '</div>';
          visual = photo
            ? '<div class="k-pack-pair">' + figure('Their kitchen today', '<img src="' + photo.src + '" alt="">') +
              (ai ? figure('In their chosen style', '<img src="' + ai + '" alt="">') : figure('Designed from their swipes', board)) + '</div>' + dna
            : '<div class="k-pack-grid"><div class="k-pack-fig" style="aspect-ratio:4/5">' + board + '</div>' + dna + '</div>';
          visual += thumbs('Loved', state.loved) + thumbs('Not for them', state.nope);
        } else if (photo) {
          visual = '<div class="k-pack-pair">' + figure('Their kitchen today', '<img src="' + photo.src + '" alt="">') + '</div>';
        }
        return { bar: 'New kitchen enquiry', rows: rows, visual: visual, questions: questions(r),
          saving: { value: 'About 45 minutes per lead', label: 'No fact-finding call, and no chasing photos or Pinterest boards before the design visit.' } };
      }
    });
  }

  function figure(label, inner) {
    return '<div class="k-pack-cell"><span class="rv-pack-label">' + label + '</span><div class="k-pack-fig" style="aspect-ratio:' + ratio(photo) + '">' + inner + '</div></div>';
  }

  function thumbs(label, list) {
    if (!list.length) return '';
    return '<div style="display:flex;flex-direction:column;gap:8px"><span class="rv-pack-label">' + label + ' (' + list.length + ')</span>' +
      '<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px">' + list.map(function (c) {
        return '<div title="' + RV.esc(c.name) + '" style="flex:none;width:52px;aspect-ratio:4/5;border-radius:8px;overflow:hidden;' + (label === 'Loved' ? '' : 'opacity:.55;filter:grayscale(.6)') + '">' + art[c.id] + '</div>';
      }).join('') + '</div></div>';
  }

  function questions(r) {
    var q = [];
    if (!r) return ['Ask what they like and dislike about their current kitchen', 'Send three or four portfolio kitchens to react to', 'Appliances: keep or replace?'];
    var s = r.spec;
    q.push('Keep the current layout, or open it up?');
    if (s.island) q.push('Is there at least 1 m clearance all round for an island?');
    if (lumOf(s.unit) < 0.35) q.push('How much daylight does the room get? Deep colours suit bright rooms.');
    if (s.cooker === 'range' || state.loved.some(function (c) { return c.cooker === 'range'; })) q.push('Range cooker, or a separate oven and hob?');
    if (state.size && state.size.id === 'open') q.push('Is a knock-through or extension part of the plan?');
    q.push('Appliances: keep or replace?');
    return q.slice(0, 5);
  }
  function lumOf(h) { var n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
})();
