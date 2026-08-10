<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import FilterBar from '$components/ui/FilterBar.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import PendingBackendNotice from '$components/admin/PendingBackendNotice.svelte';
	import { VALIDATOR_DOMAINS } from '$types';
	import type {
		Capability,
		UserCapability,
		ValidatorDomain,
		ValidatorStatsRow
	} from '$types';
	import { ShieldOff } from '@lucide/svelte';

	// SKI-99 page 3 — who currently holds a validator grant, and how much they
	// actually validate. The roster and the activity figures come from the
	// same endpoint (SKI-108): "active validator" is defined as holding at
	// least one `challenge_validator:*` capability.

	const WINDOWS = [
		{ value: 30, label: '30 jours' },
		{ value: 90, label: '90 jours' },
		{ value: 365, label: '1 an' }
	];

	let validators = $state<ValidatorStatsRow[]>([]);
	let loading = $state(true);
	let loadError = $state<unknown>(null);
	let windowDays = $state(90);
	let filterDomain = $state<ValidatorDomain | ''>('');

	let revokeTarget = $state<{ row: ValidatorStatsRow; domain: ValidatorDomain } | null>(null);
	let revoking = $state(false);

	/** `challenge_validator:{domain}` → grant date, per user. The stats endpoint
	 *  gives the roster and the activity but not when each grant was made, and
	 *  that date is the traceability the ticket asks for — so it is fetched from
	 *  the per-user capability endpoint. One request per validator: acceptable
	 *  because the roster is a handful of people in Phase 1, and the column
	 *  degrades to a dash rather than failing the page if a call errors. */
	let grantDates = $state<Record<string, string>>({});

	$effect(() => {
		void windowDays;
		void load();
	});

	async function load() {
		loading = true;
		loadError = null;
		try {
			const res = await adminApi.listValidatorStats(windowDays);
			validators = res.data.validators;
			void loadGrantDates(res.data.validators);
		} catch (e) {
			loadError = e;
			validators = [];
		} finally {
			loading = false;
		}
	}

	async function loadGrantDates(rows: ValidatorStatsRow[]) {
		const entries = await Promise.all(
			rows.map(async (v) => {
				try {
					const res = await adminApi.listUserCapabilities(v.user.id);
					return res.data.capabilities
						.filter((c: UserCapability) => c.capability.startsWith('challenge_validator:'))
						.map((c: UserCapability) => [`${v.user.id}|${c.capability}`, c.granted_at] as const);
				} catch {
					return [];
				}
			})
		);
		grantDates = Object.fromEntries(entries.flat());
	}

	function grantedAt(v: ValidatorStatsRow, domain: ValidatorDomain): string | undefined {
		return grantDates[`${v.user.id}|challenge_validator:${domain}`];
	}

	const visible = $derived(
		filterDomain === ''
			? validators
			: validators.filter((v) => v.active_domains.includes(filterDomain as ValidatorDomain))
	);

	async function confirmRevoke() {
		const target = revokeTarget;
		if (!target) return;
		revoking = true;
		try {
			// The generic capability endpoint takes the full slug — the reason
			// is generated backend-side, so the dialog's text is for the human
			// record only and is not transmitted.
			await adminApi.revokeCapability(
				target.row.user.id,
				`challenge_validator:${target.domain}` as Capability
			);
			toast.success(`Capability retirée à ${label(target.row)}`);
			revokeTarget = null;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			revoking = false;
		}
	}

	/** `username` and `display_name` are nullable in the payload (LEFT JOIN on
	 *  users); the id is the only guaranteed handle. */
	function label(v: ValidatorStatsRow): string {
		return v.user.display_name || v.user.username || v.user.id;
	}

	function hours(v: number | null): string {
		if (v === null) return '—';
		if (v < 48) return `${v.toFixed(1)} h`;
		return `${(v / 24).toFixed(1)} j`;
	}

	function ratio(v: number): string {
		return `${Math.round(v * 100)} %`;
	}
</script>

<svelte:head>
	<title>Validateurs actifs — Admin Skilluv</title>
</svelte:head>

<FilterBar variant="boxed" class="mb-4">
	<div class="flex flex-col gap-1.5">
		<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Domaine</span>
		<Select
			items={[
				{ value: '', label: 'Tous' },
				...VALIDATOR_DOMAINS.map((d) => ({ value: d, label: d }))
			]}
			bind:value={filterDomain}
			size="sm"
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Fenêtre</span>
		<Select items={WINDOWS} bind:value={windowDays} size="sm" />
	</div>
</FilterBar>

{#if loading}
	<Skeleton class="h-64 w-full rounded-2xl" />
{:else if loadError}
	<PendingBackendNotice
		error={loadError}
		ticket="SKI-108"
		endpoint="GET /api/admin/validators/stats"
		description="Liste des porteurs d'une capability challenge_validator, avec leur volume de validations, leur taux d'approbation et leur délai de décision."
	/>
{:else if visible.length === 0}
	<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
		<p class="text-sm text-text-muted">
			{filterDomain === ''
				? 'Aucun validateur actif.'
				: `Aucun validateur actif sur le domaine ${filterDomain}.`}
		</p>
	</div>
{:else}
	<div class="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-surface/40">
						<th
							class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Validateur
						</th>
						<th
							class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Domaines
						</th>
						<th
							class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Validations
						</th>
						<th
							class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Taux approbation
						</th>
						<th
							class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Pick-up → décision
						</th>
						<th
							class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Révoquer
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each visible as v (v.user.id)}
						<tr class="transition-colors hover:bg-surface-elevated-hover">
							<td class="px-4 py-3">
								<a
									href="/users/{v.user.id}"
									class="font-medium text-text-primary transition-colors hover:text-accent"
								>
									{label(v)}
								</a>
								{#if v.user.username}
									<p class="font-mono text-xs text-text-muted">@{v.user.username}</p>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap gap-x-3 gap-y-1.5">
									{#each v.active_domains as d (d)}
										{@const granted = grantedAt(v, d)}
										<div class="flex flex-col gap-0.5">
											<Badge variant="primary">{d}</Badge>
											<span class="font-mono text-[10px] text-text-muted">
												{granted ? `depuis le ${new Date(granted).toLocaleDateString('fr-FR')}` : '—'}
											</span>
										</div>
									{/each}
								</div>
							</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-text-primary">
								{v.validations_count}
								<span class="ml-1 text-xs text-text-muted">
									({v.approve_count}✓ / {v.reject_count_approx}✗)
								</span>
							</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-text-primary">
								{ratio(v.approve_ratio)}
							</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-text-primary">
								{hours(v.avg_pickup_to_decision_hours)}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap justify-end gap-1">
									{#each v.active_domains as d (d)}
										<button
											type="button"
											onclick={() => (revokeTarget = { row: v, domain: d })}
											class="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-text-muted transition-colors hover:border-error hover:text-error"
											aria-label="Révoquer challenge_validator:{d} pour {label(v)}"
										>
											<ShieldOff size={12} strokeWidth={2} />
											{d}
										</button>
									{/each}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}

<ConfirmDangerousDialog
	open={revokeTarget !== null}
	title="Révoquer une capability validateur"
	description={revokeTarget
		? `${label(revokeTarget.row)} ne pourra plus prendre en charge la validation des slices du domaine ${revokeTarget.domain}. Les validations déjà rendues sont conservées.`
		: ''}
	actionLabel="Révoquer"
	reasonPlaceholder="Raison de la révocation (trace interne)"
	loading={revoking}
	onconfirm={confirmRevoke}
	onclose={() => (revokeTarget = null)}
/>
