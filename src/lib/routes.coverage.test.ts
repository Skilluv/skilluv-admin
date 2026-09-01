/**
 * Every admin page is in the nav smoke test.
 *
 * `e2e/admin/nav-smoke.spec.ts` says it covers "every admin route", and it
 * did when it was written. Fourteen pages were added afterwards and none of
 * them joined the list — the suite kept passing and kept claiming coverage it
 * no longer had. Nothing could catch that, because a missing test is invisible
 * to the tests that exist.
 *
 * This lives in Vitest rather than in Playwright on purpose: it needs no
 * browser and no backend, so it runs in the required check and reports in a
 * second, where the e2e job takes a quarter of an hour and needs a published
 * image to run at all.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES_DIR = 'src/routes';
const SMOKE = 'e2e/admin/nav-smoke.spec.ts';

/** Top-level pages only. Dynamic segments need an id the smoke test has no
 *  way to invent, and they are covered by their module's own spec. */
function staticPages(): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(ROUTES_DIR, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith('[')) continue;
		if (entry.name === 'auth') continue; // unauthenticated by design
		if (fs.existsSync(path.join(ROUTES_DIR, entry.name, '+page.svelte'))) {
			out.push(`/${entry.name}`);
		}
	}
	return out.sort();
}

function smokedPaths(): Set<string> {
	const source = fs.readFileSync(SMOKE, 'utf8');
	return new Set([...source.matchAll(/path: '([^']+)'/g)].map((m) => m[1]));
}

describe('nav smoke coverage', () => {
	it('lists every top-level admin page', () => {
		const smoked = smokedPaths();
		const missing = staticPages().filter((p) => !smoked.has(p));
		expect(missing, `add these to ${SMOKE}`).toEqual([]);
	});

	it('lists no page that no longer exists', () => {
		// The other direction: a renamed or deleted route leaves a smoke case
		// that navigates to a 404 and asserts the nav renders on it, which it
		// does — SvelteKit's error page mounts the layout.
		const pages = new Set(staticPages());
		const stale = [...smokedPaths()].filter(
			(p) => p !== '/' && !p.includes('/', 1) && !pages.has(p)
		);
		expect(stale, `these no longer exist under ${ROUTES_DIR}`).toEqual([]);
	});
});
