from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import main
from app.material_models import MaterialAuditAction, MaterialStatus
from app.material_storage import MaterialStorage
from app.storage import JsonRepository


@pytest.fixture()
def api_client(monkeypatch, tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    monkeypatch.setattr(main, "repository", repository)
    monkeypatch.setattr(main.settings, "ark_api_key", "")
    monkeypatch.setattr(main.settings, "material_embedding_model_name", "doubao-embedding-material-v1")
    monkeypatch.setattr(main.settings, "material_embedding_model_version", "kb-v1")
    monkeypatch.setattr(main.settings, "material_embedding_vector_dim", 8)
    monkeypatch.setattr(main.settings, "vikingdb_knowledge_base_endpoint", "")
    monkeypatch.setattr(main.settings, "vikingdb_knowledge_base_collection", "ad_materials_test")
    monkeypatch.setattr(main.settings, "vikingdb_partition_field", "brand_id")
    monkeypatch.setattr(main.settings, "vikingdb_hybrid_index_mode", "weighted_rrf")
    monkeypatch.delenv("VIKINGDB_API_KEY", raising=False)
    return TestClient(main.app)


def test_ingestion_blocks_explicit_copyright_unknown_and_preserves_permission_fields(api_client):
    response = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/launch-risk.jpg",
            "asset_type": "image",
            "title": "Launch risk visual",
            "source_metadata": {"copyright_status": "unknown"},
            "visibility": "brand",
            "owner_id": "user-123",
            "brand_id": "brand-456",
            "actor": "api",
        },
    )

    assert response.status_code == 200
    material = response.json()["material"]
    assert material["status"] == "blocked"
    assert material["copyright_status"] == "unknown"
    assert material["visibility"] == "brand"
    assert material["owner_id"] == "user-123"
    assert material["brand_id"] == "brand-456"

    events = MaterialStorage(main.repository).list_audit_events(UUID(material["id"]))
    assert [event.action for event in events] == [
        MaterialAuditAction.CREATED,
        MaterialAuditAction.STATUS_UPDATED,
        MaterialAuditAction.SECURITY_BLOCKED,
    ]
    assert events[-1].details["reasons"] == ["copyright_unknown"]


def test_blocked_material_is_hidden_by_default_and_visible_only_with_admin_filter(api_client):
    created = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/city-risk.jpg",
            "asset_type": "image",
            "title": "City risk visual",
            "description": "city night launch 禁用词",
            "actor": "api",
        },
    )
    material_id = created.json()["material"]["id"]

    normal = api_client.post("/api/materials/search", json={"query": "city night launch", "top_k": 5})
    admin = api_client.post(
        "/api/materials/search",
        json={"query": "city night launch", "top_k": 5, "include_blocked": True, "actor": "admin"},
    )

    assert normal.status_code == 200
    assert normal.json()["results"] == []
    assert admin.status_code == 200
    assert [item["material"]["id"] for item in admin.json()["results"]] == [material_id]
    assert admin.json()["results"][0]["material"]["status"] == "blocked"

    events = MaterialStorage(main.repository).list_audit_events(UUID(material_id))
    assert events[-1].action == MaterialAuditAction.SEARCH_PERFORMED
    assert events[-1].actor == "admin"
    assert events[-1].details["include_blocked"] is True


def test_human_tagging_banned_term_blocks_material_and_keeps_security_audit(api_client):
    created = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/script.md",
            "asset_type": "text",
            "title": "Launch script",
            "owner_id": "editor-1",
            "brand_id": "brand-safe",
            "actor": "api",
        },
    )
    material_id = created.json()["material"]["id"]

    response = api_client.put(
        f"/api/materials/{material_id}/tags",
        json={
            "actor": "editor",
            "tags": [
                {"category": "management", "name": "禁用词", "value": "manual review", "confidence": 1.0},
            ],
        },
    )

    assert response.status_code == 200
    material = response.json()["material"]
    assert material["status"] == MaterialStatus.BLOCKED
    assert material["owner_id"] == "editor-1"
    assert material["brand_id"] == "brand-safe"

    events = MaterialStorage(main.repository).list_audit_events(UUID(material_id))
    actions = [event.action for event in events]
    assert "material.tags_calibrated" in actions
    assert actions[-2:] == [MaterialAuditAction.STATUS_UPDATED, MaterialAuditAction.SECURITY_BLOCKED]
    assert events[-1].details["reasons"] == ["banned_content"]
