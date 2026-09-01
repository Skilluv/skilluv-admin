# Skilluv Admin — Capabilities & API reference

**Scope :** documentation exhaustive de tout ce qu'un compte `role='admin'` peut faire côté backend (`skilluv-backend`), exposé via l'app dédiée `skilluv-admin` sur `admin.skilluv.com` (dev : `localhost:5174`).

**Version :** 2026-08-29.
**Total endpoints :** 48 pour le socle MVP (sections 1-17), plus les surfaces Cyber, missions et curation design des sections 19-21, plus les lignes commerciales et domaines de la section 22.
**Couverture de la surface staff :** 309 / 309 verbes servis (100 %), mesurée par `node scripts/unconsumed-routes.mjs`. Le périmètre est `/admin/**` **plus toute route gardée par une capability**, moins les routes servies deux fois et celles qui appartiennent au praticien — voir §22.2. Plus aucune écriture dont l'`{id}` soit introuvable.

**Changelog depuis 2026-07-08** :
- **ADM-M0** (commit front `b614ba4`, back P1+P2) : 2FA obligatoire pour admin (soft flag login + middleware `ensure_admin_2fa`), reset-2fa admin-to-admin, origin check server-side (`ensure_admin_origin`), rate-limit destructif Redis 10/min + 100/h (`enforce_admin_destructive`), audit log append-only (migration 0099 + rôle `audit_admin`), instrumentation audit sur KYC decide + community + SSO revoke + tournament conclude, helper `dry_run` via env `SKILLUV_ADMIN_DRY_RUN`.
- **ADM-M1** (commit front `9950799`, back P18.4) : `POST/DELETE /api/admin/users/{id}/capabilities` + `GET /api/users/{id}/capabilities` — 14 capabilities admin-manageable.
- **ADM-M2** (commit front `3b29837`, back P14.5) : 7 endpoints fraud — plagiat queue + revoke + LLM re-eval + multi-account detection.
- **Post-MVP T1/T2/T3** (back SKI-36 → SKI-47) : 6 routes admin ou modération consommées — timeline + backfill, file signaux externes, break vouching, prérequis skills, plus la supervision lecture seule des cohortes et des offres de talents. Détail en section 17.
- **Skilluv Cyber + curation design** (projets Linear « Skilluv Cyber — Full workflow » et « Skilluv Design — 26 orientations ») : les 20 routes `/api/admin/security/*` (file de triage, transitions, sévérité, rounds, embargo, dedup, catalogue CTF/lab, programmes externes, claims), les 3 routes `/api/admin/missions*` (une seule surface pour les missions design ET cyber), la file de briefs design, la file de plagiat transverse, la mise en avant hebdomadaire, et les opérations de concours (jury, prix, pics de votes). Détail en sections 19, 20 et 21.
- **Skilluv Design** (branche back `feat/design-orientations-workflow`) : boucle de critique, profil et craft score consommés ; réalignement de trois enums que l'app avait laissés dériver — capabilities (les `design_reviewer:*` étaient ingrantables), kinds de tournoi (`brief_contest` = contest design), statut `in_iteration`. Détail en section 18.

---

## 1. Authentification & session

L'admin utilise le même endpoint de login que les autres personas (`POST /api/auth/login`), mais l'origine `admin.skilluv.com` déclenche l'émission de cookies **namespacés admin**.

### Cookies émis au login admin
| Nom | Path | Attributs | Rôle |
|---|---|---|---|
| `admin_access_token` | `/` | HttpOnly, Secure, SameSite=Strict, Max-Age=900 | JWT (15 min) porté à chaque request auth. |
| `admin_refresh_token` | `/api/auth` | HttpOnly, Secure, SameSite=Strict, Max-Age=7 j | Session opaque, rotée à chaque refresh. |
| `admin_csrf_token` | `/api` | Secure, SameSite=Strict, Max-Age=900 | Double-submit CSRF (lu par le JS, echo dans header `X-CSRF-Token`). |

Le backend détecte `Origin: https://admin.skilluv.com` (prod) ou `Origin: http://localhost:5174` (dev) → applique le prefix `admin_`. Depuis n'importe quelle autre origine, les cookies standards (`access_token`, etc.) sont émis à la place. Les deux extractors `AuthUser` / `AuthUserComplete` lisent en priorité `admin_*` puis fallback sur les cookies publics — un endpoint ne se soucie donc jamais du canal.

### CORS
Origins autorisés lus depuis `ALLOWED_ORIGINS` (env, comma-separated). Fallback dev : `http://localhost:5173,http://localhost:5174`. Prod attendue : `https://skilluv.com,https://admin.skilluv.com`. `credentials: true`.

### Enveloppe JSON standard
Toutes les réponses de succès sont enveloppées :
```json
{
  "data": { … },
  "meta": {
    "request_id": "<uuid v4>",
    "timestamp": "<ISO-8601>"
  }
}
```
Les réponses d'erreur suivent :
```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "Forbidden"
  },
  "meta": { … }
}
```
Le champ `data` peut être omis dans les blocs qui suivent pour lisibilité — il est **toujours** présent en runtime.

---

## 2. Rôles & guards

Tous les endpoints listés ci-dessous sont **gated par `role='admin'`**. Le gate est implémenté de deux façons interchangeables dans la codebase :

