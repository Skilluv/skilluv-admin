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

### [P2] Extraire les modales des `+page.svelte` restants
**Zone :** `src/routes/{projects,tournaments,operations,skills,fraud,challenges}/+page.svelte`
**Type :** implementation
**Contexte :** 6 pages font 400+ lignes. La revue de code y est difficile, chaque modification touche un fichier énorme, les tests unitaires sur des sous-parties impossibles. `sponsored-challenges` a été fait comme proof-of-concept (`SponsoredDecideModal.svelte` — 489 → 421 lignes sur la page, modal isolé + testable).

**Détail (pattern à répliquer) :**
1. Créer `src/lib/components/admin/<Feature>Modal.svelte` avec props `{ open, target/data, submitting?, onclose, onsubmit }` + i18n imports locaux
2. Dans le parent : remplacer la balise `<Modal>...` par la nouvelle balise composée, retirer les states locaux devenus internes au modal (form fields), garder seulement `open` + `target` + `submitting`
3. Adapter le handler `onsubmit` du parent : passer d'un `SubmitEvent` inline à `(payload) => Promise<void>` — le composant fait déjà le `e.preventDefault`
4. Attention Svelte 5 : `let x = $state(propX)` capture uniquement la valeur initiale du prop → utiliser un `$effect(() => { if (open) x = propX })` pour re-sync à chaque ouverture
5. Ajouter un vitest unit spec pour le modal (validation form, onsubmit fires, close via bouton/backdrop)

Pages ciblées (par priorité de longueur) : `projects` (602), `tournaments` (593), `operations` (591), `skills` (559), `fraud` (527), `challenges` (411).

**Statut :** in_progress (1/7 fait)

### [P2] ✅ (fait) Migrer les strings inline restantes vers i18n.t (ar cassé)
**Zone :** `src/routes/sso-sessions/+page.svelte` (18), `src/routes/auth/login/+page.svelte` (10), `src/lib/components/ui/{LevelUpAnimation,MultiSelect,ReplayPlayer,ShareButton}.svelte` (9)
**Type :** implementation
**Contexte :** ces strings utilisent le pattern `i18n.locale === 'fr' ? 'FR' : 'EN'` — elles bypassent complètement `ar.ts`. Un utilisateur admin en arabe voit le fallback anglais partout. Le helper `intlLocale()` a déjà été extrait pour tous les mappings de tags Intl.* (~15 occurrences), reste ces vraies traductions.
**Détail :** pour chaque bloc :
1. Ajouter la clé dans `src/lib/i18n/types.ts` (typing strict)
2. Ajouter les valeurs fr/en/ar dans `fr.ts` / `en.ts` / `ar.ts`
3. Remplacer `i18n.locale === 'fr' ? 'x' : 'y'` par `i18n.t('admin.<ns>.<key>')`

Grouper par écran pour limiter le rework. Priorité `sso-sessions` (bug UI déjà tracké côté back — refactor bienvenu quand on y touche).

**Fix appliqué :** 3 nouveaux sous-namespaces sous `admin` (`admin.sso`, `admin.loginPage`, `admin.levelUp`, `admin.multiSelect`, `admin.replayPlayer`, `admin.shareButton`) — 30+ clés ajoutées en fr/en/ar avec types stricts. Grep `i18n.locale ===` retourne 0 dans src/.

**Statut :** fixed

### [P3] CI GitHub Actions — étendre au projet `admin` Playwright
**Zone :** `.github/workflows/ci.yml`
**Type :** implementation
**Contexte :** le workflow actuel lance seulement les smoke tests (`public` project). Le `admin` project (nav-smoke + 8 flows Phase 2) nécessite un backend + DB en service.
**Détail :** ajouter `services:` postgres + redis + minio + mailpit dans le job e2e, télécharger + build+lancer le binaire skilluv-backend, exécuter le seed admin, puis `npx playwright test --project=admin`.

**Statut :** open

---

## Corrigés

_(vide)_
