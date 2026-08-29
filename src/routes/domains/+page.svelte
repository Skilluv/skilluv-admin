<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { oversightApi, CREDENTIAL_NOTE_MIN } from '$api/oversight';
	import type {
		DomainFeaturedCandidate,
		DomainOverview,
		DomainReviewerStats,
		PendingCredential,
		TerrainProposal,
		ValidatorDomain
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Table from '$components/ui/Table.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, Info, ExternalLink } from '@lucide/svelte';

	type Tab = 'overview' | 'reviewers' | 'featured' | 'credentials' | 'terrains';

	const DOMAINS: ValidatorDomain[] = [
		'code',
		'design',
		'game',
		'security',
		'ops',
		'ai',
		'soft_skills'
	];

	let tab = $state<Tab>('overview');
	let domain = $state<ValidatorDomain>('design');
	let days = $state(30);

	let loading = $state(true);
	let overview = $state<DomainOverview | null>(null);
	let reviewers = $state<DomainReviewerStats[]>([]);
	let featured = $state<DomainFeaturedCandidate[]>([]);
	let credentials = $state<PendingCredential[]>([]);
	let terrains = $state<TerrainProposal[]>([]);

	/** Per-proposal drafts: two terrains decided in one sitting must not
	 *  share a project slug or a refusal reason. */
	let projectOf = $state<Record<string, string>>({});
	let declineOf = $state<Record<string, string>>({});
	let busyTerrain = $state<string | null>(null);

	/** Per-credential note drafts. A review note belongs to the credential it
	 *  was written about, and one shared field would move it. */
	let notes = $state<Record<string, string>>({});
	let busyCredential = $state<string | null>(null);

	function fmtDay(day: string | null): string {
		if (!day) return '—';
		const [y, m, d] = day.split('-').map(Number);
		if (!y || !m || !d) return day;
		return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	function round1(n: number | null): string {
		return n === null ? '—' : n.toFixed(1);
	}

	$effect(() => {
		void load(domain, days);
	});

	async function load(d: ValidatorDomain, window: number) {
		loading = true;
		try {
			// The domain calls are per-domain and the credential queue is not,
			// but they load together: the credentials tab is on this page
			// because reviewing an outside certification is the same job as
			// running a domain, and splitting it into its own route would put
			// a one-list page in the navigation.
			const [o, r, f, c, t] = await Promise.all([
				oversightApi.domainOverview(d, { days: window }),
				oversightApi.domainReviewers(d, { days: window }),
				oversightApi.domainFeaturedQueue(d, { days: window }),
				oversightApi.pendingCredentials(),
				oversightApi.domainTerrains(d)
			]);
			overview = o.data;
			reviewers = r.data;
			featured = f.data;
			credentials = c.data.credentials;
			terrains = t.data.terrains;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	function noteOf(id: string): string {
		return notes[id] ?? '';
	}

	function noteOk(id: string): boolean {
		return noteOf(id).trim().length >= CREDENTIAL_NOTE_MIN;
	}

	async function reviewCredential(id: string, verify: boolean) {
		if (!noteOk(id) || busyCredential) return;
		busyCredential = id;
		try {
			const note = noteOf(id).trim();
			if (verify) await oversightApi.verifyCredential(id, note);
			else await oversightApi.refuseCredential(id, note);
			toast.success(
				i18n.t(verify ? 'admin.oversight.credentialVerified' : 'admin.oversight.credentialRefused')
			);
			delete notes[id];
			await load(domain, days);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyCredential = null;
		}
	}

	async function adopt(t: TerrainProposal) {
		const project = (projectOf[t.slug] ?? '').trim();
		if (project === '' || busyTerrain) return;
		busyTerrain = t.slug;
		try {
			await oversightApi.adoptTerrain(domain, t.slug, project);
			toast.success(i18n.t('admin.oversight.terrainAdopted'));
			delete projectOf[t.slug];
			await load(domain, days);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyTerrain = null;
		}
	}

	async function decline(t: TerrainProposal) {
		const reason = (declineOf[t.slug] ?? '').trim();
		if (reason === '' || busyTerrain) return;
		busyTerrain = t.slug;
		try {
			await oversightApi.declineTerrain(domain, t.slug, reason);
			toast.success(i18n.t('admin.oversight.terrainDeclined'));
			delete declineOf[t.slug];
			await load(domain, days);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyTerrain = null;
		}
	}

	const domainOptions = $derived(DOMAINS.map((d) => ({ value: d, label: d })));

	const windowItems = $derived([
		{ value: 7, label: i18n.t('admin.oversight.days7') },
		{ value: 30, label: i18n.t('admin.oversight.days30') },
		{ value: 90, label: i18n.t('admin.oversight.days90') },
		{ value: 365, label: i18n.t('admin.oversight.days365') }
	]);

	const reviewerRows = $derived(reviewers.map((r) => r as unknown as Record<string, unknown>));
	const featuredRows = $derived(featured.map((f) => f as unknown as Record<string, unknown>));
</script>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.oversight.domainsNavLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.oversight.domainsLabel')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.oversight.domainsTitle')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">
				{i18n.t('admin.oversight.domainsSubtitle')}
			</p>
		</div>
		<Button variant="secondary" onclick={() => load(domain, days)} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-6 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<Info size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.oversight.curatorNote')}</span>
	</p>

	<div class="mb-6 flex flex-wrap items-center gap-4">
		<div class="w-44">
			<Select
				items={domainOptions}
				bind:value={domain}
				placeholder={i18n.t('admin.oversight.domainLabel')}
				shape="rounded"
			/>
		</div>
		<SegmentedControl items={windowItems} bind:value={days} />
	</div>

	<div class="mb-6">
		<SegmentedControl
			items={[
				{ value: 'overview', label: i18n.t('admin.oversight.tabs.overview') },
				{ value: 'reviewers', label: i18n.t('admin.oversight.tabs.reviewers') },
				{ value: 'featured', label: i18n.t('admin.oversight.tabs.featured') },
				{ value: 'credentials', label: i18n.t('admin.oversight.tabs.credentials') },
				{ value: 'terrains', label: i18n.t('admin.oversight.tabs.terrains') }
			]}
			bind:value={tab}
		/>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(4) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else if tab === 'overview'}
		{#if overview}
			<!-- Declared and active sit side by side deliberately: the gap
			     between them is the figure a curator has to see, and putting
			     them apart would let a healthy-looking total stand alone. -->
			<div class="mb-4 grid grid-cols-2 gap-3">
				<StatCard
					label={i18n.t('admin.oversight.stats.declared')}
					value={overview.declared_trades}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.active')}
					value={overview.active_contributors}
					hint={i18n.t('admin.oversight.stats.activeHint')}
					color={overview.active_contributors === 0 && overview.declared_trades > 0
						? 'warning'
						: 'default'}
				/>
			</div>

			<div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard
					label={i18n.t('admin.oversight.stats.challengesPublished')}
					value={overview.challenges_published}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.challengesDraft')}
					value={overview.challenges_draft}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.contestsRunning')}
					value={overview.contests_running}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.contestsConcluded')}
					value={overview.contests_concluded_in_window}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.missionsInProgress')}
					value={overview.missions_in_progress}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.missionsDelivered')}
					value={overview.missions_delivered_in_window}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.reviewsPending')}
					value={overview.reviews_pending}
					color={overview.reviews_pending > 0 ? 'warning' : 'success'}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.oldestReview')}
					value={overview.oldest_pending_review_hours === null
						? i18n.t('admin.oversight.stats.nothingWaiting')
						: `${Math.round(overview.oldest_pending_review_hours)} ${i18n.t('admin.oversight.hours')}`}
					hint={i18n.t('admin.oversight.stats.oldestReviewHint')}
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<StatCard
					label={i18n.t('admin.oversight.stats.meanRounds')}
					value={round1(overview.mean_rounds_to_approval)}
					hint={i18n.t('admin.oversight.stats.meanRoundsHint')}
				/>
				<StatCard
					label={i18n.t('admin.oversight.stats.lastFeatured')}
					value={fmtDay(overview.last_featured_week)}
				/>
			</div>
		{/if}
	{:else if tab === 'reviewers'}
		<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.oversight.reviewersNote')}</span>
		</p>
		<Table
			columns={[
				{ key: 'reviewer', label: i18n.t('admin.oversight.cols.reviewer') },
				{ key: 'families', label: i18n.t('admin.oversight.cols.families'), width: '20%' },
				{
					key: 'decisions',
					label: i18n.t('admin.oversight.cols.decisions'),
					align: 'right',
					width: '10%'
				},
				{
					key: 'split',
					label: i18n.t('admin.oversight.cols.approved'),
					align: 'right',
					width: '18%'
				},
				{
					key: 'meanHours',
					label: i18n.t('admin.oversight.cols.meanHours'),
					align: 'right',
					width: '12%'
				},
				{
					key: 'openNow',
					label: i18n.t('admin.oversight.cols.openNow'),
					align: 'right',
					width: '10%'
				}
			]}
			rows={reviewerRows}
			emptyLabel={i18n.t('admin.oversight.emptyReviewers')}
		>
			{#snippet cell(row, col)}
				{@const r = row as unknown as DomainReviewerStats}
				{#if col.key === 'reviewer'}
					<a href="/users/{r.user_id}" class="text-sm font-medium hover:text-primary">
						{r.display_name}
					</a>
					<span class="ms-2 text-[11px] text-text-muted">{r.username}</span>
				{:else if col.key === 'families'}
					<span class="flex flex-wrap gap-1">
						{#each r.families as f (f)}
							<Badge variant="default" size="sm">{f}</Badge>
						{/each}
					</span>
				{:else if col.key === 'decisions'}
					<span class="font-mono text-sm">{r.decisions_total}</span>
				{:else if col.key === 'split'}
					<span class="font-mono text-xs">
						<span class="text-success">{r.approved}</span>
						/ <span class="text-warning">{r.iterations_asked}</span>
						/ <span class="text-error">{r.rejected}</span>
					</span>
				{:else if col.key === 'meanHours'}
					<span class="font-mono text-xs">
						{r.mean_hours_to_decide === null
							? i18n.t('admin.oversight.neverDecided')
							: round1(r.mean_hours_to_decide)}
					</span>
				{:else if col.key === 'openNow'}
					<span class="font-mono text-sm {r.open_now > 5 ? 'text-warning' : ''}">
						{r.open_now}
					</span>
				{/if}
			{/snippet}
		</Table>
	{:else if tab === 'featured'}
		<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.oversight.featuredNote')}</span>
		</p>
		<Table
			columns={[
				{ key: 'candidate', label: i18n.t('admin.oversight.cols.candidate') },
				{
					key: 'approved',
					label: i18n.t('admin.oversight.cols.approvedInWindow'),
					align: 'right',
					width: '20%'
				},
				{
					key: 'craft',
					label: i18n.t('admin.oversight.cols.craft'),
					align: 'right',
					width: '16%'
				},
				{
					key: 'last',
					label: i18n.t('admin.oversight.cols.lastFeatured'),
					align: 'right',
					width: '20%'
				}
			]}
			rows={featuredRows}
			emptyLabel={i18n.t('admin.oversight.emptyFeatured')}
		>
			{#snippet cell(row, col)}
				{@const f = row as unknown as DomainFeaturedCandidate}
				{#if col.key === 'candidate'}
					<a href="/users/{f.user_id}" class="text-sm font-medium hover:text-primary">
						{f.display_name}
					</a>
					<span class="ms-2 text-[11px] text-text-muted">{f.username}</span>
				{:else if col.key === 'approved'}
					<span class="font-mono text-sm">{f.approved_in_window}</span>
				{:else if col.key === 'craft'}
					<span class="font-mono text-xs text-text-muted">{f.craft_score}</span>
				{:else if col.key === 'last'}
					<span class="text-xs text-text-muted">
						{f.last_featured_on
							? fmtDay(f.last_featured_on)
							: i18n.t('admin.oversight.neverFeatured')}
					</span>
				{/if}
			{/snippet}
		</Table>
	{:else if tab === 'credentials'}
		<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
			{i18n.t('admin.oversight.credentialsTitle')}
		</h2>
		<p class="mb-5 flex items-start gap-2 text-xs text-text-muted">
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.oversight.credentialsNote')}</span>
		</p>

		{#if credentials.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.oversight.emptyCredentials')}
			</p>
		{:else}
			<ul class="flex flex-col gap-4">
				{#each credentials as c (c.id)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="text-sm font-semibold">{c.name}</h3>
								<p class="mt-0.5 text-xs text-text-muted">
									{c.issuer}{c.level ? ` · ${c.level}` : ''} · {c.username}
								</p>
								<p class="mt-0.5 text-[11px] text-text-muted">
									{i18n.t('admin.oversight.cols.issued')} {fmtDay(c.issued_on)}
									{#if c.expires_on}
										· {i18n.t('admin.oversight.cols.expires')} {fmtDay(c.expires_on)}
									{/if}
								</p>
							</div>
							<span class="flex items-center gap-2">
								<Badge variant={c.is_current ? 'success' : 'default'} size="sm">
									{c.is_current
										? i18n.t('admin.oversight.current')
										: i18n.t('admin.oversight.lapsed')}
								</Badge>
								<a
									href={c.evidence_url}
									target="_blank"
									rel="noopener nofollow"
									class="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
								>
									<ExternalLink size={11} strokeWidth={2} />
									{i18n.t('admin.oversight.cols.issuer')}
								</a>
							</span>
						</div>

						<div class="flex flex-col gap-3">
							<Input
								label={i18n.t('admin.oversight.noteLabel')}
								hint={i18n.t('admin.oversight.noteHint', { n: CREDENTIAL_NOTE_MIN })}
								value={noteOf(c.id)}
								oninput={(e: Event) => (notes[c.id] = (e.target as HTMLInputElement).value)}
								error={noteOf(c.id).length > 0 && !noteOk(c.id)
									? i18n.t('admin.oversight.noteTooShort', { n: CREDENTIAL_NOTE_MIN })
									: undefined}
							/>
							<div class="flex flex-wrap gap-2">
								<Button
									variant="primary"
									size="sm"
									onclick={() => reviewCredential(c.id, true)}
									disabled={!noteOk(c.id) || busyCredential !== null}
									loading={busyCredential === c.id}
								>
									{i18n.t('admin.oversight.verifyBtn')}
								</Button>
								<Button
									variant="secondary"
									size="sm"
									onclick={() => reviewCredential(c.id, false)}
									disabled={!noteOk(c.id) || busyCredential !== null}
								>
									{i18n.t('admin.oversight.refuseBtn')}
								</Button>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p class="mb-5 flex items-start gap-2 text-xs text-text-muted">
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.oversight.terrainsNote')}</span>
		</p>

		{#if terrains.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.oversight.emptyTerrains')}
			</p>
		{:else}
			<ul class="flex flex-col gap-4">
				{#each terrains as t (t.slug)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
							<span class="text-sm font-semibold">
								{t.name ?? t.title ?? t.slug}
								<code class="ms-2 font-mono text-[10px] text-text-muted">{t.slug}</code>
							</span>
							{#if t.status}
								<Badge variant="default" size="sm">{t.status}</Badge>
							{/if}
						</div>

						<div class="flex flex-col gap-3">
							<div class="flex flex-wrap items-end gap-3">
								<div class="min-w-48 flex-1">
									<Input
										label={i18n.t('admin.oversight.projectSlugLabel')}
										hint={i18n.t('admin.oversight.projectSlugHint')}
										value={projectOf[t.slug] ?? ''}
										oninput={(e: Event) =>
											(projectOf[t.slug] = (e.target as HTMLInputElement).value)}
									/>
								</div>
								<Button
									variant="primary"
									size="sm"
									onclick={() => adopt(t)}
									disabled={(projectOf[t.slug] ?? '').trim() === '' || busyTerrain !== null}
									loading={busyTerrain === t.slug}
								>
									{i18n.t('admin.oversight.adoptBtn')}
								</Button>
							</div>

							<div class="flex flex-wrap items-end gap-3 border-t border-border pt-3">
								<div class="min-w-48 flex-1">
									<Input
										label={i18n.t('admin.oversight.declineReasonLabel')}
										hint={i18n.t('admin.oversight.declineReasonHint')}
										value={declineOf[t.slug] ?? ''}
										oninput={(e: Event) =>
											(declineOf[t.slug] = (e.target as HTMLInputElement).value)}
									/>
								</div>
								<Button
									variant="secondary"
									size="sm"
									onclick={() => decline(t)}
									disabled={(declineOf[t.slug] ?? '').trim() === '' || busyTerrain !== null}
								>
									{i18n.t('admin.oversight.declineBtn')}
								</Button>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
