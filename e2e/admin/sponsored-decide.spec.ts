import { test, expect } from '@playwright/test';
import { withDb, uniq, seedUser } from '../setup/db';

// Phase 2 — sponsored challenge requests: decide (approve/reject) via UI.

async function seedSponsoredRequest() {
	const id = uniq();
	const owner = await seedUser({ prefix: 'spowner', role: 'enterprise' });
	return withDb(async (client) => {
		const { rows: entRows } = await client.query(
			`INSERT INTO enterprises (owner_id, company_name, slug, company_size)
			 VALUES ($1, $2, $3, '11-50') RETURNING id`,
			[owner.id, `Sponsor Co ${id}`, `sponsor-${id}`.slice(0, 60)]
		);
		const proposedTitle = `E2E Sponsored ${id}`;
		const { rows } = await client.query(
			`INSERT INTO sponsored_challenge_requests
			   (enterprise_id, requested_by_user_id, proposed_title, brief,
			    skill_domain, difficulty, duration_days, budget_eur_cents)
			 VALUES ($1, $2, $3, 'E2E brief', 'code', 3, 14, 500000)
			 RETURNING id`,
			[entRows[0].id, owner.id, proposedTitle]
		);
		return { requestId: rows[0].id as string, proposedTitle };
	});
}

async function readRequestStatus(requestId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT status FROM sponsored_challenge_requests WHERE id = $1',
			[requestId]
		);
		return rows[0]?.status as string | undefined;
	});
}

async function landOnPage(page: import('@playwright/test').Page, proposedTitle: string) {
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/sponsored-challenges') && r.request().method() === 'GET'
	);
	await page.goto('/sponsored-challenges');
	await initialLoad;
	const heading = page.getByText(proposedTitle, { exact: false });
	await expect(heading).toBeVisible({ timeout: 10_000 });
	return heading.locator(
		'xpath=ancestor::div[contains(@class,"rounded-2xl") and contains(@class,"border-border")][1]'
	);
}

async function decide(
	page: import('@playwright/test').Page,
	requestId: string,
	expectedStatus: string
) {
	const decideReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/sponsored-challenges/${requestId}/decide`) && r.request().method() === 'POST'
	);
	// The modal has a Select whose trigger button collides with the submit
	// button label. Submit the form via the native path (form.requestSubmit)
	// to bypass label disambiguation entirely.
	await page.getByRole('dialog').locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
	expect((await decideReq).status(), 'decide POST').toBeLessThan(300);
	expect(await readRequestStatus(requestId), 'DB status').toBe(expectedStatus);
}

test('admin can approve a pending sponsored request', async ({ page }) => {
	const { requestId, proposedTitle } = await seedSponsoredRequest();
	const card = await landOnPage(page, proposedTitle);
	await card.getByRole('button', { name: /^approuver$|^approve$/i }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await decide(page, requestId, 'approved');
});

test('admin can reject a pending sponsored request', async ({ page }) => {
	const { requestId, proposedTitle } = await seedSponsoredRequest();
	const card = await landOnPage(page, proposedTitle);
	await card.getByRole('button', { name: /^rejeter$|^reject$/i }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await decide(page, requestId, 'rejected');
});
