/**
 * @fileoverview Canvas-based charts for SwarmLab: Convergence and Diversity.
 * Zero external dependencies. High-DPI support, dark/light theme aware,
 * interactive click-to-scrub.
 * @module ui/charts
 */

export class ChartRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      type: 'convergence', // 'convergence' | 'diversity'
      logScale: false,
      onClickIteration: null,
      ...options
    };

    this.history = []; // [{iteration, best, mean, worst, diversity}]
    this.currentIteration = 0;

    this._setupCanvas();
    this._bindEvents();
    if ('ResizeObserver' in window) {
      this._resizeObserver = new ResizeObserver(() => {
        if (!this.canvas || this.canvas.offsetParent === null) return;
        this._setupCanvas();
        this.render();
      });
      this._resizeObserver.observe(this.canvas);
    }
  }

  _setupCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 200;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.logicalWidth = width;
    this.logicalHeight = height;
  }

  _bindEvents() {
    if (!this.canvas) return;
    this.canvas.addEventListener('click', (e) => {
      if (!this.options.onClickIteration || this.history.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const padding = { left: 55, right: 20 };
      const chartW = this.logicalWidth - padding.left - padding.right;
      if (x < padding.left || x > this.logicalWidth - padding.right) return;

      const frac = (x - padding.left) / chartW;
      const maxIter = Math.max(1, this.history.length - 1);
      const clickedIter = Math.round(frac * maxIter);
      this.options.onClickIteration(clickedIter);
    });

    window.addEventListener('resize', () => {
      this._setupCanvas();
      this.render();
    });
  }

  setHistory(history, currentIteration = 0) {
    this.history = history || [];
    this.currentIteration = currentIteration;
    this.render();
  }

  setCurrentIteration(iter) {
    this.currentIteration = iter;
    this.render();
  }

  setLogScale(enabled) {
    this.options.logScale = !!enabled;
    this.render();
  }

  _getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const colors = this.options.comparison ? getComputedStyle(document.documentElement) : null;
    return {
      bg: isDark ? '#161D28' : '#FFFFFF',
      text: isDark ? '#9AA7B8' : '#5B6778',
      textStrong: isDark ? '#E8EDF4' : '#1B2430',
      border: isDark ? '#263243' : '#E3E7EE',
      grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      best: colors?.getPropertyValue('--c-accent').trim() || '#F5B301',
      mean: colors?.getPropertyValue('--c-warning').trim() || '#2563EB',
      worst: '#DC2626',   // red
      diversity: '#10B981', // emerald
      indicator: isDark ? '#FFFFFF' : '#111827'
    };
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    const colors = this._getThemeColors();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.clearRect(0, 0, w, h);

    if (!this.history || this.history.length === 0) {
      ctx.fillStyle = colors.text;
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No history data available yet.', w / 2, h / 2);
      return;
    }

    const padding = { top: 25, right: 25, bottom: 35, left: 55 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Collect bounds
    const data = this.history;
    const N = data.length;
    const maxIter = Math.max(1, N - 1);

    let minY = Infinity;
    let maxY = -Infinity;

    if (this.options.type === 'convergence') {
      for (const d of data) {
        if (d.best != null && !isNaN(d.best)) {
          minY = Math.min(minY, d.best);
          maxY = Math.max(maxY, d.best);
        }
        if (d.mean != null && !isNaN(d.mean)) {
          minY = Math.min(minY, d.mean);
          maxY = Math.max(maxY, d.mean);
        }
        if (d.worst != null && !isNaN(d.worst)) {
          minY = Math.min(minY, d.worst);
          maxY = Math.max(maxY, d.worst);
        }
      }
    } else {
      // Diversity
      minY = 0;
      for (const d of data) {
        if (d.diversity != null && !isNaN(d.diversity)) {
          maxY = Math.max(maxY, d.diversity);
        }
      }
      if (maxY <= 0) maxY = 1;
    }

    if (minY === Infinity || maxY === -Infinity) {
      minY = 0;
      maxY = 1;
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    // Y transform function
    const useLog = this.options.logScale && minY >= 0;
    const logMin = useLog ? Math.log10(Math.max(1e-6, minY)) : 0;
    const logMax = useLog ? Math.log10(Math.max(1e-5, maxY)) : 1;

    const getY = (val) => {
      if (useLog) {
        const lv = Math.log10(Math.max(1e-6, val));
        const frac = (lv - logMin) / (logMax - logMin || 1);
        return padding.top + (1 - Math.max(0, Math.min(1, frac))) * chartH;
      }
      const frac = (val - minY) / (maxY - minY || 1);
      return padding.top + (1 - frac) * chartH;
    };

    const getX = (i) => padding.left + (i / maxIter) * chartW;

    // Draw grid & Y axis ticks
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.text;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = 4;
    for (let t = 0; t <= yTicks; t++) {
      const frac = t / yTicks;
      const y = padding.top + frac * chartH;
      let val = useLog
        ? Math.pow(10, logMax - frac * (logMax - logMin))
        : maxY - frac * (maxY - minY);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const label = val >= 1e4 || (val < 1e-2 && val > 0)
        ? val.toExponential(1)
        : val.toFixed(val < 10 ? 2 : 0);
      ctx.fillText(label, padding.left - 8, y);
    }

    // X axis ticks
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = Math.min(5, maxIter);
    for (let t = 0; t <= xTicks; t++) {
      const iterVal = Math.round((t / xTicks) * maxIter);
      const x = getX(iterVal);

      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartH);
      ctx.stroke();

      ctx.fillText(String(iterVal), x, padding.top + chartH + 8);
    }

    // Axis labels
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.fillText('Iteration', padding.left + chartW / 2, h - 14);

    ctx.save();
    ctx.translate(14, padding.top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(this.options.type === 'convergence' ? 'Fitness f(x)' : 'Centroid Diversity', 0, 0);
    ctx.restore();

    // Plot lines helper
    const drawLine = (prop, color, lineWidth = 2) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < data.length; i++) {
        const val = data[i][prop];
        if (val == null || isNaN(val)) continue;
        const px = getX(i);
        const py = getY(val);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    };

    if (this.options.type === 'convergence') {
      if (!this.options.comparison) drawLine('worst', colors.worst, 1.5);
      drawLine('mean', colors.mean, 2);
      drawLine('best', colors.best, 2.5);

      // Legend
      const legend = this.options.comparison ? [
        { label: 'A · Global', color: colors.best },
        { label: 'B · Ring', color: colors.mean }
      ] : [
        { label: 'Best f(g)', color: colors.best },
        { label: 'Mean', color: colors.mean },
        { label: 'Worst', color: colors.worst }
      ];
      this._drawLegend(ctx, legend, padding.left + 10, padding.top - 15);
    } else {
      drawLine('diversity', colors.diversity, 2.5);

      // Fill area under diversity curve
      ctx.fillStyle = isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)';
      ctx.beginPath();
      ctx.moveTo(getX(0), padding.top + chartH);
      for (let i = 0; i < data.length; i++) {
        ctx.lineTo(getX(i), getY(data[i].diversity || 0));
      }
      ctx.lineTo(getX(data.length - 1), padding.top + chartH);
      ctx.closePath();
      ctx.fill();

      this._drawLegend(ctx, [
        { label: 'Swarm Diversity (Mean distance to centroid)', color: colors.diversity }
      ], padding.left + 10, padding.top - 15);
    }

    // Current iteration vertical marker
    if (this.currentIteration >= 0 && this.currentIteration <= maxIter) {
      const curX = getX(this.currentIteration);
      ctx.save();
      ctx.strokeStyle = colors.indicator;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(curX, padding.top);
      ctx.lineTo(curX, padding.top + chartH);
      ctx.stroke();

      // Current point dot
      const pt = data[this.currentIteration];
      if (pt) {
        ctx.setLineDash([]);
        const targetVal = this.options.type === 'convergence' ? pt.best : pt.diversity;
        if (targetVal != null && !isNaN(targetVal)) {
          const py = getY(targetVal);
          ctx.fillStyle = this.options.type === 'convergence' ? colors.best : colors.diversity;
          ctx.beginPath();
          ctx.arc(curX, py, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  _drawLegend(ctx, items, x, y) {
    ctx.font = '11px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    let curX = x;
    for (const item of items) {
      ctx.fillStyle = item.color;
      ctx.fillRect(curX, y - 4, 12, 8);

      ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#E8EDF4' : '#1B2430';
      ctx.fillText(item.label, curX + 16, y);

      curX += ctx.measureText(item.label).width + 30;
    }
  }
}

/**
 * Convenience factories
 */
export function renderConvergence(canvas, history, currentIter, options = {}) {
  const chart = new ChartRenderer(canvas, { type: 'convergence', ...options });
  chart.setHistory(history, currentIter);
  return chart;
}

export function renderDiversity(canvas, history, currentIter, options = {}) {
  const chart = new ChartRenderer(canvas, { type: 'diversity', ...options });
  chart.setHistory(history, currentIter);
  return chart;
}
