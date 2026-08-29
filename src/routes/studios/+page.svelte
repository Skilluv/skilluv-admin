<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { studiosApi, STUDIO_MIN_MEMBERS, sharesTotal, sharesComplete } from '$api/studios';
	import type { Studio, StudioMember } from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { ChevronRight, RefreshCw, AlertTriangle, Users } from '@lucide/svelte';

	let loading = $state(true);
	let studios = $state<Studio[]>([]);

	// The formation flow. `forming` is the id the create call answered with,
	// and it is the only handle on the studio until it is activated — the
	// public list shows active studios only.
	let forming = $state<Studio | null>(null);
	let members = $state<StudioMember[]>([]);

	let slug = $state('');
	let name = $state('');
	let specialization = $state('');
	let dayRate = $state('');
	let currency = $state('EUR');
	let maxMembers = $state('');
	let creating = $state(false);

	let memberUserId = $state('');
	let memberRole = $state('');
	let memberShare = $state('');
	let addingMember = $state(false);

	let leadUserId = $state('');
	let activating = $state(false);

	let disbandTarget = $state<Studio | null>(null);
	let disbanding = $state(false);

	function money(amount: string, cur: string): string {
		return `${amount} ${cur}`;
	}

	function fmtMoment(iso: string): string {
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await studiosApi.list();
			studios = res.data.studios;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	const canCreate = $derived(
		!creating &&
			slug.trim() !== '' &&
			name.trim() !== '' &&
			specialization.trim() !== '' &&
			dayRate.trim() !== ''
	);

	async function create() {
		if (!canCreate) return;
		creating = true;
		try {
			const res = await studiosApi.create({
				slug: slug.trim(),
				name: name.trim(),
				specialization: specialization.trim(),
				day_rate: dayRate.trim(),
				currency: currency.trim() || 'EUR',
				...(maxMembers.trim() ? { max_members: Number(maxMembers) } : {})
			});
			forming = res.data.studio;
			members = [];
			toast.success(i18n.t('admin.studios.created'));
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			creating = false;
		}
	}

	const canAddMember = $derived(
		!addingMember &&
			forming !== null &&
			memberUserId.trim() !== '' &&
			memberRole.trim() !== '' &&
			memberShare.trim() !== ''
	);

	async function addMember() {
		if (!canAddMember || !forming) return;
		addingMember = true;
		try {
			const res = await studiosApi.addMember(forming.id, {
				user_id: memberUserId.trim(),
				role: memberRole.trim(),
				share_percent: memberShare.trim()
			});
			// The route answers with the whole list, so the running total is
			// exact without a second read.
			members = res.data.members;
			memberUserId = '';
			memberRole = '';
			memberShare = '';
			toast.success(i18n.t('admin.studios.memberAdded'));
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			addingMember = false;
		}
	}

	const shareHundredths = $derived(sharesTotal(members.map((m) => m.share_percent)));
	const sharesOk = $derived(sharesComplete(members.map((m) => m.share_percent)));
	const enoughMembers = $derived(members.length >= STUDIO_MIN_MEMBERS);

	// Both are arithmetic the backend also enforces. Checking here means the
	// operator sees the sum move as they type rather than learning the rule
	// from a 400 after filling in five fields.
	const canActivate = $derived(
		!activating && forming !== null && enoughMembers && sharesOk && leadUserId.trim() !== ''
	);

	async function activate() {
		if (!canActivate || !forming) return;
		activating = true;
		try {
			await studiosApi.activate(forming.id, leadUserId.trim());
			toast.success(i18n.t('admin.studios.activated'));
			forming = null;
			members = [];
			leadUserId = '';
			slug = '';
			name = '';
			specialization = '';
			dayRate = '';
			maxMembers = '';
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			activating = false;
		}
	}

	async function confirmDisband(reason: string) {
		if (!disbandTarget) return;
		disbanding = true;
		try {
			await studiosApi.disband(disbandTarget.id, reason);
			toast.success(i18n.t('admin.studios.disbanded'));
			disbandTarget = null;
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			disbanding = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.studios.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.studios.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.studios.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.studios.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-8 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
		<AlertTriangle size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.studios.formingNote')}</span>
	</p>

	<section class="mb-10">
		<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
			{i18n.t('admin.studios.activeTitle')}
		</h2>
		{#if loading}
			<Skeleton class="h-24 w-full" rounded="xl" />
		{:else if studios.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.studios.emptyActive')}
			</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each studios as s (s.id)}
					<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
						<div class="min-w-0">
							<span class="text-sm font-medium">{s.name}</span>
							<Badge variant="success" size="sm">{s.status}</Badge>
							<p class="mt-0.5 text-xs text-text-muted">{s.specialization}</p>
							<p class="mt-0.5 text-[11px] text-text-muted">
								<code class="font-mono">{s.slug}</code>
								· {money(s.day_rate, s.currency)}
								· {fmtMoment(s.formed_at)}
								{#if s.domains.length > 0}
									· {s.domains.join(', ')}
								{/if}
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => (disbandTarget = s)}
							disabled={disbanding}
						>
							{i18n.t('admin.studios.disbandBtn')}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if forming === null}
		<section class="rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.studios.formTitle')}
			</h2>
			<div class="flex flex-col gap-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<Input label={i18n.t('admin.studios.slugLabel')} bind:value={slug} />
					<Input label={i18n.t('admin.studios.nameLabel')} bind:value={name} />
				</div>
				<Input
					label={i18n.t('admin.studios.specializationLabel')}
					hint={i18n.t('admin.studios.specializationHint')}
					bind:value={specialization}
				/>
				<div class="grid gap-4 sm:grid-cols-3">
					<Input label={i18n.t('admin.studios.dayRateLabel')} bind:value={dayRate} />
					<Input label={i18n.t('admin.studios.currencyLabel')} bind:value={currency} />
					<Input
						label={i18n.t('admin.studios.maxMembersLabel')}
						type="number"
						bind:value={maxMembers}
					/>
				</div>
				<div>
					<Button
						variant="primary"
						size="sm"
						onclick={create}
						disabled={!canCreate}
						loading={creating}
						data-testid="create-studio"
					>
						{i18n.t('admin.studios.createBtn')}
					</Button>
				</div>
			</div>
		</section>
	{:else}
		<section class="rounded-2xl border border-primary/40 bg-surface-elevated p-5">
			<div class="mb-4 flex items-center gap-2">
				<Users size={16} strokeWidth={2} class="text-primary" />
				<h2 class="text-sm font-semibold">{forming.name}</h2>
				<Badge variant="warning" size="sm">{forming.status}</Badge>
			</div>

			<h3 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.studios.membersTitle')}
			</h3>

			{#if members.length > 0}
				<ul class="mb-4 divide-y divide-border">
					{#each members as m (m.user_id)}
						<li class="flex items-center justify-between gap-3 py-2 text-sm">
							<span>
								{m.username}
								<span class="ms-2 text-[11px] text-text-muted">{m.role_on_engagement}</span>
							</span>
							<span class="font-mono text-xs">{m.share_percent}%</span>
						</li>
					{/each}
				</ul>
				<p class="mb-4 text-xs {sharesOk ? 'text-success' : 'text-warning'}">
					{i18n.t('admin.studios.sharesLabel')} : {(shareHundredths / 100).toFixed(2)}%
					{#if !sharesOk}
						— {i18n.t('admin.studios.sharesIncomplete')}
					{/if}
				</p>
			{/if}

			<div class="mb-6 flex flex-wrap items-end gap-3">
				<div class="min-w-44 flex-1">
					<Input
						label={i18n.t('admin.studios.memberUserIdLabel')}
						bind:value={memberUserId}
					/>
				</div>
				<div class="min-w-32 flex-1">
					<Input label={i18n.t('admin.studios.memberRoleLabel')} bind:value={memberRole} />
				</div>
				<div class="w-24">
					<Input label={i18n.t('admin.studios.memberShareLabel')} bind:value={memberShare} />
				</div>
				<Button
					variant="secondary"
					size="sm"
					onclick={addMember}
					disabled={!canAddMember}
					loading={addingMember}
					data-testid="add-studio-member"
				>
					{i18n.t('admin.studios.addMemberBtn')}
				</Button>
			</div>

			<div class="border-t border-border pt-4">
				<h3 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.studios.activateTitle')}
				</h3>
				{#if !enoughMembers}
					<p class="mb-3 text-xs text-warning">
						{i18n.t('admin.studios.tooFewMembers', { n: STUDIO_MIN_MEMBERS })}
					</p>
				{/if}
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-56 flex-1">
						<Input
							label={i18n.t('admin.studios.leadLabel')}
							hint={i18n.t('admin.studios.leadHint')}
							bind:value={leadUserId}
						/>
					</div>
					<Button
						variant="primary"
						size="sm"
						onclick={activate}
						disabled={!canActivate}
						loading={activating}
						data-testid="activate-studio"
					>
						{i18n.t('admin.studios.activateBtn')}
					</Button>
				</div>
			</div>
		</section>
	{/if}
</div>

<ConfirmDangerousDialog
	open={disbandTarget !== null}
	title={i18n.t('admin.studios.disbandTitle')}
	description={disbandTarget
		? `${disbandTarget.name} — ${i18n.t('admin.studios.disbandHint')}`
		: ''}
	actionLabel={i18n.t('admin.studios.disbandBtn')}
	loading={disbanding}
	onconfirm={(reason) => confirmDisband(reason)}
	onclose={() => (disbandTarget = null)}
/>
