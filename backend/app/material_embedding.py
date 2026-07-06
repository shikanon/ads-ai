import hashlib
import json
import re
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.material_models import MaterialAsset, MaterialIndexStatus, MaterialStatus, MaterialTag
from app.material_storage import MaterialStorage
from app.vikingdb_client import VikingDBClient


class MaterialEmbeddingResult(BaseModel):
    material: MaterialAsset
    index_id: str
    partition_key: str
    vector_dim: int
    embedding_model: str
    embedding_version: str
    fallback: bool
    vikingdb_response: dict[str, Any] = Field(default_factory=dict)


class MaterialEmbeddingService:
    def __init__(
        self,
        storage: MaterialStorage,
        *,
        vikingdb_client: VikingDBClient,
        embedding_model: str,
        embedding_model_version: str,
        vector_dim: int,
        partition_field: str,
    ):
        self.storage = storage
        self.vikingdb_client = vikingdb_client
        self.embedding_model = embedding_model
        self.embedding_model_version = embedding_model_version
        self.vector_dim = vector_dim
        self.partition_field = partition_field

    def index_material(self, material_id: UUID, *, actor: str | None = None) -> MaterialEmbeddingResult:
        material = self.storage.material(material_id)
        if material is None:
            raise KeyError("material_not_found")
        if material.status in {MaterialStatus.BLOCKED, MaterialStatus.FAILED}:
            raise ValueError("material cannot be indexed in current status")

        tags = self.storage.list_tags(material.id)
        embedding_request = build_embedding_request(
            material,
            tags,
            model_name=self.embedding_model,
            model_version=self.embedding_model_version,
        )
        vector = deterministic_vector_fallback(embedding_request, self.vector_dim)
        partition_key = build_partition_key(material, self.partition_field)
        index_id = build_index_id(material.id, self.embedding_model_version)
        metadata = build_vector_metadata(
            material,
            tags,
            embedding_request=embedding_request,
            embedding_model=self.embedding_model,
            embedding_model_version=self.embedding_model_version,
        )

        try:
            vikingdb_response = self.vikingdb_client.upsert_vector(
                vector_id=index_id,
                vector=vector,
                metadata=metadata,
                partition_key=partition_key,
            )
            index = self.storage.save_vector_index(
                material.id,
                status=MaterialIndexStatus.INDEXED,
                actor=actor,
                index_id=index_id,
                collection=self.vikingdb_client.collection,
                partition_key=partition_key,
                embedding_model=self.embedding_model,
                embedding_version=self.embedding_model_version,
                vector_dim=len(vector),
                metadata={
                    "fallback_embedding": True,
                    "vikingdb_configured": self.vikingdb_client.configured,
                    "vikingdb_response": vikingdb_response,
                },
            )
            material = self._advance_indexed_status(material, actor=actor)
            return MaterialEmbeddingResult(
                material=material,
                index_id=index.index_id or index_id,
                partition_key=partition_key,
                vector_dim=len(vector),
                embedding_model=self.embedding_model,
                embedding_version=self.embedding_model_version,
                fallback=True,
                vikingdb_response=vikingdb_response,
            )
        except Exception as exc:
            self.storage.save_vector_index(
                material.id,
                status=MaterialIndexStatus.FAILED,
                actor=actor,
                index_id=index_id,
                collection=self.vikingdb_client.collection,
                partition_key=partition_key,
                embedding_model=self.embedding_model,
                embedding_version=self.embedding_model_version,
                vector_dim=self.vector_dim,
                error_message=str(exc),
                metadata={"fallback_embedding": True},
            )
            raise

    def _advance_indexed_status(self, material: MaterialAsset, *, actor: str | None) -> MaterialAsset:
        current = material
        if current.status == MaterialStatus.RECEIVED:
            current = self.storage.update_status(
                current.id,
                MaterialStatus.PREPROCESSED,
                actor=actor,
                reason="material indexing preprocessing completed",
            )
        if current.status == MaterialStatus.PREPROCESSED:
            current = self.storage.update_status(
                current.id,
                MaterialStatus.TAGGED,
                actor=actor,
                reason="material indexing has usable metadata",
            )
        if current.status == MaterialStatus.TAGGED:
            current = self.storage.update_status(
                current.id,
                MaterialStatus.INDEXED,
                actor=actor,
                reason="material vector index saved",
            )
        if current.status == MaterialStatus.INDEXED:
            current = self.storage.update_status(
                current.id,
                MaterialStatus.SEARCHABLE,
                actor=actor,
                reason="material vector index is searchable",
            )
        return current


