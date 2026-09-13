# ARCHITECTURE.md — LILA BLACK Player Journey Explorer

## What it's built with, and why

| Layer | Choice | Why |
|---|---|---|
| Data preprocessing | Python (pandas + pyarrow) | Reading parquet natively, decoding the `event` bytes column, and doing the coordinate transform once offline is far cheaper than doing it repeatedly in the browser. |
| Frontend | Plain HTML / CSS / vanilla JS, `<canvas>` rendering | ~89k events across 796 matches is small enough that a static site with one JSON payload is simpler and faster to ship than a React/build-tooled app, and needs zero backend to host. |
| Hosting | Netlify, connected to GitHub | Auto-redeploys on every `git push`, zero-config for a static folder, free tier is enough for this workload. |

No backend server, no database — the whole tool is a static site plus one
preprocessed JSON file.

## Data flow

```
player_data/<date>/*.nakama-0  (1,243 parquet files, one per player per match)
        │
        ▼  preprocess.py  (run once, locally)
        │   - reads every file with pyarrow
        │   - decodes `event` from bytes to string
        │   - classifies human vs bot from user_id format (UUID = human, numeric = bot)
        │   - converts world (x, z) → minimap pixel (px, py) per map
        │   - groups rows by match_id, nesting players within matches
        ▼
web/data.json  (single ~8MB file: { maps: [...], matches: [{ players: [{ events: [...] }] }] })
        │
        ▼  fetch() on page load, in the browser
        ▼
app.js renders paths/markers/heatmaps onto a <canvas>, filtered by the
map/date/match dropdowns and the timeline slider
```

Minimap images are loaded lazily, one at a time, only for the map currently
selected — not all three upfront — since two of the three images are large
(~10MB, ~12MB) and loading all of them on page load caused slow/inconsistent
loads, especially on mobile connections.

## Coordinate mapping approach

Each map's README config gives a `scale`, `origin_x`, and `origin_z`. For a
world coordinate `(x, z)`:

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale
px = u * 1024
py = (1 - v) * 1024      # z increases "up" in world space, but image
                          # y increases downward, so v is flipped
```

This is computed once per event during preprocessing and baked into
`data.json` as `px`/`py`, so the frontend never touches world coordinates —
it only ever draws pixel positions directly onto the 1024x1024 canvas that
sits on top of the minimap image.

## Assumptions made

- **Human vs bot** is inferred purely from `user_id` format (UUID vs short
  numeric string), per the README's description — no separate bot flag
  exists in the schema.
- **Files don't cover the full match roster.** Player counts per match vary
  widely (1 human + 0 bots up to 1 human + 14 bots) — not every participant
  of a given match has a file present in this extract. Treated as expected,
  not a data error.
- **Each file is a short, densely-sampled snapshot, not a full continuous
  match.** Timestamps show events sampled every 5-30ms, and file sizes
  (~72 rows average) mean each player's recorded window is typically under
  1-2 seconds — not a multi-minute round. The tool's "timeline" reflects
  this recorded window, not match duration. Documented directly in the UI
  (a note under Match Info) so it isn't mistaken for a bug by a reviewer.
- **Heatmaps aggregate across all matches in the current map/date filter**,
  not a single match — a single ~1-second snapshot has too few events to
  produce a meaningful density map on its own.

## Major tradeoffs

| Decision | Chose | Over | Why |
|---|---|---|---|
| Frontend framework | Vanilla JS + canvas | React/Next.js | No build step, nothing to npm-install, deploys as static files directly — faster to ship and debug for this scope. |
| Data delivery | One preprocessed JSON, fetched once | Live API / database queries | Dataset is small enough (~8MB) to load entirely client-side; avoids running and paying for a backend. |
| Image loading | Lazy per-map load | Preload all 3 minimaps upfront | Two of the three images are 10MB+; preloading all three caused slow, inconsistent load especially on mobile — lazy loading only pays for what's actually viewed. |
| Heatmap granularity | Fixed grid-cell binning | Point-density/kernel (e.g. Gaussian blur) heatmap | Simpler to implement correctly and fast to render at this data volume; a smoother kernel would look nicer but wasn't worth the added complexity for the time available. |
| Timeline scope | Per-match recorded window | Attempting to reconstruct a full "match timeline" from sparse snapshots | The data itself doesn't support a full-match timeline (see assumptions above) — building one would have meant fabricating structure the data doesn't have. |
