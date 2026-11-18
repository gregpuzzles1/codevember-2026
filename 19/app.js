import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Terrain, LAYERS, WORLD, BED0, BED_SLOPE, WATER_DEPTH } from './sim.js';
import { Ecosystem } from './plants.js';

const $ = sel => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const mobile = params.has('lite') || window.matchMedia('(pointer: coarse)').matches;
const GRID = mobile ? 136 : 176;
const MAX_CLOUDS = 10;
const CLOUD_Y = 50;

// ---- Renderer, scene, camera -----------------------------------------------------------------
const host = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#d9c8b4', 0.0029);
const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 4500);
camera.position.set(-88, 58, 112);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 16, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 6;
controls.maxDistance = 330;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI * 0.985;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.screenSpacePanning = true;
controls.panSpeed = 0.9;
controls.rotateSpeed = 0.8;

// ---- Sky and light -----------------------------------------------------------------------------
const sunDir = new THREE.Vector3(0, 1, 0);
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2000, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSun: { value: sunDir },
      uSunCol: { value: new THREE.Color() },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uTop, pow(y, 0.5));
        float s = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -10;
scene.add(sky);

const sunLight = new THREE.DirectionalLight('#fff2dd', 3.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
const sc = sunLight.shadow.camera;
sc.left = -88; sc.right = 88; sc.top = 88; sc.bottom = -88; sc.near = 20; sc.far = 420;
sunLight.shadow.bias = -0.0006;
sunLight.shadow.normalBias = 0.08;
scene.add(sunLight);
const hemi = new THREE.HemisphereLight('#bcd4f0', '#8a5a3c', 0.9);
scene.add(hemi);

const sunState = { t: 0.3, storm: 0, flash: 0 };
const C = hex => new THREE.Color(hex);
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function applySun() {
  const t = sunState.t;
  const elev = (6 + 58 * Math.sin(Math.PI * t)) * Math.PI / 180;
  const az = (t - 0.5) * 2.4 + 0.5;
  sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).normalize();
  const k = THREE.MathUtils.smoothstep(elev * 180 / Math.PI, 6, 40);
  const storm = sunState.storm;
  sky.material.uniforms.uSunCol.value.copy(C('#ffb066')).lerp(C('#fff4e2'), k).multiplyScalar(1 - storm * 0.8);
  sky.material.uniforms.uTop.value.copy(C('#3d4a78')).lerp(C('#3f7fd2'), k).lerp(C('#59616f'), storm * 0.7);
  sky.material.uniforms.uHorizon.value.copy(C('#f2b38a')).lerp(C('#d2e1ee'), k).lerp(C('#9aa0a6'), storm * 0.65);
  scene.fog.color.copy(sky.material.uniforms.uHorizon.value).lerp(C('#c9a98c'), 0.25);
  sunLight.color.copy(sky.material.uniforms.uSunCol.value).lerp(C('#ffffff'), 0.1);
  sunLight.intensity = (1.9 + 1.8 * k) * (1 - storm * 0.3);
  sunLight.position.copy(sunDir).multiplyScalar(170);
  hemi.color.copy(sky.material.uniforms.uTop.value).lerp(C('#ffffff'), 0.4);
  hemi.groundColor.set('#8a5a3c');
  hemi.intensity = (0.55 + 0.45 * k) * (1 - storm * 0.2) + sunState.flash * 4;
  const label = t < 0.2 ? 'Sunrise' : t < 0.42 ? 'Morning' : t < 0.6 ? 'Midday' : t < 0.8 ? 'Afternoon' : 'Sunset';
  $('#sunOut').textContent = label;
}

// ---- World -------------------------------------------------------------------------------------
let seed = 1;
const terrain = new Terrain(GRID, seed);
const N = terrain.n;

const terrainUniforms = {
  uTime: { value: 0 },
  uTop: { value: new Float32Array(LAYERS.map(l => l.top)) },
  uCol: { value: LAYERS.map(l => new THREE.Color(l.color)) },
  uSoilLow: { value: C('#c9a37a') },
  uSoilMid: { value: C('#b98f64') },
  uOak: { value: C('#80714a') },
  uConifer: { value: C('#4c5a3a') },
  uScrub: { value: C('#7f8660') },
  uAlluvium: { value: C('#d6b98c') },
  uMud: { value: C('#7a4a36') },
  uWaterShallow: { value: C('#52a493') },
  uWaterDeep: { value: C('#1d5c6d') },
  uMap: { value: 0 },
  uWL0: { value: BED0 + BED_SLOPE * 60 + WATER_DEPTH },
  uWLs: { value: BED_SLOPE },
};

const terrainMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
terrainMaterial.onBeforeCompile = shader => {
  Object.assign(shader.uniforms, terrainUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aSed; attribute float aWet; attribute float aDelta;
      varying vec3 vWPos; varying vec3 vWN; varying float vSed; varying float vWet; varying float vDelta;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWN = normalize(objectNormal);
      vSed = aSed; vWet = aWet; vDelta = aDelta;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform float uTime; uniform float uTop[${LAYERS.length}]; uniform vec3 uCol[${LAYERS.length}];
      uniform vec3 uSoilLow; uniform vec3 uSoilMid; uniform vec3 uOak; uniform vec3 uConifer; uniform vec3 uScrub;
      uniform vec3 uAlluvium; uniform vec3 uMud; uniform vec3 uWaterShallow; uniform vec3 uWaterDeep;
      uniform float uMap; uniform float uWL0; uniform float uWLs;
      varying vec3 vWPos; varying vec3 vWN; varying float vSed; varying float vWet; varying float vDelta;
      float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      float nW = fbm2(vWPos.xz * 0.35 + vWPos.y * 0.2);
      float yy = vWPos.y + (nW - 0.5) * 0.18;
      vec3 rock = uCol[${LAYERS.length - 1}];
      for (int i = ${LAYERS.length - 2}; i >= 0; i--) rock = mix(rock, uCol[i], step(yy, uTop[i]));
      float bedding = 0.95 + 0.05 * sin(yy * 60.0 + nW * 7.0);
      float ny = clamp(vWN.y, 0.0, 1.0);
      float steep = 1.0 - smoothstep(0.55, 0.9, ny);
      float mott = mix(fbm2(vWPos.xz * 1.5), fbm2(vec2(vWPos.x + vWPos.z, vWPos.y * 3.0) * 1.3), steep);
      float streak = vnoise(vec2((vWPos.x + vWPos.z) * 2.6, vWPos.y * 0.45));
      rock *= bedding * (0.72 + 0.55 * mott);
      rock *= 1.0 - 0.3 * steep * streak;
      float oakF = smoothstep(14.2, 15.8, yy);
      float conF = smoothstep(19.5, 23.0, yy);
      vec3 soil = mix(uSoilLow, uSoilMid, smoothstep(4.0, 13.0, yy));
      soil = mix(soil, uOak, oakF);
      soil = mix(soil, uConifer, conF);
      soil = mix(soil, uScrub, smoothstep(0.5, 0.85, vnoise(vWPos.xz * 2.4)) * 0.6);
      soil *= 0.85 + 0.3 * fbm2(vWPos.xz * 0.9);
      float soilF = smoothstep(0.86, 0.975, ny);
      vec3 col = mix(rock, soil, soilF * 0.88);
      float sedF = smoothstep(0.03, 0.45, vSed);
      col = mix(col, mix(uAlluvium, rock, 0.25) * (0.85 + 0.3 * mott), sedF * mix(0.55, 0.95, smoothstep(0.6, 0.95, ny)));
      float wet = clamp(vWet, 0.0, 1.0);
      col *= 1.0 - 0.38 * smoothstep(0.03, 0.5, wet);
      col = mix(col, uMud, smoothstep(0.5, 0.95, wet) * 0.7);
      float wl = uWL0 + uWLs * clamp(vWPos.x, -140.0, 140.0);
      float depth = wl - vWPos.y;
      float gWater = smoothstep(0.0, 0.04, depth);
      col = mix(col, mix(uWaterShallow, uWaterDeep, smoothstep(0.0, 0.5, depth)), gWater);
      float gWet = smoothstep(0.1, 0.6, wet);
      if (uMap > 0.5) {
        float g = dot(col, vec3(0.33));
        vec3 base = vec3(g) * 0.5 + vec3(0.03, 0.04, 0.06);
        float a = smoothstep(0.02, 0.5, abs(vDelta));
        col = mix(base, vDelta < 0.0 ? vec3(1.0, 0.3, 0.03) : vec3(0.1, 0.75, 1.0), a);
        gWater *= 0.5;
      }
      diffuseColor.rgb = col;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.1, gWater);
      roughnessFactor = mix(roughnessFactor, 0.6, gWet * (1.0 - gWater));`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      vec2 rp = vWPos.xz * vec2(1.1, 2.2) + vec2(uTime * 0.8, 0.0);
      vec3 rip = vec3(vnoise(rp) - 0.5, 0.0, vnoise(rp + 17.3) - 0.5) * 0.35;
      vec3 wn = normalize(upV + (viewMatrix * vec4(rip, 0.0)).xyz);
      normal = normalize(mix(normal, wn, gWater));`);
};

