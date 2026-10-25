// Compose the technical figures for the Terrain Engine project page from raw exports.
//   node te_figures.mjs <projectDir> <figDir (te_figures.py)> <exportDir (te_export.py, for ALPINE data maps)> <outDir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [, , projectDir, figDir, exportDir, outDir] = process.argv;
const require = createRequire(path.resolve(projectDir, 'package.json'));
const sharp = require('sharp');
fs.mkdirSync(outDir, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(figDir, 'figures.json'), 'utf8'));

const PAPER = [0.965, 0.96, 0.945];
const HEIGHT_SCALE = 0.225; // Alpine: 45 m of relief over a 200 m tile
const c01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (e0, e1, x) => { const t = c01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function read(dir, name) {
  const b = fs.readFileSync(path.join(dir, `${name}.f32`));
  const a = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  return { a, n: Math.round(Math.sqrt(a.length)) };
}
function range(a) {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

// hypsometric tint: valley green -> beige -> rock -> snow
const STOPS = [[0, [0.78, 0.83, 0.72]], [0.3, [0.86, 0.84, 0.72]], [0.55, [0.8, 0.74, 0.62]], [0.78, [0.66, 0.62, 0.58]], [0.92, [0.9, 0.9, 0.89]], [1, [0.98, 0.98, 0.98]]];
function tint(t) {
  for (let i = 1; i < STOPS.length; i++)
    if (t <= STOPS[i][0]) return mix(STOPS[i - 1][1], STOPS[i][1], (t - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0]));
  return STOPS[STOPS.length - 1][1];
}

// hillshade, sun from the north-west at 40°
const L = (() => { const az = (315 * Math.PI) / 180, alt = (40 * Math.PI) / 180; return [Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)]; })();
function hillshade({ a, n }, exaggeration = 1.6) {
  const out = new Float32Array(n * n);
  const k = HEIGHT_SCALE * (n - 1) * 0.5 * exaggeration;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (a[y * n + Math.min(x + 1, n - 1)] - a[y * n + Math.max(x - 1, 0)]) * k;
      const dz = (a[Math.min(y + 1, n - 1) * n + x] - a[Math.max(y - 1, 0) * n + x]) * k;
      const inv = 1 / Math.hypot(dx, 1, dz);
      out[y * n + x] = c01((-dx * L[0] + L[1] - dz * L[2]) * inv);
    }
  return out;
}

/** Shaded relief: tint × hillshade, optional contour lines and flow overlay. */
function relief(h, { contours = 0, flow = null, lohi = range(h.a) } = {}) {
  const { a, n } = h;
  const [lo, hi] = lohi;
  const shade = hillshade(h);
  return (i) => {
    const t = c01((a[i] - lo) / (hi - lo));
    let c = tint(t).map((v) => v * (0.38 + 0.72 * shade[i]));
    if (contours) {
      const x = i % n, y = (i / n) | 0;
      const band = (j) => Math.floor(((a[j] - lo) / (hi - lo)) * contours);
      const b = band(i);
      const edge = (x + 1 < n && band(i + 1) !== b) || (y + 1 < n && band(i + n) !== b);
      if (edge) c = c.map((v) => v * (b % 5 === 0 ? 0.62 : 0.8));
    }
    if (flow) c = mix(c, [0.1, 0.36, 0.78], smooth(0.5, 0.85, Math.pow(flow.a[i], 0.7)) * 0.85);
    return c;
  };
}

