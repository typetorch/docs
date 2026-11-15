# Is TypeTorch for me?

TypeTorch is built by agents, for agents: you describe what you want, and an AI coding agent (Claude Code, Codex,
Cursor and others) writes the roblox-ts code, runs the CLI and follows these docs. Find yourself below.

| You are... | TypeTorch? | Why |
|---|---|---|
| A developer comfortable with git, who knows what a branch is | **Yes, you'll love it** | Every build hot-swaps live servers in seconds, `dev` and `feature-x` branches run in the real game, bad builds roll back on their own. This is who it's made for. |
| A non-technical creator | **Yes** | TypeTorch is agents-first. Your agent does the setup and the code; you approve the steps only you can do (Roblox keys, publishing, prod deploys). Start with the [agent playbook](../agents/AGENTS.md). |
| Starting a new game, or one that hasn't launched yet | **Yes** | The easiest way in: [fresh setup](fresh-setup.md) (`bunx @typetorch/cli init`) gives you a working game with live updates from day one. |
| Writing every line of code by hand | **No** | TypeTorch is by agents, for agents. Its conventions (swap-safe modules, troves, guarded networking) and its docs are written for agents to follow. By hand it's a lot of rules to keep in your head. |
| Only after analytics | **Probably not** | The whole toolchain is a lot to adopt for one feature. Let your agent fork the analytics instead: the engine is in [`@typetorch/framework`](https://github.com/typetorch/framework/tree/main/src/analytics) and the server and explorer are in [typetorch/backend](https://github.com/typetorch/backend). Or try the [live demo](https://demo.typetorch.dev) first. |
| A Luau-first developer | **Maybe** | The framework is TypeScript (roblox-ts), and the docs assume it. The kernel that loads and swaps builds is plain Luau, so an agent can find its way around: fork the framework and drive the kernel from Luau. That path is not supported. |
| Adding live updates to a game that's already out | **Not unless you're technical** | Moving a live game is real work: every module has to become stoppable and restartable, and players' data must survive the move. It's doable ([migrate](migrate.md), then the [go-live checklist](../guides/go-live-checklist.md)), but if you're not technical, use TypeTorch for your next game instead. |

## Next

- New game: [Fresh setup](fresh-setup.md).
- Existing roblox-ts game: [Migrate an existing game](migrate.md).
- Using an agent: point it at [llms.txt](https://www.typetorch.dev/llms.txt) or the [agent playbook](../agents/AGENTS.md).
- Just looking: the [live demo](https://demo.typetorch.dev) of the backend explorer, with anonymized sample data.
