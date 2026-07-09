<script lang="ts">
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let currentPath = $state('');
	let transitioning = $state(false);

	$effect(() => {
		const newPath = $page.url.pathname;
		if (currentPath && newPath !== currentPath) {
			transitioning = true;
			setTimeout(() => {
				transitioning = false;
			}, 200);
		}
		currentPath = newPath;
	});
</script>

<div
	class="transition-opacity duration-200 ease-out {transitioning ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}"
	class:transition-transform={transitioning}
>
	{@render children()}
</div>
