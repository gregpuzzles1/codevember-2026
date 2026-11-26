const stage = document.querySelector('#stage');
const fallback = document.querySelector('#fallback');
const sceneHelp = document.querySelector('#scene-help');
const instruction = document.querySelector('#instruction');
const consolePanel = document.querySelector('#console');
const meter = document.querySelector('#meter');
const bars = [...meter.children];
const playButton = document.querySelector('#play');
const playLabel = document.querySelector('#play-label');
const revealButton = document.querySelector('#reveal');
const announcement = document.querySelector('#announcement');

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const turn = Math.PI * 2;
const degrees = Math.PI / 180;
const opening = { yaw: 32.5 * degrees, pitch: 15 * degrees };
const reveal = { yaw: 0, pitch: 0 };
const pitchLimit = 67.5 * degrees;
const alignedTolerance = 1.25 * degrees;
const startInstruction = instruction.textContent;

function showFallback() {
  stage.classList.remove('is-ready', 'is-dragging');
  stage.removeAttribute('tabindex');
  stage.setAttribute('aria-label', 'Fungal cloud text alternative');
  stage.setAttribute('aria-describedby', 'scene-description');
  consolePanel.hidden = true;
  sceneHelp.hidden = true;
  fallback.hidden = false;
  instruction.textContent = 'Read the hidden word below.';
}

function nearestTurn(yaw) {
  return Math.round(yaw / turn) * turn;
}

function mixPose(from, to, proportion) {
  const eased = proportion * proportion * (3 - 2 * proportion);
  return {
    yaw: from.yaw + (to.yaw - from.yaw) * eased,
    pitch: from.pitch + (to.pitch - from.pitch) * eased,
  };
}

