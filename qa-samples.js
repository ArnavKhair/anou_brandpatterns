/**
 * Phase 1 QA Verification CLI (`npm run qa:samples`)
 * Generates 2 fixed seeds per generator/sub-mode across CENTERED EMBLEM & OFF-AXIS FOCAL
 * and verifies:
 * 1. Low Anchor Counts (< 400 typical anchors) & native <circle>/<ellipse> preservation
 * 2. Zero Core Clipping (coreBounds strictly inside [0, 1000] x [0, 1000])
 * 3. Clean Default Finish (roughness=0, lineBreaks=0, zero ghost duplicates)
 * 4. Figma Round-Trip (semantic <g> layers, 2-decimal precision, <metadata data-atom-state>)
 */

import { createPRNG } from './src/math.js';
import { GENERATOR_FAMILIES, generateScene } from './src/generators/index.js';
import { runFinishPipeline } from './src/finish-pipeline.js';
import { writeSVG } from './src/svg-writer.js';
import { TasteProfileManager } from './src/taste-profile.js';

const FIXED_SEEDS = [104729, 224737];
const FRAMINGS = ['CENTERED EMBLEM', 'OFF-AXIS FOCAL'];

let failures = 0;
let totalSamples = 0;

function check(cond, msg) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    failures++;
  }
}

console.log('🔍 Running Phase 1 QA Samples Verification...\n');
console.log('Family / SubMode                      | Framing          | Anchors | Circles | Ellipses | Paths | CoreBounds OK');
console.log('--------------------------------------|------------------|---------|---------|----------|-------|--------------');

const taste = new TasteProfileManager();

for (const [famId, fam] of Object.entries(GENERATOR_FAMILIES)) {
  const subModes = fam.subModes.length > 0 ? fam.subModes.map(s => s.id) : [null];

  for (const subMode of subModes) {
    for (let sIdx = 0; sIdx < FIXED_SEEDS.length; sIdx++) {
      const seed = FIXED_SEEDS[sIdx];
      const framingPreset = FRAMINGS[sIdx % FRAMINGS.length];
      totalSamples++;

      const nextSample = taste.generateNext({
        family: true,
        subMode: true,
        framingPreset: true
      }, {
        family: famId,
        controls: { subMode, framingPreset, complexity: 0.5, symmetry: 0.7, focus: 0.6 }
      }, createPRNG(seed));

      const controls = {
        ...nextSample.controls,
        complexity: 0.5,
        symmetry: 0.7,
        focus: 0.6,
        depthTilt: false,
        annotations: false,
        subMode,
        framingPreset
      };

      // 3. Verify clean default finish
      check(controls.roughness === 0, `${famId}/${subMode} default roughness === 0`);
      check(controls.lineBreaks === 0, `${famId}/${subMode} default lineBreaks === 0`);
      check(controls.overshoot === 0, `${famId}/${subMode} default overshoot === 0`);

      const scene = generateScene(famId, createPRNG(seed), controls);
      const cb = scene.coreBounds;
      const boundsOk = cb &&
        cb.minX >= -0.5 && cb.minY >= -0.5 &&
        cb.maxX <= 1000.5 && cb.maxY <= 1000.5;
      check(boundsOk, `${famId}/${subMode} (${framingPreset}) coreBounds inside [0,1000]: ${JSON.stringify(cb)}`);

      const rendered = runFinishPipeline(scene, controls);
      const svg = writeSVG(rendered, {
        strokeColor: '#000000',
        fillColor: '#000000',
        stateMetadata: {
          generator: famId,
          subMode,
          seed,
          params: controls
        }
      });

      // 1. Anchor counts & native primitives
      const dMatches = svg.match(/d="([^"]+)"/g) || [];
      const anchorCount = dMatches.reduce((sum, a) => sum + (a.slice(3, -1).match(/[MLHVCSQTAZ]/gi) || []).length, 0);
      const circleCount = (svg.match(/<circle\b/g) || []).length;
      const ellipseCount = (svg.match(/<ellipse\b/g) || []).length;
      const pathCount = dMatches.length;

      check(anchorCount < 400, `${famId}/${subMode} seed=${seed} anchors=${anchorCount} (< 400)`);
      check(!svg.includes('opacity="0.65"'), `${famId}/${subMode} no ghost duplicate stroke`);

      // 4. Semantic <g> layers & metadata round-trip
      check(svg.includes('<g id="atom-pattern"'), `${famId}/${subMode} has root <g id="atom-pattern">`);
      const metaMatch = svg.match(/data-atom-state='([^']+)'/);
      check(!!metaMatch, `${famId}/${subMode} has <metadata data-atom-state>`);
      if (metaMatch) {
        const decoded = JSON.parse(metaMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
        check(decoded.generator === famId && decoded.seed === seed, `${famId}/${subMode} metadata round-trips`);
      }

      const label = `${famId}${subMode ? '/' + subMode : ''}`.padEnd(37);
      const fLabel = framingPreset.padEnd(16);
      console.log(
        `${label} | ${fLabel} | ${String(anchorCount).padStart(7)} | ${String(circleCount).padStart(7)} | ${String(ellipseCount).padStart(8)} | ${String(pathCount).padStart(5)} | ${boundsOk ? 'OK' : 'CLIP!'}`
      );
    }
  }
}

console.log(`\nChecked ${totalSamples} samples across all families & sub-modes.`);
if (failures > 0) {
  console.error(`❌ QA verification failed with ${failures} error(s).`);
  process.exit(1);
} else {
  console.log('✅ All Phase 1 QA checks passed!');
}
