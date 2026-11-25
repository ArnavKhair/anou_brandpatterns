/**
 * Main Application Controller
 */

import { createPRNG } from './math.js';
import { GENERATOR_FAMILIES, generateScene } from './generators/index.js';
import { runFinishPipeline } from './finish-pipeline.js';
import { writeSVG } from './svg-writer.js';
import { TasteProfileManager } from './taste-profile.js';

export class App {
  constructor() {
    this.tasteProfile = new TasteProfileManager();
    this.tasteProfile.loadLocal();

    this.history = [];
    this.historyIndex = -1;

    // Control lock states
    this.locks = {
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

    this.previewTheme = 'dark'; // 'dark' | 'light'
    this.currentDesign = null;
    this.currentScene = null;
    this.lastRenderedSVG = '';

    this.initDOM();
    this.bindEvents();

    // Start with first design
    this.next();
  }

  initDOM() {
    this.dom = {
      canvasContainer: document.getElementById('canvas-container'),
      themeToggleBtn: document.getElementById('theme-toggle-btn'),
      nextBtn: document.getElementById('next-btn'),
      backBtn: document.getElementById('back-btn'),
      saveBtn: document.getElementById('save-btn'),
      copySvgBtn: document.getElementById('copy-svg-btn'),
      downloadSvgBtn: document.getElementById('download-svg-btn'),

      // Status bar
      familyBadge: document.getElementById('family-badge'),
      seedBadge: document.getElementById('seed-badge'),
      wildcardBadge: document.getElementById('wildcard-badge'),
      anchorCountBadge: document.getElementById('anchor-count-badge'),
      renderTimeBadge: document.getElementById('render-time-badge'),

      // Composition controls
      complexitySlider: document.getElementById('complexity-slider'),
      complexityVal: document.getElementById('complexity-val'),
      symmetrySlider: document.getElementById('symmetry-slider'),
      symmetryVal: document.getElementById('symmetry-val'),
      focusSlider: document.getElementById('focus-slider'),
      focusVal: document.getElementById('focus-val'),
      depthTiltCheck: document.getElementById('depth-tilt-check'),
      annotationsCheck: document.getElementById('annotations-check'),

      // Finish controls
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

      // Locks
      lockButtons: document.querySelectorAll('.lock-btn'),

      // Profile drawer
      toggleProfileBtn: document.getElementById('toggle-profile-btn'),
      profileDrawer: document.getElementById('profile-drawer'),
      familyWeightsList: document.getElementById('family-weights-list'),
      sliderStatsList: document.getElementById('slider-stats-list'),
      resetProfileBtn: document.getElementById('reset-profile-btn'),
      exportJsonBtn: document.getElementById('export-json-btn'),
      importJsonBtn: document.getElementById('import-json-btn'),
      importFileInput: document.getElementById('import-file-input'),

      // Favorites Tray
      favoritesCount: document.getElementById('favorites-count'),
      favoritesList: document.getElementById('favorites-list'),
      toast: document.getElementById('toast')
    };
  }

  bindEvents() {
    // Navigation
    this.dom.nextBtn.addEventListener('click', () => this.next());
    this.dom.backBtn.addEventListener('click', () => this.back());
    this.dom.saveBtn.addEventListener('click', () => this.save());
    this.dom.copySvgBtn.addEventListener('click', () => this.copySVG());
    this.dom.downloadSvgBtn.addEventListener('click', () => this.downloadSVG());
    this.dom.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

    // Lock toggles
    this.dom.lockButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const control = e.currentTarget.dataset.control;
        this.toggleLock(control, e.currentTarget);
      });
    });

    // Composition slider listeners (rebuilds Scene)
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
        this.rebuildScene();
      });
    });

    // Checkboxes (rebuilds Scene)
    this.dom.depthTiltCheck.addEventListener('change', () => {
      this.currentDesign.controls.depthTilt = this.dom.depthTiltCheck.checked;
      this.rebuildScene();
    });

    this.dom.annotationsCheck.addEventListener('change', () => {
      this.currentDesign.controls.annotations = this.dom.annotationsCheck.checked;
      this.rebuildScene();
    });

    // Finish slider listeners (instant restyle, does NOT rebuild scene)
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
        this.renderFinishPipeline();
      });
    });

    // Profile drawer toggle
    this.dom.toggleProfileBtn.addEventListener('click', () => {
      this.dom.profileDrawer.classList.toggle('open');
      this.updateProfileUI();
    });

    this.dom.resetProfileBtn.addEventListener('click', () => {
      if (confirm('Reset taste profile to the 25 references baseline?')) {
        this.tasteProfile.resetProfile();
        this.updateProfileUI();
        this.updateFavoritesUI();
        this.showToast('Taste profile reset to baseline');
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

    this.dom.importJsonBtn.addEventListener('click', () => {
      this.dom.importFileInput.click();
    });

    this.dom.importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const ok = this.tasteProfile.importJSON(event.target.result);
        if (ok) {
          this.updateProfileUI();
          this.updateFavoritesUI();
          this.showToast('Profile & favorites successfully imported!');
        } else {
          alert('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    });

    // Keyboard shortcuts (Space/Right = Next, Left = Back, S = Save, C = Copy)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
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

  toggleLock(controlName, btnElement) {
    this.locks[controlName] = !this.locks[controlName];
    const isLocked = this.locks[controlName];
    btnElement.classList.toggle('locked', isLocked);
    btnElement.setAttribute('aria-pressed', isLocked);
    btnElement.title = isLocked ? `Locked (${controlName} preserved on Next)` : `Unlocked`;
    this.showToast(`${controlName} ${isLocked ? 'locked' : 'unlocked'}`);
  }

  next() {
    const nextResult = this.tasteProfile.generateNext(
      this.locks,
      this.currentDesign ? this.currentDesign.controls : {}
    );

    const newDesign = {
      family: nextResult.family,
      seed: nextResult.seed,
      controls: nextResult.controls,
      isWildcard: nextResult.isWildcard
    };

    // Trim history forward branch if we went back earlier
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(newDesign);
    this.historyIndex = this.history.length - 1;

    this.loadDesign(newDesign);
  }

  back() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const prevDesign = this.history[this.historyIndex];
      this.loadDesign(prevDesign);
    }
  }

  loadDesign(design) {
    this.currentDesign = JSON.parse(JSON.stringify(design));
    this.syncControlsToUI();
    this.rebuildScene();
    this.updateNavButtons();
  }

  syncControlsToUI() {
    const c = this.currentDesign.controls;
    this.dom.complexitySlider.value = c.complexity;
    this.dom.complexityVal.textContent = c.complexity.toFixed(2);
    this.dom.symmetrySlider.value = c.symmetry;
    this.dom.symmetryVal.textContent = c.symmetry.toFixed(2);
    this.dom.focusSlider.value = c.focus;
    this.dom.focusVal.textContent = c.focus.toFixed(2);

    this.dom.depthTiltCheck.checked = !!c.depthTilt;
    this.dom.annotationsCheck.checked = !!c.annotations;

    this.dom.roughnessSlider.value = c.roughness;
    this.dom.roughnessVal.textContent = c.roughness.toFixed(2);
    this.dom.lineBreaksSlider.value = c.lineBreaks;
    this.dom.lineBreaksVal.textContent = c.lineBreaks.toFixed(2);
    this.dom.strokeWeightSlider.value = c.strokeWeight;
    this.dom.strokeWeightVal.textContent = `${c.strokeWeight.toFixed(1)}px`;
    this.dom.weightVariationSlider.value = c.weightVariation;
    this.dom.weightVariationVal.textContent = c.weightVariation.toFixed(2);
    this.dom.overshootSlider.value = c.overshoot;
    this.dom.overshootVal.textContent = c.overshoot.toFixed(2);

    // Badges
    const famObj = GENERATOR_FAMILIES[this.currentDesign.family];
    this.dom.familyBadge.textContent = famObj ? famObj.name : this.currentDesign.family;
    this.dom.seedBadge.textContent = `#${this.currentDesign.seed}`;

    if (this.currentDesign.isWildcard) {
      this.dom.wildcardBadge.classList.remove('hidden');
    } else {
      this.dom.wildcardBadge.classList.add('hidden');
    }
  }

  rebuildScene() {
    const t0 = performance.now();
    const prng = createPRNG(this.currentDesign.seed);
    this.currentScene = generateScene(
      this.currentDesign.family,
      prng,
      this.currentDesign.controls
    );

    this.renderFinishPipeline(t0);
  }

  renderFinishPipeline(startTime = performance.now()) {
    if (!this.currentScene) return;

    // Run finish pipeline
    const rendered = runFinishPipeline(
      this.currentScene,
      this.currentDesign.controls
    );

    // Color based on preview theme
    // Note: Export SVG always uses pure black (#000000)
    const previewStroke = this.previewTheme === 'dark' ? '#E6EDF3' : '#111827';
    const previewFill = this.previewTheme === 'dark' ? '#E6EDF3' : '#111827';

    // Generate preview SVG
    const previewSvg = writeSVG(rendered, {
      strokeColor: previewStroke,
      fillColor: previewFill
    });

    // Generate clean black export SVG
    this.lastRenderedSVG = writeSVG(rendered, {
      strokeColor: '#000000',
      fillColor: '#000000'
    });

    this.dom.canvasContainer.innerHTML = previewSvg;

    // Count anchor points (approximate from path commands)
    const anchorMatches = this.lastRenderedSVG.match(/[MLHVCSQTAZ]/gi) || [];
    const anchorCount = anchorMatches.length;
    this.dom.anchorCountBadge.textContent = `${anchorCount} anchors`;
    if (anchorCount > 3000) {
      this.dom.anchorCountBadge.classList.add('warn');
    } else {
      this.dom.anchorCountBadge.classList.remove('warn');
    }

    const elapsed = Math.round(performance.now() - startTime);
    this.dom.renderTimeBadge.textContent = `${elapsed} ms`;
  }

  save() {
    const saved = this.tasteProfile.saveDesign(this.currentDesign);
    this.updateFavoritesUI();
    this.updateProfileUI();
    this.showToast('Saved to favorites & learned by taste profile!');
  }

  copySVG() {
    if (!this.lastRenderedSVG) return;
    navigator.clipboard.writeText(this.lastRenderedSVG).then(() => {
      this.showToast('Copied SVG to clipboard for Figma!');
    }).catch(err => {
      // Fallback
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

  toggleTheme() {
    this.previewTheme = this.previewTheme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('light-theme', this.previewTheme === 'light');
    this.dom.themeToggleBtn.textContent = this.previewTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
    this.renderFinishPipeline();
  }

  updateNavButtons() {
    this.dom.backBtn.disabled = (this.historyIndex <= 0);
  }

  updateFavoritesUI() {
    const favs = this.tasteProfile.savedDesigns;
    this.dom.favoritesCount.textContent = favs.length;

    if (favs.length === 0) {
      this.dom.favoritesList.innerHTML = '<div class="empty-favs">No saved patterns yet. Press "Save" on a pattern you like!</div>';
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
          <div class="fav-sub">#${fav.seed} · ${new Date(fav.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div class="fav-actions">
          <button class="btn-fav-load" title="Load into canvas">Load</button>
          <button class="btn-fav-del" title="Remove">&times;</button>
        </div>
      `;

      card.querySelector('.btn-fav-load').addEventListener('click', () => {
        this.loadDesign({
          family: fav.family,
          seed: fav.seed,
          controls: {
            complexity: fav.complexity,
            symmetry: fav.symmetry,
            focus: fav.focus,
            depthTilt: fav.depthTilt,
            annotations: fav.annotations,
            roughness: fav.roughness,
            lineBreaks: fav.lineBreaks,
            strokeWeight: fav.strokeWeight,
            weightVariation: fav.weightVariation,
            overshoot: fav.overshoot
          },
          isWildcard: false
        });
        this.showToast(`Loaded favorite #${fav.seed}`);
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

    // Render family weights list with nudge buttons
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

    // Render slider stats
    this.dom.sliderStatsList.innerHTML = '';
    for (const [key, stat] of Object.entries(this.tasteProfile.sliderStats)) {
      const row = document.createElement('div');
      row.className = 'profile-slider-row';
      const m = stat.mean.toFixed(2);
      const s = stat.stdDev.toFixed(2);

      row.innerHTML = `
        <span class="p-slider-name">${key}</span>
        <span class="p-slider-val">μ=${m} ± σ=${s}</span>
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

// Bootstrap application on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
