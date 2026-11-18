import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = selector => document.querySelector(selector);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Cradle constants -------------------------------------------------------
const R = 0.5;                 // ball radius
const D = R * 2;               // ball spacing (touching at rest)
const L = 4.4;                 // effective pendulum length
const ZS = 1.1;                // half-width of the V string suspension
const FEET = 0.3;
const SLAB = 0.35;
const BASE_TOP = FEET + SLAB;
const REST_Y = BASE_TOP + 0.4 + R;
const H = REST_Y + L;          // pivot (rail) height
const G = 24;                  // gravity in scene units
const MAX_ANGLE = 1.1;
const LAUNCH_ANGLE = 0.72;
const SUBSTEP = 1 / 480;
const CENTER_Y = 3.1;

const FINISHES = [
  { name: 'Chrome', metal: 1, rough: 0.05, color: () => new THREE.Color(0xf4f7ff), glow: () => new THREE.Color(0x8fb4ff), base: 0 },
  { name: 'Gold', metal: 1, rough: 0.14, color: () => new THREE.Color(0xffc04d), glow: () => new THREE.Color(0xff9d2e), base: 0 },
  { name: 'Rainbow', metal: 0.85, rough: 0.1, color: (i, n) => new THREE.Color().setHSL(i / n * 0.85, 0.8, 0.55), glow: (i, n) => new THREE.Color().setHSL(i / n * 0.85, 0.9, 0.6), base: 0 },
  { name: 'Neon', metal: 0.3, rough: 0.2, color: () => new THREE.Color(0x10162a), glow: (i, n) => new THREE.Color().setHSL(0.5 + i / Math.max(1, n - 1) * 0.35, 1, 0.55), base: 0.55 },
];

// ---- Renderer, scene, camera ------------------------------------------------
const host = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const target = new THREE.Vector3(0, CENTER_Y, 0);

// Registered before OrbitControls so a ball grab can disable orbiting first.
canvas.addEventListener('pointerdown', onPointerDown);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 5;
controls.maxDistance = 60;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.autoRotateSpeed = 1.6;
controls.zoomToCursor = false;

// ---- Lights -----------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xbfcfff, 0x2a2438, 0.55));

const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
key.position.set(7, 15, 9);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -14;
key.shadow.camera.right = key.shadow.camera.top = 14;
key.shadow.camera.near = 1;
key.shadow.camera.far = 45;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
key.shadow.radius = 4;
scene.add(key);

const fill = new THREE.DirectionalLight(0x7f9cff, 1.1);
fill.position.set(-9, 6, -7);
scene.add(fill);

const under = new THREE.DirectionalLight(0xffb27a, 0.7);
under.position.set(2, -8, 4);
scene.add(under);

// ---- Backdrop cues (visible from every angle) -------------------------------
const floorShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.ShadowMaterial({ opacity: 0.42 })
);
floorShadow.rotation.x = -Math.PI / 2;
floorShadow.receiveShadow = true;
scene.add(floorShadow);

const grid = new THREE.PolarGridHelper(18, 18, 9, 96, 0x5f78c8, 0x3a4678);
grid.position.y = 0.004;
grid.material.transparent = true;
grid.material.opacity = 0.2;
grid.material.depthWrite = false;
scene.add(grid);

const dust = (() => {
  const count = reduceMotion ? 250 : 700;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 18 + Math.random() * 40;
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(a), CENTER_Y + r * u, r * s * Math.sin(a)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xaab6ff, size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false,
  }));
  scene.add(pts);
  return pts;
})();

// ---- Materials & shared geometry --------------------------------------------
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4b2d1b';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 256;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,10,4' : '130,84,48'},${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5, metalness: 0.05 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9b25f, metalness: 1, roughness: 0.28 });
const stringMat = new THREE.MeshStandardMaterial({ color: 0xcfd6ea, roughness: 0.6, metalness: 0.2 });
const ballGeo = new THREE.SphereGeometry(R, 64, 48);
const stringGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6, 1, true);
stringGeo.translate(0, 0.5, 0);
const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 24);
const capGeo = new THREE.SphereGeometry(0.15, 20, 16);
const footGeo = new THREE.CylinderGeometry(0.16, 0.2, FEET, 20);

