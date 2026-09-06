# Phase 0 Research: Gestión Financiera Familiar (Baseline Actual)

No `NEEDS CLARIFICATION` markers remain in the Technical Context — this is a reverse-engineered baseline, so "research" here documents the key technical decisions already made and visible in the codebase, for future plans to build on.

## Decision: Supabase (Postgres + Auth + RLS + Edge Functions) as the sole backend

- **Rationale**: Avoids running/operating a separate API server; RLS gives a database-enforced privacy boundary that matches the multi-profile household model (FR-003) without duplicating authorization logic in application code; Edge Functions provide lightweight authenticated webhook endpoints for the three ingestion sources.
- **Alternatives considered**: A custom Node/Express API with an ORM — rejected as unnecessary operational overhead for a single-household-scale app; Firebase — rejected, no evidence in codebase and Postgres/RLS better fits the relational budget/account/transaction model.

## Decision: RLS via `visible_profile_ids()` as the privacy enforcement layer, not just UI checks

- **Rationale**: SC-002 requires that a Pro profile can never read another profile's data even bypassing the UI. Enforcing this in Postgres policies means every query — including future direct API/RPC access — is safe by construction.
- **Alternatives considered**: Enforcing visibility only in `ProfileContext`/page-level queries — rejected as insufficient (see Edge Cases in spec.md: "bypass de UI").

## Decision: Webhook-based ingestion (Edge Functions) over a polling/sync-job model

- **Rationale**: Google Wallet notifications, bank-app notifications, and Gmail transfer emails are event-driven on the client side (MacroDroid, Apps Script) and push to Norte in near-real-time; polling would add latency and infrastructure (cron/queue) not needed given the existing client-side triggers.
- **Alternatives considered**: A scheduled Gmail API sync job — rejected in favor of the Apps Script push model already implemented, which needs no OAuth token management inside Norte itself.

## Decision: Deduplication logic in `notif-ingest` against Wallet-originated transactions

- **Rationale**: The same physical payment can surface both as a Google Wallet push and a bank-app notification; without dedup, FR-015 would be violated and users would see double-counted transactions.
- **Alternatives considered**: Deduplicating at read-time (query-level) instead of write-time — rejected as it would leave duplicate rows affecting balance triggers and `computeSummary()`.

## Decision: Next.js App Router with Server/Client Supabase clients split (`lib/supabase/{client,server}.ts`)

- **Rationale**: App Router's server components need a server-side Supabase client (cookies-based session) while interactive client components (modals, forms) need the browser client; `@supabase/ssr` is the supported pattern for this split.
- **Alternatives considered**: Client-only Supabase access (pure SPA) — rejected, loses server-rendering benefits and the existing `app/auth/callback/route.ts` server-side OAuth exchange.

## Open follow-ups (not blocking this baseline)

- ~~No automated test suite exists~~ — resolved by T049: Vitest, with unit tests for `computeSummary()`/`clp()` in `lib/utils.ts` and parser/normalization tests for the three ingestion functions (`npm test`).
- ~~The constitution is unratified~~ — resolved by T050: `.specify/memory/constitution.md` v1.0.0 (ratified 2026-09-06) now has 5 real MUST principles future plans gate on.
