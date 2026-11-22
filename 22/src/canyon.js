import * as THREE from 'three'

const { clamp, lerp, smoothstep } = THREE.MathUtils
const TAU = Math.PI * 2
const cliffColor = new THREE.Color('#e9a371')
export const limits = { near: 15, far: -52, ceiling: 11.5, eye: 1.65, margin: .68 }
export const start = { x: .1, z: 10.3, y: 2.6, yaw: -.075, pitch: .1 }

const fract = x => x - Math.floor(x)
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)
const curve = t => t * t * (3 - 2 * t)
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y)
  const a = curve(fract(x)), b = curve(fract(y))
  return lerp(lerp(hash(i, j), hash(i + 1, j), a), lerp(hash(i, j + 1), hash(i + 1, j + 1), a), b) * 2 - 1
}

export function floorY(x, z) {
  return noise(x * .13 + 3, z * .12) * .29 +
    noise(x * .37, z * .28 - 4) * .13 +
    Math.sin(z * .089 - .7) * .26
}

function centerAt(z) {
  return Math.sin(-z * .087 - .3) * 1.8 + Math.sin(-z * .183 + .3) * .8 - 2.1 * smoothstep(-z, 22, 45)
}

function rimY(z, side) {
  const arches = 1.65 * Math.sin(z * .23 + side * .9) + 1.04 * Math.sin(z * .57 + side * 3)
  const domes = (side < 0 ? 3.6 : 3.0) * Math.pow(.5 + .5 * Math.sin(z * .104 + side), 3)
  const end = smoothstep(z, -82, -59) * (1 - smoothstep(z, 16.5, 23))
  return .2 + end * (9.5 + arches + domes + 1.2 * noise(z * .39, side))
}

function wallX(z, y, side) {
  const taper = smoothstep(y, -.2, 16)
  const bend = Math.sin(z * .145 + side) * 1.68 + .83 * Math.cos(z * .33 - side * .65)
  const ribs = Math.pow(.5 + .5 * Math.sin(z * .67 + side * 2 + y * .066), 3) * (1.2 + taper * .8)
  const talus = .96 * Math.exp(-Math.max(0, y) * .83)
  const bedding = .37 * Math.sin(y * 1.55 + z * .076 + side) + .125 * Math.sin(y * 4.8 + z * .24)
  const erosion = noise(z * .72 + side * 3, y * .39) * .57 + noise(z * 1.43, y * 1.1 + side * 4) * .20
  const opening = 5.6 * smoothstep(-z, 33, 77) + 2.4 * smoothstep(z, 10, 23)
  return centerAt(z) + side * (6.1 + bend + taper * 3.8 + bedding + erosion + opening - ribs - talus)
}

export function canyonSpan(z, y) {
  return wallX(z, y, 1) - wallX(z, y, -1)
}

const noiseGLSL = `
  float grainHash(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float strataNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(grainHash(i), grainHash(i+vec3(1,0,0)), f.x),
          mix(grainHash(i+vec3(0,1,0)), grainHash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(grainHash(i+vec3(0,0,1)), grainHash(i+vec3(1,0,1)), f.x),
          mix(grainHash(i+vec3(0,1,1)), grainHash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
`

