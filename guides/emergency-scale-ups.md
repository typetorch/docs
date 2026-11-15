# Emergency backend scale-ups

Your game took off overnight and the [backend](https://github.com/typetorch/backend) is falling behind. Two moves need no
new code and no game deploy:

| Move | Time | Downtime | What it buys |
|---|---|---|---|
| [1. Shed load](#1-shed-load) | 2 minutes, from your phone's terminal | none | about 4x fewer ingest requests, no new recordings |
| [2. Resize the VPS in place](#2-resize-the-vps-in-place) | 5 to 10 minutes | a few minutes | DuckDB loads and queries use the bigger machine |
| [3. Move to another server](#3-move-to-another-server) | the switch takes a minute; the history moves in the background | none for the game | a new machine or provider, with its history |
| [4. Analytics to Basin and back](#4-analytics-to-basin-and-back) | a minute to switch the sink; the history moves in the background | none for the game | analytics leaves the server (or comes back) |
| [5. Several ingest servers](#5-several-ingest-servers-optional) | set-up work, no game change | none | ingest past one core |

Do 1 first, then 2. Moves 1 and 2 change neither the game nor its URL. Moves 3 to 5 do change where the backend or its
analytics live, but the game only follows a settings change, not a deploy.

**Versions.** Moves 3 to 5 need the backend from its main branch of 2026-11-15 or later, and the CLI 0.19.0 or later.
The game needs framework 0.7.2 or later to wait for the backend's busy answer and to use `backend.ingest`.

## First: the game keeps running

The backend is never on the players' path. When it is slow or down:

- **Players:** nothing changes. Servers run their build as before.
- **Deploys:** they work. `deploy --wait` and the health checks skip their wait with a note
  ([Live servers and alerts](fleet-and-alerts.md)).
- **Analytics:** each game server keeps a queue in memory: up to 10,000 event rows, 2,000 fleet rows and 300
  recording chunks. A batch that gets `408`, `429`, `5xx` or no answer goes back in the queue and is sent again after
  about 5, 10, 20 s, doubling up to 5 minutes. Past the cap the oldest rows are dropped and counted
  (`analytics.stats().dropped`).
- **The busy answer:** when the backend falls behind, it answers an event batch (`POST /v1/ingest`) with `503` and a
  `Retry-After` of 10 to 30 s, before it reads the batch. Framework 0.7.2 waits at least that long, so the servers don't
  all retry at once. Older frameworks ignore the header and use their own backoff. Only event ingest is refused this
  way: heartbeats, error logs, deploy reports and identities never are.
- **On the backend:** a `202` from `POST /v1/ingest` means the rows are already in a raw file on disk. The loader
  puts them into DuckDB within seconds, or later when it is behind. Nothing it accepted is lost.

How long a server can wait before it drops rows: 10,000 rows divided by its rows per second. At 0.2 to 0.6 events a
second per player (two live games, November 2026), a 30-player server fills its queue in 10 to 30 minutes.

**When the backend answers busy.** Two runtime settings decide it, both on the explorer's **Settings** page under
**Rate limits**:

| Setting | Variable | Default | When it answers busy |
|---|---|---|---|
| Busy: raw backlog (`busyBytes`) | `TYPETORCH_BUSY_BYTES` | 512 MB | the loader is behind: raw files waiting for it hold more than this |
| Busy: requests in flight (`busyRequests`) | `TYPETORCH_BUSY_REQUESTS` | 256 | more ingest requests are being handled at once than this |

`0` turns one off. Raise them when the disk and the loader can take more; lower `busyBytes` on a small disk. The
explorer's Overview shows a note while the backend refused in the last minute, and **Backend stats** shows the counts.
The full answer and its counters: the backend README's [Limits and the busy 503](https://github.com/typetorch/backend#limits-and-the-busy-503).

## How much one backend takes

The [load test](https://github.com/typetorch/backend#load-tests) ingested **10,000 events a second on one core**
without errors (the most it was tried at, not a ceiling). The backend answers HTTP on **one thread**, so a bigger
machine doesn't raise this much. DuckDB, the loader and the queries do use every core you give them.

| Your game's rate | One core is about |
|---|---|
| 0.2 events / s per player | 50,000 CCU |
| 0.6 events / s per player | 17,000 CCU |

Your rate, from the explorer's SQL page (event rows per second of play, last 7 days):

```sql
SELECT count(*) / sum(CASE WHEN kind = 'session' AND name = 'leave'
    THEN TRY_CAST(json_extract(props, '$.secs') AS DOUBLE) END) AS events_per_player_second
FROM events
WHERE t >= epoch_ms(now() - INTERVAL 7 DAY) AND srv <> 'studio' AND channel = 'prod'
```

Requests: each game server sends about 0.07 ingest requests a second (one every 15 s), a heartbeat every 30 s and one
more when its player count changes (at most every 5 s). That is about 0.1 to 0.3 requests a second per server.

Disk: a row is about 500 bytes in the raw file, so each event a second costs about 43 MB of raw data a day (gzipped in
`raw/archive/`, Parquet in `events/`). The backend raises a `disk_low` alert under 15 % free.

## 1. Shed load

From the game folder:

```sh
bun run typetorch backend setup --flush-seconds 60 --record-share 0 --force
```

- **`--flush-seconds 60`:** each server sends every 60 s instead of 15 s, so about 4x fewer requests. A busy server
  still sends early once it has 500 rows waiting (at most 10 requests a minute). The number of rows doesn't change,
  only how many requests carry them.
- **`--record-share 0`:** no new player's first session is recorded. A recording chunk is much bigger than an event row.
- **`--force`:** `backend setup` checks the backend first (`/healthz` within 5 s). A struggling backend can fail that
  check, so `--force` writes the record anyway. It is still signed with both prod keys. The URL comes from
  `typetorch.json` (`backend.url`).

Running servers apply it within seconds: the CLI pings them, and every server reads the record at least every 55 s.
No restart: `--flush-seconds` counts from the next send, and `--record-share` applies to sessions that start after it.

**Analytics on Cloudflare Basin?** CLI 0.19.0+ keeps a Basin sink when you run `backend setup`. Older CLIs replace it
with the backend, so use CLI 0.19.0 or later on a Basin game. A Basin game's backend only carries heartbeats and error
logs, which are light. Basin scales by itself.

**`429` in the backend's logs?** Roblox game servers share outgoing addresses, so many servers can hit the
per-address limit. Raise **Ingest per address** (default 6,000 a minute) on the explorer's **Settings** page; it applies at
once. The per-server limit (60 a minute) is far above what a server sends.

**Last resort:** `bun run typetorch settings unset backend` stops all sending: analytics, heartbeats, error logs and
identities. Servers stop queueing too, so this loses data until you run `backend setup` again.

**Undo** once the backend keeps up:

```sh
bun run typetorch backend setup --flush-seconds 15 --record-share 1
```

What it costs: a server that crashes loses up to a minute of rows instead of 15 s, and new players aren't recorded
while it lasts.

## 2. Resize the VPS in place

Most providers can give a server more CPU and memory in place (Hetzner: **Rescale**, DigitalOcean: **Resize**). The
machine restarts and keeps its IP address and disk, so DNS, the settings record and the game don't change.

1. **Back up.** Explorer > Settings > **Back up now** (or **Download backup**,
   [Backups and restore](backend-operations.md#backups-and-restore)).
2. **Resize** in the provider's panel. Pick CPU and memory only (not a bigger disk) if you may want to go back down
   later: most providers can't shrink a disk. Add a bigger disk if the disk math above says you'll need it.
3. **Give DuckDB the machine.** The defaults suit a 1 GB server and leave a big one idle. In Coolify, set:

   | Variable | Default | On the bigger machine |
   |---|---|---|
   | `TYPETORCH_MEMORY_LIMIT` | `400MB` | about half the memory (`8GB` on 16 GB) |
   | `TYPETORCH_THREADS` | `2` | the number of vCPUs |
   | `TYPETORCH_QUERY_CONCURRENCY` | `2` | `4` (queries at once) |

   `compose.yaml` passes `TYPETORCH_MEMORY_LIMIT` and `TYPETORCH_THREADS` through. With the **Docker Compose**
   resource, add a line for `TYPETORCH_QUERY_CONCURRENCY` under `environment:` too, or it never reaches the container
   (the **Dockerfile** resource passes every variable). If you set a memory or CPU limit on the container in Coolify,
   raise it as well.
4. **Redeploy.** A rolling update is fine: the new container takes the data folder over within seconds.
5. **Check:** `curl https://<your backend>/healthz` says `{"ok":true}`, `bun run typetorch servers` lists live servers,
   and the explorer's Overview shows new events.

Game servers ride over the restart with the retries above: a few minutes down costs no rows.

## Copying the data folder

**Don't copy the data folder to another machine** (rsync, a disk image) while it matters. A folder copied while the
server writes, or a copy cut off halfway, can leave DuckDB or SQLite unreadable. Backups made by the server
([Backups and restore](backend-operations.md#backups-and-restore)) are the safe copy. Move 3 below does not copy files
either.

## 3. Move to another server

Use this for a new machine or provider when a resize in place isn't enough or isn't possible. The new server is set up
first, the game switches to it, and then the history moves over through the two servers' APIs, day by day. The old
server is only read. Nothing is copied from its data folder.

Both servers run the same backend version (the old one serves the export API, and one backend version pins one DuckDB).

1. **Update the old server** to this backend version. Then deploy the new server with **its own URL** and **the old
   keys**: `TYPETORCH_API_KEY` and `TYPETORCH_ADMIN_TOKEN`, the same values as the old server. Nothing else changes for
   the game yet.
2. **Switch the game** to the new server:

   ```sh
   bun run typetorch backend setup --url https://new.example.com
   ```

   The keys come from the game repo's `.env`. Game servers follow the new record within a minute (they read it at least
   every 55 s). The old server keeps its address and takes in what servers had in flight.
3. **Point the Roblox erasure webhook** at `https://new.example.com/v1/erasure` (Creator Hub > Webhooks, same secret).
   From now on an erasure reaches the new server, and it covers rows that arrive by the move too.
4. **Start the move** on the new server. The old server's admin token goes in `TYPETORCH_OLD_ADMIN_TOKEN` (the
   environment or `.env`, never a flag):

   ```sh
   bun run typetorch backend migrate --from https://old.example.com
   bun run typetorch backend migrate status --watch
   ```

   The Settings page's **Migration** card and `POST /v1/admin/migrate` start the same job.
5. **Turn the old server off** when every day says `match`. Keep a last [backup](backend-operations.md#backups-and-restore)
   of it first. The public domain can move to the new server later.

### The move commands

| Command | What |
|---|---|
| `backend migrate --from <url>` | Start: the old server's history into the server `backend.url` names |
| `backend migrate status` | Steps, progress, rows a second, and the per-day report. `--watch` polls every 5 s |
| `backend migrate pause` / `resume` / `cancel` | Cancel keeps what was already imported. A new start goes on from there |
| `--rows-per-second <n>` | The speed cap (default 20,000, `TYPETORCH_MIGRATE_ROWS_PER_SECOND`) |
| `--force` | Start although the old server's checks failed |

### What the move checks

- **Erasures first.** The old server's erased players are applied before the import, so their rows are dropped.
- **Every day, twice.** Each day before the cutover must have the same row count and hash as the old server (minus the
  players erased since). Days from the cutover on hold new rows as well, so every old row must be there. A day that
  fails is imported again once, then left for you. Each day's state is `match`, `missing` or `differs`.
- **Live data last.** Once the old server has got nothing for 10 minutes, the days that changed since are imported again.
- **Live ingest comes first.** The job waits while the loader is behind or a query runs.
- **Survives restarts.** A crash or a redeploy of either server resumes at the last page.
- **Old history.** Days older than the new server's `keepDays` (the analytics history setting) are skipped.

The speed is about 5 minutes for 6 million rows at the default cap.

### Not moved

These do not come across. Set them up again on the new server:

| Not moved | On the new server |
|---|---|
| Raw archives | Nothing: the same rows are already in the day files |
| Trusted browsers (`devices.json`) | `bun run typetorch backend bless` |
| `instance.key` | Sign in with typetorch.dev: **Add project** again for the new fingerprint |
| Alert webhook URL | Enter it again on the Settings page |
| Admin allow list and token login | Set them again on the Settings page, on purpose |
| Named API keys | `bun run typetorch keys create` again ([API keys](api-keys.md)) |
| Notifications (`notify.db`) | Not copied |

## 4. Analytics to Basin and back

This moves the analytics history (events and recordings) between the server's day files and
[Cloudflare Basin](analytics.md#cloudflare-basin), row by row, and checks each day. The server keeps the fleet (heartbeats,
deploys, error logs, identities, settings) either way, so a Basin game still has a backend. Nothing is deleted on either
side. Basin can't delete rows.

**Switch the sink first, then move the history.** The game sends each row to one sink: the one its signed record names
when it flushes. A game server follows a new record within 5 to 55 s, and its queued rows go to the new sink. So the
rows on the server and the rows in Basin never overlap, and the move takes every row the source holds, not a time range.
Rows sent just before the switch come over with the rest.

### To Basin

1. Set up Basin ([Cloudflare Basin setup](analytics.md#cloudflare-basin)): the two streams, the tables and a send token.
2. **Switch the sink:**

   ```sh
   bun run typetorch backend setup --analytics basin --events <events stream url> --recordings <recordings stream url>
   ```

   Put the send token in the game repo's `.env` as `BASIN_SEND_TOKEN`. The record keeps `backend` pointed at this server
   for the fleet. From a minute later, analytics go to Basin. Rows that were in flight still reach the server.
3. **Optional, for the count check:** set `CLOUDFLARE_ACCOUNT_ID`, `BASIN_BUCKET` and `BASIN_SQL_TOKEN` (and
   `BASIN_NAMESPACE` if it isn't `typetorch`) on the server, then redeploy it. Without them the move still runs, but
   it can't compare counts in Basin.
4. **Start the move:**

   ```sh
   bun run typetorch backend migrate --to-basin
   bun run typetorch backend migrate status --watch
   ```

   The job waits until the server has received no analytics row for 10 minutes and everything it received is loaded
   (state `waiting`, and it says so). A forgotten step 2 never sends half a day.
5. **If a page is cut off** mid-send, the job stops in `needs_decision`. Resolve it with
   `bun run typetorch backend migrate resolve <page> resend` (Basin may then hold that page twice) or `skip` (its rows
   may be missing). The status names the page.
6. **When every day says `match`** (or `sent`, without the count check), keep a [backup](backend-operations.md#backups-and-restore).
   Then turn the analytics part off with `TYPETORCH_PARTS=fleet`. The data folder stays.

### From Basin

1. The server runs with its analytics part (`TYPETORCH_PARTS=analytics,fleet`, the default).
2. **Switch the sink back:**

   ```sh
   bun run typetorch backend setup --analytics duckdb
   ```

   The game's analytics go to the server within a minute.
3. **Start the move.** The Basin values (`CLOUDFLARE_ACCOUNT_ID`, `BASIN_BUCKET`, `BASIN_SQL_TOKEN`, `BASIN_NAMESPACE`) come
   from the game repo's `.env`. The token needs Basin SQL read, Basin Catalog read and R2 storage read:

   ```sh
   bun run typetorch backend migrate --from-basin
   bun run typetorch backend migrate status --watch
   ```

4. **When every day says `match`,** the Basin tables can stay as a backup or go. The job only reads them.

### What is checked

| Direction | Checked per day | Not checked |
|---|---|---|
| From Basin | The rows read equal Basin's count for the day, counted again at the end. Every row read is in the day file afterwards. A day before the server's own rows began holds no more rows than Basin has. Result: `match`, `missing` or `differs`. | A hash against Basin (Basin SQL can't compute DuckDB's hash). Exact duplicates in Basin collapse on arrival. |
| To Basin, with the count settings | Basin's count for the day, minus what Basin held before the job sent anything, against the rows sent. Result: `match`, `missing <n>` or `duplicates` (more rows than were sent, for example after a resent page). | The row contents in Basin (counts only): which rows are missing or doubled. |
| To Basin, without the count settings | Each page's `2xx`. The day ends `sent`. | Anything in Basin. |

**Cost.** Basin SQL bills the bytes each query scans, with a 10 MB minimum per query. Check Cloudflare's current price.
A move from Basin scans every row a few times (count queries, then pages of 10,000 events). A move to Basin pays
Pipelines for what it sends, and the count check adds two count queries per check. The job's speed cap
(`--rows-per-second`) paces it.

Details and the exact statuses: the backend README's
[Move analytics to Basin and back](https://github.com/typetorch/backend#move-analytics-to-basin-and-back).

## 5. Several ingest servers (optional)

**Most games never need this.** One server (`TYPETORCH_ROLE` unset, which is `all`) runs ingest, DuckDB, the fleet and
the explorer together. Nothing here changes it.

Use it when one server's ingest isn't enough: past one core, which is about 17,000 to 60,000 players online at the
rates in [How much one backend takes](#how-much-one-backend-takes). Past a few hundred thousand players online, move
analytics to Basin instead ([section 4](#4-analytics-to-basin-and-back)).

The shape: game servers send events to one address in front of several **ingest nodes**. Each node writes its rows to
a Parquet file every few seconds and uploads it to a storage bucket (the S3 API, such as Cloudflare R2). The **main
server** loads those files into its one DuckDB. Heartbeats, error logs and deploys still go to the main server.

Setting it up:

1. **A bucket** with the S3 API (for example R2), and an API token with object read and write on it.
2. **The main server:** set `TYPETORCH_ROLE=main` and the four `TYPETORCH_QUEUE_*` bucket variables. Redeploy it first.
3. **Each ingest node:** the same image with its own volume, `TYPETORCH_ROLE=ingest`, the bucket variables, and
   `TYPETORCH_MAIN_URL` (the main server's address). Its `TYPETORCH_API_KEY` and `TYPETORCH_ADMIN_TOKEN` are the same
   values as the main server's.
4. **One address for the nodes:** a load balancer, or DNS round-robin, e.g. `https://ingest.example.com`.
5. **Point the game at it:**

   ```sh
   bun run typetorch backend setup --ingest https://ingest.example.com
   ```

   The CLI checks the address and the game key there first. Game servers send events to it within a minute. Heartbeats
   and the rest stay on the main server. `--ingest none` moves events back to the main server.

Watch the main server's **Backend stats** page (the queue tiles) and each node's `/healthz` with the admin token. If the
bucket can't be reached, the main server raises a `queue_bucket_down` alert ([Live servers and alerts](fleet-and-alerts.md#backend-alerts)).

The full variable table for each role, and the rules for erasure on the nodes:
[Several ingest servers](https://github.com/typetorch/backend#several-ingest-servers-optional) in the backend README.
