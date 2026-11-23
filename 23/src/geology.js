import * as THREE from '../vendor/three.module.min.js';

export const chambers = [
  { name: 'First chamber', x: -2.06, y: .31, rx: .40, ry: .26, depth: .43 },
  { name: 'Second chamber', x: .31, y: .66, rx: .57, ry: .33, depth: .49 },
  { name: 'Heart of the mountain', x: 1.99, y: -.73, rx: .87, ry: .46, depth: .60 },
];

const profile = [
  [-2.02, 5.08, -.10, 4.44], [-1.84, 5.45, -.02, 4.73],
  [-1.45, 5.51, -.07, 4.65], [-1.29, 5.23, -.07, 4.51],
  [-1.06, 4.81, .04, 4.15], [-.65, 4.45, .16, 3.86],
  [-.29, 4.06, .18, 3.43], [.09, 3.73, .22, 3.08],
  [.42, 3.47, .11, 2.87], [.74, 3.13, .20, 2.54],
  [1.05, 2.84, .29, 2.42], [1.36, 2.49, .24, 2.14],
  [1.69, 2.12, .23, 1.89], [1.94, 1.87, .16, 1.57],
  [2.27, 1.53, .19, 1.26], [2.50, 1.23, .10, .96],
  [2.72, .98, -.03, .69], [2.98, .63, -.11, .50],
  [3.22, .33, -.33, .33], [3.36, .07, -.39, .13],
];

const strata = [
  '#3d453d', '#4e5449', '#343b35', '#626355', '#454840', '#383c35',
  '#605c4e', '#424840', '#5a5d51', '#454841', '#6a6858', '#484d43',
  '#5e6558', '#3d4840', '#687266', '#545f56', '#778174', '#697469', '#839081',
].map(color => new THREE.Color(color));
const stoneDark = new THREE.Color('#252c27');

function fract(value) { return value - Math.floor(value); }

function grain(a, b, c = 0) {
  return fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + .9) * 43758.5453);
}

export function chamberRim(def, theta) {
  const shape = 1 + .12 * Math.sin(theta * 3 + def.x) + .085 * Math.cos(theta * 5 + def.y * 3);
  return [
    def.x + Math.cos(theta) * def.rx * shape,
    def.y + Math.sin(theta) * def.ry * shape + Math.cos(theta) * def.rx * .17,
  ];
}

export function faceZ(x, y) {
  let z = 1.1 + .13 * Math.sin(x * 1.53 + y * 1.7) +
    .07 * Math.sin(x * 4.8 - y * 2.2) + .045 * Math.cos(y * 14.0 + x * 2.8);
  const ridgeX = .945 + .34 * y;
  z += .49 * Math.exp(-((x - ridgeX) ** 2 / .032 + (y + .085) ** 2 / .48));
  for (const c of chambers) {
    const dx = (x - c.x) / c.rx;
    const dy = (y - c.y - (x - c.x) * .17) / c.ry;
    const theta = Math.atan2(dy, dx);
    const shape = 1 + .12 * Math.sin(theta * 3 + c.x) + .085 * Math.cos(theta * 5 + c.y * 3);
    const distance = Math.hypot(dx, dy) / shape;
    const rim = 1 - THREE.MathUtils.smoothstep(distance, .64, 1.16);
    z -= c.depth * rim;
  }
  return z;
}

