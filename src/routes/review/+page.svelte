<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import {
		reviewApi,
		APPRENTICE_VERDICTS,
		VOUCHING_STATUSES,
		FORUM_POST_ACTIONS,
		BUG_SEVERITIES,
		MUTE_MAX_HOURS,
		bugDecisionNeedsReason
	} from '$api/review';
	import type {
		ApprenticeVerdict,
		BugSeverity,
		ForumPostAction,
		PendingApprenticeVerification,
		QualityBugReport,
		TranslationReview,
		VouchingQueueRow,
		VouchingStatus
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, Info, AlertTriangle } from '@lucide/svelte';

	type Tab = 'apprentices' | 'quality' | 'vouchings' | 'forum' | 'slices';

	let tab = $state<Tab>('apprentices');
	let loading = $state(true);

	let apprentices = $state<PendingApprenticeVerification[]>([]);
	let bugs = $state<QualityBugReport[]>([]);
	let vouchings = $state<VouchingQueueRow[]>([]);
	let vouchingStatus = $state<VouchingStatus>('live');

	/** Per-row drafts. A verdict note belongs to the request it was written
	 *  about, and one shared field would carry it to the next one. */
	let verdictOf = $state<Record<string, ApprenticeVerdict>>({});
	let notesOf = $state<Record<string, string>>({});
	let busyApprentice = $state<string | null>(null);

	let severityOf = $state<Record<string, string>>({});
	let reasonOf = $state<Record<string, string>>({});
	let busyBug = $state<string | null>(null);

	let testRunId = $state('');
	let verifyingRun = $state(false);

	// Forum
	let postId = $state('');
	let postAction = $state<ForumPostAction>('hide');
	let postReason = $state('');
	let moderating = $state(false);

	let muteUserId = $state('');
	let muteHours = $state('24');
	let muteReason = $state('');
	let muteScope = $state('forum');
	let muting = $state(false);

	// Slice confirmations
	let sliceId = $state('');
	let translationLanguage = $state('');
	let translationNotes = $state('');
	let reviews = $state<TranslationReview[]>([]);
	let reviewsLoaded = $state('');
	let validating = $state(false);
	let declaring = $state(false);
	let confirming = $state(false);

	function fmtMoment(iso: string): string {
		return new Date(iso).toLocaleString(intlLocale(), {
			dateStyle: 'short',
			timeStyle: 'short'
		});
	}

	function severityVariant(s: string): 'error' | 'warning' | 'default' {
		if (s === 'critical') return 'error';
		if (s === 'high') return 'warning';
		return 'default';
	}

	$effect(() => {
		void load(vouchingStatus);
	});

	async function load(status: VouchingStatus) {
		loading = true;
		try {
			// Each of the three answers a different capability, so one failing
			// must not blank the other two. Settled rather than awaited
			// together: a reviewer who holds `apprentice_verifier` and not
			// `quality_reviewer` still has a page.
			const [a, b, v] = await Promise.allSettled([
				reviewApi.apprenticeQueue({ limit: 50 }),
				reviewApi.bugReviewQueue(),
				reviewApi.vouchingQueue({ status, limit: 50 })
			]);
			apprentices = a.status === 'fulfilled' ? a.value.data.pending : [];
			bugs = b.status === 'fulfilled' ? b.value.data.reports : [];
			vouchings = v.status === 'fulfilled' ? v.value.data.vouchings : [];
		} finally {
			loading = false;
		}
	}

	async function recordVerdict(id: string) {
		const verdict = verdictOf[id];
		if (!verdict || busyApprentice) return;
		busyApprentice = id;
		try {
			const notes = (notesOf[id] ?? '').trim();
			await reviewApi.recordVerdict(id, verdict, notes || undefined);
			toast.success(i18n.t('admin.review.verdictRecorded'));
			delete verdictOf[id];
			delete notesOf[id];
			await load(vouchingStatus);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyApprentice = null;
		}
	}

	function canDecideBug(id: string, decision: 'accept' | 'reject'): boolean {
		if (busyBug) return false;
		return !bugDecisionNeedsReason(decision) || (reasonOf[id] ?? '').trim().length > 0;
	}

	async function decideBug(id: string, decision: 'accept' | 'reject') {
		if (!canDecideBug(id, decision)) return;
		busyBug = id;
		try {
			const adjusted = severityOf[id];
			await reviewApi.reviewBug(id, {
				decision,
				...(adjusted ? { severity_adjusted_to: adjusted as BugSeverity } : {}),
				...(bugDecisionNeedsReason(decision)
					? { reason: (reasonOf[id] ?? '').trim() }
					: {})
			});
			toast.success(i18n.t('admin.review.bugReviewed'));
			delete severityOf[id];
			delete reasonOf[id];
			await load(vouchingStatus);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyBug = null;
		}
	}

	async function verifyRun() {
		if (testRunId.trim() === '' || verifyingRun) return;
		verifyingRun = true;
		try {
			await reviewApi.verifyTestRun(testRunId.trim());
			toast.success(i18n.t('admin.review.runVerified'));
			testRunId = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			verifyingRun = false;
		}
	}

	const canModerate = $derived(!moderating && postId.trim() !== '' && postReason.trim() !== '');

	async function moderatePost() {
		if (!canModerate) return;
		moderating = true;
		try {
			await reviewApi.moderatePost(postId.trim(), {
				action: postAction,
				reason: postReason.trim()
			});
			toast.success(i18n.t('admin.review.postModerated'));
			postId = '';
			postReason = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			moderating = false;
		}
	}

	const canMute = $derived(!muting && muteUserId.trim() !== '' && muteReason.trim() !== '');

	async function mute() {
		if (!canMute) return;
		muting = true;
		try {
			await reviewApi.muteUser(muteUserId.trim(), {
				reason: muteReason.trim(),
				...(muteHours.trim() ? { duration_hours: Number(muteHours) } : {}),
				...(muteScope.trim() ? { scope: muteScope.trim() } : {})
			});
			toast.success(i18n.t('admin.review.userMuted'));
			muteUserId = '';
			muteReason = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			muting = false;
		}
	}

	async function loadReviews() {
		const id = sliceId.trim();
		if (id === '') return;
		try {
			const res = await reviewApi.translationReviews(id);
			reviews = res.data;
			reviewsLoaded = id;
		} catch (err) {
			toast.error(errorMessage(err));
		}
	}

	async function validateTranslation() {
		if (sliceId.trim() === '' || translationLanguage.trim() === '' || validating) return;
		validating = true;
		try {
			await reviewApi.reviewTranslation(sliceId.trim(), {
				language: translationLanguage.trim(),
				...(translationNotes.trim() ? { notes_md: translationNotes.trim() } : {})
			});
			toast.success(i18n.t('admin.review.translationDone'));
			translationNotes = '';
			await loadReviews();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			validating = false;
		}
	}

	async function declareCleared() {
		if (sliceId.trim() === '' || declaring) return;
		declaring = true;
		try {
			await reviewApi.declareLearnerDataCleared(sliceId.trim());
			toast.success(i18n.t('admin.review.educationDone'));
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			declaring = false;
		}
	}

	async function confirmRedaction() {
		if (sliceId.trim() === '' || confirming) return;
		confirming = true;
		try {
			await reviewApi.confirmRedaction(sliceId.trim());
			toast.success(i18n.t('admin.review.redactionDone'));
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			confirming = false;
		}
	}

	const flaggedCount = $derived(vouchings.filter((v) => v.vouched_user_flagged).length);

	const verdictOptions = $derived(
		APPRENTICE_VERDICTS.map((v) => ({ value: v, label: i18n.t(`admin.review.verdicts.${v}`) }))
	);
	const severityOptions = $derived(BUG_SEVERITIES.map((s) => ({ value: s, label: s })));
	const actionOptions = $derived(
		FORUM_POST_ACTIONS.map((a) => ({ value: a, label: i18n.t(`admin.review.actions.${a}`) }))
	);
	const statusItems = $derived(
		VOUCHING_STATUSES.map((s) => ({ value: s, label: i18n.t(`admin.review.statuses.${s}`) }))
	);
