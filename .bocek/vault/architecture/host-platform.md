---
type: decision
features: [architecture, infrastructure]
related: ["[[idempotency-strategy]]", "[[wallet-mechanics]]", "[[catalog-versioning]]", "[[mvp-feature-sequence]]", "[[multi-tenant-rls-research]]"]
created: 2026-05-02
confidence: high
---

# MVP host platform: Supabase managed Postgres, DB-only (no Auth, Storage, Realtime, or Edge Functions)

Surfaces a previously-implicit load-bearing constraint. `[[idempotency-strategy]]` B7 commits to "Postgres-only storage" without naming the host; `[[wallet-mechanics]]` and `[[catalog-versioning]]` use `pg_partman` and assume PgBouncer-class transaction pooling without naming where they run. This entry vaults the host decision so future sessions don't re-discover it implicitly and so the cascade obligations on Supabase-specific extensions are explicit.

## Decision

**Host:** Supabase managed Postgres at MVP.

**Constraint:** **Database only.** The application does not consume:
- Supabase Auth (no `auth.uid()`, no `auth.jwt()` helpers, no JWT-based RLS context)
- Supabase Storage
- Supabase Realtime
- Supabase Edge Functions
- PostgREST auto-generated REST surface (the app uses standard Postgres connections via Drizzle/Prisma, not the PostgREST gateway)

The application interacts with Supabase exclusively through standard PostgreSQL wire protocol via Drizzle/Prisma. Supabase is treated as managed Postgres + Supavisor pooling + the standard Postgres extension set. Nothing more.

**Migration triggers (implicit, since cost of migration is near-zero in DB-only mode):**
- Supabase pricing crosses a competitor's at the projected workload (Render, Fly, Neon, Railway, RDS, Crunchy Cloud).
- A required extension is unavailable on Supabase but available elsewhere.
- A specific feature need (e.g. logical replication topology, write-master in a non-Supabase-supported region) demands a different host.

Because no Supabase-specific helpers are consumed, **migration is a connection-string change plus extension-parity verification** — not a rewrite.

## Reasoning

Cost. Supabase free tier (2 projects × 500MB Postgres + Supavisor pooling) supports MVP-stage traffic at $0 (production-cited: Supabase pricing page, multiple comparison reviews). Comparable managed Postgres on Railway, Render, Fly, Neon, and RDS all charge from project start. For a pre-Series-A solo team per `[[mvp-feature-sequence]]` 18-24-month runway constraint, $0/month for the MVP DB beats $25-50/month per project — the math compounds across multi-project / multi-environment isolation per `[[catalog-versioning]]` per-project environment isolation pattern.

DB-only is the lock-in mitigation. Supabase's strongest features (Auth/Storage/Realtime/Edge Functions) are also the highest-lock-in features. Consuming them would force a rewrite at migration time. By using Supabase as Postgres-only, the migration cost stays at "swap connection string + verify extensions" regardless of when migration happens. (inferred; medium confidence — extension-parity verification is the real risk, see cascade obligations below.)

This decision is host-portability symmetric to `[[idempotency-strategy]]` B7's storage-portability commitment. B7 says "Postgres-only" so the storage layer isn't tied to Redis-or-equivalent; this entry says "DB-only on Supabase" so the host layer isn't tied to Supabase-or-equivalent.

## Engineering substance applied

