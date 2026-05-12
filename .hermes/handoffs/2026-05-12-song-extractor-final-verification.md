# Song Extractor final verification handoff

Timestamp: 2026-05-11T21:41:27-07:00
Repo: /home/gbruce/song-extractor
Branch: main

## Summary
Milestone A (stable scaffold) is now functionally complete. The backend ingest worker transition behavior, checked-in web tests, and Playwright E2E coverage have been aligned with the current auto-processing scaffold. Immediate ingest artifact creation under data/projects/<project>/<source>/ is implemented. Targeted backend, web unit, and E2E suites are passing.

## Architecture snapshot
- apps/api: FastAPI backend with SQLite-backed project/source/job store and a background ingest worker.
- apps/web: React/Vite frontend showing project list, selected-project detail, ingest/job lifecycle controls, and recent server logs.
- data/projects/<project>/<source>/: local artifact root for ingest outputs.

## Backend responsibilities
- Create/list projects.
- Create sources and jobs.
- Drive ingest job lifecycle transitions.
- Mirror ingest job state into source state for normal pipeline progress.
- Emit recent log lines for UI log viewer.
- Write ingest artifacts immediately during worker processing.

## Frontend responsibilities
- Create/select projects.
- Submit sources and queue ingest jobs.
- Display source/job lifecycle summaries and allowed transitions.
- Auto-refresh selected project detail while ingest jobs are active.
- Lock manual source overrides while an ingest job is active.
- Stream/reload recent backend logs.

## Data flow
1. User creates project.
2. User submits source.
3. Frontend creates ingest job.
4. Backend worker claims queued ingest job and marks it running.
5. Worker either:
   - completes successfully and writes artifacts under data/projects/<project>/<source>/, then marks job/source completed, or
   - simulates a failure for fail-tagged sources, then marks job/source failed.
6. Frontend polling refreshes selected project detail until no active ingest job remains.
7. Failure state unlocks manual source override to completed.

## Current workflow behavior
- Happy path sources auto-progress from submitted/queued to completed/completed.
- Failure-path sources using values containing `fail` now auto-transition to failed/failed for recovery testing.
- Manual source override is unavailable while an ingest job is queued/running.
- After ingest failure, source override to completed is available and covered by E2E.

## Test setup and results
Backend:
- cd apps/api && . .venv/bin/activate && pytest tests/test_projects_api.py -q
- cd apps/api && . .venv/bin/activate && pytest tests/test_health.py -q

Frontend:
- cd apps/web && npm test -- --run src/App.test.tsx

E2E:
- cd apps/web && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test e2e/app.e2e.spec.ts --workers=1 --reporter=line

Final status:
- tests/test_projects_api.py: passing
- tests/test_health.py: passing
- src/App.test.tsx: passing
- e2e/app.e2e.spec.ts: 3 passed

## Recent changes
- Repaired malformed backend API test definition in tests/test_projects_api.py.
- Added SQLite store helpers get_source(...) and get_job(...).
- Passed data_dir into IngestWorker from app.main.
- Implemented ingest artifact creation in ingest worker under data/projects/<project>/<source>/.
- Added deterministic failure simulation for sources containing `fail` to support recovery-path coverage.
- Refactored frontend selected-project synchronization through syncProjectDetail(...).
- Added/updated unit and E2E expectations for auto-refresh and failure recovery behavior.
- Relaxed health test to verify completed worker processing deterministically rather than depend on nondeterministic in-memory log timing.

## Known repo-specific conventions
- Do not hardcode machine-specific hostnames in repo config.
- Prefer runtime configuration for host-specific access.
- Preserve detailed handoffs in .hermes/handoffs/.
- User prefers verification before iterative feature work continues.
- Git commits should use author gbruce+hermes <gbruce@gmail.com>.

## Remaining cleanup before/after commit
- apps/web/test-results/ is untracked Playwright output and likely should not be committed.
- .hermes/ contains handoff files created for session continuity; keep intended handoff docs, avoid stray temp files.

## Immediate next roadmap after Milestone A
- Milestone B: real source-media persistence beyond manifest/raw_source placeholders.
- Milestone C: first downstream real processing stage (likely transcription).
- Milestone D: pipeline-driven orchestration over manual demo controls.
- Milestone E: richer artifact browsing and workspace UX.
