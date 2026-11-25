/**
 * Generator registry and dispatcher
 */

import { generateRosette } from './rosette.js';
import { generateTangentChain } from './tangent-chain.js';
import { generateLobes } from './lobes.js';
import { generateFieldLines } from './field-lines.js';
import { generateParticleBurst } from './particle-burst.js';
import { generateWireframe } from './wireframe.js';
import { generateOrbitSystem } from './orbit-system.js';

export const GENERATOR_FAMILIES = {
  rosettes: {
    id: 'rosettes',
    name: 'Rosettes and circle lattices',
    generate: generateRosette,
    defaultRefs: 6
  },
  tangent_chains: {
    id: 'tangent_chains',
    name: 'Tangent chains and spirals',
    generate: generateTangentChain,
    defaultRefs: 4
  },
  lobes: {
    id: 'lobes',
    name: 'Lobes and envelopes',
    generate: generateLobes,
    defaultRefs: 3
  },
  field_lines: {
    id: 'field_lines',
    name: 'Field lines',
    generate: generateFieldLines,
    defaultRefs: 3
  },
  particle_bursts: {
    id: 'particle_bursts',
    name: 'Particle bursts',
    generate: generateParticleBurst,
    defaultRefs: 2
  },
  wireframes: {
    id: 'wireframes',
    name: 'Wireframes',
    generate: generateWireframe,
    defaultRefs: 4
  },
  orbit_systems: {
    id: 'orbit_systems',
    name: 'Orbit systems',
    generate: generateOrbitSystem,
    defaultRefs: 3
  }
};

export function generateScene(familyId, prng, controls) {
  const family = GENERATOR_FAMILIES[familyId] || GENERATOR_FAMILIES.rosettes;
  return family.generate(prng, controls);
}
