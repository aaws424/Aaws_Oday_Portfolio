// Convert Terrain Engine raw exports (.f32 + manifest.json) into web textures for the hero.
//   node te_to_web.mjs <projectDir> <srcDir> <outPublicDir> <outJson> PRESET...
//
// Per preset (row 0 of every image = grid row 0):
//   height.webp, height_before.webp   512²  R,G = 16-bit height (hi, lo)        lossless
//   normal.jpg (1024²), normal_before.jpg (512²)  R = n.x, G = n.z, B = ambient occlusion  4:4:4
//   color.webp, color_before.webp    1024²  Terrain Engine color bake, sRGB
//   maps.jpg                          512²  R = flow, G = wear, B = deposit      4:4:4
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [, , projectDir, src, outDir, outJson, ...presets] = process.argv;
const require = createRequire(path.resolve(projectDir, 'package.json'));
const sharp = require('sharp');
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const GEO = 512;

const read = (name, gs, ch = 1) => {
  const buf = fs.readFileSync(path.join(src, `${name}.f32`));
  const a = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (a.length !== gs * gs * ch) throw new Error(`${name}: ${a.length} != ${gs * gs * ch}`);
  return a;
};
const has = (name) => fs.existsSync(path.join(src, `${name}.f32`));
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const byte = (x) => Math.round(clamp01(x) * 255);
const img = (buf, size) => sharp(buf, { raw: { width: size, height: size, channels: 3 } });
const JPG = { quality: 84, chromaSubsampling: '4:4:4', mozjpeg: true };

function downsample(a, gs, size) {
  const f = gs / size;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += a[(y * f + j) * gs + x * f + i];
      out[y * size + x] = s / (f * f);
    }
  return out;
}

const out = [];
for (const key of presets) {
  const m = manifest[key];
  const gs = m.grid;
  const heightScale = m.terrain_size[1] / m.terrain_size[0];
  const dir = path.join(outDir, key.toLowerCase());
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const h = read(`${key}_height`, gs);
  const hb = m.files.height_before ? read(`${key}_height_before`, gs) : h;
  let lo = Infinity, hi = -Infinity;
  for (const a of [h, hb]) for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = hi - lo || 1;
  const occ = has(`${key}_dm_occlusion`) ? read(`${key}_dm_occlusion`, gs) : null;

  const packHeight = (a) => {
    const d = downsample(a, gs, GEO);
    const b = Buffer.alloc(GEO * GEO * 3);
    for (let i = 0; i < GEO * GEO; i++) {
      const q = Math.round(clamp01((d[i] - lo) / range) * 65535);
      b[i * 3] = q >> 8;
      b[i * 3 + 1] = q & 255;
    }
    return b;
  };
  // World-space normals with the tile spanning 1 unit and height = h * heightScale.
  // Grid column -> +x, grid row -> -z (Blender Y-forward to three.js Y-up without mirroring).
  const packNormal = (a, withOcc) => {
    const b = Buffer.alloc(gs * gs * 3);
    const k = heightScale * (gs - 1) * 0.5;
    for (let y = 0; y < gs; y++)
      for (let x = 0; x < gs; x++) {
        const i = y * gs + x;
        const dhdu = (a[y * gs + Math.min(x + 1, gs - 1)] - a[y * gs + Math.max(x - 1, 0)]) * k;
        const dhdv = (a[Math.min(y + 1, gs - 1) * gs + x] - a[Math.max(y - 1, 0) * gs + x]) * k;
        const inv = 1 / Math.hypot(dhdu, 1, dhdv);
        b[i * 3] = byte(-dhdu * inv * 0.5 + 0.5);
        b[i * 3 + 1] = byte(dhdv * inv * 0.5 + 0.5);
        b[i * 3 + 2] = withOcc && occ ? byte(occ[i]) : 230;
      }
    return b;
  };
  const packColor = (a) => {
    const b = Buffer.alloc(gs * gs * 3);
    for (let i = 0; i < gs * gs; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = byte(toSrgb(clamp01(a[i * 4 + c])));
    return b;
  };
  const maps = Buffer.alloc(gs * gs * 3);
  [`${key}_dm_flow`, `${key}_erosion_map`, `${key}_deposition_map`].forEach((name, c) => {
    if (!has(name)) return;
    const a = read(name, gs);
    for (let i = 0; i < gs * gs; i++) maps[i * 3 + c] = byte(a[i]);
  });

  await img(packHeight(h), GEO).webp({ lossless: true, effort: 6 }).toFile(path.join(dir, 'height.webp'));
  await img(packHeight(hb), GEO).webp({ lossless: true, effort: 6 }).toFile(path.join(dir, 'height_before.webp'));
  await img(packNormal(h, true), gs).jpeg(JPG).toFile(path.join(dir, 'normal.jpg'));
  // the pre-erosion surface is smooth: half resolution is enough
  await img(packNormal(hb, false), gs).resize(gs / 2).jpeg(JPG).toFile(path.join(dir, 'normal_before.jpg'));
  await img(packColor(read(`${key}_color`, gs, 4)), gs).webp({ quality: 88, effort: 6 }).toFile(path.join(dir, 'color.webp'));
  const cb = m.files.color_before ? read(`${key}_color_before`, gs, 4) : read(`${key}_color`, gs, 4);
  await img(packColor(cb), gs).webp({ quality: 88, effort: 6 }).toFile(path.join(dir, 'color_before.webp'));
  await img(maps, gs).resize(gs / 2).jpeg({ ...JPG, quality: 86 }).toFile(path.join(dir, 'maps.jpg'));

  const sizes = Object.fromEntries(fs.readdirSync(dir).map((f) => [f, Math.round(fs.statSync(path.join(dir, f)).size / 1024)]));
  const total = Object.values(sizes).reduce((s, v) => s + v, 0);
  console.log(key.padEnd(14), total + ' KB', JSON.stringify(sizes));
  out.push({
    key: key.toLowerCase(),
    name: m.name,
    description: m.description,
    layers: m.layers.map(([type, name]) => ({ type, name, sim: m.before_disabled.includes(type) })),
    grid: gs,
    generateSeconds: m.generate_s,
    heightScale,
    heightRange: [lo, hi],
    seaLevel: m.sea_level > 0 ? clamp01((m.sea_level - lo) / range) : 0,
  });
}
fs.writeFileSync(outJson, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', outJson);
