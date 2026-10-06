# Fresh setup: from zero to a live hot-swap

This guide sets up a new TypeTorch game from the starter template and ends with a live server that hot-swaps while you
play. Every step ends with **Check**: what you should see when it worked.

You need about an hour. Steps 3 to 9 are done once per game.

**Who does what.** Some steps need the account that owns the experience. For a group-owned game that is the **group
owner** (or a member whose group role may create assets and publish places). They are marked **(owner)**.

## 1. Install the tools

| Tool | Why | Install |
|---|---|---|
| [Bun](https://bun.sh) 1.3+ | package manager; runs the builds | PowerShell: `powershell -c "irm bun.sh/install.ps1 \| iex"`; bash: `curl -fsSL https://bun.sh/install \| bash` |
| [git](https://git-scm.com) | every build is identified by its commit | your OS package manager |
| [Rokit](https://github.com/rojo-rbx/rokit) | pins Rojo and Lune per project | the Rokit releases page, then `rokit self-install` |
| Roblox Studio | creating the experience, settings, testing | [create.roblox.com](https://create.roblox.com) |
| Rojo Studio plugin 7.7.0-rc.1 (optional) | only for [testing in Studio](../guides/studio-testing.md) | from the Rojo release that matches `rokit.toml` |

roblox-ts, Rojo and Lune are installed per project in step 2.

**Check:**

```sh
bun --version
git --version
rokit --version
```

Each prints a version (Bun 1.3 or newer).

## 2. Get the code

Clone the template and install:

```sh
git clone https://github.com/typetorch/template my-game
cd my-game
git remote remove origin
bun install
rokit install
```

- `bun install` gets every TypeTorch package from npm: `@typetorch/framework` and `@typetorch/kernel`, and as dev
  dependencies `@typetorch/transformer`, `@typetorch/cli` and `@typetorch/dev-server`. It also installs roblox-ts.
- `rokit install` installs Rojo and Lune at the versions pinned in `rokit.toml`.
- `bun run typetorch <command>` runs the CLI (the template's `"typetorch": "typetorch"` script). Without installing,
  `npx @typetorch/cli <command>` runs the same CLI. The CLI runs on Node 20+ or Bun; builds still need Bun.
- Run the compiler through `bun run build` (or `bunx rbxtsc`). In a Bun project on Windows, `npx rbxtsc` runs an
  unrelated placeholder package.

**Check:**

```sh
rojo --version
bun run build
bun run typetorch build
```

- `rojo --version` prints `7.7.0-rc.1` inside `my-game`.
- `bun run build` compiles with no errors.
- `bun run typetorch build` ends with a `built <id> (branch ..., channel ...)` line,
  `.typetorch/payload.rbxm ... modules`, and `sources  template <commit>, framework v0.3.0, kernel v0.3.2` (the npm
  versions you installed).
- Later, `bun run typetorch update` moves the CLI to the newest version on npm (it asks first; `--check` only shows
  the versions).

### Unreleased framework or kernel changes (optional)

Skip this unless you need a framework, kernel or transformer change that isn't on npm yet. Clone those repos **next
to** your game:

```text
games/            any folder
  my-game/        your game
  framework/      https://github.com/typetorch/framework
  kernel/         https://github.com/typetorch/kernel
  transformer/    https://github.com/typetorch/transformer
```

From the `games` folder:

```sh
git clone https://github.com/typetorch/framework
git clone https://github.com/typetorch/kernel
git clone https://github.com/typetorch/transformer
cd framework
bun install
cd ../transformer
bun install
cd ../my-game
bun run packages
bun run build
```

- `bun run packages` builds `../framework` and `../transformer`, packs all three into `.typetorch/packages/`, and
  extracts them over `node_modules/@typetorch`: a local override of the npm versions. Run it again after you pull or
  change a checkout.
- The override stays on across `bun install` until `bun run packages --off`, which deletes it and reinstalls the npm
  versions.
- With the override, `typetorch build` stamps the checkouts' commits as the payload's sources
  (`framework <commit>, kernel <commit>`) instead of the npm versions.
- On Windows with git's `core.autocrlf` on, `--off` can rewrite `bun.lock` with other line endings, so the next build
  id ends in `-dirty`. `git checkout -- bun.lock` makes the tree clean again.

## 3. Create the group and the experience (owner)

A group-owned game is the usual setup: the payloads, the key asset and the hot assets are uploaded to the group, and
`LoadAsset` only loads assets that the experience's owner owns.

1. Create a group on Roblox, or use your existing one.
2. In Studio: **File > New > Baseplate**, then **File > Publish to Roblox As...**. Pick the group as the creator and
   create a new experience. (The kernel deploy in step 8 replaces this baseplate.)
3. In [Creator Hub](https://create.roblox.com/dashboard/creations), open the experience's "..." menu and use
   **Copy Universe ID** and **Copy Start Place ID**.

**Check:** you have two numbers, the universe id and the place id, and the experience shows the group as its creator.

## 4. Experience settings (owner)

In Studio, with the place open: **File > Game Settings > Security**.

| Setting | Value | Why |
|---|---|---|
| Allow HTTP Requests | on | the kernel's live server reports ([fleet API](../guides/fleet-and-alerts.md)), [analytics](../guides/analytics.md), and the Claude tab (remote-claude). The kernel place file turns it on too |
| Enable Studio Access to API Services | on | Studio playtests read branch heads and DataStores |
| Allow Mesh / Image APIs | optional | only for images Claude shows in the chat; the owner must be 13+ and ID-verified |
| Allow Loading Third Party Assets | optional | only for remote-claude Toolbox inserts. It applies to every server of the experience |

`ServerScriptService.LoadStringEnabled` (not in Game Settings, in Studio's Properties) turns `loadstring` on for the
whole place. Only remote-claude's `run_luau` needs it, on dev servers. **Turn it on only in a place where you want
`run_luau` (a test place); keep it off in a live game.**

- `kernel deploy` patches (`--place-file`, CLI 0.7.3+) leave your place's value as it is.
- `kernel deploy --replace-place` (step 8) publishes what the kernel's place file says: on, up to kernel 0.3.5. Turn
  it off in Studio afterwards if this place won't use `run_luau`.
- A `--loadstring` flag to turn it on on purpose is **planned** (with kernel 0.3.6).
- `bun run typetorch doctor` reports it (`loadstring`).

**Check:** the settings stay on after you reopen Game Settings.

## 5. typetorch.json

The template's `typetorch.json` belongs to the template's own test game. Replace it with yours:

```json
{
	"project": "my-game",
	"universeId": 1234567890,
	"placeId": 9876543210,
	"creator": { "groupId": 1234567 },
	"defaultBranch": "prod",
	"branches": { "main": "prod" },
	"channels": { "prod": "prod" },
	"members": { "111111111": "owner" },
	"devBadgeId": null,
	"approval": "prod",
	"kernel": "node_modules/@typetorch/kernel"
}
```

Remove the template's `signingPublicKeys`, `keyAssetId` and `fallbackPublicKey`: step 7 writes yours.

| Field | Meaning |
|---|---|
| `project` | a short name, used in asset names |
| `universeId`, `placeId` | your experience (step 3) |
| `creator` | the experience owner: `{ "groupId": … }` or `{ "userId": … }`. Payloads are uploaded to it |
| `defaultBranch` | the branch public servers run (`prod`) |
| `branches` | git branch → TypeTorch branch. Unlisted git branches map to their own name, lowercased, `/` → `-` |
| `channels` | TypeTorch branch → `prod` or `dev`. Unlisted: `prod` for `defaultBranch`, `dev` for everything else |
| `members` | Roblox user id → `owner` or `dev` (who gets the dev menu; see step 11). The old role `admin` counts as `dev`. Servers see it after `typetorch access push` |
| `revoked` | optional: user ids that lose dev access |
| `devBadgeId` | optional badge id; its holders are devs |
| `approval` | `all` (default): every deploy waits for your y/N; `prod`: only prod-channel deploys do; `none` |
| `kernel` | the kernel folder for `kernel deploy` (`node_modules/@typetorch/kernel`, or a kernel checkout) |
| `signingPublicKeys`, `revokedKeys`, `fallbackPublicKey`, `keyAssetId` | written by `typetorch keys` (step 7). Don't edit by hand |
| `fleet` | optional, `{ "url": ... }`: written by `typetorch fleet setup` ([Live servers and alerts](../guides/fleet-and-alerts.md)) |

Commit it:

```sh
git add typetorch.json
git commit -m "My game"
```

**Check:** `bun run typetorch doctor` lists `typetorch.json` as `ok` with your universe and place (key checks fail
until step 6).

## 6. The Open Cloud API key (owner)

Create it in [Creator Hub](https://create.roblox.com/dashboard/credentials) > **Open Cloud > API Keys > Create API Key**,
as the group owner (or a member allowed to upload and publish for the group). A key acts with its owner's permissions.

Add these permissions and select your experience where asked:

| CLI job | Commands | Scopes |
|---|---|---|
| assets | `deploy`, `upload`, `promote` (of an unfinished upload), `test --cloud`, `keys init` / `rotate` (the key asset), `assets sync` / `status`, `doctor` | `asset:read`, `asset:write`; Luau Execution `universe.place.luau-execution-session:read` and `:write` (the cloud test that runs before every prod deploy, hot assets, doctor's place check) |
| deploy | `deploy`, `rollback`, `promote`, `approve`, `pin`, `keys rotate` / `resign`, `deployments`, `report`; `fleet setup`, `access push` | `universe-messaging-service:publish`; DataStore `universe-datastores.objects:read`, plus `:create` and `:update` (the shared deploy number, below); `universe:write` only for `fleet setup`, `access push` and the analytics settings |
| place | `kernel deploy` only | place publishing (`universe-places` write; the CLI calls it `universe.place:write`), and `asset:read` to record the place version |

- **The shared deploy number.** Every machine that deploys (your PC, a second PC, remote-claude) takes the next
  deploy number (`#seq`) from the game's DataStore: the kernel's records of past deploys, and a counter the CLI claims
  atomically. That's what the DataStore scopes are for. Without them a deploy uses only your PC's log (fine while you
  deploy from one machine), and `--require-shared-seq` stops instead.
- **Not available to API keys today:** `universe:read` (it reads the ConfigService registry; `members` go through
  `access push` instead, which needs only `universe:write`) and `legacy-asset:manage` (`kernel deploy` downloading the
  place; pass a copy instead, see step 8). Creator Hub doesn't offer them for API keys. Deploys don't need them: game
  servers keep the branch heads from the deploy messages themselves.
- Set an expiry date, and add your IP under accepted IP addresses if you can.
- Everything runs from your machine. TypeTorch never uses GitHub Actions or other hosted CI, so the key never has to
  leave your PC.

**Store the key outside the repo.** Make a folder and an env file for this game:

```powershell
# PowerShell
New-Item -ItemType Directory -Force "$HOME\.config\typetorch" | Out-Null
notepad "$HOME\.config\typetorch\my-game.env"
```

```bash
# bash
mkdir -p ~/.config/typetorch
nano ~/.config/typetorch/my-game.env
```

Put one line in it, then save:

```text
TYPETORCH_API_KEY=<your key>
```

Then point the game at it. In `my-game/.env` (gitignored by the template), one line:

```text
TYPETORCH_ENV_FILE=~/.config/typetorch/my-game.env
```

- One shared key (`TYPETORCH_API_KEY`) is the simple setup. You may split it per job instead:
  `OPENCLOUD_ASSETS_KEY`, `OPENCLOUD_DEPLOY_KEY` and `OPENCLOUD_PLACE_KEY` (each falls back to the shared key).
- remote-claude reads the key the same way (environment, `TYPETORCH_ENV_FILE`, `.env`) and needs the shared key (`TYPETORCH_API_KEY`);
  see [remote-claude](../guides/remote-claude.md).
- Never commit a key, never paste it into chat or an issue, and never give it to an agent.

**Check:** `bun run typetorch doctor`. The `key assets`, `key deploy` and `key place` lines are `ok` (or `warn` with
"shared"), and each `scope ...` probe is `ok` for the scopes you added. The messaging probe publishes one harmless
message to the topic `TypeTorch/doctor`.

## 7. Prod signing keys

With kernel 0.3, public servers only run prod builds that you signed. Two key pairs do it: the **main key** (shown as
**Root Key** in the dev menu) and the **Fallback Key**. Details: [Prod signing](../guides/prod-signing.md).

```sh
bun run typetorch keys init
bun run typetorch keys init --fallback
git add typetorch.json
git commit -m "Prod signing keys"
```

- `keys init` writes the main key file `~/.config/typetorch/keys/<universeId>.key`, creates the **key asset** (a small
  group-owned Model that lists the trusted public keys) and writes `signingPublicKeys` and `keyAssetId` into
  `typetorch.json`.
- `keys init --fallback` writes `~/.config/typetorch/keys/<universeId>.fallback.key` and `fallbackPublicKey`.
- **Back up both key files and your env file** offline (an encrypted USB stick, or a password manager). They are
  plaintext and never leave your PC. Never put them in a repo. Before a live game depends on them, also split off an
  `asset:write` key and plan a rotation drill ([Prod signing: back up and drill](../guides/prod-signing.md#back-up-and-drill)).

**Check:** `bun run typetorch doctor` shows both key files `ok` and matching `typetorch.json`, and the key asset as
Approved.

## 8. Publish the kernel place (owner)

The kernel is the only TypeTorch code in the place. Today `kernel deploy` publishes the **whole** place from the
kernel's place file: a baseplate, a spawn and the kernel. That is right for this fresh place.

```sh
bun run typetorch kernel deploy --dry-run
bun run typetorch kernel deploy --replace-place --yes
```

- The dry run runs the kernel's Lune syntax check, prints the kernel version and hash, and builds
  `.typetorch/place.rbxl` with your trust roots stamped: `KeyAssetId`, `FallbackPublicKey` and `BootstrapHeads`. Check
  the `keys` line shows your key asset id.
- `--replace-place --yes` publishes it. It refuses without the keys from step 7.
- **Never use `--replace-place` on a place with Studio-built content**: it wipes it (it stays in the place's version
  history). For such places `kernel deploy` patches only the kernel into a copy of the place: see
  [migrate: install the kernel](migrate.md#9-install-the-kernel-in-your-place).
- Studio must not have the place open in Team Create while you publish: that returns 409.

**Check:** join the game from the Roblox app. Open the Developer Console (F9) > **Server**. You should see:

```text
[TypeTorch] kernel 0.3.2 (API 1) on a public server, branch prod, signed deploys only (keys: key asset)
[TypeTorch] branch prod: nothing loaded (no verified, bootstrap or usable stored head); waiting for a signed deploy
```

(The version is the kernel you installed. A kernel from the
[local override](#unreleased-framework-or-kernel-changes-optional) shows its commit: `kernel 0.3.2@<commit>`.)

Type `/tt status` in chat: it answers (you are the owner, so you are a dev).

## 9. First deploy

Commit everything, stay in the game (keep that server running), then deploy from the `main` branch:

```sh
git status
bun run typetorch deploy --dry-run
bun run typetorch deploy
```

- `main` maps to the TypeTorch branch `prod` (prod channel), so the CLI builds a clean prod build (debug prints
  removed), uploads it, waits for moderation, runs the **cloud test** (the build boots headless in your place, about
  11 s), then asks **y/N**. Answer `y`: it signs the message with both keys and publishes it.
- Then it waits up to 90 s for the servers' reports, and rolls the branch back by itself if the build fails on them
  ([safe deploys](../guides/deploy-and-rollback.md#safe-deploys)). That needs the fleet API; until you set it up, the
  wait is skipped with a note.
- Keep a server running for the first deploy: without a writable registry, the head is stored by the servers that
  receive the message. Later servers boot from that stored head.

**Check:**

- The CLI prints `deployed #1 prod@<commit> -> <artifact id> (asset <id>) in ...`.
- In game, within a few seconds, the Target Rush pad and the lobby coins appear. You stay connected.
- `/tt status` shows the generation. The dev menu (step 11) shows your artifact with two verified badges.
- `bun run typetorch deployments` lists `#1` with `*` (live).

## 10. A dev branch

```sh
git switch -c dev
bun run typetorch deploy
```

- `dev` is a dev-channel branch: unsigned, and with `"approval": "prod"` it publishes without a y/N.
- Public servers ignore it. In game, type `/tt new dev`: you are teleported to a new reserved server running `dev`.

**Check:** `/tt status` in the new server says `reserved server, branch dev (dev)`. Change a value in
`src/shared/rush/config.ts` (for example `TARGET_SIZE`), commit, deploy again, and watch the targets change while you
play. More in [Branches and channels](../guides/branches-and-channels.md).

## 11. The dev menu and who gets it

Devs open the dev menu with the **DEV** button, `Ctrl+Shift+D` or `/tt dev`. A player is a dev when they are:

- the experience owner (the user creator, or rank 255 in the owning group): always;
- in `members` (`owner` or `dev`; an old `admin` counts as `dev`), once you published the lists (below);
- a holder of the `devBadgeId` badge (published the same way; awarding the badge in game is **planned**);
- anyone in a Studio playtest;

and not in `revoked`. **Owners** are the experience's creator (or the owning group's owner) and `members` with the role
`owner`: they also get the Manage tab and can switch any server in place. Prod-channel servers (every public server)
show the menu read-only. Tabs: [The dev menu](../guides/dev-menu.md).

**Publish the lists** after every change to `members`, `revoked` or `devBadgeId`:

```sh
bun run typetorch access push
```

- It writes the server-only ConfigService key `TypeTorchAccess` (the deploy key needs `universe:write`). Game code
  can't write ConfigService, so nothing in your game can make itself a dev. `--dry-run` shows the value first.
- Servers need **kernel 0.3.6+** to read it. Running servers pick a push up within about a minute of ConfigService
  delivering it.
- Before the first push, only the experience owner is a dev. After a change, servers keep the old lists until the
  next push (a revoked dev stays a dev). `deploy` and `doctor` (`dev access`) warn about both;
  `bun run typetorch access status` compares `typetorch.json` with the last push.

**Check:** as the owner you see the DEV button in game. After `access push`, a member sees it too.

## 12. `/tt` chat commands

Devs only. They work even when a build is broken, so they are the fallback when the dev menu can't open.

| Command | What it does | Who |
|---|---|---|
| `/tt status` | branch, channel, artifact, kernel build, signing mode | dev |
| `/tt branch <name>` | switch this server to a branch | devs on private or reserved servers; owners on any server |
| `/tt new <branch> [assetId]` | open a reserved server on a branch (pinned to an artifact if given) and teleport you | dev |
| `/tt reload` | load the branch head again | dev |
| `/tt rollback` | swap this server back to its previous artifact | dev; owners on prod-channel servers |
| `/tt pin <assetId>` / `/tt unpin` | hold this server on a known artifact / release it | devs on dev servers; owners on any server |
| `/tt dev` | open the dev menu | dev |

`/tt grant` and `/tt revoke` are **planned**.

## 13. Roll back

```sh
bun run typetorch rollback --branch prod
```

It points `prod` back to the previous different build. Nothing is rebuilt or uploaded, so it takes about 1 to 2 seconds.
`--to <commit|artifactId|assetId|#seq>` picks a build. It asks y/N and signs like a deploy. More in
[Deploy and rollback](../guides/deploy-and-rollback.md).

**Check:** `bun run typetorch deployments` shows a `rollback` row marked live; in game the previous version runs.

## Next steps

- [Testing in Studio](../guides/studio-testing.md): run your local code with `bun run watch` and `bun run studio`.
- [Live servers and alerts](../guides/fleet-and-alerts.md): `typetorch servers`, deploy reports, alerts, and the
  automatic rollback after a bad deploy.
- [Analytics](../guides/analytics.md): your own analytics, experiments and player journeys (the template already
  creates the engine).
- [Player data](../guides/player-data.md) before you save anything for players.
- [Hot assets](../guides/hot-assets.md): let builders update models and UI live.
- [remote-claude](../guides/remote-claude.md): prompt Claude Code from inside a dev server.
- [Troubleshooting](../guides/troubleshooting.md) when something doesn't match a **Check**.
