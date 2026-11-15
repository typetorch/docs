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
import { dirname, join, posix } from "node:path";
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

/**
 * Descriptions for pages whose first paragraph doesn't describe them (it opens with code, a usage note or a lead-in),
 * by source path. Kept here, not in front matter, so the files stay clean on GitHub (it renders front matter as a
 * table). Front matter still wins when a page has it.
 */
export const DESCRIPTIONS: Record<string, string> = {
	"README.md":
		"The TypeTorch docs: how hot-swap deploys work, getting started (a fresh game or migrating a roblox-ts game), the guides, the package reference and releases.",
	"guides/deploy-and-rollback.md":
		"How typetorch deploy builds, uploads, cloud-tests, signs and hot-swaps a build onto live servers, and how rollouts, automatic rollback, promote and pins work.",
	"guides/security.md":
		"Who can do what in a TypeTorch game (owners, devs, agents, players), what protects prod builds, the backend, keys and tokens, and why games never use CI.",
	"guides/runtime-api.md":
		"The TypeTorch runtime API: the running generation, swap events, persist and playerState, modules and Dependency, roles, cross-server messages, live config.",
	"guides/from-flamework.md":
		"Move a Flamework 1.x game to TypeTorch: the typetorch migrate codemod, the createFlameworkCompat networking layer, and the full Flamework-to-TypeTorch mapping.",
	"guides/player-data.md":
		"Player data stays game code: a swap-safe pattern for ProfileStore and ProfileService that keeps sessions alive across hot swaps, plus receipts and shutdown.",
};

/** Shortens text to at most `max` characters: at a sentence end when one falls in the second half, else at a word. */
export function shorten(text: string, max = 160): string {
	if (text.length <= max) return text;
	const head = text.slice(0, max);
	const sentence = Math.max(...[". ", "! ", "? "].map((end) => head.lastIndexOf(end)));
	if (sentence >= max / 2) return head.slice(0, sentence + 1);
	const cut = head.slice(0, max - 1);
	const word = cut.lastIndexOf(" ");
	return `${cut.slice(0, word >= max - 40 ? word : max - 1).replace(/[\s,;:(–-]+$/, "")}…`;
}

/** The text a list item starts with, as a label: its bold lead ("**User macros.** ...") or its first clause. */
function listLabel(item: string): string {
	const bold = item.match(/^\*\*(.+?)\*\*/);
	const text = stripMarkdown(bold ? bold[1] : item.split(/[:;(]| - | — /)[0]);
	return text.replace(/[.:,;\s]+$/, "");
}

/**
 * The first real paragraph of a Markdown file, ~160 chars: no headings, images, tables, quotes (notices, "Status:"
 * banners), code, or text inside lists. A lead-in ending in ":" is joined with the labels of the list after it
 * ("It does three things: User macros, Class metadata, Debug macros."). Pages it can't describe well get a
 * description in front matter or in DESCRIPTIONS.
 */
export function firstParagraph(markdown: string, max = 160): string {
	const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/<!--[\s\S]*?-->/g, "");
	type Block = { kind: "p" | "li"; text: string };
	const blocks: Block[] = [];
	let fence = false;
	let cur: string[] = [];
	let kind: Block["kind"] = "p";
	const flush = () => {
		if (cur.length) blocks.push({ kind, text: cur.join(" ") });
		cur = [];
		kind = "p";
	};
	for (const line of body.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) {
			flush();
			fence = !fence;
			continue;
		}
		if (fence) continue;
		if (!line.trim()) {
			flush();
			continue;
		}
		const item = line.match(/^([-*+]|\d+[.)]) +(.*)$/);
		if (item) {
			flush();
			kind = "li";
			cur.push(item[2].trim());
			continue;
		}
		// Headings, quotes, tables, images, HTML blocks: never a description.
		if (/^\s{0,3}(#|>|\||!\[|<)/.test(line)) {
			flush();
			blocks.push({ kind: "p", text: "" });
			continue;
		}
		// An indented line that doesn't continue a paragraph belongs to a list item or is code.
		if (!cur.length && /^(\s{2,}|\t)/.test(line)) {
			blocks.push({ kind: "li", text: "" });
			continue;
		}
		cur.push(line.trim());
	}
	flush();
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		if (block.kind !== "p") continue;
		let text = stripMarkdown(block.text);
		if (text.length < 40) continue;
		if (text.endsWith(":")) {
			const labels: string[] = [];
			for (let j = i + 1; j < blocks.length && blocks[j].kind === "li"; j++) if (blocks[j].text) labels.push(listLabel(blocks[j].text));
			if (!labels.length) continue;
			text = `${text} ${labels.join(", ")}.`;
		}
		return shorten(text, max);
	}
	return "";
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

/** Pages that are built but not part of the docs (kept out of the sitemap, llms-full.txt and search results). */
export function isUnlisted(route: string): boolean {
	return route === "404" || route.startsWith("brand/");
}

