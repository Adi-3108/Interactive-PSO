/**
 * @fileoverview Hand-Calc Lab mode: student verification workbench for PSO.
 * Allows custom manual r1/r2 inputs, initial position/velocity overrides,
 * side-by-side worksheet view with formulas, and 1-click textbook auto-check.
 * @module ui/handcalc
 */

import { PSOEngine } from '../engine/pso.js';

/**
 * Textbook reference data for Section 6.
 */
export const TEXTBOOK_REFERENCE = {
  problem: 'f(x) = x²',
  params: {
    N: 3,
    D: 1,
    w: 0.5,
    c1: 1.0,
    c2: 1.0,
    r1: 0.5,
    r2: 0.5
  },
  iter0: [
    { id: 1, x: 4, v: 0, f: 16, pbest: 4 },
    { id: 2, x: -3, v: 0, f: 9, pbest: -3 },
    { id: 3, x: 2, v: 0, f: 4, pbest: 2 }
  ],
  gbest0: { pos: 2, f: 4, pid: 3 },
  iter1: [
    { id: 1, x: 4, v: 0, pbest: 4, gbest: 2, vPrime: -1.0, xPrime: 3.0, fPrime: 9.0, newPbest: 3.0 },
    { id: 2, x: -3, v: 0, pbest: -3, gbest: 2, vPrime: 2.5, xPrime: -0.5, fPrime: 0.25, newPbest: -0.5 },
    { id: 3, x: 2, v: 0, pbest: 2, gbest: 2, vPrime: 0.0, xPrime: 2.0, fPrime: 4.0, newPbest: 2.0 }
  ],
  gbest1: { pos: -0.5, f: 0.25, pid: 2 },
  iter2: [
    { id: 1, x: 3.0, v: -1.0, pbest: 3.0, gbest: -0.5, vPrime: -2.25, xPrime: 0.75, fPrime: 0.5625, newPbest: 0.75 },
    { id: 2, x: -0.5, v: 2.5, pbest: -0.5, gbest: -0.5, vPrime: 1.25, xPrime: 0.75, fPrime: 0.5625, newPbest: -0.5 },
    { id: 3, x: 2.0, v: 0.0, pbest: 2.0, gbest: -0.5, vPrime: -1.25, xPrime: 0.75, fPrime: 0.5625, newPbest: 0.75 }
  ],
  gbest2: { pos: -0.5, f: 0.25, pid: 2 }
};

export class HandCalcLab {
  /**
   * @param {HTMLElement} container
   * @param {Function} onLoadTextbook
   */
  constructor(container, onLoadTextbook) {
    this.container = container;
    this.onLoadTextbook = onLoadTextbook;
    this.initUI();
  }

  initUI() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="handcalc-lab" style="padding: 16px;">
        <div class="handcalc-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h2 style="font-size: 1.2rem; font-weight:700; margin:0;">Hand-Calc Lab (Textbook Verification)</h2>
            <p class="text-muted" style="margin:4px 0 0; font-size:13px;">
              Verify PSO intermediate calculations step-by-step against paper solutions.
            </p>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn--primary btn--sm" id="btn-load-textbook" type="button">
              📖 Load Textbook Example (Section 6)
            </button>
            <span class="badge" id="handcalc-autocheck-badge" style="font-size:12px;">Auto-Check: Idle</span>
          </div>
        </div>

        <!-- Manual Controls Row -->
        <div class="handcalc-controls form-row--inline" style="background:var(--c-surface-muted); padding:12px; border-radius:8px; margin-bottom:16px;">
          <div class="form-row">
            <label for="hc-r1" style="font-size:12px; font-weight:600;">Manual r₁</label>
            <input type="number" class="num-input" id="hc-r1" value="0.5" step="0.05" min="0" max="1" style="width:70px;">
          </div>
          <div class="form-row">
            <label for="hc-r2" style="font-size:12px; font-weight:600;">Manual r₂</label>
            <input type="number" class="num-input" id="hc-r2" value="0.5" step="0.05" min="0" max="1" style="width:70px;">
          </div>
          <button class="btn btn--secondary btn--sm" id="btn-hc-preset-half" type="button">
            Set r₁=r₂=0.5
          </button>
          <div style="margin-left:auto;">
            <button class="btn btn--secondary btn--sm" id="btn-run-autocheck" type="button">
              🔍 Run Engine Auto-Check
            </button>
          </div>
        </div>

