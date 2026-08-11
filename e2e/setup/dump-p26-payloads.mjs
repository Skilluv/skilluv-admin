#!/usr/bin/env node
// Diagnostic : imprime la forme réelle des réponses P26 du backend déployé.
//
// Sert à confronter les types front (`src/lib/types/index.ts`, section P26 v2)
// à ce que l'API renvoie vraiment — la lecture du code Rust local ne suffit
// pas, l'arbre de travail peut différer du build déployé.
//
//   node e2e/setup/dump-p26-payloads.mjs
//
// Lecture seule. N'imprime aucun identifiant.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentCode } from './totp.mjs';
import { loadDotEnv } from './env.mjs';

loadDotEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = resolve(HERE, 'admin-credentials.json');
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';
const ORIGIN = 'http://localhost:5174';

if (!existsSync(CREDS_PATH)) {
	console.error('admin-credentials.json absent — lancer bootstrap-admin.mjs d\'abord.');
	process.exit(1);
}
const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));

let cookie = '';
async function call(method, path, body) {
	const headers = { Origin: ORIGIN };
	if (body) headers['Content-Type'] = 'application/json';
	if (cookie) headers.Cookie = cookie;
	const res = await fetch(`${BACKEND}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	});
	const set = res.headers.getSetCookie?.() || [];
	if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
	let json = null;
	try {
		json = await res.json();
	} catch {
		/* réponse non-JSON */
	}
	return { status: res.status, json };
}

// Login (mot de passe + TOTP), jamais imprimé.
let r = await call('POST', '/api/auth/login', {
	identifier: creds.email,
	password: creds.password
});
if (r.status !== 200) {
	r = await call('POST', '/api/auth/login', {
		identifier: creds.email,
		password: creds.password,
		totp_code: currentCode(creds.totp_secret_base32)
	});
}
if (r.status !== 200) {
	console.error(`login échoué: ${r.status}`, JSON.stringify(r.json)?.slice(0, 300));
	process.exit(1);
}
console.log('login OK\n');

/** Imprime la forme d'une valeur : clés et types, pas les données. */
function shape(v, depth = 0, key = '') {
	const pad = '  '.repeat(depth);
	if (Array.isArray(v)) {
		console.log(`${pad}${key}: array(${v.length})`);
		if (v.length) shape(v[0], depth + 1, '[0]');
		return;
	}
	if (v && typeof v === 'object') {
		if (key) console.log(`${pad}${key}: object`);
		for (const [k, val] of Object.entries(v)) {
			if (val && typeof val === 'object') shape(val, depth + 1, k);
			else console.log(`${'  '.repeat(depth + 1)}${k}: ${val === null ? 'null' : typeof val}`);
		}
		return;
	}
	console.log(`${pad}${key}: ${v === null ? 'null' : typeof v}`);
}

const endpoints = [
	['GET', '/api/admin/validators/stats?window_days=90'],
	['GET', '/api/admin/validators/collusion-matrix?window_days=90&min_count=5'],
	['GET', '/api/admin/validator-applications?status=pending&per_page=5']
];

for (const [method, path] of endpoints) {
	const res = await call(method, path);
	console.log('─'.repeat(70));
	console.log(`${method} ${path} → ${res.status}`);
	if (res.json) shape(res.json.data ?? res.json, 0, 'data');
	// Un échantillon brut du premier élément aide à voir les valeurs de
	// discrimination (ex : `active_domains` contient-il le préfixe ?).
	const first =
		res.json?.data?.validators?.[0] ?? res.json?.data?.matrix?.[0] ?? res.json?.data?.[0];
	if (first) console.log('\nexemple:', JSON.stringify(first, null, 2).slice(0, 900));
	console.log('');
}
