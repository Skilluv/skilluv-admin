import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// Phase 2 — admin can revoke an active SSO session.
// The list endpoint filters on `login_method='sso' AND revoked_at IS NULL`.

const PG_URL = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

async function seedSsoSession() {
	const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows: userRows } = await client.query(
			`INSERT INTO users (email, username, password_hash, first_name, last_name, display_name, skill_domain)
			 VALUES ($1, $2, 'noop', 'Sso', 'User', $3, 'code') RETURNING id`,
			[`sso-${uniq}@x.test`, `sso${uniq}`.slice(0, 30), `Sso ${uniq}`]
		);
		// refresh_hash is BYTEA — any 32 random bytes work for a seed row.
		const refreshHash = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');
		const { rows } = await client.query(
			`INSERT INTO user_sessions (user_id, refresh_hash, login_method)
			 VALUES ($1, $2, 'sso') RETURNING id`,
			[userRows[0].id, refreshHash]
		);
		return {
			sessionId: rows[0].id as string,
			userId: userRows[0].id as string,
			username: `sso${uniq}`.slice(0, 30)
		};
	} finally {
		await client.end();
	}
}

async function readSessionRevokedAt(sessionId: string): Promise<Date | null> {
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows } = await client.query('SELECT revoked_at FROM user_sessions WHERE id = $1', [sessionId]);
		return (rows[0]?.revoked_at as Date | null) ?? null;
	} finally {
		await client.end();
	}
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
