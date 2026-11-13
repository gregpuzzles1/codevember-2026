import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const sceneEl = document.querySelector('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9b79c');
scene.fog = new THREE.FogExp2('#a9b79c', 0.008);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
const cameraTarget = new THREE.Vector3(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
sceneEl.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight('#fff8e6', '#53694c', 2.2));
const sunlight = new THREE.DirectionalLight('#fff0d2', 2.4);
sunlight.position.set(-12, 24, 11);
scene.add(sunlight);

const mat = (color, roughness = 0.94) => new THREE.MeshStandardMaterial({ color, roughness });
const ground = new THREE.Mesh(new THREE.CircleGeometry(23, 80), mat('#94a77b'));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.12;
scene.add(ground);

const clearing = new THREE.Mesh(new THREE.CircleGeometry(18.5, 80), mat('#b3b38b'));
clearing.rotation.x = -Math.PI / 2;
clearing.position.y = -0.1;
scene.add(clearing);

const routePoints = [];
const spiralTurns = 3.25;
const pointCount = 540;
for (let i = 0; i <= pointCount; i++) {
  const t = i / pointCount;
  const angle = -Math.PI / 2 + t * Math.PI * 2 * spiralTurns;
  const radius = 15.3 - t * 13.15;
  routePoints.push(new THREE.Vector3(Math.cos(angle) * radius, 0.025, Math.sin(angle) * radius));
}
const pathCurve = new THREE.CatmullRomCurve3(routePoints);
const pathSamples = pathCurve.getSpacedPoints(760);
const pathWidth = 1.28;

function makePath(points, width, color, y) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < points.length; i++) {
    const tangent = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
    positions.push(points[i].x + side.x, y, points[i].z + side.z);
    positions.push(points[i].x - side.x, y, points[i].z - side.z);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.material.side = THREE.DoubleSide;
  scene.add(mesh);
  return mesh;
}

makePath(pathSamples, pathWidth + 0.25, '#8a8064', 0.005);
makePath(pathSamples, pathWidth, '#c6b995', 0.018);

const hedgeColors = ['#49684b', '#57764e', '#648354', '#708d5a'].map(color => new THREE.Color(color));
function makeHedgeSide(side) {
  const points = [];
  const positions = [];
  const colors = [];
  const indices = [];
  const offset = pathWidth / 2 + 0.15;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const boxPositions = box.attributes.position;
  const boxIndices = box.index.array;
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let i = 0; i < pathSamples.length; i += 2) {
    const tangent = pathSamples[Math.min(i + 1, pathSamples.length - 1)]
      .clone().sub(pathSamples[Math.max(0, i - 1)]).normalize();
    points.push(new THREE.Vector3(
      pathSamples[i].x - tangent.z * offset * side,
      0,
      pathSamples[i].z + tangent.x * offset * side
    ));
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const delta = b.clone().sub(a);
    const length = delta.length();
    if (length < 0.01) continue;
    position.set((a.x + b.x) / 2, 0.61, (a.z + b.z) / 2);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(delta.z, delta.x));
    scale.set(length + 0.06, 1.22 + 0.07 * Math.sin(i * 0.41), 0.42);
    matrix.compose(position, rotation, scale);
    const color = hedgeColors[i % hedgeColors.length];
    const vertexOffset = positions.length / 3;
    for (let vertex = 0; vertex < boxPositions.count; vertex++) {
      const point = new THREE.Vector3().fromBufferAttribute(boxPositions, vertex).applyMatrix4(matrix);
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    }
    for (const index of boxIndices) indices.push(vertexOffset + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 })));
  box.dispose();
}
makeHedgeSide(1);
makeHedgeSide(-1);

function makeTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.27, 2.2, 7), mat('#76614a'));
  trunk.position.y = 1.1;
  tree.add(trunk);
  const canopyColors = ['#547452', '#66835a', '#7b905f'];
  for (let i = 0; i < 3; i++) {
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45 - i * 0.12, 1), mat(canopyColors[i]));
    canopy.position.set((i - 1) * 0.5, 2.65 + i * 0.48, (i % 2) * 0.28);
    canopy.scale.set(1, 0.8, 0.85);
    tree.add(canopy);
  }
  scene.add(tree);
}

[
  [-18, -6, 1.1], [-16, 8, 0.8], [-11, 17, 1], [-3, 19, 0.85],
  [7, 18, 1.05], [16, 12, 1], [19, 2, 0.95], [16, -12, 1.15],
  [8, -18, 0.9], [-4, -19, 1.1], [-15, -16, 0.9], [20, 17, 0.72]
].forEach(tree => makeTree(...tree));

