"""Materials for the Riverside kitchen generator.

Every material is a Principled BSDF. Textures are the PNG files from lab/assets/textures/kitchen-*.png
(see kitchen_textures.py and kitchen-textures.json). A card colour is applied to a texture with a
Mix (multiply) node and a constant colour, which the glTF exporter writes out as baseColorFactor,
so factors are kept at or below 1. Each material stores its real-world tile size in mat['tile'],
which kitchen_geo uses to scale UVs.
"""
import json
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TEX = os.path.join(ROOT, 'lab', 'assets', 'textures')


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    h = h.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def shade_hex(h, amt):
    """Same idea as KitchenArt.shade: amt < 0 darkens, amt > 0 lightens (sRGB)."""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    if amt < 0:
        c = [v * (1 + amt) for v in c]
    else:
        c = [v + (255 - v) * amt for v in c]
    return '#' + ''.join('%02x' % max(0, min(255, int(round(v)))) for v in c)


def luminance(h):
    r, g, b = hex_lin(h)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def kelvin(k):
    """Approximate colour of a black body in linear RGB, normalised so the brightest channel is 1."""
    t = k / 100.0
    r = 255 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    rgb = [srgb_to_lin(max(0, min(255, v)) / 255.0) for v in (r, g, b)]
    m = max(rgb)
    return tuple(v / m for v in rgb)


