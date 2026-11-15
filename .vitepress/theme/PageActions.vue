<script setup lang="ts">
// Above every docs page: copy it as Markdown, open the Markdown, or the llms.txt index (for people pasting into an
// AI chat, and for agents reading the page).
import { computed, ref } from "vue";
import { useData } from "vitepress";

const { page, frontmatter } = useData();
const route = computed(() => {
	const rel = page.value.relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "").replace(/\/$/, "");
	return rel;
});
const mdUrl = computed(() => `/${route.value}.md`);
const show = computed(() => frontmatter.value.layout !== "home" && !page.value.isNotFound && route.value !== "404");
const state = ref<"idle" | "copied" | "failed">("idle");

async function copy() {
	try {
		const response = await fetch(mdUrl.value, { headers: { accept: "text/markdown" } });
		if (!response.ok) throw new Error(String(response.status));
		await navigator.clipboard.writeText(await response.text());
		state.value = "copied";
	} catch {
		state.value = "failed";
	}
	setTimeout(() => (state.value = "idle"), 1600);
}
</script>

<template>
	<div v-if="show" class="tt-page-actions" aria-label="This page for AI agents">
		<button type="button" @click="copy">{{ state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy page as Markdown" }}</button>
		<a :href="mdUrl" target="_blank" rel="noopener">View as Markdown</a>
		<a href="/llms.txt" target="_blank" rel="noopener">llms.txt</a>
	</div>
</template>

<style scoped>
.tt-page-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 20px;
}
.tt-page-actions button,
.tt-page-actions a {
	padding: 3px 10px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 6px;
	font-size: 12px;
	font-weight: 500;
	line-height: 20px;
	color: var(--vp-c-text-2);
	text-decoration: none;
	transition: color 0.2s, border-color 0.2s;
}
.tt-page-actions button:hover,
.tt-page-actions a:hover {
	color: var(--vp-c-brand-1);
	border-color: var(--vp-c-brand-1);
}
</style>
