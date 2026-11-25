/**
 * Taste Profile & Learning Loop Engine
 *
 * Rules:
 * - Bayesian / Laplace smoothed family weights initialized from 25 references
 * - Saved designs move the slider means and variance (spread never below 0.12)
 * - Checkbox probabilities have 10% floor
 * - Every 5th "Next" is a Wildcard ignoring the profile
 * - Skips designs within 0.1 on every control of the last 5 in the same family
 * - Locked controls preserve their current values
 * - JSON import & export
 */

import { createPRNG } from './math.js';
import { INITIAL_REFERENCES } from './initial-references.js';

const ALL_FAMILIES = [
  'rosettes',
  'wireframes',
  'tangent_chains',
  'lobes',
  'field_lines',
  'orbit_systems',
  'particle_bursts'
];

const SLIDER_KEYS = [
  'complexity',
  'symmetry',
  'focus',
  'roughness',
  'lineBreaks',
  'strokeWeight',
  'weightVariation',
  'overshoot'
];

const CHECKBOX_KEYS = [
  'depthTilt',
  'annotations'
];

export class TasteProfileManager {
  constructor(storageKey = 'atom_pattern_taste_profile') {
    this.storageKey = storageKey;
    this.nextCount = 0;
    this.recentHistory = []; // Last shown designs: { family, controls }
    this.savedDesigns = [];  // User favorites
    this.familyNudges = {};  // Manual user nudges

    // Initialize with 25 references
    this.references = INITIAL_REFERENCES.slice();
    this.computeStatistics();
  }

  computeStatistics() {
    // Combine references and saved designs
    const corpus = [...this.references, ...this.savedDesigns];

    // Family counts
    this.familyCounts = {};
    for (const f of ALL_FAMILIES) this.familyCounts[f] = 0;

    for (const item of corpus) {
      if (this.familyCounts[item.family] !== undefined) {
        this.familyCounts[item.family]++;
      }
    }

    // Smoothed family weights
    this.familyWeights = {};
    const totalCount = corpus.length;
    for (const f of ALL_FAMILIES) {
      const nudge = this.familyNudges[f] || 0;
      // Laplace smoothed: (count + 1) / (total + 7) + nudge
      const rawWeight = (this.familyCounts[f] + 1) / (totalCount + 7);
      this.familyWeights[f] = Math.max(0.02, rawWeight + nudge);
    }

    // Slider statistics: mean and stdDev
    this.sliderStats = {};
    for (const key of SLIDER_KEYS) {
      const values = corpus.map(item => item[key] ?? 0.5);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.max(0.12, Math.sqrt(variance)); // Floor at 0.12

      this.sliderStats[key] = { mean, stdDev };
    }

    // Checkbox probabilities (floor at 0.10)
    this.checkboxProbs = {};
    for (const key of CHECKBOX_KEYS) {
      const trueCount = corpus.filter(item => !!item[key]).length;
      const prob = Math.max(0.10, Math.min(0.90, trueCount / corpus.length));
      this.checkboxProbs[key] = prob;
    }
  }

