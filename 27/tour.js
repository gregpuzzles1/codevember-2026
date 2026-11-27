import * as THREE from './vendor/three.module.min.js';
import { createPrairie } from './prairie.js';
import { createBurrow } from './burrow.js';

const $ = (id) => document.getElementById(id);
const experience = $('experience'), view = $('view');
const previous = $('previous'), next = $('next'), play = $('play');
const motion = $('motion'), enter = $('enter'), replay = $('replay');
const preference = matchMedia('(prefers-reduced-motion: reduce)');

const stops = [
  {name:'Shortgrass Prairie', region:'Above ground', key:0,
    description:'A prairie dog stands beside a low mound. A pale rock marks the entrance among the grasses and wildflowers.'},
  {name:'Ribbon Tunnel', region:'Inside the burrow', key:6,
    description:'Bands of cobalt, turquoise, and amber curl around the passage as it slopes away from daylight.'},
  {name:'Lookout Chamber', region:'Inside the burrow', key:9,
    description:'Oversized blue and white tiles line a round den. Two passages split around the rock and join again farther ahead.'},
  {name:'The Nursery', region:'Inside the burrow', key:13,
    description:'Lilac arches and coral dots wrap around a softly lit alcove tucked off the main passage.'},
  {name:'Gathering Den', region:'Inside the burrow', key:16,
    description:'Patterned ribs arch over a star set into the floor. Passages meet around the widest room in the burrow.'},
  {name:'Exit Spiral', region:'Inside the burrow', key:20,
    description:'Green and gold chevrons follow a curving climb toward a widening patch of daylight.'},
  {name:'Back on the Prairie', region:'Above ground', key:26,
    description:'The pale rock sits across the colony beside the mound where the tour began.'},
];

const keyframes = [
  // Seconds from the last hold, seconds at this spot, camera position, and look target.
  [0, 0, [-14.90,1.07,7.86], [-10.75,.83,2.26]],
  [2.0, 0, [-13.23,1.04,5.98], [-11.06,.53,3.20]],
  [1.55,0, [-11.71,1.10,3.96], [-10.99,.03,3.18]],
  [1.18,0, [-11.03,.71,3.03], [-10.68,-1.62,3.43]],
  [1.85,0, [-10.89,-.86,3.28], [-10.06,-2.76,3.64]],
  [2.5, 0, [-9.75,-2.91,3.61], [-7.58,-4.10,4.01]],
  [2.35,2.35, [-7.56,-4.14,3.97], [-4.46,-4.63,2.97], [-4.55,-4.46,3.75]],
  [1.64,0, [-5.63,-4.64,3.63], [-3.35,-4.73,2.45]],
  [1.68,0, [-4.11,-4.72,2.94], [-1.42,-4.55,1.25]],
  [1.78,3.4, [-1.98,-4.67,1.79], [-2.18,-4.85,-.55], [-.70,-5.18,-2.76]],
  [1.35,0, [-1.26,-4.78,2.25], [.52,-5.04,3.22]],
  [1.38,0, [-.25,-5.00,2.69], [1.42,-5.23,4.35]],
  [1.34,0, [.72,-5.18,3.39], [1.89,-5.21,5.75]],
  [1.18,3.2, [1.49,-5.22,4.18], [1.84,-5.22,6.08], [2.40,-4.87,6.05]],
  [1.7,0, [2.74,-5.21,3.85], [4.48,-4.82,2.06]],
  [1.62,0, [3.96,-5.04,2.55], [6.66,-5.12,.38]],
  [1.4,4.05, [4.73,-4.60,1.85], [7.03,-5.70,.22], [6.22,-5.08,-1.46]],
  [1.85,0, [6.57,-4.70,1.10], [8.04,-4.33,-.34]],
  [1.75,0, [7.65,-4.42,.49], [8.91,-3.78,-1.51]],
  [1.76,0, [8.66,-4.01,-.97], [10.29,-2.98,-3.09]],
  [2.05,1.75, [9.83,-3.31,-2.99], [12.30,-.84,-2.52], [12.42,-.59,-2.40]],
  [1.77,0, [11.32,-2.43,-3.22], [12.68,.05,-1.94]],
  [1.73,0, [12.37,-1.21,-2.59], [12.78,1.69,-1.77]],
  [1.87,0, [12.61,.32,-1.93], [13.68,1.71,-.15]],
  [1.38,0, [12.88,1.13,-.86], [12.15,1.27,3.65]],
  [1.88,0, [12.31,1.29,.16], [8.19,.80,4.12]],
  [2.45,0, [11.14,1.16,.57], [-12.29,.69,2.12]],
];

