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
   deployments, branch ls, config push, kernel deploy (not even `--dry-run`), keys, assets sync/status, doctor; no place
   publish; no remote-claude. These are user steps.
3. Never push. Commit locally on `typetorch-migration`.
4. Don't edit `../framework`, `../kernel`, `../transformer`, `../cli`, `../template`: copy from them.
5. No new RemoteEvents, `loadstring`, `_G`, disabled guards or settings changes.
6. Don't change player data formats, store names or keys.
7. Never invent ids: the user's, or placeholder `1`.
8. On npm: `@typetorch/*` and `npx @typetorch/cli`. Planned, never promise: `typetorch init`, kernel patch deploys, content packs,
   CI, `typetorch test`, `/tt grant`, a kernel `onClose`.

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
   - Siblings next to the game: `../framework`, `../kernel`, `../transformer`, `../cli`, `../template` (clone from
     `https://github.com/typetorch/<name>` if missing; `bun install` in framework, transformer and cli).
   - **The template decides**: copy its `package.json` deps/devDeps/overrides (`@typetorch/framework`,
     `@typetorch/kernel` and the devDependency `@typetorch/transformer` as `file:.typetorch/packages/*.tgz`; no
     Flamework), `tsconfig.json` (`include` src only, `typeRoots` `@rbxts` + `@typetorch`,
     `types: ["types","compiler-types"]`, `plugins`: `rbxts-transform-debug` then `@typetorch/transformer`),
     `default.project.json` (payload: a `Model` with `Server`/`Shared`/`Client`/`include`, mapping `@rbxts` and only
     `@typetorch/framework`; keep the old one as `legacy.project.json`), `studio.project.json`, `rokit.toml` (rojo
     7.7.0-rc.1, lune 0.10.5), `scripts/packages.ts`, `scripts/build-info.ts`. Compile only via `bun run build` or
     `bunx rbxtsc` (`npx rbxtsc` runs a placeholder package in Bun projects on Windows).
   - Scripts: `build` = `bun scripts/build-info.ts && rbxtsc`, `watch`, `studio` = `rojo serve studio.project.json`,
     `packages`, `postinstall` = `bun scripts/packages.ts --sync`, `typetorch` = `bun ../cli/src/index.ts`.
   - Bun only (delete other lockfiles). `rokit install`. Then `bun scripts/packages.ts` and `bun install`.
   - `.gitignore`: `node_modules/ out/ include/ *.tsbuildinfo src/shared/build.ts .typetorch/
     .payload.gen.project.json .tsconfig.typetorch.json .env .env.*`.
   - `typetorch.json`: `project`, `universeId`, `placeId`, `creator` (`{groupId}` or `{userId}`: the experience
     owner), `defaultBranch: "prod"`, `branches: {"main": "prod"}`, `channels: {"prod": "prod"}`, `members: {}`,
     `devBadgeId: null`, `approval: "prod"`, `kernel: "node_modules/@typetorch/kernel"`. Never copy the template's
     signing fields.
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
     `createNetwork`, components → observers, `Dependency<T>()` → injection. Then `bun remove` every `@flamework/*` and
     `rbxts-transformer-flamework`, delete `flamework.build`, `flamework.json`, `include/flamework`. Type ids changed
     format: data saved under Flamework ids won't match (flag it). The swap-safety pass is the real work.
   - Swap safety: everything in `this.trove`; no module-level state (instance fields, or
     `this.ctx.persist("key.v1", () => init)` with plain data only); players via `onPlayerAdded(player, playerTrove)` /
     `observePlayers`, idempotent (persisted set for one-time effects), real leaves via
     `this.trove.connect(Players.PlayerRemoving, …)`; tags/characters via `observeElement` or `@rbxts/observers`
     (stop function in the trove); loops only in `onStart` or `this.trove.add(task.spawn(…))`; no `_G`/`shared`;
     `task.*` through the trove; `BindToClose` once per server.
   - Networking: one `src/shared/net.ts` with `createNetwork<ClientToServer, ServerToClient>()`; server
     `.on`/`.handle` (returns `[value]` or `[false, reason]`)/`.fire...`, client `.fire`/`.invoke`/`.on`; every
     disconnect into the trove; delete all remotes; no template literal types.
   - UI: code-built in the trove; Studio-built stays in StarterGui, tagged and driven by `observeElement`; charm atoms
     per generation (persist plain values); `popIn/popOut/bump`; one `PopupQueue`.
   - Player data: the library lives in the place (`ServerStorage.Packages.<Lib>` + a `DataHost` Script, user steps),
     handles in `persist`, load on join, release on real leave, store names split by `TypeTorch.channel`. ProfileStore:
     use the Player data guide's `DataService`. Others: wrap unchanged and flag.
   - Hot assets only if asked: `hotAsset(key, template)`.
5. **Checks:** `bun run build`; `bun run typetorch build` (prints `built <id> ... modules`); `out/shared/net.luau` has
   `t.` guards; the pattern scan prints nothing:
   `git grep -nE "Players\.PlayerAdded\.Connect|new Instance\(\"(Remote|UnreliableRemote)(Event|Function)\"\)|_G\b|@flamework/|Flamework\.(ignite|addPaths)|Knit\.Start" -- src`;
   commit, rebuild: no `-dirty`; `bun run typetorch build --branch prod`; `rojo build studio.project.json -o .typetorch/studio-check.rbxl`.
6. **Stop** at user actions (rule 2).
7. **Finish** with "What you need to do" (numbered, filled in): fill the ids; Game Settings (HTTP on, Studio API access
   on); create the Open Cloud key (`asset:read`, `asset:write`, Luau Execution read/write,
   `universe-messaging-service:publish`, `universe:read` + `universe:write` or neither, place publishing for
   `kernel deploy`); store it in `~/.config/typetorch/<game>.env` as `TYPETORCH_API_KEY=` and put
   `TYPETORCH_ENV_FILE=~/.config/typetorch/<game>.env` in the repo's `.env`; `bun run typetorch doctor`;
   `bun run typetorch keys init` + `keys init --fallback`, commit, back up the key files; kernel into the place (new place:
   `kernel deploy --dry-run` then `--replace-place --yes`; place with content: `kernel deploy --dry-run`, copy the three
   kernel folders from `.typetorch/place.rbxl` in Studio, publish); data library + `DataHost` in the place; test in
   Studio (`bun run watch` + `bun run studio`, Play); check F9 `[TypeTorch] kernel ...`; dev branch deploy + `/tt new dev`
   + two deploys while playing; first prod deploy from `main` (y/N, signed); rollback drill. Then post the report
   (template in AGENTS.md).
