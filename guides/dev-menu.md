# The dev menu

Every TypeTorch game has an in-game developer menu. It ships in the framework, so it updates with every deploy.

- **Open it:** the **DEV** button (devs only), `Ctrl+Shift+D`, or `/tt dev` in chat. Framework 0.6.2+ puts the DEV
  button in Roblox's top-bar row, right of Roblox's own buttons, so it never covers a game's top-left HUD (without a
  top-bar inset it falls back to the old spot under the bar). A dot on it (and on the Server tab) shows while the
  server has warnings (yellow) or errors (red).
- **Find anything:** the [command palette](#command-palette) (`Ctrl+K`, `Cmd+K` on a Mac, or the search button in the
  menu header).
- **Who:** devs only. The server decides and re-checks every request: the experience owner, `members` from
  `typetorch.json` (after `typetorch access push`; kernel 0.3.8+), dev-badge holders, anyone in a Studio playtest;
  minus `revoked`. Until the server has read the settings record once, members and badge holders are not devs (the
  owner and Studio are).
- **Only devs receive the code** (framework 0.5.6+ with kernel 0.5.6+): the kernel leaves the framework's `devtools`
  folder off the client tree every player gets, and the server copies it into each dev's PlayerGui (on join, on every
  generation, and when someone becomes a dev). Other players never download the menu. On older kernels the folder is in
  the shared tree as before. A failed copy costs that dev the menu, with a warning, never the generation.
- **Two roles:** **owner** (the experience's creator or the owning group's owner, `members` with the role `"owner"`,
  and anyone in a Studio playtest) and **dev**. A `members` entry with the old role `"admin"` counts as a dev.
