from pathlib import Path
import time

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.store import reset_store


def setup_function() -> None:
    reset_store(app.state.store)


def test_project_source_and_job_workflow() -> None:
    with TestClient(app) as client:
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


def test_queued_ingest_job_is_processed_automatically() -> None:
    with TestClient(app) as client:
        project = client.post('/api/projects', json={'name': 'Auto Ingest Track'}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={'kind': 'youtube', 'value': 'https://youtube.com/watch?v=auto-ingest'},
        ).json()
        job = client.post(
            f"/api/projects/{project['id']}/jobs",
            json={'source_id': source['id'], 'job_type': 'ingest'},
        ).json()

        assert job['status'] == 'queued'

        deadline = time.time() + 1.5
        latest_detail = None
        while time.time() < deadline:
            latest_detail = client.get(f"/api/projects/{project['id']}").json()
            if latest_detail['jobs'][0]['status'] == 'completed':
                break
            time.sleep(0.05)

        assert latest_detail is not None
        assert latest_detail['jobs'][0]['id'] == job['id']
        assert latest_detail['jobs'][0]['status'] == 'completed'
        assert latest_detail['sources'][0]['id'] == source['id']
        assert latest_detail['sources'][0]['status'] == 'completed'


def test_ingest_worker_writes_source_artifacts() -> None:
    settings = get_settings()
    artifacts_root = settings.data_dir / 'projects'

    with TestClient(app) as client:
        project = client.post('/api/projects', json={'name': 'Artifact Track'}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={'kind': 'youtube', 'value': 'https://youtube.com/watch?v=artifact-ingest'},
        ).json()
        job = client.post(
            f"/api/projects/{project['id']}/jobs",
            json={'source_id': source['id'], 'job_type': 'ingest'},
        ).json()

        deadline = time.time() + 1.5
        latest_detail = None
        while time.time() < deadline:
            latest_detail = client.get(f"/api/projects/{project['id']}").json()
            if latest_detail['jobs'][0]['status'] == 'completed':
                break
            time.sleep(0.05)

    assert latest_detail is not None
    assert latest_detail['jobs'][0]['id'] == job['id']
    assert latest_detail['jobs'][0]['status'] == 'completed'

    source_dir = artifacts_root / project['id'] / source['id']
    manifest_path = source_dir / 'manifest.json'
    raw_source_path = source_dir / 'raw_source.txt'

    assert source_dir.exists()
    assert manifest_path.exists()
    assert raw_source_path.exists()

    manifest = manifest_path.read_text(encoding='utf-8')
    raw_source = raw_source_path.read_text(encoding='utf-8')

    assert project['id'] in manifest
    assert source['id'] in manifest
    assert job['id'] in manifest
    assert 'artifact-ingest' in manifest
    assert raw_source == 'https://youtube.com/watch?v=artifact-ingest'


def test_non_ingest_jobs_are_not_processed_automatically() -> None:
    with TestClient(app) as client:
        project = client.post('/api/projects', json={'name': 'Manual Transcribe Track'}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={'kind': 'youtube', 'value': 'https://youtube.com/watch?v=manual-transcribe'},
        ).json()
        source_processing = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={'status': 'processing'},
        )
        assert source_processing.status_code == 200
        source_completed = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={'status': 'completed'},
        )
        assert source_completed.status_code == 200

        job = client.post(
            f"/api/projects/{project['id']}/jobs",
            json={'source_id': source['id'], 'job_type': 'transcribe'},
        ).json()

        time.sleep(0.2)
        latest_detail = client.get(f"/api/projects/{project['id']}").json()

        assert latest_detail['jobs'][0]['id'] == job['id']
        assert latest_detail['jobs'][0]['status'] == 'queued'
        assert latest_detail['sources'][0]['status'] == 'completed'


