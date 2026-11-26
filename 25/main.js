import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createDesert } from './desert.js';
import { createVeil } from './veil.js';

const openingPrompt = 'Tap or click the veil to reveal the Three Gossips.';
const sceneRegion = document.querySelector('#scene');
const fallback = document.querySelector('#fallback');
const sceneDescription = document.querySelector('#scene-description');
const controlsRegion = document.querySelector('#controls');
const action = document.querySelector('#veil-action');
const announcement = document.querySelector('#announcement');

function showScene(visible) {
  fallback.hidden = visible;
  sceneRegion.hidden = !visible;
  sceneDescription.hidden = !visible;
  controlsRegion.hidden = !visible;
}

function startExperience() {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('webgl2', {alpha: false, antialias: true});
  if (!context) return;

  const renderer = new THREE.WebGLRenderer({canvas, context});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = createDesert();
  const camera = new THREE.PerspectiveCamera(37, 1, .15, 430);
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(-.20, 4.94, 0);
  orbit.enablePan = false;
  orbit.rotateSpeed = .65;
  orbit.zoomSpeed = .8;
  orbit.minPolarAngle = .22;
  orbit.maxPolarAngle = 1.86;
  orbit.minDistance = 11.8;
  orbit.maxDistance = 100;
  orbit.touches.ONE = THREE.TOUCH.ROTATE;
  orbit.touches.TWO = THREE.TOUCH.DOLLY_PAN;

  const veil = createVeil(renderer);
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const offset = new THREE.Vector3();
  const angles = new THREE.Spherical();
  const initialDirection = new THREE.Vector3(.014, -.080, 1).normalize();
  const pointers = new Set();

  let frame = 0;
  let mode = 'veiled';
  let revealStart = 0;
  let driftLast = null;
  let windTime = 0;
  let contextLost = false;
  let tap = null;
  let framingDistance = 0;
  let ready = false;
  let clampingCamera = false;

  sceneRegion.append(canvas);
  sceneRegion.dataset.veiled = '';

  function requestFrame() {
    if (!frame && !contextLost) frame = requestAnimationFrame(draw);
  }

  function updateCamera() {
    if (clampingCamera) return;
    const lowestY = 1.35;
    if (camera.position.y < lowestY) {
      offset.copy(camera.position).sub(orbit.target);
      const radius = offset.length();
      const y = lowestY - orbit.target.y;
      const horizontal = Math.hypot(offset.x, offset.z);
      const scale = Math.sqrt(radius * radius - y * y) / horizontal;
      camera.position.set(orbit.target.x + offset.x * scale, lowestY,
        orbit.target.z + offset.z * scale);
      clampingCamera = true;
      orbit.update();
      clampingCamera = false;
    }
    requestFrame();
  }

  function resize() {
    const width = Math.max(1, sceneRegion.clientWidth);
    const height = Math.max(1, sceneRegion.clientHeight);
    camera.aspect = width / height;
    const verticalFov = Math.max(Math.tan(THREE.MathUtils.degToRad(37 / 2)), .108 / camera.aspect);
    const horizontalFov = verticalFov * camera.aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(verticalFov));

    // Fit the rock silhouette and reserve a little space for the title and action.
    const nextDistance = Math.max(7.35 / verticalFov, 8.68 / horizontalFov) + 2.1;
    const direction = framingDistance ? offset.copy(camera.position).sub(orbit.target) : initialDirection;
    const distance = framingDistance ? direction.length() * nextDistance / framingDistance : nextDistance;
    framingDistance = nextDistance;
    orbit.maxDistance = THREE.MathUtils.clamp(nextDistance * 1.55, 64, 100);
    camera.position.copy(orbit.target).addScaledVector(direction.normalize(),
      THREE.MathUtils.clamp(distance, orbit.minDistance, orbit.maxDistance));

    const resolution = Math.min(devicePixelRatio || 1, 1.5, 1600 / Math.max(width, height));
    renderer.setPixelRatio(resolution);
    renderer.setSize(width, height, false);
    veil.resize(width, height);
    camera.updateProjectionMatrix();
    orbit.update();
    requestFrame();
  }

  function finishReveal() {
    mode = 'open';
    driftLast = null;
    delete sceneRegion.dataset.veiled;
    action.removeAttribute('aria-disabled');
    action.textContent = 'Restore veil';
    announcement.textContent = 'The veil has lifted. The Three Gossips are revealed.';
    requestFrame();
  }

  function reveal(point) {
    if (mode !== 'veiled') return;
    if (motionPreference.matches) {
      finishReveal();
      return;
    }
    mode = 'clearing';
    revealStart = performance.now();
    veil.start(point);
    action.setAttribute('aria-disabled', 'true');
    action.textContent = 'The veil is lifting…';
    requestFrame();
  }

  function restore() {
    mode = 'veiled';
    driftLast = null;
    sceneRegion.dataset.veiled = '';
    action.textContent = openingPrompt;
    announcement.textContent = 'Veil restored. The Three Gossips are hidden.';
    requestFrame();
  }

  function draw(now) {
    frame = 0;
    if (contextLost) return;

    if (mode === 'clearing' && (motionPreference.matches || now - revealStart >= veil.duration)) {
      finishReveal();
    }
    if (mode === 'open') {
      renderer.render(scene, camera);
      return;
    }

    if (!motionPreference.matches) {
      if (driftLast !== null) windTime += Math.min(.15, (now - driftLast) / 1000);
      driftLast = now;
    } else {
      driftLast = null;
    }
    const progress = mode === 'clearing' ? Math.max(0, (now - revealStart) / veil.duration) : 0;
    veil.render(scene, camera, windTime, progress);
    if (!motionPreference.matches) requestFrame();
  }

  function pointAt(event) {
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) return null;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    return veil.hit(raycaster.ray);
  }

  orbit.addEventListener('change', updateCamera);
  canvas.addEventListener('pointerdown', (event) => {
    pointers.add(event.pointerId);
    tap = pointers.size === 1 && event.button === 0 && mode === 'veiled'
      ? {id: event.pointerId, x: event.clientX, y: event.clientY}
      : null;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 7) {
      tap = null;
    }
  });
  canvas.addEventListener('pointerup', (event) => {
    pointers.delete(event.pointerId);
    if (tap?.id === event.pointerId &&
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 7) {
      const point = pointAt(event);
      if (point) reveal(point);
    }
    tap = null;
  });
  canvas.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    tap = null;
  });

  sceneRegion.addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '−'];
    if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    angles.setFromVector3(offset.copy(camera.position).sub(orbit.target));
    const step = .10;
    switch (event.key) {
      case 'ArrowLeft': angles.theta += step; break;
      case 'ArrowRight': angles.theta -= step; break;
      case 'ArrowUp': angles.phi -= step; break;
      case 'ArrowDown': angles.phi += step; break;
      case '+':
      case '=': angles.radius *= .90; break;
      case '-':
      case '−': angles.radius /= .90; break;
    }
    angles.radius = THREE.MathUtils.clamp(angles.radius, orbit.minDistance, orbit.maxDistance);
    angles.phi = THREE.MathUtils.clamp(angles.phi, orbit.minPolarAngle, orbit.maxPolarAngle);
    camera.position.copy(orbit.target).add(offset.setFromSpherical(angles));
    orbit.update();
    requestFrame();
  });

  action.addEventListener('click', () => {
    if (mode === 'open') restore();
    else if (mode === 'veiled') {
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointer.set(0, 0), camera);
      reveal(veil.hit(raycaster.ray));
    }
  });
  motionPreference.addEventListener('change', requestFrame);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    showScene(false);
    announcement.textContent = 'The 3D view is unavailable. The reference photograph is displayed.';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    renderer.shadowMap.needsUpdate = true;
    showScene(true);
    resize();
  });

  showScene(true);
  resize();
  const observer = new ResizeObserver(() => {
    if (ready && !contextLost) resize();
  });
  observer.observe(sceneRegion);
  ready = true;
}

try {
  startExperience();
} catch (error) {
  showScene(false);
  console.error('The 3D view could not start.', error);
}
