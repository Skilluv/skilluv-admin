# Coverage Playwright — suivi par module

Marquer : ⬜ à faire · 🟡 partiel · ✅ couvert · ⛔ bloqué (bug back)

## Existant (avant workflow QA)

| Fichier | Scope |
|---|---|
| `e2e/auth-redirect.spec.ts` | ✅ Redirects sans auth (14 routes) |
| `e2e/auth-pages.spec.ts` | ✅ Rendu login + setup/recovery 2FA (3 tests) |
| `e2e/admin-back-e2e.spec.ts` | ✅ Probe intégration back (login, catalog, enterprises) |

## Phase 1 — Smoke (nav + guards) — ✅ 23/23

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
| `/slices` | ✅ (p26-slices-list) |
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

## Suite admin complète — ✅ 77/77

**Toutes vertes en série contre staging** (2026-08-11, `--workers=1`).

Avant ce jour, **aucune spec du projet `admin` ne pouvait démarrer** : le
`globalSetup` échouait sur `ECONNREFUSED localhost:3001`, ni
`playwright.config`, ni `global-setup`, ni `e2e/setup/db.ts` ne lisant `.env`.
Les 18 rouges apparues ensuite n'étaient donc pas des régressions — elles
n'avaient simplement jamais été exécutées.

Les reprendre a montré que le rouge recouvrait **trois causes distinctes**, et
que la première n'était pas du test :

| Cause | Portée | Détail |
|---|---|---|
| **Bug applicatif** | 5 pages | `/tenants`, `/challenges`, `/sponsored-challenges`, `/enterprise-kyc` et `/community` lisaient `res.data.X` sur un payload devenu `{data: T[]}`. `/tenants` plantait (`undefined.length`) ; les quatre autres affichaient une liste vide **en silence** — dont une file KYC de 3 dossiers et 6 challenges en attente de revue. Contrepartie jamais faite du chantier backend BUGS_BACK P3. |
| **Fixture au schéma périmé** | 6 seeds | `badge_rules` visait des colonnes disparues ; `orientations.name` ≠ `display_name` ; `guilds.founder_id` ≠ `owner_id` et `tag` est NOT NULL ; `deliverables` exige un parent (slice ou challenge) et refuse `artifact_type='code'` comme `verifiable_by='ai'` ; `guilds.disbanded_at` ≠ `dissolved_at`. |
| **Sélecteur ou timing** | 7 specs | Modale sans `<form>` (donc `requestSubmit()` n'appelait rien), ids préfixés, `.first()` visant une autre ligne que celle seedée, libellés dérivés — et surtout des clics arrivant **avant l'hydratation** : le bouton est rendu en SSR, son `onclick` n'existe qu'après. |

Deux assertions asséraient un effet qui n'a jamais existé : révoquer un
livrable pose `revoked_at`, ça ne touche pas `verification_status`.

### Durcissements apportés

* Quatre `data-testid` sur les déclencheurs de `/operations` — deux boutons de
  la page s'appellent « Déclencher » à l'identique, et le texte d'interface
  avait déjà dérivé une fois.
* Les clics sensibles à l'hydratation réessaient (`toPass`) plutôt que de
  poser une attente arbitraire, et leur message d'échec nomme la cause.
* `globalTeardown` purge les fixtures quoi qu'il arrive : le nettoyage en fin
  de test n'est jamais atteint par un test qui échoue, et les rebuts finissent
  par fausser les runs suivants.

## P26 v2 — Workflow challenge (SKI-98 / SKI-99 / SKI-100 / SKI-112)

**35 specs, vertes.** Le premier run réel a trouvé quatre défauts, dont deux
qui dépassaient P26 : `<Toast />` n'était monté nulle part (194 appels
invisibles dans 39 fichiers) et Escape sur un dropdown fermait la modale
entière en perdant la saisie.

| Parcours | Spec |
|---|---|
| Création projet avec les 5 champs P26 → vérif colonnes en base | `p26-project-challenge-config.spec.ts` |
| Validation paire GitHub, avertissement mode auto sans label | idem |
| Fiche projet : config d'ingestion, stats, fenêtre | idem |
| Forçage d'ingestion (SKI-110) | idem |
| Override sensibilité / rang, et effacement (`null` ≠ `[]`) | `p26-slice-config.spec.ts` |
| Liste des slices tous statuts, filtres portés par l'URL | `p26-slices-list.spec.ts` |
| Compteurs cliquables → liste filtrée | idem |
| Approve → capability réellement accordée | `p26-validators.spec.ts` |
| Reject motivé → raison conservée, aucune capability | idem |
| Invitation → n'accorde PAS la capability avant acceptation | idem |
| Révocation → `revoked_at` posé, slug encodé | idem |
| Dashboard analytics : 5 sections, fenêtre, seuil, export CSV | `p26-validation-analytics.spec.ts` |

En parallèle (8 workers) le lot est instable — backend distant + compilation
SvelteKit à la demande. Lancer en série tant que ce n'est pas traité.

## Phase 2 — Parcours critiques

| # | Parcours | Statut | Spec |
|---|---|---|---|
| 1 | Login + 2FA (UI end-to-end) | ✅ | `e2e/login-2fa.spec.ts` |
| 2a | User : search + ban + unban + DB check | ✅ | `e2e/admin/user-ban-unban.spec.ts` |
| 2c | User : reset-2fa | ✅ | `e2e/admin/reset-2fa.spec.ts` |
| 3 | Reports : resolve + dismiss | ✅ | `e2e/admin/reports.spec.ts` |
| 4 | Challenge : create → publish → archive | ✅ | `e2e/admin/challenge-lifecycle.spec.ts` |
| 5 | Enterprise : change type dry-run → commit | ⬜ | nécessite entreprise seedée |
| 6 | KYC : approve + reject | ✅ | `e2e/admin/kyc-decide.spec.ts` |
| 7 | Sponsored : decide | ✅ | `e2e/admin/sponsored-decide.spec.ts` |
| 8 | SSO session : revoke | ✅ | `e2e/admin/sso-revoke.spec.ts` |
| 9 | Community : approve / reject | ✅ | `e2e/admin/community-review.spec.ts` |
| 10 | Fraud : mark valid / revoke | ✅ | `e2e/admin/fraud-actions.spec.ts` |

## Phase 3 — Exhaustive (à ouvrir plus tard)

- Pagination + filtres sur toutes les listes
- Rate limits admin destructifs
- Audit log entries après chaque mutation
- Aligner les specs restantes sur le modèle « chaque spec crée ses fixtures »
