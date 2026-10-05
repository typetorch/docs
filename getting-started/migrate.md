# Migrate an existing roblox-ts game

This guide moves a roblox-ts game to TypeTorch: the method, the rules every module must follow, and before/after code
for each pattern. An AI agent can do most of it for you with the [agent playbook](../agents/AGENTS.md); this page is
what it follows.

**TypeTorch is roblox-ts only.** A game written in plain Luau has to move to roblox-ts first.

## What changes

| | Before | After |
|---|---|---|
| Where code lives | Scripts and ModuleScripts in the place, published with the place | a **payload** (ModuleScripts only) uploaded per build; the place holds only the **kernel** |
| How updates ship | publish the place, restart or migrate servers | `typetorch deploy`: live servers swap in seconds, players stay |
| Entry points | `*.server.ts`, `*.client.ts` | `src/server/boot.ts`, `src/client/boot.ts`, called by the kernel |
| Services | Flamework, Knit or singleton modules | `@Service()` / `@Controller()` classes that extend `Module` |
| Lifetime | the whole server | one **generation**: started, stopped and replaced on every deploy |
| Remotes | RemoteEvents/RemoteFunctions you create | `createNetwork` over the kernel's two stable remotes, with generated guards |
| State | module variables | the module instance, or `persist` when it must survive a swap |

The big idea: **every module must be stoppable and restartable.** A deploy stops the running code and starts a fresh
copy in the same server. Whatever a module made or connected must go away with it, and whatever must survive goes in
`persist`.

## Before you start

- Read [Fresh setup](fresh-setup.md) steps 1 and 2: tools and the sibling checkouts (`../framework`, `../kernel`,
  `../transformer`, `../cli`, and `../template` as the reference). When in doubt, copy what the template does.
- Work on a branch: `git switch -c typetorch-migration`. Commit after every step that builds.
- Keep a list of what you change and what's left (`MIGRATION_NOTES.md`).
- Don't change DataStore names or the shape of saved data during the migration.

## 1. Take inventory

Find these in your code (`git grep` works in PowerShell and bash):

```sh
git grep -nE "PlayerAdded|PlayerRemoving|CharacterAdded" -- src
git grep -nE "RemoteEvent|RemoteFunction|OnServerEvent|OnClientEvent|InvokeServer|@rbxts/net|@flamework/networking" -- src
git grep -nE "CollectionService|GetInstanceAddedSignal|@flamework/components" -- src
git grep -nE "while \(true\)|task\.(spawn|delay|defer)|\bspawn\(|\bdelay\(|Heartbeat|RenderStepped" -- src
git grep -nE "_G\b|\bshared\." -- src
git grep -nE "DataStoreService|ProfileStore|ProfileService|MemoryStoreService|BindToClose" -- src
git grep -nE "@rbxts/react|@rbxts/roact|@rbxts/vide|PlayerGui|StarterGui|ScreenGui" -- src
```

Also list every `*.server.ts` / `*.client.ts`, the folders in `default.project.json`, and what the place contains that
isn't code (maps, StarterGui layouts, models, tools, scripts inside models).

## 2. Add the toolchain

Do these in order; the [agent playbook](../agents/AGENTS.md#step-3-add-the-typetorch-toolchain) has the exact file
contents for each.

1. **Bun** as the package manager (delete other lockfiles after `bun install`).
2. **`rokit.toml`**: `rojo = "rojo-rbx/rojo@7.7.0-rc.1"` and `lune = "lune-org/lune@0.10.5"`, then `rokit install`.
3. **`package.json`**: the template's dependencies (`@typetorch/framework` and `@typetorch/kernel`, and the dev
   dependency `@typetorch/transformer`, all as local tarballs; `@rbxts/t`, `@rbxts/trove`, `rbxts-transform-debug`
   2.2.0, roblox-ts 3, TypeScript 5.5.3), its scripts (`build`, `watch`, `studio`, `packages`, `postinstall`), and
   `"typetorch": "bun ../cli/src/index.ts"`. Copy `scripts/packages.ts` and `scripts/build-info.ts` from the template.
   Then `bun scripts/packages.ts` and `bun install`.
