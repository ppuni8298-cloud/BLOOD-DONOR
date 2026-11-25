# BloodLink — Supabase Setup & Deployment Guide

This guide walks through configuring your **Supabase PostgreSQL** database and **Supabase Auth** services for the BloodLink platform.

---

## 1. Create a Supabase Project

1. Log in to [supabase.com](https://supabase.com/) and navigate to your Dashboard.
2. Click **New Project**.
3. Choose an Organization, enter a project name (e.g., `bloodlink-production`), set a strong database password, and pick the closest region to your primary users.
4. Wait approximately 2 minutes for the database cluster to provision.

---

## 2. Obtain Project Credentials

Navigate to **Project Settings** -> **API** and copy:

| Parameter | Location in Supabase Dashboard | Target in `.env` | Access Level |
|---|---|---|---|
| **Project URL** | Project Settings -> API -> Project URL | `SUPABASE_URL` | Public / Safe for browser |
| **Anon Public Key** | Project Settings -> API -> Project API Keys -> `anon` `public` | `SUPABASE_ANON_KEY` | Public / Safe for browser |
| **Service Role Secret** | Project Settings -> API -> Project API Keys -> `service_role` | `SUPABASE_SERVICE_ROLE_KEY` | **RESTRICTED TO BACKEND ONLY** |
| **JWT Secret** | Project Settings -> API -> JWT Settings -> JWT Secret | `SUPABASE_JWT_SECRET` | **RESTRICTED TO BACKEND ONLY** |

> [!CAUTION]
> Never expose the `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET` in any client-side JavaScript file (`js/`). Row Level Security (RLS) protects browser requests that use the `anon` key.

---

## 3. Apply SQL Migrations

Open the **SQL Editor** in the Supabase Dashboard and run the migration scripts in the exact sequence below:

### Step 3.1: Core Schema & Tables
Open `supabase/migrations/20261124000001_initial_schema.sql` and run it.  
This creates:
- `public.profiles` (extending `auth.users`)
- `public.user_roles`
- `public.donor_profiles`
- `public.hospitals`
- `public.blood_banks`
- `public.audit_logs`

### Step 3.2: Row Level Security (RLS)
Open `supabase/migrations/20261124000002_row_level_security.sql` and run it.  
This enables RLS on all 6 tables and establishes:
- Zero-Trust permissions for donors, hospitals, and blood banks.
- Protection against self-escalation of roles or verification status.
- Immutability of the `audit_logs` ledger.

### Step 3.3: Database Triggers
Open `supabase/migrations/20261124000003_auth_triggers.sql` and run it.  
This attaches:
- `on_auth_user_created` on `auth.users` to automatically populate `public.profiles` and `public.user_roles` upon signup.
- Automated `updated_at` timestamps for profile records.

---

## 4. Configure Supabase Auth Settings

Navigate to **Authentication** -> **URL Configuration**:

1. **Site URL**:
   - Local: `http://localhost:3000`
   - Production: `https://your-domain.com`

2. **Redirect URLs**: Add the following paths:
   - `http://localhost:3000/auth.html`
   - `http://localhost:3000/reset-password.html`
   - `http://localhost:3000/donor-dashboard.html`
   - `http://localhost:3000/patient-dashboard.html`
   - `http://localhost:3000/hospital-dashboard.html`
   - `http://localhost:3000/bloodbank-dashboard.html`
   - `https://your-domain.com/auth.html`
   - `https://your-domain.com/reset-password.html`

3. **Email Auth Settings**:
   - Navigate to **Authentication** -> **Providers** -> **Email**.
   - Enable **Confirm email** for production (can be disabled during local prototyping for immediate sign-in).

---

## 5. Connecting Frontend & Backend

1. In the project root, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Populate the parameters in `.env`.
3. To configure the browser in development without rebuilding, you can open the browser console on `auth.html` and run:
   ```javascript
   BloodLinkConfig.setDevCredentials("https://your-ref.supabase.co", "your-anon-key");
   ```
