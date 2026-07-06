from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.material_models import MaterialAssetType, MaterialStatus, MaterialTagCategory, MaterialTagSource
from app.material_storage import MaterialStorage
from app.material_tagging import MaterialTagSuggestion, MaterialTaggingService, aggregate_tag_suggestions
from app.storage import JsonRepository


@pytest.fixture()
def api_client(monkeypatch, tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    monkeypatch.setattr(main, "repository", repository)
    monkeypatch.setattr(main.settings, "ark_api_key", "")
    monkeypatch.setattr(main.settings, "seed_tagging_model_name", "doubao-seed-2-1-pro-260628")
    monkeypatch.setattr(main.settings, "material_tagging_low_confidence_threshold", 0.75)
    return TestClient(main.app)


class FakeSeedClient:
    api_key = "configured"

    def complete_json(self, *args, **kwargs):
        return {
            "tags": [
                {"category": "content", "name": "City Night", "value": "wide shot", "confidence": 0.62},
                {"category": "content", "name": " city night ", "value": "hero skyline", "confidence": 0.91},
                {"category": "business", "name": "Launch", "value": None, "confidence": 0.58},
            ]
        }


def test_settings_default_seed_tagging_model_and_public_config_are_safe():
    assert Settings.model_fields["seed_tagging_model_name"].default == "doubao-seed-2-1-pro-260628"

    public_config = Settings(ark_api_key="configured-marker").public_dict()

    assert public_config["ark_api_key"] == "configured"
    assert public_config["seed_tagging_model_name"] == "doubao-seed-2-1-pro-260628"
    assert "configured-marker" not in str(public_config)


def test_tag_material_api_uses_deterministic_fallback_and_advances_status(api_client):
    created = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/hero-launch.png",
            "asset_type": "image",
            "library_type": "raw",
            "source_system": "dam",
            "source_metadata": {"brand": "Demo Brand", "campaign": "Summer Launch"},
            "actor": "api",
        },
    )
    material_id = created.json()["material"]["id"]

    response = api_client.post(f"/api/materials/{material_id}/tag", json={"actor": "tagger"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["fallback"] is True
    assert payload["model_name"] == "doubao-seed-2-1-pro-260628"
    assert payload["material"]["status"] == "tagged"

    tags = payload["tags"]
    tag_names = {tag["name"] for tag in tags}
    assert {"image-asset", "library-raw", "fallback-tagging"} <= tag_names
    assert "brand-demo-brand" in tag_names
    assert all(tag["source"] == "ai" for tag in tags)
    assert any(tag["needs_review"] for tag in tags)

    storage = MaterialStorage(main.repository)
    material = storage.material(UUID(material_id))
    assert material is not None
    assert material.status == MaterialStatus.TAGGED
    status_events = [event for event in storage.list_audit_events(UUID(material_id)) if event.action == "material.status_updated"]
    assert [event.details["to"] for event in status_events] == ["preprocessed", "tagged"]


def test_seed_tagging_merges_duplicates_and_marks_low_confidence(tmp_path):
    storage = MaterialStorage(JsonRepository(str(tmp_path / "storage")))
    material = storage.create_material(
        asset_type=MaterialAssetType.VIDEO,
        filename="launch-city.mp4",
        source_metadata={"brand": "demo"},
    )
    service = MaterialTaggingService(
        storage,
        seed_client=FakeSeedClient(),
        model_name="doubao-seed-2-1-pro-260628",
        low_confidence_threshold=0.7,
    )

    result = service.tag_material(material.id, actor="worker")

    tags_by_name = {tag.name: tag for tag in result.tags}
    assert result.fallback is False
    assert len(result.tags) == 2
    assert tags_by_name["city night"].confidence == 0.91
    assert tags_by_name["city night"].value == "hero skyline"
    assert tags_by_name["city night"].needs_review is False
    assert tags_by_name["Launch"].needs_review is True
    assert all(tag.source == MaterialTagSource.AI for tag in result.tags)


def test_manual_tag_calibration_forces_human_source_and_appends_audit(api_client):
    created = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/script.md",
            "asset_type": "text",
            "title": "Launch script",
            "actor": "api",
        },
    )
    material_id = created.json()["material"]["id"]

    response = api_client.put(
        f"/api/materials/{material_id}/tags",
        json={
            "actor": "editor",
            "tags": [
                {"category": "business", "name": "launch", "value": "manual", "confidence": 0.8},
                {"category": "business", "name": " launch ", "value": "manual corrected", "confidence": 0.96},
                {"category": "management", "name": "approved", "confidence": 0.6},
            ],
        },
    )

    assert response.status_code == 200
    tags = response.json()["tags"]
    assert len(tags) == 2
    assert all(tag["source"] == "human" for tag in tags)
    assert all(tag["needs_review"] is False for tag in tags)
    launch_tag = next(tag for tag in tags if tag["name"] == "launch")
    assert launch_tag["value"] == "manual corrected"
    assert launch_tag["confidence"] == 0.96

    events = MaterialStorage(main.repository).list_audit_events(UUID(material_id))
    assert events[-1].action == "material.tags_calibrated"
    assert events[-1].details == {"tag_count": 2, "source": "human"}


def test_aggregate_tag_suggestions_keeps_highest_confidence_per_category_and_name():
    merged = aggregate_tag_suggestions(
        [
            MaterialTagSuggestion(category=MaterialTagCategory.CONTENT, name="Product", confidence=0.55),
            MaterialTagSuggestion(category=MaterialTagCategory.CONTENT, name=" product ", confidence=0.82),
            MaterialTagSuggestion(category=MaterialTagCategory.BUSINESS, name="Product", confidence=0.76),
        ],
        low_confidence_threshold=0.7,
    )

    assert [(tag.category, tag.name, tag.confidence) for tag in merged] == [
        (MaterialTagCategory.BUSINESS, "Product", 0.76),
        (MaterialTagCategory.CONTENT, "product", 0.82),
    ]
