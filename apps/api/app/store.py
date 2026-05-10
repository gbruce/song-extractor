from __future__ import annotations

import sqlite3
from pathlib import Path
from uuid import uuid4

from app.db import bootstrap_database

TERMINAL_JOB_STATUSES = {"completed", "failed"}
ALLOWED_JOB_STATUS_TRANSITIONS = {
    "queued": {"running", "failed"},
    "running": {"completed", "failed"},
    "completed": set(),
    "failed": set(),
}


class SQLiteStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        bootstrap_database(self.database_path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def reset(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                DELETE FROM jobs;
                DELETE FROM sources;
                DELETE FROM projects;
                """
            )

    def list_projects(self) -> list[dict[str, object]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    p.id,
                    p.name,
                    p.created_at,
                    p.updated_at,
                    COUNT(DISTINCT s.id) AS source_count,
                    COUNT(DISTINCT j.id) AS job_count
                FROM projects p
                LEFT JOIN sources s ON s.project_id = p.id
                LEFT JOIN jobs j ON j.project_id = p.id
                GROUP BY p.id, p.name, p.created_at, p.updated_at
                ORDER BY p.rowid DESC
                """
            ).fetchall()
            return [dict(row) for row in rows]

    def create_project(self, name: str) -> dict[str, object]:
        project_id = f"proj_{uuid4().hex[:10]}"
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO projects (id, name, created_at, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                (project_id, name),
            )
        return self._project_summary(project_id)

    def get_project_detail(self, project_id: str) -> dict[str, object] | None:
        project = self._project_summary(project_id)
        if project is None:
            return None

        with self._connect() as connection:
            sources = [
                dict(row)
                for row in connection.execute(
                    """
                    SELECT id, project_id, kind, value, status, created_at, updated_at
                    FROM sources
                    WHERE project_id = ?
                    ORDER BY rowid ASC
                    """,
                    (project_id,),
                ).fetchall()
            ]
            jobs = [
                dict(row)
                for row in connection.execute(
                    """
                    SELECT id, project_id, source_id, job_type, status, created_at, updated_at
                    FROM jobs
                    WHERE project_id = ?
                    ORDER BY rowid ASC
                    """,
                    (project_id,),
                ).fetchall()
            ]

        return {
            **project,
            "sources": sources,
            "jobs": jobs,
        }

    def add_source(self, project_id: str, kind: str, value: str) -> dict[str, str] | None:
        if self._project_summary(project_id) is None:
            return None

        source_id = f"src_{uuid4().hex[:10]}"
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sources (id, project_id, kind, value, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                (source_id, project_id, kind, value, "submitted"),
            )
            row = connection.execute(
                "SELECT id, project_id, kind, value, status, created_at, updated_at FROM sources WHERE id = ?",
                (source_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_jobs(self, project_id: str) -> list[dict[str, str]] | None:
        if self._project_summary(project_id) is None:
            return None

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, project_id, source_id, job_type, status, created_at, updated_at
                FROM jobs
                WHERE project_id = ?
                ORDER BY rowid ASC
                """,
                (project_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def add_job(self, project_id: str, source_id: str, job_type: str) -> dict[str, str] | None:
        if self._project_summary(project_id) is None:
            return None

        with self._connect() as connection:
            source = connection.execute(
                "SELECT id, project_id FROM sources WHERE id = ?",
                (source_id,),
            ).fetchone()
            if source is None or source["project_id"] != project_id:
                return None

            job_id = f"job_{uuid4().hex[:10]}"
            connection.execute(
                """
                INSERT INTO jobs (id, project_id, source_id, job_type, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                (job_id, project_id, source_id, job_type, "queued"),
            )
            row = connection.execute(
                "SELECT id, project_id, source_id, job_type, status, created_at, updated_at FROM jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        return dict(row) if row else None

    def update_job_status(self, project_id: str, job_id: str, status: str) -> dict[str, str] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, project_id, source_id, job_type, status, created_at, updated_at
                FROM jobs
                WHERE id = ? AND project_id = ?
                """,
                (job_id, project_id),
            ).fetchone()
            if row is None:
                return None

            current_status = row["status"]
            if status not in ALLOWED_JOB_STATUS_TRANSITIONS.get(current_status, set()):
                raise ValueError("Invalid job status transition")

            connection.execute(
                """
                UPDATE jobs
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND project_id = ?
                """,
                (status, job_id, project_id),
            )
            updated_row = connection.execute(
                """
                SELECT id, project_id, source_id, job_type, status, created_at, updated_at
                FROM jobs
                WHERE id = ? AND project_id = ?
                """,
                (job_id, project_id),
            ).fetchone()
        return dict(updated_row) if updated_row else None

    def _project_summary(self, project_id: str) -> dict[str, object] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    p.id,
                    p.name,
                    p.created_at,
                    p.updated_at,
                    COUNT(DISTINCT s.id) AS source_count,
                    COUNT(DISTINCT j.id) AS job_count
                FROM projects p
                LEFT JOIN sources s ON s.project_id = p.id
                LEFT JOIN jobs j ON j.project_id = p.id
                WHERE p.id = ?
                GROUP BY p.id, p.name, p.created_at, p.updated_at
                """,
                (project_id,),
            ).fetchone()
        return dict(row) if row else None



def reset_store(store: SQLiteStore) -> None:
    store.reset()
