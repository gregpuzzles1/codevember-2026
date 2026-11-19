import * as T from 'three';
import { vec, tau, lerp, clamp, smooth, random, stem, makeMesh, standard, leafShape, glow, noiseGLSL, shellPoint } from './art.js';

export const pond = { x: .20, y: -1.215, z: .24, rx: .61, rz: .405 };
export function pondRadius(x, z) {
  return Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz);
}
export function floorHeight(x, z) {
  const r = Math.hypot(x, z / .90);
  const depression = 1 - smooth(pondRadius(x,z), .80, 1.18);
  return -.97 - .39 * r * r + .028 * Math.sin(x * 13 + z * 8) + .026 * Math.cos(z * 13 - x * 7) - .36 * depression;
}

function stoneGeometry() {
  const geometry = new T.IcosahedronGeometry(1, 1);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 1 + .16 * Math.sin(x*11+y*16+z*7) + .08*Math.sin(x*29-z*17);
    p.setXYZ(i,x*bump,y*bump,z*bump);
  }
  return geometry;
}

function scatter(parent, geo, mat, items) {
  if (!items.length) return;
  const mesh = new T.InstancedMesh(geo, mat, items.length);
  const dummy = new T.Object3D();
  for (const [i, { p, rotation, scale, color }] of items.entries()) {
    dummy.position.copy(p);
    if (rotation.isQuaternion) dummy.quaternion.copy(rotation);
    else dummy.rotation.copy(rotation);
    dummy.scale.copy(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i,dummy.matrix);
    if (color) mesh.setColorAt(i, color);
  }
  mesh.computeBoundingSphere();
  parent.add(mesh);
}

