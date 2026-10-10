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
>
> **npm setup checked on 2026-10-05** with template `756e78c` (every `@typetorch/*` package from npm: framework 0.2.0,
> kernel 0.3.1, transformer 0.2.0, cli 0.6.0, dev-server 0.2.0): a fresh clone built with `bun install`,
> `bun run build` and `bun run typetorch build`, and so did a copy without `scripts/packages.ts` and its two scripts.

## Rules (read first, apply always)

1. **Never create, ask for, read, print or store a secret:** Open Cloud API keys, signing key files
   (`~/.config/typetorch/keys/*`), pairing codes, cookies, tokens. Don't open `.env` files or the file named by
   `TYPETORCH_ENV_FILE`. Don't put a key in chat, a file, a commit or a command line. If the user pastes a key into chat,
   tell them to revoke it in Creator Hub and make a new one.
2. **Never act on Roblox.** Don't publish or save a place, upload anything, or run: `typetorch upload`, `deploy` (also
   not `--dry-run`: it reads the game's DataStore with the user's key), `promote`, `rollback`, `approve`, `reject`,
   `pin`, `deployments`, `branch ls`, `settings ...`, `access push`, `kernel deploy` (also not `--dry-run`; the one exception
   is a kernel update the user asked for, see "Updating the kernel in a game"), `kernel restore`, `keys ...`, `assets
   sync|status`, `test --cloud`, `servers`, `report`, `alerts`, `backend setup`, `update`, `doctor` (it probes the key
   and publishes a test message). Don't start `remote-claude` (`typetorch dev`), the analytics server or a tunnel.
   These go in the final list.
3. **Never push.** Local commits on a new branch are fine. Don't rewrite history, don't force anything.
4. **Don't edit TypeTorch itself:** `node_modules/@typetorch/*`, the reference `../template`, or any other TypeTorch
   checkout. Copy from them.
5. **Don't weaken security to make something work:** no new RemoteEvents, `loadstring`, `_G` hooks, disabled guards,
   or settings changes.
6. **Don't change player data formats, DataStore names or keys.** Follow [Player data](../guides/player-data.md) and
   flag everything for the user to test.
7. **Keep ids honest.** Never invent a universe, place, group or user id. Use the user's, or the placeholder `1`, and
   say so in the final list.
