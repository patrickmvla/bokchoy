# BokChoy

Game economy backend platform — wallets, catalog, loot RNG, idempotent HTTP, multi-tenant Postgres. Pre-MVP. Solo-dev.

Architecture decisions live in `.bocek/vault/`. Don't grep blog posts — read the vault.

## Status

Phase 0 bootstrap complete: workspace, local Postgres, `@bokchoy/db` (Drizzle + postgres-js + `withTenant`), Biome lint/format, GitHub Actions CI.

Next: first feature contract per `[[mvp-feature-sequence]]` (the 7-month linear plan in `.bocek/vault/mvp/`). No HTTP surfaces, schemas, or auth wired yet.

## Stack

- TypeScript strict + Bun 1.3+ runtime (Node.js 22 LTS retained as documented fallback)
- Hono (HTTP framework, locked but no routes yet)
- Drizzle ORM 0.45.2 + drizzle-kit 0.31.10 + postgres-js ^3.4
- Better Auth (planned: organization + anonymous plugins; not wired yet)
- Postgres 17 via `supabase/postgres:17.6.1.113` (Supabase managed in prod)
- Biome for lint + format
- Bun workspaces + Turborepo monorepo
- GitHub Actions CI

## Prerequisites

- Bun >= 1.3.3
- Docker Desktop (or Docker Engine)
- **Host port 5433 free.** We deliberately bind 5433 instead of 5432; see `.bocek/vault/architecture/local-docker.md` F-Local-7 (host-port-collision class — many Linux/WSL2 hosts have a stock postgres on 5432).

## Getting started

```bash
# Install workspace deps
bun install

# Start local Postgres (port 5433) + Mailpit (1025 SMTP, 8025 web UI)
docker compose up -d

# Configure env vars
cp .env.example .env
# DATABASE_URL is the runtime connection (bokchoy_app, RLS applies)
# DATABASE_MIGRATION_URL is the migrations connection (postgres, BYPASSRLS for DDL)
```

First `docker compose up -d` runs `compose/postgres-init/00-roles.sql` and `01-extensions.sql` to create the `postgres` and `bokchoy_app` roles and install `pg_partman` + `pgcrypto`. Subsequent runs reuse the named volume `postgres-data`. To reset to a clean cluster: `docker compose down -v && docker compose up -d`.

## Connection conventions

Two roles, two URLs — see `.bocek/vault/architecture/local-docker.md` Amendment §6:

- **Backend runtime** connects as `bokchoy_app` — non-superuser, no BYPASSRLS. RLS applies. URL: `postgresql://bokchoy_app:postgres@localhost:5433/postgres`.
- **drizzle-kit migrations** connect as `postgres` — has BYPASSRLS for DDL during table creation. Matches Supabase managed prod. URL: `postgresql://postgres:postgres@localhost:5433/postgres`.
- `supabase_admin` is the cluster superuser, reserved for emergency operations only.
- `bokchoy_app` cannot connect via Unix socket (peer auth maps OS user → DB user; no `bokchoy_app` OS user inside the container). TCP only.

## Repo layout

```
apps/
  backend/          # Hono server (per [[backend-service-shape]])
  cockpit/          # Next.js 16 cockpit (per [[frontend-stack]])
packages/
  db/               # Drizzle schema + client factory + withTenant
  shared-types/     # Cross-app TS types
  auth-config/      # Better Auth config
compose/
  postgres-init/    # First-init SQL: 00-roles.sql + 01-extensions.sql
scripts/
  check-prepare-false.ts  # Cascade-10 enforcement (postgres-js prepare:false)
.bocek/
  vault/            # 50 architectural decisions + research entries
.github/workflows/
  ci.yml            # bun install + lint:check + typecheck + cascade-10
biome.json
compose.yml
turbo.json
```

## Common commands

```bash
bun install                                 # Install
bun run lint:check                          # Biome CI mode (no autofix)
bun run lint:fix                            # Biome + autofix
bun run format                              # Biome format --write
bun run typecheck                           # tsc --noEmit across workspaces (Turbo)
bun run check:prepare-false                 # Cascade-10 scripted check

bun run --filter @bokchoy/db db:generate    # Generate SQL migration from schema diff
bun run --filter @bokchoy/db db:migrate     # Apply migrations
bun run --filter @bokchoy/db db:studio      # Drizzle Studio

docker compose up -d                        # Start local Postgres + Mailpit
docker compose down                         # Stop, keep volume
docker compose down -v                      # Stop, drop volume (re-fires init scripts)
```

## How decisions are made

This project uses [Bocek](https://github.com/patrickmvla/bocek) — three reasoning modes via slash commands:

- `/design` — adversarial design partner; vaults decisions
- `/research` — evidence-only investigation; vaults findings (production-cited, docs-cited, contradiction probes)
- `/implementation` — contract executor; writes code constrained by the vault

Every architectural choice traces to a vault entry. When in doubt, read `.bocek/vault/index.md` first — it's the map.

## Open threads (not blocking next sub-unit)

- **Cascade-10 GritQL plugin verification.** Current cascade-10 enforcement uses a Bash-style scripted check (`scripts/check-prepare-false.ts`). Biome's GritQL plugin path is the more elegant alternative pending verification — see `.bocek/vault/_shared/tooling.md` F-Tooling-1.
- **F1 type-level discipline.** `[[backend-stack]]` F1 mitigation calls for branded tx types where RLS-protected table accessors require a `TenantTx` from `withTenant` — triggered when the first RLS-protected feature schema lands.

## License

Not yet selected.
