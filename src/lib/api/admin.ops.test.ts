/**
 * ADM-M5+ — smoke tests for ops (sweep + admin GDPR export).
 */
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

describe('adminApi.sweepProofHooks (ADM-M5+)', () => {
	it('POSTs to /admin/proof-hooks/sweep with within_days query', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { within_days: 7, processed_count: 12, user_ids: [] }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.sweepProofHooks(7, false);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/proof-hooks/sweep?within_days=7');
		expect(init.method).toBe('POST');
	});

	it('with dryRun appends dry_run=true', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { dry_run: true, within_days: 30, would_process_count: 42 },
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.sweepProofHooks(30, true);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/proof-hooks/sweep?within_days=30&dry_run=true');
		expect((res.data as { would_process_count: number }).would_process_count).toBe(42);
	});
});

describe('adminApi.triggerUserGdprExport (ADM-M5+)', () => {
	it('POSTs to /admin/users/{id}/gdpr-export with reason body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { status: 'queued', target_user_id: 'u1', message: 'queued' },
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.triggerUserGdprExport('u1', {
			reason: 'user requested via support ticket #1234'
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/gdpr-export');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({
			reason: 'user requested via support ticket #1234'
		});
		expect(res.data.status).toBe('queued');
	});
});
