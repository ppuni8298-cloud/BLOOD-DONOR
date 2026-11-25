"""Routes package initialization."""
from .health import health_bp
from .auth_routes import auth_bp
from .emergency_routes import emergency_bp
from .donor_routes import donor_bp
from .patient_routes import patient_bp
from .matching_routes import matching_bp
from .facility_routes import facility_bp
from .admin_routes import admin_bp

__all__ = [
    "health_bp",
    "auth_bp",
    "emergency_bp",
    "donor_bp",
    "patient_bp",
    "matching_bp",
    "facility_bp",
    "admin_bp"
]
