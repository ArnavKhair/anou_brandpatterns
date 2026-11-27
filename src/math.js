/**
 * Atom Pattern Generator - Math, PRNG, Schneider Bézier Fitting & Canonical Framing
 */

// Mulberry32 deterministic 32-bit PRNG
export function createPRNG(seed = 123456789) {
  let s = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
  if (s === 0) s = 1;

  function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + (max - min) * next();
  }

  function rangeInt(min, max) {
    return Math.floor(range(min, max + 1));
  }

  function boolean(prob = 0.5) {
    return next() < prob;
  }

  function choice(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(next() * arr.length)];
  }

  function weightedChoice(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // Box-Muller transform for normal distribution
  let hasSpare = false;
  let spare = 0;
  function gaussian(mean = 0, stdDev = 1) {
    if (hasSpare) {
      hasSpare = false;
      return mean + stdDev * spare;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);

    const mul = Math.sqrt(-2.0 * Math.log(s) / s);
    spare = v * mul;
    hasSpare = true;
    return mean + stdDev * (u * mul);
  }

  return {
    next,
    range,
    rangeInt,
    boolean,
    choice,
    weightedChoice,
    gaussian,
    fork(offset = 1) {
      return createPRNG((s + offset * 0x9e3779b9) >>> 0);
    }
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 1D / 2D Value / Gradient Noise generator based on seed
export function createNoise(seed = 42) {
  const p = new Uint8Array(512);
  const prng = createPRNG(seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(prng.next() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    p[i] = perm[i & 255];
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(t, a, b) {
    return a + t * (b - a);
  }

  function grad(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];

    const x1 = lerp(u, grad(aa, xf, yf), grad(ba, xf - 1, yf));
    const x2 = lerp(u, grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1));

    return lerp(v, x1, x2);
  }

  function noise1D(x) {
    return noise2D(x, 0.5);
  }

  return { noise1D, noise2D };
}

// 2D Vector & Matrix operations
export const Vec2 = {
  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  },
  distSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  },
  lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  },
  add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  },
  sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  },
  scale(v, s) {
    return { x: v.x * s, y: v.y * s };
  },
  dot(a, b) {
    return a.x * b.x + a.y * b.y;
  },
  length(v) {
    return Math.hypot(v.x, v.y);
  },
  normalize(v) {
    const len = Math.hypot(v.x, v.y);
    return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
  },
  rotate(v, angle, center = { x: 0, y: 0 }) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = v.x - center.x;
    const y = v.y - center.y;
    return {
      x: center.x + x * cos - y * sin,
      y: center.y + x * sin + y * cos
    };
  }
};

// 3D Matrix & Rotation Math
export class Matrix3D {
  static createRotation(pitch, yaw, roll) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw),   sy = Math.sin(yaw);
    const cr = Math.cos(roll),  sr = Math.sin(roll);

    return [
      cy * cr,
      cy * sr,
      -sy,

      sp * sy * cr - cp * sr,
      sp * sy * sr + cp * cr,
      sp * cy,

      cp * sy * cr + sp * sr,
      cp * sy * sr - sp * cr,
      cp * cy
    ];
  }

  static transformPoint(pt, m, center = { x: 0, y: 0, z: 0 }) {
    const x = pt.x - center.x;
    const y = pt.y - center.y;
    const z = (pt.z || 0) - center.z;

    const rx = m[0] * x + m[3] * y + m[6] * z;
    const ry = m[1] * x + m[4] * y + m[7] * z;
    const rz = m[2] * x + m[5] * y + m[8] * z;

    return {
      x: rx + center.x,
      y: ry + center.y,
      z: rz + center.z
    };
  }
}

// 2D Affine transform (tilt, squash, shear) for flat generators
export function applyPlaneTilt(pt, tiltAngle, squash, shear, center = { x: 0, y: 0 }) {
  const x = pt.x - center.x;
  const y = pt.y - center.y;

  const cos = Math.cos(tiltAngle);
  const sin = Math.sin(tiltAngle);
  let rx = x * cos - y * sin;
  let ry = x * sin + y * cos;

  ry = ry * squash;
  rx = rx + ry * shear;

  const cosInv = Math.cos(-tiltAngle);
  const sinInv = Math.sin(-tiltAngle);
  return {
    x: rx * cosInv - ry * sinInv + center.x,
    y: rx * sinInv + ry * cosInv + center.y
  };
}

