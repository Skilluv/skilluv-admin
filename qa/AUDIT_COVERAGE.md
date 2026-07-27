# Coverage Playwright — suivi par module

Marquer : ⬜ à faire · 🟡 partiel · ✅ couvert · ⛔ bloqué (bug back)

## Existant (avant workflow QA)

| Fichier | Scope |
|---|---|
| `e2e/auth-redirect.spec.ts` | ✅ Redirects sans auth (14 routes) |
| `e2e/auth-pages.spec.ts` | ✅ Rendu login + setup/recovery 2FA (3 tests) |
| `e2e/admin-back-e2e.spec.ts` | ✅ Probe intégration back (login, catalog, enterprises) |

## Phase 1 — Smoke (nav + guards) — ✅ 18/18

Couvert par `e2e/admin/nav-smoke.spec.ts` (data-driven sur toutes les routes).

| Route | Test |
|---|---|
| `/` Dashboard | ✅ |
| `/auth/login` | ✅ (auth-pages) |
| `/auth/setup-2fa` | ✅ (auth-pages shell) |
| `/auth/recovery-2fa` | ✅ (auth-pages) |
| `/tenants` | ✅ |
| `/tenants/[id]` | ⬜ (dépend d'un tenant existant en DB) |
| `/users` | ✅ |
| `/users/[id]` | ⬜ (dépend d'un user existant) |
| `/enterprises` | ✅ |
| `/enterprises/[id]` | ⬜ (dépend d'une entreprise existante) |
| `/challenges` | ✅ |
| `/reports` | ✅ |
| `/audit-log` | ✅ |
| `/enterprise-kyc` | ✅ |
| `/fraud` | ✅ |
| `/operations` | ✅ |
| `/catalog` | ✅ |
| `/projects` | ✅ |
| `/skills` | ✅ |
| `/sponsored-challenges` | ✅ |
| `/sso-sessions` | ✅ |
| `/tournaments` | ✅ |
| `/community` | ✅ |

## Phase 2 — Parcours critiques

| # | Parcours | Statut | Spec |
|---|---|---|---|
| 1 | Login + 2FA (UI end-to-end) | ✅ | `e2e/login-2fa.spec.ts` |
| 2a | User : search + ban + unban (UI natif) + DB check | ✅ | `e2e/admin/user-ban-unban.spec.ts` — 2 bugs trouvés + fixés |
| 2c | User : reset-2fa (regression guard UI + API E2E) | ✅ | `e2e/admin/reset-2fa.spec.ts` — bug P0 auth trouvé + fixé, bug back en attente |
| 3 | Reports : resolve + dismiss | ⬜ | nécessite un report seedé |
| 4 | Challenge : create draft (API) → publish (UI) → archive (UI) | ✅ | `e2e/admin/challenge-lifecycle.spec.ts` |
| 5 | Enterprise : change type dry-run → commit | ⬜ | nécessite entreprise seedée |
| 6 | KYC : approve + reject | ⬜ | nécessite entreprise + docs seedés |
| 7 | Sponsored : decide → link challenge | ⬜ | nécessite sponsored request seedée |
| 8 | SSO session : revoke | ⬜ | nécessite session SSO active |
| 9 | Community : approve / reject | ⬜ | nécessite submission seedée |
| 10 | Fraud : scan / mark valid / revoke | ⬜ | nécessite deliverable seedé |

## Phase 3 — Exhaustive (à ouvrir plus tard)

- CRUD complet tenants / projects / skills / orientations / badge-rules
- Jobs ops (digest, sweep, GDPR, hidden-gems, churn)
- Pagination + filtres sur toutes les listes
- Modal confirmations + validation reason ≥ 8 chars
- Rate limits admin destructifs
- Audit log entries après chaque mutation
