/**
 * Generator 5: Particle Burst
 * 12 to 70 rays from one origin. Angles from jittered even spread,
 * lengths from skewed distribution (a few long rays, many short).
 * Tips take small arrowheads. Optional spokes ending in dots and broken concentric arcs.
 * Atom hint: scattering and decay tracks.
 */

import { Scene } from '../scene.js';
import { sampleArc, applyPlaneTilt, Vec2 } from '../math.js';

export function generateParticleBurst(prng, controls) {
  const scene = new Scene();
  scene.hasParticleTrack = true;

  const { complexity = 0.5, symmetry = 0.5, focus = 0.5, depthTilt = false, annotations = false } = controls;
  const canvasCenter = { x: 500, y: 500 };

  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.45, 0.85);
  const shear = prng.range(-0.15, 0.15);

  function transformPt(pt) {
    if (!depthTilt) return pt;
    return applyPlaneTilt(pt, tiltAngle, squash, shear, canvasCenter);
  }

  // Origin point
  let origin = { x: canvasCenter.x, y: canvasCenter.y };
  if (focus < 0.6) {
    // Off-center origin
    const offsetMag = (1 - focus) * 120;
    const offsetAngle = prng.range(0, Math.PI * 2);
    origin.x += offsetMag * Math.cos(offsetAngle);
    origin.y += offsetMag * Math.sin(offsetAngle);
  }

  const rayCount = Math.round(12 + complexity * 58); // 12 to 70 rays
  const isHalfPlane = (symmetry < 0.35) || prng.boolean(0.25);
  const spreadAngle = isHalfPlane ? Math.PI * prng.range(0.7, 1.2) : Math.PI * 2;
  const baseAngle = prng.range(0, Math.PI * 2);
  const arrowFilled = prng.boolean(0.4);
  const maxRayLen = 420 * (0.5 + 0.5 * complexity);

  const rays = [];

  for (let i = 0; i < rayCount; i++) {
    // Jittered even spread
    const frac = i / rayCount;
    let angle = baseAngle + frac * spreadAngle;
    if (symmetry < 0.8) {
      const jitter = (1 - symmetry) * (spreadAngle / rayCount) * 0.8;
      angle += prng.range(-jitter, jitter);
    }

    // Skewed length distribution (power law: mostly short, few long rays)
    const u = prng.next();
    const lengthFrac = Math.pow(u, 2.5); // Skewed toward 0
    const len = 40 + lengthFrac * (maxRayLen - 40);

    const tip = {
      x: origin.x + len * Math.cos(angle),
      y: origin.y + len * Math.sin(angle)
    };

    rays.push({ angle, len, tip });

    // Draw ray path
    const p1 = transformPt(origin);
    const p2 = transformPt(tip);
    const isAccent = (lengthFrac > 0.85 && prng.boolean(0.5));

    scene.addPath([p1, p2], {
      role: isAccent ? 'accent' : 'structure',
      allowOvershoot: true,
      isAccent,
      seed: prng.rangeInt(0, 1000000)
    });

    // Arrowhead or dot at tip
    const transformedTip = p2;
    const rayAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    if (prng.boolean(0.45) || annotations) {
      scene.addArrow(transformedTip.x, transformedTip.y, rayAngle, prng.range(6, 9), {
        filled: arrowFilled,
        role: 'arrows'
      });
    } else if (prng.boolean(0.5)) {
      scene.addDot(transformedTip.x, transformedTip.y, prng.range(2, 3.5), {
        filled: prng.boolean(0.7),
        role: 'nodes'
      });
    }
  }

  // Broken concentric detector arcs
  const arcCount = Math.round(2 + complexity * 4);
  for (let a = 1; a <= arcCount; a++) {
    const arcR = (maxRayLen / (arcCount + 1)) * a;
    const numSegments = prng.rangeInt(3, 7);

    for (let s = 0; s < numSegments; s++) {
      if (prng.boolean(0.35)) continue; // Broken gaps
      const segStart = (s / numSegments) * Math.PI * 2 + prng.range(-0.1, 0.1);
      const segLen = (Math.PI * 2 / numSegments) * prng.range(0.4, 0.75);
      const segEnd = segStart + segLen;

      const pts = sampleArc(origin.x, origin.y, arcR, segStart, segEnd, 24).map(transformPt);
      scene.addPath(pts, {
        role: 'structure',
        isClosed: false,
        allowOvershoot: false,
        seed: prng.rangeInt(0, 1000000)
      });
    }
  }

  // Origin collision node (nucleus scattering center)
  const tOrigin = transformPt(origin);
  scene.addDot(tOrigin.x, tOrigin.y, 4.5, { filled: true, role: 'nodes', isGlow: true });
  scene.hasNucleusOrCenterDot = true;

  // Annotations: circular calibrated detector ring
  if (annotations) {
    const outerR = maxRayLen * 1.05;
    const ringPts = sampleArc(origin.x, origin.y, outerR, 0, Math.PI * 2, 64).map(transformPt);
    scene.addPath(ringPts, { role: 'guides', isClosed: true, allowBreak: false });

    // Ticks around outer ring
    const numTicks = 24;
    for (let t = 0; t < numTicks; t++) {
      const a = (t / numTicks) * Math.PI * 2;
      const t1 = transformPt({ x: origin.x + (outerR - 5) * Math.cos(a), y: origin.y + (outerR - 5) * Math.sin(a) });
      const t2 = transformPt({ x: origin.x + (outerR + 5) * Math.cos(a), y: origin.y + (outerR + 5) * Math.sin(a) });
      scene.addTick(t1.x, t1.y, t2.x, t2.y, { role: 'guides' });
    }
  }

  scene.enforceAtomHint(prng);
  return scene;
}