function landscapeMaterial(kind) {
  const rock = kind === 'rock'
  const mat = new THREE.MeshStandardMaterial({ color: rock ? cliffColor : '#d99b70', roughness: 1, vertexColors: true, side: THREE.DoubleSide })
  mat.customProgramCacheKey = () => kind
  mat.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vTerrain;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      vec4 terrainLocal = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        terrainLocal = instanceMatrix * terrainLocal;
      #endif
      vTerrain = (modelMatrix * terrainLocal).xyz;
      #include <project_vertex>`)
    shader.fragmentShader = 'varying vec3 vTerrain;\n' + noiseGLSL + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 p = vTerrain;
      ${rock ? `
        float n = strataNoise(p * vec3(.53,.29,.53));
        float contour = p.y + .24*sin(p.z*.28 + p.x*.19) + .24*(n-.5);
        float cycle = fract(contour * .39 + .1);
        vec3 stratum = mix(vec3(.64,.37,.32), vec3(1.13,.91,.78), smoothstep(.08,.51,cycle));
        stratum = mix(stratum, vec3(1.20,1.13,1.02), smoothstep(.57,.65,cycle) * (1.0-smoothstep(.70,.79,cycle)) * .73);
        stratum = mix(stratum, vec3(.78,.51,.38), smoothstep(.89,.98,cycle) * .55);
        float fineContour = contour + .033 * sin(p.z * 1.3 + p.x * 1.9);
        float comb = sin(fineContour * 35.0 + 2.0 * sin(fineContour * 8.5));
        float lineAA = 1.0-smoothstep(.24,1.2,fwidth(fineContour * 35.0));
        float hairline = smoothstep(.75,.99,comb) * lineAA;
        float streak = strataNoise(p * vec3(2.2,.17,2.2));
        float mineral = smoothstep(.59,.81,strataNoise(p * vec3(2.8,.32,2.8) + vec3(0, n * 2.1, 0)));
        float chips = strataNoise(p * 5.5);
        float sandGrain = strataNoise(p * 24.0);
        float grainAA = 1.0-smoothstep(.35,1.3,length(fwidth(p * 24.0)));
        diffuseColor.rgb *= stratum * (.74 + .29*n + .20*streak + .21*chips + (sandGrain-.5)*.24*grainAA - .13*hairline - .14*mineral);
      ` : `
        float largeDunes = strataNoise(p*vec3(.89,1.0,.21));
        float grains = strataNoise(p*18.0);
        float grainAA = 1.0-smoothstep(.35,1.3,length(fwidth(p*18.0)));
        float wash = sin(p.x*1.8 + p.z*.37 + 4.0*largeDunes);
        diffuseColor.rgb *= .81 + .22*largeDunes + .048*wash + .16*(grains-.5)*grainAA;
      `}
    `)
  }
  return mat
}

function gridGeometry(columns, rows, sample, flip = false) {
  const positions = [], colors = [], indices = []
  for (let column = 0; column <= columns; column++) {
    for (let row = 0; row <= rows; row++) {
      const [x, y, z, r, g, b] = sample(column / columns, row / rows)
      positions.push(x, y, z)
      colors.push(r, g, b)
      if (column === columns || row === rows) continue
      const a = column * (rows + 1) + row
      const bIndex = a + rows + 1
      if (flip) indices.push(a, a + 1, bIndex, a + 1, bIndex + 1, bIndex)
      else indices.push(a, bIndex, a + 1, a + 1, bIndex, bIndex + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

function cliff(scene, side, material, mobile) {
  const geometry = gridGeometry(mobile ? 142 : 210, mobile ? 54 : 77, (u, v) => {
    const z = lerp(-83, 24, u)
    const rim = rimY(z, side)
    const inside = v <= .79
    const t = (v - .79) / .21
    const y = inside
      ? lerp(-1.2, rim, v / .79)
      : rim + Math.sin(t * 2.5) * (1.35 + .46 * Math.sin(z * .32)) - 1.4 * t * t
    const x = inside ? wallX(z, y, side) : wallX(z, rim, side) + side * (t * 17)
    const contact = .60 + .40 * smoothstep(y, -.1, 3.5)
    const varnish = .82 + .18 * noise(z * .31 + side, y * .12 + 9) + .14 * noise(z * .12, y * .55)
    return [x, y, z, contact * varnish, contact * varnish, Math.min(1, contact * (varnish + .05))]
  }, side < 0)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = side < 0 ? 'West cliff' : 'East cliff'
  mesh.userData.side = side
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

function makeMesa(scene, material, { x, z, height, width, depth, seed }) {
  const geo = gridGeometry(58, 38, (u, v) => {
    const a = u * TAU
    const y = -2 + height * Math.min(1, v / .94)
    const taper = 1.06 - .48 * v - .17 * smoothstep(v, 0, .29) - .45 * smoothstep(v, .94, 1)
    const shelves = .052 * Math.sin(v * 18) + .022 * Math.sin(v * 47)
    const lobe = 1 + .11 * Math.sin(4 * a + seed) + .16 * Math.sin(3 * a - v * 3 + seed) + .05 * Math.cos(9 * a)
    const contour = Math.max(.002, (taper + shelves) * lobe)
    const value = .76 + .18 * v + .11 * Math.cos(5 * a + v * 2)
    return [x + width * contour * Math.cos(a), y + Math.sin(a * 3 + seed) * v * Math.min(1, contour * 4.2), z + depth * contour * Math.sin(a), value, value * .93, value * .99]
  })
  const mesh = new THREE.Mesh(geo, material)
  scene.add(mesh)
  return mesh
}

function colorGeometry(geometry, variation) {
  const position = geometry.getAttribute('position')
  const colors = []
  for (let i = 0; i < position.count; i++) {
    const value = .81 + variation * Math.sin(position.getX(i) * 4 + position.getY(i) * 3 + position.getZ(i) * 3)
    colors.push(value, value, value)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

function shrubGeometry() {
  const positions = [], colors = []
  const olive = new THREE.Color('#6b7551')
  const dry = new THREE.Color('#a09a61')
  const stem = new THREE.Color('#786049')
  function triangle(a, b, c, color) {
    positions.push(...a, ...b, ...c)
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b)
  }
  for (let i = 0; i < 17; i++) {
    const phi = i * 2.39996
    const spread = .18 + .39 * hash(i, 3)
    const top = .25 + .46 * hash(i, 8)
    const x = Math.cos(phi) * spread, z = Math.sin(phi) * spread
    triangle([-.014, 0, 0], [.014, 0, .014], [x, top, z], stem)
    for (let j = 0; j < 10; j++) {
      const t = .32 + j * .071
      const attach = [x * t, top * t, z * t]
      const direction = phi + j * 2.39996
      const dx = Math.cos(direction), dz = Math.sin(direction)
      const length = .07 + hash(i, j) * .095
      const tip = [attach[0] + dx * length, attach[1] + .08, attach[2] + dz * length]
      const wide = [attach[0] + dx * length * .45 - dz * .026, attach[1] + .039, attach[2] + dz * length * .45 + dx * .026]
      triangle(attach, wide, tip, j % 3 ? olive : dry)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

function placeDetails(scene, stoneMat, mobile) {
  const object = new THREE.Object3D()
  const rockGeo = colorGeometry(new THREE.IcosahedronGeometry(1, 1), .13)
  const positions = []
  const stoneCount = mobile ? 420 : 710
  const rocks = new THREE.InstancedMesh(rockGeo, stoneMat, stoneCount)
  const rockTint = new THREE.Color()
  const nearRocks = [
    [-3.8, 5.7, .91], [3.3, 4.7, .76], [4, 3.4, .51], [-4.2, 1, .58],
    [-3.3, -5.3, .71], [3, -10, .82], [-4.1, -17, 1.12],
  ]
  for (let i = 0; i < stoneCount; i++) {
    const z = nearRocks[i]?.[1] ?? lerp(-71, 16, hash(i, 124))
    const west = wallX(z, .15, -1), east = wallX(z, .15, 1)
    const bias = i % 3 !== 0
    const t = bias ? (i % 2 ? .07 + .26 * hash(i, 72) : .69 + .25 * hash(i, 72)) : hash(i, 9)
    const x = nearRocks[i]?.[0] ?? lerp(west + .19, east - .19, t)
    const size = nearRocks[i]?.[2] ?? (.025 + Math.pow(hash(i, 54), 2.85) * (bias ? .61 : .29))
    const tall = size * lerp(.31, .70, hash(i, 17))
    object.position.set(x, floorY(x, z) + tall * .17, z)
    object.rotation.set(hash(i, 16) * .41, hash(i, 31) * TAU, hash(i, 46) * .42)
    object.scale.set(size * lerp(.7, 1.27, hash(i, 90)), tall, size * lerp(.52, 1, hash(i, 25)))
    object.updateMatrix()
    rocks.setMatrixAt(i, object.matrix)
    rockTint.setRGB(.62 + hash(i, 4) * .33, .53 + hash(i, 16) * .34, .51 + hash(i, 29) * .39)
    rocks.setColorAt(i, rockTint)
    if (size > .49) positions.push({ x, z, radius: size * .71, top: object.position.y + tall })
  }
  rocks.castShadow = !mobile
  rocks.receiveShadow = true
  scene.add(rocks)

  const plants = new THREE.InstancedMesh(shrubGeometry(), new THREE.MeshStandardMaterial({
    color: '#f1d8af', vertexColors: true, side: THREE.DoubleSide, roughness: 1,
  }), mobile ? 62 : 104)
  const nearPlants = [[-3.4, 5.9, 1.2], [3.3, 3.8, 1.28], [-3.8, 0, .8], [4.4, -4, 1.05], [-3.2, -11, .9]]
  for (let i = 0; i < plants.count; i++) {
    const z = nearPlants[i]?.[1] ?? lerp(-68, 13, hash(i, 53))
    const side = i % 2 ? -1 : 1
    const x = nearPlants[i]?.[0] ?? wallX(z, 0, side) - side * lerp(.38, 2.5, hash(i, 52))
    const size = nearPlants[i]?.[2] ?? lerp(.27, 1.01, hash(i, 62))
    object.position.set(x, floorY(x, z), z)
    object.rotation.set(0, hash(i, 70) * TAU, 0)
    object.scale.set(size, size * lerp(.72, 1.1, hash(i, 16)), size)
    object.updateMatrix()
    plants.setMatrixAt(i, object.matrix)
  }
  plants.castShadow = !mobile
  plants.receiveShadow = true
  scene.add(plants)
  return positions
}

function makeSky(scene, sunDirection) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(175, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDirection: { value: sunDirection } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vec4 p = modelMatrix * vec4(position, 1.0);
        vDirection = p.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * p;
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 sunDirection;
      ${noiseGLSL}
      void main() {
        vec3 eye = normalize(vDirection);
        float y = max(0.0, eye.y);
        vec3 tone = mix(vec3(.85,.58,.40), vec3(.24,.45,.60), smoothstep(0.0,.37,y));
        tone = mix(tone, vec3(.107,.274,.43), smoothstep(.2,.95,y));
        float glare = max(0.0, dot(eye, sunDirection));
        tone += vec3(.34,.16,.05) * pow(glare, 10.0);
        float sidelight = max(0.0, dot(eye, normalize(vec3(.38,.09,-1.0))));
        tone += vec3(.13,.075,.02) * pow(sidelight, 18.0);
        vec3 plane = eye / max(.13, y);
        float wisps = strataNoise(plane * vec3(.9,23.0,3.6) + vec3(14, 0, 11));
        wisps *= strataNoise(plane * vec3(2.2,28.0,6.0));
        float cloud = smoothstep(.42,.70,wisps) * smoothstep(.09,.19,y);
        tone = mix(tone, vec3(.91,.80,.66), cloud * .19);
        gl_FragColor = vec4(tone, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }))
  sky.renderOrder = -10
  scene.add(sky)
}

export function createCanyon(scene, mobile) {
  const rock = landscapeMaterial('rock')
  const sand = landscapeMaterial('sand')
  const sunDirection = new THREE.Vector3(.70, .78, -.49).normalize()
  scene.fog = new THREE.FogExp2('#d3a58d', .0103)
  makeSky(scene, sunDirection)
  scene.add(new THREE.HemisphereLight('#d8d8ff', '#985643', 2.05))
  const sun = new THREE.DirectionalLight('#ffcb98', 2.72)
  sun.target.position.set(0, 1, -13)
  sun.position.copy(sun.target.position).addScaledVector(sunDirection, 57)
  sun.castShadow = true
  sun.shadow.mapSize.setScalar(mobile ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { near: 5, far: 106, left: -31, right: 31, top: 35, bottom: -35 })
  sun.shadow.normalBias = .12
  sun.shadow.bias = -.00009
  sun.shadow.intensity = .86
  sun.shadow.radius = 2
  sun.shadow.autoUpdate = false
  sun.shadow.needsUpdate = true
  scene.add(sun, sun.target)

  const ground = new THREE.Mesh(gridGeometry(118, 112, (u, v) => {
    const x = lerp(-72, 72, u), z = lerp(-155, 74, v)
    const y = floorY(x, z)
    const west = wallX(z, 0, -1), east = wallX(z, 0, 1)
    const nearWall = Math.max(0, Math.min(x - west, east - x))
    const shaded = .81 + .19 * smoothstep(nearWall, .1, 3.1)
    const wash = .92 + .11 * noise(x * .19, z * .19)
    return [x, y, z, shaded * wash, shaded * wash, shaded * wash]
  }, true), sand)
  ground.receiveShadow = true
  scene.add(ground)
  const walls = [-1, 1].map(side => cliff(scene, side, rock, mobile))
  ;[
    { x: -10, z: -63, height: 12, width: 5.2, depth: 6, seed: 3 },
    { x: 6.8, z: -61, height: 18.4, width: 4.8, depth: 6.4, seed: 4 },
    { x: -16, z: -71, height: 20, width: 8, depth: 10, seed: 8 },
    { x: 1.3, z: -84, height: 14, width: 8, depth: 9, seed: 2 },
    { x: 22, z: -89, height: 24, width: 17, depth: 10, seed: 1.1 },
    { x: -32, z: -94, height: 26, width: 18, depth: 11, seed: 10 },
    { x: -9, z: -116, height: 16.5, width: 24, depth: 12, seed: 4 },
    { x: 36, z: -116, height: 26, width: 19, depth: 18, seed: 7 },
    { x: 25, z: 0, height: 17, width: 10, depth: 16, seed: 4 },
    { x: -24, z: 10, height: 16.5, width: 12, depth: 15, seed: 7 },
    { x: -8, z: 32, height: 13.5, width: 18, depth: 9, seed: 12 },
    { x: 14, z: 40, height: 13, width: 16, depth: 13, seed: 5 },
  ].forEach(spec => walls.push(makeMesa(scene, rock, spec)))
  return { ground, walls, obstacles: placeDetails(scene, rock, mobile) }
}

export function restrictPosition(point, obstacleRocks) {
  point.z = clamp(point.z, limits.far, limits.near)
  // Sample the body above and below eye level to keep overhangs outside the camera capsule.
  const lower = Math.max(.3, point.y - .9), higher = point.y + .22
  const west = Math.max(wallX(point.z, lower, -1), wallX(point.z, point.y, -1), wallX(point.z, higher, -1)) + limits.margin
  const east = Math.min(wallX(point.z, lower, 1), wallX(point.z, point.y, 1), wallX(point.z, higher, 1)) - limits.margin
  point.x = clamp(point.x, west, east)
  point.y = clamp(point.y, floorY(point.x, point.z) + limits.eye, limits.ceiling)
  for (const rock of obstacleRocks) {
    if (Math.abs(point.z - rock.z) > 1.5 || Math.abs(point.x - rock.x) > 1.5) continue
    if (Math.hypot(point.x - rock.x, point.z - rock.z) < rock.radius + .27) point.y = Math.max(point.y, rock.top + 1.2)
  }
  return point
}

export function ripplePoint(point, side, angle, radius, out) {
  const z = point.z + Math.cos(angle) * radius
  const y = point.y + Math.sin(angle) * radius
  const height = rimY(z, side)
  if (y < floorY(point.x, z) + .035 || y > height - .06) return false
  const correction = point.x - wallX(point.z, point.y, side)
  out.set(wallX(z, y, side) + correction - side * .085, y, z)
  return true
}

export function echoPoints(point, side) {
  const other = -side
  const firstZ = clamp(point.z - .66, -65, 18)
  const firstY = clamp(point.y * .91 + .45, .38, rimY(firstZ, other) - .35)
  const nextZ = clamp(point.z - 2.2, -68, 18)
  const nextY = clamp(point.y * .95 + .46, .32, rimY(nextZ, side) - .36)
  return [
    { side: other, point: new THREE.Vector3(wallX(firstZ, firstY, other), firstY, firstZ) },
    { side, point: new THREE.Vector3(wallX(nextZ, nextY, side), nextY, nextZ) },
  ]
}

export function representativePoint(index) {
  const side = index === 1 ? -1 : 1
  const z = 2.6 - index * 4.6
  const y = [1.15, 3.95, 7.8][index]
  return { point: new THREE.Vector3(wallX(z, y, side), y, z), side }
}
