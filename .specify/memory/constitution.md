<!--
Sync Impact Report
==================
Version change: [TEMPLATE] → 1.0.0 (initial ratification)
Modified principles: n/a (first real ratification; template placeholders replaced)
Added sections:
  - Core Principles I-V (RLS as sole privacy boundary, ingestion never drops events silently,
    DB triggers as sole source of truth for balances/spent, cross-source dedup by
    account+amount+date, handoff design system as visual source of truth)
  - Technology & Data Constraints
  - Development Workflow
  - Governance
Removed sections: none (template placeholders only)
Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ no change needed (Constitution Check gate is
    already generic, resolves against this file at plan time)
  - .specify/templates/spec-template.md — ✅ no change needed (no principle-specific mandatory
    sections introduced)
  - .specify/templates/tasks-template.md — ✅ no change needed (no new task category introduced;
    testing discipline is covered by Development Workflow, not a new gate)
  - .claude/skills/speckit-*.md — ✅ no CLAUDE-only or stale references found
Follow-up TODOs: none
-->

# Norte Constitution

## Core Principles

### I. RLS Is the Sole Privacy Boundary

Row-Level Security in Supabase is the ONLY mechanism that may enforce who sees what data
across household profiles. `visible_profile_ids()` (Admin sees all profiles, Pro sees only its
own) MUST gate every table that carries per-profile data at the database layer. Client-side
filtering (e.g. `.eq('profile_id', activeProfile.id)` in a query, or hiding rows in a React
component) is a UX convenience, NEVER a substitute for an RLS policy — a client-side-only filter
is a privacy bug, not a missing nicety. Any new table holding household data MUST ship its RLS
policy in the same migration that creates it.

**Rationale**: this is a multi-profile household app; a Pro profile reading another profile's
transactions is a privacy incident, not a cosmetic glitch. The codebase already treats RLS as
non-negotiable (migration 001+ policies, `upsert_norte_profile` SECURITY DEFINER pattern); this
principle makes that existing discipline an explicit gate for future work.

### II. Ingestion Never Drops Events Silently

The three ingestion pipelines (`wallet-ingest`, `notif-ingest`, `transfer-ingest`) MUST log every
payload that fails to parse, fails auth, or fails to insert into `ingest_failures` — with enough
of the raw payload to reconstruct the missing transaction by hand. A silent `return` on an
unparseable notification is a bug. New parsers or ingestion kinds MUST route unmatched/failed
payloads through `logFailure()` (or the equivalent for a new function), not through a bare early
return.

**Rationale**: these pipelines write real financial data without a human in the loop. History in
this repo (Colmena reembolsos missing from `SEARCH`, Santander "compra online" falling through
the regex) shows that a silently dropped event means a real transaction never appears anywhere —
not even as a diagnosable failure — and the account balance quietly drifts from reality.

### III. Account Balances and Category Spend Are Trigger-Owned

`accounts.balance` and `categories.spent` MUST be derived exclusively by database triggers
(the balance-sync trigger from migration 006, `sync_category_spent` from migration 008) that
fire on `transactions` insert/update/delete. Application code — Next.js pages, edge functions —
MUST NEVER write to these two columns directly or recompute them client-side as the source of
truth. The only application-level responsibility is inserting/updating/deleting rows in
`transactions`; the trigger does the rest.

**Rationale**: multiple independent writers touch `transactions` (the UI, three ingestion edge
functions, the commitments auto-linker). Centralizing the derived state in one trigger is what
lets all of them insert a row without knowing about each other and still keep balances correct
— duplicating that logic in even one call site reintroduces the class of bug this principle
exists to prevent (see the 2026-09-05 `wallet-ingest` duplicate-charge incident, which was a
dedup gap, not a balance-sync gap, precisely because the trigger is the only writer).

### IV. Cross-Source and Same-Source Ingestion Dedup Compares Account+Amount+Date, Never a Time Window

Any deduplication check across or within `wallet-ingest`, `notif-ingest`, and `transfer-ingest`
MUST compare on `(profile_id, account_id, amount, date)` — never on a `created_at` time window
(e.g. "last 5 minutes"). When the account isn't yet resolved, fall back to
`(profile_id, amount, date)`, accepting the documented tradeoff that two unrelated same-day,
same-amount, unmatched-account purchases could collide, over the alternative of missing a real
duplicate.

