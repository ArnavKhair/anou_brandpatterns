/**
 * Analytic Finish Pipeline (Phase 1)
 *
 * Two-phase architecture:
 * 1. runStylePass(scene, controls): 60fps-safe style + eager Schneider cubic Bézier fitting (ε=0.15px)
 * 2. runKnockoutPass(scene, controls): 20x20 spatial-hash geometric bridge solver (±6px gaps)
 *    with local polyline flattening & t-parameter back-mapping, plus selective circle/ellipse->arc promotion.
 */

import {
  createPRNG,
  createNoise,
  Vec2,
  resamplePolyline,
  fitCubicBeziers,
  flattenBezierSegments,
  subSegmentCubic,
  sampleArc,
  sampleEllipse,
  catmullRomToBeziers
} from './math.js';

const EPS = 1e-3;
const GRID_CELLS = 20;
const CELL_SIZE = 50; // 20 * 50 = 1000px viewport
const KNOCKOUT_GAP_HALF = 6; // ±6px arc-length gap

export function runFinishPipeline(scene, finishControls = {}, options = {}) {
  if (options.skipKnockout) {
    return runStylePass(scene, finishControls);
  }
  return runKnockoutPass(scene, finishControls);
}

export function runStylePass(scene, finishControls = {}) {
  const {
    roughness = 0,
    lineBreaks = 0,
    strokeWeight = 1.4,
    weightVariation = 0,
    overshoot = 0
  } = finishControls;

  const outputPaths = [];
  const outputDots = scene.dots.map(d => ({ ...d }));
  const outputArrows = scene.arrows.map(a => ({ ...a }));
  const outputStars = scene.stars.map(s => ({ ...s }));

  const guideWidth = Math.max(0.5, strokeWeight * 0.5);
  const outputTicks = (scene.ticks || []).map(t => ({
    ...t,
    strokeWidth: guideWidth,
    opacity: 0.45
  }));

  const isClean = roughness <= 0.01 && lineBreaks <= 0.01;
  const seenSignatures = new Set();

  for (const el of scene.paths) {
    const { tierWidth, tierOpacity, dashArray } = resolveTierStyle(el, strokeWeight);

    // Analytic primitives (circle, ellipse, arc) stay exact when clean
    if (el.kind === 'circle' || el.kind === 'ellipse' || el.kind === 'arc') {
      if (isClean && weightVariation <= 0.05) {
        if (el.taper && el.kind === 'arc') {
          emitTaperedArc(el, tierWidth, tierOpacity, outputPaths, outputDots);
          continue;
        }
        outputPaths.push({
          ...el,
          strokeWidth: tierWidth,
          opacity: tierOpacity,
          dashArray
        });
        continue;
      }

      // If roughness/lineBreaks/weightVariation is active, sample to polyline
      const pts = el.kind === 'circle'
        ? sampleArc(el.cx, el.cy, el.r, 0, Math.PI * 2, 72)
        : el.kind === 'ellipse'
          ? sampleEllipse(el.cx, el.cy, el.rx, el.ry, el.rotation || 0, 0, Math.PI * 2, 72)
          : sampleEllipse(el.cx, el.cy, el.rx, el.ry, el.rotation || 0, el.startAngle, el.endAngle, 48);

      processPolylineElement(
        { ...el, kind: 'polyline', points: pts },
        finishControls,
        tierWidth,
        tierOpacity,
        dashArray,
        outputPaths,
        outputDots
      );
      continue;
    }

    // Polyline / non-analytic curves
    const rawPts = cleanZeroLengthPoints(el.points);
    if (rawPts.length < 2) continue;

    const sig = buildPathSignature(rawPts);
    if (sig && seenSignatures.has(sig)) continue;
    if (sig) seenSignatures.add(sig);

    processPolylineElement(
      { ...el, points: rawPts },
      finishControls,
      tierWidth,
      tierOpacity,
      dashArray,
      outputPaths,
      outputDots
    );
  }

  return {
    paths: outputPaths,
    dots: outputDots,
    arrows: outputArrows,
    stars: outputStars,
    ticks: outputTicks
  };
}

