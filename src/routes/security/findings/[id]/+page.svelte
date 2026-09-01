<script lang="ts">
	import { page } from '$app/stores';
	import { securityApi, nextStatuses, type FindingTransition } from '$api/security';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import {
		SECURITY_ROUND_KINDS,
		SECURITY_SEVERITY_TIERS,
		type SecurityFindingDetailResponse,
		type SecurityFindingStatus,
		type SecuritySeverityTier
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import {
		AlertTriangle,
		ChevronRight,
		ExternalLink,
		FlaskConical,
		Info,
		RefreshCw,
		ShieldAlert
	} from '@lucide/svelte';

	// One finding, and every decision that can be taken on it (SKI-127).
	//
	// Every action the backend exposes is offered here, including the ones a
	// given operator may not take. That is deliberate: a hidden button
	// teaches nobody which capability they are missing, and the server is
	// the authority on who may do what. A 403 or a 409 is surfaced as
	// itself.

	const id = $derived($page.params.id ?? '');

	let data = $state<SecurityFindingDetailResponse | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	const t = (k: string, params?: Record<string, string | number>) => i18n.t(k, params);

	$effect(() => {
		const current = id;
		if (current) void load(current);
	});

	async function load(findingId: string) {
		loading = true;
		notFound = false;
		try {
			const res = await securityApi.detail(findingId);
			data = res.data;
		} catch (e) {
			notFound = true;
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	async function reload() {
		if (id) await load(id);
	}

	// ── Transition ───────────────────────────────────────────────

	let transitionOpen = $state(false);
	let transitionBusy = $state(false);
	let move = $state<FindingTransition>({ to: 'triaged' });

	const available = $derived(data ? nextStatuses(data.finding.status) : []);

	function openTransition() {
		if (available.length === 0) return;
		move = { to: available[0] };
		transitionOpen = true;
	}

	async function submitTransition() {
		transitionBusy = true;
		try {
			// Only what the destination needs travels: the backend rejects
			// unknown fields, and an empty string is not the same as absent.
			const body: FindingTransition = { to: move.to };
			if (move.reason?.trim()) body.reason = move.reason.trim();
			if (move.to === 'fixed' && move.fix_url?.trim()) body.fix_url = move.fix_url.trim();
			if (move.to === 'published' && move.writeup_url?.trim())
				body.writeup_url = move.writeup_url.trim();
			if (move.to === 'duplicate' && move.duplicate_of?.trim())
				body.duplicate_of = move.duplicate_of.trim();
			if (move.to === 'triaged' && move.triage_notes_md?.trim())
				body.triage_notes_md = move.triage_notes_md.trim();

			const res = await securityApi.transition(id, body);
			toast.success(
				t('admin.security.actions.moved', { status: statusLabel(res.data.status) })
			);
			transitionOpen = false;
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			transitionBusy = false;
		}
	}

	// ── Severity ─────────────────────────────────────────────────

	let severityOpen = $state(false);
	let severityBusy = $state(false);
	let severityVector = $state('');
	let severityTier = $state<SecuritySeverityTier>('medium');
	let severityReason = $state('');

	function openSeverity() {
		if (!data) return;
		severityVector = data.finding.cvss_vector ?? '';
		severityTier = data.finding.severity_tier;
		severityReason = '';
		severityOpen = true;
	}

	async function submitSeverity() {
		severityBusy = true;
		try {
			const res = await securityApi.overrideSeverity(id, {
				cvss_vector: severityVector.trim() || undefined,
				severity_tier: severityVector.trim() ? undefined : severityTier,
				reason: severityReason.trim()
			});
			toast.success(
				t('admin.security.actions.severityChanged', {
					tier: severityLabel(res.data.severity_tier)
				})
			);
			severityOpen = false;
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			severityBusy = false;
		}
	}

	// ── Rounds ───────────────────────────────────────────────────

	let roundOpen = $state(false);
	let roundBusy = $state(false);
	let roundKind = $state<string>(SECURITY_ROUND_KINDS[0]);
	let roundNotes = $state('');

	async function submitRound() {
		roundBusy = true;
		try {
			const res = await securityApi.openRound(
				id,
				roundKind as (typeof SECURITY_ROUND_KINDS)[number],
				roundNotes.trim()
			);
			toast.success(t('admin.security.actions.roundOpened', { n: res.data.round_no }));
			roundOpen = false;
			roundNotes = '';
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			roundBusy = false;
		}
	}

	let resolveOpen = $state(false);
	let resolveBusy = $state(false);
	let resolution = $state<'satisfied' | 'insufficient'>('satisfied');
	let resolveNote = $state('');

	async function submitResolve() {
		resolveBusy = true;
		try {
			await securityApi.resolveRound(id, resolution, resolveNote.trim() || undefined);
			toast.success(t('admin.security.actions.roundResolved'));
			resolveOpen = false;
			resolveNote = '';
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			resolveBusy = false;
		}
	}

	/** True while a question is waiting on the reporter, which is the only
	 *  state in which closing one means anything. */
	const openRound = $derived(data?.rounds.find((r) => r.resolved_at === null) ?? null);

	// ── Disclosure ───────────────────────────────────────────────

	let vendorBusy = $state(false);

	async function markVendorNotified() {
		vendorBusy = true;
		try {
			await securityApi.markVendorNotified(id);
			toast.success(t('admin.security.actions.vendorNotifiedDone'));
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			vendorBusy = false;
		}
	}

	let extensionRequestOpen = $state(false);
	let extensionRequestBusy = $state(false);

	async function requestExtension(reason: string) {
		extensionRequestBusy = true;
		try {
			await securityApi.requestExtension(id, reason);
			toast.success(t('admin.security.actions.extensionRequested'));
			extensionRequestOpen = false;
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			extensionRequestBusy = false;
		}
	}

	let grantOpen = $state(false);
	let grantBusy = $state(false);
	let grantDays = $state(30);

	async function grantExtension() {
		grantBusy = true;
		try {
			const res = await securityApi.grantExtension(id, Number(grantDays));
			toast.success(t('admin.security.actions.extensionGranted', { n: res.data.granted_days }));
			grantOpen = false;
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			grantBusy = false;
		}
	}

	let withholdOpen = $state(false);
	let withholdBusy = $state(false);

	async function withhold(reason: string) {
		withholdBusy = true;
		try {
			await securityApi.withhold(id, reason);
			toast.success(t('admin.security.actions.withheld'));
			withholdOpen = false;
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			withholdBusy = false;
		}
	}

	// ── Duplicates ───────────────────────────────────────────────

	let rescanBusy = $state(false);

	async function rescan() {
		rescanBusy = true;
		try {
			const res = await securityApi.rescan(id);
			toast.success(t('admin.security.actions.rescanDone', { n: res.data.candidates }));
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			rescanBusy = false;
		}
	}

	// ── Blue lab ─────────────────────────────────────────────────

	let labOpen = $state(false);
	let labBusy = $state(false);
	let labKey = $state('');
	let labBytes = $state(0);
	let labMinutes = $state(45);
	let labRedactionConfirmed = $state(false);

	async function submitLab() {
		labBusy = true;
		try {
			const res = await securityApi.labFromFinding(id, {
				artifact_key: labKey.trim(),
				artifact_bytes: Number(labBytes),
				estimated_minutes: Number(labMinutes),
				redaction_confirmed: labRedactionConfirmed
			});
			toast.success(t('admin.security.actions.blueLabCreated', { id: res.data.challenge_id }));
			labOpen = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			labBusy = false;
		}
	}

	// ── Proofs ───────────────────────────────────────────────────

	/**
	 * Exchange one key for a signed URL and open it.
	 *
	 * Opened in a new tab rather than embedded: an inline `<img>` would put
	 * the proof of an unfixed vulnerability into the page's cache and into
	 * any screenshot of this screen, and the URL expires anyway.
	 */
	async function openProof(key: string) {
		try {
			const res = await securityApi.proofUrl(key);
			window.open(res.data.url, '_blank', 'noopener');
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	// ── Internal notes ─────────────────────────────

	let noteDraft = $state('');
	let notingBusy = $state(false);

	const noteTooShort = $derived(noteDraft.trim().length < 3);

	async function addNote() {
		notingBusy = true;
		try {
			await securityApi.addComment(id, noteDraft.trim());
			toast.success(t('admin.security.comments.added'));
			noteDraft = '';
			// Re-read rather than push the note into the list locally: the
			// author name and the timestamp are the server's, and a note that
			// renders with a guessed author is worse than one that takes a
			// second to appear.
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			notingBusy = false;
		}
	}

	// ── Labels ───────────────────────────────────────────────────

	function statusLabel(s: string): string {
		return t(`admin.security.statuses.${s}`);
	}

	function severityLabel(s: string): string {
		return t(`admin.security.severities.${s}`);
	}

	function roundKindLabel(slug: string): string {
		const key = `admin.security.roundKinds.${slug}`;
		const label = t(key);
		return label === key ? slug : label;
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

	const statusItems = $derived(
		available.map((s) => ({ value: s, label: statusLabel(s) }))
	);
	const severityItems = $derived(
		SECURITY_SEVERITY_TIERS.map((s) => ({ value: s, label: severityLabel(s) }))
	);
	const roundKindItems = $derived(
		SECURITY_ROUND_KINDS.map((k) => ({ value: k as string, label: roundKindLabel(k) }))
	);
</script>

<svelte:head>
	<title>{data?.finding.title ?? t('admin.security.navLabel')} — Admin Skilluv</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<a href="/security" class="hover:text-text-primary">{t('admin.security.navLabel')}</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="truncate text-text-primary">{data?.finding.title ?? id}</span>
	</nav>

	{#if loading}
		<Skeleton class="h-96 w-full" rounded="xl" />
	{:else if notFound || !data}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
			<ShieldAlert size={32} strokeWidth={2} class="mx-auto mb-3 text-text-muted" />
			<p class="text-sm text-text-muted">{t('admin.security.detail.notFound')}</p>
			<div class="mt-4 flex justify-center">
				<Button variant="ghost" size="sm" href="/security">
					{t('admin.security.detail.back')}
				</Button>
			</div>
		</div>
	{:else}
		{@const f = data.finding}

		<header class="mb-8">
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<Badge variant={severityVariant(f.severity_tier)}>
					{severityLabel(f.severity_tier)}
				</Badge>
				<Badge variant={statusVariant(f.status)}>{statusLabel(f.status)}</Badge>
				<Badge variant="security">{t(`admin.security.targets.${f.target_kind}`)}</Badge>
				{#if f.cwe_id}<Badge variant="default">{f.cwe_id}</Badge>{/if}
				{#if f.dedup_state !== 'original'}
					<Badge variant="error">{t(`admin.security.dedupStates.${f.dedup_state}`)}</Badge>
				{/if}
				{#if f.disclosure_stage}
					<Badge variant="primary">
						{t(`admin.security.disclosureStages.${f.disclosure_stage}`)}
					</Badge>
				{/if}
			</div>
			<h1 class="text-2xl font-black tracking-tight sm:text-3xl">{f.title}</h1>
			<p class="mt-2 font-mono text-[10px] text-text-muted">{f.id}</p>
		</header>

		<div class="grid gap-6 lg:grid-cols-3">
			<!-- ── The report ──────────────────────────────────── -->
			<div class="space-y-6 lg:col-span-2">
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.report')}
					</h2>
					<p class="whitespace-pre-wrap text-sm text-text-primary">{f.description_md}</p>

					<h3 class="mt-5 text-xs font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.reproduction')}
					</h3>
					<p class="mt-2 whitespace-pre-wrap text-sm text-text-primary">
						{f.reproduction_steps_md}
					</p>

					{#if f.impact_md}
						<h3 class="mt-5 text-xs font-semibold uppercase tracking-wider text-text-muted">
							{t('admin.security.detail.impact')}
						</h3>
						<p class="mt-2 whitespace-pre-wrap text-sm text-text-primary">{f.impact_md}</p>
					{/if}

					{#if f.proposed_fix_md}
						<h3 class="mt-5 text-xs font-semibold uppercase tracking-wider text-text-muted">
							{t('admin.security.detail.proposedFix')}
						</h3>
						<p class="mt-2 whitespace-pre-wrap text-sm text-text-primary">
							{f.proposed_fix_md}
						</p>
					{/if}
				</section>

				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.proofs')}
					</h2>
					<p class="mb-3 text-xs text-text-muted">{t('admin.security.detail.proofsHint')}</p>
					{#if f.proof_keys.length === 0}
						<p class="text-sm text-text-muted">{t('admin.security.detail.noProofs')}</p>
					{:else}
						<ul class="space-y-1.5">
							{#each f.proof_keys as key (key)}
								<li
									class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-overlay px-3 py-2"
								>
									<code class="break-all font-mono text-[10px] text-text-muted">{key}</code>
									<Button variant="ghost" size="sm" onclick={() => openProof(key)}>
										<ExternalLink size={12} strokeWidth={2} />
										{t('admin.security.detail.proofOpen')}
									</Button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<!-- ── Rounds ──────────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.rounds')}
					</h2>
					<p class="mb-3 text-xs text-text-muted">{t('admin.security.detail.roundsHint')}</p>
					{#if data.rounds.length === 0}
						<p class="text-sm text-text-muted">{t('admin.security.detail.noRounds')}</p>
					{:else}
						<ol class="space-y-3">
							{#each data.rounds as r (r.round_no)}
								<li class="rounded-xl border border-border bg-surface-overlay p-4">
									<div class="mb-2 flex flex-wrap items-center gap-2">
										<Badge variant="default">#{r.round_no}</Badge>
										<Badge variant="primary">{r.name ?? roundKindLabel(r.kind)}</Badge>
										{#if r.resolved_at}
											<Badge
												variant={r.resolution === 'satisfied' ? 'success' : 'error'}
											>
												{t(`admin.security.actions.${r.resolution}`)}
											</Badge>
										{:else}
											<Badge variant="warning">
												{t('admin.security.detail.awaitingAnswer')}
											</Badge>
										{/if}
										<span class="font-mono text-[10px] text-text-muted">
											{fmtDate(r.requested_at)}
										</span>
									</div>
									<p class="whitespace-pre-wrap text-sm text-text-primary">{r.notes_md}</p>
									{#if r.answer_md}
										<div class="mt-3 rounded-lg bg-surface-elevated p-3">
											<p class="mb-1 text-[10px] uppercase tracking-wider text-text-muted">
												{t('admin.security.detail.answered')} · {fmtDate(r.answered_at)}
											</p>
											<p class="whitespace-pre-wrap text-sm text-text-primary">
												{r.answer_md}
											</p>
										</div>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}
				</section>

				<!-- ── Look-alikes ─────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
							{t('admin.security.detail.similar')}
						</h2>
						<Button variant="ghost" size="sm" onclick={rescan} loading={rescanBusy}>
							<RefreshCw size={12} strokeWidth={2} />
							{t('admin.security.actions.rescan')}
						</Button>
					</div>
					<p class="mb-3 text-xs text-text-muted">{t('admin.security.detail.similarHint')}</p>
					{#if data.similar.length === 0}
						<p class="text-sm text-text-muted">{t('admin.security.detail.noSimilar')}</p>
					{:else}
						<ul class="space-y-1.5">
							{#each data.similar as s (s.id)}
								<li
									class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2"
								>
									<Badge variant="default">{(s.score * 100).toFixed(0)}%</Badge>
									<a
										href={`/security/findings/${s.id}`}
										class="text-xs text-primary hover:underline"
									>
										{s.title}
									</a>
									<Badge variant={statusVariant(s.status)}>{statusLabel(s.status)}</Badge>
									<span class="font-mono text-[10px] text-text-muted">
										{fmtDate(s.created_at)}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<!-- ── Internal notes ──────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.comments.title')}
					</h2>
					<p class="mb-3 text-xs text-text-muted">{t('admin.security.comments.hint')}</p>

					{#if data.comments.length === 0}
						<p class="text-sm text-text-muted">{t('admin.security.comments.empty')}</p>
					{:else}
						<ol class="space-y-2">
							{#each data.comments as c (c.id)}
								<li class="rounded-xl bg-surface-overlay px-3 py-2">
									<div class="mb-1 flex flex-wrap items-center gap-2">
										<span class="text-xs font-medium text-text-primary">
											{c.author_display_name ?? c.author}
										</span>
										<span class="font-mono text-[10px] text-text-muted">
											{fmtDate(c.at)}
										</span>
									</div>
									<p class="whitespace-pre-wrap text-sm text-text-primary">{c.body_md}</p>
								</li>
							{/each}
						</ol>
					{/if}

					<div class="mt-4 flex flex-col gap-2">
						<label for="internal-note" class="sr-only">
							{t('admin.security.comments.add')}
						</label>
						<textarea
							id="internal-note"
							bind:value={noteDraft}
							rows="3"
							placeholder={t('admin.security.comments.placeholder')}
							class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
						></textarea>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-xs {noteTooShort && noteDraft.length > 0 ? 'text-warning' : 'text-text-muted'}">
								{#if noteTooShort && noteDraft.length > 0}
									{t('admin.security.comments.tooShort')}
								{/if}
							</p>
							<Button
								variant="secondary"
								size="sm"
								onclick={addNote}
								loading={notingBusy}
								disabled={noteTooShort}
							>
								{t('admin.security.comments.add')}
							</Button>
						</div>
					</div>
				</section>

				<!-- ── Audit trail ─────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.timeline')}
					</h2>
					{#if data.events.length === 0}
						<p class="text-sm text-text-muted">{t('admin.security.detail.noEvents')}</p>
					{:else}
						<ol class="space-y-2">
							{#each data.events as e, i (i)}
								<li class="rounded-xl bg-surface-overlay px-3 py-2">
									<div class="flex flex-wrap items-center gap-2">
										<Badge variant="default">{e.event}</Badge>
										{#if e.from}
											<span class="text-xs text-text-muted">{statusLabel(e.from)}</span>
										{/if}
										{#if e.to}
											<span class="text-xs text-text-muted">→</span>
											<Badge variant={statusVariant(e.to)}>{statusLabel(e.to)}</Badge>
										{/if}
										<span class="font-mono text-[10px] text-text-muted">
											{fmtDate(e.at)}
										</span>
										{#if e.actor}
											<span class="text-[10px] text-text-muted">{e.actor}</span>
										{/if}
									</div>
									{#if e.reason}
										<p class="mt-1 whitespace-pre-wrap text-xs text-text-primary">
											{e.reason}
										</p>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}
				</section>
			</div>

			<!-- ── The side rail ───────────────────────────────── -->
			<div class="space-y-6">
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.reporterTitle')}
					</h2>
					<p class="text-sm text-text-primary">
						{#if f.reporter_is_anonymous || !f.reporter.username}
							{t('admin.security.anonymous')}
						{:else}
							<a href={`/users/${f.reporter.username}`} class="text-primary hover:underline">
								{f.reporter.display_name ?? f.reporter.username}
							</a>
						{/if}
					</p>
					{#if f.reporter.rank}
						<p class="mt-1 text-xs text-text-muted">
							{t('admin.security.detail.rank')}: {f.reporter.rank}
						</p>
					{/if}
					{#if f.reporter.confirmed_findings !== undefined}
						<p class="mt-1 text-xs text-text-muted">
							{f.reporter.confirmed_findings}
							{t('admin.security.detail.confirmedFindings')}
						</p>
					{/if}
				</section>

				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.severityTitle')}
					</h2>
					<dl class="space-y-1.5 text-xs">
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">{t('admin.security.reportedAs')}</dt>
							<dd class="text-text-primary">{severityLabel(f.severity_reported_tier)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">{t('admin.security.detail.overriddenTo')}</dt>
							<dd class="text-text-primary">{severityLabel(f.severity_tier)}</dd>
						</div>
						{#if f.cvss_score !== null}
							<div class="flex justify-between gap-2">
								<dt class="text-text-muted">CVSS</dt>
								<dd class="font-mono text-text-primary">{f.cvss_score}</dd>
							</div>
						{/if}
					</dl>
					{#if f.cvss_vector}
						<code class="mt-2 block break-all font-mono text-[10px] text-text-muted">
							{f.cvss_vector}
						</code>
					{/if}
					{#if f.severity_override_reason}
						<p class="mt-3 whitespace-pre-wrap text-xs text-text-muted">
							{t('admin.security.detail.overrideReason')}: {f.severity_override_reason}
						</p>
					{/if}
				</section>

				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.disclosure')}
					</h2>
					<dl class="space-y-1.5 text-xs">
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">{t('admin.security.detail.policyDays')}</dt>
							<dd class="text-text-primary">
								{f.disclosure_policy_days}
								{t('admin.security.detail.days')}
							</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">{t('admin.security.detail.embargoEnds')}</dt>
							<dd class="font-mono text-text-primary">{fmtDate(f.embargo_ends_at)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">{t('admin.security.detail.vendorNotified')}</dt>
							<dd class="font-mono text-text-primary">{fmtDate(f.vendor_notified_at)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">
								{t('admin.security.detail.vendorPatchConfirmed')}
							</dt>
							<dd class="font-mono text-text-primary">
								{fmtDate(f.vendor_patch_confirmed_at)}
							</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">
								{t('admin.security.detail.extensionRequested')}
							</dt>
							<dd class="font-mono text-text-primary">
								{fmtDate(f.extension_requested_at)}
							</dd>
						</div>
						{#if f.extension_granted_days}
							<div class="flex justify-between gap-2">
								<dt class="text-text-muted">
									{t('admin.security.detail.extensionGranted')}
								</dt>
								<dd class="text-text-primary">
									{f.extension_granted_days}
									{t('admin.security.detail.days')}
								</dd>
							</div>
						{/if}
					</dl>
					{#if f.withheld_reason}
						<p class="mt-3 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">
							{t('admin.security.detail.withheldReason')}: {f.withheld_reason}
						</p>
					{/if}
				</section>

				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.detail.resolution')}
					</h2>
					<dl class="space-y-1.5 text-xs">
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">{t('admin.security.detail.triagedAt')}</dt>
							<dd class="font-mono text-text-primary">{fmtDate(f.triaged_at)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="text-text-muted">{t('admin.security.detail.publishedAt')}</dt>
							<dd class="font-mono text-text-primary">{fmtDate(f.published_at)}</dd>
						</div>
					</dl>
					{#if f.triage_skipped_reason}
						<p class="mt-2 text-xs text-text-muted">
							{t('admin.security.detail.triageSkipped')}: {f.triage_skipped_reason}
						</p>
					{/if}
					{#if f.triage_notes_md}
						<p class="mt-2 whitespace-pre-wrap text-xs text-text-muted">
							{t('admin.security.detail.triageNotes')}: {f.triage_notes_md}
						</p>
					{/if}
					{#if f.fix_url}
						<a
							href={f.fix_url}
							target="_blank"
							rel="noopener nofollow"
							class="mt-2 flex items-center gap-1 break-all text-xs text-primary hover:underline"
						>
							<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
							{t('admin.security.detail.fixUrl')}
						</a>
					{/if}
					{#if f.writeup_url}
						<a
							href={f.writeup_url}
							target="_blank"
							rel="noopener nofollow"
							class="mt-1 flex items-center gap-1 break-all text-xs text-primary hover:underline"
						>
							<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
							{t('admin.security.detail.writeupUrl')}
						</a>
					{/if}
				</section>

				<!-- ── Actions ─────────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.security.actions.sectionTitle')}
					</h2>

					<div class="flex flex-col gap-2">
						{#if available.length > 0}
							<Button
								variant="primary"
								size="sm"
								onclick={openTransition}
								data-testid="transition-open"
							>
								{t('admin.security.actions.transition')}
							</Button>
						{:else}
							<p class="text-xs text-text-muted">
								{t('admin.security.actions.noTransition')}
							</p>
						{/if}

						<Button variant="secondary" size="sm" onclick={openSeverity}>
							{t('admin.security.actions.severity')}
						</Button>

						{#if openRound}
							<Button variant="secondary" size="sm" onclick={() => (resolveOpen = true)}>
								{t('admin.security.actions.resolveRound')}
							</Button>
						{:else}
							<Button variant="secondary" size="sm" onclick={() => (roundOpen = true)}>
								{t('admin.security.actions.round')}
							</Button>
						{/if}

						<Button
							variant="secondary"
							size="sm"
							onclick={markVendorNotified}
							loading={vendorBusy}
						>
							{t('admin.security.actions.vendorNotified')}
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onclick={() => (extensionRequestOpen = true)}
						>
							{t('admin.security.actions.requestExtension')}
						</Button>

						<Button variant="ghost" size="sm" onclick={() => (grantOpen = true)}>
							{t('admin.security.actions.grantExtension')}
						</Button>

						<Button variant="ghost" size="sm" onclick={() => (labOpen = true)}>
							<FlaskConical size={14} strokeWidth={2} />
							{t('admin.security.actions.blueLab')}
						</Button>

						<Button variant="danger" size="sm" onclick={() => (withholdOpen = true)}>
							{t('admin.security.actions.withhold')}
						</Button>
					</div>
				</section>
			</div>
		</div>
	{/if}
</div>

<!-- ── Move ────────────────────────────────────────────────────── -->
<Modal
	open={transitionOpen}
	title={t('admin.security.actions.transitionTitle')}
	size="lg"
	onclose={() => (transitionOpen = false)}
>
	<label class="flex flex-col gap-1.5">
		<span class="text-sm font-medium text-text-primary">
			{t('admin.security.actions.transitionTo')}
		</span>
		<Select items={statusItems} bind:value={move.to} shape="rounded" />
	</label>

	{#if move.to === 'published'}
		<p
			class="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning"
		>
			<AlertTriangle size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{t('admin.security.actions.publishWarning')}</span>
		</p>
	{/if}

	<div class="mt-4 space-y-4">
		<Input label={t('admin.security.actions.reasonLabel')} bind:value={move.reason as string} />

		{#if move.to === 'fixed'}
			<Input
				label={t('admin.security.actions.fixUrlLabel')}
				bind:value={move.fix_url as string}
			/>
		{:else if move.to === 'published'}
			<Input
				label={t('admin.security.actions.writeupUrlLabel')}
				bind:value={move.writeup_url as string}
			/>
		{:else if move.to === 'duplicate'}
			<Input
				label={t('admin.security.actions.duplicateOfLabel')}
				bind:value={move.duplicate_of as string}
			/>
		{:else if move.to === 'triaged'}
			<Input
				label={t('admin.security.actions.triageNotesLabel')}
				bind:value={move.triage_notes_md as string}
			/>
		{/if}
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (transitionOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitTransition}
			loading={transitionBusy}
			data-testid="transition-submit"
		>
			{t('admin.security.actions.transition')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Severity ────────────────────────────────────────────────── -->
<Modal
	open={severityOpen}
	title={t('admin.security.actions.severityTitle')}
	size="lg"
	onclose={() => (severityOpen = false)}
>
	<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{t('admin.security.actions.severityHint')}</span>
	</p>

	<div class="space-y-4">
		<Input
			label={t('admin.security.actions.cvssVectorLabel')}
			bind:value={severityVector}
			placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
		/>
		{#if !severityVector.trim()}
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{t('admin.security.actions.tierLabel')}
				</span>
				<Select items={severityItems} bind:value={severityTier} shape="rounded" />
			</label>
		{/if}
		<Input
			label={t('admin.security.actions.reasonLabel')}
			bind:value={severityReason}
		/>
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (severityOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitSeverity}
			loading={severityBusy}
			disabled={severityReason.trim().length === 0}
		>
			{t('admin.common.save')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Open a round ────────────────────────────────────────────── -->
<Modal
	open={roundOpen}
	title={t('admin.security.actions.roundTitle')}
	size="lg"
	onclose={() => (roundOpen = false)}
>
	<div class="space-y-4">
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{t('admin.security.actions.roundKindLabel')}
			</span>
			<Select items={roundKindItems} bind:value={roundKind} shape="rounded" />
		</label>
		<Input label={t('admin.security.actions.roundNotesLabel')} bind:value={roundNotes} />
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (roundOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitRound}
			loading={roundBusy}
			disabled={roundNotes.trim().length === 0}
		>
			{t('admin.security.actions.round')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Close a round ───────────────────────────────────────────── -->
<Modal
	open={resolveOpen}
	title={t('admin.security.actions.resolveRoundTitle')}
	size="lg"
	onclose={() => (resolveOpen = false)}
>
	<div class="space-y-4">
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{t('admin.security.actions.resolutionLabel')}
			</span>
			<Select
				items={[
					{ value: 'satisfied', label: t('admin.security.actions.satisfied') },
					{ value: 'insufficient', label: t('admin.security.actions.insufficient') }
				]}
				bind:value={resolution}
				shape="rounded"
			/>
		</label>
		<Input label={t('admin.security.actions.resolutionNote')} bind:value={resolveNote} />
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (resolveOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitResolve} loading={resolveBusy}>
			{t('admin.security.actions.resolveRound')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Grant an extension ──────────────────────────────────────── -->
<Modal
	open={grantOpen}
	title={t('admin.security.actions.grantExtensionTitle')}
	size="md"
	onclose={() => (grantOpen = false)}
>
	<p class="mb-4 text-xs text-text-muted">{t('admin.security.actions.grantExtensionHint')}</p>
	<Input
		label={t('admin.security.actions.daysLabel')}
		type="number"
		min="1"
		max="365"
		bind:value={grantDays as unknown as string}
	/>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (grantOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={grantExtension} loading={grantBusy}>
			{t('admin.security.actions.grantExtension')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Build a defensive lab ───────────────────────────────────── -->
<Modal
	open={labOpen}
	title={t('admin.security.actions.blueLabTitle')}
	size="lg"
	onclose={() => (labOpen = false)}
>
	<p class="mb-4 text-xs text-text-muted">{t('admin.security.actions.blueLabHint')}</p>

	<div class="grid gap-4 sm:grid-cols-2">
		<Input label={t('admin.security.actions.artifactKeyLabel')} bind:value={labKey} />
		<Input
			label={t('admin.security.actions.artifactBytesLabel')}
			type="number"
			min="1"
			bind:value={labBytes as unknown as string}
		/>
		<Input
			label={t('admin.security.actions.estimatedMinutesLabel')}
			type="number"
			min="1"
			bind:value={labMinutes as unknown as string}
		/>
	</div>

	<label class="mt-4 flex items-start gap-2 text-sm text-text-muted">
		<input
			type="checkbox"
			bind:checked={labRedactionConfirmed}
			class="mt-0.5 h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
		/>
		{t('admin.security.actions.redactionConfirmLabel')}
	</label>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (labOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitLab}
			loading={labBusy}
			disabled={!labRedactionConfirmed || labKey.trim().length === 0}
		>
			{t('admin.common.create')}
		</Button>
	{/snippet}
</Modal>

<ConfirmDangerousDialog
	open={extensionRequestOpen}
	title={t('admin.security.actions.requestExtensionTitle')}
	actionLabel={t('admin.security.actions.requestExtension')}
	reasonHint={t('admin.security.actions.extensionReasonLabel')}
	minReasonLength={10}
	loading={extensionRequestBusy}
	onconfirm={requestExtension}
	onclose={() => (extensionRequestOpen = false)}
/>

<ConfirmDangerousDialog
	open={withholdOpen}
	title={t('admin.security.actions.withholdTitle')}
	description={t('admin.security.actions.withholdHint')}
	actionLabel={t('admin.security.actions.withhold')}
	minReasonLength={20}
	loading={withholdBusy}
	onconfirm={withhold}
	onclose={() => (withholdOpen = false)}
/>
