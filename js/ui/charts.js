/**
 * Canvas charts for convergence, diversity and swarm comparison.
 * All drawing coordinates are CSS pixels, including iteration selection.
 */

const NUMBER_FONT = '11px "JetBrains Mono", ui-monospace, monospace';
const LABEL_FONT = '600 11px Inter, system-ui, sans-serif';
const LOG_FLOOR = 1e-9;

const SERIES = {
  best: { key: 'best', label: 'Best', tone: 'best', width: 2.6, dash: [] },
  mean: { key: 'mean', label: 'Mean', tone: 'mean', width: 1.7, dash: [6, 4] },
  worst: { key: 'worst', label: 'Worst', tone: 'worst', width: 1.5, dash: [2, 4] },
  diversity: { key: 'diversity', label: 'Swarm diversity', tone: 'diversity', width: 2.6, dash: [] },
};
const COMPARISON = [
  { ...SERIES.best, label: 'A · Global', tone: 'global' },
  { ...SERIES.mean, label: 'B · Ring', tone: 'ring' },
];

function formatTick(value) {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e4 || (magnitude > 0 && magnitude < 0.01)) return value.toExponential(1);
  return String(Number(value.toPrecision(3)));
}

export class ChartRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      type: 'convergence',
      logScale: false,
      onClickIteration: null,
      ...options
    };
    this.history = [];
    this.currentIteration = 0;

    this._setupCanvas();
    this._bindEvents();
    if ('ResizeObserver' in window) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this._setupCanvas()) this.render();
      });
      this._resizeObserver.observe(this.canvas);
    }
  }

  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height || !this.ctx) return false;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    this.logicalWidth = width;
    this.logicalHeight = height;
    return true;
  }

  _bindEvents() {
    this.canvas.addEventListener('click', (event) => {
      if (!this.options.onClickIteration || !this.history.length || !this.plot) return;

      const { left } = this.canvas.getBoundingClientRect();
      const { x, width, last } = this.plot;
      const offset = event.clientX - left - x;
      if (offset < -1 || offset > width + 1) return;

      const fraction = Math.max(0, Math.min(1, offset / width));
      this.options.onClickIteration(Math.round(fraction * last));
    });

    window.addEventListener('resize', () => {
      if (this._setupCanvas()) this.render();
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
    const root = document.documentElement;
    const dark = root.getAttribute('data-theme') === 'dark';
    const styles = getComputedStyle(root);
    return {
      text: styles.getPropertyValue('--c-text-soft').trim(),
      heading: styles.getPropertyValue('--c-text-strong').trim(),
      grid: dark ? 'rgba(191, 199, 214, .13)' : 'rgba(73, 86, 117, .13)',
      axis: dark ? '#505D73' : '#C3C9DA',
      cursor: dark ? '#AEBBCC' : '#65748C',
      pointEdge: styles.getPropertyValue('--c-graph-surface').trim(),
      best: dark ? '#65DFD7' : '#087F82',
      mean: dark ? '#A8B7F4' : '#506BAB',
      worst: dark ? '#F4A587' : '#AC593D',
      diversity: dark ? '#72DDB3' : '#167A61',
      global: styles.getPropertyValue('--c-accent').trim(),
      ring: styles.getPropertyValue('--c-warning').trim(),
      area: dark ? 'rgba(136, 164, 188, .15)' : 'rgba(91, 137, 158, .12)',
      diversityArea: dark ? 'rgba(134, 179, 164, .15)' : 'rgba(84, 148, 132, .12)',
    };
  }

  render() {
    const ctx = this.ctx;
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    if (!ctx || !w || !h) return;

    this.plot = null;
    ctx.clearRect(0, 0, w, h);

    const colors = this._getThemeColors();
    const data = this.history;
    const diversity = this.options.type === 'diversity';
    const series = this.options.comparison
      ? COMPARISON
      : diversity ? [SERIES.diversity] : [SERIES.best, SERIES.mean, SERIES.worst];
    let min = Infinity;
    let max = -Infinity;
    for (const row of data) {
      for (const item of series) {
        const value = row?.[item.key];
        if (!Number.isFinite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }

    if (min === Infinity) {
      ctx.fillStyle = colors.text;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No history values to plot', w / 2, h / 2);
      return;
    }

    if (diversity) min = 0;
    const log = this.options.logScale && min >= 0;
    if (log) {
      min = Math.log10(Math.max(LOG_FLOOR, min));
      max = Math.log10(Math.max(LOG_FLOOR, max));
      if (min === max) max += 1;
    } else if (min === max) {
      const padding = Math.abs(min || 1) * 0.1;
      if (min > 0) min -= padding;
      else if (min < 0) max += padding;
      else max = 1;
    }

    const yTicks = h < 135 ? 3 : 4;
    const labels = Array.from({ length: yTicks + 1 }, (_, i) => {
      const fraction = i / yTicks;
      const value = (1 - fraction) * max + fraction * min;
      return formatTick(log ? 10 ** value : value);
    });

    ctx.font = NUMBER_FONT;
    const left = Math.max(35, ...labels.map(label => ctx.measureText(label).width + 16));
    const right = 15;
    const top = 35;
    const bottom = 33;
    const width = w - left - right;
    const height = h - top - bottom;
    if (width <= 0 || height <= 0) return;

    const last = data.length - 1;
    this.plot = { x: left, width, last };
    const getX = (iteration) => left + (iteration / Math.max(1, last)) * width;
    const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
    const low = min / scale;
    const range = max / scale - low || 1;
    const getY = (value) => {
      const mapped = log ? Math.log10(Math.max(LOG_FLOOR, value)) : value;
      return top + (1 - (mapped / scale - low) / range) * height;
    };

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    labels.forEach((label, index) => {
      const y = top + index / yTicks * height;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.fillText(label, left - 8, y);
    });

    const xTicks = Math.min(width < 260 ? 4 : 6, last);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let index = 0; index <= xTicks; index++) {
      const iteration = xTicks ? Math.round(index / xTicks * last) : 0;
      const x = getX(iteration);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
      ctx.fillText(String(iteration), x, top + height + 6);
    }

    ctx.strokeStyle = colors.axis;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + height);
    ctx.lineTo(left + width, top + height);
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'bottom';
    ctx.fillText('Iteration', left + width / 2, h - 3);

    // Missing values break lines and fills so they cannot imply observed data.
    for (const item of [...series].reverse()) {
      let segment = [];
      const primary = item === series[0] && !this.options.comparison;
      const gradient = primary ? ctx.createLinearGradient(0, top, 0, top + height) : null;
      if (gradient) {
        gradient.addColorStop(0, diversity ? colors.diversityArea : colors.area);
        gradient.addColorStop(1, 'transparent');
      }
      const drawSegment = () => {
        if (segment.length > 1) {
          ctx.beginPath();
          segment.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
          ctx.strokeStyle = colors[item.tone];
          ctx.lineWidth = item.width;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.setLineDash(item.dash);
          ctx.stroke();

          if (gradient) {
            ctx.lineTo(segment.at(-1)[0], top + height);
            ctx.lineTo(segment[0][0], top + height);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
          }
        } else if (segment.length === 1) {
          this._drawPoint(segment[0][0], segment[0][1], colors[item.tone], colors.pointEdge, 2.8);
        }
        segment = [];
      };

      data.forEach((row, index) => {
        const value = row?.[item.key];
        if (Number.isFinite(value)) segment.push([getX(index), getY(value)]);
        else drawSegment();
      });
      drawSegment();
    }
    ctx.setLineDash([]);

    const current = this.currentIteration;
    if (current >= 0 && current <= last) {
      const x = getX(current);
      ctx.strokeStyle = colors.cursor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Use a larger marker for B so both series show when the results coincide.
      [...series].reverse().forEach((item) => {
        const value = data[current]?.[item.key];
        if (!Number.isFinite(value)) return;
        const radius = this.options.comparison && item !== series[0] ? 7 : 4;
        this._drawPoint(x, getY(value), colors[item.tone], colors.pointEdge, radius);
      });
    }

    this._drawLegend(series, colors, w, diversity);
  }

  _drawPoint(x, y, color, edge, radius) {
    const ctx = this.ctx;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  _drawLegend(series, colors, width, diversity) {
    const ctx = this.ctx;
    const compact = width < 315;
    const y = 16;
    let x = 13;
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    if (!compact) {
      const metric = diversity ? 'Distance' : 'Fitness';
      ctx.fillStyle = colors.text;
      ctx.fillText(metric, x, y);
      x += ctx.measureText(metric).width + 17;
    }

    for (const item of series) {
      ctx.strokeStyle = colors[item.tone];
      ctx.lineWidth = item.width;
      ctx.lineCap = 'round';
      ctx.setLineDash(item.dash);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 15, y);
      ctx.stroke();

      ctx.fillStyle = colors.heading;
      ctx.fillText(item.label, x + 21, y);
      x += ctx.measureText(item.label).width + (compact ? 31 : 38);
    }
    ctx.setLineDash([]);
  }
}

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
