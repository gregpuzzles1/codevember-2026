import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';

const $ = selector => document.querySelector(selector);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sign = () => (Math.random() < 0.5 ? -1 : 1);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- DOM ---------- */
const stage = $('#scene');
const panel = $('#panel');
const ui = {
  score: $('#score'), distance: $('#distance'), pearls: $('#pearls'), deliveries: $('#deliveries'),
  lives: $('#lives'), toast: $('#toast'), dropFill: $('#dropoff-fill'), dropDistance: $('#dropoff-distance'),
  eyebrow: $('#panel-eyebrow'), title: $('#panel-title'), copy: $('#panel-copy'), stats: $('#panel-stats'),
  controls: $('#panel-controls'), button: $('#panel-button'), buttonLabel: $('#panel-button-label'),
  finalScore: $('#final-score'), bestScore: $('#best-score'), finalDeliveries: $('#final-deliveries'),
  pause: $('#pause-button'), musicButton: $('#music-button')
};

/* ---------- Renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (error) {
  ui.title.textContent = '3D unavailable';
  ui.copy.textContent = 'This browser could not start WebGL, so the kelp forest cannot load.';
  ui.button.hidden = true;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-hidden', 'true');
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 40;
const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 140);
const view = { halfW: 11, halfH: 6.8, dist: 18, fringe: 1.5, fishX: -4.5, playMin: -4, playMax: 5 };
const halfWAt = z => view.halfW * (view.dist - z) / view.dist;
const halfHAt = z => view.halfH * (view.dist - z) / view.dist;

/* ---------- Textures ---------- */
function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

scene.background = canvasTexture(512, 512, (g, w, h) => {
  const vertical = g.createLinearGradient(0, 0, 0, h);
  vertical.addColorStop(0, '#3aa0cf');
  vertical.addColorStop(0.16, '#1873a6');
  vertical.addColorStop(0.45, '#0c4876');
  vertical.addColorStop(0.78, '#07304f');
  vertical.addColorStop(1, '#041a2c');
  g.fillStyle = vertical;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w * 0.78, h * 0.05, 0, w * 0.78, h * 0.05, w * 0.6);
  glow.addColorStop(0, 'rgba(150, 232, 255, .65)');
  glow.addColorStop(1, 'rgba(150, 232, 255, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
});

const glowTexture = canvasTexture(64, 64, (g, w, h) => {
  const radial = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  radial.addColorStop(0, 'rgba(255,255,255,1)');
  radial.addColorStop(0.35, 'rgba(255,255,255,.45)');
  radial.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = radial;
  g.fillRect(0, 0, w, h);
});

const shaftTexture = canvasTexture(64, 256, (g, w, h) => {
  const across = g.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const down = g.createLinearGradient(0, 0, 0, h);
  down.addColorStop(0, 'rgba(255,255,255,1)');
  down.addColorStop(0.7, 'rgba(255,255,255,.25)');
  down.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = down;
  g.fillRect(0, 0, w, h);
});

/* ---------- Lights (fish, rocks) ---------- */
scene.add(new THREE.HemisphereLight('#9fdcff', '#1b2a30', 2.2));
const sun = new THREE.DirectionalLight('#fff3c4', 2.6);
sun.position.set(6, 12, 8);
scene.add(sun);

/* ---------- Kelp ---------- */
const sharedTime = { value: 0 };
const fogColor = { value: new THREE.Color('#0b4a78') };

const kelpVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uSway;
  attribute vec3 aColor;
  attribute vec2 aUV;
  attribute vec2 aFlutter;
  varying vec3 vColor;
  varying vec2 vUV;
  varying float vWorldY;

  float swayX(float y) {
    float k = 1.0 - exp(-y / 7.0);
    return uSway * k * (0.9 * sin(uTime * 0.9 + uPhase + y * 0.35) + 0.5 * sin(uTime * 0.37 + uPhase * 1.7 + y * 0.15));
  }

  void main() {
    vec3 p = position;
    p.x += aFlutter.x * 0.12 * sin(uTime * 2.1 + aFlutter.y * 6.283 + p.y * 1.7);
    p.z += aFlutter.x * 0.18 * sin(uTime * 1.7 + aFlutter.y * 6.283 + p.y * 1.1);
    p.x += swayX(position.y);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorldY = world.y;
    vColor = aColor;
    vUV = aUV;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const kelpFragment = /* glsl */ `
  uniform vec3 uFogColor;
  uniform vec3 uTint;
  uniform float uFog;
  uniform float uBright;
  varying vec3 vColor;
  varying vec2 vUV;
  varying float vWorldY;

  void main() {
    float vein = 0.9 + 0.1 * sin(vUV.y * 16.0 + vUV.x * 6.0);
    float glow = pow(vUV.x, 2.0) * 0.5 + abs(vUV.y) * 0.1;
    vec3 c = vColor * vein;
    c += vColor * glow + vec3(0.55, 0.45, 0.08) * glow * 0.35;
    c *= mix(0.5, 1.18, smoothstep(-12.0, 7.0, vWorldY));
    c = mix(c * uTint * uBright, uFogColor, uFog);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

function swayX(y, t, phase, amp) {
  const k = 1 - Math.exp(-y / 7);
  return amp * k * (0.9 * Math.sin(t * 0.9 + phase + y * 0.35) + 0.5 * Math.sin(t * 0.37 + phase * 1.7 + y * 0.15));
}

function kelpMaterial(layer, sway) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedTime,
      uFogColor: fogColor,
      uPhase: { value: rand(0, Math.PI * 2) },
      uSway: { value: sway },
      uFog: { value: layer.fog },
      uBright: { value: layer.bright },
      uTint: { value: new THREE.Color(layer.tint) }
    },
    vertexShader: kelpVertex,
    fragmentShader: kelpFragment,
    side: THREE.DoubleSide
  });
}

const BLADE_COLORS = ['#e6c846', '#d2b034', '#b99c2a', '#f2da6c', '#928a26', '#aa9a2e', '#dcb43c', '#807a23', '#a36c22'].map(c => new THREE.Color(c));
const STIPE_COLORS = [new THREE.Color('#5a4719'), new THREE.Color('#a08430')];

function buildKelpGeometry(H, seed) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const positions = [], colors = [], uvs = [], flutter = [], indices = [], colliders = [];
  const stipeX = y => 0.12 * Math.sin(y * 0.8 + seed);

  const rings = Math.max(6, Math.ceil(H * 2));
  const radial = 5;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, y = t * H, r = lerp(0.13, 0.05, t), cx = stipeX(y);
    const c = STIPE_COLORS[0].clone().lerp(STIPE_COLORS[1], t);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      positions.push(cx + Math.cos(a) * r, y, Math.sin(a) * r);
      colors.push(c.r, c.g, c.b);
      uvs.push(0.3, 0);
      flutter.push(0, 0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k, b = i * radial + ((k + 1) % radial);
      indices.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  for (let y = 0.6; y < H; y += 1.1) colliders.push(stipeX(y), y, 0.2);

  const bladeCount = Math.round(H * 1.5);
  const segs = 10, across = 5;
  for (let b = 0; b < bladeCount; b++) {
    const f = (b + rnd() * 0.8) / bladeCount;
    const y0 = lerp(Math.min(1, H * 0.1), H - 0.2, Math.pow(f, 0.85));
    const side = (b % 2 ? 1 : -1) * (rnd() < 0.15 ? -1 : 1);
    const crown = y0 > H - 1.4;
    const frac = y0 / H;
    const L = R(1.5, 3.5) * (0.55 + 0.6 * frac) * (crown ? 0.6 : 1);
    const W = R(0.2, 0.52) * (0.8 + 0.4 * frac);
    const a0 = crown ? R(0.1, 0.45) : R(0.55, 1.15);
    const twist = R(-0.9, 0.9);
    const wob = R(0, 6.28);
    const seedValue = rnd();

    const points = [], angles = [];
    let px = stipeX(y0) + side * 0.05, py = y0;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const ang = a0 * (1 - 0.78 * u) + 0.14 * Math.sin(u * 5 + wob);
      points.push([px, py]);
      angles.push(ang);
      px += side * Math.sin(ang) * L / segs;
      py += Math.cos(ang) * L / segs;
    }
    const maxY = points[segs][1];
    if (maxY > H + 0.2) {
      const k = (H + 0.2 - y0) / (maxY - y0);
      for (const p of points) p[1] = y0 + (p[1] - y0) * k;
    }

    const base = BLADE_COLORS[Math.floor(rnd() * BLADE_COLORS.length)];
    const dark = base.clone().multiplyScalar(0.38);
    const vertexStart = positions.length / 3;
    const widthAt = u => W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.9) * (0.85 + 0.15 * Math.sin(u * 13 + wob)) + 0.012;

    for (let s = 0; s <= segs; s++) {
      const u = s / segs, ang = angles[s];
      const wx = Math.cos(ang) * Math.cos(twist), wy = -side * Math.sin(ang) * Math.cos(twist), wz = Math.sin(twist);
      const width = widthAt(u);
      for (let a = 0; a < across; a++) {
        const v = -1 + (2 * a) / (across - 1);
        const ripple = Math.sin(u * 10 + wob + v * 2) * 0.08 * W + v * v * 0.07 * W + (Math.abs(v) === 1 ? Math.sin(u * 20 + wob) * 0.1 * W : 0);
        positions.push(points[s][0] + wx * width * v, points[s][1] + wy * width * v, wz * width * v + ripple);
        const c = dark.clone().lerp(base, Math.pow(u, 0.6) * 0.85 + 0.15).multiplyScalar(0.9 + 0.1 * (1 - Math.abs(v)));
        colors.push(c.r, c.g, c.b);
        uvs.push(u, v);
        flutter.push(u * 0.9 + 0.1, seedValue);
      }
    }
    for (let s = 0; s < segs; s++) {
      for (let a = 0; a < across - 1; a++) {
        const i0 = vertexStart + s * across + a, i1 = i0 + 1, i2 = i0 + across, i3 = i2 + 1;
        indices.push(i0, i1, i2, i1, i3, i2);
      }
    }
    for (const s of [3, 7]) colliders.push(points[s][0], points[s][1], Math.max(0.1, widthAt(s / segs) * 0.9));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aUV', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aFlutter', new THREE.Float32BufferAttribute(flutter, 2));
  geometry.setIndex(indices);
  geometry.userData = { H, colliders };
  return geometry;
}

const VARIANTS = [6, 9, 12, 15, 18, 22, 27].flatMap((H, i) => [0, 1].map(j => buildKelpGeometry(H, 11 + i * 7 + j * 101)));

function pickVariant(needH) {
  const fits = VARIANTS.filter(g => g.userData.H >= needH);
  if (!fits.length) return VARIANTS[VARIANTS.length - 1];
  return fits[Math.floor(Math.random() * Math.min(4, fits.length))];
}

const LAYERS = {
  play: { fog: 0, bright: 1.22, tint: '#fff6d8' },
  mid: { z: -6.5, fog: 0.62, bright: 0.62, tint: '#bcd8dc', sway: 0.8, spacing: 3.6, max: 22, scale: [0.9, 1.3], hang: 0.35, up: [-0.75, 0.05], down: [0.1, 0.8] },
  far: { z: -15, fog: 0.78, bright: 0.6, tint: '#a9d0e0', sway: 0.95, spacing: 2.2, max: 36, scale: [1, 1.5], hang: 0.3, up: [-0.6, 0.35], down: [0.1, 0.85] },
  deep: { z: -26, fog: 0.9, bright: 0.55, tint: '#8fc2dc', sway: 1.1, spacing: 2.6, max: 42, scale: [1.2, 1.9], hang: 0.25, up: [-0.3, 0.8], down: [-0.1, 0.8] },
  near: { z: 7, fog: 0, bright: 0.2, tint: '#ffcf7a', sway: 0.6, spacing: 6, max: 12, scale: [1.1, 1.7], hang: 0.45, up: [-0.9, -0.76], down: [0.78, 0.9] }
};

const decor = ['deep', 'far', 'mid', 'near'].map(name => {
  const cfg = LAYERS[name];
  const items = [];
  for (let i = 0; i < cfg.max; i++) {
    const mesh = new THREE.Mesh(VARIANTS[0], kelpMaterial(cfg, cfg.sway * (reduceMotion ? 0.4 : 1)));
    mesh.position.z = cfg.z + rand(-1, 1) * (name === 'near' ? 0.5 : 1.2);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    items.push({ mesh });
  }
  return { name, cfg, items, span: 0, count: 0 };
});

function placeDecor(layer, item, x) {
  const { cfg } = layer;
  const hz = halfHAt(cfg.z);
  const hanging = Math.random() < cfg.hang;
  let sc = rand(cfg.scale[0], cfg.scale[1]);
  const tip = hz * (hanging ? rand(cfg.down[0], cfg.down[1]) : rand(cfg.up[0], cfg.up[1]));
  const need = hanging ? hz - tip + 2 : tip + hz + 2;
  const maxH = VARIANTS[VARIANTS.length - 1].userData.H;
  let variant = pickVariant(need / sc);
  if (variant.userData.H * sc < need) sc = need / maxH;
  const H = variant.userData.H * sc;
  const mesh = item.mesh;
  mesh.geometry = variant;
  mesh.scale.setScalar(sc);
  mesh.rotation.z = hanging ? Math.PI : 0;
  mesh.position.x = x;
  mesh.position.y = hanging ? tip + H : tip - H;
  mesh.material.uniforms.uPhase.value = rand(0, Math.PI * 2);
  mesh.visible = true;
}

function layoutDecor() {
  for (const layer of decor) {
    layer.span = 2 * halfWAt(layer.cfg.z) + 8;
    layer.count = Math.min(layer.cfg.max, Math.max(4, Math.ceil(layer.span / layer.cfg.spacing)));
    layer.items.forEach((item, i) => {
      if (i < layer.count) placeDecor(layer, item, -layer.span / 2 + ((i + rand(0.1, 0.9)) * layer.span) / layer.count);
      else item.mesh.visible = false;
    });
  }
}

function updateDecor(ds) {
  for (const layer of decor) {
    for (let i = 0; i < layer.count; i++) {
      const item = layer.items[i];
      item.mesh.position.x -= ds;
      if (item.mesh.position.x < -layer.span / 2) placeDecor(layer, item, item.mesh.position.x + layer.span + rand(-0.4, 0.4));
    }
  }
}

/* ---------- Light shafts ---------- */
const shafts = [];
for (let i = 0; i < 8; i++) {
  const material = new THREE.MeshBasicMaterial({
    map: shaftTexture, color: '#a8e0ff', transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rand(2.5, 6), 80), material);
  mesh.position.set(0, 12, -10.5);
  mesh.rotation.z = -0.3 + rand(-0.05, 0.05);
  mesh.renderOrder = -1;
  scene.add(mesh);
  shafts.push({ mesh, base: rand(0.08, 0.2), phase: rand(0, 6.28), speed: rand(0.15, 0.35), offset: i / 8 });
}

function updateShafts(ds, time) {
  const span = 2 * halfWAt(-10.5) + 24;
  for (const shaft of shafts) {
    shaft.offset -= (ds * 0.2) / span;
    if (shaft.offset < 0) shaft.offset += 1;
    shaft.mesh.position.x = -span / 2 + shaft.offset * span;
    shaft.mesh.material.opacity = shaft.base * (0.65 + 0.35 * Math.sin(time * shaft.speed + shaft.phase));
  }
}

/* ---------- Seafloor ---------- */
const floor = new THREE.Group();
floor.position.z = 0.9;
scene.add(floor);
const rockMaterial = new THREE.MeshStandardMaterial({ color: '#27363c', roughness: 1, flatShading: true });
const rockGeometries = [0, 1, 2].map(seed => {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const rnd = mulberry32(seed + 5);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + rnd() * 0.4;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
});
const speckColors = ['#c4559b', '#8a56c4', '#e8803a', '#3ab5b0', '#d45a6a'].map(c => new THREE.Color(c));
const CHUNK_WIDTH = 16;
const chunks = [];
for (let c = 0; c < 4; c++) {
  const chunk = new THREE.Group();
  const rocks = [];
  for (let i = 0; i < 9; i++) {
    const rock = new THREE.Mesh(rockGeometries[i % 3], rockMaterial);
    rock.position.set(-CHUNK_WIDTH / 2 + ((i + rand(0.1, 0.9)) * CHUNK_WIDTH) / 9, rand(-0.1, 0.35), rand(-0.6, 0.6));
    rock.scale.set(rand(1.2, 2.6), rand(0.7, 1.25), rand(0.9, 1.5));
    rock.rotation.set(rand(0, 1), rand(0, 6), rand(0, 0.5));
    chunk.add(rock);
    rocks.push(rock);
  }
  const specks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial(), 60);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < specks.count; i++) {
    const rock = rocks[Math.floor(Math.random() * rocks.length)];
    const dir = new THREE.Vector3(rand(-1, 1), rand(0.05, 1), rand(0, 1)).normalize();
    dummy.position.set(rock.position.x + dir.x * rock.scale.x * 0.95, rock.position.y + dir.y * rock.scale.y * 0.95, rock.position.z + dir.z * rock.scale.z * 0.95);
    dummy.scale.setScalar(rand(0.6, 1.5));
    dummy.updateMatrix();
    specks.setMatrixAt(i, dummy.matrix);
    specks.setColorAt(i, speckColors[i % speckColors.length]);
  }
  chunk.add(specks);
  chunk.position.x = -CHUNK_WIDTH * 1.5 + c * CHUNK_WIDTH;
  floor.add(chunk);
  chunks.push(chunk);
}

function updateFloor(ds) {
  const total = CHUNK_WIDTH * chunks.length;
  for (const chunk of chunks) {
    chunk.position.x -= ds * 1.0;
    if (chunk.position.x < -total / 2 - CHUNK_WIDTH * 0.5) chunk.position.x += total;
  }
}

/* ---------- Marine snow & bursts ---------- */
const SNOW = 280;
const snowPositions = new Float32Array(SNOW * 3);
for (let i = 0; i < SNOW; i++) {
  snowPositions[i * 3] = rand(-40, 40);
  snowPositions[i * 3 + 1] = rand(-14, 14);
  snowPositions[i * 3 + 2] = rand(-14, 8);
}
const snowGeometry = new THREE.BufferGeometry();
snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
const snow = new THREE.Points(snowGeometry, new THREE.PointsMaterial({
  map: glowTexture, color: '#bfe4f0', size: 0.2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
}));
snow.frustumCulled = false;
scene.add(snow);

function updateSnow(ds, dt) {
  for (let i = 0; i < SNOW; i++) {
    const k = i * 3;
    const depth = (snowPositions[k + 2] + 14) / 22;
    snowPositions[k] -= ds * (0.6 + depth * 0.4) + dt * 0.08;
    snowPositions[k + 1] += dt * (0.05 + (i % 7) * 0.012);
    if (snowPositions[k] < -40) snowPositions[k] += 80;
    if (snowPositions[k + 1] > 14) snowPositions[k + 1] = -14;
  }
  snowGeometry.attributes.position.needsUpdate = true;
}

const BURSTS = 220;
const burstPositions = new Float32Array(BURSTS * 3).fill(1000);
const burstColors = new Float32Array(BURSTS * 3);
const burstVel = new Float32Array(BURSTS * 3);
const burstLife = new Float32Array(BURSTS);
const burstMax = new Float32Array(BURSTS);
const burstBase = new Float32Array(BURSTS * 3);
const burstGeometry = new THREE.BufferGeometry();
burstGeometry.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3).setUsage(THREE.DynamicDrawUsage));
burstGeometry.setAttribute('color', new THREE.BufferAttribute(burstColors, 3).setUsage(THREE.DynamicDrawUsage));
const bursts = new THREE.Points(burstGeometry, new THREE.PointsMaterial({
  map: glowTexture, size: 0.34, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
}));
bursts.frustumCulled = false;
bursts.position.z = 1.2;
scene.add(bursts);
let burstCursor = 0;

function emit(x, y, color, count, power, rise = 0) {
  const c = new THREE.Color(color);
  for (let n = 0; n < count; n++) {
    const i = burstCursor++ % BURSTS, k = i * 3;
    const angle = rand(0, Math.PI * 2), speed = rand(0.2, 1) * power;
    burstPositions[k] = x;
    burstPositions[k + 1] = y;
    burstPositions[k + 2] = rand(-0.2, 0.2);
    burstVel[k] = Math.cos(angle) * speed;
    burstVel[k + 1] = Math.sin(angle) * speed + rise;
    burstBase[k] = c.r; burstBase[k + 1] = c.g; burstBase[k + 2] = c.b;
    burstLife[i] = burstMax[i] = rand(0.5, 1.2);
  }
}

function updateBursts(ds, dt) {
  for (let i = 0; i < BURSTS; i++) {
    if (burstLife[i] <= 0) continue;
    const k = i * 3;
    burstLife[i] -= dt;
    const fade = Math.max(0, burstLife[i] / burstMax[i]);
    burstPositions[k] += burstVel[k] * dt - ds;
    burstPositions[k + 1] += burstVel[k + 1] * dt;
    burstVel[k] *= 0.97;
    burstVel[k + 1] = burstVel[k + 1] * 0.97 + dt * 0.5;
    burstColors[k] = burstBase[k] * fade;
    burstColors[k + 1] = burstBase[k + 1] * fade;
    burstColors[k + 2] = burstBase[k + 2] * fade;
    if (burstLife[i] <= 0) burstPositions[k + 1] = 1000;
  }
  burstGeometry.attributes.position.needsUpdate = true;
  burstGeometry.attributes.color.needsUpdate = true;
}

/* ---------- Fish ---------- */
function flatShape(points, material) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) shape.lineTo(...points[i]);
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

const parcelMaterial = new THREE.MeshStandardMaterial({ color: '#f1e4c0', emissive: '#a88a40', emissiveIntensity: 0.35, roughness: 0.7 });
const ribbonMaterial = new THREE.MeshBasicMaterial({ color: '#d8453d' });
const stringMaterial = new THREE.MeshBasicMaterial({ color: '#e9dcae' });
const parcelGeometries = {
  box: new THREE.BoxGeometry(0.34, 0.26, 0.24),
  ribbonA: new THREE.BoxGeometry(0.06, 0.27, 0.25),
  ribbonB: new THREE.BoxGeometry(0.35, 0.05, 0.25),
  string: new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4)
};

function makeParcel(withString) {
  const parcel = new THREE.Group();
  parcel.add(
    new THREE.Mesh(parcelGeometries.box, parcelMaterial),
    new THREE.Mesh(parcelGeometries.ribbonA, ribbonMaterial),
    new THREE.Mesh(parcelGeometries.ribbonB, ribbonMaterial)
  );
  if (withString) {
    const string = new THREE.Mesh(parcelGeometries.string, stringMaterial);
    string.position.y = 0.2;
    parcel.add(string);
  }
  return parcel;
}

const fish = (() => {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.5, emissive: '#ff4d00', emissiveIntensity: 0.28 });
  const fin = new THREE.MeshStandardMaterial({ color: '#ff9a3a', roughness: 0.6, emissive: '#ff5a10', emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), body);
  torso.scale.set(1.2, 0.72, 0.46);
  group.add(torso);

  const tail = new THREE.Group();
  tail.position.set(-0.5, 0, 0);
  const tailFin = flatShape([[0, 0.05], [-0.55, 0.42], [-0.42, 0], [-0.55, -0.42], [0, -0.05]], fin);
  tail.add(tailFin);
  group.add(tail);

  const dorsal = flatShape([[-0.25, 0.28], [-0.05, 0.62], [0.28, 0.3]], fin);
  group.add(dorsal);
  const pectoral = new THREE.Group();
  pectoral.position.set(0.12, -0.08, 0.2);
  pectoral.add(flatShape([[0, 0], [-0.3, -0.12], [-0.05, -0.22]], fin));
  group.add(pectoral);

  const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  const eyeDark = new THREE.MeshStandardMaterial({ color: '#0a1620', roughness: 0.2 });
  for (const z of [0.15, -0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), eyeWhite);
    eye.position.set(0.36, 0.1, z);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyeDark);
    pupil.position.set(0.04, 0, Math.sign(z) * 0.06);
    eye.add(pupil);
    group.add(eye);
  }

  const parcel = makeParcel(true);
  parcel.position.set(-0.02, -0.5, 0);
  group.add(parcel);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: '#ff9a40', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(3.2, 3.2, 1);
  halo.position.z = -0.3;
  group.add(halo);

  group.scale.setScalar(1.25);
  group.position.z = 0.8;
  scene.add(group);
  return { group, tail, pectoral, parcel, pop: 0, y: 0, vy: 0, target: 0 };
})();

/* ---------- Gates, pearls, drop-offs ---------- */
const gates = [];
const pearlMaterial = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe9b0', emissiveIntensity: 0.9, roughness: 0.2 });
const pearlGeometry = new THREE.SphereGeometry(0.2, 16, 12);
const haloMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: '#ffe9a8', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

function spawnGate(x, centerY, gap, decorative) {
  const tipB = centerY - gap / 2, tipT = centerY + gap / 2;
  const defs = [
    { dir: 1, tip: tipB, dx: 0 },
    { dir: 1, tip: tipB - rand(0.8, 2), dx: rand(1, 1.7) * sign() },
    { dir: -1, tip: tipT, dx: rand(-0.4, 0.4) },
    { dir: -1, tip: tipT + rand(0.8, 2), dx: rand(1, 1.7) * sign() }
  ];
  const sway = (0.5 + Math.min(0.45, state.distance / 900)) * (reduceMotion ? 0.4 : 1);
  const stalks = defs.map(def => {
    const need = def.dir > 0 ? def.tip + view.halfH + 3 : view.halfH - def.tip + 3;
    const geometry = pickVariant(need);
    const H = geometry.userData.H;
    const mesh = new THREE.Mesh(geometry, kelpMaterial(LAYERS.play, sway));
    mesh.frustumCulled = false;
    mesh.rotation.z = def.dir > 0 ? 0 : Math.PI;
    mesh.position.set(x + def.dx, def.dir > 0 ? def.tip - H : def.tip + H, 0);
    scene.add(mesh);
    return { mesh, dir: def.dir, dx: def.dx, colliders: geometry.userData.colliders, sway };
  });
  const gate = { x, cy: centerY, gap, stalks, passed: false, decorative, pearl: null };
  if (!decorative && Math.random() < 0.75) {
    const pearl = new THREE.Group();
    pearl.add(new THREE.Mesh(pearlGeometry, pearlMaterial));
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(1.2, 1.2, 1);
    pearl.add(halo);
    pearl.position.set(x, centerY + rand(-0.5, 0.5), 0.6);
    scene.add(pearl);
    gate.pearl = { mesh: pearl, baseY: pearl.position.y, phase: rand(0, 6) };
  }
  gates.push(gate);
}

function removeGate(gate) {
  for (const s of gate.stalks) {
    scene.remove(s.mesh);
    s.mesh.material.dispose();
  }
  if (gate.pearl) scene.remove(gate.pearl.mesh);
  gates.splice(gates.indexOf(gate), 1);
}

function clearWorld() {
  while (gates.length) removeGate(gates[0]);
  if (dropoff) removeDropoff();
}

let dropoff = null;
function spawnDropoff(x) {
  const group = new THREE.Group();
  const gold = new THREE.MeshBasicMaterial({ color: '#ffe58a' });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 12, 48), gold);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.55, 40), new THREE.MeshBasicMaterial({ color: '#ffd96a', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  const column = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 60), new THREE.MeshBasicMaterial({ map: shaftTexture, color: '#ffe9a0', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  column.position.z = -0.4;
  group.add(column, disc, ring);
  const y = clamp(rand(-2.5, 2.5), view.playMin + 1.8, view.playMax - 1.8);
  group.position.set(x, y, 0.2);
  scene.add(group);
  dropoff = { group, ring, disc, x, y, stage: 0, t: 0, flash: 0, from: new THREE.Vector3(), delivered: null, pickup: null };
}

function removeDropoff() {
  for (const parcel of [dropoff.delivered, dropoff.pickup]) if (parcel) scene.remove(parcel);
  fish.parcel.visible = true;
  scene.remove(dropoff.group);
  dropoff.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  dropoff = null;
}

/* ---------- Game state ---------- */
const MAX_LIVES = 3;
const DROP_INTERVAL = 180;
const bestKey = 'kelp-courier-best';
let best = 0;
try { best = Number(localStorage.getItem(bestKey)) || 0; } catch { /* storage unavailable */ }

const state = {
  mode: 'ready', playTime: 0, distance: 0, pearls: 0, deliveries: 0, lives: MAX_LIVES,
  gateIndex: 0, countdown: 0, lastCenter: 0, nextDrop: DROP_INTERVAL, lastDrop: 0, dropPending: false,
  invuln: 0, stumble: 1, shake: 0, dyingTime: 0, resumeMode: 'playing', time: 0
};

/* ---------- Original orchestral-style soundtrack ---------- */
const music = {
  enabled: true, context: null, master: null, timer: null, generation: 0, nextBeat: 0, step: 0
};
const musicChords = [
  { bass: 50, notes: [62, 66, 69] },
  { bass: 47, notes: [59, 62, 66] },
  { bass: 43, notes: [55, 59, 62] },
  { bass: 45, notes: [57, 61, 64] }
];
const musicMelody = [
  86, 81, 83, 86, 90, 86,
  85, 81, 78, 81, 85, 81,
  83, 79, 74, 79, 83, 86,
  85, 81, 76, 81, 85, 88
];
const musicTempo = 126;
const midiFrequency = note => 440 * 2 ** ((note - 69) / 12);

function playMusicNote(note, time, duration, volume, type, attack = 0.025, cutoff = 4600) {
  const context = music.context;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(midiFrequency(note), time);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, time);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.linearRampToValueAtTime(volume, time + attack);
  envelope.gain.setValueAtTime(volume, time + duration * 0.72);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(filter);
  filter.connect(envelope);
  envelope.connect(music.master);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

function scheduleMusicStep(time, step) {
  const stepInBar = step % 6;
  const chord = musicChords[Math.floor(step / 6) % musicChords.length];
  if (stepInBar === 0) {
    chord.notes.forEach(note => playMusicNote(note, time, 1.32, 0.01, 'sawtooth', 0.16, 1500));
  }
  if (stepInBar === 0 || stepInBar === 3) {
    const bass = stepInBar === 0 ? chord.bass : chord.bass + 7;
    playMusicNote(bass, time, 0.32, 0.055, 'triangle', 0.018, 1000);
  }
  const arpeggio = chord.notes[[0, 1, 2, 1, 2, 1][stepInBar]];
  playMusicNote(arpeggio + 12, time, 0.18, stepInBar === 0 || stepInBar === 3 ? 0.024 : 0.016, 'triangle');
  playMusicNote(musicMelody[step % musicMelody.length], time, 0.205, 0.032, 'sawtooth', 0.018, 2800);
}

function syncMusic() {
  const shouldPlay = music.enabled && state.mode === 'playing';
  const generation = ++music.generation;
  if (!shouldPlay) {
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
    if (music.master && music.context?.state !== 'closed') {
      const now = music.context.currentTime;
      music.master.gain.cancelScheduledValues(now);
      music.master.gain.setTargetAtTime(0.0001, now, 0.18);
    }
    return;
  }

  if (!music.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      music.enabled = false;
      musicButtonState();
      ui.musicButton.disabled = true;
      ui.musicButton.setAttribute('aria-label', 'Audio is not supported in this browser');
      return;
    }
    music.context = new AudioContextClass();
    music.master = music.context.createGain();
    music.master.gain.value = 0.0001;
    music.master.connect(music.context.destination);
  }

  music.context.resume().then(() => {
    if (generation !== music.generation || !music.enabled || state.mode !== 'playing') return;
    if (music.timer) clearInterval(music.timer);
    const now = music.context.currentTime;
    music.master.gain.cancelScheduledValues(now);
    music.master.gain.setTargetAtTime(0.48, now, 0.35);
    music.step = 0;
    music.nextBeat = now + 0.08;
    music.timer = setInterval(() => {
      const contextTime = music.context.currentTime;
      while (music.nextBeat < contextTime + 0.3) {
        scheduleMusicStep(music.nextBeat, music.step);
        music.nextBeat += 30 / musicTempo;
        music.step += 1;
      }
    }, 80);
  }).catch(error => {
    console.error('Could not start the Kelp Courier soundtrack:', error);
    toast('The soundtrack could not start.');
  });
}

function musicButtonState() {
  ui.musicButton.setAttribute('aria-pressed', String(music.enabled));
  ui.musicButton.setAttribute('aria-label', music.enabled ? 'Turn music off' : 'Turn music on');
  ui.musicButton.title = music.enabled ? 'Turn music off (M)' : 'Turn music on (M)';
}

const score = () => Math.floor(state.distance) + state.pearls * 10 + state.deliveries * 50;

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.state = mode;
}

function showPanel(kind) {
  panel.hidden = false;
  ui.stats.hidden = kind !== 'over';
  ui.controls.hidden = kind === 'over' || kind === 'paused';
  ui.button.hidden = false;
  if (kind === 'ready') {
    ui.eyebrow.textContent = 'A SMALL JOB IN A BIG FOREST';
    ui.title.innerHTML = 'Kelp<br><em>Courier.</em>';
    ui.copy.textContent = 'Carry the parcel through the forest. Slip through the gaps in the swaying kelp, collect pearls, and make every drop-off.';
    ui.buttonLabel.textContent = 'DIVE IN';
  } else if (kind === 'paused') {
    ui.eyebrow.textContent = 'CURRENT HELD STILL';
    ui.title.innerHTML = 'Take a<br><em>breath.</em>';
    ui.copy.textContent = 'The kelp will keep swaying. Your parcel is safe.';
    ui.buttonLabel.textContent = 'RESUME';
  } else {
    ui.eyebrow.textContent = 'THE PARCEL WAS LOST';
    ui.title.innerHTML = 'Tangled<br><em>up.</em>';
    ui.copy.textContent = state.distance >= 1 ? `You carried it ${Math.floor(state.distance)} m through the forest.` : 'The forest wins this time.';
    ui.finalScore.textContent = score();
    ui.bestScore.textContent = best;
    ui.finalDeliveries.textContent = state.deliveries;
    ui.buttonLabel.textContent = 'TRY AGAIN';
  }
  ui.button.focus({ preventScroll: true });
}

function startGame() {
  clearWorld();
  Object.assign(state, {
    playTime: 0, distance: 0, pearls: 0, deliveries: 0, lives: MAX_LIVES, gateIndex: 0, countdown: 0,
    lastCenter: 0, nextDrop: DROP_INTERVAL, lastDrop: 0, dropPending: false, invuln: 0, stumble: 1, shake: 0
  });
  fish.y = fish.target = 0;
  fish.group.rotation.z = 0;
  fish.group.visible = true;
  fish.parcel.visible = true;
  fish.pop = 0;
  document.body.dataset.hint = 'on';
  setTimeout(() => { document.body.dataset.hint = 'off'; }, 7000);
  setMode('playing');
  syncMusic();
  renderHud(true);
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  setMode('paused');
  syncMusic();
  showPanel('paused');
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  panel.hidden = true;
  setMode('playing');
  syncMusic();
}

function primaryAction() {
  if (state.mode === 'ready' || state.mode === 'over') startGame();
  else if (state.mode === 'paused') resumeGame();
}

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ui.toast.classList.remove('show'), 1800);
}

function hit() {
  if (state.invuln > 0 || state.mode !== 'playing') return;
  state.lives -= 1;
  state.invuln = 1.7;
  state.stumble = 0.12;
  state.shake = reduceMotion ? 0 : 0.6;
  emit(view.fishX, fish.y, '#ffb050', 26, 3);
  emit(view.fishX, fish.y, '#bfe9ff', 10, 1.5, 1);
  if (state.lives <= 0) {
    setMode('dying');
    state.dyingTime = 0;
    emit(view.fishX, fish.y, '#ffd890', 40, 4);
  }
  renderHud(true);
}

function finishRun() {
  const final = score();
  if (final > best) {
    best = final;
    try { localStorage.setItem(bestKey, String(best)); } catch { /* storage unavailable */ }
  }
  setMode('over');
  syncMusic();
  showPanel('over');
}

/* ---------- Input ---------- */
const keys = { up: false, down: false };
const touchAnchor = { active: false, pointerY: 0, targetY: 0 };
const pointerWorldY = event => {
  const rect = stage.getBoundingClientRect();
  return -(((event.clientY - rect.top) / rect.height) * 2 - 1) * view.halfH;
};

stage.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse') {
    fish.target = pointerWorldY(event);
    return;
  }
  stage.setPointerCapture(event.pointerId);
  Object.assign(touchAnchor, { active: true, pointerY: pointerWorldY(event), targetY: fish.target });
});
stage.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse') fish.target = pointerWorldY(event);
  else if (touchAnchor.active) fish.target = touchAnchor.targetY + (pointerWorldY(event) - touchAnchor.pointerY);
});
const endTouch = () => { touchAnchor.active = false; };
stage.addEventListener('pointerup', endTouch);
stage.addEventListener('pointercancel', endTouch);

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === ' ' || key === 'enter') {
    if (!panel.hidden) { event.preventDefault(); primaryAction(); }
    return;
  }
  if (key === 'arrowup' || key === 'w') { keys.up = true; event.preventDefault(); }
  else if (key === 'arrowdown' || key === 's') { keys.down = true; event.preventDefault(); }
  else if (key === 'p' || key === 'escape') {
    if (state.mode === 'playing') pauseGame();
    else if (state.mode === 'paused') resumeGame();
  } else if (key === 'm') {
    music.enabled = !music.enabled;
    musicButtonState();
    syncMusic();
  }
});
window.addEventListener('keyup', event => {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') keys.up = false;
  else if (key === 'arrowdown' || key === 's') keys.down = false;
});
window.addEventListener('blur', () => { keys.up = keys.down = false; pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
ui.button.addEventListener('click', primaryAction);
ui.pause.addEventListener('click', () => (state.mode === 'paused' ? resumeGame() : pauseGame()));
ui.musicButton.addEventListener('click', () => {
  music.enabled = !music.enabled;
  musicButtonState();
  syncMusic();
});
musicButtonState();

/* ---------- HUD ---------- */
const heartSvg = '<svg class="life" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12 9 7v10zM9 12c0-3 3-5 6-5s6 2.5 6 5-3 5-6 5-6-2-6-5z" fill="#ff8a2a"/><circle cx="17.5" cy="11" r="1.1" fill="#fff"/></svg>';
let hudCache = '';
function renderHud(force) {
  const key = `${score()}|${Math.floor(state.distance)}|${state.pearls}|${state.deliveries}|${state.lives}`;
  if (key !== hudCache || force) {
    hudCache = key;
    ui.score.textContent = score();
    ui.distance.textContent = Math.floor(state.distance);
    ui.pearls.textContent = state.pearls;
    ui.deliveries.textContent = state.deliveries;
    ui.lives.innerHTML = Array.from({ length: MAX_LIVES }, (_, i) => (i < state.lives ? heartSvg : heartSvg.replace('class="life"', 'class="life lost"'))).join('');
    ui.lives.setAttribute('aria-label', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left`);
  }
  const progress = clamp((state.distance - state.lastDrop) / (state.nextDrop - state.lastDrop), 0, 1);
  ui.dropFill.style.width = `${progress * 100}%`;
  ui.dropDistance.textContent = `${Math.max(0, Math.ceil(state.nextDrop - state.distance))} m`;
}

