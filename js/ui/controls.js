/**
 * @fileoverview Control bar, parameter inputs, validation, presets, problem picker,
 * keyboard shortcuts, and non-blocking toast notifications.
 * @module ui/controls
 */

import { validateExpression } from '../engine/parser.js';

export const PRESETS = [
  {
    id: 'textbook',
    name: 'Textbook 1D Example',
    problemId: 'textbook1d',
    story: 'Verification case from literature. Step through micro-steps to verify formulas by hand.',
    params: {
      N: 3,
      D: 1,
      w: 0.5,
      c1: 1.0,
      c2: 1.0,
      vmax_pct: 0,
      boundary: 'none',
      topology: 'global',
      constriction: false,
      update_mode: 'sync',
      max_iter: 50,
      manual_random: true,
      manual_r1: 0.5,
      manual_r2: 0.5,
      init_positions: [[4], [-3], [2]],
      init_velocities: [[0], [0], [0]]
    }
  },
  {
    id: 'balanced',
    name: 'Balanced Default',
    problemId: 'sphere2d',
    story: 'Standard canonical parameters (w=0.7, c1=1.5, c2=1.5) on smooth Sphere bowl.',
    params: {
      N: 20,
      D: 2,
      w: 0.7,
      c1: 1.5,
      c2: 1.5,
      vmax_pct: 0.2,
      boundary: 'clamp',
      topology: 'global',
      constriction: false,
      update_mode: 'sync',
      max_iter: 60,
      manual_random: false
    }
  },
  {
    id: 'greedy',
    name: 'Greedy Swarm (High c₂)',
    problemId: 'rastrigin',
    story: 'Social pull dominates (c2=3.0, c1=0.5). Swarm collapses rapidly into the first local minimum found.',
    params: {
      N: 30,
      D: 2,
      w: 0.5,
      c1: 0.5,
      c2: 3.0,
      vmax_pct: 0.2,
      boundary: 'clamp',
      topology: 'global',
      constriction: false,
      update_mode: 'sync',
      max_iter: 60,
      manual_random: false
    }
  },
  {
    id: 'explorers',
    name: 'Lonely Explorers (High c₁)',
    problemId: 'rastrigin',
    story: 'Cognitive curiosity dominates (c1=3.0, c2=0.5). Particles wander independently without consensus.',
    params: {
      N: 30,
      D: 2,
      w: 0.7,
      c1: 3.0,
      c2: 0.5,
      vmax_pct: 0.3,
      boundary: 'clamp',
      topology: 'global',
      constriction: false,
      update_mode: 'sync',
      max_iter: 80,
      manual_random: false
    }
  },
  {
    id: 'momentum',
    name: 'Momentum Overload (w=1.1)',
    problemId: 'sphere2d',
    story: 'Unstable inertia (w=1.1 > 1.0). Swarm explodes outwards and bounces aggressively against boundaries.',
    params: {
      N: 20,
      D: 2,
      w: 1.1,
      c1: 1.5,
      c2: 1.5,
      vmax_pct: 0,
      boundary: 'reflect',
      topology: 'global',
      constriction: false,
      update_mode: 'sync',
      max_iter: 60,
      manual_random: false
    }
  },
  {
    id: 'ring_rastrigin',
    name: 'Ring Topology on Rastrigin',
    problemId: 'rastrigin',
    story: 'Ring topology slows information diffusion, letting sub-swarms explore distinct valleys before converging.',
    params: {
      N: 30,
      D: 2,
      w: 0.72,
      c1: 1.49,
      c2: 1.49,
      vmax_pct: 0.2,
      boundary: 'clamp',
      topology: 'ring',
      constriction: false,
      update_mode: 'sync',
      max_iter: 100,
      manual_random: false
    }
  }
];

/**
 * Display a non-blocking toast notification.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'danger'} [type='info']
 * @param {number} [duration=4000]
 * @param {Array<{label: string, onClick: Function}>} [actions]
 */
