/**
 * Every literal key a screen asks for exists.
 *
 * `i18n.t` takes a `string` and returns the key itself when it finds nothing,
 * so a typo or a key added to `en.ts` under the wrong parent renders as
 * `admin.contracts.showActions` on the page and breaks no build. TypeScript
 * cannot catch it: the three locales are typed `Translations` and so agree
 * with each other by construction, but nothing ties a call site to that
 * interface.
 *
 * Only literal keys are checked. Keys built by interpolation —
 * `admin.enterprises.types.${t}` and its handful of siblings — are covered by
 * the vocabulary constants they interpolate, which are typed.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { en } from './en';

function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) svelteFiles(p, out);
		else if (p.endsWith('.svelte')) out.push(p);
	}
	return out;
}

function resolve(key: string): unknown {
	let value: unknown = en;
	for (const part of key.split('.')) {
		if (value && typeof value === 'object' && part in (value as object)) {
			value = (value as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	return value;
}

describe('i18n — the keys the screens ask for', () => {
	it('resolves every literal key to a string', () => {
		const missing: string[] = [];
		for (const file of [...svelteFiles('src/routes'), ...svelteFiles('src/lib/components')]) {
			const source = fs.readFileSync(file, 'utf8');
			for (const match of source.matchAll(/i18n\.t\('([^']+)'/g)) {
				// A key that lands on a nested object is as broken as one that
				// lands on nothing — it renders `[object Object]`.
				if (typeof resolve(match[1]) !== 'string') missing.push(`${file}: ${match[1]}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('would notice a key that does not exist', () => {
		expect(resolve('admin.contracts.aKeyNobodyWrote')).toBeUndefined();
		expect(typeof resolve('admin.contracts.tabs')).not.toBe('string');
	});
});
