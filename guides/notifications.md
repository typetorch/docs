# Notifications

Roblox experience notifications are the one push channel a game has: a short message on the player's phone or desktop
that opens the game when tapped. TypeTorch runs them natively. **Your game says WHY a player should hear from it; the
backend decides WHEN and WHAT and sends; the framework checks the tap and writes the rows.** You write no scheduler,
no signer and no funnel.

- Your game server queues **intents** (`want` / `drop`), also for players who are offline.
- The [backend](https://github.com/typetorch/backend) plans each user's next send (Roblox allows **1 a day per user per
  experience**), sends it through Open Cloud with a **signed launch data token**, and retries.
- When a player taps it, the framework verifies the token on the game server and calls your `onOpen`.
- Every step is an analytics row (`kind = "notify"`), so the funnel (wanted, sent, opened, played) is on the explorer's
  **Notifications** page with no extra code.

Roblox rules that shape all of this: only players who **opted in** (13 and over) get them; at most 1 per user per day per
experience; delivery isn't guaranteed (Roblox scales reach with how often players engage with them); the message text is a
**notification string** you create by hand in the Creator Dashboard (Engagement > Notifications), with `{placeholders}`.
There is no API to create those strings.

## Setup

1. **The backend** (`typetorch backend setup`, [Fleet and alerts](fleet-and-alerts.md)) with an Open Cloud key that has
   the scope `user.user-notification:write`: `OPENCLOUD_NOTIFY_KEY` in the backend's environment, else its
   `OPENCLOUD_API_KEY`. `typetorch doctor` checks the scope on the same-named key in your game repo's `.env` (an empty
   request that can't send anything).
2. **The notification strings**: one per kind in the Creator Dashboard. Copy each message id.
3. **The kinds** in `typetorch.json` (below), then `typetorch notify push`.
4. **The signing key**: `typetorch notify key rotate` (once; again whenever you want a new key).
5. **The game code**: `want` / `drop` on the server, `promptOptIn` on the client, `onOpen` for taps.
6. **Turn off dry run** when the rows look right: the backend's Settings page, `notify.dryRun` (on by default).

## Kinds

A kind is a reason to notify, declared once in `typetorch.json` and pushed to the backend:

```jsonc
"notifications": {
  "dailyCap": 1,                          // ours; Roblox's is 1 too
  "quietAfterLeaveMinutes": 120,          // nothing right after a session
  "lapse": [[14, 7], [30, 2], [60, 1]],   // days since last seen -> max sends a week; past the last = stop
  "unopenedBackoff": { "after": 5, "factor": 0.5, "days": 14 },
  "kinds": {
    "gift_new":      { "template": "<message_id>", "priority": 10, "repeat": "per_key",  "send": "preferred_hour", "maxWaitHours": 48 },
    "gift_expiring": { "template": "<message_id>", "priority": 20, "repeat": "per_key",  "send": "asap" },
    "day2":          { "template": "<message_id>", "priority": 30, "repeat": "once_ever" },
    "streak":        { "template": "<message_id>", "priority": 60, "repeat": "daily" },
    "daily":         { "template": "<message_id>", "priority": 70, "repeat": "daily",    "perWeek": 3 }
  }
}
```

| Field | Meaning |
|---|---|
| `template` | the notification string's message id. A kind without one is planned and counted, never sent |
| `priority` | 0-1000, **lower wins** when several are due for one user on one day. Put event kinds (a new gift) above recurring ones (a streak reminder): a streak can go any day |
| `repeat` | `once_ever` (per user, forever), `per_key` (once per intent key, e.g. per gift id), `daily` (at most once a day) |
| `send` | `preferred_hour` (default: the user's usual play hour inside the intent's window) or `asap` (the next sender tick) |
| `perWeek` | 1-7: a cap for `daily` kinds |
| `maxWaitHours` | how long a `preferred_hour` send may wait for that hour |
| `category` | Roblox's dashboard groups impressions and clicks by it; default the kind name |
| `allowTemplate` | `want(user, kind, { template })` may pick another message id for this kind |
| `beats` | `{ "kinds": ["streak"], "withinHours": 4 }`: outranks those kinds only within its last N hours. Off by default |

