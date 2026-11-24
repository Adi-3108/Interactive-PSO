/**
 * @fileoverview SwarmLab — Main Application Orchestrator.
 * Connects the deterministic PSO engine with canvas rendering, interactive charts,
 * step-by-step narrator, state table, coach, hand-calc lab, prediction challenge,
 * compare mode, and accessibility features.
 * @module ui/app
 */

import { PSOEngine } from '../engine/pso.js';
import { PROBLEMS, benchmarkFunctions } from '../engine/functions.js';
import { parseExpression } from '../engine/parser.js';
import { History } from '../engine/history.js';
import { CanvasRenderer } from './canvas.js';
import { ChartRenderer } from './charts.js';
import { generateNarration, renderNarrator, initGlossary } from './narrator.js';
import { renderTable, initTable, exportCSV } from './tables.js';
import { ControlsController, initProblemPicker, initPresets, PRESETS, showToast } from './controls.js';
import { SwarmCoach } from './coach.js';
import { HandCalcLab } from './handcalc.js';
import { PredictMode } from './predict.js';
import { CompareManager } from './compare.js';
import { runVerification } from '../tests/verify.js';

const APP_MODES = ['learn', 'handcalc', 'predict', 'compare'];

function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences can still be used for this visit when storage is blocked.
  }
}

class SwarmLabApp {
  constructor() {
    this.currentMode = 'learn'; // 'learn' | 'handcalc' | 'predict' | 'compare'
    this.currentProblem = benchmarkFunctions[1]; // Default Sphere 2D
    this.params = {
      N: 25,
      D: 2,
      w: 0.729,
      c1: 1.494,
      c2: 1.494,
      vmax_pct: 0.2,
      boundary: 'clamp',
      topology: 'global',
      constriction: false,
      update_mode: 'sync',
      max_iter: 100,
      seed: 42,
      manual_random: false
    };

    this.engine = null;
    this.history = new History(2000);
    this.chartHistory = []; // [{iteration, best, mean, worst, diversity}]

    this.canvasRenderer = null;
    this.convergenceChart = null;
    this.diversityChart = null;
    this.controls = null;
    this.coach = null;
    this.handCalcLab = null;
    this.predictMode = null;
    this.compareManager = null;

    this.animId = null;
    this.isPlaying = false;
    this.speed = 1.0;
    this.lastFrameTime = 0;
    this.activeParticleId = null;

    this.init();
  }

  init() {
    // Apply the saved theme before the canvas caches any colors.
    this.setupTheme();

    // 1. Initialize Canvas & Visualizer
    const mainCanvas = document.getElementById('canvas-main');
    if (mainCanvas) {
      this.canvasRenderer = new CanvasRenderer(mainCanvas);
      this.canvasRenderer.setOptions({ colorblind: document.documentElement.dataset.colorblind === 'true' });
      this.canvasRenderer.setFunction(this.currentProblem.fn, this.currentProblem.domain, this.currentProblem.dimensions);

      // Canvas click event (used for predict mode)
      mainCanvas.addEventListener('click', (e) => {
        if (this.currentMode === 'predict' && this.predictMode) {
          const rect = mainCanvas.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const pt = this.canvasRenderer.getPointAt(cx, cy);
          const coords = pt.y !== undefined ? [pt.x, pt.y] : [pt.x];
          this.predictMode.setCanvasClickGuess(coords);
        }
      });
    }

    // 2. Initialize Charts
    const convCanvas = document.getElementById('canvas-convergence');
    if (convCanvas) {
      this.convergenceChart = new ChartRenderer(convCanvas, {
        type: 'convergence',
        onClickIteration: (iter) => this.jumpToIteration(iter)
      });
    }

    const divCanvas = document.getElementById('canvas-diversity');
    if (divCanvas) {
      this.diversityChart = new ChartRenderer(divCanvas, {
        type: 'diversity',
        onClickIteration: (iter) => this.jumpToIteration(iter)
      });
    }

    // 3. Initialize Coach
    const coachContainer = document.getElementById('coach-container');
    if (coachContainer) {
      this.coach = new SwarmCoach(coachContainer, (suggestion) => {
        this.applyCoachSuggestion(suggestion);
      });
    }

    // 4. Initialize Controls
    this.controls = new ControlsController({
      onPlayPause: (play) => this.togglePlay(play),
      onStep: () => this.stepMicro(),
      onStepBack: () => this.stepBack(),
      onFullIteration: () => this.stepIteration(),
      onReset: () => this.resetRun(),
      onSpeedChange: (s) => { this.speed = s; },
      onScrub: (step) => this.jumpToStep(step),
      onParamsChange: (newParams, resume) => this.applyParameterChange(newParams, resume),
      canContinueWith: (newParams) => this.canContinueWith(newParams),
      onCancelParamsChange: () => this.controls.setParameters(this.params)
    });
    // Keep the visible controls in sync with the configuration that creates
    // the engine; the HTML values are only no-JavaScript fallbacks.
    this.controls.setParameters(this.params);

    // 5. Initialize Problem Picker & Presets
    initProblemPicker(benchmarkFunctions, this.currentProblem.id, (prob) => {
      this.selectProblem(prob);
    });

    initPresets(PRESETS, (preset) => {
      this.loadPreset(preset);
    });

    // 6. Initialize State Table & Toolbar
    const tableContainer = document.getElementById('btab-panel-table');
    initTable(tableContainer, () => this.history.getAll());
    tableContainer?.addEventListener('table-precision-change', () => this.renderStateTable());

    // 7. Setup Special Mode Containers
    this.setupModes();

    // 8. Setup Modals, Tour, and Footer Verification
    this.setupModals();
    this.setupTour();
    this.setupLearnDrawer();
    this.setupFooterVerification();
    initGlossary();

    // 9. Parse URL Hash & Initialize Simulation
    this.parseURLHash();
    this.resetRun();
    if (this.currentMode !== 'learn') this.switchMode(this.currentMode, false);

    // 10. Start Animation Loop
    this.startLoop();
  }

