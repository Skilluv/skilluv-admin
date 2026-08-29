<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { programsApi, EVENT_ROLES, EVENT_STATUSES, auditIsComplete } from '$api/programs';
	import type {
		AmbassadorProgramRow,
		AuditFinding,
		BetaProgramRow,
		CertificationRow,
		EventRole,
		EventRow,
		EventStatus,
		LabRow,
		LaunchCampaignRow,
		ProposalRow
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { ChevronRight, RefreshCw, Info, Plus, X } from '@lucide/svelte';

	type Tab = 'labs' | 'programs' | 'events' | 'certifications' | 'proposals';

	let tab = $state<Tab>('labs');
	let loading = $state(true);

	let labs = $state<LabRow[]>([]);
	let betas = $state<BetaProgramRow[]>([]);
	let campaigns = $state<LaunchCampaignRow[]>([]);
	let ambassadors = $state<AmbassadorProgramRow[]>([]);
	let certifications = $state<CertificationRow[]>([]);
	let proposals = $state<ProposalRow[]>([]);
	let events = $state<EventRow[]>([]);

	let busy = $state<string | null>(null);

	/** Per-row drafts. Two labs settled in one sitting must not share a month,
	 *  and two programmes must not share an ambassador. */
	let monthOf = $state<Record<string, string>>({});
	let userOf = $state<Record<string, string>>({});

	// Events
	let eventUser = $state<Record<string, string>>({});
	let eventRole = $state<Record<string, EventRole>>({});
	let eventStatus = $state<Record<string, EventStatus>>({});
	let streamPlatform = $state<Record<string, string>>({});
	let streamUrl = $state<Record<string, string>>({});

	// Certifications
	let auditFor = $state<string | null>(null);
	let findings = $state<AuditFinding[]>([]);
	let auditNotes = $state('');
	let auditing = $state(false);
	let revokeTarget = $state<CertificationRow | null>(null);
	let revoking = $state(false);

	// Proposals
	let proposalEnterprise = $state<Record<string, string>>({});
	let proposalValue = $state<Record<string, string>>({});

	function label(row: Record<string, unknown>): string {
		return (row.title as string) ?? (row.name as string) ?? (row.id as string);
	}

	function fmtMoment(iso: string | null | undefined): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	function statusVariant(s: string | undefined): 'success' | 'warning' | 'default' {
		if (s === 'active' || s === 'running' || s === 'live' || s === 'published') return 'success';
		if (s === 'recruiting' || s === 'open' || s === 'draft') return 'warning';
		return 'default';
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			// Six public lists, each behind a different guard on the write side.
			// Settled rather than awaited together so one 403 does not blank the
			// other five tabs.
			const results = await Promise.allSettled([
				programsApi.labs(),
				programsApi.openBetaPrograms(),
				programsApi.openLaunchCampaigns(),
				programsApi.openAmbassadorPrograms(),
				programsApi.certifications(),
				programsApi.proposals(),
				programsApi.events()
			]);
			labs = results[0].status === 'fulfilled' ? results[0].value.data.labs : [];
			betas = results[1].status === 'fulfilled' ? results[1].value.data.programs : [];
			campaigns = results[2].status === 'fulfilled' ? results[2].value.data.campaigns : [];
			ambassadors = results[3].status === 'fulfilled' ? results[3].value.data.programs : [];
			certifications =
				results[4].status === 'fulfilled' ? results[4].value.data.certifications : [];
			proposals = results[5].status === 'fulfilled' ? results[5].value.data.proposals : [];
			events = results[6].status === 'fulfilled' ? results[6].value.data.events : [];
		} finally {
			loading = false;
		}
	}

	async function run(key: string, fn: () => Promise<void>) {
		if (busy) return;
		busy = key;
		try {
			await fn();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busy = null;
		}
	}

	function settleLab(lab: LabRow) {
		const month = monthOf[lab.id];
		if (!month) return;
		void run(lab.id, async () => {
			const res = await programsApi.settleLab(lab.id, month);
			toast.success(
				i18n.t('admin.programs.settled', {
					n: res.data.contributions_paid,
					each: res.data.each
				})
			);
			delete monthOf[lab.id];
		});
	}

	function closeBeta(p: BetaProgramRow) {
		void run(p.id, async () => {
			const res = await programsApi.closeBetaProgram(p.id);
			toast.success(
				i18n.t('admin.programs.betaClosed', { amount: res.data.program_fee_booked })
			);
			await load();
		});
	}

	function closeCampaign(c: LaunchCampaignRow) {
		void run(c.id, async () => {
			const res = await programsApi.closeLaunchCampaign(c.id);
			toast.success(
				i18n.t('admin.programs.campaignClosed', { amount: res.data.campaign_fee_booked })
			);
			await load();
		});
	}

	function invite(p: AmbassadorProgramRow) {
		const user = (userOf[p.id] ?? '').trim();
		if (user === '') return;
		void run(p.id, async () => {
			await programsApi.inviteAmbassador(p.id, user);
			toast.success(i18n.t('admin.programs.invited'));
			delete userOf[p.id];
		});
	}

	function pay(p: AmbassadorProgramRow) {
		const user = (userOf[p.id] ?? '').trim();
		const month = monthOf[p.id];
		if (user === '' || !month) return;
		void run(p.id, async () => {
			await programsApi.payAmbassador(p.id, user, month);
			toast.success(i18n.t('admin.programs.paid'));
			delete userOf[p.id];
			delete monthOf[p.id];
		});
	}

	function appoint(e: EventRow) {
		const user = (eventUser[e.id] ?? '').trim();
		const role = eventRole[e.id];
		if (user === '' || !role) return;
		void run(e.id, async () => {
			await programsApi.appointToEvent(e.id, user, role);
			toast.success(i18n.t('admin.programs.appointed'));
			delete eventUser[e.id];
		});
	}

	function setStatus(e: EventRow) {
		const status = eventStatus[e.id];
		if (!status) return;
		void run(e.id, async () => {
			await programsApi.setEventStatus(e.id, status);
			toast.success(i18n.t('admin.programs.statusSet'));
			await load();
		});
	}

	function addStream(e: EventRow) {
		const platform = (streamPlatform[e.id] ?? '').trim();
		const url = (streamUrl[e.id] ?? '').trim();
		if (platform === '' || url === '') return;
		void run(e.id, async () => {
			await programsApi.addLivestream(e.id, platform, url);
			toast.success(i18n.t('admin.programs.livestreamAdded'));
			delete streamPlatform[e.id];
			delete streamUrl[e.id];
		});
	}

	function openAudit(c: CertificationRow) {
		auditFor = c.id;
		findings = [{ criterion: '', score: '', evidence: '' }];
		auditNotes = '';
	}

	function addFinding() {
		findings = [...findings, { criterion: '', score: '', evidence: '' }];
	}

	function removeFinding(i: number) {
		findings = findings.filter((_, k) => k !== i);
	}

	async function submitAudit() {
		if (!auditFor || !auditIsComplete(findings) || auditing) return;
		auditing = true;
		try {
			await programsApi.auditCertification(
				auditFor,
				findings.map((f) => ({
					criterion: f.criterion.trim(),
					score: f.score.trim(),
					evidence: f.evidence.trim(),
					...(f.weight?.trim() ? { weight: f.weight.trim() } : {})
				})),
				auditNotes.trim() || undefined
			);
			toast.success(i18n.t('admin.programs.audited'));
			auditFor = null;
			findings = [];
			auditNotes = '';
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			auditing = false;
		}
	}

	async function confirmRevoke(reason: string) {
		if (!revokeTarget) return;
		revoking = true;
		try {
			await programsApi.revokeCertification(revokeTarget.id, reason);
			toast.success(i18n.t('admin.programs.revoked'));
			revokeTarget = null;
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			revoking = false;
		}
	}

	function recordSignature(p: ProposalRow) {
		const ent = (proposalEnterprise[p.id] ?? '').trim();
		const value = (proposalValue[p.id] ?? '').trim();
		if (ent === '' || value === '') return;
		void run(p.id, async () => {
			await programsApi.recordProposalSignature(p.id, ent, value);
			toast.success(i18n.t('admin.programs.signatureRecorded'));
			delete proposalEnterprise[p.id];
			delete proposalValue[p.id];
		});
	}

	const roleOptions = $derived(EVENT_ROLES.map((r) => ({ value: r, label: r })));
	const statusOptions = $derived(EVENT_STATUSES.map((s) => ({ value: s, label: s })));
	const auditReady = $derived(auditIsComplete(findings));
