import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import AgentHint from "./AgentHint.vue";
import InstallSnippet from "./InstallSnippet.vue";
import PageActions from "./PageActions.vue";
import "./custom.css";

export default {
	extends: DefaultTheme,
	Layout: () =>
		h(DefaultTheme.Layout, null, {
			// The install command under the home page tagline.
			"home-hero-info-after": () => [h(InstallSnippet), h(AgentHint)],
			// Copy as Markdown / View as Markdown / llms.txt above every docs page.
			"doc-before": () => h(PageActions),
		}),
} satisfies Theme;
