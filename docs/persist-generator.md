# Block generator

`npm run persist:generate -- --track pump-lift-4x --seed 7 --start 2027-01-04` writes a new six-week block to `data/generated/` (gitignored) and prints the main lifts it chose. It reads the Layer 4 view files, so run `npm run persist:views` first. Output is `{ options, weeks, plan, warnings }`, where `weeks` are `WeekView` objects (the schema in `src/persist/views.ts`), so anything that renders a published week renders a generated one.

Options: `--track` (Pump Lift or Pump Condition, 5x/4x/3x), `--seed` (same seed, same block), `--start` (a Monday), `--equipment dumbbell,kettlebell,pull-up-bar` (what you own; bodyweight is always allowed), `--allow-recent` (allow main lifts from the latest published block).

The core is `generate()` in `src/persist/generate.ts`. It has no I/O, so a Void route can call it later with views loaded from D1.

## How a block is built

Everything is sampled from published material and recombined under the rules in `data/reports/analysis.md`.

1. **Layout.** Each of the five 5x training days gets a (main, secondary) pattern pair sampled from observed blocks. Of 300 draws, the one covering the most core patterns (squat and hinge weighted highest) is kept.
2. **Variation.** Each strength slot gets an A/B pair, A on odd weeks and B on even weeks. Half the time the pair is one the program published; otherwise it is two exercises with the same pattern, equipment and per-side flag. Exercises from the latest published block are avoided.
3. **Progression.** The six-week sets, reps, RPE, tempo and rest come from a different observed slot with the same pattern and role.
4. **Supporting sections.** Strength balance (A/B), finisher (Pump Lift) or conditioning (Pump Condition), warm-up and cooldown are sampled from observed days with the same main-lift pattern; finishers and conditioning do not repeat within the block. Recovery days are sampled from the track's own recovery days.
5. **4x and 3x.** The days kept are the subset of the 5x days that covers the most patterns, in 5x order.

## Limits

- Perform and Minimalist are not generated yet.
- Pump Condition and Pump Lift are generated independently, so a Pump Condition block does not copy a Pump Lift block's main lifts the way the published program does.
- The 4x and 3x tracks reuse the kept 5x day's supporting sections. The published program often replaces them (3x almost always does).
- Only blocks with all six weeks observed are donors, which excludes the two blocks with missing weeks. Giant-set and every-N-minutes strength sections are not generated.
- Focus notes carry only the lift names, and the Day 7 note is empty: the program's prose is not generated.
- Equipment comes from name-based rules in `src/persist/classify.ts`. When nothing matches, the warning list says so and the slot ignores your equipment.
