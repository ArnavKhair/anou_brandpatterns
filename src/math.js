/**
 * Atom Pattern Generator - Math & PRNG Utilities
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
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
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
    // Pitch (X), Yaw (Y), Roll (Z)
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

  static transformPoint(pt, m, center = { x: 500, y: 500, z: 0 }) {
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
export function applyPlaneTilt(pt, tiltAngle, squash, shear, center = { x: 500, y: 500 }) {
  // Step 1: translate to center
  let x = pt.x - center.x;
  let y = pt.y - center.y;

  // Step 2: rotate to tilt axis
  const cos = Math.cos(tiltAngle);
  const sin = Math.sin(tiltAngle);
  let rx = x * cos - y * sin;
  let ry = x * sin + y * cos;

  // Step 3: squash Y and apply slight shear
  ry = ry * squash;
  rx = rx + ry * shear;

  // Step 4: rotate back and restore center
  const cosInv = Math.cos(-tiltAngle);
  const sinInv = Math.sin(-tiltAngle);
  const fx = rx * cosInv - ry * sinInv + center.x;
  const fy = rx * sinInv + ry * cosInv + center.y;

  return { x: fx, y: fy };
}

// Curve point sampler utilities
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

// Catmull-Rom to Cubic Bezier path generation
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

// Resample a polyline at approximately uniform step distance
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
