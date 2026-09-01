<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { securityApi, type CuratedBountyInput } from '$api/security';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import {
		SECURITY_FINDING_STATUSES,
		SECURITY_SEVERITY_TIERS,
		SECURITY_TARGET_KINDS,
		type ExternalBountyClaim,
		type ExternalBountyProgramme,
		type NewLabQuestion,
		type NewSecurityChallenge,
		type SecurityDedupPair,
		type SecurityFindingRow,
		type SecurityFindingStatus,
		type SecurityHallOfFame,
		type SecurityOverview,
		type SecurityResearchToken,
		type SecuritySeverityTier,
		type SecurityTargetKind
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Table from '$components/ui/Table.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import {
		ChevronRight,
		ExternalLink,
		Info,
		Plus,
		RefreshCw,
		ShieldAlert,
		Timer,
		Trash2
	} from '@lucide/svelte';

	// Skilluv Cyber — the queue side of a disclosure programme (SKI-127,
	// SKI-120, plus the W-01..W-05 workflow tickets).
	//
	// Six surfaces, and they are separate because they are worked by
	// different people at different rhythms: the queue every day, the
	// duplicate pairs when a scanner speaks up, the external claims when
	// somebody files one, the programmes once a quarter, the catalogue when
	// a challenge is written, the public record when somebody asks how the
	// programme is doing.

	type Tab =
		| 'findings'
		| 'dedup'
		| 'claims'
		| 'programmes'
		| 'catalogue'
		| 'tokens'
		| 'record';

	const TABS: Tab[] = [
		'findings',
		'dedup',
		'claims',
		'programmes',
		'catalogue',
		'tokens',
		'record'
	];

	function tabFromUrl(url: URL): Tab {
		const t = url.searchParams.get('tab');
		return TABS.includes(t as Tab) ? (t as Tab) : 'findings';
	}

	let tab = $state<Tab>(tabFromUrl($page.url));

	// --- Queue filters, persisted in the URL ---
	//
	// The ticket asks for it and it is the right call for a queue somebody
	// works in a browser tab all day: a filtered view is a thing you send to
	// a colleague, and a filter that lives only in memory cannot be sent.
	let status = $state<SecurityFindingStatus | ''>(
		($page.url.searchParams.get('status') ?? '') as SecurityFindingStatus | ''
	);
	let severity = $state<SecuritySeverityTier | ''>(
		($page.url.searchParams.get('severity') ?? '') as SecuritySeverityTier | ''
	);
	let targetKind = $state<SecurityTargetKind | ''>(
		($page.url.searchParams.get('target') ?? '') as SecurityTargetKind | ''
	);
	let suspectedOnly = $state($page.url.searchParams.get('dupes') === '1');
	let limit = $state(Number($page.url.searchParams.get('limit') ?? 50));

	let findings = $state<SecurityFindingRow[]>([]);
	let findingsLoading = $state(true);
	let overview = $state<SecurityOverview | null>(null);

	// --- Research tokens ---
	let tokens = $state<SecurityResearchToken[]>([]);
	let tokensLoading = $state(false);
	let tokensActiveOnly = $state(false);
	let tokensQuery = $state('');
	let tokenToRevoke = $state<SecurityResearchToken | null>(null);
	let revokingToken = $state(false);

	// --- The other five ---
	let pairs = $state<SecurityDedupPair[]>([]);
	let dedupNote = $state('');
	let dedupLoading = $state(false);

	let claims = $state<ExternalBountyClaim[]>([]);
	let claimsLoading = $state(false);

	let programmes = $state<ExternalBountyProgramme[]>([]);
	let programmesLoading = $state(false);

	let record = $state<SecurityHallOfFame | null>(null);
	let recordLoading = $state(false);

	let sweeping = $state(false);

	$effect(() => {
		const current = tab;
		untrack(() => void loadTab(current));
	});

	async function loadTab(t: Tab) {
		switch (t) {
			case 'findings':
				return loadFindings();
			case 'dedup':
				return loadDedup();
			case 'claims':
				return loadClaims();
			case 'programmes':
				return loadProgrammes();
			case 'tokens':
				return loadTokens();
			case 'record':
				return loadRecord();
			default:
				return;
		}
	}

	/** Mirror the tab and the queue filters into the URL, without pushing a
	 *  history entry per keystroke. */
	function syncUrl() {
		const params = new URLSearchParams();
		if (tab !== 'findings') params.set('tab', tab);
		if (status) params.set('status', status);
		if (severity) params.set('severity', severity);
		if (targetKind) params.set('target', targetKind);
		if (suspectedOnly) params.set('dupes', '1');
		if (limit !== 50) params.set('limit', String(limit));
		const qs = params.toString();
		void goto(qs ? `/security?${qs}` : '/security', {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function switchTab(next: Tab) {
		tab = next;
		syncUrl();
	}

	/**
	 * The overview travels with the queue rather than on its own timer.
	 *
	 * They are the same screen and the operator reads them together; letting
	 * the tiles lag a refresh behind the rows they summarise is how a count
	 * ends up contradicting the list underneath it.
	 */
	async function loadOverview() {
		try {
			const res = await securityApi.overview();
			overview = res.data;
		} catch {
			// A failed aggregate must not cost the queue. The tiles simply do
			// not render — better than showing stale or invented numbers next
			// to rows that did load.
			overview = null;
		}
	}

	async function loadFindings() {
		findingsLoading = true;
		void loadOverview();
		try {
			const res = await securityApi.queue({
				status: status || undefined,
				severity: severity || undefined,
				target_kind: targetKind || undefined,
				suspected_duplicates: suspectedOnly || undefined,
				limit
			});
			findings = res.data.findings;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			findingsLoading = false;
		}
	}

	function applyFilters() {
		syncUrl();
		void loadFindings();
	}

	async function loadDedup() {
		dedupLoading = true;
		try {
			const res = await securityApi.dedupQueue();
			pairs = res.data.pairs;
			dedupNote = res.data.note;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			dedupLoading = false;
		}
	}

	async function loadClaims() {
		claimsLoading = true;
		try {
			const res = await securityApi.bountyClaims();
			claims = res.data.claims;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			claimsLoading = false;
		}
	}

	async function loadProgrammes() {
		programmesLoading = true;
		try {
			const res = await securityApi.listBountyProgrammes();
			programmes = res.data.programmes;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			programmesLoading = false;
		}
	}

	async function loadRecord() {
		recordLoading = true;
		try {
			const res = await securityApi.hallOfFame();
			record = res.data;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			recordLoading = false;
		}
	}

	async function sweepEmbargoes() {
		sweeping = true;
		try {
			const res = await securityApi.sweepEmbargoes();
			toast.success(
				i18n.t('admin.security.embargo.swept', {
					expired: res.data.expired,
					reminded: res.data.reminded
				})
			);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			sweeping = false;
		}
	}

	async function loadTokens() {
		tokensLoading = true;
		try {
			const res = await securityApi.researchTokens({
				active_only: tokensActiveOnly || undefined,
				q: tokensQuery.trim() || undefined
			});
			tokens = res.data.tokens;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			tokensLoading = false;
		}
	}

	async function revokeToken(reason: string) {
		if (!tokenToRevoke) return;
		revokingToken = true;
		try {
			await securityApi.revokeResearchToken(tokenToRevoke.id);
			toast.success(t('admin.security.tokens.revokedToast'));
			tokenToRevoke = null;
			await loadTokens();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			revokingToken = false;
		}
		// The reason is collected by the dialog for the operator's own
		// benefit and for the audit trail the backend writes; the revoke
		// endpoint records `by_operator` itself and takes no body.
		void reason;
	}

	// ── External claims ──────────────────────────────────────────

	let claimToVerify = $state<ExternalBountyClaim | null>(null);
	let verifySeverity = $state<SecuritySeverityTier>('medium');
	let verifying = $state(false);

	async function verifyClaim() {
		if (!claimToVerify) return;
		verifying = true;
		try {
			const res = await securityApi.verifyBountyClaim(claimToVerify.id, verifySeverity);
			toast.success(
				i18n.t('admin.security.claims.verified', { code: res.data.verification_code })
			);
			claimToVerify = null;
			await loadClaims();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			verifying = false;
		}
	}

	let claimToRefuse = $state<ExternalBountyClaim | null>(null);
	let refusing = $state(false);

	async function refuseClaim(reason: string) {
		if (!claimToRefuse) return;
		refusing = true;
		try {
			await securityApi.refuseBountyClaim(claimToRefuse.id, reason);
			toast.success(i18n.t('admin.security.claims.refused'));
			claimToRefuse = null;
			await loadClaims();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			refusing = false;
		}
	}

	// ── Curated programmes ───────────────────────────────────────

	let programmeOpen = $state(false);
	let programmeSaving = $state(false);
	// The three optional strings are spelled required here, and that is not
	// cosmetic. `<Input>` declares `value` with a fallback, and Svelte throws
	// `props_invalid_value` while rendering when an `undefined` is bound to
	// such a prop — the dialog then never appears and the page reports the
	// error to a console nobody is watching. A `bind:value={x as string}`
	// asserted a string that need not be there and hid exactly that from the
	// type checker; it cost a full CI cycle to find on the findings screen.
	type ProgrammeForm = CuratedBountyInput &
		Required<Pick<CuratedBountyInput, 'scope_summary' | 'payout_range' | 'retired_reason'>> & {
			topicsRaw: string;
		};

	let programme = $state<ProgrammeForm>({
		platform: '',
		program_slug: '',
		program_url: '',
		organisation_name: '',
		scope_summary: '',
		payout_range: '',
		pays_money: true,
		discloses_reports: false,
		is_active: true,
		retired_reason: '',
		topicsRaw: ''
	});

	function resetProgramme() {
		programme = {
			platform: '',
			program_slug: '',
			program_url: '',
			organisation_name: '',
			scope_summary: '',
			payout_range: '',
			pays_money: true,
			discloses_reports: false,
			is_active: true,
			retired_reason: '',
			topicsRaw: ''
		};
	}

	async function saveProgramme() {
		programmeSaving = true;
		try {
			const { topicsRaw, ...rest } = programme;
			await securityApi.curateBountyProgramme({
				...rest,
				scope_summary: rest.scope_summary || undefined,
				payout_range: rest.payout_range || undefined,
				retired_reason: rest.retired_reason || undefined,
				skill_topics: topicsRaw
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean)
			});
			toast.success(i18n.t('admin.security.programmes.saved'));
			programmeOpen = false;
			resetProgramme();
			await loadProgrammes();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			programmeSaving = false;
		}
	}

	// ── The catalogue ────────────────────────────────────────────

	let challengeOpen = $state(false);
	let challengeSaving = $state(false);
	// Same reason as `ProgrammeForm` above: every string the form binds is a
	// string, never `undefined`.
	// A question as the form holds it: `hint` is a string because an input
	// cannot hold anything else. The payload wants null for "no hint", and
	// that conversion happens at submit.
	type QuestionForm = Omit<NewLabQuestion, 'hint'> & { hint: string };

	// `Omit` and not an intersection: `A & { questions: QuestionForm[] }`
	// keeps both shapes and yields `NewLabQuestion[] & QuestionForm[]`, which
	// nothing satisfies. Narrowing a field means removing it first.
	type ChallengeForm = Omit<
		NewSecurityChallenge,
		'flag' | 'flag_format' | 'target_url' | 'lab_artifact_key' | 'attribution_md' | 'questions'
	> & {
		flag: string;
		flag_format: string;
		target_url: string;
		lab_artifact_key: string;
		attribution_md: string;
		questions: QuestionForm[];
	};

	let challenge = $state<ChallengeForm>({
		title: '',
		description: '',
		instructions: '',
		kind: 'ctf_flag',
		difficulty: 3,
		difficulty_tier: 'medium',
		reward_fragments: 100,
		duration_minutes: null,
		flag: '',
		flag_format: '',
		target_url: '',
		lab_artifact_key: '',
		lab_artifact_bytes: null,
		questions: [],
		pass_percent: 80,
		max_attempts: 3,
		attribution_md: ''
	});

	function addQuestion() {
		const q: QuestionForm = {
			id: `q${(challenge.questions?.length ?? 0) + 1}`,
			kind: 'text',
			question: '',
			answer: '',
			choices: [],
			hint: '',
			case_sensitive: false
		};
		challenge.questions = [...(challenge.questions ?? []), q];
	}

	function removeQuestion(index: number) {
		challenge.questions = (challenge.questions ?? []).filter((_, i) => i !== index);
	}

	async function saveChallenge() {
		challengeSaving = true;
		try {
			const isFlag = challenge.kind === 'ctf_flag';
			const body: NewSecurityChallenge = {
				title: challenge.title,
				description: challenge.description,
				instructions: challenge.instructions,
				kind: challenge.kind,
				difficulty: Number(challenge.difficulty),
				difficulty_tier: challenge.difficulty_tier,
				reward_fragments: Number(challenge.reward_fragments),
				duration_minutes: challenge.duration_minutes
					? Number(challenge.duration_minutes)
					: null,
				attribution_md: challenge.attribution_md || null,
				// Each kind sends only what it needs: the backend refuses a
				// flag challenge without a format and a lab without questions,
				// and sending the other kind's fields as empty strings would
				// turn a clear 400 into a confusing one.
				...(isFlag
					? {
							flag: challenge.flag,
							flag_format: challenge.flag_format,
							target_url: challenge.target_url
						}
					: {
							lab_artifact_key: challenge.lab_artifact_key,
							lab_artifact_bytes: challenge.lab_artifact_bytes
								? Number(challenge.lab_artifact_bytes)
								: null,
							// The form binds `hint` as a string because an input
							// cannot hold anything else; the payload wants null
							// for "no hint", so the conversion happens here
							// rather than by binding a null to an <Input>.
							questions: (challenge.questions ?? []).map((q) => ({
								...q,
								hint: q.hint?.trim() ? q.hint.trim() : null
							})),
							pass_percent: Number(challenge.pass_percent),
							max_attempts: Number(challenge.max_attempts)
						})
			};
			const res = await securityApi.createChallenge(body);
			toast.success(i18n.t('admin.security.catalogue.created', { id: res.data.id }));
			challengeOpen = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			challengeSaving = false;
		}
	}

	// ── Labels ───────────────────────────────────────────────────

	const t = (k: string, params?: Record<string, string | number>) => i18n.t(k, params);

	function statusLabel(s: string): string {
		return t(`admin.security.statuses.${s}`);
	}

	function severityLabel(s: string): string {
		return t(`admin.security.severities.${s}`);
	}

	function severityVariant(s: SecuritySeverityTier): 'error' | 'warning' | 'accent' | 'default' {
		if (s === 'critical' || s === 'high') return 'error';
		if (s === 'medium') return 'warning';
		if (s === 'low') return 'accent';
		return 'default';
	}

	function statusVariant(s: SecurityFindingStatus): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'published' || s === 'fixed' || s === 'confirmed') return 'success';
		if (s === 'submitted' || s === 'triaged') return 'warning';
		if (s === 'duplicate' || s === 'not_applicable' || s === 'withdrawn') return 'error';
		return 'default';
	}

	function reporterName(row: SecurityFindingRow): string {
		if (row.reporter.anonymous || !row.reporter.username) {
			return t('admin.security.anonymous');
		}
		return row.reporter.username;
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleString(intlLocale(), {
				dateStyle: 'short',
				timeStyle: 'short'
			});
		} catch {
			return iso;
		}
	}

	function fmtDay(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleDateString(intlLocale());
		} catch {
			return iso;
		}
	}

	const statusItems = $derived([
		{ value: '', label: t('admin.security.filters.all') },
		...SECURITY_FINDING_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))
	]);
	const severityItems = $derived([
		{ value: '', label: t('admin.security.filters.all') },
		...SECURITY_SEVERITY_TIERS.map((s) => ({ value: s, label: severityLabel(s) }))
	]);
	const targetItems = $derived([
		{ value: '', label: t('admin.security.filters.all') },
		...SECURITY_TARGET_KINDS.map((s) => ({
			value: s,
			label: t(`admin.security.targets.${s}`)
		}))
	]);
	const severityOnlyItems = $derived(
		SECURITY_SEVERITY_TIERS.map((s) => ({ value: s, label: severityLabel(s) }))
	);

	const queueColumns = $derived([
		{ key: 'severity', label: t('admin.security.table.severity'), width: '130px' },
		{ key: 'title', label: t('admin.security.table.title') },
		{ key: 'target', label: t('admin.security.table.target'), width: '170px' },
		{ key: 'reporter', label: t('admin.security.table.reporter'), width: '150px' },
		{ key: 'status', label: t('admin.security.table.status'), width: '130px' },
		{ key: 'age', label: t('admin.security.table.age'), width: '90px', align: 'right' as const }
	]);

	const queueRows = $derived(findings as unknown as Record<string, unknown>[]);
