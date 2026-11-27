/**
 * Analytic SVG Writer for Figma Compatibility (Phase 1)
 *
 * - Native <circle>, <ellipse>, elliptical arc <path d="M ... A ...">, and cubic Bézier <path>
 * - 6 semantic <g> groups wrapped inside <g id="atom-pattern"> (empty groups omitted)
 * - Coordinates rounded to 2 decimal places (toFixed(2))
 * - Optional vector-effect="non-scaling-stroke"
 * - Embedded <metadata data-atom-state='...'> for drag-and-drop re-import
 */

export function writeSVG(rendered, options = {}) {
  const {
    strokeColor = '#000000',
    fillColor = '#000000',
    nonScalingStroke = false,
    stateMetadata = null
  } = options;

  const veAttr = nonScalingStroke ? ' vector-effect="non-scaling-stroke"' : '';

  const groups = {
    'secondary-detail': [],
    'back-faces-dotted': [],
    'primary-structure': [],
    'accent': [],
    'nodes-and-markers': [],
    'annotations': []
  };

  function resolveGroup(role, visibility) {
    if (visibility === 'back') return 'back-faces-dotted';
    if (role === 'accent') return 'accent';
    if (role === 'secondary' || role === 'guide') return 'secondary-detail';
    if (role === 'node') return 'nodes-and-markers';
    if (role === 'annotation') return 'annotations';
    return 'primary-structure';
  }

  // 1. Serialize Paths & Analytic Primitives
  for (const p of rendered.paths) {
    const groupName = resolveGroup(p.role, p.visibility);
    const width = (p.strokeWidth ?? 1.4).toFixed(2);
    const opacityAttr = p.opacity !== undefined && p.opacity < 0.999 ? ` opacity="${p.opacity.toFixed(2)}"` : '';
    const dashAttr = p.dashArray ? ` stroke-dasharray="${p.dashArray}"` : '';
    const commonStroke = `stroke="${strokeColor}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr}${veAttr}`;

    if (p.kind === 'circle') {
      groups[groupName].push(
        `<circle cx="${p.cx.toFixed(2)}" cy="${p.cy.toFixed(2)}" r="${p.r.toFixed(2)}" ${commonStroke} />`
      );
    } else if (p.kind === 'ellipse') {
      const rotDeg = ((p.rotation || 0) * 180) / Math.PI;
      const rotAttr = Math.abs(rotDeg) > 0.01
        ? ` transform="rotate(${rotDeg.toFixed(2)} ${p.cx.toFixed(2)} ${p.cy.toFixed(2)})"`
        : '';
      groups[groupName].push(
        `<ellipse cx="${p.cx.toFixed(2)}" cy="${p.cy.toFixed(2)}" rx="${p.rx.toFixed(2)}" ry="${p.ry.toFixed(2)}"${rotAttr} ${commonStroke} />`
      );
    } else if (p.kind === 'arc') {
      const d = buildEllipticalArcPath(p);
      if (d) {
        groups[groupName].push(`<path d="${d}" ${commonStroke} />`);
      }
    } else if (p.kind === 'beziers') {
      const d = buildBezierPath(p.segments, p.isClosed);
      if (d) {
        groups[groupName].push(`<path d="${d}" ${commonStroke} />`);
      }
    } else if (p.kind === 'polyline') {
      const d = buildPolylinePath(p.points, p.isClosed);
      if (d) {
        groups[groupName].push(`<path d="${d}" ${commonStroke} />`);
      }
    } else if (p.kind === 'raw_d' && p.d) {
      groups[groupName].push(`<path d="${p.d}" ${commonStroke} />`);
    }
  }

  // 2. Serialize Dots & Glows
  for (const dot of rendered.dots) {
    const groupName = resolveGroup(dot.role || 'node', 'full');
    const x = dot.x.toFixed(2);
    const y = dot.y.toFixed(2);
    const r = dot.r.toFixed(2);

    if (dot.isGlow) {
      groups[groupName].push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fillColor}" stroke="none" />`);
      groups[groupName].push(
        `<circle cx="${x}" cy="${y}" r="${(dot.r * 1.8).toFixed(2)}" fill="none" stroke="${strokeColor}" stroke-width="0.80" opacity="0.60"${veAttr} />`
      );
    } else if (dot.filled) {
      groups[groupName].push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fillColor}" stroke="none" />`);
    } else {
      groups[groupName].push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="1.20"${veAttr} />`
      );
    }
  }

  // 3. Serialize Star Nodes
  for (const star of (rendered.stars || [])) {
    const groupName = resolveGroup(star.role || 'node', 'full');
    const x = star.x;
    const y = star.y;
    const s = star.size;
    const dStar = [
      `M ${x.toFixed(2)} ${(y - s).toFixed(2)}`,
      `Q ${x.toFixed(2)} ${y.toFixed(2)} ${(x + s).toFixed(2)} ${y.toFixed(2)}`,
      `Q ${x.toFixed(2)} ${y.toFixed(2)} ${x.toFixed(2)} ${(y + s).toFixed(2)}`,
      `Q ${x.toFixed(2)} ${y.toFixed(2)} ${(x - s).toFixed(2)} ${y.toFixed(2)}`,
      `Q ${x.toFixed(2)} ${y.toFixed(2)} ${x.toFixed(2)} ${(y - s).toFixed(2)} Z`
    ].join(' ');
    groups[groupName].push(`<path d="${dStar}" fill="${fillColor}" stroke="none" />`);
  }

  // 4. Serialize Arrowheads (minimal open chevrons or filled)
  for (const arr of rendered.arrows) {
    const groupName = resolveGroup(arr.role || 'node', 'full');
    const x = arr.x;
    const y = arr.y;
    const ang = arr.angle;
    const sz = arr.size;

    const wing1Ang = ang + Math.PI * 0.82;
    const wing2Ang = ang - Math.PI * 0.82;
    const w1x = (x + sz * Math.cos(wing1Ang)).toFixed(2);
    const w1y = (y + sz * Math.sin(wing1Ang)).toFixed(2);
    const w2x = (x + sz * Math.cos(wing2Ang)).toFixed(2);
    const w2y = (y + sz * Math.sin(wing2Ang)).toFixed(2);
    const tx = x.toFixed(2);
    const ty = y.toFixed(2);

    if (arr.filled) {
      groups[groupName].push(
        `<polygon points="${tx},${ty} ${w1x},${w1y} ${w2x},${w2y}" fill="${fillColor}" stroke="none" />`
      );
    } else {
      groups[groupName].push(
        `<polyline points="${w1x},${w1y} ${tx},${ty} ${w2x},${w2y}" stroke="${strokeColor}" stroke-width="1.40" fill="none" stroke-linecap="round" stroke-linejoin="round"${veAttr} />`
      );
    }
  }

  // 5. Serialize Ticks
  for (const tick of (rendered.ticks || [])) {
    const groupName = resolveGroup(tick.role || 'annotation', 'full');
    const tWidth = (tick.strokeWidth ?? 0.7).toFixed(2);
    const tOpacity = tick.opacity !== undefined && tick.opacity < 0.999 ? ` opacity="${tick.opacity.toFixed(2)}"` : '';
    groups[groupName].push(
      `<line x1="${tick.p1.x.toFixed(2)}" y1="${tick.p1.y.toFixed(2)}" x2="${tick.p2.x.toFixed(2)}" y2="${tick.p2.y.toFixed(2)}" stroke="${strokeColor}" stroke-width="${tWidth}" stroke-linecap="round"${tOpacity}${veAttr} />`
    );
  }

  // Assemble SVG document
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n`;

  if (stateMetadata) {
    const jsonAttr = escapeAttr(JSON.stringify(stateMetadata));
    svg += `  <metadata data-atom-state='${jsonAttr}' />\n`;
  }

  svg += `  <g id="atom-pattern" data-name="atom-pattern">\n`;
  const groupOrder = [
    'secondary-detail',
    'back-faces-dotted',
    'primary-structure',
    'accent',
    'nodes-and-markers',
    'annotations'
  ];

  for (const gName of groupOrder) {
    const elements = groups[gName];
    if (!elements || elements.length === 0) continue;
    svg += `    <g id="${gName}" data-name="${gName}">\n`;
    for (const el of elements) {
      svg += `      ${el}\n`;
    }
    svg += `    </g>\n`;
  }

  svg += `  </g>\n</svg>`;
  return svg;
}

