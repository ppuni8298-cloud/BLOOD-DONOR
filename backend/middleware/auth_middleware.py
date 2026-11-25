"""
BLOODLINK JWT VERIFICATION MIDDLEWARE (auth_middleware.py)
Cryptographically verifies Supabase Access Tokens (Bearer JWTs)
using the Supabase JWT Secret. Sets authenticated context on Flask g.
"""

from functools import wraps
import jwt
from flask import request, current_app, g
from backend.utils.response import error_response


def require_auth(f):
    """
    Decorator to protect endpoints by verifying Supabase JWT tokens.
    Extracts user_id, email, and user_metadata into Flask g context.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization", None)

        if not auth_header:
            return error_response(
                message="Missing Authorization header. Expected Bearer token.",
                status_code=401,
                code="AUTH_HEADER_MISSING"
            )

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return error_response(
                message="Invalid Authorization format. Expected 'Bearer <token>'.",
                status_code=401,
                code="AUTH_HEADER_INVALID"
            )

        token = parts[1]
        jwt_secret = current_app.config.get("SUPABASE_JWT_SECRET")

        if not jwt_secret:
            current_app.logger.error("SUPABASE_JWT_SECRET is not configured on server.")
            return error_response(
                message="Authentication service misconfiguration.",
                status_code=500,
                code="SERVER_CONFIG_ERROR"
            )

        try:
            # Decode and cryptographically verify the JWT signature
            payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_exp": True}
            )

            # Populate request context
            g.user_id = payload.get("sub")
            g.user_email = payload.get("email")
            g.user = payload
            
            # Extract user metadata account_type
            user_meta = payload.get("user_metadata", {})
            g.account_type = user_meta.get("account_type", "donor")

            if not g.user_id:
                return error_response(
                    message="Invalid token payload: missing subject identifier.",
                    status_code=401,
                    code="TOKEN_SUBJECT_MISSING"
                )

        except jwt.ExpiredSignatureError:
            return error_response(
                message="Access token has expired. Please refresh your session.",
                status_code=401,
                code="TOKEN_EXPIRED"
            )
        except jwt.InvalidAudienceError:
            return error_response(
                message="Invalid token audience. Expected 'authenticated'.",
                status_code=401,
                code="TOKEN_AUDIENCE_INVALID"
            )
        except jwt.InvalidTokenError as e:
            return error_response(
                message=f"Invalid authentication token: {str(e)}",
                status_code=401,
                code="TOKEN_INVALID"
            )
        except Exception as e:
            current_app.logger.error(f"Unexpected token verification error: {str(e)}")
            return error_response(
                message="Token verification failed.",
                status_code=401,
                code="TOKEN_VERIFICATION_FAILED"
            )

        return f(*args, **kwargs)

    return decorated_function
