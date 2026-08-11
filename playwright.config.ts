import { defineConfig, devices } from '@playwright/test';
import { loadDotEnv } from './e2e/setup/env.mjs';
import { STORAGE_STATE } from './e2e/global-setup';

// Avant tout le reste : global-setup et e2e/setup/db.ts lisent BACKEND_URL /
// DATABASE_URL au moment de l'import, donc .env doit être chargé ici.
loadDotEnv();

// E2E config. Two project buckets:
//   - `public` : specs that don't need auth (auth-redirect, login page render, …)
//   - `admin`  : specs that reuse an authenticated admin storageState produced
//                by `global-setup.ts`. Requires backend on :3001 and the file
//                `e2e/setup/admin-credentials.json` (see qa/README.md).
export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	globalSetup: './e2e/global-setup.ts',

	use: {
		baseURL: 'http://127.0.0.1:5174',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},

	projects: [
		{
			name: 'public',
			testDir: './e2e',
			testIgnore: ['admin/**', 'setup/**', 'global-setup.ts'],
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'admin',
			testDir: './e2e/admin',
			use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE }
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
