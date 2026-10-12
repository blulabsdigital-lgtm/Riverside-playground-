/* Grow your home: pick a house, drag to extend, tap to add a loft or a floor above.
   Live extra space, guide price, time on site and planning route, then a project brief for Alex. */
(function () {
  'use strict';

  /* PLACEHOLDER figures, inside Riverside's published ranges (single storey £40–80k+, double £70k+,
     dormer loft 8–12 weeks, hip-to-gable 10–14 weeks). Confirm with Alex. */
  var HOUSES = {
    terrace: { label: 'Terrace', long: 'Terraced house', width: 5, pd: 3, pa: 6, hint: 'Joined on both sides',
      loft: { name: 'Rear dormer loft', area: 20, price: [50000, 65000], weeks: [8, 12], vol: 40 } },
    semi: { label: 'Semi-detached', long: 'Semi-detached house', width: 6.5, pd: 3, pa: 6, hint: 'Joined on one side',
      loft: { name: 'Hip-to-gable and rear dormer loft', area: 26, price: [60000, 80000], weeks: [10, 14], vol: 50 } },
    detached: { label: 'Detached', long: 'Detached house', width: 9, pd: 4, pa: 8, hint: 'Standing on its own',
      loft: { name: 'Rear dormer loft', area: 30, price: [55000, 75000], weeks: [8, 12], vol: 50 } }
  };
  var RATE = { ground: [2700, 3400], ground_min: [40000, 50000], upper: [1900, 2400] };
  var PLAN = {
    pd: { label: 'Usually not needed', c: '#3FA66B' },
    prior: { label: 'Prior approval', c: '#E0A33A' },
    full: { label: 'Planning likely', c: '#E2704F' },
    none: { label: 'Nothing yet', c: '#6B665F' }
  };

  var RV = window.RV;
  var app = document.getElementById('app');
  var announce = document.getElementById('announce');
  RV.header(document.getElementById('top'), { home: '../', back: '../', backLabel: 'All tools' });

  var state = { type: null, depth: 0, upper: false, loft: false, hints: { ext: true, loft: true, upper: true }, touched: false };
  pick();

  /* ---------- Pick a house ---------- */
  function pick() {
    app.innerHTML = '<section class="g-pick rv-screen"><span class="rv-eyebrow">Grow your home</span>' +
      '<h1>See how much more home you could have</h1>' +
      '<p class="rv-lead">Tap the house most like yours, then drag to build. It takes about 20 seconds.</p>' +
      '<div class="g-houses">' + Object.keys(HOUSES).map(function (k) {
        return '<button class="g-house" type="button" data-type="' + k + '">' + front(k) + '<b>' + HOUSES[k].label + '</b><small>' + HOUSES[k].hint + '</small></button>';
      }).join('') + '</div>' +
      '<div class="g-demo" aria-hidden="true"><div id="demoArt"></div><span class="g-demo-cap" id="demoCap"></span></div></section>';
    app.querySelectorAll('[data-type]').forEach(function (b) {
      b.addEventListener('click', function () { stopDemo(); state.type = b.getAttribute('data-type'); state.depth = 0; state.upper = false; state.loft = false; builder(); });
    });
    startDemo();
  }

  /* A house that builds itself on a loop, so the first screen shows what the tool does */
  var demoTimer = null;
  function startDemo() {
    var frames = [], d;
    for (d = 0; d <= 5; d += 0.5) frames.push({ depth: d, loft: false, cap: d ? d.toFixed(1).replace('.0', '') + ' m extension' : 'Your house today' });
    for (d = 0; d < 6; d++) frames.push({ depth: 5, loft: true, cap: '5 m extension and a loft' });
    for (d = 0; d < 6; d++) frames.push({ depth: 5, loft: true, upper: true, cap: 'Two storeys and a loft' });
    for (d = 5; d >= 0; d -= 1) frames.push({ depth: d, loft: false, cap: d ? d + ' m extension' : 'Your house today' });
    var i = 0, prev = null;
    function step() {
      var el = document.getElementById('demoArt'), cap = document.getElementById('demoCap');
      if (!el) return stopDemo();
      var f = frames[i % frames.length];
      var pop = prev && f.loft && !prev.loft ? 'loft' : prev && f.upper && !prev.upper ? 'upper' : null;
      el.innerHTML = RVHouse.svg({ type: 'semi', depth: f.depth, loft: f.loft, upper: !!f.upper, pop: pop, label: 'An example house growing' });
      cap.textContent = f.cap;
      prev = f; i++;
    }
    step();
    if (!RV.reducedMotion()) demoTimer = setInterval(step, 260);
  }
  function stopDemo() { clearInterval(demoTimer); demoTimer = null; }

  /* Small front views of each house type */
  function front(k) {
    var mute = '#5E5952', gold = '#D4AC5A', body = '#2A2826', win = '#3A3631', lit = '#E9C77E';
    function house(x, w, on, roofPts) {
      var s = '<rect x="' + x + '" y="34" width="' + w + '" height="40" fill="' + body + '" stroke="' + (on ? gold : mute) + '" stroke-width="1.6"/>';
      var dx = x + w * 0.62;
      s += '<rect x="' + dx + '" y="54" width="' + (w * 0.2) + '" height="20" fill="' + (on ? '#3D3324' : win) + '" stroke="' + (on ? gold : mute) + '" stroke-width="1.2"/>';
      s += '<rect x="' + (x + w * 0.14) + '" y="52" width="' + (w * 0.32) + '" height="14" fill="' + (on ? lit : win) + '"/>';
      s += '<rect x="' + (x + w * 0.14) + '" y="39" width="' + (w * 0.26) + '" height="10" fill="' + (on ? lit : win) + '"/><rect x="' + (x + w * 0.58) + '" y="39" width="' + (w * 0.26) + '" height="10" fill="' + (on ? lit : win) + '"/>';
      return s;
    }
    var s = '<svg viewBox="0 0 120 80" aria-hidden="true">';
    if (k === 'terrace') {
      s += '<polygon points="2,34 118,34 108,18 12,18" fill="#24221F" stroke="' + mute + '" stroke-width="1.4"/>';
      s += '<rect x="40" y="10" width="5" height="10" fill="' + mute + '"/><rect x="76" y="10" width="5" height="10" fill="' + mute + '"/>';
      s += house(6, 36, false) + house(78, 36, false) + house(42, 36, true);
      s += '<polyline points="42,34 42,18 78,18 78,34" fill="none" stroke="' + gold + '" stroke-width="1.6"/>';
    } else if (k === 'semi') {
      s += '<polygon points="12,34 108,34 94,14 26,14" fill="#24221F" stroke="' + mute + '" stroke-width="1.4"/>';
      s += '<polygon points="60,34 108,34 94,14 60,14" fill="#2C2822" stroke="' + gold + '" stroke-width="1.6"/>';
      s += '<rect x="57" y="7" width="6" height="9" fill="' + mute + '"/>';
      s += house(16, 44, false) + house(60, 44, true);
    } else {
      s += '<rect x="96" y="50" width="18" height="24" fill="' + body + '" stroke="' + mute + '" stroke-width="1.4"/><polygon points="94,50 116,50 112,43 98,43" fill="#24221F" stroke="' + mute + '" stroke-width="1.2"/>';
      s += '<polygon points="16,34 100,34 86,12 30,12" fill="#2C2822" stroke="' + gold + '" stroke-width="1.6"/>';
      s += '<rect x="74" y="5" width="6" height="10" fill="' + mute + '"/>';
      s += house(20, 76, true);
    }
    s += '<line x1="0" y1="74.5" x2="120" y2="74.5" stroke="' + mute + '" stroke-width="1"/></svg>';
    return s;
  }

  /* ---------- Builder ---------- */
  var stage, dragging = false;
  function builder() {
    var h = HOUSES[state.type];
    app.innerHTML =
      '<section class="g-build rv-screen"><div class="g-grid">' +
      '<div class="g-head"><div class="rv-row"><span class="rv-chip gold">' + h.long + ' · about ' + h.width + ' m wide</span>' +
      '<button class="rv-link" type="button" id="change" style="padding:4px 6px;font-size:14px">Change house</button></div>' +
      '<h2 id="headline">Drag the back of your house</h2></div>' +
      '<div class="g-stage" id="stage"><span class="g-depth" id="depthTag"></span><div id="art" style="width:100%;height:100%"></div></div>' +
      '<div class="g-panel">' +
      '<div class="g-controls">' +
      '<div class="g-range"><label for="depth">Rear extension <span id="depthVal">None</span></label>' +
      '<input id="depth" type="range" min="0" max="' + h.pa + '" step="0.5" value="0"></div>' +
      '<div class="g-toggles"><button class="g-toggle" type="button" id="tLoft" aria-pressed="false"><i>' + RV.icon('plus', { stroke: 3 }) + '</i><span>Loft conversion</span></button>' +
      '<button class="g-toggle" type="button" id="tUpper" aria-pressed="false" disabled><i>' + RV.icon('plus', { stroke: 3 }) + '</i><span>Floor above</span></button></div></div>' +
      '<div class="g-stats">' +
      '<div class="g-stat big"><b>Extra space</b><strong><span id="sArea">0</span> m<sup>2</sup></strong></div>' +
      '<div class="g-stat big"><b>Guide price</b><strong id="sPrice">–</strong></div>' +
      '<div class="g-stat"><b>Time on site</b><strong id="sWeeks">–</strong></div>' +
      '<div class="g-stat"><b>Planning</b><span class="g-badge" id="sPlan"></span></div></div>' +
      '<div class="g-idea" id="idea">' + RV.icon('star', { size: 26 }) + '<span id="ideaText"></span></div>' +
      '<div class="g-plan"><details><summary>How the planning works</summary><ul id="planList"></ul>' +
      '<p>Flats, listed buildings, conservation areas and Article 4 areas have different rules. Riverside checks this, and handles building regulations, before any work starts.</p></details></div>' +
      '<button class="rv-btn block" type="button" id="book" disabled>Book a consultation</button>' +
      '<p class="rv-small" style="text-align:center;margin-top:-6px">Guide figures. Your fixed price comes after a survey.</p>' +
      '</div></div></section>';

    stage = document.getElementById('stage');
    document.getElementById('change').addEventListener('click', pick);
    var range = document.getElementById('depth');
    range.addEventListener('input', function () { setDepth(parseFloat(range.value), true); });
    document.getElementById('tLoft').addEventListener('click', function () { toggle('loft'); });
    document.getElementById('tUpper').addEventListener('click', function () { toggle('upper'); });
    document.getElementById('book').addEventListener('click', openLead);
    bindStage();
    render();
    update(false);
  }

  function render(pop) {
    document.getElementById('art').innerHTML = RVHouse.svg({
      type: state.type, depth: state.depth, upper: state.upper, loft: state.loft,
      interactive: true, hints: state.hints, pop: pop,
      label: 'Your ' + HOUSES[state.type].long.toLowerCase() + ', side view' + (state.depth ? ', with a ' + state.depth + ' metre rear extension' : '') + (state.upper ? ' and a floor above' : '') + (state.loft ? ' and a loft conversion' : '')
    });
  }

  function svgX(clientX) {
    var rc = stage.getBoundingClientRect();
    return (clientX - rc.left) * (420 / rc.width);
  }
  function svgY(clientY) {
    var rc = stage.getBoundingClientRect();
    return 40 + (clientY - rc.top) * (226 / rc.height);
  }

  function bindStage() {
    var S = 17, x0 = 30;
    var h = HOUSES[state.type], t = RVHouse.TYPES[state.type];
    var xr = x0 + t.depth * S;
    var downAt = null;
    stage.addEventListener('pointerdown', function (e) {
      var hit = e.target.closest && e.target.closest('[data-h]');
      var key = hit ? hit.getAttribute('data-h') : null;
      var x = svgX(e.clientX), y = svgY(e.clientY);
      // Start a drag from the handle, the extension, or the garden at ground level
      if (key === 'ext' || (!key && x > xr - 6 && y > 236 - 3.6 * S && y < 250)) {
        dragging = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('dragging');
        downAt = x;
        e.preventDefault();
        return;
      }
      if (key === 'loft' || key === 'upper') { e.preventDefault(); toggle(key); }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var x = svgX(e.clientX);
      var d = Math.round(((x - xr) / S) * 2) / 2;
      d = Math.max(0, Math.min(h.pa, d));
      if (d !== state.depth) setDepth(d, false);
      var tag = document.getElementById('depthTag');
      tag.textContent = d ? d.toFixed(1).replace('.0', '') + ' m' : 'No extension';
      tag.classList.add('on');
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('dragging');
      document.getElementById('depthTag').classList.remove('on');
      update(true);
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  function setDepth(d, fromRange) {
    var before = state.depth;
    state.depth = d;
    if (d > 0) state.hints.ext = false;
    if (d < 2 && state.upper) state.upper = false;
    if (!fromRange) document.getElementById('depth').value = d;
    if (navigator.vibrate && Math.floor(before) !== Math.floor(d)) try { navigator.vibrate(5); } catch (e) { /* not supported */ }
    render(before === 0 && d > 0 ? 'ext' : null);
    update(!dragging);
  }

  function toggle(key) {
    if (key === 'upper' && state.depth < 2) { RV.toast('Drag the extension out to at least 2 m first'); return; }
    state[key] = !state[key];
    state.hints[key] = false;
    render(state[key] ? key : null);
    update(true);
    if (state[key]) announce.textContent = key === 'loft' ? 'Loft conversion added' : 'Floor above added';
  }

  /* ---------- The numbers ---------- */
  function calc() {
    var h = HOUSES[state.type], items = [];
    var area = 0, lo = 0, hi = 0, wLo = 0, wHi = 0, plan = 'none';
    var rank = { none: 0, pd: 1, prior: 2, full: 3 };
    function worst(p) { if (rank[p] > rank[plan]) plan = p; }
    if (state.depth > 0) {
      var a = state.depth * h.width;
      area += a;
      lo += Math.max(RATE.ground_min[0], a * RATE.ground[0]);
      hi += Math.max(RATE.ground_min[1], a * RATE.ground[1]);
      wLo = 8 + state.depth * 0.7; wHi = 10 + state.depth;
      var p = state.upper ? 'full' : state.depth <= h.pd ? 'pd' : 'prior';
      worst(p);
      items.push(state.upper ? 'Two-storey extensions usually need full planning permission. Decisions normally take about 8 weeks.'
        : p === 'pd' ? 'Single-storey rear extensions up to ' + h.pd + ' m usually count as permitted development, so no planning application.'
          : 'Between ' + h.pd + ' m and ' + h.pa + ' m you can usually build under the prior approval scheme. Neighbours are consulted and the council decides within 42 days.');
      if (state.upper) {
        area += a;
        lo += a * RATE.upper[0]; hi += a * RATE.upper[1];
        wLo += 4; wHi += 5;
      }
    }
    if (state.loft) {
      area += h.loft.area;
      lo += h.loft.price[0]; hi += h.loft.price[1];
      if (wLo) { wLo = Math.max(wLo, h.loft.weeks[0]) + 2; wHi = Math.max(wHi, h.loft.weeks[1]) + 4; }
      else { wLo = h.loft.weeks[0]; wHi = h.loft.weeks[1]; }
      worst('pd');
      items.push((state.type === 'semi' ? 'Hip-to-gable and rear dormer lofts' : 'Most rear dormer lofts') + ' are usually permitted development, within ' + h.loft.vol + ' cubic metres of extra roof space for this house.');
    }
    lo = Math.floor(lo / 5000) * 5000; hi = Math.ceil(hi / 5000) * 5000;
    return { area: Math.round(area), lo: lo, hi: hi, wLo: Math.round(wLo), wHi: Math.round(wHi), plan: plan, items: items };
  }

  function idea(c) {
    var ext = state.depth * HOUSES[state.type].width, parts = [];
    if (!state.depth && !state.loft) return 'Drag the back of the house, or tap the roof to add a loft.';
    if (state.depth) {
      parts.push(ext < 10 ? 'a bigger kitchen with a breakfast bar' : ext < 20 ? 'a kitchen-diner with an island' : ext < 32 ? 'an open-plan kitchen, dining and family space' : 'a kitchen, dining room, family room and utility');
    }
    if (state.upper) parts.push('a new bedroom upstairs');
    if (state.loft) parts.push(state.depth ? 'a top-floor bedroom' : 'a new top-floor bedroom and a study');
    return 'Room for ' + parts.join(', plus ') + '.';
  }

  function headline() {
    if (!state.depth && !state.loft) return 'Drag the back of your house';
    if (state.depth && state.loft) return 'Your house, grown in two directions';
    if (state.upper) return 'Your two-storey extension';
    if (state.loft) return 'Your loft conversion';
    return state.depth < 3 ? 'A neat rear extension' : state.depth < 5 ? 'Your new kitchen-diner' : 'Your big open-plan space';
  }

  function update(animate) {
    var c = calc();
    var dv = document.getElementById('depthVal');
    dv.textContent = state.depth ? state.depth.toFixed(1).replace('.0', '') + ' m deep' : 'None';
    var area = document.getElementById('sArea');
    if (animate) RV.countTo(area, c.area, null, 450); else { area.textContent = c.area; area.setAttribute('data-n', c.area); }
    document.getElementById('sPrice').textContent = c.lo ? short(c.lo) + '–' + short(c.hi) : '–';
    document.getElementById('sWeeks').textContent = c.wLo ? c.wLo + '–' + c.wHi + ' weeks' : '–';
    var pl = PLAN[c.plan], badge = document.getElementById('sPlan');
    badge.textContent = pl.label; badge.style.setProperty('--c', pl.c);
    document.getElementById('ideaText').textContent = idea(c);
    document.getElementById('headline').textContent = headline();
    document.getElementById('planList').innerHTML = c.items.length ? c.items.map(function (i) { return '<li>' + RV.esc(i) + '</li>'; }).join('') : '<li>Add an extension or a loft to see the planning route.</li>';
    var tl = document.getElementById('tLoft'), tu = document.getElementById('tUpper');
    tl.setAttribute('aria-pressed', state.loft); tl.querySelector('i').innerHTML = RV.icon(state.loft ? 'check' : 'plus', { stroke: 3 });
    tu.setAttribute('aria-pressed', state.upper); tu.querySelector('i').innerHTML = RV.icon(state.upper ? 'check' : 'plus', { stroke: 3 });
    tu.disabled = state.depth < 2;
    var book = document.getElementById('book');
    book.disabled = !c.lo;
    book.textContent = c.lo ? 'Book a consultation' : 'Add an extension or a loft first';
    state.last = c;
  }
  function short(n) { return n >= 1000000 ? '£' + (n / 1000000).toFixed(1) + 'm' : '£' + Math.round(n / 1000) + 'k'; }

  /* ---------- Details and Alex's brief ---------- */
  function project() {
    var h = HOUSES[state.type], parts = [];
    if (state.depth) parts.push(state.depth.toFixed(1).replace('.0', '') + ' m ' + (state.upper ? 'two-storey' : 'single-storey') + ' rear extension');
    if (state.loft) parts.push((state.depth ? 'a ' : '') + h.loft.name.charAt(0).toLowerCase() + h.loft.name.slice(1));
    return parts.join(', plus ');
  }

  function openLead() {
    var c = calc(), h = HOUSES[state.type];
    var price = RV.range(c.lo, c.hi);
    var proj = project();
    var art = RVHouse.svg({ type: state.type, depth: state.depth, upper: state.upper, loft: state.loft, label: 'Their project' });
    RV.lead({
      title: 'Send your project to Alex',
      intro: 'Alex or a member of the team will call you within 24 hours to talk it through and book a survey if it suits.',
      recap: [h.label, proj.charAt(0).toUpperCase() + proj.slice(1), '+' + c.area + ' m²', price],
      submitLabel: 'Send my project to Alex',
      whatsapp: function (v) {
        return 'Hi Alex, I\'ve just used Grow your home.\n\n' +
          'Name: ' + v.name + '\nPostcode: ' + v.postcode + '\n' +
          'House: ' + h.long + '\n' +
          'Project: ' + proj.charAt(0).toUpperCase() + proj.slice(1) + '\n' +
          'Extra space: about ' + c.area + ' m²\n' +
          'Guide price: ' + price + '\n\nCould we book a consultation?';
      },
      pack: function (v) {
        var q = [];
        if (state.depth) {
          q.push('How far is the rear wall from the back boundary?');
          q.push('Any drains or manholes where the extension would sit?');
        }
        if (state.loft) q.push('Is there at least 2.2 m of head height under the ridge?');
        q.push('Is the house in a conservation area or an Article 4 area?');
        q.push('When would they like to start?');
        return {
          bar: 'New extension enquiry',
          rows: [['Name', v.name], ['Mobile', v.mobile], ['Postcode', v.postcode], ['House', h.label],
            ['Extra space', c.area + ' m²'], ['Guide price', price], ['Time on site', c.wLo + '–' + c.wHi + ' weeks'], ['Planning', PLAN[c.plan].label]],
          visual: '<div style="display:flex;flex-direction:column;gap:8px"><span class="rv-pack-label">Their project</span>' +
            '<div style="border-radius:12px;overflow:hidden;border:1px solid var(--rv-line-gold);aspect-ratio:420/226">' + art + '</div>' +
            '<div style="font-size:14.5px;color:var(--rv-ink);font-weight:700">' + RV.esc(proj.charAt(0).toUpperCase() + proj.slice(1)) + '</div></div>',
          questions: q,
          saving: { value: 'Up to half a day per lead', label: 'They have seen a guide price and a planning route, so the people who book a survey are serious.' }
        };
      }
    });
  }
})();
