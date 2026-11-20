/**
 * @fileoverview Seeded pseudo-random number generator using the Mulberry32 algorithm.
 * Provides deterministic, reproducible random sequences for PSO simulations.
 * @module engine/rng
 */

/**
 * Seeded PRNG based on the Mulberry32 algorithm.
 * Produces deterministic sequences from a 32-bit integer seed.
 */
export class RNG {
  /**
   * @param {number} seed - Integer seed for the generator.
   */
  constructor(seed) {
    /** @private */
    this._state = seed | 0;
  }

  /**
   * Generate the next pseudo-random number in [0, 1).
   * @returns {number} A floating-point number in [0, 1).
   */
  next() {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Snapshot the current internal state for later restoration.
   * @returns {number} The internal state integer.
   */
  getState() {
    return this._state;
  }

  /**
   * Restore a previously saved state.
   * @param {number} state - A state value returned by getState().
   */
  setState(state) {
    this._state = state | 0;
  }
}
