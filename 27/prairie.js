import * as THREE from './vendor/three.module.min.js';

function randomSeries(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = randomSeries(27026);
const range = (min, max) => min + (max - min) * random();
const color = (hex) => new THREE.Color(hex);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function elevation(x, z, mouths) {
  let y = .14 * Math.sin(x * .19 + z * .17) + .13 * Math.cos(z * .26 - x * .1);
  y += .065 * Math.sin(x * .63 + Math.sin(z * .7)) + .047 * Math.cos((x - z) * .87);
  y += .65 * (1 - Math.exp(-Math.pow(Math.max(0, Math.hypot(x, z) - 18) / 27, 2))) *
    (1 + .9 * Math.sin(x * .085 + z * .061));
  for (const [mx, mz, radius] of mouths) {
    const d = Math.hypot(x - mx, z - mz) / radius;
    const ring = Math.exp(-Math.pow((d - 1.17) / .49, 2));
    y += (.37 + .19 * Math.sin(x * 1.8 + z * 1.15) ** 2) * radius * ring;
    y += .15 * Math.exp(-Math.pow(d / 2.25, 2));
  }
  return y;
}

function terrain(mouths) {
  // Dense ground near the colony blends to a wider mesh at the edge.
  const size = 240;
  const positions = [], colors = [], faces = [];
  const ground = color('#777148');
  const ochre = color('#917346');
  const soil = color('#755438');
  const green = color('#6b7348');
  const pointColor = new THREE.Color();
  const spacing = (index) => {
    const signed = (index - size / 2) / (size / 2);
    return signed * 29 + Math.sign(signed) * Math.pow(Math.abs(signed), 5) * 105;
  };
  for (let j = 0; j <= size; j++) {
    for (let i = 0; i <= size; i++) {
      const x = spacing(i), z = spacing(j);
      positions.push(x, elevation(x, z, mouths), z);
      const vegetation = .5 + .23 * Math.sin(x * .41 + z * .72) + .17 * Math.cos(z * .31 - x * .45);
      const brown = .4 + .3 * Math.sin(z * .49 + x * .14);
      pointColor.copy(ground).lerp(green, vegetation).lerp(ochre, brown * .57);
      let worn = 0;
      for (const [mx, mz, radius] of mouths) {
        worn = Math.max(worn, Math.exp(-Math.pow(Math.hypot(x - mx, z - mz) / (radius * 2.05), 3)));
      }
      pointColor.lerp(soil, worn * .91).multiplyScalar(range(.91, 1.09));
      colors.push(pointColor.r, pointColor.g, pointColor.b);
      if (i < size && j < size) {
        const a = j * (size + 1) + i;
        const b = a + 1, c = a + size + 1, d = c + 1;
        faces.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.mouths = { value: mouths.map(([x, z, r]) => new THREE.Vector3(x, z, r * .96)) };
    shader.vertexShader = 'varying vec3 terrainPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nterrainPosition = position;');
    shader.fragmentShader = `varying vec3 terrainPosition;
      uniform vec3 mouths[${mouths.length}];\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      for (int i = 0; i < ${mouths.length}; i++) {
        if (distance(terrainPosition.xz, mouths[i].xy) < mouths[i].z) discard;
      }
      vec2 grainCell = floor(terrainPosition.xz * 84.0);
      float grain = fract(sin(dot(grainCell, vec2(12.9898, 78.233))) * 43758.5453);
      float grit = sin(terrainPosition.x * 19.0 + sin(terrainPosition.z * 12.0)) *
        sin(terrainPosition.z * 23.0);
      float tufts = .5 + .5 * sin(terrainPosition.x * 3.7 + sin(terrainPosition.z * 2.8))
        * cos(terrainPosition.z * 4.1 - sin(terrainPosition.x * 6.3));
      float landmarkShadow = 1.0-smoothstep(.0,1.04,
        length((terrainPosition.xz-vec2(-12.55,2.32))*vec2(.94,1.46)));
      float dogShadow = 1.0-smoothstep(.03,.67,
        length((terrainPosition.xz-vec2(-9.68,3.96))*vec2(1.0,1.6)));
      diffuseColor.rgb *= (.79 + .14 * grain + .066 * grit + .16*tufts) *
        (1.0 - .38*landmarkShadow - .30*dogShadow);
    `);
  };
  return new THREE.Mesh(geometry, material);
}

function mouthRim(mouth, allMouths, through) {
  const [x, z, radius] = mouth;
  const geometry = new THREE.BufferGeometry();
  const vertices = [], tint = [], indices = [];
  const rings = through
    ? [[.81, -.23], [.92, .06], [.96, null], [1.11, null], [1.36, null]]
    : [[.23, -.87], [.54, -.53], [.79, -.22], [.96, null], [1.10, null], [1.32, null]];
  const ringColors = ['#1b1512', '#39271d', '#62432c', '#7d5837', '#8d663f', '#836347'];
  const sides = 64;
  for (let ring = 0; ring < rings.length; ring++) {
    for (let i = 0; i < sides; i++) {
      const angle = i * Math.PI * 2 / sides;
      const [r, y] = rings[ring];
      const wobble = r * (1 + .022 * Math.sin(5 * angle) + .014 * Math.sin(9 * angle + x));
      const px = x + Math.cos(angle) * radius * wobble;
      const pz = z + Math.sin(angle) * radius * wobble;
      const py = y === null ? elevation(px, pz, allMouths) + (ring === rings.length - 1 ? -.009 : .018) : y;
      vertices.push(px, py, pz);
      const c = color(ringColors[through ? ring + 1 : ring]).multiplyScalar(range(.78, 1.19));
      tint.push(c.r, c.g, c.b);
      if (ring < rings.length - 1) {
        const a = ring * sides + i;
        const b = ring * sides + (i + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 1,
  }));
}

function sky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 direction;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
          mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
      }
      void main() {
        vec3 d = normalize(direction);
        vec3 top = vec3(.37,.59,.65), horizon = vec3(.84,.83,.68);
        vec3 col = mix(horizon, top, pow(clamp(d.y, 0.0, 1.0), .46));
        vec3 sun = normalize(vec3(.80,.27,-.69));
        float glow = max(0.0,dot(d,sun));
        col += vec3(.21,.14,.064)*pow(glow,8.0);
        col = mix(col,vec3(1.0,.94,.75),smoothstep(.9991,.99975,glow)*.88);
        vec2 p = d.xz / max(d.y+.19,.14)*2.8 + vec2(5.2,4.8);
        float n = .54*noise(p)+.26*noise(p*2.02)+.13*noise(p*4.10)+.07*noise(p*8.26);
        float cloud = smoothstep(.51,.75,n)*smoothstep(.018,.12,d.y);
        col = mix(col,vec3(.95,.91,.79)+.05*glow,cloud*.72);
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(162, 28, 16), material);
  mesh.renderOrder = -3;
  return mesh;
}

