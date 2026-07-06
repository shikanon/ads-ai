import hashlib
import mimetypes
import struct
from pathlib import Path
from typing import Any

from fastapi import UploadFile, status

from app.errors import AppError
from app.file_validation import ValidatedUpload, validate_reference_upload, validate_remote_source
from app.material_models import (
    MaterialAsset,
    MaterialAssetType,
    MaterialComplianceStatus,
    MaterialCopyrightStatus,
    MaterialLibraryType,
    MaterialTagCategory,
    MaterialTagSource,
    MaterialVisibility,
)
from app.material_safety import assess_material_safety
from app.material_storage import MaterialStorage
from app.models import ReferenceAssetType


TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".srt", ".vtt"}
PROJECT_EXTENSIONS = {".aep", ".prproj", ".psd", ".ai", ".fig", ".sketch", ".zip"}
TEXT_CONTENT_TYPES = {"application/json", "application/xml"}
PROJECT_CONTENT_TYPES = {"application/zip", "application/x-zip-compressed"}


class MaterialIngestionService:
    def __init__(self, storage: MaterialStorage, max_file_size_bytes: int):
        self.storage = storage
        self.max_file_size_bytes = max_file_size_bytes

    def ingest_upload(
        self,
        file: UploadFile,
        data: bytes,
        *,
        library_type: MaterialLibraryType | str = MaterialLibraryType.RAW,
        actor: str | None = None,
        source_system: str | None = "upload",
        source_metadata: dict[str, Any] | None = None,
        copyright_status: MaterialCopyrightStatus | str = MaterialCopyrightStatus.CLEARED,
        compliance_status: MaterialComplianceStatus | str = MaterialComplianceStatus.PENDING,
        visibility: MaterialVisibility | str = MaterialVisibility.PRIVATE,
        owner_id: str | None = None,
        brand_id: str | None = None,
    ) -> MaterialAsset:
        asset_type = infer_asset_type(file.filename or "", file.content_type)
        validated = validate_material_upload(file, data, asset_type, self.max_file_size_bytes)
        md5 = compute_md5(validated.data)
        duplicate = self._find_duplicate_by_md5(md5)
        technical_metadata = extract_technical_metadata(validated.filename, validated.content_type, validated.data, asset_type)
        material = self.storage.create_material(
            asset_type=asset_type,
            library_type=library_type,
            actor=actor,
            audit_details={
                "ingestion_method": "upload",
                "filename": validated.filename,
                "duplicate_of": str(duplicate.id) if duplicate else None,
            },
            filename=validated.filename,
            content_type=validated.content_type,
            size_bytes=validated.size_bytes,
            source_system=source_system,
            md5=md5,
            duplicate_of=duplicate.id if duplicate else None,
            source_metadata={**(source_metadata or {}), "ingestion_method": "upload"},
            technical_metadata=technical_metadata,
            copyright_status=copyright_status,
            compliance_status=compliance_status,
            visibility=visibility,
            owner_id=owner_id,
            brand_id=brand_id,
        )
        self._write_material_file(material, validated.filename, validated.data)
        return self._block_if_risky(material, actor=actor)

    def import_tos_uri(
        self,
        uri: str,
        *,
        library_type: MaterialLibraryType | str = MaterialLibraryType.RAW,
        actor: str | None = None,
        source_metadata: dict[str, Any] | None = None,
        copyright_status: MaterialCopyrightStatus | str = MaterialCopyrightStatus.CLEARED,
        compliance_status: MaterialComplianceStatus | str = MaterialComplianceStatus.PENDING,
        visibility: MaterialVisibility | str = MaterialVisibility.PRIVATE,
        owner_id: str | None = None,
        brand_id: str | None = None,
    ) -> MaterialAsset:
        source_uri = validate_tos_uri(uri)
        filename = Path(source_uri).name or None
        content_type = guess_content_type(source_uri)
        asset_type = infer_asset_type(filename or source_uri, content_type)
        technical_metadata = fallback_remote_metadata(source_uri, content_type, asset_type)
        material = self.storage.create_material(
            asset_type=asset_type,
            library_type=library_type,
            actor=actor,
            audit_details={"ingestion_method": "tos_import", "source_uri": source_uri},
            filename=filename,
            content_type=content_type,
            source_uri=source_uri,
            source_system="tos",
            source_metadata={**(source_metadata or {}), "ingestion_method": "tos_import"},
            technical_metadata=technical_metadata,
            copyright_status=copyright_status,
            compliance_status=compliance_status,
            visibility=visibility,
            owner_id=owner_id,
            brand_id=brand_id,
        )
        return self._block_if_risky(material, actor=actor)

    def ingest_external(
        self,
        *,
        source_uri: str,
        asset_type: MaterialAssetType | str | None = None,
        library_type: MaterialLibraryType | str = MaterialLibraryType.RAW,
        title: str | None = None,
        description: str | None = None,
        source_system: str | None = None,
        source_metadata: dict[str, Any] | None = None,
        business_tags: list[str] | None = None,
        copyright_status: MaterialCopyrightStatus | str = MaterialCopyrightStatus.CLEARED,
        compliance_status: MaterialComplianceStatus | str = MaterialComplianceStatus.PENDING,
        visibility: MaterialVisibility | str = MaterialVisibility.PRIVATE,
        owner_id: str | None = None,
        brand_id: str | None = None,
        actor: str | None = None,
    ) -> MaterialAsset:
        validated_uri = validate_remote_source(source_uri)
        filename = Path(validated_uri).name or None
        content_type = guess_content_type(validated_uri)
        resolved_asset_type = MaterialAssetType(asset_type) if asset_type else infer_asset_type(filename or validated_uri, content_type)
        material = self.storage.create_material(
            asset_type=resolved_asset_type,
            library_type=library_type,
            actor=actor,
            audit_details={
                "ingestion_method": "external_api",
                "source_uri": validated_uri,
                "source_system": source_system,
            },
            title=title,
            description=description,
            filename=filename,
            content_type=content_type,
            source_uri=validated_uri,
            source_system=source_system,
            source_metadata={**(source_metadata or {}), "ingestion_method": "external_api"},
            technical_metadata=fallback_remote_metadata(validated_uri, content_type, resolved_asset_type),
            copyright_status=copyright_status,
            compliance_status=compliance_status,
            visibility=visibility,
            owner_id=owner_id,
            brand_id=brand_id,
        )
        for tag in business_tags or []:
            if tag.strip():
                self.storage.upsert_tag(
                    material.id,
                    category=MaterialTagCategory.BUSINESS,
                    name=tag,
                    source=MaterialTagSource.SYSTEM,
                    actor=actor,
                )
        return self._block_if_risky(material, actor=actor)

    def _find_duplicate_by_md5(self, md5: str) -> MaterialAsset | None:
        for material in self.storage.list_materials():
            if material.md5 == md5 and material.duplicate_of is None:
                return material
        return None

    def _write_material_file(self, material: MaterialAsset, filename: str, data: bytes) -> Path:
        safe_name = Path(filename).name
        output_dir = self.storage.repository.root / "material_uploads"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{material.id}-{safe_name}"
        output_path.write_bytes(data)
        return output_path

    def _block_if_risky(self, material: MaterialAsset, *, actor: str | None) -> MaterialAsset:
        assessment = assess_material_safety(material)
        if not assessment.should_block:
            return material
        return self.storage.block_material(
            material.id,
            actor=actor,
            reasons=assessment.reasons,
            matched_terms=assessment.matched_terms,
            copyright_status=assessment.copyright_status,
            compliance_status=assessment.compliance_status,
        )


