import type { ApiResponse } from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

// --- Types ---

export type TenantPlan = 'starter' | 'pro' | 'enterprise';
export type TenantMemberRole = 'member' | 'instructor' | 'admin' | 'owner';

export const ROOT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const ROOT_TENANT_SLUG = 'skilluv';

export interface TenantPublic {
	id: string;
	slug: string;
	name: string;
	subdomain: string | null;
	custom_domain: string | null;
	logo_url: string | null;
	primary_color: string | null;
	secondary_color: string | null;
	plan: TenantPlan;
}

export interface TenantSummary {
	id: string;
	slug: string;
	name: string;
	subdomain: string | null;
	plan: TenantPlan;
	max_users: number;
	active: boolean;
	members_count: number;
	created_at: string;
}

export interface TenantFull extends TenantPublic {
	max_users: number;
	contact_email: string;
	active: boolean;
	settings: Record<string, unknown>;
}

export interface TenantMember {
	user_id: string;
	username: string;
	display_name: string;
	email: string;
	role: TenantMemberRole;
	joined_at: string;
}

export interface TenantCohort {
	id: string;
	name: string;
	starts_at: string | null;
	ends_at: string | null;
	active: boolean;
	members_count: number;
}

export interface CreateTenantBody {
	slug: string;
	name: string;
	subdomain?: string | null;
	contact_email: string;
	plan?: TenantPlan;
	max_users?: number;
	primary_color?: string;
	logo_url?: string;
}

export interface UpdateTenantBody {
	name?: string;
	subdomain?: string | null;
	custom_domain?: string | null;
	logo_url?: string | null;
	primary_color?: string | null;
	secondary_color?: string | null;
	plan?: TenantPlan;
	max_users?: number;
	active?: boolean;
	settings?: Record<string, unknown>;
}

// --- API ---

export const tenantsApi = {
	/** Résolu automatiquement depuis subdomain / header `X-Skilluv-Tenant`. */
	current() {
		return api.get<ApiResponse<TenantPublic>>('/tenants/current');
	},

	// -- Admin --
	list() {
		return api.get<ApiResponse<{ tenants: TenantSummary[] }>>('/admin/tenants');
	},

	create(body: CreateTenantBody) {
		return api.post<ApiResponse<{ tenant_id: string }>>('/admin/tenants', body);
	},

	get(id: string) {
		return api.get<ApiResponse<TenantFull>>(`/admin/tenants/${id}`);
	},

	update(id: string, body: UpdateTenantBody) {
		return api.put<ApiResponse<{ updated: boolean }>>(`/admin/tenants/${id}`, body);
	},

	listMembers(id: string) {
		return api.get<ApiResponse<{ members: TenantMember[] }>>(`/admin/tenants/${id}/members`);
	},

	addMember(id: string, userId: string, role: TenantMemberRole = 'member') {
		return api.post<ApiResponse<{ added: boolean }>>(`/admin/tenants/${id}/members`, {
			user_id: userId,
			role
		});
	},

	listCohorts(id: string) {
		return api.get<ApiResponse<{ cohorts: TenantCohort[] }>>(`/admin/tenants/${id}/cohorts`);
	},

	createCohort(id: string, name: string, startsAt?: string, endsAt?: string) {
		return api.post<ApiResponse<{ cohort_id: string }>>(`/admin/tenants/${id}/cohorts`, {
			name,
			starts_at: startsAt,
			ends_at: endsAt
		});
	}
};
