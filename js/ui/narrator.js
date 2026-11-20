/**
 * @fileoverview Plain-language narrator for SwarmLab PSO teaching tool.
 * Generates beginner-friendly explanations for each micro-step,
 * with collapsible math views and an integrated glossary.
 * @module ui/narrator
 */

// ─── Glossary definitions ────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const GLOSSARY = {
  inertia:
    'A weight (w) that controls how much of its previous velocity a particle keeps. High inertia → the particle keeps moving in the same direction; low inertia → it slows down quickly.',
  cognitive:
    'The "personal memory" pull (c1·r1). It draws a particle back toward the best position it has personally found (pbest).',
  social:
    'The "swarm wisdom" pull (c2·r2). It draws a particle toward the best position any particle in its neighbourhood has found (gbest or lbest).',
  pbest:
    'Personal Best — the best position a single particle has visited so far, based on the fitness value at that position.',
  gbest:
    'Global Best — the best position found by any particle in the entire swarm (or in the particle\'s neighbourhood for Ring topology).',
  'velocity clamp':
    'An upper limit (Vmax) on how fast a particle can move in any dimension. Prevents particles from flying off to infinity.',
  topology:
    'The communication structure that determines which particles share information. "Global" means everyone talks to everyone; "Ring" means each particle only talks to its immediate neighbours.',
  diversity:
    'A measure of how spread out the particles are. High diversity = exploring widely; low diversity = converging on a small area.',
  convergence:
    'When all particles gather near the same position, ideally the global optimum. Can be premature if they gather at a non-optimal spot.',
  fitness:
    'The objective function value f(x) at a given position. In minimisation, lower fitness is better.',
  swarm:
    'The entire group of particles working together to search for the optimum.',
  particle:
    'A single candidate solution that moves through the search space. It has a position (x), velocity (v), and personal best (pbest).',
  iteration:
    'One complete cycle where every particle updates its velocity and position. The algorithm repeats for many iterations.',
  'micro-step':
    'A single sub-operation within one iteration — e.g., evaluate, update pbest, compute velocity. SwarmLab shows each one so you can see the algorithm in slow motion.',
};

/** @type {Set<string>} All glossary term keys, lowercase */
const GLOSSARY_KEYS = new Set(Object.keys(GLOSSARY));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wraps recognised glossary terms in the given text with tooltip spans.
 * @param {string} text
 * @returns {{html: string, found: string[]}}
 */
function annotateTerms(text) {
  // Keep glossary data out of generated attributes. The old implementation
  // inserted definitions into aria-label, then later regex passes matched
  // words inside those definitions and produced broken nested spans.
  {
    const found = [];
    let html = text;
    for (const term of Object.keys(GLOSSARY)) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b(${escaped})\\b`, 'gi');
      if (re.test(html)) {
        found.push(term);
        html = html.replace(re, `<span class="glossary-term" tabindex="0" data-term="${term}">$1<sup class="glossary-icon">i</sup></span>`);
      }
    }
    return { html, found };
  }

  const found = [];
  let html = text;
  for (const [term, definition] of Object.entries(GLOSSARY)) {
    // Case-insensitive whole-word match (handle multi-word terms too)
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${escaped})\\b`, 'gi');
    if (re.test(html)) {
      found.push(term);
      html = html.replace(
        re,
        `<span class="glossary-term" tabindex="0" data-term="${term}" aria-label="${definition.replace(/"/g, '&quot;')}">$1<sup class="glossary-icon">ⓘ</sup></span>`
      );
    }
  }
  return { html, found };
}

/**
 * Format a number to 4 decimal places (or fewer if integer).
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(4);
}

/**
 * Format an array of numbers.
 * @param {number[]} arr
 * @returns {string}
 */
function fmtArr(arr) {
  if (!arr) return '—';
  return '[' + arr.map(fmt).join(', ') + ']';
}

/**
 * Describe inertia weight in plain language.
 * @param {number} w
 * @returns {string}
 */
function describeW(w) {
  if (w >= 0.9) return 'keeps its momentum (high inertia)';
  if (w >= 0.5) return 'balances momentum and responsiveness';
  return 'slows down quickly (low inertia)';
}

/**
 * Describe topology in plain language.
 * @param {string} topology
 * @returns {string}
 */