const vector = (xyz) => new THREE.Vector3(...xyz);
const smooth = (x) => x*x*(3-2*x);
function anglesFrom(point, target) {
  const [x,y,z] = target.map((v,i) => v - point[i]);
  return [Math.atan2(x,-z), Math.atan2(y,Math.hypot(x,z))];
}
function mixAngle(start,end,t) {
  return start + Math.atan2(Math.sin(end-start),Math.cos(end-start))*t;
}

let length = 0;
const frames = keyframes.map(([duration, hold, position, target, inspect]) => {
  length += duration;
  const arrival = length;
  length += hold;
  const aim = anglesFrom(position,target);
  return {arrival,hold,position:vector(position),aim,scan:inspect ? anglesFrom(position,inspect) : aim};
});
const path = new THREE.CatmullRomCurve3(frames.map(frame=>frame.position),false,'centripetal');
const camera = new THREE.PerspectiveCamera(65,1,.035,260);
camera.rotation.order = 'YXZ';

const breezeTime = {value:0};
let renderer, scene, prairie, spin = 0;
let clock = 0, time = 0, state = 'opening', playing = false;
let selected = 0, yawOffset = 0, pitchOffset = 0;
let reduced = preference.matches, motionOverride = false;
let cameraReady = false, userReady = false, redraw = true;
const ticks = stops.map(() => document.createElement('span'));
$('progress').append(...ticks);

function tourPose(t) {
  let index = 0;
  while (index + 1 < frames.length && frames[index + 1].arrival <= t) index++;
  const from = frames[index], to = frames[index+1];
  const stationary = !to || t <= from.arrival + from.hold;
  let yaw, pitch;
  if (stationary) {
    camera.position.copy(from.position);
    const slowLook = from.hold === 0 ? 0 : smooth((t-from.arrival)/from.hold);
    yaw = mixAngle(from.aim[0],from.scan[0],slowLook);
    pitch = THREE.MathUtils.lerp(from.aim[1],from.scan[1],slowLook);
  } else {
    const fraction = (t-from.arrival-from.hold)/(to.arrival-from.arrival-from.hold);
    // Zero velocity at the featured rooms, with a gentler speed change at regular bends.
    const tangentIn = from.hold > 0 || index === 0 ? 0 : .81;
    const tangentOut = to.hold > 0 || index + 2 === frames.length ? 0 : .81;
    const a = fraction*fraction, b = a*fraction;
    const travel = (-2*b+3*a) + (b-2*a+fraction)*tangentIn + (b-a)*tangentOut;
    path.getPoint((index+travel)/(frames.length-1), camera.position);
    yaw = mixAngle(from.scan[0],to.aim[0],smooth(fraction));
    pitch = THREE.MathUtils.lerp(from.scan[1],to.aim[1],smooth(fraction));
  }
  // Landscape framing at the surface places the mound to the right of the opening title.
  if (camera.aspect > 1.15) {
    yaw -= Math.min(.22,(camera.aspect-1.15)*.21)*(1-smooth(Math.min(1,t/3.55)));
  }
  camera.rotation.set(THREE.MathUtils.clamp(pitch + pitchOffset,-1.51,1.51),-yaw-yawOffset,0);
}

function layout() {
  if (!renderer) return;
  const {clientWidth:width, clientHeight:height} = view;
  if (width === 0 || height === 0) return;
  camera.aspect = width/height;
  camera.fov = camera.aspect < .82 ? 79 : 63;
  camera.updateProjectionMatrix();
  const pixelLimit = Math.sqrt(2_350_000/(width*height));
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5, pixelLimit));
  renderer.setSize(width,height,false);
  redraw = true;
}

