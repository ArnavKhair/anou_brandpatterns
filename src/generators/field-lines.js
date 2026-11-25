/**
 * Generator 4: Field Lines
 * Dipole lines r = L*sin^2(theta) with L growing in a geometric series
 * and mirrored across the axis, optional orthogonal equipotential loops,
 * optional hyperbola pair, two pole dots.
 * Atom hint: the field around a nucleus and an electron.
 */

import { Scene } from '../scene.js';
import { sampleEllipse, applyPlaneTilt, Vec2 } from '../math.js';

export function generateFieldLines(prng, controls) {
  const scene = new Scene();
  scene.hasDotRidingCurve = true;

  const { complexity = 0.5, symmetry = 0.5, focus = 0.5, depthTilt = false, annotations = false } = controls;
  const canvasCenter = { x: 500, y: 500 };

  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.45, 0.85);
  const shear = prng.range(-0.15, 0.15);

  function transformPt(pt) {
    if (!depthTilt) return pt;
    return applyPlaneTilt(pt, tiltAngle, squash, shear, canvasCenter);
  }

  const axisAngle = prng.range(0, Math.PI);
  const lineCount = Math.round(5 + complexity * 18); // 5 to 23 per side
  const growthRate = prng.range(1.15, 1.45);
  const withEquipotentials = prng.boolean(0.65);
  const withHyperbolas = prng.boolean(0.4);

  // Separation between dipole poles
  let poleDistance = 140 * (0.6 + 0.6 * (1 - focus));
  const pole1 = {
    x: canvasCenter.x - (poleDistance / 2) * Math.cos(axisAngle),
    y: canvasCenter.y - (poleDistance / 2) * Math.sin(axisAngle)
  };
  const pole2 = {
    x: canvasCenter.x + (poleDistance / 2) * Math.cos(axisAngle),
    y: canvasCenter.y + (poleDistance / 2) * Math.sin(axisAngle)
  };

  // Dipole field lines: r = L * sin^2(theta)
  // Drawn from pole 1 to pole 2
  const maxL = 450 * (0.5 + 0.5 * complexity);
  let currentL = poleDistance * 0.8;

  for (let i = 0; i < lineCount; i++) {
    currentL *= growthRate;
    if (currentL > maxL) break;

    // Both sides (+ and - theta)
    for (const side of [1, -1]) {
      const pts = [];
      const steps = 72;
      const angleStart = 0.08;
      const angleEnd = Math.PI - 0.08;

      for (let s = 0; s <= steps; s++) {
        const theta = angleStart + (s / steps) * (angleEnd - angleStart);
        let r = currentL * Math.sin(theta) * Math.sin(theta);

        if (symmetry < 0.7) {
          r *= (1 + prng.range(-0.1, 0.1) * (1 - symmetry));
        }

        const phi = axisAngle + side * theta;
        const pt = {
          x: canvasCenter.x + r * Math.cos(phi),
          y: canvasCenter.y + r * Math.sin(phi)
        };
        pts.push(transformPt(pt));
      }

      const isAccent = (i === 1 && side === 1);
      scene.addPath(pts, {
        role: isAccent ? 'accent' : 'structure',
        isClosed: false,
        allowOvershoot: true,
        isAccent,
        seed: prng.rangeInt(0, 1000000)
      });

      // Directional arrows along field lines if annotations on
      if (annotations && pts.length >= 10 && prng.boolean(0.35)) {
        const midIdx = Math.floor(pts.length / 2);
        const pA = pts[midIdx - 1];
        const pB = pts[midIdx + 1];
        const aAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        scene.addArrow(pts[midIdx].x, pts[midIdx].y, aAngle, 7, { filled: false, role: 'arrows' });
      }
    }
  }

  // Orthogonal equipotential loops around poles
  if (withEquipotentials) {
    const loopCount = Math.round(2 + complexity * 4);
    for (const pole of [pole1, pole2]) {
      for (let l = 1; l <= loopCount; l++) {
        const eqRadius = (poleDistance * 0.25) * Math.pow(1.35, l);
        const pts = [];
        const steps = 48;
        for (let s = 0; s <= steps; s++) {
          const theta = (s / steps) * Math.PI * 2;
          const pt = {
            x: pole.x + eqRadius * Math.cos(theta),
            y: pole.y + eqRadius * Math.sin(theta)
          };
          pts.push(transformPt(pt));
        }
        scene.addPath(pts, {
          role: 'structure',
          isClosed: true,
          seed: prng.rangeInt(0, 1000000)
        });
      }
    }
  }

  // Hyperbola pair asymptotes (guide lines)
  if (withHyperbolas || annotations) {
    const perpAngle = axisAngle + Math.PI / 2;
    const len = maxL * 0.7;
    const p1 = transformPt({
      x: canvasCenter.x - len * Math.cos(perpAngle),
      y: canvasCenter.y - len * Math.sin(perpAngle)
    });
    const p2 = transformPt({
      x: canvasCenter.x + len * Math.cos(perpAngle),
      y: canvasCenter.y + len * Math.sin(perpAngle)
    });
    scene.addPath([p1, p2], { role: 'guides', allowOvershoot: false });
  }

  // Two pole dots (the charges / nucleus and electron)
  const tp1 = transformPt(pole1);
  const tp2 = transformPt(pole2);
  scene.addDot(tp1.x, tp1.y, 4, { filled: true, role: 'nodes', isGlow: true });
  scene.addDot(tp2.x, tp2.y, 3.2, { filled: false, role: 'nodes' }); // Hollow ring for complementary pole
  scene.hasNucleusOrCenterDot = true;

  scene.enforceAtomHint(prng);
  return scene;
}