export function showToast(message, type = 'info', duration = 4000, actions = [], onDismiss = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');

  let actionsHtml = '';
  if (actions && actions.length > 0) {
    actionsHtml = `<div class="toast__actions" style="margin-top: 8px; display: flex; gap: 8px;"></div>`;
  }

  toast.innerHTML = `
    <div class="toast__content" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
      <span>${message}</span>
      <button class="toast__close" aria-label="Close" type="button" style="background:none; border:none; cursor:pointer; font-size:16px;">✕</button>
    </div>
    ${actionsHtml}
  `;

  const closeBtn = toast.querySelector('.toast__close');
  closeBtn.addEventListener('click', () => {
    toast.remove();
    onDismiss?.();
  });

  if (actions && actions.length > 0) {
    const actionsBox = toast.querySelector('.toast__actions');
    for (const act of actions) {
      const b = document.createElement('button');
      b.className = 'btn btn--sm btn--secondary';
      b.textContent = act.label;
      b.addEventListener('click', () => {
        act.onClick();
        toast.remove();
      });
      actionsBox.appendChild(b);
    }
  }

  container.appendChild(toast);

  if (duration > 0 && actions.length === 0) {
    setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, duration);
  }
  return toast;
}

/**
 * Controller for parameter panels and playback transport.
 */
export class ControlsController {
  constructor(callbacks = {}) {
    this.callbacks = {
      onPlayPause: () => {},
      onStep: () => {},
      onStepBack: () => {},
      onFullIteration: () => {},
      onReset: () => {},
      onSpeedChange: () => {},
      onScrub: () => {},
      onParamsChange: () => {},
      canContinueWith: () => false,
      onCancelParamsChange: () => {},
      onProblemSelect: () => {},
      ...callbacks
    };

    this.isPlaying = false;
    this.speed = 1.0;
    this.microStepMode = true;
    this.parameterToast = null;

    this._bindTransport();
    this._bindParameters();
    this._bindKeyboard();
  }

