# Quickstart Validation: Gestión Financiera Familiar (Baseline Actual)

Manual validation guide to confirm the baseline behaves as documented in [spec.md](./spec.md). This is a UI/end-to-end walkthrough, not a substitute for the automated Vitest suite (`npm test`, see [research.md](./research.md)) — that suite covers `lib/utils.ts` and the ingestion parsers at the unit level; this document exercises the running app against a real Supabase project.

## Prerequisites

- Node.js + npm, and a configured `.env.local` (see `.env.local.example`) pointing at a Supabase project with the 11 migrations in `supabase/migrations/` applied.
- A Google OAuth-capable Supabase Auth setup for login.
- At least one row in `ingest_config` with a secret, if validating ingestion (User Story 5).

## Setup

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scenario 1 — Auth & profile isolation (User Story 1)

1. Log in with a Google account → confirm redirect from `/login` through `/auth/callback` lands on `/resumen` with a seeded set of default categories.
2. If Admin: open Ajustes → confirm the full household member list is visible, with role toggles.
3. Log in as a Pro profile → confirm Ajustes shows only "Mi perfil", no member list.

## Scenario 2 — "Disponible para gastar hoy" (User Story 2)

1. On Resumen, note the hero figure.
2. Add an expense via the quick-action modal in a `Variables` (non-fixed) category.
3. Reload Resumen → confirm the hero figure decreased consistently with `round((assigned_variable − spent_variable) / days_left)`.

## Scenario 3 — Budgeting (User Story 3)

1. Go to Presupuesto, edit a category's `assigned` amount.
2. Confirm the category's `disponible`, its group subtotal, and the "Listo para asignar" banner all update.
3. Push a category's `spent` above `assigned` (via a transaction) → confirm it renders in the danger (red) state.

## Scenario 4 — Transactions (User Story 4)

1. Add a manual expense/income/transfer via the modal; confirm validation rejects amount ≤ 0.
2. Confirm it appears in Movimientos grouped by date with a correct daily subtotal.
3. Use search/filter chips (type, account) → confirm the list narrows correctly.

## Scenario 5 — Ingestion (User Story 5)

```powershell
curl -X POST "$env:SUPABASE_FUNCTIONS_URL/wallet-ingest" `
  -H "x-ingest-secret: <secret from ingest_config>" `
  -H "Content-Type: application/json" `
  -d '{"title":"Test Merchant","text":"CLP 1.500 with Visa 5116","postTime":0}'
```

1. Confirm a `201`/`200`-equivalent success response and a new `transactions` row with `source: 'google_wallet'`.
2. Repeat with a wrong `x-ingest-secret` → confirm `401`.
3. Send a payload that fails to parse (garbage `text`) → confirm a row appears in `ingest_failures` and the request returns `400`.
4. Repeat against `notif-ingest` and `transfer-ingest` (see their contracts under `contracts/`) — confirm each has the same auth-reject and failure-logging behavior.

## Scenario 6 — Goals (User Story 6)

1. Create a goal with `target`, `monthly`.
2. Confirm the displayed "lista en N meses" equals `ceil((target - current) / monthly)`.

## Scenario 7 — Accounts / net worth (User Story 7)

1. With at least one account of each type, open Cuentas.
2. Confirm net worth = Σ(Cuenta) + Σ(Ahorro) − |Σ(Crédito, negative)|, and a negative credit balance renders in red.

## Scenario 8 — Habits (User Story 8)

1. With subscriptions of varying `used` levels, open Hábitos.
2. Confirm subscriptions marked `bajo` appear under "posibles fugas" with a non-zero potential savings amount.

## Scenario 9 — Monthly commitments (User Story 9)

1. Create a commitment with an `expected_amount`/`expected_account_id`.
2. Register (manually or via ingestion) a matching transaction → confirm status transitions to `pagado` and the commitment links to that transaction.
3. Let a commitment's due date pass with no match → confirm it transitions to `vencido`.

## Scenario 10 — Settings persistence (User Story 10)

1. Change theme/accent/density in Ajustes.
2. Reload → confirm the preference persisted for that profile.

---

## Validation Results (2026-09-06)

Run against the real Supabase project (`gfswrtyxgsxakkpgduda`), not a seeded/test project. Split
into what an agent can verify headlessly (build, edge functions, formulas against real data via
read-only SQL) versus what requires a human clicking through an authenticated browser session
(Google OAuth has no automatable credential here, and reading full personal financial detail
beyond what's needed to check a formula is intentionally gated).

**Verified automatically:**

- `npm run build` — compiles cleanly against `.env.local` pointed at the real project; `proxy.ts`
  (not `middleware.ts`) confirmed as the active convention (route shows as `ƒ Proxy (Middleware)`).
- Scenario 5, auth-reject: `wallet-ingest`, `notif-ingest`, `transfer-ingest` all return `401` for
  a wrong `x-ingest-secret`. ✅
- Scenario 5, success path: exercised live and for real on 2026-09-05 while fixing a production
  bug in `wallet-ingest`'s dedup (see git history) — stronger evidence than a synthetic curl call.
- Scenario 5, malformed-payload → `ingest_failures` + `400`: **not run** — requires the real
  ingest secret, which this session is deliberately blocked from reading. Run manually if desired:
  the one `curl` command in Scenario 5 above, with a garbage `text` field.
- Scenario 2 formula (`safeToday`): computed from real `category_budgets`/`categories` for the
  current month (2026-09) — `variableAssigned = $2.250.000`, `variableSpent = $396.923`,
  `daysLeft = 24` (2026-09-06) → expected hero figure `$77.200`. Not visually confirmed in the
  UI (requires login) — open Resumen and compare.
- Scenario 6 formula (goal projection `ceil((target−current)/monthly)`): both real goals compute
  to exactly **3 meses** (`(720000−360000)/120000` and `(480000−240000)/80000`). Not visually
  confirmed in the UI.
- Scenario 7 formula (net worth): real accounts → liquid `$1.357.816` + savings `$17.835.127` −
  used credit `$473.500` = **$18.719.443**. Not visually confirmed in the UI.
- Scenario 9 (commitment auto-link): real `monthly_commitments` for 2026-09 show multiple rows
  with `status = 'pagado'` and a non-null `paid_transaction_id` — the auto-link behavior is
  demonstrably working on production data, not just in theory. No `vencido` example currently
  exists in the data (nothing overdue yet this month), so that specific transition is unverified
  this run.

**Requires a manual click-through (not run this session):**

- Scenario 1 (Google OAuth login, profile isolation Admin vs Pro) — needs an interactive browser
  session with real Google credentials.
- Scenario 3 (budgeting UI states), Scenario 4 (transaction modal + filters), Scenario 8
  (habits/fugas rendering), Scenario 10 (settings persistence) — all UI-only, not meaningfully
  checkable without rendering the app.

**Conclusion**: no discrepancies found between the documented formulas and real production data.
The gaps above are about tooling access (no browser automation, no ingest secret in this
session), not about anything failing.
