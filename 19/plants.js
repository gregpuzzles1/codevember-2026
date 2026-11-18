import * as THREE from 'three';
import { mulberry32, waterLevelAt } from './sim.js';

// ---- Procedural geometry helpers ---------------------------------------------------------------
class Builder {
  constructor(seed) {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    this.rnd = mulberry32(seed);
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rnd(); }
  vert(p, n, c) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }
  tint(hex, jitter = 0.08) {
    const c = new THREE.Color(hex);
    const k = 1 + (this.rnd() - 0.5) * 2 * jitter;
    return c.multiplyScalar(k);
  }

  // Tapered tube following a list of points.
  tube(points, radii, seg, colorA, colorB) {
    const base = this.pos.length / 3;
    const up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < points.length; k++) {
      const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k + 1)];
      const t = b.clone().sub(a).normalize();
      let side = new THREE.Vector3().crossVectors(t, Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
      const fwd = new THREE.Vector3().crossVectors(side, t).normalize();
      const c = colorA.clone().lerp(colorB, k / (points.length - 1));
      for (let s = 0; s < seg; s++) {
        const ang = (s / seg) * Math.PI * 2;
        const n = side.clone().multiplyScalar(Math.cos(ang)).addScaledVector(fwd, Math.sin(ang));
        const p = points[k].clone().addScaledVector(n, radii[k]);
        this.vert(p, n, c.clone().multiplyScalar(0.88 + 0.24 * ((s % 2) * 0.5 + this.rnd() * 0.5)));
      }
    }
    for (let k = 0; k < points.length - 1; k++) {
      for (let s = 0; s < seg; s++) {
        const a = base + k * seg + s, b = base + k * seg + (s + 1) % seg;
        const c = a + seg, d = b + seg;
        this.idx.push(a, c, b, b, c, d);
      }
    }
  }

  // Curved, tapering leaf strip.
  blade(origin, dir, len, width, droop, colA, colB, segs = 3) {
    const d = dir.clone().normalize();
    let side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const base = this.pos.length / 3;
    const pts = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      pts.push(origin.clone().addScaledVector(d, len * t).add(new THREE.Vector3(0, -droop * len * t * t, 0)));
    }
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const tan = (pts[Math.min(segs, s + 1)].clone().sub(pts[Math.max(0, s - 1)])).normalize();
      const n = new THREE.Vector3().crossVectors(tan, side).normalize();
      if (n.y < 0) n.negate();
      const w = width * Math.pow(1 - t, 0.75) * Math.min(1, 0.35 + t * 4);
      const c = colA.clone().lerp(colB, t);
      this.vert(pts[s].clone().addScaledVector(side, w), n, c);
      this.vert(pts[s].clone().addScaledVector(side, -w), n, c);
    }
    for (let s = 0; s < segs; s++) {
      const a = base + s * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  // Radiating head of spear-shaped leaves.
  rosette(center, count, lenMin, lenMax, width, droop, colA, colB, lowAngle = -0.15, highAngle = 1.45, up = new THREE.Vector3(0, 1, 0)) {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const elev = lowAngle + (highAngle - lowAngle) * Math.pow(t, 0.8) + this.r(-0.1, 0.1);
      const az = i * 2.39996 + this.r(-0.2, 0.2);
      const dir = new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
      if (up.y < 0.99) dir.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up));
      const len = this.r(lenMin, lenMax) * (0.75 + 0.25 * Math.cos(elev));
      this.blade(center, dir, len, width, droop, this.tint(colA, 0.1), this.tint(colB, 0.1));
    }
  }

  blob(center, rx, ry, rz, hexes, jitter = 0.18) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const base = this.pos.length / 3;
    const cols = hexes.map(h => new THREE.Color(h));
    const c0 = cols[(this.rnd() * cols.length) | 0];
    const jit = new Map();
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const key = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
      if (!jit.has(key)) jit.set(key, 1 + (this.rnd() - 0.5) * 2 * jitter);
      const j = jit.get(key);
      const n = v.clone().normalize();
      const pos = new THREE.Vector3(center.x + n.x * rx * j, center.y + n.y * ry * j, center.z + n.z * rz * j);
      const shade = 0.7 + 0.45 * (n.y * 0.5 + 0.5);
      const c = c0.clone().lerp(cols[(this.rnd() * cols.length) | 0], 0.45).multiplyScalar(shade);
      this.vert(pos, n, c);
    }
    const ix = g.index ? g.index.array : null;
    for (let i = 0; i < p.count; i++) this.idx.push(base + (ix ? ix[i] : i));
    g.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function curvedTrunk(b, start, height, lean, radius, seg, colA, colB, pts = 4) {
  const points = [], radii = [];
  const dir = V(lean.x, 1, lean.z);
  for (let k = 0; k < pts; k++) {
    const t = k / (pts - 1);
    points.push(start.clone().add(V(lean.x * height * t * t, height * t, lean.z * height * t * t)).add(V(b.r(-0.02, 0.02), 0, b.r(-0.02, 0.02))));
    radii.push(radius * (1 - 0.55 * t));
  }
  b.tube(points, radii, seg, colA, colB);
  return { tip: points[pts - 1], dir };
}

