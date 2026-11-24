import * as THREE from './vendor/three.module.min.js';
import { batch, clamp, color, fiber, grid, mesh, mix, paint, painted, randomFrom, TAU, tube, v } from './geometry.js';

const mat = (tint, roughness = .85) => new THREE.MeshStandardMaterial({ color: tint, roughness });
const plumage = painted({ roughness: .91 });
const vaneMaterial = painted({ side: THREE.DoubleSide });
const ivory = mat('#d1b9a2');
const graphite = mat('#332824');
const pupil = mat('#100d0b', .24);
const glint = new THREE.MeshBasicMaterial({ color: '#f9ecd0' });
const footMaterial = mat('#7c6152');
const billLight = mat('#d6a13e', .67);
const billDark = mat('#a7772e');

function oval(parent, at, size, material, tint, slices = 32, rings = 20) {
  let geometry = new THREE.SphereGeometry(1, slices, rings);
  if (tint) geometry = paint(geometry, tint);
  geometry.scale(...size);
  return mesh(parent, geometry, material, v(...at));
}

function blush(base, accent, amount) {
  return base.clone().lerp(accent, clamp(amount, 0, 1));
}

function streak(p, scale) {
  return Math.sin(Math.atan2(p.z, p.x) * scale + Math.sin(p.y * 38) * 1.5) *
    Math.sin(p.y * 63 + Math.cos(p.x * 41)) * .042;
}

function feather(start, end, halfWidth, liftSign, tint) {
  const origin = v(...start);
  const direction = v(...end).sub(origin);
  const side = v(-direction.y, direction.x, 0).normalize();
  const shape = grid(15, 8, (u, t) => {
    const width = Math.pow(Math.sin(Math.PI * t), .58) * (1.3 - t * .63) * halfWidth;
    return origin.clone().addScaledVector(direction, t).addScaledVector(side, (2 * u - 1) * width)
      .add(v(0, 0, liftSign * Math.sin(Math.PI * t) * (.036 + .054 * Math.sin(Math.PI * u))));
  });
  return paint(shape, (_, i) => {
    const across = Math.abs((i % 9) / 4 - 1);
    const t = Math.floor(i / 9) / 15;
    return tint.clone().multiplyScalar(1.10 - across * .22 + (across > .85 ? .14 : 0) - t * .11 +
      (i % 9 === 4 ? .11 : 0));
  });
}

function adultBill(parent, upper) {
  const start = -.229;
  const geometry = grid(19, 22, (u, t) => {
    const a = TAU * u;
    const radius = Math.pow(1 - t, .76);
    const y = -.061 - .033 * t - .027 * t ** 3;
    return v(start - t * .366, y + (upper ? 1 : -1) * (.008 + .044 * radius) +
      Math.cos(a) * radius * (upper ? .044 : .029), Math.sin(-a) * .074 * radius);
  });
  materialSide(geometry);
  mesh(parent, geometry, upper ? billLight : billDark);
}

function materialSide(geometry) {
  const indices = geometry.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  geometry.computeVertexNormals();
}

