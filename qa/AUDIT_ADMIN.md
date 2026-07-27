# Skilluv Admin Frontend — Audit d'API Complet

**Date:** 2026-07-22  
**Environnement:** SvelteKit + TypeScript  
**Scope:** Inventaire exhaustif des appels backend par route  

---

## 1. Guards & Auth (hooks.server.ts)

**Validation globale:** GET /api/auth/me (cookie token) → 303 redirect si !user ou role≠'admin'

---

## 2. Pages & Appels API — Résumé par Route

### / Dashboard
- GET /api/admin/stats → Platform stats
- GET /api/admin/moderation-dashboard → Legacy moderation KPIs
- GET /api/admin/dashboard-overview → Business metrics (MRR, hires, signups)
- GET /api/admin/dashboard-financial → Revenue, invoices, purchases
- GET /api/admin/dashboard-moderation-queue → Queue counts (reports, KYC, sponsored, bans)
- GET /api/admin/dashboard-health → DB pool, WebSocket, error events

### /auth/login
- POST /api/auth/login {identifier, password, totp_code?} → {user, login_method, has_passkey, requires_totp_setup}

### /auth/setup-2fa
- GET /api/auth/totp-setup → {otpauth_url, secret_base32}
- POST /api/auth/totp-enable {code} → {backup_codes[]}

### /auth/recovery-2fa
- POST /api/auth/login {identifier, password, backup_code} → {user}

### /tenants & /tenants/[id]
- GET /api/tenants → {tenants: TenantSummary[]}
- POST /api/tenants {slug, name, contact_email, plan, max_users, primary_color, logo_url, subdomain?} → {tenant_id}
- GET /api/tenants/{id} → TenantFull
- PATCH /api/tenants/{id} {name, subdomain, custom_domain, logo_url, primary_color, secondary_color, plan, max_users, active} → 204
- GET /api/tenants/{id}/members → {members: TenantMember[]}
- POST /api/tenants/{id}/members {user_id, role} → 201
- GET /api/tenants/{id}/cohorts → {cohorts: TenantCohort[]}
- POST /api/tenants/{id}/cohorts {name, starts_at?, ends_at?} → 201

### /users & /users/[id]
- GET /api/admin/users {q?, banned?, page, per_page} → {data: UserRow[], pagination}
- POST /api/admin/users/{id}/ban {reason} → 204
- POST /api/admin/users/{id}/unban → 204
- GET /api/admin/users/{id} → {user, reports_against, total_submissions}
- POST /api/admin/users/{id}/reset-2fa {reason} → 204

### /enterprises & /enterprises/[id]
- GET /api/admin/enterprises {type?, verified?, page, per_page} → {data: EnterpriseAdmin[], pagination}
- GET /api/admin/enterprises/{id} → {enterprise: EnterpriseAdmin}
- GET /api/admin/enterprises/{id}/type-config → {type_config: {}}
- GET /api/admin/enterprises/{id}/agency-clients → {clients: AgencyClient[]}
- PATCH /api/admin/enterprises/{id}/type?dry_run=true {enterprise_type, reason} → {dry_run_preview}
- PATCH /api/admin/enterprises/{id}/type?dry_run=false {enterprise_type, reason} → 204

### /challenges
- GET /api/admin/challenges → {challenges: Challenge[], total}
- POST /api/admin/challenges {title, description, instructions, skill_domain, difficulty, mode, duration_minutes, ai_allowed, tone, language, prerequisite_fragments, reward_fragments, is_onboarding, expected_output, test_cases} → 201
- PATCH /api/admin/challenges/{id} {subset of fields} → 204
- POST /api/admin/challenges/{id}/publish → 204
- POST /api/admin/challenges/{id}/archive → 204

### /reports
- GET /api/admin/reports {status?, page, per_page} → {data: ReportEntry[], pagination}
- POST /api/admin/reports/{id}/resolve {status: 'resolved'|'dismissed'} → 204

### /audit-log
- GET /api/admin/audit-log {page, per_page} → {data: LegacyEntry[], pagination}
- GET /api/admin/audit-log-generic {actor_type?, actor_id?, action?, target_type?, target_id?, page, per_page} → {data: AuditGenericEntry[]}

### /enterprise-kyc
- GET /api/admin/kyc-queue → {queue: KycEntry[]}
- POST /api/admin/kyc/{enterprise_id}/decide {action: 'approve'|'reject', level?, reason?} → 204

### /fraud
- GET /api/admin/fraud-queue {threshold, limit} → {flagged_deliverables[], suspected_users[]}
- POST /api/admin/deliverables/{id}/mark-valid → 204
- POST /api/admin/deliverables/{id}/revoke {reason} → 204
- POST /api/admin/fraud-detect {window_hours, min_group_size} → {groups_detected, users_flagged, groups[]}
- POST /api/admin/users/{id}/mark-valid → 204
- POST /api/admin/deliverables/{id}/scan {threshold, window_days} → {best_score, compared_count, best_match_id?}
- POST /api/admin/deliverables/{id}/llm-eval → {new_status, score?, notes?, llm_reachable}

