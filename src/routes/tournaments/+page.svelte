<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import {
		adminApi,
		TOURNAMENT_KINDS,
		TOURNAMENT_REQUIRED_RULES,
		type Season,
		type Tournament,
		type TournamentKind,
		type TournamentFormat,
		type SeasonCloseReport
	} from '$api/admin';
	import { competitionsApi } from '$api/competitions';
	import { JUDGE_STATUSES } from '$lib/types';
	import type {
		JuryInvitation,
		OutstandingPrize,
		SeasonListRow,
		TournamentSubmission,
		VoteBurst
	} from '$lib/types';
	import Input from '$components/ui/Input.svelte';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Select from '$components/ui/Select.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Swords, Calendar, Trophy, Sparkles, ChevronRight, Flag, DoorClosed, Gavel, Coins, Activity, ClipboardCheck, EyeOff } from '@lucide/svelte';

	type Tab = 'seasons' | 'tournaments' | 'contests';
	let activeTab = $state<Tab>('seasons');

	// --- Contest operations ---
	//
	// The three surfaces a contest needs beyond scoring, and the ones both
	// the cyber competitions (SKI-148 / SKI-150) and the design contests
	// (SKI-236 / SKI-200) run on. They live here rather than on a
	// domain-specific page because a contest is a tournament: the subject
	// differs, the mechanism does not.
	let jurySlug = $state('');
	let jury = $state<JuryInvitation[]>([]);
	let juryLoading = $state(false);
	let juryLoaded = $state(false);

	let inviteTournamentId = $state('');
	let inviteJurorId = $state('');
	let inviting = $state(false);

	let burstTournamentId = $state('');
	let burstWindow = $state(5);
	let burstThreshold = $state(10);
	let bursts = $state<VoteBurst[]>([]);
	let burstsLoading = $state(false);
	let burstsLoaded = $state(false);

	let prizes = $state<OutstandingPrize[]>([]);
	let prizesLoading = $state(false);

	let fundTournamentId = $state('');
	let fundEnterpriseId = $state('');
	let fundAmount = $state('');
	let fundCurrency = $state('EUR');
	let fundReference = $state('');
	let funding = $state(false);

	let refundTournamentId = $state('');
	let showRefund = $state(false);
	let refunding = $state(false);

	// --- Judging ---
	//
	// The panel's own screen. Judging is gated on `jury_tournament`, not on
	// `admin`: administering the platform and knowing whether a TDD entry is
	// good are different competences, and the backend says so. An admin who
	// is not a juror will be refused here, which is correct.
	let judgeSlug = $state('');
	let submissions = $state<TournamentSubmission[]>([]);
	let submissionsBlinded = $state(false);
	let submissionsBlindUntil = $state<string | null>(null);
	let submissionsLoading = $state(false);
	let submissionsLoaded = $state(false);

	// One draft per entry rather than one shared form: a juror works down the
	// list, and a single form would silently carry the last verdict onto the
	// next entry.
	let verdictStatus = $state<Record<string, string>>({});
	let verdictScore = $state<Record<string, string>>({});
	let verdictNotes = $state<Record<string, string>>({});
	let judging = $state<string | null>(null);

	async function loadSubmissions() {
		if (!judgeSlug.trim()) return;
		submissionsLoading = true;
		try {
			const res = await competitionsApi.tournamentSubmissions(judgeSlug.trim());
			submissions = res.data.submissions;
			// Seeded rather than left undefined: the verdict select binds to
			// these, and an absent key would render as a chosen-nothing that
			// looks like a choice.
			for (const entry of submissions) {
				verdictStatus[entry.id] ??= '';
				verdictScore[entry.id] ??= '';
				verdictNotes[entry.id] ??= '';
			}
			submissionsBlinded = res.data.blinded;
			submissionsBlindUntil = res.data.blind_until;
			submissionsLoaded = true;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			submissionsLoading = false;
		}
	}

	async function judge(entry: TournamentSubmission) {
		const status = verdictStatus[entry.id];
		if (!status) return;
		judging = entry.id;
		try {
			const score = verdictScore[entry.id]?.trim();
			const notes = verdictNotes[entry.id]?.trim();
			const res = await competitionsApi.judgeSubmission(entry.id, {
				status: status as 'accepted' | 'rejected' | 'disqualified',
				// Sent when typed and omitted when not. Whether a score is
				// required or refused depends on the contest being judged or
				// measured, which only the backend knows — so it decides, and
				// its 400 is the message the juror reads.
				...(score ? { judge_score: Number(score) } : {}),
				...(notes ? { judge_notes: notes } : {})
			});
			// Replace the row in place. Reloading would re-blind nothing and
			// lose the drafts on every other entry.
			submissions = submissions.map((s) => (s.id === entry.id ? res.data.submission : s));
			verdictScore[entry.id] = '';
			verdictNotes[entry.id] = '';
			toast.success(i18n.t('admin.tournaments.contestOps.judged'));
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			judging = null;
		}
	}

	async function loadJury() {
		if (!jurySlug.trim()) return;
		juryLoading = true;
		try {
			const res = await adminApi.listJury(jurySlug.trim());
			jury = res.data.jury;
			juryLoaded = true;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			juryLoading = false;
		}
	}

	async function inviteJuror() {
		if (!inviteTournamentId.trim() || !inviteJurorId.trim()) return;
		inviting = true;
		try {
			await adminApi.inviteJuror(inviteTournamentId.trim(), inviteJurorId.trim());
			toast.success(i18n.t('admin.tournaments.contestOps.invited_toast'));
			inviteJurorId = '';
			// The panel the operator is looking at is the one they just
			// changed, more often than not. Refreshing it costs one request
			// and saves the confusion of an invitation that appears to have
			// done nothing.
			if (juryLoaded && jurySlug.trim()) await loadJury();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			inviting = false;
		}
	}

	async function loadBursts() {
		if (!burstTournamentId.trim()) return;
		burstsLoading = true;
		try {
			const res = await adminApi.voteBursts(burstTournamentId.trim(), {
				window_minutes: Number(burstWindow),
				threshold: Number(burstThreshold)
			});
			bursts = res.data.bursts;
			burstsLoaded = true;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			burstsLoading = false;
		}
	}

	async function loadPrizes() {
		prizesLoading = true;
		try {
			const res = await adminApi.outstandingPrizes();
			prizes = res.data.contests;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			prizesLoading = false;
		}
	}

	async function fundPrize() {
		if (!fundTournamentId.trim()) return;
		funding = true;
		try {
			await adminApi.fundPrize(fundTournamentId.trim(), {
				funder_enterprise_id: fundEnterpriseId.trim(),
				amount: fundAmount.trim(),
				currency: fundCurrency,
				provider_reference: fundReference.trim()
			});
			toast.success(i18n.t('admin.tournaments.contestOps.funded'));
			await loadPrizes();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			funding = false;
		}
	}

	async function refundPrize(reason: string) {
		if (!refundTournamentId.trim()) return;
		refunding = true;
		try {
			await adminApi.refundPrize(refundTournamentId.trim(), reason);
			toast.success(i18n.t('admin.tournaments.contestOps.refunded'));
			showRefund = false;
			await loadPrizes();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			refunding = false;
		}
	}

	// The outstanding-prize list is the only one of the three that needs no
	// identifier to be useful, so it loads itself when the tab opens.
	$effect(() => {
		if (activeTab === 'contests' && prizes.length === 0 && !prizesLoading) {
			void loadPrizes();
		}
	});

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
	/** Empty means "not stated". The backend defaults nothing here — a
	 *  contest with no domain is a contest nobody can find by subject. */
	let tSkillDomain = $state('');
	/** One free-text field per key the chosen kind requires. Kept as strings:
	 *  every current requirement is either prose or a number typed into a
	 *  form, and `buildRules` is the single place that converts. */
	let tRules = $state<Record<string, string>>({});

	/** What this kind must state before anybody can enter. Empty for kinds
	 *  scored from activity elsewhere on the platform. */
	const requiredRules = $derived(TOURNAMENT_REQUIRED_RULES[tKind] ?? []);

	// Switching kind clears the previous kind's answers rather than carrying
	// them over — `theme` typed for a hackathon is not a `brief`, and sending
	// it would only produce a confusing backend refusal.
	$effect(() => {
		void tKind;
		tRules = {};
	});

	/** Numeric requirements go over the wire as numbers; the backend checks
	 *  `target_merged_prs` and `duration_hours` as values, not as prose. */
	const NUMERIC_RULES = new Set(['target_merged_prs', 'duration_hours']);

	/** Requirements that are prose and need room to be written. A brief typed
	 *  into a single-line input is how a brief becomes a subject line. */
	const LONG_RULES = new Set(['brief', 'judging_criteria', 'theme', 'task']);

	const DOMAINS = ['code', 'design', 'game', 'security', 'soft_skills', 'ai', 'ops'];

	/** The backend refuses a brief under 200 characters: below that the
	 *  answers differ on things nobody stated. Surfaced live so the refusal
	 *  is never a surprise at submit time. */
	const BRIEF_MIN_LENGTH = 200;
	const briefTooShort = $derived(
		tKind === 'brief_contest' && (tRules.brief ?? '').trim().length < BRIEF_MIN_LENGTH
	);

	function buildRules(): Record<string, unknown> | undefined {
		if (requiredRules.length === 0) return undefined;
		const out: Record<string, unknown> = {};
		for (const key of requiredRules) {
			const raw = (tRules[key] ?? '').trim();
			if (!raw) continue;
			if (NUMERIC_RULES.has(key)) {
				const n = Number(raw);
				out[key] = Number.isFinite(n) ? n : raw;
			} else {
				out[key] = raw;
			}
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}

	/** Every required key answered. Checked here so the form refuses before
	 *  the round trip, rather than surfacing a backend validation error. */
	const rulesComplete = $derived(
		requiredRules.every((k) => (tRules[k] ?? '').trim().length > 0)
	);
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
		if (!rulesComplete || briefTooShort) return;
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
				ends_at: new Date(tEndsAt).toISOString(),
				skill_domain: tSkillDomain || undefined,
				rules: buildRules()
			});
			lastTournament = res.data.tournament;
			toast.success(i18n.t('admin.tournaments.tournamentCreated'));
			tSlug = ''; tName = ''; tDesc = '';
			tSponsorEntId = ''; tSponsorLogo = ''; tSponsorBlurb = '';
			tRules = {};
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

	// The seasons list.
	//
	// `/admin/seasons` has no GET at all, so this page could create and close
	// seasons without ever showing them — an action with no list in front of
	// it, the shape SKI-337 named. `GET /seasons` is the only listing the
	// backend serves, and it is a read against the same table.
	//
	// Its projection is not the one `/admin/seasons` writes: `seasons.rs`
	// records a theme where `tournament.rs` records a description. Two
	// modules, one table — filed on SKI-354.
	let seasonList = $state<SeasonListRow[]>([]);
	let seasonsLoading = $state(true);

	async function loadSeasons() {
		seasonsLoading = true;
		try {
			const res = await competitionsApi.seasons();
			seasonList = res.data.seasons;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			seasonsLoading = false;
		}
	}

	$effect(() => {
		void loadSeasons();
	});

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
			{ id: 'tournaments' as Tab, label: i18n.t('admin.tournaments.tabTournaments'), icon: Swords },
			{ id: 'contests' as Tab, label: i18n.t('admin.tournaments.contestOps.title'), icon: Gavel }
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
		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-6">
			<div class="mb-4 flex items-center gap-2">
				<Calendar size={16} strokeWidth={2} class="text-accent" />
				<h2 class="text-lg font-bold">{i18n.t('admin.tournaments.seasonsListTitle')}</h2>
			</div>
			{#if seasonsLoading}
				<p class="text-sm text-text-muted">{i18n.t('admin.common.pending')}</p>
			{:else if seasonList.length === 0}
				<p class="text-sm text-text-muted">{i18n.t('admin.tournaments.emptySeasons')}</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each seasonList as s (s.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 py-2.5">
							<div class="min-w-0">
								<span class="text-sm font-medium">{s.name}</span>
								<Badge variant={s.status === 'active' ? 'success' : 'default'}>{s.status}</Badge>
								<p class="mt-0.5 text-[11px] text-text-muted">
									<code class="font-mono">{s.slug}</code>
									{#if s.theme}· {s.theme}{/if}
								</p>
							</div>
							<code class="font-mono text-[10px] text-text-muted">{s.id}</code>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
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
								items={TOURNAMENT_KINDS.map((k) => ({
									value: k,
									label: i18n.t(`admin.tournaments.kinds.${k}`)
								}))}
								bind:value={tKind}
								searchable
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

					<div>
						<label for="t-domain" class={labelCls}>
							{i18n.t('admin.tournaments.skillDomainLabel')}
						</label>
						<Select
							items={[
								{ value: '', label: i18n.t('admin.tournaments.skillDomainNone') },
								...DOMAINS.map((d) => ({
									value: d,
									label: i18n.t(`admin.catalog.domains.${d}`)
								}))
							]}
							bind:value={tSkillDomain}
							class="w-full"
						/>
						<p class="mt-1 text-xs text-text-muted">
							{i18n.t('admin.tournaments.skillDomainHint')}
						</p>
					</div>

					{#if requiredRules.length > 0}
						<!-- Kind-specific requirements. The backend refuses creation
						     without them, so the form asks for them up front rather
						     than letting the round trip explain. -->
						<fieldset class="rounded-xl border border-border bg-surface-overlay p-4">
							<legend class="px-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
								{i18n.t('admin.tournaments.rulesTitle')}
							</legend>
							<p class="mb-3 text-xs text-text-muted">
								{i18n.t('admin.tournaments.rulesHint')}
							</p>
							<div class="flex flex-col gap-3">
								{#each requiredRules as key (key)}
									<div>
										<label for={`t-rule-${key}`} class={labelCls}>
											{i18n.t(`admin.tournaments.ruleKeys.${key}`)} *
										</label>
										{#if LONG_RULES.has(key)}
											<textarea
												id={`t-rule-${key}`}
												rows="4"
												bind:value={tRules[key]}
												placeholder={i18n.t(`admin.tournaments.rulePlaceholders.${key}`)}
												class={textareaCls}
											></textarea>
										{:else}
											<input
												id={`t-rule-${key}`}
												type={NUMERIC_RULES.has(key) ? 'number' : 'text'}
												bind:value={tRules[key]}
												placeholder={i18n.t(`admin.tournaments.rulePlaceholders.${key}`)}
												class={inputCls}
											/>
										{/if}
									</div>
								{/each}
							</div>
							{#if tKind === 'brief_contest'}
								<p class="mt-3 text-xs {briefTooShort ? 'text-error' : 'text-text-muted'}">
									{i18n.t('admin.tournaments.briefLengthHint', {
										min: BRIEF_MIN_LENGTH,
										current: (tRules.brief ?? '').trim().length
									})}
								</p>
							{/if}
						</fieldset>
					{/if}
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
						<Button
							variant="accent"
							loading={creatingTournament}
							disabled={!rulesComplete || briefTooShort}
						>
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
	{:else if activeTab === 'contests'}
		<p class="mb-6 max-w-3xl text-sm text-text-muted">
			{i18n.t('admin.tournaments.contestOps.hint')}
		</p>

		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Jury -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6">
				<div class="mb-4 flex items-center gap-2">
					<Gavel size={16} strokeWidth={2} class="text-accent" />
					<h2 class="text-sm font-bold uppercase tracking-wider">
						{i18n.t('admin.tournaments.contestOps.juryTitle')}
					</h2>
				</div>
				<p class="mb-4 text-xs text-text-muted">
					{i18n.t('admin.tournaments.contestOps.juryHint')}
				</p>

				<div class="flex flex-wrap items-end gap-3">
					<Input
						label={i18n.t('admin.tournaments.contestOps.jurySlugLabel')}
						bind:value={jurySlug}
						class="flex-1 min-w-[12rem]"
					/>
					<Button variant="secondary" size="sm" onclick={loadJury} loading={juryLoading}>
						{i18n.t('admin.tournaments.contestOps.loadJury')}
					</Button>
				</div>

				{#if juryLoaded}
					{#if jury.length === 0}
						<p class="mt-4 text-sm text-text-muted">
							{i18n.t('admin.tournaments.contestOps.juryEmpty')}
						</p>
					{:else}
						<ul class="mt-4 space-y-1.5">
							{#each jury as j (j.juror_user_id)}
								<li class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2">
									<a
										href={`/users/${j.juror_user_id}`}
										class="font-mono text-xs text-primary hover:underline"
									>
										{j.juror_user_id.slice(0, 8)}…
									</a>
									{#if j.accepted_at}
										<Badge variant="success">
											{i18n.t('admin.tournaments.contestOps.accepted')}
										</Badge>
									{:else if j.declined_at}
										<Badge variant="error">
											{i18n.t('admin.tournaments.contestOps.declined')}
										</Badge>
									{:else}
										<Badge variant="warning">
											{i18n.t('admin.tournaments.contestOps.invited')}
										</Badge>
									{/if}
									{#if j.decline_reason}
										<span class="text-xs text-text-muted">{j.decline_reason}</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{/if}

				<div class="mt-6 space-y-3 border-t border-border pt-4">
					<p class="text-xs uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tournaments.contestOps.inviteTitle')}
					</p>
					<p class="text-xs text-text-muted">
						{i18n.t('admin.tournaments.contestOps.inviteHint')}
					</p>
					<Input
						label={i18n.t('admin.tournaments.contestOps.tournamentIdLabel')}
						bind:value={inviteTournamentId}
					/>
					<Input
						label={i18n.t('admin.tournaments.contestOps.jurorIdLabel')}
						bind:value={inviteJurorId}
					/>
					<Button variant="primary" size="sm" onclick={inviteJuror} loading={inviting}>
						{i18n.t('admin.tournaments.contestOps.invite')}
					</Button>
				</div>
			</section>

			<!-- Vote bursts -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6">
				<div class="mb-4 flex items-center gap-2">
					<Activity size={16} strokeWidth={2} class="text-accent" />
					<h2 class="text-sm font-bold uppercase tracking-wider">
						{i18n.t('admin.tournaments.contestOps.burstsTitle')}
					</h2>
				</div>
				<p class="mb-4 text-xs text-text-muted">
					{i18n.t('admin.tournaments.contestOps.burstsHint')}
				</p>

				<div class="space-y-3">
					<Input
						label={i18n.t('admin.tournaments.contestOps.tournamentIdLabel')}
						bind:value={burstTournamentId}
					/>
					<div class="flex flex-wrap items-end gap-3">
						<Input
							label={i18n.t('admin.tournaments.contestOps.windowLabel')}
							type="number"
							min="1"
							bind:value={burstWindow as unknown as string}
							class="w-32"
						/>
						<Input
							label={i18n.t('admin.tournaments.contestOps.thresholdLabel')}
							type="number"
							min="1"
							bind:value={burstThreshold as unknown as string}
							class="w-32"
						/>
						<Button variant="secondary" size="sm" onclick={loadBursts} loading={burstsLoading}>
							{i18n.t('admin.tournaments.contestOps.scan')}
						</Button>
					</div>
				</div>

				{#if burstsLoaded}
					{#if bursts.length === 0}
						<p class="mt-4 text-sm text-text-muted">
							{i18n.t('admin.tournaments.contestOps.burstsEmpty')}
						</p>
					{:else}
						<ul class="mt-4 space-y-1.5">
							{#each bursts as b (b.submission_id)}
								<li class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2">
									<Badge variant="warning">
										{b.votes}
										{i18n.t('admin.tournaments.contestOps.votes')}
									</Badge>
									<code class="font-mono text-[10px] text-text-muted">{b.submission_id}</code>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</section>

			<!-- Prizes -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6 lg:col-span-2">
				<div class="mb-4 flex items-center gap-2">
					<Coins size={16} strokeWidth={2} class="text-accent" />
					<h2 class="text-sm font-bold uppercase tracking-wider">
						{i18n.t('admin.tournaments.contestOps.prizesTitle')}
					</h2>
				</div>
				<p class="mb-4 text-xs text-text-muted">
					{i18n.t('admin.tournaments.contestOps.prizesHint')}
				</p>

				{#if prizesLoading}
					<p class="text-sm text-text-muted">…</p>
				{:else if prizes.length === 0}
					<p class="text-sm text-text-muted">
						{i18n.t('admin.tournaments.contestOps.prizesEmpty')}
					</p>
				{:else}
					<ul class="space-y-1.5">
						{#each prizes as p (p.tournament_id)}
							<li class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2">
								<span class="text-sm text-text-primary">{p.name}</span>
								<code class="font-mono text-[10px] text-text-muted">{p.tournament_id}</code>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => {
										refundTournamentId = p.tournament_id;
										showRefund = true;
									}}
								>
									{i18n.t('admin.tournaments.contestOps.refund')}
								</Button>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
					<p class="text-xs uppercase tracking-wider text-text-muted sm:col-span-2">
						{i18n.t('admin.tournaments.contestOps.fundTitle')}
					</p>
					<p class="text-xs text-text-muted sm:col-span-2">
						{i18n.t('admin.tournaments.contestOps.fundHint')}
					</p>
					<Input
						label={i18n.t('admin.tournaments.contestOps.tournamentIdLabel')}
						bind:value={fundTournamentId}
					/>
					<Input
						label={i18n.t('admin.tournaments.contestOps.funderLabel')}
						bind:value={fundEnterpriseId}
					/>
					<Input
						label={i18n.t('admin.tournaments.contestOps.amountLabel')}
						bind:value={fundAmount}
					/>
					<label class="flex flex-col gap-1.5">
						<span class="text-sm font-medium text-text-primary">
							{i18n.t('admin.tournaments.contestOps.currencyLabel')}
						</span>
						<Select
							items={[
								{ value: 'EUR', label: 'EUR' },
								{ value: 'XOF', label: 'XOF' }
							]}
							bind:value={fundCurrency}
							shape="rounded"
						/>
					</label>
					<Input
						label={i18n.t('admin.tournaments.contestOps.providerRefLabel')}
						bind:value={fundReference}
						class="sm:col-span-2"
					/>
					<div class="sm:col-span-2">
						<Button variant="primary" size="sm" onclick={fundPrize} loading={funding}>
							{i18n.t('admin.tournaments.contestOps.fund')}
						</Button>
					</div>
				</div>
			</section>

			<!-- Judging -->
			<section class="rounded-2xl border border-border bg-surface-elevated p-6 lg:col-span-2">
				<div class="mb-4 flex items-center gap-2">
					<ClipboardCheck size={16} strokeWidth={2} class="text-accent" />
					<h2 class="text-sm font-bold uppercase tracking-wider">
						{i18n.t('admin.tournaments.contestOps.judgeTitle')}
					</h2>
				</div>
				<p class="mb-4 text-xs text-text-muted">
					{i18n.t('admin.tournaments.contestOps.judgeHint')}
				</p>

				<div class="flex flex-wrap items-end gap-3">
					<Input
						label={i18n.t('admin.tournaments.contestOps.jurySlugLabel')}
						bind:value={judgeSlug}
						class="min-w-[12rem] flex-1"
					/>
					<Button
						variant="secondary"
						size="sm"
						onclick={loadSubmissions}
						loading={submissionsLoading}
					>
						{i18n.t('admin.tournaments.contestOps.loadSubmissions')}
					</Button>
				</div>

				{#if submissionsLoaded}
					{#if submissionsBlinded}
						<p
							class="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-text-muted"
						>
							<EyeOff size={13} strokeWidth={2} class="mt-0.5 shrink-0 text-warning" />
							<span>
								{i18n.t('admin.tournaments.contestOps.blindedNote')}
								{#if submissionsBlindUntil}
									{i18n.t('admin.tournaments.contestOps.blindUntil')}
									{new Date(submissionsBlindUntil).toLocaleString()}
								{/if}
							</span>
						</p>
					{/if}

					{#if submissions.length === 0}
						<p class="mt-4 text-sm text-text-muted">
							{i18n.t('admin.tournaments.contestOps.submissionsEmpty')}
						</p>
					{:else}
						<ul class="mt-4 space-y-3">
							{#each submissions as entry (entry.id)}
								<li class="rounded-xl border border-border bg-surface-overlay p-4">
									<div class="mb-2 flex flex-wrap items-center gap-2">
										<Badge
											variant={entry.status === 'accepted'
												? 'success'
												: entry.status === 'submitted'
													? 'warning'
													: 'error'}
										>
											{entry.status}
										</Badge>
										{#if entry.measured_value !== null}
											<Badge variant="primary">
												{i18n.t('admin.tournaments.contestOps.measured')}: {entry.measured_value}
											</Badge>
										{/if}
										{#if entry.judge_score !== null}
											<Badge variant="primary">
												{i18n.t('admin.tournaments.contestOps.scoreLabel')}: {entry.judge_score}
											</Badge>
										{/if}
										{#if entry.language}
											<Badge variant="default">{entry.language}</Badge>
										{/if}
										<code class="font-mono text-[10px] text-text-muted">{entry.id}</code>
									</div>

									<p class="mb-2 text-sm text-text-primary">{entry.summary}</p>

									<div class="mb-3 flex flex-wrap items-center gap-3 text-xs">
										<a
											href={entry.artifact_url}
											target="_blank"
											rel="noreferrer noopener"
											class="text-primary hover:underline"
										>
											{entry.artifact_type}
										</a>
										{#if entry.secondary_url}
											<a
												href={entry.secondary_url}
												target="_blank"
												rel="noreferrer noopener"
												class="text-primary hover:underline"
											>
												{i18n.t('admin.tournaments.contestOps.secondaryUrl')}
											</a>
										{/if}
										<span class="text-text-muted">
											{new Date(entry.submitted_at).toLocaleString()}
										</span>
									</div>

									{#if entry.judged_at}
										<p class="mb-3 text-xs text-text-muted">
											{i18n.t('admin.tournaments.contestOps.judgedOn')}
											{new Date(entry.judged_at).toLocaleString()}
											{#if entry.judge_notes}
												— {entry.judge_notes}
											{/if}
										</p>
									{/if}

									<div class="grid gap-3 border-t border-border pt-3 sm:grid-cols-4">
										<label class="flex flex-col gap-1.5">
											<span class="text-sm font-medium text-text-primary">
												{i18n.t('admin.tournaments.contestOps.verdictLabel')}
											</span>
											<Select
												items={JUDGE_STATUSES.map((s) => ({
													value: s,
													label: i18n.t(`admin.tournaments.contestOps.verdicts.${s}`)
												}))}
												bind:value={verdictStatus[entry.id]}
												placeholder={i18n.t('admin.tournaments.contestOps.verdictPlaceholder')}
												shape="rounded"
											/>
										</label>
										<Input
											label={i18n.t('admin.tournaments.contestOps.scoreLabel')}
											type="number"
											min="0"
											max="100"
											bind:value={verdictScore[entry.id]}
										/>
										<Input
											label={i18n.t('admin.tournaments.contestOps.notesLabel')}
											bind:value={verdictNotes[entry.id]}
											class="sm:col-span-2"
										/>
									</div>
									<div class="mt-3">
										<Button
											variant="primary"
											size="sm"
											disabled={!verdictStatus[entry.id]}
											loading={judging === entry.id}
											onclick={() => judge(entry)}
										>
											{i18n.t('admin.tournaments.contestOps.judgeBtn')}
										</Button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
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

<ConfirmDangerousDialog
	open={showRefund}
	title={i18n.t('admin.tournaments.contestOps.refundTitle')}
	description={i18n.t('admin.tournaments.contestOps.refundHint')}
	actionLabel={i18n.t('admin.tournaments.contestOps.refund')}
	minReasonLength={10}
	loading={refunding}
	onconfirm={refundPrize}
	onclose={() => (showRefund = false)}
/>
