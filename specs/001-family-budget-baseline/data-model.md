# Phase 1 Data Model: Gestión Financiera Familiar (Baseline Actual)

Derived from `lib/types.ts` and `supabase/migrations/001_schema.sql`–`011_*.sql`. Field lists are representative (key attributes), not exhaustive column dumps.

## Profile

Represents a household member; the unit of data isolation.

- `id`, `user_id` (FK → Supabase auth user), `name`, `full_name`, `initials`, `color`
- `role`: `Admin` | `Pro`
- `income` (monthly, CLP)
- **Relationships**: owns Categories, Accounts, Goals, Transactions, Subscriptions, MonthlyCommitments (all scoped 1-to-many by `profile_id`)
- **Validation**: exactly one `Admin` action cannot target itself for role change or removal (FR-005)
- **Visibility rule**: `visible_profile_ids()` RLS function — Admin sees all profiles in the household; Pro sees only its own row

## Category

A budget envelope belonging to one profile.

- `id`, `profile_id`, `name`, `icon`, `color`
- `group`: `Fijos` | `Variables` | `Ahorro`
- `assigned` (monthly amount), `spent` (derived/tracked), `fixed` (boolean)
- **Derived**: `disponible = assigned - spent`
- **Validation**: `fixed` categories excluded from the "Disponible para gastar hoy" variable calculation (FR-009)
- **Visual states**: ok (green) / warn (amber, spent > ~88% of assigned) / danger (red, spent > assigned)

## Account

A bank account, savings account, or credit card belonging to one profile.

- `id`, `profile_id`, `name`, `bank`, `color`
- `type`: `Cuenta` | `Crédito` | `Ahorro`
- `balance` (negative on credit = utilized limit)
- **Derived**: net worth contribution — liquid + savings balances minus utilized credit (FR-019)

## Goal

A savings target belonging to one profile.

- `id`, `profile_id`, `name`, `color`
- `target`, `current`, `monthly` (contribution)
- `due` (optional date/label)
- **Derived**: `months_remaining = ceil((target - current) / monthly)` (FR-018)

## Transaction

A single financial movement belonging to one profile.

- `id`, `profile_id`, `name`, `amount` (negative = expense, positive = income)
- `category_id` (nullable), `account_id`, `date`
- `type`: `gasto` | `ingreso` | `transfer`
- `recurring` (optional boolean), `source` (optional, for income origin)
- `origin`: manual entry or one of the ingestion pipelines (Wallet / notif / transfer-email)
- **Validation**: `amount` must be > 0 in creation UI (sign applied by `type`) (FR-011)
- **Side effect**: writing a Transaction updates the linked Account's `balance` via a database trigger

## Subscription

A recurring charge belonging to one profile, used for habit insights.

- `id`, `profile_id`, `name`, `amount`, `category_id`, `day` (billing day), `color`
- `used`: `alto` | `medio` | `bajo` (usage level, drives "fuga" detection)

## MonthlyCommitment

A recurring expected payment belonging to one profile (e.g., rent, utilities).

- `id`, `profile_id`, `name`, `expected_amount`, `expected_account_id` (optional), `due_day`
- `status`: `pendiente` → `detectado` → `pagado` | `vencido` | `omitido` | `sin_gasto`
- `linked_transaction_id` (nullable, set when a matching Transaction resolves the commitment)
- **State transitions**:
  - `pendiente` → `vencido` when due date passes with no match
  - `pendiente`/`detectado` → `pagado` when a Transaction matches amount + account (manual or ingested)
  - `pendiente` → `detectado` when an ingestion pipeline finds a probable but unconfirmed match
  - any → `omitido` on explicit user dismissal

## IngestFailure

A record of an ingestion payload that could not be processed (FR-016).

- `id`, `source` (`wallet` | `notif` | `transfer`), `raw_payload`, `error_reason`, `created_at`
- Not linked to a profile (may not be resolvable to one) — reviewed manually

## Cross-cutting: Upcoming

- `id`, `profile_id`, references a Category or MonthlyCommitment, `date`
- Feeds the "Próximos vencimientos" widget on Resumen

## Access Control Summary

| Role  | Own profile data | Other profiles' data | Manage members/roles |
|-------|-------------------|------------------------|------------------------|
| Pro   | Read/Write        | No access (RLS-enforced) | No |
| Admin | Read/Write        | Read/Write (all household profiles) | Yes (except self role/removal) |
