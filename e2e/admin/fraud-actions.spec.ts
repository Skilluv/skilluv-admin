import { test, expect } from '@playwright/test';
import pg from 'pg';

// Phase 2 — fraud queue: mark-valid + revoke a flagged deliverable via the UI.
// Backend `list_flagged` returns deliverables with plagiarism_score >= 0.9.

const PG_URL = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

async function seedFlaggedDeliverable() {
	const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows: userRows } = await client.query(
			`INSERT INTO users (email, username, password_hash, first_name, last_name, display_name, skill_domain)
			 VALUES ($1, $2, 'noop', 'F', 'L', $3, 'code') RETURNING id`,
			[`fraud-${uniq}@x.test`, `fraud${uniq}`.slice(0, 30), `Fraud User ${uniq}`]
		);
		const { rows } = await client.query(
			`INSERT INTO deliverables
			   (user_id, artifact_type, artifact_url, verifiable_by, plagiarism_score)
			 VALUES ($1, 'code', 'https://e2e.test/artifact', 'ai', 0.95)
			 RETURNING id`,
			[userRows[0].id]
		);
		return { deliverableId: rows[0].id as string };
	} finally {
		await client.end();
	}
}

async function readDeliverable(id: string) {
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows } = await client.query(
			'SELECT plagiarism_score, verification_status FROM deliverables WHERE id = $1',
			[id]
		);
		return rows[0] as { plagiarism_score: string | null; verification_status: string } | undefined;
	} finally {
		await client.end();
	}
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