- **`require_admin(&state, &auth)`** : re-lit `users.role` depuis la DB (protège contre un JWT stale après une révocation).
- **Inline** : `if auth.role != "admin" { return Err(AppError::Forbidden) }` (utilise le rôle du JWT, économie d'une query).

L'erreur commune est `403 Forbidden` avec `error.code = "AUTH_FORBIDDEN"`.

Les extractors additionnels (`AuthUserComplete`, gates 2FA / email_verified) **ne sont pas** appliqués aux routes admin — un admin passe sans TOTP ni email_verified. À changer si tu veux durcir (cf. section 14 en fin de doc).

---

## 3. Users management

### `GET /api/admin/users`
Liste paginée des users avec filtres.
- **Query :**
  - `role: string?` — filtre exact sur `users.role`.
  - `banned: bool?` — filtre exact sur `users.is_banned`.
  - `q: string?` — full-text search sur `search_vector` (display_name + username).
  - `page: number = 1`
  - `per_page: number = 20` (clampé `[1, 50]`)
- **Response :**
  ```json
  {
    "data": [
      {
        "id": "<uuid>",
        "username": "…",
        "display_name": "…",
        "email": "…",
        "role": "user|mentor|admin|enterprise|recruiter",
        "title": "apprenti|artisan|maitre|legende",
        "total_fragments": 0,
        "is_banned": false,
        "profile_active": true,
        "created_at": "<ISO-8601>"
      }
    ],
    "pagination": { "page": 1, "per_page": 20, "total": 0, "total_pages": 0 }
  }
  ```
- **Errors :** `403`.
- **Side effects :** aucun.

### `GET /api/admin/users/{id}`
Détail d'un user + stats agrégées.
- **Path :** `id: uuid`
- **Response :**
  ```json
  {
    "user": {
      "id": "…", "email": "…", "username": "…", "display_name": "…",
      "skill_domain": "code|design|game|security|null",
      "role": "…", "title": "…",
      "total_fragments": 0, "streak_current": 0, "trust_score": 100.0,
      "country": "FRA", "email_verified": true, "profile_active": true, "is_banned": false,
      "created_at": "<ISO-8601>"
    },
    "reports_against": 0,
    "total_submissions": 0
  }
  ```
- **Errors :** `403`, `404` (user absent).

### `POST /api/admin/users/{id}/ban`
Bannit l'user (destructif, cascade).
- **Path :** `id: uuid`
- **Body :**
  ```json
  { "reason": "string (required)" }
  ```
- **Response :** `{ "message": "…", "reason": "…" }`
- **Errors :** `400` (self-ban, déjà banni, tentative de ban admin), `403`, `404`.
- **Side effects :**
  - `users` : `is_banned=TRUE`, `ban_reason`, `banned_at=NOW()`, `banned_by=<admin_id>`.
  - **Révoque toutes les sessions** (`SessionService::revoke_all`).
  - Révoque les refresh tokens Redis (`AuthService::revoke_refresh_token`).
  - Retire du leaderboard (`LeaderboardService::remove_user`).
  - Ferme les conversations (talent-side + enterprise-side).
  - Écrit dans l'audit log.
  - Notification push vers l'user banni.

### `POST /api/admin/users/{id}/unban`
Réactive un user précédemment banni.
- **Path :** `id: uuid`
- **Body :** aucun.
- **Response :** `{ "message": "…" }`
- **Errors :** `400` (pas banni), `403`, `404`.
- **Side effects :** `users` — `is_banned=FALSE`, `ban_reason=NULL`, `banned_at=NULL`, `banned_by=NULL`. Audit log. Notification.

### `POST /api/admin/users/{id}/reset-2fa` (BE-B, M0)
Wipe l'ensemble de la 2FA d'un user cible et révoque toutes ses sessions actives — pour cas de device perdu ou compromis. Un admin **ne peut pas** utiliser cet endpoint sur son propre compte.
- **Path :** `id: uuid`
- **Body :** `{ "reason": "string, ≥8 chars" }`
- **Response :** `{ "reset": true, "user_id": "…", "message": "…" }`
- **Errors :** `400` (reason trop courte), `403` (self-reset ou non-admin), `404`.
- **Side effects :** clear `users.totp_secret`, `totp_enabled=false`, delete `totp_backup_codes` + `webauthn_credentials`, revoke all `user_sessions`. Audit log obligatoire.
- **Front :** section "Récupération 2FA" sur `/users/[id]`, dialog `ConfirmDangerousDialog` avec `minReasonLength=8`.

---

## 4. Reports (modération)

### `GET /api/admin/reports`
Queue de signalements avec filtres.
- **Query :**
  - `status: "pending"|"resolved"|"dismissed"?`
  - `target_type: "user"|"challenge"|"message"|"enterprise"?`
  - `page: number = 1`
  - `per_page: number = 20` (clampé `[1, 50]`)
- **Response :**
  ```json
  {
    "data": [
      {
        "id": "<uuid>",
        "target_type": "…", "target_id": "…",
        "reason": "spam|harassment|inappropriate|cheating|fake_profile|other",
        "status": "pending|resolved|dismissed",
        "admin_note": "…|null",
        "reporter": { "id": "…", "username": "…", "display_name": "…", "email": "…" },
        "handled_by": "…|null", "handled_at": "<ISO-8601>|null",
        "created_at": "<ISO-8601>"
      }
    ],
    "pagination": { … }
  }
  ```

### `PUT /api/admin/reports/{id}`
Résout ou rejette un signalement.
- **Path :** `id: uuid`
- **Body :**
  ```json
  {
    "status": "resolved" | "dismissed",
    "admin_note": "string?"
  }
  ```
- **Response :** `{ "report": { … }, "message": "…" }`
- **Errors :** `400` (status invalide), `403`, `404` (déjà traité).
- **Side effects :** `reports.status`, `admin_note`, `handled_by`, `handled_at=NOW()` (uniquement si actuellement `pending`). Audit log.

### `GET /api/admin/dashboard/moderation`
KPIs de modération.
- **Response :**
  ```json
  {
    "banned_users": 0,
    "reports": { "pending": 0, "resolved": 0, "dismissed": 0, "total": 0 },
    "recent_bans_30d": 0,
    "admin_actions_today": 0
  }
  ```

---

## 5. Challenges (CRUD)

### `POST /api/admin/challenges`
Crée un challenge (status `draft` initial).
- **Body :**
  ```json
  {
    "title": "string (1-200)",
    "description": "string (non-empty)",
    "instructions": "string (non-empty)",
    "skill_domain": "code|design|game|security",
    "difficulty": 1,
    "mode": "solo|team",
    "duration_minutes": 60,
    "ai_allowed": false,
    "tone": "serious|fun|educational",
    "language": "string?",
    "prerequisite_fragments": 0,
    "reward_fragments": 10,
    "is_onboarding": false,
    "expected_output": "string?",
    "test_cases": { … arbitrary JSON … }
  }
  ```
  Optionnels : `mode` (default `"solo"`), `duration_minutes`, `ai_allowed` (default `false`), `tone` (default `"serious"`), `language`, `prerequisite_fragments` (default 0), `reward_fragments` (default 10), `is_onboarding` (default false), `expected_output`, `test_cases`.
- **Response :** `201 Created` + `{ "challenge": { …full row… } }`
- **Errors :** `400` (title vide/>200, description vide, instructions vide, difficulty hors [1..=5]), `403`.
- **Side effects :** `INSERT INTO challenges (…, status='draft', created_by=<admin_id>)`.

### `GET /api/admin/challenges`
Liste tous les challenges (tous statuts confondus).
- **Response :** `{ "challenges": [ { …full row… } ], "total": <int> }`.

### `PUT /api/admin/challenges/{id}`
Update partiel. Tous les champs sont optionnels ; seuls les non-null sont écrits.
- **Path :** `id: uuid`
- **Body :** mêmes champs que `POST`, tous `Option<T>`.
- **Response :** `{ "challenge": { … } }`.
- **Errors :** `403`, `404`.
- **Side effects :** `updated_at=NOW()`.

### `POST /api/admin/challenges/{id}/publish`
Bascule `status='published'`.
- **Path :** `id: uuid`
- **Body :** aucun.
- **Response :** `{ "challenge": { … } }`.
- **Errors :** `403`, `404`.

### `POST /api/admin/challenges/{id}/archive`
Bascule `status='archived'`.
- **Path :** `id: uuid`
- **Body :** aucun.
- **Response :** `{ "challenge": { … } }`.
- **Errors :** `403`, `404`.

---

## 6. Community challenges (review workflow)

Les challenges créés par la communauté ont un pipeline distinct (`community_status`).

### `GET /api/admin/community/review`
Queue des soumissions communautaires en attente (`community_status='review'`).
- **Response :**
  ```json
  {
    "challenges": [
      {
        "challenge": { … full row … },
        "creator": { "username": "…", "display_name": "…" }
      }
    ],
    "total": <int>
  }
  ```

### `POST /api/admin/community/{id}/approve`
Approuve et publie (status `published`).
- **Path :** `id: uuid`
- **Body :** aucun.
- **Response :** `{ "challenge": { … }, "message": "…" }`.
- **Errors :** `403`, `404` (pas en review).
- **Side effects :** `community_status='approved'`, `status='published'`, notification au créateur.

### `POST /api/admin/community/{id}/reject`
Rejette avec feedback.
- **Path :** `id: uuid`
- **Body :**
  ```json
  { "feedback": "string (required)" }
  ```
- **Response :** `{ "challenge": { … }, "message": "…" }`.
- **Errors :** `403`, `404`.
- **Side effects :** `community_status='rejected'`, `review_feedback=<feedback>`, notification au créateur.

---

## 7. Dashboards & KPIs

### `GET /api/admin/stats`
Stats globales tech + product.
- **Response :**
  ```json
  {
    "users": { "total": 0, "active": 0 },
    "challenges": { "total": 0, "published": 0 },
    "submissions": { "total": 0 },
    "websocket": { "connections": 0, "rooms": 0, "users": 0 }
  }
  ```

### `GET /api/admin/dashboard/overview`
Business overview (top of funnel).
- **Response :**
  ```json
  {
    "signups_today": 0,
    "enterprises_total": 0,
    "paying_enterprises": 0,
    "hires_this_month": 0,
    "mrr_eur_cents": 0,
    "refund_rate_pct_30d": 0.0
  }
  ```

### `GET /api/admin/dashboard/financial`
Vue finance courante.
- **Response :**
  ```json
  {
    "month_revenue_ttc_cents": 0,
    "month_invoices_count": 0,
    "primary_currency": "EUR",
    "purchases_breakdown": [
      { "session_group": "…", "purchases": 0, "credits_total": 0 }
    ]
  }
  ```

### `GET /api/admin/dashboard/moderation-queue`
Queue globale des items à traiter.
- **Response :**
  ```json
  {
    "reports_pending": 0,
    "kyc_pending": 0,
    "sponsored_requests_pending": 0,
    "banned_last_30d": 0
  }
  ```

### `GET /api/admin/dashboard/health`
Sanity de l'infra + erreurs récentes.
- **Response :**
  ```json
  {
    "database": { "pool_size": 20, "pool_idle": 15 },
    "websocket": { "connections": 0, "rooms": 0, "users": 0 },
    "recent_error_events_30m": 0
  }
  ```

---

## 8. Audit logs

Deux journaux distincts, l'ancien reste pour compat.

### `GET /api/admin/audit-log/generic`
Journal générique (nouveau format), pagination + filtres.
- **Query :**
  - `actor_type: string?` (user, admin, system, api_key…)
  - `actor_id: uuid?`
  - `action: string?`
  - `target_type: string?`
  - `target_id: uuid?`
  - `page: number = 1`
  - `per_page: number = 50` (clampé `[1, 200]`)
- **Response :**
  ```json
  {
    "data": [
      {
        "id": "…", "actor_type": "…", "actor_id": "…|null",
        "action": "…", "target_type": "…|null", "target_id": "…|null",
        "metadata": { … arbitrary JSON … },
        "ip": "…|null", "user_agent": "…|null",
        "created_at": "<ISO-8601>"
      }
    ],
    "pagination": { "page": 1, "per_page": 50, "returned": 0 }
  }
  ```

### `GET /api/admin/audit-log`
Journal legacy (spécifique moderation).
- **Query :** `action: string?`, `page`, `per_page`.
- **Response :** structure similaire — champs `admin_id`, `target_type`, `target_id`, `details`, `ip_address`, `created_at`.

---

## 9. Enterprise KYC

### `GET /api/admin/enterprise-kyc`
Queue KYC (LIMIT 200 hard-coded).
- **Response :**
  ```json
  {
    "queue": [
      {
        "enterprise_id": "…", "company_name": "…",
        "level": "none|basic|full",
        "status": "pending|approved|rejected",
        "monthly_spend_eur_cents": 0,
        "documents_count": 0,
        "updated_at": "<ISO-8601>"
      }
    ]
  }
  ```

### `POST /api/admin/enterprise-kyc/{enterprise_id}/decide`
Approve ou reject.
- **Path :** `enterprise_id: uuid`
- **Body :**
  ```json
  {
    "action": "approve" | "reject",
    "level": "basic" | "full",
    "reason": "string?"
  }
  ```
  - Sur `approve` : `level` optionnel (default `basic`).
  - Sur `reject` : `reason` recommandé (stocké dans `rejection_reason`).
- **Response :** `{ "decided": true, "action": "approve|reject" }`.
- **Errors :** `400` (action invalide, level invalide), `403`.
- **Side effects :** `enterprise_kyc.status`, `level`, `reviewed_by_user_id`, `reviewed_at=NOW()`, `rejection_reason`. Metrics `skilluv_kyc_approved_total` ou `skilluv_kyc_rejected_total`.

---

## 10. Tenants (white-label)

### `GET /api/admin/tenants`
Liste des tenants.
- **Response :**
  ```json
  {
    "tenants": [
      {
        "id": "…", "slug": "…", "name": "…",
        "subdomain": "…|null",
        "plan": "starter|pro|enterprise",
        "max_users": 100,
        "active": true,
        "members_count": 0,
        "created_at": "<ISO-8601>"
      }
    ]
  }
  ```

### `POST /api/admin/tenants`
Crée un tenant.
- **Body :**
  ```json
  {
    "slug": "acme",
    "name": "Acme Corp",
    "subdomain": "acme",
    "contact_email": "billing@acme.com",
    "plan": "starter",
    "max_users": 100,
    "primary_color": "#6C5CE7",
    "logo_url": "https://…"
  }
  ```
  Requis : `slug`, `name`, `contact_email`. `slug` doit matcher `[a-z0-9-]{2,}`. `plan` ∈ `{starter, pro, enterprise}` (default `starter`). `max_users` default 100. `primary_color` default `#6C5CE7`.
- **Response :** `{ "tenant_id": "<uuid>" }`.
- **Errors :** `400` (slug invalide, plan invalide), `403`.
- **Side effects :** `INSERT INTO tenants`. Counter `skilluv_tenants_created_total`.

### `GET /api/admin/tenants/{id}`
Détail complet d'un tenant.
- **Response :** tous les champs de la table (id, slug, name, subdomain, custom_domain, logo_url, primary_color, secondary_color, plan, max_users, active, contact_email, settings, created_at, updated_at).

### `PUT /api/admin/tenants/{id}`
Update partiel.
- **Body :** tous les champs de create + `custom_domain`, `secondary_color`, `active`, `settings` (jsonb). Tous optionnels.
- **Response :** `{ "updated": true }`.
- **Side effects :** `updated_at=NOW()`.

### `GET /api/admin/tenants/{id}/members`
Membres du tenant (LIMIT 500).
- **Response :**
  ```json
  {
    "members": [
      { "user_id": "…", "username": "…", "display_name": "…", "email": "…",
        "role": "member|instructor|admin|owner", "joined_at": "<ISO-8601>" }
    ]
  }
  ```

### `POST /api/admin/tenants/{id}/members`
Ajoute un user au tenant.
- **Body :**
  ```json
  { "user_id": "<uuid>", "role": "member|instructor|admin|owner" }
  ```
  `role` optionnel (default `"member"`).
- **Response :** `{ "added": true }`.
- **Errors :** `400` (role invalide, quota `max_users` atteint), `403`.
- **Side effects :** UPSERT dans `tenant_memberships`.

### `GET /api/admin/tenants/{id}/cohorts`
Liste des cohortes d'un tenant.
- **Response :**
  ```json
  {
    "cohorts": [
      { "id": "…", "name": "…",
        "starts_at": "<ISO-8601>|null", "ends_at": "<ISO-8601>|null",
        "active": true, "members_count": 0 }
    ]
  }
  ```

### `POST /api/admin/tenants/{id}/cohorts`
Crée une cohorte.
- **Body :**
  ```json
  {
    "name": "Q1 2026",
    "starts_at": "<ISO-8601>?",
    "ends_at": "<ISO-8601>?"
  }
  ```
- **Response :** `{ "cohort_id": "<uuid>" }`.

---

## 11. Tournaments & seasons

### `POST /api/admin/seasons`
Crée une saison.
- **Body :** `tournament::CreateSeasonInput` (nom, dates, config). Voir `services/tournament.rs`.
- **Response :** `{ "season": { … } }`.

### `POST /api/admin/seasons/{id}/status`
Change le statut de saison.
- **Body :** `{ "status": "string (required)" }`
- **Response :** `{ "season": { … } }`.

### `POST /api/admin/seasons/{id}/close`
Ferme une saison (side effects : rewards, notifications).
- **Body :** aucun.
- **Response :** `{ "close_report": { … } }`.
- **Side effects :** counter incrémenté.

### `POST /api/admin/tournaments`
Crée un tournoi. Body = `tournament::CreateTournamentInput`.

### `POST /api/admin/tournaments/{id}/status`
Change le statut du tournoi.
- **Body :** `{ "status": "string" }`.

### `POST /api/admin/tournaments/{id}/score`
Écrit un score participant (override manuel).
- **Body :**
  ```json
  {
    "participant_type": "user" | "guild",
    "participant_id": "<uuid>",
    "score": 42
  }
  ```
- **Response :** `{ "updated": true }`.

### `POST /api/admin/tournaments/{id}/conclude`
Conclusion du tournoi + rewards + notifications top 3.
- **Body :** aucun.
- **Response :** `{ "conclusion": { … } }`.

---

## 12. Sponsored challenges

### `GET /api/admin/sponsored-challenges`
Queue des demandes (LIMIT 200).
- **Response :**
  ```json
  {
    "requests": [
      {
        "id": "…", "enterprise_id": "…", "proposed_title": "…",
        "status": "pending|approved|negotiating|rejected|linked",
        "brief": "…", "skill_domain": "…", "difficulty": 3,
        "duration_days": 30, "budget_eur_cents": 100000,
        "challenge_id": "…|null",
        "created_at": "<ISO-8601>"
      }
    ]
  }
  ```

### `POST /api/admin/sponsored-challenges/{id}/decide`
- **Path :** `id: uuid`
- **Body :**
  ```json
  { "action": "approve" | "reject" | "negotiate", "admin_notes": "string?" }
  ```
- **Response :** `{ "id": "…", "status": "…" }`.
- **Side effects :** `status`, `admin_notes`, `decided_by_user_id`, `decided_at=NOW()`.

### `POST /api/admin/sponsored-challenges/{id}/link`
Lie une demande approuvée à un challenge concret.
- **Path :** `id: uuid`
- **Body :**
  ```json
  {
    "challenge_id": "<uuid>",
    "sponsor_logo_url": "string?",
    "sponsor_blurb": "string?",
    "sponsor_visible_until": "<ISO-8601>",
    "free_contact_until": "<ISO-8601>"
  }
  ```
- **Response :** `{ "linked": true, "challenge_id": "…" }`.
- **Errors :** `400` (request pas approved/negotiating), `404`, `403`.
- **Side effects :** transaction — update `challenges`, upsert `sponsor_challenge_access`, update `sponsored_challenge_requests`. Counter incrémenté.

---

## 13. SSO sessions (enterprise)

### `GET /api/admin/sso/sessions`
Liste paginée des sessions SSO actives.
- **Query :**
  - `enterprise_id: uuid?` (filtre par enterprise)
  - `page: number = 1`
  - `per_page: number = 50` (clampé `[1, 200]`)
- **Response :**
  ```json
  {
    "sessions": [
      {
        "session_id": "…", "user_id": "…", "user_email": "…", "user_username": "…",
        "enterprise_id": "…", "enterprise_slug": "…", "company_name": "…",
        "ip": "…|null", "user_agent": "…|null",
        "created_at": "<ISO-8601>", "last_used_at": "<ISO-8601>"
      }
    ],
    "pagination": { … }
  }
  ```

### `POST /api/admin/sso/sessions/{id}/revoke`
Révoque une session SSO (rejet immédiat au prochain access token check).
- **Path :** `session_id: uuid`
- **Body :** aucun.
- **Response :** `{ "revoked": true }`.
- **Errors :** `404` (session absente ou déjà révoquée), `403`.
- **Side effects :** `UPDATE user_sessions SET revoked_at=NOW() WHERE login_method='sso'`.

---

## 14. Guilds, AI jobs, digest, GitHub, accounting

### `POST /api/admin/guilds/{id}/dissolve`
Dissout intégralement une guilde.
- **Body :** aucun. **Response :** `{ "dissolved": true }`.
- **Side effects :** cascade sur wars, memberships, chat, etc. (`guild::admin_dissolve`).

### `POST /api/guild-wars/{id}/conclude`
Conclusion manuelle d'une guerre entre guildes.
- **Body :** `{ "winner_guild_id": "<uuid>" }`
- **Response :** `{ "war": { … } }`.
- **Side effects :** rewards distribués, notifications top 3.

### `POST /api/admin/ai/hidden-gems`
Lance un job async "Hidden Gems".
- **Body :** JSON libre.
- **Response :** `{ "job_id": "<string>" }`.
- **Side effects :** enqueue Redis.

### `POST /api/admin/ai/churn`
Lance un job async "Churn Analysis".
- **Body :** JSON libre.
- **Response :** `{ "job_id": "<string>" }`.

### `POST /api/admin/digest/run-weekly`
Force l'envoi de la digest hebdo (production : cronné, ici c'est le hook manuel).
- **Body :** aucun.
- **Response :** `{ "digest": { … report … } }`.
- **Side effects :** envoi email à tous les users éligibles.

