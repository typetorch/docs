// Build settings cf passes to its Wrangler bundler: the VitePress output is the Worker's static assets.
import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	assetsDirectory: ".vitepress/dist",
});
