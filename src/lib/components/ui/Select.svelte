<script lang="ts" generics="T extends string | number">
	import { onMount, tick } from 'svelte';

	interface SelectItem {
		value: T;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		items: SelectItem[];
		value: T;
		onchange?: (v: T) => void;
		placeholder?: string;
		size?: 'sm' | 'md' | 'lg';
		/** Forme du bouton : "pill" (défaut, cohérent avec les filtres) ou "rounded" (assorti aux Input dans un formulaire). */
		shape?: 'pill' | 'rounded';
		disabled?: boolean;
		/** Ajoute un champ de recherche en haut du dropdown pour filtrer les items par label. Utile pour les listes longues (langues, secteurs, pays custom, etc.). */
		searchable?: boolean;
		/** Placeholder du champ de recherche quand `searchable` est actif. */
		searchPlaceholder?: string;
		class?: string;
	}

	let {
		items,
		value = $bindable(),
		onchange,
		placeholder = '',
		size = 'md',
		shape = 'pill',
		disabled = false,
		searchable = false,
		searchPlaceholder = '',
		class: className = ''
	}: Props = $props();

	let open = $state(false);
	let containerEl: HTMLDivElement | undefined = $state();
	let buttonEl: HTMLButtonElement | undefined = $state();
	let searchEl: HTMLInputElement | undefined = $state();
	let query = $state('');

	const sizes: Record<string, string> = {
		sm: 'h-8 px-3 text-xs',
		md: 'h-10 px-4 text-sm',
		lg: 'h-11 px-4 text-sm'
	};

	let currentLabel = $derived(items.find((it) => it.value === value)?.label ?? placeholder);

	// Filtrage insensible à la casse. Si `searchable` est false, on n'expose
	// qu'un unique passage direct par les items (pas d'allocation en plus).
	let visibleItems = $derived.by(() => {
		if (!searchable) return items;
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items.filter((it) => it.label.toLowerCase().includes(q));
	});

	function select(v: T) {
		value = v;
		open = false;
		query = '';
		onchange?.(v);
		buttonEl?.focus();
	}

	async function toggleOpen(e: MouseEvent) {
		// stopPropagation isole le toggle du listener document — indispensable
		// pour éviter que le click ne rebulle et déclenche outside-close
		// juste après le toggle (race condition observée sous Safari).
		e.stopPropagation();
		open = !open;
		if (open && searchable) {
			// Focus l'input de recherche dès l'ouverture — l'user peut taper
			// tout de suite sans passer par la souris.
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
		// `click` (pas `mousedown`) : garantit que l'onclick du trigger a
		// déjà fait son travail au moment où le listener document tourne.
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div bind:this={containerEl} class="relative inline-block {className}">
	<button
		bind:this={buttonEl}
		type="button"
		onclick={toggleOpen}
		{disabled}
		aria-expanded={open}
		aria-haspopup="listbox"
		class="inline-flex w-full items-center gap-2 {shape === 'rounded' ? 'rounded-xl' : 'rounded-full'} border border-border bg-surface-elevated {sizes[size]} font-medium text-text-primary transition-colors hover:border-primary/40 focus:outline-none focus:border-primary/60 disabled:opacity-50 disabled:cursor-not-allowed"
	>
		<span class="flex-1 text-left truncate">{currentLabel}</span>
		<svg
			class="h-3 w-3 shrink-0 transition-transform duration-200 {open ? 'rotate-180' : ''}"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path d="M3 4.5L6 7.5L9 4.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<div
			role="listbox"
			class="absolute left-0 top-full mt-2 min-w-full max-w-xs max-h-[min(60vh,20rem)] flex flex-col overscroll-contain rounded-xl border border-border bg-surface-elevated shadow-lg z-50 animate-[slide-up_150ms_ease-out]"
		>
			{#if searchable}
				<!-- Search header sticky — reste visible pendant le scroll de la liste. -->
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
					<button
						type="button"
						role="option"
						aria-selected={value === it.value}
						onclick={() => select(it.value)}
						disabled={it.disabled}
						class="flex w-full items-center rounded-lg px-3 py-2 text-sm text-left transition-colors duration-150 hover:bg-primary/10 hover:text-primary {value === it.value
							? 'bg-primary/10 text-primary font-semibold'
							: 'text-text-primary'} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
					>
						{it.label}
					</button>
				{:else}
					<p class="px-3 py-4 text-center text-xs text-text-muted">
						—
					</p>
				{/each}
			</div>
		</div>
	{/if}
</div>
