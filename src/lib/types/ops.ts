/**
 * The ops domain's practice surface — incidents, objectives, cost work.
 *
 * Re-exported by `types/index.ts`.
 *
 * What makes this domain different from the others is that its proof is
 * operational rather than an artefact: an SRE's work shows up as an outage
 * that did not happen and a bill that went down. Both are verifiable, and
 * both are verifiable **only together** — which is why the cost verdict
 * below carries an SLO answer. Certifying a saving on its own would certify
 * an outage with a spreadsheet.
 */

/** One remediation action past its date, from `ops_incident_actions`.
 *
 *  Excludes anything done or explicitly abandoned: an action somebody
 *  decided not to do is a decision, not a debt. */
export interface OpsOverdueAction {
	incident_id: string;
	incident: string;
	severity: string;
	action: string;
	/** `YYYY-MM-DD`. */
	due_on: string | null;
	owner: string | null;
}

/** `ops_infra_shipped`, `ops_observability_stack_shipped`,
 *  `ops_migration_completed`. The basis and the artefact's subtype have to
 *  agree — a migration attestation cannot be issued from a dashboard — and
 *  the service checks it, not the route. */
export type OpsAttestationBasis =
	| 'ops_infra_shipped'
	| 'ops_observability_stack_shipped'
	| 'ops_migration_completed';

export interface OpsArtefactAttestationInput {
	user_id: string;
	basis: OpsAttestationBasis;
	deliverable_id: string;
	title: string;
	evidence_url: string;
}

/** The community attestation, which rests on a decision rather than a file.
 *  The backend refuses an empty reason for the same purpose as everywhere
 *  else here: an editorial act has to say why. */
export interface OpsFeaturedAttestationInput {
	user_id: string;
	reason: string;
}

/** Whether an attestation actually came out of a verification. Verifying is
 *  not the same as attesting: the second only happens when the work clears
 *  the bar the domain set. */
export interface OpsVerificationResult {
	verified: boolean;
	attestation_issued: boolean;
}
