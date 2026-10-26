---
title: iCrowds
role: Blender Add-on Developer & Designer
period: Winter 2026
order: 3
summary: Crowd simulation for Blender — procedural placement for stadiums, streets and queues, path-drawn crowds, obstacle-aware navigation, procedural outfits and event-triggered ragdolls.
tags: [Python, Blender API, Pathfinding, Ragdoll physics]
stats:
  - { value: '400+', label: 'sales on Superhive' }
  - { value: '2.21', label: 'current version' }
highlights:
  - Engineered a dynamic clothing system with automatic weight transfer and overlap avoidance for procedural outfits.
  - Created a curve-based tool to draw crowd paths with customizable density, movement types and randomness.
  - Implemented an intelligent pathfinding system so crowd agents navigate urban environments and avoid obstacles.
  - Developed a customizable, event-triggered ragdoll physics system using Blender's Python API.
cover: ../../assets/projects/icrowds/stadium.webp
coverAlt: A packed stadium populated with iCrowds
gallery:
  - { src: ../../assets/projects/icrowds/city-street.webp, alt: 'A busy city intersection populated with iCrowds' }
  - { src: ../../assets/projects/icrowds/distribution-ui.webp, alt: 'Crowd distribution around an obstacle, with the iCrowds panel: density, minimum spacing, seed and weight-paint control' }
  - { src: ../../assets/projects/icrowds/queue-path.webp, alt: 'A queue drawn with a curve, flowing through a gate' }
  - { src: ../../assets/projects/icrowds/night-street.webp, alt: 'Pedestrians on a dark, wet city street' }
videos:
  - { id: QRKDR6zPRIY, title: 'iCrowds 2 — the ragdoll system' }
  - { id: zrHNITv1fE0, title: 'iCrowds trailer — realistic 3D crowd animation in Blender' }
  - { id: u001cFpy_Eo, title: 'Ragdoll physics: realistic falls and collisions' }
  - { id: kGtb19F2J6Q, title: 'Full tutorial: animating crowds step by step (52 min)' }
links:
  - { label: 'View on Superhive', url: 'https://superhivemarket.com/products/icrowds' }
---

## Overview

iCrowds populates scenes with people — static background crowds for stadiums, parks, streets and queues,
and animated crowds that walk along paths drawn by the artist. It ships on Superhive (formerly Blender
Market) for Blender 4.5, rendering in both Cycles and EEVEE.

## Breakdown

### Distribution

Agents are scattered over any surface with controls for density, minimum spacing and seed, and can be
painted in or out with a weight-paint mask. Obstacles are respected, so a crowd parts around them — like the
helicopter in the gallery. Stadium stands, parks, streets and queues are all built the same way.

### Paths and navigation

A curve defines where a crowd walks; density, movement type and randomness are set per path. Agents then
plan their own way through the environment and avoid obstacles instead of following the curve blindly.

### Procedural outfits

Clothing is assembled per agent. Weights are transferred from the body automatically so garments deform
with the rig, and overlapping layers are pushed apart so they don't intersect.

### Ragdolls (iCrowds 2)

Any agent can switch from animation to a physics ragdoll when an event fires, for realistic falls and
collisions. Ragdolls are customizable, and the whole system is driven through Blender's Python API.
