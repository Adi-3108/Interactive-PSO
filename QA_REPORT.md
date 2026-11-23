# SwarmLab Functional QA Report

## Retest on 24 November 2026

All 13 findings below passed their Chromium reproduction checks after the fixes. The standalone browser suite and Node verification both passed **40 of 40** checks, including six new regressions. The textbook calculation and the independent sweep of 144 runs and 2,160 iterations passed again.

| Findings | Retest result |
| --- | --- |
| QA-01, QA-05 | Zero reached the active run for each affected field. A swarm size of 1 produced one particle row plus its leader summary. |
| QA-02, QA-04 | After switching from Rastrigin to Sphere 2D, Compare reset to the new initial best of `1.3522` and displayed the Global and Ring labels consistently. A custom `y^2` run produced fitness values matching each coordinate squared. |
| QA-03, QA-07, QA-08 | Predict scored the clamped landing at `(1.1094, −5.12)` with zero error. The 1D X-only field and canvas guesses both worked. Loading the textbook case reset `r₂` to `0.5` and matched the reference. |
| QA-06 | Linear Decay produced a different path from Constant. In the worked example, P3 moved to `0.75` in Asynchronous and remained at `2` in Synchronous. |
| QA-09, QA-10, QA-11 | Reset applied the latest edited value at step 0. Continue applied the new value at step 6 and resumed playback. Scrubbing restored the earlier setting and phase. Full Precision updated the paused table immediately. |
| QA-12, QA-13 | The first visit opened the guided tour. Skip, every Next and Back button, Finish, and reopening from Help worked. At 320 px the Help button fit and opened, and a problem could be selected with the keyboard in the settings drawer. |

CSV file saving remains an unverified browser behavior. The original export data check passed.

## Original QA pass on 23 November 2026

- **Date** 23 November 2026
- **Build** Local workbench redesign in the working tree, based on `da764fb`
- **Environment** Chromium desktop and responsive viewports, Python static server on `localhost:8765`, and Node.js for engine and component checks

**Verdict** The core lesson works. All 34 built-in engine checks passed, the textbook calculation matched, and the visualizer went through all six phases. Several optional modes and settings can silently produce a different result than the screen promises. The four correctness findings below should take priority before a demo that uses those features.

## Correctness findings

| ID | Priority | Reproduction and observed result | Expected behavior |
| --- | --- | --- | --- |
| QA-01 | High | In **Learn**, enter `0` for inertia, cognitive weight, social weight, and seed. The controls display `0`, but the run URL still reports `w=0.729`, `c1=1.494`, `c2=1.494`, and `seed=42`. Numeric input parsing uses a truthy fallback in `js/ui/controls.js`. | A valid zero should reach the engine. In particular, a learner should be able to turn off cognitive or social pull. |
| QA-02 | High | Open **Compare** on Rastrigin with `N=12` and seed `42`. The run starts at best fitness `9.7429`. Select Sphere 2D and click **Reset Both**. The stage shows Sphere 2D with initial best fitness `1.3522`, but Compare resets to `9.7429` again. In a fresh run, selecting Ring before opening Compare also produces a **Global** legend above an A card labeled **ring**. | Refresh both comparison engines when the problem or relevant settings change. Labels should agree with the engines and the two plotted series. |
| QA-03 | High | In **Sphere 2D**, set Clamp explicitly in Advanced Options, `N=25`, `w=1.5`, `c₁=c₂=1.494`, `Vmax=20%`, and seed `3`. Start a Predict round and submit `(1.1094, −5.12)`. The State table shows P1 landing at `(1.1094, −5.1200)`. The reveal calls `(1.109, −6.772)` the actual target and reports error `1.652`. | Score against the position the simulator actually reaches after applying the selected boundary rule. |
| QA-04 | High | Under **Use a custom objective**, enter `y^2`. The app accepts it as `Custom f(y)` but every particle gets zero fitness, including a particle at coordinate `1.0110`. A function using only `y` is given a one-dimensional search, while the evaluator receives that dimension as `x` and supplies `y=0`. | Evaluate the chosen variable along the active search dimension, or guide the learner to use `x` for one-dimensional expressions. |

