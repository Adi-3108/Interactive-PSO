/**
 * @fileoverview Benchmark optimization functions for PSO visualization.
 * Each function object provides evaluation, domain bounds, known optima, and metadata.
 * @module engine/functions
 */

/**
 * @typedef {Object} BenchmarkFunction
 * @property {string} id - Unique identifier.
 * @property {string} name - Display name.
 * @property {string} formula - LaTeX-ish formula string.
 * @property {function(number, number): number} fn - Evaluation function f(x, y).
 * @property {number[][]} domain - [[xmin, xmax], [ymin, ymax]].
 * @property {number} known_min - Known global minimum value.
 * @property {number[]} known_min_pos - Position of the known global minimum.
 * @property {string} description - Human-readable description.
 * @property {string} difficulty - 'easy' | 'medium' | 'hard'.
 * @property {number} dimensions - 1 or 2.
 */

/** @type {BenchmarkFunction[]} */
export const benchmarkFunctions = [
  {
    id: 'textbook1d',
    name: 'Textbook 1D (x²)',
    formula: 'f(x) = x²',
    fn: (x, _y) => x * x,
    domain: [[-5, 5], [-5, 5]],
    known_min: 0,
    known_min_pos: [0],
    description: 'Simple quadratic bowl. The classic textbook example for PSO — one dimension, one global minimum at the origin.',
    difficulty: 'easy',
    dimensions: 1
  },
  {
    id: 'sphere2d',
    name: 'Sphere 2D',
    formula: 'f(x,y) = x² + y²',
    fn: (x, y) => x * x + y * y,
    domain: [[-5.12, 5.12], [-5.12, 5.12]],
    known_min: 0,
    known_min_pos: [0, 0],
    description: 'The 2D sphere function — a smooth, symmetric bowl with a single global minimum at the origin. The simplest 2D benchmark.',
    difficulty: 'easy',
    dimensions: 2
  },
  {
    id: 'rastrigin',
    name: 'Rastrigin',
    formula: 'f(x,y) = 20 + x² - 10cos(2πx) + y² - 10cos(2πy)',
    fn: (x, y) => {
      const A = 10;
      return 2 * A +
        (x * x - A * Math.cos(2 * Math.PI * x)) +
        (y * y - A * Math.cos(2 * Math.PI * y));
    },
    domain: [[-5.12, 5.12], [-5.12, 5.12]],
    known_min: 0,
    known_min_pos: [0, 0],
    description: 'Highly multimodal with many regularly distributed local minima. Tests the swarm\'s ability to escape local optima.',
    difficulty: 'hard',
    dimensions: 2
  },
  {
    id: 'rosenbrock',
    name: 'Rosenbrock',
    formula: 'f(x,y) = (1−x)² + 100(y−x²)²',
    fn: (x, y) => {
      const a = 1 - x;
      const b = y - x * x;
      return a * a + 100 * b * b;
    },
    domain: [[-2, 2], [-1, 3]],
    known_min: 0,
    known_min_pos: [1, 1],
    description: 'The banana-shaped valley. Easy to find the valley, hard to converge to the minimum. A classic test of exploitation.',
    difficulty: 'medium',
    dimensions: 2
  },
  {
    id: 'ackley',
    name: 'Ackley',
    formula: 'f(x,y) = -20exp(-0.2√(0.5(x²+y²))) - exp(0.5(cos2πx+cos2πy)) + e + 20',
    fn: (x, y) => {
      const sum1 = x * x + y * y;
      const sum2 = Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y);
      return -20 * Math.exp(-0.2 * Math.sqrt(0.5 * sum1)) -
        Math.exp(0.5 * sum2) + Math.E + 20;
    },
    domain: [[-5, 5], [-5, 5]],
    known_min: 0,
    known_min_pos: [0, 0],
    description: 'Nearly flat outer region with a deep hole at the centre, surrounded by many small local minima. Tests both exploration and exploitation.',
    difficulty: 'hard',
    dimensions: 2
  },
  {
    id: 'himmelblau',
    name: 'Himmelblau',
    formula: 'f(x,y) = (x²+y−11)² + (x+y²−7)²',
    fn: (x, y) => {
      const a = x * x + y - 11;
      const b = x + y * y - 7;
      return a * a + b * b;
    },
    domain: [[-5, 5], [-5, 5]],
    known_min: 0,
    known_min_pos: [3, 2],
    known_minima: [
      [3, 2],
      [-2.805118, 3.131312],
      [-3.77931, -3.283186],
      [3.584428, -1.848126]
    ],
    description: 'Four identical global minima — the swarm may split across them. Tests topology and neighbourhood structure.',
    difficulty: 'medium',
    dimensions: 2
  }
];

export const PROBLEMS = benchmarkFunctions;
export default benchmarkFunctions;
