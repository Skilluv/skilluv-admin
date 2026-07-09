<script lang="ts">
	import { onMount } from 'svelte';
	import { adminApi, type ChallengeCreateBody, type ChallengePatchBody } from '$api/admin';
	import { SkilluError } from '$api/client';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { i18n } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import type {
		Challenge,
		ChallengeDifficulty,
		ChallengeMode,
		ChallengeTone,
		SkillDomain
	} from '$types';
	import { Plus, Pencil } from '@lucide/svelte';

	let challenges = $state<Challenge[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let query = $state('');

	// Form state (shared between create + edit)
	let showForm = $state(false);
	let editing = $state<Challenge | null>(null); // null → create mode
	let submitting = $state(false);
	const form = $state({
		title: '',
		description: '',
		instructions: '',
		skill_domain: 'code' as SkillDomain,
		difficulty: 3 as ChallengeDifficulty,
		mode: 'solo' as ChallengeMode,
		duration_minutes: 0,
		ai_allowed: false,
		tone: 'serious' as ChallengeTone,
		language: '',
		prerequisite_fragments: 0,
		reward_fragments: 0,
		is_onboarding: false,
		expected_output: '',
		test_cases: ''
	});

	async function loadChallenges() {
		loading = true;
		try {
			const res = await adminApi.listChallenges();
			challenges = res.data.challenges;
			total = res.data.total;
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			loading = false;
		}
	}

	async function publish(id: string) {
		try {
			await adminApi.publishChallenge(id);
			const c = challenges.find((ch) => ch.id === id);
			if (c) c.status = 'published';
			toast.success(i18n.t('admin.challenges.published'));
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		}
	}

	async function archive(id: string) {
		try {
			await adminApi.archiveChallenge(id);
			const c = challenges.find((ch) => ch.id === id);
			if (c) c.status = 'archived';
			toast.success(i18n.t('admin.challenges.archived'));
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		}
	}

	function resetForm() {
		form.title = '';
		form.description = '';
		form.instructions = '';
		form.skill_domain = 'code';
		form.difficulty = 3;
		form.mode = 'solo';
		form.duration_minutes = 0;
		form.ai_allowed = false;
		form.tone = 'serious';
		form.language = '';
		form.prerequisite_fragments = 0;
		form.reward_fragments = 0;
		form.is_onboarding = false;
		form.expected_output = '';
		form.test_cases = '';
	}

	function openCreate() {
		resetForm();
		editing = null;
		showForm = true;
	}

	function openEdit(ch: Challenge) {
		editing = ch;
		form.title = ch.title;
		form.description = ch.description;
		form.instructions = ch.instructions;
		form.skill_domain = ch.skill_domain;
		form.difficulty = ch.difficulty;
		form.mode = ch.mode;
		form.duration_minutes = ch.duration_minutes ?? 0;
		form.ai_allowed = ch.ai_allowed;
		form.tone = ch.tone;
		form.language = ch.language ?? '';
		form.prerequisite_fragments = ch.prerequisite_fragments;
		form.reward_fragments = ch.reward_fragments;
		form.is_onboarding = ch.is_onboarding ?? false;
		form.expected_output = ch.expected_output ?? '';
		form.test_cases = ch.test_cases ? JSON.stringify(ch.test_cases, null, 2) : '';
		showForm = true;
	}

	function parseTestCases(): { ok: true; value: unknown } | { ok: false } {
		const raw = form.test_cases.trim();
		if (!raw) return { ok: true, value: undefined };
		try {
			return { ok: true, value: JSON.parse(raw) };
		} catch {
			return { ok: false };
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		const parsed = parseTestCases();
		if (!parsed.ok) {
			toast.error(i18n.t('admin.challenges.testCasesInvalid'));
			return;
		}
		submitting = true;
		try {
			if (editing) {
				// PATCH — n'envoie que les champs modifiés serait idéal, mais l'endpoint
				// accepte des Option<T> partout et compare la valeur reçue à la valeur
				// stockée. Envoyer tous les champs remplis évite les surprises.
				const body: ChallengePatchBody = {
					title: form.title.trim(),
					description: form.description.trim(),
					instructions: form.instructions.trim(),
					skill_domain: form.skill_domain,
					difficulty: form.difficulty,
					mode: form.mode,
					duration_minutes: form.duration_minutes || null,
					ai_allowed: form.ai_allowed,
					tone: form.tone,
					language: form.language.trim() || null,
					prerequisite_fragments: form.prerequisite_fragments,
					reward_fragments: form.reward_fragments,
					expected_output: form.expected_output.trim() || null,
					test_cases: parsed.value
				};
				await adminApi.updateChallenge(editing.id, body);
				toast.success(i18n.t('admin.challenges.updated'));
			} else {
				const body: ChallengeCreateBody = {
					title: form.title.trim(),
					description: form.description.trim(),
					instructions: form.instructions.trim(),
					skill_domain: form.skill_domain,
					difficulty: form.difficulty,
					mode: form.mode,
					duration_minutes: form.duration_minutes || null,
					ai_allowed: form.ai_allowed,
					tone: form.tone,
					language: form.language.trim() || null,
					prerequisite_fragments: form.prerequisite_fragments,
					reward_fragments: form.reward_fragments,
					is_onboarding: form.is_onboarding,
					expected_output: form.expected_output.trim() || null,
					test_cases: parsed.value
				};
				await adminApi.createChallenge(body);
				toast.success(i18n.t('admin.challenges.created'));
			}
			showForm = false;
			editing = null;
			await loadChallenges();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			submitting = false;
		}
	}

	const statusColors: Record<string, 'warning' | 'success' | 'default'> = {
		draft: 'warning',
		published: 'success',
		archived: 'default'
	};

	const filtered = $derived(
		query.trim()
			? challenges.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
			: challenges
	);

	onMount(loadChallenges);

	const inputCls =
		'w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none';
	const textareaCls =
		'w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-y';
	const labelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted';
</script>

<svelte:head>
	<title>{i18n.t('admin.challenges.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{i18n.t('admin.challenges.title')}</h1>
			<p class="text-text-muted">{total} {i18n.t('admin.challenges.total')}</p>
		</div>
		<div class="flex items-center gap-3">
			<input
				bind:value={query}
				placeholder={i18n.t('admin.challenges.searchPlaceholder')}
				class="{inputCls} sm:w-72"
			/>
			<Button variant="accent" onclick={openCreate}>
				<Plus size={14} strokeWidth={2} />
				{i18n.t('admin.challenges.newChallenge')}
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex flex-col gap-3">
			{#each Array(5) as _}<Skeleton class="h-16 w-full" rounded="xl" />{/each}
		</div>
	{:else if filtered.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center text-text-muted">
			{i18n.t('admin.challenges.empty')}
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each filtered as ch (ch.id)}
				<div class="flex items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-4">
					<div class="min-w-0 flex-1">
						<div class="mb-1 flex items-center gap-2 flex-wrap">
							<span class="font-medium truncate">{ch.title}</span>
							<Badge variant={statusColors[ch.status] ?? 'default'}>{ch.status}</Badge>
							<Badge variant="default">{ch.skill_domain}</Badge>
							<span class="text-xs text-text-muted">{i18n.t('admin.challenges.difficulty')} {ch.difficulty}/5</span>
						</div>
						<p class="text-xs text-text-muted line-clamp-1">{ch.description}</p>
					</div>
					<div class="flex gap-2 shrink-0">
						<Button variant="ghost" size="sm" onclick={() => openEdit(ch)}>
							<Pencil size={14} strokeWidth={2} />
							{i18n.t('admin.challenges.editBtn')}
						</Button>
						{#if ch.status === 'draft'}
							<Button variant="primary" size="sm" onclick={() => publish(ch.id)}>
								{i18n.t('admin.challenges.publishBtn')}
							</Button>
						{/if}
						{#if ch.status === 'published'}
							<Button variant="ghost" size="sm" onclick={() => archive(ch.id)}>
								{i18n.t('admin.challenges.archiveBtn')}
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Modal
	open={showForm}
	size="xl"
	title={editing ? i18n.t('admin.challenges.editTitle') : i18n.t('admin.challenges.createTitle')}
	onclose={() => { showForm = false; editing = null; }}
>
	<form onsubmit={submit} class="space-y-4">
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="sm:col-span-2">
				<label for="c-title" class={labelCls}>{i18n.t('admin.challenges.challengeTitle')} *</label>
				<input id="c-title" bind:value={form.title} required maxlength="200" class={inputCls} />
			</div>
			<div class="sm:col-span-2">
				<label for="c-desc" class={labelCls}>{i18n.t('admin.challenges.description')} *</label>
				<textarea id="c-desc" bind:value={form.description} required rows="2" class={textareaCls}></textarea>
			</div>
			<div class="sm:col-span-2">
				<label for="c-instr" class={labelCls}>{i18n.t('admin.challenges.instructions')} *</label>
				<textarea id="c-instr" bind:value={form.instructions} required rows="5" class={textareaCls}></textarea>
			</div>
			<div>
				<label for="c-domain" class={labelCls}>{i18n.t('admin.challenges.skillDomain')} *</label>
				<Select
					items={[
						{ value: 'code', label: 'Code' },
						{ value: 'design', label: 'Design' },
						{ value: 'game', label: 'Game' },
						{ value: 'security', label: 'Security' }
					]}
					bind:value={form.skill_domain}
					class="w-full"
				/>
			</div>
			<div>
				<label for="c-diff" class={labelCls}>{i18n.t('admin.challenges.difficulty')} *</label>
				<Select
					items={[
						{ value: 1, label: '1 — ★' },
						{ value: 2, label: '2 — ★★' },
						{ value: 3, label: '3 — ★★★' },
						{ value: 4, label: '4 — ★★★★' },
						{ value: 5, label: '5 — ★★★★★' }
					]}
					bind:value={form.difficulty}
					class="w-full"
				/>
			</div>
			<div>
				<label for="c-mode" class={labelCls}>{i18n.t('admin.challenges.mode')}</label>
				<Select
					items={[
						{ value: 'solo', label: i18n.t('admin.challenges.modeSolo') },
						{ value: 'team', label: i18n.t('admin.challenges.modeTeam') }
					]}
					bind:value={form.mode}
					class="w-full"
				/>
			</div>
			<div>
				<label for="c-tone" class={labelCls}>{i18n.t('admin.challenges.tone')}</label>
				<Select
					items={[
						{ value: 'serious', label: i18n.t('admin.challenges.toneSerious') },
						{ value: 'fun', label: i18n.t('admin.challenges.toneFun') },
						{ value: 'educational', label: i18n.t('admin.challenges.toneEducational') }
					]}
					bind:value={form.tone}
					class="w-full"
				/>
			</div>
			<div>
				<label for="c-dur" class={labelCls}>{i18n.t('admin.challenges.durationMinutes')}</label>
				<input id="c-dur" type="number" bind:value={form.duration_minutes} min="0" class={inputCls} />
			</div>
			<div>
				<label for="c-lang" class={labelCls}>{i18n.t('admin.challenges.language')}</label>
				<input id="c-lang" bind:value={form.language} placeholder="fr, en, es…" class="{inputCls} lowercase" />
			</div>
			<div>
				<label for="c-prereq" class={labelCls}>{i18n.t('admin.challenges.prereqFragments')}</label>
				<input id="c-prereq" type="number" bind:value={form.prerequisite_fragments} min="0" class={inputCls} />
			</div>
			<div>
				<label for="c-rew" class={labelCls}>{i18n.t('admin.challenges.rewardFragments')}</label>
				<input id="c-rew" type="number" bind:value={form.reward_fragments} min="0" class={inputCls} />
			</div>

			<div class="sm:col-span-2">
				<p class={labelCls}>{i18n.t('admin.challenges.expectedOutput')}</p>
				<textarea bind:value={form.expected_output} rows="3" class={textareaCls}></textarea>
			</div>
			<div class="sm:col-span-2">
				<p class={labelCls}>{i18n.t('admin.challenges.testCases')}</p>
				<textarea
					bind:value={form.test_cases}
					rows="6"
					placeholder={'{"inputs": [], "expected": []}'}
					class="{textareaCls} font-mono text-xs"
				></textarea>
				<p class="mt-1 text-xs text-text-muted">{i18n.t('admin.challenges.testCasesHint')}</p>
			</div>

			<label class="flex items-center gap-2 rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm cursor-pointer">
				<input type="checkbox" bind:checked={form.ai_allowed} class="accent-primary" />
				{i18n.t('admin.challenges.aiAllowed')}
			</label>
			{#if !editing}
				<label class="flex items-center gap-2 rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm cursor-pointer">
					<input type="checkbox" bind:checked={form.is_onboarding} class="accent-primary" />
					{i18n.t('admin.challenges.isOnboarding')}
				</label>
			{/if}
		</div>

		<div class="flex justify-end gap-2 pt-2 border-t border-border">
			<Button variant="ghost" onclick={() => { showForm = false; editing = null; }}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant="accent" loading={submitting}>
				{editing ? i18n.t('admin.common.save') : i18n.t('admin.common.create')}
			</Button>
		</div>
	</form>
</Modal>
