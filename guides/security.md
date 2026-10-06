# Security model

## Who can do what

| Who | Can |
|---|---|
| **You at your terminal** (holding the Open Cloud key and the signing key files) | build, upload, approve, sign and deploy any branch; roll back; pin; publish the kernel; rotate keys |
| **An agent, a script or the remote-claude dev-server** | build and upload, then only write a **proposal**; you approve it with `typetorch approve` (y/N). The dev-server never targets a prod-channel branch |
| **Owner in game** | everything a dev can, plus the dev menu's Manage tab (kick, ban, bring, shut down and migrate servers, load a build on other dev servers), switching the server they are in to any branch or build (prod included), and rolling back prod-channel servers |
| **Dev in game** | the dev menu and `/tt`: read everything; on dev-channel servers also edit in the Dex, cheats, pins, branch switches, remote-claude |
| **Player** | nothing beyond your game's own network leaves, which are rate-limited, shape-limited and type-guarded |

- **Owners** are the experience's creator (or the owning group's owner) and `members` with the role `"owner"`.
  Everyone else in `members` is a dev; the old role `"admin"` counts as dev.
- Dev status is decided on the server by the kernel: the experience owner, `members`, dev-badge holders, Studio; minus
  `revoked`. Every dev-menu request is re-checked on the server.
- **`members`, `revoked` and `devBadgeId` reach servers only through `bun run typetorch access push`.** It writes
  them into the game's [signed settings record](settings.md) (kernel 0.3.8+), signed with both prod keys. Game code can
  write the DataStore it lives in but can't sign, and servers refuse a record that doesn't verify: a backdoored model
  can't make itself an owner. Run it after every change. Revoking takes effect within seconds (the CLI pings the
  servers), or within about a minute.
  `deploy` and `doctor` warn when `typetorch.json` lists people that were never pushed, or changed since the last
  push (until then a revoked dev stays a dev).
- **Public servers are always effective `prod`:** read-only dev menu, and (kernel 0.3) only signed deploys and signed
  pins from outside the server.

## What protects prod