function processPolylineElement(el, finishControls, tierWidth, tierOpacity, dashArray, outputPaths, outputDots) {
  const {
    roughness = 0,
    lineBreaks = 0,
    weightVariation = 0,
    overshoot = 0
  } = finishControls;

  const prng = createPRNG(el.seed || 12345);
  const noise = createNoise((el.seed || 12345) ^ 0xabcdef);

  let pts = el.points.slice();
  if (overshoot > 0.01 && el.allowOvershoot && !el.isClosed) {
    pts = applyOvershoot(pts, overshoot, prng);
  }

  // Exact polygonal/straight geometry when clean
  if (el.isPolygonal && roughness <= 0.01) {
    let subPolys = [pts];
    if (lineBreaks > 0.01 && el.allowBreak) {
      subPolys = subPolys.flatMap(sp => applyLineBreaks(sp, lineBreaks, prng));
    }
    for (const sp of subPolys) {
      const cleaned = cleanZeroLengthPoints(sp);
      if (cleaned.length < 2) continue;
      outputPaths.push({
        kind: 'polyline',
        points: cleaned,
        isClosed: el.isClosed && subPolys.length === 1,
        isPolygonal: true,
        role: el.role,
        visibility: el.visibility,
        zPriority: el.zPriority,
        allowKnockout: el.allowKnockout,
        respectHalos: el.respectHalos,
        strokeWidth: tierWidth,
        opacity: tierOpacity,
        dashArray
      });
    }
    return;
  }

  // Clean curved path -> Eager Schneider cubic Bézier fitting (ε = 0.15px)
  if (roughness <= 0.01 && lineBreaks <= 0.01 && weightVariation <= 0.05) {
    const segments = fitCubicBeziers(pts, 0.15, el.isClosed);
    if (segments.length === 0) return;

    if (el.taper) {
      emitTaperedBeziers(segments, el, tierWidth, tierOpacity, outputPaths, outputDots);
      return;
    }

    outputPaths.push({
      kind: 'beziers',
      segments,
      isClosed: el.isClosed,
      role: el.role,
      visibility: el.visibility,
      zPriority: el.zPriority,
      allowKnockout: el.allowKnockout,
      respectHalos: el.respectHalos,
      strokeWidth: tierWidth,
      opacity: tierOpacity,
      dashArray
    });
    return;
  }

  // Roughness / LineBreaks / WeightVariation path (user-adjusted only)
  const step = Math.max(6, Math.min(18, totalPolylineLength(pts) / 120));
  let resampled = resamplePolyline(pts, step);
  if (resampled.length < 2) return;

  let subPaths = [resampled];
  if (lineBreaks > 0.01 && el.allowBreak) {
    subPaths = subPaths.flatMap(sp => applyLineBreaks(sp, lineBreaks, prng));
  }

  for (const sub of subPaths) {
    const cleaned = cleanZeroLengthPoints(sub);
    if (cleaned.length < 2) continue;
    const displaced = applyRoughnessSinglePass(cleaned, roughness, noise, prng);
    const isContinuousClosed = el.isClosed && subPaths.length === 1;

    if (weightVariation <= 0.05) {
      let d = catmullRomToBeziers(displaced);
      if (isContinuousClosed && !d.endsWith('Z')) d += ' Z';
      outputPaths.push({
        kind: 'raw_d',
        d,
        role: el.role,
        visibility: el.visibility,
        zPriority: el.zPriority,
        allowKnockout: el.allowKnockout,
        strokeWidth: tierWidth,
        opacity: tierOpacity,
        dashArray
      });
    } else {
      emitChunkedWeightVariation(displaced, el, tierWidth, weightVariation, dashArray, isContinuousClosed, outputPaths, tierOpacity);
    }
  }
}

