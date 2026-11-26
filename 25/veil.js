import * as THREE from 'three';

const fogCenter = new THREE.Vector3(-.22, 5.1, .25);
const keyCenter = new THREE.Vector3(0, 5.6, 0);
const revealDuration = 3600;

function cloudNoise() {
  const size = 48;
  const bytes = new Uint8Array(size ** 3);
  const smooth = (x) => x*x*(3 - 2*x);

  function makeNoise(cells, seed) {
    const grid = new Float32Array(cells ** 3);
    for (let i = 0; i < grid.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      grid[i] = seed / 4294967296;
    }
    const at = (x, y, z) => grid[(z % cells) * cells * cells + (y % cells) * cells + x % cells];
    const step = cells / size;
    const lerp = THREE.MathUtils.lerp;
    return (x, y, z) => {
      const i = Math.floor(x * step), j = Math.floor(y * step), k = Math.floor(z * step);
      const u = smooth(x * step - i), v = smooth(y * step - j), w = smooth(z * step - k);
      return lerp(
        lerp(lerp(at(i,j,k), at(i+1,j,k), u), lerp(at(i,j+1,k), at(i+1,j+1,k), u), v),
        lerp(lerp(at(i,j,k+1), at(i+1,j,k+1), u), lerp(at(i,j+1,k+1), at(i+1,j+1,k+1), u), v), w);
    };
  }

  const low = makeNoise(7, 42);
  const mid = makeNoise(15, 180);
  const high = makeNoise(31, 1180);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        bytes[(z * size + y) * size + x] =
          Math.round((.59 * low(x,y,z) + .29 * mid(x,y,z) + .12 * high(x,y,z)) * 255);
      }
    }
  }

  const texture = new THREE.Data3DTexture(bytes, size, size, size);
  texture.format = THREE.RedFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  function sample(x, y, z) {
    const wrap = (index) => THREE.MathUtils.euclideanModulo(index, size);
    const at = (i, j, k) => bytes[(wrap(k) * size + wrap(j)) * size + wrap(i)] / 255;
    const px = x * size - .5, py = y * size - .5, pz = z * size - .5;
    const i = Math.floor(px), j = Math.floor(py), k = Math.floor(pz);
    const u = px - i, v = py - j, w = pz - k;
    const lerp = THREE.MathUtils.lerp;
    return lerp(
      lerp(lerp(at(i,j,k), at(i+1,j,k), u), lerp(at(i,j+1,k), at(i+1,j+1,k), u), v),
      lerp(lerp(at(i,j,k+1), at(i+1,j,k+1), u), lerp(at(i,j+1,k+1), at(i+1,j+1,k+1), u), v), w);
  }

  return {texture, sample};
}

