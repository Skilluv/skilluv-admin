// One-time bootstrap of the E2E admin test user against the local staging backend.
// Idempotent — re-running when credentials already exist just re-verifies login.
//
// Produces `e2e/setup/admin-credentials.json` (gitignored) with:
//   { email, username, password, totp_secret_base32 }
//
// Prereqs: backend running on :3001, DB fresh (or admin not yet created).

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { currentCode } from './totp.mjs';
import { assertConsistentTargets, loadDotEnv } from './env.mjs';

loadDotEnv();
// Avant toute chose : ce script inscrit un compte via BACKEND_URL puis
// l'élève via DATABASE_URL. Si les deux ne désignent pas le même
// environnement, le compte est créé quelque part où rien ne l'élèvera.
assertConsistentTargets('bootstrap-admin');

const HERE = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = resolve(HERE, 'admin-credentials.json');

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';
const PG_URL = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

// Compte dédié aux tests, distinct de l'admin humain : il est créé, élevé et
// réutilisé par la suite, et on ne veut pas qu'un run E2E touche au compte
// réel. Les valeurs sont surchargeables par l'environnement pour qu'aucun
// identifiant ne soit figé dans le dépôt — le défaut ci-dessous ne vaut que
// pour une base de test jetable.
const ADMIN = {
	email: process.env.E2E_ADMIN_EMAIL || 'e2e-admin@skilluv.test',
	username: process.env.E2E_ADMIN_USERNAME || 'e2eadmin',
	password: process.env.E2E_ADMIN_PASSWORD || 'E2eTestAdmin!2026',
	first_name: 'E2e',
	last_name: 'Admin',
	skill_domain: 'code',
	country: 'FR',
	terms_accepted: true
};

// Origin required for /api/admin/* — matches localhost:5174 (admin dev origin).
const ORIGIN = 'http://localhost:5174';

async function apiPost(path, body, cookieJar = {}) {
	const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
	if (cookieJar.cookie) headers.Cookie = cookieJar.cookie;
	const res = await fetch(`${BACKEND}${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	const setCookie = res.headers.getSetCookie?.() || [];
	if (setCookie.length) {
		cookieJar.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
	}
	const text = await res.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = { raw: text };
	}
	return { status: res.status, body: json, cookieJar };
}

async function register(jar) {
	const r = await apiPost('/api/auth/register', ADMIN, jar);
	if (r.status === 200 || r.status === 201) return { created: true, cookieJar: r.cookieJar };
	// Already exists → we'll just log in
	if (r.status === 400 && /already exists/i.test(JSON.stringify(r.body))) {
		return { created: false };
	}
	throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
}

async function grantAdmin() {
	const client = new pg.Client({ connectionString: PG_URL });
	await client.connect();
	try {
		const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN.email]);
		if (!rows.length) throw new Error('User not found after register');
		const userId = rows[0].id;
		await client.query("UPDATE users SET role = 'admin', email_verified = TRUE WHERE id = $1", [userId]);
		await client.query(
			`INSERT INTO user_capabilities (user_id, capability, granted_reason)
			 VALUES ($1, 'admin', 'e2e_bootstrap')
			 ON CONFLICT DO NOTHING`,
			[userId]
		);
		return userId;
	} finally {
		await client.end();
	}
}

async function login(jar, totpCode = null) {
	const body = { identifier: ADMIN.email, password: ADMIN.password };
	if (totpCode) body.totp_code = totpCode;
	const r = await apiPost('/api/auth/login', body, jar);
	if (r.status !== 200) {
		throw new Error(`login failed: ${r.status} ${JSON.stringify(r.body)}`);
	}
	return r;
}

async function setupTotp(jar) {
	const r = await apiPost('/api/auth/totp/setup', {}, jar);
	if (r.status !== 200) throw new Error(`totp/setup: ${r.status} ${JSON.stringify(r.body)}`);
	const secret = r.body?.data?.secret_base32 || r.body?.secret_base32;
	if (!secret) throw new Error(`no secret_base32 in response: ${JSON.stringify(r.body)}`);
	return secret;
}

async function enableTotp(jar, secret) {
	const code = currentCode(secret);
	const r = await apiPost('/api/auth/totp/enable', { code }, jar);
	if (r.status !== 200) throw new Error(`totp/enable: ${r.status} ${JSON.stringify(r.body)}`);
}

async function main() {
	if (existsSync(CREDS_PATH)) {
		console.log(`admin-credentials.json already exists — verifying login`);
		const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
		const jar = {};
		await login(jar, currentCode(creds.totp_secret_base32));
		console.log('✅ existing admin creds still valid');
		return;
	}

	console.log(`Bootstrapping E2E admin against ${BACKEND}`);
	const jar = {};
	const { created } = await register(jar);
	console.log(created ? '→ user created' : '→ user already existed');

	const userId = await grantAdmin();
	console.log(`→ elevated to admin (id=${userId})`);

	// Fresh login to ensure cookie reflects new role.
	await login(jar);
	console.log('→ logged in (pre-2FA)');

	const secret = await setupTotp(jar);
	console.log(`→ totp secret generated`);

	await enableTotp(jar, secret);
	console.log('→ totp enabled');

	writeFileSync(
		CREDS_PATH,
		JSON.stringify(
			{
				email: ADMIN.email,
				username: ADMIN.username,
				password: ADMIN.password,
				totp_secret_base32: secret
			},
			null,
			2
		)
	);
	console.log(`✅ wrote ${CREDS_PATH}`);
}

main().catch((e) => {
	console.error('❌ bootstrap failed:', e);
	process.exit(1);
});
