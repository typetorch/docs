# TypeTorch agent playbook

For AI coding agents (Claude Code, Codex, Cursor, Copilot, Aider and others). Follow it when the user says "migrate this
project to typetorch", "set up typetorch", "convert to typetorch", "add typetorch" or similar.

**You** do every local step: read the project, plan, change code, build, check the payload. **The user** does every
step that touches Roblox or secrets: API keys, signing keys, Creator Hub settings, publishing the place, deploying,
approving. You finish with a numbered "What you need to do" list that tells them exactly how.

- Human guides: [fresh setup](../getting-started/fresh-setup.md), [migrate](../getting-started/migrate.md) (before/after
  code for every pattern), [player data](../guides/player-data.md), [hot assets](../guides/hot-assets.md).
- **Today** means it exists in the code now. **Planned** means it doesn't exist yet: never tell the user to use it.

> **Validated on 2026-10-05** with framework `7510856` (0.2.0, no Flamework), transformer `8ab4dbc` (0.2.0), kernel
> `422f95f` (0.3.1), cli `88f1766` (0.6.0) and template `6b628be`: a throwaway roblox-ts project with two Flamework
> services, a controller, a raw RemoteEvent, a `Players.PlayerAdded` handler, `_G` state and a `task.spawn` loop was
> migrated with this procedure (first on the Flamework-based toolchain, then moved to `@typetorch/transformer`) to a
> clean `typetorch build` (dev and prod channel; only Folders and ModuleScripts; guards and DI ids generated, no
> Flamework left in the output), and its `studio.project.json` built. The code samples in the guides it links (player
> data, characters, hot-asset tools, UI) compiled in that project. Nothing that needs keys was run.

## Rules (read first, apply always)

1. **Never create, ask for, read, print or store a secret:** Open Cloud API keys, signing key files
   (`~/.config/typetorch/keys/*`), pairing codes, cookies, tokens. Don't open `.env` files or the file named by
   `TYPETORCH_ENV_FILE`. Don't put a key in chat, a file, a commit or a command line. If the user pastes a key into chat,
   tell them to revoke it in Creator Hub and make a new one.
2. **Never act on Roblox.** Don't publish or save a place, upload anything, or run: `typetorch upload`, `deploy` (also
   not `--dry-run`: it reads the registry with the user's key), `promote`, `rollback`, `approve`, `reject`, `pin`,
   `deployments`, `branch ls`, `config push`, `kernel deploy` (also not `--dry-run`), `keys ...`, `assets sync|status`,
   `doctor` (it probes the key and publishes a test message). Don't start `remote-claude`. These go in the final list.
3. **Never push.** Local commits on a new branch are fine. Don't rewrite history, don't force anything.
4. **Don't edit the TypeTorch checkouts** (`../framework`, `../kernel`, `../transformer`, `../cli`, `../template`).
   Copy from them.
5. **Don't weaken security to make something work:** no new RemoteEvents, `loadstring`, `_G` hooks, disabled guards,
   or settings changes.
6. **Don't change player data formats, DataStore names or keys.** Follow [Player data](../guides/player-data.md) and
   flag everything for the user to test.
7. **Keep ids honest.** Never invent a universe, place, group or user id. Use the user's, or the placeholder `1`, and
   say so in the final list.
8. **Only promise what exists today.** Planned: `@typetorch/*` on npm and `npx @typetorch/cli` (today: local tarballs and
   `bun run typetorch`), `typetorch init`, kernel deploys that patch only the kernel (today `--replace-place` wipes the
   place), content packs, the typed asset map from files, CI/GitHub Action, `typetorch test`, `/tt grant`/`revoke`, a
   kernel `onClose` hook.

## Step 1: Detect

Read the project. Change nothing yet. Write down what you find.

