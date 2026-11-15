# Emergency backend scale-ups

Your game took off overnight and the [backend](https://github.com/typetorch/backend) is falling behind. Two moves need no
new code and no game deploy:

| Move | Time | Downtime | What it buys |
|---|---|---|---|
| [1. Shed load](#1-shed-load) | 2 minutes, from your phone's terminal | none | about 4x fewer ingest requests, no new recordings |
| [2. Resize the VPS in place](#2-resize-the-vps-in-place) | 5 to 10 minutes | a few minutes | DuckDB loads and queries use the bigger machine |

Do 1 first, then 2. Neither changes the game or its URL.

## First: the game keeps running

The backend is never on the players' path. When it is slow or down:

- **Players:** nothing changes. Servers run their build as before.
- **Deploys:** they work. `deploy --wait` and the health checks skip their wait with a note
  ([Live servers and alerts](fleet-and-alerts.md)).
- **Analytics:** each game server keeps a queue in memory: up to 10,000 event rows, 2,000 fleet rows and 300
  recording chunks. A batch that gets `408`, `429`, `5xx` or no answer goes back in the queue and is sent again after
  about 5, 10, 20 s, doubling up to 5 minutes. Past the cap the oldest rows are dropped and counted
  (`analytics.stats().dropped`).
- **On the backend:** a `202` from `POST /v1/ingest` means the rows are already in a raw file on disk. The loader
  puts them into DuckDB within seconds, or later when it is behind. Nothing it accepted is lost.

How long a server can wait before it drops rows: 10,000 rows divided by its rows per second. At 0.2 to 0.6 events a
second per player (two live games, November 2026), a 30-player server fills its queue in 10 to 30 minutes.

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

**Analytics on Cloudflare Basin?** Don't run `backend setup`: it replaces the Basin sink and sends events to the
backend instead (it says so in one line). A Basin game's backend only carries heartbeats and error logs, which are
light. Basin scales by itself.

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

## When this isn't enough

Past one core of ingest (the table above), one backend can't keep up whatever its size: it has one HTTP thread and one
DuckDB writer, so you can't put a load balancer in front of two of them on the same data.

**Don't copy the data folder to another machine** (rsync, a disk image) while it matters. A folder copied while the
server writes, or a copy cut off halfway, can leave DuckDB or SQLite unreadable. Backups made by the server
([Backups and restore](backend-operations.md#backups-and-restore)) are the safe copy.

Planned, not built yet:

| Coming | What it does |
|---|---|
| **A "busy" answer** | The backend tells game servers to wait (`503`) when it falls behind, so they hold rows in their queues instead of all timing out and retrying at once |
| **Move to another server** | Set up the new server, point the game at it with `backend setup --url`, then `typetorch backend migrate --from <old>` moves the old history over slowly through the two servers' APIs (newest day first, throttled, resumable, every day checked). The old server is only read, and you turn it off once every day matches |
| **Analytics to Cloudflare Basin and back** | A command that switches the sink and keeps the backend for live servers and error logs, plus the same slow move of the history in either direction |
| **Several ingest servers, one DuckDB** | Ingest servers that only check and store rows, with a storage bucket as the queue to one DuckDB server, for games past one machine |

Until then, the levers are the two above. A game already on Basin
([Cloudflare Basin setup](https://github.com/typetorch/backend#cloudflare-basin-setup)) has no analytics ceiling of its own.
Switching a running game to Basin waits for the command in the table: today no CLI command writes a Basin sink.
