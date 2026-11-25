# BloodLink — Google OAuth Integration Guide

This guide details the complete configuration required to activate **Google OAuth** login and account synchronization on BloodLink using Supabase Auth.

---

## 1. Google Cloud Console Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Google Cloud Project or select an existing one (e.g. `bloodlink-healthcare`).

---

## 2. Configure OAuth Consent Screen

1. In Google Cloud Console, navigate to **APIs & Services** -> **OAuth consent screen**.
2. Select User Type:
   - **External** (standard for public donors and patients) or **Internal** (if testing within Google Workspace).
3. Fill in the App Information:
   - **App name**: `BloodLink`
   - **User support email**: Your admin email address.
   - **App logo**: Optional.
   - **Application home page**: `http://localhost:3000` (or production URL).
   - **Application privacy policy link**: `http://localhost:3000/#faq`
4. In the **Scopes** step, add the following standard identity scopes:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
5. If in **Testing** status, add your test Google email addresses under **Test users**.

---

## 3. Create OAuth 2.0 Client Credentials

1. Navigate to **APIs & Services** -> **Credentials**.
2. Click **Create Credentials** -> **OAuth client ID**.
3. Select **Application type**: `Web application`.
4. Name: `BloodLink Web Client`.
5. **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - `http://localhost:5000`
   - `http://127.0.0.1:3000`
   - `https://your-production-domain.com`
6. **Authorized redirect URIs**:
   You must enter your Supabase project OAuth callback URI. Format:
   ```
   https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
   ```
   *(Find this in Supabase Dashboard -> Authentication -> Providers -> Google)*.
7. Click **Create** and copy:
   - **Client ID**
   - **Client Secret**

---

## 4. Configure Google Provider in Supabase

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication** -> **Providers** -> **Google**.
3. Toggle Google to **Enabled**.
4. Paste your:
   - **Client ID (for OAuth)**: from Google Cloud Console.
   - **Client Secret (for OAuth)**: from Google Cloud Console.
5. Save the configuration.

---

## 5. How Google OAuth Works in BloodLink

1. **User clicks "Continue with Google"** on `auth.html`.
2. `auth-handler.js` triggers:
   ```javascript
   supabase.auth.signInWithOAuth({
     provider: 'google',
     options: {
       redirectTo: window.location.origin + '/auth.html?oauth_callback=true'
     }
   });
   ```
3. The user authenticates securely on Google's consent screen.
4. Google redirects to Supabase callback: `https://<ref>.supabase.co/auth/v1/callback`.
5. Supabase validates the token, fires the `handle_new_user()` trigger to create a `profiles` record if first login, and redirects back to `auth.html?oauth_callback=true`.
6. `auth-handler.js` detects the authenticated session and redirects the user to their designated dashboard (`donor-dashboard.html` by default, or their assigned role).
