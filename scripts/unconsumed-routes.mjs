/**
 * The other direction: routes the backend serves that this client never calls.
 *
 * `routes.contract.test.ts` asks "does everything we call exist?" and guards
 * against SKI-348. This asks the opposite question — "does everything that
 * exists get used?" — which is not a bug report but a coverage map. A served
 * admin route nobody calls is either a screen that was never built or a
 * decision nobody wrote down, and the two are indistinguishable until
 * somebody looks.
 *
 * Usage:
 *
 *     node scripts/unconsumed-routes.mjs            # the staff surface
 *     node scripts/unconsumed-routes.mjs --admin    # `/admin/**` only
 *     node scripts/unconsumed-routes.mjs --all      # every served route
 *     node scripts/unconsumed-routes.mjs --json     # machine-readable
 *
 * ## What counts as the staff surface
 *
 * `/admin/**`, **plus every route behind a capability guard wherever it
 * lives**. The second half is not a refinement; leaving it out is how this
 * audit missed five whole domains.
 *
 * `/admin` is a convention and the domain modules do not follow it.
 * `/quality/bugs/review-queue`, `/beginner/verifications/queue` and
 * `/communication/slices/{id}/translation-reviews` are reviewer surfaces
 * gated by `require_any_capability` and served outside the prefix. Scoped to
 * the prefix, this script called them out of scope — which reads as "nothing
 * to see" rather than as "not looked at", and is the quieter way of being
 * wrong.
 *
 * What is deliberately *not* in scope is a route gated by ownership.
 * `POST /leadership/cohorts/{id}/graduate` checks that the caller leads the
 * cohort; `POST /audio/castings/{id}/select` filters on `opened_by`. Those
 * are the practitioner's own gestures and have no business in an admin
 * panel. The snapshot's `guarded` flag draws exactly that line.
 *
 * ## What it can and cannot tell you
 *
 * It compares path plus verb. A path called with GET but also served with
 * POST shows up as a partial — that is the case worth catching, because it
 * reads as "done" on any path-only audit while the write half is unreachable.
 *
 * It still cannot tell you a route *should* be consumed. Judgement stays with
 * the reader; this only removes the excuse of not knowing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, '..', 'src/lib/api');
const SNAPSHOT = JSON.parse(readFileSync(join(API_DIR, 'backend-routes.json'), 'utf8'));

const args = new Set(process.argv.slice(2));
const SCOPE_ALL = args.has('--all');
const ADMIN_ONLY = args.has('--admin');
const AS_JSON = args.has('--json');

/** Replace every `${…}` in a template literal with `{}`. Holes nest. */
function stripTemplateHoles(raw) {
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

/** Normalise a call site into the shape the snapshot stores. */
function normaliseCallPath(raw) {
	let path = stripTemplateHoles(raw);
	path = path.replace(/(?:\{\})+/g, '{}');
	path = path.replace(/([^/])\{\}/g, '$1');
	path = path.split('?')[0];
	path = path.replace(/\/+$/, '');
	return path || '/';
}

function apiModules() {
	return readdirSync(API_DIR)
		.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'client.ts')
		.map((f) => join(API_DIR, f));
}

/**
 * Every (verb, path) this client issues.
 *
 * `upload` is a POST with a multipart body — the snapshot only knows verbs,
 * so it has to be mapped or every upload route reads as unconsumed.
 */
