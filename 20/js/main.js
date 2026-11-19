import * as T from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { vec, clamp, smooth, lerp, standard, stem, forest, makeBranch, makeGlowTexture, makeShell } from './art.js';
import { makeGarden, updateBotanicals, pond, pondRadius, floorHeight } from './garden.js';
import { makeSwarm } from './fireflies.js';
import { NightSound } from './sound.js';

const $ = (id) => document.getElementById(id);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const touchPreference = matchMedia('(pointer: coarse)');
const movementKeys = new Map([
  ['ArrowLeft','left'],['ArrowRight','right'],['ArrowUp','up'],['ArrowDown','down'],
  ['+','in'],['=','in'],['-','out'],['−','out'],
]);
const actionVectors = {
  left: [-1,0], right: [1,0], up: [0,1], down: [0,-1]
};
const viewConfig = {
  outside: { center: vec(0,.06,0), angle: .105, polar: 1.57, distance: 9.85, min: 4.55, max: 13.9, pan: .97 },
  inside: { center: vec(0,-.41,0), angle: .19, polar: 1.23, distance: 5.00, min: 3.10, max: 9.4, pan: .72 },
};
const branchProxies = [
  [vec(-6,3.95,-.73),vec(-2.1,3.09,-.21),.43],
  [vec(-2.1,3.09,-.21),vec(.04,2.75,0),.32],
  [vec(.04,2.75,0),vec(1.37,2.88,-.4),.27],
  [vec(1.37,2.88,-.4),vec(3.16,3.43,-.95),.27],
  [vec(2.48,3.13,-.83),vec(2.67,4.05,-.66),.18],
  [vec(-3.25,3.4,-.40),vec(-1.81,4.43,-1.2),.20],
  [vec(-1.70,2.99,-.16),vec(-.45,3.55,.42),.2],
  [vec(1.5,2.94,-.45),vec(3.56,3.13,-.30),.18],
];

