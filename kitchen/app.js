/* Kitchen style match: swipe ten Riverside kitchens, get a style, a kitchen designed from the swipes,
   one tap for size, a guide price, and a style brief for Alex. */
(function () {
  'use strict';

  /* PLACEHOLDER guide prices, inside Riverside's published £15k–£40k+ for a full kitchen. Confirm with Alex. */
  var SIZES = [
    { id: 'compact', label: 'Compact', hint: 'Galley or a small kitchen', price: [15000, 20000], icon: '<path d="M8 8h6v24H8zM26 8h6v24h-6z"/>' },
    { id: 'medium', label: 'Medium', hint: 'Room for a small table', price: [20000, 28000], icon: '<path d="M8 8h24v6H14v18H8z"/><circle cx="25" cy="25" r="4"/>' },
    { id: 'large', label: 'Large', hint: 'Room for an island', price: [28000, 36000], icon: '<path d="M8 8h24v24h-6V14H14v18H8z"/><rect x="17" y="21" width="6" height="8"/>' },
    { id: 'open', label: 'Open-plan', hint: 'Kitchen-diner or extension', price: [36000, null], icon: '<path d="M6 8h16v5H11v13H6z"/><rect x="15" y="18" width="8" height="5"/><rect x="26" y="22" width="9" height="11" rx="1.5"/>' }
  ];

  var A = window.KitchenArt, RV = window.RV;
  var app = document.getElementById('app');
  var announce = document.getElementById('announce');
  RV.header(document.getElementById('top'), { home: '../', back: '../', backLabel: 'All tools' });

  var art = {};
  A.CARDS.forEach(function (c) { art[c.id] = c.photo ? '<img src="' + RV.esc(c.photo) + '" alt="">' : A.svg(c); });

  var state;
  function reset() { state = { i: 0, order: A.CARDS.slice(), loved: [], nope: [], history: [], size: null, result: null }; }
  reset();
  intro();

  /* ---------- Intro ---------- */
  function intro() {
    app.innerHTML =
      '<section class="k-intro rv-screen">' +
      '<div class="k-fan" aria-hidden="true"><div class="k-mini">' + art.clay + '</div><div class="k-mini">' + art.forest + '</div><div class="k-mini">' + art.sage + '</div>' +
      '<div class="k-heart">' + RV.icon('heart', { fill: true, size: 24 }) + '</div></div>' +
      '<div class="k-intro-copy"><span class="rv-eyebrow">Kitchen style match</span>' +
      '<h1>Find your kitchen style in 30 seconds</h1>' +
      '<p class="rv-lead">Swipe through ten Riverside kitchens. Right if you love it, left if it\'s not for you. We\'ll work out your style and design a kitchen from your picks.</p>' +
      '<button class="rv-btn block" type="button" id="go">Start swiping ' + RV.icon('arrow', { size: 20 }) + '</button>' +
      '<p class="rv-small" style="margin-top:6px">No sign-up. One question at the end.</p></div></section>';
    document.getElementById('go').addEventListener('click', swipe);
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
      if (state.i >= state.order.length) building(); else drawStack();
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

  function building() {
    var loved = state.loved;
    if (!loved.length) return noMatch();
    app.innerHTML = '<section class="k-build rv-screen"><span class="rv-eyebrow">Your picks</span>' +
      '<div class="k-board">' + loved.slice(0, 9).map(function (c, i) { return '<div style="animation-delay:' + (i * 0.09) + 's">' + art[c.id] + '</div>'; }).join('') + '</div>' +
      '<p class="k-build-msg" id="msg">Reading your swipes…</p></section>';
    var msgs = ['Matching your style…', 'Designing your kitchen…'];
    var wait = RV.reducedMotion() ? 0 : 750;
    setTimeout(function () { var m = document.getElementById('msg'); if (m) m.textContent = msgs[0]; }, wait);
    setTimeout(function () { var m = document.getElementById('msg'); if (m) m.textContent = msgs[1]; }, wait * 2);
    setTimeout(result, wait * 3 + 100);
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
    var ranked = scoreStyles();
    var r = design(ranked);
    state.result = r;
    var style = A.STYLES[r.top], d = A.describe(r.spec);
    var yours = A.svg(r.spec, { label: 'Your kitchen, designed from your swipes' });
    state.yoursArt = yours;
    app.innerHTML =
      '<section class="k-result rv-screen"><div class="k-res-grid">' +
      '<div class="k-hero"><span class="k-hero-tag">Designed from your swipes</span><div class="k-hero-art">' + yours + '</div></div>' +
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
    RV.lead({
      title: 'Send your kitchen style to Alex',
      intro: 'Alex or a member of the team will call you within 24 hours to talk through your style, your space and your budget.',
      recap: r ? [A.STYLES[r.top].name, size ? size.label + ' kitchen' : null, price].filter(Boolean) : ['Style to discuss'],
      submitLabel: 'Send my style to Alex',
      whatsapp: function (v) {
        return 'Hi Alex, I\'ve just used your kitchen style match.\n\n' +
          'Name: ' + v.name + '\nPostcode: ' + v.postcode + '\n' +
          'My style: ' + style + '\n' +
          (size ? 'Kitchen size: ' + size.label + '\nGuide price: ' + price + '\n' : '') +
          (state.loved.length ? 'Kitchens I loved: ' + state.loved.map(function (c) { return c.name; }).join(', ') + '\n' : '') +
          '\nCould we book a design consultation?';
      },
      pack: function (v) {
        var rows = [['Name', v.name], ['Mobile', v.mobile], ['Postcode', v.postcode], ['Style', r ? A.STYLES[r.top].name : 'Not sure yet'],
          ['Kitchen size', size ? size.label : 'Not given'], ['Guide price', price]];
        var visual = '';
        if (r) {
          visual = '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start">' +
            '<div style="border-radius:12px;overflow:hidden;aspect-ratio:4/5;border:1px solid var(--rv-line-gold)">' + state.yoursArt + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:10px;min-width:0"><span class="rv-pack-label">Their palette</span>' +
            '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">' + d.palette.map(function (s) {
              return '<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;min-width:0"><i style="flex:none;width:18px;height:18px;border-radius:5px;background:' + s.colour + ';border:1px solid rgba(255,255,255,.2)"></i><span style="overflow-wrap:anywhere">' + RV.esc(s.name) + '</span></div>';
            }).join('') + '</div>' +
            d.rows.slice(0, 4).map(function (row) { return '<div style="font-size:13px;line-height:1.35"><b style="color:var(--rv-muted)">' + RV.esc(row[0]) + ':</b> <span style="color:var(--rv-ink)">' + RV.esc(row[1]) + '</span></div>'; }).join('') +
            '</div></div>' +
            thumbs('Loved', state.loved) + thumbs('Not for them', state.nope);
        }
        return { bar: 'New kitchen enquiry', rows: rows, visual: visual, questions: questions(r),
          saving: { value: 'About 45 minutes per lead', label: 'No fact-finding call, and no chasing photos or Pinterest boards before the design visit.' } };
      }
    });
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