// Curve point sampler utilities (still useful for 3D projection & non-analytic sampling)
export function sampleArc(cx, cy, r, startAngle, endAngle, numPoints = 64) {
  const points = [];
  const delta = endAngle - startAngle;
  for (let i = 0; i <= numPoints; i++) {
    const theta = startAngle + (i / numPoints) * delta;
    points.push({
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta)
    });
  }
  return points;
}

export function sampleEllipse(cx, cy, rx, ry, rotation = 0, startAngle = 0, endAngle = Math.PI * 2, numPoints = 64) {
  const points = [];
  const delta = endAngle - startAngle;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  for (let i = 0; i <= numPoints; i++) {
    const theta = startAngle + (i / numPoints) * delta;
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    points.push({
      x: cx + ex * cosR - ey * sinR,
      y: cy + ex * sinR + ey * cosR
    });
  }
  return points;
}

// ============================================================================
// Schneider's Cubic Bézier Curve Fitting (Chord-Length + Capped NR)
// ============================================================================

export function evaluateCubic(seg, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * seg.p0.x + b * seg.cp1.x + c * seg.cp2.x + d * seg.p3.x,
    y: a * seg.p0.y + b * seg.cp1.y + c * seg.cp2.y + d * seg.p3.y
  };
}

export function splitCubic(seg, t) {
  const p01 = Vec2.lerp(seg.p0, seg.cp1, t);
  const p12 = Vec2.lerp(seg.cp1, seg.cp2, t);
  const p23 = Vec2.lerp(seg.cp2, seg.p3, t);
  const p012 = Vec2.lerp(p01, p12, t);
  const p123 = Vec2.lerp(p12, p23, t);
  const p0123 = Vec2.lerp(p012, p123, t);
  return [
    { p0: seg.p0, cp1: p01, cp2: p012, p3: p0123 },
    { p0: p0123, cp1: p123, cp2: p23, p3: seg.p3 }
  ];
}

export function subSegmentCubic(seg, t0, t1) {
  if (t0 <= 1e-6 && t1 >= 1 - 1e-6) return seg;
  const [, right] = splitCubic(seg, t0);
  const localT = (t1 - t0) / Math.max(1e-9, 1 - t0);
  const [sub] = splitCubic(right, Math.min(1, Math.max(0, localT)));
  return sub;
}

export function flattenBezierSegments(segments, chordTol = 3.5) {
  if (!segments || segments.length === 0) return [];
  const pts = [{ x: segments[0].p0.x, y: segments[0].p0.y, segIdx: 0, t: 0 }];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const chord = Vec2.dist(seg.p0, seg.p3);
    const ctrlNet = Vec2.dist(seg.p0, seg.cp1) + Vec2.dist(seg.cp1, seg.cp2) + Vec2.dist(seg.cp2, seg.p3);
    const steps = Math.max(2, Math.min(32, Math.ceil(Math.max(chord, ctrlNet) / Math.max(1, chordTol))));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const p = evaluateCubic(seg, t);
      pts.push({ x: p.x, y: p.y, segIdx: i, t });
    }
  }
  return pts;
}

function dedupePoints(points, eps = 1e-4) {
  if (!points || points.length === 0) return [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (Vec2.dist(out[out.length - 1], points[i]) > eps) {
      out.push(points[i]);
    }
  }
  return out;
}

export function fitCubicBeziers(rawPoints, maxError = 0.15, isClosed = false) {
  const points = dedupePoints(rawPoints, 1e-3);
  if (points.length < 2) return [];

  if (isClosed && Vec2.dist(points[0], points[points.length - 1]) > 1e-3) {
    points.push({ x: points[0].x, y: points[0].y });
  }

  if (points.length === 2) {
    const p0 = points[0];
    const p3 = points[1];
    return [{
      p0,
      cp1: Vec2.lerp(p0, p3, 1 / 3),
      cp2: Vec2.lerp(p0, p3, 2 / 3),
      p3
    }];
  }

  const n = points.length;
  const leftTan = isClosed
    ? Vec2.normalize(Vec2.sub(points[1], points[n - 2]))
    : Vec2.normalize(Vec2.sub(points[1], points[0]));
  const rightTan = isClosed
    ? Vec2.normalize(Vec2.sub(points[n - 2], points[1]))
    : Vec2.normalize(Vec2.sub(points[n - 2], points[n - 1]));

  const out = [];
  fitCubicRecursive(points, 0, n - 1, leftTan, rightTan, maxError * maxError, out, 0);
  return out;
}

