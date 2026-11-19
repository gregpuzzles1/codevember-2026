import * as T from 'three';
import { vec, random, tau, lerp, clamp, makeMesh, glow, standard } from './art.js';
import { floorHeight } from './garden.js';

const maximum = 32;
const heading = vec(0,0,1);
const away = vec(0,0,0);
const target = vec(0,0,0);
const motion = vec(0,0,0);

function insect(parent, texture, assets, rng, i) {
  const group = new T.Group();
  parent.add(group);
  const body = new T.Group();
  group.add(body);
  makeMesh(body,assets.shape,assets.body,0,0,.019).scale.set(.015,.011,.029);
  makeMesh(body,assets.shape,assets.head,0,.001,.041).scale.set(.010,.009,.011);
  makeMesh(body,assets.shape,assets.tail,0,0,-.017).scale.set(.013,.010,.023);
  const wings = [-1,1].map(sign=>{
    const hinge=new T.Group();
    hinge.position.set(sign*.007,.006,.017);
    body.add(hinge);
    const wing=makeMesh(hinge,assets.shape,assets.wing,sign*.025,0,-.013);
    wing.scale.set(.029,.0021,.011);
    wing.rotation.y=sign*.48;
    return hinge;
  });
  const halo = glow(group,texture,0xffad44,.31,.65);
  const core = glow(group,texture,0xffefac,.087,.94);
  halo.position.z=core.position.z=-.012;
  halo.renderOrder=core.renderOrder=5;
  const phase=rng()*tau;
  return {group,body,wings,halo,core,phase, speed:.52+rng()*.54,rad:.32+Math.sqrt(rng())*.88,
    base:-.66+rng()*1.63, home:vec(0,0,0), previous:vec(0,0,0), goal:null, nextRest:4+rng()*14,
    pulse:rng()*tau, size:.76+rng()*.57, brightness:0, key:i};
}

function habitual(f,t,out) {
  const a=t*f.speed*.43+f.phase;
  const edge=f.key%6===0;
  const r = edge ? 1.14+Math.sin(t*.52+f.phase)*.077 : f.rad*(.69+Math.sin(t*.48+f.phase)*.26);
  const y = f.base + Math.sin(t*(.55+f.speed*.23)+f.phase*2)*.23 + Math.cos(t*.35+f.phase)*.14;
  out.set(Math.cos(a)*r+Math.sin(t*.83+f.phase)*.14, y, Math.sin(a)*r*.84+Math.cos(t*.71+f.phase*3)*.125);
  const limit=1.32-.23*Math.max(0,y);
  const span=Math.hypot(out.x,out.z/.91);
  if(span>limit) { out.x*=limit/span; out.z*=limit/span; }
  out.y=Math.max(out.y,floorHeight(out.x,out.z)+.105);
  return out;
}

