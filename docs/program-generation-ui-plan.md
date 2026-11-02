# Generated programs as the main app experience

## Summary

Replace the preset program catalog with **Active program**, **New program**, and **Saved programs**. Generate six-week programs in the browser using the existing generator, then reuse the current review, activation, and training experience.

## Navigation and saved content

- Rename `/train` to `/active-program`; redirect `/train` and `/` there. Update links, buttons, empty states, and activation messages to say “Active program.”
- Replace Library and its frequency links with New program (`/programs/new`) and Saved programs (`/programs/saved`) in desktop and mobile navigation. Keep Downloads and Settings.
- Saved programs lists generated snapshots with their status and links to the existing overview. Keep generated JSON import available here as a secondary action.
- Remove preset catalog browsing. Redirect old frequency-list URLs to New program; retain existing program/session detail routes for previously saved content.
- Preserve stored programs, runs, progress, and exercise metadata. Stop automatically installing preset programs on fresh devices; retain exercise data needed for workout rendering.

## New program flow

Build a single responsive form using existing local COSS components and inline Tailwind styles.

- **Training style:** Pump Lift, Pump Condition, Perform, or Minimalist.
- **Days per week:** 3/4/5 for Pump tracks; fixed at 5 for Perform and 4 for Minimalist.
- **Equipment:** “No restriction” by default, with an option to select available equipment. Bodyweight is always allowed; choices come from generator equipment tags.
- **Suggested start:** next Monday in the user’s local calendar, including today when today is Monday. Require a valid Monday.
- **Advanced:** optional integer seed from 0–4294967295 and “Allow lifts from the latest source block,” off by default. Explain that this refers to source material rather than personal workout history.
- Default to Pump Lift, three days per week, and six weeks. Generate an omitted seed using the CLI’s existing 1–50 range.

“Generate program” displays progress, prevents duplicate submissions, and retains inputs on failure. Successful results pass through the existing validation and snapshot registration path, then open the existing program review.

Review offers **Use this program**, **Edit inputs**, and **Generate another**. Generating another uses a new seed; editing retains the previous inputs. Each successful result is saved, with identical snapshots deduplicated. Activation remains explicit and preserves the previous program’s history.

## Browser generation

- Reuse `src/persist/generate.ts` unchanged as the generation engine; keep the Node CLI working.
- Add a build step that packages all indexed `data/views` weeks into a versioned static corpus and fails clearly if source data is missing.
- Lazy-load the generator and run it in a Web Worker so generation and corpus parsing do not block the interface.
- Download the corpus on first generation and cache it for subsequent use. The current corpus is approximately 17 MB before compression; keep it outside the initial app bundle and shell precache.
- Show download and retry states. Offline generation works after the corpus has been cached; otherwise explain that the first generation needs a connection.
- Return the existing generated payload shape. No server endpoint or database migration is required.
- Preserve existing structural validation and caveat handling, including visible equipment mismatches. Generation never automatically activates a program or starts a session.

## Validation and defaults

- Verify browser and CLI generation produce identical payloads for the same corpus and explicit options.
- Test track/frequency mapping, Monday validation, seed boundaries, equipment selection, download failures, and cached offline generation.
- Exercise generate → review → activate → resume, plus regeneration without changing the active run.
- Verify redirects, saved-program access, backup/restore, and preservation of existing checkmarks and history.
- Check keyboard access and mobile layouts; run typecheck, relevant unit tests, production build, and focused Playwright coverage.

Exercise substitutions, adaptive programming, and changes to the generation algorithm remain outside this update.