class Materials:
    def __init__(self):
        self.cache = {}
        with open(os.path.join(TEX, 'kitchen-textures.json')) as f:
            self.manifest = json.load(f)['textures']

    def get(self, key):
        if key in self.cache:
            return self.cache[key]
        raise KeyError(key)

    # ------------------------------------------------------------ plumbing
    def _new(self, key, tile=1.0):
        m = bpy.data.materials.new(key)
        try:
            m.use_nodes = True
        except Exception:
            pass
        m['tile'] = tile
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type != 'OUTPUT_MATERIAL':
                nt.nodes.remove(n)
        out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.location = (0, 0)
        out.location = (400, 0)
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        self.cache[key] = m
        return m, nt, bsdf

    def _img(self, nt, name, non_colour=False, x=-700, y=0):
        path = os.path.join(TEX, name)
        img = bpy.data.images.load(path, check_existing=True)
        if non_colour:
            img.colorspace_settings.name = 'Non-Color'
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        n.location = (x, y)
        n.interpolation = 'Linear'
        return n

    def _tint_factor(self, tex, target_hex=None, ref_hex=None, absolute=False):
        """Multiply factor that takes a texture to a card colour. Relative to ref_hex, or to the texture's mean."""
        if not target_hex:
            return None
        tgt = hex_lin(target_hex)
        if absolute:
            ref = self.manifest[tex]['meanLinear']
        elif ref_hex:
            ref = hex_lin(ref_hex)
        else:
            return None
        f = [t / max(1e-4, r) for t, r in zip(tgt, ref)]
        m = max(f)
        if m > 1.0:
            f = [v / m for v in f]
        if all(abs(v - 1) < 0.02 for v in f):
            return None
        return tuple(f)

    def textured(self, key, tex, tint=None, rough=0.5, rough_tex=None, normal_tex=None, normal_strength=1.0,
                 metallic=0.0, coat=0.0, coat_rough=0.05, spec=0.5, sheen=0.0):
        if key in self.cache:
            return self.cache[key]
        m, nt, bsdf = self._new(key, tile=self.manifest.get(tex, {}).get('tileMetres', 1.0))
        img = self._img(nt, tex, y=200)
        if tint:
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.location = (-300, 200)
            mix.inputs[0].default_value = 1.0
            a = [s for s in mix.inputs if s.name == 'A' and s.type == 'RGBA'][0]
            b = [s for s in mix.inputs if s.name == 'B' and s.type == 'RGBA'][0]
            nt.links.new(img.outputs['Color'], a)
            b.default_value = (*tint, 1.0)
            nt.links.new([s for s in mix.outputs if s.type == 'RGBA'][0], bsdf.inputs['Base Color'])
        else:
            nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
        if rough_tex:
            r = self._img(nt, rough_tex, non_colour=True, y=-150)
            nt.links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
        else:
            bsdf.inputs['Roughness'].default_value = rough
        if normal_tex:
            nimg = self._img(nt, normal_tex, non_colour=True, y=-450)
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.location = (-300, -450)
            nm.inputs['Strength'].default_value = normal_strength
            nt.links.new(nimg.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Specular IOR Level'].default_value = spec
        if coat:
            bsdf.inputs['Coat Weight'].default_value = coat
            bsdf.inputs['Coat Roughness'].default_value = coat_rough
        if sheen:
            bsdf.inputs['Sheen Weight'].default_value = sheen
        return m

    def plain(self, key, hex_or_lin, rough=0.5, metallic=0.0, coat=0.0, coat_rough=0.05, spec=0.5, alpha=1.0,
              emission=None, emission_strength=0.0, transmission=0.0, ior=1.5, rough_tex=None, tile=1.0, sheen=0.0):
        if key in self.cache:
            return self.cache[key]
        m, nt, bsdf = self._new(key, tile=tile)
        col = hex_lin(hex_or_lin) if isinstance(hex_or_lin, str) else hex_or_lin
        bsdf.inputs['Base Color'].default_value = (*col, 1.0)
        if rough_tex:
            r = self._img(nt, rough_tex, non_colour=True, y=-150)
            m['tile'] = self.manifest.get(rough_tex, {}).get('tileMetres', tile)
            if abs(rough - 0.25) > 1e-3:
                # rescale the brushed map around the requested roughness
                mr = nt.nodes.new('ShaderNodeMath')
                mr.operation = 'MULTIPLY'
                mr.location = (-300, -150)
                mr.inputs[1].default_value = rough / 0.22
                nt.links.new(r.outputs['Color'], mr.inputs[0])
                nt.links.new(mr.outputs[0], bsdf.inputs['Roughness'])
            else:
                nt.links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
        else:
            bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Specular IOR Level'].default_value = spec
        bsdf.inputs['IOR'].default_value = ior
        if coat:
            bsdf.inputs['Coat Weight'].default_value = coat
            bsdf.inputs['Coat Roughness'].default_value = coat_rough
        if sheen:
            bsdf.inputs['Sheen Weight'].default_value = sheen
        if alpha < 1.0:
            bsdf.inputs['Alpha'].default_value = alpha
            try:
                m.surface_render_method = 'BLENDED'
            except Exception:
                pass
        if transmission:
            bsdf.inputs['Transmission Weight'].default_value = transmission
        if emission:
            bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
            bsdf.inputs['Emission Strength'].default_value = emission_strength
        return m

    def emissive_image(self, key, tex, strength=3.0):
        if key in self.cache:
            return self.cache[key]
        m, nt, bsdf = self._new(key)
        img = self._img(nt, tex)
        nt.links.new(img.outputs['Color'], bsdf.inputs['Emission Color'])
        nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Emission Strength'].default_value = strength
        bsdf.inputs['Roughness'].default_value = 1.0
        bsdf.inputs['Specular IOR Level'].default_value = 0.0
        return m

    # ------------------------------------------------------------ the kitchen's palette
    def paint(self, hex_, rough=0.38, name='paint'):
        return self.plain(f'{name}-{hex_.lstrip("#").lower()}-{rough:.2f}', hex_, rough=rough, spec=0.5, coat=0.15, coat_rough=0.3)

    def wood(self, kind, tint_hex=None, rough=None, name='wood'):
        tex = {'oak': 'kitchen-wood-oak-albedo.png', 'walnut': 'kitchen-wood-walnut-albedo.png',
               'smoked': 'kitchen-wood-smoked-oak-albedo.png'}[kind]
        ref = {'oak': '#C79A6B', 'walnut': '#6B4A33', 'smoked': '#5B4636'}[kind]
        f = self._tint_factor(tex, tint_hex, ref_hex=ref)
        key = f'{name}-{kind}-{(tint_hex or "").lstrip("#").lower()}'
        return self.textured(key, tex, tint=f, rough=rough or 0.5, rough_tex=None if rough else 'kitchen-wood-roughness.png', coat=0.1, coat_rough=0.35)

    def metal(self, kind):
        if kind == 'brass':
            return self.plain('metal-brass', (0.66, 0.44, 0.17), rough=0.3, metallic=1.0, rough_tex='kitchen-metal-brushed-roughness.png')
        if kind == 'chrome':
            return self.plain('metal-chrome', (0.86, 0.87, 0.88), rough=0.06, metallic=1.0)
        if kind == 'black':
            return self.plain('metal-black', '#1C1C1D', rough=0.42, metallic=0.0, spec=0.5, coat=0.2, coat_rough=0.35)
        if kind == 'steel':
            return self.plain('metal-steel', (0.62, 0.62, 0.63), rough=0.28, metallic=1.0, rough_tex='kitchen-metal-brushed-roughness.png')
        if kind == 'steel-dark':
            return self.plain('metal-steel-dark', (0.28, 0.28, 0.29), rough=0.32, metallic=1.0)
        raise KeyError(kind)

    def top(self, kind):
        if kind == 'marble':
            return self.textured('top-marble', 'kitchen-stone-marble-albedo.png', rough=0.12, coat=0.3, coat_rough=0.04)
        if kind == 'nero':
            return self.textured('top-nero', 'kitchen-stone-nero-albedo.png', rough=0.1, coat=0.4, coat_rough=0.03)
        if kind == 'quartz':
            return self.textured('top-quartz', 'kitchen-stone-quartz-albedo.png', rough=0.16, coat=0.25, coat_rough=0.05)
        if kind == 'terrazzo':
            return self.textured('top-terrazzo', 'kitchen-stone-terrazzo-albedo.png', rough=0.22, coat=0.2, coat_rough=0.08)
        if kind == 'concrete':
            return self.textured('top-concrete', 'kitchen-stone-concrete-albedo.png', rough_tex='kitchen-stone-concrete-roughness.png')
        if kind == 'oak':
            return self.textured('top-oak', 'kitchen-wood-oak-albedo.png', rough=0.38, coat=0.15, coat_rough=0.3)
        raise KeyError(kind)
