import logging
import json
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import FastAPI, File, Form, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError

from app.brief_parser import BriefParser
from app.brief_pdf_renderer import render_pdf_pages
from app.brief_text_extractor import extract_brief_text
from app.config import get_settings
from app.errors import AppError, register_error_handlers
from app.file_validation import ValidatedUpload, validate_brief_upload, validate_reference_upload, validate_remote_source
from app.logging_config import configure_logging
from app.material_embedding import MaterialEmbeddingService
from app.material_ingestion import MaterialIngestionService
from app.material_insights import MaterialInsightsService, effect_payload
from app.material_models import (
    MaterialAssetType,
    MaterialComplianceStatus,
    MaterialCopyrightStatus,
    MaterialLibraryType,
    MaterialSearchQuery,
    MaterialTagCategory,
    MaterialVisibility,
)
from app.material_search import MaterialSearchService
from app.material_storage import MaterialStorage
from app.material_tagging import MaterialTagSuggestion, MaterialTaggingService
from app.models import (
    FilePurpose,
    FileRecord,
    FileSourceType,
    GenerationTask,
    GenerationTaskStatus,
    Project,
    ProjectStatus,
    ReferenceAsset,
    ReferenceAssetType,
    RequirementCategory,
    RequirementItem,
    SegmentPlan,
)
from app.seed_chat import SeedChatClient
from app.seedance import SeedanceClient
from app.storage import JsonRepository
from app.tvc_planner import SegmentPlanner
from app.video_composer import VideoComposer
from app.vikingdb_client import VikingDBClient
from app.volcengine_files import VolcengineFilesClient


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    logging.getLogger(__name__).info("backend_started")
    yield
    logging.getLogger(__name__).info("backend_stopped")


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
repository = JsonRepository(settings.storage_dir)
files_client = VolcengineFilesClient(settings.ark_api_key, settings.ark_files_base_url)
seed_chat_client = SeedChatClient(settings.ark_api_key, settings.ark_chat_base_url, settings.seed_model_name)
seedance_client = SeedanceClient(settings.ark_api_key, settings.ark_chat_base_url, settings.seedance_model_name)
brief_parser = BriefParser(seed_chat_client)
segment_planner = SegmentPlanner(seed_chat_client)
video_composer = VideoComposer(settings.storage_dir, settings.video_transition_seconds)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    requirement_text: str | None = None
    target_duration_seconds: int | None = Field(default=None, ge=1)


class RemoteReferenceInput(BaseModel):
    url: str
    asset_type: ReferenceAssetType
    purpose: str = "参考素材"
    usage_notes: str | None = None


class MaterialImportRequest(BaseModel):
    uris: list[str] = Field(min_length=1)
    library_type: MaterialLibraryType = MaterialLibraryType.RAW
    source_metadata: dict[str, object] = Field(default_factory=dict)
    copyright_status: MaterialCopyrightStatus = MaterialCopyrightStatus.CLEARED
    compliance_status: MaterialComplianceStatus = MaterialComplianceStatus.PENDING
    visibility: MaterialVisibility = MaterialVisibility.PRIVATE
    owner_id: str | None = None
    brand_id: str | None = None
    actor: str | None = None


class MaterialCreateRequest(BaseModel):
    source_uri: str = Field(min_length=1)
    asset_type: MaterialAssetType | None = None
    library_type: MaterialLibraryType = MaterialLibraryType.RAW
    title: str | None = None
    description: str | None = None
    source_system: str | None = None
    source_metadata: dict[str, object] = Field(default_factory=dict)
    business_tags: list[str] = Field(default_factory=list)
    copyright_status: MaterialCopyrightStatus = MaterialCopyrightStatus.CLEARED
    compliance_status: MaterialComplianceStatus = MaterialComplianceStatus.PENDING
    visibility: MaterialVisibility = MaterialVisibility.PRIVATE
    owner_id: str | None = None
    brand_id: str | None = None
    actor: str | None = None


class MaterialTagRequest(BaseModel):
    actor: str | None = None


class MaterialIndexRequest(BaseModel):
    actor: str | None = None


class MaterialRagRequest(MaterialSearchQuery):
    enable_rag: bool = True


class MaterialEffectsRequest(BaseModel):
    material_id: UUID
    impressions: float | None = Field(default=None, ge=0)
    clicks: float | None = Field(default=None, ge=0)
    conversions: float | None = Field(default=None, ge=0)
    ctr: float | None = Field(default=None, ge=0)
    cvr: float | None = Field(default=None, ge=0)
    actor: str | None = None


