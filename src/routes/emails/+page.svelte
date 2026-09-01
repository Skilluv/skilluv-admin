<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { emailPreviewApi, type PreviewableKind } from '$api/money';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { ChevronRight, RefreshCw, Mail, ExternalLink } from '@lucide/svelte';

	let kinds = $state<PreviewableKind[]>([]);
	let locales = $state<string[]>([]);
	let themes = $state<string[]>([]);
	let loading = $state(true);

	let selectedKind = $state('');
	let selectedLocale = $state('');
	let selectedTheme = $state('');
	let search = $state('');

	let emailable = $derived(kinds.filter((k) => k.sends_email));
	let filtered = $derived(
		search.trim()
			? emailable.filter((k) => k.kind.includes(search.trim().toLowerCase()))
			: emailable
	);

	/** Grouped by catalogue category, in the order the backend listed them. */
	let grouped = $derived.by(() => {
		const buckets = new Map<string, PreviewableKind[]>();
		for (const k of filtered) {
			const list = buckets.get(k.category) ?? [];
			list.push(k);
			buckets.set(k.category, list);
		}
		return [...buckets.entries()];
	});

	let previewUrl = $derived(
		selectedKind ? emailPreviewApi.url(selectedKind, selectedLocale, selectedTheme) : ''
	);

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await emailPreviewApi.index();
			kinds = res.data.kinds;
			locales = res.data.locales;
			themes = res.data.themes;
			selectedLocale ||= locales[0] ?? '';
			selectedTheme ||= themes[0] ?? '';
			selectedKind ||= kinds.find((k) => k.sends_email)?.kind ?? '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}
</script>

<div class="mx-auto max-w-7xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.nav.emails')}</span>
	</nav>

	<div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.emails.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
				{i18n.t('admin.emails.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.emails.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	{#if loading}
		<Skeleton class="h-96 w-full" rounded="xl" />
	{:else}
		<div class="grid gap-6 lg:grid-cols-[320px_1fr]">
			<aside class="rounded-2xl border border-border bg-surface-elevated p-4">
				<input
					type="search"
					bind:value={search}
					placeholder={i18n.t('admin.emails.search')}
					data-testid="email-search"
					class="mb-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
				/>

				<div class="mb-4 flex flex-col gap-2">
					<Select
						items={locales.map((l) => ({ value: l, label: l }))}
						bind:value={selectedLocale}
						size="sm"
						shape="rounded"
					/>
					<Select
						items={themes.map((t) => ({ value: t, label: t }))}
						bind:value={selectedTheme}
						size="sm"
						shape="rounded"
					/>
				</div>

				<div class="max-h-[60vh] overflow-y-auto">
					{#each grouped as [category, list] (category)}
						<p class="mt-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
							{category}
						</p>
						{#each list as k (k.kind)}
							<button
								type="button"
								onclick={() => (selectedKind = k.kind)}
								data-testid="email-kind-{k.kind}"
								class="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-overlay {selectedKind ===
								k.kind
									? 'bg-surface-overlay text-text-primary'
									: 'text-text-muted'}"
							>
								<span class="truncate font-mono">{k.kind}</span>
								{#if k.untranslated.length > 0}
									<!-- A missing translation renders the subject as its own
									     key. Flagged in the list, because that is where it
									     can be seen before a send rather than after. -->
									<Badge variant="warning" size="sm">{k.untranslated.join(' ')}</Badge>
								{/if}
							</button>
						{/each}
					{/each}

					{#if grouped.length === 0}
						<p class="py-6 text-center text-sm text-text-muted">
							{i18n.t('admin.emails.noKinds')}
						</p>
					{/if}
				</div>
			</aside>

			<section class="rounded-2xl border border-border bg-surface-elevated p-4">
				{#if !selectedKind}
					<div class="py-20 text-center">
						<Mail size={32} strokeWidth={2} class="mx-auto mb-3 text-text-muted" />
						<p class="text-text-muted">{i18n.t('admin.emails.pick')}</p>
					</div>
				{:else}
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
						<code class="font-mono text-xs text-text-muted">{selectedKind}</code>
						<!-- A plain anchor rather than Button: the preview has to
						     open in its own tab, and Button does not carry
						     `target`. -->
						<a
							href={previewUrl}
							target="_blank"
							rel="noopener"
							data-testid="email-open-tab"
							class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
						>
							<ExternalLink size={14} strokeWidth={2} />
							{i18n.t('admin.emails.openTab')}
						</a>
					</div>
					<!-- An iframe, not injected markup: the response is a whole
					     document with its own styles, and letting them into this
					     page would restyle the admin around it. -->
					<iframe
						src={previewUrl}
						title={selectedKind}
						data-testid="email-preview-frame"
						class="h-[70vh] w-full rounded-xl border border-border bg-white"
					></iframe>
				{/if}
			</section>
		</div>
	{/if}
</div>
