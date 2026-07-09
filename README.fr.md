> 🇬🇧 [English version](README.md) · 🇫🇷 Version française (cette page)

---

# Skilluv Admin

Panneau d'administration de la plateforme Skilluv. Construit avec SvelteKit 2, Svelte 5, Tailwind CSS 4 et TypeScript.

Ce depot fournit l'interface web utilisee par les administrateurs de Skilluv pour gerer challenges, utilisateurs, moderation, projets curated, entreprises B2B, saisons et parametres de la plateforme.

---

## Prerequis

- Node.js 22 ou superieur
- npm 10 ou superieur
- Un backend Skilluv en cours d'execution (voir [skilluv-backend](https://github.com/jeremie0342/skilluv-backend))

---

## Installation

```bash
npm install
cp .env.example .env
# editer .env avec les valeurs adaptees a l'environnement
```

---

## Developpement

```bash
npm run dev
```

Ouvre http://localhost:5173. L'interface admin communique avec le backend via son URL configuree dans `.env`.

---

## Verification de type et build

```bash
npm run check       # svelte-check
npm run build       # build production
npm run preview     # preview du build
```

---

## Structure

- `src/routes/` — pages SvelteKit (dashboard, challenges, users, moderation, projects, etc.)
- `src/lib/` — composants, stores, utilitaires partages
- `static/` — assets statiques
- `ADMIN-CAPABILITIES.md` — liste exhaustive des fonctionnalites administratives

---

## Stack technique

| Composant   | Technologie                    |
|-------------|--------------------------------|
| Framework   | SvelteKit 2                    |
| UI          | Svelte 5 (runes)               |
| Langage     | TypeScript 5.x                 |
| CSS         | Tailwind CSS 4                 |
| Build       | Vite                           |
| Polices     | Space Grotesk, JetBrains Mono  |

---

## Licence

Ce projet est distribue sous licence [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les modalites de contribution.
Voir [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) pour les regles de la communaute.

## Securite

Pour signaler une vulnerabilite, voir [SECURITY.md](SECURITY.md).
