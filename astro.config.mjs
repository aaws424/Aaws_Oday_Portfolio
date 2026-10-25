// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages
// - Repo named `aaws424.github.io`  -> site lives at https://aaws424.github.io (no `base` needed).
// - Repo with any other name, e.g. `portfolio` -> add `base: '/portfolio'` below.
// https://docs.astro.build/en/guides/deploy/github/
export default defineConfig({
  site: 'https://aaws424.github.io',
  integrations: [sitemap()],
});
