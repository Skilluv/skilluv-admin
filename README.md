# Skilluv Admin

> **Operator panel for the Skilluv platform.**

> 🇬🇧 English (this page) · 🇫🇷 [Version française](README.fr.md)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2-ff3e00.svg)](https://kit.svelte.dev/)

---

## What is Skilluv?

Skilluv is a community platform training the African OSS generation through real contributions to real open source projects. Every completed challenge produces a verifiable artifact — a merged pull request, a delivered Figma component, a submitted CVE report, a playable game build — exportable to recruiters.

Full product vision in the [backend repository](https://github.com/jeremie0342/skilluv-backend).

## What this repo contains

The **admin panel** used by Skilluv platform operators to manage:

- Challenges and challenge templates
- Users, moderation, reports
- Curated OSS projects (integration, review, health)
- Enterprise B2B accounts (subscriptions, credits, sponsored challenges, KYC)
- Seasons, tournaments, bounties
- Platform settings and feature flags

Built with **SvelteKit 2, Svelte 5, Tailwind CSS 4, TypeScript**.

See `ADMIN-CAPABILITIES.md` for the exhaustive feature list.

## Companion repositories

- [`skilluv-backend`](https://github.com/jeremie0342/skilluv-backend) — Rust + Axum API
- [`skilluv-frontend`](https://github.com/jeremie0342/skilluv-frontend) — SvelteKit web app for talents
- [`skilluv-ia`](https://github.com/jeremie0342/skilluv-ia) — Python AI microservice

## Quick start

**Prerequisites**: Node.js 22+, npm 10+, and a running Skilluv backend on port 3001.

```bash
git clone https://github.com/jeremie0342/skilluv-admin.git
cd skilluv-admin
npm install
cp .env.example .env
# edit .env with your backend URL and admin credentials

npm run dev
```

The admin panel opens on `http://localhost:5173`.

## Scripts

```bash
npm run dev          # dev server
npm run check        # svelte-check type verification
npm run build        # production build
npm run preview      # preview the production build
```

## Structure

- `src/routes/` — SvelteKit pages (dashboard, challenges, users, moderation, projects, etc.)
- `src/lib/` — shared components, stores, utilities
- `static/` — static assets
- `ADMIN-CAPABILITIES.md` — feature reference

## Stack summary

| Layer      | Technology                    |
|------------|-------------------------------|
| Framework  | SvelteKit 2                   |
| UI runtime | Svelte 5 (runes)              |
| Language   | TypeScript 5.x                |
| CSS        | Tailwind CSS 4                |
| Build      | Vite                          |
| Typography | Space Grotesk, JetBrains Mono |

## Contributing

Contributors welcome — Svelte devs, product-oriented UX for admin workflows, community moderators who want to shape the moderation UX. See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

For security disclosures, see [SECURITY.md](SECURITY.md).

## License

Distributed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

## Origin

Skilluv is built solo by [Jeremie Zitti](https://github.com/jeremie0342), a Beninese engineer. Public launch: **January 2027**.
