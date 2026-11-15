// The docs site on www.typetorch.dev and typetorch.dev: the static VitePress build, with a few safe headers added.
// Both hosts serve the same pages; each page's <link rel="canonical"> points at https://www.typetorch.dev.
//
// For agents, every page also exists as Markdown (/guides/analytics.md, built by .vitepress/agents.ts):
//   - a request that names text/markdown and ranks it at least as high as HTML gets it on the page's own URL;
//   - HTML answers carry `Link: </guides/analytics.md>; rel="alternate"; type="text/markdown"`;
//   - Markdown and llms files are `noindex` for search engines and point at the HTML page as canonical.

interface Env {
	ASSETS: { fetch(request: Request | string): Promise<Response> };
}

const SITE = "https://www.typetorch.dev";

const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Frame-Options": "DENY",
};

/**
 * True when the client asks for text/markdown (or text/x-markdown) by name and ranks it at least as high as HTML.
 * HTML's rank is that of its most specific match: text/html, else text/*, else the any-type range. Without a Markdown
 * type named (a browser's Accept, or just the any-type range), the answer is HTML.
 */
export function prefersMarkdown(accept: string | null): boolean {
	if (!accept) return false;
	let md = -1;
	const html = { exact: -1, text: -1, any: -1 };
	for (const part of accept.split(",")) {
		const [rawType = "", ...params] = part.split(";");
		const type = rawType.trim().toLowerCase();
		const qParam = params.map((p) => p.trim().toLowerCase()).find((p) => /^q\s*=/.test(p));
		const parsed = qParam === undefined ? 1 : Number(qParam.slice(qParam.indexOf("=") + 1).trim());
		const q = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 1;
		if (type === "text/markdown" || type === "text/x-markdown") md = Math.max(md, q);
		else if (type === "text/html") html.exact = Math.max(html.exact, q);
		else if (type === "text/*") html.text = Math.max(html.text, q);
		else if (type === "*/*") html.any = Math.max(html.any, q);
	}
	const htmlQ = html.exact >= 0 ? html.exact : html.text >= 0 ? html.text : html.any;
	return md > 0 && md >= htmlQ;
}

/** The page route of an HTML path: "/guides/analytics" (also "/guides/analytics.html", "/guides/analytics/"). */
function routeOf(pathname: string): string {
	return pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
}

function markdownPath(route: string): string {
	return route === "/" ? "/llms.txt" : `${route}.md`;
}

function withHeaders(response: Response, extra: Record<string, string> = {}): Response {
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) headers.set(name, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** A fetched asset that can be passed on: 200, or 304 for a conditional request. */
function usable(response: Response): boolean {
	return response.ok || response.status === 304;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const isText = /\.(md|txt)$/.test(path);

		// Markdown on the page URL for agents that ask for it: only for paths that are pages (a path with a file
		// extension, or a .md copy without a page such as /README, gets the normal answer).
		const isPagePath = !/\.[a-z0-9]+$/i.test(path.replace(/\.html$/, ""));
		if (isPagePath && prefersMarkdown(request.headers.get("accept"))) {
			const route = routeOf(path);
			const md = await env.ASSETS.fetch(new Request(new URL(markdownPath(route), url), request));
			const page = usable(md) ? await env.ASSETS.fetch(new Request(new URL(route, url), { method: "HEAD" })) : null;
			if (page?.ok) {
				return withHeaders(md, {
					"Content-Type": route === "/" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
					Vary: "Accept",
					Link: `<${SITE}${route === "/" ? "/" : route}>; rel="canonical"`,
					"X-Robots-Tag": "noindex",
				});
			}
		}

		const response = await env.ASSETS.fetch(request);
		// A missing .md or .txt file gets the 404 page, as HTML.
		if (isText && usable(response)) {
			const route = path.endsWith(".md") ? path.slice(0, -3) : null;
			return withHeaders(response, {
				"Content-Type": path.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
				"X-Robots-Tag": "noindex",
				...(route ? { Link: `<${SITE}${route === "/README" ? "/docs" : route}>; rel="canonical"` } : {}),
			});
		}
		const type = response.headers.get("content-type") ?? "";
		if ((type.includes("text/html") && response.ok) || (isPagePath && response.status === 304)) {
			const route = routeOf(path);
			return withHeaders(response, {
				Vary: "Accept",
				Link: `<${markdownPath(route)}>; rel="alternate"; type="${route === "/" ? "text/plain" : "text/markdown"}"`,
			});
		}
		// VitePress's /assets/ files have a content hash in their names: they never change.
		if (path.startsWith("/assets/") && usable(response)) {
			return withHeaders(response, { "Cache-Control": "public, max-age=31536000, immutable" });
		}
		return withHeaders(response);
	},
};
