---
title: iCrowds
role: Blender Add-on Developer & Designer
period: Winter 2026
order: 3
summary: Crowd simulation for Blender — procedural outfits, path-drawn crowds, obstacle-aware navigation and event-triggered ragdolls.
tags: [Python, Blender API, Pathfinding, Ragdoll physics]
highlights:
  - Engineered a dynamic clothing system with automatic weight transfer and overlap avoidance for procedural outfits.
  - Created a curve-based tool to draw crowd paths with customizable density, movement types and randomness.
  - Implemented an intelligent pathfinding system so crowd agents navigate urban environments and avoid obstacles.
  - Developed a customizable, event-triggered ragdoll physics system using Blender's Python API.
# To add media: put renders in src/assets/projects/icrowds/ and uncomment:
# cover: ../../assets/projects/icrowds/cover.jpg
# coverAlt: A crowd walking through a procedural city
# youtube: VIDEO_ID
---

## Overview

iCrowds populates scenes with believable people. Artists draw a curve to define where a crowd walks and
tune its density, movement types and randomness; agents then find their own way through the environment
while avoiding obstacles. Outfits are assembled procedurally, with weights transferred automatically and
layers kept from intersecting, and any agent can switch to a ragdoll when an event is triggered.
