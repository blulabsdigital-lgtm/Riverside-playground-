/* Riverside kitchen illustrations.
   KitchenArt.svg(spec) draws a kitchen from a short spec: door style, colours, worktop, splashback,
   cooker, island, lights and floor. Used for the swipe cards and for the "your kitchen" design.
   When Alex's own kitchen photos are added, a card's `photo` is shown instead of the drawing. */
(function () {
  'use strict';
  var uid = 0;

  /* Colour helpers */
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) { return '#' + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function shade(h, amt) {
    var c = rgb(h);
    return amt < 0 ? hex(c[0] * (1 + amt), c[1] * (1 + amt), c[2] * (1 + amt))
      : hex(c[0] + (255 - c[0]) * amt, c[1] + (255 - c[1]) * amt, c[2] + (255 - c[2]) * amt);
  }
  function lum(h) { var c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function rand(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 2147483647; return h; }

  var METALS = {
    brass: { base: '#C49A4E', hi: '#F0D79B', lo: '#8A6A2E', name: 'Brushed brass' },
    black: { base: '#1C1C1D', hi: '#55555A', lo: '#000000', name: 'Matt black' },
    chrome: { base: '#C4C9CD', hi: '#FFFFFF', lo: '#7A8186', name: 'Polished chrome' }
  };
  var TOPS = {
    marble: { colour: '#EFEDE9', vein: '#A9A39A', name: 'Marble-effect quartz' },
    quartz: { colour: '#F1EFEA', name: 'White quartz' },
    oak: { colour: '#C08F5E', grain: '#94683E', name: 'Solid oak' },
    concrete: { colour: '#9B9893', speck: '#7B7975', name: 'Concrete-effect' },
    nero: { colour: '#26262A', vein: '#9A968F', name: 'Nero marble-effect' },
    terrazzo: { colour: '#E8E0D4', speck: '#B4876A', name: 'Pale terrazzo' }
  };
  var FLOORS = {
    oak: { colour: '#C79C6C', name: 'Oak boards' },
    herringbone: { colour: '#B98A5C', name: 'Oak herringbone' },
    darkwood: { colour: '#5E4331', name: 'Smoked oak boards' },
    tiles: { colour: '#D3CFC8', name: 'Large-format porcelain' },
    checker: { colour: '#EDE9E1', name: 'Black and white chequer' },
    concrete: { colour: '#8F8C87', name: 'Polished concrete-effect' }
  };

  function svg(spec, opts) {
    opts = opts || {};
    var p = 'ka' + (++uid);
    var R = rand(hash(spec.id || p));
    var d = [], defs = [];
    var unit = spec.unit, upperCol = spec.upperColour || spec.unit;
    var metal = METALS[spec.handles] || null;
    var top = TOPS[spec.top];
    var hasWindow = !!spec.window;
    var upper = spec.upper || 'none';
    var hood = spec.hood || 'none';

    /* Definitions */
    defs.push(
      '<radialGradient id="' + p + 'wl" cx="50%" cy="10%" r="80%"><stop offset="0" stop-color="#FFF8EC" stop-opacity=".28"/><stop offset="1" stop-color="#FFF8EC" stop-opacity="0"/></radialGradient>',
      '<linearGradient id="' + p + 'cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>',
      '<linearGradient id="' + p + 'fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".55" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#FFF" stop-opacity=".06"/></linearGradient>',
      '<radialGradient id="' + p + 'vg" cx="50%" cy="45%" r="75%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>',
      '<radialGradient id="' + p + 'gl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE3A8" stop-opacity=".55"/><stop offset="1" stop-color="#FFE3A8" stop-opacity="0"/></radialGradient>',
      '<radialGradient id="' + p + 'gb" cx="40%" cy="38%" r="65%"><stop offset="0" stop-color="#FFFDF4"/><stop offset=".55" stop-color="#FFE7B5"/><stop offset="1" stop-color="#D9AE62"/></radialGradient>',
      '<linearGradient id="' + p + 'led" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1D2" stop-opacity=".55"/><stop offset="1" stop-color="#FFF1D2" stop-opacity="0"/></linearGradient>',
      '<linearGradient id="' + p + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9D9E2"/><stop offset="1" stop-color="#F3EFE6"/></linearGradient>',
      '<radialGradient id="' + p + 'sh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>',
      '<linearGradient id="' + p + 'dr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF" stop-opacity=".07"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient>'
    );

    /* 1. Wall */
    d.push(rect(0, 0, 400, 318, spec.wall));
    if (spec.wallType === 'brick') {
      defs.push('<pattern id="' + p + 'br" width="32" height="24" patternUnits="userSpaceOnUse">' +
        '<rect width="32" height="24" fill="#CDBFAF"/>' +
        '<rect x="1" y="1" width="30" height="10" fill="' + spec.wall + '"/><rect x="-15" y="13" width="30" height="10" fill="' + shade(spec.wall, -0.08) + '"/>' +
        '<rect x="17" y="13" width="30" height="10" fill="' + shade(spec.wall, 0.06) + '"/></pattern>');
      d.push(rect(0, 0, 400, 318, 'url(#' + p + 'br)'));
      for (var b = 0; b < 26; b++) d.push(rect(Math.floor(R() * 12) * 32 + (R() > 0.5 ? 16 : 0), Math.floor(R() * 13) * 12 + 1, 30, 10, shade(spec.wall, (R() - 0.5) * 0.3), 'opacity=".6"'));
    }
    if (spec.wallType === 'concrete') {
      for (var c2 = 0; c2 < 18; c2++) d.push('<ellipse cx="' + (R() * 400) + '" cy="' + (R() * 300) + '" rx="' + (20 + R() * 50) + '" ry="' + (10 + R() * 30) + '" fill="' + shade(spec.wall, (R() - 0.5) * 0.18) + '" opacity=".35"/>');
    }
    d.push(rect(0, 0, 400, 318, 'url(#' + p + 'wl)'));
    d.push(rect(0, 0, 400, 26, 'url(#' + p + 'cs)'));
    [100, 200, 300].forEach(function (x) {
      d.push('<ellipse cx="' + x + '" cy="2" rx="9" ry="2.6" fill="#FFF6E0"/><ellipse cx="' + x + '" cy="40" rx="46" ry="44" fill="url(#' + p + 'gl)" opacity=".7"/>');
    });

    /* 2. Splashback, from the worktop up to the wall units */
    var sy0 = 146, sy1 = 216;
    if (spec.splash === 'metro') {
      defs.push('<pattern id="' + p + 'mt" width="26" height="22" patternUnits="userSpaceOnUse">' +
        '<rect width="26" height="22" fill="' + (spec.grout || '#D6D1C8') + '"/>' +
        '<rect x="1" y="1" width="24" height="9.6" rx="1.5" fill="' + spec.splashColour + '"/><rect x="-12" y="12" width="24" height="9.6" rx="1.5" fill="' + spec.splashColour + '"/>' +
        '<rect x="14" y="12" width="24" height="9.6" rx="1.5" fill="' + spec.splashColour + '"/>' +
        '<rect x="2" y="1.6" width="22" height="2" rx="1" fill="#FFF" opacity=".45"/></pattern>');
      d.push(rect(0, sy0, 400, sy1 - sy0, 'url(#' + p + 'mt)'));
    } else if (spec.splash === 'zellige') {
      var t = 13;
      d.push(rect(0, sy0, 400, sy1 - sy0, shade(spec.splashColour, -0.18)));
      for (var zy = sy0; zy < sy1; zy += t) for (var zx = 0; zx < 400; zx += t) {
        d.push(rect(zx + 0.6, zy + 0.6, t - 1.2, Math.min(t - 1.2, sy1 - zy - 0.6), shade(spec.splashColour, (R() - 0.5) * 0.16), 'rx="1.2"'));
        if (R() > 0.55) d.push(rect(zx + 2, zy + 2, 4 + R() * 4, 1.6, '#FFF', 'opacity=".5" rx=".8"'));
      }
    } else if (spec.splash === 'marble') {
      d.push(rect(0, sy0, 400, sy1 - sy0, spec.splashColour || TOPS.marble.colour));
      d.push(veins(R, 0, sy0, 400, sy1 - sy0, TOPS.marble.vein, 5));
    } else {
      d.push(rect(0, sy0, 400, sy1 - sy0, spec.splashColour || shade(spec.wall, 0.06)));
      d.push(rect(0, sy0, 400, sy1 - sy0, '#FFF', 'opacity=".05"'));
    }

    /* 3. Window */
    if (hasWindow) {
      defs.push('<clipPath id="' + p + 'wc"><rect x="30" y="44" width="96" height="90"/></clipPath>');
      d.push('<polygon points="30,134 126,134 150,216 10,216" fill="#FFF" opacity=".07"/>');
      d.push(rect(24, 38, 108, 102, spec.window === 'crittall' ? '#1A1A1A' : '#F6F4EF'));
      d.push(rect(30, 44, 96, 90, 'url(#' + p + 'sky)'));
      d.push('<g clip-path="url(#' + p + 'wc)">' +
        '<circle cx="44" cy="132" r="26" fill="#8EA484"/><circle cx="78" cy="138" r="24" fill="#7D9675"/><circle cx="116" cy="128" r="28" fill="#93A98A"/>' +
        '<circle cx="64" cy="118" r="16" fill="#A3B79A" opacity=".8"/><rect x="30" y="44" width="96" height="90" fill="#FFF" opacity=".12"/></g>');
      if (spec.window === 'crittall') {
        d.push(rect(77, 44, 2.4, 90, '#1A1A1A'), rect(30, 73, 96, 2.4, '#1A1A1A'), rect(30, 103, 96, 2.4, '#1A1A1A'));
      } else {
        d.push(rect(75, 44, 6, 90, '#F6F4EF'), rect(30, 86, 96, 5, '#F6F4EF'));
      }
      d.push(rect(18, 138, 120, 7, shade(spec.wall, -0.12), 'rx="1"'));
    }

    /* 4. Upper: wall units, shelves and hood */
    var zones = [];
    if (hood === 'none') {
      if (upper === 'units') zones.push(hasWindow ? [146, 400] : [0, 400]);
      else if (upper === 'shelves') zones.push(hasWindow ? [254, 400] : [0, 146], hasWindow ? null : [254, 400]);
    } else {
      if (!hasWindow) zones.push([0, 146]);
      zones.push([254, 400]);
    }
    zones.forEach(function (z) {
      if (!z) return;
      if (upper === 'units') d.push(wallUnits(z[0], z[1]));
      if (upper === 'shelves') d.push(shelves(z[0], z[1]));
    });
    if (hood === 'canopy') {
      var hc = spec.hoodColour || unit;
      d.push('<path d="M178 30 L222 30 L254 112 L146 112 Z" fill="' + hc + '"/>',
        '<path d="M178 30 L222 30 L254 112 L146 112 Z" fill="url(#' + p + 'dr)"/>',
        rect(140, 112, 120, 18, shade(hc, -0.08), 'rx="1.5"'), rect(140, 112, 120, 2, '#FFF', 'opacity=".25"'),
        rect(178, 0, 44, 30, shade(hc, -0.04)));
    } else if (hood === 'chimney') {
      var hm = METALS[spec.hoodMetal || 'black'];
      d.push(rect(186, 0, 28, 96, hm.base), rect(188, 0, 4, 96, hm.hi, 'opacity=".35"'),
        '<path d="M160 96 L240 96 L254 122 L146 122 Z" fill="' + hm.base + '"/>',
        '<path d="M160 96 L240 96 L243 102 L157 102 Z" fill="' + hm.hi + '" opacity=".35"/>');
    }

    /* 5. Base run */
    var by0 = 232, by1 = 302;
    d.push(rect(0, by0, 400, by1 - by0, shade(unit, -0.45)));
    var cooker = spec.cooker || 'hob';
    // Left pair under the sink
    d.push(door(1, by0 + 1, 71, by1 - by0 - 2, unit, spec.doors, 'doorR'));
    d.push(door(74, by0 + 1, 71, by1 - by0 - 2, unit, spec.doors, 'doorL'));
    // Right: drawer stack and a door
    d.push(door(256, by0 + 1, 70, 21, unit, spec.doors, 'drawer'));
    d.push(door(256, by0 + 24, 70, 21, unit, spec.doors, 'drawer'));
    d.push(door(256, by0 + 47, 70, by1 - by0 - 48, unit, spec.doors, 'drawer'));
    d.push(door(328, by0 + 1, 71, by1 - by0 - 2, unit, spec.doors, 'doorL'));
    // Centre: cooker
    if (cooker === 'range') {
      var rc = spec.rangeColour || '#1E1E1F';
      d.push(rect(148, 212, 104, 100, rc, 'rx="2"'), rect(148, 212, 104, 100, 'url(#' + p + 'dr)'),
        rect(150, 206, 100, 8, shade(rc, -0.35), 'rx="1.5"'));
      [166, 190, 210, 234].forEach(function (x) { d.push('<ellipse cx="' + x + '" cy="206" rx="8" ry="2.2" fill="#111"/>'); });
      for (var k = 0; k < 6; k++) d.push('<circle cx="' + (160 + k * 16) + '" cy="224" r="3.2" fill="#D9DCDF"/>');
      [[152, 198], [202, 248]].forEach(function (o) {
        d.push(rect(o[0], 234, o[1] - o[0], 64, shade(rc, -0.06), 'rx="2"'),
          rect(o[0] + 7, 252, o[1] - o[0] - 14, 34, '#151515', 'rx="2"'),
          rect(o[0] + 9, 254, 10, 30, '#FFF', 'opacity=".08"'),
          rect(o[0] + 5, 240, o[1] - o[0] - 10, 3.4, '#D9DCDF', 'rx="1.7"'));
      });
      d.push(rect(148, 302, 104, 10, '#111'));
    } else {
      d.push(rect(147, by0 + 1, 106, 21, unit), rect(147, by0 + 1, 106, 21, 'url(#' + p + 'dr)'));
      d.push(rect(149, 256, 102, 45, '#151516', 'rx="1.5"'), rect(152, 266, 96, 32, '#0C0C0D', 'rx="1"'),
        rect(156, 259, 88, 3, '#BFC4C8', 'rx="1.5"'), rect(154, 268, 20, 28, '#FFF', 'opacity=".05"'));
    }
    d.push(rect(0, by1, 400, 10, shade(unit, -0.55)));

    /* 6. Worktop */
    d.push(worktop(0, 216, 400, top, true));
    if (cooker === 'hob') d.push(rect(160, 216.5, 80, 4, '#141416', 'rx="1"'), rect(166, 217, 22, 1.2, '#FFF', 'opacity=".2"'));

    /* 7. Sink and tap */
    var tapMetal = metal || METALS.chrome;
    if (spec.sink === 'belfast') {
      d.push(rect(36, 220, 76, 42, '#F5F3EE', 'rx="3"'), rect(36, 220, 76, 4, '#FFF'), rect(36, 256, 76, 6, '#000', 'opacity=".08" rx="2"'));
    } else {
      d.push('<ellipse cx="74" cy="218.5" rx="24" ry="2" fill="#000" opacity=".25"/>');
    }
    d.push('<path d="M74 217 V182 Q74 170 86 170 Q98 170 98 182 V188" fill="none" stroke="' + tapMetal.base + '" stroke-width="4" stroke-linecap="round"/>',
      '<path d="M73 210 V182 Q73 172 84 171" fill="none" stroke="' + tapMetal.hi + '" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>',
      rect(62, 204, 10, 3, tapMetal.base, 'rx="1.5"'));

    /* 8. Worktop decor */
    (spec.decor || []).forEach(function (item) { d.push(decor(item)); });

    /* 9. Floor */
    d.push(floor());

    /* 10. Island and stools */
    if (spec.island) d.push(island(spec.island));
    else if (spec.rug) d.push('<polygon points="120,340 280,340 318,470 82,470" fill="' + spec.rug + '"/><polygon points="128,346 272,346 306,462 94,462" fill="none" stroke="' + shade(spec.rug, 0.25) + '" stroke-width="2"/>');

    /* 11. Pendants */
    if (spec.island && spec.pendants && spec.pendants !== 'none') d.push(pendants(spec.pendants, METALS[spec.pendantMetal || 'brass']));

    /* 12. Light and vignette */
    d.push(rect(0, 0, 400, 500, 'url(#' + p + 'vg)'));

    var label = opts.label ? ' role="img" aria-label="' + opts.label.replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"';
    return '<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"' + label + '><defs>' + defs.join('') + '</defs>' + d.join('') + '</svg>';

    /* ---- pieces ---- */
    function rect(x, y, w, h, fill, extra) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>'; }

    function door(x, y, w, h, col, style, kind) {
      var s = rect(x, y, w, h, col) + rect(x, y, w, h, 'url(#' + p + 'dr)');
      if (style === 'shaker') {
        var f = Math.min(7, h / 4);
        s += rect(x + f, y + f, w - 2 * f, h - 2 * f, shade(col, -0.07)) +
          '<path d="M' + (x + f) + ' ' + (y + h - f) + ' V' + (y + f) + ' H' + (x + w - f) + '" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.4"/>' +
          '<path d="M' + (x + f) + ' ' + (y + h - f) + ' H' + (x + w - f) + ' V' + (y + f) + '" fill="none" stroke="#FFF" stroke-opacity=".28" stroke-width="1.2"/>';
      } else if (style === 'fluted') {
        for (var fx = x + 3; fx < x + w - 2; fx += 5) s += rect(fx, y + 1, 1.3, h - 2, '#000', 'opacity=".16"') + rect(fx + 1.6, y + 1, 1, h - 2, '#FFF', 'opacity=".14"');
      } else {
        s += rect(x, y, w, 1.2, '#FFF', 'opacity=".22"');
      }
      s += handle(x, y, w, h, kind);
      return s;
    }

    function handle(x, y, w, h, kind) {
      if (kind === 'none' || kind === 'island') return '';
      if (!metal) {
        // Handleless: a shadowed J-pull groove along the top edge
        return rect(x, y, w, 4, '#000', 'opacity=".38"') + rect(x, y + 4, w, 1, '#FFF', 'opacity=".12"');
      }
      var shape = spec.handleShape || 'bar';
      var m = metal, s = '';
      if (kind === 'drawer') {
        var cx = x + w / 2, cy = y + Math.min(9, h / 2);
        if (shape === 'knob') s += '<circle cx="' + cx + '" cy="' + cy + '" r="3.4" fill="' + m.base + '"/><circle cx="' + (cx - 1) + '" cy="' + (cy - 1) + '" r="1.2" fill="' + m.hi + '" opacity=".8"/>';
        else if (shape === 'cup') s += '<path d="M' + (cx - 11) + ' ' + (cy - 2) + ' Q' + cx + ' ' + (cy + 7) + ' ' + (cx + 11) + ' ' + (cy - 2) + ' Z" fill="' + m.base + '"/><path d="M' + (cx - 9) + ' ' + (cy - 1.4) + ' H' + (cx + 9) + '" stroke="' + m.hi + '" stroke-width="1" opacity=".7"/>';
        else s += rect(cx - 13, cy - 1.8, 26, 3.6, m.base, 'rx="1.8"') + rect(cx - 12, cy - 1.6, 24, 1.1, m.hi, 'opacity=".7" rx=".5"');
      } else {
        var hx = kind === 'doorR' ? x + w - 9 : x + 9, hy = y + 10;
        if (shape === 'bar') s += rect(hx - 1.8, hy, 3.6, 22, m.base, 'rx="1.8"') + rect(hx - 1.2, hy + 1, 1, 20, m.hi, 'opacity=".7"');
        else s += '<circle cx="' + hx + '" cy="' + (hy + 4) + '" r="3.4" fill="' + m.base + '"/><circle cx="' + (hx - 1) + '" cy="' + (hy + 3) + '" r="1.2" fill="' + m.hi + '" opacity=".8"/>';
      }
      return s;
    }

    function wallUnits(x0, x1) {
      var y0 = 34, y1 = 140, s = rect(x0, y0, x1 - x0, y1 - y0, shade(upperCol, -0.45));
      var n = Math.max(1, Math.round((x1 - x0) / 52)), w = (x1 - x0) / n;
      for (var i = 0; i < n; i++) {
        var dx = x0 + i * w + 1;
        var st = spec.doors === 'fluted' ? 'slab' : spec.doors;
        s += rect(dx, y0 + 1, w - 2, y1 - y0 - 2, upperCol) + rect(dx, y0 + 1, w - 2, y1 - y0 - 2, 'url(#' + p + 'dr)');
        if (st === 'shaker') s += door(dx, y0 + 1, w - 2, y1 - y0 - 2, upperCol, 'shaker', 'none');
        if (metal) {
          var hx = i % 2 === 0 ? dx + w - 11 : dx + 9;
          s += spec.handleShape === 'bar' ? rect(hx - 1.8, y1 - 30, 3.6, 20, metal.base, 'rx="1.8"') :
            '<circle cx="' + hx + '" cy="' + (y1 - 14) + '" r="3.2" fill="' + metal.base + '"/>';
        } else {
          s += rect(dx, y1 - 5, w - 2, 4, '#000', 'opacity=".3"');
        }
      }
      s += rect(x0, y1, x1 - x0, 3, '#000', 'opacity=".25"');
      if (spec.led) s += rect(x0, y1 + 3, x1 - x0, 46, 'url(#' + p + 'led)');
      return s;
    }

    function shelves(x0, x1) {
      var s = '', col = spec.shelf || '#B9895A';
      [74, 126].forEach(function (y, row) {
        if (spec.shelfBrackets) {
          s += rect(x0 + 16, y - 2, 3, 14, '#1A1A1A') + rect(x1 - 19, y - 2, 3, 14, '#1A1A1A');
        }
        s += rect(x0 + 8, y, x1 - x0 - 16, 6, col) + rect(x0 + 8, y, x1 - x0 - 16, 1.4, '#FFF', 'opacity=".3"') +
          rect(x0 + 8, y + 6, x1 - x0 - 16, 8, '#000', 'opacity=".12"');
        var x = x0 + 18;
        if (row === 0) {
          [0, 1, 2].forEach(function (i) { s += '<ellipse cx="' + (x + 8 + i * 9) + '" cy="' + (y - 12) + '" rx="3.5" ry="12" fill="' + (i === 1 ? '#E9E3D8' : '#F4F1EA') + '" stroke="#000" stroke-opacity=".1"/>'; });
          s += rect(x + 46, y - 22, 16, 22, '#EDE6DA', 'rx="3"') + rect(x + 46, y - 25, 16, 4, '#9C7B55', 'rx="1.5"');
          s += rect(x + 70, y - 16, 12, 16, shade(spec.wall, -0.25), 'rx="2"');
          if (x1 - x0 > 130) s += rect(x + 92, y - 26, 6, 26, '#3E5A4B') + rect(x + 99, y - 22, 5, 22, '#B4875B') + rect(x + 105, y - 24, 5, 24, '#2F3B4E');
        } else {
          s += '<path d="M' + (x + 4) + ' ' + (y - 14) + ' Q' + (x + 16) + ' ' + (y + 2) + ' ' + (x + 28) + ' ' + (y - 14) + ' Z" fill="#E8E1D4"/>';
          s += plant(x + 52, y, 0.8);
          s += rect(x + 72, y - 18, 14, 18, '#F2EEE6', 'rx="3"') + rect(x + 90, y - 13, 12, 13, '#C6B59A', 'rx="2"');
        }
      });
      return s;
    }

    function plant(cx, base, sc) {
      sc = sc || 1;
      var s = '<path d="M' + (cx - 8 * sc) + ' ' + (base - 16 * sc) + ' H' + (cx + 8 * sc) + ' L' + (cx + 6 * sc) + ' ' + base + ' H' + (cx - 6 * sc) + ' Z" fill="#B9775A"/>';
      var leaves = [[-9, -30, -30], [0, -36, 0], [9, -30, 30], [-14, -22, -55], [14, -22, 55]];
      leaves.forEach(function (l, i) {
        s += '<ellipse cx="' + (cx + l[0] * sc) + '" cy="' + (base - 16 * sc + l[1] * sc * 0.55) + '" rx="' + (4.2 * sc) + '" ry="' + (11 * sc) + '" fill="' + (i % 2 ? '#56744C' : '#6F8E5F') + '" transform="rotate(' + l[2] + ' ' + (cx + l[0] * sc) + ' ' + (base - 16 * sc + l[1] * sc * 0.55) + ')"/>';
      });
      return s;
    }

    function decor(item) {
      if (item === 'plant') return plant(126, 216, 1);
      if (item === 'board') return rect(300, 160, 34, 56, '#B98A57', 'rx="10"') + rect(300, 160, 34, 56, '#000', 'opacity=".06" rx="10"') + '<circle cx="317" cy="170" r="3" fill="' + shade(spec.splashColour || spec.wall, -0.2) + '"/>' + rect(338, 176, 26, 40, '#9E7650', 'rx="8"');
      if (item === 'vase') return '<path d="M120 216 Q112 200 118 188 H132 Q138 200 130 216 Z" fill="#E9E2D6"/><path d="M125 188 Q118 160 108 150 M125 188 Q128 158 138 146 M125 188 Q132 168 146 160" stroke="#6E6A52" stroke-width="1.4" fill="none"/>' +
        '<circle cx="108" cy="150" r="4" fill="#EBDDC3"/><circle cx="138" cy="146" r="4" fill="#E3CFA8"/><circle cx="146" cy="160" r="3.5" fill="#EBDDC3"/>';
      if (item === 'jars') return rect(298, 194, 16, 22, '#F1ECE3', 'rx="3"') + rect(316, 200, 14, 16, '#F1ECE3', 'rx="3"') + rect(298, 190, 16, 5, '#A07A50', 'rx="2"') + rect(316, 196, 14, 5, '#A07A50', 'rx="2"');
      if (item === 'bowl') return '';
      return '';
    }

    function worktop(x, y, w, t, withTop) {
      var s = '';
      if (withTop) s += rect(x, y, w, 6, shade(t.colour, lum(t.colour) > 0.5 ? 0.25 : 0.1)) + rect(x, y + 6, w, 10, t.colour) + rect(x, y + 6, w, 1.2, '#FFF', 'opacity=".35"') + rect(x, y + 16, w, 2, '#000', 'opacity=".3"');
      if (t.vein) s += veins(R, x, y + 6, w, 10, t.vein, 3);
      if (t.grain) for (var i = 0; i < 4; i++) s += rect(x, y + 8 + i * 2, w, 0.7, t.grain, 'opacity=".45"');
      if (t.speck) for (var j = 0; j < 70; j++) s += '<circle cx="' + (x + R() * w) + '" cy="' + (y + 7 + R() * 8) + '" r="' + (0.5 + R() * 0.9) + '" fill="' + t.speck + '" opacity=".7"/>';
      return s;
    }

    function veins(r, x, y, w, h, col, n) {
      var s = '';
      for (var i = 0; i < n; i++) {
        var y1 = y + r() * h, y2 = y + r() * h, xa = x + r() * w * 0.3, xb = x + w * (0.6 + r() * 0.4);
        s += '<path d="M' + xa + ' ' + y1 + ' C' + (xa + w * 0.2) + ' ' + (y1 - h * 0.6) + ' ' + (xb - w * 0.25) + ' ' + (y2 + h * 0.6) + ' ' + xb + ' ' + y2 + '" stroke="' + col + '" stroke-width="' + (0.6 + r() * 1.1) + '" fill="none" opacity=".55"/>';
      }
      return s;
    }

    function floor() {
      var f = FLOORS[spec.floor] || FLOORS.oak, col = spec.floorColour || f.colour, s = rect(0, 312, 400, 188, col);
      var vy = 40, k = function (y) { return (y - vy) / (500 - vy); };
      if (spec.floor === 'oak' || spec.floor === 'darkwood') {
        for (var xb = -400; xb <= 800; xb += 34) {
          var xt = 200 + (xb - 200) * k(312);
          s += '<line x1="' + xt + '" y1="312" x2="' + xb + '" y2="500" stroke="' + shade(col, -0.3) + '" stroke-width="1" opacity=".55"/>';
          for (var j = 0; j < 2; j++) {
            var yy = 312 + R() * 188, xa = 200 + (xb - 200) * k(yy), xn = 200 + (xb + 34 - 200) * k(yy);
            s += '<line x1="' + xa + '" y1="' + yy + '" x2="' + xn + '" y2="' + yy + '" stroke="' + shade(col, -0.3) + '" stroke-width=".8" opacity=".45"/>';
          }
        }
      } else if (spec.floor === 'herringbone') {
        defs.push('<pattern id="' + p + 'hb" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="scale(1 .55)">' +
          '<rect width="28" height="28" fill="' + col + '"/><path d="M0 14 L14 0 M14 28 L28 14 M-7 7 L7 -7 M21 35 L35 21" stroke="' + shade(col, -0.32) + '" stroke-width="1.2"/>' +
          '<path d="M14 0 L28 14 M0 14 L14 28" stroke="' + shade(col, -0.32) + '" stroke-width="1.2"/>' +
          '<path d="M7 7 L14 14 M21 21 L14 14" stroke="' + shade(col, 0.12) + '" stroke-width=".8" opacity=".6"/></pattern>');
        s += rect(0, 312, 400, 188, 'url(#' + p + 'hb)');
      } else if (spec.floor === 'tiles' || spec.floor === 'checker') {
        var rows = [312, 324, 340, 362, 392, 432, 486, 560];
        var cols = []; for (var c = -7; c <= 7; c++) cols.push(200 + c * 70);
        if (spec.floor === 'checker') {
          for (var ri = 0; ri < rows.length - 1; ri++) for (var ci = 0; ci < cols.length - 1; ci++) {
            if ((ri + ci) % 2) continue;
            var ya = rows[ri], yb = Math.min(500, rows[ri + 1]);
            var pts = [[cols[ci], ya], [cols[ci + 1], ya], [cols[ci + 1], yb], [cols[ci], yb]].map(function (q) { return (200 + (q[0] - 200) * k(q[1])) + ',' + q[1]; }).join(' ');
            s += '<polygon points="' + pts + '" fill="#26262A"/>';
          }
        } else {
          rows.forEach(function (y) { if (y < 500) s += '<line x1="0" y1="' + y + '" x2="400" y2="' + y + '" stroke="' + shade(col, -0.18) + '" stroke-width="1"/>'; });
          cols.forEach(function (xb2) { s += '<line x1="' + (200 + (xb2 - 200) * k(312)) + '" y1="312" x2="' + xb2 + '" y2="500" stroke="' + shade(col, -0.18) + '" stroke-width="1"/>'; });
        }
      } else if (spec.floor === 'concrete') {
        for (var m = 0; m < 14; m++) s += '<ellipse cx="' + (R() * 400) + '" cy="' + (320 + R() * 170) + '" rx="' + (30 + R() * 60) + '" ry="' + (6 + R() * 14) + '" fill="' + shade(col, (R() - 0.5) * 0.16) + '" opacity=".5"/>';
      }
      s += rect(0, 312, 400, 188, 'url(#' + p + 'fl)');
      s += rect(0, 312, 400, 6, '#000', 'opacity=".25"');
      return s;
    }

    function island(is) {
      var t2 = TOPS[is.top || spec.top], col = is.colour, s = '';
      s += '<ellipse cx="200" cy="474" rx="178" ry="14" fill="url(#' + p + 'sh)"/>';
      var x0 = is.waterfall ? 76 : 72, x1 = is.waterfall ? 324 : 328;
      s += rect(x0, 368, x1 - x0, 96, shade(col, -0.4));
      var n = 3, w = (x1 - x0) / n;
      for (var i = 0; i < n; i++) s += door(x0 + i * w + 1, 369, w - 2, 94, col, is.doors, 'island');
      s += rect(x0 + 6, 462, x1 - x0 - 12, 8, '#000', 'opacity=".55"');
      s += '<polygon points="80,344 320,344 336,356 64,356" fill="' + shade(t2.colour, lum(t2.colour) > 0.5 ? 0.3 : 0.12) + '"/>';
      s += rect(64, 356, 272, 12, t2.colour) + rect(64, 356, 272, 1.4, '#FFF', 'opacity=".4"') + rect(64, 368, 272, 2.5, '#000', 'opacity=".3"');
      if (t2.vein) s += veins(R, 64, 356, 272, 12, t2.vein, 3) + veins(R, 90, 344, 220, 12, t2.vein, 2);
      if (t2.grain) for (var g = 0; g < 4; g++) s += rect(64, 358 + g * 2.4, 272, 0.7, t2.grain, 'opacity=".45"');
      if (t2.speck) for (var j = 0; j < 60; j++) s += '<circle cx="' + (64 + R() * 272) + '" cy="' + (358 + R() * 9) + '" r="' + (0.5 + R() * 0.9) + '" fill="' + t2.speck + '" opacity=".7"/>';
      if (is.waterfall) {
        s += rect(64, 368, 12, 102, t2.colour) + rect(324, 368, 12, 102, shade(t2.colour, -0.08));
        if (t2.vein) s += veins(R, 64, 370, 12, 98, t2.vein, 2);
      }
      // Fruit bowl
      s += '<path d="M218 344 Q234 356 250 344 Z" fill="' + (METALS[spec.pendantMetal || 'brass'] || METALS.brass).base + '"/>' +
        '<circle cx="227" cy="340" r="5" fill="#E8C14A"/><circle cx="237" cy="338" r="5.4" fill="#F0CB55"/><circle cx="244" cy="342" r="4.4" fill="#DDB43E"/>';
      // Stools, seen from behind
      var sc = is.stools || 'oak';
      var sCol = sc === 'oak' ? '#B88857' : sc === 'brass' ? METALS.brass.base : '#1C1C1D';
      [138, 262].forEach(function (x) {
        s += '<path d="M' + (x - 16) + ' 428 L' + (x - 22) + ' 500 M' + (x + 16) + ' 428 L' + (x + 22) + ' 500" stroke="' + sCol + '" stroke-width="3.4" stroke-linecap="round"/>' +
          '<path d="M' + (x - 19) + ' 470 H' + (x + 19) + '" stroke="' + sCol + '" stroke-width="2.6"/>' +
          rect(x - 25, 418, 50, 11, sc === 'brass' ? '#2B2B2E' : sCol, 'rx="5"') + rect(x - 23, 418, 46, 2, '#FFF', 'opacity=".25" rx="1"') +
          rect(x - 22, 394, 3, 26, sCol, 'rx="1.5"') + rect(x + 19, 394, 3, 26, sCol, 'rx="1.5"') + rect(x - 22, 392, 44, 6, sCol, 'rx="3"');
      });
      return s;
    }

    function pendants(kind, m) {
      var s = '';
      var xs = kind === 'globe' ? [134, 200, 266] : kind === 'dome' ? [150, 250] : [];
      xs.forEach(function (x) {
        s += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + (kind === 'globe' ? 240 : 236) + '" stroke="#111" stroke-width="1.2"/>';
        if (kind === 'globe') {
          s += '<circle cx="' + x + '" cy="258" r="46" fill="url(#' + p + 'gl)"/>' + rect(x - 4, 238, 8, 6, m.base, 'rx="1.5"') +
            '<circle cx="' + x + '" cy="258" r="15" fill="url(#' + p + 'gb)"/><circle cx="' + (x - 5) + '" cy="252" r="4" fill="#FFF" opacity=".7"/>';
        } else {
          s += '<ellipse cx="' + x + '" cy="266" rx="40" ry="22" fill="url(#' + p + 'gl)"/>' +
            '<path d="M' + (x - 24) + ' 262 Q' + (x - 24) + ' 236 ' + x + ' 236 Q' + (x + 24) + ' 236 ' + (x + 24) + ' 262 Z" fill="' + m.base + '"/>' +
            '<path d="M' + (x - 18) + ' 254 Q' + (x - 16) + ' 242 ' + (x - 4) + ' 239" stroke="' + m.hi + '" stroke-width="1.6" fill="none" opacity=".6"/>' +
            '<ellipse cx="' + x + '" cy="262" rx="22" ry="3" fill="#FFF2D0"/>';
        }
      });
      if (kind === 'linear') {
        s += '<line x1="140" y1="0" x2="140" y2="244" stroke="#111" stroke-width="1.2"/><line x1="260" y1="0" x2="260" y2="244" stroke="#111" stroke-width="1.2"/>' +
          '<ellipse cx="200" cy="262" rx="110" ry="22" fill="url(#' + p + 'gl)"/>' + rect(118, 244, 164, 9, m.base, 'rx="4.5"') + rect(122, 252, 156, 2.4, '#FFF2D0', 'rx="1.2"');
      }
      return s;
    }
  }

  /* The ten kitchens. `style` is the main style, `also` a secondary one. Names are what the customer sees. */
  var CARDS = [
    { id: 'sage', name: 'Sage Shaker with brass', style: 'classic', also: 'warm', tags: ['Shaker', 'Painted', 'Brass'],
      wall: '#EDE6DA', wallName: 'Warm white', doors: 'shaker', unit: '#8E9C80', unitName: 'sage green', upper: 'shelves', shelf: '#B9895A',
      handles: 'brass', handleShape: 'cup', top: 'marble', splash: 'metro', splashColour: '#F3F1EC', cooker: 'range', rangeColour: '#E6DDC8',
      hood: 'canopy', sink: 'belfast', floor: 'oak', window: 'white', decor: ['plant', 'board'], rug: '#8A6F55' },
    { id: 'ink', name: 'Ink blue Shaker with island', style: 'dark', also: 'classic', tags: ['Shaker', 'Island', 'Marble'],
      wall: '#E9E4DC', wallName: 'Soft white', doors: 'shaker', unit: '#28364C', unitName: 'ink blue', upper: 'units', handles: 'brass', handleShape: 'knob',
      top: 'marble', splash: 'marble', cooker: 'hob', hood: 'canopy', sink: 'undermount', floor: 'herringbone', led: true,
      island: { colour: '#28364C', doors: 'shaker', stools: 'oak' }, pendants: 'globe', decor: [] },
    { id: 'white', name: 'Crisp white handleless', style: 'sleek', also: null, tags: ['Handleless', 'Minimal', 'Waterfall island'],
      wall: '#F1F0EE', wallName: 'Chalk white', doors: 'slab', unit: '#F3F2EF', unitName: 'matt white', upper: 'units', handles: null,
      top: 'quartz', splash: 'plain', splashColour: '#E3E5E5', cooker: 'hob', hood: 'none', sink: 'undermount', floor: 'tiles', led: true,
      island: { colour: '#F3F2EF', doors: 'slab', waterfall: true, stools: 'black' }, pendants: 'linear', pendantMetal: 'black', decor: ['vase'] },
    { id: 'grey', name: 'Soft grey with oak', style: 'sleek', also: 'warm', tags: ['Slab doors', 'Oak worktop', 'Open shelves'],
      wall: '#E6E3DE', wallName: 'Pale grey', doors: 'slab', unit: '#A6A6A3', unitName: 'dove grey', upper: 'shelves', shelf: '#C08F5E',
      handles: 'black', handleShape: 'bar', top: 'oak', splash: 'zellige', splashColour: '#EEEBE4', cooker: 'hob', hood: 'chimney', hoodMetal: 'black',
      sink: 'undermount', floor: 'tiles', floorColour: '#CFCAC2', window: 'crittall', decor: ['plant', 'jars'], rug: '#3A3B3D' },
    { id: 'oak', name: 'Warm oak and plaster', style: 'warm', also: null, tags: ['Fluted oak', 'Plaster hood', 'Terrazzo'],
      wall: '#DCC8B2', wallName: 'Plaster pink', doors: 'fluted', unit: '#C79A6B', unitName: 'natural oak', upper: 'shelves', shelf: '#C79A6B',
      handles: 'brass', handleShape: 'bar', top: 'terrazzo', splash: 'zellige', splashColour: '#D9B89B', cooker: 'hob', hood: 'canopy', hoodColour: '#D3BEA7',
      sink: 'undermount', floor: 'oak', floorColour: '#D2AE82', island: { colour: '#C79A6B', doors: 'fluted', stools: 'oak' }, pendants: 'globe', decor: ['vase'] },
    { id: 'clay', name: 'Clay and walnut', style: 'warm', also: 'dark', tags: ['Walnut', 'Terracotta', 'Zellige tiles'],
      wall: '#B9785E', wallName: 'Terracotta', doors: 'slab', unit: '#6B4A33', unitName: 'walnut', upper: 'shelves', shelf: '#6B4A33',
      handles: 'black', handleShape: 'knob', top: 'quartz', splash: 'zellige', splashColour: '#E6DBC9', cooker: 'hob', hood: 'chimney', hoodMetal: 'black',
      sink: 'undermount', floor: 'herringbone', floorColour: '#8E6644', window: 'crittall', decor: ['plant', 'board'], rug: '#D8C6A8' },
    { id: 'forest', name: 'Forest green and marble', style: 'dark', also: 'sleek', tags: ['Deep green', 'Marble', 'Brass'],
      wall: '#E7E4DF', wallName: 'Stone white', doors: 'slab', unit: '#2F4A3A', unitName: 'forest green', upper: 'units', handles: 'brass', handleShape: 'bar',
      top: 'marble', splash: 'marble', cooker: 'hob', hood: 'none', sink: 'undermount', floor: 'herringbone', led: true,
      island: { colour: '#2F4A3A', doors: 'slab', waterfall: true, stools: 'brass' }, pendants: 'dome', pendantMetal: 'brass', decor: [] },
    { id: 'concrete', name: 'Concrete and black steel', style: 'industrial', also: 'sleek', tags: ['Concrete', 'Black steel', 'Metro tiles'],
      wall: '#BDB8B1', wallName: 'Concrete grey', wallType: 'concrete', doors: 'slab', unit: '#3A3B3D', unitName: 'charcoal', upper: 'shelves', shelf: '#2A2A2B', shelfBrackets: true,
      handles: 'black', handleShape: 'bar', top: 'concrete', splash: 'metro', splashColour: '#F2F0EC', grout: '#3A3A3A', cooker: 'hob', hood: 'chimney', hoodMetal: 'black',
      sink: 'undermount', floor: 'concrete', window: 'crittall', island: { colour: '#3A3B3D', doors: 'slab', waterfall: true, stools: 'black' },
      pendants: 'dome', pendantMetal: 'black', decor: ['plant'] },
    { id: 'cream', name: 'Cream Shaker with range cooker', style: 'classic', also: null, tags: ['Shaker', 'Range cooker', 'Chequer floor'],
      wall: '#E3DED3', wallName: 'Linen', doors: 'shaker', unit: '#E8E1D0', unitName: 'cream', upper: 'units', handles: 'chrome', handleShape: 'cup',
      top: 'oak', splash: 'metro', splashColour: '#F7F5F0', cooker: 'range', rangeColour: '#1F2B3C', hood: 'canopy', sink: 'belfast',
      floor: 'checker', window: 'white', decor: ['board', 'plant'] },
    { id: 'brick', name: 'Brick and timber loft', style: 'industrial', also: 'warm', tags: ['Exposed brick', 'Smoked oak', 'Range cooker'],
      wall: '#8E4E39', wallName: 'Exposed brick', wallType: 'brick', doors: 'slab', unit: '#5B4636', unitName: 'smoked oak', upper: 'shelves', shelf: '#7A5A3F', shelfBrackets: true,
      handles: 'black', handleShape: 'bar', top: 'nero', splash: 'metro', splashColour: '#F2F0EC', grout: '#3A3A3A', cooker: 'range', rangeColour: '#1E1E1F',
      hood: 'chimney', hoodMetal: 'black', sink: 'undermount', floor: 'darkwood', window: 'crittall',
      island: { colour: '#1F1F21', doors: 'fluted', top: 'oak', stools: 'black' }, pendants: 'dome', pendantMetal: 'black', decor: ['plant'] }
  ];

  var STYLES = {
    classic: { name: 'Classic Shaker', blurb: 'Timeless painted doors, warm metals and a kitchen that feels like the heart of the house.',
      island: function (b) { return { colour: b.unit, doors: 'shaker', stools: 'oak' }; } },
    sleek: { name: 'Sleek modern', blurb: 'Clean lines, handleless doors and nothing out of place.',
      island: function () { return { colour: '#F3F2EF', doors: 'slab', waterfall: true, stools: 'black' }; } },
    warm: { name: 'Warm minimal', blurb: 'Natural timber, soft plaster tones and textured tiles. Calm, but never cold.',
      island: function () { return { colour: '#C79A6B', doors: 'fluted', stools: 'oak' }; } },
    dark: { name: 'Dark and dramatic', blurb: 'Deep colour, polished stone and brass that glows in the evening.',
      island: function () { return { colour: '#1F1F21', doors: 'fluted', stools: 'brass' }; } },
    industrial: { name: 'Urban loft', blurb: 'Concrete, black steel and brick. Honest materials with real character.',
      island: function () { return { colour: '#3A3B3D', doors: 'slab', top: 'concrete', waterfall: true, stools: 'black' }; } }
  };

  /* Words and swatches for a spec, used on the result card and in Alex's brief. */
  function describe(spec) {
    var doorWord = { shaker: 'Shaker doors', slab: 'Slab doors', fluted: 'Fluted doors' }[spec.doors];
    var handle = !spec.handles ? 'Handleless' : METALS[spec.handles].name + ' ' + ({ knob: 'knobs', cup: 'cup handles', bar: 'bar handles' }[spec.handleShape || 'bar']);
    var feature = spec.island ? 'Island' + (spec.island.waterfall ? ' with waterfall ends' : '') + (spec.pendants === 'globe' ? ' and globe pendants' : spec.pendants === 'dome' ? ' and dome pendants' : spec.pendants === 'linear' ? ' and a linear pendant' : '')
      : spec.cooker === 'range' ? 'Range cooker' + (spec.hood === 'canopy' ? ' under a painted canopy' : '') : spec.upper === 'shelves' ? 'Open shelving' : 'Full-height wall units';
    var metalSwatch = spec.handles ? METALS[spec.handles].base : shade(spec.unit, -0.3);
    return {
      rows: [
        ['Doors', doorWord + ' in ' + spec.unitName],
        ['Worktop', TOPS[spec.top].name],
        ['Handles', handle],
        ['Feature', feature],
        ['Floor', (FLOORS[spec.floor] || FLOORS.oak).name]
      ],
      palette: [
        { colour: spec.unit, name: cap(spec.unitName) },
        { colour: spec.wall, name: spec.wallName },
        { colour: TOPS[spec.top].colour, name: TOPS[spec.top].name.replace(/-effect.*$/, '').replace(/^Solid /, '').replace(/^White /, '') },
        { colour: metalSwatch, name: spec.handles ? { brass: 'Brass', black: 'Black', chrome: 'Chrome' }[spec.handles] : 'Shadow line' }
      ]
    };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  window.KitchenArt = { svg: svg, CARDS: CARDS, STYLES: STYLES, describe: describe, shade: shade };
})();
