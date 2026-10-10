# Branches and channels

## Branches

A **branch** is a name that points at one build (an artifact): `prod`, `dev`, `feature-x`. Deploying a branch moves
the pointer and tells live servers on that branch to swap.

- The TypeTorch branch comes from your git branch: `typetorch.json` `branches` maps git names (`"main": "prod"`);
  unlisted ones use their own name, lowercased, with `/` turned into `-` (`feature/Login` → `feature-login`).
  `--branch <name>` overrides it.
- **Public servers run `defaultBranch`** (`prod`). New public servers always boot it.
- **Private and reserved servers can run any branch.** Their choice is stored and survives a restart.
- **Owners can switch any server in place**, public and prod ones included ([below](#owners-switch-any-server-in-place)).

| How | What happens |
|---|---|
| `/tt new <branch>` | a new reserved server on that branch; you are teleported there |
| `/tt branch <name>` | this server switches: devs on private and reserved servers; owners on any server |
| Dev menu > Server > Branch > **Switch** | the same. On a public server, devs who aren't owners get **Join** instead: it moves only them to a reserved server on that branch |
| `ServerStorage.TypeTorchDev` `Branch` attribute | the branch a Studio playtest boots ([Testing in Studio](studio-testing.md)) |

## Owners switch any server in place

Owners (see [roles](security.md#who-can-do-what)) can change what the server they are in runs, prod included, while
everyone stays in the game. Needs kernel 0.3.4 and framework 0.3.2 (newer than the npm release today; coming soon).

- **Switch** (Server > Branch, or `/tt branch <name>`): this server follows that branch from now on, and takes its
  deploys. On a public server this lasts only for this server's lifetime: new servers still boot the signed `prod`
  build. On a private or reserved server the choice is stored, as before.
- **Load here** (Server > Branch, on a build, or `/tt pin <assetId>`): this server runs that build. It is a normal pin:
  it holds until the next deploy of the branch reaches the server, an unpin, or the server closing.
- **Reload** and **Rollback** work as usual.
- **To go back,** switch to `prod`.
- Each switch takes two taps (a green Confirm, then "Switching..."). The dev menu allows one swap per server every 2 s.
- It changes this server only. Other servers are moved by deploys, or by signed pins from the CLI
  ([pins](deploy-and-rollback.md#pins-ab-experiments)).

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
| Cloud test before publishing | always | with `--test` |
| `deploy --wait` | on by default | with `--wait` |
| Dev menu | read-only: no Dex edits, no cheats. Owners can still switch the server they are in | edits allowed (audited) |
| remote-claude | refused | allowed for the users you list |
| Pins from the CLI or other servers | only signed ones (`typetorch pin`) | dev menu, `/tt pin` or `typetorch pin` |

- A prod-channel branch refuses a dev-channel or dirty build unless you pass `--force` to `deploy`. `promote` refuses
  it even with `--force` ("rebuild for prod").
- The other way round is allowed, and the build keeps its channel: a prod-channel build promoted to a dev branch makes
  that branch's private and reserved servers run prod rules (`TypeTorch.channel` is `"prod"`, read-only dev menu,
  channel-split stores on prod data) until a dev-channel deploy replaces it
  ([Promote](deploy-and-rollback.md#promote)).
- A public server stays effective `prod` whatever it runs: an A/B pin of a dev build, or an owner's switch to a dev
  branch. Its dev menu stays read-only.

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
