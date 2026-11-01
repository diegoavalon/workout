# Persist Program Analysis — Kickoff Prompt

## Context

I have every weekly Persist PDF (Functional Bodybuilding, coached by Marcus Filly) from January 2026 to now — several ~6-week training blocks. Each PDF covers one week and contains 8 tracks:

- Pump Lift 5x / 4x / 3x
- Pump Condition 5x / 4x / 3x
- Perform
- Minimalist

The PDFs are text-based (no OCR needed). They live in `raw-export/weekly-plans/`.

**Stack:** This project uses the **Void** framework (Vite + Hono, deploying to Cloudflare Workers, with D1/SQLite through Drizzle via `void/schema-d1`, `void/db`, and `void/drizzle-zod`). Read the bundled docs in `node_modules/void/docs/` and the project's `AGENTS.md` before writing any code, and follow Void's conventions for schema files, migrations, and database commands rather than guessing them.

**My goals, in order:**
1. Extract every week into a clean, validated dataset.
2. Load it into a normalized D1 database that becomes the source of truth.
3. Analyze it to find the program's patterns: the session skeleton, how exercises rotate through slots, how reps/RPE progress across a block, how lower-frequency tracks derive from higher ones, and what content is recycled.
4. Later (not in this task): build a workout generator and a frontend in this Void app, both reading from the same database.

Work in phases. **Stop at the end of each phase, summarize what you found, and wait for my review before continuing.**

---

## Data organization

The data has two axes. Store by the first, present by the second.

- **Block** (time): ~6 weeks, the unit Marcus designs. Content is authored per block and week.
- **Track** (view): how a person follows the block. Within a week, every track is built from the same pool of sessions, rearranged and trimmed to fit its frequency.

Any single workout is uniquely identified by `block / week / track / day`, which points to a **session**. Sessions are stored once and referenced from every track that uses them.

```
Persist (program)
└── Block            ~6 weeks
    └── Week         1–6
        └── Track    pump-lift-5x, perform, minimalist, …
            └── Day  1–7 → session
Session              stored once, shared across tracks
└── Section          role: warmup, strength-intensity-1, strength-balance, …
    └── Item         exercise ref + sets, tempo, rest, load
        └── Set      kind, reps, RPE
Exercise             one shared catalog
```

**Four layers, each with one job:**

| Layer | Location | Purpose |
|---|---|---|
| 1. Source | `data/source/<week-start>.json` | One parsed file per PDF, validated, never hand-edited. Lets the database be rebuilt from scratch. |
| 2. Canonical store | D1 (Drizzle schema + migrations) | Normalized tables. Used for analysis now, generator and frontend later. |
| 3. Design model | `data/design/` | Block templates derived from analysis: slots, exercise pools, progression rules, track-derivation rules. Drafted in Phase 3. |
| 4. View models | Not built yet | Denormalized per-track, per-week JSON or API responses for the frontend. |

---

## What I already know about the structure

Use this as a starting hypothesis, then confirm or correct it against the data.

**Every training session follows this skeleton:**
- `A) Daily Focus Notes` — coaching cue + a "Short on time? Remove ___" line
- `B) Warmup (8 min)` — either "2 min cardio + 3 sets of (15 sec sprint + 2 drills)" or "3 rounds of (90 sec cardio + 2–3 drills)"
- `C) Strength Intensity 1` — main compound lift: warm-up set(s) + 3–4 working sets ramping RPE 7→8→9 (sometimes a max-reps set at Set 1 weight), prescribed tempo, 90 sec–3 min rest
- `D) Strength Intensity 2` — second compound/unilateral lift (mostly Pump Lift tracks)
- `E) Strength Balance` — 3 sets of a 2–3 movement superset, close to failure
- `F) Finisher` (Pump Lift, 6–12 min) or `Conditioning` (other tracks, 12–20 min; AMRAP/EMOM/intervals/for-time)
- `G) Cooldown (5 min)` — 1–2 sets of 3 stretches

**Track variations:**
- Perform adds a "HOT START" or "Speed Strength" section (Olympic lifts, gymnastics, plyos) before the main lift.
- Minimalist uses dumbbell/bodyweight versions of the main lifts.
- Section letters shift between tracks (some start at A for the warmup), so match sections by **title**, not letter.
- The 3x tracks appear to be the 5x sessions with the second strength lift removed. Test this.

**Weekly structure:**
- 5x has one recovery day; 4x has two; 3x has three.
- Recovery days = "Active Recovery Work" (30–40 min) + "PERSIST RECOVERY MOBILITY SESSION" focused on one area (e.g., Hip Flexors and Quads, Hip External Rotation, Shoulder Extension).
- Day 7 = a written note from Marcus (no training).