function geometryFrom(positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function rockMaterial(detail) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vRock;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvRock = position;',
    );
    shader.fragmentShader = `
      varying vec3 vRock;
      float rockHash(vec3 p) {
        p = fract(p * .3183099 + vec3(.1, .23, .14));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float rockNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(rockHash(i), rockHash(i + vec3(1,0,0)), f.x),
                       mix(rockHash(i + vec3(0,1,0)), rockHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(rockHash(i + vec3(0,0,1)), rockHash(i + vec3(1,0,1)), f.x),
                       mix(rockHash(i + vec3(0,1,1)), rockHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
    ` + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float coarse = rockNoise(vRock * vec3(4.0, 7.0, 5.0));
      float grit = rockNoise(vRock * 71.0);
      float rib = sin(vRock.y * 37.0 + 3.0 * sin(vRock.x * 1.2 + vRock.z * .75) + coarse * 1.9);
      float shelf = smoothstep(.71, .99, rib);
      diffuseColor.rgb *= (.70 + coarse * .39 + grit * .23 - shelf * ${detail.toFixed(2)});
    `);
  };
  material.customProgramCacheKey = () => String(detail);
  return material;
}

function frontPosition(row, u) {
  const [height, width, offset] = profile[row];
  const x = offset + width * u;
  const rugged = row <= 1 ? .040 : .12;
  const y = height + rugged * (
    .63 * Math.sin(x * 1.48 + row * .26) + .34 * Math.sin(x * 3.7 - row * .44) +
    .23 * u * Math.cos(row * .42)
  );
  return [x, y, faceZ(x, y)];
}

function rearPosition(row, u) {
  if (u <= 0) return frontPosition(row, 1);
  if (u >= 1) return frontPosition(row, -1);
  const [height, width, offset, length] = profile[row];
  const theta = u * Math.PI;
  const rugged = Math.sin(theta) * (row < 2 ? .055 : row > 16 ? .085 : .21);
  const x = offset + width * Math.cos(theta) *
    (1 + rugged * (.6 * Math.sin(u * 46 + row * .25) + .23 * Math.sin(u * 89)));
  const y = height + rugged * (.65 * Math.sin(u * 54 + row * .58) + .64 * Math.cos(u * 28 - row * .28));
  const z = faceZ(offset, height) - length * Math.sin(theta) *
    (1 + rugged * (.8 * Math.sin(u * 29 + row * .21) + .43 * Math.sin(u * 67)));
  return [x, y, z];
}

function gridMesh({ rows, columns, point, colorAt, detail }) {
  const positions = [];
  const colors = [];
  const addTriangle = (a, b, c, row, col, variant) => {
    const color = colorAt(row, col, variant);
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  const grid = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, col) => point(row, col)),
  );
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = grid[row][col];
      const b = grid[row][col + 1];
      const c = grid[row + 1][col];
      const d = grid[row + 1][col + 1];
      if (grain(row, col, 7) > .5) {
        addTriangle(a, b, d, row, col, 0);
        addTriangle(a, d, c, row, col, 1);
      } else {
        addTriangle(a, b, c, row, col, 0);
        addTriangle(b, d, c, row, col, 1);
      }
    }
  }
  return new THREE.Mesh(geometryFrom(positions, colors), rockMaterial(detail));
}

function makeFace() {
  const subdivisions = 5;
  const columns = 80;
  return gridMesh({
    rows: (profile.length - 1) * subdivisions, columns, detail: .15,
    point(row, col) {
      const band = Math.min(Math.floor(row / subdivisions), profile.length - 2);
      const t = (row - band * subdivisions) / subdivisions;
      const interior = col > 0 && col < columns;
      const u = (col + (interior ? (grain(row, col) - .5) * .56 : 0)) / columns * 2 - 1;
      const a = frontPosition(band, u);
      const b = frontPosition(band + 1, u);
      const v = t + (interior && t > 0 && t < 1 ? (grain(col, row, 3) - .5) * .11 : 0);
      const x = THREE.MathUtils.lerp(a[0], b[0], v);
      const y = THREE.MathUtils.lerp(a[1], b[1], v);
      const prominence = Math.min(1, profile[band][1] / 1.5);
      const z = interior ? faceZ(x, y) + (grain(row, col, 4) - .5) * .025 * prominence :
        THREE.MathUtils.lerp(a[2], b[2], v);
      return [x, y, z];
    },
    colorAt(row, col, variant) {
      const band = Math.floor(row / subdivisions);
      const edge = row % subdivisions === 0;
      const vein = Math.sin(col * .31 + band * 1.2) * .075;
      return strata[band].clone().multiplyScalar(.84 + vein + grain(row, col, variant) * .24)
        .lerp(stoneDark, edge ? .23 : .03);
    },
  });
}

function makeShell() {
  const columns = 39;
  return gridMesh({
    rows: profile.length - 1, columns, detail: .10,
    point(row, col) {
      const jitter = col > 0 && col < columns && row > 1 ? (grain(row, col) - .5) * .55 : 0;
      return rearPosition(row, (col + jitter) / columns);
    },
    colorAt(row, col, variant) {
      const shade = grain(row, col, variant + 6);
      return strata[row].clone().lerp(stoneDark, row < 4 ? .53 : .33)
        .multiplyScalar(.67 + shade * .6);
    },
  });
}

function makeCap(row, top) {
  const positions = [];
  const count = 60;
  const center = [profile[row][2], profile[row][0], top ? 1.06 : -.65];
  for (let i = 0; i < count; i++) {
    positions.push(...center, ...rearPosition(row, i / count), ...rearPosition(row, (i + 1) / count));
  }
  return new THREE.Mesh(geometryFrom(positions), new THREE.MeshStandardMaterial({
    color: top ? '#667269' : '#29322b', roughness: 1, side: THREE.DoubleSide,
  }));
}

function scatterScree(group) {
  const material = new THREE.MeshStandardMaterial({ color: '#697368', roughness: 1, flatShading: true });
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const count = 124;
  const scree = new THREE.InstancedMesh(geo, material, count);
  const stamp = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const row = Math.floor(grain(i, 4) * (i < 80 ? 6 : 17)) + (i < 80 ? 1 : 2);
    const u = grain(i, 17) * .94 + .03;
    const p = rearPosition(row, u);
    const size = .055 + grain(i, 3) ** 2 * (row < 5 ? .29 : .19);
    stamp.position.set(p[0], p[1] + .012, p[2]);
    stamp.rotation.set(grain(i, 1) * 2, grain(i, 2) * 7, grain(i, 19) * 2);
    stamp.scale.set(size * (1 + grain(i, 11)), size * .57, size);
    stamp.updateMatrix();
    scree.setMatrixAt(i, stamp.matrix);
    tint.setScalar(.53 + grain(i, 14) * .46);
    scree.setColorAt(i, tint);
  }
  group.add(scree);
}

function makeShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(96, 96, 12, 96, 96, 95);
  gradient.addColorStop(0, '#020403e8');
  gradient.addColorStop(.48, '#020403a0');
  gradient.addColorStop(1, '#02040300');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 192, 192);
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 9.1), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(.22, -2.17, -.85);
  return shadow;
}

export function buildMountain(scene) {
  const group = new THREE.Group();
  const face = makeFace();
  const shell = makeShell();
  const top = makeCap(profile.length - 1, true);
  const bottom = makeCap(0, false);
  group.add(face, shell, top, bottom);
  scatterScree(group);
  scene.add(group, makeShadow());
  return [face, shell, top, bottom];
}