  // ─── Simulation Lifecycle ──────────────────────────────────────────────────

  createEngine() {
    return new PSOEngine({
      ...this.params,
      fn: this.currentProblem.fn,
      domain: this.currentProblem.domain,
      D: this.currentProblem.dimensions
    });
  }

  canContinueWith(params) {
    return Boolean(this.engine && !this.engine.isFinished() &&
      params.N === this.params.N && params.seed === this.params.seed &&
      params.max_iter > this.engine.getState().iteration);
  }

  applyParameterChange(newParams, resume = false) {
    const canResume = resume && this.canContinueWith(newParams);
    const current = canResume ? this.history.current() : null;
    this.params = { ...this.params, ...newParams };
    if (!current) {
      this.resetRun();
      return;
    }

    const narrationParams = current.narrationParams ?? current.params;
    this.engine = this.createEngine();
    this.engine.setState(current);
    this.history.replaceCurrent({ ...current, params: this.params, narrationParams });
    this.chartHistory.length = Math.min(this.chartHistory.length, current.iteration + 1);
    this.compareManager?.setExperiment(this.currentProblem, this.params);
    this.resetPrediction();
    this.renderCurrentState(current.stepResult, narrationParams, false);
    this.updateURLHash();
    this.lastFrameTime = 0;
    this.togglePlay(true);
  }

  resetPrediction() {
    this.activeParticleId = null;
    this.predictMode?.resetRound(this.currentProblem.dimensions);
    this.canvasRenderer?.setOptions({ selectedParticle: null, showForces: false });
  }

  resetRun() {
    this.isPlaying = false;
    if (this.controls) this.controls.setPlayState(false);
    if (this.controls?.parameterToast) this.controls.setParameters(this.params);
    this.controls?.clearParameterDecision();
    this.history.clear();
    this.chartHistory = [];
    this.resetPrediction();
    this.engine = this.createEngine();
    this.engine.initialize();
    this.compareManager?.setExperiment(this.currentProblem, this.params);

    // Initial state snapshot
    const state = this.engine.getState();
    const stepResult = { type: 'init', iteration: 0, details: {} };
    this.history.push({ ...state, stepResult, params: this.params });

    const metrics = this.engine.getMetrics();
    const gbest = this.engine.getGBest();
    this.chartHistory.push({
      iteration: 0,
      best: gbest.fitness,
      mean: metrics.mean_fitness,
      worst: metrics.worst_fitness,
      diversity: metrics.diversity
    });

    if (this.coach) this.coach.reset();
    this.renderCurrentState(stepResult);
    this.updateURLHash();
  }

  stepMicro() {
    if (!this.engine || this.engine.isFinished()) {
      this.isPlaying = false;
      if (this.controls) this.controls.setPlayState(false);
      return;
    }

    if (this.history.canForward()) {
      this.restoreSnapshot(this.history.forward());
      return;
    }

    const stepResult = this.engine.microStep();
    const state = this.engine.getState();
    this.history.push({ ...state, stepResult, params: this.params });

    // Update charts if iteration ended
    const gbest = this.engine.getGBest();
    const metrics = this.engine.getMetrics();

    if (stepResult.type === 'check_stop' || this.chartHistory.length <= state.iteration) {
      this.chartHistory[state.iteration] = {
        iteration: state.iteration,
        best: gbest.fitness,
        mean: metrics.mean_fitness,
        worst: metrics.worst_fitness,
        diversity: metrics.diversity
      };
    }

    this.presentStep(stepResult);
  }

