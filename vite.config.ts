import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// Admin app runs on port 5174 in dev to sit alongside the public frontend
// (5173) without collision. The dev server proxies /api/* to whichever
// backend is set in .env (VITE_API_PROXY_TARGET) — defaults to the
// production API at https://api.skill-uv.com so a fresh clone works
// out of the box. Point it at http://localhost:3001 in your local .env
// when running the Rust backend on your machine.
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const proxyTarget = env.VITE_API_PROXY_TARGET || 'https://api.skill-uv.com';
	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			port: 5174,
			strictPort: true,
			proxy: {
				'/api': {
					target: proxyTarget,
					changeOrigin: true,
					secure: true
				}
			}
		}
	};
});
