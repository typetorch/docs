# Cross-server messages and the server list

Your game talks to its other servers through **`TypeTorch.messaging`**: global announcements, cross-server bans,
"a boss spawned" events. **`TypeTorch.servers()`** lists the game's live servers. Both are server only.

- Needs **kernel 0.3.8+** in the place and a framework after 0.3.4. A place project that maps the kernel's files one
  by one (like the template's `studio.project.json`) must map `Messaging` too. On an older kernel, `subscribe` and `publish` throw
  "needs kernel 0.3.8": keep your MessagingService code until the kernel is updated.
- `TypeTorch.features.messaging` says whether this server can reach other servers.

## Send and receive

```ts
import { Players } from "@rbxts/services";
import { TypeTorch } from "@typetorch/framework";

interface BanMessage {
	userId: number;
	reason: string;
}

// in a server module
onStart() {
	this.trove.add(
		TypeTorch.messaging.subscribe<BanMessage>("ban", (data, meta) => {
			Players.GetPlayerByUserId(data.userId)?.Kick(data.reason);
		}),
	);
}

banEverywhere(userId: number, reason: string) {
	TypeTorch.messaging.publish("ban", { userId, reason });
}
```

- **Topics** are names you choose: 1-64 characters of letters, digits and `_ - . : /` (`__` is reserved). They don't
  cost subscriptions: the kernel carries every game topic on ONE MessagingService topic, `TypeTorch/game`.
- **`subscribe`** returns a disconnect: give it to the module's trove. Every server hears its own messages too
  (`meta.self`).
- **Swaps:** the kernel subscribes once and keeps the subscription for the server's life, so a swap never subscribes
  again. Your listeners belong to the running build and go with it. A message that arrives during a swap is kept and
  handed to the new build's listeners (`meta.replayed`).
- **`publish` never yields.** The kernel queues the message and retries a failed send after 1, 3 and 9 s. It returns
  `false` when the message was dropped at once (the queue is full, the server is closing). It throws right away on a
  bad topic, data that isn't plain JSON (strings, numbers, booleans, arrays, string-keyed tables), or a message over
  the size limit, with its size.
- **The cloud test** publishes nothing, so you don't need a `TypeTorchTest` guard around `publish`.
- **Studio** never touches MessagingService: messages loop back to the session, so you can test a listener alone.

## Who hears what

Every message carries its sender's tags in `meta`: `jobId`, `branch`, `channel` (`prod` or `dev`), `serverType`,
`placeVersion`, `sentAt` (unix seconds) and `self`.

By default a listener hears **prod-channel servers and servers on its own branch**. A dev branch's test of a ban or an
announcement never reaches prod, and a dev server still hears prod.

```ts
TypeTorch.messaging.subscribe("chat", handler, { from: "all" }); // every server, dev branches too
TypeTorch.messaging.subscribe("chat", handler, { from: "prod" }); // prod-channel servers only
TypeTorch.messaging.subscribe("chat", handler, { from: "branch" }); // this branch only
TypeTorch.messaging.publish("event", data, { to: "branch" }); // only servers on the sender's branch hear it
TypeTorch.messaging.publish("event", data, { to: "prod" }); // only prod-channel servers hear it
```

The tags are for routing, not proof: anything that can publish to your universe's MessagingService can forge them.
Don't let a message grant anything a player couldn't already get.

## Limits

Roblox's [MessagingService limits](https://create.roblox.com/docs/reference/engine/classes/MessagingService) (checked
2026-10-06):

| Limit | Value |
|---|---|
| Message size | 1 KiB (1,024 characters) |
| Publishes per server | 600 + 240 × players a minute |
| Receives per topic, whole game | 40 + 80 × servers a minute |
| Receives, whole game | 400 + 200 × servers a minute |
| Subscriptions per server | 20 + 8 × players |
| Subscribe requests per server | 240 a minute |

What this means for you:

- **Size:** the kernel counts your message the way Roblox does: the whole envelope, JSON-escaped. About 850 bytes of
  your data fit. Send ids, not whole objects.
