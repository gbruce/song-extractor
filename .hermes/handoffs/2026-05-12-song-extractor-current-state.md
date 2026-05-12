# Song Extractor current-state handoff

## Repo
- Path: `/home/gbruce/song-extractor`
- Branch: `main`
- Last completed commit before this session: `f4dc9d8 feat: process ingest jobs automatically`

## Session intent / requested execution order
The user asked for this sequence:
1. Read the previous handoff
2. Save a fuller current-state handoff before making changes
3. Repair `apps/api/tests/test_projects_api.py`
4. Rerun targeted backend, web, and E2E tests
5. Fix the backend ingest-worker transition bug
6. Finish checked-in E2E coverage
7. Implement immediate real-ingest artifact creation under `data/projects/<project>/<source>/`
8. Verify everything
9. Commit using author `gbruce+hermes <gbruce@gmail.com>`

## Monorepo architecture
Top-level layout:
- `apps/api`: FastAPI backend, SQLite persistence, in-process ingest worker, backend tests
- `apps/web`: React + Vite frontend, Vitest unit tests, Playwright E2E
- `scripts/bootstrap.sh`: local environment bootstrap
- `Makefile`: convenience commands for backend tests and frontend build
- `.hermes/handoffs/`: session handoffs
- `.hermes/plans/`: prior implementation plans

## Backend architecture and responsibilities
Primary backend files:
- `apps/api/app/main.py`
  - boots settings and SQLite schema
  - creates the FastAPI app
  - wires CORS
  - creates `app.state.store` as a `SQLiteStore`
  - sets up in-memory log buffering + subscribers
  - creates and starts/stops an `IngestWorker` through lifespan hooks
- `apps/api/app/api/routes_projects.py`
  - project CRUD-ish surface for current MVP
  - source creation and source status patching
  - job creation and job status patching
- `apps/api/app/api/routes_health.py`
  - `GET /api/health`
  - recent log buffer endpoint
  - SSE log stream endpoint
- `apps/api/app/store.py`
  - all SQLite access for projects, sources, jobs
  - source/job status transition rules
  - ingest job -> source status propagation
  - queued-job claim helper for the worker
- `apps/api/app/ingest_worker.py`
  - background thread polling for queued ingest jobs
  - claims ingest jobs, simulates processing delay, marks completion/failure, writes logs
- `apps/api/app/config.py`
  - settings for host/port, CORS, ingest worker behavior, data dir, sqlite path

Backend current responsibility split:
- API routes validate request shape and translate backend exceptions into HTTP status codes.
- `SQLiteStore` owns persistence and transition rules.
- `IngestWorker` owns automatic background progression of queued ingest jobs.
- Log streaming is backend-owned and exposed to the frontend for live status visibility.

## Frontend architecture and responsibilities
Primary frontend files:
- `apps/web/src/App.tsx`
  - main single-page app UI
  - project creation
  - source submission
  - job/source status displays
  - manual job and source transition controls
  - polling while ingest jobs are active
  - server log viewer with SSE auto-refresh + manual refresh fallback
- `apps/web/src/api.ts`
  - fetch wrapper around backend API
  - computes default API base URL from browser hostname
- `apps/web/src/types.ts`
  - shared TS types for projects, sources, jobs, logs
- `apps/web/src/App.test.tsx`
  - unit/integration-style UI tests with mocked API
- `apps/web/e2e/app.e2e.spec.ts`
  - browser-level workflow coverage against live local backend/frontend
- `apps/web/playwright.config.ts`
  - boots uvicorn backend and Vite dev server for E2E

Frontend current responsibility split:
- Frontend submits a source, then immediately creates an ingest job.
- Frontend reflects backend job/source state rather than owning workflow state itself.
- Frontend treats ingest jobs as the normal control surface for source progression.
- Manual source overrides are intentionally locked while an ingest job is active, then unlocked once ingest reaches a terminal state.
- Frontend auto-refreshes project detail only while active ingest jobs exist.

## Current data model and workflow behavior
Current core entities:
- Project
  - id, name, created_at, updated_at, source_count, job_count
- Source
  - id, project_id, kind, value, status, created_at, updated_at
  - statuses: `submitted -> processing -> completed|failed`, plus `failed -> completed`
- Job
  - id, project_id, source_id, job_type, status, created_at, updated_at
  - statuses: `queued -> running|failed`, `running -> completed|failed`
  - current job types in types/API: `ingest`, `transcribe`, `separate`

