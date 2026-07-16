# Skilluv Admin — Capabilities & API reference

**Scope :** documentation exhaustive de tout ce qu'un compte `role='admin'` peut faire côté backend (`skilluv-backend`), exposé via l'app dédiée `skilluv-admin` sur `admin.skilluv.com` (dev : `localhost:5174`).

**Version :** 2026-07-16.
**Total endpoints :** 48, groupés en 14 domaines.

**Changelog depuis 2026-07-08** :
- **ADM-M0** (commit front `b614ba4`, back P1+P2) : 2FA obligatoire pour admin (soft flag login + middleware `ensure_admin_2fa`), reset-2fa admin-to-admin, origin check server-side (`ensure_admin_origin`), rate-limit destructif Redis 10/min + 100/h (`enforce_admin_destructive`), audit log append-only (migration 0099 + rôle `audit_admin`), instrumentation audit sur KYC decide + community + SSO revoke + tournament conclude, helper `dry_run` via env `SKILLUV_ADMIN_DRY_RUN`.
- **ADM-M1** (commit front `9950799`, back P18.4) : `POST/DELETE /api/admin/users/{id}/capabilities` + `GET /api/users/{id}/capabilities` — 14 capabilities admin-manageable.
- **ADM-M2** (commit front `3b29837`, back P14.5) : 7 endpoints fraud — plagiat queue + revoke + LLM re-eval + multi-account detection.

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
