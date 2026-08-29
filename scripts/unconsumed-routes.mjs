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
 *     node scripts/unconsumed-routes.mjs            # admin surface only
 *     node scripts/unconsumed-routes.mjs --all      # every served route
 *     node scripts/unconsumed-routes.mjs --json     # machine-readable
 *
 * ## What it can and cannot tell you
 *
 * It compares path plus verb. A path called with GET but also served with
 * POST shows up as a partial — that is the case worth catching, because it
 * reads as "done" on any path-only audit while the write half is unreachable.
 *
 * It cannot tell you a route *should* be consumed. Plenty of the public
 * surface has no business in an admin panel, which is why the default scope
 * is `/admin/**`. Judgement stays with the reader; this only removes the
 * excuse of not knowing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, '..', 'src/lib/api');
const SNAPSHOT = JSON.parse(readFileSync(join(API_DIR, 'backend-routes.json'), 'utf8'));

const args = new Set(process.argv.slice(2));
const SCOPE_ALL = args.has('--all');
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

/**
 * Every (verb, path) this client issues.
 *
 * `upload` is a POST with a multipart body — the snapshot only knows verbs,
 * so it has to be mapped or every upload route reads as unconsumed.
 */
function consumed() {
	const pairs = new Set();
	const files = readdirSync(API_DIR)
		.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'client.ts')
		.map((f) => join(API_DIR, f));
	for (const file of files) {
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

const CALLED = consumed();
const inScope = (p) => SCOPE_ALL || p.startsWith('/admin/') || p === '/admin';

const missing = [];
for (const { path, methods } of SNAPSHOT.endpoints) {
	if (!inScope(path)) continue;
	const unused = methods.filter((m) => !CALLED.has(`${m} ${path}`));
	if (unused.length === 0) continue;
	const partial = unused.length < methods.length;
	missing.push({ path, unused, methods, partial });
}

if (AS_JSON) {
	console.log(JSON.stringify({ scope: SCOPE_ALL ? 'all' : 'admin', missing }, null, 2));
	process.exit(0);
}

const scoped = SNAPSHOT.endpoints.filter((e) => inScope(e.path));
const verbsServed = scoped.reduce((n, e) => n + e.methods.length, 0);
const verbsMissing = missing.reduce((n, e) => n + e.unused.length, 0);

console.log(
	`${scoped.length} routes in scope (${verbsServed} verbs). ` +
		`${missing.length} routes have an unconsumed verb (${verbsMissing} verbs).`
);
console.log(
	`Consumed: ${verbsServed - verbsMissing}/${verbsServed} verbs ` +
		`(${((100 * (verbsServed - verbsMissing)) / verbsServed).toFixed(1)}%)\n`
);

/** Group by the segment after `/admin/`, which is how the backend files split. */
const groups = new Map();
for (const row of missing) {
	const key = row.path.split('/')[2] ?? '(root)';
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
