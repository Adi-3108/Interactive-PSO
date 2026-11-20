/**
 * @fileoverview Predict-then-Reveal mode for active student learning.
 * Challenges learners to predict particle landing coordinates given forces & memories.
 * Calculates euclidean error, manages winning streaks, and offers interactive hints.
 * @module ui/predict
 */

export class PredictMode {
  /**
   * @param {HTMLElement} container
   * @param {Object} canvasRenderer
   * @param {Function} onHintToggle
   * @param {Function} [onStartRound]
   * @param {Function} [onReveal]
   */
  constructor(container, canvasRenderer, onHintToggle, onStartRound = null, onReveal = null) {
    this.container = container;
    this.canvasRenderer = canvasRenderer;
    this.onHintToggle = onHintToggle;
    this.onStartRound = onStartRound;
    this.onReveal = onReveal;

    this.streak = 0;
    this.bestStreak = 0;
    this.totalGuesses = 0;
    this.averageError = 0;
    this.difficulty = 'medium'; // 'easy' | 'medium' | 'hard'

    this.activePrediction = null; // {particleIndex, actualTarget: [x, y], userGuess: [x, y]}
    this.showHints = false;

    this.initUI();
  }

  initUI() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="predict-panel" style="padding: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
          <div>
            <h2 style="font-size: 1.2rem; font-weight:700; margin:0;">Predict-then-Reveal Challenge</h2>
            <p class="text-muted" style="margin:4px 0 0; font-size:13px;">
              Can you predict where the particle will land before it moves?
            </p>
          </div>
          <div style="display:flex; gap:12px; align-items:center;">
            <div class="stat-badge" style="background:var(--c-surface-muted); padding:6px 12px; border-radius:6px; font-weight:600; font-size:13px;">
              🔥 Streak: <span id="predict-streak" style="color:var(--c-accent,#4F46E5);">0</span> (Best: <span id="predict-best">0</span>)
            </div>
            <select class="num-input" id="predict-difficulty" style="width:110px;">
              <option value="easy">Easy (Hints On)</option>
              <option value="medium" selected>Medium</option>
              <option value="hard">Hard (Hidden r)</option>
            </select>
          </div>
        </div>

        <!-- Prediction Prompt Box -->
        <div class="predict-card" id="predict-card" style="background:var(--c-surface-raised); border:1px solid var(--c-border); border-radius:10px; padding:16px; margin-bottom:16px;">
          <div id="predict-prompt-text" style="font-size:14px; margin-bottom:12px;">
            Start a round to calculate a particle's next move, then make your prediction on the canvas or with the coordinate fields.
          </div>

          <button class="btn btn--primary btn--sm" id="btn-start-prediction" type="button">Start prediction round</button>

          <div class="form-row--inline" style="gap:10px; align-items:center; flex-wrap:wrap;">
            <div class="form-row" style="margin:0;">
              <label for="predict-x" style="font-size:12px;">Predicted X</label>
              <input type="number" class="num-input" id="predict-x" step="0.1" style="width:90px;" placeholder="X" aria-describedby="predict-coordinate-feedback">
            </div>
            <div class="form-row" id="predict-y-group" style="margin:0;">
              <label for="predict-y" style="font-size:12px;">Predicted Y</label>
              <input type="number" class="num-input" id="predict-y" step="0.1" style="width:90px;" placeholder="Y" aria-describedby="predict-coordinate-feedback">
            </div>
            <button class="btn btn--primary btn--sm" id="btn-submit-prediction" type="button" disabled>
              🎯 Submit Guess
            </button>
            <button class="btn btn--secondary btn--sm" id="btn-toggle-hint" type="button">
              💡 Hint (Force Arrows)
            </button>
          </div>
          <div id="predict-coordinate-feedback" class="predict-coordinate-feedback" role="status" aria-live="polite"></div>