export function pageHead({ pageData, title, description, siteTitle, siteDescription, root, sidebar }: HeadInput): HeadConfig[] {
	const route = routeOf(pageData.relativePath);
	const url = `${SITE_URL}/${route}`;
	const desc = description || siteDescription;
	const isHome = route === "";
	// Open Graph and the article headline take the page's own title; og:site_name carries "TypeTorch".
	const pageTitle = isHome ? title : pageData.title || title;
	const head: HeadConfig[] = [
		// VitePress 1.6 writes its own description tag without escaping quotes (a description with "..." breaks the
		// attribute); one from transformHead replaces it and is escaped.
		["meta", { name: "description", content: desc }],
		["meta", { property: "og:title", content: pageTitle }],
		["meta", { property: "og:description", content: desc }],
		["meta", { name: "twitter:title", content: pageTitle }],
		["meta", { name: "twitter:description", content: desc }],
	];
	// The 404 page answers every missing URL: no canonical, no URL of its own, no alternates.
	if (pageData.isNotFound || route === "404") {
		head.push(["meta", { name: "robots", content: "noindex" }]);
		return head;
	}
	head.unshift(["link", { rel: "canonical", href: url }]);
	head.push(["meta", { property: "og:url", content: url }], ["meta", { property: "og:type", content: isHome ? "website" : "article" }]);
	if (isUnlisted(route)) head.push(["meta", { name: "robots", content: "noindex, follow" }]);
	// For agents: the Markdown twin of this page (the home page's is llms.txt, served as text/plain).
	if (isHome) head.push(["link", { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "llms.txt" }]);
	else head.push(["link", { rel: "alternate", type: "text/markdown", href: `/${markdownPathOf(route)}`, title: "This page as Markdown" }]);

	const dates = gitDatesOf(root, pageData.filePath);
	if (dates && !isHome) {
		head.push(["meta", { property: "article:published_time", content: dates.created }]);
		head.push(["meta", { property: "article:modified_time", content: dates.modified }]);
	}

	const publisher = { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "TypeTorch", url: `${SITE_URL}/`, logo: `${SITE_URL}/brand/typetorch-512.png`, sameAs: ["https://github.com/typetorch"] };
	const graph: object[] = [];
	if (isHome) {
		graph.push(
			publisher,
			{ "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: siteTitle, description: siteDescription, inLanguage: "en", publisher: { "@id": publisher["@id"] } },
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
				publisher: { "@id": publisher["@id"] },
				sameAs: ["https://github.com/typetorch", "https://www.npmjs.com/package/@typetorch/cli"],
			},
		);
	} else {
		const entry = sidebar.find((e) => e.route === route);
		graph.push({
			"@type": "TechArticle",
			"@id": `${url}#article`,
			headline: pageTitle.length > 110 ? `${pageTitle.slice(0, 109)}…` : pageTitle,
			description: desc,
			url,
			mainEntityOfPage: url,
			inLanguage: "en",
			isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: siteTitle, url: `${SITE_URL}/` },
			about: { "@type": "SoftwareApplication", "@id": `${SITE_URL}/#software`, name: "TypeTorch" },
			author: publisher,
			publisher,
			image: `${SITE_URL}/og.png`,
			...(entry?.group ? { articleSection: entry.group } : {}),
			...(dates ? { datePublished: dates.created, dateModified: dates.modified } : {}),
			encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: `${SITE_URL}/${markdownPathOf(route)}` },
		});
		// Home > Docs > page (the sidebar groups have no page of their own to link to).
		const crumbs = [{ name: siteTitle, item: `${SITE_URL}/` }];
		if (route !== "docs") crumbs.push({ name: "Docs", item: `${SITE_URL}/docs` });
		crumbs.push({ name: route === "docs" ? "Docs" : entry?.text || pageTitle, item: url });
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

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
// The "Generated by scripts/sync-reference.ts ..." note at the top of the reference pages: for maintainers only.
const GENERATED_NOTE = /^<!-- Generated by [^\n]*-->\r?\n(\r?\n)?/;

/**
 * Rewrites the relative links and images of one page (outside code) to absolute URLs, for llms-full.txt, where they
 * would otherwise resolve against /llms-full.txt. Page links point at the Markdown twins.
 */
