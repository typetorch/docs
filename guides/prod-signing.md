# Prod signing

**Goal:** nothing that runs inside your game (a dev branch, a free model, a Claude `run_luau`, a bad package) can make a
prod server load code. Only builds you approved on your own PC can.

- Releases to **prod-channel** branches (deploys, rollbacks, promotes, re-signs) and pins to them are signed with
  Ed25519, automatically, when they are published.
- Dev-channel releases are never signed: dev servers stay fast and open.
- **Kernel 0.3** checks the signatures on every prod-effective server: public servers, and private or reserved servers
  on a prod branch.

## The two keys

| | Main key (**Root Key** in the dev menu) | **Fallback Key** |
|---|---|---|
| Key file (plaintext, outside every repo) | `~/.config/typetorch/keys/<universeId>.key` | `~/.config/typetorch/keys/<universeId>.fallback.key` |
| Other path | `--key-file`, or `TYPETORCH_KEY_FILE` | `--fallback-key-file`, or `TYPETORCH_FALLBACK_KEY_FILE` |
| Public key in `typetorch.json` | `signingPublicKeys` (+ `keyAssetId`, `revokedKeys`) | `fallbackPublicKey` |
| Where servers get the public key | the **key asset**: a group-owned Model with `PublicKeys` and `RevokedKeys` attributes | baked into the place as `FallbackPublicKey` |
| Signature field | `sig` | `sigF` |
| Replace it | `typetorch keys rotate` (no restart) | `typetorch keys init --fallback --force`, then `typetorch kernel deploy` (restart) |