function makeAttr(count, itemSize, dynamic) {
  const a = new THREE.BufferAttribute(new Float32Array(count * itemSize), itemSize);
  if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

function buildTerrainMesh() {
  const geo = new THREE.BufferGeometry();
  const pos = makeAttr(N * N, 3, true);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 3;
    pos.array[o] = terrain.worldX(x); pos.array[o + 2] = terrain.worldX(y);
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', makeAttr(N * N, 3, true));
  geo.setAttribute('aSed', makeAttr(N * N, 1, true));
  geo.setAttribute('aWet', makeAttr(N * N, 1, true));
  geo.setAttribute('aDelta', makeAttr(N * N, 1, true));
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let k = 0;
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
    const i = y * N + x;
    if ((x + y) & 1) { idx[k++] = i; idx[k++] = i + N; idx[k++] = i + 1; idx[k++] = i + 1; idx[k++] = i + N; idx[k++] = i + N + 1; }
    else { idx[k++] = i; idx[k++] = i + N; idx[k++] = i + N + 1; idx[k++] = i; idx[k++] = i + N + 1; idx[k++] = i + 1; }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 120);
  const mesh = new THREE.Mesh(geo, terrainMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

const terrainMesh = buildTerrainMesh();
scene.add(terrainMesh);
let ringMesh = null;

function buildRing() {
  if (ringMesh) { scene.remove(ringMesh); ringMesh.geometry.dispose(); }
  const per = 4 * (N - 1);
  const K = 26;
  const verts = per * (K + 1);
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
  const zeros = new Float32Array(verts);
  const half = WORLD / 2;
  const land = terrain.land;
  const edge = p => {
    const s = (p / (N - 1)) | 0, f = p % (N - 1);
    const t = -half + f * terrain.dx;
    return s === 0 ? [t, -half] : s === 1 ? [half, t] : s === 2 ? [-t, half] : [-half, -t];
  };
  for (let k = 0; k <= K; k++) {
    const r = 1 + 5.5 * Math.pow(k / K, 1.8);
    for (let p = 0; p < per; p++) {
      const [bx, bz] = edge(p);
      const x = bx * r, z = bz * r;
      const y = land.height(x, z);
      const e = 1.5 * r;
      const gx = (land.height(x - e, z) - land.height(x + e, z)) / (2 * e);
      const gz = (land.height(x, z - e) - land.height(x, z + e)) / (2 * e);
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      const o = (k * per + p) * 3;
      pos[o] = x; pos[o + 1] = k === 0 ? edgeHeight(bx, bz, y) : y; pos[o + 2] = z;
      nor[o] = gx * inv; nor[o + 1] = inv; nor[o + 2] = gz * inv;
    }
  }
  const idx = new Uint32Array(per * K * 6);
  let q = 0;
  for (let k = 0; k < K; k++) for (let p = 0; p < per; p++) {
    const a = k * per + p, b = k * per + (p + 1) % per, c = a + per, d = b + per;
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aSed', new THREE.BufferAttribute(zeros, 1));
  geo.setAttribute('aWet', new THREE.BufferAttribute(zeros, 1));
  geo.setAttribute('aDelta', new THREE.BufferAttribute(zeros, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 900);
  ringMesh = new THREE.Mesh(geo, terrainMaterial);
  ringMesh.frustumCulled = false;
  scene.add(ringMesh);
}

// Heights on the tile edge are fixed, so the surrounding ring can stitch to them exactly.
function edgeHeight(bx, bz, fallback) {
  const ix = Math.round((bx + WORLD / 2) / terrain.dx), iz = Math.round((bz + WORLD / 2) / terrain.dx);
  return terrain.h0[iz * N + ix] ?? fallback;
}

let displayMode = 'after';
function uploadTerrain() {
  const g = terrainMesh.geometry;
  const pos = g.attributes.position, nor = g.attributes.normal;
  const sed = g.attributes.aSed, wet = g.attributes.aWet, del = g.attributes.aDelta;
  const before = displayMode === 'before';
  const src = before ? terrain.h0 : terrain.h;
  for (let i = 0; i < N * N; i++) {
    pos.array[i * 3 + 1] = src[i];
    sed.array[i] = before ? 0 : terrain.sed[i];
    wet.array[i] = before ? 0 : terrain.wet[i];
    del.array[i] = before ? 0 : terrain.h[i] - terrain.h0[i];
  }
  terrain.writeNormals(nor.array, src);
  pos.needsUpdate = nor.needsUpdate = sed.needsUpdate = wet.needsUpdate = del.needsUpdate = true;
}

// ---- Clouds & rain -------------------------------------------------------------------------------
const puffGeo = new THREE.IcosahedronGeometry(1, 2);
const clouds = [];
let cloudSeed = 5;
const crand = () => { cloudSeed = (cloudSeed * 16807) % 2147483647; return cloudSeed / 2147483647; };

function makeCloud(x, z, rainOn = false) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, emissive: '#000000' });
  const R = 7 + crand() * 3;
  const puffs = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    const a = crand() * Math.PI * 2, d = Math.sqrt(crand()) * R * 0.85;
    const m = new THREE.Mesh(puffGeo, mat);
    const s = R * (0.3 + crand() * 0.3) * (1 - d / (R * 1.6));
    m.position.set(Math.cos(a) * d, crand() * R * 0.28, Math.sin(a) * d);
    m.scale.set(s * 1.25, s * 0.78, s * 1.25);
    m.castShadow = true;
    group.add(m);
    puffs.push({ m, base: m.scale.clone(), phase: crand() * 6.28 });
  }
  scene.add(group);
  const cloud = {
    group, mat, puffs, x, z, tx: x, tz: z, y: CLOUD_Y + crand() * 8, r: R * 1.2,
    vx: 0.7 + crand() * 0.8, vz: (crand() - 0.5) * 0.8,
    rainOn, amt: rainOn ? 1 : 0, dragging: false, hover: false, id: clouds.length,
  };
  clouds.push(cloud);
  return cloud;
}

