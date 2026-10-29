# raw-export

Local-only source exports. All `*.json` here is gitignored (licensed content).

Layout: `<program>/<track>/week-<n>/day-<n>.json`, e.g.
`perform/five-day/week-1/day-1.json`. Each file is the raw, unedited item
array returned for that workout day.

Convert to an importable bundle:

```
npm run convert:raw -- raw-export/perform/five-day
```

See `docs/raw-export-workflow.md` for the full workflow.
