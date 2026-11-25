"""
BLOODLINK AUDIT SERVICE (audit_service.py)
Records immutable clinical audit events to the audit_logs table.
"""

import requests
from flask import current_app


class AuditService:
    @classmethod
    def record_event(cls, actor_id, action, entity_type, entity_id=None, metadata=None):
        """
        Appends an entry to public.audit_logs.
        """
        try:
            base_url = current_app.config.get("SUPABASE_URL", "").rstrip("/")
        except (RuntimeError, AttributeError):
            base_url = ""
        if not base_url:
            try:
                current_app.logger.info(f"[Audit Log Simulated] Actor: {actor_id} Action: {action} Entity: {entity_type}")
            except Exception:
                pass
            return True

        url = f"{base_url}/rest/v1/audit_logs"
        try:
            service_key = current_app.config.get("SUPABASE_SERVICE_ROLE_KEY") or current_app.config.get("SUPABASE_ANON_KEY")
        except Exception:
            service_key = ""

        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "actor_id": str(actor_id) if actor_id else None,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
            "metadata": metadata or {}
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=5)
            return response.status_code in (200, 201)
        except Exception as e:
            current_app.logger.error(f"Failed to write audit log: {e}")
            return False