- The key-path variables are read from the real environment only, never from an env file.
- No command prints a private key. A key file inside a git work tree is refused.
- **Back up both files** ([how](#back-up-and-drill)). Losing the main key costs a rotate; losing the fallback key
  costs a kernel deploy.

### The rule servers follow (strict)

- Once the **key asset** has loaded on a server, only `sig` counts, checked against `PublicKeys` minus `RevokedKeys`.
- Until it has loaded (for example Roblox can't serve it at boot), only `sigF` counts, against the baked
  `FallbackPublicKey`.
- Never "either one". That's why `keys rotate` re-signs the live heads.

Servers read the key asset at boot, on a `TypeTorch/rekey` hint (sent by `keys rotate`), every 10 minutes, and once
after a failed signature.

## Set up (once per game)

The order matters. Run these yourself (they need your Open Cloud key):

```sh
bun run typetorch keys init
bun run typetorch keys init --fallback
git add typetorch.json
git commit -m "Prod signing keys"
bun run typetorch kernel deploy --replace-place --yes
bun run typetorch doctor
```

1. `keys init`: the main pair and the key asset (created through Open Cloud with the assets key). It resumes a
   half-finished run.
2. `keys init --fallback`: the fallback pair (no network).
3. Commit `typetorch.json`: the public keys and `keyAssetId` are not secret.
4. `kernel deploy` stamps three attributes on `ServerScriptService.TypeTorchKernel`: `KeyAssetId`,
   `FallbackPublicKey` and `BootstrapHeads`. It refuses to publish without the keys. For a place with Studio content,
   install the kernel [in Studio](../getting-started/migrate.md#9-install-the-kernel-in-your-place) instead.
5. `doctor` checks both key files against `typetorch.json`, the key asset (Approved, owned by `creator`, same keys) and
   the place (the stamped `KeyAssetId` and `FallbackPublicKey`, read with a Luau Execution task).

Then move players to servers on the new kernel (dev menu > Migrate, or restart servers).

**Check:** on a public server, the dev menu's **Artifact > Signing** shows mode "Root Key", the fingerprints you expect
(the first 8 hex of each key's SHA-256), no "Changed" line and Rejected 0. The running build has two verified badges.

## Day to day

Nothing changes: `bun run typetorch deploy` on `main` builds, uploads, asks y/N, then signs with both keys and
publishes. The key files are checked before the upload, so a missing key fails early. Dry runs never make a real
signature.

## Rotate or replace a key

| Situation | Do |
|---|---|
| Main key lost or leaked | `bun run typetorch keys rotate`: a new main pair; the key asset trusts only the new key and revokes the old one; servers are told to re-read it; then every prod branch's live head is **re-signed** (same build, new `#seq`, `r = "resign"`; servers move the head without a swap). No restart |
| A re-sign failed or was rejected | `bun run typetorch keys resign` |
| Fallback key leaked or lost | `bun run typetorch keys init --fallback --force` (revokes the old one in the key asset first), then `bun run typetorch kernel deploy` |

## Back up and drill

Do these once, before players depend on the game. Losing both key files means a kernel deploy (a place publish and a
restart) before prod takes a deploy again. Losing the `.env` means new Open Cloud keys.

1. **An offline backup.** Copy every file in `~/.config/typetorch/keys/` and the game repo's `.env` to something offline: an encrypted USB stick, or a password manager's secure
   notes. Not a synced cloud folder, not a repo, never a chat. Update it after every `keys rotate` and
   `keys init --fallback --force`.
2. **A second Open Cloud key for uploads.** Any key with `asset:write` in your group can change the key asset (the
   trusted signing keys) and upload builds. Give that to one key only:
   - a new key with the assets job's scopes (`asset:read`, `asset:write`, Luau Execution read and write), limited to
     your IP address in Creator Hub (update it when your IP changes), in the game repo's `.env` as `OPENCLOUD_ASSETS_KEY`;
   - remove `asset:write` from the shared key (`OPENCLOUD_API_KEY`); it keeps the rest (messaging, DataStores, place
     publishing);
   - `bun run typetorch doctor --show-ok`: `key assets` names `OPENCLOUD_ASSETS_KEY`, and every scope probe is `ok`.
3. **A dated rotation drill.** Put it in your calendar: once before go-live, then every 3 months, and the day anyone
   with access to your keys leaves. On that date, in a quiet hour:
   1. `bun run typetorch keys rotate`;
   2. on a public server, **Artifact > Signing** shows the new Root Key fingerprint, the build still has two verified
      badges, and no swap happened (the live head was re-signed);
   3. deploy once: servers take it;
   4. back up the new key file (step 1) and write down the date.

## Bootstrap heads

Builds deployed before signing existed have no signature. So `kernel deploy` stamps `BootstrapHeads`: the current prod
heads (`{"prod":{"a":<assetId>,"s":<seq>,"i":"<artifact id>"}}`), from the registry and your local deployment log. A
prod server trusts exactly those, unsigned; anything newer must be signed.

Run `kernel deploy` from the machine that has the latest deployment log (or with a readable registry). A prod deploy
made elsewhere is missing from `BootstrapHeads` and is refused until the next signed deploy.

## The boot fail-safe

"Never boot an empty game." When a prod server starts and nothing verifies (no signed head, no bootstrap head), it
boots the other stored heads **without verifying**, newest first, as long as each is a prod-channel payload of only
Folders and ModuleScripts. Such a server is flagged:

- `status().unverified`, a warning in the log, "UNVERIFIED boot (fail-safe)" in `/tt status`;
- the dev menu's Attention shows "Booted an unverified prod head" (red badge) and the build has no verified badge.

It is **only for the first boot**. Live deploy messages, the 60 s poll, pins, `/tt rollback` and reloads stay strictly
verified. The next signed deploy for the same build clears the flag without a swap; any other signed deploy replaces it.

If nothing loads at all, the server stays empty and shows "No trusted prod head"; the next signed deploy boots it.

**Accepted risk:** a server that boots while no trusted head exists can be steered by whoever can write the stored heads
(code running in your universe), within the limits above.

## Pins on prod

Prod servers take only signed pins: use `bun run typetorch pin ...` ([pins](deploy-and-rollback.md#pins-ab-experiments)).
The dev menu shows "Use the CLI: typetorch pin" there.

## What stays open

- Dev-channel servers accept unsigned messages by design.
- Anyone with asset write access in your group (including an upload key) can change the key asset. Keep keys scoped.
- Experiment pins sent from the dev menu are unsigned and work only on dev servers.

The message format is in the [CLI README](https://github.com/typetorch/cli#deploy-message).