4. **`tsconfig.json`**: `include` only `src`; `"typeRoots": ["node_modules/@rbxts", "node_modules/@typetorch"]`;
   `"types": ["types", "compiler-types"]`; `plugins`: `rbxts-transform-debug` first, then
   `{ "transform": "@typetorch/transformer" }`.
5. **`default.project.json`** becomes the **payload**: a Rojo `Model` with `Server`, `Shared`, `Client` and `include`
   (copy the template's; it maps `@rbxts` and only `@typetorch/framework`). Keep your old project as
   `legacy.project.json` until the migration is done.
6. **`studio.project.json`** from the template, for [testing in Studio](../guides/studio-testing.md).
7. **`.gitignore`**: `out/`, `include/`, `.typetorch/`, `src/shared/build.ts`, `.payload.gen.project.json`,
   `.tsconfig.typetorch.json`, `.env`, `.env.*`.
8. **`typetorch.json`**: see [fresh setup step 5](fresh-setup.md#5-typetorchjson).

**From npm instead** (no sibling checkouts, no `scripts/packages.ts`): `bun add @typetorch/framework
@typetorch/kernel` and `bun add -d @typetorch/transformer @typetorch/cli`, then the script
`"typetorch": "typetorch"`. See [fresh setup, From npm](fresh-setup.md#from-npm).

**Check:** `bun run build` compiles. A Flamework game doesn't yet: every `@flamework/core` import fails with "You can
only use npm scopes that are listed in your typeRoots". That's expected; section 4 fixes it.

### Coming from Flamework

TypeTorch doesn't use Flamework any more: its own `@typetorch/transformer` generates the guards and dependency ids, and
`Modding`, `Reflect` and `t` come from `@typetorch/framework`. For a Flamework game the migration is mostly a swap:

- `@Service`, `@Controller`, constructor injection, `OnInit`/`OnStart`/`OnTick`/`OnPhysics`/`OnRender` keep their names:
  change the imports to `@typetorch/framework`, and add `extends Module` and `super()` (section 4).
- `Modding`, `Reflect`, `t` from `@flamework/core` → the same from `@typetorch/framework`. Custom decorators use
  `@metadata typetorch:parameters injectable`.
- `Flamework.addPaths` / `ignite` → the boot modules (section 3). `@flamework/networking` → `createNetwork`
  (section 6). `@flamework/components` → observers (rule 4). `Dependency<T>()` → constructor injection.
- Remove `@flamework/*` and `rbxts-transformer-flamework` from `package.json`, `node_modules/@flamework` from
  `typeRoots` and the Rojo projects; delete `flamework.build`, `flamework.json` and `include/flamework`.
- Type ids changed format (`@typetorch/framework:decorators@Service`): anything saved under Flamework ids
  (`Flamework.id<T>()`) won't match.
- Then the swap-safety rules (section 5). That part is the real work.

## 3. Entry points become boot modules

The payload holds **only ModuleScripts**: a Script or LocalScript fails `typetorch build`. The kernel calls two
modules instead.

Before:

```ts
// src/server/main.server.ts
import { Flamework } from "@flamework/core";
Flamework.addPaths("src/server/services");
Flamework.ignite();
```

After:

```ts
// src/server/boot.ts
import { startServer, type ServerKernel } from "@typetorch/framework";
import { BUILD } from "../shared/build";

export function boot(kernel: ServerKernel) {
	return startServer(kernel, { modules: [script.Parent!.FindFirstChild("services")!], build: BUILD });
}
```

```ts
// src/client/boot.ts
import { startClient, type ClientKernel } from "@typetorch/framework";
import { BUILD } from "../shared/build";

export function boot(kernel: ClientKernel) {
	return startClient(kernel, { modules: [script.Parent!.FindFirstChild("controllers")!], build: BUILD });
}
```

- `modules` lists folders. Every ModuleScript under them is required, so their top-level code must have no side
  effects (helpers are fine).
- `src/shared/build.ts` is generated before every compile (git identity of the build). Don't edit or commit it.
- Delete the old `*.server.ts` / `*.client.ts` once their work moved into modules.

## 4. Services and controllers become modules

| Old | TypeTorch |
|---|---|
| Flamework `@Service()` / `@Controller()` | `@Service()` / `@Controller()` from `@typetorch/framework`, class `extends Module` |
| Flamework `OnInit`, `OnStart`, `OnTick`, `OnPhysics`, `OnRender` | the same names from `@typetorch/framework` |
| Flamework `Dependency<T>()`, constructor injection | constructor injection (call `super()`) |
| Flamework `@Component` | a module using `observeElement` or `@rbxts/observers` (rule 4) |
| Knit `CreateService({ Name, Client, KnitInit, KnitStart })` | `@Service()` class; `KnitInit` → `onInit`, `KnitStart` → `onStart`, `Client` → network leaves |
| Knit `Knit.GetService("X")` | constructor injection |
| singleton module with top-level state | a `@Service()` / `@Controller()` class |
| shutdown cleanup | `onStop` and the module trove |

Lifecycle:

- `onInit`: in dependency order, one at a time; may yield briefly (the generation has about 20 s to become ready).
- `onStart`: spawned per module after every `onInit`; runs inside the module's trove.
- `onStop`: reverse order, before the trove is cleaned. The kernel gives a stopping generation 5 s.
- `onTick` (Heartbeat), `onPhysics` (PreSimulation), `onRender` (client RenderStepped): connected through the trove.
- `onPlayerAdded(player, playerTrove)`: every player, including the ones already in the server when the generation
  starts.

### Flamework

Before:

```ts
import { OnStart, Service } from "@flamework/core";
import { ScoreService } from "./score";

@Service()
export class CoinService implements OnStart {
	constructor(private readonly score: ScoreService) {}

	onStart() {
		// ...
	}
}
```

After:

```ts
import { Module, Service, type OnStart } from "@typetorch/framework";
import { ScoreService } from "./score.service";

@Service()
export class CoinService extends Module implements OnStart {
	constructor(private readonly score: ScoreService) {
		super();
	}

	onStart() {
		// ...
	}
}
```

Don't do work in the constructor: `this.trove` and `this.ctx` are attached right after it.

### Knit

Before (typical shape):

```ts
import { KnitServer as Knit } from "@rbxts/knit";

const PointsService = Knit.CreateService({
	Name: "PointsService",
	Client: {
		GetPoints(player: Player) {
			return PointsService.getPoints(player);
		},
	},
	points: new Map<Player, number>(),
	getPoints(player: Player) {
		return this.points.get(player) ?? 0;
	},
	KnitStart() {
		// ...
	},
});
```

After:

```ts
import { Module, Service, type OnInit, type OnStart } from "@typetorch/framework";
import { network } from "../../shared/net";

@Service()
export class PointsService extends Module implements OnInit, OnStart {
	private points = new Map<number, number>();

	onInit() {
		this.points = this.ctx.persist("points.v1", () => new Map<number, number>());
		this.trove.add(network.server.points.get.handle((player) => [this.getPoints(player)]));
	}

	onStart() {
		// was KnitStart
	}

	getPoints(player: Player) {
		return this.points.get(player.UserId) ?? 0;
	}
}
```

with `points: { get(): ProperReturns<number> }` in `ClientToServer` (see [Networking](#6-networking)).

### Plain singleton modules

Before:

```ts
// src/server/shop.ts
const prices = new Map([["sword", 100]]);
const owned = new Map<Player, string[]>();
Players.PlayerAdded.Connect((player) => owned.set(player, []));
export function buy(player: Player, item: string) {
	/* ... */
}
```

After:

```ts
// src/server/services/shop.service.ts
const PRICES = new Map([["sword", 100]]); // constants may stay at the top level

@Service()
export class ShopService extends Module implements OnInit, OnPlayerAdded {
	private owned = new Map<number, string[]>();

	onInit() {
		this.owned = this.ctx.persist("shop.owned.v1", () => new Map<number, string[]>());
	}

	onPlayerAdded(player: Player) {
		if (!this.owned.has(player.UserId)) this.owned.set(player.UserId, []);
	}

	buy(player: Player, item: string) {
		/* ... */
	}
}
```

Other modules get it by constructor injection: `constructor(private readonly shop: ShopService) { super(); }`.

## 5. The swap-safety rules

Every rule has the same reason: the code is stopped and started again in the same server, many times.

### Rule 1: everything goes in the module's trove

Before:

```ts
RunService.Heartbeat.Connect((dt) => this.tick(dt));
const folder = new Instance("Folder");
folder.Parent = Workspace;
```

After:

```ts
this.trove.connect(RunService.Heartbeat, (dt) => this.tick(dt)); // or implement OnTick
const folder = this.trove.add(new Instance("Folder"));
folder.Parent = Workspace;
```

Connections, Instances you create, threads, and the disconnect functions TypeTorch returns
(`this.trove.add(network.server.x.y.on(...))`, `this.trove.add(TypeTorch.onSwapOut(...))`) all go in the trove.

### Rule 2: no module-level state; persist only plain data

Every generation requires fresh copies of every module, so module-level variables start over on each swap, and
module-level code runs outside any trove.

Before:

```ts
const cooldowns = new Map<Player, number>(); // lost on every deploy
```

After, when it may start over on a deploy:

```ts
private cooldowns = new Map<Player, number>(); // on the instance
```

After, when it must survive a deploy:

```ts
private cooldowns = new Map<number, number>();

onInit() {
	this.cooldowns = this.ctx.persist("cooldowns.v1", () => new Map<number, number>());
}
```

`persist` keeps the same table for the server's whole life. Store plain data: tables, arrays, Maps and Sets of
strings, numbers, booleans and Players. Never store functions, class instances, Promises, threads, connections, charm
atoms or Instances the generation created: they keep the old code alive or get destroyed by its trove. Change the key
(`"cooldowns.v2"`) when the shape changes. (Handles from a library that lives outside the payload are the one
exception; see [Player data](../guides/player-data.md).)

### Rule 3: players through `onPlayerAdded` or `observePlayers`

Before:

```ts
Players.PlayerAdded.Connect((player) => this.setup(player));
```

After:

```ts
onPlayerAdded(player: Player, playerTrove: Trove) {
	this.setup(player, playerTrove); // playerTrove is cleaned when the player leaves or the generation stops
}
```

or, anywhere: `observePlayers(this.trove, (player, playerTrove) => ...)`.

- `Players.PlayerAdded` doesn't fire again for players already in the server, so a new generation would miss them.
  These replay them.
- **Join handlers must be idempotent**, because they run again for everyone on every deploy. Guard one-time effects
  (join rewards, welcome popups, analytics "joined" events) with a persisted set:

  ```ts
  onPlayerAdded(player: Player) {
  	if (this.welcomed.has(player.UserId)) return; // this.welcomed = this.ctx.persist("welcomed.v1", () => new Set<number>())
  	this.welcomed.add(player.UserId);
  	this.giveJoinReward(player);
  }
  ```

- For work on a real leave only (not on a swap), connect `Players.PlayerRemoving` through the trove:
  `this.trove.connect(Players.PlayerRemoving, (player) => ...)`.

### Rule 4: tags and characters through observers

Before:

```ts
CollectionService.GetInstanceAddedSignal("Lava").Connect((part) => setupLava(part));
player.CharacterAdded.Connect((character) => setupCharacter(character));
```

After, with the framework's `observeElement` (tag + `isRealFrame` + one trove per instance; it skips copies under
ReplicatedStorage and StarterGui):

```ts
observeElement<BasePart>(this.trove, "Lava", (part, partTrove) => {
	partTrove.connect(part.Touched, (hit) => this.burn(hit));
});
```

After, with [`@rbxts/observers`](https://www.npmjs.com/package/@rbxts/observers) (each observer returns a stop function
for the trove):

```ts
import Observers from "@rbxts/observers";

this.trove.add(
	Observers.observeCharacter((player, character) => {
		const humanoid = character.WaitForChild("Humanoid") as Humanoid;
		humanoid.WalkSpeed = 20;
		return () => print(`${player.Name}'s character is gone`);
	}),
);
```

Characters without extra packages:

```ts
onPlayerAdded(player: Player, playerTrove: Trove) {
	let characterTrove: Trove | undefined;
	const onCharacter = (character: Model) => {
		if (characterTrove) playerTrove.remove(characterTrove);
		const trove = playerTrove.extend();
		characterTrove = trove;
		const humanoid = character.WaitForChild("Humanoid") as Humanoid;
		trove.connect(humanoid.Died, () => print(`${player.Name} died`));
	};
	if (player.Character) task.spawn(onCharacter, player.Character);
	playerTrove.connect(player.CharacterAdded, onCharacter);
}
```

### Rule 5: no global connections or loops outside troves

Before:

```ts
task.spawn(() => {
	while (true) {
		task.wait(30);
		this.announce();
	}
});
```

After: a loop directly in `onStart` is fine (it runs inside the module's trove):

```ts
onStart() {
	while (true) {
		task.wait(30);
		this.announce();
	}
}
```

Anywhere else: `this.trove.add(task.spawn(() => { ... }))`.

### Rule 6: no `_G` or `shared`

Before:

```ts
_G.coinsCollected += 1;
```

After: share through constructor injection (call a method on the other module), or keep the value in `persist`:

```ts
private stats = { collected: 0 };

onInit() {
	this.stats = this.ctx.persist("coins.stats.v1", () => ({ collected: 0 }));
}
```

### Rule 7: `task.spawn`, `task.delay`, `task.defer` only through troves

Before:

```ts
task.delay(5, () => this.respawnCoin(id));
```

After:

```ts
this.trove.add(task.delay(5, () => this.respawnCoin(id)));
```

Replace the deprecated `spawn`, `delay` and `wait` with `task.*` while you are there.

### Rule 8: shutdown

`game.BindToClose` can't be unbound, so bind it at most once per server (guard it with a persisted flag) and keep it
short. A kernel `onClose` hook for generations is **planned**. `TypeTorch.onSwapOut` runs before a swap, never on
shutdown.

## 6. Networking

Replace every RemoteEvent and RemoteFunction with one typed network. The kernel owns the only two remotes; a generation
must never create remotes.

Before:

```ts
// server
const remote = new Instance("RemoteEvent");
remote.Name = "CollectCoin";
remote.Parent = ReplicatedStorage;
remote.OnServerEvent.Connect((player, coinId) => {
	if (!typeIs(coinId, "string")) return;
	const total = this.score.add(player, 1);
	remote.FireClient(player, total);
});

// client
const remote = ReplicatedStorage.WaitForChild("CollectCoin") as RemoteEvent;
remote.FireServer("coin-1");
remote.OnClientEvent.Connect((total: number) => print(total));
```

After:

```ts
// src/shared/net.ts
import { createNetwork, type ProperReturns } from "@typetorch/framework";

interface ClientToServer {
	coins: {
		collect(coinId: string): void;
		balance(): ProperReturns<number>;
	};
}
interface ServerToClient {
	coins: { changed(total: number): void };
}

export const network = createNetwork<ClientToServer, ServerToClient>();
```

```ts
// server: in onStart
this.trove.add(
	network.server.coins.collect.on((player, coinId) => {
		const total = this.score.add(player, 1);
		network.server.coins.changed.fire(player, total);
	}),
);
this.trove.add(network.server.coins.balance.handle((player) => [this.score.get(player)]));
```

```ts
// client: in onStart
network.client.coins.collect.fire("coin-1");
this.trove.add(network.client.coins.changed.on((total) => print(total)));
this.trove.addPromise(
	network.client.coins.balance.invoke().then(([value]) => {
		if (typeIs(value, "number")) print(value);
	}),
);
```

- The guards (`coinId` is a string) are generated from the types; the server also applies rate and shape limits and
  kicks clients that flood it. Keep your own game checks (distance, ownership, cooldowns).
- RemoteFunctions become request leaves: `handle` on the server returns `[value]` or `[false, "reason"]`, `invoke` on
  the client returns a Promise (15 s timeout).
- `@rbxts/net`, `@flamework/networking`, Zap, Blink and ByteNet don't work inside a payload: convert them.
- Remove RemoteEvents defined in the Rojo project or the place.
- More: [Networking](../guides/networking.md).

## 7. UI

TypeTorch's UI workflow is observers + trove + charm atoms + `isRealFrame`. Two kinds of UI:

- **Built in code:** create it in a controller and put the ScreenGui in the trove, so a swap removes it and the new
  code builds it again.
- **Built in Studio:** layouts stay in the place (StarterGui), or become [hot assets](../guides/hot-assets.md).
  Tag what code touches (`Element:<Area>.<Name>`) and drive it with `observeElement`; `isRealFrame` skips the StarterGui
  templates. The payload can't carry ScreenGuis.

Before:

```ts
const button = Players.LocalPlayer.WaitForChild("PlayerGui").WaitForChild("Hud").WaitForChild("ShopButton") as TextButton;
button.Activated.Connect(() => (shopOpen = !shopOpen));
```

After:

```ts
import { atom, subscribe } from "@rbxts/charm";

private readonly ui = atom<{ open?: "shop" }>({});

onStart() {
	// The open panel survives swaps as plain data; the atom itself is per generation.
	const saved = this.ctx.persist("ui.v1", () => ({ open: undefined as "shop" | undefined }));
	this.ui({ open: saved.open });
	this.trove.add(subscribe(this.ui, (state) => (saved.open = state.open)));

	observeElement<GuiButton>(this.trove, "Element:HUD.ShopButton", (button, buttonTrove) => {
		buttonTrove.connect(button.Activated, () => this.ui({ open: this.ui().open === "shop" ? undefined : "shop" }));
	});
}
```

- Pop in and out with `popIn` / `popOut` / `bump` (a UIScale; never tween `Size`). One `PopupQueue` for modals.
- React, Roact or Vide: mount the root in a controller and unmount it through the trove
  (`this.trove.add(() => root.unmount())`).

## 8. Player data

Saving is game code; you pick the library. On TypeTorch the library must outlive the generations, so it lives in the
place, its session handles live in `persist`, sessions load on join and are released on a real leave. Read
[Player data](../guides/player-data.md) before you migrate any data code, and test it on a dev branch first.

Don't change store names, keys or the data format in the same step.

## 9. Install the kernel in your place

The place keeps your Studio content and gains the kernel. Today `typetorch kernel deploy --replace-place` publishes the
**whole** place from the kernel's place file, so it would **wipe** your maps and Studio UI. Patching only the kernel
is **planned**. Until then, install the kernel in Studio:

1. Do [fresh setup](fresh-setup.md) steps 4, 6 and 7 (settings, API key, signing keys).
2. Build the kernel place with your trust roots stamped (it publishes nothing):

   ```sh
   bun run typetorch kernel deploy --dry-run
   ```

   It writes `.typetorch/place.rbxl` and prints the `keys` line (your key asset id and fallback key).
3. Open `.typetorch/place.rbxl` in Studio. Copy these three folders into your place, at the same spots:
   `ServerScriptService.TypeTorchKernel` (it carries the `KeyAssetId`, `FallbackPublicKey` and `BootstrapHeads`
   attributes), `ReplicatedStorage.TypeTorchKernelShared` and `ReplicatedFirst.TypeTorchKernelClient`.
4. In your place, select ServerScriptService and turn on **LoadStringEnabled** if you will use remote-claude.
5. Remove the old game scripts that the payload replaces (keep the ones listed below).
6. **File > Publish to Roblox**, then move players to the new version (restart servers from Creator Hub, or use the
   dev menu's **Migrate** on servers that still run the old kernel).
7. Do the same copy again for every later kernel update.

**Check:** the F9 server log shows `[TypeTorch] kernel 0.3.1@... on a public server, branch prod, signed deploys only
(keys: key asset)`.

### What stays in the place

- the kernel (the three folders above);
- maps, terrain, lighting and settings;
- StarterGui layouts and other Studio content (or [hot assets](../guides/hot-assets.md) for models and UI templates);
- StarterPlayer and StarterCharacter scripts (Animate, custom cameras);
- third-party Luau systems that can't be roblox-ts modules (admin panels, analytics SDKs);
- the player data library and its small host script ([Player data](../guides/player-data.md)).

These change only with a place publish and a server restart. Prefer moving behavior out of scripts inside models into a
service that uses tags.

### Assets and builders

- Hard-coded asset ids keep working when the assets belong to (or are shared with) the experience owner.
- **Hot assets (built):** builders mark models and UI templates in the place with the `TypeTorchAsset` attribute,
  `typetorch assets sync` uploads them, and running servers pick up new versions with no restart. Code that clones
  templates switches to `hotAsset(key, template)`. See [Hot assets](../guides/hot-assets.md#migrating-existing-templates).
- **Builder workflows** (both decided, both later): (a) a separate Build experience whose content ships as
  pinned content packs, or (b) Team Create in the prod place with kernel deploys that patch only the kernel. Content
  packs and patch deploys are **planned**. Today builders work in the place and publish from Studio; maps need a
  place publish and a restart (Admin > Servers > Migrate moves players to the new version).
- The typed asset map from files (Asphalt) is **planned**.

## 10. Verify, then ship

1. Local checks:

   ```sh
   bun run build
   bun run typetorch build
   ```

   `typetorch build` refuses a payload with anything but Folders and ModuleScripts, and names the offending path.
2. [Test in Studio](../guides/studio-testing.md): `bun run watch`, `bun run studio`, Play. Use the dev menu's Reload to
   test a swap while you play.
3. Deploy a dev branch (`git switch -c dev`, `bun run typetorch deploy`), open it with `/tt new dev`, play, deploy
   again while playing. Test player data across two deploys.
4. Deploy `prod` from `main` ([fresh setup step 9](fresh-setup.md#9-first-deploy)).

## Checklist

- [ ] roblox-ts project on Bun; `rokit.toml` pins Rojo 7.7.0-rc.1 and Lune
- [ ] `package.json`, `tsconfig.json`, `default.project.json` (payload), `studio.project.json`, `.gitignore` match the
      template
- [ ] `typetorch.json` with your ids, `approval`, and (after `keys init`) the signing fields
- [ ] no `*.server.ts` / `*.client.ts` left; `src/server/boot.ts` and `src/client/boot.ts`
- [ ] every service/controller is a `@Service()` / `@Controller()` class extending `Module`
- [ ] no game code imports `@flamework/*`; no `@flamework/*` or `rbxts-transformer-flamework` in `package.json`
- [ ] connections, instances, threads in troves; loops only in `onStart` or the trove
- [ ] no module-level state; what must survive is in `persist` as plain data
- [ ] players via `onPlayerAdded` / `observePlayers`; join handlers idempotent
- [ ] tags and characters via observers
- [ ] no `_G` / `shared`
- [ ] no RemoteEvent/RemoteFunction anywhere; one `createNetwork`
- [ ] UI: code-built in troves, Studio-built tagged and observed
- [ ] player data follows [the pattern](../guides/player-data.md); store names split by channel
- [ ] kernel installed in the place; old game scripts removed
- [ ] `bun run build` and `bun run typetorch build` pass; a committed tree builds a clean id (no `-dirty`)
- [ ] a dev branch survived two deploys while you played

## Common pitfalls

| Pitfall | What happens | Fix |
|---|---|---|
| A `*.server.ts` left in `src/server` | `typetorch build`: "the payload may hold only Folders and ModuleScripts" | move its work into a module, delete it |
| `scripts/*.ts` compiled by rbxtsc | `Cannot find name 'console'` in `scripts/packages.ts` | `"include": ["./src/**/*.ts"]` in tsconfig |
| Join reward in `onPlayerAdded` | everyone gets it again on every deploy | guard with a persisted set (rule 3) |
| `Players.PlayerRemoving` logic in a `playerTrove` cleanup | it also runs on every swap | connect `PlayerRemoving` through the trove for real leaves |
| A charm atom or a class instance in `persist` | the old generation's code stays alive | persist the plain value |
| Remotes created in `onStart` | duplicates on every swap; clients hold stale ones | `createNetwork` |
| `Players.LocalPlayer.PlayerGui.Hud` grabbed once | the reference breaks when the GUI resets | `observeElement` with a tag |
| Helper modules with side effects in `services/` | they run when `startServer` requires the folder | keep top-level code side-effect free |
| A Flamework import left (`@flamework/core` `OnStart`) | "You can only use npm scopes that are listed in your typeRoots" | import from `@typetorch/framework` |
| `npx rbxtsc` in a Bun project on Windows | runs an unrelated placeholder package | `bun run build` or `bunx rbxtsc` |
| Dev branch writes prod data | real players' data changes from a test server | split store names by `TypeTorch.channel` |
| `kernel deploy --replace-place` on a real place | maps and Studio UI vanish from the live version | install the kernel in Studio (section 9) |
| Template-literal types in a network leaf | the guard can't be generated: compile error | use `string` and check it in the handler |
