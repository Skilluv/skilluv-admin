# TODOs Backend — skilluv-backend

> Implémentations à demander à l'équipe back (autre que fix de bugs — pour ça voir `BUGS_BACK.md`).

## Template

```
### [Pxx] Titre
**Type :** implementation | other
**Contexte :** …
**Détail :** …
**Statut :** open | in_progress | fixed
```

---

## Ouverts

### [P2] Ajouter `totp_enabled`, `email_2fa_enabled`, `webauthn_credentials_count` à `GET /admin/users/{id}`
**Type :** implementation
**Contexte :** cross-ref BUGS_BACK P1 (même fix). Le front en a besoin pour activer le bouton reset-2FA, afficher le badge 2FA correct, etc. Sans ces champs, plusieurs UI restent grisées.
**Détail :** enrichir le `json!` du handler `get_user` (l.249 de `src/routes/admin_moderation.rs`) avec les 3 champs + COUNT depuis `webauthn_credentials WHERE user_id = $1`.

**Statut :** fixed (backend commit 4e857ad — les 3 champs sont exposés)

### [P3] Aligner tous les payloads liste admin sur `{data: T[], pagination}` (audit convention)
**Type :** other
**Contexte :** le bug SSO (BUGS_BACK P1 `{data:{sessions:[…]}}`) suggère qu'il peut y avoir d'autres endpoints admin qui dérogent à la convention paginée standard. Utile d'auditer tous les `GET /admin/*` pour cette cohérence avant que d'autres UIs cassent silencieusement.
**Détail :** grep `.route("/admin/` + inspecter chaque handler qui renvoie une liste. Convention cible : `{data: T[], pagination: {…}, meta: {…}}`. Fix tout ce qui dévie.

**Statut :** deferred (backend team — scan rapide n'a rien révélé d'autre que le SSO fix. Follow-up ticket si des surprises apparaissent en E2E)

### [P3] Documenter les endpoints admin dans OpenAPI (utoipa)
**Type :** implementation
**Contexte :** l'audit initial du back a montré qu'il n'y a pas de doc OpenAPI. Utile pour synchroniser front/back sur les contrats (aurait évité le mismatch `is_banned`/`banned`).
**Détail :** décorer chaque handler admin avec `#[utoipa::path(...)]`, exposer `/api/docs` (déjà partiellement fait via `openapi_routes()`).

**Statut :** deferred (doublon avec BE-P1-CONTRACT — infrastructure utoipa + Swagger UI déjà wirée backend commit c3ec13c, l'annotation exhaustive des ~86 handlers est le sujet d'un autre PR long-tail)

### [P26] Demandes backend du workflow challenge — suivies dans Linear
**Type :** implementation
**Contexte :** l'implémentation admin P26 v2 (SKI-98 / SKI-99 / SKI-100) a fait remonter cinq besoins backend. Trois ont été livrés pendant l'implémentation, deux sont ouverts. Le suivi se fait dans Linear, projet *P26 v2 — Workflow challenge complet via Skilluv* — pas ici : ce fichier ne duplique pas le tracker.

| Besoin | Ticket | Statut |
| -- | -- | -- |
| `PATCH /admin/slices/{id}/config` — override sensibilité + rang | SKI-106 | livré (backend `41acc56`) |
| `GET /admin/validator-applications` — liste filtrée + stats live | SKI-107 | livré (backend `af93edc`) |
| Stats validateurs + matrice collusion | SKI-108 | livré (backend `d06b5b8`) |
| `GET /admin/projects/{slug}` doit renvoyer les 5 champs P26 v2 | SKI-109 | ouvert |
| `POST /admin/projects/{slug}/ingest` — forcer l'ingestion | SKI-110 | ouvert (UI livrée, en attente de l'endpoint) |

**Note contrats :** les payloads livrés diffèrent de ceux décrits dans les tickets d'origine (`per_page` et non `limit` ; `live_stats` et non `stats` ; `claimant_*` et non `claimer_*` ; `reject_count_approx` ; `user` imbriqué). Le front est aligné sur l'implémentation réelle, pas sur la spec — voir `src/lib/types/index.ts` section « P26 v2 ».

**Statut :** partiellement livré (2 ouverts, suivis SKI-109 + SKI-110)

---

## Corrigés

_(vide)_
