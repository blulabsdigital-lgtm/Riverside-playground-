"""Riverside lab: a south-west London semi with a Riverside-style rear extension and rear dormer loft.

Builds the whole scene procedurally in Blender (no downloaded assets), renders architectural
stills with Cycles on the CPU, and exports a web-ready glb.

Run with Blender 5 as a Python module (bpy), from the repo root:
  python tools/blender/textures.py                       # writes lab/assets/textures/*.png (once)
  python tools/blender/extension.py --renders rear-dusk,rear-day,side-dusk,rear-clay
  python tools/blender/extension.py --renders rear-dusk --preview     # 800 x 450, few samples, to scratch
  python tools/blender/extension.py --export                          # lab/assets/extension-semi.glb

Options: --samples N (default 160 adaptive), --out DIR (default lab/inputs), --threads N.
Coordinates (Blender, Z up, metres): x across the plot (party wall at x = 0, our house towards +x),
y towards the garden (original rear wall face at y = 0), z up from garden level.
Separate from the bathroom visualiser: this only reads lab/assets/textures and writes lab/ files.
"""
import argparse
import json
import math
import os
import random
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshkit as mk  # noqa: E402
from meshkit import MB, srgb, wall, slab, frame_box, frame_quad, make_frame  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'lab', 'assets', 'textures')

# ------------------------------------------------------------------ dimensions (metres)
HW, HD = 6.5, 9.0            # house width and depth
EAVES, RIDGE = 5.7, 9.0
K = (RIDGE - EAVES) / (HD / 2)  # roof rise per metre
ROOF_T = 0.16
EAVE_OH, VERGE_OH = 0.35, 0.12
WALL_T = 0.3
EXT_D, PARA = 4.5, 3.15      # extension depth, parapet height
CEIL = 2.75
PLOT_R, GARDEN_END = 10.0, 25.0
PATIO_END = 9.0

MODE = 'render'
LEAF = 1.0
COLL = None


def z_rear(y):
    return EAVES + (0.0 - y) * K


def z_front(y):
    return EAVES + (y + HD) * K


# ================================================================== materials
M = {}


def _nodes(mat):
    if hasattr(mat, 'use_nodes'):
        try:
            mat.use_nodes = True
        except Exception:
            pass
    nt = mat.node_tree
    nt.nodes.clear()
    return nt, nt.nodes, nt.links


def _img(name, noncolor=False):
    path = os.path.join(TEX, name)
    if not os.path.exists(path):
        return None
    img = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    return img


