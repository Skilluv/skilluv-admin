/**
 * The enterprise-product register — `enterprise_products.rs` and the
 * entitlement grant that hangs off it in `talent_line.rs`.
 *
 * Four routes, and the table underneath is the one every product line writes
 * into. Ten backend modules insert a row here when a company buys anything,
 * carrying `source_table` and `source_id` back to the thing itself. That is
 * why a renewals list can exist at all without joining eighteen tables.
 *
 * ## Why the renewals list includes dates that have passed
 *
 * A renewal date in the past with the engagement still active is not a stale
 * row — it is the case somebody most needs to see, because it means nobody
 * asked. The backend sorts those first and this client does not filter them
 * out.
 */
import type {
	ApiResponse,
	EnterpriseProduct,
	EnterpriseProductRenewal,
	EntitlementGrant,
	ProductStatusBody,
	RecordProductBody
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const contractsApi = {
	/** Sixty days by default server-side, which is roughly the notice an
	 *  annual contract needs. Clamped to 1..365. */
	renewals(params?: { within_days?: number }) {
		return api.get<ApiResponse<{ renewals: EnterpriseProductRenewal[] }>>(
			'/admin/enterprise-products/renewals',
			params as Record<string, number>
		);
	},

	productsOf(enterpriseId: string) {
		return api.get<ApiResponse<{ products: EnterpriseProduct[] }>>(
			`/admin/enterprises/${enterpriseId}/products`
		);
	},

	/** Refused for a recurring product with no `renews_at`. The database
	 *  trigger enforces it too, but the route says it first, in words the
	 *  person filling the form can act on. */
	recordProduct(enterpriseId: string, body: RecordProductBody) {
		return api.post<ApiResponse<{ product: EnterpriseProduct }>>(
			`/admin/enterprises/${enterpriseId}/products`,
			body
		);
	},

	/** Cancelling requires a reason. `renews_at` pushes the next date out and
	 *  is only meaningful while the engagement is active. */
	setStatus(productId: string, body: ProductStatusBody) {
		return api.post<ApiResponse<{ product: EnterpriseProduct }>>(
			`/admin/enterprise-products/${productId}/status`,
			body
		);
	},

	/** Upserts on (product, kind). A flag carries no amount and an
	 *  amount-carrying kind requires one — the backend refuses either
	 *  mistake rather than storing a nonsense entitlement. */
	grantEntitlement(productId: string, grant: EntitlementGrant) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/enterprise-products/${productId}/entitlements`,
			grant
		);
	}
};

/** The five values `set_status` accepts. */
export const PRODUCT_STATUSES = [
	'pending',
	'active',
	'completed',
	'cancelled',
	'lapsed'
] as const;

/** Cancelling is the one that demands an explanation. Stated here so the
 *  form and any future caller agree on which. */
export function statusNeedsReason(status: string): boolean {
	return status === 'cancelled';
}