function landscape(parent, rng, small) {
  const geometry = new T.SphereGeometry(1, 102, 49);
  const positions = geometry.attributes.position;
  const colors = [];
  const palette = [new T.Color(0x161c17), new T.Color(0x536440), new T.Color(0x334c30)];
  const color = new T.Color();
  for (let i = 0; i < positions.count; i++) {
    const cx = positions.getX(i), cy = positions.getY(i), cz = positions.getZ(i);
    const shape = 1 + .025 * Math.cos(Math.atan2(cz,cx)*9) + .018 * Math.sin(cx*14+cz*12);
    const x = cx * 1.175 * shape, z = cz * 1.03 * shape;
    const y = cy >= 0 ? floorHeight(x,z) : -1.49 + cy * .395;
    positions.setXYZ(i,x,y,z);
    const moss = .50+.24*Math.sin(x*14 + z*3)*Math.sin(z*8-x*9)+.25*Math.sin(x*38-z*24)*Math.sin(z*29+x*33);
    color.copy(palette[cy >= 0 ? 2 : 0]).lerp(palette[1], cy >= 0 ? moss*.91 : moss*.16);
    if(pondRadius(x,z)<1.02 && cy>=0) color.multiplyScalar(.60);
    colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const terrain=makeMesh(parent, geometry, standard(0xffffff, { vertexColors: true }));
  const stones = [], moss = [];
  const rot = () => new T.Euler(rng()*1.7, rng()*tau, rng()*.9);
  const stoneColors = [0x53615a,0x354949,0x71806a,0x38463b,0x63705b,0x5e6a66];
  for (let i = 0; i < (small ? 55 : 85); i++) {
    const a = rng()*tau;
    let x, z;
    if (i < 38) {
      const edge = 1.02 + rng()*.16;
      x = pond.x + Math.cos(a)*pond.rx*edge; z = pond.z + Math.sin(a)*pond.rz*edge;
    } else {
      const r = .30 + rng()*.83;
      x = Math.cos(a)*r; z = Math.sin(a)*r*.87;
      if (pondRadius(x,z)<1.02) continue;
    }
    const size = .012 + rng()**2*.076;
    stones.push({p:vec(x, floorHeight(x,z)+size*.26,z), scale:vec(size*1.42,size*.67,size),rotation:rot(),color:new T.Color(stoneColors[i % stoneColors.length])});
  }
  for (const [x,z,s] of [[-.68,.32,.16],[.86,.07,.15],[-.21,-.48,.17],[.46,-.53,.16],[-.62,-.65,.12],[.52,.67,.1]]) {
    stones.push({p:vec(x,floorHeight(x,z)+s*.36,z),scale:vec(s, s*.73,s*.76),rotation:rot(),color:new T.Color(stoneColors[stones.length%stoneColors.length])});
  }
  for (let i=0; i<(small? 470:820); i++) {
    const a = rng()*tau, r = Math.sqrt(rng())*1.22;
    const x = Math.cos(a)*r, z = Math.sin(a)*r*.86;
    if (pondRadius(x,z)<1.06) continue;
    const size = .008 + .041 * rng()**2;
    const y = floorHeight(x,z);
    const color = new T.Color().setHSL(.20+rng()*.105,.19+rng()*.35,.125+rng()*.19,T.SRGBColorSpace);
    moss.push({p:vec(x,y+.004,z),scale:vec(size*(1+rng()*.8),size*(.38+rng()*.7),size),rotation:rot(),color});
  }
  scatter(parent, stoneGeometry(), standard(0xffffff), stones);
  scatter(parent, new T.IcosahedronGeometry(1, 0), standard(0xffffff, { flatShading: true }), moss);
  return terrain;
}

function flora(parent, rng, small) {
  const leaf = leafShape(.22,.22,.15), leaflet = leafShape(.14,.19,.12);
  const material = standard(0xffffff, { vertexColors:true, side:T.DoubleSide });
  const stalk = standard(0x4c6c43);
  const large = [], ferns = [], reeds = [], perches = [];
  const fronds = [
    [-.72,-.29,1.21,2.50],[-.79,-.28,1.08,4.10],[-.69,-.32,1.26,5.90],
    [.66,-.28,1.35,-.78],[.68,-.29,1.18,1.18],[.65,-.26,.96,2.45],
    [-.22,-.76,1.51,2.82],[-.21,-.75,1.25,-.16],
    [.44,.64,.67,1.93],[-.83,.41,.65,-1.28],[-.32,.78,.91,1.42],[.81,.37,.79,2.1],
  ];
  for (const [x,z,height,angle] of fronds) {
    const y = floorHeight(x,z);
    const dir = vec(Math.sin(angle),0,Math.cos(angle));
    const side = vec(dir.z,0,-dir.x);
    const origin = vec(x,y,z);
    const curve = new T.CatmullRomCurve3([
      origin, origin.clone().addScaledVector(dir,.11*height).add(vec(0,height*.49,0)),
      origin.clone().addScaledVector(dir,.29*height).add(vec(0,height*.77,0)),
      origin.clone().addScaledVector(dir,.61*height).add(vec(0,height*.79,0)),
    ]);
    stem(parent,curve.points,.018*height,.0023,stalk,16,5);
    const pairs=small?8:11;
    for (let k=0; k<pairs; k++) {
      const u= .24 + k / pairs*.75;
      const p=curve.getPoint(u);
      for (const sign of [-1,1]) {
        const len = height*(.301*Math.sin(u*Math.PI)**.74+.032)*(1+rng()*.19);
        const outward = side.clone().multiplyScalar(sign*.90).addScaledVector(dir,.39+u*.64).add(vec(0,(rng()-.17)*.5,0)).normalize();
        const quaternion = new T.Quaternion().setFromUnitVectors(vec(0,0,1),outward);
        quaternion.multiply(new T.Quaternion().setFromAxisAngle(vec(0,0,1), sign*(.36 + .32 * rng())));
        const color = new T.Color().setHSL(.225+rng()*.10,.35+rng()*.20,.34+rng()*.18,T.SRGBColorSpace);
        ferns.push({p,rotation:quaternion,scale:vec(len*.84,len,len),color});
      }
    }
    perches.push(curve.getPoint(.78));
  }
  const sites = [[-.85,.17,.78],[-.57,-.63,1.40],[.82,-.30,1.05],[.61,-.57,.96],[-.48,.67,.67],[.73,.54,.67],[.17,-.83,1.14],[-.81,-.40,.62],[-.86,.43,.57],[.01,.81,.75]];
  for (const [x,z,length] of sites) {
    const root = vec(x,floorHeight(x,z),z);
    const lean = vec((rng()-.5)*.32,length,(rng()-.5)*.32);
    const bend = root.clone().addScaledVector(lean,.54).add(vec(.09,0,-.03));
    const top = root.clone().add(lean);
    const points = [root,bend,top];
    stem(parent,points,.017,.006,stalk);
    const curve = new T.CatmullRomCurve3(points);
    for (let j=0;j<5;j++) {
      const len = length*(.27 + rng()*.20);
      large.push({p:curve.getPoint(.26+j*.142),rotation:new T.Euler(-.23-rng()*.53,j*2.40+rng(),(rng()-.5)*.9),scale:vec(len,len,len),color:new T.Color().setHSL(.22+rng()*.10,.39,.30+rng()*.15,T.SRGBColorSpace)});
    }
    perches.push(top);
  }
  const curlSites = [[-.94,.13,.60],[-.61,.69,.50],[.92,.23,.69],[.45,-.63,.83]];
  for (const [x,z,h] of curlSites) {
    const y=floorHeight(x,z);
    const points = [vec(x,y,z),vec(x+.04,y+.29*h,z-.03)];
    for(let i=0;i<=19;i++) {
      const u=i/19, a=Math.PI*2.3*u, r=h*.175*(1-u*.93);
      points.push(vec(x+.13*h-Math.cos(a)*r,y+.63*h+Math.sin(a)*r,z+.052*u));
    }
    stem(parent,points,.015,.004,standard(0x748847),36,5);
  }
  for (let i=0; i<(small?100:165);i++) {
    const a=rng()*tau,r=.56+rng()*.53,x=Math.cos(a)*r,z=Math.sin(a)*r*.84;
    if(pondRadius(x,z)<1.15) continue;
    const length=.08+rng()**2*.32;
    reeds.push({p:vec(x,floorHeight(x,z),z),rotation:new T.Euler(-.74-rng()*.80,rng()*tau,rng()*.5),scale:vec(length*.23,length*1.1,length),color:new T.Color().setHSL(.19+rng()*.15,.26+rng()*.22,.27+rng()*.16,T.SRGBColorSpace)});
  }
  scatter(parent,leaf,material,large);
  scatter(parent,leaflet,material,ferns);
  scatter(parent,leaf,material,reeds);
  return perches;
}

function pool(parent) {
  const ripples = Array.from({ length: 6 }, () => new T.Vector3(0,0,-100));
  const reflections = Array.from({ length: 7 }, () => new T.Vector4(0,-10,0,0));
  const u = { time: { value: 0 }, ripples: { value: ripples }, lights: { value: reflections }, center: {value: vec(pond.x,pond.y,pond.z)} };
  const geometry = new T.CircleGeometry(1, 80);
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(pond.rx,1,pond.rz);
  const surface = makeMesh(parent, geometry, new T.ShaderMaterial({
    uniforms:u, side:T.DoubleSide,
    vertexShader:`
      varying vec3 vWorld;
      varying vec2 vP;
      void main(){vP=position.xz;vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform float time;
      uniform vec3 ripples[6],center;
      uniform vec4 lights[7];
      varying vec3 vWorld;
      varying vec2 vP;
      ${noiseGLSL}
      void main(){
        vec2 p=vP;
        float edge=length(p/vec2(.61,.405));
        float flow=fbm(vec3(p*14.,time*.18));
        if(edge> .995-(flow-.43)*.10) discard;
        float wave=sin(p.x*63.+p.y*54.+sin(p.y*20.+time*.46)*1.2+time*.59);
        float gold=0.;
        for(int i=0; i<7; i++){
          vec2 d=center.xz+p-lights[i].xz;
          d.x += wave*.019;
          gold+=lights[i].w*exp(-dot(d*vec2(1.4,.8),d*vec2(1.4,.8))*26.)*(.74+.26*wave);
        }
        float ripple=0.;
        for(int i=0;i<6;i++){
          float age=time-ripples[i].z;
          float d=length(p-ripples[i].xy);
          float radius=age*.33;
          float crest=exp(-abs(d-radius)*76.)+.31*exp(-abs(d-radius+.033)*88.);
          ripple+=crest*clamp(1.-age*.43,0.,1.)*smoothstep(0.,.09,age);
        }
        float angle=abs(normalize(cameraPosition-vWorld).y);
        float spec=pow(max(0.,wave*.5+.5),12.)*smoothstep(.24,.78,flow);
        vec3 water=mix(vec3(.008,.041,.053),vec3(.035,.120,.129),pow(1.-angle,1.4));
        water += vec3(.037,.082,.073)*flow + vec3(.24,.43,.38)*spec*.65;
        water += vec3(.43,.25,.066)*gold*.82 + vec3(.16,.38,.30)*ripple;
        water *= 1.-smoothstep(.81,1.02,edge)*.45;
        gl_FragColor=vec4(water,1.);
        #include <colorspace_fragment>
      }
    `
  }),pond.x,pond.y,pond.z);
  let next = 0;
  return {
    surface, u,
    touch(p,time){ ripples[next++ % ripples.length].set(p.x-pond.x,p.z-pond.z,time); },
    reset(){ for(const r of ripples) r.z=-100; next=0; },
  };
}

function flowers(parent, texture, rng) {
  const setups = [[-.54,.20,.80,0x9a9287],[-.26,-.49,1.24,0x9a97ae],[.47,-.39,.90,0xadb396],[.79,.42,.58,0xba9985],[-.37,.66,.57,0x9ca6b8],[.11,-.70,1.46,0xa895ad]];
  const petal = leafShape(-.14,.30,.03);
  const green = standard(0x647b4a);
  return setups.map(([x,z,h,color],id)=>{
    const root = vec(x,floorHeight(x,z),z);
    const tip = root.clone().add(vec(.055,h,-.065));
    stem(parent,[root,root.clone().lerp(tip,.48).add(vec(-.077,0,.031)),tip],.013,.006,green,13,6);
    const bloom = new T.Group();
    bloom.position.copy(tip);
    bloom.rotation.z=(rng()-.5)*.43;
    bloom.rotation.x=.12 + rng()*.20;
    parent.add(bloom);
    const petalMat = standard(color, { side:T.DoubleSide,vertexColors:true,roughness:.59,emissive:color,emissiveIntensity:.105 });
    const petals = [];
    const size = .22 + rng()*.078;
    for(let j=0;j<7;j++){
      const arm = new T.Group();
      arm.rotation.y = j*tau/7 + .2*id;
      bloom.add(arm);
      const m=makeMesh(arm, petal, petalMat,0,-.025,.017);
      m.scale.setScalar(size*(.88+rng()*.22));
      m.rotation.x=-1.38+(j%2)*.12;
      petals.push(m);
    }
    const centerMat=standard(0x94713e,{emissive:0xffac42,emissiveIntensity:.16});
    const center=makeMesh(bloom,new T.SphereGeometry(.059,12,8),centerMat,0,.011,0);
    center.scale.set(1,.65,1);
    const seedMat=standard(0xcea55d,{emissive:0xe89645,emissiveIntensity:.14});
    const seedGeo=new T.SphereGeometry(.012,6,5);
    for(let k=0;k<12;k++){
      const a=k*2.39996, r=.052*Math.sqrt(k/12);
      makeMesh(bloom,seedGeo,seedMat,r*Math.cos(a),.040+.018*(1-r/.053),r*Math.sin(a));
    }
    const aura = glow(bloom,texture,0xffc475,.73,0);
    aura.position.y=.060; aura.renderOrder=5;
    const pick = makeMesh(bloom,new T.SphereGeometry(size*.81,10,7),new T.MeshBasicMaterial({visible:false}),0,.10,0);
    const flower={tip,pick,petals,centerMat,seedMat,aura,petalMat,open:0,progress:0,pending:false};
    pick.userData.hit = { kind:'flower', object:flower };
    return flower;
  });
}

function mushrooms(parent, texture, rng) {
  const stemGeo = new T.CylinderGeometry(.045,.060,1,10);
  const capGeo = new T.LatheGeometry([new T.Vector2(0,-.020),new T.Vector2(.30,-.105),new T.Vector2(.70,-.12),new T.Vector2(.96,-.076),new T.Vector2(1,.01),new T.Vector2(.94,.17),new T.Vector2(.75,.40),new T.Vector2(.43,.55),new T.Vector2(.16,.59),new T.Vector2(0,.60)],23);
  const gillGeo = new T.SphereGeometry(1,21,10);
  const positions = [[-.57,.46,.29,.235],[-.75,.56,.18,.159],[-.38,.57,.155,.123],[.76,-.20,.33,.224],[.90,-.24,.19,.141],[.51,-.66,.24,.152],[-.44,-.67,.21,.150]];
  const stalkMat=standard(0x858b63,{emissive:0x528b67,emissiveIntensity:.14});
  const speckGeo=new T.SphereGeometry(1,6,5);
  const speckMat=standard(0xb3ccb5,{emissive:0x79ad83,emissiveIntensity:.17});
  return positions.map(([x,z,height,radius],i)=>{
    const root = new T.Group();
    root.position.set(x,floorHeight(x,z),z);
    root.rotation.set((rng()-.5)*.38,0,(rng()-.5)*.40);
    parent.add(root);
    const color = i < 3 || i===6 ? 0x80c8a0 : 0x9ec7c2;
    const capMat = standard(i < 3 || i===6 ? 0x548673 : 0x658f91,{emissive:color,emissiveIntensity:.36,roughness:.64});
    makeMesh(root,stemGeo,stalkMat,0,height*.48,0).scale.set(.67,height, .67);
    const cap = makeMesh(root,capGeo,capMat,0,height,0);
    cap.scale.setScalar(radius);
    const gillMat=standard(0xa6c596,{emissive:color,emissiveIntensity:.39});
    makeMesh(root,gillGeo,gillMat,0,height-.015,0).scale.set(radius*.93,radius*.105,radius*.93);
    for(let k=0;k<10;k++){
      const a=rng()*tau,r=.18+rng()*.66;
      const spot=makeMesh(root,speckGeo,speckMat,radius*r*Math.cos(a),height+radius*(.61-.61*r*r),radius*r*Math.sin(a));
      spot.scale.set(radius*(.016+rng()*.029),radius*.014,radius*(.022+rng()*.029));
    }
    const aura=glow(root,texture,color,radius*4.8,.23);
    aura.position.y=height; aura.renderOrder=5;
    const pick=makeMesh(root,new T.SphereGeometry(radius*1.13,10,7),new T.MeshBasicMaterial({visible:false}),0,height-.023,0);
    const mushroom={pick,capMat,gillMat,aura,boost:0,trigger:0,color,origin:root.position.clone().add(vec(0,height+.04,0))};
    pick.userData.hit={kind:'mushroom',object:mushroom};
    return mushroom;
  });
}

function canopy(parent,rng,small){
  const points = [];
  const strandCount = small? 21:34;
  for(let i=0;i<strandCount;i++){
    const start = rng()*tau, end = start + 1.16 + rng()*2.62;
    const up = rng()*.26+.52;
    const a = shellPoint(up,start,.94), b=shellPoint(.55+rng()*.26,end,.94);
    const mid = a.clone().lerp(b,.50).multiply(vec(.48,1,.48));
    mid.y = .80 + rng()*1.12;
    const curve = new T.CatmullRomCurve3([a,a.clone().lerp(mid,.46).add(vec(0,.15,0)),mid,b.clone().lerp(mid,.46).add(vec(0,.13,0)),b]);
    for(let j=0;j<30;j++) points.push(curve.getPoint(j/30),curve.getPoint((j+1)/30));
  }
  const g=new T.BufferGeometry().setFromPoints(points);
  const m=new T.LineBasicMaterial({color:0xb8c7af,opacity:.24,transparent:true,depthWrite:false});
  const lines = new T.LineSegments(g,m);
  lines.renderOrder=4;
  parent.add(lines);
}

export function makeGarden(parent, texture, small) {
  const root = new T.Group();
  parent.add(root);
  const rng = random(78432);
  const terrain=landscape(root,rng,small);
  const water=pool(root);
  const perches=flora(root,rng,small);
  const blooms=flowers(root,texture,rng);
  const fungi=mushrooms(root,texture,rng);
  canopy(root,rng,small);
  const targets=[...blooms.map(f=>f.pick),...fungi.map(f=>f.pick),water.surface];
  water.surface.userData.hit={kind:'water'};
  return {root,terrain,blooms,fungi,perches,water,targets};
}

export function updateBotanicals(garden, dt, reduced) {
  for(const f of garden.blooms) {
    f.progress = reduced ? f.open : T.MathUtils.damp(f.progress,f.open,1.25,dt);
    const p = smooth(f.progress,0,1);
    for(const [j,petal] of f.petals.entries()) petal.rotation.x=lerp(-1.39+(j%2)*.11,-.12+Math.sin(j*2.45)*.20,p);
    f.centerMat.emissiveIntensity=.16+p*1.12;
    f.seedMat.emissiveIntensity=.14+p*.84;
    f.petalMat.emissiveIntensity=.105+p*.19;
    f.aura.material.opacity=p*.50;
  }
  for(const m of garden.fungi) {
    m.trigger *= Math.exp(-dt*.77);
    m.boost=T.MathUtils.damp(m.boost,m.trigger,8,dt);
    m.capMat.emissiveIntensity=.36+m.boost*.76;
    m.gillMat.emissiveIntensity=.39+m.boost*.9;
    m.aura.material.opacity=.23+m.boost*.33;
  }
}
