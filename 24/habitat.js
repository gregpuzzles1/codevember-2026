import * as THREE from './vendor/three.module.min.js';
import { buildForestFloor, groundHeight } from './forest-floor.js';
import { batch, clamp, color, fiber, grid, mesh, mix, paint, painted, randomFrom, TAU, v } from './geometry.js';

const strawMaterial = painted();
const leafMaterial = painted({ side: THREE.DoubleSide, roughness: .76 });
const random = randomFrom(2405);
const range = (a, b) => mix(a, b, random());
const trunkBase = { x: -6.38, z: 2.45 };
const trunkLimbs = [
  {
    points: [[-6.18,-7.18,2.17],[-5.36,-6.86,2.87],[-4.42,-6.39,3.63],[-3.70,-5.68,4.64]],
    radii: [.28,.22,.10,.018], leaves: .60,
  },
  {
    points: [[-6.07,-5.25,1.79],[-6.93,-4.92,.82],[-7.78,-4.39,.36],[-8.87,-3.76,-.27]],
    radii: [.34,.24,.13,.020], leaves: .64,
  },
  {
    points: [[-7.78,-4.39,.36],[-8.02,-3.96,.73],[-8.27,-3.30,1.12]],
    radii: [.106,.065,.014], leaves: .48,
  },
  {
    points: [[-6.15,-2.18,1.54],[-6.64,-1.66,2.77],[-7.45,-1.02,3.56],[-8.41,.10,4.46]],
    radii: [.31,.23,.12,.023], leaves: .76,
  },
  {
    points: [[-7.45,-1.02,3.56],[-7.47,-.49,4.35],[-7.19,.18,5.02]],
    radii: [.104,.060,.015], leaves: .54,
  },
  {
    points: [[-6.63,-.08,1.64],[-7.22,.51,.42],[-7.58,1.39,-.87],[-8.04,2.36,-2.09]],
    radii: [.28,.20,.11,.018], leaves: .68,
  },
  {
    points: [[-8.02,2.48,1.96],[-7.49,3.14,2.81],[-6.11,4.34,3.36],[-5.17,4.79,4.15]],
    radii: [.29,.21,.11,.026], leaves: .73,
  },
  {
    points: [[-10.01,5.05,2.49],[-10.75,5.78,1.22],[-11.10,6.86,.04],[-10.93,7.70,-.93]],
    radii: [.23,.18,.083,.013], leaves: .55,
  },
];

function canopyLight(point) {
  const u = point.x + .26 * point.y;
  const w = point.z - .58 * point.y;
  const pattern = .55 * Math.sin(u * 4.9 + w * 2.8) + .45 * Math.cos(u * 3.7 - w * 4.4);
  return .92 + .14 * THREE.MathUtils.smoothstep(pattern, -.45, .52);
}

function barkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const bark = randomFrom(34142);
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const a = TAU * x / canvas.width;
      const t = TAU * y / canvas.height;
      const flow = 1.5 * Math.sin(t * 3 + a * 4) + .55 * Math.sin(t * 8 + a * 8);
      const cuts = Math.pow(.5 + Math.sin(a * 29 + flow) * .5, 9) * 34;
      const grain = Math.sin(a * 74 + flow * 1.8) * Math.cos(t * 9 + a * 11) * 12;
      const detail = Math.sin(a * 123 - t * 22) * 5 + (bark() - .5) * 16;
      const light = 239 - cuts + grain + detail;
      const i = (y * canvas.width + x) * 4;
      image.data[i] = light;
      image.data[i + 1] = light;
      image.data[i + 2] = light;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function branchSurface(points, radii, steps, sides, base, phase, sample = random) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(steps, false);
  const centers = curve.getSpacedPoints(steps);
  const tints = [];
  const groove = color('#35271d');
  const ridge = color('#a08b72');

  const geometry = grid(steps, sides, (u, t) => {
    const i = Math.round(t * steps);
    const position = t * (radii.length - 1);
    const lower = Math.min(radii.length - 2, Math.floor(position));
    const radius = mix(radii[lower], radii[lower + 1], position - lower);
    const a = u * TAU;
    const grain = .49 * Math.sin(a * 9 + phase + Math.sin(t * 7) * 1.5) +
      .27 * Math.sin(a * 17 - t * 9 + phase) + .24 * Math.sin(a * 4 + t * 22);
    const fleck = sample() - .5;
    const bark = base.clone().lerp(grain < 0 ? groove : ridge, Math.abs(grain) * .56);
    bark.multiplyScalar(1 + fleck * .18);
    if (Math.sin(a * 5 + t * 28) * Math.cos(a * 3 + t * 17) > .73) {
      bark.lerp(color('#9a9375'), .38);
    }
    tints.push(bark);
    const width = radius * (1 + .12 * grain + .075 * Math.sin(a * 3 + t * 9));
    return centers[i].clone()
      .addScaledVector(frames.normals[i], Math.cos(a) * width)
      .addScaledVector(frames.binormals[i], Math.sin(a) * width);
  });
  return paint(geometry, (point, i) => tints[i].multiplyScalar(canopyLight(point)));
}