**Block structure:**
- Blocks appear to be ~6 weeks. Even weeks look like the heavier, lower-rep wave ("reps decreased from Week 2, allowing an increase in weight").
- Some variations alternate odd/even weeks (e.g., wide vs close grip bench, conventional vs Romanian deadlift, behind-the-neck vs Z press).
- Some formats stay fixed across even weeks (e.g., strict pull-up every 75 sec × 6 sets of 5-3-2-5-3-2).
- Recovery days, mobility sessions, and cooldowns appear to be copied verbatim between blocks.

**Tempo notation:** 4 characters = lowering seconds, bottom pause, lifting seconds, top pause. `X` = explosive. Example: `30X0`.

---

## Known data quirks — handle these explicitly

- **Wrong dates.** Some tracks list the wrong weekday date (e.g., Pump Lift 3x and Minimalist list "Monday, July 7th" when Monday was July 6). Anchor on the week's Monday and compute day dates from the Day number.
- **Header/content mismatch.** The October PDF's header says "Week of October 12" but its content is dated October 26. Trust the dated content; log the mismatch.
- **Duplicated headers.** e.g., `C) Strength Intensity (12 min):` appears twice in a row in one October session.
- **Line merges.** Text from adjacent lines can fuse, e.g. `Wednesday March 4, 2026Pump Condition 5x` or `3 Working Sets; rest 3 minutesWarm-Up Set`.
- **Inconsistent names.** "DB" vs "Dumbbell", "KB" vs "Kettlebell", "1:1/4" vs "1 1/4" vs "1-1/4", "Pull Up" vs "Pullup" vs "Pull-Up", "Childs Pose" vs "Child's Pose", tempos and reps on the same line as the name.
- **Table of contents.** Each PDF starts with a list of tracks and dates. Skip it.
- **Effort discrepancies.** The same set in the same session can show "RPE 7" in one track and "RPE 8" in another. Keep both as written; flag it.

Never silently fix data. Log every correction to `data/reports/corrections.json` with file, location, original text, and corrected value.

---

## Phase 0 — Orientation

1. Read `node_modules/void/docs/` (especially database, schema, migrations, and scripts) and `AGENTS.md`.
2. Inspect the project as it stands and list the files in `raw-export/weekly-plans/`.
3. Report back: how many PDFs and which date range, how Void expects schemas/migrations/seeding to be set up, how to run a local D1 database, and where you plan to put the pipeline scripts. Note anything in my plan below that conflicts with Void's conventions.

---

## Phase 1 — Extraction and parsing (Layer 1)

Use TypeScript throughout so the schemas are shared with the app later. Use `unpdf` (or another pdf.js-based library) for text extraction and `zod` for validation. Put the pipeline under `scripts/persist/` (or wherever Phase 0 found fits Void best) — these run locally in Node, not on Workers.

1. Extract raw text from each PDF to `data/text/<filename>.txt`. Keep it unedited.
2. Parse into week → track → day → section → item using regex for structure (track names, `Week N Day N - Persist <TRACK>`, section headers like `^[A-G]\) `).
3. Parse each item into fields: exercise name, sets, reps (number, range, per-side, `max`, or time), tempo, rest, RPE per set, loads (`53/35#`, `70/53#`), distance, calories.
4. Keep each section's original text in a `raw` field.
5. Write unparseable lines to `data/reports/unparsed.json` instead of guessing. If there are many, propose an approach (e.g., a schema-constrained LLM pass) and wait for my decision.

**Deliverables:**
- Zod schemas in a shared module the app can import later (e.g., `src/persist/schema.ts`)
- `data/text/*.txt`, `data/source/<week-start>.json`
- `data/reports/unparsed.json`, `data/reports/corrections.json`
- Parser tests covering at least three real sessions from different blocks, including each quirk above
- A summary: weeks, tracks, and sessions parsed; failed-line count; most common failure types

---

## Phase 2 — Normalization and the D1 store (Layer 2)

### Exercise catalog
- Canonical `id` (kebab-case), `name`, `pattern`, `equipment`, `unilateral`.
- `pattern` is one of: squat, hinge, lunge-single-leg, horizontal-press, vertical-press, horizontal-pull, vertical-pull, carry, core, isolation-arms, isolation-shoulders, isolation-legs, olympic, plyometric, cardio, mobility.
- Every spelling seen in the data goes in an aliases table.
- Names you can't map confidently go to `data/reports/unmapped_exercises.json` for me to resolve. Don't invent mappings.

### Section classification
- `role`: focus-note, warmup, hot-start, speed-strength, strength-intensity-1, strength-intensity-2, strength-balance, finisher, conditioning, cooldown, active-recovery, mobility, weekly-note.
- `format`: straight-sets, superset, giant-set, cluster, emom, every-n-sec, amrap, for-time, intervals, ladder, run-the-rack, chipper, steady-state.

