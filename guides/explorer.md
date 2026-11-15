# The explorer

The explorer is the web app the [backend](https://github.com/typetorch/backend) serves at its own URL: your
[analytics](analytics.md), live servers, deploys, errors and the backend itself in one place. It reads the same routes
as the CLI and your scripts, and it changes nothing on a game server.

- The Docker image builds it. From a checkout: `bun run web:install` and `bun run web:build` (into `web/dist`).
- `TYPETORCH_EXPLORER=off` serves the API only.
- Everything below is on the backend's main branch (the backend is unversioned: it runs from a checkout or its image).

Contents: [Sign in and roles](#sign-in-and-roles) · [Pages](#pages) · [The filter bar](#the-filter-bar) ·
[Command palette](#command-palette) · [Compare and explain](#compare-and-explain) ·
[Deploy markers](#deploy-markers) · [Saved queries](#saved-queries) · [Tables and links](#tables-and-links) ·
[Roblox parity](#roblox-parity) · [Working on it](#working-on-it)

## Sign in and roles

| Who | Role | How they sign in |
|---|---|---|
| **Owners** (the access list in the game's [signed settings](settings.md), sent by the CLI on every settings write) | admin | Sign in with Roblox (the backend's own OAuth app), Sign in with typetorch.dev, or the admin token |
| **Viewers** (Roblox UserIds in `TYPETORCH_WEB_VIEWERS`, or on the Settings page) | web (read-only) | Sign in with Roblox or typetorch.dev; there is no token for this role |

- The **web** role sees the game's data (queries, SQL, errors, fleet lists, server pages) but never the server's own
  configuration, and every write answers 403. Its sessions show **read-only** next to the name. The pages marked
  *owners* below are hidden from it.
- A session lasts 3 days from sign-in (`TYPETORCH_SESSION_MAX_DAYS`) and survives backend deploys.
- `TYPETORCH_TOKEN_LOGIN=off` hides the admin-token login in the browser (the CLI's Bearer token still works).
- Details: [Security model](security.md), [API keys](api-keys.md), and the backend README's
  [Security](https://github.com/typetorch/backend#security).

The sidebar has a place card on top (the game's name, live players and icon, `GET /v1/place`; also the tab title), and
at its foot who is signed in, with Sign out. The header has the theme toggle (light, dark, system) and **Search...**
(the [command palette](#command-palette)).

## Pages

The sidebar groups them as below. Most pages use the shared [filter bar](#the-filter-bar); the ones marked *own range*
or *own controls* leave it out and have their own controls instead.

**Overview**

| Page | What it shows |
|---|---|
| Overview | players, new and returning players, sessions, playtime, average session, playtime per player, per day (finer for a day or less); a Storage card; pinned [saved queries](#saved-queries) as tiles |

**Players & gameplay**

| Page | What it shows |
|---|---|
| Players | the players in the range with a churn **Risk** column and funnel columns, and a **Churn risk** section (active, at risk, lapsing, churned; for owners, how many at-risk players are subscribed to notifications). A player opens their detail: Roblox profile card, Spending, Playtime, Sessions, Timeline (with the raw join data `jd`), Errors, Feedback and Notifications views; a recorded first session links to its replay |
| Events | the newest rows and the most logged names, by kind, name or player |
| Funnels | logged funnels step by step, and the built-in **Playtime: total** and **Playtime: first session** funnels; Compare with another funnel; a step opens the players who reached it or dropped off there |
| Flow | the merged [node graph](analytics.md#node-graphs) of where players go next and where they quit |
| Retention | two tabs over join-day cohorts: **Players back** (D1 to D30; today, UTC, as an orange partial cell) and **Revenue (LTV)** (revenue per player, Robux per player or payer share, D0 to D30). With the audience filters it answers "did this campaign pay back" |
| Demographics | who plays: Roblox's own age, gender, language, country, platform and OS cards (needs the Open Cloud key, below), and from your join rows country, language, device, account age and Premium |
| Notifications | [experience notifications](notifications.md#the-funnel): the funnel, opt-in, the queue, one player's sends (*own range*) |
| Feedback | [player feedback](feedback.md): the distribution per scale, the trend and the list (*own range*) |
| First session | the `confusion` signals: early leaves, screen loops, back-and-forth, idle spots, camera spins, repeated clicks; each links to its replays |
| Recordings | first-session recordings on a map: layers, replay, quit autopsy, first actions ([Recordings and maps](recordings-and-maps.md)) |
| Maps | each map's exported geometry as a 2D minimap and a 3D map, with positioned events on it ([Recordings and maps](recordings-and-maps.md#maps)) |
| Economy | one currency at a time from server-sent `currency` rows: earned vs spent per day, the running balance, top sources and sinks |
| Monetization | Robux from server-sent `purchase` rows: revenue (after Roblox's 30% cut, Robux paid next to it), purchases, payers, ARPDAU, revenue by product, payer conversion, ARPPU, repeat purchases, new players' first purchase; a product or a bar opens its buyers; Top buyers and Latest purchases |
| Live events | scheduled live value changes and their lift reports ([Live events](live-events.md); *own range*) |
| Experiments | each experiment's state, weights, forced players and results per variant; the owners' **Run it** panel ([Experiments](analytics.md#experiments)) |
| Roblox | Creator Hub-style numbers (`benchmarks`, `realtime`, `trends`), concurrent players by device, and with the Open Cloud key the **Acquisition, from Roblox** section (Roblox's play-through rate and impressions) |

**Observe & troubleshoot**

| Page | What it shows |
|---|---|
| Fleet | (*own controls*) the live servers (TPS, memory, players; a Columns picker that also offers the game's [custom columns](live-debug.md)) and the alerts. Every JobId opens `/servers/<JobId>`: its history and, while it runs, the read-only remote debug tabs ([Live servers and alerts](fleet-and-alerts.md#errors-debug-bundles-and-remote-debug)) |
| Live map | (*own controls*) every live server's players on the exported map at once; its routes are owners only ([Live debug](live-debug.md)) |
| Deploys | (*own controls*) the deploy history, newest first; `/deploys/<seq>` shows one release with before vs after numbers ([Deploy history](fleet-and-alerts.md#deploy-history)) |
| Errors | (*own controls*) error kinds with their players and servers, drop rules (owners) |
| Performance | client frame rate, memory and ping, server TPS and memory, by device, input, screen size, branch or build at p10 / p50 / p90 / p99, with problems flagged; Compare builds or before vs after a mark; Live servers |

**Data**

| Page | What it shows |
|---|---|
| Query | **Named query** (any [query](analytics.md#queries) with its options) and **SQL** (one read-only `SELECT` over `events` and `recordings`, `POST /v1/sql`), with [saved queries](#saved-queries) |

**Admin** (owners)

| Page | What it shows |
|---|---|
| Settings | the runtime settings: alerts and backend alert rules, access (viewers, allow list, token login), rate limits, retention, API keys, notifications; Send test alert, backups and disk, recent changes ([Running the backend](backend-operations.md)) |
| Backend stats | the backend process itself: requests, queries and inserts per second, latency, memory, CPU, event loop lag, per route group |
| Audit log | every state-changing admin action, filtered by actor, action and outcome |

While Sign in with typetorch.dev is on, a **TypeTorch Dashboard** link sits at the bottom of the sidebar.

## The filter bar

The shared filters live in the URL, so a view can be bookmarked or shared.

| Filter | Values |
|---|---|
| Range | Last 1 hour, Last 6 hours, Today, Last 3 days, Last 7 / 30 / 90 days (30 by default), Since last prod deploy, Custom (dates) |
| Branch, build, device | from the values seen in the range |
| Players | new or returning |
| Experiment | one experiment's variant |
| **Audience** | country, language, account age, Premium, join source (URL `country`, `lang`, `age`, `prem`, `source`) |

- Days are UTC. The hour presets send an exact instant; the day presets and custom ranges send dates. **Since last prod
  deploy** starts at the latest `prod` release in the deploy history (today when there is none).
- Charts step by the window: per minute up to an hour, per 5 minutes up to 6 hours, per hour up to a day, else per day.
- **Audience** filters are player-level: a player matches when one of their join rows in the range has the values, and
  then all their rows count ([Queries](analytics.md#queries)). Countries and languages list what the range saw. The
  button names what is picked ("United States, Premium").

## Command palette

**Ctrl+K** (Cmd+K on a Mac, also from inside a text field) or the header's **Search...** button.

- Fuzzy search over every page (the shared filters are kept; owner-only pages only for owners).
- "Open player `<pid or UserId>`", the range presets, Clear filters, Copy link to this view, Refresh data, the theme,
  Sign out. Pages add their own (the Players page: Copy this player's pid).
- Arrows and Enter run, Escape closes. An empty query lists your recent commands first (remembered in the browser).

## Compare and explain

- **vs previous period**: a chip in the header of the Overview, Errors and Performance pages (`vs=prev` in the URL). The
  Overview's tiles get a change against the period before (same length, same filters; "7 days" compares with the 7 days
  before up to the same time of day), and each per-day chart a dashed previous-period line.
- **Explain this change**: with the chip on, each Overview tile gets a **Why?** button, and the Retention page an
  **Explain the D1 change** button. A side panel runs the `explain` query: a plain headline ("D1 fell 4.1 points; 72%
  of it is phones (rate) ..."), both periods' values, the segments of one dimension (device, country, language, account
  age, Premium, join source, build, branch, new / returning) with their **rate** effect (the segment got better or
  worse) and **mix** effect (its share of players changed). Segments under 30 players are marked "few players". Click a
  segment to split it by the other dimensions.

## Deploy markers

The time charts (Overview, error series, Performance, a server's graphs, Backend stats) carry a vertical line per release
labelled `#<seq> <branch>`, plus kernel publishes, backup refreshes (`GET /v1/fleet/marks`) and each
[live event](live-events.md)'s start and end. Hover for details; a release opens its deploy page (Performance filters to
that build instead). The **Deploys (n)** chip hides them on every chart (remembered in the browser).

## Saved queries

On the Query page's SQL tab:

- Pick a saved query to load and run it (`?saved=<id>`, a shareable link).
- Owners name and save it, choose a table, bar or line chart (the first column is the axis, up to four number columns
  the series), **Pin to Overview** (its own range, not the filter bar's), and delete it (for everyone).
- Viewers list and run them. Saving never runs the query; each run is a normal `POST /v1/sql` with every check.
- At most 200 queries and 12 pinned; the SQL of each at most 32 KB. Routes: `GET /v1/saved-queries`, `POST`, `PATCH /<id>`, `DELETE /<id>`
  (owners).

## Tables and links

- Every table sorts (shift-click adds a column), searches, filters per column, has a **Columns** picker, resizable
  widths, pages, copy a cell or a row as JSON, and **Export** of the filtered view as CSV. Its view is remembered in the
  browser and written to the URL.
- Entities link everywhere: a JobId opens its server page, a player their Players page, an error kind its side sheet, a
  build its errors and its Performance marks.
- Hovering or focusing a player link opens a small card with the Roblox headshot, names, UserId and pid; a product id
  shows the product's name, icon and price.

## Roblox parity

The Roblox page's `benchmarks`, `realtime` and `trends` follow Creator Hub's definitions: UTC days, full days only, a
session counted on the day it started, DAU and MAU (30 days ending on the period's last day), new users as first-ever
sessions, retention by first play date, ratios over several days as the mean of the daily values, revenue as Robux x
0.7, CCU as the peak minute. Studio play tests never count.

What can't match is marked on the page: new users and retention are estimates (the first visit the SDK saw), revenue
counts logged purchases only, CCU comes from heartbeats about once a minute, join sources are the game's own, and Creator
Hub's numbers settle a day or more later. The full rules: the backend README's
[Roblox parity](https://github.com/typetorch/backend#roblox-parity).

**Roblox's own numbers** need `OPENCLOUD_API_KEY` with `universe.analytics:read` and `TYPETORCH_UNIVERSE_ID` on the
backend: the Roblox page's Acquisition section (`GET /v1/roblox/analytics/acquisition`) and the Demographics page's
Roblox cards (`GET /v1/roblox/demographics`). Without them the page says how to turn them on. Other scopes:
[Open Cloud key scopes](backend-operations.md#open-cloud-key-scopes).

## Working on it

`bun run web:dev` in the backend repo (or `cd web && bun run dev -- --game <game repo>`) starts Vite with a proxy to the
backend, using the admin token from the game repo's `.env` (`TYPETORCH_ADMIN_TOKEN`) and the URL in `typetorch.json`
(`backend.url`), or `--url http://127.0.0.1:8787`. The token never reaches the browser, and there is no login page.
Adding a page: one line in `web/src/lib/nav.ts` and its route in `web/src/main.tsx`.