function describeTopology(topology) {
  if (topology === 'ring') return 'ring topology — each particle only knows about its immediate neighbours';
  return 'global topology — every particle sees the best position found by anyone';
}

// ─── Narration generators per micro-step type ────────────────────────────────

/**
 * @typedef {Object} StepInfo
 * @property {string}  type            - Micro-step type
 * @property {number}  iteration       - Current iteration number
 * @property {number}  [particle_index]- Index of the active particle
 * @property {Object}  details         - Step-specific details
 */

/**
 * @typedef {Object} Params
 * @property {number}  w
 * @property {number}  c1
 * @property {number}  c2
 * @property {number}  N
 * @property {number}  D
 * @property {string}  topology
 * @property {string}  boundary
 * @property {number}  vmax_pct
 * @property {boolean} constriction
 * @property {string}  update_mode
 * @property {string}  inertia_schedule
 * @property {number}  [w_min]
 * @property {number}  [w_max]
 */

/**
 * @typedef {Object} Narration
 * @property {string}   text           - Plain-language explanation (HTML)
 * @property {string}   mathView       - Collapsible math formula + substitution (HTML)
 * @property {string[]} glossaryTerms  - Terms referenced
 */

/**
 * Generate narration for the "evaluate" micro-step.
 * @param {StepInfo} step
 * @param {Params} params
 * @returns {Narration}
 */
function narrateEvaluate(step, params) {
  const d = step.details || {};
  const particles = Array.isArray(d) ? d : d.particles || [];
  const best = particles.reduce((current, particle) =>
    !current || particle.fitness < current.fitness ? particle : current, null);
  const bestIdx = d.best_index ?? (best ? best.id + 1 : null);
  const bestFit = d.best_fitness ?? best?.fitness ?? null;

  let text =
    'We check how good each particle\'s current position is by plugging it into our objective function. ' +
    `This is like measuring how high or low the ground is for each of our ${params.N} particles.`;

  if (bestFit != null) {
    text += ` The best fitness this round is ${fmt(bestFit)}${bestIdx != null ? ` from Particle ${bestIdx}` : ''}.`;
  }

  let mathView = '<strong>Evaluation:</strong> For each particle <em>i</em>, compute <code>f(x<sub>i</sub>)</code>.';
  if (particles.length > 0 && particles.length <= 10) {
    mathView += '<table class="math-table"><tr><th>Particle</th><th>x</th><th>f(x)</th></tr>';
    for (const p of particles) {
      mathView += `<tr><td>${p.id}</td><td>${fmtArr(p.x)}</td><td>${fmt(p.fitness)}</td></tr>`;
    }
    mathView += '</table>';
  }

  const { html, found } = annotateTerms(text);
  return { text: html, mathView, glossaryTerms: found };
}

/**
 * Generate narration for the "update_pbest" micro-step.
 * @param {StepInfo} step
 * @param {Params} params
 * @returns {Narration}
 */
function narrateUpdatePbest(step, params) {
  const d = step.details || {};
  const improved = Array.isArray(d)
    ? d.filter((particle) => particle.improved).map((particle) => particle.id + 1)
    : d.improved_particles || [];
  const total = params.N;

  let text;
  if (improved.length === 0) {
    text =
      'Each particle compares its current spot with the best it has ever found. ' +
      'This time, none found a better spot, so they keep their previous personal best.';
  } else {
    const names = improved.length <= 5
      ? improved.map(id => `Particle ${id}`).join(', ')
      : `${improved.length} particles`;
    text =
      'Each particle compares its current spot with the best it has ever found. ' +
      `${names} found a better spot! ✔  The rest keep their previous personal best.`;
  }
  text += ` (${improved.length}/${total} improved)`;

  let mathView =
    '<strong>Personal best update:</strong> If <code>f(x<sub>i</sub>) &lt; f(pbest<sub>i</sub>)</code>, ' +
    'then <code>pbest<sub>i</sub> ← x<sub>i</sub></code>. Note: ties do <em>not</em> count; the value must be strictly less.';

  const { html, found } = annotateTerms(text);
  return { text: html, mathView, glossaryTerms: found };
}

/**
 * Generate narration for the "update_gbest" micro-step.
 * @param {StepInfo} step
 * @param {Params} params
 * @returns {Narration}
 */
