/**
 * Hero viewer for real Terrain Engine output.
 *
 * Each preset was generated headless in Blender by the add-on at 1024² and exported as:
 *   height(_before).webp  16-bit heights packed into R,G (decoded exactly with texelFetch)
 *   normal(_before).jpg   world-space normal x/z + baked ambient occlusion
 *   color(_before).webp   the add-on's color bake
 *   maps.jpg              flow / wear / deposit data maps
 * "_before" is the same layer stack with the simulation layers (erosion, thermal, snow) disabled,
 * so the slider morphs between the real pre- and post-erosion terrain. The morph is driven by
 * the flow map: drainage channels carve first, ridges last.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  NoColorSpace,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import presetData from '../data/terrain-presets.json';

export type Preset = (typeof presetData)[number];
export type ViewMode = 'color' | 'flow' | 'erosion' | 'clay';
export const PRESETS: Preset[] = presetData;
const MODES: Record<ViewMode, number> = { color: 0, flow: 1, erosion: 2, clay: 3 };

const WIDTH = 10;
const GEO = 512; // size of the height textures
const SPREAD = 0.75; // how far behind the channels the ridges erode

/* ------------------------------------------------------------------ */
/*  Shaders                                                             */
/* ------------------------------------------------------------------ */

const common = /* glsl */ `
  uniform sampler2D uHeight;
  uniform sampler2D uHeightBefore;
  uniform sampler2D uMaps;
  uniform float uProgress;
  uniform float uWidth;
  uniform float uHScale;
  uniform vec2 uRange;
  uniform float uSea;

  float decodeH(vec4 t) {
    return (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / 65535.0;
  }
  float fetchH(sampler2D tex, ivec2 p) {
    return decodeH(texelFetch(tex, clamp(p, ivec2(0), ivec2(${GEO - 1})), 0));
  }
  // flow-driven erosion front: channels (high flow) erode first
  float localT(vec2 uv) {
    float flow = textureLod(uMaps, uv, 0.0).r;
    return smoothstep(0.0, 1.0, clamp(uProgress * (1.0 + ${SPREAD.toFixed(2)}) - (1.0 - flow) * ${SPREAD.toFixed(2)}, 0.0, 1.0));
  }
  float toWorldY(float hn) {
    return (uRange.x + max(hn, uSea) * (uRange.y - uRange.x)) * uHScale;
  }
`;

