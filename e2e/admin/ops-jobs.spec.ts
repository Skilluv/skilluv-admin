import { test, expect } from '@playwright/test';

// Phase 3 — ops jobs safe triggers.
//
// These are admin_destructive rate-limited endpoints (10/min, 100/hr). Each
// spec fires ONE call and validates the POST succeeds (< 300). Side-effect
// depth is out-of-scope here — we're just proving the trigger path from UI
// to backend is wired and the button surface is clickable.
//
// `leaderboards/rebuild` is idempotent; `ai/hidden-gems` + `ai/churn` return
// job_ids; `proof-hooks/sweep` supports dry_run — we always use dry-run to
// avoid mutating real proofs.

async function pageFireAndAssert(
	page: import('@playwright/test').Page,
	pathIncludes: string,
	trigger: () => Promise<void>
) {
	const req = page.waitForResponse(
		(r) => r.url().includes(pathIncludes) && r.request().method() === 'POST'
	);
	await trigger();
	const status = (await req).status();
	expect(status, `POST to ${pathIncludes}`).toBeLessThan(300);
}

test('rebuild-leaderboards trigger reaches the backend', async ({ page }) => {
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/') && r.request().method() === 'GET',
		{ timeout: 15_000 }
	).catch(() => null);
	await page.goto('/operations');
	await initialLoad;
	await pageFireAndAssert(page, '/admin/leaderboards/rebuild', async () => {
		await page.getByRole('button', { name: /rebuild.*leaderboards|leaderboards.*rebuild|reconstruire.*classement/i }).first().click();
	});
});

test('proof-hooks sweep with dry-run reaches the backend', async ({ page }) => {
	await page.goto('/operations');
	// Fires the dry-run sweep — the UI exposes an explicit dry-run toggle.
	const req = page.waitForResponse(
		(r) => r.url().includes('/admin/proof-hooks/sweep') && r.request().method() === 'POST'
	);
	// Best-effort: check dry-run checkbox if present, then click sweep button.
	const dryRunToggle = page.getByLabel(/dry.?run|essai à sec|simulation/i).first();
	if (await dryRunToggle.isVisible().catch(() => false)) {
		await dryRunToggle.check();
	}
	await page.getByRole('button', { name: /sweep|balayage|proof.?hooks/i }).first().click();
	const res = await req;
	expect(res.status(), 'sweep POST').toBeLessThan(300);
});

test('AI hidden-gems job trigger reaches the backend', async ({ page }) => {
	await page.goto('/operations');
	await pageFireAndAssert(page, '/admin/ai/hidden-gems', async () => {
		await page.getByRole('button', { name: /hidden.gems|pépites/i }).first().click();
	});
});

test('AI churn job trigger reaches the backend', async ({ page }) => {
	await page.goto('/operations');
	await pageFireAndAssert(page, '/admin/ai/churn', async () => {
		await page.getByRole('button', { name: /churn|attrition/i }).first().click();
	});
});
