from fastapi import APIRouter, HTTPException, Request, status

from app.schemas import JobCreate, JobRecord, JobStatusUpdate, ProjectCreate, ProjectDetail, ProjectSummary, SourceCreate, SourceRecord, SourceStatusUpdate
from app.store import SQLiteStore

router = APIRouter(prefix="/projects", tags=["projects"])


def get_store(request: Request) -> SQLiteStore:
    return request.app.state.store


@router.get("")
def list_projects(request: Request) -> list[ProjectSummary]:
    return get_store(request).list_projects()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, request: Request) -> ProjectSummary:
    return get_store(request).create_project(name=payload.name)


@router.get("/{project_id}")
def get_project(project_id: str, request: Request) -> ProjectDetail:
    project = get_store(request).get_project_detail(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/{project_id}/sources", status_code=status.HTTP_201_CREATED)
def create_source(project_id: str, payload: SourceCreate, request: Request) -> SourceRecord:
    source = get_store(request).add_source(project_id=project_id, kind=payload.kind, value=payload.value)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return source


@router.patch("/{project_id}/sources/{source_id}")
def update_source_status(
    project_id: str,
    source_id: str,
    payload: SourceStatusUpdate,
    request: Request,
) -> SourceRecord:
    try:
        source = get_store(request).update_source_status(
            project_id=project_id,
            source_id=source_id,
            status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project or source not found",
        )

    return source


@router.get("/{project_id}/jobs")
def list_project_jobs(project_id: str, request: Request) -> list[JobRecord]:
    jobs = get_store(request).list_jobs(project_id)
    if jobs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return jobs


@router.post("/{project_id}/jobs", status_code=status.HTTP_201_CREATED)
def create_job(project_id: str, payload: JobCreate, request: Request) -> JobRecord:
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


@router.patch("/{project_id}/jobs/{job_id}")
def update_job_status(
    project_id: str,
    job_id: str,
    payload: JobStatusUpdate,
    request: Request,
) -> JobRecord:
    try:
        job = get_store(request).update_job_status(
            project_id=project_id,
            job_id=job_id,
            status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project or job not found",
        )

    return job
