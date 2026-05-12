# Song Extractor Milestone B handoff

Timestamp: 2026-05-11T22:36:38-07:00
Repo: /home/gbruce/song-extractor
Branch: main
Base commit before Milestone B: bd45519 feat: stabilize ingest scaffold workflow

## Summary
Milestone B adds real source-media persistence to the ingest scaffold. Ingest no longer only writes generic placeholder metadata; it now persists source-specific artifacts under data/projects/<project>/<source>/ and the frontend explains that behavior by source kind. Backend, unit, and checked-in E2E coverage for this milestone are passing.

## Architecture snapshot
- apps/api: FastAPI backend with SQLite-backed project/source/job store and background ingest worker.
- apps/web: React/Vite frontend for project creation, source submission, job/status visibility, and backend log viewing.
- data/projects/<project>/<source>/: project-local ingest artifact root.

## Milestone B backend behavior
The ingest worker now persists source media differently by source kind:

### youtube
- Writes raw_source.txt with the submitted source value.
- Writes source_reference.url containing the original URL.
- Writes manifest.json including:
  - project_id
  - source_id
  - job_id
  - source_kind
  - source_value
  - source_status
  - job_status
  - persisted_at
  - persisted_media_path = source_reference.url
  - persisted_media_bytes = byte count of the URL file

### local_file
- Writes raw_source.txt with the original submitted path.
- Copies the referenced local file into:
  - source_media/<original filename>
- Writes manifest.json including:
  - persisted_media_path = source_media/<filename>
  - persisted_media_bytes = copied file byte count

### upload
- Currently treated as a staged local path.
- Copies the referenced file into:
  - source_media/<original filename>
- Uses the same manifest fields as local_file.
- This is intentionally a bridge step before adding real multipart upload handling.

## Artifact layout
For a source rooted at data/projects/<project>/<source>/:
- manifest.json
- raw_source.txt
- source_reference.url (youtube only)
- source_media/<filename> (local_file/upload)

## Frontend changes
The submit-source panel now reflects real ingest persistence behavior:
- main helper copy now says ingest persists source media into the project workspace before downstream processing
- source-type-specific guidance updates live:
  - youtube: source_reference.url pointer
  - local_file: copied into source_media/<filename>
  - upload: local staging path copied into source_media/<filename>
- source-value placeholder updates by selected source kind:
  - youtube: https://youtube.com/watch?v=...
  - local_file: /path/to/reference-track.wav
  - upload: /path/to/upload-staging/source.wav

## Tests added/updated
### Backend
apps/api/tests/test_projects_api.py
- test_ingest_worker_writes_youtube_reference_artifacts
- test_ingest_worker_copies_local_file_source_media

These replace the previous generic artifact assertion with Milestone B-specific expectations.

### Web unit
apps/web/src/App.test.tsx
- added coverage that source-type guidance and placeholder text update when the user switches between youtube, local_file, and upload

### E2E
apps/web/e2e/app.e2e.spec.ts
- added checked-in E2E coverage for source-type guidance/placeholder switching
- existing happy-path and failure-recovery flows now assert the Milestone B youtube guidance is visible

## Verification
Backend:
- cd apps/api && . .venv/bin/activate && pytest tests/test_projects_api.py tests/test_health.py -q
  - result: 20 passed

Frontend unit:
- cd apps/web && npm test -- --run src/App.test.tsx
  - result: 10 passed

E2E:
- cd apps/web && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test e2e/app.e2e.spec.ts --workers=1 --reporter=line
  - result: 4 passed

## Files changed for Milestone B
- apps/api/app/ingest_worker.py
- apps/api/tests/test_projects_api.py
- apps/web/src/App.tsx
- apps/web/src/App.test.tsx
- apps/web/e2e/app.e2e.spec.ts

## Known limitations after Milestone B
- upload is not a true browser multipart upload yet; it currently assumes the submitted value is a local staging path that the backend can copy.
- Ingest still performs placeholder persistence only; downstream extraction/transcription/separation is not yet implemented.
- apps/web/test-results/ remains an untracked local Playwright output directory and should stay out of commits.

## Repo-specific conventions to preserve
- Keep detailed session handoffs in .hermes/handoffs/.
- Do not hardcode machine-specific hostnames in repo config.
- Prefer runtime configuration for host-specific access.
- User expects verification before moving to the next milestone.
- Git commits should use author gbruce+hermes <gbruce@gmail.com>.

## Suggested Milestone C direction
Likely next step: replace placeholder ingest persistence with the first real downstream processing stage, probably one of:
- transcription pipeline artifact generation
- audio normalization / canonical staging output
- extraction/separation job chaining after ingest completes
