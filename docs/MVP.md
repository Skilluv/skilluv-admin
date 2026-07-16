# skilluv-admin — Plan MVP

**Dernière révision** : 2026-07-15 (basé sur audit skilluv-backend jusqu'à P25).

**Contexte** : le backend Rust a évolué de P6 à P25. Le panel admin (SvelteKit 5 + TypeScript strict + Tailwind 4 + i18n EN/FR/AR) n'a pas été touché depuis P5 côté produit — seul `ADMIN-CAPABILITIES.md` a été maintenu à jour (dated 2026-07-08), l'UI accuse ~50 endpoints de retard.

**Principe MVP** : le panel admin doit exposer **une UI opérationnelle** pour toutes les décisions humaines critiques que le backend ne peut pas prendre seul (grant capability, revoke deliverable, changer type entreprise, éditer badge rules, etc.). L'admin panel N'EST PAS pour les modérateurs communautaires (voir `docs/MODERATION-vs-ADMIN.md` dans skilluv-backend) — c'est strictement le back-office staff Skilluv.

---

## 0. Décisions arrêtées (résolvent les ambiguïtés early)

Ces décisions sont prises pour dé-bloquer l'exécution. Toute déviation doit être justifiée par écrit.

**0.1 Stack technique — figée sur l'existant.** SvelteKit 5 + Svelte 5 runes + TypeScript strict + Tailwind 4 (moteur natif via @tailwindcss/vite). Aucune migration framework. Pas d'ajout de DaisyUI / shadcn-svelte. On étend les composants custom existants (`src/lib/components/ui/`). Icônes = Lucide (déjà en place).

**0.2 Nouvelle règle sécurité — 2FA obligatoire pour admin.** Le login admin exige TOTP OU passkey. Un admin sans 2FA configuré est redirigé vers `/auth/setup-2fa` au premier login post-MVP. **Backend change requis** : côté login, si `role='admin'` et `totp_configured=false && webauthn_credentials=0` → renvoyer `AUTH_ADMIN_2FA_SETUP_REQUIRED`.

**0.2.1 Recovery 2FA (obligatoire).** Au setup 2FA, générer 10 recovery codes one-shot (affichés une seule fois, hash bcrypt en DB). Endpoint `POST /api/admin/users/{id}/reset-2fa` réservé à un autre admin (audit log + reason obligatoire) pour re-enrollment si device perdu. Sans ça = risque lockout total du panel.

**0.3 Origin check server-side.** Actuellement CORS seulement (contrôle client). En prod, ajouter middleware backend `require_admin_origin(headers)` qui vérifie `Origin ∈ ADMIN_ORIGINS` env. Sans quoi 403. Sinon un CSRF exfiltré depuis un site externe pourrait taper l'admin panel.

**0.4 Rate-limit destructif.** Chaque action destructive (ban, unban, revoke_capability, revoke_deliverable, dissolve, reject, rank_override) → rate-limit **10 req/min par admin + 100 req/heure** (compteurs Redis sliding-window). Middleware `enforce_admin_destructive`. Livré en BE-D. Circuit breaker (lock 15min sur 5 échecs consécutifs) **reporté post-MVP** : le rate-limit Redis suffit tant que la prod ne montre pas de patterns d'erreur en cascade.

**0.5 Audit log unifié + immuable.** Toute mutation admin passe par `audit_logs::write(admin_id, action, target_type, target_id, reason, before_snapshot, after_snapshot)`. Contraintes :
- Table `audit_logs` en **append-only** : migration 0099 REVOKE UPDATE/DELETE + advisory lock cross-DB. Rôle `audit_admin` PostgreSQL créé avec `GRANT SELECT` uniquement — la purge nécessite un DBA. Livré en BE-E.
- Rétention **7 ans** par défaut, contrôlée via env `SKILLUV_AUDIT_RETENTION_DAYS=2555`.
- Export quotidien vers S3 (chiffré KMS, Object Lock) — **doc écrite** (`docs/AUDIT-APPEND-ONLY.md` back), **code stub** livré, activation post-MVP quand crate `aws-sdk-s3` et bucket Object Lock provisionnés (~2j dev + infra).
- Routes legacy instrumentées en BE-F : KYC decide, community approve/reject, SSO revoke, tournament conclude appellent désormais `audit::record()`.

**0.6 API client versioning.** L'API client (`src/lib/api/admin.ts`) évolue en gardant compatibilité arrière : nouvelles méthodes ajoutées, pas de rename. Types dans `src/lib/types/index.ts` étendus avec `Capability`, `Orientation`, `BadgeRule`, `EnterpriseType`, `FraudFlag`.

**0.7 Reuse partiel des routes backend existantes.** Le backend expose déjà 90+ routes admin, mais :
- **ADM-M1 (Capabilities) et ADM-M2 (Fraud)** = pur frontend, aucune route backend nouvelle.
- **ADM-M3 / M4 / M5** = 13 nouvelles routes backend nécessaires (voir Annexe A).
- **ADM-M0 (Security)** = 3 middlewares + refactor audit sur 4 routes existantes + endpoint `reset-2fa`.

**0.8 Dry-run mode.** Activable via env `SKILLUV_ADMIN_DRY_RUN=1` + helper backend `is_admin_dry_run()` (livré en BE-D). Utile pour tester des actions destructives en staging sans effet réel. Les actions à effet en cascade (`rank-override`, `recompute-proofs`, `deprecate-badge-rule`, `archive-orientation`) supporteront `?dry_run=true` par-endpoint quand elles atterrissent (M3/M5).

**0.9 Estimation réaliste** :
- **Solo dev senior full-time : 10-14 semaines** (features + backend + tests + polish + i18n + buffer). Les 6-8 semaines initiales sous-estimaient i18n (750 traductions dont AR), Playwright, Docker/CI, et refactor sécurité.
- **Équipe de 2 (1 back + 1 front) : 6-8 semaines** en parallèle.
- Ajouter **1 semaine buffer polish/regressions** par tranche de 4 semaines de dev feature.

---

## 1. État actuel — synthèse audit

**Stack** :
- **SvelteKit 2.55.0** (adapter-node SSR) + **Svelte 5.54.1** (runes)
- **TypeScript 5.9.3** strict + **Vite 8.0.1**
- **Tailwind CSS 4.2.2** (moteur natif, pas de config JS lourd)
- **Lucide icons 1.23.0**
- **i18n** EN / FR / AR (843 lignes de clés typées)

**Volumes** :
- `src/routes/` : ~4 372 LOC (15 pages)
- `src/lib/api/` + `types` : ~876 LOC
- `src/lib/stores/` + `i18n/` : ~2 826 LOC
- `src/lib/components/ui/` : ~500 LOC
- **Total** : ~8 600 LOC

**Pages existantes (P5-era)** :

| Route | LOC | Feature | Status backend |
|---|---|---|---|
| `/` | 95 | Dashboard home (business + financial + platform + moderation + infra) | ✅ |
| `/auth/login` | 130 | Login + TOTP | ✅ |
| `/users` | 105 | Liste + search + ban/unban | ✅ |
| `/users/[id]` | 365 | Détail user + actions | ✅ |
| `/challenges` | 410 | CRUD challenges + publish/archive | ✅ |
| `/community` | 87 | Review queue community proposals | ✅ |
| `/reports` | 115 | File d'attente reports + resolve | ✅ |
| `/enterprise-kyc` | 286 | KYC approve/reject + levels | ✅ |
| `/sponsored-challenges` | 497 | Pipeline sponsored + decide + link | ✅ |
| `/tenants` | 288 | Liste tenants + create modal | ✅ |
| `/tenants/[id]` | 664 | Détail tenant + members + cohorts | ✅ |
| `/audit-log` | 294 | Viewer audit log (legacy + generic) | ✅ |
| `/operations` | 373 | One-shot triggers (leaderboard, digest, AI, GitHub sync) | ✅ |
| `/sso-sessions` | 195 | SSO sessions + revoke | ✅ |
| `/tournaments` | 563 | Tournament CRUD + score + conclude | ✅ |

**Auth** :
- Login `/auth/login` → `admin_access_token` (JWT 15min) + `admin_refresh_token` (opaque 7j) + `admin_csrf_token` (double-submit)
- Cookies discriminés par origin (`admin.skilluv.com` vs `skilluv.com`)
- Role check inline : `user.role !== 'admin'` → rejet
- CSRF header `X-CSRF-Token` sur mutations
- ⚠️ **Pas de 2FA obligatoire admin** (à corriger — §0.2)

**Documentation existante** : `ADMIN-CAPABILITIES.md` (753 lignes, dated 2026-07-08). Liste 37 endpoints avec req/resp shapes. **Endpoints P6-P25 backend non documentés**.

---

## 2. Contrat backend — endpoints admin couverts vs manquants

### 2.1 Endpoints couverts par le panel actuel (~37)

Users, Reports, Audit Log, Challenges, Community Review, Dashboard, Enterprise KYC, Sponsored Challenges, SSO Sessions, Seasons, Tournaments, Operations. Voir `ADMIN-CAPABILITIES.md` pour spec détaillée.

### 2.2 Endpoints backend MANQUANTS dans le panel (~50)

| # | Feature | Phase backend | Routes backend | Impact business |
|---|---|---|---|---|
| 1 | **Fraud Dashboard** | P14.5 | `GET /admin/fraud/queue`, `POST /admin/fraud/deliverables/{id}/mark-valid\|revoke`, `POST /admin/fraud/users/{id}/mark-valid`, `POST /admin/fraud/scan-deliverable/{id}`, `POST /admin/fraud/detect-multi-accounts`, `POST /admin/fraud/llm-evaluate/{id}` | Aucune UI pour review plagiat / multi-account / LLM evaluation |
| 2 | **Grant/Revoke capabilities** | P18.4 | `POST /api/admin/users/{id}/capabilities`, `DELETE /api/admin/users/{id}/capabilities/{cap}`, `GET /api/users/{id}/capabilities` | Impossible de nommer un mentor / plagiarism_reviewer sans SQL direct |
| 3 | **Orientations catalog** | P16 | `GET /api/orientations`, `GET /api/orientations/{slug}` (admin CRUD à ajouter) | Impossible d'ajouter une nouvelle orientation métier depuis l'UI |
| 4 | **Badge rules editor** | P17.1 | `GET /api/badge-rules` + CRUD admin à ajouter | Rules éditables uniquement en SQL |
| 5 | **Enterprise type manager** | P24 | `PATCH /api/enterprises/me/type-config`, backend endpoint admin PATCH type à créer | Impossible de changer un enterprise en staffing_agency depuis l'UI |
| 6 | **Community moderator caps** | P25 | même endpoints que grant capabilities, avec liste des 5 caps mod | Impossible d'assigner forum_moderator via UI |
| 7 | **User rank override** | P17.4 | endpoint admin à créer : `POST /api/admin/users/{id}/rank-override` | Impossible de forcer un rank pour cas exceptionnel |
| 8 | **User capabilities view** | P18.4 | `GET /api/users/{id}/capabilities` | Sur la page `/users/[id]` on ne voit pas ses capabilities |
| 9 | **User orientations view** | P16.3 | `GET /api/users/{id}/orientations` (route publique existante) | Idem, invisible sur profil admin |
| 10 | **User badges view** | P17.5 | `GET /api/users/{id}/badges` | Idem, invisible |
| 11 | **User ranks history** | P17.4 | `GET /api/users/{id}/rank-history` (à créer) | Invisible |
| 12 | **Agency clients admin** | P24.2 | `GET /admin/enterprises/{id}/agency-clients` (à créer) | Impossible de review carnets clients agences |
| 13 | **Enterprise type-config view** | P24.3 | `GET /admin/enterprises/{id}/type-config` (à créer) | Idem |
| 14 | **Skill nodes CRUD** | P4/P17.2 | `GET /admin/skills`, POST/PUT (à créer) | Impossible d'ajouter un skill sans SQL |
| 15 | **display_category editor** | P17.2 | même endpoints skills | Idem |
| 16 | **Events + participation admin** | P17.6 | `GET /admin/badge-events`, POST create event (à créer) | Impossible de créer Hacktoberfest / Skilluv Fest depuis UI |
| 17 | **Feature flags** | (jamais implémenté) | backend absent | À prévoir uniquement si besoin réel |
| 18 | **Provider config (Stripe/Momo/FCM/APNS)** | (env vars) | pas d'endpoint | Éditable uniquement via `.env` + redeploy |
| 19 | **GDPR export trigger** | P4 (route existante côté user) | `POST /api/admin/users/{id}/gdpr-export` (à créer) | Impossible de déclencher un export admin-side |
| 20 | **Talent search v3 preview** | P16.4 | `GET /api/talents/search/v3` | UI test/preview pour vérifier ce que voient les recruteurs |
| 21 | **Proof engine sweep manual** | P19.3 | `POST /api/admin/proof-hooks/sweep` (à créer) | Impossible de lancer recompute badges/ranks à la main |
| 22 | **Capabilities engine recompute manuel** | P18.2 | `POST /api/admin/users/{id}/recompute-capabilities` (à créer) | Idem |

**Total : ~22 nouvelles pages / sections + ~15 nouveaux endpoints backend à créer.**

---

## 3. Ce qu'il faut FAIRE — MVP scope

### 3.1 Capability Manager (Phase ADM-M1)

**Page** : `src/routes/users/[id]/capabilities/+page.svelte` OU intégré dans `/users/[id]` en tab.

**Features** :
- Affiche liste capabilities actives (badge visuel par famille : challenger, mentor, admin, etc.)
- Bouton "Grant capability" ouvre modal avec select des 14 caps + optional `expires_at` + `granted_reason`
- Bouton "Revoke" par capability (confirm dialog + reason obligatoire)
- Affiche capabilities révoquées (historique grisé)
- Détecte auto-promotion pending (ex : "user proche du seuil mentor")

**Endpoints consommés** :
- `GET /api/users/{id}/capabilities` (public, mais admin voit revoked)
- `POST /api/admin/users/{id}/capabilities` (P18.4 existant)
- `DELETE /api/admin/users/{id}/capabilities/{cap}` (P18.4 existant)

**Types** à ajouter dans `src/lib/types/index.ts` :
```ts
export type Capability =
  | 'challenger' | 'mentor' | 'project_steward' | 'pr_reviewer'
  | 'bounty_funder' | 'issue_proposer' | 'jury_tournament'
  | 'admin' | 'enterprise_recruiter'
  | 'community_moderator' | 'forum_moderator'
  | 'plagiarism_reviewer' | 'kyc_reviewer' | 'community_curator';

export interface UserCapability {
  capability: Capability;
  granted_at: string;
  granted_reason: string;
  granted_by?: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
}
```

### 3.2 Fraud Dashboard (Phase ADM-M2)

**Page** : `src/routes/fraud/+page.svelte` avec 3 tabs :
- **Plagiarism** : liste `plagiarism_score >= 0.8`, actions mark_valid / revoke.
- **Multi-account** : liste `suspected_multi_account = true`, actions mark_valid / investigate.
- **LLM re-evaluation** : trigger scan sur un deliverable spécifique.

**Endpoints backend existants (P14.5)** — RIEN à ajouter côté backend :
- `GET /admin/fraud/queue?threshold=0.9&limit=50`
- `POST /admin/fraud/deliverables/{id}/mark-valid`
- `POST /admin/fraud/deliverables/{id}/revoke` (avec body `{reason}`)
- `POST /admin/fraud/users/{id}/mark-valid`
- `POST /admin/fraud/scan-deliverable/{id}?threshold=0.9&window_days=30`
- `POST /admin/fraud/detect-multi-accounts` (body `{window_hours, min_group_size}`)
- `POST /admin/fraud/llm-evaluate/{id}` (P15.2)

### 3.3 Orientations catalog + Badge rules (Phase ADM-M3)

**Page** : `src/routes/catalog/+page.svelte` avec 2 tabs :

**Tab Orientations** :
- Liste 31 orientations curated (dev-frontend, pentester-web, etc.).
- Colonne `primary_domain`, `secondary_domains[]`, `tags[]`, `is_curated`, `is_archived`.
- Actions : create, edit, archive (soft), assign skills via `orientation_skill_map`.

**Endpoints** :
- `GET /api/orientations?include_archived=true&limit=100` (existant P16.3)
- `GET /api/orientations/{slug}` (détail + skills, existant)
- **Nouveaux backend** à créer : `POST /api/admin/orientations`, `PATCH /api/admin/orientations/{slug}`, `POST /api/admin/orientations/{slug}/skills` (attach), `DELETE .../skills/{skill_id}` (detach).

**Tab Badge rules** :
- Liste 9 legacy + N nouvelles rules.
- Colonne `slug`, `output_type`, `rarity`, `conditions` (JSON preview), `deprecated_at`.
- Editor JSON conditions avec validation live.

**Endpoints** :
- `GET /api/badge-rules` (existant P17.5)
- **Nouveaux backend** : `POST /api/admin/badge-rules`, `PATCH /api/admin/badge-rules/{slug}`, `POST /api/admin/badge-rules/{slug}/deprecate`.

### 3.4 Enterprise Type Manager (Phase ADM-M4)

**Extension** de `/enterprise-kyc` OU nouvelle page `src/routes/enterprises/+page.svelte`.

**Features** :
- Liste enterprises avec filtre `enterprise_type` (direct_hire / staffing_agency / remote_international).
- Détail enterprise : voir `type_config JSONB`, éditer via form conditionnel selon type.
- Pour staffing_agency : voir liste `agency_clients` en sous-tab.

**Endpoints backend existants (P24)** :
- `GET /api/enterprises/me/type-config` (existant, admin-scoped à créer)
- `PATCH /api/enterprises/me/type-config` (existant)
- `GET/POST/PATCH/DELETE /api/enterprises/me/agency-clients` (existant)

**Nouveaux backend** :
- `GET /api/admin/enterprises?type=X&verified=true` (list all)
- `PATCH /api/admin/enterprises/{id}/type` (change type — attention aux invariants trigger PG)
- `GET /api/admin/enterprises/{id}/type-config`
- `GET /api/admin/enterprises/{id}/agency-clients`

### 3.5 Enrichissement page /users/[id] (Phase ADM-M5)

**Extension** de la page existante avec **4 nouvelles sections** :

1. **Capabilities** — liste actives + bouton grant/revoke (Phase ADM-M1).
2. **Orientations** — liste `user_orientations` avec mode (learning/active), primary, dates.
3. **Badges** — grille compacte (rank chevron + skill patches + medals + seals count).
4. **Timeline** (optionnel post-MVP) — historique promotions rank + capabilities.
5. **Bouton "Recompute proof engines"** — trigger manuel `POST /api/admin/users/{id}/recompute-proofs` (nouveau backend endpoint qui wrap `proof_hooks::recompute_all_for_user`).
6. **Bouton "Force rank"** — pour cas exceptionnel, avec confirm dialog + reason obligatoire + audit log.

**Endpoints existants** :
- `GET /api/users/{id}/capabilities` (P18.4)
- `GET /api/users/me/orientations` (P16.3, à ajouter équivalent `/api/users/{id}/orientations` pour admin)
- `GET /api/users/{id}/badges` (P17.5)

**Nouveaux backend** :
- `POST /api/admin/users/{id}/recompute-proofs` (wrap `proof_hooks::recompute_all_for_user`)
- `POST /api/admin/users/{id}/rank-override` (avec `new_rank`, `reason`)

### 3.0 Security hardening (Phase ADM-M0 — PRÉREQUIS)

**Livrée AVANT toutes les features M1..M5.** Rationale : les phases suivantes ajoutent des mutations sensibles (grant capability, rank override, revoke deliverable). Les ouvrir sans 2FA mandatory + audit uniforme = fenêtre 5+ semaines d'exposition inutile.

**Toutes les décisions §0.2 à §0.5 + §0.8** :

- **2FA mandatory admin** : côté login backend, si role='admin' et pas de TOTP + pas de passkey → renvoyer `AUTH_ADMIN_2FA_SETUP_REQUIRED`. Côté frontend, page `/auth/setup-2fa` qui force le user à configurer.
- **Recovery codes** (§0.2.1) : 10 codes one-shot au setup + endpoint `reset-2fa` réservé à un autre admin.
- **Origin server-side check** : middleware backend `require_admin_origin(headers)` sur toutes routes `/api/admin/*`.
- **Rate-limit destructive** : middleware `enforce_admin_destructive` (10 req/min, 100/heure) sur ban, revoke, dissolve, reject, rank_override (BE-D livré). Circuit breaker deferred post-MVP.
- **Audit log unifié + immuable** : append-only (migration 0099 + rôle `audit_admin` SELECT-only), rétention 7 ans via `SKILLUV_AUDIT_RETENTION_DAYS`, export S3 Object Lock deferred (code stub livré, active quand infra AWS/R2 provisionnée). Legacy handlers (KYC, community, SSO revoke, tournament conclude) instrumentés en BE-F.
- **Dry-run mode** (§0.8) : env `SKILLUV_ADMIN_DRY_RUN=1` + helper `is_admin_dry_run()` (BE-D livré).
- ~~IP allowlist~~ **retirée du MVP SaaS** (admins mobiles/VPN/dynamic IPs cassent le flow). Repoussée en option on-prem post-MVP via env `SKILLUV_ADMIN_IP_ALLOWLIST` documenté mais non implémenté au core.

### 3.7 Tests + docs + deploy (Phase ADM-M7)

- **Playwright e2e** : au moins 1 test par page critique (login flow, grant capability, fraud queue, tenant CRUD).
- **`ADMIN-CAPABILITIES.md` mis à jour** avec les ~22 nouvelles sections + les ~15 nouveaux endpoints backend.
- **Dockerfile** admin (actuellement absent) + `docker-compose.admin.yml`.
- **CI GitHub Actions** : `svelte-check` + `npm run build` + `playwright test`.
- **README** avec status "MVP-ready" + captures d'écran.

---

## 4. Ce qu'il faut NE PAS FAIRE (anti-scope creep)

- ❌ **Pas d'accès admin pour community_moderator** — ils utilisent skilluv-frontend. Voir `docs/MODERATION-vs-ADMIN.md` dans le backend.
- ❌ **Pas de feature flags UI au MVP** — pas d'endpoint backend, pas besoin urgent. Post-MVP si demande utilisateur.
- ❌ **Pas de provider config UI** (Stripe secrets, FCM keys) — restent en `.env` prod, jamais UI (risque sécurité massif).
- ❌ **Pas de dark/light theme toggle** au MVP — l'admin panel reste sur un thème unique (Tailwind dark ou light au choix design). Le toggle existe déjà (`stores/theme.svelte.ts`) mais bas priorité.
- ❌ **Pas de refactor framework** — reste SvelteKit 5 + Svelte runes. Zero migration Nuxt/Next/React/etc.
- ❌ **Pas de composant library externe** (DaisyUI, shadcn-svelte, Skeleton UI) — on étend `src/lib/components/ui/` custom.
- ❌ **Pas d'admin mobile** — l'admin panel est desktop-first, mobile responsive minimum (Tailwind gère). Pas de PWA install banner.

---

## 5. Ce qu'il faut MODIFIER

### 5.1 `src/lib/api/admin.ts` — étendre l'API client

Ajouter ~15 nouvelles fonctions (une par nouveau backend endpoint). Groupées par domaine :

```ts
// P18/P25 — Capabilities
adminApi.getUserCapabilities(userId) → UserCapability[]
adminApi.grantCapability(userId, {capability, reason, expires_at?})
adminApi.revokeCapability(userId, cap, {reason})
adminApi.recomputeCapabilities(userId)

// P14.5 — Fraud
adminApi.fraudQueue({threshold, limit})
adminApi.markDeliverableValid(id)
adminApi.revokeDeliverable(id, {reason})
adminApi.markUserValid(id)
adminApi.scanDeliverable(id, {threshold, window_days})
adminApi.detectMultiAccounts({window_hours, min_group_size})
adminApi.llmEvaluateDeliverable(id)

// P16 — Orientations
adminApi.createOrientation({slug, name, ...})
adminApi.updateOrientation(slug, patch)
adminApi.attachSkillToOrientation(slug, {skill_id, is_core, weight})
adminApi.detachSkillFromOrientation(slug, skillId)

// P17 — Badges + ranks + events
adminApi.createBadgeRule(payload)
adminApi.updateBadgeRule(slug, patch)
adminApi.deprecateBadgeRule(slug)
adminApi.overrideUserRank(userId, {new_rank, reason})
adminApi.createBadgeEvent({slug, name, starts_at, ...})

// P19 — Proof hooks
adminApi.recomputeAllProofs(userId)
adminApi.triggerProofSweep({within_days})

// P24 — Enterprise types
adminApi.listEnterprises({type, verified, page})
adminApi.updateEnterpriseType(id, {enterprise_type})
adminApi.getEnterpriseTypeConfig(id)
adminApi.getEnterpriseAgencyClients(id)
```

### 5.2 `src/lib/types/index.ts` — étendre les types

Ajouter :
- `Capability` union type (14 valeurs)
- `UserCapability` interface
- `Orientation`, `OrientationSkillMap`
- `BadgeRule`, `UserBadge`, `Rank`
- `EnterpriseType` union type
- `TypeConfig` (union tagged par enterprise_type)
- `FraudFlag` (deliverable ou user)

### 5.3 `src/lib/components/ui/` — nouveaux composants

Ajouter :
- `CapabilityBadge.svelte` — badge visuel par famille (couleur, icône).
- `RankChevron.svelte` — chevron scout Apprenti→Doyen (5 variants).
- `SkillPatch.svelte` — patch rond avec rareté (bordure).
- `JsonEditor.svelte` — editor JSON pour badge_rules conditions + type_config. **Décision** : `<textarea>` monospace + `JSON.parse` + validation live + preview parsed. Pas de CodeMirror (150 KB gzip pour 2 usages = trop cher). Coloration syntaxique différée post-MVP si besoin.
- `ConfirmDangerousDialog.svelte` — modal double-confirmation avec reason obligatoire pour actions destructives.

### 5.4 `src/lib/i18n/` — étendre les traductions

Ajouter clés pour :
- 22 nouvelles pages/sections
- 14 capability names (avec description courte)
- 31 orientations names
- Actions destructives + confirmations
- Erreurs backend spécifiques (fraud, capability revoked, etc.)

Estimation : ~250 nouvelles clés × 3 langues = ~750 traductions.

**Plan de traduction** :
1. **EN + FR** rédigés par le dev (source de vérité EN, FR = traduction directe).
2. **AR** : premier jet via DeepL/GPT-5 → **review obligatoire par locuteur natif** (RTL, terminologie technique, tournures polies). Ne pas ship AR non-relu — préférer fallback EN si le review glisse.
3. Clés stockées par domaine (`capabilities.*`, `fraud.*`, etc.) pour éviter merge conflicts.
4. CI check : détecter clés manquantes (parity FR/AR vs EN).

### 5.5 `src/routes/+layout.svelte` — sidebar admin étendue

La navigation actuelle a 6 quick-actions. Réorganiser en sidebar hiérarchique :
- Dashboard
- Users → (Users, Capabilities queue, Rank overrides)
- Content → (Challenges, Community review, Orientations, Badge rules, Events)
- Moderation → (Reports, Fraud queue, Sponsored, KYC)
- Enterprises → (List, Agency clients, KYC)
- Financial → (Revenue, Invoices, Payouts)
- Operations → (Leaderboard, Digest, AI jobs, GitHub sync, Proof sweep)
- Audit → (Audit log, SSO sessions)
- Tournaments & Seasons

### 5.6 Refactor auth flow pour 2FA mandatory

- `/auth/login/+page.svelte` : si backend renvoie `AUTH_ADMIN_2FA_SETUP_REQUIRED`, redirect `/auth/setup-2fa`.
- Nouveau `/auth/setup-2fa/+page.svelte` : force user à setup TOTP OU passkey avant d'accéder au reste. Bloque toute navigation tant que non fait.

---

## 6. Ce qu'il faut SUPPRIMER

**Rien à supprimer.** Tout le code P5-era est réutilisable + nécessaire.

**À déprécier** (mais garder pendant transition) :
- Dans `README.md` la ligne "Future admin surfaces (planned...)" mentionne "seasons management" qui est déjà implémenté. Update le README post-MVP.

---

## 7. Phases séquencées

**Estimation totale : 10-14 semaines solo dev senior, 6-8 semaines à 2 devs** (voir §0.9). Buffer polish 1 semaine par tranche de 4 semaines inclus.

**Ordre imposé : ADM-M0 (security) EN PREMIER**, puis M1..M5 en parallèle possible, M7 en clôture.

### Phase ADM-M1 — Capability Manager ⏱️ 5-7 jours

- [ ] Nouveaux types `Capability`, `UserCapability`.
- [ ] Extension `adminApi` avec 4 méthodes capabilities.
- [ ] Composant `CapabilityBadge.svelte`.
- [ ] Page `/users/[id]/capabilities` OU tab dans `/users/[id]`.
- [ ] Grant modal + revoke confirm dialog.
- [ ] i18n 14 capability names + descriptions.
- [ ] **Vitest** : unit tests sur `adminApi.grantCapability`, `.revokeCapability`, store reducer.
- [ ] Tests Playwright : grant + revoke + expires_at.

**Note** : Vitest est setup en ADM-M1 (config + premier test) puis étendu au fil des phases. Cible : ≥60% coverage sur `src/lib/api/` et `src/lib/stores/`.

**DoD** : un admin peut nommer un mentor / plagiarism_reviewer / forum_moderator depuis l'UI, avec audit log automatique.

### Phase ADM-M2 — Fraud Dashboard ⏱️ 4-6 jours

- [ ] Page `/fraud/+page.svelte` avec 3 tabs (Plagiarism, Multi-account, LLM eval).
- [ ] `adminApi.fraudQueue()`, `.markDeliverableValid()`, `.revokeDeliverable()`, `.scanDeliverable()`, `.detectMultiAccounts()`, `.llmEvaluate()`.
- [ ] Table sortable par plagiarism_score, columns collapsibles.
- [ ] Modal review deliverable avec code diff (utiliser `diff2html` déjà courant).
- [ ] i18n complet fraud + KYC + confirmations.
- [ ] Tests Playwright : mark valid, revoke avec reason, scan.

**DoD** : un plagiarism_reviewer (via admin panel — car pour MVP le front user n'a pas encore ces outils) peut trier la fraud queue et prendre des décisions.

### Phase ADM-M3 — Orientations + Badge rules ⏱️ 6-8 jours

**Backend ajouts nécessaires** (~2 jours dev backend) :
- [ ] `POST /api/admin/orientations`, `PATCH /api/admin/orientations/{slug}`, skill attach/detach.
- [ ] `POST /api/admin/badge-rules`, `PATCH`, `POST .../deprecate`.

**Frontend** :
- [ ] Page `/catalog/+page.svelte` avec 2 tabs.
- [ ] Composant `JsonEditor.svelte` pour badge_rules conditions.
- [ ] Preview live du CHECK (validate conditions avant save).
- [ ] i18n.
- [ ] Tests Playwright : create orientation + attach skills, create badge rule.

**DoD** : admin peut créer/éditer orientations et badge_rules sans SQL.

### Phase ADM-M4 — Enterprise Type Manager ⏱️ 4-5 jours

**Backend ajouts** (~1 jour) :
- [ ] `GET /api/admin/enterprises?type=X`, `PATCH /api/admin/enterprises/{id}/type`.

**Frontend** :
- [ ] Page `/enterprises/+page.svelte` (liste filtrable par type).
- [ ] Détail enterprise avec form conditionnel selon type (agency clients tab, remote intl config, direct hire minimal).
- [ ] i18n.
- [ ] Tests Playwright.

**DoD** : admin peut convertir une enterprise en staffing_agency, voir son carnet clients, éditer son type_config.

### Phase ADM-M5 — Enrichissement /users/[id] ⏱️ 4-5 jours

**Backend ajouts** (~1 jour) :
- [ ] `POST /api/admin/users/{id}/recompute-proofs`, `POST .../rank-override`, `GET .../orientations`, `GET .../badges` (déjà partagée avec public si `profile_active`).

**Frontend** :
- [ ] Extension de `/users/[id]/+page.svelte` avec 4 sections (capabilities, orientations, badges, timeline).
- [ ] Boutons "Recompute proofs" + "Force rank" avec confirm.
- [ ] Composant `RankChevron`, `SkillPatch`.
- [ ] i18n.

**DoD** : admin a une vue complète du user en une page : identité + capabilities + orientations + badges + rank + actions.

### Phase ADM-M0 — Security hardening (PRÉREQUIS, avant M1) ⏱️ 7-9 jours

**Backend** (livré P1+P2, ~5 jours) :
- [x] Login retourne soft flag `requires_totp_setup` + middleware `ensure_admin_2fa` renvoie 403 `AUTH_ADMIN_2FA_SETUP_REQUIRED` (BE-A).
- [x] Génération + stockage bcrypt des 10 recovery codes au setup 2FA (déjà en place P5-era).
- [x] `POST /api/admin/users/{id}/reset-2fa` avec `{reason: string ≥8}` + audit (BE-B).
- [x] Middleware `ensure_admin_origin` sur `/api/admin/*` — 403 `AUTH_ADMIN_ORIGIN_REQUIRED` (BE-C).
- [x] Middleware `enforce_admin_destructive` (10/min, 100/h Redis sliding-window) (BE-D). Circuit breaker → post-MVP.
- [x] `audit_logs` append-only : migration 0099 REVOKE UPDATE/DELETE + rôle `audit_admin` SELECT-only + advisory lock cross-DB + doc `docs/AUDIT-APPEND-ONLY.md` (BE-E).
- [x] Handlers legacy instrumentés `audit::record()` : KYC decide, community approve/reject, SSO revoke, tournament conclude (BE-F).
- [x] Helper `is_admin_dry_run()` via env `SKILLUV_ADMIN_DRY_RUN` (BE-D).
- [ ] Cron `admin_audit_export` → S3 KMS Object Lock : **deferred post-MVP** (crate `aws-sdk-s3` + bucket Object Lock à provisionner, ~2j + infra).

**Frontend** (livré, commit `b614ba4`, ~3 jours) :
- [x] Page `/auth/setup-2fa/+page.svelte` (QR + verify TOTP + 10 backup codes avec copy/download/acknowledge).
- [x] Page `/auth/recovery-2fa/+page.svelte` (login via backup code, normalisation live du format).
- [x] Login gère `requires_totp_setup` soft flag + fallback `AUTH_ADMIN_2FA_SETUP_REQUIRED` + lien vers recovery.
- [x] Handler `AUTH_ADMIN_ORIGIN_REQUIRED` (toast erreur, pas de redirect car boucle).
- [x] `ConfirmDangerousDialog.svelte` — modal réutilisable, validation reason live, `minReasonLength` configurable.
- [x] Reset 2FA admin→admin sur `/users/[id]` (min 8 chars, self-reset bloqué).
- [x] Toutes actions destructives (ban/unban/reject/revoke/close/conclude/dissolve/digest/reset2fa) via ce composant.
- [x] Vitest setup + 30 tests (5 fichiers).
- [x] Silent catches remplacés par toast d'erreur via `errorMessage()` helper.

**Env prod à setter** :
```
ADMIN_ORIGINS=https://admin.skilluv.com,https://admin-preview.skilluv.com
SKILLUV_ADMIN_DRY_RUN=0
SKILLUV_AUDIT_RETENTION_DAYS=2555
```

**DoD atteint** : impossible d'être admin sans 2FA. Recovery flow testé end-to-end (unit + intégration). Impossible d'appeler `/api/admin/*` depuis un autre origin. Actions destructives rate-limitées Redis + auditées immuablement. Export S3 des audit logs reste à activer côté infra pour compliance long terme.

### Phase ADM-M7 — Tests + docs + deploy ⏱️ 4-5 jours

- [ ] Playwright suite complete (1 test par page critique) — 15+ tests.
- [ ] `ADMIN-CAPABILITIES.md` mis à jour avec ~22 nouvelles sections.
- [ ] `README.md` mis à jour "MVP-ready".
- [ ] Nouveau `Dockerfile` + `docker-compose.admin.yml`.
- [ ] GitHub Actions CI : svelte-check + build + playwright.
- [ ] Screenshots UX dans README.

**DoD** : admin panel déployable via `docker compose up admin` + CI passe verte.

---

## 8. Post-MVP

Une fois MVP livré, alignement avec les enhancements backend :

- **Feature flags UI** si demandé (backend à créer aussi).
- **Financial dashboard enrichi** avec drill-down par tenant.
- **Mentor reputation dashboard** (P24+ backend candidat).
- **Admin mobile app** (React Native ou Capacitor wrap) — uniquement si les admins terrain le demandent.
- **Bulk actions** (bulk grant capability, bulk KYC decide) si volumétrie l'exige.
- **AI-assisted moderation** (P25 + Tier 3.1 backlog) — pre-score les items de la fraud queue via LLM.

---

## 9. Risques & rollback

Chaque phase introduit des mutations sur des données production. Mitigations obligatoires avant merge.

| Risque | Phase | Mitigation | Rollback |
|---|---|---|---|
| Grant capability accidentel (mentor à un user non qualifié) | M1 | Confirm dialog + audit + expires_at optionnel | `DELETE .../capabilities/{cap}` supporté nativement (P18.4) |
| Revoke deliverable = perte XP/rank cascade | M2 | Dry-run preview obligatoire (§0.8) | Endpoint `undo-revoke` à ajouter côté backend, garde `revoked_snapshot` en DB |
| Edit orientation casse la recherche talents v3 | M3 | **Soft-delete + versioning obligatoire** : `is_archived` + `version` incrémenté, ancienne version conservée 90j | Restore via bump version + `is_archived=false` |
| Deprecate badge rule casse badge attribution existants | M3 | `deprecated_at` non-destructif + dry-run comptant users impactés | Reset `deprecated_at=NULL` |
| Change enterprise_type viole triggers PG (staffing_agency requires seats) | M4 | Backend validation stricte + transaction rollback si invariants échouent | Aucun rollback nécessaire (transaction atomique) |
| Rank override cascade sur classements/rewards | M5 | Dry-run montre delta leaderboard + confirm double | Re-run `recompute-proofs` sans override |
| Recompute-proofs sur user actif = incohérence temporaire | M5 | Verrou row-level PG pendant recompute + notification "recompute en cours" au user | Automatique (transaction) |
| 2FA rollout casse login pour admin sans setup | M0 | Grace period 7j : bandeau warning au lieu de redirect forcé, puis strict | Env flag `SKILLUV_ADMIN_2FA_ENFORCE=false` pour désactivation temporaire (audit obligatoire) |
| Audit log append-only bloque migrations DB | M0 | Rôle `audit_admin` séparé documenté dans `docs/RUNBOOK.md` | Grant temporaire `audit_admin` à un DBA pour migration + revoke immédiat |

**Règle générale** : toute nouvelle mutation admin doit répondre à 3 questions dans la PR description :
1. Quel est l'effet en cascade (autres tables/systèmes touchés) ?
2. Comment on rollback si erreur en prod ?
3. Le dry-run mode couvre-t-il tous les effets visibles ?

Sans réponse aux 3, la PR ne merge pas.

---

## Annexe A — Endpoints backend à créer (~15 nouveaux)

| # | Route | Body/Query | Utilisé par page |
|---|---|---|---|
| 1 | `POST /api/admin/orientations` | `{slug, name, primary_domain, ...}` | /catalog (orientations tab) |
| 2 | `PATCH /api/admin/orientations/{slug}` | partial fields | idem |
| 3 | `POST /api/admin/orientations/{slug}/skills` | `{skill_id, is_core, weight}` | idem |
| 4 | `DELETE /api/admin/orientations/{slug}/skills/{skill_id}` | — | idem |
| 5 | `POST /api/admin/badge-rules` | `{slug, output_type, conditions, ...}` | /catalog (rules tab) |
| 6 | `PATCH /api/admin/badge-rules/{slug}` | partial | idem |
| 7 | `POST /api/admin/badge-rules/{slug}/deprecate` | — | idem |
| 8 | `POST /api/admin/badge-events` | `{slug, name, starts_at, visual_theme}` | /catalog (events tab, futur) |
| 9 | `GET /api/admin/enterprises` | `?type=X&verified=true&page=1` | /enterprises |
| 10 | `PATCH /api/admin/enterprises/{id}/type` | `{enterprise_type}` | /enterprises/[id] |
| 11 | `GET /api/admin/enterprises/{id}/type-config` | — | idem |
| 12 | `GET /api/admin/enterprises/{id}/agency-clients` | — | idem |
| 13 | `POST /api/admin/users/{id}/recompute-proofs` | — | /users/[id] |
| 14 | `POST /api/admin/users/{id}/rank-override` | `{new_rank, reason}` | idem |
| 15 | `POST /api/admin/proof-hooks/sweep` | `?within_days=7` | /operations |
| 16 | `POST /api/admin/users/{id}/reset-2fa` | `{reason}` | ADM-M0 setup-2fa recovery |

**Estimation ajouts backend : ~5-7 jours de dev cumulé pour M3/M4/M5** (CRUD simples avec `require_capability("admin")` + audit log). **+ ~5 jours pour ADM-M0** (middlewares + audit refactor + append-only + export S3). À faire en parallèle du frontend correspondant.

**Toutes les mutations doivent supporter `?dry_run=true`** (§0.8).

---

## Annexe B — Mapping ADM-Mx → Backend Px

| Phase admin | Backend requis | Backend nouveau |
|---|---|---|
| **ADM-M0** (prérequis) | (nouveau) | 3 middlewares + 4 refactors audit + reset-2fa + append-only + export S3 (~5j) |
| ADM-M1 | P18.4 | 0 |
| ADM-M2 | P14.5 | 0 |
| ADM-M3 | P16, P17 | 7 endpoints (~2j) |
| ADM-M4 | P24 | 4 endpoints (~1j) |
| ADM-M5 | P16, P17, P18, P19 | 2 endpoints (~1j) |
| ADM-M7 | — | 0 |
| **TOTAL** | | **~16 endpoints + M0 ≈ 9-10 jours dev backend** |

Backend + frontend cumulés : **10-14 semaines** pour un dev senior full-stack, **6-8 semaines** pour une équipe de 2 (1 back + 1 front). Voir §0.9.

---

## Annexe C — Composants UI à créer

| Composant | Loc estimée | Utilisé par |
|---|---|---|
| `CapabilityBadge.svelte` | 60 | ADM-M1, /users/[id] |
| `RankChevron.svelte` | 80 | /users/[id] |
| `SkillPatch.svelte` | 100 | /users/[id] |
| `JsonEditor.svelte` (CodeMirror wrapper) | 150 | ADM-M3, ADM-M4 |
| `ConfirmDangerousDialog.svelte` | 120 | Toutes actions destructives ADM-M6 |
| `FraudDeliverableRow.svelte` | 100 | ADM-M2 |
| `OrientationCard.svelte` | 80 | ADM-M3 |
| `BadgeRuleEditor.svelte` | 200 | ADM-M3 |
| `EnterpriseTypeCard.svelte` | 80 | ADM-M4 |
| `TimelineEvent.svelte` (optionnel) | 60 | /users/[id] post-MVP |

**Total : ~1 030 LOC de composants nouveaux + ~1 600 LOC de pages/routes = ~2 630 LOC MVP.**