function chordLengthParameterize(points, first, last) {
  const u = new Float64Array(last - first + 1);
  u[0] = 0;
  for (let i = first + 1; i <= last; i++) {
    u[i - first] = u[i - first - 1] + Vec2.dist(points[i], points[i - 1]);
  }
  const total = u[last - first];
  if (total > 1e-9) {
    for (let i = 1; i <= last - first; i++) {
      u[i] /= total;
    }
  }
  return u;
}

function generateBezier(points, first, last, uPrime, tHat1, tHat2) {
  const nPts = last - first + 1;
  const p0 = points[first];
  const p3 = points[last];

  const C = [[0, 0], [0, 0]];
  const X = [0, 0];

  for (let i = 0; i < nPts; i++) {
    const u = uPrime[i];
    const mu = 1 - u;
    const b0 = mu * mu * mu;
    const b1 = 3 * mu * mu * u;
    const b2 = 3 * mu * u * u;
    const b3 = u * u * u;

    const a1x = tHat1.x * b1;
    const a1y = tHat1.y * b1;
    const a2x = tHat2.x * b2;
    const a2y = tHat2.y * b2;

    C[0][0] += a1x * a1x + a1y * a1y;
    C[0][1] += a1x * a2x + a1y * a2y;
    C[1][0] = C[0][1];
    C[1][1] += a2x * a2x + a2y * a2y;

    const tmpX = points[first + i].x - (p0.x * (b0 + b1) + p3.x * (b2 + b3));
    const tmpY = points[first + i].y - (p0.y * (b0 + b1) + p3.y * (b2 + b3));

    X[0] += a1x * tmpX + a1y * tmpY;
    X[1] += a2x * tmpX + a2y * tmpY;
  }

  const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
  const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];

  const alphaL = Math.abs(detC0C1) < 1e-12 ? 0 : detXC1 / detC0C1;
  const alphaR = Math.abs(detC0C1) < 1e-12 ? 0 : detC0X / detC0C1;

  const segLength = Vec2.dist(p0, p3);
  const epsilon = 1e-6 * segLength;

  if (alphaL < epsilon || alphaR < epsilon) {
    const dist = segLength / 3;
    return {
      p0,
      cp1: Vec2.add(p0, Vec2.scale(tHat1, dist)),
      cp2: Vec2.add(p3, Vec2.scale(tHat2, dist)),
      p3
    };
  }

  return {
    p0,
    cp1: Vec2.add(p0, Vec2.scale(tHat1, alphaL)),
    cp2: Vec2.add(p3, Vec2.scale(tHat2, alphaR)),
    p3
  };
}

function newtonRaphsonRootFind(seg, P, u) {
  const q = evaluateCubic(seg, u);
  const q1 = {
    x: 3 * (1 - u) * (1 - u) * (seg.cp1.x - seg.p0.x) + 6 * (1 - u) * u * (seg.cp2.x - seg.cp1.x) + 3 * u * u * (seg.p3.x - seg.cp2.x),
    y: 3 * (1 - u) * (1 - u) * (seg.cp1.y - seg.p0.y) + 6 * (1 - u) * u * (seg.cp2.y - seg.cp1.y) + 3 * u * u * (seg.p3.y - seg.cp2.y)
  };
  const q2 = {
    x: 6 * (1 - u) * (seg.cp2.x - 2 * seg.cp1.x + seg.p0.x) + 6 * u * (seg.p3.x - 2 * seg.cp2.x + seg.cp1.x),
    y: 6 * (1 - u) * (seg.cp2.y - 2 * seg.cp1.y + seg.p0.y) + 6 * u * (seg.p3.y - 2 * seg.cp2.y + seg.cp1.y)
  };
  const dx = q.x - P.x;
  const dy = q.y - P.y;
  const numerator = dx * q1.x + dy * q1.y;
  const denominator = q1.x * q1.x + q1.y * q1.y + dx * q2.x + dy * q2.y;
  if (Math.abs(denominator) < 1e-12) return u;
  return Math.max(0, Math.min(1, u - numerator / denominator));
}

