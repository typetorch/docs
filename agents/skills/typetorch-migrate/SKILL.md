---
name: typetorch-migrate
description: Migrate a roblox-ts Roblox game to TypeTorch (hot-swap deploys without server restarts), or set up a new TypeTorch game from the template. Use when the user says "migrate this project to typetorch", "set up typetorch", "convert to typetorch", "add typetorch", "move my game to typetorch", or asks how to make their roblox-ts services hot-swappable with TypeTorch. Does every local step (detect, plan, migrate, build, check the payload) and never touches keys, Roblox or deploys; ends with a "What you need to do" list.
---

# TypeTorch migration

The full playbook is `agents/AGENTS.md` in the TypeTorch docs repo
(https://github.com/typetorch/docs/blob/main/agents/AGENTS.md). Read it when you can; this file carries the essentials.
Before/after code for every pattern: https://github.com/typetorch/docs/blob/main/getting-started/migrate.md.

## Rules

1. Never create, ask for, read, print or store secrets: Open Cloud keys, signing key files
   (`~/.config/typetorch/keys/*`), pairing codes. Don't open `.env` or the file named by `TYPETORCH_ENV_FILE`.
2. Never act on Roblox: no `typetorch` upload, deploy (not even `--dry-run`), promote, rollback, approve, reject, pin,
   deployments, branch ls, settings, access push, kernel deploy (not even `--dry-run`, except a kernel update the
   user asked for: see "Kernel updates"), kernel restore, keys, assets sync/status, test --cloud, servers, report,
   alerts, backend setup, update, doctor; no place publish; no remote-claude (`typetorch dev`), analytics server or
   tunnel. These are user steps.
3. Never push. Commit locally on `typetorch-migration`.
4. Don't edit `node_modules/@typetorch/*`, the reference `../template` or any TypeTorch checkout: copy from them.
5. No new RemoteEvents, `loadstring`, `_G`, disabled guards or settings changes.
6. Don't change player data formats, store names or keys.
7. Never invent ids: the user's, or placeholder `1`.
8. On npm: every `@typetorch/*` package except analytics (`bun install` in the template gets them; `npx
   @typetorch/cli` works too). Built: kernel patch deploys (`kernel deploy`, or `--place-file`), the cloud test before prod
   deploys, `onStop` at shutdown (kernel 0.3.2), the fleet API, the optional `AnalyticsEngine`, `typetorch access
   push` (CLI 0.7.3+; servers read it from kernel 0.3.6). Planned, never promise: `typetorch init`, content
   packs, `typetorch test --unit`, `/tt grant`.
9. No GitHub Actions, ever (the owner's rule): never add `.github/workflows`, actions or hosted CI, never suggest
   them.

## Procedure

1. **Detect.** roblox-ts? (`package.json` with `roblox-ts`, `tsconfig.json`, `.ts`). Plain Luau → stop: "TypeTorch is
   roblox-ts only." Empty folder → fresh setup (AGENTS.md "Fresh setup path"). Find: framework (Flamework, Knit,
   singletons), every `*.server.ts`/`*.client.ts`, the Rojo layout, and with `git grep -nE "<pattern>" -- src`:
   `PlayerAdded|PlayerRemoving|CharacterAdded`, remotes (`RemoteEvent|RemoteFunction|OnServerEvent|@rbxts/net|@flamework/networking`),
   tags (`CollectionService|@flamework/components`), loops and threads (`while \(true\)|task\.(spawn|delay|defer)|Heartbeat`),
   `_G|shared\.`, data (`DataStoreService|ProfileStore|ProfileService`), `BindToClose`, UI, `:Clone()` of templates.
2. **Plan.** Write `MIGRATION_NOTES.md` (inventory, old → new mapping, order of commits, risks: player data always,
   place content, third-party networking), show it, continue unless told to wait. Log every step there.
3. **Toolchain** (branch `typetorch-migration`):
   - The reference template next to the game: `../template` (clone https://github.com/typetorch/template there if
     missing). Every `@typetorch/*` package comes from npm; no other checkouts.
   - **The template decides**: copy its `package.json` deps/devDeps/overrides (`@typetorch/framework`,
     `@typetorch/kernel`, devDependencies `@typetorch/transformer`, `@typetorch/cli`, `@typetorch/dev-server`, all npm
     versions; no Flamework), `tsconfig.json` (`include` src only, `typeRoots` `@rbxts` + `@typetorch`,
     `types: ["types","compiler-types"]`, `plugins`: `rbxts-transform-debug` then `@typetorch/transformer`),
     `default.project.json` (payload: a `Model` with `Server`/`Shared`/`Client`/`include`, mapping `@rbxts` and only
     `@typetorch/framework`; keep the old one as `legacy.project.json`), `studio.project.json`, `rokit.toml` (rojo
     7.7.0-rc.1, lune 0.10.5), `scripts/build-info.ts`. Compile only via `bun run build` or `bunx rbxtsc`
     (`npx rbxtsc` runs a placeholder package in Bun projects on Windows).
   - Scripts: `build` = `bun scripts/build-info.ts && rbxtsc`, `watch`, `studio` = `rojo serve studio.project.json`,
     `typetorch` = `typetorch`. Leave out `packages`, `postinstall` and `scripts/packages.ts` (an optional local
     override for unreleased framework/kernel changes; only if the user asks).
   - Bun only (delete other lockfiles). `rokit install`, then `bun install`.
   - `.gitignore`: `node_modules/ out/ include/ *.tsbuildinfo src/shared/build.ts .typetorch/
     .payload.gen.project.json .tsconfig.typetorch.json .env .env.*`.
   - `typetorch.json`: `project`, `universeId`, `placeId`, `creator` (`{groupId}` or `{userId}`: the experience
     owner), `defaultBranch: "prod"`, `branches: {"main": "prod"}`, `channels: {"prod": "prod"}`, `members: {}`,
     `devBadgeId: null`, `approval: "prod"`, `kernel: "node_modules/@typetorch/kernel"`. Never copy the template's
     signing fields. Servers see `members`/`revoked`/`devBadgeId` only after the user's `typetorch access push`
     (kernel 0.3.8+): list it whenever they change.
   - `src/server/boot.ts` → `startServer(kernel, { modules: [script.Parent!.FindFirstChild("services")!], build: BUILD })`;
     `src/client/boot.ts` → `startClient(... "controllers" ...)`; `BUILD` from `../shared/build` (generated).
   - `bun run build`, commit. It passes for Knit/plain projects; a Flamework project fails on its `@flamework/core`
     imports ("only npm scopes listed in your typeRoots") until step 4 removes them: expected.
4. **Migrate**, one commit per step, `bun run build` after each:
   - Delete entry scripts, `Flamework.ignite/addPaths`, `Knit.Start`. The payload may hold only Folders and
     ModuleScripts.
   - Services/controllers → `@Service()`/`@Controller()` from `@typetorch/framework`, `extends Module`, constructor
     injection with `super()`. Knit `KnitInit/KnitStart` → `onInit/onStart`; `GetService` → injection.
   - **Flamework projects are mostly a swap:** same decorator and lifecycle names, imports from
     `@typetorch/framework` (also `Modding`, `Reflect`, `t`; custom decorators use
     `@metadata typetorch:parameters injectable`), `extends Module` + `super()`, `@flamework/networking` →
     `createNetwork` (`predict` → `emit`, `invokeWithTimeout` in seconds), components → observers.
     `Dependency<T>()` stays (from `@typetorch/framework`): the
     cycle breaker (with `Lazy<T>`) and the way plain classes reach modules, from `onInit` on; move calls in
     constructors, field initializers and module top level into methods. Then `bun remove` every `@flamework/*` and
     `rbxts-transformer-flamework`, delete `flamework.build`, `flamework.json`, `include/flamework`. Type ids changed
     format: data saved under Flamework ids won't match (flag it). The swap-safety pass is the real work.
   - Swap safety: everything in `this.trove`; no module-level state (instance fields, or
     `this.ctx.persist("key.v1", () => init)` with plain data only; per-player maps via
     `this.ctx.playerState("key.v1", init)`, removed on a real leave); players via `onPlayerAdded(player, playerTrove)` /
     `observePlayers`, idempotent (persisted set for one-time effects), real leaves via
     `this.trove.connect(Players.PlayerRemoving, …)`; tags/characters via `observeElement` or `@rbxts/observers`
     (stop function in the trove); loops only in `onStart` or `this.trove.add(task.spawn(…))`; no `_G`/`shared`;
     `task.*` through the trove; `onStop` runs at shutdown (kernel 0.3.2) but not when a server closes mid-swap, so
     it is for short extras, never the only place data is saved (a `BindToClose` that must stay binds once per
     server); keep `onInit` short (a new server's boot waits about 6 s).
   - Networking: one `src/shared/net.ts` with `createNetwork<ClientToServer, ServerToClient>()`; server
     `.on`/`.handle` (returns `[value]` or `[false, reason]`)/`.fire...`, client `.fire`/`.invoke`/`.on`; every
     disconnect into the trove; delete all remotes; no template literal types.
   - UI: code-built in the trove; Studio-built stays in StarterGui, tagged and driven by `observeElement`; charm atoms
     per generation (persist plain values); `popIn/popOut/bump`; one `PopupQueue`.
   - Player data: the library lives in the place (`ServerStorage.Packages.<Lib>` + a `DataHost` Script, user steps),
     handles in `persist`, load on join, release on real leave, store names split by `TypeTorch.channel`. Library
     loads, saves and releases run as jobs on DataHost's thread (`library.TypeTorchJobs`), or with
     `TypeTorch.runDetached` when the place runs kernel 0.3.8+ (the guide's option B; DataHost then only requires the
     library): a deploy stops the generation's threads mid-call, which jams the library for that player. ProfileStore or ProfileService: use the
     Player data guide's `DataService` for that library (keep its `TypeTorchTest` line: place scripts never run in the
     cloud test, so waiting for `DataHost` there fails every prod deploy). Developer products: the PurchaseId goes into the
     profile with the grant, `PurchaseGranted` only after a save holds it (`grantOnce`), never only `persist`.
     Others: wrap unchanged and flag.
   - The cloud test runs `onInit`/`onStart` against the live game's data (real DataStores, MemoryStores,
     MessagingService, HTTP; no players; `TypeTorch.channel` is `dev` there with CLI 0.7.3 or newer, so only
     channel-split stores point at dev data; the `AnalyticsEngine` sends nothing): guard global resets,
     raw MessagingService publishes and "server started" rows with
     `workspace:GetAttribute("TypeTorchTest")`, and list the guards in `MIGRATION_NOTES.md`. Move MessagingService
     topics to `TypeTorch.messaging.subscribe/publish` (kernel 0.3.8; one kernel-held topic, no re-subscribe per swap,
     dev branches don't reach prod, a no-op in the cloud test); messages stay under 1 KiB.
   - Hot assets only if asked: `hotAsset(key, template)`. Analytics only if asked: `new AnalyticsEngine()` on server
     and client (its backend is a user step).
5. **Checks:** `bun run build`; `bun run typetorch build` (prints `built <id> ... modules`); `out/shared/net.luau` has
   `t.` guards; the pattern scan prints nothing:
   `git grep -nE "Players\.PlayerAdded\.Connect|new Instance\(\"(Remote|UnreliableRemote)(Event|Function)\"\)|_G\b|@flamework/|Flamework\.(ignite|addPaths)|Knit\.Start" -- src`;
   commit, rebuild: no `-dirty`; `bun run typetorch build --branch prod`; `rojo build studio.project.json -o .typetorch/studio-check.rbxl`.
6. **Stop** at user actions (rule 2).
7. **Finish** with "What you need to do" (numbered, filled in): fill the ids; Game Settings (HTTP on, Studio API access
   on); create the Open Cloud key (`asset:read`, `asset:write`, Luau Execution read/write (the cloud test before every
   prod deploy), `universe-messaging-service:publish`, DataStore `universe-datastores.objects:read` + `:create` +
   `:update` (the shared deploy number and the signed settings: `access push`, `backend setup`), and the place key's Luau
   Execution scopes (`universe.place.luau-execution-session:read` and `:write`) plus `asset:read` for `kernel deploy`
   (`universe.place:write` only for a file); no `universe:write` / `universe:read`, and not `legacy-asset:manage`, which API keys
   can't get today; put `OPENCLOUD_API_KEY=` in the game repo's `.env` (gitignored); `bun run typetorch doctor`;
   `bun run typetorch keys init` + `keys init --fallback`, commit, back up the key files and the `.env` offline; members in
   `typetorch.json`, then `bun run typetorch access push` (again after every change); kernel into the place (new place:
   `kernel deploy --dry-run` then `--replace-place --yes`; place with content: `kernel deploy --dry-run --install` patches the
   live place with no download when its "Allow place to be updated using Save Place API" setting is on, else File > Download a
   Copy and `kernel deploy --dry-run --install --place-file <file> --base <version>`; check the summary, then the same without
   `--dry-run`; or copy the three kernel folders from `.typetorch/place.rbxl` in Studio and publish); `ServerScriptService.LoadStringEnabled` off in a
   live game (on only in a test place for remote-claude's `run_luau`; `doctor` reports it); remove the old scripts in
   Studio just before the first deploy; data
   library + `DataHost` in the place; test in Studio (`bun run watch` + `bun run studio`, Play); check F9 `[TypeTorch]
   kernel ...`; dev branch deploy + `/tt new dev` + two deploys while playing (+ a product bought during a deploy;
   after each deploy read Server > Status "Health window: n/3 errors": 3 errors in 30 s roll every server back, so fix
   them or set `typetorch.json` `"health": { "errors": ... }` above the count, kernel 0.3.7+);
   a game with live players: the go-live checklist (docs `guides/go-live-checklist.md`) before the first prod deploy;
   first prod deploy from `main` (cloud test, y/N, signed); rollback drill; optional: the fleet API and analytics.
   Then post the report (template in AGENTS.md).

## Kernel updates (only when the user asks)

Manual, and the one flow where you run `kernel deploy`. Run `bun run typetorch kernel deploy --dry-run` (it patches the kernel
folders and the kernel's settings into the place's newest published version and saves nothing), read the summary (only the
kernel folders may change), show it and ask. After the user's yes, the same command without `--dry-run` plus `--yes` saves and
publishes through Luau Execution, with no download; that needs the place's "Allow place to be updated using Save Place API"
setting on. Undo: `bun run typetorch kernel restore --version <the version before>`. If that setting is off (a Studio-made
place), the user downloads a copy in Studio (File > Download a Copy) and gives you the file and its place version; then
`kernel deploy --dry-run --place-file <file> --base <version>` and, after the user's yes, the same with `--yes` (`kernel restore
<file>` undoes it). Or, with the Roblox Studio MCP and the place open, replace the three kernel folders in Studio from
`node_modules/@typetorch/kernel` and the user publishes from Studio. Then the user joins a fresh server: F9 shows `[TypeTorch] kernel <new version>`. Details:
AGENTS.md "Updating the kernel in a game (agents)".
