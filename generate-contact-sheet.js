/**
 * Generate Contact Sheet (v2 Review Material)
 * 6 distinct control presets for each of the 8 motif families (48 cards).
 */

import { createPRNG } from './src/math.js';
import { GENERATOR_FAMILIES, generateScene } from './src/generators/index.js';
import { runFinishPipeline } from './src/finish-pipeline.js';
import { writeSVG } from './src/svg-writer.js';
import fs from 'fs';

const PRESETS = [
  {
    label: 'Clean Minimal',
    seed: 101,
    controls: {
      complexity: 0.25, symmetry: 0.92, focus: 0.80,
      depthTilt: false, annotations: false,
      roughness: 0.0, lineBreaks: 0.0, strokeWeight: 2.0, weightVariation: 0.0, overshoot: 0.0,
      framingPreset: 'Centered Emblem'
    }
  },
  {
    label: 'High-Sym Architectural',
    seed: 202,
    controls: {
      complexity: 0.55, symmetry: 0.94, focus: 0.72,
      depthTilt: false, annotations: true,
      roughness: 0.02, lineBreaks: 0.0, strokeWeight: 1.3, weightVariation: 0.04, overshoot: 0.22,
      framingPreset: 'Centered Emblem'
    }
  },
  {
    label: 'Dense Optical',
    seed: 303,
    controls: {
      complexity: 0.86, symmetry: 0.82, focus: 0.75,
      depthTilt: false, annotations: false,
      roughness: 0.02, lineBreaks: 0.0, strokeWeight: 0.75, weightVariation: 0.28, overshoot: 0.0,
      framingPreset: 'Centered Emblem'
    }
  },
  {
    label: 'Asymmetric Cropped',
    seed: 404,
    controls: {
      complexity: 0.65, symmetry: 0.30, focus: 0.55,
      depthTilt: false, annotations: true,
      roughness: 0.04, lineBreaks: 0.04, strokeWeight: 1.5, weightVariation: 0.14, overshoot: 0.10,
      framingPreset: 'Macro Edge-Crop'
    }
  },
  {
    label: 'Tilted 3D Plate',
    seed: 505,
    controls: {
      complexity: 0.60, symmetry: 0.58, focus: 0.60,
      depthTilt: true, annotations: true,
      roughness: 0.12, lineBreaks: 0.08, strokeWeight: 1.4, weightVariation: 0.15, overshoot: 0.12,
      framingPreset: 'Off-Axis Focal'
    }
  },
  {
    label: 'Corner Bleed',
    seed: 606,
    controls: {
      complexity: 0.74, symmetry: 0.45, focus: 0.50,
      depthTilt: true, annotations: false,
      roughness: 0.03, lineBreaks: 0.0, strokeWeight: 1.7, weightVariation: 0.12, overshoot: 0.05,
      framingPreset: 'Corner Bleed'
    }
  }
];

let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Atom Pattern Generator - Contact Sheet (v2 Review)</title>
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
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>Atom Pattern Generator — v2 Contact Sheet</h1>
  <p class="sub">6 distinct control presets across all 8 procedural motif families (48 patterns).</p>
`;

for (const [famId, famObj] of Object.entries(GENERATOR_FAMILIES)) {
  html += `  <div class="family-block">
    <div class="family-title">
      <span>${famObj.name}</span>
      <span class="family-badge">${famObj.defaultRefs} library references</span>
    </div>
    <div class="grid">
`;

  for (const preset of PRESETS) {
    const prng = createPRNG(preset.seed + famId.length * 100);
    const scene = generateScene(famId, prng, preset.controls);
    const rendered = runFinishPipeline(scene, preset.controls);
    const svgStr = writeSVG(rendered, { strokeColor: '#E6EDF3', fillColor: '#E6EDF3' });
    const layers = scene.getActiveLayers().length;

    html += `      <div class="card">
        ${svgStr}
        <div class="seed-label">#${preset.seed} · ${preset.label} · ${layers}L</div>
      </div>\n`;
  }

  html += `    </div>
  </div>\n`;
}

html += `</body>
</html>`;

fs.writeFileSync('contact-sheet.html', html, 'utf8');
console.log('✓ Generated contact-sheet.html successfully!');
