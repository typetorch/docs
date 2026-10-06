# State with charm

[charm](https://github.com/littensy/charm) atoms are the state behind TypeTorch's UI workflow, and charm-sync sends the
server's atoms to clients. Both work as usual on TypeTorch. This page is the few lines that are TypeTorch's.

**Atoms are per generation.** A swap requires your modules again, so every atom is created again with its default
value, on the server and on every client. Three things keep state across swaps:

1. **The server's atoms start from `persist`** and write every change back.
2. **charm-sync goes over `createNetwork`**: one leaf with an `unknown` payload. No RemoteEvents.
3. **Each client asks for a full state in its controller's `onStart`**, so it hydrates after every join and after its
   own swap. Until the answer arrives, its atoms keep the values it had before the swap (from its own `persist`).

Written for charm 0.10 and charm-sync 0.3, the pair most roblox-ts games use. With other versions, or another sync
library, the TypeTorch lines are the same.

## The atoms

```ts
// src/shared/state/synced.ts
import { atom, subscribe, type Atom } from "@rbxts/charm";
import type { Trove } from "@rbxts/trove";
import { TypeTorch } from "@typetorch/framework";

export interface RoundState {
	phase: "lobby" | "round";
	endsAt: number;
}
export const roundAtom = atom<RoundState>({ phase: "lobby", endsAt: 0 });
/** UserId (as a string: string keys survive remotes) -> score. */
export const scoresAtom = atom<Record<string, number>>({});

/** Every atom the server syncs to clients: one list, used by both realms. */
export const SYNCED = { round: roundAtom, scores: scoresAtom };

/**
 * Atoms are created again in every generation (this module is new after a swap). Starts them from the last
 * generation's values and writes every change back, through `persist` (plain values, never the atoms).
 */
export function persistAtoms(trove: Trove, key: string) {
	const saved = TypeTorch.persist(key, () => ({}) as Record<string, unknown>);
	const atoms = SYNCED as unknown as Record<string, Atom<unknown>>;
	for (const [name, value] of pairs(saved)) atoms[name]?.(value);
	for (const [name, synced] of pairs(atoms)) trove.add(subscribe(synced, (value) => (saved[name] = value)));
}
```

The subscriptions go in the module's trove, so the old generation stops writing when it stops.

## The network

```ts
// src/shared/net.ts
import { createNetwork, setNetworkLimits } from "@typetorch/framework";

interface ClientToServer {
	state: {
		/** "Send me everything": after every join and every swap. */
		hydrate(): void;
	};
}
interface ServerToClient {
	state: {
		/** charm-sync payloads (init or patch), passed through as they are. */
		sync(payloads: unknown): void;
		/** This player's own state (a syncer per player, below). */
		mine(payloads: unknown): void;
	};
}
export const network = createNetwork<ClientToServer, ServerToClient>();
// A client asks once per generation: a small bucket is plenty.
setNetworkLimits({ "state.hydrate": { rate: [3, 0.2] } });
```

`unknown` is right here: the server sends these, and clients trust the server. The only client -> server message is the
argument-free `hydrate`, which the server checks and rate-limits like any leaf.

## Server

```ts
// src/server/services/state.service.ts
import CharmSync from "@rbxts/charm-sync";
import { Module, Service, type OnInit } from "@typetorch/framework";
import { network } from "../../shared/net";
import { persistAtoms, SYNCED } from "../../shared/state/synced";

@Service({ loadOrder: -20 }) // before the modules that read or write the atoms
export class StateService extends Module implements OnInit {
	onInit() {
		// 1. The new generation's atoms start with the old generation's values.
		persistAtoms(this.trove, "state.synced.v1");
		// 2. charm-sync over the game's network: patches to every player, a full state to a player who asks.
		const syncer = CharmSync.server({ atoms: SYNCED, interval: 0.2 });
		this.trove.add(syncer.connect((player, ...payloads) => network.server.state.sync.fire(player, payloads)));
		this.trove.add(network.server.state.hydrate.on((player) => syncer.hydrate(player)));
	}
}
```

- `persistAtoms` runs before `CharmSync.server`, so the syncer starts from the restored values.
- `syncer.connect` returns its cleanup (the patch timer and subscriptions): in the trove, it ends with the generation.
- The server doesn't push a full state by itself: a swap restarts every client too, and each one asks.

## Client

```ts
// src/client/controllers/state.controller.ts
import CharmSync from "@rbxts/charm-sync";
import { Controller, Module, type OnInit, type OnStart } from "@typetorch/framework";
import { network } from "../../shared/net";
import { persistAtoms, SYNCED } from "../../shared/state/synced";

@Controller({ loadOrder: -20 }) // before the UI controllers that draw from the atoms
export class StateController extends Module implements OnInit, OnStart {
	onInit() {
		// The values this client had before its own swap: the UI keeps them (no flash of defaults) until the hydrate.
		persistAtoms(this.trove, "state.synced.v1");
		const syncer = CharmSync.client({ atoms: SYNCED });
		this.trove.add(
			network.client.state.sync.on((payloads) => syncer.sync(...(payloads as CharmSync.SyncPayload<typeof SYNCED>[]))),
		);
	}

	onStart() {
		// A full state after every join and every swap (charm-sync ignores patches until it has one).
		network.client.state.hydrate.fire();
	}
}
```

- The listener is registered in `onInit`, the request goes out in `onStart`: the answer can't arrive before anyone
  listens.
- A client's `persist` is its own memory (the server never sees it). It lasts until the player leaves.

## Per player

charm-sync sends every player the same patches. **Don't filter a patch per player** (dropping keys from it): the client
applies it to what it has, and a filtered patch no longer matches. Give each player a syncer of their own over a
selector of their part instead:

```ts
// src/server/services/quest.service.ts
import { atom } from "@rbxts/charm";
import CharmSync from "@rbxts/charm-sync";
import type { Trove } from "@rbxts/trove";
import { Module, Service, type OnPlayerAdded } from "@typetorch/framework";
import { network } from "../../shared/net";

/** Server-only: every player's quests, by UserId as a string. */
const questsAtom = atom<Record<string, { done: number }>>({});

@Service()
export class QuestService extends Module implements OnPlayerAdded {
	onPlayerAdded(player: Player, playerTrove: Trove) {
		// One syncer per player, over a selector of that player's part: nobody else's data reaches them.
		const key = tostring(player.UserId);
		const syncer = CharmSync.server({ atoms: { quests: () => questsAtom()[key] }, interval: 0.2 });
		playerTrove.add(
			syncer.connect((target, ...payloads) => {
				if (target === player) network.server.state.mine.fire(player, payloads);
			}),
		);
		playerTrove.add(network.server.state.hydrate.on((from) => from === player && syncer.hydrate(player)));
	}
}
```

On the client, a second `CharmSync.client({ atoms: { quests: myQuestsAtom } })` listens to `state.mine` the same way.
`onPlayerAdded` replays every player after a swap, and the player trove ends each syncer when the player leaves. Keep
the server-only atom's values across swaps the same way (`persistAtoms`-style, or `this.ctx.playerState`).

## Rules

- **`persist` holds values, never atoms:** an atom keeps the old generation's code alive.
- **Plain data in atoms you persist or sync:** tables, arrays, strings, numbers, booleans. Version the persist key
  (`state.synced.v2`) when a shape changes in a way old values would break.
- **String keys for dictionaries you sync** (`tostring(userId)`): a table keyed by numbers that aren't 1, 2, 3... doesn't
  cross a remote intact.
- **One `SYNCED` list for both realms**, and only atoms in it: `computed` values are derived again on each side.
- Draw UI from the atoms, never from a remote's answer (the TypeTorch UI workflow), so a swap's hydrate redraws it.