### /operations
- POST /api/admin/jobs/rebuild-leaderboards → {}
- POST /api/admin/jobs/digest → {digest}
- POST /api/admin/jobs/hidden-gems → {job_id}
- POST /api/admin/jobs/churn → {job_id}
- POST /api/admin/jobs/proof-sweep {within_days, dry_run} → {would_process_count}|{processed_count}
- POST /api/admin/gdpr-export {user_id, reason} → {}
- POST /api/admin/sync-github {user_id} → {sync}
- POST /api/admin/guilds/{id}/dissolve {reason} → 204
- POST /api/admin/wars/{id}/conclude {winner_guild_id} → {}
- GET /api/admin/accounting-export?year={Y}&month={M} → CSV file

### /projects
- GET /api/admin/projects {is_flagship?, curated_by_admin?, partnership_level?, include_archived, page, per_page} → {data: ProjectListItem[], pagination}
- POST /api/admin/projects {slug, name, description, repo_url, demo_url, tech_stack[], is_oss, looking_for_contributors, owner_type, owner_id, curated_by_admin, is_flagship, flagship_steward_user_id, skilluv_partnership_level, skilluv_editorial_notes} → 201
- GET /api/admin/projects/{slug} → ProjectFull
- PATCH /api/admin/projects/{slug} {subset} → 204
- POST /api/admin/projects/{slug}/archive → 204

### /skills
- GET /api/admin/skills {domain?, q?, is_skilluv_specific?, page, per_page} → {data: SkillNodeAdmin[], pagination}
- POST /api/admin/skills {slug, display_name, description, domain, parent_id, aliases[], external_refs{}, is_skilluv_specific} → 201
- PATCH /api/admin/skills/{id} {display_name, description, domain, parent_id, aliases, external_refs, is_skilluv_specific} → 204

### /sponsored-challenges
- GET /api/admin/sponsored-requests → {requests: SponsoredRequest[]}
- POST /api/admin/sponsored-requests/{id}/decide {action, admin_notes?} → 204
- POST /api/admin/sponsored-requests/{id}/link {challenge_id, sponsor_logo_url?, sponsor_blurb?, sponsor_visible_until (ISO), free_contact_until (ISO)} → 204

### /sso-sessions
- GET /api/admin/sso-sessions {enterprise_id?, page, per_page} → {data: SsoSession[], pagination}
- POST /api/admin/sso-sessions/{id}/revoke {reason} → 204

### /community
- GET /api/admin/community-review → {challenges: CommunityEntry[]}
- POST /api/admin/community-challenges/{id}/approve → 204
- POST /api/admin/community-challenges/{id}/reject {feedback} → 204

---

## 3. Actions UI Principales

| Zone | Action | Effet |
|------|--------|-------|
| Dashboard | Cards cliquables | Navigate to reports, KYC, sponsored, challenges, community, tenants |
| Auth | Sign in | POST login; 2FA setup si requis |
| Tenants | + New / Save / Add Member | CRUD tenants; manage members/cohorts |
| Users | Search / Ban / Unban | Filter list; POST ban/unban; detail view |
| Enterprises | Filters + Change Type | List; POST type change (dry-run/commit) |
| Challenges | Create / Edit / Publish / Archive | Modal CRUD; status transitions |
| Reports | Filters + Resolve/Dismiss | List; POST resolve status |
| Audit | Mode toggle + Filters | Legacy vs generic view; detail modal |
| KYC | Approve / Reject | Modal decide; POST decision |
| Fraud | Mark Valid / Revoke / Scan / Detect | Queue actions; plagiarism+multiacccount+eval tabs |
| Operations | Job triggers + GDPR + Dissolve | POST jobs; confirm dialogs |
| Projects | Filters + Create / Edit / Archive | CRUD; partnership levels |
| Skills | Create / Edit / Copy ID | Node taxonomy CRUD |
| Sponsored | Decide / Link Challenge | Modal approve/reject/negotiate; POST link |
| SSO | Filter + Revoke | List sessions; POST revoke |
| Community | Approve / Reject | List + POST actions |

---

## 4. Confirmation Dialogs (Destructive)

- Ban user → require reason ≥ 8 chars
- Revoke session/deliverable → require reason
- Reject KYC/sponsored → require feedback
- Dissolve guild → require reason
- Reset 2FA → reason required (admin only)

---

## 5. Patterns de Chargement

- **Pagination:** Reset page=1 on filter change
- **Lazy tabs:** Members/Cohorts load on tab switch
- **Modals:** Reset form on close
- **Live filters:** Segmented controls; local filter (no reload)
- **Toast feedback:** All mutations confirm to user

---

## 6. Notes d'Audit

**Appels totaux:** 80+ endpoints  
**Routes:** 21 pages principales  
**Patterns:** CRUD (C/R/U/D), Job triggers, Moderation, Fraud detection  
**Auth:** Role-based + 2FA mandatory  
**UI:** SvelteKit + TypeScript; forms, tables, modals, segmented controls  

**Pour tests Playwright:**
- Login flow + 2FA setup
- Core CRUD (tenants, users, challenges, enterprises)
- Destructive ops (ban, revoke, dissolve)
- Modal confirmations
- Pagination & filtering
- Job triggers (digest, proof sweep, GDPR)

---

**Fin du document audit. Croiser avec backend API spec pour tests d'intégration complets.**