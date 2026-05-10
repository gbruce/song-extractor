from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Migration:
    version: str
    sql: str


MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        version="0001_initial_schema",
        sql="""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sources (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            value TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            job_type TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
        );
        """,
    ),
)


def _connect(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection



def bootstrap_database(database_path: Path) -> None:
    database_path = Path(database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with _connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        applied_versions = {
            row["version"]
            for row in connection.execute(
                "SELECT version FROM schema_migrations ORDER BY version ASC"
            ).fetchall()
        }

        for migration in MIGRATIONS:
            if migration.version in applied_versions:
                continue
            connection.executescript(migration.sql)
            connection.execute(
                "INSERT INTO schema_migrations (version) VALUES (?)",
                (migration.version,),
            )



def get_applied_migrations(database_path: Path) -> list[str]:
    with _connect(Path(database_path)) as connection:
        rows = connection.execute(
            "SELECT version FROM schema_migrations ORDER BY version ASC"
        ).fetchall()
    return [row["version"] for row in rows]



def get_latest_migration_version() -> str:
    return MIGRATIONS[-1].version