Top level: `dailyCap` 1-3 (only 1 matters while Roblox allows 1), `quietAfterLeaveMinutes`, `lapse` (in ascending
days; players who drift away hear from you less, then not at all), `unopenedBackoff` (after N unopened sends in a row,
send `factor` as often for `days`).

Rules (the CLI checks them whenever it reads `typetorch.json`; the backend checks them again on push): kind names are
1-24 characters of `a-z 0-9 _`; `custom` is reserved for one-offs; template at most 128 characters; unknown fields are
refused, so a typo can't silently do nothing.

## In game code

### Server: intents

```ts
import { TypeTorch } from "@typetorch/framework";

const notify = TypeTorch.notifications(); // server

// A gift to someone who may be offline: by UserId.
notify.want(recipientUserId, "gift_new", {
	key: letterGuid,                       // one intent per key; want again = update it
	until: expiresAt,                      // unix seconds; default now + 7 days
	params: { gift: "5 Z-Coins" },         // the string's {placeholders}: at most 8, values at most 64 characters
	data: "mail:" + letterGuid,            // at most 64 bytes, handed back to onOpen on the tap
});

// A streak about to break: not before 6 hours ahead of the deadline.
notify.want(player, "streak", { key: "20034", at: deadline - 6 * 3600, until: deadline, params: { days: "5" } });

notify.drop(player, "streak", "20034");    // the reason is gone (they played)
notify.drop(recipientUserId, "gift_new");  // every key of that kind

// The player tapped a notification and joined.
const disconnect = notify.onOpen((player, open) => {
	// open.nid, open.kind, open.data, open.ageSeconds, open.first (false when this tap was already counted)
	const [what, id] = open.data.split(":");
	if (what === "mail" && id !== undefined) mailbox.open(player, id);
});
```

- `want` is an upsert per (user, kind, key): the last write wins. `at` is the earliest send time (default now),
  `until` the latest. Works for offline users.
- Intents are batched like analytics (a swap-safe queue, flushed every `flushSeconds` and at 200 items) to the backend
  with the game key. Presence is added for you on join and leave, so nobody gets a notification while in the game or
  just after leaving.
- `onOpen` carries `data`, not the intent's `key` (the launch data has a 200-byte budget). Put what you need in `data`.
- In Studio, or with no backend in the settings record, nothing is sent; the rows are still written.

### Client: the opt-in prompt

```ts
const n = TypeTorch.notifications(); // client
const result = n.promptOptIn("streak_2"); // yields: "shown" | "unavailable" | "error" | "busy" | "already"
```

- Show your own explainer first: Roblox's prompt text is fixed, and Roblox lets a game prompt a user at most once per
  30 days.
- `where` names the spot in your game (it lands in the rows, so you can compare spots).
- One prompt at a time, at most once a session; a hot swap mid-prompt neither re-prompts nor loses the close row.
- Roblox doesn't tell the game whether the player accepted. The backend learns it from its first send: accepted or
  "not opted in" (row `optin_inferred`).

## The funnel

The explorer's **Notifications** page (backend) shows, per kind and day: wanted, planned, sent, opened, played 1 minute
or more, back the next day; the opt-in funnel (checked, shown, closed, inferred subscribed) by `where`; the queue; and
failures. Roblox's own impressions and clicks per category are in the Creator Dashboard only; TypeTorch doesn't import
them.

