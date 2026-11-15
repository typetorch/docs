import { copyFile, cp, mkdir } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, posix, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, type HeadConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import type { Plugin } from "vite";
import { SIDEBAR, githubSlug } from "./sidebar";
import { DESCRIPTIONS, firstParagraph, gitDatesOf, isUnlisted, pageHead, routeOf, shorten, sidebarPages, sitemapPriority, writeAgentFiles } from "./agents";

const SITE_URL = "https://www.typetorch.dev";
const GITHUB_ORG = "https://github.com/typetorch";
const TITLE = "TypeTorch";
const DESCRIPTION = "Update live Roblox games without restarting their servers.";

// The docs repo root is the VitePress source dir.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// README.md is the docs overview. On GitHub it stays README.md; on the site it is /docs.
const rewrites: Record<string, string> = {
	"README.md": "docs.md",
};

// Files served as-is from the repo (they keep their paths for GitHub): copied into the build,
// and served by the dev server.
const STATIC_FILES: Record<string, string> = {
	"/llms.txt": "llms.txt",
	"/favicon.ico": "brand/favicon.ico",
};
const STATIC_DIRS: Record<string, string> = {
	"/brand/": "brand/",
};
const MIME: Record<string, string> = {
	".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
};

function staticSource(urlPath: string): string | undefined {
	if (STATIC_FILES[urlPath]) return join(root, STATIC_FILES[urlPath]);
	for (const [prefix, dir] of Object.entries(STATIC_DIRS)) {
		if (!urlPath.startsWith(prefix)) continue;
		const rel = posix.normalize(urlPath.slice(prefix.length));
		if (rel.startsWith("..") || extname(rel) === ".md" || !MIME[extname(rel)]) return undefined;
		return join(root, dir, rel);
	}
	return undefined;
}

// Dev server: serve llms.txt and brand/ images at their site paths.
const serveRepoFiles: Plugin = {
	name: "typetorch:serve-repo-files",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			const file = staticSource(decodeURIComponent((req.url ?? "").split("?")[0]));
			if (!file || !existsSync(file) || !statSync(file).isFile()) return next();
			res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
			createReadStream(file).pipe(res);
		});
	},
};