  _bindTransport() {
    const btnPlay = document.getElementById('btn-play');
    const btnStepForward = document.getElementById('btn-step-forward');
    const btnStepBack = document.getElementById('btn-step-back');
    const btnReset = document.getElementById('btn-reset');
    const btnSkipEnd = document.getElementById('btn-skip-end');
    const speedSlider = document.getElementById('speed-slider');
    const speedLabel = document.getElementById('speed-label');
    const toggleMicro = document.getElementById('toggle-micro');
    const scrubber = document.getElementById('timeline-scrubber');

    if (btnReset) btnReset.title = 'Reset experiment';
    if (btnStepBack) btnStepBack.title = 'Step back';
    if (btnPlay) btnPlay.title = 'Play / pause';
    if (btnStepForward) btnStepForward.title = 'Step forward';
    if (btnSkipEnd) {
      btnSkipEnd.title = 'Next iteration';
      btnSkipEnd.setAttribute('aria-label', 'Next iteration');
    }

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        if (this.parameterToast) {
          this.parameterToast.querySelector('.toast__actions button')?.focus();
          return;
        }
        this.isPlaying = !this.isPlaying;
        btnPlay.textContent = this.isPlaying ? '⏸' : '▶';
        btnPlay.setAttribute('aria-label', this.isPlaying ? 'Pause' : 'Play');
        this.callbacks.onPlayPause(this.isPlaying);
      });
    }

    if (btnStepForward) {
      btnStepForward.addEventListener('click', () => {
        // Make the learning-mode switch alter the step action, not just its
        // visual state.
        if (this.microStepMode) this.callbacks.onStep();
        else this.callbacks.onFullIteration();
      });
    }

    if (btnStepBack) {
      btnStepBack.addEventListener('click', () => {
        this.callbacks.onStepBack();
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.isPlaying = false;
        if (btnPlay) btnPlay.textContent = '▶';
        this.callbacks.onReset();
      });
    }

    if (btnSkipEnd) {
      btnSkipEnd.addEventListener('click', () => {
        this.callbacks.onFullIteration();
      });
    }

    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        this.speed = parseFloat(e.target.value) || 1.0;
        if (speedLabel) speedLabel.textContent = `${this.speed}×`;
        this.callbacks.onSpeedChange(this.speed);
      });
    }

    if (toggleMicro) {
      toggleMicro.checked = this.microStepMode;
      toggleMicro.addEventListener('change', (e) => {
        this.microStepMode = e.target.checked;
      });
    }

    if (scrubber) {
      scrubber.addEventListener('input', (e) => {
        const step = parseInt(e.target.value, 10);
        this.callbacks.onScrub(step);
      });
    }
  }

  setPlayState(playing) {
    this.isPlaying = playing;
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) {
      btnPlay.textContent = this.isPlaying ? '⏸' : '▶';
      btnPlay.setAttribute('aria-label', this.isPlaying ? 'Pause' : 'Play');
    }
  }

  updateTimeline(currentStep, totalSteps, iteration, maxIter) {
    const scrubber = document.getElementById('timeline-scrubber');
    const maxLabel = document.getElementById('timeline-max');
    const iterLabel = document.getElementById('iteration-label');

    if (scrubber) {
      scrubber.max = String(Math.max(1, totalSteps));
      scrubber.value = String(currentStep);
    }
    if (maxLabel) {
      maxLabel.textContent = String(totalSteps);
    }
    if (iterLabel) {
      iterLabel.textContent = `Iter: ${iteration} / ${maxIter}`;
    }
  }

  _bindParameters() {
    const bindSync = (sliderId, inputId) => {
      const slider = document.getElementById(sliderId);
      const input = document.getElementById(inputId);
      if (!slider || !input) return;

      slider.addEventListener('input', () => {
        input.value = slider.value;
        this._onParamInput();
      });
      input.addEventListener('input', () => {
        slider.value = input.value;
        this._onParamInput();
      });
      input.addEventListener('change', () => this.setParameters(this.getParameters()));
    };

    bindSync('param-n-slider', 'param-n');
    bindSync('param-w-slider', 'param-w');
    bindSync('param-c1-slider', 'param-c1');
    bindSync('param-c2-slider', 'param-c2');
    bindSync('param-vmax-slider', 'param-vmax');

    const others = [
      'param-maxiter',
      'param-seed',
      'param-boundary',
      'param-topology',
      'param-update-mode',
      'param-inertia-schedule',
      'param-constriction'
    ];

    others.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          this._onParamInput();
          this.setParameters(this.getParameters());
        });
      }
    });

    const btnRandomSeed = document.getElementById('btn-random-seed');
    if (btnRandomSeed) {
      btnRandomSeed.addEventListener('click', () => {
        const seedInput = document.getElementById('param-seed');
        if (seedInput) {
          seedInput.value = Math.floor(Math.random() * 999999);
          this._onParamInput();
        }
      });
    }

    // Keep first-run setup short. The same accessible behavior is shared by
    // advanced options, custom functions, and the optional preset library.
    const collapsibles = [
      document.getElementById('collapsible-advanced'),
      ...document.querySelectorAll('[data-collapsible]')
    ].filter(Boolean);
    collapsibles.forEach((collapsible) => {
      const trigger = collapsible.querySelector('.collapsible__trigger');
      const content = collapsible.querySelector('.collapsible__content');
      if (!trigger || !content) return;
      trigger.addEventListener('click', () => {
        const expanded = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', String(!expanded));
        content.setAttribute('aria-hidden', String(expanded));
        content.style.display = expanded ? 'none' : 'block';
      });
    });
  }

  _onParamInput() {
    const p = this.getParameters();
    this._validateParameters(p);

    if (this.isPlaying || this.parameterToast) {
      this.setPlayState(false);
      this.callbacks.onPlayPause(false);
      this.clearParameterDecision();

      const canContinue = this.callbacks.canContinueWith(p);
      const apply = (resume) => {
        this.clearParameterDecision();
        this.callbacks.onParamsChange(p, resume);
      };
      const actions = [{ label: 'Reset from Start', onClick: () => apply(false) }];
      if (canContinue) actions.push({ label: 'Continue Run', onClick: () => apply(true) });
      this.parameterToast = showToast(
        canContinue
          ? 'Parameters changed. Restart with the new settings or continue from the current swarm.'
          : 'This change requires a fresh run. Restart to apply the new settings.',
        'warning', 0, actions, () => {
          this.clearParameterDecision();
          this.callbacks.onCancelParamsChange();
        });
    } else {
      this.callbacks.onParamsChange(p);
    }
  }

  clearParameterDecision() {
    this.parameterToast?.remove();
    this.parameterToast = null;
  }

  _validateParameters(p) {
    let warning = null;
    if (p.w > 1.0 && (p.c1 + p.c2) > 4) {
      warning = 'Unstable setting: w > 1.0 with (c₁ + c₂) > 4 will cause particle explosion/divergence.';
    }

    // Update stability warning if element exists
    let warnEl = document.getElementById('param-stability-warn');
    if (!warnEl) {
      warnEl = document.createElement('div');
      warnEl.id = 'param-stability-warn';
      warnEl.className = 'coach-tip';
      warnEl.style.color = 'var(--c-danger, #DC2626)';
      warnEl.style.fontSize = '12px';
      warnEl.style.marginTop = '8px';
      const sec = document.querySelector('#panel-left .panel-section');
      if (sec) sec.appendChild(warnEl);
    }
    warnEl.textContent = warning || '';
    warnEl.style.display = warning ? 'block' : 'none';
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts when typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) ||
          document.querySelector('#tour-overlay.is-active')) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          const btnPlay = document.getElementById('btn-play');
          if (btnPlay) btnPlay.click();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            this.callbacks.onFullIteration();
          } else {
            this.callbacks.onStep();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.callbacks.onStepBack();
          break;
        case 'KeyR':
          e.preventDefault();
          this.callbacks.onReset();
          break;
        case 'KeyM':
          const toggleM = document.getElementById('toggle-micro');
          if (toggleM) {
            toggleM.checked = !toggleM.checked;
            toggleM.dispatchEvent(new Event('change'));
          }
          break;
        case 'KeyD':
          e.preventDefault();
          document.getElementById('btn-theme-toggle')?.click();
          break;
        case 'Slash':
          if (e.shiftKey) {
            // '?' shortcut
            const modalHelp = document.getElementById('modal-help');
            if (modalHelp) modalHelp.classList.add('is-open');
          }
          break;
        case 'Escape':
          document.querySelectorAll('.modal-overlay.is-open').forEach((modal) => {
            modal.classList.remove('is-open');
          });
          break;
      }
    });
  }

  getParameters() {
    const num = (id, fallback, min, max) => {
      const value = document.getElementById(id)?.valueAsNumber;
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
    };
    const val = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : fallback;
    };
    const chk = (id) => {
      const el = document.getElementById(id);
      return el ? el.checked : false;
    };

    return {
      N: Math.round(num('param-n', 25, 1, 100)),
      w: num('param-w', 0.729, 0, 1.5),
      c1: num('param-c1', 1.494, 0, 4),
      c2: num('param-c2', 1.494, 0, 4),
      vmax_pct: num('param-vmax', 20, 0, 100) / 100,
      max_iter: Math.round(num('param-maxiter', 100, 1, 10000)),
      seed: Math.round(num('param-seed', 42, 0, 4294967295)),
      boundary: val('param-boundary', 'clamp'),
      topology: val('param-topology', 'global'),
      update_mode: val('param-update-mode', 'synchronous') === 'synchronous' ? 'sync' : 'async',
      inertia_schedule: val('param-inertia-schedule', 'constant'),
      constriction: chk('param-constriction')
    };
  }

  setParameters(params) {
    if (!params) return;
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };

    if (params.N !== undefined) {
      setVal('param-n', params.N);
      setVal('param-n-slider', params.N);
    }
    if (params.w !== undefined) {
      setVal('param-w', params.w);
      setVal('param-w-slider', params.w);
    }
    if (params.c1 !== undefined) {
      setVal('param-c1', params.c1);
      setVal('param-c1-slider', params.c1);
    }
    if (params.c2 !== undefined) {
      setVal('param-c2', params.c2);
      setVal('param-c2-slider', params.c2);
    }
    if (params.vmax_pct !== undefined) {
      const pct = Math.round(params.vmax_pct * 100);
      setVal('param-vmax', pct);
      setVal('param-vmax-slider', pct);
    }
    if (params.max_iter !== undefined) setVal('param-maxiter', params.max_iter);
    if (params.seed !== undefined) setVal('param-seed', params.seed);
    if (params.boundary !== undefined) setVal('param-boundary', params.boundary);
    if (params.topology !== undefined) setVal('param-topology', params.topology);
    if (params.update_mode !== undefined) {
      setVal('param-update-mode', params.update_mode === 'sync' ? 'synchronous' : 'asynchronous');
    }
    if (params.inertia_schedule !== undefined) setVal('param-inertia-schedule', params.inertia_schedule);
    if (params.constriction !== undefined) {
      const c = document.getElementById('param-constriction');
      if (c) c.checked = !!params.constriction;
    }
  }
}

