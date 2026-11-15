<img src="brand/typetorch.svg" width="72" alt="TypeTorch logo">

# TypeTorch docs

TypeTorch updates live Roblox games **without restarting their servers**. You write the game in
[roblox-ts](https://roblox-ts.com). Each build becomes one artifact (an uploaded, private Model asset), and every live
server hot-swaps to it in a few seconds while players stay in the game.

These docs are also a website: **[www.typetorch.dev](https://www.typetorch.dev)**.

> **Status: early.** The core loop runs on live Roblox servers today. APIs and commands still change. These docs
> describe the code as it is now. Features that don't exist yet are marked **planned**.

> **Your game never builds or deploys in CI.** TypeTorch ships no workflows for games, and nothing needs your Open Cloud
> key or signing keys in a hosted CI: builds, cloud tests, signing and deploys run on your own machine. (TypeTorch's own
> packages are released from a version tag by a GitHub workflow with npm trusted publishing; see
> [Releases](#releases).)

## Get started

Not sure TypeTorch fits you or your game? Read **[Is TypeTorch for me?](getting-started/is-it-for-me.md)** first
(short answer: it's built for AI agents and for developers who know git).

Pick one path:

| You have | Start here | Time |
|---|---|---|
| Nothing yet: a new game | **[Fresh setup](getting-started/fresh-setup.md)**: `bunx @typetorch/cli init` in an empty folder, or every step by hand; from zero to a live hot-swap | under an hour with `init` |
| A roblox-ts game | **[Migrate an existing game](getting-started/migrate.md)**: services, swap safety, networking, data, UI; with live players, inside the [go-live checklist](guides/go-live-checklist.md) | a few hours to days; about a week with live players |
| An AI coding agent | **[Agent playbook](agents/AGENTS.md)**: tell your agent "migrate this project to typetorch" | |

TypeTorch is **roblox-ts only**. A plain Luau game has to move to roblox-ts first.

The template's package versions are behind npm. After cloning it (or after `init`), take the newest `@typetorch/*`
packages: [Take the newest versions](getting-started/fresh-setup.md#take-the-newest-versions).

## How it works

```mermaid
flowchart LR
    A[typetorch deploy] --> B[build: roblox-ts -> payload.rbxm]
    B --> C[upload as a private Model asset<br/>moderation check]
    C --> T[cloud test<br/>prod: always]
    T --> D[approve y/N<br/>prod: signed]
    D --> E[deploy message<br/>MessagingService]
    E --> F[live servers: the kernel loads the payload]
    F --> G[old version stops, new one starts<br/>server + clients, no restart]
    G --> R[reports to the fleet API<br/>bad build: automatic rollback]
```

- **Kernel:** a small Luau loader baked into the place. It picks each server's branch, loads payloads and swaps them.
  It is the only part that needs a place publish and a server restart to change.
- **Payload:** your compiled game code (ModuleScripts only), uploaded once per build.
- **Framework:** `@typetorch/framework`, the roblox-ts library your game uses: modules with dependency injection and
  lifecycle hooks, troves for cleanup, guarded networking, UI helpers, hot assets and the in-game dev menu. It ships
  inside every payload, so it hot-swaps too.
- **Branches:** public servers run `prod`. Any other branch (`dev`, `feature-x`) runs in private or reserved servers of
  the same game.
- **CLI:** `typetorch` (or the short alias `tt`) builds, uploads, tests, approves, signs and deploys, rolls back, shows
  live servers and alerts, patches the kernel into the place, and runs the Studio loop (`typetorch serve`).
  `typetorch update` keeps it current.
- **Studio plugin:** attaches Studio to `typetorch serve` by itself, reloads a running playtest on save, publishes hot
  assets from a panel, and has a Claude tab for `typetorch serve --claude` (it needs `@typetorch/dev-server` 0.4.0,
  which is not on npm yet; see [remote-claude](guides/remote-claude.md#from-studio)).
- **Safe deploys:** a cloud test before every prod publish; on each server a health window that rolls a failing build
  back; `deploy --wait`, which rolls the branch back when a build fails on 20% of servers; a new server plays within
  15 s.
- **Backend (optional, self-hosted):** live server status, deploy reports and history, alerts, error logs and debug
  bundles from the kernel, read-only remote and live debug of one live server, your own analytics (experiments,
  funnels, player journeys, first-session recordings on your maps), experience notifications, player feedback, live
  events, and the web explorer that shows all of it. It runs from a checkout or its Docker image.

## Guides

**Build your game**

| Guide | What it covers |
|---|---|
| [Runtime API](guides/runtime-api.md) | `TypeTorch.*`: identity, start info, swap events, persist, playerState, `Dependency<T>()`, roles, logs, messaging, detached jobs, live settings and live events, live debug (`remoteDebug`, `fleet`), notifications and feedback |
| [State with charm](guides/state.md) | charm atoms across swaps: server atoms from `persist`, charm-sync over `createNetwork`, the client's hydrate request |
| [Networking](guides/networking.md) | `createNetwork`, guards, limits, requests, timeouts, `emit` |
| [Cross-server messages](guides/messaging.md) | `TypeTorch.messaging` (one kernel-held topic, dev branches kept off prod, limits), `TypeTorch.servers()` |
| [Player data](guides/player-data.md) | the swap-safe data pattern (library writes as DataHost jobs or `TypeTorch.runDetached`), ProfileStore and ProfileService examples, the cloud test and developer product receipts |
| [Loading screens](guides/loading-screen.md) | your own loading screen: `ClientReady`, `Holding`, `TypeTorchBootScreen`, `TypeTorchKernelScreen` |
| [Hot assets](guides/hot-assets.md) | models and UI templates from the place, updated live with `hotAsset()`; from the CLI or the Studio plugin |
| [The dev menu](guides/dev-menu.md) | every tab, owners and devs, the dev-only tools, the command palette, the `/tt` commands |
| [Player feedback](guides/feedback.md) | `TypeTorch.feedback().submit(player, { rating, text, topic, ctx })`, rating scales (thumbs, stars, a labelled scale) in `game.feedback`, rate limits, the Feedback page, moving from a custom event |
| [Coming from Flamework](guides/from-flamework.md) | `typetorch migrate --from flamework` (the codemod and its report), `createFlameworkCompat`, the mapping |

**Deploy**

| Guide | What it covers |
|---|---|
| [Deploy and rollback](guides/deploy-and-rollback.md) | deploy, the compiler (goblox or rbxtsc), the production pack (darklua), approval, safe deploys (cloud test, health window, `--wait` and automatic rollback, reports), promote, rollback, deploy marks on the backend, the backup build (automatic refresh, `--reupload`), the build cache, pins, kernel updates |
| [Branches and channels](guides/branches-and-channels.md) | `prod` and `dev`, private servers on a branch, `/tt new`, owners switching any server in place, `branch rm` |
| [Prod signing](guides/prod-signing.md) | the Root Key and Fallback Key, `typetorch keys`, kernel 0.3 verification, bootstrap heads, the boot fail-safe |
| [Settings](guides/settings.md) | the signed settings record: dev access, backend, the analytics dials, your own live values (`liveConfig`), the reserved game keys (`tt.events`, `feedback`), `typetorch settings` |
| [Go-live checklist](guides/go-live-checklist.md) | moving a game with live players: prepare, a copy, a dev-branch soak, live tests, cut-over, what to do if it goes wrong |

**Operate** (the self-hosted backend)

| Guide | What it covers |
|---|---|
| [Live servers and alerts](guides/fleet-and-alerts.md) | the fleet API, `typetorch servers`, `report`, `alerts`, server lost and stuck, backend alerts, the deploy history, webhooks, error logs, debug bundles, remote debug, debugging endpoints |
| [Live debug](guides/live-debug.md) | game-declared read-only commands, streams and Fleet columns, the live map of one server or all of them, limits and safety rules |
| [The explorer](guides/explorer.md) | the backend's web app: sign-in and roles, every page, the filter bar, the command palette, compare and explain, deploy markers, saved queries |
| [Analytics](guides/analytics.md) | `AnalyticsEngine`, the event format, positions, the join row and its raw join data (`jd`), DuckDB or Basin, the analytics dials, experiments and live overrides (`typetorch experiment`), queries, node graphs, privacy, a local quick start |
| [Recordings and maps](guides/recordings-and-maps.md) | first-session recordings and positioned events on each map's real geometry: map export, replay, quit autopsy, first actions |
| [Live events](guides/live-events.md) | scheduled changes of live values ("double cash this weekend"), signed once with `typetorch settings set game.tt.events -`, and the lift report |
| [Notifications](guides/notifications.md) | native Roblox experience notifications: kinds in `typetorch.json`, `TypeTorch.notifications()` (`want`, `drop`, `setOff`, `onOpen`, `promptOptIn`), templates made by hand (`typetorch notify templates`), signed taps, the funnel, `typetorch notify` |
| [Running the backend](guides/backend-operations.md) | runtime settings, backend alerts, the audit log, backups and restore, disk space, moving the backend, backend stats, deploys on Coolify, API docs for agents, Open Cloud key scopes |
| [Emergency backend scale-ups](guides/emergency-scale-ups.md) | a sudden surge: what keeps working (the busy 503), how much one backend takes, shed load from the CLI, resize the VPS and tune DuckDB, move to another server, analytics to Basin and back, several ingest servers |
| [API keys](guides/api-keys.md) | named backend keys with roles (`game`, `lookup`, `support`, `analyst`, `admin`) and scopes, `typetorch keys create/list/revoke` (the next CLI release), the per-player support endpoints, the event allow-list, per-key rate limit and audit, built-in env tokens; the export API and migration take the env admin token only |
| [Security model](guides/security.md) | who can do what, dev access (`access push`), the backend, devtools for devs only, keys, signing, remote Studios, never publish secrets |
| [Troubleshooting](guides/troubleshooting.md) | real errors and their fixes |

**Tooling**

| Guide | What it covers |
|---|---|
| [Testing in Studio](guides/studio-testing.md) | `typetorch serve` and the Studio plugin: your local code with the real kernel, live reload in a playtest, agents driving Studio, a Studio on another machine |
| [remote-claude](guides/remote-claude.md) | prompt Claude Code from inside a dev server or from Studio (`serve --claude`): Live and Code modes, screenshots, Toolbox |

## For agents

- [agents/AGENTS.md](agents/AGENTS.md): the migration and setup playbook for any coding agent (Claude Code, Codex,
  Cursor and others).
- [agents/skills/typetorch-migrate/SKILL.md](agents/skills/typetorch-migrate/SKILL.md): the same playbook as a Claude
  Code skill.
- Claude Code plugin ([typetorch/claude-plugin](https://github.com/typetorch/claude-plugin)):

  ```text
  /plugin marketplace add typetorch/claude-plugin
  /plugin install typetorch@typetorch
  ```

  Then say "migrate this project to typetorch", or run `/typetorch:typetorch-migrate`.
- [llms.txt](llms.txt): an index of these docs for LLMs, served at
  [www.typetorch.dev/llms.txt](https://www.typetorch.dev/llms.txt) with every link pointing at a Markdown page.
  [www.typetorch.dev/llms-full.txt](https://www.typetorch.dev/llms-full.txt) is every page in one file.
- Every page of the site is also Markdown: add `.md` to its URL
  ([/guides/analytics.md](https://www.typetorch.dev/guides/analytics.md)), or request the page with
  `Accept: text/markdown`. Each page also has **Copy page as Markdown** and **View as Markdown** buttons.

## Repositories

| Repository | What it is |
|---|---|
| [kernel](https://github.com/typetorch/kernel) | the Luau loader baked into the place |
| [framework](https://github.com/typetorch/framework) | `@typetorch/framework`, the roblox-ts framework (ships in every payload) |
| [cli](https://github.com/typetorch/cli) | `@typetorch/cli`: `typetorch` (alias `tt`), the command line tool |
| [studio-plugin](https://github.com/typetorch/studio-plugin) | the TypeTorch Studio plugin (`TypeTorchSync.rbxm` on GitHub releases; not on npm) |
| [template](https://github.com/typetorch/template) | the starter game (Target Rush), also the reference setup |
| [transformer](https://github.com/typetorch/transformer) | `@typetorch/transformer`, the compiler plugin for guards and dependency injection |
| [dev-server](https://github.com/typetorch/dev-server) | `@typetorch/dev-server`, `remote-claude`: Claude Code on your PC, prompted from inside a dev server or from Studio |
| [backend](https://github.com/typetorch/backend) | the backend: analytics (DuckDB, or Basin), the fleet API (SQLite), error logs, debug bundles, remote and live debug, notifications, feedback, live events and the web explorer (run from a checkout or its Docker image; not on npm) |
| [claude-plugin](https://github.com/typetorch/claude-plugin) | the Claude Code plugin marketplace with the `typetorch-migrate` skill |
| dash (private) | [dash.typetorch.dev](https://dash.typetorch.dev): one Roblox sign-in for every backend you own or view (optional) |

## Conventions in these docs

- Commands work in PowerShell 5.1 and bash unless a block says otherwise.
- `bun run typetorch <command>` runs the CLI: `@typetorch/cli` from npm, in the game's dev dependencies with the
  script `"typetorch": "typetorch"` (the template has both; see
  [fresh setup](getting-started/fresh-setup.md#2-get-the-code)). Without it, `npx @typetorch/cli <command>` does the
  same. Installed globally (`npm i -g @typetorch/cli`), it is `typetorch <command>` or `tt <command>`.
- Ids in examples are fake: universe `1234567890`, place `9876543210`, group `1234567`, user `111111111`.

## Releases

The npm packages (`@typetorch/cli`, `kernel`, `framework`, `transformer`, `dev-server`) are published only from a
version tag: a maintainer runs `npm version <x.y.z> -m "release %s" && git push origin main --follow-tags`, and the
repo's `publish.yml` workflow checks that the tag matches `package.json`, runs the package's `prepublishOnly` checks,
publishes with provenance through npm trusted publishing (`x.y.z-next.N` goes to the `next` dist-tag, anything else to
`latest`) and makes the GitHub release. The workflows still accept an `NPM_TOKEN` repository secret as a fallback. No
workflow runs on pull requests except the CLI's tests (`ci.yml`).

The Studio plugin is released the same way, from a tag, as `TypeTorchSync.rbxm` on its GitHub release. Roblox doesn't
accept plugin uploads through Open Cloud yet (the release job warns and skips that step), so the Creator Store copy is
published by hand in Studio with **Publish as Plugin**. Install from the GitHub release
([Testing in Studio](guides/studio-testing.md#set-up-once)).

## The docs site

These Markdown files are also the site at [www.typetorch.dev](https://www.typetorch.dev) (and `typetorch.dev`): VitePress,
served by a Cloudflare Worker. `bun install`, then `bun run docs:dev` for a live preview, `bun run docs:build` to build
(dead links fail it). New pages go into `.vitepress/sidebar.ts`. `bun run sync:reference` copies the public package
READMEs into `reference/`. `bun run deploy` builds and deploys with the Cloudflare CLI (`cf deploy`, config in
`cloudflare.config.ts`; needs `cf auth login` and Node 22.18+); `bun run deploy:check` is the dry run.

## Logo

The TypeTorch logo, its PNG and favicon exports, colours and usage rules are in [brand/](brand/README.md).

## License

MIT