const rainUniforms = {
  uTime: { value: 0 },
  uC: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4(0, 0, 1, 0)) },
  uY: { value: new Float32Array(MAX_CLOUDS) },
};
{
  const per = mobile ? 380 : 700;
  const total = MAX_CLOUDS * per * 2;
  const aCloud = new Float32Array(total), aRand = new Float32Array(total * 3), aEnd = new Float32Array(total);
  let v = 0;
  for (let c = 0; c < MAX_CLOUDS; c++) for (let d = 0; d < per; d++) {
    const r0 = Math.random(), r1 = Math.random(), r2 = Math.random();
    for (let e = 0; e < 2; e++) {
      aCloud[v] = c; aEnd[v] = e;
      aRand[v * 3] = r0; aRand[v * 3 + 1] = r1; aRand[v * 3 + 2] = r2;
      v++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  g.setAttribute('aCloud', new THREE.BufferAttribute(aCloud, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(aRand, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: rainUniforms,
    vertexShader: `
      attribute float aCloud; attribute vec3 aRand; attribute float aEnd;
      uniform vec4 uC[${MAX_CLOUDS}]; uniform float uY[${MAX_CLOUDS}]; uniform float uTime;
      varying float vA;
      void main(){
        int ci = int(aCloud + 0.5);
        vec4 c = uC[ci];
        float top = uY[ci] - 2.0;
        float ang = aRand.x * 6.2831853;
        float rad = sqrt(aRand.y) * c.z * 0.92;
        float t = fract(uTime * 0.85 + aRand.z);
        float y = top * (1.0 - t) - aEnd * 1.8;
        vec3 p = vec3(c.x + cos(ang) * rad + (top - y) * 0.07, y, c.y + sin(ang) * rad);
        vA = c.w * (aEnd < 0.5 ? 0.12 : 0.6);
        gl_Position = c.w < 0.02 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.8, 0.88, 1.0, vA); }',
  });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  scene.add(lines);
}

const curtainGeo = new THREE.CylinderGeometry(0.94, 1.1, 1, 28, 1, true);
const curtainMat = i => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uAmt: { value: 0 }, uTime: rainUniforms.uTime, uSeed: { value: i * 7.13 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform float uAmt; uniform float uTime; uniform float uSeed;
    float h1(float n){ return fract(sin(n * 91.345 + uSeed) * 43758.5453); }
    void main(){
      float col = floor(vUv.x * 160.0);
      float cx = fract(vUv.x * 160.0);
      float sp = 0.7 + h1(col) * 0.9;
      float f = fract(vUv.y * 13.0 + uTime * sp * 1.7 + h1(col + 3.0) * 7.0);
      float streak = smoothstep(0.7, 0.74, f) * step(0.45, h1(col + 9.0)) * smoothstep(0.0, 0.3, cx) * smoothstep(1.0, 0.7, cx);
      float a = (streak * 0.34 + 0.03) * uAmt * smoothstep(1.0, 0.72, vUv.y);
      gl_FragColor = vec4(0.82, 0.88, 1.0, a);
    }`,
});
const curtains = Array.from({ length: MAX_CLOUDS }, (_, i) => {
  const m = new THREE.Mesh(curtainGeo, curtainMat(i));
  m.frustumCulled = false;
  m.visible = false;
  m.renderOrder = 4;
  scene.add(m);
  return m;
});

function addCloud(x, z, rainOn) {
  if (clouds.length >= MAX_CLOUDS) return null;
  return makeCloud(x, z, rainOn);
}

function resetClouds() {
  for (const c of clouds) scene.remove(c.group);
  clouds.length = 0;
  const zc = terrain.land.zc;
  makeCloud(-14, zc(-14) + 12, true);
  makeCloud(24, zc(24) - 16, false);
  makeCloud(-44, 24, false);
  makeCloud(40, 26, false);
  makeCloud(6, -40, false);
}

function updateClouds(dt, time) {
  let raining = 0;
  for (const c of clouds) {
    const target = c.rainOn ? 1 : 0;
    c.amt += (target - c.amt) * Math.min(1, dt * 1.4);
    if (Math.abs(c.amt - target) < 0.003) c.amt = target;
    if (c.rainOn) raining++;
    if (c.dragging) {
      c.x += (c.tx - c.x) * Math.min(1, dt * 12);
      c.z += (c.tz - c.z) * Math.min(1, dt * 12);
    } else {
      const k = c.rainOn ? 0.45 : 1;
      c.x += c.vx * k * dt; c.z += c.vz * k * dt;
      if (c.x > 92) c.x = -92;
      if (c.x < -92) c.x = 92;
      if (c.z > 92) c.z = -92;
      if (c.z < -92) c.z = 92;
      c.tx = c.x; c.tz = c.z;
    }
    c.group.position.set(c.x, c.y + Math.sin(time * 0.3 + c.id) * 0.6, c.z);
    for (const p of c.puffs) {
      const b = 1 + 0.05 * Math.sin(time * 0.6 + p.phase);
      p.m.scale.set(p.base.x * b, p.base.y * b, p.base.z * b);
    }
    c.mat.color.set('#ffffff').lerp(tmpA.set('#5a606d'), c.amt * 0.85);
    const glow = (c.hover || c.dragging ? 0.16 : 0) + sunState.flash * c.amt * 1.6;
    c.mat.emissive.setRGB(glow * 0.9, glow * 0.95, glow);
  }
  sunState.storm += (Math.min(1, raining / 3) - sunState.storm) * Math.min(1, dt * 0.8);
  return raining;
}

function syncRainUniforms() {
  for (let i = 0; i < MAX_CLOUDS; i++) {
    const c = clouds[i];
    const v = rainUniforms.uC.value[i];
    const cur = curtains[i];
    if (!c || c.amt < 0.01) { v.w = 0; cur.visible = false; continue; }
    v.set(c.x, c.z, c.r, c.amt);
    rainUniforms.uY.value[i] = c.group.position.y;
    cur.visible = true;
    cur.position.set(c.x, c.group.position.y / 2 - 1, c.z);
    cur.scale.set(c.r * 0.92, c.group.position.y, c.r * 0.92);
    cur.material.uniforms.uAmt.value = c.amt;
  }
}

// ---- Plants ----------------------------------------------------------------------------------------
buildRing();
uploadTerrain();
const eco = new Ecosystem(scene, terrain, { mobile, seed });

// ---- Audio -----------------------------------------------------------------------------------------
const audio = { ctx: null, rainGain: null, on: true };
function ensureAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = audio.ctx = new AC();
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
  audio.rainGain = ctx.createGain(); audio.rainGain.gain.value = 0;
  src.connect(hp); hp.connect(lp); lp.connect(audio.rainGain); audio.rainGain.connect(ctx.destination);
  src.start();
}
function thunder() {
  if (!audio.ctx || !audio.on) return;
  const ctx = audio.ctx;
  const len = ctx.sampleRate * 3.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 1.1) * (0.6 + 0.4 * Math.sin(t * 9));
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  const g = ctx.createGain(); g.gain.value = 1.4;
  src.connect(lp); lp.connect(g); g.connect(ctx.destination);
  src.start();
}

// ---- Interaction -----------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const sphere = new THREE.Sphere();

function setRay(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pickCloud(clientX, clientY, touch) {
  setRay(clientX, clientY);
  let best = null, bestD = Infinity;
  for (const c of clouds) {
    sphere.center.set(c.x, c.group.position.y, c.z);
    sphere.radius = c.r * (touch ? 0.95 : 0.8);
    const p = ray.ray.intersectSphere(sphere, hit);
    if (!p) continue;
    const d = p.distanceTo(ray.ray.origin);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function fadeHint() { $('#hint').classList.add('faded'); }
setTimeout(fadeHint, 16000);

function setCloudRain(c, on) {
  c.rainOn = on;
  ensureAudio();
}

let drag = null;
host.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const c = pickCloud(e.clientX, e.clientY, e.pointerType !== 'mouse');
  if (!c) return;
  e.stopImmediatePropagation();
  ensureAudio();
  setRay(e.clientX, e.clientY);
  plane.constant = -c.group.position.y;
  const p = ray.ray.intersectPlane(plane, hit);
  drag = { c, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, ox: p ? c.x - p.x : 0, oz: p ? c.z - p.z : 0 };
  try { host.setPointerCapture(e.pointerId); } catch {}
  $('#scene').classList.add('grabbing');
}, true);

window.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.id) {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) {
      drag.moved = true;
      drag.c.dragging = true;
      fadeHint();
    }
    if (drag.moved) {
      setRay(e.clientX, e.clientY);
      plane.constant = -drag.c.group.position.y;
      if (ray.ray.intersectPlane(plane, hit)) {
        drag.c.tx = Math.max(-92, Math.min(92, hit.x + drag.ox));
        drag.c.tz = Math.max(-92, Math.min(92, hit.z + drag.oz));
      }
    }
    return;
  }
  if (e.pointerType === 'mouse' && e.target === renderer.domElement) {
    const c = pickCloud(e.clientX, e.clientY, false);
    for (const k of clouds) k.hover = k === c;
    host.classList.toggle('over-cloud', !!c);
  }
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { c, moved } = drag;
  c.dragging = false;
  drag = null;
  host.classList.remove('grabbing');
  if (!moved && e.type === 'pointerup') {
    setCloudRain(c, !c.rainOn);
    toast(c.rainOn ? 'Rain started' : 'Rain stopped');
    fadeHint();
  }
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
renderer.domElement.addEventListener('pointerdown', () => host.classList.add('grabbing'));
window.addEventListener('pointerup', () => { if (!drag) host.classList.remove('grabbing'); });
renderer.domElement.addEventListener('pointerleave', () => { for (const k of clouds) k.hover = false; host.classList.remove('over-cloud'); });

// ---- Camera: orbit, presets, ground clamp ----------------------------------------------------------
let orbitOn = true;
let idleTimer = 0;
let tween = null;
function setOrbit(on) {
  orbitOn = on;
  controls.autoRotate = on;
  const b = $('#orbit');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? 'Orbit: on' : 'Orbit: off';
}
controls.addEventListener('start', () => { controls.autoRotate = false; tween = null; clearTimeout(idleTimer); });
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
  if (orbitOn) idleTimer = setTimeout(() => { controls.autoRotate = true; }, 5000);
});

