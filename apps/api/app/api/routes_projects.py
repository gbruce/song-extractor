from fastapi import APIRouter, HTTPException, status

from app.schemas import JobCreate, ProjectCreate, SourceCreate
from app.store import store

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects() -> list[dict[str, object]]:
    return store.list_projects()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate) -> dict[str, object]:
    return store.create_project(name=payload.name)


@router.get("/{project_id}")
def get_project(project_id: str) -> dict[str, object]:
    project = store.get_project_detail(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/{project_id}/sources", status_code=status.HTTP_201_CREATED)
def create_source(project_id: str, payload: SourceCreate) -> dict[str, str]:
    source = store.add_source(project_id=project_id, kind=payload.kind, value=payload.value)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return source


@router.get("/{project_id}/jobs")
def list_project_jobs(project_id: str) -> list[dict[str, str]]:
    jobs = store.list_jobs(project_id)
    if jobs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return jobs


@router.post("/{project_id}/jobs", status_code=status.HTTP_201_CREATED)
def create_job(project_id: str, payload: JobCreate) -> dict[str, str]:
    job = store.add_job(
        project_id=project_id,
        source_id=payload.source_id,
        job_type=payload.job_type,
    )
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project or source not found",
        )
    return job
