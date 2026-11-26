import * as THREE from 'three';

function randomFor(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const sandstoneSurface = /* glsl */ `
  varying vec3 vTerrainPoint;
  uniform float dust;
  float rockHash(vec3 p) {
    p = fract(p * .3183099 + vec3(.17, .37, .71));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float rockNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(rockHash(i), rockHash(i+vec3(1,0,0)), f.x),
                   mix(rockHash(i+vec3(0,1,0)), rockHash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(rockHash(i+vec3(0,0,1)), rockHash(i+vec3(1,0,1)), f.x),
                   mix(rockHash(i+vec3(0,1,1)), rockHash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

function sandstone(color, dust = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .96 });
  material.customProgramCacheKey = () => 'desert-sandstone';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.dust = { value: dust };
    shader.vertexShader = 'varying vec3 vTerrainPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vTerrainPoint = (modelMatrix * vec4(position, 1.0)).xyz;
    `);
    shader.fragmentShader = sandstoneSurface + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 p = vTerrainPoint;
      float broad = rockNoise(p * vec3(.77, .51, .77));
      float wear = rockNoise(p * vec3(4.4, .87, 4.4));
      float grain = rockNoise(p * 62.0);
      float chips = rockNoise(p * 13.3);
      float layerHeight = p.y + .20 * rockNoise(p * vec3(.59, .9, .59)) + .035 * p.x;
      float redBand = rockNoise(vec3(layerHeight * 3.7, 2.17, 8.31));
      float seam = smoothstep(.91, .985, sin(layerHeight * 17.0 + broad * 1.5)) * (.25 + .75 * wear);
      float thinLayer = sin(layerHeight * 39.0 + 3.0 * chips) * .033;
      vec3 column = p * vec3(1.85, .32, 1.85);
      column.xz += vec2(broad, rockNoise(p * .9 + 13.0)) * .57;
      float split = abs(rockNoise(column) - .49);
      float fissure = (1.0 - smoothstep(.009, .037, split)) * smoothstep(.37, .72, wear) * .61;
      float hardpan = rockNoise(p * vec3(3.7, .8, 3.7)) * .11 + grain * .20 + chips * .18;
      float rock = .70 + .23 * broad + .19 * wear + .14 * chips + .11 * grain
                   + .25 * redBand - .18 * seam - fissure + thinLayer;
      diffuseColor.rgb *= mix(rock, .78 + hardpan, dust);
      diffuseColor.rgb *= mix(vec3(.87, .79, .74), vec3(1.16, 1.03, .89),
                              mix(redBand * .65 + broad * .35, broad, dust));
    `);
  };
  return material;
}

function rockMesh(profile, material, seed, squareness = .88, segments = 40) {
  const random = randomFor(seed);
  const phase = Array.from({length: 9}, () => random() * Math.PI * 2);
  const vertices = [];
  const indices = [];
  const rows = [];

  for (let row = 0; row < profile.length - 1; row++) {
    const low = profile[row];
    const high = profile[row + 1];
    const steps = Math.max(1, Math.ceil((high[0] - low[0]) / .20));
    for (let step = 0; step < steps; step++) {
      rows.push(low.map((value, i) => THREE.MathUtils.lerp(value, high[i], step / steps)));
    }
  }
  rows.push(profile.at(-1));

  for (const [y, x, z, width, depth] of rows) {
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const outline = 1 + .073 * Math.sin(3 * angle + phase[0])
                        + .084 * Math.sin(5 * angle + phase[1])
                        + .055 * Math.cos(9 * angle + phase[2])
                        + .031 * Math.sin(13 * angle + phase[3]);
      const erosion = .040 * Math.sin(5 * angle + phase[4] + y * 1.13)
                    + .021 * Math.sin(11 * angle + phase[5] + y * 4.1)
                    + .015 * Math.sin(17 * angle - y * 2.8 + phase[8]);
      const radius = outline + erosion;
      const height = Math.min(width, depth, 1) *
        (.065 * Math.sin(3 * angle + phase[6] + y * .22) +
         .043 * Math.sin(7 * angle + phase[7] + y * .6));
      vertices.push(x + width * Math.sign(c) * Math.pow(Math.abs(c), squareness) * radius,
                    y + height,
                    z + depth * Math.sign(s) * Math.pow(Math.abs(s), squareness) * radius);
    }
  }

  for (let row = 0; row < rows.length - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const low = row * segments;
      const high = low + segments;
      indices.push(low + i, high + i, low + next, low + next, high + i, high + next);
    }
  }

  for (const [row, top] of [[0, false], [rows.length - 1, true]]) {
    const offset = row * segments;
    const [y, x, z] = rows[row];
    const center = vertices.length / 3;
    vertices.push(x, y + (top ? .055 : -.005), z);
    for (let i = 0; i < segments; i++) {
      const current = offset + i;
      const next = offset + (i + 1) % segments;
      if (top) indices.push(center, next, current);
      else indices.push(center, current, next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addFormation(scene) {
  const rock = sandstone('#bc6943');
  const copper = sandstone('#bf7148');
  const light = sandstone('#cb8153');
  const umber = sandstone('#a65b39');

  // Each horizontal section gives height, center X and Z, and half-width and depth.
  const profiles = [
    [rock, 25, .67, [
      [-.42, -.26, .12, 7.23, 3.61], [.37, -.23, .15, 6.98, 3.53],
      [1.0, -.11, .08, 6.59, 3.11], [1.8, .22, -.09, 6.37, 2.78],
      [2.75, .52, -.39, 5.85, 2.5], [3.58, .8, -.54, 4.62, 2.2],
      [4.45, .52, -.85, 3.66, 1.92], [5.23, .25, -.84, 2.64, 1.61],
      [5.89, .42, -1.08, 1.93, 1.46], [6.22, .44, -1.25, 1.22, 1.26]
    ]],
    [light, 81, .79, [
      [-.33, -4.59, .24, 2.25, 2.48], [.54, -4.42, .23, 2.04, 2.35],
      [1.91, -4.03, .17, 1.86, 2.08], [3.12, -3.89, .10, 1.72, 1.93],
      [4.78, -3.56, .04, 1.54, 1.66], [5.72, -3.62, .04, 1.52, 1.52],
      [6.40, -3.47, .02, 1.56, 1.43], [7.43, -3.3, -.05, 1.56, 1.38],
      [8.34, -3.36, -.05, 1.47, 1.25], [8.63, -3.55, -.10, 1.15, 1.1],
      [8.74, -3.31, -.11, .72, .80]
    ]],
    [copper, 167, .84, [
      [-.28, -2.75, -.52, 1.78, 1.95], [1.07, -2.46, -.54, 1.67, 1.82],
      [3, -2.3, -.52, 1.42, 1.65], [4.76, -2.28, -.44, 1.24, 1.57],
      [6.48, -2.25, -.43, 1.05, 1.40], [7.68, -2.32, -.35, .91, 1.12],
      [8.38, -2.45, -.23, .73, .87], [8.99, -2.53, -.17, .49, .65],
      [9.27, -2.54, -.17, .39, .5], [9.46, -2.53, -.15, .37, .48]
    ]],
    [copper, 37, .84, [
      [9.28, -2.56, -.18, .40, .49], [9.44, -2.50, -.17, .51, .60],
      [9.74, -2.58, -.19, .56, .66], [10.04, -2.70, -.20, .57, .65],
      [10.29, -2.81, -.22, .53, .55], [10.49, -2.88, -.19, .40, .41],
      [10.56, -2.94, -.21, .21, .24]
    ]],
    [rock, 97, .73, [
      [-.23, .39, -.18, 2.08, 2.41], [1.15, .40, -.24, 1.99, 2.29],
      [2.72, .36, -.39, 1.77, 2.00], [4.2, .32, -.48, 1.58, 1.81],
      [5.32, .18, -.43, 1.28, 1.64], [6.05, .27, -.42, 1.04, 1.48],
      [6.77, .33, -.43, .94, 1.30], [7.75, .34, -.39, .94, 1.25],
      [8.34, .30, -.32, .83, 1.17], [8.75, .42, -.27, .75, 1.0],
      [9.02, .42, -.26, .71, .88], [9.37, .39, -.21, .78, .89]
    ]],
    [light, 34, .48, [
      [9.13, .38, -.27, .73, .90], [9.35, .39, -.24, .87, 1.02],
      [9.55, .40, -.23, .93, 1.02], [9.94, .43, -.22, .95, 1.01],
      [10.14, .51, -.23, .92, .98], [10.25, .60, -.24, .81, .86],
      [10.28, .59, -.24, .53, .60]
    ]],
    [umber, 106, .67, [
      [-.28, 2.28, -.04, 1.68, 2.38], [1.14, 2.26, .08, 1.4, 2.22],
      [2.87, 2.08, .13, 1.24, 2.15], [4.08, 1.94, .10, 1.0, 1.76],
      [5.57, 1.92, .02, .93, 1.48], [6.66, 1.92, .0, .80, 1.28],
      [7.6, 1.99, -.09, .73, 1.20], [8.25, 1.96, -.11, .75, 1.07],
      [8.62, 1.93, -.13, .64, .91], [8.71, 1.87, -.15, .42, .56]
    ]],
    [copper, 11, .77, [
      [-.31, 4.68, -.18, 1.81, 2.74], [1.32, 4.51, -.12, 1.97, 2.5],
      [3.14, 4.6, -.17, 1.83, 2.37], [4.70, 4.64, -.25, 1.73, 2.19],
      [5.98, 4.68, -.32, 1.65, 1.88], [6.58, 4.64, -.32, 1.72, 1.74],
      [7.24, 4.45, -.31, 1.56, 1.60], [7.99, 4.40, -.36, 1.36, 1.32],
      [8.52, 4.38, -.4, 1.16, 1.14], [8.88, 4.17, -.42, .94, 1.0]
    ]],
    [rock, 15, .72, [
      [-.29, 3.50, .51, 1.12, 2.20], [1.63, 3.58, .49, 1.15, 2.12],
      [3.36, 3.53, .46, 1.13, 2.0], [4.62, 3.6, .4, 1.04, 1.83],
      [6.13, 3.53, .32, .99, 1.56], [7.12, 3.52, .19, .94, 1.43],
      [8.01, 3.52, .1, .85, 1.31], [8.78, 3.60, -.0, .68, 1.02],
      [9.22, 3.55, -.08, .60, .90], [9.55, 3.49, -.12, .56, .82]
    ]],
    [light, 43, .56, [
      [9.34, 3.53, -.11, .62, .80], [9.52, 3.54, -.13, .90, .94],
      [9.69, 3.48, -.14, 1.03, 1.01], [10.03, 3.43, -.13, 1.08, 1.06],
      [10.38, 3.48, -.13, 1.0, 1.021], [10.50, 3.48, -.13, .81, .88],
      [10.52, 3.48, -.13, .51, .59]
    ]]
  ];
  for (const [material, seed, squareness, profile] of profiles) {
    scene.add(rockMesh(profile, material, seed, squareness));
  }

  const apron = [
    [-5.82, 1.92, 1.06, 1.25, 1.9], [-4.03, 2.81, .68, .71, 2.4],
    [-1.79, 1.94, 1.18, 1.49, 3.5], [-.33, 2.64, .81, 1.02, 2.85],
    [1.29, 2.27, .69, .81, 2.1], [2.42, 2.72, .52, .59, 2.82],
    [4.51, 2.81, .67, .63, 3.3], [5.63, -.81, 1.12, 1.53, 3.2],
    [-3.88, -2.06, 1.15, 1.24, 3.65], [1.02, -2.18, 1.2, 1.56, 3.84]
  ];
  for (const [i, [x, z, w, d, h]] of apron.entries()) {
    scene.add(rockMesh([[ -.22, x, z, w, d ], [h * .24, x, z, w*.82, d*.82],
      [h * .68, x*.90, z*.83, w*.45, d*.48], [h, x*.83, z*.68, w*.20, d*.27]],
    i % 3 ? copper : rock, 330 + i, .81, 28));
  }
}

function floorHeight(x, z) {
  const outer = THREE.MathUtils.smoothstep(Math.hypot(x * .78, z), 5, 19);
  return -.19 + outer * (.14 * Math.sin(x * .27 + z * .2) +
    .10 * Math.cos(x * .73 - z * .58) + .16 * Math.sin(z * .22));
}

function addLandscape(scene) {
  const sand = new THREE.PlaneGeometry(520, 520, 240, 240);
  sand.rotateX(-Math.PI / 2);
  const vertices = sand.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, floorHeight(vertices.getX(i), vertices.getZ(i)));
  }
  sand.computeVertexNormals();
  const floor = new THREE.Mesh(sand, sandstone('#c48b60', 1));
  floor.receiveShadow = true;
  scene.add(floor);

  const distant = [sandstone('#ab7858'), sandstone('#c48b62'), sandstone('#af7c5d')];
  const mesas = [
    [-27, -21, 17, 6, 6.6], [-48, -35, 24, 11, 7.7], [25, -29, 20, 7, 4.8],
    [50, -38, 21, 8, 7.4], [29, 24, 19, 8, 5.6], [36, 52, 28, 11, 9.1],
    [-29, 27, 15, 10, 4.9], [-39, 55, 24, 9, 7.0], [0, 61, 18, 7, 4.8],
    [66, 0, 19, 11, 7.0], [-61, 2, 12, 17, 8.6], [-2, -61, 30, 10, 6.9]
  ];
  for (const [i, [dx, dz, width, depth, height]] of mesas.entries()) {
    // Place the surrounding cliffs beyond the camera's entire orbit.
    const radius = Math.hypot(dx, dz);
    const scale = (165 + .34 * radius) / radius;
    const x = dx * scale;
    const z = dz * scale;
    const w = width * 2.1;
    const d = depth * 1.65;
    const h = height * (i === 0 ? 3.2 : 2.55);
    const mesa = rockMesh([
      [-.65, x, z, w*1.20, d*1.28], [.65, x, z, w*1.09, d*1.12],
      [h*.38, x*.99, z, w*.96, d*.96], [h*.60, x, z*.99, w*.90, d*.90],
      [h*.68, x, z*.99, w*.88, d*.87], [h*.72, x, z*.99, w*.91, d*.87],
      [h*.86, x*1.01, z*.98, w*.85, d*.80], [h, x*1.01, z*.99, w*.79, d*.76],
      [h+.12, x*1.01, z*.99, w*.72, d*.69]
    ], distant[i % distant.length], 714 + i, .43, 50);
    mesa.castShadow = false;
    scene.add(mesa);
  }
}

function scatter(scene) {
  const random = randomFor(24568);
  const dummy = new THREE.Object3D();
  const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({roughness: 1, flatShading: true}), 710);
  const brush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({roughness: 1, flatShading: true}), 400);
  const gravel = ['#a56545', '#b57a55', '#cd976f', '#cf996c', '#925d46'];
  const sage = ['#7a7660', '#827656', '#625f48', '#7b7957', '#a49867'];
  const color = new THREE.Color();
  for (let i = 0; i < stone.count; i++) {
    const angle = random() * Math.PI * 2;
    const distance = 6.1 + random() ** 1.65 * 31;
    const x = Math.cos(angle) * distance * 1.19;
    const z = Math.sin(angle) * distance;
    const size = .044 + random() ** 5 * .47;
    dummy.position.set(x, floorHeight(x, z) + size * .19 - .027, z);
    dummy.rotation.set(random() * 1.9, angle, random() * 1.9);
    dummy.scale.set(size * (1 + random() * 1.2), size * (.41 + random() * .39), size);
    dummy.updateMatrix();
    stone.setMatrixAt(i, dummy.matrix);
    stone.setColorAt(i, color.set(gravel[Math.floor(random() * gravel.length)]));
  }
  for (let i = 0; i < brush.count;) {
    const angle = random() * Math.PI * 2;
    const distance = 8 + random() ** .7 * 40;
    const x = Math.cos(angle) * distance * 1.17;
    const z = Math.sin(angle) * distance;
    const s = .09 + random() * .17;
    for (let leaf = 0; leaf < 5; leaf++, i++) {
      const dx = (random() - .5) * s * 2;
      const dz = (random() - .5) * s * 2;
      const blade = s * (.58 + random() * .50);
      dummy.position.set(x + dx, floorHeight(x, z) + blade * .69, z + dz);
      dummy.scale.set(blade * .63, blade * 1.23, blade * .76);
      dummy.rotation.set(dz * 3, angle, -dx * 3);
      dummy.updateMatrix();
      brush.setMatrixAt(i, dummy.matrix);
      brush.setColorAt(i, color.set(sage[Math.floor(random() * sage.length)]));
    }
  }
  stone.castShadow = stone.receiveShadow = true;
  brush.castShadow = brush.receiveShadow = true;
  scene.add(stone, brush);
}

function addSky(scene) {
  const geometry = new THREE.SphereGeometry(260, 28, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      horizon: {value: new THREE.Color('#97c8db')},
      blue: {value: new THREE.Color('#318dca')},
      zenith: {value: new THREE.Color('#17669e')}
    },
    vertexShader: `
      varying vec3 vSky;
      void main() {
        vSky = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 horizon, blue, zenith;
      varying vec3 vSky;
      void main() {
        vec3 ray = normalize(vSky);
        float height = max(ray.y, 0.);
        vec3 sky = mix(horizon, blue, smoothstep(.0, .27, height));
        sky = mix(sky, zenith, smoothstep(.14, .82, height));
        float glow = pow(max(0., dot(ray, normalize(vec3(.54, .11, .40)))), 9.);
        sky += vec3(.094, .069, .032) * glow;
        gl_FragColor = vec4(sky, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
}

export function createDesert() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#b3bac0', .0051);
  const ambient = new THREE.HemisphereLight('#dfeeff', '#ac7464', 1.80);
  const sun = new THREE.DirectionalLight('#fff0d9', 2.45);
  sun.position.set(14, 19, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 62});
  sun.shadow.normalBias = .04;
  sun.shadow.bias = -.00038;
  sun.shadow.radius = 2;
  scene.add(ambient, sun);
  addSky(scene);
  addLandscape(scene);
  addFormation(scene);
  scatter(scene);
  return scene;
}