// ---- Species -----------------------------------------------------------------------------------
function joshuaTree(seed) {
  const b = new Builder(seed);
  const barkA = b.tint('#4d3d30'), barkB = b.tint('#6b5a46');
  const trunkH = b.r(0.7, 1.0);
  const { tip } = curvedTrunk(b, V(0, 0, 0), trunkH, V(b.r(-0.12, 0.12), 0, b.r(-0.12, 0.12)), 0.13, 7, barkA, barkB);
  // dead leaf skirt
  for (let i = 0; i < 26; i++) {
    const y = b.r(0.1, trunkH);
    const az = b.r(0, 6.28);
    b.blade(V(Math.cos(az) * 0.1, y, Math.sin(az) * 0.1), V(Math.cos(az) * 0.5, -0.8, Math.sin(az) * 0.5), b.r(0.22, 0.38), 0.03, 0.1, b.tint('#7b6842'), b.tint('#5a4a31'), 2);
  }
  const heads = [];
  const grow = (from, depth, h, spread) => {
    const nb = depth === 0 ? 3 + ((b.rnd() * 2) | 0) : 2;
    for (let i = 0; i < nb; i++) {
      const az = (i / nb) * 6.28 + b.r(-0.5, 0.5) + depth;
      const len = h * b.r(0.7, 1.15);
      const to = from.clone().add(V(Math.cos(az) * spread * len, len * b.r(0.7, 1.0), Math.sin(az) * spread * len));
      const mid = from.clone().lerp(to, 0.5).add(V(0, 0.04, 0));
      const r0 = 0.085 * (1 - depth * 0.3);
      b.tube([from, mid, to], [r0, r0 * 0.85, r0 * 0.7], 6, barkA, barkB);
      if (depth < 1 && b.rnd() < 0.85) grow(to, depth + 1, h * 0.65, spread * 1.05);
      else heads.push(to);
    }
  };
  grow(tip, 0, 0.55, 0.55);
  for (const hp of heads) b.rosette(hp.clone().add(V(0, 0.03, 0)), 20, 0.32, 0.5, 0.03, 0.1, '#7f9b58', '#b8c27a', -0.25, 1.25);
  return b.build();
}

function giantYucca(seed) {
  const b = new Builder(seed);
  const barkA = b.tint('#5a4a38'), barkB = b.tint('#7a6a50');
  const h = b.r(1.1, 1.8);
  const { tip } = curvedTrunk(b, V(0, 0, 0), h, V(b.r(-0.1, 0.1), 0, b.r(-0.1, 0.1)), 0.11, 7, barkA, barkB, 5);
  for (let i = 0; i < 44; i++) {
    const y = b.r(0.1, h);
    const az = b.r(0, 6.28);
    b.blade(V(Math.cos(az) * 0.1, y, Math.sin(az) * 0.1), V(Math.cos(az) * 0.45, -0.9, Math.sin(az) * 0.45), b.r(0.25, 0.5), 0.032, 0.1, b.tint('#8a7448'), b.tint('#63522f'), 2);
  }
  b.rosette(tip.clone().add(V(0, 0.02, 0)), 44, 0.55, 0.9, 0.035, 0.12, '#5f8561', '#9db288', -0.35, 1.45);
  if (b.rnd() < 0.5) {
    const to = tip.clone().add(V(b.r(0.2, 0.35), b.r(0.2, 0.4), b.r(-0.2, 0.2)));
    b.tube([tip.clone().add(V(0, -0.05, 0)), to], [0.07, 0.055], 6, barkA, barkB);
    b.rosette(to.clone().add(V(0, 0.02, 0)), 30, 0.45, 0.75, 0.032, 0.12, '#5f8561', '#9db288', -0.3, 1.45);
  }
  return b.build();
}