function computeMaxError(points, first, last, seg, u) {
  let maxDistSq = 0;
  let splitPoint = Math.floor((last - first + 1) / 2) + first;
  for (let i = first + 1; i < last; i++) {
    const p = evaluateCubic(seg, u[i - first]);
    const dSq = Vec2.distSq(p, points[i]);
    if (dSq >= maxDistSq) {
      maxDistSq = dSq;
      splitPoint = i;
    }
  }
  return { maxDistSq, splitPoint };
}

function fitCubicRecursive(points, first, last, tHat1, tHat2, errorSq, out, depth) {
  if (last - first === 1 || depth > 14) {
    const p0 = points[first];
    const p3 = points[last];
    const dist = Vec2.dist(p0, p3) / 3;
    out.push({
      p0,
      cp1: Vec2.add(p0, Vec2.scale(tHat1, dist)),
      cp2: Vec2.add(p3, Vec2.scale(tHat2, dist)),
      p3
    });
    return;
  }

  let u = chordLengthParameterize(points, first, last);
  let seg = generateBezier(points, first, last, u, tHat1, tHat2);
  let { maxDistSq, splitPoint } = computeMaxError(points, first, last, seg, u);

  if (maxDistSq <= errorSq) {
    out.push(seg);
    return;
  }

  const iterationErrorSq = errorSq * 4;
  if (maxDistSq < iterationErrorSq) {
    // Capped at 4 Newton-Raphson iterations per segment
    for (let iter = 0; iter < 4; iter++) {
      const uPrime = new Float64Array(u.length);
      for (let i = first; i <= last; i++) {
        uPrime[i - first] = newtonRaphsonRootFind(seg, points[i], u[i - first]);
      }
      seg = generateBezier(points, first, last, uPrime, tHat1, tHat2);
      const errRes = computeMaxError(points, first, last, seg, uPrime);
      if (errRes.maxDistSq <= errorSq) {
        out.push(seg);
        return;
      }
      u = uPrime;
      splitPoint = errRes.splitPoint;
    }
  }

  // Split at point of max error
  const v1 = Vec2.sub(points[splitPoint - 1], points[splitPoint]);
  const v2 = Vec2.sub(points[splitPoint], points[splitPoint + 1]);
  let tCenter = Vec2.normalize(Vec2.add(v1, v2));
  if (Vec2.length(tCenter) < 1e-6) {
    tCenter = Vec2.normalize(Vec2.sub(points[splitPoint - 1], points[splitPoint + 1]));
  }
  const tCenterNeg = { x: -tCenter.x, y: -tCenter.y };

  fitCubicRecursive(points, first, splitPoint, tHat1, tCenter, errorSq, out, depth + 1);
  fitCubicRecursive(points, splitPoint, last, tCenterNeg, tHat2, errorSq, out, depth + 1);
}

// Legacy helper kept for roughness path when roughness > 0
export function catmullRomToBeziers(points, tension = 0.5) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < n - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
    const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
    const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
    const cp2y = p2.y - (p3.y - p1.y) * tension / 3;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function resamplePolyline(points, step = 5) {
  if (points.length <= 1) return points.slice();
  const res = [points[0]];
  let accumulated = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segDist = Vec2.dist(p1, p2);
    if (segDist === 0) continue;

    let d = 0;
    while (accumulated + (segDist - d) >= step) {
      const remaining = step - accumulated;
      d += remaining;
      const t = d / segDist;
      res.push(Vec2.lerp(p1, p2, t));
      accumulated = 0;
    }
    accumulated += (segDist - d);
  }

  const lastPt = points[points.length - 1];
  if (Vec2.dist(res[res.length - 1], lastPt) > step * 0.3) {
    res.push(lastPt);
  }
  return res;
}

// ============================================================================
// Two-Stage Canonical Framing Transform
// ============================================================================

export const FRAMING_MODES = ['CENTERED EMBLEM', 'OFF-AXIS FOCAL'];

