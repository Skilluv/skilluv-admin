<script lang="ts">
	interface Props {
		/** Petit label uppercase au-dessus de la valeur */
		label: string;
		/** Valeur mise en avant en très gros */
		value: string | number;
		/** Couleur de la valeur */
		color?: 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'error';
		/** Description / hint sous la valeur */
		hint?: string;
	}

	let { label, value, color = 'default', hint }: Props = $props();

	const colorClass: Record<string, string> = {
		default: 'text-text-primary',
		primary: 'text-primary',
		accent: 'text-accent',
		success: 'text-success',
		warning: 'text-warning',
		error: 'text-error'
	};
</script>

<div class="rounded-2xl border border-border bg-surface-elevated p-5">
	<p class="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
		{label}
	</p>
	<p class="text-3xl font-black tracking-tight tabular-nums {colorClass[color]}">
		{value}
	</p>
	{#if hint}
		<p class="mt-1 text-[11px] text-text-muted">{hint}</p>
	{/if}
</div>
