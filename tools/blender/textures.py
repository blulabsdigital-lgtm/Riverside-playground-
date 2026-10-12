"""Procedural PNG textures for the Riverside extension scene.

Writes seamless (tileable) colour maps and matching OpenGL-style normal maps to
lab/assets/textures/. Each file covers a fixed real-world size, listed in
lab/assets/textures/extension-textures.json, so a Nano Banana texture can replace any
colour map file-for-file later: keep the same name, the same tile size and the
same layout (for example 8 Flemish bond units across for the brick).

Run:  <blender-env>/bin/python tools/blender/textures.py
Needs numpy and Pillow (both installed in the Blender env).
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'lab', 'assets', 'textures')
N = 1024  # every texture is at most 1024 px so the glb stays small

MANIFEST = []


# ---------------------------------------------------------------- helpers
def fft_blur(a, sx, sy=None):
    """Periodic gaussian blur (sigma in px), so results tile seamlessly."""
    sy = sx if sy is None else sy
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * ((fx * sx) ** 2 + (fy * sy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def noise(rng, h, w, sx, sy=None):
    """Tileable band-limited noise, normalised to mean 0 and std 1."""
    n = fft_blur(rng.standard_normal((h, w)), sx, sy)
    n -= n.mean()
    s = n.std()
    return n / s if s > 0 else n


def fractal(rng, h, w, base, octaves=4, gain=0.5, aniso=1.0):
    out = np.zeros((h, w))
    amp, s, tot = 1.0, base, 0.0
    for _ in range(octaves):
        out += amp * noise(rng, h, w, s * aniso, s)
        tot += amp
        amp *= gain
        s = max(s / 2.0, 0.5)
    return out / tot


def normal_from_height(hmm, mm_per_px_x, mm_per_px_y, strength=1.0):
    """Height in mm -> OpenGL normal map (green up), periodic edges."""
    dx = (np.roll(hmm, -1, 1) - np.roll(hmm, 1, 1)) / (2 * mm_per_px_x)
    drow = (np.roll(hmm, -1, 0) - np.roll(hmm, 1, 0)) / (2 * mm_per_px_y)
    nx, ny, nz = -dx * strength, drow * strength, np.ones_like(hmm)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / ln, ny / ln, nz / ln], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)


def save_rgb(arr, name, size_m, desc, prompt, normal=None, rgba=False):
    os.makedirs(OUT, exist_ok=True)
    a = np.clip(arr, 0, 255).astype(np.uint8)
    Image.fromarray(a, 'RGBA' if rgba else 'RGB').save(os.path.join(OUT, name + '.png'), optimize=True)
    entry = {'file': name + '.png', 'tileMetres': size_m, 'description': desc, 'replacePrompt': prompt}
    if normal is not None:
        Image.fromarray(normal, 'RGB').save(os.path.join(OUT, name + '-normal.png'), optimize=True)
        entry['normal'] = name + '-normal.png'
    MANIFEST.append(entry)
    print('wrote', name, a.shape)


def pick(rng, palette, weights, n):
    p = np.array(weights, float)
    idx = rng.choice(len(palette), size=n, p=p / p.sum())
    return np.array(palette, float)[idx]


def srgb_lerp(a, b, t):
    return a * (1 - t) + b * t


# ---------------------------------------------------------------- brick
def brick_london_stock(seed=11):
    """Flemish bond London stock: 5 units (stretcher + header) across, 22 courses up."""
    rng = np.random.default_rng(seed)
    unit, course_h = 337.5, 75.0
    tw, th = 5 * unit, 22 * course_h  # 1687.5 x 1650 mm
    mx, my = tw / N, th / N
    X, Y = np.meshgrid((np.arange(N) + 0.5) * mx, (np.arange(N) + 0.5) * my)
    course = np.floor(Y / course_h).astype(int)
    ly = Y - course * course_h  # 0 at top of course
    shift = (course % 2) * 168.75
    xs_all = np.mod(X - shift, tw)
    u = np.floor(xs_all / unit).astype(int)
    xs = xs_all - u * unit
    header = xs >= 225.0
    dx = np.where(header, np.minimum(xs - 225.0, 327.5 - xs), np.minimum(xs, 215.0 - xs))
    dy = np.minimum(ly, 65.0 - ly)
    d = np.minimum(dx, dy)  # mm inside brick, negative in mortar
    # ragged arrises
    jag = noise(rng, N, N, 1.2) * 0.9 + np.maximum(noise(rng, N, N, 2.5), 1.6) * 1.4 - 2.2
    dj = d + jag * 0.9
    is_brick = dj > 0
    bid = course * 10 + u * 2 + header.astype(int)
    nb = int(bid.max()) + 1

    pal = [(198, 168, 112), (186, 152, 100), (172, 140, 97), (210, 187, 138), (157, 125, 90),
           (178, 130, 92), (130, 112, 94), (100, 88, 80), (192, 160, 118)]
    wts = [0.22, 0.18, 0.14, 0.09, 0.1, 0.08, 0.08, 0.04, 0.07]
    base = pick(rng, pal, wts, nb) * rng.uniform(0.9, 1.07, (nb, 1))
    base = base * 0.86 + base.mean(1, keepdims=True) * 0.14  # weathered, less saturated
    base_px = base[bid]

    # mottling, kiln flashing and dark inclusions typical of stock bricks
    mot = fractal(rng, N, N, 3.0, 4)
    blot = noise(rng, N, N, 12.0)
    flash_amt = rng.uniform(0, 1, nb) ** 2.5 * 0.5
    ang = rng.uniform(0, 2 * np.pi, nb)
    blen = np.where(header, 102.5, 215.0)
    lxb = np.where(header, xs - 225.0, xs) / blen - 0.5
    lyb = ly / 65.0 - 0.5
    grad = np.cos(ang)[bid] * lxb * 2 + np.sin(ang)[bid] * lyb * 2 + 0.25 * noise(rng, N, N, 6.0)
    flash = flash_amt[bid] * np.clip(grad, 0, 1) ** 1.5
    dark = np.array([92, 72, 56], float)
    col = base_px * (1 + 0.055 * mot[..., None]) * (1 + 0.06 * blot[..., None])
    col = srgb_lerp(col, dark, flash[..., None])
    speck = noise(rng, N, N, 0.7)
    sp = np.clip((speck - 2.1) * 1.5, 0, 1)
    col = srgb_lerp(col, np.array([55, 45, 38.0]), sp[..., None] * 0.85)
    pale = np.clip((noise(rng, N, N, 1.0) - 2.6) * 1.5, 0, 1)
    col = srgb_lerp(col, np.array([225, 210, 175.0]), pale[..., None] * 0.6)
    # arris shading (subtle, the normal map does most of the work)
    edge = np.clip(dj / 3.0, 0, 1)
    col *= (0.86 + 0.14 * edge)[..., None]

    # lime mortar, slightly recessed and darker under each brick
    sand = fractal(rng, N, N, 0.8, 2)
    mort = np.array([163, 156, 140], float) * (1 + 0.07 * sand[..., None])
    shade = np.clip(1 - (ly - 65.0) / 10.0, 0, 1)  # bed joint top is in the brick's shadow
    shade = np.where((ly > 65.0), shade, 0)
    mort *= (1 - 0.18 * shade)[..., None]
    out = np.where(is_brick[..., None], col, mort)

    # weathering and soot streaks across the whole wall
    grime = noise(rng, N, N, 90.0) * 0.6 + noise(rng, N, N, 6.0, 60.0) * 0.4
    out *= (1 + 0.05 * grime)[..., None]

    h = np.where(is_brick, 6.0 * np.clip(dj / 2.0, 0, 1) ** 0.6 + 0.35 * mot - 0.25 * sp, 0.4 * sand)
    nrm = normal_from_height(h, mx, my, 1.0)
    save_rgb(out, 'brick-london-stock', [round(tw / 1000, 4), round(th / 1000, 4)],
             'Yellow London stock brick in Flemish bond with lime mortar. 5 bond units (stretcher plus header) across, 22 courses up.',
             'A seamless, tileable, straight-on photographic texture of a weathered yellow London stock brick wall in Flemish bond '
             '(alternating stretchers and headers in every course), 5 stretcher-header pairs across and 22 courses high, light grey-cream '
             'lime mortar, natural variation with darker brown and grey bricks and dark specks, flat even lighting, no shadows, no objects, no text.',
             nrm)


def brick_red_soldier(seed=5):
    """Red rubbed brick soldier course for window heads: 16 soldiers across 1.2 m, 0.3 m tall."""
    rng = np.random.default_rng(seed)
    tw, th = 1200.0, 300.0
    W, H = N, 256
    mx, my = tw / W, th / H
    X, Y = np.meshgrid((np.arange(W) + 0.5) * mx, (np.arange(H) + 0.5) * my)
    xs = np.mod(X, 75.0)
    sid = np.floor(X / 75.0).astype(int)
    # brick from y=37.5..262.5 (bed joints top and bottom), 3 mm fine joints between soldiers
    dx = np.minimum(xs - 1.5, 73.5 - xs)
    dy = np.minimum(Y - 40.0, 260.0 - Y)
    d = np.minimum(dx, dy)
    is_b = d > 0
    pal = [(170, 82, 58), (160, 76, 55), (182, 92, 64), (150, 70, 52), (176, 98, 72)]
    base = pick(rng, pal, [1, 1, 1, 0.7, 0.6], sid.max() + 1) * rng.uniform(0.93, 1.05, (sid.max() + 1, 1))
    mot = fractal(rng, H, W, 2.5, 3)
    col = base[sid] * (1 + 0.05 * mot[..., None])
    col *= (0.88 + 0.12 * np.clip(d / 2.5, 0, 1))[..., None]
    mort = np.array([184, 176, 160], float) * (1 + 0.05 * noise(rng, H, W, 0.8)[..., None])
    out = np.where(is_b[..., None], col, mort)
    h = np.where(is_b, 4.0 * np.clip(d / 1.5, 0, 1) + 0.2 * mot, 0.0)
    save_rgb(out, 'brick-red-soldier', [1.2, 0.3],
             'Red rubbed brick soldier course used over the original sash windows. 16 upright bricks across.',
             'A seamless horizontal strip texture of a red rubbed brick soldier course (16 upright bricks side by side with very fine joints), '
             'straight on, flat even lighting, no text.',
             normal_from_height(h, mx, my))


# ---------------------------------------------------------------- slate
def slate_welsh(seed=21):
    """Welsh blue-grey slates 500 x 250, 200 mm gauge: 8 slates across, 10 courses up (2 x 2 m)."""
    rng = np.random.default_rng(seed)
    tw = th = 2000.0
    mx, my = tw / N, th / N
    X, Y = np.meshgrid((np.arange(N) + 0.5) * mx, (np.arange(N) + 0.5) * my)
    gauge, sw = 200.0, 250.0
    course = np.floor(Y / gauge).astype(int)
    ly = Y - course * gauge  # 0 at top of exposed part, gauge at the tail
    shift = (course % 2) * 125.0
    xx = np.mod(X - shift, tw)
    k = np.floor(xx / sw).astype(int)
    lx = xx - k * sw
    sid = course * 8 + k
    ns = int(sid.max()) + 1
    jx = rng.uniform(-3, 3, ns)
    gap = rng.uniform(2.5, 4.5, ns)
    tail = rng.uniform(-4, 3, ns)  # ragged tails
    edge_n = noise(rng, N, N, 1.5) * 0.8
    lxj = lx - jx[sid]
    in_x = (lxj > gap[sid] / 2 + edge_n * 0.4) & (lxj < sw - gap[sid] / 2 + edge_n * 0.4)
    tail_line = gauge + tail[sid] + noise(rng, N, N, 3.0, 1.0) * 1.2
    pal = [(74, 78, 90), (66, 70, 82), (82, 84, 96), (70, 72, 80), (88, 86, 98), (62, 66, 74), (78, 80, 86), (92, 94, 104)]
    base = pick(rng, pal, [1, 1, 0.8, 0.9, 0.5, 0.7, 0.8, 0.35], ns) * rng.uniform(0.92, 1.08, (ns, 1))
    riv = fractal(rng, N, N, 3.0, 4, aniso=6.0)
    fine = noise(rng, N, N, 0.6)
    col = base[sid] * (1 + 0.05 * riv[..., None] + 0.03 * fine[..., None])
    # lichen and lime bloom, sparse
    lich = np.clip((noise(rng, N, N, 2.0) - 2.7) * 1.2, 0, 1)
    col = srgb_lerp(col, np.array([140, 140, 120.0]), lich[..., None] * 0.5)
    # shadow below the tail of the course above (top of each exposed area)
    sh = np.clip(1 - ly / 14.0, 0, 1) ** 1.5
    col *= (1 - 0.45 * sh)[..., None]
    # light catch on each tail edge
    hl = np.clip(1 - np.abs(ly - (gauge - 4.0)) / 3.0, 0, 1)
    col *= (1 + 0.12 * hl)[..., None]
    gapcol = np.array([26, 27, 31.0])
    out = np.where(in_x[..., None], col, gapcol)
    tilt = rng.uniform(-0.6, 0.6, ns)
    h = 2.0 + 5.0 * (ly / gauge) + tilt[sid] * (lx / sw) + 0.25 * riv
    h = np.where(in_x, h, 0.5)
    save_rgb(out, 'slate-welsh', [2.0, 2.0],
             'Natural Welsh blue-grey roof slates, 500 x 250 mm laid at 200 mm gauge. 8 slates across, 10 courses up.',
             'A seamless, tileable, straight-on texture of a natural Welsh blue-grey slate roof, rectangular slates 8 across and 10 courses '
             'high in broken bond, slight purple tint and riven surface, thin dark gaps, flat even lighting, no text.',
             normal_from_height(h, mx, my, 1.0))


# ---------------------------------------------------------------- render
def render_white(seed=31):
    rng = np.random.default_rng(seed)
    tw = 2000.0
    m = tw / N
    base = np.array([238, 235, 228], float)
    big = noise(rng, N, N, 120.0)
    mid = noise(rng, N, N, 18.0)
    grain = noise(rng, N, N, 0.6)
    trowel = noise(rng, N, N, 30.0, 6.0)
    col = base * (1 + 0.012 * big + 0.008 * mid + 0.022 * grain + 0.006 * trowel)[..., None]
    h = 0.12 * grain + 0.05 * mid
    save_rgb(col, 'render-white', [2.0, 2.0],
             'Crisp warm-white through-coloured silicone render with a fine sand finish.',
             'A seamless, tileable, straight-on texture of smooth warm-white silicone render with a very fine sand finish, almost uniform, '
             'flat even lighting, no text.',
             normal_from_height(h, m, m, 1.0))


# ---------------------------------------------------------------- lawn
def wrap_lines(draw, x0, y0, x1, y1, fill, width, size):
    for ox in (-size, 0, size):
        for oy in (-size, 0, size):
            draw.line((x0 + ox, y0 + oy, x1 + ox, y1 + oy), fill=fill, width=width)


def lawn(seed=41):
    rng = np.random.default_rng(seed)
    S = N
    img = Image.new('RGB', (S, S), (52, 84, 36))
    hmap = Image.new('L', (S, S), 60)
    dr, dh = ImageDraw.Draw(img), ImageDraw.Draw(hmap)
    n = 120000
    xs, ys = rng.uniform(0, S, n), rng.uniform(0, S, n)
    ang = rng.uniform(0, np.pi, n)
    ln = rng.uniform(4, 13, n)
    t = rng.uniform(0, 1, n) ** 0.8
    dark, light, straw = np.array([38, 66, 28.0]), np.array([112, 146, 64.0]), np.array([150, 150, 82.0])
    cols = srgb_lerp(dark[None], light[None], t[:, None])
    st = rng.uniform(0, 1, n) < 0.04
    cols[st] = srgb_lerp(cols[st], straw[None], 0.6)
    for i in range(n):
        x1, y1 = xs[i] + np.cos(ang[i]) * ln[i], ys[i] + np.sin(ang[i]) * ln[i]
        c = tuple(int(v) for v in cols[i])
        if xs[i] < 16 or ys[i] < 16 or xs[i] > S - 16 or ys[i] > S - 16:
            wrap_lines(dr, xs[i], ys[i], x1, y1, c, 2, S)
            wrap_lines(dh, xs[i], ys[i], x1, y1, int(80 + 170 * t[i]), 2, S)
        else:
            dr.line((xs[i], ys[i], x1, y1), fill=c, width=2)
            dh.line((xs[i], ys[i], x1, y1), fill=int(80 + 170 * t[i]), width=2)
    a = np.asarray(img, float)
    patch = noise(rng, S, S, 70.0)
    patch2 = noise(rng, S, S, 20.0)
    a *= (1 + 0.07 * patch + 0.04 * patch2)[..., None]
    yel = np.clip(noise(rng, S, S, 40.0) - 1.2, 0, 1)
    a = srgb_lerp(a, a * np.array([1.12, 1.02, 0.8]), yel[..., None] * 0.6)
    h = np.asarray(hmap.filter(ImageFilter.GaussianBlur(0.6)), float) / 255.0 * 3.0
    m = 1500.0 / S
    save_rgb(a, 'lawn', [1.5, 1.5], 'Close-mown lawn seen from above, gentle patchiness.',
             'A seamless, tileable, top-down photographic texture of a healthy close-mown English lawn, fine grass blades, subtle '
             'natural colour variation, flat even lighting, no objects, no text.',
             normal_from_height(h, m, m, 0.6))


# ---------------------------------------------------------------- paving
def paving_porcelain(seed=51):
    """900 x 600 outdoor porcelain, 4 across and 6 rows, half bond, 5 mm joints (3.6 x 3.6 m)."""
    rng = np.random.default_rng(seed)
    tw = th = 3600.0
    m = tw / N
    X, Y = np.meshgrid((np.arange(N) + 0.5) * m, (np.arange(N) + 0.5) * m)
    row = np.floor(Y / 600.0).astype(int)
    ly = Y - row * 600.0
    xx = np.mod(X - (row % 2) * 450.0, tw)
    k = np.floor(xx / 900.0).astype(int)
    lx = xx - k * 900.0
    d = np.minimum(np.minimum(lx - 2.5, 897.5 - lx), np.minimum(ly - 2.5, 597.5 - ly))
    sid = row * 4 + k
    ns = int(sid.max()) + 1
    base = np.array([196, 190, 179], float) * rng.uniform(0.95, 1.04, (ns, 1)) + rng.normal(0, 0.8, (ns, 3))
    col = base[sid]
    col *= (1 + 0.025 * noise(rng, N, N, 0.6) + 0.03 * fractal(rng, N, N, 8, 3) + 0.02 * noise(rng, N, N, 1.5, 9.0))[..., None]
    col *= (1 + 0.03 * noise(rng, N, N, 60.0))[..., None]
    col *= (0.9 + 0.1 * np.clip(d / 3.0, 0, 1))[..., None]
    joint = np.array([118, 114, 108.0])
    out = np.where((d > 0)[..., None], col, joint)
    h = np.where(d > 0, 3.0 * np.clip(d / 2.0, 0, 1), 0.0)
    save_rgb(out, 'paving-porcelain', [3.6, 3.6],
             'Light warm-grey outdoor porcelain slabs, 900 x 600 mm in half bond, 4 across and 6 rows, 5 mm joints.',
             'A seamless, tileable, top-down texture of light warm-grey outdoor porcelain paving slabs 900 x 600 mm laid in half bond, '
             '4 slabs across and 6 rows, thin grey joints, subtle sandstone-like variation, flat even lighting, no text.',
             normal_from_height(h, m, m, 1.0))


# ---------------------------------------------------------------- timber
def timber_cedar(seed=61):
    """Western red cedar boards, grain running left to right (1 x 1 m)."""
    rng = np.random.default_rng(seed)
    m = 1000.0 / N
    X, Y = np.meshgrid((np.arange(N) + 0.5) * m, (np.arange(N) + 0.5) * m)
    warp = noise(rng, N, N, 120.0, 14.0) * 9.0 + noise(rng, N, N, 40.0, 4.0) * 2.0
    # knots bend the grain
    kn = np.zeros((N, N))
    for _ in range(5):
        kx, ky, r = rng.uniform(0, 1000), rng.uniform(0, 1000), rng.uniform(6, 12)
        ddx = np.mod(X - kx + 500, 1000) - 500
        ddy = np.mod(Y - ky + 500, 1000) - 500
        rr = np.sqrt((ddx / 2.2) ** 2 + ddy ** 2)
        warp += 14.0 * np.exp(-(rr / (r * 2.5)) ** 2) * np.sign(ddy + 1e-6)
        kn += np.exp(-(rr / r) ** 2)
    rings = np.sin(2 * np.pi * (Y + warp) / 7.0)
    rings2 = np.sin(2 * np.pi * (Y + warp * 1.3) / 2.9)
    late = ((rings + 1) / 2) ** 6 * (0.6 + 0.4 * np.clip(noise(rng, N, N, 60.0, 2.0), -1, 1)) + 0.35 * ((rings2 + 1) / 2) ** 8
    lo, hi = np.array([112, 70, 46.0]), np.array([176, 122, 84.0])
    tband = np.clip(0.55 + 0.16 * noise(rng, N, N, 120.0, 25.0) + 0.08 * noise(rng, N, N, 20.0, 3.0), 0, 1)
    base = srgb_lerp(lo, hi, tband[..., None])
    col = base * (1 - 0.32 * np.clip(late, 0, 1))[..., None] * (1 + 0.04 * noise(rng, N, N, 1.0, 0.4))[..., None]
    col = srgb_lerp(col, np.array([70, 42, 28.0]), np.clip(kn, 0, 1)[..., None] * 0.8)
    grey = np.clip(noise(rng, N, N, 160.0, 30.0) * 0.5 + 0.2, 0, 1) * 0.18
    col = srgb_lerp(col, np.array([150, 140, 128.0]), grey[..., None])
    h = 0.25 * late + 0.1 * noise(rng, N, N, 0.8, 0.3)
    save_rgb(col, 'timber-cedar', [1.0, 1.0], 'Western red cedar fence boards, grain running horizontally.',
             'A seamless, tileable, straight-on texture of planed western red cedar timber, grain running left to right, warm honey and '
             'red-brown tones with a few small knots, flat even lighting, no board joints, no text.',
             normal_from_height(h, m, m, 1.0))


def oak_floor(seed=71):
    """Engineered oak planks 190 mm wide, staggered (1.52 x 1.52 m: 8 planks across)."""
    rng = np.random.default_rng(seed)
    tw = 1520.0
    m = tw / N
    X, Y = np.meshgrid((np.arange(N) + 0.5) * m, (np.arange(N) + 0.5) * m)
    col_i = np.floor(X / 190.0).astype(int)
    lx = X - col_i * 190.0
    offs = rng.uniform(0, tw, 8)
    yy = np.mod(Y + offs[col_i], tw)
    plen = tw / 2
    pk = np.floor(yy / plen).astype(int)
    ly = yy - pk * plen
    pid = col_i * 2 + pk
    d = np.minimum(np.minimum(lx - 0.8, 189.2 - lx), np.minimum(ly - 0.8, plen - 0.8 - ly))
    base = np.array([196, 160, 118], float) * rng.uniform(0.88, 1.08, (16, 1))
    warp = noise(rng, N, N, 6.0, 80.0) * 4.0
    grain = np.sin(2 * np.pi * (X + warp + pid * 37.0) / 5.0)
    col = base[pid] * (1 - 0.08 * np.clip(grain, 0, 1))[..., None] * (1 + 0.04 * noise(rng, N, N, 0.8, 4.0))[..., None]
    col *= (1 + 0.04 * noise(rng, N, N, 3.0, 30.0))[..., None]
    out = np.where((d > 0)[..., None], col, col * 0.55)
    h = np.where(d > 0, 0.6, 0.0) + 0.05 * grain
    save_rgb(out, 'oak-floor', [1.52, 1.52], 'Light engineered oak floor, 190 mm planks, matt lacquer.',
             'A seamless, tileable, top-down texture of light natural engineered oak flooring, 190 mm wide planks running top to bottom, '
             '8 planks across, staggered joints, matt finish, flat even lighting, no text.',
             normal_from_height(h, m, m, 1.0))


# ---------------------------------------------------------------- planting
def leaf_poly(cx, cy, length, width, ang):
    pts = []
    for t in np.linspace(0, 1, 14):
        w = width * np.sin(np.pi * t) ** 0.8 * (1 - 0.25 * t)
        pts.append((t * length, w))
    for t in np.linspace(1, 0, 14):
        w = width * np.sin(np.pi * t) ** 0.8 * (1 - 0.25 * t)
        pts.append((t * length, -w))
    ca, sa = np.cos(ang), np.sin(ang)
    return [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts]


def leaves_cluster(seed=81):
    """RGBA card: a small sprig of broadleaf foliage on transparent background."""
    rng = np.random.default_rng(seed)
    S = 512
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    # twig with side shoots, leaves filling most of the card
    twigs = [((S * 0.5, S * 0.99), (S * 0.5, S * 0.1))]
    for t, side in ((0.3, -1), (0.45, 1), (0.6, -1), (0.72, 1)):
        y = S * (1 - t * 0.9)
        twigs.append(((S * 0.5, y), (S * 0.5 + side * S * 0.36, y - S * 0.22)))
    for (x0, y0), (x1, y1) in twigs:
        dr.line((x0, y0, x1, y1), fill=(78, 62, 44, 255), width=4)
    for _ in range(46):
        (x0, y0), (x1, y1) = twigs[int(rng.integers(0, len(twigs)))]
        t = rng.uniform(0.15, 1.0)
        bx, by = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        base_ang = np.arctan2(y1 - y0, x1 - x0)
        side = rng.choice([-1, 1])
        ang = base_ang + side * rng.uniform(0.4, 1.2) + rng.normal(0, 0.15)
        L = rng.uniform(60, 105)
        Wd = L * rng.uniform(0.26, 0.36)
        g = rng.uniform(0, 1)
        base = np.array([48, 84, 34.0]) * (1 - g) + np.array([116, 150, 62.0]) * g
        c = tuple(int(v) for v in base) + (255,)
        dr.polygon(leaf_poly(bx, by, L, Wd, ang), fill=c)
        ex, ey = bx + np.cos(ang) * L * 0.85, by + np.sin(ang) * L * 0.85
        rib = tuple(int(min(255, v * 1.25)) for v in base) + (255,)
        dr.line((bx, by, ex, ey), fill=rib, width=2)
    a = np.asarray(img, float)
    rng2 = np.random.default_rng(seed + 1)
    shade = 1 + 0.08 * noise(rng2, S, S, 6.0)
    a[..., :3] *= shade[..., None]
    a[..., 3] = np.where(a[..., 3] > 128, 255, 0)
    save_rgb(a, 'leaves-cluster', [0.5, 0.5], 'Leaf sprig on a transparent background, used on tree and shrub cards (alpha cut-out).',
             'A single sprig of fresh green broadleaf foliage (about 25 leaves on a thin twig), isolated on a plain pure white background, '
             'photographed flat from above, even light. (Background must be removed to alpha before use.)',
             rgba=True)


def grass_tuft(seed=91):
    """RGBA card: ornamental grass tuft (straw and green) for border planting."""
    rng = np.random.default_rng(seed)
    S = 512
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    for _ in range(160):
        x0 = S * 0.5 + rng.normal(0, 18)
        ang = -np.pi / 2 + rng.normal(0, 0.42)
        L = rng.uniform(0.55, 0.95) * S
        bend = rng.normal(0, 0.5)
        pts = []
        for t in np.linspace(0, 1, 12):
            a = ang + bend * t * t
            pts.append((x0 + np.cos(a) * L * t, S - 2 + np.sin(a) * L * t))
        g = rng.uniform(0, 1)
        c = np.array([88, 112, 52.0]) * (1 - g) + np.array([205, 182, 120.0]) * g
        dr.line(pts, fill=tuple(int(v) for v in c) + (255,), width=int(rng.integers(2, 4)))
    a = np.asarray(img, float).copy()
    a[..., 3] = np.where(a[..., 3] > 128, 255, 0)
    save_rgb(a, 'grass-tuft', [0.8, 0.8], 'Ornamental grass tuft (Stipa-like) on a transparent background (alpha cut-out).',
             'A single clump of ornamental grass (Stipa tenuissima), blond and green fine blades, isolated on a plain white background, '
             'side view, even light. (Background must be removed to alpha before use.)', rgba=True)


def buxus(seed=101):
    """Clipped box (Buxus) surface, tiny dense leaves, tileable 0.5 x 0.5 m."""
    rng = np.random.default_rng(seed)
    S = N
    img = Image.new('RGB', (S, S), (22, 40, 18))
    hm = Image.new('L', (S, S), 30)
    dr, dh = ImageDraw.Draw(img), ImageDraw.Draw(hm)
    n = 26000
    for _ in range(n):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        ang = rng.uniform(0, np.pi)
        L, Wd = rng.uniform(9, 16), rng.uniform(4, 7)
        g = rng.uniform(0, 1) ** 1.3
        c = np.array([38, 70, 30.0]) * (1 - g) + np.array([104, 140, 58.0]) * g
        for ox in ((-S, 0, S) if (x < 20 or x > S - 20) else (0,)):
            for oy in ((-S, 0, S) if (y < 20 or y > S - 20) else (0,)):
                poly = leaf_poly(x + ox, y + oy, L, Wd / 2, ang)
                dr.polygon(poly, fill=tuple(int(v) for v in c))
                dh.polygon(poly, fill=int(90 + 160 * g))
    a = np.asarray(img, float) * (1 + 0.06 * noise(rng, S, S, 30.0))[..., None]
    h = np.asarray(hm.filter(ImageFilter.GaussianBlur(1.0)), float) / 255.0 * 4.0
    m = 500.0 / S
    save_rgb(a, 'buxus', [0.5, 0.5], 'Clipped box (Buxus) foliage surface for topiary balls.',
             'A seamless, tileable texture of a clipped box (Buxus) hedge surface, dense tiny glossy dark green leaves, flat even light, no text.',
             normal_from_height(h, m, m, 1.0))


def mulch(seed=111):
    rng = np.random.default_rng(seed)
    S = 512
    m = 1000.0 / S
    a = fractal(rng, S, S, 2.0, 4)
    b = noise(rng, S, S, 0.8)
    col = np.array([62, 46, 34.0]) * (1 + 0.25 * a + 0.12 * b)[..., None]
    h = 2.0 * a + 0.5 * b
    save_rgb(col, 'mulch', [1.0, 1.0], 'Dark bark mulch and soil for planted borders.',
             'A seamless, tileable, top-down texture of dark composted bark mulch in a garden border, flat even light, no text.',
             normal_from_height(h, m, m, 0.8))


def main():
    only = set(sys.argv[1:])
    jobs = [brick_london_stock, brick_red_soldier, slate_welsh, render_white, lawn, paving_porcelain,
            timber_cedar, oak_floor, leaves_cluster, grass_tuft, buxus, mulch]
    for fn in jobs:
        if not only or fn.__name__ in only:
            fn()
    if not only:
        with open(os.path.join(OUT, 'extension-textures.json'), 'w') as f:
            json.dump({'note': 'Procedural textures for tools/blender/extension.py. Replace any colour map file-for-file '
                               '(same name, same tile size and layout). tileMetres is the real-world width and height one tile covers.',
                       'textures': MANIFEST}, f, indent=2)


if __name__ == '__main__':
    main()
