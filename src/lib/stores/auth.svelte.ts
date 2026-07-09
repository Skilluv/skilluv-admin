import type { UserPrivate, LoginMethod } from '$lib/types';
import { api } from '$lib/api/client';

class AuthState {
	user = $state<UserPrivate | null>(null);
	/**
	 * How the current session was authenticated. Surfaced by every login /
	 * refresh / /auth/me response so the enterprise layout guard can decide
	 * whether to skip the mandatory-TOTP redirect: `sso` and `webauthn` are
	 * strong-factor methods that already satisfy the 2FA bar, everything else
	 * still needs a TOTP setup for enterprise/recruiter accounts.
	 */
	loginMethod = $state<LoginMethod | null>(null);
	/** True when the user has at least one WebAuthn credential. Combined with
	 * `user.totp_enabled` to decide whether the enterprise 2FA gate is
	 * satisfied — either strong factor is enough. */
	hasPasskey = $state(false);
	loading = $state(true);

	get isAuthenticated(): boolean {
		return this.user !== null;
	}

	get isProfileActive(): boolean {
		return this.user?.profile_active ?? false;
	}

	get displayName(): string {
		return this.user?.display_name ?? '';
	}

	get title(): string {
		return this.user?.title ?? 'apprenti';
	}

	/** True when the current session was minted with a factor that already
	 * satisfies the mandatory-TOTP bar (SSO's external IdP or a WebAuthn
	 * passkey). */
	get isStrongFactorSession(): boolean {
		return this.loginMethod === 'sso' || this.loginMethod === 'webauthn';
	}

	/** True when the enterprise 2FA requirement is satisfied by either an
	 * armed TOTP secret or at least one enrolled passkey. */
	get hasStrongFactorEnrolled(): boolean {
		return (this.user?.totp_enabled ?? false) || this.hasPasskey;
	}

	setUser(user: UserPrivate | null, loginMethod: LoginMethod | null = null) {
		this.user = user;
		if (loginMethod !== null) this.loginMethod = loginMethod;
		this.loading = false;
	}

	/** Initialise l'état auth côté client via /auth/me */
	async init() {
		this.loading = true;
		try {
			const res = await api.get<{
				data: { user: UserPrivate; login_method?: LoginMethod; has_passkey?: boolean };
			}>('/auth/me');
			this.user = res.data.user;
			this.loginMethod = res.data.login_method ?? null;
			this.hasPasskey = res.data.has_passkey ?? false;
		} catch {
			this.user = null;
			this.loginMethod = null;
			this.hasPasskey = false;
		} finally {
			this.loading = false;
		}
	}

	async logout() {
		try {
			await api.post('/auth/logout');
		} finally {
			this.user = null;
			this.loginMethod = null;
			this.hasPasskey = false;
		}
	}

	clear() {
		this.user = null;
		this.loginMethod = null;
		this.hasPasskey = false;
		this.loading = false;
	}
}

export const auth = new AuthState();
