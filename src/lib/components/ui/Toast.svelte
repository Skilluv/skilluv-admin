<script lang="ts">
	import { toast } from '$stores/toast.svelte';
	import type { Component } from 'svelte';
	import { CheckCircle2, XCircle, AlertTriangle, Info, X } from '@lucide/svelte';

	const typeStyles: Record<string, string> = {
		success: 'border-success/30 bg-success/10 text-success',
		error: 'border-error/30 bg-error/10 text-error',
		warning: 'border-warning/30 bg-warning/10 text-warning',
		info: 'border-info/30 bg-info/10 text-info'
	};

	const typeIcons: Record<string, Component> = {
		success: CheckCircle2,
		error: XCircle,
		warning: AlertTriangle,
		info: Info
	};
</script>

{#if toast.items.length > 0}
	<div class="fixed right-4 top-20 z-[100] flex flex-col gap-2" aria-live="polite">
		{#each toast.items as item (item.id)}
			{@const Icon = typeIcons[item.type]}
			<div
				class="flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg animate-[slide-up_200ms_ease-out] {typeStyles[item.type]}"
				role="alert"
			>
				<Icon size={18} strokeWidth={2} class="shrink-0" />
				<p class="flex-1 text-sm font-medium">{item.message}</p>
				<button
					class="shrink-0 opacity-60 hover:opacity-100"
					onclick={() => toast.dismiss(item.id)}
					aria-label="Fermer"
				>
					<X size={14} strokeWidth={2} />
				</button>
			</div>
		{/each}
	</div>
{/if}
