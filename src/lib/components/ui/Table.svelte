<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Column {
		key: string;
		label: string;
		/** Alignement du contenu */
		align?: 'left' | 'right' | 'center';
		/** Largeur (Tailwind) */
		width?: string;
		/** Classe additionnelle sur la cellule */
		class?: string;
	}

	interface Props {
		columns: Column[];
		rows: Record<string, unknown>[];
		/** Snippet cellule : reçoit la row + la column, retourne le contenu */
		cell?: Snippet<[Record<string, unknown>, Column]>;
		/** Snippet row wrapper (ex: link entière) */
		rowWrapper?: Snippet<[Record<string, unknown>, Snippet]>;
		/** Message si rows vides */
		emptyLabel?: string;
		/** Hover subtle */
		hover?: boolean;
		class?: string;
	}

	let {
		columns,
		rows,
		cell,
		rowWrapper,
		emptyLabel = 'Aucun résultat',
		hover = true,
		class: className = ''
	}: Props = $props();

	function alignClass(a?: string): string {
		if (a === 'right') return 'text-right';
		if (a === 'center') return 'text-center';
		return 'text-left';
	}
</script>

<div class="overflow-hidden rounded-2xl border border-border bg-surface-elevated {className}">
	{#if rows.length === 0}
		<div class="p-8 text-center text-sm text-text-muted">{emptyLabel}</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-surface/40">
						{#each columns as col}
							<th
								class="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-text-muted {alignClass(col.align)}"
								style={col.width ? `width:${col.width}` : ''}
							>
								{col.label}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row, i}
						<tr
							class="border-b border-border last:border-b-0 transition-colors {hover
								? 'hover:bg-surface-overlay/40'
								: ''}"
						>
							{#each columns as col}
								<td class="px-4 py-3 {alignClass(col.align)} {col.class ?? ''}">
									{#if cell}
										{@render cell(row, col)}
									{:else}
										{row[col.key]}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