class MaterialManualTagInput(BaseModel):
    category: MaterialTagCategory
    name: str = Field(min_length=1)
    value: str | None = None
    confidence: float = Field(default=1.0, ge=0, le=1)


class MaterialManualTagsRequest(BaseModel):
    tags: list[MaterialManualTagInput] = Field(min_length=1)
    actor: str | None = None


class ParsedRequirementInput(BaseModel):
    id: UUID | None = None
    category: RequirementCategory
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    required: bool = True
    source_file_id: UUID | None = None


class ParsedReferenceInput(BaseModel):
    id: UUID | None = None
    asset_type: ReferenceAssetType
    purpose: str = Field(min_length=1)
    source_file_id: UUID | None = None
    usage_notes: str | None = None
    is_missing: bool = False


class ParsedBriefUpdateRequest(BaseModel):
    summary: str = Field(min_length=1)
    requirements: list[ParsedRequirementInput] = Field(min_length=1)
    references: list[ParsedReferenceInput] = Field(default_factory=list)


class SegmentPlanInput(BaseModel):
    id: UUID | None = None
    order: int = Field(ge=1)
    title: str = Field(min_length=1)
    duration_seconds: float = Field(gt=0, le=15)
    prompt: str = Field(min_length=1)
    negative_prompt: str | None = None
    shot_description: str = Field(min_length=1)
    continuity_notes: str | None = None
    reference_video_ids: list[UUID] = Field(default_factory=list)
    reference_image_ids: list[UUID] = Field(default_factory=list)
    reference_audio_ids: list[UUID] = Field(default_factory=list)


class SegmentPlanUpdateRequest(BaseModel):
    segments: list[SegmentPlanInput] = Field(min_length=1)


class ConfirmGenerationPlanRequest(BaseModel):
    confirmed_by: str | None = Field(default="user", min_length=1)


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "environment": settings.app_env}


@app.get("/config", tags=["system"])
def read_public_config() -> dict[str, object]:
    return settings.public_dict()


@app.post("/api/materials/upload", tags=["materials"])
async def upload_materials(
    files: list[UploadFile] = File(...),
    library_type: MaterialLibraryType = Form(default=MaterialLibraryType.RAW),
    source_system: str | None = Form(default="upload"),
    copyright_status: MaterialCopyrightStatus = Form(default=MaterialCopyrightStatus.CLEARED),
    compliance_status: MaterialComplianceStatus = Form(default=MaterialComplianceStatus.PENDING),
    visibility: MaterialVisibility = Form(default=MaterialVisibility.PRIVATE),
    owner_id: str | None = Form(default=None),
    brand_id: str | None = Form(default=None),
    actor: str | None = Form(default=None),
) -> dict[str, object]:
    if not files:
        raise AppError("MISSING_MATERIAL_FILES", "请至少上传一个素材文件", status.HTTP_400_BAD_REQUEST)
    service = _material_ingestion_service()
    materials = []
    for file in files:
        data = await file.read()
        material = service.ingest_upload(
            file,
            data,
            library_type=library_type,
            source_system=source_system,
            copyright_status=copyright_status,
            compliance_status=compliance_status,
            visibility=visibility,
            owner_id=owner_id,
            brand_id=brand_id,
            actor=actor,
        )
        materials.append(material.model_dump(mode="json"))
    return {"materials": materials}


@app.post("/api/materials/import", tags=["materials"])
def import_materials(payload: MaterialImportRequest) -> dict[str, object]:
    service = _material_ingestion_service()
    materials = [
        service.import_tos_uri(
            uri,
            library_type=payload.library_type,
            source_metadata=payload.source_metadata,
            copyright_status=payload.copyright_status,
            compliance_status=payload.compliance_status,
            visibility=payload.visibility,
            owner_id=payload.owner_id,
            brand_id=payload.brand_id,
            actor=payload.actor,
        ).model_dump(mode="json")
        for uri in payload.uris
    ]
    return {"materials": materials}


@app.post("/api/materials", tags=["materials"])
def create_material(payload: MaterialCreateRequest) -> dict[str, object]:
    material = _material_ingestion_service().ingest_external(
        source_uri=payload.source_uri,
        asset_type=payload.asset_type,
        library_type=payload.library_type,
        title=payload.title,
        description=payload.description,
        source_system=payload.source_system,
        source_metadata=payload.source_metadata,
        business_tags=payload.business_tags,
        copyright_status=payload.copyright_status,
        compliance_status=payload.compliance_status,
        visibility=payload.visibility,
        owner_id=payload.owner_id,
        brand_id=payload.brand_id,
        actor=payload.actor,
    )
    return {"material": material.model_dump(mode="json")}


