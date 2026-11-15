// The docs site on www.typetorch.dev and typetorch.dev: the static VitePress build, with a few safe headers added.
// Both hosts serve the same pages; each page's <link rel="canonical"> points at https://www.typetorch.dev.
//
// For agents, every page also exists as Markdown (/guides/analytics.md, built by .vitepress/agents.ts):
//   - a request that prefers Markdown (`Accept: text/markdown` before text/html) gets it on the page's own URL;
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

/** True when the client ranks text/markdown (or text/x-markdown) above text/html. */
export function prefersMarkdown(accept: string | null): boolean {
	if (!accept) return false;
	let md = -1;
	let html = -1;
	for (const part of accept.split(",")) {
		const [type, ...params] = part.trim().toLowerCase().split(";");
		const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
		if (type === "text/markdown" || type === "text/x-markdown") md = Math.max(md, q);
		if (type === "text/html") html = Math.max(html, q);
	}
	return md > 0 && md >= html;
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const isText = /\.(md|txt)$/.test(path);

		// Markdown on the page URL for agents that ask for it.
		if (!isText && !/\.[a-z0-9]+$/i.test(path.replace(/\.html$/, "")) && prefersMarkdown(request.headers.get("accept"))) {
			const route = routeOf(path);
			const md = await env.ASSETS.fetch(new Request(new URL(markdownPath(route), url), request));
			if (md.ok) {
				return withHeaders(md, {
					"Content-Type": route === "/" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
					Vary: "Accept",
					Link: `<${SITE}${route === "/" ? "/" : route}>; rel="canonical"`,
					"X-Robots-Tag": "noindex",
				});
			}
		}

		const response = await env.ASSETS.fetch(request);
		if (isText) {
			const route = path.endsWith(".md") ? path.slice(0, -3) : null;
			return withHeaders(response, {
				"Content-Type": path.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
				"X-Robots-Tag": "noindex",
				...(route ? { Link: `<${SITE}${route === "/README" ? "/docs" : route}>; rel="canonical"` } : {}),
			});
		}
		const type = response.headers.get("content-type") ?? "";
		if (type.includes("text/html") && response.ok) {
			const route = routeOf(path);
			return withHeaders(response, {
				Vary: "Accept",
				Link: `<${markdownPath(route)}>; rel="alternate"; type="${route === "/" ? "text/plain" : "text/markdown"}"`,
			});
		}
		return withHeaders(response);
	},
};
