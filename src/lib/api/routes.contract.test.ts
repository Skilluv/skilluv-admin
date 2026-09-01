/**
 * Every path this client calls has to be a path the backend serves.
 *
 * SKI-348: three calls had been pointing at `/admin/ai/*` and
 * `/admin/badge-events` for months while the backend served
 * `/admin/assistant/*` and `/admin/events`. Nobody saw it, and the reason is
 * worth keeping in mind — a 404 on a POST that queues a background job looks
 * exactly like a job that ran and found nothing. Both sides were correct on
 * their own; only comparing them finds it.
 *
 * So this test compares them. It reads every `api.get/post/put/patch/delete`
 * call in `src/lib/api/**` and asserts the path exists in
 * `backend-routes.json`, which `scripts/sync-backend-routes.mjs` generates
 * from the backend's own `.route(…)` registrations.
 *
 * ## What it can and cannot catch
 *
 * It catches a path this app invents, renames, or mistypes — the whole of
 * SKI-348. It cannot catch a route the backend deleted after the last
 * snapshot, and it says nothing about the method, the body or the response
 * shape: the per-module tests do that.
 *
 * When it fails, the fix is one of two things, and the difference matters:
 *
 *   * the path here is wrong → fix the path;
 *   * the backend moved or added a route → re-run
 *     `node scripts/sync-backend-routes.mjs` and read the diff before
 *     committing it. Refreshing the snapshot to make a red test green is how
 *     this test stops being worth having.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import backendRoutes from './backend-routes.json';

const HERE = dirname(fileURLToPath(import.meta.url));

const SERVED = new Set<string>(backendRoutes.routes);

/**
 * Paths that are deliberately not backend routes.
 *
 * `/api` is the client's base URL, and the rest are browser redirects the
 * API client performs on specific error codes — page paths on the public
 * app, not endpoints.
 */
const NOT_ENDPOINTS = new Set([
	'/api',
	'/auth/setup-2fa',
	'/auth/verify-email',
	'/settings/security',
	'/enterprise/onboarding',
	'/enterprise/settings/security'
]);

/**
 * Replace every `${…}` in a template literal with `{}`.
 *
 * A scan rather than a regex because the holes nest: this app builds query
 * strings with `${qs ? `?${qs}` : ''}`, which carries both an inner brace
 * pair and an inner backtick. A `\$\{[^}]*\}` pattern stops at the first `}`
 * and leaves a mangled path — which is exactly what the first run of this
 * test reported, on two calls that were perfectly correct.
 */
