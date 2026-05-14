from __future__ import annotations

import json
import mimetypes
from pathlib import Path, PurePosixPath
import sqlite3
from uuid import uuid4

from app.db import bootstrap_database

TERMINAL_JOB_STATUSES = {"completed", "failed"}
FINAL_SOURCE_STATUSES = {"completed", "failed"}
ALLOWED_SOURCE_STATUS_TRANSITIONS = {
    "submitted": {"processing", "failed"},
    "processing": {"completed", "failed"},
    "completed": set(),
    "failed": {"completed"},
}
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

    def get_source(self, project_id: str, source_id: str) -> dict[str, str] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, project_id, kind, value, status, created_at, updated_at
                FROM sources
                WHERE id = ? AND project_id = ?
                """,
                (source_id, project_id),
            ).fetchone()
        return dict(row) if row else None

    def update_source_status(self, project_id: str, source_id: str, status: str) -> dict[str, str] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, project_id, kind, value, status, created_at, updated_at
                FROM sources
                WHERE id = ? AND project_id = ?
                """,
                (source_id, project_id),
            ).fetchone()
            if row is None:
                return None

            current_status = row["status"]
            if status not in ALLOWED_SOURCE_STATUS_TRANSITIONS.get(current_status, set()):
                raise ValueError("Invalid source status transition")

            connection.execute(
                """
                UPDATE sources
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND project_id = ?
                """,
                (status, source_id, project_id),
            )
            updated_row = connection.execute(
                """
                SELECT id, project_id, kind, value, status, created_at, updated_at
                FROM sources
                WHERE id = ? AND project_id = ?
                """,
                (source_id, project_id),
            ).fetchone()
        return dict(updated_row) if updated_row else None

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

    def get_job(self, project_id: str, job_id: str) -> dict[str, str] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, project_id, source_id, job_type, status, created_at, updated_at
                FROM jobs
                WHERE id = ? AND project_id = ?
                """,
                (job_id, project_id),
            ).fetchone()
        return dict(row) if row else None

    def get_source_artifact_manifest(self, project_id: str, source_id: str, data_dir: Path) -> dict[str, object] | None:
        manifest_path = Path(data_dir) / 'projects' / project_id / source_id / 'manifest.json'
        if not manifest_path.exists():
            return None
        return json.loads(manifest_path.read_text(encoding='utf-8'))

    def list_source_artifacts(self, *, project_id: str, source_id: str, data_dir: Path) -> dict[str, object] | None:
        source = self.get_source(project_id=project_id, source_id=source_id)
        if source is None:
            return None

        source_dir = Path(data_dir) / 'projects' / project_id / source_id
        if not source_dir.exists() or not source_dir.is_dir():
            return {
                'project_id': project_id,
                'source_id': source_id,
                'entries': [],
            }

        entries: list[dict[str, object]] = []
        for artifact_path in sorted(path for path in source_dir.rglob('*') if path.is_file()):
            relative_path = artifact_path.relative_to(source_dir).as_posix()
            content_type = mimetypes.guess_type(str(artifact_path))[0] or 'application/octet-stream'
            preview: str | None = None
            artifact_bytes = artifact_path.read_bytes()
            is_known_text_type = content_type.startswith('text/') or content_type in {
                'application/json',
                'application/xml',
                'application/javascript',
            }
            if is_known_text_type:
                preview = artifact_bytes.decode(encoding='utf-8')[:2000]
            else:
                has_nul_byte = b'\x00' in artifact_bytes
                if not has_nul_byte:
                    try:
                        decoded_preview = artifact_bytes.decode(encoding='utf-8')
                    except UnicodeDecodeError:
                        decoded_preview = None
                    if decoded_preview is not None:
                        preview = decoded_preview[:2000]
            entries.append(
                {
                    'path': relative_path,
                    'kind': 'file',
                    'size_bytes': artifact_path.stat().st_size,
                    'content_type': content_type,
                    'preview': preview,
                }
            )

        return {
            'project_id': project_id,
            'source_id': source_id,
            'entries': entries,
        }

    def get_source_artifact_path(
        self,
        *,
        project_id: str,
        source_id: str,
        artifact_path: str,
        data_dir: Path,
    ) -> Path | None:
        source = self.get_source(project_id=project_id, source_id=source_id)
        if source is None:
            return None

        source_dir = (Path(data_dir) / 'projects' / project_id / source_id).resolve()
        if not source_dir.exists() or not source_dir.is_dir():
            return None

        normalized_relative_path = PurePosixPath('/' + artifact_path).as_posix().lstrip('/')
        if not normalized_relative_path or normalized_relative_path in {'.', '..'}:
            return None
        if normalized_relative_path.startswith('../') or '/..' in normalized_relative_path.split('/'):
            return None

        candidate_path = (source_dir / Path(normalized_relative_path)).resolve()
        if source_dir not in candidate_path.parents and candidate_path != source_dir:
            return None
        if not candidate_path.exists() or not candidate_path.is_file():
            return None
        return candidate_path

    def has_job(self, project_id: str, source_id: str, job_type: str) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT 1
                FROM jobs
                WHERE project_id = ? AND source_id = ? AND job_type = ?
                LIMIT 1
                """,
                (project_id, source_id, job_type),
            ).fetchone()
        return row is not None

    def maybe_queue_transcribe_job(self, *, project_id: str, source_id: str, data_dir: Path) -> dict[str, str] | None:
        source = self.get_source(project_id=project_id, source_id=source_id)
        if source is None or source['status'] not in FINAL_SOURCE_STATUSES:
            return None
        if source['status'] != 'completed':
            return None
        if self.has_job(project_id=project_id, source_id=source_id, job_type='transcribe'):
            return None

        manifest = self.get_source_artifact_manifest(project_id=project_id, source_id=source_id, data_dir=data_dir)
        if manifest is None:
            return None

        persisted_media_path = manifest.get('persisted_media_path')
        if not isinstance(persisted_media_path, str) or not persisted_media_path:
            return None

        return self.add_job(project_id=project_id, source_id=source_id, job_type='transcribe')

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

    def claim_next_queued_job(self, job_type: str) -> dict[str, str] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, project_id
                FROM jobs
                WHERE job_type = ? AND status = 'queued'
                ORDER BY rowid ASC
                LIMIT 1
                """,
                (job_type,),
            ).fetchone()
            if row is None:
                return None

        return self.update_job_status(
            project_id=row['project_id'],
            job_id=row['id'],
            status='running',
        )

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

            if row["job_type"] == "ingest":
                source_status_map = {
                    "running": "processing",
                    "completed": "completed",
                    "failed": "failed",
                }
                next_source_status = source_status_map.get(status)
                if next_source_status is not None:
                    source_row = connection.execute(
                        """
                        SELECT status
                        FROM sources
                        WHERE id = ? AND project_id = ?
                        """,
                        (row["source_id"], project_id),
                    ).fetchone()
                    if source_row is not None:
                        current_source_status = source_row["status"]
                        if next_source_status in ALLOWED_SOURCE_STATUS_TRANSITIONS.get(current_source_status, set()):
                            connection.execute(
                                """
                                UPDATE sources
                                SET status = ?, updated_at = CURRENT_TIMESTAMP
                                WHERE id = ? AND project_id = ?
                                """,
                                (next_source_status, row["source_id"], project_id),
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
