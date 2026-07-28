import { test, expect } from '@playwright/test';
import { withDb, uniq, seedUser } from '../setup/db';

// Phase 2 — community-submitted challenges: approve + reject via the UI, DB confirms.

async function seedCommunityChallenge() {
	const id = uniq();
	const title = `E2E Community Challenge ${id}`;
	const creator = await seedUser({ prefix: 'creator' });
	return withDb(async (client) => {
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
			[title, creator.id, JSON.stringify({ fr: title })]
		);
		return { challengeId: rows[0].id as string, title };
	});
}

async function readChallenge(challengeId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT status, community_status FROM challenge_templates WHERE id = $1',
			[challengeId]
		);
		return rows[0] as { status: string; community_status: string | null } | undefined;
	});
}

async function landOnReviewPage(page: import('@playwright/test').Page, challengeTitle: string) {
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/community/review') && r.request().method() === 'GET'
	);
	await page.goto('/community');
	await initialLoad;
	const titleH3 = page.getByRole('heading', { name: challengeTitle });
	await expect(titleH3).toBeVisible({ timeout: 10_000 });
	return titleH3.locator(
		'xpath=ancestor::div[contains(@class,"rounded-2xl") and contains(@class,"border-border")][1]'
	);
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
	await page.getByTestId('confirm-dangerous-reason').fill('E2E — challenge non aligné avec les guidelines');

	const rejectReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/community/${challengeId}/reject`) && r.request().method() === 'POST'
	);
	await page.getByTestId('confirm-dangerous-action').click();
	expect((await rejectReq).status(), 'reject POST').toBeLessThan(300);
	const state = await readChallenge(challengeId);
	expect(state?.community_status, 'community_status after reject').toBe('rejected');
});
