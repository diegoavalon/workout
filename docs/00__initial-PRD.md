# Offline Workout App — Product Requirements Document

Oct 26, 2026 · @Diego Avalon

**Status:** Implementation-ready draft · **Version:** 1.3 · **Product:** Offline-first training program reader and completion tracker

**Implementation:** Void (void.cloud) static SPA + React + TypeScript + TanStack Router · **Source artifacts:** Provided workout-page JSON export and exercise-library JSON export

## Changes from v1.2

| Area | v1.2 | v1.3 |
| --- | --- | --- |
| Routing | Void Pages (`pages/`, `@void/react`), server-driven transitions | Void SPA app type; client-side TanStack Router; one `index.html` shell |
| Offline navigation | Emulate the Pages navigation protocol in the service worker | Precached shell + navigation fallback; in-app transitions never touch the network |
| Exercise resolution | Contradictory order (§3 vs §4) | Embedded snapshot first, library index second, everywhere |
| Progress model | Map embedded in `ProgramRun` vs separate records | Separate `SessionProgress` records keyed by run + session ID |
| IDs and ordinals | Mixed 0-based/1-based, IDs unowned | Manifest owns stable IDs; `order` is 1-based; URLs use IDs |
| Manifest schema | Defined in Slice 4 | v1 defined in Slice 0; Slice 4 hardens import |
| Media | Generic caching guidance | CORS required for downloadable media; SW serves `206` range responses |
| Quill Delta | General rules | Line-level attributes on `\n` and embed handling specified |
| Misc | — | “Other schedules” card, weekday convention, `daysPerWeek` bounds, iOS eviction, naming (“Session”) |

## 1. Product outcome

Users choose a training frequency (3, 4, or 5 sessions per week), browse a structured program, navigate its weeks, open rich daily workouts, and record completion. Once downloaded, the program works without a network connection or sign-in. Exercise media works offline only after an explicit media download.

### Non-negotiable product decisions

1. **One workout engine.** The 3×, 4×, and 5× groups are navigation categories only. They must not create separate data models, rendering logic, scheduling algorithms, or progress engines. `Program.daysPerWeek` is canonical; groups are derived filters or labels.
2. **Ordered sessions, not fixed weekdays.** Week 1 / Session 1 stays the same workout whether performed Monday, Tuesday, or another day. Optional suggested weekdays never alter program order.
3. **Preserve source data.** Retain each workout's original ordered JSON and rich-text Delta. Build rendering adapters and indexes without destructively flattening the source.
4. **Offline is a functional promise, not merely PWA installation.** Cached app shell, local catalog, workouts, and completion state must work in airplane mode. Video availability is reported per download.
5. **Workout prescriptions belong to assignments.** The exercise library defines exercise identity, titles, instructional media, and metadata. Assignment records define sets, reps, times, rest, and notes.
6. **Completion is independent of content.** User activity never modifies imported workout definitions.
7. **Incremental delivery.** Each slice has a demonstration path and automated tests. No speculative backend infrastructure in the offline MVP.
8. **Content distribution is versioned JSON.** Published program manifests, workout-page JSON, and exercise definitions are flat files. Imports preserve source payloads and schema/content versions.
9. **Local repository is the runtime data source.** After seeding or importing content, every screen reads through IndexedDB repository interfaces, never network fetches or server loaders.
10. **Client-side SPA routing.** Deploy as a Void SPA (static app type) with a single `index.html` shell. Routing is fully client-side with TanStack Router. No Void Pages `pages/` directory and no server loaders in the MVP. Route loaders read IndexedDB in the browser.
11. **Offline deep links are first-class.** The service worker answers every document navigation with the precached shell, so direct open, refresh, and back/forward on nested URLs work offline. In-app transitions are pure client-side state changes and make no network requests.
12. **Progress is isolated from versioned program content.** Re-imports, upgrades, and media deletion must not erase completion history. Stable session IDs keep their meaning across content versions.

## 2. Who it serves and jobs-to-be-done

**Primary user:** an individual athlete following a preauthored strength and conditioning program on phone, tablet, or desktop.

- I can decide how many times per week I want to train and find compatible programs.
- I can inspect a program before choosing it.
- I can read coach notes, exercise prescriptions, grouped movements, and see media during training.
- I can complete sessions in sequence even when my real training days move.
- I can keep training in a gym with no reliable connectivity.

