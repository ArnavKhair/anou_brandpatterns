/**
 * Generator 2: Tangent Chains and Spirals
 * Circles that each touch the previous one, with a dot at every touch point.
 * Radius shrinks by ratio 0.55 to 0.85, curling into an epicycle or spiral.
 * Optional golden-spiral arcs with rotated squares as hairline construction lines.
 */

import { Scene } from '../scene.js';
import { sampleArc, applyPlaneTilt, Vec2 } from '../math.js';

export function generateTangentChain(prng, controls) {
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

  // Chain parameters
  const chainLength = Math.round(5 + complexity * 12); // 5 to 17 circles
  const ratio = prng.range(0.60, 0.85);
  const baseTurnAngle = prng.range(Math.PI * 0.4, Math.PI * 0.95);
  const bleed = prng.boolean(0.5); // Biggest arc may bleed off frame

  let currentRadius = bleed ? prng.range(280, 420) : prng.range(180, 260);
  let currentCenter = {
    x: canvasCenter.x - currentRadius * 0.4,
    y: canvasCenter.y + currentRadius * 0.2
  };
  let currentAngle = prng.range(0, Math.PI * 2);

  // If focus is high, shift initial center closer to canvas center
  if (focus > 0.5) {
    currentCenter = Vec2.lerp(currentCenter, canvasCenter, (focus - 0.5) * 1.5);
  }

  const centers = [currentCenter];
  const radii = [currentRadius];
  const touchPoints = [];

  for (let i = 0; i < chainLength; i++) {
    const nextRadius = currentRadius * ratio;
    if (nextRadius < 5) break;

    // Angle to place next circle tangent to current
    let turn = baseTurnAngle;
    if (symmetry < 0.8) {
      turn += prng.range(-0.25, 0.25) * (1 - symmetry);
    }

    currentAngle += turn;
    const distanceBetweenCenters = currentRadius + nextRadius;

    // Next center
    const nextCenter = {
      x: currentCenter.x + distanceBetweenCenters * Math.cos(currentAngle),
      y: currentCenter.y + distanceBetweenCenters * Math.sin(currentAngle)
    };

    // Touch point sits on line between currentCenter and nextCenter
    const touchPoint = {
      x: currentCenter.x + currentRadius * Math.cos(currentAngle),
      y: currentCenter.y + currentRadius * Math.sin(currentAngle)
    };
    touchPoints.push(touchPoint);

    currentCenter = nextCenter;
    currentRadius = nextRadius;
    centers.push(currentCenter);
    radii.push(currentRadius);
  }

  // Draw circles
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const r = radii[i];
    const raw = sampleArc(c.x, c.y, r, 0, Math.PI * 2, 64);
    const transformed = raw.map(transformPt);

    const isAccent = (i === 1 || (i === 0 && prng.boolean(0.4)));
    scene.addPath(transformed, {
      role: isAccent ? 'accent' : 'structure',
      isClosed: true,
      isAccent,
      seed: prng.rangeInt(0, 1000000)
    });
  }

  // Dots at touch points
  for (let i = 0; i < touchPoints.length; i++) {
    const tp = transformPt(touchPoints[i]);
    scene.addDot(tp.x, tp.y, prng.range(2.2, 3.8), {
      filled: true,
      role: 'nodes'
    });
  }

  // Golden spiral arc connecting touch points / centers
  if (centers.length >= 3) {
    const spiralPts = [];
    for (let i = 0; i < centers.length; i++) {
      spiralPts.push(centers[i]);
      if (touchPoints[i]) spiralPts.push(touchPoints[i]);
    }
    const transformedSpiral = spiralPts.map(transformPt);
    scene.addPath(transformedSpiral, {
      role: 'structure',
      isClosed: false,
      allowOvershoot: true,
      seed: prng.rangeInt(0, 1000000)
    });

    // Arrowhead at spiral tail if annotations on
    if (annotations && transformedSpiral.length >= 2) {
      const tip = transformedSpiral[transformedSpiral.length - 1];
      const prev = transformedSpiral[transformedSpiral.length - 2];
      const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
      scene.addArrow(tip.x, tip.y, angle, 8, { filled: false, role: 'arrows' });
    }
  }

  // Construction lines / rotated squares (guides)
  if (annotations || prng.boolean(0.4)) {
    for (let i = 0; i < Math.min(centers.length - 1, 5); i++) {
      const c1 = centers[i];
      const c2 = centers[i + 1];
      const side = radii[i] * 1.4;
      const angle = Math.atan2(c2.y - c1.y, c2.x - c1.x);

      const half = side / 2;
      const squarePts = [
        { x: -half, y: -half },
        { x: half, y: -half },
        { x: half, y: half },
        { x: -half, y: half }
      ].map(p => {
        const rot = Vec2.rotate(p, angle);
        return transformPt({ x: c1.x + rot.x, y: c1.y + rot.y });
      });

      // Add as guide polygon
      for (let s = 0; s < 4; s++) {
        scene.addPath([squarePts[s], squarePts[(s + 1) % 4]], {
          role: 'guides',
          isClosed: false,
          allowOvershoot: true,
          seed: prng.rangeInt(0, 1000000)
        });
      }
    }
  }

  scene.enforceAtomHint(prng);
  return scene;
}
