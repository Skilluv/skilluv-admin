<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import {
		adminApi,
		type Season,
		type Tournament,
		type TournamentKind,
		type TournamentFormat,
		type SeasonCloseReport
	} from '$api/admin';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Select from '$components/ui/Select.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Swords, Calendar, Trophy, Sparkles, ChevronRight, Flag, DoorClosed } from '@lucide/svelte';

	type Tab = 'seasons' | 'tournaments';
	let activeTab = $state<Tab>('seasons');

	// --- Season create form ---
	let sSlug = $state('');
	let sName = $state('');
	let sDesc = $state('');
	let sStartsAt = $state('');
	let sEndsAt = $state('');
	let creatingSeason = $state(false);
	let lastSeason = $state<Season | null>(null);

	// --- Season ops ---
	let seasonOpsId = $state('');
	let seasonNewStatus = $state('active');
	let updatingSeasonStatus = $state(false);
	let closingSeason = $state(false);
	let lastCloseReport = $state<SeasonCloseReport | null>(null);

	// --- Tournament create form ---
	let tSeasonId = $state('');
	let tSlug = $state('');
	let tName = $state('');
	let tDesc = $state('');
	let tKind = $state<TournamentKind>('individual');
	let tFormat = $state<TournamentFormat>('ladder');
	let tPrizeFrag = $state(0);
	let tPrizeGp = $state(0);
	let tRegOpensAt = $state('');
	let tStartsAt = $state('');
	let tEndsAt = $state('');
	let tSponsorEntId = $state('');
	let tSponsorLogo = $state('');
	let tSponsorBlurb = $state('');
	let creatingTournament = $state(false);
	let lastTournament = $state<Tournament | null>(null);

	// --- Tournament ops ---
	let tournamentOpsId = $state('');
	let tournamentNewStatus = $state('active');
	let updatingTournamentStatus = $state(false);
	let concludingTournament = $state(false);
	let scoreParticipantType = $state<'user' | 'guild'>('user');
	let scoreParticipantId = $state('');
	let scoreValue = $state(0);
	let scoring = $state(false);

	let showCloseSeason = $state(false);
	let showConcludeTournament = $state(false);

	function toIsoOrUndef(local: string): string | undefined {
		if (!local) return undefined;
		return new Date(local).toISOString();
	}

	async function submitCreateSeason(e: SubmitEvent) {
		e.preventDefault();
		if (creatingSeason) return;
		if (!sSlug.trim() || !sName.trim() || !sStartsAt || !sEndsAt) return;
		creatingSeason = true;
		try {
			const res = await adminApi.createSeason({
				slug: sSlug.trim().toLowerCase(),
				name: sName.trim(),
				description: sDesc.trim() || undefined,
				starts_at: new Date(sStartsAt).toISOString(),
				ends_at: new Date(sEndsAt).toISOString()
			});
			lastSeason = res.data.season;
			toast.success(i18n.t('admin.tournaments.seasonCreated'));
			sSlug = ''; sName = ''; sDesc = ''; sStartsAt = ''; sEndsAt = '';
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creatingSeason = false;
		}
	}

	async function submitSeasonStatus(e: SubmitEvent) {
		e.preventDefault();
		if (updatingSeasonStatus || !seasonOpsId.trim()) return;
		updatingSeasonStatus = true;
		try {
			await adminApi.updateSeasonStatus(seasonOpsId.trim(), seasonNewStatus);
			toast.success(i18n.t('admin.tournaments.seasonStatusUpdated'));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			updatingSeasonStatus = false;
		}
	}

	function requestCloseSeason() {
		if (!seasonOpsId.trim()) return;
		showCloseSeason = true;
	}

	async function confirmCloseSeason(reason: string) {
		if (closingSeason || !seasonOpsId.trim()) return;
		closingSeason = true;
		try {
			const res = await adminApi.closeSeason(seasonOpsId.trim(), reason);
			lastCloseReport = res.data.close_report;
			toast.success(i18n.t('admin.tournaments.seasonClosed'));
			showCloseSeason = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			closingSeason = false;
		}
	}

	async function submitCreateTournament(e: SubmitEvent) {
		e.preventDefault();
		if (creatingTournament) return;
		if (!tSlug.trim() || !tName.trim() || !tStartsAt || !tEndsAt) return;
		creatingTournament = true;
		try {
			const res = await adminApi.createTournament({
				season_id: tSeasonId.trim() || undefined,
				slug: tSlug.trim().toLowerCase(),
				name: tName.trim(),
				description: tDesc.trim() || undefined,
				kind: tKind,
				format: tFormat,
				prize_pool_fragments: tPrizeFrag || 0,
				prize_pool_gp: tPrizeGp || 0,
				sponsor_enterprise_id: tKind === 'hackathon' ? tSponsorEntId.trim() || undefined : undefined,
				sponsor_logo_url: tKind === 'hackathon' ? tSponsorLogo.trim() || undefined : undefined,
				sponsor_blurb: tKind === 'hackathon' ? tSponsorBlurb.trim() || undefined : undefined,
				registration_opens_at: toIsoOrUndef(tRegOpensAt),
				starts_at: new Date(tStartsAt).toISOString(),
				ends_at: new Date(tEndsAt).toISOString()
			});
			lastTournament = res.data.tournament;
			toast.success(i18n.t('admin.tournaments.tournamentCreated'));
			tSlug = ''; tName = ''; tDesc = '';
			tSponsorEntId = ''; tSponsorLogo = ''; tSponsorBlurb = '';
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creatingTournament = false;
		}
	}

	async function submitTournamentStatus(e: SubmitEvent) {
		e.preventDefault();
		if (updatingTournamentStatus || !tournamentOpsId.trim()) return;
		updatingTournamentStatus = true;
		try {
			await adminApi.updateTournamentStatus(tournamentOpsId.trim(), tournamentNewStatus);
			toast.success(i18n.t('admin.tournaments.tournamentStatusUpdated'));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			updatingTournamentStatus = false;
		}
	}

	async function submitScore(e: SubmitEvent) {
		e.preventDefault();
		if (scoring || !tournamentOpsId.trim() || !scoreParticipantId.trim()) return;
		scoring = true;
		try {
			await adminApi.scoreTournament(tournamentOpsId.trim(), {
				participant_type: scoreParticipantType,
				participant_id: scoreParticipantId.trim(),
				score: scoreValue
			});
			toast.success(i18n.t('admin.tournaments.scoreSaved'));
			scoreParticipantId = '';
			scoreValue = 0;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			scoring = false;
		}
	}

	function requestConclude() {
		if (!tournamentOpsId.trim()) return;
		showConcludeTournament = true;
	}

	async function confirmConclude(reason: string) {
		if (concludingTournament || !tournamentOpsId.trim()) return;
		concludingTournament = true;
		try {
			await adminApi.concludeTournament(tournamentOpsId.trim(), reason);
			toast.success(i18n.t('admin.tournaments.tournamentConcluded'));
			showConcludeTournament = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			concludingTournament = false;
		}
	}

	// Auth enforced by hooks.server.ts — client re-check was racy on deep-links.

	const inputCls =
		'w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none';
	const textareaCls =
		'w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none';
	const labelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted';
