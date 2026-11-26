import * as THREE from './vendor/three.module.min.js';

export const orbitRadius = 13;
const wordWidth = 10.65;
const wordHeight = 1.77;

// Fixed seed keeps the composition and reveal identical across devices.
function randomSequence(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function wordMask() {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 320;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.font = '700 225px "Space Grotesk", sans-serif';
  const word = 'ANAMORPH';
  const metrics = context.measureText(word);
  const width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
  const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  context.translate(16, 12);
  context.scale((canvas.width - 32) / width, (canvas.height - 24) / height);
  context.fillStyle = 'white';
  context.fillText(word, metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxAscent);
  context.setTransform(1, 0, 0, 1, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return {
    texture,
    contains(x, y) {
      const col = Math.floor((x / wordWidth + .5) * canvas.width);
      const row = Math.floor((.5 - y / wordHeight) * canvas.height);
      return col >= 0 && col < canvas.width && row >= 0 && row < canvas.height
        && pixels[(row * canvas.width + col) * 4 + 3] > 160;
    },
  };
}

// A point on the reveal plane and all its placements along this ray have
// the same screen coordinates when viewed from (0, 0, orbitRadius).
function rayPoint(x, y, z) {
  const scale = (orbitRadius - z) / orbitRadius;
  return new THREE.Vector3(x * scale, y * scale, z);
}

function clipCell(polygon, site, neighbor) {
  const dx = neighbor.x - site.x;
  const dy = neighbor.y - site.y;
  const midpointX = (neighbor.x + site.x) * .5;
  const midpointY = (neighbor.y + site.y) * .5;
  const side = ({ x, y }) => (x - midpointX) * dx + (y - midpointY) * dy;
  const result = [];
  let previous = polygon.at(-1);
  let before = side(previous);

  for (const current of polygon) {
    const after = side(current);
    if ((before <= 0) !== (after <= 0)) {
      const portion = before / (before - after);
      result.push({
        x: THREE.MathUtils.lerp(previous.x, current.x, portion),
        y: THREE.MathUtils.lerp(previous.y, current.y, portion),
      });
    }
    if (after <= 0) result.push(current);
    previous = current;
    before = after;
  }
  return result;
}

function strandsBuilder() {
  const positions = [];
  const colors = [];
  const indices = [];
  const axis = new THREE.Vector3(0, 0, 1);

  function add(points, radius, color) {
    const curve = new THREE.CatmullRomCurve3(points);
    const rings = points.length > 4 ? 20 : 10;
    const sides = 5;
    const base = positions.length / 3;

    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings;
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      const reference = Math.abs(tangent.dot(axis)) > .96 ? new THREE.Vector3(0, 1, 0) : axis;
      const normal = new THREE.Vector3().crossVectors(tangent, reference).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      const taper = .05 + .95 * Math.pow(1 - t, .68);
      for (let side = 0; side < sides; side++) {
        const angle = side / sides * Math.PI * 2;
        const vertex = point.clone()
          .addScaledVector(normal, Math.cos(angle) * radius * taper)
          .addScaledVector(binormal, Math.sin(angle) * radius * taper);
        positions.push(vertex.x, vertex.y, vertex.z);
        const light = (.58 + .42 * Math.sin(angle * .5)) * (1 - t * .36);
        colors.push(color.r * light, color.g * light, color.b * light);
        if (ring === 0) continue;
        const a = base + (ring - 1) * sides + side;
        const b = base + (ring - 1) * sides + (side + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }

  function mesh() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }));
  }

  return { add, mesh };
}