export function makeSwarm(garden, scene, texture, small) {
  const rng=random(63145);
  const shape=new T.SphereGeometry(1,8,6);
  const assets={shape,body:standard(0x4c3b22),head:standard(0x28251a),
    tail:new T.MeshBasicMaterial({color:0xffcf72}),
    wing:new T.MeshBasicMaterial({color:0xc6ccc1,transparent:true,opacity:.36,depthWrite:false})};
  const flies=Array.from({length:small?23:maximum},(_,i)=>insect(garden.root,texture,assets,rng,i));
  const lights=Array.from({length:3},()=>new T.PointLight(0xffca78,0,1.16,2));
  lights.forEach(light=>scene.add(light));
  const spores=Array.from({length:small?31:55},()=>{
    const s=glow(garden.root,texture,0xa5d9b7,.064,0);
    s.visible=false; s.renderOrder=5;
    return {s,life:0,span:1,velocity:vec(0,0,0),seed:rng()*tau};
  });
  let attraction=null;
  let sporeCursor=0;

  function reset() {
    attraction=null;
    for(const f of flies){
      f.goal=null; f.nextRest=4+f.key*.89;
      f.group.position.copy(habitual(f,0,f.home));
      f.previous.copy(f.home);
    }
    for(const s of spores){s.s.visible=false;s.life=0;}
    for(const light of lights) light.intensity=0;
    sporeCursor=0;
  }
  reset();

  function send(point,time,kind='spark',flower=null) {
    let nearest=null, distance=Infinity;
    for(const f of flies){
      if(f.goal?.kind==='flower') continue;
      const d=f.group.position.distanceToSquared(point)+(f.goal?.kind==='spark'?.7:0);
      if (d<distance){nearest=f;distance=d;}
    }
    if(!nearest) return false;
    nearest.goal={point:point.clone(),kind,flower,until:time+(kind==='flower'?7:3.75),arrival:null};
    return true;
  }

  function releaseSpores(m,reduced) {
    for(let i=0;i<(reduced?4:9);i++) {
      const s=spores[sporeCursor++ % spores.length];
      const a=rng()*tau, r=.034+rng()*.084;
      s.s.position.copy(m.origin).add(vec(Math.cos(a)*r,0,Math.sin(a)*r));
      s.s.material.color.setHex(m.color);
      s.s.scale.setScalar(.044+rng()*.057);
      s.s.visible=true;
      s.life=s.span=1.7+rng()*1.8;
      s.velocity.set(Math.cos(a)*(.032+rng()*.065),.10+rng()*.135,Math.sin(a)*(.032+rng()*.065));
      s.s.material.opacity=0;
    }
  }

  const lightPosition=vec(0,0,0);
  const flyInShell=vec(0,0,0);
  const selector=[];
  const ripplesLights=garden.water.u.lights.value;

  function update(dt,time,reveal,reduced,shell,openFlower) {
    const flightTime = time; // The caller advances the clock at the preferred motion rate.
    for(const f of flies) {
      habitual(f,flightTime,f.home);
      const pos=f.group.position;
      target.copy(f.home);
      if(!f.goal && time>=f.nextRest){
        const p=garden.perches[(f.key*7+Math.floor(time*.9))%garden.perches.length];
        f.goal={point:p.clone(),kind:'rest',until:time+5.6,arrival:null};
        f.nextRest=time+14+f.key%12;
      }
      if(f.goal) {
        const goal=f.goal;
        target.copy(goal.point);
        if(goal.kind==='spark'){
          target.x+=.039*Math.sin(flightTime*3+f.phase);
          target.y+=.027*Math.sin(flightTime*4+f.phase);
          target.z+=.045*Math.cos(flightTime*3+f.phase);
        }
        if(goal.arrival===null && pos.distanceToSquared(target)<.013){
          goal.arrival=time;
          if(goal.kind==='flower') openFlower(goal.flower);
        }
        if(time>goal.until || (goal.arrival!==null && time-goal.arrival>(goal.kind==='flower'?1.45:1.12))){
          if(goal.flower) goal.flower.pending=false;
          f.goal=null;
        }
      }
      let gathering = false;
      if(attraction && f.goal?.kind!=='flower') {
        const d=attraction.distanceTo(f.home);
        const strength=clamp(1.14-d*.53,0,1);
        if(strength>.10){
          const angle=flightTime*(.8+f.speed*.4)+f.phase;
          away.copy(attraction).add(vec(Math.sin(angle)*(.11+.22*f.rad),Math.cos(angle*.93)*(.10+.14*f.rad),Math.cos(angle)*(.12+.18*f.rad)));
          target.lerp(away,strength*.94);
          gathering=strength>.42;
        }
      }
      const sleeping = !gathering && f.goal?.arrival!=null && f.goal.kind!=='spark';
      f.previous.copy(pos);
      const steering=(f.goal?.kind==='flower'?2.85:gathering?1.88:1.20)*f.speed;
      pos.lerp(target,1-Math.exp(-dt*steering*(reduced?.65:1)));
      const y=floorHeight(pos.x,pos.z)+.055;
      if(!sleeping && pos.y<y) pos.y=lerp(pos.y,y,.38);
      motion.subVectors(pos,f.previous);
      if(motion.lengthSq()>.0000003) {
        const q=new T.Quaternion().setFromUnitVectors(heading,motion.normalize());
        f.body.quaternion.slerp(q,1-Math.exp(-dt*6));
      }
      for (let i=0;i<2;i++) {
        const side=i===0?-1:1;
        f.wings[i].rotation.z=side*(sleeping?.09:.47+.75*Math.sin(flightTime*(reduced?9:30)+f.pulse));
        f.wings[i].rotation.y=side*(sleeping?.39:.08);
      }
      const rhythm=.46+.52*(.5+.5*Math.sin(flightTime*(.77+f.speed*.45)+f.pulse))**2;
      f.brightness=rhythm*f.size*(sleeping?.81:1);
      f.halo.scale.setScalar((.235+rhythm*.12)*f.size);
      f.core.scale.setScalar((.065+rhythm*.042)*f.size);
      f.halo.material.opacity=.48*f.brightness;
      f.core.material.opacity=.69+rhythm*.23;
    }
    // Three shared lamps follow selected insects while shaders handle wall and pond glints.
    for(let i=0;i<lights.length;i++){
      const f=flies[(i*8+1)%flies.length];
      garden.root.localToWorld(lightPosition.copy(f.group.position));
      lights[i].position.copy(lightPosition);
      lights[i].intensity=f.brightness*reveal*1.45;
    }
    selector.length=0;
    for (const f of flies) {
      const p = f.group.position;
      const score=Math.hypot(p.x,p.z/.9)+Math.max(0,p.y)*.25+f.brightness*.09;
      selector.push({f,score});
    }
    selector.sort((a,b)=>b.score-a.score);
    for(let i=0;i<shell.uniforms.embers.value.length;i++){
      const { f } = selector[i];
      flyInShell.copy(f.group.position).multiply(garden.root.scale);
      shell.uniforms.embers.value[i].set(flyInShell.x,flyInShell.y,flyInShell.z,f.brightness*(.48+reveal*.52));
      const pondFly=flies[(i*4+1)%flies.length];
      const {x,y,z}=pondFly.group.position;
      ripplesLights[i].set(x,y,z,pondFly.brightness*clamp(1.25-(y+1.2)*.56,0,1));
    }
    for(const s of spores){
      if(s.life<=0) continue;
      s.life-=dt;
      s.s.visible=s.life>0;
      const age=s.span-s.life;
      s.s.material.opacity=clamp(age*3.5,0,1)*clamp(s.life/s.span,0,1)*.79;
      s.s.position.addScaledVector(s.velocity,dt*(reduced?.38:1));
      s.s.position.x+=Math.sin(time*1.4+s.seed)*dt*.027;
    }
  }
  return {flies,send,update,reset,releaseSpores,set attraction(value){attraction=value;}};
}
