/**
 * @fileoverview Swarm Health Coach: live diagnostic advisor for PSO runs.
 * Analyzes diversity, stagnation, explosion, and convergence metrics,
 * presenting clear feedback, a 3-light gauge, and one-click actionable parameter fixes.
 * @module ui/coach
 */

export class SwarmCoach {
  /**
   * @param {HTMLElement} container
   * @param {Function} onApplySuggestion - Callback when user clicks 'Apply suggestion'
   */
  constructor(container, onApplySuggestion) {
    this.container = container;
    this.onApplySuggestion = onApplySuggestion;
    this.initialDiversity = null;
    this.stagnationCount = 0;
    this.lastBestFitness = null;
    this.explosionCount = 0;
    this.totalMoves = 0;

    this.currentDiagnosis = null;
    this.initUI();
  }

  reset() {
    this.initialDiversity = null;
    this.stagnationCount = 0;
    this.lastBestFitness = null;
    this.explosionCount = 0;
    this.totalMoves = 0;
    this.currentDiagnosis = null;
    this.render();
  }

  initUI() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="coach-wrapper">
        <!-- 3-Light Status Gauge -->
        <div class="coach-gauge" role="group" aria-label="Swarm search phase gauge">
          <div class="gauge-step" id="gauge-explore" data-phase="explore">
            <span class="gauge-dot"></span>
            <span class="gauge-title">Exploration</span>
          </div>
          <div class="gauge-step active" id="gauge-balance" data-phase="balance">
            <span class="gauge-dot"></span>
            <span class="gauge-title">Balance</span>
          </div>
          <div class="gauge-step" id="gauge-exploit" data-phase="exploit">
            <span class="gauge-dot"></span>
            <span class="gauge-title">Exploitation</span>
          </div>
        </div>

