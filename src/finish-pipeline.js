/**
 * Finish Pipeline
 * Restyles the existing Scene intermediate representation into rendered visual primitives.
 * Fixed chain of steps:
 * 1. Flatten
 * 2. Overshoot
 * 3. Line breaks
 * 4. Roughness (smooth noise + fine jitter + faint 2nd redraw pass)
 * 5. Weight variation (chunked paths with varying stroke-width)
 * 6. Emit smooth cubic bezier paths
 */

import { createPRNG, createNoise, Vec2, resamplePolyline, catmullRomToBeziers } from './math.js';

export function runFinishPipeline(scene, finishControls) {
  const {
    roughness = 0,         // 0 (clean) to 1 (rough)
    lineBreaks = 0,        // 0 to 1
    strokeWeight = 1.4,    // 0.6 to 6 px, default 1.4
    weightVariation = 0,   // 0 (uniform) to 1 (varied)
    overshoot = 0          // 0 to 1
  } = finishControls;

  const outputPaths = [];
  const outputDots = scene.dots.slice();
  const outputArrows = scene.arrows.slice();
  const outputStars = scene.stars.slice();
  const outputTicks = scene.ticks.slice();

  for (const pathObj of scene.paths) {
    const rawPts = pathObj.points;
    if (!rawPts || rawPts.length < 2) continue;

    const baseSeed = pathObj.seed || 12345;
    const prng = createPRNG(baseSeed);
    const noise = createNoise(baseSeed ^ 0xabcdef);

    // 1. Flatten: resample to uniform spacing (~6px)
    let pts = resamplePolyline(rawPts, 6);
    if (pts.length < 2) continue;

    // 2. Overshoot: extend open ends
    if (overshoot > 0.01 && pathObj.allowOvershoot && !pathObj.isClosed) {
      pts = applyOvershoot(pts, overshoot, prng);
    }

    // 3. Line breaks: cut gaps into paths
    let subPaths = [pts];
    if (lineBreaks > 0.01 && pathObj.allowBreak) {
      subPaths = applyLineBreaks(pts, lineBreaks, prng);
    }

    // Process each sub-path through Roughness and Weight Variation
    for (const sub of subPaths) {
      if (sub.length < 2) continue;

      // 4. Roughness
      const roughRes = applyRoughness(sub, roughness, noise, prng);

      // Base stroke width for this path
      const baseWidth = pathObj.isAccent ? strokeWeight * 2.2 : strokeWeight;

      // 5. Weight variation & emitting
      emitPathWithWeightVariation(
        roughRes.main,
        pathObj,
        baseWidth,
        weightVariation,
        prng,
        outputPaths
      );

      // Faint second pass (if roughness > 0.5)
      if (roughRes.secondPass) {
        emitPathWithWeightVariation(
          roughRes.secondPass,
          { ...pathObj, isAccent: false },
          baseWidth * 0.6,
          weightVariation * 0.5,
          prng,
          outputPaths,
          0.65 // opacity
        );
      }
    }
  }

  return {
    paths: outputPaths,
    dots: outputDots,
    arrows: outputArrows,
    stars: outputStars,
    ticks: outputTicks
  };
}

// Overshoot extension
function applyOvershoot(points, overshootAmount, prng) {
  const n = points.length;
  if (n < 2) return points;

  // Calculate approximate path length
  let totalLen = 0;
  for (let i = 0; i < n - 1; i++) totalLen += Vec2.dist(points[i], points[i + 1]);

  // Up to 6% of length
  const extLen = totalLen * 0.06 * overshootAmount;
  if (extLen < 1) return points;

  const res = points.slice();

  // Extend start
  const vStart = Vec2.normalize(Vec2.sub(points[0], points[1]));
  const startExt = Vec2.add(points[0], Vec2.scale(vStart, extLen * prng.range(0.7, 1.2)));
  res.unshift(startExt);

  // Extend end
  const vEnd = Vec2.normalize(Vec2.sub(points[n - 1], points[n - 2]));
  const endExt = Vec2.add(points[n - 1], Vec2.scale(vEnd, extLen * prng.range(0.7, 1.2)));
  res.push(endExt);

  return res;
}

