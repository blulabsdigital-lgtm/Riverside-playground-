/* Riverside 3D house: the customer's home at dusk, live in three.js.
   createHouse3D(container, options) draws a terrace, semi or detached house that can grow a rear extension,
   a floor above it and a loft dormer, or the extension being built stage by stage (Riverside Live).
   Pages need an import map for 'three' and 'three/addons/', and keep assets/house.js (2D) as the fallback
   when isWebGLAvailable() is false or createHouse3D throws. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

/* ---------- Dimensions (metres) ---------- */
const GF = 2.9, EAVES = 5.7, RIDGE = 9, EXT_H = 3.1, UP_TOP = 5.3, OH = 0.32, WALL = 0.25;
const TYPES = {
  terrace: { W: 5, D: 9, sides: ['party', 'party'], brick: 'stock', padL: 0, padR: 0, maxDepth: 6 },
  semi: { W: 6.5, D: 9, sides: ['hip', 'party'], brick: 'stock', padL: 1.2, padR: 0, maxDepth: 6 },
  detached: { W: 9, D: 10, sides: ['gable', 'gable'], brick: 'red', padL: 1.6, padR: 1.6, maxDepth: 8 }
};
const GOLD = '#D4AC5A', GOLD_HI = '#EDD08E', GOLD_DEEP = '#A9823A', CHAR = '#1D1D1E';
const FOG = '#27242B', FOV = 34;
const HANDLE_PX = 46, PLUS_PX = 34, HIT_PX = 32, TAP_PX = 6;
const DEF_VIEW = { theta: -0.68, phi: 1.27 }, BUILD_VIEW = { theta: -0.58, phi: 1.22 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const EASE = {
  out: p => 1 - Math.pow(1 - p, 3),
  in: p => p * p * p,
  inOut: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  back: p => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
};
/* How each animated value moves: [style, duration ms] */
const SPEC = {
  walls: ['rise', 850], slab: ['rise', 600], deck: ['rise', 750], glass: ['rise', 800], lantern: ['pop', 700],
  units: ['pop', 650], island: ['pop', 700], table: ['pop', 700], plant: ['pop', 650], patio: ['rise', 600],
  upper: ['pop', 750], loft: ['pop', 750], hip: ['smooth', 700], ghost: ['fade', 350], hintLoft: ['fade', 300],
  hintUpper: ['fade', 300], lit: ['smooth', 900], gold: ['smooth', 900], site: ['pop', 650], mud: ['smooth', 900],
  mark: ['pop', 650], trench: ['pop', 750], footings: ['rise', 700], steel: ['pop', 800], joists: ['rise', 800],
  cables: ['pop', 800], kitchen: ['pop', 800]
};

/* ---------- WebGL check ---------- */
let webglOK = null;
export function isWebGLAvailable() {
  if (webglOK !== null) return webglOK;
  try {
    const c = document.createElement('canvas');
    const gl = window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'));
    webglOK = !!gl;
    if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
  } catch (e) { webglOK = false; }
  return webglOK;
}

/* ---------- Procedural textures (canvases are shared, textures are per instance) ---------- */
const CANVAS = {};
function paint(name, w, h, draw) {
  if (!CANVAS[name]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h); CANVAS[name] = c;
  }
  return CANVAS[name];
}
function rand(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function tone(hex, k, sat = 1) {
  let [r, g, b] = rgb(hex); const m = (r + g + b) / 3;
  r = m + (r - m) * sat; g = m + (g - m) * sat; b = m + (b - m) * sat;
  return 'rgb(' + [r, g, b].map(v => clamp(Math.round(v * k), 0, 255)).join(',') + ')';
}
const PAL = {
  stock: { bricks: ['#B9A27A', '#A8936E', '#C4AF8A', '#9C8766', '#B19B74', '#94805F', '#B8A07E', '#A28C6A'], mortar: '#B3AEA4', odd: ['#73654F', '#A07E61'] },
  red: { bricks: ['#8E4C3A', '#7F4434', '#9A5844', '#753F31', '#A0614D', '#874A39', '#93533F'], mortar: '#B9B0A4', odd: ['#5F3428', '#A87160'] }
};
function brickCanvas(kind, muted) {
  const pal = PAL[kind], sat = muted ? 0.35 : 1, k0 = muted ? 0.62 : 1;
  return paint('brick-' + kind + (muted ? '-m' : ''), 512, 512, (g) => {
    const R = rand(kind === 'red' ? 7 : 3), rows = 12, cols = 4, bh = 512 / rows, bw = 512 / cols, j = 3.2;
    g.fillStyle = tone(pal.mortar, k0, sat); g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) { g.fillStyle = 'rgba(0,0,0,' + (R() * 0.1) + ')'; g.fillRect(R() * 512, R() * 512, 1.5, 1.5); }
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0, row = [];
      for (let c = 0; c < cols; c++) {
        const odd = R() < 0.07;
        row.push({ base: odd ? pal.odd[Math.floor(R() * pal.odd.length)] : pal.bricks[Math.floor(R() * pal.bricks.length)], k: (0.86 + R() * 0.26) * k0, seed: Math.floor(R() * 1e9) });
      }
      for (let c = -1; c <= cols; c++) {
        const b = row[(c + cols) % cols], x = c * bw + off, y = r * bh;
        if (x + bw <= 0 || x >= 512) continue;
        const Rb = rand(b.seed), w = bw - j, h = bh - j, bx = x + j / 2, by = y + j / 2;
        g.fillStyle = tone(b.base, b.k, sat); g.fillRect(bx, by, w, h);
        for (let i = 0; i < 7; i++) { g.fillStyle = (Rb() < 0.5 ? 'rgba(20,10,0,' : 'rgba(255,240,210,') + (0.04 + Rb() * 0.07) + ')'; g.fillRect(bx + Rb() * w * 0.7, by + Rb() * h * 0.6, w * (0.15 + Rb() * 0.4), h * (0.3 + Rb() * 0.5)); }
        for (let i = 0; i < 46; i++) { g.fillStyle = (Rb() < 0.6 ? 'rgba(40,24,10,' : 'rgba(255,246,222,') + (0.12 + Rb() * 0.25) + ')'; g.fillRect(bx + Rb() * w, by + Rb() * h, 1.7, 1.7); }
        g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(bx, by, w, 2);
        g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(bx, by + h - 2.2, w, 2.2);
      }
    }
  });
}
function brickBumpCanvas() {
  return paint('brick-bump', 512, 512, (g) => {
    const R = rand(5), rows = 12, cols = 4, bh = 512 / rows, bw = 512 / cols, j = 3.2;
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = c * bw + off; if (x + bw <= 0 || x >= 512) continue;
        const v = 200 + Math.floor(R() * 40);
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x + j / 2 + 0.5, r * bh + j / 2 + 0.5, bw - j - 1, bh - j - 1);
      }
    }
    for (let i = 0; i < 9000; i++) { g.fillStyle = 'rgba(0,0,0,' + R() * 0.25 + ')'; g.fillRect(R() * 512, R() * 512, 2, 2); }
  });
}
function slateBumpCanvas() {
  return paint('slate-bump', 256, 256, (g) => {
    const rows = 5, h = 256 / rows, w = 256 / 5;
    for (let r = 0; r < rows; r++) {
      const gr = g.createLinearGradient(0, r * h, 0, r * h + h);
      gr.addColorStop(0, '#202020'); gr.addColorStop(0.12, '#909090'); gr.addColorStop(1, '#F0F0F0');
      g.fillStyle = gr; g.fillRect(0, r * h, 256, h);
      const off = r % 2 ? w / 2 : 0;
      g.fillStyle = '#303030';
      for (let c = -1; c <= 5; c++) g.fillRect(c * w + off - 1, r * h, 2, h);
    }
  });
}
function shadowCanvas() {
  return paint('contact', 128, 128, (g) => {
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const u = Math.abs(x - 63.5) / 64, v = Math.abs(y - 63.5) / 64;
      const e = Math.max(0, 1 - Math.max(Math.pow(u, 6), Math.pow(v, 6)) ), a = Math.pow(e, 2.2) * 0.9;
      const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function slateCanvas() {
  return paint('slate', 512, 512, (g) => {
    const R = rand(11), pal = ['#3E434B', '#383C43', '#444950', '#34383E', '#40444A', '#3A3F47'];
    g.fillStyle = '#202328'; g.fillRect(0, 0, 512, 512);
    const rows = 5, cols = 5, h = 512 / rows, w = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? w / 2 : 0, row = [];
      for (let c = 0; c < cols; c++) row.push({ c: pal[Math.floor(R() * pal.length)], k: 0.85 + R() * 0.3 });
      for (let c = -1; c <= cols; c++) {
        const s = row[(c + cols) % cols], x = c * w + off;
        if (x + w <= 0 || x >= 512) continue;
        g.fillStyle = tone(s.c, s.k); g.fillRect(x + 1.5, r * h, w - 3, h);
        g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x + 1.5, r * h + h - 14, w - 3, 12);
      }
      const gr = g.createLinearGradient(0, r * h, 0, r * h + 16);
      gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, r * h, 512, 16);
    }
    for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(' + (R() < 0.5 ? '0,0,0' : '200,210,220') + ',' + R() * 0.07 + ')'; g.fillRect(R() * 512, R() * 512, 1.4, 1.4); }
  });
}
function lawnCanvas() {
  return paint('lawn', 256, 256, (g) => {
    const R = rand(5);
    g.fillStyle = '#4F653A'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#435832'; g.fillRect(128, 0, 128, 256);
    const blades = ['#5E7745', '#3A4D2A', '#4A6036', '#69824E', '#33452A'];
    for (let i = 0; i < 9000; i++) { g.globalAlpha = 0.35 + R() * 0.35; g.fillStyle = blades[Math.floor(R() * blades.length)]; g.fillRect(R() * 256, R() * 256, 1, 2 + R() * 3); }
    g.globalAlpha = 1;
  });
}
function pavingCanvas() {
  return paint('paving', 256, 256, (g) => {
    const R = rand(9);
    g.fillStyle = '#4C4740'; g.fillRect(0, 0, 256, 256);
    [[0, 0, 128, 128], [128, 0, 128, 85], [128, 85, 128, 171], [0, 128, 128, 128]].forEach(s => {
      g.fillStyle = tone('#9B9385', 0.85 + R() * 0.25); g.fillRect(s[0] + 2, s[1] + 2, s[2] - 4, s[3] - 4);
      for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(' + (R() < 0.5 ? '0,0,0' : '255,250,235') + ',' + R() * 0.12 + ')'; g.fillRect(s[0] + 2 + R() * (s[2] - 4), s[1] + 2 + R() * (s[3] - 4), 2, 2); }
    });
  });
}
function boardsCanvas() {
  return paint('boards', 256, 256, (g) => {
    const R = rand(13), n = 10, w = 256 / n;
    g.fillStyle = '#1C1510'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < n; i++) {
      g.fillStyle = tone('#4E3D30', 0.8 + R() * 0.3); g.fillRect(i * w + 1, 0, w - 2, 256);
      for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(0,0,0,' + (0.05 + R() * 0.1) + ')'; g.fillRect(i * w + 2 + R() * (w - 5), 0, 1, 256); }
    }
  });
}
function blockCanvas() {
  return paint('block', 256, 256, (g) => {
    const R = rand(17), rows = 4, cols = 2, h = 256 / rows, w = 256 / cols;
    g.fillStyle = '#6E6B66'; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? w / 2 : 0, row = [0.85 + R() * 0.2, 0.85 + R() * 0.2];
      for (let c = -1; c <= cols; c++) {
        const x = c * w + off; if (x + w <= 0 || x >= 256) continue;
        g.fillStyle = tone('#A9A7A1', row[(c + cols) % cols]); g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      }
    }
    for (let i = 0; i < 5000; i++) { g.fillStyle = 'rgba(' + (R() < 0.5 ? '0,0,0' : '255,255,255') + ',' + R() * 0.14 + ')'; g.fillRect(R() * 256, R() * 256, 1.3, 1.3); }
  });
}
function claddingCanvas() {
  return paint('cladding', 256, 256, (g) => {
    const R = rand(19);
    g.fillStyle = '#3A3B3E'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3; i++) {
      const x = i * 85.33;
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 3, 0, 30, 256);
      g.fillStyle = '#56585C'; g.fillRect(x, 0, 3, 256);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 3, 0, 3, 256);
    }
    for (let i = 0; i < 2000; i++) { g.fillStyle = 'rgba(255,255,255,' + R() * 0.03 + ')'; g.fillRect(R() * 256, R() * 256, 1, 4); }
  });
}
function renderCanvas() {
  return paint('render', 128, 128, (g) => {
    const R = rand(23);
    g.fillStyle = '#E7E1D5'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { g.fillStyle = 'rgba(' + (R() < 0.5 ? '90,80,60' : '255,255,255') + ',' + R() * 0.07 + ')'; g.fillRect(R() * 128, R() * 128, 1.2, 1.2); }
  });
}
function paneCanvas(kind) {
  return paint('pane' + kind, 128, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#5E3A1C'); gr.addColorStop(0.5, '#C9843F'); gr.addColorStop(1, '#F2BD78');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const lx = kind === 2 ? 92 : 38, rg = g.createRadialGradient(lx, 92, 4, lx, 92, 74);
    rg.addColorStop(0, 'rgba(255,238,196,.95)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    if (kind === 0) {
      [[0, 24], [104, 24]].forEach(([x, w]) => {
        g.fillStyle = '#5A3418'; g.fillRect(x, 0, w, 128);
        for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? 'rgba(255,190,120,.18)' : 'rgba(0,0,0,.25)'; g.fillRect(x + i * 6, 0, 3, 128); }
      });
    } else if (kind === 1) {
      g.fillStyle = '#EBC58C'; g.fillRect(0, 0, 128, 44);
      for (let y = 4; y < 44; y += 6) { g.fillStyle = 'rgba(80,40,10,.35)'; g.fillRect(0, y, 128, 1.5); }
    } else if (kind === 2) {
      g.fillStyle = 'rgba(60,30,10,.55)'; g.fillRect(20, 30, 34, 24);
      g.fillStyle = 'rgba(255,220,160,.35)'; g.fillRect(24, 34, 26, 16);
    } else {
      g.fillStyle = 'rgba(30,15,5,.45)'; g.fillRect(0, 0, 128, 128);
    }
  });
}
function glowCanvas() {
  return paint('glow', 64, 64, (g) => {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  });
}
function spillCanvas() {
  return paint('spill', 128, 128, (g) => {
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const u = (x - 63.5) / 64, v = y / 127;
      const a = Math.pow(1 - v, 1.6) * Math.max(0, 1 - Math.pow(Math.abs(u) / (0.75 + v * 0.25), 3));
      const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function mudCanvas() {
  return paint('mud', 256, 256, (g) => {
    const R = rand(29);
    for (let i = 0; i < 520; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 100, x = 128 + Math.cos(a) * r * 1.05, y = 128 + Math.sin(a) * r, s = 10 + R() * 26;
      const rg = g.createRadialGradient(x, y, 0, x, y, s), c = R() < 0.5 ? '58,42,28' : '76,58,40';
      rg.addColorStop(0, 'rgba(' + c + ',.42)'); rg.addColorStop(1, 'rgba(' + c + ',0)');
      g.fillStyle = rg; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  });
}
function meshCanvas() {
  return paint('mesh', 64, 64, (g) => {
    g.clearRect(0, 0, 64, 64); g.fillStyle = 'rgba(200,206,210,.9)';
    for (let i = 0; i < 64; i += 8) { g.fillRect(i, 0, 1.2, 64); g.fillRect(0, i, 64, 1.2); }
  });
}
function badgeCanvas(kind) {
  return paint('badge-' + kind, 128, 128, (g) => {
    if (kind === 'ring') {
      g.strokeStyle = GOLD; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke(); return;
    }
    const gr = g.createLinearGradient(20, 10, 108, 118);
    gr.addColorStop(0, GOLD_HI); gr.addColorStop(0.55, GOLD); gr.addColorStop(1, GOLD_DEEP);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 8;
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = CHAR; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = CHAR; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    if (kind === 'plus') { g.moveTo(40, 64); g.lineTo(88, 64); g.moveTo(64, 40); g.lineTo(64, 88); }
    else { g.moveTo(34, 64); g.lineTo(94, 64); g.moveTo(46, 50); g.lineTo(32, 64); g.lineTo(46, 78); g.moveTo(82, 50); g.lineTo(96, 64); g.lineTo(82, 78); }
    g.stroke();
  });
}

/* ---------- Geometry helpers ---------- */
/* UVs in metres from world position and face normal, so bricks and boards keep their size on every box */
function worldUV(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  let uv = g.attributes.uv;
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2); g.setAttribute('uv', uv); }
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny > 0.7) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (nx > nz) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
  return g;
}
function mergeGeos(list) {
  let n = 0;
  const arr = list.map(g => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal) ng.computeVertexNormals();
    if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    n += ng.attributes.position.count; return ng;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  arr.forEach(g => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  });
  list.forEach(g => g.dispose()); arr.forEach(g => g.dispose());
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere();
  return m;
}
/* Collects static pieces per material and merges them into one mesh each */
class Batch {
  constructor() { this.m = new Map(); }
  put(mat, g) {
    let l = this.m.get(mat); if (!l) this.m.set(mat, l = []);
    if (mat.userData.uv !== 'local') worldUV(g);
    l.push(g); return g;
  }
  box(mat, w, h, d, x, y, z, ry) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return this.put(mat, g); }
  geo(mat, g, x = 0, y = 0, z = 0, ry = 0) { if (ry) g.rotateY(ry); g.translate(x, y, z); return this.put(mat, g); }
  /* place a piece on a wall face: u along the wall, v up, w outwards */
  face(mat, g, f, u, v, w) { g.translate(u, v, w); if (f.ry) g.rotateY(f.ry); g.translate(f.x, 0, f.z); return this.put(mat, g); }
  flush(parent, o = {}) {
    const out = [];
    this.m.forEach((list, mat) => {
      const mesh = new THREE.Mesh(mergeGeos(list), mat);
      mesh.castShadow = o.shadow !== false && o.cast !== false && !mat.transparent && mat.userData.cast !== false;
      mesh.receiveShadow = o.shadow !== false && mat.userData.receive !== false;
      if (o.pick) mesh.userData.pick = o.pick;
      parent.add(mesh); out.push(mesh);
    });
    this.m.clear();
    return out;
  }
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const plane = (w, h) => new THREE.PlaneGeometry(w, h);
function beamGeo(a, b, s) {
  const v = new THREE.Vector3().subVectors(b, a), len = v.length();
  const g = new THREE.BoxGeometry(s, s, len);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
function triGeo(pts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.flat()), 3));
  g.computeVertexNormals();
  return g;
}
/* Pitched roof: two slopes, with hips or gable verges at the free ends. h = how far each hip runs (0 = gable). */
function roofGeo(cx, W, D, sideL, sideR, hl, hr) {
  const tanP = (RIDGE - EAVES) / (D / 2), sinP = tanP / Math.sqrt(1 + tanP * tanP);
  const yE = EAVES - OH * tanP, zR = OH, zF = -D - OH, zM = -D / 2;
  function ends(side, h, s) {
    const wall = cx + s * W / 2;
    if (side === 'party') return [wall, wall, 0];
    const hh = side === 'hip' ? h : 0, ov = 0.14 + (OH - 0.14) * hh, ex = wall + s * ov;
    return [ex, ex - s * hh * (D / 2 + OH), hh];
  }
  const [xl, rl, hL] = ends(sideL, hl, -1), [xr, rr, hR] = ends(sideR, hr, 1);
  const A = [xl, yE, zR], B = [xr, yE, zR], C = [xr, yE, zF], Dd = [xl, yE, zF], RL = [rl, RIDGE, zM], RR = [rr, RIDGE, zM];
  const tris = [[A, B, RR], [A, RR, RL], [C, Dd, RL], [C, RL, RR]], ends2 = [];
  if (sideL !== 'party' && hL > 0.002) ends2.push([Dd, A, RL]);
  if (sideR !== 'party' && hR > 0.002) ends2.push([B, C, RR]);
  const pos = [], uv = [];
  tris.forEach(t => t.forEach(p => { pos.push(...p); uv.push(p[0], (p[1] - yE) / sinP); }));
  ends2.forEach(t => t.forEach(p => { pos.push(...p); uv.push(p[2], (p[1] - yE) / sinP); }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.computeVertexNormals();
  return { geo: g, xl, xr, rl, rr, yE, zR, zF, zM, hL, hR, A, B, C, Dd, RL, RR };
}

/* Window and door layouts per house type. u runs along the face, y is the bottom of the opening. */
const FACADES = {
  terrace: {
    rear: [{ k: 'door', u: -1.45, w: 0.92, h: 2.12, gf: 1, lit: 1 }, { k: 'win', u: 0.85, y: 0.85, w: 1.25, h: 1.45, gf: 1, lit: 2 },
      { k: 'win', u: -1.15, y: 3.45, w: 0.95, h: 1.5, lit: 0 }, { k: 'win', u: 1.15, y: 3.45, w: 0.95, h: 1.5, lit: 1 }],
    front: [{ k: 'door', u: -1.45, w: 1, h: 2.3, fan: 1, solid: 1, lit: 2 }, { k: 'win', u: 0.85, y: 0.7, w: 1.5, h: 1.75, lit: 0 },
      { k: 'win', u: -1.2, y: 3.4, w: 1, h: 1.6, lit: 3 }, { k: 'win', u: 1, y: 3.4, w: 1, h: 1.6, lit: 1 }],
    left: [], right: []
  },
  semi: {
    rear: [{ k: 'door', u: -2.05, w: 0.92, h: 2.12, gf: 1, lit: 1 }, { k: 'win', u: 0.9, y: 0.85, w: 1.6, h: 1.45, gf: 1, lit: 2 },
      { k: 'win', u: -1.55, y: 3.45, w: 1.05, h: 1.5, lit: 0 }, { k: 'win', u: 1.5, y: 3.45, w: 1.05, h: 1.5, lit: 1 }],
    front: [{ k: 'door', u: 2.1, w: 1, h: 2.3, fan: 1, solid: 1, lit: 2 }, { k: 'win', u: -0.7, y: 0.7, w: 1.8, h: 1.75, lit: 0 },
      { k: 'win', u: -1.4, y: 3.4, w: 1.05, h: 1.6, lit: 3 }, { k: 'win', u: 1.5, y: 3.4, w: 1.05, h: 1.6, lit: 1 }],
    left: [{ k: 'win', u: 1.6, y: 3.6, w: 0.7, h: 1.2, lit: 2 }, { k: 'win', u: 2.6, y: 1, w: 0.8, h: 1.2, lit: 0 }], right: []
  },
  detached: {
    rear: [{ k: 'french', u: -2.3, w: 1.7, h: 2.2, gf: 1, lit: 1 }, { k: 'win', u: 2.3, y: 0.85, w: 1.8, h: 1.45, gf: 1, lit: 2 },
      { k: 'win', u: -3.1, y: 3.45, w: 1.1, h: 1.5, lit: 0 }, { k: 'win', u: 0, y: 3.45, w: 1.1, h: 1.5, lit: 3 }, { k: 'win', u: 3.1, y: 3.45, w: 1.1, h: 1.5, lit: 1 }],
    front: [{ k: 'door', u: 0, w: 1.1, h: 2.4, fan: 1, solid: 1, lit: 2 }, { k: 'win', u: -2.8, y: 0.7, w: 1.8, h: 1.75, lit: 0 }, { k: 'win', u: 2.8, y: 0.7, w: 1.8, h: 1.75, lit: 1 },
      { k: 'win', u: -2.8, y: 3.4, w: 1.1, h: 1.6, lit: 3 }, { k: 'win', u: 0, y: 3.5, w: 0.8, h: 1.3, lit: 2 }, { k: 'win', u: 2.8, y: 3.4, w: 1.1, h: 1.6, lit: 1 }],
    left: [{ k: 'win', u: 1.5, y: 3.6, w: 0.8, h: 1.2, lit: 2 }], right: [{ k: 'win', u: -1.5, y: 3.6, w: 0.8, h: 1.2, lit: 0 }]
  }
};

/* Injected once: label styles for the HTML hints */
function injectStyle() {
  if (document.getElementById('h3d-style')) return;
  const s = document.createElement('style'); s.id = 'h3d-style';
  s.textContent = '.h3d-canvas{display:block;width:100%;height:100%;touch-action:pan-y;outline:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}' +
    '.h3d-layer{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;overflow:hidden;background:radial-gradient(ellipse 75% 70% at 50% 46%,rgba(0,0,0,0) 60%,rgba(0,0,0,.32) 100%)}' +
    '.h3d-label{position:absolute;left:0;top:0;transform:translate3d(-9999px,0,0);font:700 12.5px/1 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'color:' + GOLD_HI + ';background:rgba(21,21,22,.84);border:1px solid rgba(212,172,90,.62);border-radius:999px;padding:7px 11px;white-space:nowrap;letter-spacing:.01em;' +
    'box-shadow:0 6px 18px rgba(0,0,0,.4);opacity:0;transition:opacity .25s;pointer-events:none;margin:0}' +
    '.h3d-label.h3d-on{opacity:1}' +
    '.h3d-sm .h3d-label{font-size:11px;padding:5px 9px}' +
    'button.h3d-label.h3d-on{pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    'button.h3d-label:hover{background:rgba(47,43,35,.92)}' +
    'button.h3d-label:focus-visible{outline:2px solid ' + GOLD_HI + ';outline-offset:2px}' +
    '@media (prefers-reduced-motion:reduce){.h3d-label{transition:none}}';
  document.head.appendChild(s);
}

/* ======================================================================== */
export function createHouse3D(container, options = {}) {
  if (!container) throw new Error('createHouse3D needs a container element');
  const opt = Object.assign({ type: 'semi', depth: 0, upper: false, loft: false, interactive: true, hints: false, build: null, autoRotate: false, label: '' }, options);
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const VIEW = Object.assign({}, DEF_VIEW, opt.view), BVIEW = Object.assign({}, BUILD_VIEW, opt.view);
  const I = !!opt.interactive;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL is not available' + (e && e.message ? ': ' + e.message : ''));
  }
  if (!renderer.getContext()) { renderer.dispose(); throw new Error('WebGL is not available'); }
  injectStyle();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'h3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', opt.label || 'A 3D model of the house');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);
  const layer = document.createElement('div'); layer.className = 'h3d-layer';
  container.appendChild(layer);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* ---------- State ---------- */
  const type0 = TYPES[opt.type] ? opt.type : 'semi';
  const state = {
    type: type0,
    maxDepth: opt.maxDepth != null ? +opt.maxDepth : TYPES[type0].maxDepth,
    depth: 0, upper: false, loft: false,
    build: opt.build ? { stage: clamp(opt.build.stage | 0, 0, 9), complete: !!opt.build.complete } : null,
    autoRotate: !!opt.autoRotate
  };
  state.depth = clamp(+opt.depth || (state.build ? 5 : 0), 0, state.maxDepth);
  state.upper = !!opt.upper && state.depth >= 2 && !state.build;
  state.loft = !!opt.loft && !state.build;
  const hints = { ext: false, loft: false, upper: false };
  setHints(opt.hints);
  const cur = { d: state.depth };
  const handlers = {};
  let T = TYPES[state.type];

  /* ---------- Scene, camera, lights ---------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG, 24, 72);
  scene.background = new THREE.Color(FOG);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 900);
  const target = new THREE.Vector3();

  const sunDir = new THREE.Vector3(-0.78, 0.42, 0.62).normalize();
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color('#080B15') }, uMid: { value: new THREE.Color('#131829') }, uLow: { value: new THREE.Color('#2C2730') },
      uHor: { value: new THREE.Color('#7A4B2E') }, uGround: { value: new THREE.Color(FOG) }, uSun: { value: sunDir.clone() }
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop, uMid, uLow, uHor, uGround, uSun; varying vec3 vDir;\n' +
      'void main(){ vec3 d = normalize(vDir); float h = d.y;\n' +
      ' vec3 c = mix(uGround, uLow, smoothstep(0.0, 0.05, h)); c = mix(c, uMid, smoothstep(0.05, 0.32, h)); c = mix(c, uTop, smoothstep(0.32, 0.9, h));\n' +
      ' float s = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uSun.xz)), 0.0);\n' +
      ' float band = smoothstep(-0.01, 0.05, h) * (1.0 - smoothstep(0.04, 0.26, h));\n' +
      ' c += uHor * band * (0.28 + 0.6 * pow(s, 4.0));\n' +
      ' c = mix(uGround, c, smoothstep(-0.02, 0.01, h));\n' +
      ' gl_FragColor = vec4(c, 1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}',
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  {
    const R = rand(31), pts = [];
    for (let i = 0; i < 260; i++) {
      const a = R() * Math.PI * 2, e = 0.22 + Math.pow(R(), 0.7) * 1.2;
      pts.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#E8DFC8', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.65, fog: false, depthWrite: false }));
    stars.frustumCulled = false; stars.renderOrder = -9;
    sky.add(stars);
  }

  const hemi = new THREE.HemisphereLight('#7F90BD', '#2E2620', 0.8);
  const key = new THREE.DirectionalLight('#FFCDA0', 1.7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.035;
  const rim = new THREE.DirectionalLight('#9FB3E0', 0.55);
  /* Two point lights live in the scene all the time (intensity 0 when unused) so shaders never recompile */
  const roomLight = new THREE.PointLight('#FFBE78', 0, 11, 2), spillLight = new THREE.PointLight('#FFB570', 0, 8, 2);
  scene.add(hemi, key, key.target, rim, rim.target, roomLight, spillLight);

  /* Environment for reflections on gold, glass and slate */
  let envRT = null;
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat));
    const warm = new THREE.MeshBasicMaterial({ color: '#FFC27A' }); warm.color.multiplyScalar(5);
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), warm); p1.position.copy(sunDir.clone().multiplyScalar(40)).setY(5); p1.lookAt(0, 0, 0); es.add(p1);
    const cool = new THREE.MeshBasicMaterial({ color: '#9FB3E0' }); cool.color.multiplyScalar(1.4);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), cool); p2.position.set(0, 40, 0); p2.lookAt(0, 0, 0); es.add(p2);
    envRT = pm.fromScene(es, 0.03);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.42;
    pm.dispose(); es.traverse(o => { if (o.geometry) o.geometry.dispose(); }); warm.dispose(); cool.dispose();
  }

  /* ---------- Textures and materials ---------- */
  const textures = [];
  function tex(c, tile, color = true) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (tile) t.repeat.set(1 / tile, 1 / tile);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    textures.push(t);
    return t;
  }
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {};
  const brickBump = tex(brickBumpCanvas(), 0.9, false);
  M.brickStock = std({ map: tex(brickCanvas('stock'), 0.9), bumpMap: brickBump, bumpScale: 1.6, roughness: 0.93 });
  M.brickRed = std({ map: tex(brickCanvas('red'), 0.9), bumpMap: brickBump, bumpScale: 1.6, roughness: 0.93 });
  M.brickN = std({ map: tex(brickCanvas('stock', true), 0.9), color: '#9A9A9C', roughness: 0.96 });
  M.brickFar = std({ map: M.brickN.map, color: '#5A5A5E', roughness: 1 });
  M.brickNR = std({ map: tex(brickCanvas('red', true), 0.9), color: '#9A9A9C', roughness: 0.96 });
  M.plinth = std({ color: '#2B2A2C', roughness: 0.9 });
  M.band = std({ color: '#D2C9B6', roughness: 0.8 });
  M.bandN = std({ color: '#6E6A62', roughness: 0.9 });
  M.slate = std({ map: tex(slateCanvas(), 1), bumpMap: tex(slateBumpCanvas(), 1, false), bumpScale: 2.2, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 1.3 });
  M.slate.userData.uv = 'local';
  M.slateN = std({ map: M.slate.map, color: '#77787C', roughness: 0.8, side: THREE.DoubleSide });
  M.slateN.userData.uv = 'local';
  M.ridge = std({ color: '#2A2B2F', roughness: 0.7 });
  M.ridgeN = std({ color: '#1E1F22', roughness: 0.8 });
  M.fascia = std({ color: '#18191B', roughness: 0.5 });
  M.soffit = std({ color: '#D8D3C8', roughness: 0.8 });
  M.frame = std({ color: '#F1EDE5', roughness: 0.45 });
  M.frameN = std({ color: '#66625C', roughness: 0.75 });
  M.sill = std({ color: '#D9D0BF', roughness: 0.8 });
  M.sillN = std({ color: '#57534D', roughness: 0.9 });
  M.arch = std({ color: '#93573D', roughness: 0.9 });
  M.archStone = std({ color: '#D8CFBC', roughness: 0.85 });
  M.archN = std({ color: '#4E3F35', roughness: 0.95 });
  M.reveal = std({ color: '#141210', roughness: 1 });
  M.glass = [0, 1, 2, 3].map(k => {
    const m = std({ color: '#120E0A', roughness: 0.18, metalness: 0, emissive: '#FFFFFF', emissiveMap: tex(paneCanvas(k)), emissiveIntensity: 1.25, envMapIntensity: 0.6 });
    m.userData.uv = 'local'; m.userData.cast = false; return m;
  });
  M.glassN = M.glass.map(g => { const m = g.clone(); m.emissiveIntensity = 0.62; m.userData.uv = 'local'; m.userData.cast = false; return m; });
  M.glassDark = std({ color: '#121822', roughness: 0.06, metalness: 0.3, envMapIntensity: 1.4 });
  M.glassDark.userData.uv = 'local'; M.glassDark.userData.cast = false;
  M.doorFront = std({ color: '#15171A', roughness: 0.3, metalness: 0.1 });
  M.doorRear = std({ color: '#E9E5DC', roughness: 0.5 });
  M.cap = std({ color: '#BDB5A6', roughness: 0.85 });
  M.pot = std({ color: '#8F5536', roughness: 0.8 });
  M.lawn = std({ map: tex(lawnCanvas(), 2), roughness: 1, envMapIntensity: 0.3 });
  M.lawnN = std({ map: M.lawn.map, color: '#6F6F6F', roughness: 1, envMapIntensity: 0.2 });
  M.paving = std({ map: tex(pavingCanvas(), 1.2), roughness: 0.85 });
  M.pavingN = std({ map: M.paving.map, color: '#6A6A6A', roughness: 0.95 });
  M.fence = std({ map: tex(boardsCanvas(), 1), roughness: 0.95 });
  M.fenceN = std({ map: M.fence.map, color: '#7A7A7A', roughness: 0.95 });
  M.post = std({ color: '#34281F', roughness: 0.9 });
  M.gravel = std({ color: '#55524D', roughness: 0.95 });
  M.ground = std({ color: '#191817', roughness: 1 });
  M.road = std({ color: '#151517', roughness: 0.75, metalness: 0.1 });
  M.kerb = std({ color: '#3B3936', roughness: 0.9 });
  M.render = std({ map: tex(renderCanvas(), 2), color: '#FFFFFF', roughness: 0.9 });
  M.block = std({ map: tex(blockCanvas(), 0.9), roughness: 0.95 });
  M.plaster = std({ color: '#D6BFA9', roughness: 0.95 });
  M.cladding = std({ map: tex(claddingCanvas(), 1.2), roughness: 0.5, metalness: 0.35, envMapIntensity: 1.1 });
  M.floor = std({ color: '#CFC6B7', roughness: 0.55 });
  M.membrane = std({ color: '#2E2F32', roughness: 0.85 });
  M.extMembrane = std({ color: '#2E2F32', roughness: 0.85 });
  M.trim = std({ color: GOLD, metalness: 1, roughness: 0.28, emissive: '#6B4E16', emissiveIntensity: 0.55, envMapIntensity: 1.6 });
  M.trimTimber = new THREE.Color('#8A6A48');
  M.trimGold = new THREE.Color(GOLD);
  M.bronze = std({ color: '#3A3029', metalness: 0.65, roughness: 0.38 });
  M.glassExt = std({ color: '#FFE9C9', transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.15, envMapIntensity: 1.8, depthWrite: false });
  M.glassExt.userData.cast = false;
  M.lanternGlass = std({ color: '#FFF0D8', emissive: '#FFC27A', emissiveIntensity: 1.4, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  M.lanternGlass.userData.cast = false;
  M.units = std({ color: '#25292A', roughness: 0.45 });
  M.worktop = std({ color: '#EEEBE5', roughness: 0.25 });
  M.brass = std({ color: GOLD, metalness: 1, roughness: 0.3, emissive: '#5A4214', emissiveIntensity: 0.6 });
  M.oak = std({ color: '#A37B52', roughness: 0.6 });
  M.chair = std({ color: '#2D2A27', roughness: 0.6 });
  M.shade = std({ color: '#1B1B1C', metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide });
  M.bulb = new THREE.MeshBasicMaterial({ color: '#FFE6B0' });
  M.doorway = std({ color: '#2A211B', roughness: 1, emissive: '#3C2412', emissiveIntensity: 0.9 });
  M.leaf = std({ color: '#2E4A2B', roughness: 0.9, flatShading: true });
  M.leaf2 = std({ color: '#3B5A31', roughness: 0.9, flatShading: true });
  M.leafD = std({ color: '#243B20', roughness: 0.9, flatShading: true });
  M.leafN = std({ color: '#1C2A1B', roughness: 1, flatShading: true });
  M.plant = std({ color: '#3F6236', roughness: 0.85, flatShading: true });
  M.plant2 = std({ color: '#4E7340', roughness: 0.85, flatShading: true });
  M.trunk = std({ color: '#3A2D22', roughness: 1 });
  M.planter = std({ color: '#B8AC98', roughness: 0.85 });
  M.bollard = std({ color: '#1C1C1D', roughness: 0.5, metalness: 0.4 });
  M.lampHead = new THREE.MeshBasicMaterial({ color: '#FFE2AE' });
  M.concrete = std({ color: '#8E8A83', roughness: 0.95 });
  M.trench = std({ color: '#100C09', roughness: 1 });
  M.spoil = std({ color: '#4A3828', roughness: 1, flatShading: true });
  M.steel = std({ color: '#8E3B26', roughness: 0.55, metalness: 0.35 });
  M.timber = std({ color: '#B8935F', roughness: 0.85 });
  M.cable = new THREE.MeshBasicMaterial({ color: GOLD_HI, transparent: true, opacity: 1, toneMapped: false });
  M.mark = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 1, toneMapped: false });
  M.peg = std({ color: '#B8935F', roughness: 0.8 });
  M.string = new THREE.MeshBasicMaterial({ color: '#F2EEE6' });
  M.heras = std({ color: '#AEB4B8', metalness: 0.7, roughness: 0.4 });
  M.herasMesh = std({ map: tex(meshCanvas(), 0.5, false), color: '#C8CDD0', transparent: true, side: THREE.DoubleSide, depthWrite: false, metalness: 0.4, roughness: 0.5 });
  M.herasMesh.userData.cast = false;
  M.foot = std({ color: '#3A3A3A', roughness: 0.9 });
  M.skip = std({ color: '#C9A04F', metalness: 0.35, roughness: 0.48 });
  M.skipDark = std({ color: '#2A2620', roughness: 0.9 });
  M.rubble = ['#77726B', '#8B5E45', '#5E5953', '#9A948A'].map(c => std({ color: c, roughness: 1, flatShading: true }));
  M.hivis = std({ color: '#D8EA3E', emissive: '#4D5A0A', emissiveIntensity: 0.6, roughness: 0.7 });
  M.reflect = std({ color: '#DADADA', roughness: 0.4, metalness: 0.3 });
  M.trousers = std({ color: '#262A33', roughness: 0.85 });
  M.skin = std({ color: '#C79878', roughness: 0.8 });
  M.hat = std({ color: '#F4F3EF', roughness: 0.35 });
  M.boot = std({ color: '#151515', roughness: 0.8 });
  M.mud = std({ map: tex(mudCanvas(), 0, true), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  M.mud.userData.uv = 'local';
  M.ghost = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false });
  M.ghostLine = new THREE.LineBasicMaterial({ color: GOLD_HI, transparent: true, opacity: 0.8, toneMapped: false });
  M.ghostDash = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const glowTex = tex(glowCanvas(), 0, true);
  const glowMat = (c, o = 1) => new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  M.spill = new THREE.MeshBasicMaterial({ map: tex(spillCanvas(), 0, true), color: '#FFB868', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  M.spill.userData.uv = 'local';
  M.contact = new THREE.MeshBasicMaterial({ map: tex(shadowCanvas(), 0, false), color: '#000000', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  M.contact.userData.uv = 'local';
  const sprite = (k, px) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(badgeCanvas(k), 0, true), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false }));
    s.renderOrder = 20; s.userData.px = px; s.visible = false; scene.add(s); return s;
  };
  const handle = sprite('arrows', HANDLE_PX), handleRing = sprite('ring', HANDLE_PX);
  const loftPlus = sprite('plus', PLUS_PX), loftRing = sprite('ring', PLUS_PX);
  const upperPlus = sprite('plus', PLUS_PX), upperRing = sprite('ring', PLUS_PX);

  /* ---------- Labels (HTML) ---------- */
  function mkLabel(tag, text, onClick) {
    const el = document.createElement(tag); el.className = 'h3d-label'; el.textContent = text;
    if (tag === 'button') { el.type = 'button'; el.tabIndex = -1; el.addEventListener('click', onClick); }
    el.setAttribute('aria-hidden', 'true');
    layer.appendChild(el);
    return { el, on: false, w: 0, h: 0, btn: tag === 'button' };
  }
  const labels = {
    ext: mkLabel('span', 'Drag to extend'),
    loft: mkLabel('button', 'Add a loft', () => userToggle('loft')),
    upper: mkLabel('button', 'Add a floor', () => userToggle('upper'))
  };

  /* ---------- World build (per house type and mode) ---------- */
  const world = new THREE.Group(); scene.add(world);
  let X = {}, H = {}, U = {}, L = {}, S = {}, G = {}, pickables = [], rayTargets = [], lastHip = -1, lastD = -1;

  function disposeGroup(g) {
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    while (g.children.length) g.remove(g.children[0]);
  }
  function dyn(mat, pick, parent, shadow = true) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    m.castShadow = shadow && !mat.transparent; m.receiveShadow = shadow; m.visible = false;
    if (pick) m.userData.pick = pick;
    parent.add(m); return m;
  }
  /* Rebuilds a box mesh in place (world UVs), only when its size actually changed */
  function setBox(m, x0, x1, y0, y1, z0, z1) {
    const k = x0.toFixed(3) + ',' + x1.toFixed(3) + ',' + y0.toFixed(3) + ',' + y1.toFixed(3) + ',' + z0.toFixed(3) + ',' + z1.toFixed(3);
    const ok = x1 - x0 > 0.002 && y1 - y0 > 0.002 && z1 - z0 > 0.002;
    m.visible = ok;
    if (!ok || m.userData.k === k) return;
    m.userData.k = k;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (m.material.userData.uv !== 'local') worldUV(g);
    m.geometry.dispose(); m.geometry = g;
  }

  function buildWorld() {
    disposeGroup(world);
    T = TYPES[state.type];
    X = {}; H = {}; U = {}; L = {}; S = {}; G = {}; lastHip = -1; lastD = -1;
    const W = T.W, D = T.D, Lg = gardenLength();
    const heroBrick = T.brick === 'red' ? M.brickRed : M.brickStock;
    const nBrick = T.brick === 'red' ? M.brickNR : M.brickN;

    /* Ground, street and the houses opposite */
    const env = new Batch();
    env.geo(M.ground, plane(500, 500).rotateX(-Math.PI / 2), 0, -0.02, 0);
    const zS = -D - 2.6;
    env.box(M.kerb, 140, 0.06, 2, 0, 0.03, zS - 1);
    env.box(M.road, 140, 0.02, 6.4, 0, 0.01, zS - 5.2);
    env.box(M.kerb, 140, 0.06, 2, 0, 0.03, zS - 9.4);
    env.flush(world, { cast: false });
    const opp = new THREE.Group(); const ob = new Batch(); const Ropp = rand(41);
    const Wo = 5.4, Do = 9;
    for (let i = -6; i <= 6; i++) {
      const cx = i * Wo + 1.3;
      if (i % 2 === 0) chimney(ob, cx + Wo / 2, -Do / 2 - 0.3, 1, 0.65, 4, M.brickFar, M.sillN, M.archN);
      houseShell(ob, cx, { W: Wo, D: Do }, i === -6 ? 'gable' : 'party', i === 6 ? 'gable' : 'party', 1, 1, {
        brick: M.brickFar, slate: M.slateN, ridge: M.ridgeN, band: M.bandN, frame: M.frameN, sill: M.sillN, arch: M.archN,
        glass: i => (Ropp() < 0.3 ? M.glassN[i] : M.glassDark), facade: { front: FACADES.terrace.front, rear: [], left: [], right: [] }, lowDetail: true
      });
    }
    ob.flush(opp, { shadow: false });
    opp.rotation.y = Math.PI; opp.position.z = zS - 10.4 - 2.4 - Do;
    world.add(opp);
    // Street lamps along both pavements
    [[-9, zS - 1.5], [8, zS - 1.5], [-15, zS - 9], [1, zS - 9], [17, zS - 9]].forEach(([x, z]) => {
      const lb = new Batch();
      lb.geo(M.bollard, new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8), x, 2.2, z);
      lb.box(M.bollard, 0.5, 0.12, 0.22, x, 4.42, z);
      lb.flush(world, { shadow: false });
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.14), M.lampHead); bulb.position.set(x, 4.34, z); world.add(bulb);
      const gl = new THREE.Sprite(glowMat('#FFD9A0', 0.9)); gl.position.set(x, 4.2, z); gl.scale.setScalar(3.2); world.add(gl);
    });

    /* Neighbours: darker, quieter massing */
    const nb = new Batch(), Rn = rand(state.type.length * 97);
    const nOpts = (mirror) => ({
      brick: nBrick, slate: M.slateN, ridge: M.ridgeN, band: M.bandN, frame: M.frameN, sill: M.sillN, arch: M.archN,
      glass: i => (Rn() < 0.38 ? M.glassN[i] : M.glassDark), facade: mirrorFacade(FACADES[state.type], mirror)
    });
    if (state.type === 'terrace') {
      for (let k = -3; k <= 3; k++) {
        if (!k) continue;
        houseShell(nb, k * W, T, k === -3 ? 'gable' : 'party', k === 3 ? 'gable' : 'party', 1, 1, nOpts(false));
      }
      for (let k = -3; k <= 3; k++) chimney(nb, (k + 0.5) * W, -D / 2 - 0.3, 1.0, 0.65, 4, M.brickN, M.cap, M.pot);
    } else if (state.type === 'semi') {
      houseShell(nb, W, T, 'party', 'hip', 1, 1, nOpts(true));
    }
    nb.flush(world);

    /* Neighbour gardens and fences */
    const gb = new Batch();
    const lawnX0 = -W / 2 - T.padL, lawnX1 = W / 2 + T.padR;
    if (state.type === 'terrace') {
      for (let k = -3; k <= 3; k++) if (k) gb.geo(M.lawnN, plane(W, Lg).rotateX(-Math.PI / 2), k * W, 0.005, Lg / 2);
      for (let k = 1; k <= 3; k++) { fenceRun(gb, W / 2 + k * W, 0, Lg, true); fenceRun(gb, -W / 2 - k * W, 0, Lg, true); }
      fenceRunX(gb, Lg, -3.5 * W, 3.5 * W, false);
    } else if (state.type === 'semi') {
      gb.geo(M.lawnN, plane(W, Lg).rotateX(-Math.PI / 2), W, 0.005, Lg / 2);
      fenceRun(gb, 1.5 * W, 0, Lg, true);
      fenceRun(gb, lawnX0, -2, Lg, false);
      fenceRunX(gb, Lg, lawnX0, 1.5 * W, false);
      gb.geo(M.paving, plane(T.padL, D + 2.6).rotateX(-Math.PI / 2), -W / 2 - T.padL / 2, 0.012, -D / 2 - 1.3);
      gb.geo(M.pavingN, plane(T.padL, D + 2.6).rotateX(-Math.PI / 2), 1.5 * W + T.padL / 2, 0.012, -D / 2 - 1.3);
      gb.geo(M.lawnN, plane(12, Lg + 2).rotateX(-Math.PI / 2), lawnX0 - 6.05, 0.005, Lg / 2 - 1);
      gb.geo(M.leafN, new THREE.BoxGeometry(0.7, 1.5, Lg - 1).translate(0, 0.75, 0), lawnX0 - 0.45, 0, Lg / 2 + 0.2);
    } else {
      fenceRun(gb, lawnX0, -3, Lg, false); fenceRun(gb, lawnX1, -3, Lg, false);
      fenceRunX(gb, Lg, lawnX0, lawnX1, false);
      gb.geo(M.lawnN, plane(12, Lg + 2).rotateX(-Math.PI / 2), lawnX0 - 6.05, 0.005, Lg / 2 - 1);
      gb.geo(M.lawnN, plane(12, Lg + 2).rotateX(-Math.PI / 2), lawnX1 + 6.05, 0.005, Lg / 2 - 1);
      gb.geo(M.paving, plane(T.padL, D + 2.6).rotateX(-Math.PI / 2), -W / 2 - T.padL / 2, 0.012, -D / 2 - 1.3);
      gb.geo(M.paving, plane(T.padR, D + 2.6).rotateX(-Math.PI / 2), W / 2 + T.padR / 2, 0.012, -D / 2 - 1.3);
    }
    // Front garden path and low wall
    gb.geo(M.pavingN, plane(lawnX1 - lawnX0 + 0.01, 2.5).rotateX(-Math.PI / 2), (lawnX0 + lawnX1) / 2, 0.012, -D - 1.25);
    gb.box(heroBrick, lawnX1 - lawnX0, 0.6, 0.22, (lawnX0 + lawnX1) / 2, 0.3, -D - 2.5);
    // Hero lawn
    gb.geo(M.lawn, plane(lawnX1 - lawnX0, Lg).rotateX(-Math.PI / 2), (lawnX0 + lawnX1) / 2, 0.006, Lg / 2);
    // Planting along the borders, a tree and a few garden lights
    const Rg = rand(53);
    const shrub = (x, z, s, m) => gb.geo(m, new THREE.IcosahedronGeometry(s, 0).scale(1, 0.75, 1), x, s * 0.55, z, Rg() * 3);
    shrub(lawnX0 + 0.45, Lg - 2.3, 0.5, M.leaf2); shrub(lawnX0 + 2.2, Lg - 0.5, 0.5, M.leaf);
    shrub(lawnX0 + 0.45, Lg - 3.9, 0.42, M.leaf); shrub(0.2, Lg - 0.5, 0.55, M.leaf2);
    const tx = lawnX1 - 1.15, tz = Lg - 1.5;
    gb.geo(M.trunk, new THREE.CylinderGeometry(0.09, 0.16, 2.8, 7), tx, 1.4, tz);
    gb.put(M.trunk, beamGeo(new THREE.Vector3(tx, 2.0, tz), new THREE.Vector3(tx + 0.55, 3.0, tz + 0.2), 0.08));
    gb.put(M.trunk, beamGeo(new THREE.Vector3(tx, 2.2, tz), new THREE.Vector3(tx - 0.5, 3.1, tz - 0.25), 0.08));
    [[0, 3.35, 0, 0.95], [0.7, 3.05, 0.3, 0.78], [-0.65, 3.1, -0.25, 0.8], [0.2, 3.95, -0.15, 0.75], [-0.3, 3.75, 0.4, 0.7], [0.45, 3.7, -0.5, 0.68], [-0.15, 2.75, 0.55, 0.6]].forEach(([dx, y, dz, r], i) =>
      gb.geo([M.leaf, M.leaf2, M.leafD][i % 3], new THREE.IcosahedronGeometry(r, 1), tx + dx, y, tz + dz, i));
    gb.flush(world);
    const lights = [[lawnX0 + 0.25, 4.2], [lawnX0 + 0.25, 7.6], [lawnX0 + 0.25, Lg - 1.2]];
    lights.forEach(([x, z]) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 8), M.bollard); b.position.set(x, 0.225, z); world.add(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), M.lampHead); c.position.set(x, 0.43, z); world.add(c);
      const gl = new THREE.Sprite(glowMat('#FFC27A', 0.7)); gl.position.set(x, 0.42, z); gl.scale.setScalar(0.9); world.add(gl);
    });

    /* The customer's house */
    H.group = new THREE.Group(); world.add(H.group);
    const hb = new Batch(), rearGF = new Batch();
    const heroOpts = {
      brick: heroBrick, slate: M.slate, ridge: M.ridge, band: M.band, frame: M.frame, sill: M.sill, arch: T.brick === 'red' ? M.archStone : M.arch,
      glass: i => M.glass[i], facade: FACADES[state.type], rearGF, skipRoof: true, halos: []
    };
    houseShell(hb, 0, T, T.sides[0], T.sides[1], 1, 1, heroOpts);
    if (state.type === 'terrace') { /* stacks are shared, built with the neighbours */ }
    else if (state.type === 'semi') chimney(hb, W / 2, -D / 2 - 0.3, 1.0, 0.65, 4, heroBrick, M.cap, M.pot);
    else { chimney(hb, -W / 2 + 0.5, -D / 2, 0.75, 0.6, 2, heroBrick, M.cap, M.pot); chimney(hb, W / 2 - 0.5, -D / 2, 0.75, 0.6, 2, heroBrick, M.cap, M.pot); }
    hb.flush(H.group);
    H.rearGF = new THREE.Group(); H.group.add(H.rearGF); rearGF.flush(H.rearGF);
    const cs = new THREE.Mesh(plane(W + 1.1, D + 1.1).rotateX(-Math.PI / 2), M.contact); cs.position.set(0, 0.02, -D / 2); cs.renderOrder = 1; H.group.add(cs);
    const haloMat = glowMat('#FFB46A', 0.16);
    heroOpts.halos.forEach(h => { const g = new THREE.Sprite(haloMat); g.position.set(h.x, h.y, h.z); g.scale.setScalar(h.s); (h.gf ? H.rearGF : H.group).add(g); });
    H.roof = new THREE.Group(); H.group.add(H.roof);
    H.roofMesh = new THREE.Mesh(new THREE.BufferGeometry(), M.slate); H.roofMesh.castShadow = H.roofMesh.receiveShadow = true;
    H.roofMesh.userData.pick = 'roof'; H.roof.add(H.roofMesh);
    H.roofTrim = new THREE.Group(); H.roof.add(H.roofTrim);
    if (state.type === 'semi') {
      // Brick gable that grows when the hip becomes a gable for the loft
      const g = triGeo([[-W / 2, 0, -D], [-W / 2, 0, 0], [-W / 2, RIDGE - EAVES, -D / 2]]);
      g.translate(0, EAVES, 0); worldUV(g); g.translate(0, -EAVES, 0);
      H.gable = new THREE.Mesh(g, heroBrick); H.gable.position.y = EAVES; H.gable.castShadow = H.gable.receiveShadow = true;
      H.group.add(H.gable);
    }

    buildGardenDynamic(Lg);
    buildExtension();
    buildUpper();
    buildLoft();
    buildHints();
    if (state.build) buildSite();

    pickables = []; rayTargets = [];
    world.traverse(o => { if (o.isMesh) { rayTargets.push(o); if (o.userData.pick) pickables.push(o); } });
    const sc = Math.max(W + 10, 22);
    key.position.copy(sunDir).multiplyScalar(30).add(new THREE.Vector3(0, 0, 2));
    key.target.position.set(0, 0, 2);
    Object.assign(key.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: 70 });
    key.shadow.camera.updateProjectionMatrix();
    rim.position.set(14, 12, -14);
    sky.material.uniforms.uSun.value.copy(sunDir);
  }

  function gardenLength() { return Math.max(12.5, state.maxDepth + 6.5); }
  function mirrorFacade(f, m) {
    if (!m) return f;
    const flip = l => l.map(w => Object.assign({}, w, { u: -w.u }));
    return { rear: flip(f.rear), front: flip(f.front), left: flip(f.right), right: flip(f.left) };
  }

  /* House body, string course, roof, windows and doors. sides: 'party' | 'hip' | 'gable'. */
  function houseShell(B, cx, t, sideL, sideR, hl, hr, o) {
    const W = t.W, D = t.D;
    B.box(o.brick, W, EAVES, D, cx, EAVES / 2, -D / 2);
    if (!o.lowDetail) {
      B.box(M.plinth, W + 0.04, 0.32, D + 0.04, cx, 0.16, -D / 2);
      B.box(o.band, W + 0.03, 0.11, D + 0.03, cx, GF + 0.06, -D / 2);
    }
    [[sideL, -1], [sideR, 1]].forEach(([side, s]) => {
      if (side !== 'gable') return;
      const x = cx + s * W / 2;
      B.put(o.brick, triGeo(s < 0 ? [[x, EAVES, -D], [x, EAVES, 0], [x, RIDGE, -D / 2]] : [[x, EAVES, 0], [x, EAVES, -D], [x, RIDGE, -D / 2]]));
    });
    if (!o.skipRoof) roofParts(B, cx, W, D, sideL, sideR, hl, hr, o.slate, o.ridge);
    const faces = {
      rear: { x: cx, z: 0, ry: 0 }, front: { x: cx, z: -D, ry: Math.PI },
      left: { x: cx - W / 2, z: -D / 2, ry: -Math.PI / 2 }, right: { x: cx + W / 2, z: -D / 2, ry: Math.PI / 2 }
    };
    Object.keys(faces).forEach(fk => {
      (o.facade[fk] || []).forEach(w => {
        if (fk === 'left' && sideL === 'party') return;
        if (fk === 'right' && sideR === 'party') return;
        const bb = w.gf && o.rearGF && fk === 'rear' ? o.rearGF : B;
        const glass = o.glass(w.lit || 0);
        if (o.halos && glass !== M.glassDark) {
          const f = faces[fk], y = w.k === 'win' ? w.y + w.h / 2 : w.h * 0.6, v = new THREE.Vector3(w.u, y, 0.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.ry);
          o.halos.push({ x: f.x + v.x, y: v.y, z: f.z + v.z, s: Math.max(w.w, w.h) * 1.7, gf: !!(w.gf && fk === 'rear') });
        }
        if (w.k === 'win') sash(bb, faces[fk], w.u, w.y, w.w, w.h, glass, o);
        else if (w.k === 'french') sash(bb, faces[fk], w.u, 0.08, w.w, w.h, glass, o, true);
        else door(bb, faces[fk], w.u, w.w, w.h, glass, o, w);
      });
    });
  }
  function sash(B, f, u, y, w, h, glass, o, french) {
    const fr = o.frame, t = 0.075, dp = 0.09;
    B.face(M.reveal, box(w + 0.05, h + 0.04, 0.03), f, u, y + h / 2, 0.012);
    B.face(glass, plane(w - 0.08, h - 0.08), f, u, y + h / 2, 0.035);
    B.face(fr, box(w, t, dp), f, u, y + t / 2, dp / 2);
    B.face(fr, box(w, t, dp), f, u, y + h - t / 2, dp / 2);
    B.face(fr, box(t, h, dp), f, u - w / 2 + t / 2, y + h / 2, dp / 2);
    B.face(fr, box(t, h, dp), f, u + w / 2 - t / 2, y + h / 2, dp / 2);
    if (french) {
      B.face(fr, box(0.07, h, dp), f, u, y + h / 2, dp / 2);
      B.face(fr, box(w, 0.06, dp * 0.8), f, u, y + h * 0.42, dp / 2);
    } else if (!o.lowDetail) {
      B.face(fr, box(w, 0.06, dp * 0.9), f, u, y + h * 0.52, dp / 2);
      B.face(fr, box(0.035, h, 0.05), f, u, y + h / 2, 0.05);
    }
    if (!french) B.face(o.sill, box(w + 0.2, 0.07, 0.16), f, u, y - 0.035, 0.07);
    B.face(o.arch, box(w + 0.24, 0.24, 0.025), f, u, y + h + 0.12, 0.012);
  }
  function door(B, f, u, w, h, glass, o, d) {
    const t = 0.08, dp = 0.1, lw = w - 2 * t, lh = h - t, leaf = d.solid ? M.doorFront : M.doorRear;
    B.face(M.reveal, box(w + 0.05, h + 0.02, 0.03), f, u, h / 2, 0.012);
    B.face(o.frame, box(t, h, dp), f, u - w / 2 + t / 2, h / 2, dp / 2);
    B.face(o.frame, box(t, h, dp), f, u + w / 2 - t / 2, h / 2, dp / 2);
    B.face(o.frame, box(w, t, dp), f, u, h - t / 2, dp / 2);
    if (d.solid) {
      B.face(leaf, box(lw, lh, 0.05), f, u, lh / 2, 0.03);
      B.face(M.brass, box(0.12, 0.12, 0.03), f, u, lh * 0.62, 0.065);
    } else {
      B.face(leaf, box(lw, lh * 0.46, 0.05), f, u, lh * 0.23, 0.03);
      B.face(glass, plane(lw, lh * 0.54), f, u, lh * 0.73, 0.03);
      B.face(leaf, box(lw, 0.07, 0.06), f, u, lh * 0.46, 0.035);
    }
    if (d.fan) {
      B.face(glass, plane(w - 0.06, 0.38), f, u, h + 0.23, 0.03);
      B.face(o.frame, box(w, 0.07, dp), f, u, h + 0.43, dp / 2);
      B.face(o.arch, box(w + 0.24, 0.24, 0.025), f, u, h + 0.58, 0.012);
    } else B.face(o.arch, box(w + 0.24, 0.24, 0.025), f, u, h + 0.12, 0.012);
    B.face(o.sill, box(w + 0.3, 0.12, 0.32), f, u, 0.06, 0.16);
  }
  function chimney(B, x, z, wx, wz, pots, brick, cap, pot) {
    const yb = 7.2, yt = RIDGE + 1.15;
    B.box(brick, wx, yt - yb, wz, x, (yb + yt) / 2, z);
    B.box(cap, wx + 0.14, 0.1, wz + 0.14, x, yt + 0.05, z);
    for (let i = 0; i < pots; i++) {
      const px = x + (pots > 1 ? (i / (pots - 1) - 0.5) * (wx - 0.3) : 0);
      B.geo(pot, new THREE.CylinderGeometry(0.1, 0.13, 0.42, 8), px, yt + 0.31, z);
    }
  }
  /* Slopes, ridge and hip tiles, fascias and soffits */
  function roofParts(B, cx, W, D, sideL, sideR, hl, hr, slate, ridgeMat, trimTarget) {
    const r = roofGeo(cx, W, D, sideL, sideR, hl, hr);
    if (trimTarget) trimTarget.geo = r.geo; else B.put(slate, r.geo);
    const tb = trimTarget ? trimTarget.batch : B;
    const v = a => new THREE.Vector3(a[0], a[1], a[2]);
    if (r.rr - r.rl > 0.02) tb.put(ridgeMat, beamGeo(v(r.RL).setY(RIDGE + 0.03), v(r.RR).setY(RIDGE + 0.03), 0.17));
    if (r.hL > 0.002) { tb.put(ridgeMat, beamGeo(v(r.A), v(r.RL), 0.13)); tb.put(ridgeMat, beamGeo(v(r.Dd), v(r.RL), 0.13)); }
    if (r.hR > 0.002) { tb.put(ridgeMat, beamGeo(v(r.B), v(r.RR), 0.13)); tb.put(ridgeMat, beamGeo(v(r.C), v(r.RR), 0.13)); }
    const len = r.xr - r.xl, mx = (r.xl + r.xr) / 2;
    tb.box(M.fascia, len, 0.2, 0.09, mx, r.yE - 0.07, r.zR + 0.03);
    tb.box(M.fascia, len, 0.2, 0.09, mx, r.yE - 0.07, r.zF - 0.03);
    tb.box(M.soffit, len, 0.03, OH, mx, r.yE - 0.15, OH / 2);
    tb.box(M.soffit, len, 0.03, OH, mx, r.yE - 0.15, -D - OH / 2);
    [[r.hL, r.xl, -1], [r.hR, r.xr, 1]].forEach(([h, x, s]) => {
      if (h < 0.002) return;
      tb.box(M.fascia, 0.09, 0.2, D + 2 * OH, x + s * 0.03, r.yE - 0.07, -D / 2);
      const w = Math.abs(x - (cx + s * W / 2));
      tb.box(M.soffit, w, 0.03, D, x - s * w / 2, r.yE - 0.15, -D / 2);
    });
  }
  function heroRoof(hip) {
    const W = T.W, D = T.D;
    const tb = new Batch(), tt = { batch: tb, geo: null };
    roofParts(null, 0, W, D, T.sides[0], T.sides[1], T.sides[0] === 'hip' ? hip : 1, T.sides[1] === 'hip' ? hip : 1, M.slate, M.ridge, tt);
    H.roofMesh.geometry.dispose(); H.roofMesh.geometry = tt.geo;
    disposeGroup(H.roofTrim); tb.flush(H.roofTrim);
    H.roofTrim.children.forEach(m => { m.userData.pick = 'roof'; });
  }

  function fenceRun(B, x, z0, z1, muted) {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    B.box(muted ? M.fenceN : M.fence, 0.035, 1.65, len, x, 0.15 + 0.825, zc);
    B.box(M.gravel, 0.05, 0.15, len, x, 0.075, zc);
    B.box(M.post, 0.05, 0.05, len, x, 1.82, zc);
    for (let z = z1; z > z0 - 0.01; z -= 1.8) B.box(M.post, 0.1, 1.86, 0.1, x, 0.93, z);
  }
  function fenceRunX(B, z, x0, x1, muted) {
    const len = x1 - x0, xc = (x0 + x1) / 2;
    B.box(muted ? M.fenceN : M.fence, len, 1.65, 0.035, xc, 0.15 + 0.825, z);
    B.box(M.gravel, len, 0.15, 0.05, xc, 0.075, z);
    B.box(M.post, len, 0.05, 0.05, xc, 1.82, z);
    for (let x = x0; x < x1 + 0.01; x += 1.8) B.box(M.post, 0.1, 1.86, 0.1, x, 0.93, z);
  }

  /* Boundary fences next to the extension start where the extension ends; the patio follows the glass */
  function buildGardenDynamic(Lg) {
    const W = T.W;
    G.group = new THREE.Group(); world.add(G.group);
    G.fences = [];
    const sides = state.type === 'terrace' ? [-W / 2, W / 2] : state.type === 'semi' ? [W / 2] : [];
    sides.forEach(x => {
      const f = { x, board: dyn(M.fence, null, G.group), gravel: dyn(M.gravel, null, G.group), cap: dyn(M.post, null, G.group), posts: [] };
      for (let z = Lg; z > -0.01; z -= 1.8) {
        const p = new THREE.Mesh(box(0.1, 1.86, 0.1), M.post); p.position.set(x, 0.93, z); p.castShadow = true; G.group.add(p); f.posts.push(p);
      }
      G.fences.push(f);
    });
    G.patio = dyn(M.paving, null, G.group);
    G.Lg = Lg;
  }

  /* ---------- Extension ---------- */
  function buildExtension() {
    const W = T.W;
    X.group = new THREE.Group(); world.add(X.group);
    X.plinth = dyn(M.plinth, 'ext', X.group);
    X.floor = dyn(M.floor, null, X.group);
    X.wallL = dyn(M.render, 'ext', X.group);
    X.wallR = dyn(M.render, 'ext', X.group);
    X.header = dyn(M.render, 'ext', X.group);
    X.back = dyn(M.render, null, X.group);
    X.doorway = dyn(M.doorway, null, X.group, false);
    X.roof = dyn(M.render, 'extroof', X.group);
    X.membrane = dyn(M.extMembrane, 'extroof', X.group);
    X.trim = [dyn(M.trim, 'extroof', X.group), dyn(M.trim, 'extroof', X.group), dyn(M.trim, 'extroof', X.group)];
    // Bi-fold doors: slim bronze frames and glass across the full width
    X.end = new THREE.Group(); X.group.add(X.end);
    const inner = W - 2 * WALL, gh = 2.47, y0 = 0.15, n = Math.max(3, Math.round(inner / 1.05)), fb = new Batch();
    fb.box(M.bronze, inner, 0.06, 0.12, 0, y0 + gh - 0.03, -0.12);
    fb.box(M.bronze, inner, 0.05, 0.14, 0, y0 + 0.025, -0.12);
    for (let i = 0; i <= n; i++) fb.box(M.bronze, 0.055, gh, 0.1, -inner / 2 + i * inner / n, y0 + gh / 2, -0.12);
    X.endFrames = new THREE.Group(); X.end.add(X.endFrames); fb.flush(X.endFrames, { pick: 'ext' });
    X.glass = new THREE.Mesh(plane(inner, gh), M.glassExt); X.glass.position.set(0, y0 + gh / 2, -0.12); X.glass.userData.pick = 'ext'; X.glass.renderOrder = 5;
    X.endFrames.add(X.glass);
    X.lantern = new THREE.Group(); X.group.add(X.lantern);
    X.lanternParts = new THREE.Group(); X.lantern.add(X.lanternParts);
    X.lanternGlow = new THREE.Sprite(glowMat('#FFC27A', 0.55)); X.lantern.add(X.lanternGlow);
    // Inside: kitchen run, tall units, island with pendants, dining table and a plant
    X.units = new THREE.Group(); X.group.add(X.units);
    X.unitBase = dyn(M.units, null, X.units); X.unitTop = dyn(M.worktop, null, X.units); X.unitBrass = dyn(M.brass, null, X.units, false);
    X.tall = dyn(M.units, null, X.units);
    X.island = new THREE.Group(); X.group.add(X.island);
    X.islandBase = dyn(M.units, null, X.island); X.islandTop = dyn(M.worktop, null, X.island); X.islandKick = dyn(M.brass, null, X.island, false);
    X.pendants = [0, 1].map(() => pendant(X.island));
    X.table = new THREE.Group(); X.group.add(X.table);
    {
      const tb = new Batch();
      tb.box(M.oak, 1.7, 0.05, 0.92, 0, 0.75, 0);
      [[-0.75, -0.38], [0.75, -0.38], [-0.75, 0.38], [0.75, 0.38]].forEach(([x, z]) => tb.box(M.oak, 0.06, 0.72, 0.06, x, 0.36, z));
      [[-0.45, -0.68, 0], [0.45, -0.68, 0], [-0.45, 0.68, Math.PI], [0.45, 0.68, Math.PI]].forEach(([x, z, r]) => {
        const s = z < 0 ? -1 : 1;
        tb.box(M.chair, 0.44, 0.05, 0.42, x, 0.46, z); tb.box(M.chair, 0.44, 0.45, 0.05, x, 0.7, z + s * 0.2);
        tb.box(M.chair, 0.04, 0.44, 0.04, x - 0.18, 0.22, z); tb.box(M.chair, 0.04, 0.44, 0.04, x + 0.18, 0.22, z);
      });
      tb.flush(X.table);
      X.tablePendant = pendant(X.table, true);
      X.tablePendant.position.set(0, 0, 0);
    }
    X.plant = plantGroup(); X.group.add(X.plant);
    X.patioPlants = new THREE.Group(); X.group.add(X.patioPlants);
    [[-0.6, 0.55, 0.8], [0.6, 0.45, 0.65]].forEach(([s, h, r]) => { const p = plantGroup(r); p.position.x = s; X.patioPlants.add(p); });
    X.spill = new THREE.Mesh(plane(1, 1).rotateX(-Math.PI / 2), M.spill); X.spill.renderOrder = 3; X.group.add(X.spill);
    X.contact = new THREE.Mesh(plane(1, 1).rotateX(-Math.PI / 2), M.contact); X.contact.renderOrder = 1; X.group.add(X.contact);
  }
  function pendant(parent, globe) {
    const g = new THREE.Group(); parent.add(g);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), M.bronze); g.add(cord);
    const shade = new THREE.Mesh(globe ? new THREE.SphereGeometry(0.15, 16, 10) : new THREE.CylinderGeometry(0.05, 0.17, 0.2, 18, 1, true), globe ? M.bulb : M.shade);
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.bulb); g.add(bulb);
    const glow = new THREE.Sprite(glowMat('#FFC98A', 0.8)); glow.scale.setScalar(globe ? 1.0 : 0.75); g.add(glow);
    g.userData = { cord, shade, bulb, glow, globe };
    return g;
  }
  function plantGroup(scale = 1) {
    const g = new THREE.Group(), b = new Batch();
    b.geo(M.planter, new THREE.CylinderGeometry(0.2 * scale, 0.16 * scale, 0.42 * scale, 12), 0, 0.21 * scale, 0);
    [[0, 0.75, 0, 0.32], [0.12, 0.62, 0.08, 0.22], [-0.1, 0.9, -0.05, 0.2]].forEach(([x, y, z, r], i) =>
      b.geo(i % 2 ? M.plant2 : M.plant, new THREE.IcosahedronGeometry(r * scale, 0), x * scale, y * scale, z * scale, i));
    b.flush(g); return g;
  }
  function lanternGeo(lw, ll) {
    const b = new Batch(), kh = 0.22, gh = 0.24, ph = 0.42;
    b.box(M.membrane, lw + 0.14, kh, ll + 0.14, 0, kh / 2, 0);
    b.box(M.lanternGlass, lw, gh, ll, 0, kh + gh / 2, 0);
    const y0 = kh + gh, ridge = Math.max(0.05, ll - lw);
    const P = (x, y, z) => [x, y0 + y, z], a = P(-lw / 2, 0, -ll / 2), bb = P(lw / 2, 0, -ll / 2), c = P(lw / 2, 0, ll / 2), d = P(-lw / 2, 0, ll / 2);
    const r1 = P(0, ph, -ridge / 2), r2 = P(0, ph, ridge / 2);
    b.put(M.lanternGlass, triGeo([a, r1, bb, c, r2, d, bb, r1, r2, bb, r2, c, d, r2, r1, d, r1, a]));
    const V = p => new THREE.Vector3(...p);
    [[a, r1], [bb, r1], [c, r2], [d, r2], [r1, r2]].forEach(([p, q]) => b.put(M.bronze, beamGeo(V(p), V(q), 0.04)));
    [[a, bb], [bb, c], [c, d], [d, a]].forEach(([p, q]) => b.put(M.bronze, beamGeo(V(p), V(q), 0.05)));
    for (let i = 1; i < 4; i++) { const z = -ll / 2 + i * ll / 4; b.box(M.bronze, 0.035, gh, 0.035, -lw / 2, kh + gh / 2, z); b.box(M.bronze, 0.035, gh, 0.035, lw / 2, kh + gh / 2, z); }
    return b;
  }

  /* Floor above: a clad box up to the eaves with a big window and gold trim */
  function buildUpper() {
    U.group = new THREE.Group(); U.group.position.y = EXT_H; world.add(U.group);
    U.body = dyn(M.cladding, 'extroof', U.group);
    U.top = dyn(M.extMembrane, 'extroof', U.group);
    U.trim = [dyn(M.trim, 'extroof', U.group), dyn(M.trim, 'extroof', U.group), dyn(M.trim, 'extroof', U.group)];
    U.win = new THREE.Group(); U.group.add(U.win);
    const W = T.W, ww = Math.min(4.4, W * 0.56), wh = 1.6, b = new Batch();
    b.box(M.bronze, ww + 0.12, wh + 0.12, 0.08, 0, 0.35 + wh / 2, 0.02);
    b.box(M.trim, ww + 0.3, 0.06, 0.2, 0, 0.32, 0.08);
    b.flush(U.win, { pick: 'extroof' });
    U.pane = new THREE.Mesh(plane(ww - 0.04, wh - 0.04), M.glass[2]); U.pane.position.set(0, 0.35 + wh / 2, 0.065); U.win.add(U.pane);
    const mull = new THREE.Mesh(box(0.05, wh, 0.06), M.bronze); mull.position.set(ww * 0.18, 0.35 + wh / 2, 0.07); U.win.add(mull);
    U.pane.userData.pick = mull.userData.pick = 'extroof';
  }

  /* Loft: a rear dormer on the back slope with a large window and gold trim */
  function buildLoft() {
    const W = T.W, D = T.D, tanP = (RIDGE - EAVES) / (D / 2);
    const wd = state.type === 'detached' ? W - 2.8 : W - 0.8, zf = -0.45, yb = EAVES + 0.45 * tanP - 0.05, top = RIDGE - 0.3, zb = -D / 2 + 0.25;
    L.group = new THREE.Group(); L.group.position.set(0, yb, zf); world.add(L.group);
    const b = new Batch(), h = top - yb, dz = zf - zb;
    b.box(M.cladding, wd, h, dz, 0, h / 2, -dz / 2);
    b.box(M.membrane, wd + 0.1, 0.06, dz + 0.1, 0, h + 0.03, -dz / 2 + 0.05);
    b.box(M.trim, wd + 0.16, 0.14, 0.06, 0, h + 0.02, 0.08);
    b.box(M.trim, 0.06, 0.14, dz + 0.1, -wd / 2 - 0.05, h + 0.02, -dz / 2 + 0.05);
    b.box(M.trim, 0.06, 0.14, dz + 0.1, wd / 2 + 0.05, h + 0.02, -dz / 2 + 0.05);
    const ww = Math.min(wd * 0.62, 3.4), wh = Math.min(1.45, h - 0.75), wy = 0.42;
    b.box(M.bronze, ww + 0.12, wh + 0.12, 0.08, 0, wy + wh / 2, 0.02);
    b.box(M.bronze, 0.05, wh, 0.06, ww * 0.2, wy + wh / 2, 0.07);
    b.box(M.trim, ww + 0.3, 0.06, 0.2, 0, wy - 0.04, 0.08);
    b.flush(L.group, { pick: 'roof' });
    const pane = new THREE.Mesh(plane(ww - 0.04, wh - 0.04), M.glass[0]); pane.position.set(0, wy + wh / 2, 0.065); pane.userData.pick = 'roof'; L.group.add(pane);
    L.pane = pane;
    L.anchor = new THREE.Vector3(0, (yb + top) / 2, zf);
  }

  /* Hints: the ghost of a 3 m extension and the plus badges */
  function buildHints() {
    const W = T.W;
    G.ghost = new THREE.Group(); world.add(G.ghost);
    const vol = new THREE.Mesh(box(W, EXT_H, 3), M.ghost); vol.position.set(0, EXT_H / 2, 1.5); vol.userData.pick = 'ghost'; G.ghost.add(vol);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box(W, EXT_H, 3)), M.ghostLine); edges.position.copy(vol.position); G.ghost.add(edges);
    const db = new Batch(), dash = 0.32, gap = 0.22;
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / (dash + gap));
      for (let i = 0; i <= n; i++) {
        const t0 = i * (dash + gap) / len, t1 = Math.min(1, t0 + dash / len); if (t0 >= 1) break;
        const ax = lerp(x0, x1, t0), az = lerp(z0, z1, t0), bx = lerp(x0, x1, t1), bz = lerp(z0, z1, t1);
        db.box(M.ghostDash, Math.max(0.08, Math.abs(bx - ax)), 0.02, Math.max(0.08, Math.abs(bz - az)), (ax + bx) / 2, 0.03, (az + bz) / 2);
      }
    };
    run(-W / 2, 3, W / 2, 3); run(-W / 2, 0, -W / 2, 3); run(W / 2, 0, W / 2, 3);
    db.flush(G.ghost, { shadow: false });
    G.ghostVol = vol; G.ghostEdges = edges;
  }

  /* ---------- Build site (Riverside Live) ---------- */
  function buildSite() {
    const W = T.W, d = state.depth, x0 = -W / 2 - T.padL;
    S.group = new THREE.Group(); world.add(S.group);
    // Footprint marked out: gold line, pegs and string
    S.mark = new THREE.Group(); S.group.add(S.mark);
    {
      const b = new Batch();
      b.box(M.mark, W + 0.12, 0.02, 0.12, 0, 0.035, d); b.box(M.mark, 0.12, 0.02, d, -W / 2, 0.035, d / 2); b.box(M.mark, 0.12, 0.02, d, W / 2, 0.035, d / 2);
      [[-W / 2, d], [W / 2, d], [-W / 2, 0.2], [W / 2, 0.2]].forEach(([x, z]) => { b.box(M.peg, 0.06, 0.7, 0.06, x, 0.35, z); b.box(M.mark, 0.1, 0.1, 0.1, x, 0.72, z); });
      b.box(M.string, W, 0.012, 0.012, 0, 0.55, d); b.box(M.string, 0.012, 0.012, d - 0.2, -W / 2, 0.55, d / 2 + 0.1); b.box(M.string, 0.012, 0.012, d - 0.2, W / 2, 0.55, d / 2 + 0.1);
      b.flush(S.mark, { shadow: false });
    }
    // Trench and spoil heaps, then concrete footings
    S.trench = new THREE.Group(); S.group.add(S.trench);
    {
      const b = new Batch();
      b.box(M.trench, W + 0.6, 0.02, 0.6, 0, 0.012, d); b.box(M.trench, 0.6, 0.02, d, -W / 2, 0.012, d / 2); b.box(M.trench, 0.6, 0.02, d, W / 2 - 0.3, 0.012, d / 2);
      [[-W / 2 - 0.75, d * 0.35, 0.5], [-W / 2 - 0.8, d * 0.8, 0.45], [-0.6, d + 0.85, 0.55], [1.4, d + 0.8, 0.42]].forEach(([x, z, r], i) =>
        b.geo(M.spoil, new THREE.IcosahedronGeometry(r, 0).scale(1.4, 0.55, 1), x, r * 0.25, z, i));
      b.flush(S.trench);
    }
    S.footings = new THREE.Group(); S.group.add(S.footings);
    {
      const b = new Batch();
      b.box(M.concrete, W + 0.6, 0.06, 0.6, 0, 0.03, d); b.box(M.concrete, 0.6, 0.06, d, -W / 2, 0.03, d / 2); b.box(M.concrete, 0.6, 0.06, d, W / 2 - 0.3, 0.03, d / 2);
      b.flush(S.footings);
    }
    // Steel beam where the old back wall opens up, roof joists
    S.steel = new THREE.Mesh(box(W - 0.3, 0.3, 0.22), M.steel); S.steel.position.set(0, 2.75, 0.13); S.steel.castShadow = true; S.group.add(S.steel);
    S.joists = new THREE.Group(); S.group.add(S.joists);
    {
      const b = new Batch();
      for (let x = -W / 2 + 0.2; x <= W / 2 - 0.15; x += 0.45) b.box(M.timber, 0.05, 0.2, d, x, 2.9, d / 2);
      b.box(M.timber, W, 0.2, 0.05, 0, 2.9, d - 0.03);
      b.flush(S.joists);
    }
    // First fix: cable runs inside
    S.cables = new THREE.Group(); S.group.add(S.cables);
    {
      const b = new Batch(), xr = W / 2 - WALL - 0.03, xl = -W / 2 + WALL + 0.03, c = 0.045;
      b.box(M.cable, c, c, d - 0.6, xr, 2.5, d / 2); b.box(M.cable, c, c, d - 0.6, xl, 2.5, d / 2);
      b.box(M.cable, W - 0.6, c, c, 0, 2.7, d * 0.35); b.box(M.cable, W - 0.6, c, c, 0, 2.7, d * 0.7);
      b.box(M.cable, W - 0.6, c, c, 0, 2.5, d - WALL - 0.05);
      [1, 2.4, 3.8, d - 0.45].forEach(z => { b.box(M.cable, c, 2.05, c, xr, 1.47, z); b.box(M.cable, 0.05, 0.16, 0.16, xr - 0.02, 0.45, z); });
      [1.6, 3.2, d - 0.45].forEach(z => { b.box(M.cable, c, 2.05, c, xl, 1.47, z); b.box(M.cable, 0.05, 0.16, 0.16, xl + 0.02, 0.45, z); });
      b.flush(S.cables, { shadow: false });
    }
    // Heras fence across the garden and a gold skip
    S.site = new THREE.Group(); S.group.add(S.site);
    {
      const b = new Batch(), zf = d + 2.2, x1 = W / 2, n = Math.ceil((x1 - x0) / 3.4), pw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const cx = x0 + pw * (i + 0.5);
        b.box(M.heras, pw - 0.08, 0.04, 0.04, cx, 2, zf); b.box(M.heras, pw - 0.08, 0.04, 0.04, cx, 0.12, zf);
        b.box(M.heras, 0.04, 1.92, 0.04, cx - pw / 2 + 0.06, 1.06, zf); b.box(M.heras, 0.04, 1.92, 0.04, cx + pw / 2 - 0.06, 1.06, zf);
        b.geo(M.herasMesh, plane(pw - 0.12, 1.86), cx, 1.06, zf);
        b.box(M.foot, 0.65, 0.14, 0.2, cx - pw / 2, 0.07, zf);
      }
      b.box(M.foot, 0.65, 0.14, 0.2, x1, 0.07, zf);
      b.flush(S.site);
      const skip = new THREE.Group(); S.site.add(skip);
      const sg = new THREE.BoxGeometry(2.3, 1.0, 1.45), p = sg.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 1.36);
      sg.computeVertexNormals(); sg.translate(0, 0.56, 0);
      const sb = new Batch();
      sb.put(M.skip, sg);
      sb.box(M.skipDark, 2.95, 0.05, 1.32, 0, 0.98, 0);
      sb.box(M.skipDark, 2.1, 0.12, 0.08, 0, 0.12, 0.74); sb.box(M.skipDark, 2.1, 0.12, 0.08, 0, 0.12, -0.74);
      const Rr = rand(61);
      for (let i = 0; i < 14; i++) sb.geo(M.rubble[i % 4], new THREE.DodecahedronGeometry(0.14 + Rr() * 0.18, 0), (Rr() - 0.5) * 2.3, 1.0 + Rr() * 0.18, (Rr() - 0.5) * 0.95, Rr() * 3);
      sb.flush(skip);
      skip.position.set(W / 2 - 1.05, 0, d + 3.95); skip.rotation.y = Math.PI / 2 + 0.06;
    }
    // Mud where the garden is being worked
    S.mud = new THREE.Mesh(plane(W + T.padL + 1.6, d + 3.4).rotateX(-Math.PI / 2), M.mud);
    S.mud.position.set((x0 + W / 2) / 2, 0.016, (d + 2.2) / 2 + 0.2); S.mud.renderOrder = 2; S.mud.receiveShadow = true; S.group.add(S.mud);
    // The crew
    S.workers = [worker(), worker()]; S.workers.forEach(w => S.group.add(w));
  }
  function worker() {
    const g = new THREE.Group(), b = new Batch();
    g.scale.setScalar(1.12);
    b.box(M.boot, 0.13, 0.08, 0.22, -0.09, 0.04, 0.03); b.box(M.boot, 0.13, 0.08, 0.22, 0.09, 0.04, 0.03);
    b.box(M.trousers, 0.13, 0.78, 0.15, -0.09, 0.47, 0); b.box(M.trousers, 0.13, 0.78, 0.15, 0.09, 0.47, 0);
    b.box(M.hivis, 0.44, 0.58, 0.26, 0, 1.14, 0);
    b.box(M.reflect, 0.45, 0.05, 0.27, 0, 1.02, 0); b.box(M.reflect, 0.45, 0.05, 0.27, 0, 1.2, 0);
    b.box(M.trousers, 0.1, 0.56, 0.12, -0.28, 1.1, 0.04); b.box(M.trousers, 0.1, 0.56, 0.12, 0.28, 1.1, 0.04);
    b.box(M.skin, 0.1, 0.1, 0.1, -0.28, 0.79, 0.06); b.box(M.skin, 0.1, 0.1, 0.1, 0.28, 0.79, 0.06);
    b.geo(M.skin, new THREE.SphereGeometry(0.12, 10, 8), 0, 1.58, 0);
    b.geo(M.hat, new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.63, 0);
    b.geo(M.hat, new THREE.CylinderGeometry(0.19, 0.19, 0.025, 14), 0, 1.635, 0.02);
    b.flush(g);
    g.userData = { from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, ry: 0, phase: Math.random() * 6 };
    return g;
  }
  /* Where the crew stand for each stage: [x, z from the extension end, y, facing] */
  const CREW = [
    [[-2.7, 0.3, 0, 0.6], [1.9, -0.7, 0, -0.9]], [[-1.1, 0.75, 0, 0.3], [2.1, 0.9, 0, -0.6]], [[-1.4, 0.8, 0, 2.9], [1.5, 0.95, 0, -2.9]],
    [[-0.6, 0.9, 0, 0.4], [1.9, 1.2, 0, -0.5]], [[-1.3, 0.85, 0, 2.8], [1.4, 1.0, 0, 3.2]], [[-1.0, -1.3, 0.16, 0.5], [1.2, -2.5, 0.16, -1.6]],
    [[-1.5, -2.1, 0.16, -1.2], [1.0, -1.0, 0.16, 0.6]], [[0.7, -1.4, 0.16, 0.4], [-1.6, -2.7, 0.16, 1.2]], [[-1.8, 1.0, 0, 0.5], [0.9, -1.1, 0.16, -0.4]],
    [[-0.7, 0.9, 0, 0.35], [0.7, 1.05, 0, -0.35]]
  ];

  /* ---------- Animated values ---------- */
  const tw = {};
  function now() { return performance.now(); }
  function sync(k, to) {
    const t = tw[k];
    if (!t) { tw[k] = { v: to, from: to, to, t0: 0, dur: 0, ease: EASE.out }; return; }
    if (t.to === to) return;
    const spec = SPEC[k] || ['out', 500], style = spec[0], up = to > t.v;
    t.from = t.v; t.to = to; t.t0 = now(); t.dur = reduced ? 0 : spec[1] * (up ? 1 : 0.55);
    t.ease = style === 'pop' ? (up ? EASE.back : EASE.in) : style === 'smooth' ? EASE.inOut : EASE.out;
  }
  function advance(t) {
    let busy = false;
    for (const k in tw) {
      const a = tw[k];
      if (a.v === a.to) continue;
      const p = a.dur ? clamp((t - a.t0) / a.dur, 0, 1) : 1;
      a.v = p >= 1 ? a.to : a.from + (a.to - a.from) * a.ease(p);
      busy = true;
    }
    return busy;
  }
  const V = k => (tw[k] ? tw[k].v : 0);
  function finishTweens() { for (const k in tw) tw[k].v = tw[k].to; }

  function stageInfo() {
    const b = state.build; if (!b) return null;
    const c = b.complete, s = c ? 99 : b.stage;
    return { c, s, done: i => s > i, wip: i => !c && s === i, shown: i => s >= i };
  }
  function targets() {
    const d = cur.d, t = {}, si = stageInfo();
    if (si) {
      const { c, done, wip, shown } = si;
      Object.assign(t, {
        mark: shown(0) && !done(1) ? 1 : 0, trench: wip(1) ? 1 : 0, footings: done(1) && !done(2) ? 1 : 0, slab: shown(2) ? 1 : 0,
        walls: wip(2) ? 0.55 : done(2) ? 1 : 0, steel: shown(3) && !done(3) ? 1 : 0, joists: wip(3) ? 1 : 0, deck: done(3) ? 1 : 0,
        glass: shown(4) ? 1 : 0, lantern: shown(4) ? 1 : 0, cables: shown(5) && !done(6) ? 1 : 0, kitchen: shown(7) ? 1 : 0,
        lit: shown(8) ? 1 : 0, table: shown(8) && d >= 4.45 ? 1 : 0, plant: shown(8) ? 1 : 0, patio: shown(8) ? 1 : 0,
        mud: shown(1) && !shown(8) ? 1 : 0, gold: c ? 1 : 0, site: c ? 0 : 1, upper: 0, loft: 0, hip: 1, ghost: 0, hintLoft: 0, hintUpper: 0
      });
      t.units = t.island = t.kitchen;
    } else {
      Object.assign(t, {
        mark: 0, trench: 0, footings: 0, steel: 0, joists: 0, cables: 0, mud: 0, site: 0,
        slab: 1, walls: 1, deck: 1, glass: 1, kitchen: 1, lit: 1, patio: 1, gold: 1,
        lantern: d >= 2.95 && !state.upper ? 1 : 0, units: d >= 1.2 ? 1 : 0, island: d >= 1.95 ? 1 : 0, table: d >= 4.45 ? 1 : 0, plant: d >= 2.95 ? 1 : 0,
        upper: state.upper ? 1 : 0, loft: state.loft ? 1 : 0, hip: state.loft ? 0 : 1,
        ghost: I && hints.ext && state.depth === 0 ? 1 : 0,
        hintLoft: I && hints.loft && !state.loft ? 1 : 0,
        hintUpper: I && hints.upper && !state.upper && state.depth >= 2 ? 1 : 0
      });
    }
    return t;
  }

  /* ---------- Apply the current values to the scene ---------- */
  let pulseMats = [];
  const WIP_MATS = { 0: ['mark'], 1: ['spoil'], 2: ['block'], 3: ['steel', 'timber'], 4: ['lanternGlass', 'bronze'], 5: ['cable'], 6: ['plaster'], 7: ['units', 'worktop'], 8: ['plant', 'plant2'] };
  function setPulse(stage) {
    pulseMats.forEach(m => resetPulse(m));
    pulseMats = (WIP_MATS[stage] || []).map(k => M[k]);
    pulseMats.forEach(m => { m.userData.e0 = m.emissive ? m.emissive.clone() : null; m.userData.ei0 = m.emissiveIntensity; m.userData.op0 = m.opacity; });
  }
  function resetPulse(m) {
    if (m.userData.e0) m.emissive.copy(m.userData.e0);
    if (m.userData.ei0 != null) m.emissiveIntensity = m.userData.ei0;
    if (m.userData.op0 != null) m.opacity = m.userData.op0;
  }
  const goldC = new THREE.Color(GOLD);
  const COL = { screed: new THREE.Color('#99958E'), slab: new THREE.Color('#7F7B75'), floor: new THREE.Color('#CFC6B7'), bulbOff: new THREE.Color('#3A332B'), bulbOn: new THREE.Color('#FFE6B0'), work: new THREE.Color('#DCE6FF'), warm: new THREE.Color('#FFBE78') };
  function applyPulse(t) {
    const p = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t / 1000 * 3.4);
    pulseMats.forEach(m => {
      if (m.isMeshBasicMaterial) m.opacity = 0.45 + 0.55 * p;
      else if (m === M.lanternGlass) m.emissiveIntensity = 0.25 + 0.9 * p;
      else { m.emissive.copy(goldC); m.emissiveIntensity = 0.06 + 0.3 * p; }
    });
  }

  let hover = null;
  function apply(t) {
    const W = T.W, d = cur.d, si = stageInfo(), has = d > 0.02;
    const walls = V('walls'), slab = V('slab'), deck = V('deck'), glass = V('glass'), lit = V('lit');
    const finish = si ? (si.shown(6) ? (si.done(6) ? M.render : M.plaster) : M.block) : M.render;
    const open = !si || si.shown(3);
    X.group.visible = has;
    if (!has) roomLight.intensity = spillLight.intensity = 0;
    if (has) {
      const wallTop = (EXT_H - 0.3) * walls;
      [X.wallL, X.wallR, X.header, X.back, X.roof].forEach(m => { if (m.material !== finish) { m.material = finish; m.userData.k = ''; } });
      setBox(X.plinth, -W / 2 - 0.02, W / 2 + 0.02, 0, 0.15 * slab, 0, d + 0.02);
      setBox(X.floor, -W / 2 + WALL, W / 2 - WALL, 0.15 * slab, 0.16 * slab, 0.01, d - 0.05);
      X.floor.material.color.copy(si && !si.shown(8) ? (si.shown(6) ? COL.screed : COL.slab) : COL.floor);
      setBox(X.wallL, -W / 2, -W / 2 + WALL, 0, wallTop, 0, d);
      setBox(X.wallR, W / 2 - WALL, W / 2, 0, wallTop, 0, d);
      setBox(X.header, -W / 2 + WALL, W / 2 - WALL, 2.62, EXT_H - 0.3, d - WALL, d); X.header.visible = X.header.visible && walls > 0.99;
      setBox(X.back, -W / 2 + WALL, W / 2 - WALL, 0.15, EXT_H - 0.3, 0.005, 0.03); X.back.visible = X.back.visible && open;
      setBox(X.doorway, -1.1, 1.1, 0.16, 2.3, 0.03, 0.04); X.doorway.visible = X.doorway.visible && open && (!si || si.done(3));
      X.doorway.material.emissiveIntensity = 0.2 + 0.9 * lit;
      const dk = deck;
      setBox(X.roof, -W / 2 - 0.05, W / 2 + 0.05, EXT_H - 0.3 * dk - 0.02, EXT_H - 0.02, 0, d + 0.05);
      setBox(X.membrane, -W / 2 + 0.03, W / 2 - 0.03, EXT_H - 0.02, EXT_H - 0.02 + 0.03 * dk, 0.02, d);
      const ty0 = EXT_H - 0.13, ty1 = ty0 + 0.17 * dk;
      setBox(X.trim[0], -W / 2 - 0.11, W / 2 + 0.11, ty0, ty1, d + 0.05, d + 0.11);
      setBox(X.trim[1], -W / 2 - 0.11, -W / 2 - 0.05, ty0, ty1, 0, d + 0.11);
      setBox(X.trim[2], W / 2 + 0.05, W / 2 + 0.11, ty0, ty1, 0, d + 0.11);
      X.end.position.z = d;
      X.endFrames.visible = glass > 0.001; X.endFrames.scale.y = Math.max(0.001, glass);
      // Lantern on the flat roof
      const lv = V('lantern');
      X.lantern.visible = lv > 0.001 && deck > 0.5;
      if (X.lantern.visible) {
        const lw = Math.min(1.7, W - 2.6), ll = clamp(d - 1.7, 1.2, 3.2), k = lw.toFixed(2) + ',' + ll.toFixed(2);
        if (X.lantern.userData.k !== k) { X.lantern.userData.k = k; disposeGroup(X.lanternParts); lanternGeo(lw, ll).flush(X.lanternParts, { pick: 'extroof' }); pickables = null; }
        X.lantern.position.set(0, EXT_H, d / 2 + 0.1);
        X.lantern.scale.setScalar(Math.max(0.001, lv));
        X.lanternGlow.position.set(0, 0.6, 0); X.lanternGlow.scale.set(lw * 2.4, 1.6, 1);
        X.lanternGlow.material.opacity = 0.42 * lit;
        M.lanternGlass.emissiveIntensity = pulseMats.includes(M.lanternGlass) ? M.lanternGlass.emissiveIntensity : 0.12 + 1.35 * lit;
      }
      // Kitchen run and tall units along the right-hand wall
      const kv = Math.min(V('units'), si ? V('kitchen') : 1);
      X.units.visible = kv > 0.001;
      if (X.units.visible) {
        const xr = W / 2 - WALL, ze = clamp(d - 0.75, 0.9, 4.6);
        setBox(X.unitBase, xr - 0.62, xr, 0.16, 1.02, 0.7, ze);
        setBox(X.unitTop, xr - 0.65, xr, 1.02, 1.06, 0.68, ze + 0.02);
        setBox(X.unitBrass, xr - 0.635, xr - 0.62, 0.9, 0.93, 0.75, ze - 0.05);
        setBox(X.tall, xr - 1.3, xr, 0.16, 2.35, 0.04, 0.66);
        X.units.scale.set(1, Math.max(0.001, kv), 1);
      }
      const iv = Math.min(V('island'), si ? V('kitchen') : 1), Li = clamp(d * 0.36, 1.3, 2.3);
      const tableOn = d >= 4.45, iz = 0.85 + Li / 2 + (tableOn ? 0 : Math.max(0, (d - 2.6 - Li) * 0.25));
      X.island.visible = iv > 0.001;
      if (X.island.visible) {
        X.island.position.set(-0.25 - (W > 6 ? 0.2 : 0), 0.16, iz);
        setBox(X.islandBase, -0.45, 0.45, 0, 0.86, -Li / 2, Li / 2);
        setBox(X.islandTop, -0.52, 0.52, 0.86, 0.91, -Li / 2 - 0.06, Li / 2 + 0.06);
        setBox(X.islandKick, -0.455, 0.455, 0.05, 0.08, -Li / 2 - 0.005, Li / 2 + 0.005);
        X.island.scale.setScalar(Math.max(0.001, iv));
        X.pendants.forEach((p, i) => placePendant(p, 0, (i ? 1 : -1) * Li * 0.26, 1.98, lit));
      }
      const tv = V('table');
      X.table.visible = tv > 0.001;
      if (X.table.visible) {
        X.table.position.set(-0.2, 0.16, Math.max(d - 1.3, iz + Li / 2 + 1.05));
        X.table.scale.setScalar(Math.max(0.001, tv));
        placePendant(X.tablePendant, 0, 0, 1.75, lit);
      }
      const pv = V('plant');
      X.plant.visible = pv > 0.001; X.plant.position.set(-W / 2 + WALL + 0.35, 0.16, d - 0.45); X.plant.scale.setScalar(Math.max(0.001, pv));
      const pa = V('patio');
      X.patioPlants.visible = pa > 0.001;
      X.patioPlants.position.set(-W / 2 + 0.5, 0.04, d + 0.5); X.patioPlants.scale.setScalar(Math.max(0.001, pa));
      X.patioPlants.children[1].position.x = W - 1.0;
      roomLight.position.set(0, 2.2, d * 0.55);
      const work = si && si.shown(3) && !si.shown(8) ? 1 : 0;
      roomLight.color.copy(work && lit < 0.5 ? COL.work : COL.warm);
      roomLight.intensity = Math.max(lit * (5 + 2.2 * d) * (deck > 0.5 ? 1 : 0.4), work * 3.5);
      spillLight.position.set(0, 1.4, d + 0.9);
      spillLight.intensity = lit * glass * 6;
      X.spill.position.set(0, 0.05, d + 1.55); X.spill.scale.set(W + 0.6, 1, 3.2);
      X.contact.position.set(0, 0.05, d / 2 + 0.05); X.contact.scale.set(W + 0.8, 1, d + 0.8); X.contact.material.opacity = 0.55;
      X.spill.material.opacity = 0.55 * lit * glass;
      X.spill.visible = lit * glass > 0.01;
    }
    // Garden: patio and boundary fences
    const pa = V('patio');
    setBox(G.patio, -W / 2 - (state.type === 'terrace' ? 0 : 0.2), W / 2, 0, 0.045 * pa, d, d + 1.6);
    G.patio.visible = G.patio.visible && pa > 0.01;
    if (Math.abs(d - lastD) > 1e-4) {
      G.fences.forEach(f => {
        const z0 = d + 0.002, z1 = G.Lg;
        setBox(f.board, f.x - 0.018, f.x + 0.018, 0.15, 1.8, z0, z1);
        setBox(f.gravel, f.x - 0.025, f.x + 0.025, 0, 0.15, z0, z1);
        setBox(f.cap, f.x - 0.025, f.x + 0.025, 1.8, 1.85, z0, z1);
        f.posts.forEach(p => { p.visible = p.position.z >= d - 0.01; });
      });
    }
    lastD = d;
    // House: ground floor back windows hide behind the extension
    H.rearGF.visible = si ? !si.shown(3) : d <= 0.05;
    const hip = V('hip');
    if (Math.abs(hip - lastHip) > 1e-4) {
      heroRoof(hip); lastHip = hip; pickables = null;
      if (H.gable) { H.gable.visible = hip < 0.999; H.gable.scale.y = Math.max(0.001, 1 - hip); }
    }
    // Floor above
    const uv = V('upper');
    U.group.visible = uv > 0.001 && has;
    if (U.group.visible) {
      const h = UP_TOP - EXT_H;
      U.group.scale.set(1, Math.max(0.001, uv), 1);
      setBox(U.body, -W / 2, W / 2, 0, h, 0, d);
      setBox(U.top, -W / 2 + 0.03, W / 2 - 0.03, h, h + 0.03, 0.02, d - 0.02);
      setBox(U.trim[0], -W / 2 - 0.08, W / 2 + 0.08, h - 0.08, h + 0.08, d, d + 0.06);
      setBox(U.trim[1], -W / 2 - 0.08, -W / 2 - 0.02, h - 0.08, h + 0.08, 0, d + 0.06);
      setBox(U.trim[2], W / 2 + 0.02, W / 2 + 0.08, h - 0.08, h + 0.08, 0, d + 0.06);
      U.win.position.set(0, 0, d);
    }
    // Loft dormer
    const lf = V('loft');
    L.group.visible = lf > 0.001;
    L.group.scale.set(1, Math.max(0.001, lf), 1);
    // Gold trim: timber until the job is complete
    const gold = V('gold');
    M.trim.color.copy(M.trimTimber).lerp(M.trimGold, gold);
    M.trim.metalness = lerp(0, 1, gold); M.trim.roughness = lerp(0.8, 0.28, gold); M.trim.emissiveIntensity = 0.55 * gold;
    // Glow on lights
    M.bulb.color.copy(COL.bulbOff).lerp(COL.bulbOn, lit);
    M.glassExt.opacity = lerp(0.42, 0.2, lit);
    // Hover highlight (desktop)
    M.slate.emissive.set(GOLD); M.slate.emissiveIntensity = hover === 'roof' ? 0.07 : 0;
    M.extMembrane.emissive.set(GOLD); M.extMembrane.emissiveIntensity = hover === 'extroof' ? 0.1 : 0;
    // Hints
    const gv = V('ghost'), pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t / 1000 * 3.2);
    G.ghost.visible = gv > 0.001;
    M.ghost.opacity = gv * (0.05 + 0.08 * pulse); M.ghostLine.opacity = gv * (0.45 + 0.45 * pulse); M.ghostDash.opacity = gv * (0.55 + 0.45 * pulse);
    if (si) applySite(t, si);
    if (si) applyPulse(t);
  }
  /* y is the height of the shade above the floor; pendants sit in groups lifted 0.16 m by the slab */
  function placePendant(p, x, z, y, lit) {
    const u = p.userData, top = EXT_H - 0.3 - 0.16, ys = y - 0.16, len = Math.max(0.05, top - ys);
    p.position.set(x, 0, z);
    u.cord.scale.y = len; u.cord.position.set(0, ys + len / 2, 0);
    u.shade.position.set(0, ys, 0); u.bulb.position.set(0, ys - (u.globe ? 0 : 0.05), 0);
    u.glow.position.copy(u.bulb.position); u.glow.material.opacity = 0.85 * lit; u.glow.visible = lit > 0.01;
  }
  function applySite(t, si) {
    const show = (o, v, mode) => {
      o.visible = v > 0.001;
      if (!o.visible) return;
      if (mode === 'rise') o.scale.set(1, Math.max(0.001, v), 1); else o.scale.setScalar(Math.max(0.001, v));
    };
    show(S.mark, V('mark')); show(S.trench, V('trench'), 'rise'); show(S.footings, V('footings'), 'rise');
    S.steel.visible = V('steel') > 0.001; S.steel.scale.set(Math.max(0.001, V('steel')), 1, 1);
    show(S.joists, V('joists'), 'rise'); show(S.cables, V('cables'), 'rise');
    S.site.visible = V('site') > 0.001; S.site.scale.set(1, Math.max(0.001, V('site')), 1);
    S.mud.visible = V('mud') > 0.01; S.mud.material.opacity = V('mud');
    const on = !si.c;
    S.workers.forEach((w, i) => {
      w.visible = on && V('site') > 0.05;
      if (!w.visible) return;
      const u = w.userData, p = clamp((t - u.t0) / 900, 0, 1), e = EASE.inOut(p);
      w.position.lerpVectors(u.from, u.to, e);
      const bob = reduced ? 0 : Math.abs(Math.sin(t / 1000 * 2.6 + u.phase)) * 0.035;
      w.position.y += bob;
      w.rotation.y = lerp(u.ry0 ?? u.ry, u.ry, e) + (reduced ? 0 : Math.sin(t / 1000 * 1.3 + u.phase) * 0.08);
    });
  }
  function placeCrew(animate) {
    if (!S.workers) return;
    const si = stageInfo(), spots = CREW[Math.min(si ? si.s : 0, 9)] || CREW[9];
    S.workers.forEach((w, i) => {
      const s = spots[i], u = w.userData, to = new THREE.Vector3(s[0], s[2], cur.d + s[1]);
      if (animate && !reduced && u.to.lengthSq()) { u.from.copy(w.position).setY(u.to.y); u.ry0 = u.ry; u.t0 = now(); }
      else { u.from.copy(to); u.ry0 = s[3]; u.t0 = 0; }
      u.to.copy(to); u.ry = s[3];
    });
  }

  /* ---------- Camera framing ---------- */
  const fitCam = new THREE.PerspectiveCamera(FOV, 1, 0.3, 900);
  const view = { def: 0, moved: false };
  function focusPoints() {
    const W = T.W, D = T.D, md = state.maxDepth, P = (x, y, z) => new THREE.Vector3(x, y, z);
    if (state.build) {
      const d = state.depth;
      return [P(-W / 2 - T.padL, 0, d + 2.4), P(W / 2, 0, d + 2.4), P(-W / 2, 0, 0), P(W / 2, 0, 0), P(-W / 2, EAVES + 0.4, 0), P(W / 2, EAVES + 0.4, 0),
        P(-W / 2, EXT_H, d), P(W / 2, EXT_H, d), P(W / 2 - 1, 0, d + 5.4), P(-W / 4, RIDGE + 0.3, -D / 2), P(W / 4, RIDGE + 0.3, -D / 2)];
    }
    return [P(-W / 2, 0, 0), P(W / 2, 0, 0), P(-W / 2, 0, md), P(W / 2, 0, md), P(-W / 2, EXT_H, md), P(W / 2, EXT_H, md),
      P(-W / 2 - 0.3, RIDGE + 1.1, -D / 2), P(W / 2 + 0.3, RIDGE + 1.1, -D / 2), P(-W / 2 - 0.3, EAVES, 0.3), P(W / 2 + 0.3, EAVES, 0.3), P(0, 0, md + 1.6)];
  }
  function place(cam, tg, dist, theta, phi) {
    cam.position.set(tg.x + dist * Math.sin(phi) * Math.sin(theta), tg.y + dist * Math.cos(phi), tg.z + dist * Math.sin(phi) * Math.cos(theta));
    cam.lookAt(tg); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  }
  function fit(aspect, theta, phi) {
    const pts = focusPoints(), cam = fitCam, v = new THREE.Vector3();
    cam.aspect = aspect; cam.updateProjectionMatrix();
    const tg = new THREE.Vector3(); pts.forEach(p => tg.add(p)); tg.divideScalar(pts.length);
    const mx = 0.94, my = aspect < 1.1 ? 0.8 : 0.86;
    let dist = 20;
    const ext = () => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      pts.forEach(p => { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); });
      return { x0, x1, y0, y1, m: Math.max((x1 - x0) / 2 / mx, (y1 - y0) / 2 / my) };
    };
    for (let pass = 0; pass < 4; pass++) {
      let lo = 6, hi = 220;
      for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; place(cam, tg, mid, theta, phi); if (ext().m > 1) lo = mid; else hi = mid; }
      dist = hi; place(cam, tg, dist, theta, phi);
      const e = ext(), hh = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist, hw = hh * aspect;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      tg.addScaledVector(right, (e.x0 + e.x1) / 2 * hw).addScaledVector(up, ((e.y0 + e.y1) / 2 + (state.build ? 0 : 0.02)) * hh);
    }
    return { target: tg, dist };
  }
  const size = { w: 1, h: 1 };
  function frame(reset) {
    const aspect = size.w / size.h, v0 = state.build ? BVIEW : VIEW;
    const f = fit(aspect, v0.theta, v0.phi);
    let theta = v0.theta, phi = v0.phi, dist = f.dist;
    if (!reset && view.moved && view.def) {
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
      theta = sph.theta; phi = sph.phi; dist = sph.radius * f.dist / view.def;
    }
    if (reset) view.moved = false;
    view.def = f.dist;
    target.copy(f.target);
    place(camera, target, dist, theta, phi);
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = f.dist * 0.75; controls.maxDistance = f.dist * 1.4;
      controls.update();
    }
  }

  /* ---------- Controls and interaction ---------- */
  let controls = null;
  const POLAR = [0.78, 1.42];
  if (I) {
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !reduced; controls.dampingFactor = 0.09;
    controls.enablePan = false; controls.enableZoom = false;
    controls.rotateSpeed = 0.7;
    controls.minPolarAngle = POLAR[0]; controls.maxPolarAngle = POLAR[1];
    controls.minAzimuthAngle = -2.3; controls.maxAzimuthAngle = 2.3;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null };
    canvas.style.touchAction = 'pan-y';
    controls.addEventListener('change', invalidate);
    controls.addEventListener('start', () => { userUntil = Infinity; view.moved = true; });
    controls.addEventListener('end', () => { userUntil = now() + 3500; });
  }
  let userUntil = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
  let press = null, dragging = false;
  function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; }
  function toScreen(p) {
    tmp.copy(p).project(camera);
    if (tmp.z > 1 || tmp.z < -1) return null;
    return { x: (tmp.x + 1) / 2 * size.w, y: (1 - tmp.y) / 2 * size.h };
  }
  function shown(o) { for (let n = o; n; n = n.parent) { if (!n.visible) return false; if (n === scene) return true; } return false; }
  function setRay(e) { const l = local(e); ndc.set(l.x / l.w * 2 - 1, -(l.y / l.h) * 2 + 1); ray.setFromCamera(ndc, camera); return l; }
  function planeZ(y) {
    const o = ray.ray.origin, dir = ray.ray.direction;
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = (y - o.y) / dir.y; if (t <= 0) return null;
    return { x: o.x + dir.x * t, z: o.z + dir.z * t };
  }
  function pickAt(e) {
    const l = setRay(e);
    if (handle.visible) {
      const hp = toScreen(handle.position);
      if (hp && Math.hypot(hp.x - l.x, hp.y - l.y) < Math.max(26, HIT_PX * uiScale())) return { kind: 'handle', y: 1.2 };
    }
    if (!pickables) { pickables = []; world.traverse(o => { if (o.isMesh && o.userData.pick) pickables.push(o); }); rayTargets = []; world.traverse(o => { if (o.isMesh) rayTargets.push(o); }); }
    const hits = ray.intersectObjects(rayTargets, false);
    for (const h of hits) {
      if (!shown(h.object)) continue;
      if (h.object.material && h.object.material.transparent && !h.object.userData.pick) continue;
      const k = h.object.userData.pick;
      if (k) return { kind: k, y: clamp(h.point.y, 0, EXT_H), z: h.point.z };
      break;
    }
    const g = planeZ(0), W = T.W;
    if (g && g.x > -W / 2 && g.x < W / 2 && g.z > cur.d - 0.3 && g.z < state.maxDepth + 1.5) return { kind: 'lawn', y: 0, z: g.z };
    return null;
  }
  const DRAG = { handle: 1, ext: 1, extroof: 1, ghost: 1, lawn: 1 };
  function onDown(e) {
    if (e.target !== canvas || !controls) return;
    if (e.pointerType === 'touch') { const ph = controls.getPolarAngle(); controls.minPolarAngle = controls.maxPolarAngle = ph; }
    else { controls.minPolarAngle = POLAR[0]; controls.maxPolarAngle = POLAR[1]; }
    if (press && !press.drag) press = null;
    if (state.build || press) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = pickAt(e);
    if (!hit) return;
    const l = local(e);
    press = { id: e.pointerId, x: l.x, y: l.y, kind: hit.kind, moved: false, type: e.pointerType };
    if (DRAG[hit.kind] && !(hit.kind === 'lawn' && e.pointerType === 'touch')) {
      controls.enabled = false;
      press.drag = true;
      press.plane = hit.kind === 'handle' ? 1.2 : hit.y;
      const z0 = planeZ(press.plane);
      press.abs = hit.kind === 'lawn' || hit.kind === 'ghost';
      press.off = z0 ? state.depth - z0.z : 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* already captured */ }
      e.preventDefault();
    }
  }
  function onTouchStart(e) { if (press && press.drag) e.preventDefault(); }
  function onMove(e) {
    if (press && e.pointerId === press.id) {
      const l = local(e), dist = Math.hypot(l.x - press.x, l.y - press.y);
      if (dist > TAP_PX) press.moved = true;
      if (press.drag && (dragging || dist > 3)) {
        if (!dragging) { dragging = true; userUntil = Infinity; }
        setRay(e);
        const z = planeZ(press.plane);
        if (z) {
          const raw = press.abs ? z.z : z.z + press.off;
          const snap = clamp(Math.round(raw * 2) / 2, 0, state.maxDepth);
          if (snap !== state.depth) userDepth(snap);
        }
        canvas.style.cursor = 'grabbing';
        invalidate();
      }
      return;
    }
    if (e.pointerType === 'mouse' && !e.buttons && !state.build) {
      const h = pickAt(e), k = h ? h.kind : null;
      const hv = k === 'roof' ? 'roof' : k === 'extroof' ? 'extroof' : null;
      canvas.style.cursor = !k ? '' : k === 'roof' || (k === 'extroof' && cur.d >= 2) ? 'pointer' : 'grab';
      if (hv !== hover) { hover = hv; invalidate(); }
    }
  }
  function onUp(e) {
    if (!press || e.pointerId !== press.id) return;
    const p = press; press = null;
    if (p.drag) {
      controls.enabled = true;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
      canvas.style.cursor = '';
      if (dragging) { dragging = false; userUntil = now() + 3500; emit('change', getState()); }
    }
    if (e.type === 'pointercancel' || p.moved) return;
    if (p.kind === 'roof') userToggle('loft');
    else if (p.kind === 'extroof') userToggle('upper');
    invalidate();
  }
  function onLeave() { if (hover) { hover = null; invalidate(); } }
  function onWheel(e) {
    if (!controls || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const off = camera.position.clone().sub(controls.target);
    const dist = clamp(off.length() * Math.exp(e.deltaY * 0.004), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(off.setLength(dist));
    view.moved = true; invalidate();
  }
  if (I) {
    container.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('wheel', onWheel, { passive: false });
  }

  function userDepth(d) {
    state.depth = d;
    if (d > 0) hints.ext = false;
    if (d < 2 && state.upper) { state.upper = false; emit('toggle', { key: 'upper', value: false, auto: true }); }
    emit('depth', d, getState());
    invalidate();
  }
  function userToggle(key) {
    if (state.build) return;
    if (key === 'upper' && !state.upper && state.depth < 2) { emit('blocked', { key: 'upper', reason: 'depth' }); return; }
    state[key] = !state[key];
    hints[key] = false;
    emit('toggle', { key, value: state[key] });
    emit('change', getState());
    invalidate();
  }

  /* ---------- Labels and badges ---------- */
  /* Badges shrink a little on short canvases so they never crowd the house */
  const uiScale = () => clamp(size.h / 320, 0.72, 1);
  function spriteScale(s) {
    const k = s.userData.px * uiScale() * 2 / (size.h * camera.projectionMatrix.elements[5]);
    s.scale.set(k, k, 1);
  }
  function placeLabel(l, on, world3, dx, dy, align) {
    const p = on ? toScreen(world3) : null;
    if (!p || p.x < -40 || p.x > size.w + 40 || p.y < -20 || p.y > size.h + 20) {
      if (l.on) { l.el.classList.remove('h3d-on'); l.on = false; l.el.setAttribute('aria-hidden', 'true'); if (l.btn) l.el.tabIndex = -1; }
      return;
    }
    if (!l.on || !l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
    let x = p.x + dx, y = p.y + dy - l.h / 2;
    if (align === 'center') x -= l.w / 2;
    if (align === 'left') x -= l.w;
    x = clamp(x, 6, size.w - l.w - 6); y = clamp(y, 6, size.h - l.h - 6);
    l.el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
    if (!l.on) { l.el.classList.add('h3d-on'); l.on = true; l.el.removeAttribute('aria-hidden'); if (l.btn) l.el.tabIndex = 0; }
  }
  const loftAnchor = new THREE.Vector3(), upperAnchor = new THREE.Vector3(), extAnchor = new THREE.Vector3();
  function updateUI(t, snapshot) {
    const D = T.D, d = cur.d, pulse = reduced ? 0 : (t / 1600) % 1;
    const showUI = I && !state.build && !snapshot;
    handle.visible = showUI;
    handle.position.set(0, 1.2, d + 0.35);
    if (handle.visible) {
      spriteScale(handle);
      const a = toScreen(handle.position), b = toScreen(tmp.set(0, 1.2, d + 1.35));
      if (a && b) handle.material.rotation = Math.atan2(-(b.y - a.y), b.x - a.x);
    }
    const ring = (r, base, on) => {
      r.visible = on && !reduced;
      if (!r.visible) return;
      r.position.copy(base.position); r.userData.px = base.userData.px * (1 + pulse * 1.1); spriteScale(r);
      r.material.opacity = 0.85 * (1 - pulse);
    };
    ring(handleRing, handle, showUI && state.depth === 0 && hints.ext);
    const hl = V('hintLoft'), hu = V('hintUpper');
    const tanP = (RIDGE - EAVES) / (D / 2);
    loftAnchor.set(0, EAVES + (D / 4) * tanP + 0.35, -D / 4 + 0.1);
    loftPlus.visible = showUI && hl > 0.01; loftPlus.position.copy(loftAnchor); loftPlus.material.opacity = hl;
    if (loftPlus.visible) spriteScale(loftPlus);
    ring(loftRing, loftPlus, loftPlus.visible);
    const llen = clamp(d - 1.7, 1.2, 3.2);
    upperAnchor.set(0, EXT_H + 0.45, V('lantern') > 0.5 ? Math.max(0.5, d / 2 - llen / 2 - 0.3) : d / 2);
    upperPlus.visible = showUI && hu > 0.01 && d >= 1.9; upperPlus.position.copy(upperAnchor); upperPlus.material.opacity = hu;
    if (upperPlus.visible) spriteScale(upperPlus);
    ring(upperRing, upperPlus, upperPlus.visible);
    extAnchor.set(0, EXT_H + 0.15, 1.5);
    placeLabel(labels.ext, showUI && V('ghost') > 0.5, extAnchor, 0, -14 - 8 * uiScale(), 'center');
    const gap = PLUS_PX * uiScale() / 2 + 7;
    placeLabel(labels.loft, showUI && hl > 0.5, loftAnchor, gap, 0, 'right');
    placeLabel(labels.upper, showUI && hu > 0.5 && upperPlus.visible, upperAnchor, gap, 0, 'right');
  }

  /* ---------- Render loop (on demand) ---------- */
  let raf = 0, last = 0, lastRender = 0, paused = false, disposed = false, inView = true, firstFrame = true, renders = 0, dirty = true;
  let autoPhase = 0;
  /* invalidate: something changed, draw a frame. schedule: keep the loop going while animating. */
  function invalidate() { dirty = true; schedule(); }
  function schedule() { if (!raf && !paused && !disposed) raf = requestAnimationFrame(tick); }
  function ambient() {
    if (!inView) return false;
    if (state.autoRotate && !reduced) return true;
    if (reduced) return false;
    if (state.build && !state.build.complete) return true;
    return I && !state.build && (V('ghost') > 0.01 || V('hintLoft') > 0.01 || V('hintUpper') > 0.01);
  }
  function tick(t) {
    raf = 0;
    if (paused || disposed) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016; last = t;
    let busy = false;
    const dd = state.depth - cur.d;
    if (Math.abs(dd) > 1e-4) {
      cur.d += reduced ? dd : dd * (1 - Math.exp(-(dragging ? 24 : 9) * dt));
      if (Math.abs(state.depth - cur.d) < 0.002) cur.d = state.depth;
      busy = true;
    }
    const tg = targets();
    for (const k in tg) sync(k, tg[k]);
    if (advance(t)) busy = true;
    if (state.autoRotate && !reduced && t > userUntil) {
      autoPhase += dt * 0.16;
      const v0 = state.build ? BVIEW : VIEW, want = v0.theta + Math.sin(autoPhase) * 0.5;
      const off = camera.position.clone().sub(target), sph = new THREE.Spherical().setFromVector3(off);
      sph.theta += (want - sph.theta) * (1 - Math.exp(-dt * 1.2));
      camera.position.copy(target).add(off.setFromSpherical(sph)); camera.lookAt(target);
    }
    let moving = false;
    if (controls) moving = controls.update();
    const amb = ambient(), active = busy || moving || dragging;
    if (!active && !dirty && !amb) { last = 0; return; }
    if (!active && !dirty && t - lastRender < 31) { schedule(); return; }
    dirty = false;
    render(t);
    if (active || amb) schedule(); else last = 0;
  }
  function render(t, snapshot) {
    if (size.w < 2 || size.h < 2) { dirty = true; return; }
    apply(t);
    updateUI(t, snapshot);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    renders++; lastRender = t;
    if (firstFrame) { firstFrame = false; emit('ready'); }
  }

  /* ---------- Size, visibility ---------- */
  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    if (w === size.w && h === size.h) return;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    frame(false);
    layer.classList.toggle('h3d-sm', h < 260);
    labels.ext.w = labels.loft.w = labels.upper.w = 0;
    invalidate();
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container); else window.addEventListener('resize', resize);
  const io = window.IntersectionObserver ? new IntersectionObserver(es => { inView = es[es.length - 1].isIntersecting; if (inView) invalidate(); }) : null;
  if (io) io.observe(container);
  function onLost(e) { e.preventDefault(); emit('contextlost'); }
  function onRestored() { invalidate(); }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { labels.ext.w = labels.loft.w = labels.upper.w = 0; invalidate(); });

  /* ---------- API ---------- */
  function emit(ev, ...a) { (handlers[ev] || []).slice().forEach(fn => { try { fn(...a); } catch (err) { console.error(err); } }); }
  function on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => off(ev, fn); }
  function off(ev, fn) { const l = handlers[ev]; if (l) { const i = l.indexOf(fn); if (i > -1) l.splice(i, 1); } }
  function setHints(h) {
    if (h === true || h === false || h == null) { hints.ext = hints.loft = hints.upper = !!h; return; }
    ['ext', 'loft', 'upper'].forEach(k => { if (k in h) hints[k] = !!h[k]; });
  }
  function getState() {
    return { type: state.type, depth: state.depth, upper: state.upper, loft: state.loft, hints: Object.assign({}, hints), maxDepth: state.maxDepth, build: state.build ? Object.assign({}, state.build) : null };
  }
  function set(p, o = {}) {
    if (disposed || !p) return;
    let animate = o.animate !== false && !reduced, rebuild = false;
    if (p.type && TYPES[p.type] && p.type !== state.type) {
      state.type = p.type; rebuild = true;
      if (p.maxDepth == null) state.maxDepth = TYPES[p.type].maxDepth;
    }
    if (p.maxDepth != null && +p.maxDepth !== state.maxDepth) { state.maxDepth = +p.maxDepth; rebuild = true; }
    if (p.depth != null) state.depth = clamp(+p.depth || 0, 0, state.maxDepth);
    else state.depth = Math.min(state.depth, state.maxDepth);
    if (p.upper != null) state.upper = !!p.upper;
    if (p.loft != null) state.loft = !!p.loft;
    if (state.depth < 2 || state.build) state.upper = false;
    if (state.build) state.loft = false;
    if (p.hints !== undefined) setHints(p.hints);
    if (p.autoRotate != null) state.autoRotate = !!p.autoRotate;
    if (p.label) canvas.setAttribute('aria-label', p.label);
    if (rebuild) { buildWorld(); animate = false; frame(true); placeCrew(false); }
    if (!animate) { cur.d = state.depth; const tg = targets(); for (const k in tg) sync(k, tg[k]); finishTweens(); }
    invalidate();
  }
  function setBuild(b, o = {}) {
    if (disposed) return;
    const was = state.build;
    state.build = b ? { stage: clamp(b.stage | 0, 0, 9), complete: !!b.complete } : null;
    if (!!was !== !!state.build) {
      if (state.build) { state.upper = false; state.loft = false; if (!state.depth) state.depth = cur.d = 5; }
      buildWorld(); frame(true);
      const tg = targets(); for (const k in tg) sync(k, tg[k]); finishTweens();
      placeCrew(false);
    } else {
      placeCrew(o.animate !== false);
      if (o.animate === false) { const tg = targets(); for (const k in tg) sync(k, tg[k]); finishTweens(); }
    }
    setPulse(state.build && !state.build.complete ? state.build.stage : -1);
    invalidate();
  }
  function toDataURL(w = 1200, h = 750) {
    if (disposed) return '';
    w = Math.max(16, Math.round(w)); h = Math.max(16, Math.round(h));
    const pr = renderer.getPixelRatio(), pos = camera.position.clone(), asp = camera.aspect, sw = size.w, sh = size.h;
    const off = pos.clone().sub(target), sph = new THREE.Spherical().setFromVector3(off);
    const a = fit(w / h, sph.theta, sph.phi).dist, b = fit(sw / sh, sph.theta, sph.phi).dist;
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.position.copy(target).add(off.multiplyScalar(a / b)); camera.lookAt(target);
    size.w = w; size.h = h;
    render(now(), true);
    const url = canvas.toDataURL('image/png');
    size.w = sw; size.h = sh;
    renderer.setPixelRatio(pr); renderer.setSize(sw, sh, false);
    camera.aspect = asp; camera.updateProjectionMatrix(); camera.position.copy(pos); camera.lookAt(target);
    render(now());
    return url;
  }
  function pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function resume() { if (disposed) return; paused = false; last = 0; invalidate(); }
  function dispose() {
    if (disposed) return;
    disposed = true; pause();
    if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
    if (io) io.disconnect();
    container.removeEventListener('pointerdown', onDown, true);
    canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
    if (controls) controls.dispose();
    const mats = new Set();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => mats.add(m)); });
    Object.values(M).forEach(m => [].concat(m).forEach(x => { if (x && x.isMaterial) mats.add(x); }));
    mats.forEach(m => m.dispose());
    textures.forEach(t => t.dispose());
    if (envRT) envRT.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) { /* already lost */ }
    canvas.remove(); layer.remove();
    for (const k in handlers) delete handlers[k];
  }

  /* ---------- Start ---------- */
  buildWorld();
  setPulse(state.build && !state.build.complete ? state.build.stage : -1);
  { const tg = targets(); for (const k in tg) sync(k, tg[k]); }
  placeCrew(false);
  size.w = 0; size.h = 0; resize();
  if (!view.def || size.w < 2) frame(true);
  invalidate();

  return {
    set, setBuild, getState, on, off, toDataURL, pause, resume, dispose, canvas,
    /* Test helpers: screen positions of the handle and roof, render count */
    _debug: {
      screen: (x, y, z) => toScreen(new THREE.Vector3(x, y, z)),
      handle: () => (handle.visible ? toScreen(handle.position) : null),
      roof: () => toScreen(new THREE.Vector3(0, EAVES + (T.D / 4) * ((RIDGE - EAVES) / (T.D / 2)) - 0.4, -T.D / 4 + 0.6)),
      extRoof: () => toScreen(new THREE.Vector3(-T.W / 4, EXT_H, cur.d * 0.25)),
      pick: (x, y) => { const r = canvas.getBoundingClientRect(), h = pickAt({ clientX: r.left + x, clientY: r.top + y }); return h ? h.kind : null; },
      renders: () => renders,
      info: () => Object.assign({}, renderer.info.render, { programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
      busy: () => Object.keys(tw).filter(k => tw[k].v !== tw[k].to).concat(Math.abs(state.depth - cur.d) > 1e-4 ? ['depth'] : [])
    }
  };
}