export function stripTemplateHoles(raw: string): string {
	let out = '';
	for (let i = 0; i < raw.length; i += 1) {
		if (raw[i] !== '$' || raw[i + 1] !== '{') {
			out += raw[i];
			continue;
		}
		let depth = 0;
		let j = i + 1;
		for (; j < raw.length; j += 1) {
			if (raw[j] === '{') depth += 1;
			else if (raw[j] === '}') {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		out += '{}';
		i = j;
	}
	return out;
}

/**
 * Normalise a call site into the shape `backend-routes.json` stores.
 *
 * Template holes become `{}`, matching the parameter erasure on the served
 * side. Two artefacts of building URLs by concatenation are undone here
 * rather than left to fail the test for the wrong reason:
 *
 *   * `/x/${id}${suffix}` — two holes in a row are one segment;
 *   * `/x/${id}/rank-override${qs}` — a hole glued to the end of a segment
 *     is an appended query string, never a path parameter, because the
 *     served side only ever has whole-segment parameters.
 */
export function normaliseCallPath(raw: string): string {
	let path = stripTemplateHoles(raw);
	path = path.replace(/(?:\{\})+/g, '{}');
	path = path.replace(/([^/])\{\}/g, '$1');
	path = path.split('?')[0];
	path = path.replace(/\/+$/, '');
	return path || '/';
}

/** Source files that issue calls — the modules, not their tests. */
function apiModules(): string[] {
	return readdirSync(HERE)
		.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'client.ts')
		.map((f) => join(HERE, f));
}

/**
 * Pull the first string argument out of every `api.<method>(…)` call.
 *
 * Written as a scan rather than one regex because the generic parameter can
 * itself contain `>` and braces — `ApiPaginatedResponse<BadgeEvent & { … }>`
 * defeats any `<[^>]*>` you write. The path is always the first string
 * literal after the call site, so that is what this looks for, with the
 * holes erased first so an inner backtick cannot close the template early.
 */
function callPaths(source: string): string[] {
	const paths: string[] = [];
	const calls = /\bapi\.(get|post|put|patch|delete|upload)\b/g;
	let match: RegExpExecArray | null;
	while ((match = calls.exec(source)) !== null) {
		const window = stripTemplateHoles(source.slice(match.index, match.index + 800));
		const literal = /(['`])(\/[^'`]*)\1/.exec(window);
		if (literal) paths.push(literal[2]);
	}
	return paths;
}

describe('every path this client calls is served by the backend', () => {
	const offenders: { file: string; path: string }[] = [];

	for (const file of apiModules()) {
		const name = file.split(/[\\/]/).pop() as string;
		const source = readFileSync(file, 'utf8');
		for (const raw of callPaths(source)) {
			const path = normaliseCallPath(raw);
			if (NOT_ENDPOINTS.has(path)) continue;
			if (!SERVED.has(path)) offenders.push({ file: name, path });
		}
	}

	it('finds no call pointing at a path nothing serves', () => {
		expect(
			offenders,
			offenders.length
				? `Unserved paths:\n${offenders
						.map((o) => `  ${o.file} → ${o.path}`)
						.join('\n')}\n\nEither the path is wrong, or the backend moved and the ` +
						'snapshot needs `node scripts/sync-backend-routes.mjs`.'
				: undefined
		).toEqual([]);
	});

	it('checked a meaningful number of calls', () => {
		// A regex that silently stops matching would make the test above pass
		// by checking nothing, which is the failure mode of every contract
		// test written this way.
		const total = apiModules().reduce(
			(n, f) => n + callPaths(readFileSync(f, 'utf8')).length,
			0
		);
		expect(total).toBeGreaterThan(150);
	});

	it('reads a snapshot that looks like the whole backend', () => {
		expect(SERVED.size).toBeGreaterThan(500);
	});
});

describe('normaliseCallPath', () => {
	it('erases template holes into whole-segment parameters', () => {
		expect(normaliseCallPath('/admin/users/${id}/ban')).toBe('/admin/users/{}/ban');
	});

	it('collapses two adjacent holes into one segment', () => {
		expect(normaliseCallPath('/admin/fraud/scan-deliverable/${id}${qs}')).toBe(
			'/admin/fraud/scan-deliverable/{}'
		);
	});

	it('drops a hole glued to the end of a segment — that is a query string', () => {
		expect(normaliseCallPath('/admin/users/${id}/rank-override${qs}')).toBe(
			'/admin/users/{}/rank-override'
		);
	});

	it('survives a hole that itself contains braces and a backtick', () => {
		expect(normaliseCallPath("/admin/projects${qs ? `?${qs}` : ''}")).toBe('/admin/projects');
		expect(normaliseCallPath("/admin/fraud/deep-scan/${id}${qs ? `?${qs}` : ''}")).toBe(
			'/admin/fraud/deep-scan/{}'
		);
	});

	it('drops a literal query string', () => {
		expect(normaliseCallPath('/auth/verify-email?token=x')).toBe('/auth/verify-email');
	});
});

describe('the three paths SKI-348 corrected', () => {
	it('points the AI jobs at the assistant surface', () => {
		expect(SERVED.has('/admin/assistant/hidden-gems')).toBe(true);
		expect(SERVED.has('/admin/assistant/churn')).toBe(true);
		expect(SERVED.has('/admin/ai/hidden-gems')).toBe(false);
		expect(SERVED.has('/admin/ai/churn')).toBe(false);
	});

	it('points the badge events at the events collection', () => {
		expect(SERVED.has('/admin/events')).toBe(true);
		expect(SERVED.has('/admin/badge-events')).toBe(false);
	});
});
