# remote-claude

Chat with **Claude Code running on your own PC** from the dev menu's **Claude** tab, inside a live dev-branch server.
Claude can act on your running server ("jump me", "give me 100 coins") or change the code and propose a deploy.

- Dev-channel servers only; prod branches are refused with no override.
- Only the Roblox users you list can prompt, and only on servers on the session's branch.
- **It runs on your Claude subscription only.** API keys, Bedrock, Vertex and Foundry logins are refused.

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and logged in with your Claude.ai account (`claude auth login`).
- `cloudflared` (installed with winget on Windows when missing; macOS: `brew install cloudflared`). The tunnel is an
  account-free Cloudflare Quick Tunnel.
- The [dev-server](https://github.com/typetorch/dev-server): Node 20+ or Bun 1.3+. The template has
  `@typetorch/dev-server` in its dev dependencies, so `bun install` gets it. Without it: npx (see below), or a checkout
  next to your game (`bun install` in it).
- An Open Cloud key with `universe-messaging-service:publish`: `OPENCLOUD_DEPLOY_KEY`, else the shared
  `OPENCLOUD_API_KEY` (or `ROBLOX_API_KEY`, its alias). The dev-server tells game servers where the session is with it.
  It finds the key the same way the CLI does: the real environment, then the game repo's `.env` (next to
  `typetorch.json`; no parent folder's; `--env-file <path>` or `TYPETORCH_ENV_FILE` read another file instead). Keep the
  key in that `.env`, which is gitignored. The backend's keys (`TYPETORCH_API_KEY`, `TYPETORCH_ADMIN_TOKEN`) are never
  read here. When you play on another PC, screenshots arrive as CaptureService uploads, which `OPENCLOUD_ASSETS_KEY`
  (else the shared key) downloads.

- Experience settings: **Allow HTTP Requests** on. `ServerScriptService.LoadStringEnabled` on for `run_luau`, only in
  a place where you want it (a test place: `kernel deploy --loadstring`, CLI 0.7.5+); keep it off in a live game.
  `kernel deploy` patches leave it as it is; `doctor` reports it. Optional: **Allow Mesh / Image APIs** (and an ID-verified 13+ owner) for images Claude shows
  in the chat; **Allow Loading Third Party Assets** for Toolbox inserts.

Nothing else to set up in Roblox: no secrets.

## Start a session

On a dev-channel git branch of your game:

```sh
git switch dev
bun run typetorch remote-claude --users 111111111
```

`typetorch dev` is the same command, shorter (`bun run typetorch dev --users 111111111`, or `tt dev` with the CLI
installed globally).

- `--users`: the Roblox user ids allowed to prompt (no wildcard). It is remembered in `.typetorch/remote-claude.json`
  (git-ignored); omitted, the last list passed in this repo is used, else the owners in `typetorch.json` (`members` with
  the role `"owner"`; dev-server 0.3.3+).

`typetorch remote-claude` runs the dev-server with the same arguments. It finds it in `TYPETORCH_DEV_SERVER`, the game's
`node_modules` (where the template's `bun install` puts it), next to the CLI, or a sibling `../dev-server` checkout.
Other ways to start it:

```sh
npx @typetorch/dev-server remote-claude --users 111111111                # from npm
npx -p @typetorch/cli -p @typetorch/dev-server typetorch remote-claude --users 111111111
bun ../dev-server/src/index.ts remote-claude --users 111111111           # a checkout
```

It prints a pairing code (and copies it to your clipboard):

```text
pairing code: ABCD-EFGH-JKLM-NPQR-STUV-7QX2  (valid until 18:02, paste it into DEV > Claude in game)
```

In game: open a server on that branch (`/tt new dev`), open **DEV > Claude**, paste the code. That server is paired
for up to 3 hours. Each code pairs one user on one server once; the next code prints right away.

Useful flags: `--branch <name>`, `--max-prompts <n>` (default 50), `--no-deploy`, `--protect <globs>` (files Claude may
not edit), `--code-ttl <minutes>` (default 180), `--model <name>`, `--max-budget-usd <n>` (a cap per run on Claude Code's
own cost estimate), `--cli <entry>` (the TypeTorch CLI used for deploys), `--no-clipboard`, `--no-tunnel` (no Cloudflare
tunnel, for a local client only; what `serve --claude` uses). Terminal commands while it runs: `code`, `users`,
`revoke <userId>`, `rotate`, `status`, `cancel <promptId>`, `quit`.

It also runs in Docker (locally or as a Coolify app): the dev-server repo's `Dockerfile` and `compose.yaml`, with the
users in `TT_USERS` and `claude auth login` inside the container. See the
[dev-server README](https://github.com/typetorch/dev-server#docker).

**Check:** the Claude tab shows the session instead of "Not connected: start the dev server on this branch".

## Live and Code modes

Pick the mode with the **Live / Code** pill next to "+". A conversation can switch modes; follow-ups continue the same
Claude session.

| | Live (default) | Code |
|---|---|---|
| What Claude does | acts on **your running server** | edits the branch in its own git worktree (`../<game>-remote-claude`) |
| Files | read only | edit, then `bun run build` |
| Game tools | all: `run_luau` (you approve each snippet), `game_logs`, `inspect`, `find`, `game_status`, `screenshot` | read-only ones (no `run_luau`) |
| Result | an answer, or a change on your server | a commit and a **deploy proposal** |

- `run_luau` runs only on the server you prompted from, for you; you approve every snippet in the chat (once, always in
  this chat, or deny). Each run leaves an audit record. Prod servers never run it.
- A code run that changed files is committed and shown as a card: files, lines added and removed, a summary.
  **Deploy** runs `typetorch deploy` and your server hot-swaps to it; **Discard** undoes the commit. Only you decide;
  after 15 minutes it is discarded.
- If your `approval` policy needs a person for that branch (`"approval": "all"`), the deploy card says "Waiting for
  your approval on your PC": run `bun run typetorch approve <id>` in the game folder (the dev-server's terminal prints
  the id). With `"approval": "prod"` dev deploys go straight through.
- The dev-server never deploys to a prod-channel branch. Commits stay on its worktree branch; bring them home with
  `git merge remote-claude/<branch>`. Nothing is pushed.

## Attach context

The "+" menu:

- **Dex path:** the instance selected in the Dex.
- **My logs**, **Server logs**, **Player logs...**: log history (about 64 KB each), passed as untrusted data and never
  logged.
- **Screenshot:** a capture of your screen, which you can **crop** and **draw** on before sending (pen in red, yellow,
  white or black, three sizes, Undo / Clear, `Ctrl+Z` / `Ctrl+Y`). When you play on the PC that runs the dev-server,
  it picks the capture file up directly.
- **Toolbox:** see below.

Tap any image in the chat to open it in **big picture** mode (zoom with the wheel or a pinch, drag to pan).

## Toolbox (Creator Store)

Only when you ask for it. Pick **Toolbox** in the "+" menu: that one message lets Claude search the Creator Store (free
assets, from your PC). The chip clears after you send; without it Claude has no Creator Store tools at all.

- In **Live** mode Claude can insert an asset you picked into your server. Every insert shows an approval card (what
  loaded, what will be removed, Anchor, Keep scripts off by default) with Insert / Deny, and inserted assets get a
  Remove button. Scripts are stripped. Needs "Allow Loading Third Party Assets" (Studio > File > Experience
  Settings > Security; it applies to every server of the experience, prod included).
- In **Code** mode it records the asset in `toolbox.lock.toml` instead.

## From Studio (`serve --claude`)

The TypeTorch Studio plugin has a **Claude** button that opens the same chat in Studio. It needs
[`typetorch serve`](studio-testing.md) with `--claude` (CLI 0.12+) on the machine with the game checkout:

```sh
bun run typetorch serve --claude
```

- serve runs remote-claude on this machine without a tunnel (`remote-claude --no-tunnel`) and pairs with it on the
  Studio user's behalf: nobody pastes a code. A remote-claude you start yourself in the repo works too (serve finds it
  through `.typetorch/remote-claude.session.json`).
- `--claude-users <ids>`: the Roblox user ids allowed (remembered). Without it, the owners in `typetorch.json`. Studio
  prompts as the Roblox user it runs as.
- **Code mode only.** Claude edits the branch in its worktree, then the tab shows the same deploy card as the game:
  **Deploy** (runs `typetorch deploy` on that branch, so the branch must be dev-channel; with `"approval": "all"` it
  waits for `typetorch approve` on your PC) or **Discard**. Live mode works only from the in-game tab: Studio's Live
  pill says so.
- The "+" menu has Dex path (the Studio selection), My logs, Server logs (in a playtest) and Toolbox; screenshots work
  from the Play client. Recent chats are listed, and the chat follows you between Edit and Play.
- Replies stream to the tab over a WebSocket (`/tt/claude/stream`), so they show as Claude writes them.
- **A helper on another machine** pairs their Studio with `serve --remote` ([A Studio on another
  machine](studio-testing.md#a-studio-on-another-machine)); add their user id to `--claude-users`. Pair again after
  updating the plugin, so serve knows their Roblox user.

## Security in short

- The tunnel URL is public, so the dev-server authenticates everything: single-use pairing codes bound to the tunnel,
  5-minute access tokens bound to one user and one game server, rotating refresh tokens, replay protection, and a
  loopback-only HTTP server.
- Game servers keep the session URL and tokens in memory; no client ever receives them.
- Claude runs with a tool allowlist in a separate worktree; it can't push, can't use the web, and never sees your
  Open Cloud key or `.env` values. Build and tool configuration files are protected.
- Game data (names, logs, instance paths) reaches Claude labelled as untrusted data, never as instructions.

Full details: the [dev-server README](https://github.com/typetorch/dev-server).
