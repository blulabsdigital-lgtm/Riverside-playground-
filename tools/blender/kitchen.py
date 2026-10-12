"""Riverside kitchen generator: builds a kitchen card from assets/kitchen-art.js in Blender, renders it and exports glTF.

Run with the Blender Python module (bpy) from the repo root, for example:
    PY=<blender-env>/bin/python
    node tools/blender/export-cards.mjs                       # refresh kitchen-cards.json from the swipe cards
    $PY tools/blender/kitchen_textures.py                     # (re)make the PNG textures
    $PY tools/blender/kitchen.py --card ink                   # beauty render to lab/inputs/kitchen-ink-beauty.png
    $PY tools/blender/kitchen.py --card all                   # all ten cards
    $PY tools/blender/kitchen.py --card ink --view angle      # 3/4 view at 1200 x 900
    $PY tools/blender/kitchen.py --card ink --glb lab/assets/kitchen-ink.glb --no-render
Options: --res 800x1000, --samples 256, --time 110 (seconds cap per render), --preview (quick and small),
         --out <png>, --blend <file.blend> to save the scene for inspection.
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import kitchen_build  # noqa: E402
from kitchen_build import Kitchen, world_sky  # noqa: E402


def load_cards():
    with open(os.path.join(HERE, 'kitchen-cards.json')) as f:
        return {c['id']: c for c in json.load(f)['cards']}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def camera(k, view, res):
    cd = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cd)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cd.sensor_fit = 'HORIZONTAL' if res[0] >= res[1] else 'VERTICAL'
    cd.sensor_width = 36
    cd.sensor_height = 36
    cd.clip_start = 0.05
    cd.clip_end = 60
    cx = k.cx
    if view == 'angle':
        cd.lens = 26
        cam.location = (k.XR - 0.35, -5.3, 1.78)
        look_at(cam, (cx - 0.35, -1.15, 1.02))
        cd.shift_y = -0.02
    else:
        # front-on, a little above eye level, verticals kept upright with a small tilt and a lens shift
        if k.island:
            dist, z, lens, pitch, shift = 6.15, 1.82, 30.0, -6.0, -0.07
        else:
            dist, z, lens, pitch, shift = 4.75, 1.72, 30.0, -5.0, -0.07
        cd.lens = lens
        cam.location = (cx, -dist, z)
        cam.rotation_euler = (math.radians(90 + pitch), 0, 0)
        cd.shift_y = shift
    return cam


def render_settings(res, samples, tlimit, preview=False):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02 if not preview else 0.05
    cy.adaptive_min_samples = 24
    cy.time_limit = tlimit
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    try:
        cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        cy.denoising_prefilter = 'ACCURATE'
    except Exception:
        pass
    cy.max_bounces = 8
    cy.diffuse_bounces = 4
    cy.glossy_bounces = 4
    cy.transmission_bounces = 6
    cy.transparent_max_bounces = 12
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_indirect = 6.0
    cy.seed = 7
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    try:
        sc.render.filter_size = 1.2
    except Exception:
        pass
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.color_depth = '8'
    sc.render.threads_mode = 'AUTO'


def render(path):
    sc = bpy.context.scene
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t


def export_glb(k, path):
    """Apply modifiers, join meshes that share a material, and export a compact Y-up glTF binary."""
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    objs = [o for o in k.col.objects if o.type == 'MESH' and o.name not in k.noexport]
    for o in list(k.col.objects):
        if o.type != 'MESH' or o.name in k.noexport:
            bpy.data.objects.remove(o, do_unlink=True)
    # bake modifiers
    for o in objs:
        if o.modifiers:
            ev = o.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
            old = o.data
            o.modifiers.clear()
            o.data = me
            if old.users == 0:
                bpy.data.meshes.remove(old)
    # join by material
    groups = {}
    for o in objs:
        m = o.data.materials[0].name if o.data.materials else ''
        groups.setdefault(m, []).append(o)
    joined = []
    for m, group in groups.items():
        if len(group) > 1:
            with bpy.context.temp_override(active_object=group[0], selected_editable_objects=group, selected_objects=group):
                bpy.ops.object.join()
        group[0].name = 'kitchen-' + (m or 'mesh')
        joined.append(group[0])
    for o in sc.objects:
        o.select_set(o in joined)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kwargs = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                  export_image_format='JPEG', export_cameras=False, export_lights=False, export_extras=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    if 'export_image_quality' in props:
        kwargs['export_image_quality'] = 82
    if 'export_jpeg_quality' in props:
        kwargs['export_jpeg_quality'] = 82
    bpy.ops.export_scene.gltf(**kwargs)
    return len(joined), sum(len(o.data.polygons) for o in joined)


def run_card(spec, args):
    reset()
    t0 = time.time()
    k = Kitchen(spec).build()
    world_sky(0.9)
    tb = time.time() - t0
    res = tuple(int(v) for v in args.res.split('x'))
    if args.view == 'angle' and args.res == '800x1000':
        res = (1200, 900)
    if args.preview:
        res = (res[0] // 2, res[1] // 2)
    camera(k, args.view, res)
    render_settings(res, args.samples if not args.preview else 48, args.time, args.preview)
    info = {'card': spec['id'], 'objects': k.g.count, 'buildSeconds': round(tb, 1)}
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
    if not args.no_render:
        out = args.out or os.path.join(ROOT, 'lab', 'inputs', f'kitchen-{spec["id"]}-{"angle" if args.view == "angle" else "beauty"}.png')
        info['renderSeconds'] = round(render(os.path.abspath(out)), 1)
        info['out'] = os.path.relpath(os.path.abspath(out), ROOT)
    if args.glb:
        n, tris = export_glb(k, os.path.abspath(args.glb))
        info['glb'] = args.glb
        info['glbBytes'] = os.path.getsize(os.path.abspath(args.glb))
        info['glbMeshes'] = n
    print('RESULT ' + json.dumps(info), flush=True)
    return info


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description='Riverside kitchen generator')
    ap.add_argument('--card', default='ink', help='card id from kitchen-cards.json, or "all"')
    ap.add_argument('--view', default='beauty', choices=['beauty', 'angle'])
    ap.add_argument('--res', default='800x1000')
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--time', type=float, default=110.0)
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--out')
    ap.add_argument('--blend')
    ap.add_argument('--glb')
    ap.add_argument('--no-render', action='store_true')
    args = ap.parse_args(argv)
    cards = load_cards()
    ids = list(cards) if args.card == 'all' else args.card.split(',')
    results = []
    for cid in ids:
        if cid not in cards:
            raise SystemExit(f'Unknown card {cid}. Cards: {", ".join(cards)}')
        if len(ids) > 1:
            args.out = None
        results.append(run_card(cards[cid], args))
    return results


if __name__ == '__main__':
    main()
