---
title: Terrain Engine
role: Add-on Developer · Personal project
period: '2026'
order: 1
featured: true
summary: A Gaea / World Machine-style terrain generator that lives inside Blender — a non-destructive layer stack of generators, shaping operations and erosion simulations, running entirely in GPU compute shaders.
tags: [Python, GLSL compute, Blender gpu module, Simulation]
stats:
  - { value: '34', label: 'GLSL compute shaders' }
  - { value: '27', label: 'layer types' }
  - { value: '3', label: 'hydraulic erosion models' }
  - { value: '1.1–3.1 s', label: 'full 1024² stack on an RTX 3050' }
highlights:
  - Non-destructive layer stack that runs entirely on the GPU through Blender's gpu module and GLSL compute shaders, with a per-layer cache so live updates resume from the first changed layer.
  - Three hydraulic erosion models — droplet particles, a shallow-water pipe model (Mei et al.) and stream-power fluvial erosion with flow accumulation, hillslope diffusion and uplift — plus thermal, snow and wind erosion.
  - 'Resolution-independent erosion: parameters are defined on a 512 reference grid and rescaled internally, so a stack tuned at 512² looks the same at 2048².'
  - Generators for Perlin, ridged multifractal, billow, simplex, Worley, Swiss and Jordan turbulence, Voronoi and shape primitives, plus image / DEM import and captured sculpt edits.
  - Data maps — height, slope, flow, wear, deposit, curvature, occlusion and lakes (priority-flood pit filling) — drive a procedural mask on every layer, the color bake, EXR / PNG export and point attributes for Geometry Nodes.
  - 'Curve-driven features: draw a Bezier curve to raise ridges, carve valleys and rivers or flatten roads through a GPU signed-distance field.'
  - Work is split into bounded GPU dispatches so 4K grids never trip the Windows GPU watchdog, and a headless test suite and timing report run in background Blender.
cover: ../../assets/projects/terrain-engine/alpine-close.webp
coverAlt: Alpine Mountains preset — stream-power valleys, droplet gullies and a snow line, rendered in Cycles
gallery:
  - { src: ../../assets/projects/terrain-engine/swiss-alps-close.webp, alt: 'Swiss Alps preset: Swiss turbulence, hard-rock stream power, thermal strata and simulated snowfall' }
  - { src: ../../assets/projects/terrain-engine/badlands-close.webp, alt: 'Badlands preset: soft-rock ridges stripped into gullies, with striped strata' }
  - { src: ../../assets/projects/terrain-engine/desert-canyon-close.webp, alt: 'Desert Canyon preset: slot canyons cut along the plateau’s own drainage network' }
  - { src: ../../assets/projects/terrain-engine/canyon-close.webp, alt: 'Canyon Mesas preset: terraced plateaus cut by the shallow-water pipe model' }
  - { src: ../../assets/projects/terrain-engine/island-wide.webp, alt: 'Volcanic Island preset: radial island mask, droplet erosion and a flat sea floor' }
  - { src: ../../assets/projects/terrain-engine/alpine-wide.webp, alt: 'Alpine Mountains as a full 200 m tile (1024² grid)' }
  - { src: ../../assets/projects/terrain-engine/map-color-before.webp, alt: 'Color bake before the simulation layers (Alpine, top-down)' }
  - { src: ../../assets/projects/terrain-engine/map-color-after.webp, alt: 'Color bake after stream power, droplet and thermal erosion' }
  - { src: ../../assets/projects/terrain-engine/map-flow.webp, alt: 'Flow map: GPU flow accumulation over the final heightmap' }
  - { src: ../../assets/projects/terrain-engine/map-wear-deposit.webp, alt: 'Wear (orange) and deposit (blue) maps written by the erosion layers' }
  - { src: ../../assets/projects/terrain-engine/map-occlusion.webp, alt: 'Horizon-based ambient occlusion data map' }
  - { src: ../../assets/projects/terrain-engine/map-height.webp, alt: 'Final 1024² heightmap' }
links:
  - { label: 'Explore the presets in 3D', url: '/#top' }
---

## Overview

Terrain Engine brings a node-graph terrain workflow into Blender. Every terrain is a stack of layers —
generators, shaping operations and simulations — each editing a single floating-point heightmap on the GPU.
Layers can be masked by any data map (height, slope, flow, wear, curvature…), so effects like "ridged detail
only on high ground" or "rock where erosion wore the surface" come for free. The result is baked into a
color map and a mesh with float attributes ready for Geometry Nodes scattering.

The 3D terrain at the top of the home page is not a mock-up: it is the add-on's own output for six of its
presets, exported headless from Blender and rendered in the browser.

