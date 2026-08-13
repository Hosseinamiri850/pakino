# پاکینو · Pakino

AI watermark removal SaaS for images and videos — Persian-first, RTL-aware, with
English fallback. Built on [remove-ai-watermarks](https://github.com/wiltodelta/remove-ai-watermarks)
and FFmpeg, with a Next.js 15 frontend and a Python worker consuming a Redis queue.

> پاکینو برای حذف واترمارک محتوای تولیدشده با هوش مصنوعی طراحی شده و فرض بر این
> است که شما مالک محتوا یا مجوز تغییر آن را دارید. این سرویس برای دور زدن لایسنس
> محتوای تجاری یا استوک پولی نیست.

## Stack

- **Frontend:** Next.js 15 (App Router) · TypeScript strict · Tailwind · shadcn/ui · next-intl (fa/en)
- **Backend API:** Next.js Route Handlers · Drizzle ORM + PostgreSQL · Redis (job queue + rate limit)
- **Worker:** Python · `remove-ai-watermarks[visible,video]` · FFmpeg · psycopg · boto3
- **Storage:** S3-compatible (MinIO locally) — presigned URLs, no filesystem paths exposed to the browser
- **Payments:** ZarinPal abstraction + mock provider for local dev

## Architecture

```
Browser → Next.js (UI + API) → PostgreSQL → Redis queue → Python worker
        → remove-ai-watermarks + FFmpeg → Object storage → result → Next.js → Browser
```

Two runtime processes (Next.js + Python worker), three infra services (Postgres, Redis, S3).
No per-responsibility microservices.

## Quick start (local)

### Prerequisites

- Node.js ≥ 20, npm
- Python ≥ 3.11 (3.14 tested)
- FFmpeg (on Windows: `winget install Gyan.FFmpeg` or see [gyan.dev](https://www.gyan.dev/ffmpeg/builds/))
- Docker (optional, for infra)

### 1. Infrastructure

Spin up Postgres + Redis + MinIO:

```bash
docker compose up -d
```

This also runs `drizzle/0000_init.sql` against Postgres on first boot, and creates the
`pakino` bucket in MinIO.

Without Docker: install PostgreSQL 16, Redis 7, MinIO locally and run:

```bash
psql "$DATABASE_URL" -f drizzle/0000_init.sql
```

### 2. Environment

```bash
cp .env.example .env
# review values; defaults match docker-compose
```

### 3. Frontend

```bash
npm install
npm run dev          # http://localhost:3000  → redirects to /fa
```

Useful scripts:

```bash
npm run build        # production build
npm run lint
npm run typecheck    # tsc --noEmit
npm test             # vitest
```

### 4. Worker

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r worker/requirements.txt
python -m worker        # consumes pakino:jobs
# or: python worker/main.py
```

Worker tests:

```bash
pip install pytest
python -m pytest worker/tests -q
```

## Configuration

All tunables live in `.env` (see `.env.example`):

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | `postgres://pakino:pakino@localhost:5432/pakino` | Postgres |
| `REDIS_URL` | `redis://localhost:6379` | queue + rate limit |
| `S3_*` | MinIO local | object storage |
| `MAX_IMAGE_SIZE` / `MAX_VIDEO_SIZE` / `MAX_VIDEO_DURATION` | 10MB / 500MB / 300s | per-file limits |
| `FILE_RETENTION_HOURS` | 24 | auto-delete input + output |
| `CREDITS_PER_IMAGE` / `CREDITS_PER_VIDEO_10_SECONDS` | 5 / 10 | server-side credit cost |
| `WORKER_CONCURRENCY` | 2 | worker loop count |
| `ZARINPAL_MERCHANT_ID` | _empty_ | when empty, mock payment provider is used |
| `SESSION_SECRET` | dev-only | JWT signing secret — **set to 32+ random bytes in prod** |

## Workflow

1. Upload → presigned PUT to S3 → job row `UPLOADING`
2. `POST /api/jobs` → credits deducted → message enqueued to Redis (`pakino:jobs`)
3. Worker `BRPOP`s the job → `ANALYZING → DETECTING → PROCESSING → ENCODING → COMPLETED`
4. Frontend polls `GET /api/jobs/:id` until terminal state, then renders before/after + download

If no supported watermark is detected, the job completes with `errorCode: NO_WATERMARK_DETECTED`
and produces no output — the UI tells the user clearly.

## Internationalization

`fa` (RTL, default) and `en` (LTR), routed under `/{locale}/**`. Components use logical CSS
(`ms`/`me`, `ps`/`pe`, `start`/`end`) — no duplicated RTL/LTR variants. Messages live in
`messages/{fa,en}.json`.

## Payments

`PaymentProvider` interface (`createPayment` / `verifyPayment` / `refundPayment`).
ZarinPal is the first real provider; a mock provider is used when `ZARINPAL_MERCHANT_ID`
is unset so local dev needs no gateway. Add providers in `src/lib/payments/`.

## Limitations / roadmap

- Visible watermarks only (Hailuo, Veo, Kling, Sora, Seedance, Dola). The
  `remove-ai-watermarks` invisible path needs CUDA and is intentionally not wired into the
  MVP worker.
- MVP uses long-polling for job status; WebSockets are optional.
- Batch processing and Stripe are future work (`Pro+` plan UI is present but gated).

## Documentation

- [docs/architecture.md](docs/architecture.md) — system architecture
- [docs/development.md](docs/development.md) — local dev detail
- [docs/deployment.md](docs/deployment.md) — production deployment
- [docs/processing.md](docs/processing.md) — worker + FFmpeg internals
- [docs/security.md](docs/security.md) — threat model + hardening
- [docs/billing.md](docs/billing.md) — credits, plans, ZarinPal

## License

Apache-2.0 (inherits `remove-ai-watermarks`). Code © Pakino contributors.