export function makeAdult(parent) {
  const bird = new THREE.Group();
  bird.position.set(1.89, .73, -.53);
  bird.rotation.y = .40;
  parent.add(bird);
  const body = new THREE.Group();
  bird.add(body);

  const gray = color('#514a45');
  const slate = color('#403c3a');
  const rust = color('#ac4e2a');
  const flame = color('#c27142');
  const sand = color('#a99680');
  const pale = color('#c4b5a2');
  oval(body, [-.025,.695,0], [.482,.584,.348], plumage, (p) => {
    const front = clamp((.43 - p.x - Math.abs(p.z) * .20 - Math.max(p.y - .29, 0) * .66) * 2.42, 0, 1);
    const edge = clamp((p.y + .79) * 3.34, 0, 1);
    const breast = blush(rust, flame, .54 + p.y * .34 + p.z * .12);
    const ground = blush(gray, sand, Math.max(0, -p.y - .2) * .68);
    return ground.lerp(breast, front * edge).lerp(pale, front * (1 - edge) * .45)
      .multiplyScalar(1 + streak(p, 46));
  }, 72, 45).rotation.z = -.37;
  oval(body, [-.186,.967,0], [.302,.345,.274], plumage, (p) => {
    const throat = clamp((-.1 - p.x) * 1.85, 0, 1);
    return blush(gray, rust, throat * (1 - clamp((p.y + .25) * 2.35, 0, 1)))
      .lerp(pale, (Math.sin(p.z * 42) * .5 + .5) * throat * Math.max(0, p.y + .03) * .55)
      .multiplyScalar(1 + streak(p, 34));
  }, 42, 30).rotation.z = -.39;

  const feathers = [];
  for (let i = 0; i < 7; i++) {
    const mid = (i - 3) / 3;
    const a = [.38, .63 + Math.abs(mid) * .055, mid * .105];
    const b = [1.15 - .12 * Math.abs(mid), .43 + mid * .046, mid * .188 - .035];
    feathers.push(feather(a, b, .075, 1, blush(slate, sand, .12 + Math.abs(mid) * .14)));
  }
  for (const side of [-1, 1]) {
    oval(body, [.236,.78,side * .248], [.485,.262,.117], plumage, (p) =>
      blush(slate, sand, .21 + streak(p, 26) + Math.max(p.y, 0) * .09), 37, 25)
      .rotation.z = -.51;
    const tip = (x, y, z) => [x, y, side * z];
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      feathers.push(feather(
        tip(mix(.04,.46,t),mix(.96,.64,t),mix(.315,.317,t)),
        tip(mix(.73,.97,t),mix(.67,.47,t),mix(.218,.143,t)),
        mix(.078,.055,t), side, blush(slate, sand, .17 + (i % 3) * .046)
      ));
    }
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      feathers.push(feather(
        tip(mix(-.051,.47,t),mix(.978,.82,t),mix(.306,.289,t)),
        tip(mix(.26,.68,t),mix(.77,.61,t),mix(.335,.24,t)),
        .067, side, blush(slate, sand, .20 + (i % 4) * .037)
      ));
    }
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      feathers.push(feather(
        tip(mix(-.06,.35,t),mix(.977,.963,t),mix(.277,.268,t)),
        tip(mix(.156,.54,t),mix(.88,.745,t),mix(.32,.29,t)),
        .064, side, blush(slate, sand, .27 + (i % 3) * .045)
      ));
    }

    const z = side * .146;
    const x = side * .09;
    mesh(bird, tube([v(x,.31,z),v(x-.031,.16,z+.009),v(x-.078,.032,z+.005)], .022, 12, 8), footMaterial);
    for (let toe = -1; toe <= 1; toe++) {
      mesh(bird, tube([v(x-.079,.036,z),v(x-.162,.03,z+toe*.047),v(x-.215,-.026,z+toe*.079),
        v(x-.209,-.07,z+toe*.085)], .0125, 9, 6), footMaterial);
    }
    mesh(bird, tube([v(x-.067,.03,z),v(x+.015,.033,z-.008),v(x+.051,-.039,z-.027)], .013, 10, 6), footMaterial);
  }
  batch(body, feathers, vaneMaterial);

  const head = new THREE.Group();
  head.position.set(-.32, 1.186, 0);
  body.add(head);
  const soot = color('#373436');
  oval(head, [0,0,0], [.311,.248,.255], plumage, (p) => {
    const throat = clamp((-p.y - .38) * 2.7, 0, 1) * clamp((.57 - p.x) * 1.7, 0, 1);
    const mottled = .35 + Math.sin(p.z * 32 + Math.cos(p.x * 21) * 2) * .30;
    return soot.clone().lerp(gray, .12 + Math.max(p.x, 0) * .5)
      .lerp(pale, throat * mottled).multiplyScalar(1 + streak(p, 38) * 1.55);
  }, 60, 36);
  adultBill(head, true);
  adultBill(head, false);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(-.122,.038,side*.228);
    eye.rotation.y = side * -.29;
    head.add(eye);
    oval(eye, [0,0,0], [.055,.051,.022], graphite);
    const eyeball = new THREE.Group();
    eye.add(eyeball);
    oval(eyeball, [0,0,side*.012], [.041,.038,.021], pupil);
    oval(eyeball, [-.013,.014,side*.032], [.010,.009,.004], glint);
    eyes.push(eyeball);

    for (const [start, end] of [[.24, 2.49], [3.55, 5.58]]) {
      const arc = Array.from({length: 11}, (_, i) => {
        const a = mix(start,end,i/10);
        return v(.055 * Math.cos(a), .048 * Math.sin(a), side * .014);
      });
      mesh(eye, tube(arc, .0043, 16, 5), ivory);
    }
    oval(head, [-.349,-.043,side*.050], [.017,.007,.003], mat('#8d642e'), undefined, 12, 8);
  }

  return { body, head, eyes };
}