### `POST /api/admin/github/sync/{user_id}`
Force la synchro GitHub d'un user.
- **Path :** `user_id: uuid`.
- **Body :** aucun.
- **Response :** `{ "sync": { … report … } }`.

### `POST /api/admin/leaderboards/rebuild`
Rebuild complet des leaderboards depuis la DB.
- **Body :** aucun.
- **Response :** `{ "message": "Leaderboards rebuilt successfully" }`.
- **Side effects :** clear + re-seed Redis (`LeaderboardService::seed_from_db`).

### `GET /api/admin/accounting/export`
Export CSV comptabilité (une ligne par facture).
- **Query :**
  - `year: number = <current>`
  - `month: number = <current>`
- **Response :** `text/csv` — colonnes :
  ```
  invoice_number, issued_at, company, country, amount_ht, amount_tva, amount_ttc, tva_rate, currency, payment_intent
  ```
- **Errors :** `403`.

---

## 13. Capabilities (P18.4, ADM-M1)

Rôles fonctionnels attachés à un user via `user_capabilities`. Le CRUD front vit sur `/users/[id]`.

### `GET /api/users/{id}/capabilities`
Public (pas de guard admin). Retourne uniquement les capabilities **actives** (non révoquées, non expirées).
- **Path :** `id: uuid`
- **Response :**
  ```json
  {
    "user_id": "…",
    "capabilities": [
      {
        "capability": "mentor",
        "granted_at": "…",
        "granted_reason": "…",
        "expires_at": null
      }
    ]
  }
  ```

