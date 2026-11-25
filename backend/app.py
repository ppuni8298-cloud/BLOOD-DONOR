"""
BLOODLINK BACKEND APPLICATION FACTORY (app.py)
Creates and configures the Flask REST application.
"""

import os
from flask import Flask
from flask_cors import CORS
from backend.config import config_by_name
from backend.routes.health import health_bp
from backend.routes.auth_routes import auth_bp
from backend.routes.emergency_routes import emergency_bp
from backend.routes.donor_routes import donor_bp
from backend.routes.patient_routes import patient_bp
from backend.routes.matching_routes import matching_bp
from backend.routes.facility_routes import facility_bp
from backend.routes.admin_routes import admin_bp
from backend.utils.response import error_response


def create_app(config_name=None):
    """
    Application factory pattern.
    """
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    config_class = config_by_name.get(config_name, config_by_name["development"])
    app.config.from_object(config_class)

    # Initialize CORS with explicit allowlist
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", "*")}},
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        supports_credentials=True
    )

    # Register Blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(emergency_bp)
    app.register_blueprint(donor_bp)
    app.register_blueprint(patient_bp)
    app.register_blueprint(matching_bp)
    app.register_blueprint(facility_bp)
    app.register_blueprint(admin_bp)

    # Security Headers Middleware
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not app.config.get("DEBUG", False):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # Global Error Handlers
    @app.errorhandler(400)
    def bad_request(e):
        return error_response(message="Bad Request", status_code=400, code="BAD_REQUEST")

    @app.errorhandler(404)
    def not_found(e):
        return error_response(message="API route not found", status_code=404, code="NOT_FOUND")

    @app.errorhandler(405)
    def method_not_allowed(e):
        return error_response(message="HTTP Method not allowed on this endpoint", status_code=405, code="METHOD_NOT_ALLOWED")

    @app.errorhandler(500)
    def internal_error(e):
        app.logger.error(f"Internal server error: {e}")
        return error_response(message="An internal server error occurred.", status_code=500, code="INTERNAL_SERVER_ERROR")

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("FLASK_PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=app.config.get("DEBUG", True))
