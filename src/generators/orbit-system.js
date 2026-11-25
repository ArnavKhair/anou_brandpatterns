/**
 * Generator 7: Orbit Systems
 * 2 to 6 ellipses with random eccentricity (0.2 to 0.9) and rotation,
 * dots riding the paths, arrowheads on some, hollow marker circles scattered around.
 *
 * Profiles:
 * - Field orbit (default): all ellipses sharing one focus like Keplerian comet orbits, no central nucleus ball.
 * - Bohr profile (drawn in ~1 of 8 orbit patterns, with strict guardrails):
 *   - Orbits are open arcs covering 55 to 85 percent of the ellipse, never closed.
 *   - Tilts and sizes are irregular (never a trio of identical ellipses at even angles).
 *   - Dots sit on arcs only, unevenly spaced, tiny nucleus dot or left out.
 *   - At most one orbit is bold.
 */

import { Scene } from '../scene.js';
import { sampleEllipse, applyPlaneTilt, Vec2 } from '../math.js';

export function generateOrbitSystem(prng, controls) {
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

  // Profile selection: Bohr in ~1 of 8 (~12.5%)
  const isBohrProfile = prng.boolean(0.125);
  const orbitCount = isBohrProfile
    ? Math.round(3 + complexity * 2) // 3 to 5 for Bohr
    : Math.round(2 + complexity * 4); // 2 to 6 for Field orbit

  const bleed = prng.boolean(0.5); // Large arcs may bleed off frame
  const maxSemiMajor = bleed ? 480 : 380;
  const accentOrbitIndex = prng.rangeInt(0, orbitCount - 1);

  if (isBohrProfile) {
    // === Bohr Profile (with strict guardrails) ===
    // 1. Orbits are open arcs covering 55% to 85% of ellipse, never closed.
    // 2. Irregular tilts and sizes (no symmetric trio at 120 deg).
    // 3. Dots sit on arcs only, unevenly spaced, no glossy nucleus ball.
    // 4. At most one orbit is bold.

    const baseSizes = [0.45, 0.65, 0.85, 1.0, 1.15].slice(0, orbitCount);

    for (let i = 0; i < orbitCount; i++) {
      // Irregular sizes with jitter
      const a = (baseSizes[i] || (0.4 + i * 0.2)) * maxSemiMajor * prng.range(0.85, 1.15);
      const eccentricity = prng.range(0.35, 0.75);
      const b = a * Math.sqrt(1 - eccentricity * eccentricity);

      // Irregular rotation angle (avoid even division)
      const rotAngle = prng.range(0, Math.PI * 2);

      // Open arc covering 55% to 85%
      const arcCoverage = prng.range(0.55, 0.85) * Math.PI * 2;
      const startAngle = prng.range(0, Math.PI * 2);
      const endAngle = startAngle + arcCoverage;

      const raw = sampleEllipse(canvasCenter.x, canvasCenter.y, a, b, rotAngle, startAngle, endAngle, 80);
      const transformed = raw.map(transformPt);
      const isAccent = (i === accentOrbitIndex);

      scene.addPath(transformed, {
        role: isAccent ? 'accent' : 'structure',
        isClosed: false,
        allowOvershoot: true,
        isAccent,
        seed: prng.rangeInt(0, 1000000)
      });

      // Dots unevenly spaced riding along the arc
      const dotCount = prng.rangeInt(1, 3);
      for (let d = 0; d < dotCount; d++) {
        const idx = Math.floor(prng.range(0.15, 0.85) * transformed.length);
        const dotPt = transformed[idx];
        scene.addDot(dotPt.x, dotPt.y, prng.range(2.5, 4.0), {
          filled: prng.boolean(0.8),
          role: 'nodes'
        });
      }

      // Arrowhead on arc tip
      if (annotations || prng.boolean(0.4)) {
        const tip = transformed[transformed.length - 1];
        const prev = transformed[transformed.length - 2];
        const arrAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
        scene.addArrow(tip.x, tip.y, arrAngle, 7.5, { filled: false, role: 'arrows' });
      }
    }

    // Tiny nucleus dot or left out (no glossy ball)
    if (prng.boolean(0.5)) {
      const c = transformPt(canvasCenter);
      scene.addDot(c.x, c.y, 2.2, { filled: true, role: 'nodes' });
    }

  } else {
    // === Field Orbit Profile (Default) ===
    // All ellipses share ONE common focus (like Keplerian comets)
    // No central nucleus drawn; focus can be offset by focus control

    const focusOffset = 120 * (1 - focus * 0.5);
    const sharedFocus = {
      x: canvasCenter.x - focusOffset * 0.5,
      y: canvasCenter.y + focusOffset * 0.3
    };

    for (let i = 0; i < orbitCount; i++) {
      const a = (0.35 + (i / orbitCount) * 0.65) * maxSemiMajor;
      const eccentricity = prng.range(0.4, 0.88);
      const b = a * Math.sqrt(1 - eccentricity * eccentricity);
      const cDist = a * eccentricity; // Linear eccentricity (distance from center to focus)

      const orbitRot = prng.range(0, Math.PI * 2);

      // The center of this ellipse is placed so that one focus is at sharedFocus
      const ellipseCenter = {
        x: sharedFocus.x - cDist * Math.cos(orbitRot),
        y: sharedFocus.y - cDist * Math.sin(orbitRot)
      };

      const isClosed = prng.boolean(0.5);
      const startAngle = isClosed ? 0 : prng.range(0, Math.PI * 0.5);
      const endAngle = isClosed ? Math.PI * 2 : startAngle + prng.range(Math.PI * 1.2, Math.PI * 1.95);

      const raw = sampleEllipse(ellipseCenter.x, ellipseCenter.y, a, b, orbitRot, startAngle, endAngle, 80);
      const transformed = raw.map(transformPt);
      const isAccent = (i === accentOrbitIndex);

      scene.addPath(transformed, {
        role: isAccent ? 'accent' : 'structure',
        isClosed,
        allowOvershoot: !isClosed,
        isAccent,
        seed: prng.rangeInt(0, 1000000)
      });

      // Dots riding the path
      const dotsOnOrbit = prng.rangeInt(1, 4);
      for (let d = 0; d < dotsOnOrbit; d++) {
        const sampleIdx = Math.floor(prng.range(0.1, 0.9) * transformed.length);
        const p = transformed[sampleIdx];
        scene.addDot(p.x, p.y, prng.range(2.2, 3.8), { filled: prng.boolean(0.7), role: 'nodes' });
      }

      // Arrowhead on some orbits
      if (transformed.length >= 3 && (annotations || prng.boolean(0.4))) {
        const tipIdx = isClosed ? Math.floor(transformed.length * 0.75) : transformed.length - 1;
        const tip = transformed[tipIdx];
        const prev = transformed[tipIdx - 1];
        const arrAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
        scene.addArrow(tip.x, tip.y, arrAngle, 7.5, { filled: false, role: 'arrows' });
      }
    }

    // Hollow marker circles scattered around
    const markerCount = prng.rangeInt(2, 6);
    for (let m = 0; m < markerCount; m++) {
      const dist = prng.range(60, maxSemiMajor * 0.9);
      const ang = prng.range(0, Math.PI * 2);
      const mPt = transformPt({
        x: sharedFocus.x + dist * Math.cos(ang),
        y: sharedFocus.y + dist * Math.sin(ang)
      });
      scene.addDot(mPt.x, mPt.y, prng.range(3, 5), { filled: false, role: 'nodes' });
    }

    // Shared focus marker
    const tf = transformPt(sharedFocus);
    scene.addDot(tf.x, tf.y, 3, { filled: true, role: 'nodes' });
  }

  // Guide axes or tangent rays
  if (annotations) {
    const p1 = transformPt({ x: canvasCenter.x - maxSemiMajor * 1.05, y: canvasCenter.y });
    const p2 = transformPt({ x: canvasCenter.x + maxSemiMajor * 1.05, y: canvasCenter.y });
    scene.addPath([p1, p2], { role: 'guides', allowOvershoot: false });
  }

  scene.enforceAtomHint(prng);
  return scene;
}