          <!-- Result feedback -->
          <div id="predict-feedback" style="display:none; margin-top:14px; padding:10px; border-radius:6px; font-size:13px;">
          </div>
        </div>
      </div>
    `;

    const diffSelect = this.container.querySelector('#predict-difficulty');
    if (diffSelect) {
      diffSelect.addEventListener('change', (e) => {
        this.difficulty = e.target.value;
        this.showHints = this.difficulty === 'easy';
        if (this.onHintToggle) this.onHintToggle(this.showHints);
      });
    }

    const hintBtn = this.container.querySelector('#btn-toggle-hint');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        this.showHints = !this.showHints;
        hintBtn.textContent = this.showHints ? '💡 Hide Hint' : '💡 Hint (Force Arrows)';
        if (this.onHintToggle) this.onHintToggle(this.showHints);
      });
    }

    const submitBtn = this.container.querySelector('#btn-submit-prediction');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.submitGuess();
      });
    }

    ['predict-x', 'predict-y'].forEach((id) => {
      const input = this.container.querySelector(`#${id}`);
      if (input) {
        input.addEventListener('input', () => this.updateCoordinateValidity());
        input.addEventListener('blur', () => this.updateCoordinateValidity(true));
      }
    });

    const startBtn = this.container.querySelector('#btn-start-prediction');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.onStartRound) this.onStartRound();
      });
    }
  }

  updateCoordinateValidity(showFeedback = false) {
    const xInput = this.container.querySelector('#predict-x');
    const yInput = this.container.querySelector('#predict-y');
    const submitBtn = this.container.querySelector('#btn-submit-prediction');
    const feedback = this.container.querySelector('#predict-coordinate-feedback');
    const xRaw = xInput ? xInput.value.trim() : '';
    const yRaw = yInput ? yInput.value.trim() : '';
    const gx = xRaw === '' ? NaN : Number(xRaw);
    const gy = yRaw === '' ? NaN : Number(yRaw);
    const xValid = Number.isFinite(gx);
    const yValid = Number.isFinite(gy);

    if (xInput) xInput.setAttribute('aria-invalid', String(showFeedback && !xValid));
    if (yInput) yInput.setAttribute('aria-invalid', String(showFeedback && !yValid));

    let message = '';
    if (!xValid && xRaw === '') message = 'Enter a finite Predicted X.';
    else if (!xValid) message = 'Predicted X must be a finite number.';
    else if (!yValid && yRaw === '') message = 'Enter a finite Predicted Y.';
    else if (!yValid) message = 'Predicted Y must be a finite number.';

    if (feedback) {
      feedback.textContent = showFeedback && message ? message : '';
      feedback.style.display = showFeedback && message ? 'block' : 'none';
    }
    if (submitBtn) submitBtn.disabled = !this.activePrediction || !xValid || !yValid;
    return xValid && yValid;
  }

  /**
   * Set up a prediction challenge for a specific particle.
   * @param {Object} particle - The particle to be moved
   * @param {number[]} actualTarget - The true destination [x, y]
   * @param {Object} forces - Force decomposition {inertia, cognitive, social}
   */
  preparePrediction(particle, actualTarget, forces) {
    this.activePrediction = {
      particleId: particle.id,
      from: particle.x.slice(),
      actualTarget: actualTarget.slice(),
      forces: forces
    };

    const promptText = this.container.querySelector('#predict-prompt-text');
    const submitBtn = this.container.querySelector('#btn-submit-prediction');
    const feedback = this.container.querySelector('#predict-feedback');
    const xInput = this.container.querySelector('#predict-x');
    const yInput = this.container.querySelector('#predict-y');

    if (xInput) xInput.value = '';
    if (yInput) yInput.value = '';

    if (promptText) {
      promptText.innerHTML = `
        <strong>Where will Particle ${particle.id + 1} land?</strong> Currently at <code>[${particle.x.map(v => v.toFixed(2)).join(', ')}]</code>.
        <br>Click anywhere on the canvas or type coordinates below.
      `;
    }

    if (feedback) feedback.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    this.updateCoordinateValidity(false);
  }

  setCanvasClickGuess(coords) {
    if (!this.activePrediction || !Array.isArray(coords) || coords.length < 2) return;
    if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
      this.updateCoordinateValidity(true);
      return;
    }
    const xInput = this.container.querySelector('#predict-x');
    const yInput = this.container.querySelector('#predict-y');

    if (xInput && coords[0] !== undefined) xInput.value = coords[0].toFixed(2);
    if (yInput && coords[1] !== undefined) yInput.value = coords[1].toFixed(2);

    this.submitGuess([coords[0], coords[1] !== undefined ? coords[1] : 0]);
  }

  submitGuess(overrideCoords = null) {
    if (!this.activePrediction) return;

    let guess = overrideCoords;
    if (!guess) {
      const xInput = this.container.querySelector('#predict-x');
      const yInput = this.container.querySelector('#predict-y');
      const gx = xInput && xInput.value.trim() !== '' ? Number(xInput.value) : NaN;
      const gy = yInput && yInput.value.trim() !== '' ? Number(yInput.value) : NaN;
      guess = [gx, gy];
    }
    if (!Array.isArray(guess) || guess.length < 2 ||
        !Number.isFinite(guess[0]) || !Number.isFinite(guess[1])) {
      this.updateCoordinateValidity(true);
      return null;
    }

    const target = this.activePrediction.actualTarget;
    const D = target.length;

    let distSq = 0;
    for (let d = 0; d < D; d++) {
      const diff = (guess[d] || 0) - target[d];
      distSq += diff * diff;
    }
    const error = Math.sqrt(distSq);

    this.totalGuesses++;
    const isGood = error < 0.75;

    if (isGood) {
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    } else {
      this.streak = 0;
    }

    // Update UI counters
    const streakEl = this.container.querySelector('#predict-streak');
    const bestEl = this.container.querySelector('#predict-best');
    if (streakEl) streakEl.textContent = String(this.streak);
    if (bestEl) bestEl.textContent = String(this.bestStreak);

    // Show feedback
    const feedback = this.container.querySelector('#predict-feedback');
    const submitBtn = this.container.querySelector('#btn-submit-prediction');
    if (submitBtn) submitBtn.disabled = true;

    if (feedback) {
      feedback.style.display = 'block';
      const color = isGood ? 'var(--c-success, #16A34A)' : 'var(--c-danger, #DC2626)';
      const bg = isGood ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)';
      feedback.style.background = bg;
      feedback.style.color = color;
      feedback.innerHTML = `
        <strong>${isGood ? '🎉 Great intuition!' : '🔍 Keep practicing!'}</strong> Error distance: <code>${error.toFixed(3)}</code>.
        <br>Actual target was: <code>[${target.map(v => v.toFixed(3)).join(', ')}]</code>.
        Your guess was: <code>[${guess.map(v => v.toFixed(3)).join(', ')}]</code>.
      `;
    }

    if (this.onReveal) this.onReveal();

    return { error, isGood, streak: this.streak };
  }
}

export function initPredictMode(container, canvasRenderer, onHintToggle, onStartRound, onReveal) {
  return new PredictMode(container, canvasRenderer, onHintToggle, onStartRound, onReveal);
}
