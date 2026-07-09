<script lang="ts" generics="T extends string | number">
	import { onMount } from 'svelte';

	interface Item {
		value: T;
		label: string;
		/** Optionnel — libellé long affiché en tooltip natif quand le `label`
		 *  visible est tronqué (ex : « Intermed. » → title="Intermédiaire»). */
		title?: string;
		dot?: string;
	}

	interface Props {
		items: Item[];
		value: T;
		onchange?: (value: T) => void;
		size?: 'sm' | 'md';
		/** Force les items à tenir sur une seule ligne. Chaque item prend
		 *  1/N de la largeur du container (grid) et son texte est tronqué
		 *  avec ellipsis si nécessaire — utile dans un formulaire de modale
		 *  où le composant est contraint en largeur. */
		equal?: boolean;
		class?: string;
	}

	let {
		items,
		value = $bindable(),
		onchange,
		size = 'md',
		equal = false,
		class: className = ''
	}: Props = $props();

	const sizeClasses: Record<string, { item: string; gap: string }> = {
		sm: { item: 'px-3 py-1 text-xs', gap: 'gap-1.5' },
		md: { item: 'px-3 py-1.5 text-sm', gap: 'gap-1.5' }
	};

	let buttons = $state<HTMLButtonElement[]>([]);
	let indicatorStyle = $state('opacity:0;');
	let ready = $state(false);

	function updateIndicator() {
		const idx = items.findIndex((it) => it.value === value);
		const el = buttons[idx];
		if (!el || !el.isConnected) {
			indicatorStyle = 'opacity:0;';
			return;
		}
		const left = el.offsetLeft;
		const top = el.offsetTop;
		const width = el.offsetWidth;
		const height = el.offsetHeight;
		indicatorStyle = `transform: translate3d(${left}px, ${top}px, 0); width: ${width}px; height: ${height}px; opacity: 1;`;
	}

	$effect(() => {
		void value;
		void items;
		requestAnimationFrame(updateIndicator);
	});

	onMount(() => {
		requestAnimationFrame(() => {
			updateIndicator();
			ready = true;
		});
		const onResize = () => updateIndicator();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	function select(v: T) {
		value = v;
		onchange?.(v);
	}
</script>

<div
	class="relative {equal ? 'grid w-full' : 'inline-flex'} items-center gap-1 rounded-full border border-border bg-surface-elevated p-1 {className}"
	style={equal ? `grid-template-columns: repeat(${items.length}, minmax(0, 1fr));` : ''}
>
	<!-- Sliding indicator — pill inversée style header. Positionné en
	     translate3d(x, y) via updateIndicator, transitionné 300ms. -->
	<span
		aria-hidden="true"
		class="pointer-events-none absolute left-0 top-0 rounded-full bg-text-primary will-change-transform {ready ? 'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]' : ''}"
		style={indicatorStyle}
	></span>

	{#each items as item, i (item.value)}
		<button
			type="button"
			bind:this={buttons[i]}
			onclick={() => select(item.value)}
			title={item.title}
			class="relative z-10 flex min-w-0 items-center justify-center {sizeClasses[size].gap} rounded-full {sizeClasses[size].item} font-medium transition-colors duration-300 {value === item.value
				? 'text-surface'
				: 'text-text-muted hover:text-text-primary'}"
		>
			{#if item.dot}
				<span class="h-2 w-2 shrink-0 rounded-full {item.dot}"></span>
			{/if}
			<span class="{equal ? 'truncate' : ''}">{item.label}</span>
		</button>
	{/each}
</div>