export function normalizeFramingMode(preset) {
  if (!preset) return 'CENTERED EMBLEM';
  const upper = String(preset).toUpperCase();
  if (upper.includes('CENTER')) return 'CENTERED EMBLEM';
  // Maps Off-Axis Focal, Macro Edge-Crop, Corner Bleed -> OFF-AXIS FOCAL
  return 'OFF-AXIS FOCAL';
}

export function applyCanonicalFraming(scene, modeInput, prng = null) {
  const mode = normalizeFramingMode(modeInput);
  scene.framingPreset = mode;

  const core = scene.coreBounds || scene.computeFallbackBounds();
  const w = Math.max(1e-3, core.maxX - core.minX);
  const h = Math.max(1e-3, core.maxY - core.minY);
  const coreCx = (core.minX + core.maxX) * 0.5;
  const coreCy = (core.minY + core.maxY) * 0.5;

  const vw = scene.width || 1000;
  const vh = scene.height || 1000;

  let scale = 1;
  let tx = 0;
  let ty = 0;

  if (mode === 'CENTERED EMBLEM') {
    scale = (0.74 * Math.min(vw, vh)) / Math.max(w, h);
    tx = vw * 0.5 - coreCx * scale;
    ty = vh * 0.5 - coreCy * scale;
  } else {
    // OFF-AXIS FOCAL: 55%–65% of viewport, offset clamped to [-110, 110], zero core clipping
    const targetSpan = prng ? prng.range(0.55, 0.65) * Math.min(vw, vh) : 0.60 * Math.min(vw, vh);
    scale = targetSpan / Math.max(w, h);

    const sx = prng ? (prng.boolean() ? 1 : -1) : 1;
    const sy = prng ? (prng.boolean() ? 1 : -1) : -1;
    const dx = Math.max(-110, Math.min(110, sx * (prng ? prng.range(50, 110) : 85)));
    const dy = Math.max(-110, Math.min(110, sy * (prng ? prng.range(45, 110) : 75)));

    const desiredTx = vw * 0.5 + dx - coreCx * scale;
    const desiredTy = vh * 0.5 + dy - coreCy * scale;

    // Strictly clamp so transformed coreBounds lies inside [0, vw] x [0, vh]
    const minTx = -core.minX * scale;
    const maxTx = vw - core.maxX * scale;
    const minTy = -core.minY * scale;
    const maxTy = vh - core.maxY * scale;

    tx = Math.max(minTx, Math.min(maxTx, desiredTx));
    ty = Math.max(minTy, Math.min(maxTy, desiredTy));
  }

  const mapPt = (p) => ({ x: p.x * scale + tx, y: p.y * scale + ty });

  for (const el of scene.paths) {
    if (el.kind === 'circle') {
      el.cx = el.cx * scale + tx;
      el.cy = el.cy * scale + ty;
      el.r = el.r * scale;
    } else if (el.kind === 'ellipse' || el.kind === 'arc') {
      el.cx = el.cx * scale + tx;
      el.cy = el.cy * scale + ty;
      el.rx = el.rx * scale;
      el.ry = el.ry * scale;
    } else if (el.points) {
      el.points = el.points.map(mapPt);
    }
  }

  for (const dot of scene.dots) {
    const m = mapPt(dot);
    dot.x = m.x;
    dot.y = m.y;
  }
  for (const arr of scene.arrows) {
    const m = mapPt(arr);
    arr.x = m.x;
    arr.y = m.y;
  }
  for (const star of scene.stars) {
    const m = mapPt(star);
    star.x = m.x;
    star.y = m.y;
  }
  for (const tick of scene.ticks) {
    tick.p1 = mapPt(tick.p1);
    tick.p2 = mapPt(tick.p2);
  }
  for (const halo of scene.exclusionHalos) {
    const m = mapPt(halo);
    halo.x = m.x;
    halo.y = m.y;
    halo.r = halo.r * scale;
  }

  scene.coreBounds = {
    minX: core.minX * scale + tx,
    minY: core.minY * scale + ty,
    maxX: core.maxX * scale + tx,
    maxY: core.maxY * scale + ty
  };
  const bleed = scene.bleedBounds || core;
  scene.bleedBounds = {
    minX: bleed.minX * scale + tx,
    minY: bleed.minY * scale + ty,
    maxX: bleed.maxX * scale + tx,
    maxY: bleed.maxY * scale + ty
  };

  scene.framingTransform = { mode, scale, tx, ty };
  return scene;
}
