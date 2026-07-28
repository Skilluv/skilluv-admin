import { test, expect } from '@playwright/test';
import { withDb, uniq, seedUser } from '../setup/db';

// Phase 2 — enterprise KYC review: approve + reject via UI, DB confirms.
// The queue only shows enterprises with kyc.status='pending'.

async function seedPendingKyc() {
	const id = uniq();
	const owner = await seedUser({ prefix: 'kyc', role: 'enterprise' });
	const companyName = `KYC Co ${id}`;
	return withDb(async (client) => {
		const { rows: entRows } = await client.query(
			`INSERT INTO enterprises (owner_id, company_name, slug, company_size)
			 VALUES ($1, $2, $3, '11-50') RETURNING id`,
			[owner.id, companyName, `kyc-${id}`.slice(0, 60)]
		);
		await client.query(
			`INSERT INTO enterprise_kyc (enterprise_id, status) VALUES ($1, 'pending')`,
			[entRows[0].id]
		);
		return { enterpriseId: entRows[0].id as string, companyName };
	});
}

async function readKycStatus(enterpriseId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT status, level, rejection_reason FROM enterprise_kyc WHERE enterprise_id = $1',
			[enterpriseId]
		);
		return rows[0] as { status: string; level: string; rejection_reason: string | null } | undefined;
	});
}

async function landOnQueue(page: import('@playwright/test').Page, companyName: string) {
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/enterprise-kyc') && r.request().method() === 'GET'
	);
	await page.goto('/enterprise-kyc');
	await initialLoad;
	const heading = page.getByRole('heading', { name: companyName });
	await expect(heading).toBeVisible({ timeout: 10_000 });
	return heading.locator(
		'xpath=ancestor::div[contains(@class,"rounded-2xl") and contains(@class,"border-border")][1]'
	);
}

test('admin can approve a pending KYC review', async ({ page }) => {
	const { enterpriseId, companyName } = await seedPendingKyc();
	const card = await landOnQueue(page, companyName);

	const decideReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/enterprise-kyc/${enterpriseId}/decide`) && r.request().method() === 'POST'
	);
	await card.getByRole('button', { name: /^approuver$|^approve$/i }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	// The modal has a Select (level) whose trigger button label collides with
	// the submit button — submit via form.requestSubmit to bypass.
	await page.getByRole('dialog').locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
	expect((await decideReq).status(), 'decide POST').toBeLessThan(300);
	const state = await readKycStatus(enterpriseId);
	expect(state?.status, 'DB status').toBe('approved');
	expect(state?.level, 'DB level defaulted to basic').toBe('basic');
});

test('admin can reject a pending KYC review with a reason', async ({ page }) => {
	const { enterpriseId, companyName } = await seedPendingKyc();
	const card = await landOnQueue(page, companyName);
	await card.getByRole('button', { name: /^rejeter$|^reject$/i }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	// Reject requires a reason (front-side toast if empty). Fill the textarea.
	await dialog.locator('textarea').fill('E2E — documents non conformes');

	const decideReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/enterprise-kyc/${enterpriseId}/decide`) && r.request().method() === 'POST'
	);
	await dialog.locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
	expect((await decideReq).status(), 'decide POST').toBeLessThan(300);
	const state = await readKycStatus(enterpriseId);
	expect(state?.status, 'DB status').toBe('rejected');
	expect(state?.rejection_reason, 'rejection reason persisted').toContain('E2E');
});
