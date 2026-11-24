import * as THREE from './vendor/three.module.min.js';
import { clamp, color, grid, mesh, mix, paint, painted, randomFrom, TAU, v } from './geometry.js';

const clearingX = -3.6;
const clearingZ = 1.8;
const clearingRadius = 24;

export function groundHeight(x, z) {
  return -9.65 + .24 * Math.sin(x * .53 + z * .28)
    + .20 * Math.cos(z * .48 - x * .16) + .08 * Math.sin(x * .94 - z * .86);
}

function buildTerrain(parent, trunk) {
  const surface = grid(62, 108, (u, t) => {
    const radius = t * clearingRadius;
    const x = clearingX + Math.cos(u * TAU) * radius;
    const z = clearingZ - Math.sin(u * TAU) * radius;
    return v(x, groundHeight(x, z), z);
  });
  const positions = surface.getAttribute('position');
  const colors = new Float32Array(positions.count * 4);
  const meadow = color('#536444');
  const moss = color('#778454');
  const soil = color('#5c4d3c');
  const shade = color('#323a29');
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const fromTrunk = Math.hypot(x - trunk.x, z - trunk.z);
    const fromCenter = Math.hypot(x - clearingX, z - clearingZ);
    const growth = .5 + .23 * Math.sin(x * 1.05 + z * .84) + .21 * Math.cos(z * .87 - x * .38);
    const roots = 1 - THREE.MathUtils.smoothstep(fromTrunk, 1.8, 5.1);
    const dapple = .5 + .5 * Math.sin(x * 1.48 - z * .65) * Math.cos(z * 1.32 + x * .37);
    tint.copy(meadow).lerp(moss, growth * .77).lerp(soil, roots * .74);
    tint.lerp(shade, .53 * Math.exp(-fromTrunk * fromTrunk * .09)).multiplyScalar(.86 + dapple * .21);
    tint.toArray(colors, i * 4);
    colors[i * 4 + 3] = 1 - THREE.MathUtils.smoothstep(fromCenter, 15.5, clearingRadius);
  }
  surface.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const terrain = mesh(parent, surface, painted({ transparent: true, depthWrite: false }));
  terrain.name = 'Forest clearing';
}

function grassGeometry() {
  const positions = [];
  const colors = [];
  const base = color('#626a45');
  const middle = color('#a5af70');
  const tip = color('#cfce92');
  for (let blade = 0; blade < 7; blade++) {
    const a = blade * 2.39996;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const w = .025 + .008 * (blade % 3);
    const height = .22 + .042 * (blade % 4);
    const reach = .14 + .025 * (blade % 3);
    const left = v(x * .032 - z * w, 0, z * .032 + x * w);
    const right = v(x * .032 + z * w, 0, z * .032 - x * w);
    const midLeft = v(x * reach * .48 - z * w * .57, height * .57, z * reach * .48 + x * w * .57);
    const midRight = v(x * reach * .48 + z * w * .57, height * .57, z * reach * .48 - x * w * .57);
    const top = v(x * reach, height, z * reach);
    for (const [point, tint] of [
      [left,base], [right,base], [midLeft,middle],
      [right,base], [midRight,middle], [midLeft,middle],
      [midLeft,middle], [midRight,middle], [top,tip],
    ]) {
      positions.push(point.x, point.y, point.z);
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildGrass(parent, trunk, sample) {
  const count = 2100;
  const tufts = new THREE.InstancedMesh(grassGeometry(), painted({ side: THREE.DoubleSide }), count);
  tufts.name = 'Grass tufts';
  const transform = new THREE.Object3D();
  const greens = ['#859754', '#9caa62', '#78914f', '#a2a965', '#688549'].map(color);
  for (let i = 0; i < count; i++) {
    const nearRoots = i < 620;
    const radius = nearRoots ? mix(1.78, 8.4, sample()) : Math.sqrt(sample()) * 15.0;
    const angle = sample() * TAU;
    const x = (nearRoots ? trunk.x : clearingX) + Math.cos(angle) * radius;
    const z = (nearRoots ? trunk.z : clearingZ) + Math.sin(angle) * radius;
    const size = mix(.48, 1.44, sample());
    transform.position.set(x, groundHeight(x,z) - .005, z);
    transform.rotation.set(0, sample() * TAU, 0);
    transform.scale.set(size, size * mix(.62, 1.30, sample()), size);
    transform.updateMatrix();
    tufts.setMatrixAt(i, transform.matrix);
    tufts.setColorAt(i, greens[i % greens.length]);
  }
  parent.add(tufts);
}

function buildRocks(parent, trunk, sample) {
  const rockPaint = color('#a29d8a');
  const rockShadow = color('#686352');
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    const noise = 1 + .10 * Math.sin(x * 5.9 + y * 3.4 + z * 7.2) + .07 * Math.cos(x * 8.3 - z * 5.8);
    vertices.setXYZ(i, x * noise + .16 * y, y * noise, z * noise);
  }
  geometry.computeVertexNormals();
  paint(geometry, (point) => rockShadow.clone().lerp(rockPaint, clamp((point.y + 1) * .62, 0, 1)));
  const count = 83;
  const stones = new THREE.InstancedMesh(geometry, painted({ flatShading: true }), count);
  stones.name = 'Forest stones';
  const transform = new THREE.Object3D();
  const tints = ['#a39b87', '#b0a598', '#8a8e85', '#a69a82', '#858c78'].map(color);
  for (let i = 0; i < count; i++) {
    const nearRoots = i < 22;
    const radius = nearRoots ? mix(2.36, 6.2, sample()) : Math.sqrt(sample()) * 14.6;
    const angle = sample() * TAU;
    const x = (nearRoots ? trunk.x : clearingX) + Math.cos(angle) * radius;
    const z = (nearRoots ? trunk.z : clearingZ) + Math.sin(angle) * radius;
    const size = nearRoots ? mix(.18, .70, sample() ** 1.7) : mix(.10, .46, sample() ** 2);
    transform.position.set(x, groundHeight(x,z) - size * .10, z);
    transform.rotation.set(mix(-.33, .33, sample()), sample() * TAU, mix(-.27, .27, sample()));
    transform.scale.set(size * mix(1, 1.52, sample()), size * mix(.44, .81, sample()), size);
    transform.updateMatrix();
    stones.setMatrixAt(i, transform.matrix);
    stones.setColorAt(i, tints[i % tints.length]);
  }
  parent.add(stones);
}

export function buildForestFloor(parent, trunk) {
  const floor = new THREE.Group();
  floor.name = 'Forest floor';
  parent.add(floor);
  const sample = randomFrom(24058);
  buildTerrain(floor, trunk);
  buildGrass(floor, trunk, sample);
  buildRocks(floor, trunk, sample);
}
