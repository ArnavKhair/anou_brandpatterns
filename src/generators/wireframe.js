/**
 * Generator 6: Wireframe
 * Sphere, ellipsoid, or torus as 3 to 18 latitude, longitude, or great-circle rings,
 * rotated in 3D and projected flat. Ring parts on far side (z < 0) are dotted/hidden.
 * Tilt and annotation rule:
 * - Tilt ON + Annotation OFF: removes far side entirely.
 * - Tilt ON + Annotation ON: shows far side dotted (role: 'hidden').
 * - Tilt OFF: 2D front view with both front/back or flat projection.
 */

import { Scene } from '../scene.js';
import { Matrix3D, Vec2 } from '../math.js';

export function generateWireframe(prng, controls) {
  const scene = new Scene();
  scene.hasLatticeNodes = true;

  const { complexity = 0.5, symmetry = 0.5, focus = 0.5, depthTilt = false, annotations = false } = controls;
  const canvasCenter = { x: 500, y: 500, z: 0 };

  const form = prng.choice(['sphere', 'ellipsoid', 'torus']);
  const ringCount = Math.round(3 + complexity * 15); // 3 to 18 rings
  const baseRadius = 360 * (0.55 + 0.45 * complexity);

  // Rotation angles
  let pitch = 0, yaw = 0, roll = 0;
  if (depthTilt) {
    // 20 to 70 degrees
    pitch = prng.range(0.35, 1.22); // ~20 to 70 deg
    yaw = prng.range(0.35, 1.22);
    roll = prng.range(-0.35, 0.35);
  } else {
    // Minimal or zero rotation
    pitch = 0.1;
    yaw = 0.1;
    roll = 0;
  }

  const rotMatrix = Matrix3D.createRotation(pitch, yaw, roll);

  // Form-specific ring generation
  const all3DRings = [];

  if (form === 'sphere' || form === 'ellipsoid') {
    const rx = baseRadius;
    const ry = (form === 'ellipsoid') ? baseRadius * prng.range(0.65, 1.35) : baseRadius;
    const rz = baseRadius;

    // Latitude circles (parallel rings along Y)
    const latCount = Math.max(2, Math.round(ringCount / 2));
    for (let i = 1; i <= latCount; i++) {
      const v = (i / (latCount + 1)) * Math.PI - Math.PI / 2; // -pi/2 to pi/2
      const ringRy = ry * Math.sin(v);
      const ringR = Math.cos(v);
      const ringRx = rx * ringR;
      const ringRz = rz * ringR;

      const ringPts = [];
      const steps = 72;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        ringPts.push({
          x: canvasCenter.x + ringRx * Math.cos(theta),
          y: canvasCenter.y + ringRy,
          z: canvasCenter.z + ringRz * Math.sin(theta)
        });
      }
      all3DRings.push({ points: ringPts, isAccent: (i === 1 && prng.boolean(0.5)) });
    }

    // Longitude circles (meridians)
    const lonCount = Math.max(2, Math.round(ringCount / 2));
    for (let j = 0; j < lonCount; j++) {
      const phi = (j / lonCount) * Math.PI;
      const ringPts = [];
      const steps = 72;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        // Meridian in X-Y plane rotated by phi around Y
        const mx = rx * Math.cos(theta);
        const my = ry * Math.sin(theta);
        const mz = 0;

        const x = mx * Math.cos(phi) - mz * Math.sin(phi);
        const z = mx * Math.sin(phi) + mz * Math.cos(phi);

        ringPts.push({
          x: canvasCenter.x + x,
          y: canvasCenter.y + my,
          z: canvasCenter.z + z
        });
      }
      all3DRings.push({ points: ringPts, isAccent: false });
    }
  } else {
    // Torus
    const R = baseRadius * 0.65; // Major radius
    const r = baseRadius * 0.32; // Minor tube radius
    const circles = ringCount;

    for (let c = 0; c < circles; c++) {
      const u = (c / circles) * Math.PI * 2;
      const ringPts = [];
      const steps = 60;
      for (let s = 0; s <= steps; s++) {
        const v = (s / steps) * Math.PI * 2;
        const x = (R + r * Math.cos(v)) * Math.cos(u);
        const y = r * Math.sin(v);
        const z = (R + r * Math.cos(v)) * Math.sin(u);

        ringPts.push({
          x: canvasCenter.x + x,
          y: canvasCenter.y + y,
          z: canvasCenter.z + z
        });
      }
      all3DRings.push({ points: ringPts, isAccent: (c === 0) });
    }
  }

  // Rotate and partition each ring into front (z >= 0) and back (z < 0)
  for (const ring of all3DRings) {
    const rotated = ring.points.map(pt => Matrix3D.transformPoint(pt, rotMatrix, canvasCenter));

    // Split into segments of same visibility (z >= 0 vs z < 0)
    let currentSegment = [];
    let currentIsFront = rotated[0].z >= 0;

    for (let i = 0; i < rotated.length; i++) {
      const pt = rotated[i];
      const isFront = pt.z >= 0;

      if (isFront === currentIsFront) {
        currentSegment.push(pt);
      } else {
        // Crossed hemisphere boundary: interpolate crossing point at z = 0
        const prev = rotated[i - 1];
        const t = (0 - prev.z) / (pt.z - prev.z);
        const crossPt = {
          x: prev.x + (pt.x - prev.x) * t,
          y: prev.y + (pt.y - prev.y) * t,
          z: 0
        };
        currentSegment.push(crossPt);

        // Emit current segment
        emitSegment(currentSegment, currentIsFront, ring.isAccent);

        // Start new segment with crossPt
        currentSegment = [crossPt, pt];
        currentIsFront = isFront;
      }
    }
    if (currentSegment.length >= 2) {
      emitSegment(currentSegment, currentIsFront, ring.isAccent);
    }
  }

  function emitSegment(points, isFront, isAccent) {
    if (points.length < 2) return;
    const projPoints = points.map(p => ({ x: p.x, y: p.y }));

    if (isFront) {
      scene.addPath(projPoints, {
        role: isAccent ? 'accent' : 'structure',
        isClosed: false,
        allowOvershoot: false,
        isAccent,
        seed: prng.rangeInt(0, 1000000)
      });
    } else {
      // Far side behavior:
      // If depthTilt ON + annotations OFF: remove far side entirely
      // If depthTilt ON + annotations ON: show as dotted (hidden role)
      if (depthTilt && !annotations) {
        // Discard far side
        return;
      }
      scene.addPath(projPoints, {
        role: 'hidden',
        isClosed: false,
        allowOvershoot: false,
        seed: prng.rangeInt(0, 1000000)
      });
    }
  }

  // Crossing points / nodes
  const nodeCount = Math.round(4 + complexity * 12);
  for (let n = 0; n < nodeCount; n++) {
    const angle = prng.range(0, Math.PI * 2);
    const r = baseRadius * prng.range(0.3, 0.9);
    const pt3D = {
      x: canvasCenter.x + r * Math.cos(angle),
      y: canvasCenter.y + r * Math.sin(angle),
      z: 0
    };
    const rot = Matrix3D.transformPoint(pt3D, rotMatrix, canvasCenter);
    if (rot.z >= -20) {
      scene.addDot(rot.x, rot.y, prng.range(2.2, 3.5), { filled: prng.boolean(0.75), role: 'nodes' });
    }
  }

  // Center axes with tick marks and rotation arrows
  if (annotations || prng.boolean(0.5)) {
    const axisLen = baseRadius * 1.15;
    const axisZ = [
      { x: canvasCenter.x, y: canvasCenter.y - axisLen, z: 0 },
      { x: canvasCenter.x, y: canvasCenter.y + axisLen, z: 0 }
    ].map(p => Matrix3D.transformPoint(p, rotMatrix, canvasCenter));

    scene.addPath([{ x: axisZ[0].x, y: axisZ[0].y }, { x: axisZ[1].x, y: axisZ[1].y }], {
      role: 'guides',
      allowOvershoot: false
    });

    // Ticks along central axis
    for (let t = -4; t <= 4; t++) {
      if (t === 0) continue;
      const frac = t / 5;
      const tY = canvasCenter.y + frac * baseRadius;
      const t1 = Matrix3D.transformPoint({ x: canvasCenter.x - 5, y: tY, z: 0 }, rotMatrix, canvasCenter);
      const t2 = Matrix3D.transformPoint({ x: canvasCenter.x + 5, y: tY, z: 0 }, rotMatrix, canvasCenter);
      scene.addTick(t1.x, t1.y, t2.x, t2.y, { role: 'guides' });
    }

    // Curved rotation arrow around north pole
    const polePt = axisZ[0];
    const arrowArc = [];
    const arcR = 30;
    for (let a = 0; a <= 20; a++) {
      const ang = (a / 20) * Math.PI * 1.4;
      arrowArc.push({
        x: polePt.x + arcR * Math.cos(ang),
        y: polePt.y + arcR * Math.sin(ang) * 0.4
      });
    }
    scene.addPath(arrowArc, { role: 'guides', allowOvershoot: false });
    const tip = arrowArc[arrowArc.length - 1];
    const prev = arrowArc[arrowArc.length - 2];
    const arrowAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    scene.addArrow(tip.x, tip.y, arrowAngle, 7, { filled: false, role: 'arrows' });
  }

  // Atom hint: Center cage nucleus
  scene.addDot(canvasCenter.x, canvasCenter.y, 4, { filled: true, role: 'nodes', isGlow: true });
  scene.hasNucleusOrCenterDot = true;

  scene.enforceAtomHint(prng);
  return scene;
}