  presentStep(stepResult, narrationParams = this.params, trackCoach = true) {
    if (this.currentMode === 'predict' && this.predictMode && stepResult?.type === 'compute_velocity') {
      if (this.isPlaying) this.togglePlay(false);
      const particle = this.engine.getParticles()[0];
      this.activeParticleId = particle.id;
      this.canvasRenderer?.setOptions({ selectedParticle: particle.id });
      this.predictMode.preparePrediction(particle, this.engine.getLandingPosition(particle.id),
        this.engine.getForceDecomposition(particle.id));
    } else if (this.predictMode?.activePrediction) {
      this.resetPrediction();
    }
    this.renderCurrentState(stepResult, narrationParams, trackCoach);
  }

  stepIteration() {
    if (!this.engine || this.engine.isFinished()) return;
    const curIter = this.engine.getState().iteration;

    while (this.engine.getState().iteration === curIter && !this.engine.isFinished()) {
      this.stepMicro();
    }
  }

  stepBack() {
    if (!this.history.canBack()) {
      showToast('At the beginning of history.', 'info', 2000);
      return;
    }

    this.isPlaying = false;
    if (this.controls) this.controls.setPlayState(false);

    this.resetPrediction();
    this.restoreSnapshot(this.history.back());
  }

  jumpToStep(stepIndex) {
    const snap = this.history.jumpTo(stepIndex);
    if (snap) {
      this.isPlaying = false;
      if (this.controls) this.controls.setPlayState(false);
      this.resetPrediction();
      this.restoreSnapshot(snap);
    }
  }

  restoreSnapshot(snapshot) {
    const hadPendingChange = Boolean(this.controls?.parameterToast);
    this.controls?.clearParameterDecision();
    if (JSON.stringify(this.params) !== JSON.stringify(snapshot.params)) {
      this.params = snapshot.params;
      this.engine = this.createEngine();
      this.compareManager?.setExperiment(this.currentProblem, this.params);
      this.controls?.setParameters(this.params);
      this.updateURLHash();
    } else if (hadPendingChange) {
      this.controls.setParameters(this.params);
    }
    this.engine.setState(snapshot);
    this.presentStep(snapshot.stepResult, snapshot.narrationParams ?? this.params, false);
  }

  jumpToIteration(iter) {
    const snaps = this.history.getAll();
    const targetIdx = snaps.findIndex((s) => s.iteration === iter);
    if (targetIdx !== -1) {
      this.jumpToStep(targetIdx);
    }
  }

  togglePlay(play) {
    if (!this.engine || this.engine.isFinished()) {
      this.isPlaying = false;
      if (this.controls) this.controls.setPlayState(false);
      showToast('This run has finished. Press Reset to start it again.', 'info', 2500);
      return;
    }
    this.isPlaying = play !== undefined ? play : !this.isPlaying;
    if (this.controls) this.controls.setPlayState(this.isPlaying);
  }

  // ─── Rendering & Presentation ─────────────────────────────────────────────

  renderStateTable() {
    const tbody = document.getElementById('particle-table-body');
    if (tbody && this.engine) {
      renderTable(tbody, this.engine.getParticles(), this.engine.getGBest(),
        { activeParticleId: this.activeParticleId });
    }
  }

