<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { gameApi, GAME_JAM_KINDS, MOD_REASON_MIN } from '$api/game';
	import { adminApi } from '$api/admin';
	import type { AdminSlice, GameJamKind, GameMod } from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, Info, ExternalLink } from '@lucide/svelte';

	type Tab = 'mods' | 'slices' | 'jams' | 'attestations' | 'featured';

	let tab = $state<Tab>('mods');
	let loading = $state(true);

	let mods = $state<GameMod[]>([]);
	let slices = $state<AdminSlice[]>([]);

	/** Per-mod form state, keyed by id. A single shared draft would carry one
	 *  reviewer's half-written refusal onto the next mod in the queue. */
	let reasons = $state<Record<string, string>>({});
	let downloads = $state<Record<string, string>>({});
	let busyMod = $state<string | null>(null);
	let busySlice = $state<string | null>(null);

	// Jams
	let jamKind = $state<GameJamKind>('game_jam_48h');
	let jamSlug = $state('');
	let jamName = $state('');
	let jamTheme = $state('');
	let jamDescription = $state('');
	let jamStarts = $state('');
	let jamEnds = $state('');
	let jamSubmission = $state('');
	let jamVoting = $state('');
	let jamTeamMax = $state('');
	let creatingJam = $state(false);

	let finalizeId = $state('');
	let finalizing = $state(false);

	// Attestations
	let stUser = $state('');
	let stDeliverable = $state('');
	let stStore = $state('');
	let stTitle = $state('');
	let issuingShipped = $state(false);

	let osUser = $state('');
	let osDeliverable = $state('');
	let osPr = $state('');
	let osWhat = $state('');
	let issuingOpenSource = $state(false);

	// Featured
	let ftUser = $state('');
	let ftStart = $state('');
	let ftEnd = $state('');
	let ftBio = $state('');
	let featuring = $state(false);

	function fmtMoment(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	/** A `datetime-local` value is a wall clock with no zone. The backend
	 *  wants an instant, so it is interpreted in the operator's own zone —
	 *  which is what they meant when they typed it. */
	function toInstant(local: string): string {
		return new Date(local).toISOString();
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const [m, s] = await Promise.all([
				gameApi.pendingMods(),
				// The slice validation route needs an id, and this is where the
				// ids are. Filtering to the game domain here rather than making
				// the operator paste a UUID is the whole reason this tab exists.
				//
				// `pending_validation` is the queue the signature clears. The
				// playtest count is a hard gate in the service, so a slice can
				// sit here and still refuse to validate — the 400 says which.
				adminApi.listAdminSlices({
					domain: 'game',
					status: ['pending_validation'],
					per_page: 50
				})
			]);
			mods = m.data.mods;
			slices = s.data;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	function reasonOf(id: string): string {
		return reasons[id] ?? '';
	}

	function reasonOk(id: string): boolean {
		return reasonOf(id).trim().length >= MOD_REASON_MIN;
	}

	async function judgeMod(id: string, confirm: boolean) {
		if (!reasonOk(id) || busyMod) return;
		busyMod = id;
		try {
			const reason = reasonOf(id).trim();
			if (confirm) await gameApi.confirmMod(id, reason);
			else await gameApi.refuseMod(id, reason);
			toast.success(
				i18n.t(confirm ? 'admin.gameDomain.modConfirmed' : 'admin.gameDomain.modRefused')
			);
			delete reasons[id];
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyMod = null;
		}
	}

	async function saveDownloads(id: string) {
		const raw = (downloads[id] ?? '').trim();
		const n = Number(raw);
		if (raw === '' || !Number.isInteger(n) || n < 0 || busyMod) return;
		busyMod = id;
		try {
			await gameApi.setModDownloads(id, n);
			toast.success(i18n.t('admin.gameDomain.downloadsSaved'));
			delete downloads[id];
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyMod = null;
		}
	}

	async function validateSlice(id: string) {
		busySlice = id;
		try {
			await gameApi.validateSlice(id);
			toast.success(i18n.t('admin.gameDomain.sliceValidated'));
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busySlice = null;
		}
	}

	const canCreateJam = $derived(
		!creatingJam &&
			jamSlug.trim() !== '' &&
			jamName.trim() !== '' &&
			jamTheme.trim() !== '' &&
			jamStarts !== '' &&
			jamEnds !== '' &&
			jamSubmission !== '' &&
			jamVoting !== ''
	);

	async function createJam() {
		if (!canCreateJam) return;
		creatingJam = true;
		try {
			await gameApi.createJam({
				kind: jamKind,
				slug: jamSlug.trim(),
				name: jamName.trim(),
				theme: jamTheme.trim(),
				...(jamDescription.trim() ? { description: jamDescription.trim() } : {}),
				starts_at: toInstant(jamStarts),
				ends_at: toInstant(jamEnds),
				submission_deadline: toInstant(jamSubmission),
				voting_deadline: toInstant(jamVoting),
				...(jamTeamMax.trim() ? { team_size_max: Number(jamTeamMax) } : {})
			});
			toast.success(i18n.t('admin.gameDomain.jamCreated'));
			jamSlug = '';
			jamName = '';
			jamTheme = '';
			jamDescription = '';
			jamStarts = '';
			jamEnds = '';
			jamSubmission = '';
			jamVoting = '';
			jamTeamMax = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			creatingJam = false;
		}
	}

	async function finalizeJam() {
		if (finalizeId.trim() === '' || finalizing) return;
		finalizing = true;
		try {
			const res = await gameApi.finalizeJam(finalizeId.trim());
			toast.success(
				i18n.t('admin.gameDomain.jamFinalized', {
					scored: res.data.report.submissions_scored,
					issued: res.data.report.attestations_issued
				})
			);
			finalizeId = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			finalizing = false;
		}
	}

	const canIssueShipped = $derived(
		!issuingShipped &&
			stUser.trim() !== '' &&
			stDeliverable.trim() !== '' &&
			stStore.trim() !== '' &&
			stTitle.trim() !== ''
	);

	async function issueShipped() {
		if (!canIssueShipped) return;
		issuingShipped = true;
		try {
			await gameApi.issueShippedTitle({
				user_id: stUser.trim(),
				deliverable_id: stDeliverable.trim(),
				store_url: stStore.trim(),
				title: stTitle.trim()
			});
			toast.success(i18n.t('admin.gameDomain.attestationIssued'));
			stUser = '';
			stDeliverable = '';
			stStore = '';
			stTitle = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			issuingShipped = false;
		}
	}

	const canIssueOpenSource = $derived(
		!issuingOpenSource &&
			osUser.trim() !== '' &&
			osDeliverable.trim() !== '' &&
			osPr.trim() !== '' &&
			osWhat.trim() !== ''
	);

	async function issueOpenSource() {
		if (!canIssueOpenSource) return;
		issuingOpenSource = true;
		try {
			await gameApi.issueOpenSource({
				user_id: osUser.trim(),
				deliverable_id: osDeliverable.trim(),
				pr_url: osPr.trim(),
				what_changed: osWhat.trim()
			});
			toast.success(i18n.t('admin.gameDomain.attestationIssued'));
			osUser = '';
			osDeliverable = '';
			osPr = '';
			osWhat = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			issuingOpenSource = false;
		}
	}

	const canFeature = $derived(
		!featuring && ftUser.trim() !== '' && ftStart !== '' && ftEnd !== '' && ftBio.trim() !== ''
	);

	async function feature() {
		if (!canFeature) return;
		featuring = true;
		try {
			await gameApi.featureCreator({
				user_id: ftUser.trim(),
				week_starts_at: ftStart,
				week_ends_at: ftEnd,
				bio_md: ftBio.trim()
			});
			toast.success(i18n.t('admin.gameDomain.featured'));
			ftUser = '';
			ftStart = '';
			ftEnd = '';
			ftBio = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			featuring = false;
		}
	}

	const kindOptions = $derived(
		GAME_JAM_KINDS.map((k) => ({ value: k, label: k.replace('game_jam_', '') }))
	);
</script>

<div class="mx-auto max-w-5xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.gameDomain.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.gameDomain.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.gameDomain.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">
				{i18n.t('admin.gameDomain.subtitle')}
			</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-8 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<Info size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.gameDomain.gateNote')}</span>
	</p>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-2 gap-3">
			<StatCard
				label={i18n.t('admin.gameDomain.stats.pendingMods')}
				value={mods.length}
				color={mods.length > 0 ? 'warning' : 'success'}
			/>
			<StatCard label={i18n.t('admin.gameDomain.stats.openSlices')} value={slices.length} />
		</div>

		<div class="mb-6">
			<SegmentedControl
				items={[
					{ value: 'mods', label: i18n.t('admin.gameDomain.tabs.mods') },
					{ value: 'slices', label: i18n.t('admin.gameDomain.tabs.slices') },
					{ value: 'jams', label: i18n.t('admin.gameDomain.tabs.jams') },
					{ value: 'attestations', label: i18n.t('admin.gameDomain.tabs.attestations') },
					{ value: 'featured', label: i18n.t('admin.gameDomain.tabs.featured') }
				]}
				bind:value={tab}
			/>
		</div>

		{#if tab === 'mods'}
			{#if mods.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.gameDomain.emptyMods')}
				</p>
			{:else}
				<ul class="flex flex-col gap-4">
					{#each mods as m (m.id)}
						<li class="rounded-2xl border border-border bg-surface-elevated p-5">
							<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="text-sm font-semibold">{m.title}</h3>
									<p class="mt-0.5 text-xs text-text-muted">
										{m.target_game} · {m.target_platform} · {m.external_downloads_count}
										{i18n.t('admin.gameDomain.cols.downloads')}
									</p>
									<a
										href={m.external_hosting_url}
										target="_blank"
										rel="noopener nofollow"
										class="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
									>
										<ExternalLink size={11} strokeWidth={2} />
										{m.external_hosting_url}
									</a>
								</div>
								<span class="text-[11px] text-text-muted">{fmtMoment(m.registered_at)}</span>
							</div>

							<p class="mb-3 whitespace-pre-wrap text-xs text-text-muted">{m.description_md}</p>

							<div class="flex flex-col gap-3">
								<Input
									label={i18n.t('admin.gameDomain.reasonLabel')}
									hint={i18n.t('admin.gameDomain.reasonHint', { n: MOD_REASON_MIN })}
									value={reasonOf(m.id)}
									oninput={(e: Event) =>
										(reasons[m.id] = (e.target as HTMLInputElement).value)}
									error={reasonOf(m.id).length > 0 && !reasonOk(m.id)
										? i18n.t('admin.gameDomain.reasonTooShort', { n: MOD_REASON_MIN })
										: undefined}
								/>
								<div class="flex flex-wrap gap-2">
									<Button
										variant="primary"
										size="sm"
										onclick={() => judgeMod(m.id, true)}
										disabled={!reasonOk(m.id) || busyMod !== null}
										loading={busyMod === m.id}
									>
										{i18n.t('admin.gameDomain.confirmBtn')}
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onclick={() => judgeMod(m.id, false)}
										disabled={!reasonOk(m.id) || busyMod !== null}
									>
										{i18n.t('admin.gameDomain.refuseBtn')}
									</Button>
								</div>

								<div class="flex flex-wrap items-end gap-2 border-t border-border pt-3">
									<div class="w-40">
										<Input
											label={i18n.t('admin.gameDomain.downloadsLabel')}
											hint={i18n.t('admin.gameDomain.downloadsHint')}
											type="number"
											value={downloads[m.id] ?? ''}
											oninput={(e: Event) =>
												(downloads[m.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onclick={() => saveDownloads(m.id)}
										disabled={(downloads[m.id] ?? '').trim() === '' || busyMod !== null}
									>
										{i18n.t('admin.gameDomain.downloadsBtn')}
									</Button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'slices'}
			{#if slices.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.gameDomain.emptySlices')}
				</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each slices as s (s.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="min-w-0">
								<a href="/slices?q={s.id}" class="text-sm font-medium hover:text-primary">
									{s.title}
								</a>
								<p class="mt-0.5 text-[11px] text-text-muted">
									<Badge variant="default" size="sm">{s.status}</Badge>
									{#if s.claimed_by_user_id}
										<span class="ms-2">
											{i18n.t('admin.gameDomain.cols.claimed')}
											<a
												href="/users/{s.claimed_by_user_id}"
												class="font-mono hover:text-primary"
											>
												{s.claimed_by_user_id.slice(0, 8)}
											</a>
										</span>
									{/if}
								</p>
							</div>
							<Button
								variant="primary"
								size="sm"
								onclick={() => validateSlice(s.id)}
								loading={busySlice === s.id}
								disabled={busySlice !== null}
							>
								{i18n.t('admin.gameDomain.validateBtn')}
							</Button>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'jams'}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.gameDomain.jamCreateTitle')}
				</h2>
				<div class="flex flex-col gap-4">
					<Select
						items={kindOptions}
						bind:value={jamKind}
						placeholder={i18n.t('admin.gameDomain.jamKindLabel')}
						shape="rounded"
					/>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.gameDomain.jamSlugLabel')} bind:value={jamSlug} />
						<Input label={i18n.t('admin.gameDomain.jamNameLabel')} bind:value={jamName} />
					</div>
					<Input label={i18n.t('admin.gameDomain.jamThemeLabel')} bind:value={jamTheme} />
					<Input
						label={i18n.t('admin.gameDomain.jamDescriptionLabel')}
						bind:value={jamDescription}
					/>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label for="jam-starts" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.gameDomain.jamStartsLabel')}
							</label>
							<input
								id="jam-starts"
								type="datetime-local"
								bind:value={jamStarts}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="jam-ends" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.gameDomain.jamEndsLabel')}
							</label>
							<input
								id="jam-ends"
								type="datetime-local"
								bind:value={jamEnds}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="jam-sub" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.gameDomain.jamSubmissionLabel')}
							</label>
							<input
								id="jam-sub"
								type="datetime-local"
								bind:value={jamSubmission}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="jam-vote" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.gameDomain.jamVotingLabel')}
							</label>
							<input
								id="jam-vote"
								type="datetime-local"
								bind:value={jamVoting}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
					</div>
					<div class="w-40">
						<Input
							label={i18n.t('admin.gameDomain.jamTeamMaxLabel')}
							type="number"
							bind:value={jamTeamMax}
						/>
					</div>
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={createJam}
							disabled={!canCreateJam}
							loading={creatingJam}
							data-testid="create-jam"
						>
							{i18n.t('admin.gameDomain.jamCreateBtn')}
						</Button>
					</div>
				</div>
			</section>

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.gameDomain.jamFinalizeTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.gameDomain.jamFinalizeHint')}</p>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-64 flex-1">
						<Input label={i18n.t('admin.gameDomain.jamIdLabel')} bind:value={finalizeId} />
					</div>
					<Button
						variant="primary"
						size="sm"
						onclick={finalizeJam}
						disabled={finalizeId.trim() === '' || finalizing}
						loading={finalizing}
					>
						{i18n.t('admin.gameDomain.jamFinalizeBtn')}
					</Button>
				</div>
			</section>
		{:else if tab === 'attestations'}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.gameDomain.attShippedTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.gameDomain.attShippedHint')}</p>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.gameDomain.userIdLabel')} bind:value={stUser} />
						<Input
							label={i18n.t('admin.gameDomain.deliverableIdLabel')}
							bind:value={stDeliverable}
						/>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.gameDomain.gameTitleLabel')} bind:value={stTitle} />
						<Input label={i18n.t('admin.gameDomain.storeUrlLabel')} bind:value={stStore} />
					</div>
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={issueShipped}
							disabled={!canIssueShipped}
							loading={issuingShipped}
						>
							{i18n.t('admin.gameDomain.issueBtn')}
						</Button>
					</div>
				</div>
			</section>

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.gameDomain.attOpenSourceTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">
					{i18n.t('admin.gameDomain.attOpenSourceHint')}
				</p>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.gameDomain.userIdLabel')} bind:value={osUser} />
						<Input
							label={i18n.t('admin.gameDomain.deliverableIdLabel')}
							bind:value={osDeliverable}
						/>
					</div>
					<Input label={i18n.t('admin.gameDomain.prUrlLabel')} bind:value={osPr} />
					<Input label={i18n.t('admin.gameDomain.whatChangedLabel')} bind:value={osWhat} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={issueOpenSource}
							disabled={!canIssueOpenSource}
							loading={issuingOpenSource}
						>
							{i18n.t('admin.gameDomain.issueBtn')}
						</Button>
					</div>
				</div>
			</section>
		{:else}
			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.gameDomain.featuredTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.gameDomain.featuredHint')}</p>
				<div class="flex flex-col gap-4">
					<Input label={i18n.t('admin.gameDomain.userIdLabel')} bind:value={ftUser} />
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label for="ft-start" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.gameDomain.weekStartsLabel')}
							</label>
							<input
								id="ft-start"
								type="date"
								bind:value={ftStart}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="ft-end" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.gameDomain.weekEndsLabel')}
							</label>
							<input
								id="ft-end"
								type="date"
								bind:value={ftEnd}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
					</div>
					<Input label={i18n.t('admin.gameDomain.bioLabel')} bind:value={ftBio} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={feature}
							disabled={!canFeature}
							loading={featuring}
						>
							{i18n.t('admin.gameDomain.featureBtn')}
						</Button>
					</div>
				</div>
			</section>
		{/if}
	{/if}
</div>
