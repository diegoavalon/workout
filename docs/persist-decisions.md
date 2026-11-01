# Decision log: Persist pipeline and generator

Every judgment call made while building the data pipeline and the block generator, with the alternatives, the reasoning and how to revisit it. Decisions from the data cleanup that the generator depends on are included, because a change there changes what the generator can produce.

**Status.** On 2026-11-01 the project owner said they could not easily validate the pattern grouping or the generation approach, and asked for the decisions to be made and documented so work could begin, with adjustments later. Every decision below is therefore **provisional: accepted by delegation, not independently validated**. The first real use of a generated block is the point to review them. Each entry says how.

How to read an entry: **Decision**, **Why** (the evidence or reasoning), **Alternatives**, **Risk** (what could be wrong), **Revisit** (how to check or change it).

---

## Generation approach

### D1. Generate by remixing published material, as a command-line tool first
- **Decision.** The generator assembles a new block from published sections and sequences and recombines them. It runs as a Node CLI over the view files, with the logic in a pure function that a Void route can call later. (Chosen by the project owner from three options.)
- **Why.** Remixing keeps rep schemes, RPE ramps, tempos and rests valid by construction. A CLI needs no server, and the pure core keeps the later move to D1 cheap.
- **Alternatives.** Re-sequencing whole published blocks (never new); equipment swaps on an existing block (smallest scope); synthesizing from rules (would have to encode coaching judgment the analysis could not confirm, see D5); a Void route on D1 now (needs the single-page app to gain a server).
- **Risk.** Output is bounded by the published program (D2).
- **Revisit.** `docs/persist-generator.md` section 6.

### D2. Only complete six-week blocks are donors
- **Decision.** A progression sequence is copied only from a slot observed in all six weeks of a block. That is blocks 2, 3, 6 and 7. Blocks 4 and 5 (missing weeks), block 1 (starts at Week 3) and block 8 (in progress, Week 5) are not donors for six-week sequences. Supporting sections are sampled from any observed training day.
- **Why.** A sequence with a gap would produce a block with a hole in the middle. Interpolating missing weeks would present invented numbers as the program's.
- **Alternatives.** Fill gaps by interpolation; use partial blocks for the weeks they have.
- **Risk.** Four donor blocks is a small base. Diversity is limited and quality leans on those four.
- **Revisit.** If the four missing PDFs are obtained, blocks 4 and 5 become donors automatically after `npm run persist:all`. When block 8 finishes it joins the donors.

### D3. Layout is rejection-sampled on the essentials, not maximized
- **Decision.** Draw each day's (main, secondary) pattern pair from observed layouts and accept the first draw (of up to 400) with squat, hinge, both presses and a pull.
- **Why.** The first version maximized pattern coverage. It covered all seven patterns every week and gave 6.0 pull sets a week against 2.7 published. Rejection sampling follows the published distribution subject to the essentials; pulling dropped to 4.7 and single-leg to within 0.4 sets of published.
- **Alternatives.** Maximize a weighted score; fix a template layout per day; sample with no constraint.
- **Risk.** Horizontal pulling is still high (4.7 vs 2.7) and vertical pulling is covered in 38% of weeks vs 64%.
- **Revisit.** `data/reports/generator-check.md`. To lower pulling, require only "any pull" less often or add a cap in the `essentials` step.

### D4. A/B pairs are half published, half recombined
- **Decision.** Each strength slot gets an A/B pair, A on weeks 1, 3, 5. Half the time the pair is one the program published as an alternation; otherwise two exercises of the same pattern, same equipment set and same per-side flag.
- **Why.** The program alternates in 83% of main-lift slots. Only about 50 published alternations exist, so using only those gave 1 to 8 distinct pairs per day over 25 seeds; adding recombined pairs gave 5 to 20.
- **Alternatives.** Published pairs only (little variety); any two exercises of the pattern (could pair unrelated lifts); fixed single exercise.
- **Risk.** A recombined pair may not be a natural variation (two barbell squats that the program never paired). The same-equipment and same-per-side rule limits this but does not guarantee it.
- **Revisit.** The `0.5` in `tryChoose()`. Set it to 0 to use only published pairs.