// ---- Cradle state -----------------------------------------------------------
let cradle = null;
let n = 5;
let finishIndex = 0;
const sim = { theta: [], omega: [], held: [], x0: [], glow: [] };
const settings = { friction: false, paused: false, timeScale: 1, sound: true, hover: -1 };

function rod(parent, a, b, radius, mat) {
  const m = new THREE.Mesh(rodGeo, mat);
  const dir = new THREE.Vector3().subVectors(b, a);
  m.scale.set(radius, dir.length(), radius);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function build(count) {
  if (cradle) {
    scene.remove(cradle.group);
    cradle.group.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); });
    cradle.balls.forEach(b => b.material.dispose());
  }
  n = count;
  const group = new THREE.Group();
  const W = n * D / 2 + 1.2;

  const slab = new THREE.Mesh(new RoundedBoxGeometry(2 * W + 1.4, SLAB, 2 * ZS + 1.6, 4, 0.1), woodMat);
  slab.position.y = FEET + SLAB / 2;
  slab.castShadow = slab.receiveShadow = true;
  slab.userData.ownGeo = true;
  group.add(slab);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(footGeo, brassMat);
      foot.position.set(sx * (W + 0.1), FEET / 2, sz * (ZS + 0.4));
      foot.castShadow = true;
      group.add(foot);

      const base = new THREE.Vector3(sx * W, BASE_TOP, sz * ZS);
      const top = new THREE.Vector3(sx * W, H, sz * ZS);
      rod(group, base, top, 0.1, brassMat);
      const cap = new THREE.Mesh(capGeo, brassMat);
      cap.position.copy(top);
      cap.castShadow = true;
      group.add(cap);
    }
  }
  for (const sz of [-1, 1]) rod(group, new THREE.Vector3(-W, H, sz * ZS), new THREE.Vector3(W, H, sz * ZS), 0.08, brassMat);
  for (const sx of [-1, 1]) rod(group, new THREE.Vector3(sx * W, H, -ZS), new THREE.Vector3(sx * W, H, ZS), 0.07, brassMat);

  const balls = [];
  const strings = [];
  sim.theta = new Array(n).fill(0);
  sim.omega = new Array(n).fill(0);
  sim.held = new Array(n).fill(false);
  sim.glow = new Array(n).fill(0);
  sim.x0 = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * D);

  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshPhysicalMaterial({ clearcoat: 0.6, clearcoatRoughness: 0.08 });
    const ball = new THREE.Mesh(ballGeo, mat);
    ball.castShadow = ball.receiveShadow = true;
    ball.userData.index = i;
    group.add(ball);
    balls.push(ball);
    for (const s of [-1, 1]) {
      const str = new THREE.Mesh(stringGeo, stringMat);
      str.castShadow = true;
      str.userData.side = s;
      str.userData.ball = i;
      group.add(str);
      strings.push(str);
    }
  }

  cradle = { group, balls, strings, W };
  scene.add(group);
  applyFinish();
  updateVisuals();
  const shadowExtent = Math.max(14, W + 8);
  key.shadow.camera.left = key.shadow.camera.bottom = -shadowExtent;
  key.shadow.camera.right = key.shadow.camera.top = shadowExtent;
  key.shadow.camera.updateProjectionMatrix();
}

