---
title: iCity 1.5
role: Blender Add-on Developer
period: Summer 2024
order: 2
summary: Procedural city blocks for Blender — parcel subdivision, algorithmic house fitting, context-aware yard scattering and lot-specific fences and walls.
tags: [Python, Blender API, Procedural generation, Scattering]
highlights:
  - Engineered a system to subdivide city blocks and algorithmically test-fit house models to parcels.
  - Designed a context-aware scattering system that procedurally populates yards based on lot and house dimensions.
  - Created a dynamic algorithm that automatically generates realistic, lot-specific fences and walls.
cover: ../../assets/projects/icity-1-5/cover.webp
coverAlt: iCity turning a traced 2D map into a 3D city block
videos:
  - { id: pOaYOzt_R6Q, title: 'iCity 1.5 — Google Maps tracing and elevated highways (complete guide)' }
---

## Overview

iCity 1.5 generates residential neighborhoods from city blocks. Blocks are split into parcels, house models
are test-fitted to each lot, and yards are populated by a scattering system that adapts to the size of the
lot and the house. Fences and walls are then generated to match each individual lot.

## Breakdown

### Parcels and house fitting

Each block is subdivided into lots, and candidate house models are tested against each lot's shape and
size so that only buildings that fit are placed — the street keeps its variety without overlaps.

### Context-aware scattering

Yard content is chosen and spaced from the dimensions of the lot and the house footprint, so small lots
get compact gardens and large ones get room to breathe.

### Fences and walls

Boundaries are generated per lot from its outline, giving every property its own fence or wall instead of
one repeated asset.
