/**
 * Generator 8: Logarithmic Spirals & Phyllotaxis (Phase 1 Analytic)
 * Sub-modes:
 * - logarithmic: r = a * e^(b * theta)
 * - phyllotaxis: Golden-angle dot & Fibonacci parastichy arc lattices
 * (Legacy golden_subdivision maps cleanly onto logarithmic; golden construction lives in tangent-chain.js)
 */

import { Scene } from '../scene.js';
import { sampleArc, applyPlaneTilt } from '../math.js';

export function normalizeSpiralSubMode(subMode) {
  if (subMode === 'phyllotaxis') return 'phyllotaxis';
  return 'logarithmic'; // Maps legacy 'golden_subdivision' here
}

export function generateSpiral(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.65,
    depthTilt = false,
    annotations = false,
    subMode
  } = controls;

  const mode = normalizeSpiralSubMode(subMode);
  const maxR = 230;
  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.62, 0.85);
  const shear = prng.range(-0.10, 0.10);
  const transformPt = (pt) => depthTilt ? applyPlaneTilt(pt, tiltAngle, squash, shear, { x: 0, y: 0 }) : pt;

  if (mode === 'logarithmic') {
    const arms = Math.round(3 + symmetry * 5); // 3 to 8 spiral arms
    const b = prng.range(0.16, 0.25);
    const a = 10;
    const maxTheta = Math.log(maxR / a) / b;
    const baseRot = prng.range(0, Math.PI * 2);

    if (annotations) {
      for (let r = 0; r < arms; r++) {
        const ang = baseRot + (r / arms) * Math.PI * 2;
        scene.addPath(
          [transformPt({ x: 0, y: 0 }), transformPt({ x: maxR * Math.cos(ang), y: maxR * Math.sin(ang) })],
          { role: 'annotation', isPolygonal: true, zPriority: 1 }
        );
      }
    }

    for (let arm = 0; arm < arms; arm++) {
      if (symmetry < 0.55 && arm % 3 === 1) continue;
      const armOffset = baseRot + (arm / arms) * Math.PI * 2;
      const pts = [];
      const steps = 96;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * maxTheta;
        const r = a * Math.exp(b * theta);
        pts.push(transformPt({
          x: r * Math.cos(theta + armOffset),
          y: r * Math.sin(theta + armOffset)
        }));
      }

      const isAccent = (arm === 0);
      scene.addPath(pts, {
        role: isAccent ? 'accent' : 'primary',
        zPriority: isAccent ? 8 : 5
      });

      const tip = pts[pts.length - 1];
      scene.addDot(tip.x, tip.y, 2.5, { filled: true, role: 'node' });
    }
  } else {
    // phyllotaxis: Golden-angle lattice & Fibonacci parastichy spirals
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const count = Math.round(55 + complexity * 100);
    const cScale = maxR / Math.sqrt(count);
    const pts = [];

    for (let n = 1; n <= count; n++) {
      const r = cScale * Math.sqrt(n);
      const theta = n * goldenAngle;
      const p = transformPt({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
      pts.push(p);
      if (n % 4 === 0) {
        scene.addDot(p.x, p.y, 1.6 + (n / count) * 1.6, { filled: n % 8 === 0, role: 'node' });
      }
    }

    const fibStep = 13;
    for (let start = 0; start < fibStep; start++) {
      const chain = [];
      for (let idx = start; idx < pts.length; idx += fibStep) {
        chain.push(pts[idx]);
      }
      if (chain.length >= 3) {
        const isAccent = (start === 0);
        scene.addPath(chain, {
          role: isAccent ? 'accent' : 'primary',
          zPriority: isAccent ? 8 : 5
        });
      }
    }

    if (annotations) {
      if (!depthTilt) {
        scene.addCircle(0, 0, maxR * 1.04, { role: 'annotation', zPriority: 1 });
      } else {
        scene.addPath(sampleArc(0, 0, maxR * 1.04, 0, Math.PI * 2, 72).map(transformPt), {
          role: 'annotation',
          isClosed: true,
          zPriority: 1
        });
      }
    }
  }

  scene.setBounds({ minX: -maxR, minY: -maxR, maxX: maxR, maxY: maxR });
  return scene;
}
