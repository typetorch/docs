# Recordings and maps

See what new players did, and where, without Roblox Studio. The explorer draws first-session recordings and your
positioned events on each map's real geometry, replays one session at a time, and says why players quit.

- **Recordings** page (`/recordings`): map layers, replay, quit autopsy, first actions.
- **Maps** page (`/maps`): each map exported from the place, as a 2D minimap and a 3D map.
- Game side: framework 0.7.1+ for positions and `recordSeconds`; older frameworks still send recordings, with a fixed
  60 s window. Backend: main (unversioned).

Contents: [What the game sends](#what-the-game-sends) · [Maps](#maps) · [The Recordings page](#the-recordings-page) ·
[Quit autopsy](#quit-autopsy) · [First actions](#first-actions) · [Queries](#queries) · [Limits and speed](#limits-and-speed)

## What the game sends

```ts
// Server: positions on the events you want on the map, and the map's name on some event
const analytics = new AnalyticsEngine({ positions: ["down", "death_final"] });
analytics.track(player, "round_start", { map: "Forest" });
analytics.track(player, "down", { cause: "fall" }); // carries px, py, pz: its name is in `positions`
```

| What | Why | How |
|---|---|---|
| First-session recordings | the paths, idle spots, deaths, screens, buttons, prompts and the replay | on by default (engine option `recording`); `recordShare` picks the share of new players, `recordSeconds` how long after the first input (default 60, 10-600) ([the first-ever session](analytics.md#the-first-ever-session-recorded-in-detail)) |
| Positions (`px`, `py`, `pz`) | your events as points on the map, at any time, not only in the first session | `track(..., { position: true })`, or the event name in the engine option or settings `positions` ([Positions](analytics.md#positions)) |
| A `map` prop | which map a position belongs to, and which models to export | any event whose props have `map`, e.g. `round_start { map }` |

**Which map a point is on.** A sample, input or positioned event belongs to the map of the latest event before it on
the same server whose props have the map key; else the player's own latest such event. These go to the
**`(lobby / unknown)`** layer instead: a zone matching `lobby`, an empty map value, no map event yet, or a position far
outside the map's area (a stale map while the player waits in the lobby). The queries take `mapKey` for a game that uses
another prop name.

## Maps

### Export

An owner presses **Export** on the Maps page (`POST /v1/maps/export`, audited). The backend runs a read-only Luau script
in the place through Open Cloud Luau Execution: no Studio, no game code.

- **Needs** `OPENCLOUD_API_KEY` with `universe.place.luau-execution-session:read` and `:write`, and
  `TYPETORCH_UNIVERSE_ID`. The place is the universe's root place (else the place the fleet's servers report). Without
  them the route answers 409. `asset:read` on the key lets the page say when the export is out of date.
- **Which models are maps.** The names come from the events' `map` prop over the last 30 days (`map-positions`), plus
  any `names` in the request body (at most 50) and the overrides. The script packs every Model or Folder in Workspace,
  ReplicatedStorage and ServerStorage whose name matches one, ignoring case and punctuation (`parking_garage` finds
  `ParkingGarage`). One model per name: an override's first, else the one with the most parts, then the shortest path
  (the others are listed as alternatives). Names with no model are listed as unmatched.
- **The lobby** is everything else with geometry in Workspace (not Terrain, not the camera), listed as `(lobby)`.
  Terrain is skipped.
- **Every part counts**, visible or not: parts at transparency 0.95 or more are flagged invisible, never dropped
  (invisible walls shape where players walk). MeshParts and unions are exported as boxes of their size.
- **Limits:** one export at a time (409 while one runs), at most one every 30 s (429 with `Retry-After`). Roblox allows
  5 task creations a minute per key owner: a 429 from Roblox waits and retries, up to 5 times. The task times out after
  180 s. The page shows the step (creating the task, queued on Roblox, running in the place, downloading the geometry,
  storing) and, on failure, why.
- **Storage:** `<data dir>/maps/` (an index with the latest export, a 20-entry history and the overrides, and one
  geometry file per map named by its content hash).
- **Out of date:** when the place's newest version (Assets API; else the newest place version the fleet's servers
  reported in the last day) is newer than the exported one, the page says "out of date, export again".

### Alignment and overrides

For each map, the backend checks the positioned events on it (last 30 days) against the map's box: `aligned` (80% or
more inside), `partial` (from 20%), `off` (with a suggested offset), or `unknown` under 10 events. When it is
`unknown`, the page runs the same check on the recordings' positions on that map and says which source it used.

An owner's **override** (`PUT /v1/maps/<name>/override { path?, offset? }`, audited; `DELETE` removes it) sets the model
to export (an instance path such as `ReplicatedStorage.assets.maps.Mall`, used at the next export) and/or an offset
(applied at once, to the geometry, never to the events). The alignment card applies the suggested offset in one click.

### The Maps page

- An export card (last export, place version, out of date, the Export button with its progress, unmatched names), a map
  picker, **2D / 3D** (3D: orbit with the mouse, fly with W A S D Q E; 2D: the same scene from above, north up, pan and
  zoom).
- A **Y band**: floors found in the geometry, or a free height range. Geometry above and below is cut away, so indoor
  floors show in 2D.
- **Layers:** one per positioned event, as dots or heat cells of 0.5, 1 or 2 studs. The filter bar applies.
- **What's drawn:** the collision geometry (every part that collides, visible or invisible, in its own colour; invisible
  ones see-through), plus small visible decoration. Off by default, each behind a toggle: decorative meshes (meshes and
  unions that don't collide; their boxes are only bounding volumes) and markers and triggers (invisible parts that
  don't collide).
- The view is in the URL (`map`, `mode=3d`, `draw=points`, `cell`, `band`, `decor=1`, `markers=1`, `hide`), on both
  pages, so a view is shareable.

Reads are open to every signed-in role: `GET /v1/maps` (the export, its state, the maps with bounds, part counts and
alignment) and `GET /v1/maps/<name>/geometry` (one map's binary, with an `ETag`; `(lobby)` for the lobby). The binary
format is in the backend README's [Maps](https://github.com/typetorch/backend#maps).

## The Recordings page

Four tabs. Their state is in the URL next to the filter bar's (`tab`, `map`, `layers`, `view`, `sid`, `win`).

![The Map layers tab: new players' positions as a heatmap on the game's exported map](/screenshots/recordings.png)

Try it in the [live demo](https://demo.typetorch.dev/recordings).

| Tab | What it shows |
|---|---|
| **Map layers** | pick a map and toggle layers: positions, idle spots, deaths, spawns, screens opened and closed, button presses, prompts, quits, and every positioned event kind in the range. Per-layer value chips (screen names, button paths, an event split by a prop such as `cause`), zone and screen filters, heatmap or dots. Click a cell for the sessions with a point of the first picked layer there |
| **Replay** | the sessions by how they ended, an id, or a confusion signal; then one session: the path, a moving dot with the camera's direction, a timeline of clicks, buttons, screens, prompts, deaths, your events and confusion signals, play / pause at 0.5x to 8x; device, build and why it ended |
| **Quit autopsy** | the last 5 / 10 / 20 / 30 s before quitting ([below](#quit-autopsy)) |
| **First actions** | seconds from spawn to the first move, screen, button, prompt and round start ([below](#first-actions)) |

- A map with an export is drawn on its real geometry, 2D or 3D, with a cell size of 0.5, 1 or 2 studs (default 2).
  Without an export, the page draws a silhouette: the density of every recorded position on the map.
- The First session page links each idle, camera spin and repeated-click row to its replays. A player's first session
  on the Players page links to its replay.

## Quit autopsy

For each recording that ended with the player leaving (`why = left`), the last `windowSeconds` (10 by default) get
every reason that applies, so one session can count under several:

| Reason | When |
|---|---|
| `screen` | a screen was open at the end |
| `died` | a death, or a `down` / `death_final` event, within 20 s |
| `idle` | no input and almost no movement |
| `stuck` | movement keys or the stick, but almost no movement, no screen open |
| `dead_clicks` | 2+ button presses with no screen change |
| `tutorial` | the last step of a funnel matching `tutorial` or `onboard`, below the furthest step anyone reached |
| `none` | none of the reasons above |
| `place` | where the player stood: a cell of the map ("Forest · B3"), added to every session with a map |

Each reason comes with its share among quitters, the same share among the players who played on (their last seconds),
and the **lift** (over 1 = more common among quitters), with example sessions that open in the replay. So a reason shows
as over-represented, not just common.

## First actions

Per recorded first session: seconds from spawn to the first move (3 studs), the first screen the player opened (within
1.5 s of an input, so HUDs the game opens itself don't count), the first button press, the first prompt used, and the
round start (from your events, default `round_start` or `phase`). Median, middle half, reached share and a histogram,
in total, by device and by build. Move, screen, button and prompt are only seen inside the recording window.

## Queries

All over `POST /v1/query/<name>` with the usual filters ([Queries](analytics.md#queries)):

| Query | Default range |
|---|---|
| `recording-layers` | 7 days |
| `recording-sessions` | 7 days |
| `recording-replay` (`sid`) | 30 days |
| `quit-autopsy` | 7 days |
| `first-action` | 7 days |
| `map-positions` | 7 days |

Options (`mapKey`, `grid`, `cell`, `windowSeconds`, `downEvents`, `roundEvents`, ...): the backend README's
[Recordings](https://github.com/typetorch/backend#recordings-maps-replays-quit-autopsy).

## Limits and speed

- Recordings are decoded in the backend and cached in memory (96 MB). Past 3,000 sessions (`maxSessions`) a query
  samples them in a fixed order (the same range gives the same sample) and says so.
- Positioned events are counted in SQL per 4-stud cell (the real-map view asks for finer cells).
- Basin caps each statement at 10,000 rows; sessions are read in batches, and the answer says when the list hit the cap.
- Recordings hold pids, never UserIds or names. Positioned events are ordinary event rows: erasure deletes them with the
  player's other rows ([Privacy](analytics.md#privacy-and-right-to-erasure)).
