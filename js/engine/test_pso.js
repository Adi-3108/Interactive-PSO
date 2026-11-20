/**
 * Textbook verification test for PSOEngine.
 * Problem: f(x)=x², 1D, N=3, w=0.5, c1=c2=1, manual r1=r2=0.5, synchronous, no vmax, no boundary
 * Init: x=[4,-3,2], v=[0,0,0]
 */

import { PSOEngine } from './pso.js';

function assert(condition, msg) {
  if (!condition) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function approxEq(a, b, eps = 1e-10) {
  return Math.abs(a - b) < eps;
}

const engine = new PSOEngine({
  fn: (x, _y) => x * x,
  domain: [[-5, 5]],
  N: 3,
  D: 1,
  w: 0.5,
  c1: 1,
  c2: 1,
  vmax_pct: 0,  // no vmax
  boundary: 'none',
  topology: 'global',
  constriction: false,
  update_mode: 'sync',
  max_iter: 100,
  tolerance: 0,
  seed: 42,
  manual_random: true,
  manual_r1: 0.5,
  manual_r2: 0.5,
  init_positions: [[4], [-3], [2]],
  init_velocities: [[0], [0], [0]]
});

engine.initialize();

// --- Check initialization ---
const initP = engine.getParticles();
console.log('=== After initialization ===');
for (const p of initP) {
  console.log(`P${p.id+1}: x=${p.x[0]}, v=${p.v[0]}, fitness=${p.fitness}, pbest=${p.pbest[0]}, pbest_f=${p.pbest_fitness}`);
}
const initG = engine.getGBest();
console.log(`gbest: pos=${initG.position[0]}, fitness=${initG.fitness}, from P${initG.particle_id+1}`);

assert(approxEq(initP[0].x[0], 4), 'Init P1 x');
assert(approxEq(initP[1].x[0], -3), 'Init P2 x');
assert(approxEq(initP[2].x[0], 2), 'Init P3 x');
assert(approxEq(initP[0].fitness, 16), 'Init P1 fitness');
assert(approxEq(initP[1].fitness, 9), 'Init P2 fitness');
assert(approxEq(initP[2].fitness, 4), 'Init P3 fitness');
assert(approxEq(initG.position[0], 2), 'Init gbest pos');
assert(approxEq(initG.fitness, 4), 'Init gbest fitness');
assert(initG.particle_id === 2, 'Init gbest particle (index 2 = P3)');

// --- Iteration 1 ---
console.log('\n=== Iteration 1 ===');
const iter1 = engine.fullIteration();

const p1 = engine.getParticles();
const g1 = engine.getGBest();

for (const p of p1) {
  console.log(`P${p.id+1}: x=${p.x[0]}, v=${p.v[0]}, fitness=${p.fitness}, pbest=${p.pbest[0]}, pbest_f=${p.pbest_fitness}, improved=${p.improved}`);
}
console.log(`gbest: pos=${g1.position[0]}, fitness=${g1.fitness}, from P${g1.particle_id+1}`);

// Expected Iteration 1:
// P1: v'=-1, x'=3, f=9, pbest=3 (9<16)
// P2: v'=2.5, x'=-0.5, f=0.25, pbest=-0.5 (0.25<9)
// P3: v'=0, x'=2, f=4, pbest=2 (4 not < 4)
// gbest=-0.5, f=0.25, from P2

assert(approxEq(p1[0].v[0], -1), `Iter1 P1 v: expected -1, got ${p1[0].v[0]}`);
assert(approxEq(p1[0].x[0], 3), `Iter1 P1 x: expected 3, got ${p1[0].x[0]}`);
assert(approxEq(p1[0].fitness, 9), `Iter1 P1 f: expected 9, got ${p1[0].fitness}`);
assert(approxEq(p1[0].pbest[0], 3), `Iter1 P1 pbest: expected 3, got ${p1[0].pbest[0]}`);

assert(approxEq(p1[1].v[0], 2.5), `Iter1 P2 v: expected 2.5, got ${p1[1].v[0]}`);
assert(approxEq(p1[1].x[0], -0.5), `Iter1 P2 x: expected -0.5, got ${p1[1].x[0]}`);
assert(approxEq(p1[1].fitness, 0.25), `Iter1 P2 f: expected 0.25, got ${p1[1].fitness}`);
assert(approxEq(p1[1].pbest[0], -0.5), `Iter1 P2 pbest: expected -0.5, got ${p1[1].pbest[0]}`);

assert(approxEq(p1[2].v[0], 0), `Iter1 P3 v: expected 0, got ${p1[2].v[0]}`);
assert(approxEq(p1[2].x[0], 2), `Iter1 P3 x: expected 2, got ${p1[2].x[0]}`);
assert(approxEq(p1[2].fitness, 4), `Iter1 P3 f: expected 4, got ${p1[2].fitness}`);
assert(approxEq(p1[2].pbest[0], 2), `Iter1 P3 pbest: expected 2, got ${p1[2].pbest[0]}`);

assert(approxEq(g1.position[0], -0.5), `Iter1 gbest pos: expected -0.5, got ${g1.position[0]}`);
assert(approxEq(g1.fitness, 0.25), `Iter1 gbest fitness: expected 0.25, got ${g1.fitness}`);
assert(g1.particle_id === 1, `Iter1 gbest particle: expected 1 (P2), got ${g1.particle_id}`);

// --- Iteration 2 ---
console.log('\n=== Iteration 2 ===');
const iter2 = engine.fullIteration();

const p2 = engine.getParticles();
const g2 = engine.getGBest();

for (const p of p2) {
  console.log(`P${p.id+1}: x=${p.x[0]}, v=${p.v[0]}, fitness=${p.fitness}, pbest=${p.pbest[0]}, pbest_f=${p.pbest_fitness}, improved=${p.improved}`);
}
console.log(`gbest: pos=${g2.position[0]}, fitness=${g2.fitness}, from P${g2.particle_id+1}`);

// Expected Iteration 2:
// P1: v'=-2.25, x'=0.75, f=0.5625, pbest=0.75
// P2: v'=1.25, x'=0.75, f=0.5625, pbest=-0.5 kept (0.5625 not < 0.25)
// P3: v'=-1.25, x'=0.75, f=0.5625, pbest=0.75
// gbest stays at -0.5 (f=0.25)

assert(approxEq(p2[0].v[0], -2.25), `Iter2 P1 v: expected -2.25, got ${p2[0].v[0]}`);
assert(approxEq(p2[0].x[0], 0.75), `Iter2 P1 x: expected 0.75, got ${p2[0].x[0]}`);
assert(approxEq(p2[0].fitness, 0.5625), `Iter2 P1 f: expected 0.5625, got ${p2[0].fitness}`);
assert(approxEq(p2[0].pbest[0], 0.75), `Iter2 P1 pbest: expected 0.75, got ${p2[0].pbest[0]}`);

assert(approxEq(p2[1].v[0], 1.25), `Iter2 P2 v: expected 1.25, got ${p2[1].v[0]}`);
assert(approxEq(p2[1].x[0], 0.75), `Iter2 P2 x: expected 0.75, got ${p2[1].x[0]}`);
assert(approxEq(p2[1].fitness, 0.5625), `Iter2 P2 f: expected 0.5625, got ${p2[1].fitness}`);
assert(approxEq(p2[1].pbest[0], -0.5), `Iter2 P2 pbest: expected -0.5, got ${p2[1].pbest[0]}`);

assert(approxEq(p2[2].v[0], -1.25), `Iter2 P3 v: expected -1.25, got ${p2[2].v[0]}`);
assert(approxEq(p2[2].x[0], 0.75), `Iter2 P3 x: expected 0.75, got ${p2[2].x[0]}`);
assert(approxEq(p2[2].fitness, 0.5625), `Iter2 P3 f: expected 0.5625, got ${p2[2].fitness}`);
assert(approxEq(p2[2].pbest[0], 0.75), `Iter2 P3 pbest: expected 0.75, got ${p2[2].pbest[0]}`);

assert(approxEq(g2.position[0], -0.5), `Iter2 gbest pos: expected -0.5, got ${g2.position[0]}`);
assert(approxEq(g2.fitness, 0.25), `Iter2 gbest fitness: expected 0.25, got ${g2.fitness}`);
assert(g2.particle_id === 1, `Iter2 gbest particle: expected 1 (P2), got ${g2.particle_id}`);

console.log('\n✅ ALL TEXTBOOK VERIFICATION TESTS PASSED!');
