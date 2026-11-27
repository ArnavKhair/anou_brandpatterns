/**
 * Generator 1: Rosettes and Circle Lattices (Phase 1 Analytic)
 * Sub-modes:
 * - tangent_rings: Exact non-overlapping tangent circle rings r = R_ring * sin(pi/N)
 *   with deterministic vertex nodes / concave stars at 100% or alternating 50% of cusps.
 * - seed_of_life: 3x3 overlapping circle lattice (4-fold orthogonal <-> 6-fold hexagonal via Symmetry)
 *   with uniform intersection dots and one highlighted crescent arc.
 */

import { Scene } from '../scene.js';
import { sampleArc, applyPlaneTilt, Vec2 } from '../math.js';

export function circleIntersections(c1, c2) {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  const eps = 1e-4;
  if (d < eps || d > c1.r + c2.r + eps || d < Math.abs(c1.r - c2.r) - eps) return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const px = c1.x + (a * dx) / d;
  const py = c1.y + (a * dy) / d;
  if (h < 1e-3) return [{ x: px, y: py }];
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [{ x: px + rx, y: py + ry }, { x: px - rx, y: py - ry }];
}

export function normalizeRosetteSubMode(subMode) {
  if (subMode === 'seed_of_life') return 'seed_of_life';
  return 'tangent_rings';
}

