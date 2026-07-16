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

describe('adminApi fraud (P14.5)', () => {
	it('fraudQueue GETs /admin/fraud/queue with threshold + limit query', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { flagged_deliverables: [], suspected_users: [] } })
		);
		const { adminApi } = await import('./admin');
		await adminApi.fraudQueue({ threshold: 0.85, limit: 100 });
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/fraud/queue?threshold=0.85&limit=100');
	});

	it('markDeliverableValid POSTs with no body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { marked_valid: true } }));
		const { adminApi } = await import('./admin');
		await adminApi.markDeliverableValid('d1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/fraud/deliverables/d1/mark-valid');
		expect(init.method).toBe('POST');
		expect(init.body).toBeUndefined();
	});

	it('revokeDeliverable POSTs with {reason} when provided', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { revoked: true } }));
		const { adminApi } = await import('./admin');
		await adminApi.revokeDeliverable('d1', 'lifted from stack overflow');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/fraud/deliverables/d1/revoke');
		expect(JSON.parse(init.body)).toEqual({ reason: 'lifted from stack overflow' });
	});

	it('markUserValid POSTs with no body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { marked_valid: true } }));
		const { adminApi } = await import('./admin');
		await adminApi.markUserValid('u1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/fraud/users/u1/mark-valid');
		expect(init.method).toBe('POST');
	});

	it('scanDeliverable POSTs with threshold + window_days query', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					deliverable_id: 'd1',
					best_match_id: null,
					best_score: 0.42,
					compared_count: 12
				}
			})
		);
		const { adminApi } = await import('./admin');
		await adminApi.scanDeliverable('d1', { threshold: 0.8, window_days: 60 });
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/fraud/scan-deliverable/d1?threshold=0.8&window_days=60');
	});

	it('detectMultiAccounts POSTs body with window_hours + min_group_size', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { groups_detected: 0, users_flagged: 0, groups: [] } })
		);
		const { adminApi } = await import('./admin');
		await adminApi.detectMultiAccounts({ window_hours: 48, min_group_size: 4 });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/fraud/detect-multi-accounts');
		expect(JSON.parse(init.body)).toEqual({ window_hours: 48, min_group_size: 4 });
	});

	it('llmEvaluateDeliverable POSTs with no body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					deliverable_id: 'd1',
					new_status: 'verified',
					score: 0.82,
					llm_reachable: true,
					notes: null
				}
			})
		);
		const { adminApi } = await import('./admin');
		await adminApi.llmEvaluateDeliverable('d1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/fraud/llm-evaluate/d1');
		expect(init.method).toBe('POST');
		expect(init.body).toBeUndefined();
	});
});
