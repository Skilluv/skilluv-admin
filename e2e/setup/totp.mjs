import { TOTP, Secret } from 'otpauth';

// Backend uses the totp-rs default: SHA1, 6 digits, 30s period, RFC 6238.
export function currentCode(secretBase32) {
	const totp = new TOTP({
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromBase32(secretBase32)
	});
	return totp.generate();
}
