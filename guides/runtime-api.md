# Runtime API: `TypeTorch`

`import { TypeTorch } from "@typetorch/framework"` works on the server and the client. It describes the running
**generation** (one build running in one server or client) and raises events that belong to it. Every listener is
dropped when the generation stops, so a swap never leaves one behind. Each `on*` returns a disconnect function: give it
to a trove.

Inside a module, `this.ctx` has the basics too: `realm`, `artifact`, `branch`, `channel`, `generation`, `build` (the
compiled-in git info), `kernel` (the raw generation API), `persist` and `playerState`. `this.ctx` is attached right
after the constructor: use it from `onInit` on, never in a field initializer (`private state = this.ctx.persist(...)`
fails).

## Modules: `TypeTorch.module` and `Dependency`

```ts
import { Dependency, TypeTorch } from "@typetorch/framework";

Dependency<ShopService>().open(player); // the running ShopService
TypeTorch.module<ShopService>().open(player); // the same
TypeTorch.tryModule<ShopService>()?.open(player); // undefined instead of an error
```

The running module of type T (a `@Service` on the server, a `@Controller` on the client), for code that isn't a
constructor: methods, plain classes a module built, command handlers. `@typetorch/transformer` fills in T's id; an
`import type` of the class is enough.

- From `onInit` on (and in `onStart`, `onStop` and later code). In a constructor, a field initializer or at the top level
  of a module it throws "ShopService isn't constructed yet: ...". `tryModule` returns `undefined` then.
- The other realm's modules throw ("ShopService is a @Service: it runs on the server, not on the client").
- Per generation: after a swap they return the new generation's module, and code left over from the old generation
  gets an error ("the generation that ran ShopService has stopped").