function emitTaperedArc(el, tierWidth, tierOpacity, outputPaths, outputDots) {
  const { startSolidRatio = 0.65, endDotSpacing = 6, terminalNodeRadius = 4.5 } = el.taper;
  const totalDelta = el.endAngle - el.startAngle;
  const splitAngle = el.startAngle + totalDelta * startSolidRatio;

  // 1. Solid head
  outputPaths.push({
    ...el,
    kind: 'arc',
    endAngle: splitAngle,
    strokeWidth: tierWidth,
    opacity: tierOpacity,
    dashArray: null
  });

  // 2. Dotted tail offset by endDotSpacing (6px) past the split point
  const avgR = (el.rx + el.ry) * 0.5;
  const offsetAngle = (totalDelta >= 0 ? 1 : -1) * Math.min(Math.abs(totalDelta) * 0.15, endDotSpacing / Math.max(10, avgR));
  const tailStart = splitAngle + offsetAngle;
  if ((totalDelta >= 0 && tailStart < el.endAngle) || (totalDelta < 0 && tailStart > el.endAngle)) {
    outputPaths.push({
      ...el,
      kind: 'arc',
      startAngle: tailStart,
      strokeWidth: Math.max(0.8, tierWidth * 0.9),
      opacity: tierOpacity,
      dashArray: `0.1 ${endDotSpacing}`
    });
  }

  // 3. Bold terminal node at endAngle
  const cosR = Math.cos(el.rotation || 0);
  const sinR = Math.sin(el.rotation || 0);
  const ex = el.rx * Math.cos(el.endAngle);
  const ey = el.ry * Math.sin(el.endAngle);
  outputDots.push({
    x: el.cx + ex * cosR - ey * sinR,
    y: el.cy + ex * sinR + ey * cosR,
    r: terminalNodeRadius,
    filled: true,
    role: 'node',
    isGlow: false
  });
}

function emitTaperedBeziers(segments, el, tierWidth, tierOpacity, outputPaths, outputDots) {
  const { startSolidRatio = 0.65, endDotSpacing = 6, terminalNodeRadius = 4.5 } = el.taper;
  const flat = flattenBezierSegments(segments, 3.5);
  const cum = [0];
  for (let i = 1; i < flat.length; i++) {
    cum.push(cum[i - 1] + Vec2.dist(flat[i - 1], flat[i]));
  }
  const totalLen = cum[cum.length - 1];
  const splitLen = totalLen * startSolidRatio;
  const tailStartLen = Math.min(totalLen, splitLen + endDotSpacing);

  const headSegs = sliceBeziersByArcLength(segments, flat, cum, 0, splitLen);
  if (headSegs.length > 0) {
    outputPaths.push({
      kind: 'beziers',
      segments: headSegs,
      isClosed: false,
      role: el.role,
      visibility: el.visibility,
      zPriority: el.zPriority,
      allowKnockout: el.allowKnockout,
      strokeWidth: tierWidth,
      opacity: tierOpacity,
      dashArray: null
    });
  }

  const tailSegs = sliceBeziersByArcLength(segments, flat, cum, tailStartLen, totalLen);
  if (tailSegs.length > 0) {
    outputPaths.push({
      kind: 'beziers',
      segments: tailSegs,
      isClosed: false,
      role: el.role,
      visibility: el.visibility,
      zPriority: el.zPriority,
      allowKnockout: el.allowKnockout,
      strokeWidth: Math.max(0.8, tierWidth * 0.9),
      opacity: tierOpacity,
      dashArray: `0.1 ${endDotSpacing}`
    });
  }

  const lastPt = segments[segments.length - 1].p3;
  outputDots.push({
    x: lastPt.x,
    y: lastPt.y,
    r: terminalNodeRadius,
    filled: true,
    role: 'node',
    isGlow: false
  });
}

// ============================================================================
// Phase 2: 20x20 Spatial-Hash Geometric Bridge Solver
// ============================================================================

