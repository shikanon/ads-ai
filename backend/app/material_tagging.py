from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.material_models import (
    MaterialAsset,
    MaterialStatus,
    MaterialTag,
    MaterialTagCategory,
    MaterialTagSource,
)
from app.material_safety import assess_material_safety
from app.material_storage import MaterialStorage
from app.seed_chat import SeedChatClient


class VisualTaggingInput(BaseModel):
    asset_type: str
    filename: str | None = None
    content_type: str | None = None
    technical_metadata: dict[str, Any] = Field(default_factory=dict)


class SpeechTaggingInput(BaseModel):
    transcript: str | None = None
    language: str | None = None
    duration_seconds: float | None = None


class TextTaggingInput(BaseModel):
    title: str | None = None
    description: str | None = None
    extracted_text: str | None = None


class BrandElementTaggingInput(BaseModel):
    brand_id: str | None = None
    brand_name: str | None = None
    source_system: str | None = None
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class MaterialTaggingContext(BaseModel):
    material_id: UUID
    visual: VisualTaggingInput
    speech: SpeechTaggingInput = Field(default_factory=SpeechTaggingInput)
    text: TextTaggingInput = Field(default_factory=TextTaggingInput)
    brand: BrandElementTaggingInput = Field(default_factory=BrandElementTaggingInput)


class MaterialTagSuggestion(BaseModel):
    category: MaterialTagCategory
    name: str
    value: str | None = None
    confidence: float = Field(default=1.0, ge=0, le=1)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("标签名称不能为空")
        return stripped


class MaterialTaggingResult(BaseModel):
    material: MaterialAsset
    tags: list[MaterialTag]
    model_name: str
    fallback: bool


TAGGING_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "tags": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "category": {"type": "string", "enum": ["content", "business", "management", "effect"]},
                    "name": {"type": "string"},
                    "value": {"type": ["string", "null"]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["category", "name", "value", "confidence"],
            },
        }
    },
    "required": ["tags"],
}


TAGGING_SYSTEM_PROMPT = """You are an advertising material tagging expert.
Return JSON only. Generate tags in three dimensions:
1. content tags: visual scene, object, style, speech or text semantics.
2. business tags: brand, campaign, industry, audience and asset usage.
3. effect or management tags: quality, lifecycle, review, effect potential and reusable value.
Keep tag names short, stable and suitable for retrieval."""


