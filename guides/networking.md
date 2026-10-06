# Networking

One typed network replaces every RemoteEvent and RemoteFunction. Messages travel over the kernel's two stable remotes
(`ReplicatedStorage.TypeTorch.Net` and `NetU`), so a swap never breaks the network, and a generation never creates
remotes of its own.

## Declare

```ts
// src/shared/net.ts
import { createNetwork, type ProperReturns } from "@typetorch/framework";

/** Client -> server. Every leaf gets a generated type guard. */
interface ClientToServer {
	shop: {
		buy(itemId: string, amount: number): void;
		price(itemId: string): ProperReturns<number>;
	};
}

/** Server -> client. */
interface ServerToClient {
	shop: {
		purchased(itemId: string): void;
	};
}

export const network = createNetwork<ClientToServer, ServerToClient>();
```

Namespaces nest as deep as you like. A leaf returning `ProperReturns<T>` is a request: it answers `[value]` or
`[false, "reason"]` (the reason is player-facing text).

## Use

Server (in a service, with the trove):

```ts
this.trove.add(network.server.shop.buy.on((player, itemId, amount) => this.buy(player, itemId, amount)));
this.trove.add(network.server.shop.price.handle((player, itemId) => [this.priceOf(itemId)]));

network.server.shop.purchased.fire(player, "sword");
network.server.shop.purchased.fireAll("sword");
network.server.shop.purchased.fireExcept(player, "sword");
network.server.shop.purchased.fireList([a, b], "sword");
network.server.shop.purchased.fireUnreliable(player, "sword");
```

Client (in a controller):

```ts
network.client.shop.buy.fire("sword", 1);
this.trove.add(network.client.shop.purchased.on((itemId) => this.showPurchased(itemId)));
this.trove.addPromise(
	network.client.shop.price.invoke("sword").then((reply) => {
		const [price] = reply;
		if (typeIs(price, "number")) this.showPrice(price);
	}),
);
```

- `on` registers a listener (several allowed); `handle` sets the one request handler of a leaf.
- `invoke` resolves with the handler's result or rejects after 15 s ("The server didn't answer in time"), or when the
  generation stops.

### Timeouts

A button that must fail fast, or a call that takes long (a reserved server, a teleport), sets its own timeout in
seconds:

```ts
network.client.vc.spawn.invokeWithTimeout(30).then(([ok]) => ...); // this call
setNetworkLimits({ "vc.status": { timeout: 5 } }); // every invoke of this leaf
```

- `invokeWithTimeout(seconds, ...args)` wins over the leaf's `timeout`, which wins over the default 15 s.
- Both are in **seconds**, from 0.5 to 120. A value outside is clamped, with one warning (Flamework code that passed
  `5000` meaning milliseconds gets 120 s).
- The client reads the leaf's `timeout`, so call that `setNetworkLimits` in code both realms load (next to
  `createNetwork` in `src/shared/net.ts`).

### Run local handlers: `emit`

`emit` runs this generation's own `on` handlers for a leaf, right now, as if the message had arrived. Nothing goes over
the network, and no guard runs. It is Flamework's `predict`: one handler for both server messages and local feedback.

```ts
// client: show an error toast through the same handler the server's notify.error uses
network.client.notify.error.emit("Not enough coins");

// server, for tests: run the shop.buy listeners as if the player had sent it
network.server.shop.buy.emit(player, "sword", 1);
```

Handlers run in order on the calling thread; one that throws is warned, and the others still run.

## Guards and limits

Every client → server message is checked on the server, in this order:

1. a per-player, per-leaf **rate limit** (token bucket, default 20 burst, 10 per second);
2. **shape limits**: finite numbers, strings up to 1000 characters, tables up to 300 entries and 4 levels deep;
3. the **generated type guard** for the leaf's parameters.

A client that keeps sending refused messages (300 within 10 s) is kicked. Tune a leaf:

```ts
import { setNetworkLimits } from "@typetorch/framework";

setNetworkLimits({
	"chat.say": { maxString: 200, rate: [5, 1] },
	"build.place": { maxEntries: 50 },
});
```

Guards check shapes only. Keep your game's own checks in the handler: distance, ownership, cooldowns, prices.

## Rules

- **Never create a RemoteEvent, RemoteFunction or UnreliableRemoteEvent** in game code or in the place. RemoteFunctions
  become request leaves (`handle` / `invoke`).
- **Template literal types can't be guarded** (`` `item_${string}` ``): use `string` and check it in the handler.
- Classes can't be guarded either: send plain data.
- **Supported parameter types:** string, number, boolean, undefined and optional, literals and TS enums, Enum items,
  Roblox datatypes (Vector3, CFrame, Color3, UDim2, ...), Instances by class, arrays, tuples, Maps, Sets, plain objects
  and interfaces, unions, `buffer`, and `unknown` / `any`. The transformer names the leaf when a guard can't be built,
  and warns about generic or conditional leaves (checked loosely: use a union of tuples) and about values that never
  arrive (functions, threads, signals, connections, AnimationTracks).
- Register handlers through the trove, so a swap removes them.
- During a swap, a message sent with the old build's id gets a "resync" answer, and the client waits for its own swap.
  Pending `invoke`s reject with "This version of the game is shutting down".
- Third-party networking (`@rbxts/net`, `@flamework/networking`, Zap, Blink, ByteNet) doesn't run inside a payload.
  From `@flamework/networking`: `connect` → `on`, `setCallback` → `handle`, `broadcast` → `fireAll`, `except` →
  `fireExcept`, `predict` → `emit`, `invokeWithTimeout` keeps its name (seconds). Or keep Flamework's names for now
  with `createFlameworkCompat` ([Coming from Flamework](from-flamework.md)).

## Seeing the traffic

The dev menu's **Network > Packets** shows every message with its guard verdict and arguments; **Network > Stats**
counts them per leaf. See [The dev menu](dev-menu.md#network).
