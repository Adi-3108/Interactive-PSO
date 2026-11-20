/**
 * @fileoverview Deterministic Particle Swarm Optimization engine.
 * A pure state-machine with serializable state, no DOM references.
 * Supports micro-step granularity, synchronous/asynchronous updates,
 * multiple topologies, boundary handling strategies, and constriction.
 * @module engine/pso
 */

import { RNG } from './rng.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Deep-clone via JSON round-trip.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Micro-step names in order within one iteration (overview mode).
 * @type {string[]}
 */
const OVERVIEW_STEPS = [
  'compute_velocity',
  'move',
  'evaluate',
  'update_pbest',
  'update_gbest',
  'check_stop'
];
const MICRO_STEPS = OVERVIEW_STEPS;

// ─── PSOEngine ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PSOConfig
 * @property {function(number, number): number} fn - Objective function.
 * @property {number[][]} domain - [[xmin,xmax], [ymin,ymax]].
 * @property {number} N - Number of particles.
 * @property {number} D - Number of dimensions.
 * @property {number} w - Inertia weight (or w_max when using linear decay).
 * @property {number} c1 - Cognitive coefficient.
 * @property {number} c2 - Social coefficient.
 * @property {number} [vmax_pct=1] - Vmax as fraction of domain range per dimension.
 * @property {string} [boundary='none'] - 'none' | 'clamp' | 'reflect' | 'absorb'.
 * @property {string} [topology='global'] - 'global' | 'ring'.
 * @property {boolean} [constriction=false] - Use Clerc-Kennedy constriction factor.
 * @property {string} [update_mode='sync'] - 'sync' | 'async'.
 * @property {number} [max_iter=100] - Maximum iterations.
 * @property {number} [tolerance=0] - Stop when gbest fitness <= tolerance.
 * @property {number} [seed=42] - RNG seed.
 * @property {boolean} [manual_random=false] - Use manual r1/r2 values instead of RNG.
 * @property {number} [manual_r1=0.5] - Manual r1 value.
 * @property {number} [manual_r2=0.5] - Manual r2 value.
 * @property {number} [w_min] - Minimum inertia for linear decay.
 * @property {number} [w_max] - Maximum inertia for linear decay.
 * @property {string} [inertia_schedule='constant'] - 'constant' | 'linear'.
 * @property {number[][]} [init_positions] - Optional initial positions.
 * @property {number[][]} [init_velocities] - Optional initial velocities.
 */

export class PSOEngine {
  /**
   * @param {PSOConfig} config
   */
  constructor(config) {
    this.config = { ...config };
    const c = this.config;

    // Defaults
    if (c.w === undefined) c.w = 0.7;
    if (c.c1 === undefined) c.c1 = 1.5;
    if (c.c2 === undefined) c.c2 = 1.5;
    if (c.N === undefined) c.N = 20;
    if (c.D === undefined) c.D = c.domain ? c.domain.length : 2;
    if (c.vmax_pct === undefined || c.vmax_pct === null) c.vmax_pct = 0.2;
    if (!c.boundary) c.boundary = 'none';
    if (!c.topology) c.topology = 'global';
    if (c.constriction === undefined) c.constriction = false;
    if (!c.update_mode) c.update_mode = 'sync';
    if (!c.max_iter) c.max_iter = 100;
    if (c.tolerance === undefined) c.tolerance = 0;
    if (c.seed === undefined) c.seed = 42;
    if (c.manual_random === undefined) c.manual_random = false;
    if (c.manual_r1 === undefined) c.manual_r1 = 0.5;
    if (c.manual_r2 === undefined) c.manual_r2 = 0.5;
    if (!c.inertia_schedule) c.inertia_schedule = 'constant';
    if (c.w_max === undefined) c.w_max = c.w;
    if (c.w_min === undefined) c.w_min = c.w;

    // Compute Vmax per dimension
    /** @type {number[]} */
    this._vmax = [];
    for (let d = 0; d < c.D; d++) {
      const domIdx = Math.min(d, c.domain.length - 1);
      const range = c.domain[domIdx][1] - c.domain[domIdx][0];
      this._vmax.push(c.vmax_pct > 0 ? c.vmax_pct * range : Infinity);
    }

    // Compute constriction factor if applicable
    /** @type {number} */
    this._chi = 1;
    if (c.constriction) {
      const phi = c.c1 + c.c2;
      if (phi > 4) {
        this._chi = 2 / Math.abs(2 - phi - Math.sqrt(phi * phi - 4 * phi));
      }
    }

    // Internal state — populated by initialize()
    /** @type {Array<Object>} */
    this._particles = [];
    /** @type {{position: number[], fitness: number, particle_id: number}} */
    this._gbest = null;
    /** @type {number} */
    this._iteration = 0;
    /** @type {number} Index into MICRO_STEPS for current micro-step. */
    this._microIndex = 0;
    /** @type {boolean} */
    this._finished = false;
    /** @type {RNG} */
    this._rng = new RNG(c.seed);
    /** @type {Object|null} Last force decomposition cache */
    this._lastForces = null;
  }