**Not in MVP:** multiple athlete accounts, coach dashboard, social feed, AI prescription generation, full weight/reps logging, cloud sync, detailed calendar scheduling, or editing the canonical imported workouts.

## 3. Information architecture

```
Catalog
├── 3× / week        ─┐
├── 4× / week         ├── Program (canonical daysPerWeek)
├── 5× / week         │    ├── Week 1
└── Other schedules  ─┘    │   ├── Session 1 → ordered workout blocks
                           │   ├── Session 2 → ordered workout blocks
                           │   └── Session N → ordered workout blocks
                           ├── Week 2 ...
                           └── Week N ...

Each workout block:
  Rich-text tile (serialized Quill Delta)
  Exercise assignment (referenced Exercise)
  Grouped assignment (nested ordered child assignments)
```

Program groups derive from `daysPerWeek`, an integer from 1 to 7. Values 3, 4, and 5 get their own groups. Any other valid value appears under **Other schedules** rather than disappearing.

### Domain entities

| Entity | Fields | Rules |
| --- | --- | --- |
| Program | `id`, `title`, `description?`, `daysPerWeek`, `totalWeeks`, `focus?`, `difficulty?`, `equipment?`, `cover?`, `contentVersion`, ordered `weeks` | `totalWeeks` is derived and validated against actual weeks |
| Week | `id`, `programId`, `order`, `title?`, ordered `sessions` | A week may have more or fewer sessions than `daysPerWeek` if the source says so; import shows a warning and never creates or deletes sessions |
| Session | `id`, `weekId`, `order`, `title?`, `summary?`, `suggestedWeekday?`, `estimatedMinutes?`, ordered source `items` | `suggestedWeekday` is optional and non-authoritative. A rest day is metadata or a real session with content; no empty sessions for untrained weekdays |
| Workout item | `order`, `type`, `itemId`, `child`, prescription fields, flags (`isSuperset`, `isSection`, …), `subAssignments` | Nested items have their own `order`, independent of top-level order. Unknown fields are retained |
| Exercise | Stable exercise `id`, `title`, `tags`, `logType`, `thumbnail`, `imageUrl`, `videoUrl`, other source fields | Indexed by ID. The embedded `child` snapshot on an assignment is the primary source; the library index is the fallback |
| ProgramRun | `id`, `programId`, `contentVersionAtStart`, `startedAt`, `endedAt?` | Multiple runs of one program never overwrite each other |
| SessionProgress | `runId`, `sessionId`, `completedAt?`, `startedAt?`, `lastOpenedAt?` | Separate store, compound key `[runId, sessionId]`. Uncompleting clears `completedAt`. Future set/rep logs use distinct records |

### Identity and ordering rules

- **The manifest owns IDs.** Program, week, and session IDs are supplied by the manifest and never derived from array position, order, or file path.
- **Canonical session ID** is `<programId>/<sessionId>` as stored in IndexedDB and used as the progress key. It is defined once in code; no other namespacing is allowed.
- **`order` is 1-based** for weeks and sessions, matching what users see. Ties sort by original array position.
- **URLs use IDs, not ordinals** (see §4), so a re-import that reorders sessions cannot point a bookmark at a different workout.
- **User-facing term is “Session.”** Code types use `WorkoutSession`; UI never says “Workout 3” for a session.
- **`suggestedWeekday`** uses ISO-8601 numbering: 1 = Monday … 7 = Sunday.

## 4. Technical direction and constraints

The app ships as a Void **static SPA**: one `index.html` shell plus hashed assets, with all routing and data in the browser. Void detects an SPA when `vite` is a dependency and no backend files exist; set `inference.appType: "spa"` in `void.config.ts` to lock it. If an API is needed later, Void's SPA + API mode adds `routes/` without changing the client architecture.

### Stack

