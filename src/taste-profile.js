/**
 * Taste Profile & Learning Loop Engine (Phase 1 Analytic Defaults)
 *
 * - roughness, lineBreaks, and overshoot default to 0.0 across all mood profiles & wildcard
 *   so Next Pattern always produces razor-sharp vector output unless manually adjusted.
 * - Supports only CENTERED EMBLEM and OFF-AXIS FOCAL framing modes.
 * - Supports subMode & family locking.
 */

import { createPRNG, normalizeFramingMode } from './math.js';
import { INITIAL_REFERENCES } from './initial-references.js';
import { GENERATOR_FAMILIES, getDefaultSubMode, normalizeSubMode } from './generators/index.js';

const ALL_FAMILIES = Object.keys(GENERATOR_FAMILIES);

export const MOOD_PROFILES = [
  {
    name: 'Stark Minimal',
    complexity: 0.25, symmetry: 0.90, focus: 0.80,
    roughness: 0.00, lineBreaks: 0.00, strokeWeight: 2.0, weightVariation: 0.00, overshoot: 0.00,
    depthTilt: false, annotations: false,
    framing: ['CENTERED EMBLEM', 'OFF-AXIS FOCAL']
  },
  {
    name: 'Swiss Architectural',
    complexity: 0.55, symmetry: 0.88, focus: 0.70,
    roughness: 0.00, lineBreaks: 0.00, strokeWeight: 1.2, weightVariation: 0.00, overshoot: 0.00,
    depthTilt: false, annotations: true,
    framing: ['CENTERED EMBLEM', 'OFF-AXIS FOCAL']
  },
  {
    name: 'Luminous Optical',
    complexity: 0.82, symmetry: 0.80, focus: 0.75,
    roughness: 0.00, lineBreaks: 0.00, strokeWeight: 0.8, weightVariation: 0.00, overshoot: 0.00,
    depthTilt: false, annotations: false,
    framing: ['CENTERED EMBLEM', 'OFF-AXIS FOCAL']
  },
  {
    name: 'Scientific Plate',
    complexity: 0.65, symmetry: 0.45, focus: 0.55,
    roughness: 0.00, lineBreaks: 0.00, strokeWeight: 1.4, weightVariation: 0.00, overshoot: 0.00,
    depthTilt: true, annotations: true,
    framing: ['OFF-AXIS FOCAL', 'CENTERED EMBLEM']
  }
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

const ZERO_DEFAULT_TEXTURE_KEYS = new Set(['roughness', 'lineBreaks', 'overshoot', 'weightVariation']);
const CHECKBOX_KEYS = ['depthTilt', 'annotations'];

export class TasteProfileManager {
  constructor(storageKey = 'atom_pattern_taste_profile') {
    this.storageKey = storageKey;
    this.nextCount = 0;
    this.recentHistory = [];
    this.savedDesigns = [];
    this.familyNudges = {};

    this.references = INITIAL_REFERENCES.slice();
    this.computeStatistics();
  }

  computeStatistics() {
    const corpus = [...this.references, ...this.savedDesigns];
    this.familyCounts = {};
    for (const f of ALL_FAMILIES) this.familyCounts[f] = 0;
    for (const item of corpus) {
      if (this.familyCounts[item.family] !== undefined) {
        this.familyCounts[item.family]++;
      }
    }

    this.familyWeights = {};
    const totalCount = corpus.length;
    for (const f of ALL_FAMILIES) {
      const nudge = this.familyNudges[f] || 0;
      const rawWeight = (this.familyCounts[f] + 1) / (totalCount + ALL_FAMILIES.length);
      this.familyWeights[f] = Math.max(0.02, rawWeight + nudge);
    }

    this.sliderStats = {};
    for (const key of SLIDER_KEYS) {
      const values = corpus.map(item => ZERO_DEFAULT_TEXTURE_KEYS.has(key) ? 0.0 : (item[key] ?? 0.5));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
      this.sliderStats[key] = { mean, stdDev: ZERO_DEFAULT_TEXTURE_KEYS.has(key) ? 0.0 : Math.max(0.12, Math.sqrt(variance)) };
    }

    this.familySliderStats = {};
    for (const f of ALL_FAMILIES) {
      const famItems = corpus.filter(item => item.family === f);
      this.familySliderStats[f] = {};
      for (const key of SLIDER_KEYS) {
        if (ZERO_DEFAULT_TEXTURE_KEYS.has(key)) {
          this.familySliderStats[f][key] = { mean: 0.0, stdDev: 0.0 };
        } else if (famItems.length === 0) {
          this.familySliderStats[f][key] = this.sliderStats[key];
        } else {
          const vals = famItems.map(item => item[key] ?? this.sliderStats[key].mean);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
          this.familySliderStats[f][key] = { mean, stdDev: Math.max(0.14, Math.sqrt(variance)) };
        }
      }
    }

    this.checkboxProbs = {};
    for (const key of CHECKBOX_KEYS) {
      const trueCount = corpus.filter(item => !!item[key]).length;
      this.checkboxProbs[key] = Math.max(0.10, Math.min(0.90, trueCount / corpus.length));
    }
  }

  saveDesign(design) {
    const toSave = {
      id: `fav-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      family: design.family,
      subMode: normalizeSubMode(design.family, design.controls.subMode),
      seed: design.seed,
      framingPreset: normalizeFramingMode(design.controls.framingPreset),
      complexity: design.controls.complexity,
      symmetry: design.controls.symmetry,
      focus: design.controls.focus,
      depthTilt: !!design.controls.depthTilt,
      annotations: !!design.controls.annotations,
      roughness: design.controls.roughness ?? 0,
      lineBreaks: design.controls.lineBreaks ?? 0,
      strokeWeight: design.controls.strokeWeight ?? 1.4,
      weightVariation: design.controls.weightVariation ?? 0,
      overshoot: design.controls.overshoot ?? 0
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

  generateNext(locks = {}, currentDesign = {}, prng = createPRNG(Date.now())) {
    this.nextCount++;
    const isWildcard = (this.nextCount % 5 === 0);
    const chosenMood = MOOD_PROFILES[(this.nextCount - 1) % MOOD_PROFILES.length];
    const currentValues = currentDesign.controls || {};

    let chosenFamily = locks.family && currentDesign.family ? currentDesign.family : null;
    let chosenControls;

    for (let attempt = 0; attempt < 10; attempt++) {
      if (!locks.family || !currentDesign.family) {
        if (isWildcard) {
          chosenFamily = prng.choice(ALL_FAMILIES);
        } else {
          const weightsArray = ALL_FAMILIES.map(f => this.familyWeights[f]);
          chosenFamily = prng.weightedChoice(ALL_FAMILIES, weightsArray);
        }
      }

      chosenControls = isWildcard
        ? this.sampleWildcardControls(locks, currentValues, prng, chosenFamily)
        : this.sampleProfileControls(locks, currentValues, prng, chosenFamily, chosenMood);

      if (!this.isTooCloseToRecent(chosenFamily, chosenControls)) break;
    }

    const newSeed = prng.rangeInt(100000, 9999999);
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
      mood: isWildcard ? 'Wildcard' : chosenMood.name,
      isWildcard
    };
  }

  sampleProfileControls(locks, currentValues, prng, family, mood = null) {
    const controls = {};
    const famStats = (family && this.familySliderStats && this.familySliderStats[family]) || this.sliderStats;

    for (const key of SLIDER_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else if (ZERO_DEFAULT_TEXTURE_KEYS.has(key)) {
        controls[key] = 0.0;
      } else {
        const stats = famStats[key] || this.sliderStats[key];
        const targetMean = mood ? (mood[key] * 0.65 + stats.mean * 0.35) : stats.mean;
        const spread = mood ? Math.max(0.08, stats.stdDev * 0.75) : stats.stdDev;
        let val = prng.gaussian(targetMean, spread);
        if (key === 'strokeWeight') {
          val = Math.max(0.6, Math.min(6.0, val));
        } else {
          val = Math.max(0, Math.min(1, val));
        }
        controls[key] = parseFloat(val.toFixed(2));
      }
    }

    for (const key of CHECKBOX_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else if (mood) {
        controls[key] = prng.boolean(mood[key] ? 0.80 : 0.20);
      } else {
        controls[key] = prng.boolean(this.checkboxProbs[key] || 0.5);
      }
    }

    // Sub-mode sampling
    const famObj = GENERATOR_FAMILIES[family];
    if (locks.subMode && currentValues.subMode !== undefined) {
      controls.subMode = normalizeSubMode(family, currentValues.subMode);
    } else if (famObj && famObj.subModes.length > 0) {
      controls.subMode = prng.choice(famObj.subModes).id;
    } else {
      controls.subMode = getDefaultSubMode(family);
    }

    // Framing mode sampling
    if (locks.framingPreset && currentValues.framingPreset) {
      controls.framingPreset = normalizeFramingMode(currentValues.framingPreset);
    } else {
      controls.framingPreset = mood && mood.framing
        ? prng.choice(mood.framing)
        : prng.choice(['CENTERED EMBLEM', 'OFF-AXIS FOCAL']);
    }

    return controls;
  }

  sampleWildcardControls(locks, currentValues, prng, family) {
    const controls = {};
    for (const key of SLIDER_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else if (ZERO_DEFAULT_TEXTURE_KEYS.has(key)) {
        controls[key] = 0.0;
      } else if (key === 'strokeWeight') {
        controls[key] = parseFloat(prng.range(0.8, 3.0).toFixed(2));
      } else if (key === 'weightVariation') {
        controls[key] = 0.0;
      } else {
        controls[key] = parseFloat(prng.range(0.15, 0.90).toFixed(2));
      }
    }

    for (const key of CHECKBOX_KEYS) {
      if (locks[key] && currentValues[key] !== undefined) {
        controls[key] = currentValues[key];
      } else {
        controls[key] = prng.boolean(0.35);
      }
    }

    const famObj = GENERATOR_FAMILIES[family];
    if (locks.subMode && currentValues.subMode !== undefined) {
      controls.subMode = normalizeSubMode(family, currentValues.subMode);
    } else if (famObj && famObj.subModes.length > 0) {
      controls.subMode = prng.choice(famObj.subModes).id;
    } else {
      controls.subMode = getDefaultSubMode(family);
    }

    controls.framingPreset = (locks.framingPreset && currentValues.framingPreset)
      ? normalizeFramingMode(currentValues.framingPreset)
      : prng.choice(['CENTERED EMBLEM', 'OFF-AXIS FOCAL']);

    return controls;
  }

  isTooCloseToRecent(family, candidateControls) {
    const recentSameFamily = this.recentHistory.filter(h => h.family === family).slice(-5);
    for (const past of recentSameFamily) {
      if (past.controls.subMode !== candidateControls.subMode) continue;
      let allWithin01 = true;
      for (const key of ['complexity', 'symmetry', 'focus', 'strokeWeight']) {
        if (Math.abs(candidateControls[key] - past.controls[key]) > 0.10) {
          allWithin01 = false;
          break;
        }
      }
      if (allWithin01) return true;
    }
    return false;
  }

  exportJSON() {
    return JSON.stringify({
      version: '2.0',
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
        this.savedDesigns = data.savedDesigns.map(d => ({
          ...d,
          subMode: normalizeSubMode(d.family, d.subMode),
          framingPreset: normalizeFramingMode(d.framingPreset)
        }));
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
      // Ignore in non-browser/sandboxed environments
    }
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.savedDesigns)) {
          this.savedDesigns = parsed.savedDesigns.map(d => ({
            ...d,
            subMode: normalizeSubMode(d.family, d.subMode),
            framingPreset: normalizeFramingMode(d.framingPreset)
          }));
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