// Links to a rewritten page (../README.md) are written against the source path, which works on GitHub.
// VitePress resolves them against the rewritten path, so point them at the rewritten file here.
function rewriteLinksPlugin(md: import("markdown-it")) {
	const bySource = new Map(Object.entries(rewrites).map(([from, to]) => [resolve(root, from), resolve(root, to)]));
	md.core.ruler.push("typetorch_rewrite_links", (state) => {
		const env = state.env as { path?: string; realPath?: string };
		if (!env.path) return;
		const sourceDir = dirname(env.realPath ?? env.path);
		const pageDir = dirname(env.path);
		for (const block of state.tokens) {
			for (const token of block.children ?? []) {
				if (token.type !== "link_open") continue;
				const href = token.attrGet("href");
				if (!href || /^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href)) continue;
				const [, path = "", rest = ""] = href.match(/^([^?#]*)(.*)$/) ?? [];
				if (!path.endsWith(".md")) continue;
				const target = bySource.get(resolve(sourceDir, decodeURIComponent(path)));
				const moved = target ?? (sourceDir !== pageDir ? resolve(sourceDir, path) : undefined);
				if (!moved) continue;
				let next = relative(pageDir, moved).split("\\").join("/");
				if (!next.startsWith(".")) next = `./${next}`;
				token.attrSet("href", next + rest);
			}
		}
	});
	// Reference pages are copied from the package READMEs: their links never fail the build.
	const render = md.render.bind(md);
	md.render = (src, env) => {
		const html = render(src, env);
		if (typeof env?.relativePath === "string" && env.relativePath.startsWith("reference/")) env.links = [];
		return html;
	};
}

// Placeholders such as "<Game>", "<branch>" or "<pid or UserId>" in prose (outside code spans) are not
// HTML. GitHub drops them silently; VitePress hands them to the Vue compiler, which fails the build on
// the missing end tag. These rules turn them back into text, so every page builds and shows them.

// CommonMark's HTML block start tags (type 6): only these, and Vue components, may interrupt a paragraph.
const HTML_BLOCK_TAGS = new Set(
	("address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt " +
		"fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link " +
		"main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead " +
		"title tr track ul pre script style textarea")
		.split(" "),
);
// Elements that are fine inline in Markdown prose.
const HTML_INLINE_TAGS = new Set(
	("a abbr b bdi bdo br cite code data del dfn em i img ins kbd mark q s samp small span strong sub sup time u var wbr " +
		"picture source video audio svg input label button")
		.split(" "),
);
const VOID_TAGS = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
// Vue components the pages may use (globals of VitePress and the Mermaid plugin).
const COMPONENTS = new Set(["Badge", "ClientOnly", "Content", "Mermaid"]);

function isKnownTag(name: string): boolean {
	return name.includes("-") || COMPONENTS.has(name) || HTML_BLOCK_TAGS.has(name.toLowerCase()) || HTML_INLINE_TAGS.has(name.toLowerCase());
}

function placeholderTagsPlugin(md: import("markdown-it")) {
	// 1. VitePress lets any unknown tag at the start of a line interrupt a paragraph and open an HTML block
	//    (a code span wrapped over a line break: `kernel restore\n<file>`). Keep CommonMark's rule there.
	const ruler = md.block.ruler as unknown as {
		__rules__: { name: string; fn: (...args: any[]) => boolean; alt: string[] }[];
		at(name: string, fn: (...args: any[]) => boolean, options?: { alt: string[] }): void;
	};
	const rule = ruler.__rules__.find((r) => r.name === "html_block");
	if (rule) {
		const original = rule.fn;
		ruler.at(
			"html_block",
			(state: any, startLine: number, endLine: number, silent: boolean) => {
				if (silent) {
					const pos = state.bMarks[startLine] + state.tShift[startLine];
					const tag = state.src.slice(pos, state.eMarks[startLine]).match(/^<\/?([A-Za-z][A-Za-z0-9]*)(?=[\s/>]|$)/);
					if (tag && !HTML_BLOCK_TAGS.has(tag[1].toLowerCase()) && !COMPONENTS.has(tag[1])) return false;
				}
				return original(state, startLine, endLine, silent);
			},
			{ alt: rule.alt },
		);
	}

	// 2. Inline tags: keep known elements that are closed in the same paragraph (or void / self-closing),
	//    and turn everything else into text.
	md.core.ruler.push("typetorch_placeholder_tags", (state) => {
		for (const block of state.tokens) {
			const children = block.children;
			if (!children) continue;
			const open: string[] = [];
			children.forEach((token, i) => {
				if (token.type !== "html_inline") return;
				const m = token.content.match(/^<(\/?)([A-Za-z][\w-]*)/);
				if (!m) return; // comments, CDATA and the like
				const [, closing, name] = m;
				let keep: boolean;
				if (closing) {
					const at = open.lastIndexOf(name);
					keep = at >= 0;
					if (keep) open.splice(at, 1);
				} else if (!isKnownTag(name)) {
					keep = false;
				} else if (VOID_TAGS.has(name.toLowerCase()) || /\/>$/.test(token.content)) {
					keep = true;
				} else {
					keep = children.slice(i + 1).some((t) => t.type === "html_inline" && new RegExp(`^</${name}\\s*>`).test(t.content));
					if (keep) open.push(name);
				}
				if (!keep) token.type = "text";
			});
		}
	});
}

// <img src="brand/typetorch.svg"> in raw HTML works on GitHub, but Vite reads a bare "brand/..." as a
// package import. Give relative src values a "./" so Vite bundles the image like a Markdown image.
function relativeHtmlImagesPlugin(md: import("markdown-it")) {
	const fix = (html: string) =>
		html.replace(/(<img\b[^>]*?\bsrc=)(["'])(?![a-z][a-z0-9+.-]*:|\/|\.|#)/gi, (_m, pre: string, q: string) => `${pre}${q}./`);
	for (const type of ["html_block", "html_inline"] as const) {
		const original = md.renderer.rules[type];
		md.renderer.rules[type] = (tokens, idx, options, env, self) =>
			fix(original ? original(tokens, idx, options, env, self) : tokens[idx].content);
	}
}

// Heading ids the way GitHub makes them (github-slugger): lower case, every character that isn't a letter,
// a number, "_", "-" or a space dropped, spaces turned into "-". VitePress's default turns "." and "(" into
// "-" and puts "_" before a leading digit, so links such as settings.md#join-data-backendanalyticsjoindata
// or fresh-setup.md#6-the-open-cloud-api-key-owner that work on GitHub would miss their heading here.
// The function lives in sidebar.ts, which also uses it for the headings it lists under each page.

const SIDEBAR_PAGES = sidebarPages(SIDEBAR);

const config = withMermaid(
	defineConfig({
		srcDir: ".",
		title: TITLE,
		description: DESCRIPTION,
		lang: "en-US",
		cleanUrls: true,
		lastUpdated: false,
		rewrites,
		srcExclude: [
			"**/node_modules/**",
			"**/CHANGELOG.md",
			".vitepress/**",
			".wrangler/**",
			".cloudflare/**",
			"worker/**",
			"scripts/**",
			"public/**",
		],
		// Dead links fail the build. Reference pages are exempt (see rewriteLinksPlugin);
		// localhost URLs in examples are not dead links.
		ignoreDeadLinks: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/],
		sitemap: {
			hostname: SITE_URL,
			// lastmod from git, priorities by section, no 404 page.
			transformItems: (items) =>
				items
					.map((item) => ({ item, route: item.url.replace(/^\//, "").replace(/\.html$/, "").replace(/\/$/, "") }))
					.filter(({ route }) => !isUnlisted(route))
					.map(({ item, route }) => {
						const src = Object.entries(rewrites).find(([, to]) => routeOf(to) === route)?.[0] ?? (route === "" ? "index.md" : `${route}.md`);
						const dates = gitDatesOf(root, src);
						return {
							...item,
							...(dates ? { lastmod: dates.modified } : {}),
							changefreq: route === "" ? "daily" : "weekly",
							priority: sitemapPriority(route),
						};
					}),
		},
		head: [
			["link", { rel: "icon", href: "/favicon.ico", sizes: "48x48" }],
			["link", { rel: "icon", href: "/brand/typetorch.svg", type: "image/svg+xml" }],
			["link", { rel: "apple-touch-icon", href: "/brand/typetorch-180.png" }],
			["meta", { name: "theme-color", content: "#e8590c" }],
			["meta", { property: "og:site_name", content: TITLE }],
			["meta", { property: "og:locale", content: "en_US" }],
			["meta", { property: "og:image", content: `${SITE_URL}/og.png` }],
			["meta", { property: "og:image:width", content: "1200" }],
			["meta", { property: "og:image:height", content: "630" }],
			["meta", { property: "og:image:alt", content: "TypeTorch: update live Roblox games without restarting their servers" }],
			["meta", { name: "twitter:card", content: "summary_large_image" }],
			["meta", { name: "twitter:image", content: `${SITE_URL}/og.png` }],
			["meta", { name: "twitter:image:alt", content: "TypeTorch: update live Roblox games without restarting their servers" }],
			["meta", { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" }],
		],
		// Each page's description (search results and link cards): its front matter's (shortened: a skill's is long),
		// else DESCRIPTIONS, else its first paragraph.
		transformPageData(pageData) {
			const own = pageData.frontmatter.description;
			if (typeof own === "string") {
				pageData.description = shorten(own.replace(/\s+/g, " ").trim(), 200);
				return;
			}
			if (pageData.frontmatter.layout === "home") return;
			const file = join(root, pageData.filePath);
			const text = DESCRIPTIONS[pageData.filePath] ?? (existsSync(file) ? firstParagraph(readFileSync(file, "utf8")) : "");
			if (text) pageData.description = text;
		},
		transformHead({ pageData, title, description }) {
			return pageHead({ pageData, title, description, siteTitle: TITLE, siteDescription: DESCRIPTION, root, sidebar: SIDEBAR_PAGES });
		},
		markdown: {
			// Shiki has no gitignore grammar; its comments and patterns read fine as ini.
			languageAlias: { gitignore: "ini" },
			anchor: { slugify: githubSlug },
			config: (md) => {
				placeholderTagsPlugin(md);
				relativeHtmlImagesPlugin(md);
				rewriteLinksPlugin(md);
			},
		},
		themeConfig: {
			logo: { src: "/brand/typetorch.svg", alt: "TypeTorch logo" },
			nav: [
				{ text: "Docs", link: "/docs", activeMatch: "^/(docs|getting-started|agents)(/|$)" },
				{ text: "Guides", link: "/guides/runtime-api", activeMatch: "^/guides/" },
				{ text: "Reference", link: "/reference/cli", activeMatch: "^/reference/" },
				{
					text: "For agents",
					activeMatch: "^/agents/",
					items: [
						{ text: "llms.txt (index)", link: `${SITE_URL}/llms.txt`, target: "_blank" },
						{ text: "llms-full.txt (all docs)", link: `${SITE_URL}/llms-full.txt`, target: "_blank" },
						{ text: "Agent playbook", link: "/agents/AGENTS" },
						{ text: "Claude Code skill", link: "/agents/skills/typetorch-migrate/SKILL" },
					],
				},
				{ text: "Demo", link: "https://demo.typetorch.dev" },
				{ text: "GitHub", link: GITHUB_ORG },
			],
			sidebar: SIDEBAR,
			outline: { level: [2, 3], label: "On this page" },
			search: { provider: "local" },
			editLink: {
				// Reference pages are copies: edit them in the package repo. This function is serialized
				// into the client bundle, so it can't use anything from outside its own body.
				pattern: ({ filePath }) => {
					const ref = filePath.match(/^reference\/([^/]+)\.md$/);
					if (ref) return `https://github.com/typetorch/${ref[1]}/edit/main/README.md`;
					return `https://github.com/typetorch/docs/edit/main/${filePath}`;
				},
				text: "Edit this page on GitHub",
			},
			footer: {
				message: "Released under the MIT License.",
				copyright: "Copyright © 2026 TypeTorch contributors",
			},
		},
		vite: {
			plugins: [serveRepoFiles],
			// Mermaid and the local search index are large; they load on demand.
			build: { chunkSizeWarningLimit: 2000 },
		},
		async buildEnd(siteConfig) {
			const out = siteConfig.outDir;
			for (const [urlPath, src] of Object.entries(STATIC_FILES)) {
				const dest = join(out, urlPath);
				await mkdir(dirname(dest), { recursive: true });
				await copyFile(join(root, src), dest);
			}
			for (const [urlPath, src] of Object.entries(STATIC_DIRS)) {
				await cp(join(root, src), join(out, urlPath), {
					recursive: true,
					filter: (file) => statSync(file).isDirectory() || !!MIME[extname(file)],
				});
			}
			// Agents: every page as Markdown, llms.txt with links to it, llms-full.txt (after the plain llms.txt copy).
			await writeAgentFiles({
				root,
				outDir: out,
				pages: siteConfig.pages,
				rewrites: siteConfig.rewrites.map as Record<string, string>,
				sidebar: SIDEBAR_PAGES,
				siteDescription: DESCRIPTION,
			});
		},
		mermaid: {},
	}),
);

// vitepress-plugin-mermaid pre-bundles a fixed list of packages; drop the ones this install doesn't
// have (mermaid 11 no longer needs "debug"), so the dev server starts without a warning.
const requireFromRoot = createRequire(join(root, "package.json"));
const include = config.vite?.optimizeDeps?.include;
if (include) {
	config.vite!.optimizeDeps!.include = include.filter((dep) => {
		try {
			requireFromRoot.resolve(dep);
			return true;
		} catch {
			return false;
		}
	});
}

export default config;
