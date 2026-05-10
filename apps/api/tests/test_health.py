from fastapi.testclient import TestClient

from app.main import app


def test_healthcheck_returns_expected_payload() -> None:
    client = TestClient(app)

    response = client.get('/api/health')

    assert response.status_code == 200
    assert response.json() == {
        'status': 'ok',
        'service': 'songcraft-api',
        'environment': 'development',
        'port': 8000,
    }


def test_preflight_request_allows_frontend_origin() -> None:
    client = TestClient(app)

    response = client.options(
        '/api/projects',
        headers={
            'Origin': 'http://127.0.0.1:5173',
            'Access-Control-Request-Method': 'GET',
        },
    )

    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'http://127.0.0.1:5173'
    assert 'GET' in response.headers['access-control-allow-methods']


def test_recent_logs_endpoint_returns_buffered_entries() -> None:
    client = TestClient(app)

    app.state.log_buffer.clear()
    app.state.log_buffer.append('INFO boot complete')
    app.state.log_buffer.append('WARN sample warning')

    response = client.get('/api/logs/recent?limit=2')

    assert response.status_code == 200
    assert response.json() == {
        'entries': ['INFO boot complete', 'WARN sample warning'],
        'total': 2,
    }


def test_recent_logs_endpoint_honors_limit() -> None:
    client = TestClient(app)

    app.state.log_buffer.clear()
    app.state.log_buffer.extend([
        'line 1',
        'line 2',
        'line 3',
    ])

    response = client.get('/api/logs/recent?limit=2')

    assert response.status_code == 200
    assert response.json() == {
        'entries': ['line 2', 'line 3'],
        'total': 3,
    }