function narrateUpdateGbest(step, params) {
  const d = step.details || {};
  const changed = d.changed ?? false;
  const gbestFit = d.gbest_fitness ?? d.gbest?.fitness ?? null;
  const gbestPos = d.gbest_position ?? d.gbest?.position ?? null;
  const prevFit = d.previous_fitness ?? d.previous?.fitness ?? null;
  const sourceId = d.source_particle ?? (d.gbest?.particle_id != null ? d.gbest.particle_id + 1 : null);

  let text;
  if (params.topology === 'ring') {
    text =
      'Now each particle looks at its ring neighbours (the particles directly next to it in the ring) to find the local best. ' +
      'In ring topology, information spreads slowly — a great discovery on one side takes several iterations to reach the other side.';
  } else {
    text =
      'Now we look across all particles to find the overall best position anyone has discovered so far. ';
  }

  if (changed) {
    text +=
      `The global best just improved!${sourceId != null ? ` Particle ${sourceId}` : ' The swarm'} found position ${fmtArr(gbestPos)} with fitness ${fmt(gbestFit)}` +
      (prevFit != null ? ` (was ${fmt(prevFit)}).` : '.');
  } else {
    text += `No improvement — the global best stays at ${fmt(gbestFit)}.`;
  }

  let mathView =
    `<strong>Global best update (${params.topology}):</strong> ` +
    `<code>gbest ← argmin f(pbest<sub>i</sub>)</code> over ${params.topology === 'ring' ? 'neighbours' : 'all particles'}. ` +
    `Current gbest fitness = <code>${fmt(gbestFit)}</code>.`;

  const { html, found } = annotateTerms(text);
  return { text: html, mathView, glossaryTerms: found };
}

/**
 * Generate narration for the "select_particle" micro-step.
 * @param {StepInfo} step
 * @param {Params} params
 * @returns {Narration}
 */
function narrateSelectParticle(step, params) {
  const i = step.particle_index ?? '?';
  const d = step.details || {};
  const pos = d.position ?? null;
  const vel = d.velocity ?? null;
  const pbestFit = d.pbest_fitness ?? null;

  let text =
    `Let's focus on Particle ${i} and see how it decides where to go next. ` +
    `It's currently at position ${fmtArr(pos)} moving with velocity ${fmtArr(vel)}.`;

  if (pbestFit != null) {
    text += ` Its personal best fitness so far is ${fmt(pbestFit)}.`;
  }

  const mathView =
    `<strong>Selected:</strong> Particle ${i}<br>` +
    `Position: <code>${fmtArr(pos)}</code><br>` +
    `Velocity: <code>${fmtArr(vel)}</code><br>` +
    `pbest fitness: <code>${fmt(pbestFit)}</code>`;

  const { html, found } = annotateTerms(text);
  return { text: html, mathView, glossaryTerms: found };
}

/**
 * Generate narration for the "compute_velocity" micro-step.
 * @param {StepInfo} step
 * @param {Params} params
 * @returns {Narration}
 */
