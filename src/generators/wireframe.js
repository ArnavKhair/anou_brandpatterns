/**
 * Generator 6: Wireframes (Phase 1 Analytic)
 * Sub-modes:
 * - sphere: 3D latitude & longitude rings
 * - torus: 3D torus cross-section rings
 * - hyperboloid: 3D ruled / ring hyperboloid
 *
 * Features:
 * - 12–24 rings sampled at 84 pts/ring -> Schneider Bézier fit
 * - Split at horizon tangency (z=0) into visibility: 'front' (1.0px) and 'back' (0.8px, 2 5)
 * - Single solid outer horizon silhouette (1.6px)
 * - Subtle front-hemisphere nodes (r <= 1.8px, omitted when complexity > 0.72)
 * - Axes, ticks, and center dot strictly gated behind annotations === true
 */

import { Scene } from '../scene.js';
import { Matrix3D, sampleArc } from '../math.js';

export function normalizeWireframeSubMode(subMode) {
  if (subMode === 'torus' || subMode === 'hyperboloid') return subMode;
  return 'sphere';
}

export function generateWireframe(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.5,
    focus = 0.5,
    depthTilt = false,
    annotations = false,
    subMode
  } = controls;

  const form = normalizeWireframeSubMode(subMode);
  const ringCount = Math.round(12 + complexity * 6); // 12 to 18 rings
  const baseRadius = 220;
  const perspDist = 1600 - focus * 350;

  const pitch = depthTilt ? prng.range(0.38, 1.15) : prng.range(0.18, 0.42);
  const yaw = depthTilt ? prng.range(0.32, 1.12) : prng.range(0.15, 0.38);
  const roll = depthTilt ? prng.range(-0.32, 0.32) : prng.range(-0.12, 0.12);
  const rotMatrix = Matrix3D.createRotation(pitch, yaw, roll);

  const projectPt = (pt3D) => {
    const rot = Matrix3D.transformPoint(pt3D, rotMatrix, { x: 0, y: 0, z: 0 });
    const scale = perspDist / Math.max(400, perspDist - rot.z * 0.32);
    return {
      x: rot.x * scale,
      y: rot.y * scale,
      z: rot.z
    };
  };

  const all3DRings = [];
  const frontNodes = [];
  let silhouetteR = baseRadius;

  if (form === 'sphere') {
    // Solid outer horizon silhouette
    scene.addCircle(0, 0, baseRadius, {
      role: 'accent',
      strokeWidthOverride: 1.6,
      zPriority: 8
    });

    const latCount = Math.max(4, Math.round(ringCount * 0.4));
    const lonCount = Math.max(4, Math.round(ringCount * 0.45));
    const isWedge = symmetry < 0.45;
    const wedgeSpan = isWedge ? prng.range(Math.PI * 0.85, Math.PI * 1.35) : Math.PI * 2;
    const wedgeStart = prng.range(0, Math.PI * 2);

    for (let i = 1; i <= latCount; i++) {
      const v = (i / (latCount + 1)) * Math.PI - Math.PI / 2;
      const ry = baseRadius * Math.sin(v);
      const rr = baseRadius * Math.cos(v);
      const pts = [];
      const steps = 84;
      for (let s = 0; s <= steps; s++) {
        const theta = wedgeStart + (s / steps) * wedgeSpan;
        pts.push({ x: rr * Math.cos(theta), y: ry, z: rr * Math.sin(theta) });
      }
      all3DRings.push(pts);
    }

    for (let j = 0; j < lonCount; j++) {
      const phi = wedgeStart + (j / lonCount) * (isWedge ? wedgeSpan : Math.PI);
      const pts = [];
      const steps = 84;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        const mx = baseRadius * Math.cos(theta);
        const my = baseRadius * Math.sin(theta);
        pts.push({ x: mx * Math.cos(phi), y: my, z: mx * Math.sin(phi) });
      }
      all3DRings.push(pts);
    }

    if (complexity <= 0.72) {
      for (let i = 1; i <= latCount; i++) {
        const v = (i / (latCount + 1)) * Math.PI - Math.PI / 2;
        for (let j = 0; j < lonCount; j++) {
          const phi = wedgeStart + (j / lonCount) * (isWedge ? wedgeSpan : Math.PI);
          const proj = projectPt({
            x: baseRadius * Math.cos(v) * Math.cos(phi),
            y: baseRadius * Math.sin(v),
            z: baseRadius * Math.cos(v) * Math.sin(phi)
          });
          if (proj.z >= 10) frontNodes.push(proj);
        }
      }
    }
  } else if (form === 'torus') {
    const R = baseRadius * 0.65;
    const r = baseRadius * 0.32;
    silhouetteR = R + r;

    scene.addCircle(0, 0, silhouetteR, {
      role: 'accent',
      strokeWidthOverride: 1.6,
      zPriority: 8
    });

    for (let c = 0; c < ringCount; c++) {
      const u = (c / ringCount) * Math.PI * 2;
      const pts = [];
      const steps = 84;
      for (let s = 0; s <= steps; s++) {
        const v = (s / steps) * Math.PI * 2;
        pts.push({
          x: (R + r * Math.cos(v)) * Math.cos(u),
          y: r * Math.sin(v),
          z: (R + r * Math.cos(v)) * Math.sin(u)
        });
      }
      all3DRings.push(pts);

      if (complexity <= 0.72 && c % 2 === 0) {
        for (let k = 0; k < 4; k++) {
          const v = (k / 4) * Math.PI * 2;
          const proj = projectPt({
            x: (R + r * Math.cos(v)) * Math.cos(u),
            y: r * Math.sin(v),
            z: (R + r * Math.cos(v)) * Math.sin(u)
          });
          if (proj.z >= 10) frontNodes.push(proj);
        }
      }
    }
  } else {
    // hyperboloid: x(u,v) = a*cosh(v)*cos(u), y(u,v) = c*sinh(v), z(u,v) = a*cosh(v)*sin(u)
    const waistR = baseRadius * 0.42;
    const maxH = baseRadius * 0.85;
    const vMax = 1.05;
    silhouetteR = baseRadius * 0.95;

    // Horizontal latitude rings along the hyperboloid
    const latRings = Math.max(6, Math.round(ringCount * 0.55));
    for (let i = 0; i < latRings; i++) {
      const v = -vMax + (i / (latRings - 1)) * (2 * vMax);
      const rr = waistR * Math.cosh(v);
      const yy = maxH * (v / vMax);
      const pts = [];
      const steps = 84;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        pts.push({ x: rr * Math.cos(theta), y: yy, z: rr * Math.sin(theta) });
      }
      all3DRings.push(pts);
    }

    // Asymptotic / meridian rulings
    const meridians = Math.max(6, Math.round(ringCount * 0.45));
    for (let j = 0; j < meridians; j++) {
      const u = (j / meridians) * Math.PI * 2;
      const pts = [];
      const steps = 72;
      for (let s = 0; s <= steps; s++) {
        const v = -vMax + (s / steps) * (2 * vMax);
        const rr = waistR * Math.cosh(v);
        const yy = maxH * (v / vMax);
        const twist = v * 0.65;
        pts.push({ x: rr * Math.cos(u + twist), y: yy, z: rr * Math.sin(u + twist) });
      }
      all3DRings.push(pts);
    }

    // Outer framing silhouette
    scene.addCircle(0, 0, silhouetteR, {
      role: 'accent',
      strokeWidthOverride: 1.6,
      zPriority: 8
    });
  }

  // Partition each 3D ring at z=0 into front (solid 1.0px) and back (dotted 2 5, 0.8px)
  for (const ringPts of all3DRings) {
    const projected = ringPts.map(projectPt);
    let current = [];
    let currentIsFront = projected[0].z >= 0;

    for (let i = 0; i < projected.length; i++) {
      const pt = projected[i];
      const isFront = pt.z >= 0;
      if (isFront === currentIsFront) {
        current.push(pt);
      } else {
        const prev = projected[i - 1];
        const denom = pt.z - prev.z;
        const t = Math.abs(denom) < 1e-6 ? 0.5 : -prev.z / denom;
        const cross = {
          x: prev.x + (pt.x - prev.x) * t,
          y: prev.y + (pt.y - prev.y) * t,
          z: 0
        };
        current.push(cross);
        emitProjectedSegment(scene, current, currentIsFront);
        current = [cross, pt];
        currentIsFront = isFront;
      }
    }
    if (current.length >= 2) {
      emitProjectedSegment(scene, current, currentIsFront);
    }
  }

  // Subtle front-hemisphere nodes (r <= 1.8px)
  if (frontNodes.length > 0) {
    const maxNodes = 16;
    const stride = Math.max(1, Math.floor(frontNodes.length / maxNodes));
    for (let i = 0; i < frontNodes.length; i += stride) {
      scene.addDot(frontNodes[i].x, frontNodes[i].y, 1.6, { filled: true, role: 'node' });
    }
  }

  // Axes, ticks, and center dot strictly gated behind annotations === true
  if (annotations) {
    const axisLen = silhouetteR * 1.15;
    const a1 = projectPt({ x: 0, y: -axisLen, z: 0 });
    const a2 = projectPt({ x: 0, y: axisLen, z: 0 });
    scene.addPath([{ x: a1.x, y: a1.y }, { x: a2.x, y: a2.y }], {
      role: 'annotation',
      isPolygonal: true,
      zPriority: 1
    });

    for (let t = -3; t <= 3; t++) {
      if (t === 0) continue;
      const yPos = (t / 4) * silhouetteR;
      const t1 = projectPt({ x: -5, y: yPos, z: 0 });
      const t2 = projectPt({ x: 5, y: yPos, z: 0 });
      scene.addTick(t1.x, t1.y, t2.x, t2.y, { role: 'annotation' });
    }

    scene.addDot(0, 0, 3.0, { filled: true, role: 'node', isGlow: true });
  }

  const bound = silhouetteR * 1.05;
  scene.setBounds({ minX: -bound, minY: -bound, maxX: bound, maxY: bound });
  return scene;
}

function emitProjectedSegment(scene, points, isFront) {
  if (points.length < 2) return;
  const pts2D = points.map(p => ({ x: p.x, y: p.y }));
  if (isFront) {
    scene.addPath(pts2D, {
      role: 'primary',
      visibility: 'front',
      strokeWidthOverride: 1.0,
      allowKnockout: false,
      zPriority: 5
    });
  } else {
    scene.addPath(pts2D, {
      role: 'primary',
      visibility: 'back',
      strokeWidthOverride: 0.8,
      allowKnockout: false,
      zPriority: 1
    });
  }
}
