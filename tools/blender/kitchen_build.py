"""Builds one Riverside kitchen in Blender from a KitchenArt card spec (see kitchen-cards.json).

Real UK dimensions in metres: 150 mm plinth, 720 mm base carcass, 600 mm deep run, 30-40 mm worktop
with a 20 mm overhang, 720 mm wall units 450 mm above the worktop, 3 mm door gaps, 900 mm island.
Frame: x along the back wall, y from the back wall (0) towards the camera (negative), z up.
"""
import math
import random

import bpy
from mathutils import Matrix, Vector

from kitchen_geo import Geo, transform, rot_about
from kitchen_materials import Materials, hex_lin, shade_hex, luminance, kelvin

PLINTH = 0.15
CARCASS = 0.72
BASE_TOP = PLINTH + CARCASS          # 0.87, top of the base carcass
DEPTH = 0.6                           # base run depth including doors
GAP = 0.003                           # door gaps
CEIL = 2.6
WALL_DEPTH = 0.33
WALL_UNIT_H = 0.72
ROOM_FRONT = -8.0                     # the room opens out behind the camera (glazed rear wall)


class Kitchen:
    def __init__(self, spec, seed=None):
        self.s = spec
        self.rng = random.Random(seed if seed is not None else sum(ord(c) for c in spec['id']))
        self.col = bpy.data.collections.new('kitchen-' + spec['id'])
        bpy.context.scene.collection.children.link(self.col)
        self.M = Materials()
        self.g = Geo(self.col, self.M, seed=self.rng.randint(0, 10 ** 6))
        self.lights = []
        self.noexport = set()
        self._mats()
        self._layout()

    # ================================================================ materials for this card
    def _mats(self):
        s, M = self.s, self.M
        self.unit_kind = self._wood_kind(s.get('unitName', ''))
        self.m_unit = self._unit_mat(s['unit'], s.get('unitName', ''))
        self.m_unit_dark = M.paint(shade_hex(s['unit'], -0.35), 0.6, name='carcass') if not self.unit_kind else M.wood(self.unit_kind, shade_hex(s['unit'], -0.2), name='carcass')
        self.m_upper = self.m_unit
        self.top_kind = s['top']
        self.wt = 0.04 if s['top'] in ('oak', 'concrete') else 0.03
        self.wt_top = BASE_TOP + self.wt
        self.m_top = M.top(s['top'])
        self.metal_kind = s.get('handles')
        self.m_handle = M.metal(self.metal_kind) if self.metal_kind else None
        self.m_tap = M.metal(self.metal_kind or 'chrome') if self.metal_kind != 'black' else M.metal('black')
        self.m_steel = M.metal('steel')
        self.m_chrome = M.metal('chrome')
        self.m_black = M.metal('black')
        self.m_glass_black = M.plain('glass-black', (0.006, 0.006, 0.007), rough=0.04, spec=0.6)
        self.m_ceramic = M.plain('ceramic-white', '#F3F1EC', rough=0.06, coat=0.6, coat_rough=0.02)
        self.m_ceiling = M.plain('ceiling', '#F3F2EF', rough=0.9, spec=0.3)
        self.m_white_paint = M.plain('paint-white-timber', '#F1EFEA', rough=0.4)
        self.m_window_glass = M.plain('window-glass', (0.9, 0.93, 0.94), rough=0.0, alpha=0.1, spec=0.8)
        self.m_cast_iron = M.plain('cast-iron', '#141414', rough=0.55, metallic=0.4)
        # walls
        wt = s.get('wallType')
        if wt == 'brick':
            self.m_wall = M.textured('wall-brick', 'kitchen-wall-brick-albedo.png', rough=0.92, normal_tex='kitchen-wall-brick-normal.png', normal_strength=1.0, spec=0.2)
        elif wt == 'concrete':
            f = M._tint_factor('kitchen-wall-microcement-albedo.png', s['wall'], absolute=True)
            self.m_wall = M.textured('wall-microcement-' + s['id'], 'kitchen-wall-microcement-albedo.png', tint=f, rough=0.75, spec=0.3)
        else:
            f = M._tint_factor('kitchen-wall-plaster-albedo.png', s['wall'], absolute=True)
            self.m_wall = M.textured('wall-paint-' + s['id'], 'kitchen-wall-plaster-albedo.png', tint=f, rough=0.88, spec=0.3)
        self.m_wall_plain = self.m_wall
        # splashback
        sp = s.get('splash', 'plain')
        if sp == 'metro':
            tex = 'kitchen-tile-metro-dark-grout-albedo.png' if (s.get('grout') and luminance(s['grout']) < 0.1) else 'kitchen-tile-metro-albedo.png'
            f = M._tint_factor(tex, s.get('splashColour', '#F3F1EC'), absolute=True)
            self.m_splash = M.textured('splash-metro-' + s['id'], tex, tint=f, rough_tex='kitchen-tile-metro-roughness.png',
                                       normal_tex='kitchen-tile-metro-normal.png', normal_strength=1.0, coat=0.3, coat_rough=0.03)
        elif sp == 'zellige':
            f = M._tint_factor('kitchen-tile-zellige-albedo.png', s.get('splashColour', '#EEEBE4'), absolute=True)
            self.m_splash = M.textured('splash-zellige-' + s['id'], 'kitchen-tile-zellige-albedo.png', tint=f,
                                       rough_tex='kitchen-tile-zellige-roughness.png', normal_tex='kitchen-tile-zellige-normal.png',
                                       normal_strength=1.2, coat=0.5, coat_rough=0.03)
        elif sp == 'marble':
            self.m_splash = M.top('marble')
        else:
            self.m_splash = M.plain('splash-glass-' + s['id'], s.get('splashColour', '#E3E5E5'), rough=0.04, coat=0.8, coat_rough=0.01)
        self.splash_kind = sp
        # floor
        fl = s.get('floor', 'oak')
        fc = s.get('floorColour')
        if fl == 'oak':
            self.m_floor = M.textured('floor-oak-' + s['id'], 'kitchen-floor-oak-albedo.png', tint=M._tint_factor('kitchen-floor-oak-albedo.png', fc, ref_hex='#C79C6C'),
                                      rough_tex='kitchen-floor-boards-roughness.png', normal_tex='kitchen-floor-oak-normal.png')
        elif fl == 'darkwood':
            self.m_floor = M.textured('floor-smoked-' + s['id'], 'kitchen-floor-smoked-oak-albedo.png', tint=M._tint_factor('kitchen-floor-smoked-oak-albedo.png', fc, ref_hex='#5E4331'),
                                      rough_tex='kitchen-floor-boards-roughness.png', normal_tex='kitchen-floor-smoked-oak-normal.png')
        elif fl == 'herringbone':
            self.m_floor = M.textured('floor-herringbone-' + s['id'], 'kitchen-floor-herringbone-albedo.png',
                                      tint=M._tint_factor('kitchen-floor-herringbone-albedo.png', fc, ref_hex='#B98A5C'),
                                      rough=0.42, normal_tex='kitchen-floor-herringbone-normal.png', coat=0.15, coat_rough=0.25)
        elif fl == 'tiles':
            self.m_floor = M.textured('floor-porcelain-' + s['id'], 'kitchen-floor-porcelain-albedo.png',
                                      tint=M._tint_factor('kitchen-floor-porcelain-albedo.png', fc, ref_hex='#D3CFC8'),
                                      rough=0.22, normal_tex='kitchen-floor-porcelain-normal.png')
        elif fl == 'checker':
            self.m_floor = M.textured('floor-chequer', 'kitchen-floor-chequer-albedo.png', rough=0.18, normal_tex='kitchen-floor-chequer-normal.png', coat=0.2, coat_rough=0.05)
        else:
            self.m_floor = M.textured('floor-concrete-' + s['id'], 'kitchen-floor-concrete-albedo.png',
                                      tint=M._tint_factor('kitchen-floor-concrete-albedo.png', fc, ref_hex='#8F8C87'),
                                      rough_tex='kitchen-floor-concrete-roughness.png')

    @staticmethod
    def _wood_kind(name):
        n = name.lower()
        if 'walnut' in n:
            return 'walnut'
        if 'smoked' in n:
            return 'smoked'
        if 'oak' in n:
            return 'oak'
        return None

    def _unit_mat(self, hex_, name):
        k = self._wood_kind(name)
        if k:
            return self.M.wood(k, hex_, name='unit')
        return self.M.paint(hex_, 0.36, name='unit')

    def _shelf_mat(self, hex_):
        if luminance(hex_) < 0.04:
            return self.M.plain('shelf-black-steel', '#202022', rough=0.45, metallic=0.6)
        if abs(luminance(hex_) - luminance('#6B4A33')) < 0.01:
            return self.M.wood('walnut', hex_, name='shelf')
        return self.M.wood('oak', hex_, name='shelf')

    # ================================================================ layout
    def _layout(self):
        s = self.s
        self.range = s.get('cooker') == 'range'
        C = 1.0 if self.range else 0.9
        self.C = C
        self.upper = s.get('upper', 'none')
        self.has_tall = self.upper == 'units'
        left = [('door', 0.6, 'l'), ('sink', 1.0, None)]
        right = [('drawers', 0.6, None), ('door', 0.6, 'r')]
        right += [('tall', 0.6, None)] if self.has_tall else [('door', 0.4, 'r')]
        x = -C / 2 - sum(m[1] for m in left)
        self.XL = x
        mods = []
        for kind, w, hinge in left:
            mods.append((kind, x, x + w, hinge))
            x += w
        mods.append(('range' if self.range else 'hob', x, x + C, None))
        x += C
        for kind, w, hinge in right:
            mods.append((kind, x, x + w, hinge))
            x += w
        self.XR = x
        self.mods = mods
        self.base_x1 = self.XR - (0.6 if self.has_tall else 0)
        self.sink_x = -C / 2 - 0.5
        self.window = s.get('window')
        self.win = (self.sink_x - 0.53, self.sink_x + 0.37, self.wt_top + 0.2, 2.26) if self.window else None
        self.hood = s.get('hood', 'none')
        self.hood_w = C + 0.1 if self.hood == 'canopy' else 0.9
        self.wu_z0 = self.wt_top + 0.45
        self.wu_z1 = self.wu_z0 + WALL_UNIT_H
        self.hood_z = self.wt_top + 0.68
        self.island = s.get('island')
        self.room_w = self.XR - self.XL
        self.cx = (self.XL + self.XR) / 2

    # ================================================================ public
    def build(self):
        self.room()
        self.base_run()
        self.worktop_and_sink()
        self.splashback()
        if self.window:
            self.window_unit()
        self.upper_storage()
        self.hood_unit()
        if self.island:
            self.island_unit()
        elif self.s.get('rug'):
            self.rug()
        self.decor()
        self.light_rig()
        return self

    # ================================================================ room
    def room(self):
        g = self.g
        XL, XR = self.XL, self.XR
        # floor
        g.box('floor', XL - 0.3, XR + 0.3, ROOM_FRONT, 0.3, -0.05, 0.0, self.m_floor, grain='y', uv_offset=(0.37, 0.11))
        # back wall with a window opening
        wall = []
        if self.win:
            x0, x1, z0, z1 = self.win
            wall.append(g.box('wall-back-l', XL - 0.3, x0, 0, 0.25, 0, CEIL, self.m_wall, uv_offset=(0, 0)))
            wall.append(g.box('wall-back-r', x1, XR + 0.3, 0, 0.25, 0, CEIL, self.m_wall, uv_offset=(0, 0)))
            wall.append(g.box('wall-back-below', x0, x1, 0, 0.25, 0, z0, self.m_wall, uv_offset=(0, 0)))
            wall.append(g.box('wall-back-above', x0, x1, 0, 0.25, z1, CEIL, self.m_wall, uv_offset=(0, 0)))
        else:
            wall.append(g.box('wall-back', XL - 0.3, XR + 0.3, 0, 0.25, 0, CEIL, self.m_wall, uv_offset=(0, 0)))
        # side walls
        for nm, xa, xb in (('wall-left', XL - 0.3, XL), ('wall-right', XR, XR + 0.3)):
            o = g.box(nm, xa, xb, ROOM_FRONT, 0.25, 0, CEIL, self.m_wall, uv_offset=(0, 0))
            self.noexport.add(o.name)
        # ceiling with a flat rooflight over the island
        rl = (-1.0, 1.0, -3.15, -1.45)
        self.rooflight = rl
        cz0, cz1 = CEIL, CEIL + 0.3
        parts = [(XL - 0.3, XR + 0.3, ROOM_FRONT, rl[2]), (XL - 0.3, XR + 0.3, rl[3], 0.3),
                 (XL - 0.3, rl[0], rl[2], rl[3]), (rl[1], XR + 0.3, rl[2], rl[3])]
        for i, (a, b, c, d) in enumerate(parts):
            o = g.box(f'ceiling-{i}', a, b, c, d, cz0, cz1, self.m_ceiling)
            self.noexport.add(o.name)
        # sky seen through the rooflight and the window
        sky = self.M.plain('sky', (0.0, 0.0, 0.0), rough=1.0, emission=(0.82, 0.9, 1.0), emission_strength=2.5, spec=0.0)
        o = g.box('rooflight-sky', rl[0] - 0.2, rl[1] + 0.2, rl[2] - 0.2, rl[3] + 0.2, cz1 + 0.6, cz1 + 0.62, sky, shadow=False)
        self.noexport.add(o.name)
        o = g.box('rooflight-glass-frame', rl[0], rl[1], rl[2], rl[3], cz1 - 0.02, cz1, self.m_window_glass)
        self.noexport.add(o.name)
        if self.win:
            garden = self.M.emissive_image('view-garden', 'kitchen-view-garden.png', strength=2.2)
            x0, x1, z0, z1 = self.win
            cxw = (x0 + x1) / 2
            o = g.plane('garden-view', [(cxw + 4.5, 3.5, -1.6), (cxw - 4.5, 3.5, -1.6), (cxw - 4.5, 3.5, 5.2), (cxw + 4.5, 3.5, 5.2)],
                        garden, uv_offset=(0, 0), shadow=False)
            # UVs: map the whole image onto the plane
            uv = o.data.uv_layers[0].data
            for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
                uv[i].uv = c
            self.noexport.add(o.name)

    # ================================================================ doors and handles
    def door(self, x0, x1, z0, z1, yf, style, mat, kind, handle=True, depth=None, name='door'):
        """A door or drawer front facing -y with its front face at yf, inside the opening x0..x1, z0..z1."""
        g = self.g
        x0, x1, z0, z1 = x0 + GAP / 2, x1 - GAP / 2, z0 + GAP / 2, z1 - GAP / 2
        w, h = x1 - x0, z1 - z0
        objs = []
        off = (self.rng.random() * 5, self.rng.random() * 5)
        t = 0.02
        if style == 'shaker':
            fw = min(0.07, max(0.045, min(w, h) * 0.22))
            if h < 0.2:
                fw = min(fw, 0.05)
            yb = yf + 0.022
            objs.append(g.box(name + '-stile-l', x0, x0 + fw, yf, yb, z0, z1, mat, bevel=0.002, uv_offset=off))
            objs.append(g.box(name + '-stile-r', x1 - fw, x1, yf, yb, z0, z1, mat, bevel=0.002, uv_offset=off))
            objs.append(g.box(name + '-rail-t', x0 + fw, x1 - fw, yf, yb, z1 - fw, z1, mat, bevel=0.002, grain='x', uv_offset=off))
            objs.append(g.box(name + '-rail-b', x0 + fw, x1 - fw, yf, yb, z0, z0 + fw, mat, bevel=0.002, grain='x', uv_offset=off))
            # raised-and-fielded edge: a small chamfered bead, then the recessed panel
            objs.append(g.box(name + '-panel', x0 + fw, x1 - fw, yf + 0.008, yb - 0.004, z0 + fw, z1 - fw, mat, bevel=0.0015, uv_offset=off))
        elif style == 'fluted':
            objs.append(self.fluted_panel(name, x0, x1, z0, z1, yf, mat, off))
        else:
            objs.append(g.box(name, x0, x1, yf, yf + t, z0, z1, mat, bevel=0.0015, uv_offset=off))
        if handle:
            objs += self.handle(x0, x1, z0, z1, yf, kind)
        return objs

    def fluted_panel(self, name, x0, x1, z0, z1, yf, mat, off, pitch=0.028, depth=0.0045, land=0.005):
        """A slab with real concave flutes running full height (12 segments per flute)."""
        w = x1 - x0
        n = max(3, int(round((w - 0.02) / pitch)))
        p = (w - 0.02) / n
        prof = [(x0, 0.0), (x0 + 0.01, 0.0)]
        segs = 10
        for i in range(n):
            a = x0 + 0.01 + i * p + land / 2
            b = a + p - land
            for k in range(segs + 1):
                u = k / segs
                prof.append((a + (b - a) * u, depth * math.sin(math.pi * u)))
            prof.append((b + land / 2, 0.0))
        prof.append((x1, 0.0))
        # remove consecutive duplicates
        clean = [prof[0]]
        for q in prof[1:]:
            if abs(q[0] - clean[-1][0]) > 1e-6 or abs(q[1] - clean[-1][1]) > 1e-6:
                clean.append(q)
        prof = clean
        m = len(prof)
        yb = yf + 0.02
        verts = [(x, yf + d, z0) for x, d in prof] + [(x, yf + d, z1) for x, d in prof]
        verts += [(x1, yb, z0), (x0, yb, z0), (x1, yb, z1), (x0, yb, z1)]
        bi = 2 * m
        faces = []
        for i in range(m - 1):
            faces.append((i, i + 1, m + i + 1, m + i))
        # caps (bottom: z0, top: z1)
        faces.append(tuple(range(m)) + (bi, bi + 1))
        faces.append((bi + 3, bi + 2) + tuple(range(2 * m - 1, m - 1, -1)))
        faces.append((bi + 1, bi, bi + 2, bi + 3))  # back
        faces.append((m - 1, bi, bi + 2, 2 * m - 1))  # right side
        faces.append((bi + 1, 0, m, bi + 3))  # left side
        o = self.g.mesh(name + '-fluted', verts, faces, mat, smooth=True, sharp_deg=30, uv_offset=off)
        # fix the cap winding if needed by checking a normal
        me = o.data
        for poly in me.polygons:
            c = poly.center
            if poly.normal.z * (1 if c.z > (z0 + z1) / 2 else -1) < -0.5:
                poly.flip()
        me.update()
        return o

    def handle(self, x0, x1, z0, z1, yf, kind):
        """kind: door-l (hinged left, handle on the right), door-r, drawer, wall-l, wall-r, none."""
        if kind == 'none' or not self.m_handle:
            return []
        g = self.g
        shape = self.s.get('handleShape', 'bar')
        m = self.m_handle
        out = []
        w, h = x1 - x0, z1 - z0
        if kind == 'drawer':
            cx = (x0 + x1) / 2
            cz = z1 - min(0.06, h / 2) if h > 0.2 else (z0 + z1) / 2
            if self.s.get('doors') == 'shaker' and h > 0.2:
                cz = z1 - 0.035
            if shape == 'knob':
                out.append(self.knob(cx, yf, cz, m))
            elif shape == 'cup':
                out += self.cup(cx, yf, cz, m)
            else:
                out += self.bar(cx, yf, cz, min(0.32, w * 0.5), m, horizontal=True)
            return out
        hinge_left = kind in ('door-l', 'wall-l')
        hx = x1 - 0.045 if hinge_left else x0 + 0.045
        if kind.startswith('wall'):
            if shape == 'bar':
                out += self.bar(hx, yf, z0 + 0.13, 0.16, m)
            else:
                out.append(self.knob(hx, yf, z0 + 0.06, m))
            return out
        if shape == 'bar':
            ln = min(0.32, h * 0.45)
            out += self.bar(hx, yf, z1 - 0.06 - ln / 2, ln, m)
        else:
            out.append(self.knob(hx, yf, z1 - 0.06, m))
        return out

    def knob(self, x, yf, z, m):
        prof = [(0.012, 0.0), (0.012, 0.003), (0.0065, 0.006), (0.006, 0.016), (0.012, 0.019), (0.016, 0.024),
                (0.0165, 0.028), (0.014, 0.0315), (0.008, 0.0335), (0.0, 0.034)]
        return self.g.lathe('knob', prof, m, (x, yf, z), axis='-y', segs=20, cap_top=False)

    def bar(self, x, yf, z, length, m, horizontal=False):
        g = self.g
        r, stand = 0.0065, 0.032
        out = []
        if horizontal:
            out.append(g.cylinder('bar', (x - length / 2, yf - stand, z), r, length, m, axis='x', segs=16))
            for sx in (x - length / 2 + 0.02, x + length / 2 - 0.02):
                out.append(g.cylinder('bar-post', (sx, yf, z), 0.005, stand, m, axis='-y', segs=12))
        else:
            out.append(g.cylinder('bar', (x, yf - stand, z - length / 2), r, length, m, axis='z', segs=16))
            for sz in (z - length / 2 + 0.02, z + length / 2 - 0.02):
                out.append(g.cylinder('bar-post', (x, yf, sz), 0.005, stand, m, axis='-y', segs=12))
        return out

    def cup(self, x, yf, z, m, w=0.096):
        """A cup (bin) pull: a back plate and a hood that curves out and down."""
        g = self.g
        out = [g.box('cup-plate', x - w / 2 - 0.006, x + w / 2 + 0.006, yf - 0.003, yf, z - 0.006, z + 0.024, m, bevel=0.001)]
        r = 0.02
        segs = 12
        outer, inner = [], []
        for k in range(segs + 1):
            a = math.radians(90 - 160 * k / segs)
            outer.append((-(r) * math.cos(a) - 0.003, z + 0.005 + r * math.sin(a) - r * 0.0))
        # build a shell: outer arc and an inner arc 2 mm in
        verts, faces = [], []
        for sx in (x - w / 2, x + w / 2):
            for k in range(segs + 1):
                a = math.radians(90 - 160 * k / segs)
                for rr in (r, r - 0.002):
                    verts.append((sx, yf - 0.003 - rr * math.cos(a), z + 0.004 + rr * math.sin(a)))
        n = (segs + 1) * 2
        for k in range(segs):
            o0, o1 = k * 2, (k + 1) * 2
            faces.append((o0, o1, n + o1, n + o0))           # outer
            faces.append((o0 + 1, n + o0 + 1, n + o1 + 1, o1 + 1))  # inner
        faces.append((0, n, n + 1, 1))
        faces.append((segs * 2, segs * 2 + 1, n + segs * 2 + 1, n + segs * 2))
        # end caps between the arc and the plate
        for side, base in ((0, 0), (1, n)):
            for k in range(segs):
                a, b = base + k * 2, base + (k + 1) * 2
                faces.append((a, b, b + 1, a + 1) if side == 0 else (a, a + 1, b + 1, b))
        out.append(g.mesh('cup-hood', verts, faces, m, smooth=True, sharp_deg=50))
        caps = []
        for sx in (x - w / 2, x + w / 2):
            pts = [(sx, yf - 0.003, z + 0.004 + r)]
            for k in range(segs + 1):
                a = math.radians(90 - 160 * k / segs)
                pts.append((sx, yf - 0.003 - r * math.cos(a), z + 0.004 + r * math.sin(a)))
            pts.append((sx, yf - 0.003, pts[-1][2]))
            caps.append(pts)
        for i, pts in enumerate(caps):
            f = tuple(range(len(pts)))
            out.append(g.mesh('cup-end', pts, [f if i else f[::-1]], m))
        return out

    # ================================================================ base run
    def base_run(self):
        g, s = self.g, self.s
        st = s['doors']
        yf = -DEPTH
        handleless = not self.m_handle
        top_z = BASE_TOP - (0.035 if handleless else 0)
        for i, (kind, x0, x1, hinge) in enumerate(self.mods):
            if kind == 'range':
                self.range_cooker(x0, x1)
                continue
            # plinth and carcass
            g.box(f'plinth-{i}', x0, x1, -DEPTH + 0.06, -DEPTH + 0.078, 0.0, PLINTH, self.m_unit_dark)
            if kind == 'tall':
                self.tall_unit(x0, x1)
                continue
            g.box(f'carcass-{i}', x0, x1, -DEPTH + 0.02, 0, PLINTH, BASE_TOP, self.m_unit_dark)
            if handleless:
                g.box(f'jpull-{i}', x0, x1, -DEPTH + 0.045, -DEPTH + 0.05, top_z, BASE_TOP, self.M.metal('steel-dark'))
            if kind == 'door':
                self.door(x0, x1, PLINTH, top_z, yf, st, self.m_unit, 'door-l' if hinge == 'r' else 'door-r', name=f'door-{i}')
            elif kind == 'sink':
                zt = top_z
                if s.get('sink') == 'belfast':
                    zt = BASE_TOP - 0.26
                    sw = 0.76
                    xc = (x0 + x1) / 2
                    # fillers beside the apron
                    self.door(x0, xc - sw / 2 - 0.004, zt, BASE_TOP, yf, 'slab', self.m_unit, 'none', handle=False, name=f'filler-l-{i}')
                    self.door(xc + sw / 2 + 0.004, x1, zt, BASE_TOP, yf, 'slab', self.m_unit, 'none', handle=False, name=f'filler-r-{i}')
                xm = (x0 + x1) / 2
                self.door(x0, xm, PLINTH, zt, yf, st, self.m_unit, 'door-l', name=f'door-{i}a')
                self.door(xm, x1, PLINTH, zt, yf, st, self.m_unit, 'door-r', name=f'door-{i}b')
            elif kind in ('drawers', 'hob'):
                if handleless:
                    hs = [0.15, 0.28, 0.28]
                else:
                    hs = [0.16, 0.28, 0.28]
                tot = top_z - PLINTH
                sc = tot / sum(hs)
                z = top_z
                for k, hh in enumerate(hs):
                    z0 = z - hh * sc
                    zz1 = z
                    if handleless and k > 0:
                        zz1 = z - 0.03
                        g.box(f'jpull-{i}-{k}', x0, x1, -DEPTH + 0.045, -DEPTH + 0.05, z - 0.03, z, self.M.metal('steel-dark'))
                    self.door(x0, x1, z0, zz1, yf, st, self.m_unit, 'drawer', name=f'drawer-{i}-{k}')
                    z = z0
                if kind == 'hob':
                    xc = (x0 + x1) / 2
                    hob = self.M.textured('hob-induction', 'kitchen-hob-induction-albedo.png', rough=0.05, coat=1.0, coat_rough=0.02)
                    o = g.box('hob', xc - 0.39, xc + 0.39, -0.56, -0.04, self.wt_top, self.wt_top + 0.005, hob, bevel=0.002, uv_offset=(0, 0))
                    # map the hob texture once across the glass
                    uv = o.data.uv_layers[0].data
                    for poly in o.data.polygons:
                        for li in poly.loop_indices:
                            co = o.data.vertices[o.data.loops[li].vertex_index].co
                            uv[li].uv = ((co.x - (xc - 0.39)) / 0.78 * 0.88 + 0.06, (co.y + 0.56) / 0.52 * 0.88 + 0.06)
        # end panels where a run meets the room are not needed: the run is wall to wall

    def tall_unit(self, x0, x1):
        g, st = self.g, self.s['doors']
        yf = -DEPTH
        z1 = self.wu_z1
        g.box('tall-carcass', x0, x1, -DEPTH + 0.02, 0, PLINTH, z1, self.m_unit)
        if self.range:
            self.door(x0, x1, PLINTH, 1.2, yf, st, self.m_unit, 'door-r', name='larder-low')
            self.door(x0, x1, 1.2, z1, yf, st, self.m_unit, 'door-r', name='larder-high')
            return
        self.door(x0, x1, PLINTH, 0.58, yf, st, self.m_unit, 'drawer', name='tall-drawer')
        self.oven(x0 + 0.003, x1 - 0.003, 0.585, 1.175, yf)
        self.oven(x0 + 0.003, x1 - 0.003, 1.18, 1.625, yf, compact=True)
        self.door(x0, x1, 1.63, z1, yf, st, self.m_unit, 'wall-r' if self.s.get('handleShape') == 'bar' else 'door-r', name='tall-top')

    def oven(self, x0, x1, z0, z1, yf, compact=False):
        g = self.g
        g.box('oven-body', x0, x1, yf + 0.005, yf + 0.03, z0, z1, self.m_steel, bevel=0.001)
        g.box('oven-glass', x0 + 0.004, x1 - 0.004, yf - 0.004, yf + 0.005, z0 + 0.004, z1 - 0.09, self.m_glass_black, bevel=0.0015)
        g.box('oven-panel', x0 + 0.004, x1 - 0.004, yf - 0.002, yf + 0.005, z1 - 0.085, z1 - 0.004, self.m_glass_black, bevel=0.001)
        g.box('oven-display', (x0 + x1) / 2 - 0.05, (x0 + x1) / 2 + 0.05, yf - 0.0025, yf - 0.002, z1 - 0.055, z1 - 0.035,
              self.M.plain('oven-display', (0.0, 0.0, 0.0), rough=0.2, emission=(1.0, 0.55, 0.2), emission_strength=1.5))
        for k, xk in enumerate((x0 + 0.06, x1 - 0.06)):
            g.cylinder('oven-knob', (xk, yf - 0.002, z1 - 0.045), 0.016, 0.02, self.m_steel, axis='-y', segs=20)
        self.bar((x0 + x1) / 2, yf - 0.004, z1 - 0.12, (x1 - x0) * 0.8, self.m_steel, horizontal=True)

    def range_cooker(self, x0, x1):
        g, s = self.g, self.s
        rc = s.get('rangeColour', '#1E1E1F')
        enamel = self.M.plain('range-enamel-' + rc.lstrip('#'), rc, rough=0.22, coat=0.8, coat_rough=0.05)
        trim = self.m_chrome if self.metal_kind != 'brass' else self.M.metal('brass')
        x0 += 0.002
        x1 -= 0.002
        yf = -0.63
        top = BASE_TOP + 0.03
        g.box('range-plinth', x0 + 0.02, x1 - 0.02, yf + 0.04, -0.03, 0.0, 0.1, self.m_cast_iron)
        g.box('range-body', x0, x1, yf, -0.02, 0.1, top, enamel, bevel=0.003)
        # hob top: cast iron pan supports and burners
        g.box('range-top', x0 + 0.01, x1 - 0.01, yf + 0.02, -0.04, top, top + 0.006, self.m_cast_iron, bevel=0.002)
        burners = [(-0.3, -0.2), (-0.3, -0.45), (0.0, -0.32), (0.3, -0.2), (0.3, -0.45)]
        cxr = (x0 + x1) / 2
        for bx, by in burners:
            g.cylinder('burner', (cxr + bx, by, top + 0.006), 0.045, 0.012, self.m_cast_iron, segs=24)
            g.cylinder('burner-cap', (cxr + bx, by, top + 0.018), 0.03, 0.006, self.M.plain('burner-cap', '#2A2A2B', rough=0.35, metallic=0.5), segs=24)
        for k in range(3):
            gx0 = x0 + 0.015 + k * (x1 - x0 - 0.03) / 3
            gx1 = gx0 + (x1 - x0 - 0.03) / 3 - 0.006
            for yy in (yf + 0.03, -0.05):
                g.box('grate', gx0, gx1, yy, yy + 0.012, top + 0.006, top + 0.03, self.m_cast_iron)
            for xx in (gx0, gx1 - 0.012):
                g.box('grate', xx, xx + 0.012, yf + 0.03, -0.05, top + 0.006, top + 0.03, self.m_cast_iron)
            for j in range(3):
                xx = gx0 + (gx1 - gx0) * (j + 1) / 4
                g.box('grate', xx - 0.005, xx + 0.005, yf + 0.03, -0.05, top + 0.022, top + 0.03, self.m_cast_iron)
        # control panel and knobs
        g.box('range-fascia', x0 + 0.01, x1 - 0.01, yf - 0.004, yf, 0.775, 0.865, enamel, bevel=0.002)
        for k in range(7):
            kx = x0 + 0.08 + k * (x1 - x0 - 0.16) / 6
            self.g.lathe('range-knob', [(0.02, 0.0), (0.022, 0.006), (0.021, 0.022), (0.016, 0.03), (0.0, 0.031)], trim, (kx, yf - 0.004, 0.82), axis='-y', segs=24, cap_top=False)
        # towel rail
        g.cylinder('range-rail', (x0 + 0.03, yf - 0.045, 0.745), 0.008, x1 - x0 - 0.06, trim, axis='x', segs=16)
        for xx in (x0 + 0.05, x1 - 0.05):
            g.cylinder('range-rail-post', (xx, yf, 0.745), 0.006, 0.045, trim, axis='-y', segs=12)
        # two oven doors
        split = x0 + (x1 - x0) * 0.58
        for nm, a, b in (('range-oven-l', x0 + 0.02, split - 0.006), ('range-oven-r', split + 0.006, x1 - 0.02)):
            g.box(nm, a, b, yf - 0.012, yf, 0.14, 0.72, enamel, bevel=0.003)
            g.box(nm + '-window', a + 0.05, b - 0.05, yf - 0.0135, yf - 0.011, 0.3, 0.6, self.m_glass_black, bevel=0.002)
            for (u0, u1, v0, v1) in ((a + 0.04, b - 0.04, 0.6, 0.61), (a + 0.04, b - 0.04, 0.29, 0.3), (a + 0.04, a + 0.05, 0.29, 0.61), (b - 0.05, b - 0.04, 0.29, 0.61)):
                g.box(nm + '-trim', u0, u1, yf - 0.014, yf - 0.011, v0, v1, trim)
            self.bar((a + b) / 2, yf - 0.012, 0.675, (b - a) * 0.7, trim, horizontal=True)
        g.box('range-kick', x0 + 0.02, x1 - 0.02, yf - 0.006, yf, 0.1, 0.13, self.m_cast_iron)

    # ================================================================ worktop and sink
    def worktop_and_sink(self):
        g, s = self.g, self.s
        y0, y1 = -DEPTH - 0.02, 0.0
        z0, z1 = BASE_TOP, self.wt_top
        xa, xb = self.XL, self.base_x1
        off = (0.21, 0.6)
        kw = dict(grain='x', bevel=0.0015, uv_offset=off)
        xs = self.sink_x
        rx0, rx1 = -self.C / 2, self.C / 2
        belfast = s.get('sink') == 'belfast'
        cut = (xs - 0.385, xs + 0.385, y0, -0.1) if belfast else (xs - 0.36, xs + 0.36, -0.535, -0.115)
        # worktop pieces around the sink cut-out (the range cooker splits the top in two)
        segs = []
        if self.range:
            segs = [(xa, rx0), (rx1, xb)]
        else:
            segs = [(xa, xb)]
        for i, (a, b) in enumerate(segs):
            if a <= cut[0] and b >= cut[1]:
                g.box(f'worktop-{i}-l', a, cut[0], y0, y1, z0, z1, self.m_top, **kw)
                g.box(f'worktop-{i}-r', cut[1], b, y0, y1, z0, z1, self.m_top, **kw)
                g.box(f'worktop-{i}-back', cut[0], cut[1], cut[3], y1, z0, z1, self.m_top, **kw)
                if not belfast:
                    g.box(f'worktop-{i}-front', cut[0], cut[1], y0, cut[2], z0, z1, self.m_top, **kw)
            else:
                g.box(f'worktop-{i}', a, b, y0, y1, z0, z1, self.m_top, **kw)
        if belfast:
            self.belfast(xs)
        else:
            self.undermount(xs, cut)
        self.tap(xs, -0.075 if not belfast else -0.06)

    def undermount(self, xs, cut):
        g = self.g
        x0, x1, y0, y1 = cut
        zt = BASE_TOP
        zb = zt - 0.2
        m = self.m_steel
        th = 0.0015
        g.box('sink-bottom', x0, x1, y0, y1, zb, zb + th, m)
        g.box('sink-front', x0, x1, y0, y0 + th, zb, zt, m)
        g.box('sink-back', x0, x1, y1 - th, y1, zb, zt, m)
        g.box('sink-left', x0, x0 + th, y0, y1, zb, zt, m)
        g.box('sink-right', x1 - th, x1, y0, y1, zb, zt, m)
        g.cylinder('sink-waste', ((x0 + x1) / 2, (y0 + y1) / 2, zb + th), 0.045, 0.002, self.m_chrome, segs=24)

    def belfast(self, xs):
        g = self.g
        m = self.m_ceramic
        x0, x1 = xs - 0.38, xs + 0.38
        y0, y1 = -DEPTH - 0.025, -0.1
        zt, zb = BASE_TOP + 0.002, BASE_TOP - 0.255
        t = 0.03
        g.box('belfast-base', x0, x1, y0, y1, zb, zb + 0.04, m, bevel=0.006)
        g.box('belfast-front', x0, x1, y0, y0 + t, zb, zt, m, bevel=0.008)
        g.box('belfast-back', x0, x1, y1 - t, y1, zb, zt, m, bevel=0.006)
        g.box('belfast-left', x0, x0 + t, y0, y1, zb, zt, m, bevel=0.006)
        g.box('belfast-right', x1 - t, x1, y0, y1, zb, zt, m, bevel=0.006)
        g.cylinder('sink-waste', (xs, (y0 + y1) / 2, zb + 0.04), 0.045, 0.002, self.m_chrome, segs=24)

    def tap(self, x, y):
        g, m = self.g, self.m_tap
        z = self.wt_top
        g.cylinder('tap-base', (x, y, z), 0.028, 0.012, m, segs=28)
        g.cylinder('tap-body', (x, y, z + 0.012), 0.018, 0.2, m, segs=28)
        # gooseneck: up, over and down towards the bowl
        top = z + 0.36
        r = 0.115
        pts = [(x, y, z + 0.2)]
        for k in range(0, 25):
            a = math.pi * k / 24
            pts.append((x, y - r + r * math.cos(a), top + r * math.sin(a) * 0.95 - 0.0))
        pts.append((x, y - 2 * r, top - 0.09))
        g.tube('tap-neck', pts, 0.0115, m, segs=18)
        g.cylinder('tap-spout', (x, y - 2 * r, top - 0.105), 0.0135, 0.02, m, segs=18)
        # side lever
        g.cylinder('tap-lever-hub', (x + 0.017, y, z + 0.15), 0.011, 0.03, m, axis='x', segs=16)
        g.tube('tap-lever', [(x + 0.045, y, z + 0.15), (x + 0.05, y, z + 0.2)], 0.004, m, segs=10)

    # ================================================================ splashback
    def splashback(self):
        g = self.g
        s = self.s
        z0 = self.wt_top
        if self.upper == 'units':
            z1 = self.wu_z0
        elif self.upper == 'shelves':
            z1 = self.wt_top + 1.12
        else:
            z1 = self.wt_top + 0.6
        xa, xb = self.XL, self.base_x1
        if self.splash_kind == 'marble' or self.splash_kind == 'plain':
            t, kw = 0.02, dict(grain='x', bevel=0.001, uv_offset=(0.21, 0.35))
        else:
            # start tile courses on the worktop and centre a joint on the cooker
            t, kw = 0.008, dict(grain='z', uv_offset=(0.0, 0.0), uv_origin=(0.0, 0.0, z0))
        y0, y1 = -t, 0.0
        rects = [(xa, xb, z0, z1)]
        # behind the hood, tile up to the hood (or to the ceiling for a canopy)
        if self.hood != 'none':
            hz = self.hood_z if self.hood == 'chimney' else self.hood_z + 0.06
            if hz > z1:
                rects.append((-self.hood_w / 2 - 0.05, self.hood_w / 2 + 0.05, z1, hz))
        if self.win:
            wx0, wx1, wz0, wz1 = self.win
            out = []
            for (a, b, c, d) in rects:
                if b <= wx0 or a >= wx1 or d <= wz0:
                    out.append((a, b, c, d))
                    continue
                if a < wx0:
                    out.append((a, wx0, c, d))
                if b > wx1:
                    out.append((wx1, b, c, d))
                out.append((max(a, wx0), min(b, wx1), c, min(d, wz0)))
            rects = out
        for i, (a, b, c, d) in enumerate(rects):
            if b - a > 0.005 and d - c > 0.005:
                g.box(f'splash-{i}', a, b, y0, y1, c, d, self.m_splash, **kw)
        self.splash_top = z1

    # ================================================================ window
    def window_unit(self):
        g = self.g
        x0, x1, z0, z1 = self.win
        crit = self.window == 'crittall'
        fm = self.M.plain('crittall-steel', '#18181A', rough=0.38, metallic=0.5) if crit else self.m_white_paint
        yv = 0.07
        d = 0.045 if crit else 0.065
        f = 0.035 if crit else 0.065
        kw = dict(bevel=0.002)
        # sill board
        g.box('window-sill', x0 - 0.04, x1 + 0.04, -0.03, yv, z0 - 0.025, z0, self.m_top, grain='x', bevel=0.0015)
        # outer frame
        g.box('window-frame-l', x0, x0 + f, yv, yv + d, z0, z1, fm, **kw)
        g.box('window-frame-r', x1 - f, x1, yv, yv + d, z0, z1, fm, **kw)
        g.box('window-frame-t', x0, x1, yv, yv + d, z1 - f, z1, fm, **kw)
        g.box('window-frame-b', x0, x1, yv, yv + d, z0, z0 + f, fm, **kw)
        xm = (x0 + x1) / 2
        if crit:
            bw = 0.022
            g.box('window-mullion', xm - bw / 2, xm + bw / 2, yv + 0.005, yv + d - 0.005, z0, z1, fm, **kw)
            for zz in (z0 + (z1 - z0) / 3, z0 + 2 * (z1 - z0) / 3):
                g.box('window-bar', x0, x1, yv + 0.005, yv + d - 0.005, zz - bw / 2, zz + bw / 2, fm, **kw)
        else:
            g.box('window-mullion', xm - 0.03, xm + 0.03, yv, yv + d, z0, z1, fm, **kw)
            zt = z1 - 0.34
            g.box('window-transom', x0, x1, yv, yv + d, zt - 0.03, zt + 0.03, fm, **kw)
            # opening casement frames, slightly proud
            for a, b in ((x0 + f, xm - 0.03), (xm + 0.03, x1 - f)):
                for (u0, u1, v0, v1) in ((a, a + 0.045, z0 + f, zt - 0.03), (b - 0.045, b, z0 + f, zt - 0.03),
                                         (a, b, z0 + f, z0 + f + 0.045), (a, b, zt - 0.075, zt - 0.03)):
                    g.box('window-casement', u0, u1, yv - 0.012, yv + d - 0.02, v0, v1, fm, **kw)
        g.box('window-glass', x0, x1, yv + d / 2 - 0.002, yv + d / 2 + 0.002, z0, z1, self.m_window_glass)

    # ================================================================ wall units, shelves
    def upper_spans(self):
        xa, xb = self.XL, self.base_x1
        cuts = []
        if self.win:
            cuts.append((self.win[0] - 0.08, self.win[1] + 0.08))
        if self.hood != 'none':
            cuts.append((-self.hood_w / 2 - 0.06, self.hood_w / 2 + 0.06))
        spans = [(xa, xb)]
        for c0, c1 in cuts:
            nxt = []
            for a, b in spans:
                if c1 <= a or c0 >= b:
                    nxt.append((a, b))
                    continue
                if c0 > a:
                    nxt.append((a, c0))
                if c1 < b:
                    nxt.append((c1, b))
            spans = nxt
        return [(a, b) for a, b in spans if b - a > 0.28]

    def upper_storage(self):
        if self.upper == 'units':
            for i, (a, b) in enumerate(self.upper_spans()):
                self.wall_units(a, b, i)
        elif self.upper == 'shelves':
            for i, (a, b) in enumerate(self.upper_spans()):
                self.shelves(a, b, i)

    def wall_units(self, a, b, idx):
        g = self.g
        st = 'slab' if self.s['doors'] == 'fluted' else self.s['doors']
        z0, z1 = self.wu_z0, self.wu_z1
        yf = -WALL_DEPTH
        g.box(f'wall-carcass-{idx}', a, b, yf + 0.02, 0, z0, z1, self.m_unit_dark)
        # finished underside and ends
        g.box(f'wall-underside-{idx}', a, b, yf + 0.02, 0, z0, z0 + 0.016, self.m_upper, bevel=0.001)
        n = max(1, int(round((b - a) / 0.5)))
        w = (b - a) / n
        handleless = not self.m_handle
        for k in range(n):
            x0 = a + k * w
            kind = 'wall-l' if k % 2 == 0 else 'wall-r'
            if n == 1:
                kind = 'wall-r' if a > 0 else 'wall-l'
            zd0 = z0 - (0.02 if handleless else 0)
            self.door(x0, x0 + w, zd0, z1, yf, st, self.m_upper, kind, name=f'wall-door-{idx}-{k}')
        if self.s.get('led') or True:
            led = self.M.plain('led-strip', (0, 0, 0), rough=0.5, emission=kelvin(3000), emission_strength=12.0)
            g.box(f'led-{idx}', a + 0.02, b - 0.02, yf + 0.04, yf + 0.055, z0 - 0.003, z0, led, shadow=False)
            self.area_light(f'led-light-{idx}', ((a + b) / 2, yf + 0.06, z0 - 0.006), (b - a - 0.04, 0.02),
                            power=11.0 * (b - a), temp=3000, rot=(0, 0, 0))

    def shelves(self, a, b, idx):
        g = self.g
        m = self._shelf_mat(self.s.get('shelf', '#B9895A'))
        ys = [self.wt_top + 0.55, self.wt_top + 1.0]
        depth, t = 0.24, 0.045
        for k, z in enumerate(ys):
            g.box(f'shelf-{idx}-{k}', a + 0.04, b - 0.04, -depth, -0.0, z, z + t, m, grain='x', bevel=0.002)
            if self.s.get('shelfBrackets'):
                for x in (a + 0.18, b - 0.18):
                    g.box('shelf-bracket', x - 0.008, x + 0.008, -depth + 0.02, 0, z - 0.012, z, self.m_black)
                    g.box('shelf-bracket-down', x - 0.008, x + 0.008, -0.012, 0, z - 0.16, z, self.m_black)
            self.shelf_props(a + 0.1, b - 0.1, z + t, -depth / 2, k, idx)
            if self.s.get('led'):
                led = self.M.plain('led-strip', (0, 0, 0), rough=0.5, emission=kelvin(3000), emission_strength=12.0)
                g.box(f'shelf-led-{idx}-{k}', a + 0.06, b - 0.06, -depth + 0.03, -depth + 0.045, z - 0.003, z, led, shadow=False)

    # ================================================================ hood
    def hood_unit(self):
        g = self.g
        if self.hood == 'none':
            return
        zb = self.hood_z
        W = self.hood_w
        if self.hood == 'canopy':
            hc = self.s.get('hoodColour') or self.s['unit']
            m = self.M.plain('hood-plaster-' + hc.lstrip('#'), hc, rough=0.75, spec=0.3) if self.s.get('hoodColour') else self._unit_mat(hc, self.s.get('unitName', ''))
            g.box('hood-mantel', -W / 2, W / 2, -0.56, 0, zb, zb + 0.13, m, bevel=0.003, grain='x')
            g.box('hood-mantel-lip', -W / 2 - 0.015, W / 2 + 0.015, -0.575, 0, zb + 0.13, zb + 0.155, m, bevel=0.003, grain='x')
            g.frustum('hood-canopy', (-W / 2 + 0.02, W / 2 - 0.02, -0.55, 0, zb + 0.155), (-0.26, 0.26, -0.34, 0, zb + 0.66), m, bevel=0.002)
            g.box('hood-chimney', -0.26, 0.26, -0.34, 0, zb + 0.66, CEIL, m, bevel=0.002)
            g.box('hood-insert', -W / 2 + 0.03, W / 2 - 0.03, -0.53, -0.02, zb + 0.005, zb + 0.02, self.M.metal('steel-dark'))
        else:
            mk = self.s.get('hoodMetal', 'black')
            m = self.M.metal(mk) if mk != 'black' else self.M.plain('hood-black', '#1B1B1C', rough=0.5, metallic=0.3)
            g.box('hood-plate', -W / 2, W / 2, -0.5, 0, zb, zb + 0.05, m, bevel=0.002)
            g.frustum('hood-taper', (-W / 2, W / 2, -0.5, 0, zb + 0.05), (-0.15, 0.15, -0.28, 0, zb + 0.32), m, bevel=0.002)
            g.box('hood-chimney', -0.15, 0.15, -0.28, 0, zb + 0.32, CEIL, m, bevel=0.002)
            g.box('hood-filter', -W / 2 + 0.03, W / 2 - 0.03, -0.47, -0.03, zb - 0.002, zb, self.M.metal('steel-dark'))
        # two lamps under the hood
        lamp = self.M.plain('hood-lamp', (0, 0, 0), emission=kelvin(3000), emission_strength=25.0)
        for x in (-W / 4, W / 4):
            g.cylinder('hood-lamp', (x, -0.3, zb - 0.003), 0.02, 0.003, lamp, segs=16, shadow=False)
            self.spot_light('hood-spot', (x, -0.3, zb - 0.01), power=5.0, temp=3000, size=0.03, angle=110)

    # ================================================================ island
    def island_unit(self):
        g, isl = self.g, self.island
        L = 2.4
        yb, yfr = -1.72, -2.3          # carcass: back (working side) and the seating side
        y_top0, y_top1 = yfr - 0.32, yb + 0.04
        self.island_y = (y_top0 + y_top1) / 2
        col = isl.get('colour', self.s['unit'])
        m = self._unit_mat(col, self.s.get('unitName', '') if col == self.s['unit'] else '')
        mdark = self.M.paint(shade_hex(col, -0.4), 0.6, name='carcass') if not self._wood_kind(self.s.get('unitName', '')) or col != self.s['unit'] else self.m_unit_dark
        st = isl.get('doors', 'shaker')
        top_kind = isl.get('top', self.s['top'])
        mt = self.M.top(top_kind)
        wt = 0.04 if top_kind in ('oak', 'concrete') else 0.03
        waterfall = isl.get('waterfall')
        if waterfall:
            wt = 0.04
        ztop = BASE_TOP + wt
        self.island_top = ztop
        g.box('island-carcass', -L / 2, L / 2, yfr, yb, PLINTH, BASE_TOP, mdark)
        g.box('island-plinth', -L / 2 + 0.05, L / 2 - 0.05, yfr + 0.06, yb - 0.06, 0, PLINTH, mdark)
        # seating side: door-style panels, no handles
        n = 4
        w = L / n
        for k in range(n):
            self.door(-L / 2 + k * w, -L / 2 + (k + 1) * w, PLINTH, BASE_TOP, yfr - 0.02, st, m, 'none', handle=False, name=f'island-panel-{k}')
        # working side: drawers and doors facing the run, built facing -y then turned round
        objs = []
        handleless = not self.m_handle
        for k in range(n):
            x0 = -L / 2 + k * w
            if k in (1, 2):
                hs = [0.16, 0.28, 0.28]
                sc = (BASE_TOP - PLINTH) / sum(hs)
                z = BASE_TOP - (0.035 if handleless else 0)
                for j, hh in enumerate(hs):
                    objs += self.door(x0, x0 + w, z - hh * sc, z, yfr - 0.02, st, m, 'drawer', name=f'island-drawer-{k}-{j}')
                    z -= hh * sc
            else:
                objs += self.door(x0, x0 + w, PLINTH, BASE_TOP - (0.035 if handleless else 0), yfr - 0.02, st, m, 'door-r' if k == 0 else 'door-l', name=f'island-door-{k}')
        rot = rot_about((0, (yfr + yb) / 2, 0), math.pi, 'Z')
        for o in objs:
            transform(o, rot)
        # top and ends
        kw = dict(grain='x', bevel=0.0015, uv_offset=(0.71, 0.13))
        if waterfall:
            g.box('island-top', -L / 2 - wt, L / 2 + wt, y_top0, y_top1, BASE_TOP, ztop, mt, **kw)
            for sx in (-1, 1):
                xa = sx * (L / 2)
                g.box('island-waterfall', xa, xa + sx * wt, y_top0, y_top1, 0.0, BASE_TOP, mt, grain='z', bevel=0.0015, uv_offset=(0.71, 0.13))
        else:
            g.box('island-top', -L / 2 - 0.03, L / 2 + 0.03, y_top0, y_top1, BASE_TOP, ztop, mt, **kw)
            for sx in (-1, 1):
                xa = sx * (L / 2)
                g.box('island-end', xa, xa + sx * 0.022, yfr - 0.022, yb + 0.022, 0.0, BASE_TOP, m, bevel=0.002)
            # overhang support legs are hidden; the overhang is 320 mm
        # stools
        for x in (-0.75, 0.0, 0.75):
            self.stool(x, y_top0 + 0.1, isl.get('stools', 'oak'))
        # bowl of lemons
        self.fruit_bowl(0.55, self.island_y + 0.05, ztop)
        self.pendants(self.island_y, ztop)

    def stool(self, x, y, finish):
        g = self.g
        seat_z = 0.66
        if finish == 'oak':
            frame = self.M.wood('oak', '#B88857', name='stool')
            seat = frame
        elif finish == 'brass':
            frame = self.M.metal('brass')
            seat = self.M.textured('stool-boucle-charcoal', 'kitchen-fabric-boucle-albedo.png',
                                   tint=self.M._tint_factor('kitchen-fabric-boucle-albedo.png', '#3A3A3D', absolute=True), rough=0.95, sheen=0.6)
        else:
            frame = self.M.plain('stool-black', '#1C1C1D', rough=0.45, metallic=0.4)
            seat = self.M.textured('stool-leather-black', 'kitchen-fabric-boucle-albedo.png',
                                   tint=self.M._tint_factor('kitchen-fabric-boucle-albedo.png', '#202022', absolute=True), rough=0.55)
        sw, sd = 0.42, 0.38
        # seat (rounded slab) and legs; the backrest faces the camera (stools face the island)
        g.box('stool-seat', x - sw / 2, x + sw / 2, y - sd / 2, y + sd / 2, seat_z - 0.045, seat_z, seat, bevel=0.012, bevel_segments=3)
        r_leg = 0.014 if finish == 'oak' else 0.01
        legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        for lx, ly in legs:
            top = (x + lx * (sw / 2 - 0.04), y + ly * (sd / 2 - 0.04), seat_z - 0.045)
            bot = (x + lx * (sw / 2 + 0.01), y + ly * (sd / 2 + 0.01), 0.0)
            g.tube('stool-leg', [bot, top], r_leg, frame, segs=12)
        # footrest and stretchers
        zf = 0.24
        def at(lx, ly, z):
            f = (seat_z - 0.045 - z) / (seat_z - 0.045)
            return (x + lx * (sw / 2 - 0.04 + 0.05 * f), y + ly * (sd / 2 - 0.04 + 0.05 * f), z)
        for (a, b) in ((legs[0], legs[1]), (legs[1], legs[2]), (legs[2], legs[3]), (legs[3], legs[0])):
            g.tube('stool-rung', [at(a[0], a[1], zf), at(b[0], b[1], zf)], r_leg * 0.75, frame, segs=10)
        # low backrest on the camera side
        yb = y - sd / 2 + 0.03
        for lx in (-1, 1):
            g.tube('stool-back-post', [(x + lx * (sw / 2 - 0.04), yb, seat_z - 0.01), (x + lx * (sw / 2 - 0.05), yb - 0.03, seat_z + 0.24)], r_leg * 0.85, frame, segs=10)
        g.box('stool-back', x - sw / 2 + 0.02, x + sw / 2 - 0.02, yb - 0.05, yb - 0.025, seat_z + 0.17, seat_z + 0.26, frame if finish != 'brass' else seat, bevel=0.008, bevel_segments=2, grain='x')

    def fruit_bowl(self, x, y, z):
        g = self.g
        m = self.M.metal('brass') if (self.s.get('pendantMetal', 'brass') == 'brass') else self.m_ceramic
        prof = [(0.0, 0.0), (0.06, 0.0), (0.11, 0.03), (0.15, 0.075), (0.145, 0.078), (0.105, 0.036), (0.055, 0.008), (0.0, 0.008)]
        g.lathe('bowl', prof, m, (x, y, z), segs=40, cap_top=False, cap_bottom=False)
        lemon = self.M.plain('lemon', '#E2B93B', rough=0.42, coat=0.3, coat_rough=0.2)
        for (dx, dy, dz, rot) in ((-0.04, 0.02, 0.045, 0.3), (0.045, -0.01, 0.047, 1.2), (0.0, -0.05, 0.046, 2.1), (0.01, 0.045, 0.09, 0.7)):
            o = g.sphere('lemon', (0, 0, 0), 0.034, lemon, segs=16, rings=10, scale=(1.25, 1.0, 1.0))
            transform(o, Matrix.Translation((x + dx, y + dy, z + dz)) @ Matrix.Rotation(rot, 4, 'Z'))

    def pendants(self, yc, ztop):
        g, kind = self.g, self.s.get('pendants', 'globe')
        mk = self.s.get('pendantMetal', 'brass')
        metal = self.M.metal(mk) if mk != 'black' else self.M.plain('pendant-black', '#19191A', rough=0.45, metallic=0.3)
        cord = self.M.plain('cord', '#121212', rough=0.6)
        warm = kelvin(2700)
        if kind == 'globe':
            opal = self.M.plain('opal-glass', '#FFFFFF', rough=0.3, emission=warm, emission_strength=4.0, spec=0.6)
            for x in (-0.8, 0.0, 0.8):
                zc = ztop + 0.85
                g.cylinder('pendant-rose', (x, yc, CEIL - 0.025), 0.055, 0.025, metal, segs=24)
                g.tube('pendant-cord', [(x, yc, CEIL - 0.025), (x, yc, zc + 0.19)], 0.003, cord, segs=8)
                g.lathe('pendant-cap', [(0.0, 0.06), (0.022, 0.06), (0.028, 0.03), (0.04, 0.0)], metal, (x, yc, zc + 0.13), segs=24, cap_top=False, cap_bottom=False)
                g.sphere('pendant-globe', (x, yc, zc), 0.14, opal, segs=32, rings=16, shadow=False)
                self.point_light('pendant-light', (x, yc, zc), power=22.0, temp=2700, radius=0.1)
        elif kind == 'dome':
            inner = self.M.plain('dome-inner', '#F4F2EE', rough=0.6, emission=warm, emission_strength=0.6)
            bulb = self.M.plain('bulb', '#FFFFFF', rough=0.2, emission=warm, emission_strength=40.0)
            for x in (-0.62, 0.62):
                zc = ztop + 0.82
                g.cylinder('pendant-rose', (x, yc, CEIL - 0.025), 0.055, 0.025, metal, segs=24)
                g.tube('pendant-cord', [(x, yc, CEIL - 0.025), (x, yc, zc + 0.2)], 0.003, cord, segs=8)
                prof_o = [(0.21, 0.0)] + [(0.21 * math.cos(a), 0.2 * math.sin(a)) for a in [math.radians(v) for v in range(6, 91, 6)]]
                prof_o[-1] = (0.0, 0.2)
                prof_o = [(0.016, 0.205)] + prof_o[::-1][1:]
                g.lathe('pendant-dome', [(r, h) for r, h in prof_o][::-1], metal, (x, yc, zc), segs=40, cap_top=False, cap_bottom=False)
                prof_i = [(0.205 * math.cos(a), 0.195 * math.sin(a)) for a in [math.radians(v) for v in range(0, 91, 6)]]
                prof_i[-1] = (0.0, 0.195)
                o = g.lathe('pendant-dome-inner', prof_i, inner, (x, yc, zc), segs=40, cap_top=False, cap_bottom=False)
                o.data.flip_normals()
                g.box('pendant-dome-rim', x - 0.001, x + 0.001, yc - 0.001, yc + 0.001, zc, zc + 0.001, metal)
                g.sphere('pendant-bulb', (x, yc, zc + 0.07), 0.04, bulb, segs=16, rings=8, shadow=False)
                self.spot_light('pendant-spot', (x, yc, zc + 0.06), power=55.0, temp=2700, size=0.08, angle=150)
        else:
            strip = self.M.plain('linear-diffuser', '#FFFFFF', rough=0.3, emission=warm, emission_strength=10.0)
            zc = ztop + 0.85
            for x in (-0.65, 0.65):
                g.tube('pendant-wire', [(x, yc, CEIL), (x, yc, zc + 0.04)], 0.0015, cord, segs=6)
            g.box('pendant-linear', -0.8, 0.8, yc - 0.03, yc + 0.03, zc, zc + 0.045, metal, bevel=0.004, grain='x')
            g.box('pendant-linear-diffuser', -0.78, 0.78, yc - 0.02, yc + 0.02, zc - 0.002, zc + 0.001, strip, shadow=False)
            self.area_light('pendant-linear-light', (0, yc, zc - 0.006), (1.56, 0.04), power=55.0, temp=2700)

    # ================================================================ props
    def rug(self):
        g = self.g
        m = self.M.textured('rug-' + self.s['id'], 'kitchen-fabric-rug-albedo.png',
                            tint=self.M._tint_factor('kitchen-fabric-rug-albedo.png', self.s['rug'], absolute=True), rough=0.95, sheen=0.5)
        o = g.box('rug', -0.85, 0.85, -3.6, -1.0, 0.0, 0.008, m, bevel=0.003, uv_offset=(0, 0))
        uv = o.data.uv_layers[0].data
        for poly in o.data.polygons:
            for li in poly.loop_indices:
                co = o.data.vertices[o.data.loops[li].vertex_index].co
                uv[li].uv = ((co.x + 0.85) / 1.7, (co.y + 3.6) / 2.6)

    def plant(self, x, y, z, scale=1.0, pot_hex='#C9BBA7'):
        g, rng = self.g, self.rng
        pot = self.M.plain('pot-' + pot_hex.lstrip('#'), pot_hex, rough=0.7)
        s = scale
        g.lathe('plant-pot', [(0.0, 0.0), (0.065 * s, 0.0), (0.08 * s, 0.13 * s), (0.084 * s, 0.14 * s), (0.077 * s, 0.14 * s), (0.0, 0.135 * s)], pot, (x, y, z), segs=32)
        leafm = self.M.plain('leaf', '#4F6B3F', rough=0.45, spec=0.5, sheen=0.3)
        verts, faces = [], []
        for k in range(46):
            a = rng.random() * 2 * math.pi
            tilt = math.radians(rng.uniform(15, 70))
            ln = rng.uniform(0.07, 0.12) * s
            wd = ln * 0.32
            base = Vector((x + math.cos(a) * 0.02 * s, y + math.sin(a) * 0.02 * s, z + 0.13 * s + rng.uniform(0.0, 0.18) * s))
            d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
            side = Vector((-math.sin(a), math.cos(a), 0)) * wd / 2
            up = d.cross(side).normalized() * wd * 0.15
            tip = base + d * ln
            mid = base + d * ln * 0.45
            i = len(verts)
            verts += [tuple(base), tuple(mid + side), tuple(tip - up), tuple(mid - side), tuple(mid + up)]
            faces += [(i, i + 1, i + 4), (i + 1, i + 2, i + 4), (i + 2, i + 3, i + 4), (i + 3, i, i + 4)]
            # stem
        g.mesh('plant-leaves', verts, faces, leafm, smooth=True, sharp_deg=80)

    def vase_with_stems(self, x, y, z):
        g, rng = self.g, self.rng
        m = self.M.plain('vase-stone', '#E4DCCD', rough=0.55)
        g.lathe('vase', [(0.0, 0.0), (0.05, 0.0), (0.075, 0.08), (0.07, 0.16), (0.04, 0.22), (0.032, 0.25), (0.036, 0.26), (0.0, 0.26)], m, (x, y, z), segs=32)
        stem = self.M.plain('dried-stem', '#8C7A57', rough=0.8)
        head = self.M.plain('dried-head', '#D9C9A5', rough=0.9)
        for k in range(7):
            a = rng.random() * 2 * math.pi
            lean = rng.uniform(0.05, 0.35)
            hgt = rng.uniform(0.3, 0.48)
            top = (x + math.cos(a) * lean * hgt, y + math.sin(a) * lean * hgt * 0.5, z + 0.2 + hgt)
            mid = (x + math.cos(a) * lean * hgt * 0.4, y + math.sin(a) * lean * hgt * 0.2, z + 0.2 + hgt * 0.5)
            g.tube('stem', [(x, y, z + 0.2), mid, top], 0.0018, stem, segs=6)
            for j in range(3):
                g.sphere('stem-head', (top[0] + rng.uniform(-0.02, 0.02), top[1] + rng.uniform(-0.02, 0.02), top[2] + rng.uniform(-0.02, 0.01)),
                         rng.uniform(0.008, 0.016), head, segs=8, rings=5)

    def boards(self, x, z):
        g = self.g
        a = self.M.wood('oak', '#B98A57', name='board')
        b = self.M.wood('walnut', '#7A5640', name='board')
        o = g.rounded_rect_slab('board-1', x, z + 0.24, 0.3, 0.46, 0.06, -0.035, -0.015, a, bevel=0.004)
        transform(o, rot_about((x, -0.015, z), math.radians(-8), 'X'))
        o = g.rounded_rect_slab('board-2', x + 0.2, z + 0.17, 0.24, 0.32, 0.05, -0.06, -0.04, b, bevel=0.004)
        transform(o, rot_about((x + 0.2, -0.04, z), math.radians(-10), 'X'))

    def jars(self, x, y, z):
        g = self.g
        body = self.M.plain('jar-ceramic', '#EFEAE0', rough=0.35, coat=0.4)
        lid = self.M.wood('oak', '#A57B50', name='lid')
        for k, (dx, h, r) in enumerate(((0.0, 0.2, 0.06), (0.14, 0.15, 0.055), (0.26, 0.11, 0.05))):
            g.lathe('jar', [(0.0, 0.0), (r, 0.0), (r, h), (0.0, h)], body, (x + dx, y, z), segs=28)
            g.lathe('jar-lid', [(0.0, 0.0), (r + 0.002, 0.0), (r + 0.002, 0.025), (0.0, 0.025)], lid, (x + dx, y, z + h), segs=28)

    def shelf_props(self, a, b, z, y, row, idx):
        g, rng = self.g, self.rng
        cream = self.M.plain('ceramic-cream', '#EEE9DF', rough=0.3, coat=0.4)
        stone = self.M.plain('ceramic-stone', '#CFC5B5', rough=0.5)
        dark = self.M.plain('ceramic-dark', '#3E3B38', rough=0.4, coat=0.3)
        glass = self.M.plain('glass-jar', (0.85, 0.87, 0.86), rough=0.05, alpha=0.35, spec=0.8)
        x = a
        items = ['plates', 'bowls', 'jug', 'books', 'plant', 'jars', 'vase'] if row == 0 else ['books', 'jars', 'plates', 'plant', 'jug', 'bowls']
        rng.shuffle(items)
        while x < b - 0.12 and items:
            it = items.pop()
            if it == 'plates':
                for k in range(6):
                    g.lathe('plate', [(0.0, 0.0), (0.1, 0.0), (0.13, 0.016), (0.0, 0.016)], cream, (x + 0.13, y, z + k * 0.017), segs=32, cap_top=True)
                x += 0.3
            elif it == 'bowls':
                for k in range(3):
                    g.lathe('bowl-stack', [(0.0, 0.0), (0.045, 0.0), (0.08, 0.05), (0.075, 0.052), (0.0, 0.01)], stone, (x + 0.09, y, z + k * 0.03), segs=28, cap_top=False)
                x += 0.21
            elif it == 'jug':
                g.lathe('jug', [(0.0, 0.0), (0.05, 0.0), (0.06, 0.08), (0.045, 0.16), (0.05, 0.19), (0.0, 0.19)], dark if rng.random() < 0.5 else cream, (x + 0.07, y, z), segs=28)
                x += 0.17
            elif it == 'books':
                cols = ['#3D4A3F', '#C9B79A', '#7B4B3A', '#2E3440', '#D8D2C4']
                for k in range(rng.randint(4, 6)):
                    h = rng.uniform(0.2, 0.26)
                    t = rng.uniform(0.025, 0.04)
                    bm = self.M.plain('book-' + cols[k % len(cols)].lstrip('#'), cols[k % len(cols)], rough=0.7)
                    g.box('book', x, x + t, y - 0.08, y + 0.08, z, z + h, bm, bevel=0.002)
                    x += t + 0.002
                x += 0.06
            elif it == 'plant':
                self.plant(x + 0.09, y, z, scale=0.75, pot_hex='#B9775A' if rng.random() < 0.5 else '#E2DCD2')
                x += 0.22
            elif it == 'jars':
                for k in range(3):
                    g.lathe('glass-jar', [(0.0, 0.0), (0.04, 0.0), (0.04, 0.14), (0.0, 0.14)], glass, (x + 0.05 + k * 0.09, y, z), segs=24)
                    g.lathe('glass-jar-lid', [(0.0, 0.0), (0.042, 0.0), (0.042, 0.02), (0.0, 0.02)], self.M.wood('oak', '#A57B50', name='lid'), (x + 0.05 + k * 0.09, y, z + 0.14), segs=24)
                x += 0.3
            elif it == 'vase':
                g.lathe('vase-small', [(0.0, 0.0), (0.04, 0.0), (0.06, 0.07), (0.03, 0.15), (0.032, 0.17), (0.0, 0.17)], stone, (x + 0.06, y, z), segs=28)
                x += 0.16
            x += rng.uniform(0.04, 0.12)

    def decor(self):
        items = self.s.get('decor') or []
        right_x = self.C / 2 + 0.3
        for it in items:
            if it == 'plant':
                self.plant(self.XL + 0.3, -0.25, self.wt_top, scale=1.25)
            elif it == 'board':
                self.boards(self.C / 2 + 0.72, self.wt_top)
            elif it == 'vase':
                self.vase_with_stems(right_x, -0.2, self.wt_top)
                right_x += 0.25
            elif it == 'jars':
                self.jars(right_x, -0.18, self.wt_top)
                right_x += 0.4

    # ================================================================ lights
    def _light(self, name, ltype, loc, power, temp, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(name, ltype)
        ld.energy = power
        ld.color = kelvin(temp)
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = rot
        self.col.objects.link(o)
        self.lights.append(o)
        return o

    def area_light(self, name, loc, size, power, temp, rot=(0, 0, 0), spread=180):
        o = self._light(name, 'AREA', loc, power, temp, rot)
        ld = o.data
        ld.shape = 'RECTANGLE'
        ld.size, ld.size_y = size
        try:
            ld.spread = math.radians(spread)
        except Exception:
            pass
        return o

    def point_light(self, name, loc, power, temp, radius=0.05):
        o = self._light(name, 'POINT', loc, power, temp)
        o.data.shadow_soft_size = radius
        return o

    def spot_light(self, name, loc, power, temp, size=0.05, angle=60):
        o = self._light(name, 'SPOT', loc, power, temp)
        o.data.shadow_soft_size = size
        o.data.spot_size = math.radians(angle)
        o.data.spot_blend = 0.6
        return o

    def light_rig(self):
        # daylight through the window
        if self.win:
            x0, x1, z0, z1 = self.win
            self.area_light('window-daylight', ((x0 + x1) / 2, 0.45, (z0 + z1) / 2), (x1 - x0, z1 - z0), power=900.0, temp=6200,
                            rot=(math.radians(-90), 0, 0))
        # rooflight: soft sky from above
        rl = self.rooflight
        self.area_light('rooflight-daylight', ((rl[0] + rl[1]) / 2, (rl[2] + rl[3]) / 2, CEIL + 0.28), (rl[1] - rl[0], rl[3] - rl[2]), power=1100.0, temp=6500)
        # glazed rear wall behind the camera
        self.area_light('rear-glazing', (self.cx, ROOM_FRONT + 0.3, 1.3), (self.room_w + 0.4, 2.3), power=2600.0, temp=6000,
                        rot=(math.radians(90), 0, 0))
        # ceiling downlights over the run
        n = 4
        for k in range(n):
            x = self.XL + (k + 0.5) * self.room_w / n
            if self.hood != 'none' and abs(x) < self.hood_w / 2 + 0.1:
                x += 0.35 if x > 0 else -0.35
            self.g.cylinder('downlight', (x, -0.95, CEIL - 0.002), 0.04, 0.002,
                            self.M.plain('downlight', (0, 0, 0), emission=kelvin(3000), emission_strength=30.0), segs=20, shadow=False)
            self.spot_light('downlight-spot', (x, -0.95, CEIL - 0.01), power=18.0, temp=3000, size=0.03, angle=75)


def world_sky(strength=0.8):
    w = bpy.data.worlds.new('kitchen-world')
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = [n for n in w.node_tree.nodes if n.type == 'BACKGROUND'][0]
    bg.inputs['Color'].default_value = (0.72, 0.8, 0.9, 1.0)
    bg.inputs['Strength'].default_value = strength
    bpy.context.scene.world = w
    return w
