import { test, expect } from '@playwright/test';
import { withDb, seedUser } from '../setup/db';

// Phase 2 — fraud queue: mark-valid + revoke a flagged deliverable via the UI.
// Backend `list_flagged` returns deliverables with plagiarism_score >= 0.9.

async function seedFlaggedDeliverable() {
	const user = await seedUser({ prefix: 'fraud' });
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO deliverables
			   (user_id, artifact_type, artifact_url, verifiable_by, plagiarism_score)
			 VALUES ($1, 'code', 'https://e2e.test/artifact', 'ai', 0.95)
			 RETURNING id`,
			[user.id]
		);
		return { deliverableId: rows[0].id as string };
	});
}

async function readDeliverable(id: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT plagiarism_score, verification_status FROM deliverables WHERE id = $1',
			[id]
		);
		return rows[0] as { plagiarism_score: string | null; verification_status: string } | undefined;
	});
}

async function landOnFraudTab(page: import('@playwright/test').Page, deliverableId: string) {
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/fraud/queue') && r.request().method() === 'GET'
	);
	await page.goto('/fraud');
	await initialLoad;
	// Deliverable id shows in the plagiarism table's first column.
	const cell = page.getByText(deliverableId, { exact: false });
	await expect(cell).toBeVisible({ timeout: 10_000 });
	return cell.locator('xpath=ancestor::tr[1]');
}

test('admin can mark a flagged deliverable as valid', async ({ page }) => {
	const { deliverableId } = await seedFlaggedDeliverable();
	const row = await landOnFraudTab(page, deliverableId);

	const req = page.waitForResponse(
		(r) => r.url().includes(`/admin/fraud/deliverables/${deliverableId}/mark-valid`) && r.request().method() === 'POST'
	);
	await row.getByRole('button', { name: /marquer valide|mark valid/i }).click();
	expect((await req).status(), 'mark-valid POST').toBeLessThan(300);
	const state = await readDeliverable(deliverableId);
	expect(state?.plagiarism_score, 'score cleared').toBeNull();
});

test('admin can revoke a flagged deliverable via the danger dialog', async ({ page }) => {
	const { deliverableId } = await seedFlaggedDeliverable();
	const row = await landOnFraudTab(page, deliverableId);

	await row.getByRole('button', { name: /^révoquer$|^revoke$/i }).click();
	await page.getByTestId('confirm-dangerous-reason').fill('E2E — proven plagiarism, revoke deliverable');

	const req = page.waitForResponse(
		(r) => r.url().includes(`/admin/fraud/deliverables/${deliverableId}/revoke`) && r.request().method() === 'POST'
	);
	await page.getByTestId('confirm-dangerous-action').click();
	expect((await req).status(), 'revoke POST').toBeLessThan(300);
	const state = await readDeliverable(deliverableId);
	expect(state?.verification_status, 'verification_status after revoke').toBe('revoked');
});