</script>

<div class="mx-auto max-w-5xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.review.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.review.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.review.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.review.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={() => load(vouchingStatus)} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-8 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<Info size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.review.scopeNote')}</span>
	</p>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-3 gap-3">
			<StatCard
				label={i18n.t('admin.review.stats.apprentices')}
				value={apprentices.length}
				color={apprentices.length > 0 ? 'warning' : 'success'}
			/>
			<StatCard
				label={i18n.t('admin.review.stats.bugs')}
				value={bugs.length}
				color={bugs.length > 0 ? 'warning' : 'success'}
			/>
			<StatCard
				label={i18n.t('admin.review.stats.flagged')}
				value={flaggedCount}
				color={flaggedCount > 0 ? 'error' : 'default'}
				hint={i18n.t('admin.review.flaggedHint')}
			/>
		</div>

		<div class="mb-6">
			<SegmentedControl
				items={[
					{ value: 'apprentices', label: i18n.t('admin.review.tabs.apprentices') },
					{ value: 'quality', label: i18n.t('admin.review.tabs.quality') },
					{ value: 'vouchings', label: i18n.t('admin.review.tabs.vouchings') },
					{ value: 'forum', label: i18n.t('admin.review.tabs.forum') },
					{ value: 'slices', label: i18n.t('admin.review.tabs.slices') }
				]}
				bind:value={tab}
			/>
		</div>

		{#if tab === 'apprentices'}
			<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.review.abstainHint')}</p>
			{#if apprentices.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.review.emptyApprentices')}
				</p>
			{:else}
				<ul class="flex flex-col gap-4">
					{#each apprentices as v (v.id)}
						<li class="rounded-2xl border border-border bg-surface-elevated p-5">
							<div class="mb-3">
								<h3 class="text-sm font-semibold">{v.challenge_title}</h3>
								<p class="mt-0.5 text-xs text-text-muted">
									<a href="/users/{v.apprentice_user_id}" class="hover:text-primary">
										{v.apprentice_username}
									</a>
									· {fmtMoment(v.created_at)}
								</p>
							</div>
							<p class="mb-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
								{i18n.t('admin.review.answersLabel')}
							</p>
							<pre class="mb-3 max-h-48 overflow-auto rounded-xl border border-border bg-surface-overlay p-3 text-[11px] leading-relaxed">{JSON.stringify(
									v.answers,
									null,
									2
								)}</pre>
							<div class="flex flex-wrap items-end gap-3">
								<div class="w-40">
									<Select
										items={verdictOptions}
										value={verdictOf[v.id] ?? ''}
										onchange={(val: string) =>
											(verdictOf[v.id] = val as ApprenticeVerdict)}
										placeholder={i18n.t('admin.review.verdictLabel')}
										shape="rounded"
									/>
								</div>
								<div class="min-w-56 flex-1">
									<Input
										label={i18n.t('admin.review.notesLabel')}
										value={notesOf[v.id] ?? ''}
										oninput={(e: Event) =>
											(notesOf[v.id] = (e.target as HTMLInputElement).value)}
									/>
								</div>
								<Button
									variant="primary"
									size="sm"
									onclick={() => recordVerdict(v.id)}
									disabled={!verdictOf[v.id] || busyApprentice !== null}
									loading={busyApprentice === v.id}
								>
									{i18n.t('admin.review.verdictBtn')}
								</Button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'quality'}
			<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
				<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
				<span>{i18n.t('admin.review.familyNote')}</span>
			</p>

			<div class="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
				<div class="min-w-56 flex-1">
					<Input label={i18n.t('admin.review.testRunIdLabel')} bind:value={testRunId} />
				</div>
				<Button
					variant="secondary"
					size="sm"
					onclick={verifyRun}
					disabled={testRunId.trim() === '' || verifyingRun}
					loading={verifyingRun}
				>
					{i18n.t('admin.review.verifyRunBtn')}
				</Button>
			</div>

			{#if bugs.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.review.emptyBugs')}
				</p>
			{:else}
				<ul class="flex flex-col gap-4">
					{#each bugs as b (b.id)}
						<li class="rounded-2xl border border-border bg-surface-elevated p-5">
							<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="text-sm font-semibold">{b.title}</h3>
									<p class="mt-0.5 text-[11px] text-text-muted">
										{fmtMoment(b.created_at)} · {b.reproducibility}
									</p>
								</div>
								<Badge variant={severityVariant(b.severity)} size="sm">{b.severity}</Badge>
							</div>

							<dl class="mb-3 grid gap-2 text-xs sm:grid-cols-3">
								<div>
									<dt class="text-[10px] font-bold uppercase tracking-widest text-text-muted">
										{i18n.t('admin.review.reproLabel')}
									</dt>
									<dd class="mt-0.5 whitespace-pre-wrap">{b.repro_steps_md}</dd>
								</div>
								<div>
									<dt class="text-[10px] font-bold uppercase tracking-widest text-text-muted">
										{i18n.t('admin.review.expectedLabel')}
									</dt>
									<dd class="mt-0.5 whitespace-pre-wrap">{b.expected_md}</dd>
								</div>
								<div>
									<dt class="text-[10px] font-bold uppercase tracking-widest text-text-muted">
										{i18n.t('admin.review.observedLabel')}
									</dt>
									<dd class="mt-0.5 whitespace-pre-wrap">{b.observed_md}</dd>
								</div>
							</dl>

							<div class="flex flex-col gap-3 border-t border-border pt-3">
								<div class="flex flex-wrap items-end gap-3">
									<div class="w-36">
										<Select
											items={severityOptions}
											value={severityOf[b.id] ?? ''}
											onchange={(v: string) => (severityOf[b.id] = v)}
											placeholder={i18n.t('admin.review.adjustSeverityLabel')}
											shape="rounded"
										/>
									</div>
									<span class="text-[11px] text-text-muted">
										{i18n.t('admin.review.adjustSeverityHint')}
									</span>
								</div>
								<Input
									label={i18n.t('admin.review.rejectReasonLabel')}
									hint={i18n.t('admin.review.rejectReasonHint')}
									value={reasonOf[b.id] ?? ''}
									oninput={(e: Event) =>
										(reasonOf[b.id] = (e.target as HTMLInputElement).value)}
								/>
								<div class="flex flex-wrap gap-2">
									<Button
										variant="primary"
										size="sm"
										onclick={() => decideBug(b.id, 'accept')}
										disabled={!canDecideBug(b.id, 'accept')}
										loading={busyBug === b.id}
									>
										{i18n.t('admin.review.acceptBtn')}
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onclick={() => decideBug(b.id, 'reject')}
										disabled={!canDecideBug(b.id, 'reject')}
									>
										{i18n.t('admin.review.rejectBtn')}
									</Button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'vouchings'}
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<span class="text-xs font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.review.statusLabel')}
				</span>
				<SegmentedControl
					items={statusItems}
					bind:value={vouchingStatus}
					onchange={(s: VouchingStatus) => load(s)}
				/>
			</div>

			{#if vouchings.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.review.emptyVouchings')}
				</p>
			{:else}
				<ul class="flex flex-col gap-2">
					<!-- Flagged first: that column is what makes this a queue rather
					     than a listing, so it decides the order the eye takes. -->
					{#each [...vouchings].sort((a, b) => Number(b.vouched_user_flagged) - Number(a.vouched_user_flagged)) as v (v.id)}
						<li class="rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="text-sm">
										<a href="/users/{v.voucher_id}" class="font-medium hover:text-primary">
											{v.voucher_display_name ?? v.voucher_username}
										</a>
										<span class="text-text-muted"> → </span>
										<a href="/users/{v.vouched_id}" class="font-medium hover:text-primary">
											{v.vouched_display_name ?? v.vouched_username}
										</a>
									</p>
									<p class="mt-1 text-xs text-text-muted">{v.statement}</p>
									<p class="mt-1 text-[11px] text-text-muted">
										{i18n.t('admin.review.atStakeLabel')}: {v.at_stake_kind}
										· {v.voucher_rank}
										· {i18n.t('admin.review.untilLabel')} {fmtMoment(v.active_until)}
									</p>
								</div>
								{#if v.vouched_user_flagged}
									<span class="inline-flex items-center gap-1 text-xs text-error">
										<AlertTriangle size={12} strokeWidth={2} />
										{i18n.t('admin.review.flaggedBadge')}
									</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'forum'}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.review.forumPostTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.review.hideHint')}</p>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.review.forumPostIdLabel')} bind:value={postId} />
						<Select
							items={actionOptions}
							bind:value={postAction}
							placeholder={i18n.t('admin.review.actionLabel')}
							shape="rounded"
						/>
					</div>
					<Input label={i18n.t('admin.review.reasonLabel')} bind:value={postReason} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={moderatePost}
							disabled={!canModerate}
							loading={moderating}
						>
							{i18n.t('admin.review.moderateBtn')}
						</Button>
					</div>
				</div>
			</section>

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.review.muteTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">
					{i18n.t('admin.review.durationHint', { n: MUTE_MAX_HOURS })}
				</p>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-3">
						<Input label={i18n.t('admin.review.muteUserIdLabel')} bind:value={muteUserId} />
						<Input
							label={i18n.t('admin.review.durationLabel')}
							type="number"
							bind:value={muteHours}
						/>
						<Input label={i18n.t('admin.review.scopeLabel')} bind:value={muteScope} />
					</div>
					<Input label={i18n.t('admin.review.reasonLabel')} bind:value={muteReason} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={mute}
							disabled={!canMute}
							loading={muting}
						>
							{i18n.t('admin.review.muteBtn')}
						</Button>
					</div>
				</div>
			</section>
		{:else}
			<p class="mb-5 flex items-start gap-2 text-xs text-text-muted">
				<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
				<span>{i18n.t('admin.review.slicesNote')}</span>
			</p>

			<div class="mb-6 flex flex-wrap items-end gap-3">
				<div class="min-w-64 flex-1">
					<Input label={i18n.t('admin.review.sliceIdLabel')} bind:value={sliceId} />
				</div>
				<Button
					variant="secondary"
					size="sm"
					onclick={loadReviews}
					disabled={sliceId.trim() === ''}
				>
					{i18n.t('admin.review.reviewsListTitle')}
				</Button>
			</div>

			{#if reviewsLoaded !== ''}
				<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.review.reviewsListTitle')}
					</h2>
					{#if reviews.length === 0}
						<p class="text-sm text-text-muted">{i18n.t('admin.review.noReviews')}</p>
					{:else}
						<ul class="divide-y divide-border">
							{#each reviews as r (r.id)}
								<li class="py-2">
									<p class="text-sm">
										{r.reviewer_username}
										<Badge variant="default" size="sm">{r.language}</Badge>
										<span class="ms-2 text-[11px] text-text-muted">
											{r.proficiency ?? i18n.t('admin.review.proficiencyUnknown')}
										</span>
									</p>
									{#if r.notes_md}
										<p class="mt-1 text-xs text-text-muted">{r.notes_md}</p>
									{/if}
									<p class="mt-0.5 text-[10px] text-text-muted">{fmtMoment(r.reviewed_at)}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.review.translationTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.review.translationHint')}</p>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Input
							label={i18n.t('admin.review.languageLabel')}
							bind:value={translationLanguage}
						/>
						<Input
							label={i18n.t('admin.review.translationNotesLabel')}
							bind:value={translationNotes}
						/>
					</div>
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={validateTranslation}
							disabled={sliceId.trim() === '' ||
								translationLanguage.trim() === '' ||
								validating}
							loading={validating}
						>
							{i18n.t('admin.review.translationBtn')}
						</Button>
					</div>
				</div>
			</section>

			<div class="grid gap-4 sm:grid-cols-2">
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.review.educationTitle')}
					</h2>
					<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.review.educationHint')}</p>
					<Button
						variant="secondary"
						size="sm"
						onclick={declareCleared}
						disabled={sliceId.trim() === '' || declaring}
						loading={declaring}
					>
						{i18n.t('admin.review.educationBtn')}
					</Button>
				</section>

				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.review.redactionTitle')}
					</h2>
					<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.review.redactionHint')}</p>
					<Button
						variant="secondary"
						size="sm"
						onclick={confirmRedaction}
						disabled={sliceId.trim() === '' || confirming}
						loading={confirming}
					>
						{i18n.t('admin.review.redactionBtn')}
					</Button>
				</section>
			</div>
		{/if}
	{/if}
</div>
