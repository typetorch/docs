// Agent-first and SEO helpers, used by config.mts at build time.
//
//   - Every page is also served as Markdown: /guides/analytics.md next to /guides/analytics (the worker also answers
//     `Accept: text/markdown` on the HTML path). The files mirror the repo layout, so relative links keep working.
//   - /llms.txt (llmstxt.org): the hand-written llms.txt from the repo root, with its page links pointed at the .md
//     files; /llms-full.txt: every page in sidebar order in one file.
//   - Per-page <meta name="description"> from the page's first paragraph, Open Graph / Twitter tags, JSON-LD
//     (WebSite + SoftwareApplication on the home page, TechArticle + BreadcrumbList on the others),
//     <link rel="alternate" type="text/markdown">, and a sitemap with git dates and priorities.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DefaultTheme, HeadConfig, PageData } from "vitepress";

export const SITE_URL = "https://www.typetorch.dev";

/** The site route of a source file: "guides/analytics.md" -> "guides/analytics", README.md -> "docs", index.md -> "". */
export function routeOf(relativePath: string): string {
	return relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "").replace(/\/$/, "");
}

/** The served Markdown file of a route: "" -> "index.md" (the home page answers with llms.txt instead). */
export function markdownPathOf(route: string): string {
	return route === "" ? "llms.txt" : `${route}.md`;
}

// ---------------------------------------------------------------------------------------------------------------
// Descriptions

function stripMarkdown(text: string): string {
	return text
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)(.*?)\1/g, "$2")
		.replace(/\s+/g, " ")
		.trim();
}

