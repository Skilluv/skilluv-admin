import { test, expect } from '@playwright/test';
import { withDb, uniq, seedUser } from '../setup/db';

// Phase 2 — reports moderation: resolve + dismiss via the UI, DB confirms.
// Seed a reporter user + a target user + a pending report per test.

async function seedReport() {
	const id = uniq();
	// Built once and both stored and returned. Spelling it twice is how the
	// row written and the text looked for drift apart.
	const details = `E2E test details ${id}`;
	const reporter = await seedUser({ prefix: 'reporter' });
	const target = await seedUser({ prefix: 'target' });
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
			 VALUES ($1, 'user', $2, 'spam', $3) RETURNING id`,
			[reporter.id, target.id, details]
		);
		// The details string carries the unique id and is what the test uses
		// to find its own card. Returning it is the point: building it here
		// and matching a shorter prefix in the page is how these two tests
		// used to reach into each other.
		return {
			reportId: rows[0].id as string,
			details,
			reporterUsername: reporter.username
		};
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
	details: string,
	buttonName: RegExp,
	expectedStatus: string
) {
	// Anchor on the full details string, id included.
	//
	// This used to match the bare prefix `E2E test details` and take
	// `.first()`. The suite runs `fullyParallel` on two workers and both
	// tests here seed a pending report, so the queue holds the other test's
	// row as often as not and `.first()` picked it — the click then landed on
	// somebody else's card, the PUT went to an id the predicate did not
	// match, and the test failed until a retry happened to order them kindly.
	// Two flaky tests, and the retry was hiding the reason rather than
	// absorbing a real race.
	const detailsSpan = page.getByText(details, { exact: false }).first();
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
	const { reportId, details } = await seedReport();
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/reports') && r.request().method() === 'GET'
	);
	await page.goto('/reports');
	await initialLoad;
	await clickAction(page, reportId, details, /résoudre|resolve/i, 'resolved');
});

test('admin can dismiss a pending report via the UI', async ({ page }) => {
	const { reportId, details } = await seedReport();
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/reports') && r.request().method() === 'GET'
	);
	await page.goto('/reports');
	await initialLoad;
	await clickAction(page, reportId, details, /rejeter|dismiss/i, 'dismissed');
});