// Line breaks
function applyLineBreaks(points, breakAmount, prng) {
  const n = points.length;
  if (n < 6) return [points];

  // Calculate cumulative lengths
  const cumLen = [0];
  for (let i = 0; i < n - 1; i++) {
    cumLen.push(cumLen[i] + Vec2.dist(points[i], points[i + 1]));
  }
  const totalLen = cumLen[n - 1];
  if (totalLen < 60) return [points];

  // Up to 6 gaps per 1000px
  const maxGaps = Math.max(1, Math.round((totalLen / 1000) * 6 * breakAmount));
  const numGaps = prng.rangeInt(1, maxGaps);

  // Pick gap intervals [startDist, endDist]
  const intervals = [];
  for (let g = 0; g < numGaps; g++) {
    const center = prng.range(totalLen * 0.12, totalLen * 0.88);
    const gapLen = prng.range(6, 40) * breakAmount;
    intervals.push({ start: center - gapLen / 2, end: center + gapLen / 2 });
  }

  // Sort and merge intervals
  intervals.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const iv of intervals) {
    if (merged.length === 0 || merged[merged.length - 1].end < iv.start) {
      merged.push(iv);
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
    }
  }

  // Partition polyline by intervals
  const subPaths = [];
  let currentSub = [];
  let ivIdx = 0;

  for (let i = 0; i < n; i++) {
    const d = cumLen[i];
    const inGap = (ivIdx < merged.length && d >= merged[ivIdx].start && d <= merged[ivIdx].end);

    if (inGap) {
      if (currentSub.length >= 2) {
        subPaths.push(currentSub);
      }
      currentSub = [];
    } else {
      currentSub.push(points[i]);
      if (ivIdx < merged.length && d > merged[ivIdx].end) {
        ivIdx++;
      }
    }
  }

  if (currentSub.length >= 2) {
    subPaths.push(currentSub);
  }

  return subPaths.length > 0 ? subPaths : [points];
}

// Roughness displacement & 2nd pass
function applyRoughness(points, roughness, noise, prng) {
  if (roughness <= 0.01) {
    return { main: points, secondPass: null };
  }

  const n = points.length;
  const mainPts = [];
  const secondPts = roughness > 0.5 ? [] : null;

  for (let i = 0; i < n; i++) {
    const p = points[i];

    // Compute tangent and normal
    let tx = 0, ty = 0;
    if (i === 0) {
      tx = points[1].x - p.x;
      ty = points[1].y - p.y;
    } else if (i === n - 1) {
      tx = p.x - points[n - 2].x;
      ty = p.y - points[n - 2].y;
    } else {
      tx = points[i + 1].x - points[i - 1].x;
      ty = points[i + 1].y - points[i - 1].y;
    }

    const len = Math.hypot(tx, ty);
    const nx = len === 0 ? 0 : -ty / len;
    const ny = len === 0 ? 0 : tx / len;

    // Smooth noise displacement up to 3.5px
    const smoothDisp = noise.noise1D(i * 0.08) * 3.5 * roughness;

    // Fine jitter above 0.6
    let jitter = 0;
    if (roughness > 0.6) {
      const jitterScale = (roughness - 0.6) / 0.4;
      jitter = prng.range(-1.2, 1.2) * jitterScale;
    }

    const disp = smoothDisp + jitter;
    mainPts.push({
      x: p.x + nx * disp,
      y: p.y + ny * disp
    });

    // Faint second pass (above 0.5, offset 1 to 3px)
    if (secondPts) {
      const offset = prng.range(1.0, 3.0) * (prng.boolean() ? 1 : -1);
      const secondNoise = noise.noise1D(i * 0.08 + 100) * 2.0;
      secondPts.push({
        x: p.x + nx * (offset + secondNoise),
        y: p.y + ny * (offset + secondNoise)
      });
    }
  }

  return { main: mainPts, secondPass: secondPts };
}

// Weight variation & Bezier emitting
function emitPathWithWeightVariation(points, pathMeta, baseWidth, weightVariation, prng, outputPaths, opacity = 1) {
  if (points.length < 2) return;

  // Downsample slightly for bezier fitting (< 3000 anchors target)
  const sampled = resamplePolyline(points, 12);
  if (sampled.length < 2) return;

  if (weightVariation <= 0.01) {
    // Single uniform stroke
    const d = catmullRomToBeziers(sampled);
    outputPaths.push({
      d,
      role: pathMeta.role,
      strokeWidth: baseWidth,
      opacity,
      isDashed: pathMeta.role === 'hidden'
    });
    return;
  }

  // Weight variation: cut into 8 to 24 chunks whose width swings up to 60% along a smooth curve
  const chunkCount = Math.min(sampled.length - 1, Math.round(8 + weightVariation * 16));
  const ptsPerChunk = Math.max(2, Math.floor(sampled.length / chunkCount));

  for (let c = 0; c < chunkCount; c++) {
    const startIdx = c * ptsPerChunk;
    const endIdx = (c === chunkCount - 1) ? sampled.length : Math.min(sampled.length, (c + 1) * ptsPerChunk + 1);
    const chunkPts = sampled.slice(startIdx, endIdx);
    if (chunkPts.length < 2) continue;

    // Swing up to 60%
    const t = c / chunkCount;
    const swing = Math.sin(t * Math.PI * 3) * 0.6 * weightVariation;
    const chunkWidth = Math.max(0.4, baseWidth * (1 + swing));

    const d = catmullRomToBeziers(chunkPts);
    outputPaths.push({
      d,
      role: pathMeta.role,
      strokeWidth: chunkWidth,
      opacity,
      isDashed: pathMeta.role === 'hidden'
    });
  }
}
