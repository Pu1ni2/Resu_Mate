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

## Database: back it up, because the free one expires

Render deletes a **free Postgres database 30 days after it is created**. It
emails a warning first, but nothing in the app can stop it. So back it up, and
restore into a new database when it goes.

### Every three weeks or so: back up

From your own machine, with the PostgreSQL 16 client tools (`pg_dump`,
`pg_restore`) installed:

1. Render → `resumate-db` → **Connect** → copy the **External Database URL**.
2. From the repository root:

   ```
   DATABASE_URL='<External Database URL>' python backend/scripts/backup_db.py backup
   ```

   This writes `backups/resumate-YYYY-MM-DD.dump` (`--out` picks another path;
   `--pg-bin` points at the tools if they aren't on the PATH).

A backup holds candidates' personal data. Keep it private: `backups/` and
`*.dump` are git-ignored, so never force-add one, and never upload one as a CI
artifact. The repository is public.

### When the database expires (or before): restore

1. Create a new Postgres (New + → PostgreSQL) in the same region as the backend.
2. Restore the latest backup into it, with its **External** URL:

   ```
   DATABASE_URL='<new External Database URL>' python backend/scripts/backup_db.py restore backups/resumate-YYYY-MM-DD.dump
   ```

   It asks before replacing anything (`--yes` skips the question). The backup
   carries the migration version, so the next deploy's `alembic upgrade head`
   carries on from there.
3. Point the backend's `DATABASE_URL` at the new database's **Internal** URL
   and redeploy. The Blueprint does this through `fromDatabase` when the new
   database is also named `resumate-db`; a manual service needs it pasted in.

Without a backup the new database starts empty: the build command's
`alembic upgrade head` creates the tables, and everyone signs up again.

To stop the expiry altogether, use a paid Render Postgres, or a free Postgres
elsewhere (Neon, Supabase) through `DATABASE_URL`.

## Required env vars (backend)

`render.yaml` declares every one of these; set the secret ones in the dashboard.
`backend/.env.example` describes each.

| Var | Notes |
|-----|-------|
| `PYTHON_VERSION` | `3.12.8` — see above |
| `DATABASE_URL` | Postgres connection string (Internal URL on Render) |
| `SECRET_KEY` | strong random; backend refuses to boot in prod with the default |
| `DEBUG` | `false` in production |
| `FRONTEND_URL` | the frontend's address: invitation and password-reset links point there |
| `CORS_ORIGINS` | frontend origin(s) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | required for the agents; the chat model, default `gpt-4o` |
| `REALTIME_MODEL`, `REALTIME_VOICE` | voice interviews; defaults `gpt-realtime-2`, `marin` |
| `SENDGRID_API_KEY`, `FROM_EMAIL` | email (see below) |
| `TAVILY_API_KEY`, `GITHUB_TOKEN` | web search; GitHub lookups and sourcing |
| `SOURCER_MODEL`, `SOURCER_MAX_*`, `SOURCER_PRICE_*` | the candidate sourcer (optional) |
| `CALENDLY_TOKEN` | scheduling links (optional) |
| `AVATAR_INTERVIEWS`, `LIVEKIT_*`, `AGENT_SHARED_SECRET` | avatar interviews (see below); `false` on the free plan |

## Email

Sign-in codes, interview invitations, password resets and deletion codes are
sent with SendGrid. Set `SENDGRID_API_KEY`, and `FROM_EMAIL` to a sender
SendGrid has verified (Settings → Sender Authentication), or it refuses to
send. Without email, managers get the candidate sign-in link to pass on; with
`DEBUG=true` (local only) the codes appear in the app.

## Avatar interviews (needs a paid worker)

Interviews run voice-only (OpenAI Realtime, in the browser) unless avatar
interviews are switched on. A video interview with the Simli avatar needs the
interview worker (`backend/interview_agent.py`) running all the time, which
Render's free plan can't do. To switch them on:

1. Run the worker: uncomment the worker block at the end of `render.yaml`
   (`plan: starter`, a paid plan), or deploy it on Fly.io with
   `backend/fly.toml` and `backend/Dockerfile.agent`.
2. Give the worker `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
   `OPENAI_API_KEY`, `SIMLI_API_KEY`, `SIMLI_FACE_ID`, `BACKEND_URL` (the API's
   address) and `AGENT_SHARED_SECRET`.
3. On the backend set the same `LIVEKIT_*` and `AGENT_SHARED_SECRET`, and
   `AVATAR_INTERVIEWS=true`.

Without all of these the app offers voice interviews only, and an interview
made as an avatar one runs voice-only rather than waiting for an interviewer
that never joins.

### Object storage for original resume PDFs (optional)

All optional. If `S3_BUCKET` is unset the app keeps its "parse then discard"
behaviour and stores no original files — local dev and existing deploys are
unaffected. Works with AWS S3, Cloudflare R2, and Backblaze B2.

| Var | Notes |
|-----|-------|
| `S3_BUCKET` | bucket name; leave blank to disable original-file storage |
| `S3_ENDPOINT` | blank for AWS; e.g. `https://<acct>.r2.cloudflarestorage.com` for R2 |
| `S3_REGION` | default `us-east-1` |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | credentials for the bucket |

When configured, the original upload is saved to
`resumes/{manager_id}/{candidate_id}/{file}` and exposed via
`GET /api/candidates/{id}/file` (manager-scoped). Candidate "delete my data"
removes the object too.

## Multi-tenant & compliance notes

- **Data isolation**: candidates and interviews are scoped to the owning hiring
  manager (`manager_id`). The in-memory store is partitioned per manager. Two
  managers on one deployment cannot see each other's data — guarded by
  `backend/tests/test_data_isolation.py`.
- **GDPR**: candidates can erase their own data via
  `POST /api/chat/candidate/delete-my-data` (authenticated with their candidate
  session token). Anyone else, such as someone a manager uploaded or a sourcing
  run found, can ask at `/privacy/delete`: `POST /api/privacy/erasure-code`
  emails a code and `POST /api/privacy/erase` takes it; both answer the same
  whether or not anything is held. A manager deletes their account and all its
  data with `POST /api/auth/delete-account` and their password. Sensitive
  actions are recorded in the `audit_log` table.
- **Consent**: sign-up records when the manager agreed to the Terms and which
  version (`hiring_managers.terms_accepted_at`, `terms_version`); an interview
  records when the candidate agreed to how it works (`interviews.consented_at`).
- **Retention**: `python cleanup_stale.py --days 180 --apply` deletes
  candidates/interviews untouched for N days. Dry-run by default. Run via cron
  if you want automatic retention.

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **backend**: `pytest -q` on Python 3.12;
- **migrations**: a Postgres 16 database built from empty with
  `alembic upgrade head`, `alembic check` against the models, the app's startup
  check, then `alembic downgrade base` and up again;
- **frontend**: `npm ci`, lint, build and the tests on Node 24.

## Verify a deploy

```
curl https://resumate-api-74dm.onrender.com/health
```

Expect `{"status": "ok", "database": "ok"}`. It answers 503 when the database
can't be reached, and Render's health check (`healthCheckPath: /health`) uses it.
`/monitoring` needs the `X-Agent-Token` header (`AGENT_SHARED_SECRET`).

Free services sleep after 15 idle minutes and take up to a minute to start;
the frontend asks `/health` as it loads and tells people while it wakes.
