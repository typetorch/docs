# The dev menu

Every TypeTorch game has an in-game developer menu. It ships in the framework, so it updates with every deploy.

- **Open it:** the **DEV** button (devs only), `Ctrl+Shift+D`, or `/tt dev` in chat.
- **Who:** devs only. The server decides and re-checks every request: the experience owner, `members` from
  `typetorch.json` (after `typetorch config push`), dev-badge holders, anyone in a Studio playtest; minus `revoked`.
  Roles: owner > admin > dev.
- **Prod-channel servers (every public server) are read-only:** no explorer edits, no dev cheats, no in-place loads.
- The window can be dragged by its header and resized from its corner (double-tap the header to reset). It remembers
  the open tab across swaps.
- Roblox games can't write to the clipboard, so every **Copy** opens a small box with the text selected: press
  `Ctrl+C`, or long-press > Copy on touch.

## Tabs

### Artifact

- The build this client and this server run: artifact id, branch, channel, commit, build time, `#seq`, asset id, and
  the notes ("what changed": your `--message` and the commits since the last deploy).
- The generation (`<artifact>#<n>`) and this server's history of swaps with their timings.
- **Verified badges:** two after the server artifact when both signatures check out (Root Key and Fallback Key), one
  when only one does, none for unsigned dev builds.
- **Signing** (kernel 0.3): the mode ("Root Key", "Fallback Key only" or "No keys"), whether this server is
  signed-only, the key asset and its version, the last key load and error, the last key change, "Rejected" (count and
  last reason), the public, revoked and fallback keys by fingerprint (tap to copy), the bootstrap heads, and "No
  trusted prod head" when there is none.

### Modules

A sidebar group with a **Server | Client** toolbar:

- **Overview:** every running module, its lifecycle hooks, dependencies and `onInit` time.
- **State:** the `persist` tables this generation opened, with a preview.
- **Assets:** [hot assets](hot-assets.md): each key, its source (KEPT, BAKED, LOADED, FAILED, LOADING), version,
  load time and last error; on the client, the live copies it sees.

### Server

- **Status:** JobId, server type, uptimes, place version, players, memory, the last deploy message and how long it took
  to arrive, recent swaps. **Attention** lists what needs a look, and the tab shows a **badge** (red for errors, yellow
  for warnings):

  | Attention item | Meaning |
  |---|---|
  | Kernel update (with **Migrate**) | the place has a newer kernel; Migrate moves everyone here to a fresh server |
  | No game running | no build is mounted on this server |
  | Rolled back | an automatic or server rollback happened in the last 15 minutes |
  | Booted an unverified prod head | the [boot fail-safe](prod-signing.md#the-boot-fail-safe) ran an unsigned stored build |
  | No trusted prod head | nothing verified for this branch; waiting for a signed deploy |
  | Keys changed / Fallback Key revoked / Fallback Key only / Rejected n | signing state ([Prod signing](prod-signing.md)) |
  | Hot asset failed / missing, Asset manifest | [hot assets](hot-assets.md) |
  | HTTP off | the Claude tab needs Allow HTTP Requests |
  | run_luau off | `LoadStringEnabled` is off (dev servers) |
  | Pinned / A/B experiment | this server holds a pinned build |
  | Studio: local payload | a Studio session runs your local code ([Testing in Studio](studio-testing.md)) |
  | Registry, High memory | the registry can't be read; the server uses a lot of memory |

- **Branch:** this server's branch and build, the known branches, and the deployed builds (tap a row to see what
  changed).
  - On a private or reserved server: **Switch** branch, **Load** a build (pin), Reload, Rollback.
  - On a public server, devs get buttons that move **only them** to a reserved server. The owner and admins could load
    a build in place as an A/B experiment on dev servers; on signed-only (prod) servers the section says "Use the
    CLI: typetorch pin".

### Admin

Players, Servers and Bans. Every action is re-checked on the server, logged, and rate-limited.

- **Players:** each player's role, user id and ping, and the actions you may take: Teleport to, Bring, Respawn, Kick
  (with a reason), Ban (1 h, 1 d, 7 d or permanent; alt accounts too by default).
- **Servers:** the game's live servers (type, branch, artifact, players, uptime); join one, open a new server on this
  branch, **Shut down** a server, **Migrate** this server, and (owner/admin, dev servers) **Load artifact...** on picked
  servers or a random share as an A/B experiment, or Unpin.
- **Bans:** unban by user id, and a user's ban history.

| Action | dev on a dev server | dev on a prod server | owner / admin |
|---|---|---|---|
| see players and servers, teleport to someone, join a server | yes | yes | yes |
| respawn yourself | yes | no | yes |
| respawn or bring someone | no | no | yes (their role must not be higher) |
| kick, ban, unban, ban history, shut down | no | no | yes (never the owner) |
| migrate this server | yes | private/reserved only | yes |

### Logs

The server's log, your own client's log, and **Others** (another player's client log, fetched on demand). Filter by
level and text; errors are pinned. Dev builds carry `[file:line]` on `$print` lines.

### Dex

A client and server explorer: the instance tree, properties (from `ReflectionService`), attributes and tags. Selecting an
instance highlights it in the world. Right-click or long-press a row for Copy value, Copy name or Copy path (a path you
can paste into code). Editing (properties, attributes, tags, delete, clone, move) works on dev-channel servers only and
is logged.

### Network

- **Packets:** a remote spy for your `createNetwork` traffic: time, direction, path, kind (fire, invoke, response,
  unreliable), player, size, the guard's verdict (accepted, or why it was rejected), and the decoded arguments. Filter,
  pause, search, and (dev servers) block one path on your client. Nothing is captured while nobody watches.
- **Stats:** per network leaf, messages in and out, rejected and errors, for the server and your client.

### Claude

Chat with Claude Code running on your own PC, on dev-channel servers: [remote-claude](remote-claude.md).

## `/tt` commands

They work even when a build is broken. Devs only.

| Command | What it does | Who |
|---|---|---|
| `/tt status` | branch, channel, generation, kernel build, signing mode | dev |
| `/tt branch <name>` | switch this server | dev, private or reserved servers |
| `/tt new <branch> [assetId]` | open a reserved server on a branch and teleport you | dev |
| `/tt reload` | load the branch head again | dev |
| `/tt rollback` | back to this server's previous build | dev; owner/admin on prod-channel servers |
| `/tt pin <assetId>` / `/tt unpin` | hold this server on a known build / release it | dev servers; prod servers take only signed pins |
| `/tt dev` | open the dev menu | dev |
