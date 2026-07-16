# Backend TODO — skilluv-admin MVP

**Dernière révision** : 2026-07-16.
**Owner** : équipe backend (skilluv-backend).
**Consumer** : panneau admin (skilluv-admin, SvelteKit 5).

Ce document liste **tout ce qui bloque la finalisation du MVP admin** côté back.
Le frontend est prêt à consommer chaque endpoint dès qu'il est livré — les
shapes ci-dessous sont non négociables, elles sont celles auxquelles le front
est déjà cablé (M3/M4/M5) ou celles définies dans `docs/MVP.md` (M6-M7).

## Résumé exécutif

| Phase | Statut back | Endpoints requis | Estimation dev back |
|---|---|---:|---:|
| ADM-M0 — Security | Livré (P1+P2) | 3 middlewares + 1 endpoint + append-only | — |
| ADM-M1 — Capabilities | Livré (P18.4) | 3 endpoints | — |
| ADM-M2 — Fraud | Livré (P14.5) | 7 endpoints | — |
| **ADM-M3 — Orientations + Badge rules** | **Manquant** | **7 endpoints** | **~2 j** |
| **ADM-M4 — Enterprise Type Manager** | **Manquant** | **4 endpoints** | **~1 j** |
| **ADM-M5 — Enrichissement /users/[id]** | **Manquant** | **2 endpoints + 1 route publique** | **~1 j** |
| ADM-M6 — Audit S3 export + circuit breaker | Deferred post-MVP | 0 (infra AWS + crate `aws-sdk-s3`) | ~2 j + infra |
| ADM-M7 — Tests / Docker / CI | Pas de back requis | 0 | — |

**Total pour clore le MVP fonctionnel** : ~4 jours dev back + 13 endpoints.

---

## Conventions communes

Toutes les nouvelles routes admin doivent respecter :

1. **Auth guard** : `require_capability(&state.db, auth.user_id, "admin")` (pattern
   établi dans `src/routes/admin.rs`).
2. **Origin gate** : middleware `ensure_admin_origin` (déjà en place via BE-C, s'applique
   automatiquement au namespace `/api/admin/*`).
3. **Rate-limit** : middleware `enforce_admin_destructive` (BE-D) sur toute mutation
   destructive (`POST`, `PATCH`, `DELETE`).
4. **Audit log** : chaque mutation doit appeler `crate::services::audit::record(...)`
   (pattern `admin.rs:727`). Enveloppe unifiée : `{admin_id, action, target_type,
   target_id, reason, before_snapshot, after_snapshot}`.
5. **Response envelope** : `{"data": {...}, "meta": {"request_id": UUID, "timestamp": RFC3339}}`.
6. **Body validation** : reasons min 8 caractères pour tout endpoint destructif.
7. **Dry-run mode** : les endpoints à effet cascade doivent supporter le query
   `?dry_run=true` en renvoyant un preview des changements sans commit.
   Utiliser le helper `is_admin_dry_run()` (BE-D) déjà en place.

---

## ADM-M3 — Orientations catalog + Badge rules

**Contexte** : le panneau admin doit permettre de créer/éditer/archiver des
orientations métier (dev-frontend, pentester-web, etc.) et les badge_rules du
proof engine, sans passer par SQL direct.

### 3.1 Orientations — 4 endpoints

#### POST `/api/admin/orientations`

**Body** :
```json
{
  "slug": "string, 3-60, ^[a-z0-9-]+$",
  "name": "string, ≤120",
  "description": "string, optional",
  "primary_domain": "code|design|game|security|soft_skills|ai|ops",
  "secondary_domains": ["string", ...],
  "tags": ["string", ...],
  "is_curated": "boolean, optional, default false"
}
```

**Response 201** :
```json
{ "data": { "orientation": Orientation }, "meta": {...} }
```

**Contraintes** :
- Unicité `slug` (DB constraint existante).
- `primary_domain` doit matcher l'enum PG.
- Créer avec `created_by = admin_user_id`.

**Audit** : `action = "orientation.create"`, snapshot after only.

---

#### PATCH `/api/admin/orientations/{slug}`

**Body** : tous les champs de POST en optionnel + `is_archived: boolean`.

