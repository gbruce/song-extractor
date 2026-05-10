from fastapi import APIRouter, HTTPException, Request, status

from app.schemas import JobCreate, ProjectCreate, SourceCreate
from app.store import SQLiteStore

router = APIRouter(prefix="/projects", tags=["projects"])


def get_store(request: Request) -> SQLiteStore:
    return request.app.state.store


@router.get("")
def list_projects(request: Request) -> list[dict[str, object]]:
    return get_store(request).list_projects()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, request: Request) -> dict[str, object]:
    return get_store(request).create_project(name=payload.name)


@router.get("/{project_id}")
def get_project(project_id: str, request: Request) -> dict[str, object]:
    project = get_store(request).get_project_detail(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/{project_id}/sources", status_code=status.HTTP_201_CREATED)
def create_source(project_id: str, payload: SourceCreate, request: Request) -> dict[str, str]:
    source = get_store(request).add_source(project_id=project_id, kind=payload.kind, value=payload.value)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return source


@router.get("/{project_id}/jobs")
def list_project_jobs(project_id: str, request: Request) -> list[dict[str, str]]:
    jobs = get_store(request).list_jobs(project_id)
    if jobs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return jobs


@router.post("/{project_id}/jobs", status_code=status.HTTP_201_CREATED)
def create_job(project_id: str, payload: JobCreate, request: Request) -> dict[str, str]:
    job = get_store(request).add_job(
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
