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

/** Reversed viridis-like ramp (low = teal, high = red). 256 entries generated procedurally. */
function buildViridisReversed() {
  /** @type {Array<[number, number, number]>} */
  const stops = [
    [68, 1, 84],     // 0.00  deep purple
    [72, 35, 116],   // 0.10
    [64, 67, 135],   // 0.20
    [52, 94, 141],   // 0.30
    [33, 144, 140],  // 0.50  teal
    [42, 120, 142],  // 0.40
    [53, 183, 121],  // 0.60
    [109, 205, 89],  // 0.70
    [180, 222, 44],  // 0.80
    [253, 231, 37],  // 0.90  yellow
    [235, 85, 56],   // 0.95  orange-red
    [190, 10, 40],   // 1.00  red
  ];
  // Re-order: low values → teal, high → red. We'll build a smooth ramp.
  const ramp = [
    [33, 144, 140],   // 0.0  teal
    [42, 120, 142],   // 0.1
    [52, 94, 141],    // 0.2
    [64, 67, 135],    // 0.3
    [68, 1, 84],      // 0.4  deep purple
    [109, 60, 100],   // 0.5
    [180, 80, 60],    // 0.6
    [220, 120, 50],   // 0.7
    [240, 170, 40],   // 0.8
    [253, 231, 37],   // 0.9  yellow
    [245, 130, 40],   // 0.95 orange
    [200, 40, 40],    // 1.0  red
  ];

  /** @type {Array<[number, number, number]>} */
  const result = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const idx = t * (ramp.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, ramp.length - 1);
    const frac = idx - lo;
    result.push([
      Math.round(ramp[lo][0] + (ramp[hi][0] - ramp[lo][0]) * frac),
      Math.round(ramp[lo][1] + (ramp[hi][1] - ramp[lo][1]) * frac),
      Math.round(ramp[lo][2] + (ramp[hi][2] - ramp[lo][2]) * frac),
    ]);
  }
  return result;
}

