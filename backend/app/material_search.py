import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.material_embedding import deterministic_vector_fallback
from app.material_models import (
    MaterialAsset,
    MaterialLibraryType,
    MaterialSearchQuery,
    MaterialSearchResult,
    MaterialStatus,
    MaterialTag,
)
from app.material_models import MaterialAuditAction
from app.material_storage import MaterialStorage
from app.seed_chat import SeedChatClient
from app.vikingdb_client import VikingDBClient


RAG_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "answer": {"type": "string"},
        "citations": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["answer", "citations"],
}

RAG_SYSTEM_PROMPT = """You are an advertising material library assistant.
Answer only from the provided material evidence. Return concise JSON with answer and citations."""


class ParsedMaterialQuery(BaseModel):
    intent: str
    terms: list[str]
    normalized_query: str


class MaterialRagAnswer(BaseModel):
    answer: str
    citations: list[str] = Field(default_factory=list)
    fallback: bool = True


class MaterialSearchResponse(BaseModel):
    query: ParsedMaterialQuery
    results: list[MaterialSearchResult]
    answer: MaterialRagAnswer | None = None


@dataclass
class RecallCandidate:
    material: MaterialAsset
    vector_score: float | None = None
    scalar_score: float | None = None
    evidence: list[str] | None = None
    matched_tags: list[str] | None = None


