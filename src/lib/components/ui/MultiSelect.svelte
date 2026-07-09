<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { i18n } from '$lib/i18n';
	import { Check, X } from '@lucide/svelte';

	// MultiSelect générique. Affiche les valeurs sélectionnées en chips dans
	// le trigger, avec X individuel pour retirer chaque item. Le dropdown
	// contient un input de recherche optionnel + la liste avec checkboxes.
	//
	// Compat pattern Select : `size`, `shape`, `class`, `searchable`,
	// `searchPlaceholder` — même API pour rester prévisible côté appelant.

	interface Item {
		value: string;
		label: string;
	}

	interface Props {
		items: Item[];
		/** Valeurs sélectionnées (bindable). */
		value: string[];
		onchange?: (v: string[]) => void;
		placeholder?: string;
		size?: 'sm' | 'md' | 'lg';
		shape?: 'pill' | 'rounded';
		disabled?: boolean;
		searchable?: boolean;
		searchPlaceholder?: string;
		/** Nombre max de chips affichées dans le trigger avant collapse en "+N". */
		maxChips?: number;
		class?: string;
	}

	let {
		items,
		value = $bindable([]),
		onchange,
		placeholder = '',
		size = 'md',
		shape = 'pill',
		disabled = false,
		searchable = false,
		searchPlaceholder = '',
		maxChips = 3,
		class: className = ''
	}: Props = $props();

	let open = $state(false);
	let containerEl: HTMLDivElement | undefined = $state();
	let buttonEl: HTMLDivElement | undefined = $state();
	let searchEl: HTMLInputElement | undefined = $state();
	let query = $state('');

	const sizes: Record<string, string> = {
		sm: 'min-h-8 px-2 text-xs',
		md: 'min-h-10 px-2.5 text-sm',
		lg: 'min-h-11 px-2.5 text-sm'
	};

	// Map value → label pour un lookup O(1) lors du rendu des chips.
	let labelMap = $derived(new Map(items.map((it) => [it.value, it.label])));

	let visibleItems = $derived.by(() => {
		if (!searchable) return items;
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items.filter((it) => it.label.toLowerCase().includes(q));
	});

	let visibleChips = $derived(value.slice(0, maxChips));
	let overflowCount = $derived(Math.max(0, value.length - maxChips));

	function toggleValue(v: string) {
		if (value.includes(v)) {
			value = value.filter((x) => x !== v);
		} else {
			value = [...value, v];
		}
		onchange?.(value);
	}

	function removeChip(e: MouseEvent, v: string) {
		e.stopPropagation();
		value = value.filter((x) => x !== v);
		onchange?.(value);
	}

	function clearAll(e: MouseEvent) {
		e.stopPropagation();
		value = [];
		query = '';
		onchange?.(value);
	}

	async function toggleOpen(e: Event) {
		e.stopPropagation();
		open = !open;
		if (open && searchable) {
			await tick();
			searchEl?.focus();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			open = false;
			query = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			query = '';
			buttonEl?.focus();
		}
	}

	onMount(() => {
		// `click` (pas `mousedown`) — le toggle du trigger a le temps de
		// s'exécuter avant l'outside-close.
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div bind:this={containerEl} class="relative inline-block {className}">
	<!--
		Le trigger est un <div role="combobox"> plutôt qu'un <button> parce qu'il
		contient les chips supprimables (chaque chip a son propre <button>) et
		imbriquer <button> dans <button> est invalide en HTML — le browser
		déplace les nœuds au parsing, ce qui casse l'hydratation Svelte.
	-->
	<div
		bind:this={buttonEl}
		role="combobox"
		tabindex={disabled ? -1 : 0}
		aria-expanded={open}
		aria-haspopup="listbox"
		aria-controls="multiselect-listbox"
		aria-disabled={disabled}
		onclick={toggleOpen}
		onkeydown={(e) => {
			if (disabled) return;
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleOpen(e);
			}
		}}
		class="flex w-full items-center gap-1.5 {shape === 'rounded' ? 'rounded-xl' : 'rounded-full'} border border-border bg-surface-elevated {sizes[size]} py-1.5 text-left font-medium text-text-primary transition-colors hover:border-primary/40 focus:outline-none focus:border-primary/60 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed cursor-pointer"
	>
		{#if value.length === 0}
			<span class="flex-1 truncate px-1.5 text-text-muted">{placeholder}</span>
		{:else}
			<div class="flex flex-1 flex-wrap items-center gap-1 overflow-hidden">
				{#each visibleChips as v (v)}
					<span class="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
						{labelMap.get(v) ?? v}
						<button
							type="button"
							onclick={(e) => removeChip(e, v)}
							aria-label={i18n.locale === 'fr' ? 'Retirer' : 'Remove'}
							class="rounded hover:bg-primary/20"
						>
							<X size={10} strokeWidth={2.5} />
						</button>
					</span>
				{/each}
				{#if overflowCount > 0}
					<span class="rounded-md bg-surface-overlay px-1.5 py-0.5 text-xs font-medium text-text-muted">
						+{overflowCount}
					</span>
				{/if}
			</div>
		{/if}

		{#if value.length > 0}
			<button
				type="button"
				onclick={clearAll}
				aria-label={i18n.locale === 'fr' ? 'Tout retirer' : 'Clear all'}
				class="shrink-0 rounded-full p-0.5 text-text-muted hover:bg-surface-overlay hover:text-text-primary"
			>
				<X size={12} strokeWidth={2} />
			</button>
		{/if}

		<svg
			class="ml-0.5 h-3 w-3 shrink-0 transition-transform duration-200 {open ? 'rotate-180' : ''}"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path d="M3 4.5L6 7.5L9 4.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</div>

	{#if open}
		<div
			role="listbox"
			aria-multiselectable="true"
			class="absolute left-0 top-full z-50 mt-2 flex max-h-[min(60vh,20rem)] min-w-full max-w-xs flex-col overscroll-contain rounded-xl border border-border bg-surface-elevated shadow-lg animate-[slide-up_150ms_ease-out]"
		>
			{#if searchable}
				<div class="shrink-0 border-b border-border p-1.5">
					<input
						bind:this={searchEl}
						type="text"
						bind:value={query}
						placeholder={searchPlaceholder}
						class="h-8 w-full rounded-lg border border-transparent bg-surface-overlay px-2.5 text-xs placeholder:text-text-muted focus:border-primary focus:outline-none"
					/>
				</div>
			{/if}

			<div class="flex-1 overflow-y-auto p-1">
				{#each visibleItems as it (it.value)}
					{@const checked = value.includes(it.value)}
					<button
						type="button"
						role="option"
						aria-selected={checked}
						onclick={() => toggleValue(it.value)}
						class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-left transition-colors duration-150 hover:bg-primary/10 {checked
							? 'text-primary font-semibold'
							: 'text-text-primary'}"
					>
						<span
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors {checked
								? 'border-primary bg-primary text-primary-fg'
								: 'border-border bg-surface-elevated'}"
							aria-hidden="true"
						>
							{#if checked}
								<Check size={10} strokeWidth={3} />
							{/if}
						</span>
						<span class="truncate">{it.label}</span>
					</button>
				{:else}
					<p class="px-3 py-4 text-center text-xs text-text-muted">—</p>
				{/each}
			</div>
		</div>
	{/if}
</div>
