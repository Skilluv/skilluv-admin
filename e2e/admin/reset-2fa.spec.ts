import { test, expect } from '@playwright/test';
import { withDb, seedUser } from '../setup/db';

// Phase 2 — admin can wipe another user's 2FA end-to-end via the UI.
//
// Backend rules:
//   - POST /admin/users/{id}/reset-2fa requires reason ≥ 8 chars
//   - Rate limited (admin_destructive: 10/min, 100/hr)
//   - Wipes totp_secret, totp_enabled, and webauthn credentials
//
// The regression guard from the earlier "backend omits totp_enabled" era
// was flipped after Trello xHnNZa5G + gWSCzyz0 + RXEWNI6y landed
// (GET /admin/users/{id} now exposes totp_enabled + email_2fa_enabled +
// webauthn_credentials_count) — this spec now drives the full UI path.

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

test('admin resets 2FA on a user with TOTP enabled via the full UI', async ({ page }) => {
	const victim = await seedUser({ prefix: 'victim2fa', totpEnabled: true });
	const before = await read2faState(victim.id);
	expect(before.totp_enabled, 'pre-reset').toBe(true);
	expect(before.totp_secret, 'pre-reset').not.toBeNull();

	const detailLoad = page.waitForResponse(
		(r) => r.url().includes(`/api/admin/users/${victim.id}`) && r.request().method() === 'GET'
	);
	await page.goto(`/users/${victim.id}`);
	await detailLoad;
	await expect(page.getByRole('heading', { name: victim.display_name })).toBeVisible({ timeout: 10_000 });

	// TOTP badge should render now that the API exposes totp_enabled.
	await expect(page.getByText('TOTP', { exact: true }).first()).toBeVisible();

	const resetBtn = page.getByRole('button', { name: /réinitialiser.*2fa|reset.*2fa/i });
	await resetBtn.scrollIntoViewIfNeeded();
	await expect(resetBtn, 'button enabled — user has TOTP or a passkey').toBeEnabled();

	const resetReq = page.waitForResponse(
		(r) =>
			r.url().includes(`/admin/users/${victim.id}/reset-2fa`) &&
			r.request().method() === 'POST'
	);
	await resetBtn.click();

	// Reason validation — same ConfirmDangerousDialog contract (min 8 chars for BE-B).
	await page.getByTestId('confirm-dangerous-reason').fill('short');
	await expect(page.getByTestId('confirm-dangerous-action')).toBeDisabled();
	await page.getByTestId('confirm-dangerous-reason').fill('E2E — user lost their authenticator device');
	await expect(page.getByTestId('confirm-dangerous-action')).toBeEnabled();

	await page.getByTestId('confirm-dangerous-action').click();
	expect((await resetReq).status(), 'reset-2fa POST').toBeLessThan(300);

	const after = await read2faState(victim.id);
	expect(after.totp_enabled, 'post-reset totp_enabled').toBe(false);
	expect(after.totp_secret, 'post-reset totp_secret should be null').toBeNull();
});

test('reset-2fa button stays disabled for a user with no strong factor', async ({ page }) => {
	// A user with neither TOTP nor a webauthn credential shouldn't offer the
	// reset — the endpoint would 400 anyway. Regression guard for BE-B.
	const victim = await seedUser({ prefix: 'victim-nof', totpEnabled: false });
	await page.goto(`/users/${victim.id}`);
	await expect(page.getByRole('heading', { name: victim.display_name })).toBeVisible({ timeout: 10_000 });

	const resetBtn = page.getByRole('button', { name: /réinitialiser.*2fa|reset.*2fa/i });
	await resetBtn.scrollIntoViewIfNeeded();
	await expect(resetBtn).toBeDisabled();
});
