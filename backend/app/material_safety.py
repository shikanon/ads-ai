from dataclasses import dataclass, field
from typing import Any

from app.material_models import (
    MaterialAsset,
    MaterialComplianceStatus,
    MaterialCopyrightStatus,
    MaterialTag,
)


BANNED_TERMS = {
    "banned",
    "prohibited",
    "forbidden",
    "illegal",
    "禁用词",
    "违禁",
    "赌博",
    "博彩",
    "色情",
    "暴力",
    "侵权",
}
COMPLIANCE_RISK_TERMS = {
    "compliance_risk",
    "compliance-risk",
    "合规风险",
    "高风险",
    "risk_review",
}


@dataclass(frozen=True)
class MaterialSafetyAssessment:
    should_block: bool
    reasons: list[str] = field(default_factory=list)
    matched_terms: list[str] = field(default_factory=list)
    copyright_status: MaterialCopyrightStatus | None = None
    compliance_status: MaterialComplianceStatus | None = None


def assess_material_safety(
    material: MaterialAsset,
    *,
    tags: list[MaterialTag] | None = None,
    extra_text: list[str] | None = None,
) -> MaterialSafetyAssessment:
    haystack = _material_haystack(material, tags=tags, extra_text=extra_text)
    reasons: list[str] = []
    matched_terms: list[str] = []
    copyright_status: MaterialCopyrightStatus | None = None
    compliance_status: MaterialComplianceStatus | None = None

    banned_hits = _matched_terms(haystack, BANNED_TERMS)
    if banned_hits:
        reasons.append("banned_content")
        matched_terms.extend(banned_hits)
        compliance_status = MaterialComplianceStatus.RISK

    compliance_hits = _matched_terms(haystack, COMPLIANCE_RISK_TERMS)
    if compliance_hits or material.compliance_status == MaterialComplianceStatus.RISK:
        reasons.append("compliance_risk")
        matched_terms.extend(compliance_hits)
        compliance_status = MaterialComplianceStatus.RISK

    if _explicit_copyright_unknown(material):
        reasons.append("copyright_unknown")
        copyright_status = MaterialCopyrightStatus.UNKNOWN

    if material.copyright_status == MaterialCopyrightStatus.RISK:
        reasons.append("copyright_risk")
        copyright_status = MaterialCopyrightStatus.RISK

    return MaterialSafetyAssessment(
        should_block=bool(reasons),
        reasons=_stable_unique(reasons),
        matched_terms=_stable_unique(matched_terms),
        copyright_status=copyright_status,
        compliance_status=compliance_status,
    )


def _material_haystack(
    material: MaterialAsset,
    *,
    tags: list[MaterialTag] | None,
    extra_text: list[str] | None,
) -> str:
    parts = [
        material.title,
        material.description,
        material.filename,
        material.source_uri,
        material.source_system,
        material.owner_id,
        material.brand_id,
        material.copyright_status.value,
        material.compliance_status.value,
        _flatten_metadata(material.source_metadata),
        _flatten_metadata(material.technical_metadata),
        *(extra_text or []),
    ]
    for tag in tags or []:
        parts.extend([tag.name, tag.value, tag.category.value, tag.source.value])
    return " ".join(str(part) for part in parts if part).casefold()


def _explicit_copyright_unknown(material: MaterialAsset) -> bool:
    metadata = material.source_metadata or {}
    raw_value = metadata.get("copyright_status")
    if isinstance(raw_value, str) and raw_value.casefold().strip() == MaterialCopyrightStatus.UNKNOWN.value:
        return True
    return metadata.get("copyright_unknown") is True


def _flatten_metadata(metadata: dict[str, Any]) -> str:
    values: list[str] = []
    for value in metadata.values():
        if isinstance(value, dict):
            values.append(_flatten_metadata(value))
        elif isinstance(value, list | tuple | set):
            values.extend(str(item) for item in value if item is not None)
        elif value is not None:
            values.append(str(value))
    return " ".join(values)


def _matched_terms(haystack: str, terms: set[str]) -> list[str]:
    return sorted(term for term in terms if term.casefold() in haystack)


def _stable_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
