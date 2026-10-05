# Troubleshooting

Real errors seen while building and running TypeTorch, and what fixes them. Run `bun run typetorch doctor` first: it
checks the tools, `typetorch.json`, every key and scope, the signing keys, the key asset and the place.

## Setup and builds

**Rojo plugin refuses to connect, or a 7.6.1 server is refused.**
The Studio plugin and `rojo serve` must speak the same protocol. Pin `rojo = "rojo-rbx/rojo@7.7.0-rc.1"` in
`rokit.toml`, run `rokit install`, and check `rojo --version` inside the game folder (a global Rojo may be older).

**`rojo` or `lune` is not found / the wrong version.**
Run `rokit install` in the game folder. `kernel deploy` runs Lune inside the kernel folder, so the game's `rokit.toml`
pins Lune too.

**Bun fails with `EPERM` installing `file:../framework`.**
Bun on Windows can't install a `file:` folder dependency. Use the npm versions (the template's `package.json`), or,
for unreleased changes in a checkout, the template's local override: `bun run packages`
([fresh setup](../getting-started/fresh-setup.md#unreleased-framework-or-kernel-changes-optional)).

**`bun install` fails with `Module not found "scripts/packages.ts"`.**
`package.json` has the template's `postinstall` script but not the script it runs. Copy `scripts/packages.ts` from the
template, or delete the `postinstall` and `packages` scripts (you only need them for the local override).

**The framework in `node_modules` is stale after you pulled a checkout.**
With the local override, `bun install` re-extracts the old tarballs. Run `bun run packages` again (it rebuilds the
framework and the transformer, repacks them and the kernel, and extracts them into `node_modules`). To go back to the
npm versions: `bun run packages --off`.

**The build id ends in `-dirty` right after `bun run packages --off`.**
On Windows with git's `core.autocrlf` on, the reinstall can rewrite `bun.lock` with other line endings.
`git checkout -- bun.lock`.

**`TS2688: Cannot find type definition file for 'kernel'`** (or similar).
`tsconfig.json` needs `"types": ["types", "compiler-types"]`; otherwise the `@typetorch` type root pulls in the kernel
package, which has no typings.

**`Cannot find name 'console'` in `scripts/build-info.ts`** (or another file under `scripts/`).
rbxtsc compiles your scripts folder. Add `"include": ["./src/**/*.ts"]` to `tsconfig.json`.

**`createNetwork: guards were not generated (is @typetorch/transformer in the tsconfig plugins?)`**
The transformer isn't running. `tsconfig.json` `plugins`: `rbxts-transform-debug` first, then
`{ "transform": "@typetorch/transformer" }`; and `@typetorch/transformer` must be in the devDependencies and installed
(`bun install`).

**`You can only use npm scopes that are listed in your typeRoots` on an `@flamework/core` import.**
TypeTorch no longer uses Flamework. Import `Service`, `Controller`, the lifecycle interfaces, `Modding`, `Reflect` and
`t` from `@typetorch/framework` ([Coming from Flamework](../getting-started/migrate.md#coming-from-flamework)).

**`npx rbxtsc` does something unexpected (Windows, Bun project).**
`npx` resolves an unrelated placeholder package there. Use `bun run build`, `bunx rbxtsc`, or
`node node_modules/roblox-ts/out/CLI/cli.js`.

**`X needs Y, which is not a loaded @Service/@Controller`, or `dependency cycle: A -> B -> A`.**
A constructor parameter is not a module of the same realm, its file isn't under the folders `boot.ts` passes in
`modules`, or two modules need each other. Move shared logic into a third module.

**`the payload may hold only Folders and ModuleScripts under one Model root; found: ... (Script)`.**
A `*.server.ts` / `*.client.ts` (or a model file) is in a synced folder. Move its work into a module and delete it.

**`git-ignored files in the payload's source dirs would ship in a "clean" artifact`.**
Something ignored sits under `src/` or another synced folder. Delete it, or stop ignoring it and commit it.

**`compiled files that no tracked source explains`.**
`out/` holds output from a deleted or untracked file. `bun run typetorch build --clean` (deploys always clean), and
commit new files.

**`... does not contain commit abc1234: rbxtsc kept a stale build.ts`.**
Delete `out/` and build again.

**The artifact id ends in `-dirty-...`.**
Uncommitted changes. Commit, then build again for a clean id. Prod-channel branches refuse dirty builds without
`--force`.

## Keys and scopes

**`no Open Cloud API key for assets: set OPENCLOUD_ASSETS_KEY ... or TYPETORCH_API_KEY ...`.**
The CLI found no key. Check `.env` (the `TYPETORCH_ENV_FILE=` line) and the env file it names. `doctor` prints which
files it read.

**A scope probe in `doctor` fails with 401/403.**
Edit the key in Creator Hub and add the missing permission for this experience.

**A deploy stops with a registry write error.**
The key can read the ConfigService registry (`universe:read`, only possible with OAuth today, not an API key) but not
write it. Add `universe:write`, or pass `--no-registry`. The upload is kept: finish it with `bun run typetorch promote`.

**`refusing to publish a kernel that can't verify prod deploys`.**
Run `bun run typetorch keys init` and `bun run typetorch keys init --fallback` first, commit `typetorch.json`, then
`kernel deploy`.

**`kernel deploy` can't download the place (a 401/403 on the place download).**
That needs `legacy-asset:manage`, which API keys can't get today. Download a copy in Studio (File > Download a Copy)
and pass it: `--place-file <file> --base <version>` ([Kernel updates](deploy-and-rollback.md#kernel-updates)).

**`fleet setup` (or writing the analytics settings) fails with 401/403.**
Writing a ConfigService key needs `universe:write` on the deploy key. Nothing is read back: API keys can't read
configs.

## Deploys

**`refusing to deploy a dev-channel artifact ... to prod-channel branch "prod"`.**
You built on a dev branch. Deploy prod from the git branch mapped to it (`main`), or pass `--force` knowingly.
`promote` refuses it even with `--force`: "rebuild for prod".

**`approve` refuses to run.**
It needs an interactive terminal (stdin and stderr). Run it yourself in a terminal, not through an agent or a pipe.

**A deploy left only a proposal.**
The CLI wasn't in an interactive terminal (an agent, CI, the dev-server) or you passed `--propose`.
`bun run typetorch proposals`, then `bun run typetorch approve <id>`.

**Moderation times out.**
The upload is recorded in `uploads.jsonl`. When Roblox approves it: `bun run typetorch promote <branch> <artifact id>`.
`--moderation-timeout <s>` waits longer.

**The cloud test fails.**
Read its errors: they are your build's (an `onInit` or `onStart` that throws, a Shared module that errors, a stop that
times out). Fix and deploy again. Game code that must not run in the test (it runs against real DataStores) can check
`workspace:GetAttribute("TypeTorchTest")`. A missing Luau Execution scope fails it too: add
`universe.place.luau-execution-session:read` and `:write` to the assets key. To publish anyway, knowingly:
`--skip-test "<reason>"`.

**`deploy --wait` rolled the branch back by itself (`auto_rollback`).**
20% or more of the servers that tried the build failed or rolled back. `bun run typetorch report "#<seq>"` shows the
errors and the servers. Fix, then deploy again. `--no-auto-rollback` keeps a build that fails on some servers.

**`deploy --wait` warns about stuck servers (`server_stuck`).**
Some servers didn't pick up the deploy in time and sent nothing. Nothing is rolled back. They poll the head every 60 s;
check again with `bun run typetorch servers --branch <b>`.

**`the fleet API isn't configured` (from `servers`, `report`, `alerts`, or `--wait` skipped).**
Set it up once: [Live servers and alerts](fleet-and-alerts.md#set-it-up). The CLI needs `TYPETORCH_FLEET_TOKEN` and
`TYPETORCH_FLEET_INGEST_TOKEN` in your env file, and `typetorch.json` `fleet.url`.

**Asset names show up as `####` in Creator Hub.**
Roblox's text filter censors some hex names unpredictably. The CLI renames censored payloads to `TypeTorch payload`;
the build's identity is in its attributes, the notes and the deployment log.

**`LoadAsset` fails with an ownership or "not trusted" error.**
`typetorch.json` `creator` must be the experience owner (the group, for a group game). The key's owner needs
permission to upload for that group.

## Live servers

**Servers log `branch prod has no artifact yet; waiting for a deploy`, or (kernel 0.3)
`nothing loaded (no verified, bootstrap or usable stored head); waiting for a signed deploy`.**
Nothing was deployed to that branch yet, or no running server stored the head. Keep a server running (join the game)
and deploy again. (The ConfigService registry would also hold heads, but its read scope, `universe:read`, can't be
granted to API keys today.)

**A deploy doesn't reach Studio.**
Deploy messages never reach Studio playtests. Use [the Studio local payload](studio-testing.md).

**Dev menu: "No trusted prod head".**
The server has no signed head for its branch and no bootstrap head. The next signed prod deploy boots it. If you
deployed prod from another machine before `kernel deploy`, run `kernel deploy` again from the machine with the latest
log ([bootstrap heads](prod-signing.md#bootstrap-heads)).

**Dev menu: "Booted an unverified prod head".**
The [boot fail-safe](prod-signing.md#the-boot-fail-safe) ran a stored build it couldn't verify. Deploy (or re-sign with
`bun run typetorch keys resign`) to replace it with a verified one.

**Dev menu: "Keys changed" without a rotate.**
The key asset changed and no `TypeTorch/rekey` hint came with it. If you didn't run `keys rotate`, someone with asset
write access in your group changed it: check the key asset's versions in Creator Hub.

**"Use the CLI: typetorch pin" or "Other prod servers: typetorch pin" in the dev menu.**
Prod servers take only signed pins sent from outside, and on older kernels the dev menu can't load a build on a prod
server at all. Use `bun run typetorch pin ...`.

**Dev menu: "No fleet API".**
The place's kernel has no `Fleet` module: a place project that maps the kernel's files one by one must map `Fleet`
too (kernel 0.3.2+). Map it, then publish the place.

**Dev menu: "Fleet API failing", or `servers` lists nothing.**
The fleet URL doesn't answer or the token is wrong. A quick tunnel gets a new URL every time it starts: run
`bun run typetorch fleet setup --url <new url>` again. Kernels re-read `TypeTorchFleet` every 5 minutes; new servers
at once.

**The quick tunnel answers 404 for everything.**
Your `~/.cloudflared/config.yml` (a named tunnel) has a catch-all ingress rule, and it overrides `--url`. Start the
quick tunnel with an empty config file: `cloudflared tunnel --config cloudflared-empty.yml --url http://127.0.0.1:8787`
([analytics quick start](analytics.md#4-start-a-quick-tunnel)).

**Analytics: no rows arrive.**
Check, in order: an `AnalyticsEngine` is created on the server (the client alone sends nothing); Allow HTTP Requests is
on; the `TypeTorchAnalytics` key exists and is valid (servers re-read it every 3 minutes; without it the engine keeps
only the newest 1,000 rows); `analytics.stats()` on the server shows what was sent, dropped or refused. Game servers
send every 15 s (`flushSeconds`); a DuckDB server loads them a few seconds later, Basin after its roll interval (1-2
minutes).

**Basin: rows are sent (2xx) but never show up.**
Basin drops rows that don't match the stream's schema, silently. Create the streams from the analytics repo's
`basin/*.schema.json` exactly; a schema can't be changed after the stream exists.

**Kernel updates fail with HTTP 409 when publishing the place.**
An active Team Create session blocks publishing. Close Studio sessions on that place (everyone), then retry.

**`StandardListGameServerThrottled ... ListKeysAsync` in server logs.**
Kernels before 0.2.1 listed DataStore keys too often. Publish a newer kernel and migrate servers.

**Dev menu: "Kernel update".**
The place has a newer kernel than this server. Press **Migrate** (moves everyone on this server to a fresh one) or
restart servers.

**Dev menu: "HTTP off" or "run_luau off".**
Turn on Allow HTTP Requests (Game Settings > Security) or `ServerScriptService.LoadStringEnabled`, then publish.

**`typetorch doctor` warns that the place holds `ServerStorage.TypeTorchDev`.**
A Studio test session was published. Delete the folder in Studio and publish again (live servers ignore it).

## remote-claude

**Claude tab: "Not connected: start the dev server on this branch".**
Start `remote-claude` on the git branch that maps to this server's branch, on a dev-channel server. It announces itself
every 60 s; give a new server up to a minute. The dev-server needs an API key with messaging publish in the
environment or a `.env` file.

**"That code is for another tunnel: use the newest code" / "Wrong, used or expired code".**
Codes are single-use and bound to the tunnel. Type `code` in the dev-server terminal and paste the newest one.

**"Refused: Claude Code must use a subscription login" (`api_billing_refused`).**
Run `claude auth login` with your Claude.ai account and remove `ANTHROPIC_*` variables from that terminal.

**`branch ... is on the prod channel; remote-claude only runs on dev-channel branches`.**
Switch to a dev branch (`git switch dev`).

**Images don't show in the chat (one dim line instead).**
Turn on Allow Mesh / Image APIs; the experience owner must be 13+ and ID-verified.

**Toolbox insert fails with `third_party_off`.**
Turn on "Allow Loading Third Party Assets" (Studio > File > Experience Settings > Security).
