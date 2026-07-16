import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function okJson<T>(body: T) {
	return {
		ok: true,
		status: 200,
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

describe('adminApi.resetUser2fa', () => {
	it('POSTs to /admin/users/:id/reset-2fa with reason body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { reset: true, user_id: 'u1', message: 'ok' } })
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.resetUser2fa('u1', 'compromise suspected');

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/reset-2fa');
		expect(init.method).toBe('POST');
		expect(init.body).toBe(JSON.stringify({ reason: 'compromise suspected' }));
		expect(res.data.reset).toBe(true);
	});
});

describe('adminApi.banUser', () => {
	it('POSTs to /admin/users/:id/ban with reason body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { message: 'banned', reason: 'spam' } })
		);
		const { adminApi } = await import('./admin');
		await adminApi.banUser('u2', 'spam');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u2/ban');
		expect(init.body).toBe(JSON.stringify({ reason: 'spam' }));
	});
});

describe('adminApi.dissolveGuild', () => {
	it('sends reason when provided', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { dissolved: true } }));
		const { adminApi } = await import('./admin');
		await adminApi.dissolveGuild('g1', 'inactive 90 days');
		const [, init] = fetchMock.mock.calls[0];
		expect(init.body).toBe(JSON.stringify({ reason: 'inactive 90 days' }));
	});

	it('omits reason when not provided (backward compat)', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { dissolved: true } }));
		const { adminApi } = await import('./admin');
		await adminApi.dissolveGuild('g2');
		const [, init] = fetchMock.mock.calls[0];
		expect(init.body).toBe(JSON.stringify({}));
	});
});

describe('adminApi capabilities (P18.4)', () => {
	it('listUserCapabilities GETs /users/:id/capabilities (public route)', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { user_id: 'u1', capabilities: [] } })
		);
		const { adminApi } = await import('./admin');
		await adminApi.listUserCapabilities('u1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/users/u1/capabilities');
		expect(init.method ?? 'GET').toBe('GET');
	});

	it('grantCapability POSTs with capability + granted_reason + expires_at', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { granted: true, user_id: 'u1', capability: 'mentor' } })
		);
		const { adminApi } = await import('./admin');
		await adminApi.grantCapability('u1', {
			capability: 'mentor',
			granted_reason: 'Q3 promotion after 12 attestations',
			expires_at: '2027-01-01T00:00:00.000Z'
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/capabilities');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({
			capability: 'mentor',
			granted_reason: 'Q3 promotion after 12 attestations',
			expires_at: '2027-01-01T00:00:00.000Z'
		});
	});

	it('grantCapability omits expires_at when not passed', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { granted: true, user_id: 'u1', capability: 'kyc_reviewer' } })
		);
		const { adminApi } = await import('./admin');
		await adminApi.grantCapability('u1', {
			capability: 'kyc_reviewer',
			granted_reason: 'staff nomination'
		});
		const [, init] = fetchMock.mock.calls[0];
		const body = JSON.parse(init.body);
		expect(body.expires_at).toBeUndefined();
		expect(body.capability).toBe('kyc_reviewer');
		expect(body.granted_reason).toBe('staff nomination');
	});

	it('revokeCapability DELETEs /admin/users/:id/capabilities/:cap with no body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { revoked: true, user_id: 'u1', capability: 'mentor' } })
		);
		const { adminApi } = await import('./admin');
		await adminApi.revokeCapability('u1', 'mentor');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/capabilities/mentor');
		expect(init.method).toBe('DELETE');
		expect(init.body).toBeUndefined();
	});
});
