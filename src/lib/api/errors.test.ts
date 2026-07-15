import { describe, expect, it } from 'vitest';
import { SkilluError } from './client';
import { errorMessage } from './errors';

describe('errorMessage', () => {
	it('returns SkilluError message when set', () => {
		const err = new SkilluError('ADMIN_FORBIDDEN', 'Access denied', 403);
		expect(errorMessage(err)).toBe('Access denied');
	});

	it('returns plain Error message when set', () => {
		expect(errorMessage(new Error('Network down'))).toBe('Network down');
	});

	it('falls back to generic i18n key for unknown throwables', () => {
		expect(errorMessage(null)).toBe('Erreur');
		expect(errorMessage(undefined)).toBe('Erreur');
		expect(errorMessage('boom')).toBe('Erreur');
	});

	it('falls back when Error has empty message', () => {
		expect(errorMessage(new Error(''))).toBe('Erreur');
	});
});
