# Security

## Auth

- Email/password only. Passwords hashed with `bcryptjs` cost 12 — plain passwords are never stored.
- Stateless sessions: JWT (HS256 via `jose`) in an `httpOnly`, `sameSite=lax`, `Secure`-in-production cookie. 30-day expiry.
- `SESSION_SECRET` must be set to ≥32 random bytes in production.
- Rate limits: `/api/auth/register` 5/10min/IP, `/api/auth/login` 10/10min/IP (Redis counters).

## Upload safety

- MIME + extension allowlist at the API edge (`api/uploads` body schema + worker filesystem check).
- Size enforced: `MAX_IMAGE_SIZE` / `MAX_VIDEO_SIZE` before presigning.
- Storage keys are opaque UUIDs (`uploads/{uuid}.{ext}`) — never filesystem paths exposed to the browser.
- Downloads are presigned GET URLs with `Content-Disposition: attachment`; auto-expire.

## Worker / FFmpeg

- All `subprocess` calls use argument lists, **never** `shell=True`. No user-supplied strings are
  interpolated into commands — only temp paths we generated.
- FFprobe validates video containers before processing.
- Temp media lives in a process-private `TemporaryDirectory()` cleaned on exit.

## Headers

`next.config.mjs` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo off).

## Privacy / retention

- Input and output files auto-expire (`FILE_RETENTION_HOURS`, default 24).
- Users can delete their files (UI delete action → `DELETE` on storage key + `files` row).
- Payment details never touch our DB — only the provider's authority/ref id is stored.

## Known gaps (MVP, call out honestly)

- CSRF: relies on `sameSite=lax` cookies for the mutating route handlers; add an explicit CSRF
  token + double-submit if you move to `sameSite=none` (e.g. cross-site embed).
- No WAF / bot mitigation beyond rate limits — front a CDN or Cloudflare in production.
- Cleanup of expired S3 objects is by scheduled job, not an always-on reaper (see processing.md).