  // ─── Initialization ───────────────────────────────────────────────────

  /**
   * Initialize iteration 0: create particles, evaluate, set pbest and gbest.
   */
  initialize() {
    const c = this.config;
    this._rng = new RNG(c.seed);
    this._iteration = 0;
    this._microIndex = 0;
    this._finished = false;
    this._particles = [];

    for (let i = 0; i < c.N; i++) {
      // Position
      const x = [];
      if (c.init_positions && c.init_positions[i]) {
        for (let d = 0; d < c.D; d++) {
          x.push(c.init_positions[i][d]);
        }
      } else {
        for (let d = 0; d < c.D; d++) {
          const domIdx = Math.min(d, c.domain.length - 1);
          const lo = c.domain[domIdx][0];
          const hi = c.domain[domIdx][1];
          x.push(lo + this._rng.next() * (hi - lo));
        }
      }

      // Velocity
      const v = [];
      if (c.init_velocities && c.init_velocities[i]) {
        for (let d = 0; d < c.D; d++) {
          v.push(c.init_velocities[i][d]);
        }
      } else {
        for (let d = 0; d < c.D; d++) {
          if (this._vmax[d] === Infinity) {
            v.push(0);
          } else {
            v.push(-this._vmax[d] + this._rng.next() * 2 * this._vmax[d]);
          }
        }
      }

      const fitness = this._evaluate(x);
      this._particles.push({
        id: i,
        x: x,
        v: v,
        fitness: fitness,
        pbest: x.slice(),
        pbest_fitness: fitness,
        improved: false
      });
    }

    // Set gbest from initial pbest values
    this._updateGlobalBest(true);
  }

  // ─── Evaluation helper ────────────────────────────────────────────────

  /**
   * Evaluate the objective function at a position.
   * @param {number[]} pos
   * @returns {number}
   */
  _evaluate(pos) {
    const x = pos[0] !== undefined ? pos[0] : 0;
    const y = pos.length > 1 ? pos[1] : 0;
    return this.config.fn(x, y);
  }

  // ─── Inertia weight ───────────────────────────────────────────────────

  /**
   * Get the current inertia weight for this iteration.
   * @returns {number}
   */
  _getW() {
    const c = this.config;
    if (c.inertia_schedule === 'linear') {
      const frac = Math.min(this._iteration / Math.max(c.max_iter - 1, 1), 1);
      return c.w_max - frac * (c.w_max - c.w_min);
    }
    return c.w;
  }

  // ─── Neighbourhood best ───────────────────────────────────────────────

  /**
   * Get the best-known position (gbest or lbest) relevant to a particle.
   * @param {number} particleIndex
   * @returns {{position: number[], fitness: number, particle_id: number}}
   */
  _getNeighbourhoodBest(particleIndex) {
    if (this.config.topology === 'ring') {
      const N = this._particles.length;
      const left = (particleIndex - 1 + N) % N;
      const right = (particleIndex + 1) % N;
      const neighbours = [left, particleIndex, right];
      let best = null;
      for (const idx of neighbours) {
        const p = this._particles[idx];
        if (best === null || p.pbest_fitness < best.fitness) {
          best = { position: p.pbest.slice(), fitness: p.pbest_fitness, particle_id: p.id };
        }
      }
      return best;
    }
    // Global topology
    return { ...this._gbest, position: this._gbest.position.slice() };
  }

