# songcraft API

FastAPI backend for the local-first songcraft app scaffold.

## Current capabilities

- health endpoint
- local projects API
- source submission API
- queued jobs API
- SQLite-backed persistence
- schema bootstrap via tracked migrations

## Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
pytest -q
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Database bootstrap

The API uses SQLite and bootstraps the schema automatically on startup.

Database file:
- `apps/api/data/songcraft.db`

Migration tracking table:
- `schema_migrations`

Current migration implementation:
- `app/db.py`

This keeps schema creation idempotent and creates a clean place for future schema evolution.
