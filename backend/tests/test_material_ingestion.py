from fastapi.testclient import TestClient
import pytest

from app import main
from app.material_ingestion import compute_md5, extract_image_dimensions, infer_asset_type, validate_tos_uri
from app.material_models import MaterialAssetType, MaterialTagCategory
from app.material_storage import MaterialStorage
from app.storage import JsonRepository


@pytest.fixture()
def api_client(monkeypatch, tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    monkeypatch.setattr(main, "repository", repository)
    return TestClient(main.app)


def png_bytes(width: int = 2, height: int = 3) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + width.to_bytes(4, "big") + height.to_bytes(4, "big") + b"\x08\x02\x00\x00\x00"


def test_material_upload_creates_received_asset_with_metadata_and_dedupes(api_client):
    image_data = png_bytes()

    first = api_client.post(
        "/api/materials/upload",
        files=[("files", ("hero.png", image_data, "image/png"))],
        data={"library_type": "raw", "actor": "qa"},
    )
    second = api_client.post(
        "/api/materials/upload",
        files=[("files", ("hero-copy.png", image_data, "image/png"))],
        data={"library_type": "raw", "actor": "qa"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    first_material = first.json()["materials"][0]
    second_material = second.json()["materials"][0]
    assert first_material["status"] == "received"
    assert first_material["asset_type"] == "image"
    assert first_material["md5"] == compute_md5(image_data)
    assert first_material["technical_metadata"]["width"] == 2
    assert first_material["technical_metadata"]["height"] == 3
    assert second_material["duplicate_of"] == first_material["id"]
    assert (main.repository.root / "material_uploads").exists()


def test_material_upload_rejects_unsupported_file_type(api_client):
    response = api_client.post(
        "/api/materials/upload",
        files=[("files", ("binary.bin", b"binary", "application/octet-stream"))],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSUPPORTED_MATERIAL_FILE"


def test_import_tos_uris_creates_received_remote_materials(api_client):
    response = api_client.post(
        "/api/materials/import",
        json={
            "uris": ["tos://bucket/campaign/clip.mp4", "tos://bucket/campaign/script.md"],
            "library_type": "finished",
            "source_metadata": {"campaign": "summer"},
            "actor": "importer",
        },
    )

    assert response.status_code == 200
    materials = response.json()["materials"]
    assert [item["source_uri"] for item in materials] == [
        "tos://bucket/campaign/clip.mp4",
        "tos://bucket/campaign/script.md",
    ]
    assert materials[0]["asset_type"] == "video"
    assert materials[0]["library_type"] == "finished"
    assert materials[0]["technical_metadata"]["fallback_reason"] == "remote metadata unavailable until source is fetched"
    assert materials[1]["asset_type"] == "text"


def test_import_tos_rejects_non_tos_uri(api_client):
    response = api_client.post("/api/materials/import", json={"uris": ["https://example.test/clip.mp4"]})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_TOS_URI"


def test_external_material_api_creates_material_and_business_tags(api_client):
    response = api_client.post(
        "/api/materials",
        json={
            "source_uri": "https://example.test/assets/hero.jpg",
            "asset_type": "image",
            "library_type": "raw",
            "title": "Hero visual",
            "description": "Launch campaign key visual",
            "source_system": "dam",
            "source_metadata": {"brand": "demo"},
            "business_tags": ["launch", "brand-demo"],
            "actor": "api",
        },
    )

    assert response.status_code == 200
    material = response.json()["material"]
    assert material["source_system"] == "dam"
    assert material["source_metadata"]["brand"] == "demo"
    assert material["source_metadata"]["ingestion_method"] == "external_api"

    tags = MaterialStorage(main.repository).list_tags(material["id"])
    assert {tag.name for tag in tags} == {"launch", "brand-demo"}
    assert all(tag.category == MaterialTagCategory.BUSINESS for tag in tags)


def test_material_ingestion_helpers_infer_type_and_parse_image_metadata():
    assert infer_asset_type("brief.md", "text/markdown") == MaterialAssetType.TEXT
    assert validate_tos_uri(" tos://bucket/path/source.aep ") == "tos://bucket/path/source.aep"
    assert extract_image_dimensions(png_bytes(5, 7)) == {"width": 5, "height": 7}