Current end-to-end workflow:
1. User creates a project in the web UI.
2. User submits a source value.
3. Frontend calls `POST /api/projects/{id}/sources`.
4. Frontend immediately calls `POST /api/projects/{id}/jobs` with `job_type=ingest`.
5. Backend stores a queued ingest job.
6. Ingest worker polls and claims the oldest queued ingest job.
7. Claiming transitions job `queued -> running`.
8. Backend maps ingest `running` to source `submitted -> processing` when valid.
9. Worker waits briefly, then marks job `running -> completed`.
10. Backend maps ingest `completed` to source `processing -> completed` when valid.
11. Frontend polling notices the updates and refreshes the project detail view.

Important existing rule:
- Non-ingest jobs should not automatically mutate source status.
- Ingest jobs are special: their transitions are expected to drive source status automatically.

## Current API surface
Documented/observed routes:
- `GET /api/health`
- `GET /api/logs/recent`
- `GET /api/logs/stream`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `POST /api/projects/{project_id}/sources`
- `PATCH /api/projects/{project_id}/sources/{source_id}`
- `GET /api/projects/{project_id}/jobs`
- `POST /api/projects/{project_id}/jobs`
- `PATCH /api/projects/{project_id}/jobs/{job_id}`

## Test setup and commands
Backend test environment:
- package config: `apps/api/pyproject.toml`
- backend uses pytest
- app tests use `fastapi.testclient.TestClient(app)`
- SQLite DB path comes from `Settings.data_dir / sqlite_filename`
- default data dir is `apps/api/data`

Targeted backend commands:
- `cd /home/gbruce/song-extractor/apps/api && . .venv/bin/activate && pytest tests/test_projects_api.py -q`
- `cd /home/gbruce/song-extractor/apps/api && . .venv/bin/activate && pytest tests/test_health.py -q`
- `cd /home/gbruce/song-extractor/apps/api && . .venv/bin/activate && pytest tests/test_db.py -q`

Frontend unit test environment:
- `apps/web/package.json`
- Vitest + Testing Library + jsdom

Targeted frontend unit command:
- `cd /home/gbruce/song-extractor/apps/web && npm test -- --run src/App.test.tsx`

E2E environment:
- Playwright configured in `apps/web/playwright.config.ts`
- Starts backend with uvicorn from `../api`
- Starts frontend dev server on `127.0.0.1:5173`
- Reuses existing servers if already running

Targeted E2E command:
- `cd /home/gbruce/song-extractor/apps/web && npm run test:e2e`

Important repo convention from current setup:
- `make test` runs backend pytest and frontend build, not Vitest or Playwright.
- `.gitignore` ignores `apps/api/data/`, `node_modules/`, `dist/`, and venv/cache directories.
- `apps/web/test-results/` is currently untracked and should not be committed.

## Recent changes already in repo history
Recent committed milestones on `main`:
- `4787b65 test: add checked-in e2e workflow coverage`
- `360b92b feat: add in-app server log viewer`
- `4f33b45 feat: stream server logs live in app`
- `d65221c fix: support tailscale dev access`
- `f4dc9d8 feat: process ingest jobs automatically`

What those recent changes mean in practice:
- There is now a browser E2E suite checked into the repo.
- The app includes a server log viewer backed by recent-log polling and SSE streaming.
- Frontend/backend currently support Tailscale hostname-based access.
- Automatic ingest processing exists in principle, but a real backend transition bug is still unresolved.