function buildTree(parent) {
  const bark = [];
  const dark = color('#695244');
  const light = color('#79604b');
  const branch = (p, r, steps, sides, base = dark, sample = random) => {
    bark.push(branchSurface(p.map((xyz) => v(...xyz)), r, steps, sides, base, sample() * TAU, sample));
  };

  branch([[-5.7,-3.5,1.4],[-3.4,-1.7,.77],[-1.65,-.79,.24],[.25,-.51,-.17],[2.37,-.39,-.97],[4.65,-.09,-1.48]], [.75,.53,.37,.27,.19,.035], 82, 42);
  branch([[-1.84,-1.02,.36],[-1.12,-.72,-.35],[-.8,-.32,-1.1],[-.6,.36,-2.02],[-.57,1.35,-2.96],[-.03,2.28,-3.75]], [.35,.29,.24,.16,.11,.025], 62, 34);
  branch([[.33,-.64,-.50],[.86,-.21,-.85],[1.63,.57,-.5],[2.28,.75,-.6],[3.12,1.08,-.97],[4.58,1.91,-1.15]], [.26,.22,.15,.12,.08,.025], 68, 35, light);
  branch([[2.31,.76,-.64],[2.92,1.41,-.9],[3.17,2.12,-1.08],[3.54,3.05,-1.28],[4.15,3.63,-1.66]], [.138,.102,.077,.046,.013], 45, 24, light);
  branch([[3.14,2.08,-1.09],[2.9,2.67,-1.21],[2.5,3.08,-1.39],[1.99,3.45,-1.8]], [.083,.059,.038,.012], 35, 20, light);
  branch([[-.77,-.28,-1.13],[-1.66,.17,-1.82],[-2.6,.91,-2.35],[-3.59,1.64,-2.79],[-4.76,1.98,-3.2]], [.181,.14,.093,.057,.01], 50, 28);
  branch([[-2.54,.88,-2.3],[-2.47,1.59,-2.59],[-2.57,2.23,-2.56],[-2.94,2.98,-2.81],[-3.69,3.51,-3.06]], [.10,.076,.051,.034,.01], 46, 24, light);
  branch([[-2.56,2.19,-2.61],[-1.83,2.77,-2.79],[-1.26,3.05,-2.92],[-.61,3.21,-3.2]], [.072,.046,.027,.012], 36, 20);
  branch([[-3.93,-2.11,1.09],[-3.25,-1.48,1.48],[-3,-.76,1.74],[-3.12,-.11,1.94],[-3.64,.39,2.05]], [.31,.21,.12,.064,.015], 47, 31);
  branch([[1.23,-.48,-.63],[2.14,-.25,-1.41],[2.7,.36,-1.92],[3.53,.66,-2],[4.51,.79,-1.78]], [.18,.128,.076,.05,.011], 46, 22);
  branch([[3.15,1.08,-.97],[3.83,1.11,-.37],[4.44,1.23,.07],[5.15,1.39,.16]], [.076,.056,.03,.01], 33, 23, light);

  // Start below the clearing so the flared trunk meets the soil on every side.
  const trunkPoints = [
    v(trunkBase.x,groundHeight(trunkBase.x,trunkBase.z)-.86,trunkBase.z),
    v(-6.29,-8.7,2.37), v(-6.11,-6.8,2.04),
    v(-5.98,-3.5,1.48), v(-6.50,-.40,1.59), v(-8.02,2.48,1.96),
    v(-10.72,5.84,2.64), v(-16.24,10.4,2.92), v(-21.20,16.8,2.67),
  ];
  const trunkRadii = [2.42,1.80,1.38,1.20,1.06,.91,.74,.61,.43,.26,.12];
  const trunkGrain = randomFrom(24051);
  const trunkTint = color('#685547');
  bark.push(branchSurface(trunkPoints, trunkRadii, 132, 46, trunkTint, trunkGrain() * TAU, trunkGrain));
  for (const { points, radii } of trunkLimbs) {
    branch(points, radii, 33, 21, trunkTint, trunkGrain);
  }
  for (const [angle, length, thickness] of [
    [.13,5.10,.64], [.98,4.20,.49], [1.90,3.87,.51], [2.78,4.76,.65],
    [3.86,4.62,.57], [4.66,5.23,.62], [5.56,3.84,.54],
  ]) {
    const points = [1.20,1.98,length*.64,length].map((distance, i) => {
      const sweep = angle + .11 * i * (angle % 2 < 1 ? -1 : 1);
      const x = trunkBase.x + Math.cos(sweep) * distance;
      const z = trunkBase.z + Math.sin(sweep) * distance;
      return [x, groundHeight(x,z) + [.66,.37,.10,-.17][i], z];
    });
    branch(points, [thickness,thickness*.66,thickness*.32,.022], 32, 21, trunkTint, trunkGrain);
  }

  const texture = barkTexture();
  const branches = batch(parent, bark, painted({
    side: THREE.DoubleSide, map: texture, bumpMap: texture, bumpScale: .031,
  }));
  const lichen = [];
  const olive = color('#9c9f65');
  const mossPatches = [
    [-1.45,-.54,.24],[-1.71,-.58,.31],[-1.95,-.72,.4],[-2.21,-.82,.62],[-2.42,-.88,.5],
    [.92,-.07,-.25],[1.03,-.03,-.24],[1.28,.23,-.33],[2.48,.88,-.63],[-2.99,-.66,1.8],
  ];
  for (const [x, y, z] of mossPatches) {
    for (let i = 0; i < 19; i++) {
      const dot = new THREE.IcosahedronGeometry(range(.009, .042), 0);
      dot.scale(range(.65, 1.9), range(.22, .68), range(.45, 1.65));
      dot.translate(x + range(-.15, .15), y + range(-.047, .036), z + range(-.11, .11));
      const tint = olive.clone().lerp(color('#4b5940'), range(.12, .8));
      lichen.push(paint(dot, () => tint));
    }
  }
  batch(parent, lichen, strawMaterial);
  return branches;
}

