/* Riverside house illustrations: a side section of a house at dusk.
   RVHouse.svg(opts) draws the house with an optional rear extension, a floor above it and a loft dormer.
   Used by Grow your home (interactive) and Riverside Live (the build, stage by stage).
   opts: { type: 'terrace'|'semi'|'detached', depth: metres, upper: bool, loft: bool,
           interactive: bool, hints: {ext,loft,upper}, pop: 'ext'|'loft'|'upper',
           build: { stage: 0-9, complete: bool } } */
(function () {
  'use strict';
  var VW = 420, VH = 300, G = 236, S = 17, VY = 40, VHH = 226;
  var TYPES = {
    terrace: { depth: 9, eaves: 5.6, ridge: 8.9, ghost: true },
    semi: { depth: 9, eaves: 5.8, ridge: 9.4, ghost: true },
    detached: { depth: 10, eaves: 5.8, ridge: 9.6, ghost: false }
  };
  var C = {
    gold: '#D4AC5A', goldHi: '#EDD08E', goldDeep: '#A9823A', line: '#E9C77E',
    wall: '#6B655C', wallDark: '#4A453F', room: '#2B2824', furn: '#4A453E', roof: '#2E2B28',
    block: '#8C857B', steel: '#B57F3A', glass: '#F6DFA6'
  };
  var uid = 0;

  function svg(o) {
    o = o || {};
    var p = 'rh' + (++uid);
    var t = TYPES[o.type] || TYPES.semi;
    var x0 = 30, xr = x0 + t.depth * S, xm = (x0 + xr) / 2;
    var yE = G - t.eaves * S, yR = G - t.ridge * S, yF = G - 2.9 * S, yX = G - 3.1 * S;
    var d = Math.max(0, o.depth || 0), xe = xr + d * S;
    var b = o.build || null;
    var stage = b ? (b.complete ? 99 : b.stage) : 99;
    function done(i) { return stage > i; }
    function wip(i) { return b && !b.complete && b.stage === i; }
    function shown(i) { return done(i) || wip(i); }
    var finished = !b || b.complete;
    var lit = !b || done(8) || b.complete;
    var hasExt = d > 0 && (!b || shown(2));
    var upper = !!o.upper && d >= 2 && !b;
    var loft = !!o.loft && !b;
    var out = [];
    var defs = [
      '<linearGradient id="' + p + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0F11"/><stop offset=".65" stop-color="#1B1A1A"/><stop offset="1" stop-color="#2B241C"/></linearGradient>',
      '<linearGradient id="' + p + 'soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D1915"/><stop offset="1" stop-color="#110F0D"/></linearGradient>',
      '<linearGradient id="' + p + 'new" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B4526"/><stop offset="1" stop-color="#2E2519"/></linearGradient>',
      '<radialGradient id="' + p + 'glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#F3CF83" stop-opacity=".55"/><stop offset="1" stop-color="#F3CF83" stop-opacity="0"/></radialGradient>',
      '<radialGradient id="' + p + 'lamp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#E3B865" stop-opacity=".22"/><stop offset="1" stop-color="#E3B865" stop-opacity="0"/></radialGradient>',
      '<linearGradient id="' + p + 'gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF3D1"/><stop offset="1" stop-color="#E9BE6A"/></linearGradient>'
    ];
    var css = '<style>' +
      '.rvh-bob{animation:rvh-bob 1.5s ease-in-out infinite}' +
      '.rvh-wip{animation:rvh-wip 1.3s ease-in-out infinite}' +
      '.rvh-pulse{animation:rvh-pulse 1.8s ease-out infinite;transform-box:fill-box;transform-origin:center}' +
      '.rvh-pop{animation:rvh-pop .6s cubic-bezier(.2,1.5,.4,1) both;transform-box:fill-box;transform-origin:50% 100%}' +
      '.rvh-twinkle{animation:rvh-tw 3s ease-in-out infinite}' +
      '@keyframes rvh-bob{50%{transform:translateY(-1.5px)}}' +
      '@keyframes rvh-wip{50%{opacity:.4}}' +
      '@keyframes rvh-pulse{0%{transform:scale(1);opacity:.75}100%{transform:scale(2.4);opacity:0}}' +
      '@keyframes rvh-pop{from{transform:scaleY(.2);opacity:0}to{transform:none;opacity:1}}' +
      '@keyframes rvh-tw{50%{opacity:.25}}' +
      '@media (prefers-reduced-motion:reduce){.rvh-bob,.rvh-wip,.rvh-pulse,.rvh-pop,.rvh-twinkle{animation:none}}' +
      '</style>';

    /* Sky, stars, moon, horizon */
    out.push(r(0, 0, VW, G, 'url(#' + p + 'sky)'));
    [[40, 52], [92, 66], [150, 48], [214, 58], [262, 46], [318, 82], [352, 54], [118, 92], [244, 100], [404, 96], [18, 76], [288, 62], [330, 120], [190, 112]].forEach(function (s, i) {
      out.push('<circle cx="' + s[0] + '" cy="' + s[1] + '" r="' + (i % 3 ? 0.9 : 1.3) + '" fill="#F2E6C9" class="' + (i % 4 ? '' : 'rvh-twinkle') + '" opacity=".8"/>');
    });
    out.push('<circle cx="372" cy="70" r="26" fill="url(#' + p + 'glow)" opacity=".5"/><circle cx="372" cy="70" r="9" fill="#EFE5C9"/><circle cx="376" cy="67" r="8" fill="#1A1A1C" opacity=".18"/>');
    out.push('<path d="M0 ' + (G - 22) + ' Q30 ' + (G - 40) + ' 60 ' + (G - 26) + ' T130 ' + (G - 30) + ' T220 ' + (G - 24) + ' T320 ' + (G - 34) + ' T420 ' + (G - 22) + ' V' + G + ' H0Z" fill="#17171A"/>');

    /* Neighbour behind (attached houses) */
    if (t.ghost) {
      out.push('<g transform="translate(12 -9)" opacity=".55"><path d="' + housePath() + '" fill="#18181B" stroke="#2A2A2E" stroke-width="1.2"/></g>');
    }

    /* Ground */
    out.push(r(0, G, VW, VH - G, 'url(#' + p + 'soil)'));
    var lawn = finished ? '#2C3627' : '#2A2722';
    out.push(r(0, G - 2.5, x0, 3, '#2C3627'), r(xr, G - 2.5, VW - xr, 3, lawn));
    // Fence and tree at the end of the garden
    for (var fx = 364; fx < 420; fx += 9) out.push(r(fx, G - 22, 3.4, 22, '#2B2622'));
    out.push(r(364, G - 17, 56, 2.4, '#2B2622'), r(364, G - 8, 56, 2.4, '#2B2622'));
    out.push(r(396, G - 46, 5, 46, '#2A221B'), '<circle cx="398" cy="' + (G - 58) + '" r="22" fill="#1E2A1C"/><circle cx="384" cy="' + (G - 48) + '" r="14" fill="#223020"/><circle cx="410" cy="' + (G - 46) + '" r="13" fill="#1B2619"/>');
    // Footings under the house walls
    out.push(r(x0 - 5, G, 10, 0.9 * S, '#3A3632'), r(xr - 5, G, 10, 0.9 * S, '#3A3632'));

    /* Existing house */
    out.push(r(x0, yE, xr - x0, G - yE, C.room));
    out.push('<ellipse cx="' + (x0 + 2 * S) + '" cy="' + (G - 1.2 * S) + '" rx="' + (2.4 * S) + '" ry="' + (1.4 * S) + '" fill="url(#' + p + 'lamp)"/>');
    out.push('<ellipse cx="' + (x0 + 2.3 * S) + '" cy="' + (yF - 1.2 * S) + '" rx="' + (2.2 * S) + '" ry="' + (1.2 * S) + '" fill="url(#' + p + 'lamp)"/>');
    // Furniture: sofa and lamp downstairs, stairs, bed upstairs
    out.push(furn('M' + (x0 + 0.8 * S) + ' ' + G + ' v-' + (0.75 * S) + ' h' + (0.5 * S) + ' v' + (0.3 * S) + ' h' + (1.8 * S) + ' v' + (0.45 * S) + 'Z'));
    out.push(r(x0 + 3.4 * S, G - 1.5 * S, 1.6, 1.5 * S, C.furn), '<circle cx="' + (x0 + 3.4 * S + 0.8) + '" cy="' + (G - 1.6 * S) + '" r="4" fill="#E3B865" opacity=".55"/>');
    out.push(stairs(x0 + 4.8 * S, G, x0 + 7.4 * S, yF + 2, C.furn, 1.6));
    out.push(furn('M' + (x0 + 0.7 * S) + ' ' + yF + ' v-' + (0.95 * S) + ' h3 v' + (0.45 * S) + ' h' + (1.9 * S) + ' v' + (0.5 * S) + 'Z'));
    out.push(r(x0 + 3.6 * S, yF - 1.9 * S, 0.9 * S, 1.9 * S, C.furn));
    // Floors and walls
    out.push(r(x0, yF - 1.5, xr - x0, 3.5, C.wall), r(x0, yE - 1.5, xr - x0, 3, C.wall), r(x0 - 4, G - 1, xr - x0 + 8, 3, C.wall));
    out.push(r(x0 - 2.5, yE, 5, G - yE, C.wall));
    var opened = hasExt && (!b || done(3));
    if (!opened) out.push(r(xr - 2.5, yF, 5, G - yF, C.wall));
    else out.push(r(xr - 2.5, G - 0.25 * S, 5, 0.25 * S, C.wall));
    if (!(upper && !b)) out.push(r(xr - 2.5, yE, 5, yF - yE, C.wall));
    else out.push(r(xr - 2.5, yE, 5, 0.4 * S, C.wall), r(xr - 2.5, yF - 0.3 * S, 5, 0.3 * S, C.wall));
    // Windows in the walls
    out.push(r(x0 - 1.5, G - 2.2 * S, 3, 1.3 * S, '#C99E52', 'opacity=".75"'), r(x0 - 1.5, yF - 2.0 * S, 3, 1.3 * S, '#C99E52', 'opacity=".75"'));
    if (!opened) out.push(r(xr - 1.5, G - 2.2 * S, 3, 1.3 * S, '#C99E52', 'opacity=".6"'));
    if (!upper) out.push(r(xr - 1.5, yF - 2.0 * S, 3, 1.3 * S, '#C99E52', 'opacity=".6"'));
    // Roof, chimney and loft void
    var eL = x0 - 0.5 * S, eR = xr + 0.5 * S;
    out.push('<polygon points="' + eL + ',' + yE + ' ' + xm + ',' + yR + ' ' + eR + ',' + yE + '" fill="#252321"/>');
    var chx = x0 + 2.2 * S, chy = slopeY(chx, eL, yE, xm, yR);
    out.push(r(chx, yR - 0.7 * S, 0.65 * S, chy - yR + 0.7 * S, '#3A3632'), r(chx - 1.5, yR - 0.85 * S, 0.65 * S + 3, 3, '#4A453F'));
    out.push('<path d="M' + eL + ' ' + yE + ' L' + xm + ' ' + yR + ' L' + eR + ' ' + yE + '" fill="none" stroke="#625C53" stroke-width="5" stroke-linejoin="round"/>');
    // Rafters hatch in the loft
    for (var i = 1; i < 8; i++) {
      var hx = eL + (xm - eL) * i / 8, hx2 = xm + (eR - xm) * i / 8;
      out.push('<line x1="' + hx + '" y1="' + slopeY(hx, eL, yE, xm, yR) + '" x2="' + hx + '" y2="' + yE + '" stroke="#2C2A27" stroke-width="1"/>');
      if (!loft) out.push('<line x1="' + hx2 + '" y1="' + slopeY(hx2, eR, yE, xm, yR) + '" x2="' + hx2 + '" y2="' + yE + '" stroke="#2C2A27" stroke-width="1"/>');
    }

    /* Rear extension */
    var newLine = finished ? C.gold : C.block;
    if (b && shown(0) && !done(1)) {
      // Footprint marked out on the ground
      out.push('<rect x="' + xr + '" y="' + (G - 2) + '" width="' + (xe - xr) + '" height="3" fill="none" stroke="' + C.gold + '" stroke-width="1.4" stroke-dasharray="4 3" class="' + (wip(0) ? 'rvh-wip' : '') + '"/>');
      out.push(r(xe - 1, G - 9, 2, 9, C.gold), r(xr + 1, G - 9, 2, 9, C.gold));
    }
    if (b && shown(1)) {
      if (!done(1)) out.push('<g class="rvh-wip">' + r(xe - 6, G, 12, 1.1 * S, '#0A0908') + r(xr + 2, G, xe - xr - 4, 0.35 * S, '#0A0908') + '</g>');
      else out.push(r(xe - 5, G, 10, 0.9 * S, '#4A4540'), r(xr, G, xe - xr, 0.25 * S, '#3A3632'));
    } else if (hasExt) {
      out.push(r(xe - 5, G, 10, 0.9 * S, '#3A3632'));
    }
    if (hasExt) {
      var wallTop = b && wip(2) ? G - 0.55 * (G - yX) : yX;
      var g1 = [];
      var plastered = !b || done(6);
      g1.push(r(xr, wallTop, xe - xr, G - wallTop, plastered ? (lit ? 'url(#' + p + 'new)' : '#3B3123') : '#2C2B29'));
      if (lit) g1.push('<ellipse cx="' + ((xr + xe) / 2) + '" cy="' + (G - 1.3 * S) + '" rx="' + Math.max(20, (xe - xr) * 0.6) + '" ry="' + (1.6 * S) + '" fill="url(#' + p + 'glow)" opacity=".7"/>');
      // Kitchen units on the side wall, island, pendants, dining table and sofa
      if (!b || done(7)) {
        var kEnd = Math.min(xe - 0.5 * S, xr + 4.2 * S);
        if (kEnd > xr + 1 * S) {
          g1.push(r(xr + 0.3 * S, G - 0.9 * S, kEnd - xr - 0.3 * S, 0.9 * S, '#6A5532', 'opacity=".75"'), r(xr + 0.3 * S, G - 0.95 * S, kEnd - xr - 0.3 * S, 2, C.line, 'opacity=".7"'));
          g1.push(r(xr + 0.3 * S, G - 2.35 * S, kEnd - xr - 0.3 * S, 0.65 * S, '#6A5532', 'opacity=".6"'));
        }
        if (d >= 2) {
          var iw = Math.min(2.2, d * 0.42) * S, ix = xr + 0.9 * S;
          g1.push(r(ix, G - 0.92 * S, iw, 0.92 * S, '#4A3A22'), r(ix - 3, G - 0.98 * S, iw + 6, 3, C.line));
          if (!upper || true) {
            [ix + iw * 0.3, ix + iw * 0.7].forEach(function (px) {
              g1.push('<line x1="' + px + '" y1="' + (yX + 2) + '" x2="' + px + '" y2="' + (yX + 0.85 * S) + '" stroke="' + C.line + '" stroke-width=".8"/>');
              g1.push('<circle cx="' + px + '" cy="' + (yX + 0.85 * S + 3) + '" r="' + (lit ? 3.6 : 3) + '" fill="' + (lit ? '#FFE7AE' : '#6A5532') + '"/>');
              if (lit) g1.push('<circle cx="' + px + '" cy="' + (yX + 0.85 * S + 3) + '" r="12" fill="url(#' + p + 'glow)"/>');
            });
          }
        }
      }
      if ((!b || done(8)) && d >= 4.5) {
        var tx = xr + 3.5 * S;
        g1.push(r(tx, G - 0.78 * S, 1.6 * S, 3, C.line), r(tx + 3, G - 0.78 * S, 2, 0.78 * S, C.line), r(tx + 1.6 * S - 5, G - 0.78 * S, 2, 0.78 * S, C.line));
        g1.push(chair(tx - 0.35 * S, G, -1), chair(tx + 1.6 * S + 0.35 * S, G, 1));
        g1.push(plant(tx + 0.8 * S, G - 0.78 * S - 1));
      }
      if ((!b || done(8)) && d >= 6.5) {
        var sx = xr + 5.8 * S;
        g1.push('<path d="M' + sx + ' ' + G + ' v-' + (0.8 * S) + ' h4 v' + (0.35 * S) + ' h' + (1.7 * S) + ' v' + (0.45 * S) + 'Z" fill="none" stroke="' + C.line + '" stroke-width="1.6"/>');
      }
      // Wiring during first fix
      if (b && shown(5) && !done(6)) {
        g1.push('<path d="M' + (xr + 4) + ' ' + (yX + 6) + ' H' + (xe - 6) + ' M' + (xr + 2 * S) + ' ' + (yX + 6) + ' V' + (G - 0.6 * S) + ' M' + (xe - 1.2 * S) + ' ' + (yX + 6) + ' V' + (G - 1.1 * S) + '" stroke="' + C.gold + '" stroke-width="1.3" stroke-dasharray="3 2" fill="none" class="' + (wip(5) ? 'rvh-wip' : '') + '"/>');
      }
      // End wall: glass once watertight, block before
      var glazed = !b || done(4);
      if (glazed) {
        g1.push(r(xe - 3, yX + 3, 4, G - yX - 3, 'url(#' + p + 'gl)'), r(xe - 4, yX + 3, 1, G - yX - 3, newLine));
        if (lit) g1.push('<ellipse cx="' + (xe + 2.2 * S) + '" cy="' + (G + 1) + '" rx="' + (2.6 * S) + '" ry="5" fill="url(#' + p + 'glow)"/>');
      } else {
        var wcls = wip(2) ? ' class="rvh-wip"' : '';
        g1.push('<g' + wcls + '>' + r(xe - 3, wallTop, 6, G - wallTop, C.block) + courses(xe - 3, wallTop, 6, G - wallTop) + '</g>');
        if (b && done(2) && wip(4)) g1.push(r(xe - 3, yX + 3, 5, G - yX - 3, C.glass, 'class="rvh-wip" opacity=".7"'));
      }
      // Roof slab, steel and lantern
      if (!b || shown(3)) {
        var rcls = wip(3) ? ' class="rvh-wip"' : '';
        g1.push('<g' + rcls + '>' + r(xr - 2, yX - 4, xe - xr + 6, 4.5, finished ? C.gold : '#A07A50') + r(xe - 1, yX - 7, 4, 7, finished ? C.gold : '#A07A50') + '</g>');
        g1.push(r(xr - 5, yF + 1, 10, 6, C.steel), r(xr - 5, yF + 3, 10, 1.6, '#000', 'opacity=".35"'));
        if (!upper && d >= 3 && (!b || shown(4))) {
          var cx = (xr + xe) / 2, wl = Math.min(2.4, d - 1.4) * S, top = yX - 4 - 0.55 * S;
          g1.push('<polygon points="' + (cx - wl / 2) + ',' + (yX - 4) + ' ' + (cx - wl / 2 + 6) + ',' + top + ' ' + (cx + wl / 2 - 6) + ',' + top + ' ' + (cx + wl / 2) + ',' + (yX - 4) + '" fill="' + C.glass + '" opacity="' + (lit ? '.95' : '.55') + '" stroke="' + newLine + '" stroke-width="1.2"' + (wip(4) ? ' class="rvh-wip"' : '') + '/>');
          if (lit) g1.push('<polygon points="' + (cx - wl / 2) + ',' + yX + ' ' + (cx + wl / 2) + ',' + yX + ' ' + (cx + wl / 2 + 10) + ',' + G + ' ' + (cx - wl / 2 - 10) + ',' + G + '" fill="#FFE7AE" opacity=".08"/>');
        }
      }
      if (!b || done(2)) g1.push(r(xr, G - 1, xe - xr + 3, 3, newLine));
      out.push('<g' + (o.pop === 'ext' ? ' class="rvh-pop"' : '') + '>' + g1.join('') + '</g>');
    }

    /* Floor above the extension */
    if (upper) {
      var g2 = [];
      g2.push(r(xr, yE, xe - xr, yX - yE - 4, 'url(#' + p + 'new)'));
      g2.push('<ellipse cx="' + ((xr + xe) / 2) + '" cy="' + (yX - 1.2 * S) + '" rx="' + ((xe - xr) * 0.6) + '" ry="' + (1.2 * S) + '" fill="url(#' + p + 'glow)" opacity=".6"/>');
      var bw = Math.min(2.0, d - 0.9) * S;
      g2.push('<path d="M' + (xr + 0.7 * S) + ' ' + (yX - 4) + ' v-' + (0.95 * S) + ' h3 v' + (0.45 * S) + ' h' + (bw - 3) + ' v' + (0.5 * S) + 'Z" fill="none" stroke="' + C.line + '" stroke-width="1.6"/>');
      g2.push(r(xe - 3, yE + 0.8 * S, 4, 1.4 * S, 'url(#' + p + 'gl)'), r(xe - 3, yE, 4, 0.8 * S, C.gold), r(xe - 3, yE + 2.2 * S, 4, yX - yE - 2.2 * S, C.gold));
      g2.push(r(xr - 2, yE - 4, xe - xr + 6, 4.5, C.gold), r(xe - 1, yE - 7, 4, 7, C.gold));
      out.push('<g' + (o.pop === 'upper' ? ' class="rvh-pop"' : '') + '>' + g2.join('') + '</g>');
    }

    /* Loft dormer */
    if (loft) {
      var g3 = [], xd0 = xm + 0.35 * S, xd1 = xr - 0.15 * S, yT = yR + 0.35 * S;
      g3.push(r(xd0, yT, xd1 - xd0, yE - yT, 'url(#' + p + 'new)'));
      g3.push('<ellipse cx="' + ((xd0 + xd1) / 2) + '" cy="' + (yE - 0.8 * S) + '" rx="' + ((xd1 - xd0) * 0.6) + '" ry="' + (0.9 * S) + '" fill="url(#' + p + 'glow)" opacity=".6"/>');
      g3.push('<path d="M' + (xd0 + 0.5 * S) + ' ' + yE + ' v-' + (0.9 * S) + ' h3 v' + (0.42 * S) + ' h' + Math.min(1.9 * S, xd1 - xd0 - 1.4 * S) + ' v' + (0.48 * S) + 'Z" fill="none" stroke="' + C.line + '" stroke-width="1.6"/>');
      g3.push(r(xd1 - 3, yT + 0.45 * S, 4, yE - yT - 0.75 * S, 'url(#' + p + 'gl)'), r(xd1 - 3, yT, 4, 0.45 * S, C.gold), r(xd1 - 3, yE - 0.3 * S, 4, 0.3 * S, C.gold));
      g3.push(r(xd0 - 3, yT - 4, xd1 - xd0 + 7, 4.5, C.gold), r(xd0 - 3, yT - 4, 3.5, yE - yT + 4, C.gold, 'opacity=".5"'));
      g3.push(stairs(x0 + 5.4 * S, yF - 1, x0 + 7.4 * S, yE + 2, C.line, 1.4));
      g3.push('<ellipse cx="' + (xd1 + 1.4 * S) + '" cy="' + (yE + 0.6 * S) + '" rx="' + (1.6 * S) + '" ry="5" fill="url(#' + p + 'glow)" opacity=".6"/>');
      out.push('<g' + (o.pop === 'loft' ? ' class="rvh-pop"' : '') + '>' + g3.join('') + '</g>');
    }

    /* Build site extras: fence, skip and the crew */
    if (b && !b.complete) {
      var fx0 = xe + 0.9 * S;
      for (var k = 0; k < 2; k++) {
        var px0 = fx0 + k * 1.5 * S;
        out.push('<rect x="' + px0 + '" y="' + (G - 1.9 * S) + '" width="' + (1.4 * S) + '" height="' + (1.9 * S) + '" fill="none" stroke="#6B665F" stroke-width="1.2"/>');
        for (var m = 1; m < 5; m++) out.push('<line x1="' + (px0 + m * 0.28 * S) + '" y1="' + (G - 1.9 * S) + '" x2="' + (px0 + m * 0.28 * S) + '" y2="' + G + '" stroke="#6B665F" stroke-width=".5"/>');
        out.push(r(px0 - 2, G - 2, 6, 3, '#6B665F'));
      }
      var kx = Math.min(xe + 3.6 * S, 300);
      out.push('<path d="M' + kx + ' ' + (G - 1.1 * S) + ' L' + (kx + 3.2 * S) + ' ' + (G - 1.1 * S) + ' L' + (kx + 2.8 * S) + ' ' + G + ' L' + (kx + 0.4 * S) + ' ' + G + 'Z" fill="' + C.goldDeep + '"/>' +
        r(kx, G - 1.1 * S, 3.2 * S, 2.5, C.gold) + '<path d="M' + (kx + 0.5 * S) + ' ' + (G - 1.1 * S) + ' q6 -9 13 -2 q5 -8 12 0 q6 -6 9 2Z" fill="#5A544C"/>');
      var spots = [[xr + 1 * S, G, xe + 2 * S, G], [xr + 2 * S, G, xe + 2.6 * S, G], [xe - 0.6 * S, G, xr + 2 * S, G], [xr + 1.6 * S, yX - 4, xe - 1 * S, yX - 4],
        [xe + 0.7 * S, G, xr + 2.8 * S, G], [xr + 1.4 * S, G, xr + 3.4 * S, G], [xr + 1.2 * S, G, xe - 1.2 * S, G], [xr + 3.4 * S, G, xe - 0.9 * S, G], [xr + 2 * S, G, xe - 1 * S, G], [xe + 1 * S, G, xe + 2 * S, G]];
      var sp = spots[Math.min(b.stage, spots.length - 1)];
      out.push(worker(sp[0], sp[1], 0), worker(sp[2], sp[3], 1));
    }

    /* Hotspots for the interactive tool */
    if (o.interactive) {
      var hy = G - 1.5 * S, hx = d > 0 ? xe : xr + 6;
      if (d === 0 && o.hints && o.hints.ext) {
        out.push('<rect x="' + xr + '" y="' + yX + '" width="' + (3 * S) + '" height="' + (G - yX) + '" fill="rgba(212,172,90,.08)" stroke="' + C.gold + '" stroke-width="1.4" stroke-dasharray="5 4" rx="2" data-h="ext"/>');
        out.push('<text x="' + (xr + 1.5 * S) + '" y="' + (yX - 8) + '" text-anchor="middle" fill="' + C.goldHi + '" font-size="11" font-weight="700" font-family="inherit">Drag to extend</text>');
      }
      out.push('<g data-h="ext" style="cursor:ew-resize">' +
        (d === 0 ? '<circle cx="' + hx + '" cy="' + hy + '" r="12" fill="none" stroke="' + C.gold + '" stroke-width="2" class="rvh-pulse"/>' : '') +
        '<circle cx="' + hx + '" cy="' + hy + '" r="26" fill="transparent"/>' +
        '<circle cx="' + hx + '" cy="' + hy + '" r="12.5" fill="' + C.gold + '" stroke="#1D1D1E" stroke-width="2"/>' +
        '<path d="M' + (hx - 6) + ' ' + hy + ' l3.5 -3.5 M' + (hx - 6) + ' ' + hy + ' l3.5 3.5 M' + (hx - 6) + ' ' + hy + ' H' + (hx + 6) + ' M' + (hx + 6) + ' ' + hy + ' l-3.5 -3.5 M' + (hx + 6) + ' ' + hy + ' l-3.5 3.5" stroke="#1D1D1E" stroke-width="1.9" stroke-linecap="round" fill="none"/></g>');
      var lx = loft ? (xm + 0.35 * S + xr - 0.15 * S) / 2 : xm + (eR - xm) * 0.42;
      var ly = loft ? yR + 0.35 * S - 4 : slopeY(lx, eR, yE, xm, yR) - 2;
      out.push(hotspot(lx, ly, 'loft', loft, o.hints && o.hints.loft && !loft ? 'Add a loft' : ''));
      if (d >= 2) {
        var ux = (xr + xe) / 2, uy = upper ? yE - 4 : yX - 4;
        out.push(hotspot(ux, uy - 12, 'upper', upper, o.hints && o.hints.upper && !upper ? 'Add a floor' : ''));
      }
    }

    return '<svg viewBox="0 ' + VY + ' ' + VW + ' ' + VHH + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + (o.label || 'Side view of the house') + '">' +
      css + '<defs>' + defs.join('') + '</defs>' + out.join('') + '</svg>';

    /* helpers */
    function housePath() {
      return 'M' + x0 + ' ' + G + ' V' + yE + ' H' + (x0 - 0.5 * S) + ' L' + xm + ' ' + yR + ' L' + (xr + 0.5 * S) + ' ' + yE + ' H' + xr + ' V' + G + 'Z';
    }
    function furn(dp) { return '<path d="' + dp + '" fill="' + C.furn + '"/>'; }
    function chair(x, y, dir) {
      return '<path d="M' + x + ' ' + y + ' v-' + (0.45 * S) + ' h' + (dir * 0.35 * S) + ' M' + x + ' ' + (y - 0.45 * S) + ' v-' + (0.5 * S) + ' M' + (x + dir * 0.35 * S) + ' ' + (y - 0.45 * S) + ' V' + y + '" stroke="' + C.line + '" stroke-width="1.4" fill="none"/>';
    }
    function plant(x, y) {
      return '<path d="M' + (x - 2.5) + ' ' + y + ' h5 l-1 -5 h-3z" fill="' + C.line + '"/><path d="M' + x + ' ' + (y - 5) + ' q-5 -6 -3 -10 M' + x + ' ' + (y - 5) + ' q4 -7 1 -11 M' + x + ' ' + (y - 5) + ' q6 -3 6 -8" stroke="#8FB07E" stroke-width="1.2" fill="none"/>';
    }
    function hotspot(x, y, key, on, label) {
      return '<g data-h="' + key + '" style="cursor:pointer"><circle cx="' + x + '" cy="' + y + '" r="24" fill="transparent"/>' +
        (on ? '' : '<circle cx="' + x + '" cy="' + y + '" r="11" fill="none" stroke="' + C.gold + '" stroke-width="2" class="rvh-pulse"/>') +
        '<circle cx="' + x + '" cy="' + y + '" r="11" fill="' + (on ? '#1D1D1E' : C.gold) + '" stroke="' + (on ? C.gold : '#1D1D1E') + '" stroke-width="2"/>' +
        '<path d="M' + (x - 5) + ' ' + y + ' H' + (x + 5) + (on ? '' : ' M' + x + ' ' + (y - 5) + ' V' + (y + 5)) + '" stroke="' + (on ? C.gold : '#1D1D1E') + '" stroke-width="2.2" stroke-linecap="round"/>' +
        (label ? '<text x="' + (x + 16) + '" y="' + (y + 4) + '" fill="' + C.goldHi + '" font-size="11" font-weight="700" font-family="inherit">' + label + '</text>' : '') + '</g>';
    }
  }

  function r(x, y, w, h, fill, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + Math.max(0, w) + '" height="' + Math.max(0, h) + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  }
  function slopeY(x, xa, ya, xb, yb) { return ya + (x - xa) * (yb - ya) / (xb - xa); }
  function stairs(xa, ya, xb, yb, col, w) {
    var n = 9, s = '<path d="M' + xa + ' ' + ya;
    for (var i = 1; i <= n; i++) {
      var y = ya + (yb - ya) * i / n, x = xa + (xb - xa) * i / n;
      s += ' V' + y + ' H' + x;
    }
    return s + '" fill="none" stroke="' + col + '" stroke-width="' + w + '"/>';
  }
  function courses(x, y, w, h) {
    var s = '';
    for (var yy = y + 6; yy < y + h; yy += 6) s += r(x, yy, w, 0.6, '#5E5850');
    return s;
  }
  function worker(x, y, n) {
    var c = '#E8C35A';
    return '<g class="rvh-bob" style="animation-delay:' + (n * 0.5) + 's">' +
      '<path d="M' + (x - 2.5) + ' ' + y + ' l1.6 -9 M' + (x + 2.5) + ' ' + y + ' l-1.6 -9" stroke="#2F2F33" stroke-width="2.4" stroke-linecap="round"/>' +
      '<rect x="' + (x - 3.6) + '" y="' + (y - 19) + '" width="7.2" height="10.5" rx="2" fill="' + c + '"/>' +
      '<path d="M' + (x + 3) + ' ' + (y - 17) + ' l' + (n ? -5 : 5) + ' 4" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<circle cx="' + x + '" cy="' + (y - 22.5) + '" r="3.3" fill="#D9B79A"/>' +
      '<path d="M' + (x - 4.4) + ' ' + (y - 23) + ' a4.4 4.4 0 0 1 8.8 0z" fill="#FFFFFF"/></g>';
  }

  window.RVHouse = { svg: svg, TYPES: TYPES };
})();
