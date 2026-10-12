"""Small mesh-building kit for the Riverside Blender scenes.

MB collects faces with materials into one Blender object, so a whole window or
fence becomes a single mesh. UVs are computed in world space per face, using each
material's real-world tile size, so brick courses, slates and paving line up
across separate pieces and stay the right size. No modifiers or booleans are used,
which keeps the glTF export clean.
"""
import math

import bpy
from mathutils import Matrix, Vector

TILE = {}      # material name -> (tile width m, tile height m)
REGISTRY = []  # every MB built, for stats


def srgb(c):
    """sRGB 0-255 (or 0-1) tuple to linear 0-1."""
    out = []
    for v in c[:3]:
        v = v / 255.0 if max(c[:3]) > 1.0 else v
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def newell(pts):
    n = Vector((0.0, 0.0, 0.0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))


def frame_axes(n):
    """Tangent frame for a face normal: u horizontal along the face, v up the face."""
    if abs(n.z) > 0.999:
        return Vector((1, 0, 0)), Vector((0, 1, 0))
    u = n.cross(Vector((0, 0, 1))).normalized()
    v = u.cross(n).normalized()
    return u, v


class MB:
    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.fmat = []
        self.fuv = []
        self.fanchor = []
        self.fsmooth = []
        self.mats = []
        REGISTRY.append(self)

    def _m(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    # ------------------------------------------------------------ primitives
    def face(self, pts, mat, uv=None, anchor=None, smooth=False):
        i0 = len(self.verts)
        self.verts.extend(Vector(p) for p in pts)
        self.faces.append(list(range(i0, i0 + len(pts))))
        self.fmat.append(self._m(mat))
        self.fuv.append(uv)
        self.fanchor.append(anchor)
        self.fsmooth.append(smooth)

    def shared(self, verts, faces, mat, smooth=True, uvs=None, anchor=None):
        """Add a block with shared vertices (for smooth shading). uvs: per-face list of per-corner uv or None."""
        i0 = len(self.verts)
        self.verts.extend(Vector(p) for p in verts)
        for k, f in enumerate(faces):
            self.faces.append([i0 + i for i in f])
            self.fmat.append(self._m(mat))
            self.fuv.append(uvs[k] if uvs else None)
            self.fanchor.append(anchor)
            self.fsmooth.append(smooth)

    def box(self, x0, y0, z0, x1, y1, z1, mat, skip=(), anchor=None, xf=None):
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        c = {}
        for i, x in enumerate((x0, x1)):
            for j, y in enumerate((y0, y1)):
                for k, z in enumerate((z0, z1)):
                    p = Vector((x, y, z))
                    c[(i, j, k)] = (xf @ p) if xf is not None else p
        if anchor == 'min':
            anchor = Vector((x0, y0, z0)) if xf is None else xf @ Vector((x0, y0, z0))
        self.hexa(c, mat, skip=skip, anchor=anchor)

    def hexa(self, c, mat, skip=(), anchor=None):
        """Six-sided solid from 8 corners keyed (i, j, k) in {0,1}^3 (x, y, z order)."""
        F = {
            '-z': [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)],
            '+z': [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
            '-y': [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
            '+y': [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
            '-x': [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)],
            '+x': [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)],
        }
        for key, idx in F.items():
            if key in skip:
                continue
            self.face([c[i] for i in idx], mat, anchor=anchor)

    def beam(self, p0, p1, w, h, mat, up=(0, 0, 1)):
        """Box from p0 to p1 with cross-section w (sideways) x h (along 'up')."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        L = d.length
        if L < 1e-6:
            return
        a = d / L
        upv = Vector(up)
        s = a.cross(upv)
        if s.length < 1e-6:
            s = a.cross(Vector((1, 0, 0)))
        s.normalize()
        u = s.cross(a).normalized()
        m = Matrix((
            (a.x, s.x, u.x, p0.x),
            (a.y, s.y, u.y, p0.y),
            (a.z, s.z, u.z, p0.z),
            (0, 0, 0, 1)))
        self.box(0, -w / 2, -h / 2, L, w / 2, h / 2, mat, xf=m)

    def prism(self, poly, axis, a0, a1, mat, anchor=None):
        """Extrude a 2D polygon along an axis. poly in the other two axes (for 'x': (y,z); 'y': (x,z); 'z': (x,y))."""
        def P(q, a):
            if axis == 'x':
                return Vector((a, q[0], q[1]))
            if axis == 'y':
                return Vector((q[0], a, q[1]))
            return Vector((q[0], q[1], a))
        n = len(poly)
        self.face([P(q, a0) for q in reversed(poly)], mat, anchor=anchor)
        self.face([P(q, a1) for q in poly], mat, anchor=anchor)
        for i in range(n):
            q0, q1 = poly[i], poly[(i + 1) % n]
            self.face([P(q0, a0), P(q1, a0), P(q1, a1), P(q0, a1)], mat, anchor=anchor)

    def tube(self, pts, radii, mat, segs=10, cap=True, smooth=True):
        """Tapered tube through a polyline (branches, pipes, cords)."""
        pts = [Vector(p) for p in pts]
        if isinstance(radii, (int, float)):
            radii = [radii] * len(pts)
        rings = []
        prev_n = None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n1 = prev_n if prev_n is not None else t.cross(ref).normalized()
            n1 = (n1 - t * n1.dot(t)).normalized()
            prev_n = n1
            n2 = t.cross(n1).normalized()
            ring = []
            for k in range(segs):
                a = 2 * math.pi * k / segs
                ring.append(p + (n1 * math.cos(a) + n2 * math.sin(a)) * radii[i])
            rings.append(ring)
        verts = [v for r in rings for v in r]
        faces = []
        for i in range(len(rings) - 1):
            for k in range(segs):
                a, b = i * segs + k, i * segs + (k + 1) % segs
                faces.append([a, b, b + segs, a + segs])
        self.shared(verts, faces, mat, smooth=smooth)
        if cap:
            self.face(list(reversed(rings[0])), mat)
            self.face(rings[-1], mat)

    def cylinder(self, cx, cy, z0, z1, r, mat, segs=16, r_top=None, smooth=True, cap=True):
        self.tube([(cx, cy, z0), (cx, cy, z1)], [r, r if r_top is None else r_top], mat, segs=segs, cap=cap, smooth=smooth)

    def sphere(self, c, r, mat, segs=16, rings=10, scale=(1, 1, 1)):
        c = Vector(c)
        verts, faces = [], []
        for i in range(rings + 1):
            th = math.pi * i / rings
            for k in range(segs):
                ph = 2 * math.pi * k / segs
                verts.append(c + Vector((math.sin(th) * math.cos(ph) * r * scale[0],
                                         math.sin(th) * math.sin(ph) * r * scale[1],
                                         math.cos(th) * r * scale[2])))
        for i in range(rings):
            for k in range(segs):
                a, b = i * segs + k, i * segs + (k + 1) % segs
                faces.append([a, a + segs, b + segs, b])
        self.shared(verts, faces, mat, smooth=True)

    # ------------------------------------------------------------ build
    def build(self, coll, name=None):
        if not self.faces:
            return None
        me = bpy.data.meshes.new(name or self.name)
        me.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        for m in self.mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.fmat)
        me.polygons.foreach_set('use_smooth', self.fsmooth)
        uvl = me.uv_layers.new(name='UVMap')
        uvdata = [0.0] * (len(me.loops) * 2)
        for fi, poly in enumerate(me.polygons):
            vids = self.faces[fi]
            explicit = self.fuv[fi]
            if explicit is not None:
                for k, li in enumerate(poly.loop_indices):
                    uvdata[li * 2], uvdata[li * 2 + 1] = explicit[k]
                continue
            mat = self.mats[self.fmat[fi]]
            tw, th = TILE.get(mat.name, (1.0, 1.0))
            pts = [self.verts[i] for i in vids]
            n = newell(pts)
            u, v = frame_axes(n)
            anc = self.fanchor[fi]
            o = Vector(anc) if anc is not None else Vector((0, 0, 0))
            for k, li in enumerate(poly.loop_indices):
                p = pts[k] - o
                uvdata[li * 2] = p.dot(u) / tw
                uvdata[li * 2 + 1] = p.dot(v) / th
        uvl.data.foreach_set('uv', uvdata)
        me.validate(clean_customdata=False)
        me.update()
        ob = bpy.data.objects.new(name or self.name, me)
        coll.objects.link(ob)
        return ob


def wall(mb, frame, a0, a1, z0, z1, d0, d1, openings, mat, anchor=None):
    """Wall slab in a local frame with rectangular openings, split into boxes (no booleans).
    frame(a, d, z) -> world Vector. openings: list of (a0, a1, z0, z1)."""
    xs = sorted({a0, a1, *[o[0] for o in openings], *[o[1] for o in openings]})
    zs = sorted({z0, z1, *[o[2] for o in openings], *[o[3] for o in openings]})
    xs = [x for x in xs if a0 <= x <= a1]
    zs = [z for z in zs if z0 <= z <= z1]
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            ca, cb, cz0, cz1 = xs[i], xs[i + 1], zs[j], zs[j + 1]
            if cb - ca < 1e-6 or cz1 - cz0 < 1e-6:
                continue
            mx, mz = (ca + cb) / 2, (cz0 + cz1) / 2
            if any(o[0] < mx < o[1] and o[2] < mz < o[3] for o in openings):
                continue
            frame_box(mb, frame, ca, cb, d0, d1, cz0, cz1, mat, anchor=anchor)


def slab(mb, x0, x1, y0, y1, z0, z1, holes, mat):
    """Horizontal slab with rectangular holes (x0, x1, y0, y1), split into boxes."""
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
    ys = sorted({y0, y1, *[h[2] for h in holes], *[h[3] for h in holes]})
    xs = [x for x in xs if x0 <= x <= x1]
    ys = [y for y in ys if y0 <= y <= y1]
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            mx, my = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if any(h[0] < mx < h[1] and h[2] < my < h[3] for h in holes):
                continue
            mb.box(xs[i], ys[j], z0, xs[i + 1], ys[j + 1], z1, mat)


def frame_box(mb, frame, a0, a1, d0, d1, z0, z1, mat, anchor=None):
    pts = [frame(a, d, z) for a in (a0, a1) for d in (d0, d1) for z in (z0, z1)]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    if anchor == 'min':
        anchor = frame(a0, 0, z0)
    mb.box(min(xs), min(ys), min(zs), max(xs), max(ys), max(zs), mat, anchor=anchor)


def frame_quad(mb, frame, a0, a1, d, z0, z1, mat, uv=None):
    mb.face([frame(a0, d, z0), frame(a1, d, z0), frame(a1, d, z1), frame(a0, d, z1)], mat, uv=uv)


def make_frame(origin, along, inward):
    """Wall frame: a runs along 'along', d runs 'inward' from the outer face, z is world up."""
    o, A, Dn = Vector(origin), Vector(along), Vector(inward)

    def f(a, d, z):
        return o + A * a + Dn * d + Vector((0, 0, z))
    return f
