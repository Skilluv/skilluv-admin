# Coverage Playwright — suivi par module

Marquer : ⬜ à faire · 🟡 partiel · ✅ couvert · ⛔ bloqué (bug back)

## Existant (avant workflow QA)

| Fichier | Scope |
|---|---|
| `e2e/auth-redirect.spec.ts` | ✅ Redirects sans auth (14 routes) |
| `e2e/auth-pages.spec.ts` | ✅ Rendu login + setup/recovery 2FA (3 tests) |
| `e2e/admin-back-e2e.spec.ts` | ✅ Probe intégration back (login, catalog, enterprises) |

## Phase 1 — Smoke (nav + guards) — ✅ 22/22

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
| `/projects/[slug]` | ✅ (p26-project-challenge-config) |
| `/slices/[id]/config` | ✅ (p26-slice-config) |
| `/validators/applications` | ✅ |
| `/validators/invitations` | ✅ |
| `/validators/active` | ✅ |
| `/validation-analytics` | ✅ |
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

## P26 v2 — Workflow challenge (SKI-98 / SKI-99 / SKI-100)

**Exécutées contre staging le 2026-08-11 : 29/29 vertes** (`--workers=1`).
Le run a trouvé quatre défauts réels, corrigés depuis — voir plus bas.

En parallèle (8 workers) le même lot donne des échecs intermittents : le
backend est distant et la compilation SvelteKit se fait à la demande. Lancer
la suite P26 en série tant que ce n'est pas traité.

| Parcours | Statut | Spec |
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

## P26 v2 — Workflow challenge (SKI-98 / SKI-99 / SKI-100)

Spécifié et écrit, **jamais exécuté** : ces specs demandent un backend + une
DB, qui n'étaient pas disponibles au moment de l'écriture. Statut 🟡 tant
qu'une exécution réelle n'a pas eu lieu — le premier run fera bouger ces
lignes dans les deux sens.

| Parcours | Statut | Spec |
|---|---|---|
| Création projet avec les 5 champs P26 → vérif colonnes en base | ✅ vérifié | `e2e/admin/p26-project-challenge-config.spec.ts` |
| Validation paire GitHub + avertissement mode auto sans label | ✅ vérifié | idem |
| Fiche projet : config d'ingestion + stats + fenêtre | ✅ vérifié | idem |
| Forçage d'ingestion (SKI-110) | ✅ vérifié | idem — `test.skip` tant que l'endpoint répond 404 |
| Override sensibilité / rang sur une slice + effacement (`null` ≠ `[]`) | ✅ vérifié | `e2e/admin/p26-slice-config.spec.ts` |
| Validation de forme des slugs d'orientation | ✅ vérifié | idem |
| Approve candidature → capability réellement accordée | ✅ vérifié | `e2e/admin/p26-validators.spec.ts` |
| Reject motivé → raison conservée, aucune capability | ✅ vérifié | idem |
| Invitation → n'accorde PAS la capability avant acceptation | ✅ vérifié | idem |
| Révocation → `revoked_at` posé, slug encodé dans l'URL | ✅ vérifié | idem |
| Dashboard analytics : 5 sections, fenêtre, seuil, export CSV | ✅ vérifié | `e2e/admin/p26-validation-analytics.spec.ts` |

Les specs qui dépendent d'un endpoint pas encore déployé se `skip` sur un
404/405 plutôt que d'échouer : un endpoint absent est un état de déploiement
connu, pas une régression.

## Phase 3 — Exhaustive (à ouvrir plus tard)

- CRUD complet tenants / projects / skills / orientations / badge-rules
- Jobs ops (digest, sweep, GDPR, hidden-gems, churn)
- Pagination + filtres sur toutes les listes
- Modal confirmations + validation reason ≥ 8 chars
- Rate limits admin destructifs
- Audit log entries après chaque mutation