async function raster(n, fn, size) {
  const buf = Buffer.alloc(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    const c = fn(i);
    buf[i * 3] = Math.round(c01(c[0]) * 255);
    buf[i * 3 + 1] = Math.round(c01(c[1]) * 255);
    buf[i * 3 + 2] = Math.round(c01(c[2]) * 255);
  }
  let img = sharp(buf, { raw: { width: n, height: n, channels: 3 } });
  if (size && size !== n) img = img.resize(size, size, { kernel: 'lanczos3' });
  return img.png().toBuffer();
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function label(text, sub = '') {
  const w = Math.max(text.length * 13 + 28, sub ? sub.length * 11 + 28 : 0);
  const h = sub ? 62 : 40;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" rx="9" fill="#ffffff" fill-opacity="0.92"/>
    <text x="14" y="27" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600" fill="#15171a">${esc(text)}</text>
    ${sub ? `<text x="14" y="50" font-family="Consolas, monospace" font-size="16" fill="#b4430b">${esc(sub)}</text>` : ''}
  </svg>`);
}

/** Lay tiles out in a grid with gutters and labels, on the site's paper colour. */
async function grid(file, tiles, cols, tile, gap = 14) {
  const rows = Math.ceil(tiles.length / cols);
  const W = cols * tile + (cols + 1) * gap, H = rows * tile + (rows + 1) * gap;
  const layers = [];
  tiles.forEach((t, i) => {
    const left = gap + (i % cols) * (tile + gap), top = gap + Math.floor(i / cols) * (tile + gap);
    layers.push({ input: t.img, left, top });
    if (t.label) layers.push({ input: label(t.label, t.sub), left: left + 12, top: top + 12 });
  });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#f5f4f0' } })
    .composite(layers).webp({ quality: 90 }).toFile(path.join(outDir, file));
  console.log(file, `${W}×${H}`);
}

const TILE = 520;

// 1. Cover: 2048² Alpine, shaded relief + contours + drainage, cropped to 16:9
{
  const h = read(figDir, 'cover_height'), flow = read(figDir, 'cover_flow');
  const png = await raster(h.n, relief(h, { contours: 28, flow }));
  const crop = Math.round(h.n * 9 / 16);
  await sharp(png).extract({ left: 0, top: Math.round((h.n - crop) / 2), width: h.n, height: crop })
    .resize(1920, 1080).webp({ quality: 90 }).toFile(path.join(outDir, 'cover.webp'));
  console.log('cover.webp');
}

// 2. Layer-by-layer progression of the Alpine stack (timings are incremental thanks to the layer cache)
{
  const detail = { 0: 'Noise (ridged)', 3: 'Remap (exponent 1.5)', 4: 'Noise (detail, height mask)' };
  const tiles = [];
  for (let i = 0; i < meta.progression.length; i++) {
    const p = meta.progression[i];
    const h = read(figDir, `prog_${i}`);
    tiles.push({ img: await raster(h.n, relief(h, { lohi: range(h.a) }), TILE), label: `${i + 1} · ${detail[i] ?? p.layer}`, sub: `+${p.seconds.toFixed(2)} s` });
  }
  await grid('progression.webp', tiles, 3, TILE);
}

// 3. One base terrain, three hydraulic models (relief + flow)
{
  const names = [['base', 'Base terrain'], ['droplet', 'Droplet erosion'], ['pipe', 'Shallow-water pipe'], ['stream', 'Stream power']];
  const tiles = [];
  for (const [key, title] of names) {
    const h = read(figDir, `model_${key}`);
    tiles.push({ img: await raster(h.n, relief(h), TILE), label: title });
  }
  for (const [key] of names) {
    const f = read(figDir, `model_${key}_flow`), h = read(figDir, `model_${key}`);
    const shade = hillshade(h);
    tiles.push({ img: await raster(f.n, (i) => mix(PAPER.map((v) => v * (0.8 + 0.2 * shade[i])), [0.05, 0.3, 0.8], c01(Math.pow(f.a[i], 0.8) * 1.4)), TILE), label: 'Flow' });
  }
  await grid('erosion-models.webp', tiles, 4, TILE);
}

// 4. Resolution independence: full tile + 4× zoom of the centre at each grid size
{
  const grids = [256, 512, 1024, 2048];
  const tiles = [];
  for (const g of grids) {
    const h = read(figDir, `res_${g}`);
    tiles.push({ img: await raster(h.n, relief(h), TILE), label: `${g}²`, sub: `${meta.resolution[g].seconds.toFixed(2)} s` });
  }
  for (const g of grids) {
    const h = read(figDir, `res_${g}`);
    const png = await raster(h.n, relief(h));
    const c = Math.round(h.n / 4);
    tiles.push({ img: await sharp(png).extract({ left: Math.round(h.n * 0.42), top: Math.round(h.n * 0.38), width: c, height: c }).resize(TILE, TILE, { kernel: 'nearest' }).png().toBuffer(), label: '4× detail' });
  }
  await grid('resolution.webp', tiles, 4, TILE);
}

// 5. Data maps of the Alpine preset (from te_export.py)
{
  const h = read(exportDir, 'ALPINE_height');
  const shade = hillshade(h);
  const [lo, hi] = range(h.a);
  const m = (name) => read(exportDir, `ALPINE_${name}`).a;
  const slope = m('dm_slope'), curv = m('dm_curvature'), flow = m('dm_flow'), wear = m('erosion_map'), dep = m('deposition_map'), occ = m('dm_occlusion');
  const [clo, chi] = range(curv);
  const cmid = curv.reduce((s, v) => s + v, 0) / curv.length;
  const cspan = Math.max(cmid - clo, chi - cmid) * 0.7;
  const paper = (i, k = 0.2) => PAPER.map((v) => v * (1 - k + k * shade[i]));
  const maps = [
    ['Height', (i) => { const t = (h.a[i] - lo) / (hi - lo); return [t, t, t]; }],
    ['Slope', (i) => mix([0.98, 0.97, 0.95], [0.55, 0.2, 0.08], c01(slope[i] * 1.3))],
    ['Curvature', (i) => { const d = c01(Math.abs(curv[i] - cmid) / cspan); return mix(PAPER, curv[i] > cmid ? [0.85, 0.3, 0.1] : [0.1, 0.35, 0.8], d); }],
    ['Flow', (i) => mix(paper(i), [0.05, 0.3, 0.8], c01(Math.pow(flow[i], 0.8) * 1.4))],
    ['Wear / deposit', (i) => mix(mix(paper(i, 0.28), [0.9, 0.3, 0.05], c01((wear[i] - 0.25) * 1.6)), [0.08, 0.4, 0.9], c01((dep[i] - 0.2) * 1.6))],
    ['Occlusion', (i) => [0.15 + 0.85 * occ[i], 0.15 + 0.85 * occ[i], 0.15 + 0.85 * occ[i]]],
  ];
  const tiles = [];
  for (const [title, fn] of maps) tiles.push({ img: await raster(h.n, fn, TILE), label: title });
  await grid('data-maps.webp', tiles, 3, TILE);
}

// 6. Color bake before / after the simulation layers
{
  const h = read(exportDir, 'ALPINE_height'), hb = read(exportDir, 'ALPINE_height_before');
  const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const bake = (name, hh) => {
    const b = fs.readFileSync(path.join(exportDir, `${name}.f32`));
    const col = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    const shade = hillshade(hh);
    return (i) => [0, 1, 2].map((c) => toSrgb(c01(col[i * 4 + c])) * (0.45 + 0.65 * shade[i]));
  };
  const big = 780;
  await grid('before-after.webp', [
    { img: await raster(hb.n, bake('ALPINE_color_before', hb), big), label: 'Before simulation layers' },
    { img: await raster(h.n, bake('ALPINE_color', h), big), label: 'After stream power, droplet, thermal' },
  ], 2, big);
}
