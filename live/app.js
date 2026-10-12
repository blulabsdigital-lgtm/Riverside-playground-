/* Riverside Live: the customer's live build page and the crew's one-tap updates.
   Demo job, stored in this browser only. Two tabs on the same browser stay in sync. */
(function () {
  'use strict';

  var RV = window.RV;
  var KEY = 'rv-live-demo-v1';
  var JOB = { customer: 'Sarah', title: 'Rear extension and new kitchen', place: 'Kingston upon Thames, KT2', type: 'semi', depth: 5 };
  var STAGES = [
    { name: 'Site set-up', detail: 'Skip, fencing and protection go in. Garden access is closed off for safety.', days: 3 },
    { name: 'Foundations', detail: 'Footings are dug, checked by building control and poured.', days: 7, pay: 'Stage payment' },
    { name: 'Walls up', detail: 'Blockwork and brick rise to roof height.', days: 8 },
    { name: 'Steels and roof', detail: 'The steel beam goes in, the old back wall comes out and the roof goes on.', days: 7 },
    { name: 'Watertight', detail: 'Bi-fold doors and the roof lantern are fitted. The extension is weatherproof.', days: 4, pay: 'Stage payment' },
    { name: 'First fix', detail: 'Electrics, plumbing and heating run through the walls and floor.', days: 6 },
    { name: 'Plastering', detail: 'Walls and ceilings are plastered and the underfloor heating screed is laid.', days: 6 },
    { name: 'Kitchen fitted', detail: 'Units, worktops and appliances go in.', days: 7, pay: 'Stage payment' },
    { name: 'Decorating and finishing', detail: 'Painting, flooring, lights and a final snagging check.', days: 6 },
    { name: 'Handover', detail: 'A final walk-round, keys back and every certificate in your inbox.', days: 1, pay: 'Final payment' }
  ];
  var TEAM = {
    dan: { name: 'Dan', role: 'Site lead' }, marek: { name: 'Marek', role: 'Carpenter' },
    priya: { name: 'Priya', role: 'Electrician' }, tom: { name: 'Tom', role: 'Plasterer' }
  };
  var NOTES = [
    { id: 'onsite', label: 'On site now', text: 'The team is on site.' },
    { id: 'late', label: 'Running 30 min late', text: 'Running about 30 minutes late this morning. Sorry for the wait.' },
    { id: 'delivery', label: 'Delivery arrived', text: 'Materials have been delivered and stored safely.' },
    { id: 'bc', label: 'Inspection passed', text: 'Building control inspection passed today.' },
    { id: 'tidy', label: 'Finished for today', text: 'Finished for today. The site is tidy and secure.' }
  ];
  function needFor(stage) {
    if (stage <= 5) return { id: 'sockets', title: 'Confirm your socket and light positions', reply: 'Socket and light positions look good to me.', by: dateOf(startOf(5)), plan: true };
    if (stage <= 7) return { id: 'paint', title: 'Choose your paint colours for the decorators', reply: 'Paint colours chosen and sent over.', by: dateOf(startOf(8)) };
    if (stage === 8) return { id: 'walk', title: 'Pick a time for your handover walk-round', reply: 'Handover walk-round booked in.', by: dateOf(startOf(9)) };
    return null;
  }

  /* ---------- Dates (working days) ---------- */
  var TOTAL = STAGES.reduce(function (t, s) { return t + s.days; }, 0);
  function startOf(i) { var d = 0; for (var k = 0; k < i; k++) d += STAGES[k].days; return d; }
  var today = new Date(); today.setHours(9, 0, 0, 0);
  // The job started so that today falls in the middle of "Steels and roof"
  var START = addWorkdays(today, -(startOf(3) + 3));
  function addWorkdays(date, n) {
    var d = new Date(date), step = n < 0 ? -1 : 1;
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    for (var i = 0; i < Math.abs(n);) { d.setDate(d.getDate() + step); if (d.getDay() !== 0 && d.getDay() !== 6) i++; }
    return d;
  }
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmt(d) { return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MO[d.getMonth()]; }
  function dateOf(workday) { return fmt(addWorkdays(START, workday)); }
  function stamp(offsetDays, time) {
    if (!offsetDays) return 'Today ' + time;
    if (offsetDays === 1) return 'Yesterday ' + time;
    var d = addWorkdays(today, -offsetDays);
    return WD[d.getDay()] + ' ' + time;
  }

  /* ---------- State ---------- */
  function seed() {
    return {
      stage: 3, onSite: ['dan', 'marek'], confirmed: {}, updates: 14, seq: 4,
      feed: [
        { id: 3, who: 'dan', when: stamp(0, '08:04'), text: 'Morning Sarah. Roof joists going on today, so expect some noise until about 3pm.' },
        { id: 2, who: 'dan', when: stamp(1, '16:20'), text: 'Steel beam is in and the old back wall is out. You can see the full size of the room now.', thumb: 3 },
        { id: 1, who: 'dan', when: stamp(2, '15:40'), text: 'Walls up is complete. Building control were happy with everything.', done: 2 }
      ]
    };
  }
  var state = load();
  var lastAction = null, pending = null;
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s.stage === 'number') return s; } catch (e) { /* storage unavailable */ }
    return seed();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      // Storage full (photos): drop the oldest photo and try once more
      var withPhoto = state.feed.filter(function (f) { return f.photo; });
      if (withPhoto.length) { withPhoto[withPhoto.length - 1].photo = null; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) { /* give up quietly */ } }
    }
  }
  window.addEventListener('storage', function (e) { if (e.key === KEY) { var before = state.stage; state = load(); renderAll(state.stage !== before ? 'stage' : 'feed'); } });

  /* ---------- Layout: tabs on phones, two phones side by side on wide screens ---------- */
  RV.header(document.getElementById('top'), { home: '../', back: '../', backLabel: 'All tools' });
  var tabCust = document.getElementById('tabCust'), tabCrew = document.getElementById('tabCrew');
  var colCust = document.getElementById('colCust'), colCrew = document.getElementById('colCrew');
  function showTab(which) {
    var c = which === 'cust';
    tabCust.setAttribute('aria-selected', c); tabCrew.setAttribute('aria-selected', !c);
    colCust.hidden = !c; colCrew.hidden = c;
    if (c && pending) {
      var hero = document.getElementById('hero');
      if (hero) { hero.classList.remove('l-flash'); void hero.offsetWidth; hero.classList.add('l-flash'); }
      if (pending === 'complete') setTimeout(function () { RV.confetti({ y: 0.3, count: 180 }); }, 250);
      pending = null;
    }
    if (innerWidth < 1000) window.scrollTo({ top: document.querySelector('.l-tabs').offsetTop - 8, behavior: 'auto' });
  }
  tabCust.addEventListener('click', function () { showTab('cust'); });
  tabCrew.addEventListener('click', function () { showTab('crew'); });

  /* ---------- Customer view ---------- */
  function complete() { return state.stage >= STAGES.length; }
  function pct() {
    if (complete()) return 100;
    return Math.round((startOf(state.stage) + STAGES[state.stage].days / 2) / TOTAL * 100);
  }
  function house(stage, label) {
    return RVHouse.svg({ type: JOB.type, depth: JOB.depth, build: { stage: Math.min(stage, 9), complete: stage >= STAGES.length }, label: label || 'Your extension' });
  }

  function custHTML() {
    var done = complete(), s = STAGES[Math.min(state.stage, 9)];
    var week = done ? Math.ceil(TOTAL / 5) : Math.max(1, Math.ceil((startOf(state.stage) + 1) / 5));
    var weeks = Math.ceil(TOTAL / 5);
    var need = done ? null : needFor(state.stage);
    var circ = 2 * Math.PI * 36;
    var h = '<div class="l-view">' +
      '<div class="l-appbar"><h2>Your build</h2><span class="l-live">Live</span></div>' +
      '<div class="l-hello"><h3>' + (done ? 'Welcome home, ' : 'Hi ') + JOB.customer + '</h3><p>' + JOB.title + ' · ' + JOB.place + '</p></div>' +
      '<div class="l-hero" id="hero"><span class="l-now">' + (done ? 'Complete' : 'Now: ' + RV.esc(s.name)) + '</span>' + house(state.stage, done ? 'Your finished extension' : 'Your extension today: ' + s.name) + '</div>' +
      '<div class="l-prog"><div class="l-ring"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="36" fill="none" stroke="#3A3A3D" stroke-width="8"/>' +
      '<circle cx="42" cy="42" r="36" fill="none" stroke="#D4AC5A" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ * (1 - pct() / 100)) + '"/></svg><span>' + pct() + '%</span></div>' +
      '<div class="l-prog-txt"><b>' + (done ? 'Finished on time' : 'Week ' + week + ' of ' + weeks) + '</b>' +
      '<span>' + (done ? 'Handed over ' + dateOf(TOTAL) : 'Handover around ' + dateOf(TOTAL)) + '</span><span class="l-ok">On track</span></div></div>';

    if (done) {
      h += '<div class="l-card gold l-done-card"><span class="l-label">Handed over</span><h4>Enjoy your new kitchen</h4>' +
        '<p>Everything is signed off. Your certificates and guarantee are below, and Alex is always a message away.</p>' +
        '<ul class="l-certs">' + ['Building control completion certificate', 'Electrical installation certificate', 'Riverside 12-month workmanship guarantee'].map(function (c) {
          return '<li>' + RV.icon('check', { size: 18, stroke: 2.6 }) + c + '</li>';
        }).join('') + '</ul>' +
        '<div class="l-btns" style="width:100%"><a class="rv-btn" target="_blank" rel="noopener" href="https://www.checkatrade.com/trades/riversideproprtyservicesconstructionltd">Leave a review</a></div></div>';
    } else {
      h += '<div class="l-card"><span class="l-label">Happening now</span><h4>' + RV.esc(s.name) + '</h4><p>' + RV.esc(s.detail) + '</p>' +
        (STAGES[state.stage + 1] ? '<span class="l-next">Next: ' + RV.esc(STAGES[state.stage + 1].name) + ', from ' + dateOf(startOf(state.stage + 1)) + '</span>' : '') + '</div>';
      if (need) {
        var ok = state.confirmed[need.id];
        h += '<div class="l-card gold"><span class="l-label">Needed from you</span><h4>' + RV.esc(need.title) + '</h4>' +
          (ok ? '<p>' + RV.icon('check', { size: 16, stroke: 3 }).replace('<svg', '<svg style="display:inline;vertical-align:-3px;color:#9FE3BA"') + ' Done ' + RV.esc(ok) + '. Dan has been told.</p>'
            : '<p>By ' + RV.esc(need.by) + ', so the work stays on schedule.</p>' +
            (need.plan ? '<div class="l-plan" id="plan" hidden>' + planSVG() + '</div>' : '') +
            '<div class="l-btns">' + (need.plan ? '<button class="rv-btn ghost" type="button" data-act="plan">See the plan</button>' : '') +
            '<button class="rv-btn" type="button" data-act="confirm" data-need="' + need.id + '">' + (need.plan ? 'Looks good' : 'Done') + '</button></div>') + '</div>';
      }
      h += '<div class="l-card"><span class="l-label">On site today</span><div class="l-team">' +
        (state.onSite.length ? state.onSite.map(function (k) { return person(k); }).join('') : '<p>No one on site today.</p>') +
        '</div><p class="l-next">All Riverside\'s own team. No subcontractors.</p></div>';
    }

    h += '<div class="l-card"><span class="l-label">Latest from site</span><div class="l-feed">' +
      state.feed.slice(0, 8).map(feedItem).join('') + '</div></div>';

    h += '<div class="l-card"><span class="l-label">Your timeline</span><ol class="l-tl">' + STAGES.map(function (st, i) {
      var cls = i < state.stage ? 'done' : i === state.stage ? 'now' : '';
      return '<li class="' + cls + '"><span class="l-dot">' + (i < state.stage ? RV.icon('check', { size: 13, stroke: 3.2 }) : '') + '</span>' +
        '<div><b>' + RV.esc(st.name) + '</b><small>' + (i < state.stage ? 'Done' : i === state.stage ? 'In progress' : 'From ' + dateOf(startOf(i))) + '</small></div>' +
        (st.pay ? '<span class="l-pay">' + st.pay + '</span>' : '<span></span>') + '</li>';
    }).join('') + '</ol></div>';

    h += '<div class="l-btns"><a class="rv-btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Hi Dan, quick question about the extension: ') + '">' + RV.icon('chat', { size: 18 }) + 'Message Dan</a>' +
      '<button class="rv-btn ghost" type="button" data-act="share">' + RV.icon('share', { size: 18 }) + 'Share my build</button></div>';
    return h + '</div>';
  }

  function person(k) {
    var p = TEAM[k];
    return '<span class="l-person"><span class="l-av">' + p.name[0] + '</span><span>' + p.name + '<small>' + p.role + '</small></span></span>';
  }
  function feedItem(f, i) {
    var p = TEAM[f.who] || { name: f.who === 'sarah' ? JOB.customer : 'Riverside' };
    return '<div class="l-item' + (i === 0 && f.fresh ? ' l-new' : '') + '"><span class="l-av">' + p.name[0] + '</span><div class="l-bubble">' +
      (f.done != null ? '<span class="l-tag">Stage complete</span>' : '') +
      '<p>' + RV.esc(f.text) + '</p>' +
      (f.photo ? '<img src="' + f.photo + '" alt="Photo from site">' : '') +
      (f.thumb != null ? '<div class="l-thumb">' + house(f.thumb, 'Site progress') + '</div>' : '') +
      '<span class="l-meta">' + p.name + ' · ' + RV.esc(f.when) + '</span></div></div>';
  }
  function planSVG() {
    // A simple plan of the new kitchen with socket and light positions
    var s = '<svg viewBox="0 0 300 170" role="img" aria-label="Plan of the new kitchen with socket and light positions">' +
      '<rect x="10" y="10" width="280" height="150" fill="#1A1A1C" stroke="#D4AC5A" stroke-width="3"/>' +
      '<rect x="14" y="14" width="160" height="26" fill="#2E2A24" stroke="#6A5532"/><rect x="100" y="80" width="90" height="34" fill="#2E2A24" stroke="#6A5532"/>' +
      '<rect x="230" y="60" width="44" height="60" rx="4" fill="none" stroke="#6A5532"/>' +
      '<line x1="290" y1="40" x2="290" y2="130" stroke="#F6DFA6" stroke-width="4"/>' +
      '<text x="94" y="31" fill="#9A958E" font-size="9" font-family="inherit" text-anchor="middle">Units</text><text x="145" y="101" fill="#9A958E" font-size="9" font-family="inherit" text-anchor="middle">Island</text><text x="252" y="93" fill="#9A958E" font-size="9" font-family="inherit" text-anchor="middle">Table</text>';
    [[40, 44], [80, 44], [130, 44], [168, 44], [110, 117], [180, 117], [20, 140]].forEach(function (p) { s += '<rect x="' + (p[0] - 5) + '" y="' + (p[1] - 3) + '" width="10" height="6" rx="1.5" fill="#EDD08E"/>'; });
    [[60, 62], [120, 62], [180, 62], [125, 97], [165, 97], [252, 90]].forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="none" stroke="#EDD08E" stroke-width="1.6"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.6" fill="#EDD08E"/>'; });
    return s + '<rect x="16" y="146" width="10" height="6" rx="1.5" fill="#EDD08E" transform="translate(150 0)"/><text x="182" y="153" fill="#C9C4BC" font-size="9" font-family="inherit">Socket</text><circle cx="232" cy="150" r="4.5" fill="none" stroke="#EDD08E" stroke-width="1.6"/><text x="241" y="153" fill="#C9C4BC" font-size="9" font-family="inherit">Light</text></svg>';
  }

  /* ---------- Crew view ---------- */
  function crewHTML() {
    var done = complete(), s = STAGES[Math.min(state.stage, 9)];
    var need = done ? null : needFor(state.stage);
    var h = '<div class="l-view">' +
      '<div class="l-appbar"><h2>Riverside crew</h2><span class="c-sub">' + fmt(new Date()) + '</span></div>' +
      '<div class="l-hello"><h3>Morning, Dan</h3><p>Site lead · 3 jobs this week</p></div>' +
      '<div class="c-job active"><div class="c-job-head"><div><b>' + JOB.customer + '\'s extension</b><span>' + JOB.place + '</span></div><span class="rv-chip gold">' + (done ? 'Complete' : pct() + '%') + '</span></div>' +
      '<div class="c-dots" aria-hidden="true">' + STAGES.map(function (st, i) { return '<i class="' + (i < state.stage ? 'done' : i === state.stage ? 'now' : '') + '"></i>'; }).join('') + '</div>';
    if (done) {
      h += '<p style="font-size:15px;color:var(--rv-ink)">Job complete and handed over. ' + JOB.customer + ' has her certificates and a review link.</p>' +
        '<button class="rv-btn ghost block" type="button" data-act="reset">Reset the demo</button>';
    } else {
      h += '<div><span class="c-sub">Current stage</span><div style="font-size:19px;font-weight:800;color:var(--rv-ink)">' + RV.esc(s.name) + '</div></div>' +
        '<button class="rv-btn block c-big" type="button" data-act="stage">' + RV.icon('check', { stroke: 3 }) + 'Mark "' + RV.esc(s.name) + '" done</button>' +
        '<div class="c-row"><label class="rv-btn ghost" style="cursor:pointer">' + RV.icon('camera') + 'Add a photo<input type="file" accept="image/*" capture="environment" data-act="photo" hidden></label>' +
        '<button class="rv-btn ghost" type="button" data-act="late">' + RV.icon('clock') + 'Running late</button></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px"><span class="c-sub">Quick updates</span><div class="c-chips">' +
        NOTES.filter(function (n) { return n.id !== 'late'; }).map(function (n) { return '<button class="c-chip" type="button" data-note="' + n.id + '">' + n.label + '</button>'; }).join('') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px"><span class="c-sub">On site today</span><div class="c-chips">' +
        Object.keys(TEAM).map(function (k) { return '<button class="c-chip" type="button" aria-pressed="' + (state.onSite.indexOf(k) > -1) + '" data-team="' + k + '">' + TEAM[k].name + '</button>'; }).join('') + '</div></div>' +
        (need ? '<div class="c-cust">' + RV.icon(state.confirmed[need.id] ? 'check' : 'clock', { size: 18 }) + '<span>' + RV.esc(need.title) + ': <b>' + (state.confirmed[need.id] ? 'done ' + RV.esc(state.confirmed[need.id]) : 'waiting on ' + JOB.customer) + '</b></span></div>' : '');
      if (lastAction) h += '<button class="rv-link c-undo" type="button" data-act="undo">Undo: ' + RV.esc(lastAction.label) + '</button>';
    }
    h += '<div class="c-saved">' + JOB.customer + ' has had <b>' + state.updates + ' updates</b> on this job without anyone picking up the phone.</div></div>';
    h += '<div class="c-job c-other"><div class="c-job-head"><div><b>Loft conversion</b><span>Wimbledon, SW19</span></div><span class="rv-chip">Plastering</span></div></div>' +
      '<div class="c-job c-other"><div class="c-job-head"><div><b>Kitchen refit</b><span>Twickenham, TW1</span></div><span class="rv-chip">First fix</span></div></div>' +
      '<button class="rv-link" type="button" data-act="reset" style="align-self:center">Reset the demo</button>';
    return h + '</div>';
  }

  /* ---------- Actions ---------- */
  function post(item) {
    state.feed.forEach(function (f) { f.fresh = false; });
    item.id = ++state.seq; item.fresh = true; item.when = item.when || stamp(0, RV.timeNow());
    state.feed.unshift(item);
    state.feed = state.feed.slice(0, 20);
    state.updates++;
  }

  function act(name, el) {
    if (name === 'stage') {
      var s = STAGES[state.stage];
      lastAction = { label: s.name + ' done', undo: JSON.stringify(state) };
      post({ who: 'dan', text: s.name + ' is complete.' + (STAGES[state.stage + 1] ? ' Next up: ' + STAGES[state.stage + 1].name.toLowerCase() + '.' : ' Welcome to your new kitchen.'), done: state.stage, thumb: Math.min(state.stage + 1, 10) });
      state.stage++;
      save(); renderAll('stage');
      RV.toast(complete() ? 'Job complete. ' + JOB.customer + ' can see it now.' : JOB.customer + '\'s page is updated');
    } else if (name === 'undo' && lastAction) {
      state = JSON.parse(lastAction.undo); lastAction = null; save(); renderAll('feed');
    } else if (name === 'late') {
      var n = NOTES.filter(function (x) { return x.id === 'late'; })[0];
      lastAction = { label: n.label, undo: JSON.stringify(state) };
      post({ who: 'dan', text: n.text }); save(); renderAll('feed'); RV.toast('Sent to ' + JOB.customer);
    } else if (name === 'confirm') {
      state.confirmed[el.getAttribute('data-need')] = RV.timeNow();
      post({ who: 'sarah', text: needFor(state.stage).reply });
      state.updates--; // a customer reply is not a crew update
      save(); renderAll('feed'); RV.toast('Thanks. Dan has been told.');
    } else if (name === 'plan') {
      var pl = document.getElementById('plan'); if (pl) { pl.hidden = !pl.hidden; el.textContent = pl.hidden ? 'See the plan' : 'Hide the plan'; }
    } else if (name === 'share') {
      var data = { title: 'My Riverside build', text: 'Watch my extension being built, live.', url: location.href };
      if (navigator.share) navigator.share(data).catch(function () { /* cancelled */ });
      else if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { RV.toast('Link copied'); }, function () { RV.toast('Copy the address bar to share'); });
    } else if (name === 'reset') {
      try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
      state = seed(); lastAction = null; renderAll('feed'); RV.toast('Demo reset');
    }
  }

  function bind(root) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (a && a.tagName !== 'INPUT') { act(a.getAttribute('data-act'), a); return; }
      var n = e.target.closest('[data-note]');
      if (n) {
        var note = NOTES.filter(function (x) { return x.id === n.getAttribute('data-note'); })[0];
        lastAction = { label: note.label, undo: JSON.stringify(state) };
        post({ who: 'dan', text: note.text }); save(); renderAll('feed'); RV.toast('Sent to ' + JOB.customer);
        return;
      }
      var t = e.target.closest('[data-team]');
      if (t) {
        var k = t.getAttribute('data-team'), i = state.onSite.indexOf(k);
        if (i > -1) state.onSite.splice(i, 1); else state.onSite.push(k);
        save(); renderAll('team');
      }
    });
    root.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-act') !== 'photo' || !e.target.files[0]) return;
      shrink(e.target.files[0], function (url) {
        lastAction = { label: 'photo', undo: JSON.stringify(state) };
        post({ who: 'dan', text: 'Photo from site: ' + (STAGES[Math.min(state.stage, 9)].name).toLowerCase() + '.', photo: url });
        save(); renderAll('feed'); RV.toast('Photo sent to ' + JOB.customer);
      });
    });
  }

  function shrink(file, cb) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 900, k = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = function () { URL.revokeObjectURL(url); RV.toast('That photo could not be read'); };
    img.src = url;
  }

  /* ---------- Render ---------- */
  var custEl = document.getElementById('cust'), crewEl = document.getElementById('crew');
  var custPhone = document.getElementById('custPhone'), crewPhone = document.getElementById('crewPhone');
  bind(custEl); bind(crewEl);

  function renderAll(why) {
    var cs = custPhone.scrollTop, ws = crewPhone.scrollTop;
    custEl.innerHTML = custHTML();
    crewEl.innerHTML = crewHTML();
    crewPhone.scrollTop = ws;
    custPhone.scrollTop = why === 'stage' ? 0 : cs;
    document.getElementById('strip').innerHTML =
      '<div><b>' + state.updates + '</b><span>updates sent to ' + JOB.customer + '</span></div>' +
      '<div><b>0</b><span>"how\'s it going?" calls</span></div>' +
      '<div><b>' + pct() + '%</b><span>of the build done</span></div>' +
      '<div><b>' + dateOf(TOTAL) + '</b><span>handover date</span></div>';
    if (why === 'stage') {
      var hero = document.getElementById('hero');
      if (hero) { hero.classList.remove('l-flash'); void hero.offsetWidth; hero.classList.add('l-flash'); }
      var rc = custPhone.getBoundingClientRect();
      var visible = innerWidth >= 1000 || !colCust.hidden;
      if (!visible) pending = complete() ? 'complete' : 'stage';
      else if (complete()) RV.confetti({ x: Math.min(0.95, Math.max(0.05, (rc.left + rc.width / 2) / innerWidth)), y: 0.3, count: 180 });
      document.getElementById('announce').textContent = complete() ? 'The build is complete.' : 'Now: ' + STAGES[state.stage].name;
    }
  }
  renderAll('feed');
})();
