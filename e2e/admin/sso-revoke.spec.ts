import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { withDb, seedUser } from '../setup/db';

// Phase 2 — admin can revoke an active SSO session.
// The list endpoint filters on `login_method='sso' AND revoked_at IS NULL`.

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

test('UI regression guard: SSO sessions list stays empty because of response shape mismatch', async ({ page }) => {
	// Ensure at least one active SSO session exists in DB.
	await seedSsoSession();

	await page.goto('/sso-sessions');
	await page.waitForResponse(
		(r) => r.url().includes('/api/admin/sso/sessions') && r.request().method() === 'GET'
	);
	// The list should have rows once the backend fix ships (BUGS_BACK P1 — the
	// response nests `{data:{sessions:[…]}}` instead of `{data:[…]}`). Until
	// then, no <tr> in <tbody> is rendered — assert the broken state so we get
	// notified via a test failure the day the back ships the fix.
	await expect(page.locator('tbody tr'), 'expected: 0 rows today (list broken); flip to > 0 after backend fix').toHaveCount(0);
});

test('API: POST /admin/sso/sessions/{id}/revoke sets revoked_at', async ({ page }) => {
	const { sessionId } = await seedSsoSession();
	expect(await readSessionRevokedAt(sessionId), 'pre-revoke').toBeNull();

	// Land on an admin page for cookies + origin, then fire the revoke fetch
	// directly (bypasses the broken list UI).
	await page.goto('/');
	const status = await page.evaluate(async ({ id, reason }) => {
		const r = await fetch(`/api/admin/sso/sessions/${id}/revoke`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reason })
		});
		return r.status;
	}, { id: sessionId, reason: 'E2E — session compromise drill' });
	expect(status, 'revoke POST').toBeLessThan(300);
	expect(await readSessionRevokedAt(sessionId), 'revoked_at set').not.toBeNull();
});