- **Lock-in tax:** explicitly minimized. The DB-only constraint is the mechanism. Every Supabase-native helper not used is a future migration tax not paid.
- **Cost:** Supabase free tier projected to cover MVP through ~Studio-tier first paying customer per `[[mvp-feature-sequence]]`. Switch to Supabase Pro ($25/mo/project) at first paying customer; competitive with Render/Railway/Fly Postgres pricing at that scale.
- **Operability:** Supabase ships logs, metrics, point-in-time-restore, automated backups on the paid tier. Free tier has 7-day backup retention; production-grade ops require Pro tier.
- **Extension surface:** Supabase ships `pgcrypto`, `pg_cron`, `uuid-ossp`, `pgsodium`, `pg_jsonschema` by default. **Cascade obligation: verify `pg_partman` availability before implementation phase** — `[[wallet-mechanics]]` and `[[catalog-versioning]]` depend on it. If unavailable, swap to manual cron + DDL or alternative extension.
- **Pooling:** Supabase ships Supavisor (their fork of PgBouncer) for transaction-mode pooling. **Cascade obligation: verify Supavisor in transaction mode supports `SET LOCAL`** — `[[multi-tenant-rls-research]]` depends on it for both RLS context-loading and de-id secret-loading. Behavior should be identical to PgBouncer transaction-mode but it's a fork, not vanilla.

## Production-grade gates

- **Idiomatic** — Supabase is a standard managed-Postgres choice for solo / small-team MVPs. DB-only consumption is also standard for teams who explicitly want host-portability. (production-cited: Supabase docs explicitly support direct Postgres connections; Drizzle and Prisma both ship Supabase-as-host examples that bypass PostgREST.)
- **Industry-standard** — managed Postgres for solo teams is the dominant pattern (Railway, Render, Fly, Neon, Supabase, Crunchy, RDS, Aurora). Supabase specifically is documented at scale for production by multiple OSS projects (cal.com, Bridgetown, dub.co publicly use it). DB-only mode is less commonly written about but mechanically identical to using any managed-Postgres host.
- **First-class** — uses standard Postgres + Supavisor. No fights with the Supabase platform because no Supabase-specific surface is consumed.

## Rejected alternatives

### Native Supabase (consume Auth + Storage + Realtime + Edge Functions)
**What:** Use `auth.uid()` and JWT-based RLS context, store user files in Supabase Storage, push realtime updates via Supabase Realtime, run server logic in Edge Functions.
**Wins when:** the team commits to Supabase as the long-term platform and wants to minimize total code (the platform replaces auth, file-handling, websocket, and serverless infrastructure).
**Why not here:** "Initially" implies migration later. Native consumption makes migration a rewrite (auth library swap, file backend swap, websocket layer swap). The migration cost compounds with every Supabase-specific helper used. DB-only keeps migration cost near-zero.

### Railway / Render / Fly / Neon managed Postgres at MVP
**What:** Pay $5-25/month/project from the start for a "neutral" managed Postgres host.
**Wins when:** Supabase free-tier limits (500MB DB, 2 GB egress, Supavisor connection cap) are likely to bind soon, OR when the team wants to avoid Supabase-the-vendor for unrelated reasons.
**Why not here:** Supabase free tier extends MVP runway by $25-100/month vs. these alternatives. The cap on free-tier DB size (500MB) is well above MVP traffic projections per `[[mvp-feature-sequence]]`. If a cap binds, switch to Pro ($25/mo/project) or migrate.

### Self-hosted Postgres (VPS / Hetzner / DigitalOcean droplet)
**What:** Run Postgres on a $5-10/month VPS.
**Wins when:** the team has Postgres ops experience and wants full control over extensions, replication topology, and version cadence.
**Why not here:** solo team pre-Series-A per `[[mvp-feature-sequence]]`. Time spent on Postgres ops (backups, point-in-time-restore, monitoring, security patches, version upgrades) is time not spent on product. Managed Postgres is the right tax for this team size.

### RDS / Aurora at MVP
**What:** AWS-managed Postgres from day one.
**Wins when:** the rest of the stack is on AWS and infra-team operates at AWS scale.
**Why not here:** RDS minimum cost (~$13/month for db.t3.micro) is $13/month more than Supabase free; Aurora is an order of magnitude more. AWS feature surface (IAM, VPC, Secrets Manager, KMS, CloudWatch) is overkill for a solo MVP. Migrate later if scale or compliance forces it.

## Failure modes

