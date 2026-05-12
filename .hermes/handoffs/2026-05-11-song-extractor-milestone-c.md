# Song Extractor Milestone C handoff

Timestamp: 2026-05-11T22:49:33-07:00
Repo: /home/gbruce/song-extractor
Branch: main
Base commit before Milestone C: d9f847c feat: persist source media artifacts

## Summary
Milestone C adds the first downstream pipeline stage after ingest: automatic transcribe job chaining plus persisted transcription artifacts. A successful ingest now queues and completes a transcribe job in the same worker flow, and the UI keeps refreshing until all active jobs finish so the second-stage job is visible without manual reloads. Backend, web unit, and checked-in E2E coverage are all passing.

## Architecture snapshot
- apps/api
  - FastAPI backend
  - SQLite-backed project/source/job store
  - background worker currently responsible for ingest plus immediate transcribe chaining
- apps/web
  - React/Vite frontend
  - project/source/job visibility, source submission, manual status controls, server log viewer
- data/projects/<project>/<source>/
  - source-local artifact root
  - now contains both ingest artifacts and transcription artifacts

## Milestone C behavior

### Pipeline flow
For a normal successful source submission:
1. user creates source
2. user queues ingest job
3. worker claims ingest job and marks it running
4. ingest persists source artifacts under data/projects/<project>/<source>/
5. ingest completes and source becomes completed
6. store checks whether a transcribe job should be queued
7. worker queues transcribe job automatically
8. worker immediately transitions transcribe to running
9. worker writes transcription artifacts
10. transcribe job completes

Failure path:
- if ingest fails, no transcribe job is queued
- source remains failed
- manual source recovery still works as before

### Current worker responsibilities
apps/api/app/ingest_worker.py now does three things:
- persists ingest artifacts by source kind
- queues downstream transcribe when ingest completes successfully and a persisted media path exists in manifest.json
- writes placeholder transcription artifacts and completes the transcribe job

This is still a scaffold pipeline, but it is now a true chained workflow rather than a single-stage ingest-only flow.

## Backend/store changes

### apps/api/app/store.py
Added helper behavior for downstream job chaining:
- get_source_artifact_manifest(project_id, source_id, data_dir)
- has_job(project_id, source_id, job_type)
- maybe_queue_transcribe_job(...)

Queueing rules for transcribe:
- source must exist
- source status must be completed
- manifest.json must exist
- manifest must contain a non-empty persisted_media_path
- no existing transcribe job may already exist for that source

### apps/api/app/ingest_worker.py
Added:
- _process_ingest_job
- _process_transcribe_job
- _write_transcription_artifacts

Transcription output written to:
- data/projects/<project>/<source>/transcription/transcript.txt
- data/projects/<project>/<source>/transcription/transcript.json

Current transcript artifact content is placeholder/scaffold content, but it is structured and deterministic.

### apps/api/app/schemas.py and apps/api/app/api/routes_projects.py
Tightened API typing so route return types align with explicit record/summary/detail schema models:
- ProjectSummary
- ProjectDetail
- SourceRecord
- JobRecord

No major API shape change for the frontend; this was mainly cleanup/typing support while expanding the milestone.

## Artifact layout after Milestone C
For a successful source rooted at data/projects/<project>/<source>/:
- manifest.json
- raw_source.txt
- source_reference.url (youtube)
- source_media/<filename> (local_file/upload)
- transcription/transcript.txt
- transcription/transcript.json

### transcript.txt
Contains a readable placeholder transcript summary including:
- source id
- source kind
- original source value
- persisted media path

### transcript.json
Contains structured placeholder transcription data including:
- project_id
- source_id
- job_id
- job_type = transcribe
- source_kind
- source_value
- persisted_media_path
- segments[]

## Frontend behavior after Milestone C

### Auto-refresh behavior fix
Previously, the selected-project view only auto-refreshed while an ingest job was active.
That caused the UI to stop polling right after ingest completed, before the newly queued transcribe job could finish.

apps/web/src/App.tsx now keeps auto-refreshing while any job is active:
- queued
- running

Important nuance preserved:
- manual source override locking is still tied specifically to active ingest jobs
- source controls do not remain locked just because some later-stage job is active

### Result in the UI
On the happy path, the project detail now visibly progresses through:
- ingest queued/running/completed
- transcribe queued/completed
- source linked-job summary updates from 1 job to 2 jobs
- final source summary shows 0 active • 2 done • 0 failed

## Tests added/updated

### Backend
apps/api/tests/test_projects_api.py
Added:
- test_completed_ingest_auto_queues_and_completes_transcribe_job
- test_failed_ingest_does_not_queue_transcribe_job
- test_separate_jobs_are_not_processed_automatically

These prove:
- successful ingest chains to transcribe
- failed ingest does not chain
- unrelated separate jobs are still manual and not auto-processed

### Web unit
apps/web/src/App.test.tsx
Updated the auto-refresh test to require the UI to continue through:
- ingest queued
- ingest running
- ingest completed + transcribe queued
- transcribe completed

Root cause fixed during development:
- polling only watched active ingest jobs
- changed to watch any active job

### E2E
apps/web/e2e/app.e2e.spec.ts
Updated happy path to require:
- source reaches completed
- two completed job badges appear
- transcribe job appears
- source linked-job summary shows 2 linked jobs and 0 active • 2 done • 0 failed

Also fixed an E2E strict-locator issue:
- final text `No further transitions available.` appears twice in the finished happy path
- assertion now checks count = 2 instead of a single strict visibility target

## Verification
Backend:
- cd apps/api && . .venv/bin/activate && pytest tests/test_projects_api.py tests/test_health.py -q
  - result: 22 passed

Frontend unit:
- cd apps/web && npm test -- --run src/App.test.tsx
  - result: 10 passed

E2E:
- cd apps/web && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test e2e/app.e2e.spec.ts --workers=1 --reporter=line
  - result: 4 passed

## Files changed for Milestone C
- apps/api/app/api/routes_projects.py
- apps/api/app/ingest_worker.py
- apps/api/app/schemas.py
- apps/api/app/store.py
- apps/api/tests/test_projects_api.py
- apps/web/src/App.tsx
- apps/web/src/App.test.tsx
- apps/web/e2e/app.e2e.spec.ts

## Known limitations after Milestone C
- transcription is placeholder/scaffold output, not real ASR
- transcribe currently runs inline from the same worker flow that completes ingest; there is not yet a generalized multi-job worker framework
- separate jobs remain manual only
- upload still uses local-path staging semantics rather than true multipart browser upload
- apps/web/test-results/ remains untracked local Playwright output and should stay out of commits

## Repo-specific conventions to preserve
- Keep detailed session handoffs in .hermes/handoffs/.
- Do not hardcode machine-specific hostnames in repo config.
- Prefer runtime configuration for host-specific access.
- Verify backend, unit, and browser/E2E behavior before advancing milestones.
- Git commits should use author gbruce+hermes <gbruce@gmail.com>.

## Suggested Milestone D direction
Most natural next steps:
- replace placeholder transcript artifacts with a real transcription backend integration
- generalize worker orchestration so ingest/transcribe/separate become queue-driven stages instead of inline chaining
- expose artifact inspection in the UI so transcript outputs can be browsed directly from the selected project view
