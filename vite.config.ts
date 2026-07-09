import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Admin app runs on port 5174 in dev to sit alongside the public frontend
// (5173) without collision. Both proxy their /api/* through the same Rust
// backend on :3001 — CORS + cookie separation live server-side. In prod the
// admin app is served from `admin.skilluv.com`; the two frontends never
// share an origin, which is the whole point of splitting them.
export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5174,
		strictPort: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true
			}
		}
	}
});
