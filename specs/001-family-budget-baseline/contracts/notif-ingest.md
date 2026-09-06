# Contract: `notif-ingest` (Supabase Edge Function)

Generic ingestion of bank-app push notifications (Banco Ripley, Santander, Banco de Chile, etc.), relayed via MacroDroid.

## Endpoint

`POST /functions/v1/notif-ingest`

## Auth

Header `x-ingest-secret`, same mechanism and table (`ingest_config`) as `wallet-ingest`.

## Request Body

```json
{
  "app": "string — source bank app identifier",
  "title": "string — notification title",
  "text": "string — notification body",
  "postTime": "number (optional) — epoch millis"
}
```

## Behavior

1. Auth check identical to `wallet-ingest`.
2. Runs the payload through an ordered list of per-bank/per-notification-type parsers (`Parsed` union: `gasto`, `trf_recibida`, `pago_tc`, `trf_recibida_cuenta`). First parser that matches wins.
3. If no parser matches → logged to `ingest_failures` with `reason: 'no_parser'` (kept for writing a new parser from the real payload), request still returns success-shaped response with `inserted: false`.
4. Resolves the target account by last-4 / bank hint, and the profile that owns that account (or bank-hint fallback for cards unique to a bank).
5. Cross-source dedup: for card purchases, checks for an existing transaction of the same profile + amount within the last 15 minutes (name not compared, since Wallet and the bank app write different merchant strings) before inserting.
6. Inserts the resulting `transactions` row with `source: 'bank_app'` and the appropriate `type` (`gasto` / `ingreso` / internal transfer pair), or updates a linked `monthly_commitments` row when applicable.

## Response shape

Mirrors `wallet-ingest`'s `{ ok, inserted, reason?, id?, ... }` pattern; exact fields vary by parsed `kind`.

## Traces to

FR-013, FR-014, FR-015, FR-016 (spec.md); User Story 5, User Story 9 (commitment linking).
