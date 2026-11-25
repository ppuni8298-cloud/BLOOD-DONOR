"""
BLOODLINK ROLE VERIFICATION MIDDLEWARE (role_middleware.py)
Enforces Role-Based Access Control (RBAC) on protected endpoints.
Must be used after @require_auth.
"""

from functools import wraps
from flask import g
from backend.utils.response import error_response


def require_roles(allowed_roles):
    """
    Decorator to restrict endpoint access to specific account types/roles.
    Usage: @require_roles(['hospital', 'admin'])
    """
    if isinstance(allowed_roles, str):
        allowed_roles = [allowed_roles]

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            account_type = getattr(g, "account_type", None)

            if not account_type:
                return error_response(
                    message="User role context not found. Authentication required.",
                    status_code=401,
                    code="ROLE_CONTEXT_MISSING"
                )

            # Super admin always has access
            if account_type == "super_admin" or account_type == "admin":
                return f(*args, **kwargs)

            if account_type not in allowed_roles:
                return error_response(
                    message=f"Access denied: Account type '{account_type}' does not have permission for this resource.",
                    status_code=403,
                    code="FORBIDDEN_ROLE"
                )

            return f(*args, **kwargs)

        return decorated_function

    return decorator
