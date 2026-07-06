import json
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.material_models import (
    MaterialAssetType,
    MaterialAuditAction,
    MaterialIndexStatus,
    MaterialLibraryType,
    MaterialStatus,
    MaterialTagCategory,
    MaterialTagSource,
)
from app.material_storage import MATERIAL_COLLECTIONS, MaterialStorage
from app.storage import JsonRepository


@pytest.fixture()
def material_storage(tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    return MaterialStorage(repository)


def test_create_material_round_trip_and_initial_audit(material_storage):
    asset = material_storage.create_material(
        asset_type=MaterialAssetType.VIDEO,
        library_type=MaterialLibraryType.FINISHED,
        filename="launch.mp4",
        md5="md5-demo",
        source_metadata={"campaign": "summer"},
        actor="qa",
    )

    loaded = material_storage.material(asset.id)
    assert loaded is not None
    assert loaded.id == asset.id
    assert loaded.status == MaterialStatus.RECEIVED
    assert loaded.asset_type == MaterialAssetType.VIDEO
    assert loaded.library_type == MaterialLibraryType.FINISHED
    assert loaded.source_metadata == {"campaign": "summer"}

    events = material_storage.list_audit_events(asset.id)
    assert [event.action for event in events] == [MaterialAuditAction.CREATED]
    assert events[0].actor == "qa"


def test_json_repository_adds_material_collections_for_new_and_legacy_metadata(tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    assert set(MATERIAL_COLLECTIONS) <= set(repository._read_state())

    repository.root.mkdir(parents=True, exist_ok=True)
    repository.metadata_path.write_text(json.dumps({"projects": {}, "files": {}}), encoding="utf-8")

    state = repository._read_state()
    for collection in MATERIAL_COLLECTIONS:
        assert state[collection] == {}


def test_update_status_enforces_material_state_machine(material_storage):
    asset = material_storage.create_material(asset_type="image")

    preprocessed = material_storage.update_status(asset.id, MaterialStatus.PREPROCESSED, actor="worker")
    assert preprocessed.status == MaterialStatus.PREPROCESSED

    with pytest.raises(ValueError, match="invalid material status transition"):
        material_storage.update_status(asset.id, MaterialStatus.SEARCHABLE)

    events = material_storage.list_audit_events(asset.id)
    assert [event.action for event in events] == [
        MaterialAuditAction.CREATED,
        MaterialAuditAction.STATUS_UPDATED,
    ]
    assert events[1].details["from"] == "received"
    assert events[1].details["to"] == "preprocessed"


def test_upsert_tag_updates_existing_tag_and_appends_audit(material_storage):
    asset = material_storage.create_material(asset_type="image")

    first = material_storage.upsert_tag(
        asset.id,
        category=MaterialTagCategory.CONTENT,
        name="  city night  ",
        value="Shanghai skyline",
        confidence=0.7,
        source=MaterialTagSource.HUMAN,
        actor="editor",
    )
    second = material_storage.upsert_tag(
        asset.id,
        category=MaterialTagCategory.CONTENT,
        name="city night",
        value="Shanghai night skyline",
        confidence=0.92,
        source=MaterialTagSource.HUMAN,
        actor="editor",
    )

    tags = material_storage.list_tags(asset.id)
    assert len(tags) == 1
    assert second.id == first.id
    assert tags[0].value == "Shanghai night skyline"
    assert tags[0].confidence == 0.92

    actions = [event.action for event in material_storage.list_audit_events(asset.id)]
    assert actions == [
        MaterialAuditAction.CREATED,
        MaterialAuditAction.TAG_UPSERTED,
        MaterialAuditAction.TAG_UPSERTED,
    ]


def test_upsert_existing_tag_still_validates_fields(material_storage):
    asset = material_storage.create_material(asset_type="image")
    material_storage.upsert_tag(
        asset.id,
        category=MaterialTagCategory.CONTENT,
        name="city night",
        confidence=0.7,
    )

    with pytest.raises(ValidationError):
        material_storage.upsert_tag(
            asset.id,
            category=MaterialTagCategory.CONTENT,
            name="city night",
            confidence=1.4,
        )


def test_save_index_effects_and_manual_audit(material_storage):
    asset = material_storage.create_material(asset_type="video")

    index = material_storage.save_vector_index(
        asset.id,
        status=MaterialIndexStatus.INDEXED,
        index_id="kb-idx-1",
        collection="materials",
        partition_key="brand-demo",
        embedding_model="fallback",
        vector_dim=8,
    )
    metrics = material_storage.save_effect_metrics(asset.id, {"exposure": 1000.0, "ctr": 0.12})
    custom_event = material_storage.append_audit_event(
        asset.id,
        action="material.reviewed",
        actor="reviewer",
        details={"review_id": str(uuid4())},
    )

    loaded_index = material_storage.vector_index(asset.id)
    loaded_asset = material_storage.material(asset.id)
    assert loaded_index == index
    assert loaded_index is not None
    assert loaded_index.status == MaterialIndexStatus.INDEXED
    assert loaded_index.indexed_at is not None
    assert metrics == {"exposure": 1000.0, "ctr": 0.12}
    assert loaded_asset is not None
    assert loaded_asset.effect_metrics == metrics

    events = material_storage.list_audit_events(asset.id)
    assert events[-1].id == custom_event.id
    assert [event.action for event in events] == [
        MaterialAuditAction.CREATED,
        MaterialAuditAction.INDEX_SAVED,
        MaterialAuditAction.EFFECT_SAVED,
        "material.reviewed",
    ]


def test_update_existing_vector_index_still_validates_fields(material_storage):
    asset = material_storage.create_material(asset_type="video")
    material_storage.save_vector_index(
        asset.id,
        status=MaterialIndexStatus.PENDING,
        vector_dim=8,
    )

    with pytest.raises(ValidationError):
        material_storage.save_vector_index(
            asset.id,
            status=MaterialIndexStatus.INDEXED,
            vector_dim=0,
        )
