---
title: iCity 2.0 Core Backend
role: C++ Developer
period: Summer 2026
order: 2
featured: true
summary: A native C++ backend for procedural city generation — computational geometry that turns city bounds into blocks, lots and efficiently packed layouts.
tags: [C++, OpenMesh, Straight skeleton, Shape packing]
highlights:
  - Engineered a procedural city generation backend in C++, using OpenMesh to handle complex geometry processing.
  - Implemented straight skeleton algorithms for automated, math-driven urban block subdivision and lot generation.
  - Researched and integrated 2D shape packing algorithms to optimize spatial distribution within generated city bounds.
# To add media: put renders in src/assets/projects/icity-2-core/ and uncomment:
# cover: ../../assets/projects/icity-2-core/cover.jpg
# coverAlt: Procedurally subdivided city blocks
# youtube: VIDEO_ID
---

## Overview

The 2.0 core moves iCity's city generation onto a native C++ foundation built for heavy geometry work.
City bounds are split into blocks and lots with straight skeleton algorithms, so subdivision follows the
shape of each block instead of a fixed grid. 2D shape packing then distributes content inside the
generated bounds as efficiently as possible.
