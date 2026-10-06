# The dev menu

Every TypeTorch game has an in-game developer menu. It ships in the framework, so it updates with every deploy.

- **Open it:** the **DEV** button (devs only), `Ctrl+Shift+D`, or `/tt dev` in chat.
- **Who:** devs only. The server decides and re-checks every request: the experience owner, `members` from
  `typetorch.json` (after `typetorch config push`), dev-badge holders, anyone in a Studio playtest; minus `revoked`.
- **Two roles:** **owner** (the experience's creator or the owning group's owner, plus `members` with the role
  `"owner"`) and **dev**. A `members` entry with the old role `"admin"` counts as a dev.
- **Prod-channel servers (every public server) are read-only:** no explorer edits, no dev cheats. Owners can still
  switch the server they are in ([Server > Branch](#server)).
- The window can be dragged by its header and resized from its corner (double-tap the header to reset). It remembers
  the open tab across swaps.
- Roblox games can't write to the clipboard, so every **Copy** opens a small box with the text selected: press
  `Ctrl+C`, or long-press > Copy on touch.

## Tabs

### Artifact

- The build this client and this server run: artifact id, branch, channel, commit, build time, `#seq`, asset id, and
  the notes ("what changed": your `--message` and the commits since the last deploy).
- **How long things have run:** "Running" for the client generation and for the server generation, "Server up" (the
  server's uptime), and "Built" with the build's age ("2026-10-05 17:51:37 UTC (8m ago)"). They update every 5 s.
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
- **State** (framework 0.3.2): a live state explorer. The roots are every running module (services on the server,
  controllers on the client) and the `persist` store. Tap a row to open it: a module's own fields, then tables, arrays,
  Maps and Sets, 100 entries per page (Prev / Next).
  - Each value has a short preview: strings, numbers, booleans, nil, datatypes, an Instance as its full path, a Player
    as its name, `function`, `thread`, buffer sizes.
  - Raw reads only: no metamethod, getter or function ever runs. A value that is its own ancestor shows as a cycle,
    with its path.
  - A key filter (open rows stay listed), Refresh, and Auto (every 2 s).
  - Server state: devs on dev-channel servers; owners only on prod-channel servers (server state can hold player
    data). Rate-limited and size-capped.
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
  | Failed health check | a new build failed its health window here in the last 15 minutes and the server went back to the last good one ([safe deploys](deploy-and-rollback.md#the-health-window-and-the-last-known-good-build)) |
  | Errors n | the running build keeps erroring after its health window |
  | Rolled back | an automatic or server rollback happened in the last 15 minutes |
  | Clients failed n | some players' client side of the build failed to start |
  | No fleet API / Fleet settings / Fleet API failing | the kernel can't send to the [fleet API](fleet-and-alerts.md#in-the-dev-menu) |
  | No deploy reports | the kernel is older than 0.3.2 |
  | Booted an unverified prod head | the [boot fail-safe](prod-signing.md#the-boot-fail-safe) ran an unsigned stored build |
  | No trusted prod head | nothing verified for this branch; waiting for a signed deploy |
  | Keys changed / Fallback Key revoked / Fallback Key only / Rejected n | signing state ([Prod signing](prod-signing.md)) |
  | Hot asset failed / missing, Asset manifest | [hot assets](hot-assets.md) |
  | HTTP off | the Claude tab and the fleet API need Allow HTTP Requests |
  | run_luau off | `LoadStringEnabled` is off (dev servers) |
  | Pinned / A/B experiment | this server holds a pinned build |
  | Studio: local payload | a Studio session runs your local code ([Testing in Studio](studio-testing.md)) |
  | Registry, High memory | the registry can't be read; the server uses a lot of memory |

- **Branch:** this server (type, branch, channel, the running build, whether it is pinned), the known branches, and the
  deployed builds, newest first, grouped by branch (tap a row to see what changed). A row's button says what it does:
  - **Switch** (a branch): this server follows that branch. **Load here** (a build): this server runs it (a pin).
    Both take two taps: a green Confirm, then a locked "Switching..." or "Loading...". Everyone stays in the game.
  - **Join:** moves only you to a reserved server on that branch or build. Devs who aren't owners get it on public
    servers.
  - **Owners** get Switch and Load here on every server, public and prod included (kernel 0.3.4 and framework 0.3.2).
    On a public server a switch lasts for this server's lifetime only; new servers still boot `prod`. To go back,
    switch to `prod`. Details: [Branches and channels](branches-and-channels.md#owners-switch-any-server-in-place).
  - **Devs** get them on private and reserved servers of dev branches.
  - Reload and Rollback as before. The dev menu allows one swap (reload, switch, rollback, load) per server every 2 s.
  - On older kernels, prod servers show "Use the CLI: typetorch pin" instead of in-place loads.

### Manage

Owners only. (Called **Admin** before framework 0.3.2.) Players, Servers and Bans. Every action is re-checked on the
server, logged, and rate-limited.

- **Players:** each player's role, user id and ping, and the actions: Teleport to, Bring, Respawn, Kick (with a
  reason), Ban (1 h, 1 d, 7 d or permanent; alt accounts too by default).
- **Servers:** the game's live servers (type, branch, channel, build, players, uptime), found by a MessagingService roll
  call when you open the list (3 s, cached 15 s; no storage). A summary line per build says how many servers and
  players run it. Join a server, open a **New server** on this branch, **Shut down** a server, **Migrate** this server.
- **Load a build...:** pick a build, then where it runs:
  - **This server** (players stay);
  - **Selected servers** (tick them in the list);
  - **Share of a branch's servers** (5, 10, 25 or 50%, stable per server).

  One summary line says it ("Load #36 on 2 servers"), and the button says the action. A status line under the list
  follows it ("Loading #36 on 2 servers", "Done: 2 switched"). Other servers on prod take only signed pins, so the card
  says "Other prod servers: typetorch pin" ([pins](deploy-and-rollback.md#pins-ab-experiments)).
- **Back to branch head:** ends the pins on the picked servers, or every A/B server of a branch.
- **Bans:** unban by user id, and a user's ban history.

### Logs

The server's log, your own client's log, and **Others** (another player's client log, fetched on demand). Filter by
level and text; errors are pinned. Dev builds carry `[file:line]` on `$print` lines. Kernel notes (`[TypeTorch] ...`
info lines) are dim.

**Upload** (framework 0.3.2) sends the log shown to the dev PC paired in the [Claude tab](remote-claude.md), which
saves it under `<repo>/.typetorch/logs/` and prints one line. No Claude run, no prompt used. Not paired: "Pair in the
Claude tab first".

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
| `/tt status` | branch, channel, generation, uptime, kernel build, signing mode | dev |
| `/tt branch <name>` | switch this server to a branch | devs on private or reserved servers; owners on any server |
| `/tt new <branch> [assetId]` | open a reserved server on a branch and teleport you | dev |
| `/tt reload` | load the branch head again | dev |
| `/tt rollback` | back to this server's previous build | dev; owners on prod-channel servers |
| `/tt pin <assetId>` / `/tt unpin` | hold this server on a known build / release it | devs on dev servers; owners on any server |
| `/tt dev` | open the dev menu | dev |
