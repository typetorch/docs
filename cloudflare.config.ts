// Cloudflare Worker for the docs site: https://www.typetorch.dev and https://typetorch.dev (both serve the site;
// every page's canonical link points at www). Deployed with the Cloudflare CLI (`cf`), not wrangler directly:
//   bun run deploy            (= vitepress build, then `cf deploy`; needs `cf auth login`)
//   bun run deploy:check      (the same with `cf deploy --dry-run`)
// cf loads this file with Node (22.18+), not Bun. The static assets directory is set in wrangler.config.ts.
import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "typetorch-docs",
		compatibilityDate: "2026-11-01",
		entrypoint: "worker/index.ts",
		observability: { enabled: true },
		assets: {
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "404-page",
			runWorkerFirst: true,
		},
		domains: ["www.typetorch.dev", "typetorch.dev"],
		env: { ASSETS: bindings.assets() },
	},
});