@app.post("/api/materials/{material_id}/tag", tags=["materials"])
def tag_material(material_id: UUID, payload: MaterialTagRequest | None = None) -> dict[str, object]:
    try:
        result = _material_tagging_service().tag_material(
            material_id,
            actor=payload.actor if payload else None,
        )
    except KeyError as exc:
        raise AppError("MATERIAL_NOT_FOUND", "素材不存在", status.HTTP_404_NOT_FOUND) from exc
    except ValueError as exc:
        raise AppError("MATERIAL_TAGGING_FAILED", str(exc), status.HTTP_400_BAD_REQUEST) from exc
    return {
        "material": result.material.model_dump(mode="json"),
        "tags": [tag.model_dump(mode="json") for tag in result.tags],
        "model_name": result.model_name,
        "fallback": result.fallback,
    }


@app.post("/api/materials/{material_id}/index", tags=["materials"])
def index_material(material_id: UUID, payload: MaterialIndexRequest | None = None) -> dict[str, object]:
    try:
        result = _material_embedding_service().index_material(
            material_id,
            actor=payload.actor if payload else None,
        )
    except KeyError as exc:
        raise AppError("MATERIAL_NOT_FOUND", "素材不存在", status.HTTP_404_NOT_FOUND) from exc
    except ValueError as exc:
        raise AppError("MATERIAL_INDEX_FAILED", str(exc), status.HTTP_400_BAD_REQUEST) from exc
    return {
        "material": result.material.model_dump(mode="json"),
        "index": {
            "index_id": result.index_id,
            "partition_key": result.partition_key,
            "vector_dim": result.vector_dim,
            "embedding_model": result.embedding_model,
            "embedding_version": result.embedding_version,
        },
        "fallback": result.fallback,
        "vikingdb_response": result.vikingdb_response,
    }


@app.post("/api/materials/search", tags=["materials"])
def search_materials(payload: MaterialSearchQuery) -> dict[str, object]:
    result = _material_search_service().search(payload)
    return {
        "query": result.query.model_dump(mode="json"),
        "results": [item.model_dump(mode="json") for item in result.results],
        "answer": result.answer.model_dump(mode="json") if result.answer else None,
    }


@app.post("/api/materials/rag", tags=["materials"])
def rag_materials(payload: MaterialRagRequest) -> dict[str, object]:
    query = MaterialSearchQuery(**{**payload.model_dump(), "enable_rag": True})
    result = _material_search_service().search(query)
    return {
        "query": result.query.model_dump(mode="json"),
        "results": [item.model_dump(mode="json") for item in result.results],
        "answer": result.answer.model_dump(mode="json") if result.answer else None,
    }


@app.post("/api/materials/effects", tags=["materials"])
def update_material_effects(payload: MaterialEffectsRequest) -> dict[str, object]:
    try:
        result = _material_insights_service().record_effects(
            payload.material_id,
            impressions=payload.impressions,
            clicks=payload.clicks,
            conversions=payload.conversions,
            ctr=payload.ctr,
            cvr=payload.cvr,
            actor=payload.actor,
        )
    except KeyError as exc:
        raise AppError("MATERIAL_NOT_FOUND", "素材不存在", status.HTTP_404_NOT_FOUND) from exc
    return effect_payload(result)


@app.get("/api/materials/insights", tags=["materials"])
def list_material_insights() -> dict[str, object]:
    return {"insights": [insight.model_dump(mode="json") for insight in _material_insights_service().list_insights()]}


@app.put("/api/materials/{material_id}/tags", tags=["materials"])
def update_material_tags(material_id: UUID, payload: MaterialManualTagsRequest) -> dict[str, object]:
    try:
        result = _material_tagging_service().apply_human_tags(
            material_id,
            [
                MaterialTagSuggestion(
                    category=item.category,
                    name=item.name,
                    value=item.value,
                    confidence=item.confidence,
                )
                for item in payload.tags
            ],
            actor=payload.actor,
        )
    except KeyError as exc:
        raise AppError("MATERIAL_NOT_FOUND", "素材不存在", status.HTTP_404_NOT_FOUND) from exc
    return {
        "material": result.material.model_dump(mode="json"),
        "tags": [tag.model_dump(mode="json") for tag in result.tags],
    }


@app.get("/api/projects", tags=["projects"])
def list_project_history() -> dict[str, object]:
    return {"projects": repository.list_project_histories()}