function buildNest(parent) {
  const profile = [
    [.025, -.57], [.37, -.57], [.66, -.52], [.87, -.41], [1.07, -.24],
    [1.22, -.03], [1.31, .18], [1.3, .29], [1.20, .32], [1.11, .19],
    [.98, .02], [.84, -.14], [.63, -.24], [.33, -.285], [.015, -.29],
  ];
  const dark = color('#493125');
  const honey = color('#95714d');
  const cup = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 96);
  const positions = cup.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const a = Math.atan2(z, x);
    const irregularity = 1 + .039 * Math.sin(a * 3 + .6) + .028 * Math.cos(a * 5);
    positions.setXYZ(i, x * irregularity, y + .033 * Math.sin(a * 3 - .9), z * irregularity * .91);
  }
  cup.computeVertexNormals();
  const nest = mesh(parent, paint(cup, (p) => {
    const warmth = clamp((p.y + .24) * 1.06 + .17 + Math.sin(p.x * 27 + p.z * 17) * .04, 0, .77);
    return dark.clone().lerp(honey, warmth).multiplyScalar(canopyLight(p));
  }), strawMaterial);

  const twigs = [];
  const grasses = [];
  const twigPalette = ['#684b38','#77573f','#8d694c','#aa835a','#543e31','#795841','#927451'].map(color);
  const grassPalette = ['#b08b60','#c19b68','#c7a777','#ad784a','#e1bb83','#a79763','#77543a'].map(color);

  for (let i = 0; i < 480; i++) {
    const layer = Math.pow(random(), .61);
    const y = mix(-.52, .32, layer);
    const broad = 1.31 * Math.pow(layer, .51) + .05;
    const start = range(0, TAU);
    const span = range(.24, 1.83);
    const sideways = range(-.14, .14);
    const drift = range(-.32, .28);
    const radius = range(.006, .025) * (i % 7 === 0 ? 1.28 : 1);
    const offset = range(-.08, .08);
    const points = Array.from({ length: 9 }, (_, step) => {
      const t = step / 8;
      const a = start + span * t;
      const f = 1 + .039 * Math.sin(a * 3 + .6) + .028 * Math.cos(a * 5);
      const out = broad * f + offset + Math.sin(t * 7 + i) * sideways * .4 + drift * (t - .5) * .2;
      return v(Math.cos(a) * out, y + drift * (t - .5) + .048 * Math.sin(t * 8 + i) + .031 * Math.sin(a * 3 - .9),
        Math.sin(a) * out * .92);
    });
    const tint = twigPalette[i % twigPalette.length].clone().multiplyScalar(range(.83, 1.12) * canopyLight(points[4]));
    fiber(twigs, points, radius, tint, 14, 5);
  }

  const lining = profile.slice(8).reverse();
  function liningHeight(radius) {
    const i = lining.findIndex(([r]) => r >= radius);
    if (i <= 0) return i === 0 ? lining[0][1] : lining.at(-1)[1];
    const [a, low] = lining[i - 1];
    const [b, high] = lining[i];
    return mix(low, high, (radius - a) / (b - a));
  }

  for (let i = 0; i < 295; i++) {
    const a = range(0, TAU);
    const r = Math.sqrt(random()) * 1.235;
    const span = range(.25, 1.52) * (i % 3 ? 1 : -1);
    const lean = range(-.29, .29);
    const points = Array.from({ length: 8 }, (_, step) => {
      const t = step / 7;
      const b = a + span * t;
      const nominal = clamp(r + lean * t + .039 * Math.sin(t * 12 + i), .05, 1.23);
      const out = nominal * (1 + .039 * Math.sin(b * 3 + .6) + .028 * Math.cos(b * 5));
      const y = liningHeight(nominal) + .033 * Math.sin(b * 3 - .9) + .019 * Math.sin(t * 5 + i);
      return v(Math.cos(b) * out, y + range(.01, .046), .91 * Math.sin(b) * out);
    });
    fiber(grasses, points, range(.003, .008), grassPalette[i % grassPalette.length], 12, 4);
  }

  for (let i = 0; i < 108; i++) {
    const a = range(0, TAU);
    const r = range(.93, 1.31);
    const span = range(.16, .57);
    const trail = range(.05, .24);
    const y = range(.05, .34);
    const points = Array.from({ length: 6 }, (_, j) => {
      const t = j / 5;
      const b = a + t * span;
      const out = r + trail * t;
      return v(Math.cos(b) * out, y + (t * .14 - t * t * range(.16, .42)), .93 * Math.sin(b) * out);
    });
    fiber(grasses, points, range(.004, .013), grassPalette[i % grassPalette.length], 9, 4);
  }

  batch(parent, twigs, strawMaterial);
  batch(parent, grasses, strawMaterial);
  return nest;
}

