/**
 * The data line — `data_line.rs`, admin half.
 *
 * Seven routes: three lists, three creations, and the acts that book money
 * (delivering a report, settling a licence period, taking a deployment live).
 *
 * ## What is deliberately not here
 *
 * There is no admin route that grants consent on somebody's behalf, and no
 * import path for consent. The module says so in its own header, and the
 * absence is load-bearing: everything this line sells describes people who
 * are not the customer, and the only thing standing between them and a
 * dataset is their own per-purpose, revocable agreement. If that ever needs
 * an admin override it should be hard to add, which is why nothing here
 * reaches for one.
 *
 * The cohort sizes endpoint is the honest counterpart. It answers "may we
 * publish anything at all from this purpose" before anybody writes a
 * contract against it.
 */
import type {
	ApiResponse,
	DataCohortsResponse,
	DataDeployment,
	DataDeploymentInput,
	DataLicence,
	DataLicenceInput,
	DataReport,
	DataReportInput,
	DataSettlement
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const dataApi = {
	// --- Cohorts ---

	/** How many people each purpose covers, and whether that clears the
	 *  floor. Read this before commissioning anything: a report drawn from
	 *  four people names those four, whatever its header says. */
	cohorts() {
		return api.get<ApiResponse<DataCohortsResponse>>('/admin/data/cohorts');
	},

	// --- Reports ---

	reports() {
		return api.get<ApiResponse<{ reports: DataReport[] }>>('/admin/data/reports');
	},

	commissionReport(input: DataReportInput) {
		return api.post<ApiResponse<{ report: DataReport }>>('/admin/data/reports', input);
	},

	/**
	 * Deliver a commissioned report and book its fee.
	 *
	 * `purpose` is named rather than inferred, and that is the whole point of
	 * the call: a report drawn from research consent and one drawn from
	 * commercial consent rest on different people. The backend refuses a
	 * delivery whose cohort is too small, and refuses a document URL that is
	 * not https.
	 */
	deliverReport(id: string, documentUrl: string, purpose: string) {
		return api.post<ApiResponse<{ revenue_booked: string }>>(
			`/admin/data/reports/${id}/deliver`,
			{ document_url: documentUrl, purpose }
		);
	},

	// --- Licences ---

	licences() {
		return api.get<ApiResponse<{ licences: DataLicence[] }>>('/admin/data/licences');
	},

	/** Refused if too few people consent, if the purpose is blank, or if a
	 *  commercial licence pays the dataset nobody. */
	openLicence(input: DataLicenceInput) {
		return api.post<ApiResponse<{ licence: DataLicence }>>('/admin/data/licences', input);
	},

	/** Pay the people in a dataset their share for a period. Both dates are
	 *  bare days. Refused on an unsigned contract, a backwards period, or an
	 *  empty cohort. */
	settleLicence(id: string, periodStart: string, periodEnd: string) {
		return api.post<ApiResponse<DataSettlement>>(`/admin/data/licences/${id}/settle`, {
			period_start: periodStart,
			period_end: periodEnd
		});
	},

	// --- White-label deployments ---

	deployments() {
		return api.get<ApiResponse<{ deployments: DataDeployment[] }>>('/admin/data/deployments');
	},

	/** Refused on a recognition claim without a signed contract, or a host
	 *  that is already deployed. */
	provisionDeployment(input: DataDeploymentInput) {
		return api.post<ApiResponse<{ deployment: DataDeployment }>>(
			'/admin/data/deployments',
			input
		);
	},

	/** Books the setup fee. Refused without a signed contract. */
	goLive(id: string) {
		return api.post<ApiResponse<{ setup_fee_booked: string }>>(
			`/admin/data/deployments/${id}/go-live`
		);
	}
};

/** `services::data_consent::PURPOSES`. */
export const DATA_PURPOSES = [
	'public_score_api',
	'research_licensing',
	'commercial_licensing',
	'identity_aggregation'
] as const;

/** `services::data_licensing::LICENSEE_TYPES`. */
export const DATA_LICENSEE_TYPES = [
	'research_lab',
	'university',
	'government',
	'development_bank',
	'enterprise',
	'ngo'
] as const;

/** `services::data_licensing::PARTNER_TYPES`. */
export const DATA_PARTNER_TYPES = [
	'university',
	'bootcamp',
	'coding_school',
	'corporate_academy',
	'government'
] as const;
