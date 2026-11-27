/**
 * Generator registry and dispatcher (Phase 1 Analytic Pipeline)
 */

import { applyCanonicalFraming, normalizeFramingMode } from '../math.js';
import { generateRosette, normalizeRosetteSubMode } from './rosette.js';
import { generateTangentChain, normalizeTangentSubMode } from './tangent-chain.js';
import { generateLobes, normalizeLobesSubMode } from './lobes.js';
import { generateFieldLines, normalizeFieldLinesSubMode } from './field-lines.js';
import { generateParticleBurst } from './particle-burst.js';
import { generateWireframe, normalizeWireframeSubMode } from './wireframe.js';
import { generateOrbitSystem, normalizeOrbitSubMode } from './orbit-system.js';
import { generateSpiral, normalizeSpiralSubMode } from './spiral.js';

export const GENERATOR_FAMILIES = {
  rosettes: {
    id: 'rosettes',
    name: 'Rosettes',
    generate: generateRosette,
    normalizeSubMode: normalizeRosetteSubMode,
    subModes: [
      { id: 'tangent_rings', label: 'Tangent Rings' },
      { id: 'seed_of_life', label: '3×3 Lattice' }
    ],
    defaultRefs: 6
  },
  tangent_chains: {
    id: 'tangent_chains',
    name: 'Tangent Chains',
    generate: generateTangentChain,
    normalizeSubMode: normalizeTangentSubMode,
    subModes: [
      { id: 'circle_packing', label: 'Circle Packing' },
      { id: 'golden_construction', label: 'Golden Construction' }
    ],
    defaultRefs: 4
  },
  lobes: {
    id: 'lobes',
    name: 'Lobes & Envelopes',
    generate: generateLobes,
    normalizeSubMode: normalizeLobesSubMode,
    subModes: [
      { id: 'bowtie_stack', label: 'Bowtie Caustic' },
      { id: 'foreshortened_stack', label: 'Elliptical Stack' },
      { id: 'rose', label: 'Harmonic Rose' }
    ],
    defaultRefs: 3
  },
  field_lines: {
    id: 'field_lines',
    name: 'Field Lines',
    generate: generateFieldLines,
    normalizeSubMode: normalizeFieldLinesSubMode,
    subModes: [
      { id: 'multipole_rk4', label: 'Multipole RK4' },
      { id: 'parallel_ribbon', label: 'Parallel Ribbon' }
    ],
    defaultRefs: 3
  },
  particle_bursts: {
    id: 'particle_bursts',
    name: 'Particle Bursts',
    generate: generateParticleBurst,
    normalizeSubMode: () => null,
    subModes: [],
    defaultRefs: 2
  },
  wireframes: {
    id: 'wireframes',
    name: 'Wireframes',
    generate: generateWireframe,
    normalizeSubMode: normalizeWireframeSubMode,
    subModes: [
      { id: 'sphere', label: 'Sphere' },
      { id: 'torus', label: 'Torus' },
      { id: 'hyperboloid', label: 'Hyperboloid' }
    ],
    defaultRefs: 4
  },
  orbit_systems: {
    id: 'orbit_systems',
    name: 'Orbit Systems',
    generate: generateOrbitSystem,
    normalizeSubMode: normalizeOrbitSubMode,
    subModes: [
      { id: 'keplerian', label: 'Keplerian' },
      { id: 'emblem', label: 'Emblem' },
      { id: 'trajectory', label: 'Trajectory' }
    ],
    defaultRefs: 3
  },
  spirals: {
    id: 'spirals',
    name: 'Logarithmic Spirals',
    generate: generateSpiral,
    normalizeSubMode: normalizeSpiralSubMode,
    subModes: [
      { id: 'logarithmic', label: 'Logarithmic' },
      { id: 'phyllotaxis', label: 'Phyllotaxis' }
    ],
    defaultRefs: 3
  }
};

export function getDefaultSubMode(familyId) {
  const fam = GENERATOR_FAMILIES[familyId] || GENERATOR_FAMILIES.rosettes;
  return fam.subModes.length > 0 ? fam.subModes[0].id : null;
}

export function normalizeSubMode(familyId, subMode) {
  const fam = GENERATOR_FAMILIES[familyId] || GENERATOR_FAMILIES.rosettes;
  if (fam.subModes.length === 0) return null;
  if (!subMode) return fam.subModes[0].id;
  return fam.normalizeSubMode ? fam.normalizeSubMode(subMode) : fam.subModes[0].id;
}

export function generateScene(familyId, prng, controls = {}) {
  const family = GENERATOR_FAMILIES[familyId] || GENERATOR_FAMILIES.rosettes;
  const resolvedSubMode = normalizeSubMode(family.id, controls.subMode);
  const scene = family.generate(prng, { ...controls, subMode: resolvedSubMode });

  const framingPrng = prng.fork(777);
  const preset = controls.framingPreset
    ? normalizeFramingMode(controls.framingPreset)
    : framingPrng.weightedChoice(['CENTERED EMBLEM', 'OFF-AXIS FOCAL'], [0.60, 0.40]);

  applyCanonicalFraming(scene, preset, framingPrng);
  return scene;
}
