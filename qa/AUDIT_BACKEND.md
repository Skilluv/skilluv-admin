# Skilluv Backend Rust Audit — Complete Routes & Admin Analysis

**Date:** 2024-07-22 | **Framework:** Axum | **Database:** PostgreSQL | **Auth:** JWT

---

## 1. Setup Staging

**Prerequisites:** PostgreSQL 15+, Redis 7+, MinIO S3-compatible storage

`ash
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml up -d
`

**Ports:** Backend 8000 | MailHog SMTP 1025 | MailHog Web 8025 | PostgreSQL 5432 | Redis 6379

**Key Env Vars:**
- DATABASE_URL=postgresql://user:pass@localhost/skilluv_staging
- REDIS_URL=redis://localhost:6379
- JWT_SECRET=<min-32-chars>
- ADMIN_ORIGINS=http://admin.localhost:5175,http://localhost:5174
- ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://admin.localhost:5175
- EMAIL_FROM=noreply@staging.skilluv.com

---

## 2. Auth & Admin Access Control

### Authentication Flow
1. POST /api/auth/login (email + password) → JWT in access_token cookie (user) or admin_access_token (admin)
2. JWT Claims: {sub: user-uuid, role: admin|user|..., login_method: password|sso|oauth, exp: timestamp}
3. Cookie isolation: admin_access_token isolated from access_token for origin isolation (XSS defense)

### Admin Gate Middleware (Two Layers)

**Layer 1: ensure_admin_origin (BE-C)**
- Validates Origin header against ADMIN_ORIGINS env
- Returns 403 AUTH_ADMIN_ORIGIN_REQUIRED if mismatch
- Defense beyond CORS (browser-enforced)

**Layer 2: ensure_admin_2fa (BE-A)**
- Requires: role='admin' MUST have TOTP enabled OR WebAuthn credentials
- Returns 403 AUTH_ADMIN_2FA_SETUP_REQUIRED if neither
- Soft gate allows setup during login

### Role Authorization
- All admin handlers: require_capability(&state.db, auth.user_id, "admin")
- Queries user_capabilities table (canonical since P21.1)
- Rejects 403 Forbidden if missing/revoked
- Rate-limited destructive actions via admin_destructive middleware (10/min, 100/hr)

---

## 3. Admin Routes Inventory

### 3.1 Main Admin (src/routes/admin.rs)

POST /admin/challenges — Create (draft status)
GET /admin/challenges — List all
PUT /admin/challenges/{id} — Update (partial)
POST /admin/challenges/{id}/publish — Publish (enforces rule#1)
POST /admin/challenges/{id}/archive — Archive
POST /admin/challenges/{id}/variant — AI variant (IA-C.1)
GET /admin/stats — KPIs
POST /admin/leaderboards/rebuild — Seed Redis
GET /admin/audit-log/generic — Unified audit (P1.18)
GET /admin/sso/sessions — Active SSO sessions
POST /admin/sso/sessions/{id}/revoke — Kill SSO
POST /admin/users/{id}/reset-2fa — Wipe 2FA (BE-B)

### 3.2 Moderation (src/routes/admin_moderation.rs)

GET /admin/users — List
GET /admin/users/{id} — Detail
POST /admin/users/{id}/ban — Ban user
POST /admin/users/{id}/unban — Unban
GET /admin/reports — Moderation queue
PUT /admin/reports/{id} — Handle report
GET /admin/audit-log — Legacy audit
GET /admin/dashboard/moderation — Moderation KPIs

### 3.3 Fraud (src/routes/admin_fraud.rs)

GET /admin/fraud/queue — Flagged items
POST /admin/fraud/deliverables/{id}/mark-valid — Clear flags
POST /admin/fraud/deliverables/{id}/revoke — Revoke
POST /admin/fraud/users/{id}/mark-valid — Clear suspicion
POST /admin/fraud/scan-deliverable/{id} — Plagiarism check
POST /admin/fraud/detect-multi-accounts — Multi-account detection
POST /admin/fraud/llm-evaluate/{id} — LLM eval
POST /admin/fraud/deep-scan/{id} — Deep scan (IA-B)

### 3.4 User Mgmt (src/routes/admin_users.rs)

POST /admin/users/{id}/recompute-proofs — Batch recompute (BE-D)
POST /admin/users/{id}/rank-override — Force rank

### 3.5 Dashboard (src/routes/admin_dashboard.rs)

GET /admin/dashboard/overview — KPIs
GET /admin/dashboard/financial — Financial metrics
GET /admin/dashboard/moderation-queue — Queue stats
GET /admin/dashboard/health — Health check

### 3.6 Enterprises (src/routes/admin_enterprises.rs)

GET /admin/enterprises — List
GET /admin/enterprises/{id} — Detail
PATCH /admin/enterprises/{id}/type — Change type
GET /admin/enterprises/{id}/type-config — Config
GET /admin/enterprises/{id}/agency-clients — Clients

### 3.7 Community (src/routes/admin_community.rs)

GET /admin/community/review — Review queue
POST /admin/community/{id}/approve — Approve
POST /admin/community/{id}/reject — Reject

### 3.8 Orientations (src/routes/admin_orientations.rs)

POST /admin/orientations — Create
PATCH /admin/orientations/{slug} — Edit
POST /admin/orientations/{slug}/skills — Attach skill
DELETE /admin/orientations/{slug}/skills/{skill_id} — Detach skill

### 3.9 Skills (src/routes/admin_skills.rs)

GET /admin/skills — List
POST /admin/skills — Create
PUT /admin/skills/{id} — Update

### 3.10 Badge Rules (src/routes/admin_badge_rules.rs)

POST /admin/badge-rules — Create
PATCH /admin/badge-rules/{slug} — Edit
POST /admin/badge-rules/{slug}/deprecate — Deprecate

### 3.11 Ops (src/routes/admin_ops.rs)

POST /admin/proof-hooks/sweep — Batch sweep (BE-D)
POST /admin/users/{id}/gdpr-export — GDPR export
GET /admin/badge-events — List events
POST /admin/badge-events — Create event
POST /admin/users/{id}/recompute-capabilities — Recompute capabilities

---

## 4. Security Strengths

✅ JWT signed with JWT_SECRET (no unsigned)
✅ Two-factor admin gate (origin + 2FA mandatory)
✅ Audit trail for destructive actions
✅ CORS origin allowlist (env-driven)
✅ Rate limiting (10/min, 100/hr destructive)
✅ Dry-run mode (?dry_run=true)
✅ Capability-based auth (user_capabilities)

---

## 5. Observations

⚠️ Origin validation header-based (spoofable same-origin; mitigated by CORS)
⚠️ GET /admin/challenges no pagination (concern for large datasets)
⚠️ Legacy admin_audit_log + unified audit_log (consolidation needed)

---

**End Audit — 2024-07-22**
