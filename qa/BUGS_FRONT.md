# Bugs Front — skilluv-admin

> Bugs et manques identifiés côté admin front. Fixés au fur et à mesure dans ce repo.

## Template d'entrée

```
### [Pxx] Titre court
**Page/Module :** …
**Détecté par :** test Playwright / audit manuel / …
**Reproduction :**
1. …
2. …
**Attendu :** …
**Observé :** …
**Fix proposé :** …
**Statut :** open | in_progress | fixed (commit)
```

---

## Ouverts

_(aucun)_

---

## Corrigés

### [P0] Deep-link vers /users/[id] et 6 autres pages redirige à tort vers /auth/login
**Pages affectées :** `/users/[id]`, `/tenants`, `/tenants/[id]`, `/enterprise-kyc`, `/operations`, `/sponsored-challenges`, `/tournaments` — toutes celles qui ont ce bloc dans leur `+page.svelte` :
```svelte
onMount(() => {
  if (!auth.isAuthenticated) {
    void goto(`/auth/login?redirect=…`);
    return;
  }
  void load();
});
```

**Détecté par :** test Playwright `e2e/admin/reset-2fa.spec.ts` — le test navigue directement sur `/users/{id}` et est redirigé vers login alors que la session admin est valide.

**Reproduction :**
1. Se logger admin (session valide côté SSR — hooks.server.ts OK)
2. Aller directement sur `/users/{n'importe-quel-id}` (deep-link, refresh du navigateur, ouverture d'un onglet…)
3. Redirigé vers `/auth/login?redirect=/users/…`

**Cause :** race d'hydratation Svelte 5.
- `hooks.server.ts` remplit `locals.user` correctement
- `+layout.server.ts` propage `data.user`
- `+layout.svelte` hydrate le store `auth` via `$effect(() => auth.setUser(data.user))`
- **MAIS** `onMount` des pages enfants tourne AVANT que ce `$effect` ait migré `data.user` dans le store → `auth.user === null` → `auth.isAuthenticated === false` → redirect

Le check `onMount` est aussi présent dans `+layout.svelte` (l.76-80) — même bug, juste caché parce que la plupart des navigations viennent d'une autre page admin où le store était déjà hydraté.

**Impact prod :**
- Deep-links cassés (email de notif contenant `/users/{id}` → l'admin est déconnecté)
- Refresh du navigateur sur ces pages déloggue
- SEO/bookmarks cassés

**Fix appliqué :** supprimé le check `onMount(!auth.isAuthenticated)` dans les 7 pages enfants ET dans `+layout.svelte`. `hooks.server.ts` (SSR) reste la source de vérité — dead code retiré, plus de race d'hydratation. Vérifié par `e2e/admin/reset-2fa.spec.ts` (test UI qui navigue direct sur /users/{id} et attend le rendu).

**Statut :** fixed

### [P1] `/users` : le badge "Banni" et le bouton "Débannir" ne s'affichent jamais
**Page/Module :** `/users` — src/routes/users/+page.svelte
**Détecté par :** test Playwright `e2e/admin/user-ban-unban.spec.ts`
**Reproduction :**
1. Bannir un user via l'UI (dialog valide, POST succès)
2. Recharger la page, filtrer sur ce user
3. Le badge "Banni" n'apparaît pas, le bouton reste "Bannir"

**Attendu :** après ban en DB (colonne `is_banned=TRUE`), la ligne montre le badge "Banni" et le bouton "Débannir".

**Observé :** le front lit `user.banned` mais le backend renvoie `is_banned`. `user.banned` est toujours `undefined` → toujours interprété comme non-banni.

**Fix appliqué :** dans `src/routes/users/+page.svelte`, `UserRow.banned` renommé en `is_banned` et tous les usages mis à jour.

**Statut :** fixed

### [P1] `/users` : la mutation `banTarget.banned = true` ne re-rend pas le bloc bouton
**Page/Module :** `/users` — src/routes/users/+page.svelte
**Détecté par :** test Playwright `e2e/admin/user-ban-unban.spec.ts`
**Reproduction :**
1. Bannir un user via le dialog (dans une session déjà chargée)
2. Le badge "Banni" apparaît dans la ligne (via `{#if user.banned}` dans le bloc badge)
3. Mais le bloc du bouton reste "Bannir" — la mutation ne redéclenche pas ce bloc

**Attendu :** après `banTarget.banned = true`, la ligne complète (badge + bouton) reflète l'état.

**Observé :** seul le badge (`{#if user.banned}` inline dans le nom) se met à jour, pas le bloc bouton (`{#if user.banned}…{:else}…{/if}` en bas de la ligne). Probablement un souci de proxy Svelte 5 quand la clé `#each` n'existe pas — Svelte re-crée les items d'un `#each user of users` uniquement quand la référence de l'array change.

**Fix appliqué :** `confirmBan` et `unban` appellent maintenant `await loadUsers()` au lieu de muter la propriété — la liste reflète l'état DB de manière autoritaire et le bloc bouton se re-rend correctement.

**Statut :** fixed