### D5. Progression is copied from an observed slot, not generated from rules
- **Decision.** Take the six-week sets, reps, RPE, effort, tempo, rest and minutes from a complete donor slot with the same pattern, role and per-side flag, independently of which exercises were chosen.
- **Why.** The measured rules are strong in structure (RPE 7/8/9 in 88% of weeks, constant set count in 82%, opening reps falling by about two every two weeks) but weak in the parts needed to synthesize: a heavy/light split by week parity held in only a third of slots and the heavier parity was odd in 41 and even in 34. Copying keeps the details valid.
- **Alternatives.** Rule-based progression from `data/design/progression.json`; copy from the same donor as the exercise pair.
- **Risk.** The scheme is chosen by pattern, so a squat variation can receive a scheme that suits another squat variation better. Odd/even assignment of A and B is independent of the donor's own alternation.
- **Revisit.** `schemeFor()`. Tie scheme and pair to one donor by choosing the pair and scheme from the same slot.

### D6. Week 1 is the A variation; weeks alternate
- **Decision.** Odd weeks (1, 3, 5) use A and even weeks (2, 4, 6) use B.
- **Why.** No published parity convention could be established (D5), so the simplest consistent rule is used.
- **Revisit.** Swap `odd = w % 2 === 0` in `generate()`.

### D7. Avoid the latest published block's lifts by default
- **Decision.** Lifts used in the most recent block (block 8) are avoided; `--allow-recent` lifts the rule. If a pool is too small the generator falls back and warns.
- **Why.** The same day and role kept its main lift into the next block in 3% of cases (4 of 139), though exercises return after a gap (about two thirds of the 5x pool by block 6).
- **Risk.** The recent block's lifts are the ones the user is most likely doing now; avoiding them can also exclude lifts they like.
- **Revisit.** `avoidRecent` option.

### D8. One seed gives Pump Lift, Pump Condition and Perform the same main lifts
- **Decision.** The main-lift plan (layout, pairs, progression) uses its own random stream with the same seed for every track. Each track then reseeds for its supporting sections. Every family draws the second strength slot too, so streams stay aligned.
- **Why.** Pump Condition 5x and Perform used the Pump Lift 5x lift on the same day in 97% of published days.
- **Alternatives.** Generate each track independently (the first version; the lifts did not match).
- **Risk.** Equipment filters or pool differences can still make one track diverge. The Pump Lift 5x second slot influences the choice order of later main lifts even in tracks that do not show it.
- **Revisit.** Tests assert the match for Pump Condition 5x and Perform.

### D9. 4x, 3x and Minimalist keep the 5x days that cover the most patterns
- **Decision.** Choose the subset of the five 5x days with the best weighted pattern coverage (squat 3, hinge 3, presses 2 each, horizontal pull 2, vertical pull 1, single-leg 1, +10 if squat is present), small random tie-break, kept in 5x order.
- **Why.** The published 4x and 3x tracks pick a different subset and order in every block (constant within a block in 7 of 8). No drop rule exists, so a coverage rule is the closest defensible choice. The squat bonus was added because 3x covers squat in every published week; without it, squat was missing in 9 of 40 seeds.
- **Alternatives.** Always drop one named day; random subset; copy a published block's mapping.
- **Risk.** The published subsets are not necessarily the most-covering ones.
- **Revisit.** `WEIGHT` and `subsetScore`. The 3x coverage check allows one of hinge, horizontal press and vertical press to be missing, matching published 3x weeks.

### D10. 4x, 3x and Minimalist reuse the kept day's supporting sections
- **Decision.** A kept 5x day brings its own balance, finisher or conditioning, warm-up and cooldown.
- **Why.** Simplest approach consistent with 4x sharing about half its supporting sections with 5x.
- **Risk.** The published 3x track replaces them almost always (only 4 of 116 3x strength-intensity-2 sections equal the 5x counterpart). Generated 3x blocks are therefore less faithful than 4x ones.
- **Revisit.** Sample supporting sections for the 3x track's own days.

