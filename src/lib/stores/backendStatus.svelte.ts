/**
 * Global backend-health flag. Turns `isDown = true` when a request fails at the
 * network layer (fetch throws — DNS fail, connection refused, CORS/preflight
 * failure, timeout). HTTP responses (4xx/5xx) do NOT flip it — those are
 * per-request errors that the client already surfaces via SkilluError toast.
 *
 * The `<BackendStatusBanner>` component subscribes to this store and polls
 * `/api/health` with exponential backoff. On success it flips back to false
 * and fires a "reconnected" toast.
 */

class BackendStatus {
	isDown = $state(false);
	/** Nb of consecutive failed health probes, used for backoff. */
	failedProbes = $state(0);
	/** UNIX ms of the next scheduled probe. `0` when not scheduled. */
	nextProbeAt = $state(0);

	markDown() {
		if (!this.isDown) this.isDown = true;
	}

	markUp() {
		if (this.isDown) this.isDown = false;
		this.failedProbes = 0;
		this.nextProbeAt = 0;
	}
}

export const backendStatus = new BackendStatus();

/**
 * Backoff schedule for the retry probe (seconds). We start aggressive so a
 * quick reboot barely disrupts the user, then relax to avoid hammering when
 * the outage is longer.
 */
export function nextBackoffSeconds(failedProbes: number): number {
	const schedule = [3, 5, 10, 20, 30, 60];
	return schedule[Math.min(failedProbes, schedule.length - 1)];
}
