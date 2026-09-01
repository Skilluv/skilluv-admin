/**
 * Snapshot the routes skilluv-backend actually serves.
 *
 * SKI-348 was three paths this client had been calling for months and that
 * nothing answered. Both sides were correct in isolation — `ai` against
 * `assistant`, `badge-events` against `events` — so no review caught it, and
 * a 404 on a job-queueing POST is indistinguishable from a job that found
 * nothing. Only a mechanical comparison finds that class of bug.
 *
 * This writes the served route list into `src/lib/api/backend-routes.json`,
 * which `routes.contract.test.ts` checks every call in `src/lib/api/**`
 * against.
 *
 * ## What this is not
 *
 * It is a snapshot, not a live check. It catches drift **since the last
 * refresh**, which is the whole of what SKI-348 was; it cannot catch a route
 * the backend removed an hour ago. Re-run it whenever the backend lands a
 * batch:
 *
 *     node scripts/sync-backend-routes.mjs [path-to-skilluv-backend]
 *
 * The source is `.route("…")` registrations rather than the generated
 * OpenAPI document, because the registrations are the thing that actually
 * decides what answers. A route registered and undocumented still answers;
 * a route documented and unregistered does not.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(HERE, '..', process.argv[2] ?? '../skilluv-backend');
const OUT = resolve(HERE, '..', 'src/lib/api/backend-routes.json');

/** Every `.rs` file under a directory, recursively. */
function rustFiles(dir) {
	const found = [];
	for (const entry of readdirSync(dir)) {
		if (entry === 'target' || entry === '.git') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) found.push(...rustFiles(full));
		else if (entry.endsWith('.rs')) found.push(full);
	}
	return found;
}

/**
 * `/admin/users/{id}/ban` and `/admin/users/{user_id}/ban` are the same
 * route. Parameter names are the server's business, so they are erased on
 * both sides before comparison.
 */
export function normalise(path) {
	const cleaned = path.trim().replace(/\/+$/, '').replace(/\{[^}]*\}/g, '{}') || '/';
	// Five routes are registered on routers mounted at the root rather than
	// under `/api`, so they spell the prefix themselves — `well_known_routes`
	// also serves `/.well-known/security.txt`, and `metrics_routes` also
	// serves `/metrics`. Their full URL is the same shape as everybody
	// else's, so the prefix comes off here and both sides of the audit speak
	// one language. Without this, `/api/admin/accounting/export` reads as
	// uncalled while the operations page has been downloading from it all
	// along.
	return cleaned === '/api' ? cleaned : cleaned.replace(/^\/api(?=\/)/, '') || '/';
}

/**
 * Slice out the argument list of the `.route(` starting at `from`.
 *
 * The registrations wrap across lines once a handler list gets long, so the
 * block cannot be matched line-wise. Brace and paren depth is tracked
 * together, and string literals are skipped, because a handler name is a
 * bare identifier but a path is not.
 */
export function routeBlock(text, from) {
	let depth = 0;
	for (let i = from; i < text.length; i += 1) {
		const c = text[i];
		if (c === '"') {
			i += 1;
			// 92 is a backslash. Compared by code point because an escaped
			// quote inside a Rust string literal must not end the scan.
			while (i < text.length && text[i] !== '"') i += text.charCodeAt(i) === 92 ? 2 : 1;
			continue;
		}
		if (c === '(') depth += 1;
		else if (c === ')') {
			depth -= 1;
			if (depth === 0) return text.slice(from, i + 1);
		}
	}
	return text.slice(from);
}

/**
 * The guards that mean "this route is for staff, not for whoever owns the
 * row".
 *
 * The reason this matters: **a staff surface is not identified by its path.**
 * `/admin/**` is a convention, not a rule, and the domain modules do not
 * follow it — `/quality/bugs/review-queue`, `/beginner/verifications/queue`
 * and `/leadership/cohorts/{id}/graduate` are all reviewer surfaces gated by
 * a capability and served outside `/admin`.
 *
 * An audit scoped to the prefix reports those as out of scope, which is a
 * quieter way of being wrong than reporting them as absent. This session did
 * exactly that for a full day.
 */
/**
 * Enumerated from `src/middleware/capabilities.rs` rather than guessed —
 * guessing had already missed `require_reviewer_for_orientation`, which is
 * what stands in front of a defect-report review, and with it the second
 * half of the quality domain.
 *
 * `require_csrf` and `require_permission` are deliberately absent: the first
 * is on every mutating route regardless, and the second is a method on a
 * session type rather than a capability check.
 */
const GUARDS = [
	'require_any_capability',
	'require_capability',
	'require_challenge_validator_for',
	'require_reviewer_for_orientation',
	// Module-local helpers used by whole files, kept because they are the
	// name the handlers actually call.
	'require_admin',
	'require_reader',
	'require_curator',
	'AdminGate'
];

const VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/** Line comments, blanked so a guard named in prose does not count as one. */
function stripLineComments(text) {
	return text.replace(/\/\/[^\n]*/g, '');
}

/** `require_admin` must not match `require_admin_2fa`, which is a different
 *  thing and gates every admin route regardless. */
function callsAny(body, names) {
	return names.some((n) => new RegExp(`\\b${n}\\s*[(:]`).test(body));
}

/**
 * Every function in a file, as name -> body.
 *
 * Bodies are bounded by matching braces rather than by "up to the next
 * `pub`". The looser version swallows the following function and marks
 * innocent handlers as guarded — `/bookmarks` and `/users/me/goals` both came
 * back as staff surfaces on the first attempt.
 */
function functionBodies(text) {
	const out = new Map();
	for (const m of text.matchAll(/\basync fn (\w+)\s*\(/g)) {
		const open = text.indexOf('{', m.index);
		if (open === -1) continue;
		let depth = 0;
		let i = open;
		for (; i < text.length; i += 1) {
			if (text[i] === '{') depth += 1;
			else if (text[i] === '}') {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		out.set(m[1], text.slice(open, i + 1));
	}
	return out;
}

/**
 * Handler names that end up behind a guard, directly or through a wrapper.
 *
 * The indirection is not incidental. `quality.rs` guards its review queue
 * with a module-local `require_any_quality_reviewer`, which builds the
 * capability list from `REVIEWER_GROUPS` so that adding a sixth family
 * reaches the guard without anybody editing it. A one-level scan calls that
 * route unguarded and drops a whole domain's reviewer surface out of the
 * audit — which is what happened.
 *
 * So: seed with the real guards, then repeatedly add any function that calls
 * something already in the set, until nothing new appears.
 */
export function guardedHandlers(raw) {
	const text = stripLineComments(raw);
	const bodies = functionBodies(text);
	const guards = new Set(GUARDS);

	for (;;) {
		const names = [...guards];
		let grew = false;
		for (const [name, body] of bodies) {
			if (guards.has(name)) continue;
			if (callsAny(body, names)) {
				guards.add(name);
				grew = true;
			}
		}
		if (!grew) break;
	}

	// `AdminGate` and friends are extractors, so a handler can be guarded by
	// its own signature rather than by its body.
	for (const m of text.matchAll(/\basync fn (\w+)\s*\(([^{]*)/g)) {
		if (callsAny(m[2], GUARDS) || /AdminGate/.test(m[2])) guards.add(m[1]);
	}

	return new Set([...guards].filter((n) => bodies.has(n)));
}

/** The handler identifiers a `.route(...)` block names. */
export function handlersIn(block) {
	return [...block.matchAll(/\b(?:get|post|put|patch|delete)\s*\(\s*(\w+)/g)].map((m) => m[1]);
}

/**
 * The verbs a `.route(...)` block registers.
 *
 * Axum spells them as `get(handler).post(handler)`, so they are the
 * identifiers immediately before an opening paren. No word boundary is
 * needed: `[a-z_]+` is greedy, so `routing::get(` still yields `get` while
 * `add_comment(` yields the whole name and matches no verb.
 */
export function verbsIn(block) {
	const found = new Set();
	for (const m of block.matchAll(/([a-z_]+)\s*\(/g)) {
		if (VERBS.includes(m[1])) found.add(m[1].toUpperCase());
	}
	return [...found].sort();
}

const src = join(BACKEND, 'src');
/** path -> Set of verbs. One path can be registered in several files. */
const served = new Map();
/** Paths whose handler is behind one of the staff guards. */
const guardedPaths = new Set();

for (const file of rustFiles(src)) {
	const text = readFileSync(file, 'utf8');
	const guarded = guardedHandlers(text);
	for (const match of text.matchAll(/\.route\(\s*"([^"]+)"/g)) {
		const path = normalise(match[1]);
		const open = text.indexOf('(', match.index);
		const block = routeBlock(text, open);
		const seen = served.get(path) ?? new Set();
		for (const v of verbsIn(block)) seen.add(v);
		served.set(path, seen);
		if (handlersIn(block).some((h) => guarded.has(h))) guardedPaths.add(path);
	}
}

const sorted = [...served.keys()].sort();
const endpoints = sorted.map((path) => ({
	path,
	methods: [...served.get(path)].sort(),
	// True when a capability or admin guard stands in front of it. The path
	// prefix does not say this, and several whole domains rely on that.
	guarded: guardedPaths.has(path)
}));
writeFileSync(
	OUT,
	JSON.stringify(
		{
			$comment:
				'Generated by scripts/sync-backend-routes.mjs from skilluv-backend .route() registrations. Do not edit by hand.',
			generated_at: new Date().toISOString().slice(0, 10),
			count: sorted.length,
			routes: sorted,
			endpoints
		},
		null,
		'\t'
	) + '\n',
	'utf8'
);

console.log(`wrote ${sorted.length} routes to ${OUT}`);
