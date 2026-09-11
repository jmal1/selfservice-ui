<script lang="ts">
	import CrucibleLogo from '$lib/components/CrucibleLogo.svelte';

	const repoBase = 'https://github.com/jmal1/selfservice-api';
	const agentsUrl = `${repoBase}/blob/main/AGENTS.md`;
	const agentsRawUrl = `https://raw.githubusercontent.com/jmal1/selfservice-api/main/AGENTS.md`;
	const promptUrl = `${repoBase}/blob/main/docs/ai-prompts/build-workflow.md`;
	const promptRawUrl = `https://raw.githubusercontent.com/jmal1/selfservice-api/main/docs/ai-prompts/build-workflow.md`;

	const tools = [
		{
			name: 'GitHub Copilot CLI',
			id: 'copilot-cli',
			install: 'gh extension install github/gh-copilot',
			wire: 'Copilot CLI auto-discovers AGENTS.md in your working directory. Clone selfservice-api and run gh copilot suggest from inside the repo.',
			docs: 'https://docs.github.com/en/copilot/github-copilot-in-the-cli'
		},
		{
			name: 'GitHub Copilot (VS Code / IDEs)',
			id: 'copilot-vscode',
			install: 'Install the GitHub Copilot extension from the marketplace.',
			wire: 'Open selfservice-api in VS Code. Copilot reads .github/copilot-instructions.md automatically, which points it at AGENTS.md. No additional setup.',
			docs: 'https://docs.github.com/en/copilot/using-github-copilot/asking-github-copilot-questions-in-your-ide'
		},
		{
			name: 'Claude Code (Anthropic CLI)',
			id: 'claude-code',
			install: 'npm install -g @anthropic-ai/claude-code',
			wire: 'Claude Code reads CLAUDE.md and AGENTS.md from the repo root. Clone selfservice-api, cd in, run claude.',
			docs: 'https://docs.anthropic.com/en/docs/claude-code'
		},
		{
			name: 'Codex CLI (OpenAI)',
			id: 'codex',
			install: 'npm install -g @openai/codex',
			wire: 'Codex reads AGENTS.md automatically. Same workflow as Claude Code — clone and run from inside the repo.',
			docs: 'https://github.com/openai/codex'
		},
		{
			name: 'Cursor / Windsurf / Other AI-aware editors',
			id: 'cursor',
			install: 'See the editor\u2019s own install instructions.',
			wire: 'Open selfservice-api as the workspace. AGENTS.md at the repo root is auto-discovered by most modern AI editors.',
			docs: 'https://docs.cursor.com/'
		},
		{
			name: 'Anything else (Claude.ai, ChatGPT, Gemini\u2026)',
			id: 'web',
			install: 'No install required.',
			wire: `Open ${promptUrl} and paste the entire file as the first message in your chat. Then describe the assessment you want.`,
			docs: agentsUrl
		}
	];
</script>