- **UI:** React + TypeScript; responsive, mobile-first; accessible controls.
- **Routing:** TanStack Router (pinned), type-safe params and search. Route `loader` functions call the IndexedDB repository and run only in the browser. Code-based route tree in `src/routes/` (file-based generation via `@tanstack/router-plugin` is acceptable).
- **Packaging:** Vite-built installable PWA via `vite-plugin-pwa` (Workbox, `injectManifest` mode for custom range-request handling). App-shell precaching, `NavigationRoute` fallback to the shell, explicit “update available” flow (`registerType: 'prompt'`).
- **Local database:** IndexedDB through a thin repository adapter (Dexie, version pinned). Stores: manifests, source workout JSON, exercise index, program runs, session progress, media manifest, schema/version metadata.
- **Media:** Cache Storage for downloaded images and video (see Media rules below); IndexedDB blobs only if playback tests require it.
- **Import:** Zod schema validation plus source-preserving adapters. No HTML injection from Delta content.
- **Testing:** Vitest unit tests for adapters and selectors; component tests for the renderer; Playwright browser tests with `context.setOffline(true)` for service-worker and airplane-mode behavior.
- **Deployment:** `void deploy` uploads the static build to Cloudflare's edge. Hosting is not a prerequisite for a local-content demo.

### Routes

URL params are identifiers resolved through the repository, never file paths. Every route handles loading, not-found, and error states while IndexedDB initializes.

| URL | Route | Data source |
| --- | --- | --- |
| `/` | Library | IndexedDB catalog |
| `/programs/3` (`/4`, `/5`, `/other`) | Frequency group | `daysPerWeek` filter |
| `/program/:programId` | Program overview | Program manifest |
| `/program/:programId/week/:weekId` | Week view | Ordered sessions for the week |
| `/program/:programId/week/:weekId/session/:sessionId` | Session (workout) view | Source workout JSON + exercise index + progress |
| `/downloads` | Downloads / offline status | Media manifest |
| `/settings` | Settings / data | Progress export/import, resets |

Routes use stable IDs (e.g. `week/w01/session/w01-s2`). Display ordinals (“Week 1 · Session 2”) come from `order`, not the URL.

### Offline routing contract

- The service worker precaches `index.html`, all hashed JS/CSS, the web manifest, and icons.
- Every `navigate`-mode request returns the precached shell; the router then resolves the path client-side. This covers direct entry, reload, back/forward, and cold start after a prior install.
- `NavigationRoute` denylist: `/content/`, `/api/`, `/assets/`, and any path with a file extension. Those never receive HTML.
- In-app transitions are client-only. A test asserts zero network requests during navigation between imported program screens.
- Online behavior matches: Void serves `index.html` with status 200 for unmatched SPA paths. Missing files under `/assets/` return 404, which the SW must not mask.
- Void caches non-hashed files like `index.html` and `sw.js` until the next deploy and browsers revalidate them each request, so new SW versions are discovered promptly. Hashed `/assets/` files are immutable.

### Published content layout

Authored content lives as versioned JSON flat files in `public/content/` and is imported into IndexedDB. No remote database in the MVP. Bundled starter programs seed on first launch; further bundles download and import on demand. Rendering an already-imported program never requires fetching these files.

```
public/content/
  catalog.json                 # program ids, titles, daysPerWeek, versions
  exercises/library.json       # optional shared exercise definitions
  programs/
    athletic-performance/
      program.json             # manifest: ids, weeks, ordered sessions, content paths
      week-01/
        session-01.json        # original ordered workout-page array
        session-02.json
      week-02/...
```

The manifest supplies program ID, `daysPerWeek`, week and session IDs, order, titles, and file references; the sample workout JSON does not carry these parent-level associations. Import resolves `contentPath` relative to the manifest root, rejects path traversal, validates all JSON, and reports missing files or references. Each manifest declares `schemaVersion` and `contentVersion`. Unknown fields are preserved byte-equivalently.

### Storage and read ownership

| Layer | Owns | Runtime behavior |
| --- | --- | --- |
| Published JSON files | Versioned catalog, manifests, workouts, exercises | Used only for seed, bundle import, or explicit updates |
| IndexedDB | Imported manifests, source workout JSON, exercise index, runs, session progress, media manifest, versions | Primary read source for every screen, online or offline |
| Service worker + Cache Storage | App shell, hashed assets, downloaded images/video | Makes routes load offline; serves cached media including range requests |

