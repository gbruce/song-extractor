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

    assert applied_versions == [get_latest_migration_version()]