const grassMaterials = [mat('#758e5f'), mat('#8fa36a'), mat('#a0a875')];
const grassGeometry = new THREE.ConeGeometry(0.045, 1, 3);
const grassInstances = grassMaterials.map(material => {
  const instances = new THREE.InstancedMesh(grassGeometry, material, 140);
  instances.count = 0;
  scene.add(instances);
  return instances;
});
const grassDummy = new THREE.Object3D();
for (let i = 0; i < 420; i++) {
  const angle = i * 2.39996;
  const radius = 17 + Math.sqrt(i / 420) * 4.7;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const height = 0.38 + (i % 5) * 0.035;
  const instances = grassInstances[i % grassInstances.length];
  grassDummy.position.set(x, height / 2, z);
  grassDummy.rotation.set(0, 0, Math.sin(i) * 0.18);
  grassDummy.scale.set(1, height, 1);
  grassDummy.updateMatrix();
  instances.setMatrixAt(instances.count++, grassDummy.matrix);
}
grassInstances.forEach(instances => { instances.instanceMatrix.needsUpdate = true; });

function makeFlowers(x, z, count = 4) {
  const patch = new THREE.Group();
  patch.position.set(x, 0, z);
  for (let i = 0; i < count; i++) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.38, 5), mat('#71875a'));
    stem.position.set((i - count / 2) * 0.17, 0.19, Math.sin(i * 3) * 0.17);
    patch.add(stem);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), mat(i % 2 ? '#f0d7a2' : '#e8d2c2'));
    bloom.position.set(stem.position.x, 0.41, stem.position.z);
    patch.add(bloom);
  }
  scene.add(patch);
}

[[-19, 3], [-12, 20], [3, 20], [18, 10], [20, -8], [5, -20], [-10, -18]].forEach(([x, z]) => makeFlowers(x, z));

const bench = new THREE.Group();
const wood = mat('#85694d');
const iron = mat('#454d3e');
function benchPart(geometry, material, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  bench.add(mesh);
}
for (let i = 0; i < 4; i++) {
  benchPart(new THREE.BoxGeometry(2.4, 0.13, 0.2), wood, [0, 0.78, (i - 1.5) * 0.22]);
}
for (const x of [-0.88, 0.88]) {
  benchPart(new THREE.BoxGeometry(0.12, 0.77, 0.14), iron, [x, 0.43, 0]);
  benchPart(new THREE.BoxGeometry(0.1, 0.76, 0.14), iron, [x, 1.19, -0.37], [-0.12, 0, 0]);
}
for (let i = 0; i < 3; i++) {
  benchPart(new THREE.BoxGeometry(2.4, 0.12, 0.2), wood, [0, 1.16 + i * 0.23, -0.39], [-0.12, 0, 0]);
}
bench.position.set(0, 0, 0.05);
bench.rotation.y = Math.PI;
bench.scale.y = 0.65;
scene.add(bench);

const visitor = new THREE.Group();
const body = new THREE.Group();
visitor.add(body);
const coat = mat('#a55f42');
const trousers = mat('#394c43');
const skin = mat('#d5a77e');
const dark = mat('#41372e');
const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.53, 4, 8), coat);
bodyMesh.position.y = 1.08;
body.add(bodyMesh);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
head.position.y = 1.69;
body.add(head);
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), dark);
hair.position.y = 1.74;
body.add(hair);
const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.045, 16), mat('#817654'));
hatBrim.position.y = 1.89;
body.add(hatBrim);
const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.2, 12), mat('#817654'));
hatTop.position.y = 2;
body.add(hatTop);

function makeLimb(length, radius, material) {
  const pivot = new THREE.Group();
  const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 3, 7), material);
  limb.position.y = -length / 2;
  pivot.add(limb);
  return pivot;
}

const legs = [];
for (const x of [-0.14, 0.14]) {
  const leg = makeLimb(0.25, 0.105, trousers);
  const shin = makeLimb(0.45, 0.09, trousers);
  shin.position.y = -0.25;
  leg.add(shin);
  leg.position.set(x, 0.73, 0);
  body.add(leg);
  legs.push({ leg, shin });
}
const arms = [];
for (const x of [-0.32, 0.32]) {
  const arm = makeLimb(0.62, 0.085, coat);
  arm.position.set(x, 1.35, 0);
  body.add(arm);
  arms.push(arm);
}
visitor.position.y = 0;
scene.add(visitor);

const pathPoint = new THREE.Vector3();
const pathTangent = new THREE.Vector3();
let progress = 0;
let walkDirection = 0;
let seatProgress = 0;
let walkClock = 0;
let dragging = false;
let previousX = 0;
let previousY = 0;
let azimuth = 0.7;
let polar = 0.86;
let cameraDistance = 36;

function updateCamera() {
  const horizontal = cameraDistance * Math.sin(polar);
  camera.position.set(
    cameraTarget.x + horizontal * Math.sin(azimuth),
    cameraTarget.y + cameraDistance * Math.cos(polar),
    cameraTarget.z + horizontal * Math.cos(azimuth)
  );
  camera.lookAt(cameraTarget);
}
updateCamera();