@app.get("/api/gallery", tags=["projects"])
def list_gallery() -> dict[str, object]:
    return {"items": repository.list_gallery_items()}


@app.post("/api/projects", tags=["projects"])
def create_project(payload: ProjectCreateRequest) -> dict[str, object]:
    project = repository.ensure_project(
        project_id=uuid4(),
        name=payload.name,
        requirement_text=payload.requirement_text,
        target_duration_seconds=payload.target_duration_seconds,
    )
    return {"project": project.model_dump(mode="json")}


@app.get("/api/projects/{project_id}", tags=["projects"])
def read_project(project_id: UUID) -> dict[str, object]:
    return repository.project_payload(project_id)


@app.get("/api/projects/{project_id}/history", tags=["projects"])
def read_project_history(project_id: UUID) -> dict[str, object]:
    payload = repository.project_history_payload(project_id)
    if not payload.get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    return payload


@app.delete("/api/projects/{project_id}", tags=["projects"])
def delete_project(project_id: UUID) -> dict[str, object]:
    if not repository.delete_project(project_id):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    return {"deleted": True, "project_id": str(project_id)}


@app.post("/api/projects/{project_id}/parse-brief", tags=["projects"])
def parse_brief(project_id: UUID) -> dict[str, object]:
    payload = repository.project_payload(project_id)
    if not payload.get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    parsed = brief_parser.parse(
        project=repository.ensure_project(project_id=project_id),
        files=[FileRecord.model_validate(item) for item in payload["files"]],
        references=[ReferenceAsset.model_validate(item) for item in payload["references"]],
    )
    repository.save_parse_result(project_id, parsed)
    return repository.project_payload(project_id)


@app.put("/api/projects/{project_id}/parsed-brief", tags=["projects"])
def update_parsed_brief(project_id: UUID, payload: ParsedBriefUpdateRequest) -> dict[str, object]:
    if not repository.project_payload(project_id).get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    requirements = [
        RequirementItem(
            id=item.id or uuid4(),
            project_id=project_id,
            category=item.category,
            title=item.title,
            content=item.content,
            required=item.required,
            source_file_id=item.source_file_id,
        )
        for item in payload.requirements
    ]
    references = [
        ReferenceAsset(
            id=item.id or uuid4(),
            project_id=project_id,
            asset_type=item.asset_type,
            purpose=item.purpose,
            source_file_id=item.source_file_id,
            usage_notes=item.usage_notes,
            is_missing=item.is_missing,
        )
        for item in payload.references
    ]
    return repository.replace_parsed_items(project_id, payload.summary, requirements, references)


@app.post("/api/projects/{project_id}/segment-plan", tags=["projects"])
def create_segment_plan(project_id: UUID) -> dict[str, object]:
    payload = repository.project_payload(project_id)
    if not payload.get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    if not payload.get("requirements"):
        raise AppError("MISSING_PARSED_BRIEF", "请先完成 brief 解析并保存需求项", status.HTTP_400_BAD_REQUEST)

    project = Project.model_validate(payload["project"])
    segments = segment_planner.plan(
        project=project,
        requirements=[RequirementItem.model_validate(item) for item in payload["requirements"]],
        references=[ReferenceAsset.model_validate(item) for item in payload["references"]],
        files=[FileRecord.model_validate(item) for item in payload["files"]],
    )
    return repository.replace_segment_plans(project_id, segments)


@app.put("/api/projects/{project_id}/segment-plan", tags=["projects"])
def update_segment_plan(project_id: UUID, payload: SegmentPlanUpdateRequest) -> dict[str, object]:
    stored_payload = repository.project_payload(project_id)
    if not stored_payload.get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    project = Project.model_validate(stored_payload["project"])
    references = [ReferenceAsset.model_validate(item) for item in stored_payload["references"]]
    raw_segments = [item.model_dump(mode="json") for item in payload.segments]
    segments = SegmentPlanner.validate_segments(raw_segments, project, references)
    return repository.replace_segment_plans(project_id, segments)


@app.post("/api/projects/{project_id}/generation-plan/confirm", tags=["projects"])
def confirm_generation_plan(project_id: UUID, payload: ConfirmGenerationPlanRequest | None = None) -> dict[str, object]:
    try:
        return repository.confirm_generation_plan(project_id, payload.confirmed_by if payload else "user")
    except KeyError as exc:
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND) from exc
    except ValueError as exc:
        raise AppError("MISSING_SEGMENT_PLAN", "请先保存至少一个分段计划，再确认生成", status.HTTP_400_BAD_REQUEST) from exc


