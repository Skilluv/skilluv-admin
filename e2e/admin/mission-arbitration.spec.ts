import { test, expect } from '@playwright/test';
import {
	anyMissionType,
	cleanupEnterprise,
	cleanupMission,
	cleanupUser,
	readMissionArbitration,
	seedEnterprise,
	seedMission,
	seedMissionDelivery,
	seedUser
} from '../setup/db';

// SKI-162 (cyber M-10) and SKI-249 (design M-08) — the one decision an
// admin takes on a mission.
//
// Both tickets ask for their own page. There is one, and this spec is the
// reason it is enough: the fixture is a design mission, the same screen with
// `?domain=security` is the cyber one, and the arbitration path is
// identical because the backend has one mechanism keyed by skill_domain.

test('an arbiter ends a mission neither side will close', async ({ page }) => {
	const owner = await seedUser({ prefix: 'missown', role: 'enterprise' });
	const talent = await seedUser({ prefix: 'misstal' });
	const enterprise = await seedEnterprise(owner.id);
	const type = await anyMissionType('design');
	expect(type, 'design mission types are seeded by migration 0192').toBeTruthy();

	const mission = await seedMission({
		enterpriseId: enterprise.id,
		missionTypeId: type!.id,
		skillDomain: 'design',
		assignedUserId: talent.id,
		status: 'delivered'
	});
	// Forty days without an answer. Well past the twenty-one-day default,
	// which is what turns a slow mission into a stuck one.
	await seedMissionDelivery({
		missionId: mission.id,
		deliveredBy: talent.id,
		daysAgo: 40
	});

	try {
		// The board, narrowed the way the design ticket asks for.
		const boardLoad = page.waitForResponse(
			(r) => r.url().includes('/api/admin/missions') && r.request().method() === 'GET'
		);
		await page.goto('/missions?domain=design&stuck=1');
		const board = await boardLoad;
		expect(board.status(), 'board GET').toBeLessThan(300);
		expect(board.url(), 'the domain filter reached the backend').toContain(
			'skill_domain=design'
		);
		expect(board.url(), 'the stuck filter reached the backend').toContain('stuck_only=true');

		await expect(page.getByText(mission.title, { exact: false })).toBeVisible({
			timeout: 10_000
		});

		const detailLoad = page.waitForResponse(
			(r) =>
				r.url().includes(`/api/admin/missions/${mission.slug}`) &&
				r.request().method() === 'GET'
		);
		await page.getByText(mission.title, { exact: false }).first().click();
		expect((await detailLoad).status(), 'detail GET').toBeLessThan(300);

		await page.getByRole('button', { name: /arbitr/i }).first().click();

		// Eighty characters is the floor, and the form refuses before the
		// round trip — so the button stays disabled until this is typed.
		const reason = 'The delivery matches the acceptance criteria and the client has not answered in six weeks.';
		await page.locator('#arbitration-reason').fill(reason);

		const decide = page.waitForResponse(
			(r) => r.url().endsWith('/arbitrate') && r.request().method() === 'POST'
		);
		await page.getByRole('button', { name: /^décider$|^decide$|^قرِّر$/i }).click();
		expect((await decide).status(), 'arbitrate POST').toBeLessThan(300);

		const written = await readMissionArbitration(mission.id);
		expect(written?.outcome, 'the decision was recorded as taken, not agreed').toBe(
			'accepted'
		);
		expect(written?.reason_md).toContain('acceptance criteria');
	} finally {
		await cleanupMission(mission.id);
		await cleanupEnterprise(enterprise.id);
		await cleanupUser(talent.id);
		await cleanupUser(owner.id);
	}
});
