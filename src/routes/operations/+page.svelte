<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { adminApi } from '$api/admin';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import {
		ChevronRight,
		Wrench,
		RefreshCw,
		Trophy,
		Mail,
		Sparkles,
		TrendingDown,
		Link2,
		Users as UsersIcon,
		Swords,
		Download,
		AlertTriangle
	} from '@lucide/svelte';

	let rebuildingLb = $state(false);
	let runningDigest = $state(false);
	let runningGems = $state(false);
	let runningChurn = $state(false);

	let githubUserId = $state('');
	let syncingGithub = $state(false);

	let guildIdToDissolve = $state('');
	let dissolvingGuild = $state(false);

	let warId = $state('');
	let winnerGuildId = $state('');
	let concludingWar = $state(false);

	const now = new Date();
	let expYear = $state(now.getFullYear());
	let expMonth = $state(now.getMonth() + 1);

	let lastResult = $state<{ label: string; body: unknown } | null>(null);

	let showDigestConfirm = $state(false);
	let showDissolveConfirm = $state(false);

	// ADM-M5+ : proof engine sweep + GDPR export admin-triggered
	let sweepWithinDays = $state(7);
	let sweeping = $state(false);
	let sweepPreviewCount = $state<number | null>(null);
	let sweepProcessedCount = $state<number | null>(null);
	let gdprTargetUserId = $state('');
	let gdprReason = $state('');
	let gdprReasonTouched = $state(false);
	let gdprSubmitting = $state(false);

	const gdprReasonError = $derived.by(() => {
		if (!gdprReasonTouched) return null;
		const t = gdprReason.trim();
		if (t.length === 0) return i18n.t('admin.confirmDialog.reasonRequired');
		if (t.length < 8) return i18n.t('admin.confirmDialog.reasonTooShort', { n: 8 });
		return null;
	});
	const canTriggerGdpr = $derived(
		!gdprSubmitting &&
			gdprTargetUserId.trim().length > 0 &&
			gdprReasonError === null &&
			gdprReason.trim().length >= 8
	);

	function record(label: string, body: unknown) {
		lastResult = { label, body };
	}

	async function runRebuild() {
		if (rebuildingLb) return;
		rebuildingLb = true;
		try {
			const res = await adminApi.rebuildLeaderboards();
			toast.success(i18n.t('admin.operations.rebuildTriggered'));
			record('rebuildLeaderboards', res.data);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			rebuildingLb = false;
		}
	}

	function requestDigest() {
		showDigestConfirm = true;
	}

	async function confirmDigest() {
		if (runningDigest) return;
		runningDigest = true;
		try {
			const res = await adminApi.runWeeklyDigest();
			toast.success(i18n.t('admin.operations.digestSent'));
			record('runWeeklyDigest', res.data.digest);
			showDigestConfirm = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			runningDigest = false;
		}
	}

	async function runGems() {
		if (runningGems) return;
		runningGems = true;
		try {
			const res = await adminApi.aiHiddenGems();
			toast.success(i18n.t('admin.operations.gemsQueued', { id: res.data.job_id }));
			record('aiHiddenGems', res.data);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			runningGems = false;
		}
	}

	async function runSweepDryRun() {
		if (sweeping) return;
		sweeping = true;
		sweepProcessedCount = null;
		try {
			const res = await adminApi.sweepProofHooks(sweepWithinDays, true);
			const data = res.data as { would_process_count: number };
			sweepPreviewCount = data.would_process_count;
			record('sweepProofHooks(dry-run)', res.data);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			sweeping = false;
		}
	}

	async function runSweep() {
		if (sweeping) return;
		sweeping = true;
		try {
			const res = await adminApi.sweepProofHooks(sweepWithinDays, false);
			const data = res.data as { processed_count: number };
			sweepProcessedCount = data.processed_count;
			sweepPreviewCount = null;
			toast.success(i18n.t('admin.operations.proofSweepDone'));
			record('sweepProofHooks', res.data);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			sweeping = false;
		}
	}

	async function submitGdprExport(e: SubmitEvent) {
		e.preventDefault();
		gdprReasonTouched = true;
		if (!canTriggerGdpr) return;
		gdprSubmitting = true;
		try {
			const res = await adminApi.triggerUserGdprExport(gdprTargetUserId.trim(), {
				reason: gdprReason.trim()
			});
			toast.success(i18n.t('admin.operations.gdprExportQueuedToast'));
			record('triggerUserGdprExport', res.data);
			gdprTargetUserId = '';
			gdprReason = '';
			gdprReasonTouched = false;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			gdprSubmitting = false;
		}
	}

	async function runChurn() {
		if (runningChurn) return;
		runningChurn = true;
		try {
			const res = await adminApi.aiChurn();
			toast.success(i18n.t('admin.operations.churnQueued', { id: res.data.job_id }));
			record('aiChurn', res.data);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			runningChurn = false;
		}
	}

	async function submitSyncGithub(e: SubmitEvent) {
		e.preventDefault();
		if (syncingGithub || !githubUserId.trim()) return;
		syncingGithub = true;
		try {
			const res = await adminApi.syncGithub(githubUserId.trim());
			toast.success(i18n.t('admin.operations.syncTriggered'));
			record('syncGithub', res.data.sync);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			syncingGithub = false;
		}
	}

	function requestDissolve(e: SubmitEvent) {
		e.preventDefault();
		if (!guildIdToDissolve.trim()) return;
		showDissolveConfirm = true;
	}

	async function confirmDissolve(reason: string) {
		if (dissolvingGuild || !guildIdToDissolve.trim()) return;
		dissolvingGuild = true;
		const id = guildIdToDissolve.trim();
		try {
			await adminApi.dissolveGuild(id, reason);
			toast.success(i18n.t('admin.operations.guildDissolved'));
			record('dissolveGuild', { id });
			guildIdToDissolve = '';
			showDissolveConfirm = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			dissolvingGuild = false;
		}
	}

	async function submitConcludeWar(e: SubmitEvent) {
		e.preventDefault();
		if (concludingWar || !warId.trim() || !winnerGuildId.trim()) return;
		concludingWar = true;
		try {
			const res = await adminApi.concludeGuildWar(warId.trim(), winnerGuildId.trim());
			toast.success(i18n.t('admin.operations.warConcluded'));
			record('concludeGuildWar', res.data);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			concludingWar = false;
		}
	}

	const exportUrl = $derived(adminApi.accountingExportUrl(expYear, expMonth));
	const exportFilename = $derived(`skilluv-accounting-${expYear}-${String(expMonth).padStart(2, '0')}.csv`);

	// Auth enforced by hooks.server.ts — client re-check was racy on deep-links.

	const inputCls =
		'w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none';
	const labelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted';