### D11. Perform: one kind of pre-lift piece per day, alternating A/B
- **Decision.** Each Perform day gets a hot start or a speed-strength piece, chosen once per day from published Perform days of that day number, with two donors alternating by week.
- **Why.** Checked against the data: in all 37 block-and-day combinations that have a pre-lift piece, every week of the block uses the same kind (none mix hot start and speed strength). Which kind a day gets varies by day number (day 2: 37 hot start, 0 speed; day 3: 6 hot start vs 29 speed).
- **Risk.** The first version mixed kinds within a block; that was the reason for the rule.

### D12. Minimalist uses its own lifts, borrowing Pump Lift lifts within its kit
- **Decision.** Take the Pump Lift day's pattern. Choose a fresh Minimalist lift; if none, a fresh Pump Lift lift that needs only dumbbell, kettlebell, bodyweight, pull-up bar, rings or bands; then looser matches.
- **Why.** Minimalist keeps the pattern in 83% of days but the exact lift in under 5%, and has few complete blocks of its own. Without borrowing, 29 of 40 seeds reused last block's lifts; borrowing brought that to 14 and removed within-week duplicates.
- **Risk.** A borrowed lift is not something Minimalist ever published.

### D13. Recovery days are whole published recovery sessions
- **Decision.** Recovery days (active recovery plus mobility) are sampled from the same track's published recovery days and shuffled.
- **Why.** Recovery content is partly reused in the published program (about 46% of mobility appearances repeat) and is not tied to the training content.
- **Risk.** A recovery session's mobility topic is not matched to the training week.

### D14. No coaching prose
- **Decision.** The focus note carries only the lift names, "short on time" text is copied, and the Day 7 note is empty.
- **Why.** The prose belongs to the program's author and cannot be produced from the data in a way that is true to the week.
- **Revisit.** A later step could add templated, clearly generic guidance.

### D15. What an empty equipment list means, and how strict the filter is
- **Decision.** An empty equipment list means bodyweight or nothing. Equipment is inferred from exercise names (barbell lifts such as back squat and deadlift default to barbell; pull-up bar, rower, jump rope and ski erg are inferred). The equipment filter is strict for strength slots (with tiers and warnings) and best-effort for supporting sections.
- **Risk.** Inference is name-based, so it can be wrong in both directions. When nothing matches, the generator warns and ignores the equipment for that slot rather than failing.
- **Revisit.** `EQUIPMENT` and `BARBELL_BY_DEFAULT` in `classify.ts`; per-exercise overrides.

### D20. Three coherence rules found by reading a real block
Printing week 1 of a generated Pump Lift 3x block (seed 28) showed three things that the automatic checks did not catch. All three are now handled, and a test covers each.
- **Source artifacts are not copied.** 13 of 9,797 published sections contain a stray "Week 2" style line (mostly in cooldowns), a leftover from the PDFs. Sections and recovery days containing one are excluded as donors.
- **Balance work after a leg-dominant lift is lower-body or trunk work when the program usually does that.** The published program pairs a squat, hinge or single-leg main lift with upper-body-only balance work on 19% of days (65 of 334 squat days) and with lower-body or trunk work on the other 81%. The generator prefers the 81%, so the block reads coherently. This is a deliberate departure from sampling the program's exact mix: in generated blocks the upper-body-only share is now below 10%.
- **A week never repeats a recovery mobility topic.** Two recovery days in the same week could draw the same mobility session ("Squat Mobility" twice). The generator now takes the first shuffled recovery session whose topic is new that week.
- **Risk.** The balance preference removes some of the program's variety. If the generated blocks start to feel too uniform, relax it by lowering the preference in `sectionPool()`.

---

## Data and grouping decisions the generator depends on

