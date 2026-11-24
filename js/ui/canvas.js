/**
 * @fileoverview Main visualization canvas for SwarmLab PSO teaching tool.
 * Renders the objective-function landscape and swarm particles on an HTML canvas.
 * Supports 2D heatmap/contour mode and 1D curve mode.
 * @module ui/canvas
 */

// ─── Colour Palettes ────────────────────────────────────────────────

/** Okabe-Ito 8-colour palette for particles (colour-blind safe). */
const PARTICLE_PALETTE = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442',
  '#0072B2', '#D55E00', '#CC79A7', '#000000'
];

function buildHeatmap(stops) {
  return Array.from({ length: 256 }, (_, index) => {
    const position = index / 255 * (stops.length - 1);
    const first = Math.floor(position);
    const next = Math.min(first + 1, stops.length - 1);
    return stops[first].map((value, channel) =>
      Math.round(lerp(value, stops[next][channel], position - first)));
  });
}

// Keep fitness and luminance in the same order across themes and palettes.
const TERRAIN_HEATMAPS = {
  light: buildHeatmap([
    [125, 143, 193], [157, 174, 211], [188, 202, 229], [218, 226, 242], [246, 243, 250],
  ]),
  dark: buildHeatmap([
    [35, 42, 58], [52, 59, 78], [69, 79, 102], [92, 104, 128], [121, 132, 151],
  ]),
};
const GRAYSCALE_HEATMAPS = {
  light: buildHeatmap([[137, 137, 137], [246, 246, 246]]),
  dark: buildHeatmap([[36, 36, 36], [151, 151, 151]]),
};

/** Force-decomposition arrow colours. */
const FORCE_COLOURS = {
  inertia: '#8A94A6',
  cognitive: '#2563EB',
  social: '#F97316',
  resultantLight: '#1E293B',
  resultantDark: '#E2E8F0',
};

// ─── Display Mode Enum ──────────────────────────────────────────────

/**
 * @readonly
 * @enum {string}
 */
const DisplayMode = {
  HEATMAP: 'heatmap',
  CONTOURS: 'contours',
  BOTH: 'both',
  PLAIN: 'plain',
};

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Check if prefers-reduced-motion is active.
 * @returns {boolean}
 */
function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Read a CSS custom property from :root.
 * @param {string} name
 * @param {string} [fallback]
 * @returns {string}
 */
function cssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Detect dark theme from CSS custom property or data attribute.
 * @returns {boolean}
 */