function viewPreset(name) {
  const zc = terrain.land.zc;
  let pos, tgt;
  if (name === 'top') { pos = [0, 185, 0.01]; tgt = [0, 6, 0]; }
  else if (name === 'canyon') { pos = [52, 13, zc(52) + 3]; tgt = [-6, 7, zc(-6)]; }
  else if (name === 'low') { pos = [-58, 22, 44]; tgt = [0, 10, -4]; }
  else { pos = [-88, 58, 112]; tgt = [0, 16, 0]; }
  tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...tgt) };
}

function groundClamp() {
  const g = terrain.heightAt(camera.position.x, camera.position.z) + 2.2;
  if (camera.position.y < g) camera.position.y = g;
  controls.target.x = Math.max(-80, Math.min(80, controls.target.x));
  controls.target.z = Math.max(-80, Math.min(80, controls.target.z));
}

// ---- Simulation driver -------------------------------------------------------------------------------
const state = { speed: 10, rainfall: 1, stepMs: 4, lastFlow: 0, years: 0 };
function simulate(dt, now) {
  terrain.setRain(clouds, state.rainfall);
  if (state.speed > 0) {
    const want = state.speed * dt;
    const maxStep = 2.5;
    const budget = Math.max(1, Math.floor(9 / Math.max(1, state.stepMs)));
    const steps = Math.min(budget, Math.max(1, Math.ceil(want / maxStep)));
    const per = Math.min(want / steps, maxStep * 1.6);
    const t0 = performance.now();
    for (let s = 0; s < steps; s++) terrain.step(per);
    state.stepMs += ((performance.now() - t0) / steps - state.stepMs) * 0.1;
    return per * steps;
  }
  if (now - state.lastFlow > 120) { terrain.step(0); state.lastFlow = now; }
  return 0;
}

