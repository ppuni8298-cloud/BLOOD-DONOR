# BloodLink – Environment Variables & Configuration Matrix

This document defines all configuration parameters, their purpose, required scopes, security sensitivity, and default values across Development and Production environments.

---

## 1. Environment Variable Reference

| Variable Name | Required By | Scope | Sensitive? | Purpose & Default |
| :--- | :--- | :--- | :---: | :--- |
| `SUPABASE_URL` | Frontend & Backend | Both | No | Public HTTPS URL of the Supabase project (e.g. `https://your-ref.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend (Vercel) | Frontend | No | Alias for Supabase URL in Vercel/Next hosting. |
| `SUPABASE_ANON_KEY` | Frontend & Backend | Both | No | Public anon key safe for browser client. Subject to Row Level Security. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Frontend (Vercel) | Frontend | No | Alias for public anon key in Vercel hosting. |
| `SUPABASE_PROJECT_REF` | CLI & Backend | Backend | No | Unique Supabase project identifier (e.g. `bjsvcijupiojifrgrgle`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend Only | Backend | **YES** | High-privilege key that bypasses RLS for administrative backend operations. **NEVER expose to browser**. |
| `SUPABASE_JWT_SECRET` | Backend Only | Backend | **YES** | Cryptographic secret used by Flask middleware to decode and verify Supabase Bearer JWTs. |
| `FLASK_APP` | Backend Only | Backend | No | Entrypoint factory. Default: `backend.app:create_app`. |
| `FLASK_ENV` | Backend Only | Backend | No | Environment mode: `development`, `testing`, or `production`. Default: `production`. |
| `FLASK_PORT` | Backend Only | Backend | No | Local listening port for Flask server. Default: `5000`. |
| `PORT` | Cloud Host | Backend | No | Standard port injected by Render, Railway, Cloud Run. |
| `FLASK_SECRET_KEY` | Backend Only | Backend | **YES** | Session and CSRF encryption key. Minimum 32 characters in production. |
| `CORS_ORIGINS` | Backend Only | Backend | No | Comma-separated list of allowed frontend origins (e.g. `https://bloodlink.vercel.app,http://localhost:3000`). |
| `RATE_LIMIT_PER_MINUTE` | Backend Only | Backend | No | Maximum requests allowed per IP per 60-second window. Default: `60`. |
| `NEXT_PUBLIC_FLASK_API_URL` | Frontend (Vercel) | Frontend | No | Public URL of deployed Flask backend (e.g. `https://api.bloodlink.org`). |

---

## 2. Environment Configuration Matrix

### Development (`.env` local)
```env
SUPABASE_URL=https://bjsvcijupiojifrgrgle.supabase.co
SUPABASE_ANON_KEY=sb_publishable_KuOjjBY2jKHYAWTYV5ovJg_YcvQ6rfO
SUPABASE_PROJECT_REF=bjsvcijupiojifrgrgle
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
SUPABASE_JWT_SECRET=your-supabase-jwt-secret-min-32-chars
FLASK_APP=backend.app:create_app
FLASK_ENV=development
FLASK_DEBUG=1
FLASK_PORT=5000
FLASK_SECRET_KEY=bloodlink-dev-secret-key-change-in-prod
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5000,http://127.0.0.1:5000
RATE_LIMIT_PER_MINUTE=120
```

### Production (Cloud Host: Render/Railway/AWS)
```env
SUPABASE_URL=https://your-ref.supabase.co
SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
SUPABASE_JWT_SECRET=your-production-jwt-secret-from-dashboard
FLASK_APP=backend.app:create_app
FLASK_ENV=production
FLASK_DEBUG=0
FLASK_SECRET_KEY=long-random-cryptographic-string-min-64-bytes
CORS_ORIGINS=https://bloodlink.vercel.app
RATE_LIMIT_PER_MINUTE=60
```

---

## 3. Security Rules for Secrets Management

1. **Zero Secret Leaks in Git**: The `.env` file is explicitly ignored in [.gitignore](file:///c:/Users/ADMIN/OneDrive/Pictures/Desktop/BLOOD/.gitignore). Never commit `.env` into version control.
2. **Browser Isolation**: Only variables prefixed with `NEXT_PUBLIC_` or public anon keys may be accessed in the browser. The `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` must strictly remain on server-side runtime environments.
3. **Secret Rotation**: In case of a suspected credential leak, rotate the Supabase JWT Secret in the Supabase Dashboard, update the backend environment variable, and redeploy the backend service immediately.
