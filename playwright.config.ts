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
		baseURL: 'http://127.0.0.1:4173',
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
		// adapter-node ships a plain Node.js server at build/index.js. `vite
		// preview` doesn't run that entry — we invoke node directly. hooks.server.ts
		// still fires on every request, so guarded-route redirects work end-to-end
		// without a backend (the /api/auth/me call fails → user stays null → 303).
		command: 'node build',
		env: { PORT: '4173', HOST: '127.0.0.1' },
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
