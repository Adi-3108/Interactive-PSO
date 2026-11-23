# SwarmLab Final Assignment Audit

- **Audit date** 23 November 2026
- **Assignment deadline** 24 November 2026
- **Revision checked** `da764fb` on `master`

**Verdict** SwarmLab is on the right track. The core Particle Swarm Optimization lesson works in the browser and agrees with a hand calculation. The submission is incomplete. GitHub reports the repository as private, the expected public site returns HTTP 404, and the repository contains no demo video or video link.

## Assignment rubric

| Requirement | Result | Evidence |
| --- | --- | --- |
| Teach an eligible algorithm in a browser | Pass | SwarmLab teaches Particle Swarm Optimization. The local app ran in Chromium using a static server. |
| Choose a problem and change parameters | Pass | Six built-in objectives are available. Switching from Sphere 2D to Rastrigin and changing swarm size to 8 immediately produced eight particle rows plus the global best summary. |
| Play, pause, step, reset, and show the state | Pass | Playback advanced the iteration. Pause returned the control to Play. Reset restored iteration 0 and the original seeded state. Six single steps exposed velocity calculation, movement, fitness, personal best, swarm leader, and stopping conditions. The state table shows position, velocity, fitness, and best values. |
| Visualize and explain each step | Pass | The canvas shows the search landscape and particles, with a legend for inertia, cognitive, social, and resultant vectors. Phase labels and the Narrator explain what the simulation does. The worked run showed the Narrator explain P1 moving from 4 to 3. |
| Check against a hand calculation or textbook example | Pass | The two-iteration `f(x) = x²` example matched the hand calculation below. The standalone browser verification page passed 34 of 34 checks, and the separate Node verification script passed. The worksheet should identify the source behind its “Section 6” label or describe it as a worked hand calculation. |
| Add a distinctive learning feature | Pass for functionality | Predict then Reveal lets the learner commit to a landing coordinate, see the actual position, and get an error distance and streak score. A browser run on the worked example accepted `x = 3` and increased the streak to 1. The comparison and coaching features provide additional ways to explore PSO. |
| Public app link | Blocked | The expected GitHub Pages address returned HTTP 404. No alternate live URL is documented. [Expected Pages address](https://adi-3108.github.io/Interactive-PSO/) |
| GitHub link with README | Access blocked | The README exists and explains features and local use. GitHub CLI reported `PRIVATE`, and a signed-out request to the repository returned HTTP 404. Give the grader access or publish the repository if the course expects signed-out access. [Repository](https://github.com/Adi-3108/Interactive-PSO) |
| Demo video, 3–5 minutes | Unverified | No video or video link appears in the repository or README. A video stored elsewhere was outside the scope of this audit. |
| At most two team members | Unverified | Confirm the submitting team has at most two people and include their names in the submission. |

## Hand calculation evidence

Minimize `f(x) = x²` with three particles starting at `x = (4, −3, 2)`, zero initial velocities, and personal bests equal to their starting positions. The initial global best is `x = 2`, since `f(2) = 4` is the lowest initial fitness. Use synchronous updates with `w = 0.5`, `c₁ = c₂ = 1`, and `r₁ = r₂ = 0.5`.

The velocity rule is `v′ = wv + c₁r₁(pbest − x) + c₂r₂(gbest − x)`, followed by `x′ = x + v′`. In iteration 1, P2 gets `v′ = 0.5(0) + 0.5(−3 − (−3)) + 0.5(2 − (−3)) = 2.5`. It moves to `x′ = −3 + 2.5 = −0.5`. Its new fitness is `0.25`, so it sets the swarm record.

| Iteration | Particle | New velocity | New position | Fitness at new position | Personal best position |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | P1 | −1 | 3 | 9 | 3 |
| 1 | P2 | 2.5 | −0.5 | 0.25 | −0.5 |
| 1 | P3 | 0 | 2 | 4 | 2 |
| 2 | P1 | −2.25 | 0.75 | 0.5625 | 0.75 |
| 2 | P2 | 1.25 | 0.75 | 0.5625 | −0.5 |
| 2 | P3 | −1.25 | 0.75 | 0.5625 | 0.75 |

In iteration 2, all three particles reach `0.75`. The global best remains `−0.5` because `0.25 < 0.5625`. The worksheet and engine both reported these results. This example teaches why the best position the swarm has visited can differ from where its particles are now.

## Findings to address before submission

1. **Make the deliverables accessible.** Publish the static app and check it in a signed-out window. If using GitHub Pages, the existing site entry point is on `master` at `/(root)`. The README currently says `main`, so align the instructions with the branch you actually publish. Confirm grader access to the GitHub repository and the 3–5 minute video. [GitHub Pages publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. **Make the worksheet easy to reproduce.** Include the inputs and expected results above in the README. Cite the specific book or handout if “Section 6” comes from one. This assignment also accepts a self-contained hand calculation. With `r₂ = 0.25`, the worksheet showed “Check Discrepancy Found,” and loading the example left `r₂` at `0.25`. Setting it back to `0.5` restored the match. The Load button should restore the fixed inputs, or the message should explain that the custom run differs from the reference because the inputs changed. The README should also instruct graders to open the browser test page through the local server at `/js/tests/tests.html`.
3. **Keep Compare in sync with the selected experiment.** On Rastrigin with 12 particles, both swarms started at best fitness `9.7429`. After 10 iterations, Global reached `1.0071` and Ring reached `1.8931`. After changing the selected problem to Sphere 2D, Reset Both still restored the Rastrigin values. The comparison manager keeps the problem and parameters from its first activation. Refresh both engines when the experiment changes. Also make the topology labels agree with the actual engines when the left sidebar has Ring selected. The comparison uses a shared chart and two metric cards, so describe it that way in the demo and README.
4. **Use the base URL for submission while mode links are repaired.** Reloading a URL with `mode=compare` opened Learn and hid the Compare panel. Mode restoration should activate the corresponding UI. The same reload also dropped preset details such as the 50-iteration limit and fixed starting positions. If a share link promises reproducibility, it should restore the experiment settings needed to repeat that run.
5. **Polish narration.** In the browser, the opening progress check said “iterationi 0” while the toolbar showed iteration 1. The fitness narration also displayed “particlei.” Align the iteration count and render the glossary markers without the extra `i` appearing as part of the word.

## Suggested demo run of 4 minutes

| Time | What to show |
| --- | --- |
| 0:00–0:30 | Open the public URL and explain that particles search for the minimum of an objective using momentum, their own best position, and information from the swarm. |
| 0:30–1:20 | Start with Sphere 2D. Choose a second objective, change swarm size or inertia, then play, pause, and reset. Point to the landscape and state table. |
| 1:20–2:05 | Enable Micro and step through velocity, movement, fitness, and best updates. Explain one visible change using the Narrator. |
| 2:05–3:10 | Load the Hand-Calc Lab and work through P2 moving from `−3` to `−0.5` on paper or aloud. Show the matching engine result and the verification badge. |
| 3:10–4:00 | Start a Predict round, commit a guess, and show the actual landing point and error score. Finish with the public app and GitHub URLs. |

Before submitting, open the app, repository, and video links with the grader’s expected access. Start a fresh run from the deployed URL and repeat the worked example there. The intended submission contains all three links and the names of at most two team members.