def test_job_status_transition_updates_job_and_ingest_source_state() -> None:
    with TestClient(app) as client:
        project = client.post("/api/projects", json={"name": "Status Track"}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={"kind": "youtube", "value": "https://youtube.com/watch?v=status123"},
        ).json()
        job = client.post(
            f"/api/projects/{project['id']}/jobs",
            json={"source_id": source["id"], "job_type": "ingest"},
        ).json()

        update_job_running = client.patch(
            f"/api/projects/{project['id']}/jobs/{job['id']}",
            json={"status": "running"},
        )

        assert update_job_running.status_code == 200
        running_job = update_job_running.json()
        assert running_job["status"] == "running"
        assert running_job["updated_at"] >= job["updated_at"]

        project_after_running = client.get(f"/api/projects/{project['id']}").json()
        assert project_after_running["sources"][0]["status"] == "processing"
        assert project_after_running["sources"][0]["updated_at"] >= source["updated_at"]

        update_job_completed = client.patch(
            f"/api/projects/{project['id']}/jobs/{job['id']}",
            json={"status": "completed"},
        )

        assert update_job_completed.status_code == 200
        completed_job = update_job_completed.json()
        assert completed_job["status"] == "completed"
        assert completed_job["updated_at"] >= running_job["updated_at"]

        project_after_completed = client.get(f"/api/projects/{project['id']}").json()
        assert project_after_completed["sources"][0]["status"] == "completed"


def test_non_ingest_job_transition_does_not_change_source_status() -> None:
    with TestClient(app) as client:
        project = client.post("/api/projects", json={"name": "Transcribe Track"}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={"kind": "youtube", "value": "https://youtube.com/watch?v=transcribe123"},
        ).json()

        source_completed = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={"status": "processing"},
        )
        assert source_completed.status_code == 200
        source_completed = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={"status": "completed"},
        )
        assert source_completed.status_code == 200

        job = client.post(
            f"/api/projects/{project['id']}/jobs",
            json={"source_id": source["id"], "job_type": "transcribe"},
        ).json()

        update_job = client.patch(
            f"/api/projects/{project['id']}/jobs/{job['id']}",
            json={"status": "running"},
        )

        assert update_job.status_code == 200
        project_detail = client.get(f"/api/projects/{project['id']}").json()
        assert project_detail["sources"][0]["status"] == "completed"


def test_source_status_transition_updates_source_state_and_timestamp() -> None:
    with TestClient(app) as client:
        project = client.post("/api/projects", json={"name": "Source Status Track"}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={"kind": "youtube", "value": "https://youtube.com/watch?v=source-status"},
        ).json()

        update_source = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={"status": "processing"},
        )

        assert update_source.status_code == 200
        updated_source = update_source.json()
        assert updated_source["status"] == "processing"
        assert updated_source["updated_at"] >= source["updated_at"]


def test_invalid_source_status_transition_returns_409() -> None:
    with TestClient(app) as client:
        project = client.post("/api/projects", json={"name": "Invalid Source Status Track"}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={"kind": "youtube", "value": "https://youtube.com/watch?v=invalid-source"},
        ).json()

        update_source = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={"status": "completed"},
        )

        assert update_source.status_code == 409
        assert update_source.json()["detail"] == "Invalid source status transition"


def test_failed_source_can_be_manually_recovered_to_completed() -> None:
    with TestClient(app) as client:
        project = client.post("/api/projects", json={"name": "Recover Failed Source"}).json()
        source = client.post(
            f"/api/projects/{project['id']}/sources",
            json={"kind": "youtube", "value": "https://youtube.com/watch?v=recover-source"},
        ).json()

        failed_source = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={"status": "failed"},
        )
        assert failed_source.status_code == 200

        recovered_source = client.patch(
            f"/api/projects/{project['id']}/sources/{source['id']}",
            json={"status": "completed"},
        )

        assert recovered_source.status_code == 200
        assert recovered_source.json()["status"] == "completed"
        assert recovered_source.json()["updated_at"] >= failed_source.json()["updated_at"]


def test_invalid_job_status_transition_returns_409() -> None:
    with TestClient(app) as client:
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
    with TestClient(app) as client:
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
