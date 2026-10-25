# Aaws Oday — Portfolio

Personal portfolio built with [Astro](https://astro.build) and [Three.js](https://threejs.org).
The home page hero is a live, in-browser port of the droplet erosion from **Terrain Engine**
(my GPU terrain add-on for Blender), with Shaded / Flow / Wear data-map views.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Add `?still` to the URL (e.g. `http://localhost:4321/?still`) to skip the erosion animation and
show the finished terrain immediately — handy for screenshots.

## Where to edit things

| What | File |
|---|---|
| Name, email, location, social links (empty `''` hides a link) | `src/data/site.ts` |
| Focus areas, experience, skills | `src/data/site.ts` |
| Projects (one Markdown file each) | `src/content/projects/*.md` |
| Hero text | `src/components/Hero.astro` |
| About text | `src/components/About.astro` |
| Colors and fonts | `src/styles/global.css` (the `:root` block) |
| Erosion hero (terrain stack, erosion parameters, shader) | `src/scripts/terrain.ts` |

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

### Adding renders

Put images in `src/assets/projects/<project-name>/` and reference them from the project's
frontmatter (`cover:` and `gallery:`). Astro converts them to optimized, responsive WebP at build time,
so you can drop in full-size renders.

## Deploy (free) on GitHub Pages

1. Create a **public** repository named **`aaws424.github.io`** on GitHub.
   (Any other name also works: then add `base: '/<repo-name>'` in `astro.config.mjs`.)
2. Push this folder to the `main` branch:
   ```sh
   git init
   git add .
   git commit -m "Portfolio"
   git branch -M main
   git remote add origin https://github.com/aaws424/aaws424.github.io.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Every push to `main` now rebuilds and publishes the site at **https://aaws424.github.io**
   (see the **Actions** tab for progress).

A custom domain can be added later under Settings → Pages; put the domain in `public/CNAME`
and change `site` in `astro.config.mjs`.