</script>

<svelte:head>
	<title>{t('admin.security.navLabel')} — Admin Skilluv</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{t('admin.security.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{t('admin.security.label')}
			</p>
			<h1 class="flex items-center gap-3 text-3xl font-black tracking-tight sm:text-4xl">
				<ShieldAlert size={28} strokeWidth={2} class="text-error" />
				{t('admin.security.title')}
			</h1>
			<p class="mt-3 max-w-2xl text-sm text-text-muted">{t('admin.security.subtitle')}</p>
		</div>
		<Button variant="secondary" size="sm" onclick={sweepEmbargoes} loading={sweeping}>
			<Timer size={14} strokeWidth={2} />
			{t('admin.security.embargo.sweep')}
		</Button>
	</div>

	<p
		class="mb-6 flex items-start gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-xs text-text-muted"
	>
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{t('admin.security.actorNotice')} {t('admin.security.embargo.sweepHint')}</span>
	</p>

	<div class="mb-6">
		<SegmentedControl
			size="md"
			items={TABS.map((value) => ({
				value,
				label: t(
					`admin.security.tab${value.charAt(0).toUpperCase()}${value.slice(1)}`
				)
			}))}
			value={tab}
			onchange={(v: Tab) => switchTab(v)}
		/>
	</div>

	{#if tab === 'findings'}
		{#if overview}
			<section class="mb-6">
				<div class="mb-2 flex flex-wrap items-center gap-2">
					<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.overview.title')}
					</h2>
					<Badge variant="default">
						{t('admin.security.overview.slaDaysLabel', { n: overview.triage_sla_days })}
					</Badge>
				</div>
				<p class="mb-3 text-xs text-text-muted">{t('admin.security.overview.hint')}</p>

				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<StatCard
						label={t('admin.security.overview.slaBreach')}
						value={overview.breaching_triage_sla}
						color={overview.breaching_triage_sla > 0 ? 'error' : 'success'}
						hint={t('admin.security.overview.slaHint')}
					/>
					<StatCard
						label={t('admin.security.overview.oldestUntriaged')}
						value={overview.oldest_untriaged_hours === null
							? t('admin.security.overview.noneWaiting')
							: `${overview.oldest_untriaged_hours}${t('admin.security.hoursShort')}`}
						color={overview.oldest_untriaged_hours === null ? 'success' : 'warning'}
					/>
					<StatCard
						label={t('admin.security.overview.openRounds')}
						value={overview.open_rounds}
					/>
					<StatCard
						label={t('admin.security.overview.embargoesOverdue')}
						value={overview.embargoes_overdue}
						color={overview.embargoes_overdue > 0 ? 'error' : 'default'}
					/>
					<StatCard
						label={t('admin.security.overview.embargoes7d')}
						value={overview.embargoes_expiring_7d}
						color={overview.embargoes_expiring_7d > 0 ? 'warning' : 'default'}
					/>
					<StatCard
						label={t('admin.security.overview.suspectedDuplicates')}
						value={overview.suspected_duplicates}
					/>
				</div>

				<div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-muted">
					<span class="flex flex-wrap items-center gap-1.5">
						<span class="uppercase tracking-wider">
							{t('admin.security.overview.byStatus')}
						</span>
						{#each Object.entries(overview.by_status) as [k, n] (k)}
							<Badge variant={statusVariant(k as SecurityFindingStatus)}>
								{statusLabel(k)}&nbsp;{n}
							</Badge>
						{/each}
					</span>
					<span class="flex flex-wrap items-center gap-1.5">
						<span class="uppercase tracking-wider">
							{t('admin.security.overview.bySeverity')}
						</span>
						{#each Object.entries(overview.by_severity) as [k, n] (k)}
							<Badge variant={severityVariant(k as SecuritySeverityTier)}>
								{severityLabel(k)}&nbsp;{n}
							</Badge>
						{/each}
					</span>
				</div>
			</section>
		{/if}

		<p class="mb-4 text-xs text-text-muted">{t('admin.security.queueHint')}</p>

		<div class="mb-5 flex flex-wrap items-end gap-3">
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{t('admin.security.filters.status')}
				</span>
				<Select items={statusItems} bind:value={status} shape="rounded" />
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{t('admin.security.filters.severity')}
				</span>
				<Select items={severityItems} bind:value={severity} shape="rounded" />
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{t('admin.security.filters.targetKind')}
				</span>
				<Select items={targetItems} bind:value={targetKind} shape="rounded" />
			</label>
			<Input
				label={t('admin.security.filters.limit')}
				type="number"
				min="1"
				max="200"
				bind:value={limit as unknown as string}
				class="w-24"
			/>
			<label class="flex h-11 items-center gap-2 text-sm text-text-muted">
				<input
					type="checkbox"
					bind:checked={suspectedOnly}
					class="h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
				/>
				{t('admin.security.filters.suspectedDuplicates')}
			</label>
			<Button variant="primary" size="sm" onclick={applyFilters} loading={findingsLoading}>
				<RefreshCw size={14} strokeWidth={2} />
				{t('admin.common.refreshBtn')}
			</Button>
		</div>

		{#if findingsLoading}
			<Skeleton class="h-64 w-full" rounded="xl" />
		{:else}
			<Table
				columns={queueColumns}
				rows={queueRows}
				emptyLabel={t('admin.security.empty')}
			>
				{#snippet cell(row, col)}
					{@const f = row as unknown as SecurityFindingRow}
					{#if col.key === 'severity'}
						<Badge variant={severityVariant(f.severity_tier)}>
							{severityLabel(f.severity_tier)}
						</Badge>
						{#if f.severity_tier !== f.severity_reported_tier}
							<p class="mt-1 text-[10px] text-text-muted">
								{t('admin.security.reportedAs')}
								{severityLabel(f.severity_reported_tier)}
							</p>
						{/if}
					{:else if col.key === 'title'}
						<a
							href={`/security/findings/${f.id}`}
							class="text-sm font-medium text-text-primary hover:text-primary hover:underline"
						>
							{f.title}
						</a>
						<div class="mt-1 flex flex-wrap items-center gap-1.5">
							{#if f.cwe_id}
								<Badge variant="default">{f.cwe_id}</Badge>
							{/if}
							{#if f.open_round}
								<Badge variant="warning">{t('admin.security.openRound')}</Badge>
							{/if}
							{#if f.dedup_state !== 'original'}
								<Badge variant="error">
									{t(`admin.security.dedupStates.${f.dedup_state}`)}
								</Badge>
							{/if}
							{#if f.similar_count > 0}
								<span class="text-[10px] text-text-muted">
									{t('admin.security.similarCount', { n: f.similar_count })}
								</span>
							{/if}
						</div>
					{:else if col.key === 'target'}
						<Badge variant="security">
							{t(`admin.security.targets.${f.target_kind}`)}
						</Badge>
						{#if f.target_host}
							<p class="mt-1 break-all font-mono text-[10px] text-text-muted">
								{f.target_host}
							</p>
						{/if}
						{#if f.affected_endpoint}
							<p class="break-all font-mono text-[10px] text-text-muted">
								{f.affected_endpoint}
							</p>
						{/if}
					{:else if col.key === 'reporter'}
						<span class="text-xs text-text-primary">{reporterName(f)}</span>
						{#if f.reporter.rank}
							<p class="text-[10px] text-text-muted">{f.reporter.rank}</p>
						{/if}
					{:else if col.key === 'status'}
						<Badge variant={statusVariant(f.status)}>{statusLabel(f.status)}</Badge>
					{:else if col.key === 'age'}
						<span class="font-mono text-xs text-text-muted">
							{Math.round(f.age_hours)}{t('admin.security.hoursShort')}
						</span>
					{/if}
				{/snippet}
			</Table>
		{/if}
	{:else if tab === 'dedup'}
		<p class="mb-4 text-xs text-text-muted">{t('admin.security.dedup.hint')}</p>

		{#if dedupLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else if pairs.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
				<p class="text-sm text-text-muted">{t('admin.security.dedup.empty')}</p>
			</div>
		{:else}
			{#if dedupNote}
				<p class="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning">
					{dedupNote}
				</p>
			{/if}
			<div class="space-y-3">
				{#each pairs as p (p.id)}
					<article class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant={severityVariant(p.severity_tier)}>
								{severityLabel(p.severity_tier)}
							</Badge>
							<a
								href={`/security/findings/${p.id}`}
								class="text-sm font-medium text-text-primary hover:text-primary hover:underline"
							>
								{p.title}
							</a>
							<span class="font-mono text-[10px] text-text-muted">
								{fmtDate(p.created_at)}
							</span>
						</div>

						<p class="mt-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
							{t('admin.security.dedup.candidates')}
						</p>
						<ul class="mt-2 space-y-1.5">
							{#each p.candidates ?? [] as c (c.id)}
								<li
									class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2"
								>
									<Badge variant="default">{(c.score * 100).toFixed(0)}%</Badge>
									<a
										href={`/security/findings/${c.id}`}
										class="text-xs text-primary hover:underline"
									>
										{c.title}
									</a>
									<Badge variant={statusVariant(c.status)}>
										{statusLabel(c.status)}
									</Badge>
									<span class="font-mono text-[10px] text-text-muted">
										{fmtDate(c.created_at)}
									</span>
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		{/if}
	{:else if tab === 'claims'}
		<p class="mb-4 text-xs text-text-muted">{t('admin.security.claims.hint')}</p>

		{#if claimsLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else if claims.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
				<p class="text-sm text-text-muted">{t('admin.security.claims.empty')}</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each claims as c (c.id)}
					<article class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant={severityVariant(c.claimed_severity)}>
										{severityLabel(c.claimed_severity)}
									</Badge>
									<Badge variant="default">{c.platform}</Badge>
									<span class="text-sm font-medium text-text-primary">
										{c.organisation}
									</span>
									{#if c.cwe_id}
										<Badge variant="default">{c.cwe_id}</Badge>
									{/if}
								</div>
								<p class="mt-1 text-xs text-text-muted">
									<a href={`/users/${c.username}`} class="text-primary hover:underline">
										{c.username}
									</a>
									·
									{t('admin.security.claims.otherClaims', {
										n: c.other_claims_by_this_person
									})}
								</p>
							</div>
							<span class="shrink-0 font-mono text-xs text-text-muted">
								{fmtDate(c.created_at)}
							</span>
						</div>

						<a
							href={c.report_url}
							target="_blank"
							rel="noopener nofollow"
							class="mt-3 flex items-center gap-1 break-all text-xs text-primary hover:underline"
						>
							<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
							{c.report_url}
						</a>

						{#if c.disclosed_on}
							<p class="mt-1 text-xs text-text-muted">
								{t('admin.security.claims.disclosedOn')}
								{fmtDay(c.disclosed_on)}
							</p>
						{/if}

						{#if c.summary_md}
							<p class="mt-3 whitespace-pre-wrap text-sm text-text-muted">{c.summary_md}</p>
						{/if}

						<div class="mt-4 flex flex-wrap gap-2">
							<Button
								variant="primary"
								size="sm"
								onclick={() => {
									claimToVerify = c;
									verifySeverity = c.claimed_severity;
								}}
							>
								{t('admin.security.claims.verify')}
							</Button>
							<Button variant="ghost" size="sm" onclick={() => (claimToRefuse = c)}>
								{t('admin.security.claims.refuse')}
							</Button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	{:else if tab === 'programmes'}
		<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
			<p class="max-w-3xl text-xs text-text-muted">{t('admin.security.programmes.hint')}</p>
			<Button variant="primary" size="sm" onclick={() => (programmeOpen = true)}>
				<Plus size={14} strokeWidth={2} />
				{t('admin.security.programmes.add')}
			</Button>
		</div>

		{#if programmesLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else if programmes.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
				<p class="text-sm text-text-muted">{t('admin.security.programmes.empty')}</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each programmes as p (p.id)}
					<article class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant={p.is_active ? 'success' : 'default'}>
								{p.is_active
									? t('admin.security.programmes.isActive')
									: t('admin.security.programmes.retired')}
							</Badge>
							<Badge variant="default">{p.platform}</Badge>
							<span class="text-sm font-medium text-text-primary">
								{p.organisation_name}
							</span>
							{#if p.pays_money}
								<Badge variant="accent">{t('admin.security.programmes.paysMoney')}</Badge>
							{/if}
							{#if p.discloses_reports}
								<Badge variant="primary">
									{t('admin.security.programmes.disclosesReports')}
								</Badge>
							{/if}
						</div>

						<a
							href={p.program_url}
							target="_blank"
							rel="noopener nofollow"
							class="mt-2 flex items-center gap-1 break-all text-xs text-primary hover:underline"
						>
							<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
							{p.program_url}
						</a>

						{#if p.scope_summary}
							<p class="mt-2 text-xs text-text-muted">{p.scope_summary}</p>
						{/if}

						<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
							<span>
								{t('admin.security.programmes.curatedAt')}
								<span class="font-mono">{fmtDay(p.curated_at)}</span>
							</span>
							{#if p.payout_range}
								<span class="font-mono">{p.payout_range}</span>
							{/if}
							{#each p.skill_topics as topic (topic)}
								<Badge variant="default">{topic}</Badge>
							{/each}
						</div>

						{#if p.retired_reason}
							<p class="mt-2 text-xs text-warning">
								{t('admin.security.programmes.retiredReasonLabel')}: {p.retired_reason}
							</p>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	{:else if tab === 'catalogue'}
		<p class="mb-4 max-w-3xl text-xs text-text-muted">{t('admin.security.catalogue.hint')}</p>
		<Button variant="primary" size="sm" onclick={() => (challengeOpen = true)}>
			<Plus size={14} strokeWidth={2} />
			{t('admin.security.catalogue.create')}
		</Button>
	{:else if tab === 'tokens'}
		<p class="mb-4 max-w-3xl text-xs text-text-muted">{t('admin.security.tokens.hint')}</p>

		<div class="mb-5 flex flex-wrap items-end gap-3">
			<Input
				label={t('admin.security.tokens.search')}
				bind:value={tokensQuery}
				class="w-56"
			/>
			<label class="flex h-11 items-center gap-2 text-sm text-text-muted">
				<input
					type="checkbox"
					bind:checked={tokensActiveOnly}
					class="h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
				/>
				{t('admin.security.tokens.activeOnly')}
			</label>
			<Button variant="primary" size="sm" onclick={loadTokens} loading={tokensLoading}>
				<RefreshCw size={14} strokeWidth={2} />
				{t('admin.common.refreshBtn')}
			</Button>
		</div>

		{#if tokensLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else if tokens.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
				<p class="text-sm text-text-muted">{t('admin.security.tokens.empty')}</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each tokens as tk (tk.id)}
					<article class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									{#if tk.revoked_at}
										<Badge variant="error">{t('admin.security.tokens.revoked')}</Badge>
									{:else if tk.expired}
										<Badge variant="warning">{t('admin.security.tokens.expired')}</Badge>
									{:else}
										<Badge variant="success">{t('admin.security.tokens.active')}</Badge>
									{/if}
									<a
										href={`/users/${tk.username}`}
										class="text-sm font-medium text-primary hover:underline"
									>
										{tk.display_name ?? tk.username}
									</a>
									{#if tk.label}
										<span class="text-xs text-text-muted">{tk.label}</span>
									{/if}
								</div>
								<p class="mt-1 font-mono text-[10px] text-text-muted" title={t('admin.security.tokens.prefixHint')}>
									{t('admin.security.tokens.prefix')}: {tk.token_prefix}
								</p>
							</div>

							{#if !tk.revoked_at}
								<Button variant="ghost" size="sm" onclick={() => (tokenToRevoke = tk)}>
									{t('admin.security.tokens.revokeBtn')}
								</Button>
							{/if}
						</div>

						<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted">
							<span>
								{t('admin.security.tokens.issued')}
								<span class="font-mono">{fmtDay(tk.issued_at)}</span>
							</span>
							<span>
								{t('admin.security.tokens.expires')}
								<span class="font-mono">{fmtDay(tk.expires_at)}</span>
							</span>
							<span>
								{t('admin.security.tokens.lastUsed')}
								<span class="font-mono">{fmtDate(tk.last_used_at)}</span>
							</span>
							<span><span class="font-mono">{tk.requests_seen}</span> {t('admin.security.tokens.requests')}</span>
							<span>
								<span class="font-mono">{tk.findings}</span>
								{t('admin.security.tokens.findings')}
								(<span class="font-mono">{tk.findings_confirmed}</span>
								{t('admin.security.tokens.findingsConfirmed')})
							</span>
						</div>

						{#if tk.revoked_reason}
							<p class="mt-2 text-xs text-warning">{tk.revoked_reason}</p>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	{:else}
		<p class="mb-4 max-w-3xl text-xs text-text-muted">{t('admin.security.record.hint')}</p>

		{#if recordLoading}
			<Skeleton class="h-64 w-full" rounded="xl" />
		{:else if record}
			<div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<StatCard
					label={t('admin.security.record.statsConfirmed')}
					value={record.stats.confirmed}
					color="success"
				/>
				<StatCard
					label={t('admin.security.record.statsFixed')}
					value={record.stats.fixed}
					color="primary"
				/>
				<StatCard
					label={t('admin.security.record.statsPublished')}
					value={record.stats.published}
					color="accent"
				/>
				<StatCard
					label={t('admin.security.record.statsReporters')}
					value={record.stats.reporters}
				/>
				<StatCard
					label={t('admin.security.record.statsMedian')}
					value={record.stats.median_days_to_publication ?? '—'}
				/>
			</div>

			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{t('admin.security.record.contributors')}
				</h2>
				{#if record.top_contributors.length === 0}
					<p class="text-sm text-text-muted">{t('admin.security.record.empty')}</p>
				{:else}
					<ul class="space-y-1.5">
						{#each record.top_contributors as c, i (c.reporter.username ?? c.reporter.alias ?? i)}
							<li
								class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2"
							>
								<span class="font-mono text-xs text-text-muted">#{i + 1}</span>
								<span class="text-sm text-text-primary">
									{c.reporter.username ?? c.reporter.alias}
								</span>
								{#if c.rank}
									<Badge variant="primary">{c.rank}</Badge>
								{/if}
								<span class="text-xs text-text-muted">
									{c.findings}
									{t('admin.security.record.findings')}
								</span>
								<span class="text-[10px] text-text-muted">
									{t('admin.security.record.since')}
									{fmtDay(c.first_finding_at)}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{t('admin.security.record.recent')}
				</h2>
				{#if record.recent_findings.length === 0}
					<p class="text-sm text-text-muted">{t('admin.security.record.empty')}</p>
				{:else}
					<ul class="space-y-1.5">
						{#each record.recent_findings as f (f.id)}
							<li
								class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2"
							>
								<Badge variant={severityVariant(f.severity_tier)}>
									{severityLabel(f.severity_tier)}
								</Badge>
								<a
									href={`/security/findings/${f.id}`}
									class="text-sm text-text-primary hover:text-primary hover:underline"
								>
									{f.title}
								</a>
								<span class="text-xs text-text-muted">
									{f.reporter.username ?? f.reporter.alias}
								</span>
								<span class="font-mono text-[10px] text-text-muted">
									{fmtDay(f.published_at)}
								</span>
								{#if f.writeup_url}
									<a
										href={f.writeup_url}
										target="_blank"
										rel="noopener nofollow"
										class="text-xs text-primary hover:underline"
									>
										<ExternalLink size={12} strokeWidth={2} />
									</a>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{t('admin.security.record.scope')}
				</h2>
				<div class="flex flex-wrap gap-2">
					{#each record.scope as host (host)}
						<code class="rounded-lg bg-surface-overlay px-2 py-1 font-mono text-xs text-text-primary">
							{host}
						</code>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<!-- ── Accept an external claim ────────────────────────────────── -->
<Modal
	open={claimToVerify !== null}
	title={t('admin.security.claims.verifyTitle')}
	size="md"
	onclose={() => (claimToVerify = null)}
>
	<p class="mb-4 text-xs text-text-muted">{t('admin.security.claims.verifyHint')}</p>
	<label class="flex flex-col gap-1.5">
		<span class="text-sm font-medium text-text-primary">
			{t('admin.security.filters.severity')}
		</span>
		<Select items={severityOnlyItems} bind:value={verifySeverity} shape="rounded" />
	</label>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (claimToVerify = null)}>
			{t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={verifyClaim} loading={verifying}>
			{t('admin.security.claims.verify')}
		</Button>
	{/snippet}
</Modal>

<ConfirmDangerousDialog
	open={claimToRefuse !== null}
	title={t('admin.security.claims.refuseTitle')}
	description={t('admin.security.claims.refuseHint')}
	actionLabel={t('admin.security.claims.refuse')}
	minReasonLength={10}
	loading={refusing}
	onconfirm={refuseClaim}
	onclose={() => (claimToRefuse = null)}
/>

<!-- ── Curate a programme ──────────────────────────────────────── -->
<Modal
	open={programmeOpen}
	title={t('admin.security.programmes.addTitle')}
	size="xl"
	onclose={() => (programmeOpen = false)}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Input
			label={t('admin.security.programmes.platformLabel')}
			bind:value={programme.platform}
		/>
		<Input
			label={t('admin.security.programmes.slugLabel')}
			bind:value={programme.program_slug}
		/>
		<Input
			label={t('admin.security.programmes.urlLabel')}
			bind:value={programme.program_url}
			class="sm:col-span-2"
		/>
		<Input
			label={t('admin.security.programmes.organisationLabel')}
			bind:value={programme.organisation_name}
			class="sm:col-span-2"
		/>
		<Input
			label={t('admin.security.programmes.scopeLabel')}
			bind:value={programme.scope_summary}
			class="sm:col-span-2"
		/>
		<Input
			label={t('admin.security.programmes.topicsLabel')}
			bind:value={programme.topicsRaw}
		/>
		<Input
			label={t('admin.security.programmes.payoutLabel')}
			bind:value={programme.payout_range}
		/>
	</div>

	<div class="mt-4 flex flex-wrap gap-4">
		<label class="flex items-center gap-2 text-sm text-text-muted">
			<input
				type="checkbox"
				bind:checked={programme.pays_money as boolean}
				class="h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
			/>
			{t('admin.security.programmes.paysMoney')}
		</label>
		<label class="flex items-center gap-2 text-sm text-text-muted">
			<input
				type="checkbox"
				bind:checked={programme.discloses_reports as boolean}
				class="h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
			/>
			{t('admin.security.programmes.disclosesReports')}
		</label>
		<label class="flex items-center gap-2 text-sm text-text-muted">
			<input
				type="checkbox"
				bind:checked={programme.is_active as boolean}
				class="h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
			/>
			{t('admin.security.programmes.isActive')}
		</label>
	</div>

	{#if !programme.is_active}
		<div class="mt-4">
			<Input
				label={t('admin.security.programmes.retiredReasonLabel')}
				bind:value={programme.retired_reason}
			/>
		</div>
	{/if}

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (programmeOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={saveProgramme} loading={programmeSaving}>
			{t('admin.common.save')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Create a machine-graded challenge ───────────────────────── -->
<Modal
	open={challengeOpen}
	title={t('admin.security.catalogue.createTitle')}
	size="xl"
	onclose={() => (challengeOpen = false)}
>
	<p
		class="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning"
	>
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{t('admin.security.catalogue.secretWarning')}</span>
	</p>

	<div class="grid gap-4 sm:grid-cols-2">
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{t('admin.security.catalogue.kindLabel')}
			</span>
			<Select
				items={[
					{ value: 'ctf_flag', label: t('admin.security.catalogue.kindFlag') },
					{ value: 'defensive_lab', label: t('admin.security.catalogue.kindLab') }
				]}
				bind:value={challenge.kind}
				shape="rounded"
			/>
		</label>
		<Input
			label={t('admin.security.catalogue.tierLabel')}
			bind:value={challenge.difficulty_tier}
		/>
		<Input
			label={t('admin.security.catalogue.titleLabel')}
			bind:value={challenge.title}
			class="sm:col-span-2"
		/>
		<Input
			label={t('admin.security.catalogue.descriptionLabel')}
			bind:value={challenge.description}
			class="sm:col-span-2"
		/>
		<Input
			label={t('admin.security.catalogue.instructionsLabel')}
			bind:value={challenge.instructions}
			class="sm:col-span-2"
		/>
		<Input
			label={t('admin.security.catalogue.difficultyLabel')}
			type="number"
			min="1"
			max="5"
			bind:value={challenge.difficulty as unknown as string}
		/>
		<Input
			label={t('admin.security.catalogue.rewardLabel')}
			type="number"
			min="0"
			bind:value={challenge.reward_fragments as unknown as string}
		/>
		<Input
			label={t('admin.security.catalogue.durationLabel')}
			type="number"
			min="1"
			bind:value={challenge.duration_minutes as unknown as string}
		/>
		<Input
			label={t('admin.security.catalogue.attributionLabel')}
			bind:value={challenge.attribution_md}
		/>
	</div>

	{#if challenge.kind === 'ctf_flag'}
		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<Input
				label={t('admin.security.catalogue.flagLabel')}
				bind:value={challenge.flag}
			/>
			<Input
				label={t('admin.security.catalogue.flagFormatLabel')}
				bind:value={challenge.flag_format}
			/>
			<Input
				label={t('admin.security.catalogue.targetUrlLabel')}
				bind:value={challenge.target_url}
				class="sm:col-span-2"
			/>
		</div>
	{:else}
		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<Input
				label={t('admin.security.catalogue.artifactKeyLabel')}
				bind:value={challenge.lab_artifact_key}
			/>
			<Input
				label={t('admin.security.catalogue.artifactBytesLabel')}
				type="number"
				min="1"
				bind:value={challenge.lab_artifact_bytes as unknown as string}
			/>
			<Input
				label={t('admin.security.catalogue.passPercentLabel')}
				type="number"
				min="1"
				max="100"
				bind:value={challenge.pass_percent as unknown as string}
			/>
			<Input
				label={t('admin.security.catalogue.maxAttemptsLabel')}
				type="number"
				min="1"
				bind:value={challenge.max_attempts as unknown as string}
			/>
		</div>

		<div class="mt-5 flex items-center justify-between">
			<h3 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{t('admin.security.catalogue.questions')}
			</h3>
			<Button variant="secondary" size="sm" onclick={addQuestion}>
				<Plus size={14} strokeWidth={2} />
				{t('admin.security.catalogue.addQuestion')}
			</Button>
		</div>

		<div class="mt-3 space-y-3">
			{#each challenge.questions ?? [] as q, i (i)}
				<div class="rounded-xl border border-border bg-surface-overlay p-4">
					<div class="grid gap-3 sm:grid-cols-2">
						<Input label={t('admin.security.catalogue.questionIdLabel')} bind:value={q.id} />
						<label class="flex flex-col gap-1.5">
							<span class="text-sm font-medium text-text-primary">
								{t('admin.security.catalogue.questionKindLabel')}
							</span>
							<Select
								items={[
									{ value: 'text', label: 'text' },
									{ value: 'choice', label: 'choice' }
								]}
								bind:value={q.kind}
								shape="rounded"
							/>
						</label>
						<Input
							label={t('admin.security.catalogue.questionTextLabel')}
							bind:value={q.question}
							class="sm:col-span-2"
						/>
						<Input
							label={t('admin.security.catalogue.answerLabel')}
							bind:value={q.answer}
						/>
						<Input
							label={t('admin.security.catalogue.hintLabel')}
							bind:value={q.hint}
						/>
					</div>
					<div class="mt-3 flex items-center justify-between">
						<label class="flex items-center gap-2 text-sm text-text-muted">
							<input
								type="checkbox"
								bind:checked={q.case_sensitive}
								class="h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
							/>
							{t('admin.security.catalogue.caseSensitive')}
						</label>
						<Button variant="ghost" size="sm" onclick={() => removeQuestion(i)}>
							<Trash2 size={14} strokeWidth={2} />
							{t('admin.security.catalogue.removeQuestion')}
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (challengeOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={saveChallenge} loading={challengeSaving}>
			{t('admin.common.create')}
		</Button>
	{/snippet}
</Modal>

<ConfirmDangerousDialog
	open={tokenToRevoke !== null}
	title={t('admin.security.tokens.revokeTitle')}
	description={t('admin.security.tokens.revokeHint')}
	actionLabel={t('admin.security.tokens.revokeBtn')}
	minReasonLength={10}
	loading={revokingToken}
	onconfirm={revokeToken}
	onclose={() => (tokenToRevoke = null)}
/>
