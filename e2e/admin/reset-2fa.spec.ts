import { test, expect } from '@playwright/test';
import { withDb, seedUser } from '../setup/db';

// Phase 2 — admin can wipe another user's 2FA.
//
// Backend rules:
//   - POST /admin/users/{id}/reset-2fa requires reason ≥ 8 chars
//   - Rate limited (admin_destructive: 10/min, 100/hr)
//   - Wipes totp_secret, totp_enabled, and webauthn credentials
//
// UI is currently blocked (see qa/BUGS_BACK.md — GET /admin/users/{id} doesn't
// return totp_enabled, so the button stays disabled). This spec covers:
//   1. The disabled-button UI state (regression guard for BUGS_BACK P1)
//   2. The backend endpoint end-to-end via a browser fetch (proves the wipe
//      works so downstream UI fix is safe to ship)

async function read2faState(userId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT totp_enabled, totp_secret FROM users WHERE id = $1',
			[userId]
		);
		return {
			totp_enabled: rows[0]?.totp_enabled as boolean,
			totp_secret: rows[0]?.totp_secret as Buffer | null
		};
	});
}

test('UI regression guard: reset-2fa button is disabled because /admin/users/{id} omits totp_enabled', async ({ page }) => {
	const victim = await seedUser({ prefix: 'victim2fa', totpEnabled: true });
	await page.goto(`/users/${victim.id}`);
	await expect(page.getByRole('heading', { name: victim.display_name })).toBeVisible({ timeout: 10_000 });

	const resetBtn = page.getByRole('button', { name: /réinitialiser.*2fa|reset.*2fa/i });
	await resetBtn.scrollIntoViewIfNeeded();
	await expect(resetBtn).toBeVisible();
	// FLIP THIS when BUGS_BACK P1 lands (`/admin/users/{id}` returns totp_enabled)
	// — at that point rewrite this spec to click through the reset dialog.
	await expect(resetBtn, 'button is disabled because totp_enabled is not returned by the API').toBeDisabled();
});

test('API: POST /admin/users/{id}/reset-2fa wipes TOTP end-to-end', async ({ page }) => {
	const victim = await seedUser({ prefix: 'victim2fa', totpEnabled: true });
	const before = await read2faState(victim.id);
	expect(before.totp_enabled, 'pre-reset').toBe(true);
	expect(before.totp_secret, 'pre-reset').not.toBeNull();

	// Land on any admin page so the browser fetch inherits admin cookies + origin.
	await page.goto('/');
	const status = await page.evaluate(async ({ id, reason }) => {
		const r = await fetch(`/api/admin/users/${id}/reset-2fa`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reason })
		});
		return r.status;
	}, { id: victim.id, reason: 'E2E — user lost their authenticator device' });

	expect(status, 'reset-2fa POST').toBeLessThan(300);
	const after = await read2faState(victim.id);
	expect(after.totp_enabled, 'post-reset totp_enabled').toBe(false);
	expect(after.totp_secret, 'post-reset totp_secret should be null').toBeNull();
});