**Response 200** : `{ "data": { "orientation": Orientation } }`.

**Contraintes** :
- Le renommage de `slug` **doit être interdit** (rompt les liens
  orientation_skill_map + user_orientations). Retourner 400 si tenté.
- Set `updated_at = NOW()`.

**Audit** : `action = "orientation.update"`, before + after snapshots.

**Dry-run** : requis, retourne diff dans `meta.dry_run_preview`.

---

#### POST `/api/admin/orientations/{slug}/skills`

**Body** :
```json
{
  "skill_id": "uuid",
  "is_core": "boolean, optional, default false",
  "is_recommended": "boolean, optional, default true",
  "weight": "float, >0, optional, default 1.0"
}
```

**Response 201** : `{ "data": { "attached": true, "orientation_slug": "...", "skill_id": "..." } }`.

**Contraintes** :
- Unicité `(orientation_id, skill_id)` (idempotent : ON CONFLICT DO UPDATE
  pour `is_core/is_recommended/weight` — permet de "re-attacher" avec nouvelles
  valeurs sans erreur).

**Audit** : `action = "orientation.skill_attach"`.

---

#### DELETE `/api/admin/orientations/{slug}/skills/{skill_id}`

**Body** : aucun.
**Response 200** : `{ "data": { "detached": true } }`.

**Contraintes** :
- Idempotent : 200 même si déjà détaché.
- Ne pas cascader sur `user_orientations` (les users gardent leur choix historique).

**Audit** : `action = "orientation.skill_detach"`.

---

### 3.2 Badge rules — 3 endpoints

#### POST `/api/admin/badge-rules`

**Body** :
```json
{
  "slug": "string, 3-80, ^[a-z0-9_-]+$",
  "output_type": "skill_patch|rank|guild_crest|challenge_seal|event_stamp|medal",
  "output_variant": "string, ≤50, optional",
  "display_name": "string, ≤120",
  "description": "string, optional",
  "icon_key": "string, ≤50, optional",
  "conditions": { "arbitrary JSON, see seed migration 0090:112-156" },
  "rarity": "auto|common|rare|epic|legendary",
  "admin_editable": "boolean, optional, default true",
  "ui_metadata": { "optional JSON" }
}
```

**Response 201** : `{ "data": { "rule": BadgeRule } }`.

**Contraintes** :
- Unicité `slug`.
- Validation côté back du JSON `conditions` : au minimum vérifier que le
  root est un objet et que les clés connues (`proof_types`, `min_count`,
  `skill_tag`, `verified_by`, `within_days`) ont les bons types.
- `created_by = admin_user_id`.

**Audit** : `action = "badge_rule.create"`.

---

#### PATCH `/api/admin/badge-rules/{slug}`

**Body** : tous les champs de POST en optionnel (sauf `slug`).

**Response 200** : `{ "data": { "rule": BadgeRule } }`.

**Contraintes** :
- Rejet 400 si `admin_editable = false` sur la rule existante (règles core
  protégées).
- Rejet 400 si `deprecated_at IS NOT NULL` (utiliser un nouveau slug si on
  veut ré-activer).

**Dry-run** : requis, retourne `users_impacted_count` (nombre de user_badges
liés qui verraient leurs conditions ré-évaluées).

**Audit** : `action = "badge_rule.update"`, before + after.

---

#### POST `/api/admin/badge-rules/{slug}/deprecate`

**Body** :
```json
{ "reason": "string, ≥8" }
```

**Response 200** : `{ "data": { "deprecated": true, "slug": "...", "deprecated_at": "..." } }`.

**Contraintes** :
- Soft : SET `deprecated_at = NOW()`. Les user_badges existants **restent**
  visibles (pas de cascade).
- Idempotent : 200 si déjà déprécié.

**Dry-run** : retourne `users_with_badge_count`.

**Audit** : `action = "badge_rule.deprecate"`, reason obligatoire.

---

### 3.3 Badge events (optionnel post-MVP)

`POST /api/admin/badge-events` — pour Hacktoberfest, Skilluv Fest, etc.
Body : `{slug, name, starts_at, ends_at, visual_theme}`. Peut attendre.

---

## ADM-M4 — Enterprise Type Manager

