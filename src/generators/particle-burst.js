/**
 * Generator 5: Particle Bursts (Phase 1 Analytic)
 * - Full-360° stratified radial field: 32–48 rays across 0..2pi
 *   with subtle stratified jitter |delta_i| <= 0.25 * (2pi / N)
 * - Clean inner clear-zone radius r_inner around (0, 0)
 * - Smooth length modulation within [0.35R, 0.92R]
 * - Open chevron arrowhead at every ray tip
 * - Outer calibrated ruler rings strictly gated behind annotations === true
 */

import { Scene } from '../scene.js';
import { sampleArc, applyPlaneTilt } from '../math.js';

export function generateParticleBurst(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.5,
    focus = 0.5,
    depthTilt = false,
    annotations = false
  } = controls;

  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.62, 0.85);
  const shear = prng.range(-0.10, 0.10);
  const transformPt = (pt) => depthTilt ? applyPlaneTilt(pt, tiltAngle, squash, shear, { x: 0, y: 0 }) : pt;

  const R = 240;
  const rInner = 24 + focus * 14; // Clean inner clear-zone around (0, 0)
  const N = Math.round(32 + complexity * 16); // 32 to 48 rays
  const binWidth = (Math.PI * 2) / N;
  const maxJitter = 0.25 * binWidth * (1 - symmetry * 0.7);
  const phase1 = prng.range(0, Math.PI * 2);
  const phase2 = prng.range(0, Math.PI * 2);
  const freq1 = prng.choice([2, 3, 4]);
  const freq2 = prng.choice([5, 6, 7]);

  for (let i = 0; i < N; i++) {
    const jitter = prng.range(-maxJitter, maxJitter);
    const theta = i * binWidth + jitter;

    // Smooth harmonic length modulation within [0.35R, 0.92R]
    const wave = 0.5 + 0.35 * Math.cos(freq1 * theta + phase1) + 0.15 * Math.sin(freq2 * theta + phase2);
    const clampedWave = Math.max(0, Math.min(1, wave));
    const len = R * (0.35 + clampedWave * (0.92 - 0.35));

    const p1 = transformPt({ x: rInner * Math.cos(theta), y: rInner * Math.sin(theta) });
    const p2 = transformPt({ x: len * Math.cos(theta), y: len * Math.sin(theta) });
    const isAccent = (clampedWave > 0.82 && i % 4 === 0);

    scene.addPath([p1, p2], {
      role: isAccent ? 'accent' : 'primary',
      isPolygonal: true,
      zPriority: isAccent ? 8 : 5
    });

    const rayAng = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    scene.addArrow(p2.x, p2.y, rayAng, 6.5, { filled: false, role: 'node' });
  }

  // Clean inner clear-zone ring & origin dot
  if (!depthTilt) {
    scene.addCircle(0, 0, rInner * 0.82, { role: 'secondary', strokeWidthOverride: 0.8, zPriority: 3 });
  } else {
    scene.addPath(sampleArc(0, 0, rInner * 0.82, 0, Math.PI * 2, 48).map(transformPt), {
      role: 'secondary',
      isClosed: true,
      strokeWidthOverride: 0.8,
      zPriority: 3
    });
  }
  scene.addDot(0, 0, 3.6, { filled: true, role: 'node', isGlow: true });

  // Outer calibrated ruler rings strictly gated behind annotations === true
  if (annotations) {
    const outerR = R * 0.98;
    if (!depthTilt) {
      scene.addCircle(0, 0, outerR, { role: 'annotation', zPriority: 1 });
    } else {
      scene.addPath(sampleArc(0, 0, outerR, 0, Math.PI * 2, 72).map(transformPt), {
        role: 'annotation',
        isClosed: true,
        zPriority: 1
      });
    }
    const numTicks = 24;
    for (let t = 0; t < numTicks; t++) {
      const a = (t / numTicks) * Math.PI * 2;
      const t1 = transformPt({ x: (outerR - 5) * Math.cos(a), y: (outerR - 5) * Math.sin(a) });
      const t2 = transformPt({ x: (outerR + 5) * Math.cos(a), y: (outerR + 5) * Math.sin(a) });
      scene.addTick(t1.x, t1.y, t2.x, t2.y, { role: 'annotation' });
    }
  }

  scene.setBounds({ minX: -R, minY: -R, maxX: R, maxY: R });
  return scene;
}
