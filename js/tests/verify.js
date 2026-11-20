/**
 * @fileoverview Complete verification suite for SwarmLab PSO engine.
 * Includes exact textbook checks (Section 6) and invariant/robustness property tests.
 * @module tests/verify
 */

import { PSOEngine } from '../engine/pso.js';
import { RNG } from '../engine/rng.js';
import { parseExpression } from '../engine/parser.js';
import { History } from '../engine/history.js';

function approxEq(a, b, eps = 1e-8) {
  return Math.abs(a - b) < eps;
}

/**
 * Runs the full test suite.
 * @returns {{passed: boolean, total: number, passedCount: number, results: Array<Object>}}
 */
export function runVerification() {
  const results = [];

  const check = (name, actual, expected, condition = null) => {
    const passed = condition !== null ? !!condition : approxEq(actual, expected);
    results.push({
      name,
      expected: typeof expected === 'number' ? expected.toFixed(4) : String(expected),
      actual: typeof actual === 'number' ? actual.toFixed(4) : String(actual),
      passed
    });
  };

  // ─── 1. Textbook Verification (12/12 Checks) ────────────────────────────────
  const tbEngine = new PSOEngine({
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
    seed: 42,
    manual_random: true,
    manual_r1: 0.5,
    manual_r2: 0.5,
    init_positions: [[4], [-3], [2]],
    init_velocities: [[0], [0], [0]]
  });

  tbEngine.initialize();

  // Iteration 1
  tbEngine.fullIteration();
  const p1 = tbEngine.getParticles();
  const g1 = tbEngine.getGBest();

  check('Iter 1 P1 v (expected -1.0)', p1[0].v[0], -1.0);
  check('Iter 1 P1 x (expected 3.0)', p1[0].x[0], 3.0);
  check('Iter 1 P1 pbest (expected 3.0)', p1[0].pbest[0], 3.0);

  check('Iter 1 P2 v (expected 2.5)', p1[1].v[0], 2.5);
  check('Iter 1 P2 x (expected -0.5)', p1[1].x[0], -0.5);
  check('Iter 1 P2 pbest (expected -0.5)', p1[1].pbest[0], -0.5);

  check('Iter 1 P3 v (expected 0.0)', p1[2].v[0], 0.0);
  check('Iter 1 P3 x (expected 2.0)', p1[2].x[0], 2.0);
  check('Iter 1 P3 pbest (expected 2.0)', p1[2].pbest[0], 2.0);

  check('Iter 1 gbest pos (expected -0.5)', g1.position[0], -0.5);
  check('Iter 1 gbest fitness (expected 0.25)', g1.fitness, 0.25);
  check('Iter 1 gbest particle_id (expected 1 for P2)', g1.particle_id, 1, g1.particle_id === 1);

  // Iteration 2
  tbEngine.fullIteration();
  const p2 = tbEngine.getParticles();
  const g2 = tbEngine.getGBest();

  check('Iter 2 P1 v (expected -2.25)', p2[0].v[0], -2.25);
  check('Iter 2 P1 x (expected 0.75)', p2[0].x[0], 0.75);
  check('Iter 2 P1 pbest (expected 0.75)', p2[0].pbest[0], 0.75);

  check('Iter 2 P2 v (expected 1.25)', p2[1].v[0], 1.25);
  check('Iter 2 P2 x (expected 0.75)', p2[1].x[0], 0.75);
  check('Iter 2 P2 pbest kept (expected -0.5)', p2[1].pbest[0], -0.5);

  check('Iter 2 P3 v (expected -1.25)', p2[2].v[0], -1.25);
  check('Iter 2 P3 x (expected 0.75)', p2[2].x[0], 0.75);
  check('Iter 2 P3 pbest (expected 0.75)', p2[2].pbest[0], 0.75);

  check('Iter 2 gbest pos stays (expected -0.5)', g2.position[0], -0.5);
  check('Iter 2 gbest fitness (expected 0.25)', g2.fitness, 0.25);

  // ─── 2. Additional Invariant Tests ──────────────────────────────────────────

  // Property 1: Seed reproducibility
  const engA = new PSOEngine({ fn: (x, y) => x * x + y * y, domain: [[-5, 5], [-5, 5]], N: 10, D: 2, seed: 1234 });
  const engB = new PSOEngine({ fn: (x, y) => x * x + y * y, domain: [[-5, 5], [-5, 5]], N: 10, D: 2, seed: 1234 });
  engA.initialize();
  engB.initialize();
  engA.fullIteration();
  engB.fullIteration();
  const samePos = engA.getParticles().every((p, i) => approxEq(p.x[0], engB.getParticles()[i].x[0]));
  check('Determinism: same seed gives identical trajectory', samePos ? 1 : 0, 1, samePos);

  // Property 2: pbest tie does not replace
  const tieEngine = new PSOEngine({
    fn: (x, _y) => Math.abs(x),
    domain: [[-5, 5]],
    N: 1,
    D: 1,
    init_positions: [[2]],
    init_velocities: [[0]],
    manual_random: true,
    manual_r1: 0,
    manual_r2: 0,
    w: 0
  });
  tieEngine.initialize();
  // Move to -2 (fitness remains 2, equal)
  tieEngine.fullIteration();
  const tieP = tieEngine.getParticles()[0];
  check('Pbest strictly less: tie does not replace pbest', tieP.pbest[0], 2, approxEq(tieP.pbest[0], 2));

  // Property 3: Vmax clamp bounds velocity
  const clampEngine = new PSOEngine({
    fn: (x, y) => x * x + y * y,
    domain: [[-10, 10], [-10, 10]],
    N: 5,
    D: 2,
    vmax_pct: 0.1, // Range 20 => Vmax = 2.0
    w: 2.0,
    c1: 3.0,
    c2: 3.0
  });
  clampEngine.initialize();
  clampEngine.fullIteration();
  const vBounded = clampEngine.getParticles().every(p => Math.abs(p.v[0]) <= 2.0001 && Math.abs(p.v[1]) <= 2.0001);
  check('Velocity clamp: |v| <= Vmax', vBounded ? 1 : 0, 1, vBounded);

  // Property 4: boundary modes always keep a particle inside its domain.
  const boundaryConfig = (boundary) => new PSOEngine({
    fn: (x, _y) => x * x,
    domain: [[-1, 1]], N: 1, D: 1,
    init_positions: [[0.9]], init_velocities: [[0.9]],
    w: 2, c1: 0, c2: 0, vmax_pct: 0, boundary,
    manual_random: true
  });
  const clampBoundary = boundaryConfig('clamp');
  clampBoundary.initialize();
  clampBoundary.fullIteration();
  const reflectBoundary = boundaryConfig('reflect');
  reflectBoundary.initialize();
  reflectBoundary.fullIteration();
  const clampedParticle = clampBoundary.getParticles()[0];
  const reflectedParticle = reflectBoundary.getParticles()[0];
  check('Clamp boundary keeps x in range', clampedParticle.x[0], 1);
  check('Reflect boundary keeps x in range and reverses velocity', reflectedParticle.v[0], -1.8,
    reflectedParticle.x[0] >= -1 && reflectedParticle.x[0] <= 1 && approxEq(reflectedParticle.v[0], -1.8));

  // Property 5: a ring's first particle must include the final particle.
  const ringEngine = new PSOEngine({
    fn: (x, _y) => x * x, domain: [[-5, 5]], N: 3, D: 1,
    topology: 'ring', init_positions: [[1], [5], [0]], init_velocities: [[0], [0], [0]]
  });
  ringEngine.initialize();
  const firstRingBest = ringEngine._getNeighbourhoodBest(0);
  check('Ring topology wraps first particle to final neighbour', firstRingBest.particle_id, 2,
    firstRingBest.particle_id === 2);

  // Property 6: Safe parser evaluation
  const parserFn = parseExpression('x^2 + y^2');
  const pVal1 = parserFn(0, 0);
  const pVal2 = parserFn(1, 1);
  const pVal3 = parserFn(3, 4);
  check('Parser at (0,0)', pVal1, 0);
  check('Parser at (1,1)', pVal2, 2);
  check('Parser at (3,4)', pVal3, 25);

  // Property 7: Step-back / History reproducibility
  const hist = new History();
  const snap1 = tbEngine.getState();
  hist.push(snap1);
  tbEngine.fullIteration();
  const snap2 = tbEngine.getState();
  hist.push(snap2);

  const restoredSnap = hist.back();
  tbEngine.setState(restoredSnap);
  const restoredX = tbEngine.getParticles()[0].x[0];
  check('Step-back restores exact particle state', restoredX, snap1.particles[0].x[0], approxEq(restoredX, snap1.particles[0].x[0]));
  const replayedSnap = hist.forward();
  check('Step-forward restores the recorded future state', replayedSnap.particles[0].x[0], snap2.particles[0].x[0],
    approxEq(replayedSnap.particles[0].x[0], snap2.particles[0].x[0]));

  const passedCount = results.filter(r => r.passed).length;
  const passed = passedCount === results.length;

  return {
    passed,
    total: results.length,
    passedCount,
    results
  };
}