class MaterialSearchService:
    def __init__(
        self,
        storage: MaterialStorage,
        *,
        vikingdb_client: VikingDBClient,
        seed_client: SeedChatClient | None,
        embedding_model: str,
        embedding_model_version: str,
        vector_dim: int,
    ):
        self.storage = storage
        self.vikingdb_client = vikingdb_client
        self.seed_client = seed_client
        self.embedding_model = embedding_model
        self.embedding_model_version = embedding_model_version
        self.vector_dim = vector_dim

    def search(self, query: MaterialSearchQuery) -> MaterialSearchResponse:
        parsed = parse_material_query(query.query)
        vector_candidates = self._vector_recall(query, parsed)
        scalar_candidates = self._scalar_recall(query, parsed)
        fused = fuse_candidates([*vector_candidates, *scalar_candidates])
        reranked = deterministic_rerank(fused)[: query.top_k]
        results = [candidate_to_result(candidate) for candidate in reranked]
        self._audit_search(query, results)
        answer = self.answer(query, results, parsed=parsed) if query.enable_rag else None
        return MaterialSearchResponse(query=parsed, results=results, answer=answer)

    def answer(
        self,
        query: MaterialSearchQuery,
        results: list[MaterialSearchResult],
        *,
        parsed: ParsedMaterialQuery | None = None,
    ) -> MaterialRagAnswer:
        parsed_query = parsed or parse_material_query(query.query)
        evidence_items = build_rag_evidence(results[: min(len(results), 5)])
        if self.seed_client and self.seed_client.api_key and evidence_items:
            payload = self.seed_client.complete_json(
                RAG_SYSTEM_PROMPT,
                build_rag_prompt(query.query, evidence_items),
                files=[],
                response_schema=RAG_RESPONSE_SCHEMA,
                schema_name="material_rag_answer",
            )
            answer = payload.get("answer")
            citations = payload.get("citations")
            if isinstance(answer, str) and isinstance(citations, list):
                return MaterialRagAnswer(
                    answer=answer,
                    citations=[str(item) for item in citations],
                    fallback=False,
                )
        return deterministic_rag_fallback(parsed_query, evidence_items)

    def _vector_recall(
        self,
        query: MaterialSearchQuery,
        parsed: ParsedMaterialQuery,
    ) -> list[RecallCandidate]:
        query_vector = deterministic_vector_fallback(
            {
                "model": self.embedding_model,
                "model_version": self.embedding_model_version,
                "query": parsed.normalized_query,
                "terms": parsed.terms,
            },
            self.vector_dim,
        )
        filters = build_vikingdb_filters(query)
        response = self.vikingdb_client.hybrid_search(
            query_text=query.query,
            query_vector=query_vector,
            top_k=query.top_k,
            filters=filters,
        )
        remote_candidates = self._candidates_from_vikingdb_response(response)
        if remote_candidates:
            return [
                candidate
                for candidate in remote_candidates
                if material_visible_for_search(candidate.material, query)
                and material_matches_query_filters(candidate.material, query, self.storage.list_tags(candidate.material.id))
            ]
        return self._local_vector_recall(query, parsed)

    def _local_vector_recall(
        self,
        query: MaterialSearchQuery,
        parsed: ParsedMaterialQuery,
    ) -> list[RecallCandidate]:
        candidates: list[RecallCandidate] = []
        for material in self._searchable_materials(query):
            tags = self.storage.list_tags(material.id)
            if not material_matches_query_filters(material, query, tags):
                continue
            text, fields = material_search_text(material, tags)
            score = text_similarity(parsed.terms, text)
            if score <= 0:
                continue
            evidence = evidence_for_terms(parsed.terms, fields)
            matched_tags = matched_tag_names(parsed.terms, tags)
            candidates.append(
                RecallCandidate(
                    material=material,
                    vector_score=round(min(1.0, score * 0.82), 6),
                    evidence=evidence or [material_summary(material, tags)],
                    matched_tags=matched_tags,
                )
            )
        return candidates

    def _scalar_recall(
        self,
        query: MaterialSearchQuery,
        parsed: ParsedMaterialQuery,
    ) -> list[RecallCandidate]:
        candidates: list[RecallCandidate] = []
        for material in self._searchable_materials(query):
            tags = self.storage.list_tags(material.id)
            if not material_matches_query_filters(material, query, tags):
                continue
            _, fields = material_search_text(material, tags)
            score = scalar_match_score(parsed.terms, fields, tags)
            if score <= 0:
                continue
            candidates.append(
                RecallCandidate(
                    material=material,
                    scalar_score=score,
                    evidence=evidence_for_terms(parsed.terms, fields),
                    matched_tags=matched_tag_names([*parsed.terms, *query.tags], tags),
                )
            )
        return candidates

    def _searchable_materials(self, query: MaterialSearchQuery) -> list[MaterialAsset]:
        materials = self.storage.list_materials()
        return [item for item in materials if material_visible_for_search(item, query)]

    def _candidates_from_vikingdb_response(self, response: dict[str, Any]) -> list[RecallCandidate]:
        if response.get("fallback"):
            return []
        raw_results = response.get("results") or response.get("data") or []
        if not isinstance(raw_results, list):
            return []
        candidates: list[RecallCandidate] = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            material_id = metadata.get("material_id") or item.get("material_id") or item.get("id")
            try:
                material = self.storage.material(UUID(str(material_id)))
            except (TypeError, ValueError):
                material = None
            if material is None:
                continue
            score = item.get("score", item.get("similarity", 0))
            candidates.append(
                RecallCandidate(
                    material=material,
                    vector_score=float(score) if isinstance(score, int | float) else 0.0,
                    evidence=[str(item) for item in item.get("evidence", []) if item],
                )
            )
        return candidates

    def _audit_search(self, query: MaterialSearchQuery, results: list[MaterialSearchResult]) -> None:
        for result in results:
            self.storage.append_audit_event(
                result.material.id,
                action=MaterialAuditAction.SEARCH_PERFORMED,
                actor=query.actor,
                details={
                    "query": query.query,
                    "include_blocked": query.include_blocked,
                    "score": result.score,
                },
            )


def parse_material_query(query: str) -> ParsedMaterialQuery:
    normalized = " ".join(query.casefold().split())
    intent = "search"
    if re.search(r"\b(similar|like)\b|相似|类似|同款", normalized):
        intent = "similar"
    if "?" in query or "？" in query or re.search(r"\b(why|how|what|which|recommend)\b|为什么|如何|哪些|推荐|怎么", normalized):
        intent = "question"
    terms = [term for term in re.findall(r"[\w\u4e00-\u9fff]+", normalized) if len(term) > 1]
    return ParsedMaterialQuery(intent=intent, terms=terms, normalized_query=normalized)


