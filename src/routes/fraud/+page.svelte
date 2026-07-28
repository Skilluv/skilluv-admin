<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type {
		FraudFlaggedDeliverable,
		FraudSuspectedUser,
		FraudSuspectGroup,
		FraudScanOutcome,
		FraudLlmEvaluation
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Table from '$components/ui/Table.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Fingerprint, RefreshCw, Sparkles, ShieldCheck, Info } from '@lucide/svelte';

	type Tab = 'plagiarism' | 'multi' | 'eval';
	let tab = $state<Tab>('plagiarism');

	// Queue state
	let loading = $state(true);
	let flagged = $state<FraudFlaggedDeliverable[]>([]);
	let suspected = $state<FraudSuspectedUser[]>([]);
	let threshold = $state(0.9);
	let limit = $state(50);

	// Row-level busy tracking
	let busyDeliverable = $state<string | null>(null);
	let busyUser = $state<string | null>(null);

	// Revoke dialog
	let revokeTarget = $state<FraudFlaggedDeliverable | null>(null);
	let revoking = $state(false);

	// Multi-account detection
	let windowHours = $state(24);
	let minGroupSize = $state(3);
	let detecting = $state(false);
	let lastDetection = $state<{
		groups_detected: number;
		users_flagged: number;
		groups: FraudSuspectGroup[];
	} | null>(null);

	// Deliverable eval
	let evalDeliverableId = $state('');
	let evalThreshold = $state(0.9);
	let evalWindowDays = $state(30);
	let scanning = $state(false);
	let llmEvaluating = $state(false);
	let deepScanning = $state(false);
	let scanResult = $state<FraudScanOutcome | null>(null);
	let llmResult = $state<FraudLlmEvaluation | null>(null);
	let deepScanResult = $state<{
		deliverable_id: string;
		deep_plagiarism: {
			similarity_score?: number;
			verdict?: string;
			flagged_at?: string;
			comparison_pool_size?: number;
		};
	} | null>(null);

	async function loadQueue() {
		loading = true;
		try {
			const res = await adminApi.fraudQueue({ threshold, limit });
			flagged = res.data.flagged_deliverables;
			suspected = res.data.suspected_users;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void loadQueue();
	});

	async function markDeliverableValid(id: string) {
		busyDeliverable = id;
		try {
			await adminApi.markDeliverableValid(id);
			flagged = flagged.filter((f) => f.deliverable_id !== id);
			toast.success(i18n.t('admin.fraud.markedValidToast'));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			busyDeliverable = null;
		}
	}

	function requestRevoke(row: FraudFlaggedDeliverable) {
		revokeTarget = row;
	}

	async function confirmRevoke(reason: string) {
		if (!revokeTarget) return;
		const id = revokeTarget.deliverable_id;
		revoking = true;
		try {
			await adminApi.revokeDeliverable(id, reason);
			flagged = flagged.filter((f) => f.deliverable_id !== id);
			toast.success(i18n.t('admin.fraud.revokedToast'));
			revokeTarget = null;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			revoking = false;
		}
	}

	async function markUserValid(id: string) {
		busyUser = id;
		try {
			await adminApi.markUserValid(id);
			suspected = suspected.filter((u) => u.user_id !== id);
			toast.success(i18n.t('admin.fraud.userMarkedValidToast'));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			busyUser = null;
		}
	}

	async function runDetection() {
		if (detecting) return;
		detecting = true;
		try {
			const res = await adminApi.detectMultiAccounts({
				window_hours: windowHours,
				min_group_size: minGroupSize
			});
			lastDetection = res.data;
			await loadQueue();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			detecting = false;
		}
	}

	async function scanDeliverable() {
		const id = evalDeliverableId.trim();
		if (!id || scanning) return;
		scanning = true;
		try {
			const res = await adminApi.scanDeliverable(id, {
				threshold: evalThreshold,
				window_days: evalWindowDays
			});
			scanResult = res.data;
			toast.success(i18n.t('admin.fraud.evalScanSuccessToast'));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			scanning = false;
		}
	}

	async function llmEvaluate() {
		const id = evalDeliverableId.trim();
		if (!id || llmEvaluating) return;
		llmEvaluating = true;
		try {
			const res = await adminApi.llmEvaluateDeliverable(id);
			llmResult = res.data;
			if (!res.data.llm_reachable) {
				toast.warning(i18n.t('admin.fraud.evalLlmUnreachable'));
			} else {
				toast.success(i18n.t('admin.fraud.evalLlmSuccessToast'));
			}
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			llmEvaluating = false;
		}
	}

	async function runDeepScan() {
		const id = evalDeliverableId.trim();
		if (!id || deepScanning) return;
		deepScanning = true;
		toast.info(i18n.t('admin.deepScan.runningToast'));
		try {
			const res = await adminApi.deepScanDeliverable(id, {
				threshold: evalThreshold,
				window_days: evalWindowDays
			});
			deepScanResult = res.data;
			toast.success(i18n.t('admin.deepScan.successToast'));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			deepScanning = false;
		}
	}

	function scoreVariant(raw: string | number): 'error' | 'warning' | 'default' {
		const n = typeof raw === 'string' ? Number(raw) : raw;
		if (Number.isNaN(n)) return 'default';
		if (n >= 0.9) return 'error';
		if (n >= 0.7) return 'warning';
		return 'default';
	}

	function fmtScore(raw: string | number): string {
		const n = typeof raw === 'string' ? Number(raw) : raw;
		if (Number.isNaN(n)) return String(raw);
		return n.toFixed(3);
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleString(intlLocale());
		} catch {
			return iso;
		}
	}

	const flaggedColumns = [
		{ key: 'deliverable_id', label: i18n.t('admin.fraud.colDeliverable') },
		{ key: 'plagiarism_score', label: i18n.t('admin.fraud.colScore'), width: '110px' },
		{ key: 'similar_to', label: i18n.t('admin.fraud.colSimilarTo') },
		{ key: 'actions', label: i18n.t('admin.common.actions'), align: 'right' as const, width: '220px' }
	];

	const suspectedColumns = [
		{ key: 'user_id', label: i18n.t('admin.fraud.colUser') },
		{ key: 'flagged_at', label: i18n.t('admin.fraud.colFlaggedAt'), width: '200px' },
		{ key: 'reason', label: i18n.t('admin.fraud.colReason') },
		{ key: 'actions', label: i18n.t('admin.common.actions'), align: 'right' as const, width: '160px' }
	];
