# BloodLink – Production Deployment Guide

This guide details the complete deployment procedure for **BloodLink** across Vercel (Frontend), Python Hosting / Docker (Backend), and Supabase (Database & Identity).

---

## 1. Prerequisites & Required Accounts

Before beginning deployment, ensure you have:
1. A **Supabase** project created at [supabase.com](https://supabase.com).
2. A **Vercel** account for hosting the frontend application at [vercel.com](https://vercel.com).
3. A **Python hosting platform** supporting WSGI/Gunicorn (e.g. Render, Railway, AWS ECS, Fly.io, or DigitalOcean App Platform).
4. A **GitHub** repository containing this codebase.

---

## 2. Step 1: Database Setup (Supabase)

1. Open your project on the [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **SQL Editor** &rarr; **New Query**.
3. Copy the entire contents of [supabase/combined_migrations.sql](file:///c:/Users/ADMIN/OneDrive/Pictures/Desktop/BLOOD/supabase/combined_migrations.sql).
4. Paste into the editor and click **Run**.
5. Verify in **Table Editor** that all 16+ core tables (`profiles`, `blood_requests`, `facility_inventory`, etc.) are created.
6. Retrieve your credentials from **Project Settings** &rarr; **API**:
   - `Project URL` (e.g. `https://your-ref.supabase.co`)
   - `anon / public` key
   - `service_role` key (keep private for backend only)
   - `JWT Secret` (from **Project Settings** &rarr; **API** &rarr; **JWT Settings**)

---

## 3. Step 2: Backend Deployment (Python Flask / Gunicorn)

### Option A: Deploy via Render / Railway / Cloud Run
1. Connect your GitHub repository to Render/Railway.
2. Select **Web Service** with runtime: **Python 3.11+**.
3. **Build Command**:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. **Start Command**:
   ```bash
   gunicorn --bind 0.0.0.0:$PORT --workers 4 --timeout 120 wsgi:app
   ```
5. Configure Environment Variables in the hosting dashboard:
   ```env
   FLASK_ENV=production
   FLASK_SECRET_KEY=generate-a-strong-random-64-character-secret
   SUPABASE_URL=https://your-ref.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-secret-key
   SUPABASE_JWT_SECRET=your-supabase-jwt-secret-from-dashboard
   CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000
   ```
6. Deploy and verify health probe:
   ```bash
   curl https://your-backend.onrender.com/health
   # Expected: {"data":{"status":"healthy","service":"BloodLink REST API"},"status":"success"}
   ```

### Option B: Deploy with Docker
1. Build the production image:
   ```bash
   docker build -t bloodlink-backend:latest -f Dockerfile .
   ```
2. Run container:
   ```bash
   docker run -d -p 5000:5000 --env-file .env bloodlink-backend:latest
   ```

---

## 4. Step 3: Frontend Deployment (Vercel)

1. Import your GitHub repository into **Vercel**.
2. **Framework Preset**: Other (Static HTML).
3. **Root Directory**: `./` (Root directory of repository).
4. **Build Command**: Leave empty (zero build step required for static HTML/JS).
5. **Output Directory**: Leave empty (`./`).
6. Add Environment Variables in Vercel:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_FLASK_API_URL=https://your-backend.onrender.com
   ```
7. Click **Deploy**.
8. Vercel automatically applies [vercel.json](file:///c:/Users/ADMIN/OneDrive/Pictures/Desktop/BLOOD/vercel.json) security headers and clean URL routing.

---

## 5. Step 4: Post-Deployment Verification Checklist

1. [ ] **Health Endpoint**: `GET https://your-backend-url/api/v1/health` returns `healthy`.
2. [ ] **Database Connectivity**: `GET https://your-backend-url/api/health/db` returns `connected`.
3. [ ] **Frontend Loading**: Visit `https://your-frontend.vercel.app` — verify 3D red blood cell scene renders.
4. [ ] **Authentication Flow**: Register a test donor on `auth.html` and verify email confirmation.
5. [ ] **CORS Verification**: Open DevTools Console and confirm API calls from frontend to backend return 200 without CORS errors.
6. [ ] **Provision Super Admin**:
   ```bash
   python scripts/provision_super_admin.py --email your-admin@organization.org
   ```
7. [ ] **Admin Login**: Access `admin-dashboard.html` and verify the administrative telemetry and global controls.