1. **Is it roblox-ts?** `package.json` with `roblox-ts`, a `tsconfig.json`, `.ts` sources, a `*.project.json`.
   - **Plain Luau** (only `.lua`/`.luau`, Wally, Rojo): **stop.** Tell the user: "TypeTorch is roblox-ts only; there is
     no Luau framework. Port the game to roblox-ts first, or start a new game from the template (say 'set up
     typetorch' in an empty folder)." Do nothing else.
   - **Empty folder, no game** (the user said "set up typetorch"): follow [Fresh setup path](#fresh-setup-path).
   - **Not a Roblox project:** stop and say so.
2. **Toolchain:** lockfile (`bun.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), roblox-ts and TypeScript
   versions, `tsconfig.json` `plugins` and `include`, `rokit.toml`/`aftman.toml`/`foreman.toml`.
3. **Framework:** Flamework (`@flamework/core`, `Flamework.addPaths`/`ignite`, `@Service`, `@Controller`,
   `Dependency<T>()`, `@flamework/networking`, `@flamework/components`, custom `Modding` macros), Knit
   (`KnitServer.CreateService`, `Knit.Start()`), plain singletons, or something else (describe it).
4. **Entry points:** every `*.server.ts` and `*.client.ts`.
5. **Layout:** the Rojo tree in `default.project.json`; which `src/` folders go where.
6. **Patterns** (`git grep` works in PowerShell and bash; no output means none):

   ```sh
   git grep -nE "PlayerAdded|PlayerRemoving|CharacterAdded" -- src
   git grep -nE "RemoteEvent|RemoteFunction|OnServerEvent|OnClientEvent|InvokeServer|@rbxts/net|@flamework/networking" -- src
   git grep -nE "CollectionService|GetInstanceAddedSignal|@flamework/components" -- src
   git grep -nE "while \(true\)|task\.(spawn|delay|defer)|\bspawn\(|\bdelay\(|Heartbeat|RenderStepped|Stepped" -- src
   git grep -nE "_G\b|\bshared\." -- src
   git grep -nE "DataStoreService|ProfileStore|ProfileService|GetDataStore|MemoryStoreService" -- src
   git grep -nE "BindToClose|MessagingService|TeleportService" -- src
   git grep -nE "@rbxts/react|@rbxts/roact|@rbxts/vide|ScreenGui|PlayerGui|StarterGui" -- src
   git grep -nE "rbxassetid://|LoadAsset|:Clone\(\)|\.Clone\(\)" -- src
   ```

7. **Place content:** what the old Rojo project puts in the place besides code (models, `.rbxm`/`.rbxmx`,
   `*.model.json`, StarterGui, StarterPlayer scripts). Studio-built content isn't in the repo: ask, or note it.
8. **Ids:** the universe, place and group ids, if the repo has them (`servePlaceIds`, deploy scripts, `mantle.yml`,
   CI files). Don't guess.

## Step 2: Plan and show the plan

Create `MIGRATION_NOTES.md` at the repo root with the plan, and show it in chat. Continue unless the user asked you to
wait. Always ask before deleting files the user wrote by hand.

1. **Inventory:** from Step 1, with file paths.
2. **Mapping:** each old thing and its TypeTorch replacement (Step 4 tables).
3. **Order of work:** the sub-steps of Steps 3 and 4, one commit each.
4. **Risks and decisions for the user:** player data (always), Studio content and scripts that stay in the place,
   third-party networking (Zap, Blink, ByteNet), anything you can't convert.
5. **User actions:** filled in at the end (Step 7).

Log every step in `MIGRATION_NOTES.md` as you go: what changed, the build result, open questions.

## Step 3: Add the TypeTorch toolchain

Work on a new branch: `git switch -c typetorch-migration`, from a clean tree (commit or stash the user's changes
first; ask if unsure).

### 3.1 Sibling checkouts

Until the first npm release, the game uses packed copies of local checkouts **next to** the game repo:

```text
<workspace>/
  my-game/       the user's game (this repo)
  framework/     https://github.com/typetorch/framework
  kernel/        https://github.com/typetorch/kernel
  transformer/   https://github.com/typetorch/transformer
  cli/           https://github.com/typetorch/cli
  template/      https://github.com/typetorch/template    (the reference: copy its files)
  dev-server/    https://github.com/typetorch/dev-server  (optional, remote-claude)
```

If one is missing, clone it from the game folder (ask first if your environment needs approval for downloads):

```sh
git clone https://github.com/typetorch/framework ../framework
git clone https://github.com/typetorch/kernel ../kernel
git clone https://github.com/typetorch/transformer ../transformer
git clone https://github.com/typetorch/cli ../cli
git clone https://github.com/typetorch/template ../template
```

Then (same in PowerShell and bash):

```sh
cd ../framework
bun install
cd ../transformer
bun install
cd ../cli
bun install
cd ../my-game
```

If the checkouts live elsewhere, edit the `source:` paths at the top of the game's copy of `scripts/packages.ts` and
the path in the `typetorch` script (3.3).

**The template decides the toolchain.** Its `package.json`, `tsconfig.json`, `default.project.json` and
`studio.project.json` always match the framework of the same date. Copy from them; don't type versions from memory.

- **Today:** no Flamework. The framework's compiler plugin is `@typetorch/transformer` (a devDependency, packed from
  `../transformer` like the framework and the kernel); `Modding`, `Reflect` and `t` come from `@typetorch/framework`.
- If the template you find still depends on `@flamework/core` and `rbxts-transformer-flamework` (an older checkout),
  `git pull` the sibling checkouts first.
- **From the first npm release (planned)**, when the template depends on `@typetorch/framework` with a version range
  instead of `file:`: install from npm (`bun add @typetorch/framework`, `bun add -d @typetorch/transformer
  @typetorch/cli`, or the npm equivalents), skip the sibling checkouts and `scripts/packages.ts`, and run the CLI as
  `npx @typetorch/cli <command>` (or `bunx typetorch` after `bun add -d @typetorch/cli`).

### 3.2 Tools

- **Bun 1.3+** is the package manager. If the project uses npm, pnpm or yarn, run `bun install`, then delete the old
  lockfile. Mixing package managers breaks `rbxtsc`.
- **Rokit:** `rokit.toml` as in the template (keep the project's other tools; replace an old Rojo pin):

  ```toml
  [tools]
  rojo = "rojo-rbx/rojo@7.7.0-rc.1"
  lune = "lune-org/lune@0.10.5"
  ```

  Run `rokit install`; check `rojo --version` prints `7.7.0-rc.1` inside the repo.

### 3.3 package.json

Merge the template's `dependencies`, `devDependencies`, `overrides` and these scripts into the game's (keep the game's
own packages):

```json
"build": "bun scripts/build-info.ts && rbxtsc",
"watch": "bun scripts/build-info.ts && rbxtsc -w",
"studio": "rojo serve studio.project.json",
"packages": "bun scripts/packages.ts",
"postinstall": "bun scripts/packages.ts --sync",
"typetorch": "bun ../cli/src/index.ts"
```

- `build` must end with `rbxtsc` (the CLI appends `-p` for prod builds).
- Today the template's dependencies include `@typetorch/framework` and `@typetorch/kernel`, and the devDependency
  `@typetorch/transformer`, all as `file:.typetorch/packages/*.tgz`; `@rbxts/t` (generated guards import it),
  `@rbxts/trove`, `rbxts-transform-debug` `2.2.0` exactly, roblox-ts 3, TypeScript `5.5.3` (also in `overrides`).
- Remove packages the migration replaces (Knit, `@rbxts/net`, all `@flamework/*`, `rbxts-transformer-flamework`) once
  no code imports them (Step 4.2).

Copy the scripts and the Studio project, then install, in this order:

```sh
mkdir -p scripts
cp ../template/scripts/packages.ts scripts/packages.ts
cp ../template/scripts/build-info.ts scripts/build-info.ts
cp ../template/studio.project.json studio.project.json
bun scripts/packages.ts
bun install
```

PowerShell: `New-Item -ItemType Directory -Force scripts` and `Copy-Item <from> <to>` instead of `mkdir -p` and `cp`.

**Check:** `node_modules/@typetorch/framework/out/init.luau`, `node_modules/@typetorch/kernel/place.project.json` and
`node_modules/@typetorch/transformer/out/index.js` exist, and `bun scripts/packages.ts` printed `packed from <commit>`
for each.

### 3.4 tsconfig.json

Keep the project's options; take these from the template:

- `"include": ["./src/**/*.ts"]`. Without it rbxtsc compiles `scripts/*.ts` and fails (`Cannot find name 'console'`).
- `"experimentalDecorators": true`, `"rootDir": "src"`, `"outDir": "out"`.
- `"typeRoots": ["node_modules/@rbxts", "node_modules/@typetorch"]` (drop `node_modules/@flamework`).
- `"types": ["types", "compiler-types"]`. Without it the `@typetorch` type root pulls in the kernel package: TS2688.
- `plugins` exactly in the template's order: `{ "transform": "rbxts-transform-debug", "environmentRequires": {} }`,
  then `{ "transform": "@typetorch/transformer" }`. Remove `rbxts-transformer-flamework`. Keep other transformers the
  project uses after these two.

### 3.5 The payload project

The game's code becomes a **payload**: a roblox-ts **Model** project. Keep the old project for reference:

```sh
git mv default.project.json legacy.project.json
cp ../template/default.project.json default.project.json
```

- The template's file is a `Model` with `Server` (`out/server`), `Shared` (`out/shared`), `Client` (`out/client`) and
  `include` (with `node_modules/@rbxts`, and `@typetorch/framework` only, never the kernel).
- Sources must be in `src/server`, `src/shared`, `src/client`. Move other folders with `git mv` and fix imports.
- Note in `MIGRATION_NOTES.md` the non-code content of `legacy.project.json` that must now live in the place.

### 3.6 .gitignore

Add what's missing:

```gitignore
node_modules/
out/
include/
*.tsbuildinfo
src/shared/build.ts
.typetorch/
.payload.gen.project.json
.tsconfig.typetorch.json
.env
.env.*
```

If `out/` or `include/` were committed: `git rm -r --cached out include`. Delete Flamework leftovers: `flamework.build`,
`flamework.json`, `include/flamework`.

### 3.7 typetorch.json

At the repo root:

```json
{
	"project": "my-game",
	"universeId": 1,
	"placeId": 1,
	"creator": { "groupId": 1 },
	"defaultBranch": "prod",
	"branches": { "main": "prod" },
	"channels": { "prod": "prod" },
	"members": {},
	"devBadgeId": null,
	"approval": "prod",
	"kernel": "node_modules/@typetorch/kernel"
}
```

- `universeId`, `placeId`, `creator`: the user's (`{ "groupId": … }` or `{ "userId": … }`, the experience owner), or
  the placeholder `1`.
- `branches`: map the repo's default git branch (`main` or `master`) to `prod`.
- `members`: `{}` unless the user gave user ids; the owner is always a dev.
- `approval: "prod"`: dev deploys go out at once, prod ones wait for the user's y/N.
- Never copy the template's `signingPublicKeys`, `keyAssetId` or `fallbackPublicKey`: they belong to the template's
  game. `typetorch keys init` writes the user's.

### 3.8 Boot modules

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

- Every ModuleScript under the `modules` folders is required: their top-level code must have no side effects.
- `bun run build` now writes `src/shared/build.ts` (gitignored) and compiles.

**Check:** run `bun run build`, then commit (`git add -A`, `git commit -m "TypeTorch toolchain"`).

- Knit or plain projects: it passes (old code still compiles).
- **Flamework projects: it fails** on every `@flamework/core` import with "You can only use npm scopes that are listed
  in your typeRoots". Expected: the toolchain no longer has Flamework. Note it in the log; Step 4.1 and 4.2 make it pass.
- `bun run typetorch build` fails on the old entry scripts until Step 4.1.
- Run the compiler only through `bun run build` or `bunx rbxtsc`. In a Bun project on Windows, `npx rbxtsc` runs an
  unrelated placeholder package.

## Step 4: Migrate the code in small verifiable steps

One sub-step per commit. After each: `bun run build` must pass, then log it in `MIGRATION_NOTES.md`. (Flamework
projects: do 4.1 and 4.2 together; the build passes once no `@flamework/*` import is left.)

### 4.1 Entry points

Move what each `*.server.ts` / `*.client.ts` does into modules, then delete the script (`git rm`). Delete
`Flamework.addPaths(...)`, `Flamework.ignite()`, `Knit.Start()` and hand-written bootstrappers. A Script or LocalScript
left in the payload fails `typetorch build` with "the payload may hold only Folders and ModuleScripts".

### 4.2 Services and controllers → modules

| Old | TypeTorch |
|---|---|
| Flamework `@Service()` / `@Controller()` | `@Service()` / `@Controller()` from `@typetorch/framework`; the class `extends Module`; a constructor calls `super()` |
| Flamework `OnInit`, `OnStart`, `OnTick`, `OnPhysics`, `OnRender` | the same names from `@typetorch/framework` |
| Flamework `Dependency<T>()` | constructor injection |
| `Modding`, `Reflect`, `t` from `@flamework/core` | the same names from `@typetorch/framework` |
| custom decorators (`Modding.createDecorator`, `@metadata flamework:parameters injectable`) | `Modding.createDecorator` from `@typetorch/framework`, `@metadata typetorch:parameters injectable` |
| Flamework `@Component` / `@flamework/components` | a module using `observeElement(this.trove, tag, …)` or `@rbxts/observers` |
| Flamework `Flamework.createGuard<T>()`, `Flamework.id<T>()` | `t` guards written by hand, or a user macro (transformer README "Migrating from Flamework"); note it for the user |
| Knit `CreateService({ Name, Client, KnitInit, KnitStart })` | `@Service()` class; `KnitInit` → `onInit`, `KnitStart` → `onStart`, `Client` → network leaves |
| Knit `Knit.GetService("X")` / `GetController` | constructor injection |
| singleton module with top-level state | a `@Service()` / `@Controller()` class; state on the instance or in `persist` |
| shutdown cleanup | `onStop` (reverse order; the kernel gives a stopping generation 5 s) and the trove |

- Server modules go in `src/server/services/`, client modules in `src/client/controllers/` (subfolders are fine);
  kebab-case names (`coin.service.ts`).
- Import only from `@typetorch/framework`: `Module`, `Service`, `Controller`, `OnInit`, `OnStart`, `OnStop`, `OnTick`,
  `OnPhysics`, `OnRender`, `OnPlayerAdded`, `TypeTorch`, `createNetwork`, `observePlayers`, `observeElement`,
  `isRealFrame`, `popIn`, `popOut`, `bump`, `PopupQueue`, `hotAsset`, `setNetworkLimits`, and `Modding`, `Reflect`,
  `t` for your own macros and decorators.
- **If the project uses Flamework,** the migration is mostly a swap: the decorators, constructor injection and
  lifecycle interfaces keep their names, so change the imports to `@typetorch/framework`, add `extends Module` and
  `super()`, and do the swap-safety pass (4.3). The rest is the toolchain (Step 3), `createNetwork` for
  `@flamework/networking` (4.4) and observers for components. Then:
  - no file under `src/` imports `@flamework/*`: `git grep -n "@flamework/" -- src` prints nothing;
  - remove `@flamework/*` and `rbxts-transformer-flamework` from `package.json` (`bun remove ...`);
  - type ids changed format (`@typetorch/framework:decorators@Service`, `server/services/x@X`): anything the game
    saved under Flamework ids (`Flamework.id<T>()`) won't match. Flag it under data.
- No work in constructors (`this.trove` and `this.ctx` arrive right after).
- `onInit` runs in dependency order and may yield briefly (about 20 s for the whole generation to be ready); `onStart`
  is spawned per module inside its trove.

### 4.3 Swap-safety pass (every module)

Every module must be stoppable and restartable: a deploy stops it and starts a fresh copy in the same server.

1. **Everything in the trove:** `this.trove.connect(signal, fn)`, `this.trove.add(instance)`,
   `this.trove.add(network.server.x.y.on(...))`, `this.trove.add(TypeTorch.onSwapOut(...))`.
2. **No module-level state or side effects.** Constants may stay. Per-generation state goes on the instance. State that
   must survive a swap goes in `this.ctx.persist("key.v1", () => init)`, plain data only (tables, Maps, Sets of
   strings, numbers, booleans, Players); never functions, class instances, Promises, threads, connections, charm atoms
   or Instances the generation made. Version the key.
3. **Players through `onPlayerAdded(player, playerTrove)` or `observePlayers(this.trove, …)`**, never
   `Players.PlayerAdded.Connect`. They replay everyone on every swap, so **join handlers must be idempotent**: guard
   one-time effects (join rewards, welcome popups, "joined" analytics) with a persisted set. Work for real leaves only:
   `this.trove.connect(Players.PlayerRemoving, …)` (a `playerTrove` is also cleaned on every swap).
4. **Tags and characters through observers:** `observeElement(this.trove, tag, (instance, elementTrove) => …)`, or
   `@rbxts/observers` with its stop function in the trove, or (characters, no extra package) `player.Character` plus
   `playerTrove.connect(player.CharacterAdded, …)`.
5. **No global connections or loops outside troves.** A loop directly in `onStart` is fine. Elsewhere:
   `this.trove.add(task.spawn(() => { … }))`. Prefer `onTick` for per-frame work.
6. **No `_G` or `shared`:** constructor injection, or `persist`.
7. **`task.spawn`/`delay`/`defer` only through the trove:** `this.trove.add(task.delay(5, fn))`. Replace deprecated
   `spawn`, `delay`, `wait` with `task.*`.
8. **Instances in the world** that a module creates go in its trove (or an observer's cleanup).
9. **`game.BindToClose`:** at most once per server (a persisted flag), short. A kernel `onClose` hook is planned.

### 4.4 Networking

- One `src/shared/net.ts`:

  ```ts
  import { createNetwork, type ProperReturns } from "@typetorch/framework";
  interface ClientToServer { shop: { buy(itemId: string): void; price(itemId: string): ProperReturns<number> } }
  interface ServerToClient { shop: { purchased(itemId: string): void } }
  export const network = createNetwork<ClientToServer, ServerToClient>();
  ```

- Server: `this.trove.add(network.server.shop.buy.on((player, itemId) => …))`; requests:
  `this.trove.add(network.server.shop.price.handle((player, itemId) => [100]))` (`[value]` or `[false, "reason"]`);
  sends: `network.server.shop.purchased.fire(player, id)`, `fireAll`, `fireExcept`, `fireList`, `fireUnreliable`.
- Client: `network.client.shop.buy.fire(id)`; `this.trove.addPromise(network.client.shop.price.invoke(id).then(…))`;
  `this.trove.add(network.client.shop.purchased.on((id) => …))`.
- Delete every RemoteEvent/RemoteFunction/UnreliableRemoteEvent the game created, in code, the Rojo project or the
  place notes. RemoteFunctions become request leaves.
- Template literal types can't be guarded: use `string`. Keep game checks (distance, ownership, cooldowns) in handlers.
- `@rbxts/net`, `@flamework/networking`, Zap, Blink, ByteNet: convert to `createNetwork`.

### 4.5 UI

- Code-built UI: build it in a controller; `this.trove.add(screenGui)`.
- Studio-built UI stays in the place (StarterGui): tag what code touches (`Element:<Area>.<Name>`), drive it with
  `observeElement`. The payload can't carry ScreenGuis.
- charm atoms live per generation; persist their plain values if they must survive a swap.
- React/Roact/Vide: mount in a controller, `this.trove.add(() => root.unmount())`.
- `popIn`/`popOut`/`bump` (UIScale, never tweened `Size`); one `PopupQueue` for modals.

### 4.6 Player data (always flag it)

Player data is game code. The swap-safe pattern ([Player data](../guides/player-data.md)): the library lives in the
place (for example `ServerStorage.Packages.ProfileStore`) with a small host Script that requires it first; session
handles live in `persist`; load on join (re-attach after a swap), release on a real leave.

| The project uses | Do |
|---|---|
| ProfileStore / ProfileService | rewrite the data module as the guide's `DataService` (same store names and keys, `PlayerData_dev` for non-prod channels); the require of the place copy and the `DataHost` Script are **user steps** (Studio) |
| plain DataStores, small per-player values | keep them in the payload: read once per join, `UpdateAsync` on change, pending writes in `persist` (like the template's `BestService`) |
| anything else (DataStore2, Lapis, custom sessions) | wrap it in a `@Service()` unchanged, and write in `MIGRATION_NOTES.md` that it must move to the place and follow the pattern before prod |

Never rename stores or change the data shape. Always put "test data across two deploys on a dev branch" in the user's
list.

### 4.7 Place content, assets and scripts that stay

- The place keeps: the kernel, maps, terrain, lighting, StarterGui layouts, StarterPlayer/StarterCharacter scripts,
  third-party Luau systems, the data library and its host Script. They change with a place publish and a restart.
- Hard-coded asset ids keep working (owned by or shared with the experience owner).
- **Hot assets** (optional; only if the user asks, or mention it in the report): code that clones templates can use
  `hotAsset("tools/sword", template)` (the second argument keeps today's template as the fallback). Marking templates
  with `TypeTorchAsset` and `typetorch assets sync` are user steps. See [Hot assets](../guides/hot-assets.md).
- Never suggest `typetorch kernel deploy --replace-place` for a place with Studio content.

### 4.8 Logging (optional)

`$print`, `$warn`, `$assert` from `rbxts-transform-debug` add `[file:line]` in dev builds and are removed from prod
builds. Plain `print`/`warn` keep working.

## Step 5: Run local checks

All local; no key needed.

```sh
bun run build
bun run typetorch build
```

1. `bun run build` has no errors.
2. `bun run typetorch build` prints `built <artifact id>  (branch ..., channel ..., <git branch>@<commit>, ...)` and
   `.typetorch/payload.rbxm  <size>  <n> modules`. It fails, naming the path, if the payload holds anything but Folders
   and ModuleScripts.
3. The guards were generated: `out/shared/net.luau` calls `createNetwork(` with `t.` guards (for example
   `t.strictArray(t.string)`). `createNetwork()` with no arguments means the transformer isn't running.
4. The pattern scan prints nothing (or only lines you checked and explain in the notes):

   ```sh
   git grep -nE "Players\.PlayerAdded\.Connect|PlayerRemoving\.Connect\(" -- src
   git grep -nE "new Instance\(\"(Remote|UnreliableRemote)(Event|Function)\"\)" -- src
   git grep -nE "_G\b|\bshared\." -- src
   git grep -nE "@flamework/|Flamework\.(ignite|addPaths)|Knit\.Start" -- src
   git grep -nE "^\s*task\.(spawn|delay|defer)\(|[^.]\bspawn\(|[^.]\bdelay\(" -- src
   ```

5. Commit, then `bun run typetorch build` again: the id has no `-dirty`. Also try a prod build:
   `bun run typetorch build --branch prod` ("prod channel: $print/$warn removed").
6. The Studio project builds: `rojo build studio.project.json -o .typetorch/studio-check.rbxl`, then delete that file.

Fix, rebuild, log.

## Step 6: Stop at user actions

Don't do these; list them in Step 7:

- create the group, the experience, an API key; change Creator Hub or Game Settings;
- write a key anywhere; run `typetorch keys ...`, `doctor`, `deploy`, `upload`, `approve`, `promote`, `rollback`, `pin`,
  `config push`, `assets sync|status`, `kernel deploy`, `deployments`, `branch ls`;
- publish a place; edit the place in Studio (kernel install, data library, `TypeTorchAsset` marks);
- start `remote-claude`;
- push to a remote.

## Step 7: Finish with "What you need to do"

End with this list, filled in for the project (drop what doesn't apply). Also append it to `MIGRATION_NOTES.md`.

```markdown
## What you need to do

1. **Fill in the ids** in `typetorch.json` (replace the placeholder `1`s): `universeId`, `placeId`, and
   `creator.groupId` (or `creator.userId`). Creator Hub > Creations > your experience > "..." > Copy Universe ID /
   Copy Start Place ID. Optional: your user id in `members` as `"owner"`.
2. **Experience settings** (Studio > File > Game Settings > Security, as the owner): Allow HTTP Requests on; Enable
   Studio Access to API Services on. Optional: Allow Mesh / Image APIs (Claude images), Allow Loading Third Party
   Assets (Toolbox inserts).
3. **Create an Open Cloud API key** (Creator Hub > Open Cloud > API Keys, as the group owner or a member allowed to
   upload and publish for the group), for this experience:
   - `asset:read`, `asset:write`; Luau Execution `universe.place.luau-execution-session:read` and `:write` (hot assets,
     doctor's place check)
   - `universe-messaging-service:publish`
   - `universe:read` and `universe:write` (the registry: members and branch heads; give both or neither)
   - place publishing (`universe-places` write; the CLI says `universe.place:write`), only for `kernel deploy`
   Set an expiry and, if you can, an IP allowlist.
4. **Store it outside the repo:** `~/.config/typetorch/<game>.env` with the line `TYPETORCH_API_KEY=<key>`, and in the
   repo's `.env` (gitignored) the line `TYPETORCH_ENV_FILE=~/.config/typetorch/<game>.env`. Never commit it or paste it
   into chat.
5. **Check:** `bun run typetorch doctor`. Expect `ok` for the tools, `typetorch.json`, each key and the scopes you added.
6. **Prod signing keys:** `bun run typetorch keys init`, `bun run typetorch keys init --fallback`, commit
   `typetorch.json`. Back up `~/.config/typetorch/keys/<universeId>.key` and `.fallback.key`.
7. **Put the kernel in the place** (needs a place publish and a restart):
   - empty or new place: `bun run typetorch kernel deploy --dry-run`, then
     `bun run typetorch kernel deploy --replace-place --yes`;
   - place with Studio content (never `--replace-place`, it wipes the place): `bun run typetorch kernel deploy --dry-run`,
     open `.typetorch/place.rbxl` in Studio, copy `ServerScriptService.TypeTorchKernel`,
     `ReplicatedStorage.TypeTorchKernelShared` and `ReplicatedFirst.TypeTorchKernelClient` into your place, turn on
     ServerScriptService.LoadStringEnabled if you want remote-claude, remove the old scripts listed in
     MIGRATION_NOTES.md, File > Publish to Roblox.
8. **Player data** (if listed in MIGRATION_NOTES.md): in Studio put the library at `ServerStorage.Packages.<Name>` and
   add the `ServerScriptService.DataHost` Script from the Player data guide; publish.
9. **Test locally in Studio:** `bun run watch` and `bun run studio` (two terminals), connect the Rojo plugin, Play.
   Server > Status shows "Studio: local payload". Use the dev menu's Reload to test a swap.
10. **Check the kernel live:** join the game; F9 > Server shows `[TypeTorch] kernel 0.3.1@... on a public server,
    branch prod, signed deploys only (keys: key asset)`. `/tt status` answers.
11. **Dev branch:** `git switch -c dev`, `bun run typetorch deploy`, then `/tt new dev` in game. Earn some data, deploy
    again twice while playing, rejoin: nothing lost.
12. **First prod deploy:** merge into `main`, stay in the game, `bun run typetorch deploy` (y/N, then signed). Expect
    `deployed #N prod@<commit> -> <artifact id>`; the dev menu's Artifact tab shows two verified badges.
13. **Rollback drill:** `bun run typetorch rollback --branch prod`, check `bun run typetorch deployments`, deploy again.
14. Optional: `bun run typetorch config push` (members, needs `universe:write`); [hot assets](https://github.com/typetorch/docs/blob/main/guides/hot-assets.md);
    [remote-claude](https://github.com/typetorch/docs/blob/main/guides/remote-claude.md).
```

### Final report template

```markdown
# TypeTorch migration report

**Result:** builds: <yes/no> · branch `typetorch-migration` · <N> commits · artifact `<id from typetorch build>`

## What I changed
- Toolchain: <bun, rokit, package.json, tsconfig, default.project.json (payload), studio.project.json, typetorch.json, .gitignore>
- Entry points: <old scripts> → `src/server/boot.ts`, `src/client/boot.ts`
- Modules: <N services, M controllers> (<framework> → TypeTorch); Flamework imports left: <none>
- Networking: <K remotes> → `src/shared/net.ts` (<leaves>)
- Swap safety: <player handlers, loops, globals, tags, characters>
- UI: <...>
- Player data: <pattern applied / wrapped / not present>

## Checks
- `bun run build`: <pass/fail>
- `bun run typetorch build`: <pass/fail>, <n> modules, clean id: <yes/no>; prod build: <pass/fail>
- Guards generated: <yes/no>
- Pattern scan: <clean / items with reasons>
- `studio.project.json` builds: <yes/no>

## Needs your decision
- Player data: <what it does, the risk, what to test>
- Place content and scripts that stay in the place: <list>
- Not converted: <list with reasons>

## What you need to do
<the numbered list from Step 7>

Details: MIGRATION_NOTES.md
```

## Fresh setup path

No game yet ("set up typetorch" in an empty folder):

1. From the workspace folder:

   ```sh
   git clone https://github.com/typetorch/template my-game
   git clone https://github.com/typetorch/framework
   git clone https://github.com/typetorch/kernel
   git clone https://github.com/typetorch/transformer
   git clone https://github.com/typetorch/cli
   cd my-game
   git remote remove origin
   ```

2. `bun install` in `../framework`, `../transformer` and `../cli`; then in `my-game`: `bun scripts/packages.ts`,
   `bun install`, `rokit install`.
3. In `typetorch.json`: the user's ids (or placeholders `1`), `members` `{}` unless given, and **delete**
   `signingPublicKeys`, `keyAssetId` and `fallbackPublicKey` (they are the template's). Add the `typetorch` script
   (3.3).
4. Step 5 checks, commit.
5. Step 7 list (skip data, legacy and kernel-copy items: the new place takes `--replace-place`).

## Optional: Claude Code

- Install the skill (works once `typetorch/claude-plugin` is on GitHub): `/plugin marketplace add typetorch/claude-plugin`,
  then `/plugin install typetorch@typetorch`. Run it with `/typetorch:typetorch-migrate`.
- Plan mode fits Steps 1 and 2. Allow `bun run build` and `bun run typetorch build`; keep every Roblox-facing command
  on ask or deny.
- remote-claude runs only on a Claude subscription login, never an API key.
