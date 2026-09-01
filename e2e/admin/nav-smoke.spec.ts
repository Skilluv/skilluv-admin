import { test, expect } from '@playwright/test';

// Phase 1 smoke — for every admin route, prove:
//   1. Authenticated visitor is NOT redirected to /auth/login
//   2. The layout nav still mounts (i.e. the page didn't hard-crash)
//
// A failing case here means either the storageState broke, the page
// throws on render, or the route was removed. Detail assertions belong
// in per-module Phase 2/3 specs.

const ROUTES: Array<{ path: string; label: string }> = [
	{ path: '/', label: 'dashboard' },
	{ path: '/tenants', label: 'tenants list' },
	{ path: '/users', label: 'users list' },
	{ path: '/enterprises', label: 'enterprises list' },
	{ path: '/challenges', label: 'challenges list' },
	{ path: '/reports', label: 'reports list' },
	{ path: '/audit-log', label: 'audit log' },
	{ path: '/enterprise-kyc', label: 'enterprise KYC queue' },
	{ path: '/fraud', label: 'fraud queue' },
	{ path: '/operations', label: 'ops jobs' },
	{ path: '/catalog', label: 'catalog / orientations' },
	{ path: '/projects', label: 'projects list' },
	{ path: '/slices', label: 'slices list' },
	{ path: '/validators/applications', label: 'validator candidacies' },
	{ path: '/validators/invitations', label: 'validator invitations' },
	{ path: '/validators/active', label: 'active validators' },
	{ path: '/validation-analytics', label: 'validation analytics' },
	{ path: '/skills', label: 'skills catalog' },
	{ path: '/sponsored-challenges', label: 'sponsored requests' },
	{ path: '/sso-sessions', label: 'sso sessions' },
	{ path: '/tournaments', label: 'tournaments' },
	{ path: '/community', label: 'community review' },
	{ path: '/external-signals', label: 'external signals queue' },
	{ path: '/engagement', label: 'cohorts and talent offers' },
	{ path: '/design', label: 'design critique queue' },
	{ path: '/security', label: 'security findings queue' },
	{ path: '/missions', label: 'mission board' },
	{ path: '/money', label: 'money movements' },
	{ path: '/disputes', label: 'dispute arbitration' },
	{ path: '/emails', label: 'email preview' },
	{ path: '/sales', label: 'sales pipeline' },
	{ path: '/data', label: 'data line' },
	{ path: '/game', label: 'game moderation' },
	{ path: '/recruitment', label: 'recruitment campaigns' },
	{ path: '/ops-practice', label: 'ops practice' },
	{ path: '/domains', label: 'per-domain dashboard' },
	{ path: '/contracts', label: 'product register' },
	{ path: '/studios', label: 'studios' },
	{ path: '/finance', label: 'finance queues' },
	{ path: '/programs', label: 'programmes and events' },
	{ path: '/review', label: 'review queues' }
];

for (const { path, label } of ROUTES) {
	test(`${label} (${path}) renders for authenticated admin`, async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
		expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(500);
		expect(page.url(), `${path} should not redirect to /auth/`).not.toMatch(/\/auth\//);
		await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 });

		// Console errors — we don't fail on them yet (many pages have transient
		// backend 4xx on empty tables that log to console). Log for visibility.
		if (consoleErrors.length) {
			console.log(`[${path}] console errors:`, consoleErrors);
		}
	});
}