- To break a dependency cycle, take one side as `Lazy<T>` (a constructor parameter with `@typetorch/transformer`
  0.2.1+, or a field `= Lazy<T>()`); `.get()` resolves on first use, and the start order ignores it. See
  [Migrate](../getting-started/migrate.md#dependency-cycles-lazyt).

## Identity

```ts
TypeTorch.realm; // "server" | "client"
TypeTorch.running; // false in edit mode (UI Labs stories): identity has defaults there
TypeTorch.artifact; // { id, commit, commitHash, branch, channel, builtAt, seq, assetId }
TypeTorch.generation; // 1, 2, 3... per server (or client)
TypeTorch.branch;
TypeTorch.channel; // the rules: "prod" on every public server, and where the branch or the build is prod
TypeTorch.rules; // kernel 0.3.9: the same value by name
TypeTorch.branchChannel; // kernel 0.3.9: what the branch itself is ("prod" or "dev"), for display
TypeTorch.serverType; // "public" | "private" | "reserved" | "studio"
TypeTorch.isPinned();
TypeTorch.kernelVersion;
TypeTorch.kernelApi;
TypeTorch.jobId;
TypeTorch.isStudio;
TypeTorch.features; // what the running kernel supports
```

`channel` and `rules` are what the server enforces: a dev branch on a public server is `"dev"` in `branchChannel` and
`"prod"` in `channel`. Split data store names by `channel`. On kernels before 0.3.9 `branchChannel` equals `channel`.
See [Branches and channels](branches-and-channels.md).

`TypeTorch.features` has one boolean per kernel feature: `kernelStart`, `updatePending`, `devChanged`, `artifacts`,
`requestReload`, `messaging`, `settings`, `runDetached` and `liveDebug`. All are `false` outside a running kernel.

## How this generation started

```ts
const start = TypeTorch.startInfo;
// { kind: "boot" | "swap", reason, previous?, branchChanged, startedAt, requestedBy?, loadSeconds?, stopSeconds?, swapSeconds? }
if (start.reason === "auto_rollback") warn("the last deploy failed to start");
```

| Reason | The generation started because |
|---|---|
| `boot` | the server (or client) started; a client's first generation is always `boot` |
| `deploy` | a deploy, rollout or promote of this server's branch reached it (also when it caught up by polling) |
| `reload` | someone reloaded this server to its branch head, or ended its pin |
| `pin` | a pin: an A/B experiment, Load here, `/tt pin` |
| `rollback` | a branch rollback (`typetorch rollback`) |
| `server_rollback` | a rollback of this server only (`/tt rollback`, the dev menu) |
| `auto_rollback` | the last build failed on this server (load, `onStart` or the health window) and it went back |
| `branch` | the server switched branch; `branchChanged` is true |
| `unknown` | a kernel before 0.2.2, or a reason it doesn't name |

`branchChanged` is set whenever the branch moved, whatever the reason. `requestedBy`, `loadSeconds`, `stopSeconds` and
`swapSeconds` are server-only.

## Swap events

```ts
// Just before this generation stops, before any onStop. Synchronous: keep it short, don't yield.
this.trove.add(TypeTorch.onSwapOut((info) => this.saveRound(info.reason)));

// A deploy (or reload, branch switch, pin) is about to swap this server in about update.eta seconds.
this.trove.add(TypeTorch.onUpdatePending((update) => (hint.Visible = !update.cancelled)));

// Once, in a generation that started because the server's branch changed.
this.trove.add(TypeTorch.onBranchChanged(({ from, to }) => this.resetBranchData(from, to)));
```

- `onSwapOut` gets `{ reason, branch, next }` (the build that replaces this one). It doesn't run on server shutdown.
  It runs while every module still runs, before any `onStop` or trove cleanup: the place for last-resort work (save
  into `persist`, flush, tag Instances) that must happen even if a later cleanup throws.
- `onUpdatePending` fires again with `cancelled: true` when the new build failed to load. On public servers it can fire
  twice for one deploy.

### What to tell players

A swap is a hot swap: players stay in the same server, with their character and position. It is not a teleport and
not a server migration.

- `onUpdatePending` fires before **every** swap, plain hot swaps included. A "migrating server, please wait" message
  there is wrong. Show "updating in N s" (`update.eta`) or nothing, and hide it again on `cancelled`.
- Announce the result from the new generation: read `TypeTorch.startInfo` in `onStart`.

```ts
onStart() {
	const start = TypeTorch.startInfo;
	if (start.kind !== "swap") return;
	if (start.reason === "deploy") this.toast("Updated to the latest version");
	else if (start.reason === "auto_rollback") this.toast("An update didn't work; back on the previous version");
}
```

## State that survives swaps

```ts
const scores = TypeTorch.persist("scores.v1", () => new Map<number, number>());
```

The first call in a server (or client) runs `init`; every later call and every later generation gets the same table.
It lives in memory until the server shuts down. Plain data only: tables, arrays, Maps and Sets of strings, numbers,
booleans, and Players. Never functions, class instances, Promises, threads, connections, charm atoms or Instances the
generation created. Version the key when the shape changes; keys starting with `__` are reserved. (`this.ctx.persist`
is the same.)

### Per player

```ts
const cooldowns = TypeTorch.playerState("cooldowns.v1", (player) => ({ lastUse: 0 })); // or this.ctx.playerState
cooldowns.get(player).lastUse = os.clock(); // the first get stores init(player)
cooldowns.set(player, { lastUse: 0 });
cooldowns.has(player);
cooldowns.delete(player);
```

Keyed by UserId and kept in `persist`, so it survives swaps. A player's entry is removed when they really leave (after
the game's own `PlayerRemoving` handlers ran), never on a swap; players who left between two generations are dropped
when the next one opens its first store. Same plain-data rules as `persist`. The dev menu shows every store under
Modules > State > persist, `__playerState`.

## Devs and roles

```ts
if (TypeTorch.isOwner(player)) this.showOwnerPanel(player);
TypeTorch.isDev(player);
TypeTorch.role(player); // "owner" | "dev" | undefined
TypeTorch.devInfo(player);
this.trove.add(TypeTorch.onPlayerDevChanged((player, info) => this.setDevTools(player, info.dev)));
```

Two roles (framework 0.3.2, kernel 0.3.4): **owner** (the experience creator, the owning group's owner, `members` with
role `"owner"`) and **dev**. There are no admins: a `members` entry with the old role `"admin"`, or an older kernel's
`"admin"`, counts as a dev. `TypeTorch.isAdmin` still exists as a deprecated alias of `isOwner`.

On the server the kernel decides (it may yield once per player for badge and group checks). On the client only the
local player is known, and only cosmetically: the server re-checks everything.

## Server-only reads

```ts
TypeTorch.status(); // uptime, players, memory, generation history, last deploy message, signing state: cheap
TypeTorch.branches(); // known branches and heads: cached, yields at most every 30 s
TypeTorch.artifacts(); // known deployments, newest first: cached, yields at most every 30 s
TypeTorch.requestReload(player); // owners only: reload this server to its branch head
```

Don't call `branches()` or `artifacts()` per player or per frame. A build's `channel` in these lists is the build's
own (a promoted build keeps it). On kernel 0.5.4+ each branch also carries `branchChannel`, the branch's own channel.

## Cross-server (server only)

```ts
this.trove.add(TypeTorch.messaging.subscribe<Announcement>("announce", (data, meta) => this.show(data, meta.branch)));
TypeTorch.messaging.publish("announce", { text: "Double coins!" }); // queued and retried, at most 1 KiB
TypeTorch.messaging.status(); // the kernel's counters: rate on the topic, queued, dropped
const servers = TypeTorch.servers(); // the game's live servers (cached; yields up to ~3 s when it asks)
TypeTorch.setServerInfo({ mode: "ranked" }); // public fields of this server, in every server's list
```

Kernel 0.3.8+. See [Cross-server messages and the server list](messaging.md).

## Detached jobs (server only)

```ts
// A library call a deploy must not cut off halfway (a ProfileStore load, save or release).
const sessions = this.ctx.persist("data.sessions.v1", () => ({ profiles: new Map<number, Profile>() }));
TypeTorch.runDetached(() => {
	const profile = store.StartSessionAsync(`Player_${userId}`);
	if (profile) sessions.profiles.set(userId, profile); // in persist: the next build finds it after a swap
	return profile;
}).catch((err) => warn(`load failed: ${err}`));
```

- `fn` runs on a thread the kernel owns: this build's stop, and its hard stop, can't kill it. Kernel 0.3.8+
  (`TypeTorch.features.runDetached`); older kernels throw "needs kernel 0.3.8; use the DataHost job queue".
- The Promise settles while this build runs. After a swap the result is dropped, so a job whose result must survive
  writes it into `persist` itself.
- A job keeps this build's code and whatever its closures reference in memory until it ends. Keep jobs short; don't
  use `this` or a trove inside them.
- Errors reject the Promise and appear in the dev menu's Logs with the build that started the job; they never count
  toward the build's health window. At most 256 jobs run at once per server (then it throws); a job past 60 s is
  logged and flagged in Server > Status ("Detached jobs").

See [Player data: two ways to run the jobs](player-data.md#two-ways-to-run-the-jobs).

## Live settings (server only)

```ts
const price = TypeTorch.liveConfig("shop.price", { default: 50 }); // `typetorch settings set game.shop.price 75`
price.get();
this.trove.add(price.onChanged((value) => this.reprice(value)));
TypeTorch.settings(); // the whole verified settings record: holds tokens, never send it to a client
```

Kernel 0.3.8+. See [Settings](settings.md).

### Live events

```ts
const events = TypeTorch.liveEvents();
events.active(); // LiveEvent[] running now: { id, name, startsAt, endsAt, set }
events.upcoming(); // not started yet, in start order
this.trove.add(events.onChanged((active) => this.showBanner(active)));
```

Framework 0.7.1, server only. A live event is a scheduled change of `game` values: the signed record's
`game["tt.events"]` (`{ v: 1, events: [{ id, name, start, end, set }] }`, unix seconds, UTC), made on the explorer's
Live events page and signed with `typetorch settings set game.tt.events -`. While an event runs (`start <= now < end`
on this server's clock) its `set` values replace the record's values for `liveConfig`, so `get()` and `onChanged` switch
at the start and end times by themselves. No message is needed, and an event still ends when the backend is down. Two
events that set the same key at once: the later start wins. At most 64 events are read. `liveEvents()` is for game UI
("Double cash ends in 3h"); `liveConfig` already follows the schedule. See [Live events](live-events.md) and
[Reserved game keys](settings.md#reserved-game-keys).

## Live debug (server only)

```ts
import { fleet, remoteDebug, TypeTorch } from "@typetorch/framework";

// A button on the explorer's server page (op game.round_state). It must be read-only.
this.trove.add(remoteDebug.command("round_state", () => ({ kind: "kv", items: { round: this.round } }), { label: "Round" }));
// A stream sampled while someone watches the server page; "points" draw on the live map.
this.trove.add(
	remoteDebug.stream("loot", () => ({ points: this.chests.map((c) => ({ x: c.X, y: c.Y, z: c.Z })) }), { hz: 1, kind: "points" }),
);
// A custom column on the Fleet page, read on every heartbeat.
this.trove.add(fleet.column("current_map", () => this.mapName, { label: "Map", type: "string" }));
fleet.columnsChanged(); // a heartbeat soon (the kernel sends at most one per 10 s)
```

Framework 0.7.1 with kernel 0.5.7 (`TypeTorch.features.liveDebug`; `TypeTorch.remoteDebug` and `TypeTorch.fleet` are
the same objects).

- **Commands** run when an owner presses the button on `/servers/<JobId>`, through remote debug's checks: owners only,
  30 a minute, a 10 s deadline, args at most 2 KB of JSON, the answer at most 200 KB and scrubbed of secrets. The
  kernel can't check what a handler does: read-only is your promise, and the explorer labels them game-defined. An
  answer `{ kind: "table", columns, rows }` draws as a table, `{ kind: "kv", items }` as key-value pairs, anything
  else as JSON.
- **Streams** are sampled at `hz` (0.2 to 4) only while someone watches the server page; a sample is at most 16 KB of
  JSON. `kind: "points"` values (`{ points: [{ x, y, z, label?, color? }] }`) draw as markers on the live map.
- **Columns** ride every heartbeat: a string of at most 64 characters, a number, a boolean or nothing. They are stored
  with the server row: never put player names, UserIds or other personal data in a column.
- Getters and samplers run on kernel threads under pcall with a short deadline: keep them cheap and don't yield.
- Names match `^[a-z][a-z0-9_]{0,31}$`. At most 16 columns, 32 commands and 8 streams; labels at most 40 characters,
  descriptions 200. A bad name or option, a duplicate or one past a limit throws at once. Each call returns a remover
  for the trove. A client throws.
- On older kernels, and in edit mode, every call is accepted and checked, and nothing reaches the backend.

See [Live debug](live-debug.md) and
[Errors, debug bundles and remote debug](fleet-and-alerts.md#errors-debug-bundles-and-remote-debug).

## Notifications and feedback

- `TypeTorch.notifications()`: native Roblox experience notifications through the backend (server: `want`, `drop`,
  `setOff`, `onOpen`; client: `promptOptIn`). See [Notifications](notifications.md).
- `TypeTorch.feedback()` (server only, framework 0.7.0): `submit(player, { rating?, text?, topic?, ctx? })` checks and
  writes one `feedback` analytics row. See [Player feedback](feedback.md).

## Loading screens

Your own loading screen (a place script in `ReplicatedFirst`) waits for `ClientReady` on
`ReplicatedFirst.TypeTorchKernelClient` (kernel 0.3.8). See [Loading screens](loading-screen.md).

## Logs

```ts
TypeTorch.logs(0, 50); // the kernel's ring buffer (server 500 lines, client 300)
this.trove.add(TypeTorch.onLog((entry) => this.errors.push(entry))); // don't print from inside it
```

## Hot assets

```ts
const shop = TypeTorch.asset("ui/shop"); // the same as hotAsset("ui/shop")
```

See [Hot assets](hot-assets.md).

## Example: an update toast

```ts
@Controller()
export class UpdateToastController extends Module implements OnStart {
	onStart() {
		this.trove.add(
			TypeTorch.onUpdatePending((update) => {
				if (update.cancelled) this.hideToast();
				else this.showToast(`Updating ~${math.ceil(update.eta)}s`);
			}),
		);
		const start = TypeTorch.startInfo;
		if (start.kind === "swap") this.showToast(`Updated #${TypeTorch.artifact.seq ?? "?"}`);
	}

	private showToast(text: string) {
		/* ... */
	}

	private hideToast() {
		/* ... */
	}
}
```

The template's `UpdateToastController` and `DevOverlayController` are complete examples.