function applyFinish() {
  const f = FINISHES[finishIndex];
  cradle.balls.forEach((b, i) => {
    const m = b.material;
    m.color.copy(f.color(i, n));
    m.metalness = f.metal;
    m.roughness = f.rough;
    m.userData.glow = f.glow(i, n);
    m.userData.base = f.base;
    m.emissive.copy(m.userData.glow);
  });
  $('#finish').textContent = f.name;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function updateVisuals() {
  if (!cradle) return;
  for (let i = 0; i < n; i++) {
    const th = sim.theta[i];
    const ball = cradle.balls[i];
    ball.position.set(sim.x0[i] + L * Math.sin(th), H - L * Math.cos(th), 0);
    const m = ball.material;
    const hover = settings.hover === i ? 0.18 : 0;
    m.emissiveIntensity = m.userData.base + sim.glow[i] * 1.1 + hover;
  }
  for (const s of cradle.strings) {
    const i = s.userData.ball;
    tmpA.set(sim.x0[i], H, s.userData.side * ZS);
    tmpB.copy(cradle.balls[i].position);
    const dir = tmpB.sub(tmpA);
    s.position.copy(tmpA);
    s.scale.set(1, dir.length(), 1);
    s.quaternion.setFromUnitVectors(UP, dir.normalize());
  }
}

// ---- Physics ----------------------------------------------------------------
const impacts = [];

function bx(i) { return sim.x0[i] + L * Math.sin(sim.theta[i]); }
function setX(i, x) { sim.theta[i] = Math.asin(clamp((x - sim.x0[i]) / L, -0.999, 0.999)); }

function resolveCollisions() {
  const e = settings.friction ? 0.96 : 1;
  const { theta, omega, held } = sim;
  for (let iter = 0; iter < 10; iter++) {
    let touched = false;
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      const overlap = D - (bx(j) - bx(i));
      if (overlap <= 1e-6) continue;
      touched = true;

      if (held[i] && held[j]) continue;
      if (held[i]) setX(j, bx(i) + D);
      else if (held[j]) setX(i, bx(j) - D);
      else {
        const xi = bx(i), xj = bx(j);
        setX(i, xi - overlap / 2);
        setX(j, xj + overlap / 2);
      }

      const rel = omega[i] - omega[j];
      if (rel <= 1e-6) continue;
      if (held[i]) omega[j] = -e * omega[j];
      else if (held[j]) omega[i] = -e * omega[i];
      else {
        const a = omega[i], b = omega[j];
        omega[i] = ((1 - e) * a + (1 + e) * b) / 2;
        omega[j] = ((1 + e) * a + (1 - e) * b) / 2;
      }
      const strength = rel * L;
      if (strength > 0.12) impacts.push({ i, j, strength });
    }
    if (!touched) break;
  }
}

function stepPhysics(dt) {
  const { theta, omega, held } = sim;
  const c = settings.friction ? 0.22 : 0;
  for (let i = 0; i < n; i++) {
    if (held[i]) { theta[i] = drag.theta; omega[i] = 0; continue; }
    omega[i] += (-(G / L) * Math.sin(theta[i]) - c * omega[i]) * dt;
    theta[i] += omega[i] * dt;
  }
  resolveCollisions();
}

function launch(count) {
  const k = clamp(count, 1, n - 1);
  for (let i = 0; i < n; i++) {
    sim.theta[i] = i < k ? -LAUNCH_ANGLE : 0;
    sim.omega[i] = 0;
    sim.glow[i] = 0;
  }
  settings.paused && setPaused(false);
  dismissHint();
}

function stopAll() {
  for (let i = 0; i < n; i++) { sim.theta[i] = 0; sim.omega[i] = 0; }
}

// ---- Sound ------------------------------------------------------------------
let audio = null;
let noiseBuf = null;

function ensureAudio() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = new Ctx();
    noiseBuf = audio.createBuffer(1, audio.sampleRate * 0.03, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  }
  if (audio.state === 'suspended') audio.resume();
}