  /**
   * Update the global best from all particles' pbest values.
   * @param {boolean} [force=false] - If true, always set (for initialization).
   */
  _updateGlobalBest(force = false) {
    for (const p of this._particles) {
      if (force && this._gbest === null) {
        this._gbest = {
          position: p.pbest.slice(),
          fitness: p.pbest_fitness,
          particle_id: p.id
        };
      } else if (p.pbest_fitness < this._gbest.fitness) {
        this._gbest = {
          position: p.pbest.slice(),
          fitness: p.pbest_fitness,
          particle_id: p.id
        };
      }
    }
  }

  // ─── Boundary handling ────────────────────────────────────────────────

  /**
   * Apply boundary handling to a particle after a move.
   * @param {Object} particle - The particle to bound.
   */
  _applyBoundary(particle) {
    const c = this.config;
    if (c.boundary === 'none') return;

    for (let d = 0; d < c.D; d++) {
      const domIdx = Math.min(d, c.domain.length - 1);
      const lo = c.domain[domIdx][0];
      const hi = c.domain[domIdx][1];

      if (particle.x[d] < lo || particle.x[d] > hi) {
        switch (c.boundary) {
          case 'clamp':
            particle.x[d] = Math.max(lo, Math.min(hi, particle.x[d]));
            break;
          case 'reflect':
            if (particle.x[d] < lo) {
              particle.x[d] = lo + (lo - particle.x[d]);
              particle.v[d] = -particle.v[d];
            } else if (particle.x[d] > hi) {
              particle.x[d] = hi - (particle.x[d] - hi);
              particle.v[d] = -particle.v[d];
            }
            // If still out after one reflection, clamp
            particle.x[d] = Math.max(lo, Math.min(hi, particle.x[d]));
            break;
          case 'absorb':
            particle.x[d] = Math.max(lo, Math.min(hi, particle.x[d]));
            particle.v[d] = 0;
            break;
        }
      }
    }
  }

  // ─── Micro-step engine ────────────────────────────────────────────────

  /**
   * Advance one micro-step in the current iteration.
   * @returns {{type: string, iteration: number, particle_index: number|null, details: Object}}
   */
  microStep() {
    if (this._finished) {
      return { type: 'finished', iteration: this._iteration, particle_index: null, details: {} };
    }

    const stepType = MICRO_STEPS[this._microIndex];
    let result;

    switch (stepType) {
      case 'evaluate':
        result = this._stepEvaluate();
        break;
      case 'update_pbest':
        result = this._stepUpdatePbest();
        break;
      case 'update_gbest':
        result = this._stepUpdateGbest();
        break;
      case 'compute_velocity':
        result = this._stepComputeVelocity();
        break;
      case 'move':
        result = this._stepMove();
        break;
      case 'check_stop':
        result = this._stepCheckStop();
        break;
      default:
        throw new Error(`Unknown micro-step: ${stepType}`);
    }

    // Advance micro-step index
    this._microIndex++;
    if (this._microIndex >= MICRO_STEPS.length) {
      this._microIndex = 0;
      this._iteration++;
    }

    return result;
  }

  /**
   * Advance one full iteration (all micro-steps).
   * @returns {Array<{type: string, iteration: number, particle_index: number|null, details: Object}>}
   */
  fullIteration() {
    const results = [];
    const startIter = this._iteration;
    // Run micro-steps until iteration counter advances (or finished)
    do {
      results.push(this.microStep());
    } while (this._iteration === startIter && !this._finished);
    return results;
  }

  // ─── Individual micro-step implementations ────────────────────────────

  /** Evaluate f(x_i) for all particles. */
  _stepEvaluate() {
    const details = [];
    for (const p of this._particles) {
      p.fitness = this._evaluate(p.x);
      details.push({ id: p.id, x: p.x.slice(), fitness: p.fitness });
    }
    return { type: 'evaluate', iteration: this._iteration, particle_index: null, details };
  }

  /** Compare f(x_i) to f(p_i), update pbest if strictly less. */
  _stepUpdatePbest() {
    const details = [];
    for (const p of this._particles) {
      if (p.fitness < p.pbest_fitness) {
        p.pbest = p.x.slice();
        p.pbest_fitness = p.fitness;
        p.improved = true;
        details.push({ id: p.id, improved: true, new_pbest: p.pbest.slice(), new_pbest_fitness: p.pbest_fitness });
      } else {
        p.improved = false;
        details.push({ id: p.id, improved: false });
      }
    }
    return { type: 'update_pbest', iteration: this._iteration, particle_index: null, details };
  }

