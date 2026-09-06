# Contract: `transfer-ingest` (Supabase Edge Function)

Ingests bank-transfer emails (Santander, Banco de Chile, Banco Ripley) relayed by `scripts/gmail-transfer-ingest.gs` (Google Apps Script trigger on the household Gmail inbox).

## Endpoint

`POST /functions/v1/transfer-ingest`

## Auth

Header `x-ingest-secret`, same mechanism as `wallet-ingest`/`notif-ingest` (implied by shared `ingest_config` pattern; verify against source if reused verbatim in a future task).

## Request Body (payload sent by the Apps Script trigger)

Email-derived fields including: sender/destination account number, sender/destination bank, sender/destination name, amount, date, and (for structured banks) a token-encoded description (`#oa:`, `#da:`, `#ob:`, `#db:`, `#tx:` — origin/destination account/bank, transaction id).

## Behavior

1. Classifies the transfer by matching, in order: account number → RUT → name (≥2 tokens) → `originMine`/`destMine` hints.
2. **Internal transfer** (both accounts belong to the household): creates **two** transactions — origin (negative) and destination (positive).
3. **Received from a third party**: creates one `ingreso` transaction (positive).
4. **Sent to a third party**: creates one `gasto` transaction (negative).
5. Bank-name matching is restricted to deposit accounts (not credit cards) and only when the matched endpoint is the household's own account.
6. Cross-bank dedup: matches on date + amount + (shared account, or same bank pair, or same transaction id) to avoid double-counting a transfer reported by both the sending and receiving bank.
7. **Commitment auto-link** (`linkCommitment`): after inserting, looks for exactly one unconfirmed `monthly_commitments` candidate for the same profile/month/category whose `matcher_hint` (or name) appears fully in the transaction text; links it and advances its status. Zero or multiple candidates → left for client-side "detectado" suggestion, confirmed manually by the user.

## Response shape

`{ ok, inserted, reason?, id?, ... }`, consistent with the other two ingestion functions.

## Traces to

FR-013, FR-014, FR-015, FR-016 (spec.md); User Story 5, User Story 9 (commitment linking, Acceptance Scenario 2).
