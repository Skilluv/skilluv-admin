import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { withDb, seedUser } from '../setup/db';

// Phase 2 — admin can revoke an active SSO session end-to-end via the UI.
// The list endpoint filters on `login_method='sso' AND revoked_at IS NULL`.
//
// The former regression guard (empty `<tbody>` because the backend nested
// the array in `{data:{sessions:[…]}}`) was flipped after Trello MshrIOYf
// landed — the response now follows the standard `{data: T[], pagination}`
// shape used by every other admin list.

async function seedSsoSession() {
	const user = await seedUser({ prefix: 'sso' });
	// refresh_hash is BYTEA — any random bytes work for a seed row.
	const refreshHash = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO user_sessions (user_id, refresh_hash, login_method)
			 VALUES ($1, $2, 'sso') RETURNING id`,
			[user.id, refreshHash]
		);
		return { sessionId: rows[0].id as string, userId: user.id, username: user.username };
	});
}

async function readSessionRevokedAt(sessionId: string): Promise<Date | null> {
	return withDb(async (client) => {
		const { rows } = await client.query('SELECT revoked_at FROM user_sessions WHERE id = $1', [sessionId]);
		return (rows[0]?.revoked_at as Date | null) ?? null;
	});
}

test('admin revokes an active SSO session via the UI, DB revoked_at flips', async ({ page }) => {
	const { sessionId, username } = await seedSsoSession();
	expect(await readSessionRevokedAt(sessionId), 'pre-revoke').toBeNull();

	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/sso/sessions') && r.request().method() === 'GET'
	);
	await page.goto('/sso-sessions');
	await initialLoad;

	// List must contain at least our seeded row (backend now returns the
	// standard `{data: T[]}` envelope). The row is keyed by the seeded
	// username, unique per test.
	const cell = page.getByText(username, { exact: true });
	await expect(cell).toBeVisible({ timeout: 10_000 });
	const row = cell.locator('xpath=ancestor::tr[1]');

	const revokeReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/sso/sessions/${sessionId}/revoke`) && r.request().method() === 'POST'
	);
	await row.getByRole('button', { name: /révoquer|revoke/i }).click();
	await page.getByTestId('confirm-dangerous-reason').fill('E2E — session compromise drill');
	await page.getByTestId('confirm-dangerous-action').click();

	expect((await revokeReq).status(), 'revoke POST').toBeLessThan(300);
	expect(await readSessionRevokedAt(sessionId), 'revoked_at set').not.toBeNull();
});