1. **Free-tier DB size cap binds at first paying customer.** Probability: low at MVP; medium at first Studio-tier paying customer. Cost: low (upgrade to Pro tier — same vendor, no migration). Mitigation: monitor DB size in Supabase dashboard weekly; budgeted upgrade trigger documented.

2. **Required extension unavailable on Supabase.** `pg_partman` is the named risk per cascade obligation #1 below. Probability: medium (haven't verified). Cost: medium (swap to manual partition cron + DDL is ~30 lines of script + a `pg_cron` job; alternative). Mitigation: verify before implementation phase; if unavailable, the wallet-mechanics + catalog-versioning entries need an §X swap to "manual partitions via `pg_cron`."

3. **Supavisor transaction-mode `SET LOCAL` behaves differently from PgBouncer.** Probability: low (Supavisor is a PgBouncer-protocol-compatible fork). Cost: high if it diverges (RLS context + de-id secret loading both break). Mitigation: integration test in `[[runbook-idempotency]]` setup that verifies `SET LOCAL` persists exactly through one transaction and is gone after.

4. **Supabase outage takes down BokChoy.** Probability: medium (Supabase has had documented multi-hour outages). Cost: high (BokChoy is unavailable). Mitigation: customer-facing SLA disclosure that uptime is a function of underlying-infrastructure uptime; the Pro tier 99.9% target SLA is the operational floor; standard managed-host disclosure pattern.

5. **Vendor risk: Supabase pricing changes or vendor pivots.** Probability: low; cost: low (DB-only constraint makes migration cheap). Mitigation: the DB-only constraint IS the mitigation. No Supabase-specific helper used = migration is a connection string change.

## Mitigations

- **DB size monitoring:** weekly check on Supabase dashboard during MVP; alert when >70% of tier cap.
- **Extension parity check:** verify `pg_partman` and any future extensions before they land in a vault entry; cascade obligation tracked below.
- **Supavisor `SET LOCAL` integration test:** part of `[[runbook-idempotency]]` setup verification.
- **Supabase incident-response runbook entry:** what BokChoy does when Supabase is down (status page link, customer comms template, fallback options if extended).
- **DB-only enforcement via code review:** any PR that imports `@supabase/supabase-js` Auth/Storage/Realtime/Functions modules requires explicit sign-off; preferred dependency surface is `pg`/`postgres-js`/`drizzle`/`prisma`.

## Idiom citations

- `[[idempotency-strategy]]` B7 — symmetric portability commitment at the storage layer.

## Revisit when

- **Supabase pricing changes** push the bill above competitors at projected workload.
- **Supabase free-tier DB cap binds** before first paying customer; upgrade to Pro is the immediate response (not a host migration).
- **A required extension is unavailable on Supabase** and architecturally non-substitutable.
- **A specific Supabase feature becomes architecturally compelling** — for example, if BokChoy ever needs server-pushed events to game clients, Supabase Realtime might become a candidate, at which point the DB-only constraint is reopened.
- **First paying customer is signed.** Reconfirm Pro-tier pricing math against alternatives.
- **Compliance regime requires regional residency or AWS-only deployment.** Triggers a host migration, the vendor is not the constraint.

## Cascade obligations

1. **Verify `pg_partman` availability on Supabase** (free + Pro tiers). If unavailable, `[[wallet-mechanics]]` and `[[catalog-versioning]]` partition-management subsections need a swap to `pg_cron` + manual DDL. Implementation-phase task.
2. **Verify Supavisor in transaction mode supports `SET LOCAL`** with the same semantics as vanilla PgBouncer. Required by `[[multi-tenant-rls-research]]` (RLS context-loading) and `[[deidentify-mechanism-research]]` (de-id secret-loading). Implementation-phase integration test.
3. **DB-only enforcement in code review.** No `@supabase/supabase-js` Auth/Storage/Realtime/Functions imports without explicit sign-off; document the policy in the project README and PR template.
4. **Customer-facing SLA disclosure.** Reference Supabase's underlying SLA as the floor; document on the BokChoy customer-facing status / SLA page.
