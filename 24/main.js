import * as THREE from './vendor/three.module.min.js';
import { clamp, mix, v } from './geometry.js';
import { habitat, paintCanopy } from './habitat.js';
import { makeAdult, makeEggs } from './robins.js';

const get = (id) => document.getElementById(id);
const canvas = get('scene');
const backdrop = get('canopy');
const experience = get('experience');
const loading = get('loading');
const fallback = get('fallback');
const actions = get('actions');
const toolbar = get('toolbar');
const hatchButton = get('hatch');
const replayButton = get('replay');
const resetButton = get('reset');
const motionButton = get('motion');
const motionLabel = get('motion-label');
const announcement = get('announcement');
const marker = get('egg-marker');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function showAvailable(available) {
  experience.classList.toggle('fallback-active', !available);
  loading.hidden = true;
  fallback.hidden = available;
  actions.hidden = !available;
  toolbar.hidden = !available;
  if (!available) marker.hidden = true;
}

function timeRange(time, start, finish) {
  return clamp((time - start) / (finish - start), 0, 1);
}

function ease(time, start, finish) {
  const t = timeRange(time, start, finish);
  return t * t * (3 - 2 * t);
}

function pulse(time, start, finish) {
  return Math.sin(timeRange(time, start, finish) * Math.PI);
}