## Current uncommitted state at start of this session
Modified files:
- `apps/api/tests/test_projects_api.py`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/e2e/app.e2e.spec.ts`

Untracked files/dirs:
- `.hermes/`
- `apps/web/test-results/`

Interpretation:
- This session is resuming mid-change from a prior partial attempt.
- Backend and frontend test/E2E files already contain partially applied work and should be treated carefully, not overwritten blindly.

## Recent changes present in working tree / partial implementation
Observed intended changes in current working tree:
- `apps/web/src/App.tsx`
  - `syncProjectDetail(detail)` helper exists
  - auto-refresh polling for active ingest jobs exists
  - polling interval currently `250ms`
- `apps/web/src/App.test.tsx`
  - tests cover auto-refresh while ingest jobs are active
  - tests cover source/manual override gating and job update behavior
  - setup switched from `vi.clearAllMocks()` to `vi.resetAllMocks()` to reduce mock leakage
- `apps/web/e2e/app.e2e.spec.ts`
  - includes happy-path ingest completion test
  - includes failure-recovery/manual-override test
  - includes log viewer SSE/manual-refresh test
- `apps/api/tests/test_projects_api.py`
  - includes drafted automatic-ingest and artifact-oriented tests
  - currently malformed / broken in structure

## Known bugs and broken areas
### 1) `apps/api/tests/test_projects_api.py` is structurally broken
Observed breakage:
- a missing test definition around the job/source transition test block
- a stray `with TestClient(app) as client:` block at module scope
- resulting file is invalid or semantically corrupted and must be repaired first

### 2) Backend ingest-worker transition bug
Observed in previous Playwright failure context and visible from code inspection:
- worker claims a queued ingest job by calling `claim_next_queued_job()`
- that helper already transitions the job from `queued` to `running`
- if later completion raises an exception, worker exception handling currently calls `update_job_status(..., status='failed')`
- if the exception was specifically caused during `running -> completed` source propagation / status logic, a second failure path may create an invalid status transition or otherwise mask root cause
- previous observed logs showed:
  - `Processing ingest job ...`
  - then `Ingest job ... failed`
  - then `ValueError: Invalid job status transition`

Likely root-cause area from current code:
- `SQLiteStore.update_job_status()` only propagates source changes if the next source transition is allowed.
- worker completion/failure path assumes it can always move the job/source cleanly after prior state changes.
- there is probably a mismatch between job transition timing and source transition legality during automatic completion/failure.

### 3) Immediate real ingest is not implemented yet
No current evidence of real media toolchain integration in app layer for worker execution:
- no checked-in yt-dlp flow
- no checked-in ffmpeg flow
- no transcription/stem-separation pipeline wired into ingest worker

Realistic immediate scope for “real ingest work” in this repo right now:
- create artifact directory structure under backend `data/`
- persist source metadata / manifest
- persist raw submitted source value as an artifact
- log artifact creation

### 4) Frontend tests were previously flaky from mock contamination / sequencing
Known prior failure pattern:
- incorrect `getProject` call counts in the auto-refresh test
- job control lookup failing in another test
- partial cleanup switched to `vi.resetAllMocks()`, but current behavior still needs verification by rerunning Vitest

## Immediate roadmap for this session
Recommended order, matching user request and current risk:
1. Repair `apps/api/tests/test_projects_api.py` structure first.
2. Run targeted backend test file to get a clean failing/passing baseline.
3. Run targeted frontend unit tests in `src/App.test.tsx`.
4. Run Playwright E2E to reproduce current live failures.
5. Fix backend ingest-worker transition bug based on actual failing test/E2E evidence.
6. Finish/adjust checked-in E2E assertions until they pass reliably.
7. Implement immediate artifact creation under `apps/api/data/projects/<project_id>/<source_id>/` or current configured data dir equivalent.
8. Add/assert backend tests for artifact creation.
9. Re-run backend + web + E2E verification.
10. Commit with requested author identity.

## Important repo-specific conventions and operational notes
- Use runtime config rather than checking machine-specific hostnames into frontend Vite config. This repo already reflects that preference.
- Frontend derives API hostname from the browser hostname by default in `src/api.ts`.
- Backend currently allows Tailscale origin `http://namshub-1.tail9205d3.ts.net:5173` in config.
- Existing functionality should be re-tested before extending feature work; do not skip straight to new implementation.
- For git commits in this repo/session, use author `gbruce+hermes <gbruce@gmail.com>`.
- Do not commit transient Playwright output from `apps/web/test-results/`.
- Because `apps/api/data/` is gitignored, artifact verification should rely on tests and filesystem checks, not git status.

## Most likely files to change next
- `apps/api/tests/test_projects_api.py`
- `apps/api/app/store.py`
- `apps/api/app/ingest_worker.py`
- possibly `apps/api/app/config.py`
- possibly `apps/api/app/main.py`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/e2e/app.e2e.spec.ts`

## Resume prompt
Continue work in `/home/gbruce/song-extractor`.
1. Repair `apps/api/tests/test_projects_api.py`.
2. Run targeted backend, Vitest, and Playwright tests.
3. Fix the backend ingest-worker transition bug causing invalid status transition behavior.
4. Finish/adjust the checked-in E2E coverage until green.
5. Implement immediate ingest artifact creation under `data/projects/<project>/<source>/` with manifest + raw source content.
6. Verify backend/web/E2E coverage.
7. Commit with author `gbruce+hermes <gbruce@gmail.com>`.
