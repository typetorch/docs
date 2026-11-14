# Player feedback

`TypeTorch.feedback()` takes a player's rating and/or text on the game server, checks it, and writes one analytics row
(`kind = "feedback"`, `name = "submit"`). The explorer's **Feedback** page reads those rows: the rating distribution
in the scale's own shape, the trend, and the list with the player, device and context. Framework **0.7.0** and later;
backend from `1484bd5` (plans/32).

You build the UI (a modal, faces, stars, a thumbs bar) and the remote. The framework does the rest: rating checks,
text sanitising and caps, per-player rate limits, and the row.

## Submit

```ts
import { TypeTorch } from "@typetorch/framework";

const feedback = TypeTorch.feedback(); // server only (throws on a client)

// Optional, once at start: the scale in code, used while the settings record has no game.feedback.
feedback.configure({
	scale: { id: "faces5", type: "scale", steps: 5, labels: ["BAD", "MEH", "OK", "GOOD", "GREAT"] },
	maxText: 1000,
	rate: { perMinute: 2, perDay: 20 },
});

// In your remote's handler. The arguments come from a client: everything is checked here.
const result = feedback.submit(player, { rating, text, topic: "bug", ctx: { level: 12, map: "forest" } });
if (!result.ok) {
	// "rate_limited" | "empty" | "bad_rating" | "no_session" | "disabled"
	if (result.reason === "rate_limited") showTryAgain(result.retryIn ?? 60); // whole seconds
}

feedback.scale(); // the scale in effect, to send to clients for the UI (undefined while disabled)
```

| Input | Meaning |
|---|---|
| `rating?` | thumbs: `0` (down) / `1` (up); stars / scale: an integer `1..steps`. Leave it out for text-only feedback |
| `text?` | free text; control characters stripped, whitespace collapsed, trimmed, capped at `maxText` characters and 2000 UTF-8 bytes |
| `topic?` | a category, 1-32 of `[a-z0-9_]` (`bug`, `idea`); anything else is dropped with a warning |
| `ctx?` | your own context, at most 8 keys of 1-24 `[a-z0-9_]`, values a string (64 characters kept), number or boolean |

| Refusal | When |
|---|---|
| `rate_limited` | over the per-minute or per-day limit (`retryIn`: seconds until a submit fits again) |
| `empty` | no rating and no text left after sanitising |
| `bad_rating` | not an integer in the scale |
| `no_session` | no analytics engine runs, or the player has no session in this server |
| `disabled` | switched off, an invalid config, or edit mode |

`submit` never yields. Only accepted submits count against the limits. The limits are per player, in memory, and
reset when the player leaves the server.

## The scale

Declare the scale once. The settings record's `game.feedback` wins (live, no deploy:
`typetorch settings set game.feedback '<json>'`); without it, the game's `configure(...)`; without that, the defaults.

```jsonc
// game.feedback: a 5-step faces scale
{
  "scale": { "id": "faces5", "type": "scale", "steps": 5, "labels": ["BAD", "MEH", "OK", "GOOD", "GREAT"] },
  "maxText": 1000,
  "rate": { "perMinute": 2, "perDay": 20 }
}
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false`: every submit answers `disabled` |
| `scale.id` | `"stars5"` | 1-32 of `[a-z0-9_]`, stamped on every row |
| `scale.type` | `"stars"` | `thumbs` (0 / 1), `stars` or `scale` (1..steps) |
| `scale.steps` | `5` | 2..10; thumbs is always 2 |
| `scale.labels` | none | one per step, lowest first (thumbs: e.g. `["Down", "Up"]`) |
| `maxText` | `1000` | characters of text kept (1..2000) |
| `rate.perMinute` / `rate.perDay` | `2` / `20` | accepted submits per player |

An invalid `game.feedback` disables feedback and warns once (an invalid `configure` throws).

**Changing the scale later:** give the new scale a new `id`. Every row carries its own scale (`scale`, `type`, `steps`,
`label`), so old rows keep rendering as they were, and the page shows one distribution per scale. Averages and the
trend across scales use `norm` (the rating as 0..1).

## The row

| Prop | Meaning |
|---|---|
| `scale`, `type`, `steps` | the scale in effect |
| `r?` | the rating (left out for text-only) |
| `norm?` | `r` as 0..1: thumbs `r`, stars / scale `(r - 1) / (steps - 1)` |
| `label?` | the rated step's label |
| `text?`, `len` | the sanitised text, and the original length in characters (0 = none) |
| `topic?`, `ctx?` | as passed |
| `play_s` | seconds played in this session so far |

Device (`dev`), state (zone / screen / activity), session and the player's id come from the engine, as on every row.
No UserId or username is stored: the explorer finds the player from the pid (the identity store). The full contract is
in the framework's `src/analytics/SCHEMA.md`.

## The Feedback page

In the explorer next to Notifications, with the same range picker:

- **Distribution** per scale: thumbs as up / down shares; stars and scales as a histogram with the step labels and the
  average.
- **Trend**: the count and the average `norm`, per hour for ranges of 2 days or less, per UTC day otherwise.
- **List**, newest first: the rating in its scale's shape, the text, the player (opens the player panel), when, device,
  play time, state, topic and context. Filters: rating, has text, device, text search.
- **Player panel**: a Feedback view with that player's feedback.

Queries for your own tools: `feedback-summary` and `feedback-list` (`POST /v1/query/<name>`; the backend README lists
their options). A [support key](api-keys.md) reads a player's feedback when `feedback` is in `players.supportEvents`
(not in the default list).

## Moving from a custom event

Games that wrote feedback as `kind = "custom"`, `name = "feedback"` with props `{ rating: 1..5, text, length }` don't
need a migration: the backend reads those rows as the scale `legacy_faces5` (BAD / MEH / OK / GOOD / GREAT), marked
legacy, next to the new rows. To switch: update to framework 0.7.0, replace the custom event with
`feedback().submit(...)` (and your own rate limiting with the config's `rate`), and use a new scale `id` (e.g.
`faces5`).