def mat_pbr(name, color=(200, 200, 200), rough=0.6, metal=0.0, tex=None, tile=None, normal=True, nstr=1.0,
            macro=0.0, tint=None, stripes=False, alpha=False, coat=0.0, spec=0.5):
    mat = bpy.data.materials.new(name)
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    bsdf = N.new('ShaderNodeBsdfPrincipled')
    L.new(bsdf.outputs[0], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = spec
    if coat and 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Base Color'].default_value = (*srgb(color), 1.0)
    if tile:
        mk.TILE[name] = tile
    if tex:
        img = _img(tex + '.png')
        ti = N.new('ShaderNodeTexImage')
        ti.image = img
        ti.interpolation = 'Cubic' if MODE == 'render' else 'Linear'
        col = ti.outputs['Color']
        if MODE == 'render' and (macro or tint or stripes):
            geo = N.new('ShaderNodeNewGeometry')
            fac_socket = None
            if macro:
                nz = N.new('ShaderNodeTexNoise')
                nz.inputs['Scale'].default_value = 0.45
                nz.inputs['Detail'].default_value = 3.0
                L.new(geo.outputs['Position'], nz.inputs['Vector'])
                mr = N.new('ShaderNodeMapRange')
                mr.inputs['From Min'].default_value = 0.3
                mr.inputs['From Max'].default_value = 0.7
                mr.inputs['To Min'].default_value = 1 - macro
                mr.inputs['To Max'].default_value = 1 + macro
                L.new(nz.outputs['Fac'], mr.inputs['Value'])
                fac_socket = mr.outputs['Result']
            if stripes:
                sep = N.new('ShaderNodeSeparateXYZ')
                L.new(geo.outputs['Position'], sep.inputs[0])
                m1 = N.new('ShaderNodeMath')
                m1.operation = 'MULTIPLY'
                m1.inputs[1].default_value = math.pi / 0.95
                L.new(sep.outputs['X'], m1.inputs[0])
                s1 = N.new('ShaderNodeMath')
                s1.operation = 'SINE'
                L.new(m1.outputs[0], s1.inputs[0])
                m2 = N.new('ShaderNodeMapRange')
                m2.inputs['From Min'].default_value = -1
                m2.inputs['From Max'].default_value = 1
                m2.inputs['To Min'].default_value = 0.9
                m2.inputs['To Max'].default_value = 1.08
                L.new(s1.outputs[0], m2.inputs['Value'])
                if fac_socket is not None:
                    mm = N.new('ShaderNodeMath')
                    mm.operation = 'MULTIPLY'
                    L.new(fac_socket, mm.inputs[0])
                    L.new(m2.outputs['Result'], mm.inputs[1])
                    fac_socket = mm.outputs[0]
                else:
                    fac_socket = m2.outputs['Result']
            mix = N.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            L.new(col, mix.inputs['A'])
            if fac_socket is not None:
                L.new(fac_socket, mix.inputs['B'])
            else:
                mix.inputs['B'].default_value = (1, 1, 1, 1)
            col = mix.outputs['Result']
            if tint:
                mix2 = N.new('ShaderNodeMix')
                mix2.data_type = 'RGBA'
                mix2.blend_type = 'MULTIPLY'
                mix2.inputs['Factor'].default_value = 1.0
                L.new(col, mix2.inputs['A'])
                mix2.inputs['B'].default_value = (*srgb(tint), 1)
                col = mix2.outputs['Result']
        elif tint:
            mix2 = N.new('ShaderNodeMix')
            mix2.data_type = 'RGBA'
            mix2.blend_type = 'MULTIPLY'
            mix2.inputs['Factor'].default_value = 1.0
            L.new(col, mix2.inputs['A'])
            mix2.inputs['B'].default_value = (*srgb(tint), 1)
            col = mix2.outputs['Result']
        L.new(col, bsdf.inputs['Base Color'])
        if alpha:
            rnd = N.new('ShaderNodeMath')
            rnd.operation = 'ROUND'
            L.new(ti.outputs['Alpha'], rnd.inputs[0])
            L.new(rnd.outputs[0], bsdf.inputs['Alpha'])
        nimg = _img(tex + '-normal.png', noncolor=True) if normal else None
        if nimg is not None:
            tn = N.new('ShaderNodeTexImage')
            tn.image = nimg
            tn.interpolation = 'Linear'
            nm = N.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = nstr
            L.new(tn.outputs['Color'], nm.inputs['Color'])
            L.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    M[name] = mat
    return mat


def mat_glass(name, tint=(235, 242, 242), frosted=False):
    mat = bpy.data.materials.new(name)
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    if MODE == 'render':
        lw = N.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.12
        tr = N.new('ShaderNodeBsdfTransparent')
        tr.inputs['Color'].default_value = (*srgb(tint), 1)
        gl = N.new('ShaderNodeBsdfGlossy')
        gl.inputs['Roughness'].default_value = 0.12 if frosted else 0.015
        mix = N.new('ShaderNodeMixShader')
        L.new(lw.outputs['Fresnel'], mix.inputs['Fac'])
        if frosted:
            tl = N.new('ShaderNodeBsdfTranslucent')
            tl.inputs['Color'].default_value = (0.75, 0.75, 0.75, 1)
            m0 = N.new('ShaderNodeMixShader')
            m0.inputs['Fac'].default_value = 0.7
            L.new(tr.outputs[0], m0.inputs[1])
            L.new(tl.outputs[0], m0.inputs[2])
            L.new(m0.outputs[0], mix.inputs[1])
        else:
            L.new(tr.outputs[0], mix.inputs[1])
        L.new(gl.outputs[0], mix.inputs[2])
        L.new(mix.outputs[0], out.inputs['Surface'])
    else:
        b = N.new('ShaderNodeBsdfPrincipled')
        b.inputs['Base Color'].default_value = (0.55, 0.62, 0.62, 1) if not frosted else (0.85, 0.85, 0.85, 1)
        b.inputs['Roughness'].default_value = 0.05
        b.inputs['Alpha'].default_value = 0.22 if not frosted else 0.75
        L.new(b.outputs[0], out.inputs['Surface'])
        if hasattr(mat, 'surface_render_method'):
            mat.surface_render_method = 'BLENDED'
    M[name] = mat
    return mat


def mat_emit(name, color, strength):
    mat = bpy.data.materials.new(name)
    nt, N, L = _nodes(mat)
    out = N.new('ShaderNodeOutputMaterial')
    if MODE == 'render':
        e = N.new('ShaderNodeEmission')
        e.inputs['Color'].default_value = (*srgb(color), 1)
        e.inputs['Strength'].default_value = strength
        L.new(e.outputs[0], out.inputs['Surface'])
    else:
        b = N.new('ShaderNodeBsdfPrincipled')
        b.inputs['Base Color'].default_value = (*srgb(color), 1)
        b.inputs['Emission Color'].default_value = (*srgb(color), 1)
        b.inputs['Emission Strength'].default_value = min(strength, 4.0)
        L.new(b.outputs[0], out.inputs['Surface'])
    mat['emit_base'] = strength
    M[name] = mat
    return mat


def make_materials():
    mat_pbr('brick', tex='brick-london-stock', tile=(1.6875, 1.65), rough=0.88, macro=0.09, nstr=1.2)
    mat_pbr('brick-red', tex='brick-red-soldier', tile=(1.2, 0.3), rough=0.85)
    mat_pbr('slate', tex='slate-welsh', tile=(2.0, 2.0), rough=0.5, macro=0.07, spec=0.6)
    mat_pbr('slate-hung', tex='slate-welsh', tile=(1.4, 1.4), rough=0.5, macro=0.05, spec=0.6)
    mat_pbr('render', tex='render-white', tile=(2.0, 2.0), rough=0.82, macro=0.015, nstr=0.6)
    mat_pbr('plinth', color=(52, 52, 54), rough=0.75)
    mat_pbr('lawn', tex='lawn', tile=(1.5, 1.5), rough=0.95, macro=0.1, stripes=True, nstr=0.8)
    mat_pbr('lawn-plain', tex='lawn', tile=(1.5, 1.5), rough=0.95, macro=0.14, tint=(232, 236, 214))
    mat_pbr('paving', tex='paving-porcelain', tile=(3.6, 3.6), rough=0.5, macro=0.03)
    mat_pbr('paving-old', tex='paving-porcelain', tile=(2.4, 2.4), rough=0.8, macro=0.12, tint=(190, 182, 168))
    mat_pbr('timber', tex='timber-cedar', tile=(1.0, 1.0), rough=0.7, macro=0.06)
    mat_pbr('timber-old', tex='timber-cedar', tile=(1.0, 1.0), rough=0.85, tint=(170, 160, 150))
    mat_pbr('oak', tex='oak-floor', tile=(1.52, 1.52), rough=0.38, coat=0.1)
    mat_pbr('mulch', tex='mulch', tile=(1.0, 1.0), rough=0.95)
    mat_pbr('buxus', tex='buxus', tile=(0.45, 0.45), rough=0.55, nstr=1.5)
    mat_pbr('leaf', tex='leaves-cluster', normal=False, rough=0.55, alpha=True)
    mat_pbr('leaf-dark', tex='leaves-cluster', normal=False, rough=0.6, alpha=True, tint=(150, 160, 140))
    mat_pbr('leaf-olive', tex='leaves-cluster', normal=False, rough=0.6, alpha=True, tint=(200, 205, 190))
    mat_pbr('grass-tuft', tex='grass-tuft', normal=False, rough=0.7, alpha=True)
    mat_pbr('bark', color=(84, 76, 66), rough=0.9)
    mat_pbr('bark-birch', color=(214, 210, 200), rough=0.75)
    mat_pbr('sash-paint', color=(238, 236, 230), rough=0.32)
    mat_pbr('stone-sill', color=(222, 218, 208), rough=0.6)
    mat_pbr('bronze', color=(64, 52, 42), rough=0.36, metal=0.85)
    mat_pbr('gold', color=(206, 168, 96), rough=0.26, metal=1.0)
    mat_pbr('membrane', color=(44, 44, 46), rough=0.7)
    mat_pbr('lead', color=(108, 110, 114), rough=0.5)
    mat_pbr('ridge', color=(68, 70, 78), rough=0.6)
    mat_pbr('gutter', color=(20, 20, 20), rough=0.35)
    mat_pbr('fascia-white', color=(232, 230, 225), rough=0.4)
    mat_pbr('pot', color=(160, 90, 62), rough=0.8)
    mat_pbr('flaunch', color=(150, 146, 138), rough=0.9)
    mat_pbr('plaster', color=(238, 233, 225), rough=0.9)
    mat_pbr('plaster-warm', color=(226, 214, 198), rough=0.9)
    mat_pbr('cabinet', color=(42, 60, 52), rough=0.42)
    mat_pbr('worktop', color=(234, 232, 228), rough=0.12, coat=0.2)
    mat_pbr('table-oak', color=(170, 128, 88), rough=0.45)
    mat_pbr('fabric', color=(196, 186, 170), rough=0.95)
    mat_pbr('fabric-dark', color=(78, 80, 86), rough=0.95)
    mat_pbr('rug', color=(176, 164, 146), rough=1.0)
    mat_pbr('black-metal', color=(26, 26, 26), rough=0.4, metal=0.5)
    mat_pbr('door-green', color=(48, 66, 58), rough=0.35)
    mat_pbr('door-navy', color=(34, 42, 60), rough=0.35)
    mat_pbr('planter', color=(62, 62, 64), rough=0.65)
    mat_pbr('steel-edge', color=(70, 52, 40), rough=0.7, metal=0.4)
    mat_pbr('art', color=(170, 120, 80), rough=0.8)
    mat_pbr('dark-interior', color=(30, 28, 26), rough=0.9)
    mat_pbr('shed', color=(78, 92, 84), rough=0.8)
    mat_pbr('felt', color=(36, 36, 38), rough=0.9)
    mat_pbr('ground', tex='lawn', tile=(1.5, 1.5), rough=0.95, macro=0.15, tint=(200, 205, 185))
    mat_pbr('tarmac', color=(58, 58, 60), rough=0.9)
    mat_glass('glass')
    mat_glass('glass-frosted', frosted=True)
    mat_emit('lamp-globe', (255, 196, 130), 9.0)
    mat_emit('lamp-led', (255, 206, 150), 10.0)
    mat_emit('lamp-down', (255, 222, 180), 30.0)
    mat_emit('lamp-ext', (255, 200, 140), 20.0)


# ================================================================== lights
LIGHTS = []  # (object, base energy, group)


def light(name, kind, loc, energy, color=(255, 190, 130), radius=0.05, rot=None, spot=None, size=None, group='int'):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = srgb(color)
    if kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = radius
    if kind == 'SPOT' and spot:
        ld.spot_size = math.radians(spot[0])
        ld.spot_blend = spot[1]
    if kind == 'AREA' and size:
        ld.shape = 'RECTANGLE'
        ld.size, ld.size_y = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    if rot is not None:
        ob.rotation_euler = rot
    COLL.objects.link(ob)
    LIGHTS.append((ob, energy, group))
    return ob


# ================================================================== windows and doors
def sash_window(fr, a0, a1, z0, z1, mb_w, mb_g, bars=(1, 0), reveal=0.1, lintel=True, glass='glass'):
    """Victorian box sash in a masonry opening. bars=(vertical bars per sash, horizontal bars per sash)."""
    r = reveal
    W = M['sash-paint']
    # box frame
    frame_box(mb_w, fr, a0, a0 + 0.055, r, r + 0.14, z0, z1, W)
    frame_box(mb_w, fr, a1 - 0.055, a1, r, r + 0.14, z0, z1, W)
    frame_box(mb_w, fr, a0, a1, r, r + 0.14, z1 - 0.055, z1, W)
    frame_box(mb_w, fr, a0, a1, r - 0.03, r + 0.14, z0, z0 + 0.06, W)
    ia0, ia1, iz0, iz1 = a0 + 0.055, a1 - 0.055, z0 + 0.06, z1 - 0.055
    zm = (iz0 + iz1) / 2
    for (d0, d1, sz0, sz1, top, bot, gd) in (
            (r + 0.015, r + 0.06, zm - 0.02, iz1, 0.05, 0.035, r + 0.038),   # upper sash, outer track
            (r + 0.07, r + 0.115, iz0, zm + 0.02, 0.035, 0.085, r + 0.093)):  # lower sash, inner track
        frame_box(mb_w, fr, ia0, ia0 + 0.05, d0, d1, sz0, sz1, W)
        frame_box(mb_w, fr, ia1 - 0.05, ia1, d0, d1, sz0, sz1, W)
        frame_box(mb_w, fr, ia0, ia1, d0, d1, sz1 - top, sz1, W)
        frame_box(mb_w, fr, ia0, ia1, d0, d1, sz0, sz0 + bot, W)
        ga0, ga1, gz0, gz1 = ia0 + 0.05, ia1 - 0.05, sz0 + bot, sz1 - top
        for k in range(1, bars[0] + 1):
            c = ga0 + (ga1 - ga0) * k / (bars[0] + 1)
            frame_box(mb_w, fr, c - 0.01, c + 0.01, d0 + 0.01, d1 - 0.01, gz0, gz1, W)
        for k in range(1, bars[1] + 1):
            c = gz0 + (gz1 - gz0) * k / (bars[1] + 1)
            frame_box(mb_w, fr, ga0, ga1, d0 + 0.01, d1 - 0.01, c - 0.01, c + 0.01, W)
        frame_quad(mb_g, fr, ga0 - 0.01, ga1 + 0.01, gd, gz0 - 0.01, gz1 + 0.01, M[glass])
    # horns on the upper sash
    for ax in (ia0, ia1 - 0.05):
        frame_box(mb_w, fr, ax + 0.005, ax + 0.045, r + 0.02, r + 0.055, zm - 0.075, zm - 0.02, W)
    # stone sill and gauged red brick head
    frame_box(mb_w, fr, a0 - 0.07, a1 + 0.07, -0.05, r, z0 - 0.1, z0, M['stone-sill'])
    if lintel:
        frame_box(mb_w, fr, a0 - 0.06, a1 + 0.06, -0.004, r, z1, z1 + 0.3, M['brick-red'], anchor='min')


def alu_window(fr, a0, a1, z0, z1, mb_w, mb_g, mullions=(), d=0.06, fw=0.06, glass='glass', transoms=()):
    B = M['bronze']
    frame_box(mb_w, fr, a0, a0 + fw, d, d + 0.08, z0, z1, B)
    frame_box(mb_w, fr, a1 - fw, a1, d, d + 0.08, z0, z1, B)
    frame_box(mb_w, fr, a0, a1, d, d + 0.08, z1 - fw, z1, B)
    frame_box(mb_w, fr, a0, a1, d, d + 0.08, z0, z0 + fw, B)
    for m in mullions:
        frame_box(mb_w, fr, m - fw / 2, m + fw / 2, d, d + 0.08, z0, z1, B)
    for t in transoms:
        frame_box(mb_w, fr, a0, a1, d, d + 0.08, t - fw / 2, t + fw / 2, B)
    frame_quad(mb_g, fr, a0 + fw - 0.01, a1 - fw + 0.01, d + 0.04, z0 + fw - 0.01, z1 - fw + 0.01, M[glass])
    # aluminium cill
    frame_box(mb_w, fr, a0 - 0.02, a1 + 0.02, -0.04, d + 0.02, z0 - 0.03, z0, B)


def room(mb, fr, a0, a1, d0, d1, z0, z1, wall_mat, floor_mat=None, ceil_mat=None):
    """Five-sided room lining behind a window (open towards the outer wall)."""
    wm = M[wall_mat]
    fm = M[floor_mat or wall_mat]
    cm = M[ceil_mat or wall_mat]
    frame_quad(mb, fr, a0, a1, d1, z0, z1, wm)
    mb.face([fr(a0, d0, z0), fr(a0, d1, z0), fr(a0, d1, z1), fr(a0, d0, z1)], wm)
    mb.face([fr(a1, d0, z0), fr(a1, d0, z1), fr(a1, d1, z1), fr(a1, d1, z0)], wm)
    mb.face([fr(a0, d0, z0), fr(a1, d0, z0), fr(a1, d1, z0), fr(a0, d1, z0)], fm)
    mb.face([fr(a0, d0, z1), fr(a0, d1, z1), fr(a1, d1, z1), fr(a1, d0, z1)], cm)


def curtains(mb, fr, a0, a1, d, z0, z1, mat='fabric'):
    for (c0, c1) in ((a0 - 0.18, a0 + 0.12), (a1 - 0.12, a1 + 0.18)):
        n = 6
        pts_lo, pts_hi = [], []
        for i in range(n + 1):
            a = c0 + (c1 - c0) * i / n
            dd = d + (0.03 if i % 2 else 0.0)
            pts_lo.append(fr(a, dd, z0))
            pts_hi.append(fr(a, dd, z1))
        for i in range(n):
            mb.face([pts_lo[i], pts_lo[i + 1], pts_hi[i + 1], pts_hi[i]], M[mat])


# ================================================================== house shell
def roof_slope(mb, xs_range, y_eave, y_ridge, zf, holes, mat):
    """Sloping roof slab between an eave line and the ridge, with rectangular holes (x0, x1, y0, y1)."""
    x0, x1 = xs_range
    ylo, yhi = min(y_eave, y_ridge), max(y_eave, y_ridge)
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
    ys = sorted({ylo, yhi, *[h[2] for h in holes], *[h[3] for h in holes]})
    xs = [x for x in xs if x0 <= x <= x1]
    ys = [y for y in ys if ylo <= y <= yhi]
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            mx, my = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if any(h[0] < mx < h[1] and h[2] < my < h[3] for h in holes):
                continue
            c = {}
            for a, x in enumerate((xs[i], xs[i + 1])):
                for b, y in enumerate((ys[j], ys[j + 1])):
                    zt = zf(y)
                    c[(a, b, 0)] = Vector((x, y, zt - ROOF_T))
                    c[(a, b, 1)] = Vector((x, y, zt))
            mb.hexa(c, mat)


def chimney(mb, x0, x1, y0, y1, zb, zt, pots):
    B = M['brick']
    mb.box(x0, y0, zb, x1, y1, zt, B)
    mb.box(x0 - 0.035, y0 - 0.035, zt, x1 + 0.035, y1 + 0.035, zt + 0.075, B)
    mb.box(x0 - 0.07, y0 - 0.07, zt + 0.075, x1 + 0.07, y1 + 0.07, zt + 0.15, B)
    mb.box(x0 - 0.02, y0 - 0.02, zt + 0.15, x1 + 0.02, y1 + 0.02, zt + 0.3, B)
    mb.box(x0 + 0.02, y0 + 0.02, zt + 0.3, x1 - 0.02, y1 - 0.02, zt + 0.36, M['flaunch'])
    cy = (y0 + y1) / 2
    for i in range(pots):
        cx = x0 + (x1 - x0) * (i + 0.5) / pots
        h = 0.5 + 0.1 * ((i * 7) % 3) / 2
        mb.cylinder(cx, cy, zt + 0.3, zt + 0.3 + h, 0.115, M['pot'], segs=14, r_top=0.095)
        mb.cylinder(cx, cy, zt + 0.3 + h - 0.06, zt + 0.3 + h, 0.112, M['pot'], segs=14)


def house(name, px, sgn, kind='plain', front_door='door-navy'):
    """One half of a semi-detached pair. px: party wall line; sgn: +1 builds towards +x, -1 towards -x.
    kind: 'ours' (extension, dormer, ground floor opened up), 'neighbour' (plain original rear), 'plain' (backdrop)."""
    X = lambda a: px + sgn * a  # noqa: E731
    xa, xb = sorted((X(0.0), X(HW)))
    shell, win, glass, inner = MB(name + '-shell'), MB(name + '-windows'), MB(name + '-glass'), MB(name + '-interior')
    roof = MB(name + '-roof')
    B = M['brick']
    rear = make_frame((px, 0, 0), (sgn, 0, 0), (0, -1, 0))
    front = make_frame((px, -HD, 0), (sgn, 0, 0), (0, 1, 0))
    side = make_frame((X(HW), 0, 0), (0, -1, 0), (-sgn, 0, 0))
    wall_top = 5.6

    # -- rear wall
    rear_open = []
    if kind == 'ours':
        rear_open.append((0.15, HW - 0.3, -0.1, CEIL))
        upper = [(1.25, 2.25, 3.3, 4.95), (4.25, 5.25, 3.3, 4.95)]
    else:
        upper = [(1.25, 2.25, 3.3, 4.95), (4.25, 5.25, 3.3, 4.95)]
    ground = [] if kind == 'ours' else [(1.1, 2.4, 0.75, 2.4), (4.8, 5.7, 0.15, 2.3)]
    wall(shell, rear, 0.0, HW, 0.0, wall_top, 0.0, WALL_T, rear_open + upper + ground, B)
    for (a0, a1, z0, z1) in upper:
        sash_window(rear, a0, a1, z0, z1, win, glass, bars=(1, 0))
    # -- front wall: door with fanlight, bay-less sash, two upper sashes
    f_open = [(0.6, 1.6, 0.15, 2.75), (3.0, 5.4, 0.75, 2.45), (1.0, 2.0, 3.3, 4.95), (3.7, 5.0, 3.3, 4.95)]
    wall(shell, front, 0.0, HW, 0.0, wall_top, 0.0, WALL_T, f_open, B)
    sash_window(front, 3.0, 4.2, 0.75, 2.45, win, glass, bars=(1, 0))
    sash_window(front, 4.2, 5.4, 0.75, 2.45, win, glass, bars=(1, 0), lintel=False)
    frame_box(win, front, 2.9, 5.5, -0.004, 0.1, 2.45, 2.75, M['brick-red'], anchor='min')
    sash_window(front, 1.0, 2.0, 3.3, 4.95, win, glass, bars=(1, 0))
    sash_window(front, 3.7, 5.0, 3.3, 4.95, win, glass, bars=(1, 0))
    # front door, fanlight and step
    frame_box(win, front, 0.6, 1.6, 0.12, 0.17, 0.15, 2.2, M[front_door])
    frame_box(win, front, 0.6, 1.6, 0.1, 0.18, 2.2, 2.28, M['sash-paint'])
    frame_quad(glass, front, 0.62, 1.58, 0.14, 2.28, 2.73, M['glass'])
    frame_box(win, front, 0.5, 1.7, -0.35, 0.12, 0.0, 0.15, M['stone-sill'])
    frame_box(win, front, 0.5, 1.7, -0.004, 0.1, 2.75, 3.05, M['brick-red'], anchor='min')
    # -- side (gable) wall, with a small landing window
    s_open = [(4.0, 4.7, 3.4, 4.6), (6.6, 7.4, 0.15, 2.2)]
    wall(shell, side, 0.0, HD, 0.0, wall_top, 0.0, WALL_T, s_open, B)
    sash_window(side, 4.0, 4.7, 3.4, 4.6, win, glass, bars=(0, 0), glass='glass-frosted')
    frame_box(win, side, 6.6, 7.4, 0.12, 0.17, 0.15, 2.2, M['door-green' if kind != 'ours' else 'door-navy'])
    frame_box(win, side, 6.5, 7.5, -0.004, 0.1, 2.2, 2.5, M['brick-red'], anchor='min')
    # gable triangle
    gx0, gx1 = sorted((X(HW - WALL_T), X(HW)))
    shell.prism([(0.0, wall_top - 0.05), (-HD / 2, RIDGE - 0.03), (-HD, wall_top - 0.05)], 'x', gx0, gx1, B)

    # -- roof
    rx0, rx1 = sorted((X(0.0), X(HW + VERGE_OH)))
    holes = []
    if kind == 'ours':
        holes.append((DORMER['x0'], DORMER['x1'], DORMER['yb'], DORMER['yf']))
    roof_slope(roof, (rx0, rx1), EAVE_OH, -HD / 2, z_rear, holes, M['slate'])
    roof_slope(roof, (rx0, rx1), -HD - EAVE_OH, -HD / 2, z_front, [], M['slate'])
    roof.tube([(rx0, -HD / 2, RIDGE + 0.01), (rx1, -HD / 2, RIDGE + 0.01)], 0.1, M['ridge'], segs=10)
    # verge undercloak and eaves
    for (yw, s) in ((0.0, 1), (-HD, -1)):
        roof.box(rx0, yw, 5.36, rx1, yw + s * (EAVE_OH - 0.03), 5.40, M['fascia-white'])
        roof.box(rx0, yw + s * (EAVE_OH - 0.03), 5.27, rx1, yw + s * EAVE_OH, 5.47, M['fascia-white'])
        gy = yw + s * (EAVE_OH + 0.065)
        roof.tube([(rx0, gy, 5.36), (rx1, gy, 5.36)], 0.06, M['gutter'], segs=10)
    # downpipe
    dpx = X(HW - 0.14)
    dp_bottom = PARA - 0.1 if kind == 'ours' else 0.05
    roof.tube([(dpx, EAVE_OH + 0.065, 5.33), (dpx, 0.2, 5.1), (dpx, 0.09, 4.9), (dpx, 0.09, dp_bottom)], 0.036, M['gutter'], segs=8)
    # gable stack
    sx0, sx1 = sorted((X(HW - 0.75), X(HW)))
    chimney(roof, sx0, sx1, -HD / 2 - 0.5, -HD / 2 + 0.5, 7.6, 10.05, 2)

    # -- interiors seen through windows
    for (a0, a1, z0, z1), lit in zip(upper, (False, True)):
        room(inner, rear, a0 - 1.0, a1 + 0.9, WALL_T, 3.6, 2.95, 5.5, 'plaster-warm', 'rug' if lit else 'table-oak')
        curtains(inner, rear, a0, a1, WALL_T + 0.08, z0 - 0.1, z1 + 0.15, 'fabric')
        if lit and kind in ('ours', 'neighbour'):
            p = rear((a0 + a1) / 2 + 0.6, 2.6, 4.2)
            light(name + '-upstairs-lamp', 'POINT', p, 18 if kind == 'ours' else 10, (255, 180, 110), 0.15, group='house')
    if kind != 'ours':
        room(inner, rear, 0.2, HW - 0.2, WALL_T, 4.2, 0.0, 2.75, 'plaster-warm', 'table-oak')
        if kind == 'neighbour':
            frame_box(inner, rear, 0.25, 3.0, 0.35, 0.95, 0.0, 0.9, M['fabric'])  # worktop run
            frame_box(inner, rear, 0.25, 3.0, 0.35, 0.95, 0.9, 0.93, M['worktop'])
            light(name + '-kitchen', 'POINT', rear(2.0, 2.0, 2.5), 22, (255, 200, 140), 0.2, group='house')
            # back door (half glazed) and step
            a0, a1 = 4.8, 5.7
            frame_box(win, rear, a0, a1, 0.1, 0.16, 0.15, 1.2, M['door-green'])
            for (b0, b1) in ((a0, a0 + 0.1), (a1 - 0.1, a1)):
                frame_box(win, rear, b0, b1, 0.1, 0.16, 1.2, 2.3, M['door-green'])
            frame_box(win, rear, a0, a1, 0.1, 0.16, 2.2, 2.3, M['door-green'])
            frame_box(win, rear, (a0 + a1) / 2 - 0.02, (a0 + a1) / 2 + 0.02, 0.11, 0.15, 1.2, 2.2, M['door-green'])
            frame_quad(glass, rear, a0 + 0.1, a1 - 0.1, 0.13, 1.2, 2.2, M['glass'])
            frame_box(win, rear, a0 - 0.1, a1 + 0.1, -0.3, 0.1, 0.0, 0.15, M['stone-sill'])
            frame_box(win, rear, a0 - 0.06, a1 + 0.06, -0.004, 0.1, 2.3, 2.6, M['brick-red'], anchor='min')
            sash_window(rear, 1.1, 2.4, 0.75, 2.4, win, glass, bars=(1, 0))
        else:
            sash_window(rear, 1.1, 2.4, 0.75, 2.4, win, glass, bars=(1, 0))
            frame_box(win, rear, 4.8, 5.7, 0.1, 0.16, 0.15, 2.3, M['door-green'])
            frame_box(win, rear, 4.7, 5.8, -0.004, 0.1, 2.3, 2.6, M['brick-red'], anchor='min')
    for mb in (shell, win, glass, inner, roof):
        mb.build(COLL)


def party_stack(px):
    mb = MB('party-stack-%d' % int(px * 10))
    chimney(mb, px - 0.6, px + 0.6, -HD / 2 - 0.55, -HD / 2 + 0.55, 7.5, 10.3, 4)
    mb.build(COLL)


# ================================================================== loft dormer
DORMER = {'x0': 0.25, 'x1': 6.15, 'yf': -0.45, 'top': 8.62}
DORMER['yb'] = -(DORMER['top'] - EAVES) / K


def dormer():
    d = DORMER
    x0, x1, yf, yb, top = d['x0'], d['x1'], d['yf'], d['yb'], d['top']
    mb, win, glass, inner = MB('dormer'), MB('dormer-windows'), MB('dormer-glass'), MB('dormer-interior')
    S = M['slate-hung']
    zfb = z_rear(yf) - ROOF_T
    wall_hi = top - 0.17
    fr = make_frame((0, yf, 0), (1, 0, 0), (0, -1, 0))
    big = (1.35, 4.95, 6.42, 8.1)
    small = (5.3, 5.85, 7.3, 8.1)
    wall(mb, fr, x0, x1, zfb, wall_hi, 0.0, 0.2, [big, small], S)
    # cheeks
    for (c0, c1) in ((x0, x0 + 0.2), (x1 - 0.2, x1)):
        mb.prism([(yf, zfb), (yf, wall_hi), (yb, wall_hi), (yb, z_rear(yb) - ROOF_T)], 'x', c0, c1, S)
    # flat roof, fascia and lead apron
    mb.box(x0 - 0.06, yb - 0.05, wall_hi, x1 + 0.06, yf + 0.08, top, M['membrane'])
    mb.box(x0 - 0.07, yf + 0.06, wall_hi - 0.06, x1 + 0.07, yf + 0.1, top + 0.02, M['bronze'])
    for xx in (x0 - 0.07, x1 + 0.03):
        mb.box(xx, yb - 0.05, wall_hi - 0.06, xx + 0.04, yf + 0.1, top + 0.02, M['bronze'])
    a = Vector((0, yf + 0.005, zfb + ROOF_T + 0.06))
    b = Vector((0, yf + 0.3, z_rear(yf + 0.3) + 0.012))
    for xs in ((x0 - 0.03, x1 + 0.03),):
        mb.face([Vector((xs[0], a.y, a.z)), Vector((xs[1], a.y, a.z)), Vector((xs[1], b.y, b.z)), Vector((xs[0], b.y, b.z))], M['lead'])
    alu_window(fr, *big, win, glass, mullions=(big[0] + (big[1] - big[0]) / 3, big[0] + 2 * (big[1] - big[0]) / 3))
    alu_window(fr, *small, win, glass, glass='glass-frosted')
    # loft bedroom behind
    room(inner, fr, x0 + 0.2, x1 - 0.2, 0.2, abs(yb - yf) - 0.15, 5.78, wall_hi - 0.02, 'plaster', 'oak', 'plaster')
    inner.box(2.0, yb + 0.2, 5.78, 4.4, yb + 0.28, 7.0, M['fabric-dark'])  # headboard
    inner.box(2.1, yb + 0.28, 5.78, 4.3, yb + 2.2, 6.3, M['fabric'])      # bed
    light('loft-lamp', 'POINT', (3.2, (yf + yb) / 2 - 0.6, 7.9), 14, (255, 186, 120), 0.2, group='house')
    light('loft-bedside', 'POINT', (1.7, yb + 0.5, 6.4), 8, (255, 170, 100), 0.08, group='house')
    for m in (mb, win, glass, inner):
        m.build(COLL)


# ================================================================== the extension
EXT = {'x0': -0.1, 'x1': HW, 'y1': EXT_D, 'open': (0.42, 6.08), 'head': 2.5,
       'lantern': (1.55, 4.95, 1.15, 3.25)}


def extension():
    e = EXT
    sh, win, glass, gold = MB('extension-shell'), MB('extension-glazing'), MB('extension-glass'), MB('extension-gold')
    R, P = M['render'], M['plinth']
    oa0, oa1 = e['open']
    head = e['head']
    # garden end wall (outer face y = 4.5), plinth below the render
    gw = make_frame((0, EXT_D, 0), (1, 0, 0), (0, -1, 0))
    wall(sh, gw, e['x0'], e['x1'], 0.15, PARA, 0.0, WALL_T, [(oa0, oa1, -1, head)], R)
    wall(sh, gw, e['x0'], e['x1'], 0.0, 0.15, -0.012, WALL_T, [(oa0, oa1, -1, head)], P)
    # side wall facing the side garden (x = 6.5), tall slot window
    sw = make_frame((HW, 0, 0), (0, 1, 0), (-1, 0, 0))
    slot = (0.55, 1.45, 0.0, head)
    wall(sh, sw, 0.0, EXT_D - WALL_T, 0.15, PARA, 0.0, WALL_T, [slot], R)
    wall(sh, sw, 0.0, EXT_D - WALL_T, 0.0, 0.15, -0.012, WALL_T, [slot], P)
    # party wall
    sh.box(-0.1, 0.0, 0.0, 0.2, EXT_D - WALL_T, PARA, R)
    # roof: ceiling, deck and lantern kerb
    lx0, lx1, ly0, ly1 = e['lantern']
    slab(sh, 0.2, HW - WALL_T, -4.2, EXT_D - WALL_T, CEIL, CEIL + 0.03, [(lx0, lx1, ly0, ly1)], M['plaster'])
    slab(sh, 0.2, HW - WALL_T, 0.0, EXT_D - WALL_T, CEIL + 0.03, 2.98, [(lx0, lx1, ly0, ly1)], M['membrane'])
    kt = 0.12
    for (x0, y0, x1, y1) in ((lx0 - kt, ly0 - kt, lx1 + kt, ly0), (lx0 - kt, ly1, lx1 + kt, ly1 + kt),
                             (lx0 - kt, ly0, lx0, ly1), (lx1, ly0, lx1 + kt, ly1)):
        sh.box(x0, y0, CEIL, x1, y1, 3.28, R)
    # lantern well lining inside
    for (x0, y0, x1, y1) in ((lx0, ly0, lx1, ly0 + 0.01), (lx0, ly1 - 0.01, lx1, ly1), (lx0, ly0, lx0 + 0.01, ly1), (lx1 - 0.01, ly0, lx1, ly1)):
        sh.box(x0, y0, CEIL, x1, y1, 3.28, M['plaster'])
    # flashing where the flat roof meets the house
    sh.box(0.2, -0.02, 2.98, HW - 0.3, 0.12, 3.02, M['lead'])
    sh.box(0.2, -0.004, 3.02, HW - 0.3, 0.012, 3.2, M['lead'])
    # gold coping and reveal lining: slim, flush, architectural
    gold.box(e['x0'] - 0.02, EXT_D - WALL_T - 0.02, PARA, e['x1'] + 0.02, EXT_D + 0.02, PARA + 0.045, M['gold'])
    gold.box(HW - WALL_T - 0.02, 0.0, PARA, HW + 0.02, EXT_D - WALL_T, PARA + 0.045, M['gold'])
    gold.box(e['x0'] - 0.02, 0.0, PARA, 0.22, EXT_D - WALL_T, PARA + 0.045, M['gold'])
    gl = 0.022
    gold.box(oa0, EXT_D - 0.2, 0.0, oa0 + gl, EXT_D, head, M['gold'])
    gold.box(oa1 - gl, EXT_D - 0.2, 0.0, oa1, EXT_D, head, M['gold'])
    gold.box(oa0, EXT_D - 0.2, head - gl, oa1, EXT_D, head, M['gold'])
    # bi-fold doors: six panels, slim dark bronze
    B = M['bronze']
    fy0, fy1 = EXT_D - 0.29, EXT_D - 0.2
    ia0, ia1 = oa0 + gl, oa1 - gl
    win.box(ia0, fy0, 0.03, ia0 + 0.045, fy1, head - gl, B)
    win.box(ia1 - 0.045, fy0, 0.03, ia1, fy1, head - gl, B)
    win.box(ia0, fy0, head - gl - 0.05, ia1, fy1, head - gl, B)
    win.box(ia0, fy0 - 0.02, 0.0, ia1, fy1 + 0.04, 0.03, B)
    n = 6
    pa0, pa1 = ia0 + 0.045, ia1 - 0.045
    pw = (pa1 - pa0) / n
    for i in range(n):
        x0, x1 = pa0 + i * pw, pa0 + (i + 1) * pw
        zt = head - gl - 0.05
        py0, py1 = fy0 + 0.01, fy1 - 0.01
        win.box(x0, py0, 0.03, x0 + 0.052, py1, zt, B)
        win.box(x1 - 0.052, py0, 0.03, x1, py1, zt, B)
        win.box(x0, py0, zt - 0.06, x1, py1, zt, B)
        win.box(x0, py0, 0.03, x1, py1, 0.12, B)
        glass.face([Vector((x0 + 0.05, (fy0 + fy1) / 2, 0.115)), Vector((x1 - 0.05, (fy0 + fy1) / 2, 0.115)),
                    Vector((x1 - 0.05, (fy0 + fy1) / 2, zt - 0.055)), Vector((x0 + 0.05, (fy0 + fy1) / 2, zt - 0.055))], M['glass'])
        if i in (1, 4):
            hx = x1 - 0.09 if i == 1 else x0 + 0.09
            win.box(hx - 0.012, fy1 - 0.005, 0.9, hx + 0.012, fy1 + 0.03, 1.3, B)
    # slot window in the side wall
    alu_window(sw, *slot, win, glass, d=0.18, fw=0.05)
    # roof lantern: hipped glazed roof on a bronze kerb
    zk = 3.28
    win.box(lx0 - 0.05, ly0 - 0.05, zk, lx1 + 0.05, ly0 + 0.03, zk + 0.1, B)
    win.box(lx0 - 0.05, ly1 - 0.03, zk, lx1 + 0.05, ly1 + 0.05, zk + 0.1, B)
    win.box(lx0 - 0.05, ly0, zk, lx0 + 0.03, ly1, zk + 0.1, B)
    win.box(lx1 - 0.03, ly0, zk, lx1 + 0.05, ly1, zk + 0.1, B)
    zb, rise = zk + 0.1, 0.5
    cy = (ly0 + ly1) / 2
    half = (ly1 - ly0) / 2
    rxa, rxb = lx0 + half, lx1 - half
    c00, c10, c11, c01 = (Vector((lx0, ly0, zb)), Vector((lx1, ly0, zb)), Vector((lx1, ly1, zb)), Vector((lx0, ly1, zb)))
    ra, rb = Vector((rxa, cy, zb + rise)), Vector((rxb, cy, zb + rise))
    for poly in ([c00, c10, rb, ra], [c11, c01, ra, rb], [c10, c11, rb], [c01, c00, ra]):
        glass.face(poly, M['glass'])
    for (p, q) in ((c00, ra), (c01, ra), (c10, rb), (c11, rb), (ra, rb)):
        win.beam(p, q, 0.06, 0.07, B)
    nb = 4
    for k in range(1, nb + 1):
        x = lx0 + (lx1 - lx0) * k / (nb + 1)
        xr = min(max(x, rxa), rxb)
        win.beam((x, ly0, zb), (xr, cy, zb + rise), 0.04, 0.05, B)
        win.beam((x, ly1, zb), (xr, cy, zb + rise), 0.04, 0.05, B)
    for (p, q) in ((Vector((lx0, cy, zb)), ra), (Vector((lx1, cy, zb)), rb)):
        win.beam(p, q, 0.04, 0.05, B)
    # outdoor up/down wall light on the side wall, and a step light
    win.box(HW + 0.0, 3.6, 1.95, HW + 0.09, 3.68, 2.25, M['bronze'])
    win.box(HW + 0.01, 3.61, 1.94, HW + 0.08, 3.67, 1.95, M['lamp-ext'])
    win.box(HW + 0.01, 3.61, 2.25, HW + 0.08, 3.67, 2.26, M['lamp-ext'])
    light('wall-light-down', 'SPOT', (HW + 0.045, 3.64, 1.93), 6, (255, 190, 120), 0.02, rot=(0, 0, 0), spot=(50, 0.4), group='ext')
    light('wall-light-up', 'SPOT', (HW + 0.045, 3.64, 2.27), 4, (255, 190, 120), 0.02, rot=(math.pi, 0, 0), spot=(40, 0.4), group='ext')
    for m in (sh, win, glass, gold):
        m.build(COLL)


def ext_interior():
    """Warm kitchen-diner inside the extension and the opened-up original rear room."""
    mb, lamps = MB('ext-interior'), MB('ext-lamps')
    y_back = -4.2
    mb.box(0.2, y_back, -0.06, HW - 0.3, EXT_D - WALL_T, 0.03, M['oak'])
    mb.box(0.15, y_back, 0.0, 0.2, EXT_D - WALL_T, CEIL, M['plaster'])
    mb.box(HW - 0.33, y_back, 0.0, HW - 0.3, 0.0, CEIL, M['plaster'])
    bw = make_frame((0, y_back, 0), (1, 0, 0), (0, 1, 0))
    wall(mb, bw, 0.2, HW - 0.3, 0.0, CEIL, -0.1, 0.0, [(4.2, 5.2, 0.0, 2.1)], M['plaster'])
    mb.box(4.2, y_back - 1.2, 0.0, 5.2, y_back - 1.19, 2.1, M['dark-interior'])
    mb.box(0.2, -0.3, 2.5, HW - 0.3, 0.0, CEIL, M['plaster'])  # beam downstand
    # kitchen run on the party wall: tall units, base units, worktop, shelf
    C = M['cabinet']
    mb.box(0.2, y_back, 0.0, 0.85, -2.4, 2.35, C)
    for k in range(4):
        yy = y_back + 0.02 + k * 0.45
        mb.box(0.85, yy, 0.12, 0.86, yy + 0.43, 2.33, C)
    mb.box(0.2, -2.4, 0.1, 0.82, 1.7, 0.88, C)
    mb.box(0.2, -2.4, 0.88, 0.87, 1.7, 0.92, M['worktop'])
    mb.box(0.2, -2.4, 0.92, 0.22, 1.7, 1.45, M['worktop'])  # upstand
    mb.box(0.2, -1.6, 1.62, 0.5, 0.9, 1.66, M['table-oak'])  # floating shelf
    for k in range(10):
        yy = -2.35 + k * 0.225
        lamps.box(0.825, yy, 0.6, 0.835, yy + 0.008, 0.7, M['gold'])  # slim handles
    # island with waterfall worktop
    ix0, ix1, iy0, iy1 = 1.75, 4.55, -1.45, -0.45
    mb.box(ix0 + 0.04, iy0 + 0.05, 0.1, ix1 - 0.04, iy1 - 0.05, 0.88, C)
    mb.box(ix0, iy0, 0.88, ix1, iy1 + 0.2, 0.93, M['worktop'])
    mb.box(ix0, iy0, 0.0, ix0 + 0.05, iy1 + 0.2, 0.88, M['worktop'])
    mb.box(ix1 - 0.05, iy0, 0.0, ix1, iy1 + 0.2, 0.88, M['worktop'])
    # bar stools
    for sx in (2.45, 3.15, 3.85):
        sy = iy1 + 0.45
        mb.cylinder(sx, sy, 0.62, 0.66, 0.2, M['table-oak'], segs=16)
        for (dx, dy) in ((0.13, 0.13), (-0.13, 0.13), (0.13, -0.13), (-0.13, -0.13)):
            mb.tube([(sx + dx * 1.15, sy + dy * 1.15, 0.03), (sx + dx * 0.8, sy + dy * 0.8, 0.62)], 0.012, M['black-metal'], segs=6)
    # dining table and six chairs
    tx0, tx1, ty0, ty1 = 2.05, 4.45, 2.0, 2.95
    mb.box(tx0, ty0, 0.72, tx1, ty1, 0.76, M['table-oak'])
    for (x, y) in ((tx0 + 0.1, ty0 + 0.1), (tx1 - 0.16, ty0 + 0.1), (tx0 + 0.1, ty1 - 0.16), (tx1 - 0.16, ty1 - 0.16)):
        mb.box(x, y, 0.03, x + 0.06, y + 0.06, 0.72, M['table-oak'])
    for cx in (2.45, 3.25, 4.05):
        for (cy, s) in ((ty0 - 0.3, -1), (ty1 + 0.3, 1)):
            mb.box(cx - 0.22, cy - 0.21, 0.44, cx + 0.22, cy + 0.21, 0.48, M['fabric'])
            mb.box(cx - 0.22, cy + s * 0.19, 0.48, cx + 0.22, cy + s * 0.22, 0.86, M['fabric'])
            for (dx, dy) in ((-0.19, -0.18), (0.19, -0.18), (-0.19, 0.18), (0.19, 0.18)):
                mb.box(cx + dx - 0.015, cy + dy - 0.015, 0.03, cx + dx + 0.015, cy + dy + 0.015, 0.44, M['black-metal'])
    mb.box(1.6, 1.25, 0.03, 4.9, 3.7, 0.04, M['rug'])
    # armchair and floor lamp by the slot window
    mb.box(5.0, 0.4, 0.03, 5.85, 1.25, 0.42, M['fabric-dark'])
    mb.box(5.65, 0.4, 0.42, 5.85, 1.25, 0.85, M['fabric-dark'])
    # art on the back wall and an internal doorway
    mb.box(1.5, y_back + 0.0, 1.1, 3.2, y_back + 0.03, 2.1, M['bronze'])
    mb.box(1.55, y_back + 0.03, 1.15, 3.15, y_back + 0.035, 2.05, M['art'])
    # pendants over the island (globes) and a linear pendant over the table
    for px in (2.4, 3.15, 3.9):
        c = Vector((px, (iy0 + iy1) / 2, 1.85))
        lamps.sphere(c, 0.13, M['lamp-globe'], segs=20, rings=12)
        lamps.tube([(px, c.y, 1.98), (px, c.y, CEIL)], 0.004, M['black-metal'], segs=5, cap=False)
        lamps.cylinder(px, c.y, CEIL - 0.015, CEIL, 0.05, M['bronze'], segs=12)
        light('pendant-%.1f' % px, 'POINT', c, 32, (255, 186, 120), 0.1)
    lamps.box(2.5, 2.42, 1.55, 4.0, 2.53, 1.6, M['bronze'])
    lamps.box(2.52, 2.44, 1.548, 3.98, 2.51, 1.551, M['lamp-led'])
    for xx in (2.6, 3.9):
        lamps.tube([(xx, 2.475, 1.6), (xx, 2.475, CEIL)], 0.003, M['black-metal'], segs=4, cap=False)
    light('table-pendant', 'AREA', (3.25, 2.475, 1.545), 55, (255, 190, 125), size=(1.4, 0.07), rot=(0, 0, 0))
    # recessed downlights
    for (x, y) in ((1.1, -3.3), (3.25, -3.3), (5.3, -3.3), (1.1, -1.4), (1.1, 0.6), (5.3, 0.6), (1.1, 3.6), (5.3, 3.6), (5.3, -1.4)):
        lamps.cylinder(x, y, CEIL - 0.004, CEIL - 0.002, 0.045, M['lamp-down'], segs=12)
        light('down-%.1f-%.1f' % (x, y), 'SPOT', (x, y, CEIL - 0.03), 14, (255, 208, 160), 0.03, rot=(0, 0, 0), spot=(80, 0.6))
    # LED strip hidden in the lantern well
    lx0, lx1, ly0, ly1 = EXT['lantern']
    for (x0, y0, x1, y1) in ((lx0 + 0.01, ly0 + 0.01, lx1 - 0.01, ly0 + 0.03), (lx0 + 0.01, ly1 - 0.03, lx1 - 0.01, ly1 - 0.01)):
        lamps.box(x0, y0, CEIL + 0.08, x1, y1, CEIL + 0.1, M['lamp-led'])
    light('lantern-glow', 'AREA', ((lx0 + lx1) / 2, (ly0 + ly1) / 2, 3.2), 40, (255, 200, 140), size=(lx1 - lx0 - 0.2, ly1 - ly0 - 0.2), rot=(0, 0, 0))
    # under-cabinet glow on the worktop
    light('worktop-strip', 'AREA', (0.55, -0.35, 1.5), 45, (255, 196, 130), size=(0.4, 4.0), rot=(0, 0, 0))
    # a large indoor plant in a pot
    lamps.cylinder(5.6, 3.55, 0.03, 0.5, 0.22, M['planter'], segs=16, r_top=0.25)
    plant_cards(lamps, Vector((5.6, 3.55, 1.25)), (0.45, 0.45, 0.65), int(160 * LEAF), 0.32, 'leaf-olive', seed=9)
    lamps.tube([(5.6, 3.55, 0.45), (5.62, 3.52, 1.3)], 0.02, M['bark'], segs=6)
    mb.build(COLL)
    lamps.build(COLL)


# ================================================================== planting
def plant_cards(mb, centre, radii, n, size, mat, seed=1, clumps=None, shell=0.55, up_bias=0.3):
    rnd = random.Random(seed)
    c = Vector(centre)
    rx, ry, rz = radii
    clumps = clumps or max(6, n // 40)
    cl = []
    for _ in range(clumps):
        while True:
            v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0.2 < v.length <= 1.0:
                break
        v = v.normalized() * (shell + (1 - shell) * rnd.random() ** 0.5)
        cl.append(v)
    for i in range(n):
        base = cl[i % clumps]
        off = Vector((rnd.gauss(0, 0.22), rnd.gauss(0, 0.22), rnd.gauss(0, 0.18)))
        v = base + off
        if v.length > 1.05:
            v = v.normalized() * 1.05
        p = c + Vector((v.x * rx, v.y * ry, v.z * rz))
        nrm = (v.normalized() + Vector((0, 0, up_bias)) + Vector((rnd.gauss(0, 0.6), rnd.gauss(0, 0.6), rnd.gauss(0, 0.6)))).normalized()
        t1 = nrm.cross(Vector((0, 0, 1)))
        if t1.length < 1e-3:
            t1 = Vector((1, 0, 0))
        t1.normalize()
        t2 = nrm.cross(t1).normalized()
        ang = rnd.uniform(0, 2 * math.pi)
        a = t1 * math.cos(ang) + t2 * math.sin(ang)
        b = nrm.cross(a).normalized()
        s = size * rnd.uniform(0.75, 1.25) / 2
        pts = [p - a * s - b * s, p + a * s - b * s, p + a * s + b * s, p - a * s + b * s]
        mb.face(pts, M[mat], uv=[(0, 0), (1, 0), (1, 1), (0, 1)])


def tree(name, base, height, crown, trunk_r, seed=1, cards=1800, card=0.55, leaf='leaf', bark='bark', stems=1, lean=0.15):
    rnd = random.Random(seed)
    bk, lf = MB(name + '-branches'), MB(name + '-leaves')
    base = Vector(base)
    rx, ry, rz = crown
    cz = height - rz
    ccen = Vector((base.x, base.y, cz))
    tips = []
    for s in range(stems):
        ang = 2 * math.pi * s / stems + rnd.uniform(-0.3, 0.3)
        lo = lean if stems > 1 else rnd.uniform(0, 0.05)
        top = base + Vector((math.cos(ang) * lo * height, math.sin(ang) * lo * height, height * 0.82))
        p0 = base + Vector((math.cos(ang) * 0.08 * (stems > 1), math.sin(ang) * 0.08 * (stems > 1), 0))
        mid = p0.lerp(top, 0.5) + Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0))
        r0 = trunk_r / (stems ** 0.5)
        bk.tube([p0 - Vector((0, 0, 0.1)), p0.lerp(mid, 0.5), mid, mid.lerp(top, 0.5), top], [r0 * 1.15, r0, r0 * 0.8, r0 * 0.55, r0 * 0.3],
                M[bark], segs=10)
        nbr = 7 if stems == 1 else 4
        for k in range(nbr):
            t = rnd.uniform(0.45, 0.9)
            st = p0.lerp(top, t)
            a2 = rnd.uniform(0, 2 * math.pi)
            dirv = Vector((math.cos(a2), math.sin(a2), rnd.uniform(0.4, 1.1))).normalized()
            L = rnd.uniform(0.45, 0.85) * max(rx, ry)
            end = st + dirv * L
            rel = end - ccen
            q = Vector((rel.x / rx, rel.y / ry, rel.z / rz))
            if q.length > 0.95:
                end = ccen + Vector((q.x * rx, q.y * ry, q.z * rz)) * (0.95 / q.length)
            midb = st.lerp(end, 0.5) + Vector((0, 0, rnd.uniform(0, 0.25)))
            rb = r0 * rnd.uniform(0.3, 0.45)
            bk.tube([st, midb, end], [rb, rb * 0.6, rb * 0.15], M[bark], segs=6)
            tips.append(end)
    plant_cards(lf, ccen, crown, int(cards * LEAF), card, leaf, seed=seed + 7, clumps=max(12, int(cards * LEAF) // 30))
    bk.build(COLL)
    lf.build(COLL)


def shrub(mb, x, y, r, h, seed, mat='leaf-dark', n=90):
    plant_cards(mb, Vector((x, y, h * 0.5)), (r, r, h * 0.5), int(n * LEAF), 0.34, mat, seed=seed, clumps=8, shell=0.4, up_bias=0.6)


def grass_tuft(mb, x, y, h, seed):
    rnd = random.Random(seed)
    for k in range(3):
        ang = k * math.pi / 3 + rnd.uniform(-0.2, 0.2)
        dx, dy = math.cos(ang) * h * 0.5, math.sin(ang) * h * 0.5
        mb.face([Vector((x - dx, y - dy, 0.0)), Vector((x + dx, y + dy, 0.0)), Vector((x + dx, y + dy, h)), Vector((x - dx, y - dy, h))],
                M['grass-tuft'], uv=[(0, 0), (1, 0), (1, 1), (0, 1)])


def box_ball(mb, x, y, r, z0=0.0):
    mb.sphere((x, y, z0 + r * 0.92), r, M['buxus'], segs=18, rings=12)


def fence(mb, p0, p1, mat='timber', h=1.8):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    a = d / L
    side = Vector((-a.y, a.x, 0))
    nposts = max(1, int(L / 1.8))
    for i in range(nposts + 1):
        c = p0 + a * (L * i / nposts)
        mb.box(c.x - 0.045, c.y - 0.045, 0.0, c.x + 0.045, c.y + 0.045, h + 0.03, M[mat])
    slat_h, gap = 0.135, 0.016
    z = 0.06
    while z + slat_h <= h + 0.001:
        q0 = p0 + side * 0.05
        q1 = p1 + side * 0.05
        xs = sorted((q0.x, q1.x))
        ys = sorted((q0.y, q1.y))
        if abs(a.x) > abs(a.y):
            mb.box(xs[0], q0.y - 0.011, z, xs[1], q0.y + 0.011, z + slat_h, M[mat])
        else:
            mb.box(q0.x - 0.011, ys[0], z, q0.x + 0.011, ys[1], z + slat_h, M[mat])
        z += slat_h + gap
    xs = sorted((p0.x, p1.x))
    ys = sorted((p0.y, p1.y))
    if abs(a.x) > abs(a.y):
        mb.box(xs[0], p0.y - 0.06, h, xs[1], p0.y + 0.08, h + 0.035, M[mat])
    else:
        mb.box(p0.x - 0.06, ys[0], h, p0.x + 0.08, ys[1], h + 0.035, M[mat])


def garden():
    g, beds, plants, fen = MB('garden-hard'), MB('garden-beds'), MB('garden-plants'), MB('fences')
    # base ground beyond everything
    g.box(-400, -400, -0.12, 400, 400, -0.06, M['ground'])
    g.box(-40, -24, -0.06, 40, -16.5, -0.04, M['tarmac'])  # the street in front
    # our patio, side return and side patio
    g.box(0.0, EXT_D, -0.06, PLOT_R, PATIO_END, 0.0, M['paving'])
    g.box(HW, -4.0, -0.06, PLOT_R, EXT_D, 0.0, M['paving'])
    # lawn with steel edging, borders
    lx0, lx1, ly0, ly1 = 0.95, PLOT_R - 0.95, PATIO_END + 0.05, GARDEN_END - 1.4
    g.box(lx0, ly0, -0.06, lx1, ly1, -0.01, M['lawn'])
    for (x0, y0, x1, y1) in ((lx0 - 0.006, ly0, lx0, ly1), (lx1, ly0, lx1 + 0.006, ly1), (lx0, ly1, lx1, ly1 + 0.006)):
        g.box(x0, y0, -0.06, x1, y1, 0.005, M['steel-edge'])
    beds.box(0.0, PATIO_END, -0.06, lx0, GARDEN_END, 0.02, M['mulch'])
    beds.box(lx1, PATIO_END, -0.06, PLOT_R, GARDEN_END, 0.02, M['mulch'])
    beds.box(lx0, ly1, -0.06, lx1, GARDEN_END, 0.02, M['mulch'])
    beds.box(PLOT_R - 0.7, -4.0, 0.0, PLOT_R, PATIO_END, 0.02, M['mulch'])
    # neighbour: old slab patio and lawn
    g.box(-HW, 0.0, -0.06, 0.0, 3.2, -0.005, M['paving-old'])
    g.box(-HW, 3.2, -0.06, 0.0, GARDEN_END, -0.015, M['lawn-plain'])
    g.box(-HW, 3.2, -0.06, -HW + 0.7, GARDEN_END, 0.0, M['mulch'])
    # fences: our boundaries, the neighbour's far side and the back
    fence(fen, (0.0, EXT_D, 0), (0.0, GARDEN_END, 0))
    fence(fen, (PLOT_R, -4.0, 0), (PLOT_R, GARDEN_END, 0))
    fence(fen, (-HW - 1.7, GARDEN_END, 0), (PLOT_R + 1.5, GARDEN_END, 0))
    fence(fen, (-HW, 0.0, 0), (-HW, GARDEN_END, 0), mat='timber-old')
    # garden shed at the neighbour's end
    g.box(-5.6, 21.6, 0.0, -3.4, 24.4, 2.0, M['shed'])
    g.box(-5.75, 21.45, 2.0, -3.25, 24.55, 2.1, M['felt'])
    # planters with box balls by the patio edge, and in the side garden
    for (x, y, s) in ((0.45, 8.45, 0.55), (PLOT_R - 0.5, 8.45, 0.55)):
        g.box(x - s / 2, y - s / 2, 0.0, x + s / 2, y + s / 2, s, M['planter'])
        box_ball(plants, x, y, 0.3, s - 0.04)
    for k, y in enumerate((-2.8, -1.0, 0.8, 2.6)):
        box_ball(plants, PLOT_R - 0.35, y, 0.28 + 0.03 * (k % 2))
    for k, x in enumerate((1.9, 3.4, 6.6, 8.1)):
        box_ball(plants, x, ly1 + 0.6, 0.34 + 0.04 * (k % 2))
    # borders: grasses and shrubs
    rnd = random.Random(4)
    for k in range(18):
        y = PATIO_END + 0.5 + k * (ly1 - PATIO_END - 0.6) / 17
        grass_tuft(plants, 0.45 + rnd.uniform(-0.15, 0.15), y, rnd.uniform(0.55, 0.75), 100 + k)
        grass_tuft(plants, PLOT_R - 0.45 + rnd.uniform(-0.15, 0.15), y + 0.3, rnd.uniform(0.55, 0.75), 200 + k)
    for k in range(9):
        y = PATIO_END + 1.2 + k * 1.6
        shrub(plants, 0.45, y + 0.6, 0.45, 1.1 + 0.3 * (k % 2), 300 + k)
        shrub(plants, PLOT_R - 0.45, y, 0.45, 1.0 + 0.3 * ((k + 1) % 2), 400 + k)
    for k in range(6):
        grass_tuft(plants, 1.5 + k * 1.3, GARDEN_END - 0.6, 0.7, 500 + k)
    for k in range(6):
        shrub(plants, -HW + 0.35, 5 + k * 3.2, 0.4, 1.2, 600 + k, mat='leaf')
    # outdoor dining set in the side garden: table and four chairs, dark aluminium
    tx, ty = 8.25, 1.1
    g.box(tx - 0.45, ty - 0.8, 0.71, tx + 0.45, ty + 0.8, 0.74, M['table-oak'])
    for (dx, dy) in ((-0.4, -0.72), (0.37, -0.72), (-0.4, 0.69), (0.37, 0.69)):
        g.box(tx + dx, ty + dy, 0.0, tx + dx + 0.03, ty + dy + 0.03, 0.71, M['black-metal'])
    for (cx, cy, s) in ((tx - 0.75, ty - 0.35, -1), (tx - 0.75, ty + 0.35, -1), (tx + 0.75, ty - 0.35, 1), (tx + 0.75, ty + 0.35, 1)):
        g.box(cx - 0.22, cy - 0.22, 0.42, cx + 0.22, cy + 0.22, 0.46, M['black-metal'])
        g.box(cx + s * 0.2, cy - 0.22, 0.46, cx + s * 0.23, cy + 0.22, 0.85, M['black-metal'])
        g.box(cx - 0.2, cy - 0.2, 0.46, cx + 0.2, cy + 0.2, 0.52, M['fabric'])
        for (dx, dy) in ((-0.2, -0.2), (0.18, -0.2), (-0.2, 0.18), (0.18, 0.18)):
            g.box(cx + dx, cy + dy, 0.0, cx + dx + 0.025, cy + dy + 0.025, 0.42, M['black-metal'])
    # garden lighting: an uplight under the birch and two spikes on the box balls
    light('birch-uplight', 'SPOT', (PLOT_R - 0.75, -1.5, 0.12), 30, (255, 205, 150), 0.03, rot=(math.pi, 0, 0), spot=(45, 0.5), group='ext')
    for x in (3.4, 6.6):
        light('ball-spike-%.1f' % x, 'SPOT', (x, ly1 + 0.05, 0.15), 6, (255, 205, 150), 0.02, rot=(-1.9, 0, 0), spot=(50, 0.5), group='ext')
    for m in (g, beds, plants, fen):
        m.build(COLL)


def trees():
    # our multi-stem birch, a small tree in the neighbour's garden, mature trees around
    tree('birch', (PLOT_R - 0.55, -1.8, 0), 7.2, (2.0, 2.0, 2.4), 0.16, seed=3, cards=1300, card=0.42, bark='bark-birch', stems=3, lean=0.12)
    tree('apple', (-3.6, 13.0, 0), 4.2, (2.0, 2.0, 1.5), 0.12, seed=5, cards=900, card=0.45, leaf='leaf-dark')
    tree('back-oak', (1.5, 30.0, 0), 13.0, (5.0, 4.5, 4.5), 0.4, seed=7, cards=2600, card=0.75, leaf='leaf-dark')
    # street trees beyond the houses, rising over the ridges
    for i, (x, y, h) in enumerate(((-11.0, -15.8, 14.0), (3.0, -15.8, 15.0), (16.0, -15.8, 13.5), (-3.5, -25.5, 13.0), (10.5, -25.5, 14.0))):
        tree('street-%d' % i, (x, y, 0), h, (4.2, 4.0, 4.6), 0.35, seed=20 + i, cards=2000, card=0.8, leaf='leaf-dark')
    tree('side-tree', (13.5, 14.0, 0), 9.0, (3.2, 3.2, 3.2), 0.3, seed=31, cards=1500, card=0.7, leaf='leaf')
    # distant tree line so the horizon never shows bare ground
    rnd = random.Random(77)
    far = MB('distant-trees')
    for k in range(34):
        ang = 2 * math.pi * k / 34 + rnd.uniform(-0.05, 0.05)
        dist = rnd.uniform(70, 110)
        cx, cy = math.cos(ang) * dist, math.sin(ang) * dist + 2.0
        h = rnd.uniform(11, 18)
        r = rnd.uniform(5, 8)
        far.tube([(cx, cy, -0.1), (cx, cy, h * 0.6)], 0.5, M['bark'], segs=6)
        plant_cards(far, Vector((cx, cy, h - r * 0.8)), (r, r, r * 0.85), int(260 * LEAF), 2.6, 'leaf-dark', seed=900 + k, clumps=14, shell=0.5)
    far.build(COLL)


# ================================================================== scene assembly
def build(mode='render', leaf=1.0):
    global MODE, LEAF, COLL
    MODE, LEAF = mode, leaf
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M.clear()
    mk.TILE.clear()
    mk.REGISTRY.clear()
    LIGHTS.clear()
    COLL = bpy.data.collections.new('riverside-extension')
    bpy.context.scene.collection.children.link(COLL)
    make_materials()
    house('ours', 0.0, +1, 'ours')
    house('neighbour', 0.0, -1, 'neighbour', front_door='door-green')
    party_stack(0.0)
    house('pair-right-a', 18.0, -1, 'plain')
    house('pair-right-b', 18.0, +1, 'plain', front_door='door-green')
    party_stack(18.0)
    house('pair-left-a', -15.0, +1, 'plain', front_door='door-green')
    house('pair-left-b', -15.0, -1, 'plain')
    party_stack(-15.0)
    # the other side of the street: same pairs turned round, front gardens facing ours
    for i, px in enumerate((-24.0, -6.0, 12.0, 30.0)):
        before = set(bpy.data.objects)
        house('opp-%da' % i, 0.0, +1, 'plain', front_door='door-green' if i % 2 else 'door-navy')
        house('opp-%db' % i, 0.0, -1, 'plain')
        party_stack(0.0)
        for ob in set(bpy.data.objects) - before:
            if ob.type == 'LIGHT':
                bpy.data.objects.remove(ob)
                continue
            ob.rotation_euler.z = math.pi
            ob.location = (px, -HD - 24.0 - HD, 0.0)
    dormer()
    extension()
    ext_interior()
    garden()
    trees()
    faces = sum(len(m.faces) for m in mk.REGISTRY)
    print('built: %d objects, %d faces, %d lights' % (len(bpy.data.objects), faces, len(LIGHTS)))


# ================================================================== look development
def clouds(nt, sky_socket, kind):
    """Soft stratocumulus layer projected on a plane overhead, mixed over the sky texture."""
    N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs[0])
    zc = N.new('ShaderNodeMath')
    zc.operation = 'MAXIMUM'
    zc.inputs[1].default_value = 0.035
    L.new(sep.outputs['Z'], zc.inputs[0])
    comb = N.new('ShaderNodeCombineXYZ')
    for axis in ('X', 'Y'):
        dv = N.new('ShaderNodeMath')
        dv.operation = 'DIVIDE'
        L.new(sep.outputs[axis], dv.inputs[0])
        L.new(zc.outputs[0], dv.inputs[1])
        L.new(dv.outputs[0], comb.inputs[axis])
    comb.inputs['Z'].default_value = 0.3
    nz = N.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 0.55
    nz.inputs['Detail'].default_value = 9.0
    nz.inputs['Roughness'].default_value = 0.6
    if 'Distortion' in nz.inputs:
        nz.inputs['Distortion'].default_value = 0.25
    L.new(comb.outputs[0], nz.inputs['Vector'])
    cov = N.new('ShaderNodeMapRange')
    lo, hi = (0.5, 0.72) if kind == 'dusk' else (0.52, 0.74)
    cov.inputs['From Min'].default_value = lo
    cov.inputs['From Max'].default_value = hi
    L.new(nz.outputs['Fac'], cov.inputs['Value'])
    # fade towards the horizon where the projection gets stretched
    fade = N.new('ShaderNodeMapRange')
    fade.inputs['From Min'].default_value = 0.03
    fade.inputs['From Max'].default_value = 0.22
    L.new(sep.outputs['Z'], fade.inputs['Value'])
    amt = N.new('ShaderNodeMath')
    amt.operation = 'MULTIPLY'
    L.new(cov.outputs['Result'], amt.inputs[0])
    L.new(fade.outputs['Result'], amt.inputs[1])
    amt2 = N.new('ShaderNodeMath')
    amt2.operation = 'MULTIPLY'
    amt2.inputs[1].default_value = 0.85 if kind == 'dusk' else 0.8
    L.new(amt.outputs[0], amt2.inputs[0])
    # cloud colour: a lit and a shaded tone, by noise detail
    shade = N.new('ShaderNodeMix')
    shade.data_type = 'RGBA'
    if kind == 'dusk':
        lit, dark = (0.55, 0.32, 0.30, 1), (0.10, 0.10, 0.15, 1)
    else:
        lit, dark = (13.0, 13.0, 13.2, 1), (6.0, 6.3, 7.0, 1)
    shade.inputs['A'].default_value = dark
    shade.inputs['B'].default_value = lit
    L.new(nz.outputs['Fac'], shade.inputs['Factor'])
    mix = N.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    L.new(amt2.outputs[0], mix.inputs['Factor'])
    L.new(sky_socket, mix.inputs['A'])
    L.new(shade.outputs['Result'], mix.inputs['B'])
    return mix.outputs['Result']


def set_world(kind):
    scn = bpy.context.scene
    w = bpy.data.worlds.get('sky') or bpy.data.worlds.new('sky')
    scn.world = w
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_disc = False
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    sky_col = clouds(nt, sky.outputs[0], kind)
    nt.links.new(sky_col, bg.inputs['Color'])
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    for o in [o for o in bpy.data.objects if o.name.startswith('sun')]:
        bpy.data.objects.remove(o)
    if kind == 'dusk':
        sky.sun_elevation = math.radians(-1.5)
        sky.sun_rotation = math.radians(205)
        sky.aerosol_density = 1.6 if hasattr(sky, 'aerosol_density') else 1.0
        bg.inputs['Strength'].default_value = 1.0
        return None
    el, rot = (math.radians(34), math.radians(38))
    sky.sun_elevation, sky.sun_rotation = el, rot
    if hasattr(sky, 'aerosol_density'):
        sky.aerosol_density = 2.0
    bg.inputs['Strength'].default_value = 1.0
    sd = bpy.data.lights.new('sun', 'SUN')
    sd.energy = 45.0
    sd.angle = math.radians(1.2)
    sd.color = (1.0, 0.95, 0.88)
    so = bpy.data.objects.new('sun', sd)
    s = Vector((math.sin(rot) * math.cos(el), math.cos(rot) * math.cos(el), math.sin(el)))
    so.rotation_mode = 'QUATERNION'
    so.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(s)
    bpy.context.scene.collection.objects.link(so)
    return so


def set_lights(kind):
    for ob, e, group in LIGHTS:
        if kind == 'dusk':
            ob.data.energy = e * (1.0 if group == 'int' else 1.0)
        elif kind == 'day':
            ob.data.energy = e * (0.35 if group == 'int' else 0.0)
        else:
            ob.data.energy = 0.0
    for name in ('lamp-globe', 'lamp-led', 'lamp-down', 'lamp-ext'):
        mat = M[name]
        node = next((n for n in mat.node_tree.nodes if n.type == 'EMISSION'), None)
        if node:
            base = mat['emit_base']
            node.inputs['Strength'].default_value = base if kind == 'dusk' else (base * 0.35 if kind == 'day' and name != 'lamp-ext' else 0.0)


def camera(name, loc, target, lens):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36
    cd.sensor_fit = 'HORIZONTAL'
    cd.clip_start = 0.1
    cd.clip_end = 300
    ob = bpy.data.objects.new(name, cd)
    loc, target = Vector(loc), Vector(target)
    d = target - loc
    yaw = math.atan2(d.y, d.x) - math.pi / 2
    ob.location = loc
    ob.rotation_euler = (math.pi / 2, 0, yaw)
    hdist = math.hypot(d.x, d.y)
    cd.shift_y = (d.z / hdist) * lens / 36.0
    bpy.context.scene.collection.objects.link(ob)
    return ob


CAMS = {
    'rear': dict(loc=(8.3, 17.2, 1.95), target=(2.6, 0.0, 3.55), lens=22.0),
    'side': dict(loc=(9.55, 7.4, 1.7), target=(3.6, 0.6, 2.4), lens=19.0),
}

CLAY_KEEP = {'glass', 'glass-frosted', 'leaf', 'leaf-dark', 'leaf-olive', 'grass-tuft'}


def to_clay():
    clay = bpy.data.materials.new('clay')
    nt, N, L = _nodes(clay)
    out = N.new('ShaderNodeOutputMaterial')
    b = N.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (0.78, 0.78, 0.77, 1)
    b.inputs['Roughness'].default_value = 0.85
    L.new(b.outputs[0], out.inputs['Surface'])
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        for slot in ob.material_slots:
            m = slot.material
            if m is None:
                continue
            if m.name in CLAY_KEEP:
                if m.name.startswith('leaf') or m.name == 'grass-tuft':
                    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                    lnk = [l for l in m.node_tree.links if l.to_socket == bs.inputs['Base Color']]
                    for l in lnk:
                        m.node_tree.links.remove(l)
                    bs.inputs['Base Color'].default_value = (0.74, 0.76, 0.72, 1)
                continue
            slot.material = clay


def render_settings(samples, res, threads):
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    c = scn.cycles
    c.device = 'CPU'
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.035
    c.adaptive_min_samples = 16
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    try:
        c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        c.denoising_prefilter = 'ACCURATE'
    except Exception:
        pass
    c.max_bounces = 8
    c.diffuse_bounces = 3
    c.glossy_bounces = 3
    c.transmission_bounces = 6
    c.transparent_max_bounces = 24
    c.volume_bounces = 0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.sample_clamp_indirect = 8.0
    c.use_light_tree = True
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.threads_mode = 'FIXED'
    scn.render.threads = threads
    scn.render.image_settings.file_format = 'PNG'
    scn.render.image_settings.color_mode = 'RGB'
    scn.render.image_settings.compression = 40
    scn.view_settings.view_transform = 'AgX'
    scn.view_settings.look = 'AgX - Medium High Contrast'


EXPOSURE = {'dusk': 1.0, 'day': -3.5, 'clay': -3.3}


def render_one(spec, outdir, samples, res, threads, log):
    view, kind = spec.split('-', 1)
    scn = bpy.context.scene
    if kind == 'clay':
        to_clay()
        set_world('day')
        set_lights('off')
    else:
        set_world(kind)
        set_lights(kind)
    scn.view_settings.exposure = EXPOSURE[kind]
    if kind == 'dusk':
        scn.view_settings.look = 'AgX - Medium High Contrast'
    else:
        scn.view_settings.look = 'AgX - Base Contrast' if kind == 'clay' else 'AgX - Medium High Contrast'
    cam = bpy.data.objects.get('cam-' + view) or camera('cam-' + view, **CAMS[view])
    scn.camera = cam
    render_settings(samples, res, threads)
    path = os.path.join(outdir, 'extension-%s.png' % spec)
    scn.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    dt = time.time() - t
    log.append({'render': spec, 'seconds': round(dt, 1), 'path': path, 'bytes': os.path.getsize(path), 'samples': samples, 'res': res})
    print('rendered %s in %.1fs -> %s' % (spec, dt, path))


# ================================================================== export
def export_glb(path, scratch):
    """Clean, small glb: modifiers applied (none used), textures max 1024 px, JPEG, Y-up, no lights or cameras."""
    from PIL import Image
    os.makedirs(scratch, exist_ok=True)
    for img in list(bpy.data.images):
        if not img.filepath:
            continue
        src = bpy.path.abspath(img.filepath)
        base = os.path.basename(src)
        im = Image.open(src)
        lim = 512 if base.endswith('-normal.png') or base.startswith(('mulch', 'buxus', 'grass', 'leaves')) else 1024
        if max(im.size) > lim:
            im = im.resize((min(lim, im.size[0]), min(lim, im.size[1])) if im.size[0] == im.size[1] else
                           (min(lim, im.size[0]), max(1, int(im.size[1] * min(lim, im.size[0]) / im.size[0]))), Image.LANCZOS)
        dst = os.path.join(scratch, base)
        im.save(dst)
        img.filepath = dst
        img.reload()
    for ob in list(bpy.data.objects):
        if ob.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(ob)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=True,
        export_image_format='JPEG', export_jpeg_quality=82, export_image_quality=82,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
    return os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--renders', default='')
    ap.add_argument('--export', action='store_true')
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--samples', type=int, default=160)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--out', default=os.path.join(ROOT, 'lab', 'inputs'))
    ap.add_argument('--scratch', default='/tmp/riverside-extension')
    ap.add_argument('--res', default='1600x900')
    ap.add_argument('--log', default='')
    a = ap.parse_args()
    log = []
    res = tuple(int(v) for v in a.res.split('x'))
    samples = a.samples
    out = a.out
    if a.preview:
        res = (800, 450)
        samples = min(samples, 32)
        out = os.path.join(a.scratch, 'preview')
    os.makedirs(out, exist_ok=True)
    if a.renders:
        t = time.time()
        build('render', 1.0)
        log.append({'build_seconds': round(time.time() - t, 1)})
        specs = [s for s in a.renders.split(',') if s]
        specs.sort(key=lambda s: s.endswith('clay'))  # clay swaps materials, so it goes last
        for spec in specs:
            render_one(spec, out, samples, res, a.threads, log)
    if a.export:
        t = time.time()
        build('export', 0.6)
        path = os.path.join(ROOT, 'lab', 'assets', 'extension-semi.glb')
        size = export_glb(path, os.path.join(a.scratch, 'export-tex'))
        log.append({'export': path, 'bytes': size, 'seconds': round(time.time() - t, 1)})
        print('exported %s (%.2f MB)' % (path, size / 1e6))
    if a.log:
        with open(a.log, 'w') as f:
            json.dump(log, f, indent=2)
    print(json.dumps(log, indent=2))


if __name__ == '__main__':
    main()
