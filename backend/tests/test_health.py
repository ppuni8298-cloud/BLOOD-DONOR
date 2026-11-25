"""
TEST SUITE: HEALTH CHECK ENDPOINT
"""


def test_health_check_endpoint(client):
    """
    Test GET /api/health returns 200 and standard response format.
    """
    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.get_json()
    assert data["status"] == "success"
    assert "data" in data
    assert data["data"]["service"] == "BloodLink REST API"
    assert data["data"]["status"] == "healthy"
    assert "timestamp" in data["data"]

    # Security headers verification
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert response.headers.get("X-XSS-Protection") == "1; mode=block"


def test_root_health_and_v1_endpoints(client):
    """
    Test GET /health and GET /api/v1/health aliases.
    """
    r_root = client.get("/health")
    assert r_root.status_code == 200
    assert r_root.get_json()["data"]["status"] == "healthy"

    r_v1 = client.get("/api/v1/health")
    assert r_v1.status_code == 200
    assert r_v1.get_json()["data"]["status"] == "healthy"
