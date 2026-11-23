# Power Thrash II — Implementation Handoff

Nov 23, 2026 · @Diego Avalon

## Summary

Power Thrash II is available on **New program**. Users enter 15 one-rep maxes, pick a start Monday, and preview a fixed 12-week program. Training falls on Monday, Wednesday, and Friday. The existing generator supplies optional recovery on Tuesday, Thursday, and Saturday. Sunday is a rest day.

Run `npm run power-thrash:convert` with the local workbook to make the program available in development. The production upload uses authenticated corpus storage. See [deployment instructions](deployment.md#4-upload-the-private-source-programs).

## What is already done

| Piece | File | Status |
| --- | --- | --- |
| Converter | [`scripts/power-thrash.ts`](../scripts/power-thrash.ts) | `npm run power-thrash:convert` reads the source workbook and writes the template. It checks expected headers, formulas, set totals, and the weekly schedule. |
| Minimal XLSX reader | [`scripts/xlsx.ts`](../scripts/xlsx.ts) | Reads cell values and formulas for this source workbook without a new dependency. |
| Percentage template | `data/programs/power-thrash-ii.json` | About 165 KB, with 12 weeks, 36 training sessions, 240 exercise entries, 15 maxes, and four recorded corrections. |
| Program builder | [`src/domain/power-thrash.ts`](../src/domain/power-thrash.ts) | `buildPowerThrash(template, maxes, startDate)` returns a `GeneratedFile`. The module also exports `validateMaxes`, `roundLoad`, `isPowerThrash`, and `POWER_THRASH_TRACK`. The builder enforces a valid Monday start date. |
| Session weights and combination reps | [`src/domain/generated.ts`](../src/domain/generated.ts) | Sets support optional `weight`, `weightUnit`, and `repsParts`. The session view supports a Weight metric and set details such as `Set 1: 5 reps @ 135 lb` and `14 + 10 reps`. A single-set exercise shows its weight in the metric. |
| Program title and main-lift data | [`src/domain/generated-program.ts`](../src/domain/generated-program.ts) | `options.title` overrides the track-derived name, so registration produces “Power Thrash II · 3 days/week.” `mainLiftSets` returns a load summary. The existing Progression view displays reps and RPE. |
| Start-date picker | [`src/components/StartDateField.tsx`](../src/components/StartDateField.tsx) | The generator and Power Thrash II share the Monday picker. |

### Corrections to the workbook

The template records four corrections.

- **Stair Run** has no prescribed weight. The workbook took its weight from the Raise to Armpit max.
- **Walking Lunges, Alternate Lunges, and Alternate Step-Ups** use the Barbell Squat max in place of the Raise to Armpit max. The converter rescales their percentages to preserve the workbook's weights for the example lifter.
- **Squat Under Upright Row** in weeks 10–11 uses its own max in place of the Upright Row max, rescaled the same way.
- **Exercise names** use consistent spelling, such as “Bent Over Row.”

The converter verified **1,169 retained weights** against the workbook, including **151 rebased weights**. Another **42 sets** become unloaded Stair Runs. The converter checks those sets against the original formulas before dropping their weights.

## Implementation checklist

### 1. Load the template

- [x] Add a loader such as `loadPowerThrashTemplate(): Promise<PtTemplate>`. Call it when Power Thrash II is first selected, including when it is selected by `?from=<id>`.
- [x] Use the authenticated fetch pattern in [`src/generate/client.ts`](../src/generate/client.ts). Update the [corpus API allowlist and cache policy](<../routes/api/corpus/[name].ts>), the [upload script](../scripts/corpus-upload.ts), and the [local Vite middleware](../scripts/vite-corpus.ts). The template has a fixed filename and is revalidated on each online load. It can be served or uploaded independently of the generator's `data/views`.
- [x] Show loading and retry states for the template. Handle unavailable content, an expired session, and offline access before a template has been fetched. After a successful fetch, the cached template supports offline editing.

### 2. Add Power Thrash II to the New program page

- [x] Keep the four generator styles under **Training style** on `/programs/new`. Below them, add a **Fixed program** heading and one card using the existing `choice()` styling. The card reads “Power Thrash II · 12 weeks, 3 training days a week, weights from your maxes.”
- [x] Make all five cards a single accessible radio group. Selecting a fixed program deselects the generator style visually while retaining the generator's inputs. Selecting a generator style deselects the fixed program and retains the maxes for switching back.
- [x] When Power Thrash II is selected, show the 15 max fields and `StartDateField`. Hide the generator's days per week, equipment, advanced options, and download and progress status. Label the submit button **Create program**.
- [x] Offer **Full sets** and **Half sets**. Half sets keeps the first half of each exercise’s sets rounded up, with their prescribed reps and weights.
- [x] Use a coss Number Field for each one-rep max. New inputs use the dumbbell settings from 5 to 52.5 lb, then 55 to 500 lb in 5 lb steps. Previously saved maxes still prefill at their original values. Show field errors after submit or blur. [`PowerThrashFields.tsx`](../src/components/PowerThrashFields.tsx)
- [x] Show `template.credit` and the collapsed corrections list under the max fields.
- [x] Validate the Monday with the shared `isMonday` helper in the form and builder. [`src/domain/calendar.ts`](../src/domain/calendar.ts)
- [x] On submit, pass the maxes, start date, set choice, and recovery sessions to `buildPowerThrash`, then call `repo.importGenerated(file)`. Use the existing save or duplicate toast and navigate to `/generated/$id` with the returned snapshot ID.
- [x] Generate optional recovery with the existing Pump Lift 3× recovery picker. Save the recovery sessions in the program so editing its maxes or sets can reuse them offline.
- [x] Change the subtitle to “Choose how you want to train. Preview your program before you start.”
- [x] For a Power Thrash II snapshot opened through `?from=<id>`, select Power Thrash II and prefill its maxes and start date. Branch on `isPowerThrash` before calling the generator-only `inputFromOptions`. That function passes the track to `daysFor`, which expects one of the four generator styles.

### 3. Show and edit the stored maxes

- [x] In [`src/generated-ui.tsx`](../src/generated-ui.tsx), list each stored max with its display label and unit in **Program details** when `isPowerThrash(snap.file)` is true. Store the labels with their values in the snapshot so details render offline.
- [x] Add **Change maxes or sets**, linking to `/programs/new?from=<id>`. Prefill the set choice. Saving changed inputs creates a separate snapshot. Explain that existing progress stays with the original program. Identical content reopens the existing snapshot.

### 4. Add tests

Use a small synthetic fixture for automated tests that run from a clean checkout. Run workbook parity checks separately with the local source files.

- [x] Add `src/domain/power-thrash.test.ts` to cover rounding, max and date validation, generated sets, and registration. Check that `0.7 × 175` rounds to `125`, `122.4` to `120`, and `122.5` to `125`. Check that missing, zero, negative, nonfinite, and above-2,000 values fail, and that `1` and `2000` pass. Include a non-Monday and an impossible date.
- [x] With the local template and generated recovery, check that there are 36 training sessions on days 1, 3, and 5, 36 recovery sessions on days 2, 4, and 6, and 12 Sunday rest days. Check that Stair Run sets have `weight: null`, combination lifts have `repsParts`, and the file passes `validateGeneratedFile`. Check that `registerGenerated` gives it the title “Power Thrash II · 3 days/week,” `daysPerWeek: 3`, and `weekCount: 12`.
- [x] Add a component test alongside the existing tests in `src/components/` for switching between forms and retaining inputs, per-field errors, successful save and navigation, and prefill through `?from=<id>`. Update the style selector assertions in [`e2e/new-program.spec.ts`](../e2e/new-program.spec.ts) for radio semantics.
- [x] For private delivery, verify that signed-in users can fetch the published template, signed-out requests are rejected, and unpublished templates get a JSON 404. Verify that the build does not contain the template.

### 5. Commit and open a PR

- [ ] Commit on `feat/power-thrash-ii` and open a PR against `master`.

## Key APIs and data shapes

The resulting program uses the existing `GeneratedFile` save path and screens.

| API | Contract |
| --- | --- |
| `PtTemplate` | Has `id`, `title`, `credit`, `unit: "lb"`, `roundTo`, `daysPerWeek`, `maxes`, `weeks`, and `fixes`. Each max has `id`, `label`, and `example`. The type declares day numbers as `number`. The converter enforces days 1, 3, and 5. |
| `validateMaxes(template, maxes)` | Returns error messages keyed by max ID, or an empty object on success. |
| `buildPowerThrash(template, maxes, startDate, setVolume?, recoveryWeeks?)` | Returns a `GeneratedFile` and throws on invalid maxes or a start date that does not represent a valid Monday in `YYYY-MM-DD` format. |
| `isPowerThrash(file)` | Checks whether `file.options.track` is `"power-thrash-ii-3x"`. |
| `repo.importGenerated(file)` | Validates, registers, and persists the file. Returns `{ snapshot?, errors, duplicate }`. |

- `roundLoad` implements the sheet's `INT(pct × max / 5 + 0.5) × 5` formula with a floating-point adjustment at ties.
- The built file stores `track`, `title`, `startDate`, `unit: "lb"`, plus the values and labels for the template's 15 max IDs under `options`.
- A snapshot ID is `gen-` plus the first 12 characters of the content hash. The same template, maxes, and start date produce the same content and reopen the existing snapshot.
- Each week has seven days, with suggested training on Monday, Wednesday, and Friday. The week and session screens let users train in order at their own pace.

## Acceptance criteria

- [x] A user selects Power Thrash II on the New program page, enters 15 maxes and a Monday, and lands on the program overview. From there they can activate it and open Week 1, Day 1.
- [x] With the workbook's example maxes, Week 1, Day 1 and Week 12, Day 5 match the workbook for all loaded sets. Stair Runs are intentionally unloaded.
- [x] Each of the 12 weeks shows training on Monday, Wednesday, and Friday, optional recovery on Tuesday, Thursday, and Saturday, and rest on Sunday.
- [x] The session view shows weights in pounds, combination reps such as “14 + 10,” unloaded Stair Runs, and the complex move list in the notes.
- [x] Program details show the stored maxes and set choice offline. **Change maxes or sets** opens the New program page with Power Thrash II selected and the saved inputs filled in.
- [x] Invalid maxes and dates block submission with messages associated with the corresponding fields. The program selector supports keyboard navigation and announces one selected option.
- [x] Switching between a generator style and Power Thrash II retains both forms' values. The existing generator flow still works.
- [x] The verification commands pass. The converter reports `1169 weights verified` when the local source workbook is available.

```bash
npm run power-thrash:convert
npm run typecheck
npm test
npm run build
```

## Release notes

- The workbook and derived template are Git-ignored. Use `npm run corpus:upload -- --power-thrash` to publish the template through authenticated corpus storage when its distribution is approved.
- Changing maxes saves a new snapshot. Each program keeps its own progress.
- Weights are in pounds and rounded to the nearest 5 lb.