function startExhibit({ THREE, createCloud, orbitRadius }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'default' });
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 55);
  const { scene, spores } = createCloud();
  const canvas = renderer.domElement;

  canvas.setAttribute('aria-hidden', 'true');
  renderer.setClearColor(0x000000, 0);
  stage.prepend(canvas);

  let pose = { ...opening };
  let pointer = null;
  let transition = null;
  let tour = null;
  let tourStarted = 0;
  let playing = false;
  let lastAligned = false;
  let dirty = true;
  let visible = true;
  let contextLost = false;
  let frameId = 0;
  let elapsed = 0;
  let previousFrame = 0;

  function showExhibit() {
    canvas.hidden = false;
    fallback.hidden = true;
    consolePanel.hidden = false;
    sceneHelp.hidden = false;
    stage.classList.add('is-ready');
    stage.setAttribute('tabindex', '0');
    stage.setAttribute('aria-label', 'Interactive fungal cloud');
    stage.setAttribute('aria-describedby', 'scene-help scene-description');
    instruction.textContent = startInstruction;
  }

  function positionCamera() {
    const horizontal = Math.cos(pose.pitch) * orbitRadius;
    camera.position.set(
      Math.sin(pose.yaw) * horizontal,
      Math.sin(pose.pitch) * orbitRadius,
      Math.cos(pose.yaw) * horizontal,
    );
    camera.lookAt(0, 0, 0);
  }

  function updateAlignment() {
    const angle = Math.acos(THREE.MathUtils.clamp(Math.cos(pose.yaw) * Math.cos(pose.pitch), -1, 1));
    const aligned = angle <= alignedTolerance;
    const near = 1 - THREE.MathUtils.clamp((angle - alignedTolerance) / (.65 - alignedTolerance), 0, 1);
    const reading = Math.round(near * 100);
    const lit = aligned ? bars.length : Math.min(bars.length - 1, Math.floor(near * bars.length));

    bars.forEach((bar, index) => bar.classList.toggle('lit', index < lit));
    meter.dataset.full = String(aligned);
    stage.dataset.aligned = String(aligned);
    meter.setAttribute('aria-valuenow', reading);
    meter.setAttribute('aria-valuetext', aligned ? 'Aligned' : reading > 60 ? 'Near the reveal angle' : 'Away from the reveal angle');

    if (aligned !== lastAligned) {
      announcement.textContent = aligned ? 'Aligned. The hidden word is ANAMORPH.' : '';
      lastAligned = aligned;
    }
  }

  function schedule() {
    if (!frameId && !contextLost && visible && !document.hidden) {
      frameId = requestAnimationFrame(draw);
    }
  }

  function refresh() {
    dirty = true;
    schedule();
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = stage;
    if (!width || !height) return;
    const aspect = width / height;
    const viewHeight = Math.max(5.85, 16.4 / aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(viewHeight / (2 * orbitRadius)));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const ratio = Math.min(devicePixelRatio || 1, 1.8, Math.sqrt(1800000 / (width * height)));
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    spores.material.uniforms.pixelRatio.value = ratio;
    spores.material.uniforms.stageHeight.value = height;
    refresh();
  }

  function setPlaying(value) {
    playing = value;
    playButton.classList.toggle('is-playing', value);
    playLabel.textContent = value ? 'Pause' : 'Play';
    playButton.setAttribute('aria-label', value ? 'Pause guided orbit' : 'Play guided orbit');
    if (!value) tour = null;
  }

  function buildTour(start = pose) {
    const targetYaw = nearestTurn(start.yaw);
    tourStarted = performance.now();
    tour = [
      { pose: { ...start }, duration: 0 },
      { pose: { yaw: targetYaw, pitch: 0 }, duration: motion.matches ? 1500 : 2350 },
      { pose: { yaw: targetYaw, pitch: 0 }, duration: 2550 },
      { pose: { yaw: targetYaw + 35 * degrees, pitch: 15 * degrees }, duration: 2900 },
      { pose: { yaw: targetYaw + 125 * degrees, pitch: 19 * degrees }, duration: 5500 },
      { pose: { yaw: targetYaw + 232 * degrees, pitch: -12 * degrees }, duration: 5400 },
      { pose: { yaw: targetYaw + 325 * degrees, pitch: -15 * degrees }, duration: 4800 },
      { pose: { yaw: targetYaw + turn, pitch: 0 }, duration: 3000 },
      { pose: { yaw: targetYaw + turn, pitch: 0 }, duration: 2550 },
    ];
  }

  function guidedPose(now) {
    let duration = now - tourStarted;
    for (let frame = 1; frame < tour.length; frame++) {
      const step = tour[frame];
      if (duration < step.duration) {
        return motion.matches ? tour[frame - 1].pose : mixPose(tour[frame - 1].pose, step.pose, duration / step.duration);
      }
      duration -= step.duration;
    }
    buildTour(reveal);
    // The last step already lingered at the reveal before restarting.
    tourStarted = now - tour[1].duration - tour[2].duration;
    return reveal;
  }

  function draw(now) {
    frameId = 0;
    if (playing) {
      const next = guidedPose(now);
      dirty ||= next.yaw !== pose.yaw || next.pitch !== pose.pitch;
      pose = next;
    } else if (transition) {
      const proportion = Math.min(1, (now - transition.start) / transition.duration);
      pose = mixPose(transition.from, transition.to, proportion);
      if (proportion >= 1) transition = null;
      dirty = true;
    }

    if (!motion.matches) {
      elapsed += previousFrame ? Math.min(now - previousFrame, 50) / 1000 : 0;
      spores.material.uniforms.time.value = elapsed;
    }
    previousFrame = now;
    if (dirty) {
      positionCamera();
      updateAlignment();
      renderer.render(scene, camera);
      dirty = false;
    } else if (!motion.matches) {
      renderer.render(scene, camera);
    }

    if (!motion.matches || playing || transition) schedule();
  }

  function takeControl() {
    if (playing) setPlaying(false);
    transition = null;
  }

  function move(yaw, pitch) {
    pose = {
      yaw: (pose.yaw + yaw) % turn,
      pitch: THREE.MathUtils.clamp(pose.pitch + pitch, -pitchLimit, pitchLimit),
    };
    refresh();
  }

  stage.addEventListener('pointerdown', (event) => {
    if (pointer || !event.isPrimary || event.button !== 0) return;
    takeControl();
    stage.focus({ preventScroll: true });
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage.setPointerCapture(pointer.id);
    stage.classList.add('is-dragging');
  });

  stage.addEventListener('pointermove', (event) => {
    if (pointer?.id !== event.pointerId) return;
    const degreesPerPixel = 114 / Math.min(stage.clientWidth, 650);
    move(-(event.clientX - pointer.x) * degreesPerPixel * degrees,
      (event.clientY - pointer.y) * degreesPerPixel * degrees);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });

  function endDrag(event) {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    stage.classList.remove('is-dragging');
  }

  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('lostpointercapture', endDrag);

  const arrows = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
  };

  stage.addEventListener('keydown', (event) => {
    if (!Object.hasOwn(arrows, event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    takeControl();
    const [yaw, pitch] = arrows[event.key];
    const step = (event.shiftKey ? 10 : 2.5) * degrees;
    move(yaw * step, pitch * step);
  });

  revealButton.addEventListener('click', () => {
    takeControl();
    if (motion.matches) {
      pose = { ...reveal };
    } else {
      transition = {
        from: { ...pose },
        to: { yaw: nearestTurn(pose.yaw), pitch: 0 },
        start: performance.now(),
        duration: 850,
      };
    }
    refresh();
  });

  playButton.addEventListener('click', () => {
    if (playing) {
      takeControl();
    } else {
      transition = null;
      setPlaying(true);
      buildTour();
    }
    refresh();
  });

  motion.addEventListener('change', () => {
    if (transition && motion.matches) pose = { ...reveal };
    if (playing) takeControl();
    else transition = null;
    spores.material.uniforms.time.value = motion.matches ? 0 : elapsed;
    refresh();
  });

  function updateVisibility(nowVisible) {
    if (nowVisible === visible) return;
    visible = nowVisible;
    previousFrame = 0;
    if (!visible) {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      if (playing) takeControl();
      if (transition) {
        pose = transition.to;
        transition = null;
      }
    } else {
      refresh();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (playing) takeControl();
      previousFrame = 0;
    } else {
      refresh();
    }
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    takeControl();
    canvas.hidden = true;
    showFallback();
  });

  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    showExhibit();
    resize();
  });

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([entry]) => updateVisibility(entry.isIntersecting)).observe(stage);
  showExhibit();
  resize();
}

try {
  const [cloud] = await Promise.all([
    import('./cloud.js'),
    document.fonts.load('700 225px "Space Grotesk"').catch(() => []),
  ]);
  startExhibit(cloud);
} catch (error) {
  console.warn('The 3D exhibit could not start.', error);
  showFallback();
}
