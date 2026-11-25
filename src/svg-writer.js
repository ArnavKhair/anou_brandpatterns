/**
 * SVG Writer for Figma Compatibility
 *
 * Rules:
 * - Square 1000 by 1000 viewBox with no background
 * - Everything is black stroke (#000000) with fill="none", round caps & joins
 * - Dots are filled circles (fill="#000000" stroke="none")
 * - Six named groups: structure, accent, nodes, arrows, hidden, guides
 */

export function writeSVG(rendered, options = {}) {
  const {
    strokeColor = '#000000',
    fillColor = '#000000'
  } = options;

  // Buckets for the six named groups
  const groups = {
    structure: [],
    accent: [],
    nodes: [],
    arrows: [],
    hidden: [],
    guides: []
  };

  // 1. Group Paths
  for (const p of rendered.paths) {
    const role = groups[p.role] ? p.role : 'structure';
    const width = p.strokeWidth.toFixed(2);
    const opacityAttr = p.opacity < 1 ? ` opacity="${p.opacity.toFixed(2)}"` : '';
    const dashAttr = p.isDashed ? ' stroke-dasharray="3,6"' : '';

    groups[role].push(
      `<path d="${p.d}" stroke="${strokeColor}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr} />`
    );
  }

  // 2. Group Dots & Glows
  for (const dot of rendered.dots) {
    const role = groups[dot.role] ? dot.role : 'nodes';
    const x = dot.x.toFixed(2);
    const y = dot.y.toFixed(2);
    const r = dot.r.toFixed(2);

    if (dot.isGlow) {
      // Glow dot: central solid dot plus faint concentric ring
      groups[role].push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${fillColor}" stroke="none" />`
      );
      groups[role].push(
        `<circle cx="${x}" cy="${y}" r="${(dot.r * 1.8).toFixed(2)}" fill="none" stroke="${strokeColor}" stroke-width="0.8" opacity="0.6" />`
      );
    } else if (dot.filled) {
      groups[role].push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${fillColor}" stroke="none" />`
      );
    } else {
      // Hollow ring
      groups[role].push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="1.2" />`
      );
    }
  }

  // 3. Group Star Nodes
  for (const star of (rendered.stars || [])) {
    const role = groups[star.role] ? star.role : 'nodes';
    const x = star.x;
    const y = star.y;
    const s = star.size;
    // 4-pointed cross star
    const dStar = `M ${(x - s).toFixed(2)} ${y.toFixed(2)} L ${(x + s).toFixed(2)} ${y.toFixed(2)} M ${x.toFixed(2)} ${(y - s).toFixed(2)} L ${x.toFixed(2)} ${(y + s).toFixed(2)}`;
    groups[role].push(
      `<path d="${dStar}" stroke="${strokeColor}" stroke-width="1.2" stroke-linecap="round" fill="none" />`
    );
  }

  // 4. Group Arrowheads
  for (const arr of rendered.arrows) {
    const role = groups[arr.role] ? arr.role : 'arrows';
    const x = arr.x;
    const y = arr.y;
    const ang = arr.angle;
    const sz = arr.size;

    // Arrow geometry: point at tip (x, y), two wings swept back by 150 deg (5/6 pi)
    const wing1Ang = ang + Math.PI * 0.82;
    const wing2Ang = ang - Math.PI * 0.82;
    const w1x = (x + sz * Math.cos(wing1Ang)).toFixed(2);
    const w1y = (y + sz * Math.sin(wing1Ang)).toFixed(2);
    const w2x = (x + sz * Math.cos(wing2Ang)).toFixed(2);
    const w2y = (y + sz * Math.sin(wing2Ang)).toFixed(2);
    const tx = x.toFixed(2);
    const ty = y.toFixed(2);

    if (arr.filled) {
      groups[role].push(
        `<polygon points="${tx},${ty} ${w1x},${w1y} ${w2x},${w2y}" fill="${fillColor}" stroke="none" />`
      );
    } else {
      groups[role].push(
        `<polyline points="${w1x},${w1y} ${tx},${ty} ${w2x},${w2y}" stroke="${strokeColor}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
      );
    }
  }

  // 5. Group Ticks & Guides
  for (const tick of (rendered.ticks || [])) {
    const role = groups[tick.role] ? tick.role : 'guides';
    groups[role].push(
      `<line x1="${tick.p1.x.toFixed(2)}" y1="${tick.p1.y.toFixed(2)}" x2="${tick.p2.x.toFixed(2)}" y2="${tick.p2.y.toFixed(2)}" stroke="${strokeColor}" stroke-width="1.0" stroke-linecap="round" />`
    );
  }

  // Build SVG document
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n`;

  const groupOrder = ['guides', 'hidden', 'structure', 'accent', 'nodes', 'arrows'];
  for (const gName of groupOrder) {
    const elements = groups[gName];
    svg += `  <g id="${gName}" data-name="${gName}">\n`;
    for (const el of elements) {
      svg += `    ${el}\n`;
    }
    svg += `  </g>\n`;
  }

  svg += `</svg>`;
  return svg;
}