function clack(strength, index) {
  if (!audio || !settings.sound || audio.state !== 'running') return;
  const t = audio.currentTime;
  const vol = 0.4 * clamp(strength / 7, 0.05, 1);
  const f = 1750 + index * 55 + Math.random() * 120;

  const out = audio.createGain();
  out.gain.setValueAtTime(vol, t);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  out.connect(audio.destination);

  for (const [mult, type, len] of [[1, 'sine', 0.22], [2.76, 'triangle', 0.07], [5.4, 'sine', 0.035]]) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(1 / mult, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  const src = audio.createBufferSource();
  src.buffer = noiseBuf;
  const hp = audio.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  src.connect(hp).connect(out);
  src.start(t);
}

function flushImpacts() {
  if (!impacts.length) return;
  impacts.sort((a, b) => b.strength - a.strength);
  for (const hit of impacts) {
    sim.glow[hit.i] = Math.max(sim.glow[hit.i], clamp(hit.strength / 5, 0.15, 1));
    sim.glow[hit.j] = Math.max(sim.glow[hit.j], clamp(hit.strength / 5, 0.15, 1));
  }
  for (const hit of impacts.slice(0, 3)) clack(hit.strength, hit.i);
  impacts.length = 0;
}

// ---- Pointer interaction ----------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane();
const hitPoint = new THREE.Vector3();
const camDir = new THREE.Vector3();
const drag = { active: false, id: -1, index: -1, side: 0, theta: 0 };

function setRay(e) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function pickBall(e) {
  setRay(e);
  const hit = raycaster.intersectObjects(cradle.balls, false)[0];
  return hit ? hit.object.userData.index : -1;
}

// Converts the pointer into a swing angle for ball i, whatever the camera angle.
function pointerAngle(e, i) {
  setRay(e);
  camera.getWorldDirection(camDir);
  camDir.x = 0;
  let angle = null;
  if (Math.abs(camDir.y) > 0.9 * camDir.length() && camDir.lengthSq() > 1e-6) {
    plane.set(UP, -REST_Y);
    if (raycaster.ray.intersectPlane(plane, hitPoint)) {
      angle = Math.asin(clamp((hitPoint.x - sim.x0[i]) / L, -1, 1));
    }
  } else if (camDir.lengthSq() > 0.04) {
    plane.setFromNormalAndCoplanarPoint(camDir.normalize(), tmpA.set(0, H, 0));
    if (raycaster.ray.intersectPlane(plane, hitPoint)) {
      angle = Math.atan2(hitPoint.x - sim.x0[i], H - hitPoint.y);
    }
  } else {
    plane.set(new THREE.Vector3(0, 0, 1), 0);
    if (raycaster.ray.intersectPlane(plane, hitPoint)) {
      angle = Math.atan2(hitPoint.x - sim.x0[i], H - hitPoint.y);
    }
  }
  return angle;
}

function setHeldGroup(side) {
  drag.side = side;
  for (let k = 0; k < n; k++) {
    const inGroup = side === -1 ? k <= drag.index : side === 1 ? k >= drag.index : false;
    if (sim.held[k] && !inGroup) { sim.theta[k] = 0; sim.omega[k] = 0; }
    sim.held[k] = inGroup && !(side !== 0 && groupSize(side) >= n);
  }
}

function groupSize(side) {
  return side === -1 ? drag.index + 1 : n - drag.index;
}

function onPointerDown(e) {
  if (!cradle || (e.pointerType === 'mouse' && e.button !== 0) || drag.active) return;
  ensureAudio();
  const index = pickBall(e);
  if (index < 0) return;
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  Object.assign(drag, { active: true, id: e.pointerId, index, side: 0, theta: 0 });
  host.classList.add('grabbing');
  dismissHint();
  cancelViewTween();
}

function onPointerMove(e) {
  if (!cradle) return;
  if (!drag.active) {
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      const idx = pickBall(e);
      settings.hover = idx;
      host.classList.toggle('over-ball', idx >= 0);
    }
    return;
  }
  if (e.pointerId !== drag.id) return;
  const raw = pointerAngle(e, drag.index);
  if (raw === null) return;
  if (drag.side === 0 ? Math.abs(raw) > 0.03 : raw * drag.side < 0 && Math.abs(raw) > 0.12) {
    setHeldGroup(raw < 0 ? -1 : 1);
  }
  if (drag.side === -1) drag.theta = clamp(raw, -MAX_ANGLE, 0);
  else if (drag.side === 1) drag.theta = clamp(raw, 0, MAX_ANGLE);
}

function endDrag(e) {
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  sim.held.fill(false);
  controls.enabled = true;
  host.classList.remove('grabbing');
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { if (!drag.active) { settings.hover = -1; host.classList.remove('over-ball'); } });

// ---- Camera views -----------------------------------------------------------
let tween = null;
const sph = new THREE.Spherical();
const off = new THREE.Vector3();

