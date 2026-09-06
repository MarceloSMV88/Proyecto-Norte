# Tasks: Gestión Financiera Familiar (Baseline Actual)

**Input**: Design documents from `/specs/001-family-budget-baseline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested — no automated test framework exists in the current baseline (see research.md). No test tasks are generated; a task to introduce one is tracked in Polish.

**Organization**: This tasks.md documents the *already-implemented* baseline (checked `[x]`) so `/speckit-converge` has a source of intent to check the codebase against. A small number of genuinely outstanding items are left unchecked (`[ ]`) in the Polish phase.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Initialize Next.js 16 App Router project with TypeScript and Tailwind CSS 4 (`package.json`, `next.config.ts`, `postcss.config.mjs`)
- [x] T002 [P] Configure Supabase browser/server clients in `lib/supabase/client.ts` and `lib/supabase/server.ts`
- [x] T003 [P] Define domain types (Profile, Category, Account, Goal, Transaction, Subscription, Upcoming, MonthlyCommitment, Summary) in `lib/types.ts`

**Checkpoint**: Project scaffolding and typed domain model in place

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story is usable without this phase

- [x] T004 Create Supabase schema migrations for `profiles, categories, accounts, goals, transactions, subscriptions, upcoming` in `supabase/migrations/001_schema.sql`
- [x] T005 [P] Implement `visible_profile_ids()` and RLS policies enforcing Admin-sees-all / Pro-sees-own across all tables in `supabase/migrations/`
- [x] T006 [P] Implement Google OAuth login and callback in `app/login/page.tsx` and `app/auth/callback/route.ts`
- [x] T007 Implement `AuthContext` (session, `isAdmin`/`isSuperAdmin`/`canRead`/`canWrite`) in `contexts/AuthContext.tsx`
- [x] T008 Implement `ProfileContext` (`activeProfile`/`profiles`/`setActiveProfile`) in `contexts/ProfileContext.tsx`
- [x] T009 [P] Implement CLP formatting, Chile-timezone date helpers, and `computeSummary()` in `lib/utils.ts`
- [x] T010 [P] Implement `ThemeContext` (theme/accent/density) in `contexts/ThemeContext.tsx`
- [x] T011 Auto-seed default categories on first login via `upsert_norte_profile` RPC (called from `AuthContext.tsx`)

**Checkpoint**: Auth, profile isolation, and shared data helpers ready — user stories can build on this

---

## Phase 3: User Story 1 - Acceso e identidad multi-perfil (Priority: P1)

**Goal**: Authenticate via Google, isolate data per profile, and let Admin manage household members

**Independent Test**: Log in as a new Google account, confirm a private seeded profile is created; confirm Pro sees only itself in Ajustes while Admin sees the full household list

- [x] T012 [US1] Build Admin-only "Perfiles del hogar" panel (list, role toggle, remove) in `app/(app)/ajustes/page.tsx`
- [x] T013 [US1] Build Pro-only "Mi perfil" view (no visibility into other profiles) in `app/(app)/ajustes/page.tsx`
- [x] T014 [US1] Enforce "Admin cannot demote or remove self" both in UI (`app/(app)/ajustes/page.tsx`) and via RLS (`supabase/migrations/`)
- [x] T015 [US1] Build "Agregar integrante" modal (name, role, color, income, live avatar preview) in `components/`

**Checkpoint**: User Story 1 independently functional

---

## Phase 4: User Story 2 - Panel de resumen "Disponible para gastar hoy" (Priority: P1) 🎯 MVP

**Goal**: Show the daily safe-to-spend figure and a full month summary on load

**Independent Test**: Open Resumen with seeded data and confirm the hero figure and stat cards match the real transactions/budget of the active profile

- [x] T016 [US2] Implement month summary calculation (`safeToday`, income/assigned/spent/available/savings/daysLeft) in `lib/utils.ts` (`computeSummary`)
- [x] T017 [US2] Build hero "Disponible para gastar hoy" with pace bar and quick-action buttons (gasto/ingreso/mover/meta) in `app/(app)/resumen/page.tsx`
- [x] T018 [P] [US2] Build 4 stat cards with sparklines (saldo, gastos, ahorro, libre por asignar) in `app/(app)/resumen/page.tsx`
- [x] T019 [P] [US2] Build "Flujo del mes" chart (este mes / 6 meses) in `app/(app)/resumen/page.tsx`
- [x] T020 [US2] Build budget-by-category section with drill-down (expand movimientos, exceeded alert) in `app/(app)/resumen/page.tsx`
- [x] T021 [P] [US2] Build category donut, upcoming, and goals sidebar widgets in `app/(app)/resumen/page.tsx`

**Checkpoint**: MVP (US1 + US2) fully functional — a user can log in and see their real daily budget status

---

## Phase 5: User Story 3 - Presupuesto por sobres (Priority: P2)

**Goal**: Assign and track monthly budget per category, grouped by Fijos/Variables/Ahorro

**Independent Test**: Edit a category's assigned amount and confirm disponible, group subtotal, and "Listo para asignar" recalculate

- [x] T022 [US3] Build "Listo para asignar" banner and 4 mini-stats in `app/(app)/presupuesto/page.tsx`
- [x] T023 [US3] Build Fijos/Variables/Ahorro groups with inline `assigned` editing and subtotals in `app/(app)/presupuesto/page.tsx`
- [x] T024 [US3] Build CategoryModal (create/edit category, icon/color/group/fixed) in `components/`
- [x] T025 [US3] Implement visual state (ok/warn ~88%/danger) by spent-vs-assigned in `app/(app)/presupuesto/page.tsx`

**Checkpoint**: US1-US3 independently functional

---

## Phase 6: User Story 4 - Registro y consulta de movimientos (Priority: P2)

**Goal**: Manually record and browse transactions

**Independent Test**: Create an expense via modal, confirm it appears grouped by date with correct subtotal and updates the linked account balance

- [x] T026 [US4] Build transaction list grouped by date with daily subtotal in `app/(app)/movimientos/page.tsx`
- [x] T027 [US4] Build search box and filter chips (Todos/Gastos/Ingresos/Recurrentes) plus account selector in `app/(app)/movimientos/page.tsx`
- [x] T028 [US4] Build TransactionModal with amount > 0 validation in `components/`
- [x] T029 [US4] Build DatePicker component used by transaction/goal modals in `components/`
- [x] T030 [US4] Implement DB trigger to sync account `balance` on transaction insert/update in `supabase/migrations/006_*.sql`

**Checkpoint**: US1-US4 independently functional

---

## Phase 7: User Story 5 - Ingesta automática de movimientos (Priority: P2)

**Goal**: Auto-create transactions from Google Wallet, bank-app notifications, and Gmail transfer emails

**Independent Test**: POST a valid payload to `wallet-ingest` with the correct secret and confirm a transaction is created; repeat with an invalid secret and confirm rejection

- [x] T031 [US5] Implement `wallet-ingest` edge function (parse, dedup, category-rule match, cross-source dedup) per `contracts/wallet-ingest.md` in `supabase/functions/wallet-ingest/index.ts`
- [x] T032 [US5] Implement `notif-ingest` edge function (multi-bank/multi-kind parsers, cross-source dedup) per `contracts/notif-ingest.md` in `supabase/functions/notif-ingest/index.ts`
- [x] T033 [US5] Implement `transfer-ingest` edge function (account/RUT/name classification, internal-transfer split, commitment auto-link) per `contracts/transfer-ingest.md` in `supabase/functions/transfer-ingest/index.ts`
- [x] T034 [US5] Implement Gmail Apps Script trigger feeding `transfer-ingest` in `scripts/gmail-transfer-ingest.gs`
- [x] T035 [US5] Implement shared `ingest_config` secret auth and `ingest_failures` logging across all three ingest functions in `supabase/migrations/`

**Checkpoint**: US1-US5 independently functional

---

## Phase 8: User Story 6 - Metas de ahorro (Priority: P3)

**Goal**: Track savings goals with progress and completion projection

**Independent Test**: Create a goal with target/monthly contribution and confirm "lista en N meses" matches `ceil((target-current)/monthly)`

- [x] T036 [US6] Build goals grid with progress ring and month projection in `app/(app)/metas/page.tsx`
- [x] T037 [US6] Implement manual contribution action (increments `current`) in `app/(app)/metas/page.tsx`

**Checkpoint**: US1-US6 independently functional

---

## Phase 9: User Story 7 - Cuentas y patrimonio neto (Priority: P3)

**Goal**: Show all accounts grouped by type with net worth

**Independent Test**: With accounts of all 3 types, confirm net worth equals liquid+savings minus utilized credit

- [x] T038 [US7] Build accounts grouped by type (Cuenta/Ahorro/Crédito) with net-worth hero in `app/(app)/cuentas/page.tsx`
- [x] T039 [US7] Build AccountModal (create/edit) in `components/`
- [x] T040 [US7] Implement account image upload per `contracts/upload-account-image.md` in `supabase/functions/upload-account-image/index.ts` *(gap: not covered by an explicit FR — see T051)*

**Checkpoint**: US1-US7 independently functional

---

## Phase 10: User Story 8 - Hábitos e insights de gasto (Priority: P3)

**Goal**: Surface spending patterns, subscription leaks, and month-end projection

**Independent Test**: With varied subscription usage levels, confirm "bajo"-usage subscriptions appear as fugas with a savings estimate

- [x] T041 [US8] Build top-categories and monthly-evolution charts in `app/(app)/habitos/page.tsx`
- [x] T042 [US8] Implement subscription usage tracking and "fugas" (leaks) detection in `app/(app)/habitos/page.tsx`
- [x] T043 [US8] Implement end-of-month spend projection from daily average in `app/(app)/habitos/page.tsx`

**Checkpoint**: US1-US8 independently functional

---

## Phase 11: User Story 9 - Compromisos mensuales (Priority: P3)

**Goal**: Track recurring expected payments and auto-detect when they're paid

**Independent Test**: Register a commitment, then post a matching transaction and confirm its status moves to "pagado" and links to that transaction

- [x] T044 [US9] Build monthly commitments CRUD and status lifecycle UI in `app/(app)/compromisos/page.tsx`
- [x] T045 [US9] Implement `linkCommitment` auto-match (single unambiguous candidate by profile/month/category/hint) in `supabase/functions/transfer-ingest/index.ts`
- [x] T046 [US9] Create `monthly_commitments` schema with status enum (`pendiente/detectado/pagado/vencido/omitido/sin_gasto`) in `supabase/migrations/`

**Checkpoint**: US1-US9 independently functional

---

## Phase 12: User Story 10 - Personalización y administración de cuenta (Priority: P3)

**Goal**: Persist appearance and account preferences per profile

**Independent Test**: Change theme/accent/density, reload, and confirm the preference persisted

- [x] T047 [US10] Build appearance controls (theme, accent swatches, density) with persistence in `app/(app)/ajustes/page.tsx` and `contexts/ThemeContext.tsx`
- [x] T048 [US10] Build account/data preferences (currency, budget alerts, subscription detection, email summary toggles) in `app/(app)/ajustes/page.tsx`

**Checkpoint**: All 10 user stories independently functional — baseline fully documented

---

## Phase 13: Polish & Cross-Cutting Concerns

- [ ] T049 Introduce an automated test suite (unit tests for `computeSummary`/`clp` in `lib/utils.ts`; integration tests for the three ingestion parsers) — no test framework is currently configured
- [ ] T050 Ratify `.specify/memory/constitution.md` with real MUST principles (e.g., "RLS is the sole privacy boundary", "ingestion never drops events silently") so future plans have a real Constitution Check gate
- [ ] T051 Add an explicit functional requirement for account-image upload (`upload-account-image`) to `specs/001-family-budget-baseline/spec.md`, User Story 7
- [ ] T052 Run `quickstart.md` end-to-end against a real Supabase project and record results

---

## Phase 14: Convergence

- [x] T053 Reconcile the Admin permission model per FR-004 (contradicts): resolved by product decision — `spec.md` FR-004/FR-005 updated to document the SuperAdmin-only tier as intentional (single-admin household today); UI/RLS left unchanged. Revisit when a second legitimate Admin exists.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)**: blocks all user stories
- **User Stories (Phase 3-12)**: all depend on Foundational; US1 and US2 are P1 (MVP); the rest are independently addable in any order
- **Polish (Phase 13)**: depends on all user stories being complete (they are, in this baseline)

### User Story Dependencies

- **US1 (P1)**: no dependency on other stories — establishes the profile/role model everything else relies on for data isolation
- **US2 (P1)**: reads Categories/Accounts/Goals/Transactions but is independently testable once Foundational + US1 exist
- **US3-US10**: each independently testable per its own Independent Test above; several share data with US2's Resumen widgets (goals, categories) without being blocked by it

### Parallel Opportunities

- T002/T003 (Setup) in parallel
- T005/T006/T009/T010 (Foundational) in parallel
- T018/T019/T021 (US2 chart widgets) in parallel
- T031/T032/T033 (US5's three ingest functions) in parallel — separate files, no shared state beyond the DB

---

## Implementation Strategy

This tasks.md reflects a **completed baseline**, not a build order to follow. For future work:

1. Treat Phase 13 (Polish) as the actual next-actionable backlog.
2. Run `/speckit-converge` to detect any additional gap between this documented baseline and the real code beyond what's already flagged (T040/T051 note the account-image gap).
3. For genuinely new features, start a fresh `/speckit-specify` rather than extending this baseline feature.