export function runKnockoutPass(baseScene, finishControls = {}) {
  const scene = baseScene.cloneForKnockout();
  const styled = runStylePass(scene, finishControls);

  const halos = (scene.exclusionHalos || []).slice();

  // Separate foreground (zPriority >= 7) vs background (zPriority < 7)
  const fgElements = styled.paths.filter(p => (p.zPriority ?? 0) >= 7);
  if (fgElements.length === 0 && halos.length === 0) {
    return styled;
  }

  // Build 20x20 spatial hash of foreground flattened segments
  const grid = new Map();
  const fgPolys = [];

  for (let fgIdx = 0; fgIdx < fgElements.length; fgIdx++) {
    const fg = fgElements[fgIdx];
    const pts = flattenStyledElement(fg, 3.5);
    if (pts.length < 2) continue;
    fgPolys.push(pts);

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const seg = { a, b, fgIdx };
      const minCx = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.min(a.x, b.x) / CELL_SIZE)));
      const maxCx = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.max(a.x, b.x) / CELL_SIZE)));
      const minCy = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.min(a.y, b.y) / CELL_SIZE)));
      const maxCy = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.max(a.y, b.y) / CELL_SIZE)));
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const key = cy * GRID_CELLS + cx;
          let bucket = grid.get(key);
          if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
          }
          bucket.push(seg);
        }
      }
    }
  }

  const finalPaths = [];

  for (const el of styled.paths) {
    const isBg = (el.zPriority ?? 0) < 7 && el.allowKnockout !== false;
    const needsHalos = halos.length > 0 && el.respectHalos;

    if (!isBg && !needsHalos) {
      finalPaths.push(el);
      continue;
    }

    if (el.kind === 'raw_d') {
      finalPaths.push(el);
      continue;
    }

    const flat = flattenStyledElement(el, 3.5);
    if (flat.length < 2) {
      finalPaths.push(el);
      continue;
    }

    const cum = [0];
    for (let i = 1; i < flat.length; i++) {
      cum.push(cum[i - 1] + Vec2.dist(flat[i - 1], flat[i]));
    }
    const totalLen = cum[cum.length - 1];
    if (totalLen < 2) {
      finalPaths.push(el);
      continue;
    }

    const gapIntervals = [];

    if (isBg && grid.size > 0) {
      for (let i = 0; i < flat.length - 1; i++) {
        const a = flat[i];
        const b = flat[i + 1];
        const minCx = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.min(a.x, b.x) / CELL_SIZE)));
        const maxCx = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.max(a.x, b.x) / CELL_SIZE)));
        const minCy = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.min(a.y, b.y) / CELL_SIZE)));
        const maxCy = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor(Math.max(a.y, b.y) / CELL_SIZE)));

        const checked = new Set();
        for (let cx = minCx; cx <= maxCx; cx++) {
          for (let cy = minCy; cy <= maxCy; cy++) {
            const bucket = grid.get(cy * GRID_CELLS + cx);
            if (!bucket) continue;
            for (const fgSeg of bucket) {
              if (checked.has(fgSeg)) continue;
              checked.add(fgSeg);
              const hitT = segmentIntersectionT(a, b, fgSeg.a, fgSeg.b);
              if (hitT !== null) {
                const hitLen = cum[i] + hitT * (cum[i + 1] - cum[i]);
                gapIntervals.push({
                  start: hitLen - KNOCKOUT_GAP_HALF,
                  end: hitLen + KNOCKOUT_GAP_HALF
                });
              }
            }
          }
        }
      }
    }

    if (needsHalos) {
      for (const halo of halos) {
        for (let i = 0; i < flat.length - 1; i++) {
          const mid = Vec2.lerp(flat[i], flat[i + 1], 0.5);
          if (Vec2.dist(mid, halo) < halo.r) {
            gapIntervals.push({ start: cum[i], end: cum[i + 1] });
          }
        }
      }
    }

    if (gapIntervals.length === 0) {
      finalPaths.push(el);
      continue;
    }

    const keepIntervals = invertIntervals(gapIntervals, totalLen, el.isClosed);
    if (keepIntervals.length === 0) continue;

    // Selective promotion: intersected circle/ellipse -> elliptical arc <path> (A)
    if (el.kind === 'circle' || el.kind === 'ellipse' || el.kind === 'arc') {
      const rx = el.kind === 'circle' ? el.r : el.rx;
      const ry = el.kind === 'circle' ? el.r : el.ry;
      const startAng = el.kind === 'arc' ? el.startAngle : 0;
      const endAng = el.kind === 'arc' ? el.endAngle : Math.PI * 2;
      const span = endAng - startAng;

      for (const iv of keepIntervals) {
        const a0 = startAng + (iv.start / totalLen) * span;
        const a1 = startAng + (iv.end / totalLen) * span;
        if (Math.abs(a1 - a0) < 0.015) continue;
        finalPaths.push({
          ...el,
          kind: 'arc',
          cx: el.cx,
          cy: el.cy,
          rx,
          ry,
          rotation: el.rotation || 0,
          startAngle: a0,
          endAngle: a1,
          isClosed: false
        });
      }
    } else if (el.kind === 'beziers') {
      for (const iv of keepIntervals) {
        const subSegs = sliceBeziersByArcLength(el.segments, flat, cum, iv.start, iv.end);
        if (subSegs.length === 0) continue;
        finalPaths.push({
          ...el,
          kind: 'beziers',
          segments: subSegs,
          isClosed: false
        });
      }
    } else if (el.kind === 'polyline') {
      for (const iv of keepIntervals) {
        const subPts = slicePolylineByArcLength(flat, cum, iv.start, iv.end);
        if (subPts.length < 2) continue;
        finalPaths.push({
          ...el,
          kind: 'polyline',
          points: subPts,
          isClosed: false
        });
      }
    }
  }

  return {
    ...styled,
    paths: finalPaths
  };
}