let lastDrain = 0;
let uploadDirty = true;
let nextStats = 0;
function formatEra(y) {
  if (y < 1) return 'Starting point';
  if (y < 100) return `${Math.floor(y)} years of weather`;
  if (y < 1000) return `${Math.floor(y / 10)} decades`;
  if (y < 10000) return `${(y / 100).toFixed(1)} centuries`;
  return `${(y / 1000).toFixed(1)} millennia`;
}

// ---- UI --------------------------------------------------------------------------------------------------
function setSpeed(v) {
  state.speed = v;
  document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === v)));
}
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => viewPreset(b.dataset.view)));
$('#orbit').addEventListener('click', () => setOrbit(!orbitOn));

$('#addCloud').addEventListener('click', () => {
  if (clouds.length >= MAX_CLOUDS) { toast('The sky is full'); return; }
  const x = controls.target.x + (Math.random() - 0.5) * 50, z = controls.target.z + (Math.random() - 0.5) * 50;
  const c = addCloud(x, z, true);
  ensureAudio();
  if (c) toast('A raincloud rolls in');
});
$('#rainAll').addEventListener('click', () => { ensureAudio(); clouds.forEach(c => (c.rainOn = true)); toast('Storm season'); });
$('#clearSky').addEventListener('click', () => { clouds.forEach(c => (c.rainOn = false)); toast('Clear skies'); });