  /** Find new global (or neighbourhood) best. */
  _stepUpdateGbest() {
    const oldFitness = this._gbest.fitness;
    const oldPos = this._gbest.position.slice();
    this._updateGlobalBest(false);
    const changed = this._gbest.fitness < oldFitness;
    return {
      type: 'update_gbest',
      iteration: this._iteration,
      particle_index: null,
      details: {
        changed,
        gbest: { position: this._gbest.position.slice(), fitness: this._gbest.fitness, particle_id: this._gbest.particle_id },
        previous: { position: oldPos, fitness: oldFitness }
      }
    };
  }

  /** Compute velocities for all particles. */
  _stepComputeVelocity() {
    const c = this.config;
    const w = this._getW();
    const details = [];

    // In synchronous mode, capture gbest BEFORE any updates
    // (neighbourhood best is computed per-particle for ring topology)

    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      const nbest = this._getNeighbourhoodBest(i);
      const newV = [];
      const inertia = [];
      const cognitive = [];
      const social = [];

      for (let d = 0; d < c.D; d++) {
        const r1 = c.manual_random ? c.manual_r1 : this._rng.next();
        const r2 = c.manual_random ? c.manual_r2 : this._rng.next();

        const inertiaTerm = w * p.v[d];
        const cognitiveTerm = c.c1 * r1 * (p.pbest[d] - p.x[d]);
        const socialTerm = c.c2 * r2 * (nbest.position[d] - p.x[d]);

        let vd = inertiaTerm + cognitiveTerm + socialTerm;

        // Apply constriction
        if (c.constriction) {
          vd *= this._chi;
        }

        // Velocity clamp (BEFORE adding to position)
        if (this._vmax[d] !== Infinity) {
          vd = Math.max(-this._vmax[d], Math.min(this._vmax[d], vd));
        }

        newV.push(vd);
        inertia.push(inertiaTerm);
        cognitive.push(cognitiveTerm);
        social.push(socialTerm);
      }

      // Store the force decomposition for this particle
      p._forces = {
        inertia: inertia.slice(),
        cognitive: cognitive.slice(),
        social: social.slice(),
        resultant: newV.slice()
      };

      p.v = newV;

      details.push({
        id: p.id,
        v: newV.slice(),
        w,
        inertia: inertia.slice(),
        cognitive: cognitive.slice(),
        social: social.slice(),
        nbest_pos: nbest.position.slice()
      });
    }

