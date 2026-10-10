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
`modules`, or two modules need each other. For a cycle, take one side as `Lazy<T>` (a field `= Lazy<T>()`, or a
constructor parameter with `@typetorch/transformer` 0.2.1+), call `Dependency<T>()` inside a method, or move shared
logic into a third module ([Dependency cycles](../getting-started/migrate.md#dependency-cycles-lazyt)).

**`ShopService isn't constructed yet: call Dependency<ShopService>() from onInit/onStart or later`.**
`Dependency<T>()`, `TypeTorch.module<T>()` or `Lazy<T>.get()` ran before every module was constructed: in a
constructor, a field initializer, or at the top level of a module ("ran while the modules were loading"). Call it in a
method or in `onInit`.

**`X: constructor parameter 2 is a Lazy<T>, but this build's @typetorch/transformer doesn't record T`.**
`Lazy<T>` constructor parameters need `@typetorch/transformer` 0.2.1 or later. Update it, or declare a field instead:
`private readonly team = Lazy<TeamService>()`.

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

**`no Open Cloud API key for assets: set OPENCLOUD_ASSETS_KEY ... or OPENCLOUD_API_KEY ...`.**
The CLI found no key. Check the game repo's `.env` (CLI 0.9: `OPENCLOUD_API_KEY`; `TYPETORCH_API_KEY` is the backend's key now, not a Roblox key). `doctor` prints which
files it read.

**A scope probe in `doctor` fails with 401/403.**
Edit the key in Creator Hub and add the missing permission for this experience.

**`refusing to publish a kernel that can't verify prod deploys`.**
Run `bun run typetorch keys init` and `bun run typetorch keys init --fallback` first, commit `typetorch.json`, then
`kernel deploy`.

**`kernel deploy` says the place can't be patched through the API.**
The default engine saves the place in a Luau Execution task. That needs the place setting "Allow place to be updated using Save
Place API" (Creator Hub > Creations > the experience > Places > the place > Permissions; off by default for places made in
Studio), no active Team Create session, and the place key's Luau Execution scopes. Without the setting, download a copy in
Studio (File > Download a Copy) and pass it: `--place-file <file> --base <version>` ([Kernel updates](deploy-and-rollback.md#kernel-updates)).

**`backend setup`, `access push` or `settings ...` fails with 401/403.**
The [settings record](settings.md) is a DataStore entry: the deploy key needs `universe-datastores.objects:read`,
`:create` and `:update` (the ping also needs `universe-messaging-service:publish`). `universe:write` isn't used any more.

**`... signed with both prod keys: run typetorch keys init`.**
Settings writes (`settings set`, `backend setup`, `access push`) sign the record with both prod keys. Set them up
([fresh setup step 7](../getting-started/fresh-setup.md#7-prod-signing-keys)), or copy the key files from the machine
that has them.

**`the current settings record isn't signed by your keys`.**
Someone else's keys (or game code) wrote it, or you rotated without `keys rotate` re-signing it. Check
`bun run typetorch settings status`. `--force` replaces it: the old fields are dropped, never re-signed with your keys,
so run `settings push`, `access push` and `backend setup` again afterwards.

**`typetorch config push` is gone.**
Kernel 0.3.8 reads no ConfigService keys. Use `typetorch settings push` (defaultBranch, channels, dev access),
`typetorch backend setup` (CLI 0.9 also moved `fleet setup` and `settings set analytics` there).

## Deploys

**`refusing to deploy a dev-channel artifact ... to prod-channel branch "prod"`.**
You built on a dev branch. Deploy prod from the git branch mapped to it (`main`), or pass `--force` knowingly.
`promote` refuses it even with `--force`: "rebuild for prod".

**`refusing to deploy a dirty build to prod-channel branch "prod"` with nothing to commit.**
Untracked files count as changes, editor swap and backup files included (`.typetorch.json.swp`, `*~`, `4913`). Close
the editor or delete them; `git status --porcelain --untracked-files=all` lists what the CLI sees. The next CLI release
ignores untracked editor swap and backup files (`*.swp`, `*.swo`, `*~`, `.#*`, `4913`).

**`typetorch reject` says `proposal ... is already approved`.**
`reject` drops pending proposals only. An approved one has gone out: roll back or deploy again instead. Proposals are
whole builds, so reject the older ones once a newer one is approved
([Approval and proposals](deploy-and-rollback.md#approval-and-proposals)).

**The cloud test prints `liveConfig("x") needs kernel 0.3.8 ... using the default` for every key.**
Harmless: the cloud test has no signed settings record, so `liveConfig` gives its defaults there. Framework 0.5.2+
doesn't print it in `typetorch test --cloud`.

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
`workspace:GetAttribute("TypeTorchTest")`. Place scripts never run there: code that waits for one (for example
`DataHost didn't require ProfileStore` after 10 s) fails the test; see
[Player data: the cloud test](player-data.md#the-cloud-test). A missing Luau Execution scope fails it too: add
`universe.place.luau-execution-session:read` and `:write` to the assets key. To publish anyway, knowingly:
`--skip-test "<reason>"`.

**`deploy --wait` rolled the branch back by itself (`auto_rollback`).**
20% or more of the servers that tried the build failed or rolled back (`"autoRollback": { "failedPct" }` in
`typetorch.json` changes the 20). `bun run typetorch report "#<seq>"` shows the errors and the servers. Fix, then deploy
again. `--no-auto-rollback` keeps a build that fails on some servers.

**Every server rolls back every new build ("3 errors within 30 s of ready").**
The game throws a few errors right after it starts, on every server. Fix them, or raise the limit in `typetorch.json`
(kernel 0.3.7+): `"health": { "errors": 10 }`. See [Set the health window](deploy-and-rollback.md#set-the-health-window).

**`deploy --wait` warns about stuck servers (`server_stuck`).**
Some servers didn't pick up the deploy in time and sent nothing. Nothing is rolled back. They poll the head every 60 s;
check again with `bun run typetorch servers --branch <b>`.

**`the fleet API isn't configured` (from `servers`, `report`, `alerts`, or `--wait` skipped).**
Set it up once: [Live servers and alerts](fleet-and-alerts.md#set-it-up). The CLI needs `TYPETORCH_ADMIN_TOKEN` and
`TYPETORCH_API_KEY` in the game repo's `.env`, and `typetorch.json` `backend.url`.

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
and deploy again.

**After a swap, the old dev menu stays on screen, dead, over the new one** (its header names an older
`<artifact> #<generation>`), memory grows by several MB per swap, or something the old build made keeps acting.
A cleanup threw while the old generation stopped, and before framework 0.5.2 that aborted the rest of the stop: later
modules' troves, the network and the dev menu's own cleanup never ran, and the dead generation stayed in memory. The
usual cause is `trove.remove(x)` inside a cleanup ("Cannot call trove.remove() while cleaning" in the client or server
log); see [rule 1](../getting-started/migrate.md#rule-1-everything-goes-in-the-modules-trove). Framework 0.5.2+
cleans every object in its own pcall (a throwing cleanup warns `<Module> cleanup threw: ...`), stamps the `TypeTorchDev`
ScreenGui with a `TypeTorchGeneration` attribute and destroys any menu from an older generation when it starts. On an
older framework, fix the cleanup and add a sweeper to a client module:

```ts
onInit() {
	const gui = Players.LocalPlayer.WaitForChild("PlayerGui");
	for (const child of gui.GetChildren()) {
		if (child.Name === "TypeTorchDev" && child.GetAttribute("SweepMe") === true) child.Destroy();
	}
	this.trove.add(
		TypeTorch.onSwapOut(() => {
			// Runs before any cleanup, so it happens even if one throws later.
			for (const child of gui.GetChildren()) if (child.Name === "TypeTorchDev") child.SetAttribute("SweepMe", true);
		}),
	);
}
```

**LuauHeap shows old generations' `RuntimeLib` (about 10 to 26 KB each).**
Each past server generation's `include.RuntimeLib` stays referenced through a pending `TS.import` Promise. It is small
and harmless (one per past generation, so a few dozen after a day of deploys). A whole generation kept in memory
(MBs per swap) is the entry above.

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
The fleet URL doesn't answer or the token is wrong. Run `bun run typetorch doctor`: it tests the `backend` address and
keys in the live settings record (the URL, `GET /healthz` within 5 s, and the keys) and prints a fix
for each failure. A quick tunnel gets a new URL every time it starts: run `bun run typetorch backend setup --url <new url>`
again (or restart `bun run local -- --game <game repo>` in the backend folder). Running servers (kernel 0.3.8+) switch within seconds; new
servers at once.

**`backend setup` says "refusing to write ... nothing was signed or written".**
Before it signs anything the CLI tests the address and the token, and one of them failed. The message lists each
failing check with a `fix:` line:

| Check | Meaning |
|---|---|
| `url` | not a URL, not https (game servers and the kernel only use https; http only on localhost, for this PC), user info in it, or not the server's base address |
| `healthz` | `GET <url>/healthz` didn't answer `{"ok":true}` within 5 s: a dead quick tunnel (start `bun run local` again; the URL changes every run), a stopped server, a wrong host, or something else answers there |
| `key` | the server refused the game key (`TYPETORCH_API_KEY` in the game repo's `.env`), or that part of the server is off (`TYPETORCH_PARTS`), or it is the admin token (never put that in the record: every script in your game can read it) |
| `admin` | `TYPETORCH_ADMIN_TOKEN` isn't the admin token (the server answers role `admin` for it), or it is the same value as the game key |

Fix it and run the command again. `--force` writes the value anyway (the failures print as warnings), except an admin token in the key's place, which is always refused. `bun run local`
prints the same message in red when the game's CLI refuses its tunnel, and keeps the tunnel running.

**Server log (or Analytics / Fleet API line in the dev menu): `HttpError: NetFail`, `DnsResolve`, `ConnectFail`, HTTP 530.**
The game servers can't reach your analytics / fleet server. Roblox names the failure: `NetFail` means the connection
broke mid-request (the server or the tunnel on your PC restarted, dropped it or is overloaded; quick tunnels are for
testing only), `DnsResolve` or HTTP 530 that the quick tunnel's address is gone (it changes on every start),
`ConnectFail` that nothing accepts connections there, `TimedOut` that it never answers (the PC is asleep?). Run
`bun run typetorch doctor`, then `bun run local -- --game <game repo>` in the backend folder if the address is stale. The engine keeps the
rows and retries with a growing pause (5, 10, 20 ... 300 s, spread so servers don't retry together); it logs at most
one line a minute with the reason and the fix, and one line when uploads work again. **Server > Status** shows the
*Analytics* and *Fleet API* lines (queued, sent, `FAILING x5: ... retry in 80 s`, the last error and its age) and
*Attention* lists the fix.

**The quick tunnel answers 404 for everything.**
Your `~/.cloudflared/config.yml` (a named tunnel) has a catch-all ingress rule, and it overrides `--url`. `bun run local` passes
an empty config, so this happens only with a cloudflared you start yourself: give it an empty `--config` file.

**Analytics: no rows arrive.**
Check, in order: an `AnalyticsEngine` is created on the server (the client alone sends nothing), in a module's
`onInit` (an engine first created on some game event never starts on an idle server); Allow HTTP Requests is
on; the settings record has a valid `analytics` field (`bun run typetorch settings get analytics`; kernel 0.3.8+;
without it the engine keeps only the newest 1,000 rows); `analytics.stats()` on the server shows what was sent, dropped or refused. Game servers
send every 15 s (`flushSeconds`); a DuckDB server loads them a few seconds later, Basin after its roll interval (1-2
minutes). To see the raw rows without waiting for a chart: `POST /v1/sql`
([Debugging endpoints](fleet-and-alerts.md#debugging-endpoints)).

**Basin: rows are sent (2xx) but never show up.**
Basin drops rows that don't match the stream's schema, silently. Create the streams from the backend repo's
`basin/*.schema.json` exactly; a schema can't be changed after the stream exists.

**Kernel updates fail with HTTP 409 when publishing the place.**
An active Team Create session blocks publishing. Close Studio sessions on that place (everyone), then retry.

**`StandardListGameServerThrottled ... ListKeysAsync` in server logs.**
Kernels before 0.2.1 listed DataStore keys too often. Publish a newer kernel and migrate servers.

**Dev menu: "Kernel update".**
The place has a newer kernel than this server. Press **Migrate** (moves everyone on this server to a fresh one) or
restart servers.

**Dev menu: "HTTP off".**
Turn on Allow HTTP Requests (Game Settings > Security), then publish.

**Dev menu: "run_luau off".**
`ServerScriptService.LoadStringEnabled` is off. That is right for a live game. Turn it on (Studio's Properties, then
publish, or `kernel deploy --loadstring` with CLI 0.7.5+) only in a place where you want remote-claude's `run_luau`,
such as a test place.

**A member doesn't get the dev menu (or a revoked dev still does).**
Servers see `members`, `revoked` and `devBadgeId` only after `bun run typetorch access push`, and only on kernel
0.3.8+ (0.3.6 and 0.3.7 read the old ConfigService key: push again after the kernel update). Run it after every
change; `bun run typetorch access status` compares the settings record with `typetorch.json`. Running servers apply it
within seconds.

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
