# Settings

Kernel 0.3.8 reads your game's live settings from **one signed record**: who is a dev, where the fleet API is, where
analytics go, and your own live values (flags, kill switches, prices). You change it with the CLI; running servers
apply a change within seconds, with no deploy and no place publish.

- It lives in the game's DataStore `TypeTorch`, key `settings`.
- The CLI signs it with your **two prod signing keys** ([Prod signing](prod-signing.md)). Game code can write
  DataStores but can't sign, and servers refuse a record that doesn't verify. So a free model or a dev branch can't
  make itself a dev or point your servers somewhere else.
- **Server only.** It holds tokens; nothing in it reaches clients.
- It replaces every ConfigService key TypeTorch used before (`TypeTorch`, `TypeTorchAccess`, `TypeTorchFleet`,
  `TypeTorchAnalytics`). Kernel 0.3.8 reads no ConfigService keys, and the API key needs no `universe:write`.

## What it holds

| Field | What | Written by |
|---|---|---|
| `access` | `members`, `revoked`, `devBadgeId` from `typetorch.json` ([who gets the dev menu](../getting-started/fresh-setup.md#11-the-dev-menu-and-who-gets-it)) | `typetorch access push` |
| `defaultBranch`, `channels` | from `typetorch.json` | `typetorch settings push` |
| `fleet` | `{ url, token }`: the [fleet API](fleet-and-alerts.md) and its write-only ingest token | `typetorch backend setup` |
| `backend` | `{ url, key, analytics? }`: the TypeTorch backend and its game key (CLI 0.9; kernels before 0.4 read the `fleet` and `analytics` sections it derives) | `typetorch backend setup` |
| `analytics` | the [analytics sink settings](analytics.md#settings-the-analytics-field), derived from `backend` | `typetorch backend setup` |
| `game` | your own live values, read with `TypeTorch.liveConfig` | `typetorch settings set game.<key>` |

The whole record is at most 32 KB, `game` at most 16 KB.

## Commands

From the game folder:

```sh
bun run typetorch settings status                  # seq, age, whether your keys signed it, the fields (tokens hidden)
bun run typetorch settings get game.shop.price     # one field as JSON; `get` alone prints all of them
bun run typetorch settings set game.shop.price 75  # change one game value
bun run typetorch settings set game.event '{"name":"halloween","ends":1793000000}'
bun run typetorch settings unset game.event
bun run typetorch settings push                    # defaultBranch, channels and access from typetorch.json
bun run typetorch access push                      # access only
bun run typetorch backend setup --url https://fleet.example.com
```

Every write reads the record, checks that your keys signed it, changes one field, raises `seq` by one, signs it with
both keys and writes it back (if another machine wrote in between, it starts over on the newer record). Then it pings
the servers.

- `--dry-run` shows the result without writing.
- `--no-ping`: servers still pick it up within about a minute.
- `--force` replaces a record your keys didn't sign (you lost both keys, or game code wrote junk). Its old fields are
  dropped, never re-signed, so write them again afterwards.
- Every write needs both signing key files (else: "run `typetorch keys init`") and the deploy key's DataStore scopes
  (`universe-datastores.objects:read`, `:create`, `:update`) plus `universe-messaging-service:publish` for the ping.
- `typetorch keys rotate` and `keys resign` re-sign the record with the new keys.
- `typetorch doctor` reads it and checks the signature.

## Live values in game code

```ts
import { t } from "@rbxts/t";
import { TypeTorch } from "@typetorch/framework";

// in a server module
private readonly price = TypeTorch.liveConfig("shop.price", {
	default: 50,
	parse: (raw) => (t.number(raw) && raw >= 0 ? raw : error("not a price")),
});

onStart() {
	this.reprice(this.price.get());
	this.trove.add(this.price.onChanged((value, previous) => this.reprice(value)));
}
```

- `get()` is cheap: call it whenever you need the value.
- `onChanged` fires only when this key's value really changes; it returns a disconnect for the trove.
- The default is used when there is no record or no such key, on kernels before 0.3.8 (with one warning), or when
  `parse` throws (with one warning per bad value).
- Values are JSON. Keys are 1-64 characters of letters, digits and `_ . : / -`.
- **Server only.** A client needs a value? Send it through your own network.
- `TypeTorch.settings()` returns the whole verified record (server only; it holds tokens: never send it to a client).

## How servers read it

- **At boot**, alongside the other boot reads; it never holds up the 15 s boot budget.
- **About every minute**, and **within seconds of a ping** from the CLI.
- A server keeps the **last good copy**. It refuses a record that isn't signed, doesn't verify, is malformed, or has a
  lower `seq` than the one it holds, and says why.
- Which signature counts: once the server loaded your key asset, only `sig` (the main key); before that, only `sigF`
  (the fallback key). The same rule as prod deploys.
- **No record yet:** servers use the defaults: `defaultBranch` prod, only the experience owner is a dev, no fleet API,
  no analytics sending.

## Check it in game

The dev menu's **Server > Status** shows "Settings #12, 3m old (sig)". Attention lists:

| Item | Meaning |
|---|---|
| No settings | there is no record: `typetorch settings push` |
| Settings refused | the record isn't signed or doesn't verify, and the server has no good copy |
| Settings unreadable | the DataStore read fails |
| Settings copy refused | a newer read was refused while a good copy is kept (game code wrote it, or an old copy was put back) |

## Moving from ConfigService (kernel 0.3.8)

Kernel 0.3.8 doesn't read the old ConfigService keys, and they can't be read back to copy them. After the place runs
kernel 0.3.8:

1. `bun run typetorch settings push` (defaultBranch, channels, dev access).
2. `bun run typetorch backend setup --url <your fleet API>` if you use one (or `bun run local` in the analytics folder for
   a local test: it runs `backend setup` for you).
3. `bun run typetorch access push`: the owners also go to the backend (only they may Sign in with Roblox there).
4. `bun run typetorch settings status` to check. Then delete the old keys in Creator Hub (Configs) if you like.

Until step 1, only the experience owner is a dev on 0.3.8 servers.
