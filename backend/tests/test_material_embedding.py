from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.material_embedding import build_embedding_request, build_partition_key, deterministic_vector_fallback
from app.material_models import MaterialAssetType, MaterialIndexStatus, MaterialStatus, MaterialTagCategory, MaterialTagSource
from app.material_storage import MaterialStorage
from app.storage import JsonRepository
from app.vikingdb_client import VikingDBClient


@pytest.fixture()
def api_client(monkeypatch, tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    monkeypatch.setattr(main, "repository", repository)
    monkeypatch.setattr(main.settings, "material_embedding_model_name", "doubao-embedding-material-v1")
    monkeypatch.setattr(main.settings, "material_embedding_model_version", "kb-v1")
    monkeypatch.setattr(main.settings, "material_embedding_vector_dim", 8)
    monkeypatch.setattr(main.settings, "vikingdb_knowledge_base_endpoint", "")
    monkeypatch.setattr(main.settings, "vikingdb_knowledge_base_collection", "ad_materials_test")
    monkeypatch.setattr(main.settings, "vikingdb_partition_field", "brand_id")
    monkeypatch.setattr(main.settings, "vikingdb_hybrid_index_mode", "weighted_rrf")
    monkeypatch.delenv("VIKINGDB_API_KEY", raising=False)
    return TestClient(main.app)


def test_vikingdb_upsert_uses_knowledge_base_payload_shape_without_network():
    client = VikingDBClient(
        endpoint="",
        collection="ad_materials",
        api_key="",
        partition_field="brand_id",
        hybrid_index_mode="weighted_rrf",
    )

    response = client.upsert_vector(
        vector_id="material-1",
        vector=[0.1, -0.2],
        metadata={"material_id": "material-1", "embedding_model_version": "kb-v1"},
        partition_key="brand_demo",
    )

    assert response["fallback"] is True
    assert response["reason"] == "vikingdb_not_configured"
    request_payload = response["request"]
    assert request_payload["operation"] == "upsert_vector"
    assert request_payload["knowledge_base"] == {
        "collection": "ad_materials",
        "partition": {"field": "brand_id", "key": "brand_demo"},
    }
    assert request_payload["documents"] == [
        {
            "id": "material-1",
            "vector": [0.1, -0.2],
            "metadata": {"material_id": "material-1", "embedding_model_version": "kb-v1"},
        }
    ]


def test_deterministic_vector_fallback_is_stable_and_dimensioned():
    payload = {"model": "demo", "inputs": [{"type": "text", "text": "city night"}]}

    first = deterministic_vector_fallback(payload, 8)
    second = deterministic_vector_fallback({"inputs": [{"text": "city night", "type": "text"}], "model": "demo"}, 8)
    changed = deterministic_vector_fallback({"model": "demo", "inputs": [{"type": "text", "text": "forest"}]}, 8)

    assert first == second
    assert first != changed
    assert len(first) == 8
    assert all(-1 <= item <= 1 for item in first)


def test_partition_key_prefers_brand_id_then_falls_back_to_material_type(tmp_path):
    storage = MaterialStorage(JsonRepository(str(tmp_path / "storage")))
    branded = storage.create_material(
        asset_type=MaterialAssetType.IMAGE,
        source_metadata={"brand_id": "Demo Brand"},
    )
    unbranded = storage.create_material(asset_type=MaterialAssetType.VIDEO)

    assert build_partition_key(branded, "brand_id") == "brand_demo_brand"
    assert build_partition_key(unbranded, "brand_id") == "type_video"


def test_embedding_request_includes_text_image_audio_video_inputs(tmp_path):
    storage = MaterialStorage(JsonRepository(str(tmp_path / "storage")))
    material = storage.create_material(
        asset_type=MaterialAssetType.VIDEO,
        title="Launch film",
        filename="launch.mp4",
        source_uri="tos://bucket/launch.mp4",
        source_metadata={"transcript": "voice over"},
        technical_metadata={"keyframes": ["tos://bucket/frame-1.png"]},
    )
    tag = storage.upsert_tag(
        material.id,
        category=MaterialTagCategory.CONTENT,
        name="city night",
        source=MaterialTagSource.AI,
    )

    request_payload = build_embedding_request(
        material,
        [tag],
        model_name="doubao-embedding-material-v1",
        model_version="kb-v1",
    )

    assert request_payload["model"] == "doubao-embedding-material-v1"
    assert request_payload["model_version"] == "kb-v1"
    assert request_payload["asset_type"] == "video"
    assert request_payload["inputs"][0]["type"] == "text"
    assert "Launch film" in request_payload["inputs"][0]["text"]
    assert "city night" in request_payload["inputs"][0]["text"]
    assert request_payload["inputs"][1] == {
        "type": "video_keyframes",
        "uri": "tos://bucket/launch.mp4",
        "keyframes": ["tos://bucket/frame-1.png"],
    }


def test_index_material_api_saves_index_status_and_advances_to_searchable(api_client):
    created = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/hero-launch.png",
            "asset_type": "image",
            "library_type": "raw",
            "title": "Hero launch",
            "source_metadata": {"brand_id": "Demo Brand"},
            "business_tags": ["launch"],
            "actor": "api",
        },
    )
    material_id = created.json()["material"]["id"]

    response = api_client.post(f"/api/materials/{material_id}/index", json={"actor": "indexer"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["fallback"] is True
    assert payload["material"]["status"] == "searchable"
    assert payload["index"]["partition_key"] == "brand_demo_brand"
    assert payload["index"]["vector_dim"] == 8
    assert payload["index"]["embedding_model"] == "doubao-embedding-material-v1"
    assert payload["index"]["embedding_version"] == "kb-v1"
    assert payload["vikingdb_response"]["request"]["knowledge_base"]["collection"] == "ad_materials_test"

    storage = MaterialStorage(main.repository)
    index = storage.vector_index(UUID(material_id))
    assert index is not None
    assert index.status == MaterialIndexStatus.INDEXED
    assert index.embedding_version == "kb-v1"
    assert index.metadata["fallback_embedding"] is True
    assert index.metadata["vikingdb_configured"] is False
    material = storage.material(UUID(material_id))
    assert material is not None
    assert material.status == MaterialStatus.SEARCHABLE


def test_vikingdb_api_key_is_read_only_from_env_and_public_config_is_masked(monkeypatch):
    monkeypatch.setenv("VIKINGDB_API_KEY", "configured-marker")

    settings = Settings(vikingdb_api_key="constructor-marker")
    public_config = settings.public_dict()

    assert settings.vikingdb_api_key == "configured-marker"
    assert public_config["vikingdb_api_key"] == "configured"
    assert "configured-marker" not in str(public_config)
    assert "constructor-marker" not in str(public_config)


def test_index_material_rejects_blocked_material(api_client):
    created = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/risky.png",
            "asset_type": "image",
            "actor": "api",
        },
    )
    material_id = UUID(created.json()["material"]["id"])
    MaterialStorage(main.repository).update_status(material_id, MaterialStatus.BLOCKED, force=True)

    response = api_client.post(f"/api/materials/{material_id}/index", json={"actor": "indexer"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "MATERIAL_INDEX_FAILED"
