# Testing in Studio

Run your **local** code in Studio with the real kernel, the dev menu and DataStores, without uploading anything.
Needs kernel 0.3.1 or newer in `node_modules/@typetorch/kernel` (`bun run packages` gets it).

Deploy messages never reach Studio playtests, so Studio can't follow your deploys. Instead, the kernel mounts your
compiled code straight from `ServerStorage.TypeTorchDev.Payload`.

## Set up (once)

- `studio.project.json` from the template, next to `default.project.json`. It syncs the kernel from
  `node_modules/@typetorch/kernel`, your compiled payload (`out/`, `include/` and the packages) into
  `ServerStorage.TypeTorchDev.Payload`, and the kernel place's baseplate and spawn.
- Two scripts in `package.json` (the template has them):

  ```json
  "watch": "bun scripts/build-info.ts && rbxtsc -w",
  "studio": "rojo serve studio.project.json"
  ```

- The Rojo Studio plugin, the same version as `rokit.toml` (7.7.0-rc.1).
- Game Settings > Security > **Enable Studio Access to API Services**, so DataStores work.

## Run it

Two terminals in the game folder:

```sh
bun run watch
```

```sh
bun run studio
```

Open a place of your experience in Studio, connect the Rojo plugin, press **Play**.

**Check:** Server > Status in the dev menu shows "Studio: local payload", and `/tt status` says "local payload". The
artifact id is `local-<HHMMSS>` on branch `dev` (or the `Branch` attribute of `ServerStorage.TypeTorchDev`), dev
channel.

## How it behaves

- **Code changes need Stop + Play.** Rojo doesn't sync into a running playtest.
- **Reload tests swaps.** The dev menu's Reload (or `/tt reload`) remounts a fresh copy of the same code, so you can
  test `persist`, `onSwapOut`, update toasts and everything else a deploy does, while you play.
- Deploys and the 60 s poll don't move a local session. A pin or a branch switch in the dev menu still loads an
  uploaded build; Reload comes back to the local copy.
- To boot the branch head instead, delete `ServerStorage.TypeTorchDev.Payload` (with Rojo disconnected).
- In Studio everyone is a dev with the owner role, so kick and ban can't be tried there.

## Don't publish that session

Live servers ignore `ServerStorage.TypeTorchDev`, but it bloats the place, and `typetorch doctor` warns when the
published place still holds it. Publish the place only through the kernel deploy (or your own clean Studio session).

## Without a local payload

A Studio playtest with no `ServerStorage.TypeTorchDev.Payload` boots an uploaded build: the head of
`ServerStorage.TypeTorchDev`'s `Branch` attribute, or of `defaultBranch`. A number attribute `BootAssetId` boots one
specific uploaded payload. These read the stored heads from DataStores, so they also need Studio API access.