const VIRIDIS_REVERSED = buildViridisReversed();
const GRAYSCALE_HEATMAP = Array.from({ length: 256 }, (_, index) => {
  const shade = 24 + Math.round((212 * index) / 255);
  return [shade, shade, shade];
});

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
    /** @type {number} */
    this._landscapeW = 0;
    /** @type {number} */
    this._landscapeH = 0;
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
    const leftPad = 55;
    const rightPad = this._dimensions === 2 ? 70 : 20;  // legend space in 2D
    const topPad = 15;
    const bottomPad = 40;
    this._plotArea = {
      x: leftPad,
      y: topPad,
      w: this._width - leftPad - rightPad,
      h: this._height - topPad - bottomPad,
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
      return mapRange(y, this._fMin, this._fMax,
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
      this._computeMinMax1D();
      return; // 1D landscape is drawn inline during _draw
    }

    // 2D: render heatmap to offscreen canvas
    const w = Math.max(1, Math.floor(pa.w));
    const h = Math.max(1, Math.floor(pa.h));

    // Sample function values
    const resolution = Math.min(w, 400);
    const resolutionY = Math.min(h, 400);
    const values = new Float64Array(resolution * resolutionY);
    let fMin = Infinity, fMax = -Infinity;

    for (let iy = 0; iy < resolutionY; iy++) {
      const py = this._domain[1][0] + (iy / (resolutionY - 1)) *
        (this._domain[1][1] - this._domain[1][0]);
      for (let ix = 0; ix < resolution; ix++) {
        const px = this._domain[0][0] + (ix / (resolution - 1)) *
          (this._domain[0][1] - this._domain[0][0]);
        const v = this._fn(px, py);
        values[iy * resolution + ix] = v;
        if (v < fMin) fMin = v;
        if (v > fMax) fMax = v;
      }
    }

    this._fMin = fMin;
    this._fMax = fMax;

    // Create offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = resolution;
    offscreen.height = resolutionY;
    const octx = offscreen.getContext('2d');
    const imgData = octx.createImageData(resolution, resolutionY);
    const data = imgData.data;

    const mode = this._options.displayMode;
    const showHeatmap = mode === DisplayMode.HEATMAP || mode === DisplayMode.BOTH;
    const palette = this._options.colorblind ? GRAYSCALE_HEATMAP : VIRIDIS_REVERSED;

    for (let iy = 0; iy < resolutionY; iy++) {
      for (let ix = 0; ix < resolution; ix++) {
        const idx = (iy * resolution + ix) * 4;
        if (showHeatmap) {
          const t = clamp((values[iy * resolution + ix] - fMin) / (fMax - fMin || 1), 0, 1);
          const ci = Math.round(t * 255);
          const [r, g, b] = palette[ci];
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          // Plain / contours-only: white/dark background
          const bg = isDarkTheme() ? 30 : 245;
          data[idx] = bg;
          data[idx + 1] = bg;
          data[idx + 2] = bg;
          data[idx + 3] = 255;
        }
      }
    }

    octx.putImageData(imgData, 0, 0);

    // Draw contour lines if needed
    const showContours = mode === DisplayMode.CONTOURS || mode === DisplayMode.BOTH;
    if (showContours) {
      this._drawContoursOnCanvas(octx, values, resolution, resolutionY, fMin, fMax);
    }

    this._landscapeCache = offscreen;
    this._landscapeW = w;
    this._landscapeH = h;
  }

  /** @private */
  _computeMinMax1D() {
    const steps = 500;
    const [xmin, xmax] = this._domain[0];
    let fMin = Infinity, fMax = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const x = xmin + (i / steps) * (xmax - xmin);
      const v = this._fn(x);
      if (v < fMin) fMin = v;
      if (v > fMax) fMax = v;
    }
    // Add padding
    const range = fMax - fMin || 1;
    this._fMin = fMin - range * 0.08;
    this._fMax = fMax + range * 0.08;
  }

  /**
   * Draw contour lines using marching-squares-like approach.
   * @private
   */
  _drawContoursOnCanvas(ctx, values, w, h, fMin, fMax) {
    const levels = this._options.contourLevels;
    const dark = isDarkTheme();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.8;

    for (let l = 1; l < levels; l++) {
      const threshold = fMin + (l / levels) * (fMax - fMin);

      // Simple horizontal line scanning for contour crossings
      for (let iy = 0; iy < h - 1; iy++) {
        for (let ix = 0; ix < w - 1; ix++) {
          const v00 = values[iy * w + ix];
          const v10 = values[iy * w + ix + 1];
          const v01 = values[(iy + 1) * w + ix];
          const v11 = values[(iy + 1) * w + ix + 1];

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
            ctx.beginPath();
            ctx.moveTo(crossings[0][0], crossings[0][1]);
            ctx.lineTo(crossings[1][0], crossings[1][1]);
            ctx.stroke();
            if (crossings.length === 4) {
              ctx.beginPath();
              ctx.moveTo(crossings[2][0], crossings[2][1]);
              ctx.lineTo(crossings[3][0], crossings[3][1]);
              ctx.stroke();
            }
          }
        }
      }
    }
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

    // Clear
    const bg = isDarkTheme() ? '#0F172A' : '#FFFFFF';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (!this._fn) return;

    if (this._dimensions === 1) {
      this._draw1D(ctx, state);
      return;
    }

    // ── 2D Mode ──

    // Draw landscape
    if (!this._landscapeCache) this._renderLandscape();
    if (this._landscapeCache) {
      ctx.drawImage(this._landscapeCache, pa.x, pa.y, pa.w, pa.h);
    }

    // Known optima
    this._drawOptima(ctx);

    // Axes
    this._drawAxes2D(ctx);

    // Colour-scale legend
    this._drawLegend(ctx);

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

    // Draw axes
    this._drawAxes1D(ctx);

    // Draw curve
    const [xmin, xmax] = this._domain[0];
    const steps = Math.min(Math.floor(pa.w), 600);

    ctx.beginPath();
    ctx.strokeStyle = dark ? '#94A3B8' : '#475569';
    ctx.lineWidth = 2;

    for (let i = 0; i <= steps; i++) {
      const x = xmin + (i / steps) * (xmax - xmin);
      const y = this._fn(x);
      const cx = this._toCanvasX(x);
      const cy = this._toCanvasY(y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    if (!state || !state.particles) return;

    // Draw gbest marker
    if (this._options.showGbest && state.gbest) {
      const gx = this._toCanvasX(state.gbest.position[0]);
      const gy = this._toCanvasY(state.gbest.fitness);
      ctx.save();
      ctx.fillStyle = '#FBBF24';
      ctx.shadowColor = '#FBBF24';
      ctx.shadowBlur = 10;
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⭐', gx, gy - 14);
      ctx.restore();
    }

    // Draw pbests
    if (this._options.showPbest) {
      state.particles.forEach((p, i) => {
        const pbx = this._toCanvasX(p.pbest[0]);
        const pby = this._toCanvasY(p.pbest_fitness);
        const col = PARTICLE_PALETTE[i % PARTICLE_PALETTE.length];

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        this._drawDiamond(ctx, pbx, pby, 5, false);
      });
    }

    // Draw particles
    state.particles.forEach((p, i) => {
      const x = p.x[0];
      const fx = p.fitness;
      const cx = this._toCanvasX(x);
      const cy = this._toCanvasY(fx);
      const col = PARTICLE_PALETTE[i % PARTICLE_PALETTE.length];

      // Drop-line to x-axis
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, pa.y + pa.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Velocity arrow along x-axis
      if (this._options.showVelocity && p.v && p.v[0] !== 0) {
        const arrowLen = (p.v[0] / (this._domain[0][1] - this._domain[0][0])) * pa.w;
        this._drawArrow(ctx, cx, pa.y + pa.h + 12, cx + arrowLen * 0.5, pa.y + pa.h + 12, col, 1.5);
      }

      // Particle dot
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = dark ? '#1E293B' : '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pulsing ring
      if (p.id === this._pulseParticleId ||
        (state.current_particle_index != null && i === state.current_particle_index)) {
        this._drawPulseRing(ctx, cx, cy, col);
      }

      // Label
      if (this._options.showLabels) {
        ctx.fillStyle = dark ? '#E2E8F0' : '#1E293B';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`P${p.id}`, cx, cy - 10);
      }
    });
  }

  // ─── 2D Particle Drawing ─────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SwarmState} state
   * @private
   */
  _drawParticles(ctx, state) {
    const dark = isDarkTheme();

    state.particles.forEach((p, i) => {
      const cx = this._toCanvasX(p.x[0]);
      const cy = this._toCanvasY(p.x[1]);
      const col = PARTICLE_PALETTE[i % PARTICLE_PALETTE.length];
      const radius = 7;

      // Velocity arrow
      if (this._options.showVelocity && p.v) {
        const domW = this._domain[0][1] - this._domain[0][0];
        const domH = this._domain[1][1] - this._domain[1][0];
        const vxPx = (p.v[0] / domW) * this._plotArea.w * 0.3;
        const vyPx = -(p.v[1] / domH) * this._plotArea.h * 0.3; // inverted y
        const mag = Math.sqrt(vxPx * vxPx + vyPx * vyPx);
        if (mag > 2) {
          const scale = Math.min(1, 50 / mag);
          this._drawArrow(ctx, cx, cy, cx + vxPx * scale, cy + vyPx * scale, col, 1.5);
        }
      }

      // Particle circle
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = dark ? '#1E293B' : '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pulsing ring for current particle
      if (p.id === this._pulseParticleId ||
        (state.current_particle_index != null && i === state.current_particle_index)) {
        this._drawPulseRing(ctx, cx, cy, col);
      }

      // ID label
      if (this._options.showLabels) {
        ctx.fillStyle = dark ? '#E2E8F0' : '#1E293B';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`P${p.id}`, cx, cy - radius - 3);
      }
    });
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
      if (!p.pbest || p.pbest.length < 2) return;
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
    if (!state.gbest || !state.gbest.position) return;
    const dim = this._dimensions;
    const gx = this._toCanvasX(state.gbest.position[0]);
    const gy = dim === 2 ? this._toCanvasY(state.gbest.position[1]) :
      this._toCanvasY(state.gbest.fitness);

    ctx.save();
    ctx.shadowColor = '#FBBF24';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#FBBF24';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⭐', gx, gy);
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
    if (!this._knownOptima || this._knownOptima.length === 0) return;
    const dark = isDarkTheme();

    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';

    this._knownOptima.forEach((pos) => {
      const cx = this._toCanvasX(pos[0]);
      const cy = this._dimensions === 2 ? this._toCanvasY(pos[1]) : this._toCanvasY(this._fn(pos[0]));
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s);
      ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx + s, cy - s);
      ctx.lineTo(cx - s, cy + s);
      ctx.stroke();
    });
  }

  // ─── Axes ─────────────────────────────────────────────────────────

  /** @private */
  _drawAxes2D(ctx) {
    const pa = this._plotArea;
    const dark = isDarkTheme();
    const textCol = dark ? '#94A3B8' : '#64748B';
    const lineCol = dark ? '#334155' : '#CBD5E1';

    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1;
    ctx.fillStyle = textCol;
    ctx.font = '11px system-ui, sans-serif';

    // Border
    ctx.strokeRect(pa.x, pa.y, pa.w, pa.h);

    // X-axis ticks
    const xTicks = this._niceTicks(this._domain[0][0], this._domain[0][1], 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xTicks.forEach((val) => {
      const x = this._toCanvasX(val);
      ctx.beginPath();
      ctx.moveTo(x, pa.y + pa.h);
      ctx.lineTo(x, pa.y + pa.h + 5);
      ctx.stroke();
      ctx.fillText(this._formatTick(val), x, pa.y + pa.h + 7);
    });

    // X label
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('x₁', pa.x + pa.w / 2, pa.y + pa.h + 24);

    // Y-axis ticks
    ctx.font = '11px system-ui, sans-serif';
    const yTicks = this._niceTicks(this._domain[1][0], this._domain[1][1], 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTicks.forEach((val) => {
      const y = this._toCanvasY(val);
      ctx.beginPath();
      ctx.moveTo(pa.x - 5, y);
      ctx.lineTo(pa.x, y);
      ctx.stroke();
      ctx.fillText(this._formatTick(val), pa.x - 8, y);
    });

    // Y label
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.translate(14, pa.y + pa.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x₂', 0, 0);
    ctx.restore();
  }

  /** @private */
  _drawAxes1D(ctx) {
    const pa = this._plotArea;
    const dark = isDarkTheme();
    const textCol = dark ? '#94A3B8' : '#64748B';
    const lineCol = dark ? '#334155' : '#CBD5E1';

    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1;
    ctx.fillStyle = textCol;

    // Border
    ctx.strokeRect(pa.x, pa.y, pa.w, pa.h);

    // X-axis
    const xTicks = this._niceTicks(this._domain[0][0], this._domain[0][1], 8);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xTicks.forEach((val) => {
      const x = this._toCanvasX(val);
      ctx.beginPath();
      ctx.moveTo(x, pa.y + pa.h);
      ctx.lineTo(x, pa.y + pa.h + 5);
      ctx.stroke();
      ctx.fillText(this._formatTick(val), x, pa.y + pa.h + 7);
    });

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('x', pa.x + pa.w / 2, pa.y + pa.h + 24);

    // Y-axis
    const yTicks = this._niceTicks(this._fMin, this._fMax, 6);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTicks.forEach((val) => {
      const y = this._toCanvasY(val);
      ctx.beginPath();
      ctx.moveTo(pa.x - 5, y);
      ctx.lineTo(pa.x, y);
      ctx.stroke();
      ctx.fillText(this._formatTick(val), pa.x - 8, y);

      // Grid line
      ctx.save();
      ctx.strokeStyle = dark ? 'rgba(51,65,85,0.5)' : 'rgba(203,213,225,0.5)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(pa.x, y);
      ctx.lineTo(pa.x + pa.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.translate(14, pa.y + pa.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('f(x)', 0, 0);
    ctx.restore();
  }

  // ─── Colour-Scale Legend ──────────────────────────────────────────

  /** @private */
  _drawLegend(ctx) {
    const pa = this._plotArea;
    const dark = isDarkTheme();
    const lx = pa.x + pa.w + 15;
    const ly = pa.y;
    const lw = 16;
    const lh = pa.h;
    const palette = this._options.colorblind ? GRAYSCALE_HEATMAP : VIRIDIS_REVERSED;

    // Draw gradient bar
    for (let i = 0; i < lh; i++) {
      const t = 1 - i / lh; // top = max, bottom = min
      const ci = Math.round(t * 255);
      const [r, g, b] = palette[ci];
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(lx, ly + i, lw, 1);
    }

    // Border
    ctx.strokeStyle = dark ? '#334155' : '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(lx, ly, lw, lh);

    // Min/max labels
    ctx.fillStyle = dark ? '#94A3B8' : '#64748B';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(this._formatTick(this._fMax), lx + lw + 4, ly);
    ctx.textBaseline = 'bottom';
    ctx.fillText(this._formatTick(this._fMin), lx + lw + 4, ly + lh);
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
    const rough = range / approxCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / mag;
    let step;
    if (residual <= 1.5) step = 1 * mag;
    else if (residual <= 3) step = 2 * mag;
    else if (residual <= 7) step = 5 * mag;
    else step = 10 * mag;

    const ticks = [];
    const start = Math.ceil(lo / step) * step;
    for (let v = start; v <= hi + step * 0.001; v += step) {
      ticks.push(v);
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
        const cx = this._toCanvasX(p.x[0]);
        const cy = this._dimensions === 2 ? this._toCanvasY(p.x[1]) :
          this._toCanvasY(p.fitness);
        const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

        if (dist < 14) {
          const lines = [
            `P${p.id}`,
            `x: [${p.x.map(v => v.toFixed(4)).join(', ')}]`,
            `v: [${p.v.map(v => v.toFixed(4)).join(', ')}]`,
            `f(x): ${p.fitness.toFixed(6)}`,
            `pbest: [${p.pbest.map(v => v.toFixed(4)).join(', ')}]`,
            `f(pbest): ${p.pbest_fitness.toFixed(6)}`,
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
        text = `x: ${pt.x.toFixed(4)}\nf(x): ${fv.toFixed(6)}`;
      } else {
        const fv = this._fn(pt.x, pt.y);
        text = `x₁: ${pt.x.toFixed(4)}\nx₂: ${pt.y.toFixed(4)}\nf(x): ${fv.toFixed(6)}`;
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
    this._tooltip.style.left = (x + 14) + 'px';
    this._tooltip.style.top = (y - 10) + 'px';
  }

  /** @private */
  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.opacity = '0';
  }
}