</script>

<svelte:head>
	<title>{i18n.t('admin.nav.operations')} — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.nav.operations')}</span>
	</nav>

	<div class="mb-8">
		<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{i18n.t('admin.operations.opsLabel')}</p>
		<h1 class="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
			{i18n.t('admin.operations.title')}
		</h1>
		<p class="mt-3 max-w-2xl text-sm text-text-muted">
			{i18n.t('admin.operations.subtitle')}
		</p>
	</div>

	<!-- Safe jobs -->
	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.jobsSection')}
		</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<Trophy size={16} strokeWidth={2} class="text-primary" />
					<h3 class="font-bold">Leaderboards</h3>
				</div>
				<p class="text-xs text-text-muted mb-4">
					{i18n.t('admin.operations.jobLeaderboardsHint')}
				</p>
				<Button variant="secondary" size="sm" onclick={runRebuild} data-testid="ops-rebuild-leaderboards" loading={rebuildingLb}>
					<RefreshCw size={14} strokeWidth={2} />
					{i18n.t('admin.operations.rebuild')}
				</Button>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<Mail size={16} strokeWidth={2} class="text-primary" />
					<h3 class="font-bold">Digest</h3>
				</div>
				<p class="text-xs text-text-muted mb-4">
					{i18n.t('admin.operations.jobDigestHint')}
				</p>
				<Button variant="secondary" size="sm" onclick={requestDigest} loading={runningDigest}>
					<Mail size={14} strokeWidth={2} />
					{i18n.t('admin.operations.sendNow')}
				</Button>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<Sparkles size={16} strokeWidth={2} class="text-accent" />
					<h3 class="font-bold">Hidden Gems</h3>
				</div>
				<p class="text-xs text-text-muted mb-4">
					{i18n.t('admin.operations.jobGemsHint')}
				</p>
				<Button variant="secondary" size="sm" onclick={runGems} data-testid="ops-hidden-gems" loading={runningGems}>
					<Sparkles size={14} strokeWidth={2} />
					{i18n.t('admin.operations.trigger')}
				</Button>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<TrendingDown size={16} strokeWidth={2} class="text-accent" />
					<h3 class="font-bold">Churn</h3>
				</div>
				<p class="text-xs text-text-muted mb-4">
					{i18n.t('admin.operations.jobChurnHint')}
				</p>
				<Button variant="secondary" size="sm" onclick={runChurn} data-testid="ops-churn" loading={runningChurn}>
					<TrendingDown size={14} strokeWidth={2} />
					{i18n.t('admin.operations.trigger')}
				</Button>
			</div>

			<!-- ADM-M5+ : proof engine sweep -->
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<RefreshCw size={16} strokeWidth={2} class="text-primary" />
					<h3 class="font-bold">{i18n.t('admin.operations.proofSweep')}</h3>
				</div>
				<p class="text-xs text-text-muted mb-3">
					{i18n.t('admin.operations.proofSweepHint')}
				</p>
				<label class="mb-3 flex items-center gap-2 text-xs text-text-primary">
					<span class="text-text-muted">
						{i18n.t('admin.operations.proofSweepWithinDays')}:
					</span>
					<input
						type="number"
						min="1"
						max="90"
						bind:value={sweepWithinDays}
						class="no-spinner h-8 w-16 rounded-lg border border-border bg-surface-elevated px-2 text-center text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
					/>
				</label>
				<div class="flex flex-wrap gap-2">
					<Button variant="ghost" size="sm" onclick={runSweepDryRun} data-testid="ops-proof-sweep-dry-run" loading={sweeping} disabled={sweeping}>
						{i18n.t('admin.operations.proofSweepDryRunBtn')}
					</Button>
					<Button variant="secondary" size="sm" onclick={runSweep} loading={sweeping} disabled={sweeping}>
						<RefreshCw size={14} strokeWidth={2} />
						{i18n.t('admin.operations.proofSweepRunBtn')}
					</Button>
				</div>
				{#if sweepPreviewCount !== null}
					<p class="mt-2 text-xs text-info">
						{sweepPreviewCount} {i18n.t('admin.operations.proofSweepDryRunPreview')}
					</p>
				{/if}
				{#if sweepProcessedCount !== null}
					<p class="mt-2 text-xs text-success">
						{sweepProcessedCount} · {i18n.t('admin.operations.proofSweepDone')}
					</p>
				{/if}
			</div>
		</div>
	</section>

	<!-- ADM-M5+ : GDPR export admin-triggered -->
	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.gdprExport')}
		</h2>
		<form
			onsubmit={submitGdprExport}
			class="rounded-2xl border border-border bg-surface-elevated p-5"
		>
			<div class="mb-2 flex items-center gap-2">
				<Download size={16} strokeWidth={2} class="text-accent" />
				<h3 class="font-bold">{i18n.t('admin.operations.gdprExport')}</h3>
			</div>
			<p class="mb-4 text-xs text-text-muted">
				{i18n.t('admin.operations.gdprExportHint')}
			</p>
			<div class="mb-3 flex flex-col gap-3 sm:flex-row">
				<div class="flex flex-1 flex-col gap-1.5">
					<label
						for="gdpr-target"
						class="text-xs font-medium uppercase tracking-wider text-text-muted"
					>
						{i18n.t('admin.operations.gdprExportTargetUserId')}
					</label>
					<input
						id="gdpr-target"
						type="text"
						bind:value={gdprTargetUserId}
						placeholder="00000000-0000-0000-0000-000000000000"
						class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
					/>
				</div>
			</div>
			<div class="mb-3 flex flex-col gap-1.5">
				<label
					for="gdpr-reason"
					class="text-xs font-medium uppercase tracking-wider text-text-muted"
				>
					{i18n.t('admin.operations.gdprExportReason')}
				</label>
				<textarea
					id="gdpr-reason"
					bind:value={gdprReason}
					oninput={() => (gdprReasonTouched = true)}
					rows="2"
					placeholder={i18n.t('admin.operations.gdprExportReasonPlaceholder')}
					class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
				></textarea>
				{#if gdprReasonError}
					<p class="text-xs text-error">{gdprReasonError}</p>
				{/if}
			</div>
			<Button
				variant="danger"
				size="sm"
				disabled={!canTriggerGdpr}
				loading={gdprSubmitting}
			>
				<Download size={14} strokeWidth={2} />
				{i18n.t('admin.operations.gdprExportTriggerBtn')}
			</Button>
		</form>
	</section>

	<!-- ID-based ops -->
	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.targetedSection')}
		</h2>
		<div class="grid gap-4 lg:grid-cols-3">
			<!-- GitHub sync -->
			<form onsubmit={submitSyncGithub} class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<Link2 size={16} strokeWidth={2} class="text-primary" />
					<h3 class="font-bold">{i18n.t('admin.operations.githubSync')}</h3>
				</div>
				<p class="text-xs text-text-muted mb-3">
					{i18n.t('admin.operations.githubSyncHint')}
				</p>
				<div class="mb-3">
					<label for="op-gh" class={labelCls}>{i18n.t('admin.common.userIdLabel')} *</label>
					<input id="op-gh" bind:value={githubUserId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
				</div>
				<Button variant="secondary" size="sm" loading={syncingGithub}>
					<Link2 size={14} strokeWidth={2} />
					{i18n.t('admin.operations.syncBtn')}
				</Button>
			</form>

			<!-- Guild dissolve -->
			<form onsubmit={requestDissolve} class="rounded-2xl border border-error/30 bg-error/5 p-5">
				<div class="mb-2 flex items-center gap-2">
					<UsersIcon size={16} strokeWidth={2} class="text-error" />
					<h3 class="font-bold">{i18n.t('admin.operations.dissolveGuild')}</h3>
				</div>
				<p class="text-xs text-text-muted mb-3">
					{i18n.t('admin.operations.dissolveHint')}
				</p>
				<div class="mb-3">
					<label for="op-gid" class={labelCls}>{i18n.t('admin.common.guildIdLabel')} *</label>
					<input id="op-gid" bind:value={guildIdToDissolve} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
				</div>
				<Button variant="danger" size="sm" loading={dissolvingGuild}>
					<AlertTriangle size={14} strokeWidth={2} />
					{i18n.t('admin.operations.dissolveBtn')}
				</Button>
			</form>

			<!-- Conclude war -->
			<form onsubmit={submitConcludeWar} class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<Swords size={16} strokeWidth={2} class="text-accent" />
					<h3 class="font-bold">{i18n.t('admin.operations.concludeWar')}</h3>
				</div>
				<p class="text-xs text-text-muted mb-3">
					{i18n.t('admin.operations.concludeWarHint')}
				</p>
				<div class="mb-3">
					<label for="op-war" class={labelCls}>{i18n.t('admin.common.warIdLabel')} *</label>
					<input id="op-war" bind:value={warId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
				</div>
				<div class="mb-3">
					<label for="op-wg" class={labelCls}>{i18n.t('admin.operations.winnerGuildId')} *</label>
					<input id="op-wg" bind:value={winnerGuildId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
				</div>
				<Button variant="accent" size="sm" loading={concludingWar}>
					<Swords size={14} strokeWidth={2} />
					{i18n.t('admin.operations.concludeBtn')}
				</Button>
			</form>
		</div>
	</section>

	<!-- Accounting -->
	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.accounting')}
		</h2>
		<div class="rounded-2xl border border-border bg-surface-elevated p-5">
			<div class="mb-2 flex items-center gap-2">
				<Download size={16} strokeWidth={2} class="text-primary" />
				<h3 class="font-bold">
					{i18n.t('admin.operations.csvExport')}
				</h3>
			</div>
			<p class="text-xs text-text-muted mb-4">
				{i18n.t('admin.operations.csvExportHint')}
			</p>
			<div class="flex flex-wrap items-end gap-3">
				<div>
					<label for="exp-y" class={labelCls}>{i18n.t('admin.operations.year')}</label>
					<input id="exp-y" type="number" bind:value={expYear} min="2020" max="2100" class="w-28 rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none" />
				</div>
				<div>
					<label for="exp-m" class={labelCls}>{i18n.t('admin.operations.month')}</label>
					<input id="exp-m" type="number" bind:value={expMonth} min="1" max="12" class="w-24 rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none" />
				</div>
				<a
					href={exportUrl}
					download={exportFilename}
					class="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
				>
					<Download size={14} strokeWidth={2} />
					{i18n.t('admin.operations.downloadCsv')}
				</a>
			</div>
		</div>
	</section>

	{#if lastResult}
		<section>
			<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.operations.lastResult')}
			</h2>
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<Badge variant="primary" size="sm">{lastResult.label}</Badge>
				</div>
				<pre class="overflow-x-auto rounded-xl bg-surface-overlay p-3 font-mono text-xs text-text-muted">{JSON.stringify(lastResult.body, null, 2)}</pre>
			</div>
		</section>
	{/if}
</div>

<ConfirmDangerousDialog
	open={showDigestConfirm}
	title={i18n.t('admin.operations.sendNow')}
	description={i18n.t('admin.operations.jobDigestConfirm')}
	actionLabel={i18n.t('admin.operations.sendNow')}
	requireReason={false}
	loading={runningDigest}
	onconfirm={() => confirmDigest()}
	onclose={() => (showDigestConfirm = false)}
/>

<ConfirmDangerousDialog
	open={showDissolveConfirm}
	title={i18n.t('admin.operations.dissolveGuild')}
	description={guildIdToDissolve.trim()
		? `${i18n.t('admin.common.guildIdLabel')}: ${guildIdToDissolve.trim()}`
		: i18n.t('admin.operations.dissolveConfirm')}
	actionLabel={i18n.t('admin.operations.dissolveBtn')}
	reasonHint={i18n.t('admin.operations.dissolveHint')}
	loading={dissolvingGuild}
	onconfirm={confirmDissolve}
	onclose={() => (showDissolveConfirm = false)}
/>