- **Rate: the per-topic receive limit is the one that bites.** One message to every server counts once per server, so
  the whole game can send only about **80 messages a minute on one topic**, however many servers it has. All your game
  topics share `TypeTorch/game`, so keep them to a few a minute in total. Near 60 a minute the kernels hold publishes
  back together and send them a little later (`TypeTorch.messaging.status()`: `rate`, `throttled`, `queued`); a message
  that waits more than 30 s is dropped. Fast data (a leaderboard every second) belongs in a MemoryStore.
- **Per server,** the kernel sends at most 150 + 60 × players a minute (a quarter of Roblox's limit, leaving room for
  deploys and roll calls).

`TypeTorch.messaging.status()` returns the kernel's counters: `state`, `received`, `delivered`, `published`, `failed`,
`dropped`, `throttled`, `queued`, `rate`. The dev menu warns "Messaging busy" or "Messages dropped" (Server > Status).

## TypeTorch's own topics

| Who | Topic | When |
|---|---|---|
| kernel | `TypeTorch/deploy`, `TypeTorch/pin`, `TypeTorch/rekey` | every server, always |
| kernel 0.3.6+ peers | `TypeTorch/peers/<JobId>` | about 3 s, only while a server asks other servers for a build |
| kernel 0.3.8 | `TypeTorch/game` | from the first `subscribe`, for the server's life |
| kernel 0.3.8 | `TypeTorch/rollcall` | from the first build that runs, for the server's life (the server list) |
| framework roll call | one reply topic | about 3 s, while this server collects a server list |
| remote-claude | 2 | dev-channel servers only |

So a server uses 5, briefly 7, of the 20 an empty server allows. Your own `SubscribeAsync` calls come on top: moving
them to `TypeTorch.messaging` frees them (and their re-subscribe on every swap).

## The server list

```ts
const servers = TypeTorch.servers(); // GameServer[]
for (const server of servers) {
	print(server.jobId, server.players, server.maxPlayers, server.branch, server.uptime, server.info?.region);
}
TypeTorch.setServerInfo({ region: "eu", mode: "ranked" }); // this server's public fields, in every server's list
```

- Each row: `jobId`, `placeVersion`, `players`, `maxPlayers`, `serverType` (`public`, `private`, `reserved`, `studio`),
  `branch`, `channel`, `uptime` (seconds), `here` (this server) and `info` (its `setServerInfo` fields).
- By default: prod-channel servers and servers on this server's branch. `{ includeDev: true }` lists every server;
  `{ includeSelf: false }` leaves this one out.
- It is a roll call over MessagingService, the same one the dev menu's Manage > Servers uses: no MemoryStore, no
  storage. **It yields** up to about 3 s when it asks; then the list is cached for 3 s per server in the game (at least
  30 s, at most 10 minutes), so the whole game asks about 20 times a minute at most. Callers in the meantime get the
  cached list at once. Fine for games of up to a few hundred servers; a bigger game wants its own MemoryStore registry.
- **`setServerInfo`** takes plain JSON, at most 400 bytes, kept across swaps; `undefined` clears it. Everyone's
  `servers()` sees it, so never put a secret, an access code or a player's private data there.
- Rows never carry a reserved server's access code. To send players to another server, use the `jobId` with
  `TeleportService:TeleportToPlaceInstance`.
- The cloud test and Studio list only this server.

## Moving from MessagingService

1. Find your topics: `git grep -nE "SubscribeAsync|PublishAsync" -- src`.
2. Replace each `MessagingService.SubscribeAsync(topic, (message) => ...)` with
   `this.trove.add(TypeTorch.messaging.subscribe(topic, (data, meta) => ...))`. `data` is your message itself (no
   `message.Data`), and `meta.sentAt` replaces `message.Sent`.
3. Replace `MessagingService.PublishAsync(topic, data)` with `TypeTorch.messaging.publish(topic, data)`. Drop your
   retry loops, `pcall`s and `TypeTorchTest` guards around it: the kernel queues, retries and skips the cloud test.
4. Messages don't cross between a raw MessagingService topic and `TypeTorch.messaging`: switch the publishers and the
   listeners of one topic in the same build.
5. A topic that needs every server, dev branches included, takes `{ from: "all" }`.