## Architecture

```text
layer 0 ─► layer 1 ─► … ─► layer N ─► heightmap ─► data maps ─► color bake ─► mesh + attributes
          (each layer is one or more compute dispatches on a single R32F texture)
```

- **One heightmap, many passes.** Each layer reads and writes the same R32F image; its mask is evaluated on
  the "before" state, and a mask-apply pass blends before/after.
- **Layer cache.** The pipeline snapshots after every layer and resumes from the first changed one, which is
  what makes live slider updates usable at 2048². A `Bake` layer freezes everything above it on demand.
- **Data maps on demand.** Flow, slope, curvature, occlusion and lakes are computed from the heightmap only
  when a mask, the color bake or an export asks for them; wear and deposit come from the last erosion layer.
- **Outputs.** A `TerrainColorMap` image, a mesh with `te_*` float attributes for Geometry Nodes, and
  32-bit EXR / 16-bit PNG export of every map.

## Three hydraulic models

**Droplet erosion.** Thousands of particles per dispatch, each following the gradient, picking up sediment
while its capacity (slope × speed × water) exceeds its load and dropping it when it doesn't. Erosion is
spread with a radial brush to avoid single-cell trenches, a rock-hardness map scales it, and wear, deposit
and water are accumulated with integer atomics into data maps.

**Shallow-water pipe model** (Mei, Decaudin & Hu 2007). Water flows between cells through virtual pipes;
sediment capacity follows either discharge (velocity × depth, for channels) or velocity (sheet erosion).
Stability tools — 3×3 erosion spreading, talus relaxation, a per-iteration height clamp and a dry-out phase
at the end — keep it from producing spikes and checkerboards.

**Stream-power erosion.** A landscape-evolution model, `dh = −K · A^m · S^n`, iterated with GPU flow
accumulation (warm-started from the previous iteration), hillslope diffusion and optional uplift. It produces
the long dendritic river valleys that particle methods cannot.

## Resolution independence

All erosion parameters are defined on a 512 reference grid. For a grid of size N, with r = N / 512:

| Quantity | Scaled by | Why |
|---|---|---|
| droplet count | r² | the same rain density over more cells |
| droplet lifetime | r | a cell is 1/r of a reference cell, so droplets travel the same world distance |
| slopes | × r | gradients are measured per reference cell |
| erosion per visit | ÷ r | each cell is visited r times more often |
| evaporation, inertia | per-step rate ^ (1/r) | per-step rates become per-reference-cell rates |

A stack tuned at 512² therefore looks the same at 2048² — it just costs ~64× the work (16× the droplets,
each living 4× longer).

## Engineering for the GPU

- **No watchdog resets.** A single long dispatch trips the Windows GPU timeout (TDR) and takes Blender down.
  Droplets run in batches of roughly 4 M simulation steps (~0.1–0.3 s each), so a 4K resolution-independent
  run — about 9 M droplets × 350 steps — completes safely.
- **34 compute shaders**, one per pass, compiled through Blender's `gpu` module, with a uniform block for the
  color-bake parameters.
- **Tested headless.** A regression suite (`blender -b -P tests/run_tests.py`) generates small stacks and
  asserts output statistics: no NaNs, expected ranges, data maps present, erosion actually changed the
  terrain, cache and preview behave.

## Performance

Full preset stacks at 1024², including the extra data maps, measured headless in Blender 5.2 on an RTX 3050:

| Preset | Simulation layers | Time |
|---|---|---|
| Volcanic Island | Droplet erosion | 1.1 s |
| Desert Canyon | Thermal, stream power | 1.5 s |
| Badlands | Stream power, thermal, droplet | 2.3 s |
| Swiss Alps | Stream power, droplet, thermal, snow | 2.4 s |
| Alpine Mountains | Stream power, droplet, thermal | 3.1 s |
| Canyon Mesas | Shallow-water pipe, thermal | 3.1 s |

## How the hero viewer works

For the home page I generated each preset twice in background Blender — the full stack, and the same stack
with its simulation layers disabled — and exported heights, the color bake and the flow / wear / deposit maps.
In the browser (Three.js, custom GLSL):

- 16-bit heights are packed into two 8-bit channels of a lossless WebP and decoded exactly with `texelFetch`.
- Fine detail comes from a 1024² normal map with the add-on's ambient occlusion packed into its blue channel.
- The **Before → After** slider morphs between the two real states, driven by the flow map so drainage
  channels carve first and ridges last.
- Lighting uses soft shadows ray-marched through the heightfield; **Flow** and **Erosion** show the data maps.
