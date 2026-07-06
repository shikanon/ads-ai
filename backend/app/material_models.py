from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class MaterialStatus(StrEnum):
    RECEIVED = "received"
    PREPROCESSED = "preprocessed"
    TAGGED = "tagged"
    INDEXED = "indexed"
    SEARCHABLE = "searchable"
    BLOCKED = "blocked"
    FAILED = "failed"


class MaterialAssetType(StrEnum):
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    TEXT = "text"
    PROJECT = "project"
    OTHER = "other"


class MaterialLibraryType(StrEnum):
    RAW = "raw"
    FINISHED = "finished"
    KNOWLEDGE = "knowledge"


class MaterialCopyrightStatus(StrEnum):
    CLEARED = "cleared"
    LICENSED = "licensed"
    UNKNOWN = "unknown"
    RISK = "risk"


class MaterialComplianceStatus(StrEnum):
    APPROVED = "approved"
    PENDING = "pending"
    RISK = "risk"


class MaterialVisibility(StrEnum):
    PRIVATE = "private"
    BRAND = "brand"
    PUBLIC = "public"


class MaterialTagCategory(StrEnum):
    CONTENT = "content"
    BUSINESS = "business"
    MANAGEMENT = "management"
    EFFECT = "effect"


class MaterialTagSource(StrEnum):
    AI = "ai"
    HUMAN = "human"
    SYSTEM = "system"


class MaterialIndexStatus(StrEnum):
    PENDING = "pending"
    INDEXED = "indexed"
    FAILED = "failed"


class MaterialAuditAction(StrEnum):
    CREATED = "material.created"
    STATUS_UPDATED = "material.status_updated"
    TAG_UPSERTED = "material.tag_upserted"
    INDEX_SAVED = "material.index_saved"
    EFFECT_SAVED = "material.effect_saved"
    SECURITY_BLOCKED = "material.security_blocked"
    SEARCH_PERFORMED = "material.search_performed"


class MaterialTimestampedModel(BaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MaterialAsset(MaterialTimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    status: MaterialStatus = MaterialStatus.RECEIVED
    asset_type: MaterialAssetType
    library_type: MaterialLibraryType = MaterialLibraryType.RAW
    copyright_status: MaterialCopyrightStatus = MaterialCopyrightStatus.CLEARED
    compliance_status: MaterialComplianceStatus = MaterialComplianceStatus.PENDING
    visibility: MaterialVisibility = MaterialVisibility.PRIVATE
    owner_id: str | None = None
    brand_id: str | None = None
    title: str | None = None
    description: str | None = None
    filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    source_uri: str | None = None
    source_system: str | None = None
    md5: str | None = None
    duplicate_of: UUID | None = None
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    technical_metadata: dict[str, Any] = Field(default_factory=dict)
    effect_metrics: dict[str, float] = Field(default_factory=dict)


class MaterialTag(MaterialTimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    material_id: UUID
    category: MaterialTagCategory
    name: str
    value: str | None = None
    confidence: float = Field(default=1.0, ge=0, le=1)
    source: MaterialTagSource = MaterialTagSource.AI
    needs_review: bool = False

    @field_validator("name")
    @classmethod
    def require_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("标签名称不能为空")
        return stripped


class MaterialVectorIndex(MaterialTimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    material_id: UUID
    status: MaterialIndexStatus = MaterialIndexStatus.PENDING
    index_id: str | None = None
    collection: str | None = None
    partition_key: str | None = None
    embedding_model: str | None = None
    embedding_version: str | None = None
    vector_dim: int | None = Field(default=None, gt=0)
    metadata: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    indexed_at: datetime | None = None


class MaterialSearchQuery(BaseModel):
    query: str
    top_k: int = Field(default=10, ge=1, le=100)
    asset_types: list[MaterialAssetType] = Field(default_factory=list)
    library_types: list[MaterialLibraryType] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    include_blocked: bool = False
    actor: str | None = None
    enable_rag: bool = False

    @field_validator("query")
    @classmethod
    def require_query(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("检索 query 不能为空")
        return stripped


class MaterialSearchResult(BaseModel):
    material: MaterialAsset
    score: float = Field(ge=0)
    vector_score: float | None = Field(default=None, ge=0)
    scalar_score: float | None = Field(default=None, ge=0)
    evidence: list[str] = Field(default_factory=list)
    matched_tags: list[str] = Field(default_factory=list)


class MaterialInsight(MaterialTimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    material_id: UUID | None = None
    title: str
    method: str
    script_template: str | None = None
    prompt: str | None = None
    source_material_ids: list[UUID] = Field(default_factory=list)
    metrics_snapshot: dict[str, float] = Field(default_factory=dict)


class MaterialAuditEvent(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    material_id: UUID
    action: MaterialAuditAction | str
    actor: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
