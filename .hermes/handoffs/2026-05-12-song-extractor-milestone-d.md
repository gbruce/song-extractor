# Song Extractor Milestone D handoff

Timestamp: 2026-05-12T21:07:25-07:00
Repo: /home/gbruce/song-extractor
Branch: main
Base commit before Milestone D: 48f1cd4 feat: chain transcribe after ingest

## Summary
Milestone D adds checked-in artifact inspection across the stack. The backend now exposes a source-artifacts API that lists persisted files with content-type, size, and inline text previews. The frontend adds a Source artifacts panel plus per-source Inspect artifacts controls so users can inspect ingest and transcription outputs created under the local project workspace. Backend, web unit, and checked-in E2E coverage all pass.

## Architecture snapshot
- apps/api
  - FastAPI backend
  - SQLite-backed project/source/job store
  - project/source/job routes plus new source-artifact listing route
- apps/web
  - React/Vite frontend
  - project/source/job visibility, artifact inspection, manual status controls, server log viewer
- data/projects/<project>/<source>/
  - source-local artifact root
  - now surfaced in-app through the artifact inspection endpoint/UI

## Milestone D behavior

### New user-visible workflow
For a successfully ingested source:
1. user creates project and submits source
2. ingest completes and transcribe completes as in Milestone C
3. user clicks Inspect artifacts for the source
4. frontend fetches artifact metadata/previews from the backend
5. UI shows saved files and inline previews for ingest/transcription outputs

### Artifact inspection scope
The artifact inspector currently surfaces text-readable files under:
- data/projects/<project>/<source>/

Expected examples after a successful youtube ingest + transcribe run:
- manifest.json
- raw_source.txt
- source_reference.url
- transcription/transcript.txt
- transcription/transcript.json

For local_file/upload sources, source_media/<filename> also appears if it is text-readable, though this milestone is primarily verified against the checked-in youtube happy path.

## Backend changes

### apps/api/app/schemas.py
Added explicit response models for artifact inspection:
- SourceArtifactEntry
- SourceArtifactsResponse

Each entry currently includes:
- path
- kind
- size_bytes
- content_type
- preview

### apps/api/app/store.py
Added source artifact listing support:
- list_source_artifacts(project_id, source_id, data_dir)

Behavior:
- validates the source exists
- walks the source artifact directory recursively
- returns relative file paths rooted under the source directory
- infers content_type with mimetypes
- includes file size
- reads inline preview text up to 2000 characters

Also preserved existing manifest helper behavior used by Milestone C chaining.

### apps/api/app/api/routes_projects.py
Added new endpoint:
- GET /api/projects/{project_id}/sources/{source_id}/artifacts

Behavior:
- returns 404 if project/source is unknown
- returns an empty entries list if the source exists but has no artifact directory yet
- otherwise returns SourceArtifactsResponse

## Frontend changes

### apps/web/src/types.ts
Added:
- SourceArtifactEntry
- SourceArtifactsResponse

### apps/web/src/api.ts
Added:
- api.getSourceArtifacts(projectId, sourceId)

### apps/web/src/App.tsx
Added frontend artifact inspection state:
- selectedArtifactSourceId
- sourceArtifacts
- artifactLoading
- artifactError

Added per-source action:
- Inspect artifacts for source <id>

Added new panel:
- Source artifacts

Behavior:
- before selection, panel prompts the user to inspect a source
- on click, fetches artifacts for that source
- shows loading/error states
- renders filename, content type, byte size, and preview text
- preview blocks use aria labels tied to the artifact path, which gives stable selectors for tests

Important UX detail:
- artifact inspection is independent of manual source override controls
- source/job workflow behavior from Milestone C remains unchanged

## Data flow
1. artifacts are created by ingest/transcribe pipeline under data/projects/<project>/<source>/
2. user clicks Inspect artifacts in the selected-project source list
3. frontend calls api.getSourceArtifacts(projectId, sourceId)
4. FastAPI route delegates to store.list_source_artifacts(...)
5. store walks the source directory and assembles artifact metadata + previews
6. frontend renders the returned entries in the Source artifacts panel

## Tests added/updated

### Backend
apps/api/tests/test_projects_api.py
Added:
- test_source_artifacts_endpoint_returns_ingest_and_transcription_files

This proves:
- artifact endpoint exists
- successful ingest/transcribe artifacts are listed
- returned entries include expected filenames
- previews include expected content from manifest/raw source/transcription files

### Web unit
apps/web/src/App.test.tsx
Added:
- loads and displays source artifact previews on demand

This proves:
- per-source Inspect artifacts button exists
- frontend calls getSourceArtifacts(projectId, sourceId)
- Source artifacts panel renders filenames, metadata, and preview content

### E2E
apps/web/e2e/app.e2e.spec.ts
Happy-path coverage now additionally proves:
- artifact inspector can be opened after ingest→transcribe completes
- artifact filenames are visible in the UI
- preview regions contain expected raw source URL and transcript scaffold text

Also fixed strict-selector issues by targeting:
- exact filename text for artifact rows
- named preview regions via aria-label for preview content assertions

## Verification
Backend:
- cd apps/api && . .venv/bin/activate && pytest tests/test_projects_api.py tests/test_health.py -q
  - result: 23 passed

Frontend unit:
- cd apps/web && npm test -- --run src/App.test.tsx
  - result: 11 passed

E2E:
- cd apps/web && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test e2e/app.e2e.spec.ts --workers=1 --reporter=line
  - result: 4 passed

Temporary verification servers:
- API health check returned 200 at /api/health
- Vite returned HTTP/1.1 200 OK
- both temporary verification processes were terminated after testing

## Files changed for Milestone D
- apps/api/app/api/routes_projects.py
- apps/api/app/schemas.py
- apps/api/app/store.py
- apps/api/tests/test_projects_api.py
- apps/web/e2e/app.e2e.spec.ts
- apps/web/src/App.test.tsx
- apps/web/src/App.tsx
- apps/web/src/api.ts
- apps/web/src/types.ts

## Known limitations after Milestone D
- artifact previews assume text-readable files; binary-safe preview handling is not implemented yet
- artifact endpoint is read-only and does not expose download URLs or raw-file streaming
- transcription remains placeholder/scaffold output, not real ASR
- upload still uses local-path staging semantics rather than true multipart browser upload
- apps/web/test-results/ remains untracked local Playwright output and should stay out of commits

## Repo-specific conventions to preserve
- Keep detailed session handoffs in .hermes/handoffs/.
- Do not hardcode machine-specific hostnames in repo config.
- Prefer runtime configuration for host-specific access.
- Verify backend, unit, and browser/E2E behavior before advancing milestones.
- Git commits should use author gbruce+hermes <gbruce@gmail.com>.

## Suggested Milestone E direction
Natural next steps after artifact inspection:
- add raw artifact download/stream endpoints for binary-safe inspection
- replace placeholder transcription with a real transcription backend
- add a true downstream separate stage with artifacts under the same source workspace
- expose richer structured artifact metadata (stage, file role, timestamps) instead of raw directory walking
