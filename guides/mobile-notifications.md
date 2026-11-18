# Mobile app notifications

The app has two kinds of phone notification for a game, and widgets keep the numbers on the home screen:

| Feature | What it does | Needs |
|---|---|---|
| CCU milestone push | a push, such as "Reached 160 CCU", when the live player count first reaches a milestone | the backend's `ccuMilestone` rule, and a phone build with Firebase |
| Live watch | one ongoing notification per game, with live numbers updated every 30 seconds | a signed-in backend |
| Widgets | the same live numbers on the home screen ([Widgets](mobile-widgets.md)) | a signed-in backend |

> **Status: early.** The backend side is on the backend's main branch. The app side is built. Milestone pushes also need
> Firebase in the phone's build.

These are not the same as Roblox experience notifications, which go to your players. See
[Notifications](notifications.md) for those.

## CCU milestone pushes

A milestone fires when the game's live player count (CCU) first reaches it. The milestones start at 10 and double each
time: 10, 20, 40, 80, and so on.

- **Re-arm:** a milestone fires again only after the CCU has dropped below 70% of it.
- **Cooldown:** at most one alert per milestone every 30 minutes.
- **One step at a time:** a jump past several milestones fires only the highest. The first reading after the backend
  starts only learns the level, so a restart never announces one.
- **Where it goes:** the backend's alert webhook (for example Discord), and a push to each phone that turned milestones on.
- **The rule:** the backend's **Settings** page, **Backend alerts** section, rule `ccuMilestone` (level info). Its start
  (10), re-arm (70%) and cooldown (30 minutes) can be changed there. The backend's rule must be on for any milestone to
  fire. Environment: `TYPETORCH_ALERT_CCU_MILESTONE`.

To turn pushes on in the app:

1. Open **Settings**, then **Notifications**.
2. Turn on **CCU milestones** for the game. The app asks for notification permission.
3. Tap **Send a test push** next to the game to check that it arrives.

A tapped milestone opens that backend's Fleet page in the app.

If the phone's build has no Firebase setup, the switch stays off and the app says why. The live watch and the widgets
still work.

A push stops when the phone's registration is removed: you sign out, you revoke the session (or **Revoke all**), the token
expires, or the push service reports that the device is no longer registered.

## Live watch

The live watch shows a game's numbers in an ongoing notification until you stop it.

- **Start:** the eye button in the header of a TypeTorch page starts the watch for that backend. Stop it from the same
  button or from the notification's **Stop** action.
- **One notification per game.** It is silent and low importance, so it does not buzz.
- **Collapsed:** for example "214 playing ▲12 · The Prison", with the average session and the server count.
- **Expanded:** the big CCU and its change, a 30-minute CCU line, the average and median session length for the last
  hour, sessions that ended, servers and today's peak, and the time played in the last hour. **Open** opens the backend.
- **Updates:** every 30 seconds. A network error keeps the last numbers and shows "offline, retrying".
- **Signed out:** the notification shows "Signed out: open TypeTorch" and polling stops for that game. Open the app and
  sign in again.
- **Swiped away:** on Android 14 and newer the notification comes back. Only **Stop** ends a watch.
- **Reboot:** the watch is not restarted after a reboot. Open the app and start it again.

## Keeping it running on Xiaomi and HyperOS

Phones with Xiaomi's HyperOS can stop background work, which stops the live watch and freezes the widgets. Check these
once, after you install the app:

1. Settings, Apps, TypeTorch.
2. **Autostart:** on.
3. **Battery saver:** **No restrictions**.
4. **Notifications:** allowed. For the milestones channel, also allow **Lock screen** and **Floating** if you want
   heads-up alerts.

## For maintainers: Firebase

The milestone push needs Firebase Cloud Messaging in the build, and it is set up once for the app, not per game. The app
identity file (`google-services.json`) goes into the APK. The FCM service account key goes to Expo, and only to Expo. Never
share either key in chat or in a repository.

The steps are in the mobile repo's `docs/FIREBASE_SETUP.md`. The live watch and widgets do not need Firebase.