  renderCurrentState(stepResult = null, narrationParams = this.params, trackCoach = true) {
    if (!this.engine) return;

    const state = this.engine.getState();
    const particles = this.engine.getParticles();
    const gbest = this.engine.getGBest();
    const metrics = this.engine.getMetrics();

    // A short, stable cue above the canvas gives newcomers a clear answer to
    // "what am I looking at?" without forcing them into the detailed narrator.
    const phase = document.getElementById('simulation-phase');
    const subtitle = document.getElementById('simulation-subtitle');
    const phaseCopy = {
      init: ['Ready to explore', 'The particles have been placed. Their best-known positions are marked.'],
      compute_velocity: ['Computing velocity', 'Each particle combines momentum, memory, and the swarm’s best discovery.'],
      move: ['Moving particles', 'New velocities are applied across the landscape.'],
      evaluate: ['Measuring fitness', 'The swarm checks how good every new position is.'],
      update_pbest: ['Updating personal bests', 'Particles keep only strictly better discoveries.'],
      update_gbest: ['Choosing the swarm leader', 'The best personal record becomes the new guide.'],
      check_stop: ['Checking progress', 'The simulation checks its stopping condition.']
    };
    const cue = phaseCopy[stepResult?.type] || phaseCopy.init;
    if (phase) phase.textContent = cue[0];
    if (subtitle) subtitle.textContent = cue[1];

    // 1. Canvas Render
    if (this.canvasRenderer) {
      this.canvasRenderer.render({
        particles,
        gbest,
        topology: this.params.topology,
        forceDecomposition: this.activeParticleId != null ? this.engine.getForceDecomposition(this.activeParticleId) : null
      });
    }

    // 2. State Table Render
    this.renderStateTable();

    // 3. Charts Render
    if (this.convergenceChart) {
      this.convergenceChart.setHistory(this.chartHistory, state.iteration);
    }
    if (this.diversityChart) {
      this.diversityChart.setHistory(this.chartHistory, state.iteration);
    }

    // 4. Narrator
    const narratorEl = document.getElementById('narrator');
    if (narratorEl && stepResult) {
      const nar = stepResult.type === 'init'
        ? {
          text: `<strong>Your swarm is ready.</strong> ${this.params.N} particles are spread across the landscape. Press Play to watch their first move, or use Step to inspect one decision at a time.`,
          mathView: `<strong>Starting recipe</strong><br>Inertia <code>w = ${this.params.w}</code> · Cognitive <code>c₁ = ${this.params.c1}</code> · Social <code>c₂ = ${this.params.c2}</code>`,
          glossaryTerms: []
        }
        : generateNarration({ ...stepResult, iteration: state.iteration }, narrationParams);
      renderNarrator(narratorEl, nar);

      const formulaDisplay = document.getElementById('formula-display');
      if (formulaDisplay) {
        formulaDisplay.innerHTML = `
          <div class="formula-card__heading">Live formulas &amp; substitutions</div>
          <div class="formula-card__content">${nar.mathView || '<em>No formula details for this step.</em>'}</div>
        `;
      }
    }

    // 5. Coach Update
    if (trackCoach && this.coach) {
      this.coach.update(
        metrics,
        gbest,
        this.currentProblem.known_min || 0,
        this.params,
        state.iteration,
        false
      );
    }

    // 6. Right Panel Metric Numbers
    const healthGbest = document.getElementById('health-gbest');
    const healthGbestF = document.getElementById('health-gbest-fitness');
    const healthDivVal = document.getElementById('health-diversity-value');
    const healthSpeedVal = document.getElementById('health-speed-value');

    if (healthGbest) healthGbest.textContent = `[${gbest.position.map(n => n.toFixed(3)).join(', ')}]`;
    if (healthGbestF) healthGbestF.textContent = gbest.fitness.toFixed(4);
    if (healthDivVal) healthDivVal.textContent = metrics.diversity.toFixed(3);
    if (healthSpeedVal) healthSpeedVal.textContent = metrics.mean_speed.toFixed(3);

    // 7. Timeline Scrubber
    if (this.controls) {
      this.controls.updateTimeline(
        this.history.currentIndex,
        this.history.length - 1,
        state.iteration,
        this.params.max_iter
      );
    }
  }

  startLoop() {
    const loop = (timestamp) => {
      if (this.isPlaying) {
        if (!this.lastFrameTime) this.lastFrameTime = timestamp;
        const interval = Math.max(20, 300 / this.speed);

        if (timestamp - this.lastFrameTime >= interval) {
          try {
            this.stepMicro();
          } catch (error) {
            // Never leave the primary control looking active after a runtime
            // failure. The error remains visible in DevTools for diagnosis.
            console.error('Playback stopped because a simulation step failed:', error);
            this.isPlaying = false;
            if (this.controls) this.controls.setPlayState(false);
            showToast('Playback stopped due to an error. Press Reset and try again.', 'danger', 0);
          }
          this.lastFrameTime = timestamp;
        }
      }
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  // ─── Mode Switching ────────────────────────────────────────────────────────

  setupModes() {
    APP_MODES.forEach(mode => {
      document.getElementById(`tab-${mode}`)?.addEventListener('click', () => this.switchMode(mode));
    });

    // Mobile tabs
    const mobileTabs = document.querySelectorAll('.mobile-mode-tabs .tab');
    mobileTabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => this.switchMode(APP_MODES[idx]));
    });

    // Bottom Data Tabs: the learner sees only the three primary views.
    const bTabs = [
      { id: 'btab-table', panel: 'btab-panel-table' },
      { id: 'btab-convergence', panel: 'btab-panel-convergence' },
      { id: 'btab-formula', panel: 'btab-panel-formula' },
      { id: 'btab-compare', panel: 'btab-panel-compare' }
    ];

