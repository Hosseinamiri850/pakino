# Development

## First run

```bash
docker compose up -d          # postgres + redis + minio
cp .env.example .env
npm install
npm run dev                   # http://localhost:3000
```

Worker (separate terminal):

```bash
python -m venv .venv
.venv\Scripts\activate         # Windows   (source .venv/bin/activate on *nix)
pip install -r worker/requirements.txt
python -m worker
```

## MinIO console

http://localhost:9001 — login `pakino` / `pakino12345`. Bucket `pakino` is created
automatically by the `createbucket` compose service.

## Seed a user

```bash
psql postgres://pakino:pakino@localhost:5432/pakino -c \
"INSERT INTO users (email, password_hash) VALUES ('me@test.com','\$2a\$12\$...');"
```

Or use `/fa/register`.

## Tests

```bash
npm test                       # vitest (frontend)
python -m pytest worker/tests  # pytest (worker) — needs pytest installed
```

## Common issues

- **`Cannot find module 'autoprefixer'`** — run `npm i -D autoprefixer`.
- **Worker can't import `remove_ai_watermarks`** — install extras: `pip install -r worker/requirements.txt`
  (pinned `remove-ai-watermarks[visible,video]`). On Python 3.14 some wheels may lag — fall back to 3.12/3.13 if installs fail.
- **`MISSING_MESSAGE` warnings during `next build`** — a translation key is referenced but absent from
  `messages/{fa,en}.json`. Add the key (build still succeeds, but fix for production).

## Windows notes

- Use Git Bash / WSL for the `python -m venv` activation snippets above.
- FFmpeg: `winget install Gyan.FFmpeg` or download a build from gyan.dev and add `bin` to `PATH`.
