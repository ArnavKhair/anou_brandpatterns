/**
 * Main Application Controller (Phase 1 Analytic Pipeline)
 */

import { createPRNG, normalizeFramingMode } from './math.js';
import { GENERATOR_FAMILIES, generateScene, getDefaultSubMode, normalizeSubMode } from './generators/index.js';
import { runFinishPipeline } from './finish-pipeline.js';
import { writeSVG } from './svg-writer.js';
import { TasteProfileManager } from './taste-profile.js';

const MAX_HISTORY = 25;

export class App {
  constructor() {
    this.tasteProfile = new TasteProfileManager();
    this.tasteProfile.loadLocal();

    this.history = [];
    this.historyIndex = -1;

    this.locks = {
      family: false,
      subMode: false,
      framingPreset: false,
      complexity: false,
      symmetry: false,
      focus: false,
      depthTilt: false,
      annotations: false,
      roughness: false,
      lineBreaks: false,
      strokeWeight: false,
      weightVariation: false,
      overshoot: false
    };

    this.previewTheme = 'dark'; // 'dark' | 'light' | 'transparent'
    this.showSafeGuides = false;
    this.nonScalingStroke = false;
    this.currentDesign = null;
    this.currentScene = null;
    this.lastRenderedSVG = '';
    this.knockoutTimer = null;

    this.initDOM();
    this.populateFamilySelect();
    this.bindEvents();
    this.updateFavoritesUI();

    this.next();
  }

  initDOM() {
    this.dom = {
      canvasViewport: document.getElementById('canvas-viewport'),
      canvasContainer: document.getElementById('canvas-container'),
      safeMarginOverlay: document.getElementById('safe-margin-overlay'),
      themePills: document.getElementById('theme-pills'),
      overlayToggleBtn: document.getElementById('overlay-toggle-btn'),
      nonScalingCheck: document.getElementById('non-scaling-check'),

      nextBtn: document.getElementById('next-btn'),
      backBtn: document.getElementById('back-btn'),
      forwardBtn: document.getElementById('forward-btn'),
      pinBtn: document.getElementById('pin-btn'),
      saveBtn: document.getElementById('save-btn'),
      copySvgBtn: document.getElementById('copy-svg-btn'),
      downloadSvgBtn: document.getElementById('download-svg-btn'),

      familySelect: document.getElementById('family-select'),
      familyLockBtn: document.getElementById('family-lock-btn'),
      subModeWrap: document.getElementById('submode-wrap'),
      subModePills: document.getElementById('submode-pills'),
      framingPills: document.getElementById('framing-pills'),

      seedBadge: document.getElementById('seed-badge'),
      layerCountBadge: document.getElementById('layer-count-badge'),
      moodBadge: document.getElementById('mood-badge'),
      wildcardBadge: document.getElementById('wildcard-badge'),
      anchorCountBadge: document.getElementById('anchor-count-badge'),
      renderTimeBadge: document.getElementById('render-time-badge'),

      complexitySlider: document.getElementById('complexity-slider'),
      complexityVal: document.getElementById('complexity-val'),
      symmetrySlider: document.getElementById('symmetry-slider'),
      symmetryVal: document.getElementById('symmetry-val'),
      focusSlider: document.getElementById('focus-slider'),
      focusVal: document.getElementById('focus-val'),
      depthTiltCheck: document.getElementById('depth-tilt-check'),
      annotationsCheck: document.getElementById('annotations-check'),

      roughnessSlider: document.getElementById('roughness-slider'),
      roughnessVal: document.getElementById('roughness-val'),
      lineBreaksSlider: document.getElementById('line-breaks-slider'),
      lineBreaksVal: document.getElementById('line-breaks-val'),
      strokeWeightSlider: document.getElementById('stroke-weight-slider'),
      strokeWeightVal: document.getElementById('stroke-weight-val'),
      weightVariationSlider: document.getElementById('weight-variation-slider'),
      weightVariationVal: document.getElementById('weight-variation-val'),
      overshootSlider: document.getElementById('overshoot-slider'),
      overshootVal: document.getElementById('overshoot-val'),

      lockButtons: document.querySelectorAll('.lock-btn'),

      toggleProfileBtn: document.getElementById('toggle-profile-btn'),
      profileDrawer: document.getElementById('profile-drawer'),
      familyWeightsList: document.getElementById('family-weights-list'),
      sliderStatsList: document.getElementById('slider-stats-list'),
      resetProfileBtn: document.getElementById('reset-profile-btn'),
      exportJsonBtn: document.getElementById('export-json-btn'),
      importJsonBtn: document.getElementById('import-json-btn'),
      importFileInput: document.getElementById('import-file-input'),

      favoritesCount: document.getElementById('favorites-count'),
      favoritesList: document.getElementById('favorites-list'),
      toast: document.getElementById('toast')
    };
  }

