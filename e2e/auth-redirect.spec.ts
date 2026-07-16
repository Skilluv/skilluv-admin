import { expect, test } from '@playwright/test';

// Purpose: verify hooks.server.ts guards every protected route with a 303
// redirect to /auth/login when no admin cookie is present. If someone breaks
// the guard we want CI red before it hits prod.

const GUARDED_ROUTES = [
	'/',
	'/users',
	'/reports',
	'/fraud',
	'/challenges',
	'/community',
	'/tenants',
	'/enterprise-kyc',
	'/sponsored-challenges',
	'/tournaments',
	'/audit-log',
	'/operations',
	'/sso-sessions'
];

for (const route of GUARDED_ROUTES) {
	test(`unauthenticated visitor is redirected from ${route} to /auth/login`, async ({ page }) => {
		const response = await page.goto(route);
		expect(response, `no response for ${route}`).not.toBeNull();
		// hooks.server.ts uses 303, followed automatically by the browser.
		const finalUrl = new URL(page.url());
		expect(finalUrl.pathname).toBe('/auth/login');
		// The redirect target must be preserved so the login flow can bounce
		// the user back after a successful sign-in.
		const redirectParam = finalUrl.searchParams.get('redirect');
		expect(redirectParam, `redirect param missing for ${route}`).not.toBeNull();
		expect(redirectParam).toContain(route === '/' ? '/' : route);
	});
}

test('login page renders standalone (no admin chrome, no sidebar)', async ({ page }) => {
	await page.goto('/auth/login');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	// The layout hides admin chrome under /auth/*, so the sidebar link to
	// "Users" from the layout nav must NOT appear on the login page.
	await expect(page.getByRole('link', { name: /^Users?$/i })).toHaveCount(0);
});
