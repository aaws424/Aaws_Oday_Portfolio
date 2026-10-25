---
title: iCars
role: Blender Add-on Developer & Designer
period: Winter 2025
order: 3
summary: Traffic simulation, car rigging and crash physics for Blender — real-time urban traffic synchronized with iCity, drifting with dynamic tire marks, and a custom vehicle physics model.
tags: [Python, Blender API, Vehicle physics, Traffic simulation]
stats:
  - { value: '300+', label: 'sales on Superhive' }
  - { value: '700+', label: 'downloads' }
highlights:
  - Designed iCars, a Blender add-on featuring real-time urban traffic synchronized with iCity.
  - Developed a vehicle animation system for realistic drifting and dynamic tire marks.
  - Built a custom Python physics system to precisely control vehicle weight, suspension and dynamics.
cover: ../../assets/projects/icars/rain-street.webp
coverAlt: A double-decker bus and a sports car on a wet city street
gallery:
  - { src: ../../assets/projects/icars/aerial-traffic.webp, alt: 'City-scale traffic simulation, seen from above' }
  - { src: ../../assets/projects/icars/lane-debug.webp, alt: 'Vehicles following lane markers in the traffic debug view' }
  - { src: ../../assets/projects/icars/rig-controls.webp, alt: 'Vehicle rig with steering and wheel controls' }
  - { src: ../../assets/projects/icars/vehicle-lineup.webp, alt: 'The rigged vehicle library' }
videos:
  - { id: -u5-2Ciz9RQ, title: 'iCars 2 — smoke, rigging and traffic' }
  - { id: cBFsK-0L3eo, title: 'Cinematic traffic simulation, synchronized with iCity' }
  - { id: t1Fe5QZlaOk, title: 'iCars Free: curve-controlled driving, drift, speed and ghost preview' }
  - { id: lBhfQFehh-U, title: 'Cinematic crash VFX without keyframes' }
links:
  - { label: 'View on Superhive', url: 'https://superhivemarket.com/products/icars' }
---

## Overview

iCars fills iCity's streets with traffic and gives artists drivable, physically believable cars. It is sold
on Superhive as a full bundle or as separate Vehicles, Animation and Traffic packs, plus a free edition.

## Breakdown

### Traffic

Vehicles follow the lanes of an iCity street network in real time, so a generated city comes with traffic
already flowing through its intersections. A debug view shows lanes and directions while setting it up.

### Vehicle physics

A custom physics model written in Python controls weight, suspension and handling precisely, and crash
animations can be produced without keyframing (see the crash VFX video).

### Driving and drifting

Cars can be driven along a curve with speed control and a ghost preview of the path; the animation system
handles drifting and lays down tire marks dynamically as the car slides.

### Rigging

Any car model can be rigged with steering and wheel controls and added to the vehicle browser alongside the
built-in library.