<svelte:head>
	<title>Crucible — AI Authoring Guide</title>
	<meta
		name="description"
		content="Use AI tools (Copilot, Claude, Codex, etc.) to author Crucible workflows, actions, and playlists. Canonical reference documents + per-tool wiring instructions."
	/>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
	<header class="space-y-2">
		<div class="flex items-center gap-3">
			<CrucibleLogo />
			<h1 class="text-3xl font-bold">Crucible AI Authoring</h1>
		</div>
		<p class="text-surface-600-400">
			Use the AI coding assistant you already use to author Crucible workflows,
			actions, and playlists — without learning a new schema by hand.
		</p>
	</header>

	<section
		class="rounded-lg border border-primary-500/30 bg-primary-50-950/30 p-5"
	>
		<h2 class="mb-2 text-xl font-semibold">TL;DR</h2>
		<ol class="ml-5 list-decimal space-y-1 text-sm">
			<li>
				Open the canonical reference:
				<a class="text-primary-500 underline" href={agentsUrl} target="_blank" rel="noreferrer">
					AGENTS.md
				</a>
				(or
				<a class="text-primary-500 underline" href={agentsRawUrl} target="_blank" rel="noreferrer">
					raw
				</a>).
			</li>
			<li>
				Pick your AI tool below and follow the 1-line wiring instruction.
			</li>
			<li>
				Optional, but recommended: paste
				<a class="text-primary-500 underline" href={promptUrl} target="_blank" rel="noreferrer">
					docs/ai-prompts/build-workflow.md
				</a>
				as the first message to the AI, then describe your assessment.
			</li>
			<li>Review the AI's output, validate with shellcheck in the admin UI, and submit.</li>
		</ol>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold">Why this exists</h2>
		<p class="text-sm text-surface-700-300">
			Crucible's workflow/action/playlist schema is small but precise. Asking
			a freshly-prompted AI to author one from scratch usually produces
			plausible-looking JSON that the API rejects (invented enum values,
			missing required fields, wrong execution mode). The
			<code class="rounded bg-surface-200-800 px-1 py-0.5">AGENTS.md</code>
			file in the
			<a class="text-primary-500 underline" href={repoBase} target="_blank" rel="noreferrer">
				selfservice-api repo
			</a>
			is the canonical, machine-readable reference. Every AI tool listed
			below either auto-discovers it or can be pointed at it with a one-line
			tweak.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold">Pick your AI tool</h2>
		<div class="grid gap-4 md:grid-cols-2">
			{#each tools as tool (tool.id)}
				<article
					class="rounded-lg border border-surface-300-700 bg-surface-50-950 p-4"
				>
					<h3 class="mb-2 font-semibold">{tool.name}</h3>
					<div class="space-y-2 text-sm">
						<div>
							<span class="font-medium text-surface-500">Install:</span>
							<code class="ml-1 break-all rounded bg-surface-200-800 px-1 py-0.5 text-xs"
								>{tool.install}</code
							>
						</div>
						<div>
							<span class="font-medium text-surface-500">Wire:</span>
							<span class="text-surface-700-300">{tool.wire}</span>
						</div>
						<div>
							<a
								class="text-xs text-primary-500 underline"
								href={tool.docs}
								target="_blank"
								rel="noreferrer">Docs →</a
							>
						</div>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold">Canonical references</h2>
		<ul class="ml-5 list-disc space-y-2 text-sm">
			<li>
				<a class="text-primary-500 underline" href={agentsUrl} target="_blank" rel="noreferrer">
					AGENTS.md
				</a>
				— full schema for workflows, actions, playlists, the bash runtime
				contract, action library, anti-patterns, validator rules. <strong>Start here.</strong>
			</li>
			<li>
				<a class="text-primary-500 underline" href={promptUrl} target="_blank" rel="noreferrer">
					docs/ai-prompts/build-workflow.md
				</a>
				— a paste-into-AI prompt template that primes the assistant with all the rules and
				output expectations.
			</li>
			<li>
				<a
					class="text-primary-500 underline"
					href={`${repoBase}/blob/main/.github/copilot-instructions.md`}
					target="_blank"
					rel="noreferrer"
				>
					.github/copilot-instructions.md
				</a>
				— VS Code Copilot adapter that points back at AGENTS.md.
			</li>
			<li>
				<a
					class="text-primary-500 underline"
					href={`${repoBase}/blob/main/CLAUDE.md`}
					target="_blank"
					rel="noreferrer">CLAUDE.md</a
				>
				— Claude Code adapter (single-line pointer to AGENTS.md).
			</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-xl font-semibold">Validation safety net</h2>
		<p class="text-sm text-surface-700-300">
			Anything the AI hands you is still untrusted text. Crucible runs two
			validation layers on every script:
		</p>
		<ul class="ml-5 list-disc space-y-1 text-sm text-surface-700-300">
			<li>
				<strong>Client-side, every keystroke (sh-syntax WASM):</strong> catches missing keywords,
				unclosed quotes, parser errors. Runs entirely in your browser — your script does not leave
				the page.
			</li>
			<li>
				<strong>Server-side, on Save (shellcheck):</strong> catches the full SC**** rule set
				(unused vars, dangerous expansions, wrong test brackets, etc.). Runs as a static
				parser only — your script is never executed.
			</li>
		</ul>
		<p class="text-sm text-surface-700-300">
			If the validator flags something the AI swears is correct, the
			validator is usually right.
		</p>
	</section>

	<footer class="border-t border-surface-300-700 pt-4 text-xs text-surface-500">
		Crucible · <a class="underline" href="/">Back to lab</a> ·
		<a class="underline" href={repoBase} target="_blank" rel="noreferrer">Source</a>
	</footer>
</div>
