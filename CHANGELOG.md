# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Planned scope for the MVP catch-up (see `docs/MVP.md`). The admin panel is
currently ~50 backend endpoints behind (P6 → P25). The phases below bring it
back in sync.

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

### ADM-M6 — Security hardening
- Mandatory 2FA (TOTP or passkey) for `role='admin'`; redirect to
  `/auth/setup-2fa` when missing.
- Server-side `Origin` check middleware on `/api/admin/*`
  (`require_admin_origin`).
- Rate-limit destructive admin actions (10/min, 100/h per admin) via
  `rate_limit::AdminDestructive`.
- Unified audit log: every admin mutation goes through
  `audit_logs::write(...)`. Refactor KYC, sponsored, SSO revoke, tournament
  conclude endpoints that do not log yet.
- Optional IP allowlist via `SKILLUV_ADMIN_IP_ALLOWLIST`.

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