function narrateComputeVelocity(step, params) {
  const i = step.particle_index;
  const d = Array.isArray(step.details) ? step.details[0] || {} : step.details || {};
  const subject = Number.isInteger(i) ? `Particle ${i + 1}` : 'Each particle';
  const { w, c1, c2 } = params;

  // Force decomposition
  const inertiaVec = d.inertia ?? [];
  const cogVec = d.cognitive ?? [];
  const socVec = d.social ?? [];
  const resultant = d.resultant ?? [];
  const r1 = d.r1 ?? [];
  const r2 = d.r2 ?? [];
  const oldV = d.old_velocity ?? [];
  const pbestArr = d.pbest ?? [];
  const gbestArr = d.gbest ?? [];
  const pos = d.position ?? [];
  const clamped = d.clamped ?? false;

  // Build the story
  let text =
    `${subject} decides where to go next. ` +
    `It remembers where it was heading (inertia), feels a pull towards the best place *it* has ever visited (its own memory), ` +
    `and a pull towards the best place *anyone* has found (the swarm's wisdom). `;

  // Compare social vs cognitive
  if (c2 > c1) {
    text += `Here the social pull is stronger because c2=${fmt(c2)} > c1=${fmt(c1)}, so the swarm's wisdom dominates. `;
  } else if (c1 > c2) {
    text += `Here the cognitive pull is stronger because c1=${fmt(c1)} > c2=${fmt(c2)}, so personal experience dominates. `;
  } else {
    text += `Cognitive and social pulls are balanced (c1=c2=${fmt(c1)}). `;
  }

  // Describe w
  text += `The particle ${describeW(w)} with w=${fmt(w)}.`;

  if (clamped) {
    text += ' ⚠ The velocity was clamped by Vmax to prevent it from flying too fast.';
  }

  if (params.constriction) {
    text += ' Constriction factor (χ) is applied to keep the swarm stable without needing a separate velocity clamp.';
  }

  if (!Array.isArray(d.resultant) || d.resultant.length === 0) {
    const { html, found } = annotateTerms(text);
    return {
      text: html,
      mathView: '<strong>Velocity update:</strong><br><code>v′ = w·v + c₁·r₁·(pbest − x) + c₂·r₂·(gbest − x)</code>',
      glossaryTerms: found
    };
  }

  // Math view — show the formula with substituted numbers
  let mathView =
    '<strong>Velocity update formula:</strong><br>' +
    '<code>v\'<sub>id</sub> = w·v<sub>id</sub> + c1·r1·(pbest<sub>id</sub> − x<sub>id</sub>) + c2·r2·(gbest<sub>d</sub> − x<sub>id</sub>)</code><br><br>';

  // Per-dimension breakdown
  const dims = Math.max(inertiaVec.length, 1);
  for (let dim = 0; dim < dims; dim++) {
    const dimLabel = dims === 1 ? '' : ` (dim ${dim + 1})`;
    mathView +=
      `<strong>Dimension ${dim + 1}${dimLabel}:</strong><br>` +
      `<code>v' = ${fmt(w)}×${fmt(oldV[dim])} + ${fmt(c1)}×${fmt(r1[dim])}×(${fmt(pbestArr[dim])} − ${fmt(pos[dim])}) + ${fmt(c2)}×${fmt(r2[dim])}×(${fmt(gbestArr[dim])} − ${fmt(pos[dim])})</code><br>` +
      `<code>  = ${fmt(inertiaVec[dim])} + ${fmt(cogVec[dim])} + ${fmt(socVec[dim])} = ${fmt(resultant[dim])}</code><br>`;
  }

  if (clamped) {
    mathView += `<br><em>Clamped to Vmax = ±${fmt(d.vmax)}</em>`;
  }

  const { html, found } = annotateTerms(text);
  return { text: html, mathView, glossaryTerms: found };
}

/**
 * Generate narration for the "move" micro-step.
 * @param {StepInfo} step
 * @param {Params} params
 * @returns {Narration}
 */
function narrateMove(step, params) {
  const i = step.particle_index;
  const d = Array.isArray(step.details) ? step.details[0] || {} : step.details || {};
  const oldPos = d.old_position ?? d.old_x ?? [];
  const newPos = d.new_position ?? d.new_x ?? [];
  const vel = d.velocity ?? d.new_v ?? [];
  const boundaryHit = d.boundary_hit ?? false;

  let text = `${Number.isInteger(i) ? `Particle ${i + 1}` : 'The particles'} move to ${Number.isInteger(i) ? 'its' : 'their'} new position by adding velocity to the current position. `;

  if (boundaryHit) {
    const bType = params.boundary || 'Clamp';
    const bDesc = {
      Clamp: 'clipped to the edge of the search space (clamped)',
      Reflect: 'bounced back from the boundary like a ball hitting a wall (reflected)',
      Absorb: 'placed at the boundary with its velocity set to zero (absorbed)',
    };
    text += `⚠ It tried to leave the search space and was ${bDesc[bType] || 'handled by the boundary rule'}. `;
  }

  if (oldPos.length && newPos.length) text += `It moved from ${fmtArr(oldPos)} to ${fmtArr(newPos)}.`;

  let mathView =
    '<strong>Position update:</strong><br>' +
    `<code>x<sub>new</sub> = x<sub>old</sub> + v</code><br>` +
    (oldPos.length && newPos.length ? `<code>${fmtArr(newPos)} = ${fmtArr(oldPos)} + ${fmtArr(vel)}</code>` : '<code>x′ = x + v</code>');

  if (boundaryHit) {
    mathView += `<br><em>Boundary handling: ${params.boundary || 'Clamp'}</em>`;
  }

  const { html, found } = annotateTerms(text);
  return { text: html, mathView, glossaryTerms: found };
}