class MaterialTaggingService:
    def __init__(
        self,
        storage: MaterialStorage,
        *,
        seed_client: SeedChatClient | None,
        model_name: str,
        low_confidence_threshold: float,
    ):
        self.storage = storage
        self.seed_client = seed_client
        self.model_name = model_name
        self.low_confidence_threshold = low_confidence_threshold

    def tag_material(self, material_id: UUID, *, actor: str | None = None) -> MaterialTaggingResult:
        material = self.storage.material(material_id)
        if material is None:
            raise KeyError("material_not_found")
        if material.status in {MaterialStatus.BLOCKED, MaterialStatus.FAILED}:
            raise ValueError("material cannot be tagged in current status")

        context = build_tagging_context(material)
        raw_tags = self._model_tags(context)
        fallback = False
        if not raw_tags:
            raw_tags = deterministic_fallback_tags(material)
            fallback = True

        suggestions = aggregate_tag_suggestions(raw_tags, self.low_confidence_threshold)
        tags = [
            self.storage.upsert_tag(
                material.id,
                category=suggestion.category,
                name=suggestion.name,
                value=suggestion.value,
                confidence=suggestion.confidence,
                source=MaterialTagSource.AI,
                needs_review=suggestion.confidence < self.low_confidence_threshold,
                actor=actor,
            )
            for suggestion in suggestions
        ]
        blocked = self._block_if_risky(material.id, tags=tags, actor=actor)
        if blocked:
            return MaterialTaggingResult(material=blocked, tags=tags, model_name=self.model_name, fallback=fallback)
        material = self._advance_tagged_status(material, actor=actor, fallback=fallback)
        return MaterialTaggingResult(material=material, tags=tags, model_name=self.model_name, fallback=fallback)

    def apply_human_tags(
        self,
        material_id: UUID,
        tags: list[MaterialTagSuggestion],
        *,
        actor: str | None = None,
    ) -> MaterialTaggingResult:
        material = self.storage.material(material_id)
        if material is None:
            raise KeyError("material_not_found")

        suggestions = aggregate_tag_suggestions(tags, self.low_confidence_threshold)
        stored_tags = [
            self.storage.upsert_tag(
                material.id,
                category=suggestion.category,
                name=suggestion.name,
                value=suggestion.value,
                confidence=suggestion.confidence,
                source=MaterialTagSource.HUMAN,
                needs_review=False,
                actor=actor,
            )
            for suggestion in suggestions
        ]
        self.storage.append_audit_event(
            material.id,
            action="material.tags_calibrated",
            actor=actor,
            details={"tag_count": len(stored_tags), "source": MaterialTagSource.HUMAN.value},
        )
        blocked = self._block_if_risky(material.id, tags=stored_tags, actor=actor)
        if blocked:
            return MaterialTaggingResult(material=blocked, tags=stored_tags, model_name=self.model_name, fallback=False)
        return MaterialTaggingResult(material=self.storage.material(material.id) or material, tags=stored_tags, model_name=self.model_name, fallback=False)

    def _model_tags(self, context: MaterialTaggingContext) -> list[MaterialTagSuggestion]:
        if not self.seed_client or not self.seed_client.api_key:
            return []
        payload = self.seed_client.complete_json(
            TAGGING_SYSTEM_PROMPT,
            build_tagging_prompt(context),
            files=[],
            response_schema=TAGGING_RESPONSE_SCHEMA,
            schema_name="material_tagging_result",
        )
        return parse_tag_suggestions(payload.get("tags", []))

    def _advance_tagged_status(self, material: MaterialAsset, *, actor: str | None, fallback: bool) -> MaterialAsset:
        if material.status == MaterialStatus.RECEIVED:
            material = self.storage.update_status(
                material.id,
                MaterialStatus.PREPROCESSED,
                actor=actor,
                reason="material tagging preprocessing completed",
            )
        if material.status == MaterialStatus.PREPROCESSED:
            material = self.storage.update_status(
                material.id,
                MaterialStatus.TAGGED,
                actor=actor,
                reason="material ai tagging completed via fallback" if fallback else "material ai tagging completed",
            )
        return material

    def _block_if_risky(
        self,
        material_id: UUID,
        *,
        tags: list[MaterialTag],
        actor: str | None,
    ) -> MaterialAsset | None:
        material = self.storage.material(material_id)
        if material is None:
            raise KeyError("material_not_found")
        assessment = assess_material_safety(material, tags=tags)
        if not assessment.should_block:
            return None
        return self.storage.block_material(
            material.id,
            actor=actor,
            reasons=assessment.reasons,
            matched_terms=assessment.matched_terms,
            copyright_status=assessment.copyright_status,
            compliance_status=assessment.compliance_status,
        )


def build_tagging_context(material: MaterialAsset) -> MaterialTaggingContext:
    source_metadata = material.source_metadata or {}
    technical_metadata = material.technical_metadata or {}
    return MaterialTaggingContext(
        material_id=material.id,
        visual=VisualTaggingInput(
            asset_type=material.asset_type.value,
            filename=material.filename,
            content_type=material.content_type,
            technical_metadata=technical_metadata,
        ),
        speech=SpeechTaggingInput(
            transcript=_metadata_text(source_metadata, "transcript"),
            language=_metadata_text(source_metadata, "language"),
            duration_seconds=technical_metadata.get("duration_seconds"),
        ),
        text=TextTaggingInput(
            title=material.title,
            description=material.description,
            extracted_text=_metadata_text(source_metadata, "extracted_text"),
        ),
        brand=BrandElementTaggingInput(
            brand_id=_metadata_text(source_metadata, "brand_id"),
            brand_name=_metadata_text(source_metadata, "brand"),
            source_system=material.source_system,
            source_metadata=source_metadata,
        ),
    )


