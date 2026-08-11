import { test, expect } from '@playwright/test';
import { withDb, seedUser, seedProject, seedSlice } from '../setup/db';

// Phase 2 — fraud queue: mark-valid + revoke a flagged deliverable via the UI.
// Backend `list_flagged` returns deliverables with plagiarism_score >= 0.9.

async function seedFlaggedDeliverable() {
	const user = await seedUser({ prefix: 'fraud' });
	// La contrainte `deliverables_at_least_one_parent` impose un rattachement à
	// une slice ou à un challenge : un livrable orphelin n'existe pas en base.
	// On ancre donc sur un projet + une slice jetables, nettoyés ensuite.
	const project = await seedProject({ ownerId: user.id, slugPrefix: 'e2e-fraud' });
	const slice = await seedSlice({ projectId: project.id, status: 'validated' });
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO deliverables
			   (user_id, slice_id, artifact_type, artifact_url, verifiable_by, plagiarism_score)
			 -- verifiable_by n'accepte plus 'ai' : les valeurs sont
			 -- github_webhook / human_review / automated_diff / third_party_api / ci_status.
			 VALUES ($1, $2, 'pr_merged', 'https://e2e.test/artifact', 'human_review', 0.95)
			 RETURNING id`,
			[user.id, slice.id]
		);
		return { deliverableId: rows[0].id as string, projectId: project.id, userId: user.id };
	});
}

async function readDeliverable(id: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			// Le backend pose `revoked_at` + `revocation_reason` ; il ne touche pas
			// `verification_status`. Le spec assérait donc un effet inexistant.
			'SELECT plagiarism_score, verification_status, revoked_at FROM deliverables WHERE id = $1',
			[id]
		);
		return rows[0] as
			| { plagiarism_score: string | null; verification_status: string; revoked_at: Date | null }
			| undefined;
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
	expect(state?.revoked_at, 'revoked_at posé après révocation').not.toBeNull();
});
