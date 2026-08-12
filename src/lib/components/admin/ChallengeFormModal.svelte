<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import { i18n } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import type {
		Challenge,
		ChallengeDifficulty,
		ChallengeMode,
		ChallengeTone,
		SkillDomain
	} from '$types';
	import type { ChallengeCreateBody, ChallengePatchBody } from '$api/admin';

	interface Props {
		open: boolean;
		/** null = create mode; otherwise edit-mode with the challenge to pre-fill. */
		editing: Challenge | null;
		submitting?: boolean;
		onclose: () => void;
		/** Payload is the full body — parent picks create vs patch based on `editing`. */
		onsubmit: (body: ChallengeCreateBody | ChallengePatchBody) => void | Promise<void>;
	}

	let { open, editing, submitting = false, onclose, onsubmit }: Props = $props();

	const inputCls =
		'w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none';
	const textareaCls =
		'w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-y';
	const labelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted';

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

	$effect(() => {
		if (!open) return;
		if (editing) {
			form.title = editing.title;
			form.description = editing.description;
			form.instructions = editing.instructions;
			form.skill_domain = editing.skill_domain;
			form.difficulty = editing.difficulty;
			form.mode = editing.mode;
			form.duration_minutes = editing.duration_minutes ?? 0;
			form.ai_allowed = editing.ai_allowed;
			form.tone = editing.tone;
			form.language = editing.language ?? '';
			form.prerequisite_fragments = editing.prerequisite_fragments;
			form.reward_fragments = editing.reward_fragments;
			form.is_onboarding = editing.is_onboarding ?? false;
			form.expected_output = editing.expected_output ?? '';
			form.test_cases = editing.test_cases ? JSON.stringify(editing.test_cases, null, 2) : '';
		} else {
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
	});

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
		const shared = {
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
		const body: ChallengeCreateBody | ChallengePatchBody = editing
			? shared
			: { ...shared, is_onboarding: form.is_onboarding };
		await onsubmit(body);
	}
</script>

<Modal
	{open}
	size="xl"
	title={editing ? i18n.t('admin.challenges.editTitle') : i18n.t('admin.challenges.createTitle')}
	{onclose}
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
			<Button variant="ghost" onclick={onclose}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant="accent" loading={submitting}>
				{editing ? i18n.t('admin.common.save') : i18n.t('admin.common.create')}
			</Button>
		</div>
	</form>
</Modal>
