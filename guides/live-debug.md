# Live debug

Your game declares what it wants to show on the backend explorer: read-only **commands** (buttons on a server's page),
**streams** (values sampled while someone watches, `points` drawn on the live map) and **columns** on the Fleet page.
The kernel also streams every player's position, so the explorer can draw a live map of one server or of all of them.

- Framework **0.7.1**+ (`remoteDebug`, `fleet`) and kernel **0.5.7**+ in the place (a place project that maps the
  kernel's files one by one must map `LiveDebug`). Backend: main (unversioned).
- It builds on [remote debug](fleet-and-alerts.md#errors-debug-bundles-and-remote-debug) (kernel 0.5.0+): the same
  pull model, owner checks, limits and secret scrubbing.
- The API reference is in [Runtime API: Live debug](runtime-api.md#live-debug-server-only).

## In game code

Server only (a client throws). Register in `onInit` or `onStart`, and hand each remover to the module's trove.

```ts
import { fleet, remoteDebug, TypeTorch } from "@typetorch/framework";

// A button on /servers/<JobId> (op game.round_state). It must only read.
this.trove.add(
	remoteDebug.command(
		"round_state",
		(args, caller) => ({ kind: "kv", items: { round: this.round, phase: this.phase, alive: this.alive.size() } }),
		{ label: "Round", description: "The current round, its phase and how many are alive" },
	),
);

// A table answer.
this.trove.add(
	remoteDebug.command("spawners", () => ({
		kind: "table",
		columns: ["name", "next", "active"],
		rows: this.spawners.map((s) => [s.name, s.nextAt, s.active]),
	})),
);

// Sampled at 1 Hz only while someone watches this server; "points" draw as markers on the live map.
this.trove.add(
	remoteDebug.stream("loot", () => ({ points: this.chests.map((c) => ({ x: c.X, y: c.Y, z: c.Z, label: "chest" })) }), {
		hz: 1,
		kind: "points",
		label: "Loot",
	}),
);

// A Fleet page column, read whenever a heartbeat is built.
this.trove.add(fleet.column("current_map", () => this.mapName, { label: "Map", type: "string" }));
fleet.columnsChanged(); // after the map changed: a heartbeat soon (at most one per 10 s)

remoteDebug.supported(); // true on a server whose kernel takes the declarations (also TypeTorch.features.liveDebug)
```

`TypeTorch.remoteDebug` and `TypeTorch.fleet` are the same objects. On older kernels and in edit mode every call is
accepted and checked, and nothing reaches the backend.

## Limits

| What | Limit |
|---|---|
| Names (commands, streams, columns) | `^[a-z][a-z0-9_]{0,31}$` |
| Commands per server | 32 (label at most 40 characters, description at most 200) |
| Streams per server | 8, at 0.2 to 4 Hz; `kind` `"points"` or `"json"` (default) |
| Columns per server | 16; a value is a string (at most 64 characters), a number, a boolean or nothing; `type` `"string"`, `"number"` or `"bool"` is a display hint |
| Command args | an optional JSON object of at most 2 KB |
| Command answer | at most 200 KB, scrubbed of the settings' keys and tokens |
| Command calls | owners only; the backend takes 30 a minute per explorer user and 60 per server, the kernel runs 30 a minute, each with a 10 s deadline |
| Stream sample | at most 16 KB of JSON (bigger samples are dropped and counted); `points`: `{ points: [{ x, y, z, label?, color? }] }`, `color` a CSS colour |
| Getters and samplers | run on kernel threads under pcall with a short deadline: keep them cheap and never yield |

A bad name or option, a duplicate, or one past a limit throws at once.

## What the explorer shows

| Where | What |
|---|---|
| A server's **Game** tab (`/servers/<JobId>`) | a button per declared command, labelled **game-defined**, with optional JSON args. `{ kind: "table", columns, rows }` draws as a table, `{ kind: "kv", items }` as key-value pairs, anything else as JSON. Below, each stream's latest value |
| A server's **Live map** tab | the server's players on the [exported map](recordings-and-maps.md#maps): positions at 2 Hz, a map switcher, 2D / 3D and the height band, the name on hover, a 20 s trail, your `points` streams as markers (each point in its `color`, else the stream's; a point's `label` isn't drawn). Click a dot or **Follow** to follow a player |
| **Live map** (`/live`, next to Fleet) | every live server's players at once, coloured per server. While it is open, servers post only positions, one frame every 3 s |
| **Fleet** page, **Columns** button | your custom columns (hidden until turned on), as the union of what the live servers declared |

The server page's tabs only connect while it is open: the backend tells that server it is watched, and the server
polls and posts. Nothing extra is sent while nobody watches. With the instant wake (an Open Cloud messaging key on the
backend) a server answers within seconds; else at its next heartbeat (up to 30 s).

## Safety rules

- **Commands must be read-only.** That is your promise: the kernel can't check what a handler does. The explorer labels
  them game-defined, and only owners can run them. Review a command like any owner-only code: no kicks, no data writes,
  no grants.
- **No personal data in columns.** Column values are stored with the server row in the backend's database. Never put
  player names, UserIds or anything personal in one; game state only (map, round, mode, counts).
- **Streams are kept in memory only.** Positions and stream frames hold player names, UserIds and positions: the backend
  keeps the last 120 s per server (bounded in size), never writes them to disk, a log or the event bus, and drops them
  the moment the server closes or is lost. The explorer keeps them in the page only.
- Command args are audited by size only, never their values. Answers are never stored or logged.
- The routes that run commands, watch servers and read streams or the live map are owners only; the read-only web role
  sees the Fleet columns.

## Routes

| Route | Role | What |
|---|---|---|
| `POST /v1/fleet/servers/<JobId>/commands` | owners | `{ op: "game.<name>", args? }`, taken only when that server declared the command (else 400) |
| `GET /v1/fleet/servers/<JobId>/streams?since=<t>` | owners | `{ declared: { streams, commands }, frames: [{ t, s }] }`, oldest first |
| `POST /v1/fleet/live-map/watch` | owners | the `/live` page is open (sent every 20 s; lapses after 60 s) |
| `GET /v1/fleet/live-map` | owners | each live server's latest positions frame of the last 15 s |
| `GET /v1/fleet/columns` | owners, viewers | the declared columns of the live servers |
| `POST /v1/fleet/streams` | game key | the kernel's samples (at most 64 KB and 32 frames a post, 90 posts a minute per server) |

The wire format (heartbeat fields `xh`, `xd`, `cv`) is in the backend README's
[Game-defined debug, streams and the live map](https://github.com/typetorch/backend#game-defined-debug-streams-and-the-live-map).