@app.post("/api/projects/{project_id}/generation-tasks", tags=["projects"])
def start_generation(project_id: UUID) -> dict[str, object]:
    try:
        repository.generation_plan_for_project(project_id)
    except KeyError as exc:
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND) from exc
    except PermissionError as exc:
        raise AppError("PLAN_NOT_CONFIRMED", "请先确认生成计划，再启动 Seedance 2.0 视频生成", status.HTTP_409_CONFLICT) from exc

    payload = repository.project_payload(project_id)
    segments = [SegmentPlan.model_validate(item) for item in payload["segment_plans"]]
    references = [ReferenceAsset.model_validate(item) for item in payload["references"]]
    files = [FileRecord.model_validate(item) for item in payload["files"]]
    for segment in segments:
        existing_task = repository.find_generation_task_by_segment(project_id, segment.id)
        if existing_task and existing_task.status != GenerationTaskStatus.FAILED:
            continue
        _submit_seedance_segment_task(project_id, segment, references, files, existing_task)
    return _refresh_generation_tasks(project_id)


@app.get("/api/projects/{project_id}/generation-tasks", tags=["projects"])
def read_generation_tasks(project_id: UUID) -> dict[str, object]:
    try:
        return _refresh_generation_tasks(project_id)
    except KeyError as exc:
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND) from exc


@app.post("/api/projects/{project_id}/generation-tasks/{segment_id}/retry", tags=["projects"])
def retry_generation_task(project_id: UUID, segment_id: UUID) -> dict[str, object]:
    payload = repository.project_payload(project_id)
    if not payload.get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    segment = next((SegmentPlan.model_validate(item) for item in payload["segment_plans"] if item["id"] == str(segment_id)), None)
    if not segment:
        raise AppError("SEGMENT_NOT_FOUND", "片段不存在", status.HTTP_404_NOT_FOUND)
    existing_task = repository.find_generation_task_by_segment(project_id, segment_id)
    if not existing_task or existing_task.status != GenerationTaskStatus.FAILED:
        raise AppError("SEGMENT_NOT_FAILED", "仅失败片段支持单独重试", status.HTTP_409_CONFLICT)

    references = [ReferenceAsset.model_validate(item) for item in payload["references"]]
    files = [FileRecord.model_validate(item) for item in payload["files"]]
    _submit_seedance_segment_task(project_id, segment, references, files, existing_task, retry=True)
    return _refresh_generation_tasks(project_id)


@app.get("/api/projects/{project_id}/final-result", tags=["projects"])
def read_final_result(project_id: UUID) -> dict[str, object]:
    payload = repository.project_payload(project_id)
    if not payload.get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)
    return payload


@app.post("/api/projects/{project_id}/final-result", tags=["projects"])
def compose_final_result(project_id: UUID) -> dict[str, object]:
    payload = _refresh_generation_tasks(project_id)
    if not payload.get("project"):
        raise AppError("PROJECT_NOT_FOUND", "项目不存在", status.HTTP_404_NOT_FOUND)

    segments = [SegmentPlan.model_validate(item) for item in payload["segment_plans"]]
    if not segments:
        raise AppError("MISSING_SEGMENT_PLAN", "请先保存片段计划", status.HTTP_400_BAD_REQUEST)

    tasks = [GenerationTask.model_validate(item) for item in payload["generation_tasks"]]
    task_by_segment_id = {task.segment_id: task for task in tasks}
    incomplete_segments = [
        segment.order
        for segment in segments
        if task_by_segment_id.get(segment.id) is None
        or task_by_segment_id[segment.id].status != GenerationTaskStatus.SUCCEEDED
        or not task_by_segment_id[segment.id].result_url
    ]
    if incomplete_segments:
        raise AppError(
            "SEGMENTS_NOT_READY",
            f"以下片段尚未生成成功，无法合成：{', '.join(str(item) for item in incomplete_segments)}",
            status.HTTP_409_CONFLICT,
        )

    repository.begin_final_composition(project_id)
    try:
        output_path, duration_seconds = video_composer.compose(project_id, segments, tasks)
        file_id = uuid4()
        stable_output_path = output_path.with_name(f"{file_id}-final-tvc.mp4")
        output_path.replace(stable_output_path)
        media_url = f"/api/projects/{project_id}/files/{file_id}/download"
        repository.save_final_video(
            project_id=project_id,
            output_path=stable_output_path,
            preview_url=media_url,
            download_url=media_url,
            duration_seconds=duration_seconds,
            file_id=file_id,
        )
    except AppError as exc:
        repository.fail_final_composition(project_id, exc.message)
        raise
    except Exception as exc:
        repository.fail_final_composition(project_id, str(exc))
        raise AppError("VIDEO_COMPOSITION_FAILED", "视频合成失败，请查看后端日志", status.HTTP_500_INTERNAL_SERVER_ERROR) from exc

    return repository.project_payload(project_id)