function leafGeometry(start, direction, length, width, angle, tint) {
  const forward = direction.clone().normalize();
  const sideways = v(0, 1, 0).cross(forward).normalize().applyAxisAngle(forward, angle);
  const up = forward.clone().cross(sideways).normalize();

  function point(u, t) {
    const across = u * 2 - 1;
    const outline = Math.pow(Math.sin(Math.PI * t), .94) * (1.12 - .37 * t);
    const serration = 1 - .056 * Math.abs(Math.sin(t * 19 * Math.PI));
    return start.clone().addScaledVector(forward, length * t)
      .addScaledVector(sideways, width * across * outline * serration)
      .addScaledVector(up, length * (.16 * Math.sin(t * Math.PI * .95) - .11 * t * t) -
        width * Math.abs(across) * outline * .42);
  }

  const verge = color('#3a6740');
  const tipTint = color('#c0cd78');
  const geometry = paint(grid(18, 6, point), (_, i) => {
    const lateral = Math.abs((i % 7) / 3 - 1);
    const t = Math.floor(i / 7) / 18;
    return tint.clone().lerp(verge, lateral * .37).lerp(tipTint, .18 * t + (lateral < .08 ? .13 : 0));
  });
  return { geometry, point, up };
}

function buildFoliage(parent) {
  const clusters = [];
  const shades = ['#597d3e','#6a8b49','#80a453','#376342','#9cab5a','#507645','#75a053','#6e8947'].map(color);
  const layouts = [
    { at:[3.35,2.66,-1.21], way:[.1,.37,-.9], count:8, size:.64 },
    { at:[3.24,2.13,-1.08], way:[.66,.65,-.16], count:9, size:.71 },
    { at:[2.82,2.73,-1.23], way:[-.65,.42,-.15], count:7, size:.59 },
    { at:[3.62,3.08,-1.44], way:[.75,.36,-.29], count:11, size:.83 },
    { at:[4.43,1.79,-1.1], way:[.9,.54,.03], count:12, size:.76 },
    { at:[3.87,1.13,-.39], way:[.84,.05,.4], count:8, size:.65 },
    { at:[4.58,.82,-1.75], way:[.99,.17,.07], count:7, size:.61 },
    { at:[-2.56,2.18,-2.58], way:[-.27,.78,.22], count:10, size:.75 },
    { at:[-2.93,2.96,-2.82], way:[-.77,.55,.14], count:11, size:.78 },
    { at:[-1.23,3.05,-2.9], way:[.96,.23,.19], count:10, size:.65 },
    { at:[-2.55,.91,-2.34], way:[-.9,.35,.1], count:10, size:.68 },
    { at:[-3.63,1.66,-2.75], way:[-.88,.23,.3], count:8, size:.75 },
    { at:[-3.04,-.52,1.77], way:[-.12,.85,.43], count:7, size:.77 },
    { at:[-3.59,.35,2.02], way:[-.93,.2,.25], count:9, size:.83 },
    { at:[-.58,1.55,-3.15], way:[.41,.85,-.17], count:8, size:.74 },
    { at:[-2.92,-1.7,.63], way:[-.48,.11,.91], count:6, size:.60 },
    { at:[2.45,-.39,-.93], way:[.76,-.18,.45], count:7, size:.61 },
    ...trunkLimbs.map(({ points, leaves }) => {
      const at = points.at(-1);
      const previous = points.at(-2);
      return { at, way: at.map((coordinate, i) => coordinate - previous[i]), count: 8, size: leaves };
    }),
  ];

  for (const { at, way, count, size } of layouts) {
    const group = new THREE.Group();
    group.position.set(...at);
    parent.add(group);
    clusters.push(group);
    const foliage = [];
    const stems = [];
    const twig = color('#777448');
    const vein = color('#aab677');
    const direction = v(...way).normalize();
    const side = v(0, 1, 0).cross(direction).normalize();
    const end = direction.clone().multiplyScalar(size * 1.65);
    fiber(stems, [v(0,0,0),end.clone().multiplyScalar(.46).add(v(0,-.03,0)),end], .013, twig, 17, 5);

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = (i % 2 ? 1 : -1) * range(.42, 1.31);
      const turn = side.clone().applyAxisAngle(direction, range(-1.15, 1.15));
      const stemStart = end.clone().multiplyScalar(t);
      const leafDirection = direction.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(turn, Math.sin(angle)).add(v(0, range(-.24, .4), 0)).normalize();
      const start = stemStart.clone().addScaledVector(leafDirection, range(.04, .16));
      const length = range(.66, 1.32) * size * (1 - .32 * t);
      const width = length * range(.22, .37);
      const { geometry, point, up } = leafGeometry(start, leafDirection, length, width, range(-.61, .69),
        shades[Math.floor(random() * shades.length)]);
      foliage.push(geometry);
      fiber(stems, [stemStart, start, point(.5, .24).addScaledVector(up, .004), point(.5, .65).addScaledVector(up, .006)],
        length * .005, vein.clone().multiplyScalar(range(.72, 1)), 12, 4);
      if (i % 4 === 0) {
        for (const t of [.28, .49, .67]) {
          for (const side of [.13, .87]) {
            fiber(stems, [point(.5, t), point(mix(.5, side, .46), t + .09), point(side, t + .16)]
              .map((p) => p.addScaledVector(up, .003)), length * .0023, vein.clone().multiplyScalar(.83), 5, 3);
          }
        }
      }
    }

    const buds = ['#a89367', '#bfaa75', '#879252'].map(color);
    for (let i = 0; i < 2; i++) {
      const bud = new THREE.SphereGeometry(1, 10, 7);
      bud.scale(.037, .093, .035);
      const align = new THREE.Quaternion().setFromUnitVectors(v(0,1,0), direction);
      bud.applyQuaternion(align);
      const p = end.clone().multiplyScalar(1 - i * .19).addScaledVector(side, i * .072);
      bud.translate(p.x, p.y, p.z);
      foliage.push(paint(bud, (_, j) => buds[j % 9 ? i : 2]));
    }

    batch(group, foliage, leafMaterial);
    batch(group, stems, strawMaterial);
  }
  return clusters;
}

