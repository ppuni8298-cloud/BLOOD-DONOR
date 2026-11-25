"""
BLOODLINK RATE LIMITING MIDDLEWARE (rate_limit.py)
In-memory token-bucket / sliding window rate limiter per client IP.
"""

import time
from functools import wraps
from flask import request, current_app
from backend.utils.response import error_response

# In-memory storage: IP -> [timestamp1, timestamp2, ...]
_request_history = {}


def rate_limit(limit=None, window_seconds=60):
    """
    Rate limiting decorator.
    Default: Config.RATE_LIMIT_PER_MINUTE per 60 seconds per IP.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Bypass rate limit during tests
            if current_app.config.get("TESTING"):
                return f(*args, **kwargs)

            max_requests = limit or current_app.config.get("RATE_LIMIT_PER_MINUTE", 60)
            client_ip = request.remote_addr or "127.0.0.1"
            now = time.time()

            # Clean old entries
            if client_ip in _request_history:
                _request_history[client_ip] = [
                    ts for ts in _request_history[client_ip] if now - ts < window_seconds
                ]
            else:
                _request_history[client_ip] = []

            if len(_request_history[client_ip]) >= max_requests:
                return error_response(
                    message=f"Rate limit exceeded: Max {max_requests} requests per {window_seconds}s.",
                    status_code=429,
                    code="RATE_LIMIT_EXCEEDED"
                )

            _request_history[client_ip].append(now)
            return f(*args, **kwargs)

        return decorated_function

    return decorator
