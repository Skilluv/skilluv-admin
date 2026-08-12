import { test, expect } from '@playwright/test';
import { withDb, uniq, seedUser } from '../setup/db';

// Phase 2 — reports moderation: resolve + dismiss via the UI, DB confirms.
// Seed a reporter user + a target user + a pending report per test.

async function seedReport() {
	const id = uniq();
	const reporter = await seedUser({ prefix: 'reporter' });
	const target = await seedUser({ prefix: 'target' });
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
			 VALUES ($1, 'user', $2, 'spam', $3) RETURNING id`,
			[reporter.id, target.id, `E2E test details ${id}`]
		);
		return { reportId: rows[0].id as string, reporterUsername: reporter.username };
	});
}

async function readReportStatus(reportId: string): Promise<string | undefined> {
	return withDb(async (client) => {
		const { rows } = await client.query('SELECT status FROM reports WHERE id = $1', [reportId]);
		return rows[0]?.status as string | undefined;
	});
}

async function clickAction(
	page: import('@playwright/test').Page,
	reportId: string,
	buttonName: RegExp,
	expectedStatus: string
) {
	// Anchor the report card by the report details text (unique per seed).
	const detailsSpan = page.getByText(`E2E test details`).first();
	await expect(detailsSpan).toBeVisible({ timeout: 10_000 });
	const card = detailsSpan.locator(
		'xpath=ancestor::div[contains(@class,"rounded-2xl") and contains(@class,"border-border")][1]'
	);

	const putReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/reports/${reportId}`) && r.request().method() === 'PUT'
	);
	await card.getByRole('button', { name: buttonName }).click();
	expect((await putReq).status(), `PUT status for ${buttonName}`).toBeLessThan(300);
	expect(await readReportStatus(reportId), `DB status after ${buttonName}`).toBe(expectedStatus);
}

test('admin can resolve a pending report via the UI', async ({ page }) => {
	const { reportId } = await seedReport();
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/reports') && r.request().method() === 'GET'
	);
	await page.goto('/reports');
	await initialLoad;
	await clickAction(page, reportId, /résoudre|resolve/i, 'resolved');
});

test('admin can dismiss a pending report via the UI', async ({ page }) => {
	const { reportId } = await seedReport();
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/reports') && r.request().method() === 'GET'
	);
	await page.goto('/reports');
	await initialLoad;
	await clickAction(page, reportId, /rejeter|dismiss/i, 'dismissed');
});