function utahYucca(seed) {
  const b = new Builder(seed);
  const heads = 2 + ((b.rnd() * 2) | 0);
  for (let i = 0; i < heads; i++) {
    const c = V(b.r(-0.22, 0.22) * (i ? 1 : 0), 0.06, b.r(-0.22, 0.22) * (i ? 1 : 0));
    b.rosette(c, 22, 0.4, 0.62, 0.028, 0.18, '#6c9a86', '#a9c3a6', -0.1, 1.1);
  }
  const h = b.r(0.9, 1.4);
  const lean = V(b.r(-0.08, 0.08), 0, b.r(-0.08, 0.08));
  const { tip } = curvedTrunk(b, V(0.05, 0.05, 0), h, lean, 0.018, 5, b.tint('#8a6f48'), b.tint('#b49b6c'), 4);
  for (let i = 0; i < 12; i++) {
    const t = 0.55 + 0.45 * (i / 12);
    const az = i * 2.4;
    const p = V(0.05 + lean.x * h * t * t, 0.05 + h * t, lean.z * h * t * t);
    b.blob(p.clone().add(V(Math.cos(az) * 0.05, 0, Math.sin(az) * 0.05)), 0.045, 0.06, 0.045, ['#d9c9a0', '#c8b184', '#e4d8b6'], 0.15);
  }
  return b.build();
}

function desertWillow(seed) {
  const b = new Builder(seed);
  const barkA = b.tint('#5e4b3b'), barkB = b.tint('#8b7358');
  const stems = 2 + ((b.rnd() * 2) | 0);
  for (let s = 0; s < stems; s++) {
    const az = (s / stems) * 6.28 + b.r(-0.4, 0.4);
    const lean = V(Math.cos(az) * 0.35, 0, Math.sin(az) * 0.35);
    const h = b.r(0.9, 1.4);
    const { tip } = curvedTrunk(b, V(0, 0, 0), h, lean, 0.055, 6, barkA, barkB, 4);
    const tips = [tip];
    for (let k = 0; k < 3; k++) {
      const a2 = b.r(0, 6.28);
      const from = tip.clone().lerp(V(0, 0, 0), b.r(0.15, 0.35));
      const to = from.clone().add(V(Math.cos(a2) * 0.4, b.r(0.15, 0.4), Math.sin(a2) * 0.4));
      b.tube([from, to], [0.028, 0.016], 5, barkA, barkB);
      tips.push(to);
    }
    for (const t of tips) {
      for (let i = 0; i < 14; i++) {
        const a3 = b.r(0, 6.28);
        b.blade(t.clone().add(V(Math.cos(a3) * 0.06, b.r(-0.05, 0.05), Math.sin(a3) * 0.06)), V(Math.cos(a3) * 0.55, -0.3 + b.r(-0.2, 0.3), Math.sin(a3) * 0.55), b.r(0.3, 0.52), 0.022, 0.55, b.tint('#8ea052'), b.tint('#bcb561'), 3);
      }
      if (b.rnd() < 0.7) {
        for (let f = 0; f < 3; f++) b.blob(t.clone().add(V(b.r(-0.1, 0.1), b.r(0, 0.1), b.r(-0.1, 0.1))), 0.05, 0.05, 0.05, ['#d98fb7', '#e5b0d0', '#c97aa8'], 0.12);
      }
    }
  }
  return b.build();
}