$('#rainfall').addEventListener('input', e => {
  state.rainfall = +e.target.value;
  $('#rainOut').textContent = `${state.rainfall.toFixed(1)}×`;
});
$('#sun').addEventListener('input', e => { sunState.t = +e.target.value; applySun(); });

const mapBtn = $('#erosionMap');
mapBtn.addEventListener('click', () => {
  const on = terrainUniforms.uMap.value < 0.5;
  terrainUniforms.uMap.value = on ? 1 : 0;
  mapBtn.setAttribute('aria-pressed', String(on));
  if (on) toast('Orange = carved away · Blue = deposited');
});

const cmp = $('#compare');
function setCompare(on) {
  displayMode = on ? 'before' : 'after';
  eco.setVisible(!on);
  cmp.classList.toggle('active', on);
  uploadDirty = true;
  uploadTerrain();
}
cmp.addEventListener('pointerdown', e => { e.preventDefault(); setCompare(true); try { cmp.setPointerCapture(e.pointerId); } catch {} });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => cmp.addEventListener(t, () => setCompare(false)));
cmp.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setCompare(true); } });
cmp.addEventListener('keyup', () => setCompare(false));

function loadWorld(newSeed) {
  seed = newSeed;
  terrain.reset(seed);
  buildRing();
  eco.rebuild();
  resetClouds();
  uploadTerrain();
  setCompare(false);
  viewPreset('overview');
}
$('#reset').addEventListener('click', () => { loadWorld(seed); toast('Landscape restored'); });
$('#newLand').addEventListener('click', () => { loadWorld((seed % 9) + 1); toast(`New landscape #${seed}`); });

const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  audio.on = !audio.on;
  soundBtn.setAttribute('aria-pressed', String(audio.on));
  soundBtn.textContent = audio.on ? 'Sound: on' : 'Sound: off';
  ensureAudio();
});

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' && !e.target.closest?.('button')) { e.preventDefault(); setSpeed(state.speed ? 0 : 10); }
  else if (/^[1-5]$/.test(k)) setSpeed([0, 1, 10, 100, 1000][+k - 1]);
  else if (k === 'o') setOrbit(!orbitOn);
  else if (k === 'm') mapBtn.click();
  else if (k === 'b') { setCompare(true); setTimeout(() => setCompare(false), 1500); }
  else if (k === 'c') $('#addCloud').click();
});

// Panel: collapsible on small screens, swipe down to hide.
const panel = $('#panel');
const toggle = $('#panelToggle');
function layoutToggle() {
  const collapsed = panel.classList.contains('collapsed');
  const bar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--browser-bar')) || 0;
  const base = Math.max(14, parseInt(getComputedStyle(panel).bottom) || 14);
  toggle.style.setProperty('--toggle-bottom', collapsed ? `${14 + bar}px` : `${base + panel.offsetHeight + 8}px`);
}
function setPanelCollapsed(collapsed) {
  panel.classList.toggle('collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.textContent = collapsed ? 'Controls' : 'Hide';
  layoutToggle();
  resize();
}
toggle.addEventListener('click', () => setPanelCollapsed(!panel.classList.contains('collapsed')));
{
  let startY = null, dy = 0;
  const reset = () => { startY = null; dy = 0; panel.classList.remove('dragging'); panel.style.transform = ''; };
  panel.addEventListener('touchstart', e => {
    if (getComputedStyle(toggle).display === 'none' || e.touches.length !== 1 || e.target.closest('input') || panel.scrollTop > 0) return;
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) { if (dy < -4) reset(); return; }
    e.preventDefault();
    panel.classList.add('dragging');
    panel.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: false });
  panel.addEventListener('touchend', () => { const close = startY !== null && dy > 60; reset(); if (close) setPanelCollapsed(true); });
  panel.addEventListener('touchcancel', reset);
}
if (window.matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches) {
  panel.classList.add('collapsed');
  toggle.setAttribute('aria-expanded', 'false');
}

