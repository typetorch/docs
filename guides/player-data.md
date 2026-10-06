# Player data

**Player data is game code** (decision 2026-10-05). TypeTorch doesn't save player data for you, and the kernel holds no
data sessions. You pick the library: ProfileStore, ProfileService, DataStore2, your own. This page is the pattern that
keeps it safe across hot swaps, with a full example for [ProfileStore](#example-profilestore) and one for
[ProfileService](#example-profileservice).

## Why data needs care

A deploy stops your code and starts a fresh copy in the same server, with the same players. A data library that ships
inside the payload would be stopped too: its open sessions, its autosave loop and its shutdown hook would end with the
old generation, and the new one would load every profile again while the old session locks are still held.

## The swap-safe pattern

1. **The library lives in the place, outside the payload** (for example `ServerStorage.Packages.ProfileStore`), and a
   small Script in the place, `DataHost`, requires it first. So the library, its open sessions and its background work
   survive every swap.
2. **Session handles live in `persist`**, keyed by `UserId`. The next generation re-attaches to them instead of loading
   again.
3. **Load on join, release on a real leave.** `onPlayerAdded` replays everyone after a swap, so it reuses a live
   session. Release only on `Players.PlayerRemoving`, never on a swap.
4. **Library calls that write run in `DataHost`:** starting or loading a session, `Save()`, ending or releasing it. Your
   code hands them to DataHost as jobs, and a job puts its result into `persist` itself.
5. **`onSwapOut` flushes only what the new code needs** (for example values you keep outside `profile.Data`). The
   profiles stay open.

Why the host Script: Roblox ends the threads and connections that a script started when that script stops, and the
kernel stops a generation's script on every swap (that is how a swap cleans up). If a generation were the first to
require the library, the library's autosave loop and shutdown hook would belong to that generation and could stop at
the next deploy. Requiring it from a place Script first makes them belong to the place.

Why the jobs: the same rule ends a library call that is still running when a deploy lands. A load waits on the
DataStore, and `Save()`, `EndSession()` and `Release()` start their save on the calling thread's script. Cut off
halfway, both ProfileStore and ProfileService keep that call's bookkeeping for the key forever (checked under Lune
against both libraries' real code):

- a load cut off: every later load of that player on this server waits forever;
- a release cut off: the last save is lost, the session lock stays, and the player can't load on this server again;
- a `Save()` cut off: with ProfileStore, every later save of that profile waits forever, so the rest of the session is
  lost; ProfileService does the same when the save was waiting out its 7 s write cooldown.

A job runs on DataHost's thread, which no deploy stops. A job may finish after the generation that queued it has
stopped, so it uses only the library, `persist` tables and Roblox APIs (never a module's trove or `this`).

`persist` normally takes plain data only. Handles from a library in the place are the exception: they don't belong to
a generation. Never store your own functions in them, and connect to their signals through a trove.

## The DataHost script

One Script in the place, the same for every library (change the module's name). It requires the library and runs the
jobs your code queues:

```lua
-- ServerScriptService.DataHost
-- Requires the data library once at server start, so its autosave loop and shutdown hook belong to this script,
-- not to a generation (a swap stops a generation's scripts). It also runs the library calls the payload queues
-- (load, save, release) on this script's threads, so a deploy can't cut one off halfway.
local module = game:GetService("ServerStorage"):WaitForChild("Packages"):WaitForChild("ProfileStore")
local library = require(module)
local jobs = {}
library.TypeTorchJobs = jobs
game:GetService("RunService").Heartbeat:Connect(function()
	while #jobs > 0 do
		task.spawn(table.remove(jobs, 1))
	end
end)
module:SetAttribute("Warm", true)
```

A job starts on the next frame. The payload finds the queue as `TypeTorchJobs` on the same library table (a module is
required once per server, so DataHost and every generation share it).

## Example: ProfileStore

### In the place (Studio, once)

1. Put the ProfileStore ModuleScript at `ServerStorage.Packages.ProfileStore`.
2. Add the Script `ServerScriptService.DataHost` from [The DataHost script](#the-datahost-script).
3. Publish the place. (Changing the library later is a place publish and a restart, like the kernel.)

### In the payload

```ts
// src/server/services/data.service.ts
import { Players, ServerStorage, Workspace } from "@rbxts/services";
import type { Trove } from "@rbxts/trove";
import { Module, Service, TypeTorch, type OnInit, type OnPlayerAdded } from "@typetorch/framework";

/** What you save per player: plain data. */
export interface PlayerData {
	coins: number;
	inventory: string[];
	/** The newest developer product PurchaseIds granted (see "Developer products"). */
	purchaseIds: string[];
}
const TEMPLATE: PlayerData = { coins: 0, inventory: [], purchaseIds: [] };

// The part of ProfileStore's API this service uses. The library itself lives in the place, not in the payload.
interface Profile<T> {
	Data: T;
	/** A copy of Data as of the last successful save (an older save may lack newer fields). */
	LastSavedData: Partial<T>;
	IsActive(): boolean;
	AddUserId(userId: number): void;
	Reconcile(): void;
	Save(): void;
	EndSession(): void;
	OnSessionEnd: { Connect(callback: () => void): { Disconnect(): void } };
}
interface Store<T> {
	StartSessionAsync(key: string, params?: { Cancel?: () => boolean }): Profile<T> | undefined;
}
interface ProfileStoreModule {
	// `this: void`: Luau calls it as ProfileStore.New(...), not ProfileStore:New(...).
	New<T>(this: void, name: string, template: T): Store<T>;
	/** Added by the place's DataHost script: it runs these on its own threads. */
	TypeTorchJobs?: Array<() => void>;
}

/**
 * The place's copy of ProfileStore, once the place's DataHost script has required it. Errors (so the deploy rolls
 * back with a clear message) when the place doesn't have it. Undefined in the cloud test.
 */
function profileStore(): ProfileStoreModule | undefined {
	const module = ServerStorage.FindFirstChild("Packages")?.FindFirstChild("ProfileStore");
	if (!module || !module.IsA("ModuleScript")) error("ServerStorage.Packages.ProfileStore is missing (see the Player data guide)");
	// The cloud test (`typetorch test --cloud`, before every prod deploy) runs this code in a headless task. Place
	// scripts (DataHost) never run there and no player joins, so stop here. The check above still runs.
	if (Workspace.GetAttribute("TypeTorchTest") === true) return undefined;
	const deadline = os.clock() + 10;
	while (module.GetAttribute("Warm") !== true) {
		if (os.clock() > deadline) error("ServerScriptService.DataHost didn't require ProfileStore (see the Player data guide)");
		task.wait(0.1);
	}
	const library = require(module) as ProfileStoreModule;
	if (!library.TypeTorchJobs) error("ServerScriptService.DataHost has no job queue: update it (see the Player data guide)");
	return library;
}

/** Lives in persist: the library, the store and one open session per player for the whole server life. */
interface Sessions {
	library?: ProfileStoreModule;
	store?: Store<PlayerData>;
	profiles: Map<number, Profile<PlayerData>>;
	/** Players whose session is starting (a DataHost job). */
	starting: Set<number>;
}

@Service({ loadOrder: -10 })
export class DataService extends Module implements OnInit, OnPlayerAdded {
	private sessions!: Sessions;

	onInit() {
		this.sessions = this.ctx.persist<Sessions>("data.sessions.v1", () => ({ profiles: new Map(), starting: new Set() }));
		this.sessions.starting ??= new Set(); // sessions kept by an older build of this service (same key: they're open)
		this.sessions.library ??= profileStore();
		if (!this.sessions.store) {
			// Dev branches never touch prod data.
			const name = TypeTorch.channel === "prod" ? "PlayerData" : "PlayerData_dev";
			this.sessions.store = this.sessions.library?.New(name, TEMPLATE);
		}
		// A real leave (never a swap): end the session. ProfileStore saves and releases it.
		this.trove.connect(Players.PlayerRemoving, (player) => this.release(player));
	}

	onPlayerAdded(player: Player, playerTrove: Trove) {
		const sessions = this.sessions;
		const store = sessions.store;
		if (!store) return; // only in the cloud test, where nobody joins
		const userId = player.UserId;
		// Also runs for everyone already here after a swap: re-attach, or wait for the start that is still running.
		if (!sessions.profiles.get(userId)?.IsActive() && !sessions.starting.has(userId)) {
			sessions.starting.add(userId);
			this.onHost(() => {
				try {
					const profile = store.StartSessionAsync(`Player_${userId}`, { Cancel: () => player.Parent !== Players });
					if (!profile) return;
					if (player.Parent !== Players) {
						profile.EndSession();
						return;
					}
					profile.AddUserId(userId);
					profile.Reconcile();
					sessions.profiles.set(userId, profile);
				} finally {
					sessions.starting.delete(userId);
				}
			});
		}
		while (sessions.starting.has(userId)) task.wait(0.1); // a swap ends this wait, not the start
		const profile = sessions.profiles.get(userId);
		if (!profile || !profile.IsActive()) {
			if (player.Parent === Players) player.Kick("Your data didn't load. Please rejoin.");
			return;
		}
		// This generation's code connected to the library goes in a trove, so a swap disconnects it.
		const connection = profile.OnSessionEnd.Connect(() => {
			sessions.profiles.delete(userId);
			if (player.Parent === Players) player.Kick("Your data was opened on another server. Please rejoin.");
		});
		playerTrove.add(() => connection.Disconnect());
	}

	/** The player's data (the same table in every generation), or undefined while it loads. */
	get(player: Player): PlayerData | undefined {
		return this.sessions.profiles.get(player.UserId)?.Data;
	}

	/**
	 * Grants a developer product once. The PurchaseId goes into the profile together with the grant, and the answer is
	 * PurchaseGranted only once a save holds it. A receipt Roblox sends again (after a swap, a crash, or on another
	 * server) finds the id and grants nothing.
	 */
	grantOnce(receipt: ReceiptInfo, grant: (data: PlayerData) => void): Enum.ProductPurchaseDecision {
		const profile = this.sessions.profiles.get(receipt.PlayerId);
		// Not in this server, or still loading: Roblox sends the receipt again later.
		if (!profile || !profile.IsActive()) return Enum.ProductPurchaseDecision.NotProcessedYet;
		const ids = profile.Data.purchaseIds;
		if (!ids.includes(receipt.PurchaseId)) {
			grant(profile.Data); // first: if it throws, nothing is recorded
			ids.push(receipt.PurchaseId);
			if (ids.size() > 100) ids.shift();
		}
		// Answer only once a save holds the id. Cut off before that (a swap, a leave, a crash): Roblox sends the
		// receipt again, and the id was saved together with the grant, or lost together with it.
		let nextSave = 0;
		for (;;) {
			if (profile.LastSavedData.purchaseIds?.includes(receipt.PurchaseId) === true) return Enum.ProductPurchaseDecision.PurchaseGranted;
			if (!profile.IsActive()) return Enum.ProductPurchaseDecision.NotProcessedYet;
			if (os.clock() >= nextSave) {
				nextSave = os.clock() + 10;
				this.onHost(() => profile.Save()); // sooner than the autosave
			}
			task.wait(0.5);
		}
	}

	private release(player: Player) {
		const profile = this.sessions.profiles.get(player.UserId);
		if (!profile) return; // still starting: that job sees the player left and ends the session
		this.sessions.profiles.delete(player.UserId);
		this.onHost(() => profile.EndSession());
	}

	/** Runs a library call that writes (start, save, end) on DataHost's thread: a deploy can't cut it off. */
	private onHost(job: () => void) {
		this.sessions.library?.TypeTorchJobs?.push(job);
	}
}
```

Other services read and change `dataService.get(player)` directly; it's the same `profile.Data` table in every
generation, so a change made just before a swap is not lost.

- `loadOrder: -10` starts it before modules that read data in their own `onPlayerAdded`. They should still handle
  `undefined` (the profile may still be loading).
- **Put the library and `DataHost` in the place before you deploy this code.** Without them `onInit` fails with a
  clear error, the new build doesn't start, and the server rolls back to the previous one.
- The interfaces above describe only what this service calls. If your project has typings for the library, use
  `import type` from them: a value import would require a second copy of the library inside the payload.
- A function the library calls with a dot (`ProfileStore.New`) needs `this: void` in its interface. Without it
  roblox-ts emits `ProfileStore:New(...)`, and ProfileStore fails with `Invalid or missing "store_name"`.
- **Changing what you keep in `persist`:** keep the key while sessions are open under it (a new key would load every
  profile again). Fill new fields in when they're missing, like `starting` and `library` above.

### The cloud test

Every prod deploy first boots your build in a headless Luau Execution task, the
[cloud test](deploy-and-rollback.md#the-cloud-test). Place scripts never run there, so `DataHost` never warms the
library, and no player joins. That is why `profileStore()` returns `undefined` when
`workspace:GetAttribute("TypeTorchTest")` is true. Without that line, `onInit` waits 10 s and fails, and every prod
deploy is refused. The check before it still runs: a place published without the library still fails the test.

The rest of your code runs there too, against your real DataStores:
[Migrate: the cloud test runs your game code](../getting-started/migrate.md#the-cloud-test-runs-your-game-code).

### Developer products

Roblox calls `ProcessReceipt` until it gets `PurchaseGranted`, on whatever server the player is in. **Record the
PurchaseId in the player's profile, together with the grant, and return `PurchaseGranted` only after a save holds
it.** That is `grantOnce` above. `persist` is not enough: it is this server's memory, so a receipt sent again to
another server after the player left would be granted twice.

```ts
// src/server/services/receipt.service.ts
import { MarketplaceService } from "@rbxts/services";
import { Module, Service, type OnInit } from "@typetorch/framework";
import { DataService, type PlayerData } from "./data.service";

/** Developer product id -> what it gives. */
const PRODUCTS = new Map<number, (data: PlayerData) => void>([
	[1234567, (data) => (data.coins += 100)],
]);

@Service()
export class ReceiptService extends Module implements OnInit {
	constructor(private readonly data: DataService) {
		super();
	}

	onInit() {
		MarketplaceService.ProcessReceipt = (receipt) => {
			const grant = PRODUCTS.get(receipt.ProductId);
			if (!grant) return Enum.ProductPurchaseDecision.NotProcessedYet;
			return this.data.grantOnce(receipt, grant);
		};
		// The callback belongs to this generation. A receipt that arrives between two generations is sent again.
		this.trove.add(() => {
			(MarketplaceService as unknown as { ProcessReceipt?: unknown }).ProcessReceipt = undefined;
		});
	}
}
```

- The grant and the id change the same `profile.Data` table without yielding, so they are saved together.
- A swap while it waits for the save ends the wait without an answer. Roblox sends the receipt again, and the next
  generation finds the id in `Data` and only waits for the save.
- It keeps the newest 100 ids. `Reconcile` adds the empty list to profiles saved before you added the field.
- The save it asks for is a DataHost job, again every 10 s while it waits.

### Shutdown

- ProfileStore saves and releases its sessions on server close by itself, because it runs in the place.
- **Don't rely on `onStop` for saves.** A server that shuts down in the middle of a swap (the old build stopped, the
  new one not running yet) has no running generation, so no `onStop` runs. Keep the data in the library in the place,
  or write each change as it happens. `onStop` is fine for short extras.

## Example: ProfileService

ProfileService is ProfileStore's older sibling (same author), and many games still use it. The pattern is the same;
the API differs: `GetProfileStore`, `LoadProfileAsync(key, "ForceLoad")`, `Release()`, `ListenToRelease`, and no
`LastSavedData` (receipts use `MetaData.MetaTagsLatest` instead, below).

### In the place (Studio, once)

1. Put the ProfileService ModuleScript at `ServerStorage.Packages.ProfileService`.
2. Add `ServerScriptService.DataHost` from [The DataHost script](#the-datahost-script), with `ProfileService` in place of
   `ProfileStore` on the `WaitForChild` line.
3. Publish the place.

### In the payload

```ts
// src/server/services/data.service.ts
import { Players, ServerStorage, Workspace } from "@rbxts/services";
import type { Trove } from "@rbxts/trove";
import { Module, Service, TypeTorch, type OnInit, type OnPlayerAdded } from "@typetorch/framework";

/** What you save per player: plain data. */
export interface PlayerData {
	coins: number;
	inventory: string[];
}
const TEMPLATE: PlayerData = { coins: 0, inventory: [] };

/** Saved together with Data on every save. MetaTagsLatest is what the last save wrote (see "Developer products"). */
interface Tags {
	purchaseIds?: string[];
}

// The part of ProfileService's API this service uses. The library itself lives in the place, not in the payload.
interface Profile<T> {
	Data: T;
	MetaData: { MetaTags: Tags; MetaTagsLatest: Tags };
	IsActive(): boolean;
	AddUserId(userId: number): void;
	Reconcile(): void;
	Save(): void;
	Release(): void;
	ListenToRelease(listener: () => void): { Disconnect(): void };
}
interface Store<T> {
	LoadProfileAsync(key: string, notReleasedHandler: "ForceLoad" | "Steal"): Profile<T> | undefined;
}
interface ProfileServiceModule {
	// `this: void`: Luau calls it as ProfileService.GetProfileStore(...).
	GetProfileStore<T>(this: void, name: string, template: T): Store<T>;
	/** Added by the place's DataHost script: it runs these on its own threads. */
	TypeTorchJobs?: Array<() => void>;
}

/** The place's copy of ProfileService, once DataHost required it. Errors when the place lacks it; undefined in the cloud test. */
function profileService(): ProfileServiceModule | undefined {
	const module = ServerStorage.FindFirstChild("Packages")?.FindFirstChild("ProfileService");
	if (!module || !module.IsA("ModuleScript")) error("ServerStorage.Packages.ProfileService is missing (see the Player data guide)");
	if (Workspace.GetAttribute("TypeTorchTest") === true) return undefined; // the cloud test: DataHost never runs there
	const deadline = os.clock() + 10;
	while (module.GetAttribute("Warm") !== true) {
		if (os.clock() > deadline) error("ServerScriptService.DataHost didn't require ProfileService (see the Player data guide)");
		task.wait(0.1);
	}
	const library = require(module) as ProfileServiceModule;
	if (!library.TypeTorchJobs) error("ServerScriptService.DataHost has no job queue: update it (see the Player data guide)");
	return library;
}

/** Lives in persist: the library, the store and one loaded profile per player for the whole server life. */
interface Sessions {
	library?: ProfileServiceModule;
	store?: Store<PlayerData>;
	profiles: Map<number, Profile<PlayerData>>;
	/** Players whose profile is loading (a DataHost job). */
	loading: Set<number>;
}

@Service({ loadOrder: -10 })
export class DataService extends Module implements OnInit, OnPlayerAdded {
	private sessions!: Sessions;

	onInit() {
		this.sessions = this.ctx.persist<Sessions>("data.sessions.v1", () => ({ profiles: new Map(), loading: new Set() }));
		this.sessions.library ??= profileService();
		if (!this.sessions.store) {
			// Your live store name on prod, another one on dev branches.
			const name = TypeTorch.channel === "prod" ? "PlayerData" : "PlayerData_dev";
			this.sessions.store = this.sessions.library?.GetProfileStore(name, TEMPLATE);
		}
		// A real leave (never a swap): release the profile. ProfileService saves it and frees the session lock.
		this.trove.connect(Players.PlayerRemoving, (player) => this.release(player));
	}

	onPlayerAdded(player: Player, playerTrove: Trove) {
		const sessions = this.sessions;
		const store = sessions.store;
		if (!store) return; // only in the cloud test, where nobody joins
		const userId = player.UserId;
		// Also runs for everyone already here after a swap: re-attach, or wait for the load that is still running.
		if (!sessions.profiles.get(userId)?.IsActive() && !sessions.loading.has(userId)) {
			sessions.loading.add(userId);
			this.onHost(() => {
				try {
					const profile = store.LoadProfileAsync(`Player_${userId}`, "ForceLoad");
					if (!profile) return;
					if (player.Parent !== Players) {
						profile.Release();
						return;
					}
					profile.AddUserId(userId);
					profile.Reconcile();
					sessions.profiles.set(userId, profile);
				} finally {
					sessions.loading.delete(userId);
				}
			});
		}
		while (sessions.loading.has(userId)) task.wait(0.1); // a swap ends this wait, not the load
		const profile = sessions.profiles.get(userId);
		if (!profile || !profile.IsActive()) {
			if (player.Parent === Players) player.Kick("Your data didn't load. Please rejoin.");
			return;
		}
		// Released by another server (ForceLoad there): through the player trove, so a swap disconnects it.
		const connection = profile.ListenToRelease(() => {
			sessions.profiles.delete(userId);
			if (player.Parent === Players) player.Kick("Your data was opened on another server. Please rejoin.");
		});
		playerTrove.add(() => connection.Disconnect());
	}

	/** The player's data (the same table in every generation), or undefined while it loads. */
	get(player: Player): PlayerData | undefined {
		return this.sessions.profiles.get(player.UserId)?.Data;
	}

	/**
	 * Grants a developer product once. The PurchaseId goes into the profile's MetaTags together with the grant (the same
	 * save writes both), and the answer is PurchaseGranted only once MetaTagsLatest, the copy the last save wrote, holds
	 * it. A receipt Roblox sends again (after a swap, a crash, or on another server) finds the id.
	 */
	grantOnce(receipt: ReceiptInfo, grant: (data: PlayerData) => void): Enum.ProductPurchaseDecision {
		const profile = this.sessions.profiles.get(receipt.PlayerId);
		// Not in this server, or still loading: Roblox sends the receipt again later.
		if (!profile || !profile.IsActive()) return Enum.ProductPurchaseDecision.NotProcessedYet;
		const tags = profile.MetaData.MetaTags;
		const ids = tags.purchaseIds ?? [];
		tags.purchaseIds = ids;
		if (!ids.includes(receipt.PurchaseId)) {
			grant(profile.Data); // first: if it throws, nothing is recorded
			ids.push(receipt.PurchaseId);
			if (ids.size() > 100) ids.shift();
		}
		let nextSave = 0;
		for (;;) {
			if (profile.MetaData.MetaTagsLatest.purchaseIds?.includes(receipt.PurchaseId) === true) {
				return Enum.ProductPurchaseDecision.PurchaseGranted;
			}
			// Released before a save held it: the id was saved with the grant, or lost with it. Roblox sends it again.
			if (!profile.IsActive()) return Enum.ProductPurchaseDecision.NotProcessedYet;
			if (os.clock() >= nextSave) {
				nextSave = os.clock() + 10;
				this.onHost(() => profile.Save()); // sooner than the 30 s autosave
			}
			task.wait(0.5);
		}
	}

	private release(player: Player) {
		const profile = this.sessions.profiles.get(player.UserId);
		if (!profile) return; // still loading: that job sees the player left and releases it
		this.sessions.profiles.delete(player.UserId);
		this.onHost(() => profile.Release());
	}

	/** Runs a library call that writes (load, save, release) on DataHost's thread: a deploy can't cut it off. */
	private onHost(job: () => void) {
		this.sessions.library?.TypeTorchJobs?.push(job);
	}
}
```

The [ProfileStore notes](#in-the-payload) apply here too (`loadOrder`, `import type`, `this: void`, the cloud test).
`profileService()` is the same getter as `profileStore()` with the other name: the module path, the `Warm` wait and
the `TypeTorchTest` line.

### Developer products with ProfileService

The `ReceiptService` above works unchanged with this `DataService`. Its `grantOnce` is ProfileService's own documented
pattern for developer products:

- **The PurchaseId goes into `profile.MetaData.MetaTags`**, in the same step as the grant. ProfileService writes
  `Data` and `MetaTags` in one `UpdateAsync`, so a save holds both or neither.
- **`PurchaseGranted` only once `MetaData.MetaTagsLatest` holds the id.** That is the copy of `MetaTags` the last
  successful save wrote (ProfileService's stand-in for ProfileStore's `LastSavedData`). Until then it asks for a save
  (a DataHost job) and waits; the 30 s autosave answers it too.
- **A receipt sent again** finds the id in `MetaTags`: after a swap, the next generation only waits for the save; on
  another server, the loaded profile's `MetaTagsLatest` already has it, so the answer is immediate and nothing is
  granted twice.

**Recommended over a separate receipts DataStore.** Recording the PurchaseId in its own DataStore with `UpdateAsync`
and granting into the profile (what the template's `ShopService` does for its coin pack) makes two separate writes. If
the server crashes after the record but before the profile's next save, the purchase is lost (the record says it was
granted); record after the grant instead and a crash in between grants it twice. A receipts DataStore is right only
for grants that don't live in a profile (the template's coins are server-session values; a donation board is global).

Older copies of ProfileService (before `Profile:Save()` existed) work without the `Save()` job: the autosave answers
within 30 s.

### Coming from `@rbxts/profileservice`

- **Keep your store name and profile key exactly as the live game has them** (what you pass to `GetProfileStore` and
  `LoadProfileAsync`): a new name or key format starts every player from scratch. Pick a dev name only for non-prod
  channels: `TypeTorch.channel === "prod" ? "<live name>" : "<live name>_dev"`. A name chosen by
  `RunService.IsStudio()` doesn't tell a dev branch from prod.
- `ProfileService.GetProfileStore(...)` at module top level moves into `onInit`, kept in `persist` (a second store
  object for the same name would load profiles this server already has).
- `Players.PlayerAdded.Connect` becomes `onPlayerAdded`; `Players.PlayerRemoving` releases through a DataHost job.
- Delete `game.BindToClose` loops that release every profile: ProfileService releases them on close by itself (it runs
  in DataHost), and a generation's `BindToClose` may not run at all.
- Other writes on leave (ordered DataStores for leaderboards, analytics) can stay in your code: a cut-off write is just
  lost, it can't block the library.
- Keep the typings package for types only: `import type { Profile } from "@rbxts/profileservice/globals"` works, but the
  local interfaces above also know `TypeTorchJobs`. Never a value import (`import ProfileService from ...`): it would
  require the payload's own copy of the library.
- `GlobalUpdates`, `ListenToHopReady` and `ViewProfileAsync` work as before on the handle; run calls that write
  (`GlobalUpdateProfileAsync`, `WipeProfileAsync`) as DataHost jobs too.

## Rules that apply to any library

- **Split store names by channel** (`PlayerData` / `PlayerData_dev`): dev branches run in the same universe.
- **Don't wait on place scripts in the cloud test** (`workspace:GetAttribute("TypeTorchTest")`): they never run there.
- **Run the library's writes in the place's thread** (DataHost jobs): sessions, saves, releases. A call cut off by a
  deploy can block the library for that player on this server.
- **Don't rename stores or reshape saved data in a hot deploy** without a migration. Write migrations as code that
  upgrades `Data` in place, keyed by a version field you store in it, and keep old fields readable: a rollback runs the
  older code against data the newer code may already have touched.
- **Keep DataStore budgets in mind:** a swap must not trigger a reload of every player.
- **Receipts are recorded where the data is saved**, before `PurchaseGranted`, never only in `persist`.
- **Small data without sessions** works inside the payload too: read once per join, write with `UpdateAsync` when it
  changes, and keep unfinished writes in `persist` so the next generation retries them. The template's `BestService`
  (personal bests) does exactly this. Its `ShopService` records coin pack receipts in a DataStore before it grants
  them.

## Test it on a dev branch first

1. Deploy to `dev` and open it with `/tt new dev`.
2. Change some data (earn coins).
3. Deploy again twice while you play. Your data must still be there and keep changing.
4. Leave, join a new `dev` server: the data loaded.
5. Deploy while a friend joins, and again while one leaves: both load normally afterwards (on that server too).
6. Shut a server down (dev menu > Manage > Servers > Shut down; "Admin" on older frameworks) and rejoin: nothing lost.
7. Buy a developer product while a deploy runs (open the prompt, deploy, then buy). One grant. Rejoin another server:
   still one.
8. `bun run typetorch test --cloud` passes (on the `dev` git branch it tests the newest dev build; prod deploys run
   the same test).
9. Only then ship it to `prod`.
