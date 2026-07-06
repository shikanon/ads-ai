from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import main
from app.material_models import MaterialAssetType, MaterialLibraryType, MaterialStatus, MaterialTagCategory, MaterialTagSource
from app.material_search import RecallCandidate, deterministic_rerank, fuse_candidates, parse_material_query
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


def create_searchable_material(
    storage: MaterialStorage,
    *,
    title: str,
    asset_type: MaterialAssetType = MaterialAssetType.IMAGE,
    library_type: MaterialLibraryType = MaterialLibraryType.RAW,
    description: str | None = None,
    tags: list[str] | None = None,
    source_metadata: dict[str, object] | None = None,
    effect_metrics: dict[str, float] | None = None,
):
    material = storage.create_material(
        asset_type=asset_type,
        library_type=library_type,
        title=title,
        description=description,
        source_uri=f"https://example.test/{title.casefold().replace(' ', '-')}.png",
        source_metadata=source_metadata or {},
    )
    storage.update_status(material.id, MaterialStatus.PREPROCESSED)
    storage.update_status(material.id, MaterialStatus.TAGGED)
    storage.update_status(material.id, MaterialStatus.INDEXED)
    material = storage.update_status(material.id, MaterialStatus.SEARCHABLE)
    for tag in tags or []:
        storage.upsert_tag(
            material.id,
            category=MaterialTagCategory.CONTENT,
            name=tag,
            source=MaterialTagSource.AI,
        )
    if effect_metrics:
        storage.save_effect_metrics(material.id, effect_metrics)
        material = storage.material(material.id)
    assert material is not None
    return material


def test_search_materials_returns_text_matches_with_evidence(api_client):
    storage = MaterialStorage(main.repository)
    matched = create_searchable_material(
        storage,
        title="City night launch hero",
        description="A neon city skyline for premium product launch",
        tags=["city night", "launch"],
    )
    create_searchable_material(
        storage,
        title="Forest morning lifestyle",
        description="Soft natural light with outdoor family scene",
        tags=["forest"],
    )

    response = api_client.post("/api/materials/search", json={"query": "city night launch", "top_k": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["query"]["intent"] == "search"
    assert payload["results"][0]["material"]["id"] == str(matched.id)
    assert payload["results"][0]["score"] > 0
    assert "city night" in payload["results"][0]["matched_tags"]
    assert any("title:" in item or "description:" in item for item in payload["results"][0]["evidence"])
    assert payload["answer"] is None


def test_search_materials_applies_asset_library_and_tag_filters(api_client):
    storage = MaterialStorage(main.repository)
    finished_video = create_searchable_material(
        storage,
        title="Finished launch film",
        asset_type=MaterialAssetType.VIDEO,
        library_type=MaterialLibraryType.FINISHED,
        description="Launch film with city night scene",
        tags=["approved", "city night"],
    )
    create_searchable_material(
        storage,
        title="Raw launch frame",
        asset_type=MaterialAssetType.IMAGE,
        library_type=MaterialLibraryType.RAW,
        description="Launch image with city night scene",
        tags=["city night"],
    )

    response = api_client.post(
        "/api/materials/search",
        json={
            "query": "launch city",
            "asset_types": ["video"],
            "library_types": ["finished"],
            "tags": ["approved"],
        },
    )

    assert response.status_code == 200
    results = response.json()["results"]
    assert [item["material"]["id"] for item in results] == [str(finished_video.id)]
    assert results[0]["material"]["asset_type"] == "video"
    assert results[0]["material"]["library_type"] == "finished"


def test_fuse_candidates_deduplicates_multi_recall_material_and_merges_scores(tmp_path):
    storage = MaterialStorage(JsonRepository(str(tmp_path / "storage")))
    material = create_searchable_material(storage, title="City launch", tags=["launch"])

    fused = fuse_candidates(
        [
            RecallCandidate(material=material, vector_score=0.7, evidence=["vector hit"], matched_tags=["launch"]),
            RecallCandidate(material=material, scalar_score=0.9, evidence=["scalar hit"], matched_tags=["launch"]),
        ]
    )

    assert len(fused) == 1
    assert fused[0].material.id == material.id
    assert fused[0].vector_score == 0.7
    assert fused[0].scalar_score == 0.9
    assert fused[0].evidence == ["vector hit", "scalar hit"]
    assert fused[0].matched_tags == ["launch"]


def test_deterministic_rerank_prefers_relevance_tags_and_effect_metrics(tmp_path):
    storage = MaterialStorage(JsonRepository(str(tmp_path / "storage")))
    strong = create_searchable_material(
        storage,
        title="Strong launch",
        tags=["launch", "city"],
        effect_metrics={"ctr": 0.2, "conversions": 3.0},
    )
    weak = create_searchable_material(storage, title="Weak launch", tags=["launch"])

    reranked = deterministic_rerank(
        [
            RecallCandidate(material=weak, vector_score=0.7, scalar_score=0.3, matched_tags=["launch"]),
            RecallCandidate(material=strong, vector_score=0.7, scalar_score=0.3, matched_tags=["launch", "city"]),
        ]
    )

    assert [candidate.material.id for candidate in reranked] == [strong.id, weak.id]


def test_rag_endpoint_returns_answer_shape_with_evidence_citations(api_client):
    storage = MaterialStorage(main.repository)
    material = create_searchable_material(
        storage,
        title="City launch film",
        asset_type=MaterialAssetType.VIDEO,
        library_type=MaterialLibraryType.FINISHED,
        description="A high energy city night launch film with product close ups",
        tags=["city night", "product closeup"],
    )

    response = api_client.post("/api/materials/rag", json={"query": "推荐哪些 city night launch 素材？", "top_k": 3})

    assert response.status_code == 200
    payload = response.json()
    assert payload["query"]["intent"] == "question"
    assert payload["results"][0]["material"]["id"] == str(material.id)
    assert payload["answer"]["fallback"] is True
    assert payload["answer"]["answer"]
    assert payload["answer"]["citations"]
    assert "material_id=" in payload["answer"]["answer"]


def test_query_parser_identifies_similar_and_question_intents():
    similar = parse_material_query("找一些类似 city night 的素材")
    question = parse_material_query("哪些素材适合 launch?")

    assert similar.intent == "similar"
    assert question.intent == "question"
    assert "launch" in question.terms
