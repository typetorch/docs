# Security model

## Who can do what

| Who | Can |
|---|---|
| **You at your terminal** (holding the Open Cloud key and the signing key files) | build, upload, approve, sign and deploy any branch; roll back; pin; publish the kernel; rotate keys |
| **An agent, CI or the remote-claude dev-server** | build and upload, then only write a **proposal**; you approve it with `typetorch approve` (y/N). The dev-server never targets a prod-channel branch |
| **Owner / admin in game** | everything a dev can, plus kick, ban, bring, shut down servers, reload a server, roll back prod-channel servers, A/B loads on dev servers |
| **Dev in game** | the dev menu and `/tt`: read everything; on dev-channel servers also edit in the Dex, cheats, pins, branch switches, remote-claude |
| **Player** | nothing beyond your game's own network leaves, which are rate-limited, shape-limited and type-guarded |

- Dev status is decided on the server by the kernel: the experience owner, `members`, dev-badge holders, Studio; minus
  `revoked`. Every dev-menu request is re-checked on the server. Revoking takes effect within about a minute.
- **Public servers are always effective `prod`:** read-only dev menu, and (kernel 0.3) only signed builds and signed
  pins.

## What protects prod

1. **Approval:** deploys to branches your `approval` policy covers wait for your y/N at an interactive terminal.
2. **Signatures:** every prod-channel release is signed with your two Ed25519 keys; kernel 0.3 servers verify it
   ([Prod signing](prod-signing.md)). Code running inside your universe (a dev branch, `run_luau`, a free model, a
   package) can't make a prod server load anything new.
3. **Payload shape:** a payload holds only Folders and ModuleScripts under one Model, checked when it is built and again
   when a prod server mounts it; nothing in an upload runs by itself.
4. **Channels:** dev branches run only in private or reserved servers (or as signed A/B pins you approved).

What stays open, by design or for now:

- Dev-channel servers accept unsigned deploy messages: anything that can publish MessagingService messages in your
  universe can point a **dev** server at another build.
- The [boot fail-safe](prod-signing.md#the-boot-fail-safe) may boot an unverified stored head when nothing verifies.
- Group members with asset write access can change the key asset.
- The registry and the stored heads live in your universe's ConfigService, MemoryStore and DataStores, which game code
  can write; prod servers re-verify everything they read there.

## Keys

| Secret | Where it lives | Never |
|---|---|---|
| Open Cloud API key(s) | an env file outside the repo (`~/.config/typetorch/<game>.env`, named by `TYPETORCH_ENV_FILE`), or the real environment | in git, in chat, in an issue, in a screenshot, given to an agent |
| Signing key files | `~/.config/typetorch/keys/<universeId>.key` and `.fallback.key` | inside any git work tree (the CLI refuses), copied to CI |
| remote-claude pairing codes | your terminal and clipboard | in a commit (they expire after one use or 3 hours) |

- The CLI keeps keys in memory, gives each one only to the Open Cloud client for its job, never prints them, and
  redacts them from errors. Child processes (rbxtsc, rojo, lune, git) get an allowlisted environment without keys.
- Prefer separate keys per job (`OPENCLOUD_ASSETS_KEY`, `OPENCLOUD_DEPLOY_KEY`, `OPENCLOUD_PLACE_KEY`), an expiry date
  and an IP allowlist. An `asset:write` key that leaks is as bad as code execution on your servers.
- A key acts with its owner's group permissions. Give builders and contractors no Edit access on the production
  experience.
- If a key leaks: revoke it in Creator Hub at once and create a new one. If a signing key leaks:
  `typetorch keys rotate` (main) or `typetorch keys init --fallback --force` + `kernel deploy` (fallback).

## Never publish secrets

- `.env`, `.env.*`, `.typetorch/` and the key files stay out of git (the template's `.gitignore` covers the first
  three; key files live outside the repo).
- Ids (universe, place, group, user, asset) are not secrets, but keep examples and docs on fake ones.
- Before you push or publish a package, search the change for anything that looks like a key.

## Agents

The [agent playbook](../agents/AGENTS.md) forbids agents to create, read or store keys, publish places or deploy. If an
agent runs a deploy command anyway, the CLI only writes a proposal (it isn't an interactive terminal), but the build is
still uploaded with your key: keep keys where agents can't read them (outside the repo, not in the agent's environment).
