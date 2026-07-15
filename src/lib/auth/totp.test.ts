import { describe, expect, it } from 'vitest';
import {
	formatBackupCodesForDownload,
	isValidBackupCode,
	isValidTotpCode,
	normalizeBackupCode,
	normalizeTotpCode
} from './totp';

describe('isValidTotpCode', () => {
	it('accepts exactly 6 digits', () => {
		expect(isValidTotpCode('123456')).toBe(true);
	});
	it('trims surrounding whitespace', () => {
		expect(isValidTotpCode('  654321  ')).toBe(true);
	});
	it('rejects fewer than 6 digits', () => {
		expect(isValidTotpCode('12345')).toBe(false);
	});
	it('rejects more than 6 digits', () => {
		expect(isValidTotpCode('1234567')).toBe(false);
	});
	it('rejects non-digit characters', () => {
		expect(isValidTotpCode('12345a')).toBe(false);
		expect(isValidTotpCode('123 56')).toBe(false);
	});
});

describe('normalizeTotpCode', () => {
	it('strips non-digits', () => {
		expect(normalizeTotpCode(' 12 34-56 ')).toBe('123456');
	});
	it('caps at 6 characters', () => {
		expect(normalizeTotpCode('1234567890')).toBe('123456');
	});
});

describe('isValidBackupCode', () => {
	it('accepts dashed format', () => {
		expect(isValidBackupCode('ABCD-EFGH-IJKL-MNOP')).toBe(true);
	});
	it('accepts continuous format', () => {
		expect(isValidBackupCode('ABCDEFGHIJKLMNOP')).toBe(true);
	});
	it('accepts lowercase', () => {
		expect(isValidBackupCode('abcd-efgh-ijkl-mnop')).toBe(true);
	});
	it('rejects wrong length', () => {
		expect(isValidBackupCode('ABCD-EFGH-IJKL')).toBe(false);
	});
	it('rejects invalid characters', () => {
		expect(isValidBackupCode('ABCD-EFG!-IJKL-MNOP')).toBe(false);
	});
});

describe('normalizeBackupCode', () => {
	it('uppercases and inserts dashes every 4 chars', () => {
		expect(normalizeBackupCode('abcdefghijklmnop')).toBe('ABCD-EFGH-IJKL-MNOP');
	});
	it('caps at 16 characters', () => {
		expect(normalizeBackupCode('abcdefghijklmnopQRSTUV')).toBe('ABCD-EFGH-IJKL-MNOP');
	});
	it('handles partial input without trailing dash', () => {
		expect(normalizeBackupCode('abcd')).toBe('ABCD');
		expect(normalizeBackupCode('abcde')).toBe('ABCD-E');
	});
});

describe('formatBackupCodesForDownload', () => {
	it('includes header and every code on its own line', () => {
		const codes = ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'];
		const out = formatBackupCodesForDownload(codes);
		expect(out).toContain('Skilluv admin — 2FA recovery codes');
		expect(out).toContain('AAAA-BBBB-CCCC-DDDD');
		expect(out).toContain('EEEE-FFFF-GGGG-HHHH');
		expect(out.split('\n').filter((l) => l.startsWith('AAAA')).length).toBe(1);
	});
});
