# Hot assets

Builders edit models and UI templates in the real place and publish it as usual. New servers get them from the place.
**Running servers get the new versions live, with no restart.**

> **New (2026-10-05):** the CLI and the framework side are built and unit-tested. A full live run (a real upload, then
> a live swap) hasn't been done yet. Try it on a dev branch first.

| Hot | Not hot |
|---|---|
| models, props, effects, tools, UI templates (anything your code clones) | maps (a map change is a place publish and a restart), terrain, lighting and settings, scripts |

Hot assets contain **no scripts**: sync refuses them, and the runtime strips any it finds.

## 1. Mark them in the place

In Studio, give the instance an attribute `TypeTorchAsset` (string) with a short key:

- keys use `a-z 0-9 / - _`, at most 64 characters: `ui/shop`, `fx/coin-burst`, `tools/sword`;
- each key is used once;
- no hot asset inside another one, and never on a service itself;
- **where it sits decides who sees it:** under ServerStorage or ServerScriptService it is server-only; anywhere else
  (ReplicatedStorage, Workspace...) it replicates to clients.

Publish the place.

## 2. Sync

```sh
bun run typetorch assets status
bun run typetorch assets sync
git add typetorch.assets.lock.json
git commit -m "Hot assets"
bun run typetorch deploy
```

`assets sync`:

1. runs a Luau Execution task on the place's **latest published** version (`--place-version <n>` picks another) and
   exports every marked instance;
2. compares each export's hash with `typetorch.assets.lock.json`;
3. uploads a new key as a new group-owned Model, and a changed key as a **new version of the same asset id**, then
   waits for moderation (the place itself is never changed);
4. resolves each new version's id;
5. writes `typetorch.assets.lock.json` only when everything worked (commit it).

- `status` (or `sync --dry-run`) shows what changed without uploading. `list` prints the lockfile.
- Before any upload, every problem is listed at once: bad or duplicate keys, scripts (named), nesting, a marked service.
- `--deploy <branch>` deploys right after. For a prod-channel branch it is refused while the lockfile changes: sync,
  commit, then deploy (prod takes only clean builds).
- Every deploy stamps the lockfile into the build, so the asset list is part of the artifact (signed on prod), and a
  rollback brings back the older asset versions.
- Needs the assets key with `asset:read`, `asset:write` and Luau Execution
  (`universe.place.luau-execution-session:read` and `:write`).

## 3. Use them in code

```ts
import { hotAsset } from "@typetorch/framework"; // or TypeTorch.asset("ui/shop")

const shop = hotAsset("ui/shop");
shop.changed(rebuild, this.trove); // a new version went live
rebuild(shop.get());
```

`hotAsset(keyOrId, fallback?)` works on the server and the client and returns a handle:

| Member | What it does |
|---|---|
| `get()` | the live copy now; else `fallback` if it is still parented; else `undefined`. **Clone it; don't parent or edit it** (a new version destroys it) |
| `wait(timeout?)` | `get()`, waiting for a live copy |
| `changed(fn, trove?)` | calls `fn(instance)` when a new copy replaces the live one (a new version, a rollback, the first copy reaching a client); returns a disconnect. Pass the module's trove |
| `key`, `version` | the key, and the live copy's version |

- On every generation start, before any module loads, the server keeps, adopts (the place's own copy, when the place
  version matches the lockfile) or loads (`LoadAssetVersion`) each asset. It waits at most 8 s; slower loads finish in
  the background and fire `changed`.
- Clients never request anything: they watch the live copy's tag, and replicated assets arrive by replication.
- **Clones never count and never update by themselves.** A clone in PlayerGui, a Backpack or Workspace keeps working
  with the old version until your code replaces it.

### Updating tools players already hold

Tools in a Backpack or a character are clones. Replace them when a new version goes live:

```ts
import { Players } from "@rbxts/services";
import { hotAsset, Module, Service, type OnPlayerAdded, type OnStart } from "@typetorch/framework";

const KEY = "tools/sword";

@Service()
export class SwordService extends Module implements OnStart, OnPlayerAdded {
	private readonly sword = hotAsset(KEY);

	onStart() {
		this.sword.changed(() => {
			for (const player of Players.GetPlayers()) this.replaceHeld(player);
		}, this.trove);
	}

	onPlayerAdded(player: Player) {
		// Replays on every swap: give one only when the player has none.
		if (this.held(player).size() > 0) return;
		const template = this.sword.wait(10);
		const backpack = player.FindFirstChildOfClass("Backpack");
		if (template && backpack) template.Clone().Parent = backpack;
	}

	/** The copies the player holds, in the backpack or equipped. Clones keep the TypeTorchAsset attribute. */
	private held(player: Player): Instance[] {
		const copies: Instance[] = [];
		for (const container of [player.FindFirstChildOfClass("Backpack"), player.Character]) {
			if (!container) continue;
			for (const child of container.GetChildren()) {
				if (child.GetAttribute("TypeTorchAsset") === KEY) copies.push(child);
			}
		}
		return copies;
	}

	private replaceHeld(player: Player) {
		const template = this.sword.get();
		if (!template) return;
		for (const old of this.held(player)) {
			const fresh = template.Clone();
			fresh.Parent = old.Parent; // the character if it was equipped, else the backpack
			old.Destroy();
		}
	}
}
```

If a tool keeps state (ammo, durability), copy it from `old` to `fresh` before you destroy `old`.

### UI templates

```ts
const template = hotAsset("ui/shop");
let window: Frame | undefined;
const rebuild = () => {
	window?.Destroy();
	window = undefined;
	const source = template.get();
	const hud = Players.LocalPlayer.FindFirstChildOfClass("PlayerGui")?.FindFirstChild("Hud");
	if (!source || !hud) return;
	window = source.Clone() as Frame;
	window.Parent = hud;
};
this.trove.add(() => window?.Destroy());
template.changed(rebuild, this.trove);
rebuild();
```

## Migrating existing templates

Code that clones templates from the place today:

```ts
const sword = ReplicatedStorage.WaitForChild("Assets").WaitForChild("Sword") as Tool;
sword.Clone().Parent = backpack;
```

becomes:

```ts
const sword = hotAsset("tools/sword", ReplicatedStorage.WaitForChild("Assets").WaitForChild("Sword"));
const copy = sword.get()?.Clone();
if (copy) copy.Parent = backpack;
```

Then:

1. In Studio, add `TypeTorchAsset = "tools/sword"` to the template and publish the place.
2. `bun run typetorch assets sync`, commit the lockfile, deploy.
3. Code that keeps clones around (tools held, open UI) listens to `changed` and replaces them (above).

The `fallback` keeps the code working before the first sync and on a server where the asset failed to load.

## In the dev menu

**Modules > Assets**:

- Server: each key with its source (KEPT, BAKED, LOADED, FAILED, LOADING), version, load time and last error;
- Client: the live copies this client sees.

Failures also show on Server > Status > Attention: "Hot asset failed" (the old copy was kept), "Hot asset missing"
(nothing is live for the key), "Asset manifest" (the stamped list is unusable).
