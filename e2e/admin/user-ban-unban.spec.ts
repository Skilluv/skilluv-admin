import { test, expect } from '@playwright/test';
import { withDb, seedUser } from '../setup/db';

// Phase 2 — moderation critical path: ban then unban a real user via the UI.
// A victim is seeded directly via SQL (bypasses the 5/h auth:register rate
// limit; the user never needs to actually log in for this flow).

async function readIsBanned(userId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query('SELECT is_banned FROM users WHERE id = $1', [userId]);
		return rows[0]?.is_banned as boolean;
	});
}

test('admin can ban then unban a user via the UI, with DB confirming both flips', async ({ page }) => {
	const victim = await seedUser({ prefix: 'victim' });
	expect(await readIsBanned(victim.id), 'pre-ban DB state').toBe(false);

	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/users') && r.request().method() === 'GET'
	);
	await page.goto('/users');
	await initialLoad;

	const searchReq = page.waitForResponse(
		(r) => r.url().includes('/api/admin/users') && r.url().includes('q=') && r.request().method() === 'GET'
	);
	await page.getByPlaceholder(/rechercher|search/i).fill(victim.username);
	await page.getByRole('button', { name: /chercher|search/i }).click();
	await searchReq;

	const link = page.locator(`a[href="/users/${victim.id}"]`);
	await expect(link).toBeVisible({ timeout: 10_000 });
	const row = link.locator('xpath=ancestor::div[contains(@class,"border-b")][1]');

	// ─── Ban ────────────────────────────────────────────────────────
	const banReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/users/${victim.id}/ban`) && r.request().method() === 'POST'
	);
	await row.getByRole('button', { name: /bannir|^ban$/i }).click();

	// Reason validation — the dialog should require a non-trivial reason.
	await page.getByTestId('confirm-dangerous-reason').fill('x');
	await expect(page.getByTestId('confirm-dangerous-action')).toBeDisabled();
	await page.getByTestId('confirm-dangerous-reason').fill('E2E test — moderation smoke');
	await expect(page.getByTestId('confirm-dangerous-action')).toBeEnabled();

	await page.getByTestId('confirm-dangerous-action').click();
	expect((await banReq).status(), 'ban POST should succeed').toBeLessThan(300);
	expect(await readIsBanned(victim.id), 'DB is_banned after ban').toBe(true);
	await expect(row.locator('span').getByText(/banni|banned/i)).toBeVisible({ timeout: 5_000 });

	// ─── Unban (native UI toggle) ──────────────────────────────────
	const unbanReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/users/${victim.id}/unban`) && r.request().method() === 'POST'
	);
	await row.getByRole('button', { name: /débannir|unban/i }).click();
	expect((await unbanReq).status(), 'unban POST should succeed').toBeLessThan(300);
	expect(await readIsBanned(victim.id), 'DB is_banned after unban').toBe(false);
	await expect(row.locator('span').getByText(/banni|banned/i)).toHaveCount(0, { timeout: 5_000 });
	await expect(row.getByRole('button', { name: /bannir|^ban$/i })).toBeVisible();
});