8. **Only promise what exists today.** On npm: `@typetorch/framework`, `transformer`, `kernel`, `cli` and
   `dev-server`; the template installs all five with `bun install` (`npx @typetorch/cli` works too). Built and usable:
   kernel deploys that patch only the kernel into the live place (Luau Execution, no download; a copy with `kernel deploy --place-file` when the place doesn't allow saving through the API), the cloud test
   (`typetorch test --cloud`, automatic before prod deploys), `onStop` at server shutdown (kernel 0.3.2), the fleet API
   (`typetorch servers`, `report`, `alerts`) and the optional `AnalyticsEngine` (framework 0.3.0; its backend is
   `@typetorch/backend`, a git repo, not on npm). Owners switching any server in place needs kernel 0.3.4 and
   framework 0.3.2 (both on npm). Dev access lists through `typetorch access push` need kernel 0.3.8 on the servers
   (the signed settings record; 0.3.6-0.3.7 read the old ConfigService key). Cross-server messages
   (`TypeTorch.messaging`), `TypeTorch.servers()`, `TypeTorch.liveConfig` and the loading screen signals need kernel
   0.3.8. `typetorch init` (CLI 0.10) is the guided setup for a new game, and it repairs a game that is already set
   up. It publishes, deploys and asks for keys, so it is the user's to run, never yours: name it in "What you need to
   do". Planned: content packs, the typed asset map from files,
   `typetorch test --unit`, `/tt grant`/`revoke`.
9. **No GitHub Actions, ever** (the owner's rule: they are a supply-chain risk). Don't add `.github/workflows`, actions,
   or any hosted CI, and don't suggest them. Builds, cloud tests and deploys run on the user's machine.

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
   third-party networking (Zap, Blink, ByteNet), MessagingService topics (move them to `TypeTorch.messaging`, see
   [migrate](../getting-started/migrate.md#cross-server-messages)), anything you can't convert.
5. **User actions:** filled in at the end (Step 7).

Log every step in `MIGRATION_NOTES.md` as you go: what changed, the build result, open questions.

## Step 3: Add the TypeTorch toolchain

Work on a new branch: `git switch -c typetorch-migration`, from a clean tree (commit or stash the user's changes
first; ask if unsure).

### 3.1 The template as reference

Every TypeTorch package comes from npm; the only checkout you need is the template, **next to** the game repo, to
copy files from:

```text
<workspace>/
  my-game/       the user's game (this repo)
  template/      https://github.com/typetorch/template    (the reference: copy its files, never edit it)
```

If it is missing, clone it from the game folder (ask first if your environment needs approval for downloads):

```sh
git clone https://github.com/typetorch/template ../template
```

**The template decides the toolchain.** Its `package.json`, `tsconfig.json`, `default.project.json` and
`studio.project.json` always match the framework of the same date. Copy from them; don't type versions from memory.

- **Today:** no Flamework. `@typetorch/framework` and `@typetorch/kernel` are dependencies; `@typetorch/transformer`
  (the compiler plugin), `@typetorch/cli` and `@typetorch/dev-server` are devDependencies, all from npm. `Modding`,
  `Reflect` and `t` come from `@typetorch/framework`.
- If the template you find still depends on `@flamework/core`, `rbxts-transformer-flamework` or
  `file:.typetorch/packages/*.tgz` entries (an older checkout), `git pull` it first.
- The template's `scripts/packages.ts` (`bun run packages`, and the `packages` and `postinstall` scripts) is an
  optional local override for framework, kernel or transformer changes that aren't on npm yet. Don't copy it unless
  the user asks for that; see
  [fresh setup: unreleased changes](../getting-started/fresh-setup.md#unreleased-framework-or-kernel-changes-optional).

### 3.2 Tools

- **Bun 1.3+** is the package manager. If the project uses npm, pnpm or yarn, run `bun install`, then delete the old
  lockfile. Mixing package managers breaks `rbxtsc`.
- The CLI and the dev-server need no separate install: they are devDependencies (3.3). Run the CLI with
  `bun run typetorch <command>`.
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
"typetorch": "typetorch"
```

- `build` must end with `rbxtsc` (the CLI appends `-p` for prod builds).
- Today the template's dependencies include `@typetorch/framework` and `@typetorch/kernel`, and its devDependencies
  `@typetorch/transformer`, `@typetorch/cli` and `@typetorch/dev-server`, all npm versions (`^x.y.z`); also
  `@rbxts/t` (generated guards import it), `@rbxts/trove`, `rbxts-transform-debug` `2.2.0` exactly, roblox-ts 3,
  TypeScript `5.5.3` (also in `overrides`).
- Leave out the template's `packages` and `postinstall` scripts (the optional local override, 3.1). A `postinstall`
  without `scripts/packages.ts` makes `bun install` fail.
- Remove packages the migration replaces (Knit, `@rbxts/net`, all `@flamework/*`, `rbxts-transformer-flamework`) once
  no code imports them (Step 4.2).

Copy the build script and the Studio project, then install:

```sh
mkdir -p scripts
cp ../template/scripts/build-info.ts scripts/build-info.ts
cp ../template/studio.project.json studio.project.json
bun install
```

PowerShell: `New-Item -ItemType Directory -Force scripts` and `Copy-Item <from> <to>` instead of `mkdir -p` and `cp`.

**Check:** `node_modules/@typetorch/framework/out/init.luau`, `node_modules/@typetorch/kernel/place.project.json` and
`node_modules/@typetorch/transformer/out/index.js` exist, and `bun run typetorch --help` prints
`typetorch <version>: hot-swap roblox-ts game code on live Roblox servers`.

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
- `members`: `{}` unless the user gave user ids; each is `"owner"` or `"dev"` (an old `"admin"` counts as dev). The
  experience's creator (or the owning group's owner) is always an owner. Servers see `members`, `revoked` and
  `devBadgeId` only after the user runs `bun run typetorch access push` (kernel 0.3.8+; it signs with the prod keys):
  put it in the user's list whenever you add or change them.
- `approval: "prod"`: dev deploys go out at once, prod ones wait for the user's y/N.
- Optional (kernel 0.3.7+), only after the dev soak in step 11 shows a need:
  - `"health": { "errors": 3, "window": 30 }`: a server rolls a new build back at `errors` (1-100) errors from it
    within `window` seconds (5-300) of start. `"rollback": false` turns that off; `"prod"` / `"dev"` override per
    channel.
  - `"autoRollback": { "failedPct": 20 }`: `deploy --wait` rolls the branch back at this % of failed servers (1-100).
  - Raise them only to match errors the user can't fix yet; say so in MIGRATION_NOTES.md.
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

**Flamework projects: run the codemod first.** On a clean tree after Step 3, `bun run typetorch migrate --from
flamework --dry-run`, then without `--dry-run`: it makes 4.1, 4.2 and the networking part of 4.4 (call sites stay,
through `createFlameworkCompat`) and writes `typetorch-migrate-report.md`. Commit that as one step, then work through
the report's flagged items with 4.3 and the rest of this step; keep the report's counts in `MIGRATION_NOTES.md`. Local
only, no keys. See [Coming from Flamework](../guides/from-flamework.md).

### 4.1 Entry points

Move what each `*.server.ts` / `*.client.ts` does into modules, then delete the script (`git rm`). Delete
`Flamework.addPaths(...)`, `Flamework.ignite()`, `Knit.Start()` and hand-written bootstrappers. A Script or LocalScript
left in the payload fails `typetorch build` with "the payload may hold only Folders and ModuleScripts".

### 4.2 Services and controllers → modules

| Old | TypeTorch |
|---|---|
| Flamework `@Service()` / `@Controller()` | `@Service()` / `@Controller()` from `@typetorch/framework`; the class `extends Module`; a constructor calls `super()` |
| Flamework `OnInit`, `OnStart`, `OnTick`, `OnPhysics`, `OnRender` | the same names from `@typetorch/framework` |
| Flamework `Dependency<T>()` | constructor injection in a module; `Dependency<T>()` from `@typetorch/framework` everywhere else (methods, plain classes, command handlers), from `onInit` on |
| a dependency cycle (A injects B, B injects A) | `Lazy<T>` on one side (a field `= Lazy<T>()`, or a constructor parameter with transformer 0.2.1+), or `Dependency<T>()` in a method |
| `Modding`, `Reflect`, `t` from `@flamework/core` | the same names from `@typetorch/framework` |
| custom decorators (`Modding.createDecorator`, `@metadata flamework:parameters injectable`) | `Modding.createDecorator` from `@typetorch/framework`, `@metadata typetorch:parameters injectable` |
| Flamework `@Component` / `@flamework/components` | a module using `observeElement(this.trove, tag, …)` or `@rbxts/observers` |
| Flamework `Flamework.createGuard<T>()`, `Flamework.id<T>()` | `t` guards written by hand, or a user macro (transformer README "Migrating from Flamework"); note it for the user |
| Knit `CreateService({ Name, Client, KnitInit, KnitStart })` | `@Service()` class; `KnitInit` → `onInit`, `KnitStart` → `onStart`, `Client` → network leaves |
| Knit `Knit.GetService("X")` / `GetController` | constructor injection, or `Dependency<X>()` in a method |
| singleton module with top-level state | a `@Service()` / `@Controller()` class; state on the instance or in `persist` |
| shutdown cleanup | `onStop` (reverse order; the kernel gives a stopping generation 5 s) and the trove |

- Server modules go in `src/server/services/`, client modules in `src/client/controllers/` (subfolders are fine);
  kebab-case names (`coin.service.ts`).
- Import only from `@typetorch/framework`: `Module`, `Service`, `Controller`, `OnInit`, `OnStart`, `OnStop`, `OnTick`,
  `OnPhysics`, `OnRender`, `OnPlayerAdded`, `TypeTorch`, `Dependency`, `Lazy`, `createNetwork`, `observePlayers`,
  `observeElement`, `isRealFrame`, `popIn`, `popOut`, `bump`,
  `PopupQueue`, `hotAsset`, `setNetworkLimits`, and `Modding`, `Reflect`, `t` for your own macros and decorators.
- **If the project uses Flamework,** the migration is mostly a swap: the decorators, constructor injection,
  `Dependency<T>()` and the lifecycle interfaces keep their names, so change the imports to `@typetorch/framework`,
  add `extends Module` and `super()`, and do the swap-safety pass (4.3). The rest is the toolchain (Step 3),
  `createNetwork` for `@flamework/networking` (4.4) and observers for components. `Dependency<T>()` is the cycle
  breaker (with `Lazy<T>`) and the way plain classes reach modules; it works from `onInit` on, so move every call in a
  constructor, a field initializer or at the top level of a module (`const X = Dependency<X>()` in a command file) into
  a method or `onInit`. Keep `import type` for the class. Then:
  - no file under `src/` imports `@flamework/*`: `git grep -n "@flamework/" -- src` prints nothing;
  - remove `@flamework/*` and `rbxts-transformer-flamework` from `package.json` (`bun remove ...`);
  - type ids changed format (`@typetorch/framework:decorators@Service`, `server/services/x@X`): anything the game
    saved under Flamework ids (`Flamework.id<T>()`) won't match. Flag it under data.
- No work in constructors (`this.trove` and `this.ctx` arrive right after).
- `onInit` runs in dependency order and may yield briefly (a swap allows about 20 s for the whole generation to be
  ready, a new server's boot only about 6 s); move slow loading to `onStart`, which is spawned per module inside its
  trove.

### 4.3 Swap-safety pass (every module)

Every module must be stoppable and restartable: a deploy stops it and starts a fresh copy in the same server.

1. **Everything in the trove:** `this.trove.connect(signal, fn)`, `this.trove.add(instance)`,
   `this.trove.add(network.server.x.y.on(...))`, `this.trove.add(TypeTorch.onSwapOut(...))`. **No cleanup touches a
   trove:** a function added to a trove must never call `trove.remove`, `add` or `extend` (Trove throws "Cannot call
   trove.remove() while cleaning"; before framework 0.5.2 that aborts the whole generation stop and leaves the old
   generation alive). Delete lines like `this.trove.add(() => this.trove.remove(child))`: a child from
   `trove.extend()` is cleaned by its parent anyway. Audit:
   `git grep -nE "trove\.add\(\(\) =>.*\.(remove|add|extend)\(" -- src`, then read every cleanup function by hand.
2. **No module-level state or side effects.** Constants may stay. Per-generation state goes on the instance. State that
   must survive a swap goes in `this.ctx.persist("key.v1", () => init)`, plain data only (tables, Maps, Sets of
   strings, numbers, booleans, Players); never functions, class instances, Promises, threads, connections, charm atoms
   or Instances the generation made. Version the key. Per-player maps (cooldowns, states, sessions):
   `this.ctx.playerState("key.v1", (player) => init)` (`get`/`set`/`has`/`delete`, persisted, removed on a real leave).
   **`this.ctx` and `Dependency<T>()` only from `onInit` on:** a field initializer
   (`private state = this.ctx.persist(...)`) or a constructor fails, because `ctx` is attached after construction.
   Declare the field and assign it in `onInit`.
3. **Players through `onPlayerAdded(player, playerTrove)` or `observePlayers(this.trove, …)`**, never
   `Players.PlayerAdded.Connect`. They replay everyone on every swap, so **join handlers must be idempotent**: guard
   one-time effects (join rewards, welcome popups, "joined" analytics) with a persisted set. Work for real leaves only:
   `this.trove.connect(Players.PlayerRemoving, …)` (a `playerTrove` is also cleaned on every swap).
4. **Tags and characters through observers:** `observeElement(this.trove, tag, (instance, elementTrove) => …)`, or
   `@rbxts/observers` with its stop function in the trove (`this.trove.add(Observers.observeCharacter(…))`), or (characters, no extra package) `player.Character` plus
   `playerTrove.connect(player.CharacterAdded, …)`.
5. **No global connections or loops outside troves.** A loop directly in `onStart` is fine. Elsewhere:
   `this.trove.add(task.spawn(() => { … }))`. Prefer `onTick` for per-frame work.
6. **No `_G` or `shared`:** constructor injection, or `persist`.
7. **`task.spawn`/`delay`/`defer` only through the trove:** `this.trove.add(task.delay(5, fn))`. Replace deprecated
   `spawn`, `delay`, `wait` with `task.*`.
8. **Instances in the world** that a module creates go in its trove (or an observer's cleanup).
   **Libraries with module-level setup** (connections, ScreenGuis, steppers, pending Promise chains created when the
   module is required; Vide's Heartbeat stepper and TopbarPlus are known ones) leak one copy per swap. Check each
   package's top level. Fix: drive it from the trove
   (`this.trove.connect(RunService.Heartbeat, (dt) => vide.step(dt))`), or load it once outside the payload (a place script requires it from `ReplicatedStorage.lib`, or the first
   generation clones it there). See migrate rule 9.
9. **Looped animations and cutscenes** stop on every client swap. Persist plain data (`{ id, animationId, startedAt }`,
   `{ startedAt, endsAt }`) and resume in the next generation (`track.TimePosition = elapsed`); derive idles from synced
   state. Flag minigames for the user: persist their inputs, restart the rest. See migrate section 7.
10. **Shutdown:** kernel 0.3.2+ runs every module's `onStop` when the server shuts down, but not when it shuts down in
    the middle of a swap (no generation is running then). So `onStop` is for short extras, never the only place player
    data is saved: data goes through the library in the place (4.6), or is written as it changes. Remove
    `game.BindToClose` handlers that only did cleanup; any that must stay bind at most once per server (a persisted
    flag). On a swap, `TypeTorch.onSwapOut` runs first, before any `onStop` or trove cleanup: last-resort work (save
    into `persist`, flush) goes there.

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
- `@rbxts/net`, `@flamework/networking`, Zap, Blink, ByteNet: convert to `createNetwork`. Flamework names: `connect` →
  `on`, `setCallback` → `handle`, `broadcast` → `fireAll`, `except` → `fireExcept`, `predict` → `emit` (runs the local
  `on` handlers, no traffic), `invokeWithTimeout(seconds, …)` keeps its name; check the unit (seconds, 0.5 to 120: a
  Flamework call with `5000` meant milliseconds by mistake). The codemod doesn't change the arguments: audit every call
  with `git grep -n "invokeWithTimeout(" -- src` and turn values above 120 into seconds. A leaf's default timeout:
  `setNetworkLimits({ "x.y": { timeout: 30 } })` in `src/shared/net.ts` (the client reads it).
- A big Flamework network can stay on `createFlameworkCompat` (the codemod's default) and move to `createNetwork`
  later (`typetorch migrate --from flamework --net native`); `typetorch build` reminds you while it is in use.

### 4.5 UI

- Code-built UI: build it in a controller; `this.trove.add(screenGui)`.
- Studio-built UI stays in the place (StarterGui): tag what code touches (`Element:<Area>.<Name>`), drive it with
  `observeElement`. The payload can't carry ScreenGuis.
- charm atoms live per generation; persist their plain values if they must survive a swap. charm-sync: the recipe in
  [State with charm](../guides/state.md) (server atoms from persist, a `createNetwork` leaf, hydrate request in onStart).
- React/Roact/Vide: mount in a controller, `this.trove.add(() => root.unmount())`.
- `popIn`/`popOut`/`bump` (UIScale, never tweened `Size`); one `PopupQueue` for modals.
- Update notices: `TypeTorch.onUpdatePending` fires before every hot swap, and players stay in the server. Never show
  "migrating server" there; show "updating in N s" or nothing, and announce the result from `TypeTorch.startInfo` in
  `onStart` ([Runtime API](../guides/runtime-api.md#what-to-tell-players)).

### 4.6 Player data (always flag it)

Player data is game code. The swap-safe pattern ([Player data](../guides/player-data.md)): the library lives in the
place (for example `ServerStorage.Packages.ProfileStore`) with a small host Script that requires it first; session
handles live in `persist`; load on join (re-attach after a swap), release on a real leave.

| The project uses | Do |
|---|---|
| ProfileStore / ProfileService | rewrite the data module as the guide's `DataService` for that library (same store names and keys, a `_dev` name for non-prod channels; loads, saves and releases as DataHost jobs, or with `TypeTorch.runDetached` on kernel 0.3.8+: the guide's two options); the place copy and the `DataHost` Script are **user steps** (Studio) |
| plain DataStores, small per-player values | keep them in the payload: read once per join, `UpdateAsync` on change, pending writes in `persist` (like the template's `BestService`) |
| anything else (DataStore2, Lapis, custom sessions) | wrap it in a `@Service()` unchanged, and write in `MIGRATION_NOTES.md` that it must move to the place and follow the pattern before prod |

Never rename stores or change the data shape. Always put "test data across two deploys on a dev branch" in the user's
list.

- **The cloud test:** keep the guide's line `if (Workspace.GetAttribute("TypeTorchTest") === true) return undefined;`
  in `profileStore()`. The place's `DataHost` never runs in the test, so without it `onInit` waits 10 s, fails, and
  every prod deploy is refused. Wrapped libraries follow the same rule: never wait on a place script in the test.
- **Developer products:** `ProcessReceipt` records the PurchaseId in the player's profile together with the grant and
  returns `PurchaseGranted` only once a save holds it (the guide's `grantOnce` and `ReceiptService`). Never only in
  `persist`. Put "buy a product while a deploy runs" in the user's list.

**The cloud test runs game code against the live game's data.** Every prod deploy boots the build in a headless Luau
Execution task: `onInit` and `onStart` of every module, with the real DataStores, MemoryStores, MessagingService and
HTTP, no players, no place scripts. `TypeTorch.channel` is `dev` there (CLI 0.7.3+), so stores split by channel
point at dev data; unsplit stores don't. The `AnalyticsEngine` sends nothing from the test (framework after 0.3.2).
`workspace:GetAttribute("TypeTorchTest")` is true there. Guard with it, and list each guard in `MIGRATION_NOTES.md`:

- global resets and one-time jobs (season rollovers, leaderboard wipes, shared-key migrations);
- raw MessagingService publishes (cross-server announcements, "server started" pings; `TypeTorch.messaging.publish`
  already does nothing there);
- "server started" rows in DataStores or MemoryStores, webhooks, the game's own HTTP APIs;
- waits on place scripts.

Guard only side effects; the test is useful because it boots the real code. Details:
[migrate: the cloud test runs your game code](../getting-started/migrate.md#the-cloud-test-runs-your-game-code).

### 4.7 Place content, assets and scripts that stay

- The place keeps: the kernel, maps, terrain, lighting, StarterGui layouts, StarterPlayer/StarterCharacter scripts,
  third-party Luau systems, the data library and its host Script. They change with a place publish and a restart.
- Hard-coded asset ids keep working (owned by or shared with the experience owner).
- **Hot assets** (optional; only if the user asks, or mention it in the report): code that clones templates can use
  `hotAsset("tools/sword", template)` (the second argument keeps today's template as the fallback). Marking templates
  with `TypeTorchAsset` and `typetorch assets sync` are user steps. See [Hot assets](../guides/hot-assets.md).
- Never suggest `typetorch kernel deploy --replace-place` for a place with Studio content. The kernel goes in with
  `kernel deploy --install` (a user step, Step 7; with `--place-file <copy>` when the place doesn't allow saving through the
  API) or by hand in Studio.

### 4.8 Analytics (optional)

TypeTorch's own analytics ([Analytics](../guides/analytics.md)) is optional: an `AnalyticsEngine` created on the server
and the client logs sessions, devices, tech health, zones and new players' first sessions; game code adds `step`,
`purchase`, `currency`, `state` and `track`. The engine starts on the first `new AnalyticsEngine()`: create it in a
low-`loadOrder` module's `onInit`, not in a helper that first runs on a game event (an idle server would send
nothing). Add it only if the user asks (or mention it in the report). Keep an existing analytics SDK as it is. Its
backend (a DuckDB server or Cloudflare Basin, tokens, the settings key) is a user step.

### 4.9 Logging (optional)

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
- write a key or token anywhere; run `typetorch keys ...`, `doctor`, `deploy`, `upload`, `approve`, `promote`,
  `rollback`, `pin`, `settings ...`, `access push`, `assets sync|status`, `kernel deploy`, `kernel restore`,
  `deployments`, `branch ls`, `test --cloud`, `servers`, `report`, `alerts`, `backend setup`, `update`;
- publish a place; edit the place in Studio (kernel install, data library, `TypeTorchAsset` marks);
- start `remote-claude`, the analytics server or a tunnel; write the analytics settings;
- push to a remote; add GitHub Actions or any CI workflow.

## Step 7: Finish with "What you need to do"

End with this list, filled in for the project (drop what doesn't apply). Also append it to `MIGRATION_NOTES.md`.

```markdown
## What you need to do

1. **Fill in the ids** in `typetorch.json` (replace the placeholder `1`s): `universeId`, `placeId`, and
   `creator.groupId` (or `creator.userId`). Creator Hub > Creations > your experience > "..." > Copy Universe ID /
   Copy Start Place ID. Optional: other people's user ids in `members` (`"owner"` or `"dev"`; you, the experience
   owner, are always an owner), then `bun run typetorch access push` after step 5, and again after every change to
   `members`, `revoked` or `devBadgeId` (it needs the signing keys). Servers see the lists only after that, on kernel
   0.3.8+; `deploy` and `doctor` warn when they were never pushed or changed since.
2. **Experience settings** (Studio > File > Game Settings > Security, as the owner): Allow HTTP Requests on; Enable
   Studio Access to API Services on. Optional: Allow Mesh / Image APIs (Claude images), Allow Loading Third Party
   Assets (Toolbox inserts).
3. **Create an Open Cloud API key** (Creator Hub > Open Cloud > API Keys, as the group owner or a member allowed to
   upload and publish for the group), for this experience:
   - `asset:read`, `asset:write`; Luau Execution `universe.place.luau-execution-session:read` and `:write` (the cloud
     test that runs before every prod deploy, hot assets, doctor's place check)
   - `universe-messaging-service:publish`
   - DataStore `universe-datastores.objects:read`, `:create` and `:update` (the shared deploy number: every machine
     takes `#seq` from the game's DataStore; and the signed settings record: `access push`, `backend setup`,
     `settings ...`)
   - place publishing (`universe-places` write; the CLI says `universe.place:write`), only for `kernel deploy`
   Set an expiry and, if you can, an IP allowlist. No `universe:write` / `universe:read` (TypeTorch keeps nothing in
   ConfigService since kernel 0.3.8). Don't ask for `legacy-asset:manage` (place downloads): Creator Hub doesn't offer
   it for API keys today. Deploys work without it: `kernel deploy` patches the place through Luau Execution when the place allows saving through
   the API, and takes a copy of the place otherwise (`--place-file`, see "Updating the kernel in a game").
4. **Put it in the game repo's `.env`:** the line `OPENCLOUD_API_KEY=<key>` (gitignored; CLI 0.9 reads the keys from there:
   `OPENCLOUD_API_KEY`, and `TYPETORCH_API_KEY` and `TYPETORCH_ADMIN_TOKEN` for the backend). Never commit it or paste it
   into chat.
5. **Check:** `bun run typetorch doctor`. Expect `ok` for the tools, `typetorch.json`, each key and the scopes you added.
6. **Prod signing keys:** `bun run typetorch keys init`, `bun run typetorch keys init --fallback`, commit
   `typetorch.json`. Back up `~/.config/typetorch/keys/<universeId>.key`, `.fallback.key` and the game repo's `.env` offline,
   and plan a rotation drill ([Prod signing: back up and drill](https://github.com/typetorch/docs/blob/main/guides/prod-signing.md#back-up-and-drill)).
7. **Put the kernel in the place** (needs a place publish and a restart):
   - empty or new place: `bun run typetorch kernel deploy --dry-run`, then
     `bun run typetorch kernel deploy --replace-place --yes`;
   - place with Studio content (never `--replace-place`, it wipes the place): `bun run typetorch kernel deploy --dry-run
     --install` patches the live place through Luau Execution, with no download, when the place allows saving through the API
     (Creator Hub > Permissions: "Allow place to be updated using Save Place API"; off by default for places made in Studio).
     Read the summary (only the kernel folders and the kernel's settings may change), then the same command without
     `--dry-run` publishes after a y/N. Undo: `kernel restore --version <the version before>`. Otherwise: File > Download a
     Copy (a binary `.rbxl`), note its place version, and run `bun run typetorch kernel deploy --dry-run --install
     --place-file <file> --base <version>`; the same command without `--dry-run` publishes after a y/N, and
     `kernel restore <file>` undoes it. (Or
     by hand: `kernel deploy --dry-run`, open `.typetorch/place.rbxl` in Studio, copy
     `ServerScriptService.TypeTorchKernel`, `ReplicatedStorage.TypeTorchKernelShared` and
     `ReplicatedFirst.TypeTorchKernelClient` into your place, File > Publish to Roblox.) The kernel waits idle until
     the first deploy.
   - `ServerScriptService.LoadStringEnabled`: keep it **off** in this game. Turn it on only in a test place where you
     want remote-claude's `run_luau` (`kernel deploy --loadstring`, CLI 0.7.5+). `kernel deploy` patches leave it as it
     is (older CLIs, up to 0.7.2, turn it on: check it in Studio); `doctor` reports it.
   - then, in Studio, remove the old scripts listed in MIGRATION_NOTES.md and publish, just before the first deploy.
8. **Player data** (if listed in MIGRATION_NOTES.md): in Studio put the library at `ServerStorage.Packages.<Name>` and
   add the `ServerScriptService.DataHost` Script from the Player data guide; publish.
9. **Test locally in Studio:** `bun run watch` and `bun run studio` (two terminals), connect the Rojo plugin, Play.
   Server > Status shows "Studio: local payload". Use the dev menu's Reload to test a swap.
10. **Check the kernel live:** join the game; F9 > Server shows `[TypeTorch] kernel <version> (API 1) on a public
    server, branch prod, signed deploys only (keys: key asset)`. `/tt status` answers.
11. **Dev branch:** `git switch -c dev`, `bun run typetorch deploy`, then `/tt new dev` in game. Earn some data, deploy
    again twice while playing, rejoin: nothing lost. Developer products: buy one while a deploy runs; one grant, also
    after a rejoin. `bun run typetorch test --cloud` passes on the dev build (prod deploys run the same test).
    After each deploy, ask the user for the dev menu's Server > Status line "Health window: n/3 errors" (errors from
    the new build in its first 30 s). 3 rolls every server back: fix those errors, or set `typetorch.json` `"health"`
    above the count (3.7) and rebuild.
12. **First prod deploy:** a game with live players goes through the
    [go-live checklist](https://github.com/typetorch/docs/blob/main/guides/go-live-checklist.md) first (a copy of the
    game, a dev-branch soak, a planned cut-over). Merge into `main`, stay in the game, `bun run typetorch deploy` (the
    cloud test runs, then y/N, then signed). Expect `deployed #N prod@<commit> -> <artifact id>`; the dev menu's
    Artifact tab shows two verified badges.
13. **Rollback drill:** `bun run typetorch rollback --branch prod`, check `bun run typetorch deployments`, deploy again.
14. Optional: [live servers and alerts](https://github.com/typetorch/docs/blob/main/guides/fleet-and-alerts.md)
    (`typetorch backend setup`, then `servers`, `report`, `alerts`, and automatic rollback after bad deploys);
    [analytics](https://github.com/typetorch/docs/blob/main/guides/analytics.md);
    [hot assets](https://github.com/typetorch/docs/blob/main/guides/hot-assets.md);
    [remote-claude](https://github.com/typetorch/docs/blob/main/guides/remote-claude.md) (in a test place: it needs
    `LoadStringEnabled` for `run_luau`).
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

## Updating the kernel in a game (agents)

Only when the user asks for a kernel update (a new `@typetorch/kernel` version). Kernel updates stay manual: the
kernel lives in the place, so it changes with a place publish and new servers. This is the one flow where you run
`kernel deploy`, and you publish only after the user's OK in chat.

1. **You run a dry run:** `bun run typetorch kernel deploy --dry-run`. It patches only the kernel folders and the kernel's
   settings into the place's newest version (which must be published), checks that everything else is unchanged, and saves
   nothing. Read the summary (kernel old -> new, scripts changed per folder, settings, references); anything outside the
   kernel changing is a stop.
2. **Show the user the summary and ask.** After their yes: `bun run typetorch kernel deploy --yes`. It saves and publishes
   through Luau Execution, with no download. It needs the place setting "Allow place to be updated using Save Place API" on,
   and no Team Create session. It refuses if someone published meanwhile. Undo: `bun run typetorch kernel restore --version
   <the version before>`.
3. **If the place doesn't allow saving through the API** (a Studio-made place with that setting off), the user downloads a copy
   in Studio (File > Download a Copy, a binary `.rbxl`) and tells you the file and the place version it came from. Run
   `bun run typetorch kernel deploy --dry-run --place-file <file> --base <version>`, and after the user's yes the same command
   without `--dry-run` plus `--yes`. Keep the copy: `bun run typetorch kernel restore <file>` publishes it back (undo).
4. **Or, with the Roblox Studio MCP and the place open:** replace the kernel instances in Studio
   (`ServerScriptService.TypeTorchKernel`, `ReplicatedStorage.TypeTorchKernelShared`,
   `ReplicatedFirst.TypeTorchKernelClient`, as `node_modules/@typetorch/kernel/place.project.json` lays them out, with
   the sources from `node_modules/@typetorch/kernel/src`; keep the folders' attributes such as `KeyAssetId`), then the
   user publishes from Studio (File > Publish to Roblox).
5. **Check a fresh server boots the new kernel:** the user joins a new server (old ones keep the old kernel until they
   close); F9 > Server shows `[TypeTorch] kernel <new version>` and `/tt status` answers.

## Fresh setup path

No game yet ("set up typetorch" in an empty folder):

1. From the workspace folder:

   ```sh
   git clone https://github.com/typetorch/template my-game
   cd my-game
   git remote remove origin
   bun install
   rokit install
   ```

   `bun install` gets every `@typetorch/*` package from npm; the template already has the `typetorch` script.
2. In `typetorch.json`: the user's ids (or placeholders `1`), `members` `{}` unless given, and **delete**
   `signingPublicKeys`, `keyAssetId` and `fallbackPublicKey` (they are the template's).
3. Step 5 checks, commit.
4. Step 7 list (skip data, legacy and kernel-copy items: the new place takes `--replace-place`).

## Optional: Claude Code

- Install the skill (works once `typetorch/claude-plugin` is on GitHub): `/plugin marketplace add typetorch/claude-plugin`,
  then `/plugin install typetorch@typetorch`. Run it with `/typetorch:typetorch-migrate`.
- Plan mode fits Steps 1 and 2. Allow `bun run build` and `bun run typetorch build`; keep every Roblox-facing command
  on ask or deny.
- remote-claude runs only on a Claude subscription login, never an API key.