/* ---------- Layout ---------- */
function layout() {
  const width = stage.clientWidth || 1, height = stage.clientHeight || 1;
  const aspect = width / height;
  renderer.setSize(width, height, false);
  view.halfH = Math.min(Math.max(6.8, 8.5 / aspect), 13);
  view.halfW = view.halfH * aspect;
  view.dist = view.halfH / tanHalf;
  view.fringe = Math.max(1.5, view.halfH * 0.2);
  view.fishX = -Math.min(view.halfW * 0.4, 5.5);
  view.playMin = -view.halfH + view.fringe + 0.3;
  view.playMax = view.halfH - view.fringe * 0.6 - 0.3;
  camera.aspect = aspect;
  camera.position.set(0, 0, view.dist);
  camera.updateProjectionMatrix();
  floor.position.y = -view.halfH;
  floor.scale.y = view.fringe / 1.7;
  fish.target = clamp(fish.target, view.playMin, view.playMax);
  layoutDecor();
}
new ResizeObserver(layout).observe(stage);

/* ---------- Update ---------- */
const speedFor = time => 4.6 + 3.4 * (1 - Math.exp(-time / 80));

function updateGates(ds) {
  const playing = state.mode === 'playing';
  const spawnX = view.halfW + 4;
  state.countdown -= ds;
  if (state.countdown <= 0 && (playing || state.mode === 'ready' || state.mode === 'over')) {
    const x = spawnX + state.countdown;
    if (playing && !state.dropPending && state.distance + (spawnX - view.fishX) >= state.nextDrop) {
      spawnDropoff(x);
      state.dropPending = true;
      state.countdown = 7;
    } else {
      const gap = Math.max(3.4, 4.8 - state.gateIndex * 0.04);
      const lo = view.playMin + gap / 2 - 0.2, hi = view.playMax - gap / 2 + 0.2;
      const low = Math.max(lo, -4.6, state.lastCenter - 4.5), high = Math.min(hi, 4.6, state.lastCenter + 4.5);
      const center = low < high ? rand(low, high) : clamp(state.lastCenter, lo, Math.max(lo, hi));
      state.lastCenter = center;
      spawnGate(x, center, gap, !playing);
      state.gateIndex += 1;
      state.countdown = Math.max(6.6, 9.2 - state.gateIndex * 0.05) + rand(-0.6, 0.6);
    }
  }

  for (let i = gates.length - 1; i >= 0; i--) {
    const gate = gates[i];
    gate.x -= ds;
    for (const s of gate.stalks) s.mesh.position.x = gate.x + s.dx;
    if (gate.pearl) {
      gate.pearl.mesh.position.x = gate.x;
      gate.pearl.mesh.position.y = gate.pearl.baseY + Math.sin(state.time * 2 + gate.pearl.phase) * 0.12;
    }
    if (!gate.passed && gate.x < view.fishX - 1.6) gate.passed = true;
    if (gate.x < -(view.halfW + 6)) removeGate(gate);
  }
}