/** The first real paragraph of a Markdown file (no headings, images, tables, quotes, lists, code), ~160 chars. */
export function firstParagraph(markdown: string, max = 160): string {
	const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
	let fence = false;
	const paras: string[] = [];
	let cur: string[] = [];
	for (const line of body.split(/\r?\n/)) {
		if (/^\s{0,3}(```|~~~)/.test(line)) {
			fence = !fence;
			continue;
		}
		if (fence) continue;
		if (!line.trim()) {
			if (cur.length) paras.push(cur.join(" "));
			cur = [];
			continue;
		}
		if (/^\s*(#|>|\||!\[|<img|<p|<\/|<div|[-*+] |\d+\. )/.test(line)) {
			if (cur.length) paras.push(cur.join(" "));
			cur = [];
			continue;
		}
		cur.push(line.trim());
	}
	if (cur.length) paras.push(cur.join(" "));
	const text = paras.map(stripMarkdown).find((p) => p.length >= 40) ?? "";
	if (text.length <= max) return text;
	const cut = text.slice(0, max - 1);
	return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

// ---------------------------------------------------------------------------------------------------------------
// Git dates (sitemap lastmod, article dates)

const gitDates = new Map<string, { created: string; modified: string }>();
export function gitDatesOf(root: string, relativePath: string): { created: string; modified: string } | null {
	const hit = gitDates.get(relativePath);
	if (hit) return hit;
	try {
		const out = execFileSync("git", ["log", "--follow", "--format=%cI", "--", relativePath], { cwd: root, encoding: "utf8", timeout: 10_000 })
			.trim()
			.split("\n")
			.filter(Boolean);
		if (!out.length) return null;
		const value = { created: out[out.length - 1], modified: out[0] };
		gitDates.set(relativePath, value);
		return value;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Sidebar order and breadcrumbs

export interface SidebarEntry {
	route: string;
	text: string;
	group: string;
}

/** The sidebar's pages in order (headings under a page are skipped). */
export function sidebarPages(sidebar: DefaultTheme.SidebarItem[]): SidebarEntry[] {
	const out: SidebarEntry[] = [];
	for (const group of sidebar) {
		for (const item of group.items ?? []) {
			if (item.link && !item.link.includes("#")) out.push({ route: item.link.replace(/^\//, ""), text: item.text ?? "", group: group.text ?? "" });
		}
	}
	return out;
}

// ---------------------------------------------------------------------------------------------------------------
// <head>

export interface HeadInput {
	pageData: PageData;
	title: string;
	description: string;
	siteTitle: string;
	siteDescription: string;
	root: string;
	sidebar: SidebarEntry[];
}

export function pageHead({ pageData, title, description, siteTitle, siteDescription, root, sidebar }: HeadInput): HeadConfig[] {
	const route = routeOf(pageData.relativePath);
	const url = `${SITE_URL}/${route}`;
	const desc = description || siteDescription;
	const isHome = route === "";
	const is404 = pageData.relativePath === "404.md" || pageData.isNotFound;
	const head: HeadConfig[] = [
		["link", { rel: "canonical", href: url }],
		["meta", { property: "og:title", content: title }],
		["meta", { property: "og:description", content: desc }],
		["meta", { property: "og:url", content: url }],
		["meta", { property: "og:type", content: isHome ? "website" : "article" }],
		["meta", { name: "twitter:title", content: title }],
		["meta", { name: "twitter:description", content: desc }],
	];
	if (is404) {
		head.push(["meta", { name: "robots", content: "noindex" }]);
		return head;
	}
	// The Markdown twin of this page, for agents.
	head.push(["link", { rel: "alternate", type: "text/markdown", href: `/${markdownPathOf(route)}`, title: "This page as Markdown" }]);
	head.push(["link", { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "llms.txt" }]);

	const dates = gitDatesOf(root, pageData.filePath);
	if (dates && !isHome) {
		head.push(["meta", { property: "article:published_time", content: dates.created }]);
		head.push(["meta", { property: "article:modified_time", content: dates.modified }]);
	}

	const graph: object[] = [];
	if (isHome) {
		graph.push(
			{ "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: siteTitle, description: siteDescription, inLanguage: "en" },
			{
				"@type": "SoftwareApplication",
				"@id": `${SITE_URL}/#software`,
				name: "TypeTorch",
				description:
					"A roblox-ts framework and toolchain that updates live Roblox games without restarting their servers: a Luau kernel hot-swaps each build on every live server while players stay.",
				applicationCategory: "DeveloperApplication",
				operatingSystem: "Roblox, Windows, macOS, Linux",
				url: `${SITE_URL}/`,
				image: `${SITE_URL}/og.png`,
				license: "https://opensource.org/licenses/MIT",
				isAccessibleForFree: true,
				offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
				codeRepository: "https://github.com/typetorch",
				sameAs: ["https://github.com/typetorch", "https://www.npmjs.com/package/@typetorch/cli"],
			},
		);
	} else {
		const entry = sidebar.find((e) => e.route === route);
		graph.push({
			"@type": "TechArticle",
			"@id": `${url}#article`,
			headline: title,
			description: desc,
			url,
			inLanguage: "en",
			isPartOf: { "@id": `${SITE_URL}/#website` },
			about: { "@type": "SoftwareApplication", name: "TypeTorch", url: `${SITE_URL}/` },
			image: `${SITE_URL}/og.png`,
			...(dates ? { datePublished: dates.created, dateModified: dates.modified } : {}),
			encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: `${SITE_URL}/${markdownPathOf(route)}` },
		});
		const crumbs = [{ name: "TypeTorch", item: `${SITE_URL}/` }];
		if (entry?.group) crumbs.push({ name: entry.group, item: `${SITE_URL}/docs` });
		crumbs.push({ name: entry?.text || title, item: url });
		graph.push({
			"@type": "BreadcrumbList",
			itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
		});
	}
	head.push(["script", { type: "application/ld+json" }, JSON.stringify({ "@context": "https://schema.org", "@graph": graph })]);
	return head;
}

// ---------------------------------------------------------------------------------------------------------------
// Sitemap

export function sitemapPriority(route: string): number {
	if (route === "") return 1.0;
	if (route === "docs" || route.startsWith("getting-started/")) return 0.9;
	if (route.startsWith("guides/")) return 0.8;
	if (route.startsWith("agents/")) return 0.7;
	if (route.startsWith("reference/")) return 0.6;
	return 0.5;
}

// ---------------------------------------------------------------------------------------------------------------
// Build output: Markdown twins, llms.txt, llms-full.txt