/**
 * Generate narration for the "check_stop" micro-step.
 * @param {StepInfo} step
 * @param {Params} params
 * @returns {Narration}
 */
function narrateCheckStop(step, params) {
  const d = step.details || {};
  const iter = step.iteration ?? '?';
  const maxIter = params.max_iter ?? d.max_iterations ?? '?';
  const shouldStop = d.should_stop ?? d.finished ?? false;
  const reason = d.reason ?? d.reasons?.join(', ') ?? '';
  const gbestFit = d.gbest_fitness ?? null;
  const tolerance = d.tolerance ?? null;

  let text;
  if (shouldStop) {
    text =
      `We check if we should stop — and yes, we're done! ${reason || `We reached iteration ${iter} of ${maxIter}.`} ` +
      `The best fitness found is ${fmt(gbestFit)}.`;
  } else {
    text =
      `We check if we should stop. We're on iteration ${iter} of ${maxIter}` +
      (tolerance != null ? `, and the tolerance threshold hasn't been met yet` : '') +
      '. The search continues!';
  }

  let mathView =
    `<strong>Stopping criteria:</strong><br>` +
    `Iteration: ${iter} / ${maxIter}`;
  if (tolerance != null) {
    mathView += `<br>Tolerance: ${fmt(tolerance)} (not yet reached)`;
  }
  if (gbestFit != null) {
    mathView += `<br>Current gbest fitness: <code>${fmt(gbestFit)}</code>`;
  }

  const { html, found } = annotateTerms(text);
  return { text: html, mathView, glossaryTerms: found };
}

// ─── Dispatcher map ──────────────────────────────────────────────────────────

