<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { auth } from '$stores/auth.svelte';
	import { authApi } from '$api/auth';
	import { SkilluError } from '$api/client';
	import { i18n } from '$lib/i18n';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import { ShieldAlert } from '@lucide/svelte';

	// Standalone admin login. Same POST /auth/login endpoint as the public
	// frontend — the backend enforces role='admin' before letting us in,
	// and this component surfaces a clear error if a non-admin tries.

	let identifier = $state('');
	let password = $state('');
	let totpCode = $state('');
	let requiresTotp = $state(false);
	let loading = $state(false);
	let error = $state('');

	const redirect = $derived(page.url.searchParams.get('redirect') ?? '/');
	const preError = $derived(page.url.searchParams.get('error') ?? '');

	onMount(() => {
		if (preError === 'not_admin') {
			error =
				i18n.locale === 'fr'
					? "Ce compte n'a pas les droits admin."
					: 'This account does not have admin privileges.';
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;
		try {
			const res = await authApi.login({
				identifier: identifier.trim(),
				password,
				totp_code: requiresTotp ? totpCode : undefined
			});
			if (res.data.user) {
				if (res.data.user.role !== 'admin') {
					error =
						i18n.locale === 'fr'
							? "Ce compte n'a pas les droits admin."
							: 'This account does not have admin privileges.';
					return;
				}
				auth.setUser(res.data.user, res.data.login_method ?? 'password');
				auth.hasPasskey = res.data.has_passkey ?? false;
				window.location.href = redirect;
			}
		} catch (err) {
			if (err instanceof SkilluError) {
				if (err.code === 'AUTH_TOTP_REQUIRED') {
					requiresTotp = true;
					error = '';
				} else {
					error = err.message;
				}
			} else {
				error = i18n.locale === 'fr' ? 'Erreur inattendue.' : 'Unexpected error.';
			}
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{i18n.locale === 'fr' ? 'Admin — Connexion' : 'Admin sign in'}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 py-12">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex flex-col items-center gap-3">
			<img src="/favicon.svg" alt="" class="h-10 w-10" />
			<h1 class="text-3xl font-black tracking-tight">
				Skilluv <span class="text-accent">Admin</span>
			</h1>
			<p class="text-xs uppercase tracking-widest text-text-muted">
				{i18n.locale === 'fr' ? 'Panneau de contrôle' : 'Control panel'}
			</p>
		</div>

		<form onsubmit={submit} class="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-6">
			{#if error}
				<div class="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
					<ShieldAlert size={16} strokeWidth={2} class="mt-0.5 shrink-0" />
					<span>{error}</span>
				</div>
			{/if}
			<Input
				label={i18n.locale === 'fr' ? 'Email ou pseudo' : 'Email or username'}
				bind:value={identifier}
				required
				autocomplete="username"
			/>
			<Input
				type="password"
				label={i18n.locale === 'fr' ? 'Mot de passe' : 'Password'}
				bind:value={password}
				required
				autocomplete="current-password"
			/>
			{#if requiresTotp}
				<Input
					label={i18n.locale === 'fr' ? 'Code TOTP' : 'TOTP code'}
					bind:value={totpCode}
					required
					autocomplete="one-time-code"
					placeholder="123456"
				/>
			{/if}
			<Button variant="accent" size="lg" type="submit" loading={loading}>
				{i18n.locale === 'fr' ? 'Se connecter' : 'Sign in'}
			</Button>
		</form>

		<p class="mt-6 text-center text-xs text-text-muted">
			{i18n.locale === 'fr'
				? 'Cet accès est réservé aux administrateurs Skilluv.'
				: 'This access is restricted to Skilluv administrators.'}
		</p>
	</div>
</div>
