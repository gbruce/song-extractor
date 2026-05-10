SHELL := /bin/bash

API_DIR := apps/api
WEB_DIR := apps/web

.PHONY: bootstrap install dev up down test test-api test-web ci db-bootstrap

bootstrap:
	bash scripts/bootstrap.sh

install: bootstrap

dev:
	@echo "Start the backend in one terminal:"
	@echo "  cd $(API_DIR) && . .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
	@echo "Start the frontend in another terminal:"
	@echo "  cd $(WEB_DIR) && npm run dev -- --host 0.0.0.0 --port 5173"

up:
	cp -n .env.example .env || true
	docker compose up --build

down:
	docker compose down

test: test-api test-web

test-api:
	cd $(API_DIR) && . .venv/bin/activate && pytest

test-web:
	cd $(WEB_DIR) && npm run build

db-bootstrap:
	cd $(API_DIR) && . .venv/bin/activate && python -c "from app.config import get_settings; from app.db import bootstrap_database; s = get_settings(); bootstrap_database(s.sqlite_path); print(s.sqlite_path)"

ci: test
