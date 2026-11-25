"""
TEST SUITE: SUPABASE JWT VERIFICATION MIDDLEWARE & GET /api/v1/me
"""

import time
import jwt


def test_me_without_auth_header(client):
    """Missing auth header must return 401."""
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    data = response.get_json()
    assert data["status"] == "error"
    assert data["code"] == "AUTH_HEADER_MISSING"


def test_me_with_malformed_header(client):
    """Malformed auth header must return 401."""
    response = client.get("/api/v1/me", headers={"Authorization": "Basic 12345"})
    assert response.status_code == 401
    data = response.get_json()
    assert data["code"] == "AUTH_HEADER_INVALID"


def test_me_with_invalid_signature(client, generate_jwt):
    """Token signed with wrong key must return 401."""
    wrong_secret = "completely-wrong-secret-key-32-chars-long"
    payload = {
        "sub": "user-123",
        "email": "hacker@test.com",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600
    }
    invalid_token = jwt.encode(payload, wrong_secret, algorithm="HS256")

    response = client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {invalid_token}"}
    )
    assert response.status_code == 401
    assert response.get_json()["code"] == "TOKEN_INVALID"


def test_me_with_expired_token(client, app):
    """Expired token must return 401."""
    secret = app.config["SUPABASE_JWT_SECRET"]
    now = int(time.time())
    expired_payload = {
        "sub": "user-123",
        "email": "expired@test.com",
        "aud": "authenticated",
        "iat": now - 7200,
        "exp": now - 3600  # Expired 1 hour ago
    }
    expired_token = jwt.encode(expired_payload, secret, algorithm="HS256")

    response = client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == 401
    assert response.get_json()["code"] == "TOKEN_EXPIRED"


def test_me_with_valid_supabase_token(client, generate_jwt):
    """Valid token must succeed and return user profile."""
    valid_token = generate_jwt(
        user_id="e2b12345-6789-4abc-9def-0123456789ab",
        email="dr.elena@hospital.org",
        account_type="hospital",
        full_name="Dr. Elena Rostova"
    )

    response = client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {valid_token}"}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    user = data["data"]["user"]
    assert user["id"] == "e2b12345-6789-4abc-9def-0123456789ab"
    assert user["email"] == "dr.elena@hospital.org"
    assert user["account_type"] == "hospital"
    assert user["full_name"] == "Dr. Elena Rostova"