// ---- Resize ----------------------------------------------------------------------------------------------
if (/DuckDuckGo/i.test(navigator.userAgent)) document.documentElement.style.setProperty('--browser-bar', '64px');
function syncAppHeight() {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
}
syncAppHeight();
window.addEventListener('resize', syncAppHeight);
window.visualViewport?.addEventListener('resize', syncAppHeight);

function panelInset() {
  if (panel.classList.contains('collapsed')) return 0;
  return Math.min(panel.offsetHeight + 14, host.clientHeight * 0.45);
}
function resize() {
  const w = host.clientWidth || 1, h = host.clientHeight || 1;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 62 : 48;
  camera.setViewOffset(w, h, 0, Math.round(panelInset() / 2), w, h);
  camera.updateProjectionMatrix();
  layoutToggle();
}
new ResizeObserver(resize).observe(host);
new ResizeObserver(resize).observe(panel);

// ---- Main loop -----------------------------------------------------------------------------------------------
resetClouds();
applySun();
setCompare(false);
setSpeed(10);
setOrbit(true);
setPanelCollapsed(panel.classList.contains('collapsed'));

let last = performance.now();
let time = 0;
let nextLightning = 8;
let flashEnv = 0;
let thunderAt = -1;

function tick(dt, now) {
  time += dt;

  const raining = updateClouds(dt, time);
  const years = displayMode === 'before' ? 0 : simulate(dt, now);
  state.years += years;
  const wetActive = terrain.updateWet(Math.min(1, dt * 4));
  if (displayMode === 'after' && (years > 0 || wetActive || uploadDirty)) { uploadTerrain(); uploadDirty = false; }
  if (now - lastDrain > 1500) { terrain.updateDrainage(); lastDrain = now; }
  eco.update(dt, years, time);

  terrainUniforms.uTime.value = time;
  rainUniforms.uTime.value = time;
  syncRainUniforms();

  // lightning
  if (raining > 0) {
    nextLightning -= dt;
    if (nextLightning <= 0) { flashEnv = 1; thunderAt = time + 0.5 + Math.random() * 1.5; nextLightning = 7 + Math.random() * 14; }
  }
  flashEnv = Math.max(0, flashEnv - dt * 3.2);
  sunState.flash = flashEnv > 0 ? Math.max(0, Math.sin(flashEnv * 14)) * flashEnv * 0.5 : 0;
  if (thunderAt > 0 && time > thunderAt) { thunderAt = -1; thunder(); }

  if (raining > 0 || sunState.storm > 0.01 || sunState.flash > 0) applySun();

  if (audio.rainGain) {
    const target = audio.on ? Math.min(0.55, clouds.reduce((s, c) => s + c.amt, 0) * 0.16) : 0;
    audio.rainGain.gain.value += (target - audio.rainGain.gain.value) * Math.min(1, dt * 3);
  }

  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.6);
    const e = tween.t * tween.t * (3 - 2 * tween.t);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.t >= 1) tween = null;
  }
  controls.update(dt);
  groundClamp();
  sky.position.copy(camera.position);

  if (now > nextStats) {
    nextStats = now + 300;
    const s = terrain.stats();
    $('#year').textContent = `Year ${Math.floor(terrain.years).toLocaleString()}`;
    $('#era').textContent = formatEra(terrain.years);
    $('#statCut').textContent = s.cut.toFixed(2);
    $('#statFill').textContent = s.fill.toFixed(2);
    $('#statRain').textContent = String(raining);
  }

  renderer.render(scene, camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  tick(dt, now);
}
// ?manual lets a capture script advance the scene in fixed steps instead of real time.
let virtualNow = performance.now();
if (!params.has('manual')) requestAnimationFrame(frame);

window.__erosion = {
  terrain, clouds, eco, state, setSpeed, camera, controls, scene, renderer, viewPreset, setCloudRain,
  tick(dt) { virtualNow += dt * 1000; tick(dt, virtualNow); },
};
