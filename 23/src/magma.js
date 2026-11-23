import * as THREE from '../vendor/three.module.min.js';
import { chambers, chamberRim, faceZ } from './geology.js';

const magmaVertex = `
  varying vec2 vMagma;
  void main() {
    vMagma = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const moltenShader = `
  vec3 hotColor(float energy) {
    vec3 charcoal = vec3(.028, .007, .004);
    vec3 red = vec3(1.0, .042, .006);
    vec3 orange = vec3(1.0, .33, .024);
    vec3 cream = vec3(1.0, .84, .47);
    return mix(mix(charcoal, red, smoothstep(0.0, .5, energy)),
               mix(orange, cream, smoothstep(.69, 1.05, energy)),
               smoothstep(.29, .83, energy));
  }
`;

function magmaMaterial(uniforms, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: magmaVertex, fragmentShader, side: THREE.DoubleSide,
  });
}

function pocketMaterial() {
  return magmaMaterial({
    heat: { value: 0 }, time: { value: 0 }, flare: { value: 0 },
  }, `
    uniform float heat;
    uniform float time;
    uniform float flare;
    varying vec2 vMagma;
    ${moltenShader}
    vec2 hash2(vec2 p) {
      return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                            dot(p, vec2(269.5, 183.3)))) * 43758.5453);
    }
    void main() {
      vec2 uv = vMagma * 2.0 - 1.0;
      vec2 p = uv * vec2(3.8, 2.9);
      p += .20 * sin(p.yx * 4.0 + vec2(time *.65, -time *.42));
      vec2 cell = floor(p), f = fract(p);
      float first = 10.0, second = 10.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 tile = vec2(float(i), float(j));
          vec2 offset = tile + .22 + .58 * hash2(cell + tile) - f;
          float d = dot(offset, offset);
          if (d < first) { second = first; first = d; }
          else { second = min(second, d); }
        }
      }
      float vein = 1.0 - smoothstep(.035, .26, second - first);
      float surface = .34 + vein * .53 + .14 * sin(p.x * 5.3 + p.y * 2.5 + time) * vein;
      float edge = 1.0 - smoothstep(.47, 1.12, length(uv));
      vec3 dark = vec3(.015, .014, .012) * (.68 + .44 * first);
      vec3 light = hotColor(surface + flare * .17) * (.24 + edge * .93 + flare * .43);
      gl_FragColor = vec4(mix(dark, light, heat), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `);
}

function chamberSurface(def) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const sides = 48;
  const rings = 14;
  const floor = faceZ(def.x, def.y);
  for (let ring = 0; ring <= rings; ring++) {
    const radius = ring / rings;
    for (let segment = 0; segment <= sides; segment++) {
      const theta = segment / sides * Math.PI * 2;
      const [rimX, rimY] = chamberRim(def, theta);
      const x = THREE.MathUtils.lerp(def.x, rimX, radius * .94);
      const y = THREE.MathUtils.lerp(def.y, rimY, radius * .94);
      const z = floor + .17 * Math.sqrt(1 - radius ** 2) +
        .018 * Math.sin(theta * 6 + radius * 11) * radius;
      positions.push(x, y, z);
      uvs.push(.5 + .5 * radius * Math.cos(theta), .5 + .5 * radius * Math.sin(theta));
      if (ring < rings && segment < sides) {
        const i = ring * (sides + 1) + segment;
        indices.push(i, i + sides + 1, i + sides + 2, i, i + sides + 2, i + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry, pocketMaterial());
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,114,48,.72)');
  gradient.addColorStop(.28, 'rgba(244,83,20,.31)');
  gradient.addColorStop(.58, 'rgba(196,43,10,.08)');
  gradient.addColorStop(1, 'rgba(155,28,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeChamber(scene, def, texture) {
  const surface = chamberSurface(def);
  const anchor = new THREE.Vector3(def.x, def.y, faceZ(def.x, def.y) + .204);
  const light = new THREE.PointLight('#ff8134', 0, 2.9, 2);
  light.position.copy(anchor);
  light.position.z += .48;

  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aura.position.copy(anchor);
  aura.position.z = 1.27;
  aura.scale.setScalar(2.0 + def.rx * 1.15);
  scene.add(surface, light, aura);
  return { ...def, surface, anchor, light, aura };
}

const firstPath = [
  [-2.06,.31], [-1.73,.25], [-1.51,.32], [-1.26,.17], [-1.03,.28],
  [-.89,.20], [-.69,.39], [-.49,.37], [-.46,.59], [-.23,.53], [-.06,.69], [.31,.66],
];
const junction = [.65,.36];
const feeder = [[.31,.66], [.52,.57], [.47,.47], junction];
const seam = [
  junction, [.88,.41], [1.13,.48], [1.36,.39], [1.62,.48], [1.88,.35],
  [2.14,.42], [2.35,.26], [2.59,.33], [2.77,.23], [3.12,.27], [3.34,.20],
];
const descent = [
  junction, [.77,.22], [.70,.07], [.91,-.14], [1.12,-.16],
  [1.28,-.33], [1.49,-.39], [1.59,-.52], [1.79,-.53], [1.99,-.73],
];
const basalRiser = [
  [-.96,-1.77], [-.88,-1.54], [-1.01,-1.37], [-.86,-1.18], [-.90,-.97],
  [-.65,-.85], [-.72,-.66], [-.51,-.52], [-.58,-.32], [-.34,-.22],
  [-.38,-.03], [-.16,.09], [-.19,.27], [.02,.34], [.13,.51], [.31,.66],
];
const lowerJunction = [-.88,1.54];
const upperJunction = [-.34,2.32];
const lowerRiser = [
  [-2.06,.31], [-1.85,.46], [-1.91,.64], [-1.68,.76], [-1.62,.98],
  [-1.36,1.08], [-1.28,1.29], [-1.04,1.33], lowerJunction,
];
const riserFeed = [
  [.31,.66], [.25,.85], [.02,.99], [-.06,1.18], [-.34,1.29],
  [-.49,1.45], [-.71,1.44], lowerJunction,
];
const upperRiser = [
  lowerJunction, [-.71,1.73], [-.78,1.91], [-.55,2.04], [-.52,2.24], upperJunction,
];
const summitRiser = [
  upperJunction, [-.44,2.48], [-.28,2.59], [-.39,2.74], [-.32,2.95],
];
const dormantCracks = [
  { points: [[-4.50,-1.29],[-4.17,-1.20],[-3.89,-1.27],[-3.67,-1.12],[-3.26,-1.06]], width: .021 },
  { points: [[-3.73,-.17],[-3.5,-.24],[-3.17,-.11],[-3.04,-.14],[-2.94,.02]], width: .021 },
  { points: [[-2.18,1.13],[-1.92,1.14],[-1.70,.94],[-1.50,.91],[-1.38,.75]], width: .023 },
  { points: [[-.67,-1.46],[-.49,-1.3],[-.20,-1.29],[-.06,-1.16],[.22,-1.19],[.34,-1.03]], width: .027 },
  { points: [[2.87,-1.12],[3.14,-1.19],[3.41,-1.11],[3.63,-1.24],[4.08,-1.21]], width: .026 },
  { points: [[1.00,1.84],[1.19,1.75],[1.41,1.78],[1.62,1.62],[1.84,1.60]], width: .024 },
];

const cracks = [
  { id: 'lowerRiser', points: lowerRiser, width: .083, unlock: 0, rest: .41, uphill: true },
  { id: 'riserFeed', points: riserFeed, width: .083, unlock: 1, rest: .43, uphill: true },
  { id: 'upperRiser', points: upperRiser, width: .094, unlock: 1, rest: .44, uphill: true },
  { id: 'summitRiser', points: summitRiser, width: .078, unlock: 2, rest: .47, uphill: true },
  { id: 'basalRiser', points: basalRiser, width: .107, unlock: 2, rest: .49, uphill: true },
  { id: 'firstPath', points: firstPath, width: .064, unlock: 0, rest: .44 },
  { id: 'feeder', points: feeder, width: .074, unlock: 1, rest: .51, spread: .24 },
  { id: 'seam', points: seam, width: .19, broad: true, unlock: 1, rest: .45, spread: .19 },
  { id: 'descent', points: descent, width: .083, behindRidge: true, unlock: 1, rest: .54 },
];

function crackMaterial(broad) {
  return magmaMaterial({
    base: { value: 0 }, trail: { value: 0 }, head: { value: -2 },
    spread: { value: .15 }, direction: { value: 1 }, broad: { value: broad ? 1 : 0 },
    flow: { value: 0 },
  }, `
    uniform float base;
    uniform float trail;
    uniform float head;
    uniform float spread;
    uniform float direction;
    uniform float broad;
    uniform float flow;
    varying vec2 vMagma;
    ${moltenShader}
    void main() {
      float t = direction > 0.0 ? vMagma.x : 1.0 - vMagma.x;
      float x = vMagma.x;
      float side = vMagma.y * 2.0 - 1.0;
      float ragged = .94 + .045 * sin(x * 214.0) + .035 * cos(x * 523.0);
      float width = ragged - abs(side);
      if (width < 0.0) discard;
      float lip = smoothstep(.015, .19, width);
      float center = 1.0 - smoothstep(.07, .75, abs(side));
      float filament = pow(.5 + .5 * cos(side * 14.0 + x * 24.0 + sin(x * 76.0) * .72), 3.0);
      float channel = mix(center, .42 * center + .58 * filament, broad);
      float waveDistance = (t - head) / spread;
      float wave = exp(-waveDistance * waveDistance * 3.4);
      float revealed = (1.0 - smoothstep(head - spread * .23, head + spread * .35, t)) * trail;
      float warmth = max(base, revealed * .63);
      float noise = .86 + .14 * sin(x * 189.0 + side * 7.3);
      float bands = .5 + .5 * cos((t - head) * 50.0 + side * 5.0 + sin(x * 57.0));
      float current = flow * revealed * bands * bands * channel;
      float energy = (.45 + .33 * channel) * noise + wave * .52 + current * .37;
      float brightness = (.43 + channel * .58) * warmth + wave * .98 * (.5 + channel * .64) + current * .35;
      vec3 cold = mix(vec3(.017, .019, .015), vec3(.006, .008, .006), lip);
      vec3 color = cold + hotColor(energy) * brightness * lip;
      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `);
}

function makeCrack(scene, def) {
  const points = def.points.map(([x, y]) => new THREE.Vector2(x, y));
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve(points[i - 1], points[i]));
  const count = Math.max(36, Math.ceil(path.getLength() * 48));
  const columns = def.broad ? 9 : 5;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = path.getPoint(t);
    const tang = path.getPoint(Math.min(1, t + .009)).sub(path.getPoint(Math.max(0, t - .009))).normalize();
    const extent = def.broad ? .34 + .53 * Math.sin(t * Math.PI) + .26 * Math.sin(t * 17) ** 2 :
      .60 + .40 * Math.sin(t * 26.5 + .5) ** 2;
    const taper = .2 + .8 * Math.min(1, t * 15, (1 - t) * 13);
    for (let j = 0; j <= columns; j++) {
      const across = j / columns * 2 - 1;
      const shift = across * def.width * extent * taper;
      const x = p.x - tang.y * shift;
      const y = p.y + tang.x * shift;
      const submerged = def.behindRidge ? .29 * Math.exp(-(((p.x - .925) / .16) ** 2)) : 0;
      const z = faceZ(x, y) + .037 + (1 - across * across) * .017 - submerged;
      positions.push(x, y, z);
      uvs.push(t, j / columns);
      if (i < count && j < columns) {
        const v = i * (columns + 1) + j;
        indices.push(v, v + 1, v + columns + 1, v + 1, v + columns + 2, v + columns + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = crackMaterial(def.broad);
  scene.add(new THREE.Mesh(geometry, material));
  return { path, def, uniforms: material.uniforms };
}

// The basal surge and the heart's surge both reach the second chamber here.
const mergeTime = 1.18;
const schedules = [
  {
    lowerRiser: { start: .04, duration: 1.43, direction: 1 },
    firstPath: { start: 0, duration: 1.48, direction: 1 },
  },
  {
    riserFeed: { start: .03, duration: .90, direction: 1 },
    upperRiser: { start: .81, duration: 1.05, direction: 1 },
    feeder: { start: 0, duration: .43, direction: 1 },
    seam: { start: .38, duration: 1.12, direction: 1 },
    descent: { start: .38, duration: 1.26, direction: 1 },
  },
  {
    descent: { start: 0, duration: .90, direction: -1 },
    basalRiser: { start: .04, duration: 1.31, direction: 1 },
    feeder: { start: .80, duration: .44, direction: -1 },
    seam: { start: .80, duration: 1.13, direction: 1 },
    firstPath: { start: 1.17, duration: 1.35, direction: -1 },
    riserFeed: { start: mergeTime, duration: .83, direction: 1 },
    upperRiser: { start: 1.90, duration: .82, direction: 1 },
    summitRiser: { start: 2.61, duration: .72, direction: 1 },
  },
];

const durations = [1.77, 2.00, 3.48];

export function buildMagma(scene) {
  const texture = glowTexture();
  const pockets = chambers.map(def => makeChamber(scene, def, texture));
  const paths = cracks.map(def => makeCrack(scene, def));
  dormantCracks.forEach(def => makeCrack(scene, def));

  const pulseLights = Array.from({ length: 2 }, () => new THREE.PointLight('#ff9b46', 0, 2.2, 2));
  scene.add(...pulseLights);

  function update({ time, active, transition, reduced }) {
    const step = transition?.step ?? active;
    const elapsed = transition ? time - transition.start : 0;
    const fade = THREE.MathUtils.smoothstep(elapsed, 0, .67);
    const arrivals = [1.40, 1.52];
    const finaleSettled = active === 3 && !transition;
    pulseLights.forEach(light => { light.intensity = 0; });

    for (let i = 0; i < pockets.length; i++) {
      const pocket = pockets[i];
      const isNext = i === active && !transition;
      let heat = i < step ? .72 : (isNext || i === step ? .94 : 0);
      let flare = isNext && !reduced ? .09 + .075 * Math.sin(time * 3) : 0;
      if (transition) {
        if (i === step) {
          flare = .74 * Math.exp(-elapsed * 3.2);
          heat = THREE.MathUtils.lerp(.94, .72, fade);
        }
        if (i === step + 1) {
          heat = .94 * (reduced ? fade : THREE.MathUtils.smoothstep(elapsed, arrivals[step] - .12, arrivals[step] + .26));
          flare = heat * .23;
        }
        if (step === 2 && i < step && !reduced) {
          const arrival = i === 0 ? 2.46 : mergeTime;
          const strength = i === 0 ? .37 : .58;
          flare = strength * Math.exp(-(((elapsed - arrival) / .25) ** 2));
        }
      }
      if (finaleSettled) heat = .76;
      pocket.surface.material.uniforms.heat.value = heat;
      pocket.surface.material.uniforms.time.value = reduced ? 0 : time * .68;
      pocket.surface.material.uniforms.flare.value = reduced ? flare * .13 : flare;
      pocket.light.intensity = heat * (3.0 + i * 1.3) + flare * (reduced ? .45 : 6.7);
      pocket.aura.material.opacity = (heat * .3 + flare * (reduced ? .09 : .31)) * (i === 2 ? 1.22 : 1);
    }

    let lightIndex = 0;
    for (const { path, def, uniforms } of paths) {
      uniforms.base.value = def.unlock < step ? def.rest : 0;
      uniforms.trail.value = 0;
      uniforms.head.value = -2;
      uniforms.flow.value = 0;

      if (!transition) continue;
      const cue = schedules[step][def.id];
      if (!cue) continue;
      if (reduced) {
        const from = uniforms.base.value;
        uniforms.base.value = THREE.MathUtils.lerp(from, step === 2 ? .78 : def.rest, fade);
        if (step === 2) uniforms.base.value = THREE.MathUtils.lerp(uniforms.base.value, def.rest, THREE.MathUtils.smoothstep(elapsed, .55, 1.12));
        continue;
      }

      const phase = (elapsed - cue.start) / cue.duration;
      if (phase < 0) continue;
      uniforms.direction.value = cue.direction;
      uniforms.spread.value = def.spread ?? (def.uphill ? .17 : .12);
      uniforms.head.value = phase * 1.15;
      uniforms.trail.value = def.rest / .63;
      if (def.uphill) uniforms.flow.value = 1 - THREE.MathUtils.smoothstep(phase, .76, 1.04);
      if (phase <= 1 && lightIndex < pulseLights.length) {
        const t = THREE.MathUtils.clamp(uniforms.head.value, 0, 1);
        const p = path.getPoint(cue.direction === 1 ? t : 1 - t);
        const light = pulseLights[lightIndex++];
        light.position.set(p.x, p.y, faceZ(p.x, p.y) + .22);
        const hidden = def.behindRidge && p.x > .81 && p.x < 1.08;
        const strength = hidden ? .9 : def.uphill ? 6.8 : 5.6;
        light.intensity = strength * Math.sin(Math.PI * THREE.MathUtils.clamp(phase, 0, .99)) ** .32;
      }
    }
  }

  return { pockets, update, durations };
}
