<script lang="ts">
	import { page } from '$app/state';
	import { authApi } from '$api/auth';
	import { SkilluError } from '$api/client';
	import { auth } from '$stores/auth.svelte';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import { isValidBackupCode, normalizeBackupCode } from '$lib/auth/totp';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import { KeyRound, ShieldAlert } from '@lucide/svelte';

	let identifier = $state('');
	let password = $state('');
	let backupCode = $state('');
	let touchedBackup = $state(false);
	let submitting = $state(false);
	let error = $state('');

	const redirect = $derived(page.url.searchParams.get('redirect') ?? '/');

	let backupError = $derived.by(() => {
		if (!touchedBackup) return null;
		if (!isValidBackupCode(backupCode)) return i18n.t('auth.recovery2fa.backupCodeHint');
		return null;
	});

	let canSubmit = $derived(
		identifier.trim().length > 0 &&
			password.length > 0 &&
			isValidBackupCode(backupCode) &&
			!submitting
	);

	function onBackupInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		backupCode = normalizeBackupCode(target.value);
		target.value = backupCode;
		touchedBackup = true;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		submitting = true;
		error = '';
		try {
			const res = await authApi.login({
				identifier: identifier.trim(),
				password,
				backup_code: backupCode.trim()
			});
			if (res.data.user) {
				if (res.data.user.role !== 'admin') {
					error = i18n.t('errors.forbiddenMessage');
					return;
				}
				auth.setUser(res.data.user, res.data.login_method ?? 'password');
				auth.hasPasskey = res.data.has_passkey ?? false;
				toast.info(i18n.t('auth.recovery2fa.postLoginNotice'));
				window.location.href = redirect;
			}
		} catch (err) {
			if (err instanceof SkilluError && err.message) {
				error = err.message;
			} else {
				error = i18n.t('auth.recovery2fa.errorGeneric');
			}
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('auth.recovery2fa.title')} — Admin Skilluv</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 py-12">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex flex-col items-center gap-3 text-center">
			<KeyRound size={28} strokeWidth={2} class="text-accent" />
			<h1 class="text-2xl font-black tracking-tight">{i18n.t('auth.recovery2fa.title')}</h1>
			<p class="text-sm text-text-muted">{i18n.t('auth.recovery2fa.subtitle')}</p>
		</div>

		<form onsubmit={submit} class="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-6">
			{#if error}
				<div class="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
					<ShieldAlert size={16} strokeWidth={2} class="mt-0.5 shrink-0" />
					<span>{error}</span>
				</div>
			{/if}

			<Input
				label={i18n.t('auth.recovery2fa.identifierLabel')}
				bind:value={identifier}
				required
				autocomplete="username"
			/>
			<Input
				type="password"
				label={i18n.t('auth.recovery2fa.passwordLabel')}
				bind:value={password}
				required
				autocomplete="current-password"
			/>
			<Input
				label={i18n.t('auth.recovery2fa.backupCodeLabel')}
				placeholder="ABCD-EFGH-IJKL-MNOP"
				hint={i18n.t('auth.recovery2fa.backupCodeHint')}
				value={backupCode}
				oninput={onBackupInput}
				required
				autocomplete="one-time-code"
				error={backupError ?? undefined}
				data-testid="recovery-code-input"
			/>

			<Button
				variant="accent"
				size="lg"
				type="submit"
				loading={submitting}
				disabled={!canSubmit}
				data-testid="recovery-submit"
			>
				{submitting ? i18n.t('auth.recovery2fa.submitting') : i18n.t('auth.recovery2fa.submitBtn')}
			</Button>

			<a href="/auth/login" class="text-center text-xs text-text-muted underline-offset-2 hover:text-text-primary hover:underline">
				{i18n.t('auth.recovery2fa.backToLoginLink')}
			</a>
		</form>
	</div>
</div>
