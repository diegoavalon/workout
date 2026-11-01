# Block generator

`npm run persist:generate -- --track pump-lift-4x --seed 7 --start 2027-01-04` writes a new six-week block to `data/generated/` (gitignored) and prints the main lifts it chose. It reads the Layer 4 view files, so run `npm run persist:views` first. Output is `{ options, weeks, plan, warnings }`, where `weeks` are `WeekView` objects (the schema in `src/persist/views.ts`), so anything that renders a published week renders a generated one.

Options: `--track` (any of the eight tracks), `--seed` (same seed, same block), `--start` (a Monday), `--equipment dumbbell,kettlebell,pull-up-bar` (what you own; bodyweight is always allowed), `--allow-recent` (allow main lifts from the latest published block).

The core is `generate()` in `src/persist/generate.ts`. It has no I/O, so a Void route can call it later with views loaded from D1.

## How a block is built

Everything is sampled from published material and recombined under the rules in `data/reports/analysis.md`.

1. **Layout.** Each of the five Pump Lift 5x training days gets a (main, secondary) pattern pair sampled from observed blocks. Draws are rejected until one has the essentials: squat, hinge, both presses and a pull. Maximizing coverage instead over-trained pulls.
2. **Variation.** Each strength slot gets an A/B pair, A on odd weeks and B on even weeks. Half the time the pair is one the program published; otherwise it is two exercises with the same pattern, equipment and per-side flag. Exercises from the latest published block are avoided.
3. **Progression.** The six-week sets, reps, RPE, tempo and rest come from a different observed slot with the same pattern and role.
4. **Coupling.** Steps 1 to 3 use their own random stream, seeded the same for every track. One seed therefore gives Pump Lift, Pump Condition and Perform the same main lifts on the same days, as the published program does.
5. **Supporting sections.** Strength balance (A/B), finisher (Pump Lift) or conditioning (other tracks), warm-up and cooldown are sampled from observed days of the requested track with the same main-lift pattern; finishers and conditioning do not repeat within the block. Perform gets a hot start or speed-strength piece that stays one kind per day and alternates A/B. Recovery days are sampled from the track's own recovery days.
6. **Fewer days.** The 4x, 3x and Minimalist tracks keep the subset of the 5x days that covers the most patterns, in 5x order.
7. **Minimalist** keeps each day's pattern but uses its own dumbbell and bodyweight lifts. Where it has none for a pattern, a Pump Lift one restricted to that kit is borrowed, and the warnings say so.

`npm run persist:generator-check` generates 60 Pump Lift 5x blocks and compares them with the published weeks; the result is in `data/reports/generator-check.md`. Pattern coverage and volume are close to the published program (single-leg and presses within about a set per week). Horizontal pulling is over-represented (about 4.7 against 2.7 sets a week) and vertical pulling is covered less often (38% of weeks against 64%).

## Limits

- The 4x, 3x and Minimalist tracks reuse the kept 5x day's supporting sections. The published program often replaces them (3x almost always does).
- Only blocks with all six weeks observed are donors, which excludes the two blocks with missing weeks. Giant-set and every-N-minutes strength sections are not generated.
- Focus notes carry only the lift names, and the Day 7 note is empty: the program's prose is not generated.
- Equipment comes from name-based rules in `src/persist/classify.ts`. When nothing matches, the warning list says so and the slot ignores your equipment.
- Pump Condition and Perform copy the main lifts but not the published program's coupling of balance and conditioning to those lifts.
