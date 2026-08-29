<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { adminApi } from '$api/admin';
	import { platformApi, TAG_CATEGORIES } from '$api/platform';
	import type {
		AssistantStatsResponse,
		FeatureFlag,
		TagCategory
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
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
		AlertTriangle,
		Megaphone,
		FileText,
		ShieldCheck
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

	// ── Platform levers ───────────────────────────────────────────────
	//
	// Twelve routes that had no caller, all of the same nature as the jobs
	// above: a switch somebody throws or a run somebody starts. They live
	// here rather than on pages of their own because a page per switch is
	// how a control panel becomes unnavigable.

	let flags = $state<FeatureFlag[]>([]);
	let flagsLoading = $state(true);
	let flagBusy = $state<string | null>(null);
	let flagDeleteTarget = $state<FeatureFlag | null>(null);

	let newFlagKey = $state('');
	let newFlagDescription = $state('');
	let newFlagRollout = $state('100');
	let creatingFlag = $state(false);

	let mirroring = $state(false);
	let syncingReadmes = $state(false);
	let expiringCerts = $state(false);

	let badgeUserId = $state('');
	let recomputingBadges = $state(false);

	let tagSlug = $state('');
	let tagName = $state('');
	let tagCategory = $state<TagCategory>('topic');
	let creatingTag = $state(false);

	let curatedSlug = $state('');
	let curatedValue = $state(true);
	let settingCurated = $state(false);

	let commissionMentor = $state('');
	let commissionMentee = $state('');
	let commissionEnterprise = $state('');
	let commissionAmount = $state('');
	let awardingCommission = $state(false);

	let assistant = $state<AssistantStatsResponse | null>(null);
	let assistantWindow = $state(30);
	let assistantLoading = $state(true);

	$effect(() => {
		void loadFlags();
	});

	$effect(() => {
		void loadAssistant(assistantWindow);
	});

	async function loadFlags() {
		flagsLoading = true;
		try {
			const res = await platformApi.featureFlags();
			flags = res.data.flags;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			flagsLoading = false;
		}
	}

	async function loadAssistant(days: number) {
		assistantLoading = true;
		try {
			const res = await platformApi.assistantStats({ window_days: days, top: 10 });
			assistant = res.data;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			assistantLoading = false;
		}
	}

	async function toggleFlag(flag: FeatureFlag) {
		flagBusy = flag.key;
		try {
			await platformApi.upsertFeatureFlag({
				key: flag.key,
				enabled: !flag.enabled,
				rollout_percent: flag.rollout_percent,
				...(flag.description ? { description: flag.description } : {})
			});
			toast.success(i18n.t('admin.operations.flagSaved'));
			await loadFlags();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			flagBusy = null;
		}
	}

	async function setRollout(flag: FeatureFlag, percent: number) {
		if (!Number.isInteger(percent) || percent < 0 || percent > 100) return;
		flagBusy = flag.key;
		try {
			await platformApi.upsertFeatureFlag({
				key: flag.key,
				enabled: flag.enabled,
				rollout_percent: percent,
				...(flag.description ? { description: flag.description } : {})
			});
			toast.success(i18n.t('admin.operations.flagSaved'));
			await loadFlags();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			flagBusy = null;
		}
	}

	async function createFlag() {
		if (newFlagKey.trim() === '' || creatingFlag) return;
		creatingFlag = true;
		try {
			await platformApi.upsertFeatureFlag({
				key: newFlagKey.trim(),
				// New flags arrive off. A flag that switches something on the
				// moment it is created is a deploy, not a flag.
				enabled: false,
				rollout_percent: Number(newFlagRollout) || 100,
				...(newFlagDescription.trim() ? { description: newFlagDescription.trim() } : {})
			});
			toast.success(i18n.t('admin.operations.flagSaved'));
			newFlagKey = '';
			newFlagDescription = '';
			newFlagRollout = '100';
			await loadFlags();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creatingFlag = false;
		}
	}

	async function confirmDeleteFlag() {
		if (!flagDeleteTarget) return;
		const key = flagDeleteTarget.key;
		flagBusy = key;
		try {
			await platformApi.deleteFeatureFlag(key);
			toast.success(i18n.t('admin.operations.flagDeleted'));
			flagDeleteTarget = null;
			await loadFlags();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			flagBusy = null;
		}
	}

	async function runMirror() {
		mirroring = true;
		try {
			const res = await platformApi.helloWallMirrorRun();
			toast.success(
				i18n.t('admin.operations.mirrorDone', {
					mirrored: res.data.mirrored,
					failed: res.data.failed
				})
			);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			mirroring = false;
		}
	}

	async function runReadmeSync() {
		syncingReadmes = true;
		try {
			const res = await platformApi.profileReadmeSyncRun();
			toast.success(
				i18n.t('admin.operations.readmeSyncDone', {
					synced: res.data.synced,
					failed: res.data.failed
				})
			);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			syncingReadmes = false;
		}
	}

	async function runExpireCerts() {
		expiringCerts = true;
		try {
			const res = await platformApi.expireLapsedCertifications();
			toast.success(i18n.t('admin.operations.certsExpired', { n: res.data.expired }));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			expiringCerts = false;
		}
	}

	async function runBadgeRecompute() {
		if (badgeUserId.trim() === '' || recomputingBadges) return;
		recomputingBadges = true;
		try {
			const res = await platformApi.recomputeBadgesForUser(badgeUserId.trim());
			// Awarded and revoked are both reported. A recompute that takes a
			// badge away is the engine doing its job, and hiding that half
			// would make the next question ("why did they lose it?")
			// unanswerable from this screen.
			toast.success(
				i18n.t('admin.operations.badgesRecomputed', {
					awarded: res.data.awarded.length,
					revoked: res.data.revoked.length,
					unchanged: res.data.unchanged
				})
			);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			recomputingBadges = false;
		}
	}

	async function createTag() {
		if (tagSlug.trim() === '' || tagName.trim() === '' || creatingTag) return;
		creatingTag = true;
		try {
			await platformApi.createTag({
				slug: tagSlug.trim(),
				name: tagName.trim(),
				category: tagCategory
			});
			toast.success(i18n.t('admin.operations.tagCreated'));
			tagSlug = '';
			tagName = '';
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creatingTag = false;
		}
	}

	async function applyCurated() {
		if (curatedSlug.trim() === '' || settingCurated) return;
		settingCurated = true;
		try {
			await platformApi.setProjectCurated(curatedSlug.trim(), curatedValue);
			toast.success(i18n.t('admin.operations.curatedSet'));
			curatedSlug = '';
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			settingCurated = false;
		}
	}

	const canAwardCommission = $derived(
		!awardingCommission &&
			commissionMentor.trim() !== '' &&
			commissionMentee.trim() !== '' &&
			commissionEnterprise.trim() !== '' &&
			commissionAmount.trim() !== ''
	);

	async function awardCommission() {
		if (!canAwardCommission) return;
		awardingCommission = true;
		try {
			await platformApi.mentoringPlacementCommission({
				mentor_user_id: commissionMentor.trim(),
				mentee_user_id: commissionMentee.trim(),
				enterprise_id: commissionEnterprise.trim(),
				// Cents, because it is money. The field asks for cents and says
				// so rather than multiplying a euro figure here.
				placement_amount_cents: Number(commissionAmount)
			});
			toast.success(i18n.t('admin.operations.commissionAwarded'));
			commissionMentor = '';
			commissionMentee = '';
			commissionEnterprise = '';
			commissionAmount = '';
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			awardingCommission = false;
		}
	}

	/** `cache_hit_rate` is null on an empty window, and 0.0 would read as a
	 *  broken cache rather than as nothing having been asked. */
	function hitRate(rate: number | null): string {
		return rate === null ? '—' : `${Math.round(rate * 100)} %`;
	}
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

	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.contentRunsSection')}
		</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<Megaphone size={16} strokeWidth={2} class="text-primary" />
					<h3 class="font-bold">{i18n.t('admin.operations.mirrorTitle')}</h3>
				</div>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.operations.mirrorHint')}</p>
				<Button variant="secondary" size="sm" onclick={runMirror} loading={mirroring}>
					<RefreshCw size={14} strokeWidth={2} />
					{i18n.t('admin.operations.trigger')}
				</Button>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<FileText size={16} strokeWidth={2} class="text-primary" />
					<h3 class="font-bold">{i18n.t('admin.operations.readmeSyncTitle')}</h3>
				</div>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.operations.readmeSyncHint')}</p>
				<Button variant="secondary" size="sm" onclick={runReadmeSync} loading={syncingReadmes}>
					<RefreshCw size={14} strokeWidth={2} />
					{i18n.t('admin.operations.trigger')}
				</Button>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-2 flex items-center gap-2">
					<ShieldCheck size={16} strokeWidth={2} class="text-primary" />
					<h3 class="font-bold">{i18n.t('admin.operations.expireCertsTitle')}</h3>
				</div>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.operations.expireCertsHint')}</p>
				<Button variant="secondary" size="sm" onclick={runExpireCerts} loading={expiringCerts}>
					<RefreshCw size={14} strokeWidth={2} />
					{i18n.t('admin.operations.trigger')}
				</Button>
			</div>
		</div>
	</section>

	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.flagsSection')}
		</h2>
		<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.operations.flagsHint')}</p>

		{#if flagsLoading}
			<Skeleton class="h-32 w-full" rounded="xl" />
		{:else}
			{#if flags.length === 0}
				<p class="mb-4 rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
					{i18n.t('admin.operations.noFlags')}
				</p>
			{:else}
				<ul class="mb-6 flex flex-col gap-2">
					{#each flags as f (f.key)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="min-w-0">
								<code class="font-mono text-sm">{f.key}</code>
								<Badge variant={f.enabled ? 'success' : 'default'}>
									{f.enabled
										? i18n.t('admin.common.active')
										: i18n.t('admin.common.inactive')}
								</Badge>
								{#if f.enabled && f.rollout_percent < 100}
									<!-- On and reaching a fraction is a third state, and
									     one somebody can otherwise stare at for a while
									     wondering why the feature is not showing up. -->
									<Badge variant="warning">{f.rollout_percent}%</Badge>
								{/if}
								{#if f.description}
									<p class="mt-0.5 text-xs text-text-muted">{f.description}</p>
								{/if}
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<input
									type="number"
									min="0"
									max="100"
									value={f.rollout_percent}
									aria-label={i18n.t('admin.operations.rolloutLabel')}
									onchange={(e) =>
										setRollout(f, Number((e.target as HTMLInputElement).value))}
									class="h-9 w-20 rounded-xl border border-border bg-surface-overlay px-3 text-sm"
								/>
								<Button
									variant="secondary"
									size="sm"
									onclick={() => toggleFlag(f)}
									loading={flagBusy === f.key}
									disabled={flagBusy !== null}
								>
									{f.enabled
										? i18n.t('admin.operations.disableBtn')
										: i18n.t('admin.operations.enableBtn')}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => (flagDeleteTarget = f)}
									disabled={flagBusy !== null}
								>
									{i18n.t('admin.operations.deleteFlagBtn')}
								</Button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h3 class="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.operations.newFlagTitle')}
				</h3>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-48 flex-1">
						<label class={labelCls} for="flag-key">
							{i18n.t('admin.operations.flagKeyLabel')}
						</label>
						<input id="flag-key" class={inputCls} bind:value={newFlagKey} />
					</div>
					<div class="min-w-48 flex-1">
						<label class={labelCls} for="flag-desc">
							{i18n.t('admin.operations.flagDescriptionLabel')}
						</label>
						<input id="flag-desc" class={inputCls} bind:value={newFlagDescription} />
					</div>
					<div class="w-28">
						<label class={labelCls} for="flag-rollout">
							{i18n.t('admin.operations.rolloutLabel')}
						</label>
						<input
							id="flag-rollout"
							type="number"
							min="0"
							max="100"
							class={inputCls}
							bind:value={newFlagRollout}
						/>
					</div>
					<Button
						variant="primary"
						size="sm"
						onclick={createFlag}
						disabled={newFlagKey.trim() === '' || creatingFlag}
						loading={creatingFlag}
						data-testid="create-flag"
					>
						{i18n.t('admin.common.create')}
					</Button>
				</div>
				<p class="mt-2 text-xs text-text-muted">{i18n.t('admin.operations.newFlagHint')}</p>
			</div>
		{/if}
	</section>

	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.assistantSection')}
		</h2>
		<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.operations.assistantHint')}</p>

		{#if assistantLoading}
			<Skeleton class="h-24 w-full" rounded="xl" />
		{:else if assistant}
			<div class="mb-4">
				<SegmentedControl
					items={[
						{ value: 7, label: i18n.t('admin.operations.days7') },
						{ value: 30, label: i18n.t('admin.operations.days30') },
						{ value: 90, label: i18n.t('admin.operations.days90') },
						{ value: 365, label: i18n.t('admin.operations.days365') }
					]}
					bind:value={assistantWindow}
				/>
			</div>

			<div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard
					label={i18n.t('admin.operations.assistantRequests')}
					value={assistant.stats.total_requests}
				/>
				<StatCard
					label={i18n.t('admin.operations.assistantBilled')}
					value={assistant.stats.billed_calls}
					hint={i18n.t('admin.operations.assistantBilledHint')}
				/>
				<StatCard
					label={i18n.t('admin.operations.assistantCacheRate')}
					value={hitRate(assistant.stats.cache_hit_rate)}
				/>
				<StatCard
					label={i18n.t('admin.operations.assistantTokens')}
					value={assistant.stats.tokens_total}
				/>
				<StatCard
					label={i18n.t('admin.operations.assistantRefusedBurst')}
					value={assistant.stats.refused_burst}
					hint={i18n.t('admin.operations.assistantRefusedHint')}
				/>
				<StatCard
					label={i18n.t('admin.operations.assistantRefusedQuota')}
					value={assistant.stats.refused_daily_quota}
				/>
				<StatCard
					label={i18n.t('admin.operations.assistantWorkerFailures')}
					value={assistant.stats.worker_failures}
					color={assistant.stats.worker_failures > 0 ? 'error' : 'success'}
					hint={i18n.t('admin.operations.assistantWorkerHint')}
				/>
				<StatCard
					label={i18n.t('admin.operations.assistantUsers')}
					value={assistant.stats.distinct_users}
				/>
			</div>

			<p class="mb-4 text-xs text-text-muted">
				{i18n.t('admin.operations.assistantPolicy', {
					quota: assistant.policy.daily_quota,
					burst: assistant.policy.burst_max,
					window: assistant.policy.burst_window_secs
				})}
			</p>

			{#if assistant.stats.top_consumers.length > 0}
				<ul class="flex flex-col gap-1.5">
					{#each assistant.stats.top_consumers as c (c.user_id)}
						<li class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-2 text-sm">
							<a href="/users/{c.user_id}" class="hover:text-primary">{c.display_name}</a>
							<span class="font-mono text-xs text-text-muted">
								{c.requests} · {c.tokens_used}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>

	<section class="mb-10">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.operations.leversSection')}
		</h2>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h3 class="mb-3 font-bold">{i18n.t('admin.operations.badgeRecomputeTitle')}</h3>
				<p class="mb-3 text-xs text-text-muted">
					{i18n.t('admin.operations.badgeRecomputeHint')}
				</p>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-48 flex-1">
						<label class={labelCls} for="badge-user">
							{i18n.t('admin.common.userIdLabel')}
						</label>
						<input id="badge-user" class={inputCls} bind:value={badgeUserId} />
					</div>
					<Button
						variant="secondary"
						size="sm"
						onclick={runBadgeRecompute}
						disabled={badgeUserId.trim() === '' || recomputingBadges}
						loading={recomputingBadges}
					>
						{i18n.t('admin.operations.trigger')}
					</Button>
				</div>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h3 class="mb-3 font-bold">{i18n.t('admin.operations.curatedTitle')}</h3>
				<p class="mb-3 text-xs text-text-muted">{i18n.t('admin.operations.curatedHint')}</p>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-48 flex-1">
						<label class={labelCls} for="curated-slug">
							{i18n.t('admin.operations.projectSlugLabel')}
						</label>
						<input id="curated-slug" class={inputCls} bind:value={curatedSlug} />
					</div>
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={curatedValue} class="h-4 w-4 rounded" />
						{i18n.t('admin.operations.curatedFlagLabel')}
					</label>
					<Button
						variant="secondary"
						size="sm"
						onclick={applyCurated}
						disabled={curatedSlug.trim() === '' || settingCurated}
						loading={settingCurated}
					>
						{i18n.t('admin.common.apply')}
					</Button>
				</div>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h3 class="mb-3 font-bold">{i18n.t('admin.operations.newTagTitle')}</h3>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-32 flex-1">
						<label class={labelCls} for="tag-slug">
							{i18n.t('admin.operations.tagSlugLabel')}
						</label>
						<input id="tag-slug" class={inputCls} bind:value={tagSlug} />
					</div>
					<div class="min-w-32 flex-1">
						<label class={labelCls} for="tag-name">
							{i18n.t('admin.operations.tagNameLabel')}
						</label>
						<input id="tag-name" class={inputCls} bind:value={tagName} />
					</div>
					<div class="w-36">
						<label class={labelCls} for="tag-category">
							{i18n.t('admin.operations.tagCategoryLabel')}
						</label>
						<select id="tag-category" class={inputCls} bind:value={tagCategory}>
							{#each TAG_CATEGORIES as c (c)}
								<option value={c}>{c}</option>
							{/each}
						</select>
					</div>
					<Button
						variant="secondary"
						size="sm"
						onclick={createTag}
						disabled={tagSlug.trim() === '' || tagName.trim() === '' || creatingTag}
						loading={creatingTag}
					>
						{i18n.t('admin.common.create')}
					</Button>
				</div>
			</div>

			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h3 class="mb-3 font-bold">{i18n.t('admin.operations.commissionTitle')}</h3>
				<p class="mb-3 text-xs text-text-muted">{i18n.t('admin.operations.commissionHint')}</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label class={labelCls} for="comm-mentor">
							{i18n.t('admin.operations.mentorIdLabel')}
						</label>
						<input id="comm-mentor" class={inputCls} bind:value={commissionMentor} />
					</div>
					<div>
						<label class={labelCls} for="comm-mentee">
							{i18n.t('admin.operations.menteeIdLabel')}
						</label>
						<input id="comm-mentee" class={inputCls} bind:value={commissionMentee} />
					</div>
					<div>
						<label class={labelCls} for="comm-ent">
							{i18n.t('admin.common.enterpriseIdLabel')}
						</label>
						<input id="comm-ent" class={inputCls} bind:value={commissionEnterprise} />
					</div>
					<div>
						<label class={labelCls} for="comm-amount">
							{i18n.t('admin.operations.commissionAmountLabel')}
						</label>
						<input
							id="comm-amount"
							type="number"
							class={inputCls}
							bind:value={commissionAmount}
						/>
					</div>
				</div>
				<div class="mt-3">
					<Button
						variant="secondary"
						size="sm"
						onclick={awardCommission}
						disabled={!canAwardCommission}
						loading={awardingCommission}
					>
						{i18n.t('admin.operations.commissionBtn')}
					</Button>
				</div>
			</div>
		</div>
	</section>
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

<ConfirmDangerousDialog
	open={flagDeleteTarget !== null}
	title={i18n.t('admin.operations.deleteFlagBtn')}
	description={flagDeleteTarget
		? `${flagDeleteTarget.key} — ${i18n.t('admin.operations.deleteFlagWarning')}`
		: ''}
	actionLabel={i18n.t('admin.operations.deleteFlagBtn')}
	requireReason={false}
	loading={flagBusy !== null}
	onconfirm={() => confirmDeleteFlag()}
	onclose={() => (flagDeleteTarget = null)}
/>
