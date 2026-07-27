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

**Statut :** open (peut être fait dans le même commit que le fix BUGS_BACK P1)

### [P3] Aligner tous les payloads liste admin sur `{data: T[], pagination}` (audit convention)
**Type :** other
**Contexte :** le bug SSO (BUGS_BACK P1 `{data:{sessions:[…]}}`) suggère qu'il peut y avoir d'autres endpoints admin qui dérogent à la convention paginée standard. Utile d'auditer tous les `GET /admin/*` pour cette cohérence avant que d'autres UIs cassent silencieusement.
**Détail :** grep `.route("/admin/` + inspecter chaque handler qui renvoie une liste. Convention cible : `{data: T[], pagination: {…}, meta: {…}}`. Fix tout ce qui dévie.

**Statut :** open

### [P3] Documenter les endpoints admin dans OpenAPI (utoipa)
**Type :** implementation
**Contexte :** l'audit initial du back a montré qu'il n'y a pas de doc OpenAPI. Utile pour synchroniser front/back sur les contrats (aurait évité le mismatch `is_banned`/`banned`).
**Détail :** décorer chaque handler admin avec `#[utoipa::path(...)]`, exposer `/api/docs` (déjà partiellement fait via `openapi_routes()`).

**Statut :** open

---

## Corrigés

_(vide)_
