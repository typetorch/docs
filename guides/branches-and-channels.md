# Branches and channels

## Branches

A **branch** is a name that points at one build (an artifact): `prod`, `dev`, `feature-x`. Deploying a branch moves
the pointer and tells live servers on that branch to swap.

- The TypeTorch branch comes from your git branch: `typetorch.json` `branches` maps git names (`"main": "prod"`);
  unlisted ones use their own name, lowercased, with `/` turned into `-` (`feature/Login` → `feature-login`).
  `--branch <name>` overrides it.
- **Public servers run `defaultBranch`** (`prod`). Anyone can join them, so they never run a dev branch on their own.
- **Private and reserved servers can run any branch.** Their choice is stored and survives a restart.

| How | What happens |
|---|---|
| `/tt new <branch>` | a new reserved server on that branch; you are teleported there |
| `/tt branch <name>` | this private or reserved server switches (not on public servers) |
| Dev menu > Server > Branch > **Switch** | on a private server: switch it; on a public server: moves only you to a reserved server on that branch |
| `ServerStorage.TypeTorchDev` `Branch` attribute | the branch a Studio playtest boots ([Testing in Studio](studio-testing.md)) |

## Channels

Every branch and every build has a **channel**: `prod` or `dev`. It is the security class.

- `typetorch.json` `channels` sets it per branch; unlisted branches are `prod` when they are `defaultBranch`, else `dev`.
- A build gets the channel of the branch it was built for (`--channel` overrides it). Prod builds compile debug prints
  away (`$print`, `$warn`) and strip source paths.
- A server's **effective channel** is the strictest of its branch's channel, its build's channel, and `prod` for every
  public server.

| | prod channel | dev channel |
|---|---|---|
| Deploy messages | signed (kernel 0.3 verifies) | unsigned |
| Approval (`"approval": "prod"`) | y/N at your terminal | published at once |
| Dev menu | read-only: no dex edits, no cheats, no in-place loads | edits allowed (audited) |
| remote-claude | refused | allowed for the users you list |
| Pins | only signed ones (`typetorch pin`) | dev menu, `/tt pin` or `typetorch pin` |

- A prod-channel branch refuses a dev-channel or dirty build unless you pass `--force` to `deploy`. `promote` refuses
  it even with `--force` ("rebuild for prod").
- A public server running a dev build as an A/B experiment ([pins](deploy-and-rollback.md#pins-ab-experiments)) is
  still effective `prod`.

## A typical flow

```sh
git switch -c feature/shop
bun run typetorch deploy            # branch feature-shop, dev channel
```

In game: `/tt new feature-shop`, test, then merge into `main` and deploy `prod` from there. Each deploy is logged with
its commit; `bun run typetorch branch ls` lists branches, their channels and live heads.

## Data on dev branches

Dev branches run in the same universe, so they can reach the same DataStores. Split your store names by channel so a
test server never writes real players' data:

```ts
const name = TypeTorch.channel === "prod" ? "PlayerData" : "PlayerData_dev";
```

See [Player data](player-data.md).