**Contexte** : le panneau admin doit permettre de lister les entreprises,
changer leur `enterprise_type` (direct_hire → staffing_agency → remote_international),
voir leur `type_config` et leur carnet clients (staffing_agency uniquement).

### 4.1 Endpoints — 4 endpoints

#### GET `/api/admin/enterprises`

**Query** :
- `type`: `direct_hire|staffing_agency|remote_international`, optional
- `verified`: `boolean`, optional
- `page`: `i64`, default 1
- `per_page`: `i64`, default 20, max 100

**Response 200** :
```json
{
  "data": [Enterprise],
  "pagination": { "page": 1, "per_page": 20, "total": N, "total_pages": N }
}
```

**Contraintes** :
- Order by `created_at DESC` par défaut.

**Audit** : non (read).

---

#### PATCH `/api/admin/enterprises/{id}/type`

**Body** :
```json
{
  "enterprise_type": "direct_hire|staffing_agency|remote_international",
  "reason": "string, ≥8"
}
```

**Response 200** : `{ "data": { "enterprise": Enterprise } }`.

**Contraintes critiques** :
- **Trigger PG P24** : passer à `staffing_agency` requiert au moins 1 seat
  configuré, sinon rejet 400 avec code `ENTERPRISE_MISSING_SEATS`.
- Passer à `remote_international` requiert que le pays d'origine soit dans
  la liste des pays éligibles (env `SKILLUV_REMOTE_INTL_ORIGINS` déjà défini).
- Transaction atomique : rollback complet si un des invariants échoue.

**Dry-run** : requis, retourne `will_reset_type_config: boolean` (les
type_config sont typés par enterprise_type, changement = reset).

**Audit** : `action = "enterprise.type_change"`, before + after.

---

#### GET `/api/admin/enterprises/{id}/type-config`

**Body** : aucun.
**Response 200** : `{ "data": { "type_config": TypeConfig } }`.

**Contraintes** :
- `type_config` est un JSONB dont le schéma dépend du `enterprise_type`.
  Documenter le tagged union côté back (voir P24 spec) : le frontend l'affiche
  via un `<details><summary>` avec JSON pretty-print.

**Audit** : non.

---

#### GET `/api/admin/enterprises/{id}/agency-clients`

**Body** : aucun.
**Response 200** :
```json
{
  "data": {
    "clients": [
      {
        "id": "uuid",
        "client_name": "string",
        "client_country": "string",
        "contract_ref": "string",
        "created_at": "..."
      }
    ]
  }
}
```

**Contraintes** :
- Retourne 200 avec `clients: []` si `enterprise_type != staffing_agency`
  (pas de 404 : le concept existe, il est juste vide).

**Audit** : non.

---

## ADM-M5 — Enrichissement /users/[id]

**Contexte** : la page détail user doit exposer les orientations, badges, et
permettre à un admin de re-déclencher le proof engine ou d'écraser un rank
sur cas exceptionnel.

### 5.1 Endpoints — 2 endpoints + 1 adaptation

#### POST `/api/admin/users/{id}/recompute-proofs`

**Body** : aucun (ou `{scope: "capabilities|badges|ranks|all"}` optionnel,
default `all`).

**Response 200** :
```json
{
  "data": {
    "recomputed": {
      "capabilities_added": ["mentor", ...],
      "capabilities_removed": [],
      "badges_added": [...],
      "badges_removed": [...],
      "rank_before": "artisan",
      "rank_after": "maitre"
    }
  }
}
```

**Contraintes** :
- Wrap l'appel interne existant : `proof_hooks::recompute_all_for_user(user_id)`.
- Verrou row-level sur `users` pendant recompute (empêche double-write concurrent).
- Notifier le user cible via WS `proof_recompute_started` puis
  `proof_recompute_finished` (best-effort).

**Dry-run** : **obligatoire**, retourne exactement la même shape sans commit.

**Audit** : `action = "user.recompute_proofs"`, reason optionnelle.

---

#### POST `/api/admin/users/{id}/rank-override`

**Body** :
```json
{
  "new_rank": "apprenti|artisan|maitre|legende",
  "reason": "string, ≥8"
}
```