function checkCollisions() {
  const t = sharedTime.value;
  const circles = [[view.fishX + 0.35, fish.y, 0.3], [view.fishX - 0.3, fish.y, 0.3]];
  for (const gate of gates) {
    if (Math.abs(gate.x - view.fishX) > 4.2) continue;
    if (gate.pearl) {
      const p = gate.pearl.mesh.position;
      if ((p.x - view.fishX) ** 2 + (p.y - fish.y) ** 2 < 0.8) {
        state.pearls += 1;
        emit(p.x, p.y, '#fff0b8', 14, 2.4);
        scene.remove(gate.pearl.mesh);
        gate.pearl = null;
      }
    }
    for (const s of gate.stalks) {
      const phase = s.mesh.material.uniforms.uPhase.value;
      const c = s.colliders;
      for (let i = 0; i < c.length; i += 3) {
        const lx = c[i] + swayX(c[i + 1], t, phase, s.sway);
        const wx = s.mesh.position.x + (s.dir > 0 ? lx : -lx);
        const wy = s.mesh.position.y + (s.dir > 0 ? c[i + 1] : -c[i + 1]);
        const r = c[i + 2] * 0.8;
        for (const [cx, cy, cr] of circles) {
          if ((wx - cx) ** 2 + (wy - cy) ** 2 < (r + cr) ** 2) return hit();
        }
      }
    }
  }
}