### `POST /api/admin/users/{id}/capabilities`
Grant une capability à un user.
- **Path :** `id: uuid`
- **Body :**
  ```json
  {
    "capability": "mentor",
    "granted_reason": "Q3 promotion",
    "expires_at": "2027-01-01T00:00:00Z"
  }
  ```
  `granted_reason` et `expires_at` sont optionnels côté back mais **rendus obligatoires côté front** (min 8 chars) pour la traçabilité.
- **Response 201 :** `{ "granted": true, "user_id": "…", "capability": "mentor" }`
- **Errors :** `400` (capability invalide), `403`, `409` (déjà active).

### `DELETE /api/admin/users/{id}/capabilities/{cap}`
Revoke une capability. Backend génère `revoked_reason = "admin_revoke:by_{admin_id}"` côté serveur — pas de body à envoyer.
- **Path :** `id: uuid`, `cap: string`
- **Body :** aucun.
- **Response :** `{ "revoked": true, "user_id": "…", "capability": "…" }`

**Enum `capability`** (14 valeurs) :
`challenger | mentor | project_steward | pr_reviewer | bounty_funder | issue_proposer | jury_tournament | admin | enterprise_recruiter | community_moderator | forum_moderator | plagiarism_reviewer | kyc_reviewer | community_curator`

**Gaps** : audit log pas encore branché côté back (tracké). Historique révoqués pas exposé.

---

## 14. Fraud (P14.5, ADM-M2)

Triage des livrables plagiés, comptes multi-suspects, re-évaluation LLM. Front sur `/fraud`.

### `GET /api/admin/fraud/queue`
Queue combinée des livrables signalés (plagiat) et users suspectés (multi-account).
- **Query :** `threshold: float=0.9`, `limit: i64=50` (clampé `[1, 200]`)
- **Response :**
  ```json
  {
    "flagged_deliverables": [
      { "deliverable_id": "…", "plagiarism_score": "0.923", "similar_to": "…" }
    ],
    "suspected_users": [
      { "user_id": "…", "flagged_at": "…", "reason": "shared_ip_ua" }
    ]
  }
  ```
- **Note :** `plagiarism_score` est un `NUMERIC(4,3)` sérialisé en string par sqlx.

### `POST /api/admin/fraud/deliverables/{id}/mark-valid`
Marque un livrable flaggué comme faux positif (clear `plagiarism_score`).
- **Body :** aucun.
- **Response :** `{ "marked_valid": true }`

### `POST /api/admin/fraud/deliverables/{id}/revoke`
Révoque un livrable frauduleux (perte des fragments côté user).
- **Body :** `{ "reason": "string, optional" }`
- **Response :** `{ "revoked": true }`
- **Front :** `ConfirmDangerousDialog` avec reason obligatoire.

### `POST /api/admin/fraud/users/{id}/mark-valid`
Marque un user suspecté multi-account comme faux positif.
- **Body :** aucun.
- **Response :** `{ "marked_valid": true }`

### `POST /api/admin/fraud/scan-deliverable/{id}`
Recompute la similarité cosinus d'un livrable donné.
- **Query :** `threshold: f32=0.9`, `window_days: i32=30`
- **Response :**
  ```json
  {
    "deliverable_id": "…",
    "best_match_id": "…",
    "best_score": 0.87,
    "compared_count": 42
  }
  ```

### `POST /api/admin/fraud/detect-multi-accounts`
Lance une passe de détection sur les signups récents.
- **Body :** `{ "window_hours": 24, "min_group_size": 3 }` (les deux optionnels).
- **Response :**
  ```json
  {
    "groups_detected": 2,
    "users_flagged": 6,
    "groups": [
      { "shared_ip": "<sha256>", "shared_ua": "<sha256>", "user_ids": ["…", "…"] }
    ]
  }
  ```
- **Note :** IP et User-Agent sont hashés SHA-256 côté back — jamais en clair.

### `POST /api/admin/fraud/llm-evaluate/{id}` (P15.2)
Re-évaluation d'un livrable via `skilluv-ia` (code_reviewer service).
- **Body :** aucun.
- **Response :**
  ```json
  {
    "deliverable_id": "…",
    "new_status": "verified|pending_manual_review",
    "score": 0.82,
    "llm_reachable": true,
    "notes": "…"
  }
  ```
- **Auto-threshold :** 0.7 (>= 0.7 → verified, sinon pending).
- **Fallback :** si `llm_reachable=false`, statut = `pending_manual_review`.

**Gaps** : aucun endpoint fraud n'écrit dans l'audit log côté back — front affiche un warning permanent.

---

## 15. Récapitulatif par domaine

| Domaine | Endpoints | Notes |
|---|---:|---|
| Users management | 5 | ban/unban destructifs + reset-2fa admin-to-admin (M0) |
| Reports | 3 | queue + résolution + KPIs |
| Challenges CRUD | 5 | create/read/update/publish/archive |
| Community review | 3 | pipeline distinct (`community_status`) |
| Dashboards & KPIs | 5 | overview / financial / moderation-queue / health / stats |
| Audit logs | 2 | append-only depuis M0 (migration 0099) |
| Enterprise KYC | 2 | approve/reject avec niveaux |
| Tenants (white-label) | 7 | CRUD + members + cohorts |
| Tournaments & seasons | 7 | create + status + score + conclude |
| Sponsored challenges | 3 | decide + link |
| SSO sessions | 2 | list + revoke (avec reason M0) |
| **Capabilities (M1)** | **3** | grant/revoke + read public |
| **Fraud (M2)** | **7** | queue + revoke/mark valid + scan + detect + LLM eval |
| Autres (guilds, AI, digest, GitHub, accounting, leaderboards) | 8 | one-shot triggers |
| **Total** | **48** | |

---

## 16. Sécurité — checklist de durcissement

État à jour post-ADM-M0.

### Livrés (P1+P2 back, commit front `b614ba4`)

- **2FA obligatoire pour admin** : livré via soft flag `requires_totp_setup` au login + middleware `ensure_admin_2fa` qui renvoie 403 `AUTH_ADMIN_2FA_SETUP_REQUIRED` sur `/api/admin/*`. Front redirige vers `/auth/setup-2fa`. Recovery : `/auth/recovery-2fa` avec code de secours à usage unique + endpoint admin-to-admin `POST /api/admin/users/{id}/reset-2fa`.
- **Origin check server-side** : middleware `ensure_admin_origin` sur `/api/admin/*`, renvoie 403 `AUTH_ADMIN_ORIGIN_REQUIRED`. Origins configurés via env `ADMIN_ORIGINS` (comma-separated).
- **Rate-limit destructif** : middleware `enforce_admin_destructive` — 10 req/min + 100 req/heure par admin via Redis sliding-window.
- **Audit log complet** : append-only via migration 0099 (REVOKE UPDATE/DELETE + rôle `audit_admin` SELECT-only + advisory lock cross-DB). Handlers legacy instrumentés (KYC decide, community approve/reject, SSO revoke, tournament conclude).
- **Dry-run mode** : helper `is_admin_dry_run()` + env `SKILLUV_ADMIN_DRY_RUN=1`.

### Deferred post-MVP

- **Circuit breaker** (lock 15min sur 5 échecs consécutifs) : le rate-limit Redis suffit tant que la prod ne montre pas de patterns d'erreur en cascade.
- **Export S3 audit** : doc écrite (`docs/AUDIT-APPEND-ONLY.md` back), code stub livré. Attend crate `aws-sdk-s3` + bucket Object Lock provisionné.
- **IP allowlist** : reportée en option on-prem (env `SKILLUV_ADMIN_IP_ALLOWLIST`) car incompatible avec les admins en mobilité sur le SaaS public.

### Gaps identifiés en aval (à combler post-MVP)

- Aucun endpoint fraud (P14.5) n'écrit dans `audit_log` — front affiche un warning permanent sur `/fraud`.
- Aucun endpoint capabilities (P18.4) n'écrit dans `audit_log` — même transparence côté front.
- Recompute-capabilities existe en interne (`capabilities_engine.rs:33`) mais **n'est pas exposé** en HTTP — bloque partiellement le futur ADM-M5.

---

## 17. Post-MVP Tier 1 / 2 / 3 (SKI-36 → SKI-47)

Les 12 tickets des projets Linear *Post-MVP Tier 1 / 2 / 3* sont livrés côté backend. La majorité est **scopée sur l'appelant** : bookmarks (SKI-36), notes privées (SKI-37), objectifs (SKI-38), peer matching (SKI-41) et compagnon IA (SKI-44) n'exposent **aucune route admin ni modération** — le backend lit toujours `user_id` depuis le JWT, jamais depuis le path. Rien à consommer côté admin pour ces cinq-là.

Les six routes ci-dessous sont la surface réellement atteignable par un opérateur, et sont toutes consommées par l'app.

### Gate : `admin` vs capability

Deux routes seulement passent par `admin_gate` (origine admin + 2FA + capability `admin`) :

- `POST /api/admin/users/{id}/backfill-timeline`
- `PUT /api/admin/skills/{id}/prerequisites`

Les autres sont sous `/api/moderation/*` et sont gatées par **capability**, pas par `role='admin'` :

| Route | Capabilities acceptées |
|---|---|
| `GET /api/moderation/external-signals` | `community_moderator`, `community_curator` |
| `POST /api/moderation/external-signals/{id}/verify` | idem |
| `DELETE /api/moderation/external-signals/{id}` | idem |
| `POST /api/moderation/vouchings/{id}/break` | `community_moderator`, `plagiarism_reviewer` |

