# Contract: `upload-account-image` (Supabase Edge Function)

Uploads a custom image for an account (User Story 7, Cuentas screen), called from the browser after login.

## Endpoint

`POST /functions/v1/upload-account-image`

## Auth

Supabase platform-level JWT verification (`verify_jwt: true`) — the caller must be an authenticated Norte user. Inside the function, the service-role key is used to write to Storage directly, bypassing `storage.objects` RLS (documented workaround for a direct-upload RLS issue that was not root-caused).

## Request

`multipart/form-data`:

- `file`: image file, max 3 MiB, `content-type` must start with `image/`
- `profile_id`: string, required

CORS preflight (`OPTIONS`) is handled explicitly since the browser sends a non-simple request (FormData + Authorization header).

## Behavior

1. Reject non-POST (405), malformed form (400), missing file/profile_id (400), oversized file (400), non-image content-type (400).
2. Store at `account-images/<profile_id>/<random-uuid>.<ext>` (upsert enabled).
3. Return the bucket's public URL.

## Response

```json
{ "ok": true, "url": "https://.../account-images/<profile_id>/<uuid>.<ext>" }
```

## Traces to

User Story 7 (Cuentas screen), FR-019a.
