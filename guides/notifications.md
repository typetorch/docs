# Notifications

Roblox experience notifications are the one push channel a game has: a short message on the player's phone or desktop
that opens the game when tapped. TypeTorch runs them natively. **Your game says WHY a player should hear from it; the
backend decides WHEN and WHAT and sends; the framework checks the tap and writes the rows.** You write no scheduler,
no signer and no funnel.

- Your game server queues **intents** (`want` / `drop`), also for players who are offline, and each player's
  switched-off kinds (`setOff`).
- The [backend](https://github.com/typetorch/backend) plans each user's next send (**at most `dailyCap` a day per user**,
  1 by default), sends it through Open Cloud with a **signed launch data token**, and retries.
- When a player taps it, the framework verifies the token on the game server and calls your `onOpen`.
- Every step is an analytics row (`kind = "notify"`), so the funnel (wanted, sent, opened, played) is on the explorer's
  **Notifications** page with no extra code.

Roblox rules that shape all of this: only players who **opted in** (13 and over) get them; at most 1 per user per day
per experience (refused at send time), plus an aggregate daily cap across experiences; TypeTorch's own `dailyCap` keeps
you under it; delivery isn't guaranteed (Roblox scales reach with how often players engage with
them); the message text is a **notification string** you create by hand in the Creator Dashboard, with
`{placeholders}`. There is no API to create those strings: see [Templates](#templates).

Adding them to a game for the first time? The [Playbook](#playbook-adding-notifications-to-a-game) walks through choosing
kinds that pass Roblox's rules, testing the strings against Roblox's text filter, the game code pattern, preferences and the
end-to-end check.

## Setup

1. **The backend** (`typetorch backend setup`, [Fleet and alerts](fleet-and-alerts.md)) with an Open Cloud key that has
   the scope `user.user-notification:write`: `OPENCLOUD_NOTIFY_KEY` in the backend's environment, else its
   `OPENCLOUD_API_KEY`. `typetorch doctor` checks the scope on the same-named key in your game repo's `.env` (an empty
   request that can't send anything).
2. **The kinds** in `typetorch.json` (below), each with its `text`.
3. **The notification strings**: `typetorch notify templates`, make each one in the Creator Dashboard, then
   `typetorch notify templates set <kind> <message_id>` ([Templates](#templates)). Then `typetorch notify push`.
4. **The signing key**: `typetorch notify key rotate` (once; again whenever you want a new key).
5. **The game code**: `want` / `drop` (and `setOff` if players can switch kinds off) on the server, `promptOptIn` on the client, `onOpen` for taps.
6. **Turn off dry run** when the rows look right: the backend's Settings page, `notify.dryRun` (on by default).

Updating: release the **backend first**, then the framework and the CLI (they need its routes).

## Kinds

A kind is a reason to notify, declared once in `typetorch.json` and pushed to the backend:

```jsonc
"notifications": {
  "dailyCap": 1,                          // ours; Roblox's is 1 too
  "quietAfterLeaveMinutes": 120,          // nothing right after a session
  "lapse": [[14, 7], [30, 2], [60, 1]],   // days since last seen -> max sends a week; past the last = stop
  "unopenedBackoff": { "after": 5, "factor": 0.5, "days": 14 },
  "kinds": {
    "gift_new":      { "text": "{sender} sent you {gift}!", "template": "<message_id>", "priority": 10, "repeat": "per_key",  "send": "preferred_hour", "maxWaitHours": 48 },
    "gift_expiring": { "template": "<message_id>", "priority": 20, "repeat": "per_key",  "send": "asap" },
    "day2":          { "template": "<message_id>", "priority": 30, "repeat": "once_ever" },
    "streak":        { "text": "Your {user-streak-remaining} day streak ends soon", "template": "<message_id>", "priority": 60, "repeat": "daily" },
    "daily":         { "template": "<message_id>", "priority": 70, "repeat": "daily",    "perWeek": 3 }
  }
}
```

| Field | Meaning |
|---|---|
| `text` | the notification string's text: at most 99 characters, `{placeholders}` named `a-z A-Z 0-9 _ -` (1-32 characters). You paste it into the Creator Dashboard ([Templates](#templates)); the backend checks each intent's `params` against its placeholders |
| `template` | the notification string's message id. A kind without one is planned and counted, never sent |
| `priority` | 0-1000, **lower wins** when several are due for one user on one day. Put event kinds (a new gift) above recurring ones (a streak reminder): a streak can go any day |
| `repeat` | `once_ever` (per user, forever), `per_key` (once per intent key, e.g. per gift id), `daily` (at most once a day) |
| `send` | `preferred_hour` (default: the user's usual play hour inside the intent's window) or `asap` (the next sender tick) |
| `perWeek` | 1-7: a cap for `daily` kinds |
| `maxWaitHours` | how long a `preferred_hour` send may wait for that hour |
| `category` | Roblox's dashboard groups impressions and clicks by it; default the kind name |
| `allowTemplate` | `want(user, kind, { template })` may pick another message id for this kind. A game-supplied message id that Roblox doesn't know halts only that message id, not the kind |
| `beats` | `{ "kinds": ["streak"], "withinHours": 4 }`: outranks those kinds only within its last N hours. Off by default |

Top level: `dailyCap` 1-3 (only 1 matters while Roblox allows 1), `quietAfterLeaveMinutes`, `lapse` (in ascending
days; players who drift away hear from you less, then not at all), `unopenedBackoff` (after N unopened sends in a row,
send `factor` as often for `days`).

Rules (the CLI checks them whenever it reads `typetorch.json`; the backend checks them again on push): kind names are
1-24 characters of `a-z 0-9 _`; `custom` is reserved for one-offs; template at most 128 characters; `text` at most 99
characters with every `{` closed and valid placeholder names; unknown fields are
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
	params: { sender: "Ava", gift: "5 Z-Coins" }, // exactly the text's {placeholders}: at most 8, values at most 64 characters
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

- `params` must name exactly the placeholders of the kind's `text` (dashes allowed: `{ "user-streak-remaining": "4" }`):
  the backend refuses a missing one (`missing_param`) or an extra one (`unknown_param`). A kind without `text` isn't
  checked.
- `want` is an upsert per (user, kind, key): the last write wins. `at` is the earliest send time (default now),
  `until` the latest, and it must be after `at` (refused otherwise). Works for offline users.
- Intents are batched like analytics (a swap-safe queue, flushed every `flushSeconds` and at 200 items) to the backend
  with the game key. Presence is added for you on join and leave, so nobody gets a notification while in the game or
  just after leaving. Game servers re-send "online" for every player still in the server every 3 hours; the backend
  treats an "online" older than `notify.presenceStaleHours` (default 6) as gone, so a server that crashed without its
  leave events doesn't block those players forever.
- `onOpen` carries `data`, not the intent's `key` (the launch data has a 200-byte budget). Put what you need in `data`.
- In Studio, or with no backend in the settings record, nothing is sent; the rows are still written.

### Server: kinds a player switched off

If your settings let players switch notification kinds off, tell the backend with `setOff`. Checking the player's
save before each `want` isn't enough: another server may `want` for this player while they are offline (a gift letter,
a leaderboard pass), and it can't read their save. The backend keeps each user's off set and skips their intents of
those kinds, whoever issued them.

```ts
// Server. Signature: setOff(user: Player | number, kinds: string[]): boolean
notify.setOff(player, ["daily", "quests"]); // the player's whole off set
notify.setOff(player, []);                  // every kind on again
```

- It **replaces** the user's off set each time (not a toggle): send the full list whenever the setting changes, and
  once per join if your save is the source of truth (so a change made while the backend was unreachable catches up).
- At most 32 kind names (1-24 of `[a-z0-9_]`); duplicates are ignored. A kind doesn't have to be pushed yet.
- Ordered like `want` / `drop` (the item's `rev`: the latest call wins), batched and swap-safe through the same queue;
  `false` with a warning when the arguments are refused here. Server only.
- The backend **keeps** the skipped intents (row `skipped` with `why = "pref_off"`): switching the kind back on resumes
  an intent whose window (`until`) is still open. A send already planned for a kind that is switched off is cancelled.
- `typetorch notify test` sends ignore it, and so do custom one-offs (`typetorch notify send`).
- The explorer's per-player view shows the kinds a player switched off.

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

**Per player**: the page also looks up one player (by UserId, pid or username, owners only; the route is
`GET /v1/notify/user?uid=|pid=|name=`): their consent (opt-in checks, prompts and the inferred answer, with dates), the kinds they switched off (`setOff`), the
notifications they were sent (with opened / played) and their pending intents.

A tap that verifies also marks the join row: `from = "notification"`, `nid`, `nk` (the kind). The session's `played`
row gives its length, and every other row of that session shares its `sid`, so "what they did after the tap" is a join on
`sid`. The rows are listed in [Analytics: notification rows](analytics.md#notification-rows).

## Commands

All of them use `typetorch.json` `backend.url` and `TYPETORCH_ADMIN_TOKEN` from the game repo's `.env`.

```sh
bun run typetorch notify push                       # typetorch.json notifications -> the backend (checked first)
bun run typetorch notify push --dry-run             # show what would be pushed
bun run typetorch notify templates                  # each kind's text to paste in the Creator Dashboard
bun run typetorch notify templates set streak <message_id>   # write the new id into typetorch.json
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
- `--param name=value` can be repeated (at most 8; names `a-z A-Z 0-9 _ -`, values at most 64 characters); `--data` is at
  most 64 bytes.
- `pause` / `resume` set the backend's runtime setting `notify.enabled` (with a kind: `notify.kinds.<kind>.enabled`),
  the same switches as its Settings page. Every change is audited.
- `status` also says whether the pushed config matches `typetorch.json`.

## Dry run

A new backend starts in **dry run** (`notify.dryRun`): it plans and counts everything and writes the rows, but never
calls Roblox. Intents stay **pending** in dry run, so each one is really sent once dry run is off (if still in its
window). Use it to check what would go out (`typetorch notify status`, the Notifications page), then turn it off on the
backend's Settings page. Turn it back on any time; `notify pause` stops planning sends altogether.

## Templates

Roblox has no API that creates notification strings (the Creator Dashboard's own endpoint needs a browser login), so
each kind's string is made by hand once. `typetorch.json` holds its `text`; the CLI does the rest of the bookkeeping:

1. `bun run typetorch notify templates` prints every kind: its text on its own lines (copy it as it is, placeholders
   included), its placeholders, and whether it has a `template` id yet. It also prints the link to the experience in the
   Creator Dashboard.
2. There, open **Engagement > Notifications** and create a notification string per missing kind: paste the text.
3. Copy the new string's message id and run `bun run typetorch notify templates set <kind> <message_id>`. It writes
   `notifications.kinds.<kind>.template` into `typetorch.json` and changes nothing else in the file.
4. `bun run typetorch notify push`. Until then, `push` warns about every kind with a text but no template id: such a kind
   is planned and counted, never sent.

Changed a text? Editing a string in the dashboard keeps its message id and changes what is sent at once (2026-11-07), so
update the kind's `text` to the same words and push. For a different meaning, make a new string instead, `templates set`
the new id, then push. Re-test with `typetorch notify test` either way: Roblox's text filter judges the whole rendered text
([Playbook](#2-make-the-strings-and-test-each-one)).

## A halted kind (bad template)

If Roblox answers a send with **404 NOT_FOUND** ("Message id ... does not exist"), the kind's message id is wrong (a
typo, or the string was deleted in the Creator Dashboard). That is a config error, not the player's: the backend

- **stops that kind** (`notify.kinds.<kind>.enabled = false`, audited) and shows it as `halted: "bad_template"`
  (`typetorch notify status`, the Notifications page's banner, a server log line);
- **keeps the intents pending**: they go out once the kind is fixed;
- **never mutes the player** (the answer even proves they opted in).

To recover:

1. Fix the id: copy the message id again from Engagement > Notifications (or make the string again from
   `typetorch notify templates`), then `bun run typetorch notify templates set <kind> <message_id>`.
2. `bun run typetorch notify push`
3. `bun run typetorch notify resume <kind>`

## Other send failures

- **401 / 403 from Roblox** (the backend's Open Cloud key is wrong or lacks `user.user-notification:write`): the backend
  **halts all sending** and alerts; `typetorch notify status` shows `ALL SENDING HALTED (auth)`. Intents keep queueing.
  Fix the key on the backend (`typetorch doctor` probes the same-named key here), then turn sending back on.
- **400 other than "not opted in"** (a bad request for that one notification): it fails for good (`failed`, `final`),
  with no retry.
- **400 `INVALID_ARGUMENT` "… contains words blocked by the text filter"**: Roblox filtered the rendered text (the template
  with its params). Also final. Common cause: marketing words such as "FREE" next to an item name; see the
  [Playbook](#2-make-the-strings-and-test-each-one).
- **Network errors, 5xx and rate limits** are retried. A send that may have gone out before a crash and is refused as a
  repeat is coded `dup_refused`.

## Keys and the signed tap

Anyone can make a deep link with launch data, so the backend signs every notification's launch data:

```
tt1n.<nid>.<kind>.<userId base36>.<send time base36>.<data base64url>.<signature>
```

The signature is the first 16 bytes of HMAC-SHA256 with the notify key. On join, the framework checks: the signature
(the current key, or the previous one for 14 days after a rotation: the token's own lifetime), that the UserId is the joining player, and that it is
under 14 days old; then the backend says whether this tap is the first. Launch data that doesn't start with `tt1n.` is
yours and left alone. A bad one is ignored and counted (`open_bad`).

`typetorch notify key rotate`:

1. makes a new key (32 random bytes, base64url);
2. signs it into the [settings record](settings.md) first, as `backend.notify.keys = { current: new, previous: old,
   since }` with both prod keys, and pings the servers. Game servers are the only ones that verify taps, so they must
   know the new key before anything is signed with it;
3. then sends the same keys to the backend (`PUT /v1/notify/keys`), which signs with the new key from then on.

If step 3 fails, nothing breaks: servers accept both keys and the backend keeps signing with the old one (still
`previous`). Fix the cause and run `bun run typetorch notify key rotate --backend-only`, which sends the record's keys.
With `--no-ping`, servers pick up the new key on their next settings read (within about a minute), so the CLI leaves step
3 to you: run `--backend-only` after that minute.

The key is never printed: the CLI shows a fingerprint (the first 8 hex of its SHA-256). It lives only in the signed
record (server only, never replicated) and the backend's key file. The previous key stays valid for 14 days. Rotating
again within 14 days drops the older previous key, so taps on notifications signed with it fail (the CLI warns). Rotation needs the same keys and scopes as every
settings write (both prod key files, the deploy key's DataStore scopes).

## Playbook: adding notifications to a game

What we learned shipping them in a real game (Zomvival, 2026-11-07). Follow it in order and a new game needs about a day.

### 1. Pick the kinds (Roblox's rules first)

Roblox reviews and throttles experiences by these
([guidelines](https://create.roblox.com/docs/production/promotion/experience-notifications)), so every kind must pass all of them:

- **Personal.** About the player's own state: their gift, their streak, their unclaimed reward, someone passing *them* on a
  board. Never a broadcast ("Update out!", "Event live!"): those go everyone at once and are exactly what gets throttled.
- **No ads, sales, Robux or purchases.** No "50 % off", no "buy", no streak-revive offers, no boost-expiry nags.
- **No fake urgency, no "FREE".** "Claim before the daily reset" is fine when it is true. "FREE" next to an item name gets
  the whole message blocked by Roblox's text filter (below).
- **Nothing to players who stopped playing.** Keep every intent's window short (hours to a few days) and let `lapse` taper
  the rest; a player gone for weeks is where "come back" spam starts.
- **Fewer is better.** Roblox scales reach by how often players open them. One good kind beats five weak ones.

A list that passed review, in priority order (lower wins on a day with several due):

| Kind | Priority | When it is wanted | Window | Repeat |
|---|---|---|---|---|
| `gift_named` "{gift} is waiting for you in your mailbox!" | 10 | a gift letter written to an offline player; at every leave, each unopened gift | now .. 7 days | `per_key` (letter id) |
| `streak_end` "Your {streak}-day streak ends soon. Play a round to keep it!" | 20 | at a leave, a streak of 3+ days | 3 h .. 15 min before the day to play on ends | `daily`, `asap` |
| `lb_passed` "{name} passed you on the {board} leaderboard. Take your spot back!" | 30 | a board refresh where a top-10 user (not online) dropped a place to someone from below; never a Robux board | now .. 24 h, key = the board | `daily`, `perWeek` 2 |
| `quests_ready` "Quest rewards are waiting: {count} finished. Claim them before the daily reset!" | 40 | at a leave, finished but unclaimed quests | now .. the reset | `daily`, `perWeek` 3 |
| `daily_ready` "Your day {day} reward is ready. Join to claim it!" | 50 | at a leave, a player who claimed one in the last 3 days | from when it opens, 36 h | `daily`, `perWeek` 3 |

### 2. Make the strings and test each one

1. `typetorch notify templates`, paste each text into **Engagement > Notifications**, `templates set <kind> <id>`,
   `typetorch notify push` ([Templates](#templates)).
2. **Send every kind once to yourself with realistic params**: `typetorch notify test <yourUserId> <kind> --param name=value`.
   A test send skips the caps and goes out at once. Then check `GET /v1/notify/user?uid=<userId>` (admin token) or the
   explorer's player page: `sent` + `http 200`.
3. **Roblox's text filter runs on the whole rendered message, placeholders filled in.** A blocked one answers
   `400 INVALID_ARGUMENT` "######## contains words blocked by the text filter." The `#` mask is as long as the rendered
   text, so you can tell which variant it filtered. It is final (no retry), so a filtered notification is simply lost.
   Seen in practice: "FREE {gift} is waiting…" was blocked with `{gift}` = "Elite for 7 days" and "Elite", while the same
   gift passed without "FREE". Keep params plain nouns ("Elite for 7 days", "$500", "3"), never marketing words, and
   re-test after any text edit.
4. **Editing a string in the dashboard keeps its message id and takes effect at once.** Update the kind's `text` in
   `typetorch.json` to the same words and `notify push` (the backend checks params against it).
5. **Test on the owner's account only for content.** The universe owner skips Roblox's 1-a-day limit, so two sends a day
   reaching you prove nothing about the limit.

### 3. Game code: want from the save, drop when the reason is gone

Keep the rules in a pure module (no services, no clock: pass `now`), so a bun sim can test them, and keep the service thin:

```ts
// Each kind's reason from the player's own save: one want OR one drop per kind and key, so the backend's copy is exactly the save's
export function planFromData(data: PlayerData, userId: number, now: number): { wants: Want[]; drops: Drop[] }

// Server: at every leave (the profile's last write), plus when a preference changes
playerData.ProfileReleasing.Connect((profile) => {
	const plan = planFromData(profile.Data, profile.UserId, os.time());
	for (const d of plan.drops) notify.drop(profile.UserId, d.kind, d.key, d.why);
	for (const w of plan.wants) notify.want(profile.UserId, w.kind, { key: w.key, at: w.at, until: w.until, params: w.params });
});
```

- **State kinds** (streak, quests, daily) come from the save at the leave. Use key `""` (one intent per kind, upserted), and
  `drop` when the reason is gone (streak too short, nothing to claim), so a stale reason never goes out.
- **Event kinds** (a gift to an offline player, a leaderboard pass) are wanted where the event happens, by UserId, from any
  server. Use a stable key (the letter id, the board) so every server seeing the same event upserts one intent.
- **No need to drop on join.** The backend never sends to a player who is online or within `quietAfterLeaveMinutes` of
  leaving, and the next leave re-plans everything.
- **Windows**: `at` = the earliest moment it is true, `until` = when it stops being worth saying. A window under ~30 min
  isn't worth wanting.

### 4. Player preferences

Give players a toggle per kind (Settings), stored in their save. Gate the save-planned kinds in `planFromData` (an off kind
is dropped), **and** send the whole off set with `setOff(user, kinds)` at every join and every change: event kinds are wanted
by servers that can't read the save, and the backend skips any intent of an off kind (`skipped`, why `pref_off`, kept, so
switching it back on resumes it).

### 5. The opt-in prompt

`promptOptIn(where)` shows Roblox's prompt, at most once a session; Roblox itself shows it at most once per 30 days and never
to under-13s. Ask at a natural moment that explains the value (e.g. when the player closes their mailbox: "get told when a
gift arrives"), plus a button in Settings. The answer is not told to the game: the backend learns it from its first send
(`optin_inferred`).

### 6. Check it end to end

1. A test send reaches your device (`notify test`).
2. Tap it: an `open` row (the verified token, `onOpen` fires) and, after you play, `played`.
3. The explorer's **Notifications** page shows the funnel; the player page shows each send, its status, opened / played.
4. A gift to yourself while offline: the `want` row, then a `sent` after `quietAfterLeaveMinutes`.

If you call Open Cloud yourself (outside TypeTorch): `join_experience` and `analytics_data` go **inside** `payload`
(the API reference's `UserNotification_Payload`). At the top level, as the Open Cloud guide's curl example has it, Roblox
answers 200 and silently drops both, so taps carry no launch data and the dashboard has no category.

## Open questions (spikes)

What TypeTorch assumes until these are measured on a test universe:

| # | Question | Assumed now |
|---|---|---|
| S4 | Does the launch data survive every path (phone app, web, first install)? | it does; expect some "clicked but no open row" |
| S6 | What `JoinSource` does a notification tap have? | nothing depends on it; it is logged as `ctx` on the join row |
| S3 (partly) | The exact refusal for a second send in a day, on a non-owner account | HTTP 429 `RESOURCE_EXHAUSTED` with "1 notification per recipient" (below) |

Settled (measured on a test universe, 2026-11-07):

- **S4, desktop**: the launch data arrives on a tap (desktop app and browser) once `join_experience` is inside `payload`;
  at the top level Roblox drops it silently (the backend sends the nested shape since 2026-11-07).

- **S1, not opted in**: HTTP 400 `FAILED_PRECONDITION` "not opted in". The backend mutes the user for 7 days and writes
  `optin_inferred {state: "not_subscribed"}`.
- **S1b, wrong message id**: HTTP 404 `NOT_FOUND`: [a halted kind](#a-halted-kind-bad-template).
- **S2, rate limit**: 4000 requests a second per key. Every answer says so in its `x-ratelimit-limit`,
  `x-ratelimit-remaining` and `x-ratelimit-reset` headers, and the backend paces itself by them (never more in a window
  than the last `remaining`; it waits for the reset at 0). `notify.rate` is only an optional lower ceiling of our own. A
  `429` still halves the pace and honours `Retry-After`.
- **S3, 1 a day (partly settled)**: Roblox refuses a user's second notification of the day at send time with HTTP 429,
  code `RESOURCE_EXHAUSTED`, a message containing "1 notification per recipient"
  ([devforum](https://devforum.roblox.com/t/issues-with-opencloud-experience-notifications/3874557)). Roblox also lists
  an aggregate daily cap across experiences.
  - **That refusal** is a "daily limit" for the backend: the send ends `failed` (code `daily_limit`) with no retry, and
    the notification is re-planned for the user's next day.
  - **Any other `429`** is rate limiting: the backoff above (`x-ratelimit-*`, `Retry-After`).
  - **`dailyCap` stays** our own guard, so the refusal should be rare. `notify.clock` picks its day: `rolling24`
    (default: the next send at least 24 h after the last) or `utc_day`.
  - **Don't test limits on the owner's account.** Test sends to the universe owner all answered 200: the owner most
    likely skips the throttle, so those sends say nothing about limits.
  - **Still open**: the exact message, until it is confirmed on a non-owner account.
