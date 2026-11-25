# BloodLink – Operational Troubleshooting Guide

This guide covers common development, deployment, and operational issues encountered in the BloodLink ecosystem, along with step-by-step diagnostic and remediation instructions.

---

## 1. Authentication & Session Issues

### Symptom: `Auth session missing` or redirected to `auth.html` repeatedly
- **Root Cause**: Browser cookies or `localStorage` are blocked, or the Supabase project URL / Anon key is misconfigured.
- **Diagnostics**:
  1. Open browser DevTools &rarr; **Application** &rarr; **Local Storage**.
  2. Check for `sb-<project-ref>-auth-token`.
  3. Check console for `[BloodLink Auth] Initialization error`.
- **Fix**:
  1. Confirm [js/api/config.js](file:///c:/Users/ADMIN/OneDrive/Pictures/Desktop/BLOOD/js/api/config.js) contains your valid live Supabase URL (`https://bjsvcijupiojifrgrgle.supabase.co`) and Anon Key.
  2. If using custom credentials, call `BloodLinkConfig.setDevCredentials(url, anonKey)` in the browser console.
  3. In Supabase Dashboard &rarr; **Authentication** &rarr; **URL Configuration**, ensure `Site URL` includes `http://localhost:3000` (development) and your deployed Vercel domain (production).

---

## 2. API & CORS Errors

### Symptom: `Access to fetch at ... has been blocked by CORS policy`
- **Root Cause**: The frontend origin is not present in the backend's `CORS_ORIGINS` configuration.
- **Fix**:
  1. In `.env` (or cloud host environment variables), locate `CORS_ORIGINS`.
  2. Add your frontend origin:
     ```env
     CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000,http://127.0.0.1:3000
     ```
  3. Restart the backend service.

---

## 3. Database & SQL Migration Errors

### Symptom: `ERROR: 42P01: missing FROM-clause entry for table "old"`
- **Root Cause**: An RLS policy definition incorrectly referenced `OLD.column` inside `WITH CHECK (...)`. (PostgreSQL RLS only provides `OLD` inside trigger functions, not in RLS policies).
- **Fix**:
  Ensure you are using the updated [supabase/combined_migrations.sql](file:///c:/Users/ADMIN/OneDrive/Pictures/Desktop/BLOOD/supabase/combined_migrations.sql), where `Patients can cancel own blood requests` uses standard `USING (auth.uid() = requester_id AND status NOT IN ('fulfilled', 'cancelled'))` and `WITH CHECK (auth.uid() = requester_id AND status = 'cancelled')`.

### Symptom: `relation "public.profiles" does not exist`
- **Root Cause**: Migrations have not yet been applied to the connected Supabase instance.
- **Fix**:
  Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/bjsvcijupiojifrgrgle/sql/new), paste the contents of `supabase/combined_migrations.sql`, and click **Run**.

---

## 4. 3D WebGL Visualization Issues

### Symptom: Black viewport or 3D red blood cell canvas does not render
- **Root Cause**: The client device or virtual machine does not support hardware WebGL acceleration, or canvas initialization failed.
- **Automatic Resilience**:
  All BloodLink 3D viewports (`hero-scene.js`, `donor-3d-cell.js`, etc.) feature automatic context detection:
  - If `window.WebGLRenderingContext` is unavailable, the canvas displays a smooth, non-blocking 2D CSS pulse animation.
  - Page interactivity, tables, metrics, and buttons remain 100% accessible.
- **Fix for Developers**:
  Enable hardware acceleration in your browser settings (**chrome://settings/system** &rarr; **Use graphics acceleration when available**).

---

## 5. Rate Limiting (HTTP 429)

### Symptom: `Rate limit exceeded: Max 60 requests per 60s`
- **Root Cause**: A client IP has sent more requests than allowed by the sliding-window rate limiter in `backend/middleware/rate_limit.py`.
- **Fix**:
  1. For development, increase the threshold in `.env`:
     ```env
     RATE_LIMIT_PER_MINUTE=240
     ```
  2. During automated testing, the rate limiter automatically bypasses enforcement when `TESTING=True`.