## Other functional and accessibility findings

| ID | Priority | Reproduction and observed result | Expected behavior |
| --- | --- | --- | --- |
| QA-05 | Medium | Set `N=1`. The field and help text allow it, but the State table contains two particles plus the leader row. `N=100` correctly produces 100 particle rows plus the leader. | The advertised range should match the accepted range, and the field should show the applied value. |
| QA-06 | Medium | Pick **Linear Decay** in Advanced Options and compare the same seed and settings with **Constant**. The tested particle followed exactly the same path for four iterations. The engine's decay works with explicit, different `w_min` and `w_max`; the UI supplies neither, so both default to `w`. In a separate engine comparison, **Asynchronous** updated the leader earlier during the move phase, but both modes followed identical complete trajectories for the tested five iterations. | Linear Decay should change the inertia weight over time. Explain the exact behavior of Asynchronous or implement in-iteration leader influence if that is what the option is meant to teach. |
| QA-07 | Medium | Start a Textbook 1D Predict round. A canvas click does nothing, and **Submit Guess** still requires a Y value. Entering `X=3, Y=0` scores `0.000` on the worked example. | The 1D view should accept the canvas click or a single X coordinate. |
| QA-08 | Medium | In Hand-Calc, change `r₂` to `0.25` and click **Load Textbook Example**. It loads the preset onto the simulation but leaves `r₂=0.25` in the worksheet and reports a discrepancy. **Set 0.5** followed by **Run Engine Auto-Check** restores the exact match. | The load action should restore the worksheet's fixed example values, or clearly distinguish the custom comparison from the preset. |
| QA-09 | Medium | Run one iteration, click Play, and change `w`. **Reset from Start** resets the step but keeps the old applied `w`; the field displays the new value. In a second run, **Continue Run** applies the new `w`, resets history from step `6` to `0`, and leaves playback paused. | Both actions should apply their stated behavior and keep the visible inputs synchronized with the run. |
| QA-10 | Medium | Pause on a State table row and toggle **Full Precision**. The switch checks, but values stay rounded until the next step or another render. The example `1.1094` becomes `1.1094081428575164` after stepping. | Redraw the current snapshot immediately when precision changes. |
| QA-11 | Medium | Advance six micro-steps, then click **Step back**, or scrub to an existing snapshot. The numeric state changes correctly, but the stage says **Ready to explore**. The math disclosure can disappear on a restored snapshot. | Restore the phase label and explanation that correspond to the historical state. |
| QA-12 | Medium | On the QA session's first visit, the browser marked `tour-step-1` as current, but the tour overlay remained `display: none`. All 12 tour buttons were unreachable. Source inspection found the CSS rule that shows the overlay only with `is-active`, and no code that adds that class. | If the guided tour is offered, give learners an entry point and make its Next, Back, Skip, and Finish actions reachable. |
| QA-13 | Medium | At a 320 px viewport, the usable width measured 310 px, while the Help button occupied x=312–352. The page clips it. At 375 px the button fits. Separately, all six objective cards have `tabIndex=-1` and no keyboard handler, so the standard Tab sequence cannot reach them. | Keep Help reachable at narrow widths and support keyboard-only objective selection. |

## Coverage by feature