  populateFamilySelect() {
    this.dom.familySelect.innerHTML = '';
    for (const [id, fam] of Object.entries(GENERATOR_FAMILIES)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = fam.name;
      this.dom.familySelect.appendChild(opt);
    }
  }

  bindEvents() {
    this.dom.nextBtn.addEventListener('click', () => this.next());
    this.dom.backBtn.addEventListener('click', () => this.back());
    this.dom.forwardBtn.addEventListener('click', () => this.forward());
    this.dom.pinBtn.addEventListener('click', () => this.save());
    this.dom.saveBtn.addEventListener('click', () => this.save());
    this.dom.copySvgBtn.addEventListener('click', () => this.copySVG());
    this.dom.downloadSvgBtn.addEventListener('click', () => this.downloadSVG());

    // Preview Theme (Dark / Light / Transparent)
    this.dom.themePills.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setPreviewTheme(btn.dataset.theme);
      });
    });

    // Safe-Margin & Crosshair Overlay
    this.dom.overlayToggleBtn.addEventListener('click', () => {
      this.showSafeGuides = !this.showSafeGuides;
      this.dom.safeMarginOverlay.classList.toggle('hidden', !this.showSafeGuides);
      this.dom.overlayToggleBtn.classList.toggle('active', this.showSafeGuides);
    });

    // Non-scaling stroke toggle
    this.dom.nonScalingCheck.addEventListener('change', () => {
      this.nonScalingStroke = this.dom.nonScalingCheck.checked;
      this.renderFinishPipeline(performance.now(), { skipKnockout: false });
    });

    // Manual Family switch -> reset subMode to default & auto-lock family
    this.dom.familySelect.addEventListener('change', () => {
      const famId = this.dom.familySelect.value;
      this.currentDesign.family = famId;
      this.currentDesign.controls.subMode = getDefaultSubMode(famId);
      if (!this.locks.family) {
        this.locks.family = true;
        this.dom.familyLockBtn.classList.add('locked');
        this.dom.familyLockBtn.setAttribute('aria-pressed', 'true');
      }
      this.syncControlsToUI();
      this.rebuildScene();
    });

    // Framing pills
    this.dom.framingPills.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentDesign.controls.framingPreset = btn.dataset.framing;
        this.syncFramingPills();
        this.rebuildScene();
      });
    });

    // Lock toggles
    this.dom.lockButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const control = e.currentTarget.dataset.control;
        this.toggleLock(control, e.currentTarget);
      });
    });

    // Composition sliders (rebuild scene)
    const compSliders = [
      { el: this.dom.complexitySlider, valEl: this.dom.complexityVal, key: 'complexity' },
      { el: this.dom.symmetrySlider, valEl: this.dom.symmetryVal, key: 'symmetry' },
      { el: this.dom.focusSlider, valEl: this.dom.focusVal, key: 'focus' }
    ];
    compSliders.forEach(({ el, valEl, key }) => {
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        valEl.textContent = v.toFixed(2);
        this.currentDesign.controls[key] = v;
        this.rebuildScene({ skipKnockout: true });
      });
      el.addEventListener('change', () => {
        this.scheduleKnockoutFlush();
      });
    });

    this.dom.depthTiltCheck.addEventListener('change', () => {
      this.currentDesign.controls.depthTilt = this.dom.depthTiltCheck.checked;
      this.rebuildScene();
    });

    this.dom.annotationsCheck.addEventListener('change', () => {
      this.currentDesign.controls.annotations = this.dom.annotationsCheck.checked;
      this.rebuildScene();
    });

    // Finish sliders: 60fps style-only on input, knockout on pointerup/change/60ms debounce
    const finishSliders = [
      { el: this.dom.roughnessSlider, valEl: this.dom.roughnessVal, key: 'roughness', fmt: v => v.toFixed(2) },
      { el: this.dom.lineBreaksSlider, valEl: this.dom.lineBreaksVal, key: 'lineBreaks', fmt: v => v.toFixed(2) },
      { el: this.dom.strokeWeightSlider, valEl: this.dom.strokeWeightVal, key: 'strokeWeight', fmt: v => `${v.toFixed(1)}px` },
      { el: this.dom.weightVariationSlider, valEl: this.dom.weightVariationVal, key: 'weightVariation', fmt: v => v.toFixed(2) },
      { el: this.dom.overshootSlider, valEl: this.dom.overshootVal, key: 'overshoot', fmt: v => v.toFixed(2) }
    ];

    finishSliders.forEach(({ el, valEl, key, fmt }) => {
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        valEl.textContent = fmt(v);
        this.currentDesign.controls[key] = v;
        this.renderFinishPipeline(performance.now(), { skipKnockout: true });
        this.scheduleKnockoutFlush();
      });
      el.addEventListener('pointerup', () => this.flushKnockout());
      el.addEventListener('change', () => this.flushKnockout());
    });

    // Profile drawer
    this.dom.toggleProfileBtn.addEventListener('click', () => {
      this.dom.profileDrawer.classList.toggle('open');
      this.updateProfileUI();
    });

    this.dom.resetProfileBtn.addEventListener('click', () => {
      if (confirm('Reset taste profile to the baseline?')) {
        this.tasteProfile.resetProfile();
        this.updateProfileUI();
        this.updateFavoritesUI();
        this.showToast('Taste profile reset');
      }
    });

    this.dom.exportJsonBtn.addEventListener('click', () => {
      const json = this.tasteProfile.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atom-taste-profile-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Profile & favorites exported');
    });

    this.dom.importJsonBtn.addEventListener('click', () => this.dom.importFileInput.click());
    this.dom.importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (this.tasteProfile.importJSON(event.target.result)) {
          this.updateProfileUI();
          this.updateFavoritesUI();
          this.showToast('Profile & favorites imported!');
        } else {
          alert('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    });

    // Drag-and-drop SVG re-import onto canvas viewport
    const vp = this.dom.canvasViewport;
    vp.addEventListener('dragover', (e) => {
      e.preventDefault();
      vp.classList.add('drag-over');
    });
    vp.addEventListener('dragleave', () => vp.classList.remove('drag-over'));
    vp.addEventListener('drop', (e) => {
      e.preventDefault();
      vp.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => this.restoreFromSVGMarkup(ev.target.result);
      reader.readAsText(file);
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.back();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.save();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        this.copySVG();
      }
    });
  }

  restoreFromSVGMarkup(svgText) {
    const match = svgText.match(/data-atom-state=(['"])(.*?)\1/);
    if (!match) {
      this.showToast('No Atom state metadata found in SVG');
      return false;
    }
    try {
      const rawJson = match[2]
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const state = JSON.parse(rawJson);
      const family = GENERATOR_FAMILIES[state.generator] ? state.generator : 'rosettes';
      const subMode = normalizeSubMode(family, state.subMode);
      const restoredDesign = {
        family,
        seed: state.seed || 123456,
        controls: {
          ...state.params,
          subMode,
          framingPreset: normalizeFramingMode(state.params?.framingPreset)
        },
        mood: 'Restored SVG',
        isWildcard: false
      };
      this.pushHistory(restoredDesign);
      this.loadDesign(restoredDesign);
      this.showToast(`Restored ${GENERATOR_FAMILIES[family].name} #${restoredDesign.seed}`);
      return true;
    } catch (err) {
      this.showToast('Failed to parse SVG state metadata');
      return false;
    }
  }

  setPreviewTheme(theme) {
    this.previewTheme = theme;
    document.body.classList.toggle('light-theme', theme === 'light');
    this.dom.canvasViewport.classList.toggle('transparent-bg', theme === 'transparent');
    this.dom.themePills.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
    this.renderFinishPipeline(performance.now(), { skipKnockout: false });
  }

  toggleLock(controlName, btnElement) {
    this.locks[controlName] = !this.locks[controlName];
    const isLocked = this.locks[controlName];
    btnElement.classList.toggle('locked', isLocked);
    btnElement.setAttribute('aria-pressed', isLocked);
    this.showToast(`${controlName} ${isLocked ? 'locked' : 'unlocked'}`);
  }

  pushHistory(design) {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(design);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  next() {
    const nextResult = this.tasteProfile.generateNext(
      this.locks,
      this.currentDesign || {}
    );

    const newDesign = {
      family: nextResult.family,
      seed: nextResult.seed,
      controls: nextResult.controls,
      mood: nextResult.mood,
      isWildcard: nextResult.isWildcard
    };

    this.pushHistory(newDesign);
    this.loadDesign(newDesign);
  }

  back() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadDesign(this.history[this.historyIndex]);
    }
  }

  forward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadDesign(this.history[this.historyIndex]);
    }
  }

  loadDesign(design) {
    this.currentDesign = JSON.parse(JSON.stringify(design));
    this.syncControlsToUI();
    this.rebuildScene();
    this.updateNavButtons();
  }

  syncFramingPills() {
    const mode = normalizeFramingMode(this.currentDesign.controls.framingPreset);
    this.dom.framingPills.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.framing === mode);
    });
  }

  syncSubModePills() {
    const fam = GENERATOR_FAMILIES[this.currentDesign.family];
    const subModes = fam?.subModes || [];
    if (subModes.length === 0) {
      this.dom.subModeWrap.classList.add('hidden');
      this.dom.subModePills.innerHTML = '';
      return;
    }
    this.dom.subModeWrap.classList.remove('hidden');
    const active = normalizeSubMode(this.currentDesign.family, this.currentDesign.controls.subMode);
    this.currentDesign.controls.subMode = active;

    this.dom.subModePills.innerHTML = '';
    for (const sm of subModes) {
      const btn = document.createElement('button');
      btn.className = `seg-btn${sm.id === active ? ' active' : ''}`;
      btn.textContent = sm.label;
      btn.addEventListener('click', () => {
        this.currentDesign.controls.subMode = sm.id;
        this.syncSubModePills();
        this.rebuildScene();
      });
      this.dom.subModePills.appendChild(btn);
    }
  }

  syncControlsToUI() {
    const c = this.currentDesign.controls;
    this.dom.familySelect.value = this.currentDesign.family;
    this.syncSubModePills();
    this.syncFramingPills();

    this.dom.complexitySlider.value = c.complexity;
    this.dom.complexityVal.textContent = c.complexity.toFixed(2);
    this.dom.symmetrySlider.value = c.symmetry;
    this.dom.symmetryVal.textContent = c.symmetry.toFixed(2);
    this.dom.focusSlider.value = c.focus;
    this.dom.focusVal.textContent = c.focus.toFixed(2);

    this.dom.depthTiltCheck.checked = !!c.depthTilt;
    this.dom.annotationsCheck.checked = !!c.annotations;

    this.dom.roughnessSlider.value = c.roughness ?? 0;
    this.dom.roughnessVal.textContent = (c.roughness ?? 0).toFixed(2);
    this.dom.lineBreaksSlider.value = c.lineBreaks ?? 0;
    this.dom.lineBreaksVal.textContent = (c.lineBreaks ?? 0).toFixed(2);
    this.dom.strokeWeightSlider.value = c.strokeWeight ?? 1.4;
    this.dom.strokeWeightVal.textContent = `${(c.strokeWeight ?? 1.4).toFixed(1)}px`;
    this.dom.weightVariationSlider.value = c.weightVariation ?? 0;
    this.dom.weightVariationVal.textContent = (c.weightVariation ?? 0).toFixed(2);
    this.dom.overshootSlider.value = c.overshoot ?? 0;
    this.dom.overshootVal.textContent = (c.overshoot ?? 0).toFixed(2);

    this.dom.seedBadge.textContent = `#${this.currentDesign.seed}`;
    this.dom.moodBadge.textContent = this.currentDesign.mood || 'Custom';
    this.dom.wildcardBadge.classList.toggle('hidden', !this.currentDesign.isWildcard);
  }

  rebuildScene(options = {}) {
    const t0 = performance.now();
    const prng = createPRNG(this.currentDesign.seed);
    this.currentScene = generateScene(
      this.currentDesign.family,
      prng,
      this.currentDesign.controls
    );

    const activeLayers = this.currentScene.getActiveLayers();
    this.dom.layerCountBadge.textContent = `${activeLayers.length} ${activeLayers.length === 1 ? 'Layer' : 'Layers'}`;
    this.dom.layerCountBadge.title = `Active layers: ${activeLayers.join(' · ')}`;

    this.renderFinishPipeline(t0, options);
  }

  scheduleKnockoutFlush() {
    clearTimeout(this.knockoutTimer);
    this.knockoutTimer = setTimeout(() => {
      this.flushKnockout();
    }, 60);
  }

  flushKnockout() {
    if (this.knockoutTimer) {
      clearTimeout(this.knockoutTimer);
      this.knockoutTimer = null;
    }
    this.renderFinishPipeline(performance.now(), { skipKnockout: false });
  }

  renderFinishPipeline(startTime = performance.now(), options = {}) {
    if (!this.currentScene) return;

    const rendered = runFinishPipeline(
      this.currentScene,
      this.currentDesign.controls,
      options
    );

    const previewStroke = this.previewTheme === 'dark' ? '#E6EDF3' : '#111827';
    const previewFill = previewStroke;

    const stateMetadata = {
      generator: this.currentDesign.family,
      subMode: this.currentDesign.controls.subMode,
      seed: this.currentDesign.seed,
      params: this.currentDesign.controls
    };

    const previewSvg = writeSVG(rendered, {
      strokeColor: previewStroke,
      fillColor: previewFill,
      nonScalingStroke: this.nonScalingStroke
    });

    this.lastRenderedSVG = writeSVG(rendered, {
      strokeColor: '#000000',
      fillColor: '#000000',
      nonScalingStroke: this.nonScalingStroke,
      stateMetadata
    });

    this.dom.canvasContainer.innerHTML = previewSvg;

    const anchorMatches = this.lastRenderedSVG.match(/[MLHVCSQTAZ]/gi) || [];
    const anchorCount = anchorMatches.length;
    this.dom.anchorCountBadge.textContent = `${anchorCount} anchors`;
    this.dom.anchorCountBadge.classList.toggle('warn', anchorCount >= 400);

    const elapsed = Math.round(performance.now() - startTime);
    this.dom.renderTimeBadge.textContent = `${elapsed} ms`;
  }

  save() {
    this.tasteProfile.saveDesign(this.currentDesign);
    this.updateFavoritesUI();
    this.updateProfileUI();
    this.showToast('Pinned to strip & learned by taste profile!');
  }

  copySVG() {
    this.flushKnockout();
    if (!this.lastRenderedSVG) return;
    navigator.clipboard.writeText(this.lastRenderedSVG).then(() => {
      this.showToast('Copied SVG to clipboard for Figma!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = this.lastRenderedSVG;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('Copied SVG to clipboard!');
    });
  }

  downloadSVG() {
    this.flushKnockout();
    if (!this.lastRenderedSVG) return;
    const blob = new Blob([this.lastRenderedSVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atom-${this.currentDesign.family}-seed${this.currentDesign.seed}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Downloaded SVG');
  }

  updateNavButtons() {
    this.dom.backBtn.disabled = (this.historyIndex <= 0);
    this.dom.forwardBtn.disabled = (this.historyIndex >= this.history.length - 1);
  }

  updateFavoritesUI() {
    const favs = this.tasteProfile.savedDesigns;
    this.dom.favoritesCount.textContent = favs.length;

    if (favs.length === 0) {
      this.dom.favoritesList.innerHTML = '<div class="empty-favs">No pinned patterns yet. Press "★ Pin" on one you like!</div>';
      return;
    }

    this.dom.favoritesList.innerHTML = '';
    favs.slice().reverse().forEach(fav => {
      const card = document.createElement('div');
      card.className = 'fav-card';
      const famName = GENERATOR_FAMILIES[fav.family]?.name || fav.family;

      card.innerHTML = `
        <div class="fav-info">
          <div class="fav-title">${famName}</div>
          <div class="fav-sub">#${fav.seed}${fav.subMode ? ' · ' + fav.subMode : ''}</div>
        </div>
        <div class="fav-actions">
          <button class="btn-fav-load" title="Load into canvas">Load</button>
          <button class="btn-fav-del" title="Remove">&times;</button>
        </div>
      `;

      card.querySelector('.btn-fav-load').addEventListener('click', () => {
        const loaded = {
          family: fav.family,
          seed: fav.seed,
          controls: {
            subMode: normalizeSubMode(fav.family, fav.subMode),
            framingPreset: normalizeFramingMode(fav.framingPreset),
            complexity: fav.complexity,
            symmetry: fav.symmetry,
            focus: fav.focus,
            depthTilt: fav.depthTilt,
            annotations: fav.annotations,
            roughness: fav.roughness ?? 0,
            lineBreaks: fav.lineBreaks ?? 0,
            strokeWeight: fav.strokeWeight ?? 1.4,
            weightVariation: fav.weightVariation ?? 0,
            overshoot: fav.overshoot ?? 0
          },
          isWildcard: false
        };
        this.pushHistory(loaded);
        this.loadDesign(loaded);
        this.showToast(`Loaded pinned #${fav.seed}`);
      });

      card.querySelector('.btn-fav-del').addEventListener('click', (e) => {
        e.stopPropagation();
        this.tasteProfile.removeSavedDesign(fav.id);
        this.updateFavoritesUI();
        this.updateProfileUI();
      });

      this.dom.favoritesList.appendChild(card);
    });
  }

  updateProfileUI() {
    const weights = this.tasteProfile.familyWeights;
    const counts = this.tasteProfile.familyCounts;

    this.dom.familyWeightsList.innerHTML = '';
    for (const [fId, w] of Object.entries(weights)) {
      const row = document.createElement('div');
      row.className = 'profile-family-row';
      const fName = GENERATOR_FAMILIES[fId]?.name || fId;
      const count = counts[fId] || 0;
      const pct = Math.round(w * 100);

      row.innerHTML = `
        <div class="p-fam-label">
          <span class="p-fam-name">${fName}</span>
          <span class="p-fam-stat">${count} items (${pct}%)</span>
        </div>
        <div class="p-fam-bar-wrap">
          <div class="p-fam-bar" style="width: ${Math.min(100, pct * 2)}%"></div>
        </div>
        <div class="p-fam-nudges">
          <button class="nudge-btn nudge-down" title="Lower weight">-</button>
          <button class="nudge-btn nudge-up" title="Raise weight">+</button>
        </div>
      `;

      row.querySelector('.nudge-down').addEventListener('click', () => {
        this.tasteProfile.nudgeFamily(fId, -0.05);
        this.updateProfileUI();
      });

      row.querySelector('.nudge-up').addEventListener('click', () => {
        this.tasteProfile.nudgeFamily(fId, 0.05);
        this.updateProfileUI();
      });

      this.dom.familyWeightsList.appendChild(row);
    }

    this.dom.sliderStatsList.innerHTML = '';
    for (const [key, stat] of Object.entries(this.tasteProfile.sliderStats)) {
      const row = document.createElement('div');
      row.className = 'profile-slider-row';
      row.innerHTML = `
        <span class="p-slider-name">${key}</span>
        <span class="p-slider-val">μ=${stat.mean.toFixed(2)} ± σ=${stat.stdDev.toFixed(2)}</span>
      `;
      this.dom.sliderStatsList.appendChild(row);
    }
  }

  showToast(message) {
    if (!this.dom.toast) return;
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.dom.toast.classList.remove('show');
    }, 2500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
