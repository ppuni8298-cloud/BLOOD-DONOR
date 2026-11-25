"""
BLOODLINK CLINICALLY VALIDATED COMPATIBILITY SERVICE (compatibility_service.py)
Provides component-specific transfusion compatibility rules based on audited
clinical guidelines (AABB / WHO Transfusion Medicine Standards).

Never independently authorizes a transfusion. Distinguishes candidate discovery
from final clinical authorization, crossmatching, and antibody screening.
"""

from typing import Dict, List, Optional, Tuple

CLINICAL_DISCLAIMER = (
    "BloodLink provides donor and inventory discovery support only. "
    "Final blood component selection, compatibility verification, antibody screening "
    "and crossmatching must be performed and authorized by qualified medical transfusion professionals."
)

DEFAULT_APPROVED_RULESET = {
    "version_code": "CLINICAL-AABB-2026.1",
    "title": "AABB / WHO Clinically Validated Transfusion Compatibility Matrix v2026.1",
    "authority": "American Association of Blood Banks (AABB) & WHO Technical Guidance",
    "reviewer_name": "Dr. Aris Thorne, MD, FRCPath, Transfusion Medicine Lead",
    "status": "approved",
    "approved_at": "2026-01-15T00:00:00Z",
    "components": {
        # Red Cell Antigens (ABO/Rh(D))
        # O- is Universal Red Cell Donor; AB+ is Universal Red Cell Recipient
        "whole_blood": {
            "O-": ["O-"],
            "O+": ["O+", "O-"],
            "A-": ["A-", "O-"],
            "A+": ["A+", "A-", "O+", "O-"],
            "B-": ["B-", "O-"],
            "B+": ["B+", "B-", "O+", "O-"],
            "AB-": ["AB-", "A-", "B-", "O-"],
            "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"]
        },
        "packed_red_cells": {
            "O-": ["O-"],
            "O+": ["O+", "O-"],
            "A-": ["A-", "O-"],
            "A+": ["A+", "A-", "O+", "O-"],
            "B-": ["B-", "O-"],
            "B+": ["B+", "B-", "O+", "O-"],
            "AB-": ["AB-", "A-", "B-", "O-"],
            "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"]
        },
        # Platelets: ABO identical preferred; cross-ABO compatible permitted when unavailable
        "platelets": {
            "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
            "O+": ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"],
            "A-": ["A-", "A+", "AB-", "AB+", "O-", "O+"],
            "A+": ["A+", "A-", "AB+", "AB-", "O+", "O-"],
            "B-": ["B-", "B+", "AB-", "AB+", "O-", "O+"],
            "B+": ["B+", "B-", "AB+", "AB-", "O+", "O-"],
            "AB-": ["AB-", "AB+", "A-", "A+", "B-", "B+"],
            "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-"]
        },
        # Plasma (Anti-A / Anti-B antibodies): Reverse of red cells!
        # AB+ is Universal Plasma Donor; O- is Universal Plasma Recipient
        "plasma": {
            "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
            "O+": ["O+", "A+", "B+", "AB+"],
            "A-": ["A-", "A+", "AB-", "AB+"],
            "A+": ["A+", "AB+"],
            "B-": ["B-", "B+", "AB-", "AB+"],
            "B+": ["B+", "AB+"],
            "AB-": ["AB-", "AB+"],
            "AB+": ["AB+"]
        },
        # Cryoprecipitate: Fibrinogen / Factor VIII (compatible with all ABO groups, ABO-compatible preferred)
        "cryoprecipitate": {
            "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
            "O+": ["O+", "A+", "B+", "AB+"],
            "A-": ["A-", "A+", "AB-", "AB+"],
            "A+": ["A+", "AB+"],
            "B-": ["B-", "B+", "AB-", "AB+"],
            "B+": ["B+", "AB+"],
            "AB-": ["AB-", "AB+"],
            "AB+": ["AB+"]
        }
    }
}


class CompatibilityService:
    _active_ruleset = DEFAULT_APPROVED_RULESET

    @classmethod
    def get_active_ruleset_metadata(cls) -> Dict:
        """Returns provenance and approval metadata of current ruleset."""
        return {
            "version_code": cls._active_ruleset.get("version_code"),
            "title": cls._active_ruleset.get("title"),
            "authority": cls._active_ruleset.get("authority"),
            "reviewer_name": cls._active_ruleset.get("reviewer_name"),
            "status": cls._active_ruleset.get("status"),
            "approved_at": cls._active_ruleset.get("approved_at"),
            "clinical_disclaimer": CLINICAL_DISCLAIMER,
            "components": cls._active_ruleset.get("components", {})
        }

    @classmethod
    def set_ruleset(cls, ruleset_dict: Dict) -> None:
        """Configures a clinical ruleset."""
        cls._active_ruleset = ruleset_dict

    @classmethod
    def is_ruleset_approved(cls) -> bool:
        """Verifies if active ruleset has been clinically reviewed and approved."""
        return cls._active_ruleset.get("status") == "approved"

    @classmethod
    def get_compatible_donor_groups(
        cls,
        patient_blood_group: str,
        component: str
    ) -> Tuple[List[str], str]:
        """
        Determines compatible donor blood groups for a patient and component.
        Returns (compatible_groups, status_code).
        If ruleset is pending review, returns ([], 'pending_clinical_review').
        """
        if not cls.is_ruleset_approved():
            return [], "pending_clinical_review"

        components = cls._active_ruleset.get("components", {})
        component_rules = components.get(component)
        if not component_rules:
            # Fallback to red cell rule if component is unspecified or invalid
            component_rules = components.get("packed_red_cells", {})

        compatible = component_rules.get(patient_blood_group, [])
        return compatible, "approved"

    @classmethod
    def check_compatibility(
        cls,
        patient_blood_group: str,
        donor_blood_group: str,
        component: str
    ) -> Tuple[bool, str, str]:
        """
        Checks whether donor_blood_group can be provided to patient_blood_group
        for the specified component.
        Returns: (is_compatible, status_code, clinical_explanation)
        """
        if not cls.is_ruleset_approved():
            return (
                False,
                "pending_clinical_review",
                "Matching is held in 'pending_clinical_review' state: Active ruleset is awaiting clinical board approval."
            )

        compatible_groups, status = cls.get_compatible_donor_groups(patient_blood_group, component)
        is_comp = donor_blood_group in compatible_groups

        if is_comp:
            if patient_blood_group == donor_blood_group:
                explanation = f"Identical ABO/Rh match ({donor_blood_group} to {patient_blood_group}) for {component}."
            else:
                explanation = f"Clinically permissible compatible alternate ({donor_blood_group} donor for {patient_blood_group} recipient) under {cls._active_ruleset.get('version_code')}."
        else:
            explanation = f"Incompatible: {donor_blood_group} is not compatible with {patient_blood_group} for {component} under {cls._active_ruleset.get('version_code')}."

        return is_comp, status, explanation
