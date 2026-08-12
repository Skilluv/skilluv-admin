# Bugs Backend — skilluv-backend

> Bugs et manques identifiés côté backend Rust. **À transmettre à l'équipe back.**

## Template d'entrée

```
### [Pxx] Titre court
**Route :** MÉTHODE /path
**Fichier suspect :** src/routes/xxx.rs
**Détecté par :** test Playwright / audit statique / …
**Reproduction :**
1. …
**Attendu :** …
**Observé :** …
**Impact :** …
**Statut :** open | reported | fixed
```

---

## Ouverts

### [P1] Routes admin non protégées par `admin_gate` middleware
**Routes concernées :**
- POST `/api/admin/digest/run-weekly` — déclarée dans `src/routes/email_prefs.rs` (nesté sans `admin_gate`)
- POST `/api/admin/github/sync/{user_id}` — déclarée dans `src/routes/github.rs` (nesté sans `admin_gate`)
- GET `/api/admin/accounting/export` — déclarée dans `src/routes/legal_well_known.rs`, mergée hors `admin_gate`

**Détecté par :** audit statique (grep `.nest("/api", admin_gate(...))` dans `src/lib.rs`)

**Attendu :** toute route sous `/admin/*` devrait passer par `admin_gate` (BE-C origin check + BE-A 2FA mandatory).

**Observé :** les handlers font bien `require_capability("admin")` en interne (donc JWT+rôle vérifiés) mais :
- pas de validation de l'header `Origin` contre `ADMIN_ORIGINS`
- pas de gate 2FA middleware — un admin sans TOTP/WebAuthn actif peut appeler ces routes

**Impact :** défense en profondeur incomplète. Un token admin volé + XSS sur origine non-admin permet d'appeler ces endpoints alors qu'ils sont supposés être bloqués par l'origin check.

**Fix suggéré :** soit déplacer ces routes dans un module `admin_*` mergé dans `admin_routes()`, soit les envelopper dans un `.nest("/api", admin_gate(...))` séparé.

**Statut :** fixed (backend commit 86688dc — wire 6 admin route modules that existed but were never nested)

### [P1] `GET /api/admin/users/{id}` n'expose pas `totp_enabled` (ni webauthn)
**Route :** `GET /api/admin/users/{id}` — `src/routes/admin_moderation.rs` handler `get_user` (l.223)
**Détecté par :** test Playwright `e2e/admin/reset-2fa.spec.ts`

**Attendu :** le front lit `user.totp_enabled` (dans `/users/[id]/+page.svelte` via `targetHasStrongFactor = user?.totp_enabled === true`) pour activer/désactiver le bouton "Réinitialiser la 2FA". Sans ce champ dans la réponse, le bouton est toujours grisé → l'UI est cassée même quand la cible a bien un TOTP configuré.

**Observé :** la réponse actuelle sérialise `{id, email, username, display_name, skill_domain, role, title, total_fragments, streak_current, trust_score, country, email_verified, profile_active, is_banned, created_at}` — pas de `totp_enabled`, pas de compteur webauthn.

**Fix suggéré :** ajouter `"totp_enabled": user.totp_enabled` dans le `json!` du handler, l.249. Idéalement aussi `"webauthn_credentials_count"` via un COUNT sur `webauthn_credentials WHERE user_id = $1` — nécessaire pour BE-B (le middleware admin_gate accepte TOTP OU WebAuthn).

**Impact :** feature admin reset-2fa impossible depuis l'UI. Fonctionne uniquement en tapant l'API directement.

**Statut :** fixed (backend commit 4e857ad — totp_enabled + webauthn_credentials_count now returned)

### [P2] `GET /api/admin/users/{id}` n'expose pas `email_2fa_enabled`
**Même route.** Le champ existe en DB (`users.email_2fa_enabled`) mais n'est pas dans la réponse — pas bloquant côté UI actuelle mais lié au [P1] ci-dessus.

**Statut :** fixed (backend commit 4e857ad — email_2fa_enabled exposed alongside totp_enabled)

### [P1] Seasons — mismatch de nom d'endpoint front/back
**Route :** front appelle `POST /admin/seasons/{id}/status`, back expose `POST /admin/seasons/{slug}/activate` — `src/routes/seasons.rs`
**Détecté par :** croisement `src/lib/api/admin.ts` vs `src/routes/seasons.rs` dans AUDIT_MAPPING

**Attendu :** un contrat unique — soit le front utilise `/activate`, soit le back expose aussi `/status`.

**Observé :** l'appel front retourne 404 en runtime. La feature "changer le statut d'une saison depuis l'admin" est cassée dès qu'elle est utilisée.

**Fix suggéré :** ajouter côté back une route `POST /admin/seasons/{id}/status` qui accepte `{status}` et route vers `activate_season` / futurs états. Ou aligner le front sur `/activate` si c'est la seule transition supportée. Confirmer avec le PO ce qui est attendu.

