/**
 * Test Suite for Atom Pattern Generator
 * Validates Phase 1, Phase 2, and Phase 3 specifications.
 */

import { createPRNG } from './src/math.js';
import { GENERATOR_FAMILIES, generateScene } from './src/generators/index.js';
import { runFinishPipeline } from './src/finish-pipeline.js';
import { writeSVG } from './src/svg-writer.js';
import { TasteProfileManager } from './src/taste-profile.js';

console.log('🧪 Starting Atom Pattern Generator Test Suite...\n');

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

// -------------------------------------------------------------
// Test 1: All 7 Generators with 20 Seeds Each (Phase 1 Acceptance)
// -------------------------------------------------------------
console.log('--- Test 1: Phase 1 Generator Robustness (20 seeds x 7 families = 140 runs) ---');

const families = Object.keys(GENERATOR_FAMILIES);
assert(families.length === 7, 'All 7 motif families are registered');

const testControls = {
  complexity: 0.5,
  symmetry: 0.5,
  focus: 0.5,
  depthTilt: false,
  annotations: true,
  roughness: 0.2,
  lineBreaks: 0.05,
  strokeWeight: 1.4,
  weightVariation: 0.15,
  overshoot: 0.10
};

let allGenerationsValid = true;
let totalAnchors = 0;

for (const fam of families) {
  let famValid = true;
  for (let s = 1; s <= 20; s++) {
    const seed = 1000 + s * 37;
    const prng = createPRNG(seed);
    const scene = generateScene(fam, prng, testControls);

    if (!scene || scene.paths.length === 0) {
      famValid = false;
      allGenerationsValid = false;
      console.error(`Empty scene for family ${fam} with seed ${seed}`);
      break;
    }

    const rendered = runFinishPipeline(scene, testControls);
    const svg = writeSVG(rendered);

    if (!svg.includes('<svg') || !svg.includes('</svg>') || !svg.includes('<g id="structure"')) {
      famValid = false;
      allGenerationsValid = false;
      console.error(`Invalid SVG for family ${fam} with seed ${seed}`);
      break;
    }

    const anchorCount = (svg.match(/[MLHVCSQTAZ]/gi) || []).length;
    totalAnchors += anchorCount;
  }
  assert(famValid, `Family [${fam}]: 20 random seeds produced valid scenes & SVG`);
}

assert(allGenerationsValid, 'All 140 test runs produced valid scenes and SVG output');

// -------------------------------------------------------------
// Test 2: Determinism & Finish Controls (Phase 2 Acceptance)
// -------------------------------------------------------------
console.log('\n--- Test 2: Phase 2 Determinism & Control Mapping ---');

// Same seed + same controls = exact identical SVG
const seedX = 987654;
const prngA = createPRNG(seedX);
const sceneA = generateScene('orbit_systems', prngA, testControls);
const svgA = writeSVG(runFinishPipeline(sceneA, testControls));

const prngB = createPRNG(seedX);
const sceneB = generateScene('orbit_systems', prngB, testControls);
const svgB = writeSVG(runFinishPipeline(sceneB, testControls));

assert(svgA === svgB, 'Determinism check: Identical seed + controls produce 100% identical SVG');

// Clean arcs check: roughness = 0 produces exact curves
const cleanControls = { ...testControls, roughness: 0, lineBreaks: 0, overshoot: 0, weightVariation: 0 };
const sceneClean = generateScene('rosettes', createPRNG(42), cleanControls);
const renderedClean = runFinishPipeline(sceneClean, cleanControls);
const svgClean = writeSVG(renderedClean);
assert(svgClean.length > 500 && !svgClean.includes('opacity="0.65"'), 'Roughness 0 produces exact clean curves with no redraw pass');

// 6 Named groups check for Figma
const requiredGroups = ['structure', 'accent', 'nodes', 'arrows', 'hidden', 'guides'];
const allGroupsPresent = requiredGroups.every(g => svgClean.includes(`id="${g}"`));
assert(allGroupsPresent, 'SVG contains all 6 named groups for Figma (structure, accent, nodes, arrows, hidden, guides)');

// -------------------------------------------------------------
// Test 3: Taste Profile & Learning Loop (Phase 3 Acceptance)
// -------------------------------------------------------------
console.log('\n--- Test 3: Phase 3 Taste Profile & Adaptive Learning ---');

const manager = new TasteProfileManager();
const initialWireframeWeight = manager.familyWeights['wireframes'];
const initialRoughnessMean = manager.sliderStats['roughness'].mean;

// Perform 10 saves of wireframe designs with high roughness
console.log('  Simulating 10 user saves favoring [wireframes] with roughness = 0.85...');
for (let i = 1; i <= 10; i++) {
  manager.saveDesign({
    family: 'wireframes',
    seed: 5000 + i,
    controls: {
      ...testControls,
      roughness: 0.85,
      complexity: 0.80
    }
  });
}

const updatedWireframeWeight = manager.familyWeights['wireframes'];
const updatedRoughnessMean = manager.sliderStats['roughness'].mean;

assert(updatedWireframeWeight > initialWireframeWeight, `Wireframe family weight increased: ${initialWireframeWeight.toFixed(3)} -> ${updatedWireframeWeight.toFixed(3)}`);
assert(updatedRoughnessMean > initialRoughnessMean, `Learned roughness mean shifted toward user preference: ${initialRoughnessMean.toFixed(2)} -> ${updatedRoughnessMean.toFixed(2)}`);

// Wildcard test: 5th next should be a wildcard
manager.nextCount = 4; // next will be 5
const next5 = manager.generateNext({}, {});
assert(next5.isWildcard === true, 'Wildcard check: Every 5th "Next" is marked as wildcard and breaks out of rut');

// JSON export and import test
const exportedJSON = manager.exportJSON();
assert(exportedJSON.length > 200, 'Taste profile JSON export generated');

const manager2 = new TasteProfileManager();
const importedOk = manager2.importJSON(exportedJSON);
assert(importedOk === true && manager2.savedDesigns.length === 10, 'Taste profile JSON import restored 10 favorites successfully');

console.log(`\n========================================`);
console.log(`Result: ${passedTests} / ${totalTests} tests passed.`);
console.log(`========================================\n`);
