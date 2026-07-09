import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { UserPrivate } from '$lib/types';

// Admin app has a single hard rule: only role='admin' can enter. Anything
// else — anonymous visitors, candidates, recruiters, enterprise owners —
// bounces to the login page. This is enforced server-side so the admin
// bundle never even starts hydrating for someone without the role.
//
// Phase 3 (backend cookie separation) will land a distinct
// `admin_access_token` cookie so a session on the public frontend can't
// double as an admin session by accident. Until that ships we read the
// standard `access_token` cookie — the role check inside `/auth/me`
// remains authoritative, so cross-app sharing is functionally safe, just
// not architecturally isolated.

const PUBLIC_PREFIXES = ['/auth/', '/api/'];

export const handle: Handle = async ({ event, resolve }) => {
	const accessToken =
		event.cookies.get('admin_access_token') ?? event.cookies.get('access_token');
	const apiUrl = env.API_URL ?? 'http://localhost:3001/api';

	let user: UserPrivate | null = null;
	if (accessToken) {
		try {
			const response = await fetch(`${apiUrl}/auth/me`, {
				headers: { Cookie: `access_token=${accessToken}` }
			});
			if (response.ok) {
				const body = (await response.json()) as { data: { user: UserPrivate } };
				user = body.data.user;
			}
		} catch {
			user = null;
		}
	}

	event.locals.user = user;

	const pathname = event.url.pathname;
	const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

	if (!isPublic) {
		if (!user) {
			throw redirect(303, `/auth/login?redirect=${encodeURIComponent(pathname + event.url.search)}`);
		}
		if (user.role !== 'admin') {
			// Non-admin authenticated user — nuke them to login rather than
			// giving them a Forbidden page that reveals the admin surface.
			throw redirect(303, '/auth/login?error=not_admin');
		}
	}

	return resolve(event);
};
