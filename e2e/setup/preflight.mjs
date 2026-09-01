#!/usr/bin/env node
// Contrôle avant-vol de la suite E2E admin.
//
// Les specs P26 se `skip`ent sur un 404 (un endpoint absent est un état de
// déploiement connu, pas une régression). C'est le bon comportement pour la
// suite, mais ça veut dire qu'un run peut être vert en n'ayant rien vérifié.
// Ce script répond à la seule question qui compte avant de lancer :
// « l'environnement est-il capable de valider quelque chose ? »
//
//   node e2e/setup/preflight.mjs
//
// Lit BACKEND_URL et DATABASE_URL depuis .env (ou l'environnement).
// Sort en 0 si tout est prêt, 1 sinon. N'écrit jamais en base.

import pg from 'pg';

import { assertConsistentTargets, loadDotEnv } from './env.mjs';

loadDotEnv();
assertConsistentTargets('preflight');

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';
const PG_URL = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

/** Migration minimale portant le schéma P26 (statuts, orientations, min_rank,
 *  capabilities validateur, table validator_applications). */
const MIN_MIGRATION = 129;

const results = [];
function check(label, ok, detail) {
	results.push({ label, ok, detail });
	console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

// ─── Backend ─────────────────────────────────────────────────────────────

async function status(pathname) {
	try {
		const res = await fetch(`${BACKEND}${pathname}`, { signal: AbortSignal.timeout(15000) });
		return res.status;
	} catch (e) {
		return `ERR:${e.message}`;
	}
}

async function checkBackend() {
	console.log(`\nBackend — ${BACKEND}`);

	const health = await status('/api/health');
	check('joignable', health === 200, `/api/health → ${health}`);
	if (health !== 200) return;

	// Une route admin qui existe répond 403 (AdminGate) même sans session.
	// Un 404 signifie que la route n'est pas enregistrée : build trop ancien.
	const routes = [
		['/api/admin/projects', 'référence — doit exister sur tout build'],
		['/api/admin/validator-applications', 'SKI-107'],
		['/api/admin/validators/stats', 'SKI-108'],
		['/api/admin/validators/collusion-matrix', 'SKI-108'],
		['/api/admin/slices/00000000-0000-0000-0000-000000000000/config', 'SKI-106'],
		['/api/admin/projects/preflight-probe/stats', 'SKI-124']
	];
	for (const [route, ticket] of routes) {
		const code = await status(route);
		// 401 est acceptable si le gate change d'ordre un jour ; seul 404 disqualifie.
		check(`${ticket}`, code !== 404 && !String(code).startsWith('ERR'), `${route} → ${code}`);
	}

	// Optionnel : SKI-110 n'est pas encore implémenté, on informe sans échouer.
	const ingest = await status('/api/admin/projects/preflight-probe/ingest');
	console.log(
		`  ${ingest === 404 ? 'INFO' : ' OK '}  SKI-110 (forçage ingestion) — ` +
			`${ingest === 404 ? 'pas encore déployé, les specs concernées se skipperont' : `→ ${ingest}`}`
	);
}

// ─── Base de données ─────────────────────────────────────────────────────

async function connect() {
	for (const ssl of [{ rejectUnauthorized: false }, false]) {
		const client = new pg.Client({ connectionString: PG_URL, ssl, connectionTimeoutMillis: 10000 });
		try {
			await client.connect();
			return client;
		} catch (e) {
			await client.end().catch(() => {});
			if (ssl === false) throw e;
		}
	}
}

async function checkDb() {
	let host = '(illisible)';
	try {
		const u = new URL(PG_URL);
		host = `${u.hostname}:${u.port || 5432}${u.pathname}`;
	} catch {
		/* on n'imprime jamais l'URL brute : elle porte le mot de passe */
	}
	console.log(`\nBase — ${host}`);

	let client;
	try {
		client = await connect();
	} catch (e) {
		// `pg` remonte un AggregateError dont le `message` est vide quand la
		// connexion est refusée : l'information est dans `code`, ou dans celui
		// des erreurs agrégées. Sans ça la ligne d'échec n'affichait rien.
		const codes = [
			...new Set(
				[e.code, ...(Array.isArray(e.errors) ? e.errors.map((x) => x?.code) : [])].filter(
					Boolean
				)
			)
		];
		const msg = String(e.message || codes.join(', ') || 'connexion impossible');
		check('joignable', false, msg);

		// Deux échecs très différents se ressemblent en sortie brute : le tunnel
		// fermé (localhost qui refuse) et l'hôte interne au provider (qui ne
		// résout pas). Dire lequel évite de chercher au mauvais endroit.
		if (codes.includes('ECONNREFUSED') && PG_URL.includes('localhost')) {
			console.log(
				"        → DATABASE_URL pointe sur localhost mais rien n'écoute : le tunnel\n" +
					'          SSH est fermé. Le rouvrir (voir qa/README.md) puis relancer.'
			);
		} else if (codes.includes('ENOTFOUND') || msg.includes('ENOTFOUND')) {
			console.log(
				"        → l'hôte ne résout pas : c'est un nom de service interne au provider.\n" +
					'          Ouvrir un tunnel SSH et pointer DATABASE_URL sur localhost.'
			);
		}
		return;
	}
	check('joignable', true);

	try {
		const { rows } = await client.query(
			'SELECT COALESCE(max(version), 0)::bigint v FROM _sqlx_migrations'
		);
		const v = Number(rows[0].v);
		check(`migrations ≥ ${MIN_MIGRATION}`, v >= MIN_MIGRATION, `dernière = ${v}`);
	} catch (e) {
		check(`migrations ≥ ${MIN_MIGRATION}`, false, e.message);
	}

	const { rows: t } = await client.query(
		`SELECT to_regclass('public.validator_applications') IS NOT NULL AS ok`
	);
	check('table validator_applications', t[0].ok);

	const { rows: c } = await client.query(
		`SELECT bool_or(pg_get_constraintdef(oid) LIKE '%challenge_validator%') AS ok
		   FROM pg_constraint WHERE conrelid = 'user_capabilities'::regclass AND contype = 'c'`
	);
	check('enum capability accepte challenge_validator:*', c[0].ok === true);

	const { rows: s } = await client.query(
		`SELECT bool_or(pg_get_constraintdef(oid) LIKE '%pending_validation%') AS ok
		   FROM pg_constraint WHERE conrelid = 'project_slices'::regclass AND contype = 'c'`
	);
	check('statuts de slice P26 (pending_validation, ci_green)', s[0].ok === true);

	// Contexte, pas un critère : les specs seedent leurs propres fixtures, mais
	// savoir sur quoi on écrit évite les mauvaises surprises.
	const { rows: n } = await client.query(
		`SELECT (SELECT count(*) FROM users) u,
		        (SELECT count(*) FROM users WHERE role = 'admin') a,
		        (SELECT count(*) FROM projects) p`
	);
	console.log(
		`  INFO  volumétrie — users=${n[0].u} (dont ${n[0].a} admin) projects=${n[0].p}`
	);
	if (Number(n[0].a) === 0) {
		console.log("        → aucun compte admin : bootstrap-admin.mjs devra le créer.");
	}

	await client.end();
}

// ─── Verdict ─────────────────────────────────────────────────────────────

await checkBackend();
await checkDb();

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length === 0) {
	console.log('PRÊT — les specs P26 peuvent valider quelque chose.');
	console.log('Étape suivante : node e2e/setup/bootstrap-admin.mjs puis npm run test:e2e');
	process.exit(0);
}
console.log(`PAS PRÊT — ${failed.length} contrôle(s) en échec :`);
for (const f of failed) console.log(`  · ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
console.log('\nLancer les specs en l\'état donnerait un vert trompeur : elles se skipperaient.');
process.exit(1);
