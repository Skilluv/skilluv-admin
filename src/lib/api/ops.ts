/**
 * The ops domain's practice surface — `ops_practice.rs`, admin half.
 *
 * Five routes: one list and four decisions.
 *
 * ## Why a cost verdict carries an SLO answer
 *
 * `verifyCostWork` sends `service_still_meets_slo`, and it is not optional
 * on either side. An SRE's proof is a bill that went down, but a bill goes
 * down when a service is switched off too. Verifying the saving alone would
 * certify an outage with a spreadsheet, so the verdict is one question with
 * two halves and the screen asks both.
 *
 * ## Verified is not attested
 *
 * Both verify routes answer `{verified, attestation_issued}`. The second is
 * not a restatement of the first: an admin can confirm a piece of work and
 * the domain can still decline to issue an attestation for it, because the
 * bar for an attestation is the domain's and not the verifier's. The screen
 * reports which of the two happened rather than assuming one implies the
 * other.
 */
import type {
	ApiResponse,
	OpsArtefactAttestationInput,
	OpsFeaturedAttestationInput,
	OpsOverdueAction,
	OpsVerificationResult
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const opsApi = {
	/** Remediation actions past their date. Anything done or explicitly
	 *  abandoned is excluded: a decision not to act is a decision, not a
	 *  debt. */
	overdueActions() {
		return api.get<ApiResponse<{ overdue: OpsOverdueAction[] }>>('/admin/ops/overdue-actions');
	},

	verifyObjective(id: string) {
		return api.post<ApiResponse<OpsVerificationResult>>(`/admin/ops/objectives/${id}/verify`);
	},

	/** The SLO answer is required. See the module note. */
	verifyCostWork(id: string, serviceStillMeetsSlo: boolean) {
		return api.post<ApiResponse<OpsVerificationResult>>(`/admin/ops/cost-work/${id}/verify`, {
			service_still_meets_slo: serviceStillMeetsSlo
		});
	},

	/** The basis and the artefact's subtype have to agree — a migration
	 *  attestation cannot be issued from a dashboard. That is checked in the
	 *  service, so a mismatch comes back as a 400 naming both. */
	attestArtefact(input: OpsArtefactAttestationInput) {
		return api.post<ApiResponse<{ issued: boolean }>>('/admin/ops/attestations/artefact', input);
	},

	/** Rests on a decision rather than a file, so the reason is the evidence.
	 *  The backend builds the evidence URL itself, using the same address the
	 *  weekly featuring would have used — one convention for "what does a
	 *  featuring point at" rather than two that drift. */
	attestFeatured(input: OpsFeaturedAttestationInput) {
		return api.post<ApiResponse<{ issued: boolean }>>('/admin/ops/attestations/featured', input);
	}
};

/** The three artefact bases the service accepts. */
export const OPS_ATTESTATION_BASES = [
	'ops_infra_shipped',
	'ops_observability_stack_shipped',
	'ops_migration_completed'
] as const;
