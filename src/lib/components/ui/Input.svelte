<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		label?: string;
		error?: string;
		hint?: string;
		value?: string;
	}

	let {
		label,
		error,
		hint,
		type = 'text',
		id,
		value = $bindable(''),
		class: className = '',
		...rest
	}: Props = $props();

	let showPassword = $state(false);
	let inputId = $derived(id ?? label?.toLowerCase().replace(/\s+/g, '-') ?? crypto.randomUUID());
	let isPassword = $derived(type === 'password');
	let inputType = $derived(isPassword && showPassword ? 'text' : type);
</script>

<div class="flex flex-col gap-1.5 {className}">
	{#if label}
		<label for={inputId} class="text-sm font-medium text-text-primary">
			{label}
		</label>
	{/if}

	<div class="relative">
		<input
			id={inputId}
			type={inputType}
			bind:value
			class="h-11 w-full rounded-xl border bg-surface-elevated px-4 text-sm text-text-primary placeholder:text-text-muted transition-colors
				{error
				? 'border-error focus:border-error focus:ring-1 focus:ring-error'
				: 'border-border focus:border-primary focus:ring-1 focus:ring-primary'}
				{isPassword ? 'pr-11' : ''}"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
			{...rest}
		/>

		{#if isPassword}
			<button
				type="button"
				class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
				onclick={() => (showPassword = !showPassword)}
				aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
			>
				{#if showPassword}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
					</svg>
				{/if}
			</button>
		{/if}
	</div>

	{#if error}
		<p id="{inputId}-error" class="text-xs text-error" role="alert">{error}</p>
	{:else if hint}
		<p id="{inputId}-hint" class="text-xs text-text-muted">{hint}</p>
	{/if}
</div>