- **Prod servers are read-only:** the [dev-only tools](#dev-only-tools) are off there. Owners can still switch the
  server they are in ([Server > Branch](#server)).
- The window can be dragged by its header and resized from its corner (double-tap the header to reset). It remembers
  its panes and windows across swaps.
- The sidebar, top to bottom: Artifact, Server, Network, Modules, Manage, Logs, Dex, Claude.
- The header reads `<artifact id> #<generation>` (in a code font), so a screenshot says which build and generation it
  came from. The menu is a ScreenGui named `TypeTorchDev` in PlayerGui. Framework 0.5.2+ stamps it with a
  `TypeTorchGeneration` attribute and destroys any `TypeTorchDev` from an older generation when it starts; two menus
  on screen on an older framework means the old generation didn't stop cleanly
  ([Troubleshooting](troubleshooting.md#live-servers)).
- Roblox games can't write to the clipboard, so every **Copy** opens a small box with the text selected: press
  `Ctrl+C`, or long-press > Copy on touch.

## Dev-only tools

Framework 0.5.0+. Claude, Logs > Upload, Dex edits, Network packet blocking, Server > Experiments and
Modules > State's server state for devs who aren't owners, and the hot-swap sound work only:

- under dev rules (private, reserved and Studio servers on a dev branch): for every dev;
- on a public server an owner switched to a dev branch ([Server > Branch](#server)): for owners only.

Everywhere else (every prod server, so every normal public server) they are read-only and say why: "Dev branch only",
"Owners only on public servers" or "Owner-switched servers only". Owners keep server state and Server > Experiments
everywhere. The rules themselves don't change: `TypeTorch.channel`, signatures and owner-only rollbacks stay as they
are.

## Panes and windows

Show two pages at once, for example **Network > Packets** next to **Modules > State** (framework after 0.3.2).

- **Every page sits in a pane** with a small header: the page's name (tap it to pick another page) and four buttons:
  **Split right**, **Split down**, **Open in new window** and **Close**.
- **Split** adds a pane beside or under this one, on the same page. Drag the line between two panes to resize them.
- **The sidebar opens pages in the focused pane.** Tap a pane to focus it; with several panes, the focused one has an
  orange outline.
- **Windows** float over the game. Drag one by its title bar and resize it from its corner; double-tap the title bar
  to maximise it. The title bar has **Minimise**, **Dock** (back into the main panel, next to the focused pane) and
  **Close**. A window can be split too. Tap a window to bring it to the front. Windows show and hide with the menu.
- **Some pages open once:** Claude, Server > Branch and the Manage pages. Picking one again focuses its pane. Every
  other page can be open in several panes, each with its own settings (two State panes can show two modules).
- **The layout survives swaps:** panes, windows and each pane's settings come back after a hot swap. A fresh join
  starts with one pane.
- **Panes you can't see don't refresh:** closing the menu or minimising a window stops their requests. Panes on the
  same data share one request, so two panes don't hit the server's limits.
- **Limits:** 6 panes in the main panel, 4 per window, 6 windows. On phones and small screens panes only stack (two at
  most), and windows (3 at most) open maximised with one pane each.

## Command palette

Framework 0.5.7+. `Ctrl+K` (`Cmd+K` on a Mac), or the search button in the menu header (touch has no keyboard), opens
the menu if it is closed and a search box over every command you may run right now. The same keys close it.

- **Search is fuzzy:** each word you type must match a command's title, a keyword or its group, letter by letter in
  order (`swdev` finds *Switch to dev branch*, `srv rel` finds *Reload this server*). On an empty query your recent
  commands come first (8 at most), then the rest. Some commands (single builds, servers, players, experiments) only
  show when you type.
- **Keys:** Up / Down pick, Enter runs, Shift+Enter opens a page in a split, Escape closes. Clicking a row runs it
  (Shift+click: in a split).
- **Never while typing:** the hotkey does nothing while chat or a text box has focus.
- **Two steps for anything that swaps what runs on the server** (reload, roll back, switch, load a build, migrate):
  the first Enter or tap arms it and the status line says what will happen ("Reload this server (4 players) to its
  branch head?"); a second one within 4 s runs it. The status line then follows the action.
- The palette shows only what you may do, but that is cosmetic: the kernel and the server re-check every request.

| Group | Commands | Who |
|---|---|---|
| Pages | open any page in the focused pane (Shift+Enter: in a split) | dev |
| Panes | Split right, Split down, Open pane in new window, Close pane, Dock all windows | dev |
| Server | Switch to dev branch (or Join a dev branch server; framework 0.6.1+), Reload this server, Roll back this server, Migrate all players to a new server (0.6.1+), New server on this branch (moves only you) | the Branch tab's and Server > Status' rules; New server: owners |
| Branches / Builds | one per [Server > Branch](#server) row with a button: Switch, Load here, Join, with the same words | the Branch tab's rules |
| Servers | Join server `<job id>` (a listed server) | owners |
| Players | a player by name, display name or UserId (opens them in Manage > Players), Kick / Ban (opens their card), Player: Teleport to / Bring / Respawn (0.6.1+; "Player: Respawn me" lists without typing) | owners |
| Experiments | Experiment `<name>`: use `<variant>`, Experiment `<name>`: clear my variant ([Server > Experiments](#server)) | devs where the dev-only tools are open; owners everywhere |
| Copy | job id, artifact id, commit, branch, place version (the copy box) | dev |
| Claude | Ask Claude: `<what you typed>` puts it in the [Claude tab](#claude)'s draft | dev |

"Switch to dev branch" is the branch named `dev`, else the only dev-channel branch; it doesn't show when the server
already runs it or when there are several dev branches and none is named `dev`.

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
  - Server state: owners everywhere, other devs only where the [dev-only tools](#dev-only-tools) are open to them
    (server state can hold player data). Rate-limited and size-capped.
- **Assets:** [hot assets](hot-assets.md): each key, its source (KEPT, BAKED, LOADED, FAILED, LOADING), version,
  load time and last error; on the client, the live copies it sees.

### Server

- **Status:** JobId, server type, uptimes, the build's health window ("3 errors / 30 s"), place version, players,
  memory, server TPS (kernel 0.4.2+), the last deploy message and how long it took to arrive, recent swaps, and (kernel
  0.3.8) **Settings**: the [signed settings record](settings.md) this server holds ("#12, 3m old (sig)"). The senders
  to your backend each get a line: *Fleet API*, *Error reports* (kernel 0.4.0+) and *Analytics* (with an
  `AnalyticsEngine`), plus *Detached jobs* (kernel 0.3.8+) and the kernel version with its API. **Attention** lists
  what needs a look, and the tab shows a **badge** (red for errors, yellow for warnings):

  | Attention item | Meaning |
  |---|---|
  | Kernel update (with **Migrate**) | this server's kernel is older than the newest kernel this framework release knows (0.5.3 in framework 0.7.1): republish the place with the new kernel, then Migrate moves everyone here to a fresh server |
  | Kernel update required (with **Migrate**) | the kernel's API is too old for this framework (same fix) |
  | No game running | no build is mounted on this server |
  | Failed health check | a new build failed its health window here in the last 15 minutes and the server went back to the last good one ([safe deploys](deploy-and-rollback.md#the-health-window-and-the-last-known-good-build)) |
  | Errors n | the running build keeps erroring after its health window |
  | Health window | the new build's window is open: its errors against its limit and the time left, e.g. "1/3 errors, 24 s left" (yellow once an error counted; "no rollback" when [`health`](deploy-and-rollback.md#set-the-health-window) turns it off) |
  | Health settings / No health window | the build's health values were out of range (defaults used) / the place doesn't map the kernel's Health module |
  | Rolled back | an automatic or server rollback happened in the last 15 minutes |
  | Clients failed n / Clients moved n | some players' client side of the build failed to start / those players were moved to another server because their game didn't load here |
  | No fleet API / Fleet settings / Fleet API failing | the kernel can't send to the [fleet API](fleet-and-alerts.md#in-the-dev-menu) |
  | No deploy reports | the kernel is older than 0.3.2 |
  | Booted an unverified prod head | the [boot fail-safe](prod-signing.md#the-boot-fail-safe) ran an unsigned stored build |
  | No trusted prod head | nothing verified for this branch; waiting for a signed deploy |
  | Keys changed / Keys rotated / Fallback Key revoked / Fallback Key only / No signing keys / Rejected n | signing state ([Prod signing](prod-signing.md)) |
  | Hot asset failed / Hot asset missing / Asset manifest | [hot assets](hot-assets.md) |
  | Analytics failing xn / Analytics settings / Analytics dropped n | the [analytics](analytics.md) uploads fail (with the reason, the fix and the next retry), its settings are invalid, or rows were lost |
  | HTTP off | the Claude tab and the fleet API need Allow HTTP Requests |
  | run_luau off | `LoadStringEnabled` is off (dev servers; right for a live game) |
  | Pinned / A/B experiment | this server holds a pinned build |
  | Studio: local payload | a Studio session runs your local code ([Testing in Studio](studio-testing.md)) |
  | Running the backup build / Moving players out / Backup build failed | [never an empty server](deploy-and-rollback.md#never-an-empty-server): nothing else could run, the server runs the place's backup build, or moves players out |
  | Detached job slow / Detached jobs near the cap | [`TypeTorch.runDetached`](player-data.md) jobs run long or near the 256 cap |
  | Registry, High memory | the settings record can't be read; the server uses a lot of memory |
  | No settings / Settings refused / Settings unreadable / Settings copy refused | the [settings record](settings.md) is missing, doesn't verify, can't be read, or a newer copy was refused while a good one is kept (`typetorch settings status`) |
  | Messaging offline / Messaging busy / Messages dropped | [`TypeTorch.messaging`](messaging.md): the kernel can't subscribe, the universe's topic is near its rate limit, or messages were given up |

- **Branch:** this server (type, branch, channel, the running build, whether it is pinned, and `switched by <user>
  <ago>` after an owner's switch), the known branches, and the deployed builds, newest first, grouped by branch (tap a
  row to see what changed). Framework 0.5.2+ labels each group with the branch's own channel, plus `<channel> artifact`
  when the group's newest build has another one (a promoted prod build on a dev branch); older frameworks print the
  channel of the group's first build. The full record per `#seq` (`action`, `channel`, `by`) is `deployments.jsonl`
  ([the deployment log](deploy-and-rollback.md#the-deployment-log)). A row's button says what it does:
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

- **Budget** (kernel 0.4.0+): what TypeTorch spends of this server's DataStore, MemoryStore, HTTP and MessagingService
  limits in the last minute, as bars against Roblox's limits for the player count; who spends it (kernel, devtools,
  analytics, framework, game); the DataStore budget left (shared with your game's own requests); and memory. Older
  kernels show one line.

- **Experiments** (framework 0.7.1+): pick your own variant of an [analytics](analytics.md) experiment. The page lists
  every experiment the game asked about for you (or that the settings name), the variant you're in and why ("random",
  "forced by the settings", "your pick"), a button per variant and **Clear**. The palette has the same commands.
  - It only ever changes your own variant, at most one change a second, and only to a variant the game passed to
    `experiment(...)`. Owners everywhere; other devs where the [dev-only tools](#dev-only-tools) are open.
  - The pick is stored in the analytics DataStore (`TypeTorchAnalytics`, key `dexp/<UserId>`, 32 experiments at most),
    so it follows you to every server. It wins over the signed settings (stop, settle, weights, `players`).
  - Your experiment rows are stamped `forced` while it holds, so the backend leaves you out of the results.
  - The game sees it the next time it asks for your variant, usually your next join ("Rejoin to see it if the game
    asked already").
  - While the rule doesn't allow you (a dev on a prod server, a revoked role), a stored pick is ignored. "Set for this
    server only" means the DataStore write failed. Without an `AnalyticsEngine` the page says "Analytics isn't running
    on this server."

### Manage

Owners only. (Called **Admin** before framework 0.3.2.) Players, Servers and Bans. Every action is re-checked on the
server, logged, and rate-limited.

- **Players:** each player's role, user id and ping, and the actions: Teleport to, Bring, Respawn, Kick (with a
  reason), Ban (1 h, 1 d, 7 d or permanent; alt accounts too by default).
- **Servers:** the game's live servers (type, branch, channel, build, players, uptime), found by a MessagingService roll
  call when you open the list (3 s, cached 15 s; no storage; game code gets the same list from
  [`TypeTorch.servers()`](messaging.md#the-server-list)). A summary line per build says how many servers and
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
can paste into code). Editing (properties, attributes, tags, delete, clone, move) is a
[dev-only tool](#dev-only-tools) and is logged.

### Network

- **Packets:** a remote spy for your `createNetwork` traffic: time, direction, path, kind (fire, invoke, response,
  unreliable), player, size, the guard's verdict (accepted, or why it was rejected), and the decoded arguments. Filter,
  pause, search, and (where the [dev-only tools](#dev-only-tools) are open) block one path on your client. Nothing is
  captured while nobody watches.
- **Stats:** per network leaf, messages in and out, rejected and errors, for the server and your client.

### Claude

Chat with Claude Code running on your own PC, where the [dev-only tools](#dev-only-tools) are open:
[remote-claude](remote-claude.md).

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
| `/tt bundle` | send a [debug bundle](fleet-and-alerts.md#errors-debug-bundles-and-remote-debug) of this server to the backend (kernel 0.5.3+) | dev |
| `/tt dev` | open the dev menu | dev |
| `/tt` / `/tt help` | list the commands | dev |