function gambelOak(seed) {
  const b = new Builder(seed);
  const barkA = b.tint('#4d4036'), barkB = b.tint('#6d5d4e');
  const autumn = ['#b4561f', '#cc7a2a', '#9a4a1b', '#a8341e', '#c99a3a'];
  const stems = 3 + ((b.rnd() * 2) | 0);
  for (let s = 0; s < stems; s++) {
    const az = (s / stems) * 6.28 + b.r(-0.5, 0.5);
    const lean = V(Math.cos(az) * 0.4, 0, Math.sin(az) * 0.4);
    const h = b.r(0.7, 1.1);
    const { tip } = curvedTrunk(b, V(0, 0, 0), h, lean, 0.06, 6, barkA, barkB, 3);
    const n = 3 + ((b.rnd() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const c = tip.clone().add(V(b.r(-0.3, 0.3), b.r(0.05, 0.4), b.r(-0.3, 0.3)));
      const r = b.r(0.28, 0.46);
      b.blob(c, r, r * b.r(0.7, 0.95), r, autumn, 0.22);
    }
  }
  return b.build();
}

// ---- Ecosystem ---------------------------------------------------------------------------------
const SPECIES = [
  {
    key: 'joshua', label: 'Joshua tree', build: joshuaTree, count: 150, size: [0.9, 1.35],
    fit: s => s.h > 9 && s.h < 15.2 && s.slope < 0.26 && s.drain < 40 && s.dry,
  },
  {
    key: 'giant', label: 'Giant yucca', build: giantYucca, count: 120, size: [0.95, 1.4],
    fit: s => s.h > 6.5 && s.h < 15.6 && s.slope > 0.12 && s.slope < 0.85 && s.drain < 30 && s.dry,
  },
  {
    key: 'utah', label: 'Utah yucca', build: utahYucca, count: 260, size: [0.9, 1.5],
    fit: s => s.h > 4.4 && s.h < 15.6 && s.slope < 0.55 && s.drain < 70 && s.dry,
  },
  {
    key: 'willow', label: 'Desert willow', build: desertWillow, count: 140, size: [1.0, 1.5],
    fit: s => s.h > 4.4 && s.h < 14.5 && s.slope < 0.3 && s.drain > 12 && s.dry,
  },
  {
    key: 'oak', label: 'Gambel oak', build: gambelOak, count: 260, size: [1.0, 1.6],
    fit: s => (s.h > 15.3 || (s.h > 14.4 && s.drain > 25)) && s.h < 24 && s.slope < 0.7 && s.drain < 90 && s.dry,
  },
];

const dummy = new THREE.Object3D();
const rnd = mulberry32(99);

export class Ecosystem {
  constructor(scene, terrain, { mobile = false, seed = 1 } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = { value: 0 };
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    this.material.onBeforeCompile = shader => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3]);
            float sway = pow(max(position.y, 0.0), 1.6) * 0.035;
            transformed.x += sin(uTime * 1.6 + ip.x * 0.7 + ip.z * 0.3) * sway;
            transformed.z += cos(uTime * 1.3 + ip.z * 0.6) * sway;
          #endif`);
    };
    const scale = mobile ? 0.55 : 1;
    this.sets = [];
    for (const sp of SPECIES) {
      const total = Math.round(sp.count * scale);
      const variants = 2;
      for (let v = 0; v < variants; v++) {
        const count = Math.ceil(total / variants);
        const mesh = new THREE.InstancedMesh(sp.build(seed * 101 + v * 17 + sp.key.length), this.material, count);
        mesh.castShadow = !mobile;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(mesh);
        const set = {
          sp, mesh, count,
          x: new Float32Array(count), z: new Float32Array(count), y0: new Float32Array(count), anchor: new Float32Array(count),
          yaw: new Float32Array(count), size: new Float32Array(count),
          grow: new Float32Array(count), state: new Uint8Array(count), timer: new Float32Array(count),
          tilt: new Float32Array(count), tiltAz: new Float32Array(count), fall: new Float32Array(count),
        };
        this.sets.push(set);
      }
    }
    this.cursor = 0;
    this.populate();
  }

  setVisible(v) { this.group.visible = v; }

  sampleSite(x, z) {
    const t = this.terrain;
    const h = t.heightAt(x, z);
    const slope = t.slopeAt(x, z);
    const drain = t.inside(x, z) ? t.sample(t.drain, x, z) : 0;
    const wet = t.inside(x, z) ? t.sample(t.wet, x, z) : 0;
    return { h, slope, drain, wet, dry: h > waterLevelAt(x) + 0.12 && wet < 0.8 };
  }

  tryPlace(set, i, margin = 4) {
    const half = this.terrain.size / 2 - margin;
    for (let a = 0; a < 60; a++) {
      const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
      const s = this.sampleSite(x, z);
      if (!set.sp.fit(s)) continue;
      set.x[i] = x; set.z[i] = z; set.y0[i] = s.h; set.anchor[i] = s.h;
      set.yaw[i] = rnd() * 6.28;
      set.size[i] = set.sp.size[0] + (set.sp.size[1] - set.sp.size[0]) * rnd();
      set.grow[i] = 0.02; set.state[i] = 1; set.fall[i] = 0;
      set.tilt[i] = 0;
      return true;
    }
    return false;
  }

  populate() {
    for (const set of this.sets) {
      for (let i = 0; i < set.count; i++) {
        if (this.tryPlace(set, i, 2)) { set.grow[i] = 0.6 + rnd() * 0.4; set.state[i] = 0; }
        else { set.state[i] = 2; set.timer[i] = rnd() * 30; }
        this.writeMatrix(set, i);
      }
      set.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  writeMatrix(set, i) {
    const st = set.state[i];
    const g = st === 2 ? 0 : set.grow[i];
    const s = set.size[i] * Math.max(0.0001, g);
    const t = this.terrain;
    const y = st === 0 || st === 1 ? t.heightAt(set.x[i], set.z[i]) : set.y0[i];
    set.y0[i] = st === 3 ? set.y0[i] : y;
    dummy.position.set(set.x[i], set.y0[i] - 0.05 * s, set.z[i]);
    dummy.rotation.set(0, set.yaw[i], 0);
    if (st === 3) {
      const f = set.fall[i];
      dummy.rotation.set(Math.sin(set.tiltAz[i]) * f * 1.4, set.yaw[i], Math.cos(set.tiltAz[i]) * f * 1.4);
      dummy.position.y -= f * 0.5 * set.size[i];
    }
    dummy.scale.setScalar(s * (st === 3 ? Math.max(0.0001, 1 - set.fall[i] * 0.9) : 1));
    dummy.updateMatrix();
    set.mesh.setMatrixAt(i, dummy.matrix);
  }

  // yearsDt: simulated years since last call; realDt: seconds.
  update(realDt, yearsDt, time) {
    this.time.value = time;
    for (const set of this.sets) {
      let dirty = false;
      const checks = Math.max(8, Math.ceil(set.count / 40));
      for (let c = 0; c < checks; c++) {
        const i = (this.cursor + c) % set.count;
        if (set.state[i] !== 0) continue;
        const s = this.sampleSite(set.x[i], set.z[i]);
        const dropped = set.anchor[i] - s.h;
        if (s.slope > 1.25 || dropped > 0.45 || dropped < -0.8 || (s.wet > 0.8 && set.sp.key !== 'willow') || !s.dry) {
          set.state[i] = 3; set.fall[i] = 0; set.tiltAz[i] = rnd() * 6.28;
        } else if (Math.abs(s.h - set.y0[i]) > 0.001) {
          this.writeMatrix(set, i);
          dirty = true;
        }
      }
      for (let i = 0; i < set.count; i++) {
        const st = set.state[i];
        if (st === 0) continue;
        if (st === 1) {
          set.grow[i] += yearsDt / 45;
          if (set.grow[i] >= 1) { set.grow[i] = 1; set.state[i] = 0; }
          this.writeMatrix(set, i); dirty = true;
        } else if (st === 3) {
          set.fall[i] += realDt * 1.4;
          if (set.fall[i] >= 1) { set.state[i] = 2; set.timer[i] = 30 + rnd() * 90; }
          this.writeMatrix(set, i); dirty = true;
        } else if (st === 2) {
          set.timer[i] -= yearsDt;
          if (set.timer[i] <= 0) {
            if (this.tryPlace(set, i, 4)) { this.writeMatrix(set, i); dirty = true; }
            else set.timer[i] = 15 + rnd() * 30;
          }
        }
      }
      if (dirty) set.mesh.instanceMatrix.needsUpdate = true;
    }
    this.cursor = (this.cursor + 8) % 100000;
  }

  counts() {
    const out = {};
    for (const set of this.sets) {
      let n = 0;
      for (let i = 0; i < set.count; i++) if (set.state[i] === 0 || set.state[i] === 1) n++;
      out[set.sp.key] = (out[set.sp.key] || 0) + n;
    }
    return out;
  }

  rebuild() { this.cursor = 0; for (const set of this.sets) set.state.fill(2); this.populate(); }
}

export { SPECIES };