function flattenStyledElement(el, chordTol = 3.5) {
  if (el.kind === 'circle') {
    const steps = Math.max(32, Math.min(96, Math.ceil((2 * Math.PI * el.r) / chordTol)));
    return sampleArc(el.cx, el.cy, el.r, 0, Math.PI * 2, steps);
  }
  if (el.kind === 'ellipse') {
    const steps = Math.max(32, Math.min(96, Math.ceil((2 * Math.PI * Math.max(el.rx, el.ry)) / chordTol)));
    return sampleEllipse(el.cx, el.cy, el.rx, el.ry, el.rotation || 0, 0, Math.PI * 2, steps);
  }
  if (el.kind === 'arc') {
    const arcLen = Math.abs(el.endAngle - el.startAngle) * Math.max(el.rx, el.ry);
    const steps = Math.max(12, Math.min(96, Math.ceil(arcLen / chordTol)));
    return sampleEllipse(el.cx, el.cy, el.rx, el.ry, el.rotation || 0, el.startAngle, el.endAngle, steps);
  }
  if (el.kind === 'beziers') {
    return flattenBezierSegments(el.segments, chordTol);
  }
  if (el.kind === 'polyline') {
    const pts = el.points.slice();
    if (el.isClosed && pts.length > 1 && Vec2.dist(pts[0], pts[pts.length - 1]) > 1e-3) {
      pts.push({ x: pts[0].x, y: pts[0].y });
    }
    return pts;
  }
  return [];
}

function segmentIntersectionT(p1, p2, q1, q2) {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = q2.x - q1.x;
  const dy2 = q2.y - q1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-9) return null;
  const qpx = q1.x - p1.x;
  const qpy = q1.y - p1.y;
  const t = (qpx * dy2 - qpy * dx2) / denom;
  const u = (qpx * dy1 - qpy * dx1) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

function invertIntervals(gaps, totalLen, isClosed) {
  const clamped = [];
  for (const g of gaps) {
    if (isClosed) {
      if (g.start < 0) {
        clamped.push({ start: 0, end: Math.min(totalLen, g.end) });
        clamped.push({ start: Math.max(0, totalLen + g.start), end: totalLen });
      } else if (g.end > totalLen) {
        clamped.push({ start: Math.max(0, g.start), end: totalLen });
        clamped.push({ start: 0, end: Math.min(totalLen, g.end - totalLen) });
      } else {
        clamped.push({ start: g.start, end: g.end });
      }
    } else {
      const s = Math.max(0, g.start);
      const e = Math.min(totalLen, g.end);
      if (e > s) clamped.push({ start: s, end: e });
    }
  }

  if (clamped.length === 0) return [{ start: 0, end: totalLen }];
  clamped.sort((a, b) => a.start - b.start);

  const merged = [clamped[0]];
  for (let i = 1; i < clamped.length; i++) {
    const last = merged[merged.length - 1];
    if (clamped[i].start <= last.end + 0.5) {
      last.end = Math.max(last.end, clamped[i].end);
    } else {
      merged.push({ ...clamped[i] });
    }
  }

  const keeps = [];
  let cursor = 0;
  for (const g of merged) {
    if (g.start - cursor > 1.5) {
      keeps.push({ start: cursor, end: g.start });
    }
    cursor = Math.max(cursor, g.end);
  }
  if (totalLen - cursor > 1.5) {
    keeps.push({ start: cursor, end: totalLen });
  }
  return keeps;
}

function locateParamOnFlat(flat, cum, targetLen) {
  if (targetLen <= 0) return { segIdx: flat[0].segIdx ?? 0, t: flat[0].t ?? 0 };
  const lastIdx = flat.length - 1;
  if (targetLen >= cum[lastIdx]) {
    return { segIdx: flat[lastIdx].segIdx ?? 0, t: flat[lastIdx].t ?? 1 };
  }
  for (let i = 0; i < lastIdx; i++) {
    if (targetLen >= cum[i] && targetLen <= cum[i + 1]) {
      const span = cum[i + 1] - cum[i];
      const frac = span < 1e-9 ? 0 : (targetLen - cum[i]) / span;
      const sA = flat[i].segIdx ?? 0;
      const sB = flat[i + 1].segIdx ?? sA;
      const tA = flat[i].t ?? 0;
      const tB = flat[i + 1].t ?? 1;
      if (sA === sB) {
        return { segIdx: sA, t: tA + frac * (tB - tA) };
      }
      return { segIdx: sB, t: frac * tB };
    }
  }
  return { segIdx: 0, t: 0 };
}

