// Erosion simulation on a heightfield: stream-power incision, sediment transport and
// deposition, and talus/cliff collapse. Rock strata control how fast each layer erodes
// and how steep it can stand, so hard caprock forms cliffs and soft shale forms slopes.

export const WORLD = 120;

export const LAYERS = [
  { name: 'Vishnu schist',      top: 2.6,  color: '#3d3742', k: 0.14, talus: 1.8 },
  { name: 'Tapeats sandstone',  top: 3.4,  color: '#76503c', k: 0.3,  talus: 2.0 },
  { name: 'Bright Angel shale', top: 4.8,  color: '#8f8764', k: 1.5,  talus: 0.5 },
  { name: 'Muav limestone',     top: 5.6,  color: '#a99a7c', k: 0.7,  talus: 0.9 },
  { name: 'Redwall limestone',  top: 7.8,  color: '#b98a68', k: 0.22, talus: 2.8 },
  { name: 'Supai group',        top: 9.6,  color: '#b5553a', k: 0.9,  talus: 0.8 },
  { name: 'Hermit shale',       top: 10.6, color: '#8e402f', k: 1.7,  talus: 0.5 },
  { name: 'Coconino sandstone', top: 12.0, color: '#e8d4a8', k: 0.28, talus: 2.6 },
  { name: 'Toroweap formation', top: 12.8, color: '#cfae80', k: 1.1,  talus: 0.7 },
  { name: 'Kaibab limestone',   top: 14.0, color: '#d3c8a8', k: 0.2,  talus: 3.0 },
  { name: 'Moenkopi formation', top: 15.6, color: '#a65f4a', k: 1.8,  talus: 0.5 },
  { name: 'Chinle formation',   top: 16.8, color: '#9b8191', k: 2.0,  talus: 0.45 },
  { name: 'Wingate sandstone',  top: 40,   color: '#c96a3b', k: 0.3,  talus: 2.6 },
];

const LUT_RES = 100;
const LUT_N = 4200;
const kLUT = new Float32Array(LUT_N);
const talusLUT = new Float32Array(LUT_N);
for (let i = 0; i < LUT_N; i++) {
  const y = i / LUT_RES;
  const L = LAYERS.find(l => y < l.top) || LAYERS[LAYERS.length - 1];
  kLUT[i] = L.k;
  talusLUT[i] = L.talus;
}
const lutIndex = y => Math.min(LUT_N - 1, Math.max(0, (y * LUT_RES) | 0));
export const rockK = y => kLUT[lutIndex(y)];
export const rockTalus = y => talusLUT[lutIndex(y)];

// Cumulative horizontal run needed to climb to height z along a natural stepped slope.
const RUN = new Float32Array(LUT_N);
for (let i = 1; i < LUT_N; i++) {
  const t = talusLUT[i - 1];
  const walk = t * (t > 1.5 ? 0.92 : 0.7);
  RUN[i] = RUN[i - 1] + (1 / LUT_RES) / walk;
}
export function runAt(z) {
  const f = Math.min(LUT_N - 1.001, Math.max(0, z * LUT_RES));
  const i = f | 0;
  return RUN[i] + (RUN[i + 1] - RUN[i]) * (f - i);
}
export function heightForRun(u) {
  if (u <= 0) return 0;
  if (u >= RUN[LUT_N - 1]) return (LUT_N - 1) / LUT_RES;
  let lo = 0, hi = LUT_N - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (RUN[m] <= u) lo = m; else hi = m;
  }
  const f = (u - RUN[lo]) / Math.max(1e-9, RUN[hi] - RUN[lo]);
  return (lo + f) / LUT_RES;
}

// ---- Noise ---------------------------------------------------------------------------------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GR = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
export function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const g = (ix, iy, x, y) => { const v = GR[perm[(perm[ix & 255] + iy) & 255] & 7]; return v[0] * x + v[1] * y; };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = g(xi, yi, xf, yf), b = g(xi + 1, yi, xf - 1, yf);
    const c = g(xi, yi + 1, xf, yf - 1), d = g(xi + 1, yi + 1, xf - 1, yf - 1);
    return (a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v) * 1.4;
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- Landscape -------------------------------------------------------------------------------
export const PLATEAU = 13.7;
export const BED0 = 4.3;
export const BED_SLOPE = 0.013;
export const WATER_DEPTH = 0.55;
export const bedAt = x => BED0 + BED_SLOPE * (Math.min(140, Math.max(-140, x)) + 60);
export const waterLevelAt = x => bedAt(x) + WATER_DEPTH;