function fitDistance() {
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const visible = 1 - panelInset() / host.clientHeight;
  const needW = (cradle.W + 2.4) / (halfH * camera.aspect);
  const needH = 6.4 / (halfH * visible);
  return clamp(Math.max(needW, needH, 12), 10, 55);
}

const VIEWS = {
  front: [0, 1.44],
  side: [Math.PI / 2, 1.44],
  back: [Math.PI, 1.44],
  top: [0, 0.0001],
  bottom: [0, Math.PI - 0.0001],
  iso: [0.78, 1.12],
};

function startTween(theta, phi, radius, tgt) {
  off.copy(camera.position).sub(controls.target);
  sph.setFromVector3(off);
  let dTheta = theta - sph.theta;
  dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  tween = {
    t: 0,
    dur: reduceMotion ? 0.01 : 1.1,
    from: { theta: sph.theta, phi: sph.phi, radius: sph.radius, target: controls.target.clone() },
    to: { theta: sph.theta + dTheta, phi, radius, target: tgt },
  };
}

function goToView(name) {
  const [theta, phi] = VIEWS[name];
  startTween(theta, phi, name === 'top' || name === 'bottom' ? fitDistance() * 0.95 : fitDistance(), new THREE.Vector3(0, CENTER_Y, 0));
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
}

// Pulls the camera back (keeping its angle) when a wider cradle would not fit.
function refit() {
  off.copy(camera.position).sub(controls.target);
  sph.setFromVector3(off);
  const need = fitDistance();
  if (sph.radius < need * 0.9) startTween(sph.theta, sph.phi, need, controls.target.clone());
}

function cancelViewTween() {
  tween = null;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
}

function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
  const { from, to } = tween;
  controls.target.lerpVectors(from.target, to.target, k);
  sph.set(
    THREE.MathUtils.lerp(from.radius, to.radius, k),
    THREE.MathUtils.lerp(from.phi, to.phi, k),
    THREE.MathUtils.lerp(from.theta, to.theta, k)
  );
  off.setFromSpherical(sph);
  camera.position.copy(controls.target).add(off);
  camera.lookAt(controls.target);
  if (tween.t >= 1) tween = null;
}

controls.addEventListener('start', () => {
  if (tween) cancelViewTween();
  else document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
});

// ---- UI ---------------------------------------------------------------------
const hint = $('#hint');
let hintDismissed = false;
function dismissHint() {
  if (hintDismissed) return;
  hintDismissed = true;
  setTimeout(() => hint.classList.add('faded'), 3500);
}

function setPressed(btn, on, label) {
  btn.setAttribute('aria-pressed', String(on));
  if (label) btn.textContent = label;
}

function setPaused(on) {
  settings.paused = on;
  setPressed($('#pause'), on, on ? 'Resume' : 'Pause');
}

// Browsers only allow audio after a gesture, so unlock it on the first touch/click/key anywhere.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => ensureAudio(), { capture: true });

function setSound(on) {
  settings.sound = on;
  setPressed($('#sound'), on, on ? 'Sound: on' : 'Sound: off');
  if (on) ensureAudio();
}

function setFriction(on) {
  settings.friction = on;
  setPressed($('#friction'), on, on ? 'Friction: on' : 'Friction: off');
}

function setOrbit(on) {
  controls.autoRotate = on;
  setPressed($('#orbit'), on);
}

document.querySelectorAll('[data-lift]').forEach(b => b.addEventListener('click', () => { ensureAudio(); launch(+b.dataset.lift); }));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => goToView(b.dataset.view)));
$('#stop').addEventListener('click', stopAll);
$('#pause').addEventListener('click', () => setPaused(!settings.paused));
$('#sound').addEventListener('click', () => setSound(!settings.sound));
$('#friction').addEventListener('click', () => setFriction(!settings.friction));
$('#orbit').addEventListener('click', () => setOrbit(!controls.autoRotate));
$('#finish').addEventListener('click', () => { finishIndex = (finishIndex + 1) % FINISHES.length; applyFinish(); });