| Area | Result | Evidence |
| --- | --- | --- |
| Built-in engine verification | Pass | `node js/engine/test_pso.js` passed the worked example. `runVerification()` passed 34 of 34. The standalone browser page and the main app's verification dialog both displayed 34 passes. The dialog's Re-run button and both close buttons worked. |
| Independent engine sweep | Pass | Ran 144 simulations and 2,160 complete iterations across all six objectives, three boundary rules, Global and Ring topologies, both update modes, and seeds 0 and 42. Checked finite fitness, positions within the chosen bounds, velocity clamp limits, non-increasing global best, and stopping at the maximum iteration. Explicit linear decay changed the trajectory. Seeded repeats and RNG state restoration were deterministic. |
| Problem controls | Pass with exceptions | Clicked all six built-in objective cards and all six preset buttons. Every selection changed the shown problem or preset settings and produced finite initial results. `sin(x)+1` and `x^2+y^2` loaded successfully; `x+` displayed a parse error. The accepted `y^2` objective is incorrect (QA-04). |
| Parameters | Pass with exceptions | Verified all five slider and numeric input pairs in both directions. Random seed changed the active seed. A maximum of 2 iterations stopped at iteration 2. All Advanced Options menus and the constriction switch accepted changes. QA-01, QA-05, QA-06, and QA-09 cover incorrect behavior after some valid changes. |
| Playback and shortcuts | Pass with exception | Play advanced, Pause stopped, Reset restored the seeded values, and Step ran the six phases in order. Next iteration and Micro-step off ran full iterations. Playback speed reached `0.25×` and `10×`. Step back and timeline scrub restored numeric state. Verified Space, arrow keys, Shift+Right, R, M, D, `?`, and Escape. Historical narration remains inaccurate (QA-11). |
| State, Formula, and charts | Pass with exception | State values and Formula updated, Math view opened on a live step, diversity diagnostics opened and closed, and clicking Convergence jumped to a historical step. Full Precision only updates on a subsequent render (QA-10). |
| CSV export | Partially verified | Independently verified that the export generated `swarmlab_history.csv` with 12 columns and 39 rows for 3 particles over 13 snapshots, and requested a download through an anchor. The in-app browser download capture timed out, so a saved browser file was not verified. |
| Hand-Calc Lab | Pass with exception | At `r₁=r₂=0.5`, the app reported an exact match. P2 moved to `−0.5` and obtained fitness `0.25`, which remained the global record after the second iteration. Custom random values changed the computed result, and **Set 0.5** restored the reference inputs. Loading the example can retain a prior custom value (QA-08). |
| Predict | Pass with exceptions | 2D Start Round, typed and canvas guesses, submission validation, feedback, streak scoring, hint toggle text, and all difficulty options responded. Confirmed zero error for a correct 1D typed guess with `Y=0`. Boundary scoring and 1D interactions fail (QA-03 and QA-07). The force arrow overlay itself was not verified visually. |
| Compare | Pass with exceptions | Step Both Swarms, Run 10 Iterations, and Reset Both worked on the initial objective. Global and Ring started from the same fitness and then diverged. A reload restored the selected Compare tab and panel. The comparison can retain stale configuration or give conflicting topology labels (QA-02). |
| Help, quiz, toast, and Coach | Pass with exceptions | Opened Help, closed it using X, Got it, and Escape, and tested the Learn PSO drawer and its correct and incorrect quiz choices. Dismissed a toast. Momentum Overload triggered a divergence warning, and Apply Suggestion reduced `w` from `1.1` to `0.77` and started a fresh run. The guided tour remains hidden (QA-12). |
| Themes and palette | Pass | Dark mode and Colour-blind palette toggled independently and retained their preferences across reload. A renderer-level pixel check confirmed that the 2D heatmap switches to multiple grayscale shades. The mobile Dark mode switch also worked. |
| Responsive layout | Pass with exception | Tested widths of 320, 375, 768, 850, 851, 1199, 1200, and 1440 px in Chromium. At 375 px both drawers opened and dismissed, all four mode tabs opened their panels, and the stage fit. The 320 px Help button is clipped (QA-13). |

## QA limits

Browser checks used Chromium and simulated viewport widths. Physical touch devices, Safari, Firefox, screen-reader output, public hosting, and the submission video were outside this pass. Browser CSV file saving and the Predict force arrow overlay remain unverified. Checks covered each exposed control group and representative settings and edge cases. They do not exhaust every possible formula, seed, or parameter combination.
