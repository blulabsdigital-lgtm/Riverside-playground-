"""Procedural, seamless PNG textures for the Riverside kitchen generator (tools/blender/kitchen.py).

Every texture is a plain 1024 px image in lab/assets/textures/ named kitchen-*.png, so it survives
glTF export and can be replaced file-for-file later, for example by a Nano Banana material sample
made at the same real-world scale. lab/assets/textures/kitchen-textures.json records, for each
file, the real-world size one tile covers and the mean linear colour, which kitchen.py uses to
tint a texture to a card colour.

Run with the Blender Python (numpy ships with bpy; Pillow is installed into the same env):
    <blender-env>/bin/python tools/blender/kitchen_textures.py           # all groups
    <blender-env>/bin/python tools/blender/kitchen_textures.py stone     # one group
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'lab', 'assets', 'textures')
MANIFEST_PATH = os.path.join(OUT, 'kitchen-textures.json')
S = 1024  # every texture is 1024 px square (glTF-ready)

MANIFEST = {}


# ---------------------------------------------------------------- helpers

def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def noise(h, w, gy, gx, rng):
    """Seamless value noise: a gy x gx random grid smoothly upsampled to h x w (wraps both ways)."""
    g = rng.random((gy, gx)).astype(np.float32)
    pad = 3
    gp = np.pad(g, pad, mode='wrap')
    sy, sx = h / gy, w / gx
    big = Image.fromarray(gp, mode='F').resize((int(round((gx + 2 * pad) * sx)), int(round((gy + 2 * pad) * sy))), Image.BICUBIC)
    a = np.asarray(big)
    oy, ox = int(round(pad * sy)), int(round(pad * sx))
    return a[oy:oy + h, ox:ox + w].copy()


def fbm(h, w, gy, gx, rng, octaves=5, gain=0.5):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cy, cx = gy * 2 ** o, gx * 2 ** o
        if cy > h or cx > w:
            break
        out += amp * noise(h, w, cy, cx, rng)
        tot += amp
        amp *= gain
    return out / tot


def norm01(a):
    lo, hi = np.percentile(a, 0.5), np.percentile(a, 99.5)
    return np.clip((a - lo) / max(1e-6, hi - lo), 0, 1)


def blur(a, r):
    """Gaussian blur with wrap-around (FFT), so seamless textures stay seamless."""
    if r <= 0:
        return a
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * (r ** 2) * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(a.astype(np.float32)) * g, s=(h, w)).astype(np.float32)


def blur_rgb(rgb, r):
    return np.stack([blur(rgb[..., i], r) for i in range(3)], -1)


def lerp(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a + (b - a) * t


def ramp(t, stops):
    """Colour ramp: stops = [(pos, '#hex'), ...] in sRGB, t in 0..1 -> sRGB float image."""
    t = np.clip(t, 0, 1)
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.stack([hexrgb(s[1]) for s in stops])
    return np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], -1).astype(np.float32)


def normal_from_height(hgt, px_per_m, strength=1.0):
    """OpenGL-style (Y up, as Blender and glTF expect) tangent-space normal map from a height map in metres."""
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * px_per_m
    dy = (np.roll(hgt, 1, 0) - np.roll(hgt, -1, 0)) * 0.5 * px_per_m  # rows run down, v runs up
    nx, ny, nz = -dx * strength, -dy * strength, np.ones_like(hgt)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5


def save(name, arr, size_m, kind='albedo', note='', tint=False):
    """Save an sRGB float image (H,W,3) or a greyscale map (H,W) and record it in the manifest."""
    os.makedirs(OUT, exist_ok=True)
    a = np.clip(arr, 0, 1)
    img = Image.fromarray((a * 255 + 0.5).astype(np.uint8), mode='L' if a.ndim == 2 else 'RGB')
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    rec = {'kind': kind, 'tileMetres': size_m, 'px': img.size[0]}
    if a.ndim == 3 and kind == 'albedo':
        rec['meanLinear'] = [round(float(v), 4) for v in srgb_to_linear(a).reshape(-1, 3).mean(0)]
        rec['tintable'] = bool(tint)
    if note:
        rec['note'] = note
    MANIFEST[name] = rec
    print(f'  {name:46s} {img.size[0]}px  {size_m} m  {os.path.getsize(path) // 1024} KB')


def per_tile(tid, fn, n=1):
    ids, inv = np.unique(tid, return_inverse=True)
    vals = np.array([fn() for _ in ids], np.float32)
    return vals[inv].reshape(tid.shape)


def tiles_grid(size, tw, th, offset_rows=False):
    """Per-pixel tile id, distance to the nearest tile edge (m) and local coordinates (m)."""
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)
    X = (xs + 0.5) / S * size
    Y = (S - ys - 0.5) / S * size
    row = np.floor(Y / th).astype(np.int64)
    Xo = X + (np.where(row % 2 == 1, tw / 2, 0) if offset_rows else 0)
    col = np.floor(Xo / tw).astype(np.int64)
    lx, ly = Xo - col * tw, Y - row * th
    ncol, nrow = int(round(size / tw)), int(round(size / th))
    tid = (row % nrow) * 1000 + (col % ncol)
    edge = np.minimum(np.minimum(lx, tw - lx), np.minimum(ly, th - ly))
    return tid, edge, lx, ly


# ---------------------------------------------------------------- wood

def wood_field(h, w, rng, rings=26, warp=1.0):
    """Mostly straight grain running down the image (along v). Returns (tone, pores, figure), all 0..1."""
    x = (np.arange(w, dtype=np.float32) / w)[None, :].repeat(h, 0)
    lowwarp = fbm(h, w, 2, 3, rng, octaves=3) - 0.5
    midwarp = fbm(h, w, 4, 12, rng, octaves=2) - 0.5
    phase = x * rings + lowwarp * 1.1 * warp + midwarp * 0.25 * warp
    f = phase - np.floor(phase)
    late = np.exp(-((f - 0.8) ** 2) / 0.004) + 0.25 * np.exp(-((f - 0.25) ** 2) / 0.04)
    streak = noise(h, w, 10, w // 3, rng) * 0.6 + noise(h, w, 24, w // 2, rng) * 0.4
    p = np.clip((noise(h, w, 40, w // 2, rng) - 0.62) * 5, 0, 1)
    figure = fbm(h, w, 2, 5, rng, octaves=3)
    tone = norm01(late * 0.5 + streak * 0.35 + figure * 0.35)
    return tone, p, figure


def wood_colour(tone, pores, figure, light, mid, dark):
    col = ramp(tone, [(0.0, light), (0.55, mid), (1.0, dark)])
    col *= (1 - 0.18 * pores)[..., None]
    col *= (0.95 + 0.1 * figure)[..., None]
    return col


def make_wood():
    for name, seed, light, mid, dark, rings, note in [
        ('kitchen-wood-oak-albedo.png', 11, '#E6C49C', '#D3AA7C', '#AF8355', 22, 'Natural oak. Doors, shelves, worktop and stools.'),
        ('kitchen-wood-walnut-albedo.png', 12, '#8F6447', '#755038', '#4C3222', 16, 'Walnut.'),
        ('kitchen-wood-smoked-oak-albedo.png', 13, '#8B6D54', '#6E5440', '#45321F', 22, 'Smoked oak.'),
    ]:
        rng = np.random.default_rng(seed)
        tone, pores, figure = wood_field(S, S, rng, rings)
        save(name, wood_colour(tone, pores, figure, light, mid, dark), 1.0, note=note + ' Grain runs along v.', tint=True)
        if 'oak-albedo' in name and 'smoked' not in name:
            save('kitchen-wood-roughness.png', np.clip(0.48 + 0.18 * pores + 0.06 * (tone - 0.5), 0, 1), 1.0, kind='roughness',
                 note='Shared by all wood.')


def plank_floor(name, light, mid, dark, seed, size=2.4, plank_w=0.2, extra=None):
    """Engineered boards: 12 boards across, staggered joints, micro-bevelled edges. Grain along v."""
    rng = np.random.default_rng(seed)
    pxm = S / size
    fields = [wood_field(S, S, rng, rings=r, warp=0.9) for r in (46, 38)]
    col = np.zeros((S, S, 3), np.float32)
    hgt = np.zeros((S, S), np.float32)
    rough = np.zeros((S, S), np.float32)
    n_cols = int(round(size / plank_w))
    pw = S // n_cols
    rows_idx = np.arange(S)
    for c in range(n_cols):
        x0 = c * pw
        y = int(rng.integers(0, S))
        cuts = [y]
        while True:
            L = int(rng.uniform(0.8, 1.9) * pxm)
            if (cuts[-1] - y) + L > S - int(0.5 * pxm):
                break
            cuts.append(cuts[-1] + L)
        order = sorted(v % S for v in cuts)
        seg = np.searchsorted(order, rows_idx, side='right') % len(order)
        dist = np.min(np.abs(((rows_idx[:, None] - np.array(order)[None, :] + S // 2) % S) - S // 2), 1).astype(np.float32)
        for i in range(len(order)):
            m = np.where(seg == i)[0]
            tone, pores, figure = fields[int(rng.integers(0, 2))]
            shift = int(rng.integers(0, S))
            t = np.clip(np.roll(tone[:, x0:x0 + pw], shift, 0)[m] + rng.normal(0, 0.08), 0, 1)
            p = np.roll(pores[:, x0:x0 + pw], shift, 0)[m]
            cc = ramp(t, [(0.0, light), (0.55, mid), (1.0, dark)]) * (1 - 0.18 * p)[..., None] * rng.uniform(0.9, 1.07)
            col[m, x0:x0 + pw] = cc
            rough[m, x0:x0 + pw] = 0.42 + 0.2 * p + rng.uniform(-0.04, 0.04)
        xs = np.arange(pw)[None, :]
        d = np.minimum(np.minimum(xs, pw - 1 - xs).astype(np.float32), dist[:, None])
        bevel = np.clip(d / 2.0, 0, 1)
        hgt[:, x0:x0 + pw] = bevel * 0.0012
        col[:, x0:x0 + pw] *= (0.6 + 0.4 * bevel)[..., None]
    save(name, col, size, note='Boards 0.2 m wide, grain along v.', tint=True)
    save(name.replace('albedo', 'normal'), normal_from_height(hgt, pxm), size, kind='normal')
    if extra:
        save(extra, np.clip(rough, 0, 1), size, kind='roughness', note='Shared by the board floors.')


def herringbone_floor():
    """Oak herringbone, 90 x 450 mm blocks at 45 degrees. The pattern repeats every 2n*w*sqrt(2)."""
    rng = np.random.default_rng(21)
    w_m, n = 0.09, 5
    period = 2 * n * w_m * math.sqrt(2)
    pxm = S / period
    tone, pores, _ = wood_field(1024, 1024, rng, rings=30)
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)
    X, Y = (xs + 0.5) / pxm, (S - ys - 0.5) / pxm
    c = math.sqrt(0.5)
    u, v = (X * c + Y * c) / w_m, (-X * c + Y * c) / w_m
    # lattice a=(1,1), b=(n,-n); one tile = H [0,n]x[0,1] plus V [-1,0]x[0,n]
    jr, ir = (u - v) / (2 * n), (u + v) / 2
    found = np.zeros(u.shape, bool)
    bid = np.zeros(u.shape, np.int64)
    lu = np.zeros(u.shape, np.float32)
    lv = np.zeros(u.shape, np.float32)
    for di in range(-2, 3):
        for dj in range(-2, 3):
            i = np.floor(ir).astype(np.int64) + di
            j = np.floor(jr).astype(np.int64) + dj
            qu, qv = u - (i + n * j), v - (i - n * j)
            inH = (qu >= 0) & (qu < n) & (qv >= 0) & (qv < 1) & ~found
            inV = (qu >= -1) & (qu < 0) & (qv >= 0) & (qv < n) & ~found
            key = (i % (2 * n)) * 1000 + (j % 4) * 10
            bid[inH], lu[inH], lv[inH] = key[inH] + 1, qu[inH], qv[inH]
            found |= inH
            bid[inV], lu[inV], lv[inV] = key[inV] + 2, qv[inV], qu[inV] + 1
            found |= inV
    ids, inv = np.unique(bid, return_inverse=True)
    inv = inv.reshape(bid.shape)
    kk = rng.normal(0, 0.09, len(ids)).astype(np.float32)[inv]
    ox, oy = rng.integers(0, 1000, len(ids))[inv], rng.integers(0, 1000, len(ids))[inv]
    br = rng.uniform(0.9, 1.07, len(ids)).astype(np.float32)[inv]
    rr = ((lu / n) * 380 + oy).astype(np.int64) % 1024
    cc = (lv * 76 + ox).astype(np.int64) % 1024
    t = np.clip(tone[rr, cc] + kk, 0, 1)
    p = pores[rr, cc]
    col = ramp(t, [(0.0, '#DDB487'), (0.55, '#C59567'), (1.0, '#966841')]) * (1 - 0.18 * p)[..., None] * br[..., None]
    edge = np.minimum(np.minimum(lu, n - lu) * w_m, np.minimum(lv, 1 - lv) * w_m) * pxm
    bevel = np.clip(edge / 1.6, 0, 1)
    col *= (0.6 + 0.4 * bevel)[..., None]
    size = round(period, 4)
    save('kitchen-floor-herringbone-albedo.png', col, size, note='Oak herringbone, 90 x 450 mm blocks.', tint=True)
    save('kitchen-floor-herringbone-normal.png', normal_from_height(bevel * 0.001, pxm), size, kind='normal')


# ---------------------------------------------------------------- stone

def marble(name, size, base_hi, base_lo, vein, vein2, seed):
    """Domain-warped ridged noise: bold veins that branch, a fine crack network and soft clouding."""
    rng = np.random.default_rng(seed)
    wx = fbm(S, S, 2, 2, rng, octaves=4) - 0.5
    wy = fbm(S, S, 2, 2, rng, octaves=4) - 0.5
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)

    def warped(field, amt):
        return field[(ys + wy * amt * S).astype(np.int64) % S, (xs + wx * amt * S).astype(np.int64) % S]

    r1 = 1 - np.abs(norm01(warped(fbm(S, S, 3, 2, rng, octaves=5), 0.35)) * 2 - 1)
    main = np.clip((r1 - 0.945) / 0.055, 0, 1) ** 1.6
    r2 = 1 - np.abs(norm01(warped(fbm(S, S, 6, 5, rng, octaves=5, gain=0.55), 0.2)) * 2 - 1)
    thin = np.clip((r2 - 0.965) / 0.035, 0, 1) ** 2
    fade = np.clip(fbm(S, S, 3, 3, rng, octaves=3) * 2.2 - 0.5, 0, 1)
    fade2 = np.clip(fbm(S, S, 4, 4, rng, octaves=3) * 2.0 - 0.6, 0, 1)
    base = ramp(norm01(fbm(S, S, 3, 3, rng, octaves=6, gain=0.55)), [(0.0, base_hi), (1.0, base_lo)])
    vm = main * (0.35 + 0.65 * fade)
    halo = blur(vm, 4) * 0.45 + blur(vm, 14) * 0.25
    col = lerp(base, hexrgb(vein2), np.clip(halo, 0, 1) * 0.55)
    col = lerp(col, hexrgb(vein), np.clip(vm, 0, 1) * 0.85)
    col = lerp(col, hexrgb(vein2), np.clip(thin * fade2, 0, 1) * 0.45)
    col += (noise(S, S, S // 4, S // 4, rng) - 0.5)[..., None] * 0.012
    save(name, col, size, note='Polished stone slab.')


def make_stone():
    marble('kitchen-stone-marble-albedo.png', 1.6, '#F5F3EF', '#E2DED7', '#8C857B', '#ABA49A', 31)
    marble('kitchen-stone-nero-albedo.png', 1.6, '#262629', '#161618', '#D2CDC4', '#7E7A74', 32)
    rng = np.random.default_rng(33)
    cloud = fbm(S, S, 3, 3, rng, octaves=5)
    col = ramp(cloud, [(0, '#F4F3EF'), (1, '#E9E6E0')])
    sp = rng.random((S, S))
    col[sp > 0.996] *= 0.84
    col[sp < 0.004] = hexrgb('#FBFBF9')
    save('kitchen-stone-quartz-albedo.png', blur_rgb(col, 0.6), 0.8, note='White quartz with a fine speckle.')
    rng = np.random.default_rng(34)
    c1 = fbm(S, S, 4, 4, rng, octaves=7, gain=0.55)
    c2 = fbm(S, S, 16, 16, rng, octaves=4)
    col = ramp(norm01(c1 * 0.7 + c2 * 0.3), [(0, '#B2AFAA'), (0.5, '#A19E99'), (1, '#8A8782')])
    holes = blur((rng.random((S, S)) > 0.9992).astype(np.float32), 0.9) * 6
    col *= (1 - np.clip(holes, 0, 0.5))[..., None]
    save('kitchen-stone-concrete-albedo.png', col, 1.0, note='Concrete-effect worktop with pinholes.', tint=True)
    save('kitchen-stone-concrete-roughness.png', np.clip(0.55 + (c2 - 0.5) * 0.3, 0, 1), 1.0, kind='roughness')
    terrazzo()


def terrazzo():
    rng = np.random.default_rng(35)
    size = 0.6
    pxm = S / size
    base = ramp(fbm(S, S, 6, 6, rng, octaves=4), [(0, '#EDE6DB'), (1, '#E2D9CB')])
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'RGB')
    big = Image.new('RGB', (S * 3, S * 3))
    for i in range(3):
        for j in range(3):
            big.paste(img, (i * S, j * S))
    d = ImageDraw.Draw(big)
    palette = ['#B4876A', '#C99A7C', '#9E6B52', '#8E8B86', '#D8D3CB', '#FFFFFF', '#3B3A39', '#C7A48B', '#A8A49E']
    weights = [0.18, 0.14, 0.08, 0.14, 0.14, 0.12, 0.05, 0.1, 0.05]
    for _ in range(1700):
        r = rng.choice([0.002, 0.003, 0.004, 0.006, 0.009, 0.013], p=[0.3, 0.25, 0.2, 0.13, 0.08, 0.04]) * pxm * rng.uniform(0.7, 1.3)
        cx, cy, colr = rng.random() * S, rng.random() * S, rng.choice(palette, p=weights)
        nv = int(rng.integers(5, 9))
        ang = np.sort(rng.random(nv)) * 2 * math.pi
        rad = r * rng.uniform(0.6, 1.25, nv)
        squash = rng.uniform(0.7, 1.0)
        for ox in (0, S, 2 * S):
            for oy in (0, S, 2 * S):
                d.polygon([(ox + cx + math.cos(a) * q, oy + cy + math.sin(a) * q * squash) for a, q in zip(ang, rad)], fill=colr)
    a = np.asarray(big, dtype=np.float32)[S:2 * S, S:2 * S] / 255.0
    a = blur_rgb(a, 0.5) + (noise(S, S, S // 4, S // 4, rng) - 0.5)[..., None] * 0.03
    save('kitchen-stone-terrazzo-albedo.png', a, size, note='Pale terrazzo with terracotta, grey and white chips.')


# ---------------------------------------------------------------- tiles

def metro(name, grout_hex, seed):
    rng = np.random.default_rng(seed)
    size, tw, th, g = 0.6, 0.2, 0.1, 0.002
    tid, edge, lx, ly = tiles_grid(size, tw, th, offset_rows=True)
    tone = per_tile(tid, lambda: rng.normal(0, 0.018))
    inside = edge > g / 2
    bev = np.clip((edge - g / 2) / 0.006, 0, 1)
    glaze = fbm(S, S, 8, 8, rng, octaves=3) - 0.5
    col = np.where(inside[..., None], hexrgb('#F5F3EE') * (1 + tone[..., None] + glaze[..., None] * 0.03), hexrgb(grout_hex))
    col = np.where(((bev < 1) & inside)[..., None], col * (0.94 + 0.06 * bev[..., None]), col)
    save(name, col, size, note='Metro tiles 200 x 100 mm, brick bond, bevelled edge. White, tinted to the card colour.', tint=True)
    hgt = np.where(inside, 0.0012 + 0.003 * np.sin(bev * math.pi / 2), 0.0)
    return hgt, S / size, inside, size


def make_tiles():
    hgt, pxm, inside, size = metro('kitchen-tile-metro-albedo.png', '#D3CEC5', 41)
    metro('kitchen-tile-metro-dark-grout-albedo.png', '#3A3A3A', 41)
    save('kitchen-tile-metro-normal.png', normal_from_height(blur(hgt, 0.7), pxm), size, kind='normal')
    save('kitchen-tile-metro-roughness.png', np.where(inside, 0.08, 0.8).astype(np.float32), size, kind='roughness')

    # zellige: 100 mm hand-made squares with an uneven glaze and surface
    rng = np.random.default_rng(42)
    size = 0.6
    pxm = S / size
    tid, edge, lx, ly = tiles_grid(size, 0.1, 0.1)
    jit = (fbm(S, S, 30, 30, rng, octaves=3) - 0.5) * 0.0025
    inside = (edge + jit) > 0.0012
    tone = per_tile(tid, lambda: rng.normal(0, 0.05))
    warm = per_tile(tid, lambda: rng.normal(0, 0.03))
    pool = fbm(S, S, 12, 12, rng, octaves=4)
    col = np.ones((S, S, 3), np.float32) * hexrgb('#F3EFE8') * (1 + tone[..., None] + (pool[..., None] - 0.5) * 0.16)
    col[..., 2] *= (1 - np.clip(warm, 0, 0.08))
    col *= (0.88 + 0.12 * np.clip(edge / 0.008, 0, 1))[..., None]
    col = np.where(inside[..., None], col, hexrgb('#D2CBBF'))
    save('kitchen-tile-zellige-albedo.png', col, size, note='Zellige 100 mm squares, white glaze, tinted to the card colour.', tint=True)
    pil = np.clip(edge / 0.01, 0, 1) ** 0.5 * 0.0015
    wav = (fbm(S, S, 14, 14, rng, octaves=4) - 0.5) * 0.0024
    tilt = per_tile(tid, lambda: rng.normal(0, 0.0008))
    hgt = np.where(inside, 0.002 + pil + wav + tilt * (lx - 0.05) * 20, 0.0)
    save('kitchen-tile-zellige-normal.png', normal_from_height(blur(hgt, 0.8), pxm), size, kind='normal')
    save('kitchen-tile-zellige-roughness.png', np.where(inside, 0.05 + pool * 0.12, 0.85).astype(np.float32), size, kind='roughness')

    # large-format porcelain floor, 600 x 600
    rng = np.random.default_rng(43)
    size = 1.2
    tid, edge, lx, ly = tiles_grid(size, 0.6, 0.6)
    inside = edge > 0.0015
    tone = per_tile(tid, lambda: rng.normal(0, 0.015))
    cloud = fbm(S, S, 6, 6, rng, octaves=6, gain=0.55)
    col = ramp(cloud, [(0, '#DCD8D1'), (1, '#CCC7BF')]) * (1 + tone[..., None])
    col += (noise(S, S, 256, 256, rng) - 0.5)[..., None] * 0.025
    col = np.where(inside[..., None], col, hexrgb('#B3AEA6'))
    save('kitchen-floor-porcelain-albedo.png', col, size, note='Porcelain 600 x 600 mm, 3 mm grout.', tint=True)
    save('kitchen-floor-porcelain-normal.png', normal_from_height(blur(np.where(inside, 0.001, 0.0), 0.8), S / size), size, kind='normal')

    # black and white chequer, 300 mm tiles
    rng = np.random.default_rng(44)
    tid, edge, lx, ly = tiles_grid(size, 0.3, 0.3)
    black = ((tid // 1000 + tid % 1000) % 2) == 1
    inside = edge > 0.001
    tone = per_tile(tid, lambda: rng.normal(0, 0.03))
    cloud = fbm(S, S, 8, 8, rng, octaves=5)
    col = np.where(black[..., None], ramp(cloud, [(0, '#2A2A2D'), (1, '#1B1B1D')]), ramp(cloud, [(0, '#F1EEE8'), (1, '#E4DFD6')]))
    col = np.where(inside[..., None], col * (1 + tone[..., None]), hexrgb('#8C8880'))
    save('kitchen-floor-chequer-albedo.png', col, size, note='Black and white chequer, 300 mm tiles.')
    save('kitchen-floor-chequer-normal.png', normal_from_height(blur(np.where(inside, 0.001, 0.0), 0.8), S / size), size, kind='normal')

    # polished concrete-effect floor
    rng = np.random.default_rng(45)
    size = 3.0
    c1 = fbm(S, S, 3, 3, rng, octaves=8, gain=0.58)
    c2 = fbm(S, S, 12, 12, rng, octaves=5)
    trowel = noise(S, S, 6, 40, rng)
    col = ramp(norm01(c1 * 0.65 + c2 * 0.25 + trowel * 0.1), [(0, '#A6A39D'), (0.5, '#95928D'), (1, '#7E7B76')])
    save('kitchen-floor-concrete-albedo.png', col, size, note='Polished concrete-effect floor.', tint=True)
    save('kitchen-floor-concrete-roughness.png', np.clip(0.3 + (c2 - 0.5) * 0.25 + (trowel - 0.5) * 0.1, 0, 1), size, kind='roughness')


# ---------------------------------------------------------------- walls

def make_walls():
    # exposed red brick, 215 x 65 mm with 10 mm lime mortar
    rng = np.random.default_rng(51)
    size, bw, bh, j = 0.9, 0.225, 0.075, 0.01
    pxm = S / size
    tid, edge, lx, ly = tiles_grid(size, bw, bh, offset_rows=True)
    inside = (edge + (fbm(S, S, 60, 60, rng, octaves=3) - 0.5) * 0.004) > j / 2
    tone = per_tile(tid, lambda: rng.normal(0, 0.1))
    hue = per_tile(tid, lambda: rng.normal(0, 0.06))
    burn = per_tile(tid, lambda: float(rng.random() < 0.18))
    base = ramp(fbm(S, S, 40, 40, rng, octaves=4), [(0, '#A35A41'), (0.5, '#8E4E39'), (1, '#6E3B2B')]) * (1 + tone[..., None])
    base[..., 1] *= (1 + hue)
    base[..., 2] *= (1 + hue * 1.4)
    base = lerp(base, base * np.array([0.55, 0.5, 0.5], np.float32), burn * 0.6)
    base *= (1 - np.clip(fbm(S, S, 3, 3, rng, octaves=4) - 0.4, 0, 1) * 0.3)[..., None]
    mortar = ramp(fbm(S, S, 50, 50, rng, octaves=3), [(0, '#C9BFAE'), (1, '#AEA392')])
    save('kitchen-wall-brick-albedo.png', np.where(inside[..., None], base, mortar), size, note='Exposed red brick, 215 x 65 mm, 10 mm lime mortar.')
    pits = (noise(S, S, 120, 120, rng) - 0.5) * 0.0015
    hgt = np.where(inside, 0.008 + pits + np.clip(edge / 0.004, 0, 1) * 0.002, 0.002 + pits * 0.5)
    save('kitchen-wall-brick-normal.png', normal_from_height(blur(hgt, 0.8), pxm, 0.6), size, kind='normal')

    rng = np.random.default_rng(52)
    col = ramp(fbm(S, S, 4, 4, rng, octaves=7, gain=0.6), [(0, '#FBFAF8'), (1, '#EFEDE9')])
    save('kitchen-wall-plaster-albedo.png', col, 2.0, note='Painted plaster, near white so it tints to any wall colour.', tint=True)

    rng = np.random.default_rng(53)
    c1 = fbm(S, S, 3, 3, rng, octaves=8, gain=0.6)
    c2 = fbm(S, S, 10, 10, rng, octaves=5)
    col = ramp(norm01(c1 * 0.7 + c2 * 0.3), [(0, '#F6F4F1'), (0.5, '#E6E2DC'), (1, '#CFCAC3')])
    save('kitchen-wall-microcement-albedo.png', col, 2.0, note='Microcement wall, light so it tints to the card colour.', tint=True)


# ---------------------------------------------------------------- metal, hob, fabric, view

def make_misc():
    rng = np.random.default_rng(61)
    lines = (noise(S, S, 3, S, rng) * 0.6 + noise(S, S, 2, S // 2, rng) * 0.4).T  # brushing runs along u
    save('kitchen-metal-brushed-roughness.png', np.clip(0.22 + (lines - 0.5) * 0.25, 0, 1), 0.2, kind='roughness', note='Brushed metal, brushing along u.')

    size = 1.0
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32) / S * size
    ys = size - ys
    mask = np.zeros((S, S), np.float32)
    for cx, cy, r in [(0.25, 0.3, 0.1), (0.25, 0.7, 0.085), (0.5, 0.5, 0.12), (0.75, 0.3, 0.085), (0.75, 0.7, 0.1)]:
        d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
        mask = np.maximum(mask, np.exp(-((d - r) ** 2) / 0.000004))
    mask = np.maximum(mask, ((np.abs(ys - 0.08) < 0.012) & (np.abs(xs - 0.5) < 0.16)) * 0.5)
    col = lerp(np.ones((S, S, 3), np.float32) * hexrgb('#111113'), hexrgb('#5D5E62'), mask)
    save('kitchen-hob-induction-albedo.png', col, size, note='Black glass induction hob with printed zones. One tile is the whole hob.')

    rng = np.random.default_rng(62)
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)
    weave = (np.sin(xs * math.pi / 3) * np.sin(ys * math.pi / 3)) * 0.5 + 0.5
    v = ys / S
    stripes = ((np.abs(v - 0.07) < 0.012) | (np.abs(v - 0.93) < 0.012) | (np.abs(v - 0.11) < 0.004) | (np.abs(v - 0.89) < 0.004)).astype(np.float32)
    t = 0.88 + 0.06 * weave + (fbm(S, S, 8, 8, rng, octaves=3) - 0.5) * 0.08 - stripes * 0.25
    save('kitchen-fabric-rug-albedo.png', np.stack([t, t * 0.985, t * 0.97], -1), 1.0, note='Flat-weave rug, one tile is the whole rug, tinted.', tint=True)

    rng = np.random.default_rng(63)
    b = noise(512, 512, 128, 128, rng) * 0.5 + noise(512, 512, 64, 64, rng) * 0.5
    t = 0.86 + (b - 0.5) * 0.25
    save('kitchen-fabric-boucle-albedo.png', np.asarray(Image.fromarray((np.stack([t, t * 0.99, t * 0.98], -1) * 255).astype(np.uint8), 'RGB').resize((S, S), Image.BICUBIC)) / 255.0,
         0.3, note='Boucle upholstery, tinted.', tint=True)
    garden()


def garden():
    rng = np.random.default_rng(71)
    W, H = 1024, 768
    v = np.mgrid[0:H, 0:W][0].astype(np.float32) / H
    img = ramp(v / 0.55, [(0, '#C7D9E6'), (1, '#EEF1EC')])
    far = fbm(H, W, 4, 10, rng, octaves=5)
    m = (v > 0.30 + far[0:1, :] * 0.18) & (v < 0.95)
    img = np.where(m[..., None], ramp(fbm(H, W, 6, 12, rng, octaves=4), [(0, '#9DB28E'), (1, '#6F8763')]), img)
    near = fbm(H, W, 3, 8, rng, octaves=5)
    m2 = v > 0.55 + near[0:1, :] * 0.12
    img = np.where(m2[..., None], ramp(fbm(H, W, 10, 20, rng, octaves=4), [(0, '#7F9A6B'), (0.5, '#5E7A4F'), (1, '#425C39')]), img)
    img = np.where((v > 0.86)[..., None], ramp(fbm(H, W, 4, 16, rng), [(0, '#86A06A'), (1, '#6E8A57')]), img)
    img = img * (1 + np.clip(fbm(H, W, 5, 9, rng, octaves=3) - 0.45, 0, 1)[..., None] * 0.5)
    img = blur_rgb(img, 7)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'kitchen-view-garden.png'), optimize=True)
    MANIFEST['kitchen-view-garden.png'] = {'kind': 'emission', 'px': W, 'note': 'Out-of-focus garden seen through the window. Not tiled.'}
    print('  kitchen-view-garden.png')


GROUPS = {
    'wood': make_wood,
    'floor-oak': lambda: plank_floor('kitchen-floor-oak-albedo.png', '#E2BC90', '#CDA273', '#A07448', 81, extra='kitchen-floor-boards-roughness.png'),
    'floor-smoked': lambda: plank_floor('kitchen-floor-smoked-oak-albedo.png', '#806250', '#654B38', '#3C2B1E', 82),
    'herringbone': herringbone_floor,
    'stone': make_stone,
    'tiles': make_tiles,
    'walls': make_walls,
    'misc': make_misc,
}


def main():
    sel = sys.argv[1:] or list(GROUPS)
    if os.path.exists(MANIFEST_PATH):
        MANIFEST.update(json.load(open(MANIFEST_PATH)).get('textures', {}))
    for name in sel:
        for k in ([name] if name in GROUPS else [k for k in GROUPS if name in k]):
            print(k)
            GROUPS[k]()
    doc = {
        'about': 'Procedural textures for the Riverside kitchen generator (tools/blender/kitchen_textures.py, used by tools/blender/kitchen.py). '
                 'Replace any file with a photographic texture of the same real-world size (tileMetres) and the same name. '
                 'Albedo files marked tintable are multiplied by a card colour, so keep replacements light and neutral; '
                 'update meanLinear (the mean linear RGB) if you replace one.',
        'textures': dict(sorted(MANIFEST.items())),
    }
    with open(MANIFEST_PATH, 'w') as f:
        json.dump(doc, f, indent=2)
        f.write('\n')


if __name__ == '__main__':
    main()
