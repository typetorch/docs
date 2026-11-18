# For maintainers: widgets over the air

This page is for whoever maintains the TypeTorch app. It explains how the widgets' look and logic change without a new APK,
and where the code is. Game developers do not need it.

The app's widgets have three parts. Each has its own path to the phone:

| Part | What it is | How it ships |
|---|---|---|
| Widget HTML (the spec) | the layout of each size, written as HTML and bindings | over the air, with the app's JavaScript (`setWidgetSpec`) |
| Widget program | the logic that picks what to fetch, merges games, sets colours and handles taps | over the air, as JavaScript (`setWidgetProgram`) |
| Native module | the widget provider, the live watch, the sandbox that runs the program, the drawing | a new APK. Changing it is a native build |

The program runs on Android's JavaScript engine (`androidx.javascriptengine`). That engine is native code, so changing how
it is used needs a new APK.

## Where the code is

The TypeTorch mobile repo is not part of these docs. Its own docs, in `docs/`, are the reference:

| File | What it covers |
|---|---|
| `docs/WIDGET_SPEC.md` | the spec format: elements, bindings, tokens, tap areas |
| `docs/WIDGET_HTML.md` | how the widget HTML is written and the size classes |
| `docs/WIDGET_PROGRAM.md` | the program's `plan`, `shape` and `tap` functions, the limits, the build and check steps |
| `docs/WIDGET_STATS.md` | the metric ids and the windows |
| `docs/WIDGET_RELEASES.md` | the release garden's cells and tokens |
| `docs/PUSH_WATCH_WIDGETS.md` | the backend routes, the live watch and the push payload |
| `docs/FIREBASE_SETUP.md` | the one-time Firebase setup for milestone pushes |
| `docs/widgets-preview.html` | a generated preview of the widget HTML with sample data (see step 4) |

In the code:

| Path | What it is |
|---|---|
| `src/features/live/widgets/default-widget.ts` | the widget HTML (`DEFAULT_WIDGET_HTML`) |
| `src/features/live/widgets/program/` | the program: `index.ts` (plan, shape, tap), `all-games.ts`, `releases.ts`, `health.ts`, `answers.ts` |
| `src/features/live/widgets/program.generated.ts` | the built program (committed; generated, don't edit) |
| `scripts/widgets/build-program.ts` | builds the program into `program.generated.ts` |
| `scripts/widgets/check-program.ts` | runs the program against made-up answers and checks the results |
| `scripts/widgets/check.ts` | checks the widget HTML against the reference spec |
| `scripts/widgets/preview.ts` | builds `docs/widgets-preview.html` |

## Rules for the program

The program runs in an isolated JavaScript engine with no app around it.

- Plain JavaScript, ES2020. No imports at run time (the bundle inlines the files), no `fetch`, no timers, no `console`, no
  app globals.
- No I/O. It gets JSON in and returns JSON out. The phone does the requests.
- At most 2 seconds and 16 MB per call. Output is at most 256 KB. Widget state is at most 4 KB.
- Requests are GET only, to signed-in backends, with a path that starts with `/v1/`. At most eight per widget. The
  program never sees a backend token.
- Each behaviour you change gets a case in `check-program.ts`.

Hermes compiles the app's functions to bytecode, so the program must be a string made at build time. Don't try to read a
function's source at run time.

## Change a widget

1. Edit the HTML in `default-widget.ts`, or the logic in `src/features/live/widgets/program/`.
2. Rebuild the program. The output file is committed.

   ```sh
   timeout 60 bun scripts/widgets/build-program.ts
   timeout 60 bun scripts/widgets/build-program.ts --check   # only reports whether the output is current
   ```

3. Check it.

   ```sh
   timeout 60 bun scripts/widgets/check.ts
   timeout 60 bun scripts/widgets/check-program.ts
   timeout 400 npx tsc --noEmit -p .
   ```

4. Preview it in a browser. The preview draws the widget HTML at the launcher's sizes, by day and by night, with sample
   data. It has an editor: changes redraw at once and are kept in the browser's storage. Copy the changes back into
   `default-widget.ts`.

   ```sh
   timeout 60 bun scripts/widgets/preview.ts
   ```

   Then open `docs/widgets-preview.html`.

5. Ship it over the air. The `preview` channel is the testers' APK, and `production` is the store build (not published yet).

   ```sh
   bunx eas-cli update --channel preview --message "Widgets: <what changed>"
   ```

   An update reaches only builds on the same channel with the same native fingerprint. The app's `runtimeVersion` policy
   is `fingerprint`, so a native change needs a new APK before any update reaches it.

6. On the phone, open the app. It checks for the update on start and applies it on the next start. The widgets redraw
   from the new spec on the app's next foreground or refresh.

Use `bunx eas-cli` in this Bun project. The app's `AGENTS.md` has the same rule.

## What not to change over the air

- Anything in `modules/typetorch-live`: the widget provider, the live watch, the sandbox and the drawing.
- Adding a new permission, a new native library or a new Expo native module. Those need a new APK.

## Related

- [Widgets](mobile-widgets.md): what a game developer sees, sizes, stats, health and All games.
- [Notifications](mobile-notifications.md): the live watch and the Firebase setup.
