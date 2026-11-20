/**
 * @fileoverview History stack for step-back / step-forward in PSO simulation.
 * Stores deep-cloned immutable state snapshots with undo/redo navigation.
 * @module engine/history
 */

/** Maximum number of history entries before oldest are discarded. */
const MAX_ENTRIES = 2000;

/**
 * Deep-clone a value using structured-clone-safe JSON round-trip.
 * @param {*} obj
 * @returns {*}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Undo/redo history stack with a configurable cap.
 * Every pushed state is deep-cloned so mutations outside cannot affect stored snapshots.
 */
export class History {
  constructor() {
    /** @private @type {Array<*>} */
    this._entries = [];
    /** @private @type {number} Current position (index into _entries). -1 means empty. */
    this._cursor = -1;
  }

  /**
   * Push a new state. Discards any forward history beyond the cursor
   * and trims the oldest entries if the cap is exceeded.
   * @param {*} state - The state to store (will be deep-cloned).
   */
  push(state) {
    // Discard forward history
    this._entries.length = this._cursor + 1;
    this._entries.push(deepClone(state));
    this._cursor = this._entries.length - 1;

    // Trim from front if over cap
    if (this._entries.length > MAX_ENTRIES) {
      const excess = this._entries.length - MAX_ENTRIES;
      this._entries.splice(0, excess);
      this._cursor -= excess;
    }
  }

  /**
   * Move one step back and return the state there.
   * @returns {*|null} The previous state (deep-cloned), or null if at the beginning.
   */
  back() {
    if (!this.canBack()) return null;
    this._cursor--;
    return deepClone(this._entries[this._cursor]);
  }

  /**
   * Move one step forward and return the state there.
   * @returns {*|null} The next state (deep-cloned), or null if at the end.
   */
  forward() {
    if (!this.canForward()) return null;
    this._cursor++;
    return deepClone(this._entries[this._cursor]);
  }

  /**
   * Return the state at the current cursor position.
   * @returns {*|null} A deep-cloned copy, or null if the history is empty.
   */
  current() {
    if (this._cursor < 0 || this._cursor >= this._entries.length) return null;
    return deepClone(this._entries[this._cursor]);
  }

  /** @returns {boolean} Whether back() would succeed. */
  canBack() {
    return this._cursor > 0;
  }

  /** @returns {boolean} Whether forward() would succeed. */
  canForward() {
    return this._cursor < this._entries.length - 1;
  }

  /**
   * Jump directly to a specific index in the history.
   * @param {number} index - The target index (0-based).
   * @returns {*|null} The state at that index (deep-cloned), or null if out of range.
   */
  jumpTo(index) {
    if (index < 0 || index >= this._entries.length) return null;
    this._cursor = index;
    return deepClone(this._entries[this._cursor]);
  }

  /** @returns {number} Number of entries stored. */
  get length() {
    return this._entries.length;
  }

  /** @returns {number} Current cursor position. */
  get position() {
    return this._cursor;
  }

  /** @returns {number} Current cursor index. */
  get currentIndex() {
    return this._cursor;
  }

  /** @returns {Array<*>} All entries (deep-cloned). */
  getAll() {
    return this._entries.map(deepClone);
  }

  /** Remove all entries and reset the cursor. */
  clear() {
    this._entries.length = 0;
    this._cursor = -1;
  }
}
