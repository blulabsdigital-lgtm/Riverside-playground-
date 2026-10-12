/* Kitchen engine client for Kitchen style match.
   Reads the customer's photo in the browser, turns a kitchen design into the engine's style object,
   and asks the kitchen-restyle function to redesign the photo in that style.
   Switched off while window.RV_KITCHEN_ENGINE.url is empty (see config.js). */
(function () {
  'use strict';

  var MAX_EDGE = 1280, QUALITY = 0.82, TIMEOUT = 90000;
  var STOP_CODES = { not_kitchen: 1, bad_input: 1, rate_limited: 1 };

  function config() {
    var c = window.RV_KITCHEN_ENGINE || {};
    return { url: String(c.url || '').trim().replace(/\/+$/, ''), anonKey: String(c.anonKey || '').trim() };
  }
  function enabled() { return !!config().url; }

  /* ---------- Photo ---------- */
  // Decode with the camera's orientation applied, shrink to 1280 px on the long edge, save as JPEG 0.82.
  function readPhoto(file) {
    if (!file) return Promise.reject(new Error('no_file'));
    if (file.type && !/^image\//.test(file.type)) return Promise.reject(new Error('not_image'));
    return decode(file).then(function (img) {
      var w = img.width, h = img.height;
      if (!w || !h) { img.close(); throw new Error('empty'); }
      var k = Math.min(1, MAX_EDGE / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img.source, 0, 0, cw, ch);
      img.close();
      return { src: c.toDataURL('image/jpeg', QUALITY), w: cw, h: ch };
    });
  }

  function decode(file) {
    if (!window.createImageBitmap) return viaImage(file);
    var bitmap;
    try { bitmap = createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { return viaImage(file); }
    return bitmap.then(function (bmp) {
      return { source: bmp, width: bmp.width, height: bmp.height, close: function () { if (bmp.close) bmp.close(); } };
    }, function () { return viaImage(file); });
  }

  // Fallback: browsers apply the camera orientation to <img> by default.
  function viaImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, close: function () { URL.revokeObjectURL(url); } });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  /* ---------- Style ---------- */
  // Maps a KitchenArt design spec onto the engine contract's style object.
  function style(spec, styleName, twist) {
    var row = {};
    window.KitchenArt.describe(spec).rows.forEach(function (r) { row[r[0]] = r[1]; });
    return {
      styleName: styleName,
      twist: twist || null,
      doors: spec.doors,
      unitColour: spec.unit,
      unitName: spec.unitName,
      worktop: row.Worktop,
      splashback: spec.splash || 'plain',
      splashColour: spec.splashColour || null,
      handles: row.Handles,
      wall: spec.wallName,
      floor: row.Floor,
      island: !!spec.island,
      pendants: spec.island && spec.pendants ? spec.pendants : 'none',
      cooker: spec.cooker || 'hob',
      hood: spec.hood || 'none',
      upper: spec.upper || 'none'
    };
  }

  // Everything the picture depends on. A new twist alone is not worth a fresh image.
  function signature(s) {
    var copy = {};
    Object.keys(s).forEach(function (k) { if (k !== 'twist') copy[k] = s[k]; });
    return JSON.stringify(copy);
  }

  /* ---------- Request ---------- */
  // Returns { promise, cancel }. The promise always resolves:
  // { ok: true, image, ms } or { ok: false, code, message }. Codes added here: timeout, network, cancelled.
  function restyle(photo, styleObj) {
    var c = config();
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = null, reason = null, settle;
    var promise = new Promise(function (resolve) {
      var done = false;
      settle = function (r) { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    });
    if (!c.url) { settle(failed('engine_off')); return { promise: promise, cancel: function () {} }; }

    function stop(why) { reason = why; settle(failed(why)); if (ctrl) ctrl.abort(); }
    timer = setTimeout(function () { stop('timeout'); }, TIMEOUT);

    var headers = { 'Content-Type': 'application/json' };
    if (c.anonKey) { headers.Authorization = 'Bearer ' + c.anonKey; headers.apikey = c.anonKey; }
    var t0 = Date.now();
    fetch(c.url + '/functions/v1/kitchen-restyle', {
      method: 'POST', headers: headers, body: JSON.stringify({ photo: photo, style: styleObj }), signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (data && data.ok === true && /^data:image\/(png|jpeg|webp);base64,/.test(data.image || '')) {
          return { ok: true, image: data.image, ms: data.ms || Date.now() - t0 };
        }
        var code = data && typeof data.code === 'string' ? data.code :
          res.status === 429 ? 'rate_limited' : res.status === 503 ? 'engine_busy' : 'engine_error';
        return failed(code, data && typeof data.message === 'string' ? data.message : '');
      });
    }).then(settle, function () { settle(failed(reason || 'network')); });

    return { promise: promise, cancel: function () { stop('cancelled'); } };
  }

  function failed(code, message) {
    return { ok: false, code: code, message: String(message || '').slice(0, 240) };
  }

  // Failures a different style will not fix, so a restart would only repeat them.
  function isFinal(code) { return !!STOP_CODES[code]; }

  window.KitchenEngine = { enabled: enabled, readPhoto: readPhoto, style: style, signature: signature, restyle: restyle, isFinal: isFinal, TIMEOUT: TIMEOUT };
})();