function bluffs() {
  const group = new THREE.Group();
  for (let layer = 0; layer < 4; layer++) {
    const vertices = [], faces = [], colors = [];
    const count = 210, distance = 116 - layer * 12;
    for (let i = 0; i <= count; i++) {
      const angle = i * Math.PI * 2 / count;
      const peaks = 2.7 * Math.sin(angle * 4 + layer * 1.24) + 1.8 * Math.sin(angle * 9 + .17 * layer);
      const edge = .68 * Math.sin(angle * 32 + layer) + .44 * Math.cos(angle * 51 + layer * 2);
      const frontRange = Math.pow(Math.max(0, -Math.cos(angle + .82)), 5) * 3.6;
      const height = Math.max(1, 3.1 + peaks + edge + frontRange - layer * .37);
      const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
      vertices.push(x, -1.4, z, x, height, z);
      const tint = color(['#a6ae9b', '#919b88', '#7e8872', '#737a5a'][layer]).multiplyScalar(range(.96, 1.04));
      colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      if (i < count) {
        const a = 2 * i;
        faces.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(faces);
    group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({side: THREE.DoubleSide, vertexColors:true, fog:false})));
  }
  return group;
}

function greenery(mouths, time) {
  const positions = [], colors = [], weights = [], indices = [];
  const pigments = ['#5e6138','#807644','#9b8b54','#a79454','#777b46','#a3a16a','#cbc08a'].map(color);
  const tip = color('#d5bf85');
  const baseColor = new THREE.Color();
  function grassBlade(x, y, z, angle, height, breadth, lean, tint) {
    const index = positions.length / 3;
    const wx = Math.cos(angle) * breadth, wz = Math.sin(angle) * breadth;
    const lx = -Math.sin(angle) * lean, lz = Math.cos(angle) * lean;
    positions.push(x-wx, y, z-wz, x+wx, y, z+wz,
      x+lx*.36-wx*.56, y+height*.55, z+lz*.36-wz*.56,
      x+lx*.36+wx*.56, y+height*.55, z+lz*.36+wz*.56,
      x+lx, y+height, z+lz);
    baseColor.copy(tint).multiplyScalar(.54);
    for (let i = 0; i < 2; i++) colors.push(baseColor.r, baseColor.g, baseColor.b);
    for (let i = 0; i < 2; i++) colors.push(tint.r, tint.g, tint.b);
    baseColor.copy(tint).lerp(tip, .35).multiplyScalar(1.1);
    colors.push(baseColor.r, baseColor.g, baseColor.b);
    weights.push(0, 0, height * .21, height * .21, height * .45);
    indices.push(index,index+1,index+2,index+1,index+3,index+2,index+2,index+3,index+4);
  }
  for (let cluster = 0; cluster < 19100; cluster++) {
    const near = cluster < 9300;
    const x = near ? range(-24, 25) : range(-68, 69);
    const z = near ? range(-18, 20) : range(-72, 57);
    if (mouths.some(([mx, mz, r]) => Math.hypot(x - mx, z - mz) < r * range(1.38, 1.78))) continue;
    if (random() > .68 + .28 * Math.sin(x * .78 + Math.sin(z * .43)) * Math.cos(z * .55)) continue;
    const size = range(.12, near ? .44 : .57) * range(.64, 1.18);
    const tint = pigments[Math.floor(random() * pigments.length)];
    for (let b = 0; b < (near ? 5 : 3); b++) {
      const px = x + range(-.125,.125), pz = z + range(-.125,.125);
      grassBlade(px, elevation(px,pz,mouths)-.012, pz, range(0,6.283),
        size*range(.53,1.35), range(.009,.027)*(near ? 1 : 1.8), size*range(.12,.91), tint);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('bend', new THREE.Float32BufferAttribute(weights, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide});
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.breezeTime = time;
    shader.vertexShader = 'uniform float breezeTime; attribute float bend;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float sway = sin(position.x*.83 + position.z*.66 + breezeTime*1.93);
      float gust = sin(position.x*.37 - position.z*.20 + breezeTime*.82);
      transformed.x += bend*(.33*sway+.65*gust);
      transformed.z += bend*.24*sway;
    `);
  };
  return new THREE.Mesh(g, mat);
}

function wildflowers(mouths) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const spots = [[-13.9,7.34],[-9.0,5.45],[-15.5,5.3],[-16.8,3.1],[-7.4,.9],[-3,5.5],[4.1,-2.8],
    [8.4,-2.7],[11.2,-4.3],[14.2,-4.5],[16.2,1.8],[11.0,1.55]];
  const flowers = [];
  for (let i = 0; i < 265; i++) {
    const [cx, cz] = spots[i % spots.length];
    const x = cx + range(-1.17,1.17), z = cz + range(-1.1,1.1);
    if (mouths.some(([mx,mz,r]) => Math.hypot(x-mx,z-mz) < r*1.55)) continue;
    flowers.push([x, elevation(x,z,mouths), z, range(.16,.53), range(.026,.058), i % 10]);
  }
  const material = new THREE.MeshStandardMaterial({roughness:.85});
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,5), material, flowers.length);
  const buds = new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4), material, flowers.length);
  const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4), material, flowers.length*5);
  const petalColors = ['#af9dd7','#9e89bf','#8565a9','#c5b2dd','#f3e9c1','#e9ddc3','#dfd4b5','#e6b860','#d9a64f','#d89539'];
  flowers.forEach(([x,y,z,h,r,type], i) => {
    dummy.position.set(x, y+h*.5, z); dummy.scale.set(.007,h,.007); dummy.rotation.set(0,0,0); dummy.updateMatrix();
    stems.setMatrixAt(i,dummy.matrix); stems.setColorAt(i,color('#677147'));
    dummy.position.set(x,y+h,z); dummy.scale.set(r*.43,r*.28,r*.43); dummy.updateMatrix();
    buds.setMatrixAt(i,dummy.matrix); buds.setColorAt(i,color('#c58b37'));
    for (let j = 0; j < 5; j++) {
      const a = j*Math.PI*2/5+i;
      dummy.position.set(x+Math.cos(a)*r*.67,y+h+range(-.004,.008),z+Math.sin(a)*r*.67);
      dummy.scale.set(r*.58,r*.19,r*.37); dummy.rotation.set(.17,-a,.25); dummy.updateMatrix();
      petals.setMatrixAt(i*5+j,dummy.matrix); petals.setColorAt(i*5+j,color(petalColors[type]));
    }
  });
  group.add(stems, petals, buds);
  return group;
}

function scatteredStones(mouths) {
  const group = new THREE.Group();
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({roughness:.97, flatShading:true});
  const pebbles = new THREE.InstancedMesh(rockGeo, mat, 620);
  const dummy = new THREE.Object3D();
  for (let i=0; i<pebbles.count; i++) {
    const [x,z,radius] = mouths[i % mouths.length];
    const angle = range(0, 6.283), d = radius*range(1.03,3.75);
    const px = x + Math.cos(angle)*d, pz = z + Math.sin(angle)*d;
    const s = range(.018,.11)*(i%14===0 ? 2.2 : 1);
    dummy.position.set(px,elevation(px,pz,mouths)+s*.1,pz);
    dummy.scale.set(s*range(.75,1.5),s*range(.42,.85),s);
    dummy.rotation.set(range(0,.5),angle,range(0,.5)); dummy.updateMatrix();
    pebbles.setMatrixAt(i,dummy.matrix);
    pebbles.setColorAt(i,color(['#a08a60','#827156','#a19076','#b39a74','#686354'][i%5]));
  }
  const landmark = new THREE.Group();
  const slab = new THREE.IcosahedronGeometry(1, 0);
  const points = slab.attributes.position;
  for (let i=0; i<points.count; i++) {
    const x=points.getX(i), y=points.getY(i), z=points.getZ(i);
    const edge = 1 + .13*Math.sin(x*4.1+y*6.7+z*3.2);
    points.setXYZ(i,x*edge,Math.max(-.42,y*edge),z*edge);
  }
  slab.computeVertexNormals();
  const stoneMaterial = new THREE.MeshStandardMaterial({color: '#ddd0a8', roughness: .95, flatShading: true});
  const landmarkX = -12.3, landmarkZ = 2.12;
  const stone = new THREE.Mesh(slab, stoneMaterial);
  stone.position.y = .15;
  stone.scale.set(.89,.65,.59);
  stone.rotation.set(.12,.26,-.24);
  const littleStone = new THREE.Mesh(slab, stoneMaterial);
  littleStone.position.set(-.49,.10,.43);
  littleStone.scale.set(.34,.28,.29);
  landmark.position.set(landmarkX,elevation(landmarkX,landmarkZ,mouths)-.025,landmarkZ);
  landmark.add(stone,littleStone);
  group.add(landmark,pebbles);
  return group;
}

function prairieDog(mouths) {
  const body = new THREE.Group(), head = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 32, 20);
  function fur(hex) {
    const mat = new THREE.MeshStandardMaterial({color:hex,roughness:.89});
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 furPoint;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nfurPoint = position;');
      shader.fragmentShader = 'varying vec3 furPoint;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 grain = floor(furPoint * vec3(87.0,39.0,85.0));
        float fleck = fract(sin(dot(grain, vec3(12.99,78.23,47.2))) * 43758.54);
        float strands = sin(furPoint.x*134.0+furPoint.y*19.0)*sin(furPoint.z*109.0);
        diffuseColor.rgb *= .87 + .24*fleck + .055*strands;
      `);
    };
    return mat;
  }
  const cinnamon = fur('#8d6846'), coat = fur('#ad8154'), belly = fur('#c49d6a');
  const muzzle = fur('#d8ad78'), innerEar = fur('#785240'), paw = fur('#89623f');
  const shiny = new THREE.MeshStandardMaterial({color:'#211911',roughness:.29});
  const nostril = new THREE.MeshStandardMaterial({color:'#39281c',roughness:.62});
  const dark = new THREE.MeshBasicMaterial({color:'#403020'});
  function shape(parent, mat, x,y,z, sx,sy,sz, angle = 0) {
    const mesh = new THREE.Mesh(sphere, mat);
    mesh.position.set(x,y,z);
    mesh.scale.set(sx,sy,sz);
    mesh.rotation.z = angle;
    parent.add(mesh);
    return mesh;
  }
  const tail = shape(body,cinnamon,.10,.13,-.28,.10,.135,.39,.35);
  tail.rotation.x = .23;
  shape(body,cinnamon,.0,.32,-.035,.279,.335,.218);
  shape(body,coat,0,.52,.005,.253,.372,.219);
  shape(body,belly,0,.51,.118,.189,.30,.132);
  shape(body,coat,0,.76,.02,.177,.18,.16);
  for (const side of [-1,1]) {
    shape(body,cinnamon,.185*side,.14,.038,.145,.15,.143,-side*.34);
    shape(body,paw,.18*side,.06,.145,.108,.065,.161);
    const limb = shape(body,coat,.203*side,.59,.107,.085,.172,.087,-side*.46);
    limb.rotation.x = -.45;
    shape(body,paw,.151*side,.477,.215,.069,.103,.078,-side*.38);
    for(let k=0;k<3;k++) {
      shape(body,nostril,.18*side+(k-1)*.035,.055,.275,.011,.016,.04);
      shape(body,nostril,.148*side+(k-1)*.022,.424,.256,.008,.026,.011,-side*.3);
    }
  }
  head.position.set(0,.9,.032);
  shape(head,coat,0,.043,0,.216,.201,.197);
  shape(head,cinnamon,0,.125,-.028,.196,.137,.160);
  shape(head,belly,0,-.067,.09,.137,.094,.13);
  for(const side of [-1,1]) {
    shape(head,cinnamon,.156*side,.174,-.046,.068,.083,.05,-side*.28);
    shape(head,innerEar,.157*side,.186,-.009,.04,.058,.021,-side*.28);
    shape(head,coat,.151*side,.075,.126,.063,.063,.041);
    shape(head,shiny,.160*side,.082,.153,.038,.043,.023);
    shape(head,muzzle,.068*side,-.037,.177,.095,.066,.088);
    for(let k=0;k<4;k++) {
      const a = new THREE.Vector3(side*(.096+k*.014),-.055+k*.013,.238);
      const b = new THREE.Vector3(side*(.234+k*.009),-.076+k*.043,.26-k*.014);
      head.add(new THREE.Mesh(new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(a,a.clone().lerp(b,.53).add(new THREE.Vector3(0,.017,.007)),b),
        6,.0023,4,false),dark));
    }
  }
  shape(head,nostril,0,.015,.244,.056,.037,.027);
  shape(head,dark,0,-.056,.245,.012,.028,.012);
  body.add(head);
  body.scale.setScalar(1.12);
  const x = -9.47, z = 3.77;
  body.position.set(x,elevation(x,z,mouths) - .015,z);
  body.rotation.y = -.64;
  return {body,head};
}

export function createPrairie(mouths, breezeTime) {
  const group = new THREE.Group();
  group.add(bluffs(), terrain(mouths), greenery(mouths,breezeTime),
    wildflowers(mouths), scatteredStones(mouths));
  mouths.forEach((mouth,i) => group.add(mouthRim(mouth,mouths,i<2)));
  const dog = prairieDog(mouths);
  group.add(dog.body);
  group.add(new THREE.HemisphereLight('#e6eee0','#9b7046',2.24));
  const sun = new THREE.DirectionalLight('#ffe1ab',2.05);
  sun.position.set(27,19,-24);
  group.add(sun);
  return {group, sky:sky(), head:dog.head};
}
