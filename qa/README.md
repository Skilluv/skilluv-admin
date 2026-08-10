# QA — Skilluv Admin

Espace de suivi qualité pour le front admin + son intégration au backend Rust (staging).

## Fichiers

| Fichier | Rôle |
|--------|------|
| `AUDIT_ADMIN.md` | Inventaire des appels API du front (source : `src/lib/api/admin.ts` + pages) |
| `AUDIT_BACKEND.md` | Inventaire des routes admin exposées côté backend Rust |
| `AUDIT_MAPPING.md` | **Source de vérité** — croisement front↔back + gaps + endpoints à couvrir en test |
| `AUDIT_COVERAGE.md` | Suivi de couverture Playwright par page/module |
| `BUGS_FRONT.md` | Bugs identifiés côté admin front (fixés au fur et à mesure ici) |
| `BUGS_BACK.md` | Bugs côté backend — à transmettre à l'équipe back |
| `TODO_ADMIN.md` | Implémentations admin front à faire (nouveaux tests, expositions UI, améliorations) |
| `TODO_BACKEND.md` | Implémentations backend à demander (autre que bugs) |

## Convention sévérité

- **P0** : Bloquant (login/nav cassée, sécurité, corruption de données)
- **P1** : Fonctionnalité principale KO ou UX très dégradée
- **P2** : Petit bug / edge case / implémentation planifiée
- **P3** : Backlog long-terme (nice-to-have)

## Tracker : Linear (depuis 2026-08-05)

> **Tout nouveau ticket va dans Linear.** Trello est en lecture seule — il garde
> l'historique des bugs déjà traités jusqu'à la fin de la campagne QA en cours,
> puis sera archivé. Ne plus créer de card Trello.

- **Équipe :** Skilluv (`SKI`)
- **Projet QA/E2E :** [Hygiène pré-prod](https://linear.app/skilluv/project/hygiene-pre-prod-61fddb20f955)
  — les tickets QA rejoignent ce projet, qui contient déjà smoke tests, alertes
  ops et payment flows testés.
- **Préfixe :** `[QA-xx]` dans le titre pour repérer les tickets issus de cette campagne.

Les fichiers `.md` de ce dossier restent la source de vérité **descriptive**
(reproduction, cause, fix) ; Linear porte l'**état** et la priorisation.

## Avant de lancer les E2E

```
npm run test:e2e:preflight
```

Les specs P26 se `skip`ent sur un 404 — un endpoint absent est un état de
déploiement connu, pas une régression. Conséquence : **un run peut être vert
en n'ayant rien vérifié**. Le préflight répond à la seule question qui compte
avant de lancer — l'environnement est-il capable de valider quelque chose ?
Il vérifie la présence des routes P26, le niveau de migration de la base, et
n'écrit jamais rien.

## Workflow

1. Lancer les tests Playwright (`npm run test:e2e`)
2. Trier chaque échec : bug front → `BUGS_FRONT.md` ; bug back → `BUGS_BACK.md`
3. Créer le ticket correspondant dans Linear (projet Hygiène pré-prod, préfixe `[QA-xx]`)
4. Front : fixer directement + rebasculer le statut à `fixed` dans le .md + Done dans Linear
5. Back : le ticket Linear part côté équipe backend, ils fixent → statut `fixed` dans le .md + Done dans Linear
6. Mettre à jour `AUDIT_COVERAGE.md` au fur et à mesure

## Sync Trello (héritage — ne plus utiliser pour du nouveau)

**Board :** [Skilluv - QA & Bugs Admin](https://trello.com/b/DgCwxpV7/skilluv-qa-bugs-admin)

**Structure :**
- **Listes :** `Backlog` (open), `À faire`, `En cours` (in_progress), `Review`, `Fait` (fixed)
- **Labels team :** `team:backend` (bleu), `team:frontend` (vert), `team:admin` (orange)
- **Labels type :** `type:bug` (rouge), `type:implementation` (violet), `type:other` (noir)
- **Labels priorité :** `P0` (rouge), `P1` (orange), `P2` (bleu ciel)

**Setup local :**
```bash
cp qa/.trello.env.example qa/.trello.env
# éditer qa/.trello.env avec TRELLO_TOKEN (voir lien dans le fichier example)
python qa/push-to-trello.py
```

Le fichier `qa/.trello.env` est gitignored. Le script auto-load ce fichier s'il existe, sinon lit les variables d'env `TRELLO_KEY` / `TRELLO_TOKEN`.

**Idempotence :** rerun-safe. Match par titre exact (`[Pxx] Titre`). Les cards existantes sont MISES À JOUR (description + labels + liste) — donc changer le `**Statut :**` d'un .md et rerun déplace la card entre listes.

**Rétro-sync :** ne push que markdown → Trello, jamais l'inverse. Si le back édite une card Trello, il faut aussi éditer le .md pour rester source-of-truth.

## Environnement staging backend

- Backend Rust sur `:8000` (ou `:3001` en dev local via proxy vite)
- Base URL admin dev : `http://127.0.0.1:5174`
- Origin allowlist : `ADMIN_ORIGINS` env var (backend)
- Auth admin : JWT cookie `admin_access_token` + rôle `admin` + 2FA (TOTP ou WebAuthn) obligatoire