Un admin sans la capability reçoit `403`. L'écran `/external-signals` détecte ce cas et nomme la capability manquante au lieu d'afficher une file vide — elle se corrige depuis la fiche utilisateur (section Capabilities, ADM-M1).

### 17.1 Timeline profil (SKI-39)

- `GET /api/users/{id}/timeline?event_type&limit&offset` — public, mais soumis à la visibilité du profil : un profil masqué ou banni répond `404`, y compris pour un admin.
  - `data: { events[], total, limit, offset }`, `limit` clampé `[1, 100]` (défaut 50).
  - `event_type` ∈ `signup | orientation_added | deliverable_verified | rank_promoted | capability_granted | attestation_received | event_participation | first_bounty_earned | first_mentor_session`.
- `POST /api/admin/users/{id}/backfill-timeline` — rejoue la timeline depuis les tables sources. **Idempotent** : `rows_inserted: 0` est la réponse normale et le but de l'opération.
  - `data: { user_id, rows_inserted, detail: { <event_type>: number } }`.

**Consommé par** : `UserTimelineSection.svelte` sur `/users/{id}`.

### 17.2 Signaux externes (SKI-42)

- `GET /api/moderation/external-signals?limit` — file de revue, non vérifiés uniquement, plus anciens d'abord. `limit` clampé `[1, 200]` (défaut 50).
- `POST /api/moderation/external-signals/{id}/verify` — pose `verified_at`, `verification_method='manual_review'`, `verified_by`. `404` si déjà vérifié.
- `DELETE /api/moderation/external-signals/{id}` — `204`, définitif.
- `GET /api/users/{id}/external-signals` — vue profil, réponse **toujours scindée** en `{ verified[], declared[], disclaimer }`.

La séparation `verified` / `declared` est la feature : un signal externe est du contexte, jamais une preuve. Ni la vérification ni l'affichage ne touchent `weighted_proven_count`, le rang ou les badges (migration 0145). L'UI ne fusionne jamais les deux listes.

**Consommé par** : page `/external-signals` (file) + `UserExternalSignalsSection.svelte` (par profil).

### 17.3 Vouchings (SKI-46)

- `GET /api/users/{id}/vouchings` — vouchings **vivants** uniquement (ni rompus, ni expirés), avec le parrain résolu : `{ id, voucher_id, voucher_display_name, statement, active_until, at_stake_kind }`.
- `POST /api/moderation/vouchings/{id}/break` — body `{ reason }`, 8 caractères minimum.
  - `data: { vouching, penalty_applied, voucher_rank_before, voucher_rank_effective, penalty_until }`.
  - Coût : le parrain perd un rang pendant 90 jours quand `at_stake_kind = 'rank_temporary'`.

Rompre un vouching est un endpoint explicite, jamais un effet de bord d'un flag fraude posé ailleurs.

**Consommé par** : `UserVouchingsSection.svelte` sur `/users/{id}`.

### 17.4 Skill tree & prérequis (SKI-47)

- `GET /api/users/{id}/skill-tree?domain` — catalogue **complet** avec le statut de l'utilisateur par nœud, plus `counts` par statut. Non paginé : un fragment d'arbre n'est pas affichable. `domain` ∈ `code | design | game | security | soft_skills | ai | ops`.
  - Chaque nœud porte `prerequisite_skill_ids`, `missing_prerequisites[]`, `status` ∈ `locked | unlocked | in_progress | mastered`, `proven_count`, `proficiency_level`, `children[]`.
- `PUT /api/admin/skills/{id}/prerequisites` — body `{ prerequisite_skill_ids: [] }`, **liste complète en remplacement**. Tableau vide = effacement. Refusé si cycle, plafonné à 20 entrées.

À noter : `GET /api/admin/skills` ne renvoie **pas** `prerequisite_skill_ids`. L'éditeur de prérequis lit donc le catalogue via le skill-tree de l'admin connecté et l'aplatit — c'est le seul endpoint qui expose le catalogue complet avec ses prérequis.

**Consommé par** : `UserSkillTreeSection.svelte` sur `/users/{id}` + `SkillPrerequisitesModal.svelte` sur `/skills`.

### 17.5 Cohortes (SKI-40) — lecture seule

- `GET /api/cohorts?orientation&upcoming_only&limit&offset` — découverte : cohortes **publiques non archivées** uniquement.
- `GET /api/cohorts/{id}`, `GET /api/cohorts/{id}/members`, `GET /api/cohorts/{id}/milestones`.

Le backend n'expose **aucun override admin** : une cohorte est éditée par son organisateur, les cohortes privées restent invisibles même pour un admin, et il n'existe pas de route pour archiver une cohorte abusive depuis l'admin. C'est un gap connu, listé en 17.7.

### 17.6 Offres de talents (SKI-45) — lecture seule

- `GET /api/talent-offers?offer_type&skill&free_only&limit&offset` — browse public. Seules les offres actives d'auteurs Artisan+ non pénalisés et non masqués apparaissent.
  - `offer_type` ∈ `pair_programming | code_review | whiteboard | mock_interview | career_advice`.
  - `price_cents_per_hour: null` = offre gratuite.

Là encore, pas de route de modération : une offre est éditée ou supprimée par son auteur.

**17.5 et 17.6 consommés par** : page `/engagement` (deux onglets).

### 17.7 Gaps backend identifiés

Tous ticketés côté backend. L'app admin est prête à les consommer dès livraison — aucun de ces gaps ne demande de travail front en amont.