**Note post-fix :** ma qualification était partiellement erronée — l'endpoint `/status` existait déjà. Le vrai problème était que `/admin/seasons/*` + `/admin/tournaments/*` vivaient dans `tournament_routes` (public) sans `admin_gate` (juste un check `auth.role != "admin"` inline). Backend a split en `admin_tournament_routes` + wiré derrière `admin_gate`.

**Statut :** fixed (backend commit a099d30 — split admin_tournament_routes out of tournament_routes + nest with admin_gate)

### [P1] `GET /admin/sso/sessions` renvoie `{data:{sessions:[…]}}` au lieu de `{data:[…]}`
**Route :** `GET /api/admin/sso/sessions` — `src/routes/admin.rs` handler `list_sso_sessions` (l.655)
**Détecté par :** test Playwright `e2e/admin/sso-revoke.spec.ts`

**Attendu :** convention standard des listes paginées côté admin — `{data: T[], pagination: {…}, meta: {…}}` (comme `/admin/users`, `/admin/reports`, `/admin/projects`, etc.). Le front `AdminApi.listSsoSessions` type le retour comme `ApiPaginatedResponse<SsoSession>` — donc `data` doit être un array.

**Observé :** la réponse est `{data: {sessions: […]}, pagination, meta}`. Le front fait `sessions = res.data` → assigne un objet à une variable d'array → `{#each sessions}` itère rien → **liste SSO toujours vide dans l'UI, même quand des sessions existent en DB**.

**Fix suggéré :** dans `list_sso_sessions`, remplacer :
```rust
Ok(Json(json!({
    "data": { "sessions": sessions },  // <- unwrap this nesting
    "pagination": {...}
})))
```
par :
```rust
Ok(Json(json!({
    "data": sessions,
    "pagination": {...}
})))
```

**Impact :** feature "voir les sessions SSO actives" complètement cassée en prod. L'admin ne peut pas révoquer une session compromise via l'UI. Fallback : psql direct — pas acceptable.

**Statut :** fixed (backend commit aa5e79b — unwrap nested `data.sessions` → `data: T[]`)

### [P1] `POST /admin/community/{id}/approve` renvoie 500 si le challenge n'a ni `is_training=TRUE` ni `project_id`
**Route :** `POST /api/admin/community/{id}/approve` — `src/routes/admin_community.rs` handler `approve_challenge` (l.88)
**Détecté par :** test Playwright `e2e/admin/community-review.spec.ts`

**Reproduction :**
1. Un user soumet un challenge communautaire (`is_community=TRUE`, `community_status='review'`) sans `is_training` ni `project_id`
2. Admin clique "Approuver" dans `/community`
3. Le handler fait `UPDATE ... SET status='published'` → violation de la check constraint `challenge_templates_project_or_training`
4. Réponse : HTTP 500 (au lieu de 400 propre, ou d'un fix côté approve)

**Attendu :** soit le handler auto-set `is_training=TRUE` à l'approve (les challenges communautaires sont par nature du training), soit il retourne 400 avec un message clair "requires is_training or project_id".

**Fix suggéré :**
```rust
UPDATE challenge_templates SET
    community_status = 'approved',
    status = 'published',
    is_training = TRUE,  -- <- ajouter cette ligne
    updated_at = NOW()
WHERE id = $1 AND is_community = TRUE AND community_status = 'review'
```
Ou valider en amont et renvoyer 400 sinon.

**Impact :** feature "approuver un challenge communautaire" cassée pour la majorité des cas usage (personne n'attache un project_id à une soumission communautaire).

**Statut :** fixed (backend commit d96bdb8 — pre-check business rule, return 400 with actionable message instead of 500)

### [P2] Projects — front utilise `DELETE /admin/projects/{slug}`, back n'expose que `POST /admin/projects/{slug}/archive`
**Route :** `DELETE /admin/projects/{slug}` (front) vs `POST /admin/projects/{slug}/archive` (back)
**Détecté par :** AUDIT_MAPPING

**Attendu :** un verbe HTTP + path aligné entre le front et le back pour l'action "archiver un projet".

**Observé :** l'appel DELETE retourne probablement 405 Method Not Allowed. Feature archive projet cassée.

**Fix suggéré :** aligner le front sur `POST .../archive` (le back reflète mieux la sémantique — archive n'est pas une suppression). Ou ajouter côté back une route `DELETE` qui alias sur archive.

**Statut :** fixed (résolu indirectement par backend commit 86688dc — `admin_projects` module wiré expose `DELETE /admin/projects/{slug}` qui déclenche l'archive ; le front admin utilisait déjà DELETE, plus rien à changer)

---

## Corrigés

_(vide)_

---

## Notes d'audit — endpoints à valider en test d'intégration

Endpoints existants côté back mais peu utilisés côté front à ce jour (vérifier qu'ils fonctionnent) :
- POST `/admin/challenges/{id}/variant` (IA-C.1)
- POST `/admin/fraud/deep-scan/{id}` (IA-B)
- POST `/admin/orientations/{slug}/skills` + DELETE `/admin/orientations/{slug}/skills/{skill_id}`
