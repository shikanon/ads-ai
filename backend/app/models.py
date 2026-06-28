from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    PARSING = "parsing"
    PLAN_READY = "plan_ready"
    CONFIRMED = "confirmed"
    GENERATING = "generating"
    COMPOSITING = "compositing"
    COMPLETED = "completed"
    FAILED = "failed"


class FilePurpose(StrEnum):
    BRIEF = "brief"
    REFERENCE_VIDEO = "reference_video"
    REFERENCE_IMAGE = "reference_image"
    REFERENCE_AUDIO = "reference_audio"
    GENERATED_SEGMENT = "generated_segment"
    FINAL_VIDEO = "final_video"


class FileSourceType(StrEnum):
    LOCAL = "local"
    URL = "url"
    TOS_URI = "tos_uri"


class ReferenceAssetType(StrEnum):
    VIDEO = "video"
    IMAGE = "image"
    AUDIO = "audio"


class RequirementCategory(StrEnum):
    BRAND = "brand"
    PRODUCT = "product"
    AUDIENCE = "audience"
    SELLING_POINT = "selling_point"
    STYLE = "style"
    CONSTRAINT = "constraint"
    DELIVERY = "delivery"
    OTHER = "other"


class GenerationTaskStatus(StrEnum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    RETRYING = "retrying"


class GenerationPlanStatus(StrEnum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"


class CompositionStatus(StrEnum):
    NOT_STARTED = "not_started"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TimestampedModel(BaseModel):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Project(TimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    status: ProjectStatus = ProjectStatus.DRAFT
    requirement_text: str | None = None
    target_duration_seconds: int | None = Field(default=None, ge=1)


class FileRecord(TimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    purpose: FilePurpose
    source_type: FileSourceType
    filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    storage_path: str | None = None
    source_url: HttpUrl | str | None = None
    ark_file_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RequirementItem(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    category: RequirementCategory
    title: str
    content: str
    required: bool = True
    source_file_id: UUID | None = None


class ParsedReferenceAsset(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    asset_type: ReferenceAssetType
    purpose: str
    source_file_id: UUID | None = None
    related_segment_ids: list[UUID] = Field(default_factory=list)
    usage_notes: str | None = None
    is_missing: bool = False


class BriefParseResult(BaseModel):
    summary: str
    requirements: list[RequirementItem] = Field(default_factory=list)
    references: list[ParsedReferenceAsset] = Field(default_factory=list)
    missing_assets: list[ParsedReferenceAsset] = Field(default_factory=list)

    @field_validator("requirements")
    @classmethod
    def require_requirement_items(cls, value: list[RequirementItem]) -> list[RequirementItem]:
        if not value:
            raise ValueError("至少需要一个结构化需求项")
        return value

    @field_validator("summary")
    @classmethod
    def require_summary(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("解析摘要不能为空")
        return stripped


class ReferenceAsset(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    asset_type: ReferenceAssetType
    purpose: str
    source_file_id: UUID | None = None
    related_segment_ids: list[UUID] = Field(default_factory=list)
    usage_notes: str | None = None
    is_missing: bool = False


class SegmentPlan(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    order: int = Field(ge=1)
    title: str
    duration_seconds: float = Field(gt=0, le=15)
    prompt: str
    negative_prompt: str | None = None
    shot_description: str
    continuity_notes: str | None = None
    reference_video_ids: list[UUID] = Field(default_factory=list)
    reference_image_ids: list[UUID] = Field(default_factory=list)
    reference_audio_ids: list[UUID] = Field(default_factory=list)

    @field_validator("prompt", "shot_description")
    @classmethod
    def require_non_empty_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("字段不能为空")
        return stripped


class GenerationPlan(TimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    version: int = Field(ge=1)
    status: GenerationPlanStatus = GenerationPlanStatus.DRAFT
    segment_ids: list[UUID] = Field(default_factory=list)
    requirement_ids: list[UUID] = Field(default_factory=list)
    reference_ids: list[UUID] = Field(default_factory=list)
    missing_reference_ids: list[UUID] = Field(default_factory=list)
    confirmed_at: datetime | None = None
    confirmed_by: str | None = None


class GenerationTask(TimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    segment_id: UUID
    provider_task_id: str | None = None
    status: GenerationTaskStatus = GenerationTaskStatus.PENDING
    request_summary: dict[str, Any] = Field(default_factory=dict)
    retry_count: int = Field(default=0, ge=0)
    error_message: str | None = None
    result_url: HttpUrl | str | None = None


class FinalResult(TimestampedModel):
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    status: CompositionStatus = CompositionStatus.NOT_STARTED
    output_file_id: UUID | None = None
    preview_url: HttpUrl | str | None = None
    download_url: HttpUrl | str | None = None
    duration_seconds: float | None = Field(default=None, ge=0)
    error_message: str | None = None
