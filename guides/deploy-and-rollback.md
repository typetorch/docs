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
4. **Approval** (below): a y/N at your terminal, or a proposal.
5. **Sign** (prod-channel branches only; [Prod signing](prod-signing.md)).
6. Update the registry (when your key can read it), publish the deploy message, log "published" in `deployments.jsonl`.

Live servers on that branch swap within about 1 to 2 seconds; public servers wait a random 0 to 10 s first so they
don't all load at once. Measured end to end: about 7 to 9 seconds from the command to players on the new build.

Useful flags: `--branch <b>`, `--channel prod|dev`, `--message <text>` (shown in the dev menu), `--no-build` (deploy
the last build), `--no-registry`, `--force` (a dev-channel or dirty build to a prod-channel branch).

### Artifact ids and the deployment number

- **Artifact id:** `<commit7>-<hash6>`, for example `12b63b9-3fa91c`: the git commit plus the first 6 hex of the
  payload's hash. A build from uncommitted changes is `<commit7>-dirty-<hash6>`. Same bytes, same id.
- **Deployment number:** `#seq`, one counter for the whole game. It's the handle to paste when something goes wrong.
- The asset is named `tt-<branch>-<artifact id>`. If Roblox's text filter censors the name to `####`, the CLI renames
  it `TypeTorch payload`. The notes (your `--message`, the commits since the last deploy, and framework and kernel
  changes: a new npm version, or the new commits when you build with the
  [local override](../getting-started/fresh-setup.md#unreleased-framework-or-kernel-changes-optional)) live in the
  payload's `Notes` attribute, and the dev menu shows them.

## Approval and proposals

`typetorch.json` `"approval"` decides which deploys wait for a person:

| Value | Needs approval |
|---|---|
| `all` (default) | every deploy, rollback, promote and pin |
| `prod` | only those to prod-channel branches (the template's choice) |
| `none` | nothing |

- **You at a terminal:** `deploy` (or `rollback`, `promote`) goes straight to a **y/N** after the upload. One command.
- **Anyone else** (an agent, CI, the remote-claude dev-server, or `--propose`): the build is uploaded and a
  **proposal** is written to `proposals.jsonl` in the state dir. Nothing is published. It expires after 24 hours.

```sh
bun run typetorch proposals
bun run typetorch approve
bun run typetorch approve 1a2b3c4d
bun run typetorch reject 1a2b3c4d --reason "wrong branch"
```

`approve` refuses unless it runs in an interactive terminal. It lists pending proposals, shows the branch, artifact,
notes, size, who proposed it and what it replaces, asks y/N, then publishes it like a deploy (and signs it for prod).
`--proposed-by <who>` (or `TYPETORCH_PROPOSED_BY`) labels who prepared it.

Approval is enforced by the CLI. On dev-channel branches, anything holding a key with messaging publish could still send
a deploy message; prod is protected by the signatures ([Security model](security.md)).

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
follows the approval policy and is signed on prod.

One server only, in game:

- `/tt rollback`, or the dev menu: this server goes back to its previous different build (its own history). Devs on
  dev-channel servers; owner and admins on prod-channel servers.

Automatic:

- A new build that throws in `onInit`, or doesn't become ready in about 20 s, is stopped and the server goes back to
  the last good one. A build that fails to load is retried after 5, 15 and 60 s, then reported.

## The deployment log

```sh
bun run typetorch deployments
bun run typetorch deployments --branch prod --limit 20
bun run typetorch branch ls
```

Every row has `#seq`, time, action (deploy, rollback, promote), `branch@commit`, artifact id, asset id and who; `*`
marks each branch's live head. Uploads that never went out are listed with their `promote` command.

- The logs live in the **state dir**: `.typetorch/` in the game, or `TYPETORCH_STATE_DIR`. Deploys from one machine
  take a lock there, so two deploys never share a `#seq`.
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
- Pins to prod-channel branches are **signed** and need your y/N; prod servers refuse unsigned pins. A signed pin may
  run a dev-channel build on public servers: your signature is the approval.
- On dev servers you can also pin from the dev menu (Admin > Servers, Server > Branch) or `/tt pin <assetId>`.
- The owner or an admin must be the pinner: `--by <userId>`, else the single `owner` in `members`, else the creator.

## Kernel updates

Code and framework fixes never need a restart. A new **kernel** does: publish the place (`typetorch kernel deploy`, or
[in Studio](../getting-started/migrate.md#9-install-the-kernel-in-your-place) for a place with content), then move
players to servers on the new version. The dev menu shows "Kernel update" on old servers, with a **Migrate** button
that moves everyone on that server to a fresh one.

## Timings (measured)

| Step | Time |
|---|---|
| build | about 3.5 s |
| upload + moderation | 1.5 to 10 s |
| message to live servers | 0.8 to 1.8 s |
| load + swap on the server | about 0.25 s |
| **command to players on the new build** | **about 7 to 9 s** |
| **rollback** | **about 1 to 2 s** |
