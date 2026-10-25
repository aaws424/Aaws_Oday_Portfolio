/**
 * Live hero: a browser port of Terrain Engine (Aaws Oday's GPU terrain add-on for Blender).
 *
 * The layer stack mirrors the add-on's "Volcanic Island" preset —
 *   NOISE (ridged multifractal) -> DOMAIN_WARP -> NORMALIZE -> REMAP -> ISLAND_MASK -> HYDRAULIC
 * and the droplet erosion is a line-by-line port of `shaders/erosion_compute.glsl`, including
 * its 512-reference-grid resolution independence and the flow / wear / deposit data maps.
 * The add-on runs this as a compute shader on thousands of droplets in parallel; here the
 * droplets run in batches on the CPU so visitors can watch the terrain being carved.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';

/* ------------------------------------------------------------------ */
/*  Hashing + gradient noise                                            */
/* ------------------------------------------------------------------ */

/** Same integer hash as the add-on's GLSL `hash_u` (uint32 arithmetic). */
function hashU(seed: number) {
  seed = (seed ^ 61 ^ (seed >>> 16)) >>> 0;
  seed = Math.imul(seed, 9) >>> 0;
  seed = (seed ^ (seed >>> 4)) >>> 0;
  seed = Math.imul(seed, 0x27d4eb2d) >>> 0;
  return (seed ^ (seed >>> 15)) >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function createNoise2D(rand: () => number) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };

  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

/* ------------------------------------------------------------------ */
/*  Base terrain (generator + shaping layers)                           */
/* ------------------------------------------------------------------ */

const STACK = {
  noiseScale: 1.9,
  octaves: 7,
  persistence: 0.5,
  lacunarity: 2.0,
  warpStrength: 0.2,
  warpScale: 1.4,
  remapExponent: 1.25,
  islandRadius: 1.0,
  islandSmoothness: 0.55,
};

