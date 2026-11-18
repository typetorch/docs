# Mobile app widgets

Home-screen widgets show your game's live numbers without opening the app. There are two styles: **Stats** (up to four
numbers you pick) and **Releases** (a grid of your deploys, a release garden). A widget shows one game, or **All games**
across every signed-in backend.

> **Status: early.** The widgets read `GET /v1/mobile/live`, which is on backend branches that are not merged to main yet
> (see [Backend status](mobile-app.md#backend-status)). The widget look and the data logic ship over the air, so they can
> change without a new APK.

## Add a widget

1. Long-press the home screen, open **Widgets**, and choose **TypeTorch**. Pick a size.
2. Configure the widget: the game (or **All games**) and the style, **Stats** or **Releases**.
3. For Stats, pick the four numbers. The app's defaults are session length (last hour), DAU, D1 retention and revenue
   (last 72 hours).

To change a widget later, open the app's **Settings**, then **Widgets**. Changes apply at once.

## Sizes

The phone picks the layout from the size you give the widget. The release garden shows as many weeks as fit.

| Size | Stats shown | Release garden |
|---|---|---|
| 4×2 | 4 | 14 weeks |
| 4×1 | 4 | 12 weeks |
| 2×2 | 4 | 11 weeks |
| 2×1 | 3 (2 when very short) | 24 to 26 weeks |

The garden has up to 182 days of history. Days before your backend's deploy history began show as no data, not as zero.

## Stats

Each Stats widget shows up to four **slots**. A slot is a number and a small arrow comparing it with the period before.

| Stat | What it shows | Window |
|---|---|---|
| CCU, servers, peak today | players online now, live servers, the highest CCU since 00:00 UTC | now |
| DAU, WAU, MAU | unique players in the last 24 hours, 7 days, 30 days | fixed |
| New players | players who joined in the window | 1 to 72 hours, or 1 to 90 days |
| D1, D7 | retention of the latest complete cohort | fixed |
| Session length | mean length of sessions that ended in the window | 1 to 72 hours, or 1 to 90 days |
| Playtime | total time played in the window, including running sessions | 1 to 72 hours, or 1 to 90 days |
| Sessions | sessions that ended in the window | 1 to 72 hours, or 1 to 90 days |
| Revenue | Robux spent in the window | 1 to 72 hours, or 1 to 90 days |
| Payers | unique paying players in the window | 1 to 72 hours, or 1 to 90 days |

- **Colours:** time units are orange, `%` is blue, `R$` is green. Values are white (dark on the day theme).
- **Arrows:** ▲ and ▼ compare the number with the window before it. No arrow shows when that number is unknown.
- **The 2×1** shows the first three slots in a short form.

## Release garden

The garden draws one cell per UTC day, in columns of seven days. The newest day is in the bottom right and outlined.

| Cell | Meaning |
|---|---|
| Green, darker for more | prod releases that day |
| Blue, darker for more | dev releases that day |
| Split green and blue | both on the same day (green top left, blue bottom right) |
| Empty | no release |
| No fill | no data (the backend has no history for that day) |

Under the grid the widget shows the prod and dev counts for the period and **last prod**, for example "2 d ago".

Each game's garden comes from its own deploy history. All games merges the days across games, so a day with a release in
any game is coloured.

## All games

An **All games** widget fetches every signed-in backend, up to eight at once, and draws the games together.

- The widget lists up to six games as chips with their icons.
- **Tap a chip** to filter the widget to that game. The other chips dim.
- **Tap the picked chip again** to clear the filter.
- The filter is saved for that widget. Tapping a chip redraws from what the widget already has, without a new fetch.

Tap areas on individual parts of the widget need Android 12 or newer. On Android 11 and older, the whole widget opens the
app and the refresh corner refreshes it.

## Health

Health shows how the game is doing right now next to the numbers. It appears on Stats widgets, on the All games 4×2 and
on the release garden's today cell.

| Part | Rule | Colour |
|---|---|---|
| Errors (last hour) | compared with the hour before. ▲4× when errors are at least 1 and at least twice the hour before. ▲38% when they rose by more than 10%. ▼61% when they fell by more than 10%. Nothing within ±10%, or when there is no data. ▲ alone when the hour before had no errors | red when rising, green when falling |
| Servers | healthy servers against all servers. A game with no servers counts as all healthy | amber when not all are healthy |
| Alerts | open backend alerts. All games lists the newest three across games | amber when any is open |
| Today's cell (garden) | red when errors are high (at least twice the hour before) or a critical alert fired in the last hour. Amber when any alert is open. Otherwise no ring | red or amber ring |

On the smallest sizes the errors part shows only the arrow.

Health needs the widget program (see [For maintainers](mobile-maintainers.md)). Phones without the widget engine, or with
an older backend that sends no health, hide these parts. The numbers still show.

## When a widget updates

- Every 30 minutes, on the phone's schedule.
- When you tap the widget's refresh corner.
- When you open the app.
- On every live watch poll of the same game (see [Notifications](mobile-notifications.md#live-watch)).

A widget that cannot reach its backend keeps its last numbers and shows how old they are. A backend that rejects the
token shows "Open TypeTorch to sign in".

## Limits

- The widget program has 2 seconds and 16 MB per run. A run that fails shows the widget's unreachable state with the
  first line of the error, and keeps the last good drawing.
- The program makes at most eight requests per widget and only to signed-in backends. The phone adds the token. The
  program never sees a token.
- Phones without the widget engine keep the older native path. It draws the same widgets without health.

## Mockups

These are HTML mockups with sample data, made to check the layouts. They are not phone screenshots.

| Mockup | Shows |
|---|---|
| [CCU widgets with health](/mobile/mockups/ccu-health.html) | the Stats widgets with health |
| [All games 4×2, variant C](/mobile/mockups/combo.html) | the All games release garden with health and the latest alerts |
| [Release garden 4×1](/mobile/mockups/garden-final.html) | the one-game release garden in a wide strip |
| [Health 4×1](/mobile/mockups/health4x1-final.html) | the 4×1 Stats widget with health |

> **TODO screenshot:** a home screen with a 4×2 Stats widget and a 4×2 All games widget, taken on the phone. Save as
> `docs/public/screenshots/mobile/widgets-home.png`.

> **TODO screenshot:** the widget picker in the app (Settings, Widgets). Save as
> `docs/public/screenshots/mobile/widgets-settings.png`.

## See also

- [The mobile app](mobile-app.md): install, sign-in and the Open Cloud key.
- [Notifications](mobile-notifications.md): the live watch and battery settings that keep widgets updating.
- [For maintainers](mobile-maintainers.md): how the widget look and logic are edited and shipped over the air.
