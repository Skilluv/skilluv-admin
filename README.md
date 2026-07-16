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

The **admin panel** used by Skilluv platform operators. Currently implemented sections:

- **Auth** — mandatory admin 2FA (TOTP + WebAuthn), single-use backup codes, admin-to-admin 2FA reset
- **Users** — search, profile, ban/unban, capability management (14 functional roles), 2FA recovery
- **Fraud dashboard** — plagiarism queue, multi-account detection, LLM re-evaluation
- **Challenges** — creation, edit, publish, archive
- **Community moderation** — reports, review queue
- **Enterprise B2B** — KYC, sponsored challenges pipeline
- **Multi-tenant** — tenants management
- **SSO** — session tracking and revocation
- **Tournaments** — creation, scoring, conclusion
- **Audit log** — append-only, 7-year retention
- **Operations** — platform-wide one-shot triggers (rebuild leaderboards, digest, GitHub sync, guild dissolution, war conclusion, accounting export)

Built with **SvelteKit 2, Svelte 5 (runes), Tailwind CSS 4, TypeScript strict**, and **48 wired backend endpoints** across 14 domains. Full inventory in [`ADMIN-CAPABILITIES.md`](ADMIN-CAPABILITIES.md).

Roadmap for the remaining MVP phases (M3 orientations catalog + M4 enterprise type manager + M5 user enrichment) is tracked in [`docs/MVP.md`](docs/MVP.md) and the backend contract in [`docs/BACKEND-TODO.md`](docs/BACKEND-TODO.md).

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
npm run dev             # dev server on :5174
npm run check           # svelte-check type verification
npm run build           # production build (adapter-node)
npm run preview         # preview the production build

npm run test            # Vitest unit + component tests
npm run test:watch      # watch mode
npm run test:coverage   # coverage report

npm run test:e2e        # Playwright smoke tests
npm run test:e2e:ui     # interactive Playwright UI
```

## Structure

- `src/routes/` — SvelteKit pages (dashboard, users, fraud, challenges, moderation, etc.)
- `src/lib/components/ui/` — design-system primitives (Button, Modal, Input, Table, ConfirmDangerousDialog, CapabilityBadge, …)
- `src/lib/components/admin/` — admin-specific composites (UserCapabilitiesSection, …)
- `src/lib/api/` — typed API clients (`auth.ts`, `admin.ts`, shared `client.ts` with SkilluError + CSRF + refresh)
- `src/lib/i18n/` — EN / FR / AR translations (typed)
- `src/lib/stores/` — Svelte 5 rune stores (auth, toast, theme)
- `e2e/` — Playwright smoke tests
- `ADMIN-CAPABILITIES.md` — capability + endpoint reference
- `docs/MVP.md` — full MVP plan
- `docs/BACKEND-TODO.md` — backend endpoints still required to close the MVP

## Docker

Multi-stage `Dockerfile` (Node 22 alpine, non-root `node` user, HEALTHCHECK). Compose file mirrors the dev port so URLs stay familiar.

```bash
# Standalone build + run (backend expected at BACKEND_INTERNAL_URL)
docker compose -f docker-compose.admin.yml up --build

# Or manually
docker build -t skilluv-admin:local .
docker run --rm -p 5174:3000 -e ORIGIN=http://localhost:5174 skilluv-admin:local
```

## Continuous integration

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR:

1. `svelte-check` type verification
2. Vitest unit and component tests
3. Production build
4. Playwright smoke tests against the built server (artifacts uploaded on failure)

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