</script>

<div class="mx-auto max-w-5xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.programs.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.programs.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.programs.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.programs.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-8 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<Info size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.programs.listNote')}</span>
	</p>

	<div class="mb-6">
		<SegmentedControl
			items={[
				{ value: 'labs', label: i18n.t('admin.programs.tabs.labs') },
				{ value: 'programs', label: i18n.t('admin.programs.tabs.programs') },
				{ value: 'events', label: i18n.t('admin.programs.tabs.events') },
				{ value: 'certifications', label: i18n.t('admin.programs.tabs.certifications') },
				{ value: 'proposals', label: i18n.t('admin.programs.tabs.proposals') }
			]}
			bind:value={tab}
		/>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else if tab === 'labs'}
		{#if labs.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.programs.emptyLabs')}
			</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each labs as l (l.id)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
							<span class="text-sm font-semibold">{label(l)}</span>
							<Badge variant={statusVariant(l.status)} size="sm">{l.status}</Badge>
						</div>
						<div class="flex flex-wrap items-end gap-3">
							<div class="flex flex-col gap-1.5">
								<label for="lab-month-{l.id}" class="text-xs font-medium text-text-primary">
									{i18n.t('admin.programs.monthLabel')}
								</label>
								<input
									id="lab-month-{l.id}"
									type="date"
									value={monthOf[l.id] ?? ''}
									oninput={(e) => (monthOf[l.id] = (e.target as HTMLInputElement).value)}
									class="h-10 rounded-xl border border-border bg-surface-elevated px-3 text-sm"
								/>
							</div>
							<Button
								variant="primary"
								size="sm"
								onclick={() => settleLab(l)}
								disabled={!monthOf[l.id] || busy !== null}
								loading={busy === l.id}
							>
								{i18n.t('admin.programs.settleBtn')}
							</Button>
							<span class="text-[11px] text-text-muted">
								{i18n.t('admin.programs.monthHint')}
							</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if tab === 'programs'}
		<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
			{i18n.t('admin.programs.tabs.programs')}
		</h2>
		{#if betas.length === 0}
			<p class="mb-6 rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
				{i18n.t('admin.programs.emptyBetas')}
			</p>
		{:else}
			<ul class="mb-8 flex flex-col gap-2">
				{#each betas as b (b.id)}
					<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
						<span class="text-sm">
							{label(b)}
							<Badge variant={statusVariant(b.status)} size="sm">{b.status}</Badge>
						</span>
						<Button
							variant="secondary"
							size="sm"
							onclick={() => closeBeta(b)}
							loading={busy === b.id}
							disabled={busy !== null}
						>
							{i18n.t('admin.programs.closeBtn')}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if campaigns.length === 0}
			<p class="mb-6 rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
				{i18n.t('admin.programs.emptyCampaigns')}
			</p>
		{:else}
			<ul class="mb-8 flex flex-col gap-2">
				{#each campaigns as c (c.id)}
					<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
						<span class="text-sm">
							{label(c)}
							<Badge variant={statusVariant(c.status)} size="sm">{c.status}</Badge>
							{#if c.ends_at}
								<span class="ms-2 text-[11px] text-text-muted">{fmtMoment(c.ends_at)}</span>
							{/if}
						</span>
						<Button
							variant="secondary"
							size="sm"
							onclick={() => closeCampaign(c)}
							loading={busy === c.id}
							disabled={busy !== null}
						>
							{i18n.t('admin.programs.closeBtn')}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if ambassadors.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
				{i18n.t('admin.programs.emptyAmbassadors')}
			</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each ambassadors as p (p.id)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
							<span class="text-sm font-semibold">{label(p)}</span>
							<Badge variant={statusVariant(p.status)} size="sm">{p.status}</Badge>
						</div>
						<div class="flex flex-wrap items-end gap-3">
							<div class="min-w-44 flex-1">
								<Input
									label={i18n.t('admin.programs.userIdLabel')}
									value={userOf[p.id] ?? ''}
									oninput={(e: Event) =>
										(userOf[p.id] = (e.target as HTMLInputElement).value)}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label for="amb-month-{p.id}" class="text-xs font-medium text-text-primary">
									{i18n.t('admin.programs.monthLabel')}
								</label>
								<input
									id="amb-month-{p.id}"
									type="date"
									value={monthOf[p.id] ?? ''}
									oninput={(e) => (monthOf[p.id] = (e.target as HTMLInputElement).value)}
									class="h-10 rounded-xl border border-border bg-surface-elevated px-3 text-sm"
								/>
							</div>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => invite(p)}
								disabled={(userOf[p.id] ?? '').trim() === '' || busy !== null}
							>
								{i18n.t('admin.programs.inviteBtn')}
							</Button>
							<Button
								variant="primary"
								size="sm"
								onclick={() => pay(p)}
								disabled={(userOf[p.id] ?? '').trim() === '' ||
									!monthOf[p.id] ||
									busy !== null}
								loading={busy === p.id}
							>
								{i18n.t('admin.programs.payBtn')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if tab === 'events'}
		<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.programs.eventsNote')}</span>
		</p>
		{#if events.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.programs.emptyEvents')}
			</p>
		{:else}
			<ul class="flex flex-col gap-4">
				{#each events as e (e.id)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="text-sm font-semibold">{e.name}</h3>
								<p class="mt-0.5 text-[11px] text-text-muted">
									<code class="font-mono">{e.slug}</code>
									· {e.event_type} · {fmtMoment(e.starts_at)}
								</p>
							</div>
							<Badge variant={statusVariant(e.status)} size="sm">{e.status}</Badge>
						</div>

						<div class="mb-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
							<div class="min-w-40 flex-1">
								<Input
									label={i18n.t('admin.programs.userIdLabel')}
									value={eventUser[e.id] ?? ''}
									oninput={(ev: Event) =>
										(eventUser[e.id] = (ev.target as HTMLInputElement).value)}
								/>
							</div>
							<div class="w-40">
								<Select
									items={roleOptions}
									value={eventRole[e.id] ?? ''}
									onchange={(v: string) => (eventRole[e.id] = v as EventRole)}
									placeholder={i18n.t('admin.programs.roleLabel')}
									shape="rounded"
								/>
							</div>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => appoint(e)}
								disabled={(eventUser[e.id] ?? '').trim() === '' ||
									!eventRole[e.id] ||
									busy !== null}
							>
								{i18n.t('admin.programs.appointBtn')}
							</Button>
						</div>
						<p class="mb-3 text-[11px] text-text-muted">
							{i18n.t('admin.programs.appointHint')}
						</p>

						<div class="mb-3 flex flex-wrap items-end gap-3">
							<div class="w-40">
								<Select
									items={statusOptions}
									value={eventStatus[e.id] ?? ''}
									onchange={(v: string) => (eventStatus[e.id] = v as EventStatus)}
									placeholder={i18n.t('admin.programs.statusLabel')}
									shape="rounded"
								/>
							</div>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => setStatus(e)}
								disabled={!eventStatus[e.id] || busy !== null}
							>
								{i18n.t('admin.programs.setStatusBtn')}
							</Button>
							<span class="text-[11px] text-text-muted">
								{i18n.t('admin.programs.statusHint')}
							</span>
						</div>

						<div class="flex flex-wrap items-end gap-3">
							<div class="w-36">
								<Input
									label={i18n.t('admin.programs.platformLabel')}
									value={streamPlatform[e.id] ?? ''}
									oninput={(ev: Event) =>
										(streamPlatform[e.id] = (ev.target as HTMLInputElement).value)}
								/>
							</div>
							<div class="min-w-48 flex-1">
								<Input
									label={i18n.t('admin.programs.urlLabel')}
									hint={i18n.t('admin.programs.livestreamHint')}
									value={streamUrl[e.id] ?? ''}
									oninput={(ev: Event) =>
										(streamUrl[e.id] = (ev.target as HTMLInputElement).value)}
								/>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => addStream(e)}
								disabled={(streamPlatform[e.id] ?? '').trim() === '' ||
									(streamUrl[e.id] ?? '').trim() === '' ||
									busy !== null}
							>
								{i18n.t('admin.programs.addLivestreamBtn')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if tab === 'certifications'}
		{#if certifications.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.programs.emptyCertifications')}
			</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each certifications as c (c.id)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<span class="text-sm font-semibold">
								{label(c)}
								{#if c.status}
									<Badge variant={statusVariant(c.status)} size="sm">{c.status}</Badge>
								{/if}
							</span>
							<span class="flex gap-2">
								<Button variant="secondary" size="sm" onclick={() => openAudit(c)}>
									{i18n.t('admin.programs.auditTitle')}
								</Button>
								<Button variant="ghost" size="sm" onclick={() => (revokeTarget = c)}>
									{i18n.t('admin.programs.revokeBtn')}
								</Button>
							</span>
						</div>

						{#if auditFor === c.id}
							<div class="mt-4 border-t border-border pt-4">
								<p class="mb-3 text-xs text-text-muted">
									{i18n.t('admin.programs.auditHint')}
								</p>
								<ul class="mb-3 flex flex-col gap-3">
									{#each findings as f, i (i)}
										<li class="flex flex-wrap items-end gap-2">
											<div class="min-w-32 flex-1">
												<Input
													label={i18n.t('admin.programs.criterionLabel')}
													bind:value={findings[i].criterion}
												/>
											</div>
											<div class="w-20">
												<Input
													label={i18n.t('admin.programs.scoreLabel')}
													bind:value={findings[i].score}
												/>
											</div>
											<div class="w-20">
												<Input
													label={i18n.t('admin.programs.weightLabel')}
													bind:value={findings[i].weight}
												/>
											</div>
											<div class="min-w-40 flex-1">
												<Input
													label={i18n.t('admin.programs.evidenceLabel')}
													bind:value={findings[i].evidence}
												/>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onclick={() => removeFinding(i)}
												disabled={findings.length === 1}
											>
												<X size={14} strokeWidth={2} />
											</Button>
										</li>
									{/each}
								</ul>
								<div class="mb-3">
									<Button variant="ghost" size="sm" onclick={addFinding}>
										<Plus size={14} strokeWidth={2} />
										{i18n.t('admin.programs.addFindingBtn')}
									</Button>
								</div>
								<Input label={i18n.t('admin.programs.notesLabel')} bind:value={auditNotes} />
								<div class="mt-3 flex gap-2">
									<Button
										variant="primary"
										size="sm"
										onclick={submitAudit}
										disabled={!auditReady || auditing}
										loading={auditing}
										data-testid="submit-audit"
									>
										{i18n.t('admin.programs.auditBtn')}
									</Button>
									<Button variant="secondary" size="sm" onclick={() => (auditFor = null)}>
										{i18n.t('admin.common.cancel')}
									</Button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		{#if proposals.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.programs.emptyProposals')}
			</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each proposals as p (p.id)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
							<span class="text-sm font-semibold">{label(p)}</span>
							{#if p.status}
								<Badge variant={statusVariant(p.status)} size="sm">{p.status}</Badge>
							{/if}
						</div>
						<div class="flex flex-wrap items-end gap-3">
							<div class="min-w-44 flex-1">
								<Input
									label={i18n.t('admin.programs.enterpriseIdLabel')}
									value={proposalEnterprise[p.id] ?? ''}
									oninput={(e: Event) =>
										(proposalEnterprise[p.id] = (e.target as HTMLInputElement).value)}
								/>
							</div>
							<div class="w-32">
								<Input
									label={i18n.t('admin.programs.contractValueLabel')}
									value={proposalValue[p.id] ?? ''}
									oninput={(e: Event) =>
										(proposalValue[p.id] = (e.target as HTMLInputElement).value)}
								/>
							</div>
							<Button
								variant="primary"
								size="sm"
								onclick={() => recordSignature(p)}
								disabled={(proposalEnterprise[p.id] ?? '').trim() === '' ||
									(proposalValue[p.id] ?? '').trim() === '' ||
									busy !== null}
								loading={busy === p.id}
							>
								{i18n.t('admin.programs.signedBtn')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<ConfirmDangerousDialog
	open={revokeTarget !== null}
	title={i18n.t('admin.programs.revokeTitle')}
	description={revokeTarget ? label(revokeTarget) : ''}
	actionLabel={i18n.t('admin.programs.revokeBtn')}
	loading={revoking}
	onconfirm={(reason) => confirmRevoke(reason)}
	onclose={() => (revokeTarget = null)}
/>
