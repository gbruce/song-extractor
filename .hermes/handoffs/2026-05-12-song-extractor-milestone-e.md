# Song Extractor Milestone E handoff

Timestamp: 2026-05-12T22:12:22-07:00
Repo: /home/gbruce/song-extractor
Branch: main
Base commit before Milestone E: fcafe50 feat: add source artifact inspection

## Summary
Milestone E adds raw artifact access on top of the Milestone D inspector. The backend now exposes a content endpoint for individual source artifacts, and the frontend Source artifacts panel now includes per-artifact links that open the persisted raw file content directly from the backend. Backend, web unit, and checked-in E2E coverage all pass.

## Milestone E scope
This milestone deliberately stayed incremental:
- keep Milestone D artifact inspection intact
- add a backend route for retrieving a specific artifact file under a source workspace
- add frontend links for opening those raw artifacts
- prove the happy path can retrieve a real persisted artifact from the live app

This is the most natural step after Milestone D because users could already inspect previews, but had no way to open the real file itself.

## New user-visible behavior
For a completed source with artifacts:
1. user clicks Inspect artifacts for a source
2. UI shows artifact rows and inline previews as before
3. each artifact row now includes a link:
   - Open raw artifact <path>
4. clicking the link opens the raw backend-served artifact content directly

Example checked-in happy path now covers opening:
- raw_source.txt

## Backend changes

### apps/api/app/store.py
Added:
- get_source_artifact_path(project_id, source_id, artifact_path, data_dir)

Behavior:
- validates the source exists
- resolves the source artifact root under data/projects/<project>/<source>/
- normalizes the requested relative artifact path
- blocks path traversal / escaping outside the source artifact root
- returns the resolved file path only if it exists and is a file

This keeps raw artifact access constrained to the selected source workspace.

### apps/api/app/api/routes_projects.py
Added route:
- GET /api/projects/{project_id}/sources/{source_id}/artifacts/{artifact_path:path}/content

Behavior:
- looks up the resolved artifact path through the store helper
- returns 404 if project/source/artifact is missing or invalid
- serves the file through FileResponse
- infers media type with mimetypes and falls back to application/octet-stream

Milestone D artifact-listing route remains unchanged:
- GET /api/projects/{project_id}/sources/{source_id}/artifacts

## Frontend changes

### apps/web/src/api.ts
Added:
- api.getSourceArtifactContentUrl(projectId, sourceId, artifactPath)

Behavior:
- builds the raw artifact content URL against the configured API base URL
- preserves nested artifact paths like transcription/transcript.txt

### apps/web/src/App.tsx
Updated Source artifacts panel rows to include:
- Open raw artifact <entry.path>

Behavior:
- each row now renders a direct anchor to the backend content route
- links open in a new tab/window (`target="_blank"`, `rel="noreferrer"`)
- preview rendering still stays in place below the raw link

No existing workflow behavior changed:
- source/job orchestration remains the same
- artifact inspection remains on-demand
- log viewer behavior remains unchanged

## Data flow
1. pipeline creates artifacts under data/projects/<project>/<source>/
2. frontend loads artifact metadata/previews through the Milestone D listing route
3. for each returned entry, frontend computes a raw content URL with api.getSourceArtifactContentUrl(...)
4. user opens the raw artifact link
5. backend validates the requested relative path stays inside the source workspace
6. FastAPI returns the file content with FileResponse

## Tests added/updated

### Backend
apps/api/tests/test_projects_api.py
Added:
- test_source_artifact_content_endpoint_returns_raw_file_bytes

This proves:
- the raw artifact content endpoint exists
- the happy path can fetch raw_source.txt
- the endpoint returns 200
- response content type is text/plain
- returned body matches the persisted source URL exactly

### Web unit
apps/web/src/App.test.tsx
Updated artifact inspector coverage to also prove:
- a raw artifact link is rendered
- the link points at:
  - http://localhost:8000/api/projects/proj_123/sources/src_123/artifacts/raw_source.txt/content

Important test fix discovered during implementation:
- because the suite uses vi.resetAllMocks(), the mocked getSourceArtifactContentUrl implementation must be reinstalled in beforeEach or the rendered anchors lose href and stop being exposed as links in Testing Library.

### E2E
apps/web/e2e/app.e2e.spec.ts
Updated happy path to additionally prove:
- raw artifact link is visible in the Source artifacts panel
- the link href can be fetched through Playwright request
- the live backend returns persisted raw source content containing the expected YouTube URL

Important E2E fix discovered during implementation:
- the Playwright test needed `request` in the test args (`async ({ page, request })`) before it could fetch the raw artifact URL.

## Verification
Backend targeted suite:
- cd apps/api && . .venv/bin/activate && pytest tests/test_projects_api.py tests/test_health.py -q
  - result: 24 passed

Backend targeted new test:
- cd apps/api && . .venv/bin/activate && pytest tests/test_projects_api.py::test_source_artifact_content_endpoint_returns_raw_file_bytes -q
  - result: passed

Frontend unit:
- cd apps/web && npm test -- --run src/App.test.tsx
  - result: 11 passed

E2E:
- cd apps/web && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test e2e/app.e2e.spec.ts --workers=1 --reporter=line
  - result: 4 passed

Temporary verification servers:
- API health returned 200 at /api/health
- Vite returned HTTP/1.1 200 OK
- both temporary verification processes were terminated after testing

## Files changed for Milestone E
- apps/api/app/api/routes_projects.py
- apps/api/app/store.py
- apps/api/tests/test_projects_api.py
- apps/web/e2e/app.e2e.spec.ts
- apps/web/src/App.test.tsx
- apps/web/src/App.tsx
- apps/web/src/api.ts

## Repo state notes
Untracked items intentionally left alone:
- .hermes/handoffs/2026-05-11-song-extractor-next-session.md
- .hermes/plans/
- apps/web/test-results/

## Known limitations after Milestone E
- raw artifact access currently uses direct file serving, but the app still does not distinguish binary vs text in the UI
- artifact preview generation still assumes text-readable files
- no explicit download naming/content-disposition customization beyond FileResponse defaults
- transcription is still scaffold output, not real ASR
- upload still uses local path semantics rather than true multipart browser upload

## Suggested Milestone F direction
Natural next steps after Milestone E:
- binary-safe artifact download UX and content handling for non-text files
- richer artifact metadata (stage, role, timestamps, origin) rather than plain directory walking
- first real downstream separate stage with checked-in artifacts and UI visibility
- replace scaffold transcription with a real transcription backend