def build_embedding_request(
    material: MaterialAsset,
    tags: list[MaterialTag],
    *,
    model_name: str,
    model_version: str,
) -> dict[str, Any]:
    text_parts = [
        material.title,
        material.description,
        material.filename,
        material.source_uri,
        _metadata_text(material.source_metadata, "extracted_text"),
        _metadata_text(material.source_metadata, "transcript"),
        " ".join(sorted({tag.name for tag in tags})),
    ]
    inputs: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": "\n".join(part for part in text_parts if part),
        }
    ]
    if material.asset_type.value == "image":
        inputs.append({"type": "image", "uri": material.source_uri, "filename": material.filename})
    elif material.asset_type.value == "video":
        inputs.append(
            {
                "type": "video_keyframes",
                "uri": material.source_uri,
                "keyframes": material.technical_metadata.get("keyframes", []),
            }
        )
    elif material.asset_type.value == "audio":
        inputs.append({"type": "audio_text", "transcript": _metadata_text(material.source_metadata, "transcript")})

    return {
        "model": model_name,
        "model_version": model_version,
        "material_id": str(material.id),
        "asset_type": material.asset_type.value,
        "library_type": material.library_type.value,
        "inputs": inputs,
        "metadata": {
            "content_type": material.content_type,
            "source_system": material.source_system,
            "technical_metadata": material.technical_metadata,
        },
    }


def deterministic_vector_fallback(payload: dict[str, Any], vector_dim: int) -> list[float]:
    if vector_dim <= 0:
        raise ValueError("vector_dim must be positive")
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    values: list[float] = []
    counter = 0
    while len(values) < vector_dim:
        digest = hashlib.sha256(f"{canonical}:{counter}".encode("utf-8")).digest()
        for byte in digest:
            values.append(round((byte / 127.5) - 1.0, 6))
            if len(values) == vector_dim:
                break
        counter += 1
    return values


def build_partition_key(material: MaterialAsset, partition_field: str) -> str:
    brand_value = material.brand_id or _metadata_text(material.source_metadata, "brand_id") or _metadata_text(material.source_metadata, "brand")
    if partition_field == "brand_id" and brand_value:
        return f"brand_{_stable_key(brand_value)}"
    return f"type_{_stable_key(material.asset_type.value)}"


def build_index_id(material_id: UUID, embedding_model_version: str) -> str:
    version_key = _stable_key(embedding_model_version)
    return f"material_{material_id}_{version_key}"


def build_vector_metadata(
    material: MaterialAsset,
    tags: list[MaterialTag],
    *,
    embedding_request: dict[str, Any],
    embedding_model: str,
    embedding_model_version: str,
) -> dict[str, Any]:
    return {
        "material_id": str(material.id),
        "asset_type": material.asset_type.value,
        "library_type": material.library_type.value,
        "copyright_status": material.copyright_status.value,
        "compliance_status": material.compliance_status.value,
        "visibility": material.visibility.value,
        "owner_id": material.owner_id,
        "brand_id": material.brand_id,
        "title": material.title,
        "description": material.description,
        "source_uri": material.source_uri,
        "tags": [
            {
                "category": tag.category.value,
                "name": tag.name,
                "value": tag.value,
                "confidence": tag.confidence,
                "source": tag.source.value,
            }
            for tag in tags
        ],
        "embedding_model": embedding_model,
        "embedding_model_version": embedding_model_version,
        "embedding_request": embedding_request,
    }


def _metadata_text(metadata: dict[str, Any], key: str) -> str | None:
    value = metadata.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _stable_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")
    return normalized or "unknown"
