import { test, expect } from '@playwright/test';
import pg from 'pg';

// Phase 2 — challenge admin lifecycle: seeded challenge → publish via UI →
// archive via UI. Backend enforces "hard rule #1" (challenges published must be
// is_training=TRUE or have project_id); we set is_training when seeding so the
// publish button doesn't 400.

const PG_URL = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

async function seedDraftChallenge(page: import('@playwright/test').Page) {
	const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const title = `E2E Challenge ${uniq}`;
	const created = await page.evaluate(async ({ title }) => {
		const r = await fetch('/api/admin/challenges', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title,
				description: 'Seeded by e2e/admin/challenge-lifecycle.spec.ts',
				instructions: 'Complete the E2E lifecycle test.',
				skill_domain: 'code',
				difficulty: 3,
				is_training: true
			})
		});
		if (!r.ok) throw new Error(`create failed: ${r.status} ${await r.text()}`);
		return (await r.json()).data.challenge as { id: string; title: string };
	}, { title });
	return created;
}

async function readStatus(challengeId: string) {
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows } = await client.query('SELECT status FROM challenge_templates WHERE id = $1', [challengeId]);
		return rows[0]?.status as string | undefined;
	} finally {
		await client.end();
	}
}

test('admin can publish then archive a draft challenge via the UI', async ({ page }) => {
	// Land on /challenges first so we're in the admin session context for the fetch.
	await page.goto('/challenges');
	await page.waitForResponse(
		(r) => r.url().includes('/api/admin/challenges') && r.request().method() === 'GET'
	);

	const challenge = await seedDraftChallenge(page);
	expect(await readStatus(challenge.id), 'seeded challenge starts as draft').toBe('draft');

	// Reload so the freshly-seeded challenge shows up in the list.
	const listAfterSeed = page.waitForResponse(
		(r) => r.url().includes('/api/admin/challenges') && r.request().method() === 'GET'
	);
	await page.reload();
	await listAfterSeed;

	// Anchor the row by the challenge title span, then walk up to the outer card.
	const titleSpan = page.locator('span').filter({ hasText: challenge.title }).first();
	await expect(titleSpan).toBeVisible({ timeout: 10_000 });
	const row = titleSpan.locator('xpath=ancestor::div[contains(@class,"rounded-2xl") and contains(@class,"border-border")][1]');

	// ─── Publish ─────────────────────────────────────────────────────
	const publishReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/challenges/${challenge.id}/publish`) && r.request().method() === 'POST'
	);
	await row.getByRole('button', { name: /publier|publish/i }).click();
	expect((await publishReq).status(), 'publish POST').toBeLessThan(300);
	expect(await readStatus(challenge.id), 'DB status after publish').toBe('published');

	// ─── Archive ─────────────────────────────────────────────────────
	const archiveReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/challenges/${challenge.id}/archive`) && r.request().method() === 'POST'
	);
	await row.getByRole('button', { name: /archiver|archive/i }).click();
	expect((await archiveReq).status(), 'archive POST').toBeLessThan(300);
	expect(await readStatus(challenge.id), 'DB status after archive').toBe('archived');
});