export function generateHeightmap(size: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const noise = createNoise2D(rand);
  const warp = createNoise2D(rand);
  const ox = rand() * 256;
  const oy = rand() * 256;
  const S = STACK;
  const map = new Float32Array(size * size);
  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let u = x / (size - 1);
      let v = y / (size - 1);

      // DOMAIN_WARP
      u += warp(u * S.warpScale + ox, v * S.warpScale + oy) * S.warpStrength;
      v += warp(u * S.warpScale + oy + 17.3, v * S.warpScale + ox + 9.1) * S.warpStrength;

      // NOISE / RIDGED — Musgrave ridged multifractal, as in noise_compute.glsl:
      // each octave is weighted by the previous signal, so only ridges get detail.
      let frequency = S.noiseScale;
      let amplitude = 1;
      let weight = 1;
      let total = 0;
      let maxVal = 0;
      for (let o = 0; o < S.octaves; o++) {
        let signal = 1 - Math.abs(noise(u * frequency + ox, v * frequency + oy));
        signal *= signal;
        signal *= weight;
        weight = clamp(signal * 2, 0, 1);
        total += signal * amplitude;
        maxVal += amplitude;
        amplitude *= S.persistence;
        frequency *= S.lacunarity;
      }
      const h = total / maxVal - 0.5;
      map[y * size + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  const range = max - min || 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // NORMALIZE -> REMAP (exponent). Clamp: the float32 store can round a cell just below
      // the float64 minimum, and pow() of a tiny negative is NaN (which erosion would spread).
      let h = Math.pow(Math.max(0, (map[i] - min) / range), S.remapExponent);
      // ISLAND_MASK (radial)
      const d = Math.hypot((x / (size - 1)) * 2 - 1, (y / (size - 1)) * 2 - 1);
      h *= 1 - smoothstep(S.islandRadius - S.islandSmoothness, S.islandRadius, d);
      map[i] = h;
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  HYDRAULIC — droplet erosion (port of erosion_compute.glsl)          */
/* ------------------------------------------------------------------ */

const HYDRAULIC = {
  numDroplets: 320000, // at the 512 reference grid
  dropletLifetime: 35, // at the 512 reference grid
  inertia: 0.05,
  sedimentCapacityFactor: 4,
  minSedimentCapacity: 0.01,
  erodeSpeed: 0.3,
  depositSpeed: 0.3,
  evaporateSpeed: 0.02,
  gravity: 4,
  erosionRadius: 3, // reference cells; >1 uses the brush instead of the 2x2 bilinear footprint
};

export class DropletErosion {
  /** Accumulated data maps, as the add-on writes them for masks and the color bake. */
  readonly flow: Float32Array;
  readonly wear: Float32Array;
  readonly deposit: Float32Array;
  readonly numDroplets: number;

  private lifetime: number;
  private gradScale: number;
  private resolutionScale: number;
  private evaporate: number;
  private inertia: number;
  private brushRadius: number;
  private brushW: Float32Array;
  private next = 0;
  // scratch outputs of sample()
  private h = 0;
  private gx = 0;
  private gy = 0;

  constructor(private map: Float32Array, private size: number, private seed: number) {
    const P = HYDRAULIC;
    // Resolution independence: parameters are defined at a 512 grid; a cell here is 512/N
    // reference cells, so droplets live longer, slopes are rescaled and each visit erodes less.
    const res = size / 512;
    this.numDroplets = Math.max(1, Math.round(P.numDroplets * res * res));
    this.lifetime = Math.max(1, Math.round(P.dropletLifetime * res));
    this.gradScale = res;
    this.resolutionScale = 1 / res;
    this.evaporate = 1 - Math.pow(1 - P.evaporateSpeed, 1 / res);
    this.inertia = P.inertia > 0 ? Math.pow(P.inertia, 1 / res) : 0;
    this.brushRadius = Math.min(4, Math.max(1, Math.round(P.erosionRadius * res)));

    const r = this.brushRadius;
    const side = r * 2 + 1;
    this.brushW = new Float32Array(side * side);
    let total = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const w = Math.max(0, 1 - Math.hypot(dx, dy) / r);
        this.brushW[(dy + r) * side + dx + r] = w;
        total += w;
      }
    }
    for (let i = 0; i < this.brushW.length; i++) this.brushW[i] /= total;

    const n = size * size;
    this.flow = new Float32Array(n);
    this.wear = new Float32Array(n);
    this.deposit = new Float32Array(n);
  }

  get done() {
    return this.next;
  }

  /** get_hg(): bilinear height and gradient. */
  private sample(px: number, py: number) {
    const { map, size } = this;
    const cx = clamp(Math.floor(px), 0, size - 2);
    const cy = clamp(Math.floor(py), 0, size - 2);
    const u = px - cx;
    const v = py - cy;
    const i = cy * size + cx;
    const h00 = map[i];
    const h10 = map[i + 1];
    const h01 = map[i + size];
    const h11 = map[i + size + 1];
    this.gx = lerp(h10 - h00, h11 - h01, v);
    this.gy = lerp(h01 - h00, h11 - h10, u);
    this.h = lerp(lerp(h00, h10, u), lerp(h01, h11, u), v);
  }

  private bilinear(px: number, py: number, amount: number) {
    const { map, size } = this;
    const cx = clamp(Math.floor(px), 0, size - 2);
    const cy = clamp(Math.floor(py), 0, size - 2);
    const u = px - cx;
    const v = py - cy;
    const i = cy * size + cx;
    map[i] += amount * (1 - u) * (1 - v);
    map[i + 1] += amount * u * (1 - v);
    map[i + size] += amount * (1 - u) * v;
    map[i + size + 1] += amount * u * v;
  }

  /** apply_brush_erode(): spread removal over a disc with linear falloff. */
  private brushErode(px: number, py: number, amount: number) {
    const { map, size, brushW } = this;
    const r = this.brushRadius;
    const side = r * 2 + 1;
    const cx = clamp(Math.round(px), 0, size - 1);
    const cy = clamp(Math.round(py), 0, size - 1);
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= size) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const w = brushW[(dy + r) * side + dx + r];
        if (w <= 0 || x < 0 || x >= size) continue;
        map[y * size + x] -= amount * w;
      }
    }
  }

  /** Simulate the next `count` droplets (one compute dispatch worth in the add-on). */
  run(count: number) {
    const { size } = this;
    const P = HYDRAULIC;
    const end = Math.min(this.next + count, this.numDroplets);

    for (let id = this.next; id < end; id++) {
      let s = hashU((Math.imul(id, 7919) + Math.imul(this.seed, 1999)) >>> 0);
      s = hashU(s);
      let px = (s / 4294967295) * (size - 4) + 2;
      s = hashU(s);
      let py = (s / 4294967295) * (size - 4) + 2;

      let dirX = 0;
      let dirY = 0;
      let speed = 1;
      let water = 1;
      let sediment = 0;

      for (let step = 0; step < this.lifetime; step++) {
        this.sample(px, py);
        const hOld = this.h;
        // slopes measured per 512-reference cell so behaviour does not change with grid size
        const gx = this.gx * this.gradScale;
        const gy = this.gy * this.gradScale;

        dirX = dirX * this.inertia - gx * (1 - this.inertia);
        dirY = dirY * this.inertia - gy * (1 - this.inertia);
        const len = Math.hypot(dirX, dirY);
        if (len > 1e-6) {
          dirX /= len;
          dirY /= len;
        } else {
          s = hashU(s);
          const angle = (s / 4294967295) * 6.283185;
          dirX = Math.cos(angle);
          dirY = Math.sin(angle);
        }

        const nx = px + dirX;
        const ny = py + dirY;
        const cell = clamp(Math.floor(py), 0, size - 1) * size + clamp(Math.floor(px), 0, size - 1);
        this.flow[cell] += water;

        if (nx < 1.5 || nx >= size - 1.5 || ny < 1.5 || ny >= size - 1.5) break;

        this.sample(nx, ny);
        const deltaH = this.h - hOld;
        const dhRef = deltaH * this.gradScale;

        const effectiveSpeed = Math.max(speed, 0.1);
        let c = Math.max(-dhRef * effectiveSpeed, P.minSedimentCapacity) * water * P.sedimentCapacityFactor;
        c = Math.min(c, 0.05);

        if (sediment > c || deltaH > 0) {
          let amount = deltaH > 0 ? Math.min(sediment, deltaH) : (sediment - c) * P.depositSpeed;
          amount = Math.min(amount * this.resolutionScale, 0.01 * this.resolutionScale);
          sediment -= amount;
          this.bilinear(px, py, amount);
          this.deposit[cell] += amount;
        } else {
          let amount = (c - sediment) * P.erodeSpeed;
          if (deltaH < 0) amount = Math.min(amount, -deltaH);
          amount = Math.min(amount * this.resolutionScale, 0.01 * this.resolutionScale);
          sediment += amount;
          if (this.brushRadius > 1) this.brushErode(px, py, amount);
          else this.bilinear(px, py, -amount);
          this.wear[cell] += amount;
        }

        speed = Math.min(Math.sqrt(Math.max(0.01, speed * speed - deltaH * P.gravity)), 10);
        water *= 1 - this.evaporate;
        px = nx;
        py = ny;
      }
    }
    this.next = end;
  }
}

