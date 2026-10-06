# Player data

**Player data is game code** (decision 2026-10-05). TypeTorch doesn't save player data for you, and the kernel holds no
data sessions. You pick the library: ProfileStore, DataStore2, your own. This page is the pattern that keeps it safe
across hot swaps.

## Why data needs care

A deploy stops your code and starts a fresh copy in the same server, with the same players. A data library that ships
inside the payload would be stopped too: its open sessions, its autosave loop and its shutdown hook would end with the
old generation, and the new one would load every profile again while the old session locks are still held.

## The swap-safe pattern

1. **The library lives in the place, outside the payload** (for example `ServerStorage.Packages.ProfileStore`), and a
   tiny Script in the place requires it first. So the library, its open sessions and its background work survive
   every swap.
2. **Session handles live in `persist`**, keyed by `UserId`. The next generation re-attaches to them instead of loading
   again.
3. **Load on join, release on a real leave.** `onPlayerAdded` replays everyone after a swap, so it reuses a live
   session. Release only on `Players.PlayerRemoving`, never on a swap.
4. **`onSwapOut` flushes only what the new code needs** (for example values you keep outside `profile.Data`). The
   profiles stay open.

Why the host Script: Roblox ends the threads and connections that a script started when that script stops, and the
kernel stops a generation's script on every swap (that is how a swap cleans up). If a generation were the first to
require the library, the library's autosave loop and shutdown hook would belong to that generation and could stop at
the next deploy. Requiring it from a place Script first makes them belong to the place.

`persist` normally takes plain data only. Handles from a library in the place are the exception: they don't belong to
a generation. Never store your own functions in them, and connect to their signals through a trove.

## Example: ProfileStore

### In the place (Studio, once)

1. Put the ProfileStore ModuleScript at `ServerStorage.Packages.ProfileStore`.
2. Add a Script `ServerScriptService.DataHost`:

   ```lua
   -- Requires the data library once at server start, so its autosave loop and shutdown hook
   -- belong to this script, not to a generation (a swap stops a generation's scripts).
   local module = game:GetService("ServerStorage"):WaitForChild("Packages"):WaitForChild("ProfileStore")
   require(module)
   module:SetAttribute("Warm", true)
   ```

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
	OnAfterSave: { Wait(): Partial<T> };
}
interface Store<T> {
	StartSessionAsync(key: string, params?: { Cancel?: () => boolean }): Profile<T> | undefined;
}
interface ProfileStoreModule {
	// `this: void`: Luau calls it as ProfileStore.New(...), not ProfileStore:New(...).
	New<T>(this: void, name: string, template: T): Store<T>;
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
	return require(module) as ProfileStoreModule;
}

/** Lives in persist: the store and one open session per player for the whole server life. */
interface Sessions {
	store?: Store<PlayerData>;
	profiles: Map<number, Profile<PlayerData>>;
}

@Service({ loadOrder: -10 })
export class DataService extends Module implements OnInit, OnPlayerAdded {
	private sessions!: Sessions;

	onInit() {
		this.sessions = this.ctx.persist<Sessions>("data.sessions.v1", () => ({ profiles: new Map() }));
		if (!this.sessions.store) {
			// Dev branches never touch prod data.
			const name = TypeTorch.channel === "prod" ? "PlayerData" : "PlayerData_dev";
			this.sessions.store = profileStore()?.New(name, TEMPLATE);
		}
		// A real leave (never a swap): end the session. ProfileStore saves and releases it.
		this.trove.connect(Players.PlayerRemoving, (player) => this.release(player));
	}

	onPlayerAdded(player: Player, playerTrove: Trove) {
		const store = this.sessions.store;
		if (!store) return; // only in the cloud test, where nobody joins
		// Also runs for everyone already here after a swap: re-attach, don't load again.
		let profile = this.sessions.profiles.get(player.UserId);
		if (!profile || !profile.IsActive()) {
			profile = store.StartSessionAsync(`Player_${player.UserId}`, {
				Cancel: () => player.Parent !== Players,
			});
			if (!profile) {
				if (player.Parent === Players) player.Kick("Your data didn't load. Please rejoin.");
				return;
			}
			if (player.Parent !== Players) {
				profile.EndSession();
				return;
			}
			profile.AddUserId(player.UserId);
			profile.Reconcile();
			this.sessions.profiles.set(player.UserId, profile);
		}
		// This generation's code connected to the library goes in a trove, so a swap disconnects it.
		const connection = profile.OnSessionEnd.Connect(() => {
			this.sessions.profiles.delete(player.UserId);
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
		for (;;) {
			if (profile.LastSavedData.purchaseIds?.includes(receipt.PurchaseId) === true) return Enum.ProductPurchaseDecision.PurchaseGranted;
			if (!profile.IsActive()) return Enum.ProductPurchaseDecision.NotProcessedYet;
			profile.Save();
			profile.OnAfterSave.Wait();
		}
	}

	private release(player: Player) {
		const profile = this.sessions.profiles.get(player.UserId);
		if (!profile) return;
		this.sessions.profiles.delete(player.UserId);
		profile.EndSession();
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
  `import type` from them: a value import would put the library into the payload.
- A function the library calls with a dot (`ProfileStore.New`) needs `this: void` in its interface. Without it
  roblox-ts emits `ProfileStore:New(...)`, and ProfileStore fails with `Invalid or missing "store_name"`.

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

### Shutdown

- ProfileStore saves and releases its sessions on server close by itself, because it runs in the place.
- **Don't rely on `onStop` for saves.** A server that shuts down in the middle of a swap (the old build stopped, the
  new one not running yet) has no running generation, so no `onStop` runs. Keep the data in the library in the place,
  or write each change as it happens. `onStop` is fine for short extras.

## Rules that apply to any library

- **Split store names by channel** (`PlayerData` / `PlayerData_dev`): dev branches run in the same universe.
- **Don't wait on place scripts in the cloud test** (`workspace:GetAttribute("TypeTorchTest")`): they never run there.
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
5. Shut a server down (dev menu > Manage > Servers > Shut down; "Admin" on older frameworks) and rejoin: nothing lost.
6. Buy a developer product while a deploy runs (open the prompt, deploy, then buy). One grant. Rejoin another server:
   still one.
7. `bun run typetorch test --cloud` passes (on the `dev` git branch it tests the newest dev build; prod deploys run
   the same test).
8. Only then ship it to `prod`.