</script>

<svelte:head>
	<title>{i18n.t('admin.nav.tournamentsSeasons')} — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.nav.tournamentsSeasons')}</span>
	</nav>

	<div class="mb-8">
		<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{i18n.t('admin.tournaments.competitionLabel')}</p>
		<h1 class="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
			{i18n.t('admin.tournaments.title')}
		</h1>
		<p class="mt-3 max-w-2xl text-sm text-text-muted">
			{i18n.t('admin.tournaments.subtitle')}
		</p>
	</div>

	<div class="mb-6 flex gap-1 border-b border-border">
		{#each [
			{ id: 'seasons' as Tab, label: i18n.t('admin.tournaments.tabSeasons'), icon: Calendar },
			{ id: 'tournaments' as Tab, label: i18n.t('admin.tournaments.tabTournaments'), icon: Swords }
		] as tab (tab.id)}
			<button
				type="button"
				onclick={() => (activeTab = tab.id)}
				class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors {activeTab === tab.id
					? 'border-primary text-primary'
					: 'border-transparent text-text-muted hover:text-text-primary'}"
			>
				<tab.icon size={16} strokeWidth={2} />
				{tab.label}
			</button>
		{/each}
	</div>

	{#if activeTab === 'seasons'}
		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Create season -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6">
				<div class="mb-4 flex items-center gap-2">
					<Sparkles size={16} strokeWidth={2} class="text-accent" />
					<h2 class="text-lg font-bold">{i18n.t('admin.tournaments.createSeason')}</h2>
				</div>
				<form onsubmit={submitCreateSeason} class="space-y-3">
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="s-slug" class={labelCls}>{i18n.t('admin.tenants.slug')} *</label>
							<input id="s-slug" bind:value={sSlug} required pattern={'[a-z0-9\\-]{2,60}'} placeholder="saison-2026-q1" class="{inputCls} lowercase" />
						</div>
						<div>
							<label for="s-name" class={labelCls}>{i18n.t('admin.tournaments.seasonName')} *</label>
							<input id="s-name" bind:value={sName} required placeholder="Saison Q1 2026" class={inputCls} />
						</div>
					</div>
					<div>
						<label for="s-desc" class={labelCls}>{i18n.t('admin.tournaments.seasonDescription')}</label>
						<textarea id="s-desc" bind:value={sDesc} rows="2" class={textareaCls}></textarea>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="s-start" class={labelCls}>{i18n.t('admin.tournaments.startsAt')} *</label>
							<input id="s-start" type="datetime-local" bind:value={sStartsAt} required class={inputCls} />
						</div>
						<div>
							<label for="s-end" class={labelCls}>{i18n.t('admin.tournaments.endsAt')} *</label>
							<input id="s-end" type="datetime-local" bind:value={sEndsAt} required class={inputCls} />
						</div>
					</div>
					<div class="flex justify-end pt-2">
						<Button variant="accent" loading={creatingSeason}>
							{i18n.t('admin.tournaments.createSeason')}
						</Button>
					</div>
				</form>

				{#if lastSeason}
					<div class="mt-4 rounded-xl border border-success/30 bg-success/10 p-4 text-xs">
						<p class="font-bold text-success">{lastSeason.name}</p>
						<p class="font-mono text-text-muted mt-1">{lastSeason.id}</p>
					</div>
				{/if}
			</section>

			<!-- Season ops -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6">
				<div class="mb-4 flex items-center gap-2">
					<Flag size={16} strokeWidth={2} class="text-primary" />
					<h2 class="text-lg font-bold">{i18n.t('admin.tournaments.seasonOps')}</h2>
				</div>

				<div class="mb-4">
					<label for="so-id" class={labelCls}>{i18n.t('admin.common.seasonIdLabel')} *</label>
					<input id="so-id" bind:value={seasonOpsId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
				</div>

				<form onsubmit={submitSeasonStatus} class="mb-6 space-y-3 border-t border-border pt-4">
					<p class="text-xs uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tournaments.changeStatus')}
					</p>
					<Select
						items={[
							{ value: 'upcoming', label: 'upcoming' },
							{ value: 'active', label: 'active' },
							{ value: 'closed', label: 'closed' }
						]}
						bind:value={seasonNewStatus}
						class="w-full"
					/>
					<Button variant="secondary" size="sm" loading={updatingSeasonStatus}>
						{i18n.t('admin.common.apply')}
					</Button>
				</form>

				<div class="space-y-3 border-t border-border pt-4">
					<p class="text-xs uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tournaments.closeSeason')}
					</p>
					<p class="text-xs text-text-muted">
						{i18n.t('admin.tournaments.closeSeasonHint')}
					</p>
					<Button variant="danger" size="sm" onclick={requestCloseSeason} loading={closingSeason}>
						<DoorClosed size={14} strokeWidth={2} />
						{i18n.t('admin.tournaments.closePermanently')}
					</Button>
				</div>

				{#if lastCloseReport}
					<div class="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs">
						<p class="font-bold text-primary mb-2">
							{i18n.t('admin.tournaments.closeReport')}
						</p>
						<div class="grid grid-cols-3 gap-2 text-center">
							<div>
								<p class="text-lg font-black">{lastCloseReport.guilds_reset}</p>
								<p class="text-text-muted">{i18n.t('admin.tournaments.guildsReset')}</p>
							</div>
							<div>
								<p class="text-lg font-black text-success">{lastCloseReport.promotions}</p>
								<p class="text-text-muted">{i18n.t('admin.tournaments.promotions')}</p>
							</div>
							<div>
								<p class="text-lg font-black text-warning">{lastCloseReport.relegations}</p>
								<p class="text-text-muted">{i18n.t('admin.tournaments.relegations')}</p>
							</div>
						</div>
					</div>
				{/if}
			</section>
		</div>
	{:else if activeTab === 'tournaments'}
		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Create tournament -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6">
				<div class="mb-4 flex items-center gap-2">
					<Sparkles size={16} strokeWidth={2} class="text-accent" />
					<h2 class="text-lg font-bold">{i18n.t('admin.tournaments.createTournament')}</h2>
				</div>
				<form onsubmit={submitCreateTournament} class="space-y-3">
					<div>
						<label for="t-season" class={labelCls}>
							{i18n.t('admin.tournaments.linkedSeason')}
						</label>
						<input id="t-season" bind:value={tSeasonId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="t-slug" class={labelCls}>{i18n.t('admin.tenants.slug')} *</label>
							<input id="t-slug" bind:value={tSlug} required pattern={'[a-z0-9\\-]{2,60}'} placeholder="cup-hiver-2026" class="{inputCls} lowercase" />
						</div>
						<div>
							<label for="t-name" class={labelCls}>{i18n.t('admin.tournaments.seasonName')} *</label>
							<input id="t-name" bind:value={tName} required placeholder="Cup d'hiver 2026" class={inputCls} />
						</div>
					</div>
					<div>
						<label for="t-desc" class={labelCls}>{i18n.t('admin.tournaments.descriptionLabel')}</label>
						<textarea id="t-desc" bind:value={tDesc} rows="2" class={textareaCls}></textarea>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="t-kind" class={labelCls}>{i18n.t('admin.tournaments.kind')} *</label>
							<Select
								items={[
									{ value: 'individual', label: 'Individual' },
									{ value: 'guild_war', label: 'Guild war' },
									{ value: 'hackathon', label: 'Hackathon' }
								]}
								bind:value={tKind}
								class="w-full"
							/>
						</div>
						<div>
							<label for="t-fmt" class={labelCls}>{i18n.t('admin.tournaments.format')}</label>
							<Select
								items={[
									{ value: 'ladder', label: 'Ladder' },
									{ value: 'swiss', label: 'Swiss' },
									{ value: 'bracket', label: 'Bracket' }
								]}
								bind:value={tFormat}
								class="w-full"
							/>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="t-frag" class={labelCls}>{i18n.t('admin.tournaments.prizeFragments')}</label>
							<input id="t-frag" type="number" bind:value={tPrizeFrag} min="0" class={inputCls} />
						</div>
						<div>
							<label for="t-gp" class={labelCls}>{i18n.t('admin.tournaments.prizeGp')}</label>
							<input id="t-gp" type="number" bind:value={tPrizeGp} min="0" class={inputCls} />
						</div>
					</div>
					<div class="grid grid-cols-3 gap-3">
						<div>
							<label for="t-reg" class={labelCls}>{i18n.t('admin.tournaments.registration')}</label>
							<input id="t-reg" type="datetime-local" bind:value={tRegOpensAt} class={inputCls} />
						</div>
						<div>
							<label for="t-start" class={labelCls}>{i18n.t('admin.tournaments.startsAt')} *</label>
							<input id="t-start" type="datetime-local" bind:value={tStartsAt} required class={inputCls} />
						</div>
						<div>
							<label for="t-end" class={labelCls}>{i18n.t('admin.tournaments.endsAt')} *</label>
							<input id="t-end" type="datetime-local" bind:value={tEndsAt} required class={inputCls} />
						</div>
					</div>

					{#if tKind === 'hackathon'}
						<div class="space-y-3 rounded-xl border border-border bg-surface-overlay p-3">
							<p class="text-xs uppercase tracking-wider text-text-muted">
								{i18n.t('admin.tournaments.sponsorHackathonOnly')}
							</p>
							<div>
								<label for="t-sent" class={labelCls}>{i18n.t('admin.tournaments.enterpriseId')}</label>
								<input id="t-sent" bind:value={tSponsorEntId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
							</div>
							<div>
								<label for="t-slogo" class={labelCls}>{i18n.t('admin.tenants.logoUrl')}</label>
								<input id="t-slogo" bind:value={tSponsorLogo} placeholder="https://…" class={inputCls} />
							</div>
							<div>
								<label for="t-sblurb" class={labelCls}>{i18n.t('admin.tournaments.blurb')}</label>
								<textarea id="t-sblurb" bind:value={tSponsorBlurb} rows="2" class={textareaCls}></textarea>
							</div>
						</div>
					{/if}

					<div class="flex justify-end pt-2">
						<Button variant="accent" loading={creatingTournament}>
							{i18n.t('admin.tournaments.createTournament')}
						</Button>
					</div>
				</form>

				{#if lastTournament}
					<div class="mt-4 rounded-xl border border-success/30 bg-success/10 p-4 text-xs">
						<div class="flex items-center gap-2 mb-1">
							<p class="font-bold text-success">{lastTournament.name}</p>
							<Badge variant="default" size="sm">{lastTournament.kind}</Badge>
							<Badge variant="default" size="sm">{lastTournament.format}</Badge>
						</div>
						<p class="font-mono text-text-muted">{lastTournament.id}</p>
					</div>
				{/if}
			</section>

			<!-- Tournament ops -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6">
				<div class="mb-4 flex items-center gap-2">
					<Trophy size={16} strokeWidth={2} class="text-primary" />
					<h2 class="text-lg font-bold">{i18n.t('admin.tournaments.tournamentOps')}</h2>
				</div>

				<div class="mb-4">
					<label for="to-id" class={labelCls}>{i18n.t('admin.common.tournamentIdLabel')} *</label>
					<input id="to-id" bind:value={tournamentOpsId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
				</div>

				<form onsubmit={submitTournamentStatus} class="mb-6 space-y-3 border-t border-border pt-4">
					<p class="text-xs uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tournaments.changeStatus')}
					</p>
					<Select
						items={[
							{ value: 'draft', label: 'draft' },
							{ value: 'registration', label: 'registration' },
							{ value: 'active', label: 'active' },
							{ value: 'closed', label: 'closed' }
						]}
						bind:value={tournamentNewStatus}
						class="w-full"
					/>
					<Button variant="secondary" size="sm" loading={updatingTournamentStatus}>
						{i18n.t('admin.common.apply')}
					</Button>
				</form>

				<form onsubmit={submitScore} class="mb-6 space-y-3 border-t border-border pt-4">
					<p class="text-xs uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tournaments.scoreOverride')}
					</p>
					<SegmentedControl
						items={[
							{ value: 'user', label: 'User' },
							{ value: 'guild', label: 'Guild' }
						]}
						bind:value={scoreParticipantType}
					/>
					<div>
						<label for="sc-pid" class={labelCls}>{i18n.t('admin.tournaments.participantId')} *</label>
						<input id="sc-pid" bind:value={scoreParticipantId} placeholder="uuid…" class="{inputCls} font-mono text-xs" />
					</div>
					<div>
						<label for="sc-val" class={labelCls}>{i18n.t('admin.tournaments.scoreValue')}</label>
						<input id="sc-val" type="number" bind:value={scoreValue} class={inputCls} />
					</div>
					<Button variant="secondary" size="sm" loading={scoring}>
						{i18n.t('admin.tournaments.saveScore')}
					</Button>
				</form>

				<div class="space-y-3 border-t border-border pt-4">
					<p class="text-xs uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tournaments.concludeTournament')}
					</p>
					<p class="text-xs text-text-muted">
						{i18n.t('admin.tournaments.concludeTournamentHint')}
					</p>
					<Button variant="danger" size="sm" onclick={requestConclude} loading={concludingTournament}>
						<Trophy size={14} strokeWidth={2} />
						{i18n.t('admin.tournaments.concludeBtn')}
					</Button>
				</div>
			</section>
		</div>
	{/if}
</div>

<ConfirmDangerousDialog
	open={showCloseSeason}
	title={i18n.t('admin.tournaments.closeSeason')}
	description={i18n.t('admin.tournaments.closeSeasonConfirm')}
	actionLabel={i18n.t('admin.tournaments.closePermanently')}
	loading={closingSeason}
	onconfirm={confirmCloseSeason}
	onclose={() => (showCloseSeason = false)}
/>

<ConfirmDangerousDialog
	open={showConcludeTournament}
	title={i18n.t('admin.tournaments.concludeTournament')}
	description={i18n.t('admin.tournaments.concludeConfirm')}
	actionLabel={i18n.t('admin.tournaments.concludeBtn')}
	loading={concludingTournament}
	onconfirm={confirmConclude}
	onclose={() => (showConcludeTournament = false)}
/>