function putVisitor(t, moving) {
  pathCurve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), pathPoint);
  pathCurve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1), pathTangent);
  visitor.position.set(pathPoint.x, 0, pathPoint.z);
  const pathAngle = Math.atan2(pathTangent.x, pathTangent.z) + (walkDirection < 0 ? Math.PI : 0);
  visitor.rotation.y = pathAngle;
  const approach = THREE.MathUtils.smoothstep(seatProgress, 0, 0.5);
  const sitting = THREE.MathUtils.smoothstep(seatProgress, 0.5, 1);
  if (seatProgress > 0) {
    visitor.position.x = THREE.MathUtils.lerp(pathPoint.x, bench.position.x, approach);
    visitor.position.z = THREE.MathUtils.lerp(pathPoint.z, bench.position.z - 0.6, approach);
    visitor.position.z = THREE.MathUtils.lerp(visitor.position.z, bench.position.z, sitting);
    const turn = Math.atan2(Math.sin(Math.PI - pathAngle), Math.cos(Math.PI - pathAngle));
    visitor.rotation.y = pathAngle + turn * approach;
  }
  const stride = moving && seatProgress < 0.5 ? Math.sin(walkClock * 8) * 0.58 : 0;
  legs[0].leg.rotation.x = THREE.MathUtils.lerp(stride, -Math.PI / 2, sitting);
  legs[1].leg.rotation.x = THREE.MathUtils.lerp(-stride, -Math.PI / 2, sitting);
  for (const { leg, shin } of legs) {
    leg.position.y = THREE.MathUtils.lerp(0.73, 0.55, sitting);
    shin.rotation.x = sitting * Math.PI / 2;
  }
  arms[0].rotation.x = -stride * 0.65;
  arms[1].rotation.x = stride * 0.65;
  body.position.y = moving && seatProgress < 0.5 ? Math.abs(Math.sin(walkClock * 8)) * 0.035 : 0;
}
putVisitor(progress, false);

const journeyCard = document.querySelector('.journey-card');
const journeyState = document.querySelector('#journey-state');
const journeyTitle = document.querySelector('#journey-title');
const journeyCopy = document.querySelector('#journey-copy');
const walkButton = document.querySelector('#walk-button');
const walkLabel = document.querySelector('#walk-label');
const progressBar = document.querySelector('#progress');

function updateJourneyUI() {
  journeyCard.hidden = walkDirection !== 0;
  progressBar.style.width = `${Math.round(progress * 100)}%`;
  if (progress >= 1) {
    journeyState.textContent = 'AT THE CENTER';
    journeyTitle.innerHTML = 'Stay for<br>a while.';
    journeyCopy.textContent = 'You made it to the bench. When you are ready, follow the very same path back.';
    walkLabel.textContent = 'WALK BACK OUT';
  } else {
    journeyState.textContent = 'AT THE GARDEN GATE';
    journeyTitle.innerHTML = 'A slower way<br>forward.';
    journeyCopy.textContent = 'Follow the stones as they circle inward. The bench is waiting in the middle.';
    walkLabel.textContent = 'BEGIN THE WALK';
  }
}

walkButton.addEventListener('click', () => {
  walkDirection = progress >= 1 ? -1 : 1;
  updateJourneyUI();
});

document.querySelector('#view-reset').addEventListener('click', () => {
  azimuth = 0.7;
  polar = 0.86;
  cameraDistance = window.innerWidth < 480 ? 45 : 36;
  updateCamera();
});

renderer.domElement.addEventListener('pointerdown', event => {
  dragging = true;
  previousX = event.clientX;
  previousY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!dragging) return;
  azimuth -= (event.clientX - previousX) * 0.006;
  polar = THREE.MathUtils.clamp(polar + (event.clientY - previousY) * 0.004, 0.42, 1.35);
  previousX = event.clientX;
  previousY = event.clientY;
  updateCamera();
});
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
renderer.domElement.addEventListener('wheel', event => {
  event.preventDefault();
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * 0.025, 24, 57);
  updateCamera();
}, { passive: false });

function resize() {
  const width = sceneEl.clientWidth;
  const height = sceneEl.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = width < 480 ? 48 : 42;
  cameraDistance = width < 480 ? 45 : 36;
  camera.updateProjectionMatrix();
  updateCamera();
}
window.addEventListener('resize', resize);
resize();
updateJourneyUI();

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (walkDirection !== 0) {
    walkClock += delta;
    if (walkDirection > 0 && progress === 1) {
      seatProgress = Math.min(1, seatProgress + delta / 2.4);
    } else if (walkDirection < 0 && seatProgress > 0) {
      seatProgress = Math.max(0, seatProgress - delta / 2.4);
    } else {
      progress = THREE.MathUtils.clamp(progress + walkDirection * delta * 0.055, 0, 1);
    }
    if ((progress === 0 && walkDirection < 0) || (seatProgress === 1 && walkDirection > 0)) {
      walkDirection = 0;
      updateJourneyUI();
    }
    const progressWidth = `${Math.round(progress * 100)}%`;
    if (progressBar.style.width !== progressWidth) progressBar.style.width = progressWidth;
  }
  putVisitor(progress, walkDirection !== 0);
  renderer.render(scene, camera);
}
animate();