function sliceBeziersByArcLength(segments, flat, cum, startLen, endLen) {
  if (endLen <= startLen + 0.5) return [];
  const pStart = locateParamOnFlat(flat, cum, startLen);
  const pEnd = locateParamOnFlat(flat, cum, endLen);
  const out = [];

  for (let s = pStart.segIdx; s <= pEnd.segIdx && s < segments.length; s++) {
    const t0 = s === pStart.segIdx ? pStart.t : 0;
    const t1 = s === pEnd.segIdx ? pEnd.t : 1;
    if (t1 - t0 > 1e-4) {
      out.push(subSegmentCubic(segments[s], t0, t1));
    }
  }
  return out;
}

function slicePolylineByArcLength(flat, cum, startLen, endLen) {
  const pts = [];
  for (let i = 0; i < flat.length - 1; i++) {
    const d0 = cum[i];
    const d1 = cum[i + 1];
    if (d1 < startLen || d0 > endLen) continue;
    const span = Math.max(1e-9, d1 - d0);
    if (d0 <= startLen && startLen <= d1) {
      pts.push(Vec2.lerp(flat[i], flat[i + 1], (startLen - d0) / span));
    } else if (d0 >= startLen && d0 <= endLen) {
      pts.push({ x: flat[i].x, y: flat[i].y });
    }
    if (d0 <= endLen && endLen <= d1) {
      pts.push(Vec2.lerp(flat[i], flat[i + 1], (endLen - d0) / span));
    }
  }
  return pts;
}

// ============================================================================
// Tier Styling & Auxiliary Helpers
// ============================================================================

function resolveTierStyle(el, baseWeight) {
  const role = el.role || 'primary';
  const isBack = el.visibility === 'back';

  if (isBack) {
    return {
      tierWidth: el.strokeWidthOverride ?? Math.max(0.6, baseWeight * 0.6),
      tierOpacity: el.opacity ?? 0.55,
      dashArray: '2 5'
    };
  }
  if (role === 'guide' || role === 'annotation') {
    return {
      tierWidth: el.strokeWidthOverride ?? Math.max(0.5, baseWeight * 0.5),
      tierOpacity: el.opacity ?? 0.42,
      dashArray: null
    };
  }
  if (role === 'secondary') {
    return {
      tierWidth: el.strokeWidthOverride ?? Math.max(0.55, baseWeight * 0.65),
      tierOpacity: el.opacity ?? 0.85,
      dashArray: null
    };
  }
  if (role === 'accent' || el.isAccent) {
    return {
      tierWidth: el.strokeWidthOverride ?? Math.min(4.5, baseWeight * 1.85),
      tierOpacity: el.opacity ?? 1.0,
      dashArray: null
    };
  }
  return {
    tierWidth: el.strokeWidthOverride ?? baseWeight,
    tierOpacity: el.opacity ?? 1.0,
    dashArray: null
  };
}

function cleanZeroLengthPoints(points) {
  if (!points || points.length === 0) return [];
  const res = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (Vec2.dist(res[res.length - 1], points[i]) > EPS) {
      res.push(points[i]);
    }
  }
  return res;
}

function totalPolylineLength(points) {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) len += Vec2.dist(points[i], points[i + 1]);
  return len;
}

function buildPathSignature(points) {
  if (points.length < 2) return '';
  const p0 = points[0];
  const pm = points[Math.floor(points.length / 2)];
  const p1 = points[points.length - 1];
  const r = (n) => Math.round(n * 1000);
  const fwd = `${r(p0.x)},${r(p0.y)}|${r(pm.x)},${r(pm.y)}|${r(p1.x)},${r(p1.y)}|${points.length}`;
  const rev = `${r(p1.x)},${r(p1.y)}|${r(pm.x)},${r(pm.y)}|${r(p0.x)},${r(p0.y)}|${points.length}`;
  return fwd < rev ? fwd : rev;
}

