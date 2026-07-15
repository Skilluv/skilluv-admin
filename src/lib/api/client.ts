import type { ApiErrorBody } from '$lib/types';
import { toast } from '$lib/stores/toast.svelte';
import { i18n } from '$lib/i18n';

/**
 * Erreur API Skilluv typée
 */
export class SkilluError extends Error {
	code: string;
	status: number;
	details?: unknown;
	requestId?: string;
	/** Present on AUTH_SSO_REQUIRED — the enterprise SSO start URL the user
	 * must be redirected to. Extracted from the top-level of the error
	 * payload (not from `details`). */
	startUrl?: string;

	constructor(
		code: string,
		message: string,
		status: number,
		details?: unknown,
		requestId?: string,
		startUrl?: string
	) {
		super(message);
		this.name = 'SkilluError';
		this.code = code;
		this.status = status;
		this.details = details;
		this.requestId = requestId;
		this.startUrl = startUrl;
	}
}

/**
 * Crée un client API typé.
 *
 * - Client-side : createApiClient() → utilise /api (proxy Vite/Caddy)
 * - Server-side (SSR) : createApiClient(fetch, 'http://localhost:3001/api')
 */
/**
 * Single in-flight refresh promise: parallel 401s all await the same refresh call,
 * then retry their original request. Retry is disabled for the refresh endpoint itself.
 */
let inflightRefresh: Promise<boolean> | null = null;

async function tryRefresh(customFetch: typeof fetch, baseUrl: string): Promise<boolean> {
	if (!inflightRefresh) {
		inflightRefresh = (async () => {
			try {
				const res = await customFetch(`${baseUrl}/auth/refresh`, {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' }
				});
				return res.ok;
			} catch {
				return false;
			} finally {
				// Release after tick so the awaiting requests all see the same result.
				queueMicrotask(() => { inflightRefresh = null; });
			}
		})();
	}
	return inflightRefresh;
}

/**
 * Read a cookie by name from `document.cookie`. Returns undefined on SSR or when absent.
 * Used to grab the non-httpOnly `csrf_token` cookie and echo it back in the header.
 */
