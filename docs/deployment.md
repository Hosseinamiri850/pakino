# Deployment

## Target shape

- **Next.js** — Node 20+ runtime (Vercel, Fly.io, or a node host behind nginx). Set
  `SESSION_SECRET`, `DATABASE_URL`, `REDIS_URL`, `S3_*`, `ZARINPAL_*` as secrets.
- **Worker** — long-running Python process on a host with FFmpeg + `remove-ai-watermarks`.
  Scale horizontally with `WORKER_CONCURRENCY` or multiple worker processes.
- **Postgres** — managed RDS/Supabase or `postgres:16` container with the init SQL applied.
- **Redis** — managed ElastiCache/Upstash or `redis:7` container.
- **S3** — real S3, or any S3-compatible (Cloudflare R2, Backblaze B2, Wasabi).

## Checklist before production

1. Generate `SESSION_SECRET` — `openssl rand -hex 32` — and set it.
2. Set `ZARINPAL_MERCHANT_ID` + a real `ZARINPAL_CALLBACK_URL`; set `ZARINPAL_SANDBOX=false`.
3. Set `NEXT_PUBLIC_APP_URL` to the public origin (used for OG, sitemap, payment callbacks).
4. Apply the latest migration (`drizzle/0000_init.sql`) to the production DB.
5. Provision a cleanup job for expired files (see [processing.md](processing.md) → cleanup).
6. Put the worker behind a process manager (systemd / Docker / supervisor) with restart=always.
7. Serve Next.js behind TLS; security headers are already emitted by `next.config.mjs`.

## Docker (single-host optional)

A production `Dockerfile` for the worker:

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/requirements.txt worker/requirements.txt
RUN pip install --no-cache-dir -r worker/requirements.txt
COPY . .
CMD ["python", "-m", "worker"]
```

The Next.js app uses the standard `next build` → `next start` flow.

## Observability

- Worker logs structured lines (`%(asctime)s %(levelname)s %(name)s: %(message)s`) — pipe to your log aggregator.
- Application errors surface `error_code` to clients; map unknowns to `PROCESSING_FAILED`.
- Add Prometheus/OpenTelemetry exporters as needed (not bundled in the MVP).