### D16. Pattern grouping: judgment calls
The movement-pattern list is the project owner's (16 patterns). The rules assign most exercises unambiguously from wording, but about twenty families needed a call because the list has no category for them. The full grouping is reviewable in `data/reports/patterns.md`.

| Family | Pattern chosen | Why | Alternative |
|---|---|---|---|
| Dips (bar, ring, bench) | horizontal-press | Chest and triceps pressing; no dip category | vertical-press |
| Chest flies | horizontal-press | Closest pattern; no chest-isolation category | a new pattern |
| Burpees | plyometric | Full-body jumping | core |
| Wall sits, wall balls | squat | Squat position / squat-to-throw | |
| Handstand holds and walks, wall walks, handstand push-ups | vertical-press | Overhead loaded position | core |
| Turkish get-ups, Tuck ups, crawls, sprawls, inchworms, hanging raises | core | Trunk-dominant | |
| Kettlebell/dumbbell rack marches | carry | Loaded walking | core |
| Devil's presses | olympic | Ballistic dumbbell lift | plyometric |
| Tall-kneel-to-stand, Poliquin step, box step-over | lunge-single-leg | Single-leg transitions | |
| Band and monster walks, hip abduction/adduction | isolation-legs | Hip isolation | |
| Powell/Poliquin raises, external rotations, band pull-aparts, Cuban press | isolation-shoulders | Rotator cuff / rear shoulder | mobility |
| Pullovers, lat pulldowns, chin-over-bar | vertical-pull | Lat pulling | |
| Stretches, wrist and ankle circles, thoracic and hip rotations, bottom-of-squat hold | mobility | Position or drill, even when named after a lift or muscle | the lift's pattern |
| Nordic curls | isolation-legs | Hamstring isolation | hinge |
| Duck, ostrich, elephant walks, babymaker, arm bars | mobility | Warm-up drills | core |
| KBS ("Russian KBS", "American KBS") | hinge (kettlebell swings) | KBS means kettlebell swing in the PDFs | |

- **Risk.** The two largest uncertainties are dips and flies: together about 220 uses, now counted as horizontal-press, which raised Pump Lift 5x horizontal-press volume to about 13 hard sets a week.
- **Revisit.** Read `data/reports/patterns.md`; change a single exercise in `data/catalog/overrides.json` or a family in `src/persist/classify.ts`; run `npm run persist:all`. A pattern change flows into the generator automatically.

### D17. Names kept out of the catalog, and formats left blank
- **Decision.** 112 names (491 uses) that are headings, instructions or fragments (for example "Loading Note", "Continuous Clock", "Odd -", "Full Body") are excluded; 57 conditioning sections that name none of the owner's formats are left with no format rather than guessed.
- **Why.** Guessing would add false precision. Excluded items keep their written name and have no exercise.
- **Risk.** A few real movements joined by "+" (for example "Power Snatch + 2 Full Snatch") are excluded because they are several movements.

### D18. Days are numbered by position and corrected dates are logged
- **Decision.** The PDFs have missing, repeated and mis-numbered day headers and wrong printed dates. Days are numbered by position in the track (7 per track), dates computed from the week's Monday, and every disagreement is logged in `data/reports/corrections.json`.
- **Why.** Dates and headers disagree with each other in places; position in the track was the only consistent signal: every track in every week has exactly seven days once the repeats and gaps are resolved.

### D19. Missing weeks stay missing
- **Decision.** The four missing weeks (May 18 and 25, Jun 22 and 29) are recorded as gaps with no schedule rows and are not donors.
- **Revisit.** Obtain those four newsletters, drop them in `raw-export/weekly-plans/`, run `npm run persist:all`.

---

## What to check first when you start using it

1. Generate a block and do the ten-minute review in `persist-generator.md` section 7.3. Note track, seed and day for anything that feels wrong.
2. Skim `data/reports/patterns.md` for exercises under a pattern that surprises you; start with dips (D16) and the first fifteen in each list.
3. If you want the generated pulling to match the program, ask to tighten D3.
4. If 3x blocks feel off, ask to implement D10.