function readCookie(name: string): string | undefined {
	if (typeof document === 'undefined') return undefined;
	const prefix = `${name}=`;
	for (const part of document.cookie.split(';')) {
		const s = part.trim();
		if (s.startsWith(prefix)) return decodeURIComponent(s.slice(prefix.length));
	}
	return undefined;
}

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createApiClient(
	customFetch: typeof fetch = fetch,
	baseUrl: string = '/api'
) {
	async function fire(url: string, options?: RequestInit): Promise<Response> {
		// Double-submit CSRF: echo the non-httpOnly `csrf_token` cookie into the header on
		// state-changing requests. The backend middleware (when enabled) checks that the header
		// matches the cookie in constant time.
		const method = (options?.method ?? 'GET').toUpperCase();
		const csrfHeaders: Record<string, string> = {};
		if (!CSRF_SAFE_METHODS.has(method)) {
			// Admin app uses `admin_csrf_token`; public app uses `csrf_token`.
			// Read admin-first, fall back to the public name so shared code
			// works on either origin without branching.
			const csrf = readCookie('admin_csrf_token') ?? readCookie('csrf_token');
			if (csrf) csrfHeaders['X-CSRF-Token'] = csrf;
		}
		// Skip our JSON default when the body is FormData — the browser needs to
		// set `multipart/form-data; boundary=...` itself, and any explicit
		// Content-Type here would clobber the auto-generated boundary.
		const isMultipart = typeof FormData !== 'undefined' && options?.body instanceof FormData;
		const baseHeaders: Record<string, string> = isMultipart
			? {}
			: { 'Content-Type': 'application/json' };
		return customFetch(url, {
			...options,
			credentials: 'include',
			headers: {
				...baseHeaders,
				...csrfHeaders,
				...options?.headers
			}
		});
	}

	async function request<T>(path: string, options?: RequestInit): Promise<T> {
		const url = `${baseUrl}${path}`;
		const isAuthEndpoint = path.startsWith('/auth/refresh') || path.startsWith('/auth/login');

		let res = await fire(url, options);

		// On 401, try to silently refresh once, then retry the original call.
		// We skip retry on refresh/login themselves so we never loop.
		if (res.status === 401 && !isAuthEndpoint) {
			const refreshed = await tryRefresh(customFetch, baseUrl);
			if (refreshed) {
				res = await fire(url, options);
			}
		}

		if (!res.ok) {
			let errorBody: ApiErrorBody | null = null;
			try {
				errorBody = await res.json();
			} catch {
				// Réponse non-JSON
			}

			// Global auth-gate handlers — the enterprise layout guard tries to
			// redirect proactively based on `auth.user.*_enabled`, but if the
			// user hits an API endpoint before the effect fires (or the store
			// is stale), the backend will refuse with these specific codes.
			// Handling them here guarantees the user is routed to the fix-up
			// page instead of eating an opaque 403 in a data widget.
			//
			// CRITICAL: we NEVER redirect when the user is already on the
			// target page. The onboarding wizard itself pre-fetches the
			// enterprise profile to pre-fill the form — that fetch returns
			// AUTH_TOTP_SETUP_REQUIRED, and redirecting to onboarding again
			// with the current URL as `next=` would build an unbounded chain
			// of `?next=…?next=…?next=…` on every request.
			const code = errorBody?.error?.code;
			if (typeof window !== 'undefined') {
				const currentPath = window.location.pathname;
				const next = encodeURIComponent(currentPath + window.location.search);
				const isEnterpriseContext =
					currentPath.startsWith('/enterprise/') || currentPath === '/enterprise';
				const alreadyOnOnboarding = currentPath.startsWith('/enterprise/onboarding');
				const alreadyOnSecurity =
					currentPath.startsWith('/enterprise/settings/security') ||
					currentPath.startsWith('/settings/security');
				const alreadyOnVerify = currentPath.startsWith('/auth/verify-email');
				const alreadyOnSetup2fa = currentPath.startsWith('/auth/setup-2fa');

				if (code === 'AUTH_ADMIN_2FA_SETUP_REQUIRED') {
					if (!alreadyOnSetup2fa) {
						window.location.replace(`/auth/setup-2fa?next=${next}`);
					}
				} else if (code === 'AUTH_ADMIN_ORIGIN_REQUIRED') {
					// Erreur de config déploiement : montre un message clair, pas de
					// redirect (on est déjà sur une origine refusée, redirect
					// bouclerait).
					toast.error(i18n.t('errors.adminOriginRequired'));
				} else if (code === 'AUTH_TOTP_SETUP_REQUIRED') {
					// Enterprise users go through the onboarding wizard (offers
					// both TOTP and Passkey). Candidates keep the direct route
					// to the security page.
					if (isEnterpriseContext) {
						if (!alreadyOnOnboarding && !alreadyOnSecurity) {
							window.location.replace(`/enterprise/onboarding?next=${next}`);
						}
					} else if (!alreadyOnSecurity) {
						window.location.replace(
							`/settings/security?setup_totp=required&next=${next}`
						);
					}
				} else if (code === 'AUTH_EMAIL_VERIFY_REQUIRED') {
					if (!alreadyOnVerify) {
						window.location.replace(`/auth/verify-email?next=${next}`);
					}
				} else if (code === 'AUTH_SSO_REQUIRED' && errorBody?.error?.start_url) {
					window.location.href = errorBody.error.start_url;
				}
			}

			throw new SkilluError(
				errorBody?.error?.code ?? 'UNKNOWN_ERROR',
				errorBody?.error?.message ?? `Erreur HTTP ${res.status}`,
				res.status,
				errorBody?.error?.details,
				errorBody?.meta?.request_id,
				errorBody?.error?.start_url
			);
		}

		// 204 No Content
		if (res.status === 204) return undefined as T;

		return res.json();
	}

	return {
		get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
			let url = path;
			if (params) {
				const searchParams = new URLSearchParams();
				for (const [key, value] of Object.entries(params)) {
					if (value !== undefined) searchParams.set(key, String(value));
				}
				const qs = searchParams.toString();
				if (qs) url += `?${qs}`;
			}
			return request<T>(url);
		},

		post<T>(path: string, body?: unknown): Promise<T> {
			return request<T>(path, {
				method: 'POST',
				body: body ? JSON.stringify(body) : undefined
			});
		},

		put<T>(path: string, body?: unknown): Promise<T> {
			return request<T>(path, {
				method: 'PUT',
				body: body ? JSON.stringify(body) : undefined
			});
		},

		patch<T>(path: string, body?: unknown): Promise<T> {
			return request<T>(path, {
				method: 'PATCH',
				body: body ? JSON.stringify(body) : undefined
			});
		},

		delete<T>(path: string, body?: unknown): Promise<T> {
			return request<T>(path, {
				method: 'DELETE',
				body: body ? JSON.stringify(body) : undefined
			});
		},

		/** Upload multipart (avatar, etc.) */
		upload<T>(path: string, formData: FormData): Promise<T> {
			return request<T>(path, {
				method: 'POST',
				body: formData,
				headers: {} // pas de Content-Type, le navigateur le gère
			});
		}
	};
}

/** Client API par défaut (client-side, utilise le proxy /api) */
export const api = createApiClient();
