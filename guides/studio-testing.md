# Testing in Studio

Run your **local** code in Studio with the real kernel, the dev menu and DataStores, without uploading anything.
`typetorch serve` runs the whole Studio loop in one process, and the **TypeTorch Studio plugin** attaches to it by
itself: no Connect button, and a save reaches a running playtest without Stop + Play.

- Needs kernel 0.3.1+ in `node_modules/@typetorch/kernel` for the local payload, and **kernel 0.5.4+** for live reload
  in a playtest. CLI 0.11+ for `typetorch serve` (0.12 for `--remote` and `--claude`).
- Deploy messages never reach Studio playtests, so Studio doesn't follow your deploys. The kernel mounts your compiled
  code straight from `ServerStorage.TypeTorchDev.Payload`, which Rojo syncs.

## Set up (once)

- **`studio.project.json`** from the template, next to `default.project.json`. It syncs the kernel from
  `node_modules/@typetorch/kernel`, your compiled payload (`out/`, `include/` and the packages) into
  `ServerStorage.TypeTorchDev.Payload`, and the kernel place's baseplate and spawn.
- **The TypeTorch Studio plugin.** Download `TypeTorchSync.rbxm` from the
  [latest release](https://github.com/typetorch/studio-plugin/releases/latest) into Studio's plugins folder (Windows:
  `%LOCALAPPDATA%\Roblox\Plugins`), then restart Studio or reload plugins. From a checkout of
  [typetorch/studio-plugin](https://github.com/typetorch/studio-plugin):
  `bun run typetorch studio install-plugin --from ../studio-plugin` builds it into the same folder with Rojo. The plugin
  is not on npm, and the Creator Store can't take plugin uploads from the release pipeline yet, so the GitHub release is
  the way to install it. It carries Rojo's own sync (7.7.0-rc.1, the version `rokit.toml` pins), so you don't need the
  stock Rojo plugin; if you keep it, connect only one of the two at a time.
- **Game Settings > Security > Enable Studio Access to API Services**, so DataStores work in a playtest.
- The first time the plugin probes `typetorch serve`, Studio asks to allow its HTTP requests to localhost: allow it.

## Run it

In the game folder:

```sh
bun run typetorch serve
```

It starts, and restarts when they exit:

- **watch**: the game's `watch` script (else `rbxtsc -w`). Compile errors are kept for `serve status` and the plugin's
  panel. `--no-watch` leaves compiling to your editor.
- **rojo**: `rojo serve studio.project.json` (else `default.project.json`; `--project <file>`) on Rojo's port 34872 or
  the next free one (`--port`).
- **extra scripts**: `--with <a,b>` runs those `package.json` scripts with `bun run`; `--live` is `--with live`.
- **the control API** on `127.0.0.1`, the first free port of 34880-34887 (loopback only, no browser can call it).
  `.typetorch/serve.json` (git-ignored) records the port while it runs.

Open a place of your experience in Studio. The plugin finds the serve whose `typetorch.json` `universeId` matches the
place and syncs; another experience's place or an unpublished file syncs only after **Connect anyway** in its panel.
Press **Play**.

**Check:** the plugin's panel (the TypeTorch toolbar button) says "Synced", Server > Status in the dev menu shows "Studio: local
payload", and `/tt status` says "local payload". The artifact id is `local-<HHMMSS>` on branch `dev` (or the `Branch`
attribute of `ServerStorage.TypeTorchDev`), dev channel.

