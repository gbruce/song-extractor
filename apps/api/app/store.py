from __future__ import annotations

from dataclasses import asdict, dataclass
from threading import Lock
from uuid import uuid4


@dataclass
class SourceRecord:
    id: str
    project_id: str
    kind: str
    value: str
    status: str


@dataclass
class JobRecord:
    id: str
    project_id: str
    source_id: str
    job_type: str
    status: str


@dataclass
class ProjectRecord:
    id: str
    name: str


class InMemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.projects: dict[str, ProjectRecord] = {}
            self.sources: dict[str, SourceRecord] = {}
            self.jobs: dict[str, JobRecord] = {}

    def list_projects(self) -> list[dict[str, object]]:
        with self._lock:
            return [self._project_summary(project_id) for project_id in self.projects]

    def create_project(self, name: str) -> dict[str, object]:
        with self._lock:
            project_id = f"proj_{uuid4().hex[:10]}"
            self.projects[project_id] = ProjectRecord(id=project_id, name=name)
            return self._project_summary(project_id)

    def get_project_detail(self, project_id: str) -> dict[str, object] | None:
        with self._lock:
            if project_id not in self.projects:
                return None

            project = self.projects[project_id]
            sources = [
                asdict(source)
                for source in self.sources.values()
                if source.project_id == project_id
            ]
            jobs = [asdict(job) for job in self.jobs.values() if job.project_id == project_id]
            return {
                **asdict(project),
                "source_count": len(sources),
                "job_count": len(jobs),
                "sources": sources,
                "jobs": jobs,
            }

    def add_source(self, project_id: str, kind: str, value: str) -> dict[str, str] | None:
        with self._lock:
            if project_id not in self.projects:
                return None
            source = SourceRecord(
                id=f"src_{uuid4().hex[:10]}",
                project_id=project_id,
                kind=kind,
                value=value,
                status="submitted",
            )
            self.sources[source.id] = source
            return asdict(source)

    def list_jobs(self, project_id: str) -> list[dict[str, str]] | None:
        with self._lock:
            if project_id not in self.projects:
                return None
            return [asdict(job) for job in self.jobs.values() if job.project_id == project_id]

    def add_job(self, project_id: str, source_id: str, job_type: str) -> dict[str, str] | None:
        with self._lock:
            if project_id not in self.projects or source_id not in self.sources:
                return None
            source = self.sources[source_id]
            if source.project_id != project_id:
                return None
            job = JobRecord(
                id=f"job_{uuid4().hex[:10]}",
                project_id=project_id,
                source_id=source_id,
                job_type=job_type,
                status="queued",
            )
            self.jobs[job.id] = job
            return asdict(job)

    def _project_summary(self, project_id: str) -> dict[str, object]:
        project = self.projects[project_id]
        source_count = sum(1 for source in self.sources.values() if source.project_id == project_id)
        job_count = sum(1 for job in self.jobs.values() if job.project_id == project_id)
        return {
            "id": project.id,
            "name": project.name,
            "source_count": source_count,
            "job_count": job_count,
        }


store = InMemoryStore()


def reset_store() -> None:
    store.reset()
