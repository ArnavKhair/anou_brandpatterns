/**
 * Generator 3: Lobes and Envelopes (Phase 1 Analytic)
 * Sub-modes:
 * - bowtie_stack: 3D circle rotating around Y-axis with non-linear caustic density
 *   u_i = sin^2((pi * i) / (2 * N)), N in [32, 64]
 * - foreshortened_stack: Stack of flatter ellipses sharing one baseline with sin^2 caustic easing
 * - rose: Multi-harmonic rose contours r(theta) = R + a*cos(k1*theta) + b*cos(k2*theta + phi)
 */

import { Scene } from '../scene.js';
import { sampleEllipse, applyPlaneTilt } from '../math.js';

export function normalizeLobesSubMode(subMode) {
  if (subMode === 'rose' || subMode === 'foreshortened_stack') return subMode;
  return 'bowtie_stack';
}

export function generateLobes(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.75,
    focus = 0.5,
    depthTilt = false,
    annotations = false,
    subMode
  } = controls;

  const mode = normalizeLobesSubMode(subMode);
  const maxR = 230;

  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.62, 0.85);
  const shear = prng.range(-0.10, 0.10);
  const transformPt = (pt) => depthTilt ? applyPlaneTilt(pt, tiltAngle, squash, shear, { x: 0, y: 0 }) : pt;

  if (mode === 'bowtie_stack') {
    const N = Math.round(32 + complexity * 32); // N in [32, 64]
    const R = maxR * 0.92;
    const rot2D = prng.range(-Math.PI * 0.25, Math.PI * 0.25);
    const pruneStart = symmetry < 0.65 ? Math.floor(N * 0.18) : -1;
    const pruneEnd = symmetry < 0.65 ? Math.floor(N * (0.18 + (0.65 - symmetry) * 0.35)) : -1;
    const accentIdx = Math.floor(N * 0.25);

    for (let i = 0; i < N; i++) {
      if (i >= pruneStart && i <= pruneEnd) continue;
      // Optical caustic density: u_i = sin^2((pi * i) / (2 * N))
      const u = Math.pow(Math.sin((Math.PI * i) / (2 * Math.max(1, N - 1))), 2);
      const phi = (u - 0.5) * Math.PI * 0.94;
      const rx = Math.max(2, R * Math.abs(Math.cos(phi)));
      const ry = R;
      const isAccent = (i === accentIdx || i === N - 1 - accentIdx);

      if (!depthTilt) {
        scene.addEllipse(0, 0, rx, ry, rot2D, {
          role: isAccent ? 'accent' : 'primary',
          strokeWidthOverride: isAccent ? null : 0.65,
          zPriority: isAccent ? 8 : 5
        });
      } else {
        const pts = sampleEllipse(0, 0, rx, ry, rot2D, 0, Math.PI * 2, 72).map(transformPt);
        scene.addPath(pts, {
          role: isAccent ? 'accent' : 'primary',
          isClosed: true,
          strokeWidthOverride: isAccent ? null : 0.65,
          zPriority: isAccent ? 8 : 5
        });
      }
    }

    const sinR = Math.sin(rot2D), cosR = Math.cos(rot2D);
    const topPole = transformPt({ x: R * sinR, y: -R * cosR });
    const botPole = transformPt({ x: -R * sinR, y: R * cosR });
    scene.addStarNode(topPole.x, topPole.y, 5.0, 4, { role: 'node' });
    scene.addStarNode(botPole.x, botPole.y, 5.0, 4, { role: 'node' });
    scene.setBounds({ minX: -R, minY: -R, maxX: R, maxY: R });
  } else if (mode === 'foreshortened_stack') {
    const N = Math.round(32 + complexity * 16); // N in [32, 48]
    const rxBase = maxR * 0.88;
    const baselineY = maxR * 0.52;
    const accentIdx = Math.floor(N * 0.65);

    for (let i = 1; i <= N; i++) {
      if (symmetry < 0.6 && i % 5 === 2) continue;
      // Optical caustic density: u_i = sin^2((pi * i) / (2 * N))
      const u = Math.pow(Math.sin((Math.PI * i) / (2 * N)), 2);
      const currentRy = Math.max(3, maxR * 0.64 * u);
      const currentRx = rxBase * (0.30 + 0.70 * u);
      const currentCy = baselineY - currentRy;
      const isAccent = (i === accentIdx);

      if (!depthTilt) {
        scene.addEllipse(0, currentCy, currentRx, currentRy, 0, {
          role: isAccent ? 'accent' : 'primary',
          strokeWidthOverride: isAccent ? null : 0.65,
          allowKnockout: false,
          zPriority: isAccent ? 8 : 5
        });
      } else {
        const pts = sampleEllipse(0, currentCy, currentRx, currentRy, 0, 0, Math.PI * 2, 72).map(transformPt);
        scene.addPath(pts, {
          role: isAccent ? 'accent' : 'primary',
          isClosed: true,
          strokeWidthOverride: isAccent ? null : 0.65,
          allowKnockout: false,
          zPriority: isAccent ? 8 : 5
        });
      }
    }

    const baseDot = transformPt({ x: 0, y: baselineY });
    scene.addDot(baseDot.x, baseDot.y, 3.2, { filled: true, role: 'node', isGlow: true });
    scene.setBounds({ minX: -rxBase, minY: baselineY - maxR * 1.28, maxX: rxBase, maxY: baselineY });
  } else {
    // rose
    const k1 = prng.choice([2, 3, 4, 5]);
    const k2 = prng.choice([k1 * 2, k1 + 1, k1 + 2]);
    const phi = symmetry < 0.7 ? prng.range(0.25, Math.PI * 0.75) : 0;
    const numLayers = Math.round(3 + complexity * 4);
    const baseRot = prng.range(0, Math.PI * 2);

    const RBase = maxR * 0.42;
    const aBase = maxR * (0.36 + 0.14 * focus);
    const bBase = maxR * (symmetry < 0.75 ? 0.15 : 0.10);
    const partialArc = symmetry < 0.55;
    const arcStart = prng.range(0, Math.PI * 0.5);
    const arcSpan = partialArc ? Math.PI * (1.2 + symmetry * 0.65) : Math.PI * 2;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let layer = 1; layer <= numLayers; layer++) {
      const scale = layer / numLayers;
      const points = [];
      const steps = 160;
      for (let s = 0; s <= steps; s++) {
        const theta = arcStart + (s / steps) * arcSpan;
        const r = scale * (RBase + aBase * Math.cos(k1 * theta) + bBase * Math.cos(k2 * theta + phi));
        const ang = theta + baseRot;
        const pt = transformPt({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
        points.push(pt);
        if (layer === numLayers) {
          minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
        }
      }
      const isAccent = (layer === numLayers);
      scene.addPath(points, {
        role: isAccent ? 'accent' : 'primary',
        isClosed: !partialArc,
        strokeWidthOverride: !isAccent && numLayers >= 5 ? 0.7 : null,
        zPriority: isAccent ? 8 : 5
      });
    }

    for (let t = 0; t < k1; t++) {
      const theta = (t / k1) * Math.PI * 2;
      if (partialArc && (theta < arcStart || theta > arcStart + arcSpan)) continue;
      const r = RBase + aBase * Math.cos(k1 * theta) + bBase * Math.cos(k2 * theta + phi);
      const pt = transformPt({ x: r * Math.cos(theta + baseRot), y: r * Math.sin(theta + baseRot) });
      scene.addDot(pt.x, pt.y, 2.6, { filled: true, role: 'node' });
    }

    const cPt = transformPt({ x: 0, y: 0 });
    scene.addDot(cPt.x, cPt.y, 3.2, { filled: true, role: 'node', isGlow: true });
    scene.setBounds({ minX, minY, maxX, maxY });
  }

  if (annotations) {
    const b = scene.coreBounds;
    scene.addPath([transformPt({ x: b.minX, y: 0 }), transformPt({ x: b.maxX, y: 0 })], {
      role: 'annotation',
      isPolygonal: true,
      zPriority: 1
    });
  }

  return scene;
}
