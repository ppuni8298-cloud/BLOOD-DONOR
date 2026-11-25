"""
BLOODLINK BACKEND CONFIGURATION (config.py)
Loads and validates environment variables for development, testing, and production.
"""

import os
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()


class Config:
    """Base Configuration."""
    ENV = os.getenv("FLASK_ENV", "production")
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "bloodlink-default-change-in-production")

    # Supabase Configuration
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "default-jwt-secret-min-32-chars-long")

    # CORS Allowlist
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5000,http://127.0.0.1:5000"
        ).split(",")
        if origin.strip()
    ]

    # Rate Limiting: Default 60 requests per minute per IP
    RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))


class DevelopmentConfig(Config):
    """Development Environment Settings."""
    DEBUG = True
    ENV = "development"


class TestingConfig(Config):
    """Testing Environment Settings."""
    TESTING = True
    DEBUG = True
    ENV = "testing"
    SUPABASE_JWT_SECRET = "test-secret-test-secret-test-secret-32"
    SUPABASE_URL = "https://mock-test.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY = "test-service-key"


class ProductionConfig(Config):
    """Production Environment Settings."""
    DEBUG = False
    ENV = "production"


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}