def validate_material_upload(
    file: UploadFile,
    data: bytes,
    asset_type: MaterialAssetType,
    max_size_bytes: int,
) -> ValidatedUpload:
    if asset_type in {MaterialAssetType.IMAGE, MaterialAssetType.VIDEO, MaterialAssetType.AUDIO}:
        reference_type = {
            MaterialAssetType.IMAGE: ReferenceAssetType.IMAGE,
            MaterialAssetType.VIDEO: ReferenceAssetType.VIDEO,
            MaterialAssetType.AUDIO: ReferenceAssetType.AUDIO,
        }[asset_type]
        return validate_reference_upload(file, data, reference_type, max_size_bytes)

    filename = Path(file.filename or "").name
    if not filename:
        raise AppError("MISSING_FILENAME", "上传素材缺少文件名", status.HTTP_400_BAD_REQUEST)
    content_type = file.content_type or "application/octet-stream"
    size_bytes = len(data)
    if size_bytes == 0:
        raise AppError("EMPTY_FILE", "素材文件不能为空", status.HTTP_400_BAD_REQUEST)
    if size_bytes > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise AppError("FILE_TOO_LARGE", f"素材文件不能超过 {max_mb}MB", status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
    return ValidatedUpload(filename=filename, content_type=content_type, data=data, size_bytes=size_bytes)


def infer_asset_type(filename: str, content_type: str | None) -> MaterialAssetType:
    normalized_type = (content_type or "").lower()
    extension = Path(filename).suffix.lower()
    if normalized_type.startswith("image/"):
        return MaterialAssetType.IMAGE
    if normalized_type.startswith("video/"):
        return MaterialAssetType.VIDEO
    if normalized_type.startswith("audio/"):
        return MaterialAssetType.AUDIO
    if normalized_type.startswith("text/") or normalized_type in TEXT_CONTENT_TYPES or extension in TEXT_EXTENSIONS:
        return MaterialAssetType.TEXT
    if normalized_type in PROJECT_CONTENT_TYPES or extension in PROJECT_EXTENSIONS:
        return MaterialAssetType.PROJECT
    raise AppError("UNSUPPORTED_MATERIAL_FILE", "素材仅支持图片、视频、音频、文本和工程源文件", status.HTTP_400_BAD_REQUEST)


def validate_tos_uri(uri: str) -> str:
    source_uri = validate_remote_source(uri)
    if not source_uri.startswith("tos://"):
        raise AppError("INVALID_TOS_URI", "TOS 导入仅支持 tos:// URI", status.HTTP_400_BAD_REQUEST)
    return source_uri


def compute_md5(data: bytes) -> str:
    return hashlib.md5(data, usedforsecurity=False).hexdigest()


def guess_content_type(uri: str) -> str | None:
    content_type, _ = mimetypes.guess_type(uri)
    return content_type


def extract_technical_metadata(
    filename: str,
    content_type: str,
    data: bytes,
    asset_type: MaterialAssetType,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "filename": filename,
        "content_type": content_type,
        "size_bytes": len(data),
        "extension": Path(filename).suffix.lower(),
    }
    if asset_type == MaterialAssetType.IMAGE:
        dimensions = extract_image_dimensions(data)
        if dimensions:
            metadata.update(dimensions)
        else:
            metadata["fallback_reason"] = "image dimensions unavailable"
    elif asset_type in {MaterialAssetType.VIDEO, MaterialAssetType.AUDIO}:
        metadata["duration_seconds"] = None
        metadata["codec"] = None
        metadata["fallback_reason"] = "media duration and codec require offline probing"
    elif asset_type == MaterialAssetType.TEXT:
        metadata["text_bytes"] = len(data)
    elif asset_type == MaterialAssetType.PROJECT:
        metadata["fallback_reason"] = "project source metadata unavailable without native parser"
    return metadata


def fallback_remote_metadata(
    source_uri: str,
    content_type: str | None,
    asset_type: MaterialAssetType,
) -> dict[str, Any]:
    return {
        "source_uri": source_uri,
        "content_type": content_type,
        "asset_type": asset_type.value,
        "fallback_reason": "remote metadata unavailable until source is fetched",
    }


def extract_image_dimensions(data: bytes) -> dict[str, int] | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return {"width": width, "height": height}
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        if len(data) >= 10:
            width, height = struct.unpack("<HH", data[6:10])
            return {"width": width, "height": height}
    if data.startswith(b"\xff\xd8"):
        return extract_jpeg_dimensions(data)
    return None


def extract_jpeg_dimensions(data: bytes) -> dict[str, int] | None:
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(data):
            return None
        segment_length = struct.unpack(">H", data[index : index + 2])[0]
        if marker in range(0xC0, 0xC4) or marker in range(0xC5, 0xC8) or marker in range(0xC9, 0xCC) or marker in range(0xCD, 0xD0):
            if index + 7 > len(data):
                return None
            height, width = struct.unpack(">HH", data[index + 3 : index + 7])
            return {"width": width, "height": height}
        index += segment_length
    return None