def build_vikingdb_filters(query: MaterialSearchQuery) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if query.asset_types:
        filters["asset_type"] = [item.value for item in query.asset_types]
    if query.library_types:
        filters["library_type"] = [item.value for item in query.library_types]
    if query.tags:
        filters["tags"] = query.tags
    if not query.include_blocked:
        filters["status"] = MaterialStatus.SEARCHABLE.value
    return filters


def material_matches_query_filters(material: MaterialAsset, query: MaterialSearchQuery, tags: list[MaterialTag]) -> bool:
    if query.asset_types and material.asset_type not in query.asset_types:
        return False
    if query.library_types and material.library_type not in query.library_types:
        return False
    if query.tags:
        material_tags = {tag.name.casefold() for tag in tags}
        requested_tags = {tag.casefold().strip() for tag in query.tags if tag.strip()}
        if not requested_tags <= material_tags:
            return False
    return True


def material_visible_for_search(material: MaterialAsset, query: MaterialSearchQuery) -> bool:
    if query.include_blocked:
        return material.status in {MaterialStatus.SEARCHABLE, MaterialStatus.BLOCKED}
    return material.status == MaterialStatus.SEARCHABLE


def fuse_candidates(candidates: list[RecallCandidate]) -> list[RecallCandidate]:
    fused: dict[UUID, RecallCandidate] = {}
    for candidate in candidates:
        current = fused.get(candidate.material.id)
        if current is None:
            fused[candidate.material.id] = RecallCandidate(
                material=candidate.material,
                vector_score=candidate.vector_score,
                scalar_score=candidate.scalar_score,
                evidence=list(candidate.evidence or []),
                matched_tags=list(candidate.matched_tags or []),
            )
            continue
        current.vector_score = max_optional(current.vector_score, candidate.vector_score)
        current.scalar_score = max_optional(current.scalar_score, candidate.scalar_score)
        current.evidence = stable_unique([*(current.evidence or []), *(candidate.evidence or [])])
        current.matched_tags = stable_unique([*(current.matched_tags or []), *(candidate.matched_tags or [])])
    return list(fused.values())


def deterministic_rerank(candidates: list[RecallCandidate]) -> list[RecallCandidate]:
    return sorted(
        candidates,
        key=lambda candidate: (
            -combined_score(candidate),
            -len(candidate.matched_tags or []),
            -effect_boost(candidate.material),
            candidate.material.created_at.isoformat(),
            str(candidate.material.id),
        ),
    )


def candidate_to_result(candidate: RecallCandidate) -> MaterialSearchResult:
    return MaterialSearchResult(
        material=candidate.material,
        score=round(combined_score(candidate), 6),
        vector_score=candidate.vector_score,
        scalar_score=candidate.scalar_score,
        evidence=stable_unique(candidate.evidence or []),
        matched_tags=stable_unique(candidate.matched_tags or []),
    )


def combined_score(candidate: RecallCandidate) -> float:
    vector = candidate.vector_score or 0.0
    scalar = candidate.scalar_score or 0.0
    tag_boost = min(0.12, 0.03 * len(candidate.matched_tags or []))
    return min(1.0, vector * 0.58 + scalar * 0.34 + tag_boost + effect_boost(candidate.material))


def effect_boost(material: MaterialAsset) -> float:
    metrics = material.effect_metrics or {}
    ctr = float(metrics.get("ctr", 0) or 0)
    cvr = float(metrics.get("cvr", 0) or 0)
    conversions = float(metrics.get("conversion", metrics.get("conversions", 0)) or 0)
    finished_bonus = 0.03 if material.library_type == MaterialLibraryType.FINISHED and (ctr > 0 or cvr > 0 or conversions > 0) else 0.0
    return min(0.18, ctr * 0.45 + cvr * 0.55 + (0.05 if conversions > 0 else 0) + finished_bonus)


def scalar_match_score(terms: list[str], fields: dict[str, str], tags: list[MaterialTag]) -> float:
    if not terms:
        return 0.0
    weighted_hits = 0.0
    total_weight = 0.0
    field_weights = {
        "title": 1.0,
        "description": 0.82,
        "filename": 0.62,
        "source_metadata": 0.72,
        "technical_metadata": 0.36,
        "tags": 1.2,
    }
    for field_name, text in fields.items():
        weight = field_weights.get(field_name, 0.5)
        total_weight += weight
        lowered = text.casefold()
        if any(term in lowered for term in terms):
            weighted_hits += weight
    tag_names = " ".join(tag.name.casefold() for tag in tags)
    tag_hits = sum(1 for term in terms if term in tag_names)
    return round(min(1.0, (weighted_hits / max(total_weight, 1.0)) + tag_hits * 0.12), 6)


