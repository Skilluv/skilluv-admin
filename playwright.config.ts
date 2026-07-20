import { defineConfig, devices } from '@playwright/test';

// Smoke-only e2e config. Purpose: catch a broken deploy before it hits users
// (login redirect, guarded routes, key public pages render). Not an exhaustive
// suite — the interaction-heavy component tests live in Vitest.
export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

	use: {
		// baseURL points at the vite dev server (`npm run dev` sur :5174) —
		// this is required by admin-back-e2e.spec.ts which hits `/api/*` routes
		// proxied to a real backend on :3001.
		// Smoke specs (auth-*, auth-redirect) also work at :5174 because vite's
		// SSR calls hooks.server.ts which still 303-redirects unauthenticated
		// visitors — no backend needed for those tests to pass.
		baseURL: 'http://127.0.0.1:5174',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],

	webServer: {
		// Vite dev server exposes the /api → :3001 proxy declared in vite.config.ts,
		// which admin-back-e2e.spec.ts requires. `strictPort: true` in vite guarantees
		// port 5174 (fails loudly if it is already taken).
		command: 'npm run dev -- --host 127.0.0.1',
		url: 'http://127.0.0.1:5174',
		reuseExistingServer: !process.env.CI,
		timeout: 90_000
	}
});