export function generateRosette(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.75,
    focus = 0.5,
    depthTilt = false,
    annotations = false,
    subMode
  } = controls;

  const mode = normalizeRosetteSubMode(subMode);
  const maxR = 240;

  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.58, 0.85);
  const shear = prng.range(-0.10, 0.10);
  const transformPt = (pt) => depthTilt ? applyPlaneTilt(pt, tiltAngle, squash, shear, { x: 0, y: 0 }) : pt;

  const emitCircle = (cx, cy, r, opts = {}) => {
    if (r < 2) return;
    if (!depthTilt) {
      scene.addCircle(cx, cy, r, opts);
    } else {
      const pts = sampleArc(cx, cy, r, 0, Math.PI * 2, 72).map(transformPt);
      scene.addPath(pts, { ...opts, isClosed: true });
    }
  };

  if (mode === 'seed_of_life') {
    const useHex = symmetry >= 0.5;
    const cellR = maxR * (0.42 - 0.08 * complexity);
    const spacing = cellR * (useHex ? 1.0 : 1.05);
    const circles = [];

    if (useHex) {
      // 6-fold Flower / Seed of Life (center + 1 or 2 rings)
      circles.push({ x: 0, y: 0, r: cellR, isAccent: false });
      const ringCount = complexity > 0.6 ? 2 : 1;
      for (let ring = 1; ring <= ringCount; ring++) {
        const count = 6 * ring;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const dist = ring === 1 ? spacing : (i % 2 === 0 ? spacing * 2 : spacing * Math.sqrt(3));
          circles.push({ x: dist * Math.cos(ang), y: dist * Math.sin(ang), r: cellR });
        }
      }
    } else {
      // 3x3 orthogonal overlapping circle lattice (4-fold)
      for (let gx = -1; gx <= 1; gx++) {
        for (let gy = -1; gy <= 1; gy++) {
          circles.push({ x: gx * spacing, y: gy * spacing, r: cellR });
        }
      }
    }

    for (const c of circles) {
      emitCircle(c.x, c.y, c.r, { role: 'primary', zPriority: 5 });
    }

    // Subtle highlighted crescent arc on outer boundary
    const outerR = useHex ? (complexity > 0.6 ? spacing * 2 + cellR : spacing + cellR) : spacing * Math.SQRT2 + cellR * 0.65;
    emitCircle(0, 0, outerR, { role: 'secondary', zPriority: 3 });

    const crescentStart = prng.range(0, Math.PI * 2);
    if (!depthTilt) {
      scene.addArc(0, 0, outerR, outerR, crescentStart, crescentStart + Math.PI * 0.65, 0, {
        role: 'accent',
        zPriority: 8
      });
    } else {
      const arcPts = sampleArc(0, 0, outerR, crescentStart, crescentStart + Math.PI * 0.65, 48).map(transformPt);
      scene.addPath(arcPts, { role: 'accent', zPriority: 8 });
    }

    // Uniform deterministic intersection dots
    const intersections = [];
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const hits = circleIntersections(circles[i], circles[j]);
        for (const h of hits) {
          if (!intersections.some(u => Vec2.dist(u, h) < 4)) {
            intersections.push(h);
          }
        }
      }
    }
    const stride = intersections.length > 28 ? 2 : 1;
    for (let i = 0; i < intersections.length; i += stride) {
      const tp = transformPt(intersections[i]);
      scene.addDot(tp.x, tp.y, 2.2, { filled: true, role: 'node' });
    }

    const centerPt = transformPt({ x: 0, y: 0 });
    scene.addDot(centerPt.x, centerPt.y, 3.2, { filled: true, role: 'node', isGlow: true });

    const bound = outerR * 1.04;
    scene.setBounds({ minX: -bound, minY: -bound, maxX: bound, maxY: bound });
  } else {
    // tangent_rings: Exact non-overlapping tangency r = R_ring * sin(pi/N)
    const rings = Math.max(1, Math.round(1 + complexity * 2));
    const baseN = Math.round(6 + symmetry * 10); // 6 to 16
    const rotOffset = prng.range(0, Math.PI * 2);
    const useStars = prng.boolean(0.5);
    const alternatingCusps = symmetry < 0.65;

    // Outer boundary ring
    emitCircle(0, 0, maxR, { role: 'accent', zPriority: 8 });

    let currentR = maxR;
    for (let ringIdx = 0; ringIdx < rings; ringIdx++) {
      if (currentR < 32) break;
      const N = Math.max(5, baseN - ringIdx * 2);
      const sinHalf = Math.sin(Math.PI / N);
      // Exact mutual tangency inside currentR: r = R * sin(pi/N) / (1 + sin(pi/N))
      const r = (currentR * sinHalf) / (1 + sinHalf);
      const R_ring = currentR - r;

      for (let i = 0; i < N; i++) {
        const ang = rotOffset + (i / N) * Math.PI * 2;
        const cx = R_ring * Math.cos(ang);
        const cy = R_ring * Math.sin(ang);
        emitCircle(cx, cy, r, { role: 'primary', zPriority: 5 });

        // Deterministic vertex nodes at 100% (or alternating 50%) of tangent cusps
        const cuspAng = ang + Math.PI / N;
        if (!alternatingCusps || i % 2 === 0) {
          const cuspDist = Math.sqrt(Math.max(0, R_ring * R_ring - r * r));
          const cuspPt = transformPt({
            x: cuspDist * Math.cos(cuspAng),
            y: cuspDist * Math.sin(cuspAng)
          });
          if (useStars && i % 2 === 0) {
            scene.addStarNode(cuspPt.x, cuspPt.y, 4.5, 4, { role: 'node' });
          } else {
            scene.addDot(cuspPt.x, cuspPt.y, 2.2, { filled: true, role: 'node' });
          }
        }
      }

      const innerBoundary = currentR - 2 * r;
      if (innerBoundary > 18) {
        emitCircle(0, 0, innerBoundary, { role: 'secondary', zPriority: 3 });
      }
      currentR = innerBoundary * (0.94 - 0.08 * focus);
    }

    const centerPt = transformPt({ x: 0, y: 0 });
    scene.addDot(centerPt.x, centerPt.y, 3.2, { filled: true, role: 'node', isGlow: true });
    scene.setBounds({ minX: -maxR, minY: -maxR, maxX: maxR, maxY: maxR });
  }

  if (annotations) {
    const guideR = maxR * 1.08;
    emitCircle(0, 0, guideR, { role: 'annotation', zPriority: 1 });
    scene.addPath([transformPt({ x: -guideR, y: 0 }), transformPt({ x: guideR, y: 0 })], {
      role: 'annotation',
      isPolygonal: true,
      zPriority: 1
    });
    scene.addPath([transformPt({ x: 0, y: -guideR }), transformPt({ x: 0, y: guideR })], {
      role: 'annotation',
      isPolygonal: true,
      zPriority: 1
    });
  }

  return scene;
}
