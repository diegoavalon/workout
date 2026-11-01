# Block generator: design, method and validation

This document describes how the generator builds a training block, why each step works the way it does, how to tell whether a generated block is any good, and how to change its behaviour. The decisions behind it are logged separately in [persist-decisions.md](persist-decisions.md). The evidence it relies on is in `data/reports/analysis.md`.

## 1. What it is

The generator produces a new six-week block for one of the eight Persist tracks by **remixing material the program has already published**. It does not invent exercises, set schemes or sessions. Every lift, rep scheme, superset, warm-up, cooldown and recovery session in its output was taken from a published week, and the only new things are the *combinations* and the *order*.

It is a command-line tool over the Layer 4 view files. The core is one pure function, `generate()` in `src/persist/generate.ts`, with no file or network access, so a Void route can call it later with the same inputs loaded from D1.

What it is not:

- It does not reproduce Marcus Filly's judgment. It follows the regularities measured in the published weeks (section 4), and a block can satisfy every measured rule and still be a poor programme.
- It does not write coaching text. Focus notes carry the lift names and the Day 7 note is empty.
- It does not know the user. There is no training history, load, injury or preference input beyond a list of available equipment.

## 2. Quick start

```
npm run persist:all         # rebuild the data (needed once; produces data/views/)
npm run persist:generate -- --track pump-lift-4x --seed 12 --start 2027-01-04 \
  --equipment barbell,dumbbell,kettlebell,bench,pull-up-bar
```

| Option | Meaning |
|---|---|
| `--track` | One of `pump-lift-5x/4x/3x`, `pump-condition-5x/4x/3x`, `perform`, `minimalist` |
| `--seed` | Integer. The same seed, track, start and options always give the same block |
| `--start` | A Monday: week 1 of the block |
| `--equipment` | Comma list of what you own. `bodyweight` is always allowed. Omit for no restriction |
| `--allow-recent` | Permit lifts from the latest published block (avoided by default) |
| `--out` | Output path. Default `data/generated/<track>-seed<n>-<start>.json` |

The tool prints the chosen lifts, any warnings, and a checklist of automatic checks (section 7). The JSON file holds `{ options, weeks, checks, plan, warnings }`. `weeks` are `WeekView` objects (schema in `src/persist/views.ts`), the same shape as a published week, so anything that renders a published week renders a generated one.

Related commands: `npm run persist:generator-check` (fidelity against the published program), `npm run persist:patterns` (review sheet of the exercise grouping).

## 3. Where it sits in the pipeline

```
PDFs ──persist:extract──> data/text ──persist:parse──> data/source (Layer 1)
                                                            │
                                         persist:seed       ▼
                              D1 tables + exercise catalog (Layer 2, source of truth)
                                                            │
                         persist:analyze                    ▼ persist:views
         data/reports/analysis.md, data/design (Layer 3)   data/views (Layer 4)
                                                            │
                                                            ▼ persist:generate
                                                   data/generated (a new block)
```

The generator reads only `data/views`. It learns from those files at run time, so re-running the pipeline after any fix (a new pattern override, a re-parsed week) changes what it can produce. Nothing about the program is hard-coded except the rules listed in section 9.

## 4. The evidence it is built on

Each generator behaviour answers a finding from the analysis (`data/reports/analysis.md`, rule numbers in brackets).

| Finding in the published program | What the generator does |
|---|---|
| Week layout is fixed per track, e.g. Pump Lift 5x is train, train, train, recover, train, train, note (99.8% of days) [1] | Takes each track's day types from the corpus, so a generated week has the same shape |
| Every training session follows its family's skeleton (97.4%) [2] | Builds exactly that section order; the skeleton check enforces it |
| Squat, hinge and both presses appear in nearly every Pump Lift 5x week; pulls and single-leg work less reliably [3] | Draws a day layout from observed layouts and accepts it only if it has squat, hinge, both presses and a pull |
| The main lift alternates between two variations on odd and even weeks (83% of main-lift slots) [4] | Gives every strength slot an A/B pair, A on weeks 1, 3, 5 and B on weeks 2, 4, 6 |
| A new block almost never repeats the previous block's main lift in the same slot (3%); exercises do come back after a gap [5] | Avoids lifts from the latest published block by default |
| Working sets ramp RPE 7/8/9; set count and tempo are constant within a block; opening reps fall about two every two weeks [6] | Copies a complete six-week sequence from an observed slot instead of inventing numbers |
| Pump Condition and Perform use the Pump Lift main lift on the same day (97%) [7] | Draws the main-lift plan from a random stream that is the same for every track, so one seed gives them the same lifts |
| The 4x and 3x tracks keep a different subset of the 5x days in every block [8] | Keeps the subset of 5x days that covers the most patterns (squat first) |
| Minimalist keeps the pattern but not the lift [9] | Uses the Pump Lift day's pattern with Minimalist's own dumbbell/bodyweight lifts |
| Cooldowns and recovery are recycled, training content is not [10] | Samples cooldowns and recovery sessions from the pool; never copies a published training session |
| Supersets are chosen around the main lift, not as push/pull pairs [11] | Samples balance and finisher sections from published days with the same main-lift pattern |

