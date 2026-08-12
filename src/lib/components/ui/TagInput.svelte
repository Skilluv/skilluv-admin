<script lang="ts">
	import { X } from '@lucide/svelte';

	// Free-form tag input. Distinct from <MultiSelect>, which picks from a
	// closed list: here the values are arbitrary strings the operator types
	// (GitHub labels, orientation slugs). Enter or comma commits the draft,
	// Backspace on an empty draft removes the last chip.

	interface Props {
		/** Committed tags (bindable). */
		value: string[];
		onchange?: (v: string[]) => void;
		placeholder?: string;
		/** Optional shape guard applied before a tag is committed. Return a
		 *  message to reject the draft, or null to accept it. */
		validate?: (tag: string) => string | null;
		disabled?: boolean;
		id?: string;
		class?: string;
	}

	let {
		value = $bindable([]),
		onchange,
		placeholder = '',
		validate,
		disabled = false,
		id,
		class: className = ''
	}: Props = $props();

	let draft = $state('');
	let error = $state<string | null>(null);
	let inputEl: HTMLInputElement | undefined = $state();

	function commit() {
		const tag = draft.trim();
		if (!tag) return;
		if (value.includes(tag)) {
			// Silent no-op rather than an error: re-typing an existing tag is a
			// slip, not a mistake worth a red message.
			draft = '';
			return;
		}
		const problem = validate?.(tag) ?? null;
		if (problem) {
			error = problem;
			return;
		}
		value = [...value, tag];
		draft = '';
		error = null;
		onchange?.(value);
	}

	function remove(tag: string) {
		value = value.filter((t) => t !== tag);
		error = null;
		onchange?.(value);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			// Enter inside a <form> would submit it; the tag input owns the key.
			e.preventDefault();
			commit();
		} else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
			remove(value[value.length - 1]);
		}
	}
</script>

<div class={className}>
	<div
		class="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-surface-elevated px-2 py-1.5 transition-colors
			{error ? 'border-error' : 'border-border focus-within:border-primary'}
			{disabled ? 'opacity-50' : ''}"
		role="presentation"
		onclick={() => inputEl?.focus()}
	>
		{#each value as tag (tag)}
			<span
				class="inline-flex items-center gap-1 rounded-lg bg-surface-overlay px-2 py-0.5 font-mono text-xs text-text-primary"
			>
				{tag}
				<button
					type="button"
					{disabled}
					onclick={(e) => {
						e.stopPropagation();
						remove(tag);
					}}
					class="text-text-muted transition-colors hover:text-error"
					aria-label="Retirer {tag}"
				>
					<X size={12} strokeWidth={2.5} />
				</button>
			</span>
		{/each}
		<input
			bind:this={inputEl}
			{id}
			{disabled}
			type="text"
			bind:value={draft}
			{onkeydown}
			onblur={commit}
			placeholder={value.length === 0 ? placeholder : ''}
			class="min-w-32 flex-1 bg-transparent px-1 text-sm text-text-primary outline-none placeholder:text-text-muted"
		/>
	</div>
	{#if error}
		<p class="mt-1 text-xs text-error">{error}</p>
	{/if}
</div>