def text_similarity(terms: list[str], text: str) -> float:
    if not terms:
        return 0.0
    lowered = text.casefold()
    hits = sum(1 for term in terms if term in lowered)
    return round(hits / len(terms), 6)


def material_search_text(material: MaterialAsset, tags: list[MaterialTag]) -> tuple[str, dict[str, str]]:
    fields = {
        "title": material.title or "",
        "description": material.description or "",
        "filename": material.filename or "",
        "source_metadata": flatten_metadata(material.source_metadata),
        "technical_metadata": flatten_metadata(material.technical_metadata),
        "tags": " ".join(f"{tag.name} {tag.value or ''}" for tag in tags),
    }
    return " ".join(fields.values()), fields


def flatten_metadata(metadata: dict[str, Any]) -> str:
    values: list[str] = []
    for value in metadata.values():
        if isinstance(value, str):
            values.append(value)
        elif isinstance(value, list | tuple | set):
            values.extend(str(item) for item in value if item is not None)
        elif isinstance(value, dict):
            values.append(flatten_metadata(value))
        elif value is not None:
            values.append(str(value))
    return " ".join(values)


def evidence_for_terms(terms: list[str], fields: dict[str, str]) -> list[str]:
    evidence: list[str] = []
    for field_name, text in fields.items():
        if not text:
            continue
        lowered = text.casefold()
        if any(term in lowered for term in terms):
            evidence.append(f"{field_name}: {truncate_text(text, 120)}")
    return stable_unique(evidence)


def matched_tag_names(terms: list[str], tags: list[MaterialTag]) -> list[str]:
    normalized_terms = [term.casefold() for term in terms if term]
    matched: list[str] = []
    for tag in tags:
        haystack = f"{tag.name} {tag.value or ''}".casefold()
        if any(term in haystack for term in normalized_terms):
            matched.append(tag.name)
    return stable_unique(matched)


def material_summary(material: MaterialAsset, tags: list[MaterialTag]) -> str:
    parts = [
        material.title or material.filename or str(material.id),
        material.description or "",
        "tags=" + ", ".join(tag.name for tag in tags[:5]) if tags else "",
    ]
    return " | ".join(part for part in parts if part)


def build_rag_evidence(results: list[MaterialSearchResult]) -> list[str]:
    evidence: list[str] = []
    for index, result in enumerate(results, start=1):
        material = result.material
        snippets = result.evidence or [material.title or material.filename or str(material.id)]
        evidence.append(
            f"[{index}] material_id={material.id}; title={material.title or material.filename or 'untitled'}; "
            f"score={result.score}; evidence={'; '.join(snippets[:3])}"
        )
    return evidence


def build_rag_prompt(query: str, evidence_items: list[str]) -> str:
    return "Question:\n" + query + "\n\nMaterial evidence:\n" + "\n".join(evidence_items)


def deterministic_rag_fallback(parsed: ParsedMaterialQuery, evidence_items: list[str]) -> MaterialRagAnswer:
    if not evidence_items:
        return MaterialRagAnswer(
            answer="未找到足够的素材证据，无法生成可靠回答。",
            citations=[],
            fallback=True,
        )
    citations = [item.split(";", 1)[0].strip("[]") for item in evidence_items]
    answer = (
        f"基于 {len(evidence_items)} 条素材证据，建议优先查看与“{parsed.normalized_query}”最相关的素材；"
        f"主要依据包括：{'; '.join(evidence_items[:2])}"
    )
    return MaterialRagAnswer(answer=answer, citations=citations, fallback=True)


def stable_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for item in items:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def max_optional(first: float | None, second: float | None) -> float | None:
    if first is None:
        return second
    if second is None:
        return first
    return max(first, second)


def truncate_text(text: str, limit: int) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1] + "..."
