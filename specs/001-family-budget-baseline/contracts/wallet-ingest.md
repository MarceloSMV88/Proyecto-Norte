# Contract: `wallet-ingest` (Supabase Edge Function)

Ingests card-purchase notifications relayed from Google Wallet via MacroDroid (Android automation).

## Endpoint

`POST /functions/v1/wallet-ingest`

## Auth

Header `x-ingest-secret: <shared secret>`, validated against `ingest_config.secret` (row `id=1`). Not a Supabase JWT. Requests without a matching header → `401 { "error": "unauthorized" }`.

## Request Body

```json
{
  "title": "string — merchant name, as shown in the Wallet notification",
  "text": "string — e.g. \"CLP1.500 with Visa •5116\" (amount + last 4 digits)",
  "postTime": "number (optional) — epoch millis of the notification"
}
```

## Behavior

1. Reject non-POST with `405`.
2. Reject invalid JSON with `400` and log to `ingest_failures` (`fn: 'wallet-ingest'`, `reason: 'bad_json'`).
3. Parse merchant + CLP amount (tolerant of `CLP`/`$`, `,`/`.` separators) and card last-4 from `text`. On parse failure → `400 { error: 'parse_failed' }` and log to `ingest_failures`.
4. Resolve `profile_id`/`account_id` by matching card last-4 against `accounts.last4`; fallback to the sole `Admin` profile with no account if no match.
5. Deduplicate: same profile + merchant + amount inserted within the last 5 minutes → skip insert, return `{ ok: true, inserted: false, reason: 'duplicate' }`.
6. Categorize via `category_rules` (merchant substring match, longest pattern wins) if a rule exists for the profile.
7. Insert a `transactions` row (`type: 'gasto'`, `source: 'google_wallet'`, amount negative). Account balance updates via a DB trigger, not this function.
8. Cross-source dedup: if a `bank_app`-sourced transaction with the same profile+amount+date+account already exists, delete the just-inserted Wallet row (bank record wins) and return `{ ok: true, inserted: false, reason: 'duplicate_post' }`.

## Response (success)

```json
{
  "ok": true,
  "inserted": true,
  "id": "uuid",
  "merchant": "string",
  "amount": "number (positive CLP)",
  "last4": "string | null",
  "profile_id": "uuid",
  "account_matched": "boolean",
  "category_matched": "boolean",
  "date": "YYYY-MM-DD"
}
```

## Traces to

FR-013, FR-014, FR-015, FR-016 (spec.md); User Story 5.
