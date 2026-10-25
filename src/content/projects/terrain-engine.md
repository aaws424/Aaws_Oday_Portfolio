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
  - { value: '23', label: 'presets' }
highlights:
  - Non-destructive layer stack that runs entirely on the GPU through Blender's gpu module and GLSL compute shaders, with a per-layer cache so live updates resume from the first changed layer.
  - Three hydraulic erosion models — droplet particles, a shallow-water pipe model (Mei et al.) and stream-power fluvial erosion with flow accumulation, hillslope diffusion and uplift — plus thermal, snow and wind erosion.
  - 'Resolution-independent erosion: parameters are defined on a 512 reference grid and rescaled internally, so a stack tuned at 512² looks the same at 2048².'
  - Generators for Perlin, ridged multifractal, billow, simplex, Worley, Swiss and Jordan turbulence, Voronoi and shape primitives, plus image / DEM import and captured sculpt edits.
  - Data maps — height, slope, flow, wear, deposit, curvature, occlusion and lakes (priority-flood pit filling) — drive a procedural mask on every layer, the color bake, EXR / PNG export and point attributes for Geometry Nodes.
  - 'Curve-driven features: draw a Bezier curve to raise ridges, carve valleys and rivers or flatten roads through a GPU signed-distance field.'
  - Work is split into bounded GPU dispatches so 4K grids never trip the Windows GPU watchdog, and a headless test suite and timing report run in background Blender.
links:
  - { label: 'See the live erosion demo', url: '/#top' }
# To add media: put renders in src/assets/projects/terrain-engine/ and uncomment:
# cover: ../../assets/projects/terrain-engine/cover.jpg
# coverAlt: Eroded alpine terrain generated with Terrain Engine
# gallery:
#   - { src: ../../assets/projects/terrain-engine/flow.jpg, alt: Flow map }
# youtube: VIDEO_ID
---

## Overview

Terrain Engine brings a node-graph terrain workflow into Blender. Every terrain is a stack of layers —
generators, shaping operations and simulations — each editing a single floating-point heightmap on the GPU.
Layers can be masked by any data map (height, slope, flow, wear, curvature…), so effects like "ridged detail
only on high ground" or "rock where erosion wore the surface" come for free. The result is baked into a
color map and a mesh with float attributes ready for Geometry Nodes scattering.

## Erosion

The add-on ships three hydraulic models that complement each other: droplet particles for sharp gullies,
a shallow-water pipe model for dendritic channels and sheet erosion, and stream-power erosion for long
river valleys that particle methods cannot produce. Thermal erosion with rock hardness and strata adds
talus slopes and layered cliffs; snow and wind layers finish the surface.

## The live demo on this site

The terrain at the top of the home page is a browser port of Terrain Engine's droplet erosion. It uses
the same hashing, capacity clamps and 512-reference-grid scaling as the add-on's compute shader, rewritten
in TypeScript and rendered with Three.js. Switch between the **Shaded**, **Flow** and **Wear** views to see
the data maps the simulation produces.
