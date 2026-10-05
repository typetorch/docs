# Deploy and rollback

All commands run from your game folder. `bun run typetorch <command> --help` shows every flag.

## Deploy

```sh
bun run typetorch deploy --dry-run
bun run typetorch deploy
```

What `deploy` does, in order:

1. **Clean build:** removes ignored files from `out/` and `include/`, writes `src/shared/build.ts`, runs rbxtsc (prod
   channel: debug prints and source paths removed), builds `.typetorch/payload.rbxm` with Rojo, and checks it holds only
   Folders and ModuleScripts.
2. **Upload** as a new private Model asset owned by `creator`, and wait until moderation says Approved.
3. Log it as "uploaded" (`uploads.jsonl` in the state dir), so a later step can't lose it.
4. **Cloud test** (always for prod-channel branches; [below](#the-cloud-test)): the build boots headless in your place.
5. **Approval** (below): a y/N at your terminal, or a proposal.
6. **Sign** (prod-channel branches only; [Prod signing](prod-signing.md)).
7. Take the next `#seq`, update the registry (when your key can read it), publish the deploy message, log "published"
   in `deployments.jsonl`.
8. **Wait for the servers' reports** (prod-channel branches, by default; [below](#wait-and-automatic-rollback)).

Live servers on that branch swap within about 1 to 2 seconds; public servers wait a random 0 to 10 s first so they
don't all load at once. Measured end to end: about 7 to 9 seconds from the command to players on the new build, plus
about 11 s for the cloud test on prod.

Useful flags: `--branch <b>`, `--channel prod|dev`, `--message <text>` (shown in the dev menu), `--no-build` (deploy
the last build), `--no-registry`, `--force` (a dev-channel or dirty build to a prod-channel branch), `--test` /
`--skip-test "<reason>"`, `--wait [s]` / `--no-wait`, `--rollout <1-99>` (dev-channel branches).

### Artifact ids and the deployment number

- **Artifact id:** `<commit7>-<hash6>`, for example `12b63b9-3fa91c`: the git commit plus the first 6 hex of the
  payload's hash. A build from uncommitted changes is `<commit7>-dirty-<hash6>`. Same bytes, same id.
- **Deployment number:** `#seq`, one counter for the whole game. It's the handle to paste when something goes wrong.
  Every machine takes it from the game's DataStore (a counter claimed atomically), so two machines never share one;
  the deploy key needs the DataStore scopes for that ([fresh setup step 6](../getting-started/fresh-setup.md#6-the-open-cloud-api-key-owner)).
- The asset is named `tt-<branch>-<artifact id>`. If Roblox's text filter censors the name to `####`, the CLI renames
  it `TypeTorch payload`. The notes (your `--message`, the commits since the last deploy, and framework and kernel
  changes: a new npm version, or the new commits when you build with the
  [local override](../getting-started/fresh-setup.md#unreleased-framework-or-kernel-changes-optional)) live in the
  payload's `Notes` attribute, and the dev menu shows them.
- **Protocol:** `build` and `deploy` print `protocol unchanged since #N` or `protocol changed since #N`. The
  `ProtocolHash` covers your `createNetwork` interfaces and the framework's wire format. When it is unchanged, kernel
  0.3.2+ lets client messages sent during a swap reach the new build instead of dropping them.

## Approval and proposals

`typetorch.json` `"approval"` decides which deploys wait for a person:

| Value | Needs approval |
|---|---|
| `all` (default) | every deploy, rollback, promote and pin |
| `prod` | only those to prod-channel branches (the template's choice) |
| `none` | nothing |

- **You at a terminal:** `deploy` (or `rollback`, `promote`) goes straight to a **y/N** after the upload. One command.
- **Anyone else** (an agent, a script, the remote-claude dev-server, or `--propose`): the build is uploaded and a
  **proposal** is written to `proposals.jsonl` in the state dir. Nothing is published. It expires after 24 hours.

```sh
bun run typetorch proposals
bun run typetorch approve
bun run typetorch approve 1a2b3c4d
bun run typetorch reject 1a2b3c4d --reason "wrong branch"
```

`approve` refuses unless it runs in an interactive terminal. It lists pending proposals, shows the branch, artifact,
notes, size, who proposed it and what it replaces, asks y/N, then publishes it like a deploy (and signs it for prod).
A prod proposal without a passed cloud test runs the test before the y/N. `--proposed-by <who>` (or
`TYPETORCH_PROPOSED_BY`) labels who prepared it.

Approval is enforced by the CLI. On dev-channel branches, anything holding a key with messaging publish could still send
a deploy message; prod is protected by the signatures ([Security model](security.md)).

## Safe deploys

A bad build should never take a game down. Five layers catch it, from before the publish to after it.

### The cloud test

Before anything is published, the CLI boots the uploaded build in one Open Cloud **Luau Execution** task on your
place's latest published version (what live servers run): it loads it the way servers do, runs the kernel's mount
checks, boots the server side with a stub kernel (`onInit`, `onStart`), requires every Shared module, runs it for 5 s,
stops it, and boots it a second time as a swap would. Any error fails it. It takes about 11 s.

- **Always on for prod-channel deploys and promotes.** Elsewhere add `--test`. A pass of the same asset in the last 24
  hours counts.
- `--skip-test "<reason>"` publishes without it; the reason goes into the deploy log.
- `bun run typetorch test --cloud [<artifact>]` runs it alone.
- **Your code runs against real data there:** DataStores, MemoryStores and HttpService work in a task (with no
  players). Code that must not run in the test can check `workspace:GetAttribute("TypeTorchTest")`.
- Needs the Luau Execution scopes on the assets key ([fresh setup step 6](../getting-started/fresh-setup.md#6-the-open-cloud-api-key-owner)).

### The health window and the last known good build

On every server (kernel 0.3.2+):

- **Load retries:** a build that fails to load is retried after 5, 15 and 60 s, and servers poll their branch's head
  every 60 s, so a server that missed a message catches up.
- **Health window:** a new build is rolled back on that server when an `onStart` fails, or when its own scripts throw 3
  errors within 30 s of starting. Errors from place scripts or the kernel never count. Later errors only mark the
  server `degraded`.
- **Last known good:** the server then runs the newest build that worked: its own history first, then the branch's
  deployments (on prod, only verified ones), skipping builds that already failed there. A failed build isn't retried on
  that server; the next deploy is.
- **Boot budget:** a new server runs a playable build within **15 s** of starting, whatever fails (about 2 s
  normally). Slow reads don't stack up; a head that runs out of boot time is skipped for the next good one, retried in
  the background and swapped in when it works.

### Wait and automatic rollback

After the message, `--wait` follows the servers' deploy reports through the [fleet API](fleet-and-alerts.md):

- **On by default for prod-channel branches** (90 s); off for dev (`--wait` turns it on, `--no-wait` off). It works on
  `deploy`, `promote`, `rollback` and `approve`. Without the fleet API it is skipped with a note.
- It polls every 5 s until every live server on the branch has reported the new `#seq`.
- **Resend:** at about 30 s, if servers are still behind and silent, it sends the same message again (same `#seq` and
  signature; servers ignore one they already applied).
- **Automatic rollback:** when 20% or more of the servers that tried the build report `failed` or `rolled_back` (at
  least one), the CLI rolls the branch back to the previous build, the same way `typetorch rollback` does (signed on
  prod), raises a critical `auto_rollback` alert, waits for the rollback's own reports, and exits 1. At a terminal it
  first shows "rolling back ... in 10 s: Ctrl+C keeps the new build". `--rollback-at <pct>` changes the threshold;
  `--no-auto-rollback` turns it off.
- Failures below the threshold: a red summary, the rollback command, exit 1.
- **Servers that only stall never cause a rollback** (the build isn't proven bad): they are listed, a `server_stuck`
  warning is raised, and the command exits 0 with a warning.

### Deploy reports

Every server reports what it did with each deploy: `booted`, `swapped`, `failed`, `rolled_back` or `skipped`.

```sh
bun run typetorch report latest
bun run typetorch report "#42"
bun run typetorch servers --branch prod
```

`report` shows the counts per result, the errors with the servers that hit them, and the servers still on an older
`#seq`; it exits 1 when one failed or rolled back. More in [Live servers and alerts](fleet-and-alerts.md).

### Rollouts (dev branches)

`--rollout <1-99>` sends a dev-channel deploy to about that share of the branch's servers (stable per server);
`bun run typetorch deploy --widen <1-100>` sends the same `#seq` to more. Prod servers ignore it: to try a build on some
prod servers, use a signed [pin](#pins-ab-experiments).

## Promote

```sh
bun run typetorch promote prod 12b63b9-3fa91c
bun run typetorch promote prod "#42"
```

Points a branch at a build that was already uploaded and approved (from the deployment log, or `uploads.jsonl`), with a
new `#seq`. No rebuild. It finishes a deploy that stopped after the upload, or ships something you uploaded with
`typetorch upload`. A prod-channel branch only takes prod-channel builds, even with `--force` ("rebuild for prod").

In PowerShell, quote `#42`: an unquoted `#` starts a comment.

## Roll back

Branch-wide, for every server:

```sh
bun run typetorch rollback --branch prod
bun run typetorch rollback --branch prod --to 12b63b9
bun run typetorch rollback --branch prod --to "#41"
```

Without `--to` it picks the newest earlier deployment whose build differs from the live one. `--to` takes a commit, an
artifact id, an asset id or `#seq`. Nothing is rebuilt, uploaded or moderated, so it takes about 1 to 2 seconds. It
follows the approval policy, is signed on prod, and waits for reports like a deploy. No cloud test unless `--test` (it
goes to an earlier build).

One server only, in game:

- `/tt rollback`, or the dev menu: this server goes back to its previous different build (its own history). Devs on
  dev-channel servers; owners on prod-channel servers.

Automatic: see [Safe deploys](#safe-deploys).

## The deployment log

```sh
bun run typetorch deployments
bun run typetorch deployments --branch prod --limit 20
bun run typetorch branch ls
```

Every row has `#seq`, time, action (deploy, rollback, promote), `branch@commit`, artifact id, asset id and who; `*`
marks each branch's live head. Uploads that never went out are listed with their `promote` command.

- The logs live in the **state dir**: `.typetorch/` in the game, or `TYPETORCH_STATE_DIR`. Deploys from one machine
  take a lock there, and the DataStore counter keeps `#seq` unique across machines.
- Every command takes `--json`.
- With a readable registry the log also includes deploys made on other machines.

## Pins (A/B experiments)

A pin holds chosen live servers on a known build, for a canary or an A/B test, until the next deploy that reaches them,
an unpin, or the server closing. Pins are never stored.

```sh
bun run typetorch pin 12b63b9-3fa91c --branch prod --pct 10
bun run typetorch pin 12b63b9-3fa91c --branch prod --servers <jobId>,<jobId>
bun run typetorch pin --unpin --branch prod --all
```

- `--pct 1-99` picks about that share of the branch's servers (stable per server); `--servers` names JobIds.
- Pins sent to prod-channel branches are **signed** and need your y/N; prod servers refuse unsigned ones. A signed pin
  may run a dev-channel build on public servers: your signature is the approval.
- In game: on dev servers, devs pin from the dev menu (Server > Branch, Manage > Servers) or `/tt pin <assetId>`.
  Owners can load a build on the server they are in, prod included
  ([Branches and channels](branches-and-channels.md#owners-switch-any-server-in-place)).
- The pinner must be an owner: `--by <userId>`, else the single `owner` in `members`, else the creator.
- [Analytics](analytics.md#experiments) compares pinned servers with the rest (per-server experiments).

## Kernel updates

Code and framework fixes never need a restart. A new **kernel** does: it lives in the place, so it changes with a place
publish, and only new servers run it. Kernel updates are manual (an agent can do them for you, with your OK:
[agent playbook](../agents/AGENTS.md#updating-the-kernel-in-a-game-agents)):

1. In Studio, **File > Download a Copy** of the live place (a binary `.rbxl`), and note its place version.
2. `bun run typetorch kernel deploy --dry-run --place-file <file> --base <version>` replaces only the kernel folders in
   that copy, checks that everything else is unchanged, and writes the patched file and a report. Read its summary.
3. `bun run typetorch kernel deploy --place-file <file> --base <version>` publishes it after a y/N. It refuses if someone
   published meanwhile. Keep the downloaded copy: `bun run typetorch kernel restore <file>` publishes it back (undo).
4. Move players to new servers. The dev menu shows "Kernel update" on old servers, with a **Migrate** button that moves
   everyone on that server to a fresh one.

The CLI can't download the place itself: the scope for that (`legacy-asset:manage`) can't be given to API keys today.
A new, empty place takes `kernel deploy --replace-place --yes` instead
([fresh setup step 8](../getting-started/fresh-setup.md#8-publish-the-kernel-place-owner)).

## Timings (measured)

| Step | Time |
|---|---|
| build | about 3.5 s |
| upload + moderation | 1.5 to 10 s |
| cloud test (prod) | about 11 s |
| message to live servers | 0.8 to 1.8 s |
| load + swap on the server | about 0.25 s |
| **command to players on the new build** | **about 7 to 9 s** (plus the cloud test on prod) |
| **rollback** | **about 1 to 2 s** |
| new server to a playable build | about 2 s, at most 15 s |

## No GitHub Actions

TypeTorch doesn't use or ship GitHub Actions or any other hosted CI: they are a common supply-chain risk. Builds, cloud
tests and deploys run from your own machine. `--require-shared-seq` and `approve --import <dir>` exist for automation
you choose to run yourself.