/** @type {Record<string, (step: StepInfo, params: Params) => Narration>} */
const NARRATORS = {
  evaluate: narrateEvaluate,
  update_pbest: narrateUpdatePbest,
  update_gbest: narrateUpdateGbest,
  select_particle: narrateSelectParticle,
  compute_velocity: narrateComputeVelocity,
  move: narrateMove,
  check_stop: narrateCheckStop,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a narration object for a given micro-step.
 * @param {StepInfo} stepInfo - Information about the current micro-step
 * @param {Params}   params   - Current PSO parameters
 * @returns {Narration} The narration with text, math view, and glossary terms
 */
export function generateNarration(stepInfo, params) {
  const narrator = NARRATORS[stepInfo.type];
  if (!narrator) {
    return {
      text: `<em>Unknown micro-step type: "${stepInfo.type}"</em>`,
      mathView: '',
      glossaryTerms: [],
    };
  }
  return narrator(stepInfo, params);
}

/**
 * Render a narration into the narrator panel container.
 * @param {HTMLElement} container - The narrator panel element
 * @param {Narration}   narration - Output from generateNarration
 */
export function renderNarrator(container, narration) {
  if (!container) return;

  // Step label
  const stepLabel = container.querySelector('.narrator-step-label');

  // Main text
  let contentEl = container.querySelector('.narrator-text');
  if (!contentEl) {
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'narrator-header';
    header.innerHTML = '<h3>📖 Narrator</h3>';
    container.appendChild(header);

    // Text area
    contentEl = document.createElement('div');
    contentEl.className = 'narrator-text';
    container.appendChild(contentEl);

    // Math view collapsible
    const details = document.createElement('details');
    details.className = 'narrator-math-view';
    const summary = document.createElement('summary');
    summary.textContent = '🔢 Math view';
    details.appendChild(summary);
    const mathContent = document.createElement('div');
    mathContent.className = 'narrator-math-content';
    details.appendChild(mathContent);
    container.appendChild(details);
  }

  // Update text
  contentEl.innerHTML = narration.text;

  // Update math view
  const mathDetails = container.querySelector('.narrator-math-view');
  const mathContent = container.querySelector('.narrator-math-content');
  if (mathContent) {
    mathContent.innerHTML = narration.mathView || '<em>No math details for this step.</em>';
  }
  if (mathDetails && !narration.mathView) {
    mathDetails.style.display = 'none';
  } else if (mathDetails) {
    mathDetails.style.display = '';
  }

  // Activate glossary tooltips on newly rendered terms
  _activateGlossaryTooltips(container);
}

/**
 * Initialise the glossary system: add styles and global event listeners.
 * Call once at app startup.
 */
export function initGlossary() {
  // Inject glossary styles if not already present
  if (document.getElementById('swarmlab-glossary-styles')) return;

  const style = document.createElement('style');
  style.id = 'swarmlab-glossary-styles';
  style.textContent = `
    .glossary-term {
      border-radius: 3px;
      background: var(--c-accent-subtle);
      color: var(--c-accent);
      cursor: help;
      padding: 0 2px;
      position: relative;
      white-space: nowrap;
    }
    .glossary-icon {
      font-size: 0.7em;
      color: currentColor;
      margin-left: 1px;
    }
    .glossary-tooltip {
      position: fixed;
      background: var(--c-text);
      color: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.85rem;
      line-height: 1.4;
      max-width: min(280px, calc(100vw - 16px));
      width: max-content;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
      animation: glossaryFadeIn 0.15s ease-out;
      overflow-wrap: anywhere;
      white-space: normal;
    }
    .glossary-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: var(--c-text);
    }
    @keyframes glossaryFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .narrator-header h3 {
      margin: 0 0 8px 0;
      font-size: 1rem;
      color: var(--c-text);
    }
    .narrator-text {
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 12px;
      color: var(--c-note-text);
    }
    .narrator-math-view {
      background: var(--c-surface-muted);
      border-radius: 6px;
      padding: 8px 12px;
      margin-top: 8px;
    }
    .narrator-math-view summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--c-accent);
      user-select: none;
    }
    .narrator-math-content {
      margin-top: 8px;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .narrator-math-content code {
      background: var(--c-surface-raised);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85em;
    }
    .math-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 0.85rem;
    }
    .math-table th, .math-table td {
      padding: 4px 8px;
      border: 1px solid var(--c-border);
      text-align: right;
    }
    .math-table th {
      background: var(--c-surface-muted);
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Attach hover/focus tooltip behaviour to glossary terms inside a container.
 * @param {HTMLElement} container
 * @private
 */
function _activateGlossaryTooltips(container) {
  const terms = container.querySelectorAll('.glossary-term');
  for (const el of terms) {
    // Skip if already activated
    if (el.dataset.glossaryActive) continue;
    el.dataset.glossaryActive = '1';

    const definition = GLOSSARY[el.dataset.term] || '';

    /** @type {HTMLElement|null} */
    let tooltip = null;

    const show = () => {
      if (tooltip) return;
      tooltip = document.createElement('div');
      tooltip.className = 'glossary-tooltip';
      tooltip.textContent = definition;
      document.body.appendChild(tooltip);

      const rect = el.getBoundingClientRect();
      const narrator = el.closest('.narrator, #panel-right');
      const narratorRect = narrator?.getBoundingClientRect();
      const viewport = { left: 8, right: window.innerWidth - 8, top: 8, bottom: window.innerHeight - 8 };
      const keepLeft = Math.max(viewport.left, narratorRect ? narratorRect.left + 8 : viewport.left);
      const keepRight = Math.min(viewport.right, narratorRect ? narratorRect.right - 8 : viewport.right);
      const keepTop = Math.max(viewport.top, narratorRect ? narratorRect.top + 4 : viewport.top);
      const keepBottom = Math.min(viewport.bottom, narratorRect ? narratorRect.bottom - 4 : viewport.bottom);

      const measuredWidth = Math.min(280, keepRight - keepLeft);
      tooltip.style.width = `${Math.max(120, measuredWidth)}px`;
      tooltip.style.left = '0';
      tooltip.style.top = '0';
      const tooltipRect = tooltip.getBoundingClientRect();
      const width = tooltipRect.width;
      const height = tooltipRect.height;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(keepLeft, Math.min(left, keepRight - width));
      let top = rect.top - height - 8;
      if (top < keepTop) top = rect.bottom + 8;
      top = Math.max(keepTop, Math.min(top, keepBottom - height));

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const hide = () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    };

    el.addEventListener('mouseenter', show);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', show);
    el.addEventListener('blur', hide);
  }
}
