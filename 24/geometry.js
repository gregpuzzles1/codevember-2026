import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export const v = (x, y, z) => new THREE.Vector3(x, y, z);
export const color = (value) => new THREE.Color(value);
export const mix = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const TAU = Math.PI * 2;
export const painted = (options = {}) => new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: .9,
  ...options,
});

export function randomFrom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function paint(geometry, sample) {
  const positions = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    sample(vertex, i).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function batch(parent, geometries, material) {
  const geometry = mergeGeometries(geometries);
  geometries.forEach((part) => part.dispose());
  const object = new THREE.Mesh(geometry, material);
  parent.add(object);
  return object;
}

export function tube(points, radius, steps = 14, sides = 5) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, radius, sides, false);
}

export function fiber(output, points, radius, tint, steps = 14, sides = 5) {
  output.push(paint(tube(points, radius, steps, sides), () => tint));
}

export function mesh(parent, geometry, material, at) {
  const object = new THREE.Mesh(geometry, material);
  if (at) object.position.copy(at);
  parent.add(object);
  return object;
}

export function grid(rows, columns, sample) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const t = row / rows;
      const point = sample(u, t);
      positions.push(point.x, point.y, point.z);
      uvs.push(u, t);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
