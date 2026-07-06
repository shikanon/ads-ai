from datetime import datetime
from typing import Any
from uuid import UUID

from app.material_models import (
    MaterialAsset,
    MaterialAssetType,
    MaterialAuditAction,
    MaterialAuditEvent,
    MaterialComplianceStatus,
    MaterialCopyrightStatus,
    MaterialInsight,
    MaterialIndexStatus,
    MaterialLibraryType,
    MaterialStatus,
    MaterialTag,
    MaterialTagCategory,
    MaterialTagSource,
    MaterialVectorIndex,
)
from app.storage import JsonRepository


MATERIAL_COLLECTIONS = (
    "materials",
    "material_tags",
    "material_indexes",
    "material_effects",
    "material_insights",
    "material_audit_events",
)

STATUS_TRANSITIONS: dict[MaterialStatus, set[MaterialStatus]] = {
    MaterialStatus.RECEIVED: {
        MaterialStatus.PREPROCESSED,
        MaterialStatus.BLOCKED,
        MaterialStatus.FAILED,
    },
    MaterialStatus.PREPROCESSED: {
        MaterialStatus.TAGGED,
        MaterialStatus.BLOCKED,
        MaterialStatus.FAILED,
    },
    MaterialStatus.TAGGED: {
        MaterialStatus.INDEXED,
        MaterialStatus.BLOCKED,
        MaterialStatus.FAILED,
    },
    MaterialStatus.INDEXED: {
        MaterialStatus.SEARCHABLE,
        MaterialStatus.BLOCKED,
        MaterialStatus.FAILED,
    },
    MaterialStatus.SEARCHABLE: {
        MaterialStatus.BLOCKED,
        MaterialStatus.FAILED,
    },
    MaterialStatus.BLOCKED: {
        MaterialStatus.FAILED,
    },
    MaterialStatus.FAILED: set(),
}


