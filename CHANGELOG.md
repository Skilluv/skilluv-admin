# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Planned scope for the MVP catch-up (see `docs/MVP.md`). The admin panel is
currently ~50 backend endpoints behind (P6 → P25). The phases below bring it
back in sync.

### ADM-M0 — Security hardening (delivered — front commit `b614ba4`, back P1+P2)
- Mandatory 2FA (TOTP or WebAuthn) for `role='admin'`: soft flag
  `requires_totp_setup` on login + middleware `ensure_admin_2fa` on
  `/api/admin/*` returning 403 `AUTH_ADMIN_2FA_SETUP_REQUIRED` (BE-A).
- `/auth/setup-2fa` (QR + verify + 10 one-shot backup codes with
  copy/download/acknowledge) and `/auth/recovery-2fa` (backup code login).
- `POST /api/admin/users/{id}/reset-2fa` with `{reason: string ≥8}` — wipes
  TOTP + backup codes + WebAuthn creds + revokes all sessions + audit
  (BE-B). Wired on `/users/[id]` (self-reset blocked).
- Server-side `Origin` middleware `ensure_admin_origin` on `/api/admin/*`
  returning 403 `AUTH_ADMIN_ORIGIN_REQUIRED` (BE-C). Frontend surfaces via
  toast (no redirect to avoid loops).
- Rate-limit destructive actions **10/min, 100/h per admin** via Redis
  sliding-window (`enforce_admin_destructive`) (BE-D). Circuit breaker
  deferred post-MVP.
- Dry-run mode via env `SKILLUV_ADMIN_DRY_RUN=1` + helper
  `is_admin_dry_run()` (BE-D).
- Unified append-only audit log: migration 0099 REVOKE UPDATE/DELETE +
  cross-DB advisory lock + `audit_admin` PostgreSQL role SELECT-only.
  Retention env `SKILLUV_AUDIT_RETENTION_DAYS=2555` (7 years default)
  (BE-E). Doc `docs/AUDIT-APPEND-ONLY.md`.
- Legacy handlers instrumented `audit::record()`: KYC decide, community
  approve/reject, SSO revoke, tournament conclude (BE-F).
- Reusable `ConfirmDangerousDialog` with mandatory reason (configurable
  min length) — wired on ban/unban/reject/revoke/close/conclude/dissolve/
  digest/reset-2fa.
- `errorMessage()` helper + silent catches replaced by toasts across
  `/reports`, `/community`, `/users`, `/sso-sessions`, `/tournaments`,
  `/operations`.
- Vitest + `@testing-library/svelte` + jsdom (30 tests across 5 files).
- IP allowlist and daily S3 export (KMS + Object Lock) deferred: front is
  ready, back has stub + doc, activation requires `aws-sdk-s3` crate + AWS
  bucket provisioning.

### ADM-M1 — Capability Manager
- Add `Capability` / `UserCapability` types to `src/lib/types/index.ts`.
- New tab on `/users/[id]` (or `/users/[id]/capabilities`) to list, grant and
  revoke user capabilities with reason + optional `expires_at`.
- Show revoked capabilities as history.
- Wire `GET/POST/DELETE /api/admin/users/{id}/capabilities` (P18.4).

### ADM-M2 — Fraud Dashboard
- New page `src/routes/fraud/+page.svelte` with tabs Plagiarism /
  Multi-account / LLM re-evaluation.
- Wire existing P14.5 backend routes (`/admin/fraud/queue`,
  `mark-valid`, `revoke`, `scan-deliverable`, `detect-multi-accounts`,
  `llm-evaluate`). No backend change needed.

### ADM-M3 — Orientations catalog & Badge rules
- New page `src/routes/catalog/+page.svelte` with two tabs.
- Orientations: list / create / edit / archive / attach-detach skills.
- Badge rules: list / create / edit / deprecate with live JSON validation.
- Requires new backend routes: `POST/PATCH /api/admin/orientations`,
  attach/detach skill, `POST/PATCH /api/admin/badge-rules`,
  `POST /api/admin/badge-rules/{slug}/deprecate`.

### ADM-M4 — Enterprise Type Manager
- Extend `/enterprise-kyc` or new `/enterprises` page.
- Filter enterprises by `enterprise_type`, view/edit `type_config`, view
  `agency_clients` sub-tab for staffing agencies.
- Requires new backend routes: `GET /api/admin/enterprises`,
  `PATCH /api/admin/enterprises/{id}/type`,
  `GET /api/admin/enterprises/{id}/type-config`,
  `GET /api/admin/enterprises/{id}/agency-clients`.

### ADM-M5 — /users/[id] enrichment
- Add sections: Capabilities, Orientations, Badges, optional Timeline.
- Add buttons "Recompute proof engines" and "Force rank" (with mandatory
  reason + audit log).
- Requires new backend routes:
  `POST /api/admin/users/{id}/recompute-proofs`,
  `POST /api/admin/users/{id}/rank-override`,
  `GET /api/users/{id}/orientations` (admin-scoped).

### ADM-M7 — Tests, docs, deploy
- Playwright e2e coverage for login, grant capability, fraud queue,
  tenant CRUD.
- Update `ADMIN-CAPABILITIES.md` with the ~22 new sections and ~15 new
  backend endpoints.
- Add `Dockerfile` (currently missing) and `docker-compose.admin.yml`.
- CI extension: `svelte-check` + `npm run build` + `playwright test`.

### Added (docs)
- `docs/MVP.md` — full MVP plan, backend endpoint coverage matrix, phase
  breakdown and locked decisions (2FA, origin check, rate-limits, unified
  audit log, API versioning).

---

## [0.1.0] — 2026-07-08

Initial public release of the admin panel.

### Added
- SvelteKit 5 + Svelte 5 runes + TypeScript strict + Tailwind 4 stack.
- i18n EN / FR / AR (843 typed keys).
- Admin login with TOTP, JWT access + opaque refresh + double-submit CSRF.
- 15 pages: dashboard, users list/detail, challenges, community review,
  reports, enterprise KYC, sponsored challenges, tenants list/detail,
  audit log viewer, operations one-shot triggers, SSO sessions,
  tournaments.
- `ADMIN-CAPABILITIES.md` documenting the 37 backend endpoints wired.
- OSS baseline: AGPL-3.0 license, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT,
  bilingual README, GitHub issue / PR templates, CI workflow.
