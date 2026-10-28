# Implementation notes — Offline Workout App (PRD v1.3)

Implemented all slices (0–8) as one pass, per the approved scope. Summary by slice:

| Slice | Result |
| --- | --- |
| 0 Foundation | Void SPA (`inference.appType: "spa"`, no `pages/`, no server loaders), TanStack Router code-based tree in [src/app.tsx](/home/davalon/Projects/workout/src/app.tsx), manifest v1 Zod schema in [src/domain/manifest.ts](/home/davalon/Projects/workout/src/domain/manifest.ts), sanitized/generated fixtures in [src/data/fixtures.ts](/home/davalon/Projects/workout/src/data/fixtures.ts), published layout under `public/content/` (catalog, demo manifest/session, exercise library). |
| 1 Renderer | One [WorkoutRenderer](/home/davalon/Projects/workout/src/components/WorkoutRenderer.tsx): line-aware Quill Delta parser in [src/domain/delta.ts](/home/davalon/Projects/workout/src/domain/delta.ts) (block attrs from the `\n` insert, embeds → placeholders, no HTML injection), exercise resolution embedded → library → placeholder, grouped/section rendering, exact prescription display, unknown blocks degrade. |
| 2 Hierarchy | Library → 3×/4×/5×/**Other schedules** → program → week → session, all derived from `daysPerWeek`; URLs use manifest IDs (`/program/:programId/week/:weekId/session/:sessionId`); `order` is 1-based; `suggestedWeekday` (ISO) is display-only. |
| 3 Offline content | Dexie (IndexedDB) repository in [src/data/db.ts](/home/davalon/Projects/workout/src/data/db.ts) behind the `Repository` interface with an in-memory implementation for tests; PWA via `vite-plugin-pwa` `injectManifest`; `NavigationRoute` shell fallback with `/content/`, `/api/`, `/assets/`, and file-extension denylist; `registerType: "prompt"` update banner. |
| 4 Import | Bundle import (file or manifest URL) with validation, path-traversal rejection, duplicate-ID detection, missing-exercise report (non-blocking), week/session-count warnings, idempotent re-import, and a migration report listing removed session IDs. Progress is never touched by import. Source payloads are stored verbatim. |
| 5 Progress | `ProgramRun` + separate `SessionProgress` store keyed `[runId, <programId>/<sessionId>]`; start/continue/restart-as-new-run; completion toggle (uncomplete clears `completedAt`); next-incomplete follows canonical order. |
| 6 Media | Per-program referenced-media collection (deduped by URL), bounded-concurrency (3) CORS downloads into Cache Storage, per-asset status (`downloaded`/`failed`/`not-downloadable`), progress + cancel + retry via re-download, delete-media-only, storage estimate, SW-synthesized `206` range responses for cached video. |
| 7 UX/a11y | Responsive shell (sidebar + mobile bottom nav), dark mode, sticky session footer, ≥44px controls, semantic headings, aria labels, `prefers-reduced-motion` respected via global CSS, empty/not-found/error states on every route. |
| 8 Backup | Progress export/restore (Zod-validated; malformed backups rejected without mutating data), separate resets for progress/media/content with confirmation, iOS eviction guidance on Downloads and Settings. |

## PWA spike (Slice 0)

`npm run build` emits `dist/sw.js`, `dist/manifest.webmanifest`, and a flat `dist/` SPA output (13 precache entries, ~1.15 MB) that Void's SPA mode serves from the site root with `index.html` fallback. The Playwright test in [e2e/offline.spec.ts](/home/davalon/Projects/workout/e2e/offline.spec.ts) proves: offline deep link to a nested session URL, zero network requests during in-app navigation, completion persisting across an offline reload, and `/content/*.json` never answered with HTML.

## Manual demo script

1. `npm run dev`, open the printed URL. Library shows 3×/4×/5×/Other cards and (after starting) a Continue card.
2. Open 4× → Athletic Performance → Start program → Week 1 → Session 1: coach notes, warmup section, squat card, supersets render in order; `ex-sled-drag` in Hill Sprint sessions shows the unknown-exercise placeholder.
3. Mark complete; reload — still complete. DevTools → Application → Service Workers → Offline, reload the session URL directly — it renders; navigate via breadcrumbs — no network entries.
4. Program page → Download media (demo media hosts are `media.example.com`, so assets report "not downloadable/failed" honestly; point fixtures at a CORS host to exercise full download + seek).
5. Downloads page shows text/media status + storage estimate. Settings: export progress, delete progress, restore the file — identical state. Library → Import program with `public/content`-style bundle JSON.

## Decisions and unresolved risks

- The original workout/exercise attachments were not in the repo; fixtures are the pre-existing sanitized demo data in [src/lib/workout-data.ts](/home/davalon/Projects/workout/src/lib/workout-data.ts), adapted non-destructively. Re-verify §4 observations when the real attachments land (Slice 1 note).
- Demo media URLs (`media.example.com`) do not resolve; the media pipeline, statuses, and range handling are implemented and unit-covered, but real offline video seek on Chrome/Android and Safari/iOS needs a CORS-enabled media host and physical devices.
- Dexie repository writes through whole tables on mutation (fine at catalog scale); migrate to per-record writes if catalogs grow large.
- Automated a11y audit (axe) and large-catalog performance budget tests are not yet wired; keyboard/screen-reader semantics were implemented but not machine-audited.
- `npx tsc --noEmit` reports pre-existing errors in the untouched composer editor files (`src/lib/composer-*`, `src/hooks/use-composer-editor.ts`); all new files type-check clean. Those legacy files are unused by the SPA and can be deleted in a cleanup pass.
