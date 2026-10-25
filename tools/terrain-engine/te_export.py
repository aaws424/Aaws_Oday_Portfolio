"""
Headless Terrain Engine export + render for the portfolio.

    blender -b --python te_export.py -- <out_dir> <grid> <render:0|1> PRESET [PRESET ...]

For each preset: generate (final), save raw float32 maps, render a Cycles beauty shot,
then disable the erosion/simulation layers and generate again to save the "before" state.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

ADDON = "Terrain_Engin"
SIM_LAYERS = {"THERMAL", "HYDRAULIC", "PIPE_EROSION", "STREAM_POWER", "SNOW", "WIND", "FILL_LAKES"}

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, GRID, DO_RENDER, WANTED = argv[0], int(argv[1]), argv[2] == "1", argv[3:]
os.makedirs(OUT, exist_ok=True)


def log(*a):
    print("[TE_EXPORT]", *a, flush=True)


def save(arr, name, gs, channels=1):
    a = np.asarray(arr, dtype=np.float32).reshape(gs, gs, channels) if channels > 1 else np.asarray(arr, dtype=np.float32).reshape(gs, gs)
    a.astype("<f4").tofile(os.path.join(OUT, name + ".f32"))
    return {"min": float(np.nanmin(a)), "max": float(np.nanmax(a)), "nan": int(np.isnan(a).sum()), "channels": channels}


def setup_render(scene):
    for ob in list(bpy.data.objects):
        if ob.name in ("Cube", "Light", "Camera"):
            bpy.data.objects.remove(ob, do_unlink=True)
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    scene.cycles.device = "GPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - High Contrast"
    scene.view_settings.exposure = -0.35

    # Sky lights the terrain; camera rays see a flat studio colour matching the site background.
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "MULTIPLE_SCATTERING"
    except Exception:
        pass
    sky.sun_elevation = math.radians(14)
    sky.sun_rotation = math.radians(215)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.22
    studio = nt.nodes.new("ShaderNodeBackground")
    studio.inputs["Color"].default_value = (0.91, 0.905, 0.87, 1.0)  # linear ~ #f5f4f0 after AgX
    studio.inputs["Strength"].default_value = 1.75
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(bg.outputs[0], mix.inputs[1])
    nt.links.new(studio.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])

    sun_data = bpy.data.lights.new("TE_Sun", "SUN")
    sun_data.energy = 4.5
    sun_data.angle = math.radians(2.0)
    sun = bpy.data.objects.new("TE_Sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(76), 0.0, math.radians(215 - 180))
    scene.render.film_transparent = False

    cam_data = bpy.data.cameras.new("TE_Cam")
    cam_data.lens = 50
    cam_data.clip_end = 5000
    cam = bpy.data.objects.new("TE_Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def frame_camera(cam, terrain, yaw_deg=35, pitch_deg=34, dist_scale=1.55):
    corners = [terrain.matrix_world @ Vector(c) for c in terrain.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    center = (lo + hi) / 2
    center.z = lo.z + (hi.z - lo.z) * 0.35
    size = max(hi.x - lo.x, hi.y - lo.y)
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = size * dist_scale
    cam.location = center + Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch))) * d
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    return {"size": size, "height": hi.z - lo.z}


def main():
    import gpu
    gpu.init()
    if ADDON not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module=ADDON)
    from Terrain_Engin import presets
    ops = sys.modules[ADDON + ".operators"]
    scene = bpy.context.scene
    s = scene.terrain_settings
    s.auto_update = False
    s.grid_size = GRID
    s.mesh_resolution = min(GRID, 1024)
    s.preview_grid_size = "FULL"
    cam = setup_render(scene) if DO_RENDER else None
    manifest = {}

    for key in WANTED:
        entry = {"name": presets.PRESETS[key]["name"], "description": presets.PRESETS[key]["description"]}
        presets.apply_preset(s, key)
        s.grid_size = GRID
        s.mesh_resolution = min(GRID, 1024)
        s.compute_data_maps = True
        entry["layers"] = [(l.layer_type, l.name) for l in s.layer_stack]

        t0 = time.time()
        bpy.ops.terrain.generate()
        entry["generate_s"] = round(time.time() - t0, 2)
        r = ops._last_results
        gs = r["grid_size"]
        entry["grid"] = gs
        entry["terrain_size"] = [s.terrain_size_x, s.terrain_size_y, s.terrain_size_z]
        entry["sea_level"] = float(getattr(s, "sea_level", 0.0))
        entry["keys"] = sorted(k for k, v in r.items() if isinstance(v, np.ndarray))
        files = {"height": save(r["heightmap"], f"{key}_height", gs), "color": save(r["color_map"], f"{key}_color", gs, 4)}
        for k in ("erosion_map", "deposition_map", "water_map"):
            if r.get(k) is not None:
                files[k] = save(r[k], f"{key}_{k}", gs)
        for k, v in (r.get("data_maps") or {}).items():
            if v is not None:
                files["dm_" + k] = save(v, f"{key}_dm_{k}", gs)
        entry["files"] = files
        log(key, "generated", entry["generate_s"], "s", list(files))

        if DO_RENDER:
            terrain = bpy.data.objects.get("Terrain")
            shots = {"wide": dict(yaw_deg=35, pitch_deg=30, dist_scale=2.25), "close": dict(yaw_deg=125, pitch_deg=18, dist_scale=0.95)}
            entry["render_s"] = {}
            for shot, cfg in shots.items():
                entry["framing"] = frame_camera(cam, terrain, **cfg)
                scene.render.filepath = os.path.join(OUT, f"{key}_{shot}.png")
                t0 = time.time()
                bpy.ops.render.render(write_still=True)
                entry["render_s"][shot] = round(time.time() - t0, 1)
            log(key, "rendered", entry["render_s"])
            if os.environ.get("TE_RENDER_ONLY"):
                manifest[key] = entry
                continue

        # "Before": same stack with the simulation layers switched off
        toggled = []
        for layer in s.layer_stack:
            if layer.layer_type in SIM_LAYERS and layer.is_active:
                layer.is_active = False
                toggled.append(layer.layer_type)
        entry["before_disabled"] = toggled
        if toggled:
            bpy.ops.terrain.generate()
            r = ops._last_results
            files["height_before"] = save(r["heightmap"], f"{key}_height_before", gs)
            files["color_before"] = save(r["color_map"], f"{key}_color_before", gs, 4)
        for layer in s.layer_stack:
            if layer.layer_type in toggled:
                layer.is_active = True
        manifest[key] = entry
        with open(os.path.join(OUT, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=1)

    ops.release_gpu_resources()
    log("DONE")


main()