**Rationale**: Google Wallet and bank-app notifications for the *same* purchase can arrive
minutes to over an hour apart (documented cases: 78 minutes cross-source, ~15 minutes
same-source). A time-window dedup will eventually miss one of these and double-charge the user
— which is exactly what happened in production on 2026-09-05 (`wallet-ingest`'s own 5-minute
window missed a 15-minute-apart re-notification of the same MERCADOPAGO purchase). Any new
ingestion path MUST use the account+amount+date comparison from day one rather than starting
with a time window and hardening it later.

### V. The Handoff Design System Is the Visual Source of Truth

`_handoff/design_handoff_norte/` (styles.css, component references, screenshots) is the
authoritative visual spec. CSS custom properties MUST be read from `var(--token)`, scoped under
the `.app` wrapper the `ThemeProvider` renders — MUST NEVER hardcode hex colors in components.
Every page's content MUST sit inside a `<div className="scroll">` per the handoff's layout
contract. New UI MUST reuse handoff-defined classes (`.modal-scrim`/`.modal`, not invented
equivalents) rather than introducing parallel styling patterns for something the handoff already
defines.

**Rationale**: the handoff is a deliberately designed system (dark/light themes, 5 accent
colors, 3 densities) built once and meant to be ported faithfully, not reinterpreted per
component. Departures already on record (wrong modal class names, colors outside `.app`) caused
visible breakage — a modal rendering as an inline form instead of a popup, theme tokens not
applying at all.

## Technology & Data Constraints

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (Postgres +
  Auth + Edge Functions), deployed on Vercel. Edge functions run on Deno and are intentionally
  excluded from the app's `tsconfig.json` — they are a separate runtime, not part of the Next.js
  build.
- **Auth**: Google OAuth exclusively; no password auth. `middleware.ts` is deprecated in this
  Next.js version — session/auth middleware MUST live in `proxy.ts`.
- **Money & dates**: currency is CLP, formatted via `clp()`/`clpShort()` in `lib/utils.ts` — MUST
  NOT hand-roll `toLocaleString` calls elsewhere. Dates MUST be computed in `America/Santiago`
  time (`todayCL()`, `chileDate()`), never `new Date()` UTC math, to avoid off-by-one-day bugs at
  month/day boundaries.
- **Ingestion auth**: `wallet-ingest`, `notif-ingest`, and `transfer-ingest` authenticate via a
  shared secret header (`x-ingest-secret` against `ingest_config`), not Supabase JWTs — this is
  intentional (calls originate from MacroDroid/Gmail Apps Script, not a logged-in browser
  session) and MUST stay `verify_jwt: false` on those three functions.

## Development Workflow

- **Testing**: pure logic (formatting/date helpers, `computeSummary`, ingestion parsers and
  normalization helpers) MUST have Vitest coverage (`npm test`) and MUST stay importable without
  the Deno runtime — i.e., parsing/classification logic in edge functions belongs in a plain
  `.ts` module (`parsers.ts`/`parse.ts`/`helpers.ts`) that `index.ts` imports, not inlined where
  it would drag in `Deno.env`/`Deno.serve` at module load. UI behavior is verified manually
  against a real Supabase project (`specs/*/quickstart.md`) — this baseline does not require
  component/e2e test infrastructure.
- **New features**: start a fresh `/speckit-specify` rather than extending the
  `001-family-budget-baseline` spec, which documents the already-shipped baseline.
- **Schema changes**: every new table with per-profile data ships its RLS policy in the same
  migration (Principle I). Every migration is a new numbered file under `supabase/migrations/`;
  existing migrations are never edited after being applied to production.

## Governance

This constitution supersedes ad-hoc conventions when they conflict. Amendments are made by
editing this file directly, incrementing the version per semantic versioning (MAJOR: a principle
is removed or redefined incompatibly; MINOR: a principle or section is added or materially
expanded; PATCH: wording/clarification with no rule change), and updating the Sync Impact Report
comment at the top of this file.

Every `/speckit-plan` run MUST pass its Constitution Check against the principles above before
Phase 0 research begins, and re-check after Phase 1 design; a violation MUST be justified in the
plan's Complexity Tracking section or the plan MUST be revised to comply. Complexity (a new
abstraction layer, a parallel state-sync path, a departure from the handoff) MUST be justified
against a concrete need, not adopted speculatively (YAGNI).

`CLAUDE.md`/`AGENTS.md` carry day-to-day runtime development guidance (tooling quirks,
repo-specific gotchas) and MUST NOT contradict this document; where they overlap, this
constitution wins.

**Version**: 1.0.0 | **Ratified**: 2026-09-06 | **Last Amended**: 2026-09-06