    bTabs.forEach(({ id, panel }) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          bTabs.forEach(t => {
            const b = document.getElementById(t.id);
            const p = document.getElementById(t.panel);
            if (b) b.setAttribute('aria-selected', 'false');
            if (p) p.hidden = true;
          });
          btn.setAttribute('aria-selected', 'true');
          const activePanel = document.getElementById(panel);
          if (activePanel) activePanel.hidden = false;

          // Resize charts on reveal
          if (panel === 'btab-panel-convergence' && this.convergenceChart) {
            requestAnimationFrame(() => {
              this.convergenceChart._setupCanvas();
              this.convergenceChart.render();
              if (this.diversityChart) {
                this.diversityChart._setupCanvas();
                this.diversityChart.render();
              }
            });
          }
        });
      }
    });

    // Diversity is useful diagnostic detail, not a competing first-run tab.
    const diversityDetails = document.getElementById('diversity-details');
    if (diversityDetails) {
      diversityDetails.addEventListener('toggle', () => {
        if (diversityDetails.open && this.diversityChart) {
          this.diversityChart._setupCanvas();
          this.diversityChart.render();
        }
      });
    }
  }

  switchMode(mode, announce = true) {
    this.currentMode = mode;

    const mobileTabs = document.querySelectorAll('.mobile-mode-tabs .tab');
    APP_MODES.forEach((tabMode, idx) => {
      const selected = String(tabMode === mode);
      document.getElementById(`tab-${tabMode}`)?.setAttribute('aria-selected', selected);
      mobileTabs[idx]?.setAttribute('aria-selected', selected);
    });
    if (this.predictMode) this.predictMode.container.hidden = mode !== 'predict';
    if (mode !== 'predict' && this.predictMode) this.resetPrediction();

    // Switch view logic
    const workspace = document.getElementById('workspace');
    if (!workspace) return;

    if (mode === 'handcalc') {
      const btabTable = document.getElementById('btab-table');
      if (btabTable) btabTable.click();

      if (!this.handCalcLab) {
        const container = document.getElementById('btab-panel-formula');
        if (container) {
          container.hidden = false;
          const ftab = document.getElementById('btab-formula');
          if (ftab) ftab.click();
          this.handCalcLab = new HandCalcLab(container, () => {
            this.loadPreset(PRESETS[0]); // Textbook preset
          });
        }
      } else {
        const ftab = document.getElementById('btab-formula');
        if (ftab) ftab.click();
      }
      if (announce) showToast('Switched to Hand-Calc Lab. Check formulas and textbook values.', 'info');
    } else if (mode === 'predict') {
      document.getElementById('btab-table')?.click();
      if (!this.predictMode) {
        const playbackControls = document.getElementById('control-bar');
        if (playbackControls) {
          const predictBox = document.createElement('div');
          predictBox.id = 'predict-mode-container';
          playbackControls.before(predictBox);
          document.getElementById('tab-predict')?.setAttribute('aria-controls', predictBox.id);
          mobileTabs[APP_MODES.indexOf('predict')]?.setAttribute('aria-controls', predictBox.id);
          this.predictMode = new PredictMode(
            predictBox,
            this.canvasRenderer,
            (hint) => {
              if (this.canvasRenderer) this.canvasRenderer.setOptions({ showForces: hint });
            },
            () => {
              // A prediction always starts from a known, pre-move state.
              this.resetRun();
              this.stepMicro();
            },
            () => {
              // After the learner commits a guess, reveal the actual move.
              if (this.engine && this.engine.getState().micro_step === 1) this.stepMicro();
            }
          );
          this.predictMode.resetRound(this.currentProblem.dimensions);
        }
      }
      if (announce) showToast('Predict-then-Reveal active! Step forward to guess where particles land.', 'info');
    } else if (mode === 'compare') {
      const compPanel = document.getElementById('btab-panel-compare');
      const compTab = document.getElementById('btab-compare');
      if (compTab) compTab.click();
      if (compPanel && !this.compareManager) {
        this.compareManager = new CompareManager(compPanel, this.currentProblem, this.params);
      }
      if (announce) showToast('Compare mode: Swarm A (Global) vs Swarm B (Ring).', 'info');
    } else {
      // Learn mode
      const btabTable = document.getElementById('btab-table');
      if (btabTable) btabTable.click();
      if (announce) showToast('Switched to Learn mode.', 'info');
    }

    this.updateURLHash();
  }

  // ─── Preset & Problem Selection ───────────────────────────────────────────

  selectProblem(problem) {
    // A validated custom expression still needs its safe evaluator before it
    // can be rendered or optimized.
    if (problem.isCustom) {
      try {
        const evaluate = parseExpression(problem.expression);
        const yOnly = problem.variables?.length === 1 && problem.variables[0] === 'y';
        problem = { ...problem, fn: yOnly ? (coordinate) => evaluate(0, coordinate) : evaluate };
      } catch (error) {
        showToast(`Could not load custom function: ${error.message}`, 'danger');
        return;
      }
    }

    this.currentProblem = problem;
    this.syncProblemUI(problem);
    if (this.canvasRenderer) {
      this.canvasRenderer.setFunction(problem.fn, problem.domain, problem.dimensions);
    }
    // Initial coordinates belong exclusively to the textbook preset. Keeping
    // them after changing to 2-D formerly produced undefined y coordinates.
    const { init_positions, init_velocities, manual_r1, manual_r2, ...baseParams } = this.params;
    this.params = { ...baseParams, D: problem.dimensions, manual_random: false };
    if (this.controls) this.controls.setParameters(this.params);
    this.resetRun();
    showToast(`Loaded problem: ${problem.name}`, 'info');
  }

  loadPreset(preset) {
    if (preset.problemId) {
      const prob = benchmarkFunctions.find(p => p.id === preset.problemId);
      if (prob) {
        this.currentProblem = prob;
        this.syncProblemUI(prob);
        if (this.canvasRenderer) {
          this.canvasRenderer.setFunction(prob.fn, prob.domain, prob.dimensions);
        }
      }
    }
    // Presets must not inherit textbook-only coordinate overrides.
    const { init_positions, init_velocities, manual_r1, manual_r2, ...baseParams } = this.params;
    this.params = { ...baseParams, ...preset.params };
    if (this.controls) this.controls.setParameters(this.params);
    this.resetRun();
  }

  /** Keep programmatic selections (presets, links, custom functions) visible. */
  syncProblemUI(problem) {
    const title = document.getElementById('topbar-problem-name');
    if (title) title.textContent = problem.name;
    document.querySelectorAll('.problem-card').forEach((card) => {
      const active = card.dataset.id === problem.id;
      card.classList.toggle('problem-card--active', active);
      card.setAttribute('aria-selected', String(active));
    });
  }

  applyCoachSuggestion(suggestion) {
    if (!suggestion) return;
    this.params = { ...this.params, ...suggestion };
    if (this.controls) this.controls.setParameters(this.params);
    showToast(`Applied coach fix: ${suggestion.reason}`, 'success');
    this.resetRun();
  }

  // ─── URL Hash Sharing ─────────────────────────────────────────────────────

  updateURLHash() {
    const hashParts = [
      `problem=${encodeURIComponent(this.currentProblem.id)}`,
      `mode=${this.currentMode}`,
      `N=${this.params.N}`,
      `w=${this.params.w}`,
      `c1=${this.params.c1}`,
      `c2=${this.params.c2}`,
      `seed=${this.params.seed}`
    ];
    window.location.hash = hashParts.join('&');
  }

  parseURLHash() {
    if (!window.location.hash) return;
    try {
      const query = new URLSearchParams(window.location.hash.slice(1));
      const pId = query.get('problem');
      if (pId) {
        const prob = benchmarkFunctions.find(p => p.id === pId);
        if (prob) {
          this.currentProblem = prob;
          this.params.D = prob.dimensions;
          this.syncProblemUI(prob);
          if (this.canvasRenderer) {
            this.canvasRenderer.setFunction(prob.fn, prob.domain, prob.dimensions);
          }
        }
      }
      if (query.get('N')) this.params.N = parseInt(query.get('N'), 10);
      if (query.get('w')) this.params.w = parseFloat(query.get('w'));
      if (query.get('c1')) this.params.c1 = parseFloat(query.get('c1'));
      if (query.get('c2')) this.params.c2 = parseFloat(query.get('c2'));
      if (query.get('seed')) this.params.seed = parseInt(query.get('seed'), 10);

      const mode = query.get('mode');
      if (APP_MODES.includes(mode)) {
        this.currentMode = mode;
      }

      if (this.controls) this.controls.setParameters(this.params);
    } catch (e) {
      console.warn('Could not parse URL hash params:', e);
    }
  }

  // ─── Setup Modals, Theme & Accessibility ──────────────────────────────────

  setupTheme() {
    const root = document.documentElement;
    const themeToggle = document.getElementById('btn-theme-toggle');
    const isDark = readPreference('swarmlab_theme') === 'dark';
    root.dataset.theme = isDark ? 'dark' : 'light';
    if (themeToggle) themeToggle.checked = isDark;
    themeToggle?.addEventListener('change', () => {
      const next = themeToggle.checked ? 'dark' : 'light';
      root.dataset.theme = next;
      savePreference('swarmlab_theme', next);

      this.canvasRenderer?.refreshTheme();
      this.convergenceChart?.render();
      this.diversityChart?.render();
      this.compareManager?.chart?.render();
    });

    const colorblindToggle = document.getElementById('toggle-colorblind');
    const useColorblindPalette = readPreference('swarmlab_colorblind') === 'true';
    root.dataset.colorblind = String(useColorblindPalette);
    if (colorblindToggle) {
      colorblindToggle.checked = useColorblindPalette;
      colorblindToggle.addEventListener('change', () => {
        const enabled = colorblindToggle.checked;
        root.dataset.colorblind = String(enabled);
        savePreference('swarmlab_colorblind', String(enabled));
        this.canvasRenderer?.setOptions({ colorblind: enabled });
        this.compareManager?.chart?.render();
      });
    }
  }

  setupModals() {
    const helpBtn = document.getElementById('btn-help');
    const helpModal = document.getElementById('modal-help');
    const closeHelp = document.getElementById('btn-close-help');
    const closeHelpFooter = document.getElementById('btn-help-close-footer');

    const openModal = (m) => { if (m) m.classList.add('is-open'); };
    const closeModal = (m) => { if (m) m.classList.remove('is-open'); };

    if (helpBtn) helpBtn.addEventListener('click', () => openModal(helpModal));
    if (closeHelp) closeHelp.addEventListener('click', () => closeModal(helpModal));
    if (closeHelpFooter) closeHelpFooter.addEventListener('click', () => closeModal(helpModal));

    const verifModal = document.getElementById('modal-verification');
    const closeVerif = document.getElementById('btn-close-verification');
    const closeVerifFooter = document.getElementById('btn-verification-close-footer');
    const rerunVerif = document.getElementById('btn-rerun-verification');

    if (closeVerif) closeVerif.addEventListener('click', () => closeModal(verifModal));
    if (closeVerifFooter) closeVerifFooter.addEventListener('click', () => closeModal(verifModal));
    if (rerunVerif) rerunVerif.addEventListener('click', () => this.runVerificationModal());

    // Drawer toggles for tablet/mobile
    const btnLeft = document.getElementById('btn-toggle-left');
    const btnRight = document.getElementById('btn-toggle-right');
    const panelLeft = document.getElementById('panel-left');
    const panelRight = document.getElementById('panel-right');
    const backdrop = document.getElementById('drawer-backdrop');

    const drawers = [
      { button: btnLeft, panel: panelLeft },
      { button: btnRight, panel: panelRight }
    ];
    const setOpenDrawer = (openDrawer) => {
      for (const drawer of drawers) {
        const open = drawer === openDrawer;
        drawer.panel?.classList.toggle('is-open', open);
        drawer.button?.setAttribute('aria-expanded', String(open));
      }
      backdrop?.classList.toggle('is-visible', Boolean(openDrawer));
    };
    for (const drawer of drawers) {
      drawer.button?.addEventListener('click', () => {
        setOpenDrawer(drawer.panel?.classList.contains('is-open') ? null : drawer);
      });
    }
    const closeDrawer = () => {
      const openDrawer = drawers.find(drawer => drawer.panel?.classList.contains('is-open'));
      setOpenDrawer(null);
      openDrawer?.button?.focus();
    };
    backdrop?.addEventListener('click', closeDrawer);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && backdrop?.classList.contains('is-visible')) closeDrawer();
    });
    window.matchMedia('(min-width: 1200px)').addEventListener('change', event => {
      if (event.matches) setOpenDrawer(null);
    });
  }

  setupTour() {
    const tourOverlay = document.getElementById('tour-overlay');
    if (!tourOverlay) return;

    const app = document.getElementById('app');
    const help = document.getElementById('modal-help');
    const helpButton = document.getElementById('btn-help');
    let returnFocus = null;

    const showStep = (step) => {
      tourOverlay.querySelectorAll('.tour-step').forEach(s => s.classList.remove('is-current'));
      const active = document.getElementById(`tour-step-${step}`);
      active?.classList.add('is-current');
      const title = active?.querySelector('.tour-step__title');
      if (title) {
        title.tabIndex = -1;
        title.focus();
      }
    };

    const openTour = () => {
      returnFocus = help?.classList.contains('is-open') ? helpButton : document.activeElement;
      help?.classList.remove('is-open');
      if (app) app.inert = true;
      tourOverlay.setAttribute('aria-hidden', 'false');
      tourOverlay.classList.add('is-active');
      showStep(1);
    };

    tourOverlay.querySelectorAll('[data-tour-next], [data-tour-prev]').forEach(btn => {
      btn.addEventListener('click', () => showStep(Number(btn.dataset.tourNext ?? btn.dataset.tourPrev)));
    });

    const finishTour = () => {
      tourOverlay.classList.remove('is-active');
      if (app) app.inert = false;
      if (returnFocus && returnFocus !== document.body) returnFocus.focus();
      else helpButton?.focus();
      tourOverlay.setAttribute('aria-hidden', 'true');
      savePreference('swarmlab_tour_done', 'true');
    };

    document.getElementById('btn-open-tour')?.addEventListener('click', openTour);
    document.getElementById('tour-skip')?.addEventListener('click', finishTour);
    document.getElementById('tour-finish')?.addEventListener('click', finishTour);
    tourOverlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finishTour();
    });
    if (readPreference('swarmlab_tour_done') !== 'true' && !window.location.hash) openTour();
  }

  setupLearnDrawer() {
    const learnDrawer = document.getElementById('drawer-learn-pso');
    const openLearn = document.getElementById('btn-open-learn');
    const closeLearn = document.getElementById('btn-close-learn');
    const backdrop = document.getElementById('drawer-learn-backdrop');
    const body = document.getElementById('learn-pso-body');

    const close = () => {
      if (!learnDrawer) return;
      learnDrawer.classList.remove('is-open');
      if (backdrop) backdrop.classList.remove('is-visible');
      if (openLearn) {
        openLearn.setAttribute('aria-expanded', 'false');
        openLearn.focus();
      }
    };
    const open = () => {
      if (!learnDrawer) return;
      learnDrawer.classList.add('is-open');
      if (backdrop) backdrop.classList.add('is-visible');
      if (openLearn) openLearn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => closeLearn?.focus());
    };

    if (openLearn) {
      openLearn.setAttribute('aria-controls', 'drawer-learn-pso');
      openLearn.setAttribute('aria-expanded', 'false');
      openLearn.addEventListener('click', open);
    }

    if (closeLearn && learnDrawer) {
      closeLearn.addEventListener('click', close);
    }
    if (backdrop) backdrop.addEventListener('click', close);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && learnDrawer?.classList.contains('is-open')) close();
    });

    if (body) {
      body.innerHTML = `
        <div style="font-size:13px; line-height:1.6;">
          <h3>1. The Bird-Flock Intuition</h3>
          <p>Imagine a flock of birds searching for food in an open valley. No single bird knows where the food is, but each remembers where it personally saw the most crumbs, and everyone hears chirps from whoever found the biggest feast.</p>

          <h3>2. The Three Guiding Forces</h3>
          <p>At every step, a particle balances three competing vectors:</p>
          <ul>
            <li><strong>Inertia (w · v):</strong> Memory of current velocity. Prevents wild erratic turns.</li>
            <li><strong>Cognitive Pull (c₁ · r₁ · (pbest - x)):</strong> Nostalgia. Pulls toward the best spot it personally visited.</li>
            <li><strong>Social Pull (c₂ · r₂ · (gbest - x)):</strong> Flocking instinct. Pulls toward the overall swarm record.</li>
          </ul>

          <h3>3. Mathematical Update Rule</h3>
          <p class="font-mono" style="background:rgba(0,0,0,0.04); padding:8px; border-radius:4px;">
            v(t+1) = w·v(t) + c₁·r₁·(pbest - x) + c₂·r₂·(gbest - x)<br>
            x(t+1) = x(t) + v(t+1)
          </p>

          <h3>4. Quick Concept Self-Check Quiz</h3>
          <div id="quiz-container" style="background:var(--bg-alt, rgba(0,0,0,0.03)); padding:12px; border-radius:8px; margin-top:12px;">
            <p><strong>Q1: What happens if cognitive pull c₁ is set to 0?</strong></p>
            <button class="btn btn--secondary btn--sm quiz-btn" data-correct="false">Particles wander in circles</button>
            <button class="btn btn--secondary btn--sm quiz-btn" data-correct="true">Particles follow only the leader (swarm greed)</button>
            <div class="quiz-feedback" style="margin-top:6px; font-weight:600;"></div>
          </div>
        </div>
      `;

      body.querySelectorAll('.quiz-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const isCorrect = btn.getAttribute('data-correct') === 'true';
          const fb = body.querySelector('.quiz-feedback');
          if (fb) {
            fb.textContent = isCorrect ? '🎉 Correct! Particles ignore personal memory and chase the global leader.' : '❌ Try again!';
            fb.style.color = isCorrect ? 'var(--c-success,#16A34A)' : 'var(--c-danger,#DC2626)';
          }
        });
      });
    }
  }

  setupFooterVerification() {
    const area = document.getElementById('verification-badge-area');
    if (!area) return;

    const res = runVerification();
    area.innerHTML = `
      <button class="badge ${res.passed ? 'badge--success' : 'badge--danger'}" id="btn-open-verification" style="cursor:pointer; border:none;" type="button">
        ${res.passed ? `✔ Engine Verified Against Textbook (${res.passedCount}/${res.total} Checks)` : '✖ Verification Failed'}
      </button>
    `;

    const openBtn = document.getElementById('btn-open-verification');
    const modal = document.getElementById('modal-verification');
    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.classList.add('is-open');
        this.runVerificationModal();
      });
    }
  }

  runVerificationModal() {
    const body = document.getElementById('verification-body');
    if (!body) return;

    const res = runVerification();
    let html = `
      <div style="margin-bottom:12px; font-weight:700; color:${res.passed ? 'var(--c-success,#16A34A)' : 'var(--c-danger,#DC2626)'}">
        ${res.passed ? `✔ All ${res.passedCount} Engine Verification Tests Passed!` : '✖ Discrepancies Found in Verification'}
      </div>
      <table class="data-table" style="width:100%; font-size:12px;">
        <thead>
          <tr>
            <th>Status</th>
            <th>Check Name</th>
            <th>Expected</th>
            <th>Actual</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const r of res.results) {
      html += `
        <tr>
          <td>${r.passed ? '✔' : '✖'}</td>
          <td>${r.name}</td>
          <td class="font-mono">${r.expected}</td>
          <td class="font-mono">${r.actual}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    body.innerHTML = html;
  }
}

// Instantiate on DOM ready
const bootSwarmLab = () => {
  if (!window.swarmLab) window.swarmLab = new SwarmLabApp();
};

// Modules can be injected after DOMContentLoaded by preview servers and IDE
// webviews. Boot in either state so the controls never appear before the app.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootSwarmLab, { once: true });
} else {
  bootSwarmLab();
}
