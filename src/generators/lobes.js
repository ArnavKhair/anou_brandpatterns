/**
 * Generator 3: Lobes and Envelopes
 * (a) Rose and figure-8 lobes from r = a*cos(k*theta) with k from 1 to 4, plus center dot;
 * (b) A stack of 6 to 40 ellipses rotated about one axis so they pinch into a bow-tie;
 * (c) A circle foreshortened into a stack of flatter ellipses sharing one baseline.
 * Atom hint: s, p, and d orbital shapes.
 */

import { Scene } from '../scene.js';
import { sampleEllipse, applyPlaneTilt, Vec2 } from '../math.js';

export function generateLobes(prng, controls) {
  const scene = new Scene();
  scene.hasLobe = true;

  const { complexity = 0.5, symmetry = 0.5, focus = 0.5, depthTilt = false, annotations = false } = controls;
  const canvasCenter = { x: 500, y: 500 };

  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.45, 0.85);
  const shear = prng.range(-0.15, 0.15);

  function transformPt(pt) {
    if (!depthTilt) return pt;
    return applyPlaneTilt(pt, tiltAngle, squash, shear, canvasCenter);
  }

  const subType = prng.choice(['rose', 'bowtie_stack', 'foreshortened_stack']);
  const maxRadius = 380 * (0.55 + 0.45 * complexity);

  if (subType === 'rose') {
    // Polar rose / orbital lobes: r = A * cos(k * theta)
    const k = prng.choice([1, 2, 3, 4]); // 1 = circle/dipole, 2 = 4-leaf clover (d-orbital), 3 = 3/6-leaf, 4 = 8-leaf
    const numLayers = Math.round(1 + complexity * 3); // Nested orbital contours
    const baseRotation = prng.range(0, Math.PI * 2);

    for (let layer = 1; layer <= numLayers; layer++) {
      const layerScale = (layer / numLayers) * maxRadius;
      const points = [];
      const steps = 144;
      const angleMax = (k % 2 === 1) ? Math.PI : Math.PI * 2;

      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * angleMax;
        let r = layerScale * Math.cos(k * theta);

        // Symmetry jitter if low
        if (symmetry < 0.7) {
          r *= (1 + prng.range(-0.15, 0.15) * (1 - symmetry));
        }

        const angle = theta + baseRotation;
        const pt = {
          x: canvasCenter.x + r * Math.cos(angle),
          y: canvasCenter.y + r * Math.sin(angle)
        };
        points.push(transformPt(pt));
      }

      const isAccent = (layer === numLayers);
      scene.addPath(points, {
        role: isAccent ? 'accent' : 'structure',
        isClosed: true,
        isAccent,
        seed: prng.rangeInt(0, 1000000)
      });
    }

    // Nodes at tips of lobes
    const tipCount = (k % 2 === 1) ? k : k * 2;
    for (let t = 0; t < tipCount; t++) {
      const tipAngle = baseRotation + (t / tipCount) * Math.PI * 2;
      const tipPt = transformPt({
        x: canvasCenter.x + maxRadius * Math.cos(tipAngle),
        y: canvasCenter.y + maxRadius * Math.sin(tipAngle)
      });
      scene.addDot(tipPt.x, tipPt.y, prng.range(2.5, 3.5), { filled: true, role: 'nodes' });
    }

  } else if (subType === 'bowtie_stack') {
    // Stack of 6 to 40 rotated ellipses pinching into a bow-tie / nodal pinch
    const ellipseCount = Math.round(6 + complexity * 34); // 6 to 40
    const rx = maxRadius * 0.85;
    const ry = maxRadius * prng.range(0.2, 0.45);
    const rotationSpread = prng.range(Math.PI * 0.25, Math.PI * 0.65);
    const accentIndex = prng.rangeInt(0, ellipseCount - 1);

    for (let i = 0; i < ellipseCount; i++) {
      const t = ellipseCount > 1 ? (i / (ellipseCount - 1)) - 0.5 : 0;
      let rot = t * rotationSpread;
      if (symmetry < 0.8) {
        rot += prng.range(-0.08, 0.08) * (1 - symmetry);
      }

      const raw = sampleEllipse(canvasCenter.x, canvasCenter.y, rx, ry, rot, 0, Math.PI * 2, 72);
      const transformed = raw.map(transformPt);
      const isAccent = (i === accentIndex);

      scene.addPath(transformed, {
        role: isAccent ? 'accent' : 'structure',
        isClosed: true,
        isAccent,
        seed: prng.rangeInt(0, 1000000)
      });
    }

    // Nodal pinch center dot
    const cPt = transformPt(canvasCenter);
    scene.addDot(cPt.x, cPt.y, 4, { filled: true, role: 'nodes', isGlow: true });

  } else {
    // Foreshortened stack of flatter ellipses sharing one baseline
    const ellipseCount = Math.round(6 + complexity * 28);
    const rx = maxRadius * 0.8;
    const baselineY = canvasCenter.y + maxRadius * 0.4;
    const accentIndex = Math.floor(ellipseCount / 2);

    for (let i = 0; i < ellipseCount; i++) {
      const frac = (i + 1) / ellipseCount;
      const currentRy = maxRadius * 0.6 * frac;
      const currentCy = baselineY - currentRy;

      const raw = sampleEllipse(canvasCenter.x, currentCy, rx * (0.3 + 0.7 * frac), currentRy, 0, 0, Math.PI * 2, 64);
      const transformed = raw.map(transformPt);
      const isAccent = (i === accentIndex);

      scene.addPath(transformed, {
        role: isAccent ? 'accent' : 'structure',
        isClosed: true,
        isAccent,
        seed: prng.rangeInt(0, 1000000)
      });
    }
  }

  // Nucleus center dot
  const centerPt = transformPt(canvasCenter);
  scene.addDot(centerPt.x, centerPt.y, prng.range(3, 4.5), { filled: true, role: 'nodes', isGlow: true });
  scene.hasNucleusOrCenterDot = true;

  // Annotations
  if (annotations) {
    // Nodal plane guide lines and axes
    const p1 = transformPt({ x: canvasCenter.x - maxRadius * 1.1, y: canvasCenter.y });
    const p2 = transformPt({ x: canvasCenter.x + maxRadius * 1.1, y: canvasCenter.y });
    scene.addPath([p1, p2], { role: 'guides', allowOvershoot: false });

    // Arrowhead on guide axis
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    scene.addArrow(p2.x, p2.y, angle, 8, { filled: false, role: 'arrows' });

    // Guide circle
    const guidePts = sampleEllipse(canvasCenter.x, canvasCenter.y, maxRadius * 1.05, maxRadius * 1.05, 0, 0, Math.PI * 2, 48).map(transformPt);
    scene.addPath(guidePts, { role: 'guides', isClosed: true, allowBreak: false });
  }

  scene.enforceAtomHint(prng);
  return scene;
}
