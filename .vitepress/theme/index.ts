import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import InstallSnippet from "./InstallSnippet.vue";
import "./custom.css";

export default {
	extends: DefaultTheme,
	Layout: () =>
		h(DefaultTheme.Layout, null, {
			// The install command under the home page tagline.
			"home-hero-info-after": () => h(InstallSnippet),
		}),
} satisfies Theme;
