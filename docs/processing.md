# Processing (worker + FFmpeg)

## Job lifecycle

```
UPLOADING → ANALYZING → DETECTING → PROCESSING → ENCODING → COMPLETED
                                                       ↘ FAILED
                                                       ↘ CANCELLED (via Redis flag)
```

Every transition writes `progress` (0–100) + a Persian/English stage label is rendered
client-side via `messages/{fa,en}.json#stages`.

## remove-ai-watermarks use

Visible-path only (CPU-friendly, no CUDA):

- Image: `raiw.remove_visible(in, out)` → `(result, removed)`
- Video: `raiw.remove_video_visible(in, out, mark="hailuo"|"veo"|...)` → object with `.mark`
- AoT fallback: `raiw.remove_video_all(in, out)` when provider mark unknown → passthrough copy.
- Detection: `raiw.identify_video` / `raiw.identify`, coerced to `{provider, confidence, location}`
  by `worker/app/watermark._normalize_identify`.

Supported visible marks (from the upstream README): Sora, Veo, Seedance, Dola, Hailuo, Kling.

The **invisible** path (`raiw.remove_invisible`, `qwen-zimage`) requires an NVIDIA GPU and is
intentionally not wired into the MVP worker.

## FFmpeg

All invocations use `subprocess.run([FFMPEG, ...args])` — **never** `shell=True`, and arguments
are local temp paths only (never user-supplied strings). Outputs set `+faststart` for web playback.

Memory: videos are processed via the library's streaming path (frame-wise); the worker downloads
to a `tempfile.TemporaryDirectory()` that is removed on exit. We do not load whole videos into RAM.

## Configurable limits

`MAX_IMAGE_SIZE`, `MAX_VIDEO_SIZE`, `MAX_VIDEO_DURATION` (all env, no hardcoding). The worker
rejects videos exceeding the duration limit with `INVALID_VIDEO`.

## File retention + cleanup

A `python -m worker` process downloads/produces files in `tmp/` (auto-cleaned). Object storage
keys (`uploads/`, `outputs/`) carry `expires_at` on the `files` row. To delete expired objects
schedule (cron / systemd timer) a small job that:

1. `SELECT id, storage_key FROM files WHERE expires_at < now()` from Postgres
2. `s3.delete_object(key)` for each
3. `DELETE FROM files WHERE id = ...`

An MVP cleanup script can live alongside the worker; the MVP ships the schema field and policy
in the privacy docs, and leaves the scheduler choice to deployment.
