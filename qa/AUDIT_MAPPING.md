# Mapping Admin ↔ Backend — Source de vérité

> Croisement des appels **réels** du front (source : `src/lib/api/admin.ts` — 977 lignes) avec les routes déclarées du backend Rust.
>
> ⚠️ Cet audit remplace l'audit front initial qui contenait des hallucinations d'URL. Le contrat authoritative front est `src/lib/api/admin.ts`, pas les pages `+page.svelte` (qui ne font jamais de `fetch()` direct — elles passent par ce client).

## Légende

- ✅ Mapping OK (route back existe et prefix matche)
- ⚠️ Warning (route existe mais gate/protection à vérifier)
- ❌ Gap — appel front sans route back correspondante
- 🔒 Route back existante non consommée par le front

---

## 1. Auth & session

| Front (`admin.ts` / login) | Back | Statut |
|---|---|---|
| POST `/api/auth/login` | POST `/api/auth/login` (auth.rs) | ✅ |
| GET `/api/auth/me` (hooks.server.ts guard) | GET `/api/auth/me` | ✅ |
| GET `/api/auth/totp-setup` | à confirmer dans auth.rs | ✅ (setup 2FA existe) |
| POST `/api/auth/totp-enable` | idem | ✅ |

## 2. Users & moderation

| Front | Back (admin_moderation.rs / admin.rs) | Statut |
|---|---|---|
| GET `/admin/users` | GET `/admin/users` | ✅ |
| GET `/admin/users/{id}` | GET `/admin/users/{id}` | ✅ |
| POST `/admin/users/{id}/ban` | POST `/admin/users/{id}/ban` | ✅ |
| POST `/admin/users/{id}/unban` | POST `/admin/users/{id}/unban` | ✅ |
| POST `/admin/users/{id}/reset-2fa` | POST `/admin/users/{id}/reset-2fa` (admin.rs) | ✅ |
| GET/POST/DELETE `/admin/users/{id}/capabilities[...]` | à vérifier dans capabilities.rs | ⚠️ |
| POST `/admin/users/{id}/recompute-proofs` | POST idem (admin_users.rs) | ✅ |
| POST `/admin/users/{id}/rank-override` | POST idem | ✅ |
| POST `/admin/users/{id}/gdpr-export` | POST idem (admin_ops.rs) | ✅ |
| POST `/admin/users/{id}/recompute-capabilities` | POST idem (admin_ops.rs) | ✅ |

## 3. Reports & audit

| Front | Back | Statut |
|---|---|---|
| GET `/admin/reports` | GET `/admin/reports` | ✅ |
| PUT `/admin/reports/{id}` | PUT `/admin/reports/{id}` | ✅ |
| GET `/admin/audit-log` | GET idem (legacy) | ✅ |
| GET `/admin/audit-log/generic` | GET idem (admin.rs) | ✅ |

## 4. Fraud

| Front | Back (admin_fraud.rs) | Statut |
|---|---|---|
| GET `/admin/fraud/queue` | GET idem | ✅ |
| POST `/admin/fraud/deliverables/{id}/mark-valid` | POST idem | ✅ |
| POST `/admin/fraud/deliverables/{id}/revoke` | POST idem | ✅ |
| POST `/admin/fraud/users/{id}/mark-valid` | POST idem | ✅ |
| POST `/admin/fraud/scan-deliverable/{id}` | POST idem | ✅ |
| POST `/admin/fraud/detect-multi-accounts` | POST idem | ✅ |
| POST `/admin/fraud/llm-evaluate/{id}` | POST idem | ✅ |
| — | POST `/admin/fraud/deep-scan/{id}` | 🔒 non consommé |

## 5. Dashboard

| Front | Back (admin_dashboard.rs + admin.rs) | Statut |
|---|---|---|
| GET `/admin/stats` | GET `/admin/stats` | ✅ |
| GET `/admin/dashboard/moderation` | GET idem | ✅ |
| GET `/admin/dashboard/overview` | GET idem | ✅ |
| GET `/admin/dashboard/financial` | GET idem | ✅ |
| GET `/admin/dashboard/moderation-queue` | GET idem | ✅ |
| GET `/admin/dashboard/health` | GET idem | ✅ |

## 6. Challenges (core admin)

