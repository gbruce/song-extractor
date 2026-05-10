import sqlite3
from pathlib import Path

from app.db import bootstrap_database, get_applied_migrations, get_latest_migration_version


def test_bootstrap_database_creates_schema_migrations_table(tmp_path: Path) -> None:
    database_path = tmp_path / "bootstrap-test.db"

    bootstrap_database(database_path)

    with sqlite3.connect(database_path) as connection:
        row = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
        ).fetchone()

    assert row is not None


def test_bootstrap_database_records_latest_migration_version(tmp_path: Path) -> None:
    database_path = tmp_path / "migration-history.db"

    bootstrap_database(database_path)

    applied_versions = get_applied_migrations(database_path)

    assert applied_versions
    assert applied_versions[-1] == get_latest_migration_version()


def test_bootstrap_database_is_idempotent(tmp_path: Path) -> None:
    database_path = tmp_path / "idempotent.db"

    bootstrap_database(database_path)
    bootstrap_database(database_path)

    applied_versions = get_applied_migrations(database_path)

    assert applied_versions == ["0001_initial_schema", get_latest_migration_version()]



def test_bootstrap_database_applies_timestamp_migration_to_existing_schema(tmp_path: Path) -> None:
    database_path = tmp_path / "existing-schema.db"

    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );

            CREATE TABLE sources (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                value TEXT NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE jobs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                job_type TEXT NOT NULL,
                status TEXT NOT NULL
            );

            INSERT INTO schema_migrations (version) VALUES ('0001_initial_schema');
            """
        )

    bootstrap_database(database_path)

    with sqlite3.connect(database_path) as connection:
        job_columns = {row[1] for row in connection.execute("PRAGMA table_info(jobs)").fetchall()}

    assert "created_at" in job_columns
    assert "updated_at" in job_columns
