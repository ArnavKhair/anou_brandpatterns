/**
 * Generator 1: Rosettes and Circle Lattices
 * Overlapping equal circles on a hex, square, or ring lattice,
 * optionally inside a boundary circle, or nested circles tangent inside it.
 */

import { Scene } from '../scene.js';
import { sampleArc, sampleEllipse, applyPlaneTilt, Vec2 } from '../math.js';

export function generateRosette(prng, controls) {
  const scene = new Scene();
  scene.hasLatticeNodes = true;

  const { complexity = 0.5, symmetry = 0.5, focus = 0.5, depthTilt = false, annotations = false } = controls;

  const canvasCenter = { x: 500, y: 500 };
  const maxRadius = 420 * (0.45 + 0.55 * complexity); // 45% to 100% of available radius
  const latticeTypes = ['ring', 'hex', 'square', 'nested_tangent'];
  const latticeType = prng.choice(latticeTypes);

  // Ring / count calculation scaled by complexity
  const count = Math.round(3 + complexity * 9); // 3 to 12
  const radiusShare = prng.range(0.55, 0.95);
  const boundaryOn = prng.boolean(0.65);
  const useStarNodes = prng.boolean(0.4);
  const centerGlow = prng.boolean(0.85);

  // Tilt parameters
  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.45, 0.85);
  const shear = prng.range(-0.15, 0.15);

  // Transform helper that applies tilt if depthTilt is on
  function transformPt(pt) {
    if (!depthTilt) return pt;
    return applyPlaneTilt(pt, tiltAngle, squash, shear, canvasCenter);
  }

  function addCirclePath(cx, cy, r, role = 'structure', isAccent = false) {
    const raw = sampleArc(cx, cy, r, 0, Math.PI * 2, 72);
    const transformed = raw.map(transformPt);
    scene.addPath(transformed, {
      role,
      isClosed: true,
      isAccent,
      seed: prng.rangeInt(0, 1000000)
    });
  }

  const crossingPoints = [];

  if (latticeType === 'ring') {
    // Concentric rings of petal circles
    const kFold = Math.round(3 + symmetry * 9); // rotational symmetry order
    const numRings = Math.max(1, Math.round(1 + complexity * 4));

    for (let ring = 1; ring <= numRings; ring++) {
      const ringRadius = (ring / numRings) * (maxRadius * 0.7);
      const circleR = (maxRadius / numRings) * radiusShare;
      const petalsInRing = Math.round(kFold * ring);

      for (let i = 0; i < petalsInRing; i++) {
        let angle = (i / petalsInRing) * Math.PI * 2;
        let rOffset = 0;

        // Symmetry perturb
        if (symmetry < 0.99) {
          const jitterAmount = (1 - symmetry) * 0.35;
          if (symmetry < 0.5 || prng.boolean(0.3)) {
            angle += prng.range(-jitterAmount, jitterAmount) * (Math.PI / petalsInRing);
            rOffset += prng.range(-jitterAmount, jitterAmount) * (ringRadius * 0.2);
          }
        }

        // Focus pull
        let cx = canvasCenter.x + (ringRadius + rOffset) * Math.cos(angle);
        let cy = canvasCenter.y + (ringRadius + rOffset) * Math.sin(angle);
        if (focus > 0.5) {
          const pull = (focus - 0.5) * 0.4;
          cx = Vec2.lerp({ x: cx, y: cy }, canvasCenter, pull).x;
          cy = Vec2.lerp({ x: cx, y: cy }, canvasCenter, pull).y;
        }

        const isAccent = (ring === 1 && i === 0 && prng.boolean(0.5));
        addCirclePath(cx, cy, circleR, isAccent ? 'accent' : 'structure', isAccent);

        crossingPoints.push({ x: cx, y: cy });
      }
    }
  } else if (latticeType === 'hex') {
    // Hexagonal packing lattice
    const spacing = 70 - complexity * 35; // 35 to 70
    const circleR = spacing * radiusShare;
    const gridLimit = Math.ceil(maxRadius / spacing);

    for (let q = -gridLimit; q <= gridLimit; q++) {
      for (let r = -gridLimit; r <= gridLimit; r++) {
        const x = canvasCenter.x + spacing * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
        const y = canvasCenter.y + spacing * (1.5 * r);
        const d = Vec2.dist({ x, y }, canvasCenter);

        if (d <= maxRadius) {
          let cx = x;
          let cy = y;
          if (symmetry < 0.8) {
            const jitter = (1 - symmetry) * 0.35 * spacing;
            cx += prng.range(-jitter, jitter);
            cy += prng.range(-jitter, jitter);
          }
          addCirclePath(cx, cy, circleR);
          if (prng.boolean(0.25)) crossingPoints.push({ x: cx, y: cy });
        }
      }
    }
  } else if (latticeType === 'square') {
    // Square grid lattice
    const spacing = 80 - complexity * 40;
    const circleR = spacing * radiusShare;
    const gridLimit = Math.ceil(maxRadius / spacing);

    for (let ix = -gridLimit; ix <= gridLimit; ix++) {
      for (let iy = -gridLimit; iy <= gridLimit; iy++) {
        const x = canvasCenter.x + ix * spacing;
        const y = canvasCenter.y + iy * spacing;
        const d = Vec2.dist({ x, y }, canvasCenter);

        if (d <= maxRadius) {
          let cx = x;
          let cy = y;
          if (symmetry < 0.8) {
            const jitter = (1 - symmetry) * 0.35 * spacing;
            cx += prng.range(-jitter, jitter);
            cy += prng.range(-jitter, jitter);
          }
          addCirclePath(cx, cy, circleR);
          if (prng.boolean(0.2)) crossingPoints.push({ x: cx, y: cy });
        }
      }
    }
  } else {
    // Nested circles tangent inside boundary
    const numCircles = Math.round(4 + complexity * 10);
    for (let i = 0; i < numCircles; i++) {
      const frac = (i + 1) / numCircles;
      const r = (maxRadius * frac) / 2;
      const cx = canvasCenter.x;
      const cy = canvasCenter.y + maxRadius / 2 - r;
      addCirclePath(cx, cy, r, i === numCircles - 1 ? 'accent' : 'structure');
      crossingPoints.push({ x: cx, y: canvasCenter.y + maxRadius / 2 });
    }
  }

  // Outer boundary circle
  if (boundaryOn) {
    addCirclePath(canvasCenter.x, canvasCenter.y, maxRadius, 'structure', false);
  }

  // Crossing nodes / star marks
  const sampleCrossings = crossingPoints.filter(() => prng.boolean(0.5)).slice(0, 24);
  for (const pt of sampleCrossings) {
    const tPt = transformPt(pt);
    if (useStarNodes) {
      scene.addStarNode(tPt.x, tPt.y, prng.range(4, 7), 4, { role: 'nodes' });
    } else {
      scene.addDot(tPt.x, tPt.y, prng.range(2, 3.5), { filled: prng.boolean(0.8), role: 'nodes' });
    }
  }

  // Center glow dot
  if (centerGlow) {
    const centerPt = transformPt(canvasCenter);
    scene.addDot(centerPt.x, centerPt.y, prng.range(3.5, 5), {
      filled: true,
      role: 'nodes',
      isGlow: true
    });
    scene.hasNucleusOrCenterDot = true;
  }

  // Annotation artifacts
  if (annotations) {
    // Dashed guide circle
    const guidePts = sampleArc(canvasCenter.x, canvasCenter.y, maxRadius * 1.08, 0, Math.PI * 2, 60).map(transformPt);
    scene.addPath(guidePts, { role: 'guides', isClosed: true, allowBreak: false });

    // Center axes with tick marks
    const axisLen = maxRadius * 0.9;
    const pX1 = transformPt({ x: canvasCenter.x - axisLen, y: canvasCenter.y });
    const pX2 = transformPt({ x: canvasCenter.x + axisLen, y: canvasCenter.y });
    const pY1 = transformPt({ x: canvasCenter.x, y: canvasCenter.y - axisLen });
    const pY2 = transformPt({ x: canvasCenter.x, y: canvasCenter.y + axisLen });

    scene.addPath([pX1, pX2], { role: 'guides', allowOvershoot: false });
    scene.addPath([pY1, pY2], { role: 'guides', allowOvershoot: false });

    // Ticks along axes
    const tickCount = 6;
    for (let t = 1; t <= tickCount; t++) {
      const frac = t / (tickCount + 1);
      const tx = canvasCenter.x - axisLen + frac * 2 * axisLen;
      const t1 = transformPt({ x: tx, y: canvasCenter.y - 4 });
      const t2 = transformPt({ x: tx, y: canvasCenter.y + 4 });
      scene.addTick(t1.x, t1.y, t2.x, t2.y, { role: 'guides' });
    }
  }

  scene.enforceAtomHint(prng);
  return scene;
}
