/**
 * The finance line — client contract.
 *
 * Two properties are worth a test more than the paths are: the queues pass a
 * status filter through without inventing one, and the three advance verbs
 * are three distinct routes rather than one route with a status. Disbursing,
 * being repaid and being written off are different facts about money, and a
 * client that could send the wrong one would let an operator record a loss as
 * a repayment.
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

function lastCall(): [string, RequestInit] {
	return fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
}

function lastUrl(): string {
	return lastCall()[0];
}

function lastBody(): unknown {
	return JSON.parse(lastCall()[1].body as string);
}

describe('financeApi — the four queues', () => {
	it('reads each queue at its own path', async () => {
		const { financeApi } = await import('./finance');
		const expected = [
			['advances', '/api/admin/finance/advances'],
			['referrals', '/api/admin/finance/referrals'],
			['guaranteeClaims', '/api/admin/finance/guarantee-claims'],
			['partnerships', '/api/admin/finance/partnerships']
		] as const;
		for (const [method, path] of expected) {
			fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
			await (financeApi as unknown as Record<string, () => Promise<unknown>>)[method]();
			expect(lastUrl()).toBe(path);
		}
	});

	it('sends no query string when no status was asked for', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { advances: [] }, meta: {} }));
		const { financeApi } = await import('./finance');
		await financeApi.advances();
		// Not `?status=undefined`: the server's default ordering is the point
		// of these lists, and a bogus filter would empty them.
		expect(lastUrl()).toBe('/api/admin/finance/advances');
	});

	it('passes a status through when one was', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { advances: [] }, meta: {} }));
		const { financeApi } = await import('./finance');
		await financeApi.advances({ status: 'approved' });
		expect(lastUrl()).toBe('/api/admin/finance/advances?status=approved');
	});
});

describe('financeApi — the advance verbs are three routes, not one', () => {
	it('disburses, marks repaid and writes off at separate paths', async () => {
		const { financeApi } = await import('./finance');
		const calls = [
			[() => financeApi.disburseAdvance('a1'), '/api/admin/finance/advances/a1/disburse'],
			[() => financeApi.markAdvanceRepaid('a1'), '/api/admin/finance/advances/a1/repaid'],
			[() => financeApi.writeOffAdvance('a1'), '/api/admin/finance/advances/a1/write-off']
		] as const;
		for (const [call, path] of calls) {
			fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
			await call();
			expect(lastUrl()).toBe(path);
		}
		// Three routes, three URLs. A single route taking a status would make
		// recording a loss one typo away from recording a repayment.
		expect(new Set(calls.map(([, p]) => p)).size).toBe(3);
	});
});

describe('financeApi — the decisions', () => {
	it('carries an approval with its amount and the refusal without one', async () => {
		const { financeApi } = await import('./finance');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await financeApi.decideReferral('r1', {
			approved: true,
			approved_amount: '15000.00',
			monthly_premium: '450.00',
			note: 'the partner confirmed the file'
		});
		expect(lastUrl()).toBe('/api/admin/finance/referrals/r1/decision');
		expect(lastBody()).toEqual({
			approved: true,
			approved_amount: '15000.00',
			monthly_premium: '450.00',
			note: 'the partner confirmed the file'
		});

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await financeApi.decideReferral('r2', { approved: false, note: 'out of scope' });
		// A refusal carries no amount at all — not a zero, which would read as
		// an approval of nothing.
		expect(lastBody()).toEqual({ approved: false, note: 'out of scope' });
	});

	it('creates and settles a guarantee claim in the one call', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { financeApi } = await import('./finance');
		await financeApi.honourGuaranteeClaim({
			user_id: 'u1',
			invoice_id: 'i1',
			amount: '800.00',
			reason: 'the client disappeared after acceptance'
		});
		// There is no second route. A guarantee that needed two decisions
		// would be a guarantee somebody waits on.
		expect(lastUrl()).toBe('/api/admin/finance/guarantee-claims');
	});

	it('opens a partnership as a draft and activates it separately', async () => {
		const { financeApi } = await import('./finance');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await financeApi.openPartnership({
			partner_org: 'Banque X',
			kind: 'lender',
			countries: ['SN', 'CI'],
			commission_percent: '2.5',
			regulatory_basis: 'agreed intermediary, BCEAO register 4412'
		});
		expect(lastUrl()).toBe('/api/admin/finance/partnerships');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await financeApi.activatePartnership('p1');
		expect(lastUrl()).toBe('/api/admin/finance/partnerships/p1/activate');
	});
});
