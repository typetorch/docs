# Coming from Flamework

A Flamework 1.x game moves to TypeTorch in two parts:

1. **The mechanical part:** imports, `extends Module`, boot files and networking. `typetorch migrate --from flamework`
   rewrites it for you, and the **compatibility layer** (`createFlameworkCompat`) keeps every `@flamework/networking`
   call site as it is.
2. **The real work:** making every module stoppable and restartable (the
   [swap-safety rules](../getting-started/migrate.md#5-the-swap-safety-rules)). The codemod can't decide these, so it
   lists each one, with its file and line, in a report.

This page covers both tools and the mapping. The rest of the migration (toolchain, data, UI, the kernel in your place)
is in [Migrate an existing game](../getting-started/migrate.md).

## Steps

1. Switch the toolchain: [migrate step 2](../getting-started/migrate.md#2-add-the-toolchain) (package.json
   with the `@typetorch/*` packages and without `@flamework/*`, tsconfig.json, the payload project,
   `scripts/build-info.ts`). Commit. `bun run build` now fails on every Flamework import; that's expected.
2. Preview, then run the codemod in the game folder:

   ```sh
   bun run typetorch migrate --from flamework --dry-run   # prints the diff, writes nothing
   bun run typetorch migrate --from flamework             # writes it, plus typetorch-migrate-report.md
   ```

3. `bun run build`. What still fails is in the report.
4. Work through the report's flagged items, top to bottom. Commit after each group that builds.
5. Later, at your own pace: move from the compatibility layer to `createNetwork`
   (`typetorch migrate --from flamework --net native` on a clean tree does most of it).

On a real game (67 modules, about 470 network call sites), step 2 took the build from 292 TypeScript errors to none:
the build passes, and the report lists the swap-safety work.

## The codemod: `typetorch migrate --from flamework`

It runs on your machine only (no keys, nothing sent anywhere) and uses your game's own `node_modules/typescript`. It
refuses a working tree with uncommitted changes, so the whole migration is one diff you can review or undo
(`--allow-dirty` overrides that).

| Option | What it does |
|---|---|
| `--dry-run` | print the diff and the summary; write nothing (with `--report`, only the report) |
| `--net compat` | the default: networking through `createFlameworkCompat`, call sites unchanged |
| `--net native` | rewrite call sites to `createNetwork` (below) |
| `--report <file>` | where the Markdown report goes (default `typetorch-migrate-report.md`) |
| `--json` | the changed files, flags and counts as one JSON document |

**It rewrites:**

- `@flamework/core` imports to `@typetorch/framework` (`Service`, `Controller`, `OnInit`, `OnStart`, `OnTick`,
  `OnPhysics`, `OnRender`, `Modding`, `Reflect`, `Dependency`). A name TypeTorch doesn't have (`Optional`,
  `Flamework`) is dropped when the file doesn't use it, else kept and flagged.
- `@Service()` / `@Controller()` classes: `extends Module`, and `super()` as the first statement of their constructor.
  When the class already extends a base class of your project, that base class gets `extends Module` instead.
- A module's own `private readonly trove = new Trove()` is removed, so `this.trove` is the module's trove (cleaned
  when the generation stops). Any other member named `trove` or `ctx` is renamed (`ownTrove`) and flagged.
- `@metadata flamework:parameters` / `flamework:implements` JSDoc tags on your own decorators.
- **Ignite files** (`*.server.ts` / `*.client.ts` calling `Flamework.ignite()`) become `src/server/boot.ts` and
  `src/client/boot.ts`, with the `Flamework.addPaths` folders as the module folders. Any other top-level code in them
  moves into a generated module (`<name>.service.ts` / `<name>.controller.ts` in the first folder), inside `onStart`,
  and is flagged for review: it now runs once per generation, and `script` is that ModuleScript.
- **Networking:** `Networking.createEvent<A, B>()` becomes `createFlameworkCompat<A, B>().GlobalEvents` and
  `Networking.createFunction<A, B>()` becomes `createFlameworkCompat<{}, {}, A, B>().GlobalFunctions`, so
  `GlobalEvents.createServer({})` and everything after it stay. `Networking.Unreliable<T>` becomes `T` (sent
  reliably).

**It flags** (no rewrite, a line in the report each): module-level state, `Players.PlayerAdded.Connect`, `_G`, endless
loops outside `onStart`, `task.spawn` / `delay` / `defer` and `.Connect(...)` results not kept in a trove,
`@flamework/components`, `Dependency<T>()` in a constructor, field initializer or at the top level, `loadstring`,
RemoteEvents and RemoteFunctions, MessagingService, DataStore and ProfileService code, `BindToClose`, Scripts left in
`src`, server -> client requests, `createServer` / `createClient` middleware, an event and a function with the same
path, and toolchain leftovers.

### `--net native`

Each file's `createEvent` and `createFunction` become one network:

```ts
export const network = createNetwork<ClientToServerEvents & ClientToServerFunctions, ServerToClientEvents>();
```

and every handler call site moves to it: `ServerEvents.x.connect(fn)` -> `this.trove.add(network.server.x.on(fn))` (in
a module method), `setCallback` -> `handle` (in the trove too), `broadcast` -> `fireAll`, `except(player)` ->
`fireExcept`, `fire(players[])` -> `fireList`, `predict` -> `emit`, `ClientFunctions.x(...)` -> `.invoke(...)`.
Handler files that only created handlers (Flamework's template `server/network.ts`) are deleted, and imports point at
the network. What it can't decide is flagged: a `connect` result used as a connection (`on` returns a function), a
leaf passed around as a value, `except` with a list, `predict` on a request.

## The compatibility layer: `createFlameworkCompat`

```ts
// src/shared/network.ts
import { createFlameworkCompat } from "@typetorch/framework";

export const { ServerEvents, ClientEvents, ServerFunctions, ClientFunctions } = createFlameworkCompat<
	ClientToServerEvents,
	ServerToClientEvents,
	ClientToServerFunctions,
	ServerToClientFunctions
>();

// or, for code written as GlobalEvents.createServer({}):
export const GlobalEvents = createFlameworkCompat<ClientToServerEvents, ServerToClientEvents>().GlobalEvents;
export const GlobalFunctions = createFlameworkCompat<{}, {}, ClientToServerFunctions, ServerToClientFunctions>().GlobalFunctions;
```

It is built on `createNetwork`: the same generated guards (every client -> server leaf is checked on the server), rate
and shape limits (`setNetworkLimits` tunes the same dotted paths), the kernel's remotes, the dev menu's Network tab and
the swap rules. Only the names are Flamework's, so call sites compile unchanged:

| Flamework call | Does |
|---|---|
| `ServerEvents.x.fire(player \| players, ...)`, `ServerEvents.x(player, ...)` | send to one player or a list |
| `ServerEvents.x.broadcast(...)` / `except(player \| players, ...)` | everyone / everyone else |
| `ServerEvents.x.connect((player, ...) => ...)` | listen; returns a connection (`Disconnect()`, `Connected`; a trove takes it) |
| `ServerEvents.x.predict(player, ...)` | run the server's listeners as if `player` sent it (no guard) |
| `ClientEvents.x.fire(...)`, `ClientEvents.x(...)` | send to the server |
| `ClientEvents.x.connect((...) => ...)` / `predict(...)` | listen / run the client's listeners locally, no traffic |
| `ServerFunctions.x.setCallback((player, ...) => value \| Promise)` | the request's handler; a Promise is awaited |
| `ServerFunctions.x.predict(player, ...)` | run the handler here; returns a Promise |
| `ClientFunctions.x.invoke(...)`, `ClientFunctions.x(...)` | ask the server; a Promise |
| `ClientFunctions.x.invokeWithTimeout(seconds, ...)` | the same with a timeout in **seconds** (0.5 to 120) |

What differs from Flamework:

- **Connections belong to the running generation.** A swap drops every listener and handler with its generation, so
  `connect` needs no trove (`Disconnect()` still ends one earlier).
- Each listener call runs on its own thread, as with Flamework; one that throws is warned (`[net] x listener threw`)
  and counted in the dev menu, never a script error.
- Request timeouts: the leaf's `timeout` (`setNetworkLimits`), else `createClient({ defaultTimeout })`, else 15 s.
  `invokeWithTimeout(10000)` meant as milliseconds is clamped to 120 s with a warning (Flamework took seconds too).
- A rejected request rejects with TypeTorch's player-facing reasons ("The server didn't answer in time.", "Bad
  request."), not `NetworkingFunctionError`.
- **Not supported:** server -> client requests (a leaf of `ServerToClientFunctions` has no methods: a client can't be
  trusted to answer; use an event each way), middleware and `disableIncomingGuards` (warned, ignored),
  `Networking.Unreliable` (sent reliably), `registerHandler`.
- Events and functions share one path space: `Spin.request` can't be both an event and a function (refused at start).

`typetorch build` warns while a game uses the layer, with its file and leaf count, so you can move to `createNetwork`
over time. New code should use `createNetwork` ([Networking](networking.md)).

## Network leaves the transformer warns about

`@typetorch/transformer` names the leaf in every guard problem of `createNetwork` and `createFlameworkCompat`:

- **Generic or conditional leaves** (`<T extends Model | undefined>(box: T, group: T extends Model ? string :
  undefined) => void`): a warning. The guard checks `T` as its constraint and a conditional type as either branch, so
  it can't enforce how the arguments go together. Declare a union of tuples,
  `(...args: [box: Model, group: string] | [box: undefined]) => void`, or two leaves.
- **Values that never arrive:** functions, `thread`, `RBXScriptSignal`, `RBXScriptConnection` and `AnimationTrack`
  (Roblox sends nil, so a client -> server guard refuses every message). A warning; send the data, or the Animation /
  AnimationId and load the track on the other side.
- **No guard possible** (a class, a template literal type): an error naming the leaf.

Supported parameter types: string, number, boolean, undefined and optional, literals and TS enums, Enum items, Roblox
datatypes (Vector3, CFrame, Color3, UDim2, ...), Instances by class, arrays, tuples, Maps, Sets, plain objects and
interfaces, unions, `buffer`, and `unknown` / `any`.

## Mapping

| Flamework | TypeTorch |
|---|---|
| `rbxts-transformer-flamework`, the `node_modules/@flamework` type root | `@typetorch/transformer`, `node_modules/@typetorch` ([step 2](../getting-started/migrate.md#2-add-the-toolchain)) |
| `Flamework.addPaths(...)` + `Flamework.ignite()` in `*.server.ts` / `*.client.ts` | `src/server/boot.ts` / `src/client/boot.ts` calling `startServer` / `startClient` |
| `@Service()`, `@Controller()`, constructor injection | the same names from `@typetorch/framework`, the class `extends Module`, `super()` |
| `OnInit`, `OnStart`, `OnTick`, `OnPhysics`, `OnRender` | the same; plus `OnStop` and `OnPlayerAdded` |
| `Dependency<T>()` | the same, from `onInit` on (not in a constructor, field initializer or at the top level); `Lazy<T>` breaks cycles |
| `@Optional()`, `Flamework.id<T>()`, `Flamework.createGuard<T>()`, `Flamework.implements<T>()` | none: every module starts; write a user macro with `Modding.Generic<T, "id" \| "guard">` |
| `Modding`, `Reflect`, `@metadata flamework:parameters` | `Modding`, `Reflect` from `@typetorch/framework`, `@metadata typetorch:parameters` |
| `@flamework/components` (`@Component`, `BaseComponent`) | a module with `observeElement` or `@rbxts/observers` ([rule 4](../getting-started/migrate.md#rule-4-tags-and-characters-through-observers)) |
| `Networking.createEvent` / `createFunction` | `createFlameworkCompat` (same call sites), or `createNetwork` |
| `connect` / `setCallback` / `broadcast` / `except` / `predict` | native: `on` / `handle` / `fireAll` / `fireExcept` / `emit` (in `this.trove`) |
| `invoke` / `invokeWithTimeout(seconds, ...)` | the same names, seconds |
| `Networking.Unreliable<T>` | native: `fireUnreliable` / `fireAllUnreliable` |
| server -> client functions | an event each way |
| a module's own `new Trove()` | `this.trove` (cleaned when the generation stops) |
