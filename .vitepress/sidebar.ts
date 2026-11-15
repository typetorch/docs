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
//
//  Each page's "## " headings are added under it automatically (withToc below),
//  collapsed; the page you're on opens. Nothing to maintain by hand.
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DefaultTheme } from "vitepress";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The heading ids, made the way GitHub does (also config.mts's markdown.anchor.slugify). */
export function githubSlug(text: string): string {
	return text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "").replace(/ /g, "-");
}

/** A heading's text as it renders: Markdown links, code, emphasis and inline HTML taken out. */
function plainHeading(raw: string): string {
	return raw
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)(.*?)\1/g, "$2")
		.replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, "$1")
		.trim();
}

/** The site path's Markdown file ("/docs" is README.md, see `rewrites` in config.mts). */
function sourceOf(link: string): string {
	return join(ROOT, link === "/docs" ? "README.md" : `${link.replace(/^\//, "")}.md`);
}

/** A page's "## " headings as sidebar links (ids deduplicated across all levels, like the rendered page). */
export function pageToc(link: string): DefaultTheme.SidebarItem[] {
	const file = sourceOf(link);
	if (!existsSync(file)) return [];
	const seen = new Map<string, number>();
	const out: DefaultTheme.SidebarItem[] = [];
	let fence: string | null = null;
	for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
		const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
		if (f) {
			if (fence === null) fence = f[1][0];
			else if (f[1][0] === fence) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (!h) continue;
		const text = plainHeading(h[2]);
		const base = githubSlug(text);
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		const slug = n === 0 ? base : `${base}-${n}`;
		if (h[1].length === 2 && text) out.push({ text, link: `${link}#${slug}` });
	}
	return out;
}

/** Puts each page's headings under it, collapsed (the current page's group opens by itself). */
function withToc(group: DefaultTheme.SidebarItem): DefaultTheme.SidebarItem {
	return {
		...group,
		items: group.items?.map((item) => {
			if (!item.link || item.items) return item;
			const toc = pageToc(item.link);
			return toc.length ? { ...item, collapsed: true, items: toc } : item;
		}),
	};
}

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
export const SIDEBAR: DefaultTheme.SidebarItem[] = [GETTING_STARTED, BUILD, DEPLOY, OPERATE, TOOLING, REFERENCE].map(withToc);
