# Aaws Oday — Portfolio

Personal portfolio built with [Astro](https://astro.build) and [Three.js](https://threejs.org).
The home page hero renders real output of **Terrain Engine** (my GPU terrain add-on for Blender):
six presets exported headless from Blender, with a before → after erosion slider and
Color / Flow / Erosion / Clay views of the add-on's data maps.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # production build into dist/
npm run preview    # serve the production build
```

The dev site lives at `http://localhost:4321/Aaws_Oday_Portfolio/`. Hero URL options:
`?still` (no animation — finished terrain, for screenshots), `?preset=island` (any preset key in
`src/data/terrain-presets.json`) and `?mode=flow` (`color`, `flow`, `erosion`, `clay`).

## Where to edit things

| What | File |
|---|---|
| Name, email, location, social links (empty `''` hides a link) | `src/data/site.ts` |
| Focus areas, experience, skills | `src/data/site.ts` |
| Projects (one Markdown file each) | `src/content/projects/*.md` |
| Hero text and viewer controls | `src/components/Hero.astro` |
| About text | `src/components/About.astro` |
| Your photo (optional) | put it at `src/assets/me.jpg` (or `.png` / `.webp`) — it appears in About |
| Colors and fonts | `src/styles/global.css` (the `:root` block) |
| Terrain viewer (shaders, lighting, camera) | `src/scripts/terrain.ts` |
| Terrain presets shown in the hero | `public/terrain/<preset>/` + `src/data/terrain-presets.json` |
| Link-preview image | `public/og.jpg` (1200 × 630) |

### Adding a project

Create `src/content/projects/my-project.md`:

```md
---
title: My Project
role: Technical Artist
period: Spring 2027
order: 7            # position in the work grid
featured: false     # true = full-width card
summary: One or two sentences shown on the card.
tags: [Blender, Geometry Nodes]
highlights:
  - What you built and why it matters.
cover: ../../assets/projects/my-project/cover.jpg   # optional
coverAlt: Describe the image
youtube: dQw4w9WgXcQ                                 # optional video id
links:
  - { label: 'Superhive', url: 'https://...' }
---

Longer write-up in Markdown.
```

Until a project has a `cover`, the site draws a generated topographic placeholder for it.

Each project's frontmatter also takes `stats` (key numbers), `gallery` (images; `alt` is the caption),
`videos` (YouTube `id` + `title`; shown as click-to-play thumbnails) and `links`.

### Updating the hero terrains from Terrain Engine

The hero shows real add-on output. To regenerate it (e.g. after changing the add-on or picking other presets),
with the add-on installed and enabled in Blender:

```sh
# 1. generate + export (and render Cycles shots) headless — does not touch any open Blender session
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python tools/terrain-engine/te_export.py -- C:/tmp/te_out 1024 1 ALPINE SWISS_ALPS DESERT_CANYON ISLAND BADLANDS CANYON
# 2. convert to web textures + src/data/terrain-presets.json
node tools/terrain-engine/te_to_web.mjs . C:/tmp/te_out public/terrain src/data/terrain-presets.json ALPINE SWISS_ALPS DESERT_CANYON ISLAND BADLANDS CANYON
```

Preset keys are the ones in the add-on's `presets.py`. The first preset in the list is the one shown on load.

### Adding renders

Put images in `src/assets/projects/<project-name>/` and reference them from the project's
frontmatter (`cover:` and `gallery:`). Astro converts them to optimized, responsive WebP at build time,
so you can drop in full-size renders.

## Deploy (free) on GitHub Pages

The site deploys from [github.com/aaws424/Aaws_Oday_Portfolio](https://github.com/aaws424/Aaws_Oday_Portfolio)
to **https://aaws424.github.io/Aaws_Oday_Portfolio/**.

1. One-time: on GitHub, **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Every push to `main` rebuilds and publishes the site (see the **Actions** tab for progress):
   ```sh
   git add .
   git commit -m "Describe the change"
   git push
   ```

`base: '/Aaws_Oday_Portfolio'` in `astro.config.mjs` must match the repo name exactly. Internal links
use `withBase()` from `src/lib/url.ts`, so they keep working if the base changes.

**Shorter URL:** rename the repo to `aaws424.github.io` and remove `base` from `astro.config.mjs`;
the site then lives at https://aaws424.github.io. A custom domain can be added under
Settings → Pages; put the domain in `public/CNAME`, set `site` to it and remove `base`.
