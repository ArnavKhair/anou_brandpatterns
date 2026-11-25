/**
 * Generate Contact Sheet (Phase 1 Review Material)
 * 6 seeds for each of the 7 motif families.
 */

import { createPRNG } from './src/math.js';
import { GENERATOR_FAMILIES, generateScene } from './src/generators/index.js';
import { runFinishPipeline } from './src/finish-pipeline.js';
import { writeSVG } from './src/svg-writer.js';
import fs from 'fs';

const controls = {
  complexity: 0.5,
  symmetry: 0.5,
  focus: 0.5,
  depthTilt: true,
  annotations: true,
  roughness: 0.15,
  lineBreaks: 0.05,
  strokeWeight: 1.4,
  weightVariation: 0.15,
  overshoot: 0.10
};

const seeds = [101, 202, 303, 404, 505, 606];

let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Atom Pattern Generator - Contact Sheet (Phase 1 Review)</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0B0E14;
      color: #E6EDF3;
      margin: 0;
      padding: 30px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    p.sub {
      color: #8B9BB4;
      font-size: 14px;
      margin-bottom: 30px;
    }
    .family-block {
      margin-bottom: 40px;
      background: #151B26;
      border: 1px solid #273142;
      border-radius: 10px;
      padding: 20px;
    }
    .family-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .family-badge {
      font-size: 11px;
      text-transform: uppercase;
      background: rgba(59, 130, 246, 0.2);
      color: #60A5FA;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 14px;
    }
    .card {
      background: #0D1117;
      border: 1px solid #30363D;
      border-radius: 8px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .card svg {
      width: 100%;
      height: auto;
      aspect-ratio: 1/1;
    }
    .seed-label {
      margin-top: 8px;
      font-size: 11px;
      color: #8B9BB4;
      font-family: ui-monospace, monospace;
    }
  </style>
</head>
<body>
  <h1>Atom Pattern Generator — Contact Sheet</h1>
  <p class="sub">Phase 1 review material: 6 distinct seeds across all 7 procedural motif families.</p>
`;

for (const [famId, famObj] of Object.entries(GENERATOR_FAMILIES)) {
  html += `  <div class="family-block">
    <div class="family-title">
      <span>${famObj.name}</span>
      <span class="family-badge">${famObj.defaultRefs} library references</span>
    </div>
    <div class="grid">
`;

  for (const s of seeds) {
    const prng = createPRNG(s + famId.length * 100);
    const scene = generateScene(famId, prng, controls);
    const rendered = runFinishPipeline(scene, controls);
    // Draw with light stroke for viewing on dark card
    const svgStr = writeSVG(rendered, { strokeColor: '#E6EDF3', fillColor: '#E6EDF3' });

    html += `      <div class="card">
        ${svgStr}
        <div class="seed-label">Seed #${s}</div>
      </div>\n`;
  }

  html += `    </div>
  </div>\n`;
}

html += `</body>
</html>`;

fs.writeFileSync('contact-sheet.html', html, 'utf8');
console.log('✓ Generated contact-sheet.html successfully!');
