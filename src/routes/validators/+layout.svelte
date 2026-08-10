<script lang="ts">
	import { page } from '$app/stores';

	// SKI-99 — the validator corps has three distinct jobs (review inbound
	// candidacies, reach out to people, audit who currently holds a grant).
	// They share a header so switching between them keeps the context.

	let { children } = $props();

	const TABS = [
		{ href: '/validators/applications', label: 'Candidatures' },
		{ href: '/validators/invitations', label: 'Invitations' },
		{ href: '/validators/active', label: 'Validateurs actifs' }
	];

	let pathname = $derived($page.url.pathname);
</script>

<div class="p-6 lg:p-8">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-text-primary">Validateurs</h1>
		<p class="mt-1 max-w-3xl text-sm text-text-muted">
			Un validateur porte la capability <code class="font-mono">challenge_validator:{'{'}domaine{'}'}</code
			> et décide du succès d'un challenge. Deux voies d'accès : candidature spontanée soumise à des
			seuils, ou invitation admin qui les contourne.
		</p>
	</div>

	<nav class="mb-6 flex flex-wrap gap-1.5" aria-label="Sections validateurs">
		{#each TABS as tab (tab.href)}
			{@const active = pathname === tab.href}
			<a
				href={tab.href}
				aria-current={active ? 'page' : undefined}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors {active
					? 'bg-primary text-primary-fg'
					: 'border border-border text-text-muted hover:border-text-muted hover:text-text-primary'}"
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
