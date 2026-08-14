import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./src/tests/setup.ts'],
		include: ['src/**/*.{test,spec}.{ts,js}'],
		// The default 5s is spent transforming SvelteKit modules, not running
		// assertions: the same tests pass alone and time out in a full run on
		// a loaded machine. A suite that fails for that reason is one people
		// learn to re-run instead of read.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/lib/**/*.{ts,svelte}'],
			exclude: ['src/lib/**/*.d.ts', 'src/tests/**']
		}
	},
	resolve: {
		alias: {
			$components: '/src/lib/components',
			$stores: '/src/lib/stores',
			$api: '/src/lib/api',
			$types: '/src/lib/types',
			$lib: '/src/lib'
		}
	}
});