1. **Approval:** deploys to branches your `approval` policy covers wait for your y/N at an interactive terminal.
2. **The cloud test:** a prod build boots in your place, headless, before it is published
   ([Deploy and rollback](deploy-and-rollback.md#the-cloud-test)).
3. **Signatures:** every prod-channel release is signed with your two Ed25519 keys; kernel 0.3 servers verify it
   ([Prod signing](prod-signing.md)). Code running inside your universe (a dev branch, `run_luau`, a free model, a
   package) can't make a prod server load anything new.
4. **Payload shape:** a payload holds only Folders and ModuleScripts under one Model, checked when it is built and again
   when a prod server mounts it; nothing in an upload runs by itself.
5. **Channels:** dev branches run only in private or reserved servers, or where you put them (signed A/B pins you
   approved, or an owner's switch of one server).
6. **Safe deploys:** a build that fails on a server is rolled back there, and `deploy --wait` rolls the branch back when
   it fails on many ([Safe deploys](deploy-and-rollback.md#safe-deploys)).

What stays open, by design or for now:

- Dev-channel servers accept unsigned deploy messages: anything that can publish MessagingService messages in your
  universe can point a **dev** server at another build.
- **An owner can run any known build on the prod server they are in.** Known builds come from the deployment list,
  which game code can write. It changes that one server only; the payload checks still apply.
- **A public server an owner switched to a dev branch takes that branch's unsigned deploys** until it is switched back
  to `prod` or closes.
- The [boot fail-safe](prod-signing.md#the-boot-fail-safe) may boot an unverified stored head when nothing verifies.
- Group members with asset write access can change the key asset.
- The stored heads and the settings record live in your universe's MemoryStore and DataStores, which game code can
  write; prod servers re-verify everything they read there.
- **Settings rollback by replay:** game code can't forge the settings record, but it can write back an *older* signed
  copy (say, from before you revoked someone). Running servers refuse a lower seq; a server that starts meanwhile takes
  the old copy until the next write. If you suspect it, write again (`typetorch access push` gives a new seq) and check
  `typetorch settings status`.
- The settings record's tokens (fleet ingest, analytics send) are readable by any server code in your universe, as
  they were in ConfigService. They are write-only tokens; never put a read token there.
- **Cross-server messages** (`TypeTorch.messaging`): the sender tags (JobId, branch, channel) are for routing, not
  proof. Anything that can publish to your universe's MessagingService can forge them; check what a message asks for.

## Keys and tokens

| Secret | Where it lives | Never |
|---|---|---|
| Open Cloud API key(s) | an env file outside the repo (`~/.config/typetorch/<game>.env`, named by `TYPETORCH_ENV_FILE`), or the real environment | in git, in chat, in an issue, in a screenshot, given to an agent |
| Signing key files | `~/.config/typetorch/keys/<universeId>.key` and `.fallback.key` | inside any git work tree (the CLI refuses), copied to another machine you don't control |
| Fleet and analytics admin token (`TYPETORCH_FLEET_TOKEN`, the server's `TT_ANALYTICS_ADMIN_TOKEN`) | your env file and the server's env file | anywhere a game server or a client can read it |
| Ingest and send tokens (write-only) | the signed settings record's `fleet` and `analytics` fields (server only), and `TYPETORCH_FLEET_INGEST_TOKEN` | in code, in a payload, sent to a client |
| Basin R2 token (SQL reads) | your PC only | in the game's settings |
| Erasure webhook secret, fleet webhook URL, the analytics server's Open Cloud key | the analytics server's env file | in git |
| remote-claude pairing codes | your terminal and clipboard | in a commit (they expire after one use or 3 hours) |

- The CLI keeps keys and tokens in memory, gives each one only to the client for its job, never prints them, and
  redacts them from errors. Child processes (rbxtsc, rojo, lune, git) get an allowlisted environment without keys.
- Game servers get only write-only tokens. They can send analytics and fleet data, never read it.
- Prefer separate keys per job (`OPENCLOUD_ASSETS_KEY`, `OPENCLOUD_DEPLOY_KEY`, `OPENCLOUD_PLACE_KEY`), an expiry date
  and an IP allowlist. An `asset:write` key that leaks is as bad as code execution on your servers: keep `asset:write`
  on one IP-limited key.
- **Before a live game depends on it:** an offline backup of the key files and the env file, the separate
  `asset:write` key, and a dated rotation drill ([Prod signing: back up and drill](prod-signing.md#back-up-and-drill)).
- A key acts with its owner's group permissions. Give builders and contractors no Edit access on the production
  experience.
- If a key leaks: revoke it in Creator Hub at once and create a new one. If a signing key leaks:
  `typetorch keys rotate` (main) or `typetorch keys init --fallback --force` + `kernel deploy` (fallback). If a token
  leaks: put a new one in the server's env file (ingest tokens can be a comma-separated list, for rotation), then run
  `fleet setup` and write the analytics settings again.

## No GitHub Actions

TypeTorch doesn't use or ship GitHub Actions or any hosted CI: they are a common supply-chain risk, and they would need
your keys. Builds, cloud tests, signing and deploys run on your own machine.

## Never publish secrets

- `.env`, `.env.*`, `.typetorch/` and the key files stay out of git (the template's `.gitignore` covers the first
  three; key files live outside the repo). The analytics repo ignores `analytics.env` and `data/`.
- Ids (universe, place, group, user, asset) are not secrets, but keep examples and docs on fake ones.
- A quick tunnel URL is public while it runs: anything behind it must check its own tokens (the analytics server does).
- Before you push or publish a package, search the change for anything that looks like a key.

## Agents

The [agent playbook](../agents/AGENTS.md) forbids agents to create, read or store keys, publish places or deploy. If an
agent runs a deploy command anyway, the CLI only writes a proposal (it isn't an interactive terminal), but the build is
still uploaded with your key: keep keys where agents can't read them (outside the repo, not in the agent's environment).
