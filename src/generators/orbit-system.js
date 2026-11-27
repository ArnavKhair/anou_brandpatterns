/**
 * Generator 7: Orbit Systems (Phase 1 Analytic — 3 Sub-Archetypes)
 * Sub-modes:
 * - keplerian: 8–14 ultra-fine (0.7px) closed ellipses via polar conic equations
 *   r(θ) = a(1-e^2) / (1 + e*cos(θ - ω)) sharing one exact focus dot, nested inside
 *   a circular boundary with 3–4 concentric inner rings.
 * - emblem: Central sphere (solid outer + solid front equator + dotted back equator)
 *   orbited by 3 tilted open arcs with taper metadata + minimal open chevrons.
 * - trajectory: 2–3 opposing sweeping S-curved/elliptical arcs with open chevrons,
 *   2–3 parallel motion-trail hairlines around a tight tilted inner core, and
 *   4–6 hollow marker rings (r=4px) placed via Poisson-disc sampling.
 */

import { Scene } from '../scene.js';
import { sampleArc, sampleEllipse, applyPlaneTilt, Vec2 } from '../math.js';

export function normalizeOrbitSubMode(subMode) {
  if (subMode === 'emblem' || subMode === 'trajectory') return subMode;
  return 'keplerian';
}

export function generateOrbitSystem(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.5,
    focus = 0.5,
    depthTilt = false,
    annotations = false,
    subMode
  } = controls;

  const mode = normalizeOrbitSubMode(subMode);
  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.62, 0.86);
  const shear = prng.range(-0.10, 0.10);
  const transformPt = (pt) => depthTilt ? applyPlaneTilt(pt, tiltAngle, squash, shear, { x: 0, y: 0 }) : pt;

  const emitCircle = (cx, cy, r, opts = {}) => {
    if (!depthTilt) {
      scene.addCircle(cx, cy, r, opts);
    } else {
      scene.addPath(sampleArc(cx, cy, r, 0, Math.PI * 2, 72).map(transformPt), { ...opts, isClosed: true });
    }
  };

  if (mode === 'keplerian') {
    const boundaryR = 240;
    const innerRings = 3 + (complexity > 0.65 ? 1 : 0);
    const orbitCount = Math.round(8 + complexity * 6); // 8 to 14

    // Outer circular boundary + 3–4 concentric inner rings
    emitCircle(0, 0, boundaryR, { role: 'accent', strokeWidthOverride: 1.5, zPriority: 8 });
    for (let rIdx = 1; rIdx <= innerRings; rIdx++) {
      const rr = boundaryR * (0.24 + (rIdx / (innerRings + 1)) * 0.58);
      emitCircle(0, 0, rr, { role: 'secondary', strokeWidthOverride: 0.6, zPriority: 2 });
    }

    // Shared exact focus
    const focusOffset = (1 - focus) * 45;
    const focusAng = prng.range(0, Math.PI * 2);
    const sharedFocus = {
      x: focusOffset * Math.cos(focusAng),
      y: focusOffset * Math.sin(focusAng)
    };

    for (let i = 0; i < orbitCount; i++) {
      const e = prng.range(0.28, 0.72);
      const omega = symmetry > 0.7
        ? (i / orbitCount) * Math.PI * 2
        : prng.range(0, Math.PI * 2);
      // Keep apoapsis r_max = a(1+e) safely inside boundaryR
      const rMax = boundaryR * prng.range(0.55, 0.94);
      const a = rMax / (1 + e);
      const b = a * Math.sqrt(1 - e * e);
      const cDist = a * e;
      const cx = sharedFocus.x - cDist * Math.cos(omega);
      const cy = sharedFocus.y - cDist * Math.sin(omega);

      if (!depthTilt) {
        scene.addEllipse(cx, cy, a, b, omega, {
          role: 'primary',
          strokeWidthOverride: 0.7,
          zPriority: 5
        });
      } else {
        // Polar conic r(θ) = a(1-e^2)/(1 + e*cos(θ - ω))
        const pts = [];
        const steps = 84;
        const latus = a * (1 - e * e);
        for (let s = 0; s <= steps; s++) {
          const theta = (s / steps) * Math.PI * 2;
          const r = latus / (1 + e * Math.cos(theta - omega));
          pts.push(transformPt({
            x: sharedFocus.x + r * Math.cos(theta),
            y: sharedFocus.y + r * Math.sin(theta)
          }));
        }
        scene.addPath(pts, {
          role: 'primary',
          isClosed: true,
          strokeWidthOverride: 0.7,
          zPriority: 5
        });
      }

      // Subtle orbital node on select ellipses
      if (i % 3 === 0) {
        const thetaNode = omega + prng.range(0.5, 2.2);
        const rNode = (a * (1 - e * e)) / (1 + e * Math.cos(thetaNode - omega));
        const np = transformPt({
          x: sharedFocus.x + rNode * Math.cos(thetaNode),
          y: sharedFocus.y + rNode * Math.sin(thetaNode)
        });
        scene.addDot(np.x, np.y, 2.2, { filled: true, role: 'node' });
      }
    }

    const tf = transformPt(sharedFocus);
    scene.addDot(tf.x, tf.y, 3.6, { filled: true, role: 'node', isGlow: true });
    scene.setBounds({ minX: -boundaryR, minY: -boundaryR, maxX: boundaryR, maxY: boundaryR });
  } else if (mode === 'emblem') {
    const sphereR = 68;
    // Central sphere: solid outer circle + solid front equator + dotted back equator
    emitCircle(0, 0, sphereR, { role: 'accent', strokeWidthOverride: 1.6, zPriority: 8 });
    const eqRy = sphereR * 0.34;
    if (!depthTilt) {
      scene.addArc(0, 0, sphereR, eqRy, 0, Math.PI, 0, {
        role: 'primary',
        visibility: 'front',
        strokeWidthOverride: 1.0,
        zPriority: 6
      });
      scene.addArc(0, 0, sphereR, eqRy, Math.PI, Math.PI * 2, 0, {
        role: 'primary',
        visibility: 'back',
        strokeWidthOverride: 0.8,
        zPriority: 1
      });
    } else {
      scene.addPath(sampleEllipse(0, 0, sphereR, eqRy, 0, 0, Math.PI, 40).map(transformPt), {
        role: 'primary',
        visibility: 'front',
        strokeWidthOverride: 1.0,
        zPriority: 6
      });
      scene.addPath(sampleEllipse(0, 0, sphereR, eqRy, 0, Math.PI, Math.PI * 2, 40).map(transformPt), {
        role: 'primary',
        visibility: 'back',
        strokeWidthOverride: 0.8,
        zPriority: 1
      });
    }

    // 3 tilted open arcs with taper metadata + minimal open chevrons
    const orbitRx = 220;
    const orbitRy = 78 + (1 - focus) * 24;
    const baseTilt = prng.range(-0.35, 0.35);

    for (let i = 0; i < 3; i++) {
      const rot = baseTilt + (i / 3) * Math.PI;
      const startAng = prng.range(0.15, 0.75);
      const span = prng.range(Math.PI * 1.15, Math.PI * 1.48);
      const endAng = startAng + span;
      const taperCfg = { startSolidRatio: 0.65, endDotSpacing: 6, terminalNodeRadius: 4.5 };

      if (!depthTilt) {
        scene.addArc(0, 0, orbitRx, orbitRy, startAng, endAng, rot, {
          role: 'primary',
          zPriority: 7,
          taper: taperCfg
        });
      } else {
        const pts = sampleEllipse(0, 0, orbitRx, orbitRy, rot, startAng, endAng, 64).map(transformPt);
        scene.addPath(pts, {
          role: 'primary',
          zPriority: 7,
          taper: taperCfg
        });
      }

      // Open chevron arrowhead near mid-solid segment
      const chevAng = startAng + span * 0.45;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const ex = orbitRx * Math.cos(chevAng), ey = orbitRy * Math.sin(chevAng);
      const tx = -orbitRx * Math.sin(chevAng), ty = orbitRy * Math.cos(chevAng);
      const pChev = transformPt({ x: ex * cosR - ey * sinR, y: ex * sinR + ey * cosR });
      const pNext = transformPt({
        x: (ex + tx * 0.02) * cosR - (ey + ty * 0.02) * sinR,
        y: (ex + tx * 0.02) * sinR + (ey + ty * 0.02) * cosR
      });
      scene.addArrow(pChev.x, pChev.y, Math.atan2(pNext.y - pChev.y, pNext.x - pChev.x), 7, {
        filled: false,
        role: 'node'
      });
    }

    const bound = orbitRx * 1.04;
    scene.setBounds({ minX: -bound, minY: -bound, maxX: bound, maxY: bound });
  } else {
    // trajectory: Sweeping Trajectory Study
    const coreR = 44;
    const coreTilt = prng.range(-0.5, 0.5);
    emitCircle(0, 0, coreR, { role: 'primary', zPriority: 5 });
    scene.addDot(0, 0, 3.2, { filled: true, role: 'node', isGlow: true });

    // 2–3 parallel motion-trail hairlines around tight tilted inner core
    const trailCount = complexity > 0.55 ? 3 : 2;
    for (let t = 0; t < trailCount; t++) {
      const rx = coreR * (1.45 + t * 0.35);
      const ry = coreR * (0.75 + t * 0.22);
      const sA = -Math.PI * 0.45 + t * 0.15;
      const eA = sA + Math.PI * 1.25;
      if (!depthTilt) {
        scene.addArc(0, 0, rx, ry, sA, eA, coreTilt, {
          role: 'secondary',
          strokeWidthOverride: 0.65,
          zPriority: 3
        });
      } else {
        scene.addPath(sampleEllipse(0, 0, rx, ry, coreTilt, sA, eA, 48).map(transformPt), {
          role: 'secondary',
          strokeWidthOverride: 0.65,
          zPriority: 3
        });
      }
    }

    // 2–3 opposing sweeping S-curved / elliptical arcs with open chevrons
    const sweepCount = complexity > 0.6 ? 3 : 2;
    const sweepR = 240;
    for (let s = 0; s < sweepCount; s++) {
      const ang = (s / sweepCount) * Math.PI + prng.range(-0.2, 0.2);
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      const pts = [];
      const steps = 64;
      for (let k = 0; k <= steps; k++) {
        const u = (k / steps) * 2 - 1; // -1..1
        const lx = u * sweepR * 1.15;
        const ly = Math.sin(u * Math.PI * 0.85) * 95 * (s % 2 === 0 ? 1 : -1) + (s - 0.5) * 28;
        pts.push(transformPt({
          x: lx * cosA - ly * sinA,
          y: lx * sinA + ly * cosA
        }));
      }
      scene.addPath(pts, {
        role: s === 0 ? 'accent' : 'primary',
        zPriority: s === 0 ? 8 : 7
      });

      const tip = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      scene.addArrow(tip.x, tip.y, Math.atan2(tip.y - prev.y, tip.x - prev.x), 7.5, {
        filled: false,
        role: 'node'
      });
    }

    // 4–6 hollow marker rings (r = 4px) placed via Poisson-disc sampling in outer negative space
    const targetMarkers = Math.round(4 + complexity * 2);
    const markers = [];
    for (let attempt = 0; attempt < 60 && markers.length < targetMarkers; attempt++) {
      const rDist = prng.range(115, 215);
      const rAng = prng.range(0, Math.PI * 2);
      const cand = { x: rDist * Math.cos(rAng), y: rDist * Math.sin(rAng) };
      if (markers.every(m => Vec2.dist(m, cand) >= 65)) {
        markers.push(cand);
        const tp = transformPt(cand);
        scene.addDot(tp.x, tp.y, 4.0, { filled: false, role: 'node' });
      }
    }

    scene.setBounds(
      { minX: -245, minY: -245, maxX: 245, maxY: 245 },
      { minX: -285, minY: -285, maxX: 285, maxY: 285 }
    );
  }

  if (annotations) {
    scene.addPath([transformPt({ x: -260, y: 0 }), transformPt({ x: 260, y: 0 })], {
      role: 'annotation',
      isPolygonal: true,
      zPriority: 1
    });
  }

  return scene;
}
