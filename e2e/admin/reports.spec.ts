import { test, expect } from '@playwright/test';
import pg from 'pg';

// Phase 2 — reports moderation: resolve + dismiss via the UI, DB confirms.
// Seed a reporter user + a target user + a pending report per test.

const PG_URL = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

async function seedReport() {
	const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const insertUser = `INSERT INTO users (email, username, password_hash, first_name, last_name, display_name, skill_domain)
		 VALUES ($1, $2, 'noop', 'F', 'L', $3, 'code') RETURNING id`;
		const { rows: reporterRows } = await client.query(insertUser, [
			`reporter-${uniq}@x.test`,
			`reporter${uniq}`.slice(0, 30),
			`Reporter ${uniq}`
		]);
		const { rows: targetRows } = await client.query(insertUser, [
			`target-${uniq}@x.test`,
			`target${uniq}`.slice(0, 30),
			`Target ${uniq}`
		]);
		const { rows: reportRows } = await client.query(
			`INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
			 VALUES ($1, 'user', $2, 'spam', $3) RETURNING id`,
			[reporterRows[0].id, targetRows[0].id, `E2E test details ${uniq}`]
		);
		return {
			reportId: reportRows[0].id as string,
			reporterUsername: `reporter${uniq}`.slice(0, 30)
		};
	} finally {
		await client.end();
	}
}

async function readReportStatus(reportId: string): Promise<string | undefined> {
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows } = await client.query('SELECT status FROM reports WHERE id = $1', [reportId]);
		return rows[0]?.status as string | undefined;
	} finally {
		await client.end();
	}
}

async function clickAction(page: import('@playwright/test').Page, reportId: string, buttonName: RegExp, expectedStatus: string) {
	// Anchor the report card by the report details text (unique per seed).
	const detailsSpan = page.getByText(`E2E test details`).first();
	await expect(detailsSpan).toBeVisible({ timeout: 10_000 });
	const card = detailsSpan.locator('xpath=ancestor::div[contains(@class,"rounded-2xl") and contains(@class,"border-border")][1]');

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
