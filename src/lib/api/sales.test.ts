/**
 * Sales pipeline and revenue — client contract.
 *
 * Nine routes, and the two things worth pinning are the shapes that would
 * fail silently: a `lost` move that forgets its reason (the backend rejects
 * it, so the screen must not send it), and money that arrives as a string
 * and must stay one.
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

describe('salesApi — the pipeline', () => {
	it('GETs the pipeline', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { opportunities: [], weighted_value: '0.00', weighted_value_note: 'n' },
				meta: {}
			})
		);
		const { salesApi } = await import('./sales');
		await salesApi.pipeline();
		expect(lastUrl()).toBe('/api/admin/sales/opportunities');
	});

	it('keeps the weighted total a string and carries the note beside it', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					opportunities: [],
					weighted_value: '12500.75',
					weighted_value_note: 'Somme ponderee par des poids choisis a priori.'
				},
				meta: {}
			})
		);
		const { salesApi } = await import('./sales');
		const res = await salesApi.pipeline();
		// Parsing this into a float is how a reconciliation screen grows a
		// rounding difference. It is displayed as it arrived.
		expect(res.data.weighted_value).toBe('12500.75');
		// The number is a sum of guesses and the backend says so. A screen
		// showing the figure without the note would be presenting a forecast.
		expect(res.data.weighted_value_note).not.toBe('');
	});

	it('POSTs a new opportunity with only the org name required', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { opportunity: { id: 'o1' } }, meta: {} }));
		const { salesApi } = await import('./sales');
		await salesApi.openOpportunity({ org_name: 'Acme' });
		expect(lastUrl()).toBe('/api/admin/sales/opportunities');
		expect(lastBody()).toEqual({ org_name: 'Acme' });
	});

	it('GETs one opportunity with its activities', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { opportunity: { id: 'o1' }, activities: [] }, meta: {} })
		);
		const { salesApi } = await import('./sales');
		await salesApi.opportunity('o1');
		expect(lastUrl()).toBe('/api/admin/sales/opportunities/o1');
	});
});

describe('salesApi — moving a stage', () => {
	it('POSTs a stage with no reason when it is not a loss', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { opportunity: { id: 'o1', stage: 'won' } }, meta: {} })
		);
		const { salesApi } = await import('./sales');
		await salesApi.setStage('o1', 'won');
		expect(lastUrl()).toBe('/api/admin/sales/opportunities/o1/stage');
		// No `lost_reason` key at all, rather than one set to null: the
		// backend treats absence and null differently on several of these.
		expect(lastBody()).toEqual({ stage: 'won' });
	});

	it('carries the reason when the move is a loss', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { opportunity: { id: 'o1', stage: 'lost' } }, meta: {} })
		);
		const { salesApi } = await import('./sales');
		await salesApi.setStage('o1', 'lost', 'went with an agency');
		expect(lastBody()).toEqual({ stage: 'lost', lost_reason: 'went with an agency' });
	});

	it('POSTs an activity with its next step', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { activity_id: 'a1' }, meta: {} }));
		const { salesApi } = await import('./sales');
		await salesApi.recordActivity('o1', {
			kind: 'call',
			summary_md: 'walked through the pilot',
			next_step: 'send the quote',
			next_step_due_on: '2026-09-15'
		});
		expect(lastUrl()).toBe('/api/admin/sales/opportunities/o1/activities');
		expect(lastBody()).toEqual({
			kind: 'call',
			summary_md: 'walked through the pilot',
			next_step: 'send the quote',
			// A DATE column: a day with no time and no zone. Sending an
			// instant here would move it across midnight for half the world.
			next_step_due_on: '2026-09-15'
		});
	});
});

describe('salesApi — the lists an operator opens first', () => {
	it('GETs the overdue next steps', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { overdue: [] }, meta: {} }));
		const { salesApi } = await import('./sales');
		await salesApi.overdue();
		expect(lastUrl()).toBe('/api/admin/sales/overdue');
	});

	it('GETs renewals with an explicit window', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { renewals: [], within_days: 30 }, meta: {} })
		);
		const { salesApi } = await import('./sales');
		await salesApi.renewals({ within_days: 30 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/sales/renewals');
		expect(url.searchParams.get('within_days')).toBe('30');
	});

	it('GETs renewals unfiltered, letting the backend apply its 90-day default', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { renewals: [], within_days: 90 }, meta: {} })
		);
		const { salesApi } = await import('./sales');
		await salesApi.renewals();
		expect(lastUrl()).toBe('/api/admin/sales/renewals');
	});

	it('GETs a company file by enterprise id', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					products: [],
					spend_by_stream: [],
					renewals: [],
					not_yet_used_in_familiar_pillars: []
				},
				meta: {}
			})
		);
		const { salesApi } = await import('./sales');
		await salesApi.enterpriseFile('e1');
		expect(lastUrl()).toBe('/api/admin/sales/enterprises/e1');
	});
});

describe('salesApi — revenue', () => {
	it('GETs the streams over a window', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { streams: [], window_days: 365, live_streams: 0, planned_streams: 27 },
				meta: {}
			})
		);
		const { salesApi } = await import('./sales');
		const res = await salesApi.revenueStreams({ days: 365 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/revenue/streams');
		expect(url.searchParams.get('days')).toBe('365');
		// The gap between these two is the point of the endpoint: a catalogue
		// that hid the planned streams would read as twenty-seven live
		// revenue lines, which is the number of ideas.
		expect(res.data.planned_streams).toBe(27);
	});

	it('GETs the pillar totals, recurring split out', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					pillars: [{ pillar: 'talent', total: '900.00', recurring: '400.00', entries: 3 }],
					window_days: 365
				},
				meta: {}
			})
		);
		const { salesApi } = await import('./sales');
		const res = await salesApi.revenueByPillar({ days: 365 });
		expect(lastUrl()).toContain('/api/admin/revenue/by-pillar');
		// Kept apart because a business that reads its one-off revenue as
		// run-rate overstates itself.
		expect(res.data.pillars[0].recurring).toBe('400.00');
		expect(res.data.pillars[0].total).toBe('900.00');
	});
});

describe('the stage vocabulary', () => {
	it('lists the six stages the backend accepts, in pipeline order', async () => {
		const { SALES_STAGES } = await import('./sales');
		expect(SALES_STAGES).toEqual([
			'lead',
			'qualified',
			'proposal',
			'negotiation',
			'won',
			'lost'
		]);
	});

	it('treats won and lost as closed and nothing else', async () => {
		const { SALES_STAGES, isClosed } = await import('./sales');
		expect(SALES_STAGES.filter(isClosed)).toEqual(['won', 'lost']);
	});

	it('mirrors the server stage weights', async () => {
		const { stageWeight } = await import('./sales');
		// A mirror of a server constant, so it is pinned. It drives display
		// only — the weighted total on screen is the server's own figure,
		// never one recomputed here.
		expect(stageWeight('lead')).toBe(0.1);
		expect(stageWeight('qualified')).toBe(0.25);
		expect(stageWeight('proposal')).toBe(0.5);
		expect(stageWeight('negotiation')).toBe(0.75);
		expect(stageWeight('won')).toBe(1);
		expect(stageWeight('lost')).toBe(0);
	});

	it('lists the six activity kinds', async () => {
		const { SALES_ACTIVITY_KINDS } = await import('./sales');
		expect(SALES_ACTIVITY_KINDS).toEqual([
			'call',
			'email',
			'meeting',
			'demo',
			'proposal_sent',
			'note'
		]);
	});
});
