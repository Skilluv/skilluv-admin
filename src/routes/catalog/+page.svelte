<script lang="ts">
	import { i18n } from '$lib/i18n';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import OrientationsTab from '$components/admin/OrientationsTab.svelte';
	import BadgeRulesTab from '$components/admin/BadgeRulesTab.svelte';

	type Tab = 'orientations' | 'badge-rules';

	let activeTab = $state<Tab>('orientations');
</script>

<svelte:head>
	<title>{i18n.t('admin.catalog.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6 flex flex-col gap-2">
		<h1 class="text-2xl font-bold text-text-primary">{i18n.t('admin.catalog.title')}</h1>
		<p class="text-sm text-text-muted">{i18n.t('admin.catalog.subtitle')}</p>
	</div>

	<div class="mb-6">
		<SegmentedControl
			items={[
				{ value: 'orientations', label: i18n.t('admin.catalog.tabOrientations') },
				{ value: 'badge-rules', label: i18n.t('admin.catalog.tabBadgeRules') }
			]}
			bind:value={activeTab}
			size="md"
		/>
	</div>

	{#if activeTab === 'orientations'}
		<OrientationsTab />
	{:else}
		<BadgeRulesTab />
	{/if}
</div>
