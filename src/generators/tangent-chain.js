/**
 * Generator 2: Tangent Chains & Golden Construction (Phase 1 Analytic)
 * Sub-modes:
 * - circle_packing: 6–9 clean circles of varying radii mutually tangent or secant
 *   inside an oversized outer circle (bleedBounds) that sweeps past the frame edge,
 *   with crisp nodes at exact tangency points and zero straight lines.
 * - golden_construction: Full-scale whirling square / golden-ratio construction
 *   scaled via coreBounds to fill ~75% of the canvas, clean diagonal rays extending
 *   to the enclosing arc/circle, zero random gaps, zero floating bullseye dots.
 */

import { Scene } from '../scene.js';
import { sampleArc, applyPlaneTilt, Vec2 } from '../math.js';

export function normalizeTangentSubMode(subMode) {
  if (subMode === 'golden_construction') return 'golden_construction';
  return 'circle_packing'; // Maps legacy 'hybrid' & 'tangent_circles' here
}

export function generateTangentChain(prng, controls = {}) {
  const scene = new Scene();
  const {
    complexity = 0.5,
    symmetry = 0.5,
    focus = 0.5,
    depthTilt = false,
    annotations = false,
    subMode
  } = controls;

  const mode = normalizeTangentSubMode(subMode);
  const tiltAngle = prng.range(0, Math.PI);
  const squash = prng.range(0.62, 0.86);
  const shear = prng.range(-0.10, 0.10);
  const transformPt = (pt) => depthTilt ? applyPlaneTilt(pt, tiltAngle, squash, shear, { x: 0, y: 0 }) : pt;

  const emitCircle = (cx, cy, r, opts = {}) => {
    if (r < 3) return;
    if (!depthTilt) {
      scene.addCircle(cx, cy, r, opts);
    } else {
      scene.addPath(sampleArc(cx, cy, r, 0, Math.PI * 2, 72).map(transformPt), { ...opts, isClosed: true });
    }
  };

  if (mode === 'circle_packing') {
    const chainCount = Math.round(6 + complexity * 3); // 6 to 9 circles
    const ratio = prng.range(0.68, 0.82);
    const turnAngle = prng.range(Math.PI * 0.36, Math.PI * 0.65);

    let r = 82;
    let c = { x: -45 * (1 - focus * 0.5), y: 20 };
    let ang = prng.range(0, Math.PI * 2);

    const circles = [{ x: c.x, y: c.y, r }];
    const touchPoints = [];

    for (let i = 1; i < chainCount; i++) {
      const nextR = r * ratio;
      if (nextR < 10) break;
      const stepTurn = (symmetry < 0.55 && i % 3 === 2) ? -turnAngle * 0.7 : turnAngle;
      ang += stepTurn;

      const dist = r + nextR;
      const nextC = { x: c.x + dist * Math.cos(ang), y: c.y + dist * Math.sin(ang) };
      touchPoints.push({ x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) });

      c = nextC;
      r = nextR;
      circles.push({ x: c.x, y: c.y, r });
    }

    // Compute coreBounds tightly around the 6–9 inner circles
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ci of circles) {
      minX = Math.min(minX, ci.x - ci.r);
      minY = Math.min(minY, ci.y - ci.r);
      maxX = Math.max(maxX, ci.x + ci.r);
      maxY = Math.max(maxY, ci.y + ci.r);
    }
    const coreCx = (minX + maxX) * 0.5;
    const coreCy = (minY + maxY) * 0.5;
    const coreSpan = Math.max(maxX - minX, maxY - minY);

    // Oversized outer circle (bleedBounds) sweeping past the frame edge
    const bleedR = coreSpan * 0.88;
    const bleedOffsetAng = prng.range(0, Math.PI * 2);
    const bleedCx = coreCx + bleedR * 0.25 * Math.cos(bleedOffsetAng);
    const bleedCy = coreCy + bleedR * 0.25 * Math.sin(bleedOffsetAng);
    emitCircle(bleedCx, bleedCy, bleedR, { role: 'secondary', strokeWidthOverride: 0.9, zPriority: 2 });

    for (let i = 0; i < circles.length; i++) {
      const ci = circles[i];
      const isAccent = (i === 1);
      emitCircle(ci.x, ci.y, ci.r, {
        role: isAccent ? 'accent' : 'primary',
        zPriority: isAccent ? 8 : 5
      });
    }

    // Crisp nodes at exact tangency points (zero straight lines)
    for (const tp of touchPoints) {
      const p = transformPt(tp);
      scene.addDot(p.x, p.y, 2.8, { filled: true, role: 'node' });
    }

    scene.setBounds(
      { minX, minY, maxX, maxY },
      {
        minX: Math.min(minX, bleedCx - bleedR),
        minY: Math.min(minY, bleedCy - bleedR),
        maxX: Math.max(maxX, bleedCx + bleedR),
        maxY: Math.max(maxY, bleedCy + bleedR)
      }
    );
  } else {
    // golden_construction: Full-scale whirling square / golden construction
    const depth = Math.round(7 + complexity * 7); // 7 to 14 nested frames
    const alpha = prng.range(0.10, 0.28);
    const scaleStep = 1 / (Math.cos(alpha) + Math.sin(alpha));
    const initialHalf = 220;
    const baseRot = prng.range(0, Math.PI * 0.5);

    const enclosingR = initialHalf * Math.SQRT2;
    emitCircle(0, 0, enclosingR, { role: 'secondary', strokeWidthOverride: 0.8, zPriority: 2 });

    // Clean diagonal construction rays extending to the enclosing circle
    for (let c = 0; c < 4; c++) {
      const ang = baseRot + Math.PI * 0.25 + c * Math.PI * 0.5;
      const p1 = transformPt({ x: 0, y: 0 });
      const p2 = transformPt({ x: enclosingR * Math.cos(ang), y: enclosingR * Math.sin(ang) });
      scene.addPath([p1, p2], { role: 'guide', isPolygonal: true, zPriority: 1 });
    }

    let currentHalf = initialHalf;
    let currentRot = baseRot;

    for (let i = 0; i < depth; i++) {
      if (currentHalf < 6) break;
      const corners = [
        { x: -currentHalf, y: -currentHalf },
        { x: currentHalf, y: -currentHalf },
        { x: currentHalf, y: currentHalf },
        { x: -currentHalf, y: currentHalf }
      ].map(p => transformPt(Vec2.rotate(p, currentRot)));

      scene.addPath(corners, {
        role: i % 2 === 1 ? 'guide' : 'primary',
        isClosed: true,
        isPolygonal: true,
        zPriority: i % 2 === 1 ? 2 : 5
      });

      // Inscribed quarter-circle arc inside the square corner
      const cornerIdx = i % 4;
      const pivotLocal = [
        { x: -currentHalf, y: -currentHalf },
        { x: currentHalf, y: -currentHalf },
        { x: currentHalf, y: currentHalf },
        { x: -currentHalf, y: currentHalf }
      ][cornerIdx];
      const pivot = Vec2.rotate(pivotLocal, currentRot);
      const arcStart = currentRot + cornerIdx * (Math.PI * 0.5);
      const isAccent = (i === 0);

      if (!depthTilt) {
        scene.addArc(pivot.x, pivot.y, currentHalf * 2, currentHalf * 2, arcStart, arcStart + Math.PI * 0.5, 0, {
          role: isAccent ? 'accent' : 'primary',
          zPriority: isAccent ? 8 : 6
        });
      } else {
        const arcPts = sampleArc(pivot.x, pivot.y, currentHalf * 2, arcStart, arcStart + Math.PI * 0.5, 32).map(transformPt);
        scene.addPath(arcPts, { role: isAccent ? 'accent' : 'primary', zPriority: isAccent ? 8 : 6 });
      }

      currentHalf *= scaleStep;
      currentRot += alpha;
    }

    scene.setBounds({ minX: -enclosingR, minY: -enclosingR, maxX: enclosingR, maxY: enclosingR });
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
