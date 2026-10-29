# Raw-export workflow — PERFORM

Goal: get every workout day out of the source app as raw JSON, then convert it
into a bundle this app can import. Raw payloads are never edited by hand.

## Layout (architecture as added, kept)

```
raw-export/perform/
  five-day/            # track dir; name encodes daysPerWeek (five-day, 4-day, ...)
    week-1/
      day-1.json       # raw source item array for that session, byte-for-byte
      day-2.json
    week-2/ ...
  bundle-five-day.json # generated, gitignored
  index-five-day.json  # generated conversion report, gitignored
```

Review notes on this layout:

- It maps 1:1 onto the manifest (`week-N` -> week, `day-N` -> session), so the
  converter needs no mapping table. Keep it.
- `day-N` (not `session-N`) is fine. It matches the calendar the data came from.
- All `*.json` under `raw-export/` is gitignored: this is licensed program
  content and may only live on this machine.
- Provenance lives inside each file (every item records its source `path`,
  including the source workout-page id), and the converter copies those source
  ids into `index-<track>.json`. If the same calendar day is ever re-exported,
  overwrite the same file; do not add dated copies.

## Converting (seconds, fully local)

```
npm run convert:raw -- raw-export/perform/five-day
```

This scans `week-*/day-*.json`, converts each day (source types `text` /
`exercise` -> `richText` / `exerciseAssignment` / `groupedAssignment`, group
children ordered by `assignmentIds`, per-set arrays collapsed, group `richText`,
RPE and warm-up data surfaced into notes), builds the deduped exercise library
from the embedded exercise snapshots, validates the manifest with the app's own
Zod schema, and writes `bundle-five-day.json`.

Then in the app: Library -> Import program -> upload `bundle-five-day.json`.
Re-importing the same bundle is idempotent and preserves progress.

## Publishing as app source (online-first)

The workout also lives as tracked source in the repo:

```
npm run convert:raw -- raw-export/perform/five-day --publish public/content
```

This writes `public/content/programs/perform-five-day/program.json`, one JSON
file per session, the shared exercise library, and `catalog.json`. These files
are committed, so the program survives any browser-data loss and can be
regenerated from the raw captures at any time.

### Variations (3x / 4x / 5x)

Variations are data, not separate code or workflows. Capture each one into its
own track and publish it the same way:

```
raw-export/perform/three-day/week-1/day-1.json ...
npm run capture:raw -- --url <...> --track raw-export/perform/three-day
npm run convert:raw -- raw-export/perform/three-day --publish public/content
```

Each track becomes its own program (`perform-three-day`, `perform-four-day`,
`perform-five-day`) with its own weeks, sessions, and progress. Publishing
merges the variation into the shared catalog and the shared exercise library
instead of overwriting them, and the app groups each variation by its
`daysPerWeek` automatically. Capture order within a variation follows the same
week/day layout as the 5x track.

At runtime the app is online-first:

- On load it fetches `/content/catalog.json` and each program manifest, and
  lists programs from that metadata. Session content is **not** downloaded yet.
- Opening a session fetches its file once and caches it in IndexedDB.
- **Download program** on the program page saves every session for offline
  use; media remains a separate explicit download on the same page.
- Offline, downloaded programs open normally. Sessions never fetched show a
  "not on this device yet" message instead of failing.
- The Import dialog remains available for one-off bundle testing.

Warnings to expect and act on are listed in `index-<track>.json`. Example from
week 1 day 1: the Clean Complex group references two assignment ids
(`UMWgUrmCR138SoHAYBbw`, `OWpqe0V1x1mMS0uADQtE`) that are not present in its
`subAssignments` in the source response. Those movements cannot be rendered
until a fuller response for that group is captured; the converter reports this
instead of inventing content.

## Capturing — the browser bridge (built)

`scripts/capture-raw-export.ts` connects the browser to this workflow. It
opens a real Chromium window and listens to its network responses while you
click days; anything that looks like a workout-day item array is written,
byte-for-byte, as the next `week-<w>/day-<d>.json`. Your login lives in a
local browser profile (`.auth/`, gitignored) and is reused on later runs.
No credentials are read, printed, or stored by the script.

```
npm run capture:raw -- --url <source calendar URL>
npm run capture:raw -- --url <...> --track raw-export/perform/five-day --week 2 --day 1
npm run capture:raw -- --cdp http://127.0.0.1:9222   # or attach to your own Chrome
```

How a session goes:

1. Run the command. Log in in the window if asked (first run only).
2. Click workout days in calendar order. Each captured day prints its file,
   item count, source workout-page id, and the first text tile so you can
   confirm it is the day you meant.
3. When the calendar moves to a new week, type `w2` (then Enter) in the
   terminal. Type `d<n>` to correct the next day number, `s` for status.
4. Type `q` when finished, then run `npm run convert:raw` and import.

Safeguards: clicking the same day twice is detected by content hash and
skipped; an existing file is never overwritten (pick another slot with `d<n>`
and click again); responses that are not day payloads are logged and skipped.
If the source app ever serves day data from a URL without `/items` in it,
pass `--filter <substring>` with a distinctive part of that URL.

Fallbacks if the capture window cannot be used: a browser agent with network
access can save the same responses to the same layout, and a HAR exported
from DevTools contains the same bodies. Either way the converter step is
unchanged. Only capture content your account is entitled to; raw files stay
out of git (enforced by `.gitignore`).