function isDarkTheme() {
  if (typeof document === 'undefined') return false;
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function formatFitness(value) {
  return Number.isFinite(value) ? value.toFixed(6) : 'Undefined';
}

/**
 * Linear interpolation.
 * @param {number} a
 * @param {number} b
 * @param {number} t  0–1
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map a value from [inMin, inMax] to [outMin, outMax].
 * @param {number} val
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @returns {number}
 */
function mapRange(val, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((val - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Clamp value.
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ─── CanvasRenderer ─────────────────────────────────────────────────

/**
 * @typedef {Object} RenderOptions
 * @property {string}  [displayMode='both']       - heatmap | contours | both | plain
 * @property {boolean} [colorblind=false]         - use a grayscale heatmap
 * @property {boolean} [showLabels=true]           - show particle ID labels
 * @property {boolean} [showTrails=true]           - show trailing positions
 * @property {number}  [trailLength=20]            - number of past positions to show
 * @property {boolean} [showVelocity=true]         - show velocity arrows
 * @property {boolean} [showPbest=true]            - show personal bests
 * @property {boolean} [showGbest=true]            - show global best star
 * @property {boolean} [showForces=false]          - show force decomposition
 * @property {number|null} [selectedParticle=null] - particle id for force decomposition
 * @property {boolean} [showTopologyLinks=false]   - show neighbourhood links for ring topology
 * @property {boolean} [showContourLines=true]     - draw contour lines
 * @property {number}  [contourLevels=12]          - number of contour levels
 */

/**
 * @typedef {Object} ParticleState
 * @property {number}   id
 * @property {number[]} x           - current position
 * @property {number[]} v           - current velocity
 * @property {number}   fitness
 * @property {number[]} pbest       - personal best position
 * @property {number}   pbest_fitness
 * @property {boolean}  [improved]
 */

/**
 * @typedef {Object} SwarmState
 * @property {ParticleState[]} particles
 * @property {{position: number[], fitness: number, particle_id: number}} gbest
 * @property {number}   iteration
 * @property {string}   [micro_step]
 * @property {number}   [current_particle_index]
 * @property {string}   [topology]           - 'global' | 'ring'
 * @property {Object}   [forceDecomposition] - {inertia, cognitive, social, resultant}
 * @property {Array<Array<{x: number[], fitness: number}>>} [trails] - per-particle trail
 */

/**
 * Main canvas renderer for SwarmLab.
 * Handles both 2D (heatmap + swarm) and 1D (curve + dots) rendering.
 */
export class CanvasRenderer {
  /**
   * @param {HTMLCanvasElement} canvasElement
   */
  constructor(canvasElement) {
    /** @type {HTMLCanvasElement} */
    this._canvas = canvasElement;
    /** @type {CanvasRenderingContext2D} */
    this._ctx = canvasElement.getContext('2d');

    /** @type {Function|null} */
    this._fn = null;
    /** @type {number[][]} domain  — [[xmin,xmax],[ymin,ymax]] */
    this._domain = [[-5, 5], [-5, 5]];
    /** @type {number} 1 or 2 */
    this._dimensions = 2;

    /** Offscreen landscape cache. @type {HTMLCanvasElement|null} */
    this._landscapeCache = null;
    this._curveSamples = [];
    this._hasLandscapeData = false;
    /** @type {number} min value in landscape */
    this._fMin = 0;
    /** @type {number} max value in landscape */
    this._fMax = 1;
    /** Known optimum positions @type {number[][]} */
    this._knownOptima = [];

    /** @type {RenderOptions} */
    this._options = {
      displayMode: DisplayMode.BOTH,
      colorblind: false,
      showLabels: true,
      showTrails: true,
      trailLength: 20,
      showVelocity: true,
      showPbest: true,
      showGbest: true,
      showForces: false,
      selectedParticle: null,
      showTopologyLinks: false,
      showContourLines: true,
      contourLevels: 12,
    };

    /** Last rendered state for tooltip lookup. @type {SwarmState|null} */
    this._lastState = null;

    /** Animation state. */
    this._animating = false;
    this._animFrom = null;
    this._animTo = null;
    this._animStart = 0;
    this._animDuration = 0;
    this._animRafId = 0;

    /** Pulsing ring state. */
    this._pulseParticleId = null;
    this._pulseStart = 0;

    /** Trail history (particle id → array of positions). @type {Map<number, number[][]>} */
    this._trails = new Map();

    /** Tooltip element. @type {HTMLDivElement|null} */
    this._tooltip = null;

    /** Rendering area (excluding legend/axes padding). */
    this._plotArea = { x: 0, y: 0, w: 0, h: 0 };

    // High-DPI setup
    this._dpr = window.devicePixelRatio || 1;
    this._setupDPR();

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => this._handleResize());
    this._resizeObserver.observe(this._canvas);

    // Tooltip setup
    this._createTooltip();
    this._canvas.addEventListener('mousemove', (e) => this._handleMouseMove(e));
    this._canvas.addEventListener('mouseleave', () => this._hideTooltip());
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Set the objective function and re-render landscape.
   * @param {Function} fn             - (x,y?) => number
   * @param {number[][]} domain       - [[xmin,xmax],[ymin,ymax?]]
   * @param {number} dimensions       - 1 or 2
   * @param {number[][]} [knownOptima] - optional known optimum positions
   */
  setFunction(fn, domain, dimensions, knownOptima = []) {
    this._fn = fn;
    this._domain = domain;
    this._dimensions = dimensions;
    this._knownOptima = knownOptima;
    this._landscapeCache = null;
    this._trails.clear();
    this._renderLandscape();
  }

  /**
   * Render the current swarm state.
   * @param {SwarmState} state
   */
  render(state, maybeGbest = null) {
    if (Array.isArray(state)) {
      state = {
        particles: state,
        gbest: maybeGbest
      };
    }
    this._lastState = state;
    this._updateTrails(state);
    this._draw(state);
  }

  /**
   * Update display options.
   * @param {Partial<RenderOptions>} options
   */
  setOptions(options) {
    Object.assign(this._options, options);
    const landscapeOptions = ['displayMode', 'contourLevels', 'showContourLines', 'colorblind'];
    if (landscapeOptions.some(option => option in options)) {
      this._landscapeCache = null;
    }
    if (this._lastState) {
      this._draw(this._lastState);
    }
  }

  /** Rebuild cached pixels whose colours depend on the active document theme. */
  refreshTheme() {
    this._landscapeCache = null;
    if (this._lastState) this._draw(this._lastState);
  }

  /**
   * Convert canvas pixel coordinates to problem-space coordinates.
   * @param {number} canvasX
   * @param {number} canvasY
   * @returns {{x: number, y: number}|{x: number}}
   */
  getPointAt(canvasX, canvasY) {
    const pa = this._plotArea;
    if (this._dimensions === 1) {
      const x = mapRange(canvasX, pa.x, pa.x + pa.w, this._domain[0][0], this._domain[0][1]);
      return { x };
    }
    const x = mapRange(canvasX, pa.x, pa.x + pa.w, this._domain[0][0], this._domain[0][1]);
    const y = mapRange(canvasY, pa.y + pa.h, pa.y, this._domain[1][0], this._domain[1][1]);
    return { x, y };
  }

  /**
   * Alias for getPointAt returning coordinate array [x, y] or [x]
   */
  canvasToDomain(canvasX, canvasY) {
    const pt = this.getPointAt(canvasX, canvasY);
    return pt.y !== undefined ? [pt.x, pt.y] : [pt.x];
  }

  /**
   * Highlight a particle with a pulsing ring.
   * @param {number|null} id
   */
  highlightParticle(id) {
    this._pulseParticleId = id;
    this._pulseStart = performance.now();
    if (this._lastState) this._draw(this._lastState);
  }

  /**
   * Animate from one state to another with tweening.
   * @param {SwarmState} fromState
   * @param {SwarmState} toState
   * @param {number} [duration=400] - milliseconds
   * @returns {Promise<void>}
   */
  animateMove(fromState, toState, duration = 400) {
    if (prefersReducedMotion()) {
      this.render(toState);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this._animating = true;
      this._animFrom = fromState;
      this._animTo = toState;
      this._animStart = performance.now();
      this._animDuration = clamp(duration, 100, 1000);

      const tick = (now) => {
        const elapsed = now - this._animStart;
        const t = clamp(elapsed / this._animDuration, 0, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);

        const interpolated = this._interpolateStates(fromState, toState, eased);
        this._draw(interpolated);

        if (t < 1) {
          this._animRafId = requestAnimationFrame(tick);
        } else {
          this._animating = false;
          this._lastState = toState;
          this._draw(toState);
          resolve();
        }
      };

      cancelAnimationFrame(this._animRafId);
      this._animRafId = requestAnimationFrame(tick);
    });
  }

  /**
   * Export the current canvas as a PNG data URL.
   * @returns {string}
   */
  exportPNG() {
    return this._canvas.toDataURL('image/png');
  }

  /**
   * Clean up resources.
   */
  destroy() {
    this._resizeObserver.disconnect();
    cancelAnimationFrame(this._animRafId);
    if (this._tooltip && this._tooltip.parentNode) {
      this._tooltip.parentNode.removeChild(this._tooltip);
    }
  }

  // ─── High-DPI & Resize ───────────────────────────────────────────

  /** @private */
  _setupDPR() {
    this._dpr = window.devicePixelRatio || 1;
    const rect = this._canvas.getBoundingClientRect();
    this._canvas.width = rect.width * this._dpr;
    this._canvas.height = rect.height * this._dpr;
    this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  /** @private */
  _handleResize() {
    this._setupDPR();
    this._landscapeCache = null;
    if (this._fn) this._renderLandscape();
    if (this._lastState) this._draw(this._lastState);
  }

  /** CSS-pixel width of canvas. @returns {number} */
  get _width() {
    return this._canvas.getBoundingClientRect().width;
  }

  /** CSS-pixel height of canvas. @returns {number} */
  get _height() {
    return this._canvas.getBoundingClientRect().height;
  }

  // ─── Plot Area Calculation ────────────────────────────────────────

  /** @private */
  _computePlotArea() {
    const narrow = this._width < 420;
    const leftPad = this._dimensions === 1 ? (narrow ? 47 : 56) : (narrow ? 37 : 47);
    const rightPad = narrow ? 15 : 20;
    const topPad = narrow ? 15 : 19;
    const bottomPad = this._dimensions === 2 ? 62 : 39;
    this._plotArea = {
      x: leftPad,
      y: topPad,
      w: Math.max(1, this._width - leftPad - rightPad),
      h: Math.max(1, this._height - topPad - bottomPad),
    };
  }

  // ─── Coordinate Mapping ───────────────────────────────────────────

  /**
   * Problem-space x → canvas pixel x.
   * @param {number} x
   * @returns {number}
   */
  _toCanvasX(x) {
    return mapRange(x, this._domain[0][0], this._domain[0][1],
      this._plotArea.x, this._plotArea.x + this._plotArea.w);
  }

  /**
   * Problem-space y → canvas pixel y (inverted).
   * @param {number} y
   * @returns {number}
   */
  _toCanvasY(y) {
    if (this._dimensions === 1) {
      // y is f(x), map to vertical axis
      const scale = Math.max(Math.abs(this._fMin), Math.abs(this._fMax)) || 1;
      return mapRange(y / scale, this._fMin / scale, this._fMax / scale,
        this._plotArea.y + this._plotArea.h, this._plotArea.y);
    }
    return mapRange(y, this._domain[1][0], this._domain[1][1],
      this._plotArea.y + this._plotArea.h, this._plotArea.y);
  }

  // ─── Landscape Rendering ─────────────────────────────────────────

  /** @private */
  _renderLandscape() {
    if (!this._fn) return;
    this._computePlotArea();
    const pa = this._plotArea;

    if (this._dimensions === 1) {
      this._sampleCurve();
      return;
    }

    const width = Math.max(2, Math.min(Math.floor(pa.w), 400));
    const height = Math.max(2, Math.min(Math.floor(pa.h), 400));
    const values = new Float64Array(width * height);
    const [xmin, xmax] = this._domain[0];
    const [ymin, ymax] = this._domain[1];
    let fMin = Infinity;
    let fMax = -Infinity;

    for (let row = 0; row < height; row++) {
      const y = lerp(ymax, ymin, row / (height - 1));
      for (let column = 0; column < width; column++) {
        const x = lerp(xmin, xmax, column / (width - 1));
        const value = this._fn(x, y);
        values[row * width + column] = value;
        if (!Number.isFinite(value)) continue;
        fMin = Math.min(fMin, value);
        fMax = Math.max(fMax, value);
      }
    }

    this._hasLandscapeData = Number.isFinite(fMin);
    this._fMin = this._hasLandscapeData ? fMin : 0;
    this._fMax = this._hasLandscapeData ? fMax : 1;

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const context = offscreen.getContext('2d');
    const pixels = context.createImageData(width, height);
    const mode = this._options.displayMode;
    const showHeatmap = mode === DisplayMode.HEATMAP || mode === DisplayMode.BOTH;
    const dark = isDarkTheme();
    const palette = this._getLandscapePalette(dark);
    const background = dark ? [34, 42, 56] : [247, 248, 252];
    const noData = dark ? [24, 29, 37] : [225, 224, 229];
    const scale = Math.max(Math.abs(fMin), Math.abs(fMax)) || 1;
    const low = fMin / scale;
    const range = fMax / scale - low || 1;

    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      const finite = Number.isFinite(value);
      const relative = finite ? clamp((value / scale - low) / range, 0, 1) : 0;
      const color = finite ? (showHeatmap ? palette[Math.round(relative * 255)] : background) : noData;
      const offset = index * 4;
      pixels.data[offset] = color[0];
      pixels.data[offset + 1] = color[1];
      pixels.data[offset + 2] = color[2];
      pixels.data[offset + 3] = 255;
    }

    context.putImageData(pixels, 0, 0);

    const showContours = this._options.showContourLines &&
      (mode === DisplayMode.CONTOURS || mode === DisplayMode.BOTH);
    if (showContours && this._hasLandscapeData && fMin < fMax) {
      this._drawContoursOnCanvas(context, values, width, height, fMin, fMax);
    }

    this._landscapeCache = offscreen;
  }

  _getLandscapePalette(dark) {
    const palettes = this._options.colorblind ? GRAYSCALE_HEATMAPS : TERRAIN_HEATMAPS;
    return palettes[dark ? 'dark' : 'light'];
  }

  /** @private */
  _sampleCurve() {
    const steps = Math.max(2, Math.min(600, Math.ceil(this._plotArea.w)));
    const [xmin, xmax] = this._domain[0];
    let fMin = Infinity;
    let fMax = -Infinity;
    this._curveSamples = Array.from({ length: steps + 1 }, (_, index) => {
      const value = this._fn(lerp(xmin, xmax, index / steps));
      if (Number.isFinite(value)) {
        fMin = Math.min(fMin, value);
        fMax = Math.max(fMax, value);
      }
      return value;
    });

    this._hasLandscapeData = Number.isFinite(fMin);
    if (this._hasLandscapeData) {
      const padding = (fMax - fMin || Math.abs(fMin) || 1) * 0.09;
      this._fMin = Number.isFinite(fMin - padding) ? fMin - padding : fMin;
      this._fMax = Number.isFinite(fMax + padding) ? fMax + padding : fMax;
    } else {
      this._fMin = 0;
      this._fMax = 1;
    }
  }

  /**
   * Draw contour lines using marching-squares-like approach.
   * @private
   */
  _drawContoursOnCanvas(ctx, values, w, h, fMin, fMax) {
    const levels = this._options.contourLevels;
    const dark = isDarkTheme();
    ctx.strokeStyle = this._options.colorblind
      ? (dark ? '#D8D8D8' : '#606060')
      : (dark ? '#D0D7E7' : '#4C5D83');
    for (let l = 1; l < levels; l++) {
      const fraction = l / levels;
      const threshold = (1 - fraction) * fMin + fraction * fMax;
      const major = l % 3 === 0;
      ctx.globalAlpha = major ? 0.43 : 0.24;
      ctx.lineWidth = major ? 1 : 0.65;
      ctx.beginPath();

      // Simple horizontal line scanning for contour crossings
      for (let iy = 0; iy < h - 1; iy++) {
        for (let ix = 0; ix < w - 1; ix++) {
          const v00 = values[iy * w + ix];
          const v10 = values[iy * w + ix + 1];
          const v01 = values[(iy + 1) * w + ix];
          const v11 = values[(iy + 1) * w + ix + 1];
          if (!Number.isFinite(v00) || !Number.isFinite(v10) ||
              !Number.isFinite(v01) || !Number.isFinite(v11)) continue;

          // Check if contour crosses this cell
          const above00 = v00 >= threshold;
          const above10 = v10 >= threshold;
          const above01 = v01 >= threshold;
          const above11 = v11 >= threshold;

          const sum = (above00 ? 1 : 0) + (above10 ? 1 : 0) +
            (above01 ? 1 : 0) + (above11 ? 1 : 0);
          if (sum === 0 || sum === 4) continue;

          // Find crossing points on edges via linear interpolation
          /** @type {Array<[number, number]>} */
          const crossings = [];

          // Top edge
          if (above00 !== above10) {
            const t = (threshold - v00) / (v10 - v00);
            crossings.push([ix + t, iy]);
          }
          // Bottom edge
          if (above01 !== above11) {
            const t = (threshold - v01) / (v11 - v01);
            crossings.push([ix + t, iy + 1]);
          }
          // Left edge
          if (above00 !== above01) {
            const t = (threshold - v00) / (v01 - v00);
            crossings.push([ix, iy + t]);
          }
          // Right edge
          if (above10 !== above11) {
            const t = (threshold - v10) / (v11 - v10);
            crossings.push([ix + 1, iy + t]);
          }

          // Draw line segments between crossing pairs
          if (crossings.length >= 2) {
            ctx.moveTo(crossings[0][0], crossings[0][1]);
            ctx.lineTo(crossings[1][0], crossings[1][1]);
            if (crossings.length === 4) {
              ctx.moveTo(crossings[2][0], crossings[2][1]);
              ctx.lineTo(crossings[3][0], crossings[3][1]);
            }
          }
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ─── Main Draw ────────────────────────────────────────────────────

  /**
   * Full draw pass.
   * @param {SwarmState} state
   * @private
   */
  _draw(state) {
    const ctx = this._ctx;
    const W = this._width;
    const H = this._height;

    this._computePlotArea();
    const pa = this._plotArea;

    ctx.fillStyle = cssVar('--c-graph-frame', isDarkTheme() ? '#1B222E' : '#FCFBFD');
    ctx.fillRect(0, 0, W, H);

    if (!this._fn || W < 85 || H < 85) return;

    if (this._dimensions === 1) {
      this._draw1D(ctx, state);
      return;
    }

    // ── 2D Mode ──

    // Draw landscape
    if (!this._landscapeCache) this._renderLandscape();
    if (this._landscapeCache) {
      ctx.save();
      this._roundRect(ctx, pa.x, pa.y, pa.w, pa.h, 4);
      ctx.clip();
      ctx.drawImage(this._landscapeCache, pa.x, pa.y, pa.w, pa.h);
      ctx.restore();
    }

    const shaded = [DisplayMode.HEATMAP, DisplayMode.BOTH].includes(this._options.displayMode);
    this._drawAxes(ctx);
    if (shaded) this._drawLegend(ctx);
    this._drawOptima(ctx);
    if (!state) return;

    // Topology links
    if (this._options.showTopologyLinks && state.topology === 'ring' && state.particles) {
      this._drawTopologyLinks(ctx, state);
    }

    // Trails
    if (this._options.showTrails && state.particles) {
      this._drawTrails(ctx, state);
    }

    // Personal bests
    if (this._options.showPbest && state.particles) {
      this._drawPbests(ctx, state);
    }

    // Particles
    if (state.particles) {
      this._drawParticles(ctx, state);
    }

    // Global best
    if (this._options.showGbest && state.gbest) {
      this._drawGlobalBest(ctx, state);
    }
    this._drawParticleLabels(ctx, state, true);

    // Force decomposition
    if (this._options.showForces && this._options.selectedParticle != null && state.forceDecomposition) {
      this._drawForceDecomposition(ctx, state);
    }
  }

  // ─── 1D Drawing ──────────────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _draw1D(ctx, state) {
    const pa = this._plotArea;
    const dark = isDarkTheme();
    const base = pa.y + pa.h;
    const accent = dark ? '#6AE0D8' : '#0D858B';

    ctx.save();
    this._roundRect(ctx, pa.x, pa.y, pa.w, pa.h, 4);
    ctx.fillStyle = cssVar('--c-graph-surface', dark ? '#222A38' : '#F7F8FC');
    ctx.fill();
    ctx.restore();
    this._drawAxes(ctx);

    if (!this._hasLandscapeData) {
      this._drawEmptyLandscape(ctx, pa.y + pa.h / 2);
      return;
    }

    ctx.save();
    this._roundRect(ctx, pa.x, pa.y, pa.w, pa.h, 4);
    ctx.clip();
    const gradient = ctx.createLinearGradient(0, pa.y, 0, base);
    gradient.addColorStop(0, dark ? 'rgba(136, 164, 188, .17)' : 'rgba(91, 137, 158, .13)');
    gradient.addColorStop(1, 'transparent');

    let firstX;
    let lastX;
    const finishSegment = () => {
      if (firstX === undefined) return;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineTo(lastX, base);
      ctx.lineTo(firstX, base);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      firstX = undefined;
    };

    this._curveSamples.forEach((value, index) => {
      if (!Number.isFinite(value)) {
        finishSegment();
        return;
      }
      const x = pa.x + index / (this._curveSamples.length - 1) * pa.w;
      const y = this._toCanvasY(value);
      if (firstX === undefined) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        firstX = x;
      } else {
        ctx.lineTo(x, y);
      }
      lastX = x;
    });
    finishSegment();
    ctx.restore();
    this._drawOptima(ctx);
    if (!state?.particles) return;

    if (this._options.showPbest) {
      state.particles.forEach((particle, index) => {
        if (!Number.isFinite(particle.pbest_fitness)) return;
        ctx.strokeStyle = PARTICLE_PALETTE[index % PARTICLE_PALETTE.length];
        ctx.lineWidth = 1.3;
        this._drawDiamond(ctx, this._toCanvasX(particle.pbest[0]),
          this._toCanvasY(particle.pbest_fitness), 6.5, false);
      });
    }

    state.particles.forEach((particle, index) => {
      if (!Number.isFinite(particle.fitness)) return;
      const x = this._toCanvasX(particle.x[0]);
      const y = this._toCanvasY(particle.fitness);
      const color = PARTICLE_PALETTE[index % PARTICLE_PALETTE.length];
      const velocity = particle.v?.[0];

      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, base);
      ctx.stroke();
      ctx.restore();

      if (Number.isFinite(velocity) && velocity !== 0 && this._options.showVelocity) {
        const [min, max] = this._domain[0];
        const arrowX = clamp(x + velocity / (max - min) * pa.w * 0.5, pa.x, pa.x + pa.w);
        const arrowY = clamp(y + 10, pa.y, base - 3);
        if (Math.abs(arrowX - x) > 3) this._drawArrow(ctx, x, arrowY, arrowX, arrowY, color, 1.5);
      }

      this._drawParticleMarker(ctx, this._isActiveParticle(state, particle, index), x, y, color, false);
    });

    if (this._options.showGbest) this._drawGlobalBest(ctx, state);
    this._drawParticleLabels(ctx, state, false);
  }

  // ─── 2D Particle Drawing ─────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _drawParticles(ctx, state) {
    const [xMin, xMax] = this._domain[0];
    const [yMin, yMax] = this._domain[1];

    state.particles.forEach((particle, index) => {
      const x = this._toCanvasX(particle.x[0]);
      const y = this._toCanvasY(particle.x[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const color = PARTICLE_PALETTE[index % PARTICLE_PALETTE.length];

      if (this._options.showVelocity && particle.v) {
        const vx = particle.v[0] / (xMax - xMin) * this._plotArea.w * 0.3;
        const vy = -particle.v[1] / (yMax - yMin) * this._plotArea.h * 0.3;
        const magnitude = Math.hypot(vx, vy);
        if (magnitude > 2) {
          const scale = Math.min(1, 50 / magnitude);
          this._drawArrow(ctx, x, y, x + vx * scale, y + vy * scale, color, 1.5);
        }
      }

      this._drawParticleMarker(ctx, this._isActiveParticle(state, particle, index), x, y, color, true);
    });
  }

  _isActiveParticle(state, particle, index) {
    return this._pulseParticleId === particle.id || index === state.current_particle_index;
  }

  _drawParticleMarker(ctx, active, x, y, color, onTerrain) {
    const radius = active ? 6.1 : 4.5;
    const dark = isDarkTheme();
    const strongOutline = onTerrain || dark;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.4, 0, Math.PI * 2);
    ctx.strokeStyle = strongOutline ? 'rgba(8, 19, 33, .78)' : 'rgba(24, 62, 76, .36)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#F8F9FC';
    ctx.lineWidth = active ? 1.8 : 1.4;
    ctx.stroke();
    ctx.restore();

    if (active) this._drawPulseRing(ctx, x, y, dark ? '#EEF1F8' : '#394D75');
  }

  _drawParticleLabels(ctx, state, onTerrain) {
    if (!this._options.showLabels || !state.particles?.length) return;
    const { x: left, y: top, w, h } = this._plotArea;
    const dark = isDarkTheme();
    const labelLimit = Math.min(30, Math.max(4, Math.floor(w * h / 5000)));
    const priority = (particle, index) => {
      if (this._options.selectedParticle === particle.id) return 3;
      if (this._isActiveParticle(state, particle, index)) return 2;
      return Number(state.gbest?.particle_id === particle.id);
    };
    const particles = state.particles
      .map((particle, index) => ({ particle, rank: priority(particle, index) }))
      .sort((a, b) => b.rank - a.rank);
    const placed = [];

    ctx.save();
    ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = dark ? '#222939' : '#F4F5FA';
    ctx.fillStyle = dark ? '#EFF1F7' : '#1C2742';

    for (const { particle, rank } of particles) {
      if (placed.length >= labelLimit) break;
      const value = onTerrain ? particle.x[1] : particle.fitness;
      if (!Number.isFinite(particle.x[0]) || !Number.isFinite(value)) continue;
      const px = this._toCanvasX(particle.x[0]);
      const py = this._toCanvasY(value);
      const label = `P${particle.id + 1}`;
      const halfWidth = ctx.measureText(label).width / 2 + 4;
      const halfHeight = 7;
      const nearbyX = clamp(px, left + halfWidth, left + w - halfWidth);
      const candidates = [[nearbyX, py - 15], [nearbyX, py + 15]];
      if (rank > 0) {
        candidates.push([px - halfWidth - 9, py], [px + halfWidth + 9, py],
          [nearbyX, py - 29], [nearbyX, py + 29]);
      }

      const position = candidates.find(([x, y]) =>
        x - halfWidth >= left && x + halfWidth <= left + w &&
        y - halfHeight >= top && y + halfHeight <= top + h &&
        !placed.some(other => Math.abs(x - other.x) < halfWidth + other.halfWidth &&
          Math.abs(y - other.y) < 2 * halfHeight));
      if (!position) continue;

      const [x, y] = position;
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
      placed.push({ x, y, halfWidth });
    }
    ctx.restore();
  }

  /**
   * Draw pulsing ring animation.
   * @private
   */
  _drawPulseRing(ctx, cx, cy, colour) {
    if (prefersReducedMotion()) {
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }
    const t = ((performance.now() - this._pulseStart) % 1200) / 1200;
    const r = 8 + t * 12;
    const alpha = 1 - t;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Request next frame for animation
    if (!this._animating) {
      requestAnimationFrame(() => {
        if (this._lastState) this._draw(this._lastState);
      });
    }
  }

  // ─── Personal Bests ──────────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _drawPbests(ctx, state) {
    state.particles.forEach((p, i) => {
      if (!p.pbest || p.pbest.length < 2 || !Number.isFinite(p.pbest_fitness)) return;
      const px = this._toCanvasX(p.pbest[0]);
      const py = this._toCanvasY(p.pbest[1]);
      const cx = this._toCanvasX(p.x[0]);
      const cy = this._toCanvasY(p.x[1]);
      const col = PARTICLE_PALETTE[i % PARTICLE_PALETTE.length];

      // Faint dotted line from particle to pbest
      ctx.beginPath();
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Hollow diamond at pbest
      this._drawDiamond(ctx, px, py, 5, false);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  /**
   * Draw a diamond shape.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} r  - half-diagonal
   * @param {boolean} fill
   * @private
   */
  _drawDiamond(ctx, cx, cy, r, fill) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    if (fill) ctx.fill();
    else ctx.stroke();
  }

  // ─── Global Best ──────────────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _drawGlobalBest(ctx, state) {
    const best = state.gbest;
    if (!best?.position || !Number.isFinite(best.fitness)) return;
    const positionY = this._dimensions === 2 ? best.position[1] : best.fitness;
    if (!Number.isFinite(best.position[0]) || !Number.isFinite(positionY)) return;
    const x = this._toCanvasX(best.position[0]);
    const y = this._toCanvasY(positionY);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    for (let step = 0; step < 4; step++) {
      const angle = step * Math.PI / 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.moveTo(x + 10 * dx, y + 10 * dy);
      ctx.lineTo(x + 13.5 * dx, y + 13.5 * dy);
    }
    ctx.strokeStyle = '#24364A';
    ctx.lineWidth = 3.7;
    ctx.stroke();
    ctx.strokeStyle = '#FFD78C';
    ctx.lineWidth = 1.65;
    ctx.stroke();
    ctx.restore();
  }

  // ─── Topology Links ──────────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _drawTopologyLinks(ctx, state) {
    const pts = state.particles;
    if (!pts || pts.length < 2) return;
    const dark = isDarkTheme();

    ctx.strokeStyle = dark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)';
    ctx.lineWidth = 1;

    // Ring topology: each particle linked to neighbours
    for (let i = 0; i < pts.length; i++) {
      const next = (i + 1) % pts.length;
      const cx1 = this._toCanvasX(pts[i].x[0]);
      const cy1 = this._toCanvasY(pts[i].x[1]);
      const cx2 = this._toCanvasX(pts[next].x[0]);
      const cy2 = this._toCanvasY(pts[next].x[1]);

      ctx.beginPath();
      ctx.moveTo(cx1, cy1);
      ctx.lineTo(cx2, cy2);
      ctx.stroke();
    }
  }

  // ─── Trails ───────────────────────────────────────────────────────

  /**
   * Update trail history from state.
   * @param {SwarmState} state
   * @private
   */
  _updateTrails(state) {
    if (!state || !state.particles) return;
    const maxLen = this._options.trailLength;

    state.particles.forEach((p) => {
      if (!this._trails.has(p.id)) {
        this._trails.set(p.id, []);
      }
      const trail = this._trails.get(p.id);
      // Only add if position actually changed
      const last = trail.length > 0 ? trail[trail.length - 1] : null;
      const changed = !last || last[0] !== p.x[0] || (p.x.length > 1 && last[1] !== p.x[1]);
      if (changed) {
        trail.push([...p.x]);
        if (trail.length > maxLen) trail.shift();
      }
    });
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _drawTrails(ctx, state) {
    state.particles.forEach((p, i) => {
      const trail = this._trails.get(p.id);
      if (!trail || trail.length < 2) return;
      const col = PARTICLE_PALETTE[i % PARTICLE_PALETTE.length];

      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';

      for (let j = 1; j < trail.length; j++) {
        const alpha = j / trail.length * 0.6;
        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.globalAlpha = alpha;
        const x1 = this._toCanvasX(trail[j - 1][0]);
        const y1 = this._dimensions === 2 ? this._toCanvasY(trail[j - 1][1]) :
          this._toCanvasY(this._fn(trail[j - 1][0]));
        const x2 = this._toCanvasX(trail[j][0]);
        const y2 = this._dimensions === 2 ? this._toCanvasY(trail[j][1]) :
          this._toCanvasY(this._fn(trail[j][0]));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  // ─── Force Decomposition ─────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _drawForceDecomposition(ctx, state) {
    const sel = this._options.selectedParticle;
    const p = state.particles.find(pt => pt.id === sel);
    if (!p || !state.forceDecomposition) return;

    const fd = state.forceDecomposition;
    const dark = isDarkTheme();
    const cx = this._toCanvasX(p.x[0]);
    const cy = this._toCanvasY(p.x[1]);
    const domW = this._domain[0][1] - this._domain[0][0];
    const domH = this._domain[1][1] - this._domain[1][0];

    const scale = 0.4;
    const inertiaColor = cssVar('--c-force-inertia', FORCE_COLOURS.inertia);
    const cognitiveColor = cssVar('--c-force-cognitive', FORCE_COLOURS.cognitive);
    const socialColor = cssVar('--c-force-social', FORCE_COLOURS.social);

    /**
     * Draw a force vector from origin.
     * @param {number[]} vec - [vx, vy] in problem space
     * @param {string} colour
     * @param {string} label
     * @param {number} startX
     * @param {number} startY
     * @returns {{endX: number, endY: number}}
     */
    const drawForceVec = (vec, colour, label, startX, startY) => {
      if (!vec || vec.length < 2) return { endX: startX, endY: startY };
      const vxPx = (vec[0] / domW) * this._plotArea.w * scale;
      const vyPx = -(vec[1] / domH) * this._plotArea.h * scale;
      const endX = startX + vxPx;
      const endY = startY + vyPx;
      this._drawArrow(ctx, startX, startY, endX, endY, colour, 2.5);

      // Label at midpoint
      ctx.fillStyle = colour;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, (startX + endX) / 2 + 4, (startY + endY) / 2 - 4);

      return { endX, endY };
    };

    // Tip-to-tail: inertia → cognitive → social
    const { endX: ix, endY: iy } = drawForceVec(
      fd.inertia, inertiaColor, 'inertia', cx, cy);
    const { endX: cogX, endY: cogY } = drawForceVec(
      fd.cognitive, cognitiveColor, 'cognitive', ix, iy);
    drawForceVec(fd.social, socialColor, 'social', cogX, cogY);

    // Resultant from particle
    const resultColour = cssVar('--c-force-resultant', dark ? FORCE_COLOURS.resultantDark : FORCE_COLOURS.resultantLight);
    drawForceVec(fd.resultant, resultColour, 'resultant', cx, cy);

    // Small legend box
    const lx = this._plotArea.x + 8;
    const ly = this._plotArea.y + 8;
    const lw = 125;
    const lh = 76;
    ctx.fillStyle = dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = dark ? 'rgba(148,163,184,0.3)' : 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, lx, ly, lw, lh, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '10px system-ui, sans-serif';
    const labels = [
      { colour: inertiaColor, text: `Inertia: ${this._vecMag(fd.inertia).toFixed(3)}` },
      { colour: cognitiveColor, text: `Cognitive: ${this._vecMag(fd.cognitive).toFixed(3)}` },
      { colour: socialColor, text: `Social: ${this._vecMag(fd.social).toFixed(3)}` },
      { colour: resultColour, text: `Resultant: ${this._vecMag(fd.resultant).toFixed(3)}` },
    ];

    labels.forEach((item, i) => {
      const y = ly + 14 + i * 15;
      ctx.fillStyle = item.colour;
      ctx.fillRect(lx + 6, y - 4, 10, 4);
      ctx.fillStyle = dark ? '#E2E8F0' : '#1E293B';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, lx + 20, y - 2);
    });
  }

  /**
   * Vector magnitude.
   * @param {number[]} v
   * @returns {number}
   * @private
   */
  _vecMag(v) {
    if (!v) return 0;
    return Math.sqrt(v.reduce((s, c) => s + c * c, 0));
  }

  // ─── Known Optima ─────────────────────────────────────────────────

  /** @private */
  _drawOptima(ctx) {
    const dark = isDarkTheme();
    ctx.save();
    for (const position of this._knownOptima) {
      const value = this._dimensions === 2 ? position[1] : this._fn(position[0]);
      if (!Number.isFinite(value)) continue;
      const x = this._toCanvasX(position[0]);
      const y = this._toCanvasY(value);
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.strokeStyle = dark ? '#222939' : '#F4F5FA';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = dark ? '#E8EBF5' : '#374766';
      ctx.lineWidth = 1.35;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─── Axes & legend ─────────────────────────────────────────────────

  _drawAxes(ctx) {
    const { x, y, w, h } = this._plotArea;
    const bottom = y + h;
    const dark = isDarkTheme();
    const curve = this._dimensions === 1;
    const xTicks = this._niceTicks(...this._domain[0], w < 325 ? 4 : 7);
    const yDomain = curve ? [this._fMin, this._fMax] : this._domain[1];
    const yTicks = this._niceTicks(...yDomain, h < 185 ? 3 : 6);

    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = dark ? '#B8C9D7' : '#496378';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const grid = dark ? 'rgba(191, 199, 214, .14)' : 'rgba(73, 86, 117, .15)';
    const origin = dark ? 'rgba(191, 199, 214, .27)' : 'rgba(73, 86, 117, .27)';

    for (const value of xTicks) {
      const px = this._toCanvasX(value);
      ctx.strokeStyle = value === 0 ? origin : grid;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, bottom);
      ctx.stroke();
      ctx.fillText(this._formatTick(value), px, bottom + 6);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const value of yTicks) {
      const py = this._toCanvasY(value);
      ctx.strokeStyle = value === 0 ? origin : grid;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + w, py);
      ctx.stroke();
      ctx.fillText(this._formatTick(value), x - 6, py, x - 17);
    }

    this._roundRect(ctx, x, y, w, h, 4);
    ctx.strokeStyle = dark ? '#505D73' : '#C3C9DA';
    ctx.stroke();

    ctx.fillStyle = dark ? '#DDEDF6' : '#304D65';
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(curve ? 'x' : 'x₁', x + w / 2, bottom + 27);
    ctx.translate(11, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(curve ? 'f(x)' : 'x₂', 0, 0);
    ctx.restore();
  }

  _drawEmptyLandscape(ctx, y) {
    ctx.fillStyle = isDarkTheme() ? '#BDCEDA' : '#496378';
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No finite fitness samples', this._plotArea.x + this._plotArea.w / 2, y);
  }

  _drawLegend(ctx) {
    const { x, y, w, h } = this._plotArea;
    const centerY = y + h + 48;
    if (!this._hasLandscapeData) {
      this._drawEmptyLandscape(ctx, centerY);
      return;
    }

    const low = this._formatTick(this._fMin);
    const high = this._formatTick(this._fMax);
    const dark = isDarkTheme();
    const palette = this._getLandscapePalette(dark);
    const label = 'Fitness';
    const labelFont = '600 11px Inter, system-ui, sans-serif';
    const valueFont = '10px "JetBrains Mono", ui-monospace, monospace';

    ctx.save();
    ctx.font = labelFont;
    const headingWidth = ctx.measureText(label).width;
    ctx.font = valueFont;
    const lowWidth = ctx.measureText(low).width;
    const highWidth = ctx.measureText(high).width;
    const textWidth = headingWidth + lowWidth + highWidth + 29;
    const barWidth = Math.min(172, Math.max(20, w - textWidth));
    const startX = x + (w - textWidth - barWidth) / 2;
    const barX = startX + headingWidth + lowWidth + 20;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? '#DDEDF6' : '#304D65';
    ctx.font = labelFont;
    ctx.fillText(label, startX, centerY);
    ctx.font = valueFont;
    ctx.fillStyle = dark ? '#B8C9D7' : '#496378';
    ctx.fillText(low, startX + headingWidth + 12, centerY);
    ctx.fillText(high, barX + barWidth + 8, centerY);

    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    for (let index = 0; index <= 16; index++) {
      const color = palette[Math.round(index / 16 * 255)];
      gradient.addColorStop(index / 16, `rgb(${color.join(', ')})`);
    }
    this._roundRect(ctx, barX, centerY - 3.5, barWidth, 7, 3);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = dark ? '#58657D' : '#A9B3CA';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // ─── Arrow Drawing ────────────────────────────────────────────────

  /**
   * Draw an arrow from (x1,y1) to (x2,y2).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {string} colour
   * @param {number} [lineWidth=1.5]
   * @private
   */
  _drawArrow(ctx, x1, y1, x2, y2, colour, lineWidth = 1.5) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const headLen = Math.min(8, len * 0.3);
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.strokeStyle = colour;
    ctx.lineWidth = lineWidth;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.fillStyle = colour;
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // ─── Rounded Rectangle ───────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r
   * @private
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ─── Tick Generation ──────────────────────────────────────────────

  /**
   * Generate nice tick values for an axis range.
   * @param {number} lo
   * @param {number} hi
   * @param {number} [approxCount=6]
   * @returns {number[]}
   * @private
   */
  _niceTicks(lo, hi, approxCount = 6) {
    if (lo === hi) return [lo];
    const range = hi - lo;
    if (!Number.isFinite(range)) return [lo, 0, hi];
    const rough = range / approxCount;
    if (!(rough > 0)) return [lo];
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / mag;
    let step;
    if (residual <= 1.5) step = 1 * mag;
    else if (residual <= 3) step = 2 * mag;
    else if (residual <= 7) step = 5 * mag;
    else step = 10 * mag;

    const ticks = [];
    const start = Math.ceil(lo / step) * step;
    if (!(step > 0)) return [lo];
    for (let v = start; ticks.length < 16 && v <= hi + step * 0.001; v += step) {
      if (v === ticks.at(-1)) break;
      ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    }
    return ticks;
  }

  /**
   * Format a tick number.
   * @param {number} v
   * @returns {string}
   * @private
   */
  _formatTick(v) {
    if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.01 && v !== 0)) {
      return v.toExponential(1);
    }
    // Remove floating-point artefacts
    const s = v.toPrecision(6);
    return String(parseFloat(s));
  }

  // ─── State Interpolation (tweening) ───────────────────────────────

  /**
   * Interpolate between two states for animation.
   * @param {SwarmState} a
   * @param {SwarmState} b
   * @param {number} t  0–1
   * @returns {SwarmState}
   * @private
   */
  _interpolateStates(a, b, t) {
    if (!a.particles || !b.particles) return t < 0.5 ? a : b;

    const particles = b.particles.map((bp, i) => {
      const ap = a.particles[i] || bp;
      return {
        ...bp,
        x: bp.x.map((bv, d) => lerp(ap.x?.[d] ?? bv, bv, t)),
        v: bp.v.map((bv, d) => lerp(ap.v?.[d] ?? bv, bv, t)),
        fitness: lerp(ap.fitness ?? bp.fitness, bp.fitness, t),
      };
    });

    return { ...b, particles };
  }

  // ─── Tooltip ──────────────────────────────────────────────────────

  /** @private */
  _createTooltip() {
    this._tooltip = document.createElement('div');
    this._tooltip.style.cssText =
      'position:absolute;pointer-events:none;padding:6px 10px;border-radius:6px;' +
      'font:11px/1.5 system-ui,sans-serif;white-space:pre-line;z-index:1000;' +
      'transition:opacity 0.15s;opacity:0;max-width:260px;';
    this._updateTooltipTheme();
    // Append to canvas parent so positioning is relative
    const parent = this._canvas.parentElement || document.body;
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    parent.appendChild(this._tooltip);
  }

  /** @private */
  _updateTooltipTheme() {
    if (!this._tooltip) return;
    const dark = isDarkTheme();
    this._tooltip.style.background = dark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';
    this._tooltip.style.color = dark ? '#E2E8F0' : '#1E293B';
    this._tooltip.style.border = dark ? '1px solid #334155' : '1px solid #E2E8F0';
    this._tooltip.style.boxShadow = dark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.1)';
  }

  /**
   * @param {MouseEvent} e
   * @private
   */
  _handleMouseMove(e) {
    if (!this._lastState || !this._fn) {
      this._hideTooltip();
      return;
    }

    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check if hovering a particle
    const state = this._lastState;
    if (state.particles) {
      for (const p of state.particles) {
        if (this._dimensions === 1 && !Number.isFinite(p.fitness)) continue;
        const cx = this._toCanvasX(p.x[0]);
        const cy = this._dimensions === 2 ? this._toCanvasY(p.x[1]) :
          this._toCanvasY(p.fitness);
        const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

        if (dist < 14) {
          const lines = [
            `P${p.id + 1}`,
            `x: [${p.x.map(v => v.toFixed(4)).join(', ')}]`,
            `v: [${p.v.map(v => v.toFixed(4)).join(', ')}]`,
            `f(x): ${formatFitness(p.fitness)}`,
            `pbest: [${p.pbest.map(v => v.toFixed(4)).join(', ')}]`,
            `f(pbest): ${formatFitness(p.pbest_fitness)}`,
          ];
          this._showTooltip(mx, my, lines.join('\n'));
          return;
        }
      }
    }

    // Hovering empty space — show coordinates and f value
    const pa = this._plotArea;
    if (mx >= pa.x && mx <= pa.x + pa.w && my >= pa.y && my <= pa.y + pa.h) {
      const pt = this.getPointAt(mx, my);
      let text;
      if (this._dimensions === 1) {
        const fv = this._fn(pt.x);
        text = `x: ${pt.x.toFixed(4)}\nf(x): ${formatFitness(fv)}`;
      } else {
        const fv = this._fn(pt.x, pt.y);
        text = `x₁: ${pt.x.toFixed(4)}\nx₂: ${pt.y.toFixed(4)}\nf(x): ${formatFitness(fv)}`;
      }
      this._showTooltip(mx, my, text);
    } else {
      this._hideTooltip();
    }
  }

  /**
   * @param {number} x  canvas-relative
   * @param {number} y
   * @param {string} text
   * @private
   */
  _showTooltip(x, y, text) {
    this._updateTooltipTheme();
    this._tooltip.textContent = text;
    this._tooltip.style.opacity = '1';
    const left = clamp(x + 14, 6, Math.max(6, this._width - this._tooltip.offsetWidth - 6));
    const top = clamp(y - 10, 6, Math.max(6, this._height - this._tooltip.offsetHeight - 6));
    this._tooltip.style.left = left + 'px';
    this._tooltip.style.top = top + 'px';
  }

  /** @private */
  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.opacity = '0';
  }
}
