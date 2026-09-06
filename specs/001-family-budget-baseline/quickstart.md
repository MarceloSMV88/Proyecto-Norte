# Quickstart Validation: Gestión Financiera Familiar (Baseline Actual)

Manual validation guide to confirm the baseline behaves as documented in [spec.md](./spec.md). Not an automated test suite (none exists yet — see [research.md](./research.md)).

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