export function createLandscape(seed) {
  const noise = makeNoise(seed * 31 + 7);
  const rnd = mulberry32(seed * 977 + 3);
  const a1 = 6 + rnd() * 3, f1 = 0.05 + rnd() * 0.015, p1 = rnd() * 6.28;
  const a2 = 2.5 + rnd() * 1.5, f2 = 0.12 + rnd() * 0.03, p2 = rnd() * 6.28;
  const z0 = -4 - rnd() * 6;
  const zc = x => z0 + a1 * Math.sin(f1 * x + p1) + a2 * Math.sin(f2 * x + p2);
  const dzc = x => a1 * f1 * Math.cos(f1 * x + p1) + a2 * f2 * Math.cos(f2 * x + p2);

  const buttes = [];
  for (let tries = 0; tries < 200 && buttes.length < 5; tries++) {
    const bx = (rnd() - 0.5) * 100;
    const bz = (rnd() - 0.5) * 100;
    const R = 11 + rnd() * 6;
    const T = 18.4 + rnd() * 1.4;
    if (Math.abs(bz - zc(bx)) < R + 12) continue;
    if (bz > 22) continue;
    if (buttes.some(b => Math.hypot(b.x - bx, b.z - bz) < 28)) continue;
    buttes.push({ x: bx, z: bz, R, T });
  }

  const runPlateau = runAt(PLATEAU);

  function plateauTop(x, z) {
    const dz = Math.abs(z - zc(x));
    let t = PLATEAU + 0.025 * Math.max(0, dz - 8) + 0.008 * Math.min(60, Math.max(-60, x));
    t += 6.2 * smooth(14, 62, z);
    t += 2.2 * smooth(15, 62, -z);
    t += 0.3 * noise(x * 0.045 + 5, z * 0.045) + 0.14 * noise(x * 0.12, z * 0.12 + 9) + 0.04 * noise(x * 0.4, z * 0.4);
    return t;
  }

  function height(x, z) {
    const c = zc(x);
    const sl = dzc(x);
    const dRaw = Math.abs(z - c) / Math.sqrt(1 + sl * sl);
    let d = dRaw + 2.8 * noise(x * 0.06 + 11, z * 0.06) + 1.1 * noise(x * 0.19, z * 0.19 + 5);
    d = Math.max(0, d - 2.0);
    const stairs = heightForRun(runAt(bedAt(x)) + d);
    let hgt = Math.min(plateauTop(x, z), stairs);
    // a narrow river channel set into a low floodplain where tributary sediment can pile up
    const dc = dRaw + 0.4 * noise(x * 0.15 + 21, z * 0.15);
    hgt = Math.max(hgt, Math.min(plateauTop(x, z), bedAt(x) + 0.85 * smooth(1.1, 2.8, dc)));
    for (const b of buttes) {
      const r = Math.hypot(x - b.x, z - b.z) + 1.8 * noise(x * 0.12 + 3, z * 0.12);
      if (r < b.R) hgt = Math.max(hgt, Math.min(b.T, heightForRun(runPlateau + (b.R - r))));
    }
    const rr = Math.max(Math.abs(x), Math.abs(z));
    if (rr > WORLD / 2) {
      const f = smooth(WORLD / 2, 280, rr);
      const ridge = 1 - Math.abs(noise(x * 0.012 + 40, z * 0.012));
      hgt += f * (4 + 12 * ridge * ridge + 3 * noise(x * 0.03, z * 0.03));
    }
    return hgt;
  }

  return { height, zc, buttes };
}

// ---- Simulation --------------------------------------------------------------------------------
const SQRT2 = Math.SQRT2;
const KE = 0.0018;     // detachment per year
const KC = 0.0035;     // transport capacity per year
const QC = 4;          // discharge needed before flowing water can cut a channel
const K_SED = 3.0;     // loose sediment erodes faster than rock
const T_SED = 0.62;    // angle of repose for loose material (rise/run)

