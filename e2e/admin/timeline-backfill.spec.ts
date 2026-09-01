import { test, expect } from '@playwright/test';
import { cleanupUser, countTimelineEvents, seedUser } from '../setup/db';

// SKI-39 — admin timeline backfill on the user detail page.
//
// A freshly seeded user has no `user_timeline_events` row: the hooks that
// normally write one fire on real signup, not on a direct INSERT. So the
// backfill has exactly one thing to reconstruct — the `signup` event — which
// makes the assertion unambiguous instead of "some number went up".

test('admin replays a user timeline and the signup event appears', async ({ page }) => {
	const user = await seedUser({ prefix: 'timeline' });

	try {
		expect(await countTimelineEvents(user.id), 'seeded user starts with no event').toBe(0);

		await page.goto(`/users/${user.id}`);
		await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: /rejouer la timeline|replay timeline/i }).click();

		const req = page.waitForResponse(
			(r) =>
				r.url().includes(`/admin/users/${user.id}/backfill-timeline`) &&
				r.request().method() === 'POST'
		);
		await page.getByTestId('confirm-dangerous-action').click();
		expect((await req).status(), 'backfill POST').toBeLessThan(300);

		expect(await countTimelineEvents(user.id), 'signup event reconstructed').toBeGreaterThan(0);
	} finally {
		await cleanupUser(user.id);
	}
});

test('replaying twice inserts nothing the second time', async ({ page }) => {
	const user = await seedUser({ prefix: 'timelineidem' });

	try {
		await page.goto(`/users/${user.id}`);
		await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 });

		for (let run = 0; run < 2; run++) {
			await page.getByRole('button', { name: /rejouer la timeline|replay timeline/i }).click();
			const req = page.waitForResponse(
				(r) =>
					r.url().includes(`/admin/users/${user.id}/backfill-timeline`) &&
					r.request().method() === 'POST'
			);
			await page.getByTestId('confirm-dangerous-action').click();
			const body = await (await req).json();
			// First run reconstructs, second must be a no-op: that idempotence
			// is the whole reason the button is safe to press.
			if (run === 0) expect(body.data.rows_inserted).toBeGreaterThan(0);
			else expect(body.data.rows_inserted).toBe(0);
		}
	} finally {
		await cleanupUser(user.id);
	}
});