/**
 * Render the problem selection cards in the left panel.
 * @param {Array<Object>} problems
 * @param {string} activeId
 * @param {Function} onSelect
 */
export function initProblemPicker(problems, activeId, onSelect) {
  const container = document.getElementById('problem-list');
  if (!container) return;

  container.innerHTML = '';
  for (const prob of problems) {
    const card = document.createElement('div');
    const isActive = prob.id === activeId;
    card.className = `problem-card ${isActive ? 'problem-card--active' : ''}`;
    card.setAttribute('role', 'option');
    card.tabIndex = 0;
    card.setAttribute('aria-selected', String(isActive));
    card.setAttribute('data-id', prob.id);
    card.style.cursor = 'pointer';

    const diffBadge = {
      easy: '<span class="badge badge--success">Easy</span>',
      medium: '<span class="badge badge--warning">Medium</span>',
      hard: '<span class="badge badge--danger">Hard</span>'
    }[prob.difficulty] || '';

    card.innerHTML = `
      <div class="problem-card__header" style="display:flex; justify-content:space-between; align-items:center;">
        <span class="problem-card__name font-bold">${prob.name}</span>
        ${diffBadge}
      </div>
      <div class="problem-card__formula font-mono text-muted" style="font-size:11px; margin:4px 0;">
        ${prob.formula}
      </div>
      <div class="problem-card__desc text-muted" style="font-size:12px;">
        ${prob.description}
      </div>
    `;

    card.addEventListener('click', () => {
      container.querySelectorAll('.problem-card').forEach((c) => {
        c.classList.remove('problem-card--active');
        c.setAttribute('aria-selected', 'false');
      });
      card.classList.add('problem-card--active');
      card.setAttribute('aria-selected', 'true');

      const titleEl = document.getElementById('topbar-problem-name');
      if (titleEl) titleEl.textContent = prob.name;

      if (onSelect) onSelect(prob);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      card.click();
    });

    container.appendChild(card);
  }

  // Custom function input handler
  const customInput = document.getElementById('input-custom-fn');
  const customError = document.getElementById('custom-fn-error');
  if (customInput) {
    const submitCustomFunction = (quiet = false) => {
      const expr = customInput.value.trim();
      if (!expr) return;
      const res = validateExpression(expr);
      if (!res.valid) {
        if (customError) {
          customError.textContent = `Parse error: ${res.error}`;
          customError.className = 'form-error';
          customError.style.display = 'block';
        }
        if (!quiet) showToast(`Invalid custom function: ${res.error}`, 'danger');
        return;
      }

      if (customError) customError.style.display = 'none';
      if (!quiet) showToast(`Custom function loaded (${res.variables.length || 1}D)!`, 'success');
      if (onSelect) {
        onSelect({
          id: 'custom',
          name: `Custom f(${res.variables.join(',') || 'x'})`,
          formula: expr,
          variables: res.variables,
          isCustom: true,
          expression: expr,
          dimensions: res.variables.length || 1,
          domain: res.variables.length <= 1 ? [[-5, 5]] : [[-5, 5], [-5, 5]],
          difficulty: 'medium',
          description: `User-defined expression: ${expr}`
        });
      }
    };

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitCustomFunction();
      }
    });
    // A short pause after typing gives beginners live feedback instead of
    // making Enter the only discoverable way to apply an expression.
    let customDebounce = null;
    customInput.addEventListener('input', () => {
      clearTimeout(customDebounce);
      customDebounce = setTimeout(() => {
        if (customInput.value.trim()) submitCustomFunction(true);
      }, 700);
    });
  }
}

/**
 * Render preset buttons in the left panel.
 * @param {Array<Object>} presets
 * @param {Function} onSelect
 */
export function initPresets(presets, onSelect) {
  const container = document.getElementById('preset-list');
  if (!container) return;

  container.innerHTML = '';
  for (const preset of presets) {
    const btn = document.createElement('button');
    btn.className = 'btn btn--secondary btn--sm preset-card';
    btn.type = 'button';
    btn.style.width = '100%';
    btn.style.textAlign = 'left';
    btn.style.margin = '4px 0';
    btn.innerHTML = `
      <div style="font-weight:600;">${preset.name}</div>
      <div style="font-size:11px; opacity:0.8;">${preset.story}</div>
    `;

    btn.addEventListener('click', () => {
      if (onSelect) onSelect(preset);
      showToast(`Loaded preset: ${preset.name}`, 'info');
    });

    container.appendChild(btn);
  }
}
