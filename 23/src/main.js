import * as THREE from '../vendor/three.module.min.js';
import { buildMountain } from './geology.js';
import { buildMagma } from './magma.js';
import { wireSound } from './sound.js';

const stage = document.querySelector('.stage');
const sceneHost = document.getElementById('scene');
const intro = document.querySelector('.intro');
const chamber = document.getElementById('chamber');
const find = document.getElementById('find');
const replay = document.getElementById('replay');
const instruction = document.getElementById('instruction');
const status = document.getElementById('status');
const steps = [...document.querySelectorAll('.step')];
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const startingPose = { yaw: .53, tilt: .28 };
const minTilt = -.05;
const maxTilt = .69;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
} catch {
  document.getElementById('fallback').hidden = false;
  instruction.hidden = true;
  sceneHost.hidden = true;
}

if (renderer) run(renderer);

function run(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .12, 140);
  const target = new THREE.Vector3(.0, .35, -.48);
  const ray = new THREE.Raycaster();
  const projected = new THREE.Vector3();
  const directions = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const pose = { ...startingPose };
  const desired = { ...startingPose };

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  sceneHost.append(renderer.domElement);

  const sky = new THREE.HemisphereLight('#d8f4ed', '#76705a', 1.63);
  const key = new THREE.DirectionalLight('#fff3dc', 2.36);
  key.position.set(-3, 8, 5);
  const rim = new THREE.DirectionalLight('#8cd8cb', 1.46);
  rim.position.set(4, 4, -7);
  const fill = new THREE.DirectionalLight('#9aa9a0', .77);
  fill.position.set(5, 0, 6);
  scene.add(sky, key, rim, fill);

  const terrain = buildMountain(scene);
  scene.updateMatrixWorld(true);
  const magma = buildMagma(scene);
  const thump = wireSound(document.getElementById('sound'), document.getElementById('sound-state'));
  document.getElementById('foot').hidden = false;

  let width = 0;
  let height = 0;
  let distance = 16;
  let introBounds;
  let active = 0;
  let transition = null;
  let flight = null;
  let gesture = null;
  let restoreChamberFocus = false;
  let reduced = motionQuery.matches;
  let needsRender = true;
  let last = performance.now();
  let mountedAt = last / 1000;

  function placeCamera({ yaw, tilt }) {
    const radius = distance * Math.cos(tilt);
    camera.position.set(
      target.x + radius * Math.sin(yaw),
      target.y + distance * Math.sin(tilt),
      target.z + radius * Math.cos(yaw),
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function resize() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const portrait = aspect < .98;
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    distance = Math.max(15.2, 10.8 / (2 * tangent * aspect * (portrait ? .90 : .78)) + 1.25);
    camera.aspect = aspect;
    const shiftX = width > 1050 && aspect > 1.44 ? -.059 * width : 0;
    const shiftY = height * (portrait ? -.006 : -.022);
    camera.setViewOffset(width, height, shiftX, shiftY, width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 620 ? 1.7 : 1.65));
    renderer.setSize(width, height, false);
    introBounds = { x: intro.offsetLeft, y: intro.offsetTop, w: intro.offsetWidth, h: intro.offsetHeight };
    placeCamera(pose);
    positionControl();
    needsRender = true;
  }

  function chamberPlacement(pocket) {
    projected.copy(pocket.anchor).project(camera);
    const x = (projected.x * .5 + .5) * width;
    const y = (.5 - projected.y * .5) * height;
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    projected.copy(pocket.anchor).addScaledVector(cameraRight, pocket.rx * .84).project(camera);
    const rx = Math.abs((projected.x * .5 + .5) * width - x);
    const diameter = THREE.MathUtils.clamp(rx * 2 + 19, 48, 94);
    const margin = diameter * .5 + 9;
    if (projected.z > 1 || projected.z < -1 || x < margin || x > width - margin ||
        y < margin || y > height - margin) return null;
    const { x: ix, y: iy, w, h } = introBounds;
    if (x + margin > ix && x - margin < ix + w && y + margin > iy && y - margin < iy + h) return null;

    directions.subVectors(pocket.anchor, camera.position);
    ray.far = directions.length() - .025;
    ray.set(camera.position, directions.normalize());
    return ray.intersectObjects(terrain, false).length ? null : { x, y, diameter };
  }

  function positionControl() {
    if (!introBounds || active === 3 || transition) {
      chamber.hidden = true;
      find.hidden = true;
      return;
    }
    const placement = chamberPlacement(magma.pockets[active]);
    const previousFocus = document.activeElement;
    if (placement) {
      chamber.style.left = `${placement.x}px`;
      chamber.style.top = `${placement.y}px`;
      chamber.style.setProperty('--diameter', `${placement.diameter}px`);
      chamber.hidden = false;
      if (previousFocus === find || (restoreChamberFocus && previousFocus === sceneHost)) {
        chamber.focus({ preventScroll: true });
      }
      restoreChamberFocus = false;
      find.hidden = true;
    } else {
      find.hidden = false;
      if (previousFocus === chamber) {
        find.focus({ preventScroll: true });
      }
      chamber.hidden = true;
    }
  }

  function setControls() {
    const lit = active + (transition ? 1 : 0);
    for (const [index, step] of steps.entries()) {
      const state = index < lit ? 'lit' : (index === active && !transition ? 'ready' : 'hidden');
      step.dataset.state = state;
      step.setAttribute('aria-label', `${magma.pockets[index].name}, ${state}`);
    }
    const pocket = magma.pockets[active];
    if (pocket) chamber.setAttribute('aria-label', `Activate ${pocket.name.toLowerCase()}`);
    replay.hidden = active < 3;
    instruction.textContent = active < 3 ? 'Tap the glow.' : 'The mountain is awake.';
    positionControl();
  }

  function activate(keyboard) {
    if (active === 3 || transition || chamber.hidden) return;
    transition = { step: active, start: performance.now() / 1000 };
    restoreChamberFocus = keyboard;
    if (document.activeElement === chamber || document.activeElement === find) sceneHost.focus({ preventScroll: true });
    thump(active);
    setControls();
    needsRender = true;
  }

  function completeTransition() {
    transition = null;
    active++;
    needsRender = true;
    if (active === 3) {
      status.textContent = 'The mountain is awake. Magma from the base joined the rising flow and reached just beneath the summit. Orbit to explore, or replay.';
    } else {
      const rising = active === 1 ? 'Magma entered the lower fractures.' : 'Magma reached the upper fractures.';
      status.textContent = `${rising} ${magma.pockets[active].name} revealed. Activate the glow to continue.`;
    }
    setControls();
    if (restoreChamberFocus && document.activeElement === sceneHost) {
      (active === 3 ? replay : chamber.hidden ? find : chamber).focus({ preventScroll: true });
      restoreChamberFocus = false;
    }
  }

  function findGlow() {
    if (transition || active === 3) return;
    const pocket = magma.pockets[active];
    const home = [
      startingPose, { yaw: 0, tilt: .095 }, { yaw: -.23, tilt: .13 },
      { yaw: .16, tilt: .05 }, { yaw: -.38, tilt: .05 }, { yaw: 0, tilt: .31 },
    ].find(candidate => {
      placeCamera(candidate);
      return chamberPlacement(pocket);
    }) || startingPose;
    placeCamera(pose);
    const yaw = pose.yaw + THREE.MathUtils.euclideanModulo(home.yaw - pose.yaw + Math.PI, 2 * Math.PI) - Math.PI;
    desired.yaw = yaw;
    desired.tilt = home.tilt;
    if (reduced) {
      Object.assign(pose, desired);
      placeCamera(pose);
      positionControl();
    } else {
      flight = { start: performance.now(), from: { ...pose }, to: { ...desired } };
    }
    needsRender = true;
  }

  find.addEventListener('click', findGlow);
  chamber.addEventListener('click', event => {
    if (event.detail === 0) activate(true);
  });
  replay.addEventListener('click', event => {
    const keyboard = event.detail === 0;
    active = 0;
    mountedAt = performance.now() / 1000;
    restoreChamberFocus = keyboard;
    if (keyboard) sceneHost.focus({ preventScroll: true });
    status.textContent = 'Replay started. First chamber ready.';
    setControls();
    if (keyboard && chamber.hidden) find.focus({ preventScroll: true });
    needsRender = true;
  });

  function orbit(yaw, tilt) {
    if (flight) Object.assign(desired, pose);
    flight = null;
    desired.yaw += yaw;
    desired.tilt = THREE.MathUtils.clamp(desired.tilt + tilt, minTilt, maxTilt);
    needsRender = true;
  }

  stage.addEventListener('keydown', event => {
    if (event.target !== sceneHost && event.target !== chamber) return;
    const key = {
      ArrowLeft: [-.16, 0], ArrowRight: [.16, 0],
      ArrowUp: [0, .11], ArrowDown: [0, -.11],
    }[event.key];
    if (!key) return;
    event.preventDefault();
    orbit(...key);
  });

  stage.addEventListener('pointerdown', event => {
    const fromChamber = event.target === chamber;
    if (gesture || event.button !== 0 || (!fromChamber && !sceneHost.contains(event.target))) return;
    gesture = {
      id: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY,
      dragged: false, fromChamber,
    };
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    const { clientX: x, clientY: y } = event;
    if (!gesture.dragged && Math.hypot(x - gesture.startX, y - gesture.startY) < 8) return;
    gesture.dragged = true;
    sceneHost.classList.add('dragging');
    chamber.classList.add('dragging');
    orbit((gesture.x - x) * .0085, (y - gesture.y) * .0054);
    gesture.x = x;
    gesture.y = y;
  });

  function endGesture(event) {
    if (gesture?.id !== event.pointerId) return;
    const tap = event.type === 'pointerup' && gesture.fromChamber && !gesture.dragged &&
      Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 8;
    gesture = null;
    sceneHost.classList.remove('dragging');
    chamber.classList.remove('dragging');
    if (tap) activate(false);
  }

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, endGesture);

  motionQuery.addEventListener('change', event => {
    reduced = event.matches;
    if (reduced) flight = null;
    needsRender = true;
  });

  function frame(ms) {
    requestAnimationFrame(frame);
    const delta = Math.min(ms - last, 64);
    last = ms;
    const time = ms / 1000;
    if (transition) {
      const duration = reduced ? (active === 2 ? 1.14 : .76) : magma.durations[active];
      if (time - transition.start >= duration) completeTransition();
    }
    const cameraMoving = pose.yaw !== desired.yaw || pose.tilt !== desired.tilt;
    if (flight) {
      const t = THREE.MathUtils.smoothstep(ms - flight.start, 0, 480);
      pose.yaw = THREE.MathUtils.lerp(flight.from.yaw, flight.to.yaw, t);
      pose.tilt = THREE.MathUtils.lerp(flight.from.tilt, flight.to.tilt, t);
      if (t >= 1) {
        Object.assign(pose, desired);
        flight = null;
      }
    } else if (cameraMoving) {
      const mix = reduced ? 1 : 1 - Math.exp(-delta / 46);
      for (const axis of ['yaw', 'tilt']) {
        pose[axis] = Math.abs(pose[axis] - desired[axis]) < .0003 ?
          desired[axis] : THREE.MathUtils.lerp(pose[axis], desired[axis], mix);
      }
    }
    if (cameraMoving || flight) {
      placeCamera(pose);
      positionControl();
    }
    if (!reduced || needsRender || transition || cameraMoving) {
      const visualTransition = transition && { ...transition, start: transition.start - mountedAt };
      magma.update({ time: time - mountedAt, active, transition: visualTransition, reduced });
      renderer.render(scene, camera);
      needsRender = false;
    }
  }

  resize();
  setControls();
  new ResizeObserver(resize).observe(stage);
  requestAnimationFrame(frame);
}
