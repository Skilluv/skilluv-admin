import type { UserPrivate, SkillDomain } from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

// --- Types requêtes/réponses auth ---

export interface RegisterRequest {
	email: string;
	username: string;
	password: string;
	first_name: string;
	last_name: string;
	skill_domain: SkillDomain;
	country?: string;
	city?: string;
	/** Required — backend refuses signup without explicit CGU/Privacy acknowledgement. */
	terms_accepted: boolean;
}

export interface LoginRequest {
	identifier: string;
	password: string;
	totp_code?: string;
	email_2fa_code?: string;
	/** One-time TOTP backup code, alternative to a live totp_code. */
	backup_code?: string;
}

interface AuthResponse {
	data: {
		user: UserPrivate;
		csrf_token?: string;
		message?: string;
	};
}

interface LoginResponse {
	data: {
		user?: UserPrivate;
		csrf_token?: string;
		requires_email_2fa?: boolean;
		user_id?: string;
		/** Backend flags this on login when the authenticated user has role
		 * enterprise/recruiter but `totp_enabled=false`. The front should route
		 * to /settings/security before letting them into /enterprise/*. */
		requires_totp_setup?: boolean;
		/** How this session was authenticated. Read by the enterprise layout
		 * guard to decide whether to skip the mandatory-TOTP redirect
		 * (sso / webauthn bypass, everything else must set up TOTP). */
		login_method?: import('$lib/types').LoginMethod;
		/** True when the user has at least one WebAuthn credential enrolled.
		 * Hydrated into `auth.hasPasskey` on the client so the enterprise 2FA
		 * gate accepts the strong factor without waiting for the next
		 * /auth/me round-trip. */
		has_passkey?: boolean;
	};
}

interface MeResponse {
	data: {
		user: UserPrivate;
		rank: { global: number; domain: number };
	};
}

interface MessageResponse {
	data: { message: string };
}

interface TotpSetupResponse {
	data: {
		otpauth_url: string;
		secret_base32: string;
		message: string;
	};
}

interface TotpEnableResponse {
	data: {
		message: string;
		backup_codes: string[];
		backup_codes_note?: string;
	};
}

interface BackupCodesResponse {
	data: {
		backup_codes: string[];
		message: string;
	};
}

export interface SessionRow {
	id: string;
	user_id: string;
	ip: string | null;
	user_agent: string | null;
	device_label: string | null;
	created_at: string;
	last_used_at: string;
}

interface SessionsResponse {
	data: {
		sessions: SessionRow[];
		current_session_id: string | null;
	};
}

// --- Fonctions API ---

export const authApi = {
	register(data: RegisterRequest) {
		return api.post<AuthResponse>('/auth/register', data);
	},

	login(data: LoginRequest) {
		return api.post<LoginResponse>('/auth/login', data);
	},

	verifyEmail2fa(code: string, userId?: string) {
		// Same envelope shape as /auth/login — the backend echoes `has_passkey`
		// so the client can hydrate `auth.hasPasskey` and close the race
		// window on the enterprise 2FA gate.
		return api.post<LoginResponse>('/auth/email-2fa/verify', { code, user_id: userId });
	},

	/** Refresh token is read server-side from the httpOnly `refresh_token` cookie — no body needed. */
	refresh() {
		return api.post<{ data: { ok: boolean; csrf_token?: string } }>('/auth/refresh');
	},

	verifyEmail(token: string) {
		return api.get<MessageResponse>(`/auth/verify-email?token=${token}`);
	},

	forgotPassword(email: string) {
		return api.post<MessageResponse>('/auth/forgot-password', { email });
	},

	resetPassword(token: string, newPassword: string) {
		return api.post<MessageResponse>('/auth/reset-password', { token, new_password: newPassword });
	},

	me() {
		return api.get<MeResponse>('/auth/me');
	},

	logout() {
		return api.post<MessageResponse>('/auth/logout');
	},

	changePassword(currentPassword: string, newPassword: string) {
		return api.post<MessageResponse>('/auth/change-password', {
			current_password: currentPassword,
			new_password: newPassword
		});
	},

	resendVerification() {
		return api.post<MessageResponse>('/auth/resend-verification');
	},

	totpSetup() {
		return api.post<TotpSetupResponse>('/auth/totp/setup');
	},

	totpEnable(code: string) {
		return api.post<TotpEnableResponse>('/auth/totp/enable', { code });
	},

	totpRegenerateBackupCodes(code: string) {
		return api.post<BackupCodesResponse>('/auth/totp/backup-codes/regenerate', { code });
	},

	totpDisable(code: string) {
		return api.post<MessageResponse>('/auth/totp/disable', { code });
	},

	enableEmail2fa() {
		return api.post<MessageResponse>('/auth/email-2fa/enable');
	},

	disableEmail2fa(currentPassword: string) {
		// Backend reuses ChangePasswordRequest for the body — new_password is required for parsing
		// but ignored by the handler. Send a filler that still satisfies the min-length check.
		return api.post<MessageResponse>('/auth/email-2fa/disable', {
			current_password: currentPassword,
			new_password: currentPassword
		});
	},

	deleteAccount(password: string, totpCode?: string) {
		return api.delete<MessageResponse>('/auth/account', { password, totp_code: totpCode });
	},

	// ─── Sessions / devices ─────────────────────────────────────────
	listSessions() {
		return api.get<SessionsResponse>('/auth/sessions');
	},

	revokeSession(sessionId: string) {
		return api.delete<MessageResponse>(`/auth/sessions/${sessionId}`);
	},

	revokeAllOtherSessions() {
		return api.post<MessageResponse>('/auth/sessions/revoke-all');
	},

	// ─── Change email (double confirmation) ────────────────────────
	requestEmailChange(currentPassword: string, newEmail: string) {
		return api.post<MessageResponse>('/auth/change-email', {
			current_password: currentPassword,
			new_email: newEmail
		});
	},

	// ─── Onboarding (Pattern C) ────────────────────────────────────
	completeProfile(payload: {
		skill_domain: SkillDomain;
		terms_accepted: boolean;
		country?: string;
		city?: string;
	}) {
		return api.post<MessageResponse>('/auth/complete-profile', payload);
	}
};
