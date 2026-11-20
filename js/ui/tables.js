/**
 * @fileoverview Particle state table renderer with cell flash animations,
 * pinned global best row, precision toggle, and CSV export.
 * @module ui/tables
 */

let fullPrecision = false;
let prevParticles = new Map();

/**
 * Format a number according to precision settings.
 * @param {number} n
 * @returns {string}
 */
function formatNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (fullPrecision) return String(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

/**
 * Format vector coordinates.
 * @param {number[]} vec
 * @returns {string}
 */
function formatVec(vec) {
  if (!vec) return '—';
  return vec.map(formatNum).join(', ');
}

/**
 * Toggle precision mode.
 * @param {boolean} [enable]
 * @returns {boolean}
 */
export function togglePrecision(enable) {
  if (enable !== undefined) {
    fullPrecision = !!enable;
  } else {
    fullPrecision = !fullPrecision;
  }
  return fullPrecision;
}

/**
 * Render the state table into the target table tbody.
 * @param {HTMLElement|string} tbodySelector - Table body element or selector
 * @param {Array<Object>} particles - Particle states
 * @param {Object} gbest - Global best state
 * @param {Object} [options]
 */
export function renderTable(tbodySelector, particles, gbest, options = {}) {
  const tbody = typeof tbodySelector === 'string'
    ? document.querySelector(tbodySelector)
    : tbodySelector;
  if (!tbody) return;

  const D = particles && particles[0] ? particles[0].x.length : 2;

  // Header update if needed
  const table = tbody.closest('table');
  if (table) {
    const thead = table.querySelector('thead tr');
    if (thead) {
      if (D === 1) {
        thead.innerHTML = `
          <th>ID</th>
          <th>x</th>
          <th>v</th>
          <th>f(x)</th>
          <th>pbest</th>
          <th>f(pbest)</th>
          <th>Improved?</th>
        `;
      } else {
        thead.innerHTML = `
          <th>ID</th>
          <th>x, y</th>
          <th>vx, vy</th>
          <th>f(x, y)</th>
          <th>pbest</th>
          <th>f(pbest)</th>
          <th>Improved?</th>
        `;
      }
    }
  }

  let html = '';

  // 1. Pinned Global Best row on top
  if (gbest && gbest.position) {
    html += `
      <tr class="table-row--gbest" style="background: rgba(245, 179, 1, 0.12); font-weight: 600;">
        <td>⭐ gbest (P${gbest.particle_id != null ? gbest.particle_id + 1 : '?'})</td>
        <td class="font-mono">${formatVec(gbest.position)}</td>
        <td class="font-mono text-muted">—</td>
        <td class="font-mono" style="color: var(--c-gold, #F5B301);">${formatNum(gbest.fitness)}</td>
        <td class="font-mono">${formatVec(gbest.position)}</td>
        <td class="font-mono" style="color: var(--c-gold, #F5B301);">${formatNum(gbest.fitness)}</td>
        <td><span class="badge badge--success">Leader</span></td>
      </tr>
    `;
  }

  // 2. Particle rows
  if (particles && particles.length > 0) {
    for (const p of particles) {
      const prev = prevParticles.get(p.id);
      const isCurrent = options.activeParticleId === p.id;
      const rowClass = isCurrent ? 'table-row--active' : '';

      // Check for value changes to apply flash animation
      const xChanged = prev && (prev.x[0] !== p.x[0] || (prev.x[1] !== p.x[1]));
      const vChanged = prev && (prev.v[0] !== p.v[0] || (prev.v[1] !== p.v[1]));
      const fChanged = prev && prev.fitness !== p.fitness;
      const pbChanged = prev && prev.pbest_fitness !== p.pbest_fitness;

      const flash = (changed) => (changed ? ' class="cell-flash"' : '');

      const improvedBadge = p.improved
        ? '<span class="badge badge--success">✔ Improved</span>'
        : '<span class="badge badge--muted">✖ Kept</span>';

      html += `
        <tr class="${rowClass}" data-particle-id="${p.id}">
          <td class="font-mono font-bold">P${p.id + 1}</td>
          <td class="font-mono"${flash(xChanged)}>${formatVec(p.x)}</td>
          <td class="font-mono"${flash(vChanged)}>${formatVec(p.v)}</td>
          <td class="font-mono"${flash(fChanged)}>${formatNum(p.fitness)}</td>
          <td class="font-mono"${flash(pbChanged)}>${formatVec(p.pbest)}</td>
          <td class="font-mono"${flash(pbChanged)}>${formatNum(p.pbest_fitness)}</td>
          <td>${improvedBadge}</td>
        </tr>
      `;

      // Save to map for next diff
      prevParticles.set(p.id, {
        x: p.x.slice(),
        v: p.v.slice(),
        fitness: p.fitness,
        pbest_fitness: p.pbest_fitness
      });
    }
  }

  tbody.innerHTML = html;
}

/**
 * Export execution history to a downloadable CSV file.
 * @param {Array<Object>} history - Full state history snapshots
 * @param {string} [filename='swarmlab_history.csv']
 */
export function exportCSV(history, filename = 'swarmlab_history.csv') {
  if (!history || history.length === 0) {
    alert('No history data to export.');
    return;
  }

  const sampleState = history[0];
  const D = sampleState.particles && sampleState.particles[0] ? sampleState.particles[0].x.length : 2;

  let headers = ['Iteration', 'ParticleID'];
  for (let d = 0; d < D; d++) headers.push(`x${d}`);
  for (let d = 0; d < D; d++) headers.push(`v${d}`);
  headers.push('Fitness');
  for (let d = 0; d < D; d++) headers.push(`pbest${d}`);
  headers.push('PBest_Fitness', 'Improved', 'GBest_Fitness');

  const rows = [headers.join(',')];

  for (const snap of history) {
    const iter = snap.iteration;
    const gFitness = snap.gbest ? snap.gbest.fitness : '';
    if (!snap.particles) continue;

    for (const p of snap.particles) {
      const row = [iter, p.id + 1];
      for (let d = 0; d < D; d++) row.push(p.x[d]);
      for (let d = 0; d < D; d++) row.push(p.v[d]);
      row.push(p.fitness);
      for (let d = 0; d < D; d++) row.push(p.pbest[d]);
      row.push(p.pbest_fitness);
      row.push(p.improved ? 1 : 0);
      row.push(gFitness);
      rows.push(row.join(','));
    }
  }

  const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Initialize table controls (precision toggle, CSV export).
 * @param {HTMLElement} container
 * @param {Function} getHistoryFn
 */
export function initTable(container, getHistoryFn) {
  if (!container) return;
  const existingToolbar = container.querySelector('.table-toolbar');
  if (existingToolbar) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'table-toolbar form-row--inline';
  toolbar.style.padding = '8px 12px';
  toolbar.style.display = 'flex';
  toolbar.style.justifyContent = 'space-between';
  toolbar.style.alignItems = 'center';

  toolbar.innerHTML = `
    <label class="toggle" title="Toggle 4 decimals vs full precision">
      <input type="checkbox" class="toggle__input" id="table-precision-toggle">
      <span class="toggle__track"><span class="toggle__thumb"></span></span>
      <span class="toggle__label" style="font-size:12px;">Full Precision</span>
    </label>
    <button class="btn btn--secondary btn--sm" id="btn-export-csv" type="button" aria-label="Export history as CSV">
      📥 Download CSV
    </button>
  `;

  container.insertBefore(toolbar, container.firstChild);

  const precisionInput = toolbar.querySelector('#table-precision-toggle');
  if (precisionInput) {
    precisionInput.addEventListener('change', (e) => {
      togglePrecision(e.target.checked);
      // Fire event to re-render table
      container.dispatchEvent(new CustomEvent('table-precision-change', { bubbles: true }));
    });
  }

  const csvBtn = toolbar.querySelector('#btn-export-csv');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      const history = getHistoryFn ? getHistoryFn() : [];
      exportCSV(history);
    });
  }
}
