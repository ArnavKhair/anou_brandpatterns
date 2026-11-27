/**
 * Generator 4: Field Lines (Phase 1 Analytic)
 * Sub-modes:
 * - parallel_ribbon: 3D-projected parallel ribbon streamlines with sin^2 caustic density
 *   (N in [32, 64]) and NO Tier 1 wireframe bounding box or edge ticks.
 * - multipole_rk4: Asymmetric multi-pole streamlines via RK4 integration, clipped at pole halos.
 */

import { Scene } from '../scene.js';
import { applyPlaneTilt, Vec2 } from '../math.js';

export function normalizeFieldLinesSubMode(subMode) {
  if (subMode === 'parallel_ribbon') return 'parallel_ribbon';
  return 'multipole_rk4';
}

export function generateFieldLines(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.5,
    focus = 0.5,
    depthTilt = false,
    annotations = false,
    subMode
  } = controls;

  const mode = normalizeFieldLinesSubMode(subMode);
  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.62, 0.85);
  const shear = prng.range(-0.10, 0.10);
  const transformPt = (pt) => depthTilt ? applyPlaneTilt(pt, tiltAngle, squash, shear, { x: 0, y: 0 }) : pt;

  if (mode === 'parallel_ribbon') {
    // Optical caustic density: N in [32, 48], u_i = sin^2((pi * i) / (2 * N))
    // No Tier 1 background grid, bounding box, or edge ticks!
    const N = Math.round(32 + complexity * 16);
    const waveFreq = prng.range(0.75, 1.05);
    const waveAmp = prng.range(48, 88);
    const rotAngle = prng.range(-0.35, 0.35);
    const cosR = Math.cos(rotAngle), sinR = Math.sin(rotAngle);
    const spanX = 240;
    const spanY = 340;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const trackBound = (pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    };

    for (let i = 0; i < N; i++) {
      const u = Math.pow(Math.sin((Math.PI * i) / (2 * Math.max(1, N - 1))), 2);
      const yBase = (u - 0.5) * spanY;
      const frontPts = [];
      const backPts = [];
      const steps = 48;
      const isAccent = (i === Math.floor(N * 0.5));

      for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * 2 - 1;
        const lx = t * spanX;
        const phase = t * Math.PI * waveFreq + (u - 0.5) * 1.4;
        const ly = yBase + Math.sin(phase) * waveAmp * 0.45;
        const lz = Math.cos(phase);

        const pt = transformPt({ x: lx * cosR - ly * sinR, y: lx * sinR + ly * cosR });
        trackBound(pt);

        if (lz >= -0.05) {
          if (backPts.length >= 2) {
            scene.addPath(backPts.slice(), { role: 'primary', visibility: 'back', strokeWidthOverride: 0.65, zPriority: 1 });
            backPts.length = 0;
          }
          frontPts.push(pt);
        } else {
          if (frontPts.length >= 2) {
            scene.addPath(frontPts.slice(), {
              role: isAccent ? 'accent' : 'primary',
              visibility: 'front',
              strokeWidthOverride: isAccent ? null : 0.72,
              allowKnockout: false,
              zPriority: isAccent ? 8 : 5
            });
            frontPts.length = 0;
          }
          backPts.push(pt);
        }
      }

      if (frontPts.length >= 2) {
        scene.addPath(frontPts, {
          role: isAccent ? 'accent' : 'primary',
          visibility: 'front',
          strokeWidthOverride: isAccent ? null : 0.72,
          allowKnockout: false,
          zPriority: isAccent ? 8 : 5
        });
      }
      if (backPts.length >= 2) {
        scene.addPath(backPts, { role: 'primary', visibility: 'back', strokeWidthOverride: 0.65, zPriority: 1 });
      }
    }

    scene.setBounds({ minX, minY, maxX, maxY });
  } else {
    // multipole_rk4
    const numPoles = (symmetry < 0.7 || prng.boolean(0.5)) ? 3 : 2;
    const axisAngle = prng.range(0, Math.PI);
    const poleDist = 110 * (0.65 + 0.45 * (1 - focus));

    const poles = [];
    if (numPoles === 2) {
      const qRatio = symmetry < 0.75 ? prng.range(1.25, 1.8) : 1.0;
      poles.push({ x: -poleDist * 0.5 * Math.cos(axisAngle), y: -poleDist * 0.5 * Math.sin(axisAngle), q: qRatio });
      poles.push({ x: poleDist * 0.5 * Math.cos(axisAngle), y: poleDist * 0.5 * Math.sin(axisAngle), q: -1.0 });
    } else {
      for (let p = 0; p < 3; p++) {
        const ang = axisAngle + (p / 3) * Math.PI * 2 + (symmetry < 0.65 ? p * 0.25 : 0);
        const dist = poleDist * (p === 0 ? 0.85 : 1.05);
        poles.push({ x: dist * Math.cos(ang), y: dist * Math.sin(ang), q: p === 0 ? 1.5 : -0.9 });
      }
    }

    const crossFieldMag = symmetry < 0.75 ? prng.range(0.0002, 0.0006) : 0;
    const crossAng = axisAngle + Math.PI * 0.45;
    const crossX = crossFieldMag * Math.cos(crossAng);
    const crossY = crossFieldMag * Math.sin(crossAng);

    const fieldDir = (x, y) => {
      let fx = crossX, fy = crossY;
      for (const pole of poles) {
        const dx = x - pole.x, dy = y - pole.y;
        const r2 = dx * dx + dy * dy + 18;
        const r3 = r2 * Math.sqrt(r2);
        fx += (pole.q * dx) / r3;
        fy += (pole.q * dy) / r3;
      }
      const mag = Math.hypot(fx, fy);
      return mag < 1e-9 ? { x: 0, y: 0 } : { x: fx / mag, y: fy / mag };
    };

    const rk4Step = (pt, h) => {
      const k1 = fieldDir(pt.x, pt.y);
      const k2 = fieldDir(pt.x + 0.5 * h * k1.x, pt.y + 0.5 * h * k1.y);
      const k3 = fieldDir(pt.x + 0.5 * h * k2.x, pt.y + 0.5 * h * k2.y);
      const k4 = fieldDir(pt.x + h * k3.x, pt.y + h * k3.y);
      return {
        x: pt.x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
        y: pt.y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)
      };
    };

    for (const pole of poles) {
      const tp = transformPt(pole);
      scene.addExclusionHalo(tp.x, tp.y, 8);
    }

    const raysPerPole = Math.round(14 + complexity * 16);
    const stepSize = 6;
    const maxSteps = 80;
    const clipBound = 240;
    let accentAssigned = false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const pole of poles) {
      if (pole.q < 0) continue;
      for (let rIdx = 0; rIdx < raysPerPole; rIdx++) {
        // Non-linear caustic density spacing around positive pole
        const u = Math.pow(Math.sin((Math.PI * rIdx) / (2 * raysPerPole)), 2);
        const startAng = axisAngle + u * Math.PI * 2;
        let cur = { x: pole.x + 10 * Math.cos(startAng), y: pole.y + 10 * Math.sin(startAng) };
        const pts = [cur];

        for (let s = 0; s < maxSteps; s++) {
          cur = rk4Step(cur, stepSize);
          pts.push(cur);
          if (Math.abs(cur.x) > clipBound || Math.abs(cur.y) > clipBound) break;
          if (poles.some(p => p.q < 0 && Vec2.dist(cur, p) < 9)) break;
        }
        if (pts.length < 4) continue;

        const transformed = pts.map(transformPt);
        for (const tp of transformed) {
          minX = Math.min(minX, tp.x); minY = Math.min(minY, tp.y);
          maxX = Math.max(maxX, tp.x); maxY = Math.max(maxY, tp.y);
        }

        const isAccent = !accentAssigned && rIdx === Math.floor(raysPerPole * 0.25);
        if (isAccent) accentAssigned = true;

        scene.addPath(transformed, {
          role: isAccent ? 'accent' : 'primary',
          respectHalos: true,
          zPriority: isAccent ? 8 : 5
        });

        if (annotations && rIdx % 5 === 0 && transformed.length >= 10) {
          const mid = Math.floor(transformed.length * 0.5);
          const pA = transformed[mid - 1], pB = transformed[mid + 1];
          scene.addArrow(transformed[mid].x, transformed[mid].y, Math.atan2(pB.y - pA.y, pB.x - pA.x), 6.5, {
            filled: false,
            role: 'node'
          });
        }
      }
    }

    for (const pole of poles) {
      const tp = transformPt(pole);
      scene.addDot(tp.x, tp.y, pole.q > 0 ? 3.8 : 3.0, {
        filled: pole.q > 0,
        role: 'node',
        isGlow: pole.q > 0
      });
    }

    scene.setBounds({ minX, minY, maxX, maxY });
  }

  return scene;
}
