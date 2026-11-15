import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const container = document.querySelector('#scene');
const heatInput = document.querySelector('#heat');
const heatValue = document.querySelector('#heat-value');
const pauseButton = document.querySelector('#pause');
const pauseLabel = document.querySelector('#pause-label');
const pauseIcon = document.querySelector('#pause-icon');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let renderer;

try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
  console.error('Unable to initialize the desert scene:', error);
  document.querySelector('#scene-error').hidden = false;
}

if (renderer) {
  container.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 8, 24);
  camera.lookAt(0, 2, -8);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          vec3 horizon = vec3(1.0, 0.70, 0.48);
          vec3 zenith = vec3(0.65, 0.32, 0.34);
          vec3 color = mix(horizon, zenith, smoothstep(-0.15, 0.8, h));
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    })
  );
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(5.1, 64),
    new THREE.MeshBasicMaterial({ color: '#ffe2a5' })
  );
  sun.position.set(6, 12, -48);
  sun.lookAt(camera.position);
  scene.add(sun);

  scene.add(new THREE.HemisphereLight('#ffe4bd', '#a7654b', 1.1));
  const sunlight = new THREE.DirectionalLight('#fff0c7', 1.2);
  sunlight.position.set(-8, 18, 8);
  scene.add(sunlight);

  const material = color => new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 140), new THREE.ShaderMaterial({
    uniforms: {
      lightSand: { value: new THREE.Color('#edb27e') },
      darkSand: { value: new THREE.Color('#cf815d') }
    },
    vertexShader: `varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec3 vWorld;
      uniform vec3 lightSand;
      uniform vec3 darkSand;
      void main() {
        float dune = sin(vWorld.z * 0.19 + sin(vWorld.x * 0.08) * 1.6);
        float detail = sin(vWorld.z * 2.1 + sin(vWorld.x * 0.12) * 2.0) * 0.012;
        vec3 color = mix(darkSand, lightSand, smoothstep(-0.9, 0.9, dune) * 0.65 + 0.15) + detail;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.08, -25);
  scene.add(ground);

  function dune(z, base, height, color, phase) {
    const shape = new THREE.Shape();
    shape.moveTo(-80, -8);
    for (let x = -80; x <= 80; x += 2) {
      const ridge = base + height * (0.45 + 0.3 * Math.sin(x * 0.075 + phase) + 0.25 * Math.sin(x * 0.14 - phase));
      shape.lineTo(x, ridge);
    }
    shape.lineTo(80, -8);
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mesh.position.z = z;
    scene.add(mesh);
  }
  dune(-42, 0.3, 5.2, '#c77a5b', 1.4);
  dune(-34, -0.5, 4.7, '#db9068', 3.5);
  dune(-26, -1.5, 4.3, '#e8a474', 0.6);

  function ellipse(x, y, z, rx, rz, color) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 80), material(color));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.set(rx, rz, 1);
    scene.add(mesh);
    return mesh;
  }

  ellipse(3, 0.01, -8, 7.3, 3.3, '#f4c18b');
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0.65 } },
    vertexShader: `varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec2 vUv;
      uniform float uTime;
      uniform float uHeat;
      void main() {
        float ripple = sin(vUv.y * 100.0 + sin(vUv.x * 17.0 + uTime * 0.4) * 2.0 - uTime * 1.5);
        float glint = smoothstep(0.75, 0.98, ripple) * (0.12 + uHeat * 0.12);
        vec3 color = mix(vec3(0.20, 0.48, 0.45), vec3(0.49, 0.71, 0.62), vUv.y * 0.65);
        color += glint * vec3(1.0, 0.85, 0.60);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 80), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(3, 0.025, -8);
  water.scale.set(6.7, 2.8, 1);
  scene.add(water);
  ellipse(3.1, 0.04, -8.8, 3.5, 1.2, '#d7b076');

  const trunkMaterial = material('#775347');
  const leafMaterials = ['#496858', '#587661', '#71846a', '#405f53'].map(material);
  function palm(x, z, size, lean, rotation) {
    const group = new THREE.Group();
    group.position.set(x, 0.05, z);
    group.rotation.y = rotation;
    group.scale.setScalar(size);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * 0.15, 1.2, 0),
      new THREE.Vector3(lean * 0.55, 2.8, 0),
      new THREE.Vector3(lean, 4.4, 0)
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.14, 7, false), trunkMaterial));
    const crown = new THREE.Group();
    crown.position.set(lean, 4.4, 0);
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      const length = 2.0 + (i % 3) * 0.22;
      const positions = [];
      const indices = [];
      for (let j = 0; j <= 12; j++) {
        const t = j / 12;
        const width = Math.sin(Math.PI * t) * 0.29;
        const distance = length * t;
        const y = 0.25 * Math.sin(t * Math.PI) - 0.72 * t * t;
        positions.push(distance, y, -width, distance, y + 0.08 * Math.sin(Math.PI * t), width);
        if (j < 12) {
          const a = j * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const leaf = new THREE.Mesh(geometry, leafMaterials[i % leafMaterials.length]);
      leaf.material.side = THREE.DoubleSide;
      leaf.rotation.y = angle;
      crown.add(leaf);
    }
    group.add(crown);
    scene.add(group);
    return crown;
  }
  const crowns = [
    palm(2.1, -8.8, 1.05, -0.45, 0.2),
    palm(4.0, -9.1, 0.79, 0.5, 1),
    palm(5.0, -8.4, 0.54, 0.25, 2)
  ];

  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const target = new THREE.WebGLRenderTarget(1, 1);
  const landscapeLayout = window.matchMedia('(orientation: landscape) and (max-height: 500px), (orientation: landscape) and (max-width: 1400px)');
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      uTime: { value: 0 },
      uHeat: { value: 0.65 },
      uOasisCenter: { value: new THREE.Vector2() },
      uOasisRadius: { value: new THREE.Vector2() }
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uHeat;
    uniform vec2 uOasisCenter;
    uniform vec2 uOasisRadius;
      varying vec2 vUv;
      void main() {
      float distanceFromOasis = length((vUv - uOasisCenter) / uOasisRadius);
      float haze = 1.0 - smoothstep(0.65, 1.15, distanceFromOasis);
      float wave = sin(vUv.y * 90.0 + uTime * 1.4) + 0.5 * sin(vUv.y * 155.0 - uTime * 1.1 + vUv.x * 8.0);
      vec2 uv = vUv + vec2(wave * 0.006 * haze * uHeat, 0.0);
      gl_FragColor = texture2D(tDiffuse, uv);
        #include <colorspace_fragment>
      }`
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    target.setSize(Math.round(width * renderer.getPixelRatio()), Math.round(height * renderer.getPixelRatio()));
    camera.clearViewOffset();
    if (landscapeLayout.matches) {
      const sceneHeight = parseFloat(getComputedStyle(container.parentElement).paddingTop);
      camera.setViewOffset(width, sceneHeight, 0, 0, width, height);
    } else {
      camera.aspect = width / height;
    }
    camera.fov = width < 700 ? 56 : 42;
    sun.position.x = width < 700 ? 13 : 6;
    sun.lookAt(camera.position);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const center = new THREE.Vector3(3, 2, -8).project(camera);
    const edge = new THREE.Vector3(11, 2, -8).project(camera);
    const top = new THREE.Vector3(3, 5.5, -8).project(camera);
    const bottom = new THREE.Vector3(3, 0, -6).project(camera);
    postMaterial.uniforms.uOasisCenter.value.set(center.x * 0.5 + 0.5, (top.y + bottom.y) * 0.25 + 0.5);
    postMaterial.uniforms.uOasisRadius.value.set(Math.abs(edge.x - center.x) * 0.5, Math.abs(top.y - bottom.y) * 0.5);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(container);
  resize();

  function updatePause() {
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseLabel.textContent = paused ? 'PLAY' : 'PAUSE';
    pauseIcon.textContent = paused ? '▶' : 'Ⅱ';
  }
  updatePause();
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    updatePause();
  });
  heatInput.addEventListener('input', () => {
    const heat = Number(heatInput.value);
    heatValue.value = `${heat}%`;
    waterMaterial.uniforms.uHeat.value = heat / 100;
    postMaterial.uniforms.uHeat.value = heat / 100;
  });

  let time = 0;
  let previous = performance.now();
  function animate(now) {
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (!paused) time += delta;
    waterMaterial.uniforms.uTime.value = time;
    postMaterial.uniforms.uTime.value = time;
    crowns.forEach((crown, i) => { crown.rotation.z = Math.sin(time * 0.65 + i) * 0.025; });
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