    return { type: 'compute_velocity', iteration: this._iteration, particle_index: null, details };
  }

  /** Apply velocity to position, handle boundaries. */
  _stepMove() {
    const c = this.config;
    const details = [];

    for (const p of this._particles) {
      const oldX = p.x.slice();

      for (let d = 0; d < c.D; d++) {
        p.x[d] = p.x[d] + p.v[d];
      }

      this._applyBoundary(p);

      // Re-evaluate after move
      p.fitness = this._evaluate(p.x);

      details.push({
        id: p.id,
        old_x: oldX,
        new_x: p.x.slice(),
        new_v: p.v.slice(),
        fitness: p.fitness
      });

      // Async mode: update pbest and gbest immediately after each particle
      if (c.update_mode === 'async') {
        if (p.fitness < p.pbest_fitness) {
          p.pbest = p.x.slice();
          p.pbest_fitness = p.fitness;
          p.improved = true;
        }
        this._updateGlobalBest(false);
      }
    }

    return { type: 'move', iteration: this._iteration, particle_index: null, details };
  }

  /** Check stopping criteria. */
  _stepCheckStop() {
    const c = this.config;
    const reasons = [];

    if (this._iteration + 1 >= c.max_iter) {
      reasons.push('max_iterations');
    }
    if (c.tolerance > 0 && this._gbest.fitness <= c.tolerance) {
      reasons.push('tolerance');
    }

    if (reasons.length > 0) {
      this._finished = true;
    }

    return {
      type: 'check_stop',
      iteration: this._iteration,
      particle_index: null,
      details: {
        finished: this._finished,
        reasons,
        iteration: this._iteration,
        gbest_fitness: this._gbest.fitness
      }
    };
  }

  // ─── State serialization ──────────────────────────────────────────────

  /**
   * Return the complete serializable state (deep clone).
   * @returns {Object}
   */
  getState() {
    return deepClone({
      particles: this._particles.map(p => ({
        id: p.id,
        x: p.x,
        v: p.v,
        fitness: p.fitness,
        pbest: p.pbest,
        pbest_fitness: p.pbest_fitness,
        improved: p.improved,
        _forces: p._forces || null
      })),
      gbest: this._gbest,
      iteration: this._iteration,
      micro_step: this._microIndex,
      rng_state: this._rng.getState(),
      finished: this._finished
    });
  }

  /**
   * Restore from a previously saved state snapshot.
   * @param {Object} state
   */
  setState(state) {
    const s = deepClone(state);
    this._particles = s.particles;
    this._gbest = s.gbest;
    this._iteration = s.iteration;
    this._microIndex = s.micro_step;
    this._rng.setState(s.rng_state);
    this._finished = s.finished;
  }

  /**
   * Check if the simulation has finished.
   * @returns {boolean}
   */
  isFinished() {
    return this._finished;
  }

  // ─── Accessors ────────────────────────────────────────────────────────

  /**
   * Return array of particle states.
   * @returns {Array<{id: number, x: number[], v: number[], fitness: number, pbest: number[], pbest_fitness: number, improved: boolean}>}
   */
  getParticles() {
    return this._particles.map(p => ({
      id: p.id,
      x: p.x.slice(),
      v: p.v.slice(),
      fitness: p.fitness,
      pbest: p.pbest.slice(),
      pbest_fitness: p.pbest_fitness,
      improved: p.improved
    }));
  }

  /**
   * Return the current global best.
   * @returns {{position: number[], fitness: number, particle_id: number}}
   */
  getGBest() {
    return {
      position: this._gbest.position.slice(),
      fitness: this._gbest.fitness,
      particle_id: this._gbest.particle_id
    };
  }

  /**
   * Return aggregate metrics for the swarm.
   * @returns {{diversity: number, mean_fitness: number, best_fitness: number, worst_fitness: number, mean_speed: number}}
   */
  getMetrics() {
    const particles = this._particles;
    const N = particles.length;
    const D = this.config.D;

    // Fitness stats
    let sumF = 0, bestF = Infinity, worstF = -Infinity;
    for (const p of particles) {
      sumF += p.fitness;
      if (p.fitness < bestF) bestF = p.fitness;
      if (p.fitness > worstF) worstF = p.fitness;
    }

    // Mean speed (average velocity magnitude)
    let sumSpeed = 0;
    for (const p of particles) {
      let speedSq = 0;
      for (let d = 0; d < D; d++) {
        speedSq += p.v[d] * p.v[d];
      }
      sumSpeed += Math.sqrt(speedSq);
    }

    // Diversity: average distance from the swarm centroid
    const centroid = new Array(D).fill(0);
    for (const p of particles) {
      for (let d = 0; d < D; d++) {
        centroid[d] += p.x[d] / N;
      }
    }
    let sumDist = 0;
    for (const p of particles) {
      let distSq = 0;
      for (let d = 0; d < D; d++) {
        const diff = p.x[d] - centroid[d];
        distSq += diff * diff;
      }
      sumDist += Math.sqrt(distSq);
    }

    return {
      diversity: sumDist / N,
      mean_fitness: sumF / N,
      best_fitness: bestF,
      worst_fitness: worstF,
      mean_speed: sumSpeed / N
    };
  }

  /**
   * Return the force decomposition for a specific particle.
   * Shows the inertia, cognitive, social, and resultant vectors from the
   * most recent velocity computation.
   * @param {number} particleIndex
   * @returns {{inertia: number[], cognitive: number[], social: number[], resultant: number[]}}
   */
  getForceDecomposition(particleIndex) {
    const p = this._particles[particleIndex];
    if (!p || !p._forces) {
      const D = this.config.D;
      const zeros = new Array(D).fill(0);
      return { inertia: zeros, cognitive: zeros.slice(), social: zeros.slice(), resultant: zeros.slice() };
    }
    return deepClone(p._forces);
  }
}
