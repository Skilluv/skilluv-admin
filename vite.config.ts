import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// Admin app runs on port 5174 in dev to sit alongside the public frontend
// (5173) without collision. The dev server proxies /api/* to whatever
// `VITE_API_PROXY_TARGET` names, and defaults to a local backend on :3001.
//
// ## Why the default is local, and used to be production
//
// It pointed at https://api.skill-uv.com "so a fresh clone works out of the
// box". `.env` is gitignored, so it does not exist on a CI runner, and that
// fallback applied in silence: the authenticated admin e2e suite spent from
// 12 August driving **the production API** instead of the backend the job
// had started ten steps earlier. Every write came back 401 — the CI admin
// exists only in the CI database, and its tokens are signed with a secret
// published in the workflow file — so nothing was written. That was luck.
//
// Two things followed from it. A convenience default that names production
// is a trap laid for the environment least able to notice it sprang; and
// `skilluv-frontend` had already made the opposite choice for its own proxy
// (`PUBLIC_API_BASE_URL || 'http://localhost:3001'`), so the admin app was
// the one repository disagreeing with the house rule.
//
// Reaching production is now a sentence somebody types. That is the whole
// point: it was never the wrong destination, only the unspoken one.
//
// The CI refusal below is kept as a second line. The default no longer needs
// it, and a script, dev container or tool that does not set `CI` would slip
// past it anyway — but it names the variable at the moment it is missing,
// which is worth more than the few lines it costs.
export default defineConfig(({ mode, command }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const explicit = env.VITE_API_PROXY_TARGET;

	if (!explicit && process.env.CI && command === 'serve') {
		throw new Error(
			'VITE_API_PROXY_TARGET is unset under CI. Set it on the job ' +
				'(http://localhost:3001 for the e2e backend container) rather than ' +
				'relying on a default — this is where pointing at the wrong backend ' +
				'goes unnoticed the longest.'
		);
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			port: 5174,
			strictPort: true,
			proxy: {
				'/api': {
					target: explicit || 'http://localhost:3001',
					changeOrigin: true,
					secure: true
				}
			}
		}
	};
});