function announceStop(index) {
  const stop = stops[index];
  $('location').textContent = stop.region;
  $('stop-name').textContent = stop.name;
  $('description').textContent = stop.description;
  $('announcement').textContent = stop.name + '. ' + stop.description;
  ticks.forEach((tick,i) => {
    tick.toggleAttribute('data-visited',i<index);
    if (i === index) tick.setAttribute('aria-current','step');
    else tick.removeAttribute('aria-current');
  });
}

function refreshControls() {
  redraw = true;
  experience.dataset.mode = state;
  experience.dataset.reduced = String(reduced);
  $('hero').hidden = state !== 'opening';
  $('chapter').hidden = state !== 'tour';
  $('controls').hidden = state !== 'tour';
  $('progress').hidden = state !== 'tour';
  $('controls').dataset.manual = String(reduced);
  motion.setAttribute('aria-pressed',String(reduced));
  const atEnd = selected === stops.length-1;
  $('manual-hint').hidden = state !== 'tour' || !reduced || atEnd;
  previous.disabled = selected === 0;
  next.disabled = atEnd;
  play.hidden = reduced || atEnd;
  replay.hidden = !atEnd || state !== 'tour';
  $('play-label').textContent = playing ? 'Pause tour' : 'Resume tour';
  $('play-icon').setAttribute('d',playing ? 'M9 6v12m6-12v12' : 'M8 5l11 7-11 7z');
}

function select(index, notify = true) {
  selected = index;
  if (notify) announceStop(index);
  refreshControls();
}

function resetLook() {
  yawOffset = 0;
  pitchOffset = 0;
}

function startTour() {
  if (!userReady) return;
  if (state !== 'opening') resetLook();
  state = 'tour';
  playing = !reduced;
  time = 0;
  select(0);
  (reduced ? next : play).focus({preventScroll:true});
}

function jumpTo(index, control) {
  if (index < 0 || index >= stops.length) return;
  playing = false;
  time = frames[stops[index].key].arrival;
  resetLook();
  select(index);
  if (control?.disabled) (index === 0 ? next : replay).focus({preventScroll:true});
}

function togglePlayback() {
  if (state !== 'tour' || reduced || selected === stops.length-1) return;
  playing = !playing;
  refreshControls();
}

function setMotion(newValue) {
  if (newValue === reduced) return;
  reduced = newValue;
  const playHadFocus = document.activeElement === play;
  if (reduced) playing = false;
  refreshControls();
  if (reduced && playHadFocus && !next.disabled) next.focus({preventScroll:true});

  const onTour = state === 'tour' && selected < stops.length-1;
  $('announcement').textContent = reduced
    ? (onTour ? 'Reduced motion is on. Use Previous or Next to move between stops.' : 'Reduced motion is on.')
    : (onTour ? 'Reduced motion is off. Select Resume tour to continue.' : 'Reduced motion is off.');
}

motion.addEventListener('click',() => {
  motionOverride = true;
  setMotion(!reduced);
});
preference.addEventListener('change',({matches}) => {
  if (!motionOverride) setMotion(matches);
});
enter.addEventListener('click',startTour);
replay.addEventListener('click',startTour);
play.addEventListener('click',togglePlayback);
previous.addEventListener('click',() => jumpTo(selected-1,previous));
next.addEventListener('click',() => jumpTo(selected+1,next));

function look(dx,dy) {
  if (!userReady || state === 'fallback') return;
  if (playing) {
    playing = false;
    refreshControls();
  }
  redraw = true;
  yawOffset = THREE.MathUtils.clamp(yawOffset+dx,-Math.PI,Math.PI);
  pitchOffset = THREE.MathUtils.clamp(pitchOffset+dy,-1.35,1.35);
}