export function start() {
  const stage = $('stage');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label','Cocoon and nighttime garden. Use the Controls button for keyboard and camera options.');
  canvas.setAttribute('role','img');
  let renderer;
  try {
    const context = canvas.getContext('webgl2', { antialias:true, alpha:false, powerPreference:'high-performance' });
    if (!context) throw new Error('WebGL 2 unavailable');
    renderer = new T.WebGLRenderer({ canvas, context, antialias:true });
  } catch {
    $('enter').hidden = true;
    $('world').classList.add('graphics-unavailable');
    $('fallback').hidden = false;
    return;
  }
  stage.append(canvas);
  stage.classList.add('is-interactive');
  renderer.setClearColor(0x081211);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const scene=new T.Scene();
  const camera=new T.PerspectiveCamera(37,1,.045,110);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=!motionPreference.matches;
  controls.dampingFactor=.085;
  controls.screenSpacePanning=true;
  controls.minAzimuthAngle=-Infinity;
  controls.maxAzimuthAngle=Infinity;
  controls.minPolarAngle=.075;
  controls.maxPolarAngle=Math.PI-.075;
  controls.enableRotate=true;
  controls.enablePan=true;
  controls.enableZoom=true;
  controls.rotateSpeed=.68;
  controls.panSpeed=.72;
  controls.zoomSpeed=.78;
  controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.DOLLY,RIGHT:T.MOUSE.PAN};
  controls.touches={ONE:T.TOUCH.ROTATE,TWO:T.TOUCH.DOLLY_PAN};

  const small=touchPreference.matches || (innerWidth<700 && innerHeight<1000);
  const texture=makeGlowTexture();
  const forestArt=forest(scene,texture,small);
  scene.add(new T.HemisphereLight(0xbfd6d8,0x637450,1.30));
  const moon=new T.DirectionalLight(0xbadacf,2.22);
  moon.position.set(-3.4,4.4,-2.8);
  scene.add(moon);
  const fill=new T.DirectionalLight(0x8dada5,.38);
  fill.position.set(1,1.1,5.1);
  scene.add(fill);
  makeBranch(scene);
  const suspension = new T.Group();
  suspension.position.set(.045,2.74,0);
  scene.add(suspension);
  const cocoon = new T.Group();
  cocoon.position.set(-.045,-2.74,0);
  suspension.add(cocoon);
  const tie=standard(0xaabfa2,{emissive:0x76977d,emissiveIntensity:.16});
  for (let i=0;i<9;i++) {
    const w=(i-4)*.014;
    stem(cocoon,[vec(.043+w,2.79,.003+Math.sin(i)*.055),vec(.061+w*.62,2.51,-.02+w*.62),vec(.042+w*.81,2.25,.02-w*.78),vec(.048+w*1.05,2.11,.010+Math.cos(i)*.052)],.0046,.0018,tie,17,5);
  }
  const shell=makeShell(cocoon,texture,small);
  const garden=makeGarden(cocoon,texture,small);
  garden.root.scale.set(.86,1,.86);
  garden.root.visible=false;
  const swarm=makeSwarm(garden,scene,texture,small);
  const ambient=new NightSound();
  const clock=new T.Clock();
  let time=0, frame=0, reveal=0, transition=null, activeView='outside', mode='explore', introHidden=false;
  let paused=false, profileShift=0, layoutWidth=0, layoutHeight=0;
  let lastProfile=-10, introTimer=0, hintTimer=0, hintSerial=0;
  let heldCamera=null, keyboardGather=false, volumeBusy=false;
  let pointerCycle=null;
  const pointers=new Map();
  const aim=vec(0,0,0);
  const keyboardPoint=vec(-.17,-.13,.36);
  const localRay=new T.Ray();
  const ellipsoidRay=new T.Ray();
  const gardenCenter=vec(0,-.30,0);
  const focusHeight=vec(0,-.35,0);
  const pickBounds=new T.Sphere(vec(0,0,0),1);
  const pickPlane = new T.Plane(vec(0,1,0),.50);
  const raycaster=new T.Raycaster();
  const localMatrix=new T.Matrix4();
  const xy=new T.Vector2();
  const nearHit=vec(0,0,0);
  const flatHit=vec(0,0,0);
  const rayScale=vec(1, .88, .89);
  const panning=vec(0,0,0);
  const axis=vec(0,0,0);
  const delta=vec(0,0,0);
  const fromBranch=vec(0,0,0);
  const branchDir=vec(0,0,0);
  const eyeShell=vec(0,0,0);
  const panel=$('panel'), menuButton=$('menu-button'), hint=$('hint'), intro=$('intro'), hintText=hint.querySelector('span');
  const posture=()=>layoutWidth/layoutHeight;

  function framing(view) {
    const state=viewConfig[view];
    const portrait= Math.max(0, .73-posture());
    const widthFactor=view==='inside' ? 6.25 : 4.1;
    const distance=state.distance+portrait*widthFactor;
    const offset=vec(0,0,0).setFromSphericalCoords(distance,state.polar,state.angle);
    return { target:state.center.clone(), offset, distance, min:state.min+portrait*(view==='inside'?2.0:.5) };
  }

  function resize() {
    const preceding = layoutWidth && layoutHeight ? framing(activeView).distance : 0;
    layoutWidth=stage.clientWidth;
    layoutHeight=stage.clientHeight;
    if(!layoutWidth || !layoutHeight) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio,small?1.55:1.8));
    renderer.setSize(layoutWidth,layoutHeight,false);
    forestArt.uniforms.scale.value=layoutHeight*renderer.getPixelRatio()*.93;
    camera.aspect=posture();
    camera.fov=posture()<=.77?40:37;
    useBounds(activeView);
    if(preceding && !transition) {
      const ratio=framing(activeView).distance/preceding;
      camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
      controls.update();
    }
    updateProjection(true);
  }

  function updateProjection(force=false) {
    if(!force && Math.abs(profileShift-lastProfile)<.00035) return;
    lastProfile=profileShift;
    if (!layoutWidth || !layoutHeight) return;
    const portrait=posture()<=1;
    const narrow=posture()<.72;
    const left=portrait ? (narrow?.0:.025) : -.138;
    const top=portrait ? (narrow?.164:.128) : .012;
    camera.setViewOffset(layoutWidth,layoutHeight,layoutWidth*left*profileShift,layoutHeight*top*profileShift,layoutWidth,layoutHeight);
  }

  function useBounds(view) {
    const state=viewConfig[view];
    controls.cursor.copy(state.center);
    controls.minDistance=framing(view).min;
    controls.maxDistance=state.max+Math.max(0,.73-posture())*2;
    controls.maxTargetRadius=state.pan;
  }

  function guardCamera() {
    // The orbit stays outside the silk envelope, even after panning the target.
    let changed=false;
    const envelope=vec(1.52,2.29,1.43);
    delta.copy(camera.position).divide(envelope);
    if(delta.lengthSq()<1) {
      camera.position.copy(delta.normalize().multiply(envelope));
      changed=true;
    }
    for(const [a,b,r] of branchProxies) {
      branchDir.subVectors(b,a);
      fromBranch.copy(camera.position).sub(a);
      const t=clamp(fromBranch.dot(branchDir)/branchDir.lengthSq(),0,1);
      fromBranch.addScaledVector(branchDir,-t);
      if(fromBranch.lengthSq()>=r*r) continue;
      if(fromBranch.lengthSq()<1e-8) fromBranch.set(0,0,1);
      camera.position.addScaledVector(fromBranch.normalize(),r).sub(delta.copy(camera.position).sub(a).addScaledVector(branchDir,-t));
      changed=true;
    }
    if(changed) camera.lookAt(controls.target);
    camera.updateMatrixWorld();
  }

  function setCamera(target,offset) {
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function applyMotionPreference() {
    const reduced=motionPreference.matches;
    controls.enableDamping=!reduced;
    forestArt.geometry.setDrawRange(0,reduced?Math.floor(forestArt.count*.29):forestArt.count);
    if(reduced) {
      suspension.rotation.set(0,0,0);
      if(transition) finishTransition();
      profileShift=introHidden?0:1;
      updateProjection(true);
    }
  }

  function stopHeld() {
    heldCamera=null;
    if(!pointerCycle) return;
    pointerCycle.cancelled=true;
    pointerAttraction(null);
  }

  function dismissIntro() {
    if(introHidden) return;
    introHidden=true;
    clearTimeout(introTimer);
    const linkHadFocus=document.activeElement===$('enter');
    intro.inert=true;
    intro.classList.add('is-leaving');
    const remove=()=>{ if(introHidden) intro.hidden=true; };
    if(motionPreference.matches) remove();
    else window.setTimeout(remove,1090);
    if(linkHadFocus) menuButton.focus();
  }

  function say(text) { $('status').textContent=text; }
  function showHint(text, duration=5500) {
    hintText.textContent=text;
    hint.classList.add('is-shown');
    clearTimeout(hintTimer);
    hintTimer=setTimeout(clearHint,duration);
    hintSerial++;
  }
  function clearHint(){
    clearTimeout(hintTimer);
    hint.classList.remove('is-shown');
  }
  function modeHelp() {
    if(mode==='attract') {
      if(activeView==='outside') return 'Step inside to gather fireflies.';
      return touchPreference.matches ? 'Touch and hold the garden to gather fireflies.' : 'Hold the left button over the garden to gather fireflies.';
    }
    return touchPreference.matches ? 'Tap the garden to send a spark. Drag to orbit.' : 'Click the garden to send a spark. Drag to orbit.';
  }
  function outerHelp() {
    return touchPreference.matches ? 'Drag to orbit · Pinch to zoom' : 'Drag to orbit · Scroll to zoom';
  }
  function updateGuide(){
    $('gesture-guide').textContent=touchPreference.matches
      ? 'Drag with one finger to orbit in Explore. Use two fingers to pan, or pinch to zoom. In Attract fireflies, hold one finger on the garden.'
      : 'Left-drag to orbit in Explore, right-drag to pan, and scroll to zoom. In Attract fireflies, hold the left button over the garden.';
  }

  function setPanel(open,restore=false){
    if(panel.hidden===!open) return;
    const focusWithin=panel.contains(document.activeElement);
    panel.hidden=!open;
    menuButton.setAttribute('aria-expanded',String(open));
    menuButton.title=open?'Close controls':'Open controls';
    if(open) $('close-menu').focus();
    else {
      heldCamera=null;
      if(restore || focusWithin) menuButton.focus();
    }
  }

  function syncInterface() {
    for(const [id,pressed] of [['explore',mode==='explore'],['attract',mode==='attract'],['outside',activeView==='outside'],['inside',activeView==='inside'],['gather',keyboardGather]]) {
      $(id).setAttribute('aria-pressed',String(pressed));
    }
    $('garden-actions').hidden=activeView!=='inside';
    $('gather').textContent=keyboardGather?'Release fireflies':'Gather fireflies';
    const blocked=mode==='attract';
    stage.classList.toggle('is-attracting',blocked && activeView==='inside' && !transition);
    controls.mouseButtons.LEFT=blocked ? -1 : T.MOUSE.ROTATE;
    controls.touches.ONE=blocked ? -1 : T.TOUCH.ROTATE;
    $('wake').disabled=garden.blooms.every(f=>f.open!==0 || f.pending);
  }

  function finishTransition() {
    if(!transition) return;
    const f=framing(activeView);
    reveal=activeView==='inside'?1:0;
    useBounds(activeView);
    setCamera(f.target,f.offset);
    garden.root.visible=reveal>0;
    transition=null;
    controls.enabled=true;
    controls.update();
    syncInterface();
  }

  function moveView(view, force=false, whisper=true) {
    if(view===activeView && !force) return;
    const changed=view!==activeView;
    dismissIntro();
    stopHeld();
    if(changed){ keyboardGather=false; swarm.attraction=null; }
    const wasDamping=controls.enableDamping;
    controls.enableDamping=false;
    if(!transition) controls.update();
    controls.enableDamping=wasDamping;
    controls.enabled=false;
    activeView=view;
    const f=framing(view);
    const from=new T.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const to=new T.Spherical().setFromVector3(f.offset);
    const θ=T.MathUtils.euclideanModulo(to.theta-from.theta+Math.PI,Math.PI*2)-Math.PI;
    transition={age:0,fromReveal:reveal,target:controls.target.clone(),from,turn:θ,duration:changed?1.75:.85};
    if(motionPreference.matches) finishTransition();
    syncInterface();
    if(changed && whisper) {
      say(view==='inside'?'Inside the garden.':'Outside the cocoon.');
      showHint(view==='inside'?modeHelp():'Tap or click the cocoon to step closer.',6100);
    }
  }

  function tickTransition(dt){
    if(!transition) return;
    transition.age+=dt;
    const linear=clamp(transition.age/transition.duration,0,1);
    if(linear===1){ finishTransition(); return; }
    const alpha=linear*linear*(3-2*linear);
    const t=transition;
    const f=framing(activeView);
    const to=new T.Spherical().setFromVector3(f.offset);
    const offset=vec(0,0,0).setFromSphericalCoords(lerp(t.from.radius,to.radius,alpha),lerp(t.from.phi,to.phi,alpha),t.from.theta+t.turn*alpha);
    const target=t.target.clone().lerp(f.target,alpha);
    setCamera(target,offset);
    reveal=lerp(t.fromReveal,activeView==='inside'?1:0,smooth(linear,.08,.87));
    garden.root.visible=reveal>.085;
  }

  function motionStep(action,amount) {
    if(transition) return;
    if(action==='in' || action==='out') {
      delta.subVectors(camera.position,controls.target);
      const current=delta.length();
      const next=clamp(current*Math.exp((action==='in'?-1:1)*amount*.7),controls.minDistance,controls.maxDistance);
      camera.position.copy(controls.target).addScaledVector(delta,next/current);
    } else {
      const [x,y]=actionVectors[action];
      panning.setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(x);
      axis.setFromMatrixColumn(camera.matrixWorld,1);
      panning.addScaledVector(axis,y).multiplyScalar(amount*camera.position.distanceTo(controls.target)*.33);
      delta.copy(controls.target).add(panning).sub(controls.cursor).clampLength(0,controls.maxTargetRadius).add(controls.cursor);
      panning.subVectors(delta,controls.target);
      controls.target.add(panning);
      camera.position.add(panning);
    }
    controls.update();
    guardCamera();
  }

  function flowerOpened(flower) {
    if(flower.open) return;
    flower.pending=false;
    flower.open=1;
    ambient.chime('flower');
    say('A flower opened.');
    syncInterface();
  }
  function wakeFlower(flower) {
    if(!flower || flower.pending || flower.open) return;
    const destination=flower.tip.clone().add(vec(0,.088,0));
    flower.pending=swarm.send(destination,time,'flower',flower);
    if(flower.pending) say('A firefly is on its way to the flower.');
    syncInterface();
  }
  function wakeAny() {
    if(activeView==='inside'&&!transition) wakeFlower(garden.blooms.find(f=>!f.open && !f.pending));
  }
  function setMode(next) {
    if(next===mode) return;
    mode=next;
    if(next==='explore') {
      keyboardGather=false;
      swarm.attraction=null;
    }
    pointerAttraction(null);
    if(pointerCycle) pointerCycle.cancelled=true;
    syncInterface();
    showHint(next==='attract' || activeView==='inside' ? modeHelp() : outerHelp());
    say(next==='attract'?'Attract fireflies mode.':'Explore mode.');
  }
  function toggleGather() {
    if(activeView!=='inside' || transition) return;
    if(!keyboardGather && mode!=='attract') setMode('attract');
    keyboardGather=!keyboardGather;
    swarm.attraction=keyboardGather?keyboardPoint:null;
    syncInterface();
    say(keyboardGather?'Fireflies are gathering.':'Fireflies are wandering again.');
  }
  function restart() {
    time=0;
    swarm.reset();
    for(const f of garden.blooms){ f.open=0; f.progress=0; f.pending=false; }
    for(const m of garden.fungi) { m.boost=0; m.trigger=0; }
    garden.water.reset();
    updateBotanicals(garden,0,true);
    setMode('explore');
    moveView('outside',true,false);
    say('The garden restarted.');
    showHint(outerHelp());
  }

  function setRay(x,y) {
    const rect=canvas.getBoundingClientRect();
    xy.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
    raycaster.setFromCamera(xy,camera);
  }

  function gardenPoint(x,y) {
    setRay(x,y);
    localRay.copy(raycaster.ray).applyMatrix4(localMatrix.copy(garden.root.matrixWorld).invert());
    // Use a broad garden volume for low-angle views and a stable horizontal surface at steeper angles.
    ellipsoidRay.origin.copy(localRay.origin).sub(gardenCenter).divide(rayScale);
    ellipsoidRay.direction.copy(localRay.direction).divide(rayScale).normalize();
    if(!ellipsoidRay.intersectsSphere(pickBounds)) return null;
    localRay.closestPointToPoint(focusHeight,nearHit);
    if(localRay.intersectPlane(pickPlane,flatHit)) {
      const weight=smooth(Math.abs(localRay.direction.y),.12,.62);
      if(Math.hypot(flatHit.x,flatHit.z)<2.1) nearHit.lerp(flatHit,weight);
    }
    const r=Math.hypot(nearHit.x/.99,nearHit.z/.84);
    if(r>1){nearHit.x/=r;nearHit.z/=r;}
    nearHit.y=clamp(nearHit.y,floorHeight(nearHit.x,nearHit.z)+.22,.62);
    return nearHit;
  }

  function pointerAttraction(point){
    if(point) aim.copy(point);
    swarm.attraction=point?aim:keyboardGather?keyboardPoint:null;
  }

  function clickWorld(x,y) {
    if(transition) return;
    setRay(x,y);
    if(activeView==='outside') {
      if(raycaster.intersectObject(shell.front,false).length) moveView('inside');
      return;
    }
    const hits=raycaster.intersectObjects(garden.targets,false);
    const terrainDistance=raycaster.intersectObject(garden.terrain,false)[0]?.distance ?? Infinity;
    for(const hit of hits) {
      if(hit.distance>terrainDistance+.018) break;
      const data=hit.object.userData.hit;
      if(data.kind==='flower') { wakeFlower(data.object); return; }
      if(data.kind==='mushroom') {
        data.object.trigger=1;
        swarm.releaseSpores(data.object,motionPreference.matches);
        ambient.chime('mushroom');
        say('A mushroom released glowing spores.');
        return;
      }
      if(data.kind==='water') {
        const p=garden.root.worldToLocal(hit.point);
        if(pondRadius(p.x,p.z)>.98) continue;
        garden.water.touch(p,time);
        say('Ripples crossed the pool.');
        return;
      }
    }
    const p=gardenPoint(x,y);
    if(p && swarm.send(p,time)) say('A firefly followed the spark.');
  }

  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',(e)=>{
    if(!pointers.size) {
      pointerCycle={id:e.pointerId,x:e.clientX,y:e.clientY,start:performance.now(),drag:false,cancelled:!!transition,hint:hintSerial,left:e.button===0};
      setPanel(false);
    } else if(pointerCycle) {
      pointerCycle.cancelled=true;
      pointerAttraction(null);
    }
    pointers.set(e.pointerId,e.pointerType);
    if(pointerCycle?.cancelled || !pointerCycle.left || mode!=='attract' || activeView!=='inside') return;
    pointerAttraction(gardenPoint(e.clientX,e.clientY));
  },{capture:true});

  canvas.addEventListener('pointermove',(e)=>{
    if(pointerCycle?.id!==e.pointerId || pointerCycle.cancelled) return;
    const threshold=e.pointerType==='touch'?9:5;
    if(Math.hypot(e.clientX-pointerCycle.x,e.clientY-pointerCycle.y)>threshold) pointerCycle.drag=true;
    if(mode==='attract' && activeView==='inside' && pointerCycle.left) pointerAttraction(gardenPoint(e.clientX,e.clientY));
  },{capture:true});

  function pointerEnd(e,cancelled=false) {
    if(!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if(!pointerCycle) return;
    if(cancelled) pointerCycle.cancelled=true;
    if(pointers.size) return;
    const gesture=pointerCycle;
    pointerCycle=null;
    pointerAttraction(null);
    if(gesture.hint===hintSerial) clearHint();
    if(gesture.cancelled || gesture.drag || !gesture.left || performance.now()-gesture.start>540 || gesture.id!==e.pointerId) return;
    const threshold=e.pointerType==='touch'?9:5;
    if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>threshold) return;
    if(mode==='explore' || activeView==='outside') clickWorld(e.clientX,e.clientY);
  }
  window.addEventListener('pointerup',e=>pointerEnd(e),{capture:true});
  window.addEventListener('pointercancel',e=>pointerEnd(e,true),{capture:true});
  canvas.addEventListener('lostpointercapture',e=>pointerEnd(e,true));
  canvas.addEventListener('wheel',()=>{
    if(!transition) { setPanel(false); clearHint(); }
  },{passive:true});

  for(const button of panel.querySelectorAll('[data-camera]')) {
    button.addEventListener('pointerdown',e=>{
      if(e.button!==0 || transition) return;
      button.setPointerCapture(e.pointerId);
      heldCamera={button,id:e.pointerId,action:button.dataset.camera,repeatAt:performance.now()+180};
      motionStep(button.dataset.camera,.11);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])
      button.addEventListener(event,()=>{ if(heldCamera?.button===button) heldCamera=null; });
    button.addEventListener('click',e=>{ if(e.detail===0) motionStep(button.dataset.camera,.15); });
  }
  menuButton.addEventListener('click',()=>setPanel(panel.hidden,true));
  $('close-menu').addEventListener('click',()=>setPanel(false,true));
  $('enter').addEventListener('click',()=>moveView('inside'));
  $('outside').addEventListener('click',()=>moveView('outside'));
  $('inside').addEventListener('click',()=>moveView('inside'));
  $('explore').addEventListener('click',()=>setMode('explore'));
  $('attract').addEventListener('click',()=>setMode('attract'));
  $('reset').addEventListener('click',()=>moveView(activeView,true,false));
  $('restart').addEventListener('click',restart);
  $('gather').addEventListener('click',toggleGather);
  $('wake').addEventListener('click',wakeAny);
  $('sound').addEventListener('click',async()=>{
    if(volumeBusy) return;
    volumeBusy=true;
    try {
      const on=await ambient.toggle();
      $('sound').setAttribute('aria-pressed',String(on));
      $('sound').title=on?'Turn sound off':'Turn sound on';
      $('sound').querySelector('use').setAttribute('href',on?'#i-sound':'#i-muted');
      if(!ambient.context) say('Sound is unavailable in this browser.');
    } catch {
      say('Sound is unavailable in this browser.');
    } finally { volumeBusy=false; }
  });
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ setPanel(false,true); stopHeld(); return; }
    if(e.altKey || e.ctrlKey || e.metaKey || e.target.matches('input, textarea, select, [contenteditable]')) return;
    if(e.target.closest('details') && ['ArrowDown','ArrowUp'].includes(e.key)) return;
    if(movementKeys.has(e.key)){ e.preventDefault(); motionStep(movementKeys.get(e.key),.13); return; }
    if(e.repeat) return;
    switch(e.key.toLowerCase()) {
      case 'f': toggleGather(); break;
      case 'w': wakeAny(); break;
      case 'r': moveView(activeView,true,false); break;
    }
  });
  window.addEventListener('blur',()=>{
    stopHeld();
    pointers.clear();
    pointerCycle=null;
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) { stopHeld(); pointers.clear(); pointerCycle=null; }
  });
  window.addEventListener('resize',resize);
  motionPreference.addEventListener('change',applyMotionPreference);
  touchPreference.addEventListener('change',updateGuide);
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();
    paused=true;
    cancelAnimationFrame(frame);
    $('fallback-message').textContent='Graphics paused. The garden will return if the browser restores its graphics context.';
    $('fallback').hidden=false;
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    $('fallback').hidden=true;
    if(paused){ paused=false; clock.getDelta(); frame=requestAnimationFrame(render); }
  });

  const heldStep = (dt)=>{
    if(heldCamera && performance.now()>=heldCamera.repeatAt) motionStep(heldCamera.action,dt*1.65);
  };
  function render() {
    const dt=Math.min(clock.getDelta(),.045);
    const reduced=motionPreference.matches;
    time+=dt*(reduced?.38:1);
    if(!reduced) {
      const sway=(1-reveal*.81);
      suspension.rotation.z=Math.sin(time*.68)*.028*sway;
      suspension.rotation.x=Math.sin(time*.56+.8)*.015*sway;
    }
    profileShift=reduced?(introHidden?0:1):T.MathUtils.damp(profileShift,introHidden?0:1,3.0,dt);
    updateProjection();
    if(transition) tickTransition(dt);
    else {
      heldStep(dt);
      controls.update();
    }
    guardCamera();
    scene.updateMatrixWorld();
    shell.uniforms.reveal.value=reveal;
    shell.uniforms.time.value=time;
    shell.uniforms.eye.value.copy(cocoon.worldToLocal(eyeShell.copy(camera.position)));
    shell.veil.material.opacity=lerp(.118,.026,reveal);
    forestArt.uniforms.time.value=time;
    garden.water.u.time.value=time;
    updateBotanicals(garden,dt,reduced);
    swarm.update(dt,time,reveal,reduced,shell,flowerOpened);
    renderer.render(scene,camera);
    if(!paused) frame=requestAnimationFrame(render);
  }

  resize();
  useBounds('outside');
  const first=framing('outside');
  setCamera(first.target,first.offset);
  controls.update();
  profileShift=1;
  updateProjection(true);
  applyMotionPreference();
  updateGuide();
  syncInterface();
  $('toolbar').hidden=false;
  showHint(outerHelp(),11500);
  function timeOutIntro() {
    if(intro.contains(document.activeElement)){ introTimer=setTimeout(timeOutIntro,1500); return; }
    dismissIntro();
  }
  introTimer=setTimeout(timeOutIntro,14800);
  render();
}
