"""
Headless exports for the technical figures on the Terrain Engine project page.

    blender -b --python te_figures.py -- <out_dir>

Writes raw float32 grids (<name>.f32, row-major) plus figures.json with sizes and timings:
  prog_<i>         ALPINE heightmap after layer i (layer-by-layer progression), 1024²;
                   its timing is incremental: the layer cache resumes from the newly enabled layer
  model_<name>     one base terrain eroded by each hydraulic model, 1024²
  res_<N>          ALPINE at 256 / 512 / 1024 / 2048 (resolution independence), with timings
  cover_*          ALPINE at 2048²: height, flow, wear, deposit
"""
import json
import os
import sys
import time

import bpy
import numpy as np

ADDON = "Terrain_Engin"
OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)

BASE = [
    ("NOISE", {"noise_type": "RIDGED", "noise_scale": 1.1, "octaves": 5, "persistence": 0.5, "lacunarity": 2.0}),
    ("DOMAIN_WARP", {"warp_strength": 10.0, "warp_scale": 1.2, "warp_octaves": 2}),
    ("NORMALIZE", {}),
    ("REMAP", {"exponent": 1.5}),
]
MODELS = {
    "base": [],
    "droplet": [("HYDRAULIC", {"num_droplets": 250000, "droplet_lifetime": 45})],
    "pipe": [("PIPE_EROSION", {})],
    "stream": [("STREAM_POWER", {"sp_iterations": 100, "sp_erodibility": 0.05, "sp_diffusion": 0.015})],
}


def log(*a):
    print("[TE_FIG]", *a, flush=True)


def save(arr, name, gs):
    np.asarray(arr, dtype=np.float32).reshape(gs, gs).astype("<f4").tofile(os.path.join(OUT, name + ".f32"))


def main():
    import gpu
    gpu.init()
    if ADDON not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module=ADDON)
    from Terrain_Engin import presets
    ops = sys.modules[ADDON + ".operators"]
    s = bpy.context.scene.terrain_settings
    s.auto_update = False
    s.preview_grid_size = "FULL"
    s.mesh_resolution = 256  # keep mesh cost out of the timings
    meta = {}

    def generate(grid, data_maps=False):
        s.grid_size = grid
        s.compute_data_maps = data_maps
        t0 = time.time()
        bpy.ops.terrain.generate()
        return ops._last_results, round(time.time() - t0, 2)

    # 1. layer-by-layer progression of the Alpine preset
    presets.apply_preset(s, "ALPINE")
    layers = list(s.layer_stack)
    meta["progression"] = []
    for i in range(len(layers)):
        for j, layer in enumerate(layers):
            layer.is_active = j <= i
        r, t = generate(1024)
        save(r["heightmap"], f"prog_{i}", 1024)
        meta["progression"].append({"layer": layers[i].name, "type": layers[i].layer_type, "seconds": t})
        log("progression", i, layers[i].name, t)
    for layer in layers:
        layer.is_active = True

    # 2. the same base terrain through each hydraulic model
    meta["models"] = {}
    for name, extra in MODELS.items():
        presets.PRESETS["_FIG"] = {"name": name, "icon": "NONE", "description": "", "settings": {"terrain_size_y": 45.0},
                                   "layers": BASE + extra}
        presets.apply_preset(s, "_FIG")
        r, t = generate(1024, data_maps=True)
        save(r["heightmap"], f"model_{name}", 1024)
        if r.get("data_maps") and r["data_maps"].get("flow") is not None:
            save(r["data_maps"]["flow"], f"model_{name}_flow", 1024)
        meta["models"][name] = {"seconds": t}
        log("model", name, t)

    # 3. resolution independence: identical stack at four grid sizes
    presets.apply_preset(s, "ALPINE")
    meta["resolution"] = {}
    for grid in (256, 512, 1024, 2048):
        generate(grid)  # warm-up: shader compilation and texture allocation at this size
        ops.clear_layer_cache()  # time the full stack, not a cache hit
        r, t = generate(grid)
        save(r["heightmap"], f"res_{grid}", grid)
        meta["resolution"][grid] = {"seconds": t}
        log("resolution", grid, t)

    # 4. 2048² cover: height + data maps
    r, t = generate(2048, data_maps=True)
    save(r["heightmap"], "cover_height", 2048)
    save(r["data_maps"]["flow"], "cover_flow", 2048)
    save(r["erosion_map"], "cover_wear", 2048)
    save(r["deposition_map"], "cover_deposit", 2048)
    meta["cover"] = {"grid": 2048, "seconds": t}
    log("cover", t)

    with open(os.path.join(OUT, "figures.json"), "w") as f:
        json.dump(meta, f, indent=1)
    ops.release_gpu_resources()
    log("DONE")


main()
