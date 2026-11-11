# API keys

The [backend](https://github.com/typetorch/backend) can hand out **named API keys with roles**, so a tool gets exactly
the access it needs and never holds the admin token. Typical case: a Discord support bot that looks up one player's
anticheat rows by UserId. It gets a `support` key, which can read that and nothing else.

- A key looks like `ttk_<id>_<secret>`. The `id` (10 characters of `0-9 a-z`) is public: lists and the audit log show
  it. The secret is shown **once**, when the key is made; the backend keeps only a SHA-256 hash of the whole key.
- A key is a bearer token: `Authorization: Bearer ttk_...`. It never opens an explorer session; browser sign-in (owner,
  dev, viewer) is unchanged.
- Each key has a name (`a-z 0-9 . _ -`, 1-48 characters, unique among active keys), a role, and an optional expiry (1 to
  3650 days). An expired or revoked key answers 401, like an unknown one.

## Roles and scopes

A role is a fixed set of scopes:

| Role | Scopes | For |
|---|---|---|
| `game` | `ingest:write` | what game servers do (the game key's job) |
| `lookup` | `identity:resolve` | turning a UserId into its pids |
| `support` | `identity:resolve`, `players:read` | support tools: one player's allowed rows and summary |
| `analyst` | `analytics:sql`, `analytics:query`, `identity:resolve` | notebooks and dashboards over the analytics data |
| `admin` | all | everything the admin token can do, except replacing the owner list (`PUT /v1/access`) and the trust-link signing keys (`PUT /v1/access/keys`): those stay with the admin token |

What each scope opens:

| Scope | Routes |
|---|---|
| `ingest:write` | `POST /v1/ingest`, the game side of `/v1/fleet/*`, `/v1/errors`, `/v1/notify/intents`, `opened`, `played` |
| `identity:resolve` | `GET /v1/identity/resolve` |
| `players:read` | `GET /v1/players/by-uid/{uid}/events` and `.../summary` ([below](#per-player-endpoints)) |
| `analytics:query` | the [named queries](analytics.md#queries) |
| `analytics:sql` | the free-form SQL route |
| `settings:write` | `PATCH /v1/admin/settings` (runtime settings; only `admin` has it) |
| `admin` | everything else that needs the admin token today, and managing keys |

A request outside the key's scopes answers `403 { "error": "forbidden", "need": "<scope>" }`.

## The CLI

From the game folder, with `TYPETORCH_ADMIN_TOKEN` in its `.env` and `backend.url` in `typetorch.json`:

```sh
bun run typetorch keys create --name standard-bot --role support --expires 365d
bun run typetorch keys list            # id, name, role, scopes, expires, last used, built-in / revoked
bun run typetorch keys list --all      # revoked keys too
bun run typetorch keys revoke a1b2c3d4e5
```

- `create` prints the key once, with "Store it now: it is not shown again". Put it straight into the tool's secret
  store or environment. Lost it? Revoke it and create another.
- `--json` returns it in `key`, so a script can pipe it into a secret store without it ever showing on screen:
  `bun run typetorch keys create --name standard-bot --role support --expires 1y --json | jq -r .key | <your secret store's set command>`.
- `--expires` takes days or years: `90d`, `365d`, `1y` (1 to 3650 days). Without it the key never expires.
- The CLI never writes the key to disk or a log, and hides it in its own error messages.
- `revoke` takes the id (from `list`), never the key itself. A revoked key fails at once.
- These sit next to the [prod signing key](prod-signing.md) commands (`keys init`, `rotate`, `resign`); they share the
  `keys` command, nothing else.

The same over HTTP (admin scope):

| Request | Answer |
|---|---|
| `POST /v1/admin/keys` `{ name, role, expiresDays? }` | `201 { id, key, name, role, scopes, createdAt, expiresAt }`: `key` only here, once |
| `GET /v1/admin/keys` (`?all=1`: revoked too) | `{ keys: [{ id, name, role, scopes, createdAt, createdBy, expiresAt, lastUsedAt, revokedAt, builtIn }] }`, never a hash or secret |
| `DELETE /v1/admin/keys/{id}` | `{ ok: true, id, revokedAt }`; a built-in id answers 400 |

## Built-in keys: the env tokens

The tokens in the backend's environment keep working unchanged, and `keys list` shows them as built-in keys:

| Id | Variable | Role |
|---|---|---|
| `env:api` | `TYPETORCH_API_KEY` (the game key) | `game` |
| `env:api-previous` | `TYPETORCH_API_KEY_PREVIOUS` (during a rotation) | `game` |
| `env:admin` | `TYPETORCH_ADMIN_TOKEN` | `admin` |
| `env:lookup` | `TYPETORCH_LOOKUP_TOKEN` | `lookup` |

They can't be revoked through the API or the CLI: to retire one, change the variable in the backend's environment and
restart it.

## Per-player endpoints

Scope `players:read` (the `support` role). The backend binds the player: the UserId comes from the path and every pid
from its own `identities`, so a key can never widen the query. There is no free-form SQL behind them.

### `GET /v1/players/by-uid/{uid}/events`

Query: `names=ac_flag,ac_action` (default: the whole allow-list), `since` and `before` (unix ms; default the last 30
days, and now), `limit` (1-100, default 50). Rows for every pid of that UserId, newest first:

```json
{
  "uid": 123456789,
  "known": true,
  "pids": ["p_1a2b3c", "p_9z8y7x"],
  "rows": [
    { "t": 1762876800123, "name": "ac_flag", "kind": "custom", "pid": "p_1a2b3c", "job": "e7873b84-…", "props": { "cat": "speed", "v": 42.1 } },
    { "t": 1762876790000, "name": "join", "kind": "session", "pid": "p_1a2b3c", "job": "e7873b84-…", "props": { "from": "direct" } }
  ],
  "more": false
}
```

`props` is always a JSON object. `more: true` means there are older rows: ask again with `before` = the last row's `t`.

### `GET /v1/players/by-uid/{uid}/summary`

Query: `since` (unix ms, default the last 30 days).

```json
{
  "uid": 123456789,
  "known": true,
  "pids": ["p_1a2b3c"],
  "since": 1760284800000,
  "byName": { "ac_flag": 12, "ac_action": 3, "ac_honeypot": 0 },
  "byCategory": { "speed": 9, "fly": 3 },
  "sessions": 41,
  "lastSeen": 1762876800123
}
```

- `byName`: a count for every allow-listed name (0 when none).
- `byCategory`: the `ac_flag` rows grouped by their `props.cat`.
- `sessions`: distinct sessions. `lastSeen`: the newest row of any kind for those pids, or `null`.

For a UserId this backend has never seen, `events` answers `200 { "uid": …, "known": false, "pids": [], "rows": [],
"more": false }`, and `summary` answers with `known: false` too. Both work on the DuckDB and the Basin backend, and answer 503 while analytics isn't open
yet, like the other analytics reads.

Example, from the bot's host:

```sh
curl --max-time 30 -H "Authorization: Bearer $TYPETORCH_SUPPORT_KEY" \
  "https://backend.example.com/v1/players/by-uid/123456789/summary"
```

### The allow-list

A support key reads only the event names in the runtime setting `players.supportEvents` (the backend's Settings page;
default `ac_flag,ac_action,ac_honeypot,join,leave`, where `join` and `leave` are the `session` rows). Asking for any
other name answers `403 { "error": "event_not_allowed", "name": "<name>" }`. An `admin` key isn't limited by it.

Name your game's support-relevant [analytics](analytics.md) events to match, or add them to the list.

## Rate limit

Every key has its own token bucket: `keys.ratePerMinute` requests a minute (runtime setting, default 120). Over it the
backend answers `429 { "error": "rate_limited" }` with `Retry-After` (seconds); wait that long. Built-in keys are
limited per id too, except `env:api` (the game key), which keeps the ingest limits game servers have always had.

## Audit

Every `players:read` request writes an [audit](security.md) row: the key's id, name and role, the route template
(`/v1/players/by-uid/:uid/events`), the status, the time and the client's IP. It never holds the UserId (more people can
read the audit log than the data), only a count of pids. Creating and revoking keys are audited too (`keys.create`,
`keys.revoke`, never the secret). Other uses of a key only update its `last used` time (at most once a minute).
