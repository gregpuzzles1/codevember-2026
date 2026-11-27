import * as THREE from './vendor/three.module.min.js';

const surfaceVertex = `
  varying vec3 point;
  varying vec3 inward;
  void main() {
    point = (modelMatrix * vec4(position, 1.0)).xyz;
    inward = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const surfaceFragment = `
  varying vec3 point;
  varying vec3 inward;
  const float PI = 3.14159265;
  const vec3 lookCenter = vec3(-2.1,-4.94,2.02);
  const vec3 nurseryCenter = vec3(1.72,-5.45,4.52);
  const vec3 denCenter = vec3(5.35,-4.94,1.37);

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float grain(vec3 p) {
    return hash(floor(p.xy+vec2(p.z*3.19,p.z*7.53)));
  }
  float edge(float x, float at, float softness) {
    return smoothstep(at-softness,at+softness,x);
  }
  float falloff(vec3 a, vec3 b, float strength) {
    return 1.0/(1.0+dot(a-b,a-b)*strength);
  }

  vec3 ribbon(vec3 p) {
    float shift = smoothstep(-10.5,-7.1,p.x);
    float axisY = mix(-2.6,-4.5,shift) - smoothstep(-7.1,-3.7,p.x)*.45;
    float axisZ = 3.56 + .48*shift - smoothstep(-7.1,-3.7,p.x)*1.13;
    float theta = atan(p.y-axisY,p.z-axisZ);
    float wrap = theta/PI*3.0 + .24*sin((p.x+7.3)*.78+theta) + .19*p.x;
    float stripes = fract(wrap);
    float aa = min(.06,fwidth(wrap)*.72+.003);
    vec3 c = mix(vec3(.094,.22,.64),vec3(.085,.67,.67),edge(stripes,.31,aa));
    c = mix(c,vec3(.97,.61,.20),edge(stripes,.74,aa));
    float binding = 1.0-edge(min(abs(stripes-.31),abs(stripes-.74)),.019,aa);
    c = mix(c,vec3(.99,.83,.46),binding*.75);
    c += .04*cos(wrap*12.0+theta*3.0);
    return c;
  }

  vec3 tileSample(vec2 uv) {
    uv *= 1.61;
    uv.x += step(.5,fract(floor(uv.y)*.5))*.5;
    vec2 cell = floor(uv), tile = fract(uv);
    float h = hash(cell + vec2(19,27));
    float pale = step(.56,h);
    vec3 c = mix(mix(vec3(.095,.26,.53),vec3(.32,.60,.81),h*1.58),
      mix(vec3(.68,.81,.83),vec3(.95,.96,.86),h),pale);
    vec2 rounded = max(abs(tile-.5)-.427,0.0);
    float grout = smoothstep(.036,.063,length(rounded));
    float sheen = .10*(1.0-tile.y) + .026*sin(tile.x*8.0+tile.y*5.0);
    return mix(c*(1.0+sheen),vec3(.105,.18,.25),grout*.93);
  }

  vec3 projections(vec3 n) {
    vec3 weight = pow(abs(n),vec3(7.0));
    return weight/(weight.x+weight.y+weight.z);
  }

  vec3 mosaic(vec3 p, vec3 n) {
    vec3 q = p-lookCenter;
    vec3 weight = projections(n);
    return tileSample(q.zy)*weight.x + tileSample(q.xz)*weight.y + tileSample(q.xy)*weight.z;
  }

  float coralStamp(vec2 uv) {
    uv *= 2.35;
    uv.x += step(.5,fract(floor(uv.y)*.5))*.5;
    return 1.0-smoothstep(.145,.185,length(fract(uv)-.5));
  }

  vec3 nursery(vec3 p, vec3 n) {
    vec3 q = p-nurseryCenter;
    float depth = q.z*.92 - .11*q.y + .10*abs(q.x);
    float ridge = abs(fract(depth+.31)-.5);
    float arch = 1.0-smoothstep(.068,.104,ridge);
    vec3 satin = mix(vec3(.47,.35,.55),vec3(.74,.55,.73),.53+.31*n.y);
    satin = mix(satin,vec3(.89,.73,.86),arch*.84);
    vec3 weight = projections(n);
    float motif = coralStamp(q.zy)*weight.x + coralStamp(q.xz)*weight.y + coralStamp(q.xy)*weight.z;
    satin = mix(satin,vec3(.98,.56,.43),motif*(1.0-arch*.84));
    float warm = falloff(p,nurseryCenter+vec3(.10,.40,1.15),.92);
    return satin + vec3(.07,.039,.032)*warm;
  }

  vec3 geometricFloor(vec2 p) {
    vec2 center = p - vec2(.75,.13);
    float radius = length(center);
    float around = atan(center.y,center.x);
    float petals = abs(cos(around*6.0));
    float star = step(radius, .63 + petals*.65);
    float outline = step(radius, .73 + petals*.67);
    vec2 uv = p*2.0;
    vec2 tile = fract(uv);
    vec2 cell = floor(uv);
    float stripe = step(tile.x,tile.y);
    float choice = hash(cell+vec2(stripe*9.12,9.4));
    vec3 c = mix(vec3(.15,.42,.42),vec3(.93,.66,.29),step(.42,choice));
    c = mix(c,vec3(.44,.18,.28),step(.75,choice));
    c = mix(c,vec3(.89,.75,.47),outline);
    c = mix(c,vec3(.12,.31,.39),star);
    c = mix(c,vec3(.99,.75,.33),1.0-smoothstep(.044,.07,abs(radius-.36)));
    return c;
  }

  vec3 gathering(vec3 p, vec3 n) {
    vec3 q = p-denCenter;
    float theta = atan(q.y,q.z);
    float stencil = q.x*1.09 + .12*cos(theta*2.0);
    float rings = fract(stencil);
    vec3 wall = mix(vec3(.22,.45,.43),vec3(.35,.58,.50),.5+.5*cos(stencil*PI*2.0));
    wall = mix(wall,vec3(.77,.54,.27),1.0-smoothstep(.10,.16,abs(rings-.49)));
    wall = mix(wall,vec3(.10,.29,.32),1.0-smoothstep(.025,.054,abs(rings-.49)));
    float lattice = abs(fract(theta*3.5+.15*cos(q.x*5.0))-.5)*2.0;
    wall = mix(wall,vec3(.89,.59,.38),smoothstep(.61,.80,lattice)*smoothstep(.33,.44,rings)*.66);
    float floorMask = smoothstep(.32,.68,n.y) * (1.0-smoothstep(-5.9,-5.35,p.y));
    return mix(wall,geometricFloor(q.xz),floorMask);
  }

  vec3 spiral(vec3 p) {
    float bend = smoothstep(8.5,11.65,p.x);
    float side = atan(p.y-mix(-4.32,-2.15,bend),p.z-mix(-1.04,-2.78,bend));
    float wind = p.x*.95 + p.y*.48 - p.z*.3;
    float chevron = wind+abs(fract(side/PI*2.5+.54)-.5)*1.04;
    float f = fract(chevron);
    float aa = min(.08,.002+fwidth(chevron)*.65);
    vec3 c = mix(vec3(.11,.30,.27),vec3(.31,.58,.32),edge(f,.33,aa));
    c = mix(c,vec3(.89,.70,.31),edge(f,.73,aa));
    c = mix(c,vec3(.98,.85,.49),(1.0-edge(abs(f-.74),.038,aa))*.82);
    return c;
  }

  void main() {
    vec3 p = point;
    vec3 n = normalize(inward);
    bool west = p.x < 0.0;
    if (p.y > .57) discard;
    vec3 c;
    if (p.x < -3.35) {
      c = ribbon(p);
      if (p.x > -5.25) {
        c = mix(c,mosaic(p,n),smoothstep(-5.20,-3.35,p.x));
      }
    } else if (p.x < .36 || (p.z < -.9 && p.x < 3.0)) {
      c = mosaic(p,n);
      c *= mix(.69,1.0,smoothstep(-3.0,1.0,p.z));
    } else if (p.x < 3.65 && p.z > 2.8) {
      c = nursery(p,n);
      float threshold = max(smoothstep(3.10,3.65,p.x),1.0-smoothstep(2.8,3.65,p.z));
      c = mix(c,gathering(p,n),threshold);
    } else if (p.x < 8.10) {
      c = gathering(p,n);
      if (p.x > 6.80) c = mix(c,spiral(p),smoothstep(6.80,8.10,p.x));
    } else {
      c = spiral(p);
    }

    float roughness = smoothstep(-2.0,-.66,p.y);
    float strata = .5+.5*sin(p.y*29.0+sin(p.x*6.5)*.7+sin(p.z*8.0));
    float speckle = grain(p*67.0);
    vec3 soil = mix(vec3(.23,.14,.095),vec3(.43,.29,.16),strata*.59+speckle*.41);
    c = mix(c,soil,roughness);

    float breath = .72 + .12*max(n.y,0.0) + .085*max(0.0,dot(n,normalize(vec3(-.3,-.26,.9))));
    float roomLight = .40*falloff(p,lookCenter+vec3(-.35,.62,.21),.46);
    roomLight += .46*falloff(p,nurseryCenter+vec3(-.16,.38,.65),.63);
    roomLight += .43*falloff(p,denCenter+vec3(-.3,.87,.4),.31);
    roomLight += .16*falloff(p,vec3(-6.6,-4.14,3.75),.48);
    roomLight += .21*falloff(p,vec3(-.63,-4.92,-2.73),.82);
    vec3 opening = west ? vec3(-11,.50,3.0) : vec3(12.6,.52,-1.95);
    float daylight = falloff(p,opening,.62)*smoothstep(-3.4,.53,p.y);
    float distanceFade = 1.0-smoothstep(3.1,13.0,distance(p,cameraPosition));
    float fill = .51 + .33*distanceFade + .25*roomLight;
    vec3 lit = c * (breath + roomLight*.52 + daylight*.91) * fill;
    lit *= .94 + .11*speckle;
    lit += vec3(.027,.033,.031)*distanceFade + vec3(.116,.095,.055)*daylight;
    gl_FragColor = vec4(lit,1.0);
  }