let pointer = null;
view.addEventListener('pointerdown',(event) => {
  if (!event.isPrimary || event.button !== 0 || !userReady) return;
  pointer = {id:event.pointerId, x:event.clientX, y:event.clientY, active:false};
  view.setPointerCapture(pointer.id);
});
view.addEventListener('pointermove',(event) => {
  if (pointer?.id !== event.pointerId) return;
  const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
  if (!pointer.active && Math.hypot(dx,dy)<4) return;
  pointer.active = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  look(-dx*.0048,dy*.0048);
});
for (const event of ['pointerup','pointercancel','lostpointercapture']) {
  view.addEventListener(event,(e) => { if(pointer?.id===e.pointerId) pointer=null; });
}
document.addEventListener('keydown',(event) => {
  if (!userReady || state === 'fallback' || event.ctrlKey || event.metaKey || event.altKey) return;
  const amount = .115;
  const changes = {ArrowLeft:[-amount,0], ArrowRight:[amount,0], ArrowUp:[0,amount], ArrowDown:[0,-amount]};
  if (Object.hasOwn(changes,event.key)) {
    event.preventDefault();
    look(...changes[event.key]);
  } else if (event.code === 'Space' && event.target === view) {
    event.preventDefault();
    if (!event.repeat) togglePlayback();
  }
});

function showFallback() {
  renderer?.setAnimationLoop(null);
  state = 'fallback';
  if ($('fallback-stops').childElementCount === 0) {
    for (const stop of stops) {
      const li = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = stop.name;
      li.append(heading,document.createTextNode(' — '+stop.description));
      $('fallback-stops').append(li);
    }
  }
  refreshControls();
  $('fallback').hidden = false;
  $('announcement').textContent = 'The 3D view is unavailable. The text tour is available.';
}

function draw(now) {
  if (!cameraReady) return;
  const dt = clock === 0 ? 0 : Math.min(.045,(now-clock)/1000);
  clock = now;
  if (!redraw && !playing && (reduced || !prairie.group.visible)) return;
  if (playing) {
    time = Math.min(length,time+dt);
    yawOffset *= Math.exp(-dt*3.4);
    pitchOffset *= Math.exp(-dt*3.4);
    const upcoming = stops.findLastIndex(({key}) => time >= frames[key].arrival);
    if (upcoming !== selected) {
      if (upcoming === stops.length-1) playing = false;
      const playHadFocus = document.activeElement === play;
      select(upcoming);
      if (playHadFocus && !playing) replay.focus({preventScroll:true});
    }
  }
  tourPose(time);
  prairie.group.visible = camera.position.y > -2.85;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(.80,.93,THREE.MathUtils.smoothstep(camera.position.y,-1.2,.84));
  if (prairie.group.visible && !reduced) {
    spin += dt;
    prairie.head.rotation.y = Math.sin(spin*.58)*.16;
    prairie.head.rotation.x = Math.sin(spin*.74)*.035;
    breezeTime.value = spin;
  }
  renderer.render(scene,camera);
  redraw = false;
}

async function getAsset(relative, format) {
  const result = await fetch(new URL(relative,import.meta.url));
  if (!result.ok) throw new Error('Could not load '+relative);
  return result[format]();
}

async function initialize() {
  refreshControls();
  enter.querySelector('span').textContent = 'Loading the burrow…';
  try {
    renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .93;
    renderer.setClearColor('#151911');
    renderer.domElement.setAttribute('aria-hidden','true');
    renderer.domElement.addEventListener('webglcontextlost',showFallback,{once:true});
    view.append(renderer.domElement);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#b5b49a',.017);
    const layoutRequest = getAsset('./layout.json','json');
    const meshRequest = getAsset('./burrow.bin','arrayBuffer');
    // The surface can render as soon as its layout arrives while the tunnel mesh loads.
    meshRequest.catch(() => {});
    const {mouths} = await layoutRequest;
    prairie = createPrairie(mouths,breezeTime);
    scene.add(prairie.group,prairie.sky);
    layout();
    new ResizeObserver(layout).observe(view);
    cameraReady = true;
    renderer.setAnimationLoop(draw);
    scene.add(createBurrow(await meshRequest));
    userReady = true;
    redraw = true;
    enter.querySelector('span').textContent = 'Enter the burrow';
    enter.disabled = false;
  } catch (error) {
    console.error(error);
    showFallback();
  }
}
initialize();