export class Terrain {
  constructor(n = 176, seed = 1) {
    this.n = n;
    this.size = WORLD;
    this.dx = WORLD / (n - 1);
    const N2 = n * n;
    this.h = new Float32Array(N2);
    this.h0 = new Float32Array(N2);
    this.sed = new Float32Array(N2);
    this.wet = new Float32Array(N2);
    this.rain = new Float32Array(N2);
    this.Q = new Float32Array(N2);
    this.L = new Float32Array(N2);
    this.drain = new Float32Array(N2);
    this.wl = new Float32Array(N2);
    this.floor = new Float32Array(N2);
    this.dh = new Float32Array(N2);
    this.inS = new Float32Array(N2);
    this.outS = new Float32Array(N2);
    this.keys = new Uint16Array(N2);
    this.order = new Uint32Array(N2);
    this.orderTmp = new Uint32Array(N2);
    this.off = new Int32Array([-1, 1, -n, n, -n - 1, -n + 1, n - 1, n + 1]);
    const dd = this.dx;
    this.invDist = new Float32Array([1 / dd, 1 / dd, 1 / dd, 1 / dd, 1 / (dd * SQRT2), 1 / (dd * SQRT2), 1 / (dd * SQRT2), 1 / (dd * SQRT2)]);
    this.dist = new Float32Array([dd, dd, dd, dd, dd * SQRT2, dd * SQRT2, dd * SQRT2, dd * SQRT2]);
    this.W = new Float32Array(8);
    this.exported = 0;
    this.years = 0;
    this.raining = false;
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    const { n, h, size } = this;
    this.land = createLandscape(seed);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const wx = this.worldX(x), wz = this.worldX(y);
        h[i] = this.land.height(wx, wz);
        this.wl[i] = waterLevelAt(wx);
        this.floor[i] = bedAt(wx) - 0.45;
      }
    }
    this.fillDepressions();
    for (let k = 0; k < 120; k++) this._thermal(1);
    this.h0.set(h);
    this.sed.fill(0);
    this.wet.fill(0);
    this.rain.fill(0);
    this.Q.fill(0);
    this.L.fill(0);
    this.exported = 0;
    this.years = 0;
    this.updateDrainage();
  }

  worldX(i) { return -this.size / 2 + i * this.dx; }

  // Priority-flood so the starting plateau has no closed basins to trap runoff.
  fillDepressions() {
    const { n, h } = this;
    const N2 = n * n;
    const closed = new Uint8Array(N2);
    const hk = new Float64Array(N2 + 1);
    const hi = new Int32Array(N2 + 1);
    let size = 0;
    const push = (key, id) => {
      let c = size++;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (hk[p] <= key) break;
        hk[c] = hk[p]; hi[c] = hi[p]; c = p;
      }
      hk[c] = key; hi[c] = id;
    };
    const pop = () => {
      const id = hi[0];
      size--;
      if (size > 0) {
        const key = hk[size], last = hi[size];
        let c = 0;
        for (;;) {
          let l = c * 2 + 1;
          if (l >= size) break;
          if (l + 1 < size && hk[l + 1] < hk[l]) l++;
          if (hk[l] >= key) break;
          hk[c] = hk[l]; hi[c] = hi[l]; c = l;
        }
        hk[c] = key; hi[c] = last;
      }
      return id;
    };
    for (let i = 0; i < n; i++) {
      for (const j of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
        if (!closed[j]) { closed[j] = 1; push(h[j], j); }
      }
    }
    const off = this.off;
    while (size > 0) {
      const c = pop();
      const hc = h[c];
      const cx = c % n, cy = (c / n) | 0;
      for (let m = 0; m < 8; m++) {
        const j = c + off[m];
        const jx = cx + (m === 0 || m === 4 || m === 6 ? -1 : m === 1 || m === 5 || m === 7 ? 1 : 0);
        const jy = cy + (m === 2 || m === 4 || m === 5 ? -1 : m === 3 || m === 6 || m === 7 ? 1 : 0);
        if (jx < 0 || jy < 0 || jx >= n || jy >= n || closed[j]) continue;
        closed[j] = 1;
        if (h[j] <= hc) h[j] = hc + 0.0003;
        push(h[j], j);
      }
    }
  }

  setRain(clouds, intensity = 1) {
    const { n, rain, dx, size } = this;
    rain.fill(0);
    let any = false;
    for (const c of clouds) {
      if (c.amt < 0.02) continue;
      any = true;
      const r = c.r;
      const x0 = Math.max(1, Math.floor((c.x - r + size / 2) / dx));
      const x1 = Math.min(n - 2, Math.ceil((c.x + r + size / 2) / dx));
      const y0 = Math.max(1, Math.floor((c.z - r + size / 2) / dx));
      const y1 = Math.min(n - 2, Math.ceil((c.z + r + size / 2) / dx));
      for (let y = y0; y <= y1; y++) {
        const dz = this.worldX(y) - c.z;
        for (let x = x0; x <= x1; x++) {
          const ddx = this.worldX(x) - c.x;
          const f = 1 - (ddx * ddx + dz * dz) / (r * r);
          if (f > 0) rain[y * n + x] += c.amt * intensity * Math.min(1, f * 1.8);
        }
      }
    }
    this.raining = any;
  }

  _sort() {
    const { h, keys, order, orderTmp } = this;
    const N2 = h.length;
    for (let i = 0; i < N2; i++) {
      const k = (h[i] * 1500) | 0;
      keys[i] = k < 0 ? 0 : k > 65535 ? 65535 : k;
    }
    const cnt = new Uint32Array(256);
    for (let i = 0; i < N2; i++) cnt[keys[i] & 255]++;
    let s = 0;
    for (let b = 0; b < 256; b++) { const c = cnt[b]; cnt[b] = s; s += c; }
    for (let i = 0; i < N2; i++) orderTmp[cnt[keys[i] & 255]++] = i;
    cnt.fill(0);
    for (let i = 0; i < N2; i++) cnt[keys[i] >> 8]++;
    s = 0;
    for (let b = 0; b < 256; b++) { const c = cnt[b]; cnt[b] = s; s += c; }
    for (let i = 0; i < N2; i++) { const id = orderTmp[i]; order[cnt[keys[id] >> 8]++] = id; }
  }

  // Routes water (and, when dt > 0, sediment) downhill, eroding and depositing along the way.
  _route(rainArr, Q, dt) {
    const { n, h, sed, L, order, off, invDist, W, wl, floor } = this;
    const N2 = n * n;
    this._sort();
    Q.set(rainArr);
    const erode = dt > 0;
    if (erode) L.fill(0);
    for (let k = N2 - 1; k >= 0; k--) {
      const i = order[k];
      const q = Q[i];
      let ls = erode ? L[i] : 0;
      if (q <= 0 && ls <= 0) continue;
      const cx = i % n, cy = (i / n) | 0;
      if (cx === 0 || cy === 0 || cx === n - 1 || cy === n - 1) {
        if (erode) this.exported += ls;
        continue;
      }
      const hi = h[i];
      let wsum = 0, smax = 0, hmin = hi;
      for (let m = 0; m < 8; m++) {
        const hj = h[i + off[m]];
        const d = hi - hj;
        if (d > 0) {
          const s = d * invDist[m];
          const w = s * s;
          W[m] = w; wsum += w;
          if (s > smax) smax = s;
          if (hj < hmin) hmin = hj;
        } else W[m] = 0;
      }
      if (wsum === 0) {
        if (erode && ls > 0) { h[i] += ls; sed[i] += ls; }
        continue;
      }
      if (erode && hi >= wl[i]) {
        const qs = q > QC ? Math.pow(q - QC, 0.7) : 0;
        const cap = KC * dt * qs * smax;
        if (ls > cap) {
          const dep = (ls - cap) * 0.6;
          h[i] += dep; sed[i] += dep; ls -= dep;
        } else {
          const rockH = hi - sed[i];
          const kr = rockK(rockH) + (K_SED - rockK(rockH)) * Math.min(1, sed[i] / 0.05);
          let e = KE * dt * kr * qs * smax;
          e = Math.min(e, cap - ls, 0.4 * (hi - hmin), hi - floor[i]);
          if (e > 0) {
            sed[i] -= Math.min(e, sed[i]);
            h[i] = hi - e;
            ls += e;
          }
        }
      }
      const inv = 1 / wsum;
      for (let m = 0; m < 8; m++) {
        const w = W[m];
        if (w > 0) {
          const j = i + off[m];
          const f = w * inv;
          Q[j] += q * f;
          if (erode) L[j] += ls * f;
        }
      }
    }
  }

  // Slumping of over-steep material and filling of tiny pits that would stall drainage.
  _thermal(dt) {
    const { n, h, sed, dh, inS, outS, off, dist, wl } = this;
    const rate = Math.min(0.45, Math.max(0.02, dt * 0.6));
    dh.fill(0); inS.fill(0); outS.fill(0);
    const ex = this.W;
    let any = false;
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        const hi = h[i];
        const talus = sed[i] > 0.04 ? T_SED : rockTalus(hi - sed[i]);
        let total = 0, maxEx = 0, hmin = hi;
        for (let m = 0; m < 8; m++) {
          const j = i + off[m];
          const hj = h[j];
          if (hj < hmin) hmin = hj;
          const e = hi - hj - talus * dist[m];
          if (e > 0 && !(j % n === 0 || j % n === n - 1 || j < n || j >= n * (n - 1))) {
            ex[m] = e; total += e;
            if (e > maxEx) maxEx = e;
          } else ex[m] = 0;
        }
        if (hmin >= hi && x > 1 && y > 1 && x < n - 2 && y < n - 2) {
          dh[i] += 0.0004; inS[i] += 0.0004; any = true;
          continue;
        }
        if (total > 0) {
          const move = 0.5 * rate * maxEx;
          for (let m = 0; m < 8; m++) {
            if (ex[m] > 0) {
              const a = move * ex[m] / total;
              const j = i + off[m];
              dh[i] -= a; outS[i] += a;
              if (h[j] >= wl[j]) { dh[j] += a; inS[j] += a; } else this.exported += a;
            }
          }
          any = true;
        }
      }
    }
    if (!any) return;
    for (let i = 0; i < h.length; i++) {
      if (dh[i] === 0) continue;
      h[i] += dh[i];
      const loose = Math.max(0, sed[i] - outS[i]) + inS[i];
      sed[i] = Math.min(loose, Math.max(0, h[i]));
    }
  }

  step(dt) {
    this._route(this.rain, this.Q, dt);
    if (dt > 0) {
      this._thermal(dt);
      this.years += dt;
    }
  }

  updateDrainage() {
    const ones = this._ones || (this._ones = new Float32Array(this.n * this.n).fill(1));
    this._route(ones, this.drain, 0);
  }

  updateWet(k) {
    const { wet, Q } = this;
    let any = this.raining;
    for (let i = 0; i < wet.length; i++) {
      const q = Q[i];
      const target = this.raining && q > 0 ? q / (q + 8) : 0;
      const w = wet[i];
      if (target === 0 && w < 0.002) { if (w !== 0) wet[i] = 0; continue; }
      wet[i] = w + (target - w) * k;
      any = true;
    }
    return any;
  }

  // ---- Sampling ----
  _cell(x, z) {
    const n = this.n;
    const fx = Math.min(n - 1.001, Math.max(0, (x + this.size / 2) / this.dx));
    const fz = Math.min(n - 1.001, Math.max(0, (z + this.size / 2) / this.dx));
    const ix = fx | 0, iz = fz | 0;
    return [iz * n + ix, fx - ix, fz - iz];
  }

  sample(arr, x, z) {
    const [i, u, v] = this._cell(x, z);
    const n = this.n;
    const a = arr[i], b = arr[i + 1], c = arr[i + n], d = arr[i + n + 1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }

  inside(x, z) { const s = this.size / 2; return x > -s && x < s && z > -s && z < s; }

  heightAt(x, z) { return this.inside(x, z) ? this.sample(this.h, x, z) : this.land.height(x, z); }

  slopeAt(x, z) {
    const e = this.dx;
    const gx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const gz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  stats() {
    const { h, h0 } = this;
    let cut = 0, fill = 0;
    for (let i = 0; i < h.length; i++) {
      const d = h[i] - h0[i];
      if (d < 0) cut -= d; else fill += d;
    }
    const perUnit = Math.pow(this.dx * 150, 2) * 200 / 1e9; // km^3 per (cell * height unit)
    return { cut: cut * perUnit, fill: fill * perUnit, exported: this.exported * perUnit };
  }

  // ---- Mesh data ----
  writeNormals(out, src = this.h) {
    const { n, dx } = this;
    for (let y = 0; y < n; y++) {
      const ym = Math.max(0, y - 1), yp = Math.min(n - 1, y + 1);
      for (let x = 0; x < n; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(n - 1, x + 1);
        const gx = (src[y * n + xm] - src[y * n + xp]) / ((xp - xm) * dx);
        const gz = (src[ym * n + x] - src[yp * n + x]) / ((yp - ym) * dx);
        const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
        const o = (y * n + x) * 3;
        out[o] = gx * inv; out[o + 1] = inv; out[o + 2] = gz * inv;
      }
    }
  }
}
