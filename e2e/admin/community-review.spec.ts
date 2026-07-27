import { test, expect } from '@playwright/test';
import pg from 'pg';

// Phase 2 — community-submitted challenges: approve + reject via the UI, DB confirms.

const PG_URL = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

async function seedCommunityChallenge() {
	const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const title = `E2E Community Challenge ${uniq}`;
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows: creatorRows } = await client.query(
			`INSERT INTO users (email, username, password_hash, first_name, last_name, display_name, skill_domain)
			 VALUES ($1, $2, 'noop', 'F', 'L', $3, 'code') RETURNING id`,
			[`creator-${uniq}@x.test`, `creator${uniq}`.slice(0, 30), `Creator ${uniq}`]
		);
		// `is_training=TRUE` — required so the approve handler's implicit
		// `status='published'` UPDATE doesn't violate the DB check constraint
		// `challenge_templates_project_or_training` (see BUGS_BACK).
		const { rows } = await client.query(
			`INSERT INTO challenge_templates
			   (title, description, instructions, skill_domain, difficulty, created_by,
			    is_community, community_status, is_training, title_i18n)
			 VALUES ($1, 'E2E description', 'E2E instructions', 'code', 3, $2,
			         TRUE, 'review', TRUE, $3::jsonb)
			 RETURNING id`,
			[title, creatorRows[0].id, JSON.stringify({ fr: title })]
		);
		return { challengeId: rows[0].id as string, title };
	} finally {
		await client.end();
	}
}

async function readChallenge(challengeId: string) {
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows } = await client.query(
			'SELECT status, community_status FROM challenge_templates WHERE id = $1',
			[challengeId]
		);
		return rows[0] as { status: string; community_status: string | null } | undefined;
	} finally {
		await client.end();
	}
}

async function landOnReviewPage(page: import('@playwright/test').Page, challengeTitle: string) {
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/community/review') && r.request().method() === 'GET'
	);
	await page.goto('/community');
	await initialLoad;
	const titleH3 = page.getByRole('heading', { name: challengeTitle });
	await expect(titleH3).toBeVisible({ timeout: 10_000 });
	return titleH3.locator('xpath=ancestor::div[contains(@class,"rounded-2xl") and contains(@class,"border-border")][1]');
}

test('admin can approve a community challenge under review', async ({ page }) => {
	const { challengeId, title } = await seedCommunityChallenge();
	const card = await landOnReviewPage(page, title);

	const approveReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/community/${challengeId}/approve`) && r.request().method() === 'POST'
	);
	await card.getByRole('button', { name: /^approuver$|^approve$/i }).click();
	expect((await approveReq).status(), 'approve POST').toBeLessThan(300);
	const state = await readChallenge(challengeId);
	expect(state?.community_status, 'community_status after approve').toBe('approved');
});

test('admin can reject a community challenge with feedback', async ({ page }) => {
	const { challengeId, title } = await seedCommunityChallenge();
	const card = await landOnReviewPage(page, title);

	await card.getByRole('button', { name: /rejeter|reject/i }).click();
	// Feedback validation — same ConfirmDangerousDialog pattern as ban.
	await page.getByTestId('confirm-dangerous-reason').fill('E2E — challenge non aligné avec les guidelines');

	const rejectReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/community/${challengeId}/reject`) && r.request().method() === 'POST'
	);
	await page.getByTestId('confirm-dangerous-action').click();
	expect((await rejectReq).status(), 'reject POST').toBeLessThan(300);
	const state = await readChallenge(challengeId);
	expect(state?.community_status, 'community_status after reject').toBe('rejected');
});
