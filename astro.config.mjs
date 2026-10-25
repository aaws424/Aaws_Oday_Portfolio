// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages: the repo `Aaws_Oday_Portfolio` is served at https://aaws424.github.io/Aaws_Oday_Portfolio/
// `base` must match the repo name exactly (it is case-sensitive). If the repo is ever renamed to
// `aaws424.github.io`, remove `base` and the site moves to https://aaws424.github.io/.
// https://docs.astro.build/en/guides/deploy/github/
export default defineConfig({
  site: 'https://aaws424.github.io',
  base: '/Aaws_Oday_Portfolio',
  integrations: [sitemap()],
});
