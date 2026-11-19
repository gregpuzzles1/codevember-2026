import * as T from 'three';

export const vec = (x, y, z) => new T.Vector3(x, y, z);
export const tau = 2 * Math.PI;
export const lerp = T.MathUtils.lerp;
export const clamp = T.MathUtils.clamp;
export const smooth = (x, a, b) => T.MathUtils.smoothstep(x, a, b);

export function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function makeMesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function standard(color, options = {}) {
  return new T.MeshStandardMaterial({ color, roughness: 0.8, ...options });
}

export function stem(parent, points, base, tip, material, steps = 12, sides = 6) {
  const frames = new T.CatmullRomCurve3(points).computeFrenetFrames(steps, false);
  const curve = new T.CatmullRomCurve3(points);
  const positions = [], indices = [], uvs = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, c = curve.getPointAt(u), r = lerp(base, tip, u);
    for (let j = 0; j <= sides; j++) {
      const angle = tau * j / sides;
      const p = c.clone().addScaledVector(frames.normals[i], r * Math.cos(angle)).addScaledVector(frames.binormals[i], r * Math.sin(angle));
      positions.push(p.x, p.y, p.z);
      uvs.push(j / sides, u);
      if (i < steps && j < sides) {
        const k = i * (sides + 1) + j;
        indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return makeMesh(parent, g, material);
}

export function leafShape(curve = 0.34, broadness = 0.24, teeth = 0) {
  const positions = [], colors = [], indices = [];
  const steps = 16, sides = 8;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const width = Math.pow(Math.sin(Math.PI * u), 0.82) * broadness * (1 + teeth * Math.sin(10 * Math.PI * u));
    for (let j = 0; j <= sides; j++) {
      const v = (j / sides) * 2 - 1;
      positions.push(width * v, curve * Math.sin(Math.PI * u * .85) - width * v * v * .55, u);
      const vein = j === sides / 2 ? .17 : 0;
      const value = .62 + .22 * u + .12 * Math.abs(v) + vein;
      colors.push(value * .93, value, value * .82);
      if (i < steps && j < sides) {
        const k = i * (sides + 1) + j;
        indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export const noiseGLSL = `
float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.1,.2,.3));
  p *= 17.;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  return .55*noise3(p)+.27*noise3(p*2.04+3.3)+.12*noise3(p*4.13-5.2)+.06*noise3(p*8.29);
}
`;

export function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, alpha] of [[0, 1], [.11, .89], [.24, .50], [.49, .15], [.72, .041], [1, 0]]) {
    gradient.addColorStop(at, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}

export function glow(parent, tex, color, size, opacity) {
  const material = new T.SpriteMaterial({ map: tex, color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity, toneMapped: false });
  const sprite = new T.Sprite(material);
  sprite.scale.setScalar(size);
  parent.add(sprite);
  return sprite;
}

export function forest(scene, texture, small) {
  const sky = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false,
    vertexShader: `
      varying vec3 vWorld;
      void main() { vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      ${noiseGLSL}
      float trunks(vec3 n, float count, float seed, float blur) {
        float angle = atan(n.x,n.z)/6.2831853+.5;
        float px = angle*count;
        float total = 0.;
        for(int j=-1;j<=1;j++) {
          float i = mod(floor(px)+float(j),count);
          float r = hash(vec3(i,seed,8.));
          float width = mix(.044,.2,r*r);
          float center = float(j)+.14+.70*hash(vec3(i,7.,seed));
          center += n.y*(r-.5)*1.4 + sin(n.y*2.5+i)*.095;
          float d = abs(fract(px)-center);
          float trunk = 1.-smoothstep(width,width+blur,d);
          float branch = 1.-smoothstep(.017,.12,abs(fract(px)-center-max(0.,n.y+.10)*(.65+r*1.5)));
          total = max(total,max(trunk,branch*.62*smoothstep(-.1,.18,n.y)));
        }
        return total;
      }
      void main() {
        vec3 n = normalize(vWorld);
        vec3 lamp = normalize(vec3(-.55,.43,-.86));
        float beam = exp(-3.3*length(n-lamp));
        float diffuse = exp(-1.4*length(n-lamp));
        float haze = fbm(n*vec3(4.2,7.5,4.2)+2.);
        float low = smoothstep(-.76,.21,n.y);
        vec3 c = mix(vec3(.004,.012,.014),vec3(.018,.040,.039),low);
        c += vec3(.090,.130,.091)*(beam*.85+diffuse*.24)*(haze+.48);
        c += vec3(.018,.041,.060)*exp(-3.5*length(n-normalize(vec3(.72,.10,-1.))))*(.4+haze);
        float streak = sin(21.*n.x-11.*n.y+2.*haze+3.*n.z);
        c += vec3(.019,.028,.022)*pow(.5+.5*streak,4.)*diffuse;
        c *= 1.-trunks(n,44.,3.,.19)*.42;
        c *= 1.-trunks(n,26.,33.,.12)*.62;
        float canopy = smoothstep(.43,.82,n.y+(.39-haze)*.69);
        c = mix(c,c*vec3(.39,.46,.52),canopy*.78);
        gl_FragColor = vec4(c,1.);
        #include <colorspace_fragment>
      }
    `
  });
  const backdrop = makeMesh(scene, new T.SphereGeometry(48, 32, 20), sky);
  backdrop.renderOrder = -20;
  const rng = random(948);
  const positions = [], sizes = [], brightness = [];
  const count = small ? 115 : 225;
  for (let i = 0; i < count; i++) {
    const angle = rng() * tau, h = rng() * 16 - 8, distance = 3.7 + rng() * 21;
    positions.push(Math.cos(angle) * distance, h, Math.sin(angle) * distance);
    sizes.push(rng() ** 3 * .19 + .014);
    brightness.push(.12 + rng() ** 3 * .72);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('size', new T.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('brightness', new T.Float32BufferAttribute(brightness, 1));
  const uniforms = { time: { value: 0 }, scale: { value: 750 }, image: { value: texture } };
  const dust = new T.Points(geometry, new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: `
      uniform float time, scale;
      attribute float size, brightness;
      varying float vAlpha;
      void main() {
        vec3 p = position + vec3(sin(time*.25+position.z), cos(time*.21+position.x), sin(time*.2+position.y))*.23;
        vec4 view = modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(size*scale/max(1.,-view.z),1.,45.);
        vAlpha=brightness*(.80+.20*sin(time*.8+position.x));
      }`,
    fragmentShader: `
      uniform sampler2D image;
      varying float vAlpha;
      void main(){ gl_FragColor=vec4(.83,.65,.33,texture2D(image,gl_PointCoord).a*vAlpha); }
    `
  }));
  scene.add(dust);
  return { geometry, uniforms, count };
}

export function makeBranch(scene) {
  const bark = standard(0x37483a);
  bark.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 barkP;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nbarkP=position;');
    shader.fragmentShader = 'varying vec3 barkP;\n' + noiseGLSL + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float grooving = fbm(barkP*vec3(14.,115.,104.));
      float patina = fbm(barkP*vec3(3.4,11.,12.));
      diffuseColor.rgb *= mix(.38,1.32,grooving) * mix(.53,1.45,patina);
    `);
  };
  const limb = [vec(-8,4.43,-1.04), vec(-4.2,3.59,-.48), vec(-2.0,3.04,-.20), vec(-.5,2.83,.01), vec(.08,2.75,0), vec(1.24,2.87,-.40), vec(2.95,3.35,-.94), vec(4.2,3.93,-1.05)];
  stem(scene, limb, .32, .021, bark, 58, 11);
  const twigs = [
    [vec(-3.35,3.40,-.39),vec(-2.62,3.57,-.88),vec(-2.05,3.96,-1.11),vec(-1.81,4.43,-1.2)],
    [vec(-1.70,2.99,-.16),vec(-1.25,3.27,.09),vec(-.77,3.50,.33),vec(-.45,3.55,.42)],
    [vec(1.50,2.94,-.45),vec(2.13,2.86,-.33),vec(2.98,2.93,-.15),vec(3.56,3.13,-.30)],
    [vec(2.53,3.19,-.83),vec(2.73,3.58,-.79),vec(2.66,4.0,-.66)]
  ];
  for (const twig of twigs) stem(scene, twig, .095, .009, bark, 24, 8);
  const leaves = leafShape(.18, .25, .10);
  const leafMat = standard(0x405f42, { side: T.DoubleSide, vertexColors: true });
  const rng = random(74);
  for (let k = 0; k < twigs.length; k++) {
    const curve = new T.CatmullRomCurve3(twigs[k]);
    for (let i = 0; i < 5; i++) {
      const point = curve.getPointAt(.34 + i * .145);
      const leaf = makeMesh(scene, leaves, leafMat, point.x, point.y, point.z);
      leaf.rotation.set(.75 + rng() * 1.8, k * 2 + i * 2.5, -.38 + rng() * .76);
      leaf.scale.setScalar(.32 + .49 * rng());
    }
  }
}

export function shellPoint(u, a, extra = 1) {
  const s = Math.sin(Math.PI * u);
  const r = Math.pow(Math.max(0, s), .78) * (1.43 - .31 * u);
  const wobble = 1 + .037 * Math.sin(3 * a + u * 6) + .022 * Math.cos(a * 5 - u * 11) + .014 * Math.sin(a * 9 + u * 18);
  return vec(Math.cos(a) * r * wobble * extra + .12 * u * u - .07, -2.04 + 4.18 * u, Math.sin(a) * r * wobble * .92 * extra + .065 * Math.sin(u * Math.PI));
}

export function makeShell(parent, texture, small) {
  const positions = [], uvs = [], indexes = [];
  const levels = small ? 66 : 96, sides = small ? 83 : 124;
  for (let i = 0; i <= levels; i++) for (let j = 0; j <= sides; j++) {
    const u = i / levels, a = tau * j / sides;
    positions.push(...shellPoint(u, a).toArray()); uvs.push(j / sides, u);
    if (i < levels && j < sides) {
      const k = i * (sides + 1) + j;
      indexes.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indexes);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let i = 1; i < levels; i++) {
    const l = i * (sides + 1), r = l + sides;
    const n = vec(0,0,0).fromBufferAttribute(normals,l).add(vec(0,0,0).fromBufferAttribute(normals,r)).normalize();
    normals.setXYZ(l, n.x, n.y, n.z); normals.setXYZ(r, n.x, n.y, n.z);
  }
  for (let j = 0; j <= sides; j++) {
    normals.setXYZ(j, 0,-1,0); normals.setXYZ(levels*(sides+1)+j,0,1,0);
  }
  const embers = Array.from({ length: 7 }, () => new T.Vector4(0, -20, 0, 0));
  const uniforms = { reveal: { value: 0 }, eye: { value: vec(0,0,10) }, embers: { value: embers }, time: { value: 0 } };
  const effects = `
    uniform float reveal, time;
    uniform vec3 eye;
    uniform vec4 embers[7];
    float glimmers(vec3 p) {
      float gold=0.;
      for(int i=0;i<7;i++) {
        vec3 d=p-embers[i].xyz;
        gold+=embers[i].w*exp(-dot(d,d)*7.0);
      }
      return gold;
    }
  `;
  const vertexShader = `
    varying vec3 vPos, vNormal;
    varying vec2 vUv;
    void main(){vPos=position;vUv=uv;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `;
  const fragmentShader = `
    varying vec3 vPos,vNormal;
    varying vec2 vUv;
    ${noiseGLSL}
    ${effects}
    void main() {
      vec3 n = normalize(vNormal), p = vPos;
      float face = dot(n,normalize(eye-p));
      float rim = pow(1.-abs(face),2.3);
      float key = .42+.58*max(0.,dot(n,normalize(vec3(-.60,.62,-.33))));
      float tex = fbm(p*vec3(6.,4.,6.));
      float wriggle = fbm(p*vec3(8.,7.,8.))-.5;
      float a = vUv.x*6.2831853;
      float v = p.y;
      float f1 = sin(v*158.+a*18.+28.*wriggle+1.45*sin(9.*a+v*4.2));
      float f2 = sin(v*239.-a*31.+34.*wriggle+1.60*sin(13.*a-v*6.));
      float f3 = sin(v*96.+a*7.+18.*wriggle);
      float fiber = .53*pow(.5+.5*f1,10.)+.23*pow(.5+.5*f2,9.)+.25*pow(.5+.5*f3,13.);
      float knit = smoothstep(.31,.73,tex);
      float gold = glimmers(p);
      float bands = .69+.31*sin(v*9.4+4.1*sin(2.*a+v*1.36)+14.*wriggle);
      float belly = exp(-3.4*length((p-vec3(.03,-.72,.27))*vec3(.81,.57,.65)));
      vec3 c = mix(vec3(.056,.105,.084),vec3(.27,.34,.205),knit*.68 + .12);
      c *= key*(.7+bands*.26);
      c += vec3(.38,.42,.26)*fiber*(.25+key*.46+rim*.36);
      c += vec3(.28,.37,.23)*rim*(.36+knit*.64);
      c += vec3(.095,.164,.082)*belly;
      c += vec3(.43,.24,.062)*gold*(.32+fiber*.9);
      float taper = smoothstep(.006,.04,vUv.y)*(1.-smoothstep(.945,.999,vUv.y));
      float opaque = (.78+fiber*.18+rim*.10)*mix(.56,1.,taper);
      float farSide = .29 + rim*.28+fiber*.17;
      float nearSide = .012+rim*.20+gold*.10+fiber*.048;
      float inside = mix(farSide,nearSide,smoothstep(-.20,.38,face));
      gl_FragColor=vec4(c,mix(opaque,inside,reveal));
      #include <colorspace_fragment>
    }`;
  // Separate face passes keep translucent silk sorted around the solid garden.
  const back = makeMesh(parent, geometry, new T.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: T.BackSide }));
  const front = makeMesh(parent, geometry, new T.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: T.FrontSide }));
  back.renderOrder = 1; front.renderOrder = 6;
  const rng = random(3710);
  const linePoints = [], lineStrengths = [];
  for (let j = 0; j < (small ? 122 : 193); j++) {
    const u0 = rng() * .993 + .003;
    const a0 = rng() * tau;
    const turns = .30 + rng() * 1.8;
    const rise = (rng() - .48) * .16, wobble = .003 + rng() * .017;
    const steps = 42;
    const strength = rng() ** 2 * .78 + .11;
    const phase = rng() * tau;
    for (let k = 0; k < steps; k++) for (let endpoint = 0; endpoint <= 1; endpoint++) {
      const t = (k + endpoint) / steps;
      const a = a0 + t * turns * tau;
      const u = clamp(u0 + t * rise + wobble * Math.sin(a * 1.9 + phase) + .0045 * Math.sin(a * 7 + phase), .002, .998);
      linePoints.push(...shellPoint(u,a,1.005+j%5*.0014).toArray());
      lineStrengths.push(strength * Math.pow(Math.sin(t * Math.PI), .33));
    }
  }
  const strands = new T.BufferGeometry();
  strands.setAttribute('position', new T.Float32BufferAttribute(linePoints,3));
  strands.setAttribute('strength', new T.Float32BufferAttribute(lineStrengths,1));
  const fiber = new T.LineSegments(strands, new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float strength;
      varying float vStrength;
      varying vec3 vPos;
      void main(){vStrength=strength;vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader: `
      ${effects}
      varying float vStrength;
      varying vec3 vPos;
      void main(){
        vec3 n=normalize(vec3(vPos.x, vPos.y*.36, vPos.z));
        float face=dot(n,normalize(eye-vPos));
        float rim=pow(1.-abs(face),2.);
        float gold=glimmers(vPos);
        float outside=(.10+.58*rim+.36*max(0.,face))*smoothstep(-.36,.16,face);
        float inside=.035+.42*rim+.10*(1.-smoothstep(-.14,.22,face))+gold*.34;
        vec3 c=mix(vec3(.52,.62,.47),vec3(.95,.68,.34),clamp(gold*.58,0.,1.));
        gl_FragColor=vec4(c,vStrength*mix(outside,inside,reveal));
      }
    `
  }));
  fiber.renderOrder = 7;
  parent.add(fiber);
  const veil = glow(parent, texture, 0x77d7aa, 5.8, .10);
  veil.position.set(0,-.16,-.07); veil.renderOrder = 3;
  return { uniforms, front, veil };
}