const smooth = k => k * k * (3 - 2 * k);
const parcelWorld = new THREE.Vector3();

function updateDropoff(ds, dt) {
  const d = dropoff;
  if (!d) return;
  d.x -= ds;
  d.group.position.x = d.x;
  d.flash = Math.max(0, d.flash - dt * 1.5);
  const pulse = 1 + Math.sin(state.time * 4) * 0.04 + d.flash * 0.22;
  d.ring.scale.set(pulse, pulse, 1);
  d.disc.material.opacity = 0.18 + d.flash * 0.45;

  if (d.stage === 0 && state.mode === 'playing' && d.x < view.fishX + 0.9) {
    state.lastDrop = state.nextDrop;
    state.nextDrop += DROP_INTERVAL;
    state.dropPending = false;
    if (Math.abs(fish.y - d.y) < 1.8) {
      fish.parcel.getWorldPosition(d.from);
      d.delivered = makeParcel(false);
      d.delivered.scale.setScalar(1.25);
      d.delivered.position.copy(d.from);
      scene.add(d.delivered);
      fish.parcel.visible = false;
      d.stage = 1;
      d.t = 0;
    } else {
      toast('DROP-OFF MISSED');
      d.stage = 4;
    }
  }

  if (d.stage === 1) {
    d.t += dt / 0.7;
    const e = smooth(Math.min(1, d.t));
    d.delivered.position.set(lerp(d.from.x, d.x, e), lerp(d.from.y, d.y, e) + Math.sin(Math.PI * e) * 0.9, 0.9);
    d.delivered.rotation.z = e * Math.PI * 2;
    if (d.t >= 1) {
      d.stage = 2;
      d.flash = 1;
      state.deliveries += 1;
      if (state.lives < MAX_LIVES) state.lives += 1;
      emit(d.x, d.y, '#ffe58a', 50, 4);
      toast('PARCEL DELIVERED  +50');
    }
  } else if (d.stage >= 2 && d.delivered) {
    d.delivered.rotation.z = Math.sin(state.time * 2) * 0.08;
    d.delivered.position.set(d.x, d.y + Math.sin(state.time * 2.5) * 0.08, 0.9);
  }

  if (d.stage === 2 && state.mode === 'playing' && d.x < view.fishX - 0.3) {
    d.pickup = makeParcel(false);
    d.pickup.scale.setScalar(1.25);
    d.pickup.position.set(d.x, d.y, 0.9);
    scene.add(d.pickup);
    d.flash = 0.8;
    emit(d.x, d.y, '#fff0b8', 14, 2.5);
    d.stage = 3;
    d.t = 0;
  }

  if (d.stage === 3) {
    d.t += dt / 0.55;
    const e = smooth(Math.min(1, d.t));
    fish.parcel.getWorldPosition(parcelWorld);
    d.pickup.position.set(lerp(d.x, parcelWorld.x, e), lerp(d.y, parcelWorld.y, e) + Math.sin(Math.PI * e) * 0.6, 0.9);
    d.pickup.rotation.z = (1 - e) * Math.PI;
    if (d.t >= 1) {
      scene.remove(d.pickup);
      d.pickup = null;
      fish.parcel.visible = true;
      fish.pop = 1;
      emit(view.fishX, fish.y - 0.5, '#fff0b8', 10, 1.8);
      d.stage = 4;
    }
  }

  if (d.x < -(view.halfW + 5)) removeDropoff();
}