        <!-- Diagnostic card -->
        <div class="coach-card" id="coach-card">
          <div class="coach-header">
            <span class="coach-badge badge--success" id="coach-badge">● Healthy Swarm</span>
          </div>
          <p class="coach-message" id="coach-message">
            Swarm initialized. Ready to explore the landscape.
          </p>
          <div class="coach-action" id="coach-action" style="display:none; margin-top:10px;">
            <button class="btn btn--primary btn--sm" id="btn-coach-apply" type="button">
              ✨ Apply Suggested Fix
            </button>
          </div>
        </div>
      </div>
    `;

    const applyBtn = this.container.querySelector('#btn-coach-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        if (this.currentDiagnosis && this.currentDiagnosis.suggestion && this.onApplySuggestion) {
          this.onApplySuggestion(this.currentDiagnosis.suggestion);
          this.currentDiagnosis.applied = true;
          this.render();
        }
      });
    }
  }

  /**
   * Update the coach analysis with latest iteration metrics.
   * @param {Object} metrics - {diversity, mean_fitness, best_fitness, mean_speed}
   * @param {Object} gbest - Current gbest
   * @param {number} knownOptimum - Known minimum value of current problem
   * @param {Object} currentParams - w, c1, c2, topology, etc.
   * @param {number} iteration - Current iteration
   * @param {boolean} [clampedOrBounded=false] - Whether particles hit boundary/vmax
   */
  update(metrics, gbest, knownOptimum = 0, currentParams = {}, iteration = 0, clampedOrBounded = false) {
    if (!metrics) return;

    // Track initial diversity
    if (this.initialDiversity == null && metrics.diversity > 0) {
      this.initialDiversity = metrics.diversity;
    }

    // Track stagnation
    if (this.lastBestFitness != null) {
      if (Math.abs(gbest.fitness - this.lastBestFitness) < 1e-8) {
        this.stagnationCount++;
      } else {
        this.stagnationCount = 0;
      }
    }
    this.lastBestFitness = gbest.fitness;

    // Track boundary hits / explosion
    this.totalMoves++;
    if (clampedOrBounded) {
      this.explosionCount++;
    }

    // Determine Gauge Phase
    let phase = 'balance';
    const initDiv = this.initialDiversity || 1;
    const divRatio = metrics.diversity / initDiv;

    if (divRatio > 0.65 || metrics.mean_speed > 1.5) {
      phase = 'explore';
    } else if (divRatio < 0.15 || metrics.mean_speed < 0.05) {
      phase = 'exploit';
    } else {
      phase = 'balance';
    }

    // Evaluate Diagnoses
    let diagnosis = {
      status: 'healthy',
      title: '● Healthy Swarm',
      type: 'success',
      text: 'The swarm is maintaining a balanced exploration-exploitation tradeoff with healthy momentum.',
      suggestion: null
    };

    const distFromOptimum = Math.abs(gbest.fitness - knownOptimum);

    // 1. Explosion / Divergence check (>50% boundary hits or high speed)
    if (this.totalMoves > 4 && (this.explosionCount / this.totalMoves > 0.45 || metrics.mean_speed > 2.5)) {
      diagnosis = {
        status: 'explosion',
        title: '⚠ Swarm Divergence / Explosion',
        type: 'danger',
        text: 'Particles are moving too violently and slamming against boundaries or velocity limits.',
        suggestion: {
          w: Math.max(0.4, (currentParams.w || 0.7) * 0.7),
          vmax_pct: 0.2,
          reason: 'Reduced inertia weight w and enabled a 20% Vmax clamp.'
        }
      };
    }
    // 2. Premature Convergence check (diversity dropped < 5% of initial, far from optimum)
    else if (iteration > 8 && divRatio < 0.05 && distFromOptimum > 0.1) {
      diagnosis = {
        status: 'premature_convergence',
        title: '⚠ Premature Convergence',
        type: 'warning',
        text: 'The swarm clustered tightly around a suboptimal spot. Diversity is depleted (<5% initial).',
        suggestion: {
          w: Math.min(0.9, (currentParams.w || 0.7) + 0.2),
          c1: 2.2,
          c2: 1.0,
          topology: 'ring',
          reason: 'Switched to Ring topology and boosted cognitive curiosity (c1) to escape local trap.'
        }
      };
    }
    // 3. Stagnation check (15+ iterations with zero improvement)
    else if (this.stagnationCount >= 15 && distFromOptimum > 1e-4) {
      diagnosis = {
        status: 'stagnation',
        title: '⚡ Swarm Stagnation',
        type: 'warning',
        text: `No global best improvement for ${this.stagnationCount} iterations. Particles may be trapped.`,
        suggestion: {
          c1: Math.min(3.0, (currentParams.c1 || 1.5) + 0.5),
          w: Math.min(0.85, (currentParams.w || 0.7) + 0.1),
          reason: 'Increased cognitive confidence (c1) to encourage particles to explore their own memories.'
        }
      };
    }
    // 4. Converged to Optimum check
    else if (distFromOptimum <= 1e-4) {
      diagnosis = {
        status: 'optimal',
        title: '⭐ Optimum Reached!',
        type: 'success',
        text: `Congratulations! The swarm converged cleanly to the global minimum (error < 0.0001).`,
        suggestion: null
      };
    }

    this.currentDiagnosis = diagnosis;
    this.render(phase);
  }

  render(phase = 'balance') {
    if (!this.container) return;

    // Update gauge lights
    const steps = this.container.querySelectorAll('.gauge-step');
    steps.forEach((el) => {
      if (el.getAttribute('data-phase') === phase) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Update diagnosis card
    const d = this.currentDiagnosis || {
      status: 'healthy',
      title: '● Ready',
      type: 'success',
      text: 'Swarm initialized. Step or play to begin analysis.'
    };

    const badge = this.container.querySelector('#coach-badge');
    const msg = this.container.querySelector('#coach-message');
    const action = this.container.querySelector('#coach-action');
    const applyBtn = this.container.querySelector('#btn-coach-apply');

    if (badge) {
      badge.textContent = d.title;
      badge.className = `coach-badge badge--${d.type}`;
    }
    if (msg) {
      msg.textContent = d.text;
    }
    if (action && applyBtn) {
      if (d.suggestion && !d.applied) {
        action.style.display = 'block';
        applyBtn.textContent = `✨ Apply: ${d.suggestion.reason}`;
      } else {
        action.style.display = 'none';
      }
    }
  }
}

/**
 * Functional update wrapper for easy integration.
 */
export function updateCoach(coachInstance, metrics, gbest, knownOptimum, params, iter, clamped) {
  if (coachInstance && coachInstance.update) {
    coachInstance.update(metrics, gbest, knownOptimum, params, iter, clamped);
  }
}
