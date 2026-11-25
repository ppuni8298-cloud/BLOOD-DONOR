"""
PYTEST CONFIGURATION & FIXTURES FOR BLOODLINK BACKEND (conftest.py)
"""

import time
import jwt
import pytest
from backend.app import create_app


@pytest.fixture
def app():
    """Create testing application instance."""
    app = create_app("testing")
    yield app


@pytest.fixture
def client(app):
    """Test client fixture."""
    return app.test_client()


@pytest.fixture
def generate_jwt(app):
    """
    Helper fixture to generate cryptographically signed Supabase access tokens.
    """
    def _generator(
        user_id="test-user-uuid-1234",
        email="test@bloodlink.org",
        account_type="donor",
        full_name="Test Donor",
        expires_in=3600,
        aud="authenticated"
    ):
        secret = app.config["SUPABASE_JWT_SECRET"]
        now = int(time.time())
        payload = {
            "sub": user_id,
            "email": email,
            "aud": aud,
            "role": "authenticated",
            "iat": now,
            "exp": now + expires_in,
            "user_metadata": {
                "account_type": account_type,
                "full_name": full_name
            }
        }
        return jwt.encode(payload, secret, algorithm="HS256")

    return _generator
