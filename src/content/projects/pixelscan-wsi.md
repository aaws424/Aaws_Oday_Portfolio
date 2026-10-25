---
title: PixelScan WSI
role: Software Developer
period: Summer 2026
order: 6
kind: side
note: A side project from my veterinary background
summary: Whole-slide imaging for the microscope you already have — a C++ desktop app that stitches a live camera feed into gigapixel slides, with a viewer, measurements and SVS / OME-TIFF export. Shipped on the Microsoft Store.
tags: [C++, OpenCV, libvips, Microsoft Store]
stats:
  - { value: '1,463', label: 'tiles stitched into one slide' }
  - { value: '36,832 × 37,514', label: 'pixels in that slide' }
  - { value: '11', label: 'camera driver families' }
highlights:
  - Engineered a high-performance C++ desktop application for real-time microscope feed stitching, using OpenCV and libvips for heavy image processing.
  - Managed the complete deployment lifecycle — packaging, certifying and publishing the commercial application on the Microsoft Store.
cover: ../../assets/projects/pixelscan-wsi/viewer-overview.webp
coverAlt: The PixelScan WSI slide viewer with navigator and scale bar
gallery:
  - { src: ../../assets/projects/pixelscan-wsi/live-video.webp, alt: 'Live stitching: frames are added as the slide moves, and a box shows where the camera is' }
  - { src: ../../assets/projects/pixelscan-wsi/batch-stitched.webp, alt: 'Tile folders: 1,463 microscope tiles stitched into one seamless slide' }
  - { src: ../../assets/projects/pixelscan-wsi/measure-annotate.webp, alt: 'Measure and annotate in µm; annotations save as QuPath-ready GeoJSON' }
  - { src: ../../assets/projects/pixelscan-wsi/stain-haematoxylin.webp, alt: 'Stain views: haematoxylin on its own, separated from an H&E slide' }
  - { src: ../../assets/projects/pixelscan-wsi/calibration.webp, alt: 'Per-objective calibration so every measurement is in true µm' }
  - { src: ../../assets/projects/pixelscan-wsi/export.webp, alt: 'Export to SVS, OME-TIFF or pyramidal TIFF with the file size estimated first' }
  - { src: ../../assets/projects/pixelscan-wsi/progress.webp, alt: 'Long stitching and export jobs with progress, time left and cancel' }
links:
  - { label: 'pixelscanwsi.com', url: 'https://pixelscanwsi.com' }
  - { label: 'Microsoft Store', url: 'https://apps.microsoft.com/detail/9NVD64N8L7BS' }
---

## Overview

PixelScan WSI is a side project that comes from my veterinary training. Digitising glass slides — H&E,
special stains, IHC — is everyday work in pathology teaching and research, but dedicated slide scanners cost
tens of thousands of dollars. PixelScan WSI turns a brightfield microscope, a
camera and a Windows PC into one: move the slide by hand and every frame is matched and stitched into a single
large slide, which can be viewed, measured, annotated and exported in formats that open directly in QuPath,
OpenSlide, ASAP and OMERO.

## Breakdown

### Stitching pipeline

1. **Three inputs** — a live camera, a video of the slide, or a folder of tiles (PNG, JPEG, TIFF, BMP).
2. **Registration** — feature matching, then refinement to a fraction of a pixel.
3. **Global alignment** for tile folders, so errors don't accumulate across large grids.
4. **Seamless blending** — multi-band blending hides seams; flat-field correction and exposure matching even
   out the illumination.
5. **Quality flags** for weak matches and blurry frames, with undo.

### Gigapixel on an ordinary PC

The mosaic lives on disk rather than in memory, so gigapixel scans run on normal hardware. Projects autosave
every 30 seconds with crash recovery, and long jobs report progress and time left and can be cancelled.

### Real whole-slide files

Exports are tiled pyramids — Aperio SVS with pixel size, magnification, label and macro images; OME-TIFF with
OME-XML metadata; or pyramidal TIFF — compressed as JPEG, JPEG 2000, WebP or lossless, with the file size
estimated before export. The viewer opens SVS, NDPI, MRXS, SCN, BIF and OME-TIFF, measures length, area,
perimeter and angle, and separates H&E / DAB stains with Macenko normalisation.

### Hardware support

Any USB camera with a standard Windows driver works, plus native SDKs for 11 driver families including
DirectShow, TWAIN, ToupTek, Motic, Basler pylon, Teledyne FLIR Spinnaker, IDS, Allied Vision Vimba X,
Hamamatsu DCAM, Photometrics PVCAM and Andor.

### Shipping

The full release cycle for a commercial Windows app: packaging, Microsoft Store certification and
publishing, with a 14-day free trial followed by a one-time purchase.
