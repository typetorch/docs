# The mobile app

The TypeTorch app is a phone app for your Roblox experiences. It lists the experiences your Open Cloud key can reach,
shows their analytics and tools, and shows your self-hosted backend's pages (live servers, deploys, errors, analytics)
natively on the phone. It also has home-screen widgets for live numbers, milestone alerts and exports.

> **Status: early, Android only.** The app ships as an APK for now. It is not on Google Play yet. The backend side
> (sign-in, live numbers, widgets and milestone pushes) is on the backend's main branch. See
> [Backend requirements](#backend-requirements).

The app is open source (MIT) at [github.com/typetorch/mobile](https://github.com/typetorch/mobile), like the other
TypeTorch repos.

## What you need

| For | You need |
|---|---|
| Your experience list and Roblox analytics | an Android phone and an Open Cloud key ([below](#open-cloud-key)) |
| The TypeTorch pages, live numbers, widgets, milestone alerts | a self-hosted [backend](backend-operations.md) for the game and a sign-in to it from the app |
| Widgets that show per-release health | a backend with health and a phone with the widget engine ([Widgets](mobile-widgets.md#health)) |

## Install

1. Ask the maintainer for the APK link. Builds come from EAS (Expo's build service), as an internal APK.
2. Open the link on the phone and install. Android asks once to allow installs from that source.
3. The app checks for updates when it opens and applies them on the next start. **Restart to update** in the app applies
   one now.

A store build (Google Play) comes later. It is built as an app bundle from the `production` profile and is not published.

To build it yourself, clone [typetorch/mobile](https://github.com/typetorch/mobile) and build an APK with EAS from the
`preview` profile (`eas build --profile preview --platform android`). Point it at your own Expo account first: set
`owner` in `app.json` and run `eas init` for a new project id. Milestone pushes
need your own Firebase project's `google-services.json` (see the repo's `docs/FIREBASE_SETUP.md`); without it the app
works and only the pushes are off.

Developers build a development client from the `development` profile. Expo Go is not enough for the widgets and the
live watch, because they use the app's own native module.

## Backend requirements

The app uses these backend routes. They are on the backend's main branch.

| Feature | Backend routes |
|---|---|
| Browser sign-in, admin-token sign-in, refresh, sign-out, revoke | `/auth/mobile/*`, `/v1/auth/mobile/*` |
| Live numbers, live watch and widgets | `GET /v1/mobile/live`, with `metrics=` for widget stats and the release garden |
| Milestone pushes | `POST` and `DELETE /v1/mobile/push`, `POST /v1/mobile/push/test`, and the `ccuMilestone` alert rule |
| TypeTorch pages | the explorer's `/v1/...` routes, called with the mobile token |

The Projects, analytics and tools use Roblox's own APIs and do not need a backend.

## Sign in to a backend

1. Open **Backends** and choose **Add backend**. Type the backend's address (for example `https://backend.example.com`).
   A missing `https://` is added for you. `http://` is only accepted for `localhost`, LAN addresses and `.local` names,
   and the app marks it as not encrypted.
2. Pick a sign-in method:
   - **Sign in with the browser** (the default). The app opens the backend's sign-in page. You sign in with Roblox there,
     approve the consent page and come back to the app.
   - **Use the admin token.** Paste the backend's admin token once. The app trades it for a device token and forgets the
     admin token. Over `http://` the app asks first.
3. The sign-in gives a role. **admin** can use everything the admin token can. **web** is read-only, like the explorer's
   viewers.

The phone keeps a mobile token (`ttm_...`) for each backend, in the phone's secure storage. The token lasts 60 days by
default, and the backend can set 30 to 90. The app renews it when fewer than 15 days remain, and the old token is revoked
at once. A renewed token keeps its sign-in's time: after 180 days from the sign-in (the backend's
`TYPETORCH_MOBILE_TOKEN_MAX_DAYS`), the app must sign in again.

To sign a phone out, use the app's sign-out. On the backend's Settings page, the **Mobile app sessions** card lists the
sessions and revokes one, or every phone at once (**Revoke all**). A backend that rejects the token marks that backend as
signed out. Changing the backend's admin token ends the tokens made with the admin token, but not the Roblox users'
tokens: use **Revoke all** for those.

## Open Cloud key

An Open Cloud key lets the app read your experiences from Roblox. Analytics, the Projects list and the Tools need it.

- **Where to make it:** Creator Hub, Open Cloud, API Keys. Add each experience you want the app to reach. Group
  experiences need a key made under the group.
- **Where it lives:** only on the phone, in the phone's secure storage. The app checks it with Roblox
  (`POST https://apis.roblox.com/api-keys/v1/introspect`) and sends it only to `apis.roblox.com`.
- **Not the backend's key.** A TypeTorch backend keeps its own Open Cloud key (`OPENCLOUD_API_KEY`, see
  [Running the backend](backend-operations.md#open-cloud-key-scopes)). The app never sends its key to a backend.
- **Start read-only.** Settings lists which scopes the key is missing for each feature.

Read-only scopes (enough to list experiences and see analytics):

```text
universe:read                       universe.place:read              universe.analytics:read
group:read                          user.social:read                 user.advanced:read
universe-datastores.control:list    universe-datastores.objects:list universe-datastores.objects:read
universe-datastores.versions:list   universe-datastores.versions:read
universe.ordered-data-store.scope.entry:read   memory-store.sorted-map:read
universe.user-restriction:read      developer-product:read           game-pass:read
```

Write scopes are needed only for the actions in the Tools tab. Every write asks you to confirm first.

| Area | Scopes |
|---|---|
| Experience and places | `universe:write` (also restart servers), `universe.place:write`, `universe-places:write` (publish) |
| Data stores | `universe-datastores.objects:create`, `:update`, `:delete`; `universe-datastores.control:delete`, `:snapshot` |
| Ordered data stores | `universe.ordered-data-store.scope.entry:write` |
| Memory stores | `memory-store.sorted-map:write`; `memory-store.queue:add`, `:dequeue`, `:discard`; `memory-store:flush` |
| Messaging | `universe-messaging-service:publish` |
| Bans | `universe.user-restriction:write` |
| Products, passes, badges | `developer-product:write`, `game-pass:write`, `legacy-universe.badge:write`, `legacy-universe.badge:manage-and-spend-robux` |
| Analytics extras | `universe.analytics:write`, `universe.analytics.dashboard:read` / `:write`, `universe.analytics.alert:read` / `:write` |
| Engagement | `universe.event:read` / `:write`, `universe.notification-string:read` / `:write`, `universe.thumbnail:read` / `:write`, `user.user-notification:write` |
| Servers and live tools | `universe.place.instance:read` / `:write`, `universe.place.luau-execution-session:read` / `:write` |
| Secrets | `universe.secret:read` / `:write` |
| Assets | `asset:read`, `asset:write`, `asset-permissions:write` |
| Other | `ad.campaign:read` / `:write`, `extended-services:read` / `:write` |

Optional legacy scopes (`legacy-universe:manage`, `legacy-game-pass:manage`, `legacy-developer-product:manage`,
`legacy-badge:manage`, `legacy-group:manage`, `legacy-team-collaboration:manage`, `legacy-universe.following:read` / `:write`)
are asked for only by the screens that use them.

## Projects

The home screen lists only the experiences you added: **Pinned** first (tap the star), then **Projects**, in the order
picked with the sort chips. Search filters by name, ID or creator.

**Add projects** opens everything you can reach, in sections: the universes your Open Cloud key names and your own
experiences, then one section per group where your rank is high enough (Settings picks which groups: owned, rank 200 and
up, or all). You can also add an experience by place link or ID there.

A connected backend's universe is always listed, even when it is private or unlisted. Pull to refresh, or search.

## An experience

Each experience has these tabs.

| Tab | What it shows | Needs |
|---|---|---|
| Overview | banner, playing, visits, favourites, likes, description, creator, dates, visibility, devices, private servers, places, public servers | Roblox's public APIs |
| Analytics | Creator Hub's charts: players, sessions, retention, revenue, FPS and crashes, for 7, 28 or 90 days, with breakdowns | `universe.analytics:read` |
| Thumbnails | a gallery of the experience's thumbnails | `universe.thumbnail:read` |
| Ads | the Ads Manager (beta): campaigns and creatives. It has no impressions, clicks or spend yet | `ad.campaign:read` |
| Tools | data stores, ordered and memory stores, MessagingService, restart servers, bans, passes, products and badges | each tool's scope |
| TypeTorch | the backend's pages, for the universe the backend is connected to | a signed-in backend |

Analytics reads are cached for an hour and at most two run at once, because Roblox limits queries per key.

### TypeTorch pages

When a backend is connected to the experience, the **TypeTorch** tab shows the web explorer's pages, natively:
Overview, Roblox, Demographics, Session time, Retention, Funnels, Players (and a player page), Flow, Experiments, Live events,
Notifications, Feedback, First session, Events, Fleet (servers, with their offline history, debug bundles and, for
owners, remote debug), Server history, Deploys, Errors (with drop rules), Performance, Economy, Monetization, Query and
Settings. Owners also see the Audit log and Backend stats. The page list follows the web's sidebar.

The filter bar (range, branch, artifact, device, new or returning, variant) is one state per backend. It stays the same
as you move between pages. The header shows the server status dot, and every page has a command palette and a
**Find player** search.

Maps and recordings have their own pages. See [Recordings and maps](recordings-and-maps.md) for what they show.

## Exports

The export button makes a file on the phone and opens the share sheet, so you can send it to any app.

| Format | What it exports | Notes |
|---|---|---|
| PDF | the whole page | made with the phone's print engine |
| PNG | one block (a chart or a card) | 2x resolution |
| CSV | one block's table | the same numbers as on screen |

## Settings

- **Open Cloud key:** entered and checked here.
- **Roblox user:** whose experiences the Projects list shows.
- **Group filter:** which groups' experiences to list (owned, rank 200 and up, or all).
- **Notifications:** per backend, the CCU milestone switch and the live watch. See [Notifications](mobile-notifications.md).
- **Widgets:** the widgets on the home screen, each with its game and its four stats. See [Widgets](mobile-widgets.md).
- **Appearance:** system, dark or light.

## Privacy

The app keeps everything on the phone: the Open Cloud key and each backend token are in the phone's secure storage. The
Open Cloud key is only sent to `apis.roblox.com`, and each backend token only to its own backend. The app has no analytics
and no telemetry.

## Screenshots

![The Projects home: pinned experiences, then the rest of your projects](/screenshots/mobile/projects.png)

*A mockup with sample data (made in HTML from the app's screens), not a phone capture.*

![An experience's Analytics tab: the range, the granularity, the Engagement group and its metric cards](/screenshots/mobile/analytics.png)

*A mockup with sample data (made in HTML from the app's screens), not a phone capture.*

![The TypeTorch tab's Fleet page: live servers, players, versions and the servers table](/screenshots/mobile/fleet.png)

*A mockup with sample data (made in HTML from the app's screens), not a phone capture.*

## See also

- [Widgets](mobile-widgets.md): sizes, stats, the release garden, health and All games.
- [Notifications](mobile-notifications.md): milestone pushes, the live watch and battery settings on Xiaomi and HyperOS.
- [For maintainers](mobile-maintainers.md): how the app's screens and widgets ship over the air.