function applyOvershoot(points, overshootAmount, prng) {
  const n = points.length;
  if (n < 2) return points;
  const totalLen = totalPolylineLength(points);
  const extLen = totalLen * 0.06 * overshootAmount;
  if (extLen < 1) return points;

  const res = points.slice();
  const vStart = Vec2.normalize(Vec2.sub(points[0], points[1]));
  res.unshift(Vec2.add(points[0], Vec2.scale(vStart, extLen * prng.range(0.7, 1.2))));
  const vEnd = Vec2.normalize(Vec2.sub(points[n - 1], points[n - 2]));
  res.push(Vec2.add(points[n - 1], Vec2.scale(vEnd, extLen * prng.range(0.7, 1.2))));
  return res;
}

function applyLineBreaks(points, breakAmount, prng) {
  const n = points.length;
  if (n < 6) return [points];
  const cumLen = [0];
  for (let i = 0; i < n - 1; i++) cumLen.push(cumLen[i] + Vec2.dist(points[i], points[i + 1]));
  const totalLen = cumLen[n - 1];
  if (totalLen < 60) return [points];

  const maxGaps = Math.max(1, Math.round((totalLen / 1000) * 6 * breakAmount));
  const numGaps = prng.rangeInt(1, maxGaps);
  const intervals = [];
  for (let g = 0; g < numGaps; g++) {
    const center = prng.range(totalLen * 0.12, totalLen * 0.88);
    const gapLen = prng.range(6, 40) * breakAmount;
    intervals.push({ start: center - gapLen / 2, end: center + gapLen / 2 });
  }
  intervals.sort((a, b) => a.start - b.start);

  const subPaths = [];
  let currentSub = [];
  let ivIdx = 0;
  for (let i = 0; i < points.length; i++) {
    const d = cumLen[i];
    const inGap = (ivIdx < intervals.length && d >= intervals[ivIdx].start && d <= intervals[ivIdx].end);
    if (inGap) {
      if (currentSub.length >= 2) subPaths.push(currentSub);
      currentSub = [];
    } else {
      currentSub.push(points[i]);
      if (ivIdx < intervals.length && d > intervals[ivIdx].end) ivIdx++;
    }
  }
  if (currentSub.length >= 2) subPaths.push(currentSub);
  return subPaths.length > 0 ? subPaths : [points];
}

function applyRoughnessSinglePass(points, roughness, noise, prng) {
  if (roughness <= 0.01) return points;
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const tx = i === 0 ? points[1].x - p.x : i === n - 1 ? p.x - points[n - 2].x : points[i + 1].x - points[i - 1].x;
    const ty = i === 0 ? points[1].y - p.y : i === n - 1 ? p.y - points[n - 2].y : points[i + 1].y - points[i - 1].y;
    const len = Math.hypot(tx, ty);
    const nx = len === 0 ? 0 : -ty / len;
    const ny = len === 0 ? 0 : tx / len;
    const smoothDisp = noise.noise1D(i * 0.08) * 3.5 * roughness;
    const jitter = roughness > 0.6 ? prng.range(-1.2, 1.2) * ((roughness - 0.6) / 0.4) : 0;
    const disp = smoothDisp + jitter;
    out.push({ x: p.x + nx * disp, y: p.y + ny * disp });
  }
  return out;
}

function emitChunkedWeightVariation(points, el, baseWidth, weightVariation, dashArray, isContinuousClosed, outputPaths, opacity) {
  const chunkCount = Math.min(points.length - 1, Math.round(4 + weightVariation * 6));
  const ptsPerChunk = Math.max(2, Math.floor(points.length / chunkCount));
  for (let c = 0; c < chunkCount; c++) {
    const startIdx = c * ptsPerChunk;
    const endIdx = c === chunkCount - 1 ? points.length : Math.min(points.length, (c + 1) * ptsPerChunk + 1);
    const chunkPts = points.slice(startIdx, endIdx);
    if (chunkPts.length < 2) continue;
    const t = (c + 0.5) / chunkCount;
    const taper = isContinuousClosed ? Math.cos(t * Math.PI * 2) * 0.35 : Math.sin(t * Math.PI) * 0.55 - 0.15;
    const chunkWidth = Math.max(0.45, baseWidth * (1 + taper * weightVariation));
    outputPaths.push({
      kind: 'raw_d',
      d: catmullRomToBeziers(chunkPts),
      role: el.role,
      visibility: el.visibility,
      zPriority: el.zPriority,
      allowKnockout: el.allowKnockout,
      strokeWidth: chunkWidth,
      opacity,
      dashArray
    });
  }
}
