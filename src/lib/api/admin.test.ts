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