$('#count').addEventListener('input', e => {
  $('#countOut').textContent = e.target.value;
  build(+e.target.value);
  launch(1);
  refit();
});
$('#speed').addEventListener('input', e => {
  settings.timeScale = +e.target.value;
  $('#speedOut').textContent = `${settings.timeScale.toFixed(1)}×`;
});

const panel = $('#panel');
const toggle = $('#panelToggle');
function setPanelCollapsed(collapsed) {
  panel.classList.toggle('collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  resize();
}
toggle.addEventListener('click', () => setPanelCollapsed(!panel.classList.contains('collapsed')));

// Swipe the panel down to hide it (only when it is scrolled to the top, and not while using a slider).
{
  let startY = null;
  let dy = 0;
  const reset = () => {
    startY = null;
    dy = 0;
    panel.classList.remove('dragging');
    panel.style.transform = '';
  };
  panel.addEventListener('touchstart', e => {
    const canSwipe = getComputedStyle(toggle).display !== 'none';
    if (!canSwipe || e.touches.length !== 1 || e.target.closest('input') || panel.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dy = 0;
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) { if (dy < -4) reset(); return; }
    e.preventDefault();
    panel.classList.add('dragging');
    panel.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: false });
  panel.addEventListener('touchend', () => {
    const shouldClose = startY !== null && dy > 60;
    reset();
    if (shouldClose) setPanelCollapsed(true);
  });
  panel.addEventListener('touchcancel', reset);
}
if (window.matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches) {
  panel.classList.add('collapsed');
  toggle.setAttribute('aria-expanded', 'false');
}

const KEY_VIEWS = { f: 'front', s: 'side', b: 'back', t: 'top', u: 'bottom', i: 'iso' };
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input')) return;
  const k = e.key.toLowerCase();
  if (/^[1-3]$/.test(k)) { ensureAudio(); launch(+k); }
  else if (k === ' ' && !e.target.closest?.('button')) { e.preventDefault(); setPaused(!settings.paused); }
  else if (k === 'o') setOrbit(!controls.autoRotate);
  else if (k === 'm') setSound(!settings.sound);
  else if (KEY_VIEWS[k]) goToView(KEY_VIEWS[k]);
});

// ---- Resize & loop ----------------------------------------------------------
// DuckDuckGo's mobile browser draws its toolbar over the page without shrinking
// the viewport, so keep the panel clear of it and track the visible height.
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
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Shift the image up so the cradle sits in the space above the control panel.
  camera.setViewOffset(w, h, 0, Math.round(panelInset() / 2), w, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
new ResizeObserver(resize).observe(panel);

let lastTime = performance.now();
let accumulator = 0;
let woodOpacity = 1;

function frame(now = performance.now()) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (!settings.paused) {
    accumulator += dt * settings.timeScale;
    let steps = 0;
    while (accumulator >= SUBSTEP && steps < 40) {
      stepPhysics(SUBSTEP);
      accumulator -= SUBSTEP;
      steps++;
    }
    if (steps === 40) accumulator = 0;
    flushImpacts();
  } else if (drag.active) {
    for (let i = 0; i < n; i++) if (sim.held[i]) sim.theta[i] = drag.theta;
  }
  const decay = Math.exp(-dt * 7);
  for (let i = 0; i < n; i++) sim.glow[i] *= decay;

  stepTween(dt);
  controls.update();
  // Let the base go glassy when the camera is under it so the cradle stays visible.
  const wantOpacity = camera.position.y < FEET ? 0.16 : 1;
  woodOpacity += (wantOpacity - woodOpacity) * Math.min(1, dt * 8);
  woodMat.opacity = woodOpacity;
  const glassy = woodOpacity < 0.995;
  if (glassy !== woodMat.transparent) {
    woodMat.transparent = glassy;
    woodMat.depthWrite = !glassy;
    woodMat.needsUpdate = true;
  }
  dust.rotation.y += dt * 0.01;
  updateVisuals();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---- Start ------------------------------------------------------------------
resize();
build(n);
{
  const d = fitDistance();
  camera.position.set(d * 0.52, CENTER_Y + d * 0.28, d * 0.8);
  camera.lookAt(target);
  controls.update();
}
launch(1);
requestAnimationFrame(frame);