| Front | Back (admin.rs) | Statut |
|---|---|---|
| GET `/admin/challenges` | GET idem | ✅ |
| POST `/admin/challenges` | POST idem | ✅ |
| PUT `/admin/challenges/{id}` | PUT idem | ✅ |
| POST `/admin/challenges/{id}/publish` | POST idem | ✅ |
| POST `/admin/challenges/{id}/archive` | POST idem | ✅ |
| — | POST `/admin/challenges/{id}/variant` | 🔒 IA-C.1 non exposé côté UI |

## 7. Community moderation

| Front | Back (admin_community.rs) | Statut |
|---|---|---|
| GET `/admin/community/review` | GET idem | ✅ |
| POST `/admin/community/{id}/approve` | POST idem | ✅ |
| POST `/admin/community/{id}/reject` | POST idem | ✅ |

## 8. Enterprises + KYC + SSO

| Front | Back | Statut |
|---|---|---|
| GET `/admin/enterprises` | GET idem (admin_enterprises.rs) | ✅ |
| GET `/admin/enterprises/{id}` | GET idem | ✅ |
| GET `/admin/enterprises/{id}/type-config` | GET idem | ✅ |
| GET `/admin/enterprises/{id}/agency-clients` | GET idem | ✅ |
| PATCH `/admin/enterprises/{id}/type?dry_run=...` | PATCH idem | ✅ |
| GET `/admin/enterprise-kyc` | GET idem (enterprise_kyc.rs) | ✅ |
| POST `/admin/enterprise-kyc/{id}/decide` | POST idem | ✅ |
| GET `/admin/sso/sessions` | GET idem (admin.rs) | ✅ |
| POST `/admin/sso/sessions/{id}/revoke` | POST idem | ✅ |

## 9. Sponsored challenges

| Front | Back (sponsored_challenges.rs) | Statut |
|---|---|---|
| GET `/admin/sponsored-challenges` | GET idem | ✅ |
| POST `/admin/sponsored-challenges/{id}/decide` | POST idem | ✅ |
| POST `/admin/sponsored-challenges/{id}/link` | POST idem | ✅ |

## 10. Projects (flagships + OSS partners)

| Front | Back (projects.rs) | Statut |
|---|---|---|
| GET `/admin/projects?filters` | à confirmer (routes admin projets multiples) | ⚠️ |
| GET `/admin/projects/{slug}` | à confirmer | ⚠️ |
| POST `/admin/projects` | à confirmer | ⚠️ |
| PATCH `/admin/projects/{slug}` | à confirmer | ⚠️ |
| DELETE `/admin/projects/{slug}` (archive) | POST `/admin/projects/{slug}/archive` existe | ⚠️ mismatch DELETE vs POST |

## 11. Skills catalog

| Front | Back (admin_skills.rs) | Statut |
|---|---|---|
| GET `/admin/skills` | GET idem | ✅ |
| POST `/admin/skills` | POST idem | ✅ |
| PUT `/admin/skills/{id}` | PUT idem | ✅ |

## 12. Orientations

| Front | Back (admin_orientations.rs) | Statut |
|---|---|---|
| POST `/admin/orientations` | POST idem | ✅ |
| PATCH `/admin/orientations/{slug}` | PATCH idem | ✅ |
| POST `/admin/orientations/{slug}/skills` | POST idem | ✅ |
| DELETE `/admin/orientations/{slug}/skills/{id}` | DELETE idem | ✅ |

## 13. Badge rules + events

| Front | Back (admin_badge_rules.rs + admin_ops.rs) | Statut |
|---|---|---|
| POST `/admin/badge-rules` | POST idem | ✅ |
| PATCH `/admin/badge-rules/{slug}` | PATCH idem | ✅ |
| POST `/admin/badge-rules/{slug}/deprecate` | POST idem | ✅ |
| GET/POST `/admin/badge-events` | GET/POST idem | ✅ |

## 14. Seasons + tournaments

