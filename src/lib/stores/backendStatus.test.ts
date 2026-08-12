import { describe, expect, it, beforeEach } from 'vitest';
import { backendStatus, nextBackoffSeconds } from './backendStatus.svelte';

describe('backendStatus store', () => {
	beforeEach(() => {
		backendStatus.markUp();
	});

	it('starts in `up` state', () => {
		expect(backendStatus.isDown).toBe(false);
		expect(backendStatus.failedProbes).toBe(0);
	});

	it('markDown flips isDown once, idempotent on repeat', () => {
		backendStatus.markDown();
		expect(backendStatus.isDown).toBe(true);
		backendStatus.markDown();
		expect(backendStatus.isDown).toBe(true);
	});

	it('markUp resets isDown + failedProbes + nextProbeAt together', () => {
		backendStatus.markDown();
		backendStatus.failedProbes = 5;
		backendStatus.nextProbeAt = Date.now() + 30000;
		backendStatus.markUp();
		expect(backendStatus.isDown).toBe(false);
		expect(backendStatus.failedProbes).toBe(0);
		expect(backendStatus.nextProbeAt).toBe(0);
	});
});

describe('nextBackoffSeconds', () => {
	it('ramps up on repeated failures', () => {
		expect(nextBackoffSeconds(0)).toBe(3);
		expect(nextBackoffSeconds(1)).toBe(5);
		expect(nextBackoffSeconds(2)).toBe(10);
		expect(nextBackoffSeconds(3)).toBe(20);
		expect(nextBackoffSeconds(4)).toBe(30);
	});

	it('caps at the max backoff (60s) beyond the schedule length', () => {
		expect(nextBackoffSeconds(5)).toBe(60);
		expect(nextBackoffSeconds(20)).toBe(60);
		expect(nextBackoffSeconds(1000)).toBe(60);
	});
});
