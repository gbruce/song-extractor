from fastapi.testclient import TestClient

from app.main import app
from app.store import reset_store


def setup_function() -> None:
    reset_store()


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

    create_source = client.post(
        f"/api/projects/{project['id']}/sources",
        json={"kind": "youtube", "value": "https://youtube.com/watch?v=demo123"},
    )
    assert create_source.status_code == 201
    source = create_source.json()
    assert source["project_id"] == project["id"]
    assert source["status"] == "submitted"

    create_job = client.post(
        f"/api/projects/{project['id']}/jobs",
        json={"source_id": source["id"], "job_type": "ingest"},
    )
    assert create_job.status_code == 201
    job = create_job.json()
    assert job["project_id"] == project["id"]
    assert job["source_id"] == source["id"]
    assert job["status"] == "queued"

    project_detail = client.get(f"/api/projects/{project['id']}")
    assert project_detail.status_code == 200
    detailed = project_detail.json()
    assert detailed["id"] == project["id"]
    assert len(detailed["sources"]) == 1
    assert len(detailed["jobs"]) == 1
    assert detailed["sources"][0]["value"] == "https://youtube.com/watch?v=demo123"
    assert detailed["jobs"][0]["job_type"] == "ingest"

    jobs = client.get(f"/api/projects/{project['id']}/jobs")
    assert jobs.status_code == 200
    assert len(jobs.json()) == 1



def test_creating_source_for_unknown_project_returns_404() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/projects/missing-project/sources",
        json={"kind": "youtube", "value": "https://youtube.com/watch?v=missing"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"