@app.get("/api/projects/{project_id}/files/{file_id}/download", tags=["projects"])
def download_project_file(project_id: UUID, file_id: UUID) -> FileResponse:
    file_record = repository.file_record(project_id, file_id)
    if not file_record or not file_record.storage_path:
        raise AppError("FILE_NOT_FOUND", "文件不存在", status.HTTP_404_NOT_FOUND)
    path = Path(file_record.storage_path)
    if not path.exists():
        raise AppError("FILE_NOT_FOUND", "文件不存在或已被移动", status.HTTP_404_NOT_FOUND)
    return FileResponse(
        path,
        media_type=file_record.content_type or "application/octet-stream",
        filename=file_record.filename or path.name,
    )


@app.post("/api/projects/{project_id}/brief-input", tags=["projects"])
async def submit_brief_input(
    project_id: UUID,
    requirement_text: str | None = Form(default=None),
    brief_remote_source: str | None = Form(default=None),
    remote_references_json: str | None = Form(default=None),
    brief_file: UploadFile | None = File(default=None),
    reference_videos: list[UploadFile] | None = File(default=None),
    reference_images: list[UploadFile] | None = File(default=None),
    reference_audio: list[UploadFile] | None = File(default=None),
) -> dict[str, object]:
    text = requirement_text.strip() if requirement_text else None
    remote_references = _parse_remote_references(remote_references_json)
    has_local_uploads = _has_upload(brief_file) or any(
        _has_upload(file)
        for files in (reference_videos or [], reference_images or [], reference_audio or [])
        for file in [files]
    )
    if not any([text, _has_remote_source(brief_remote_source), remote_references, has_local_uploads]):
        raise AppError("MISSING_BRIEF_INPUT", "请至少提供 brief 文件、需求文本或参考素材", status.HTTP_400_BAD_REQUEST)

    project = repository.ensure_project(project_id=project_id, requirement_text=text)
    file_records: list[FileRecord] = []
    reference_assets: list[ReferenceAsset] = []

    if _has_upload(brief_file):
        assert brief_file is not None
        data = await brief_file.read()
        validated = validate_brief_upload(
            brief_file,
            data,
            settings.max_brief_file_size_mb * 1024 * 1024,
        )
        file_records.append(_save_local_file(project.id, FilePurpose.BRIEF, validated))

    if _has_remote_source(brief_remote_source):
        assert brief_remote_source is not None
        file_records.append(_save_remote_file(project.id, FilePurpose.BRIEF, brief_remote_source))

    for asset_type, uploads in (
        (ReferenceAssetType.VIDEO, reference_videos or []),
        (ReferenceAssetType.IMAGE, reference_images or []),
        (ReferenceAssetType.AUDIO, reference_audio or []),
    ):
        for upload in uploads:
            if not _has_upload(upload):
                continue
            data = await upload.read()
            validated = validate_reference_upload(
                upload,
                data,
                asset_type,
                settings.max_reference_file_size_mb * 1024 * 1024,
            )
            file_record = _save_local_file(project.id, _file_purpose_for_asset(asset_type), validated)
            file_records.append(file_record)
            reference_assets.append(_save_reference_asset(project.id, asset_type, file_record.id))

    for remote_reference in remote_references:
        file_record = _save_remote_file(
            project.id,
            _file_purpose_for_asset(remote_reference.asset_type),
            remote_reference.url,
        )
        file_records.append(file_record)
        reference_assets.append(
            _save_reference_asset(
                project.id,
                remote_reference.asset_type,
                file_record.id,
                purpose=remote_reference.purpose,
                usage_notes=remote_reference.usage_notes,
            )
        )

    return {
        "project": project.model_dump(mode="json"),
        "files": [record.model_dump(mode="json") for record in file_records],
        "references": [asset.model_dump(mode="json") for asset in reference_assets],
    }


@app.get("/api/workflow", tags=["projects"])
def read_workflow() -> dict[str, object]:
    return {
        "statuses": [status.value for status in ProjectStatus],
        "steps": [
            "brief_input",
            "requirement_parse",
            "plan_confirm",
            "segment_generation",
            "final_composition",
            "preview_download",
        ],
    }