function consumed() {
	const pairs = new Set();
	for (const file of apiModules()) {
		const source = readFileSync(file, 'utf8');
		const calls = /\bapi\.(get|post|put|patch|delete|upload)\b/g;
		let match;
		while ((match = calls.exec(source)) !== null) {
			const verb = match[1] === 'upload' ? 'POST' : match[1].toUpperCase();
			const window = stripTemplateHoles(source.slice(match.index, match.index + 800));
			const literal = /(['`])(\/[^'`]*)\1/.exec(window);
			if (literal) pairs.add(`${verb} ${normaliseCallPath(literal[2])}`);
		}
	}
	return pairs;
}

/**
 * Paths this client names without going through the API client.
 *
 * Not every consumption is a fetch. `GET /admin/email-preview` answers with a
 * whole HTML document and is consumed as an `<iframe src>`, built by a helper
 * that returns a URL string — so the verb scan above sees nothing and reports
 * a route that has worked all along.
 *
 * That false positive matters more than the missing coverage would: this
 * report is read as a list of things the backend should fix, and a wrong
 * entry on it costs somebody an afternoon proving the route is fine. So every
 * `/api/...` string literal in the modules counts as a reference, and the
 * routes it covers are reported separately rather than as unconsumed.
 */
function referenced() {
	const paths = new Set();
	for (const file of apiModules()) {
		const source = stripTemplateHoles(readFileSync(file, 'utf8'));
		for (const m of source.matchAll(/(['`])(\/api\/[^'`\s]*)\1/g)) {
			paths.add(normaliseCallPath(m[2].replace(/^\/api/, '')));
		}
	}
	return paths;
}

const CALLED = consumed();
const REFERENCED = referenced();
/**
 * The staff surface: `/admin/**` plus anything a capability guards.
 *
 * `--admin` restores the prefix-only scope, kept because it is the number
 * the backend tickets quote. `--all` is every served route and is mostly
 * noise — the public API is not this app's job.
 */
function inScope(endpoint) {
	if (SCOPE_ALL) return true;
	const isAdmin = endpoint.path.startsWith('/admin/') || endpoint.path === '/admin';
	if (ADMIN_ONLY) return isAdmin;
	return isAdmin || endpoint.guarded === true;
}

const missing = [];
const byUrl = [];
for (const endpoint of SNAPSHOT.endpoints) {
	if (!inScope(endpoint)) continue;
	const { path, methods } = endpoint;
	const unused = methods.filter((m) => !CALLED.has(`${m} ${path}`));
	if (unused.length === 0) continue;
	if (REFERENCED.has(path)) {
		byUrl.push({ path, methods });
		continue;
	}
	const partial = unused.length < methods.length;
	missing.push({ path, unused, methods, partial, guarded: endpoint.guarded });
}

if (AS_JSON) {
	console.log(
		JSON.stringify(
			{ scope: SCOPE_ALL ? 'all' : ADMIN_ONLY ? 'admin' : 'staff', missing, consumed_by_url: byUrl },
			null,
			2
		)
	);
	process.exit(0);
}

const scoped = SNAPSHOT.endpoints.filter(inScope);
const verbsServed = scoped.reduce((n, e) => n + e.methods.length, 0);
const verbsMissing = missing.reduce((n, e) => n + e.unused.length, 0);

if (byUrl.length > 0) {
	console.log(
		`Consumed as a URL rather than a fetch (${byUrl.length}): ` +
			byUrl.map((e) => e.path).join(', ') +
			'\n'
	);
}

console.log(
	`${scoped.length} routes in scope (${verbsServed} verbs). ` +
		`${missing.length} routes have an unconsumed verb (${verbsMissing} verbs).`
);
console.log(
	`Consumed: ${verbsServed - verbsMissing}/${verbsServed} verbs ` +
		`(${((100 * (verbsServed - verbsMissing)) / verbsServed).toFixed(1)}%)\n`
);

/**
 * Group by the segment that names the resource.
 *
 * That is the second segment under `/admin/` and the first everywhere else —
 * `/admin/finance/...` and `/quality/bugs/...` both want their own heading,
 * and keying on a fixed index would file every domain route under its domain
 * name twice over.
 */
const groups = new Map();
for (const row of missing) {
	const parts = row.path.split('/').filter(Boolean);
	const key = (parts[0] === 'admin' ? parts[1] : parts[0]) ?? '(root)';
	if (!groups.has(key)) groups.set(key, []);
	groups.get(key).push(row);
}

for (const [group, rows] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
	console.log(`## ${group} (${rows.length})`);
	for (const r of rows) {
		const flag = r.partial ? ` [partial, served ${r.methods.join('/')}]` : '';
		console.log(`  ${r.unused.join(',').padEnd(12)} ${r.path}${flag}`);
	}
	console.log('');
}
