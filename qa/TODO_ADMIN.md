# TODOs Admin front — skilluv-admin

> Implémentations à faire côté admin front (nouveaux tests, exposition UI de features back existantes, améliorations UX).

## Template d'entrée

```
### [Pxx] Titre court
**Zone :** module ou page concernée
**Type :** implementation | other
**Contexte :** pourquoi c'est utile
**Détail :** ce qu'il faut faire
**Statut :** open | in_progress | fixed (commit)
```

---

## Ouverts

### [P2] Phase 3 tests exhaustifs — CRUD complet Skills
**Zone :** `/skills`
**Type :** implementation
**Contexte :** Phase 3 de la stratégie QA — chaque module a besoin d'un test end-to-end couvrant CRUD complet (Create, Read, Update, Delete) via l'UI.
**Détail :** écrire `e2e/admin/skills-crud.spec.ts` couvrant : create via modal, edit (PATCH), copier ID, filtrage par domaine, pagination. Vérifier DB à chaque étape.

**Statut :** open

### [P2] Phase 3 tests exhaustifs — CRUD complet Projects
**Zone :** `/projects`
**Type :** implementation
**Contexte :** Phase 3.
**Détail :** `e2e/admin/projects-crud.spec.ts` — create (avec filtres flagship/OSS/curated), update, archive, filter par partnership level, pagination.

**Statut :** open

### [P2] Phase 3 tests exhaustifs — Orientations + Badge rules + Tenants
**Zone :** `/catalog`, `/tenants`
**Type :** implementation
**Contexte :** Phase 3.
**Détail :** 3 specs séparés — orientations (create + attach skill + detach), badge rules (create + edit + deprecate), tenants (create + members + cohorts).

**Statut :** open

### [P2] Phase 3 tests — Ops jobs safe-triggers
**Zone :** `/operations`
**Type :** implementation
**Contexte :** Phase 3.
**Détail :** `e2e/admin/ops-jobs.spec.ts` — trigger `rebuild-leaderboards`, `digest/run-weekly`, `hidden-gems`, `churn` (dry-run si supporté), vérifier 200 et side-effect (leaderboard rebuilt event etc.). Rate limits admin_destructive à respecter.

**Statut :** open

### [P2] Phase 3 tests — GDPR export + guild dissolve + reset-2fa (fois back fixé)
**Zone :** `/users/[id]`, `/operations`
**Type :** implementation
**Contexte :** Phase 3 + suivi du fix back sur `totp_enabled` exposé.
**Détail :** GDPR export (POST + vérifier notification/response), dissolve guild, reset-2fa via UI (attendre BUGS_BACK P1 fix). Ajouter à `reset-2fa.spec.ts` : flip du `expect().toBeDisabled()` en `toBeEnabled()` + click through dialog.

**Statut :** open

### [P3] Exposer côté UI l'endpoint back non-consommé : Challenge AI variant
**Zone :** `/challenges`
**Type :** implementation
**Contexte :** back expose `POST /admin/challenges/{id}/variant` (IA-C.1 — génère une variante harder/easier via IA) mais aucune UI ne l'appelle.
**Détail :** ajouter un bouton "Générer variante" dans la card d'un challenge publié → dialog qui demande `mode: 'harder'|'easier'` → POST + toast + refetch.

**Statut :** open

### [P3] Exposer côté UI l'endpoint back non-consommé : Fraud deep-scan
**Zone :** `/fraud`
**Type :** implementation
**Contexte :** back expose `POST /admin/fraud/deep-scan/{id}` (IA-B — plagiat profond LLM-assisté) mais aucune UI ne l'appelle.
**Détail :** dans le tab "eval" de la page fraud, ajouter action "Deep scan" à côté de scan-deliverable + llm-evaluate. Affiche le score + le similar_to.

**Statut :** open

### [P3] CI GitHub Actions — étendre au projet `admin` Playwright
**Zone :** `.github/workflows/ci.yml`
**Type :** implementation
**Contexte :** le workflow actuel lance seulement les smoke tests (`public` project). Le `admin` project (nav-smoke + 8 flows Phase 2) nécessite un backend + DB en service.
**Détail :** ajouter `services:` postgres + redis + minio + mailpit dans le job e2e, télécharger + build+lancer le binaire skilluv-backend, exécuter le seed admin, puis `npx playwright test --project=admin`.

**Statut :** open

---

## Corrigés

_(vide)_
