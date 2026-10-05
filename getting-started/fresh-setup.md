# Fresh setup: from zero to a live hot-swap

This guide sets up a new TypeTorch game from the starter template and ends with a live server that hot-swaps while you
play. Every step ends with **Check**: what you should see when it worked.

You need about an hour. Steps 3 to 9 are done once per game.

**Who does what.** Some steps need the account that owns the experience. For a group-owned game that is the **group
owner** (or a member whose group role may create assets and publish places). They are marked **(owner)**.

## 1. Install the tools

| Tool | Why | Install |
|---|---|---|
| [Bun](https://bun.sh) 1.3+ | package manager and the CLI's runtime | PowerShell: `powershell -c "irm bun.sh/install.ps1 \| iex"`; bash: `curl -fsSL https://bun.sh/install \| bash` |
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

TypeTorch packages are not on npm yet (**planned** for the first npm release). Today your game uses packed copies of
local checkouts that sit **next to** your game:

```text
games/                 any folder
  my-game/             your game (a copy of the template)
  framework/           https://github.com/typetorch/framework
  kernel/              https://github.com/typetorch/kernel
  transformer/         https://github.com/typetorch/transformer
  cli/                 https://github.com/typetorch/cli
  dev-server/          https://github.com/typetorch/dev-server   (optional, for remote-claude)
```

From the `games` folder:

```sh
git clone https://github.com/typetorch/template my-game
git clone https://github.com/typetorch/framework
git clone https://github.com/typetorch/kernel
git clone https://github.com/typetorch/transformer
git clone https://github.com/typetorch/cli
cd my-game
git remote remove origin
```

Install the dependencies:

```sh
cd ../framework
bun install
cd ../transformer
bun install
cd ../cli
bun install
cd ../my-game
bun scripts/packages.ts
bun install
rokit install
```

`bun scripts/packages.ts` builds `../framework` and `../transformer`, packs them and `../kernel` into
`.typetorch/packages/`, and copies them into `node_modules`. Run it again (`bun run packages`) whenever you pull new
framework, transformer or kernel commits.

Add a script so you can run the CLI from the game folder. In `package.json`, under `"scripts"`:

```json
"typetorch": "bun ../cli/src/index.ts"
```

From now on, `bun run typetorch <command>` runs the CLI. (The CLI checkout also has `bin/typetorch` and
`bin/typetorch.cmd`: put `cli/bin` on your PATH to type `typetorch <command>` anywhere.)

**From the first npm release (planned):** `npm i @typetorch/framework` and `npm i -D @typetorch/transformer` (or the
`bun add` equivalents), then the CLI with `npx @typetorch/cli <command>` (no install) or `npm i -g @typetorch/cli` and
`typetorch <command>`. No sibling checkouts. The CLI runs on Node 20+ or Bun; builds still need Bun.

Run the compiler through `bun run build` (or `bunx rbxtsc`). In a Bun project on Windows, `npx rbxtsc` runs an
unrelated placeholder package.

**Check:**

```sh
rojo --version
bun run build
bun run typetorch build
```

- `rojo --version` prints `7.7.0-rc.1` inside `my-game`.
- `bun run build` compiles with no errors.
- `bun run typetorch build` ends with a `built <id> (branch ..., channel ...)` line and
  `.typetorch/payload.rbxm ... modules`.

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
| Allow HTTP Requests | on | the Claude tab (remote-claude) calls your PC. Harmless otherwise. The kernel place file turns it on too |
| Enable Studio Access to API Services | on | Studio playtests read branch heads and DataStores |
| Allow Mesh / Image APIs | optional | only for images Claude shows in the chat; the owner must be 13+ and ID-verified |
| Allow Loading Third Party Assets | optional | only for remote-claude Toolbox inserts. It applies to every server of the experience |

`ServerScriptService.LoadStringEnabled` is not in Game Settings. The kernel place file sets it, because remote-claude's
`run_luau` needs it on dev servers (prod servers never run it). If you won't use remote-claude, you may turn it off in
Studio's Properties after step 8; a later `kernel deploy --replace-place` turns it on again.

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
| `members` | Roblox user id → `owner`, `admin` or `dev` (who gets the dev menu; see step 11) |
| `revoked` | optional: user ids that lose dev access |
| `devBadgeId` | optional badge id; its holders are devs |
| `approval` | `all` (default): every deploy waits for your y/N; `prod`: only prod-channel deploys do; `none` |
| `kernel` | the kernel folder for `kernel deploy` (the packed copy in `node_modules`, or `../kernel`) |
| `signingPublicKeys`, `revokedKeys`, `fallbackPublicKey`, `keyAssetId` | written by `typetorch keys` (step 7). Don't edit by hand |

Commit it:

```sh
git add typetorch.json package.json
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
| assets | `deploy`, `upload`, `promote` (of an unfinished upload), `keys init` / `rotate` (the key asset), `assets sync` / `status`, `doctor` | `asset:read`, `asset:write`; for hot assets and doctor's place check also Luau Execution `universe.place.luau-execution-session:read` and `:write` |
| deploy | `deploy`, `rollback`, `promote`, `approve`, `pin`, `keys rotate` / `resign`, `config push`, `deployments` | `universe-messaging-service:publish`, `universe:read`; `universe:write` to write the registry |
| place | `kernel deploy` only | place publishing (`universe-places` write; the CLI calls it `universe.place:write`), and `asset:read` to record the place version |

- **The registry** (one ConfigService key that stores branch heads, members and channels) is optional. Give the key
  **both** `universe:read` and `universe:write`, or neither: a deploy stops when it can read the registry but not write
  it. Without it, game servers store the heads themselves, and `members` only reach game servers through
  `config push`.
- Set an expiry date, and add your IP under accepted IP addresses if you can.

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
- **Back up both key files** (a password manager, or offline). They are plaintext and never leave your PC. Never put
  them in a repo.

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
  history). Patching only the kernel is **planned**. For such places, see
  [migrate: install the kernel](migrate.md#9-install-the-kernel-in-your-place).
- Studio must not have the place open in Team Create while you publish: that returns 409.

**Check:** join the game from the Roblox app. Open the Developer Console (F9) > **Server**. You should see:

```text
[TypeTorch] kernel 0.3.1@<commit> (API 1) on a public server, branch prod, signed deploys only (keys: key asset)
[TypeTorch] branch prod: nothing loaded (no verified, bootstrap or usable stored head); waiting for a signed deploy
```

Type `/tt status` in chat: it answers (you are the owner, so you are a dev).

## 9. First deploy

Commit everything, stay in the game (keep that server running), then deploy from the `main` branch:

```sh
git status
bun run typetorch deploy --dry-run
bun run typetorch deploy
```

- `main` maps to the TypeTorch branch `prod` (prod channel), so the CLI builds a clean prod build (debug prints
  removed), uploads it, waits for moderation, then asks **y/N**. Answer `y`: it signs the message with both keys and
  publishes it.
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
- in `members` (`owner`, `admin` or `dev`), once you ran `bun run typetorch config push` (needs `universe:read` and
  `universe:write`);
- a holder of the `devBadgeId` badge (also through `config push`; awarding the badge in game is **planned**);
- anyone in a Studio playtest;

and not in `revoked`. Prod-channel servers (every public server) show the menu read-only. Tabs:
[The dev menu](../guides/dev-menu.md).

**Check:** as the owner you see the DEV button in game. After `config push`, a member sees it too.

## 12. `/tt` chat commands

Devs only. They work even when a build is broken, so they are the fallback when the dev menu can't open.

| Command | What it does | Who |
|---|---|---|
| `/tt status` | branch, channel, artifact, kernel build, signing mode | dev |
| `/tt branch <name>` | switch this server to a branch | dev, private or reserved servers only |
| `/tt new <branch> [assetId]` | open a reserved server on a branch (pinned to an artifact if given) and teleport you | dev |
| `/tt reload` | load the branch head again | dev |
| `/tt rollback` | swap this server back to its previous artifact | dev; owner/admin on prod-channel servers |
| `/tt pin <assetId>` / `/tt unpin` | hold this server on a known artifact / release it | dev servers; prod servers take only signed pins (`typetorch pin`) |
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
- [Player data](../guides/player-data.md) before you save anything for players.
- [Hot assets](../guides/hot-assets.md): let builders update models and UI live.
- [remote-claude](../guides/remote-claude.md): prompt Claude Code from inside a dev server.
- [Troubleshooting](../guides/troubleshooting.md) when something doesn't match a **Check**.
