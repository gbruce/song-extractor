from pathlib import Path

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.store import reset_store


def setup_function() -> None:
    reset_store(app.state.store)


def test_project_source_and_job_workflow() -> None:
    client = TestClient(app)

    empty_projects = client.get("/api/projects")
    assert empty_projects.status_code == 200
    assert empty_projects.json() == []

    create_project = client.post("/api/projects", json={"name": "My Test Track"})
    assert create_project.status_code == 201
    project = create_project.json()
    assert project["name"] == "My Test Track"
    assert project["source_count"] == 0
    assert project["job_count"] == 0
    assert project["created_at"]
    assert project["updated_at"]

    create_source = client.post(
        f"/api/projects/{project['id']}/sources",
        json={"kind": "youtube", "value": "https://youtube.com/watch?v=demo123"},
    )
    assert create_source.status_code == 201
    source = create_source.json()
    assert source["project_id"] == project["id"]
    assert source["status"] == "submitted"
    assert source["created_at"]
    assert source["updated_at"]

    create_job = client.post(
        f"/api/projects/{project['id']}/jobs",
        json={"source_id": source["id"], "job_type": "ingest"},
    )
    assert create_job.status_code == 201
    job = create_job.json()
    assert job["project_id"] == project["id"]
    assert job["source_id"] == source["id"]
    assert job["status"] == "queued"
    assert job["created_at"]
    assert job["updated_at"]

    project_detail = client.get(f"/api/projects/{project['id']}")
    assert project_detail.status_code == 200
    detailed = project_detail.json()
    assert detailed["id"] == project["id"]
    assert len(detailed["sources"]) == 1
    assert len(detailed["jobs"]) == 1
    assert detailed["sources"][0]["value"] == "https://youtube.com/watch?v=demo123"
    assert detailed["jobs"][0]["job_type"] == "ingest"
    assert detailed["sources"][0]["created_at"]
    assert detailed["jobs"][0]["updated_at"]

    jobs = client.get(f"/api/projects/{project['id']}/jobs")
    assert jobs.status_code == 200
    assert len(jobs.json()) == 1


def test_job_status_transition_updates_job_state_and_timestamp() -> None:
    client = TestClient(app)

    project = client.post("/api/projects", json={"name": "Status Track"}).json()
    source = client.post(
        f"/api/projects/{project['id']}/sources",
        json={"kind": "youtube", "value": "https://youtube.com/watch?v=status123"},
    ).json()
    job = client.post(
        f"/api/projects/{project['id']}/jobs",
        json={"source_id": source["id"], "job_type": "ingest"},
    ).json()

    update_job = client.patch(
        f"/api/projects/{project['id']}/jobs/{job['id']}",
        json={"status": "running"},
    )

    assert update_job.status_code == 200
    updated_job = update_job.json()
    assert updated_job["status"] == "running"
    assert updated_job["updated_at"] >= job["updated_at"]



def test_invalid_job_status_transition_returns_409() -> None:
    client = TestClient(app)

    project = client.post("/api/projects", json={"name": "Invalid Status Track"}).json()
    source = client.post(
        f"/api/projects/{project['id']}/sources",
        json={"kind": "youtube", "value": "https://youtube.com/watch?v=invalid123"},
    ).json()
    job = client.post(
        f"/api/projects/{project['id']}/jobs",
        json={"source_id": source["id"], "job_type": "ingest"},
    ).json()

    update_job = client.patch(
        f"/api/projects/{project['id']}/jobs/{job['id']}",
        json={"status": "completed"},
    )

    assert update_job.status_code == 409
    assert update_job.json()["detail"] == "Invalid job status transition"


def test_creating_source_for_unknown_project_returns_404() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/projects/missing-project/sources",
        json={"kind": "youtube", "value": "https://youtube.com/watch?v=missing"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_store_uses_sqlite_database_file() -> None:
    settings = get_settings()
    database_path = Path(app.state.store.database_path)

    assert database_path.name == "songcraft.db"
    assert database_path.suffix == ".db"
    assert database_path == settings.sqlite_path
    assert database_path.exists()