function cameraView(width, height) {
  const aspect = width / height;
  const portrait = aspect <= 1;
  const standardFov = 41;
  const { degToRad, radToDeg } = THREE.MathUtils;
  // A short widescreen viewport needs a narrower lens to soften edge distortion.
  const shortLandscape = !portrait && height <= 500;
  const limitedFov = radToDeg(2 * Math.atan(Math.tan(degToRad(31)) / aspect));
  const fov = shortLandscape ? clamp(limitedFov, 22, standardFov) : standardFov;
  const lensScale = Math.tan(degToRad(standardFov / 2)) / Math.tan(degToRad(fov / 2));
  const distance = portrait ? Math.max(7.35, 6.54 / aspect) : Math.max(6.35, 8.04 - aspect * .59);
  return {
    theta: portrait ? .22 : .30,
    latitude: portrait ? .55 : .48,
    fov,
    distance: distance * lensScale,
    minDistance: 4.5 * lensScale,
    maxDistance: Math.max(18, distance * 1.58) * lensScale,
    x: portrait ? -.117 : .113,
    y: portrait ? .04 : .043,
  };
}

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(41, 1, .075, 55);
  const target = v(.17,.40,-.06);
  const { clusters, occluders } = habitat(scene);
  const adult = makeAdult(scene);
  const egg = makeEggs(scene);

  scene.add(new THREE.HemisphereLight('#fff6e8', '#777465', 1.97));
  const sunlight = new THREE.DirectionalLight('#fff3da', 2.42);
  sunlight.position.set(-1.2, 5.7, 4);
  scene.add(sunlight);
  const rimLight = new THREE.DirectionalLight('#f3dfb4', .98);
  rimLight.position.set(5.4, 2.6, -5.8);
  scene.add(rimLight);
  const bounce = new THREE.DirectionalLight('#c3dfdd', .42);
  bounce.position.set(-4, .8, 1);
  scene.add(bounce);

  let width = 0;
  let height = 0;
  let home;
  let theta;
  let latitude;
  let distance;
  let hasAdjustedView = false;
  let paused = reducedMotion.matches;
  let available = true;
  let needsRender = true;
  let ambientClock = 0;
  let lastTick = performance.now();
  let lastMarkerCheck = -1;
  let launchTime = 0;
  let timeline = 0;
  let hatchMode = 'ready';
  let stagedHatch = false;
  let emerged = false;
  const duration = 4.7;
  const cast = new THREE.Raycaster();
  const projection = new THREE.Vector2();
  const hits = [];
  const eggsAndTree = [...egg.eggs.map((item) => item.intact), ...occluders];
  const pointers = new Map();
  let gesture = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || (width === rect.width && height === rect.height)) return;
    width = rect.width;
    height = rect.height;
    const previous = home;
    home = cameraView(width, height);
    if (!previous || !hasAdjustedView) {
      ({ theta, latitude, distance } = home);
    } else {
      distance = clamp(distance * home.distance / previous.distance, home.minDistance, home.maxDistance);
    }
    renderer.setSize(width, height, false);
    camera.fov = home.fov;
    camera.setViewOffset(width, height, -width * home.x, -height * home.y, width, height);
    paintCanopy(backdrop, width, height);
    needsRender = true;
    lastMarkerCheck = -1;
  }

  function updateCamera() {
    const horizontal = distance * Math.cos(latitude);
    camera.position.copy(target).add(v(horizontal * Math.sin(theta), distance * Math.sin(latitude), horizontal * Math.cos(theta)));
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function moveCamera(horizontal, vertical, zoom = 1) {
    hasAdjustedView = true;
    theta += horizontal;
    latitude = clamp(latitude + vertical, .24, 1.31);
    distance = clamp(distance * zoom, home.minDistance, home.maxDistance);
    needsRender = true;
    lastMarkerCheck = -1;
  }

  function resetCamera() {
    ({ theta, latitude, distance } = home);
    hasAdjustedView = false;
    needsRender = true;
    lastMarkerCheck = -1;
  }

  function findEgg(x, y) {
    projection.set(x / width * 2 - 1, 1 - y / height * 2);
    cast.setFromCamera(projection, camera);
    hits.length = 0;
    cast.intersectObjects(eggsAndTree, false, hits);
    return hits[0]?.object === egg.intact;
  }

  function updateMarker(now) {
    if (hatchMode !== 'ready') {
      marker.hidden = true;
      return;
    }
    if (now - lastMarkerCheck < 110 && lastMarkerCheck >= 0) return;
    lastMarkerCheck = now;
    const point = egg.opening.localToWorld(v(.09,.13,-.075)).project(camera);
    const x = (point.x + 1) * width * .5;
    const y = (1 - point.y) * height * .5;
    const visible = point.z < 1 && x > 17 && x < width - 17 && y > 17 && y < height - 17 && findEgg(x, y);
    marker.hidden = !visible;
    if (visible) {
      marker.style.left = x + 'px';
      marker.style.top = y + 'px';
    }
  }

  function drawEgg(time, ambient) {
    const idle = Math.max(0, ambient % 7.6 - 5.9);
    const wobble = time === 0 ? Math.sin(idle * 12.5) * pulse(idle, .04, 1.1) * .031 : 0;
    const pecks = pulse(time,.98,1.17)*.072 + pulse(time,1.56,1.75)*.096 + pulse(time,2.07,2.28)*.097;
    const rocking = Math.sin(time * 10.6) * pulse(time,0,.78) * .145;
    egg.pivot.rotation.z = wobble + rocking * .55 + pecks * .38;
    egg.pivot.rotation.x = rocking * .48 - pecks * .70 + wobble * .29;
    const broken = time >= 2.28;
    egg.intact.visible = !broken;
    egg.lower.visible = egg.lining.visible = egg.edge.visible = egg.chip.visible = broken;
    const revealed = time < 1.08 ? [3,0,0] : time < 1.67 ? [4,1,0] : time < 2.16 ? [5,3,1] : [6,3,3];
    egg.cracks.forEach((path, j) => path.forEach((segment, i) => {
      segment.visible = !broken && i < revealed[j];
    }));

    const loosen = ease(time,2.28,2.51);
    const fall = ease(time,2.50,3.06);
    egg.chip.position.set(mix(egg.hinge.x, .51, fall),
      mix(egg.hinge.y + .04 * loosen, .11, fall) + .10 * pulse(time,2.50,3.06),
      mix(egg.hinge.z + .035 * loosen, -.55, fall));
    egg.chip.rotation.set(mix(.87 * loosen, Math.PI - .08, fall), .15 * fall, -.18 * fall);

    const rise = ease(time,2.93,3.76);
    const lastPeck = pulse(time,3.93,4.35);
    egg.chick.visible = time >= 2.98;
    egg.chick.position.set(-.016 + rise * .025, .086 + .204 * rise - .018 * lastPeck,
      .130 + .020 * rise + .009 * lastPeck);
    egg.chick.rotation.set(0, .65 + .32 * rise, .07 - .12 * rise);
    // The chick stays braced in the shell while its head dips for the final peck.
    egg.chickHead.position.set(0, -.052 * lastPeck, .028 * lastPeck);
    egg.chickHead.rotation.set(-.22 + .54 * lastPeck, 0, .05 - .09 * rise);
  }

  function animateAdult(time, ambient) {
    const glance = ease(time,.96,1.47) * (1 - ease(time,3.39,4.6));
    adult.head.rotation.z = .04 + .24 * glance + .056 * Math.sin(ambient * .79) + .019 * Math.sin(ambient * 1.83);
    adult.head.rotation.y = -.13 + .22 * Math.sin(ambient * .73) + .11 * Math.sin(ambient * .35) - glance * .07;
    adult.body.position.y = .008 * Math.sin(ambient * 1.8);
    const blink = 1 - .93 * pulse(ambient % 5.72, 3.18, 3.38);
    for (const eye of adult.eyes) eye.scale.y = blink;
  }

  function setHatchLabel(label) {
    hatchButton.lastElementChild.textContent = label;
  }

  function beginHatch() {
    if (!available || hatchMode === 'hatching') return;
    if (hatchMode === 'finished' && document.activeElement === replayButton) {
      hatchButton.hidden = false;
      hatchButton.focus({ preventScroll: true });
    }
    hatchMode = 'hatching';
    hatchButton.hidden = false;
    hatchButton.setAttribute('aria-disabled', 'true');
    setHatchLabel('Hatching…');
    replayButton.hidden = true;
    marker.hidden = true;
    announcement.textContent = '';
    stagedHatch = paused || reducedMotion.matches;
    launchTime = 0;
    timeline = 0;
    emerged = false;
    needsRender = true;
  }

  function completeHatch() {
    const focused = document.activeElement === hatchButton;
    hatchMode = 'finished';
    replayButton.hidden = false;
    hatchButton.hidden = true;
    hatchButton.removeAttribute('aria-disabled');
    setHatchLabel('Hatch egg');
    if (focused) replayButton.focus({ preventScroll: true });
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = (now - lastTick) / 1000;
    const dt = Math.min(elapsed, .085);
    lastTick = now;
    if (!home || !available || document.hidden) return;
    if (!paused) {
      ambientClock += dt;
      for (let i = 0; i < clusters.length; i++) {
        const branch = clusters[i];
        branch.rotation.z = Math.sin(ambientClock * .75 + i * 2.11) * .020;
        branch.rotation.x = Math.sin(ambientClock * 1.04 + i * 1.47) * .017;
      }
      if (pointers.size === 0) theta += dt * .046;
      needsRender = true;
    }

    if (hatchMode === 'hatching' && (!paused || stagedHatch)) {
      launchTime += Math.min(elapsed, .25);
      const next = stagedHatch
        ? launchTime < .38 ? .27 : launchTime < .85 ? 1.14 : launchTime < 1.35 ? 2.47 : launchTime < 1.98 ? 3.45 : duration
        : Math.min(duration, launchTime);
      if (next !== timeline) {
        timeline = next;
        needsRender = true;
      }
      if (!emerged && timeline >= 3.26) {
        emerged = true;
        announcement.textContent = 'The baby robin’s head has emerged from the shell.';
      }
      if (timeline === duration) completeHatch();
    }

    if (needsRender) {
      drawEgg(timeline, ambientClock);
      animateAdult(timeline, ambientClock);
      updateCamera();
      renderer.render(scene, camera);
      updateMarker(now);
      needsRender = false;
    }
  }

  function updateMotion() {
    motionLabel.textContent = paused ? 'Resume motion' : 'Pause motion';
    const icon = motionButton.firstElementChild;
    icon.className = 'icon ' + (paused ? 'icon-play' : 'icon-pause');
    needsRender = true;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    if (pointers.size === 0) gesture = { start: point, moved: false, time: performance.now() };
    else gesture.moved = true;
    pointers.set(event.pointerId, point);
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      if (event.pointerType === 'mouse' && hatchMode === 'ready') {
        canvas.style.cursor = findEgg(event.offsetX, event.offsetY) ? 'pointer' : '';
      }
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(point.x - other.x, point.y - other.y);
      if (before > 8 && after > 8) moveCamera(-dx * .003, dy * .003, before / after);
    } else if (gesture.moved) {
      moveCamera(-dx * .008, dy * .008);
    } else if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 8) {
      gesture.moved = true;
      canvas.style.cursor = 'grabbing';
      moveCamera((gesture.start.x - point.x) * .008, (point.y - gesture.start.y) * .008);
    }
    pointers.set(event.pointerId, point);
  });

  function releasePointer(event, tap) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 0) {
      const { left, top } = canvas.getBoundingClientRect();
      const traveled = Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y);
      if (tap && !gesture.moved && traveled <= 8 && performance.now() - gesture.time < 680 &&
        hatchMode === 'ready' && findEgg(event.clientX - left, event.clientY - top)) beginHatch();
      gesture = null;
      canvas.style.cursor = '';
    }
  }

  canvas.addEventListener('pointerup', (event) => releasePointer(event, true));
  canvas.addEventListener('pointercancel', (event) => releasePointer(event, false));
  canvas.addEventListener('lostpointercapture', (event) => releasePointer(event, false));
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    moveCamera(0, 0, Math.exp(clamp(event.deltaY * unit, -400, 400) * .00125));
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (!available || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const commands = {
      ArrowLeft: [-.13,0], ArrowRight: [.13,0], ArrowUp: [0,.09], ArrowDown: [0,-.09],
      '+': [0,0,.9], '=': [0,0,.9], '-': [0,0,1.11], '−': [0,0,1.11],
    };
    if (Object.hasOwn(commands, event.key)) {
      event.preventDefault();
      moveCamera(...commands[event.key]);
    }
  });

  hatchButton.addEventListener('click', beginHatch);
  replayButton.addEventListener('click', beginHatch);
  resetButton.addEventListener('click', resetCamera);
  motionButton.addEventListener('click', () => {
    paused = !paused;
    updateMotion();
  });
  reducedMotion.addEventListener('change', (event) => {
    paused = event.matches;
    if (paused && hatchMode === 'hatching') {
      stagedHatch = true;
      launchTime = timeline >= 3.45 ? 1.35 : timeline >= 2.47 ? .85 : timeline >= 1.14 ? .38 : 0;
    }
    updateMotion();
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    const canvasObserver = new ResizeObserver(resize);
    canvasObserver.observe(canvas);
  }
  document.addEventListener('visibilitychange', () => { lastTick = performance.now(); });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    available = false;
    showAvailable(false);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    available = true;
    needsRender = true;
    showAvailable(true);
  });

  resize();
  updateMotion();
  showAvailable(true);
  lastTick = performance.now();
  requestAnimationFrame(frame);
}

try {
  if (!window.WebGL2RenderingContext || !canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' })) {
    showAvailable(false);
  } else {
    start();
  }
} catch (error) {
  console.error('First Peck could not start.', error);
  showAvailable(false);
}
