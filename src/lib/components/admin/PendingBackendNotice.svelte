<script lang="ts">
	import { SkilluError } from '$api/client';
	import { PlugZap } from '@lucide/svelte';

	// P26 v2 ships the admin screens ahead of three backend endpoints
	// (SKI-106 / SKI-107 / SKI-108). Until they land, the calls come back 404
	// — that is an expected deployment state, not an incident, so the panel
	// says so plainly instead of firing an error toast the operator can't act
	// on. Any other failure is a real error and renders as one.

	interface Props {
		/** The error the section's loader caught. */
		error: unknown;
		/** Linear identifier of the ticket that delivers the endpoint. */
		ticket: string;
		/** `METHOD /path` of the endpoint being waited on. */
		endpoint: string;
		/** What the section will show once the endpoint answers. */
		description: string;
	}

	let { error, ticket, endpoint, description }: Props = $props();

	// A 404 (or a 405 from a path that exists with other verbs) means "not
	// deployed yet". A 403 means the admin gate refused — a real problem.
	const isNotDeployed = $derived(
		error instanceof SkilluError && (error.status === 404 || error.status === 405)
	);
	const message = $derived(
		error instanceof SkilluError ? error.message : 'Erreur inattendue au chargement.'
	);
</script>

<div
	class="rounded-2xl border border-border bg-surface-elevated/60 p-6 {isNotDeployed
		? ''
		: 'border-error/40'}"
>
	<div class="flex items-start gap-3">
		<span class="mt-0.5 {isNotDeployed ? 'text-text-muted' : 'text-error'}">
			<PlugZap size={18} strokeWidth={2} />
		</span>
		<div class="min-w-0">
			{#if isNotDeployed}
				<p class="text-sm font-semibold text-text-primary">
					Endpoint backend pas encore déployé
				</p>
				<p class="mt-1 text-sm text-text-muted">{description}</p>
				<p class="mt-3 font-mono text-xs text-text-muted">
					{endpoint}
					<span class="ml-2 rounded-md bg-surface-overlay px-1.5 py-0.5">{ticket}</span>
				</p>
			{:else}
				<p class="text-sm font-semibold text-error">Chargement impossible</p>
				<p class="mt-1 text-sm text-text-muted">{message}</p>
				<p class="mt-3 font-mono text-xs text-text-muted">{endpoint}</p>
			{/if}
		</div>
	</div>
</div>
