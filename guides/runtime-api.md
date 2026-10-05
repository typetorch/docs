# Runtime API: `TypeTorch`

`import { TypeTorch } from "@typetorch/framework"` works on the server and the client. It describes the running
**generation** (one build running in one server or client) and raises events that belong to it. Every listener is
dropped when the generation stops, so a swap never leaves one behind. Each `on*` returns a disconnect function: give it
to a trove.

Inside a module, `this.ctx` has the basics too: `realm`, `artifact`, `branch`, `channel`, `generation`, `build` (the
compiled-in git info) and `persist`.

## Identity

```ts
TypeTorch.realm; // "server" | "client"
TypeTorch.running; // false in edit mode (UI Labs stories): identity has defaults there
TypeTorch.artifact; // { id, commit, commitHash, branch, channel, builtAt, seq, assetId }
TypeTorch.generation; // 1, 2, 3... per server (or client)
TypeTorch.branch;
TypeTorch.channel; // effective channel: "prod" on every public server
TypeTorch.serverType; // "public" | "private" | "reserved" | "studio"
TypeTorch.isPinned();
TypeTorch.kernelVersion;
TypeTorch.kernelApi;
TypeTorch.jobId;
TypeTorch.isStudio;
TypeTorch.features; // what the running kernel supports
```

## How this generation started

```ts
const start = TypeTorch.startInfo;
// { kind: "boot" | "swap", reason, previous?, branchChanged, startedAt, requestedBy?, loadSeconds?, stopSeconds?, swapSeconds? }
if (start.reason === "auto_rollback") warn("the last deploy failed to start");
```

Reasons: `boot`, `deploy`, `rollback`, `branch`, `pin`, `reload`, `server_rollback`, `auto_rollback`, `unknown`. A
client's first generation is always `boot`. `requestedBy`, `loadSeconds`, `stopSeconds` and `swapSeconds` are
server-only.

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
- `onUpdatePending` fires again with `cancelled: true` when the new build failed to load. On public servers it can fire
  twice for one deploy.

## State that survives swaps

```ts
const scores = TypeTorch.persist("scores.v1", () => new Map<number, number>());
```

The first call in a server (or client) runs `init`; every later call and every later generation gets the same table.
It lives in memory until the server shuts down. Plain data only: tables, arrays, Maps and Sets of strings, numbers,
booleans, and Players. Never functions, class instances, Promises, threads, connections, charm atoms or Instances the
generation created. Version the key when the shape changes; keys starting with `__` are reserved. (`this.ctx.persist`
is the same.)

## Devs and roles

```ts
if (TypeTorch.isAdmin(player)) this.showAdminPanel(player);
TypeTorch.isDev(player);
TypeTorch.role(player); // "owner" | "admin" | "dev" | undefined
TypeTorch.devInfo(player);
this.trove.add(TypeTorch.onPlayerDevChanged((player, info) => this.setAdminTools(player, info.dev)));
```

On the server the kernel decides (it may yield once per player for badge and group checks). On the client only the
local player is known, and only cosmetically: the server re-checks everything.

## Server-only reads

```ts
TypeTorch.status(); // uptime, players, memory, generation history, last deploy message, signing state: cheap
TypeTorch.branches(); // known branches and heads: cached, yields at most every 30 s
TypeTorch.artifacts(); // known deployments, newest first: cached, yields at most every 30 s
TypeTorch.requestReload(player); // owner and admins: reload this server to its branch head
```

Don't call `branches()` or `artifacts()` per player or per frame.

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
