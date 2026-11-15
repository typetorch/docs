<script setup lang="ts">
// Under the install command on the home page: where an AI agent should start.
</script>

<template>
	<p class="tt-agent-hint">
		Using an AI agent? Point it at <a href="/llms.txt">typetorch.dev/llms.txt</a>
		(<a href="/llms-full.txt">all docs in one file</a>), or tell it "migrate this project to typetorch" with the
		<a href="/agents/AGENTS">agent playbook</a>.
	</p>
</template>

<style scoped>
.tt-agent-hint {
	margin-top: 14px;
	max-width: 560px;
	font-size: 14px;
	line-height: 22px;
	color: var(--vp-c-text-2);
}
.tt-agent-hint a {
	color: var(--vp-c-brand-1);
	font-weight: 500;
	text-decoration: underline;
	text-underline-offset: 2px;
}
</style>