  saveDesign(design) {
    // Save design with its exact family, seed, and controls
    const toSave = {
      id: `fav-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      family: design.family,
      seed: design.seed,
      complexity: design.controls.complexity,
      symmetry: design.controls.symmetry,
      focus: design.controls.focus,
      depthTilt: design.controls.depthTilt,
      annotations: design.controls.annotations,
      roughness: design.controls.roughness,
      lineBreaks: design.controls.lineBreaks,
      strokeWeight: design.controls.strokeWeight,
      weightVariation: design.controls.weightVariation,
      overshoot: design.controls.overshoot
    };

    this.savedDesigns.push(toSave);
    this.computeStatistics();
    this.persistLocal();
    return toSave;
  }

  removeSavedDesign(id) {
    this.savedDesigns = this.savedDesigns.filter(d => d.id !== id);
    this.computeStatistics();
    this.persistLocal();
  }

  nudgeFamily(familyId, delta) {
    this.familyNudges[familyId] = (this.familyNudges[familyId] || 0) + delta;
    this.computeStatistics();
  }

  resetProfile() {
    this.savedDesigns = [];
    this.familyNudges = {};
    this.computeStatistics();
    this.persistLocal();
  }

  generateNext(locks = {}, currentValues = {}, prng = createPRNG(Date.now())) {
    this.nextCount++;
    const isWildcard = (this.nextCount % 5 === 0);

    let chosenFamily;
    let chosenControls;

    // Retry loop for the skip rule
    for (let attempt = 0; attempt < 10; attempt++) {
      if (isWildcard) {
        // Wildcard ignores profile entirely
        chosenFamily = prng.choice(ALL_FAMILIES);
        chosenControls = this.sampleWildcardControls(locks, currentValues, prng);
      } else {
        // Sample family by smoothed weights
        const weightsArray = ALL_FAMILIES.map(f => this.familyWeights[f]);
        chosenFamily = prng.weightedChoice(ALL_FAMILIES, weightsArray);
        chosenControls = this.sampleProfileControls(locks, currentValues, prng);
      }

      // Check skip rule: skip if within 0.1 on every control of last 5 in same family
      const tooClose = this.isTooCloseToRecent(chosenFamily, chosenControls);
      if (!tooClose) break;
    }

    const newSeed = prng.rangeInt(100000, 9999999);

    // Record into recent history (keep last 20)
    this.recentHistory.push({
      family: chosenFamily,
      controls: { ...chosenControls },
      seed: newSeed
    });
    if (this.recentHistory.length > 20) this.recentHistory.shift();

    return {
      family: chosenFamily,
      seed: newSeed,
      controls: chosenControls,
      isWildcard
    };
  }

  sampleProfileControls(locks, currentValues, prng) {
    const controls = {};

    // Sliders
    for (const key of SLIDER_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else {
        const stats = this.sliderStats[key];
        let val;
        if (key === 'strokeWeight') {
          // Stroke weight is 0.6 to 6.0, default 1.4
          val = prng.gaussian(stats.mean, stats.stdDev);
          val = Math.max(0.6, Math.min(6.0, val));
        } else {
          // Standard 0 to 1 sliders
          val = prng.gaussian(stats.mean, stats.stdDev);
          val = Math.max(0, Math.min(1, val));
        }
        controls[key] = parseFloat(val.toFixed(2));
      }
    }

    // Checkboxes
    for (const key of CHECKBOX_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else {
        const p = this.checkboxProbs[key] || 0.5;
        controls[key] = prng.boolean(p);
      }
    }

    return controls;
  }

  sampleWildcardControls(locks, currentValues, prng) {
    const controls = {};

    for (const key of SLIDER_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else if (key === 'strokeWeight') {
        controls[key] = parseFloat(prng.range(0.8, 3.5).toFixed(2));
      } else {
        controls[key] = parseFloat(prng.range(0.1, 0.9).toFixed(2));
      }
    }

    for (const key of CHECKBOX_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else {
        controls[key] = prng.boolean(0.5);
      }
    }

    return controls;
  }

  isTooCloseToRecent(family, candidateControls) {
    // Look at last 5 designs shown in this same family
    const recentSameFamily = this.recentHistory
      .filter(h => h.family === family)
      .slice(-5);

    for (const past of recentSameFamily) {
      let allWithin01 = true;
      for (const key of SLIDER_KEYS) {
        const v1 = candidateControls[key];
        const v2 = past.controls[key];
        if (Math.abs(v1 - v2) > 0.10) {
          allWithin01 = false;
          break;
        }
      }
      if (allWithin01) return true; // Within 0.1 on every control
    }

    return false;
  }

  exportJSON() {
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      savedCount: this.savedDesigns.length,
      familyWeights: this.familyWeights,
      sliderStats: this.sliderStats,
      savedDesigns: this.savedDesigns
    }, null, 2);
  }

  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.savedDesigns)) {
        this.savedDesigns = data.savedDesigns;
      }
      if (data.familyNudges) {
        this.familyNudges = data.familyNudges;
      }
      this.computeStatistics();
      this.persistLocal();
      return true;
    } catch (e) {
      console.error('Failed to import taste profile JSON:', e);
      return false;
    }
  }

  persistLocal() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        savedDesigns: this.savedDesigns,
        familyNudges: this.familyNudges
      }));
    } catch (e) {
      // localStorage may fail in sandboxed or file:// contexts
    }
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.savedDesigns)) {
          this.savedDesigns = parsed.savedDesigns;
        }
        if (parsed.familyNudges) {
          this.familyNudges = parsed.familyNudges;
        }
        this.computeStatistics();
      }
    } catch (e) {
      // Ignore
    }
  }
}
