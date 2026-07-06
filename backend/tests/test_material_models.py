from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.material_models import (
    MaterialAsset,
    MaterialAssetType,
    MaterialAuditEvent,
    MaterialInsight,
    MaterialLibraryType,
    MaterialSearchQuery,
    MaterialSearchResult,
    MaterialStatus,
    MaterialTag,
    MaterialTagCategory,
    MaterialTagSource,
    MaterialVectorIndex,
)


def test_material_asset_defaults_and_json_serialization():
    asset = MaterialAsset(
        asset_type=MaterialAssetType.VIDEO,
        filename="launch.mp4",
        source_metadata={"brand": "demo"},
    )

    assert asset.status == MaterialStatus.RECEIVED
    assert asset.library_type == MaterialLibraryType.RAW

    payload = asset.model_dump(mode="json")
    assert payload["id"] == str(asset.id)
    assert payload["asset_type"] == "video"
    assert payload["status"] == "received"
    assert payload["library_type"] == "raw"
    assert payload["source_metadata"] == {"brand": "demo"}
    assert isinstance(payload["created_at"], str)


def test_material_tag_validates_name_and_confidence():
    material_id = uuid4()
    tag = MaterialTag(
        material_id=material_id,
        category=MaterialTagCategory.CONTENT,
        name="  city night  ",
        confidence=0.86,
        source=MaterialTagSource.HUMAN,
    )

    assert tag.name == "city night"
    assert tag.material_id == material_id

    with pytest.raises(ValidationError):
        MaterialTag(
            material_id=material_id,
            category=MaterialTagCategory.CONTENT,
            name=" ",
        )

    with pytest.raises(ValidationError):
        MaterialTag(
            material_id=material_id,
            category=MaterialTagCategory.CONTENT,
            name="city",
            confidence=1.2,
        )


def test_material_vector_index_serializes_uuid_and_status():
    material_id = uuid4()
    index = MaterialVectorIndex(
        material_id=material_id,
        index_id="idx-1",
        collection="ad-materials",
        partition_key="brand-demo",
        vector_dim=1024,
    )

    payload = index.model_dump(mode="json")
    assert payload["material_id"] == str(material_id)
    assert payload["status"] == "pending"
    assert payload["vector_dim"] == 1024


def test_material_search_query_strips_text_and_validates_top_k():
    query = MaterialSearchQuery(
        query="  search summer drink assets  ",
        top_k=5,
        asset_types=["image"],
        library_types=["finished"],
        tags=["outdoor"],
    )

    assert query.query == "search summer drink assets"
    assert query.asset_types == [MaterialAssetType.IMAGE]
    assert query.library_types == [MaterialLibraryType.FINISHED]

    with pytest.raises(ValidationError):
        MaterialSearchQuery(query="  ")

    with pytest.raises(ValidationError):
        MaterialSearchQuery(query="valid", top_k=0)


def test_search_result_insight_and_audit_event_serialize_nested_models():
    asset = MaterialAsset(asset_type=MaterialAssetType.IMAGE, filename="hero.png")
    result = MaterialSearchResult(
        material=asset,
        score=0.91,
        vector_score=0.88,
        scalar_score=0.42,
        evidence=["tag:city"],
        matched_tags=["city"],
    )
    insight = MaterialInsight(
        material_id=asset.id,
        title="High contrast opening",
        method="Open with product close-up and city ambience.",
        script_template="Show product, reveal benefit, close on CTA.",
        prompt="A premium city night product scene",
        source_material_ids=[asset.id],
        metrics_snapshot={"ctr": 0.12},
    )
    audit_event = MaterialAuditEvent(
        material_id=asset.id,
        action="material.reviewed",
        actor="qa",
        details={"source": "unit-test"},
    )

    result_payload = result.model_dump(mode="json")
    insight_payload = insight.model_dump(mode="json")
    audit_payload = audit_event.model_dump(mode="json")

    assert result_payload["material"]["id"] == str(asset.id)
    assert result_payload["matched_tags"] == ["city"]
    assert insight_payload["material_id"] == str(asset.id)
    assert insight_payload["source_material_ids"] == [str(asset.id)]
    assert insight_payload["metrics_snapshot"] == {"ctr": 0.12}
    assert audit_payload["action"] == "material.reviewed"
    assert audit_payload["details"] == {"source": "unit-test"}