### Blocks and weeks
- Use the "Week N" in each PDF. Start a new block when the week number resets. Report the block boundaries you found.

### Deduplication
- Compute a `content_hash` for every section from normalized content (exercise ids, sets, reps, tempo, rest, format — not prose).
- Compute a session hash from its ordered section hashes. Sessions with the same hash are stored once.

### Schema (Drizzle, D1) — adjust to Void conventions and tell me why if you change it

| Table | Key columns |
|---|---|
| `exercises` | id, name, pattern, equipment (json), unilateral |
| `exercise_aliases` | alias (pk), exercise_id |
| `tracks` | id, name, family (pump-lift / pump-condition / perform / minimalist), days_per_week |
| `blocks` | id, start_date, end_date, week_count |
| `weeks` | id, block_id, week_number, start_date, source_file, note_title, note_body |
| `sessions` | id, type (training / recovery / note), focus_topic, focus_body, short_on_time (json), content_hash |
| `sections` | id, session_id, position, label, title, role, format, minutes_min, minutes_max, scheme (json, for ladders like 15-12-10-8-6), notes (json), content_hash, raw |
| `items` | id, section_id, position, exercise_id, tempo, rest_min_sec, rest_max_sec, per_side, load (json), raw |
| `sets` | id, item_id, position, kind (warmup / working), reps_min, reps_max, reps_type (count / max / seconds), rpe_min, rpe_max, effort |
| `schedule` | week_id, track_id, day, date, session_id — primary key (week_id, track_id, day) |

**Representation rules:**
- Ranges become `_min` / `_max` columns; a single value fills both.
- Male/female loads: `{ "male": 53, "female": 35, "unit": "lb" }`.
- Open-ended ladders (`2-4-6-8...`) set `"open": true` in `scheme`.

### Seeding
- Write an idempotent seed script that rebuilds the whole database from `data/source/` plus the catalog. Use Void's migration and database commands.

**Deliverables:** schema file, migrations, seed script, exercise catalog, `data/reports/unmapped_exercises.json`, and a summary with row counts per table and the number of unique vs. total sessions and sections.

---

## Phase 3 — Pattern analysis and draft design model (Layer 3)

Write the analysis as SQL queries (saved in `scripts/persist/analysis/`) plus small TypeScript scripts where SQL is awkward. Produce `data/reports/analysis.md` with supporting CSV/JSON. Answer:

1. **Skeleton validation.** For each track, what percentage of training sessions match the skeleton? List every deviation.
2. **Slot fill.** For each role (especially strength-intensity-1/2), which exercise and pattern filled it, laid out as block × week × day. Is each pattern covered once per week?
3. **Variation rotation.** Which lifts alternate between odd and even weeks? Which stay fixed for a block? What repeats from one block to the next?
4. **Progression curves.** For each main slot, how do sets, reps, RPE, and tempo change from Week 1 to Week 6? Is the curve the same in every block?
5. **Recycled content.** Using the hashes, which sections and sessions appear more than once, how often, and when? Separate recovery days, mobility, cooldowns, warmups, and conditioning.
6. **Track derivation.** Within each week, how do 4x and 3x derive from 5x, and how do Pump Condition, Perform, and Minimalist derive from Pump Lift? Is there one consistent rule (e.g., drop strength-intensity-2, merge strength balance into another day), or does it look hand-picked each block? This decides whether the design model needs one template per block or one per track.
7. **Accessory pairings.** Which exercises appear together in strength-balance supersets? Push/pull, hip/knee, or something else?
8. **Conditioning library.** Every conditioning format with its time domain, equipment, and movements.
9. **Weekly volume.** Hard sets per movement pattern per week for each track.

Then draft the design model in `data/design/`:
- `block-template.json` — the skeleton as slots per day, with the exercise pool observed for each slot.
- `progression.json` — the week-by-week rep/RPE/tempo rules per slot.
- `track-derivation.json` — the rules for building each track from the base, or a note explaining why per-track templates are needed.

End the report with **"Rules a generator could follow"** — a plain-language list of patterns the data supports, each with its evidence (how many weeks/blocks it held in) and its exceptions.

---

## Constraints

- Don't build the frontend, API routes, or generator yet.
- Don't modify anything in `raw-export/weekly-plans/`.
- Every pipeline step must be re-runnable from scratch with one command (add npm scripts, e.g. `persist:extract`, `persist:seed`, `persist:analyze`, `persist:all`).
- When the data contradicts my assumptions, say so plainly and show the evidence.

Start with Phase 0.