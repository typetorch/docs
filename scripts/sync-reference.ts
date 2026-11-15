// Copies each public package README into reference/<pkg>.md for the docs site.
//
//   bun run sync:reference            # from GitHub main (raw.githubusercontent.com)
//   bun run sync:reference --local    # from the local sweep worktrees (../.wt-sweep-<repo>/README.md)
//   bun run sync:reference --local=/path/to/folder   # from <folder>/<repo>/README.md
//
// Relative links and images are rewritten to absolute GitHub URLs, so the pages never link into
// files the docs site doesn't have. The output depends only on the README text, so re-running it
// without upstream changes gives no diff. dash is a private repo and is never synced.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";

const ORG = "typetorch";
const BRANCH = "main";
const FETCH_TIMEOUT_MS = 30_000;

// The public package READMEs, in sidebar order. Keep in sync with REFERENCE in .vitepress/sidebar.ts.
export const PACKAGES = [
	"cli",
	"framework",
	"kernel",
	"transformer",
	"dev-server",
	"studio-plugin",
	"backend",
] as const;

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outDir = join(root, "reference");

function parseArgs(argv: string[]) {
	let local: string | undefined;
	for (const arg of argv) {
		if (arg === "--local") local = resolve(root, "..");
		else if (arg.startsWith("--local=")) local = resolve(arg.slice("--local=".length));
		else if (arg === "--help" || arg === "-h") {
			console.log("usage: bun scripts/sync-reference.ts [--local[=<folder>]]");
			process.exit(0);
		} else {
			console.error(`unknown argument: ${arg}`);
			process.exit(2);
		}
	}
	return { local };
}

async function readReadme(repo: string, local: string | undefined): Promise<string> {
	if (local !== undefined) {
		// The default --local layout is the sweep worktrees next to this repo: .wt-sweep-<repo>.
		const candidates = [join(local, `.wt-sweep-${repo}`, "README.md"), join(local, repo, "README.md")];
		for (const file of candidates) {
			try {
				return await readFile(file, "utf8");
			} catch {}
		}
		throw new Error(`no local README for ${repo} (tried ${candidates.join(", ")})`);
	}
	const url = `https://raw.githubusercontent.com/${ORG}/${repo}/${BRANCH}/README.md`;
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return await res.text();
}

const isAbsolute = (url: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);

function absolutize(repo: string, url: string, image: boolean): string {
	if (url === "" || isAbsolute(url)) return url;
	const [, path = "", rest = ""] = url.match(/^([^?#]*)(.*)$/) ?? [];
	const clean = posix.normalize(path.startsWith("/") ? path.slice(1) : path).replace(/^(\.\.\/)+/, "");
	const target = clean === "." ? "" : clean;
	if (image) return `https://raw.githubusercontent.com/${ORG}/${repo}/${BRANCH}/${target}${rest}`;
	return `https://github.com/${ORG}/${repo}/blob/${BRANCH}/${target}${rest}`;
}

// Rewrites links in one line of prose (never inside inline code spans).
function rewriteProse(repo: string, text: string): string {
	return (
		text
			// ![alt](url "title") and [text](url "title")
			.replace(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(\s+"[^"]*")?\s*\)/g, (_m, bang: string, label: string, url: string, title = "") =>
				`${bang}[${label}](${absolutize(repo, url, bang === "!")}${title})`,
			)
			// <img src="..."> and <a href="..."> in inline HTML
			.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']*)\2/gi, (_m, pre: string, q: string, url: string) => `${pre}${q}${absolutize(repo, url, true)}${q}`)
			.replace(/(<(?:a|source)\b[^>]*?\b(?:href|srcset)=)(["'])([^"']*)\2/gi, (_m, pre: string, q: string, url: string) =>
				`${pre}${q}${absolutize(repo, url, pre.toLowerCase().startsWith("<source"))}${q}`,
			)
	);
}

export function transform(repo: string, readme: string): string {
	const lines = readme.replace(/\r\n?/g, "\n").split("\n");
	const out: string[] = [];
	let fence: string | undefined;
	for (const line of lines) {
		const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fence !== undefined) {
			if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && line.trim() === fenceMatch[1]) fence = undefined;
			out.push(line);
			continue;
		}
		if (fenceMatch) {
			fence = fenceMatch[1];
			out.push(line);
			continue;
		}
		// Reference-style link definitions: [id]: url
		const def = line.match(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)(.*)$/);
		if (def) {
			out.push(def[1] + absolutize(repo, def[2], /\.(png|jpe?g|gif|svg|webp)$/i.test(def[2])) + def[3]);
			continue;
		}
		// Hide inline code spans behind placeholders so only prose links are rewritten
		// (a link label may itself hold code: [`runtime-kit/`](runtime-kit)).
		const spans: string[] = [];
		const hidden = line.replace(/(`+)[^`]*?\1/g, (span) => `\u0000${spans.push(span) - 1}\u0000`);
		out.push(rewriteProse(repo, hidden).replace(/\u0000(\d+)\u0000/g, (_m, i: string) => spans[Number(i)]));
	}
	const body = out.join("\n").trimEnd();
	const source = `https://github.com/${ORG}/${repo}/blob/${BRANCH}/README.md`;
	return [
		`<!-- Generated by scripts/sync-reference.ts from ${ORG}/${repo} README.md (${BRANCH}). Don't edit by hand: run \`bun run sync:reference\`. -->`,
		"",
		`> Synced from the [${repo} README](${source}).`,
		"",
		body,
		"",
	].join("\n");
}

async function main() {
	const { local } = parseArgs(process.argv.slice(2));
	await mkdir(outDir, { recursive: true });
	let failed = 0;
	for (const repo of PACKAGES) {
		try {
			const readme = await readReadme(repo, local);
			const file = join(outDir, `${repo}.md`);
			const next = transform(repo, readme);
			let prev: string | undefined;
			try {
				prev = await readFile(file, "utf8");
			} catch {}
			if (prev === next) {
				console.log(`unchanged  reference/${repo}.md`);
			} else {
				await writeFile(file, next);
				console.log(`wrote      reference/${repo}.md`);
			}
		} catch (err) {
			failed++;
			console.error(`failed     ${repo}: ${(err as Error).message}`);
		}
	}
	if (failed > 0) process.exit(1);
}

if (import.meta.main) await main();