function updateFish(dt, ds) {
  const t = state.time;
  if (state.mode === 'ready' || state.mode === 'over') {
    const next = gates.find(g => g.x > view.fishX - 1.5);
    fish.target = next ? next.cy + Math.sin(t * 1.3) * 0.4 : Math.sin(t * 0.7) * 1.5;
  } else if (state.mode === 'playing') {
    if (keys.up) fish.target += 9 * dt;
    if (keys.down) fish.target -= 9 * dt;
  }
  fish.target = clamp(fish.target, view.playMin, view.playMax);

  if (state.mode === 'dying') {
    fish.vy = lerp(fish.vy, -1.2, 0.05);
    fish.y += fish.vy * dt;
    fish.group.rotation.z += dt * 5;
  } else {
    fish.vy = clamp((fish.target - fish.y) * 9, -13, 13);
    fish.y += fish.vy * dt;
    fish.group.rotation.z = lerp(fish.group.rotation.z, clamp(fish.vy * 0.05, -0.5, 0.5), 0.2);
  }
  const flick = Math.sin(t * (12 + ds * 1.5)) * 0.35;
  fish.tail.rotation.z = flick;
  fish.pectoral.rotation.z = Math.sin(t * 9) * 0.4;
  fish.parcel.rotation.z = -fish.group.rotation.z * 0.8 + Math.sin(t * 4) * 0.05;
  fish.pop = Math.max(0, fish.pop - dt / 0.35);
  fish.parcel.scale.setScalar(1 + fish.pop * 0.7);
  fish.group.position.set(view.fishX, fish.y + Math.sin(t * 3) * 0.04, 0.8);
  fish.group.visible = state.invuln > 0 && state.mode === 'playing' ? Math.floor(t * 14) % 2 === 0 : true;
  if (state.mode !== 'paused' && Math.random() < dt * 5) emit(view.fishX + 0.7, fish.y + 0.12, '#cdefff', 1, 0.15, 0.6);
}