</script>

<svelte:head>
	<title>{i18n.t('admin.fraud.title')} — Admin Skilluv</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10">
	<div class="mb-6 flex items-start gap-3">
		<Fingerprint size={24} strokeWidth={2} class="mt-1 text-accent" />
		<div>
			<h1 class="text-2xl font-black tracking-tight">{i18n.t('admin.fraud.title')}</h1>
			<p class="mt-1 text-sm text-text-muted">{i18n.t('admin.fraud.subtitle')}</p>
		</div>
	</div>

	<div class="mb-6">
		<SegmentedControl
			size="md"
			items={[
				{ value: 'plagiarism', label: i18n.t('admin.fraud.tabPlagiarism') },
				{ value: 'multi', label: i18n.t('admin.fraud.tabMultiAccount') },
				{ value: 'eval', label: i18n.t('admin.fraud.tabEval') }
			]}
			bind:value={tab}
		/>
	</div>

	<p class="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning">
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.fraud.auditGap')}</span>
	</p>

	{#if tab === 'plagiarism'}
		<div class="mb-4 flex flex-wrap items-end gap-3">
			<Input
				label={i18n.t('admin.fraud.thresholdLabel')}
				type="number"
				step="0.01"
				min="0"
				max="1"
				bind:value={threshold as unknown as string}
				class="w-32"
			/>
			<Input
				label={i18n.t('admin.fraud.limitLabel')}
				type="number"
				step="1"
				min="1"
				max="200"
				bind:value={limit as unknown as string}
				class="w-28"
			/>
			<Button variant="primary" size="sm" onclick={loadQueue} loading={loading}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.fraud.applyBtn')}
			</Button>
		</div>

		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.fraud.flaggedTitle')}
		</h2>

		{#if loading}
			<Skeleton class="h-40 w-full" rounded="xl" />
		{:else}
			<Table columns={flaggedColumns} rows={flagged as unknown as Record<string, unknown>[]} emptyLabel={i18n.t('admin.fraud.emptyFlagged')}>
				{#snippet cell(row, col)}
					{#if col.key === 'deliverable_id'}
						<code class="font-mono text-xs text-text-primary">{row.deliverable_id}</code>
					{:else if col.key === 'plagiarism_score'}
						<Badge variant={scoreVariant(row.plagiarism_score as string | number)}>
							{fmtScore(row.plagiarism_score as string | number)}
						</Badge>
					{:else if col.key === 'similar_to'}
						{#if row.similar_to}
							<code class="font-mono text-xs text-text-muted">{row.similar_to}</code>
						{:else}
							<span class="text-text-muted">—</span>
						{/if}
					{:else if col.key === 'actions'}
						<div class="flex justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => markDeliverableValid(row.deliverable_id as string)}
								loading={busyDeliverable === row.deliverable_id}
							>
								<ShieldCheck size={14} strokeWidth={2} />
								{i18n.t('admin.fraud.actionMarkValid')}
							</Button>
							<Button
								variant="danger"
								size="sm"
								onclick={() => requestRevoke(row as unknown as FraudFlaggedDeliverable)}
							>
								{i18n.t('admin.fraud.actionRevoke')}
							</Button>
						</div>
					{/if}
				{/snippet}
			</Table>
		{/if}
	{:else if tab === 'multi'}
		<div class="mb-4 flex flex-wrap items-end gap-3">
			<Button variant="primary" size="sm" onclick={loadQueue} loading={loading}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.fraud.refreshBtn')}
			</Button>
		</div>

		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.fraud.suspectedTitle')}
		</h2>

		{#if loading}
			<Skeleton class="h-40 w-full" rounded="xl" />
		{:else}
			<Table columns={suspectedColumns} rows={suspected as unknown as Record<string, unknown>[]} emptyLabel={i18n.t('admin.fraud.emptySuspected')}>
				{#snippet cell(row, col)}
					{#if col.key === 'user_id'}
						<a href={`/users/${row.user_id}`} class="font-mono text-xs text-primary hover:underline">
							{row.user_id}
						</a>
					{:else if col.key === 'flagged_at'}
						<span class="text-xs text-text-muted">{fmtDate(row.flagged_at as string | null)}</span>
					{:else if col.key === 'reason'}
						<span class="text-xs text-text-muted">{row.reason ?? '—'}</span>
					{:else if col.key === 'actions'}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => markUserValid(row.user_id as string)}
							loading={busyUser === row.user_id}
						>
							<ShieldCheck size={14} strokeWidth={2} />
							{i18n.t('admin.fraud.actionMarkValid')}
						</Button>
					{/if}
				{/snippet}
			</Table>
		{/if}

		<section class="mt-8 rounded-2xl border border-border bg-surface-elevated p-5">
			<h3 class="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
				<Fingerprint size={14} strokeWidth={2} />
				{i18n.t('admin.fraud.detectTitle')}
			</h3>
			<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.fraud.detectHint')}</p>

			<div class="flex flex-wrap items-end gap-3">
				<Input
					label={i18n.t('admin.fraud.detectWindowLabel')}
					type="number"
					step="1"
					min="1"
					bind:value={windowHours as unknown as string}
					class="w-32"
				/>
				<Input
					label={i18n.t('admin.fraud.detectMinGroupLabel')}
					type="number"
					step="1"
					min="2"
					bind:value={minGroupSize as unknown as string}
					class="w-32"
				/>
				<Button variant="accent" size="sm" onclick={runDetection} loading={detecting}>
					<Sparkles size={14} strokeWidth={2} />
					{i18n.t('admin.fraud.detectRunBtn')}
				</Button>
			</div>

			{#if lastDetection}
				<div class="mt-4 rounded-xl border border-border bg-surface-overlay p-4">
					<p class="mb-2 text-xs uppercase tracking-wider text-text-muted">
						{i18n.t('admin.fraud.detectResultTitle')}
					</p>
					<div class="mb-3 flex flex-wrap gap-2">
						<Badge variant="primary">{lastDetection.groups_detected} {i18n.t('admin.fraud.detectGroupsFound')}</Badge>
						<Badge variant="warning">{lastDetection.users_flagged} {i18n.t('admin.fraud.detectUsersFlagged')}</Badge>
					</div>
					<p class="mb-3 text-xs text-text-muted">{i18n.t('admin.fraud.detectGroupHint')}</p>

					{#if lastDetection.groups.length > 0}
						<ul class="flex flex-col gap-2">
							{#each lastDetection.groups as g, i (i)}
								<li class="rounded-lg bg-surface-elevated px-3 py-2 text-xs">
									<div class="mb-1 flex flex-wrap gap-3 text-text-muted">
										<span>ip#: <code class="font-mono">{g.shared_ip.slice(0, 12)}…</code></span>
										<span>ua#: <code class="font-mono">{g.shared_ua.slice(0, 12)}…</code></span>
									</div>
									<div class="flex flex-wrap gap-2">
										{#each g.user_ids as uid}
											<a href={`/users/${uid}`} class="font-mono text-primary hover:underline">{uid}</a>
										{/each}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</section>
	{:else}
		<section class="rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.fraud.evalTitle')}
			</h2>
			<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.fraud.evalHint')}</p>

			<Input
				label={i18n.t('admin.fraud.evalDeliverableIdLabel')}
				placeholder="uuid…"
				bind:value={evalDeliverableId}
				class="font-mono"
			/>

			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				<div class="rounded-xl border border-border bg-surface-overlay p-4">
					<p class="mb-3 text-xs uppercase tracking-wider text-text-muted">{i18n.t('admin.fraud.evalScanBtn')}</p>
					<div class="mb-3 flex flex-wrap items-end gap-3">
						<Input
							label={i18n.t('admin.fraud.thresholdLabel')}
							type="number"
							step="0.01"
							min="0"
							max="1"
							bind:value={evalThreshold as unknown as string}
							class="w-28"
						/>
						<Input
							label={i18n.t('admin.fraud.evalScanWindowLabel')}
							type="number"
							step="1"
							min="1"
							bind:value={evalWindowDays as unknown as string}
							class="w-28"
						/>
					</div>
					<Button
						variant="primary"
						size="sm"
						onclick={scanDeliverable}
						loading={scanning}
						disabled={!evalDeliverableId.trim()}
					>
						{i18n.t('admin.fraud.evalScanBtn')}
					</Button>

					{#if scanResult}
						<div class="mt-3 rounded-lg bg-surface-elevated p-3 text-xs">
							<p class="mb-1 text-text-muted">{i18n.t('admin.fraud.evalResultLabel')}</p>
							<p>
								<Badge variant={scoreVariant(scanResult.best_score)}>{fmtScore(scanResult.best_score)}</Badge>
								<span class="ml-2 text-text-muted">{scanResult.compared_count} {i18n.t('admin.fraud.evalComparedCount')}</span>
							</p>
							{#if scanResult.best_match_id}
								<p class="mt-1 text-text-muted">
									{i18n.t('admin.fraud.evalBestMatch')}:
									<code class="font-mono">{scanResult.best_match_id}</code>
								</p>
							{/if}
						</div>
					{/if}
				</div>

				<div class="rounded-xl border border-border bg-surface-overlay p-4">
					<p class="mb-3 text-xs uppercase tracking-wider text-text-muted">{i18n.t('admin.fraud.evalLlmBtn')}</p>
					<Button
						variant="accent"
						size="sm"
						onclick={llmEvaluate}
						loading={llmEvaluating}
						disabled={!evalDeliverableId.trim()}
					>
						<Sparkles size={14} strokeWidth={2} />
						{i18n.t('admin.fraud.evalLlmBtn')}
					</Button>

					{#if llmResult}
						<div class="mt-3 rounded-lg bg-surface-elevated p-3 text-xs">
							<p class="mb-1 text-text-muted">{i18n.t('admin.fraud.evalResultLabel')}</p>
							<div class="mb-1 flex flex-wrap gap-2">
								<Badge variant={llmResult.new_status === 'verified' ? 'success' : 'warning'}>
									{llmResult.new_status}
								</Badge>
								{#if llmResult.score !== null}
									<Badge variant={scoreVariant(llmResult.score)}>{fmtScore(llmResult.score)}</Badge>
								{/if}
								{#if !llmResult.llm_reachable}
									<Badge variant="error">unreachable</Badge>
								{/if}
							</div>
							{#if llmResult.notes}
								<p class="mt-2 text-text-muted whitespace-pre-wrap">{llmResult.notes}</p>
							{/if}
						</div>
					{/if}
				</div>

				<div class="rounded-xl border border-border bg-surface-overlay p-4">
					<p class="mb-3 text-xs uppercase tracking-wider text-text-muted">{i18n.t('admin.deepScan.btn')}</p>
					<Button
						variant="danger"
						size="sm"
						onclick={runDeepScan}
						loading={deepScanning}
						disabled={!evalDeliverableId.trim()}
					>
						<Fingerprint size={14} strokeWidth={2} />
						{i18n.t('admin.deepScan.btn')}
					</Button>

					{#if deepScanResult}
						<div class="mt-3 rounded-lg bg-surface-elevated p-3 text-xs">
							<p class="mb-2 text-text-muted">{i18n.t('admin.deepScan.resultLabel')}</p>
							<dl class="grid grid-cols-2 gap-1">
								{#if deepScanResult.deep_plagiarism.similarity_score !== undefined}
									<dt class="text-text-muted">{i18n.t('admin.deepScan.resultScore')}</dt>
									<dd>
										<Badge variant={scoreVariant(deepScanResult.deep_plagiarism.similarity_score)}>
											{fmtScore(deepScanResult.deep_plagiarism.similarity_score)}
										</Badge>
									</dd>
								{/if}
								{#if deepScanResult.deep_plagiarism.verdict}
									<dt class="text-text-muted">{i18n.t('admin.deepScan.resultVerdict')}</dt>
									<dd class="font-medium">{deepScanResult.deep_plagiarism.verdict}</dd>
								{/if}
								{#if deepScanResult.deep_plagiarism.comparison_pool_size !== undefined}
									<dt class="text-text-muted">{i18n.t('admin.deepScan.resultPool')}</dt>
									<dd>{deepScanResult.deep_plagiarism.comparison_pool_size}</dd>
								{/if}
								{#if deepScanResult.deep_plagiarism.flagged_at}
									<dt class="text-text-muted">{i18n.t('admin.deepScan.flaggedAt')}</dt>
									<dd class="font-mono">{deepScanResult.deep_plagiarism.flagged_at}</dd>
								{/if}
							</dl>
						</div>
					{/if}
				</div>
			</div>
		</section>
	{/if}
</div>

<ConfirmDangerousDialog
	open={revokeTarget !== null}
	title={i18n.t('admin.fraud.revokeDialogTitle')}
	description={revokeTarget
		? `${i18n.t('admin.fraud.colDeliverable')}: ${revokeTarget.deliverable_id}`
		: ''}
	actionLabel={i18n.t('admin.fraud.actionRevoke')}
	reasonHint={i18n.t('admin.fraud.revokeDialogDescription')}
	loading={revoking}
	onconfirm={confirmRevoke}
	onclose={() => (revokeTarget = null)}
/>
