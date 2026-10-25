import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      role: z.string(),
      period: z.string(),
      /** Position in the work grid (1 = first). */
      order: z.number(),
      /** Wide card on the home page. */
      featured: z.boolean().default(false),
      /** `side`: shown as a compact card below the main work grid. */
      kind: z.enum(['main', 'side']).default('main'),
      /** One-line context shown on the card, e.g. why a side project exists. */
      note: z.string().optional(),
      summary: z.string(),
      tags: z.array(z.string()),
      highlights: z.array(z.string()),
      /** Optional key numbers shown on the project page, e.g. { value: '34', label: 'compute shaders' }. */
      stats: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
      /** Optional render. Path is relative to the .md file, e.g. ../../assets/projects/icars/cover.jpg */
      cover: image().optional(),
      coverAlt: z.string().optional(),
      /** Images with captions; `alt` doubles as the caption. `wide` spans the full content width. */
      gallery: z.array(z.object({ src: image(), alt: z.string(), wide: z.boolean().default(false) })).optional(),
      /** YouTube videos: `id` is the part after watch?v= */
      videos: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
      links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
    }),
});

export const collections = { projects };