        <!-- Interactive Worksheet -->
        <div class="handcalc-worksheet" id="handcalc-worksheet">
          <!-- Rendered worksheet tables -->
        </div>
      </div>
    `;

    const btnLoad = this.container.querySelector('#btn-load-textbook');
    if (btnLoad) {
      btnLoad.addEventListener('click', () => {
        this.setReferenceRandom();
        if (this.onLoadTextbook) this.onLoadTextbook();
        this.runAutoCheck();
      });
    }

    const btnPresetHalf = this.container.querySelector('#btn-hc-preset-half');
    if (btnPresetHalf) {
      btnPresetHalf.addEventListener('click', () => this.setReferenceRandom());
    }

    const btnCheck = this.container.querySelector('#btn-run-autocheck');
    if (btnCheck) {
      btnCheck.addEventListener('click', () => {
        this.runAutoCheck();
      });
    }

    this.renderWorksheet();
  }

  setReferenceRandom() {
    this.container.querySelector('#hc-r1').value = TEXTBOOK_REFERENCE.params.r1;
    this.container.querySelector('#hc-r2').value = TEXTBOOK_REFERENCE.params.r2;
  }

  getManualRandom() {
    const r1 = this.container.querySelector('#hc-r1');
    const r2 = this.container.querySelector('#hc-r2');
    const read = (input) => {
      const value = input ? Number.parseFloat(input.value) : NaN;
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
    };
    return {
      r1: read(r1),
      r2: read(r2)
    };
  }

  renderWorksheet(engine = null) {
    const sheet = this.container.querySelector('#handcalc-worksheet');
    if (!sheet) return;

    sheet.innerHTML = `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 1rem; margin-bottom: 8px;">
          Iteration 1 Worksheet: <span class="font-mono text-muted">v' = w·v + c₁·r₁·(pbest - x) + c₂·r₂·(gbest - x)</span>
        </h3>
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Particle</th>
              <th>x</th>
              <th>v</th>
              <th>pbest</th>
              <th>gbest</th>
              <th>Velocity Formula Substituted</th>
              <th>v'</th>
              <th>x' = x + v'</th>
              <th>f(x') = (x')²</th>
              <th>New pbest</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-bold">P1</td>
              <td>4</td>
              <td>0</td>
              <td>4</td>
              <td>2</td>
              <td class="font-mono" style="font-size:11px;">0.5·0 + 1·0.5·(4−4) + 1·0.5·(2−4)</td>
              <td class="font-bold" style="color:var(--c-accent,#4F46E5);">-1</td>
              <td class="font-bold">3</td>
              <td>9</td>
              <td><span class="badge badge--success">3 (9 &lt; 16)</span></td>
            </tr>
            <tr>
              <td class="font-bold">P2</td>
              <td>-3</td>
              <td>0</td>
              <td>-3</td>
              <td>2</td>
              <td class="font-mono" style="font-size:11px;">0.5·0 + 1·0.5·(−3−(−3)) + 1·0.5·(2−(−3))</td>
              <td class="font-bold" style="color:var(--c-accent,#4F46E5);">2.5</td>
              <td class="font-bold">-0.5</td>
              <td style="color:var(--c-gold,#F5B301);">0.25</td>
              <td><span class="badge badge--success">-0.5 (0.25 &lt; 9)</span></td>
            </tr>
            <tr>
              <td class="font-bold">P3</td>
              <td>2</td>
              <td>0</td>
              <td>2</td>
              <td>2</td>
              <td class="font-mono" style="font-size:11px;">0.5·0 + 1·0.5·(2−2) + 1·0.5·(2−2)</td>
              <td class="font-bold" style="color:var(--c-accent,#4F46E5);">0</td>
              <td class="font-bold">2</td>
              <td>4</td>
              <td><span class="badge badge--muted">2 (4 is not &lt; 4)</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:6px; font-size:13px; font-weight:600; color:var(--c-gold,#F5B301);">
          ⭐ New Global Best after Iteration 1: x = -0.5, f(x) = 0.25 (discovered by Particle 2)
        </div>
      </div>

      <div>
        <h3 style="font-size: 1rem; margin-bottom: 8px;">
          Iteration 2 Worksheet
        </h3>
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Particle</th>
              <th>x</th>
              <th>v</th>
              <th>pbest</th>
              <th>gbest</th>
              <th>Velocity Formula Substituted</th>
              <th>v'</th>
              <th>x'</th>
              <th>f(x')</th>
              <th>New pbest</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-bold">P1</td>
              <td>3</td>
              <td>-1</td>
              <td>3</td>
              <td>-0.5</td>
              <td class="font-mono" style="font-size:11px;">0.5·(−1) + 0 + 0.5·(−0.5−3)</td>
              <td class="font-bold" style="color:var(--c-accent,#4F46E5);">-2.25</td>
              <td class="font-bold">0.75</td>
              <td>0.5625</td>
              <td><span class="badge badge--success">0.75</span></td>
            </tr>
            <tr>
              <td class="font-bold">P2</td>
              <td>-0.5</td>
              <td>2.5</td>
              <td>-0.5</td>
              <td>-0.5</td>
              <td class="font-mono" style="font-size:11px;">0.5·(2.5) + 0 + 0</td>
              <td class="font-bold" style="color:var(--c-accent,#4F46E5);">1.25</td>
              <td class="font-bold">0.75</td>
              <td>0.5625</td>
              <td><span class="badge badge--muted">-0.5 kept (0.5625 &gt; 0.25)</span></td>
            </tr>
            <tr>
              <td class="font-bold">P3</td>
              <td>2</td>
              <td>0</td>
              <td>2</td>
              <td>-0.5</td>
              <td class="font-mono" style="font-size:11px;">0 + 0 + 0.5·(−0.5−2)</td>
              <td class="font-bold" style="color:var(--c-accent,#4F46E5);">-1.25</td>
              <td class="font-bold">0.75</td>
              <td>0.5625</td>
              <td><span class="badge badge--success">0.75</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:6px; font-size:13px; font-weight:600; color:var(--c-gold,#F5B301);">
          ⭐ Global Best after Iteration 2: stays at x = -0.5, f(x) = 0.25. All three particles sit at x = 0.75.
        </div>
      </div>
    `;
  }

  runAutoCheck() {
    const badge = this.container.querySelector('#handcalc-autocheck-badge');
    const { r1, r2 } = this.getManualRandom();

    // Run independent engine instance on textbook problem
    const engine = new PSOEngine({
      fn: (x, _y) => x * x,
      domain: [[-5, 5]],
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
      max_iter: 10,
      tolerance: 0,
      seed: 42,
      manual_random: true,
      manual_r1: r1,
      manual_r2: r2,
      init_positions: [[4], [-3], [2]],
      init_velocities: [[0], [0], [0]]
    });

    engine.initialize();
    engine.fullIteration(); // Iter 1

    const p1 = engine.getParticles();
    const g1 = engine.getGBest();

    const eps = 1e-8;
    const ok1 =
      Math.abs(p1[0].v[0] - (-1)) < eps &&
      Math.abs(p1[0].x[0] - 3) < eps &&
      Math.abs(p1[0].pbest[0] - 3) < eps &&
      Math.abs(p1[1].v[0] - 2.5) < eps &&
      Math.abs(p1[1].x[0] - (-0.5)) < eps &&
      Math.abs(p1[1].pbest[0] - (-0.5)) < eps &&
      Math.abs(p1[2].v[0] - 0) < eps &&
      Math.abs(p1[2].x[0] - 2) < eps &&
      Math.abs(p1[2].pbest[0] - 2) < eps &&
      Math.abs(g1.position[0] - (-0.5)) < eps &&
      Math.abs(g1.fitness - 0.25) < eps;

    engine.fullIteration(); // Iter 2
    const p2 = engine.getParticles();
    const g2 = engine.getGBest();

    const ok2 =
      Math.abs(p2[0].v[0] - (-2.25)) < eps &&
      Math.abs(p2[0].x[0] - 0.75) < eps &&
      Math.abs(p2[0].pbest[0] - 0.75) < eps &&
      Math.abs(p2[1].v[0] - 1.25) < eps &&
      Math.abs(p2[1].x[0] - 0.75) < eps &&
      Math.abs(p2[1].pbest[0] - (-0.5)) < eps &&
      Math.abs(p2[2].v[0] - (-1.25)) < eps &&
      Math.abs(p2[2].x[0] - 0.75) < eps &&
      Math.abs(p2[2].pbest[0] - 0.75) < eps &&
      Math.abs(g2.position[0] - (-0.5)) < eps;

    if (badge) {
      if (ok1 && ok2) {
        badge.textContent = '✔ Matches Textbook (100% Exact)';
        badge.className = 'badge badge--success';
      } else {
        badge.textContent = '✖ Check Discrepancy Found';
        badge.className = 'badge badge--danger';
      }
    }

    this.renderComputedResults(r1, r2, p1, g1, p2, g2);
    return ok1 && ok2;
  }

  /** Show the actual engine output for the learner's manual random inputs. */
  renderComputedResults(r1, r2, first, firstBest, second, secondBest) {
    let output = this.container.querySelector('#handcalc-computed-results');
    if (!output) {
      output = document.createElement('div');
      output.id = 'handcalc-computed-results';
      output.style.marginTop = '18px';
      const sheet = this.container.querySelector('#handcalc-worksheet');
      if (sheet) sheet.after(output);
    }

    const format = (value) => Number(value).toFixed(4);
    const rows = (iteration, particles) => particles.map((p) => `
      <tr><td>${iteration}</td><td>P${p.id + 1}</td><td>${format(p.v[0])}</td><td>${format(p.x[0])}</td><td>${format(p.fitness)}</td><td>${format(p.pbest[0])}</td></tr>
    `).join('');

    output.innerHTML = `
      <h3 style="font-size:1rem; margin:0 0 8px;">Your computed run <span class="text-muted" style="font-weight:400;">(r1 = ${format(r1)}, r2 = ${format(r2)})</span></h3>
      <p class="text-muted" style="font-size:13px; margin:0 0 8px;">These values come directly from the same deterministic engine used in the visualizer.</p>
      <table class="data-table" style="width:100%;"><thead><tr><th>Iteration</th><th>Particle</th><th>v'</th><th>x'</th><th>f(x')</th><th>pbest</th></tr></thead><tbody>${rows(1, first)}${rows(2, second)}</tbody></table>
      <p class="text-muted" style="font-size:13px; margin:8px 0 0;">Best after iteration 1: x = ${format(firstBest.position[0])}, f = ${format(firstBest.fitness)}. Best after iteration 2: x = ${format(secondBest.position[0])}, f = ${format(secondBest.fitness)}.</p>
    `;
  }
}

export function initHandCalcLab(container, onLoadTextbook) {
  return new HandCalcLab(container, onLoadTextbook);
}
