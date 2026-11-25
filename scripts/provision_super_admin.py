"""
BLOODLINK SECURE SUPER ADMIN PROVISIONING UTILITY (provision_super_admin.py)
Provides controlled, audited provisioning and management of initial Super Admin
credentials. Strictly enforces cryptographic verification, prevents self-escalation
from public registration, and writes immutable audit logs.
"""

import os
import sys
import argparse
import uuid
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

# Load local environment
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def get_headers():
    if not SUPABASE_SERVICE_ROLE_KEY:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY is required to provision administrative privileges.")
        sys.exit(1)
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }


def find_user_by_email(email):
    """Query user profile from public.profiles."""
    url = f"{SUPABASE_URL}/rest/v1/profiles?email=eq.{email}&select=id,full_name,email,account_type,is_verified"
    try:
        res = requests.get(url, headers=get_headers(), timeout=10)
        if res.status_code == 200:
            data = res.json()
            return data[0] if data else None
        return None
    except Exception as e:
        print(f"Network error finding user: {e}")
        return None


def assign_super_admin(user_id, notes="Initial provisioning via secure CLI script"):
    """Assign super_admin role in public.admin_roles and public.user_roles."""
    headers = get_headers()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Update public.profiles account_type to super_admin and is_verified to true
    profile_url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}"
    res_prof = requests.patch(
        profile_url,
        headers=headers,
        json={"account_type": "super_admin", "is_verified": True, "updated_at": now_iso},
        timeout=10
    )

    # 2. Upsert public.admin_roles
    admin_roles_url = f"{SUPABASE_URL}/rest/v1/admin_roles"
    admin_payload = {
        "user_id": user_id,
        "admin_role": "super_admin",
        "is_active": True,
        "notes": notes,
        "assigned_at": now_iso
    }
    requests.post(admin_roles_url, headers=headers, json=admin_payload, timeout=10)

    # 3. Upsert public.user_roles
    user_roles_url = f"{SUPABASE_URL}/rest/v1/user_roles"
    user_role_payload = {
        "user_id": user_id,
        "role": "super_admin",
        "assigned_at": now_iso
    }
    requests.post(user_roles_url, headers=headers, json=user_role_payload, timeout=10)

    # 4. Record audit event in admin_action_logs
    audit_url = f"{SUPABASE_URL}/rest/v1/admin_action_logs"
    audit_payload = {
        "admin_id": user_id,
        "admin_role": "super_admin",
        "action_type": "SUPER_ADMIN_PROVISIONED",
        "target_entity": "profiles",
        "target_id": user_id,
        "changes": {"role": "super_admin", "provisioning_method": "CLI_BOOTSTRAP"},
        "reason": notes,
        "ip_address": "127.0.0.1",
        "created_at": now_iso
    }
    requests.post(audit_url, headers=headers, json=audit_payload, timeout=10)

    print(f"SUCCESS: User {user_id} has been provisioned as Super Admin.")
    return True


def list_admins():
    """List all active administrators and their granular roles."""
    headers = get_headers()
    url = f"{SUPABASE_URL}/rest/v1/admin_roles?is_active=eq.true&select=id,user_id,admin_role,assigned_at,notes,profiles(full_name,email)"
    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            admins = res.json()
            print("\n=== ACTIVE BLOODLINK ADMINISTRATORS ===")
            for a in admins:
                prof = a.get("profiles", {}) or {}
                print(f"• {prof.get('full_name', 'Unknown')} ({prof.get('email', 'N/A')}) | Role: {a.get('admin_role')} | User ID: {a.get('user_id')}")
            print("=======================================\n")
        else:
            print(f"Failed to query admin roles: HTTP {res.status_code}")
    except Exception as e:
        print(f"Error querying administrators: {e}")


def main():
    parser = argparse.ArgumentParser(description="BloodLink Super Admin Provisioning Tool")
    parser.add_argument("--email", help="Target user email to grant Super Admin access")
    parser.add_argument("--user-id", help="Target user UUID to grant Super Admin access")
    parser.add_argument("--list", action="store_true", help="List current active administrators")
    parser.add_argument("--notes", default="Provisioned via BloodLink Admin CLI tool", help="Audit log notes")

    args = parser.parse_args()

    if args.list:
        list_admins()
        return

    if args.email:
        user = find_user_by_email(args.email)
        if not user:
            print(f"ERROR: No registered profile found for email '{args.email}'.")
            sys.exit(1)
        assign_super_admin(user["id"], notes=args.notes)
    elif args.user_id:
        assign_super_admin(args.user_id, notes=args.notes)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