def _submit_seedance_segment_task(
    project_id: UUID,
    segment: SegmentPlan,
    references: list[ReferenceAsset],
    files: list[FileRecord],
    existing_task: GenerationTask | None = None,
    retry: bool = False,
) -> GenerationTask:
    task = existing_task or GenerationTask(project_id=project_id, segment_id=segment.id)
    task.retry_count = task.retry_count + 1 if retry else task.retry_count
    task.status = GenerationTaskStatus.RETRYING if retry else GenerationTaskStatus.SUBMITTED
    task.error_message = None
    task.result_url = None
    try:
        request_payload = seedance_client.build_segment_request(segment, references, files)
        task.request_summary = seedance_client.summarize_request(request_payload)
        response = seedance_client.create_task(request_payload)
        task.provider_task_id = seedance_client.extract_task_id(response)
        task.status = seedance_client.extract_status(response)
        task.result_url = seedance_client.extract_result_url(response)
        if task.status == GenerationTaskStatus.FAILED:
            task.error_message = seedance_client.extract_error_message(response) or "Seedance 2.0 任务失败"
    except AppError as exc:
        task.status = GenerationTaskStatus.FAILED
        task.error_message = exc.message
    repository.save_generation_task(task)
    return task


def _refresh_generation_tasks(project_id: UUID) -> dict[str, object]:
    tasks = repository.generation_tasks_for_project(project_id)
    for task in tasks:
        if task.status not in {
            GenerationTaskStatus.SUBMITTED,
            GenerationTaskStatus.RUNNING,
            GenerationTaskStatus.RETRYING,
        }:
            continue
        if not task.provider_task_id:
            task.status = GenerationTaskStatus.FAILED
            task.error_message = "Seedance 2.0 未返回任务 ID"
            repository.save_generation_task(task)
            continue
        try:
            response = seedance_client.get_task(task.provider_task_id)
            task.status = seedance_client.extract_status(response)
            task.result_url = seedance_client.extract_result_url(response) or task.result_url
            if task.status == GenerationTaskStatus.FAILED:
                task.error_message = seedance_client.extract_error_message(response) or "Seedance 2.0 任务失败"
            elif task.status == GenerationTaskStatus.SUCCEEDED:
                task.error_message = None
            repository.save_generation_task(task)
        except AppError as exc:
            task.status = GenerationTaskStatus.FAILED
            task.error_message = exc.message
            repository.save_generation_task(task)
    return repository.project_payload(project_id)


def _save_local_file(project_id: UUID, purpose: FilePurpose, upload: ValidatedUpload) -> FileRecord:
    response = files_client.upload_bytes(upload.filename, upload.content_type, upload.data, purpose.value)
    metadata: dict[str, object] = {"ark_response": response}
    if purpose == FilePurpose.BRIEF:
        extracted = extract_brief_text(upload.filename, upload.content_type, upload.data)
        if extracted:
            metadata["text_extraction_method"] = extracted.method
            metadata["text_extraction_quality_score"] = extracted.quality_score
            if extracted.rejected_reason:
                metadata["text_extraction_rejected_reason"] = extracted.rejected_reason
            else:
                metadata.update(
                    {
                        "extracted_text": extracted.text,
                        "extracted_summary": extracted.summary,
                    }
                )
    record = FileRecord(
        id=uuid4(),
        project_id=project_id,
        purpose=purpose,
        source_type=FileSourceType.LOCAL,
        filename=upload.filename,
        content_type=upload.content_type,
        size_bytes=upload.size_bytes,
        ark_file_id=files_client.extract_file_id(response),
        metadata=metadata,
    )
    storage_path = repository.write_upload(project_id, record.id, upload.filename, upload.data)
    record.storage_path = str(storage_path)
    if purpose == FilePurpose.BRIEF:
        rendered = render_pdf_pages(
            upload.filename,
            upload.content_type,
            upload.data,
            storage_path.parent / f"{record.id}-pdf-pages",
            settings.pdf_render_max_pages,
            settings.pdf_render_scale,
            settings.pdf_render_max_image_size,
        )
        if rendered:
            record.metadata["pdf_page_images"] = rendered.metadata()
    return repository.save_file_record(record)


