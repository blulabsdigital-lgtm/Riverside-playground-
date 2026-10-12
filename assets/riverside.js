/* Riverside playground: shared helpers for every demo tool.
   Header and logo, money formatting, icons, toast, confetti, count-up numbers,
   and the details form that ends with "What Alex receives".
   Demo only: nothing leaves the browser. */
(function () {
  'use strict';

  var LOGO = 'https://cdn.prod.website-files.com/687f8bc8806320c2296ac1e3/69392eaa85728d65fac25e5e_master-new.png';
  // Turns the copper logo gold, the same matrix the bathroom visualiser uses.
  var GOLD_FILTER = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="rv-gold" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.9178 0.0172 0.0653 0 0 0.4049 0.9154 -0.3217 0 0 0.2699 -0.0564 0.7855 0 0 0 0 0 1 0"/></filter></svg>';

  var ICONS = {
    heart: '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    undo: '<path d="M9 7H4v5"/><path d="M4.5 12A8 8 0 1 0 7 6.3L4 9"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  function icon(name, opts) {
    opts = opts || {};
    var fill = opts.fill ? 'currentColor' : 'none';
    return '<svg viewBox="0 0 24 24" width="' + (opts.size || 22) + '" height="' + (opts.size || 22) + '" fill="' + fill +
      '" stroke="currentColor" stroke-width="' + (opts.stroke || 2.2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      ICONS[name] + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '£' + Math.round(n).toLocaleString('en-GB'); }
  function range(lo, hi) { return hi ? money(lo) + ' – ' + money(hi) : 'From ' + money(lo); }
  function roundTo(n, step) { return Math.round(n / step) * step; }
  function reducedMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function timeNow() {
    var d = new Date();
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  /* Header: gold logo (falls back to a wordmark if the logo cannot load) and a back link. */
  function header(el, opts) {
    opts = opts || {};
    if (!document.getElementById('rv-gold')) document.body.insertAdjacentHTML('afterbegin', GOLD_FILTER);
    el.innerHTML =
      '<a class="rv-brand" href="' + esc(opts.home || './') + '" aria-label="Riverside playground home">' +
      '<img class="rv-logo" src="' + LOGO + '" alt="Riverside Construction Group" width="1549" height="855"></a>' +
      (opts.back ? '<a class="rv-back" href="' + esc(opts.back) + '">' + icon('back', { size: 16, stroke: 2.6 }) + '<span>' + esc(opts.backLabel || 'All tools') + '</span></a>' : '');
    var img = el.querySelector('img');
    img.addEventListener('error', function () {
      var s = document.createElement('span');
      s.className = 'rv-wordmark';
      s.textContent = 'RIVERSIDE';
      img.replaceWith(s);
    });
  }

  /* Toast */
  var toastTimer;
  function toast(msg) {
    var old = document.querySelector('.rv-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'rv-toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }

  /* Confetti in Riverside gold. */
  function confetti(opts) {
    if (reducedMotion()) return;
    opts = opts || {};
    var c = document.createElement('canvas');
    c.className = 'rv-confetti';
    document.body.appendChild(c);
    var ctx = c.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    var colours = ['#D4AC5A', '#EDD08E', '#A9823A', '#FFFFFF', '#C9C4BC'];
    var ox = (opts.x == null ? 0.5 : opts.x) * innerWidth, oy = (opts.y == null ? 0.3 : opts.y) * innerHeight;
    var parts = [];
    for (var i = 0; i < (opts.count || 150); i++) {
      var a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11;
      parts.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, w: 5 + Math.random() * 6, h: 8 + Math.random() * 9,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35, c: colours[i % colours.length] });
    }
    var start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x * dpr, p.y * dpr);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w * dpr / 2, -p.h * dpr / 2 * Math.abs(Math.cos(p.r * 1.7)), p.w * dpr, p.h * dpr * Math.abs(Math.cos(p.r * 1.7)) + 1);
        ctx.restore();
      });
      if (t - start < 3400) requestAnimationFrame(frame); else c.remove();
    })(start);
  }

  /* Count a number up (or down) to its new value. */
  function countTo(el, to, format, ms) {
    format = format || function (n) { return Math.round(n).toLocaleString('en-GB'); };
    var from = parseFloat(el.getAttribute('data-n') || '0');
    el.setAttribute('data-n', to);
    if (reducedMotion() || from === to) { el.textContent = format(to); return; }
    var start = performance.now(), dur = ms || 650;
    cancelAnimationFrame(el._raf);
    (function step(t) {
      var k = Math.min(1, (t - start) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = format(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(start);
  }

  /* Details form, then the thank-you screen with "What Alex receives".
     cfg: { title, intro, recap:[text], submitLabel, kind, whatsapp(d), pack(d) -> {bar, rows, visual, questions, saving:{value,label}} } */
  var DEMO_PERSON = { name: 'Sarah Mitchell', mobile: '07700 900123', postcode: 'KT2 5AB' };
  var remembered = null;

  function lead(cfg) {
    var lastFocus = document.activeElement;
    var sheet = document.createElement('div');
    sheet.className = 'rv-sheet';
    sheet.innerHTML = '<div class="rv-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="rv-sheet-title"></div>';
    var panel = sheet.firstChild;
    document.body.appendChild(sheet);
    document.body.style.overflow = 'hidden';

    function close() {
      sheet.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      if (cfg.onClose) cfg.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });

    var closeBtn = '<button class="rv-sheet-close" type="button" aria-label="Close">' + icon('x', { size: 18, stroke: 2.6 }) + '</button>';
    var d = remembered || { name: '', mobile: '', postcode: '' };

    panel.innerHTML = closeBtn +
      '<div style="display:flex;flex-direction:column;gap:8px;padding-right:40px">' +
      '<span class="rv-eyebrow">Last step</span><h2 id="rv-sheet-title">' + esc(cfg.title) + '</h2>' +
      '<p class="rv-small" style="color:var(--rv-body)">' + esc(cfg.intro) + '</p></div>' +
      (cfg.recap && cfg.recap.length ? '<div class="rv-recap">' + cfg.recap.map(function (r) { return '<span class="rv-chip gold">' + esc(r) + '</span>'; }).join('') + '</div>' : '') +
      '<form class="rv-form" novalidate>' +
      field('name', 'Your name', 'text', 'name', d.name) +
      field('mobile', 'Mobile number', 'tel', 'tel', d.mobile) +
      field('postcode', 'Postcode', 'text', 'postal-code', d.postcode) +
      '<button class="rv-btn block" type="submit">' + esc(cfg.submitLabel || 'Send to Alex') + '</button>' +
      '<div class="rv-row split"><button class="rv-link" type="button" data-demo>Use demo details</button>' +
      '<span class="rv-small">Demo: nothing is sent.</span></div></form>';

    panel.querySelector('.rv-sheet-close').addEventListener('click', close);
    var form = panel.querySelector('form');
    panel.querySelector('[data-demo]').addEventListener('click', function () {
      form.name.value = DEMO_PERSON.name; form.mobile.value = DEMO_PERSON.mobile; form.postcode.value = DEMO_PERSON.postcode;
      form.querySelector('button[type=submit]').focus();
    });
    setTimeout(function () { form.name.focus({ preventScroll: true }); }, 60);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = { name: form.name.value.trim(), mobile: form.mobile.value.trim(), postcode: form.postcode.value.trim().toUpperCase() };
      var ok = true;
      ok = check(form, 'name', v.name.length >= 2, 'Please add your name.') && ok;
      ok = check(form, 'mobile', /^(\+44|0)\d{9,10}$/.test(v.mobile.replace(/[\s()-]/g, '')), 'Please add a UK mobile number, for example 07700 900123.') && ok;
      ok = check(form, 'postcode', /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/.test(v.postcode), 'Please add your postcode, for example KT2 5AB.') && ok;
      if (!ok) { var bad = form.querySelector('[aria-invalid=true]'); if (bad) bad.focus(); return; }
      remembered = v;
      v.first = v.name.split(/\s+/)[0];
      v.time = timeNow();
      showThanks(v);
    });

    function showThanks(v) {
      var p = cfg.pack(v);
      var wa = cfg.whatsapp(v);
      panel.innerHTML = closeBtn +
        '<div class="rv-thanks"><div class="rv-tick">' + icon('check', { size: 28, stroke: 3 }) + '</div>' +
        '<h2 id="rv-sheet-title">Thank you, ' + esc(v.first) + '</h2>' +
        '<p class="rv-small" style="color:var(--rv-body);max-width:420px">Alex or a member of the team will review your details and call you within 24 hours to talk it through.</p></div>' +
        '<hr class="rv-divider">' +
        '<div class="rv-pack-head"><span class="rv-eyebrow">What Alex receives</span>' +
        '<h3>Everything arrives in one place, ready for the first call</h3>' +
        '<p class="rv-small">The customer sends the WhatsApp. The full brief goes to Alex by email at the same moment.</p></div>' +
        '<div class="rv-pack-label">On WhatsApp</div>' +
        '<div class="rv-wa"><div class="rv-wa-top"><span class="rv-wa-av">' + esc(initials(v.name)) + '</span>' + esc(v.name) + '</div>' +
        '<div class="rv-wa-bubble">' + esc(wa) + '<span class="rv-wa-time">' + esc(v.time) + '</span></div></div>' +
        '<div class="rv-pack-label">By email, with everything</div>' +
        '<div class="rv-pack"><div class="rv-pack-bar">' + esc(p.bar) + '<span>Today ' + esc(v.time) + '</span></div><div class="rv-pack-body">' +
        '<div class="rv-pack-grid">' + p.rows.map(function (r) { return '<div><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>'; }).join('') + '</div>' +
        (p.visual || '') +
        (p.questions && p.questions.length ? '<div style="display:flex;flex-direction:column;gap:10px"><div class="rv-pack-label">Ready for the call</div><ul class="rv-pack-list">' +
          p.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>' : '') +
        (p.saving ? '<div class="rv-saving"><small>Time saved (estimate)</small><b>' + esc(p.saving.value) + '</b><span>' + esc(p.saving.label) + '</span></div>' : '') +
        '</div></div>' +
        '<div class="rv-row" style="flex-direction:column;align-items:stretch">' +
        '<a class="rv-btn ghost block" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(wa) + '">' + icon('chat') + 'Try the WhatsApp message</a>' +
        '<button class="rv-btn block" type="button" data-done>Done</button>' +
        '<p class="rv-small" style="text-align:center">The WhatsApp button opens your own chats, not Alex\'s, while this is a demo.</p></div>';
      panel.querySelector('.rv-sheet-close').addEventListener('click', close);
      panel.querySelector('[data-done]').addEventListener('click', close);
      panel.scrollTop = 0;
      panel.querySelector('[data-done]').focus({ preventScroll: true });
      confetti({ y: 0.25 });
      if (cfg.onSent) cfg.onSent(v);
    }
  }

  function field(name, label, type, auto, value) {
    var id = 'rv-f-' + name;
    return '<div class="rv-field"><label for="' + id + '">' + esc(label) + '</label>' +
      '<input id="' + id + '" name="' + name + '" type="' + type + '" autocomplete="' + auto + '" value="' + esc(value) + '"' +
      (type === 'tel' ? ' inputmode="tel"' : '') + (name === 'postcode' ? ' autocapitalize="characters"' : '') +
      ' aria-describedby="' + id + '-err"><span class="rv-err" id="' + id + '-err" aria-live="polite"></span></div>';
  }
  function check(form, name, ok, msg) {
    var input = form[name];
    input.setAttribute('aria-invalid', ok ? 'false' : 'true');
    form.querySelector('#rv-f-' + name + '-err').textContent = ok ? '' : msg;
    return ok;
  }
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('');
  }

  window.RV = { icon: icon, esc: esc, money: money, range: range, roundTo: roundTo, header: header, toast: toast,
    confetti: confetti, countTo: countTo, lead: lead, reducedMotion: reducedMotion, timeNow: timeNow };
})();
