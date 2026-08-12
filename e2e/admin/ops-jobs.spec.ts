import { test, expect, type Page } from '@playwright/test';

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
	page: Page,
	pathIncludes: string,
	trigger: () => Promise<void>
) {
	// Le bouton est rendu en SSR mais son `onclick` n'existe qu'après
	// hydratation : un clic trop tôt ne déclenche rien, et le test échoue sur
	// « aucune réponse » sans dire pourquoi. On réessaie donc quelques fois
	// plutôt que de poser une attente arbitraire qui serait soit trop courte,
	// soit du temps perdu à chaque run.
	const attempts = 5;
	for (let i = 0; i < attempts; i++) {
		const req = page
			.waitForResponse(
				(r) => r.url().includes(pathIncludes) && r.request().method() === 'POST',
				{ timeout: 3_000 }
			)
			.catch(() => null);
		await trigger();
		const res = await req;
		if (res) {
			expect(res.status(), `POST to ${pathIncludes}`).toBeLessThan(300);
			return;
		}
	}
	throw new Error(
		`Aucun POST vers ${pathIncludes} après ${attempts} clics — le handler n'est ` +
			'probablement jamais attaché (hydratation) ou le bouton ne déclenche rien.'
	);
}

// Les quatre déclencheurs portent un `data-testid` : deux boutons de la page
// s'appellent « Déclencher » à l'identique, et les libellés français avaient
// déjà dérivé une fois. Une ancre stable vaut mieux qu'une regex sur du texte
// d'interface.

/** Charge /operations et attend que la page soit hydratée : cliquer avant ne
 *  déclenche rien et le test échoue sur un symptôme trompeur. */
async function openOperations(page: Page) {
	await page.goto('/operations');
	await expect(page.getByTestId('ops-rebuild-leaderboards')).toBeVisible();
}

test('rebuild-leaderboards trigger reaches the backend', async ({ page }) => {
	await openOperations(page);
	await pageFireAndAssert(page, '/admin/leaderboards/rebuild', async () => {
		await page.getByTestId('ops-rebuild-leaderboards').click();
	});
});

test('proof-hooks sweep with dry-run reaches the backend', async ({ page }) => {
	await openOperations(page);
	await pageFireAndAssert(page, '/admin/proof-hooks/sweep', async () => {
		await page.getByTestId('ops-proof-sweep-dry-run').click();
	});
});

test('AI hidden-gems job trigger reaches the backend', async ({ page }) => {
	await openOperations(page);
	await pageFireAndAssert(page, '/admin/ai/hidden-gems', async () => {
		await page.getByTestId('ops-hidden-gems').click();
	});
});

test('AI churn job trigger reaches the backend', async ({ page }) => {
	await openOperations(page);
	await pageFireAndAssert(page, '/admin/ai/churn', async () => {
		await page.getByTestId('ops-churn').click();
	});
});