A tap that verifies also marks the join row: `from = "notification"`, `nid`, `nk` (the kind). The session's `played`
row gives its length, and every other row of that session shares its `sid`, so "what they did after the tap" is a join on
`sid`. The rows are listed in [Analytics: notification rows](analytics.md#notification-rows).

## Commands

All of them use `typetorch.json` `backend.url` and `TYPETORCH_ADMIN_TOKEN` from the game repo's `.env`.

```sh
bun run typetorch notify push                       # typetorch.json notifications -> the backend (checked first)
bun run typetorch notify push --dry-run             # show what would be pushed
bun run typetorch notify status                     # on / paused, dry run, rate, keys (set or not), queue, 24 h, each kind
bun run typetorch notify test 123456789 gift_new --param gift="5 Z-Coins" --data mail:42
bun run typetorch notify send 123456789 <message_id> --param name=value
bun run typetorch notify key rotate
bun run typetorch notify pause                      # stop sending; intents keep queueing
bun run typetorch notify resume
bun run typetorch notify pause streak               # one kind
bun run typetorch notify resume streak
```

- `test` sends one notification of a kind now, **bypassing the caps** (marked `test`). Dry run still applies.
- `send` is a one-off with any message id, as kind `custom` (the message id is its category). It **respects** the
  1-a-day rule and mutes, so it may answer "not sent" with the reason.
- `--param name=value` can be repeated (at most 8; names `a-z A-Z 0-9 _`, values at most 64 characters); `--data` is at
  most 64 bytes.
- `pause` / `resume` set the backend's runtime setting `notify.enabled` (with a kind: `notify.kinds.<kind>.enabled`),
  the same switches as its Settings page. Every change is audited.
- `status` also says whether the pushed config matches `typetorch.json`.

## Dry run

A new backend starts in **dry run** (`notify.dryRun`): it plans and counts everything and writes the rows, but never
calls Roblox. Use it to check what would go out (`typetorch notify status`, the Notifications page), then turn it off on
the backend's Settings page. Turn it back on any time; `notify pause` stops planning sends altogether.

## A halted kind (bad template)

If Roblox answers a send with **404 NOT_FOUND** ("Message id ... does not exist"), the kind's message id is wrong (a
typo, or the string was deleted in the Creator Dashboard). That is a config error, not the player's: the backend

- **stops that kind** (`notify.kinds.<kind>.enabled = false`, audited) and shows it as `halted: "bad_template"`
  (`typetorch notify status`, the Notifications page's banner, a server log line);
- **keeps the intents pending**: they go out once the kind is fixed;
- **never mutes the player** (the answer even proves they opted in).

To recover:

1. Fix `notifications.kinds.<kind>.template` in `typetorch.json` (copy the message id again from Engagement >
   Notifications).
2. `bun run typetorch notify push`
3. `bun run typetorch notify resume <kind>`

## Keys and the signed tap

Anyone can make a deep link with launch data, so the backend signs every notification's launch data:

```
tt1n.<nid>.<kind>.<userId base36>.<send time base36>.<data base64url>.<signature>
```

The signature is the first 16 bytes of HMAC-SHA256 with the notify key. On join, the framework checks: the signature
(the current key, or the previous one for 7 days after a rotation), that the UserId is the joining player, and that it is
under 14 days old; then the backend says whether this tap is the first. Launch data that doesn't start with `tt1n.` is
yours and left alone. A bad one is ignored and counted (`open_bad`).

`typetorch notify key rotate`:

1. makes a new key (32 random bytes, base64url);
2. sends it to the backend first (`PUT /v1/notify/keys`, with the old key as `previous`), so the backend accepts both
   while servers catch up;
3. signs it into the [settings record](settings.md) as `backend.notify.keys` with both prod keys.

The key is never printed: the CLI shows a fingerprint (the first 8 hex of its SHA-256). It lives only in the signed
record (server only, never replicated) and the backend's key file. Rotating again within 7 days drops the older previous
key, so taps on notifications signed with it fail (the CLI warns). Rotation needs the same keys and scopes as every
settings write (both prod key files, the deploy key's DataStore scopes).

## Open questions (spikes)

What TypeTorch assumes until these are measured on a test universe:

| # | Question | Assumed now |
|---|---|---|
| S2 | Roblox's rate limit for sends, and its `429` | 10 sends / s (`notify.rate`); on a `429` the rate halves, `Retry-After` is honoured, then +10 % a minute back up |
| S3 | Is "1 a day" a rolling 24 h or a UTC day, and what is the error when over? | `notify.clock = rolling24` (next send at least 24 h after the last); `utc_day` is the other choice. A `429` with code `RESOURCE_EXHAUSTED` that mentions a daily / per-user limit re-plans the send for the next day |
| S4 | Does the launch data survive every path (phone app, desktop app, web, first install)? | it does; expect some "clicked but no open row" |
| S6 | What `JoinSource` does a notification tap have? | nothing depends on it; it is logged as `ctx` on the join row |

Settled: a user who isn't opted in gets HTTP 400 `FAILED_PRECONDITION` "not opted in" (S1): the backend mutes them for 7
days and writes `optin_inferred {state: "not_subscribed"}`. A wrong message id gets 404 (S1b): [a halted
kind](#a-halted-kind-bad-template).
