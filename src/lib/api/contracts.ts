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
	ApiPaginatedResponse,
	ApiResponse,
	ProductRegistryRow,
	EnterpriseProduct,
	EnterpriseProductRenewal,
	EntitlementGrant,
	ProductStatusBody,
	RecordProductBody
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const contractsApi = {
	/**
	 * Every product any enterprise holds, with the id of the row it came
	 * from.
	 *
	 * The route SKI-354 asked for, and the one that ends the failure it
	 * described: `source_id` **is** the `{id}` twenty-one write routes take,
	 * and `source_table` says which module owns it. Both were already in the
	 * table; nothing served them.
	 *
	 * Deliberately not filtered the way `renewals` is. That one answers "what
	 * is about to lapse" and filters `status = 'active' AND renews_at IS NOT
	 * NULL` to do it; a register inheriting those filters would hide the
	 * `pending` product waiting to be activated, which is the row somebody
	 * came here for.
	 */
	registry(params?: {
		product_type?: string;
		status?: string;
		enterprise_id?: string;
		q?: string;
		page?: number;
		per_page?: number;
	}) {
		return api.get<ApiPaginatedResponse<ProductRegistryRow>>(
			'/admin/enterprise-products',
			params as Record<string, string | number>
		);
	},

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