The repository resolves `programId → weeks by order → sessions by order → source items` and passes items to one `WorkoutRenderer`. Exercise resolution is always: embedded `child` snapshot first, exercise-library index second, “unknown exercise” placeholder last. A content update never silently resets progress; a session ID that disappears or changes requires an explicit migration report.

### Media rules

- **CORS is a content requirement.** Media hosts for downloadable video and images must send `Access-Control-Allow-Origin`. Opaque (no-CORS) responses are not used for offline media: they cannot serve range requests and Chrome inflates their quota cost.
- **Range requests.** Video is fetched whole, stored in Cache Storage, and the SW answers `Range` requests with synthesized `206 Partial Content` responses (Workbox `RangeRequestsPlugin`). Safari requires this for playback and seeking.
- **Manifests.** URL-keyed media manifest with size, status, and integrity hash where available; supports removal and quota checks.
- **Verify playback, not presence.** “Video ready” means a full asset was retrieved and offline playback with seeking passed, not that a thumbnail is cached.
- **iOS eviction.** Safari may evict script-writable storage for sites not added to the home screen after a period without use. Request `navigator.storage.persist()` where supported, prompt iOS users to install, and never claim indefinite persistence.

### Important source-data observations

The supplied workout response mixes text tiles, exercise assignments, and nested grouped assignments. Rich text is a JSON-serialized Quill Delta inside `child.text`, not a Quill document for the whole page. Exercise assignments have `itemId` and frequently embed a complete matching exercise in `child`. Some grouped assignments use `itemId: "superset"` together with section flags; do not infer alternating superset behavior from the placeholder ID alone.

The uploaded workout file describes one page, not a multi-week program. Group names, weeks, and training days come from a containing manifest. `logType` semantics are displayed conservatively until validated. *These observations must be re-verified against the original attachments in Slice 1.*

## 5. UI surfaces

1. **Library / groups:** large 3×, 4×, 5× cards with program counts, plus an **Other schedules** card when such programs exist; continue-active-program shortcut.
2. **Program list:** title, weeks, sessions per week, training focus, optional equipment.
3. **Program overview:** description, week count, session count, optional equipment; Preview, Start, or Continue.
4. **Week view:** ordered, numbered Session cards with titles, completion checkmarks, optional suggested weekday, and next-session highlight. No seven-column mandatory calendar.
5. **Session view:** Program / Week / Session breadcrumb; coach notes; rich-text headings; exercise cards with thumbnail/video; sets/reps/time/rest/notes; grouped movements; completion toggle; previous/next session navigation.
6. **Downloads / offline:** text-ready, image-ready, and video-ready statuses; storage estimate when known; download progress, errors, retry, cancel, delete media. Never label content fully offline while required assets remain remote.
7. **Settings / data:** export/import personal progress; reset local content or media separately; confirm destructive actions.

### Session presentation rules

- **Ordering:** sort top-level blocks by numeric `order`; sort `subAssignments` by their own `order`. Ties keep original array position.
- **Quill Delta:** parse defensively. Inline attributes (bold, italic, color, size) sit on text inserts. Block attributes (`header`, `list`, `align`, `indent`) sit on the `\n` insert that ends the line, so the renderer buffers text until each newline and applies that newline's attributes to the whole line. Embed inserts (object values such as `{image: …}` or `{video: …}`) render as safe placeholders or readable text. Colors and sizes map to design tokens. Unsupported operations degrade to plain text. Never execute arbitrary HTML.
- **Exercise card:** name, image, and video from the resolved exercise; prescription from the assignment. Support rep ranges, per-set arrays, seconds, distances, unilateral notes, and null/missing fields without invented values.
- **Grouped container:** render parent group semantics plus nested children. `isSection` can mark a section-like sequence and does not always mean a conventional superset.
- **Media:** lazy-load; clear unavailable/offline state; the exercise stays readable without media.
- **Accessibility:** semantic headings, controls ≥ 44 px, visible keyboard focus, alt text, screen-reader labels, `prefers-reduced-motion`, WCAG AA contrast.

## 6. Delivery slices

Each slice is a working vertical increment. **Definition of done for every slice:** TypeScript passes, tests run, empty/error states are handled, and a manual demo script exists. No mocked green status for unimplemented functionality.

### Slice 0 — Project foundation, manifest v1, and fixtures