`;

function carvedMesh(data) {
  const header = new DataView(data, 0, 8);
  const vertexCount = header.getUint32(0, true);
  const indexCount = header.getUint32(4, true);
  const pos = new Float32Array(data, 8, vertexCount * 3);
  const normalOffset = 8 + vertexCount * 12;
  const normal = new THREE.InterleavedBuffer(new Int16Array(data,normalOffset,vertexCount*4), 4);
  const index = new Uint32Array(data,normalOffset+vertexCount*8,indexCount);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(normal,3,0,true));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment,
    side: THREE.FrontSide,
  }));
}

function chamberRibs() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:.56, metalness:.13,
  });
  const pigments = ['#271e1f','#ac6342','#e4a862','#3d6c67','#efcca0'].map(hex => new THREE.Color(hex));
  const tint = new THREE.Color();
  const segments = 64, sides = 8;
  for (const offset of [-1.99,-1.28,-.56,.17,.89,1.61,2.18]) {
    const factor = Math.sqrt(1 - (offset/3.12)**2);
    const points = [];
    for (let i=0; i<=32; i++) {
      const theta = .04 + i/32*(Math.PI-.08);
      points.push(new THREE.Vector3(5.35+offset,
        -4.94+2.14*factor*Math.sin(theta)*.966,
        1.37+2.76*factor*Math.cos(theta)*.966));
    }
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,.065,sides,false);
    const colors = [];
    for(let i=0;i<=segments;i++){
      for(let j=0;j<=sides;j++){
        const block = Math.floor(i/4)%4;
        tint.copy(pigments[block]);
        if ((j===2 || j===6) && block !== 0) tint.lerp(pigments[4],.57);
        colors.push(tint.r,tint.g,tint.b);
      }
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    group.add(new THREE.Mesh(geometry,material));
  }
  return group;
}

function nurseryArches() {
  const group = new THREE.Group();
  const glaze = new THREE.MeshStandardMaterial({color:'#c7a9da',roughness:.63});
  for (const z of [4.56,5.49]) {
    const factor = Math.sqrt(1 - ((z-4.52)/1.75)**2);
    const points = [];
    for (let i=0; i<=24; i++) {
      const theta = -.36 + i/24*(Math.PI+.72);
      points.push(new THREE.Vector3(1.72+1.92*factor*Math.cos(theta)*.971,
        -5.45+1.40*factor*Math.sin(theta)*.961,z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,42,.052,8,false),glaze));
  }
  return group;
}

function embeddedLights() {
  const group = new THREE.Group();
  const lampMetal = new THREE.MeshStandardMaterial({color:'#754e39',metalness:.45,roughness:.45});
  const lampGlass = new THREE.MeshBasicMaterial({color:'#ffdd96'});
  const dishGeometry = new THREE.SphereGeometry(1, 16, 10);
  const lampPositions = [[4.98,-3.04,1.06], [6.45,-3.24,1.04], [3.81,-3.37,1.36]];
  for (const [x,y,z] of lampPositions) {
    const dish = new THREE.Mesh(dishGeometry,lampMetal);
    dish.position.set(x,y,z);
    dish.scale.set(.17,.10,.23);
    const lens = new THREE.Mesh(dishGeometry,lampGlass);
    lens.position.set(x,y-.074,z);
    lens.scale.set(.115,.058,.158);
    group.add(dish,lens);
  }
  const fill = new THREE.HemisphereLight('#ffe4b2','#394555',1.37);
  const warm = new THREE.PointLight('#ffe2b0',26,10,1.8);
  warm.position.set(4.98,-3.43,1.17);
  group.add(fill,warm);
  return group;
}

export function createBurrow(data) {
  const group = new THREE.Group();
  group.add(carvedMesh(data),chamberRibs(),nurseryArches(),embeddedLights());
  return group;
}
