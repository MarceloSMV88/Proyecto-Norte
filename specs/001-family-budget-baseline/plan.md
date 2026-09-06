# Implementation Plan: Gestión Financiera Familiar (Baseline Actual)

**Branch**: `001-family-budget-baseline` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-family-budget-baseline/spec.md`

**Note**: This plan documents the architecture of the *already-implemented* baseline so that `/speckit-converge` has a design reference to check code against, alongside the spec. It is descriptive (reverse-engineered from the current codebase), not prescriptive of new work.

## Summary

Norte is a Next.js (App Router) web app for family budgeting (Spanish UI, CLP), implementing envelope budgeting, multi-profile household access with Admin/Pro roles, and automatic transaction ingestion from Google Wallet, bank-app notifications, and Gmail transfer emails. The technical approach is a server-rendered Next.js frontend talking directly to Supabase (Postgres + Auth + RLS + Edge Functions), with no separate backend service.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Node.js (Next.js 16.2.9 App Router runtime)

**Primary Dependencies**: `next`, `react`/`react-dom`, `@supabase/supabase-js`, `@supabase/ssr` (browser + server Supabase clients), `lucide-react` (icons), Tailwind CSS 4 (`@tailwindcss/postcss`)

**Storage**: Supabase Postgres — 11 migrations defining `profiles, categories, accounts, goals, transactions, subscriptions, upcoming, monthly_commitments, ingest_failures, ingest_config`, with RLS policies gated by a `visible_profile_ids()` function implementing the Admin/Pro visibility rule

**Testing**: None configured in the current baseline (no test runner/framework present in `package.json`). Out of scope for this plan to introduce — captured here only as an accurate statement of current state, not a requirement

**Target Platform**: Responsive web (desktop + mobile browser), deployed as a Next.js app (Vercel-style deployment implied by `.vercel` in `.gitignore`); Supabase Edge Functions (Deno runtime) for ingestion webhooks

**Project Type**: Web application — single Next.js project with an integrated Supabase backend (no separate `backend/`/`frontend/` split)

**Performance Goals**: Not formally specified in the baseline; dashboard and list views are expected to load interactively (sub-second perceived render) for a single household's data volume

**Constraints**: RLS must be the enforcement boundary for cross-profile privacy (not just UI-level checks, per FR-003/SC-002); ingestion endpoints must authenticate via shared secret header and must never silently drop unparseable events (FR-014, FR-016)

**Scale/Scope**: Single-household multi-profile scale (not multi-tenant SaaS); 8 screens/routes, 4 edge functions, 8 core data entities plus `ingest_failures`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is an unfilled template (all placeholder tokens, no ratified principles). Per spec-kit convention, constitution checks are skipped gracefully — there are no MUST principles to gate against yet. Recommendation: run `/speckit-constitution` separately to ratify real principles for Norte (e.g., "RLS is the sole privacy boundary", "ingestion never drops events silently") so future plans have a real gate.

## Project Structure

### Documentation (this feature)

```text
specs/001-family-budget-baseline/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/
├── login/page.tsx                  # Google OAuth login
├── auth/callback/route.ts          # OAuth callback handler
└── (app)/                          # Authenticated route group
    ├── resumen/page.tsx            # Dashboard / "Disponible para gastar hoy"
    ├── presupuesto/page.tsx        # Envelope budgeting
    ├── movimientos/page.tsx        # Transactions list/search/filter
    ├── metas/page.tsx              # Savings goals
    ├── cuentas/page.tsx            # Accounts / net worth
    ├── habitos/page.tsx            # Spending habits/insights
    ├── compromisos/page.tsx        # Monthly recurring commitments
    └── ajustes/page.tsx            # Settings / profile admin

components/                         # Modals, charts, layout, UI primitives
contexts/
├── AuthContext.tsx                 # Supabase auth session, role helpers
├── ProfileContext.tsx              # activeProfile / profiles / setActiveProfile
└── ThemeContext.tsx                # theme / accent / density

lib/
├── types.ts                       # Domain model (Profile, Category, Account, ...)
├── utils.ts                       # clp()/clpShort(), CL date helpers, computeSummary()
├── icons.ts, useEscapeClose.ts
└── supabase/{client,server}.ts    # Supabase browser/server clients

supabase/
├── migrations/001_schema.sql … 011_*.sql   # Schema, RLS policies, triggers
└── functions/
    ├── wallet-ingest/index.ts      # Google Wallet push (via MacroDroid)
    ├── notif-ingest/index.ts       # Bank-app notification parser
    ├── transfer-ingest/index.ts    # Gmail transfer-email parser
    └── upload-account-image/index.ts

scripts/gmail-transfer-ingest.gs    # Apps Script trigger feeding transfer-ingest
```

**Structure Decision**: Single Next.js application with an integrated Supabase backend (Option 2 "web application" collapsed into one repo, since Supabase Edge Functions + RLS take the place of a separate `backend/` service). No `tests/` directory exists in the current baseline (see Technical Context — Testing).

## Complexity Tracking

No Constitution Check violations to justify — the constitution is an unfilled template (see Constitution Check above), so no gates apply yet.