Two things the analysis did **not** support, so the generator does not use them: "even weeks are the heavier wave" (a clean heavy/light split by week parity occurs in only a third of slots) and "the 3x track is the 5x session minus strength intensity 2" (3x keeps and replaces it).

## 5. How a block is built

Terms: a **slot** is one strength section on one day (for example Day 1, strength intensity 1). A **pattern** is the movement category (squat, hinge, horizontal-press and so on). A **donor** is a published slot or section the generator copies from. Only **complete blocks** (all six weeks observed: blocks 2, 3, 6 and 7 today) can donate a six-week sequence.

### 5.1 Two random streams

All choices use a seeded generator (`rng`, mulberry32). There are two streams. The **plan stream** (steps 1 to 5) is seeded with the seed alone, so it is identical for every track. The **supporting stream** (step 6 onward) is reseeded from the seed, the track family and the training-day count, so each track samples its own warm-ups, balance work and so on. This is why seed 6 gives Pump Lift 5x, Pump Condition 5x and Perform the same main lifts on the same days yet different conditioning.

### 5.2 Steps

1. **Layout.** For each of the five Pump Lift 5x training days (1, 2, 3, 5, 6), collect the observed (main pattern, secondary pattern) pairs from complete blocks. Draw one pair per day, up to 400 times, and accept the first draw that contains squat, hinge, horizontal press, vertical press and at least one pull. If none qualifies, keep the draw with the best weighted coverage. (Maximizing coverage was tried first and over-trained pulls: 6.0 sets a week against 2.7 published.)
2. **A/B pairs.** For each slot choose a pair of exercises with the slot's pattern: about half the time a pair the program published as an alternation, otherwise two exercises from the bank of that pattern that share the same equipment and per-side flag (a remix). Preference order: not in the latest published block and not already used in this block; then allowed to be from the latest block; then allowed to repeat within this block; last, ignoring the equipment list (with a warning). Minimalist tries its own lifts first, then a fresh Pump Lift lift that fits its dumbbell/bodyweight kit, then looser matches.
3. **Progression.** Pick one complete donor slot with the same pattern, role and per-side flag (falling back to same pattern, then any). Copy its six weeks of working and warm-up sets (reps, RPE, effort), tempo, rest, minutes and title. The A and B exercises are assigned to odd and even weeks regardless of the donor's own alternation.
4. **Subset for fewer days.** For 4x, 3x and Minimalist, take the combination of the five 5x days that scores best on weighted pattern coverage (squat 3, hinge 3, horizontal press 2, vertical press 2, horizontal pull 2, vertical pull 1, single-leg 1, plus 10 if squat is present), with a small random tie-break. The kept days stay in 5x order and map onto the track's training day numbers.
5. **Plan complete.** Every family draws the full plan including the second strength slot (Pump Lift's strength intensity 2), even those that do not use it, so the random stream stays aligned across tracks.
6. **Supporting sections.** From published training days of the *requested track* whose main-lift pattern matches, sample (distinct where possible): a strength balance section, A for odd weeks and B for even weeks; a finisher per week (Pump Lift) or a conditioning section per week (other tracks); a warm-up and a cooldown per week. Sections that need equipment you did not list are skipped when an alternative exists. Perform adds a hot start or speed-strength piece: the kind is chosen once per day and two donors of that kind alternate A/B. "Short on time" text is copied from a matching day.
7. **Recovery and note days.** Recovery days are whole published recovery sessions of the same track, shuffled. Day 7 is left as an empty note.
8. **Assemble.** Each training day gets a focus-note section (lift names only), then the sections in the family skeleton. Strength sections are rendered as program-style text from the structured data; copied sections keep their original text with the section letter stripped, and letters are reassigned in order.
9. **Self-check.** Every week is parsed against the shared schema (a malformed block throws), and the automatic checks in section 7 run.

### 5.3 What each track gets

| Track | Training days | Main lift source | Second strength slot | Also contains |
|---|---|---|---|---|
| Pump Lift 5x / 4x / 3x | 5 / 4 / 3 | Pump Lift pools | Yes | Balance, finisher |
| Pump Condition 5x / 4x / 3x | 5 / 4 / 3 | Same plan as Pump Lift (same seed, same lifts) | No | Balance, conditioning |
| Perform | 5 | Same plan as Pump Lift | No | Hot start or speed strength, balance, conditioning |
| Minimalist | 4 | Minimalist's own lifts; Pump Lift lifts that fit its kit as a fallback | No | Balance, conditioning |

## 6. Why remix and not synthesize

A rule-based synthesizer would have to encode how a coach picks reps, RPE, tempo and rest for each exercise. The analysis showed the program's own regularities are strong in structure (skeleton, A/B, RPE ramp) but weak in the details that would need rules (the heavy/light wave by parity held in a third of slots; the 3x tracks are hand-picked per block). Copying observed sequences keeps those details valid by construction. The price is that the output space is bounded by what was published (section 8).

## 7. Validation

Validation has three layers. The first two are automatic and run every time. The third is a short human review that needs no programming knowledge.

### 7.1 Automatic checks on every block

Printed by the CLI and stored in the output (`checks`). `PASS` means the rule held, `WARN` means look at it, `info` is a measurement.

| Check | What it proves | Failing means |
|---|---|---|
| Week layout | 6 weeks on consecutive Mondays, 7 days each, the right number of training days, Day 7 a note | A scheduling bug |
| Session skeleton | Every training day has the family's sections in the published order | A section is missing or misplaced |
| A/B variation | Odd weeks share one lift, even weeks another (or the slot is fixed); reports how many alternate | Lifts change inside a week parity |
| Working sets | Every strength slot has at least 2 working sets every week | A bad donor slipped through |
| RPE ramps up | Within a slot RPE never falls from one working set to the next | An odd scheme |
| Set count stable | Info: how many slots keep the same working-set count (published: 82%) | Not a rule, a measurement |
| Pattern coverage | The week covers what the published track does (section 9) | A required pattern is missing |
| Variety within a week | No main lift appears on two days | Duplicate day lifts |
| Fresh lifts | No strength lift from the latest published block | The pool was too small; also warned |
| Equipment | Every strength lift fits the equipment list (only if one was given) | Nothing matching existed |
| Prose | Info: reminds that coaching text is not generated | |

These checks were run over 40 seeds on every track. Every check passes except Fresh lifts, which fails in 1 of 40 seeds on most tracks and in 14 of 40 on Minimalist, whose own pool is small. That failure is expected and is also reported as a warning.

The checks can fail for real: the tests break a block on purpose (a changed main lift, a removed finisher) and assert that the right check goes to `WARN`.

### 7.2 Fidelity against the published program

`npm run persist:generator-check` generates 60 Pump Lift 5x blocks and compares them with the 39 published weeks (`data/reports/generator-check.md`):

| Pattern | Published sets/wk | Generated sets/wk | Published weeks covered | Generated weeks covered |
|---|---|---|---|---|
| squat | 4.5 | 5.0 | 100% | 100% |
| hinge | 4.0 | 5.0 | 100% | 100% |
| single-leg | 3.5 | 3.9 | 85% | 87% |
| horizontal press | 6.6 | 7.5 | 100% | 100% |
| vertical press | 4.9 | 6.0 | 100% | 100% |
| horizontal pull | 2.7 | 4.7 | 90% | 100% |
| vertical pull | 1.6 | 1.5 | 64% | 38% |

Squat, hinge, single-leg and the presses are within about a set per week and in line on coverage. **The known gap is pulling:** generated blocks include horizontal pulling more often and in larger volume than the published program, and cover vertical pulling in fewer weeks. RPE starts 7/8/9 in 86% of generated weeks against 81% published.

### 7.3 Human review (about ten minutes per block)

You do not need to judge exercise selection in detail. Read one generated block and ask:

1. Does each training day look like a normal Persist session (focus, warm-up, main lift, second lift, superset, finisher, cooldown)?
2. Do the two lifts on a day make sense together (for example a hinge day with a row, a press day with another press or a pull)?
3. Are week A and week B different versions of the same movement (sumo deadlift and deficit deadlift), not unrelated exercises?
4. Do reps come down over the six weeks while RPE climbs within each session?
5. Does the week include legs, pushing and pulling?
6. Is anything on the list impossible with your equipment?
7. Is one body region overloaded on a day (for example two squat-type slots plus a squat-type balance superset)?
8. Does the balance and finisher work suit the main lift of the day?

If an answer is no, note the **track, seed and day** and what looked wrong. Each such note maps to one setting in section 9, so it can be fixed without redesigning anything.

The exercise grouping that all of this depends on is reviewable in `data/reports/patterns.md` (`npm run persist:patterns`): every exercise listed under its movement pattern. Reading the first fifteen names in each pattern covers most of the use.

## 8. Limits and risks

- **Small donor set.** Only four blocks are complete (2, 3, 6, 7) because two blocks have missing weeks, the first block starts at Week 3, and the current block is at Week 5. Diversity and quality both depend on those four. Across 25 seeds a Pump Lift 5x day gets between 5 and 20 different main-lift pairs depending on the day, so some days repeat a lot.
- **Bounded by the published program.** Remixed pairs are new combinations of published exercises, but no genuinely new exercise or scheme appears.
- **Not coached.** The generator reproduces measured regularities. It can produce a block that passes every check yet feels wrong to a coach. The checks cannot see overall stress, joint load or taste.
- **Supporting sections are matched by pattern, not by exercise.** A balance superset suits the day's main-lift pattern but may repeat movements already trained that day.
- **4x, 3x and Minimalist reuse the kept 5x day's supporting sections.** The published program often replaces them (3x almost always does).
- **Pump Condition and Perform copy the main lift, not the program's coupling of balance and conditioning to it.**
- **Volume runs about 10 to 25% above the published average** on the main patterns (section 7.2), and horizontal pulling is well above it.
- **Pattern grouping is partly judgment.** About twenty movement families were assigned by judgment (dips, flies, burpees, handstand work and others). They are listed with their rationale in persist-decisions.md (D16).
- **Strength sections in giant-set and every-N-minutes formats are not generated** and cannot be donors (53 Pump Lift 5x strength sections parse without working sets).
- **Name-based equipment.** Equipment is inferred from exercise names. A mislabeled exercise could pass your equipment filter or be wrongly excluded.
- **Seed is not a quality score.** Different seeds give different blocks, not better ones.

## 9. Where to change behaviour

| To change | Where |
|---|---|
| Which patterns a week must contain, and how strictly | `coverageProblems()` and the `essentials` function in `generate()` |
| How much each pattern counts when trimming to 4x/3x/Minimalist | `WEIGHT` and `subsetScore` |
| How often an A/B pair is remixed rather than published | the `r() < 0.5` test in `tryChoose()` |
| What counts as the same kit for a remixed pair | `sameKit` |
| How many layout draws are tried | the `400` in step 1 |
| Whether last block's lifts are avoided | `--allow-recent`, default in `avoidRecent` |
| Which slots may be donors | `slotSeqs()` (needs six weeks and at least two working sets each week) |
| What Minimalist may borrow | `minimalKit` |
| Which sections count as a Perform pre-lift piece | `PRE_LIFT` |
| The skeleton each family must follow | `SKELETON` in `validateBlock()` |
| Which exercises belong to which pattern | `src/persist/classify.ts` rules, or `data/catalog/overrides.json` for single exercises, then `npm run persist:all` |
| Equipment inferred for an exercise | `EQUIPMENT` and `BARBELL_BY_DEFAULT` in `classify.ts`, or an override |

## 10. Reproducibility and testing

A block is a function of `(corpus, track, seed, start, equipment, avoidRecent)`. The corpus is the set of view files, which are themselves rebuilt from the PDFs by `npm run persist:all`. There is no clock and no network. The default start date uses today's date only in the CLI wrapper, not in `generate()`.

`src/persist/generate.test.ts` covers: seeded randomness; equipment rules; text rendering; a valid six-week block for every track; reproducibility and variation across seeds; A/B alternation and the skeleton; seed coupling between tracks; Perform's pre-lift kind; Minimalist's day count; the validation checks, including deliberately broken blocks. The corpus tests skip themselves if `data/views` has not been built.
