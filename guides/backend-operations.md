# Running the backend

The day-to-day side of the self-hosted [backend](https://github.com/typetorch/backend): settings you change without a
redeploy, its own alerts, the audit log, backups, disk space, its own performance, the API docs, and the Open Cloud
key's scopes. Setting it up is in [Fresh setup](../getting-started/fresh-setup.md) and the backend README
([Deploy on Coolify](https://github.com/typetorch/backend#deploy-on-coolify),
[Run it on a VPS without Docker](https://github.com/typetorch/backend#run-it-on-a-vps-without-docker)).

The backend is unversioned: it runs from a checkout or its Docker image, and this page follows its main branch. The
explorer pages named here (Settings, Backend stats, Audit log) are under **Admin**, for owners only
([The explorer](explorer.md)).

Contents: [Environment](#environment) · [Runtime settings](#runtime-settings) · [Backend alerts](#backend-alerts) ·
[Audit log](#audit-log) · [Backups and restore](#backups-and-restore) · [Disk space](#disk-space) ·
[Moving the backend](#moving-the-backend) · [Backend stats](#backend-stats) · [Deploys on Coolify](#deploys-on-coolify) ·
[API docs for agents](#api-docs-for-agents) · [Open Cloud key scopes](#open-cloud-key-scopes)

## Environment

Everything starts as an environment variable (Coolify's environment, a systemd `EnvironmentFile`, or `--env-file`).
The server refuses to start without the two required ones:

| Variable | What |
|---|---|
| `TYPETORCH_API_KEY` | the game key: game servers write with it, it reads nothing. 32+ characters |
| `TYPETORCH_ADMIN_TOKEN` | the admin role, for the CLI and the explorer's token login. 32+ characters, different from the API key |

The full list (public URL, proxies, sign-in, Open Cloud, retention, limits, DuckDB): the backend README's
[Settings](https://github.com/typetorch/backend#settings). Values are never printed; the startup line and `/healthz`
only say whether something is set.

## Runtime settings

A running container can't re-read its environment, so the explorer's **Settings** page changes a short list of settings
while the server runs. The environment gives the default, a value saved on the page wins, and **Reset to env** goes
back. A change applies to the next request; nothing restarts.

| Group | Settings |
|---|---|
| Alerts | the alert webhook (a secret: never shown again), its format, the levels sent; **Send test alert** (3 a minute) |
| Backend alerts | the master switch, repeat window, hourly cap, and per rule on / off, level and thresholds ([below](#backend-alerts)) |
| Access | viewers (Roblox UserIds with the read-only web role), the admin allow list, the admin token login |
| Rate limits | ingest per address and per server, error logs per address, new servers per minute, and the busy 503's limits (raw backlog, requests in flight; [Emergency scale-ups](emergency-scale-ups.md#first-the-game-keeps-running)) |
| Retention | analytics history, raw archives, error logs, the audit log, the deploy history; error kinds and rows per day; error drop rules (the Errors page edits them) |
| API keys | requests a minute per [named key](api-keys.md), the events support keys may read |
| Notifications | pause, dry run, the send rate, the daily cap clock, when presence goes stale, per-kind switches ([Notifications](notifications.md)) |

- **Lockout guards:** an allow list that wouldn't include your own address is refused (409); turning off the token
  login is refused (409) unless Sign in with Roblox is set up and you are signed in with Roblox right now. Locked out anyway: set
  `TYPETORCH_RUNTIME_SETTINGS=off` and redeploy (the saved file is kept but ignored, the page is read-only).
- **Not editable** there (change the environment and redeploy): the keys and tokens, the OAuth client, the Open Cloud
  key, the public URL, the proxy settings, the data folder, the port.
- Saved in `<data dir>/runtime-settings.json` (mode 0600; it holds the webhook URL, so treat backups of it as secret).
- API (admin): `GET /v1/admin/settings`, `PATCH /v1/admin/settings` (`{ "<key>": value | null }`, null = back to the
  environment), `POST /v1/admin/settings/test-alert`.

Every key and bound: the backend README's
[Runtime settings](https://github.com/typetorch/backend#runtime-settings-the-settings-page).

## Backend alerts

Next to the kernel's alerts, the backend watches its own data once a minute: error spikes, a new error after a deploy,
a drop in players online, a silent fleet, stopped ingest, slow requests, memory, event loop lag, 5xx answers, low disk
and a disk filling up. They go to the Fleet page's alerts and the same webhook. The rules, their defaults and the
`TYPETORCH_ALERT_*` variables: [Live servers and alerts](fleet-and-alerts.md#backend-alerts).

- Edit them on the Settings page's **Backend alerts** section (each rule shows what it saw on its last run).
- `GET /v1/admin/alert-rules` (admin) answers each rule's state (`ok`, `waiting`, `firing`, `off`, `unavailable`), when
  it last fired, and the raised, deduped and throttled counts since the start.
- They need the fleet part (`TYPETORCH_PARTS` includes `fleet`, the default).
- Two more come from the optional ingest queue, on the main server (`TYPETORCH_ROLE=main`): `queue_bucket_down`
  (critical, when the queue bucket can't be reached for a minute) and `queue_file_bad` (a queued file that can't be
  loaded, skipped for 10 minutes). [Several ingest servers](emergency-scale-ups.md#5-several-ingest-servers-optional).

## Audit log

Every state-changing admin action is a row in the fleet SQLite file: sign-ins and failed sign-ins, sign-outs and
lockouts, settings changes (old and new values; the webhook URL only as set / not set), the owner list, trusted
browsers, alert acks, erasure (counts only), backups, live events, remote debug watches and commands, the CLI's release
starts and marks, experiment changes prepared on the Experiments page, and any other write by a signed-in caller.

- Each entry: the time, who (`admin token`, `roblox user <id> (<name>)`, `typetorch.dev user <id> (<name>)`,
  `api key`, ...), the role, how (`bearer` or `cookie`), the address, the action, the outcome (`ok`, `failed`,
  `refused`), the HTTP status and the details.
- **Never a secret:** tokens, keys, secrets and the webhook URL become `[redacted]`.
- Kept `TYPETORCH_AUDIT_KEEP_DAYS` days (365; the `auditKeepDays` runtime setting), at most 200,000 rows.
- The **Audit log** page filters by actor, action and outcome; `GET /v1/admin/audit?actor=&action=&outcome=&since=&until=`
  (admin) pages through it.

## Backups and restore

A backup is consistent and safe while the server runs: SQLite by `VACUUM INTO`, DuckDB copied and the Parquet day files
hard-linked between the warehouse's jobs, the notifications database, plus the small state files (access list,
runtime settings, trusted browsers, the settings copy, the instance key, the notification signing keys, erasure and
audit folders).

| Variable | Default | What |
|---|---|---|
| `TYPETORCH_BACKUP_HOURS` | `24` | hours between local backups (`0` = only on demand) |
| `TYPETORCH_BACKUP_DIR` | `<data dir>/backups` | where they go (the same volume by default: mount another one, or download) |
| `TYPETORCH_BACKUP_KEEP` | `3` | how many are kept |

- **Back up now** and **Download backup** are on the Settings page. `GET /v1/admin/backups` shows the schedule, the last
  outcome and the local backups; `POST` makes one now.
- The download (`POST /v1/admin/backups/download`, admin) streams a tar of a fresh backup, without the alert webhook URL,
  the instance key and the notification signing keys (after restoring one, run `typetorch notify key rotate` again):

  ```sh
  curl -X POST -H "Authorization: Bearer $TYPETORCH_ADMIN_TOKEN" -o backup.tar https://backend.example.com/v1/admin/backups/download
  ```

- During a deploy handover a backup answers 503 (the other container holds DuckDB).
- **Restore:** stop the app, move the old database files and day folders aside, copy the backup in, start the app. The
  exact steps: the backend README's [Backups and restore](https://github.com/typetorch/backend#backups-and-restore).

## Disk space

The server measures the data folder's disk every 10 minutes. Under `TYPETORCH_DISK_WARN_PERCENT` (15) percent free it
warns, under `TYPETORCH_DISK_CRITICAL_PERCENT` (5) it is critical (`0` turns a level off). The level shows on the
Overview's Storage card and the Settings page's **Backups and disk** card, in `GET /v1/storage` and
`GET /v1/admin/backups`, and in `/healthz` for the admin token. With the fleet part on, a `disk_low` alert goes out
like any fleet alert. To make room: shorter retention on the Settings page, fewer local backups, or a bigger volume.

## Moving the backend

The steps for a new server, moving analytics to Cloudflare Basin and back, and several ingest servers are in
[Emergency scale-ups](emergency-scale-ups.md#3-move-to-another-server). The operator facts:

- **Export API** (`/v1/admin/export/*`): read-only, one export at a time, 120 requests a minute. It takes the env admin
  token as a Bearer only: no browser session, no web role, no named key, no game key.
- **Migration** (`/v1/admin/migrate`): `GET` (the status) is for the admin role. Starting, pausing, resuming, cancelling
  or resolving a page is `POST`, and it takes the env admin token only (a named key gets `403`).
- **Both servers run the same backend version**, because one version pins one DuckDB. Update the old server first.
- **Never copy the data folder** to move a server. The move copies rows through the APIs, and a backup is the safe copy
  ([Backups and restore](#backups-and-restore)).

## Backend stats

The **Backend stats** page (`GET /v1/admin/stats?window=1m|5m|15m|1h`, admin) shows the backend process itself, like
Roblox's Performance tab for a game server:

- tiles for the last 10 seconds: requests (and 5xx) per second, DuckDB queries per second, rows inserted per second,
  request latency p50 / p90 / p99, memory, CPU, event loop lag, uptime;
- charts over the last 2 minutes (per second) or 60 minutes (per minute);
- a table per route group (ingest, fleet, queries, SQL, sign-in, admin, explorer files, ...) over a picked window.

It updates every 2 s (Pause stops it). Everything is in memory and bounded; long-held streams and long-polls are counted
as requests but left out of the latency percentiles.

The same numbers are in `GET /v1/admin/stats?window=1m|5m|15m|1h` (admin). Two blocks were added for the busy 503 and the
ingest queue:

- `ingest`: `busy` (refusals since the start), `inflight` (ingest requests being handled now) and `lastBusyAt`.
- `queue` (only when `TYPETORCH_ROLE` isn't `all`): `role`, `pendingFiles`, `pendingBytes`, `lastLoadAt`, `files`,
  `errors`, `lastError`, `lastErrorAt`, `bucket`, `truncated`, `identities`. A node reports its own numbers in its
  `GET /healthz` with the admin token (`queue`, `ingest`).

Details: [Several ingest servers](https://github.com/typetorch/backend#several-ingest-servers-optional) and
[Limits and the busy 503](https://github.com/typetorch/backend#limits-and-the-busy-503) in the backend README.

## Deploys on Coolify

Rolling updates work: deploy as usual. DuckDB lets one process open the database, so the two containers hand over:

1. The new container starts in **handover** while the old one holds the data folder. `/healthz` answers 200, the fleet
   API, error logs, sign-in and the explorer work; what needs DuckDB (ingest, queries, SQL, erasure) answers 503 with
   `Retry-After: 5`. It gives up after `TYPETORCH_HANDOVER_SECONDS` (600) and exits 1.
2. The old container stops within seconds on `SIGTERM`: running requests finish, raw files are synced, DuckDB and
   SQLite close.
3. The new container opens DuckDB within a second and takes over.

Game servers ride over the gap: the framework re-sends a batch that got 503 after at least its `Retry-After` (framework
0.7.2+; older ones use their own backoff), and the kernel's fleet sender retries. Details: [Deploys on Coolify (rolling updates)](https://github.com/typetorch/backend#deploys-on-coolify-rolling-updates).

## API docs for agents

| Route | What |
|---|---|
| `GET /openapi.json` | an OpenAPI 3.1 spec of every route (roles, parameters, bodies, the query names) |
| `GET /docs` | Swagger UI over it; **Authorize** takes the admin, API or lookup token, or uses your explorer session |
| `GET /llms.txt` | what this server is, for an LLM agent, with links to the spec, the backend README, these docs and the source |

They hold no data or settings and need no credentials, but answer 404 outside `TYPETORCH_ADMIN_ALLOW_IPS` like the
explorer. Point an agent at `https://<backend>/llms.txt`, and give it the narrowest key that does the job (a lookup token
or a named [API key](api-keys.md)), not the admin token.

## Open Cloud key scopes

Every Roblox feature of the backend uses one Open Cloud key, `OPENCLOUD_API_KEY`, on the game's universe
(`TYPETORCH_UNIVERSE_ID`). Give it only the scopes for the features you use; without a scope the feature is off, and its
route or page says which scope is missing.

| Feature | Scope | Also needs |
|---|---|---|
| Right to erasure: map a UserId to its pids | `universe-datastores.objects:read` | `ROBLOX_WEBHOOK_SECRET` ([Privacy](analytics.md#privacy-and-right-to-erasure)) |
| Right to erasure: delete the DataStore link too | `universe-datastores.objects:delete` | `TYPETORCH_ERASURE_DELETE_LINK=1` |
| Identity backfill (`POST /v1/identity/backfill`) | `universe-datastores.objects:list` and `:read` | |
| Live events: "Do servers have it?" | `universe-datastores.objects:read` | ([Live events](live-events.md)) |
| Remote debug instant wake, live map wake | `universe-messaging-service:publish` | kernel 0.5.1+ / 0.5.7+ ([Live debug](live-debug.md)) |
| Roblox server logs per JobId | `universe:read` | kernel 0.5.6+ sends the place version |
| Roblox page acquisition, Demographics cards | `universe.analytics:read` | ([The explorer](explorer.md#roblox-parity)) |
| Map export | `universe.place.luau-execution-session:read` and `:write` | ([Recordings and maps](recordings-and-maps.md#export)) |
| Map "out of date" check | `asset:read` | falls back to the place version the fleet reports |
| Experience notifications | `user.user-notification:write` | `OPENCLOUD_NOTIFY_KEY` if set, else `OPENCLOUD_API_KEY` ([Notifications](notifications.md)) |

The key is sent only in the `x-api-key` header to Roblox and never logged. The game repo's own Open Cloud key (deploys,
the settings record) is separate: [Security model](security.md#keys-and-tokens).