def _save_remote_file(project_id: UUID, purpose: FilePurpose, source: str) -> FileRecord:
    validated_source = validate_remote_source(source)
    response = files_client.upload_remote_source(validated_source, purpose.value)
    record = FileRecord(
        project_id=project_id,
        purpose=purpose,
        source_type=FileSourceType.TOS_URI if validated_source.startswith("tos://") else FileSourceType.URL,
        source_url=validated_source,
        ark_file_id=files_client.extract_file_id(response),
        metadata={"ark_response": response},
    )
    return repository.save_file_record(record)


def _material_ingestion_service() -> MaterialIngestionService:
    return MaterialIngestionService(
        MaterialStorage(repository),
        settings.max_reference_file_size_mb * 1024 * 1024,
    )


def _material_tagging_service() -> MaterialTaggingService:
    return MaterialTaggingService(
        MaterialStorage(repository),
        seed_client=SeedChatClient(
            settings.ark_api_key,
            settings.ark_chat_base_url,
            settings.seed_tagging_model_name,
            settings.seed_tagging_timeout_seconds,
        ),
        model_name=settings.seed_tagging_model_name,
        low_confidence_threshold=settings.material_tagging_low_confidence_threshold,
    )


def _material_embedding_service() -> MaterialEmbeddingService:
    return MaterialEmbeddingService(
        MaterialStorage(repository),
        vikingdb_client=VikingDBClient(
            endpoint=settings.vikingdb_knowledge_base_endpoint,
            collection=settings.vikingdb_knowledge_base_collection,
            api_key=settings.vikingdb_api_key,
            partition_field=settings.vikingdb_partition_field,
            hybrid_index_mode=settings.vikingdb_hybrid_index_mode,
        ),
        embedding_model=settings.material_embedding_model_name,
        embedding_model_version=settings.material_embedding_model_version,
        vector_dim=settings.material_embedding_vector_dim,
        partition_field=settings.vikingdb_partition_field,
    )


def _material_search_service() -> MaterialSearchService:
    return MaterialSearchService(
        MaterialStorage(repository),
        vikingdb_client=VikingDBClient(
            endpoint=settings.vikingdb_knowledge_base_endpoint,
            collection=settings.vikingdb_knowledge_base_collection,
            api_key=settings.vikingdb_api_key,
            partition_field=settings.vikingdb_partition_field,
            hybrid_index_mode=settings.vikingdb_hybrid_index_mode,
        ),
        seed_client=SeedChatClient(
            settings.ark_api_key,
            settings.ark_chat_base_url,
            settings.seed_tagging_model_name,
            settings.seed_tagging_timeout_seconds,
        ),
        embedding_model=settings.material_embedding_model_name,
        embedding_model_version=settings.material_embedding_model_version,
        vector_dim=settings.material_embedding_vector_dim,
    )


def _material_insights_service() -> MaterialInsightsService:
    return MaterialInsightsService(MaterialStorage(repository))


def _save_reference_asset(
    project_id: UUID,
    asset_type: ReferenceAssetType,
    source_file_id: UUID,
    purpose: str = "参考素材",
    usage_notes: str | None = None,
) -> ReferenceAsset:
    return repository.save_reference_asset(
        ReferenceAsset(
            project_id=project_id,
            asset_type=asset_type,
            purpose=purpose,
            source_file_id=source_file_id,
            usage_notes=usage_notes,
        )
    )


def _parse_remote_references(payload: str | None) -> list[RemoteReferenceInput]:
    if not payload or not payload.strip():
        return []
    try:
        raw_items = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise AppError("INVALID_REMOTE_REFERENCES", "远程参考素材 JSON 格式不正确", status.HTTP_400_BAD_REQUEST) from exc
    if not isinstance(raw_items, list):
        raise AppError("INVALID_REMOTE_REFERENCES", "远程参考素材必须是数组", status.HTTP_400_BAD_REQUEST)
    try:
        return [RemoteReferenceInput.model_validate(item) for item in raw_items]
    except ValidationError as exc:
        raise AppError("INVALID_REMOTE_REFERENCES", "远程参考素材字段不完整或类型不正确", status.HTTP_400_BAD_REQUEST) from exc


def _file_purpose_for_asset(asset_type: ReferenceAssetType) -> FilePurpose:
    return {
        ReferenceAssetType.VIDEO: FilePurpose.REFERENCE_VIDEO,
        ReferenceAssetType.IMAGE: FilePurpose.REFERENCE_IMAGE,
        ReferenceAssetType.AUDIO: FilePurpose.REFERENCE_AUDIO,
    }[asset_type]


def _has_upload(file: UploadFile | None) -> bool:
    return bool(file and file.filename)


def _has_remote_source(source: str | None) -> bool:
    return bool(source and source.strip())
