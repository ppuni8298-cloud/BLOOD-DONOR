"""
Standardized API Response formatting for BloodLink Backend.
"""

from flask import jsonify


def success_response(data=None, message="Success", status_code=200):
    """
    Standard successful JSON response structure.
    """
    payload = {
        "status": "success",
        "message": message,
        "data": data if data is not None else {}
    }
    return jsonify(payload), status_code


def error_response(message="An error occurred", status_code=400, details=None, code=None):
    """
    Standard error JSON response structure.
    """
    payload = {
        "status": "error",
        "message": message,
        "code": code or f"ERR_{status_code}"
    }
    if details is not None:
        payload["details"] = details
    return jsonify(payload), status_code
