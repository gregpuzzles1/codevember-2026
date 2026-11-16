(function () {
  const container = document.querySelector('.canvas');
  const error = document.querySelector('.scene-error');

  if (!window.THREE) {
    error.textContent = 'The 3D scene could not load. Showing the illustrated version instead.';
    error.hidden = false;
    console.error('Three.js could not be loaded.');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (cause) {
    error.textContent = '3D is unavailable on this device. Showing the illustrated version instead.';
    error.hidden = false;
    console.error('Unable to initialize the 3D scene:', cause);
    return;
  }

  renderer.domElement.className = 'three-scene';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.insertBefore(renderer.domElement, container.querySelector('.center-button'));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
  camera.position.set(0, 0, 15);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7f9e71, 2));
  const light = new THREE.DirectionalLight(0xfff9df, 2.2);
  light.position.set(-4, 6, 8);
  scene.add(light);

  const green = new THREE.MeshStandardMaterial({ color: 0xa9d084, roughness: 0.52 });
  const speck = new THREE.MeshStandardMaterial({ color: 0x6da364, roughness: 0.8 });
  const thread = new THREE.MeshStandardMaterial({ color: 0x84b17d, roughness: 0.8 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1edce, roughness: 0.85 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xc9785d, roughness: 0.65 });
  const capSpotMaterials = [0xf8e8c1, 0xe9c58f, 0xd8d5a5, 0xf1c5a8].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  );
  const capSpotGeometry = new THREE.CircleGeometry(1, 24);
  const sphere = new THREE.SphereGeometry(1, 40, 28);
  const spotGeometry = new THREE.SphereGeometry(1, 10, 8);

  function makeSpore(radius) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(sphere, green);
    body.scale.setScalar(radius);
    group.add(body);
    for (let i = 0; i < 24; i++) {
      const y = 1 - (i + 0.5) * 2 / 24;
      const ring = Math.sqrt(1 - y * y);
      const angle = i * 2.399963;
      const spot = new THREE.Mesh(spotGeometry, speck);
      spot.position.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring).multiplyScalar(radius * 0.99);
      spot.scale.setScalar(radius * (0.035 + (i % 3) * 0.01));
      group.add(spot);
    }
    return group;
  }

  function addTube(group, points, radius) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 6, false), thread));
  }

  function addNetwork(group, y, spread) {
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      addTube(group, [[0, y, 0], [x * spread * 0.45, y - 0.08, z * spread * 0.45], [x * spread, y + 0.05, z * spread]], 0.025);
      addTube(group, [[x * spread * 0.55, y - 0.05, z * spread * 0.55], [x * spread * 0.8 - z * 0.25, y + 0.12, z * spread * 0.8 + x * 0.25]], 0.015);
    }
  }

  function makeMushroom(mature) {
    const group = new THREE.Group();
    addNetwork(group, -0.95, 1.15);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(mature ? 0.23 : 0.18, 0.3, mature ? 1.45 : 0.72, 32), cream);
    stem.position.y = mature ? -0.2 : -0.57;
    group.add(stem);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    for (let i = 0; i < 30; i++) {
      const y = 0.12 + ((i + 0.5) / 30) * 0.82;
      const ring = Math.sqrt(1 - y * y);
      const angle = i * 2.399963;
      const normal = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
      const spot = new THREE.Mesh(capSpotGeometry, capSpotMaterials[i % capSpotMaterials.length]);
      spot.position.copy(normal).multiplyScalar(1.012);
      spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      spot.scale.setScalar(0.055 + (i % 4) * 0.014);
      top.add(spot);
    }
    top.scale.set(mature ? 1.03 : 0.57, mature ? 0.58 : 0.55, mature ? 1.03 : 0.57);
    top.position.y = mature ? 0.5 : -0.2;
    group.add(top);
    const underside = new THREE.Mesh(new THREE.CylinderGeometry(mature ? 1.01 : 0.56, mature ? 1.01 : 0.56, 0.08, 40), cream);
    underside.position.y = top.position.y;
    group.add(underside);
    return group;
  }

  const stages = [];
  stages.push(makeSpore(1.05));
  const germination = new THREE.Group();
  const germSpore = makeSpore(0.82);
  germSpore.position.set(-0.2, 0.22, 0);
  germination.add(germSpore);
  addTube(germination, [[0.35, -0.35, 0], [0.7, -0.75, 0.1], [1.2, -0.8, 0.2], [1.35, -0.5, 0.3]], 0.045);
  addTube(germination, [[0.8, -0.76, 0.1], [0.95, -1.08, 0.2], [1.15, -1.16, 0.3]], 0.025);
  stages.push(germination);
  const mycelium = new THREE.Group();
  addNetwork(mycelium, -0.4, 1.4);
  addNetwork(mycelium, 0.05, 0.85);
  const seed = makeSpore(0.35);
  seed.position.y = 0.3;
  mycelium.add(seed);
  stages.push(mycelium, makeMushroom(false), makeMushroom(true));

  const centerpiece = new THREE.Group();
  scene.add(centerpiece);
  stages.forEach((stage, index) => {
    stage.scale.setScalar(index === 0 ? 1 : 0.001);
    stage.visible = index === 0;
    centerpiece.add(stage);
  });
  const surrounding = [
    { x: -0.31, y: 0.26, radius: 0.34 },
    { x: 0.31, y: 0.27, radius: 0.25 },
    { x: -0.32, y: -0.27, radius: 0.25 },
    { x: 0.31, y: -0.27, radius: 0.34 }
  ].map(item => {
    const object = makeSpore(item.radius);
    scene.add(object);
    return { ...item, object };
  });

  let targetStage = 0;
  let pointerX = 0;
  let pointerY = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const viewHeight = 7.2;
    const viewWidth = viewHeight * width / height;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    centerpiece.scale.setScalar(Math.min(1, viewWidth / 7.2));
    surrounding.forEach(item => item.object.position.set(item.x * viewWidth, item.y * viewHeight, 0));
  }

  container.addEventListener('pointermove', event => {
    const bounds = container.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
  });
  container.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
  new ResizeObserver(resize).observe(container);
  resize();
  window.sporeScene = { setStage(index) { targetStage = index; } };
  container.classList.add('three-ready');

  function animate(time) {
    requestAnimationFrame(animate);
    const motion = reducedMotion.matches ? 0 : time * 0.001;
    centerpiece.rotation.y += ((reducedMotion.matches ? 0 : pointerX * 0.5 + Math.sin(motion * 0.35) * 0.12) - centerpiece.rotation.y) * 0.05;
    centerpiece.rotation.x += ((reducedMotion.matches ? 0 : pointerY * 0.25) - centerpiece.rotation.x) * 0.05;
    stages.forEach((stage, index) => {
      const target = index === targetStage ? 1 : 0;
      const scale = reducedMotion.matches ? target : stage.scale.x + (target - stage.scale.x) * 0.08;
      stage.scale.setScalar(Math.max(scale, 0.001));
      stage.visible = scale > 0.01;
    });
    surrounding.forEach((item, index) => {
      item.object.position.y = item.y * (camera.top - camera.bottom) + (reducedMotion.matches ? 0 : Math.sin(motion + index * 1.7) * 0.1);
      item.object.rotation.y = motion * 0.2 + index;
    });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
})();