| Front | Back (seasons.rs + tournament.rs) | Statut |
|---|---|---|
| POST `/admin/seasons` | POST idem | ✅ |
| POST `/admin/seasons/{id}/status` | ⚠️ back = `/admin/seasons/{slug}/activate` — non aligné | ❌ **mismatch** |
| POST `/admin/seasons/{id}/close` | à confirmer (route existe ligne 39) | ⚠️ |
| POST `/admin/tournaments` | POST idem | ✅ |
| POST `/admin/tournaments/{id}/status` | à confirmer | ⚠️ |
| POST `/admin/tournaments/{id}/score` | POST idem | ✅ |
| POST `/admin/tournaments/{id}/conclude` | POST idem | ✅ |

## 15. Ops / jobs / integrations

| Front | Back | Statut |
|---|---|---|
| POST `/admin/leaderboards/rebuild` | POST idem (admin.rs) | ✅ |
| POST `/admin/proof-hooks/sweep` | POST idem (admin_ops.rs) | ✅ |
| POST `/admin/ai/hidden-gems` | POST idem (ai_jobs.rs) | ✅ |
| POST `/admin/ai/churn` | POST idem (ai_jobs.rs) | ✅ |
| POST `/admin/digest/run-weekly` | POST idem (email_prefs.rs) | ⚠️ **hors admin_gate — voir BUGS_BACK P1** |
| POST `/admin/github/sync/{userId}` | POST idem (github.rs) | ⚠️ **hors admin_gate — voir BUGS_BACK P1** |
| GET `/api/admin/accounting/export` | GET idem (legal_well_known.rs) | ⚠️ **hors admin_gate — voir BUGS_BACK P1** |
| POST `/admin/guilds/{id}/dissolve` | POST idem (guild.rs) | ⚠️ hors admin_gate mais handler check capability |

## 16. Tenants

| Front | Back (tenants.rs) | Statut |
|---|---|---|
| GET `/admin/tenants` | GET idem | ✅ |
| POST `/admin/tenants` | POST idem | ✅ |
| GET `/admin/tenants/{id}` | GET idem | ✅ |
| PUT `/admin/tenants/{id}` (front = PATCH?) | back = PUT | ⚠️ à vérifier verbe HTTP côté front |
| Members / Cohorts (si UI présente) | à confirmer routes back | ⚠️ |

---

## Récapitulatif gaps

### Vrais bugs back (à envoyer à l'équipe backend)

1. **[P1] `/admin/digest/run-weekly`, `/admin/github/sync/{id}`, `/api/admin/accounting/export` hors `admin_gate`** → défense en profondeur incomplète. Voir `BUGS_BACK.md`.
2. **[P1] Seasons `/status` vs `/activate`** — mismatch de nom d'endpoint entre front et back.

### À valider en test

- Endpoints `/admin/projects/*` : lister les vraies routes back et confirmer verbe HTTP (front semble utiliser DELETE, back utilise POST `.../archive`)
- Endpoints tenants members/cohorts si l'UI les expose
- Endpoints seasons `/close` + tournaments `/status`

### Non consommés côté front (à décider : implémenter UI ou marquer volontaire)

- POST `/admin/challenges/{id}/variant` (IA génération variante)
- POST `/admin/fraud/deep-scan/{id}` (IA scan profond)

---

## Priorités de test Playwright

**Phase 1 — Smoke (existe déjà partiellement dans `e2e/`) :**
- Auth guard + redirect (auth-redirect.spec.ts ✅ existe)
- Login page render (auth-pages.spec.ts ✅ existe)
- Admin-back integration probe (admin-back-e2e.spec.ts ✅ existe)

**Phase 2 — Critical flows (à écrire) :**
1. Login + 2FA setup (nouveau compte admin)
2. Users : search, ban, unban, reset-2fa (avec reason ≥ 8 chars)
3. Reports : list, resolve, dismiss
4. Challenges : create draft, publish, archive
5. Enterprises : change type dry-run vs commit
6. KYC : approve / reject
7. Sponsored : decide + link
8. SSO sessions : revoke
9. Community : approve / reject
10. Fraud : scan deliverable, mark valid, revoke

**Phase 3 — Exhaustive (module par module, une fois Phase 2 verte) :**
- CRUD complet tenants/projects/skills/orientations/badge-rules
- Jobs d'ops (digest, sweep, GDPR export, hidden-gems, churn)
- Pagination + filtres sur toutes les listes
- Confirmation dialogs (reason validation ≥ 8 chars)
- Rate limits admin destructifs (10/min, 100/hr)
