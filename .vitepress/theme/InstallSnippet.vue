<script setup lang="ts">
import { ref } from "vue";

const command = "bunx @typetorch/cli init";
const copied = ref(false);

async function copy() {
	try {
		await navigator.clipboard.writeText(command);
		copied.value = true;
		setTimeout(() => (copied.value = false), 1500);
	} catch {}
}
</script>

<template>
	<div class="tt-install">
		<code><span class="tt-prompt" aria-hidden="true">$</span> {{ command }}</code>
		<button type="button" class="tt-copy" :aria-label="copied ? 'Copied' : 'Copy the command'" @click="copy">
			{{ copied ? "Copied" : "Copy" }}
		</button>
	</div>
</template>

<style scoped>
.tt-install {
	display: inline-flex;
	align-items: center;
	gap: 12px;
	max-width: 100%;
	margin-top: 24px;
	padding: 10px 12px 10px 16px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-code-block-bg);
	font-family: var(--vp-font-family-mono);
	font-size: 14px;
}
.tt-install code {
	overflow-x: auto;
	white-space: nowrap;
	color: var(--vp-c-text-1);
}
.tt-prompt {
	color: var(--vp-c-text-3);
	user-select: none;
}
.tt-copy {
	flex: none;
	padding: 2px 10px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 6px;
	font-size: 12px;
	color: var(--vp-c-text-2);
	transition: color 0.2s, border-color 0.2s;
}
.tt-copy:hover {
	color: var(--vp-c-brand-1);
	border-color: var(--vp-c-brand-1);
}
</style>
