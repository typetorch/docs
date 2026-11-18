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
//  folded: clicking a page opens its headings (the page you're on is always open),
//  and its arrow folds or unfolds them. Nothing to maintain by hand.
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

/**
 * A heading's text the way VitePress's anchor plugin reads it (the text and code spans; inline HTML, link targets and
 * emphasis markers left out; entities such as "&amp;" stay as written, as they do in the rendered id). Code span
 * contents and backslash-escaped characters are kept as written.
 */
function plainHeading(raw: string): string {
	const kept: string[] = [];
	const keep = (text: string) => `\u0000${kept.push(text) - 1}\u0000`;
	return raw
		.replace(/\\([!-/:-@[-`{-~])/g, (_m, char: string) => keep(char))
		.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_m, _ticks: string, body: string) =>
			keep(body.length > 1 && body.startsWith(" ") && body.endsWith(" ") && body.trim() ? body.slice(1, -1) : body),
		)
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>|<!--[\s\S]*?-->/g, "")
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)(.*?)\1/g, "$2")
		.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)])
		.trim();
}

/** Sidebar texts are rendered with v-html: show the heading's characters (entities included), never markup. */
function escapeHtml(text: string): string {
	return text
		.replace(/&(?!#x[0-9a-f]+;|#\d+;|[a-z][a-z0-9]*;)/gi, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\s+/g, " ");
}

/** The site path's Markdown file ("/docs" is README.md, see `rewrites` in config.mts). */
function sourceOf(link: string): string {
	return join(ROOT, link === "/docs" ? "README.md" : `${link.replace(/^\//, "")}.md`);
}

/** A plain paragraph line (one a setext underline can turn into a heading). */
function isParagraphLine(line: string): boolean {
	return !!line.trim() && !/^\s{0,3}([>#|<]|[-*+]\s|\d+[.)]\s|(`{3,}|~{3,}))/.test(line) && !/^ {4}|^\t/.test(line);
}

/**
 * A page's "## " headings as sidebar links. The ids are made like the rendered page's: every heading level counts,
 * repeats get "-1", "-2" (markdown-it-anchor's uniqueSlug), `{#id}` attributes win; headings in front matter and in
 * fenced code blocks (``` or ~~~, any length) are skipped; setext headings (a line, then === or ---) count.
 */
export function pageToc(link: string): DefaultTheme.SidebarItem[] {
	const file = sourceOf(link);
	return existsSync(file) ? tocOf(readFileSync(file, "utf8"), link) : [];
}

/** The "## " headings of a Markdown text as links under `link` (see pageToc). */
export function tocOf(markdown: string, link: string): DefaultTheme.SidebarItem[] {
	const used = new Set<string>();
	const out: DefaultTheme.SidebarItem[] = [];
	const add = (level: number, raw: string) => {
		let id: string | undefined;
		const attrs = /\s*\{([^{}]*)\}\s*$/.exec(raw);
		if (attrs && /(^|\s)#[^\s#]/.test(attrs[1])) {
			id = /(?:^|\s)#([^\s}]+)/.exec(attrs[1])![1];
			raw = raw.slice(0, attrs.index);
		}
		const text = plainHeading(raw);
		let slug = id ?? githubSlug(text);
		if (!id) for (let i = 1, base = slug; used.has(slug); i++) slug = `${base}-${i}`;
		used.add(slug);
		if (level === 2 && text) out.push({ text: escapeHtml(text), link: `${link}#${encodeURI(slug)}` });
	};
	const lines = markdown.split(/\r?\n/);
	let start = 0;
	if (lines[0] === "---") {
		const end = lines.indexOf("---", 1);
		if (end > 0) start = end + 1;
	}
	let fence: { char: string; size: number } | null = null;
	let para: string[] = [];
	for (let i = start; i < lines.length; i++) {
		const line = lines[i];
		if (fence) {
			const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
			if (close && close[1][0] === fence.char && close[1].length >= fence.size) fence = null;
			continue;
		}
		const open = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
			fence = { char: open[1][0], size: open[1].length };
			para = [];
			continue;
		}
		const setext = /^\s{0,3}(=+|-+)\s*$/.exec(line);
		if (setext && para.length && isParagraphLine(para[0])) {
			add(setext[1][0] === "=" ? 1 : 2, para.map((l) => l.trim()).join(" "));
			para = [];
			continue;
		}
		const h = /^\s{0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
		if (h) {
			add(h[1].length, (h[2] ?? "").replace(/^#+$/, ""));
			para = [];
			continue;
		}
		if (!line.trim()) para = [];
		else if (para.length || !/^ {4}|^\t/.test(line)) para.push(line);
	}
	return out;
}

/** Puts each page's headings under it, folded until the page is opened (VitePress unfolds the active page). */
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
		{ text: "Is TypeTorch for me?", link: "/getting-started/is-it-for-me" },
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
		{ text: "Emergency scale-ups", link: "/guides/emergency-scale-ups" },
		{ text: "API keys", link: "/guides/api-keys" },
		{ text: "Security", link: "/guides/security" },
		{ text: "Troubleshooting", link: "/guides/troubleshooting" },
	],
};

export const MOBILE: DefaultTheme.SidebarItem = {
	text: "Mobile app",
	items: [
		{ text: "The mobile app", link: "/guides/mobile-app" },
		{ text: "Widgets", link: "/guides/mobile-widgets" },
		{ text: "Notifications", link: "/guides/mobile-notifications" },
		{ text: "For maintainers", link: "/guides/mobile-maintainers" },
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
export const SIDEBAR: DefaultTheme.SidebarItem[] = [GETTING_STARTED, BUILD, DEPLOY, OPERATE, MOBILE, TOOLING, REFERENCE].map(withToc);
