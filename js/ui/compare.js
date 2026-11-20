/**
 * @fileoverview Compare mode (A/B experiment): runs two swarms synchronously with identical
 * initial seeds and positions, allowing direct visual comparison of parameter effects.
 * @module ui/compare
 */

import { PSOEngine } from '../engine/pso.js';
import { ChartRenderer } from './charts.js';

export class CompareManager {
  /**
   * @param {HTMLElement} container
   * @param {Object} baseProblem
   * @param {Object} paramsA
   * @param {Object} paramsB
   */
  constructor(container, baseProblem, paramsA, paramsB) {
    this.container = container;
    this.problem = baseProblem;
    this.paramsA = { ...paramsA };
    this.paramsB = { ...paramsB, topology: 'ring' }; // default difference: Global vs Ring

    this.engineA = null;
    this.engineB = null;
    this.historyA = [];
    this.historyB = [];
    this.chart = null;

    this.initUI();
    this.resetSwarms();
  }

  initUI() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="compare-container" style="padding: 16px;">
        <div style="margin-bottom: 16px;">
          <h2 style="font-size: 1.2rem; font-weight:700; margin:0;">A/B Experiment (Compare Mode)</h2>
          <p class="text-muted" style="margin:4px 0 0; font-size:13px;">
            Run two swarms side by side with the exact same initial positions & seed to isolate parameter impacts.
          </p>
        </div>

        <!-- Controls bar for comparison -->
        <div class="form-row--inline" style="gap:12px; margin-bottom:16px; background:var(--bg-alt, rgba(0,0,0,0.03)); padding:10px 14px; border-radius:8px;">
          <button class="btn btn--primary btn--sm" id="btn-comp-step" type="button">⏩ Step Both Swarms</button>
          <button class="btn btn--secondary btn--sm" id="btn-comp-run" type="button">▶ Run 10 Iterations</button>
          <button class="btn btn--secondary btn--sm" id="btn-comp-reset" type="button">⏮ Reset Both</button>

          <div style="margin-left:auto; display:flex; gap:16px; font-size:12px; font-weight:600;">
            <span style="color:var(--c-accent,#4F46E5);">■ Swarm A (Global)</span>
            <span style="color:var(--c-warning,#F59E0B);">■ Swarm B (Ring)</span>
          </div>
        </div>

        <!-- Dual metric summary cards -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
          <div class="card" style="padding:12px; border:1px solid var(--border,#E3E7EE); border-radius:8px;">
            <div style="font-weight:700; color:var(--c-accent,#4F46E5); margin-bottom:6px;">Swarm A (${this.paramsA.topology || 'global'})</div>
            <div style="font-size:13px;" id="comp-stat-a">Best f: — | Diversity: —</div>
          </div>
          <div class="card" style="padding:12px; border:1px solid var(--border,#E3E7EE); border-radius:8px;">
            <div style="font-weight:700; color:var(--c-warning,#F59E0B); margin-bottom:6px;">Swarm B (${this.paramsB.topology || 'ring'})</div>
            <div style="font-size:13px;" id="comp-stat-b">Best f: — | Diversity: —</div>
          </div>
        </div>

        <!-- Overlaid convergence chart -->
        <div style="background:var(--c-surface-raised); border:1px solid var(--c-border); border-radius:8px; padding:12px;">
          <h4 style="margin:0 0 8px; font-size:13px;">Overlaid Convergence (Best-so-far)</h4>
          <canvas id="comp-convergence-canvas" style="width:100%; height:180px;"></canvas>
        </div>
      </div>
    `;

    const btnStep = this.container.querySelector('#btn-comp-step');
    const btnRun = this.container.querySelector('#btn-comp-run');
    const btnReset = this.container.querySelector('#btn-comp-reset');

    if (btnStep) btnStep.addEventListener('click', () => this.step());
    if (btnRun) {
      btnRun.addEventListener('click', () => {
        for (let i = 0; i < 10; i++) this.step();
      });
    }
    if (btnReset) btnReset.addEventListener('click', () => this.resetSwarms());

    const canvas = this.container.querySelector('#comp-convergence-canvas');
    if (canvas) {
      this.chart = new ChartRenderer(canvas, { type: 'convergence' });
    }
  }

  resetSwarms() {
    const seed = 42;
    const N = 25;
    const D = 2;

    const baseConfig = {
      fn: this.problem.fn,
      domain: this.problem.domain,
      N,
      D,
      seed,
      max_iter: 100
    };

    this.engineA = new PSOEngine({
      ...baseConfig,
      ...this.paramsA,
      seed
    });
    this.engineB = new PSOEngine({
      ...baseConfig,
      ...this.paramsB,
      seed
    });

    this.engineA.initialize();
    this.engineB.initialize();

    this.historyA = [{ iteration: 0, best: this.engineA.getGBest().fitness }];
    this.historyB = [{ iteration: 0, best: this.engineB.getGBest().fitness }];

    this.updateStats();
  }

  step() {
    if (!this.engineA || !this.engineB) return;

    this.engineA.fullIteration();
    this.engineB.fullIteration();

    const gA = this.engineA.getGBest();
    const gB = this.engineB.getGBest();

    this.historyA.push({ iteration: this.historyA.length, best: gA.fitness });
    this.historyB.push({ iteration: this.historyB.length, best: gB.fitness });

    this.updateStats();
  }

  updateStats() {
    if (!this.engineA || !this.engineB) return;

    const gA = this.engineA.getGBest();
    const gB = this.engineB.getGBest();
    const mA = this.engineA.getMetrics();
    const mB = this.engineB.getMetrics();

    const statA = this.container.querySelector('#comp-stat-a');
    const statB = this.container.querySelector('#comp-stat-b');

    if (statA) {
      statA.innerHTML = `Best f: <strong>${gA.fitness.toFixed(4)}</strong> | Diversity: <strong>${mA.diversity.toFixed(3)}</strong>`;
    }
    if (statB) {
      statB.innerHTML = `Best f: <strong>${gB.fitness.toFixed(4)}</strong> | Diversity: <strong>${mB.diversity.toFixed(3)}</strong>`;
    }

    if (this.chart) {
      // Overlaid data
      const merged = this.historyA.map((ha, idx) => {
        const hb = this.historyB[idx] || ha;
        return {
          iteration: ha.iteration,
          best: ha.best,
          mean: hb.best // Use mean slot for second swarm line
        };
      });
      this.chart.setHistory(merged, merged.length - 1);
    }
  }
}

export function initCompareMode(container, problem, paramsA, paramsB) {
  return new CompareManager(container, problem, paramsA, paramsB);
}