| Gap | Ticket |
|---|---|
| **Cohortes** — aucun moyen d'archiver ou de dépublier une cohorte abusive depuis l'admin, et les cohortes privées restent invisibles. | [SKI-295](https://linear.app/skilluv/issue/SKI-295) |
| **Offres de talents** — aucun moyen de désactiver une offre abusive depuis l'admin. | [SKI-296](https://linear.app/skilluv/issue/SKI-296) |
| **Vouchings** — pas de file globale : un vouching n'est atteignable qu'en passant par la fiche du filleul, et les vouchings rompus ne sont lisibles nulle part. | [SKI-297](https://linear.app/skilluv/issue/SKI-297) |
| **Compagnon IA (SKI-44)** — `ai_interactions` n'a pas de projection admin (volume, coût, quotas, ledger de disclosure par user), alors que la maîtrise des coûts LLM est un prérequis explicite du ticket. | [SKI-298](https://linear.app/skilluv/issue/SKI-298) |
| **Audit log** — aucune des routes de la section 17 n'écrit dans `audit_log`, y compris les deux destructrices (`break vouching`, `DELETE external-signal`). Même gap que fraud et capabilities (cf. section 16). | [SKI-299](https://linear.app/skilluv/issue/SKI-299) |

---

## 18. Skilluv Design — 26 orientations (branche `feat/design-orientations-workflow`)

Le projet Linear *Skilluv Design* a deux tickets explicitement ADMIN — [SKI-205](https://linear.app/skilluv/issue/SKI-205) (`/admin/design`, 7 pages) et [SKI-249](https://linear.app/skilluv/issue/SKI-249) (`/admin/design-missions`). **Aucun des endpoints qu'ils spécifient n'existe** : il n'y a pas une seule route `/api/admin/design*` dans la branche backend, et `missions.rs` n'a aucune route admin. Les deux tickets restent donc bloqués côté backend.

Ce qui est livré et consommable est ailleurs : la boucle de critique, le profil, le score, et les enums que l'app admin avait laissés dériver.

### 18.1 Le décalage d'enums, et pourquoi il bloquait

Trois listes en dur de l'app admin ne suivaient plus le backend. La première était un blocage fonctionnel réel :

| Enum | État avant | Conséquence |
|---|---|---|
| `Capability` | 14 valeurs + `challenge_validator:{domain}` | Les 14 `design_reviewer:*` étaient **ingrantables depuis l'admin** alors que la CHECK backend les accepte. Sans elles, aucun reviewer design ne peut être nommé, et la boucle de critique n'a personne pour la faire tourner. Idem pour les 9 `code_reviewer:*`, les 6 `ai_reviewer:*` et les 2 capabilities du sas débutant. |
| `TournamentKind` | `individual \| guild_war \| hackathon` | Les contests design (`brief_contest`) étaient **incréables**, ainsi que `duel`, `code_golf`, `tdd_contest`, `marathon`, `defi_solitaire`, `benchmark_rush`. |
| `SliceStatus` | 10 statuts | `in_iteration` absent : une slice design en cours d'itération était invisible et infiltrable dans `/slices` et dans les analytics. |

L'autorité pour les capabilities est la **CHECK constraint courante** (migration 0229), pas les migrations antérieures : elle est remplacée en entier à chaque extension et restate tout ce que 0094, 0098, 0117, 0120, 0176 et 0210 avaient ajouté.

Les capabilities scopées sont maintenant rendues par famille (`design_reviewer` → « Reviewer design — motion ») plutôt que par 45 chaînes traduites : le scope après le `:` est le slug backend, le même que celui posé sur `orientations.reviewer_group`, et le traduire découplerait le libellé de la valeur réellement accordée.

### 18.2 Boucle de critique (SKI-194/198/199/200)

Design ne réutilise pas le workflow de validation code, et pour une raison de fond : il n'y a pas de signal CI qui dise que le travail est prêt à être regardé, et le verdict n'est pas binaire — l'issue ordinaire d'une review design est « refais un tour ».

```
claimed / in_progress → pending_validation → ├── approve  → validated
                                             ├── iterate  → in_iteration → (round suivant)
                                             └── reject   → closed
```

- `GET /api/design/reviews/queue?limit` — slices design en attente de critique, plus anciennes d'abord. **Scopée par capability** : `admin` et `design_reviewer:all` sont les deux wildcards, sinon la file est réduite aux familles détenues. Un reviewer ne voit jamais la slice qu'il a claim lui-même. Renvoie une liste vide (pas un 403) quand l'appelant n'a aucune capability design — l'écran le dit au lieu de laisser croire qu'il n'y a rien à traiter.
- `GET /api/design/slices/{id}/reviews` — tout l'historique, round le plus ancien d'abord. **Public** : la séquence des rounds est la chose la plus convaincante qu'un designer puisse montrer.
- Plafond de 5 rounds (migration 0184, partagé par tous les domaines). Au-delà, le problème est le brief, pas le travail.
- 10 motifs de blocage (migration 0232), 12 sous-types de livrable (0231), 13 familles de reviewer (0229).

**Consommé par** : page `/design`, onglet « File de critique » + modale historique.

### 18.3 Profil et craft score (SKI-251)

- `GET /api/users/{username}/design-profile` — adressé par **username**, pas par id : c'est la route de profil public. Un profil masqué répond 404, même réponse qu'un compte inexistant.
  - `craft_score` avec son `breakdown` terme par terme — l'app n'affiche jamais un score qu'elle ne peut pas expliquer.
  - `artefacts[]` avec `rounds` et `grid_average` : converger au quatrième round est une meilleure histoire que passer au premier, et c'est ce que la trace d'itération existe pour montrer.
  - `contests[]`, `trades[]`, `attestations[]`.
- `GET /api/design/tiers` — paliers, pondérations et plafond. Publié parce qu'un classement dont les règles sont privées est un classement que personne ne peut contester.

**Consommé par** : `UserDesignProfileSection.svelte` sur `/users/{id}` (chargé à la demande — le score est recalculé à chaque lecture) + onglet « Barème » de `/design`.

### 18.4 Contests design — ce sont des tournois

Il n'y a pas d'endpoint de contest design, et ce n'est pas un oubli : un contest est le même événement quel que soit le sujet. Un contest design est un **`brief_contest` avec `skill_domain = 'design'`** sur les routes tournoi existantes ; un duel design est un `duel` avec le même domaine.

`POST /api/admin/tournaments` accepte donc `skill_domain` et `rules`, et `services::contest::validate_rules` **refuse la création** si les règles du kind manquent :

| Kind | `rules` obligatoires |
|---|---|
| `brief_contest` | `brief` (≥ 200 caractères), `judging_criteria` |
| `hackathon` | `theme` |
| `code_golf` | `language`, `problem_url` |
| `tdd_contest` | `problem_url`, `judging_criteria` |
| `marathon` | `target_merged_prs` |
| `duel` | `task`, `duration_hours` |

Vérifié à la création plutôt qu'à la soumission : un contest dont les règles manquent n'est pas un contest avec un champ vide, c'est une annonce sur laquelle personne ne peut agir. Le formulaire `/tournaments` collecte ces champs selon le kind et refuse avant le round trip, y compris le minimum de 200 caractères du brief.

### 18.5 Ce qui a bougé depuis

Cette section listait SKI-205 et SKI-249 comme bloqués côté backend. Ils ne le sont plus : l'essentiel de ce qu'ils demandent existe, ailleurs et volontairement — un contest design est un tournoi, une mission design est une mission, un dossier de plagiat est transverse. Voir la **section 21**, qui dit route par route où chaque morceau a atterri, et la **section 20** pour les missions.

Ce qui manque réellement est réduit à trois points, listés en 21.2.

---

> **Language note.** Sections 19 and 20 are written in English. This is a
> public repository and English is its default language; the French sections
> above predate that decision and are kept as they are rather than
> half-translated.

## 19. Skilluv Cyber — reported vulnerabilities

**Linear** : projet « Skilluv Cyber — Full workflow », tickets SKI-120 (F-05),
SKI-127 (T-04) and the W-01..W-05 workflow tickets.

### 19.1 Three actors, not one admin

`admin` in the path says which surface this is, not who may reach it. The
backend recognises three unequal actors, and the inequality is the design:

| Actor | May | May not |
|---|---|---|
| `security_triager` | read the queue, triage, mark not-applicable, open rounds | confirm anything, set a severity |
| `security_reviewer:{family}` (or `challenge_validator:security`) | everything a triager may, plus confirm, rule a duplicate, mark fixed, override a severity | publish, withhold, grant an extension |
| `admin` | all of it | — |

`domain_curator:security`, `domain_curator:all` and `challenge_validator:security`
also read the queue.

Publication is the only act reserved to an administrator alone, and the
reason is stated in the backend module: every other transition here can be
corrected by making another one; publishing cannot, because the internet
keeps a copy.

The admin app **offers every action to everybody** and lets the server refuse.
A hidden button teaches nobody which capability they are missing; a 403 with
its message does.

### 19.2 The state machine

Mirrored in `src/lib/api/security.ts::nextStatuses`, which exists only to
decide which buttons to draw — the server decides.

```
submitted ─┬─→ triaged ─┬─→ confirmed ─┬─→ fixed ──→ published
           │            │              ├─→ duplicate
           ├─→ not_applicable          └─→ published
           ├─→ duplicate
           └─→ withdrawn (reporter only, no admin surface offers it)
```

### 19.3 Endpoints consumed (20)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/security/findings` | `status`, `severity`, `target_kind`, `suspected_duplicates`, `limit` (≤ 200). Ordered by severity then age — not by arrival, which buries a Friday critical under a week of informationals. |
| GET | `/api/admin/security/findings/{id}` | The row, the audit trail, the rounds, the look-alikes. |
| POST | `/api/admin/security/findings/{id}/transition` | `{to, reason?, fix_url?, writeup_url?, duplicate_of?, triage_notes_md?}`. 409 when the move is not legal for the caller's actor. |
| POST | `.../severity` | `{cvss_vector? \| severity_tier?, reason}`. Reviewer or admin: a severity decides a payout tier. |
| POST | `.../rounds` | `{kind, notes_md}`. Five rounds max, one open at a time. |
| POST | `.../rounds/resolve` | `{resolution: satisfied\|insufficient, note?}` |
| POST | `.../vendor-notified` | Starts the embargo clock. |
| POST | `.../extension` | `{reason}` — the owner asks. |
| POST | `.../extension/grant` | `{days}` — **admin only**. |
| POST | `.../withhold` | `{reason}` — **admin only**. Never published, with the reason on the row. |
| POST | `.../rescan` | Looks again for look-alikes. Returns a count; merging stays human. |
| POST | `.../blue-lab` | Turns a confirmed finding into a defensive exercise. The artefact is supplied, not extracted. |
| GET | `/api/admin/security/dedup-queue` | Everything a scanner suspected. Nothing merges automatically: a merge decides who is paid. |
| POST | `/api/admin/security/embargo-sweep` | Walks the clocks. Publishes nothing — an expired embargo becomes a list item. |
| POST | `/api/admin/security/challenges` | `ctf_flag` or `defensive_lab`. The one place a flag or an answer set enters the system; hashed server-side, created as a draft. |
| GET/POST | `/api/admin/security/external-bounties` | Curated programmes. `curated_at` moves on every write, because the date is the whole claim. |
| GET | `/api/admin/security/bounty-claims` | Work claimed from another platform. |
| POST | `.../bounty-claims/{id}/verify` | `{severity}` — the reviewer's tier, not the other platform's. |
| POST | `.../bounty-claims/{id}/refuse` | `{reason}` |
| POST | `/api/admin/security/research-tokens/{id}/revoke` | **admin only**. |

Two public reads are used by the same screens: `GET /api/security/hall-of-fame`
(the only aggregate the backend computes — there is no
`/admin/security/overview`, and the app invents no number to stand in for one)
and `GET /api/security/proofs?key=` (one short-lived signed URL per proof key;
a proof of an unfixed vulnerability is not public material, so it is opened in
a new tab and never embedded).

**Consumed by** : `/security` (queue, duplicates, external claims, programmes,
catalogue, public record) and `/security/findings/{id}`.

### 19.4 Where the queue filters live

In the URL. A filtered queue is a thing you send to a colleague, and a filter
that lives only in memory cannot be sent. `/security?status=submitted&severity=critical`
is the shareable form, and `e2e/admin/security-findings-triage.spec.ts` asserts
it survives a reload.

---

## 20. Paid missions — the admin's one decision

**Linear** : SKI-162 (cyber M-10) and SKI-249 (design M-08).

### 20.1 Why there is one page and not two

Both tickets ask for their own admin page — `/admin/cyber-missions` and
`/admin/design-missions`. The backend answered with one surface, and it is the
right answer: migration 0192 built missions, applications and billing for every
domain, keyed by `mission_types.skill_domain`. Design needed rows, not a
mechanism, and got twelve of them.

So a design mission is a mission with `skill_domain = 'design'`, a cyber
mission is one with `skill_domain = 'security'`, and the two pages the tickets
describe are `/missions?domain=design` and `/missions?domain=security`. A second
implementation would be a second thing to keep in step with the first.

### 20.2 What an admin is for here

Not running missions. A mission belongs to the enterprise that posted it and
the person who took it, and both already have every action they need. What
neither has is a way out of the case where they disagree and neither will move:
the mission sits `in_progress` for ever and the money sits in escrow.

That is the whole write surface — **one decision, once**.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/missions` | `skill_domain`, `mission_type`, `status`, `stuck_only`, `stuck_after_days` (default 21), `page`, `per_page`. Ordered by how long a hand-in has gone unanswered. |
| GET | `/api/admin/missions/{slug}` | Rounds, invoices, IP terms, NDA flag, arbitration. 404 rather than 403 for a domain the caller may not read — which missions exist is not a curator's business. |
| POST | `/api/admin/missions/{slug}/arbitrate` | `{outcome: accepted\|cancelled, reason_md}`. Eighty characters minimum. |

Readers: `admin`, `domain_curator:{domain}`, `domain_curator:all`,
`mission_arbiter`. An admin reads every domain; a curator reads their own and
has to name it; an arbiter reads the stuck queue across every domain and
nothing else — that queue *is* their job.

Arbiters: `admin` and `mission_arbiter`, not scoped by domain. Whether a
contract was honoured is the same question about a logotype and about a pull
request, and scoping it would leave a stuck mission nobody may unstick because
its domain has no arbiter yet.

**Two outcomes, no third.** Both already exist in the mission's own vocabulary;
what the endpoint adds is the record that the outcome was *decided* rather than
agreed, and by whom. A mission accepted by arbitration and one accepted by a
happy client look identical in `missions`, and they must not read the same to
anybody who later asks what happened.

The eighty-character floor is shared as `ARBITRATION_REASON_MIN` so the form
refuses before the round trip and cannot drift from the server.

**Consumed by** : `/missions` and `/missions/{slug}`.

### 20.3 Money next to the work

The detail screen shows `mission_invoices` — label, amount, currency, status,
capture and release timestamps — beside the rounds rather than on the money
page. An arbitration decides an amount that is already sitting somewhere, and
sending the arbiter to another screen to find out where is how a decision gets
taken without it.

---

## 21. Design curation (SKI-205, SKI-233, SKI-312)

Section 18.5 previously recorded SKI-205 and SKI-249 as blocked. They are not
blocked; most of what they ask for was built somewhere else, on purpose:

| SKI-205 asks for | Where it actually lives |
|---|---|
| Contest CRUD, jury, finalisation | `/api/admin/tournaments*` — a design contest is a `brief_contest` with `skill_domain = 'design'`. Consumed by `/tournaments`, tab **Contest operations**. |
| Design missions review | `/api/admin/missions?skill_domain=design` — see section 20. |
| Validator statistics | `/api/admin/validators/stats`, cross-domain, already consumed by `/validators`. |
| Moderation of a copied entry | `/api/admin/plagiarism` — cross-domain: an entry copied into a security contest is the same case. |
| Featured designer queue | `/api/admin/featured` — the weekly featuring every domain has. |
| The aggregated overview | **Nothing serves it.** There is no endpoint returning "active contributors, open challenges, running contests". The screens compose what they can from the queues themselves and say so; no number on `/design` is invented to look like one. |

What is genuinely design-shaped got its own routes, and all of them are now
consumed:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/design/briefs` | Proposals waiting, oldest first. Gated by `community_curator`, not by `admin` alone — reserving curation to administrators makes the queue's length a function of how many administrators there are. |
| POST | `/api/admin/design/briefs/{id}/publish` | The brief becomes a slice anybody may claim. Curation, not moderation: nothing is removed, something is brought into existence. |
| POST | `/api/admin/design/briefs/{id}/reject` | `{feedback}`, 20 characters minimum, read by the author. |
| GET | `/api/admin/plagiarism` | Open cases, oldest first. `plagiarism_reviewer` or `admin`. An open case is not public: an allegation published before it is decided ruins somebody even when it is dismissed. |
| POST | `/api/admin/plagiarism/{id}/decide` | `{upheld, decision_md}`, 80 characters **either way** — an accusation dropped without a word leaves the accusation standing in everybody's memory. |
| GET | `/api/featured/{domain}` · `/recent` | Public. `null` rather than 404 when nobody is featured: a quiet week is a normal week. |
| POST | `/api/admin/featured` | `{skill_domain, week_of, user_id, reason_md, deliverable_id?}`. One per domain per week; the date must be a Monday, refused rather than rounded; refused for anybody with nothing verified in the domain. |
| GET | `/api/admin/featured/{domain}/{week}/card` | The post, composed and **returned, never published**. Who presses send is a person. |
| GET | `/api/design/slices/{id}/auto-checks` | Contrast, motion budget, token linting. Advisory: none decides a verdict. Shown beside the critique trail, because reading the critiques without the checks hides the half of the story a machine wrote. |
| GET | `/api/design/slices/{id}/versions/{round}` · `/compare` | One reviewed version, or two with the critiques between them. |

**Consumed by** : `/design` — tabs **Critique queue**, **Brief queue**,
**Plagiarism**, **Featured**, **Craft score ladder**.

### 21.1 Contest operations (SKI-150, SKI-200, SKI-236, SKI-148)

On `/tournaments`, tab **Contest operations**, because a contest is a
tournament whatever its subject:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tournaments/{slug}/jury` | Public. A contest whose panel is secret cannot be trusted. |
| POST | `/api/admin/tournaments/{id}/jury` | `{juror_user_id}`. Refused when the invitee has an entry, or cannot review the contest's domain. |
| GET | `/api/admin/tournaments/{id}/vote-bursts` | `window_minutes`, `threshold`. A reason to look, never a verdict. |
| GET | `/api/admin/tournaments/prizes/outstanding` | Ended contests still holding money. Each owes an award or a refund and nothing decides which automatically. |
| POST | `/api/admin/tournaments/{id}/prize/fund` | `{funder_enterprise_id, amount, currency, provider_reference}`. Amount as a **string**: a float round-trip is how a prize becomes 1499.9999. |
| POST | `/api/admin/tournaments/{id}/prize/refund` | `{reason}`, 10 characters minimum. |

### 21.2 What SKI-338 added, and what it settled

The three gaps this section used to list are closed. The backend shipped the
batch (migrations 0596–0598), and all six surfaces are consumed here.

| Method | Path | Consumed by |
|---|---|---|
| GET | `/api/admin/security/overview` | the tiles at the top of `/security`, queue tab |
| POST | `/api/admin/security/findings/{id}/comments` | the internal-notes section on the finding detail |
| GET | `/api/admin/security/research-tokens` | the **Research tokens** tab on `/security`, which finally makes the revoke reachable |
| GET | `/api/admin/missions` | now the standard `{data, pagination, meta}` envelope — the pager shows a real count |
| POST | `/api/admin/missions/{slug}/status` | take-down on `/missions/{slug}` |

Three details of the overview are worth restating, because the screen depends
on each of them:

- **`withdrawn` and `not_applicable` are not counted.** Closed business in a
  backlog makes it look like work that is not there.
- **`oldest_untriaged_hours` is `null`, not `0`, when nothing waits.** Zero
  hours reads as "something just arrived", which is the opposite. The tile
  prints a phrase rather than a number in that case.
- **`triage_sla_days` travels with the count it is measured against**, so the
  page names its own threshold instead of hard-coding one that would drift
  from the safe harbour.

The tiles load with the queue rather than on their own timer: they are the
same screen, and a summary lagging a refresh behind the rows beneath it is
how a count ends up contradicting the list it describes. When the aggregate
fails, the tiles do not render — showing stale numbers beside rows that did
load is worse than showing none.

### 21.3 On `design_curator` — the backend declined, and it was right

SKI-205 asked for `design_curator` and `design_moderator`. Neither was
created, and the argument holds:

- The CHECK this document used to call the authority **no longer exists**.
  Migration 0404 replaced it with the `capability_catalog` table, for the
  reason it states — five migrations restating one list meant the sixth would
  be the next domain.
- **`domain_curator:design` already carries the exact scope** SKI-205
  describes for `design_curator`: a domain's challenges, contests and
  featurings, not its users and not its money. `/admin/design/briefs` and its
  two actions now accept it. Two names for one role is how a permissions
  model stops being readable.
- `design_moderator` stays uncreated on the argument in D5: the plagiarism
  queue is cross-domain by construction.

### 21.4 The list this app used to hold, and why it is gone

`GET /api/admin/capabilities` landed (SKI-351), and the hand-kept copy in
`src/lib/types/index.ts` went with it. `Capability` is now `string`, the grant
dropdown is built from the served catalogue, and `CapabilityBadge` keys its
colour table by `string` with a `default` fallback.

**The copy was not merely at risk of going stale — it was already wrong, and
the previous version of this section said the opposite.** It claimed the
hand-written list "unblocks the operators". It did not. The list of union
members in `types/index.ts` had been extended with `mission_arbiter`,
`security_triager`, `sre`, `featured_ops_engineer`, `security_reviewer:*` and
`domain_curator:*` — but the array the grant form actually reads,
`ALL_CAPABILITIES` in `UserCapabilitiesSection.svelte`, had not. Widening a
type does not add an option to a `<Select>`. So the three capabilities gating
the screens shipped that same week could be granted to nobody, and the
document asserted the opposite because nobody checked the second file.

That is the argument for not holding the list at all, made better by an
accident than by reasoning: a copy has to be updated in every place it was
spread to, and nothing tells you when you missed one.

Three fields of the catalogue are worth naming, because the screen leans on
each:

- **`is_derived`** — written by the orientations trigger of migration 0404.
  These rows appear in no migration and move when a trade changes family,
  which is the specific reason a client cannot enumerate the set.
- **`engine_managed`** — `services::capabilities_engine` grants and re-grants
  it. Still grantable by hand; it is the *revoke* that does not stick, so the
  revoke dialog says so rather than letting somebody spend an afternoon on it.
- **`held_by`** — how many people hold it right now. An operator about to
  grant `security_reviewer:red-team` wants to know whether anybody already
  reviews red-team work.

Descriptions are served in French only. The screen prefers a local
translation when the locale file has one and falls through to the served
sentence otherwise: the known set stays translated, and the generated rows
stay described, which matters more than staying in the reader's language.

When the catalogue fails to load, granting is disabled and says why. An empty
dropdown would read as "this user can hold nothing" — a different statement,
a false one, and the kind an operator acts on.

### 21.5 What is genuinely absent, and deliberately

Verified against the tree on 2026-08-29, not inferred:

| Ticket | Artefact | State |
|---|---|---|
| SKI-139 | `ctf_instances` — per-user container spawn | absent, Phase 2 |
| SKI-141 | CTF scoreboard over WebSocket | absent |
| SKI-147 | JupyterHub analysis sandbox | absent, Phase 2 |
| SKI-149 | `/competitions` on the public front end | absent |
| SKI-172 | VS Code extension | only `docs/security/IDE-EXTENSION.md` exists |
| SKI-132 | `docs/security-writeups/` | absent — content, not code |

Nothing on this admin app waits on any of them.

---

## 22. The reverse audit, and the screens it produced

Every section above answers "what does this app do with the routes it
calls". This one answers the question nobody had asked: **what does the
backend serve that nothing calls.**

### 22.1 The tool

`scripts/unconsumed-routes.mjs` is the mirror of `routes.contract.test.ts`.
The test asks whether everything this client calls exists; the script asks
whether everything that exists is called. Both read
`src/lib/api/backend-routes.json`, which `sync-backend-routes.mjs` generates
from the backend's own `.route(…)` registrations — and which now records the
**HTTP verbs** as well as the paths.

The verbs matter more than they look. Without them an audit cannot tell a
route nobody calls from a route that is read but never written to, and the
second reads as done on any path-only comparison. Several of the gaps below
were exactly that.

```
node scripts/unconsumed-routes.mjs          # admin surface
node scripts/unconsumed-routes.mjs --all    # everything served
node scripts/unconsumed-routes.mjs --json   # machine-readable
```

It answers coverage, not correctness. Plenty of the public surface has no
business in an admin panel, which is why the default scope is `/admin/**`,
and the judgement about what *should* be consumed stays with the reader.

**One thing it deliberately does not do is count itself as authoritative.**
Its first version reported `GET /admin/email-preview` as unconsumed. That
route had worked from the first day — consumed as an `<iframe src>` built by
a helper returning a URL string, which no scan of `api.get(…)` can see. A
false entry on a list somebody reads as work to do costs a real afternoon,
so the script now counts every `/api/...` string literal as a reference and
reports those separately.

### 22.2 The scope this audit started with was wrong

The first version of this section reported 224 of 268 admin verbs and called
it 83.6%. Both numbers were right for the question the tool was asking, and
the question was the wrong one.

**`/admin` is a convention, not a rule, and the domain modules do not follow
it.** `/quality/bugs/review-queue`, `/beginner/verifications/queue`,
`/communication/slices/{id}/translation-reviews` and
`/forum/posts/{id}/moderate` are staff surfaces gated by
`require_any_capability` and served outside the prefix. Scoped to the prefix,
the audit called them out of scope — and a report built on that output said
those domains had no admin work, which is a conclusion the tool was
structurally incapable of reaching.

The snapshot now records, per route, whether a guard stands in front of it,
and the audit scopes to `/admin/**` plus anything guarded. Three details of
the detector were wrong on the first pass, each failing differently and each
worth keeping in mind if it is ever rewritten:

- guards named inside `//` comments counted, so `/auth/login` came back as a
  staff route — `auth.rs` mentions `require_admin_2fa` in prose;
- substring matching made `require_admin_2fa` match `require_admin`;
- one-level scanning missed wrappers. `quality.rs` guards its review queue
  with a module-local `require_any_quality_reviewer` that builds the
  capability list from `REVIEWER_GROUPS`, so a family added to the catalogue
  reaches the guard without anybody editing it. Good design, invisible to a
  shallow scan, and on its own enough to drop a domain out of the audit.

Guard resolution is now transitive to a fixed point, comments are stripped,
matching is on word boundaries, and the guard names are enumerated from
`src/middleware/capabilities.rs` rather than guessed — guessing had already
missed `require_reviewer_for_orientation`.

**What stays out of scope, deliberately:** routes gated by *ownership*.
`POST /leadership/cohorts/{id}/graduate` checks the caller leads the cohort;
`POST /audio/castings/{id}/select` filters on `opened_by`. Holding a
capability is not the same as acting for the platform, and an admin panel
offering those would be inviting somebody to act in a role they merely
qualify for.

Honest figures, at the time that scope error was corrected: **271 of 302
staff verbs (89.7%)**, from 151 at the start. The current figure is in §22.3;
the denominator has since grown with the routes SKI-354 added.

### 22.3 The screens built from it

| Screen | Routes | What it is for |
|---|---|---|
| `/sales` | `sales_pipeline.rs` (7), `revenue.rs` (2) | The pipeline, overdue next steps, renewals, and what the platform earns |
| `/data` | `data_line.rs` (7) | Consent cohorts first, then reports, licences and white-label deployments |
| `/game` | `admin_game.rs` (10) | The mod queue, game slices awaiting a signature, jams, attestations, featurings |
| `/recruitment` | `recruitment.rs` (4) | The campaign queue, assignment, shortlisting, departures |
| `/ops-practice` | `ops_practice.rs` (5) | Overdue remediation, and the verifications that turn operational work into proof |
| `/domains` | `admin_domains.rs` (3), `credentials.rs` (3), `orientations.rs` (2) | A per-domain dashboard, outside certifications awaiting review, and opening a trade's challenge catalogue |
| `/contracts` | `enterprise_products.rs` (4), `talent_line.rs` (1) | The register every product line writes into, what lapses next, and the twenty verbs the register's `source_id` unlocked |
| `/studios` | `engagements.rs` (4) | Forming a bookable team, and disbanding one |
| `/finance` | `finance.rs` (11) | Advances awaiting disbursal, undecided referrals, unpaid guarantee claims, draft partnerships |
| `/operations` (extended) | seven modules (12) | Feature flags, tags, one-off runs, the assistant ledger |
| `/engagement` (rewired) | `cohorts.rs` (2), `talent_offers.rs` (3) | The same two lists, now read as moderation sees them, with the two actions |
| `/programs` | eight modules (23) | Labs and their contributions, beta programmes, launch campaigns, ambassadors, certification audits, community events, series, the awards ballot, sponsored content |
| `/review` | seven modules (12) | Apprentice verifications, defect reports, the vouching queue, forum moderation, per-domain slice confirmations |
| `/tournaments` (extended) | `tournament.rs` (2) | The panel's own screen: a contest's entries and the verdict on each |

Coverage after these: **309 of 309 staff verbs (100%)**, from 151 at the
start.

**A metric that can be gamed is worth saying out loud.** The audit counts
`api.*` call sites, so adding a client method raises the number whether or
not anybody can reach it. Every route counted above is reachable from a
screen; four of them spent an afternoon as API methods with no interface, and
the interfaces were built rather than the number banked.

### 22.4 Nothing remains, and what closed the last of it

The last unreachable verb was `POST /admin/lab-contributions/{id}/judge`:
submission is write-only, `GET /labs` lists labs rather than their
contributions, and `settle` closes a whole month without ever naming one. An
administrator could pay for an evening's work in bulk but not judge it. `GET
/admin/labs/{id}/contributions` is what closed it, and the list sits under
each lab on `/programs` with the verdict buttons on it.

Two routes arrived in the same batch and are consumed here as well:

- `GET /admin/orientations/{slug}/challenges` and its `/publish` — a trade's
  catalogue and what is still in the way of opening it. 130 design challenges
  were seeded carrying a title and an intent but no brief, deliberately: a
  challenge nobody has read must not be handed to somebody who is learning.
  The screen is a tab on `/domains` and renders **the server's `blockers`
  sentences verbatim** rather than deriving its own verdict from the
  counters — two readings of "ready" would eventually disagree, and the one
  written next to the UPDATE is the one that matters.

**The `seasons` duplication is resolved, and it was a breaking change.** Two
modules wrote the one table with different column sets; the backend removed
the `tournament.rs` writer. `POST /admin/seasons` and
`POST /admin/seasons/{id}/status` are gone, and `routes.contract.test.ts`
failed on exactly those two — which is the whole reason that test exists.
Seasons now create through `POST /seasons` with a **theme**, activate by
**slug** through `POST /seasons/{slug}/activate`, and close by **id** through
the surviving `POST /admin/seasons/{id}/close`. The reads and the writes are
in `competitions.ts` together, and `Season` and `SeasonListRow` are one type.

Two smaller findings from the original audit are still open:

- **`/admin/events` carries two unrelated resources.** `GET/POST
  /admin/events` is the badge-event collection (`admin_ops.rs`); `POST
  /admin/events/{id}/status` acts on a community event (`events.rs`). Nothing
  is broken — axum routes them correctly — but the first does not list what
  the second acts on, and a reader will assume it does.
- **A studio being formed is in no list.** `GET /studios` returns `active`
  only, so `/studios` holds the id from the create call and does the whole
  formation in one sitting. It says so on the page.

One observation on the new listing, which changes nothing today: the `total`
`GET /admin/labs/{id}/contributions` returns counts **every** contribution of
the lab, while the rows honour `status` and `month`. Filter to the four
pending ones out of ninety and the page count is computed from ninety. The
screen does not paginate that list, so nothing is wrong on this side.

### 22.5 What to run after a backend batch

Both directions, in this order:

```
node scripts/sync-backend-routes.mjs   # refresh the snapshot, read the diff
npm test                               # the contract test fails on a moved path
node scripts/unconsumed-routes.mjs     # what arrived that nothing calls yet
```

Refreshing the snapshot to make a red contract test green is how that test
stops being worth having. The diff is the point — and it has now earned its
keep twice: the batch that resolved the `seasons` duplication **removed** two
routes this app was calling, and the contract test named both before anything
was clicked.