**User outcome:** the app boots consistently and has realistic test content.

**Implement:** Vite + React + TypeScript project deployed as a Void SPA (`inference.appType: "spa"`); TanStack Router with the route tree from §4 as stubs; design tokens; repository interfaces with an in-memory implementation; Zod schemas for **manifest v1** (program, weeks, sessions, IDs, `daysPerWeek`, content paths, `schemaVersion`, `contentVersion`); Vitest and Playwright tooling. Check in a compact sanitized fixture derived from the provided workout JSON and a subset of referenced exercises, plus a synthetic manifest (3× group → example program → Week 1 → Session 1) labeled as demo metadata. Do not commit private or licensed media without permission.

**Spike:** confirm `vite-plugin-pwa` emits `sw.js` and a correct precache list into Void's static build output, and that `void deploy` serves it from the site root with revalidating cache headers. Document the result.

**Acceptance criteria:** dev, build, and test succeed; the fixture and manifest validate; `/` and a demo session route render; no Void `pages/` directory or server loaders; the PWA build spike is documented.

**Dependency:** none.

### Slice 1 — Canonical workout renderer

**User outcome:** a real workout page is readable and ordered correctly.

**Implement:** source JSON adapter; Quill Delta renderer with line-level attribute handling; text tiles; exercise cards; nested group renderer; exercise resolution (embedded snapshot → library index → placeholder); exact set/rep/rest/timing display; media placeholders and errors; support for missing fields and unrecognized block types. Re-verify §4 source-data observations against the original attachments.

**Acceptance criteria:** the supplied sample renders ordered coach notes, warmup, training sections, and cooldown; all referenced exercises show correct names; sets/reps/times/notes are exact; nested assignments display in source order; headings and lists from `\n` attributes render correctly; invalid Delta or a missing exercise does not crash the page. Snapshot and targeted tests cover regular assignments and grouped sections.

**Dependency:** Slice 0.

### Slice 2 — Program hierarchy and frequency browsing

**User outcome:** browse 3× / 4× / 5× / Other → Program → Week → Session with the same renderer.

**Implement:** group selectors derived from `daysPerWeek`; program, week, and session views using manifest v1; breadcrumbs; previews; missing/empty states; Other schedules grouping.

**Acceptance criteria:** exactly one renderer serves all categories; changing `daysPerWeek` changes grouping without rewriting a workout; programs of different durations render; session numbering is independent of weekday; any session can be previewed before starting; no calendar dates required; URLs use stable IDs.

**Dependency:** Slice 1.

### Slice 3 — Persistent offline content and installability

**User outcome:** downloaded text workouts and exercise definitions survive restarts and work in airplane mode.

**Implement:** Dexie schema and migrations replacing the in-memory repository; persist catalog, manifests, source workouts, and exercise index; seed demo library on first load; PWA manifest and service worker with shell precaching and `NavigationRoute` fallback (denylist per §4); update-available prompt; startup loading and storage-error states.

**Acceptance criteria:** after initial load, close and reopen offline and browse groups, weeks, and sessions; zero network requests while navigating imported content; direct entry, reload, and back/forward on nested URLs succeed offline; `/content/*.json` and `/assets/*` requests never receive HTML; schema migration preserves existing records; missing program data is clearly identified.

**Dependency:** Slice 2.

### Slice 4 — Program import hardening

**User outcome:** import a program bundle and see all weeks and sessions correctly populated.

**Implement:** bundle download and import of manifest v1 and its files; raw workout-page arrays as per-session inputs; optional shared exercise library; referenced-exercise validation; duplicate-ID and conflict rules; content-version updates with a migration report when session IDs disappear or change; import preview and report; preserve original payloads and import-version info.

**Acceptance criteria:** a versioned bundle validates and imports; programs with 3, 4, or 5 sessions per week land in the right category and others in Other schedules; no fabricated weekdays; missing exercise IDs are reported without blocking text rendering; invalid manifests give actionable errors; duplicate re-import creates no duplicates; a content update preserves progress for unchanged session IDs; source data can be exported unchanged.

**Dependency:** Slice 3.

### Slice 5 — Start / continue / complete program

**User outcome:** follow sessions in order at a personally chosen pace.