function makeFragments(mask, random, strands) {
  const halfWidth = wordWidth / 2;
  const halfHeight = wordHeight / 2;
  const domain = [
    { x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight },
  ];
  const sites = [];
  const columns = 24;
  const rows = 7;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      sites.push({
        x: ((column + .5 + (random() - .5) * .86) / columns - .5) * wordWidth,
        y: ((row + .5 + (random() - .5) * .9) / rows - .5) * wordHeight,
      });
    }
  }

  const positions = [];
  const coordinates = [];
  const shades = [];
  const indices = [];
  const ivory = new THREE.Color('#bed1eb');
  const blue = new THREE.Color('#78a2df');

  sites.forEach((site) => {
    let polygon = domain;
    for (const neighbor of sites) {
      if (site === neighbor) continue;
      polygon = clipCell(polygon, site, neighbor);
    }

    const depth = THREE.MathUtils.lerp(-5.9, 5.25, random());
    const brightness = .65 + random() * .35;
    const offset = positions.length / 3;

    for (const { x, y } of polygon) {
      const vertex = rayPoint(x, y, depth);
      positions.push(vertex.x, vertex.y, vertex.z);
      coordinates.push(x / wordWidth + .5, y / wordHeight + .5);
      shades.push(brightness);
    }
    for (let index = 1; index < polygon.length - 1; index++) {
      indices.push(offset, offset + index, offset + index + 1);
    }

    // Anchor fine hyphae in the inked part of the cell.
    const candidates = [site, ...polygon.map(({ x, y }) => ({
      x: THREE.MathUtils.lerp(site.x, x, .72),
      y: THREE.MathUtils.lerp(site.y, y, .72),
    }))];
    const root = candidates.find(({ x, y }) => mask.contains(x, y));
    if (!root) return;

    const start = rayPoint(root.x, root.y, depth + .008);
    const direction = (root.y > 0 ? 1 : -1) * (random() < .17 ? -1 : 1);
    const reach = .17 + Math.pow(random(), 1.65) * .89;
    const bend = (random() - .5) * reach * 1.85;
    const depthBend = (random() - .5) * 1.35;
    const points = [
      start,
      rayPoint(root.x + bend * .25, root.y + direction * reach * .32, depth + depthBend * .34),
      rayPoint(root.x + bend * .6, root.y + direction * reach * .76, depth + depthBend * .76),
      rayPoint(root.x + bend, root.y + direction * reach, depth + depthBend),
    ];
    const color = ivory.clone().lerp(blue, random() * .76).multiplyScalar(.48 + random() * .48);
    strands.add(points, .005 + random() * .012, color);
    strands.add([
      points[1],
      points[1].clone().lerp(points[2], .84).add(new THREE.Vector3(-bend * .45, .04 * direction, .09)),
      points[2].clone().add(new THREE.Vector3(-bend * .8, .14 * direction, .24)),
    ], .005 + random() * .004, color.clone().multiplyScalar(.75));
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
  geometry.setAttribute('shade', new THREE.Float32BufferAttribute(shades, 1));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    uniforms: { wordMask: { value: mask.texture } },
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float shade;
      varying vec2 maskUV;
      varying vec3 worldPoint;
      varying float light;
      void main() {
        maskUV = uv;
        worldPoint = position;
        light = shade;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D wordMask;
      varying vec2 maskUV;
      varying vec3 worldPoint;
      varying float light;
      void main() {
        float ink = texture2D(wordMask, maskUV).a;
        if (ink < .38) discard;
        float fiber = sin(maskUV.x * 1610.0 + maskUV.y * 79.0 + sin(maskUV.y * 23.0 + worldPoint.z * .8) * 4.0);
        float grain = fract(sin(dot(floor(maskUV * vec2(1450.0, 290.0)), vec2(12.9898, 78.233))) * 43758.5453);
        float lamp = (.73 + light * .25) * (.90 + fiber * .046 + grain * .072);
        vec3 color = mix(vec3(.28, .47, .76), vec3(.86, .93, 1.0), light);
        gl_FragColor = vec4(color * lamp, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function growOuterHyphae(strands, random) {
  const colors = ['#4f75a9', '#6b91c6', '#91aed5', '#c4d8f1'].map((color) => new THREE.Color(color));
  for (let i = 0; i < 68; i++) {
    const x = (random() - .5) * 11.55;
    const side = i % 2 === 0 ? -1 : 1;
    const y = side * (.99 + random() * .94);
    const z = (random() - .5) * 9.4;
    const length = .37 + random() * 1.58;
    const lean = (random() < .55 ? -1 : 1) * length;
    const bow = side * (.09 + random() * .32);
    const points = Array.from({ length: 6 }, (_, index) => {
      const t = index / 5;
      return rayPoint(x + lean * t, y + Math.sin(t * Math.PI * 1.16) * bow, z + t * .62);
    });
    const color = colors[Math.floor(random() * colors.length)].clone().multiplyScalar(.32 + random() * .42);
    strands.add(points, .006 + random() * .014, color);

    for (let index = 1; index < 5; index++) {
      const root = points[index];
      const reach = .10 + random() * .43;
      const offset = new THREE.Vector3(lean * .19, (index % 2 ? -side : side) * reach, (random() - .5) * .49);
      const end = root.clone().add(offset);
      const mid = root.clone().lerp(end, .5).add(new THREE.Vector3(lean * .13, 0, .09));
      strands.add([root, mid, end], .004 + random() * .006, color);
    }
  }
}

function makeSpores(random) {
  const positions = [];
  const variation = [];
  const color = [];
  const backgroundBlue = new THREE.Color('#578fff');
  const brightBlue = new THREE.Color('#9dc9ff');

  for (let i = 0; i < 1250; i++) {
    const surrounding = i < 740;
    const x = (random() - .5) * (surrounding ? 18 : 12);
    const z = (random() - .5) * (surrounding ? 16 : 11);
    const y = surrounding
      ? (random() - .5) * 9.7
      : (i % 2 ? 1 : -1) * (1.02 + random() * 1.14);
    const point = rayPoint(x, y, z);
    const lit = random();
    positions.push(point.x, point.y, point.z);
    variation.push(lit, random() * 6.2832, surrounding ? 0 : 1);
    const tint = backgroundBlue.clone().lerp(brightBlue, lit ** 3);
    color.push(tint.r, tint.g, tint.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('variation', new THREE.Float32BufferAttribute(variation, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 }, stageHeight: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float time;
      uniform float pixelRatio;
      uniform float stageHeight;
      attribute vec3 variation;
      attribute vec3 color;
      varying vec3 tint;
      varying float opacity;
      varying float glow;

      void main() {
        vec3 point = position;
        float seed = variation.y;
        float drift = step(.84, variation.x);
        point.x += (sin(time * .20 + seed) - sin(seed)) * .14 * drift;
        point.y += (cos(time * .16 + seed) - cos(seed)) * .16 * drift;
        vec4 view = modelViewMatrix * vec4(point, 1.0);
        gl_Position = projectionMatrix * view;
        float perspective = clamp(13.0 / -view.z, .45, 2.2);
        float size = (.70 + pow(variation.x, 5.5) * 6.5) * perspective;
        gl_PointSize = clamp(size * sqrt(stageHeight / 430.0), 1.0, 12.0) * pixelRatio;
        tint = color;
        glow = variation.x;
        opacity = (.074 + pow(variation.x, 2.1) * .47) * (.56 + variation.z * .44) * min(perspective, 1.3);
      }
    `,
    fragmentShader: `
      varying vec3 tint;
      varying float opacity;
      varying float glow;
      void main() {
        float radius = length(gl_PointCoord - .5) * 2.0;
        float core = exp(-radius * radius * 11.0);
        float halo = exp(-radius * radius * 4.0) * .30;
        float softEdge = 1.0 - smoothstep(.72, 1.0, radius);
        gl_FragColor = vec4(tint * (.43 + .53 * glow), (core + halo) * softEdge * opacity);
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Points(geometry, material);
}

export function createCloud() {
  const random = randomSequence(260719);
  const scene = new THREE.Scene();
  const strands = strandsBuilder();
  const fragments = makeFragments(wordMask(), random, strands);
  growOuterHyphae(strands, random);
  const spores = makeSpores(random);
  scene.add(fragments, strands.mesh(), spores);
  return { scene, spores };
}

export { THREE };
