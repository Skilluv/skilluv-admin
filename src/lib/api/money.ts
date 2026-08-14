import type { ApiResponse } from '$types';
import { createApiClient } from './client';

const api = createApiClient();

/**
 * The figures worth waking up to.
 *
 * Deliberately small. A dashboard with forty numbers is one nobody reads,
 * and each of these is a count that should be zero or near it.
 */
export interface MoneyOverview {
	/** Paid, and the thing paid for does not exist. The worst state here. */
	paid_but_undelivered: number;
	payments_pending: number;
	payouts_pending: number;
	payouts_failed_today: number;
	disputes_awaiting_decision: number;
	notifications_abandoned: number;
	/** Accounts whose running total disagrees with their own entries. Must be zero. */
	ledger_snapshot_drift: number;
	provider_positions: ProviderPosition[];
}

export interface ProviderPosition {
	account_code: string;
	currency: string;
	/** Decimal string. Parsing it into a number is how money gets rounded. */
	balance: string;
}

export interface PaymentRow {
	id: string;
	subject_type: string;
	subject_id: string;
	provider: string;
	method: string;
	operator: string | null;
	amount: string;
	currency: string;
	status: string;
	/** Theirs, for looking the charge up in the provider's own dashboard. */
	provider_reference: string | null;
	/** Ours, which is what a poller recovers a lost payment by. */
	merchant_reference: string | null;
	failure_reason: string | null;
	created_at: string;
	succeeded_at: string | null;
	/** Null on a succeeded payment means money taken and nothing given. */
	fulfilled_at: string | null;
	check_count: number;
}

export interface PayoutRow {
	id: string;
	user_id: string;
	provider: string;
	rail: string;
	amount: string;
	currency: string;
	status: string;
	/** Masked at write time. Enough to recognise, not enough to use. */
	destination_masked: string | null;
	provider_reference: string | null;
	failure_reason: string | null;
	created_at: string;
	settled_at: string | null;
	/** A high count on a still-pending payout means it will not resolve itself. */
	check_count: number;
}

export interface RouteRow {
	id: string;
	/** `in` for collection, `out` for payout. */
	direction: 'in' | 'out';
	country: string | null;
	currency: string;
	method: string;
	provider: string;
	priority: number;
	enabled: boolean;
	notes: string | null;
}

export interface MethodRow {
	id: string;
	provider: string;
	country: string;
	currency: string;
	operator: string;
	label: string;
	provider_mode: string;
	supports_inline: boolean;
	enabled: boolean;
	sort_order: number;
}

export interface MoneyQuery {
	status?: string;
	/** Only rows where money arrived and nothing was delivered. */
	undelivered?: boolean;
	page?: number;
	per_page?: number;
}

export const moneyApi = {
	overview() {
		return api.get<ApiResponse<MoneyOverview>>('/admin/money/overview');
	},

	payments(params?: MoneyQuery) {
		return api.get<{ data: { payments: PaymentRow[] } }>(
			'/admin/money/payments',
			params as Record<string, string | number | boolean>
		);
	},

	payouts(params?: MoneyQuery) {
		return api.get<{ data: { payouts: PayoutRow[] } }>(
			'/admin/money/payouts',
			params as Record<string, string | number | boolean>
		);
	},

	routes() {
		return api.get<{ data: { routes: RouteRow[] } }>('/admin/money/routes');
	},

	/**
	 * Open or close one corridor.
	 *
	 * `direction` is required rather than inferred: the two tables have
	 * separate id spaces, and guessing would eventually close the wrong one.
	 */
	toggleRoute(id: string, enabled: boolean, direction: 'in' | 'out') {
		return api.post<{ data: { enabled: boolean } }>(`/admin/money/routes/${id}/toggle`, {
			enabled,
			direction
		});
	},

	methods() {
		return api.get<{ data: { methods: MethodRow[] } }>('/admin/money/methods');
	},

	toggleMethod(id: string, enabled: boolean) {
		return api.post<{ data: { enabled: boolean } }>(`/admin/money/methods/${id}/toggle`, {
			enabled
		});
	}
};

/** One contested dispute, waiting on a person. */
export interface AwaitingDispute {
	id: string;
	reason: string;
	recipient_response: string | null;
	amount: string;
	currency: string;
	created_at: string;
}

export const disputeQueueApi = {
	list() {
		return api.get<{ data: { disputes: AwaitingDispute[] } }>('/admin/disputes');
	},

	/**
	 * Decide a contested dispute.
	 *
	 * The note is not optional and is shown to both sides. The one who lost
	 * needs it more than the one who won.
	 */
	decide(id: string, inFavourOf: 'payer' | 'recipient', note: string) {
		return api.post<{ data: { status: string } }>(`/admin/disputes/${id}/decide`, {
			in_favour_of: inFavourOf,
			note
		});
	}
};

export interface PreviewableKind {
	kind: string;
	category: string;
	/** False when the catalogue forbids email for this kind. */
	sends_email: boolean;
	/** Locales with no translation. A non-empty list is a subject line that
	 *  would render as its own key. */
	untranslated: string[];
}

export interface PreviewIndex {
	kinds: PreviewableKind[];
	locales: string[];
	themes: string[];
}

export const emailPreviewApi = {
	index() {
		return api.get<ApiResponse<PreviewIndex>>('/admin/email-preview/index');
	},

	/**
	 * The URL of one rendered email.
	 *
	 * A URL rather than a fetch: the response is a whole HTML document, and
	 * it belongs in an iframe where its own styles cannot touch the admin
	 * page around it.
	 */
	url(kind: string, locale: string, theme: string): string {
		const q = new URLSearchParams({ kind, locale, theme });
		return `/api/admin/email-preview?${q.toString()}`;
	}
};