function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildEllipticalArcPath(arc) {
  const { cx, cy, rx, ry, rotation = 0, startAngle, endAngle } = arc;
  const delta = endAngle - startAngle;
  if (Math.abs(delta) < 1e-4) return '';

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const rotDeg = (rotation * 180) / Math.PI;

  const ptAt = (theta) => {
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    return {
      x: cx + ex * cosR - ey * sinR,
      y: cy + ex * sinR + ey * cosR
    };
  };

  // Split arcs >= 2π - ε into two 180° arcs so SVG A command never collapses
  if (Math.abs(delta) >= Math.PI * 2 - 1e-3) {
    const mid = startAngle + Math.PI;
    const p0 = ptAt(startAngle);
    const pMid = ptAt(mid);
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${rx.toFixed(2)} ${ry.toFixed(2)} ${rotDeg.toFixed(2)} 0 ${sweep} ${pMid.x.toFixed(2)} ${pMid.y.toFixed(2)} A ${rx.toFixed(2)} ${ry.toFixed(2)} ${rotDeg.toFixed(2)} 0 ${sweep} ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} Z`;
  }

  const p0 = ptAt(startAngle);
  const p1 = ptAt(endAngle);
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;

  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${rx.toFixed(2)} ${ry.toFixed(2)} ${rotDeg.toFixed(2)} ${largeArc} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

function buildBezierPath(segments, isClosed) {
  if (!segments || segments.length === 0) return '';
  let d = `M ${segments[0].p0.x.toFixed(2)} ${segments[0].p0.y.toFixed(2)}`;
  for (const s of segments) {
    d += ` C ${s.cp1.x.toFixed(2)} ${s.cp1.y.toFixed(2)}, ${s.cp2.x.toFixed(2)} ${s.cp2.y.toFixed(2)}, ${s.p3.x.toFixed(2)} ${s.p3.y.toFixed(2)}`;
  }
  if (isClosed) d += ' Z';
  return d;
}

function buildPolylinePath(points, isClosed) {
  if (!points || points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  if (isClosed) d += ' Z';
  return d;
}