const vertexShader = /* glsl */ `
  ${common}
  uniform float uBase;
  attribute vec3 aSide;    // outward normal on the skirt, zero on the surface
  attribute float aBottom; // 1 on the skirt's bottom edge

  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vSide;
  varying float vT;
  varying float vH;

  float bilinearH(sampler2D tex, vec2 uv) {
    vec2 f = uv * ${(GEO - 1).toFixed(1)};
    ivec2 i = ivec2(floor(f));
    vec2 t = fract(f);
    return mix(mix(fetchH(tex, i), fetchH(tex, i + ivec2(1, 0)), t.x),
               mix(fetchH(tex, i + ivec2(0, 1)), fetchH(tex, i + ivec2(1, 1)), t.x), t.y);
  }

  void main() {
    vUv = uv;
    vT = localT(uv);
    vH = mix(bilinearH(uHeightBefore, uv), bilinearH(uHeight, uv), vT);
    float y = aBottom > 0.5 ? uBase : toWorldY(vH);
    vWorld = vec3((uv.x - 0.5) * uWidth, y, -(uv.y - 0.5) * uWidth);
    vSide = aSide;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  ${common}
  uniform sampler2D uNormal;
  uniform sampler2D uNormalBefore;
  uniform sampler2D uColor;
  uniform sampler2D uColorBefore;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uBg;
  uniform vec3 uCamPos;
  uniform vec2 uFog;
  uniform float uExposure;
  uniform int uMode;
  uniform int uShadowSteps;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vSide;
  varying float vT;
  varying float vH;

  vec3 decodeN(vec4 t) {
    vec2 xz = t.rg * 2.0 - 1.0;
    return vec3(xz.x, sqrt(max(0.0, 1.0 - dot(xz, xz))), xz.y);
  }

  float heightAt(vec2 uv) {
    ivec2 p = ivec2(uv * ${(GEO - 1).toFixed(1)} + 0.5);
    return toWorldY(mix(fetchH(uHeightBefore, p), fetchH(uHeight, p), vT));
  }

  // soft shadows by marching the heightfield towards the sun
  float softShadow(vec3 p, vec3 L) {
    float res = 1.0;
    float t = uWidth * 0.003;
    for (int i = 0; i < 48; i++) {
      if (i >= uShadowSteps) break;
      vec3 q = p + L * t;
      vec2 uv = vec2(q.x / uWidth + 0.5, -q.z / uWidth + 0.5);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float d = q.y - heightAt(uv);
      res = min(res, clamp(14.0 * d / t, 0.0, 1.0));
      if (res < 0.01) break;
      t += uWidth * 0.006 + t * 0.07;
    }
    return res;
  }

  vec3 tonemap(vec3 x) {
    x *= uExposure;
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec3 L = normalize(uSunDir);
    vec3 col;

    if (dot(vSide, vSide) > 0.25) {
      // the cut faces of the terrain block: banded soil, darker with depth
      float depth = clamp((toWorldY(0.0) - vWorld.y) / (uWidth * 0.08), 0.0, 1.0);
      float band = 0.5 + 0.5 * sin(vWorld.y * 38.0);
      vec3 soil = mix(vec3(0.30, 0.24, 0.18), vec3(0.42, 0.34, 0.26), band * 0.6);
      soil *= 1.0 - depth * 0.45;
      col = soil * (uSkyColor * 0.55 + uSunColor * max(dot(vSide, L), 0.0) * 0.6);
    } else {
      vec4 nA = texture(uNormal, vUv);
      vec3 n = normalize(mix(decodeN(texture(uNormalBefore, vUv)), decodeN(nA), vT));
      float ao = mix(0.92, nA.b * nA.b, vT);
      vec3 albedo = mix(texture(uColorBefore, vUv).rgb, texture(uColor, vUv).rgb, vT);
      bool water = uSea > 0.0 && vH < uSea;
      if (water) n = vec3(0.0, 1.0, 0.0);
      if (uMode != 0) albedo = vec3(0.72);

      float sh = softShadow(vWorld + n * uWidth * 0.0015, L);
      float diff = max(dot(n, L), 0.0);
      vec3 sky = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
      col = albedo * (uSunColor * diff * sh + sky * ao);

      if (water && uMode == 0) {
        vec3 V = normalize(uCamPos - vWorld);
        col += uSunColor * pow(max(dot(n, normalize(L + V)), 0.0), 160.0) * 0.5 * sh;
      }

      vec4 m = texture(uMaps, vUv);
      if (uMode == 1) {
        col = mix(col, vec3(0.02, 0.32, 0.95) * 1.4, smoothstep(0.03, 0.55, m.r));
      } else if (uMode == 2) {
        col = mix(col, vec3(1.0, 0.30, 0.04) * 1.3, smoothstep(0.2, 0.85, m.g) * vT);
        col = mix(col, vec3(0.05, 0.42, 1.0) * 1.2, smoothstep(0.15, 0.75, m.b) * vT);
      }
    }

    vec3 c = toSrgb(tonemap(col));
    float haze = smoothstep(uFog.x, uFog.y, length(uCamPos - vWorld)) * 0.45;
    gl_FragColor = vec4(mix(c, uBg, haze), 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/*  Geometry: N×N surface grid plus a skirt around the four edges       */
/* ------------------------------------------------------------------ */

function buildGeometry(N: number) {
  const surface = N * N;
  const edge = 4 * N * 2;
  const uv = new Float32Array((surface + edge) * 2);
  const side = new Float32Array((surface + edge) * 3);
  const bottom = new Float32Array(surface + edge);
  const index: number[] = [];

  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      uv[i * 2] = x / (N - 1);
      uv[i * 2 + 1] = y / (N - 1);
    }
  for (let y = 0; y < N - 1; y++)
    for (let x = 0; x < N - 1; x++) {
      const i = y * N + x;
      // uv.y grows towards -z, so this winding faces +y
      index.push(i, i + 1, i + N, i + 1, i + N + 1, i + N);
    }

  // Skirt walls: for each edge, a strip of (top, bottom) vertex pairs.
  const edges: { uv: (t: number) => [number, number]; n: [number, number, number] }[] = [
    { uv: (t) => [t, 0], n: [0, 0, 1] }, // uv.y = 0 -> +z side
    { uv: (t) => [1, t], n: [1, 0, 0] },
    { uv: (t) => [1 - t, 1], n: [0, 0, -1] },
    { uv: (t) => [0, 1 - t], n: [-1, 0, 0] },
  ];
  let v = surface;
  for (const e of edges) {
    const start = v;
    for (let k = 0; k < N; k++) {
      const [u, w] = e.uv(k / (N - 1));
      for (let b = 0; b < 2; b++) {
        uv[v * 2] = u;
        uv[v * 2 + 1] = w;
        side.set(e.n, v * 3);
        bottom[v] = b;
        v++;
      }
    }
    for (let k = 0; k < N - 1; k++) {
      const a = start + k * 2;
      index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array((surface + edge) * 3), 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('aSide', new BufferAttribute(side, 3));
  geometry.setAttribute('aBottom', new BufferAttribute(bottom, 1));
  geometry.setIndex(index);
  return geometry;
}

/* ------------------------------------------------------------------ */
/*  Texture loading                                                     */
/* ------------------------------------------------------------------ */

interface PresetTextures {
  height: Texture;
  heightBefore: Texture;
  normal: Texture;
  normalBefore: Texture;
  color: Texture;
  colorBefore: Texture;
  maps: Texture;
}

const loader = new TextureLoader();

async function load(url: string, kind: 'data' | 'linear' | 'srgb', anisotropy: number) {
  const tex = await loader.loadAsync(url);
  tex.flipY = false; // image row 0 = grid row 0 = uv.y 0
  tex.colorSpace = kind === 'srgb' ? SRGBColorSpace : NoColorSpace;
  if (kind === 'data') {
    tex.magFilter = tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
  } else {
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.anisotropy = anisotropy;
  }
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Viewer                                                              */
/* ------------------------------------------------------------------ */

export interface TerrainEvents {
  onPreset?: (preset: Preset) => void;
  onProgress?: (progress: number) => void;
  onLoading?: (loading: boolean) => void;
}

export function initTerrain(canvas: HTMLCanvasElement, baseUrl: string, events: TerrainEvents = {}) {
  const reduceMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');
  const compact = window.innerWidth < 768;
  const N = compact ? 256 : 512;

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 200);
  // low sun from the front-left of the starting view: long shadows that read the relief
  const sunDir = new Vector3(-0.75, 0.42, 0.35).normalize();

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    uniforms: {
      uHeight: { value: null },
      uHeightBefore: { value: null },
      uNormal: { value: null },
      uNormalBefore: { value: null },
      uColor: { value: null },
      uColorBefore: { value: null },
      uMaps: { value: null },
      uProgress: { value: 0 },
      uWidth: { value: WIDTH },
      uHScale: { value: 2 },
      uRange: { value: [0, 1] },
      uSea: { value: 0 },
      uBase: { value: -0.5 },
      uSunDir: { value: sunDir },
      uSunColor: { value: new Vector3(3.6, 3.35, 3.0) },
      uSkyColor: { value: new Vector3(0.36, 0.42, 0.52) },
      uGroundColor: { value: new Vector3(0.2, 0.18, 0.15) },
      uBg: { value: new Vector3(0.961, 0.957, 0.941) }, // #f5f4f0 (sRGB, mixed after tone mapping)
      uCamPos: { value: new Vector3() },
      uFog: { value: [14, 30] },
      uExposure: { value: 0.95 },
      uMode: { value: 0 },
      uShadowSteps: { value: compact ? 16 : 36 },
    },
  });
  const mesh = new Mesh(buildGeometry(N), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const cache = new Map<string, Promise<PresetTextures>>();
  function fetchPreset(p: Preset) {
    let pending = cache.get(p.key);
    if (!pending) {
      const dir = `${baseUrl.replace(/\/$/, '')}/terrain/${p.key}/`;
      pending = Promise.all([
        load(dir + 'height.webp', 'data', 1),
        load(dir + 'height_before.webp', 'data', 1),
        load(dir + 'normal.jpg', 'linear', anisotropy),
        load(dir + 'normal_before.jpg', 'linear', anisotropy),
        load(dir + 'color.webp', 'srgb', anisotropy),
        load(dir + 'color_before.webp', 'srgb', anisotropy),
        load(dir + 'maps.jpg', 'linear', anisotropy),
      ]).then(([height, heightBefore, normal, normalBefore, color, colorBefore, maps]) => ({
        height, heightBefore, normal, normalBefore, color, colorBefore, maps,
      }));
      cache.set(p.key, pending);
    }
    return pending;
  }

  /* ---- erosion progress (auto-plays, or scrubbed with the slider) ---- */

  let progress = 0;
  let playing = false;
  let playStart = 0;
  const PLAY_MS = 4200;

  function setProgress(value: number) {
    progress = Math.min(Math.max(value, 0), 1);
    material.uniforms.uProgress.value = progress;
    events.onProgress?.(progress);
    needsRender = true;
  }
  function play() {
    if (reduceMotion) return setProgress(1);
    playing = true;
    playStart = performance.now() - progress * PLAY_MS * (progress >= 1 ? 0 : 1);
    if (progress >= 1) setProgress(0);
  }
  function scrub(value: number) {
    playing = false;
    setProgress(value);
  }

  let current: Preset | null = null;
  let token = 0;
  async function setPreset(key: string) {
    const p = PRESETS.find((x) => x.key === key) ?? PRESETS[0];
    const mine = ++token;
    events.onLoading?.(true);
    const tex = await fetchPreset(p);
    if (mine !== token) return;
    const u = material.uniforms;
    u.uHeight.value = tex.height;
    u.uHeightBefore.value = tex.heightBefore;
    u.uNormal.value = tex.normal;
    u.uNormalBefore.value = tex.normalBefore;
    u.uColor.value = tex.color;
    u.uColorBefore.value = tex.colorBefore;
    u.uMaps.value = tex.maps;
    u.uHScale.value = p.heightScale * WIDTH;
    u.uRange.value = p.heightRange;
    u.uSea.value = p.seaLevel;
    u.uBase.value = p.heightRange[0] * p.heightScale * WIDTH - WIDTH * 0.07;
    current = p;
    events.onLoading?.(false);
    events.onPreset?.(p);
    setProgress(0);
    play();
    // warm the cache for the next preset in the list
    const next = PRESETS[(PRESETS.indexOf(p) + 1) % PRESETS.length];
    window.setTimeout(() => fetchPreset(next), 1500);
  }

  function setMode(mode: ViewMode) {
    material.uniforms.uMode.value = MODES[mode];
    needsRender = true;
  }

  /* ---- camera, framing and input ---- */

  let distance = 26;
  let lookY = 0.4;
  let yaw = 0.62;
  let pitch = 0.5;
  let parallaxX = 0;
  let parallaxY = 0;
  let targetX = 0;
  let targetY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let needsRender = true;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (w >= 900 && camera.aspect > 1.1) {
      // push the terrain right, into the space beside the headline
      // push the terrain right (beside the headline) and up (above the controls)
      camera.setViewOffset(w, h, -w * 0.22, h * 0.1, w, h);
      distance = 33;
      lookY = 0.2;
    } else {
      camera.clearViewOffset();
      distance = 25 * Math.min(Math.max(1.05 / camera.aspect, 1), 2.1);
      lookY = 0.4;
    }
    material.uniforms.uFog.value = [distance * 0.95, distance * 1.6];
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  const onPointerMove = (e: PointerEvent) => {
    if (dragging) {
      yaw -= (e.clientX - lastX) * 0.006;
      pitch = Math.min(Math.max(pitch + (e.clientY - lastY) * 0.004, 0.22), 1.1);
      lastX = e.clientX;
      lastY = e.clientY;
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
    lastY = e.clientY;
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

  /* ---- render loop (paused when off-screen or in a background tab) ---- */

  let visible = true;
  let raf = 0;
  let last = performance.now();

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (playing) {
      const t = Math.min((now - playStart) / PLAY_MS, 1);
      setProgress(1 - Math.pow(1 - t, 2.2));
      if (t >= 1) playing = false;
    }
    if (!reduceMotion) {
      if (!dragging) yaw += dt * 0.035;
      parallaxX += (targetX - parallaxX) * Math.min(dt * 3, 1);
      parallaxY += (targetY - parallaxY) * Math.min(dt * 3, 1);
      needsRender = true;
    }
    if (!needsRender || !current) return;
    needsRender = false;

    const a = yaw + parallaxX * 0.22;
    const p = pitch + parallaxY * 0.08;
    camera.position.set(Math.sin(a) * Math.cos(p) * distance, Math.sin(p) * distance, Math.cos(a) * Math.cos(p) * distance);
    camera.lookAt(0, lookY, 0);
    material.uniforms.uCamPos.value.copy(camera.position);
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
  updateRunning();

  return {
    setPreset,
    setMode,
    play,
    scrub,
    get preset() {
      return current;
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', updateRunning);
      window.removeEventListener('pointermove', onPointerMove);
      mesh.geometry.dispose();
      material.dispose();
      cache.forEach((p) => p.then((t) => Object.values(t).forEach((x) => x.dispose())));
      renderer.dispose();
    },
  };
}