const vertexShader = /* glsl */ `
  varying vec2 vScreen;
  void main() {
    vScreen = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp sampler3D;
  varying vec2 vScreen;
  uniform sampler2D scenery, sceneDepth;
  uniform sampler3D turbulence;
  uniform mat4 clipToWorld;
  uniform vec3 eye, origin, radii, touchPoint;
  uniform float time, progress;
  uniform vec3 underside, sunlight;

  vec3 worldAt(float z) {
    vec4 p = clipToWorld * vec4(vScreen * 2. - 1., z, 1.);
    return p.xyz / p.w;
  }

  vec2 interval(vec3 direction) {
    vec3 o = (eye - origin - vec3(1.8 * progress, 0., 0.)) / radii;
    vec3 d = direction / radii;
    float a = dot(d, d);
    float b = dot(o, d);
    float c = dot(o, o) - 1.31;
    float root = b*b - a*c;
    if (root <= 0.) return vec2(1., 0.);
    return (-b + vec2(-1., 1.) * sqrt(root)) / a;
  }

  void main() {
    vec3 landscape = texture2D(scenery, vScreen).rgb;
    vec3 direction = normalize(worldAt(1.) - eye);
    float depth = texture2D(sceneDepth, vScreen).r;
    float distanceToScene = length(worldAt(depth * 2. - 1.) - eye);
    vec2 span = interval(direction);
    float first = max(span.x, 0.);
    float last = min(span.y, distanceToScene);
    vec3 cloud = vec3(0.);
    float visibility = 1.;

    if (last > first) {
      const int samples = 30;
      float stepSize = (last - first) / float(samples);
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
      vec3 wind = vec3(time * .19, 0., -time * .063);
      float veil = 1. - smoothstep(.32, .98, progress);
      float opening = 27. * pow(progress, 1.05);
      for (int i = 0; i < samples; i++) {
        vec3 p = eye + direction * (first + (float(i) + .25 + jitter*.5) * stepSize);
        vec3 body = (p - origin - vec3(1.8 * progress, 0., 0.)) / radii;
        float outer = length(body);
        vec3 samplePoint = (p - wind - vec3(7.0*progress, 0., 0.)) * vec3(.077, .103, .094);
        float textureValue = texture(turbulence, samplePoint).r;
        float shape = outer + (textureValue - .47) * .49;
        float softEdge = 1. - smoothstep(.70, 1.035, shape);
        float cloudDensity = softEdge * smoothstep(.16, .74, textureValue) * 2.6;
        cloudDensity *= smoothstep(-.6, .6, p.y) * veil;

        if (progress > 0.) {
          // Measuring from the contact point makes the opening travel through the bank in 3D.
          float fromTouch = length((p - touchPoint) * vec3(1., 1., .72));
          fromTouch += (textureValue - .52) * 4.1;
          cloudDensity *= smoothstep(opening - 1.7, opening + 2.0, fromTouch);
        }

        float height = smoothstep(-.72, .98, body.y);
        float glow = clamp(.22 + .59 * height + .22 * (1. - textureValue) + .15 * body.x, 0., 1.);
        vec3 tint = mix(underside, sunlight, glow);
        float opacity = 1. - exp(-cloudDensity * stepSize);
        cloud += visibility * opacity * tint;
        visibility *= 1. - opacity;
        if (visibility < .008) break;
      }
    }

    gl_FragColor = vec4(cloud + visibility * landscape, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createVeil(renderer) {
  const fogRadius = new THREE.Vector3();
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter
  });
  const turbulence = cloudNoise();
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      scenery: {value: target.texture},
      sceneDepth: {value: target.depthTexture},
      turbulence: {value: turbulence.texture},
      clipToWorld: {value: new THREE.Matrix4()},
      eye: {value: new THREE.Vector3()},
      origin: {value: fogCenter},
      radii: {value: fogRadius},
      touchPoint: {value: new THREE.Vector3()},
      time: {value: 0},
      progress: {value: 0},
      underside: {value: new THREE.Color('#9baebe')},
      sunlight: {value: new THREE.Color('#fff9e8')}
    }
  });
  const pass = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  pass.add(quad);
  const screenCamera = new THREE.Camera();
  const scaledEye = new THREE.Vector3();
  const scaledRay = new THREE.Vector3();
  const samplePoint = new THREE.Vector3();
  const cloudPoint = new THREE.Vector3();
  const drawingSize = new THREE.Vector2();
  const uniforms = material.uniforms;

  return {
    duration: revealDuration,
    resize(width, height) {
      const wide = THREE.MathUtils.smoothstep(width / height, 1.25, 2.05);
      const short = 1 - THREE.MathUtils.smoothstep(height, 430, 580);
      const landscape = wide * short;
      fogRadius.set(11.8 + 4.8 * landscape, 8.0 + .65 * landscape, 8.1 + 4.0 * landscape);
      renderer.getDrawingBufferSize(drawingSize);
      target.setSize(drawingSize.x, drawingSize.y);
    },
    hit(ray) {
      scaledEye.copy(ray.origin).sub(fogCenter).divide(fogRadius);
      scaledRay.copy(ray.direction).divide(fogRadius);
      const a = scaledRay.lengthSq();
      const b = scaledEye.dot(scaledRay);
      const c = scaledEye.lengthSq() - 1.31;
      const discriminant = b*b - a*c;
      if (discriminant <= 0) return null;
      const end = (-b + Math.sqrt(discriminant)) / a;
      const start = Math.max(0, (-b - Math.sqrt(discriminant)) / a);
      if (end <= start) return null;

      // Integrate the same density as the fog pass, so blue sky around its edge stays inert.
      const step = (end - start) / 36;
      const time = uniforms.time.value;
      const smooth = THREE.MathUtils.smoothstep;
      let thickness = 0;
      for (let distance = start + step * .5; distance < end; distance += step) {
        ray.at(distance, samplePoint);
        if (samplePoint.y < -.2) continue;
        const noise = turbulence.sample((samplePoint.x - time * .19) * .077,
          samplePoint.y * .103, (samplePoint.z + time * .063) * .094);
        const shape = cloudPoint.copy(samplePoint).sub(fogCenter).divide(fogRadius).length() +
          (noise - .47) * .49;
        const edge = 1 - smooth(shape, .70, 1.035);
        thickness += edge * smooth(noise, .16, .74) * 2.6 * smooth(samplePoint.y, -.6, .6) * step;
        if (thickness >= .075) return samplePoint.clone();
      }
      return null;
    },
    start(point) {
      uniforms.touchPoint.value.copy(point ?? keyCenter);
    },
    render(scene, camera, time, progress) {
      camera.updateMatrixWorld();
      uniforms.clipToWorld.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      uniforms.eye.value.copy(camera.position);
      uniforms.time.value = time;
      uniforms.progress.value = progress;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(pass, screenCamera);
    }
  };
}
