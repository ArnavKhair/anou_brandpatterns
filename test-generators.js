/**
 * Test Suite for Atom Pattern Generator (Phase 1 Analytic Pipeline)
 */

import { createPRNG } from './src/math.js';
import { Scene } from './src/scene.js';
import { GENERATOR_FAMILIES, generateScene } from './src/generators/index.js';
import { runFinishPipeline } from './src/finish-pipeline.js';
import { writeSVG } from './src/svg-writer.js';
import { TasteProfileManager } from './src/taste-profile.js';

console.log('🧪 Starting Atom Pattern Generator Test Suite (Phase 1)...\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// Test 1: All 8 Generators x 10 Seeds
const families = Object.keys(GENERATOR_FAMILIES);
assert(families.length === 8, 'All 8 motif families are registered');

const cleanControls = {
  complexity: 0.5,
  symmetry: 0.7,
  focus: 0.6,
  depthTilt: false,
  annotations: false,
  roughness: 0,
  lineBreaks: 0,
  strokeWeight: 1.4,
  weightVariation: 0,
  overshoot: 0
};

let allValid = true;
let maxAnchorsSeen = 0;

for (const fam of families) {
  let famValid = true;
  for (let s = 1; s <= 10; s++) {
    const seed = 1000 + s * 37;
    const scene = generateScene(fam, createPRNG(seed), cleanControls);
    if (!scene || scene.paths.length === 0 || !scene.coreBounds) {
      famValid = false;
      allValid = false;
      break;
    }
    const rendered = runFinishPipeline(scene, cleanControls);
    const svg = writeSVG(rendered, {
      stateMetadata: { generator: fam, subMode: cleanControls.subMode, seed, params: cleanControls }
    });
    if (!svg.includes('<svg') || !svg.includes('<g id="atom-pattern"')) {
      famValid = false;
      allValid = false;
      break;
    }
    const dMatches = svg.match(/d="([^"]+)"/g) || [];
    const anchorCount = dMatches.reduce((sum, attr) => sum + ((attr.slice(3, -1).match(/[MLHVCSQTAZ]/gi)) || []).length, 0);
    if (anchorCount > maxAnchorsSeen) maxAnchorsSeen = anchorCount;
    if (anchorCount >= 400) {
      famValid = false;
      allValid = false;
      console.error(`Anchor cap exceeded (${anchorCount}) for ${fam} seed ${seed}`);
      break;
    }
  }
  assert(famValid, `Family [${fam}]: 10 seeds valid, semantic SVG & < 400 anchors`);
}
assert(allValid, `All 80 test runs valid (max anchors seen: ${maxAnchorsSeen})`);

// Test 2: Determinism & Semantic Layers
const seedX = 987654;
const svgA = writeSVG(runFinishPipeline(generateScene('orbit_systems', createPRNG(seedX), cleanControls), cleanControls));
const svgB = writeSVG(runFinishPipeline(generateScene('orbit_systems', createPRNG(seedX), cleanControls), cleanControls));
assert(svgA === svgB, 'Determinism: identical seed + controls produce identical SVG');

const fullScene = new Scene();
fullScene.addCircle(500, 500, 100, { role: 'primary' });
fullScene.addCircle(500, 500, 140, { role: 'accent' });
fullScene.addArc(500, 500, 120, 60, Math.PI, Math.PI * 2, 0, { role: 'primary', visibility: 'back' });
fullScene.addTick(0, 0, 5, 5, { role: 'annotation' });
fullScene.addStarNode(500, 500, 5, 4, { role: 'node' });
assert(fullScene.getActiveLayers().length === 5, 'Scene.getActiveLayers() returns 5 active layers for full scene');

// Test 3: Taste Profile clean defaults
const manager = new TasteProfileManager();
const next = manager.generateNext({}, {}, createPRNG(42));
assert(next.controls.roughness === 0 && next.controls.lineBreaks === 0 && next.controls.overshoot === 0,
  'TasteProfileManager defaults roughness, lineBreaks, overshoot to 0.0');

console.log(`\n${passedTests}/${totalTests} tests passed.`);