**Implement:** `ProgramRun` and `SessionProgress` stores; start and continue; completion toggle with timestamp (uncomplete clears it); progress at session, week, and program level; next-incomplete selector; restart as a new run without destroying history.

**Acceptance criteria:** completing Session 1 persists across restarts and airplane mode; the suggested next session is the first incomplete session in canonical order; calendar gaps never auto-skip a session; out-of-order preview or completion never mutates source content; two runs of the same program keep separate progress.

**Dependency:** Slices 3–4.

### Slice 6 — Offline images and video downloads

**User outcome:** exercise media plays or displays without internet after an explicit download.

**Implement:** per-program referenced-media collection; deduplicate shared assets; CORS check per asset with a clear “not downloadable” status when it fails; bounded-concurrency download queue; persisted media manifest with size, status, and integrity; `navigator.storage.estimate()` and `persist()`; status indicators; retry, cancel, delete media only; SW range-request handling for cached video; local playback resolver.

**Acceptance criteria:** a fully downloaded test program shows images and plays and seeks video in airplane mode on Chrome (Android) and Safari (iOS); a partial download reports missing media accurately; downloads survive reload; insufficient quota gives a clear error; deleting media keeps workouts and progress; broken media never blocks a session.

**Dependency:** Slices 3–4. Can run in parallel with Slice 5.

### Slice 7 — UX polish, accessibility, and resilience

**User outcome:** a comfortable day-to-day mobile workout reader.

**Implement:** responsive cards and typography; sticky contextual navigation; dark mode; disclosure panels for long coach notes; lazy media; loading/error states; keyboard and screen-reader checks; automated a11y testing; SW update notification polish; performance budget for large JSON.

**Acceptance criteria:** phone and desktop layouts are usable; primary interactions work by keyboard; text stays usable when media fails; a large catalog does not freeze navigation; a SW update never loses progress; the accessibility audit covers major workflows.

**Dependency:** Slices 1–6.

### Slice 8 — Backup/export and release hardening

**User outcome:** users can protect local progress and use the app confidently offline.

**Implement:** JSON export and validated restore of runs and session progress; separate content export if licensed; explicit reset functions; storage warnings including iOS install guidance; browser tests for reinstall and eviction; release checklist; error logging without sensitive data.

**Acceptance criteria:** export → clear → restore yields identical progress; a malformed backup is rejected without corrupting data; media deletion and progress deletion are distinct; no claim of indefinite persistence; the full airplane-mode critical path passes on target browsers.

**Dependency:** Slices 3–7.

## 7. Build order and milestone demos

Build Slices 0 and 1 before catalog screens: the unknown complexity is in the legacy workout JSON and grouped block semantics, not the 3×/4×/5× cards.

| Milestone | Slices | Demonstrable result |
| --- | --- | --- |
| A — Working workout reader | 0–1 | Open the supplied fixture; render rich text, exercises, and groups |
| B — Program navigation | 2 | Choose 3×/4×/5×/Other, inspect program, week, session |
| C — True offline text app | 3–4 | Import a full program, reopen and navigate in airplane mode |
| D — Usable training companion | 5 | Start and complete sessions, resume correctly |
| E — Complete offline instruction | 6 | Download and play referenced videos offline, with seeking |
| F — Release | 7–8 | Responsive, accessible, recoverable, and tested |

## 8. Data contract sketch

Illustrative only; it documents relationships, not a replacement for the source JSON. Real input schemas are versioned Zod schemas in code.

```ts
type TrainingFrequency = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Program = {
  id: string;                    // from manifest, never derived
  title: string;
  description?: string;
  daysPerWeek: TrainingFrequency; // canonical grouping attribute
  totalWeeks: number;            // derived + validated against weeks.length
  focus?: string;
  difficulty?: string;
  equipment?: string[];
  cover?: string;
  schemaVersion: number;
  contentVersion: string;
  weeks: ProgramWeek[];
};

type ProgramWeek = {
  id: string;
  programId: string;
  order: number;                 // 1-based
  title?: string;
  sessions: WorkoutSession[];
};

type WorkoutSession = {
  id: string;                    // stable across content versions
  weekId: string;
  order: number;                 // 1-based; UI shows "Session {order}"
  title?: string;
  summary?: string;
  suggestedWeekday?: 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday; never identity
  estimatedMinutes?: number;
  items: unknown[];              // retained verbatim; validated by adapter
};

// Canonical progress key, defined once:
const sessionKey = (programId: string, sessionId: string) =>
  `${programId}/${sessionId}`;

type ProgramRun = {
  id: string;
  programId: string;
  contentVersionAtStart: string;
  startedAt: string;             // ISO 8601
  endedAt?: string;
};

type SessionProgress = {          // separate store, key [runId, sessionKey]
  runId: string;
  sessionKey: string;
  completedAt?: string;          // cleared on uncomplete
  startedAt?: string;
  lastOpenedAt?: string;
};
```