def build_tagging_prompt(context: MaterialTaggingContext) -> str:
    return (
        "Analyze this advertising material and return retrieval-ready tags.\n"
        f"Material ID: {context.material_id}\n"
        f"Visual input: {context.visual.model_dump(mode='json')}\n"
        f"Speech input: {context.speech.model_dump(mode='json')}\n"
        f"Text input: {context.text.model_dump(mode='json')}\n"
        f"Brand input: {context.brand.model_dump(mode='json')}"
    )


def parse_tag_suggestions(raw_items: object) -> list[MaterialTagSuggestion]:
    if not isinstance(raw_items, list):
        return []
    suggestions: list[MaterialTagSuggestion] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        try:
            suggestions.append(MaterialTagSuggestion.model_validate(item))
        except ValueError:
            continue
    return suggestions


def aggregate_tag_suggestions(
    tags: list[MaterialTagSuggestion],
    low_confidence_threshold: float,
) -> list[MaterialTagSuggestion]:
    merged: dict[tuple[str, str], MaterialTagSuggestion] = {}
    for tag in tags:
        normalized_name = " ".join(tag.name.casefold().split())
        key = (tag.category.value, normalized_name)
        current = merged.get(key)
        if current is None or tag.confidence > current.confidence:
            merged[key] = MaterialTagSuggestion(
                category=tag.category,
                name=tag.name.strip(),
                value=tag.value,
                confidence=tag.confidence,
            )
    return sorted(
        merged.values(),
        key=lambda item: (item.confidence < low_confidence_threshold, item.category.value, item.name.casefold()),
    )


def deterministic_fallback_tags(material: MaterialAsset) -> list[MaterialTagSuggestion]:
    tags = [
        MaterialTagSuggestion(category=MaterialTagCategory.CONTENT, name=f"{material.asset_type.value}-asset", confidence=0.94),
        MaterialTagSuggestion(category=MaterialTagCategory.MANAGEMENT, name=f"library-{material.library_type.value}", confidence=0.92),
        MaterialTagSuggestion(category=MaterialTagCategory.MANAGEMENT, name="fallback-tagging", value="deterministic", confidence=0.9),
    ]
    filename = material.filename or Path(material.source_uri or "").name
    if filename:
        extension = Path(filename).suffix.lower().lstrip(".")
        stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
        if extension:
            tags.append(MaterialTagSuggestion(category=MaterialTagCategory.CONTENT, name=f"format-{extension}", confidence=0.86))
        if stem:
            tags.append(MaterialTagSuggestion(category=MaterialTagCategory.BUSINESS, name=_stable_phrase(stem), value=stem, confidence=0.78))
    for key in ("brand", "brand_id", "campaign", "industry", "audience"):
        value = _metadata_text(material.source_metadata, key)
        if value:
            tags.append(MaterialTagSuggestion(category=MaterialTagCategory.BUSINESS, name=f"{key}-{_stable_phrase(value)}", value=value, confidence=0.88))
    if material.source_system:
        tags.append(MaterialTagSuggestion(category=MaterialTagCategory.MANAGEMENT, name=f"source-{_stable_phrase(material.source_system)}", confidence=0.84))
    if material.technical_metadata.get("fallback_reason"):
        tags.append(
            MaterialTagSuggestion(
                category=MaterialTagCategory.MANAGEMENT,
                name="metadata-needs-enrichment",
                value=str(material.technical_metadata["fallback_reason"]),
                confidence=0.54,
            )
        )
    tags.append(
        MaterialTagSuggestion(
            category=MaterialTagCategory.EFFECT,
            name=f"reuse-cluster-{_stable_bucket(material.id.hex)}",
            value="deterministic local grouping",
            confidence=0.72,
        )
    )
    return tags


def _metadata_text(metadata: dict[str, Any], key: str) -> str | None:
    value = metadata.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _stable_phrase(value: str) -> str:
    words = [part for part in value.casefold().replace("_", " ").replace("-", " ").split() if part]
    return "-".join(words[:4]) or "unknown"


def _stable_bucket(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()[:8]
