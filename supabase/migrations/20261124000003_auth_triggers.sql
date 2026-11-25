-- ============================================================================
-- Migration: 20261124000003_auth_triggers.sql
-- Description: Database Triggers for Automatic User Provisioning & Audit
-- Handles Supabase Auth (auth.users) sync to profiles, roles, and donor records
-- ============================================================================

-- Function: Automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for profiles
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for donor_profiles
DROP TRIGGER IF EXISTS trigger_donor_profiles_updated_at ON public.donor_profiles;
CREATE TRIGGER trigger_donor_profiles_updated_at
    BEFORE UPDATE ON public.donor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- TRIGGER FUNCTION: Handle New User Provisioning from auth.users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_city TEXT;
    v_avatar_url TEXT;
    v_blood_group TEXT;
BEGIN
    -- Extract values safely from raw_user_meta_data
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
    v_phone := NEW.raw_user_meta_data->>'phone';
    v_city := NEW.raw_user_meta_data->>'city';
    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
    
    -- Extract and validate account_type; NEVER allow self-provisioning of 'super_admin' or 'admin'
    v_account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'donor');
    IF v_account_type NOT IN ('donor', 'patient', 'hospital', 'blood_bank') THEN
        v_account_type := 'donor'; -- Secure fallback
    END IF;

    -- 1. Insert into public.profiles
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        phone,
        avatar_url,
        account_type,
        city,
        is_verified,
        account_status
    ) VALUES (
        NEW.id,
        v_full_name,
        NEW.email,
        v_phone,
        v_avatar_url,
        v_account_type,
        v_city,
        -- Donors and Patients start as verified email holders; Organizations start pending verification
        CASE WHEN v_account_type IN ('hospital', 'blood_bank') THEN FALSE ELSE TRUE END,
        CASE WHEN v_account_type IN ('hospital', 'blood_bank') THEN 'pending_verification' ELSE 'active' END
    );

    -- 2. Insert verified initial role into public.user_roles
    INSERT INTO public.user_roles (
        user_id,
        role
    ) VALUES (
        NEW.id,
        v_account_type
    );

    -- 3. If account type is 'donor', initialize donor_profiles if blood group is provided
    v_blood_group := NEW.raw_user_meta_data->>'blood_group';
    IF v_account_type = 'donor' AND v_blood_group IS NOT NULL AND v_blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
        INSERT INTO public.donor_profiles (
            user_id,
            blood_group,
            availability_status,
            consent_to_discovery
        ) VALUES (
            NEW.id,
            v_blood_group,
            'available',
            TRUE
        ) ON CONFLICT (user_id) DO NOTHING;
    END IF;

    -- 4. Record registration in immutable audit_logs
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NEW.id,
        'USER_REGISTERED',
        'profiles',
        NEW.id::text,
        jsonb_build_object(
            'account_type', v_account_type,
            'provider', NEW.raw_app_meta_data->>'provider',
            'email', NEW.email
        )
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error to Postgres logs but do not crash the auth flow
        RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
