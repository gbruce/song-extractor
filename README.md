# songcraft

songcraft is a local-first scaffold for a future music workflow app.

This repository is intentionally minimal, but it now includes the first real app flow. It provides:

- a FastAPI backend with health, projects, sources, and jobs endpoints
- a React + Vite frontend with project creation and source submission
- Docker-first local development via Docker Compose
- simple local development commands with a Makefile
- a bootstrap script for cross-machine setup
- a devcontainer for editor-based onboarding
- GitHub Actions CI for API tests and frontend build verification

No heavy media, download, or processing features are implemented yet.

## Monorepo layout

```text
songcraft/
├── .devcontainer/
├── .github/workflows/
├── apps/
│   ├── api/    # FastAPI service
│   └── web/    # React + Vite app
├── scripts/
├── .env.example
├── docker-compose.yml
├── Makefile
└── README.md
```

## Requirements

Choose one of these approaches:

### Option A: Docker-first

- Docker
- Docker Compose

### Option B: Local development without Docker

- Python 3.12+
- Node.js 20+
- npm 10+

## Fastest setup options

### Option 1: Bootstrap locally

```bash
bash scripts/bootstrap.sh
make test
make dev
```

### Option 2: Docker-first

```bash
cp .env.example .env
docker compose up --build
```

### Option 3: Devcontainer

Open the repository in a devcontainer-compatible editor and let `.devcontainer/devcontainer.json` provision the workspace.

## Quick start with Docker Compose

1. Copy environment defaults:

```bash
cp .env.example .env
```

2. Build and start services:

```bash
docker compose up --build
```

3. Open the apps:

- Web: http://localhost:5173
- API docs: http://localhost:8000/docs
- API health: http://localhost:8000/api/health

Stop everything with:

```bash
docker compose down
```

## Local development

### One-time setup

```bash
bash scripts/bootstrap.sh
```

### Backend

```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

In a second terminal:

```bash
cd apps/web
npm run dev -- --host 0.0.0.0 --port 5173
```

The frontend is configured to call the API at `http://localhost:8000` by default.

## Common commands

From the repository root:

```bash
make bootstrap
make install
make dev
make up
make down
make test
make ci
```

## Current API surface

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `POST /api/projects/{project_id}/sources`
- `GET /api/projects/{project_id}/jobs`
- `POST /api/projects/{project_id}/jobs`

The current implementation uses an in-memory store so the UI can exercise a realistic app flow before persistent storage is added.

## Frontend status

The frontend now supports:

- creating local projects
- selecting a project
- submitting a placeholder source
- automatically queueing an ingest job
- viewing current sources and jobs

## Environment

See `.env.example` for the default variables used by Docker Compose and local development.

## Validation

- Backend tests run in CI and locally with `make test`
- Frontend production build runs in CI and locally with `make test`

## Current scope

This is still scaffolding plus the first workflow layer. Actual YouTube downloading, audio extraction, stem separation, transcription, structure labeling, persistence, and exports are still to come.
