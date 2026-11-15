// The docs site on www.typetorch.dev and typetorch.dev: the static VitePress build, with a few safe headers added.
// Both hosts serve the same pages; each page's <link rel="canonical"> points at https://www.typetorch.dev.

interface Env {
	ASSETS: { fetch(request: Request): Promise<Response> };
}

const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Frame-Options": "DENY",
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const response = await env.ASSETS.fetch(request);
		const headers = new Headers(response.headers);
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	},
};
