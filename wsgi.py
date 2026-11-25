"""
BLOODLINK WSGI PRODUCTION ENTRYPOINT (wsgi.py)
Used by Gunicorn, uWSGI, Render, Railway, AWS ECS, DigitalOcean App Platform.

Usage:
  gunicorn --bind 0.0.0.0:$PORT --workers 4 --timeout 120 wsgi:app
"""

import os
from backend.app import create_app

# Instantiate Flask application in production mode by default
app = create_app(os.getenv("FLASK_ENV", "production"))

if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("FLASK_PORT", 5000)))
    app.run(host="0.0.0.0", port=port)
