import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	cleanupUser,
	findUserIdByEmail,
	grantCapability,
	readExternalSignal,
	seedExternalSignal,
	seedUser
} from '../setup/db';

// SKI-42 — external signal review queue.
//
// The three endpoints behind this screen are gated by a capability, not by
// role='admin', so the fixture grants `community_moderator` to the e2e
// admin first. Without it the page renders the "missing capability" panel
// instead of the queue — which is itself worth asserting, but not here.

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_EMAIL = JSON.parse(
	readFileSync(resolve(HERE, '..', 'setup', 'admin-credentials.json'), 'utf8')
).email as string;

test.beforeAll(async () => {
	const adminId = await findUserIdByEmail(ADMIN_EMAIL);
	expect(adminId, 'bootstrapped e2e admin must exist').toBeTruthy();
	await grantCapability(adminId!, 'community_moderator');
});

async function landOnQueue(page: import('@playwright/test').Page, signalTitle: string) {
	const initialLoad = page.waitForResponse(
		(r) =>
			r.url().includes('/api/moderation/external-signals') && r.request().method() === 'GET'
	);
	await page.goto('/external-signals');
	await initialLoad;
	const cell = page.getByText(signalTitle, { exact: false });
	await expect(cell).toBeVisible({ timeout: 10_000 });
	return cell.locator('xpath=ancestor::tr[1]');
}

test('moderator verifies a declared signal from the queue', async ({ page }) => {
	const user = await seedUser({ prefix: 'extsig' });
	const signal = await seedExternalSignal({ userId: user.id });

	try {
		const row = await landOnQueue(page, `E2E declared post`);

		const req = page.waitForResponse(
			(r) =>
				r.url().includes('/moderation/external-signals/') &&
				r.url().endsWith('/verify') &&
				r.request().method() === 'POST'
		);
		await row.getByRole('button', { name: /^vérifier$|^verify$/i }).click();
		expect((await req).status(), 'verify POST').toBeLessThan(300);

		const state = await readExternalSignal(signal.id);
		expect(state?.verified_at, 'verified_at set').not.toBeNull();
		expect(state?.verification_method).toBe('manual_review');
	} finally {
		await cleanupUser(user.id);
	}
});

test('moderator deletes a bogus signal through the danger dialog', async ({ page }) => {
	const user = await seedUser({ prefix: 'extsigdel' });
	const signal = await seedExternalSignal({ userId: user.id, title: 'E2E bogus claim' });

	try {
		const row = await landOnQueue(page, 'E2E bogus claim');

		await row.getByRole('button', { name: /^supprimer$|^delete$/i }).click();
		const req = page.waitForResponse(
			(r) =>
				r.url().includes(`/moderation/external-signals/${signal.id}`) &&
				r.request().method() === 'DELETE'
		);
		await page.getByTestId('confirm-dangerous-action').click();
		expect((await req).status(), 'delete DELETE').toBeLessThan(300);

		expect(await readExternalSignal(signal.id), 'row gone').toBeUndefined();
	} finally {
		await cleanupUser(user.id);
	}
});
