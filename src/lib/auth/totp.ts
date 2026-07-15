const TOTP_CODE_PATTERN = /^\d{6}$/;
const BACKUP_CODE_PATTERN = /^[A-Z0-9]{4}(-?[A-Z0-9]{4}){3}$/i;

export function isValidTotpCode(raw: string): boolean {
	return TOTP_CODE_PATTERN.test(raw.trim());
}

export function normalizeTotpCode(raw: string): string {
	return raw.replace(/\D+/g, '').slice(0, 6);
}

export function isValidBackupCode(raw: string): boolean {
	return BACKUP_CODE_PATTERN.test(raw.trim());
}

export function normalizeBackupCode(raw: string): string {
	const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
	return cleaned.replace(/(.{4})(?=.)/g, '$1-');
}

export function formatBackupCodesForDownload(codes: string[]): string {
	const lines = [
		'Skilluv admin — 2FA recovery codes',
		'Generated: ' + new Date().toISOString(),
		'Each code works only once. Store this file securely.',
		'',
		...codes
	];
	return lines.join('\n');
}
