from fastapi.testclient import TestClient

from app.main import app


def test_healthcheck_returns_expected_payload() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "songcraft-api"


def test_preflight_request_allows_frontend_origin() -> None:
    client = TestClient(app)

    response = client.options(
        "/api/projects",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "POST" in response.headers["access-control-allow-methods"]
