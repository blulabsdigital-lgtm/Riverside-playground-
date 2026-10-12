"""Geometry helpers for the Riverside kitchen generator.

Every mesh is built in world coordinates (metres, Blender Z up) with its object at the origin.
UVs are box-projected in metres and divided by the material's real-world tile size, so a texture
tile of 0.6 m always covers 0.6 m of tiles, whichever object it is on. The texture's v axis
follows the requested grain axis where it can (vertical grain on doors, along the length on
worktops and shelves).

The local frame: x runs along the back wall (left to right as the camera sees it), y runs from
the back wall (y = 0) towards the camera (negative y), z is up.
"""
import math
import random

import bpy
import bmesh
from mathutils import Vector, Matrix

AXES = 'xyz'


class Geo:
    def __init__(self, collection, materials, seed=1):
        self.col = collection
        self.mats = materials
        self.rng = random.Random(seed)
        self.count = 0

    # ------------------------------------------------------------ core
    def mesh(self, name, verts, faces, mat, grain='z', smooth=False, sharp_deg=35, bevel=0.0, bevel_segments=2,
             uv_offset=None, uv_mode='box', uv_origin=(0.0, 0.0, 0.0), shadow=True, camera=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
        me.validate(clean_customdata=False)
        me.update()
        obj = bpy.data.objects.new(name, me)
        self.col.objects.link(obj)
        m = self.mats.get(mat) if isinstance(mat, str) else mat
        me.materials.append(m)
        tile = float(m.get('tile', 1.0)) if m else 1.0
        if uv_offset is None:
            uv_offset = (self.rng.random() * 7.0, self.rng.random() * 7.0)
        self._uv(me, tile, grain, uv_offset, uv_mode, uv_origin)
        if smooth:
            me.shade_smooth()
            try:
                me.set_sharp_from_angle(angle=math.radians(sharp_deg))
            except Exception:
                pass
        else:
            me.shade_flat()
        if bevel > 0:
            b = obj.modifiers.new('Bevel', 'BEVEL')
            b.width = bevel
            b.segments = bevel_segments
            b.limit_method = 'ANGLE'
            b.angle_limit = math.radians(40)
            b.use_clamp_overlap = True
            b.harden_normals = False
        if not shadow:
            obj.visible_shadow = False
        if not camera:
            obj.visible_camera = False
        self.count += 1
        return obj

    def _uv(self, me, tile, grain, off, mode, origin):
        uvl = me.uv_layers.new(name='UVMap')
        g = AXES.index(grain) if grain in AXES else 2
        ox, oy, oz = origin
        for poly in me.polygons:
            n = poly.normal
            a = max(range(3), key=lambda i: abs(n[i]))
            plane = [i for i in range(3) if i != a]
            if g in plane:
                vax = g
                uax = plane[0] if plane[1] == g else plane[1]
            else:
                uax, vax = plane
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                c = (co.x - ox, co.y - oy, co.z - oz)
                u = c[uax]
                # keep u increasing to the right as seen from the face's front
                if mode == 'box':
                    if (a == 1 and n[1] > 0 and uax == 0) or (a == 0 and n[0] < 0 and uax == 1):
                        u = -u
                uvl.data[li].uv = (u / tile + off[0], c[vax] / tile + off[1])

    # ------------------------------------------------------------ primitives
    def box(self, name, x0, x1, y0, y1, z0, z1, mat, **kw):
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.mesh(name, v, f, mat, **kw)

    def plane(self, name, corners, mat, **kw):
        """A single quad from four corners (counter-clockwise seen from the front)."""
        return self.mesh(name, corners, [(0, 1, 2, 3)], mat, **kw)

    def lathe(self, name, profile, mat, centre, axis='z', segs=32, cap_top=True, cap_bottom=True, **kw):
        """Revolve profile [(r, h), ...] around an axis through centre. h runs along the axis."""
        cx, cy, cz = centre
        verts, faces = [], []
        n = len(profile)
        for s in range(segs):
            t = 2 * math.pi * s / segs
            c, si = math.cos(t), math.sin(t)
            for r, h in profile:
                if axis == 'z':
                    verts.append((cx + r * c, cy + r * si, cz + h))
                elif axis == '-y':
                    verts.append((cx + r * c, cy - h, cz + r * si))
                elif axis == 'x':
                    verts.append((cx + h, cy + r * c, cz + r * si))
        for s in range(segs):
            s2 = (s + 1) % segs
            for i in range(n - 1):
                a, b = s * n + i, s * n + i + 1
                c2, d = s2 * n + i + 1, s2 * n + i
                faces.append((a, d, c2, b))
        if cap_bottom and profile[0][0] > 1e-6:
            faces.append(tuple(s * n for s in range(segs))[::-1])
        if cap_top and profile[-1][0] > 1e-6:
            faces.append(tuple(s * n + n - 1 for s in range(segs)))
        kw.setdefault('smooth', True)
        return self.mesh(name, verts, faces, mat, **kw)

    def cylinder(self, name, centre, r, h, mat, axis='z', segs=24, **kw):
        return self.lathe(name, [(r, 0.0), (r, h)], mat, centre, axis=axis, segs=segs, **kw)

    def sphere(self, name, centre, r, mat, segs=24, rings=12, scale=(1, 1, 1), **kw):
        prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
        prof[0] = (0.0, -r)
        prof[-1] = (0.0, r)
        obj = self.lathe(name, prof, mat, (0, 0, 0), segs=segs, cap_top=False, cap_bottom=False, **kw)
        me = obj.data
        for v in me.vertices:
            v.co = Vector((v.co.x * scale[0] + centre[0], v.co.y * scale[1] + centre[1], v.co.z * scale[2] + centre[2]))
        me.update()
        return obj

    def tube(self, name, points, r, mat, segs=12, closed_ends=True, **kw):
        """A round tube along a polyline of 3D points (taps, stems, cables)."""
        pts = [Vector(p) for p in points]
        verts, faces = [], []
        prev_n = None
        for i, p in enumerate(pts):
            if i == 0:
                t = (pts[1] - pts[0]).normalized()
            elif i == len(pts) - 1:
                t = (pts[-1] - pts[-2]).normalized()
            else:
                t = ((pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()).normalized()
            if prev_n is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                nrm = t.cross(ref).normalized()
            else:
                nrm = (prev_n - t * prev_n.dot(t)).normalized()
            bin_ = t.cross(nrm).normalized()
            prev_n = nrm
            for s in range(segs):
                a = 2 * math.pi * s / segs
                verts.append(tuple(p + (nrm * math.cos(a) + bin_ * math.sin(a)) * r))
        n = len(pts)
        for i in range(n - 1):
            for s in range(segs):
                s2 = (s + 1) % segs
                faces.append((i * segs + s, i * segs + s2, (i + 1) * segs + s2, (i + 1) * segs + s))
        if closed_ends:
            faces.append(tuple(range(segs))[::-1])
            faces.append(tuple((n - 1) * segs + s for s in range(segs)))
        kw.setdefault('smooth', True)
        return self.mesh(name, verts, faces, mat, **kw)

    def extrude_profile(self, name, profile, z0, z1, mat, **kw):
        """Extrude a closed 2D profile [(x, y), ...] (counter-clockwise seen from above) between z0 and z1."""
        n = len(profile)
        verts = [(x, y, z0) for x, y in profile] + [(x, y, z1) for x, y in profile]
        faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, j, n + j, n + i))
        return self.mesh(name, verts, faces, mat, **kw)

    def frustum(self, name, bottom, top, mat, **kw):
        """A tapered box: bottom and top are (x0, x1, y0, y1, z)."""
        bx0, bx1, by0, by1, bz = bottom
        tx0, tx1, ty0, ty1, tz = top
        v = [(bx0, by0, bz), (bx1, by0, bz), (bx1, by1, bz), (bx0, by1, bz),
             (tx0, ty0, tz), (tx1, ty0, tz), (tx1, ty1, tz), (tx0, ty1, tz)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.mesh(name, v, f, mat, **kw)

    def rounded_rect_slab(self, name, cx, cz, w, h, r, y0, y1, mat, segs=6, **kw):
        """A flat slab in the x-z plane with rounded corners (chopping boards)."""
        pts = []
        for (ax, az, a0) in [(cx + w / 2 - r, cz - h / 2 + r, -90), (cx + w / 2 - r, cz + h / 2 - r, 0),
                             (cx - w / 2 + r, cz + h / 2 - r, 90), (cx - w / 2 + r, cz - h / 2 + r, 180)]:
            for k in range(segs + 1):
                a = math.radians(a0 + 90 * k / segs)
                pts.append((ax + r * math.cos(a), az + r * math.sin(a)))
        n = len(pts)
        verts = [(x, y0, z) for x, z in pts] + [(x, y1, z) for x, z in pts]
        faces = [tuple(range(n)), tuple(range(n, 2 * n))[::-1]]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, n + i, n + j, j))
        return self.mesh(name, verts, faces, mat, **kw)


def transform(obj, matrix):
    """Apply a matrix to the mesh data in place (keeps the object at the origin)."""
    obj.data.transform(matrix)
    obj.data.update()


def rot_about(point, angle, axis='Z'):
    p = Vector(point)
    return Matrix.Translation(p) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-p)