export function absolutizeLinks(text: string, src: string, route: string, routeOfSource: (src: string) => string | undefined): string {
	const resolveHref = (href: string): string => {
		if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href;
		if (href.startsWith("#")) return `${SITE_URL}/${route}.md${href}`;
		const [, path = "", rest = ""] = href.match(/^([^?#]*)(.*)$/) ?? [];
		const target = path.startsWith("/") ? path.slice(1) : posix.normalize(posix.join(posix.dirname(src), path));
		const page = target.endsWith(".md") ? routeOfSource(target) : undefined;
		return page !== undefined ? `${SITE_URL}/${page}.md${rest}` : `${SITE_URL}/${target.replace(/^(\.\.\/)+/, "")}${rest}`;
	};
	const prose = (line: string) =>
		line
			.split(/(`+[^`]*`+)/)
			.map((part, i) =>
				i % 2
					? part
					: part
							.replace(/(\]\()([^)\s]+)/g, (_m, pre: string, href: string) => pre + resolveHref(href))
							.replace(/(<(?:img|a|source)\b[^>]*?\b(?:src|href)=)(["'])([^"']+)\2/gi, (_m, pre: string, q: string, href: string) => `${pre}${q}${resolveHref(href)}${q}`),
			)
			.join("");
	let fence = false;
	return text
		.split("\n")
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) fence = !fence;
			else if (!fence) return prose(line);
			return line;
		})
		.join("\n");
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
	const routeBySource = new Map([...sources].map(([route, src]) => [src, route]));

	const header = (route: string, src: string) =>
		`<!-- ${SITE_URL}/${route} as Markdown. Source: https://github.com/typetorch/${
			src.startsWith("reference/") ? `${src.slice("reference/".length, -3)}/blob/main/README.md` : `docs/blob/main/${src}`
		}. All pages: ${SITE_URL}/llms.txt -->\n\n`;

	// The Markdown twins: /<route>.md, plus the repo paths they link to (README.md for ../README.md links). Relative
	// links keep working because the files sit at their repo paths. Skill files keep their front matter (name,
	// description), so the file can be installed as it is.
	for (const [route, src] of sources) {
		const text = await readFile(join(root, src), "utf8");
		const front = src.startsWith("agents/skills/") ? (text.match(FRONT_MATTER)?.[0] ?? "") : "";
		const body = front + (front ? "\n" : "") + header(route, src) + text.replace(FRONT_MATTER, "").replace(GENERATED_NOTE, "");
		for (const path of new Set([`${route}.md`, src])) {
			const dest = join(outDir, path);
			await mkdir(dirname(dest), { recursive: true });
			await writeFile(dest, body);
		}
	}

	// llms.txt (llmstxt.org): the repo's file, page links pointed at the Markdown twins, then the pages it doesn't
	// list and how to get the rest, both before "## Optional" (which stays last: agents may skip it).
	const llmsSource = existsSync(join(root, "llms.txt")) ? readFileSync(join(root, "llms.txt"), "utf8") : `# TypeTorch\n\n> ${siteDescription}\n`;
	const llms = llmsLinksToMarkdown(llmsSource, routes).trimEnd();
	const listed = new Set([...llms.matchAll(/\(https:\/\/www\.typetorch\.dev\/([^)\s#]+?)\.md[#)]/g)].map((m) => m[1]));
	const missing = sidebar.filter((e) => e.route && !listed.has(e.route) && routes.has(e.route));
	let extra = "";
	if (missing.length) extra += `## More pages\n\n${missing.map((e) => `- [${e.text}](${SITE_URL}/${e.route}.md): ${e.group}`).join("\n")}\n\n`;
	extra +=
		`## For agents\n\n` +
		`- [All docs in one file](${SITE_URL}/llms-full.txt): every page linked here, in the sidebar's order, as Markdown\n` +
		`- [Any page as Markdown](${SITE_URL}/guides/analytics.md): add \`.md\` to a page's URL, or request the page with \`Accept: text/markdown\`\n` +
		`- [Sitemap](${SITE_URL}/sitemap.xml): every HTML page with its last change\n\n`;
	const optional = llms.search(/^## Optional\s*$/m);
	await writeFile(join(outDir, "llms.txt"), optional >= 0 ? `${llms.slice(0, optional)}${extra}${llms.slice(optional)}\n` : `${llms}\n\n${extra.trimEnd()}\n`);

	// llms-full.txt: every sidebar page, then any other listed page, in order; links made absolute.
	const order = [...sidebar.map((e) => e.route).filter((r) => sources.has(r)), ...[...sources.keys()].filter((r) => !isUnlisted(r) && !sidebar.some((e) => e.route === r))];
	const parts: string[] = [
		`# TypeTorch docs (full)\n\n> ${siteDescription} Every page of ${SITE_URL} in one file, in the sidebar's order. Index: ${SITE_URL}/llms.txt\n`,
	];
	for (const route of order) {
		const src = sources.get(route)!;
		const text = (await readFile(join(root, src), "utf8")).replace(FRONT_MATTER, "").replace(GENERATED_NOTE, "");
		const body = absolutizeLinks(text.trim(), src, route, (s) => routeBySource.get(s));
		parts.push(`\n\n---\n\n<!-- page: ${SITE_URL}/${route} (Markdown: ${SITE_URL}/${route}.md) -->\n\n${body}\n`);
	}
	await writeFile(join(outDir, "llms-full.txt"), parts.join(""));
}
