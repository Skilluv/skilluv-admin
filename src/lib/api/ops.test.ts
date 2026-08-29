/**
 * Ops practice — client contract.
 *
 * Two assertions carry the module: the cost verdict always sends its SLO
 * answer, and a verification is read as two separate outcomes.
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

describe('opsApi', () => {
	it('GETs the overdue remediation actions', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { overdue: [] }, meta: {} }));
		const { opsApi } = await import('./ops');
		await opsApi.overdueActions();
		expect(lastCall()[0]).toBe('/api/admin/ops/overdue-actions');
	});

	it('POSTs an objective verification with no body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { verified: true, attestation_issued: true }, meta: {} })
		);
		const { opsApi } = await import('./ops');
		await opsApi.verifyObjective('o1');
		expect(lastCall()[0]).toBe('/api/admin/ops/objectives/o1/verify');
		expect(lastCall()[1].method).toBe('POST');
	});

	it('always sends the SLO answer with a cost verdict', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { verified: true, attestation_issued: false }, meta: {} })
		);
		const { opsApi } = await import('./ops');
		await opsApi.verifyCostWork('c1', false);
		expect(lastCall()[0]).toBe('/api/admin/ops/cost-work/c1/verify');
		// A bill goes down when a service is switched off too. Verifying the
		// saving without this field would certify an outage with a spreadsheet,
		// so it is never optional and never defaulted client-side.
		expect(JSON.parse(lastCall()[1].body as string)).toEqual({
			service_still_meets_slo: false
		});
	});

	it('reads verified and attested as two different outcomes', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { verified: true, attestation_issued: false }, meta: {} })
		);
		const { opsApi } = await import('./ops');
		const res = await opsApi.verifyCostWork('c1', true);
		// An admin can confirm a piece of work and the domain can still decline
		// to attest it. Collapsing the two would tell somebody they earned
		// something they did not.
		expect(res.data.verified).toBe(true);
		expect(res.data.attestation_issued).toBe(false);
	});

	it('POSTs an artefact attestation with its basis', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { issued: true }, meta: {} }));
		const { opsApi } = await import('./ops');
		await opsApi.attestArtefact({
			user_id: 'u1',
			basis: 'ops_migration_completed',
			deliverable_id: 'd1',
			title: 'moved the primary off the single node',
			evidence_url: 'https://example/runbook'
		});
		expect(lastCall()[0]).toBe('/api/admin/ops/attestations/artefact');
		const body = JSON.parse(lastCall()[1].body as string);
		expect(body.basis).toBe('ops_migration_completed');
	});

	it('POSTs a community attestation with only a user and a reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { issued: true }, meta: {} }));
		const { opsApi } = await import('./ops');
		await opsApi.attestFeatured({ user_id: 'u1', reason: 'ran the on-call rota for a year' });
		expect(lastCall()[0]).toBe('/api/admin/ops/attestations/featured');
		// No evidence URL: the backend builds it from the same convention the
		// weekly featuring uses, rather than letting a second one drift in.
		expect(JSON.parse(lastCall()[1].body as string)).toEqual({
			user_id: 'u1',
			reason: 'ran the on-call rota for a year'
		});
	});

	it('lists the three artefact bases', async () => {
		const { OPS_ATTESTATION_BASES } = await import('./ops');
		expect(OPS_ATTESTATION_BASES).toEqual([
			'ops_infra_shipped',
			'ops_observability_stack_shipped',
			'ops_migration_completed'
		]);
	});
});
