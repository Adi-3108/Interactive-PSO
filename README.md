# SwarmLab — Interactive Particle Swarm Optimization

SwarmLab is an interactive, browser-only educational platform designed to teach Particle Swarm Optimization (PSO) to students and researchers.

## Features

- **Interactive Visualizer:** High-performance HTML5 Canvas rendering for 1D curves and 2D landscapes with heatmap contours, force decomposition vectors, and trajectory trails.
- **Micro-Step Granularity:** Step through every phase of an iteration: evaluation, personal best updates, global leader selection, velocity computation, and physical moves.
- **Hand-Calc Lab:** Step-by-step mathematical verification environment where students can input custom random numbers ($r_1, r_2$) and compare calculations against textbook reference solutions.
- **Predict-then-Reveal:** An active learning mode prompting students to anticipate particle landing coordinates before reveal, scoring intuition and tracking streaks.
- **Swarm Health Coach:** Real-time diagnostic advisor detecting stagnation, divergence, and premature convergence with one-click parameter fixes.
- **A/B Compare Mode:** Dual synchronized swarms running side-by-side with identical initial conditions to isolate the effects of parameters and topologies (Global vs. Ring).
- **Zero Dependencies:** Pure ES modules, no build tools, no external libraries.

## How to Run Locally

You can run SwarmLab with any static file server:

```bash
# Python 3
python -m http.server 8000

# Or with Node.js
npx serve .
```

Then open `http://localhost:8000` in your web browser.

## Running Tests

Automated engine verification can be run in two ways:

1. **In the Browser:** Open `js/tests/tests.html` directly in your browser.
2. **Via Node.js:**
   ```bash
   node js/engine/test_pso.js
   ```

## Deploying to GitHub Pages

1. Commit all files to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial SwarmLab release"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In your GitHub repository settings:
   - Navigate to **Settings** > **Pages**.
   - Under **Build and deployment**, set the source branch to `main` and folder to `/ (root)`.
   - Save and visit your published URL.
