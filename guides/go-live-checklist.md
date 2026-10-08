# Go-live checklist

For moving a game with live players to TypeTorch. Tick every box, in order. [Migrate](../getting-started/migrate.md)
is the code part; this page is everything around it. Plan about a week, mostly testing.

Nothing here touches your live game until step 8, the cut-over.

## 1. Prepare

- [ ] **Keys:** an offline backup of `~/.config/typetorch/keys/*` and your env file, `asset:write` on its own
      IP-limited key, and a rotation drill in your calendar ([how](prod-signing.md#back-up-and-drill)).
- [ ] **The fleet API stays up:** a small VPS with a fixed domain ([set it up](fleet-and-alerts.md#set-it-up)), with a
      Discord or Slack [webhook](fleet-and-alerts.md#webhooks). On your PC behind a quick tunnel it stops when your PC
      does: no automatic rollback, no alerts. If you accept that for the first weeks, watch
      `bun run typetorch servers --watch` yourself after every deploy.
- [ ] **Cross-server messages:** your topics moved to [`TypeTorch.messaging`](messaging.md) (or counted next to
      TypeTorch's: [Cross-server messages](../getting-started/migrate.md#cross-server-messages)).
- [ ] **Who gets the dev menu:** `members` (and `revoked`, `devBadgeId`) in `typetorch.json`, then
      `bun run typetorch access push`, for the copy and later for the live game. Servers need kernel 0.3.8+ to see them
      ([who gets it](../getting-started/fresh-setup.md#11-the-dev-menu-and-who-gets-it)).

## 2. Copy the game

- [ ] Creator Hub: a new experience, "<Game> (TypeTorch test)". In Studio: File > Download a Copy of the live place,
      then publish it into the new experience.
- [ ] A second config for the copy, for example `typetorch.copy.json` with its ids. Pass `--config typetorch.copy.json`
      to every command for the copy. Add the copy to your Open Cloud keys, and run `keys init` and
      `keys init --fallback` for it (signing keys are per experience).
- [ ] Don't touch the live experience yet.

## 3. Convert the code

- [ ] On a branch `typetorch-migration`, follow [Migrate](../getting-started/migrate.md) (or let an agent follow the
      [playbook](../agents/AGENTS.md)).
- [ ] Store names, keys and data shapes unchanged.
- [ ] [Player data](player-data.md): the library and `DataHost` in the place; receipts recorded in the profile before
      `PurchaseGranted`; no save only in `onStop`.
- [ ] Side effects guarded from the cloud test ([what to guard](../getting-started/migrate.md#the-cloud-test-runs-your-game-code)).
- [ ] `bun run build` and `bun run typetorch build` pass; after a commit the id has no `-dirty`.

## 4. Test in Studio

- [ ] On the copy place: `bun run watch` and `bun run studio`, Play ([Testing in Studio](studio-testing.md)).
- [ ] Dev menu > Reload, twice: `persist` state and player data survive.

## 5. Install the kernel in the copy

- [ ] Download a copy of the copy place (note its version), then
      `bun run typetorch kernel deploy --dry-run --install --place-file <file> --base <version> --config typetorch.copy.json`.
      Read the report: only the kernel folders and the kernel's settings change.
- [ ] The same command without `--dry-run` (y/N). Join: F9 shows `[TypeTorch] kernel <version>`.
- [ ] `ServerScriptService.LoadStringEnabled` stays **off** in the live game (`bun run typetorch doctor` reports it).
      Only a test place where you want remote-claude's `run_luau` turns it on. CLIs up to 0.7.2 turn it on during the
      install: check it in Studio, turn it off, publish.
- [ ] Remove the old game scripts in Studio, publish.

## 6. Soak on the copy (3 to 5 days)

- [ ] Deploy `dev` (`--branch dev`), open it with `/tt new dev`, and invite 5 to 10 real testers. Deploy every day while
      they play. Deploy `prod` on the copy too (`--branch prod`).
- [ ] Keep `bun run typetorch servers --watch` and `alerts --follow` open.
- [ ] After each deploy, count your game's errors in the first 30 s (dev menu > Server > Status: "Health window:
      n/3 errors"; Logs shows them). A server rolls back a new build at 3 errors from it within 30 s, so fix noisy
      errors before the cut-over, or set `typetorch.json` `"health"` above your count (kernel 0.3.7+,
      [Set the health window](deploy-and-rollback.md#set-the-health-window)). `doctor` shows the values.
- [ ] Optional: `"autoRollback": { "failedPct": ... }` if 20% failed servers is too eager or too slow for your fleet.

Then run every live test on the copy:

- [ ] **Rollback:** `bun run typetorch rollback --branch prod` with 2+ players in. Players stay, data is intact, the dev
      menu shows the older build.
- [ ] **Broken build:** a prod build whose `onStart` throws outside the cloud test
      (`if (Workspace.GetAttribute("TypeTorchTest") !== true) error("drill")`). Every server rolls back within 30 s,
      `deploy --wait` rolls the branch back, the webhook alert arrives, `typetorch report latest` exits 1.
- [ ] **Noisy build:** 3 harmless errors in `onStart` (guarded the same way). See what happens (today: the server
      rolls back), so you know what your game's own errors would do.
- [ ] **Load failure** (optional, if you can make one): a build whose payload doesn't load. Servers retry it, a
      `deploy_failed` alert arrives, and they keep the old build.
- [ ] **New server, fleet API down:** stop the fleet API, open a new server. Playable within 15 s; `/tt status` shows
      the right build.
- [ ] **Player data:** join, earn, deploy twice while playing, leave, rejoin another server, shut that server down
      from Manage > Servers, rejoin. Nothing lost. Then roll back to older code against data the newer code touched.
- [ ] **Dev data:** after a dev session and after a prod deploy's cloud test, Creator Hub's DataStore Manager shows
      writes only in the `_dev` stores.
- [ ] **Dev access:** a member gets the dev menu; add one to `revoked`, `access push`, and within about a minute they
      lose it.
- [ ] **Purchases:** open a developer product prompt, deploy, buy while the swap runs. One grant, saved; rejoin: no
      second grant. Check a game pass after a swap.
- [ ] **Kernel undo:** `bun run typetorch kernel restore <the file you downloaded in step 5>` once, then install again.
- [ ] **Team Create:** with the copy open in Studio by someone else, `kernel deploy` stops with a 409 and publishes
      nothing.
- [ ] **Slow phone, bad connection:** a client swap finishes, no stuck loading, `/tt status` in chat answers.
- [ ] **Fleet API restart** (and your PC, if it runs there): servers post again within 5 minutes
      (`bun run typetorch servers`). A quick tunnel gets a new URL: run `backend setup` again.
- [ ] **Key rotation:** [the drill](prod-signing.md#back-up-and-drill), on the copy.
- [ ] **2 hours of real players** on the dev branch: read the server logs (dev menu > Logs, or Logs > Upload) for
      `[net]` rejections and kernel warnings.

## 7. Check the data

- [ ] Export a few real profiles from the copy (Creator Hub > DataStore Manager) before and after a swap, and after a
      rollback. Field for field equal.
- [ ] Dev servers wrote only the `_dev` stores.

## 8. Cut-over (a quiet hour)

- [ ] 1. Announce a short maintenance window in the game.
- [ ] 2. In the live place: add the data library and `DataHost`, install the kernel by patch (step 5, with the live
      config), check `LoadStringEnabled` is off, keep the old scripts, publish. Nothing changes for players: the
      kernel waits, the old code runs. `bun run typetorch access push` with the live config.
- [ ] 3. In Studio, remove the old scripts. **Don't publish yet.**
- [ ] 4. `bun run typetorch deploy` from `main`: cloud test, y/N, signed. Servers on the old place version have no
      kernel and ignore it.
- [ ] 5. Publish the place without the old scripts. New servers boot the kernel and the prod build. Move players off
      the old servers from Creator Hub (migrate to the latest update).
- [ ] 6. Watch for 30 minutes: `servers --watch`, `report latest`, the webhook channel, the game. Keep the old place
      file and its version number.

## If something goes wrong

| Problem | Do |
|---|---|
| A bad build | `bun run typetorch rollback --branch prod` (1 to 2 s). With the fleet API up, `deploy --wait` already does it |
| The kernel or the framework | `bun run typetorch kernel restore <the pre-TypeTorch .rbxl>` (or Creator Hub > Version History > Restore), then move players to the new version. The old code reads the same stores, because names and shapes didn't change. Budget 10 minutes |
| Player data | The library is the one you had before. Compare with the profiles you exported in step 7. Dev servers only write `_dev` stores |