Ctrl+C, or `bun run typetorch serve stop` from another terminal, stops everything. Other subcommands:
`serve status` (children, attached Studios, sync state, compile errors), `serve restart <watch|rojo|script>` and
`serve logs [--studio] [--follow]` (`--studio`: Studio's Output, as the plugin forwards it).

The two-terminal loop still works: `bun run watch` and `bun run studio` (`rojo serve studio.project.json`) with the stock
Rojo plugin, but nothing reloads a running playtest then.

## How it behaves

- **A save reaches the running playtest.** In a playtest the plugin also runs in the server and syncs into the running
  game; it sets `LiveReload` on `ServerStorage.TypeTorchDev`, and the kernel (0.5.4+) reloads a fresh copy of the local
  payload about 0.4 s after the last change, server and client code, as Reload does. Turn it off in the panel's
  Playtest card ("Live playtest: on"). With an older kernel, code changes need Stop + Play.
- **Reload tests swaps.** The dev menu's Reload (or `/tt reload`) remounts a fresh copy of the same code, so you can
  test `persist`, `onSwapOut`, update toasts and everything else a deploy does, while you play.
- Deploys and the 60 s poll don't move a local session. A pin or a branch switch in the dev menu still loads an
  uploaded build; Reload comes back to the local copy.
- To boot the branch head instead, delete `ServerStorage.TypeTorchDev.Payload` (with the sync disconnected).
- In Studio everyone is a dev with the owner role, so kick and ban can't be tried there.
- A dropped connection or a restarted `serve` reconnects with a full resync. "Auto-connect: on" in the panel turns it off
  per place.

## Hot assets from the panel

The plugin's **Hot assets** card does [hot assets](hot-assets.md) without publishing the place first: select models or
UI, **Add** marks them (`TypeTorchAsset`, a key from the name or the name box), **Remove** unmarks them. Each marked
instance shows as new, changed, up to date, or what a sync would refuse.

- **Check** runs `typetorch assets status` on the plugin's export of the open place (no key needed).
- **Upload** runs `typetorch assets sync` on it.
- **Publish to dev** runs `assets sync --deploy dev` (`serve --dev-branch <b>` picks another dev branch; a prod-channel
  branch is refused). The deploy follows your `approval` policy like any other: with `"approval": "all"` it becomes a
  proposal for `typetorch approve`.

They run inside `serve` with its keys from the game repo's `.env` (progress in `serve logs`). Because the export comes
from the open place, the lockfile records place version 0 for changed entries; the next sync from a published place
records a real version again.

## Agents and Studio

`typetorch serve --detach` starts serve in the background (log: `.typetorch/serve.log`) and returns once it answers;
every subcommand takes `--json`. An agent can then drive the Studio the plugin attached:

```sh
bun run typetorch studio status            # attached Studios (edit, playtest server and client), sync state
bun run typetorch studio reconnect         # resync from scratch, wait for the result (--anyway: another experience)
bun run typetorch studio play              # start a playtest (--run: Run mode, no player)
bun run typetorch studio logs --follow     # Studio's Output, edit and playtest
bun run typetorch studio stop              # end the playtest
```

The plugin keeps listening for these while its sync is down, so an agent can always get Studio back. When no Studio is
attached at all, run this in Studio's command bar (or the Roblox Studio MCP's `execute_luau`) and the plugin reconnects:

```lua
game:GetService("ServerStorage"):SetAttribute("TypeTorchReconnect", os.time())
```

`typetorch mcp` serves the same over stdio as MCP tools (`serve_status`, `serve_start`, `serve_stop`, `serve_logs`,
`studio_logs`, `studio_reconnect`, `studio_play`, `studio_stop`). Claude Code, from the game repo:
`claude mcp add typetorch -- bunx typetorch mcp`.

## A Studio on another machine

`bun run typetorch serve --remote` lets someone else's Studio sync from your machine:

1. serve opens a gateway on `127.0.0.1:34890` (`--remote-port`) and a free Cloudflare quick tunnel to it (no account;
   `cloudflared` is installed when it's missing).
2. Once the tunnel answers, serve prints a **one-time pairing link** (valid 15 minutes): the tunnel URL with the code
   after a `#`. `serve status` shows it again; `typetorch serve pair` makes a new one.
3. The other person pastes the link into the plugin's **Remote server** card. Their Studio stays paired for 30 days
   (`serve devices` lists devices, `serve unpair --name <device>` or `--all` revokes them). **Use local serve** goes back.

- A quick tunnel's address changes when cloudflared restarts; serve then prints a new link. For a fixed address, run
  your own named tunnel to `http://localhost:34890` and pass `--url https://<your tunnel>`; `--no-tunnel` opens none and
  leaves `typetorch serve pair --url <it>` to you (the URL is remembered).
- A remote Studio syncs code read-only, reports its state and Output, and runs the Hot assets buttons (uploads with
  your keys, deploys only to the dev branch). It can't stop or restart serve, read serve's log or drive other Studios,
  and `typetorch studio ...` and the MCP tools never pick a remote Studio unless `--target` names it.
- Every request but pairing needs that device's token (kept hashed in `.typetorch/serve-remote.json`). Five wrong codes
  lock pairing until you make a new code.

## Claude in Studio

`bun run typetorch serve --claude` also runs [remote-claude](remote-claude.md#from-studio-serve---claude) on this machine
(no tunnel), and the plugin's **Claude** button opens a chat with Claude Code, like the in-game DEV > Claude tab.

## Don't publish that session

Live servers ignore `ServerStorage.TypeTorchDev`, but it bloats the place, and `typetorch doctor` warns when the
published place still holds it. Publish the place only through the kernel deploy (or your own clean Studio session).

## Without a local payload

A Studio playtest with no `ServerStorage.TypeTorchDev.Payload` boots an uploaded build: the head of
`ServerStorage.TypeTorchDev`'s `Branch` attribute, or of `defaultBranch`. It reads the stored heads from DataStores, so
it also needs Studio API access. (Kernel 0.3.8 dropped the `BootAssetId` and `Registry` attributes, stand-ins for the
old ConfigService registry.)