const shellMaterial = painted({ roughness: .54 });
const insideMaterial = painted({ roughness: .85, side: THREE.BackSide });
const lipMaterial = mat('#a1c3ca');
const crackMaterial = mat('#3b5360');
const shadowTexture = makeShadowTexture();

function makeShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32,32,0,32,32,30);
  gradient.addColorStop(0, '#211a16bd');
  gradient.addColorStop(.49, '#211a1676');
  gradient.addColorStop(1, '#211a1600');
  context.fillStyle = gradient;
  context.fillRect(0,0,64,64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const openingAngle = -1.19;
const openingCos = Math.cos(openingAngle);
const openingSin = Math.sin(openingAngle);

function eggPoint(a, theta, growth = 1) {
  const x = Math.cos(a) * Math.sin(theta);
  const y = Math.cos(theta);
  const z = -Math.sin(a) * Math.sin(theta);
  // Aim the hatching surface up and toward the tapered tip of the resting egg.
  const length = openingCos * y - openingSin * z;
  const side = openingSin * y + openingCos * z;
  const broad = 1 - .23 * length;
  return v(x * .337 * broad * growth, length * .435 * growth, side * .310 * broad * growth);
}

function edgeAt(a) {
  return .83 + .049 * Math.sin(4 * a + .4) + .054 * Math.cos(7 * a - .32) + .018 * Math.sin(13 * a);
}

function shellGeometry(section, scale, variant) {
  const blue = color(variant === 1 ? '#58aed1' : variant === 2 ? '#60b8d4' : '#70bfdb');
  const depth = color('#327b9b');
  const light = color('#a5d9e2');
  const geometry = grid(40, 96, (u, t) => {
    const a = TAU * u;
    const edge = edgeAt(a);
    const theta = section === 'cap' ? edge * t : section === 'open' ? mix(edge, Math.PI, t) : Math.PI * t;
    return eggPoint(a, theta, scale);
  });
  return paint(geometry, (p) => {
    const fleck = Math.sin(p.x * 153 + Math.sin(p.z * 302)) * Math.cos(p.y * 192);
    const height = -p.z;
    return blush(blue, depth, clamp((.10 - height) * 1.17, 0, .52))
      .lerp(light, Math.max(0, height) * .27).multiplyScalar(1 + fleck * .024);
  });
}

function shadeUnder(parent, x, z, level) {
  const shadow = mesh(parent, new THREE.PlaneGeometry(.94, .85), new THREE.MeshBasicMaterial({
    map: shadowTexture, transparent: true, depthWrite: false, opacity: .69, polygonOffset: true,
    polygonOffsetFactor: -3,
  }), v(x, level, z));
  shadow.rotation.x = -Math.PI / 2;
}

function addCracks(parent) {
  const paths = [
    [[-1.66,.17],[-1.37,.26],[-1.65,.38],[-1.43,.48],[-1.69,.57],[-1.49,.69],[-1.62,.84]],
    [[-1.65,.38],[-2.03,.43],[-2.11,.55],[-2.38,.64]],
    [[-1.69,.57],[-.99,.54],[-.72,.71],[-.52,.68]],
  ];
  return paths.map((path, n) => path.slice(1).map((point, i) => {
    const previous = path[i];
    const a = eggPoint(...previous, 1.012);
    const b = eggPoint(...point, 1.012);
    const midpoint = eggPoint(mix(previous[0],point[0],.5), mix(previous[1],point[1],.5), 1.015);
    const section = mesh(parent, tube([a,midpoint,b], n === 0 ? .0075 : .0049, 6, 5), crackMaterial);
    return section;
  }));
}

function makeChick(parent) {
  const chick = new THREE.Group();
  parent.add(chick);
  const skin = color('#d8947d');
  const coral = color('#b86760');
  const peach = color('#e4aa8c');

  const body = new THREE.Group();
  body.name = 'Chick body';
  chick.add(body);
  oval(body, [0,-.181,-.065], [.150,.173,.144], plumage, (p) =>
    blush(skin, coral, .34 - p.y * .18 - p.z * .19)
      .lerp(peach, Math.max(0,p.z) * .40));
  for (const side of [-1, 1]) {
    const wing = oval(body, [side*.103,-.158,-.075], [.052,.097,.080], plumage, (p) =>
      blush(skin, coral, .27 + .23 * Math.max(0,-p.y)), 28, 18);
    wing.rotation.z = side * .24;
  }

  const chickHead = new THREE.Group();
  chickHead.name = 'Chick head';
  chick.add(chickHead);
  oval(chickHead, [0,-.085,-.033], [.105,.123,.105], plumage, (p) =>
    blush(skin,coral,(-p.y + .3) * .49));
  oval(chickHead, [0,.028,.021], [.157,.146,.146], plumage, (p) =>
    blush(skin, peach, (p.y + 1) * .32).lerp(coral, clamp(p.z - .15, 0, .5) * .35), 45, 26);

  const gape = mat('#edb579');
  const tip = mat('#d58e6c');
  const lip = mat('#914b45');
  oval(chickHead, [0,-.019,.145], [.103,.028,.069], gape);
  oval(chickHead, [0,-.019,.182], [.078,.008,.084], lip);
  oval(chickHead, [0,-.005,.177], [.077,.024,.092], tip).rotation.x = .16;
  oval(chickHead, [0,-.032,.167], [.065,.012,.080], gape).rotation.x = -.13;
  const lid = mat('#895151');
  for (const side of [-1, 1]) {
    const eye = oval(chickHead, [side*.107,.049,.111], [.047,.025,.017], mat('#c58177'));
    eye.rotation.y = side * .58;
    mesh(chickHead, tube([v(side*.077,.049,.132),v(side*.103,.043,.132),v(side*.126,.046,.109),
      v(side*.137,.054,.092)], .0039, 10, 5), lid);
  }

  const fluff = [];
  const rng = randomFrom(240624);
  const down = [color('#ecddba'),color('#cdb295'),color('#ddc6a8')];
  for (let i = 0; i < 72; i++) {
    const a = rng() * TAU;
    const out = rng() * .14;
    const base = v(Math.cos(a) * out, .03 + Math.sqrt(.141 ** 2 - out ** 2), .02 + Math.sin(a) * out);
    const length = .016 + rng() * .056;
    const mid = base.clone().add(v((rng() - .5) * .024, length * .62, -.007));
    const end = mid.clone().add(v((rng() - .5) * .039, length * .41, -.012 - rng() * .03));
    fiber(fluff,[base,mid,end],.0016 + rng() * .0010,down[i % down.length],6,3);
  }
  batch(chickHead, fluff, plumage);
  return { chick, chickHead };
}

export function makeEggs(parent) {
  const placements = [
    { x: -.51, y: .080, z: -.22, heading: -1.04 },
    { x: .55, y: .089, z: -.24, heading: .72 },
    { x: .02, y: .087, z: .49, heading: -.73 },
  ];
  const eggs = placements.map(({ x, y, z, heading }, i) => {
    shadeUnder(parent, x, z, i === 2 ? -.206 : -.223);
    const pivot = new THREE.Group();
    pivot.position.set(x,y,z);
    const axis = new THREE.Group();
    axis.rotation.set(Math.PI / 2, heading, 0, 'YXZ');
    pivot.add(axis);
    parent.add(pivot);
    const intact = mesh(axis, shellGeometry('whole', 1, i), shellMaterial);
    return { pivot, axis, intact };
  });

  const front = eggs[2];
  const { axis } = front;
  const lower = mesh(axis, shellGeometry('open', 1, 2), shellMaterial);
  const lining = mesh(axis, shellGeometry('open', .951, 0), insideMaterial);
  const rim = Array.from({ length: 141 }, (_, i) => {
    const a = i * TAU / 140;
    return eggPoint(a,edgeAt(a),.983);
  });
  const edge = mesh(axis, tube(rim,.008,140,5), lipMaterial);

  // This frame inherits the egg's heading while keeping the chick upright.
  const opening = new THREE.Group();
  opening.rotation.x = -Math.PI / 2;
  axis.add(opening);
  const hingeAngle = -Math.PI / 2;
  const hinge = eggPoint(hingeAngle, edgeAt(hingeAngle)).applyAxisAngle(v(1, 0, 0), Math.PI / 2);
  const chip = new THREE.Group();
  opening.add(chip);
  const lid = mesh(chip, shellGeometry('cap', 1, 2), shellMaterial);
  const lidInside = mesh(chip, shellGeometry('cap', .957, 0), insideMaterial);
  const lidEdge = mesh(chip, tube(rim,.007,140,5), lipMaterial);
  for (const part of [lid,lidInside,lidEdge]) {
    part.rotation.x = Math.PI / 2;
    part.position.copy(hinge).negate();
  }
  const { chick, chickHead } = makeChick(opening);
  const cracks = addCracks(axis);

  return { ...front, eggs, lower, lining, edge, opening, hinge, chip, chick, chickHead, cracks };
}
