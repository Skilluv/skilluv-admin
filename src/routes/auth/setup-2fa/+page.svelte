<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { page } from '$app/state';
	import { authApi } from '$api/auth';
	import { SkilluError } from '$api/client';
	import { auth } from '$stores/auth.svelte';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import {
		formatBackupCodesForDownload,
		isValidTotpCode,
		normalizeTotpCode
	} from '$lib/auth/totp';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import { ShieldAlert, Copy, Download, KeyRound } from '@lucide/svelte';

	type Step = 'scan' | 'verify' | 'backup';

	let step = $state<Step>('scan');
	let starting = $state(true);
	let submitting = $state(false);
	let error = $state('');

	let otpauthUrl = $state('');
	let secretBase32 = $state('');
	let qrDataUrl = $state('');

	let code = $state('');
	let touched = $state(false);

	let backupCodes = $state<string[]>([]);
	let acknowledged = $state(false);

	const next = $derived(page.url.searchParams.get('next') ?? '/');

	let codeError = $derived.by(() => {
		if (!touched) return null;
		if (!isValidTotpCode(code)) return i18n.t('auth.setup2fa.codeInvalidFormat');
		return null;
	});
	let canVerify = $derived(isValidTotpCode(code) && !submitting);

	onMount(async () => {
		try {
			const res = await authApi.totpSetup();
			otpauthUrl = res.data.otpauth_url;
			secretBase32 = res.data.secret_base32;
			qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
				margin: 1,
				width: 240,
				color: { dark: '#0a0a0a', light: '#ffffff' }
			});
		} catch (err) {
			error = err instanceof SkilluError && err.message
				? err.message
				: i18n.t('auth.setup2fa.errorGeneric');
		} finally {
			starting = false;
		}
	});

	function onCodeInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		code = normalizeTotpCode(target.value);
		target.value = code;
		touched = true;
	}

	async function enable() {
		touched = true;
		if (!canVerify) return;
		submitting = true;
		error = '';
		try {
			const res = await authApi.totpEnable(code);
			backupCodes = res.data.backup_codes;
			if (auth.user) auth.user.totp_enabled = true;
			step = 'backup';
		} catch (err) {
			error = err instanceof SkilluError && err.message
				? err.message
				: i18n.t('auth.setup2fa.errorGeneric');
		}
		submitting = false;
	}

	async function copyBackupCodes() {
		try {
			await navigator.clipboard.writeText(backupCodes.join('\n'));
			toast.success(i18n.t('auth.setup2fa.copiedToast'));
		} catch {
			toast.error(i18n.t('auth.setup2fa.errorGeneric'));
		}
	}

	function downloadBackupCodes() {
		const blob = new Blob([formatBackupCodesForDownload(backupCodes)], {
			type: 'text/plain;charset=utf-8'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'skilluv-admin-backup-codes.txt';
		a.click();
		URL.revokeObjectURL(url);
	}

	function finish() {
		window.location.href = next;
	}
</script>

<svelte:head>
	<title>{i18n.t('auth.setup2fa.title')} — Admin Skilluv</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 py-12">
	<div class="w-full max-w-lg">
		<div class="mb-8 flex flex-col items-center gap-3 text-center">
			<KeyRound size={32} strokeWidth={2} class="text-accent" />
			<h1 class="text-3xl font-black tracking-tight">{i18n.t('auth.setup2fa.title')}</h1>
			<p class="text-sm text-text-muted">{i18n.t('auth.setup2fa.subtitle')}</p>
		</div>

		<div class="mb-6 flex items-center justify-between gap-2 text-xs uppercase tracking-widest text-text-muted">
			<span class="{step === 'scan' ? 'text-accent' : ''}">1. {i18n.t('auth.setup2fa.stepScan')}</span>
			<span class="h-px flex-1 bg-border"></span>
			<span class="{step === 'verify' ? 'text-accent' : ''}">2. {i18n.t('auth.setup2fa.stepVerify')}</span>
			<span class="h-px flex-1 bg-border"></span>
			<span class="{step === 'backup' ? 'text-accent' : ''}">3. {i18n.t('auth.setup2fa.stepBackup')}</span>
		</div>

		<div class="rounded-2xl border border-border bg-surface-elevated p-6">
			{#if error}
				<div class="mb-4 flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
					<ShieldAlert size={16} strokeWidth={2} class="mt-0.5 shrink-0" />
					<span>{error}</span>
				</div>
			{/if}

			{#if step === 'scan'}
				<h2 class="mb-2 text-lg font-semibold">{i18n.t('auth.setup2fa.scanTitle')}</h2>
				<p class="mb-4 text-sm text-text-muted">{i18n.t('auth.setup2fa.scanHint')}</p>

				{#if starting}
					<p class="py-8 text-center text-sm text-text-muted">{i18n.t('auth.setup2fa.starting')}</p>
				{:else if qrDataUrl}
					<div class="flex flex-col items-center gap-4">
						<img src={qrDataUrl} alt="TOTP QR" class="rounded-xl border border-border bg-white p-2" width="240" height="240" />
						<div class="w-full">
							<p class="mb-1 block text-sm font-medium">{i18n.t('auth.setup2fa.manualLabel')}</p>
							<code class="block break-all rounded-xl border border-border bg-surface-overlay px-4 py-3 text-xs font-mono text-text-primary">{secretBase32}</code>
							<p class="mt-1 text-xs text-text-muted">{i18n.t('auth.setup2fa.manualHint')}</p>
						</div>
						<Button variant="primary" size="md" onclick={() => (step = 'verify')} class="w-full">
							{i18n.t('auth.setup2fa.continueBtn')}
						</Button>
					</div>
				{/if}
			{:else if step === 'verify'}
				<h2 class="mb-2 text-lg font-semibold">{i18n.t('auth.setup2fa.verifyTitle')}</h2>
				<p class="mb-4 text-sm text-text-muted">{i18n.t('auth.setup2fa.verifyHint')}</p>

				<Input
					label={i18n.t('auth.setup2fa.codeLabel')}
					placeholder={i18n.t('auth.setup2fa.codePlaceholder')}
					value={code}
					oninput={onCodeInput}
					inputmode="numeric"
					autocomplete="one-time-code"
					error={codeError ?? undefined}
					data-testid="setup-2fa-code"
				/>

				<div class="mt-4 flex gap-3">
					<Button variant="secondary" size="md" onclick={() => (step = 'scan')} disabled={submitting}>
						{i18n.t('common.actions.back')}
					</Button>
					<Button
						variant="accent"
						size="md"
						onclick={enable}
						disabled={!canVerify}
						loading={submitting}
						class="flex-1"
						data-testid="setup-2fa-enable"
					>
						{i18n.t('auth.setup2fa.enableBtn')}
					</Button>
				</div>
			{:else if step === 'backup'}
				<h2 class="mb-2 text-lg font-semibold">{i18n.t('auth.setup2fa.backupTitle')}</h2>
				<p class="mb-3 text-sm text-text-muted">{i18n.t('auth.setup2fa.backupHint')}</p>
				<p class="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
					{i18n.t('auth.setup2fa.backupWarning')}
				</p>

				<div class="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-overlay p-4 font-mono text-sm">
					{#each backupCodes as bc}
						<div class="rounded bg-surface-elevated px-2 py-1 text-center text-text-primary">{bc}</div>
					{/each}
				</div>

				<div class="mb-4 flex gap-3">
					<Button variant="secondary" size="sm" onclick={copyBackupCodes}>
						<Copy size={14} strokeWidth={2} />
						{i18n.t('auth.setup2fa.copyBtn')}
					</Button>
					<Button variant="secondary" size="sm" onclick={downloadBackupCodes}>
						<Download size={14} strokeWidth={2} />
						{i18n.t('auth.setup2fa.downloadBtn')}
					</Button>
				</div>

				<label class="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-overlay px-4 py-3">
					<input
						type="checkbox"
						bind:checked={acknowledged}
						class="mt-0.5 h-4 w-4 accent-accent"
						data-testid="setup-2fa-acknowledge"
					/>
					<span class="text-sm text-text-primary">{i18n.t('auth.setup2fa.acknowledgeLabel')}</span>
				</label>

				<Button
					variant="accent"
					size="lg"
					onclick={finish}
					disabled={!acknowledged}
					class="w-full"
					data-testid="setup-2fa-finish"
				>
					{i18n.t('auth.setup2fa.finishBtn')}
				</Button>
			{/if}
		</div>
	</div>
</div>