Imported workout items retain unknown fields and versions.

## 9. Quality risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Incorrect interpretation of nested “superset”/section structures | Fixture-based tests, preserve flags, document observed render semantics |
| Generic exercise metadata overrides workout prescription | Assignment is the source of truth for sets/reps/rest/time |
| Quill content malformed or uses unexpected attributes | Line-aware Delta parser, tested fallbacks, no HTML injection |
| App installs but data is unavailable offline | Playwright airplane-mode tests for text and navigation |
| Deep links work online but fail offline | SW `NavigationRoute` returns precached shell; offline reload/back/forward tests |
| SW returns HTML for JSON, assets, or media | `NavigationRoute` denylist; tests assert content types |
| PWA plugin output incompatible with Void build | Slice 0 spike verifies `sw.js` emission, precache list, and headers |
| Video downloaded but cannot seek/play offline | CORS required; SW synthesizes `206` range responses; test on Chrome and Safari |
| Cross-origin media host lacks CORS | Per-asset CORS check; mark “not downloadable” rather than caching opaque responses |
| Browser (especially iOS Safari) evicts data | `persist()` where supported, iOS install guidance, progress export/restore |
| Re-import corrupts or orphans progress | Manifest-owned stable IDs, separate `SessionProgress` store, migration report for changed IDs |
| Fixed weekday scheduling blocks users | Session order is canonical; weekday is an optional annotation |
| Duplicate 3×/4×/5× business logic | One data model, one renderer, groups derived from `daysPerWeek` |
| Router choice drifts back to server-driven navigation | Decision 10; no `pages/` or loaders without a PRD revision |

## 10. Out of scope and future opportunities

Deferred beyond release: per-set weight/reps logs, adjustable schedule/calendar, timers, personalized exercise swaps, program-authoring studio, coach/athlete roles, cloud sync, online catalog/community distribution, advanced analytics, and AI guidance. The model must allow these without turning training frequency into separate engines or mutating imported content. Cloud sync, if added, uses Void's SPA + API mode (`routes/`) and leaves the client-side routing and IndexedDB-first reads unchanged.

## 11. Agent implementation protocol

For each slice:

1. Read this PRD and implement only the chosen slice plus genuinely necessary dependencies.
2. List exact changed files and data migrations.
3. Write source-data adapter tests first for tricky behavior.
4. Implement UI, persistence, and empty/error/offline states for that slice.
5. Run type checking, unit tests, relevant Playwright smoke tests, and the production build.
6. Demonstrate the slice's acceptance criteria using realistic fixtures.
7. Document decisions and unresolved risks before moving on.

**Stop condition:** do not silently begin the next slice. Do not substitute hardcoded sample text for source-derived content when the slice requires real JSON rendering. Do not add a Void `pages/` directory, server loaders, or a different router without a PRD revision.

## 12. References

- [Void — Supported App Types](https://void.cloud/guide/app-types) (SPA and SPA + API modes, `inference.appType`)
- [Void — Static Assets Caching](https://void.cloud/guide/edge/static-assets) (hashed vs non-hashed caching, SPA navigation fallback)
- [Void — Project setup (CLI)](https://void.cloud/reference/cli/setup)
- [Void — Pages Routing](https://void.cloud/guide/pages-routing/overview) (not used; kept for the rationale behind Decision 10)
- [TanStack Router](https://tanstack.com/router/latest)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [Workbox range requests](https://developer.chrome.com/docs/workbox/modules/workbox-range-requests)
- Workout JSON and exercise library: the two original attachments are the source fixtures, not the abbreviated examples in this PRD.