export function habitat(parent) {
  const branches = buildTree(parent);
  const nest = buildNest(parent);
  buildForestFloor(parent, trunkBase);
  return { clusters: buildFoliage(parent), occluders: [branches, nest] };
}

export function paintCanopy(canvas, width, height) {
  const scale = Math.min(1, 1300 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) return;

  const rng = randomFrom(24181);
  const background = context.createLinearGradient(0, 0, w * .14, h);
  background.addColorStop(0, '#6b7b54');
  background.addColorStop(.46, '#425941');
  background.addColorStop(1, '#203c30');
  context.fillStyle = background;
  context.fillRect(0, 0, w, h);

  const lighting = context.createRadialGradient(w * .74, h * .21, 0, w * .74, h * .21, w * .78);
  lighting.addColorStop(0, '#ede1a8b0');
  lighting.addColorStop(.22, '#d4c38879');
  lighting.addColorStop(.63, '#9f9f590a');
  lighting.addColorStop(1, '#192e2750');
  context.fillStyle = lighting;
  context.fillRect(0, 0, w, h);

  const base = Math.min(w, h);
  const spots = ['6f865d', '859059', 'c0c389', 'efdc9f', '577951', '6f906d', '9dad78'];
  for (let i = 0; i < 260; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const radius = (rng() ** 2 * .1 + .012) * base;
    const tint = spots[Math.floor(rng() * spots.length)];
    const bright = y < h * .58 && x > w * .33;
    const spot = context.createRadialGradient(x, y, radius * .09, x, y, radius);
    spot.addColorStop(0, '#' + tint + (bright ? '7b' : '3c'));
    spot.addColorStop(.7, '#' + tint + (bright ? '2b' : '14'));
    spot.addColorStop(1, '#' + tint + '00');
    context.fillStyle = spot;
    context.fillRect(x-radius, y-radius, 2*radius, 2*radius);
  }
}
