import pytest
from fastapi.testclient import TestClient

from app import main
from app.material_insights import (
    MaterialInsightsService,
    derive_effect_tags,
    normalize_effect_metrics,
)
from app.material_models import (
    MaterialAssetType,
    MaterialLibraryType,
    MaterialStatus,
    MaterialTagCategory,
    MaterialTagSource,
)
from app.material_search import RecallCandidate, deterministic_rerank
from app.material_storage import MaterialStorage
from app.storage import JsonRepository


@pytest.fixture()
def api_client(monkeypatch, tmp_path):
    repository = JsonRepository(str(tmp_path / "storage"))
    monkeypatch.setattr(main, "repository", repository)
    monkeypatch.setattr(main.settings, "ark_api_key", "")
    monkeypatch.delenv("VIKINGDB_API_KEY", raising=False)
    return TestClient(main.app)


@pytest.fixture()
def material_storage(tmp_path):
    return MaterialStorage(JsonRepository(str(tmp_path / "storage")))


def create_searchable_material(
    storage: MaterialStorage,
    *,
    title: str,
    library_type: MaterialLibraryType = MaterialLibraryType.FINISHED,
    description: str | None = None,
):
    material = storage.create_material(
        asset_type=MaterialAssetType.VIDEO,
        library_type=library_type,
        title=title,
        description=description or f"{title} launch creative",
        source_uri=f"https://example.test/{title.casefold().replace(' ', '-')}.mp4",
    )
    storage.update_status(material.id, MaterialStatus.PREPROCESSED)
    storage.update_status(material.id, MaterialStatus.TAGGED)
    storage.update_status(material.id, MaterialStatus.INDEXED)
    return storage.update_status(material.id, MaterialStatus.SEARCHABLE)


def test_normalize_effect_metrics_derives_ctr_and_cvr():
    metrics = normalize_effect_metrics(
        {
            "impressions": 1000,
            "clicks": 120,
            "conversions": 18,
            "ctr": None,
            "cvr": None,
        }
    )

    assert metrics["impressions"] == 1000.0
    assert metrics["clicks"] == 120.0
    assert metrics["conversions"] == 18.0
    assert metrics["ctr"] == 0.12
    assert metrics["cvr"] == 0.15
    assert derive_effect_tags(metrics) == ["high_ctr", "high_cvr", "high_conversion"]


def test_record_effects_updates_metrics_tags_and_creates_finished_insight(material_storage):
    material = create_searchable_material(
        material_storage,
        title="High converting launch film",
        description="Premium city launch film with a clear CTA",
    )

    result = MaterialInsightsService(material_storage).record_effects(
        material.id,
        impressions=1000,
        clicks=120,
        conversions=18,
        actor="ads-ops",
    )

    loaded = material_storage.material(material.id)
    tags = material_storage.list_tags(material.id)
    insights = material_storage.list_insights()
    assert loaded is not None
    assert loaded.effect_metrics["ctr"] == 0.12
    assert loaded.effect_metrics["cvr"] == 0.15
    assert result.effect_tags == ["high_ctr", "high_cvr", "high_conversion"]
    assert {tag.name for tag in tags if tag.category == MaterialTagCategory.EFFECT} == {
        "high_ctr",
        "high_cvr",
        "high_conversion",
    }
    assert any(
        tag.category == MaterialTagCategory.MANAGEMENT
        and tag.name == "performance_tier"
        and tag.value == "high_ctr"
        and tag.source == MaterialTagSource.SYSTEM
        for tag in tags
    )
    assert len(insights) == 1
    assert result.insight is not None
    assert insights[0].id == result.insight.id
    assert insights[0].material_id == material.id
    assert "method" not in insights[0].prompt.casefold()
    assert insights[0].method
    assert insights[0].script_template
    assert insights[0].prompt


def test_record_effects_does_not_create_insight_for_raw_material(material_storage):
    material = create_searchable_material(
        material_storage,
        title="Raw city footage",
        library_type=MaterialLibraryType.RAW,
    )

    result = MaterialInsightsService(material_storage).record_effects(
        material.id,
        impressions=1000,
        clicks=120,
        conversions=18,
    )

    assert result.insight is None
    assert material_storage.list_insights() == []


def test_deterministic_rerank_boosts_finished_material_with_strong_effects(material_storage):
    strong = create_searchable_material(material_storage, title="Strong finished launch")
    weak = create_searchable_material(material_storage, title="Weak finished launch")
    MaterialInsightsService(material_storage).record_effects(
        strong.id,
        impressions=1000,
        clicks=120,
        conversions=18,
    )
    strong_with_metrics = material_storage.material(strong.id)
    weak_with_metrics = material_storage.material(weak.id)
    assert strong_with_metrics is not None
    assert weak_with_metrics is not None

    reranked = deterministic_rerank(
        [
            RecallCandidate(material=weak_with_metrics, vector_score=0.7, scalar_score=0.3, matched_tags=["launch"]),
            RecallCandidate(material=strong_with_metrics, vector_score=0.7, scalar_score=0.3, matched_tags=["launch"]),
        ]
    )

    assert [candidate.material.id for candidate in reranked] == [strong.id, weak.id]


def test_effects_api_updates_material_and_insights_endpoint_returns_created_insight(api_client):
    storage = MaterialStorage(main.repository)
    material = create_searchable_material(
        storage,
        title="API high performance film",
        description="Launch film with strong offer and CTA",
    )

    response = api_client.post(
        "/api/materials/effects",
        json={
            "material_id": str(material.id),
            "impressions": 2000,
            "clicks": 220,
            "conversions": 44,
            "actor": "ads-ops",
        },
    )
    insights_response = api_client.get("/api/materials/insights")

    assert response.status_code == 200
    payload = response.json()
    assert payload["material"]["id"] == str(material.id)
    assert payload["metrics"]["ctr"] == 0.11
    assert payload["metrics"]["cvr"] == 0.2
    assert payload["effect_tags"] == ["high_ctr", "high_cvr", "high_conversion"]
    assert payload["insight"]["material_id"] == str(material.id)
    assert insights_response.status_code == 200
    insights = insights_response.json()["insights"]
    assert len(insights) == 1
    assert insights[0]["material_id"] == str(material.id)
    assert insights[0]["method"]
    assert insights[0]["script_template"]
    assert insights[0]["prompt"]
