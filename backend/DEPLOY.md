# Backend deploy notes (Render)

Hard-won gotchas. Read before touching the Render config.

## Python version — MUST be 3.12, not 3.14

`tokenizers` (a transitive dep via langchain/chromadb) has **no pre-built wheel
for Python 3.14**, so pip tries to compile it from Rust with `maturin`. That
fails on Render's free build container because `/usr/local/cargo` is mounted
read-only:

```
error: failed to create directory `/usr/local/cargo/registry/cache/...`
Caused by: Read-only file system (os error 30)
maturin failed
```

Pin Python to **3.12.8**. It's pinned in three places so at least one is honoured:

1. `backend/runtime.txt` → `python-3.12.8`
2. `backend/.python-version` → `3.12.8`
3. `render.yaml` → `PYTHON_VERSION=3.12.8` env var

**IMPORTANT:** If the Render service was created manually in the dashboard
(not from the Blueprint), it **ignores `render.yaml` AND `runtime.txt` on an
existing service**. The only reliable override is the dashboard env var:

> Render dashboard → resumate-backend → Environment → add
> `PYTHON_VERSION = 3.12.8` → Save → then Manual Deploy → **Clear build cache & deploy**

The cache clear matters — the old 3.14 venv is cached otherwise.

## CORS

The backend MERGES `CORS_ORIGINS` (env) with a hardcoded allow-list that always
includes `https://resumate-ui.onrender.com` and the local dev ports (see
`app/core/config.py::cors_origins_list`). A blank or stale dashboard value can
no longer lock the frontend out. Still, set it explicitly for clarity:

```
CORS_ORIGINS = https://resumate-ui.onrender.com,http://localhost:3006
```

Symptom of a CORS lockout: browser console shows
`No 'Access-Control-Allow-Origin' header is present` and the preflight OPTIONS
returns 400.

## Database

Render **free Postgres expires after 90 days** and is deleted. When it's gone:

1. Create a new Postgres (New + → PostgreSQL), same region as the backend.
2. Wire its **Internal** connection string into the backend's `DATABASE_URL`
   (the Blueprint does this via `fromDatabase` automatically; a manual service
   needs it pasted into the dashboard).
3. Migrations run automatically via the build command
   (`pip install -r requirements.txt && alembic upgrade head`). On a manual
   service, set that same Build Command in the dashboard.
4. The DB is empty — re-register the hiring-manager account at
   `/hiring/register`.

To avoid recurrence: upgrade to Render Starter Postgres ($7/mo) or move to a
free-tier Neon/Supabase Postgres and swap `DATABASE_URL`.

## Required env vars (backend)

| Var | Notes |
|-----|-------|
| `PYTHON_VERSION` | `3.12.8` — see above |
| `DATABASE_URL` | Postgres connection string (Internal URL on Render) |
| `SECRET_KEY` | strong random; backend refuses to boot in prod with the default |
| `AGENT_SHARED_SECRET` | must match the interview worker's value |
| `OPENAI_API_KEY` | required for all agents + realtime interview |
| `CORS_ORIGINS` | frontend origin(s) |
| `REALTIME_MODEL` | default `gpt-realtime-2` |
| `REALTIME_VOICE` | default `marin` |
| `TAVILY_API_KEY`, `GITHUB_TOKEN`, `LIVEKIT_*`, `SIMLI_*`, `SENDGRID_API_KEY` | feature-specific |

## Verify a deploy

```
curl https://resumate-api-74dm.onrender.com/health
```

Expect `"status": "healthy"` and `"llm": true`. Free-tier services cold-start
(30–60s) after 15 min idle — the first request may be slow.