**Response 200** :
```json
{
  "data": {
    "user_id": "uuid",
    "old_rank": "apprenti",
    "new_rank": "artisan",
    "override_id": "uuid"
  }
}
```

**Contraintes** :
- Écrit dans `rank_overrides` (table à créer si absente) pour historique.
- Recalcule les rewards / classements dépendants.
- Ne peut être annulé que via un autre `rank-override` (pas d'endpoint delete).

**Dry-run** : **obligatoire**, retourne le delta leaderboard estimé.

**Audit** : `action = "user.rank_override"`, before + after + reason obligatoire.

---

#### GET `/api/users/{id}/orientations` (route existante à exposer admin-scoped)

Actuellement `/api/users/me/orientations` existe (P16.3). Ajouter la variante
`/{id}` avec guard admin, pour que le panel puisse voir les orientations
d'un autre user.

**Response 200** :
```json
{
  "data": {
    "orientations": [
      {
        "orientation_slug": "dev-frontend",
        "orientation_name": "Développeur Frontend",
        "mode": "active|learning",
        "is_primary": true,
        "picked_at": "..."
      }
    ]
  }
}
```

**Audit** : non (read).

---

## ADM-M0 — Deferred post-MVP

Ces items sont documentés dans `MVP.md` §3.0 mais reportés :

- **Cron export S3 audit log** — nécessite crate `aws-sdk-s3` + bucket Object
  Lock provisionné + KMS key. ~2 jours dev + infra. Doc technique déjà
  écrite : `docs/AUDIT-APPEND-ONLY.md` (côté backend).
- **Circuit breaker rate-limit** — 5 échecs consécutifs → lock 15min +
  notification. Le rate-limit Redis (10/min + 100/h) livré suffit pour le
  MVP. À implémenter si prod montre des patterns d'erreur en cascade.

---

## Contraintes DB à connaître (rappel front-side)

### Orientations

- `primary_domain` enum : `code | design | game | security | soft_skills | ai | ops`
- `secondary_domains`, `tags` : arrays `TEXT[]`
- Slug unique, immutable après création (PATCH slug interdit).

### Badge rules

- `output_type` enum : `skill_patch | rank | guild_crest | challenge_seal | event_stamp | medal`
- `rarity` enum : `auto | common | rare | epic | legendary`
- `conditions` : JSONB libre. Seed data en `migrations/0090:112-156` sert
  de référence.
- `deprecated_at` : soft delete, badges existants restent.

### Enterprises

- `enterprise_type` enum : `direct_hire | staffing_agency | remote_international`
- Triggers PG P24 gèrent les invariants au changement de type.

### Ranks

- Enum : `apprenti | artisan | maitre | legende`

---

## Env vars nécessaires

Déjà livrées, à setter en prod si pas déjà fait :

```
ADMIN_ORIGINS=https://admin.skilluv.com,https://admin-preview.skilluv.com
SKILLUV_ADMIN_DRY_RUN=0
SKILLUV_AUDIT_RETENTION_DAYS=2555
```

À prévoir pour post-MVP S3 export :

```
SKILLUV_AUDIT_S3_BUCKET=skilluv-audit-immutable-eu-west-3
SKILLUV_AUDIT_S3_KMS_KEY_ID=arn:aws:kms:...
SKILLUV_AUDIT_S3_EXPORT_CRON="0 3 * * *"
```

---

## Ordre de livraison suggéré

Priorité par impact fonctionnel décroissant :

1. **ADM-M3 orientations** (4 endpoints, ~1 j) — débloque la gestion catalogue.
2. **ADM-M3 badge_rules** (3 endpoints, ~1 j) — débloque le proof engine editor.
3. **ADM-M4** (4 endpoints, ~1 j) — débloque la conversion staffing_agency.
4. **ADM-M5** (3 endpoints, ~1 j) — enrichit la page user.

Aucun ordre imposé entre 1/2/3/4. Le front est prêt à consommer chaque
endpoint indépendamment.

---

## Contact & questions

Front lead : session actuelle Claude Code sur skilluv-admin.
Traçabilité back : commits P1 (`e40fc87`), P2 (`e289d37`).
Traçabilité front : commits `b614ba4` (M0), `9950799` (M1), `3b29837` (M2).