/** Points llms.txt's page links (https://www.typetorch.dev/<route>[#x]) at the Markdown files. */
export function llmsLinksToMarkdown(text: string, routes: Set<string>): string {
	return text.replace(/\((https:\/\/www\.typetorch\.dev)\/([^)\s#]*)(#[^)\s]*)?\)/g, (all, origin: string, path: string, hash = "") => {
		const route = path.replace(/\/$/, "");
		if (!routes.has(route) || route === "") return all;
		return `(${origin}/${route}.md${hash})`;
	});
}

export interface MarkdownBuild {
	root: string;
	outDir: string;
	/** Source relative paths of every page ("README.md", "guides/analytics.md", ...). */
	pages: string[];
	/** Source -> rewritten path (README.md -> docs.md). */
	rewrites: Record<string, string>;
	sidebar: SidebarEntry[];
	siteDescription: string;
}

export async function writeAgentFiles({ root, outDir, pages, rewrites, sidebar, siteDescription }: MarkdownBuild): Promise<void> {
	const routes = new Set<string>();
	const sources = new Map<string, string>();
	for (const src of pages) {
		const route = routeOf(rewrites[src] ?? src);
		if (route === "" || route === "404") continue;
		routes.add(route);
		sources.set(route, src);
	}

	const header = (route: string, src: string) =>
		`<!-- ${SITE_URL}/${route} (Markdown: ${SITE_URL}/${route}.md, source: https://github.com/typetorch/${
			src.startsWith("reference/") ? `${src.slice("reference/".length, -3)}/blob/main/README.md` : `docs/blob/main/${src}`
		}, index: ${SITE_URL}/llms.txt) -->\n\n`;

	// The Markdown twins: /<route>.md, plus the repo paths they link to (README.md for ../README.md links).
	for (const [route, src] of sources) {
		const text = await readFile(join(root, src), "utf8");
		const body = header(route, src) + text.replace(/^---\n[\s\S]*?\n---\n/, "");
		for (const path of new Set([`${route}.md`, src])) {
			const dest = join(outDir, path);
			await mkdir(dirname(dest), { recursive: true });
			await writeFile(dest, body);
		}
	}

	// llms.txt: the repo's file, page links pointed at the Markdown twins, plus how to get the rest.
	const llmsSource = existsSync(join(root, "llms.txt")) ? readFileSync(join(root, "llms.txt"), "utf8") : `# TypeTorch\n\n> ${siteDescription}\n`;
	let llms = llmsLinksToMarkdown(llmsSource, routes);
	const listed = new Set([...llms.matchAll(/\(https:\/\/www\.typetorch\.dev\/([^)\s#]+?)\.md[#)]/g)].map((m) => m[1]));
	const missing = sidebar.filter((e) => e.route && !listed.has(e.route) && routes.has(e.route));
	if (missing.length) {
		llms += `\n## More pages\n\n${missing.map((e) => `- [${e.text}](${SITE_URL}/${e.route}.md): ${e.group}`).join("\n")}\n`;
	}
	llms += `\n## For agents\n\n- [All docs in one file](${SITE_URL}/llms-full.txt): every page below in sidebar order, as Markdown\n- Any page as Markdown: add \`.md\` to its URL (${SITE_URL}/guides/analytics.md), or request it with \`Accept: text/markdown\`\n- [Sitemap](${SITE_URL}/sitemap.xml)\n`;
	await writeFile(join(outDir, "llms.txt"), llms);

	// llms-full.txt: every sidebar page (then any other page) in order.
	const order = [...sidebar.map((e) => e.route).filter((r) => sources.has(r)), ...[...sources.keys()].filter((r) => !sidebar.some((e) => e.route === r))];
	const parts: string[] = [
		`# TypeTorch docs (full)\n\n> ${siteDescription} Every page of ${SITE_URL} in one file, in the sidebar's order. Index: ${SITE_URL}/llms.txt\n`,
	];
	for (const route of order) {
		const src = sources.get(route)!;
		const text = (await readFile(join(root, src), "utf8")).replace(/^---\n[\s\S]*?\n---\n/, "");
		parts.push(`\n\n---\n\n<!-- page: ${SITE_URL}/${route} -->\n\n${text.trim()}\n`);
	}
	await writeFile(join(outDir, "llms-full.txt"), parts.join(""));
}