/* ------------------------------------------------------------------ */
/*  Shaders                                                             */
/* ------------------------------------------------------------------ */

const vertexShader = /* glsl */ `
  attribute vec3 aMaps; // flow, wear, deposit (0..1)
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vMaps;

  void main() {
    vPos = position;
    vNormal = normal;
    vMaps = aMaps;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uRock;
  uniform vec3 uSediment;
  uniform vec3 uAccent;
  uniform vec3 uFlow;
  uniform vec3 uDepositHi;
  uniform vec3 uContour;
  uniform vec3 uBg;
  uniform vec3 uLightDir;
  uniform float uHeight;
  uniform float uRadius;
  uniform float uContours;
  uniform int uMode; // 0 shaded, 1 flow, 2 wear / deposit

  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vMaps;

  void main() {
    vec3 n = normalize(vNormal);
    float h = clamp(vPos.y / uHeight, 0.0, 1.0);
    float slope = 1.0 - n.y;
    float flow = vMaps.x;
    float wear = vMaps.y;
    float dep = vMaps.z;

    vec3 col = mix(uLow, uHigh, smoothstep(0.0, 0.75, h));
    col = mix(col, uRock, smoothstep(0.05, 0.3, slope));
    col = mix(col, uSediment, dep * 0.7);

    float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
    float ambient = 0.08 + 0.08 * n.y;
    vec3 lit = col * (ambient + diffuse * 1.6);

    if (uMode == 0) {
      // gullies carved by the droplets glow in the accent colour
      lit += uAccent * wear * 0.35;
      // faint topographic contours (skipped on the flat sea floor, where fwidth is 0)
      float c = h * uContours;
      float fw = max(fwidth(c), 1e-4);
      float line = 1.0 - smoothstep(0.0, fw * 1.2, abs(fract(c - 0.5) - 0.5));
      lit = mix(lit, uContour, line * 0.1 * smoothstep(0.01, 0.05, h));
    } else if (uMode == 1) {
      lit = lit * 0.3 + uFlow * pow(flow, 1.6) * 1.6;
    } else {
      lit = lit * 0.32 + uAccent * wear * 1.1 + uDepositHi * dep * 0.9;
    }

    // dissolve the tile edges into the page background
    float r = length(vPos.xz) / uRadius;
    float fade = 1.0 - smoothstep(0.62, 1.0, r);
    gl_FragColor = vec4(mix(uBg, lit, fade), 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/*  Scene                                                               */
/* ------------------------------------------------------------------ */

export type ViewMode = 'shaded' | 'flow' | 'wear';
const MODE_INDEX: Record<ViewMode, number> = { shaded: 0, flow: 1, wear: 2 };

export interface TerrainHud {
  droplets?: HTMLElement | null;
  total?: HTMLElement | null;
  grid?: HTMLElement | null;
  seed?: HTMLElement | null;
  progress?: HTMLElement | null;
  reseed?: HTMLButtonElement | null;
  modes?: NodeListOf<HTMLButtonElement> | HTMLButtonElement[];
}

export function initTerrain(canvas: HTMLCanvasElement, hud: TerrainHud = {}) {
  // With reduced motion (or ?still in the URL) the erosion is finished up front (~0.1 s)
  // and the camera does not drift.
  const reduceMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');
  const compact = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
  const N = compact ? 160 : 256;
  const WIDTH = 10;
  const HEIGHT = 2.1;
  const FRAMES = 360; // how long the erosion takes to play out

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);

  // Grid mesh: vertex i <-> heightmap cell i.
  const count = N * N;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const maps = new Float32Array(count * 3);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      positions[i * 3] = (x / (N - 1) - 0.5) * WIDTH;
      positions[i * 3 + 2] = (y / (N - 1) - 0.5) * WIDTH;
    }
  }
  const indices = new Uint32Array((N - 1) * (N - 1) * 6);
  let k = 0;
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      const i = y * N + x;
      indices[k++] = i;
      indices[k++] = i + N;
      indices[k++] = i + 1;
      indices[k++] = i + 1;
      indices[k++] = i + N;
      indices[k++] = i + N + 1;
    }
  }
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(positions, 3);
  const norAttr = new BufferAttribute(normals, 3);
  const mapAttr = new BufferAttribute(maps, 3);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', norAttr);
  geometry.setAttribute('aMaps', mapAttr);
  geometry.setIndex(new BufferAttribute(indices, 1));

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uLow: { value: new Color('#12171b') },
      uHigh: { value: new Color('#454e4a') },
      uRock: { value: new Color('#5f5a55') },
      uSediment: { value: new Color('#7a7466') },
      uAccent: { value: new Color('#ff7a3d') },
      uFlow: { value: new Color('#7fd8ff') },
      uDepositHi: { value: new Color('#5aa6ff') },
      uContour: { value: new Color('#d8dde3') },
      uBg: { value: new Color('#0a0c0f') },
      uLightDir: { value: new Vector3(-0.55, 0.7, 0.35) },
      uHeight: { value: HEIGHT },
      uRadius: { value: WIDTH * 0.5 },
      uContours: { value: 16 },
      uMode: { value: 0 },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let map = new Float32Array(count);
  let erosion = new DropletErosion(map, N, 0);
  let perFrame = 1;

  /** Mean of the non-zero cells, used to normalize a data map for display. */
  function meanNonZero(a: Float32Array) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] > 0) {
        sum += a[i];
        n++;
      }
    }
    return n ? sum / n : 1;
  }

  function syncGeometry() {
    const cell = WIDTH / (N - 1);
    const s = HEIGHT / (2 * cell);
    // Normalize against a multiple of the mean so only the strongest channels saturate.
    const flowNorm = 1 / Math.log1p(meanNonZero(erosion.flow) * 12);
    const wearNorm = 1 / (meanNonZero(erosion.wear) * 7);
    const depNorm = 1 / (meanNonZero(erosion.deposit) * 7);
    for (let y = 0; y < N; y++) {
      const up = Math.max(y - 1, 0) * N;
      const row = y * N;
      const down = Math.min(y + 1, N - 1) * N;
      for (let x = 0; x < N; x++) {
        const i = row + x;
        positions[i * 3 + 1] = map[i] * HEIGHT;
        const nx = (map[row + Math.max(x - 1, 0)] - map[row + Math.min(x + 1, N - 1)]) * s;
        const nz = (map[up + x] - map[down + x]) * s;
        const inv = 1 / Math.hypot(nx, 1, nz);
        normals[i * 3] = nx * inv;
        normals[i * 3 + 1] = inv;
        normals[i * 3 + 2] = nz * inv;
        maps[i * 3] = Math.min(Math.log1p(erosion.flow[i]) * flowNorm, 1);
        maps[i * 3 + 1] = Math.min(erosion.wear[i] * wearNorm, 1);
        maps[i * 3 + 2] = Math.min(erosion.deposit[i] * depNorm, 1);
      }
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
    mapAttr.needsUpdate = true;
  }

  const fmt = new Intl.NumberFormat('en-US');
  function updateHud() {
    if (hud.droplets) hud.droplets.textContent = fmt.format(erosion.done);
    if (hud.progress) hud.progress.style.transform = `scaleX(${erosion.done / erosion.numDroplets})`;
  }

  function reseed(seed = Math.floor(Math.random() * 0xffff)) {
    map = generateHeightmap(N, seed);
    erosion = new DropletErosion(map, N, seed);
    perFrame = Math.ceil(erosion.numDroplets / FRAMES);
    if (reduceMotion) erosion.run(erosion.numDroplets);
    syncGeometry();
    updateHud();
    if (hud.total) hud.total.textContent = fmt.format(erosion.numDroplets);
    if (hud.seed) hud.seed.textContent = `0x${seed.toString(16).padStart(4, '0')}`;
    needsRender = true;
  }

  function setMode(mode: ViewMode) {
    material.uniforms.uMode.value = MODE_INDEX[mode];
    hud.modes?.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode)));
    needsRender = true;
  }

  if (hud.grid) hud.grid.textContent = `${N} × ${N}`;

  /* ---- camera, framing and input ---- */

  let distance = 15;
  let lookY = 0.6;
  let angle = 0.9;
  let parallaxX = 0;
  let parallaxY = 0;
  let targetX = 0;
  let targetY = 0;
  let dragging = false;
  let lastX = 0;
  let needsRender = true;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const wide = w >= 900 && camera.aspect > 1.1;
    if (wide) {
      // push the terrain right so the headline has room on the left
      camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
      distance = 12.5;
      lookY = 0.4;
    } else {
      // narrow screens: back off until the whole tile fits the width
      camera.clearViewOffset();
      distance = 13 * clamp(0.95 / camera.aspect, 1, 2);
      lookY = 0;
    }
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  const onPointerMove = (e: PointerEvent) => {
    if (dragging) {
      angle -= (e.clientX - lastX) * 0.006;
      lastX = e.clientX;
      needsRender = true;
      return;
    }
    if (reduceMotion || e.pointerType !== 'mouse') return;
    targetX = e.clientX / window.innerWidth - 0.5;
    targetY = e.clientY / window.innerHeight - 0.5;
  };
  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  };
  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.classList.remove('is-dragging');
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  const onReseed = () => reseed();
  hud.reseed?.addEventListener('click', onReseed);
  const onMode = (e: Event) => setMode((e.currentTarget as HTMLButtonElement).dataset.mode as ViewMode);
  hud.modes?.forEach((btn) => btn.addEventListener('click', onMode));

  /* ---- render loop (paused when off-screen or in a background tab) ---- */

  let visible = true;
  let raf = 0;
  let last = performance.now();

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (erosion.done < erosion.numDroplets) {
      erosion.run(perFrame);
      syncGeometry();
      updateHud();
      needsRender = true;
    }

    if (!reduceMotion) {
      if (!dragging) angle += dt * 0.045;
      parallaxX += (targetX - parallaxX) * Math.min(dt * 3, 1);
      parallaxY += (targetY - parallaxY) * Math.min(dt * 3, 1);
      needsRender = true;
    }

    if (!needsRender) return;
    needsRender = false;
    const a = angle + parallaxX * 0.25;
    camera.position.set(Math.cos(a) * distance, distance * 0.5 + parallaxY * 1.5, Math.sin(a) * distance);
    camera.lookAt(0, lookY, 0);
    renderer.render(scene, camera);
  }

  function updateRunning() {
    const shouldRun = visible && !document.hidden;
    if (shouldRun && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateRunning();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', updateRunning);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  resize();
  reseed();
  setMode('shaded');
  updateRunning();

  return {
    reseed,
    setMode,
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', updateRunning);
      window.removeEventListener('pointermove', onPointerMove);
      hud.reseed?.removeEventListener('click', onReseed);
      hud.modes?.forEach((btn) => btn.removeEventListener('click', onMode));
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
