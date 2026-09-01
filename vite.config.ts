import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// Admin app runs on port 5174 in dev to sit alongside the public frontend
// (5173) without collision. The dev server proxies /api/* to whichever
// backend is set in .env (VITE_API_PROXY_TARGET) — defaults to the deployed
// API at https://api.skill-uv.com so a fresh clone works out of the box.
// Point it at http://localhost:3001 in your local .env when running the Rust
// backend on your machine.
//
// ## Why that default is refused under CI
//
// `.env` is gitignored, so it does not exist on a CI runner, and the fallback
// applied silently: the authenticated admin e2e suite spent weeks driving
// **the production API** instead of the backend the job had just started next
// to it. Every write came back 401 — the CI admin account exists only in the
// CI database — so nothing was written to production. That was luck, not
// design, and the next person to bootstrap differently would not have it.
//
// A convenience default that points at production is a trap for exactly the
// environment that cannot see it went wrong. On a developer machine the
// default stays; under CI it is a hard failure that names the variable.
//
// Guarded on `command === 'serve'`: only the dev server has a proxy. `vite
// build` reads this same config in the type-check job, which sets no target
// and needs none, and throwing there would turn the required check red for a
// setting that job never uses.
export default defineConfig(({ mode, command }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const explicit = env.VITE_API_PROXY_TARGET;

	if (!explicit && process.env.CI && command === 'serve') {
		throw new Error(
			'VITE_API_PROXY_TARGET is unset under CI. Refusing to fall back to ' +
				'https://api.skill-uv.com — that would point the test suite at production. ' +
				'Set it on the job (http://localhost:3001 for the e2e backend container).'
		);
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			port: 5174,
			strictPort: true,
			proxy: {
				'/api': {
					target: explicit || 'https://api.skill-uv.com',
					changeOrigin: true,
					secure: true
				}
			}
		}
	};
});