class MaterialStorage:
    def __init__(self, repository: JsonRepository):
        self.repository = repository

    def create_material(
        self,
        *,
        asset_type: MaterialAssetType | str,
        library_type: MaterialLibraryType | str = MaterialLibraryType.RAW,
        actor: str | None = None,
        audit_details: dict[str, Any] | None = None,
        **asset_fields: Any,
    ) -> MaterialAsset:
        with self.repository._lock:
            state = self.repository._read_state()
            asset = MaterialAsset(
                asset_type=asset_type,
                library_type=library_type,
                **asset_fields,
            )
            state["materials"][str(asset.id)] = asset.model_dump(mode="json")
            self._append_audit_event(
                state,
                material_id=asset.id,
                action=MaterialAuditAction.CREATED,
                actor=actor,
                details=audit_details or {"status": asset.status.value},
            )
            self.repository._write_state(state)
            return asset

    def material(self, material_id: UUID) -> MaterialAsset | None:
        state = self.repository._read_state()
        item = state["materials"].get(str(material_id))
        return MaterialAsset(**item) if item else None

    def list_materials(
        self,
        *,
        status: MaterialStatus | str | None = None,
        asset_type: MaterialAssetType | str | None = None,
        library_type: MaterialLibraryType | str | None = None,
    ) -> list[MaterialAsset]:
        state = self.repository._read_state()
        items = [MaterialAsset(**item) for item in state["materials"].values()]
        if status is not None:
            status_value = MaterialStatus(status)
            items = [item for item in items if item.status == status_value]
        if asset_type is not None:
            asset_type_value = MaterialAssetType(asset_type)
            items = [item for item in items if item.asset_type == asset_type_value]
        if library_type is not None:
            library_type_value = MaterialLibraryType(library_type)
            items = [item for item in items if item.library_type == library_type_value]
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def update_status(
        self,
        material_id: UUID,
        status: MaterialStatus | str,
        *,
        actor: str | None = None,
        reason: str | None = None,
        force: bool = False,
    ) -> MaterialAsset:
        next_status = MaterialStatus(status)
        with self.repository._lock:
            state = self.repository._read_state()
            material = self._require_material(state, material_id)
            current_status = material.status
            if next_status != current_status and not force:
                allowed = STATUS_TRANSITIONS[current_status]
                if next_status not in allowed:
                    raise ValueError(f"invalid material status transition: {current_status.value}->{next_status.value}")
            material.status = next_status
            material.updated_at = datetime.utcnow()
            state["materials"][str(material.id)] = material.model_dump(mode="json")
            self._append_audit_event(
                state,
                material_id=material.id,
                action=MaterialAuditAction.STATUS_UPDATED,
                actor=actor,
                details={
                    "from": current_status.value,
                    "to": next_status.value,
                    "reason": reason,
                },
            )
            self.repository._write_state(state)
            return material

    def upsert_tag(
        self,
        material_id: UUID,
        *,
        category: MaterialTagCategory | str,
        name: str,
        value: str | None = None,
        confidence: float = 1.0,
        source: MaterialTagSource | str = MaterialTagSource.AI,
        needs_review: bool = False,
        actor: str | None = None,
    ) -> MaterialTag:
        category_value = MaterialTagCategory(category)
        source_value = MaterialTagSource(source)
        normalized_name = name.strip()
        with self.repository._lock:
            state = self.repository._read_state()
            self._require_material(state, material_id)
            existing_key = self._find_tag_key(state, material_id, category_value, normalized_name, source_value)
            now = datetime.utcnow()
            if existing_key:
                tag = MaterialTag(
                    **{
                        **state["material_tags"][existing_key],
                        "value": value,
                        "confidence": confidence,
                        "needs_review": needs_review,
                        "updated_at": now,
                    }
                )
            else:
                tag = MaterialTag(
                    material_id=material_id,
                    category=category_value,
                    name=normalized_name,
                    value=value,
                    confidence=confidence,
                    source=source_value,
                    needs_review=needs_review,
                )
                existing_key = str(tag.id)
            state["material_tags"][existing_key] = tag.model_dump(mode="json")
            self._append_audit_event(
                state,
                material_id=material_id,
                action=MaterialAuditAction.TAG_UPSERTED,
                actor=actor,
                details={
                    "tag_id": str(tag.id),
                    "category": tag.category.value,
                    "name": tag.name,
                    "source": tag.source.value,
                },
            )
            self.repository._write_state(state)
            return tag

    def list_tags(self, material_id: UUID) -> list[MaterialTag]:
        state = self.repository._read_state()
        return [
            MaterialTag(**item)
            for item in state["material_tags"].values()
            if item["material_id"] == str(material_id)
        ]

    def save_vector_index(
        self,
        material_id: UUID,
        *,
        status: MaterialIndexStatus | str,
        actor: str | None = None,
        **index_fields: Any,
    ) -> MaterialVectorIndex:
        status_value = MaterialIndexStatus(status)
        with self.repository._lock:
            state = self.repository._read_state()
            self._require_material(state, material_id)
            existing_key = self._find_index_key(state, material_id)
            if existing_key:
                index = MaterialVectorIndex(
                    **{
                        **state["material_indexes"][existing_key],
                        "status": status_value,
                        **index_fields,
                        "updated_at": datetime.utcnow(),
                    }
                )
            else:
                index = MaterialVectorIndex(material_id=material_id, status=status_value, **index_fields)
                existing_key = str(index.id)
            if index.status == MaterialIndexStatus.INDEXED and index.indexed_at is None:
                index.indexed_at = datetime.utcnow()
            state["material_indexes"][existing_key] = index.model_dump(mode="json")
            self._append_audit_event(
                state,
                material_id=material_id,
                action=MaterialAuditAction.INDEX_SAVED,
                actor=actor,
                details={"index_id": index.index_id, "status": index.status.value},
            )
            self.repository._write_state(state)
            return index

    def vector_index(self, material_id: UUID) -> MaterialVectorIndex | None:
        state = self.repository._read_state()
        key = self._find_index_key(state, material_id)
        if key is None:
            return None
        return MaterialVectorIndex(**state["material_indexes"][key])

    def save_effect_metrics(
        self,
        material_id: UUID,
        metrics: dict[str, float],
        *,
        actor: str | None = None,
    ) -> dict[str, float]:
        with self.repository._lock:
            state = self.repository._read_state()
            material = self._require_material(state, material_id)
            current = dict(state["material_effects"].get(str(material_id), {}))
            current.update(metrics)
            material.effect_metrics = current
            material.updated_at = datetime.utcnow()
            state["material_effects"][str(material_id)] = current
            state["materials"][str(material.id)] = material.model_dump(mode="json")
            self._append_audit_event(
                state,
                material_id=material_id,
                action=MaterialAuditAction.EFFECT_SAVED,
                actor=actor,
                details={"metrics": current},
            )
            self.repository._write_state(state)
            return current

    def block_material(
        self,
        material_id: UUID,
        *,
        actor: str | None = None,
        reasons: list[str] | None = None,
        matched_terms: list[str] | None = None,
        copyright_status: MaterialCopyrightStatus | str | None = None,
        compliance_status: MaterialComplianceStatus | str | None = None,
    ) -> MaterialAsset:
        with self.repository._lock:
            state = self.repository._read_state()
            material = self._require_material(state, material_id)
            previous_status = material.status
            if copyright_status is not None:
                material.copyright_status = MaterialCopyrightStatus(copyright_status)
            if compliance_status is not None:
                material.compliance_status = MaterialComplianceStatus(compliance_status)
            material.status = MaterialStatus.BLOCKED
            material.updated_at = datetime.utcnow()
            state["materials"][str(material.id)] = material.model_dump(mode="json")
            details = {
                "from": previous_status.value,
                "to": MaterialStatus.BLOCKED.value,
                "reasons": reasons or [],
                "matched_terms": matched_terms or [],
            }
            self._append_audit_event(
                state,
                material_id=material.id,
                action=MaterialAuditAction.STATUS_UPDATED,
                actor=actor,
                details=details,
            )
            self._append_audit_event(
                state,
                material_id=material.id,
                action=MaterialAuditAction.SECURITY_BLOCKED,
                actor=actor,
                details=details,
            )
            self.repository._write_state(state)
            return material

    def save_insight(
        self,
        insight: MaterialInsight,
    ) -> MaterialInsight:
        with self.repository._lock:
            state = self.repository._read_state()
            state["material_insights"][str(insight.id)] = insight.model_dump(mode="json")
            self.repository._write_state(state)
            return insight

    def list_insights(self) -> list[MaterialInsight]:
        state = self.repository._read_state()
        insights = [MaterialInsight(**item) for item in state["material_insights"].values()]
        return sorted(insights, key=lambda item: item.created_at, reverse=True)

    def append_audit_event(
        self,
        material_id: UUID,
        *,
        action: MaterialAuditAction | str,
        actor: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> MaterialAuditEvent:
        with self.repository._lock:
            state = self.repository._read_state()
            self._require_material(state, material_id)
            event = self._append_audit_event(
                state,
                material_id=material_id,
                action=action,
                actor=actor,
                details=details or {},
            )
            self.repository._write_state(state)
            return event

    def list_audit_events(self, material_id: UUID) -> list[MaterialAuditEvent]:
        state = self.repository._read_state()
        events = [
            MaterialAuditEvent(**item)
            for item in state["material_audit_events"].values()
            if item["material_id"] == str(material_id)
        ]
        return sorted(events, key=lambda item: item.created_at)

    @staticmethod
    def _require_material(state: dict[str, dict[str, Any]], material_id: UUID) -> MaterialAsset:
        item = state["materials"].get(str(material_id))
        if not item:
            raise KeyError("material_not_found")
        return MaterialAsset(**item)

    @staticmethod
    def _append_audit_event(
        state: dict[str, dict[str, Any]],
        *,
        material_id: UUID,
        action: MaterialAuditAction | str,
        actor: str | None,
        details: dict[str, Any],
    ) -> MaterialAuditEvent:
        event = MaterialAuditEvent(
            material_id=material_id,
            action=action,
            actor=actor,
            details=details,
        )
        state["material_audit_events"][str(event.id)] = event.model_dump(mode="json")
        return event

    @staticmethod
    def _find_tag_key(
        state: dict[str, dict[str, Any]],
        material_id: UUID,
        category: MaterialTagCategory,
        name: str,
        source: MaterialTagSource,
    ) -> str | None:
        for tag_id, item in state["material_tags"].items():
            if (
                item["material_id"] == str(material_id)
                and item["category"] == category.value
                and item["name"] == name
                and item["source"] == source.value
            ):
                return tag_id
        return None

    @staticmethod
    def _find_index_key(state: dict[str, dict[str, Any]], material_id: UUID) -> str | None:
        for index_id, item in state["material_indexes"].items():
            if item["material_id"] == str(material_id):
                return index_id
        return None
