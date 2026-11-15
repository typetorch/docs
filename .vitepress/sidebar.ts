// ============================================================================
//  THE SIDEBAR. This is the one place that lists the docs pages and their order.
//
//  To add a page: put the Markdown file in the repo (e.g. guides/my-guide.md),
//  then add { text: "My guide", link: "/guides/my-guide" } to the right group
//  below. Links are site paths: no ".md", leading "/". README.md is served as
//  "/docs" (see `rewrites` in config.mts).
//
//  A page that isn't listed here still builds and is reachable by its links
//  and by search; it just has no sidebar entry.
//
//  Reference pages are generated: `bun run sync:reference` writes
//  reference/<pkg>.md from each package README (scripts/sync-reference.ts).
//  Keep REFERENCE in step with PACKAGES in that script. dash is private: it
//  never gets a reference page.
// ============================================================================

import type { DefaultTheme } from "vitepress";

export const GETTING_STARTED: DefaultTheme.SidebarItem = {
	text: "Getting started",
	items: [
		{ text: "Overview", link: "/docs" },
		{ text: "Fresh setup", link: "/getting-started/fresh-setup" },
		{ text: "Migrate an existing game", link: "/getting-started/migrate" },
		{ text: "Coming from Flamework", link: "/guides/from-flamework" },
		{ text: "Go-live checklist", link: "/guides/go-live-checklist" },
	],
};

export const BUILD: DefaultTheme.SidebarItem = {
	text: "Build your game",
	items: [
		{ text: "Runtime API", link: "/guides/runtime-api" },
		{ text: "State", link: "/guides/state" },
		{ text: "Networking", link: "/guides/networking" },
		{ text: "Cross-server messaging", link: "/guides/messaging" },
		{ text: "Player data", link: "/guides/player-data" },
		{ text: "Loading screen", link: "/guides/loading-screen" },
		{ text: "Hot assets", link: "/guides/hot-assets" },
		{ text: "Dev menu", link: "/guides/dev-menu" },
		{ text: "Player feedback", link: "/guides/feedback" },
	],
};

export const DEPLOY: DefaultTheme.SidebarItem = {
	text: "Deploy",
	items: [
		{ text: "Deploy and rollback", link: "/guides/deploy-and-rollback" },
		{ text: "Branches and channels", link: "/guides/branches-and-channels" },
		{ text: "Prod signing", link: "/guides/prod-signing" },
		{ text: "Settings", link: "/guides/settings" },
	],
};

export const OPERATE: DefaultTheme.SidebarItem = {
	text: "Operate",
	items: [
		{ text: "Live servers and alerts", link: "/guides/fleet-and-alerts" },
		{ text: "Live debug", link: "/guides/live-debug" },
		{ text: "The explorer", link: "/guides/explorer" },
		{ text: "Analytics", link: "/guides/analytics" },
		{ text: "Recordings and maps", link: "/guides/recordings-and-maps" },
		{ text: "Live events", link: "/guides/live-events" },
		{ text: "Notifications", link: "/guides/notifications" },
		{ text: "Running the backend", link: "/guides/backend-operations" },
		{ text: "API keys", link: "/guides/api-keys" },
		{ text: "Security", link: "/guides/security" },
		{ text: "Troubleshooting", link: "/guides/troubleshooting" },
	],
};

export const TOOLING: DefaultTheme.SidebarItem = {
	text: "Tooling",
	items: [
		{ text: "Studio testing", link: "/guides/studio-testing" },
		{ text: "Remote Claude", link: "/guides/remote-claude" },
		{ text: "Agent playbook", link: "/agents/AGENTS" },
		{ text: "Agent skill", link: "/agents/skills/typetorch-migrate/SKILL" },
	],
};

export const REFERENCE: DefaultTheme.SidebarItem = {
	text: "Reference",
	items: [
		{ text: "CLI", link: "/reference/cli" },
		{ text: "Framework", link: "/reference/framework" },
		{ text: "Kernel", link: "/reference/kernel" },
		{ text: "Transformer", link: "/reference/transformer" },
		{ text: "Dev server", link: "/reference/dev-server" },
		{ text: "Studio plugin", link: "/reference/studio-plugin" },
		{ text: "Backend", link: "/reference/backend" },
	],
};

/** Every group, in order. One sidebar for the whole site. */
export const SIDEBAR: DefaultTheme.SidebarItem[] = [GETTING_STARTED, BUILD, DEPLOY, OPERATE, TOOLING, REFERENCE];
