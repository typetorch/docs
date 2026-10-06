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
- An Open Cloud key with `universe-messaging-service:publish`, as `TYPETORCH_API_KEY` (or `OPENCLOUD_API_KEY`,
  `ROBLOX_API_KEY`). The dev-server tells game servers where the session is with it. It finds the key the same way the
  CLI does: the environment, then the env file (`--env-file`, else `TYPETORCH_ENV_FILE`), then `.env` files in the game
  folder or above. A key in an env file outside the repo is the safest setup:

  ```text
  # .env in the game folder (gitignored)
  TYPETORCH_ENV_FILE=~/.config/typetorch/my-game.env
  ```

- Experience settings: **Allow HTTP Requests** on. `ServerScriptService.LoadStringEnabled` on for `run_luau`, only in
  a place where you want it (a test place); keep it off in a live game. `kernel deploy` patches leave it as it is;
  `doctor` reports it. Optional: **Allow Mesh / Image APIs** (and an ID-verified 13+ owner) for images Claude shows
  in the chat; **Allow Loading Third Party Assets** for Toolbox inserts.

Nothing else to set up in Roblox: no secrets.

## Start a session

On a dev-channel git branch of your game:

```sh
git switch dev
bun run typetorch remote-claude --users 111111111
```

`typetorch dev` is the same command, shorter (`bun run typetorch dev --users 111111111`).

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
not edit), `--code-ttl <minutes>`, `--model <name>`. Terminal commands while it runs: `code`, `users`,
`revoke <userId>`, `rotate`, `status`, `cancel <promptId>`, `quit`.

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

## Security in short

- The tunnel URL is public, so the dev-server authenticates everything: single-use pairing codes bound to the tunnel,
  5-minute access tokens bound to one user and one game server, rotating refresh tokens, replay protection, and a
  loopback-only HTTP server.
- Game servers keep the session URL and tokens in memory; no client ever receives them.
- Claude runs with a tool allowlist in a separate worktree; it can't push, can't use the web, and never sees your
  Open Cloud key or `.env` values. Build and tool configuration files are protected.
- Game data (names, logs, instance paths) reaches Claude labelled as untrusted data, never as instructions.

Full details: the [dev-server README](https://github.com/typetorch/dev-server).