function update(dt) {
  if (state.mode === 'paused') return;
  state.time += dt;
  sharedTime.value += dt;

  let speed;
  if (state.mode === 'playing') {
    state.playTime += dt;
    state.stumble = Math.min(1, state.stumble + dt * 0.9);
    speed = speedFor(state.playTime) * state.stumble;
    state.invuln = Math.max(0, state.invuln - dt);
  } else if (state.mode === 'dying') {
    state.dyingTime += dt;
    speed = lerp(3, 0.2, Math.min(1, state.dyingTime / 0.9));
    if (state.dyingTime > 1.2) finishRun();
  } else {
    speed = 2.2;
  }
  const ds = speed * dt;

  if (state.mode === 'playing') state.distance += ds;
  updateDecor(ds);
  updateFloor(ds);
  updateShafts(ds, state.time);
  updateSnow(ds, dt);
  updateGates(ds);
  updateDropoff(ds, dt);
  updateFish(dt, ds);
  if (state.mode === 'playing') checkCollisions();
  updateBursts(ds, dt);
  renderHud(false);

  state.shake = Math.max(0, state.shake - dt * 1.6);
  camera.position.set((Math.random() - 0.5) * state.shake * 0.5, (Math.random() - 0.5) * state.shake * 0.5, view.dist);
}

/* ---------- Boot ---------- */
layout();
setMode('ready');
showPanel('ready');
renderHud(true);
for (const offset of [5.5, 14]) {
  state.lastCenter = clamp(state.lastCenter + rand(-3, 3), -2.5, 2.5);
  spawnGate(view.fishX + offset, state.lastCenter, 4.8, true);
}
state.countdown = view.halfW + 4 - (view.fishX + 22);

let previous = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
